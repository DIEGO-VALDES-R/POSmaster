/**
 * factusService.ts
 * Servicio frontend para interactuar con la API de Factus
 * a través de la Edge Function emitir-factura-factus.
 *
 * Uso principal: llamar desde cualquier componente o página de POSmaster.
 */

import { supabase } from '../supabaseClient';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type FactusEnv = 'sandbox' | 'production';

export interface FactusCredenciales {
  factus_env:           FactusEnv;
  factus_client_id:     string;
  factus_client_secret: string;
  factus_username:      string;
  factus_password:      string;
  dian_prefix?:         string; // Ej: 'SETP', 'FV', 'POS'
  dian_resolution?:     string; // Número resolución DIAN
  numbering_range_id?:  number; // ID rango preferido
}

export interface ResultadoEmision {
  success:         boolean;
  cufe?:           string;
  pdf_url?:        string;
  numero_factura?: string;
  environment?:    FactusEnv;
  message?:        string;
  error?:          string;
  detail?:         unknown;
}

export interface ResultadoConexion {
  ok:       boolean;
  message:  string;
  ambiente?: FactusEnv;
}

export interface RangoNumeracion {
  id:                number;
  prefix:            string;
  from:              number;
  to:                number;
  current:           number;
  resolution_number: string;
  start_date:        string;
  end_date:          string;
  is_expired:        boolean;
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const FACTUS_BASE = {
  sandbox:    'https://api-sandbox.factus.com.co',
  production: 'https://api.factus.com.co',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const getBase = (env: FactusEnv = 'sandbox') => FACTUS_BASE[env];

/**
 * Obtiene un token OAuth2 directamente desde el frontend.
 * Útil para pruebas de conexión. En producción, los tokens
 * los maneja la Edge Function automáticamente.
 */
async function obtenerTokenDirecto(creds: FactusCredenciales): Promise<string | null> {
  const base = getBase(creds.factus_env);
  try {
    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type:    'password',
        client_id:     creds.factus_client_id,
        client_secret: creds.factus_client_secret,
        username:      creds.factus_username,
        password:      creds.factus_password,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

// ─── FUNCIONES PRINCIPALES ────────────────────────────────────────────────────

/**
 * Prueba la conexión con las credenciales de Factus.
 * Llama directamente a Factus para no depender de la Edge Function.
 */
export async function probarConexionFactus(
  creds: FactusCredenciales,
): Promise<ResultadoConexion> {
  try {
    const token = await obtenerTokenDirecto(creds);
    if (!token) {
      return {
        ok: false,
        message: 'Credenciales incorrectas. Verifica client_id, client_secret, usuario y contraseña.',
      };
    }
    return {
      ok:      true,
      message: `✅ Conexión exitosa con Factus (${creds.factus_env})`,
      ambiente: creds.factus_env,
    };
  } catch (err: any) {
    return { ok: false, message: `Error de red: ${err.message}` };
  }
}

/**
 * Consulta los rangos de numeración disponibles para la empresa.
 */
export async function consultarRangosNumeracion(
  creds: FactusCredenciales,
): Promise<RangoNumeracion[]> {
  const token = await obtenerTokenDirecto(creds);
  if (!token) return [];

  const base = getBase(creds.factus_env);
  try {
    const res = await fetch(`${base}/v1/numbering-ranges`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // Factus devuelve los rangos en data.data o directamente en data
    const rangos = data.data || data || [];
    return Array.isArray(rangos) ? rangos : [];
  } catch {
    return [];
  }
}

/**
 * Guarda las credenciales de Factus en companies.config (Supabase).
 */
export async function guardarCredencialesFactus(
  companyId: string,
  creds: FactusCredenciales,
): Promise<{ ok: boolean; message: string }> {
  try {
    // Leer config actual para no perder otros campos
    const { data: empresa } = await supabase
      .from('companies')
      .select('config')
      .eq('id', companyId)
      .single();

    const configActual = (empresa?.config as Record<string, unknown>) || {};

    const { error } = await supabase
      .from('companies')
      .update({
        config: {
          ...configActual,
          factus_env:           creds.factus_env,
          factus_client_id:     creds.factus_client_id,
          factus_client_secret: creds.factus_client_secret,
          factus_username:      creds.factus_username,
          factus_password:      creds.factus_password,
          dian_prefix:          creds.dian_prefix || 'SETP',
          dian_resolution:      creds.dian_resolution || '',
          numbering_range_id:   creds.numbering_range_id || null,
          // Limpiar token cacheado para forzar nuevo auth
          factus_token:         null,
          factus_token_expiry:  null,
        },
      })
      .eq('id', companyId);

    if (error) throw error;
    return { ok: true, message: 'Credenciales guardadas correctamente' };
  } catch (err: any) {
    return { ok: false, message: err.message || 'Error al guardar' };
  }
}

/**
 * Carga las credenciales de Factus desde companies.config.
 */
export async function cargarCredencialesFactus(
  companyId: string,
): Promise<Partial<FactusCredenciales>> {
  const { data } = await supabase
    .from('companies')
    .select('config')
    .eq('id', companyId)
    .single();

  const cfg = (data?.config as any) || {};
  return {
    factus_env:           cfg.factus_env || 'sandbox',
    factus_client_id:     cfg.factus_client_id || '',
    factus_client_secret: cfg.factus_client_secret || '',
    factus_username:      cfg.factus_username || '',
    factus_password:      cfg.factus_password || '',
    dian_prefix:          cfg.dian_prefix || '',
    dian_resolution:      cfg.dian_resolution || '',
    numbering_range_id:   cfg.numbering_range_id || undefined,
  };
}

/**
 * Emite una factura electrónica (FEV) o documento POS.
 * Delega a la Edge Function emitir-factura-factus.
 */
export async function emitirFactura(
  invoiceId: string,
  tipo: 'FEV' | 'POS' = 'FEV',
): Promise<ResultadoEmision> {
  try {
    const tipoDocumento = tipo === 'POS' ? '03' : '01';
    const { data, error } = await supabase.functions.invoke('emitir-factura-factus', {
      body: { invoice_id: invoiceId, tipo_documento: tipoDocumento },
    });

    if (error) throw new Error(error.message);

    if (data?.success) {
      return {
        success:         true,
        cufe:            data.cufe,
        pdf_url:         data.pdf_url,
        numero_factura:  data.numero_factura,
        environment:     data.environment,
        message:         data.message,
      };
    }

    return {
      success: false,
      error:   data?.error || 'Error desconocido en Factus',
      detail:  data?.detail,
    };
  } catch (err: any) {
    console.error('[factusService] Error:', err);
    return { success: false, error: err.message || 'Error de conexión' };
  }
}

/**
 * Consulta el estado de una factura ya enviada por su CUFE.
 */
export async function consultarEstadoFactura(
  cufe: string,
  companyId: string,
): Promise<{ status: string; message?: string }> {
  try {
    const creds = await cargarCredencialesFactus(companyId);
    const token = await obtenerTokenDirecto(creds as FactusCredenciales);
    if (!token) return { status: 'ERROR', message: 'No se pudo autenticar con Factus' };

    const base = getBase(creds.factus_env);
    const res = await fetch(`${base}/v1/bills/${cufe}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return { status: 'ERROR', message: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      status:  data.data?.bill?.status ?? 'UNKNOWN',
      message: data.data?.bill?.errors ? JSON.stringify(data.data.bill.errors) : undefined,
    };
  } catch (err: any) {
    return { status: 'ERROR', message: err.message };
  }
}
