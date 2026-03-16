import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, Clock, Check, RefreshCw, X, Bell,
  Truck, Search, Plus, AlertTriangle, ChevronDown,
  User, BarChart2, CheckCircle, XCircle, Archive,
  Warehouse, ArrowRight, Hash, MapPin, ScanLine,
  Filter, ToggleLeft, ToggleRight, Eye
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ══════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════

type PickStatus = 'PENDING' | 'PICKING' | 'READY' | 'DISPATCHED' | 'CANCELLED';

interface PickItem {
  id: string;
  product_id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  unit?: string;
  location?: string;       // Ubicación en bodega: Ej "A-03-2"
  status: 'PENDING' | 'PICKED' | 'NOT_FOUND';
  notes?: string;
}

interface PickOrder {
  id: string;
  company_id: string;
  order_number: string;     // Ej: "POS-2025-0041"
  origin: string;           // 'POS' | 'MANUAL' | 'TRANSFER'
  cashier_name?: string;    // Quién generó desde caja
  customer_name?: string;
  priority: 'NORMAL' | 'URGENTE';
  status: PickStatus;
  items: PickItem[];
  notes?: string;
  assigned_to?: string;     // Nombre del bodeguero asignado
  created_at: string;
  updated_at: string;
  dispatched_at?: string;
}

interface WarehouseWorker {
  id?: string;
  company_id?: string;
  name: string;
  active: boolean;
}

// ══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════════

