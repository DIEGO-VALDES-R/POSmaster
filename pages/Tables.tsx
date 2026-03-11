import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, Users, Clock, ChefHat, Receipt,
  LayoutGrid, List, RefreshCw, Utensils, X, Check,
  AlertCircle, Printer, ShoppingCart, Coffee
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────
type TableStatus = 'FREE' | 'OCCUPIED' | 'ORDERING' | 'READY' | 'BILLING';
type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';

interface RestaurantTable {
  id: string;
  company_id: string;
  branch_id?: string;
  name: string;           // "Mesa 1", "Barra 3", "Terraza 2"
  seats: number;
  zone: string;           // "Salón", "Terraza", "Barra", "Privado"
  status: TableStatus;
  current_order_id?: string;
  position_x?: number;
  position_y?: number;
  is_active: boolean;
}

interface TableOrder {
  id: string;
  company_id: string;
  table_id: string;
  table_name: string;
  waiter_id?: string;
  waiter_name?: string;
  status: OrderStatus;
  items: OrderItem[];
  notes?: string;
  guests: number;
  created_at: string;
  updated_at: string;
  invoice_id?: string;
}

interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  notes?: string;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED';
  sent_to_kitchen: boolean;
}

// ── STATUS CONFIG ──────────────────────────────────────────────────────────────
const TABLE_STATUS: Record<TableStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  FREE:     { label: 'Libre',       color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.4)',  dot: '#10b981' },
  OCCUPIED: { label: 'Ocupada',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.4)',  dot: '#3b82f6' },
  ORDERING: { label: 'Pidiendo',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.4)',  dot: '#f59e0b' },
  READY:    { label: 'Listo',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.4)',  dot: '#8b5cf6' },
  BILLING:  { label: 'Pagando',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)',   dot: '#ef4444' },
};

