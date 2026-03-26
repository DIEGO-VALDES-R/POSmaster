import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Megaphone, Plus, Send, Clock, CheckCircle, FileText,
  Users, Search, X, ChevronLeft, Image, Smile,
  Calendar, Trash2, Eye, Edit2, RefreshCw, AlertCircle,
  MessageCircle, Filter, TrendingUp, Zap, Star,
  UserCheck, UserX, Award,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────
type CampaignStatus = 'draft' | 'scheduled' | 'sent';
type Segment = 'all' | 'vip' | 'new' | 'inactive';

interface Campaign {
  id: string;
  company_id: string;
  title: string;
  message: string;
  image_url: string | null;
  segment: Segment;
  scheduled_at: string | null;
  sent_at: string | null;
  status: CampaignStatus;
  recipients_count: number;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bg: string; dot: string; icon: React.ReactNode }> = {
  draft:     { label: 'Borrador',   color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8', icon: <FileText size={11}/> },
  scheduled: { label: 'Programada', color: '#d97706', bg: '#fffbeb', dot: '#f59e0b', icon: <Clock size={11}/> },
  sent:      { label: 'Enviada',    color: '#059669', bg: '#ecfdf5', dot: '#10b981', icon: <CheckCircle size={11}/> },
};

const SEGMENT_CONFIG: Record<Segment, { label: string; desc: string; color: string; bg: string; icon: React.ReactNode }> = {
  all:      { label: 'Todos',        desc: 'Todos los clientes',           color: '#6366f1', bg: '#eef2ff', icon: <Users size={14}/> },
  vip:      { label: 'VIP',          desc: 'Mayor historial de compras',   color: '#d97706', bg: '#fffbeb', icon: <Award size={14}/> },
  new:      { label: 'Nuevos',       desc: 'Últimos 30 días',              color: '#0ea5e9', bg: '#f0f9ff', icon: <UserCheck size={14}/> },
  inactive: { label: 'Inactivos',    desc: 'Sin compras en 60+ días',      color: '#ef4444', bg: '#fef2f2', icon: <UserX size={14}/> },
};

const EMOJI_QUICK = ['🎉','💅','✂️','💆','🌸','🔥','⭐','💇','👑','🎁','💕','✨'];

const TEMPLATES = [
  { label: '🎉 Promoción', text: '🎉 ¡Hola {nombre}! Tenemos una promo especial para ti esta semana. No te la pierdas 💅' },
  { label: '📅 Recordatorio', text: '📅 Hola {nombre}, hace tiempo no te vemos. ¡Te esperamos con un descuento especial! ✨' },
  { label: '🎁 Descuento', text: '🎁 {nombre}, por ser cliente especial te regalamos un 20% de descuento en tu próxima visita 💕' },
  { label: '🌸 Temporada', text: '🌸 ¡Hola {nombre}! Nueva temporada, nuevo look. Agenda tu cita y luce increíble ⭐' },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const isoLocal = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
};

// ── WHATSAPP PREVIEW ──────────────────────────────────────────────────────────
const WhatsAppPreview: React.FC<{ message: string; imageUrl?: string; companyName: string }> = ({ message, imageUrl, companyName }) => {
  const preview = message.replace(/{nombre}/g, 'Cliente');
  const lines = preview.split('\n');

  return (
    <div className="bg-[#0a1628] rounded-2xl p-4 shadow-xl">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
        <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
          <MessageCircle size={14} className="text-white"/>
        </div>
        <div>
          <p className="text-white text-xs font-bold">{companyName}</p>
          <p className="text-emerald-400 text-[10px]">en línea</p>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-[#005c4b] rounded-2xl rounded-tr-sm px-3 py-2 shadow-md">
          {imageUrl && (
            <div className="mb-2 rounded-xl overflow-hidden">
              <img src={imageUrl} alt="promo" className="w-full object-cover max-h-36"/>
            </div>
          )}
          <div className="text-white text-xs leading-relaxed whitespace-pre-wrap">
            {lines.map((line, i) => (
              <span key={i}>{line}{i < lines.length - 1 && <br/>}</span>
            ))}
          </div>
          <p className="text-emerald-300/60 text-[9px] text-right mt-1">
            {new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} ✓✓
          </p>
        </div>
      </div>
    </div>
  );
};

// ── SEND MODAL ────────────────────────────────────────────────────────────────
const SendModal: React.FC<{
  campaign: Campaign;
  customers: Customer[];
  onClose: () => void;
  onDone: () => void;
  companyName: string;
}> = ({ campaign, customers, onClose, onDone, companyName }) => {
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [sent, setSent] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  const validCustomers = customers.filter(c => c.phone);
  const total = validCustomers.length;
  const noPhone = customers.length - validCustomers.length;

  const buildMessage = (customer: Customer) =>
    campaign.message.replace(/{nombre}/g, customer.name.split(' ')[0]);

  const handleStart = async () => {
    setStarted(true);
    for (let i = 0; i < validCustomers.length; i++) {
      const c = validCustomers[i];
      setCurrentIdx(i);
      const phone = c.phone!.replace(/\D/g, '');
      const msg = buildMessage(c);
      const url = `https://wa.me/57${phone}?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
      setSent(prev => [...prev, c.id]);
      // Pequeña pausa para no spamear el navegador
      await new Promise(r => setTimeout(r, 1200));
    }

    // Guardar en recipients
    try {
      const recipientRows = validCustomers.map(c => ({
        campaign_id: campaign.id,
        client_name: c.name,
        client_phone: c.phone,
        status: 'sent',
      }));
      await supabase.from('promo_recipients').insert(recipientRows);
      await supabase.from('promo_campaigns').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        recipients_count: validCustomers.length,
      }).eq('id', campaign.id);
    } catch (err) {
      console.error(err);
    }

    setDone(true);
    onDone();
  };

  const progress = total > 0 ? Math.round((sent.length / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle size={20} className="text-white"/>
              <h3 className="font-bold text-white">Enviar por WhatsApp</h3>
            </div>
            {!started && <button onClick={onClose} className="text-white/70 hover:text-white"><X size={18}/></button>}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {!started ? (
            <>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Campaña:</span>
                  <span className="font-bold text-slate-800">{campaign.title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Destinatarios con teléfono:</span>
                  <span className="font-bold text-emerald-600">{validCustomers.length}</span>
                </div>
                {noPhone > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Sin teléfono (se omiten):</span>
                    <span className="font-bold text-amber-600">{noPhone}</span>
                  </div>
                )}
              </div>
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 flex gap-2">
                <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-amber-700">
                  Se abrirá WhatsApp Web para cada cliente con el mensaje listo. Solo debes hacer clic en Enviar en cada ventana.
                </p>
              </div>
              <button
                onClick={handleStart}
                disabled={validCustomers.length === 0}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-40">
                <Send size={16}/> Iniciar envío ({validCustomers.length} mensajes)
              </button>
            </>
          ) : done ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={32} className="text-emerald-500"/>
              </div>
              <p className="font-bold text-slate-800 text-lg">¡Envío completado!</p>
              <p className="text-slate-500 text-sm">{sent.length} mensajes enviados correctamente</p>
              <button onClick={onClose}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
                Cerrar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 font-semibold">Enviando mensajes...</span>
                  <span className="font-bold text-emerald-600">{sent.length}/{total}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}/>
                </div>
              </div>
              {currentIdx >= 0 && currentIdx < validCustomers.length && (
                <div className="bg-emerald-50 rounded-xl p-3 flex items-center gap-3 border border-emerald-200">
                  <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center flex-shrink-0">
                    <MessageCircle size={14} className="text-emerald-700"/>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-semibold">Enviando a:</p>
                    <p className="text-sm font-bold text-emerald-800">{validCustomers[currentIdx]?.name}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400 text-center">No cierres esta ventana hasta que termine</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const PromoCampaigns: React.FC = () => {
  const { company } = useDatabase() as any;
  const companyId = company?.id;
  const brandColor = (company?.config as any)?.primary_color || '#6366f1';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [sendingCampaign, setSendingCampaign] = useState<Campaign | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [filterStatus, setFilterStatus] = useState<CampaignStatus | ''>('');

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    message: '',
    image_url: '',
    segment: 'all' as Segment,
    scheduled_at: '',
    status: 'draft' as CampaignStatus,
  });
  const [saving, setSaving] = useState(false);
  const [previewTab, setPreviewTab] = useState<'edit' | 'preview'>('edit');

  // ── LOAD ────────────────────────────────────────────────────────────────
  const loadCampaigns = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('promo_campaigns')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    setCampaigns((data || []) as Campaign[]);
  }, [companyId]);

  const loadCustomers = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, email, created_at')
      .eq('company_id', companyId);
    setCustomers((data || []) as Customer[]);
  }, [companyId]);

  useEffect(() => {
    Promise.all([loadCampaigns(), loadCustomers()]).finally(() => setLoading(false));
  }, [loadCampaigns, loadCustomers]);

  // ── SEGMENT FILTER ───────────────────────────────────────────────────────
  const getSegmentCustomers = useCallback((segment: Segment): Customer[] => {
    const now = new Date();
    if (segment === 'all') return customers;
    if (segment === 'new') {
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return customers.filter(c => new Date(c.created_at) >= cutoff);
    }
    if (segment === 'inactive') {
      const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      return customers.filter(c => new Date(c.created_at) < cutoff);
    }
    // VIP: primeros 20% por antigüedad (heurística simple)
    const sorted = [...customers].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.2)));
  }, [customers]);

  const segmentCount = useMemo(() => getSegmentCustomers(form.segment).length, [form.segment, getSegmentCustomers]);

  // ── SAVE ────────────────────────────────────────────────────────────────
  const handleSave = async (statusOverride?: CampaignStatus) => {
    if (!companyId || !form.title || !form.message) {
      toast.error('Título y mensaje son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        title: form.title,
        message: form.message,
        image_url: form.image_url || null,
        segment: form.segment,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        status: statusOverride || form.status,
      };

      if (editingId) {
        const { error } = await supabase.from('promo_campaigns').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Campaña actualizada');
      } else {
        const { error } = await supabase.from('promo_campaigns').insert(payload);
        if (error) throw error;
        toast.success(statusOverride === 'scheduled' ? '📅 Campaña programada' : '💾 Borrador guardado');
      }

      await loadCampaigns();
      setView('list');
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta campaña?')) return;
    await supabase.from('promo_campaigns').delete().eq('id', id);
    toast.success('Campaña eliminada');
    loadCampaigns();
  };

  const resetForm = () => {
    setForm({ title: '', message: '', image_url: '', segment: 'all', scheduled_at: '', status: 'draft' });
    setEditingId(null);
    setPreviewTab('edit');
  };

  const openEditor = (campaign?: Campaign) => {
    if (campaign) {
      setEditingId(campaign.id);
      setForm({
        title: campaign.title,
        message: campaign.message,
        image_url: campaign.image_url || '',
        segment: campaign.segment as Segment,
        scheduled_at: campaign.scheduled_at ? isoLocal(new Date(campaign.scheduled_at)) : '',
        status: campaign.status,
      });
    } else {
      resetForm();
    }
    setView('editor');
  };

  // ── FILTERED ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    campaigns.filter(c => {
      const matchQ = !searchQ || c.title.toLowerCase().includes(searchQ.toLowerCase());
      const matchS = !filterStatus || c.status === filterStatus;
      return matchQ && matchS;
    }),
    [campaigns, searchQ, filterStatus]
  );

  // ── STATS ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: campaigns.length,
    sent: campaigns.filter(c => c.status === 'sent').length,
    scheduled: campaigns.filter(c => c.status === 'scheduled').length,
    totalReached: campaigns.filter(c => c.status === 'sent').reduce((s, c) => s + c.recipients_count, 0),
  }), [campaigns]);

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-3 text-slate-400">
        <RefreshCw size={20} className="animate-spin"/>
        <span className="text-sm">Cargando campañas...</span>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // EDITOR VIEW
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'editor') return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('list'); resetForm(); }}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <ChevronLeft size={18}/>
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-800">
              {editingId ? 'Editar campaña' : 'Nueva campaña'}
            </h1>
            <p className="text-xs text-slate-400">WhatsApp masivo</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleSave('draft')} disabled={saving}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
            💾 Borrador
          </button>
          {form.scheduled_at && (
            <button onClick={() => handleSave('scheduled')} disabled={saving}
              className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2">
              <Clock size={14}/> Programar
            </button>
          )}
          <button onClick={() => handleSave()} disabled={saving}
            className="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2"
            style={{ background: brandColor }}>
            {saving ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
            Guardar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex gap-4 p-5 min-h-0">

        {/* Left: Form */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {/* Title */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Título de la campaña *
            </label>
            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Ej: Promo de temporada 🌸"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Segment */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Segmento de clientes
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(SEGMENT_CONFIG) as [Segment, typeof SEGMENT_CONFIG[Segment]][]).map(([key, cfg]) => {
                const count = getSegmentCustomers(key).length;
                return (
                  <button key={key} onClick={() => setForm(p => ({ ...p, segment: key }))}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      form.segment === key
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-slate-100 hover:border-slate-200 bg-slate-50'
                    }`}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-700">{cfg.label}</p>
                      <p className="text-[10px] text-slate-400 truncate">{count} clientes</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2 border border-indigo-100">
              <Users size={13} className="text-indigo-500"/>
              <p className="text-xs text-indigo-700 font-semibold">
                {segmentCount} clientes recibirán esta campaña
              </p>
            </div>
          </div>

          {/* Message */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Mensaje *
              </label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                <button onClick={() => setPreviewTab('edit')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${previewTab === 'edit' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-500'}`}>
                  Editar
                </button>
                <button onClick={() => setPreviewTab('preview')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${previewTab === 'preview' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-500'}`}>
                  <Eye size={11} className="inline mr-1"/>Vista previa
                </button>
              </div>
            </div>

            {previewTab === 'edit' ? (
              <>
                {/* Templates */}
                <div className="mb-3">
                  <p className="text-[10px] text-slate-400 font-semibold mb-2 uppercase tracking-wide">Plantillas rápidas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATES.map(t => (
                      <button key={t.label} onClick={() => setForm(p => ({ ...p, message: t.text }))}
                        className="px-2.5 py-1 rounded-full text-xs border border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={form.message}
                  onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                  rows={5}
                  placeholder="Escribe tu mensaje aquí... Usa {nombre} para personalizar con el nombre del cliente."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                />

                {/* Emojis */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {EMOJI_QUICK.map(e => (
                    <button key={e} onClick={() => setForm(p => ({ ...p, message: p.message + e }))}
                      className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-base transition-colors">
                      {e}
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-slate-400 mt-2">
                  💡 Usa <code className="bg-slate-100 px-1 rounded">{'{nombre}'}</code> para insertar el nombre del cliente automáticamente
                </p>
              </>
            ) : (
              <WhatsAppPreview
                message={form.message || 'Escribe tu mensaje para ver la vista previa...'}
                imageUrl={form.image_url || undefined}
                companyName={company?.name || 'Tu negocio'}
              />
            )}
          </div>

          {/* Image URL */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Image size={12}/> Imagen (opcional)
            </label>
            <input
              value={form.image_url}
              onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))}
              placeholder="https://... URL de la imagen promocional"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
            {form.image_url && (
              <div className="mt-2 rounded-xl overflow-hidden border border-slate-200">
                <img src={form.image_url} alt="preview" className="w-full object-cover max-h-32"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}/>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar size={12}/> Programar envío (opcional)
            </label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
            {form.scheduled_at && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <Clock size={11}/> Se guardará como programada para {fmtDateTime(new Date(form.scheduled_at).toISOString())}
              </p>
            )}
          </div>
        </div>

        {/* Right: Live preview (desktop) */}
        <div className="w-72 flex-shrink-0 hidden lg:flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Eye size={12}/> Vista previa WhatsApp
            </p>
            <WhatsAppPreview
              message={form.message || 'Escribe tu mensaje para ver la vista previa...'}
              imageUrl={form.image_url || undefined}
              companyName={company?.name || 'Tu negocio'}
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Resumen</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Segmento:</span>
                <span className="font-semibold text-slate-700">{SEGMENT_CONFIG[form.segment].label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Destinatarios:</span>
                <span className="font-bold text-indigo-600">{segmentCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Con teléfono:</span>
                <span className="font-bold text-emerald-600">
                  {getSegmentCustomers(form.segment).filter(c => c.phone).length}
                </span>
              </div>
              {form.scheduled_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Programada:</span>
                  <span className="font-semibold text-amber-600 text-xs">
                    {fmtDateTime(new Date(form.scheduled_at).toISOString())}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm"
            style={{ background: brandColor }}>
            <Megaphone size={17}/>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">Promociones</h1>
            <p className="text-xs text-slate-400">{customers.length} clientes registrados</p>
          </div>
        </div>
        <button
          onClick={() => openEditor()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-sm"
          style={{ background: brandColor }}>
          <Plus size={15}/> Nueva campaña
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 px-5 pt-4 flex-shrink-0">
        {[
          { label: 'Total campañas',  value: stats.total,       icon: <Megaphone size={18}/>, color: '#6366f1', bg: '#eef2ff' },
          { label: 'Enviadas',        value: stats.sent,        icon: <CheckCircle size={18}/>, color: '#10b981', bg: '#ecfdf5' },
          { label: 'Programadas',     value: stats.scheduled,   icon: <Clock size={18}/>,    color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Clientes alcanzados', value: stats.totalReached, icon: <TrendingUp size={18}/>, color: '#0ea5e9', bg: '#f0f9ff' },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: k.bg, color: k.color }}>
              {k.icon}
            </div>
            <div>
              <p className="text-xs text-slate-400">{k.label}</p>
              <p className="text-xl font-bold text-slate-800">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 pt-3 pb-0 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Buscar campaña..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-300 bg-white"/>
        </div>
        <div className="flex items-center gap-1">
          <Filter size={13} className="text-slate-400"/>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none text-slate-600 bg-white">
            <option value="">Todos los estados</option>
            <option value="draft">Borradores</option>
            <option value="scheduled">Programadas</option>
            <option value="sent">Enviadas</option>
          </select>
        </div>
        <button onClick={() => Promise.all([loadCampaigns(), loadCustomers()])}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
          <RefreshCw size={15}/>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 space-y-3 mt-1">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <Megaphone size={40} className="opacity-20"/>
            <p className="text-sm">Sin campañas aún</p>
            <button onClick={() => openEditor()}
              className="text-xs px-4 py-2 rounded-xl text-white font-semibold"
              style={{ background: brandColor }}>
              + Crear primera campaña
            </button>
          </div>
        ) : filtered.map(c => {
          const sc = STATUS_CONFIG[c.status];
          const seg = SEGMENT_CONFIG[c.segment as Segment] || SEGMENT_CONFIG.all;
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between p-4 pb-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: seg.bg, color: seg.color }}>
                    {seg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-800 text-sm">{c.title}</p>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: sc.bg, color: sc.color }}>
                        {sc.icon} {sc.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  {c.status !== 'sent' && (
                    <button onClick={() => openEditor(c)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600">
                      <Edit2 size={14}/>
                    </button>
                  )}
                  <button onClick={() => handleDelete(c.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-slate-50">
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users size={11}/>
                    {c.status === 'sent' ? `${c.recipients_count} enviados` : `~${getSegmentCustomers(c.segment as Segment).length} destinatarios`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star size={11}/>
                    {seg.label}
                  </span>
                  {c.scheduled_at && c.status === 'scheduled' && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Clock size={11}/> {fmtDateTime(c.scheduled_at)}
                    </span>
                  )}
                  {c.sent_at && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle size={11}/> {fmtDateTime(c.sent_at)}
                    </span>
                  )}
                  {!c.sent_at && !c.scheduled_at && (
                    <span>{fmtDate(c.created_at)}</span>
                  )}
                </div>

                {c.status !== 'sent' && (
                  <button
                    onClick={() => setSendingCampaign(c)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors">
                    <Send size={12}/> Enviar ahora
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Send Modal */}
      {sendingCampaign && (
        <SendModal
          campaign={sendingCampaign}
          customers={getSegmentCustomers(sendingCampaign.segment as Segment)}
          companyName={company?.name || 'Tu negocio'}
          onClose={() => setSendingCampaign(null)}
          onDone={() => { setSendingCampaign(null); loadCampaigns(); toast.success('¡Campaña enviada! 🎉'); }}
        />
      )}
    </div>
  );
};

export default PromoCampaigns;
