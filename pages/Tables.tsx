import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, Users, Clock, ChefHat, Receipt,
  LayoutGrid, List, RefreshCw, Utensils, X, Check,
  AlertCircle, Printer, ShoppingCart, Coffee,
  Bell, MapPin, Phone, Bike, Car, DollarSign,
  CreditCard, Smartphone, Building2, ArrowRight,
  QrCode, MessageSquare, Zap, User, Beer, Pizza,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────
type TableStatus = 'FREE' | 'OCCUPIED' | 'ORDERING' | 'READY' | 'BILLING';
type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
type OrderType   = 'MESA' | 'DOMICILIO' | 'PARA_LLEVAR' | 'DRIVE_THRU';
type PayMethod   = 'CASH' | 'CARD' | 'TRANSFER' | 'NEQUI' | 'DAVIPLATA';

interface RestaurantTable {
  id: string; company_id: string; branch_id?: string;
  name: string; seats: number; zone: string;
  status: TableStatus; current_order_id?: string;
  position_x?: number; position_y?: number; is_active: boolean;
}

interface TableOrder {
  id: string; company_id: string; table_id: string; table_name: string;
  waiter_id?: string; waiter_name?: string; status: OrderStatus;
  items: OrderItem[]; notes?: string; guests: number;
  created_at: string; updated_at: string; invoice_id?: string;
}

interface OrderItem {
  id: string; product_id: string; product_name: string;
  quantity: number; price: number; notes?: string;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED';
  sent_to_kitchen: boolean;
}

// ── STATUS CONFIG ──────────────────────────────────────────────────────────────
const TABLE_STATUS: Record<TableStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  FREE:     { label: 'Libre',    color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.4)',  dot: '#10b981' },
  OCCUPIED: { label: 'Ocupada', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.4)',  dot: '#3b82f6' },
  ORDERING: { label: 'Pidiendo',color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.4)',  dot: '#f59e0b' },
  READY:    { label: 'Listo',   color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.4)',  dot: '#8b5cf6' },
  BILLING:  { label: 'Pagando', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)',   dot: '#ef4444' },
};

const ORDER_TYPE_CFG: Record<OrderType, { label: string; icon: React.ReactNode; color: string }> = {
  MESA:       { label: 'Mesa',        icon: <Utensils size={16} />,  color: '#3b82f6' },
  DOMICILIO:  { label: 'Domicilio',   icon: <Bike size={16} />,      color: '#10b981' },
  PARA_LLEVAR:{ label: 'Para llevar', icon: <ShoppingCart size={16} />, color: '#f59e0b' },
  DRIVE_THRU: { label: 'Drive-thru',  icon: <Car size={16} />,       color: '#8b5cf6' },
};

const PAY_METHODS: { key: PayMethod; label: string; icon: React.ReactNode }[] = [
  { key: 'CASH',      label: 'Efectivo',     icon: <DollarSign size={15} /> },
  { key: 'CARD',      label: 'Tarjeta',      icon: <CreditCard size={15} /> },
  { key: 'TRANSFER',  label: 'Transferencia',icon: <Building2 size={15} /> },
  { key: 'NEQUI',     label: 'Nequi',        icon: <Smartphone size={15} /> },
  { key: 'DAVIPLATA', label: 'Daviplata',    icon: <Smartphone size={15} /> },
];

const ZONES = ['Salón', 'Terraza', 'Barra', 'Privado', 'Delivery'];

// ── SOUND HELPER ──────────────────────────────────────────────────────────────
function playReadySound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.25, 0.5].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 660 + i * 110;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  } catch {}
}

function vibrateDevice(pattern: number[]) {
  try { if ('vibrate' in navigator) navigator.vibrate(pattern); } catch {}
}

// ── PAYMENT MODAL ─────────────────────────────────────────────────────────────
interface PaymentModalProps {
  table: RestaurantTable;
  order: TableOrder;
  company: any;
  companyId: string;
  branchId: string | null;
  session: any;
  onClose: () => void;
  onSuccess: () => void;
  navigate: (path: string) => void;
  formatCurrency: (v: number) => string;
}