const STATUS_CFG: Record<PickStatus, {
  label: string; bg: string; border: string; text: string;
  headerBg: string; headerText: string;
}> = {
  PENDING:    { label: '⏳ Nueva',       bg: '#fff7ed', border: '#fdba74', text: '#c2410c', headerBg: '#f97316', headerText: '#fff' },
  PICKING:    { label: '🔍 En picking',  bg: '#fefce8', border: '#fde047', text: '#a16207', headerBg: '#eab308', headerText: '#fff' },
  READY:      { label: '✅ Lista',        bg: '#f0fdf4', border: '#86efac', text: '#15803d', headerBg: '#22c55e', headerText: '#fff' },
  DISPATCHED: { label: '🚚 Despachada',  bg: '#f0f9ff', border: '#7dd3fc', text: '#0369a1', headerBg: '#0ea5e9', headerText: '#fff' },
  CANCELLED:  { label: '❌ Cancelada',   bg: '#fef2f2', border: '#fca5a5', text: '#dc2626', headerBg: '#ef4444', headerText: '#fff' },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ══════════════════════════════════════════════════════════════════════
// HELPERS UI (definidos FUERA del componente para no perder foco)
// ══════════════════════════════════════════════════════════════════════

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> =
  ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-base">{title}</h3>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

const WarehouseDisplay: React.FC = () => {
  const { company } = useDatabase();
  const companyId = company?.id;
  const brandColor = (company?.config as any)?.primary_color || '#6366f1';

  // ── State ──────────────────────────────────────────────────────────
  const [orders,       setOrders]       = useState<PickOrder[]>([]);
  const [workers,      setWorkers]      = useState<WarehouseWorker[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdate,   setLastUpdate]   = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | PickStatus>('ALL');
  const [filterPriority, setFilterPriority] = useState<'ALL' | 'URGENTE'>('ALL');
  const [activeTab,    setActiveTab]    = useState<'display' | 'workers' | 'history'>('display');

  // Modals
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [showOrderModal,  setShowOrderModal]  = useState(false);
  const [selectedOrder,   setSelectedOrder]   = useState<PickOrder | null>(null);
  const [workerName,      setWorkerName]       = useState('');
  const [newOrderForm,    setNewOrderForm]     = useState({ customer_name: '', notes: '', priority: 'NORMAL' as 'NORMAL' | 'URGENTE' });

  // ── Audio ──────────────────────────────────────────────────────────
  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      [0, 150].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = delay === 0 ? 660 : 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.25, ctx.currentTime + delay / 1000);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay / 1000 + 0.3);
        osc.start(ctx.currentTime + delay / 1000);
        osc.stop(ctx.currentTime + delay / 1000 + 0.3);
      });
    } catch { }
  }, [soundEnabled]);

  // ── Load orders ────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('warehouse_pick_orders')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['PENDING', 'PICKING', 'READY'])
      .order('priority', { ascending: false })   // URGENTE primero
      .order('created_at', { ascending: true });

    if (data) {
      setOrders(prev => {
        const newIds = new Set(data.map((o: PickOrder) => o.id));
        const prevIds = new Set(prev.map(o => o.id));
        if ([...newIds].some(id => !prevIds.has(id))) playBeep();
        return data;
      });
      setLastUpdate(new Date());
    }
    setLoading(false);
  }, [companyId, playBeep]);

  const loadWorkers = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('warehouse_workers')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('name');
    if (data) setWorkers(data);
  }, [companyId]);

  useEffect(() => { loadOrders(); loadWorkers(); }, [loadOrders, loadWorkers]);

  // Realtime subscription
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase.channel('warehouse-display')
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'warehouse_pick_orders',
        filter: `company_id=eq.${companyId}`,
      }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, loadOrders]);

  // Poll every 20s as fallback
  useEffect(() => {
    const t = setInterval(loadOrders, 20000);
    return () => clearInterval(t);
  }, [loadOrders]);

  // ── Actions ────────────────────────────────────────────────────────
  const updateOrderStatus = async (orderId: string, status: PickStatus, extra?: Partial<PickOrder>) => {
    const patch: any = { status, updated_at: new Date().toISOString(), ...extra };
    if (status === 'DISPATCHED') patch.dispatched_at = new Date().toISOString();
    await supabase.from('warehouse_pick_orders').update(patch).eq('id', orderId);
    const labels: Record<string, string> = {
      PICKING: '🔍 Picking iniciado', READY: '✅ Orden lista para despacho',
      DISPATCHED: '🚚 Despachada correctamente', CANCELLED: 'Orden cancelada',
    };
    toast.success(labels[status] || 'Actualizado');
    loadOrders();
  };

  const updateItemStatus = async (orderId: string, itemId: string, status: 'PENDING' | 'PICKED' | 'NOT_FOUND') => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const updatedItems = order.items.map(i => i.id === itemId ? { ...i, status } : i);
    const allDone = updatedItems.every(i => i.status === 'PICKED' || i.status === 'NOT_FOUND');
    await supabase.from('warehouse_pick_orders').update({
      items: updatedItems,
      status: allDone ? 'READY' : 'PICKING',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    if (allDone) toast.success('✅ Todos los ítems procesados — orden lista');
    loadOrders();
  };

  const assignWorker = async (orderId: string, workerName: string) => {
    await supabase.from('warehouse_pick_orders').update({
      assigned_to: workerName,
      status: 'PICKING',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    toast.success(`Asignada a ${workerName}`);
    loadOrders();
  };

  const saveWorker = async () => {
    if (!workerName.trim()) return;
    await supabase.from('warehouse_workers').insert({ company_id: companyId, name: workerName.trim(), active: true });
    toast.success('Bodeguero registrado');
    setWorkerName(''); setShowWorkerModal(false); loadWorkers();
  };

  const createManualOrder = async () => {
    const newOrder: Omit<PickOrder, 'id'> = {
      company_id: companyId!,
      order_number: `BOD-${Date.now().toString().slice(-6)}`,
      origin: 'MANUAL',
      cashier_name: 'Admin',
      customer_name: newOrderForm.customer_name,
      priority: newOrderForm.priority,
      status: 'PENDING',
      items: [],
      notes: newOrderForm.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await supabase.from('warehouse_pick_orders').insert(newOrder);
    toast.success('Orden creada');
    setShowOrderModal(false);
    setNewOrderForm({ customer_name: '', notes: '', priority: 'NORMAL' });
    loadOrders();
  };

  // ── Helpers ────────────────────────────────────────────────────────
  const timeAgo = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return 'Ahora mismo';
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  const timerColor = (d: string, priority: string) => {
    if (priority === 'URGENTE') return '#ef4444';
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    return m < 10 ? '#10b981' : m < 25 ? '#f59e0b' : '#ef4444';
  };

  const counts = {
    PENDING: orders.filter(o => o.status === 'PENDING').length,
    PICKING: orders.filter(o => o.status === 'PICKING').length,
    READY:   orders.filter(o => o.status === 'READY').length,
  };

  const filteredOrders = orders.filter(o => {
    if (filterStatus !== 'ALL' && o.status !== filterStatus) return false;
    if (filterPriority === 'URGENTE' && o.priority !== 'URGENTE') return false;
    return true;
  });

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── TOP BAR ──────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 flex items-center justify-between sticky top-0 z-40 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: brandColor }}>
            <Warehouse size={22} />
          </div>
          <div>
            <h1 className="font-black text-white text-lg leading-tight">Display Bodega</h1>
            <p className="text-slate-400 text-xs">
              {company?.name} · {lastUpdate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1">
          {([
            { id: 'display',  label: 'Display',   icon: <Warehouse size={14} /> },
            { id: 'workers',  label: 'Bodegueros', icon: <User size={14} /> },
            { id: 'history',  label: 'Historial',  icon: <Archive size={14} /> },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === t.id ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
              style={activeTab === t.id ? { background: brandColor } : {}}>
              {t.icon}{t.label}
              {t.id === 'display' && counts.PENDING > 0 &&
                <span className="bg-red-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {counts.PENDING}
                </span>
              }
            </button>
          ))}
        </div>

        {/* Right controls */}
        {activeTab === 'display' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status filters */}
            {([
              { s: 'PENDING' as const, label: 'Nuevas',    color: '#f97316' },
              { s: 'PICKING' as const, label: 'En picking', color: '#eab308' },
              { s: 'READY'   as const, label: 'Listas',    color: '#22c55e' },
            ]).map(({ s, label, color }) => (
              <button key={s}
                onClick={() => setFilterStatus(filterStatus === s ? 'ALL' : s)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
                style={{ background: filterStatus === s ? color : 'rgba(255,255,255,0.08)', color: '#fff' }}>
                {counts[s]} {label}
              </button>
            ))}

            <button
              onClick={() => setFilterPriority(p => p === 'ALL' ? 'URGENTE' : 'ALL')}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${filterPriority === 'URGENTE' ? 'bg-red-600' : 'bg-slate-800'}`}>
              🔴 Urgentes
            </button>

            <button onClick={() => setSoundEnabled(s => !s)}
              className={`p-2 rounded-lg transition-all ${soundEnabled ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
              <Bell size={18} />
            </button>
            <button onClick={loadOrders} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all">
              <RefreshCw size={18} />
            </button>
            <button onClick={() => setShowOrderModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-white transition-all"
              style={{ background: brandColor }}>
              <Plus size={14} /> Nueva orden
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB: DISPLAY PRINCIPAL
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'display' && (
        loading ? (
          <div className="flex flex-col items-center justify-center h-[70vh] gap-3">
            <Warehouse size={48} className="text-indigo-400 animate-pulse" />
            <p className="text-slate-400">Cargando órdenes de bodega...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
            <Warehouse size={64} className="text-slate-700" />
            <p className="text-slate-500 text-xl font-semibold">Sin órdenes activas</p>
            <p className="text-slate-600 text-sm">Las solicitudes desde caja aparecerán aquí automáticamente</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.map(order => {
              const cfg = STATUS_CFG[order.status];
              const tc  = timerColor(order.created_at, order.priority);
              const pickedCount  = order.items.filter(i => i.status === 'PICKED').length;
              const notFoundCount = order.items.filter(i => i.status === 'NOT_FOUND').length;
              const totalItems   = order.items.length;

              return (
                <div key={order.id}
                  className="rounded-2xl overflow-hidden border shadow-lg flex flex-col"
                  style={{ background: cfg.bg, borderColor: cfg.border }}>

                  {/* Header */}
                  <div className="px-4 py-3 flex items-start justify-between"
                    style={{ background: cfg.headerBg, color: cfg.headerText }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-base leading-tight">{order.order_number}</h3>
                        {order.priority === 'URGENTE' && (
                          <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                            🔴 URGENTE
                          </span>
                        )}
                      </div>
                      <p className="text-white/80 text-xs mt-0.5">
                        {order.origin === 'POS' ? `📦 POS · ${order.cashier_name || 'Caja'}` : `✍️ Manual`}
                        {order.customer_name && ` · ${order.customer_name}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 font-bold text-sm justify-end">
                        <Clock size={12} />
                        <span style={{ color: tc === '#ef4444' ? '#fecaca' : '#fff' }}>
                          {timeAgo(order.created_at)}
                        </span>
                      </div>
                      <p className="text-white/70 text-xs">{cfg.label}</p>
                    </div>
                  </div>

                  {/* Asignación */}
                  {order.status === 'PENDING' && workers.length > 0 && (
                    <div className="px-3 py-2 bg-white/60 border-b border-slate-100">
                      <select
                        className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-white text-slate-700 focus:outline-none"
                        defaultValue=""
                        onChange={e => { if (e.target.value) assignWorker(order.id, e.target.value); }}>
                        <option value="">👤 Asignar bodeguero...</option>
                        {workers.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                      </select>
                    </div>
                  )}

                  {order.assigned_to && (
                    <div className="px-3 py-1.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                      <User size={12} className="text-indigo-500" />
                      <span className="text-xs font-semibold text-indigo-600">{order.assigned_to}</span>
                    </div>
                  )}

                  {/* Progress bar */}
                  {totalItems > 0 && (
                    <div className="px-3 pt-2 pb-1">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>{pickedCount}/{totalItems} ítems</span>
                        {notFoundCount > 0 && <span className="text-red-500 font-semibold">{notFoundCount} no encontrado{notFoundCount > 1 ? 's' : ''}</span>}
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-green-500 transition-all"
                          style={{ width: `${totalItems > 0 ? (pickedCount / totalItems) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Items */}
                  <div className="flex-1 p-3 space-y-2">
                    {order.items.length === 0 ? (
                      <p className="text-slate-400 text-xs text-center py-3">Sin ítems registrados</p>
                    ) : (
                      order.items.map(item => (
                        <div key={item.id}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                            item.status === 'PICKED'     ? 'opacity-60 bg-green-50 border-green-200' :
                            item.status === 'NOT_FOUND' ? 'bg-red-50 border-red-200' :
                            'bg-white/80 border-slate-100'
                          }`}>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="font-black text-slate-800 text-lg w-7 text-center flex-shrink-0">
                              {item.quantity}
                            </span>
                            <div className="min-w-0">
                              <p className={`font-bold text-slate-800 text-sm truncate ${item.status === 'PICKED' ? 'line-through' : ''}`}>
                                {item.product_name}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.sku && <span className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</span>}
                                {item.location && (
                                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                    <MapPin size={9} /> {item.location}
                                  </span>
                                )}
                                {item.unit && <span className="text-[10px] text-slate-400">{item.unit}</span>}
                              </div>
                              {item.notes && <p className="text-xs text-orange-600 font-medium mt-0.5">⚠ {item.notes}</p>}
                            </div>
                          </div>

                          {/* Item actions */}
                          {order.status === 'PICKING' && item.status === 'PENDING' && (
                            <div className="flex gap-1 flex-shrink-0 ml-2">
                              <button
                                onClick={() => updateItemStatus(order.id, item.id, 'PICKED')}
                                className="w-8 h-8 rounded-full bg-green-500 border-2 border-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-all"
                                title="Encontrado">
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => updateItemStatus(order.id, item.id, 'NOT_FOUND')}
                                className="w-8 h-8 rounded-full bg-red-100 border-2 border-red-300 text-red-500 flex items-center justify-center hover:bg-red-200 transition-all"
                                title="No encontrado">
                                <X size={13} />
                              </button>
                            </div>
                          )}
                          {item.status === 'PICKED' && (
                            <CheckCircle size={18} className="text-green-500 flex-shrink-0 ml-2" />
                          )}
                          {item.status === 'NOT_FOUND' && (
                            <XCircle size={18} className="text-red-400 flex-shrink-0 ml-2" />
                          )}
                        </div>
                      ))
                    )}

                    {order.notes && (
                      <div className="mt-1 p-2.5 rounded-xl bg-yellow-50 border border-yellow-200">
                        <p className="text-xs font-semibold text-yellow-800">📝 {order.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Footer actions */}
                  <div className="p-3 border-t flex gap-2" style={{ borderColor: cfg.border }}>
                    {order.status === 'PENDING' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'PICKING')}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all"
                        style={{ background: '#eab308' }}>
                        🔍 Iniciar picking
                      </button>
                    )}
                    {order.status === 'PICKING' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'READY')}
                        className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm transition-all">
                        ✅ Marcar lista
                      </button>
                    )}
                    {order.status === 'READY' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'DISPATCHED')}
                        className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition-all"
                        style={{ background: '#0ea5e9' }}>
                        🚚 Confirmar despacho
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm('¿Cancelar esta orden?')) updateOrderStatus(order.id, 'CANCELLED'); }}
                      className="w-10 h-10 rounded-xl bg-white/70 border border-red-200 hover:bg-red-50 text-red-500 flex items-center justify-center transition-all flex-shrink-0">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: BODEGUEROS
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'workers' && (
        <div className="p-5 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-white font-black text-xl">Personal de Bodega</h2>
              <p className="text-slate-400 text-sm">Gestiona quién puede recibir asignaciones</p>
            </div>
            <button onClick={() => setShowWorkerModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-xl font-semibold text-sm transition-all"
              style={{ background: brandColor }}>
              <Plus size={15} /> Nuevo bodeguero
            </button>
          </div>

          <div className="space-y-3">
            {workers.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <User size={40} className="mx-auto mb-3 opacity-30" />
                <p>No hay bodegueros registrados</p>
              </div>
            ) : workers.map(w => {
              const activeOrders = orders.filter(o => o.assigned_to === w.name && o.status !== 'DISPATCHED');
              return (
                <div key={w.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                      <User size={20} className="text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-white font-bold">{w.name}</p>
                      <p className="text-slate-400 text-xs">
                        {activeOrders.length > 0
                          ? `📦 ${activeOrders.length} orden${activeOrders.length > 1 ? 'es' : ''} activa${activeOrders.length > 1 ? 's' : ''}`
                          : 'Sin órdenes activas'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-900/40 text-green-400">Activo</span>
                    <button
                      onClick={async () => {
                        await supabase.from('warehouse_workers').update({ active: false }).eq('id', w.id!);
                        loadWorkers();
                        toast.success('Bodeguero desactivado');
                      }}
                      className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-red-400 transition-all"
                      title="Desactivar">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: HISTORIAL
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <HistoryTab companyId={companyId!} brandColor={brandColor} />
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════ */}

      {showWorkerModal && (
        <Modal title="Nuevo Bodeguero" onClose={() => setShowWorkerModal(false)}>
          <div>
            <label className={labelCls}>Nombre completo *</label>
            <input
              value={workerName}
              onChange={e => setWorkerName(e.target.value)}
              className={inputCls}
              placeholder="Ej: Carlos Rodríguez"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveWorker}
              className="px-4 py-2 text-white rounded-lg font-semibold text-sm"
              style={{ background: brandColor }}>
              Guardar
            </button>
            <button onClick={() => setShowWorkerModal(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm">
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {showOrderModal && (
        <Modal title="Nueva Orden Manual" onClose={() => setShowOrderModal(false)}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Cliente / Descripción</label>
              <input
                value={newOrderForm.customer_name}
                onChange={e => setNewOrderForm(f => ({ ...f, customer_name: e.target.value }))}
                className={inputCls}
                placeholder="Ej: Cliente mostrador, Transferencia almacén..."
              />
            </div>
            <div>
              <label className={labelCls}>Prioridad</label>
              <div className="flex gap-2">
                {(['NORMAL', 'URGENTE'] as const).map(p => (
                  <button key={p} type="button"
                    onClick={() => setNewOrderForm(f => ({ ...f, priority: p }))}
                    className={`flex-1 py-2 rounded-lg font-semibold text-sm border transition-all ${
                      newOrderForm.priority === p
                        ? p === 'URGENTE' ? 'bg-red-500 border-red-500 text-white' : 'bg-indigo-500 border-indigo-500 text-white'
                        : 'border-slate-200 text-slate-600'
                    }`}>
                    {p === 'URGENTE' ? '🔴 Urgente' : '🟢 Normal'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Notas</label>
              <textarea
                value={newOrderForm.notes}
                onChange={e => setNewOrderForm(f => ({ ...f, notes: e.target.value }))}
                className={inputCls + ' resize-none'}
                rows={2}
                placeholder="Instrucciones especiales..."
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={createManualOrder}
              className="px-4 py-2 text-white rounded-lg font-semibold text-sm"
              style={{ background: brandColor }}>
              Crear orden
            </button>
            <button onClick={() => setShowOrderModal(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold text-sm">
              Cancelar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTE: HISTORIAL
// ══════════════════════════════════════════════════════════════════════

const HistoryTab: React.FC<{ companyId: string; brandColor: string }> = ({ companyId, brandColor }) => {
  const [history, setHistory] = useState<PickOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('warehouse_pick_orders')
        .select('*')
        .eq('company_id', companyId)
        .in('status', ['DISPATCHED', 'CANCELLED'])
        .order('updated_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      setHistory(data || []);
      setLoading(false);
    };
    load();
  }, [companyId, page]);

  if (loading) return <div className="flex justify-center py-16 text-slate-400"><RefreshCw size={20} className="animate-spin mr-2" /> Cargando historial...</div>;

  return (
    <div className="p-5 max-w-4xl mx-auto">
      <h2 className="text-white font-black text-xl mb-4">Historial de Órdenes</h2>
      <div className="overflow-x-auto rounded-2xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 border-b border-slate-700">
            <tr>
              {['Orden', 'Origen', 'Cliente', 'Bodeguero', 'Ítems', 'Estado', 'Tiempo', 'Fecha'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {history.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-500">Sin historial</td></tr>
            ) : history.map(o => {
              const mins = o.dispatched_at
                ? Math.round((new Date(o.dispatched_at).getTime() - new Date(o.created_at).getTime()) / 60000)
                : null;
              return (
                <tr key={o.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-indigo-300 font-bold text-xs">{o.order_number}</td>
                  <td className="px-4 py-3 text-slate-300">{o.origin}</td>
                  <td className="px-4 py-3 text-slate-300">{o.customer_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{o.assigned_to || '-'}</td>
                  <td className="px-4 py-3 text-slate-300">{o.items.length}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        background: o.status === 'DISPATCHED' ? '#0ea5e922' : '#ef444422',
                        color: o.status === 'DISPATCHED' ? '#0ea5e9' : '#ef4444',
                      }}>
                      {STATUS_CFG[o.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {mins !== null ? `${mins} min` : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {new Date(o.updated_at).toLocaleDateString('es-CO')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {history.length === PAGE_SIZE && (
        <button onClick={() => setPage(p => p + 1)}
          className="mt-4 w-full py-2 rounded-xl text-sm font-semibold text-slate-400 border border-slate-700 hover:bg-slate-800 transition-all">
          Ver más →
        </button>
      )}
    </div>
  );
};

export default WarehouseDisplay;
