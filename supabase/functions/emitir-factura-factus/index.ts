import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// EDGE FUNCTION: emitir-factura-factus  v2
// Emite facturas electrónicas (FEV) y documentos equivalentes POS
// a través de la API de Factus con OAuth2 auto-refresh.
//
// Credenciales por empresa en company.config:
//   factus_client_id     → client_id OAuth Factus
//   factus_client_secret → client_secret OAuth Factus
//   factus_username      → correo de login Factus
//   factus_password      → contraseña Factus
//   factus_env           → 'sandbox' | 'production'
//   factus_token         → (caché) access_token vigente
//   factus_token_expiry  → (caché) ISO string de expiración
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Mapeos ───────────────────────────────────────────────────────────────────
const DOC_TYPE_MAP: Record<string, number> = {
  CC: 13, CE: 22, NIT: 31, PAS: 41, TI: 12, RC: 11, DE: 50,
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  CASH: '10', CARD: '48', TRANSFER: '42', CREDIT: 'ZZZ', PAYPAL: '48',
};

// Municipios más comunes de Colombia (Factus municipality_id)
const MUNICIPALITY_MAP: Record<string, number> = {
  'bogota': 149, 'bogotá': 149,
  'medellin': 448, 'medellín': 448,
  'cali': 679, 'barranquilla': 53,
  'cartagena': 120, 'bucaramanga': 86,
  'pereira': 563, 'manizales': 407,
  'cucuta': 198, 'cúcuta': 198,
  'ibague': 344, 'ibagué': 344,
  'villavicencio': 660, 'santa marta': 612,
  'neiva': 482, 'pasto': 548,
  'armenia': 43, 'monteria': 464,
  'montería': 464, 'sincelejo': 636,
  'popayan': 569, 'popayán': 569,
  'valledupar': 650, 'tunja': 646,
};

const getMunicipalityId = (address?: string, city?: string): number => {
  const text = (city || address || '').toLowerCase();
  for (const [key, id] of Object.entries(MUNICIPALITY_MAP)) {
    if (text.includes(key)) return id;
  }
  return 149; // Bogotá por defecto
};

// ── OAuth Token con auto-refresh ─────────────────────────────────────────────
async function getFactusToken(supabase: any, companyId: string, cfg: any, base: string): Promise<string | null> {
  // 1. Verificar si el token cacheado aún es válido (con 5 min de margen)
  if (cfg.factus_token && cfg.factus_token_expiry) {
    const expiry = new Date(cfg.factus_token_expiry).getTime();
    if (Date.now() < expiry - 5 * 60 * 1000) {
      console.log('[Factus] Usando token cacheado, expira:', cfg.factus_token_expiry);
      return cfg.factus_token;
    }
  }

  // 2. Obtener credenciales
  const clientId     = cfg.factus_client_id;
  const clientSecret = cfg.factus_client_secret;
  const username     = cfg.factus_username;
  const password     = cfg.factus_password;

  if (!clientId || !clientSecret || !username || !password) {
    console.error('[Factus] Credenciales OAuth incompletas');
    return null;
  }

  // 3. Solicitar nuevo token (grant_type=password)
  console.log('[Factus] Solicitando nuevo token OAuth...');
  const tokenRes = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      grant_type:    'password',
      client_id:     clientId,
      client_secret: clientSecret,
      username,
      password,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('[Factus] Error OAuth:', tokenRes.status, err);
    return null;
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const expiresIn   = tokenData.expires_in || 3600; // segundos

  if (!accessToken) {
    console.error('[Factus] No access_token en respuesta:', tokenData);
    return null;
  }

  // 4. Cachear token en company.config
  const expiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  await supabase.from('companies').update({
    config: {
      ...cfg,
      factus_token:         accessToken,
      factus_token_expiry:  expiry,
    },
  }).eq('id', companyId);

  console.log('[Factus] Token obtenido, expira:', expiry);
  return accessToken;
}

