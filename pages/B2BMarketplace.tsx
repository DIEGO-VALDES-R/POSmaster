import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store, Search, Package, ShoppingCart, Send, Check,
  X, Clock, Truck, AlertCircle, Plus, Minus, Building2,
  Star, ArrowLeft, RefreshCw, Eye, ChevronDown, ChevronUp,
  DollarSign, Calendar, FileText, Users, Link2, CheckCircle,
  XCircle, RotateCcw, Tag,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { receivableService } from '../services/receivableService';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────

type B2BOrderStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'PREPARING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
type ConnectionStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'BLOCKED';
type PaymentType = 'CREDIT' | 'IMMEDIATE';
type ViewTab = 'directory' | 'my_orders' | 'received_orders' | 'connections';

interface B2BCompany {
  id: string;
  name: string;
  b2b_name?: string;
  b2b_description?: string;
  b2b_categories?: string[];
  b2b_min_order?: number;
  b2b_terms?: string;
  logo_url?: string;
  nit?: string;
  phone?: string;
  email?: string;
}

interface B2BConnection {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: ConnectionStatus;
  credit_limit: number;
  credit_days: number;
  notes?: string;
  created_at: string;
  buyer?: { name: string; logo_url?: string };
  seller?: { name: string; logo_url?: string };
}

interface B2BOrderItem {
  product_id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface B2BOrder {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  buyer_name: string;
  seller_name: string;
  status: B2BOrderStatus;
  payment_type: PaymentType;
  payment_status: string;
  items: B2BOrderItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  delivery_address?: string;
  expected_date?: string;
  created_at: string;
  updated_at: string;
}

// ── STATUS CONFIG ─────────────────────────────────────────────────────────────

const ORDER_STATUS_CFG: Record<B2BOrderStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING:    { label: 'Pendiente',   cls: 'bg-amber-100 text-amber-700',   icon: <Clock size={12} /> },
  ACCEPTED:   { label: 'Aceptado',    cls: 'bg-blue-100 text-blue-700',     icon: <Check size={12} /> },
  REJECTED:   { label: 'Rechazado',   cls: 'bg-red-100 text-red-700',       icon: <XCircle size={12} /> },
  PREPARING:  { label: 'Preparando',  cls: 'bg-indigo-100 text-indigo-700', icon: <Package size={12} /> },
  SHIPPED:    { label: 'Despachado',  cls: 'bg-violet-100 text-violet-700', icon: <Truck size={12} /> },
  DELIVERED:  { label: 'Entregado',   cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={12} /> },
  CANCELLED:  { label: 'Cancelado',   cls: 'bg-slate-100 text-slate-500',   icon: <X size={12} /> },
};

