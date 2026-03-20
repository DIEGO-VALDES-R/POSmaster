import React, { useState, useEffect, useCallback } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';
import {
  Building2, Plus, Users, Shield, CheckCircle2, XCircle, Search,
  Edit3, ToggleLeft, ToggleRight, X, Calendar, Crown, Wrench,
  ChevronDown, ChevronUp, Tag, CreditCard, Settings2, RefreshCw,
  Activity, Package, ShoppingCart, AlertTriangle, UserCheck,
  Stethoscope, TrendingUp, Clock, DollarSign, Eye, ChevronRight,
  Hammer, BarChart3, Database, Wifi, WifiOff,
  KeyRound, Mail, Lock, UserCog, Send, EyeOff
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const PLAN_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  TRIAL:      { label: '7 días gratis', color: 'text-green-700',  bg: 'bg-green-100',  icon: '🎁' },
  BASIC:      { label: 'Basic',         color: 'text-slate-700',  bg: 'bg-slate-100',  icon: '📦' },
  PRO:        { label: 'Pro',           color: 'text-blue-700',   bg: 'bg-blue-100',   icon: '⭐' },
  ENTERPRISE: { label: 'Enterprise',   color: 'text-purple-700', bg: 'bg-purple-100', icon: '🏢' },
};

const BUSINESS_TYPES = [
  { id: 'general',           label: '🏪 Tienda General' },
  { id: 'tienda_tecnologia', label: '📱 Tecnología / Celulares' },
  { id: 'restaurante',       label: '🍽️ Restaurante / Cafetería' },
  { id: 'ropa',              label: '👗 Ropa / Calzado' },
  { id: 'zapateria',         label: '👟 Zapatería / Marroquinería' },
  { id: 'ferreteria',        label: '🔧 Ferretería / Construcción' },
  { id: 'farmacia',          label: '💊 Farmacia / Droguería' },
  { id: 'supermercado',      label: '🛒 Supermercado / Abarrotes' },
  { id: 'salon',             label: '💇 Salón de Belleza / Spa' },
  { id: 'odontologia',       label: '🦷 Consultorio Odontológico' },
  { id: 'otro',              label: '📦 Otro' },
];

const PAYMENT_METHODS = [
  { id: 'cash',      label: 'Efectivo',            icon: '💵', plans: ['BASIC','PRO','ENTERPRISE','TRIAL'] },
  { id: 'transfer',  label: 'Transferencia / PSE',  icon: '🏛️', plans: ['BASIC','PRO','ENTERPRISE','TRIAL'] },
  { id: 'wompi',     label: 'Wompi',               icon: '🏦', plans: ['PRO','ENTERPRISE'] },
  { id: 'bold',      label: 'Bold',                icon: '⚡', plans: ['ENTERPRISE'] },
  { id: 'payu',      label: 'PayU',                icon: '💳', plans: ['ENTERPRISE'] },
  { id: 'dataphone', label: 'Datáfono físico',      icon: '📟', plans: ['ENTERPRISE'] },
];

const EMPTY_COMPANY = {
  name: '', nit: '', email: '', phone: '', address: '',
  subscription_plan: 'BASIC', subscription_status: 'ACTIVE',
  subscription_start_date: new Date().toISOString().split('T')[0],
  subscription_end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
};


