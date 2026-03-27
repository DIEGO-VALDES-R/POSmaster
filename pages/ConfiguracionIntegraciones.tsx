/**
 * ConfiguracionIntegraciones.tsx
 *
 * Integraciones externas por empresa:
 *   - WhatsApp Business (Meta Cloud API)
 *   - Email (Resend)
 *   - Facturación Electrónica DIAN (Factus OAuth2)
 *
 * Todo se guarda en companies.config (JSONB) — sin columnas nuevas.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle, Mail, Save, Eye, EyeOff, ExternalLink,
  CheckCircle, AlertCircle, Loader2, RefreshCw, Info,
  Smartphone, AtSign, FileText, Zap,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface IntegrationConfig {
  // WhatsApp
  whatsapp_token:    string;
  whatsapp_phone_id: string;
  // Email
  resend_api_key:   string;
  salon_email_from: string;
  // Factus / DIAN
  factus_env:           'sandbox' | 'production';
  factus_client_id:     string;
  factus_client_secret: string;
  factus_username:      string;
  factus_password:      string;
  dian_prefix:          string;
  dian_resolution:      string;
  numbering_range_id:   number | null;
}

interface RangoNumeracion {
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

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

const EMPTY: IntegrationConfig = {
  whatsapp_token:    '',
  whatsapp_phone_id: '',
  resend_api_key:    '',
  salon_email_from:  '',
  factus_env:           'sandbox',
  factus_client_id:     '',
  factus_client_secret: '',
  factus_username:      '',
  factus_password:      '',
  dian_prefix:          '',
  dian_resolution:      '',
  numbering_range_id:   null,
};

const FACTUS_BASE = {
  sandbox:    'https://api-sandbox.factus.com.co',
  production: 'https://api.factus.com.co',
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const mask = (val: string) =>
  val.length > 8 ? val.slice(0, 4) + '••••••••' + val.slice(-4) : '••••••••';

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

const SecretField: React.FC<{
  label:        string;
  hint:         string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  type?:        'secret' | 'text' | 'email';
}> = ({ label, hint, value, onChange, placeholder, type = 'secret' }) => {
  const [visible, setVisible] = useState(false);
  const isSecret = type === 'secret';
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
                     focus:outline-none focus:border-purple-400 font-mono bg-white"
        />
        {isSecret && value && (
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
};

const StatusBadge: React.FC<{ status: TestStatus; label?: string }> = ({ status, label }) => {
  if (status === 'idle') return null;
  const map = {
    testing: { icon: <Loader2 size={13} className="animate-spin" />, text: 'Probando...', cls: 'bg-slate-100 text-slate-600' },
    ok:      { icon: <CheckCircle size={13} />, text: label || 'Conexión OK', cls: 'bg-emerald-50 text-emerald-700' },
    error:   { icon: <AlertCircle size={13} />, text: label || 'Error de conexión', cls: 'bg-red-50 text-red-600' },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${m.cls}`}>
      {m.icon} {m.text}
    </span>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const ConfiguracionIntegraciones: React.FC = () => {
  const { company }  = useDatabase();
  const companyId    = company?.id;
  const brandColor   = (company?.config as any)?.primary_color || '#8b5cf6';

  const [cfg, setCfg]           = useState<IntegrationConfig>(EMPTY);
  const [original, setOriginal] = useState<IntegrationConfig>(EMPTY);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);

  // Test states
  const [waStatus, setWaStatus]         = useState<TestStatus>('idle');
  const [emailStatus, setEmailStatus]   = useState<TestStatus>('idle');
  const [factusStatus, setFactusStatus] = useState<TestStatus>('idle');
  const [waMsg, setWaMsg]               = useState('');
  const [emailMsg, setEmailMsg]         = useState('');
  const [factusMsg, setFactusMsg]       = useState('');

  // Rangos Factus
  const [rangos, setRangos]               = useState<RangoNumeracion[]>([]);
  const [loadingRangos, setLoadingRangos] = useState(false);

  // ── Cargar config ────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('companies')
      .select('config')
      .eq('id', companyId)
      .single();

    const s = (data?.config as any) || {};
    const loaded: IntegrationConfig = {
      whatsapp_token:    s.whatsapp_token    || '',
      whatsapp_phone_id: s.whatsapp_phone_id || '',
      resend_api_key:    s.resend_api_key    || '',
      salon_email_from:  s.salon_email_from  || '',
      factus_env:           s.factus_env           || 'sandbox',
      factus_client_id:     s.factus_client_id     || '',
      factus_client_secret: s.factus_client_secret || '',
      factus_username:      s.factus_username      || '',
      factus_password:      s.factus_password      || '',
      dian_prefix:          s.dian_prefix          || '',
      dian_resolution:      s.dian_resolution      || '',
      numbering_range_id:   s.numbering_range_id   || null,
    };
    setCfg(loaded);
    setOriginal(loaded);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => {
    setDirty(JSON.stringify(cfg) !== JSON.stringify(original));
  }, [cfg, original]);

  const set = (key: keyof IntegrationConfig) => (val: string | number | null) =>
    setCfg(prev => ({ ...prev, [key]: val }));

  // ── Guardar ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    const { data: current } = await supabase
      .from('companies').select('config').eq('id', companyId).single();

    const merged = {
      ...((current?.config as object) || {}),
      // WhatsApp
      whatsapp_token:    cfg.whatsapp_token.trim()    || null,
      whatsapp_phone_id: cfg.whatsapp_phone_id.trim() || null,
      // Email
      resend_api_key:    cfg.resend_api_key.trim()    || null,
      salon_email_from:  cfg.salon_email_from.trim()  || null,
      // Factus — limpiar token cacheado si cambiaron credenciales
      factus_env:           cfg.factus_env,
      factus_client_id:     cfg.factus_client_id.trim()     || null,
      factus_client_secret: cfg.factus_client_secret.trim() || null,
      factus_username:      cfg.factus_username.trim()      || null,
      factus_password:      cfg.factus_password.trim()      || null,
      dian_prefix:          cfg.dian_prefix.trim().toUpperCase() || null,
      dian_resolution:      cfg.dian_resolution.trim()      || null,
      numbering_range_id:   cfg.numbering_range_id          || null,
      // Limpiar token cacheado para forzar re-auth con nuevas credenciales
      factus_token:         null,
      factus_token_expiry:  null,
    };

    const { error } = await supabase
      .from('companies').update({ config: merged }).eq('id', companyId);

    setSaving(false);
    if (error) { toast.error('Error al guardar: ' + error.message); return; }

    toast.success('Configuración guardada ✅');
    setOriginal(cfg);
    setDirty(false);
    setWaStatus('idle');
    setEmailStatus('idle');
    setFactusStatus('idle');
  };

  // ── Probar WhatsApp ──────────────────────────────────────────────────────
  const testWhatsApp = async () => {
    if (!cfg.whatsapp_token || !cfg.whatsapp_phone_id) {
      toast.error('Completa el Token y el Phone ID antes de probar.'); return;
    }
    setWaStatus('testing'); setWaMsg('');
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${cfg.whatsapp_phone_id.trim()}`,
        { headers: { Authorization: `Bearer ${cfg.whatsapp_token.trim()}` } },
      );
      const data = await res.json();
      if (res.ok && data?.id) {
        setWaStatus('ok');
        setWaMsg(`Número: ${data.display_phone_number || data.id}`);
      } else {
        setWaStatus('error');
        setWaMsg(data?.error?.message || 'Token o Phone ID inválido');
      }
    } catch {
      setWaStatus('error'); setWaMsg('No se pudo conectar con Meta');
    }
  };

  // ── Probar Resend ────────────────────────────────────────────────────────
  const testResend = async () => {
    if (!cfg.resend_api_key) {
      toast.error('Ingresa el API Key de Resend antes de probar.'); return;
    }
    setEmailStatus('testing'); setEmailMsg('');
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${cfg.resend_api_key.trim()}` },
      });
      const data = await res.json();
      if (res.ok) {
        const count = data?.data?.length ?? 0;
        setEmailStatus('ok');
        setEmailMsg(`API Key válida · ${count} dominio(s) verificado(s)`);
      } else {
        setEmailStatus('error');
        setEmailMsg(data?.message || 'API Key inválida');
      }
    } catch {
      setEmailStatus('error'); setEmailMsg('No se pudo conectar con Resend');
    }
  };

  // ── Probar Factus ────────────────────────────────────────────────────────
  const testFactus = async () => {
    const { factus_client_id, factus_client_secret, factus_username, factus_password, factus_env } = cfg;
    if (!factus_client_id || !factus_client_secret || !factus_username || !factus_password) {
      toast.error('Completa todas las credenciales de Factus.'); return;
    }
    setFactusStatus('testing'); setFactusMsg('');
    try {
      const base = FACTUS_BASE[factus_env];
      const res = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({
          grant_type:    'password',
          client_id:     factus_client_id.trim(),
          client_secret: factus_client_secret.trim(),
          username:      factus_username.trim(),
          password:      factus_password.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setFactusStatus('ok');
        setFactusMsg(`✅ Conexión exitosa · Ambiente: ${factus_env}`);
        toast.success(`Factus conectado (${factus_env})`);
      } else {
        setFactusStatus('error');
        setFactusMsg(data.message || data.error_description || 'Credenciales incorrectas');
      }
    } catch {
      setFactusStatus('error'); setFactusMsg('No se pudo conectar con Factus');
    }
  };

  // ── Consultar rangos Factus ──────────────────────────────────────────────
  const consultarRangos = async () => {
    const { factus_client_id, factus_client_secret, factus_username, factus_password, factus_env } = cfg;
    if (!factus_client_id || !factus_username) {
      toast.error('Completa las credenciales primero.'); return;
    }
    setLoadingRangos(true);
    try {
      const base = FACTUS_BASE[factus_env];
      // 1. Obtener token
      const tokenRes = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: factus_client_id.trim(),
          client_secret: factus_client_secret.trim(),
          username: factus_username.trim(),
          password: factus_password.trim(),
        }),
      });
      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;
      if (!token) { toast.error('No se pudo autenticar con Factus'); setLoadingRangos(false); return; }

      // 2. Consultar rangos
      const rangosRes = await fetch(`${base}/v1/numbering-ranges`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      const rangosData = await rangosRes.json();
      const lista: RangoNumeracion[] = rangosData.data || rangosData || [];
      setRangos(Array.isArray(lista) ? lista : []);
      if (lista.length === 0) toast.error('No se encontraron rangos de numeración');
      else toast.success(`${lista.length} rango(s) encontrado(s)`);
    } catch {
      toast.error('Error al consultar rangos');
    }
    setLoadingRangos(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-slate-400" />
    </div>
  );

  const waConfigured      = !!(original.whatsapp_token && original.whatsapp_phone_id);
  const emailConfigured   = !!original.resend_api_key;
  const factusConfigured  = !!(original.factus_client_id && original.factus_username);
  const factusCredsCompletas = !!(cfg.factus_client_id && cfg.factus_client_secret && cfg.factus_username && cfg.factus_password);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 py-6 px-4">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Integraciones</h1>
        <p className="text-slate-500 text-sm mt-1">
          Conecta WhatsApp, Email y Facturación Electrónica DIAN para tu negocio.
        </p>
      </div>

      {/* ══ WHATSAPP ══ */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
              <MessageCircle size={18} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">WhatsApp Business</p>
              <p className="text-xs text-slate-400">Meta Cloud API — gratis hasta 1.000 conv/mes</p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${waConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {waConfigured ? '✓ Configurado' : 'Sin configurar'}
          </span>
        </div>
        <div className="p-5 space-y-4">
          <SecretField label="Access Token" hint="Token de acceso de la app Meta. Empieza por EAA..."
            value={cfg.whatsapp_token} onChange={set('whatsapp_token')} placeholder="EAABsbCS..." />
          <SecretField label="Phone Number ID" hint="ID numérico del número registrado en Meta."
            value={cfg.whatsapp_phone_id} onChange={set('whatsapp_phone_id')} placeholder="123456789012345" type="text" />
          <div className="flex items-center gap-3 pt-1">
            <button onClick={testWhatsApp} disabled={waStatus === 'testing' || !cfg.whatsapp_token || !cfg.whatsapp_phone_id}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              {waStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
              Probar conexión
            </button>
            <StatusBadge status={waStatus} label={waMsg || undefined} />
          </div>
          <details className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 cursor-pointer">
            <summary className="font-medium text-slate-600 flex items-center gap-1.5">
              <ExternalLink size={12} /> Cómo obtener credenciales Meta
            </summary>
            <ol className="mt-2 space-y-1 pl-4 list-decimal">
              <li>Entra a <strong>developers.facebook.com</strong> con tu cuenta.</li>
              <li>Crea una App → tipo <strong>Business</strong>.</li>
              <li>Añade el producto <strong>WhatsApp</strong>.</li>
              <li>Ve a <strong>WhatsApp → Configuración de API</strong>.</li>
              <li>Agrega tu número de teléfono y copia el Token y Phone ID.</li>
            </ol>
          </details>
        </div>
      </section>

      {/* ══ EMAIL ══ */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Mail size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Email (Resend)</p>
              <p className="text-xs text-slate-400">100 emails/día gratis, sin tarjeta</p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${emailConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {emailConfigured ? '✓ Configurado' : 'Sin configurar'}
          </span>
        </div>
        <div className="p-5 space-y-4">
          <SecretField label="API Key de Resend" hint="Empieza por re_... desde resend.com → API Keys."
            value={cfg.resend_api_key} onChange={set('resend_api_key')} placeholder="re_xxxxxxxxxxxxxxxx" />
          <SecretField label="Email remitente (opcional)" hint="Si tienes dominio verificado en Resend. Ej: citas@mi-salon.com"
            value={cfg.salon_email_from} onChange={set('salon_email_from')} placeholder="citas@mi-salon.com" type="email" />
          <div className="flex items-center gap-3 pt-1">
            <button onClick={testResend} disabled={emailStatus === 'testing' || !cfg.resend_api_key}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              {emailStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <AtSign size={14} />}
              Probar conexión
            </button>
            <StatusBadge status={emailStatus} label={emailMsg || undefined} />
          </div>
        </div>
      </section>

      {/* ══ FACTURACIÓN ELECTRÓNICA DIAN (FACTUS) ══ */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
              <FileText size={18} className="text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Facturación Electrónica DIAN</p>
              <p className="text-xs text-slate-400">Factus OAuth2 — proveedor habilitado DIAN</p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${factusConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {factusConfigured ? `✓ ${original.factus_env}` : 'Sin configurar'}
          </span>
        </div>

        <div className="p-5 space-y-5">

          {/* Ambiente */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Zap size={14} className="text-yellow-500" /> Ambiente
            </p>
            <div className="flex gap-3">
              {(['sandbox', 'production'] as const).map(env => (
                <button key={env} onClick={() => set('factus_env')(env)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    cfg.factus_env === env
                      ? env === 'sandbox'
                        ? 'border-yellow-400 bg-yellow-50 text-yellow-700'
                        : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}>
                  {env === 'sandbox' ? '🧪 Sandbox' : '🚀 Producción'}
                </button>
              ))}
            </div>
            {cfg.factus_env === 'sandbox' && (
              <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 mt-2">
                <Info size={13} className="text-yellow-600 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-700">
                  Modo sandbox: las facturas <strong>no son reales</strong>. Cambia a Producción cuando estés habilitado ante la DIAN.
                </p>
              </div>
            )}
          </div>

          {/* Credenciales OAuth2 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Credenciales OAuth2</p>
              <a href="https://developers.factus.com.co" target="_blank" rel="noreferrer"
                className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
                Documentación <ExternalLink size={11} />
              </a>
            </div>
            <SecretField label="Client ID" hint="Proporcionado por Factus en tu cuenta de desarrollador."
              value={cfg.factus_client_id} onChange={set('factus_client_id')}
              placeholder="a15ea63f-0a47-44c8-9156-ecea50a3de44" type="text" />
            <SecretField label="Client Secret" hint="Clave secreta OAuth de tu aplicación Factus."
              value={cfg.factus_client_secret} onChange={set('factus_client_secret')}
              placeholder="GKBExF5jBuicd..." />
            <div className="grid grid-cols-2 gap-4">
              <SecretField label="Usuario (correo)" hint="Correo de acceso a Factus."
                value={cfg.factus_username} onChange={set('factus_username')}
                placeholder="tu@correo.com" type="text" />
              <SecretField label="Contraseña" hint="Contraseña de tu cuenta Factus."
                value={cfg.factus_password} onChange={set('factus_password')}
                placeholder="••••••••" />
            </div>
          </div>

          {/* Botón probar conexión */}
          <div className="flex items-center gap-3">
            <button onClick={testFactus}
              disabled={!factusCredsCompletas || factusStatus === 'testing'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
              {factusStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Probar conexión
            </button>
            <StatusBadge status={factusStatus} label={factusMsg || undefined} />
          </div>

          {/* Configuración DIAN */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <p className="text-sm font-medium text-slate-700 pt-1">Configuración DIAN</p>
            <div className="grid grid-cols-2 gap-4">
              <SecretField label="Prefijo" hint="Ej: SETP, FV, POS — el de tu resolución."
                value={cfg.dian_prefix} onChange={v => set('dian_prefix')(v.toUpperCase())}
                placeholder="SETP" type="text" />
              <SecretField label="N° Resolución DIAN" hint="Número de la resolución otorgada."
                value={cfg.dian_resolution} onChange={set('dian_resolution')}
                placeholder="18760000001" type="text" />
            </div>

            {/* Rango de numeración */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-700">Rango de numeración activo</p>
                <button onClick={consultarRangos}
                  disabled={!factusCredsCompletas || loadingRangos}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 disabled:opacity-50">
                  {loadingRangos ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  Consultar rangos
                </button>
              </div>

              {rangos.length > 0 ? (
                <div className="space-y-2">
                  {rangos.map(r => (
                    <button key={r.id} onClick={() => {
                      set('numbering_range_id')(r.id);
                      set('dian_prefix')(r.prefix);
                      set('dian_resolution')(r.resolution_number);
                    }}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all text-sm ${
                        cfg.numbering_range_id === r.id
                          ? 'border-indigo-400 bg-indigo-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700">{r.prefix} — ID {r.id}</span>
                        {r.is_expired
                          ? <span className="text-xs text-red-500 font-medium">Expirado</span>
                          : <span className="text-xs text-emerald-600 font-medium">✓ Activo</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Del {r.from} al {r.to} · Actual: {r.current} · Res: {r.resolution_number}
                      </p>
                      <p className="text-xs text-slate-400">{r.start_date} → {r.end_date}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400">
                    {factusCredsCompletas
                      ? 'Haz clic en "Consultar rangos" para ver los rangos disponibles'
                      : 'Completa las credenciales para consultar rangos'}
                  </p>
                  {cfg.numbering_range_id && (
                    <p className="text-xs text-indigo-600 mt-1 font-medium">
                      Rango configurado: ID {cfg.numbering_range_id}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══ RESUMEN DE ESTADO ══ */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Estado actual de integraciones</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'WhatsApp', ok: waConfigured,
              detail: waConfigured ? `Phone ID: ${mask(original.whatsapp_phone_id)}` : 'No configurado',
              icon: <MessageCircle size={15} />,
            },
            {
              label: 'Email', ok: emailConfigured,
              detail: emailConfigured ? `Key: ${mask(original.resend_api_key)}` : 'No configurado',
              icon: <Mail size={15} />,
            },
            {
              label: 'DIAN', ok: factusConfigured,
              detail: factusConfigured
                ? `${original.factus_env} · ${original.dian_prefix || 'Sin prefijo'} · Rango ${original.numbering_range_id || 'sin seleccionar'}`
                : 'No configurado',
              icon: <FileText size={15} />,
            },
          ].map(item => (
            <div key={item.label}
              className={`rounded-lg p-3 border ${item.ok ? 'border-emerald-100 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={item.ok ? 'text-emerald-600' : 'text-slate-400'}>{item.icon}</span>
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
                {item.ok
                  ? <CheckCircle size={13} className="ml-auto text-emerald-500" />
                  : <AlertCircle size={13} className="ml-auto text-slate-300" />}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GUARDAR */}
      <div className="flex items-center gap-3 pb-4">
        <button onClick={handleSave} disabled={saving || !dirty}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-semibold text-sm shadow disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: dirty ? brandColor : '#94a3b8' }}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {dirty && (
          <button onClick={() => { setCfg(original); setDirty(false); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm">
            <RefreshCw size={14} /> Descartar
          </button>
        )}
        {dirty && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle size={12} /> Cambios sin guardar
          </span>
        )}
      </div>

    </div>
  );
};

export default ConfiguracionIntegraciones;