const CONN_STATUS_CFG: Record<ConnectionStatus, { label: string; cls: string }> = {
  PENDING:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  ACTIVE:   { label: 'Activa',    cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
  BLOCKED:  { label: 'Bloqueada', cls: 'bg-slate-100 text-slate-500' },
};

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────

const B2BMarketplace: React.FC = () => {
  const { company, companyId, refreshCompany, branchId } = useDatabase();
  const navigate = useNavigate();

  // ── AUDIO / VOZ ───────────────────────────────────────────────────────────────
  const lastOrderCountRef = useRef<number>(0);

  const playNewOrderAlert = useCallback(() => {
    // 1. Voz por Web Speech API
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance('Nueva solicitud de pedido B2B recibida');
      msg.lang  = 'es-CO';
      msg.rate  = 0.95;
      msg.pitch = 1.1;
      msg.volume = 1;
      window.speechSynthesis.speak(msg);
    }
    // 2. Sonido de respaldo con Web Audio API
    try {
      const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)();
      const play = (freq: number, start: number, dur: number, vol = 0.4) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(vol, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      play(523, 0,    0.18);  // Do
      play(659, 0.2,  0.18);  // Mi
      play(784, 0.4,  0.18);  // Sol
      play(1047, 0.6, 0.35);  // Do alto
    } catch { /* silencio si el browser lo bloquea */ }
  }, []);
  const { formatMoney } = useCurrency();

  const [tab, setTab] = useState<ViewTab>('directory');
  const [loading, setLoading] = useState(false);

  // Directory
  const [companies, setCompanies]       = useState<B2BCompany[]>([]);
  const [dirSearch, setDirSearch]       = useState('');
  const [selectedCompany, setSelectedCompany] = useState<B2BCompany | null>(null);
  const [sellerProducts, setSellerProducts]   = useState<any[]>([]);
  const [cart, setCart]                 = useState<B2BOrderItem[]>([]);
  const [showOrderForm, setShowOrderForm]     = useState(false);
  const [showPayModal, setShowPayModal]       = useState(false);
  const [payModalOrder, setPayModalOrder]     = useState<B2BOrder | null>(null);
  const [payMethod, setPayMethod]             = useState<'CASH' | 'TRANSFER' | 'CARD' | 'NEQUI' | 'DAVIPLATA'>('CASH');
  const [payAmountReceived, setPayAmountReceived] = useState('');

  // Orders
  const [myOrders, setMyOrders]         = useState<B2BOrder[]>([]);
  const [receivedOrders, setReceivedOrders]   = useState<B2BOrder[]>([]);
  const [expandedOrder, setExpandedOrder]     = useState<string | null>(null);

  // Connections
  const [connections, setConnections]   = useState<B2BConnection[]>([]);

  // Order form
  const [orderNotes, setOrderNotes]     = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderExpected, setOrderExpected]     = useState('');
  const [paymentType, setPaymentType]   = useState<PaymentType>('CREDIT');
  const [submitting, setSubmitting]     = useState(false);

  // B2B settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [b2bForm, setB2bForm] = useState({
    b2b_enabled: false,
    b2b_name: '',
    b2b_description: '',
    b2b_categories: '',
    b2b_min_order: '0',
    b2b_terms: '',
  });

  // ── LOAD ──────────────────────────────────────────────────────────────────────

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('companies')
      .select('id, name, b2b_name, b2b_description, b2b_categories, b2b_min_order, logo_url, nit, phone, email')
      .eq('b2b_enabled', true)
      .neq('id', companyId || '')
      .order('name');
    setCompanies(data || []);
    setLoading(false);
  }, [companyId]);

  const loadMyOrders = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('b2b_orders')
      .select('*')
      .eq('buyer_id', companyId)
      .order('created_at', { ascending: false });
    setMyOrders(data || []);
  }, [companyId]);

  const loadReceivedOrders = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('b2b_orders')
      .select('*')
      .eq('seller_id', companyId)
      .order('created_at', { ascending: false });
    setReceivedOrders(data || []);
  }, [companyId]);

  const loadConnections = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('b2b_connections')
      .select('*')
      .or(`buyer_id.eq.${companyId},seller_id.eq.${companyId}`)
      .order('created_at', { ascending: false });
    setConnections(data || []);
  }, [companyId]);

  useEffect(() => {
    loadDirectory();
    loadMyOrders();
    loadReceivedOrders();
    loadConnections();
    // Load B2B settings
    if (company) {
      setB2bForm({
        b2b_enabled:     (company as any).b2b_enabled || false,
        b2b_name:        (company as any).b2b_name || company.name || '',
        b2b_description: (company as any).b2b_description || '',
        b2b_categories:  ((company as any).b2b_categories || []).join(', '),
        b2b_min_order:   String((company as any).b2b_min_order || 0),
        b2b_terms:       (company as any).b2b_terms || '',
      });
    }
  }, [companyId, company]);

  // ── REALTIME: alerta de nuevo pedido recibido ─────────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`b2b_orders_${companyId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'b2b_orders',
          filter: `seller_id=eq.${companyId}`,
        },
        (payload: any) => {
          // Reproducir alerta de voz + sonido
          playNewOrderAlert();
          // Toast con info del pedido
          toast(
            (t) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ fontSize: 14 }}>🛒 Nuevo pedido B2B</strong>
                <span style={{ fontSize: 12, color: '#475569' }}>
                  {payload.new.buyer_name} · {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(payload.new.total_amount)}
                </span>
                <button
                  onClick={() => { setTab('received_orders'); toast.dismiss(t.id); }}
                  style={{ marginTop: 4, padding: '4px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  Ver pedido →
                </button>
              </div>
            ),
            { duration: 12000, icon: '🔔' }
          );
          // Recargar lista de pedidos recibidos
          loadReceivedOrders();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, playNewOrderAlert, loadReceivedOrders]);

  // Load seller products when viewing catalog
  const loadSellerProducts = async (sellerId: string) => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, price, stock_quantity, category, description, image_url, type')
      .eq('company_id', sellerId)
      .neq('type', 'SERVICE')          // excluir servicios sin stock físico
      .order('category', { ascending: true })
      .order('name',     { ascending: true });
    if (error) {
      console.error('B2B catalog error:', error.message);
      // Si error es de RLS, dar mensaje claro
      if (error.code === '42501' || error.message.includes('policy')) {
        toast.error('No se puede acceder al catálogo. Verifica las políticas de la base de datos.');
      }
    }
    // Mostrar todos los productos, incluyendo los con stock 0 (el vendedor decide qué tiene)
    setSellerProducts(data || []);
  };

  // ── CART ──────────────────────────────────────────────────────────────────────

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unit_price }
          : i);
      }
      return [...prev, {
        product_id:   product.id,
        product_name: product.name,
        sku:          product.sku,
        quantity:     1,
        unit_price:   product.price,
        total:        product.price,
      }];
    });
    toast.success(`${product.name} agregado al pedido`);
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(prev => prev
      .map(i => i.product_id === productId
        ? { ...i, quantity: Math.max(0, i.quantity + delta), total: Math.max(0, i.quantity + delta) * i.unit_price }
        : i)
      .filter(i => i.quantity > 0)
    );
  };

  const cartTotal = cart.reduce((s, i) => s + i.total, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  // ── SUBMIT ORDER ──────────────────────────────────────────────────────────────

  const submitOrder = async () => {
    if (!companyId || !selectedCompany || cart.length === 0) return;
    setSubmitting(true);
    try {
      const ts  = Date.now().toString().slice(-6);
      const rnd = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      const orderNumber = `B2B-${ts}${rnd}`;
      const subtotal = cart.reduce((s, i) => s + i.total, 0);

      const { error } = await supabase.from('b2b_orders').insert({
        order_number:     orderNumber,
        buyer_id:         companyId,
        seller_id:        selectedCompany.id,
        buyer_name:       company?.name || '',
        seller_name:      selectedCompany.b2b_name || selectedCompany.name,
        status:           'PENDING',
        payment_type:     paymentType,
        payment_status:   'PENDING',
        items:            cart,
        subtotal:         subtotal,
        tax_amount:       0,
        total_amount:     subtotal,
        notes:            orderNotes || null,
        delivery_address: orderAddress || null,
        expected_date:    orderExpected || null,
      });

      if (error) throw error;

      // Registro en historial
      const { data: newOrder } = await supabase
        .from('b2b_orders').select('id').eq('order_number', orderNumber).single();
      if (newOrder) {
        await supabase.from('b2b_order_history').insert({
          order_id:  newOrder.id,
          status:    'PENDING',
          note:      `Pedido creado por ${company?.name}`,
        });
      }

      toast.success(`✅ Pedido ${orderNumber} enviado a ${selectedCompany.b2b_name || selectedCompany.name}`);
      setCart([]);
      setShowOrderForm(false);
      setSelectedCompany(null);
      setOrderNotes(''); setOrderAddress(''); setOrderExpected('');
      setTab('my_orders');
      loadMyOrders();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── UPDATE ORDER STATUS (seller side) ─────────────────────────────────────────

  const updateOrderStatus = async (orderId: string, newStatus: B2BOrderStatus, note?: string) => {
    const { error } = await supabase.from('b2b_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) { toast.error(error.message); return; }

    await supabase.from('b2b_order_history').insert({
      order_id:  orderId,
      status:    newStatus,
      note:      (note || ORDER_STATUS_CFG[newStatus].label) + (company?.name ? ` — ${company.name}` : ''),
    });

    // ── Al DESPACHAR o ENTREGAR → descontar stock + factura + CxC ──────────────
    if (newStatus === 'SHIPPED' || newStatus === 'DELIVERED') {
      const order = receivedOrders.find(o => o.id === orderId);
      if (order && !order.invoice_id) {

        // 1. Descontar stock sin RPC — actualización directa
        for (const item of order.items) {
          if (item.product_id) {
            try {
              const { data: prod } = await supabase
                .from('products')
                .select('stock_quantity')
                .eq('id', item.product_id)
                .single();
              if (prod) {
                await supabase.from('products').update({
                  stock_quantity: Math.max(0, (prod.stock_quantity || 0) - item.quantity),
                }).eq('id', item.product_id);
              }
            } catch { /* continuar si falla un ítem */ }
          }
        }

        // 2. Generar factura
        const ts     = Date.now().toString().slice(-6);
        const rnd    = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        const invNum = `B2B-${ts}${rnd}`;
        const payMethod = order.payment_type === 'PREPAID' ? 'TRANSFER' : 'CREDIT';

        // Buscar datos del comprador para la factura
        const { data: buyerCompany } = await supabase
          .from('companies')
          .select('name, nit')
          .eq('id', order.buyer_id)
          .single();

        const { data: inv, error: invErr } = await supabase.from('invoices').insert({
          company_id:        companyId,
          branch_id:         branchId,
          invoice_number:    invNum,
          subtotal:          order.subtotal,
          tax_amount:        order.tax_amount,
          total_amount:      order.total_amount,
          status:            'COMPLETED',
          customer_name:     buyerCompany?.name || order.buyer_name,
          customer_document: buyerCompany?.nit   || null,
          payment_method:    [{ method: payMethod, amount: order.total_amount }],
          notes:             `Pedido B2B ${order.order_number} — ${order.buyer_name}`,
        }).select('id').single();

        if (invErr) {
          toast.error('Error factura: ' + invErr.message);
          loadReceivedOrders();
          return;
        }

        if (inv) {
          await supabase.from('invoice_items').insert(
            order.items.map(i => ({
              invoice_id: inv.id,
              product_id: i.product_id || null,
              quantity:   i.quantity,
              price:      i.unit_price,
              tax_rate:   0,
              discount:   0,
            }))
          );
          await supabase.from('b2b_orders').update({ invoice_id: inv.id }).eq('id', orderId);

          if (order.payment_type === 'CREDIT') {
            // CRÉDITO → crear CxC directamente
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 30);
            try {
              await receivableService.create({
                company_id:    companyId!,
                customer_name: order.buyer_name,
                invoice_id:    inv.id,
                total_amount:  order.total_amount,
                paid_amount:   0,
                due_date:      dueDate.toISOString().split('T')[0],
                status:        'PENDING',
                notes:         `Pedido B2B ${order.order_number}`,
              });
            } catch (e: any) { toast.error('CxC error: ' + e.message); }
            toast.success(`✅ ${newStatus === 'SHIPPED' ? 'Despachado' : 'Entregado'} · Factura ${invNum} · CxC creada a 30 días`);
            loadReceivedOrders();

          } else {
            // CONTADO → abrir modal de cobro con los datos del pedido
            const orderWithInv = { ...order, invoice_id: inv.id };
            setPayModalOrder(orderWithInv);
            setPayAmountReceived(String(order.total_amount));
            setPayMethod('CASH');
            setShowPayModal(true);
            loadReceivedOrders();
          }
        }
      } else {
        toast.success(`Pedido actualizado: ${ORDER_STATUS_CFG[newStatus].label}`);
      }
    } else {
      toast.success(`Pedido actualizado: ${ORDER_STATUS_CFG[newStatus].label}`);
    }

    loadReceivedOrders();
    loadMyOrders();
  };

  // ── CONNECTIONS ───────────────────────────────────────────────────────────────

  const requestConnection = async (sellerId: string, sellerName: string) => {
    if (!companyId) return;
    const existing = connections.find(
      c => (c.buyer_id === companyId && c.seller_id === sellerId)
    );
    if (existing) {
      toast.error('Ya tienes una conexión con esta empresa');
      return;
    }
    const { error } = await supabase.from('b2b_connections').insert({
      buyer_id:  companyId,
      seller_id: sellerId,
      status:    'ACTIVE', // Auto-activo para simplificar
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ Conectado con ${sellerName}`);
    loadConnections();
  };

  const isConnected = (sellerId: string) =>
    connections.some(c =>
      (c.buyer_id === companyId && c.seller_id === sellerId && c.status === 'ACTIVE') ||
      (c.seller_id === companyId && c.buyer_id === sellerId && c.status === 'ACTIVE')
    );

  // ── PROCESAR COBRO B2B (modal de pago) ───────────────────────────────────────

  const processB2BPayment = async () => {
    if (!payModalOrder?.invoice_id || !companyId) return;
    const received = parseFloat(payAmountReceived) || 0;
    if (received < payModalOrder.total_amount) {
      toast.error('El monto recibido no puede ser menor al total del pedido');
      return;
    }

    // Actualizar factura con método de pago real y marcar como PAID
    const { error } = await supabase.from('invoices').update({
      payment_method: [{ method: payMethod, amount: payModalOrder.total_amount }],
      status: 'COMPLETED',
    }).eq('id', payModalOrder.invoice_id);

    if (error) { toast.error('Error actualizando factura: ' + error.message); return; }

    // Actualizar pedido a DELIVERED y payment_status PAID
    await supabase.from('b2b_orders').update({
      status:         'DELIVERED',
      payment_status: 'PAID',
      updated_at:     new Date().toISOString(),
    }).eq('id', payModalOrder.id);

    await supabase.from('b2b_order_history').insert({
      order_id: payModalOrder.id,
      status:   'DELIVERED',
      note:     `Pago recibido: ${payMethod} · $${payModalOrder.total_amount.toLocaleString('es-CO')}`,
    });

    const change = received - payModalOrder.total_amount;
    toast.success(
      `✅ Pago registrado · ${payMethod}${change > 0 ? ` · Cambio: ${formatMoney(change)}` : ''}`,
      { duration: 6000 }
    );
    setShowPayModal(false);
    setPayModalOrder(null);
    loadReceivedOrders();
  };

  // ── SAVE B2B SETTINGS ─────────────────────────────────────────────────────────

  const saveB2bSettings = async () => {
    if (!companyId) return;
    const { error } = await supabase.from('companies').update({
      b2b_enabled:     b2bForm.b2b_enabled,
      b2b_name:        b2bForm.b2b_name || null,
      b2b_description: b2bForm.b2b_description || null,
      b2b_categories:  b2bForm.b2b_categories.split(',').map(s => s.trim()).filter(Boolean),
      b2b_min_order:   parseFloat(b2bForm.b2b_min_order) || 0,
      b2b_terms:       b2bForm.b2b_terms || null,
    }).eq('id', companyId);
    if (error) { toast.error(error.message); return; }
    // Refresh company in context so the form reflects the saved state immediately
    await refreshCompany();
    toast.success(b2bForm.b2b_enabled ? '✅ Tu empresa ahora es visible en el directorio B2B' : 'Configuración guardada');
    setShowSettings(false);
    loadDirectory();
  };

  // ── HELPERS ───────────────────────────────────────────────────────────────────

  const filteredCompanies = companies.filter(c =>
    !dirSearch ||
    (c.b2b_name || c.name).toLowerCase().includes(dirSearch.toLowerCase()) ||
    (c.b2b_description || '').toLowerCase().includes(dirSearch.toLowerCase()) ||
    (c.b2b_categories || []).some(cat => cat.toLowerCase().includes(dirSearch.toLowerCase()))
  );

  const pendingReceived = receivedOrders.filter(o => o.status === 'PENDING').length;

  const inputCls = "w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400";

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER: CATÁLOGO DEL PROVEEDOR
  // ══════════════════════════════════════════════════════════════════════════════

  if (selectedCompany && !showOrderForm) {
    const productsByCategory = sellerProducts.reduce((acc: Record<string, any[]>, p) => {
      const cat = p.category || 'General';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {});

    return (
      <div className="space-y-4">
        {/* Header catálogo */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedCompany(null); setCart([]); }}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            {selectedCompany.logo_url ? (
              <img src={selectedCompany.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-200" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Store size={20} className="text-blue-600" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-black text-slate-800">{selectedCompany.b2b_name || selectedCompany.name}</h2>
              <p className="text-sm text-slate-500">{selectedCompany.b2b_description}</p>
            </div>
          </div>
          {/* Carrito flotante */}
          {cart.length > 0 && (
            <button
              onClick={() => setShowOrderForm(true)}
              className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
              <ShoppingCart size={16} />
              {cartCount} productos · {formatMoney(cartTotal)}
            </button>
          )}
        </div>

        {/* Catálogo */}
        {sellerProducts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-slate-600">Esta empresa no tiene productos en su catálogo</p>
            <p className="text-sm mt-1.5 max-w-sm mx-auto">
              El proveedor debe agregar productos desde su módulo de <strong>Inventario</strong> para que aparezcan aquí.
            </p>
          </div>
        ) : (
          Object.entries(productsByCategory).map(([cat, prods]) => (
            <div key={cat}>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 px-1">{cat}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {prods.map(p => {
                  const inCart = cart.find(i => i.product_id === p.id);
                  return (
                    <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                          <Package size={20} className="text-slate-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{p.name}</p>
                        {p.sku && <p className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</p>}
                        <p className="text-xs text-slate-400">Stock: {p.stock_quantity}</p>
                        <p className="font-black text-blue-600 text-sm">{formatMoney(p.price)}</p>
                      </div>
                      <div>
                        {inCart ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateCartQty(p.id, -1)}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-600 font-bold flex items-center justify-center">
                              <Minus size={12} />
                            </button>
                            <span className="w-6 text-center font-black text-slate-800 text-sm">{inCart.quantity}</span>
                            <button onClick={() => updateCartQty(p.id, 1)}
                              className="w-7 h-7 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold flex items-center justify-center">
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(p)}
                            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center">
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER: FORMULARIO DE PEDIDO
  // ══════════════════════════════════════════════════════════════════════════════

  if (showOrderForm && selectedCompany) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowOrderForm(false)}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
            <ArrowLeft size={18} />
          </button>
          <h2 className="text-xl font-black text-slate-800">Confirmar pedido</h2>
        </div>

        {/* Resumen de items */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <p className="font-bold text-slate-700 text-sm">Proveedor: {selectedCompany.b2b_name || selectedCompany.name}</p>
            <p className="text-xs text-slate-500">{cart.length} productos</p>
          </div>
          <div className="divide-y divide-slate-100">
            {cart.map(item => (
              <div key={item.product_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="font-semibold text-slate-800 text-sm">{item.product_name}</p>
                  {item.sku && <p className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateCartQty(item.product_id, -1)}
                    className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 font-bold flex items-center justify-center">
                    <Minus size={10} />
                  </button>
                  <span className="w-6 text-center font-black text-slate-700 text-sm">{item.quantity}</span>
                  <button onClick={() => updateCartQty(item.product_id, 1)}
                    className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center">
                    <Plus size={10} />
                  </button>
                </div>
                <p className="font-black text-slate-800 text-sm w-20 text-right">{formatMoney(item.total)}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center px-4 py-3 bg-slate-800 text-white">
            <span className="font-black">TOTAL</span>
            <span className="font-black text-xl">{formatMoney(cartTotal)}</span>
          </div>
        </div>

        {/* Detalles del pedido */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="font-bold text-slate-700">Detalles del pedido</p>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tipo de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {([['CREDIT', '💳 Crédito (pago posterior)'], ['IMMEDIATE', '💵 Pago inmediato']] as const).map(([type, label]) => (
                <button key={type} onClick={() => setPaymentType(type)}
                  className={`px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all text-left ${
                    paymentType === type ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Dirección de entrega</label>
            <input value={orderAddress} onChange={e => setOrderAddress(e.target.value)}
              placeholder="Dirección donde recibirás el pedido"
              className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Fecha esperada de entrega</label>
            <input type="date" value={orderExpected} onChange={e => setOrderExpected(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Notas al proveedor</label>
            <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
              placeholder="Instrucciones especiales, referencias, etc."
              rows={3} className={`${inputCls} resize-none`} />
          </div>
        </div>

        <button onClick={submitOrder} disabled={submitting}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-lg disabled:opacity-50 flex items-center justify-center gap-2">
          {submitting
            ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
            : <><Send size={20} /> Enviar pedido — {formatMoney(cartTotal)}</>}
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Building2 size={24} className="text-blue-600" /> Marketplace B2B
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">Compra y vende entre empresas de la red POSmaster</p>
        </div>
        <button onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <Store size={15} /> Mi perfil B2B
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          ['directory',        '🏪 Directorio',     0],
          ['my_orders',        '📤 Mis pedidos',     myOrders.filter(o => o.status === 'PENDING').length],
          ['received_orders',  '📥 Recibidos',       pendingReceived],
          ['connections',      '🤝 Conexiones',      0],
        ] as const).map(([id, label, badge]) => (
          <button key={id} onClick={() => setTab(id as ViewTab)}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === id ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {label}
            {badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: DIRECTORIO ── */}
      {tab === 'directory' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
            <input value={dirSearch} onChange={e => setDirSearch(e.target.value)}
              placeholder="Buscar empresa, categoría o producto..."
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Cargando directorio...
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="space-y-4">
              {/* Tu estado de perfil */}
              <div className={`rounded-xl border p-5 flex items-center gap-4 ${b2bForm.b2b_enabled ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${b2bForm.b2b_enabled ? 'bg-green-200' : 'bg-amber-200'}`}>
                  <Store size={18} className={b2bForm.b2b_enabled ? 'text-green-700' : 'text-amber-700'} />
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${b2bForm.b2b_enabled ? 'text-green-800' : 'text-amber-800'}`}>
                    {b2bForm.b2b_enabled ? '✅ Tu perfil B2B está activo' : '⚠️ Tu perfil B2B no está activo'}
                  </p>
                  <p className={`text-xs mt-0.5 ${b2bForm.b2b_enabled ? 'text-green-600' : 'text-amber-600'}`}>
                    {b2bForm.b2b_enabled
                      ? 'Eres visible en el directorio. Aún no hay otras empresas registradas.'
                      : 'Activa tu perfil para aparecer en el directorio y conectarte con otras empresas.'}
                  </p>
                </div>
                <button onClick={() => setShowSettings(true)}
                  className={`px-4 py-2 rounded-xl font-bold text-sm flex-shrink-0 ${b2bForm.b2b_enabled ? 'bg-green-700 text-white hover:bg-green-800' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
                  {b2bForm.b2b_enabled ? 'Editar perfil' : 'Activar perfil'}
                </button>
              </div>
              {/* Empty state */}
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <Store size={40} className="mx-auto mb-3 opacity-20" />
                <p className="font-bold text-base text-slate-600">Sin otras empresas en el directorio</p>
                <p className="text-sm mt-1">Cuando otras empresas activen su perfil B2B, aparecerán aquí.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCompanies.map(c => {
                const connected = isConnected(c.id);
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    <div className="p-5">
                      <div className="flex items-start gap-3 mb-3">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt={c.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-slate-100" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center flex-shrink-0">
                            <Building2 size={22} className="text-blue-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-800 truncate">{c.b2b_name || c.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.b2b_description || 'Sin descripción'}</p>
                        </div>
                      </div>

                      {c.b2b_categories && c.b2b_categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {c.b2b_categories.slice(0, 3).map(cat => (
                            <span key={cat} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-semibold">
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}

                      {c.b2b_min_order && c.b2b_min_order > 0 && (
                        <p className="text-xs text-slate-400 mb-3">
                          Pedido mínimo: <span className="font-bold text-slate-600">{formatMoney(c.b2b_min_order)}</span>
                        </p>
                      )}

                      <div className="flex gap-2">
                        {connected ? (
                          <button
                            onClick={async () => {
                              setSelectedCompany(c);
                              await loadSellerProducts(c.id);
                            }}
                            className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 flex items-center justify-center gap-1.5">
                            <ShoppingCart size={14} /> Ver catálogo
                          </button>
                        ) : (
                          <button onClick={() => requestConnection(c.id, c.b2b_name || c.name)}
                            className="flex-1 py-2 border-2 border-blue-200 text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-50 flex items-center justify-center gap-1.5">
                            <Link2 size={14} /> Conectar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: MIS PEDIDOS ── */}
      {tab === 'my_orders' && (
        <div className="space-y-3">
          {myOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Send size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin pedidos enviados</p>
              <p className="text-sm mt-1">Ve al directorio y realiza tu primer pedido B2B</p>
            </div>
          ) : (
            myOrders.map(order => {
              const cfg = ORDER_STATUS_CFG[order.status];
              const isExpanded = expandedOrder === order.id;
              return (
                <div key={order.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 font-mono text-sm">{order.order_number}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-xs text-slate-400">
                          {order.payment_type === 'CREDIT' ? '💳 Crédito' : '💵 Inmediato'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Para: <span className="font-semibold text-slate-700">{order.seller_name}</span>
                        · {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="font-black text-slate-800">{formatMoney(order.total_amount)}</p>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
                      <div className="space-y-1 mb-3">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-slate-600"><span className="text-slate-400 mr-1">x{item.quantity}</span>{item.product_name}</span>
                            <span className="font-semibold text-slate-700">{formatMoney(item.total)}</span>
                          </div>
                        ))}
                      </div>
                      {order.notes && <p className="text-xs text-slate-500 italic">Nota: {order.notes}</p>}
                      {order.delivery_address && <p className="text-xs text-slate-500">Entrega: {order.delivery_address}</p>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── TAB: PEDIDOS RECIBIDOS ── */}
      {tab === 'received_orders' && (
        <div className="space-y-3">
          {receivedOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin pedidos recibidos</p>
              <p className="text-sm mt-1">Activa tu perfil B2B para que otras empresas te encuentren</p>
            </div>
          ) : (
            receivedOrders.map(order => {
              const cfg = ORDER_STATUS_CFG[order.status];
              const isExpanded = expandedOrder === order.id;
              return (
                <div key={order.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 font-mono text-sm">{order.order_number}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">
                        De: <span className="font-semibold text-slate-700">{order.buyer_name}</span>
                        · {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="font-black text-slate-800">{formatMoney(order.total_amount)}</p>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-5 py-4 space-y-3">
                      {/* Items */}
                      <div className="space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-slate-600"><span className="text-slate-400 mr-1">x{item.quantity}</span>{item.product_name}</span>
                            <span className="font-semibold text-slate-700">{formatMoney(item.total)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-100">
                          <span>Total</span>
                          <span>{formatMoney(order.total_amount)}</span>
                        </div>
                      </div>
                      {order.notes && <p className="text-xs text-slate-500 italic bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">📝 {order.notes}</p>}
                      {order.delivery_address && <p className="text-xs text-slate-500">📍 {order.delivery_address}</p>}
                      {order.expected_date && <p className="text-xs text-slate-500">📅 Entrega esperada: {new Date(order.expected_date + 'T12:00:00').toLocaleDateString()}</p>}

                      {/* Acciones según estado */}
                      {order.status === 'PENDING' && (
                        <div className="flex gap-2 pt-2">
                          <button onClick={() => updateOrderStatus(order.id, 'ACCEPTED')}
                            className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 flex items-center justify-center gap-1.5">
                            <Check size={15} /> Aceptar y facturar
                          </button>
                          <button onClick={() => updateOrderStatus(order.id, 'REJECTED', 'Pedido rechazado por el proveedor')}
                            className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50">
                            <X size={15} />
                          </button>
                        </div>
                      )}
                      {order.status === 'ACCEPTED' && (
                        <button onClick={() => updateOrderStatus(order.id, 'PREPARING')}
                          className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 flex items-center justify-center gap-1.5">
                          <Package size={15} /> Marcar en preparación
                        </button>
                      )}
                      {order.status === 'PREPARING' && (
                        <button onClick={() => updateOrderStatus(order.id, 'SHIPPED')}
                          className="w-full py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 flex items-center justify-center gap-1.5">
                          <Truck size={15} /> Marcar como despachado
                        </button>
                      )}
                      {order.status === 'SHIPPED' && (
                        <button onClick={() => updateOrderStatus(order.id, 'DELIVERED')}
                          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 flex items-center justify-center gap-1.5">
                          <CheckCircle size={15} /> Confirmar entrega
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── TAB: CONEXIONES ── */}
      {tab === 'connections' && (
        <div className="space-y-3">
          {connections.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin conexiones B2B</p>
              <p className="text-sm mt-1">Ve al directorio y conecta con otras empresas</p>
            </div>
          ) : (
            connections.map(conn => {
              const isMyBuy  = conn.buyer_id  === companyId;
              const otherName = isMyBuy ? conn.seller_id : conn.buyer_id;
              const cfg = CONN_STATUS_CFG[conn.status];
              return (
                <div key={conn.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Building2 size={18} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">
                      {isMyBuy ? 'Proveedor: ' : 'Cliente: '}
                      <span className="font-black">{otherName.slice(0, 8)}...</span>
                    </p>
                    <p className="text-xs text-slate-400">{new Date(conn.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                  {conn.credit_days > 0 && (
                    <span className="text-xs text-slate-400">{conn.credit_days} días crédito</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── MODAL: CONFIGURACIÓN B2B ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 flex items-center gap-2"><Store size={18} /> Mi perfil B2B</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* Toggle activo */}
              <div className={`flex items-center justify-between p-4 rounded-xl border ${b2bForm.b2b_enabled ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                <div>
                  <p className={`font-bold ${b2bForm.b2b_enabled ? 'text-green-800' : 'text-slate-700'}`}>
                    {b2bForm.b2b_enabled ? '✅ Visible en el directorio B2B' : '⬜ No visible en el directorio'}
                  </p>
                  <p className={`text-xs mt-0.5 ${b2bForm.b2b_enabled ? 'text-green-600' : 'text-slate-500'}`}>
                    {b2bForm.b2b_enabled
                      ? 'Otras empresas pueden encontrarte y hacerte pedidos'
                      : 'Activa el switch para aparecer en el directorio B2B'}
                  </p>
                </div>
                <button
                  onClick={() => setB2bForm(f => ({ ...f, b2b_enabled: !f.b2b_enabled }))}
                  className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${b2bForm.b2b_enabled ? 'bg-green-500' : 'bg-slate-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${b2bForm.b2b_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nombre en el directorio</label>
                <input value={b2bForm.b2b_name} onChange={e => setB2bForm(f => ({ ...f, b2b_name: e.target.value }))}
                  placeholder={company?.name || 'Nombre de tu empresa'}
                  className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descripción del negocio</label>
                <textarea value={b2bForm.b2b_description} onChange={e => setB2bForm(f => ({ ...f, b2b_description: e.target.value }))}
                  placeholder="¿Qué vendes? ¿A quién va dirigido tu negocio?"
                  rows={3} className={`${inputCls} resize-none`} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Categorías (separadas por coma)</label>
                <input value={b2bForm.b2b_categories} onChange={e => setB2bForm(f => ({ ...f, b2b_categories: e.target.value }))}
                  placeholder="Celulares, Accesorios, Repuestos"
                  className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Pedido mínimo</label>
                <input type="number" value={b2bForm.b2b_min_order} onChange={e => setB2bForm(f => ({ ...f, b2b_min_order: e.target.value }))}
                  placeholder="0" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Términos y condiciones de venta</label>
                <textarea value={b2bForm.b2b_terms} onChange={e => setB2bForm(f => ({ ...f, b2b_terms: e.target.value }))}
                  placeholder="Condiciones de pago, despacho, garantías..."
                  rows={3} className={`${inputCls} resize-none`} />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowSettings(false)}
                className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={saveB2bSettings}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700">
                Guardar perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE COBRO B2B ─────────────────────────────────────────────── */}
      {showPayModal && payModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Header */}
            <div className="bg-emerald-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white font-black text-lg">Cobro B2B</h2>
                <p className="text-emerald-100 text-xs mt-0.5">Pedido {payModalOrder.order_number}</p>
              </div>
              <button onClick={() => setShowPayModal(false)} className="text-emerald-200 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Detalle del pedido */}
            <div className="px-6 pt-5 pb-3">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-slate-500">Cliente</span>
                <span className="font-bold text-slate-800">{payModalOrder.buyer_name}</span>
              </div>

              {/* Items */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 mb-4">
                {payModalOrder.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{item.product_name}</p>
                      <p className="text-xs text-slate-400">{item.quantity} × {formatMoney(item.unit_price)}</p>
                    </div>
                    <p className="text-sm font-bold text-slate-800 ml-3">{formatMoney(item.total)}</p>
                  </div>
                ))}
                <div className="flex justify-between items-center px-4 py-3 bg-emerald-50">
                  <span className="font-black text-emerald-800">TOTAL</span>
                  <span className="font-black text-emerald-700 text-lg">{formatMoney(payModalOrder.total_amount)}</span>
                </div>
              </div>

              {/* Método de pago */}
              <div className="mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Método de pago</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['CASH','CARD','TRANSFER','NEQUI','DAVIPLATA'] as const).map(m => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${payMethod === m ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                      {m === 'CASH' ? '💵 Efectivo' : m === 'CARD' ? '💳 Tarjeta' : m === 'TRANSFER' ? '🏦 Transferencia' : m === 'NEQUI' ? '📱 Nequi' : '📱 Daviplata'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto recibido */}
              {payMethod === 'CASH' && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Monto recibido</p>
                  <input
                    type="number"
                    value={payAmountReceived}
                    onChange={e => setPayAmountReceived(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400 text-right"
                    placeholder="0"
                  />
                  {parseFloat(payAmountReceived) > payModalOrder.total_amount && (
                    <div className="flex justify-between items-center mt-2 px-1">
                      <span className="text-sm text-slate-500">Cambio</span>
                      <span className="text-lg font-black text-blue-600">
                        {formatMoney(parseFloat(payAmountReceived) - payModalOrder.total_amount)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Botones */}
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowPayModal(false)}
                className="flex-1 py-3 border border-slate-300 text-slate-600 rounded-xl font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={processB2BPayment}
                className="flex-2 flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 flex items-center justify-center gap-2">
                <DollarSign size={16} /> Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default B2BMarketplace;