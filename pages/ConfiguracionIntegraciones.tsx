/**
 * ConfiguracionIntegraciones.tsx
 *
 * Pantalla de configuración de integraciones externas por empresa.
 * Guarda todo en companies.config (JSONB) — no requiere columnas nuevas.
 * Funciona para CUALQUIER vertical de POSmaster (salón, óptica, veterinaria, etc.)
 *
 * Campos que gestiona:
 *   whatsapp_token       → Meta Cloud API access token
 *   whatsapp_phone_id    → Meta Phone Number ID
 *   resend_api_key       → Resend.com API Key (emails)
 *   salon_email_from     → Email remitente personalizado (opcional)
 *
 * Ruta sugerida: /configuracion/integraciones
 * Agregar en el menú de configuración junto a "Perfil del negocio", "Usuarios", etc.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle, Mail, Save, Eye, EyeOff, ExternalLink,
  CheckCircle, AlertCircle, Loader2, RefreshCw, Info,
  Smartphone, AtSign,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────
interface IntegrationConfig {
  whatsapp_token:    string;
  whatsapp_phone_id: string;
  resend_api_key:    string;
  salon_email_from:  string;
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';

const EMPTY: IntegrationConfig = {
  whatsapp_token:    '',
  whatsapp_phone_id: '',
  resend_api_key:    '',
  salon_email_from:  '',
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const mask = (val: string) =>
  val.length > 8 ? val.slice(0, 4) + '••••••••' + val.slice(-4) : '••••••••';

// ── SUB-COMPONENT: Campo con toggle de visibilidad ────────────────────────────
const SecretField: React.FC<{
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'secret' | 'text' | 'email';
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
                     focus:outline-none focus:border-purple-400 font-mono"
        />
        {isSecret && value && (
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {visible ? <EyeOff size={15}/> : <Eye size={15}/>}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
};

// ── SUB-COMPONENT: Badge de estado de prueba ──────────────────────────────────
const StatusBadge: React.FC<{ status: TestStatus; label?: string }> = ({ status, label }) => {
  if (status === 'idle') return null;
  const map = {
    testing: { icon: <Loader2 size={13} className="animate-spin"/>, text: 'Probando...', cls: 'bg-slate-100 text-slate-600' },
    ok:      { icon: <CheckCircle size={13}/>,                        text: label || 'Conexión OK', cls: 'bg-emerald-50 text-emerald-700' },
    error:   { icon: <AlertCircle size={13}/>,                        text: label || 'Error de conexión', cls: 'bg-red-50 text-red-600' },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${m.cls}`}>
      {m.icon} {m.text}
    </span>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const ConfiguracionIntegraciones: React.FC = () => {
  const { company } = useDatabase();
  const companyId   = company?.id;
  const brandColor  = (company?.config as any)?.primary_color || '#8b5cf6';

  const [cfg, setCfg]           = useState<IntegrationConfig>(EMPTY);
  const [original, setOriginal] = useState<IntegrationConfig>(EMPTY);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);

  // Test status por integración
  const [waStatus, setWaStatus]       = useState<TestStatus>('idle');
  const [emailStatus, setEmailStatus] = useState<TestStatus>('idle');
  const [waMsg, setWaMsg]             = useState('');
  const [emailMsg, setEmailMsg]       = useState('');

  // ── CARGAR config actual ──────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('companies')
      .select('config')
      .eq('id', companyId)
      .single();

    const stored = (data?.config as any) || {};
    const loaded: IntegrationConfig = {
      whatsapp_token:    stored.whatsapp_token    || '',
      whatsapp_phone_id: stored.whatsapp_phone_id || '',
      resend_api_key:    stored.resend_api_key    || '',
      salon_email_from:  stored.salon_email_from  || '',
    };
    setCfg(loaded);
    setOriginal(loaded);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Detectar cambios
  useEffect(() => {
    setDirty(JSON.stringify(cfg) !== JSON.stringify(original));
  }, [cfg, original]);

  // ── GUARDAR ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);

    // Merge con el config existente para no pisar otros campos (primary_color, etc.)
    const { data: current } = await supabase
      .from('companies')
      .select('config')
      .eq('id', companyId)
      .single();

    const merged = {
      ...((current?.config as object) || {}),
      whatsapp_token:    cfg.whatsapp_token.trim()    || null,
      whatsapp_phone_id: cfg.whatsapp_phone_id.trim() || null,
      resend_api_key:    cfg.resend_api_key.trim()    || null,
      salon_email_from:  cfg.salon_email_from.trim()  || null,
    };

    const { error } = await supabase
      .from('companies')
      .update({ config: merged })
      .eq('id', companyId);

    setSaving(false);

    if (error) {
      toast.error('Error al guardar: ' + error.message);
      return;
    }

    toast.success('Configuración guardada ✅');
    setOriginal(cfg);
    setDirty(false);
    // Resetear estados de prueba al guardar nuevas credenciales
    setWaStatus('idle');
    setEmailStatus('idle');
  };

  // ── PROBAR WhatsApp ───────────────────────────────────────────────────────
  // Hace una llamada directa a la Meta API para verificar el token y phone_id
  const testWhatsApp = async () => {
    if (!cfg.whatsapp_token || !cfg.whatsapp_phone_id) {
      toast.error('Completa el Token y el Phone ID antes de probar.');
      return;
    }
    setWaStatus('testing');
    setWaMsg('');
    try {
      // GET al endpoint del número — si el token y phone_id son válidos retorna 200
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
      setWaStatus('error');
      setWaMsg('No se pudo conectar con Meta');
    }
  };

  // ── PROBAR Email (Resend) ─────────────────────────────────────────────────
  // Verifica el API Key consultando el endpoint de dominios de Resend
  const testResend = async () => {
    if (!cfg.resend_api_key) {
      toast.error('Ingresa el API Key de Resend antes de probar.');
      return;
    }
    setEmailStatus('testing');
    setEmailMsg('');
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${cfg.resend_api_key.trim()}` },
      });
      const data = await res.json();
      if (res.ok) {
        const count = data?.data?.length ?? 0;
        setEmailStatus('ok');
        setEmailMsg(`API Key válida · ${count} dominio${count !== 1 ? 's' : ''} verificado${count !== 1 ? 's' : ''}`);
      } else {
        setEmailStatus('error');
        setEmailMsg(data?.message || 'API Key inválida');
      }
    } catch {
      setEmailStatus('error');
      setEmailMsg('No se pudo conectar con Resend');
    }
  };

  // ── UPDATE helper ─────────────────────────────────────────────────────────
  const set = (key: keyof IntegrationConfig) => (val: string) =>
    setCfg(prev => ({ ...prev, [key]: val }));

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-slate-400"/>
    </div>
  );

  const waConfigured    = !!(original.whatsapp_token && original.whatsapp_phone_id);
  const emailConfigured = !!original.resend_api_key;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 py-6 px-4">

      {/* ── HEADER ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Integraciones</h1>
        <p className="text-slate-500 text-sm mt-1">
          Conecta WhatsApp y Email para enviar recordatorios automáticos a tus clientes.
          Cada negocio usa sus propias credenciales.
        </p>
      </div>

      {/* ── BANNER INFO ── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
        <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5"/>
        <div className="text-sm text-blue-700 space-y-1">
          <p className="font-semibold">¿Dónde consigo estas credenciales?</p>
          <p>
            <strong>WhatsApp:</strong> Crea una app en{' '}
            <a href="https://developers.facebook.com" target="_blank" rel="noreferrer"
               className="underline font-medium">developers.facebook.com</a>
            {' '}→ Producto WhatsApp → Configuración de API.
          </p>
          <p>
            <strong>Email:</strong> Regístrate gratis en{' '}
            <a href="https://resend.com" target="_blank" rel="noreferrer"
               className="underline font-medium">resend.com</a>
            {' '}→ API Keys → Create API Key. (100 emails/día gratis)
          </p>
        </div>
      </div>

      {/* ══ SECCIÓN: WHATSAPP ══ */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
              <MessageCircle size={18} className="text-green-600"/>
            </div>
            <div>
              <p className="font-semibold text-slate-800">WhatsApp Business</p>
              <p className="text-xs text-slate-400">Meta Cloud API — gratis hasta 1.000 conv/mes</p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            waConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {waConfigured ? '✓ Configurado' : 'Sin configurar'}
          </span>
        </div>

        <div className="p-5 space-y-4">
          <SecretField
            label="Access Token"
            hint="Token de acceso de la app Meta. Empieza por EAA... o EAAA..."
            value={cfg.whatsapp_token}
            onChange={set('whatsapp_token')}
            placeholder="EAABsbCS..."
          />
          <SecretField
            label="Phone Number ID"
            hint="ID numérico del número de WhatsApp registrado en Meta. Ej: 123456789012345"
            value={cfg.whatsapp_phone_id}
            onChange={set('whatsapp_phone_id')}
            placeholder="123456789012345"
            type="text"
          />

          {/* Acciones WhatsApp */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={testWhatsApp}
              disabled={waStatus === 'testing' || !cfg.whatsapp_token || !cfg.whatsapp_phone_id}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300 text-green-700
                         hover:bg-green-50 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {waStatus === 'testing'
                ? <Loader2 size={14} className="animate-spin"/>
                : <Smartphone size={14}/>}
              Probar conexión
            </button>
            <StatusBadge status={waStatus} label={waMsg || undefined}/>
          </div>

          {/* Guía paso a paso */}
          <details className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 cursor-pointer">
            <summary className="font-medium text-slate-600 flex items-center gap-1.5">
              <ExternalLink size={12}/> Cómo obtener las credenciales de Meta
            </summary>
            <ol className="mt-2 space-y-1 pl-4 list-decimal">
              <li>Entra a <strong>developers.facebook.com</strong> con tu cuenta de Facebook.</li>
              <li>Crea una App → tipo <strong>Business</strong>.</li>
              <li>En el panel de la app, añade el producto <strong>WhatsApp</strong>.</li>
              <li>Ve a <strong>WhatsApp → Configuración de API</strong>.</li>
              <li>Agrega un número de teléfono (el celular del negocio).</li>
              <li>Copia el <strong>Token de acceso</strong> y el <strong>Phone Number ID</strong>.</li>
              <li>Para producción, crea un <em>System User</em> con token permanente.</li>
            </ol>
          </details>
        </div>
      </section>

      {/* ══ SECCIÓN: EMAIL ══ */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Mail size={18} className="text-blue-600"/>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Email (Resend)</p>
              <p className="text-xs text-slate-400">Resend.com — 100 emails/día gratis, sin tarjeta</p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            emailConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {emailConfigured ? '✓ Configurado' : 'Sin configurar'}
          </span>
        </div>

        <div className="p-5 space-y-4">
          <SecretField
            label="API Key de Resend"
            hint="Empieza por re_... Cópiala desde resend.com → API Keys."
            value={cfg.resend_api_key}
            onChange={set('resend_api_key')}
            placeholder="re_xxxxxxxxxxxxxxxx"
          />
          <SecretField
            label="Email remitente (opcional)"
            hint='Si tienes un dominio verificado en Resend, úsalo aquí. Ej: citas@mi-salon.com. Si lo dejas vacío se usará recordatorios@posmaster.co'
            value={cfg.salon_email_from}
            onChange={set('salon_email_from')}
            placeholder="citas@mi-salon.com"
            type="email"
          />

          {/* Acciones Email */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={testResend}
              disabled={emailStatus === 'testing' || !cfg.resend_api_key}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300 text-blue-700
                         hover:bg-blue-50 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {emailStatus === 'testing'
                ? <Loader2 size={14} className="animate-spin"/>
                : <AtSign size={14}/>}
              Probar conexión
            </button>
            <StatusBadge status={emailStatus} label={emailMsg || undefined}/>
          </div>

          {/* Guía paso a paso */}
          <details className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 cursor-pointer">
            <summary className="font-medium text-slate-600 flex items-center gap-1.5">
              <ExternalLink size={12}/> Cómo obtener la API Key de Resend
            </summary>
            <ol className="mt-2 space-y-1 pl-4 list-decimal">
              <li>Entra a <strong>resend.com</strong> y crea una cuenta gratuita.</li>
              <li>Ve a <strong>API Keys</strong> → <em>Create API Key</em>.</li>
              <li>Ponle un nombre como "POSmaster - Mi Salón" y dale permiso <em>Full access</em>.</li>
              <li>Copia la clave (solo se muestra una vez) y pégala aquí.</li>
              <li><em>Opcional:</em> Verifica tu dominio en Resend para enviar desde tu propio email.</li>
            </ol>
          </details>
        </div>
      </section>

      {/* ══ SECCIÓN: ESTADO ACTUAL (resumen) ══ */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Estado actual de integraciones</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: 'WhatsApp',
              ok: waConfigured,
              detail: waConfigured
                ? `Phone ID: ${mask(original.whatsapp_phone_id)}`
                : 'No configurado — los botones de WhatsApp estarán deshabilitados',
              icon: <MessageCircle size={15}/>,
              color: 'green',
            },
            {
              label: 'Email',
              ok: emailConfigured,
              detail: emailConfigured
                ? `Key: ${mask(original.resend_api_key)}${original.salon_email_from ? ` · ${original.salon_email_from}` : ''}`
                : 'No configurado — los botones de Email estarán deshabilitados',
              icon: <Mail size={15}/>,
              color: 'blue',
            },
          ].map(item => (
            <div key={item.label}
              className={`rounded-lg p-3 border ${
                item.ok ? 'border-emerald-100 bg-emerald-50' : 'border-slate-100 bg-slate-50'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={item.ok ? 'text-emerald-600' : 'text-slate-400'}>{item.icon}</span>
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
                {item.ok
                  ? <CheckCircle size={13} className="ml-auto text-emerald-500"/>
                  : <AlertCircle size={13} className="ml-auto text-slate-300"/>}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── BOTONES GUARDAR ── */}
      <div className="flex items-center gap-3 pb-4">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-semibold
                     text-sm shadow disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: dirty ? brandColor : '#94a3b8' }}
        >
          {saving
            ? <Loader2 size={15} className="animate-spin"/>
            : <Save size={15}/>}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {dirty && (
          <button
            onClick={() => { setCfg(original); setDirty(false); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200
                       text-slate-600 hover:bg-slate-50 text-sm"
          >
            <RefreshCw size={14}/> Descartar
          </button>
        )}
        {dirty && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle size={12}/> Tienes cambios sin guardar
          </span>
        )}
      </div>

    </div>
  );
};

export default ConfiguracionIntegraciones;
