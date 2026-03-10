import React, { useState, useEffect, useCallback } from 'react';
import {
  ChefHat, Clock, Check, RefreshCw, X, Bell,
  UtensilsCrossed, BookOpen, Beer, Plus, Pencil, Trash2,
  Package, AlertTriangle, ArrowDownCircle, ToggleLeft, ToggleRight,
  Save, ChevronDown, Search,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ── TYPES ──────────────────────────────────────────────────────────────────────

type OrderStatus  = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
type ItemStatus   = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED';
type MainTab      = 'kitchen' | 'menu' | 'beverages';

interface OrderItem {
  id: string; product_id: string; product_name: string;
  quantity: number; price: number; notes?: string;
  status: ItemStatus; sent_to_kitchen: boolean;
}
interface TableOrder {
  id: string; company_id: string; table_id: string; table_name: string;
  waiter_name?: string; status: OrderStatus; items: OrderItem[];
  notes?: string; guests: number; created_at: string; updated_at: string;
}
interface MenuCategory {
  id?: string; company_id?: string;
  name: string; menu_type: string; description?: string;
  icon: string; sort_order: number;
  available_from?: string; available_until?: string;
  available_days: string[]; is_active: boolean;
}
interface MenuItem {
  id?: string; company_id?: string; category_id?: string;
  category_name?: string;
  name: string; description?: string; price: number; cost: number;
  prep_time_min: number; image_url?: string;
  is_available: boolean; is_active: boolean; tags: string[];
}
interface Beverage {
  id?: string; company_id?: string;
  name: string; category: string; presentation: string;
  price: number; cost: number; stock: number; stock_min: number;
  barcode?: string; is_active: boolean;
}

// ── CONSTANTS ──────────────────────────────────────────────────────────────────

const KITCHEN_STATUS: Record<string, { label: string; bg: string; border: string; text: string; headerBg: string }> = {
  PENDING:   { label: '⏳ Nuevo',      bg: '#fff7ed', border: '#fdba74', text: '#c2410c', headerBg: '#f97316' },
  PREPARING: { label: '🔥 Preparando', bg: '#fefce8', border: '#fde047', text: '#a16207', headerBg: '#eab308' },
  READY:     { label: '✅ Listo',       bg: '#f0fdf4', border: '#86efac', text: '#15803d', headerBg: '#22c55e' },
};

const MENU_TYPES = [
  { id: 'regular',   label: 'Regular',             icon: '🍽️' },
  { id: 'ejecutivo', label: 'Almuerzo Ejecutivo',   icon: '🍱' },
  { id: 'carta',     label: 'À la Carta',           icon: '📋' },
  { id: 'rapida',    label: 'Comida Rápida',        icon: '🍔' },
  { id: 'desayuno',  label: 'Desayunos',            icon: '🍳' },
  { id: 'postre',    label: 'Postres',              icon: '🍰' },
  { id: 'otro',      label: 'Otro',                 icon: '📦' },
];

const BEV_CATEGORIES = [
  'Gaseosa', 'Jugo natural', 'Jugo industrial', 'Cerveza',
  'Agua', 'Vino', 'Bebida energizante', 'Licor', 'Otro',
];

const DAYS = ['lun','mar','mie','jue','vie','sab','dom'];
const DAY_LABELS: Record<string, string> = { lun:'L', mar:'M', mie:'X', jue:'J', vie:'V', sab:'S', dom:'D' };

const EMPTY_CAT: Omit<MenuCategory,'company_id'|'id'> = {
  name:'', menu_type:'regular', description:'', icon:'🍽️',
  sort_order:0, available_from:'', available_until:'',
  available_days: [...DAYS], is_active:true,
};
const EMPTY_ITEM: Omit<MenuItem,'company_id'|'id'> = {
  name:'', description:'', price:0, cost:0, prep_time_min:10,
  category_id:'', is_available:true, is_active:true, tags:[],
};
const EMPTY_BEV: Omit<Beverage,'company_id'|'id'> = {
  name:'', category:'Gaseosa', presentation:'350ml',
  price:0, cost:0, stock:0, stock_min:6, is_active:true,
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);

// ── COMPONENT ──────────────────────────────────────────────────────────────────

const KitchenDisplay: React.FC = () => {
  const { company } = useDatabase();
  const companyId = company?.id;

  // ── tab
  const [activeTab, setActiveTab] = useState<MainTab>('kitchen');

  // ── kitchen state
  const [orders, setOrders]         = useState<TableOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [lastUpdate, setLastUpdate]  = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [orderFilter, setOrderFilter] = useState<'ALL'|'PENDING'|'PREPARING'|'READY'>('ALL');

  // ── menu state
  const [categories, setCategories]  = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems]    = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [catSearch, setCatSearch]    = useState('');
  const [itemSearch, setItemSearch]  = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');

  // menu modals
  const [showCatModal, setShowCatModal]   = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingCat, setEditingCat]       = useState<MenuCategory | null>(null);
  const [editingItem, setEditingItem]     = useState<MenuItem | null>(null);
  const [catForm, setCatForm]             = useState<typeof EMPTY_CAT>({ ...EMPTY_CAT });
  const [itemForm, setItemForm]           = useState<typeof EMPTY_ITEM>({ ...EMPTY_ITEM });
  const [saving, setSaving]              = useState(false);

  // ── beverages state
  const [beverages, setBeverages]    = useState<Beverage[]>([]);
  const [loadingBev, setLoadingBev]  = useState(false);
  const [bevSearch, setBevSearch]    = useState('');
  const [bevCatFilter, setBevCatFilter] = useState<string>('all');
  const [showBevModal, setShowBevModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [editingBev, setEditingBev]  = useState<Beverage | null>(null);
  const [bevForm, setBevForm]        = useState<typeof EMPTY_BEV>({ ...EMPTY_BEV });
  const [stockEntry, setStockEntry]  = useState({ beverage_id:'', quantity:0, cost_unit:0, notes:'' });

  // ═══════════════════════════════════════════════════════════════════
  // KITCHEN LOGIC
  // ═══════════════════════════════════════════════════════════════════

  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }, [soundEnabled]);

  const loadOrders = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from('table_orders').select('*')
      .eq('company_id', companyId)
      .in('status', ['PENDING','PREPARING','READY'])
      .order('created_at', { ascending: true });
    if (data) {
      setOrders(prev => {
        const newIds = new Set(data.map((o: TableOrder) => o.id));
        const prevIds = new Set(prev.map(o => o.id));
        if ([...newIds].some(id => !prevIds.has(id))) playBeep();
        return data;
      });
      setLastUpdate(new Date());
    }
    setLoadingOrders(false);
  }, [companyId, playBeep]);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase.channel('kitchen-display')
      .on('postgres_changes', { event:'*', schema:'public', table:'table_orders', filter:`company_id=eq.${companyId}` }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, loadOrders]);
  useEffect(() => {
    const t = setInterval(loadOrders, 30000);
    return () => clearInterval(t);
  }, [loadOrders]);

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    await supabase.from('table_orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (newStatus === 'READY') {
      const order = orders.find(o => o.id === orderId);
      if (order) await supabase.from('restaurant_tables').update({ status:'READY' }).eq('id', order.table_id);
      toast.success('🍽️ Pedido marcado como listo');
    }
    loadOrders();
  };

  const updateItemStatus = async (orderId: string, itemId: string, newStatus: ItemStatus) => {
    const order = orders.find(o => o.id === orderId); if (!order) return;
    const updatedItems = order.items.map(i => i.id === itemId ? { ...i, status: newStatus } : i);
    const allReady = updatedItems.every(i => i.status === 'READY' || i.status === 'DELIVERED');
    await supabase.from('table_orders').update({
      items: updatedItems, status: allReady ? 'READY' : 'PREPARING', updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    if (allReady) {
      await supabase.from('restaurant_tables').update({ status:'READY' }).eq('id', order.table_id);
      toast.success(`🍽️ ${order.table_name} — todo listo!`);
    }
    loadOrders();
  };

  const timeAgo = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (m < 1) return 'Ahora mismo'; if (m < 60) return `${m} min`;
    return `${Math.floor(m/60)}h ${m%60}m`;
  };
  const timerColor = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    return m < 10 ? '#10b981' : m < 20 ? '#f59e0b' : '#ef4444';
  };

  // ═══════════════════════════════════════════════════════════════════
  // MENU LOGIC
  // ═══════════════════════════════════════════════════════════════════

  const loadMenu = useCallback(async () => {
    if (!companyId) return;
    setLoadingMenu(true);
    const [catRes, itemRes] = await Promise.all([
      supabase.from('rest_menu_categories').select('*').eq('company_id', companyId).order('sort_order'),
      supabase.from('rest_menu_items').select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
    ]);
    if (catRes.data)  setCategories(catRes.data);
    if (itemRes.data) setMenuItems(itemRes.data);
    setLoadingMenu(false);
  }, [companyId]);

  useEffect(() => { if (activeTab === 'menu') loadMenu(); }, [activeTab, loadMenu]);

  const saveCat = async () => {
    if (!companyId || !catForm.name) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    const payload = { ...catForm, company_id: companyId,
      available_from: catForm.available_from || null,
      available_until: catForm.available_until || null };
    const { error } = editingCat?.id
      ? await supabase.from('rest_menu_categories').update(payload).eq('id', editingCat.id)
      : await supabase.from('rest_menu_categories').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingCat ? 'Categoría actualizada' : 'Categoría creada ✅');
    setShowCatModal(false); setEditingCat(null); setCatForm({ ...EMPTY_CAT }); loadMenu();
  };

  const deleteCat = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría?')) return;
    await supabase.from('rest_menu_categories').update({ is_active: false }).eq('id', id);
    toast.success('Categoría eliminada'); loadMenu();
  };

  const saveItem = async () => {
    if (!companyId || !itemForm.name) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    const payload = { ...itemForm, company_id: companyId,
      category_id: itemForm.category_id || null };
    const { error } = editingItem?.id
      ? await supabase.from('rest_menu_items').update(payload).eq('id', editingItem.id)
      : await supabase.from('rest_menu_items').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingItem ? 'Plato actualizado' : 'Plato creado ✅');
    setShowItemModal(false); setEditingItem(null); setItemForm({ ...EMPTY_ITEM }); loadMenu();
  };

  const deleteItem = async (id: string) => {
    if (!confirm('¿Eliminar este plato?')) return;
    await supabase.from('rest_menu_items').update({ is_active: false }).eq('id', id);
    toast.success('Plato eliminado'); loadMenu();
  };

  const toggleItemAvailability = async (item: MenuItem) => {
    await supabase.from('rest_menu_items').update({ is_available: !item.is_available }).eq('id', item.id!);
    loadMenu();
  };

  const filteredItems = menuItems.filter(i => {
    const matchCat  = selectedCat === 'all' || i.category_id === selectedCat;
    const matchSearch = !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // ═══════════════════════════════════════════════════════════════════
  // BEVERAGES LOGIC
  // ═══════════════════════════════════════════════════════════════════

  const loadBeverages = useCallback(async () => {
    if (!companyId) return;
    setLoadingBev(true);
    const { data } = await supabase.from('rest_beverages').select('*')
      .eq('company_id', companyId).eq('is_active', true).order('name');
    if (data) setBeverages(data);
    setLoadingBev(false);
  }, [companyId]);

  useEffect(() => { if (activeTab === 'beverages') loadBeverages(); }, [activeTab, loadBeverages]);

  const saveBev = async () => {
    if (!companyId || !bevForm.name) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    const payload = { ...bevForm, company_id: companyId };
    const { error } = editingBev?.id
      ? await supabase.from('rest_beverages').update(payload).eq('id', editingBev.id)
      : await supabase.from('rest_beverages').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingBev ? 'Bebida actualizada' : 'Bebida creada ✅');
    setShowBevModal(false); setEditingBev(null); setBevForm({ ...EMPTY_BEV }); loadBeverages();
  };

  const deleteBev = async (id: string) => {
    if (!confirm('¿Eliminar esta bebida?')) return;
    await supabase.from('rest_beverages').update({ is_active: false }).eq('id', id);
    toast.success('Bebida eliminada'); loadBeverages();
  };

  const saveStockEntry = async () => {
    if (!stockEntry.beverage_id || stockEntry.quantity <= 0) {
      toast.error('Selecciona una bebida y cantidad mayor a 0'); return;
    }
    setSaving(true);
    const bev = beverages.find(b => b.id === stockEntry.beverage_id);
    const { error } = await supabase.from('rest_beverage_movements').insert({
      company_id: companyId, beverage_id: stockEntry.beverage_id,
      beverage_name: bev?.name, type: 'ENTRADA',
      quantity: stockEntry.quantity, cost_unit: stockEntry.cost_unit,
      notes: stockEntry.notes, user_name: 'Admin',
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`+${stockEntry.quantity} unidades registradas ✅`);
    setShowStockModal(false);
    setStockEntry({ beverage_id:'', quantity:0, cost_unit:0, notes:'' });
    loadBeverages();
  };

  const filteredBev = beverages.filter(b => {
    const matchCat    = bevCatFilter === 'all' || b.category === bevCatFilter;
    const matchSearch = !bevSearch || b.name.toLowerCase().includes(bevSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const lowStock = beverages.filter(b => b.stock <= b.stock_min);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════════

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1";
  const btnPrimary = "px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-sm transition-all";
  const btnSecondary = "px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition-all";

  // ── Modal wrapper ──
  const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );

  // ── counts
  const counts = {
    PENDING: orders.filter(o => o.status === 'PENDING').length,
    PREPARING: orders.filter(o => o.status === 'PREPARING').length,
    READY: orders.filter(o => o.status === 'READY').length,
  };
  const filteredOrders = orderFilter === 'ALL' ? orders : orders.filter(o => o.status === orderFilter);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily:"'DM Sans', sans-serif" }}>

      {/* ── TOP BAR ── */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <ChefHat size={22}/>
          </div>
          <div>
            <h1 className="font-black text-white text-lg leading-tight">Cocina / Restaurante</h1>
            <p className="text-slate-400 text-xs">{company?.name} · {lastUpdate.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</p>
          </div>
        </div>

        {/* ── MAIN TABS ── */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1">
          {([
            { id:'kitchen',   label:'Cocina',    icon:<UtensilsCrossed size={14}/> },
            { id:'menu',      label:'Menú',       icon:<BookOpen size={14}/> },
            { id:'beverages', label:'Bebidas',    icon:<Beer size={14}/> },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === t.id ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
              }`}>
              {t.icon}{t.label}
              {t.id === 'kitchen' && counts.PENDING > 0 &&
                <span className="bg-red-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {counts.PENDING}
                </span>
              }
              {t.id === 'beverages' && lowStock.length > 0 &&
                <span className="bg-amber-500 text-white text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {lowStock.length}
                </span>
              }
            </button>
          ))}
        </div>

        {/* Right controls — only show on kitchen tab */}
        {activeTab === 'kitchen' && (
          <div className="flex items-center gap-2">
            {(['PENDING','PREPARING','READY'] as const).map((s, i) => {
              const colors = ['#f97316','#eab308','#22c55e'];
              const labels = ['Nuevos','Preparando','Listos'];
              return (
                <button key={s} onClick={() => setOrderFilter(orderFilter === s ? 'ALL' : s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${orderFilter === s ? 'text-slate-900' : 'text-white'}`}
                  style={{ background: orderFilter === s ? colors[i] : 'rgba(255,255,255,0.08)' }}>
                  {counts[s]} {labels[i]}
                </button>
              );
            })}
            <button onClick={() => setSoundEnabled(s => !s)}
              className={`p-2 rounded-lg transition-all ${soundEnabled ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-500'}`}>
              <Bell size={18}/>
            </button>
            <button onClick={loadOrders} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all">
              <RefreshCw size={18}/>
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB: KITCHEN
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'kitchen' && (
        loadingOrders ? (
          <div className="flex flex-col items-center justify-center h-[70vh] gap-3">
            <ChefHat size={48} className="text-orange-400 animate-pulse"/>
            <p className="text-slate-400">Cargando cocina...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
            <ChefHat size={64} className="text-slate-700"/>
            <p className="text-slate-500 text-xl font-semibold">Sin pedidos activos</p>
            <p className="text-slate-600 text-sm">Los nuevos pedidos aparecerán aquí automáticamente</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.map(order => {
              const cfg = KITCHEN_STATUS[order.status] || KITCHEN_STATUS.PENDING;
              const tc  = timerColor(order.created_at);
              return (
                <div key={order.id} className="rounded-2xl overflow-hidden border shadow-lg flex flex-col"
                  style={{ background: cfg.bg, borderColor: cfg.border }}>
                  <div className="px-4 py-3 flex items-center justify-between text-white" style={{ background: cfg.headerBg }}>
                    <div>
                      <h3 className="font-black text-lg leading-tight">{order.table_name}</h3>
                      <p className="text-white/80 text-xs">{order.guests} comensal{order.guests !== 1 ? 'es' : ''}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 font-bold text-sm">
                        <Clock size={13}/>
                        <span style={{ color: tc === '#ef4444' ? '#fecaca' : '#fff' }}>{timeAgo(order.created_at)}</span>
                      </div>
                      <p className="text-white/70 text-xs">{cfg.label}</p>
                    </div>
                  </div>
                  <div className="flex-1 p-3 space-y-2">
                    {order.items.filter(i => i.sent_to_kitchen || order.status !== 'PENDING').map(item => (
                      <div key={item.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${item.status === 'READY' ? 'opacity-60' : ''}`}
                        style={{ background:'rgba(255,255,255,0.7)', borderColor:'rgba(0,0,0,0.08)' }}>
                        <div className="flex items-center gap-2.5">
                          <span className="font-black text-slate-800 text-lg w-7 text-center">{item.quantity}</span>
                          <div>
                            <p className={`font-bold text-slate-800 text-sm ${item.status==='READY'?'line-through':''}`}>{item.product_name}</p>
                            {item.notes && <p className="text-xs text-orange-600 font-medium">⚠ {item.notes}</p>}
                          </div>
                        </div>
                        <button onClick={() => updateItemStatus(order.id, item.id, item.status==='READY'?'PREPARING':'READY')}
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                            item.status==='READY' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 bg-white hover:border-green-400 text-slate-400'
                          }`}>
                          <Check size={14}/>
                        </button>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="mt-2 p-2.5 rounded-xl bg-yellow-100 border border-yellow-300">
                        <p className="text-xs font-semibold text-yellow-800">📝 {order.notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="p-3 border-t flex gap-2" style={{ borderColor: cfg.border }}>
                    {order.status === 'PENDING' && (
                      <button onClick={() => updateOrderStatus(order.id,'PREPARING')}
                        className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-bold text-sm transition-all">
                        🔥 Preparar
                      </button>
                    )}
                    {order.status === 'PREPARING' && (
                      <button onClick={() => updateOrderStatus(order.id,'READY')}
                        className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-sm transition-all">
                        ✅ Listo para entregar
                      </button>
                    )}
                    {order.status === 'READY' && (
                      <button onClick={() => updateOrderStatus(order.id,'DELIVERED')}
                        className="flex-1 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all">
                        🛎️ Entregado
                      </button>
                    )}
                    <button onClick={() => { if (confirm('¿Cancelar este pedido?')) updateOrderStatus(order.id,'CANCELLED'); }}
                      className="w-10 h-10 rounded-xl bg-white/70 border border-red-200 hover:bg-red-50 text-red-500 flex items-center justify-center transition-all">
                      <X size={15}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: MENÚ
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'menu' && (
        <div className="p-5 max-w-6xl mx-auto">

          {/* ── Categorías ── */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-black text-xl">Categorías de Menú</h2>
                <p className="text-slate-400 text-sm">Organiza por tipo de servicio y horario</p>
              </div>
              <button onClick={() => { setEditingCat(null); setCatForm({ ...EMPTY_CAT }); setShowCatModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-all">
                <Plus size={15}/> Nueva categoría
              </button>
            </div>

            {loadingMenu ? (
              <p className="text-slate-500 text-sm">Cargando...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categories.filter(c => c.is_active).map(cat => (
                  <div key={cat.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-start justify-between hover:border-orange-500/40 transition-all">
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{cat.icon}</span>
                      <div>
                        <p className="text-white font-bold text-sm">{cat.name}</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {MENU_TYPES.find(m => m.id === cat.menu_type)?.label}
                        </p>
                        {(cat.available_from || cat.available_until) && (
                          <p className="text-orange-400 text-xs mt-1">
                            🕐 {cat.available_from || '—'} → {cat.available_until || '—'}
                          </p>
                        )}
                        <div className="flex gap-0.5 mt-1.5">
                          {DAYS.map(d => (
                            <span key={d} className={`text-[10px] w-5 h-5 rounded flex items-center justify-center font-bold ${
                              cat.available_days?.includes(d) ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-500'
                            }`}>{DAY_LABELS[d]}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditingCat(cat); setCatForm({ name:cat.name, menu_type:cat.menu_type, description:cat.description||'', icon:cat.icon, sort_order:cat.sort_order, available_from:cat.available_from||'', available_until:cat.available_until||'', available_days:cat.available_days||[...DAYS], is_active:cat.is_active }); setShowCatModal(true); }}
                        className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-orange-400 transition-all">
                        <Pencil size={13}/>
                      </button>
                      <button onClick={() => deleteCat(cat.id!)}
                        className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400 transition-all">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Platos ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-black text-xl">Platos del Menú</h2>
                <p className="text-slate-400 text-sm">Activa o desactiva disponibilidad en tiempo real</p>
              </div>
              <button onClick={() => { setEditingItem(null); setItemForm({ ...EMPTY_ITEM }); setShowItemModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-all">
                <Plus size={15}/> Nuevo plato
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                <input value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                  placeholder="Buscar plato..." className="bg-slate-800 border border-slate-700 text-white text-sm pl-8 pr-3 py-2 rounded-lg focus:outline-none focus:border-orange-400 w-48"/>
              </div>
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => setSelectedCat('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedCat==='all'?'bg-orange-500 text-white':'bg-slate-800 text-slate-400 hover:text-white'}`}>
                  Todos
                </button>
                {categories.filter(c => c.is_active).map(cat => (
                  <button key={cat.id} onClick={() => setSelectedCat(cat.id!)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedCat===cat.id?'bg-orange-500 text-white':'bg-slate-800 text-slate-400 hover:text-white'}`}>
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredItems.map(item => {
                const cat = categories.find(c => c.id === item.category_id);
                return (
                  <div key={item.id} className={`bg-slate-800 border rounded-2xl p-4 transition-all ${
                    item.is_available ? 'border-slate-700 hover:border-orange-500/40' : 'border-red-900/50 opacity-60'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">{item.name}</p>
                        {cat && <p className="text-slate-500 text-xs">{cat.icon} {cat.name}</p>}
                        {item.description && <p className="text-slate-400 text-xs mt-0.5 line-clamp-1">{item.description}</p>}
                      </div>
                      <div className="flex gap-1 ml-2 shrink-0">
                        <button onClick={() => toggleItemAvailability(item)}
                          className={`p-1.5 rounded-lg transition-all ${item.is_available ? 'text-green-400 hover:bg-green-900/30' : 'text-red-400 hover:bg-red-900/30'}`}
                          title={item.is_available ? 'Deshabilitar hoy' : 'Habilitar'}>
                          {item.is_available ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                        </button>
                        <button onClick={() => { setEditingItem(item); setItemForm({ name:item.name, description:item.description||'', price:item.price, cost:item.cost, prep_time_min:item.prep_time_min, category_id:item.category_id||'', is_available:item.is_available, is_active:item.is_active, tags:item.tags||[] }); setShowItemModal(true); }}
                          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-orange-400 transition-all">
                          <Pencil size={13}/>
                        </button>
                        <button onClick={() => deleteItem(item.id!)}
                          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400 transition-all">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-orange-400 font-black text-base">{fmt(item.price)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-xs">⏱ {item.prep_time_min} min</span>
                        {!item.is_available && (
                          <span className="bg-red-900/50 text-red-400 text-xs px-2 py-0.5 rounded-full font-semibold">Agotado</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredItems.length === 0 && (
                <div className="col-span-3 text-center py-12 text-slate-500">
                  <BookOpen size={40} className="mx-auto mb-2 opacity-30"/>
                  <p>No hay platos en esta categoría</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: BEBIDAS / INVENTARIO
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'beverages' && (
        <div className="p-5 max-w-5xl mx-auto">

          {/* Alerta stock bajo */}
          {lowStock.length > 0 && (
            <div className="mb-5 bg-amber-900/40 border border-amber-700 rounded-2xl p-4 flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-400 shrink-0"/>
              <div>
                <p className="text-amber-300 font-bold text-sm">Stock bajo en {lowStock.length} bebida{lowStock.length>1?'s':''}</p>
                <p className="text-amber-400/70 text-xs">{lowStock.map(b => `${b.name} (${b.stock})`).join(' · ')}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-black text-xl">Inventario de Bebidas</h2>
              <p className="text-slate-400 text-sm">Gaseosas, cervezas, jugos y acompañantes</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setStockEntry({ beverage_id:'', quantity:0, cost_unit:0, notes:'' }); setShowStockModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-all">
                <ArrowDownCircle size={15}/> Entrada de stock
              </button>
              <button onClick={() => { setEditingBev(null); setBevForm({ ...EMPTY_BEV }); setShowBevModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-all">
                <Plus size={15}/> Nueva bebida
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
              <input value={bevSearch} onChange={e => setBevSearch(e.target.value)}
                placeholder="Buscar..." className="bg-slate-800 border border-slate-700 text-white text-sm pl-8 pr-3 py-2 rounded-lg focus:outline-none focus:border-orange-400 w-44"/>
            </div>
            <div className="flex gap-1 flex-wrap">
              <button onClick={() => setBevCatFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${bevCatFilter==='all'?'bg-orange-500 text-white':'bg-slate-800 text-slate-400 hover:text-white'}`}>
                Todas
              </button>
              {BEV_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setBevCatFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${bevCatFilter===cat?'bg-orange-500 text-white':'bg-slate-800 text-slate-400 hover:text-white'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Beverages grid */}
          {loadingBev ? (
            <p className="text-slate-500 text-sm">Cargando...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredBev.map(bev => {
                const isLow = bev.stock <= bev.stock_min;
                return (
                  <div key={bev.id} className={`bg-slate-800 rounded-2xl p-4 border transition-all ${
                    isLow ? 'border-amber-700/60' : 'border-slate-700 hover:border-orange-500/40'
                  }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-white font-bold text-sm">{bev.name}</p>
                        <p className="text-slate-400 text-xs">{bev.category} · {bev.presentation}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingBev(bev); setBevForm({ name:bev.name, category:bev.category, presentation:bev.presentation, price:bev.price, cost:bev.cost, stock:bev.stock, stock_min:bev.stock_min, barcode:bev.barcode||'', is_active:bev.is_active }); setShowBevModal(true); }}
                          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-orange-400 transition-all">
                          <Pencil size={13}/>
                        </button>
                        <button onClick={() => deleteBev(bev.id!)}
                          className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400 transition-all">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`font-black text-2xl ${isLow ? 'text-amber-400' : 'text-white'}`}>{bev.stock}</span>
                          <span className="text-slate-500 text-xs">uds</span>
                        </div>
                        <div className="w-28 bg-slate-700 rounded-full h-1.5 mt-1">
                          <div className={`h-1.5 rounded-full transition-all ${isLow?'bg-amber-500':'bg-green-500'}`}
                            style={{ width: `${Math.min(100, (bev.stock / Math.max(bev.stock_min * 2, 1)) * 100)}%` }}/>
                        </div>
                        {isLow && <p className="text-amber-400 text-[10px] mt-0.5 font-semibold">⚠ Stock bajo (mín {bev.stock_min})</p>}
                      </div>
                      <span className="text-orange-400 font-bold text-sm">{fmt(bev.price)}</span>
                    </div>
                  </div>
                );
              })}
              {filteredBev.length === 0 && (
                <div className="col-span-3 text-center py-12 text-slate-500">
                  <Beer size={40} className="mx-auto mb-2 opacity-30"/>
                  <p>No hay bebidas registradas</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════════ */}

      {/* ── Categoría modal ── */}
      {showCatModal && (
        <Modal title={editingCat ? 'Editar categoría' : 'Nueva categoría de menú'} onClose={() => setShowCatModal(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Nombre *</label>
              <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Ej: Almuerzo Ejecutivo"/>
            </div>
            <div>
              <label className={labelCls}>Tipo de menú</label>
              <select value={catForm.menu_type} onChange={e => setCatForm(f => ({ ...f, menu_type: e.target.value }))} className={inputCls}>
                {MENU_TYPES.map(m => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Emoji / Ícono</label>
              <input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} className={inputCls} placeholder="🍽️"/>
            </div>
            <div>
              <label className={labelCls}>Disponible desde</label>
              <input type="time" value={catForm.available_from} onChange={e => setCatForm(f => ({ ...f, available_from: e.target.value }))} className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>Disponible hasta</label>
              <input type="time" value={catForm.available_until} onChange={e => setCatForm(f => ({ ...f, available_until: e.target.value }))} className={inputCls}/>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Días disponibles</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(d => (
                  <button key={d} type="button"
                    onClick={() => setCatForm(f => ({ ...f, available_days: f.available_days.includes(d) ? f.available_days.filter(x => x !== d) : [...f.available_days, d] }))}
                    className={`w-9 h-9 rounded-lg text-xs font-bold border transition-all ${catForm.available_days.includes(d) ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Descripción (opcional)</label>
              <input value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Incluye sopa, principio, proteína..."/>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveCat} disabled={saving} className={btnPrimary}>
              {saving ? 'Guardando...' : <><Save size={14} className="inline mr-1"/>Guardar</>}
            </button>
            <button onClick={() => setShowCatModal(false)} className={btnSecondary}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* ── Plato modal ── */}
      {showItemModal && (
        <Modal title={editingItem ? 'Editar plato' : 'Nuevo plato'} onClose={() => setShowItemModal(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Nombre del plato *</label>
              <input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Ej: Bandeja Paisa"/>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Categoría</label>
              <select value={itemForm.category_id} onChange={e => setItemForm(f => ({ ...f, category_id: e.target.value }))} className={inputCls}>
                <option value="">Sin categoría</option>
                {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Precio de venta</label>
              <input type="number" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: +e.target.value }))} className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>Costo</label>
              <input type="number" value={itemForm.cost} onChange={e => setItemForm(f => ({ ...f, cost: +e.target.value }))} className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>Tiempo preparación (min)</label>
              <input type="number" value={itemForm.prep_time_min} onChange={e => setItemForm(f => ({ ...f, prep_time_min: +e.target.value }))} className={inputCls}/>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" id="available" checked={itemForm.is_available} onChange={e => setItemForm(f => ({ ...f, is_available: e.target.checked }))} className="rounded"/>
              <label htmlFor="available" className="text-sm text-slate-700 font-medium">Disponible hoy</label>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Descripción</label>
              <textarea value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} className={inputCls + ' resize-none'} rows={2} placeholder="Ingredientes, presentación..."/>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveItem} disabled={saving} className={btnPrimary}>
              {saving ? 'Guardando...' : <><Save size={14} className="inline mr-1"/>Guardar</>}
            </button>
            <button onClick={() => setShowItemModal(false)} className={btnSecondary}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* ── Bebida modal ── */}
      {showBevModal && (
        <Modal title={editingBev ? 'Editar bebida' : 'Nueva bebida'} onClose={() => setShowBevModal(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Nombre *</label>
              <input value={bevForm.name} onChange={e => setBevForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Ej: Coca-Cola"/>
            </div>
            <div>
              <label className={labelCls}>Categoría</label>
              <select value={bevForm.category} onChange={e => setBevForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                {BEV_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Presentación</label>
              <input value={bevForm.presentation} onChange={e => setBevForm(f => ({ ...f, presentation: e.target.value }))} className={inputCls} placeholder="350ml, Botella..."/>
            </div>
            <div>
              <label className={labelCls}>Precio de venta</label>
              <input type="number" value={bevForm.price} onChange={e => setBevForm(f => ({ ...f, price: +e.target.value }))} className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>Costo</label>
              <input type="number" value={bevForm.cost} onChange={e => setBevForm(f => ({ ...f, cost: +e.target.value }))} className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>Stock inicial</label>
              <input type="number" value={bevForm.stock} onChange={e => setBevForm(f => ({ ...f, stock: +e.target.value }))} className={inputCls}/>
            </div>
            <div>
              <label className={labelCls}>Stock mínimo (alerta)</label>
              <input type="number" value={bevForm.stock_min} onChange={e => setBevForm(f => ({ ...f, stock_min: +e.target.value }))} className={inputCls}/>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveBev} disabled={saving} className={btnPrimary}>
              {saving ? 'Guardando...' : <><Save size={14} className="inline mr-1"/>Guardar</>}
            </button>
            <button onClick={() => setShowBevModal(false)} className={btnSecondary}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* ── Entrada de stock modal ── */}
      {showStockModal && (
        <Modal title="Entrada de stock — Bebidas" onClose={() => setShowStockModal(false)}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Bebida *</label>
              <select value={stockEntry.beverage_id} onChange={e => setStockEntry(s => ({ ...s, beverage_id: e.target.value }))} className={inputCls}>
                <option value="">Seleccionar...</option>
                {beverages.map(b => <option key={b.id} value={b.id}>{b.name} — {b.category} ({b.presentation}) · Stock actual: {b.stock}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Cantidad a ingresar *</label>
                <input type="number" min="1" value={stockEntry.quantity} onChange={e => setStockEntry(s => ({ ...s, quantity: +e.target.value }))} className={inputCls}/>
              </div>
              <div>
                <label className={labelCls}>Costo unitario</label>
                <input type="number" value={stockEntry.cost_unit} onChange={e => setStockEntry(s => ({ ...s, cost_unit: +e.target.value }))} className={inputCls}/>
              </div>
            </div>
            <div>
              <label className={labelCls}>Observación</label>
              <input value={stockEntry.notes} onChange={e => setStockEntry(s => ({ ...s, notes: e.target.value }))} className={inputCls} placeholder="Proveedor, # factura compra..."/>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveStockEntry} disabled={saving} className={btnPrimary}>
              {saving ? 'Guardando...' : <><ArrowDownCircle size={14} className="inline mr-1"/>Registrar entrada</>}
            </button>
            <button onClick={() => setShowStockModal(false)} className={btnSecondary}>Cancelar</button>
          </div>
        </Modal>
      )}

    </div>
  );
};

export default KitchenDisplay;