// ── USER MANAGEMENT PANEL ─────────────────────────────────────────────────────
const UserManagementPanel: React.FC<{ company: any; onClose: () => void }> = ({ company, onClose }) => {
  const [users, setUsers]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [actionUser, setActionUser] = useState<any>(null);
  const [action, setAction]         = useState<'reset' | 'set_password' | 'change_email' | null>(null);
  const [newEmail, setNewEmail]     = useState('');
  const [newPass, setNewPass]       = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [working, setWorking]       = useState(false);

  const EDGE_URL = `${(supabase as any).supabaseUrl}/functions/v1/master-admin-actions`;

  const callEdge = async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const loadUsers = async () => {
    setLoading(true);
    const result = await callEdge({ action: 'get_company_users', company_id: company.id });
    setUsers(result.users || []);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, [company.id]);

  const fmt = (iso: string) => iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca';

  const handleAction = async () => {
    if (!actionUser) return;
    setWorking(true);
    let result: any;
    try {
      if (action === 'reset') {
        result = await callEdge({ action: 'reset_password', user_id: actionUser.id });
      } else if (action === 'set_password') {
        if (newPass.length < 6) { toast.error('Mínimo 6 caracteres'); setWorking(false); return; }
        result = await callEdge({ action: 'set_password', user_id: actionUser.id, new_password: newPass });
      } else if (action === 'change_email') {
        if (!newEmail.includes('@')) { toast.error('Email inválido'); setWorking(false); return; }
        result = await callEdge({ action: 'change_email', user_id: actionUser.id, new_email: newEmail });
      }
      if (result?.ok) {
        toast.success(result.message);
        setAction(null); setActionUser(null); setNewEmail(''); setNewPass('');
        loadUsers();
      } else {
        toast.error(result?.error || 'Error desconocido');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setWorking(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

        <div className="p-5 flex items-center justify-between gap-4 border-b" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <UserCog size={20} className="text-violet-400" />
            </div>
            <div>
              <span className="text-violet-400 text-xs font-bold uppercase tracking-widest block">Gestión de Usuarios</span>
              <h2 className="text-lg font-black text-white">{company.name}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">
              <RefreshCw size={24} className="animate-spin mr-2" /> Cargando usuarios...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-10 text-slate-400">No hay usuarios registrados</div>
          ) : (
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-slate-800 text-sm">{u.full_name || 'Sin nombre'}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${u.role === 'ADMIN' || u.role === 'OWNER' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>{u.role}</span>
                        {u.is_active === false && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-600">INACTIVO</span>}
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-0.5">
                        <Mail size={11} className="text-slate-400 flex-shrink-0" />
                        <span className="font-mono">{u.auth_email || u.email || '—'}</span>
                        {u.auth_email && u.email && u.auth_email !== u.email && (
                          <span className="text-orange-500 text-[10px] font-bold ml-1">(perfil: {u.email})</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Clock size={11} className="flex-shrink-0" /> Último acceso: {fmt(u.last_sign_in)}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setActionUser(u); setAction('reset'); }} title="Enviar correo de recuperación"
                        className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 border border-blue-100 transition-colors"><Send size={13} /></button>
                      <button onClick={() => { setActionUser(u); setAction('set_password'); setNewPass(''); }} title="Establecer nueva contraseña"
                        className="p-2 rounded-lg hover:bg-amber-50 text-amber-600 border border-amber-100 transition-colors"><Lock size={13} /></button>
                      <button onClick={() => { setActionUser(u); setAction('change_email'); setNewEmail(u.auth_email || ''); }} title="Cambiar correo de login"
                        className="p-2 rounded-lg hover:bg-violet-50 text-violet-600 border border-violet-100 transition-colors"><Mail size={13} /></button>
                    </div>
                  </div>

                  {actionUser?.id === u.id && action && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      {action === 'reset' && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm font-semibold text-blue-700 mb-1 flex items-center gap-1.5"><Send size={14} /> Enviar correo de recuperación</p>
                          <p className="text-xs text-blue-600 mb-3">Se enviará un link de recuperación a <strong>{u.auth_email}</strong>. El cliente podrá crear una nueva contraseña desde su correo.</p>
                          <div className="flex gap-2">
                            <button onClick={() => { setAction(null); setActionUser(null); }} className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleAction} disabled={working} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
                              {working ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}{working ? 'Enviando...' : 'Enviar correo'}
                            </button>
                          </div>
                        </div>
                      )}
                      {action === 'set_password' && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1.5"><Lock size={14} /> Nueva contraseña para {u.full_name || u.auth_email}</p>
                          <div className="relative mb-3">
                            <input type={showPass ? 'text' : 'password'} placeholder="Nueva contraseña (mín. 6 caracteres)" value={newPass}
                              onChange={e => setNewPass(e.target.value)}
                              className="w-full px-3 py-2 pr-10 border border-amber-200 rounded-lg text-sm focus:outline-none focus:border-amber-400 bg-white" />
                            <button onClick={() => setShowPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setAction(null); setActionUser(null); }} className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleAction} disabled={working || newPass.length < 6} className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-60 flex items-center justify-center gap-1.5">
                              {working ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}{working ? 'Guardando...' : 'Establecer contraseña'}
                            </button>
                          </div>
                        </div>
                      )}
                      {action === 'change_email' && (
                        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                          <p className="text-sm font-semibold text-violet-700 mb-1 flex items-center gap-1.5"><Mail size={14} /> Cambiar correo de acceso</p>
                          <p className="text-xs text-violet-600 mb-2">Correo actual: <strong className="font-mono">{u.auth_email}</strong>. El cambio aplica inmediatamente.</p>
                          <input type="email" placeholder="nuevo@correo.com" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:border-violet-400 bg-white mb-3" />
                          <div className="flex gap-2">
                            <button onClick={() => { setAction(null); setActionUser(null); }} className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleAction} disabled={working || !newEmail.includes('@')} className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
                              {working ? <RefreshCw size={12} className="animate-spin" /> : <Mail size={12} />}{working ? 'Guardando...' : 'Cambiar correo'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-400"><span className="font-semibold">💡</span> Los cambios aplican inmediatamente en Supabase Auth.</p>
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// ── DIAGNOSTIC PANEL ──────────────────────────────────────────────────────────
type DiagTab = 'resumen' | 'productos' | 'ventas' | 'usuarios' | 'reparaciones' | 'config';

const DiagnosticPanel: React.FC<{ company: any; onClose: () => void }> = ({ company, onClose }) => {
  const [tab, setTab] = useState<DiagTab>('resumen');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── datos cargados ──
  const [stats, setStats]           = useState<any>(null);
  const [products, setProducts]     = useState<any[]>([]);
  const [sales, setSales]           = useState<any[]>([]);
  const [users, setUsers]           = useState<any[]>([]);
  const [repairs, setRepairs]       = useState<any[]>([]);
  const [branches, setBranches]     = useState<any[]>([]);

  const COP = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n || 0);

  const fmt = (iso: string) =>
    iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const cid = company.id;

      // Paralelo: todas las consultas a la vez
      const [
        { data: prods },
        { data: invoicesRaw },
        { data: usersRaw },
        { data: repsRaw },
        { data: shoeRepsRaw },
        { data: branchRaw },
      ] = await Promise.all([
        supabase.from('products').select('id,name,sku,category,price,cost,stock_quantity,stock_min,type,is_active,business_context').eq('company_id', cid).order('name'),
        supabase.from('invoices').select('id,total_amount,payment_method,created_at,status,invoice_number').eq('company_id', cid).order('created_at', { ascending: false }).limit(50),
        supabase.from('profiles').select('id,full_name,email,role,created_at,is_active').eq('company_id', cid).order('created_at', { ascending: false }),
        supabase.from('repair_orders').select('id,customer_name,device_brand,device_model,status,total_cost,created_at').eq('company_id', cid).order('created_at', { ascending: false }).limit(30),
        supabase.from('shoe_repair_orders').select('id,customer_name,brand,model,status,total_amount,created_at').eq('company_id', cid).order('created_at', { ascending: false }).limit(20),
        supabase.from('branches').select('id,name,is_active').eq('company_id', cid),
      ]);

      const p = prods || [];
      // Normalizar invoices: unificar campo total
      const s = (invoicesRaw || []).map(inv => ({
        ...inv,
        total: inv.total_amount ?? 0,
        payment_method_label: typeof inv.payment_method === 'object'
          ? (inv.payment_method?.method || inv.payment_method?.type || 'efectivo')
          : (inv.payment_method || 'efectivo'),
      }));
      const u = usersRaw || [];
      // Combinar repair_orders + shoe_repair_orders normalizados
      const r = [
        ...(repsRaw || []),
        ...(shoeRepsRaw || []).map(sr => ({
          id: sr.id,
          customer_name: sr.customer_name,
          device_brand: sr.brand,
          device_model: sr.model,
          status: sr.status,
          total_cost: sr.total_amount,
          created_at: sr.created_at,
          _source: 'zapateria',
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);
      const b = branchRaw || [];

      setProducts(p);
      setSales(s);
      setUsers(u);
      setRepairs(r);
      setBranches(b);

      // KPIs resumen
      const today = new Date().toISOString().split('T')[0];
      const invoicesToday = s.filter(x => x.created_at?.startsWith(today));
      const lowStock = p.filter(x => x.type !== 'SERVICE' && x.type !== 'WEIGHABLE' && (x.stock_quantity ?? 0) <= (x.stock_min ?? 5) && x.is_active !== false);
      const inactiveProds = p.filter(x => x.is_active === false);
      const openRepairs = r.filter(x => !['entregado', 'cancelado', 'delivered', 'cancelled'].includes((x.status || '').toLowerCase()));

      setStats({
        totalProducts:  p.filter(x => x.is_active !== false).length,
        lowStock:       lowStock.length,
        inactiveProds:  inactiveProds.length,
        totalSales:     s.length,
        salesToday:     invoicesToday.length,
        revenueToday:   invoicesToday.reduce((a, x) => a + (x.total || 0), 0),
        totalRevenue:   s.reduce((a, x) => a + (x.total || 0), 0),
        totalUsers:     u.length,
        activeUsers:    u.filter(x => x.is_active !== false).length,
        totalRepairs:   r.length,
        openRepairs:    openRepairs.length,
        branches:       b.length,
      });
    } catch (e: any) {
      toast.error('Error al cargar diagnóstico: ' + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company.id]);

  useEffect(() => { load(); }, [load]);

  const cfg = company.config || {};
  const types: string[] = Array.isArray(cfg.business_types) ? cfg.business_types : cfg.business_type ? [cfg.business_type] : ['general'];
  const plan = company.subscription_plan || 'BASIC';
  const planMeta = PLAN_META[plan] || PLAN_META['BASIC'];

  const TABS: { id: DiagTab; label: string; icon: React.ReactNode }[] = [
    { id: 'resumen',       label: 'Resumen',       icon: <Activity size={14} /> },
    { id: 'productos',     label: 'Productos',     icon: <Package size={14} /> },
    { id: 'ventas',        label: 'Ventas',        icon: <ShoppingCart size={14} /> },
    { id: 'usuarios',      label: 'Usuarios',      icon: <Users size={14} /> },
    { id: 'reparaciones',  label: 'Reparaciones',  icon: <Hammer size={14} /> },
    { id: 'config',        label: 'Config',        icon: <Settings2 size={14} /> },
  ];

  const statusColor = (s: string) => {
    const m: Record<string, string> = {
      recibido: 'bg-blue-100 text-blue-700',
      diagnostico: 'bg-yellow-100 text-yellow-700',
      en_reparacion: 'bg-orange-100 text-orange-700',
      listo: 'bg-green-100 text-green-700',
      entregado: 'bg-slate-100 text-slate-500',
      cancelado: 'bg-red-100 text-red-600',
    };
    return m[(s || '').toLowerCase()] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '94vh' }}>

        {/* Header */}
        <div className="p-5 flex items-start justify-between gap-4 border-b" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Stethoscope size={24} className="text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Diagnóstico</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${planMeta.bg} ${planMeta.color}`}>{planMeta.icon} {planMeta.label}</span>
              </div>
              <h2 className="text-xl font-black text-white">{company.name}</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                NIT {company.nit} · {types.map(t => BUSINESS_TYPES.find(b => b.id === t)?.label || t).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={refreshing}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b bg-slate-50 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${tab === t.id ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-200'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Database size={32} className="text-slate-300 animate-pulse" />
              <p className="text-slate-400 text-sm">Cargando datos del negocio...</p>
            </div>
          ) : (

            <>
              {/* ── RESUMEN ── */}
              {tab === 'resumen' && stats && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Productos activos',   value: stats.totalProducts,  icon: '📦', color: 'blue',   sub: `${stats.inactiveProds} inactivos` },
                      { label: 'Stock bajo mínimo',   value: stats.lowStock,       icon: '⚠️', color: stats.lowStock > 0 ? 'red' : 'green', sub: 'productos' },
                      { label: 'Ventas hoy',          value: stats.salesToday,     icon: '🛒', color: 'emerald', sub: COP(stats.revenueToday) },
                      { label: 'Total ventas (50ú)',  value: stats.totalSales,     icon: '📊', color: 'indigo',  sub: COP(stats.totalRevenue) },
                      { label: 'Usuarios',            value: stats.totalUsers,     icon: '👥', color: 'slate',   sub: `${stats.activeUsers} activos` },
                      { label: 'Reparaciones abiertas', value: stats.openRepairs,  icon: '🔧', color: stats.openRepairs > 0 ? 'orange' : 'slate', sub: `${stats.totalRepairs} total` },
                      { label: 'Sucursales',          value: stats.branches,       icon: '🏢', color: 'purple',  sub: 'configuradas' },
                      { label: 'Plan activo',         value: planMeta.label,       icon: planMeta.icon, color: 'slate', sub: company.subscription_status, isText: true },
                    ].map(s => (
                      <div key={s.label} className={`bg-${s.color}-50 border border-${s.color}-100 rounded-xl p-4`}>
                        <p className="text-xs text-slate-500 font-medium mb-1">{s.icon} {s.label}</p>
                        <p className={`font-black text-${s.color}-700 ${(s as any).isText ? 'text-base' : 'text-2xl'}`}>{s.value}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Alertas automáticas */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alertas detectadas</p>
                    {stats.lowStock > 0 && (
                      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
                        <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-red-700">{stats.lowStock} producto{stats.lowStock > 1 ? 's' : ''} con stock bajo mínimo</p>
                          <p className="text-xs text-red-500">El cliente puede estar vendiendo sin stock suficiente.</p>
                        </div>
                      </div>
                    )}
                    {stats.inactiveProds > 0 && (
                      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-700">{stats.inactiveProds} producto{stats.inactiveProds > 1 ? 's' : ''} inactivos</p>
                          <p className="text-xs text-amber-600">Pueden estar ocultos por stock en cero. El cliente puede no verlos.</p>
                        </div>
                      </div>
                    )}
                    {stats.openRepairs > 0 && (
                      <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                        <Hammer size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-orange-700">{stats.openRepairs} reparación{stats.openRepairs > 1 ? 'es' : ''} abiertas</p>
                          <p className="text-xs text-orange-600">Órdenes sin estado "Entregado" o "Cancelado".</p>
                        </div>
                      </div>
                    )}
                    {stats.lowStock === 0 && stats.inactiveProds === 0 && stats.openRepairs === 0 && (
                      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                        <CheckCircle2 size={16} className="text-green-500" />
                        <p className="text-sm font-semibold text-green-700">Sin alertas críticas detectadas ✓</p>
                      </div>
                    )}
                  </div>

                  {/* Últimas ventas */}
                  {sales.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Últimas 5 ventas</p>
                      <div className="space-y-1.5">
                        {sales.slice(0, 5).map(s => (
                          <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                              <span className="text-slate-500 text-xs font-mono">{fmt(s.created_at)}</span>
                              {s.invoice_number && <span className="text-slate-400 text-xs">#{s.invoice_number}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-medium">{s.payment_method_label}</span>
                              <span className="font-bold text-slate-800">{COP(s.total)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── PRODUCTOS ── */}
              {tab === 'productos' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-blue-700">{products.filter(p => p.is_active !== false).length}</p>
                      <p className="text-xs text-blue-500 font-semibold">Activos</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-red-600">{products.filter(p => p.type !== 'SERVICE' && p.type !== 'WEIGHABLE' && (p.stock_quantity ?? 0) <= (p.stock_min ?? 5) && p.is_active !== false).length}</p>
                      <p className="text-xs text-red-500 font-semibold">Stock bajo</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-slate-500">{products.filter(p => p.is_active === false).length}</p>
                      <p className="text-xs text-slate-400 font-semibold">Inactivos</p>
                    </div>
                  </div>

                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>{['Nombre','SKU','Categoría','Precio','Stock','Tipo','Estado'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-500">{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {products.map(p => {
                            const lowStock = p.type !== 'SERVICE' && p.type !== 'WEIGHABLE' && (p.stock_quantity ?? 0) <= (p.stock_min ?? 5) && p.is_active !== false;
                            return (
                              <tr key={p.id} className={p.is_active === false ? 'opacity-50 bg-slate-50' : lowStock ? 'bg-red-50' : ''}>
                                <td className="px-3 py-2 font-semibold text-slate-700 max-w-[150px] truncate">{p.name}</td>
                                <td className="px-3 py-2 font-mono text-slate-500">{p.sku}</td>
                                <td className="px-3 py-2 text-slate-500">{p.category || '—'}</td>
                                <td className="px-3 py-2 text-slate-700 font-semibold">{COP(p.price)}</td>
                                <td className="px-3 py-2">
                                  <span className={`font-bold ${lowStock ? 'text-red-600' : 'text-green-600'}`}>{p.stock_quantity ?? 0}</span>
                                  {lowStock && <span className="ml-1 text-red-400">⚠</span>}
                                </td>
                                <td className="px-3 py-2 text-slate-500">{p.type}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded-full font-bold text-[10px] ${p.is_active === false ? 'bg-slate-200 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                                    {p.is_active === false ? 'INACTIVO' : 'ACTIVO'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── VENTAS ── */}
              {tab === 'ventas' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">Mostrando las últimas 50 ventas registradas.</p>
                  {sales.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <ShoppingCart size={36} className="mx-auto mb-2 opacity-30" />
                      <p>No hay ventas registradas</p>
                    </div>
                  ) : (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr>{['Fecha','ID venta','Método pago','Total','Estado'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-500">{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {sales.map(s => (
                              <tr key={s.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-500 font-mono whitespace-nowrap">{fmt(s.created_at)}</td>
                                <td className="px-3 py-2 text-slate-600 font-mono text-[10px]">{s.invoice_number || s.id?.slice(0, 8) + '…'}</td>
                                <td className="px-3 py-2">
                                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">{s.payment_method_label}</span>
                                </td>
                                <td className="px-3 py-2 font-bold text-slate-800">{COP(s.total)}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${s.status === 'PAID' || s.status === 'paid' || !s.status ? 'bg-green-100 text-green-700' : s.status === 'PENDING_ELECTRONIC' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                                    {s.status || 'pagada'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── USUARIOS ── */}
              {tab === 'usuarios' && (
                <div className="space-y-3">
                  {users.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Users size={36} className="mx-auto mb-2 opacity-30" />
                      <p>No hay usuarios registrados</p>
                    </div>
                  ) : (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr>{['Nombre','Email','Rol','Registrado','Estado'].map(h => (
                              <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-500">{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {users.map(u => (
                              <tr key={u.id} className={u.is_active === false ? 'opacity-50' : 'hover:bg-slate-50'}>
                                <td className="px-3 py-2 font-semibold text-slate-700">{u.full_name || '—'}</td>
                                <td className="px-3 py-2 text-slate-500">{u.email || '—'}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                    u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                                    u.role === 'OWNER' ? 'bg-blue-100 text-blue-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>{u.role || 'EMPLEADO'}</span>
                                </td>
                                <td className="px-3 py-2 text-slate-400 font-mono whitespace-nowrap">{fmt(u.created_at)}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${u.is_active === false ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                                    {u.is_active === false ? 'INACTIVO' : 'ACTIVO'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── REPARACIONES ── */}
              {tab === 'reparaciones' && (
                <div className="space-y-3">
                  {repairs.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Hammer size={36} className="mx-auto mb-2 opacity-30" />
                      <p>No hay órdenes de reparación</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {['recibido','en_reparacion','listo','entregado'].map(st => (
                          <div key={st} className={`rounded-xl p-3 text-center ${statusColor(st)} border`}>
                            <p className="text-lg font-black">{repairs.filter(r => r.status?.toLowerCase() === st).length}</p>
                            <p className="text-[10px] font-semibold capitalize">{st.replace('_', ' ')}</p>
                          </div>
                        ))}
                      </div>
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto max-h-80">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 sticky top-0">
                              <tr>{['Cliente','Dispositivo','Estado','Costo','Fecha'].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-500">{h}</th>
                              ))}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {repairs.map(r => (
                                <tr key={r.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-semibold text-slate-700">{r.customer_name || '—'}</td>
                                  <td className="px-3 py-2 text-slate-500">{[r.device_brand, r.device_model].filter(Boolean).join(' ') || '—'}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(r.status)}`}>
                                      {r.status || '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-bold text-slate-700">{r.total_cost ? COP(r.total_cost) : '—'}</td>
                                  <td className="px-3 py-2 text-slate-400 font-mono whitespace-nowrap">{fmt(r.created_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── CONFIG ── */}
              {tab === 'config' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Información general</p>
                      {[
                        { label: 'Nombre',   value: company.name },
                        { label: 'NIT',      value: company.nit },
                        { label: 'Email',    value: company.email },
                        { label: 'Teléfono', value: company.phone },
                        { label: 'Dirección',value: company.address },
                      ].map(f => (
                        <div key={f.label} className="flex justify-between items-start gap-2 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-400 font-semibold flex-shrink-0">{f.label}</span>
                          <span className="text-xs text-slate-700 text-right break-all">{f.value || '—'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Suscripción</p>
                      {[
                        { label: 'Plan',        value: `${planMeta.icon} ${planMeta.label}` },
                        { label: 'Estado',      value: company.subscription_status },
                        { label: 'Inicio',      value: company.subscription_start_date?.split('T')[0] },
                        { label: 'Vencimiento', value: company.subscription_end_date?.split('T')[0] },
                        { label: 'Sucursales',  value: String(branches.length) },
                      ].map(f => (
                        <div key={f.label} className="flex justify-between items-start gap-2 py-2 border-b border-slate-100">
                          <span className="text-xs text-slate-400 font-semibold flex-shrink-0">{f.label}</span>
                          <span className="text-xs text-slate-700 text-right">{f.value || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipos de negocio</p>
                    <div className="flex flex-wrap gap-2">
                      {types.map(t => (
                        <span key={t} className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold">
                          {BUSINESS_TYPES.find(b => b.id === t)?.label || t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Métodos de pago habilitados</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(cfg.payment_providers || {})
                        .filter(([, v]: any) => v?.enabled)
                        .map(([k]: any) => {
                          const pm = PAYMENT_METHODS.find(p => p.id === k);
                          return pm ? (
                            <span key={k} className="px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-semibold">
                              {pm.icon} {pm.label}
                            </span>
                          ) : null;
                        })}
                      {!cfg.payment_providers && (
                        <span className="text-xs text-slate-400">Solo efectivo (por defecto)</span>
                      )}
                    </div>
                  </div>

                  {/* JSON config crudo — útil para debug */}
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1.5 select-none">
                      <Database size={12} /> Ver config JSON completo
                      <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                    </summary>
                    <pre className="mt-2 bg-slate-900 text-green-400 text-[10px] p-4 rounded-xl overflow-x-auto max-h-48 leading-relaxed">
                      {JSON.stringify(cfg, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-400">ID: <span className="font-mono">{company.id}</span></p>
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// ── SUPPORT PANEL ─────────────────────────────────────────────────────────────
const SupportPanel: React.FC<{ company: any; onClose: () => void; onSaved: () => void }> = ({ company, onClose, onSaved }) => {
  const plan = company.subscription_plan || 'BASIC';
  const cfg  = company.config || {};

  const maxTypes = plan === 'ENTERPRISE' ? 99 : plan === 'PRO' ? 3 : 1;

  const parseTypes = (c: any): string[] => {
    if (Array.isArray(c?.business_types)) return c.business_types;
    if (c?.business_type) return [c.business_type];
    return ['general'];
  };
  const [businessTypes, setBusinessTypes] = useState<string[]>(parseTypes(cfg));

  const defaultProviders: Record<string, any> = {
    cash:      { enabled: true,  label: 'Efectivo',            icon: '💵' },
    transfer:  { enabled: false, label: 'Transferencia / PSE', icon: '🏛️', bank_name: '', account_number: '', account_type: 'ahorros' },
    wompi:     { enabled: false, label: 'Wompi',               icon: '🏦', pub_key: '', env: 'prod' },
    bold:      { enabled: false, label: 'Bold',                icon: '⚡', api_key: '' },
    payu:      { enabled: false, label: 'PayU',                icon: '💳', merchant_id: '', api_key: '', api_login: '' },
    dataphone: { enabled: false, label: 'Datáfono físico',     icon: '📟', acquirer: 'redeban', note: '' },
  };
  const [providers, setProviders] = useState<Record<string, any>>(
    cfg.payment_providers ? { ...defaultProviders, ...cfg.payment_providers } : defaultProviders
  );
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'tipos' | 'pagos'>('tipos');

  const toggleType = (id: string) => {
    setBusinessTypes(prev => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter(t => t !== id);
      if (plan === 'BASIC') return [id];
      if (prev.length >= maxTypes) { toast.error(`El plan ${plan} permite hasta ${maxTypes} tipos`); return prev; }
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const newConfig = {
      ...cfg,
      business_type:  businessTypes[0] || 'general',
      business_types: businessTypes,
      payment_providers: providers,
    };
    const { error } = await supabase.from('companies').update({ config: newConfig }).eq('id', company.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ Configuración de "${company.name}" actualizada`);
    onSaved();
    onClose();
  };

  const Section: React.FC<{ id: 'tipos' | 'pagos'; label: string; icon: React.ReactNode }> = ({ id, label, icon }) => (
    <button onClick={() => setActiveSection(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeSection === id ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}>
      {icon} {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4" style={{ background: 'linear-gradient(135deg,#1e293b,#334155)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Wrench size={18} className="text-blue-400" />
              <span className="text-blue-300 text-xs font-bold uppercase tracking-wider">Soporte al cliente</span>
            </div>
            <h3 className="text-lg font-bold text-white">{company.name}</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              {PLAN_META[plan]?.icon} Plan {PLAN_META[plan]?.label} · NIT {company.nit}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 p-4 border-b border-slate-100 bg-slate-50">
          <Section id="tipos" label="Tipo de negocio" icon={<Tag size={15} />} />
          <Section id="pagos" label="Métodos de pago"  icon={<CreditCard size={15} />} />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {activeSection === 'tipos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-700">Tipo(s) de negocio activos</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {plan === 'BASIC' ? 'Plan BASIC: 1 tipo (swap automático al cambiar)' :
                     plan === 'PRO'   ? `Plan PRO: hasta 3 tipos · ${businessTypes.length}/3 seleccionados` :
                                        'Plan ENTERPRISE: sin límite'}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${PLAN_META[plan].bg} ${PLAN_META[plan].color}`}>
                  {PLAN_META[plan].icon} {PLAN_META[plan].label}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {BUSINESS_TYPES.map(bt => {
                  const isSelected = businessTypes.includes(bt.id);
                  const isLocked   = plan === 'PRO' && !isSelected && businessTypes.length >= 3;
                  return (
                    <button key={bt.id} onClick={() => toggleType(bt.id)} disabled={isLocked}
                      className={`p-3 rounded-xl border-2 text-sm font-medium text-left transition-all relative ${
                        isSelected ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' :
                        isLocked   ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed' :
                                     'border-slate-200 hover:border-blue-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {bt.label}
                      {isSelected && <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">✓</span>}
                      {isLocked   && <span className="absolute top-1.5 right-1.5 text-[11px]">🔒</span>}
                    </button>
                  );
                })}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <strong>⚙️ Efecto inmediato:</strong> Al guardar, el menú lateral del cliente cambiará automáticamente para mostrar solo los módulos del tipo de negocio seleccionado.
              </div>
            </div>
          )}

          {activeSection === 'pagos' && (
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-slate-700">Métodos de pago habilitados</p>
                <p className="text-xs text-slate-400 mt-0.5">Los métodos marcados con 🔒 requieren un plan superior</p>
              </div>
              {PAYMENT_METHODS.map(pm => {
                const allowed   = pm.plans.includes(plan);
                const provData  = providers[pm.id] || {};
                const isEnabled = allowed && !!provData.enabled;
                return (
                  <div key={pm.id} className={`rounded-xl border p-4 transition-all ${isEnabled ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'} ${!allowed ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{pm.icon}</span>
                        <div>
                          <p className="font-semibold text-slate-700 text-sm">{pm.label}</p>
                          {!allowed && <p className="text-xs text-slate-400">🔒 Requiere plan {pm.plans[pm.plans.length - 1]}</p>}
                        </div>
                      </div>
                      <button disabled={!allowed}
                        onClick={() => setProviders(prev => ({ ...prev, [pm.id]: { ...prev[pm.id], enabled: !prev[pm.id]?.enabled } }))}
                        className={`relative w-11 h-6 rounded-full transition-colors ${isEnabled ? 'bg-blue-500' : 'bg-slate-200'} ${!allowed ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isEnabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    {isEnabled && pm.id === 'transfer' && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <input placeholder="Banco" value={provData.bank_name || ''} onChange={e => setProviders(p => ({ ...p, transfer: { ...p.transfer, bank_name: e.target.value } }))}
                          className="col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300" />
                        <input placeholder="Número de cuenta" value={provData.account_number || ''} onChange={e => setProviders(p => ({ ...p, transfer: { ...p.transfer, account_number: e.target.value } }))}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300" />
                        <select value={provData.account_type || 'ahorros'} onChange={e => setProviders(p => ({ ...p, transfer: { ...p.transfer, account_type: e.target.value } }))}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300 bg-white">
                          <option value="ahorros">Ahorros</option>
                          <option value="corriente">Corriente</option>
                        </select>
                      </div>
                    )}
                    {isEnabled && pm.id === 'wompi' && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <input placeholder="Public key" value={provData.pub_key || ''} onChange={e => setProviders(p => ({ ...p, wompi: { ...p.wompi, pub_key: e.target.value } }))}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300" />
                        <select value={provData.env || 'prod'} onChange={e => setProviders(p => ({ ...p, wompi: { ...p.wompi, env: e.target.value } }))}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none bg-white">
                          <option value="prod">Producción</option>
                          <option value="sandbox">Sandbox</option>
                        </select>
                      </div>
                    )}
                    {isEnabled && pm.id === 'bold' && (
                      <input placeholder="API Key de Bold" value={provData.api_key || ''} onChange={e => setProviders(p => ({ ...p, bold: { ...p.bold, api_key: e.target.value } }))}
                        className="mt-3 w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300" />
                    )}
                    {isEnabled && pm.id === 'payu' && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <input placeholder="Merchant ID" value={provData.merchant_id || ''} onChange={e => setProviders(p => ({ ...p, payu: { ...p.payu, merchant_id: e.target.value } }))}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300" />
                        <input placeholder="API Login" value={provData.api_login || ''} onChange={e => setProviders(p => ({ ...p, payu: { ...p.payu, api_login: e.target.value } }))}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300" />
                        <input placeholder="API Key" value={provData.api_key || ''} onChange={e => setProviders(p => ({ ...p, payu: { ...p.payu, api_key: e.target.value } }))}
                          className="col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300" />
                      </div>
                    )}
                    {isEnabled && pm.id === 'dataphone' && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <select value={provData.acquirer || 'redeban'} onChange={e => setProviders(p => ({ ...p, dataphone: { ...p.dataphone, acquirer: e.target.value } }))}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none bg-white">
                          <option value="redeban">Redeban</option>
                          <option value="credibanco">Credibanco</option>
                          <option value="otro">Otro</option>
                        </select>
                        <input placeholder="Nota interna" value={provData.note || ''} onChange={e => setProviders(p => ({ ...p, dataphone: { ...p.dataphone, note: e.target.value } }))}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-300" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3 bg-slate-50">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 text-sm">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60 text-sm flex items-center justify-center gap-2">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Guardando...</> : <><Settings2 size={14} /> Guardar configuración</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── MAIN ──────────────────────────────────────────────────────────────────────
const MasterAdmin: React.FC = () => {
  const { userRole } = useDatabase();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState('ALL');

  const [showNewModal, setShowNewModal]         = useState(false);
  const [showEditModal, setShowEditModal]       = useState(false);
  const [showSupport, setShowSupport]           = useState(false);
  const [showDiagnostic, setShowDiagnostic]     = useState(false);
  const [showUserMgmt, setShowUserMgmt]         = useState(false);
  const [userMgmtCompany, setUserMgmtCompany]   = useState<any>(null);
  const [newCompany, setNewCompany]             = useState({ ...EMPTY_COMPANY });
  const [editCompany, setEditCompany]           = useState<any>(null);
  const [supportCompany, setSupportCompany]     = useState<any>(null);
  const [diagnosticCompany, setDiagnosticCompany] = useState<any>(null);
  const [saving, setSaving]                     = useState(false);

  useEffect(() => { if (userRole === 'MASTER') fetchCompanies(); }, [userRole]);

  const fetchCompanies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('*, profiles(count)')
      .order('created_at', { ascending: false });
    if (error) toast.error('Error al cargar empresas');
    else setCompanies(data || []);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('companies').insert([{
      name: newCompany.name, nit: newCompany.nit, email: newCompany.email,
      phone: newCompany.phone, address: newCompany.address,
      subscription_plan: newCompany.subscription_plan,
      subscription_status: newCompany.subscription_status,
      subscription_start_date: newCompany.subscription_start_date || null,
      subscription_end_date: newCompany.subscription_end_date || null,
    }]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Empresa creada');
    setShowNewModal(false);
    setNewCompany({ ...EMPTY_COMPANY });
    fetchCompanies();
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCompany) return;
    setSaving(true);
    const isTrial = editCompany.subscription_plan === 'TRIAL';
    const endDate = isTrial && !editCompany.subscription_end_date
      ? new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
      : editCompany.subscription_end_date || null;
    // Si no hay feature_flags explícitos, generar los defaults del plan seleccionado
    const featureFlags = editCompany.feature_flags && Object.keys(editCompany.feature_flags).length > 0
      ? editCompany.feature_flags
      : getDefaultFlags(editCompany.subscription_plan || 'BASIC');

    const { error } = await supabase.from('companies').update({
      name: editCompany.name, nit: editCompany.nit, email: editCompany.email,
      phone: editCompany.phone, address: editCompany.address,
      subscription_plan:       editCompany.subscription_plan,
      subscription_status:     editCompany.subscription_status,
      subscription_start_date: editCompany.subscription_start_date || null,
      subscription_end_date:   endDate,
      feature_flags:           featureFlags,
    }).eq('id', editCompany.id);
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(isTrial ? '🎁 Plan Gratis activado (7 días)' : 'Empresa actualizada');
    setShowEditModal(false);
    setEditCompany(null);
    fetchCompanies();
  };

  const toggleStatus = async (c: any) => {
    const next = c.subscription_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const { error } = await supabase.from('companies').update({ subscription_status: next }).eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Empresa ${next === 'ACTIVE' ? 'activada' : 'desactivada'}`);
    fetchCompanies();
  };

  const openEdit = (c: any) => {
    setEditCompany({
      ...c,
      subscription_start_date: c.subscription_start_date?.split('T')[0] || '',
      subscription_end_date:   c.subscription_end_date?.split('T')[0]   || '',
    });
    setShowEditModal(true);
  };

  const openSupport = (c: any) => { setSupportCompany(c); setShowSupport(true); };
  const openDiagnostic = (c: any) => { setDiagnosticCompany(c); setShowDiagnostic(true); };
  const openUserMgmt   = (c: any) => { setUserMgmtCompany(c); setShowUserMgmt(true); };

  if (userRole !== 'MASTER') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Shield size={48} className="mb-4 text-red-400" />
        <h1 className="text-2xl font-bold">Acceso Denegado</h1>
        <p>Esta página es solo para usuarios maestros.</p>
      </div>
    );
  }

  const filtered = companies.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.nit || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchPlan = filterPlan === 'ALL' || c.subscription_plan === filterPlan;
    return matchSearch && matchPlan;
  });

  const stats = {
    total:      companies.length,
    active:     companies.filter(c => c.subscription_status === 'ACTIVE').length,
    enterprise: companies.filter(c => c.subscription_plan === 'ENTERPRISE').length,
    users:      companies.reduce((acc, c) => acc + (c.profiles?.[0]?.count || 0), 0),
  };

  const inputCls = "w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white";
  const labelCls = "block text-sm font-semibold text-slate-600 mb-1";


  const FEATURE_DEFS = [
    // Ventas
    { id: 'credit_notes',   label: 'Devoluciones / Notas Crédito', cat: 'Ventas',     defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'quotes',         label: 'Cotizaciones',                  cat: 'Ventas',     defaultPlans: ['BASIC','PRO','ENTERPRISE','TRIAL'] },
    { id: 'dian',           label: 'Facturación electrónica DIAN',  cat: 'Ventas',     defaultPlans: ['ENTERPRISE'] },
    // Inventario
    { id: 'variants',       label: 'Variantes de producto',         cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'purchase_orders',label: 'Órdenes de compra',             cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'weighable',      label: 'Productos pesables (PLU)',       cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    // Finanzas
    { id: 'nomina',         label: 'Nómina y dotación',             cat: 'Finanzas',   defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'cash_expenses',  label: 'Egresos de caja',               cat: 'Finanzas',   defaultPlans: ['BASIC','PRO','ENTERPRISE','TRIAL'] },
    { id: 'op_expenses',    label: 'Gastos Operativos mensuales',   cat: 'Finanzas',   defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'advanced_reports', label: 'Reportes avanzados (rentabilidad + horas pico)', cat: 'Finanzas', defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'sales_channel',  label: 'Canal de venta en facturas',    cat: 'Finanzas',   defaultPlans: ['PRO','ENTERPRISE'] },
    // Módulos
    { id: 'restaurant',     label: 'Módulo Restaurante',            cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'salon',          label: 'Módulo Salón de belleza',        cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'dental',         label: 'Módulo Odontología',            cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'vet',            label: 'Módulo Veterinaria',            cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'pharmacy',       label: 'Módulo Farmacia',               cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'shoe_repair',    label: 'Módulo Zapatería',              cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    // Marketing
    { id: 'catalog',        label: 'Catálogo digital WhatsApp',     cat: 'Marketing',  defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'branding',       label: 'Personalización de marca',      cat: 'Marketing',  defaultPlans: ['PRO','ENTERPRISE'] },
  ];

  const getDefaultFlags = (plan: string): Record<string,boolean> => {
    const flags: Record<string,boolean> = {};
    FEATURE_DEFS.forEach(f => { flags[f.id] = f.defaultPlans.includes(plan); });
    return flags;
  };

  const PlanForm = ({ data, setData }: { data: any; setData: (v: any) => void }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelCls}>Nombre de la Empresa *</label>
          <input required type="text" value={data.name} onChange={e => setData({ ...data, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>NIT / Identificación *</label>
          <input required type="text" value={data.nit} onChange={e => setData({ ...data, nit: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Teléfono</label>
          <input type="text" value={data.phone || ''} onChange={e => setData({ ...data, phone: e.target.value })} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Email</label>
          <input type="email" value={data.email || ''} onChange={e => setData({ ...data, email: e.target.value })} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Dirección</label>
          <input type="text" value={data.address || ''} onChange={e => setData({ ...data, address: e.target.value })} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Plan de suscripción</label>
        <div className="grid grid-cols-2 gap-2">
          {(['TRIAL', 'BASIC', 'PRO', 'ENTERPRISE'] as const).map(p => {
            const meta = PLAN_META[p];
            const active = data.subscription_plan === p;
            return (
              <button key={p} type="button" onClick={() => setData({
                  ...data,
                  subscription_plan: p,
                  subscription_status: p === 'TRIAL' ? 'TRIAL' : data.subscription_status === 'TRIAL' ? 'ACTIVE' : data.subscription_status,
                })}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
                  active
                    ? p === 'ENTERPRISE' ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : p === 'PRO'      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : p === 'TRIAL'    ? 'border-green-500 bg-green-50 text-green-700'
                      :                   'border-slate-400 bg-slate-100 text-slate-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}>
                <span>{meta.icon}</span> {meta.label}
                {active && <CheckCircle2 size={14} className="ml-auto" />}
              </button>
            );
          })}
        </div>
        {data.subscription_plan === 'ENTERPRISE' && (
          <div className="mt-2 p-3 bg-purple-50 border border-purple-100 rounded-lg text-xs text-purple-700 flex items-center gap-2">
            <Crown size={14} /> Sucursales ilimitadas · Usuarios ilimitados · DIAN · API · Soporte dedicado
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>Estado</label>
        <select value={data.subscription_status} onChange={e => setData({ ...data, subscription_status: e.target.value })} className={inputCls}>
          <option value="ACTIVE">Activa</option>
          <option value="INACTIVE">Inactiva</option>
          <option value="PAST_DUE">Vencida</option>
          <option value="TRIAL">Prueba</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Inicio suscripción</label>
          <input type="date" value={data.subscription_start_date || ''} onChange={e => setData({ ...data, subscription_start_date: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Vencimiento</label>
          <input type="date" value={data.subscription_end_date || ''} onChange={e => setData({ ...data, subscription_end_date: e.target.value })} className={inputCls} />
        </div>
      </div>

      {/* ── Feature Flags ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelCls + " mb-0"}>Features habilitados</label>
          <button type="button"
            onClick={() => {
              const defaults = getDefaultFlags(data.subscription_plan || 'BASIC');
              setData({ ...data, feature_flags: defaults });
            }}
            className="text-xs text-blue-600 hover:underline font-medium">
            Restaurar por plan
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">
          Sobreescribe los accesos del plan. Útil para demos, pruebas o clientes especiales.
        </p>
        {(() => {
          const cats = [...new Set(FEATURE_DEFS.map(f => f.cat))];
          const flags: Record<string,boolean> = data.feature_flags && Object.keys(data.feature_flags).length > 0
            ? data.feature_flags
            : getDefaultFlags(data.subscription_plan || 'BASIC');
          const toggle = (id: string) => {
            setData({ ...data, feature_flags: { ...flags, [id]: !flags[id] } });
          };
          return (
            <div className="space-y-3">
              {cats.map(cat => (
                <div key={cat}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{cat}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FEATURE_DEFS.filter(f => f.cat === cat).map(feat => {
                      const enabled = flags[feat.id] !== false && (flags[feat.id] === true || feat.defaultPlans.includes(data.subscription_plan || 'BASIC'));
                      const isOn = flags[feat.id] !== undefined ? flags[feat.id] : feat.defaultPlans.includes(data.subscription_plan || 'BASIC');
                      return (
                        <button key={feat.id} type="button" onClick={() => toggle(feat.id)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all text-left ${
                            isOn ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-50 text-slate-400'
                          }`}>
                          <div className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center flex-shrink-0 ${isOn ? 'bg-green-500' : 'bg-slate-200'}`}>
                            {isOn && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                          </div>
                          {feat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Panel de Administración Maestro</h1>
          <p className="text-slate-500">Gestiona todos tus clientes y empresas desde un solo lugar.</p>
        </div>
        <button onClick={() => setShowNewModal(true)}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
          <Plus size={20} /> Nueva Empresa
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Empresas',  value: stats.total,      icon: <Building2 size={22} />,    color: 'blue'   },
          { label: 'Activas',         value: stats.active,     icon: <CheckCircle2 size={22} />, color: 'green'  },
          { label: 'Enterprise',      value: stats.enterprise, icon: <Crown size={22} />,        color: 'purple' },
          { label: 'Total Usuarios',  value: stats.users,      icon: <Users size={22} />,        color: 'slate'  },
        ].map(s => (
          <div key={s.label} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className={`p-2.5 rounded-xl bg-${s.color}-50 text-${s.color}-600`}>{s.icon}</div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
          <h2 className="font-bold text-slate-800 flex-1">Clientes / Empresas</h2>
          <div className="flex gap-1 flex-wrap">
            {['ALL', 'TRIAL', 'BASIC', 'PRO', 'ENTERPRISE'].map(p => (
              <button key={p} onClick={() => setFilterPlan(p)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${filterPlan === p
                  ? p === 'ENTERPRISE' ? 'bg-purple-600 text-white' : p === 'PRO' ? 'bg-blue-600 text-white'
                    : p === 'TRIAL' ? 'bg-green-600 text-white' : p === 'BASIC' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {p === 'ALL' ? 'Todos' : PLAN_META[p]?.label}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Buscar empresa o NIT..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Empresa</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">NIT</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Plan</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Vencimiento</th>
                <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No se encontraron empresas.</td></tr>
              ) : filtered.map(c => {
                const meta    = PLAN_META[c.subscription_plan] || PLAN_META['BASIC'];
                const expired = c.subscription_end_date && c.subscription_end_date < new Date().toISOString();
                const cfg     = c.config || {};
                const types: string[] = Array.isArray(cfg.business_types) ? cfg.business_types : cfg.business_type ? [cfg.business_type] : ['general'];
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 flex-shrink-0">
                          {c.logo_url ? <img src={c.logo_url} className="w-full h-full object-cover rounded-lg" alt="" /> : <Building2 size={18} />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                          <p className="text-xs text-slate-400">
                            {types.map((t: string) => BUSINESS_TYPES.find(b => b.id === t)?.label || t).join(' · ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 font-mono">{c.nit}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${meta.bg} ${meta.color}`}>
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {c.subscription_status === 'ACTIVE'
                        ? <span className="flex items-center gap-1 text-sm text-green-600 font-medium"><CheckCircle2 size={13} /> Activa</span>
                        : c.subscription_status === 'PAST_DUE'
                        ? <span className="flex items-center gap-1 text-sm text-orange-500 font-medium"><XCircle size={13} /> Vencida</span>
                        : <span className="flex items-center gap-1 text-sm text-red-500 font-medium"><XCircle size={13} /> Inactiva</span>}
                    </td>
                    <td className="px-5 py-4 text-sm">
                      {c.subscription_end_date
                        ? <span className={expired ? 'text-red-500 font-semibold' : 'text-slate-500'}>
                            <Calendar size={12} className="inline mr-1" />
                            {new Date(c.subscription_end_date).toLocaleDateString('es-CO')}
                          </span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* GESTIÓN DE USUARIOS */}
                        <button onClick={() => openUserMgmt(c)} title="Gestionar usuarios (contraseña / correo)"
                          className="p-2 rounded-lg hover:bg-violet-50 text-violet-500 transition-colors">
                          <UserCog size={15} />
                        </button>
                        {/* DIAGNÓSTICO — botón nuevo */}
                        <button onClick={() => openDiagnostic(c)} title="Ver diagnóstico del negocio"
                          className="p-2 rounded-lg hover:bg-cyan-50 text-cyan-600 transition-colors">
                          <Activity size={15} />
                        </button>
                        {/* Soporte */}
                        <button onClick={() => openSupport(c)} title="Soporte / Configuración"
                          className="p-2 rounded-lg hover:bg-orange-50 text-orange-500 transition-colors">
                          <Wrench size={15} />
                        </button>
                        <button onClick={() => openEdit(c)} title="Editar"
                          className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors">
                          <Edit3 size={15} />
                        </button>
                        <button onClick={() => toggleStatus(c)} title={c.subscription_status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                          className={`p-2 rounded-lg transition-colors ${c.subscription_status === 'ACTIVE' ? 'hover:bg-red-50 text-red-400' : 'hover:bg-green-50 text-green-500'}`}>
                          {c.subscription_status === 'ACTIVE' ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL NUEVA EMPRESA */}
      {showNewModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Nueva Empresa</h3>
              <button onClick={() => setShowNewModal(false)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 overflow-y-auto space-y-1">
              <PlanForm data={newCompany} setData={setNewCompany} />
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowNewModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Guardando...' : 'Crear Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR EMPRESA */}
      {showEditModal && editCompany && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Editar Empresa</h3>
                <p className="text-xs text-slate-400">{editCompany.name}</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1" style={{ overflowY: 'scroll' }}>
              <form onSubmit={handleEdit} className="p-6 space-y-4">
                <PlanForm data={editCompany} setData={setEditCompany} />
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setShowEditModal(false)}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold disabled:opacity-60 ${editCompany.subscription_plan === 'ENTERPRISE' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* PANEL SOPORTE */}
      {showSupport && supportCompany && (
        <SupportPanel
          company={supportCompany}
          onClose={() => { setShowSupport(false); setSupportCompany(null); }}
          onSaved={fetchCompanies}
        />
      )}

      {/* PANEL DIAGNÓSTICO */}
      {showDiagnostic && diagnosticCompany && (
        <DiagnosticPanel
          company={diagnosticCompany}
          onClose={() => { setShowDiagnostic(false); setDiagnosticCompany(null); }}
        />
      )}

      {/* PANEL GESTIÓN DE USUARIOS */}
      {showUserMgmt && userMgmtCompany && (
        <UserManagementPanel
          company={userMgmtCompany}
          onClose={() => { setShowUserMgmt(false); setUserMgmtCompany(null); }}
        />
      )}
    </div>
  );
};

export default MasterAdmin;