const ZONES = ['Salón', 'Terraza', 'Barra', 'Privado', 'Delivery'];

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
const Tables: React.FC = () => {
  const { company, branchId } = useDatabase();
  const navigate = useNavigate();
  const companyId = company?.id;

  // State
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<TableOrder[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string>('Todos');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals
  const [showTableModal, setShowTableModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [activeTable, setActiveTable] = useState<RestaurantTable | null>(null);
  const [activeOrder, setActiveOrder] = useState<TableOrder | null>(null);

  // Table form
  const [tableForm, setTableForm] = useState({ name: '', seats: 4, zone: 'Salón' });

  // Order form
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderGuests, setOrderGuests] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);

  // ── LOAD DATA ────────────────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');
    if (data) setTables(data);
  }, [companyId]);

  const loadOrders = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('table_orders')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['PENDING', 'PREPARING', 'READY', 'DELIVERED'])
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  }, [companyId]);

  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    // Use restaurant menu items, not the general inventory
    const { data } = await supabase
      .from('rest_menu_items')
      .select('id, name, price, category_id, description')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('is_available', true)
      .order('name');
    if (data) setProducts(data.map((item: any) => ({
      ...item,
      // Map category_id → category label for display grouping
      category: item.category_id || 'Menú',
    })));
  }, [companyId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadTables(), loadOrders(), loadProducts()]);
      setLoading(false);
    };
    init();
  }, [loadTables, loadOrders, loadProducts]);

  // Realtime subscription
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel('restaurant-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `company_id=eq.${companyId}` },
        () => loadTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders', filter: `company_id=eq.${companyId}` },
        () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, loadTables, loadOrders]);

  // ── HELPERS ─────────────────────────────────────────────────────────────────
  const getTableOrder = (tableId: string) =>
    orders.find(o => o.table_id === tableId && ['PENDING','PREPARING','READY'].includes(o.status));

  const getOrderTotal = (items: OrderItem[]) =>
    items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

  const timeAgo = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const zones = ['Todos', ...Array.from(new Set(tables.map(t => t.zone)))];
  const filteredTables = selectedZone === 'Todos'
    ? tables
    : tables.filter(t => t.zone === selectedZone);

  const stats = {
    free: tables.filter(t => t.status === 'FREE').length,
    occupied: tables.filter(t => t.status !== 'FREE').length,
    ready: tables.filter(t => t.status === 'READY').length,
    total: tables.length,
  };

  // ── SAVE TABLE ───────────────────────────────────────────────────────────────
  const handleSaveTable = async () => {
    if (!companyId || !tableForm.name.trim()) { toast.error('Ingresa un nombre'); return; }
    try {
      if (editingTable) {
        await supabase.from('restaurant_tables').update({ name: tableForm.name, seats: tableForm.seats, zone: tableForm.zone }).eq('id', editingTable.id);
        toast.success('Mesa actualizada');
      } else {
        await supabase.from('restaurant_tables').insert({ company_id: companyId, branch_id: branchId, name: tableForm.name, seats: tableForm.seats, zone: tableForm.zone, status: 'FREE', is_active: true });
        toast.success('Mesa creada');
      }
      setShowTableModal(false);
      setEditingTable(null);
      setTableForm({ name: '', seats: 4, zone: 'Salón' });
      loadTables();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm('¿Eliminar esta mesa?')) return;
    await supabase.from('restaurant_tables').update({ is_active: false }).eq('id', id);
    loadTables();
  };

  // ── OPEN ORDER MODAL ─────────────────────────────────────────────────────────
  const openTable = (table: RestaurantTable) => {
    setActiveTable(table);
    const existing = getTableOrder(table.id);
    if (existing) {
      setActiveOrder(existing);
      setOrderItems(existing.items || []);
      setOrderNotes(existing.notes || '');
      setOrderGuests(existing.guests || 1);
    } else {
      setActiveOrder(null);
      setOrderItems([]);
      setOrderNotes('');
      setOrderGuests(1);
    }
    setProductSearch('');
    setShowOrderModal(true);
  };

  // ── ADD / REMOVE ITEM ────────────────────────────────────────────────────────
  const addItem = (product: any) => {
    setOrderItems(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: crypto.randomUUID(),
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        price: product.price,
        notes: '',
        status: 'PENDING',
        sent_to_kitchen: false,
      }];
    });
  };

  const removeItem = (id: string) => setOrderItems(prev => prev.filter(i => i.id !== id));
  const updateQty = (id: string, delta: number) => {
    setOrderItems(prev => prev.map(i => i.id === id
      ? { ...i, quantity: Math.max(1, i.quantity + delta) }
      : i
    ).filter(i => i.quantity > 0));
  };

  // ── SAVE ORDER ───────────────────────────────────────────────────────────────
  const handleSaveOrder = async (sendToKitchen = false) => {
    if (!companyId || !activeTable || orderItems.length === 0) {
      toast.error('Agrega al menos un producto'); return;
    }
    setSavingOrder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const itemsToSave = sendToKitchen
        ? orderItems.map(i => ({ ...i, sent_to_kitchen: true, status: 'PREPARING' as const }))
        : orderItems;

      if (activeOrder) {
        // Update existing
        await supabase.from('table_orders').update({
          items: itemsToSave,
          notes: orderNotes,
          guests: orderGuests,
          status: sendToKitchen ? 'PREPARING' : activeOrder.status,
          updated_at: new Date().toISOString(),
        }).eq('id', activeOrder.id);

        // Update table status
        await supabase.from('restaurant_tables').update({
          status: sendToKitchen ? 'OCCUPIED' : 'ORDERING',
        }).eq('id', activeTable.id);

        toast.success(sendToKitchen ? '🍽️ Enviado a cocina' : 'Pedido guardado');
      } else {
        // Create new order
        const { data: newOrder } = await supabase.from('table_orders').insert({
          company_id: companyId,
          table_id: activeTable.id,
          table_name: activeTable.name,
          waiter_id: user?.id,
          status: sendToKitchen ? 'PREPARING' : 'PENDING',
          items: itemsToSave,
          notes: orderNotes,
          guests: orderGuests,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).select().single();

        // Update table status
        await supabase.from('restaurant_tables').update({
          status: sendToKitchen ? 'OCCUPIED' : 'ORDERING',
          current_order_id: newOrder?.id,
        }).eq('id', activeTable.id);

        toast.success(sendToKitchen ? '🍽️ Pedido enviado a cocina' : 'Pedido creado');
      }

      setShowOrderModal(false);
      await Promise.all([loadTables(), loadOrders()]);
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setSavingOrder(false);
    }
  };

  // ── FREE TABLE ───────────────────────────────────────────────────────────────
  const handleFreeTable = async (tableId: string, orderId?: string) => {
    if (!confirm('¿Liberar esta mesa? El pedido activo quedará como entregado.')) return;
    if (orderId) {
      await supabase.from('table_orders').update({ status: 'DELIVERED', updated_at: new Date().toISOString() }).eq('id', orderId);
    }
    await supabase.from('restaurant_tables').update({ status: 'FREE', current_order_id: null }).eq('id', tableId);
    setShowOrderModal(false);
    await Promise.all([loadTables(), loadOrders()]);
    toast.success('Mesa liberada');
  };

  // ── MARK BILLING ─────────────────────────────────────────────────────────────
  const handleMarkBilling = async (tableId: string) => {
    await supabase.from('restaurant_tables').update({ status: 'BILLING' }).eq('id', tableId);
    setShowOrderModal(false);
    loadTables();
    toast.success('Mesa marcada para cobro');
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  // Group products by category
  const productsByCategory = filteredProducts.reduce((acc: Record<string, any[]>, p) => {
    const cat = p.category || 'Menú';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Utensils size={32} className="text-blue-500 animate-pulse" />
        <p className="text-slate-500">Cargando mesas...</p>
      </div>
    </div>
  );

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Utensils size={26} className="text-blue-600" /> Gestión de Mesas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Administra pedidos y estados de las mesas en tiempo real</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => window.open('#/kitchen', '_blank')}
            className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-all">
            <ChefHat size={16} /> Pantalla Cocina
          </button>
          <button onClick={() => { setEditingTable(null); setTableForm({ name: '', seats: 4, zone: 'Salón' }); setShowTableModal(true); }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all">
            <Plus size={16} /> Nueva Mesa
          </button>
          <button onClick={() => Promise.all([loadTables(), loadOrders()])}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-all">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-all">
            {viewMode === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />}
          </button>
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total mesas',   value: stats.total,    color: '#64748b', icon: '🪑' },
          { label: 'Libres',        value: stats.free,     color: '#10b981', icon: '✅' },
          { label: 'Ocupadas',      value: stats.occupied, color: '#3b82f6', icon: '👥' },
          { label: 'Listas',        value: stats.ready,    color: '#8b5cf6', icon: '🍽️' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.icon} {s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── STATUS LEGEND ── */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TABLE_STATUS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: v.bg, color: v.color, border: `1px solid ${v.border}` }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: v.dot }} />
            {v.label}
          </span>
        ))}
      </div>

      {/* ── ZONE FILTER ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {zones.map(zone => (
          <button key={zone}
            onClick={() => setSelectedZone(zone)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              selectedZone === zone
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
            }`}>
            {zone}
          </button>
        ))}
      </div>

      {/* ── TABLES GRID ── */}
      {filteredTables.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <Utensils size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">No hay mesas en esta zona</p>
          <button onClick={() => { setTableForm({ name: '', seats: 4, zone: selectedZone === 'Todos' ? 'Salón' : selectedZone }); setShowTableModal(true); }}
            className="mt-3 text-blue-600 text-sm font-semibold hover:underline">
            + Crear primera mesa
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredTables.map(table => {
            const status = TABLE_STATUS[table.status];
            const order = getTableOrder(table.id);
            const total = order ? getOrderTotal(order.items) : 0;
            return (
              <div key={table.id}
                onClick={() => openTable(table)}
                className="relative bg-white rounded-2xl border-2 p-4 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 select-none"
                style={{ borderColor: status.border, background: status.bg }}>

                {/* Status dot */}
                <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: status.dot }} />

                {/* Edit/delete buttons (subtle) */}
                <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                  <button onClick={e => { e.stopPropagation(); setEditingTable(table); setTableForm({ name: table.name, seats: table.seats, zone: table.zone }); setShowTableModal(true); }}
                    className="p-1 bg-white/80 rounded-md hover:bg-white shadow-sm text-slate-500 hover:text-blue-600 transition-colors">
                    <Edit2 size={11} />
                  </button>
                  {table.status === 'FREE' && (
                    <button onClick={e => { e.stopPropagation(); handleDeleteTable(table.id); }}
                      className="p-1 bg-white/80 rounded-md hover:bg-white shadow-sm text-slate-500 hover:text-red-500 transition-colors">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>

                <div className="mt-1">
                  <p className="font-black text-slate-800 text-base leading-tight">{table.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{table.zone}</p>
                </div>

                <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                  <Users size={11} /> {table.seats} personas
                </div>

                <div className="mt-3 pt-2 border-t" style={{ borderColor: status.border }}>
                  <p className="text-xs font-bold" style={{ color: status.color }}>{status.label}</p>
                  {order && (
                    <>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Clock size={10} /> {timeAgo(order.created_at)}
                      </p>
                      <p className="text-sm font-black text-slate-700 mt-1">{formatCurrency(total)}</p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Mesa', 'Zona', 'Capacidad', 'Estado', 'Tiempo', 'Total', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTables.map(table => {
                const status = TABLE_STATUS[table.status];
                const order = getTableOrder(table.id);
                return (
                  <tr key={table.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => openTable(table)}>
                    <td className="px-4 py-3 font-bold text-slate-800">{table.name}</td>
                    <td className="px-4 py-3 text-slate-500">{table.zone}</td>
                    <td className="px-4 py-3 text-slate-500"><Users size={13} className="inline mr-1" />{table.seats}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: status.bg, color: status.color }}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{order ? timeAgo(order.created_at) : '—'}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{order ? formatCurrency(getOrderTotal(order.items)) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditingTable(table); setTableForm({ name: table.name, seats: table.seats, zone: table.zone }); setShowTableModal(true); }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={14} />
                        </button>
                        {table.status === 'FREE' && (
                          <button onClick={() => handleDeleteTable(table.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: CREAR / EDITAR MESA
      ════════════════════════════════════════════════════════════════════════ */}
      {showTableModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTableModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-slate-800 text-lg">{editingTable ? 'Editar Mesa' : 'Nueva Mesa'}</h3>
              <button onClick={() => setShowTableModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre *</label>
                <input value={tableForm.name} onChange={e => setTableForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Mesa 1, Barra 3, Terraza A..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Capacidad</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setTableForm(p => ({ ...p, seats: Math.max(1, p.seats - 1) }))}
                      className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center">−</button>
                    <span className="flex-1 text-center font-black text-slate-800 text-lg">{tableForm.seats}</span>
                    <button onClick={() => setTableForm(p => ({ ...p, seats: Math.min(20, p.seats + 1) }))}
                      className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg flex items-center justify-center">+</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Zona</label>
                  <select value={tableForm.zone} onChange={e => setTableForm(p => ({ ...p, zone: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTableModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button onClick={handleSaveTable}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all">
                {editingTable ? 'Guardar Cambios' : 'Crear Mesa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: PEDIDO DE MESA
      ════════════════════════════════════════════════════════════════════════ */}
      {showOrderModal && activeTable && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowOrderModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm">
                  {activeTable.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                </div>
                <div>
                  <h3 className="font-black text-slate-800">{activeTable.name}</h3>
                  <p className="text-xs text-slate-500">{activeTable.zone} · {activeTable.seats} personas</p>
                </div>
                <span className="ml-2 px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: TABLE_STATUS[activeTable.status].bg, color: TABLE_STATUS[activeTable.status].color }}>
                  {TABLE_STATUS[activeTable.status].label}
                </span>
              </div>
              <button onClick={() => setShowOrderModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={22} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

              {/* LEFT: Product catalog */}
              <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-100">
                <div className="p-3 border-b border-slate-100">
                  <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                    placeholder="🔍 Buscar plato del menú..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                  {Object.keys(productsByCategory).length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Coffee size={32} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No hay platos en el menú. Agrégalos en Display de Cocina → Menú.</p>
                    </div>
                  ) : (
                    Object.entries(productsByCategory).map(([cat, prods]) => (
                      <div key={cat}>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">{cat}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {prods.map((p: any) => (
                            <button key={p.id} onClick={() => addItem(p)}
                              className="text-left p-3 bg-slate-50 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-xl transition-all active:scale-95">
                              <p className="font-semibold text-slate-800 text-sm leading-tight">{p.name}</p>
                              <p className="text-blue-600 font-black text-sm mt-1">{formatCurrency(p.price)}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* RIGHT: Order summary */}
              <div className="w-full md:w-72 flex flex-col bg-slate-50/50">
                {/* Guests */}
                <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Users size={14} /> Comensales
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setOrderGuests(g => Math.max(1, g - 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100">−</button>
                    <span className="w-6 text-center font-black text-slate-800">{orderGuests}</span>
                    <button onClick={() => setOrderGuests(g => g + 1)}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100">+</button>
                  </div>
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {orderItems.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                      <ShoppingCart size={28} className="mx-auto mb-2 opacity-40" />
                      <p className="text-xs">Selecciona productos del menú</p>
                    </div>
                  ) : (
                    orderItems.map(item => (
                      <div key={item.id} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800 leading-tight flex-1">{item.product_name}</p>
                          <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors mt-0.5">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => updateQty(item.id, -1)}
                              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm flex items-center justify-center">−</button>
                            <span className="w-6 text-center font-black text-slate-700 text-sm">{item.quantity}</span>
                            <button onClick={() => updateQty(item.id, 1)}
                              className="w-6 h-6 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold text-sm flex items-center justify-center">+</button>
                          </div>
                          <p className="font-black text-slate-700 text-sm">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                        {item.sent_to_kitchen && (
                          <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-orange-600 font-semibold">
                            <ChefHat size={9} /> En cocina
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Notes */}
                <div className="p-3 border-t border-slate-100">
                  <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
                    placeholder="Notas para cocina..."
                    rows={2}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none resize-none focus:ring-2 focus:ring-blue-400 bg-white" />
                </div>

                {/* Total */}
                {orderItems.length > 0 && (
                  <div className="px-3 pb-2">
                    <div className="flex justify-between items-center bg-slate-800 text-white rounded-xl px-4 py-3">
                      <span className="text-sm font-semibold">Total</span>
                      <span className="font-black text-lg">{formatCurrency(getOrderTotal(orderItems))}</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="p-3 space-y-2 border-t border-slate-100">
                  <button onClick={() => handleSaveOrder(true)} disabled={savingOrder || orderItems.length === 0}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                    <ChefHat size={16} /> {savingOrder ? 'Enviando...' : 'Enviar a Cocina'}
                  </button>
                  <button onClick={() => handleSaveOrder(false)} disabled={savingOrder || orderItems.length === 0}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">
                    <Check size={14} /> Guardar Pedido
                  </button>
                  {activeOrder && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => handleMarkBilling(activeTable.id)}
                        className="py-2 bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 transition-all">
                        <Receipt size={13} /> Cobrar
                      </button>
                      <button onClick={() => handleFreeTable(activeTable.id, activeOrder?.id)}
                        className="py-2 bg-green-50 border border-green-200 hover:bg-green-100 text-green-700 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 transition-all">
                        <Check size={13} /> Liberar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tables;