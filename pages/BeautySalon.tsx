import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Scissors, Clock, User, CheckCircle, XCircle, AlertCircle,
  RefreshCw, ChevronRight, Sparkles, Nail, Search, X, Edit2,
  DollarSign, BarChart2, Calendar, Star, Trash2, Users, Tag,
  ArrowRight, Timer, ShoppingCart
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────
type ServiceStatus = 'WAITING' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

interface SalonService {
  id: string;
  company_id: string;
  name: string;
  category: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
}

interface Stylist {
  id: string;
  company_id: string;
  name: string;
  specialty: string;
  is_active: boolean;
}

interface ServiceOrder {
  id: string;
  company_id: string;
  client_name: string;
  service_id: string;
  service_name: string;
  service_price: number;
  stylist_id: string | null;
  stylist_name: string | null;
  status: ServiceStatus;
  notes: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  invoice_id: string | null;
}

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  WAITING:     { label: 'En espera',   color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: <Clock size={14} /> },
  ASSIGNED:    { label: 'Asignado',    color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: <User size={14} /> },
  IN_PROGRESS: { label: 'En proceso',  color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: <Scissors size={14} /> },
  DONE:        { label: 'Finalizado',  color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', icon: <CheckCircle size={14} /> },
  CANCELLED:   { label: 'Cancelado',   color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: <XCircle size={14} /> },
};

const SERVICE_CATEGORIES = [
  { id: 'cabello',  label: '💇 Cabello',   services: ['Corte de cabello','Corte + lavado','Corte + peinado','Lavado','Peinado','Cepillado','Plancha','Rizos','Tinte completo','Retoque de raíz','Mechas / balayage','Keratina','Botox capilar','Tratamientos capilares'] },
  { id: 'unas',     label: '💅 Uñas',      services: ['Manicure','Pedicure','Manicure semipermanente','Pedicure spa','Uñas acrílicas','Uñas en gel','Decoración de uñas','Retiro de acrílico'] },
  { id: 'estetica', label: '💄 Estética',  services: ['Maquillaje','Maquillaje profesional','Depilación cejas','Depilación facial','Limpieza facial','Tratamientos faciales'] },
  { id: 'otros',    label: '👁 Otros',     services: ['Diseño de cejas','Pestañas','Extensiones de pestañas','Lifting de pestañas'] },
];

