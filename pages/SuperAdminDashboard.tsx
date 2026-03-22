import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';
import {
  LayoutDashboard, Building2, FileText, Link2, DollarSign,
  Users, LogOut, Search, Plus, Edit2, Trash2, Eye, Activity,
  CheckCircle, Clock, AlertCircle, XCircle, RefreshCw,
  ChevronDown, ChevronRight, ShieldCheck, Mail, Lock,
  TrendingUp, BarChart2, Package, Zap, Receipt, Send,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ── Constants ──────────────────────────────────────────────────────────────────
const EDGE_URL = `${(supabase as any).supabaseUrl}/functions/v1/master-admin-actions`;
const WHATSAPP = '573204884943';

const PLAN_COLOR: Record<string, string> = {
  TRIAL: '#10b981', BASIC: '#64748b', PRO: '#3b82f6', ENTERPRISE: '#8b5cf6',
};
const STATUS_CFG: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
  ACTIVE:   { bg: '#dcfce7', text: '#16a34a', label: 'Activo',    icon: <CheckCircle size={11} /> },
  INACTIVE: { bg: '#fee2e2', text: '#dc2626', label: 'Inactivo',  icon: <XCircle size={11} /> },
  PENDING:  { bg: '#fef9c3', text: '#b45309', label: 'Pendiente', icon: <Clock size={11} /> },
  PAST_DUE: { bg: '#ffedd5', text: '#ea580c', label: 'Vencido',   icon: <AlertCircle size={11} /> },
};