// ── Obtener numbering_range_id activo ────────────────────────────────────────
async function getNumberingRangeId(base: string, token: string, prefix: string, savedRangeId?: number | null): Promise<number | null> {
  // Si ya hay un rango guardado en config, usarlo directamente
  if (savedRangeId) {
    console.log('[Factus] Usando rango guardado en config:', savedRangeId);
    return savedRangeId;
  }
  try {
    const res = await fetch(`${base}/v1/numbering-ranges`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!res.ok) { console.error('[Factus] Error al consultar rangos:', res.status); return null; }
    const data = await res.json();

    // Factus puede devolver la lista en varias estructuras
    let ranges: any[] = [];
    if (Array.isArray(data)) ranges = data;
    else if (Array.isArray(data?.data)) ranges = data.data;
    else if (Array.isArray(data?.data?.data)) ranges = data.data.data;

    console.log('[Factus] Rangos encontrados:', ranges.length);

    // Buscar por prefijo exacto primero
    let range = ranges.find((r: any) => r.prefix?.toUpperCase() === prefix?.toUpperCase() && !r.is_expired);
    // Si no, tomar el primero no expirado
    if (!range) range = ranges.find((r: any) => !r.is_expired);
    // Si todos expirados, tomar el primero
    if (!range) range = ranges[0];

    console.log('[Factus] Rango seleccionado:', range?.id, range?.prefix);
    return range?.id || null;
  } catch (e) {
    console.error('[Factus] Error consultando rangos:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── 1. Autenticación usuario ────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'No autenticado' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ success: false, error: 'Sesión inválida' }, 401);

    // ── 2. Parámetros ───────────────────────────────────────────────────────
    const body = await req.json();
    const { invoice_id, tipo_documento } = body;
    const tipoDoc = tipo_documento || '01'; // '01'=FEV, '03'=POS equivalente
    if (!invoice_id) return json({ success: false, error: 'invoice_id requerido' }, 400);

    // ── 3. Leer factura completa ────────────────────────────────────────────
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select(`
        *,
        invoice_items (id, quantity, price, tax_rate, discount, total, products(id, name, sku, description)),
        customers (id, name, document_type, document_number, email, address, phone, city),
        companies (id, name, nit, email, phone, address, city, config)
      `)
      .eq('id', invoice_id)
      .single();

    if (invErr || !invoice) return json({ success: false, error: 'Factura no encontrada' }, 404);

    if (['ACCEPTED', 'SENT_TO_DIAN'].includes(invoice.status) && invoice.dian_cufe) {
      return json({ success: false, error: 'Esta factura ya fue enviada a la DIAN', cufe: invoice.dian_cufe }, 409);
    }

    // ── 4. Config empresa ───────────────────────────────────────────────────
    const company = invoice.companies;
    const cfg = company.config || {};
    const factusEnv = cfg.factus_env || 'sandbox';
    const FACTUS_BASE = factusEnv === 'production'
      ? 'https://api.factus.com.co'
      : 'https://api-sandbox.factus.com.co';

    // Verificar que hay credenciales mínimas
    const hasOAuth = cfg.factus_client_id && cfg.factus_client_secret && cfg.factus_username && cfg.factus_password;
    const hasLegacyToken = cfg.factus_token && !cfg.factus_token_expiry; // token manual viejo

    if (!hasOAuth && !hasLegacyToken) {
      return json({
        success: false,
        error: 'Credenciales Factus no configuradas. Ve a Configuración → Facturación DIAN.',
      }, 422);
    }

    // ── 5. Obtener token válido ─────────────────────────────────────────────
    let factusToken: string | null = null;
    if (hasOAuth) {
      factusToken = await getFactusToken(supabase, company.id, cfg, FACTUS_BASE);
      if (!factusToken) {
        return json({ success: false, error: 'No se pudo obtener token de Factus. Verifica las credenciales OAuth.' }, 422);
      }
    } else {
      // Token manual legado
      factusToken = cfg.factus_token;
    }

    // ── 6. Obtener numbering_range_id ───────────────────────────────────────
    const prefix = cfg.dian_prefix || 'SETP';
    const savedRangeId = cfg.numbering_range_id || null;
    const numberingRangeId = await getNumberingRangeId(FACTUS_BASE, factusToken, prefix, savedRangeId);
    if (!numberingRangeId) {
      console.warn('[Factus] No se encontró rango de numeración, se enviará null');
    }

    // ── 7. Validar resolución ───────────────────────────────────────────────
    const resolucion = cfg.dian_resolution || '';
    if (!resolucion && !numberingRangeId) {
      return json({ success: false, error: 'Resolución DIAN no configurada. Ve a Configuración → Facturación DIAN.' }, 422);
    }

    // ── 8. Mapear items ─────────────────────────────────────────────────────
    const items = (invoice.invoice_items || []).map((item: any, idx: number) => {
      const product = item.products;
      const unitPrice = parseFloat(item.price);
      const qty = parseInt(item.quantity);
      const taxPct = parseFloat(item.tax_rate) || 0;
      const discountAmt = parseFloat(item.discount) || 0;

      // Factus espera precio base sin IVA
      const unitPriceBase = taxPct > 0 ? unitPrice / (1 + taxPct / 100) : unitPrice;
      const subtotalItem  = unitPriceBase * qty;
      const discountRate  = discountAmt > 0 ? ((discountAmt / subtotalItem) * 100).toFixed(2) : '0.00';

      return {
        code_reference:     product?.sku || `ITEM-${idx + 1}`,
        name:               (product?.name || `Producto ${idx + 1}`).substring(0, 100),
        quantity:           qty,
        discount_rate:      discountRate,
        price:              unitPriceBase.toFixed(6),
        tax_rate:           taxPct.toFixed(2),
        unit_measure_id:    70,  // Unidad
        standard_code_id:   1,
        is_excluded:        taxPct === 0 ? 1 : 0,
        ...(taxPct > 0 ? {
          taxes: [{ tax_rate_code: taxPct.toFixed(2) }],
        } : {}),
      };
    });

    // ── 9. Mapear cliente ───────────────────────────────────────────────────
    const customer = invoice.customers;
    const isConsumidorFinal = !customer?.document_number || customer.document_number === '0'
      || customer.document_number === '222222222222';

    const municipioId = getMunicipalityId(
      customer?.address || company?.address,
      customer?.city || company?.city,
    );

    const buyerPayload = isConsumidorFinal ? {
      identification:                   '222222222222',
      dv:                               null,
      company:                          null,
      trade_name:                       null,
      names:                            'Consumidor Final',
      address:                          null,
      email:                            'consumidor@factus.com.co',
      mobile:                           null,
      phone:                            null,
      type_document_identification_id:  13,
      type_organization_id:             2,
      municipality_id:                  149,
      type_regime_id:                   2,
      type_liability_id:                117,
      type_currency_id:                 35,
    } : {
      identification:                   customer.document_number,
      dv:                               null,
      company:                          customer.name,
      trade_name:                       customer.name,
      names:                            customer.name,
      address:                          customer.address || 'No registrada',
      email:                            customer.email || `${customer.document_number}@sin-email.com`,
      mobile:                           customer.phone || null,
      phone:                            customer.phone || null,
      type_document_identification_id:  DOC_TYPE_MAP[customer.document_type || 'CC'] || 13,
      type_organization_id:             (customer.document_type === 'NIT') ? 1 : 2,
      municipality_id:                  municipioId,
      type_regime_id:                   2,
      type_liability_id:                117,
      type_currency_id:                 35,
    };

    // ── 10. Métodos de pago ─────────────────────────────────────────────────
    let paymentMethods: any[] = [];
    if (invoice.payment_method && Array.isArray(invoice.payment_method)) {
      paymentMethods = invoice.payment_method.map((pm: any) => ({
        payment_method_code: PAYMENT_METHOD_MAP[pm.method] || '10',
        amount:              parseFloat(pm.amount || 0).toFixed(2),
        time_days:           pm.method === 'CREDIT' ? '30' : '0',
      }));
    } else {
      const method = typeof invoice.payment_method === 'string' ? invoice.payment_method : 'CASH';
      paymentMethods = [{
        payment_method_code: PAYMENT_METHOD_MAP[method] || '10',
        amount:              parseFloat(invoice.total_amount || 0).toFixed(2),
        time_days:           method === 'CREDIT' ? '30' : '0',
      }];
    }

    const isCredit = paymentMethods.some((p: any) => p.time_days !== '0');
    const fechaHoy = new Date().toISOString().split('T')[0];
    const fechaVencimiento = isCredit
      ? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
      : fechaHoy;

    // ── 11. Payload Factus ──────────────────────────────────────────────────
    const factusPayload = {
      document:             tipoDoc,
      numbering_range_id:   numberingRangeId,
      reference_code:       invoice.invoice_number || null,
      observation:          invoice.notes || null,
      payment_form:         isCredit ? '2' : '1',      // 1=contado, 2=crédito
      payment_due_date:     fechaVencimiento,
      payment_method_code:  paymentMethods[0]?.payment_method_code || '10',
      billing_period:       null,
      order_reference:      null,
      customer:             buyerPayload,
      items,
      withholding_taxes:    [],
    };

    // ── 12. Enviar a Factus ─────────────────────────────────────────────────
    const endpoint = tipoDoc === '03'
      ? `${FACTUS_BASE}/v1/bills/pos`
      : `${FACTUS_BASE}/v1/bills/validate`;

    console.log(`[Factus] Enviando a ${endpoint} (${factusEnv})`);
    console.log('[Factus] numbering_range_id:', numberingRangeId);

    const factusRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${factusToken}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(factusPayload),
    });

    const factusData = await factusRes.json();
    console.log('[Factus] Respuesta HTTP:', factusRes.status);
    console.log('[Factus] Body:', JSON.stringify(factusData).substring(0, 500));

    // ── 13. Procesar respuesta ──────────────────────────────────────────────
    if (!factusRes.ok || factusData.status === 'error') {
      await supabase.from('invoices').update({
        status:       'REJECTED',
        dian_qr_data: JSON.stringify({ factus_error: factusData, timestamp: new Date().toISOString() }),
      }).eq('id', invoice_id);

      const errorMsg = factusData.message
        || factusData.errors?.join(', ')
        || factusData.error
        || `Error HTTP ${factusRes.status}`;

      return json({ success: false, error: errorMsg, detail: factusData }, 422);
    }

    // ── 14. Éxito ───────────────────────────────────────────────────────────
    const bill    = factusData.data?.bill || factusData.bill || factusData.data || {};
    const cufe    = bill.cufe || bill.uuid || bill.cude || '';
    const pdfUrl  = bill.public_url || bill.pdf_url || bill.download_url || '';
    const qrStr   = bill.qr_data || bill.qr || '';
    const billNum = bill.number || bill.bill_number || invoice.invoice_number || '';

    await supabase.from('invoices').update({
      status:       'ACCEPTED',
      dian_cufe:    cufe,
      dian_qr_data: qrStr || JSON.stringify({ cufe, pdf: pdfUrl }),
    }).eq('id', invoice_id);

    // Log en electronic_documents (ignorar si la tabla no existe)
    try {
      await supabase.from('electronic_documents').upsert({
        company_id:    invoice.company_id,
        sale_id:       invoice_id,
        cufe,
        qr_data:       qrStr,
        status:        'ACCEPTED',
        dian_response: JSON.stringify(factusData),
        sent_at:       new Date().toISOString(),
        validated_at:  new Date().toISOString(),
      }, { onConflict: 'sale_id' });
    } catch (_) { /* tabla opcional */ }

    return json({
      success:         true,
      cufe,
      pdf_url:         pdfUrl,
      numero_factura:  billNum,
      environment:     factusEnv,
      numbering_range: numberingRangeId,
      message:         tipoDoc === '03' ? 'Documento POS emitido ✓' : 'Factura electrónica validada por DIAN ✓',
    });

  } catch (err: any) {
    console.error('[emitir-factura-factus] Error crítico:', err);
    return json({ success: false, error: 'Error interno del servidor', detail: err.message }, 500);
  }
});