const TABS = [
  { id: 'panel',     label: 'Panel Operativo', icon: <BarChart2 size={16} /> },
  { id: 'servicios', label: 'Catálogo',         icon: <Tag size={16} /> },
  { id: 'estilistas',label: 'Estilistas',        icon: <Users size={16} /> },
  { id: 'historial', label: 'Historial',         icon: <Calendar size={16} /> },
] as const;
type TabId = typeof TABS[number]['id'];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const elapsed = (from: string) => {
  const diff = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}min`;
};

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const BeautySalon: React.FC = () => {
  const { company } = useDatabase();
  const navigate = useNavigate();
  const companyId = company?.id;
  const brandColor = (company?.config as any)?.primary_color || '#8b5cf6';

  const [activeTab, setActiveTab] = useState<TabId>('panel');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [services, setServices] = useState<SalonService[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showStylistModal, setShowStylistModal] = useState(false);
  const [editingService, setEditingService] = useState<SalonService | null>(null);
  const [editingStylist, setEditingStylist] = useState<Stylist | null>(null);
  const [detailOrder, setDetailOrder] = useState<ServiceOrder | null>(null);

  // Forms
  const [orderForm, setOrderForm] = useState({ client_name: '', service_id: '', stylist_id: '', notes: '' });
  const [serviceForm, setServiceForm] = useState({ name: '', category: 'cabello', price: '', duration_minutes: '30' });
  const [stylistForm, setStylistForm] = useState({ name: '', specialty: '' });
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  // ── LOAD ──────────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('salon_orders')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    setOrders((data || []) as ServiceOrder[]);
  }, [companyId]);

  const loadServices = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('salon_services')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('category, name');
    setServices((data || []) as SalonService[]);
  }, [companyId]);

  const loadStylists = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('salon_stylists')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');
    setStylists((data || []) as Stylist[]);
  }, [companyId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOrders(), loadServices(), loadStylists()]);
    setLoading(false);
  }, [loadOrders, loadServices, loadStylists]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh panel cada 30s
  useEffect(() => {
    const interval = setInterval(() => { if (activeTab === 'panel') loadOrders(); }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, loadOrders]);

  // ── ORDERS ────────────────────────────────────────────────────────────────
  const handleCreateOrder = async () => {
    if (!companyId || !orderForm.client_name || !orderForm.service_id) {
      toast.error('Cliente y servicio son obligatorios');
      return;
    }
    setSaving(true);
    const svc = services.find(s => s.id === orderForm.service_id);
    const stl = stylists.find(s => s.id === orderForm.stylist_id);
    const { error } = await supabase.from('salon_orders').insert({
      company_id: companyId,
      client_name: orderForm.client_name,
      service_id: orderForm.service_id,
      service_name: svc?.name || '',
      service_price: svc?.price || 0,
      stylist_id: orderForm.stylist_id || null,
      stylist_name: stl?.name || null,
      status: orderForm.stylist_id ? 'ASSIGNED' : 'WAITING',
      notes: orderForm.notes,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Servicio registrado ✅');
    setShowNewOrder(false);
    setOrderForm({ client_name: '', service_id: '', stylist_id: '', notes: '' });
    setSaving(false);
    loadOrders();
  };

  const updateOrderStatus = async (id: string, status: ServiceStatus) => {
    const extra: Record<string, any> = {};
    if (status === 'IN_PROGRESS') extra.started_at = new Date().toISOString();
    if (status === 'DONE') extra.finished_at = new Date().toISOString();
    const { error } = await supabase.from('salon_orders').update({ status, ...extra }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    loadOrders();
    if (detailOrder?.id === id) setDetailOrder(prev => prev ? { ...prev, status, ...extra } : null);
  };

  const assignStylist = async (orderId: string, stylistId: string) => {
    const stl = stylists.find(s => s.id === stylistId);
    const { error } = await supabase.from('salon_orders').update({
      stylist_id: stylistId, stylist_name: stl?.name || '', status: 'ASSIGNED'
    }).eq('id', orderId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Asignado a ${stl?.name}`);
    loadOrders();
  };

  // ── SERVICES CRUD ─────────────────────────────────────────────────────────
  const handleSaveService = async () => {
    if (!companyId || !serviceForm.name) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: serviceForm.name,
      category: serviceForm.category,
      price: parseFloat(serviceForm.price) || 0,
      duration_minutes: parseInt(serviceForm.duration_minutes) || 30,
      is_active: true,
    };
    const { error } = editingService
      ? await supabase.from('salon_services').update(payload).eq('id', editingService.id)
      : await supabase.from('salon_services').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editingService ? 'Servicio actualizado' : 'Servicio creado');
    setShowServiceModal(false);
    setEditingService(null);
    setServiceForm({ name: '', category: 'cabello', price: '', duration_minutes: '30' });
    setSaving(false);
    loadServices();
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('¿Eliminar este servicio?')) return;
    await supabase.from('salon_services').update({ is_active: false }).eq('id', id);
    toast.success('Servicio eliminado');
    loadServices();
  };

  // ── STYLISTS CRUD ─────────────────────────────────────────────────────────
  const handleSaveStylist = async () => {
    if (!companyId || !stylistForm.name) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    const payload = { company_id: companyId, name: stylistForm.name, specialty: stylistForm.specialty, is_active: true };
    const { error } = editingStylist
      ? await supabase.from('salon_stylists').update(payload).eq('id', editingStylist.id)
      : await supabase.from('salon_stylists').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editingStylist ? 'Estilista actualizado' : 'Estilista creado');
    setShowStylistModal(false);
    setEditingStylist(null);
    setStylistForm({ name: '', specialty: '' });
    setSaving(false);
    loadStylists();
  };

  const handleDeleteStylist = async (id: string) => {
    if (!confirm('¿Eliminar este estilista?')) return;
    await supabase.from('salon_stylists').update({ is_active: false }).eq('id', id);
    toast.success('Estilista eliminado');
    loadStylists();
  };

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  const activeOrders = orders.filter(o => !['DONE', 'CANCELLED'].includes(o.status));
  const historyOrders = orders.filter(o => ['DONE', 'CANCELLED'].includes(o.status));
  const waiting   = activeOrders.filter(o => o.status === 'WAITING');
  const assigned  = activeOrders.filter(o => o.status === 'ASSIGNED');
  const inProcess = activeOrders.filter(o => o.status === 'IN_PROGRESS');
  const todayDone = orders.filter(o => o.status === 'DONE' && o.finished_at && new Date(o.finished_at).toDateString() === new Date().toDateString());
  const todayRevenue = todayDone.reduce((s, o) => s + o.service_price, 0);

  const filteredHistory = historyOrders.filter(o =>
    !searchQ || o.client_name.toLowerCase().includes(searchQ.toLowerCase()) || o.service_name.toLowerCase().includes(searchQ.toLowerCase())
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400 animate-pulse text-lg">Cargando salón...</div>
    </div>
  );

  return (
    <div className="flex flex-col h-full gap-4">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Scissors size={24} style={{ color: brandColor }} /> Salón de Belleza
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Panel operativo de servicios</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm">
            <RefreshCw size={15} /> Actualizar
          </button>
          <button onClick={() => setShowNewOrder(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow"
            style={{ background: brandColor }}>
            <Plus size={16} /> Nuevo Servicio
          </button>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'En espera',  value: waiting.length,   color: '#f59e0b', icon: <Clock size={20} /> },
          { label: 'En proceso', value: inProcess.length, color: '#8b5cf6', icon: <Scissors size={20} /> },
          { label: 'Hoy finalizados', value: todayDone.length, color: '#10b981', icon: <CheckCircle size={20} /> },
          { label: 'Ingresos hoy', value: fmt(todayRevenue), color: '#3b82f6', icon: <DollarSign size={20} /> },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: k.color + '20', color: k.color }}>{k.icon}</div>
            <div>
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className="text-xl font-bold text-slate-800">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 self-start">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: PANEL OPERATIVO ══════════════ */}
      {activeTab === 'panel' && (
        <div className="grid md:grid-cols-3 gap-4 flex-1 min-h-0">

          {/* Columna: En espera */}
          <KanbanColumn
            title="En espera" count={waiting.length} color="#f59e0b"
            icon={<Clock size={16} />}
            empty="No hay servicios en espera"
          >
            {waiting.map(o => (
              <OrderCard key={o.id} order={o} stylists={stylists}
                onDetail={() => setDetailOrder(o)}
                onAssign={(stylistId) => assignStylist(o.id, stylistId)}
                onStatus={updateOrderStatus}
              />
            ))}
          </KanbanColumn>

          {/* Columna: Asignado / En proceso */}
          <KanbanColumn
            title="En proceso" count={assigned.length + inProcess.length} color="#8b5cf6"
            icon={<Scissors size={16} />}
            empty="Ningún servicio en proceso"
          >
            {[...assigned, ...inProcess].map(o => (
              <OrderCard key={o.id} order={o} stylists={stylists}
                onDetail={() => setDetailOrder(o)}
                onAssign={(stylistId) => assignStylist(o.id, stylistId)}
                onStatus={updateOrderStatus}
              />
            ))}
          </KanbanColumn>

          {/* Columna: Finalizados hoy */}
          <KanbanColumn
            title="Finalizados hoy" count={todayDone.length} color="#10b981"
            icon={<CheckCircle size={16} />}
            empty="Ningún servicio finalizado hoy"
          >
            {todayDone.map(o => (
              <OrderCard key={o.id} order={o} stylists={stylists}
                onDetail={() => setDetailOrder(o)}
                onAssign={() => {}}
                onStatus={updateOrderStatus}
              />
            ))}
          </KanbanColumn>

        </div>
      )}

      {/* ══════════════ TAB: CATÁLOGO DE SERVICIOS ══════════════ */}
      {activeTab === 'servicios' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex-1">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">Catálogo de Servicios ({services.length})</h2>
            <button onClick={() => { setEditingService(null); setServiceForm({ name: '', category: 'cabello', price: '', duration_minutes: '30' }); setShowServiceModal(true); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-sm font-medium"
              style={{ background: brandColor }}>
              <Plus size={14} /> Agregar servicio
            </button>
          </div>
          <div className="overflow-auto">
            {SERVICE_CATEGORIES.map(cat => {
              const catServices = services.filter(s => s.category === cat.id);
              if (!catServices.length) return null;
              return (
                <div key={cat.id}>
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{cat.label}</span>
                  </div>
                  {catServices.map(svc => (
                    <div key={svc.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 hover:bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{svc.name}</p>
                        <p className="text-xs text-slate-400">{svc.duration_minutes} min</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-700 text-sm">{fmt(svc.price)}</span>
                        <button onClick={() => { setEditingService(svc); setServiceForm({ name: svc.name, category: svc.category, price: String(svc.price), duration_minutes: String(svc.duration_minutes) }); setShowServiceModal(true); }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteService(svc.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {!services.length && (
              <div className="text-center py-16 text-slate-400">
                <Tag size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin servicios aún</p>
                <p className="text-sm mt-1">Agrega los servicios que ofrece tu salón</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ TAB: ESTILISTAS ══════════════ */}
      {activeTab === 'estilistas' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex-1">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">Estilistas ({stylists.length})</h2>
            <button onClick={() => { setEditingStylist(null); setStylistForm({ name: '', specialty: '' }); setShowStylistModal(true); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white text-sm font-medium"
              style={{ background: brandColor }}>
              <Plus size={14} /> Agregar estilista
            </button>
          </div>
          <div className="p-4 grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {stylists.map(stl => {
              const activeNow = activeOrders.filter(o => o.stylist_id === stl.id);
              return (
                <div key={stl.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: brandColor }}>
                      {stl.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingStylist(stl); setStylistForm({ name: stl.name, specialty: stl.specialty }); setShowStylistModal(true); }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDeleteStylist(stl.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <p className="font-semibold text-slate-800">{stl.name}</p>
                  {stl.specialty && <p className="text-xs text-slate-500 mt-0.5">{stl.specialty}</p>}
                  <div className="mt-3 flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${activeNow.length ? 'bg-purple-500' : 'bg-green-400'}`} />
                    <span className="text-xs text-slate-500">
                      {activeNow.length ? `${activeNow.length} servicio${activeNow.length > 1 ? 's' : ''} activo${activeNow.length > 1 ? 's' : ''}` : 'Disponible'}
                    </span>
                  </div>
                </div>
              );
            })}
            {!stylists.length && (
              <div className="col-span-3 text-center py-16 text-slate-400">
                <Users size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin estilistas registrados</p>
                <p className="text-sm mt-1">Agrega tu equipo de trabajo</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ TAB: HISTORIAL ══════════════ */}
      {activeTab === 'historial' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Buscar cliente o servicio..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-purple-300" />
            </div>
            <span className="text-sm text-slate-500">{filteredHistory.length} registros</span>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {['Cliente','Servicio','Estilista','Estado','Precio','Fecha'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map(o => {
                  const sc = STATUS_CONFIG[o.status];
                  return (
                    <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{o.client_name}</td>
                      <td className="px-4 py-3 text-slate-600">{o.service_name}</td>
                      <td className="px-4 py-3 text-slate-500">{o.stylist_name || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                          {sc.icon} {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{fmt(o.service_price)}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{new Date(o.created_at).toLocaleDateString('es-CO')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredHistory.length && (
              <div className="text-center py-16 text-slate-400">
                <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                <p>Sin registros en el historial</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ MODAL: NUEVO SERVICIO ══════════════ */}
      {showNewOrder && (
        <Modal title="Nuevo Servicio" onClose={() => setShowNewOrder(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
              <input value={orderForm.client_name} onChange={e => setOrderForm(p => ({ ...p, client_name: e.target.value }))}
                placeholder="Nombre del cliente"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Servicio *</label>
              <select value={orderForm.service_id} onChange={e => setOrderForm(p => ({ ...p, service_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400">
                <option value="">Seleccionar servicio...</option>
                {SERVICE_CATEGORIES.map(cat => {
                  const catSvcs = services.filter(s => s.category === cat.id);
                  if (!catSvcs.length) return null;
                  return (
                    <optgroup key={cat.id} label={cat.label}>
                      {catSvcs.map(s => (
                        <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              {!services.length && <p className="text-xs text-amber-600 mt-1">⚠️ No hay servicios. Agrega servicios en el catálogo primero.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estilista <span className="text-slate-400 font-normal">(opcional)</span></label>
              <select value={orderForm.stylist_id} onChange={e => setOrderForm(p => ({ ...p, stylist_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400">
                <option value="">Sin asignar (En espera)</option>
                {stylists.map(s => <option key={s.id} value={s.id}>{s.name}{s.specialty ? ` — ${s.specialty}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones</label>
              <textarea value={orderForm.notes} onChange={e => setOrderForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Notas del cliente, preferencias..."
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400 resize-none" />
            </div>
            {orderForm.service_id && (
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                {(() => { const s = services.find(x => x.id === orderForm.service_id); return s ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-purple-700 font-medium">{s.name}</span>
                    <span className="font-bold text-purple-800">{fmt(s.price)}</span>
                  </div>
                ) : null; })()}
              </div>
            )}
            <button onClick={handleCreateOrder} disabled={saving}
              className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: brandColor }}>
              {saving ? 'Guardando...' : 'Registrar Servicio'}
            </button>
          </div>
        </Modal>
      )}

      {/* ══════════════ MODAL: DETALLE ORDEN ══════════════ */}
      {detailOrder && (
        <Modal title="Detalle del Servicio" onClose={() => setDetailOrder(null)}>
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <InfoRow label="Cliente" value={detailOrder.client_name} />
              <InfoRow label="Servicio" value={detailOrder.service_name} />
              <InfoRow label="Precio" value={fmt(detailOrder.service_price)} />
              <InfoRow label="Estilista" value={detailOrder.stylist_name || 'Sin asignar'} />
              {detailOrder.notes && <InfoRow label="Notas" value={detailOrder.notes} />}
              <InfoRow label="Registrado" value={new Date(detailOrder.created_at).toLocaleString('es-CO')} />
              {detailOrder.started_at && <InfoRow label="Inicio" value={new Date(detailOrder.started_at).toLocaleString('es-CO')} />}
              {detailOrder.finished_at && <InfoRow label="Finalizado" value={new Date(detailOrder.finished_at).toLocaleString('es-CO')} />}
            </div>

            {/* Estado actual */}
            <div>
              {(() => { const sc = STATUS_CONFIG[detailOrder.status]; return (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                  {sc.icon} {sc.label}
                </span>
              ); })()}
            </div>

            {/* Asignar estilista si no tiene */}
            {detailOrder.status === 'WAITING' && stylists.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Asignar estilista</label>
                <div className="flex gap-2">
                  <select id="assign-sel" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="">Seleccionar...</option>
                    {stylists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={() => {
                    const sel = (document.getElementById('assign-sel') as HTMLSelectElement).value;
                    if (sel) assignStylist(detailOrder.id, sel);
                  }} className="px-3 py-2 rounded-lg text-white text-sm font-medium" style={{ background: brandColor }}>
                    Asignar
                  </button>
                </div>
              </div>
            )}

            {/* Acciones de estado */}
            <div className="flex flex-wrap gap-2">
              {detailOrder.status === 'ASSIGNED' && (
                <button onClick={() => updateOrderStatus(detailOrder.id, 'IN_PROGRESS')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700">
                  <Scissors size={14} /> Iniciar servicio
                </button>
              )}
              {detailOrder.status === 'IN_PROGRESS' && (
                <button onClick={() => updateOrderStatus(detailOrder.id, 'DONE')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                  <CheckCircle size={14} /> Finalizar servicio
                </button>
              )}
              {!['DONE', 'CANCELLED'].includes(detailOrder.status) && (
                <button onClick={() => { updateOrderStatus(detailOrder.id, 'CANCELLED'); setDetailOrder(null); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100">
                  <XCircle size={14} /> Cancelar
                </button>
              )}
              {detailOrder.status === 'DONE' && (
                <button onClick={() => {
                  const params = new URLSearchParams({
                    salon:    detailOrder.id,
                    ticket:   detailOrder.id.slice(0, 8).toUpperCase(),
                    cliente:  detailOrder.client_name,
                    cedula:   '',
                    tel:      '',
                    total:    String(detailOrder.service_price),
                    abono:    '0',
                    servicio: detailOrder.service_name,
                  });
                  setDetailOrder(null);
                  navigate(`/pos?${params.toString()}`);
                }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                  <ShoppingCart size={14} /> Cobrar en POS
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════════ MODAL: SERVICIO CRUD ══════════════ */}
      {showServiceModal && (
        <Modal title={editingService ? 'Editar Servicio' : 'Nuevo Servicio'} onClose={() => setShowServiceModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
              <input value={serviceForm.name} onChange={e => setServiceForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Corte + peinado"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
              <select value={serviceForm.category} onChange={e => setServiceForm(p => ({ ...p, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400">
                {SERVICE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Precio ($)</label>
                <input type="number" value={serviceForm.price} onChange={e => setServiceForm(p => ({ ...p, price: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Duración (min)</label>
                <input type="number" value={serviceForm.duration_minutes} onChange={e => setServiceForm(p => ({ ...p, duration_minutes: e.target.value }))}
                  placeholder="30"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
            </div>

            {/* Servicios sugeridos */}
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">💡 Sugeridos para esta categoría</label>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {(SERVICE_CATEGORIES.find(c => c.id === serviceForm.category)?.services || []).map(s => (
                  <button key={s} onClick={() => setServiceForm(p => ({ ...p, name: s }))}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-all ${serviceForm.name === s ? 'bg-purple-100 border-purple-300 text-purple-700 font-medium' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-purple-200'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSaveService} disabled={saving}
              className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: brandColor }}>
              {saving ? 'Guardando...' : editingService ? 'Actualizar' : 'Crear Servicio'}
            </button>
          </div>
        </Modal>
      )}

      {/* ══════════════ MODAL: ESTILISTA CRUD ══════════════ */}
      {showStylistModal && (
        <Modal title={editingStylist ? 'Editar Estilista' : 'Nuevo Estilista'} onClose={() => setShowStylistModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
              <input value={stylistForm.name} onChange={e => setStylistForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Nombre completo"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Especialidad <span className="text-slate-400 font-normal">(opcional)</span></label>
              <input value={stylistForm.specialty} onChange={e => setStylistForm(p => ({ ...p, specialty: e.target.value }))}
                placeholder="Ej: Colorimetría, Uñas acrílicas..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
            </div>
            <button onClick={handleSaveStylist} disabled={saving}
              className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50"
              style={{ background: brandColor }}>
              {saving ? 'Guardando...' : editingStylist ? 'Actualizar' : 'Crear Estilista'}
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
};

// ── SUB-COMPONENTS ─────────────────────────────────────────────────────────────

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <X size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const KanbanColumn: React.FC<{ title: string; count: number; color: string; icon: React.ReactNode; empty: string; children: React.ReactNode }> =
  ({ title, count, color, icon, empty, children }) => (
    <div className="bg-slate-50 rounded-xl p-3 flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="font-semibold text-slate-700 text-sm">{title}</span>
        <span className="ml-auto w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white" style={{ background: color }}>{count}</span>
      </div>
      {React.Children.count(children) === 0
        ? <p className="text-center text-slate-400 text-xs py-8">{empty}</p>
        : children}
    </div>
  );

const OrderCard: React.FC<{
  order: ServiceOrder;
  stylists: Stylist[];
  onDetail: () => void;
  onAssign: (stylistId: string) => void;
  onStatus: (id: string, status: ServiceStatus) => void;
}> = ({ order, stylists, onDetail, onAssign, onStatus }) => {
  const sc = STATUS_CONFIG[order.status];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onDetail}>
      <div className="flex items-start justify-between mb-2">
        <p className="font-semibold text-slate-800 text-sm">{order.client_name}</p>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
          style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
          {sc.icon} {sc.label}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-1">{order.service_name}</p>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{order.stylist_name ? `✂️ ${order.stylist_name}` : '👤 Sin asignar'}</span>
        <span className="flex items-center gap-1"><Clock size={11} /> {elapsed(order.created_at)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-semibold text-slate-700 text-sm">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(order.service_price)}</span>
        {/* Botón de acción rápida por estado */}
        {order.status === 'WAITING' && stylists.length > 0 && (
          <button onClick={e => { e.stopPropagation(); onAssign(stylists[0].id); }}
            className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 font-medium hover:bg-blue-100"
            title="Asignar primer estilista disponible">
            Asignar
          </button>
        )}
        {order.status === 'ASSIGNED' && (
          <button onClick={e => { e.stopPropagation(); onStatus(order.id, 'IN_PROGRESS'); }}
            className="text-xs px-2 py-1 rounded-lg bg-purple-50 text-purple-600 font-medium hover:bg-purple-100">
            Iniciar
          </button>
        )}
        {order.status === 'IN_PROGRESS' && (
          <button onClick={e => { e.stopPropagation(); onStatus(order.id, 'DONE'); }}
            className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 font-medium hover:bg-emerald-100">
            Finalizar
          </button>
        )}
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between items-start gap-4">
    <span className="text-xs text-slate-400 flex-shrink-0">{label}</span>
    <span className="text-sm text-slate-700 font-medium text-right">{value}</span>
  </div>
);

export default BeautySalon;