const FEATURE_DEFS = [
  { id: 'credit_notes',    label: 'Devoluciones / NC',   cat: 'Ventas',     defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
  { id: 'quotes',          label: 'Cotizaciones',         cat: 'Ventas',     defaultPlans: ['BASIC','PRO','ENTERPRISE','TRIAL'] },
  { id: 'dian',            label: 'Facturación DIAN',     cat: 'Ventas',     defaultPlans: ['ENTERPRISE'] },
  { id: 'variants',        label: 'Variantes',            cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
  { id: 'purchase_orders', label: 'Órdenes de compra',    cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
  { id: 'weighable',       label: 'Productos pesables',   cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
  { id: 'nomina',          label: 'Nómina',               cat: 'Finanzas',   defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'cash_expenses',   label: 'Egresos de caja',      cat: 'Finanzas',   defaultPlans: ['BASIC','PRO','ENTERPRISE','TRIAL'] },
  { id: 'op_expenses',     label: 'Gastos Operativos',    cat: 'Finanzas',   defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'advanced_reports',label: 'Reportes avanzados',   cat: 'Finanzas',   defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'sales_channel',   label: 'Canal de venta',       cat: 'Finanzas',   defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'restaurant',      label: 'Restaurante',          cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'salon',           label: 'Salón',                cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'dental',          label: 'Odontología',          cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'vet',             label: 'Veterinaria',          cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'pharmacy',        label: 'Farmacia',             cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'shoe_repair',     label: 'Zapatería',            cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
  { id: 'catalog',         label: 'Catálogo WhatsApp',    cat: 'Marketing',  defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
  { id: 'branding',        label: 'Personalización',      cat: 'Marketing',  defaultPlans: ['PRO','ENTERPRISE'] },
];

const getDefaultFlags = (plan: string) => {
  const f: Record<string, boolean> = {};
  FEATURE_DEFS.forEach(d => { f[d.id] = d.defaultPlans.includes(plan); });
  return f;
};

// ── Shared helpers ─────────────────────────────────────────────────────────────
const pill = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
  background: color==='blue'?'#eff6ff':color==='green'?'#f0fdf4':color==='amber'?'#fffbeb':color==='red'?'#fef2f2':color==='purple'?'#f5f3ff':color==='teal'?'#f0fdfa':'#f1f5f9',
  color: color==='blue'?'#1d4ed8':color==='green'?'#15803d':color==='amber'?'#b45309':color==='red'?'#dc2626':color==='purple'?'#6d28d9':color==='teal'?'#0f766e':'#475569',
});
const btn = (v: string): React.CSSProperties => ({
  padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap' as const, display: 'inline-flex', alignItems: 'center', gap: 5,
  background: v==='green'?'#f0fdf4':v==='blue'?'#eff6ff':v==='red'?'#fef2f2':v==='dark'?'#0f172a':v==='amber'?'#fffbeb':v==='purple'?'#f5f3ff':'#f8fafc',
  color:      v==='green'?'#15803d':v==='blue'?'#1d4ed8':v==='red'?'#dc2626':v==='dark'?'#fff':v==='amber'?'#b45309':v==='purple'?'#7c3aed':'#475569',
  border: v==='dark'?'none':'1px solid',
  borderColor: v==='green'?'#bbf7d0':v==='blue'?'#bfdbfe':v==='red'?'#fecaca':v==='amber'?'#fde68a':v==='purple'?'#e9d5ff':'#e2e8f0',
});
const col = { padding: '11px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'middle' as const };
const hdr = { padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: '#f8fafc' };
const input = (extra?: React.CSSProperties): React.CSSProperties => ({ width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, color: '#1e293b', ...extra });

// ── UserManagementModal ────────────────────────────────────────────────────────
const UserMgmtModal: React.FC<{ company: any; onClose: () => void }> = ({ company, onClose }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [action, setAction] = useState<{ type: string; userId: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, email, role, is_active')
      .eq('company_id', company.id).then(({ data }) => { setUsers(data || []); setLoading(false); });
  }, [company.id]);

  const callEdge = async (payload: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error');
    return json;
  };

  const run = async () => {
    if (!action) return;
    setWorking(true);
    try {
      if (action.type === 'recovery') { await callEdge({ action: 'send_recovery', user_id: action.userId }); toast.success('Correo enviado'); }
      else if (action.type === 'password') {
        if (newPassword.length < 6) { toast.error('Mínimo 6 caracteres'); setWorking(false); return; }
        await callEdge({ action: 'set_password', user_id: action.userId, new_password: newPassword });
        toast.success('Contraseña actualizada'); setNewPassword('');
      } else if (action.type === 'email') {
        if (!newEmail.includes('@')) { toast.error('Email inválido'); setWorking(false); return; }
        await callEdge({ action: 'change_email', user_id: action.userId, new_email: newEmail });
        toast.success('Correo actualizado');
        setUsers(p => p.map(u => u.id === action.userId ? { ...u, email: newEmail } : u)); setNewEmail('');
      }
      setAction(null);
    } catch (e: any) { toast.error(e.message); } finally { setWorking(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 600, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#7c3aed', borderRadius: '20px 20px 0 0' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>Gestión de Usuarios</p>
            <h3 style={{ margin: '2px 0 0', fontWeight: 800, fontSize: 17, color: '#fff' }}>{company.name}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#fff', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>
          {loading ? <p style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Cargando...</p>
          : users.length === 0 ? <p style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Sin usuarios registrados</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {users.map(user => (
                <div key={user.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{user.full_name || '—'}</p>
                      <p style={{ margin: '2px 0 4px', color: '#64748b', fontSize: 12 }}>{user.email}</p>
                      <span style={pill(user.role === 'ADMIN' ? 'blue' : 'gray')}>{user.role}</span>
                    </div>
                    <span style={pill(user.is_active ? 'green' : 'red')}>{user.is_active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    {['recovery','password','email'].map(t => (
                      <button key={t} onClick={() => setAction({ type: t, userId: user.id, email: user.email })}
                        style={btn(t === 'recovery' ? 'blue' : t === 'password' ? 'purple' : 'amber')}>
                        {t === 'recovery' ? <><Mail size={11} /> Recuperación</> : t === 'password' ? <><Lock size={11} /> Contraseña</> : <><Mail size={11} /> Cambiar correo</>}
                      </button>
                    ))}
                  </div>
                  {action?.userId === user.id && (
                    <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      {action.type === 'recovery' && <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>Enviar correo de recuperación a <strong>{user.email}</strong></p>}
                      {action.type === 'password' && <input type="password" placeholder="Nueva contraseña (mín. 6)" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={input({ marginBottom: 10 })} />}
                      {action.type === 'email' && <input type="email" placeholder="Nuevo correo" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={input({ marginBottom: 10 })} />}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setAction(null); setNewPassword(''); setNewEmail(''); }} style={{ flex: 1, padding: 8, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>Cancelar</button>
                        <button onClick={run} disabled={working} style={{ flex: 2, padding: 8, border: 'none', borderRadius: 8, background: action.type === 'recovery' ? '#2563eb' : action.type === 'password' ? '#7c3aed' : '#ea580c', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: working ? 0.7 : 1 }}>
                          {working ? 'Procesando...' : action.type === 'recovery' ? 'Enviar' : action.type === 'password' ? 'Establecer' : 'Actualizar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
type Panel = 'overview' | 'companies' | 'contracts' | 'settings' | 'billing' | 'features';

const SuperAdminDashboard: React.FC<{ onExit: () => void; onPreview: (id: string) => void }> = ({ onExit, onPreview }) => {
  const [panel, setPanel] = useState<Panel>('overview');
  const [companies, setCompanies] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPlan, setFilterPlan] = useState('ALL');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showConfirmPayment, setShowConfirmPayment] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [userMgmtCompany, setUserMgmtCompany] = useState<any>(null);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  // Platform settings
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [savingLinks, setSavingLinks] = useState(false);
  const [pricingData, setPricingData] = useState<Record<string, string>>({
    basic_price: '$65.000', pro_price: '$120.000', enterprise_price: '$249.900',
    basic_desc: 'Para negocios pequeños', pro_desc: 'Para negocios con varias sucursales',
    enterprise_desc: 'Empresas con facturación electrónica y API',
    basic_features: '1 Negocio · 1 sucursal,POS Completo,Inventario Ilimitado,Control de Caja,Servicio Técnico,Cartera / CxC,Soporte por WhatsApp',
    pro_features: 'Todo lo del Basic,Hasta 3 sucursales,Hasta 5 usuarios,Roles y permisos,Dashboard avanzado,Soporte Prioritario',
    enterprise_features: 'Todo lo del Pro,Sucursales ilimitadas,Usuarios ilimitados,Facturación electrónica,API + Webhooks,Gerente de cuenta dedicado',
  });
  const [savingPricing, setSavingPricing] = useState(false);

  // New company form
  const [newCo, setNewCo] = useState({
    name: '', nit: '', email: '', phone: '', plan: 'BASIC',
    adminEmail: '', adminPassword: '',
    subscription_start_date: new Date().toISOString().split('T')[0],
    subscription_end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  });
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setNewCo(p => ({ ...p, [k]: e.target.value }));

  // Edit form
  const [editForm, setEditForm] = useState<any>({});
  const fe = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditForm((p: any) => ({ ...p, [k]: e.target.value }));

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cos }, { data: conts }] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('contracts').select('*').order('created_at', { ascending: false }),
    ]);
    setCompanies(cos || []);
    setContracts(conts || []);
    // Platform settings
    const { data: settings } = await supabase.from('platform_settings').select('key, value, category');
    if (settings) {
      const map: Record<string, string> = {};
      settings.forEach((r: any) => { map[r.key] = r.value; });
      setPricingData(p => ({ ...p, ...map }));
      const pm: Record<string, string> = {};
      settings.filter((r: any) => r.category === 'payment').forEach((r: any) => { pm[r.key] = r.value; });
      setPaymentLinks(pm);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime contract signed
  useEffect(() => {
    const ch = supabase.channel('sa-contracts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contracts', filter: 'status=eq.SIGNED' },
        (p: any) => setContracts(prev => prev.map(c => c.id === p.new.id ? p.new : c)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Computed metrics ───────────────────────────────────────────────────────
  const active   = companies.filter(c => c.subscription_status === 'ACTIVE').length;
  const pastDue  = companies.filter(c => c.subscription_status === 'PAST_DUE').length;
  const trial    = companies.filter(c => c.subscription_plan === 'TRIAL').length;
  const signed   = contracts.filter(c => c.status === 'SIGNED').length;
  const mrr      = companies.filter(c => c.subscription_status === 'ACTIVE').reduce((s, c) => {
    const p = c.subscription_plan;
    return s + (p === 'ENTERPRISE' ? 249900 : p === 'PRO' ? 120000 : p === 'BASIC' ? 65000 : 0);
  }, 0);

  const planDist = ['TRIAL','BASIC','PRO','ENTERPRISE'].map(p => ({
    name: p, value: companies.filter(c => c.subscription_plan === p).length,
  })).filter(d => d.value > 0);

  const monthlyGrowth = (() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now); d.setMonth(d.getMonth() - (5 - i));
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const count = companies.filter(c => c.created_at?.startsWith(ym)).length;
      return { month: d.toLocaleString('es', { month: 'short' }), negocios: count };
    });
  })();

  // ── Filtered companies ──────────────────────────────────────────────────────
  const filtered = companies.filter(c => {
    const matchStatus = filterStatus === 'ALL' || c.subscription_status === filterStatus;
    const matchPlan   = filterPlan   === 'ALL' || c.subscription_plan   === filterPlan;
    const q = search.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || (c.nit || '').includes(q) || (c.email || '').toLowerCase().includes(q);
    return matchStatus && matchPlan && matchSearch;
  });

  const getDaysLeft = (d: string) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;

  // ── CRUD handlers ───────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newCo.name || !newCo.nit || !newCo.adminEmail || !newCo.adminPassword) { toast.error('Completa todos los campos'); return; }
    setCreating(true);
    try {
      const { data: auth, error: ae } = await supabase.auth.signUp({ email: newCo.adminEmail, password: newCo.adminPassword, options: { data: { full_name: newCo.name } } });
      if (ae) throw ae;
      const { data: co, error: ce } = await supabase.from('companies').insert({
        name: newCo.name, nit: newCo.nit, email: newCo.email, phone: newCo.phone,
        subscription_plan: newCo.plan, subscription_status: 'ACTIVE',
        subscription_start_date: newCo.subscription_start_date, subscription_end_date: newCo.subscription_end_date,
        config: { tax_rate: 19, currency_symbol: '$', invoice_prefix: 'POS' },
      }).select().single();
      if (ce) throw ce;
      if (auth.user) {
        await supabase.from('profiles').upsert({ id: auth.user.id, company_id: co.id, role: 'ADMIN', full_name: newCo.name, email: newCo.adminEmail, is_active: true }, { onConflict: 'id' });
        const { data: branch } = await supabase.from('branches').insert({ company_id: co.id, name: 'Sede Principal', is_active: true }).select().single();
        if (branch) await supabase.from('profiles').update({ branch_id: branch.id }).eq('id', auth.user.id);
      }
      toast.success(`✅ "${newCo.name}" creado`);
      setShowCreate(false);
      setNewCo({ name: '', nit: '', email: '', phone: '', plan: 'BASIC', adminEmail: '', adminPassword: '', subscription_start_date: new Date().toISOString().split('T')[0], subscription_end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0] });
      load();
    } catch (e: any) { toast.error(e.message); } finally { setCreating(false); }
  };

  const openEdit = (c: any) => {
    setSelectedCompany(c);
    setEditForm({ name: c.name, nit: c.nit, email: c.email || '', phone: c.phone || '', plan: c.subscription_plan, subscription_status: c.subscription_status, subscription_start_date: c.subscription_start_date || '', subscription_end_date: c.subscription_end_date || '', feature_flags: c.feature_flags && Object.keys(c.feature_flags).length > 0 ? c.feature_flags : getDefaultFlags(c.subscription_plan || 'BASIC'), show_in_landing: c.show_in_landing || false });
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!selectedCompany) return;
    const { error } = await supabase.from('companies').update({ name: editForm.name, nit: editForm.nit, email: editForm.email, phone: editForm.phone, subscription_plan: editForm.plan, subscription_status: editForm.subscription_status, subscription_start_date: editForm.subscription_start_date || null, subscription_end_date: editForm.subscription_end_date || null, feature_flags: editForm.feature_flags, show_in_landing: editForm.show_in_landing }).eq('id', selectedCompany.id);
    if (error) { toast.error(error.message); return; }
    toast.success('✅ Actualizado'); setShowEdit(false); load();
  };

  const handleDelete = async () => {
    if (!selectedCompany) return;
    try {
      await supabase.from('profiles').delete().eq('company_id', selectedCompany.id);
      await supabase.from('branches').delete().eq('company_id', selectedCompany.id);
      const { error } = await supabase.from('companies').delete().eq('id', selectedCompany.id);
      if (error) throw error;
      toast.success(`"${selectedCompany.name}" eliminado`);
      setShowDelete(false); setSelectedCompany(null); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleConfirmPayment = async () => {
    if (!selectedCompany) return;
    const newStart = new Date().toISOString().split('T')[0];
    const newEnd   = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const { error } = await supabase.from('companies').update({ subscription_status: 'ACTIVE', subscription_start_date: newStart, subscription_end_date: newEnd }).eq('id', selectedCompany.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Renovado hasta ${newEnd}`); setShowConfirmPayment(false); load();
  };

  const handleViewLogs = async (c: any) => {
    setSelectedCompany(c);
    const [{ data: invs }, { data: sess }] = await Promise.all([
      supabase.from('invoices').select('id, total_amount, status, created_at, payment_method, invoice_number').eq('company_id', c.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('cash_register_sessions').select('id, status, opening_cash, created_at').eq('company_id', c.id).order('created_at', { ascending: false }).limit(10),
    ]);
    setLogs([
      ...(invs || []).map((i: any) => ({ type: 'Factura', detail: `${i.invoice_number ? '#' + i.invoice_number + ' · ' : ''}$${(i.total_amount || 0).toLocaleString('es-CO')} — ${typeof i.payment_method === 'object' ? (i.payment_method?.method || 'efectivo') : (i.payment_method || 'efectivo')}`, status: i.status, date: i.created_at })),
      ...(sess || []).map((s: any) => ({ type: 'Caja', detail: `Apertura: $${(s.opening_cash || 0).toLocaleString('es-CO')}`, status: s.status, date: s.created_at })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setShowLogs(true);
  };

  const sendContract = async (c: any) => {
    const existing = contracts.find(x => x.company_id === c.id);
    if (existing) {
      const link = `${window.location.origin}/#/contrato/${existing.token}`;
      const ok = window.confirm(`${existing.status === 'SIGNED' ? '✅ Ya firmado.' : '⏳ Contrato pendiente.'}\n\n¿Copiar enlace existente?`);
      if (ok) navigator.clipboard.writeText(link).then(() => toast.success('Enlace copiado')).catch(() => prompt('Enlace:', link));
      return;
    }
    const { data, error } = await supabase.from('contracts').insert({
      company_id: c.id, client_name: c.name, client_email: c.email || '', business_name: c.name, plan: c.subscription_plan || 'BASIC', status: 'PENDING',
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setContracts(p => [data, ...p]);
    const link = `${window.location.origin}/#/contrato/${data.token}`;
    navigator.clipboard.writeText(link).then(() => toast.success('✅ Enlace copiado')).catch(() => prompt('Enlace:', link));
  };

  const savePricing = async () => {
    setSavingPricing(true);
    const keys = ['basic_price','pro_price','enterprise_price','basic_desc','pro_desc','enterprise_desc','basic_features','pro_features','enterprise_features'];
    for (const key of keys) {
      if (pricingData[key] !== undefined) await supabase.from('platform_settings').upsert({ key, value: pricingData[key], category: 'pricing' }, { onConflict: 'key' });
    }
    setSavingPricing(false);
    toast.success('✅ Precios guardados');
  };

  const saveLinks = async () => {
    setSavingLinks(true);
    for (const [key, value] of Object.entries(paymentLinks)) {
      await supabase.from('platform_settings').upsert({ key, value, category: 'payment' }, { onConflict: 'key' });
    }
    setSavingLinks(false);
    toast.success('✅ Links guardados');
  };

  // ── SIDEBAR ────────────────────────────────────────────────────────────────
  const NAVITEMS: { key: Panel; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'overview',   label: 'Dashboard',       icon: <LayoutDashboard size={16} /> },
    { key: 'companies',  label: 'Clientes',         icon: <Building2 size={16} />, badge: companies.length },
    { key: 'billing',    label: 'Cobros',           icon: <Receipt size={16} />,   badge: companies.filter(c => c.subscription_status === 'PAST_DUE' || c.subscription_status === 'PENDING').length || undefined },
    { key: 'features',   label: 'Features',         icon: <Zap size={16} /> },
    { key: 'contracts',  label: 'Contratos',        icon: <FileText size={16} />,  badge: signed },
    { key: 'settings',   label: 'Configuración',    icon: <DollarSign size={16} /> },
  ];

  // ── OVERVIEW PANEL ─────────────────────────────────────────────────────────
  const OverviewPanel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {[
          { label: 'Total negocios', value: companies.length, color: '#1d4ed8', bg: '#eff6ff', icon: <Building2 size={18} /> },
          { label: 'Activos',        value: active,            color: '#15803d', bg: '#f0fdf4', icon: <CheckCircle size={18} /> },
          { label: 'Vencidos',       value: pastDue,           color: '#ea580c', bg: '#fff7ed', icon: <AlertCircle size={18} /> },
          { label: 'Contratos firmados', value: signed,        color: '#7c3aed', bg: '#f5f3ff', icon: <FileText size={18} /> },
          { label: 'MRR estimado',   value: `$${(mrr/1000).toFixed(0)}K`, color: '#0f766e', bg: '#f0fdfa', icon: <TrendingUp size={18} /> },
        ].map((m, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{m.label}</p>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color }}>{m.icon}</div>
            </div>
            <p style={{ fontSize: 26, fontWeight: 800, color: m.color, margin: '8px 0 0', lineHeight: 1 }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Negocios nuevos — últimos 6 meses</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyGrowth}>
              <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Area type="monotone" dataKey="negocios" stroke="#3b82f6" strokeWidth={2} fill="url(#ag)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Por plan</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={planDist} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={10}>
                {planDist.map((d, i) => <Cell key={i} fill={PLAN_COLOR[d.name] || '#94a3b8'} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Vencen pronto */}
      {companies.filter(c => { const d = getDaysLeft(c.subscription_end_date); return d !== null && d >= 0 && d <= 7; }).length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#b45309', margin: '0 0 10px' }}>⚠️ Vencen en los próximos 7 días</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {companies.filter(c => { const d = getDaysLeft(c.subscription_end_date); return d !== null && d >= 0 && d <= 7; }).map(c => {
              const d = getDaysLeft(c.subscription_end_date);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={pill('amber')}>{d === 0 ? '¡Hoy!' : `${d}d`}</span>
                    <button onClick={() => { setSelectedCompany(c); setShowConfirmPayment(true); }} style={btn('green')}><DollarSign size={11} /> Confirmar pago</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ── COMPANIES PANEL ────────────────────────────────────────────────────────
  const CompaniesPanel = () => (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar negocio, NIT, email..." style={input({ paddingLeft: 32 })} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={input({ width: 'auto' })}>
          {['ALL','ACTIVE','PENDING','PAST_DUE','INACTIVE'].map(s => <option key={s} value={s}>{s === 'ALL' ? 'Todos los estados' : STATUS_CFG[s]?.label || s}</option>)}
        </select>
        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} style={input({ width: 'auto' })}>
          {['ALL','TRIAL','BASIC','PRO','ENTERPRISE'].map(p => <option key={p} value={p}>{p === 'ALL' ? 'Todos los planes' : p}</option>)}
        </select>
        <button onClick={() => setShowCreate(true)} style={{ ...btn('dark'), padding: '9px 16px', fontSize: 13 }}><Plus size={14} /> Nuevo negocio</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Negocio','Plan','Estado','Vence','Acciones'].map(h => <th key={h} style={hdr}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ ...col, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ ...col, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Sin resultados</td></tr>
            ) : filtered.map(c => {
              const st = STATUS_CFG[c.subscription_status] || STATUS_CFG['INACTIVE'];
              const d  = getDaysLeft(c.subscription_end_date);
              const dColor = d === null ? '#94a3b8' : d < 0 ? '#dc2626' : d <= 7 ? '#ea580c' : d <= 30 ? '#b45309' : '#64748b';
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.background='#fafafa')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                  <td style={col}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{c.name}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: '#94a3b8' }}>{c.nit || '—'} · {c.email || '—'}</p>
                  </td>
                  <td style={col}><span style={{ ...pill('gray'), background: PLAN_COLOR[c.subscription_plan] + '20', color: PLAN_COLOR[c.subscription_plan] }}>{c.subscription_plan}</span></td>
                  <td style={col}><span style={{ ...pill('gray'), background: st.bg, color: st.text }}>{st.icon}{st.label}</span></td>
                  <td style={{ ...col, color: dColor, fontWeight: d !== null && d <= 7 ? 700 : 400, fontSize: 12 }}>
                    {d === null ? '—' : d < 0 ? `Vencido (${Math.abs(d)}d)` : d === 0 ? '¡Hoy!' : `${d}d`}
                  </td>
                  <td style={col}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
                      <button onClick={() => openEdit(c)} style={btn('blue')} title="Editar empresa"><Edit2 size={11} /> Editar</button>
                      <button onClick={() => handleViewLogs(c)} style={btn('gray')} title="Ver actividad reciente (facturas y caja)"><Activity size={11} /></button>
                      <button onClick={() => sendContract(c)} style={btn('purple')} title="Generar / copiar enlace de contrato"><FileText size={11} /></button>
                      <button onClick={() => onPreview(c.id)} style={btn('teal')} title="Vista previa del negocio (como si fueras el admin)"><Eye size={11} /></button>
                      <a href={`https://wa.me/${WHATSAPP}?text=Hola ${c.name}`} target="_blank" rel="noreferrer" style={{ ...btn('green'), textDecoration: 'none' }} title="Enviar WhatsApp al negocio">💬</a>
                      {(c.subscription_status === 'PAST_DUE' || c.subscription_status === 'PENDING') && (
                        <button onClick={() => { setSelectedCompany(c); setShowConfirmPayment(true); }} style={btn('green')} title="Confirmar pago y renovar suscripción"><DollarSign size={11} /> Pago</button>
                      )}
                      <button onClick={() => { setSelectedCompany(c); setShowUserMgmt(true); setUserMgmtCompany(c); }} style={btn('purple')} title="Gestionar usuarios (contraseña, correo, recuperación)"><Users size={11} /></button>
                      <button onClick={() => { setSelectedCompany(c); setShowDelete(true); }} style={btn('red')} title="Eliminar empresa permanentemente"><Trash2 size={11} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── CONTRACTS PANEL ────────────────────────────────────────────────────────
  const ContractsPanel = () => (
    <div>
      {contracts.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
          <p style={{ color: '#64748b', fontWeight: 600 }}>No hay contratos aún.</p>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Genera contratos desde la lista de Clientes.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Estado','Cliente','Negocio','Plan','Generado','Firmado','Acciones'].map(h => <th key={h} style={hdr}>{h}</th>)}</tr></thead>
            <tbody>
              {contracts.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={col}><span style={pill(c.status === 'SIGNED' ? 'green' : 'amber')}>{c.status === 'SIGNED' ? '✅ Firmado' : '⏳ Pendiente'}</span></td>
                  <td style={{ ...col, fontWeight: 600, color: '#0f172a' }}>{c.client_name || '—'}</td>
                  <td style={{ ...col, color: '#475569' }}>{c.business_name || '—'}</td>
                  <td style={col}><span style={pill('blue')}>{c.plan}</span></td>
                  <td style={{ ...col, fontSize: 11, color: '#94a3b8' }}>{new Date(c.created_at).toLocaleDateString('es-CO')}</td>
                  <td style={{ ...col, fontSize: 11, color: '#94a3b8' }}>{c.signed_at ? new Date(c.signed_at).toLocaleDateString('es-CO') : '—'}</td>
                  <td style={col}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => { const link = `${window.location.origin}/#/contrato/${c.token}`; navigator.clipboard.writeText(link).then(() => toast.success('Enlace copiado')).catch(() => prompt('Enlace:', link)); }} style={btn('gray')}><Link2 size={11} /> Enlace</button>
                      {c.status === 'SIGNED' && (
                        <button onClick={() => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!DOCTYPE html><html><head><title>Contrato ${c.client_name}</title></head><body style="font-family:Arial,sans-serif;padding:40px;max-width:700px;margin:0 auto"><h2>Contrato — ${c.business_name}</h2><p><strong>Cliente:</strong> ${c.client_name}</p><p><strong>Plan:</strong> ${c.plan}</p><p><strong>Firmado:</strong> ${c.signed_at ? new Date(c.signed_at).toLocaleString('es-CO') : '—'}</p></body></html>`); w.document.close(); w.print(); }} style={btn('green')}>📥 PDF</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── FEATURES PANEL ─────────────────────────────────────────────────────────
  const FeaturesPanel = () => {
    const LOGO_URL = 'https://wdaabpbpxbbfhurvjvwj.supabase.co/storage/v1/object/public/company-logos/logo.png';
    const FIRMA_URL = 'https://wdaabpbpxbbfhurvjvwj.supabase.co/storage/v1/object/public/company-logos/firma_diego.png';
    const CONTACTO = { email: 'info@posmaster.org', tel: '3204884943', web: 'posmaster.org' };

    const cats = [...new Set(FEATURE_DEFS.map(f => f.cat))];
    const [selectedFeature, setSelectedFeature] = React.useState<string | null>(null);
    const [generandoImg, setGenerandoImg] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [modoEdicion, setModoEdicion] = React.useState(false);

    // Estado editable de planes por feature — inicializa desde FEATURE_DEFS
    // y luego sobreescribe con lo que haya en platform_settings
    const [planMatrix, setPlanMatrix] = React.useState<Record<string, string[]>>(() => {
      const m: Record<string, string[]> = {};
      FEATURE_DEFS.forEach(f => {
        // Intentar leer de pricingData si ya estaba guardado
        const saved = (pricingData as any)[`feature_plans_${f.id}`];
        m[f.id] = saved ? saved.split(',') : [...f.defaultPlans];
      });
      return m;
    });

    const togglePlan = (featureId: string, plan: string) => {
      setPlanMatrix(prev => {
        const current = prev[featureId] || [];
        const next = current.includes(plan)
          ? current.filter(p => p !== plan)
          : [...current, plan];
        return { ...prev, [featureId]: next };
      });
    };

    const guardarCambios = async () => {
      setSaving(true);
      for (const [featureId, plans] of Object.entries(planMatrix)) {
        await supabase.from('platform_settings').upsert(
          { key: `feature_plans_${featureId}`, value: plans.join(','), category: 'features' },
          { onConflict: 'key' }
        );
      }
      // Actualizar pricingData local para reflejar cambios
      const updates: Record<string,string> = {};
      Object.entries(planMatrix).forEach(([id, plans]) => {
        updates[`feature_plans_${id}`] = plans.join(',');
      });
      setPricingData((p: any) => ({ ...p, ...updates }));
      setSaving(false);
      setModoEdicion(false);
      toast.success('✅ Configuración de features guardada');
    };

    const resetearDefaults = () => {
      if (!window.confirm('¿Restaurar configuración original de todas las features?')) return;
      const m: Record<string, string[]> = {};
      FEATURE_DEFS.forEach(f => { m[f.id] = [...f.defaultPlans]; });
      setPlanMatrix(m);
    };


    // Cuántos clientes tienen cada feature activa
    const featureStats = FEATURE_DEFS.map(fd => ({
      ...fd,
      activePlans: planMatrix[fd.id] || fd.defaultPlans,
      activos: companies.filter(c => c.feature_flags?.[fd.id] === true).length,
      total: companies.filter(c => c.subscription_plan !== 'TRIAL').length,
    }));

    // Generar imagen de cotización de feature para compartir
    const generarImagenFeature = (feat: typeof FEATURE_DEFS[0]) => {
      setGenerandoImg(true);
      const html = `
        <html><head><meta charset="UTF-8">
        <style>
          body { margin:0; font-family:'Segoe UI',sans-serif; background:#0f172a; }
          .card { width:800px; padding:48px; background:linear-gradient(135deg,#1e293b,#0f172a); color:#fff; }
          .logo { height:48px; margin-bottom:32px; }
          .badge { display:inline-block; background:#3b82f6; color:#fff; padding:6px 16px; border-radius:20px; font-size:12px; font-weight:700; margin-bottom:16px; text-transform:uppercase; letter-spacing:1px; }
          .title { font-size:36px; font-weight:800; margin:0 0 16px; line-height:1.2; }
          .desc { font-size:16px; color:#94a3b8; margin:0 0 32px; line-height:1.6; }
          .plans { display:flex; gap:12px; margin-bottom:32px; }
          .plan { padding:8px 16px; border-radius:8px; font-size:13px; font-weight:700; }
          .footer { display:flex; align-items:center; justify-content:space-between; border-top:1px solid #334155; padding-top:24px; }
          .contact { color:#64748b; font-size:13px; }
          .firma { height:40px; opacity:0.8; }
        </style></head>
        <body><div class="card">
          <img src="${LOGO_URL}" class="logo" crossorigin="anonymous"/>
          <div class="badge">${feat.cat}</div>
          <h1 class="title">${feat.label}</h1>
          <p class="desc">Disponible en los planes:</p>
          <div class="plans">
            ${['BASIC','PRO','ENTERPRISE'].map(p => `
              <div class="plan" style="background:${(planMatrix[feat.id] || feat.defaultPlans).includes(p) ? '#16a34a20;color:#4ade80;border:1px solid #16a34a' : '#ef444420;color:#f87171;border:1px solid #ef4444'}">
                ${(planMatrix[feat.id] || feat.defaultPlans).includes(p) ? '✅' : '❌'} ${p}
              </div>`).join('')}
          </div>
          <div class="footer">
            <div class="contact">${CONTACTO.email} · ${CONTACTO.tel} · ${CONTACTO.web}</div>
            <img src="${FIRMA_URL}" class="firma" crossorigin="anonymous"/>
          </div>
        </div></body></html>`;
      const w = window.open('', '_blank', 'width=900,height=600');
      if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.print(); setGenerandoImg(false); }, 800); }
      else setGenerandoImg(false);
    };

    const generarCotizacionFeature = (feat: typeof FEATURE_DEFS[0], modo: 'wa' | 'img' = 'wa') => {
      if (modo === 'img') {
        const catColor: Record<string,string> = { Ventas:'#3b82f6', Inventario:'#10b981', Finanzas:'#f59e0b', Módulos:'#8b5cf6', Marketing:'#ef4444' };
        const color = catColor[feat.cat] || '#3b82f6';
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
            *{box-sizing:border-box;margin:0;padding:0;}
            body{font-family:'Inter',sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
            .card{width:600px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:24px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.3);}
            .header{padding:36px 36px 0;display:flex;align-items:center;justify-content:space-between;}
            .logo{height:40px;object-fit:contain;}
            .badge{background:${color};color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;}
            .body{padding:28px 36px 36px;}
            .title{font-size:30px;font-weight:900;color:#fff;margin-bottom:10px;line-height:1.2;}
            .subtitle{font-size:14px;color:#94a3b8;margin-bottom:24px;line-height:1.5;}
            .plans{display:flex;gap:8px;margin-bottom:28px;}
            .plan-on{padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;background:rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.3);}
            .plan-off{padding:7px 14px;border-radius:8px;font-size:12px;font-weight:700;background:rgba(248,113,113,0.1);color:#f87171;border:1px solid rgba(248,113,113,0.2);}
            .divider{height:1px;background:rgba(255,255,255,0.08);margin-bottom:20px;}
            .footer{display:flex;align-items:center;justify-content:space-between;}
            .contact{color:#64748b;font-size:12px;line-height:1.9;}
            .contact strong{color:#94a3b8;}
            .firma{height:40px;opacity:0.7;object-fit:contain;}
            @media print{body{background:#fff;padding:0;}.card{box-shadow:none;border-radius:0;width:100%;}}
          </style></head>
          <body><div class="card">
            <div class="header">
              <img src="${LOGO_URL}" class="logo" crossorigin="anonymous"/>
              <span class="badge">${feat.cat}</span>
            </div>
            <div class="body">
              <h1 class="title">${feat.label}</h1>
              <p class="subtitle">Funcionalidad disponible en POSmaster para potenciar la gestión de tu negocio colombiano.</p>
              <div class="plans">
                ${'BASIC,PRO,ENTERPRISE'.split(',').map(p => `<div class="${(planMatrix[feat.id] || feat.defaultPlans).includes(p) ? 'plan-on' : 'plan-off'}">${feat.defaultPlans.includes(p) ? '✓' : '✗'} ${p}</div>`).join('')}
              </div>
              <div class="divider"></div>
              <div class="footer">
                <div class="contact">
                  <strong>POSmaster</strong><br/>
                  📧 ${CONTACTO.email}<br/>
                  📱 ${CONTACTO.tel} &nbsp;|&nbsp; 🌐 ${CONTACTO.web}
                </div>
                <img src="${FIRMA_URL}" class="firma" crossorigin="anonymous"/>
              </div>
            </div>
          </div></body></html>`;
        const w = window.open('', '_blank', 'width=700,height=550');
        if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 800); }
        return;
      }
      const texto = `✨ *${feat.label}* — POSmaster\n━━━━━━━━━━━━━━━━━━━\n📂 Categoría: ${feat.cat}\n✅ Planes: ${(planMatrix[feat.id] || feat.defaultPlans).filter(p => p !== 'TRIAL').join(', ')}\n\n¿Quieres activar esta función?\n📧 ${CONTACTO.email}\n📱 ${CONTACTO.tel}\n🌐 ${CONTACTO.web}`;
      window.open(`https://wa.me/${CONTACTO.tel}?text=${encodeURIComponent(texto)}`, '_blank');
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: '#0f172a' }}>Features del sistema</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>{FEATURE_DEFS.length} funciones · Configura qué plans incluyen cada feature</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {modoEdicion ? (
              <>
                <button onClick={resetearDefaults} style={{ ...btn('gray'), fontSize: 12 }}>↺ Restaurar</button>
                <button onClick={() => setModoEdicion(false)} style={{ ...btn('gray'), fontSize: 12 }}>Cancelar</button>
                <button onClick={guardarCambios} disabled={saving}
                  style={{ ...btn('dark'), fontSize: 12, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Guardando...' : '💾 Guardar cambios'}
                </button>
              </>
            ) : (
              <button onClick={() => setModoEdicion(true)} style={{ ...btn('blue'), fontSize: 12 }}>
                ✏️ Editar planes por feature
              </button>
            )}
          </div>
        </div>

        {modoEdicion && (
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#854d0e' }}>
            💡 Haz click en los planes de cada feature para activar o desactivar. Los cambios afectan los <strong>nuevos clientes</strong> que se creen. Los clientes existentes mantienen su configuración actual.
          </div>
        )}

        {/* Stats rápidas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { label: 'Total features', value: FEATURE_DEFS.length, color: '#3b82f6' },
            { label: 'Categorías', value: cats.length, color: '#8b5cf6' },
            { label: 'Solo Enterprise', value: FEATURE_DEFS.filter(f => f.defaultPlans.length === 1 && f.defaultPlans[0] === 'ENTERPRISE').length, color: '#f59e0b' },
            { label: 'Disponibles en BASIC', value: FEATURE_DEFS.filter(f => f.defaultPlans.includes('BASIC')).length, color: '#10b981' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' as const }}>{label}</p>
              <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Lista por categoría */}
        {cats.map(cat => (
          <div key={cat} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} style={{ color: '#8b5cf6' }} />
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{cat}</p>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>({FEATURE_DEFS.filter(f => f.cat === cat).length} features)</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Feature','TRIAL','BASIC','PRO','ENTERPRISE','Clientes activos','Acciones'].map(h => <th key={h} style={hdr}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {featureStats.filter(f => f.cat === cat).map(feat => (
                  <tr key={feat.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={col}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{feat.label}</p>
                      <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{feat.id}</p>
                    </td>
                    {['TRIAL','BASIC','PRO','ENTERPRISE'].map(plan => (
                      <td key={plan} style={{ ...col, textAlign: 'center' as const }}>
                        {modoEdicion ? (
                          <button
                            onClick={() => togglePlan(feat.id, plan)}
                            style={{
                              width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 16,
                              background: feat.activePlans.includes(plan) ? '#dcfce7' : '#f1f5f9',
                              color: feat.activePlans.includes(plan) ? '#16a34a' : '#94a3b8',
                              transition: 'all 0.15s',
                            }}
                            title={feat.activePlans.includes(plan) ? `Quitar de ${plan}` : `Agregar a ${plan}`}>
                            {feat.activePlans.includes(plan) ? '✓' : '−'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 16 }}>{feat.activePlans.includes(plan) ? '✅' : '—'}</span>
                        )}
                      </td>
                    ))}
                    <td style={col}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: '#3b82f6', borderRadius: 3, width: feat.total > 0 ? `${(feat.activos / feat.total) * 100}%` : '0%' }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' as const }}>{feat.activos}/{feat.total}</span>
                      </div>
                    </td>
                    <td style={col}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => generarImagenFeature(feat)} disabled={generandoImg}
                          style={{ ...btn('purple'), fontSize: 11 }} title="Generar imagen para compartir">
                          🖼️ Imagen
                        </button>
                        <button onClick={() => generarCotizacionFeature(feat, 'img')}
                          style={{ ...btn('blue'), fontSize: 11 }} title="Generar imagen de cotización">
                          📄 Cot.
                        </button>
                        <button onClick={() => generarCotizacionFeature(feat, 'wa')}
                          style={{ ...btn('green'), fontSize: 11 }} title="Compartir por WhatsApp">
                          💬 WA
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  };

  // ── BILLING PANEL ──────────────────────────────────────────────────────────
  const BillingPanel = () => {
    const PLAN_PRICES: Record<string, number> = {
      TRIAL: 0,
      BASIC: parseInt(pricingData.basic_price?.replace(/\D/g,'') || '62000'),
      PRO: parseInt(pricingData.pro_price?.replace(/\D/g,'') || '120000'),
      ENTERPRISE: parseInt(pricingData.enterprise_price?.replace(/\D/g,'') || '249900'),
    };

    const mesActual = new Date().toLocaleString('es-CO', { month: 'long', year: 'numeric' });
    const periodoLabel = mesActual.charAt(0).toUpperCase() + mesActual.slice(1);

    const [subPanel, setSubPanel] = React.useState<'cobros' | 'historial' | 'cotizaciones'>('cobros');
    const [pagados, setPagados] = React.useState<Set<string>>(new Set());
    const [facturando, setFacturando] = React.useState<string | null>(null);

    // Descuentos por cliente: { [companyId]: { tipo: 'pct'|'val', valor: number, meses: number } }
    const [descuentos, setDescuentos] = React.useState<Record<string, { tipo: 'pct'|'val'; valor: number; meses: number }>>({});

    const [facturaConfig, setFacturaConfig] = React.useState<{
      factus_client_id: string;
      factus_client_secret: string;
      factus_username: string;
      factus_password: string;
      factus_env: string;
      mi_nit: string;
      mi_nombre: string;
    }>({
      factus_client_id: '', factus_client_secret: '',
      factus_username: '', factus_password: '',
      factus_env: 'sandbox', mi_nit: '1130668482',
      mi_nombre: 'DIEGO FERNANDO VALDES RANGEL',
    });
    const [showConfig, setShowConfig] = React.useState(false);
    const [resultados, setResultados] = React.useState<Record<string, { cufe: string; pdf_url: string; numero: string; valor: number; fecha: string }>>({});

    // Historial desde audit_logs
    const [historial, setHistorial] = React.useState<any[]>([]);
    const [loadingHistorial, setLoadingHistorial] = React.useState(false);

    // Cotizaciones
    const [cotizaciones, setCotizaciones] = React.useState<Array<{
      id: string; company: any; meses: number; descTipo: 'pct'|'val'; descValor: number; nota: string;
    }>>([]);
    const [showCotForm, setShowCotForm] = React.useState(false);
    const [cotForm, setCotForm] = React.useState({ companyId: '', plan: '' as string, meses: 1, descTipo: 'pct' as 'pct'|'val', descValor: 0, nota: '' });

    const clientesActivos = companies.filter(c => c.subscription_plan !== 'TRIAL');
    const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

    const calcPrecio = (company: any, mesesExtra = 1) => {
      const base = (PLAN_PRICES[company.subscription_plan] || 62000) * mesesExtra;
      const d = descuentos[company.id];
      if (!d || d.valor <= 0) return base;
      if (d.tipo === 'pct') return Math.round(base * (1 - d.valor / 100));
      return Math.max(base - d.valor, 0);
    };

    const setDescuento = (companyId: string, field: string, value: any) => {
      setDescuentos(prev => ({
        ...prev,
        [companyId]: { tipo: 'pct', valor: 0, meses: 1, ...(prev[companyId] || {}), [field]: value },
      }));
    };

    const togglePagado = (id: string) => {
      setPagados(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
    };

    const facturar = async (company: any) => {
      if (!facturaConfig.factus_client_id || !facturaConfig.factus_username) {
        toast.error('Configura tus credenciales de Factus primero'); setShowConfig(true); return;
      }
      const precio = PLAN_PRICES[company.subscription_plan] || 62000;
      if (precio === 0) { toast.error('Plan sin precio configurado'); return; }

      setFacturando(company.id);
      try {
        // 1. Obtener token OAuth de Factus
        const base = facturaConfig.factus_env === 'production'
          ? 'https://api.factus.com.co'
          : 'https://api-sandbox.factus.com.co';

        const tokenRes = await fetch(`${base}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: facturaConfig.factus_client_id,
            client_secret: facturaConfig.factus_client_secret,
            username: facturaConfig.factus_username,
            password: facturaConfig.factus_password,
          }),
        });
        if (!tokenRes.ok) { toast.error('Error al obtener token de Factus'); return; }
        const { access_token } = await tokenRes.json();

        // 2. Obtener rango de numeración activo
        const rangosRes = await fetch(`${base}/v1/numbering-ranges?state=1`, {
          headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' },
        });
        const rangosData = await rangosRes.json();
        const rangos = rangosData.data || rangosData || [];
        const rango = rangos[0];
        if (!rango?.id) { toast.error('No hay rango de numeración activo en Factus'); return; }

        // 3. Armar payload de factura
        const tieneNit = company.nit && company.nit.trim() !== '';
        const docNum = tieneNit
          ? company.nit.replace(/[^0-9]/g, '')
          : '222222222222';

        const payload = {
          document: '01',
          numbering_range_id: rango.id,
          reference_code: `PM-${company.id.slice(0,8).toUpperCase()}`,
          observation: `Mensualidad POSmaster - ${periodoLabel}`,
          payment_form: '1',
          payment_due_date: new Date().toISOString().split('T')[0],
          payment_method_code: '10',
          customer: {
            identification: docNum,
            dv: null,
            company: tieneNit ? company.name : null,
            trade_name: tieneNit ? company.name : null,
            names: company.name,
            address: company.address || 'Colombia',
            email: company.email || 'sin-email@posmaster.org',
            mobile: company.phone || null,
            phone: company.phone || null,
            type_document_identification_id: tieneNit ? 31 : 13,
            type_organization_id: tieneNit ? 1 : 2,
            municipality_id: 149,
            type_regime_id: 2,
            type_liability_id: 117,
            type_currency_id: 35,
          },
          items: [{
            code_reference: `POSMASTER-${company.subscription_plan}`,
            name: `Suscripción POSmaster Plan ${company.subscription_plan} - ${periodoLabel}`,
            quantity: 1,
            discount_rate: '0.00',
            price: (precio / 1.19).toFixed(6),
            tax_rate: '19.00',
            unit_measure_id: 70,
            standard_code_id: 1,
            is_excluded: 0,
            taxes: [{ tax_rate_code: '19.00' }],
          }],
          withholding_taxes: [],
        };

        // 4. Enviar a Factus
        const factRes = await fetch(`${base}/v1/bills/validate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const factData = await factRes.json();

        if (!factRes.ok || factData.status === 'error') {
          const errMsg = factData.message || factData.errors?.join(', ') || `Error ${factRes.status}`;
          toast.error(`Error Factus: ${errMsg}`); return;
        }

        const bill = factData.data?.bill || factData.bill || factData.data || {};
        const cufe = bill.cufe || bill.uuid || '';
        const pdf_url = bill.public_url || bill.pdf_url || '';
        const numero = bill.number || bill.bill_number || '';

        setResultados(prev => ({ ...prev, [company.id]: { cufe, pdf_url, numero } }));
        toast.success(`✅ Factura ${numero} emitida para ${company.name}`);

        // 5. Registrar en audit_logs
        await supabase.from('audit_logs').insert({
          company_id: company.id,
          action: 'FACTURA_MENSUALIDAD',
          table_name: 'billing',
          new_data: { cufe, pdf_url, numero, periodo: periodoLabel, plan: company.subscription_plan, valor: precio },
        }).catch(() => {});

      } catch (err: any) {
        toast.error('Error de conexión: ' + err.message);
      } finally {
        setFacturando(null);
      }
    };

    const facturarTodos = async () => {
      const pendientes = clientesActivos.filter(c => pagados.has(c.id) && !resultados[c.id]);
      if (pendientes.length === 0) { toast.error('Marca clientes como pagados primero'); return; }
      for (const c of pendientes) await facturar(c);
    };

    const cargarHistorial = React.useCallback(async () => {
      setLoadingHistorial(true);
      const { data } = await supabase.from('audit_logs')
        .select('*').eq('action', 'FACTURA_MENSUALIDAD')
        .order('created_at', { ascending: false }).limit(50);
      setHistorial(data || []);
      setLoadingHistorial(false);
    }, []);

    React.useEffect(() => { if (subPanel === 'historial') cargarHistorial(); }, [subPanel, cargarHistorial]);

    const borrarHistorial = async (id: string) => {
      if (!window.confirm('¿Borrar este registro del historial?')) return;
      await supabase.from('audit_logs').delete().eq('id', id);
      cargarHistorial();
      toast.success('Registro eliminado');
    };

    const generarCotizacion = (cot: typeof cotizaciones[0]) => {
      const planCot = (cot as any).plan || cot.company.subscription_plan;
      const base = PLAN_PRICES[planCot] || 62000;
      const total = cot.meses * base;
      const descAmt = cot.descTipo === 'pct' ? Math.round(total * cot.descValor / 100) : cot.descValor;
      const totalFinal = Math.max(total - descAmt, 0);
      const iva = Math.round(totalFinal / 1.19 * 0.19);
      const subtotal = totalFinal - iva;
      const hoy = new Date().toLocaleDateString('es-CO');
      const vence = new Date(Date.now() + 15 * 86400000).toLocaleDateString('es-CO');
      const texto = `*COTIZACIÓN POSMASTER*\n━━━━━━━━━━━━━━━━━━━\n📋 *Cliente:* ${cot.company.name}\n📅 *Fecha:* ${hoy}\n⏰ *Válida hasta:* ${vence}\n━━━━━━━━━━━━━━━━━━━\n📦 *Plan:* ${planCot}\n🗓 *Meses:* ${cot.meses}\n💵 *Valor mensual:* ${fmt(base)}\n${descAmt > 0 ? `🏷 *Descuento:* -${fmt(descAmt)}\n` : ''}━━━━━━━━━━━━━━━━━━━\n💰 *Subtotal:* ${fmt(subtotal)}\n🧾 *IVA 19%:* ${fmt(iva)}\n✅ *TOTAL:* ${fmt(totalFinal)}\n━━━━━━━━━━━━━━━━━━━\n${cot.nota ? `📝 ${cot.nota}\n━━━━━━━━━━━━━━━━━━━\n` : ''}🌐 posmaster.org`;
      return { texto, totalFinal };
    };

    const enviarCotWA = (cot: typeof cotizaciones[0]) => {
      const { texto } = generarCotizacion(cot);
      const phone = cot.company.phone?.replace(/\D/g,'') || WHATSAPP;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(texto)}`, '_blank');
    };

    const enviarCotEmail = (cot: typeof cotizaciones[0]) => {
      const { texto, totalFinal } = generarCotizacion(cot);
      const subject = encodeURIComponent(`Cotización POSmaster - Plan ${cot.company.subscription_plan}`);
      const body = encodeURIComponent(texto.replace(/\*/g, ''));
      window.open(`mailto:${cot.company.email}?subject=${subject}&body=${body}`, '_blank');
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Clientes activos', value: clientesActivos.length, color: '#3b82f6' },
            { label: 'Marcados pagados', value: pagados.size, color: '#10b981' },
            { label: 'Facturados hoy', value: Object.keys(resultados).length, color: '#8b5cf6' },
            { label: 'Total a facturar', value: fmt(clientesActivos.filter(c => pagados.has(c.id)).reduce((s, c) => s + calcPrecio(c), 0)), color: '#f59e0b', isText: true },
          ].map(({ label, value, color, isText }) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' as const }}>{label}</p>
              <p style={{ margin: '6px 0 0', fontSize: isText ? 16 : 28, fontWeight: 800, color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Sub-navegación */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 10, width: 'fit-content' }}>
          {([['cobros','💳 Cobros'],['cotizaciones','📋 Cotizaciones'],['historial','🧾 Historial']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSubPanel(k)}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: subPanel === k ? '#fff' : 'transparent',
                color: subPanel === k ? '#0f172a' : '#64748b',
                boxShadow: subPanel === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{label}</button>
          ))}
        </div>

        {/* Config Factus — siempre visible */}
        <div>
          <button onClick={() => setShowConfig(!showConfig)} style={{ ...btn('gray'), fontSize: 12 }}>
            ⚙️ {showConfig ? 'Ocultar' : 'Configurar'} credenciales Factus · Ambiente: {facturaConfig.factus_env}
          </button>
          {showConfig && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { k: 'factus_client_id', label: 'Client ID' },
                  { k: 'factus_client_secret', label: 'Client Secret' },
                  { k: 'factus_username', label: 'Email Factus' },
                  { k: 'factus_password', label: 'Contraseña Factus' },
                  { k: 'mi_nit', label: 'Tu Cédula / NIT' },
                ].map(({ k, label }) => (
                  <div key={k}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{label}</label>
                    <input type={k.includes('secret') || k.includes('password') ? 'password' : 'text'}
                      value={(facturaConfig as any)[k]}
                      onChange={e => setFacturaConfig(p => ({ ...p, [k]: e.target.value }))}
                      style={input()} placeholder={label} />
                  </div>
                ))}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Ambiente</label>
                  <select value={facturaConfig.factus_env} onChange={e => setFacturaConfig(p => ({ ...p, factus_env: e.target.value }))} style={input()}>
                    <option value="sandbox">Sandbox (pruebas)</option>
                    <option value="production">Producción (real)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SUBPANEL: COBROS ──────────────────────────────────────────── */}
        {subPanel === 'cobros' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={facturarTodos} style={{ ...btn('purple'), padding: '10px 20px', fontSize: 13 }}>
                <Send size={14} /> Facturar todos los marcados ({pagados.size})
              </button>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Periodo: <strong style={{ color: '#0f172a' }}>{periodoLabel}</strong></span>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Cliente','Plan','Meses','Descuento','Valor final','¿Pagó?','Factura','Acción'].map(h => <th key={h} style={hdr}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {clientesActivos.length === 0 ? (
                    <tr><td colSpan={8} style={{ ...col, textAlign: 'center', padding: 40, color: '#94a3b8' }}>No hay clientes activos</td></tr>
                  ) : clientesActivos.map(c => {
                    const d = descuentos[c.id] || { tipo: 'pct', valor: 0, meses: 1 };
                    const precioFinal = calcPrecio(c, d.meses);
                    const precioBase = (PLAN_PRICES[c.subscription_plan] || 0) * d.meses;
                    const marcado = pagados.has(c.id);
                    const resultado = resultados[c.id];
                    const estFacturando = facturando === c.id;
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: marcado ? '#f0fdf4' : '' }}
                        onMouseEnter={e => { if (!marcado) e.currentTarget.style.background = '#fafafa'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = marcado ? '#f0fdf4' : ''; }}>
                        <td style={col}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{c.name}</p>
                          <p style={{ margin: '1px 0 0', fontSize: 11, color: '#94a3b8' }}>{c.nit || 'Sin NIT'} · {c.email || '—'}</p>
                        </td>
                        <td style={col}>
                          <span style={{ ...pill('gray'), background: PLAN_COLOR[c.subscription_plan] + '20', color: PLAN_COLOR[c.subscription_plan] }}>{c.subscription_plan}</span>
                        </td>
                        {/* Meses */}
                        <td style={col}>
                          <input type="number" min={1} max={12} value={d.meses}
                            onChange={e => setDescuento(c.id, 'meses', parseInt(e.target.value) || 1)}
                            style={{ ...input(), width: 50, textAlign: 'center', padding: '4px 6px' }} />
                        </td>
                        {/* Descuento */}
                        <td style={col}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <select value={d.tipo} onChange={e => setDescuento(c.id, 'tipo', e.target.value)}
                              style={{ ...input(), width: 55, padding: '4px 4px', fontSize: 11 }}>
                              <option value="pct">%</option>
                              <option value="val">$</option>
                            </select>
                            <input type="number" min={0} value={d.valor}
                              onChange={e => setDescuento(c.id, 'valor', parseFloat(e.target.value) || 0)}
                              style={{ ...input(), width: 70, padding: '4px 6px' }}
                              placeholder={d.tipo === 'pct' ? '0%' : '$0'} />
                          </div>
                          {d.valor > 0 && (
                            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#ef4444' }}>-{fmt(precioBase - precioFinal)}</p>
                          )}
                        </td>
                        {/* Valor final */}
                        <td style={{ ...col, fontWeight: 800, color: '#0f172a' }}>
                          {fmt(precioFinal)}
                          {d.valor > 0 && <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt(precioBase)}</p>}
                        </td>
                        {/* Pagó */}
                        <td style={col}>
                          <button onClick={() => togglePagado(c.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                              background: marcado ? '#dcfce7' : '#f1f5f9', color: marcado ? '#16a34a' : '#64748b' }}>
                            {marcado ? <CheckCircle size={12} /> : <Clock size={12} />}
                            {marcado ? 'Pagó ✓' : 'Pendiente'}
                          </button>
                        </td>
                        {/* Factura emitida */}
                        <td style={col}>
                          {resultado ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>✅ #{resultado.numero}</span>
                              <span style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>{fmt(resultado.valor)}</span>
                              {resultado.pdf_url && (
                                <a href={resultado.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none' }}>📄 PDF</a>
                              )}
                              <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{resultado.cufe.slice(0,16)}...</span>
                            </div>
                          ) : <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>}
                        </td>
                        {/* Acciones */}
                        <td style={col}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                            {marcado && !resultado && (
                              <button onClick={() => facturar(c)} disabled={!!estFacturando}
                                style={{ ...btn('purple'), opacity: estFacturando ? 0.6 : 1 }}>
                                {estFacturando ? '...' : <><Send size={11} /> Facturar</>}
                              </button>
                            )}
                            {resultado?.pdf_url && (
                              <a href={`https://wa.me/${c.phone?.replace(/\D/g,'') || WHATSAPP}?text=Hola ${c.name} 👋 Le enviamos la factura electrónica de su suscripción POSmaster (${periodoLabel}): ${resultado.pdf_url}`}
                                target="_blank" rel="noreferrer" style={{ ...btn('green'), textDecoration: 'none' }}>💬</a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SUBPANEL: COTIZACIONES ────────────────────────────────────── */}
        {subPanel === 'cotizaciones' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => setShowCotForm(!showCotForm)} style={{ ...btn('blue'), padding: '10px 20px', fontSize: 13, width: 'fit-content' }}>
              <Plus size={14} /> Nueva cotización
            </button>

            {showCotForm && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 13 }}>Nueva cotización</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Cliente</label>
                    <select value={cotForm.companyId} onChange={e => {
                      const cmp = companies.find(c => c.id === e.target.value);
                      setCotForm(p => ({ ...p, companyId: e.target.value, plan: cmp?.subscription_plan || 'BASIC' }));
                    }} style={input()}>
                      <option value="">Seleccionar cliente...</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Plan a cotizar</label>
                    <select value={cotForm.plan || 'BASIC'} onChange={e => setCotForm(p => ({ ...p, plan: e.target.value }))} style={input()}>
                      {['BASIC','PRO','ENTERPRISE'].map(pl => (
                        <option key={pl} value={pl}>{pl} — {fmt(PLAN_PRICES[pl] || 0)}/mes</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Meses</label>
                    <input type="number" min={1} max={24} value={cotForm.meses}
                      onChange={e => setCotForm(p => ({ ...p, meses: parseInt(e.target.value) || 1 }))} style={input()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Tipo descuento</label>
                    <select value={cotForm.descTipo} onChange={e => setCotForm(p => ({ ...p, descTipo: e.target.value as 'pct'|'val' }))} style={input()}>
                      <option value="pct">Porcentaje (%)</option>
                      <option value="val">Valor fijo ($)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                      {cotForm.descTipo === 'pct' ? 'Descuento (%)' : 'Descuento ($)'}
                    </label>
                    <input type="number" min={0} value={cotForm.descValor}
                      onChange={e => setCotForm(p => ({ ...p, descValor: parseFloat(e.target.value) || 0 }))} style={input()} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Nota adicional (opcional)</label>
                    <input type="text" value={cotForm.nota} placeholder="Ej: 6 meses por confianza, incluye soporte prioritario"
                      onChange={e => setCotForm(p => ({ ...p, nota: e.target.value }))} style={input()} />
                  </div>
                </div>
                {cotForm.companyId && (() => {
                  const cmp = companies.find(c => c.id === cotForm.companyId);
                  if (!cmp) return null;
                  const planCot = cotForm.plan || cmp.subscription_plan;
                  const base = PLAN_PRICES[planCot] || 0;
                  const total = base * cotForm.meses;
                  const desc = cotForm.descTipo === 'pct' ? Math.round(total * cotForm.descValor / 100) : cotForm.descValor;
                  const final = Math.max(total - desc, 0);
                  return (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, marginTop: 10 }}>
                      <p style={{ margin: 0, fontSize: 12, color: '#1e40af', fontWeight: 700 }}>
                        Preview: {cmp.name} · Plan {planCot} · {cotForm.meses} mes(es) · {fmt(base)}/mes
                        {desc > 0 ? ` → -${fmt(desc)} descuento` : ''} = <strong>{fmt(final)}</strong>
                      </p>
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => {
                    if (!cotForm.companyId) { toast.error('Selecciona un cliente'); return; }
                    const cmp = companies.find(c => c.id === cotForm.companyId);
                    if (!cmp) return;
                    const planFinal = cotForm.plan || cmp.subscription_plan;
                    setCotizaciones(prev => [...prev, { id: Date.now().toString(), company: { ...cmp, subscription_plan: planFinal }, ...cotForm, plan: planFinal }]);
                    setShowCotForm(false);
                    setCotForm({ companyId: '', plan: '', meses: 1, descTipo: 'pct', descValor: 0, nota: '' });
                    toast.success('Cotización creada');
                  }} style={{ ...btn('blue') }}><CheckCircle size={13} /> Crear cotización</button>
                  <button onClick={() => setShowCotForm(false)} style={btn('gray')}>Cancelar</button>
                </div>
              </div>
            )}

            {cotizaciones.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p>
                <p style={{ margin: 0, fontWeight: 600 }}>No hay cotizaciones</p>
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>Crea una para enviarla por WhatsApp o email</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cotizaciones.map(cot => {
                  const base = PLAN_PRICES[cot.company.subscription_plan] || 0;
                  const total = base * cot.meses;
                  const desc = cot.descTipo === 'pct' ? Math.round(total * cot.descValor / 100) : cot.descValor;
                  const final = Math.max(total - desc, 0);
                  return (
                    <div key={cot.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{cot.company.name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                          Plan {cot.company.subscription_plan} · {cot.meses} mes(es)
                          {desc > 0 ? ` · Descuento ${cot.descTipo === 'pct' ? cot.descValor + '%' : fmt(desc)}` : ''}
                          {cot.nota ? ` · ${cot.nota}` : ''}
                        </p>
                        <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{fmt(final)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => enviarCotWA(cot)} style={{ ...btn('green') }}>💬 WhatsApp</button>
                        <button onClick={() => enviarCotEmail(cot)} style={{ ...btn('blue') }}>✉️ Email</button>
                        <button onClick={() => setCotizaciones(prev => prev.filter(x => x.id !== cot.id))} style={btn('red')}><Trash2 size={11} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SUBPANEL: HISTORIAL ───────────────────────────────────────── */}
        {subPanel === 'historial' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Últimas 50 facturas emitidas desde Cobros</p>
              <button onClick={cargarHistorial} style={btn('gray')}><RefreshCw size={12} /> Actualizar</button>
            </div>
            {loadingHistorial ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Cargando...</div>
            ) : historial.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>🧾</p>
                <p style={{ margin: 0, fontWeight: 600 }}>No hay facturas emitidas aún</p>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['#Factura','Cliente','Plan','Periodo','Valor','CUFE','PDF','Fecha','Borrar'].map(h => <th key={h} style={hdr}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {historial.map(h => {
                      const d = h.new_data || {};
                      const cmp = companies.find(c => c.id === h.company_id);
                      return (
                        <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <td style={{ ...col, fontWeight: 700, color: '#7c3aed' }}>#{d.numero || '—'}</td>
                          <td style={col}>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{d.cliente || cmp?.name || '—'}</p>
                            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{cmp?.nit || cmp?.email || ''}</p>
                          </td>
                          <td style={col}>
                            <span style={{ ...pill('gray'), background: PLAN_COLOR[d.plan] + '20', color: PLAN_COLOR[d.plan] }}>{d.plan}</span>
                          </td>
                          <td style={{ ...col, fontSize: 12 }}>{d.periodo || '—'}</td>
                          <td style={{ ...col, fontWeight: 700 }}>{d.valor ? fmt(d.valor) : '—'}</td>
                          <td style={{ ...col, fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {d.cufe ? `${d.cufe.slice(0,20)}...` : '—'}
                          </td>
                          <td style={col}>
                            {d.pdf_url ? (
                              <a href={d.pdf_url} target="_blank" rel="noreferrer" style={{ ...btn('blue'), textDecoration: 'none', fontSize: 11 }}>📄 PDF</a>
                            ) : '—'}
                          </td>
                          <td style={{ ...col, fontSize: 11, color: '#64748b' }}>
                            {h.created_at ? new Date(h.created_at).toLocaleDateString('es-CO') : '—'}
                          </td>
                          <td style={col}>
                            <button onClick={() => borrarHistorial(h.id)} style={btn('red')} title="Borrar (solo pruebas)">
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    );
  };

  // ── SETTINGS PANEL ─────────────────────────────────────────────────────────
  const SettingsPanel = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Precios */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8 }}><DollarSign size={16} /> Precios de Planes</h3>
        {(['basic','pro','enterprise'] as const).map(plan => (
          <div key={plan} style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLAN_COLOR[plan.toUpperCase()], display: 'inline-block' }} />
              Plan {plan}
            </p>
            <input value={pricingData[`${plan}_price`] || ''} onChange={e => setPricingData(p => ({ ...p, [`${plan}_price`]: e.target.value }))} placeholder="$65.000" style={input({ marginBottom: 6 })} />
            <input value={pricingData[`${plan}_desc`] || ''} onChange={e => setPricingData(p => ({ ...p, [`${plan}_desc`]: e.target.value }))} placeholder="Descripción" style={input({ marginBottom: 6 })} />
            <textarea value={(pricingData[`${plan}_features`] || '').split(',').join('\n')} onChange={e => setPricingData(p => ({ ...p, [`${plan}_features`]: e.target.value.split('\n').join(',') }))} placeholder="Característica 1&#10;Característica 2" rows={3} style={{ ...input(), resize: 'vertical' as const }} />
          </div>
        ))}
        <button onClick={savePricing} disabled={savingPricing} style={{ width: '100%', padding: '11px 0', background: savingPricing ? '#94a3b8' : '#0f172a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
          {savingPricing ? 'Guardando...' : '💾 Guardar precios'}
        </button>
      </div>

      {/* Payment links */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8 }}><Link2 size={16} /> Links de Pago Bold</h3>
        {[
          { key: 'bold_basic_url', label: 'Plan Basic' },
          { key: 'bold_pro_url',   label: 'Plan Pro' },
          { key: 'bold_enterprise_url', label: 'Plan Enterprise' },
        ].map(({ key, label }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', margin: '0 0 5px' }}>{label}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="url" value={paymentLinks[key] || ''} onChange={e => setPaymentLinks(p => ({ ...p, [key]: e.target.value }))} placeholder="https://cobro.bold.co/..." style={{ ...input(), flex: 1 }} />
              {paymentLinks[key] && <a href={paymentLinks[key]} target="_blank" rel="noreferrer" style={{ ...btn('gray'), textDecoration: 'none', padding: '9px 12px' }}>↗</a>}
            </div>
          </div>
        ))}
        <button onClick={saveLinks} disabled={savingLinks} style={{ width: '100%', padding: '11px 0', background: savingLinks ? '#94a3b8' : '#0f172a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
          {savingLinks ? 'Guardando...' : '💾 Guardar links'}
        </button>
      </div>
    </div>
  );

  // ── MODALS ─────────────────────────────────────────────────────────────────
  const labelSt: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 5 };
  const ModalWrapper: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; maxW?: number }> = ({ title, onClose, children, maxW = 540 }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: maxW, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <h3 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{title}</h3>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 14, color: '#64748b' }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'DM Sans','Segoe UI',sans-serif", background: '#f8fafc' }}>

      {/* SIDEBAR */}
      <aside style={{ width: 220, background: '#0f172a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: '#2563eb', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff' }}>PM</div>
            <div>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: '#f1f5f9' }}>POSmaster</p>
              <p style={{ margin: 0, fontSize: 10, color: '#475569' }}>Superadmin</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAVITEMS.map(item => {
            const active = panel === item.key;
            return (
              <button key={item.key} onClick={() => setPanel(item.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' as const, background: active ? 'rgba(255,255,255,0.12)' : 'transparent', color: active ? '#fff' : '#94a3b8', fontWeight: active ? 700 : 400, fontSize: 14, transition: 'all 0.15s' }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span style={{ background: active ? 'rgba(255,255,255,0.25)' : '#1e293b', color: active ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }}>{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={handleRefreshAll} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', width: '100%', background: 'transparent', color: '#64748b', fontSize: 13 }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button onClick={() => { supabase.auth.signOut(); onExit(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', width: '100%', background: 'transparent', color: '#ef4444', fontSize: 13 }}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 18, color: '#0f172a' }}>
              {panel === 'overview' ? 'Dashboard' : panel === 'companies' ? `Clientes (${filtered.length})` : panel === 'contracts' ? `Contratos (${contracts.length})` : panel === 'billing' ? 'Cobros y Facturación' : panel === 'features' ? 'Features del sistema' : 'Configuración de plataforma'}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={pill('blue')}><Zap size={10} /> {active} activos</span>
            <span style={pill('red')}><AlertCircle size={10} /> {pastDue} vencidos</span>
          </div>
        </div>

        {/* Panel content */}
        <div style={{ padding: 28 }}>
          {panel === 'overview'  && <OverviewPanel />}
          {panel === 'companies' && <CompaniesPanel />}
          {panel === 'billing'   && <BillingPanel />}
          {panel === 'contracts' && <ContractsPanel />}
          {panel === 'features'  && <FeaturesPanel />}
          {panel === 'settings'  && <SettingsPanel />}
        </div>
      </main>

      {/* ── MODALS ── */}

      {/* Crear negocio */}
      {showCreate && (
        <ModalWrapper title="Crear Nuevo Negocio" onClose={() => setShowCreate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[{ k: 'name', l: 'Nombre *' }, { k: 'nit', l: 'NIT *' }, { k: 'email', l: 'Email' }, { k: 'phone', l: 'Teléfono' }].map(({ k, l }) => (
              <div key={k}><label style={labelSt}>{l}</label><input value={(newCo as any)[k]} onChange={f(k)} style={input()} /></div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelSt}>Inicio</label><input type="date" value={newCo.subscription_start_date} onChange={f('subscription_start_date')} style={input()} /></div>
              <div><label style={labelSt}>Vencimiento</label><input type="date" value={newCo.subscription_end_date} onChange={f('subscription_end_date')} style={input()} /></div>
            </div>
            <div><label style={labelSt}>Plan</label>
              <select value={newCo.plan} onChange={f('plan')} style={input()}>
                {['TRIAL','BASIC','PRO','ENTERPRISE'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', margin: '0 0 10px', textTransform: 'uppercase' as const }}>Credenciales Admin</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><label style={labelSt}>Email Admin *</label><input type="email" value={newCo.adminEmail} onChange={f('adminEmail')} style={input()} /></div>
                <div><label style={labelSt}>Contraseña *</label><input type="password" value={newCo.adminPassword} onChange={f('adminPassword')} style={input()} /></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '11px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#64748b' }}>Cancelar</button>
              <button onClick={handleCreate} disabled={creating} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: creating ? '#94a3b8' : '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                {creating ? 'Creando...' : 'Crear Negocio'}
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Editar negocio */}
      {showEdit && selectedCompany && (
        <ModalWrapper title={`Editar: ${selectedCompany.name}`} onClose={() => setShowEdit(false)} maxW={640}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[{ k: 'name', l: 'Nombre' }, { k: 'nit', l: 'NIT' }, { k: 'email', l: 'Email' }, { k: 'phone', l: 'Teléfono' }].map(({ k, l }) => (
              <div key={k}><label style={labelSt}>{l}</label><input value={editForm[k] || ''} onChange={fe(k)} style={input()} /></div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelSt}>Inicio</label><input type="date" value={editForm.subscription_start_date || ''} onChange={fe('subscription_start_date')} style={input()} /></div>
              <div><label style={labelSt}>Vencimiento</label><input type="date" value={editForm.subscription_end_date || ''} onChange={fe('subscription_end_date')} style={input()} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelSt}>Plan</label>
                <select value={editForm.plan || 'BASIC'} onChange={fe('plan')} style={input()}>
                  {['TRIAL','BASIC','PRO','ENTERPRISE'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div><label style={labelSt}>Estado</label>
                <select value={editForm.subscription_status || 'ACTIVE'} onChange={fe('subscription_status')} style={input()}>
                  {['ACTIVE','INACTIVE','PENDING','PAST_DUE'].map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label || s}</option>)}
                </select>
              </div>
            </div>

            {/* Show in landing toggle */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Mostrar en página de inicio</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>Aparece en la sección "Negocios que confían en nosotros"</p>
                </div>
                <button type="button" onClick={() => setEditForm((p: any) => ({ ...p, show_in_landing: !p.show_in_landing }))}
                  style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: editForm.show_in_landing ? '#22c55e' : '#e2e8f0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: editForm.show_in_landing ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
              </div>
            </div>

            {/* Feature flags */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Features habilitadas</p>
                <button type="button" onClick={() => setEditForm((p: any) => ({ ...p, feature_flags: getDefaultFlags(p.plan) }))}
                  style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Restaurar por plan
                </button>
              </div>
              {(() => {
                const cats = [...new Set(FEATURE_DEFS.map(f => f.cat))];
                const flags = editForm.feature_flags && Object.keys(editForm.feature_flags).length > 0 ? editForm.feature_flags : getDefaultFlags(editForm.plan);
                return cats.map(cat => (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, margin: '0 0 6px' }}>{cat}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                      {FEATURE_DEFS.filter(fd => fd.cat === cat).map(feat => {
                        const isOn = flags[feat.id] !== undefined ? flags[feat.id] : feat.defaultPlans.includes(editForm.plan);
                        return (
                          <button key={feat.id} type="button"
                            onClick={() => setEditForm((p: any) => ({ ...p, feature_flags: { ...flags, [feat.id]: !isOn } }))}
                            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', borderRadius: 7, cursor: 'pointer', border: isOn ? '1.5px solid #86efac' : '1.5px solid #e2e8f0', background: isOn ? '#f0fdf4' : '#f8fafc', color: isOn ? '#15803d' : '#94a3b8', fontSize: 11, fontWeight: 600, textAlign: 'left' as const }}>
                            <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: isOn ? '#22c55e' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isOn && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>}
                            </div>
                            {feat.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => setShowEdit(false)} style={{ flex: 1, padding: '11px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#64748b' }}>Cancelar</button>
              <button onClick={handleEdit} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Guardar cambios</button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Eliminar */}
      {showDelete && selectedCompany && (
        <ModalWrapper title="⚠️ Eliminar negocio" onClose={() => setShowDelete(false)} maxW={420}>
          <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 16, margin: '0 0 8px' }}>{selectedCompany.name}</p>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 24px' }}>Se eliminarán todos sus datos. Esta acción no se puede deshacer.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowDelete(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>Cancelar</button>
            <button onClick={handleDelete} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: 10, background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Eliminar definitivamente</button>
          </div>
        </ModalWrapper>
      )}

      {/* Confirmar pago */}
      {showConfirmPayment && selectedCompany && (
        <ModalWrapper title="💰 Confirmar Pago" onClose={() => setShowConfirmPayment(false)} maxW={420}>
          <p style={{ fontWeight: 700, color: '#0f172a', fontSize: 16, margin: '0 0 16px' }}>{selectedCompany.name}</p>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <p style={{ color: '#15803d', fontSize: 13, fontWeight: 600, margin: 0 }}>Al confirmar:</p>
            <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 0' }}>• Estado → Activo · Inicio: hoy · Vencimiento: +30 días</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowConfirmPayment(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>Cancelar</button>
            <button onClick={handleConfirmPayment} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: 10, background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>✅ Confirmar pago</button>
          </div>
        </ModalWrapper>
      )}

      {/* Logs */}
      {showLogs && selectedCompany && (
        <ModalWrapper title={`Actividad: ${selectedCompany.name}`} onClose={() => setShowLogs(false)} maxW={600}>
          {logs.length === 0 ? <p style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Sin actividad registrada</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Tipo','Detalle','Estado','Fecha'].map(h => <th key={h} style={hdr}>{h}</th>)}
              </tr></thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={col}><span style={pill(log.type === 'Factura' ? 'blue' : 'purple')}>{log.type}</span></td>
                    <td style={{ ...col, color: '#475569' }}>{log.detail}</td>
                    <td style={{ ...col, color: '#64748b' }}>{log.status}</td>
                    <td style={{ ...col, color: '#94a3b8' }}>{new Date(log.date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ModalWrapper>
      )}

      {/* User management */}
      {showUserMgmt && userMgmtCompany && (
        <UserMgmtModal company={userMgmtCompany} onClose={() => { setShowUserMgmt(false); setUserMgmtCompany(null); }} />
      )}

    </div>
  );

  // This is needed due to the async load being used in button
  function handleRefreshAll() { load(); }
};

export default SuperAdminDashboard;