const TablePaymentModal: React.FC<PaymentModalProps> = ({
  table, order, company, companyId, branchId, session,
  onClose, onSuccess, navigate, formatCurrency,
}) => {
  const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);

  const [orderType,   setOrderType]   = useState<OrderType>('MESA');
  const [payMethod,   setPayMethod]   = useState<PayMethod>('CASH');
  const [customerName, setCustomerName] = useState('');
  const [customerDoc,  setCustomerDoc]  = useState('');
  const [customerPhone,setCustomerPhone]= useState('');
  const [address,      setAddress]      = useState('');
  const [saving,       setSaving]       = useState(false);
  const [amountPaid,   setAmountPaid]   = useState(String(total));

  const handlePay = async () => {
    setSaving(true);
    try {
      const ts     = Date.now().toString().slice(-6);
      const rnd    = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      const invNum = `REST-${ts}${rnd}`;

      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          company_id:     companyId,
          branch_id:      branchId,
          invoice_number: invNum,
          customer_id:    null,
          subtotal:       total,
          tax_amount:     0,
          total_amount:   total,
          status:         'COMPLETED',
          business_type:  null,
          payment_method: {
            method:            payMethod,
            amount:            parseFloat(amountPaid) || total,
            customer_name:     customerName || `${ORDER_TYPE_CFG[orderType].label} — ${table.name}`,
            customer_document: customerDoc  || null,
            customer_phone:    customerPhone|| null,
            payment_status:    'PAID',
            order_type:        orderType,
            table_name:        table.name,
            delivery_address:  address || null,
            balance_due:       0,
          },
        })
        .select().single();

      if (invErr) throw invErr;

      const itemsToInsert = order.items.map(i => ({
        invoice_id:  invoice.id,
        product_id:  null,
        description: i.product_name,
        quantity:    i.quantity,
        price:       i.price,
        tax_rate:    0,
      }));
      await supabase.from('invoice_items').insert(itemsToInsert);

      await supabase.from('table_orders')
        .update({ status: 'DELIVERED', invoice_id: invoice.id, updated_at: new Date().toISOString() })
        .eq('id', order.id);

      await supabase.from('restaurant_tables')
        .update({ status: 'FREE', current_order_id: null })
        .eq('id', table.id);

      if (session?.id) {
        const field = payMethod === 'CASH' ? 'total_sales_cash' : 'total_sales_card';
        await supabase.from('cash_register_sessions')
          .update({ [field]: ((session as any)[field] || 0) + total })
          .eq('id', session.id);
      }

      toast.success(`✅ Factura ${invNum} generada — Mesa liberada`);
      onSuccess();

    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGoToPOS = () => {
    sessionStorage.setItem('pos_preload_table', JSON.stringify({
      tableId:   table.id,
      tableName: table.name,
      orderId:   order.id,
      items:     order.items.map(i => ({
        product: { id: `table-${i.product_id}`, name: i.product_name, price: i.price, type: 'SERVICE' },
        quantity: i.quantity,
        price:    i.price,
      })),
    }));
    navigate('/pos');
    onClose();
  };

  const needsAddress = orderType === 'DOMICILIO' || orderType === 'DRIVE_THRU';

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[95vh] flex flex-col">

        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-black text-lg flex items-center gap-2">
              <Receipt size={20} /> Cobrar — {table.name}
            </h3>
            <p className="text-slate-300 text-sm mt-0.5">{order.items.length} productos · {formatCurrency(total)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Resumen del pedido</p>
            <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-slate-700">
                    <span className="font-bold text-slate-400 mr-2">x{item.quantity}</span>
                    {item.product_name}
                  </span>
                  <span className="font-bold text-slate-800">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center px-4 py-3 bg-slate-100 rounded-b-xl">
                <span className="font-black text-slate-800">TOTAL</span>
                <span className="font-black text-xl text-slate-900">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tipo de pedido</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(ORDER_TYPE_CFG) as [OrderType, typeof ORDER_TYPE_CFG[OrderType]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => setOrderType(key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    orderType === key
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Datos del cliente</p>
            <div className="space-y-2">
              <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              <div className="grid grid-cols-2 gap-2">
                <input value={customerDoc} onChange={e => setCustomerDoc(e.target.value)}
                  placeholder="Cédula / NIT"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="Teléfono"
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              {needsAddress && (
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input value={address} onChange={e => setAddress(e.target.value)}
                    placeholder="Dirección de entrega"
                    className="w-full pl-8 border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Método de pago</p>
            <div className="grid grid-cols-2 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.key} onClick={() => setPayMethod(m.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    payMethod === m.key
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {payMethod === 'CASH' && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Monto recibido</p>
              <input
                type="number"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-lg font-bold outline-none focus:ring-2 focus:ring-blue-400"
              />
              {parseFloat(amountPaid) > total && (
                <p className="text-sm text-emerald-600 font-bold mt-1 text-right">
                  Cambio: {formatCurrency(parseFloat(amountPaid) - total)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 space-y-2">
          <button onClick={handlePay} disabled={saving}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-base disabled:opacity-50 flex items-center justify-center gap-2">
            {saving
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
              : <><Check size={18} /> Cobrar {formatCurrency(total)}</>}
          </button>
          <button onClick={handleGoToPOS}
            className="w-full py-2.5 border border-slate-300 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 flex items-center justify-center gap-2">
            <ArrowRight size={15} /> Ir al POS con este pedido
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const Tables: React.FC = () => {
  const { company, branchId, session } = useDatabase();
  const navigate = useNavigate();
  const companyId = company?.id;

  const [tables, setTables]   = useState<RestaurantTable[]>([]);
  const [orders, setOrders]   = useState<TableOrder[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string>('Todos');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [showTableModal, setShowTableModal]   = useState(false);
  const [showOrderModal, setShowOrderModal]   = useState(false);
  const [showPayModal,   setShowPayModal]     = useState(false);
  const [editingTable,   setEditingTable]     = useState<RestaurantTable | null>(null);
  const [activeTable,    setActiveTable]      = useState<RestaurantTable | null>(null);
  const [activeOrder,    setActiveOrder]      = useState<TableOrder | null>(null);

  const [tableForm, setTableForm] = useState({ name: '', seats: 4, zone: 'Salón' });

  const [orderItems,     setOrderItems]   = useState<OrderItem[]>([]);
  const [orderNotes,     setOrderNotes]   = useState('');
  const [orderGuests,    setOrderGuests]  = useState(1);
  const [productSearch,  setProductSearch]= useState('');
  const [savingOrder,    setSavingOrder]  = useState(false);

  const [catalogTab,    setCatalogTab]    = useState<'platos' | 'bebidas' | 'pizzas'>('platos');
  const [beverages,     setBeverages]     = useState<any[]>([]);
  const [pizzaSummary,  setPizzaSummary]  = useState<any[]>([]);
  const [selectedPizzaSlices, setSelectedPizzaSlices] = useState<Record<string, number[]>>({});

  const prevReadyTablesRef = useRef<Set<string>>(new Set());

  const [quickNotesByCategory, setQuickNotesByCategory] = useState<Record<string, string[]>>({});
  const [waiterColor, setWaiterColor] = useState<string>('#3b82f6');
  const [waiterId, setWaiterId]       = useState<string | null>(null);
  const [editingItemNote, setEditingItemNote] = useState<{ itemId: string; currentNote: string } | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [menuCategories, setMenuCategories] = useState<{id: string; name: string; quick_notes: string[]}[]>([]);

  // ── CUSTOM PIZZA STATE ───────────────────────────────────────────────────────
  const [showCustomPizzaModal, setShowCustomPizzaModal] = useState(false);
  const [customPizzaForm, setCustomPizzaForm] = useState({
    slices: 8,
    isHalf: false,
    flavorA: '',
    flavorB: '',
    price: 0,
    quantity: 1,
    notes: '',
  });

  // ── LOAD DATA ────────────────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('restaurant_tables').select('*')
      .eq('company_id', companyId).eq('is_active', true).order('name');
    if (data) {
      const newReadyTables = new Set(
        data.filter((t: RestaurantTable) => t.status === 'READY').map((t: RestaurantTable) => t.id)
      );
      const prev = prevReadyTablesRef.current;
      const justReady = [...newReadyTables].filter(id => !prev.has(id));

      if (justReady.length > 0) {
        const tableNames = data
          .filter((t: RestaurantTable) => justReady.includes(t.id))
          .map((t: RestaurantTable) => t.name)
          .join(', ');

        playReadySound();
        vibrateDevice([200, 100, 200, 100, 400]);
        toast(
          (t) => (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Bell size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="font-black text-slate-800">¡Pedido listo!</p>
                <p className="text-sm text-slate-600">{tableNames} — listo para servir</p>
              </div>
            </div>
          ),
          {
            duration: 8000,
            style: {
              background: '#f5f3ff',
              border: '2px solid #8b5cf6',
              padding: '12px',
              borderRadius: '16px',
            },
          }
        );
      }

      prevReadyTablesRef.current = newReadyTables;
      setTables(data);
    }
  }, [companyId]);

  const loadOrders = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('table_orders').select('*')
      .eq('company_id', companyId)
      .in('status', ['PENDING', 'PREPARING', 'READY', 'DELIVERED'])
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  }, [companyId]);

  const loadProducts = useCallback(async () => {
    if (!companyId) return;
    const { data: cats } = await supabase
      .from('rest_menu_categories').select('id, name')
      .eq('company_id', companyId).eq('is_active', true);
    const catMap: Record<string, string> = {};
    (cats || []).forEach((c: any) => { catMap[c.id] = c.name; });

    const { data } = await supabase
      .from('rest_menu_items').select('id, name, price, category_id, description')
      .eq('company_id', companyId).eq('is_active', true).eq('is_available', true).order('name');
    if (data) setProducts(data.map((item: any) => ({
      ...item,
      category: catMap[item.category_id] || 'Menú',
    })));

    const { data: bevs } = await supabase
      .from('rest_beverages').select('id, name, category, presentation, price, stock')
      .eq('company_id', companyId).eq('is_active', true).gt('stock', 0).order('name');
    setBeverages(bevs || []);

    try {
      const { data: pizzas } = await supabase
        .from('pizza_stock_summary').select('*')
        .eq('company_id', companyId).gt('slices_available', 0);
      setPizzaSummary(pizzas || []);
    } catch {
      setPizzaSummary([]);
    }
  }, [companyId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadTables(), loadOrders(), loadProducts()]);
      setLoading(false);
    };
    init();
  }, [loadTables, loadOrders, loadProducts]);

  useEffect(() => {
    if (!companyId) return;
    supabase.from('rest_menu_categories')
      .select('id, name, quick_notes')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) {
          setMenuCategories(data.map((c: any) => ({
            id: c.id, name: c.name, quick_notes: c.quick_notes || [],
          })));
          const map: Record<string, string[]> = {};
          data.forEach((c: any) => { map[c.id] = c.quick_notes || []; });
          setQuickNotesByCategory(map);
        }
      });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setWaiterId(user.id);
      supabase.from('profiles').select('waiter_color')
        .eq('id', user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.waiter_color) setWaiterColor(data.waiter_color);
        });
    });
  }, [companyId]);

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

  const getQuickNotesForProduct = (productId: string): string[] => {
    const product = products.find(p => p.id === productId);
    if (!product?.category_id) return [];
    return quickNotesByCategory[product.category_id] || [];
  };

  const setItemNote = (itemId: string, note: string) => {
    setOrderItems(prev => prev.map(i => i.id === itemId ? { ...i, notes: note } : i));
    setEditingItemNote(null);
  };

  const waiterQrUrl = companyId
    ? `${window.location.origin}${window.location.pathname}#/kiosk/${companyId}`
    : '';

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

  const timeAgo = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const zones = ['Todos', ...Array.from(new Set(tables.map(t => t.zone)))];
  const filteredTables = selectedZone === 'Todos' ? tables : tables.filter(t => t.zone === selectedZone);

  const stats = {
    free:     tables.filter(t => t.status === 'FREE').length,
    occupied: tables.filter(t => t.status !== 'FREE').length,
    ready:    tables.filter(t => t.status === 'READY').length,
    total:    tables.length,
  };

  // ── PIZZA STOCK HELPERS ──────────────────────────────────────────────────────
  /**
   * Extrae el pizza_type_id de un product_id de pizza.
   * Formato: "pizza-{typeId}-slice" o "pizza-{typeId}-whole"
   */
  const extractPizzaTypeId = (productId: string): string | null => {
    if (!productId.startsWith('pizza-')) return null;
    const withoutPrefix = productId.slice('pizza-'.length); // "{typeId}-slice" o "{typeId}-whole"
    if (withoutPrefix.endsWith('-slice')) return withoutPrefix.slice(0, -'-slice'.length);
    if (withoutPrefix.endsWith('-whole')) return withoutPrefix.slice(0, -'-whole'.length);
    return null;
  };

  /**
   * Devuelve N porciones al stock de pizza cuando se cancela/elimina un ítem.
   * Solo actúa si el producto_id termina en "-slice".
   */
  const returnPizzaSlicesToStock = useCallback(async (item: OrderItem) => {
    if (!item.product_id.startsWith('pizza-') || !item.product_id.endsWith('-slice')) return;
    const typeId = extractPizzaTypeId(item.product_id);
    if (!typeId) return;

    const qty = item.quantity;
    const { data: openRows } = await supabase
      .from('pizza_stock').select('id, slices_sold')
      .eq('pizza_type_id', typeId).eq('status', 'OPEN')
      .order('opened_at').limit(1);

    if (openRows?.[0]) {
      const newSold = Math.max(0, openRows[0].slices_sold - qty);
      await supabase.from('pizza_stock')
        .update({ slices_sold: newSold })
        .eq('id', openRows[0].id);
    }

    // Refrescar resumen visual
    try {
      const { data: updated } = await supabase
        .from('pizza_stock_summary').select('*')
        .eq('company_id', companyId).gt('slices_available', 0);
      setPizzaSummary(updated || []);
    } catch { /* ok */ }
  }, [companyId]);

  // ── CUSTOM PIZZA HANDLER ────────────────────────────────────────────────────
  const handleAddCustomPizza = () => {
    const { slices, isHalf, flavorA, flavorB, price, quantity, notes } = customPizzaForm;
    if (!flavorA.trim()) { toast.error('Escribe el sabor de la pizza'); return; }
    if (price <= 0) { toast.error('Ingresa el precio'); return; }

    const name = isHalf
      ? `🍕 Pizza ${slices}p — ${flavorA.trim()} / ${flavorB.trim() || '?'}`
      : `🍕 Pizza ${slices}p — ${flavorA.trim()}`;

    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      product_id: `custom-pizza-${Date.now()}`,
      product_name: name,
      quantity,
      price,
      notes: notes.trim() || undefined,
      status: 'PENDING',
      sent_to_kitchen: false,
    };

    setOrderItems(prev => [...prev, newItem]);
    setShowCustomPizzaModal(false);
    setCustomPizzaForm({ slices: 8, isHalf: false, flavorA: '', flavorB: '', price: 0, quantity: 1, notes: '' });
    toast.success(name);
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
      setShowTableModal(false); setEditingTable(null);
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
  const openTable = async (table: RestaurantTable) => {
    setActiveTable(table);
    const existing = getTableOrder(table.id);
    if (existing) {
      setActiveOrder(existing);
      setOrderItems(existing.items || []);
      setOrderNotes(existing.notes || '');
      setOrderGuests(existing.guests || 1);
    } else {
      setActiveOrder(null); setOrderItems([]);
      setOrderNotes(''); setOrderGuests(1);
    }
    setProductSearch('');
    setCatalogTab('platos');
    setSelectedPizzaSlices({});
    await loadProducts();
    setShowOrderModal(true);
  };

  // ── ADD ITEM ─────────────────────────────────────────────────────────────────
  const addItem = (product: any) => {
    setOrderItems(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: crypto.randomUUID(), product_id: product.id, product_name: product.name, quantity: 1, price: product.price, notes: '', status: 'PENDING', sent_to_kitchen: false }];
    });
  };

  const addBeverage = (bev: any) => {
    const id = `bev-${bev.id}`;
    setOrderItems(prev => {
      const existing = prev.find(i => i.product_id === id);
      if (existing) return prev.map(i => i.product_id === id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: crypto.randomUUID(), product_id: id, product_name: `🥤 ${bev.name} (${bev.presentation})`, quantity: 1, price: bev.price, notes: '', status: 'PENDING', sent_to_kitchen: false }];
    });
  };

  const handleAddPizzaToOrder = async (pizza: any, qty: number, type: 'whole' | 'slice', indices: number[]) => {
    const unitPrice = type === 'whole' ? pizza.price : pizza.price_per_slice;
    const name = type === 'whole'
      ? `🍕 ${pizza.name} — completa`
      : `🍕 ${pizza.name} × ${qty} porción${qty > 1 ? 'es' : ''}`;
    const id = `pizza-${pizza.pizza_type_id}-${type}`;
    setOrderItems(prev => {
      const existing = prev.find(i => i.product_id === id);
      if (existing) return prev.map(i => i.product_id === id ? { ...i, quantity: i.quantity + (type === 'whole' ? 1 : qty) } : i);
      return [...prev, { id: crypto.randomUUID(), product_id: id, product_name: name, quantity: type === 'whole' ? 1 : qty, price: unitPrice, notes: '', status: 'PENDING', sent_to_kitchen: false }];
    });

    // Descontar stock en pizza_stock (solo para porciones)
    if (type === 'slice') {
      const { data: openRows } = await supabase
        .from('pizza_stock').select('id, slices_sold')
        .eq('pizza_type_id', pizza.pizza_type_id).eq('status', 'OPEN')
        .order('opened_at').limit(1);
      if (openRows && openRows[0]) {
        await supabase.from('pizza_stock')
          .update({ slices_sold: openRows[0].slices_sold + qty })
          .eq('id', openRows[0].id);
      }
    }

    setSelectedPizzaSlices(prev => ({ ...prev, [pizza.pizza_type_id]: [] }));

    // Refrescar resumen de pizzas
    const { data: updated } = await supabase
      .from('pizza_stock_summary').select('*')
      .eq('company_id', companyId).gt('slices_available', 0);
    setPizzaSummary(updated || []);
    toast.success(name);
  };

  // ── REMOVE / UPDATE ITEM (con devolución de stock de pizza) ──────────────────
  const removeItem = async (id: string) => {
    const item = orderItems.find(i => i.id === id);
    if (item) {
      // Si es una porción de pizza, devolver stock antes de eliminar
      await returnPizzaSlicesToStock(item);
    }
    setOrderItems(prev => prev.filter(i => i.id !== id));
  };

  const updateQty = async (id: string, delta: number) => {
    const item = orderItems.find(i => i.id === id);

    // Si la cantidad va a llegar a 0, eliminar con devolución de stock
    if (item && item.quantity + delta <= 0) {
      await removeItem(id);
      return;
    }

    // Si es porción de pizza y se reduce cantidad, devolver las porciones quitadas
    if (item && delta < 0 && item.product_id?.startsWith('pizza-') && item.product_id.endsWith('-slice')) {
      const typeId = extractPizzaTypeId(item.product_id);
      if (typeId) {
        const { data: openRows } = await supabase
          .from('pizza_stock').select('id, slices_sold')
          .eq('pizza_type_id', typeId).eq('status', 'OPEN')
          .order('opened_at').limit(1);
        if (openRows?.[0]) {
          const newSold = Math.max(0, openRows[0].slices_sold + delta); // delta es negativo
          await supabase.from('pizza_stock')
            .update({ slices_sold: newSold })
            .eq('id', openRows[0].id);
          // Refrescar resumen
          try {
            const { data: updated } = await supabase
              .from('pizza_stock_summary').select('*')
              .eq('company_id', companyId).gt('slices_available', 0);
            setPizzaSummary(updated || []);
          } catch { /* ok */ }
        }
      }
    }

    // Si es porción de pizza y se aumenta cantidad, descontar la porción adicional
    if (item && delta > 0 && item.product_id?.startsWith('pizza-') && item.product_id.endsWith('-slice')) {
      const typeId = extractPizzaTypeId(item.product_id);
      if (typeId) {
        const { data: openRows } = await supabase
          .from('pizza_stock').select('id, slices_sold')
          .eq('pizza_type_id', typeId).eq('status', 'OPEN')
          .order('opened_at').limit(1);
        if (openRows?.[0]) {
          await supabase.from('pizza_stock')
            .update({ slices_sold: openRows[0].slices_sold + delta })
            .eq('id', openRows[0].id);
          try {
            const { data: updated } = await supabase
              .from('pizza_stock_summary').select('*')
              .eq('company_id', companyId).gt('slices_available', 0);
            setPizzaSummary(updated || []);
          } catch { /* ok */ }
        }
      }
    }

    setOrderItems(prev =>
      prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)
    );
  };

  // ── SAVE ORDER ───────────────────────────────────────────────────────────────
  const handleSaveOrder = async (sendToKitchen = false) => {
    if (!companyId || !activeTable || orderItems.length === 0) { toast.error('Agrega al menos un producto'); return; }
    setSavingOrder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const itemsToSave = sendToKitchen
        ? orderItems.map(i => ({ ...i, sent_to_kitchen: true, status: 'PREPARING' as const }))
        : orderItems;

      if (activeOrder) {
        await supabase.from('table_orders').update({
          items: itemsToSave, notes: orderNotes, guests: orderGuests,
          status: sendToKitchen ? 'PREPARING' : activeOrder.status,
          updated_at: new Date().toISOString(),
        }).eq('id', activeOrder.id);
        await supabase.from('restaurant_tables').update({
          status: sendToKitchen ? 'OCCUPIED' : 'ORDERING',
        }).eq('id', activeTable.id);
        toast.success(sendToKitchen ? '🍽️ Enviado a cocina' : 'Pedido guardado');
      } else {
        const { data: newOrder } = await supabase.from('table_orders').insert({
          company_id: companyId, table_id: activeTable.id, table_name: activeTable.name,
          waiter_id: user?.id, waiter_color: waiterColor, status: sendToKitchen ? 'PREPARING' : 'PENDING',
          items: itemsToSave, notes: orderNotes, guests: orderGuests,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).select().single();
        await supabase.from('restaurant_tables').update({
          status: sendToKitchen ? 'OCCUPIED' : 'ORDERING',
          current_order_id: newOrder?.id,
        }).eq('id', activeTable.id);
        toast.success(sendToKitchen ? '🍽️ Pedido enviado a cocina' : 'Pedido creado');
      }

      setShowOrderModal(false);
      await Promise.all([loadTables(), loadOrders()]);
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setSavingOrder(false); }
  };

  // ── FREE TABLE ───────────────────────────────────────────────────────────────
  const handleFreeTable = async (tableId: string, orderId?: string) => {
    if (!confirm('¿Liberar esta mesa? El pedido activo quedará como entregado.')) return;
    if (orderId) await supabase.from('table_orders').update({ status: 'DELIVERED', updated_at: new Date().toISOString() }).eq('id', orderId);
    await supabase.from('restaurant_tables').update({ status: 'FREE', current_order_id: null }).eq('id', tableId);
    setShowOrderModal(false);
    await Promise.all([loadTables(), loadOrders()]);
    toast.success('Mesa liberada');
  };

  const handleOpenPayment = () => {
    if (!activeOrder) { toast.error('No hay pedido activo para cobrar'); return; }
    setShowOrderModal(false);
    setShowPayModal(true);
  };

  const handleMarkBilling = async (tableId: string) => {
    await supabase.from('restaurant_tables').update({ status: 'BILLING' }).eq('id', tableId);
    setShowOrderModal(false);
    loadTables();
    toast.success('Mesa marcada para cobro');
  };

  const filteredProducts     = products.filter(p =>
    !productSearch ||
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(productSearch.toLowerCase())
  );
  const productsByCategory   = filteredProducts.reduce((acc: Record<string, any[]>, p) => {
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
          <button onClick={() => setShowQrModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-all">
            <QrCode size={16} /> QR Meseros
          </button>
          <button onClick={() => Promise.all([loadTables(), loadOrders()])}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            {viewMode === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />}
          </button>
          <button onClick={() => { setEditingTable(null); setTableForm({ name: '', seats: 4, zone: 'Salón' }); setShowTableModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
            <Plus size={16} /> Nueva mesa
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Mesas libres',   value: stats.free,     color: 'text-emerald-600' },
          { label: 'Ocupadas',       value: stats.occupied, color: 'text-blue-600' },
          { label: 'Listas / Cobro', value: stats.ready,    color: 'text-purple-600' },
          { label: 'Total mesas',    value: stats.total,    color: 'text-slate-800' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">{k.label}</p>
            <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── ZONA FILTER ── */}
      <div className="flex gap-1 flex-wrap">
        {zones.map(z => (
          <button key={z} onClick={() => setSelectedZone(z)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${selectedZone === z ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {z}
          </button>
        ))}
      </div>

      {stats.ready > 0 && (
        <div className="flex items-center gap-3 bg-purple-50 border-2 border-purple-300 rounded-xl px-4 py-3 animate-pulse">
          <Bell size={20} className="text-purple-600 flex-shrink-0" />
          <p className="font-black text-purple-700">
            {stats.ready} {stats.ready === 1 ? 'mesa tiene' : 'mesas tienen'} pedidos listos para servir
          </p>
        </div>
      )}

      {/* ── GRID / LIST DE MESAS ── */}
      {filteredTables.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
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
            const order  = getTableOrder(table.id);
            const total  = order ? getOrderTotal(order.items) : 0;
            const isReady = table.status === 'READY';
            return (
              <div key={table.id}
                onClick={() => openTable(table)}
                className={`relative bg-white rounded-2xl border-2 p-4 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 select-none ${isReady ? 'ring-2 ring-purple-400 ring-offset-1' : ''}`}
                style={{ borderColor: status.border, background: status.bg }}>

                <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${isReady ? 'animate-ping' : 'animate-pulse'}`} style={{ background: status.dot }} />
                {isReady && <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full" style={{ background: status.dot }} />}

                {isReady && (
                  <div className="absolute top-2 left-2">
                    <Bell size={14} className="text-purple-600" />
                  </div>
                )}

                {order?.waiter_color && order.waiter_color !== '#3b82f6' && (
                  <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full border-2 border-white shadow-sm"
                    style={{ background: order.waiter_color }}
                    title={`Mesero: ${order.waiter_name || 'asignado'}`} />
                )}

                <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                  {!isReady && (
                    <button onClick={e => { e.stopPropagation(); setEditingTable(table); setTableForm({ name: table.name, seats: table.seats, zone: table.zone }); setShowTableModal(true); }}
                      className="p-1 bg-white/80 rounded-md hover:bg-white shadow-sm text-slate-500 hover:text-blue-600">
                      <Edit2 size={11} />
                    </button>
                  )}
                  {table.status === 'FREE' && (
                    <button onClick={e => { e.stopPropagation(); handleDeleteTable(table.id); }}
                      className="p-1 bg-white/80 rounded-md hover:bg-white shadow-sm text-slate-500 hover:text-red-500">
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
                const order  = getTableOrder(table.id);
                return (
                  <tr key={table.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => openTable(table)}>
                    <td className="px-4 py-3 font-bold text-slate-800 flex items-center gap-1.5">
                      {table.status === 'READY' && <Bell size={13} className="text-purple-500" />}
                      {table.name}
                    </td>
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
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ════ MODAL: CREAR/EDITAR MESA ════ */}
      {showTableModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-black text-slate-800 text-lg">{editingTable ? 'Editar mesa' : 'Nueva mesa'}</h3>
              <button onClick={() => setShowTableModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre *</label>
                <input value={tableForm.name} onChange={e => setTableForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Mesa 1, Barra 3, Terraza A..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
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
                className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleSaveTable}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
                {editingTable ? 'Guardar Cambios' : 'Crear Mesa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: PEDIDO DE MESA ════ */}
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

                {/* Tabs */}
                <div className="flex gap-1 p-2 border-b border-slate-100 bg-slate-50">
                  {([
                    { id: 'platos',  label: 'Platos',  icon: <Utensils size={12}/> },
                    { id: 'bebidas', label: 'Bebidas', icon: <Beer size={12}/> },
                    { id: 'pizzas',  label: 'Pizzas',  icon: <Pizza size={12}/>,  hide: pizzaSummary.length === 0 },
                  ] as const).filter(t => !('hide' in t && t.hide)).map(t => (
                    <button key={t.id} onClick={() => { setCatalogTab(t.id); setProductSearch(''); }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        catalogTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-white hover:text-slate-700'
                      }`}>
                      {t.icon} {t.label}
                      {t.id === 'pizzas' && pizzaSummary.length > 0 && (
                        <span className="bg-orange-500 text-white text-[9px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
                          {pizzaSummary.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Botón Pizza Personalizada */}
                <div className="px-3 py-2 border-b border-slate-100">
                  <button
                    onClick={() => setShowCustomPizzaModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl text-sm font-bold transition-all"
                  >
                    <Pizza size={14} /> Pizza personalizada (sabor libre)
                  </button>
                </div>

                {/* Buscador */}
                {catalogTab !== 'pizzas' && (
                  <div className="p-3 border-b border-slate-100">
                    <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                      placeholder={catalogTab === 'platos' ? '🔍 Buscar plato...' : '🔍 Buscar bebida...'}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                )}

                {/* ── TAB PLATOS ── */}
                {catalogTab === 'platos' && (
                  <div className="flex-1 overflow-y-auto p-3 space-y-4">
                    {Object.keys(productsByCategory).length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        <Coffee size={32} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No hay platos disponibles hoy.</p>
                        <p className="text-xs mt-1 text-slate-300">Actívalos en Display de Cocina → Menú</p>
                      </div>
                    ) : (
                      Object.entries(productsByCategory).map(([cat, prods]) => (
                        <div key={cat}>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">{cat}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {(prods as any[]).map((p: any) => (
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
                )}

                {/* ── TAB BEBIDAS ── */}
                {catalogTab === 'bebidas' && (() => {
                  const filteredBevs = beverages.filter(b =>
                    !productSearch || b.name.toLowerCase().includes(productSearch.toLowerCase())
                  );
                  const bevsByCategory = filteredBevs.reduce((acc: Record<string, any[]>, b) => {
                    const cat = b.category || 'Bebidas';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(b);
                    return acc;
                  }, {});
                  return (
                    <div className="flex-1 overflow-y-auto p-3 space-y-4">
                      {filteredBevs.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                          <Beer size={32} className="mx-auto mb-2 opacity-40" />
                          <p className="text-sm">No hay bebidas con stock disponible.</p>
                          <p className="text-xs mt-1 text-slate-300">Agrégalas en Display de Cocina → Bebidas</p>
                        </div>
                      ) : (
                        Object.entries(bevsByCategory).map(([cat, bevs]) => (
                          <div key={cat}>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">{cat}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {(bevs as any[]).map((b: any) => (
                                <button key={b.id} onClick={() => addBeverage(b)}
                                  className="text-left p-3 bg-slate-50 hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-xl transition-all active:scale-95 relative">
                                  <p className="font-semibold text-slate-800 text-sm leading-tight">{b.name}</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{b.presentation}</p>
                                  <p className="text-blue-600 font-black text-sm mt-1">{formatCurrency(b.price)}</p>
                                  <span className="absolute top-2 right-2 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                                    {b.stock} disp.
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}

                {/* ── TAB PIZZAS ── */}
                {catalogTab === 'pizzas' && (
                  <div className="flex-1 overflow-y-auto p-3">
                    {pizzaSummary.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        <Pizza size={32} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No hay pizzas disponibles en este momento.</p>
                        <p className="text-xs mt-1 text-slate-300">Ábrelas en Display de Cocina → Pizzas</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {pizzaSummary.map((pizza: any) => {
                          const selected = selectedPizzaSlices[pizza.pizza_type_id] || [];
                          const soldSlices = pizza.slices - pizza.slices_available;
                          const soldSet = new Set(Array.from({ length: Math.min(soldSlices, pizza.slices) }, (_, i) => i));
                          const selectedSet = new Set(selected);
                          const pricePerSlice = pizza.price_per_slice || (pizza.price / pizza.slices);
                          const cx = 70; const cy = 70; const r = 58; const innerR = 13;
                          const slicePaths = Array.from({ length: pizza.slices }, (_, i) => {
                            const step = (2 * Math.PI) / pizza.slices;
                            const start = -Math.PI / 2 + i * step;
                            const end   = -Math.PI / 2 + (i + 1) * step;
                            const mid   = (start + end) / 2;
                            const la = step > Math.PI ? 1 : 0;
                            const x1 = cx + r * Math.cos(start); const y1 = cy + r * Math.sin(start);
                            const x2 = cx + r * Math.cos(end);   const y2 = cy + r * Math.sin(end);
                            const ix1 = cx + innerR * Math.cos(start); const iy1 = cy + innerR * Math.sin(start);
                            const ix2 = cx + innerR * Math.cos(end);   const iy2 = cy + innerR * Math.sin(end);
                            const lx = cx + r * 0.62 * Math.cos(mid);  const ly = cy + r * 0.62 * Math.sin(mid);
                            const d = `M${ix1} ${iy1} L${x1} ${y1} A${r} ${r} 0 ${la} 1 ${x2} ${y2} L${ix2} ${iy2} A${innerR} ${innerR} 0 ${la} 0 ${ix1} ${iy1}Z`;
                            return { d, i, lx, ly };
                          });
                          const getColor = (i: number) => {
                            if (soldSet.has(i)) return '#e2e8f0';
                            if (selectedSet.has(i)) return '#22c55e';
                            if (pizza.is_combined && i >= pizza.slices / 2) return '#dc2626';
                            return '#f97316';
                          };
                          const toggleSlice = (i: number) => {
                            if (soldSet.has(i)) return;
                            setSelectedPizzaSlices(prev => {
                              const cur = prev[pizza.pizza_type_id] || [];
                              return { ...prev, [pizza.pizza_type_id]: cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i] };
                            });
                          };
                          return (
                            <div key={pizza.pizza_type_id} className="bg-white rounded-2xl border border-slate-200 p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <p className="font-bold text-slate-800">{pizza.name}</p>
                                  <p className="text-xs text-slate-500">{pizza.size_label} · {pizza.slices} porciones</p>
                                  {pizza.is_combined && (
                                    <p className="text-[11px] text-orange-600 font-semibold mt-0.5">
                                      🔀 {pizza.flavor_a} / {pizza.flavor_b}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-slate-400">por porción</p>
                                  <p className="font-black text-orange-600">{formatCurrency(pricePerSlice)}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <svg width={140} height={140} viewBox="0 0 140 140" style={{ cursor: 'pointer', flexShrink: 0 }}>
                                  <circle cx={cx} cy={cy} r={r + 4} fill="#92400e" />
                                  {slicePaths.map(({ d, i, lx, ly }) => (
                                    <g key={i} onClick={() => toggleSlice(i)}>
                                      <path d={d} fill={getColor(i)} stroke="white" strokeWidth={2}
                                        opacity={soldSet.has(i) ? 0.4 : 1}
                                        style={{ cursor: soldSet.has(i) ? 'default' : 'pointer', transition: 'fill 0.15s' }} />
                                      {soldSet.has(i) && <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#94a3b8">✓</text>}
                                      {selectedSet.has(i) && <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="white" fontWeight="bold">●</text>}
                                    </g>
                                  ))}
                                  <circle cx={cx} cy={cy} r={innerR * 0.9} fill="white" />
                                  <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight="bold" fill="#1e293b">{pizza.slices_available}</text>
                                  <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#64748b">disp.</text>
                                </svg>
                                <div className="flex-1 space-y-2">
                                  {selected.length > 0 && (
                                    <button onClick={() => handleAddPizzaToOrder(pizza, selected.length, 'slice', selected)}
                                      className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm">
                                      + {selected.length} porción{selected.length > 1 ? 'es' : ''}<br/>
                                      <span className="text-xs font-normal">{formatCurrency(selected.length * pricePerSlice)}</span>
                                    </button>
                                  )}
                                  <button onClick={() => handleAddPizzaToOrder(pizza, 1, 'whole', [])}
                                    className="w-full py-2 border border-orange-300 text-orange-700 hover:bg-orange-50 rounded-xl font-semibold text-sm">
                                    Pizza completa — {formatCurrency(pizza.price)}
                                  </button>
                                  {selected.length === 0 && (
                                    <p className="text-[10px] text-slate-400 text-center">Toca las porciones naranjas</p>
                                  )}
                                </div>
                              </div>
                              {pizza.is_combined && (
                                <div className="flex items-center gap-3 mt-2 justify-center text-xs">
                                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"/>  {pizza.flavor_a}</span>
                                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"/> {pizza.flavor_b}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
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
                          {/* ── BOTÓN ELIMINAR: llama removeItem con devolución de stock ── */}
                          <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 mt-0.5"><X size={14} /></button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1.5">
                            {/* ── BOTONES +/- : llaman updateQty con devolución de stock ── */}
                            <button onClick={() => updateQty(item.id, -1)}
                              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm flex items-center justify-center">−</button>
                            <span className="w-6 text-center font-black text-slate-700 text-sm">{item.quantity}</span>
                            <button onClick={() => updateQty(item.id, 1)}
                              className="w-6 h-6 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold text-sm flex items-center justify-center">+</button>
                          </div>
                          <p className="font-black text-slate-700 text-sm">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                        {/* Nota del ítem */}
                        <div className="mt-1.5 flex items-center gap-1">
                          {item.notes ? (
                            <button
                              onClick={() => setEditingItemNote({ itemId: item.id, currentNote: item.notes || '' })}
                              className="flex items-center gap-1 text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded-lg font-semibold w-full text-left">
                              <MessageSquare size={9} /> {item.notes}
                            </button>
                          ) : (
                            <button
                              onClick={() => setEditingItemNote({ itemId: item.id, currentNote: '' })}
                              className="text-[10px] text-slate-400 hover:text-blue-500 flex items-center gap-0.5">
                              <MessageSquare size={9} /> + nota
                            </button>
                          )}
                        </div>
                        {item.sent_to_kitchen && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-orange-600 font-semibold">
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
                    placeholder="Notas para cocina..." rows={2}
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
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    <ChefHat size={16} /> {savingOrder ? 'Enviando...' : 'Enviar a Cocina'}
                  </button>
                  <button onClick={() => handleSaveOrder(false)} disabled={savingOrder || orderItems.length === 0}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    <Check size={14} /> Guardar Pedido
                  </button>
                  {activeOrder && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={handleOpenPayment}
                        className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1 transition-all">
                        <Receipt size={13} /> Cobrar
                      </button>
                      <button onClick={() => handleFreeTable(activeTable.id, activeOrder?.id)}
                        className="py-2 bg-green-50 border border-green-200 hover:bg-green-100 text-green-700 rounded-xl font-semibold text-xs flex items-center justify-center gap-1">
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

      {/* ════ MODAL: NOTA POR ÍTEM ════ */}
      {editingItemNote && (() => {
        const item = orderItems.find(i => i.id === editingItemNote.itemId);
        const product = products.find(p => p.id === item?.product_id);
        const isBeverage = item?.product_id?.startsWith('bev-');
        const isPizza    = item?.product_id?.startsWith('pizza-');
        let quickNotes: string[] = [];
        if (product?.category_id) {
          quickNotes = quickNotesByCategory[product.category_id] || [];
        } else if (isBeverage) {
          quickNotes = ['Sin hielo', 'Con hielo', 'Sin azúcar', 'Poco dulce', 'Sin limón', 'Con limón', 'Pequeño', 'Grande'];
        } else if (isPizza) {
          quickNotes = ['Bien cocida', 'Poco cocida', 'Sin picante', 'Extra queso', 'Para llevar'];
        }
        return (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-800">Nota para este ítem</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{item?.product_name}</p>
                </div>
                <button onClick={() => setEditingItemNote(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="p-4 space-y-3">
                {quickNotes.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                      <Zap size={11} /> Notas rápidas
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {quickNotes.map((qn, i) => (
                        <button key={i}
                          onClick={() => {
                            const cur = editingItemNote.currentNote;
                            const next = cur ? `${cur}, ${qn}` : qn;
                            setEditingItemNote({ ...editingItemNote, currentNote: next });
                          }}
                          className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors">
                          {qn}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-1">Nota personalizada</p>
                  <textarea
                    value={editingItemNote.currentNote}
                    onChange={e => setEditingItemNote({ ...editingItemNote, currentNote: e.target.value })}
                    placeholder="Ej: sin sal, término medio, sin cebolla..."
                    rows={3}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    autoFocus
                  />
                </div>
              </div>
              <div className="px-4 pb-4 flex gap-2">
                {editingItemNote.currentNote && (
                  <button onClick={() => setItemNote(editingItemNote.itemId, '')}
                    className="px-3 py-2 border border-red-200 text-red-500 rounded-xl text-sm font-semibold hover:bg-red-50">
                    Quitar nota
                  </button>
                )}
                <button
                  onClick={() => setItemNote(editingItemNote.itemId, editingItemNote.currentNote)}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
                  Guardar nota
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════ MODAL: CUSTOM PIZZA ════ */}
      {showCustomPizzaModal && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Pizza size={16} className="text-orange-500" /> Pizza personalizada
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">El cliente define el sabor en el momento</p>
              </div>
              <button onClick={() => setShowCustomPizzaModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">

              {/* Tamaño */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tamaño</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { slices: 4,  label: '4p', sub: 'Personal' },
                    { slices: 6,  label: '6p', sub: 'Mediana' },
                    { slices: 8,  label: '8p', sub: 'Grande' },
                    { slices: 12, label: '12p', sub: 'Familiar' },
                  ].map(s => (
                    <button key={s.slices}
                      onClick={() => setCustomPizzaForm(f => ({ ...f, slices: s.slices }))}
                      className={`py-2 rounded-xl border-2 text-center transition-all ${
                        customPizzaForm.slices === s.slices
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <p className="font-black text-sm">{s.label}</p>
                      <p className="text-[10px]">{s.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tipo */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Tipo</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCustomPizzaForm(f => ({ ...f, isHalf: false }))}
                    className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      !customPizzaForm.isHalf
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-slate-200 text-slate-500'
                    }`}
                  >
                    🍕 Un sabor
                  </button>
                  <button
                    onClick={() => setCustomPizzaForm(f => ({ ...f, isHalf: true }))}
                    className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                      customPizzaForm.isHalf
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-slate-200 text-slate-500'
                    }`}
                  >
                    🔀 Mitad y mitad
                  </button>
                </div>
              </div>

              {/* Sabores */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                  {customPizzaForm.isHalf ? 'Sabores' : 'Sabor'}
                </p>
                <div className="space-y-2">
                  <input
                    value={customPizzaForm.flavorA}
                    onChange={e => setCustomPizzaForm(f => ({ ...f, flavorA: e.target.value }))}
                    placeholder={customPizzaForm.isHalf ? 'Mitad 1 — ej: Pepperoni' : 'Ej: Hawaiana, 4 quesos...'}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  {customPizzaForm.isHalf && (
                    <input
                      value={customPizzaForm.flavorB}
                      onChange={e => setCustomPizzaForm(f => ({ ...f, flavorB: e.target.value }))}
                      placeholder="Mitad 2 — ej: Cucuteña"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-400 border-red-200"
                    />
                  )}
                </div>
              </div>

              {/* Precio y cantidad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Precio</p>
                  <input
                    type="number"
                    min="0"
                    value={customPizzaForm.price || ''}
                    onChange={e => setCustomPizzaForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                    placeholder="Ej: 35000"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Cantidad</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCustomPizzaForm(f => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
                      className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-lg flex items-center justify-center">−</button>
                    <span className="flex-1 text-center font-black text-slate-800">{customPizzaForm.quantity}</span>
                    <button onClick={() => setCustomPizzaForm(f => ({ ...f, quantity: f.quantity + 1 }))}
                      className="w-9 h-9 rounded-lg bg-orange-100 hover:bg-orange-200 font-bold text-lg text-orange-700 flex items-center justify-center">+</button>
                  </div>
                </div>
              </div>

              {/* Nota */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                  <MessageSquare size={11} /> Nota para cocina
                </p>
                <textarea
                  value={customPizzaForm.notes}
                  onChange={e => setCustomPizzaForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ej: borde relleno, sin cebolla, bien cocida..."
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-orange-400"
                />
              </div>

              {/* Preview del nombre */}
              {customPizzaForm.flavorA && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-sm text-orange-700 font-semibold text-center">
                  {customPizzaForm.isHalf
                    ? `🍕 Pizza ${customPizzaForm.slices}p — ${customPizzaForm.flavorA} / ${customPizzaForm.flavorB || '...'}`
                    : `🍕 Pizza ${customPizzaForm.slices}p — ${customPizzaForm.flavorA}`}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setShowCustomPizzaModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 text-sm hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleAddCustomPizza}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                <Plus size={14} /> Agregar al pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: QR MESEROS ════ */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><QrCode size={18} /> Acceso para Meseros</h3>
              <button onClick={() => setShowQrModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 text-center space-y-3">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(waiterQrUrl)}`}
                  alt="QR Mesero"
                  className="mx-auto rounded-xl border-4 border-white shadow-lg"
                  style={{ width: 200, height: 200 }}
                />
                <p className="text-xs text-slate-500 break-all font-mono bg-white rounded-lg p-2 border border-slate-200">
                  {waiterQrUrl}
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p className="font-bold">¿Cómo usar?</p>
                <p>1. Imprime este QR o muéstralo en pantalla</p>
                <p>2. El mesero escanea con su celular</p>
                <p>3. Selecciona su nombre e ingresa su PIN</p>
                <p>4. Ya puede tomar pedidos desde su celular</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => {
                    navigator.clipboard.writeText(waiterQrUrl);
                    toast.success('Link copiado');
                  }}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50">
                  Copiar link
                </button>
                <button onClick={() => {
                    const w = window.open('', '_blank', 'width=400,height=500');
                    if (!w) return;
                    w.document.write(`<html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;gap:16px">
                      <h2 style="margin:0">Acceso Meseros</h2>
                      <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(waiterQrUrl)}" style="border-radius:12px" />
                      <p style="font-size:12px;color:#64748b;text-align:center">Escanea para tomar pedidos desde tu celular</p>
                      <script>window.onload=()=>window.print()</script>
                    </body></html>`);
                    w.document.close();
                  }}
                  className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 flex items-center justify-center gap-1">
                  <Printer size={14} /> Imprimir
                </button>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                  <User size={11} /> Tu color de mesero
                </p>
                <div className="flex items-center gap-3">
                  <input type="color" value={waiterColor}
                    onChange={e => setWaiterColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Color identificador</p>
                    <p className="text-xs text-slate-400">Las mesas que atiendes se marcan con este color</p>
                  </div>
                  <button onClick={async () => {
                      if (!waiterId) return;
                      await supabase.from('profiles').update({ waiter_color: waiterColor }).eq('id', waiterId);
                      toast.success('Color guardado');
                    }}
                    className="ml-auto px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: PAGO ════ */}
      {showPayModal && activeTable && activeOrder && (
        <TablePaymentModal
          table={activeTable}
          order={activeOrder}
          company={company}
          companyId={companyId!}
          branchId={branchId}
          session={session}
          formatCurrency={formatCurrency}
          navigate={navigate}
          onClose={() => { setShowPayModal(false); }}
          onSuccess={async () => {
            setShowPayModal(false);
            await Promise.all([loadTables(), loadOrders()]);
          }}
        />
      )}

    </div>
  );
};

export default Tables;