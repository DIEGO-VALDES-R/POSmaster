/**
 * ConfiguracionFactus.tsx
 *
 * Panel de configuración de credenciales Factus (facturación electrónica DIAN).
 * Guarda en companies.config (JSONB) — sin columnas nuevas en BD.
 *
 * Incluye:
 * - Campos de credenciales OAuth2 Factus
 * - Toggle sandbox / producción
 * - Prueba de conexión en tiempo real
 * - Consulta y selección de rango de numeración activo
 * - Guardado seguro (merge con config existente)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Save, Eye, EyeOff, CheckCircle, AlertCircle,
  Loader2, RefreshCw, ChevronDown, ExternalLink, Info, Zap,
} from 'lucide-react';
import { useDatabase } from '../contexts/DatabaseContext';
import {
  probarConexionFactus,
  guardarCredencialesFactus,
  cargarCredencialesFactus,
  consultarRangosNumeracion,
  FactusCredenciales,
  FactusEnv,
  RangoNumeracion,
} from '../services/factusService';
import toast from 'react-hot-toast';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

const EMPTY: FactusCredenciales = {
  factus_env:           'sandbox',
  factus_client_id:     '',
  factus_client_secret: '',
  factus_username:      '',
  factus_password:      '',
  dian_prefix:          '',
  dian_resolution:      '',
  numbering_range_id:   undefined,
};

// ─── SUB-COMPONENTES ──────────────────────────────────────────────────────────

const SecretField: React.FC<{
  label:       string;
  hint?:       string;
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  isSecret?:   boolean;
}> = ({ label, hint, value, onChange, placeholder, isSecret = true }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={isSecret && !visible ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-10 text-sm
                     focus:outline-none focus:border-blue-400 font-mono bg-white"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
};

const StatusBadge: React.FC<{ status: TestStatus; msg?: string }> = ({ status, msg }) => {
  if (status === 'idle') return null;
  const map = {
    testing: { icon: <Loader2 size={13} className="animate-spin" />, text: 'Probando...', cls: 'bg-slate-100 text-slate-600' },
    ok:      { icon: <CheckCircle size={13} />, text: msg || 'Conexión OK', cls: 'bg-emerald-50 text-emerald-700' },
    error:   { icon: <AlertCircle size={13} />, text: msg || 'Error', cls: 'bg-red-50 text-red-600' },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${m.cls}`}>
      {m.icon} {m.text}
    </span>
  );
};

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const ConfiguracionFactus: React.FC = () => {
  const { company } = useDatabase();
  const companyId = company?.id;

  const [creds, setCreds]     = useState<FactusCredenciales>(EMPTY);
  const [original, setOriginal] = useState<FactusCredenciales>(EMPTY);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);

  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg]       = useState('');

  const [rangos, setRangos]           = useState<RangoNumeracion[]>([]);
  const [loadingRangos, setLoadingRangos] = useState(false);

  // ── Cargar config ──────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const stored = await cargarCredencialesFactus(companyId);
    const loaded = { ...EMPTY, ...stored };
    setCreds(loaded);
    setOriginal(loaded);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Detectar cambios
  useEffect(() => {
    setDirty(JSON.stringify(creds) !== JSON.stringify(original));
  }, [creds, original]);

  const set = (key: keyof FactusCredenciales, val: unknown) =>
    setCreds(prev => ({ ...prev, [key]: val }));

  // ── Probar conexión ────────────────────────────────────────────────────────
  const handleTest = async () => {
    if (!creds.factus_client_id || !creds.factus_username) {
      toast.error('Completa las credenciales primero');
      return;
    }
    setTestStatus('testing');
    setTestMsg('');
    const result = await probarConexionFactus(creds);
    setTestStatus(result.ok ? 'ok' : 'error');
    setTestMsg(result.message);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  };

  // ── Consultar rangos ───────────────────────────────────────────────────────
  const handleConsultarRangos = async () => {
    if (!creds.factus_client_id || !creds.factus_username) {
      toast.error('Completa las credenciales primero');
      return;
    }
    setLoadingRangos(true);
    const result = await consultarRangosNumeracion(creds);
    setRangos(result);
    setLoadingRangos(false);
    if (result.length === 0) toast.error('No se encontraron rangos de numeración');
    else toast.success(`${result.length} rango(s) encontrado(s)`);
  };

  // ── Guardar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    const result = await guardarCredencialesFactus(companyId, creds);
    setSaving(false);
    if (result.ok) {
      toast.success(result.message);
      setOriginal(creds);
      setDirty(false);
      setTestStatus('idle');
    } else {
      toast.error(result.message);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={24} className="animate-spin text-blue-500" />
      </div>
    );
  }

  const credencialesCompletas =
    creds.factus_client_id &&
    creds.factus_client_secret &&
    creds.factus_username &&
    creds.factus_password;

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <FileText size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Facturación Electrónica DIAN</h2>
          <p className="text-sm text-slate-500">Configuración de credenciales Factus</p>
        </div>
      </div>

      {/* Ambiente */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Zap size={15} className="text-yellow-500" /> Ambiente
        </h3>
        <div className="flex gap-3">
          {(['sandbox', 'production'] as FactusEnv[]).map(env => (
            <button
              key={env}
              onClick={() => set('factus_env', env)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                creds.factus_env === env
                  ? env === 'sandbox'
                    ? 'border-yellow-400 bg-yellow-50 text-yellow-700'
                    : 'border-green-500 bg-green-50 text-green-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              {env === 'sandbox' ? '🧪 Sandbox (pruebas)' : '🚀 Producción'}
            </button>
          ))}
        </div>
        {creds.factus_env === 'sandbox' && (
          <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
            <Info size={14} className="text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-700">
              Modo sandbox: las facturas <strong>no son reales</strong>.
              Usa las credenciales de prueba de Factus.
              Cambia a Producción solo cuando estés listo para facturar realmente.
            </p>
          </div>
        )}
      </div>

      {/* Credenciales OAuth2 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Credenciales OAuth2</h3>
          <a
            href="https://developers.factus.com.co"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            Documentación <ExternalLink size={11} />
          </a>
        </div>

        <SecretField
          label="Client ID"
          value={creds.factus_client_id}
          onChange={v => set('factus_client_id', v)}
          placeholder="a15ea63f-0a47-44c8-..."
          hint="Proporcionado por Factus en tu panel de desarrollador"
          isSecret={false}
        />
        <SecretField
          label="Client Secret"
          value={creds.factus_client_secret}
          onChange={v => set('factus_client_secret', v)}
          placeholder="GKBExF5jBuicd..."
          hint="Clave secreta de tu aplicación OAuth"
        />
        <SecretField
          label="Usuario (correo)"
          value={creds.factus_username}
          onChange={v => set('factus_username', v)}
          placeholder="tu@correo.com"
          hint="Correo de acceso a Factus"
          isSecret={false}
        />
        <SecretField
          label="Contraseña"
          value={creds.factus_password}
          onChange={v => set('factus_password', v)}
          placeholder="••••••••"
          hint="Contraseña de tu cuenta Factus"
        />

        {/* Botón probar */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleTest}
            disabled={!credencialesCompletas || testStatus === 'testing'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700
                       bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testStatus === 'testing'
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />
            }
            Probar conexión
          </button>
          <StatusBadge status={testStatus} msg={testMsg} />
        </div>
      </div>

      {/* Configuración DIAN */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Configuración DIAN</h3>

        <div className="grid grid-cols-2 gap-4">
          <SecretField
            label="Prefijo (ej: SETP)"
            value={creds.dian_prefix || ''}
            onChange={v => set('dian_prefix', v.toUpperCase())}
            placeholder="SETP"
            hint="Prefijo de tu resolución"
            isSecret={false}
          />
          <SecretField
            label="N° Resolución DIAN"
            value={creds.dian_resolution || ''}
            onChange={v => set('dian_resolution', v)}
            placeholder="18760000001"
            hint="Número de resolución DIAN"
            isSecret={false}
          />
        </div>

        {/* Rango de numeración */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700">
              Rango de numeración activo
            </label>
            <button
              onClick={handleConsultarRangos}
              disabled={!credencialesCompletas || loadingRangos}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              {loadingRangos ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Consultar rangos
            </button>
          </div>

          {rangos.length > 0 ? (
            <div className="space-y-2">
              {rangos.map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    set('numbering_range_id', r.id);
                    set('dian_prefix', r.prefix);
                    set('dian_resolution', r.resolution_number);
                  }}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all text-sm ${
                    creds.numbering_range_id === r.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">
                      {r.prefix} — ID {r.id}
                    </span>
                    {r.is_expired
                      ? <span className="text-xs text-red-500 font-medium">Expirado</span>
                      : <span className="text-xs text-emerald-600 font-medium">Activo</span>
                    }
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Del {r.from} al {r.to} · Actual: {r.current} · Resolución: {r.resolution_number}
                  </p>
                  <p className="text-xs text-slate-400">
                    Vigencia: {r.start_date} → {r.end_date}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400">
                {credencialesCompletas
                  ? 'Haz clic en "Consultar rangos" para ver los rangos disponibles'
                  : 'Completa las credenciales para consultar rangos'}
              </p>
              {creds.numbering_range_id && (
                <p className="text-xs text-blue-600 mt-1 font-medium">
                  Rango configurado: ID {creds.numbering_range_id}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Botón guardar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {dirty ? '⚠️ Hay cambios sin guardar' : '✓ Configuración guardada'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm
                     font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50
                     disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>

    </div>
  );
};

export default ConfiguracionFactus;
