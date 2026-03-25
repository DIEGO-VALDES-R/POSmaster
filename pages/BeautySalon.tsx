import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Scissors, Clock, User, CheckCircle, XCircle,
  RefreshCw, Search, X, Edit2, DollarSign, BarChart2,
  Calendar, Trash2, Users, Tag, ShoppingCart, Bell,
  ChevronLeft, ChevronRight, MessageCircle, Mail,
  CreditCard, Banknote, Smartphone, AlertCircle,
  Check, Zap, TrendingUp, Lock, Package, Percent,
  FileText, ChevronDown, Filter, Eye,
  Grid, List, CalendarDays, Move, Settings, Save,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useNavigate, useLocation } from 'react-router-dom';
import ImportModuleModal, { ModuleType } from '../components/ImportModuleModal';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────
type ServiceStatus = 'WAITING' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
type Tab = 'dashboard' | 'catalogo' | 'equipo' | 'historial' | 'configuracion';
type CalendarView = 'day' | 'week' | 'month';

interface SalonService {
  id: string; company_id: string; name: string; category: string;
  price: number; duration_minutes: number; is_active: boolean;
}
interface Stylist {
  id: string; company_id: string; name: string; specialty: string;
  commission_pct: number; is_active: boolean;
}
interface ServiceOrder {
  id: string; company_id: string; client_name: string; client_phone?: string; client_email?: string;
  service_id: string; service_name: string; service_price: number;
  stylist_id: string | null; stylist_name: string | null;
  status: ServiceStatus; notes: string;
  scheduled_at: string | null;
  created_at: string; started_at: string | null; finished_at: string | null; invoice_id: string | null;
}
interface BlockedSlot {
  id: string; company_id: string; stylist_id: string;
  start_at: string; end_at: string; reason: string;
}

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<ServiceStatus, { label: string; color: string; bg: string; dot: string; icon: React.ReactNode }> = {
  WAITING:     { label: 'En espera',  color: '#92400e', bg: '#fef3c7', dot: '#f59e0b', icon: <Clock size={10}/> },
  ASSIGNED:    { label: 'Confirmada', color: '#1e40af', bg: '#dbeafe', dot: '#3b82f6', icon: <User size={10}/> },
  IN_PROGRESS: { label: 'En proceso', color: '#5b21b6', bg: '#ede9fe', dot: '#8b5cf6', icon: <Scissors size={10}/> },
  DONE:        { label: 'Finalizado', color: '#065f46', bg: '#d1fae5', dot: '#10b981', icon: <CheckCircle size={10}/> },
  CANCELLED:   { label: 'Cancelado',  color: '#991b1b', bg: '#fee2e2', dot: '#ef4444', icon: <XCircle size={10}/> },
};

const SERVICE_CATEGORIES = [
  { id: 'cabello',  label: '💇 Cabello',  services: ['Corte de cabello','Corte + lavado','Corte + peinado','Lavado','Peinado','Cepillado','Plancha','Rizos','Tinte completo','Retoque de raíz','Mechas / balayage','Keratina','Botox capilar','Tratamientos capilares'] },
  { id: 'unas',     label: '💅 Uñas',     services: ['Manicure','Pedicure','Manicure semipermanente','Pedicure spa','Uñas acrílicas','Uñas en gel','Decoración de uñas','Retiro de acrílico'] },
  { id: 'estetica', label: '💄 Estética', services: ['Maquillaje','Maquillaje profesional','Depilación cejas','Depilación facial','Limpieza facial','Tratamientos faciales'] },
  { id: 'otros',    label: '👁 Otros',    services: ['Diseño de cejas','Pestañas','Extensiones de pestañas','Lifting de pestañas'] },
];

// ── HELPERS CORREGIDOS ───────────────────────────────────────────────────────────────────

// Normalizar fecha ISO a objeto Date (maneja tanto UTC como strings locales)
const normalizeIso = (iso: string): Date | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return date;
};

// Formatear hora en hora local de Colombia (UTC-5)
const fmtTime = (iso: string): string => {
  const date = normalizeIso(iso);
  if (!date) return '—';
  return date.toLocaleTimeString('es-CO', { 
    timeZone: 'America/Bogota', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
};

// Formatear fecha en hora local de Colombia
const fmtDate = (iso: string): string => {
  const date = normalizeIso(iso);
  if (!date) return '—';
  return date.toLocaleDateString('es-CO', { 
    timeZone: 'America/Bogota', 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  });
};

// Obtener la parte de la fecha (YYYY-MM-DD) en hora local
const getDatePart = (iso: string): string => {
  const date = normalizeIso(iso);
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Convertir Date local a string ISO para guardar en UTC
const isoLocal = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
};

// Obtener la fecha actual en formato local YYYY-MM-DD
const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Verificar si dos fechas son el mismo día en hora local
const isSameDay = (d1: Date, d2: Date): boolean => {
  return toLocalDateStr(d1) === toLocalDateStr(d2);
};

// Formatear moneda
const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7am – 9pm

// Helpers para vista semanal/mensual
const getWeekDays = (date: Date): Date[] => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 7 }, (_, i) => {
    const next = new Date(monday);
    next.setDate(monday.getDate() + i);
    return next;
  });
};

const getMonthDays = (date: Date): Date[] => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];
  
  const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  for (let i = startPadding; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }
  
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  
  const endPadding = 7 - (days.length % 7);
  for (let i = 1; i <= endPadding && days.length % 7 !== 0; i++) {
    days.push(new Date(year, month + 1, i));
  }
  
  return days;
};

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase() || '').join('');

const AVATAR_COLORS = ['#6366f1','#ec4899','#14b8a6','#f59e0b','#8b5cf6','#10b981','#ef4444','#3b82f6','#f97316'];
const avatarColor = (name: string) => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

// ── SKELETON COMPONENT ────────────────────────────────────────────────────────
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />
);

const KPISkeleton = () => (
  <div className="grid grid-cols-4 gap-3 px-5 pt-4 flex-shrink-0">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-12" />
        </div>
      </div>
    ))}
  </div>
);

const CalendarSkeleton = () => (
  <div className="flex-1 bg-white rounded-b-2xl rounded-tr-2xl border border-slate-200 shadow-sm p-4 space-y-3">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="h-3 w-12 flex-shrink-0" />
        <Skeleton className={`h-12 rounded-xl flex-1`} style={{ opacity: 1 - i * 0.12 } as any} />
      </div>
    ))}
  </div>
);

// ── SUCCESS ANIMATION ─────────────────────────────────────────────────────────
const SuccessCheck: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div className="bg-emerald-500 text-white rounded-full w-20 h-20 flex items-center justify-center shadow-2xl animate-bounce">
        <Check size={40} strokeWidth={3} />
      </div>
    </div>
  );
};

