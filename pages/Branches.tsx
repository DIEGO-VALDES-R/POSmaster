import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { toast } from 'react-hot-toast';
import {
  Users, Plus, Edit2, Trash2, X, Check, Lock, Eye, EyeOff,
  Building2, ChevronDown, ChevronRight, Shield, UserCheck, UserX, Copy,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BranchRecord { id: string; name: string; nit: string; email: string; phone: string; address: string; subscription_status: string; config: any; tipo: string; }
interface TeamMember   { id: string; full_name: string; email: string; role: string; custom_role: string | null; permissions: Record<string, boolean>; branch_id: string | null; is_active: boolean; pin_hash: string | null; }
interface Invitation   { id: string; email: string; custom_role: string; branch_id: string | null; status: string; expires_at: string; token: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const BUSINESS_TYPE_LABELS: Record<string, string> = {
  general:          'Tienda General',
  tienda_tecnologia:'Tecnología / Celulares',
  restaurante:      'Restaurante / Cafetería',
  ropa:             'Ropa / Calzado',
  zapateria:        'Zapatería / Marroquinería',
  ferreteria:       'Ferretería / Construcción',
  farmacia:         'Farmacia / Droguería',
  supermercado:     'Supermercado / Abarrotes',
  salon:            'Salón de Belleza / Spa',
  odontologia:      'Consultorio Odontológico',
  veterinaria:      'Clínica Veterinaria',
  lavadero:         'Lavadero de Vehículos',
  optica:           'Óptica / Optometría',
  joyeria:          'Joyería / Relojería',
  papeleria:        'Papelería / Miscelánea',
  gym:              'Gimnasio / Fitness',
  peluqueria:       'Peluquería / Barbería',
  panaderia:        'Panadería / Pastelería',
  otro:             'Otro Negocio',
};

const ROLES_DEFAULT = [
  { id:'cajero',     label:'Cajero',        icon:'🧾', defaultPerms:{ can_sell:true,  can_refund:false, can_view_reports:false, can_manage_inventory:false, can_manage_team:false, can_open_cash:true,  can_view_repairs:false, can_delete_invoices:false } },
  { id:'vendedor',   label:'Vendedor',       icon:'🛍️', defaultPerms:{ can_sell:true,  can_refund:false, can_view_reports:false, can_manage_inventory:false, can_manage_team:false, can_open_cash:false, can_view_repairs:false, can_delete_invoices:false } },
  { id:'supervisor', label:'Supervisor',     icon:'👁️', defaultPerms:{ can_sell:true,  can_refund:true,  can_view_reports:true,  can_manage_inventory:true,  can_manage_team:false, can_open_cash:true,  can_view_repairs:true,  can_delete_invoices:false } },
  { id:'bodeguero',  label:'Bodeguero',      icon:'📦', defaultPerms:{ can_sell:false, can_refund:false, can_view_reports:false, can_manage_inventory:true,  can_manage_team:false, can_open_cash:false, can_view_repairs:false, can_delete_invoices:false } },
  { id:'admin',      label:'Administrador',  icon:'⚙️', defaultPerms:{ can_sell:true,  can_refund:true,  can_view_reports:true,  can_manage_inventory:true,  can_manage_team:true,  can_open_cash:true,  can_view_repairs:true,  can_delete_invoices:true  } },
];

const PERMISSION_LABELS: Record<string, string> = {
  can_sell:'🛒 Realizar ventas', can_refund:'↩️ Hacer devoluciones', can_view_reports:'📊 Ver reportes',
  can_manage_inventory:'📦 Gestionar inventario', can_manage_team:'👥 Gestionar equipo',
  can_open_cash:'💰 Abrir/cerrar caja', can_view_repairs:'🔧 Ver reparaciones', can_delete_invoices:'🗑️ Eliminar facturas',
};

const statusColors: Record<string, { bg:string; color:string; label:string }> = {
  ACTIVE:   { bg:'#dcfce7', color:'#16a34a', label:'Activo'    },
  INACTIVE: { bg:'#fee2e2', color:'#dc2626', label:'Inactivo'  },
  PENDING:  { bg:'#fef9c3', color:'#ca8a04', label:'Pendiente' },
  PAST_DUE: { bg:'#ffedd5', color:'#ea580c', label:'Vencido'   },
};

// ─── Owner auth gate ──────────────────────────────────────────────────────────
// Returns true if the current session matches the owner of rootCompanyId
async function verifyOwnerPassword(password: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return false;
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  return !error;
}

// ─── Main component ──────────────────────────────────────────────────────────
const Branches: React.FC = () => {
  const { company, companyId, isLoading: ctxLoading } = useDatabase();
  const isPro = ['PRO', 'MASTER', 'ENTERPRISE'].includes(company?.subscription_plan || '');
  const plan = (company as any)?.subscription_plan || 'BASIC';
  const MAX_BRANCHES = plan === 'ENTERPRISE' ? 999 : plan === 'PRO' || plan === 'MASTER' ? 2 : 0; // 2 adicionales = 3 total con sede principal

  const parentBusinessType = (company as any)?.config?.business_type
    || (Array.isArray((company as any)?.config?.business_types) ? (company as any).config.business_types[0] : null)
    || 'general';
  const parentTypeLabel = BUSINESS_TYPE_LABELS[parentBusinessType] || 'Negocio';

  // ── State ──────────────────────────────────────────────────────────────────
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading]   = useState(true);

  // Auth gate
  const [ownerUnlocked, setOwnerUnlocked] = useState(false);
  const [ownerPwd, setOwnerPwd]           = useState('');
  const [showPwd, setShowPwd]             = useState(false);
  const [authLoading, setAuthLoading]     = useState(false);
  const [authError, setAuthError]         = useState('');

  // Branch create/edit
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [form, setForm]             = useState({ name:'', nit:'', email:'', phone:'', adminEmail:'', adminPassword:'', business_type:'' });
  const [showEdit, setShowEdit]     = useState(false);
  const [selected, setSelected]     = useState<BranchRecord | null>(null);
  const [editForm, setEditForm]     = useState({ name:'', nit:'', email:'', phone:'', address:'', subscription_status:'ACTIVE', business_type:'general' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id:string; name:string }|null>(null);
  const [deleting, setDeleting]     = useState(false);

  // Team per branch
  const [expandedBranch, setExpandedBranch] = useState<string|null>(null);
  const [branchMembers, setBranchMembers]   = useState<Record<string, TeamMember[]>>({});
  const [branchBranches, setBranchBranches] = useState<Record<string, {id:string;name:string}[]>>({});
  const [branchInvites, setBranchInvites]   = useState<Record<string, Invitation[]>>({});
  const [memberLoading, setMemberLoading]   = useState<Record<string, boolean>>({});

  // Invite modal
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteForCid, setInviteForCid] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState('cajero');
  const [invitePerms, setInvitePerms] = useState<Record<string,boolean>>({});
  const [inviting, setInviting]       = useState(false);

  // Edit member modal
  const [editMember, setEditMember]   = useState<TeamMember|null>(null);
  const [editMemberCid, setEditMemberCid] = useState('');
  const [editRole, setEditRole]       = useState('');
  const [editPerms, setEditPerms]     = useState<Record<string,boolean>>({});
  const [savingMember, setSavingMember] = useState(false);
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<TeamMember|null>(null);
  const [deletingMember, setDeletingMember] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase.from('companies').select('*').eq('negocio_padre_id', companyId).order('created_at', { ascending: true });
    setBranches(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const loadBranchTeam = async (cid: string) => {
    setMemberLoading(p => ({ ...p, [cid]: true }));
    const [{ data: members }, { data: brs }, { data: invitations }] = await Promise.all([
      supabase.from('profiles').select('*').eq('company_id', cid).order('created_at'),
      supabase.from('branches').select('id, name').eq('company_id', cid).eq('is_active', true),
      supabase.from('user_invitations').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
    ]);
    setBranchMembers(p => ({ ...p, [cid]: (members || []) as any }));
    setBranchBranches(p => ({ ...p, [cid]: (brs || []) }));
    setBranchInvites(p => ({ ...p, [cid]: (invitations || []) as any }));
    setMemberLoading(p => ({ ...p, [cid]: false }));
  };

  // Also load team for the main company (sede principal)
  useEffect(() => {
    if (ownerUnlocked && companyId) loadBranchTeam(companyId);
  }, [ownerUnlocked, companyId]);

  // ── Owner auth ─────────────────────────────────────────────────────────────
  const handleUnlock = async () => {
    if (!ownerPwd) return;
    setAuthLoading(true); setAuthError('');
    const ok = await verifyOwnerPassword(ownerPwd);
    setAuthLoading(false);
    if (ok) { setOwnerUnlocked(true); setOwnerPwd(''); }
    else setAuthError('Contraseña incorrecta. Solo el propietario de la licencia puede gestionar empleados.');
  };

  // ── Branch CRUD ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (branches.length >= MAX_BRANCHES) { toast.error('Límite alcanzado: el plan PRO incluye 3 sedes en total (sede principal + 2 adicionales).'); return; }
    if (!form.name || !form.nit || !form.adminEmail || !form.adminPassword) { toast.error('Completa todos los campos obligatorios'); return; }
    setCreating(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: form.adminEmail, password: form.adminPassword, options: { data: { full_name: form.name } } });
      if (authError && !authError.message.includes('already registered')) throw authError;
      let userId = authData?.user?.id;
      if (!userId) {
        const { data: ep } = await supabase.from('profiles').select('id').eq('email', form.adminEmail).maybeSingle();
        userId = ep?.id;
      }
      if (!userId) throw new Error('No se pudo crear o encontrar el usuario administrador');
      const { data: newCompany, error: ce } = await supabase.from('companies').insert({
        name: form.name, nit: form.nit, email: form.email, phone: form.phone,
        subscription_plan:'BASIC', subscription_status:'ACTIVE', tipo:'sucursal', negocio_padre_id: companyId!,
        config: { tax_rate:(company as any)?.config?.tax_rate??19, currency_symbol:(company as any)?.config?.currency_symbol??'$', invoice_prefix:'POS', business_type: form.business_type||parentBusinessType, business_types:[form.business_type||parentBusinessType] }
      }).select().single();
      if (ce) throw ce;
      await supabase.from('profiles').upsert({ id:userId, company_id:newCompany.id, role:'ADMIN', full_name:form.name, email:form.adminEmail, is_active:true }, { onConflict:'id' });
      const { data: br } = await supabase.from('branches').insert({ company_id:newCompany.id, name:'Sede Principal', is_active:true }).select().single();
      if (br) await supabase.from('profiles').update({ branch_id:br.id }).eq('id', userId);
      toast.success(`Sucursal "${form.name}" creada`);
      setShowCreate(false);
      setForm({ name:'', nit:'', email:'', phone:'', adminEmail:'', adminPassword:'', business_type:'' });
      load();
    } catch (err: any) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const handleEdit = async () => {
    if (!selected) return;
    const updCfg = { ...(selected.config||{}), business_type:editForm.business_type, business_types:[editForm.business_type] };
    const { error } = await supabase.from('companies').update({ name:editForm.name, nit:editForm.nit, email:editForm.email, phone:editForm.phone, address:editForm.address, subscription_status:editForm.subscription_status, config:updCfg }).eq('id', selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Sucursal actualizada'); setShowEdit(false); load();
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const { id, name } = confirmDeleteId;
      await supabase.from('invoice_items').delete().in('invoice_id', (await supabase.from('invoices').select('id').eq('company_id', id)).data?.map((r:any)=>r.id)||[]);
      await supabase.from('invoices').delete().eq('company_id', id);
      await supabase.from('products').delete().eq('company_id', id);
      await supabase.from('customers').delete().eq('company_id', id);
      await supabase.from('repair_orders').delete().eq('company_id', id);
      await supabase.from('cash_register_sessions').delete().eq('company_id', id);
      await supabase.from('profiles').delete().eq('company_id', id);
      await supabase.from('branches').delete().eq('company_id', id);
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
      toast.success(`Sucursal "${name}" eliminada`);
      setConfirmDeleteId(null); load();
    } catch (err: any) { toast.error('Error: ' + err.message); }
    finally { setDeleting(false); }
  };

  const handleSuspend = async (id: string, current: string) => {
    const ns = current === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await supabase.from('companies').update({ subscription_status:ns }).eq('id', id);
    toast.success(ns==='ACTIVE' ? 'Sucursal activada' : 'Sucursal suspendida'); load();
  };

  // ── Team actions ───────────────────────────────────────────────────────────
  const openInviteModal = (cid: string) => {
    setInviteForCid(cid); setInviteEmail(''); setInviteRole('cajero');
    setInvitePerms(ROLES_DEFAULT.find(r=>r.id==='cajero')?.defaultPerms||{});
    setShowInvite(true);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error('Ingresa un email'); return; }
    setInviting(true);
    try {
      const tokenArray = new Uint8Array(16); crypto.getRandomValues(tokenArray);
      const token = Array.from(tokenArray).map(b=>b.toString(16).padStart(2,'0')).join('');
      const expiresAt = new Date(Date.now()+7*24*60*60*1000).toISOString();
      const brs = branchBranches[inviteForCid] || [];
      const { data: inv, error } = await supabase.from('user_invitations').insert({
        company_id: inviteForCid, branch_id: brs[0]?.id || null,
        email: inviteEmail.trim().toLowerCase(), custom_role: inviteRole,
        permissions: invitePerms, token, expires_at: expiresAt, status:'PENDING',
      }).select().single();
      if (error) throw error;
      const link = `${window.location.origin}/#/invitacion/${inv.token}`;
      await navigator.clipboard.writeText(link).catch(()=>{});
      toast.success('✅ Invitación creada. Enlace copiado.');
      setShowInvite(false); loadBranchTeam(inviteForCid);
    } catch (err: any) { toast.error('Error: ' + err.message); }
    finally { setInviting(false); }
  };

  const handleToggleActive = async (m: TeamMember, cid: string) => {
    await supabase.from('profiles').update({ is_active: !m.is_active }).eq('id', m.id);
    toast.success(m.is_active ? 'Usuario desactivado' : 'Usuario activado');
    loadBranchTeam(cid);
  };

  const openEditMember = (m: TeamMember, cid: string) => {
    setEditMember(m); setEditMemberCid(cid);
    setEditRole(m.custom_role || m.role);
    setEditPerms(m.permissions || {});
  };

  const handleSaveMember = async () => {
    if (!editMember) return;
    setSavingMember(true);
    const { error } = await supabase.from('profiles').update({ custom_role:editRole, permissions:editPerms }).eq('id', editMember.id);
    if (error) { toast.error(error.message); setSavingMember(false); return; }
    toast.success('Empleado actualizado'); setEditMember(null);
    loadBranchTeam(editMemberCid);
    setSavingMember(false);
  };

  const handleDeleteMember = async () => {
    if (!confirmDeleteMember) return;
    setDeletingMember(true);
    const { error } = await supabase.from('profiles').delete().eq('id', confirmDeleteMember.id);
    if (error) { toast.error(error.message); setDeletingMember(false); return; }
    toast.success('Empleado eliminado');
    const cid = editMemberCid;
    setConfirmDeleteMember(null); setEditMember(null);
    loadBranchTeam(cid);
    setDeletingMember(false);
  };

  const handleDeleteInvitation = async (id: string, cid: string) => {
    await supabase.from('user_invitations').delete().eq('id', id);
    toast.success('Invitación eliminada'); loadBranchTeam(cid);
  };

  // ── Expand branch team panel ───────────────────────────────────────────────
  const toggleBranch = (cid: string) => {
    if (expandedBranch === cid) { setExpandedBranch(null); return; }
    setExpandedBranch(cid);
    if (!branchMembers[cid]) loadBranchTeam(cid);
  };

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = { width:'100%', padding:'9px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, fontSize:14, outline:'none', boxSizing:'border-box', color:'#1e293b' };
  const labelStyle: React.CSSProperties = { display:'block', fontSize:13, fontWeight:600, color:'#475569', marginBottom:5 };

  // ── Guard: loading ─────────────────────────────────────────────────────────
  if (ctxLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:16 }}>
      <div style={{ width:48, height:48, border:'4px solid #e2e8f0', borderTop:'4px solid #3b82f6', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Guard: not PRO ─────────────────────────────────────────────────────────
  if (!isPro) return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 text-4xl">🏪</div>
      <h2 className="text-2xl font-bold text-slate-800 mb-3">Función exclusiva del Plan PRO</h2>
      <p className="text-slate-500 mb-6 max-w-md">Contacta al administrador para actualizar tu plan.</p>
      <a href="https://wa.me/573204884943?text=Hola, quiero actualizar mi plan a PRO en POSmaster" target="_blank" rel="noreferrer"
        className="flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-600">
        💬 Actualizar a PRO
      </a>
    </div>
  );

  // ── Guard: owner password gate ─────────────────────────────────────────────
  if (!ownerUnlocked) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:20, padding:40, width:'100%', maxWidth:420, boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:56, height:56, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
            <Shield size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#1e293b', marginBottom:6 }}>Área restringida</h2>
          <p style={{ fontSize:14, color:'#64748b' }}>Para gestionar sucursales y empleados, confirma que eres el propietario de la licencia ingresando tu contraseña.</p>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={labelStyle}>Contraseña del propietario</label>
          <div style={{ position:'relative' }}>
            <input
              type={showPwd ? 'text' : 'password'}
              value={ownerPwd}
              onChange={e => setOwnerPwd(e.target.value)}
              onKeyDown={e => e.key==='Enter' && handleUnlock()}
              placeholder="••••••••"
              style={{ ...inputStyle, paddingRight:40 }}
              autoFocus
            />
            <button type="button" onClick={() => setShowPwd(v=>!v)}
              style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}>
              {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>
        </div>
        {authError && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:8, padding:'10px 14px', fontSize:13, marginBottom:12 }}>{authError}</div>}
        <button onClick={handleUnlock} disabled={authLoading || !ownerPwd}
          style={{ width:'100%', padding:'12px', background:'linear-gradient(135deg,#4f46e5,#7c3aed)', border:'none', color:'#fff', borderRadius:10, fontWeight:700, fontSize:15, cursor:'pointer', opacity: authLoading||!ownerPwd ? 0.6 : 1 }}>
          {authLoading ? '⏳ Verificando...' : '🔓 Confirmar acceso'}
        </button>
      </div>
    </div>
  );

  // ── Render all branches including sede principal ──────────────────────────
  // Build a unified list: sede principal first, then child branches
  const sedeItem = { id: companyId!, name: company?.name || 'Sede Principal', config: (company as any)?.config || {}, subscription_status: company?.subscription_status || 'ACTIVE', nit: company?.nit || '', email: company?.email || '', phone: (company as any)?.phone || '', address: (company as any)?.address || '', tipo:'principal' } as BranchRecord;

  const filtered = [sedeItem, ...branches];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sucursales y Equipos</h1>
          <p className="text-slate-500 text-sm"><strong style={{color:'#1e293b'}}>{branches.length + 1}/{MAX_BRANCHES + 1} sedes en total</strong> · Sede principal + {branches.length} adicional{branches.length !== 1 ? 'es' : ''} · Plan PRO</p>
        </div>
        <button onClick={() => {
          if (branches.length >= MAX_BRANCHES) { toast.error('Límite alcanzado: el plan PRO incluye 3 sedes en total (sede principal + 2 adicionales).'); return; }
          setForm(f=>({ ...f, name:`${parentTypeLabel} — Sucursal ${branches.length+2}`, nit:company?.nit||'', business_type:parentBusinessType }));
          setShowCreate(true);
        }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
          + Nueva Sucursal
        </button>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-slate-600">Sucursales adicionales usadas</span>
          <span className="text-sm font-bold text-slate-800">{branches.length + 1} / {MAX_BRANCHES + 1} sedes totales</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div className="h-3 rounded-full transition-all duration-500"
            style={{ width:`${((branches.length + 1)/(MAX_BRANCHES + 1))*100}%`, background: branches.length>=MAX_BRANCHES ? '#ef4444' : '#3b82f6' }} />
        </div>
      </div>

      {/* Branch accordion cards */}
      {loading ? (
        <div className="text-center py-10 text-slate-400">Cargando...</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(b => {
            const bt = b.config?.business_type || b.config?.business_types?.[0] || 'general';
            const st = statusColors[b.subscription_status] || statusColors['INACTIVE'];
            const isExpanded = expandedBranch === b.id;
            const members = branchMembers[b.id] || [];
            const invites = branchInvites[b.id] || [];
            const isLoading_ = memberLoading[b.id];
            const isPrincipal = b.tipo === 'principal';

            return (
              <div key={b.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Branch header row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background:'#f1f5f9' }}>
                    {BUSINESS_TYPE_LABELS[bt] ? '🏪' : '🏢'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 truncate">{b.name}</span>
                      {isPrincipal && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">PRINCIPAL</span>}
                      <span style={{ background:st.bg, color:st.color }} className="text-[10px] font-bold px-2 py-0.5 rounded-full">{st.label}</span>
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                        {BUSINESS_TYPE_LABELS[bt] || 'General'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {members.length > 0 ? `${members.length} empleado${members.length>1?'s':''}` : 'Sin empleados aún'}
                      {invites.filter(i=>i.status==='PENDING').length > 0 && ` · ${invites.filter(i=>i.status==='PENDING').length} inv. pendiente${invites.filter(i=>i.status==='PENDING').length>1?'s':''}`}
                    </p>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Link de acceso — para todas incluyendo sede principal */}
                    <button onClick={() => {
                      const link = isPrincipal
                        ? `${window.location.origin}/#/sucursal/${b.id}`
                        : `${window.location.origin}/#/sucursal/${b.id}`;
                      navigator.clipboard.writeText(link).then(() => toast.success('🔗 Link copiado'));
                    }} title="Copiar link de acceso" className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Copy size={14}/></button>
                    {/* Editar — todas */}
                    <button onClick={() => { setSelected(b); setEditForm({ name:b.name, nit:b.nit||'', email:b.email||'', phone:b.phone||'', address:b.address||'', subscription_status:b.subscription_status, business_type:bt }); setShowEdit(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={14}/></button>
                    {/* Suspender — solo sucursales hijas, no la principal */}
                    {!isPrincipal && (
                      <>
                        <button onClick={() => handleSuspend(b.id, b.subscription_status)} className={`p-1.5 rounded-lg ${b.subscription_status==='ACTIVE' ? 'text-amber-500 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}>
                          {b.subscription_status==='ACTIVE' ? <UserX size={14}/> : <UserCheck size={14}/>}
                        </button>
                        <button onClick={() => setConfirmDeleteId({ id:b.id, name:b.name })} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14}/></button>
                      </>
                    )}
                    <button onClick={() => toggleBranch(b.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                      <Users size={13}/> Equipo {isExpanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                    </button>
                  </div>
                </div>

                {/* Team panel */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                    {isLoading_ ? (
                      <div className="text-center text-slate-400 py-4 text-sm">Cargando equipo...</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Empleados de esta sucursal</p>
                          <button onClick={() => openInviteModal(b.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700">
                            <Plus size={12}/> Invitar empleado
                          </button>
                        </div>

                        {members.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-4">Sin empleados. Invita al primero.</p>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {members.map(m => {
                              const roleDef = ROLES_DEFAULT.find(r=>r.id===(m.custom_role||m.role)) || { icon:'👤', label:m.custom_role||m.role||'Usuario' };
                              return (
                                <div key={m.id} className={`flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-slate-100 ${!m.is_active ? 'opacity-50' : ''}`}>
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 flex-shrink-0">
                                    {(m.full_name||m.email||'?')[0].toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 text-sm truncate">{m.full_name || m.email}</p>
                                    <p className="text-xs text-slate-400 truncate">{m.email}</p>
                                  </div>
                                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                                    {(roleDef as any).icon} {(roleDef as any).label}
                                  </span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {m.is_active ? 'Activo' : 'Inactivo'}
                                  </span>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button onClick={() => { setEditMemberCid(b.id); openEditMember(m, b.id); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={13}/></button>
                                    <button onClick={() => handleToggleActive(m, b.id)} className={`p-1.5 rounded-lg ${m.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}>
                                      {m.is_active ? <UserX size={13}/> : <UserCheck size={13}/>}
                                    </button>
                                    <button onClick={() => { setEditMemberCid(b.id); setConfirmDeleteMember(m); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={13}/></button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Pending invitations */}
                        {invites.filter(i=>i.status==='PENDING').length > 0 && (
                          <>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Invitaciones pendientes</p>
                            <div className="space-y-1.5">
                              {invites.filter(i=>i.status==='PENDING').map(inv => {
                                const expired = new Date(inv.expires_at) < new Date();
                                return (
                                  <div key={inv.id} className="flex items-center gap-3 bg-white rounded-lg px-4 py-2.5 border border-slate-100">
                                    <span className="text-xs text-slate-600 flex-1 truncate">{inv.email}</span>
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{inv.custom_role}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                      {expired ? 'Expirada' : 'Pendiente'}
                                    </span>
                                    <button onClick={async () => {
                                      const link = `${window.location.origin}/#/invitacion/${inv.token}`;
                                      await navigator.clipboard.writeText(link); toast.success('Enlace copiado');
                                    }} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Copy size={12}/></button>
                                    <button onClick={() => handleDeleteInvitation(inv.id, b.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={12}/></button>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Confirmar eliminar sucursal ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-red-600 p-5">
              <h3 className="font-bold text-white">Eliminar sucursal</h3>
              <p className="text-xs text-red-200">Esta acción no se puede deshacer</p>
            </div>
            <div className="p-6">
              <p className="text-slate-700 text-sm mb-1">¿Eliminar permanentemente:</p>
              <p className="font-bold text-slate-900 mb-4">"{confirmDeleteId.name}"?</p>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-5">
                <p className="text-xs text-red-700">⚠️ Se eliminarán todos los datos (inventario, ventas, clientes, usuarios).</p>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>setConfirmDeleteId(null)} disabled={deleting} className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-bold text-sm">Cancelar</button>
                <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm disabled:opacity-60">
                  {deleting ? '⏳ Eliminando...' : '🗑️ Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Crear sucursal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div><h3 className="text-lg font-bold text-slate-800">Nueva Sucursal</h3><p className="text-xs text-slate-400">{MAX_BRANCHES - branches.length} sede{MAX_BRANCHES - branches.length !== 1 ? 's' : ''} disponible{MAX_BRANCHES - branches.length !== 1 ? 's' : ''}</p></div>
              <button onClick={()=>setShowCreate(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {[{label:'Nombre *',key:'name'},{label:'NIT / Cédula *',key:'nit'},{label:'Email',key:'email'},{label:'Teléfono',key:'phone'}].map(field=>(
                <div key={field.key}><label style={labelStyle}>{field.label}</label>
                  <input value={(form as any)[field.key]} onChange={e=>setForm(p=>({...p,[field.key]:e.target.value}))} style={inputStyle} /></div>
              ))}
              <div><label style={labelStyle}>Tipo de negocio</label>
                <select value={form.business_type} onChange={e=>setForm(p=>({...p,business_type:e.target.value}))} style={{...inputStyle,cursor:'pointer'}}>
                  {Object.entries(BUSINESS_TYPE_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}
                </select>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-400 uppercase mb-3">Administrador de la Sucursal</p>
                <div className="space-y-3">
                  <div><label style={labelStyle}>Email Admin *</label><input type="email" value={form.adminEmail} onChange={e=>setForm(p=>({...p,adminEmail:e.target.value}))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Contraseña *</label><input type="password" value={form.adminPassword} onChange={e=>setForm(p=>({...p,adminPassword:e.target.value}))} style={inputStyle} /></div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={()=>setShowCreate(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold">Cancelar</button>
                <button onClick={handleCreate} disabled={creating} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-60">{creating?'Creando...':'Crear Sucursal'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar sucursal ── */}
      {showEdit && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Editar: {selected.name}</h3>
              <button onClick={()=>setShowEdit(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {[{label:'Nombre',key:'name'},{label:'NIT',key:'nit'},{label:'Email',key:'email'},{label:'Teléfono',key:'phone'},{label:'Dirección',key:'address'}].map(f=>(
                <div key={f.key}><label style={labelStyle}>{f.label}</label>
                  <input value={(editForm as any)[f.key]} onChange={e=>setEditForm(p=>({...p,[f.key]:e.target.value}))} style={inputStyle} /></div>
              ))}
              <div><label style={labelStyle}>Tipo de negocio</label>
                <select value={editForm.business_type} onChange={e=>setEditForm(p=>({...p,business_type:e.target.value}))} style={{...inputStyle,cursor:'pointer'}}>
                  {Object.entries(BUSINESS_TYPE_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Estado</label>
                <select value={editForm.subscription_status} onChange={e=>setEditForm(p=>({...p,subscription_status:e.target.value}))} style={{...inputStyle,cursor:'pointer'}}>
                  <option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option><option value="PENDING">Pendiente</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={()=>setShowEdit(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold">Cancelar</button>
                <button onClick={handleEdit} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold">Guardar cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Invitar empleado ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-slate-900 p-5 flex justify-between items-center">
              <div><h3 className="font-bold text-white">Invitar empleado</h3><p className="text-xs text-slate-400">Se generará un enlace de registro</p></div>
              <button onClick={()=>setShowInvite(false)} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} className="text-slate-300"/></button>
            </div>
            <div className="p-6 space-y-5">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Email del empleado</label>
                <input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="empleado@email.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES_DEFAULT.map(r=>(
                    <button key={r.id} type="button" onClick={()=>{ setInviteRole(r.id); setInvitePerms(r.defaultPerms); }}
                      className={`p-3 rounded-lg border-2 text-sm font-medium text-left flex items-center gap-2 transition-all ${inviteRole===r.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      <span className="text-lg">{r.icon}</span> {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Permisos</label>
                <div className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-100">
                  {Object.entries(PERMISSION_LABELS).map(([key,label])=>(
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!invitePerms[key]} onChange={e=>setInvitePerms({...invitePerms,[key]:e.target.checked})} className="w-4 h-4 rounded accent-blue-600"/>
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setShowInvite(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-lg font-medium">Cancelar</button>
                <button type="button" onClick={handleInvite} disabled={inviting}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                  {inviting ? '⏳ Creando...' : <><Plus size={16}/> Crear invitación</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar miembro ── */}
      {editMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-slate-900 p-5 flex justify-between items-center">
              <div><h3 className="font-bold text-white">{editMember.full_name || editMember.email}</h3><p className="text-xs text-slate-400">Editar rol y permisos</p></div>
              <button onClick={()=>setEditMember(null)} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} className="text-slate-300"/></button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES_DEFAULT.map(r=>(
                    <button key={r.id} type="button" onClick={()=>{ setEditRole(r.id); setEditPerms(r.defaultPerms); }}
                      className={`p-3 rounded-lg border-2 text-sm font-medium text-left flex items-center gap-2 transition-all ${editRole===r.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      <span className="text-lg">{r.icon}</span> {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-2">Permisos individuales</label>
                <div className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-100">
                  {Object.entries(PERMISSION_LABELS).map(([key,label])=>(
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!editPerms[key]} onChange={e=>setEditPerms({...editPerms,[key]:e.target.checked})} className="w-4 h-4 rounded accent-blue-600"/>
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setEditMember(null)} className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-lg font-medium">Cancelar</button>
                <button type="button" onClick={handleSaveMember} disabled={savingMember}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                  <Check size={16}/> {savingMember ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <button type="button" onClick={()=>setConfirmDeleteMember(editMember)}
                  className="w-full py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center gap-2">
                  <Trash2 size={14}/> Eliminar empleado
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar eliminar miembro ── */}
      {confirmDeleteMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-red-600 p-5">
              <h3 className="font-bold text-white">Eliminar empleado</h3>
              <p className="text-xs text-red-200">Esta acción no se puede deshacer</p>
            </div>
            <div className="p-6">
              <p className="text-slate-700 text-sm mb-1">¿Eliminar a:</p>
              <p className="font-bold text-slate-900 mb-4">{confirmDeleteMember.full_name || confirmDeleteMember.email}</p>
              <div className="flex gap-3">
                <button onClick={()=>setConfirmDeleteMember(null)} disabled={deletingMember} className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-lg font-medium text-sm">Cancelar</button>
                <button onClick={handleDeleteMember} disabled={deletingMember} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold text-sm disabled:opacity-60">
                  {deletingMember ? '⏳ Eliminando...' : '🗑️ Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Branches;