// ── MODAL ─────────────────────────────────────────────────────────────────────
const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; brandColor: string }> =
  ({ title, onClose, children, brandColor }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X size={17}/>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const BeautySalon: React.FC = () => {
  const { company, updateCompanyConfig } = useDatabase() as any;
  const navigate    = useNavigate();
  const location    = useLocation();
  const companyId   = company?.id;
  const brandColor  = (company?.config as any)?.primary_color || '#6366f1';
  const defaultGreeting = '¡qué alegría tenerte en nuestra agenda!';
  const [whatsappGreeting, setWhatsappGreeting] = useState<string>(
    (company?.config as any)?.whatsapp_greeting || defaultGreeting
  );
  const [savingGreeting, setSavingGreeting] = useState(false);

  const [orders, setOrders]         = useState<ServiceOrder[]>([]);
  const [services, setServices]     = useState<SalonService[]>([]);
  const [stylists, setStylists]     = useState<Stylist[]>([]);
  const [blockedSlots, setBlocked]  = useState<BlockedSlot[]>([]);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState<Tab>('dashboard');
  const [agendaDate, setAgendaDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<CalendarView>('day');
  const [sendingReminder, setSendingReminder] = useState<string|null>(null);
  const [importModal, setImportModal] = useState<ModuleType|null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const [showActivePanel, setShowActivePanel] = useState(true);

  const [histPage, setHistPage]   = useState(0);
  const HIST_PAGE_SIZE            = 20;

  const [showNewOrder, setShowNewOrder]         = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showStylistModal, setShowStylistModal] = useState(false);
  const [showBlockModal, setShowBlockModal]     = useState(false);
  const [showCommissions, setShowCommissions]   = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [editingService, setEditingService]     = useState<SalonService|null>(null);
  const [editingStylist, setEditingStylist]     = useState<Stylist|null>(null);
  const [detailOrder, setDetailOrder]           = useState<ServiceOrder|null>(null);
  const [quickSaleOrder, setQuickSaleOrder]     = useState<ServiceOrder|null>(null);
  const [payMethod, setPayMethod] = useState<'efectivo'|'tarjeta'|'transferencia'>('efectivo');

  const defaultOrderForm = { client_name:'', client_phone:'', client_email:'', service_id:'', stylist_id:'', notes:'', scheduled_at:'' };
  const [orderForm, setOrderForm]     = useState(defaultOrderForm);
  const [orderErrors, setOrderErrors] = useState<Record<string,string>>({});
  const [serviceForm, setServiceForm] = useState({ name:'', category:'cabello', price:'', duration_minutes:'30' });
  const [stylistForm, setStylistForm] = useState({ name:'', specialty:'', commission_pct:'10' });
  const [blockForm, setBlockForm]     = useState({ stylist_id:'', start_at:'', end_at:'', reason:'Almuerzo' });
  const [rescheduleForm, setRescheduleForm] = useState({ scheduled_at: '' });
  const [saving, setSaving]           = useState(false);
  const [searchQ, setSearchQ]         = useState('');
  const [histFilter, setHistFilter]   = useState<ServiceStatus|''>('');

  const realtimeRef = useRef<any>(null);

  useEffect(() => {
    const saved = (company?.config as any)?.whatsapp_greeting;
    if (saved) setWhatsappGreeting(saved);
  }, [company]);

  // ── LOAD ──────────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('salon_orders')
        .select('*')
        .eq('company_id', companyId)
        .order('scheduled_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setOrders((data || []) as ServiceOrder[]);
    } catch (err) {
      console.error('Error loading orders:', err);
    }
  }, [companyId]);

  const loadServices = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data } = await supabase
        .from('salon_services').select('*')
        .eq('company_id', companyId).eq('is_active', true).order('category, name');
      setServices((data || []) as SalonService[]);
    } catch (err) {
      console.error('Error loading services:', err);
    }
  }, [companyId]);

  const loadStylists = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data } = await supabase
        .from('salon_stylists').select('*')
        .eq('company_id', companyId).eq('is_active', true).order('name');
      setStylists((data || []) as Stylist[]);
    } catch (err) {
      console.error('Error loading stylists:', err);
    }
  }, [companyId]);

  const loadBlocked = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('salon_blocked_slots').select('*')
        .eq('company_id', companyId)
        .gte('end_at', new Date().toISOString());
      if (!error) setBlocked((data || []) as BlockedSlot[]);
    } catch {
      // tabla aún no creada — silencioso
    }
  }, [companyId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOrders(), loadServices(), loadStylists(), loadBlocked()]);
    setLoading(false);
  }, [loadOrders, loadServices, loadStylists, loadBlocked]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Manejo del retorno del POS
  useEffect(() => {
    if (!companyId) return;
    const params = new URLSearchParams(location.search);
    const salonOrderId = params.get('salon');
    const paid         = params.get('paid');
    const invoiceId    = params.get('invoice_id');

    if (!salonOrderId) return;

    window.history.replaceState({}, '', location.pathname);

    if (paid === '1' && invoiceId) {
      const isValidUUID = (str: string) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
      };

      if (!isValidUUID(invoiceId)) {
        console.error('invoice_id no es un UUID válido:', invoiceId);
        toast.error('Error: ID de factura inválido');
        return;
      }

      supabase
        .from('salon_orders')
        .update({ invoice_id: invoiceId })
        .eq('id', salonOrderId)
        .eq('company_id', companyId)
        .then(({ error }) => {
          if (error) {
            console.error('Error marcando salon_order cobrada:', error);
            toast.error('Error al confirmar el cobro: ' + error.message);
          } else {
            toast.success('✅ Cobro registrado correctamente');
            setQuickSaleOrder(null);
            loadOrders();
          }
        });
    }
  }, [location.search, companyId, loadOrders]);

  // REALTIME
  useEffect(() => {
    if (!companyId) return;
    
    let channel: any = null;
    
    try {
      channel = supabase
        .channel(`salon_orders_${companyId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'salon_orders',
          filter: `company_id=eq.${companyId}`,
        }, () => {
          loadOrders();
        })
        .subscribe();
      realtimeRef.current = channel;
    } catch (err) {
      console.error('Realtime error:', err);
    }
    
    return () => { 
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          // Ignorar errores al limpiar
        }
      }
    };
  }, [companyId, loadOrders]);

  // ── COMPUTED CORREGIDOS ──────────────────────────────────────────────────────────────
  const todayStr = toLocalDateStr(new Date());
  const agendaDayStr = toLocalDateStr(agendaDate);

  const activeOrders = useMemo(() =>
    orders.filter(o => !['DONE','CANCELLED'].includes(o.status)),
    [orders]
  );

  const activeInProgress = useMemo(() =>
    activeOrders.filter(o => o.status === 'IN_PROGRESS'),
    [activeOrders]
  );

  const todayDone = useMemo(() =>
    orders.filter(o => {
      if (o.status !== 'DONE') return false;
      if (!o.finished_at) return false;
      const finishedDate = normalizeIso(o.finished_at);
      if (!finishedDate) return false;
      return toLocalDateStr(finishedDate) === todayStr;
    }),
    [orders, todayStr]
  );

  const todayRevenue = useMemo(() =>
    todayDone.reduce((s, o) => s + o.service_price, 0),
    [todayDone]
  );

  const todayOrders = useMemo(() =>
    orders.filter(o => {
      if (!o.scheduled_at) return false;
      const appointmentDate = normalizeIso(o.scheduled_at);
      if (!appointmentDate) return false;
      return toLocalDateStr(appointmentDate) === todayStr;
    }),
    [orders, todayStr]
  );

  const waiting = useMemo(() =>
    activeOrders.filter(o => o.status === 'WAITING'),
    [activeOrders]
  );

  const agendaOrders = useMemo(() =>
    orders
      .filter(o => {
        if (!o.scheduled_at) return false;
        const appointmentDate = normalizeIso(o.scheduled_at);
        if (!appointmentDate) return false;
        return toLocalDateStr(appointmentDate) === agendaDayStr;
      })
      .sort((a, b) => {
        const dateA = normalizeIso(a.scheduled_at);
        const dateB = normalizeIso(b.scheduled_at);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
      }),
    [orders, agendaDayStr]
  );

  const weekDays = useMemo(() => getWeekDays(agendaDate), [agendaDate]);
  const weekOrders = useMemo(() => {
    const startStr = toLocalDateStr(weekDays[0]);
    const endStr = toLocalDateStr(weekDays[6]);
    return orders.filter(o =>
      o.scheduled_at && getDatePart(o.scheduled_at) >= startStr && getDatePart(o.scheduled_at) <= endStr
    );
  }, [orders, weekDays]);

  const monthDays = useMemo(() => getMonthDays(agendaDate), [agendaDate]);
  const monthOrders = useMemo(() => {
    const startStr = toLocalDateStr(monthDays[0]);
    const endStr = toLocalDateStr(monthDays[monthDays.length - 1]);
    return orders.filter(o =>
      o.scheduled_at && getDatePart(o.scheduled_at) >= startStr && getDatePart(o.scheduled_at) <= endStr
    );
  }, [orders, monthDays]);

  const upcomingToday = useMemo(() =>
    orders
      .filter(o => {
        if (!o.scheduled_at) return false;
        if (['DONE','CANCELLED'].includes(o.status)) return false;
        const appointmentDate = normalizeIso(o.scheduled_at);
        if (!appointmentDate) return false;
        return toLocalDateStr(appointmentDate) === todayStr;
      })
      .sort((a, b) => {
        const dateA = normalizeIso(a.scheduled_at);
        const dateB = normalizeIso(b.scheduled_at);
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 6),
    [orders, todayStr]
  );

  const historyOrders = useMemo(() =>
    orders.filter(o => ['DONE','CANCELLED'].includes(o.status)),
    [orders]
  );

  const filteredHistory = useMemo(() =>
    historyOrders.filter(o => {
      const matchQ = !searchQ ||
        o.client_name.toLowerCase().includes(searchQ.toLowerCase()) ||
        o.service_name.toLowerCase().includes(searchQ.toLowerCase());
      const matchF = !histFilter || o.status === histFilter;
      return matchQ && matchF;
    }),
    [historyOrders, searchQ, histFilter]
  );

  const pagedHistory = useMemo(() =>
    filteredHistory.slice(histPage * HIST_PAGE_SIZE, (histPage + 1) * HIST_PAGE_SIZE),
    [filteredHistory, histPage]
  );

  const pendingPayment = useMemo(() =>
    todayDone.filter(o => !o.invoice_id),
    [todayDone]
  );

  const commissionsThisMonth = useMemo(() => {
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    return stylists.map(stl => {
      const doneThisMonth = orders.filter(o =>
        o.status === 'DONE' &&
        o.stylist_id === stl.id &&
        o.finished_at &&
        o.finished_at.startsWith(monthStr)
      );
      const total = doneThisMonth.reduce((s, o) => s + o.service_price, 0);
      const pct   = stl.commission_pct || 10;
      return {
        stylist: stl,
        services_count: doneThisMonth.length,
        total_revenue: total,
        commission: total * pct / 100,
      };
    });
  }, [stylists, orders]);

  // ── FORM VALIDATION ───────────────────────────────────────────────────────
  const validateOrderForm = (): boolean => {
    const errs: Record<string,string> = {};
    if (!orderForm.client_name.trim()) errs.client_name = 'El nombre es obligatorio';
    if (!orderForm.service_id)         errs.service_id  = 'Selecciona un servicio';
    if (orderForm.client_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderForm.client_email))
      errs.client_email = 'Email inválido';
    if (orderForm.client_phone && !/^\d{7,15}$/.test(orderForm.client_phone.replace(/\s/g,'')))
      errs.client_phone = 'Teléfono inválido';
    if (orderForm.scheduled_at) {
      const dt = new Date(orderForm.scheduled_at);
      const now = new Date();
      if (dt < now && !editingService)
        errs.scheduled_at = 'No puedes agendar en el pasado';
    }
    setOrderErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const triggerSuccess = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 1200);
  };

  // ── ACTIONS CORREGIDAS ───────────────────────────────────────────────────────────────
  const handleCreateOrder = async () => {
    if (!companyId) return;
    if (!validateOrderForm()) return;
    setSaving(true);
    const svc = services.find(s => s.id === orderForm.service_id);
    const stl = stylists.find(s => s.id === orderForm.stylist_id);
    
    try {
      let scheduledAtUTC = null;
      if (orderForm.scheduled_at) {
        const localDate = new Date(orderForm.scheduled_at);
        scheduledAtUTC = localDate.toISOString();
      }
      
      const { error } = await supabase.from('salon_orders').insert({
        company_id: companyId, 
        client_name: orderForm.client_name.trim(),
        client_phone: orderForm.client_phone || null,
        client_email: orderForm.client_email || null,
        service_id: orderForm.service_id, 
        service_name: svc?.name || '',
        service_price: svc?.price || 0,
        stylist_id: orderForm.stylist_id || null,
        stylist_name: stl?.name || null,
        status: orderForm.stylist_id ? 'ASSIGNED' : 'WAITING',
        notes: orderForm.notes,
        scheduled_at: scheduledAtUTC,
      });
      
      if (error) throw error;

      triggerSuccess();
      toast.success('Cita registrada ✅');
      setShowNewOrder(false);
      setOrderForm(defaultOrderForm);
      setOrderErrors({});
      
      await loadOrders();
      setTimeout(() => loadOrders(), 1500);
      
      if (orderForm.scheduled_at) {
        setAgendaDate(new Date(orderForm.scheduled_at));
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error al crear la cita');
    } finally {
      setSaving(false);
    }
  };

  const updateOrderStatus = async (id: string, status: ServiceStatus) => {
    const extra: Record<string,any> = {};
    if (status === 'IN_PROGRESS') extra.started_at  = new Date().toISOString();
    if (status === 'DONE')        extra.finished_at = new Date().toISOString();
    
    try {
      const { error } = await supabase.from('salon_orders').update({ status, ...extra }).eq('id', id);
      if (error) throw error;
      
      if (status === 'DONE') triggerSuccess();
      await loadOrders();
      if (detailOrder?.id === id) setDetailOrder(prev => prev ? { ...prev, status, ...extra } : null);
      
      toast.success(`Estado actualizado a ${STATUS_CONFIG[status].label}`);
    } catch (error: any) {
      toast.error(error?.message || 'Error al actualizar');
    }
  };

  const handleReschedule = async () => {
    if (!detailOrder || !rescheduleForm.scheduled_at) {
      toast.error('Selecciona una fecha y hora');
      return;
    }
    
    setSaving(true);
    try {
      const localDate = new Date(rescheduleForm.scheduled_at);
      const scheduledAtUTC = localDate.toISOString();
      
      const { error } = await supabase
        .from('salon_orders')
        .update({ scheduled_at: scheduledAtUTC })
        .eq('id', detailOrder.id);
      
      if (error) throw error;
      
      toast.success('Cita reprogramada ✅');
      setShowRescheduleModal(false);
      setDetailOrder(prev => prev ? { ...prev, scheduled_at: scheduledAtUTC } : null);
      setAgendaDate(new Date(rescheduleForm.scheduled_at));
      await loadOrders();
    } catch (error: any) {
      toast.error(error?.message || 'Error al reprogramar');
    } finally {
      setSaving(false);
    }
  };

  const assignStylist = async (orderId: string, stylistId: string) => {
    const stl = stylists.find(s => s.id === stylistId);
    try {
      const { error } = await supabase.from('salon_orders').update({
        stylist_id: stylistId, stylist_name: stl?.name || '', status: 'ASSIGNED',
      }).eq('id', orderId);
      
      if (error) throw error;
      
      toast.success(`Asignado a ${stl?.name}`);
      await loadOrders();
    } catch (error: any) {
      toast.error(error?.message || 'Error al asignar');
    }
  };

  const sendReminder = async (order: ServiceOrder, channel: 'whatsapp'|'email') => {
    if (channel === 'whatsapp' && !order.client_phone) { 
      toast.error('Sin teléfono registrado'); 
      return; 
    }
    if (channel === 'email' && !order.client_email) { 
      toast.error('Sin email registrado'); 
      return; 
    }
    if (!order.scheduled_at) { 
      toast.error('Sin fecha programada'); 
      return; 
    }
    
    setSendingReminder(order.id + channel);
    
    try {
      const apptDate = normalizeIso(order.scheduled_at);
      if (!apptDate) throw new Error('Fecha inválida');
      
      if (channel === 'whatsapp') {
        const dateStr = apptDate.toLocaleDateString('es-CO', {
          timeZone: 'America/Bogota',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
        const timeStr = apptDate.toLocaleTimeString('es-CO', {
          timeZone: 'America/Bogota',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        
        const greeting = whatsappGreeting || defaultGreeting;

        const stylistLine = order.stylist_name
          ? `\u2728 Tu estilista: *${order.stylist_name}*`
          : null;

        const message = [
          `\uD83D\uDC93 Hola *${order.client_name}*, ${greeting}`,
          ``,
          `Te recordamos que tienes una cita en *${company?.name || 'nuestro sal\u00f3n'}* y ya estamos listos para recibirte:`,
          ``,
          `\uD83D\uDCC5 *${dateStr}* a las *${timeStr}*`,
          `\uD83D\uDC87 Tu servicio agendado es: *${order.service_name}*`,
          stylistLine,
          ``,
          `Si necesitas cambiar tu cita, agregar m\u00e1s servicios o tienes alguna pregunta, \u00a1escr\u00edbenos con confianza! Estamos aqu\u00ed para ti.`,
          ``,
          `\uD83D\uDC85 \u00a1Nos vemos pronto!`,
          `_El equipo de ${company?.name || 'nuestro sal\u00f3n'}_`,
        ].filter(line => line !== null).join('\n');
        
        const phone = order.client_phone?.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/57${phone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        toast.success('Abriendo WhatsApp...');
      } else {
        const { error } = await supabase.functions.invoke('salon-reminder', {
          body: {
            company_id: companyId, order_id: order.id, channel,
            client_name: order.client_name, client_phone: order.client_phone,
            client_email: order.client_email, service_name: order.service_name,
            stylist_name: order.stylist_name, 
            scheduled_at: apptDate.toISOString(),
            company_name: company?.name,
          },
        });
        if (error) throw new Error(error.message);
        toast.success('Recordatorio enviado por Email ✅');
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSendingReminder(null);
    }
  };

  const handleSaveService = async () => {
    if (!companyId || !serviceForm.name) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    const payload = {
      company_id: companyId, name: serviceForm.name, category: serviceForm.category,
      price: parseFloat(serviceForm.price) || 0,
      duration_minutes: parseInt(serviceForm.duration_minutes) || 30,
      is_active: true,
    };
    
    try {
      const { error } = editingService
        ? await supabase.from('salon_services').update(payload).eq('id', editingService.id)
        : await supabase.from('salon_services').insert(payload);
      
      if (error) throw error;
      
      toast.success(editingService ? 'Servicio actualizado' : 'Servicio creado');
      setShowServiceModal(false);
      setEditingService(null);
      setServiceForm({ name:'', category:'cabello', price:'', duration_minutes:'30' });
      loadServices();
    } catch (error: any) {
      toast.error(error?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('¿Eliminar este servicio?')) return;
    await supabase.from('salon_services').update({ is_active: false }).eq('id', id);
    toast.success('Servicio eliminado');
    loadServices();
  };

  const handleSaveStylist = async () => {
    if (!companyId || !stylistForm.name) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: stylistForm.name,
      specialty: stylistForm.specialty,
      commission_pct: parseFloat(stylistForm.commission_pct) || 10,
      is_active: true,
    };
    
    try {
      const { error } = editingStylist
        ? await supabase.from('salon_stylists').update(payload).eq('id', editingStylist.id)
        : await supabase.from('salon_stylists').insert(payload);
      
      if (error) throw error;
      
      toast.success(editingStylist ? 'Estilista actualizado' : 'Estilista creado');
      setShowStylistModal(false);
      setEditingStylist(null);
      setStylistForm({ name:'', specialty:'', commission_pct:'10' });
      loadStylists();
    } catch (error: any) {
      toast.error(error?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStylist = async (id: string) => {
    if (!confirm('¿Eliminar este estilista?')) return;
    await supabase.from('salon_stylists').update({ is_active: false }).eq('id', id);
    toast.success('Estilista eliminado');
    loadStylists();
  };

  const handleSaveBlock = async () => {
    if (!companyId || !blockForm.stylist_id || !blockForm.start_at || !blockForm.end_at) {
      toast.error('Completa todos los campos'); return;
    }
    if (new Date(blockForm.end_at) <= new Date(blockForm.start_at)) {
      toast.error('La hora de fin debe ser después del inicio'); return;
    }
    setSaving(true);
    
    try {
      const { error } = await supabase.from('salon_blocked_slots').insert({
        company_id: companyId,
        stylist_id: blockForm.stylist_id,
        start_at: new Date(blockForm.start_at).toISOString(),
        end_at: new Date(blockForm.end_at).toISOString(),
        reason: blockForm.reason,
      });
      
      if (error) throw error;
      
      toast.success('Bloqueo registrado');
      setShowBlockModal(false);
      setBlockForm({ stylist_id:'', start_at:'', end_at:'', reason:'Almuerzo' });
      loadBlocked();
    } catch (error: any) {
      toast.error(error?.message || 'Error al bloquear');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickSalePOS = (order: ServiceOrder) => {
    const returnUrl = encodeURIComponent(`/salon?salon=${order.id}&paid=1`);
    const p = new URLSearchParams({
      salon:    order.id,
      ticket:   order.id.slice(0,8).toUpperCase(),
      cliente:  order.client_name,
      cedula:   '',
      tel:      order.client_phone || '',
      total:    String(order.service_price),
      abono:    '0',
      servicio: order.service_name,
      returnUrl,
    });
    navigate(`/pos?${p.toString()}`);
  };

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
      <KPISkeleton />
      <div className="flex-1 px-5 pt-3 pb-5 flex gap-4 mt-2">
        <CalendarSkeleton />
        <div className="w-72 space-y-3">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <SuccessCheck show={showSuccess} />

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm"
            style={{ background: brandColor }}>
            <Scissors size={17}/>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">{company?.name || 'Salón de Belleza'}</h1>
            <p className="text-xs text-slate-400 capitalize">
              {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <RefreshCw size={15}/>
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-full border border-emerald-200">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
            <span className="text-[10px] text-emerald-700 font-semibold">En vivo</span>
          </div>
          <button
            onClick={() => {
              setOrderForm({ ...defaultOrderForm, scheduled_at: isoLocal(new Date()) });
              setOrderErrors({});
              setShowNewOrder(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold shadow-sm"
            style={{ background: brandColor }}>
            <Plus size={15}/> Nueva Cita
          </button>
        </div>
      </div>

      {/* ── KPI ROW ── */}
      <div className="grid grid-cols-4 gap-3 px-5 pt-4 flex-shrink-0">
        {[
          { label: 'Ingresos hoy',    value: fmt(todayRevenue),  icon: <DollarSign size={18}/>,  color: '#10b981', bg: '#ecfdf5' },
          { label: 'Citas hoy',       value: todayOrders.length, icon: <Calendar size={18}/>,    color: '#6366f1', bg: '#eef2ff' },
          { label: 'Finalizadas',     value: todayDone.length,   icon: <CheckCircle size={18}/>, color: '#0ea5e9', bg: '#f0f9ff' },
          { label: 'En espera',       value: waiting.length,     icon: <Clock size={18}/>,       color: '#f59e0b', bg: '#fffbeb' },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: k.bg, color: k.color }}>
              {k.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 truncate">{k.label}</p>
              <p className="text-xl font-bold text-slate-800">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div className="flex items-center gap-0.5 px-5 pt-3 flex-shrink-0">
        {([
          { id: 'dashboard',      label: 'Dashboard',      icon: <BarChart2 size={14}/> },
          { id: 'catalogo',       label: 'Catálogo',       icon: <Tag size={14}/> },
          { id: 'equipo',         label: 'Equipo',         icon: <Users size={14}/> },
          { id: 'historial',      label: 'Historial',      icon: <Clock size={14}/> },
          { id: 'configuracion',  label: 'Configuración',  icon: <Settings size={14}/> },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === tab.id
                ? 'bg-white border-indigo-500 text-indigo-600 shadow-sm'
                : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── CONTENT AREA ── */}
      <div className="flex-1 overflow-hidden px-5 pb-5 min-h-0">

        {/* ════════════ DASHBOARD ════════════ */}
        {activeTab === 'dashboard' && (
          <div className="h-full flex gap-4 pt-0">

            {/* ── Calendario ── */}
            <div className="flex-1 bg-white rounded-b-2xl rounded-tr-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-w-0">
              {/* Header fecha con selector de vista */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                <button onClick={() => {
                  if (calendarView === 'day') {
                    const d = new Date(agendaDate); d.setDate(d.getDate()-1); setAgendaDate(d);
                  } else if (calendarView === 'week') {
                    const d = new Date(agendaDate); d.setDate(d.getDate()-7); setAgendaDate(d);
                  } else {
                    const d = new Date(agendaDate); d.setMonth(d.getMonth()-1); setAgendaDate(d);
                  }
                }}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500">
                  <ChevronLeft size={16}/>
                </button>
                
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-slate-700 capitalize">
                    {calendarView === 'day' && agendaDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {calendarView === 'week' && `${weekDays[0].toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} - ${weekDays[6].toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`}
                    {calendarView === 'month' && agendaDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
                    <span className="text-xs text-slate-400 font-normal ml-2">
                      ({calendarView === 'day' ? agendaOrders.length : calendarView === 'week' ? weekOrders.length : monthOrders.length} citas)
                    </span>
                  </p>
                  <button onClick={() => {
                    setBlockForm({ stylist_id: stylists[0]?.id || '', start_at: isoLocal(agendaDate), end_at: isoLocal(agendaDate), reason: 'Almuerzo' });
                    setShowBlockModal(true);
                  }}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200">
                    <Lock size={10}/> Bloquear tiempo
                  </button>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                    <button onClick={() => setCalendarView('day')}
                      className={`p-1.5 rounded-md transition-all ${calendarView === 'day' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                      <CalendarDays size={14}/>
                    </button>
                    <button onClick={() => setCalendarView('week')}
                      className={`p-1.5 rounded-md transition-all ${calendarView === 'week' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                      <Grid size={14}/>
                    </button>
                    <button onClick={() => setCalendarView('month')}
                      className={`p-1.5 rounded-md transition-all ${calendarView === 'month' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                      <List size={14}/>
                    </button>
                  </div>
                  
                  <button onClick={() => setAgendaDate(new Date())}
                    className="text-xs px-3 py-1 rounded-full font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100">
                    Hoy
                  </button>
                  <button onClick={() => {
                    if (calendarView === 'day') {
                      const d = new Date(agendaDate); d.setDate(d.getDate()+1); setAgendaDate(d);
                    } else if (calendarView === 'week') {
                      const d = new Date(agendaDate); d.setDate(d.getDate()+7); setAgendaDate(d);
                    } else {
                      const d = new Date(agendaDate); d.setMonth(d.getMonth()+1); setAgendaDate(d);
                    }
                  }}
                    className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500">
                    <ChevronRight size={16}/>
                  </button>
                </div>
              </div>

              {/* ════════════ VISTA DIARIA ════════════ */}
              {calendarView === 'day' && (
                <div className="flex-1 overflow-auto">
                  {stylists.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 py-16">
                      <Users size={40} className="opacity-20"/>
                      <p className="text-sm">Sin estilistas — agrega tu equipo primero</p>
                      <button onClick={() => setActiveTab('equipo')}
                        className="text-xs px-4 py-2 rounded-xl text-white font-semibold"
                        style={{ background: brandColor }}>
                        + Agregar estilista
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[600px]">
                      {/* Columna horas */}
                      <div className="w-14 flex-shrink-0 border-r border-slate-100">
                        <div className="h-12 border-b border-slate-100 bg-slate-50"/>
                        {HOURS.map(h => (
                          <div key={h} className="h-16 border-b border-slate-50 flex items-start justify-end pr-2 pt-1.5">
                            <span className="text-[11px] text-slate-400 font-mono leading-none">{String(h).padStart(2,'0')}:00</span>
                          </div>
                        ))}
                      </div>

                      {/* Columna "Sin asignar" */}
                      {(() => {
                        const unassigned = agendaOrders.filter(o => !o.stylist_id);
                        if (unassigned.length === 0) return null;
                        return (
                          <div className="flex-1 min-w-[130px] border-r border-slate-100 flex flex-col">
                            <div className="h-12 border-b border-slate-100 flex items-center justify-center gap-2 px-2 bg-amber-50 sticky top-0 z-10">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-300 text-amber-800 text-xs font-bold flex-shrink-0">?</div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-amber-700 truncate">Sin asignar</p>
                                <span className="text-[10px] text-amber-500">{unassigned.length} pendiente{unassigned.length !== 1 ? 's' : ''}</span>
                              </div>
                            </div>
                            <div className="relative flex-1">
                              {HOURS.map(h => (
                                <div key={h}
                                  onClick={() => {
                                    const d = new Date(agendaDate);
                                    d.setHours(h, 0, 0, 0);
                                    setOrderForm({ ...defaultOrderForm, scheduled_at: isoLocal(d) });
                                    setOrderErrors({});
                                    setShowNewOrder(true);
                                  }}
                                  className="h-16 border-b border-slate-50 hover:bg-amber-50/30 cursor-pointer"/>
                              ))}
                              {unassigned.map(o => {
                                const sc = STATUS_CONFIG[o.status];
                                const svc = services.find(s => s.id === o.service_id);
                                const dt = normalizeIso(o.scheduled_at);
                                if (!dt) return null;
                                const topPx = ((dt.getHours() - 7) * 60 + dt.getMinutes()) / 60 * 64;
                                const heightPx = Math.max((svc?.duration_minutes || 30) / 60 * 64, 44);
                                return (
                                  <div key={o.id}
                                    onClick={e => { e.stopPropagation(); setDetailOrder(o); }}
                                    className="absolute left-1 right-1 rounded-lg px-2 py-1.5 cursor-pointer hover:opacity-90 shadow-sm overflow-hidden"
                                    style={{ top: topPx, height: heightPx, background: sc.bg, borderLeft: `3px solid ${sc.dot}` }}>
                                    <p className="text-[11px] font-bold leading-tight" style={{ color: sc.color }}>{fmtTime(o.scheduled_at!)}</p>
                                    <p className="text-[11px] font-semibold text-slate-800 truncate">{o.client_name}</p>
                                    <p className="text-[10px] text-slate-500 truncate">{o.service_name}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Una columna por estilista */}
                      {stylists.map((stl) => {
                        const stlOrders  = agendaOrders.filter(o => o.stylist_id === stl.id);
                        const stlBlocked = blockedSlots.filter(b =>
                          b.stylist_id === stl.id &&
                          getDatePart(b.start_at) === agendaDayStr
                        );
                        const busy  = activeOrders.some(o => o.stylist_id === stl.id);
                        const color = avatarColor(stl.name);
                        return (
                          <div key={stl.id} className="flex-1 min-w-[130px] border-r border-slate-100 last:border-r-0 flex flex-col">
                            <div className="h-12 border-b border-slate-100 flex items-center justify-center gap-2 px-2 bg-slate-50 sticky top-0 z-10">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ background: color }}>
                                {initials(stl.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-700 truncate">{stl.name.split(' ')[0]}</p>
                                <div className="flex items-center gap-1">
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${busy ? 'bg-purple-500' : 'bg-green-400'}`}/>
                                  <span className="text-[10px] text-slate-400">{busy ? 'Ocupado' : 'Libre'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="relative flex-1">
                              {HOURS.map(h => (
                                <div key={h}
                                  onClick={() => {
                                    const d = new Date(agendaDate);
                                    d.setHours(h, 0, 0, 0);
                                    setOrderForm({ ...defaultOrderForm, stylist_id: stl.id, scheduled_at: isoLocal(d) });
                                    setOrderErrors({});
                                    setShowNewOrder(true);
                                  }}
                                  className="h-16 border-b border-slate-50 hover:bg-indigo-50/30 transition-colors cursor-pointer"/>
                              ))}

                              {stlBlocked.map(b => {
                                const dtS = normalizeIso(b.start_at);
                                const dtE = normalizeIso(b.end_at);
                                if (!dtS || !dtE) return null;
                                const topPx    = ((dtS.getHours() - 7) * 60 + dtS.getMinutes()) / 60 * 64;
                                const duration = (dtE.getTime() - dtS.getTime()) / 60000;
                                const heightPx = Math.max(duration / 60 * 64, 20);
                                return (
                                  <div key={b.id}
                                    className="absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden pointer-events-none"
                                    style={{
                                      top: topPx, height: heightPx,
                                      background: 'repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 4px, #e2e8f0 4px, #e2e8f0 8px)',
                                      borderLeft: '3px solid #94a3b8',
                                    }}>
                                    <p className="text-[10px] text-slate-500 font-semibold truncate flex items-center gap-1">
                                      <Lock size={8}/> {b.reason}
                                    </p>
                                  </div>
                                );
                              })}

                              {stlOrders.map(o => {
                                const sc  = STATUS_CONFIG[o.status];
                                const svc = services.find(s => s.id === o.service_id);
                                const dt  = normalizeIso(o.scheduled_at);
                                if (!dt) return null;
                                const topPx    = ((dt.getHours() - 7) * 60 + dt.getMinutes()) / 60 * 64;
                                const heightPx = Math.max((svc?.duration_minutes || 30) / 60 * 64, 44);
                                return (
                                  <div key={o.id}
                                    onClick={e => { e.stopPropagation(); setDetailOrder(o); }}
                                    className="absolute left-1 right-1 rounded-lg px-2 py-1.5 cursor-pointer hover:opacity-90 transition-opacity shadow-sm overflow-hidden"
                                    style={{
                                      top: topPx, height: heightPx,
                                      background: sc.bg,
                                      borderLeft: `3px solid ${sc.dot}`,
                                    }}>
                                    <div className="flex items-center gap-1">
                                      <span style={{ color: sc.color }}>{sc.icon}</span>
                                      <p className="text-[11px] font-bold leading-tight" style={{ color: sc.color }}>
                                        {fmtTime(o.scheduled_at!)}
                                      </p>
                                    </div>
                                    <p className="text-[11px] font-semibold text-slate-800 truncate leading-tight">{o.client_name}</p>
                                    <p className="text-[10px] text-slate-500 truncate leading-tight">{o.service_name}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ════════════ VISTA SEMANAL ════════════ */}
              {calendarView === 'week' && (
                <div className="flex-1 overflow-auto">
                  {stylists.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 py-16">
                      <Users size={40} className="opacity-20"/>
                      <p className="text-sm">Sin estilistas — agrega tu equipo primero</p>
                    </div>
                  ) : (
                    <div className="min-w-[800px]">
                      <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                        <div className="w-24 flex-shrink-0 p-2 border-r border-slate-100"/>
                        {weekDays.map((day, i) => {
                          const isToday = isSameDay(day, new Date());
                          const dayStr = toLocalDateStr(day);
                          const dayOrders = orders.filter(o => o.scheduled_at && getDatePart(o.scheduled_at) === dayStr);
                          return (
                            <div key={i} 
                              onClick={() => { setAgendaDate(day); setCalendarView('day'); }}
                              className={`flex-1 p-2 text-center border-r border-slate-100 cursor-pointer hover:bg-indigo-50 transition-colors ${isToday ? 'bg-indigo-50' : ''}`}>
                              <p className="text-[10px] text-slate-400 uppercase">{day.toLocaleDateString('es-CO', { weekday: 'short' })}</p>
                              <p className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>{day.getDate()}</p>
                              <p className="text-[10px] text-slate-400">{dayOrders.length} citas</p>
                            </div>
                          );
                        })}
                      </div>

                      {HOURS.map(h => (
                        <div key={h} className="flex border-b border-slate-100">
                          <div className="w-24 flex-shrink-0 p-2 border-r border-slate-100 text-[11px] text-slate-400 font-mono">
                            {String(h).padStart(2,'0')}:00
                          </div>
                          {weekDays.map((day, i) => {
                            const dayStr = toLocalDateStr(day);
                            const hourOrders = orders.filter(o => {
                              if (!o.scheduled_at) return false;
                              const od = normalizeIso(o.scheduled_at);
                              if (!od) return false;
                              return getDatePart(o.scheduled_at) === dayStr && od.getHours() === h;
                            });
                            const isToday = isSameDay(day, new Date());
                            return (
                              <div key={i} 
                                onClick={() => {
                                  const d = new Date(day);
                                  d.setHours(h, 0, 0, 0);
                                  setOrderForm({ ...defaultOrderForm, scheduled_at: isoLocal(d) });
                                  setOrderErrors({});
                                  setShowNewOrder(true);
                                }}
                                className={`flex-1 min-h-[48px] border-r border-slate-100 p-1 cursor-pointer hover:bg-indigo-50/50 transition-colors ${isToday ? 'bg-indigo-50/30' : ''}`}>
                                {hourOrders.slice(0, 2).map(o => (
                                  <div key={o.id}
                                    onClick={e => { e.stopPropagation(); setDetailOrder(o); }}
                                    className="text-[10px] p-1 rounded mb-0.5 truncate cursor-pointer hover:opacity-80"
                                    style={{ background: STATUS_CONFIG[o.status].bg, borderLeft: `2px solid ${STATUS_CONFIG[o.status].dot}` }}>
                                    {fmtTime(o.scheduled_at!)} {o.client_name}
                                  </div>
                                ))}
                                {hourOrders.length > 2 && (
                                  <p className="text-[9px] text-slate-400 text-center">+{hourOrders.length - 2} más</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ════════════ VISTA MENSUAL ════════════ */}
              {calendarView === 'month' && (
                <div className="flex-1 overflow-auto p-2">
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                      <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-2">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {monthDays.map((day, i) => {
                      const dayStr = toLocalDateStr(day);
                      const isToday = isSameDay(day, new Date());
                      const isCurrentMonth = day.getMonth() === agendaDate.getMonth();
                      const dayOrders = orders.filter(o => o.scheduled_at && getDatePart(o.scheduled_at) === dayStr);
                      
                      return (
                        <div key={i}
                          onClick={() => { setAgendaDate(day); setCalendarView('day'); }}
                          className={`min-h-[80px] p-1.5 rounded-lg cursor-pointer transition-colors border ${
                            isToday ? 'bg-indigo-50 border-indigo-200' :
                            isCurrentMonth ? 'bg-white border-slate-100 hover:border-indigo-200' :
                            'bg-slate-50 border-slate-100 text-slate-400'
                          }`}>
                          <p className={`text-xs font-bold mb-1 ${isToday ? 'text-indigo-600' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                            {day.getDate()}
                          </p>
                          <div className="space-y-0.5 overflow-hidden">
                            {dayOrders.slice(0, 3).map(o => (
                              <div key={o.id}
                                onClick={e => { e.stopPropagation(); setDetailOrder(o); }}
                                className="text-[9px] p-0.5 rounded truncate cursor-pointer"
                                style={{ background: STATUS_CONFIG[o.status].bg }}>
                                {o.client_name}
                              </div>
                            ))}
                            {dayOrders.length > 3 && (
                              <p className="text-[9px] text-slate-400">+{dayOrders.length - 3}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Panel derecho ── */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-y-auto pt-0 pb-2">

              {/* Próximas citas hoy */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock size={12} className="text-indigo-500"/> Próximas citas
                  </p>
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {upcomingToday.length} hoy
                  </span>
                </div>
                <div className="divide-y divide-slate-50 max-h-52 overflow-y-auto">
                  {upcomingToday.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-5">Sin citas pendientes hoy</p>
                  ) : upcomingToday.map(o => {
                    const sc = STATUS_CONFIG[o.status];
                    return (
                      <div key={o.id} onClick={() => setDetailOrder(o)}
                        className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex items-start gap-3 transition-colors">
                        <p className="text-xs font-bold text-indigo-600 flex-shrink-0 w-10 mt-0.5">{fmtTime(o.scheduled_at!)}</p>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{o.client_name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{o.service_name}</p>
                          {o.stylist_name && <p className="text-[10px] text-slate-400">✂️ {o.stylist_name}</p>}
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 mt-0.5 flex items-center gap-1"
                          style={{ background: sc.bg, color: sc.color }}>
                          {sc.icon} {sc.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sin asignar */}
              {waiting.length > 0 && (
                <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm overflow-hidden flex-shrink-0">
                  <div className="px-4 py-2.5 border-b border-amber-100 flex items-center gap-2">
                    <AlertCircle size={13} className="text-amber-600"/>
                    <p className="text-xs font-bold text-amber-800">Sin asignar ({waiting.length})</p>
                  </div>
                  <div className="divide-y divide-amber-50">
                    {waiting.slice(0,3).map(o => (
                      <div key={o.id} className="px-4 py-2.5 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{o.client_name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{o.service_name}</p>
                        </div>
                        {stylists.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) assignStylist(o.id, e.target.value); }}
                            className="text-[10px] border border-amber-200 rounded-lg px-1.5 py-1 bg-white text-slate-600 focus:outline-none flex-shrink-0">
                            <option value="">Asignar...</option>
                            {stylists.map(s => <option key={s.id} value={s.id}>{s.name.split(' ')[0]}</option>)}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Venta rápida / Listas para cobrar */}
              {quickSaleOrder ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                      <Zap size={12} className="text-amber-500"/> Venta Rápida
                    </p>
                    <button onClick={() => setQuickSaleOrder(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                      <X size={14}/>
                    </button>
                  </div>
                  <div className="px-4 pt-3 pb-2 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ background: avatarColor(quickSaleOrder.client_name) }}>
                      {initials(quickSaleOrder.client_name)}
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cliente</p>
                      <p className="text-sm font-bold text-slate-800">{quickSaleOrder.client_name}</p>
                    </div>
                  </div>
                  <div className="px-4 pb-3 space-y-1">
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                      <span className="text-xs text-slate-600">{quickSaleOrder.service_name}</span>
                      <span className="text-xs font-bold text-slate-800">{fmt(quickSaleOrder.service_price)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-sm font-bold text-slate-800">Total</span>
                      <span className="text-base font-bold" style={{ color: brandColor }}>{fmt(quickSaleOrder.service_price)}</span>
                    </div>
                  </div>
                  <div className="px-4 pb-3">
                    <p className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wide">Método de pago</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { id: 'efectivo',      label: 'Efectivo',   icon: <Banknote size={12}/> },
                        { id: 'tarjeta',       label: 'Tarjeta',    icon: <CreditCard size={12}/> },
                        { id: 'transferencia', label: 'Transfer.',  icon: <Smartphone size={12}/> },
                      ] as const).map(m => (
                        <button key={m.id} onClick={() => setPayMethod(m.id)}
                          className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-semibold transition-all ${
                            payMethod === m.id
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white'
                          }`}>
                          {m.icon}{m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="px-4 pb-4">
                    <button onClick={() => handleQuickSalePOS(quickSaleOrder)}
                      className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2"
                      style={{ background: brandColor }}>
                      <ShoppingCart size={13}/> Confirmar e ir al POS
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                      <ShoppingCart size={12} className="text-emerald-500"/> Listas para cobrar
                    </p>
                    {pendingPayment.length > 0 && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                        {pendingPayment.length}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-50">
                    {pendingPayment.length === 0 ? (
                      <p className="text-center text-slate-400 text-xs py-5">
                        {todayDone.length > 0 ? '✅ Todo cobrado' : 'Sin citas finalizadas aún'}
                      </p>
                    ) : pendingPayment.slice(0,5).map(o => (
                      <div key={o.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ background: avatarColor(o.client_name) }}>
                          {initials(o.client_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{o.client_name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{fmt(o.service_price)}</p>
                        </div>
                        <button onClick={() => setQuickSaleOrder(o)}
                          className="flex-shrink-0 text-[10px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 border border-emerald-200">
                          Cobrar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════ CATÁLOGO ════════════ */}
        {activeTab === 'catalogo' && (
          <div className="bg-white rounded-b-2xl rounded-tr-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
            style={{ height: 'calc(100vh - 300px)' }}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="font-bold text-slate-700">Catálogo de servicios ({services.length})</h2>
              <div className="flex gap-2">
                <button onClick={() => setImportModal('salon_servicios')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 text-pink-700 text-xs font-bold rounded-xl border border-pink-200 hover:bg-pink-100">
                  📥 Importar
                </button>
                <button
                  onClick={() => { setEditingService(null); setServiceForm({ name:'', category:'cabello', price:'', duration_minutes:'30' }); setShowServiceModal(true); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-white text-sm font-semibold"
                  style={{ background: brandColor }}>
                  <Plus size={14}/> Agregar
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1">
              {SERVICE_CATEGORIES.map(cat => {
                const catServices = services.filter(s => s.category === cat.id);
                if (!catServices.length) return null;
                return (
                  <div key={cat.id}>
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 sticky top-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{cat.label}</span>
                    </div>
                    {catServices.map(svc => (
                      <div key={svc.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 hover:bg-slate-50">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{svc.name}</p>
                          <p className="text-xs text-slate-400">{svc.duration_minutes} min</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-700 text-sm">{fmt(svc.price)}</span>
                          <button onClick={() => { setEditingService(svc); setServiceForm({ name: svc.name, category: svc.category, price: String(svc.price), duration_minutes: String(svc.duration_minutes) }); setShowServiceModal(true); }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600"><Edit2 size={14}/></button>
                          <button onClick={() => handleDeleteService(svc.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {!services.length && (
                <div className="text-center py-16 text-slate-400">
                  <Tag size={40} className="mx-auto mb-3 opacity-20"/>
                  <p>Sin servicios aún</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════ EQUIPO ════════════ */}
        {activeTab === 'equipo' && (
          <div className="bg-white rounded-b-2xl rounded-tr-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
            style={{ height: 'calc(100vh - 300px)' }}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="font-bold text-slate-700">Equipo de trabajo ({stylists.length})</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowCommissions(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 hover:bg-emerald-100">
                  <Percent size={12}/> Comisiones
                </button>
                <button onClick={() => { setEditingStylist(null); setStylistForm({ name:'', specialty:'', commission_pct:'10' }); setShowStylistModal(true); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-white text-sm font-semibold"
                  style={{ background: brandColor }}>
                  <Plus size={14}/> Agregar
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {stylists.map(stl => {
                  const activeNow  = activeOrders.filter(o => o.stylist_id === stl.id);
                  const todayCount = agendaOrders.filter(o => o.stylist_id === stl.id).length;
                  return (
                    <div key={stl.id} className="border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-base"
                          style={{ background: avatarColor(stl.name) }}>
                          {initials(stl.name)}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingStylist(stl); setStylistForm({ name: stl.name, specialty: stl.specialty, commission_pct: String(stl.commission_pct || 10) }); setShowStylistModal(true); }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600"><Edit2 size={13}/></button>
                          <button onClick={() => handleDeleteStylist(stl.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={13}/></button>
                        </div>
                      </div>
                      <p className="font-bold text-slate-800">{stl.name}</p>
                      {stl.specialty && <p className="text-xs text-slate-500 mt-0.5">{stl.specialty}</p>}
                      <div className="mt-2 flex items-center gap-1.5">
                        <Percent size={10} className="text-emerald-500"/>
                        <span className="text-xs text-emerald-700 font-semibold">{stl.commission_pct || 10}% comisión</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${activeNow.length ? 'bg-purple-500' : 'bg-green-400'}`}/>
                          <span className="text-xs text-slate-500">{activeNow.length ? `${activeNow.length} activo` : 'Libre'}</span>
                        </div>
                        <span className="text-xs text-slate-400">{todayCount} citas hoy</span>
                      </div>
                    </div>
                  );
                })}
                {!stylists.length && (
                  <div className="col-span-4 text-center py-16 text-slate-400">
                    <Users size={40} className="mx-auto mb-3 opacity-20"/>
                    <p>Sin estilistas registrados</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════ HISTORIAL ════════════ */}
        {activeTab === 'historial' && (
          <div className="bg-white rounded-b-2xl rounded-tr-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
            style={{ height: 'calc(100vh - 300px)' }}>
            <div className="p-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setHistPage(0); }}
                  placeholder="Buscar cliente o servicio..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-300"/>
              </div>
              <div className="flex items-center gap-1">
                <Filter size={13} className="text-slate-400"/>
                <select value={histFilter} onChange={e => { setHistFilter(e.target.value as any); setHistPage(0); }}
                  className="text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none text-slate-600 bg-white">
                  <option value="">Todos</option>
                  <option value="DONE">Finalizados</option>
                  <option value="CANCELLED">Cancelados</option>
                </select>
              </div>
              <span className="text-sm text-slate-400 font-medium">{filteredHistory.length} registros</span>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>{['Cliente','Servicio','Estilista','Cita','Estado','Precio','Cobrado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {pagedHistory.map(o => {
                    const sc = STATUS_CONFIG[o.status];
                    return (
                      <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => setDetailOrder(o)}>
                        <td className="px-4 py-3 font-semibold text-slate-800">{o.client_name}</td>
                        <td className="px-4 py-3 text-slate-600">{o.service_name}</td>
                        <td className="px-4 py-3 text-slate-500">{o.stylist_name || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 text-xs">
                          {o.scheduled_at
                            ? <span className="text-indigo-600 font-semibold">{fmtDate(o.scheduled_at)} {fmtTime(o.scheduled_at)}</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                            style={{ background: sc.bg, color: sc.color }}>
                            {sc.icon} {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-700">{fmt(o.service_price)}</td>
                        <td className="px-4 py-3">
                          {o.invoice_id
                            ? <span className="text-emerald-600 text-xs font-bold flex items-center gap-1"><Check size={12}/>Sí</span>
                            : <span className="text-slate-400 text-xs">Pendiente</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!pagedHistory.length && (
                <div className="text-center py-16 text-slate-400">
                  <Calendar size={40} className="mx-auto mb-3 opacity-20"/>
                  <p>Sin registros en el historial</p>
                </div>
              )}
            </div>
            {filteredHistory.length > HIST_PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 flex-shrink-0">
                <span className="text-xs text-slate-500">
                  {histPage * HIST_PAGE_SIZE + 1}–{Math.min((histPage+1)*HIST_PAGE_SIZE, filteredHistory.length)} de {filteredHistory.length}
                </span>
                <div className="flex gap-2">
                  <button disabled={histPage === 0} onClick={() => setHistPage(p => p-1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">
                    ← Anterior
                  </button>
                  <button disabled={(histPage+1)*HIST_PAGE_SIZE >= filteredHistory.length} onClick={() => setHistPage(p => p+1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ CONFIGURACIÓN ════════════ */}
        {activeTab === 'configuracion' && (
          <div className="bg-white rounded-b-2xl rounded-tr-2xl border border-slate-200 shadow-sm overflow-auto"
            style={{ height: 'calc(100vh - 300px)' }}>
            <div className="max-w-2xl mx-auto p-6 space-y-8">

              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <MessageCircle size={18} className="text-indigo-500"/> Mensaje de WhatsApp
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Personaliza el recordatorio que reciben tus clientes. Los datos de la cita se agregan automáticamente.
                </p>
              </div>

              <div className="bg-[#e9fbe5] rounded-2xl p-4 border border-[#c3f0b2] shadow-inner">
                <p className="text-[11px] font-bold text-[#5a8a4a] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Eye size={11}/> Vista previa del mensaje
                </p>
                <div className="bg-white rounded-xl p-4 shadow-sm text-sm text-slate-700 leading-relaxed whitespace-pre-line font-['system-ui']">
                  {[
                    `\uD83D\uDC93 Hola *Nombre del cliente*, ${whatsappGreeting}`,
                    ``,
                    `Te recordamos que tienes una cita en *${company?.name || 'Tu Salón'}* y ya estamos listos para recibirte:`,
                    ``,
                    `\uD83D\uDCC5 *martes, 24 de marzo* a las *6:15 p. m.*`,
                    `\uD83D\uDC87 Tu servicio agendado es: *Tinte completo*`,
                    `\u2728 Tu estilista: *Clara Luna*`,
                    ``,
                    `Si necesitas cambiar tu cita, agregar m\u00e1s servicios o tienes alguna pregunta, \u00a1escr\u00edbenos con confianza! Estamos aqu\u00ed para ti.`,
                    ``,
                    `\uD83D\uDC85 \u00a1Nos vemos pronto!`,
                    `_El equipo de ${company?.name || 'Tu Salón'}_`,
                  ].join('\n')}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Saludo personalizado <span className="text-slate-400 font-normal">(aparece después del nombre del cliente)</span>
                </label>
                <div className="flex items-start gap-2">
                  <span className="mt-2.5 text-slate-400 text-sm whitespace-nowrap">\uD83D\uDC93 Hola <em>*Nombre*</em>,</span>
                  <textarea
                    value={whatsappGreeting}
                    onChange={e => setWhatsappGreeting(e.target.value)}
                    rows={2}
                    maxLength={120}
                    placeholder="¡qué alegría tenerte en nuestra agenda!"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                  />
                </div>
                <p className="text-xs text-slate-400 text-right">{whatsappGreeting.length}/120 caracteres</p>

                <div className="flex flex-wrap gap-2 pt-1">
                  <p className="text-xs text-slate-500 w-full font-medium">Sugerencias rápidas:</p>
                  {[
                    '¡qué alegría tenerte en nuestra agenda!',
                    '¡ya estamos contando los minutos para verte!',
                    '¡tu cita está confirmada y nos encanta atenderte!',
                    '¡te esperamos con mucho cariño!',
                  ].map(s => (
                    <button key={s} onClick={() => setWhatsappGreeting(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={async () => {
                    setSavingGreeting(true);
                    const currentConfig = (company?.config as any) || {};
                    await updateCompanyConfig({
                      config: { ...currentConfig, whatsapp_greeting: whatsappGreeting.trim() || defaultGreeting }
                    });
                    setSavingGreeting(false);
                  }}
                  disabled={savingGreeting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-60"
                  style={{ background: brandColor }}>
                  {savingGreeting ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
                  {savingGreeting ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  onClick={() => setWhatsappGreeting(defaultGreeting)}
                  className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                  Restaurar predeterminado
                </button>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ════════════════════════════════════════════════════════════════════════ */}

      {/* MODAL: NUEVA CITA */}
      {showNewOrder && (
        <Modal title="Nueva Cita" onClose={() => { setShowNewOrder(false); setOrderErrors({}); }} brandColor={brandColor}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Cliente *</label>
              <input value={orderForm.client_name} onChange={e => setOrderForm(p => ({ ...p, client_name: e.target.value }))}
                placeholder="Nombre del cliente" autoFocus
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${orderErrors.client_name ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-indigo-400'}`}/>
              {orderErrors.client_name && <p className="text-xs text-red-500 mt-1">{orderErrors.client_name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                  <MessageCircle size={11} className="text-green-500"/> WhatsApp
                </label>
                <input value={orderForm.client_phone} onChange={e => setOrderForm(p => ({ ...p, client_phone: e.target.value }))}
                  placeholder="3001234567"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${orderErrors.client_phone ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-indigo-400'}`}/>
                {orderErrors.client_phone && <p className="text-xs text-red-500 mt-1">{orderErrors.client_phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                  <Mail size={11} className="text-blue-500"/> Email
                </label>
                <input type="email" value={orderForm.client_email} onChange={e => setOrderForm(p => ({ ...p, client_email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${orderErrors.client_email ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-indigo-400'}`}/>
                {orderErrors.client_email && <p className="text-xs text-red-500 mt-1">{orderErrors.client_email}</p>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide flex items-center gap-1">
                <Calendar size={11} style={{ color: brandColor }}/> Fecha y hora
              </label>
              <input type="datetime-local" value={orderForm.scheduled_at}
                onChange={e => setOrderForm(p => ({ ...p, scheduled_at: e.target.value }))}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${orderErrors.scheduled_at ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-indigo-400'}`}/>
              {orderErrors.scheduled_at && <p className="text-xs text-red-500 mt-1">{orderErrors.scheduled_at}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Servicio *</label>
              <select value={orderForm.service_id} onChange={e => setOrderForm(p => ({ ...p, service_id: e.target.value }))}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${orderErrors.service_id ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-indigo-400'}`}>
                <option value="">Seleccionar servicio...</option>
                {SERVICE_CATEGORIES.map(cat => {
                  const s2 = services.filter(s => s.category === cat.id);
                  if (!s2.length) return null;
                  return <optgroup key={cat.id} label={cat.label}>
                    {s2.map(s => <option key={s.id} value={s.id}>{s.name} — {fmt(s.price)}</option>)}
                  </optgroup>;
                })}
              </select>
              {orderErrors.service_id && <p className="text-xs text-red-500 mt-1">{orderErrors.service_id}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">
                Estilista <span className="text-slate-400 font-normal normal-case">(opcional)</span>
              </label>
              <select value={orderForm.stylist_id} onChange={e => setOrderForm(p => ({ ...p, stylist_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">Sin asignar</option>
                {stylists.map(s => <option key={s.id} value={s.id}>{s.name}{s.specialty ? ` — ${s.specialty}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Observaciones</label>
              <textarea value={orderForm.notes} onChange={e => setOrderForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Preferencias del cliente..." rows={2}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
            </div>
            {orderForm.service_id && (() => {
              const s = services.find(x => x.id === orderForm.service_id);
              return s ? (
                <div className="flex items-center justify-between bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                  <span className="text-sm text-indigo-700 font-semibold">{s.name} · {s.duration_minutes} min</span>
                  <span className="font-bold text-indigo-800">{fmt(s.price)}</span>
                </div>
              ) : null;
            })()}
            <button onClick={handleCreateOrder} disabled={saving}
              className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 shadow-sm transition-all active:scale-95"
              style={{ background: brandColor }}>
              {saving ? 'Guardando...' : '✅ Agendar Cita'}
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL: DETALLE */}
      {detailOrder && (
        <Modal title="Detalle de la Cita" onClose={() => setDetailOrder(null)} brandColor={brandColor}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-slate-50 rounded-2xl p-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                style={{ background: avatarColor(detailOrder.client_name) }}>
                {initials(detailOrder.client_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800">{detailOrder.client_name}</p>
                {detailOrder.client_phone && <p className="text-xs text-slate-500">📱 {detailOrder.client_phone}</p>}
                {detailOrder.client_email && <p className="text-xs text-slate-500">✉️ {detailOrder.client_email}</p>}
              </div>
              {(() => { const sc = STATUS_CONFIG[detailOrder.status]; return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
                  style={{ background: sc.bg, color: sc.color }}>
                  {sc.icon} {sc.label}
                </span>
              ); })()}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { l: 'Servicio',  v: detailOrder.service_name },
                { l: 'Precio',    v: fmt(detailOrder.service_price) },
                { l: 'Estilista', v: detailOrder.stylist_name || 'Sin asignar' },
                { l: 'Cita',      v: detailOrder.scheduled_at ? `${fmtDate(detailOrder.scheduled_at)} ${fmtTime(detailOrder.scheduled_at)}` : '—' },
              ].map(row => (
                <div key={row.l} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{row.l}</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{row.v}</p>
                </div>
              ))}
            </div>

            {detailOrder.invoice_id && (
              <div className="flex items-center gap-2 bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                <Check size={14} className="text-emerald-600"/>
                <p className="text-xs font-bold text-emerald-700">Cobrado — Ref: {detailOrder.invoice_id.slice(0,20)}</p>
              </div>
            )}

            {detailOrder.notes && (
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                <p className="text-xs font-bold text-amber-700 mb-1">📝 Observaciones</p>
                <p className="text-xs text-slate-700">{detailOrder.notes}</p>
              </div>
            )}

            {detailOrder.scheduled_at && !['DONE','CANCELLED'].includes(detailOrder.status) && (
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
                  <Bell size={12}/> Enviar recordatorio
                </p>
                <div className="flex gap-2">
                  <button onClick={() => sendReminder(detailOrder, 'whatsapp')}
                    disabled={!detailOrder.client_phone || sendingReminder === detailOrder.id+'whatsapp'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed">
                    <MessageCircle size={13}/>
                    {sendingReminder === detailOrder.id+'whatsapp' ? 'Abriendo...' : 'WhatsApp'}
                  </button>
                  <button onClick={() => sendReminder(detailOrder, 'email')}
                    disabled={!detailOrder.client_email || sendingReminder === detailOrder.id+'email'}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">
                    <Mail size={13}/>
                    {sendingReminder === detailOrder.id+'email' ? 'Enviando...' : 'Email'}
                  </button>
                </div>
                {!detailOrder.client_phone && !detailOrder.client_email && (
                  <p className="text-xs text-amber-600 mt-2">⚠️ Agrega teléfono o email para enviar recordatorios.</p>
                )}
              </div>
            )}

            {detailOrder.status === 'WAITING' && stylists.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Asignar estilista</label>
                <div className="flex gap-2">
                  <select id="assign-sel" className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                    <option value="">Seleccionar...</option>
                    {stylists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={() => { const sel = (document.getElementById('assign-sel') as HTMLSelectElement).value; if (sel) assignStylist(detailOrder.id, sel); }}
                    className="px-4 py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: brandColor }}>
                    Asignar
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!['DONE','CANCELLED'].includes(detailOrder.status) && (
                <button onClick={() => {
                  setRescheduleForm({ scheduled_at: detailOrder.scheduled_at || isoLocal(new Date()) });
                  setShowRescheduleModal(true);
                }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-bold hover:bg-blue-100 transition-all active:scale-95">
                  <Move size={14}/> Reprogramar
                </button>
              )}
              
              {detailOrder.status === 'ASSIGNED' && (
                <button onClick={() => updateOrderStatus(detailOrder.id, 'IN_PROGRESS')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-all active:scale-95">
                  <Scissors size={14}/> Iniciar servicio
                </button>
              )}
              {detailOrder.status === 'IN_PROGRESS' && (
                <button onClick={() => updateOrderStatus(detailOrder.id, 'DONE')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-all active:scale-95">
                  <Check size={14}/> Finalizar
                </button>
              )}
              
              {!['DONE','CANCELLED'].includes(detailOrder.status) && (
                <button onClick={() => { 
                  if (confirm('¿Estás seguro de cancelar esta cita?')) {
                    updateOrderStatus(detailOrder.id, 'CANCELLED'); 
                    setDetailOrder(null); 
                  }
                }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition-all">
                  <XCircle size={14}/> Cancelar
                </button>
              )}
              
              {detailOrder.status === 'DONE' && !detailOrder.invoice_id && (
                <button onClick={() => { setDetailOrder(null); setQuickSaleOrder(detailOrder); setActiveTab('dashboard'); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
                  style={{ background: brandColor }}>
                  <ShoppingCart size={14}/> Cobrar
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: REPROGRAMAR */}
      {showRescheduleModal && detailOrder && (
        <Modal title="Reprogramar Cita" onClose={() => setShowRescheduleModal(false)} brandColor={brandColor}>
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500">Cliente:</p>
              <p className="font-bold text-slate-800">{detailOrder.client_name}</p>
              <p className="text-xs text-slate-500 mt-1">Servicio: {detailOrder.service_name}</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Nueva fecha y hora</label>
              <input type="datetime-local" value={rescheduleForm.scheduled_at}
                onChange={e => setRescheduleForm({ scheduled_at: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
            </div>
            <button onClick={handleReschedule} disabled={saving}
              className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
              style={{ background: brandColor }}>
              {saving ? 'Guardando...' : '✅ Confirmar nueva fecha'}
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL: SERVICIO */}
      {showServiceModal && (
        <Modal title={editingService ? 'Editar Servicio' : 'Nuevo Servicio'} onClose={() => setShowServiceModal(false)} brandColor={brandColor}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Nombre *</label>
              <input value={serviceForm.name} onChange={e => setServiceForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Corte + peinado"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Categoría</label>
              <select value={serviceForm.category} onChange={e => setServiceForm(p => ({ ...p, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {SERVICE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Precio ($)</label>
                <input type="number" value={serviceForm.price} onChange={e => setServiceForm(p => ({ ...p, price: e.target.value }))}
                  placeholder="0" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Duración (min)</label>
                <input type="number" value={serviceForm.duration_minutes} onChange={e => setServiceForm(p => ({ ...p, duration_minutes: e.target.value }))}
                  placeholder="30" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">💡 Sugeridos</label>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {(SERVICE_CATEGORIES.find(c => c.id === serviceForm.category)?.services || []).map(s => (
                  <button key={s} onClick={() => setServiceForm(p => ({ ...p, name: s }))}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                      serviceForm.name === s
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-200'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleSaveService} disabled={saving}
              className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
              style={{ background: brandColor }}>
              {saving ? 'Guardando...' : editingService ? 'Actualizar' : 'Crear Servicio'}
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL: ESTILISTA */}
      {showStylistModal && (
        <Modal title={editingStylist ? 'Editar Estilista' : 'Nuevo Estilista'} onClose={() => setShowStylistModal(false)} brandColor={brandColor}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Nombre *</label>
              <input value={stylistForm.name} onChange={e => setStylistForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Nombre completo"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">
                Especialidad <span className="text-slate-400 font-normal normal-case">(opcional)</span>
              </label>
              <input value={stylistForm.specialty} onChange={e => setStylistForm(p => ({ ...p, specialty: e.target.value }))}
                placeholder="Ej: Colorimetría, Uñas acrílicas..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide flex items-center gap-1.5">
                <Percent size={11} className="text-emerald-500"/> Comisión (%)
              </label>
              <input type="number" min="0" max="100" value={stylistForm.commission_pct}
                onChange={e => setStylistForm(p => ({ ...p, commission_pct: e.target.value }))}
                placeholder="10"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              <p className="text-xs text-slate-400 mt-1">Porcentaje sobre el valor del servicio</p>
            </div>
            <button onClick={handleSaveStylist} disabled={saving}
              className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
              style={{ background: brandColor }}>
              {saving ? 'Guardando...' : editingStylist ? 'Actualizar' : 'Crear Estilista'}
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL: BLOQUEAR TIEMPO */}
      {showBlockModal && (
        <Modal title="Bloquear Tiempo" onClose={() => setShowBlockModal(false)} brandColor={brandColor}>
          <div className="space-y-3">
            <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
              Bloquea un horario para almuerzo, reunión o tiempo personal. No se podrán agendar citas en ese rango.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Estilista *</label>
              <select value={blockForm.stylist_id} onChange={e => setBlockForm(p => ({ ...p, stylist_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">Seleccionar...</option>
                {stylists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Inicio *</label>
                <input type="datetime-local" value={blockForm.start_at}
                  onChange={e => setBlockForm(p => ({ ...p, start_at: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Fin *</label>
                <input type="datetime-local" value={blockForm.end_at}
                  onChange={e => setBlockForm(p => ({ ...p, end_at: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Motivo</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {['Almuerzo','Reunión','Tiempo personal','Capacitación','Otro'].map(r => (
                  <button key={r} onClick={() => setBlockForm(p => ({ ...p, reason: r }))}
                    className={`px-3 py-1.5 rounded-full text-xs border font-semibold transition-all ${
                      blockForm.reason === r
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-200'
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
              <input value={blockForm.reason} onChange={e => setBlockForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="O escribe el motivo..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
            </div>
            <button onClick={handleSaveBlock} disabled={saving}
              className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-all active:scale-95"
              style={{ background: brandColor }}>
              {saving ? 'Guardando...' : '🔒 Bloquear horario'}
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL: COMISIONES */}
      {showCommissions && (
        <Modal title="Comisiones del Mes" onClose={() => setShowCommissions(false)} brandColor={brandColor}>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })} · Basado en citas finalizadas
            </p>
            {commissionsThisMonth.map(c => (
              <div key={c.stylist.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: avatarColor(c.stylist.name) }}>
                    {initials(c.stylist.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">{c.stylist.name}</p>
                    <p className="text-xs text-slate-500">{c.services_count} servicios · {c.stylist.commission_pct || 10}%</p>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <div>
                    <p className="text-xs text-slate-400">Ventas generadas</p>
                    <p className="text-sm font-bold text-slate-700">{fmt(c.total_revenue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Comisión a pagar</p>
                    <p className="text-base font-bold text-emerald-600">{fmt(c.commission)}</p>
                  </div>
                </div>
              </div>
            ))}
            {commissionsThisMonth.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-6">Sin estilistas registrados</p>
            )}
            {commissionsThisMonth.length > 0 && (
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 flex justify-between items-center">
                <p className="text-sm font-bold text-emerald-800">Total comisiones del mes</p>
                <p className="text-lg font-bold text-emerald-700">
                  {fmt(commissionsThisMonth.reduce((s, c) => s + c.commission, 0))}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {importModal && companyId && (
        <ImportModuleModal isOpen={!!importModal} onClose={() => setImportModal(null)}
          moduleType={importModal} companyId={companyId}
          onSuccess={() => { setImportModal(null); loadServices(); }}/>
      )}

      {/* Panel flotante para citas en proceso */}
      {activeInProgress.length > 0 && (
        <>
          {showActivePanel ? (
            <div className="fixed bottom-6 right-6 z-40 w-72 bg-white rounded-2xl shadow-2xl border border-purple-200 overflow-hidden"
              style={{ boxShadow: '0 8px 32px rgba(139,92,246,0.25)' }}>
              <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse"/>
                  <p className="text-xs font-bold text-white">
                    En proceso ({activeInProgress.length})
                  </p>
                </div>
                <button onClick={() => setShowActivePanel(false)} className="text-white/70 hover:text-white">
                  <X size={14}/>
                </button>
              </div>
              <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                {activeInProgress.map(o => (
                  <div key={o.id} className="p-3">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: avatarColor(o.client_name) }}>
                        {initials(o.client_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{o.client_name}</p>
                        <p className="text-xs text-slate-500 truncate">{o.service_name}</p>
                        {o.stylist_name && (
                          <p className="text-[10px] text-slate-400">✂️ {o.stylist_name}</p>
                        )}
                        {o.scheduled_at && (
                          <p className="text-[10px] text-purple-500 font-semibold">{fmtTime(o.scheduled_at)}</p>
                        )}
                      </div>
                      <span className="text-xs font-bold text-purple-700 flex-shrink-0 bg-purple-50 px-2 py-0.5 rounded-lg">
                        {fmt(o.service_price)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateOrderStatus(o.id, 'DONE')}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 flex items-center justify-center gap-1 transition-all active:scale-95">
                        <CheckCircle size={11}/> Finalizar
                      </button>
                      <button
                        onClick={() => { setDetailOrder(o); }}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200">
                        Ver detalle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {pendingPayment.length > 0 && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => { setActiveTab('dashboard'); setShowActivePanel(false); }}
                    className="w-full py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center gap-1.5">
                    <ShoppingCart size={12}/>
                    {pendingPayment.length} lista{pendingPayment.length !== 1 ? 's' : ''} para cobrar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowActivePanel(true)}
              className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-purple-600 text-white shadow-xl flex items-center justify-center hover:bg-purple-700 transition-all active:scale-95"
              style={{ boxShadow: '0 4px 20px rgba(139,92,246,0.4)' }}>
              <Scissors size={20}/>
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {activeInProgress.length}
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default BeautySalon;