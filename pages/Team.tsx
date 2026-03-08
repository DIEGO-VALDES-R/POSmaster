import React, { useState, useEffect } from 'react';
import {
  Users, Plus, Edit2, Trash2, X, Check, Mail, 
  Shield, Lock, Eye, EyeOff, Copy, AlertTriangle,
  UserCheck, UserX, Building2, ChevronDown
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { toast } from 'react-hot-toast';

// ── TIPOS ──────────────────────────────────────────────────────────────────────
interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  custom_role: string | null;
  permissions: Record<string, boolean>;
  branch_id: string | null;
  is_active: boolean;
  pin: string | null;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  email: string;
  custom_role: string;
  branch_id: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  token: string;
}

// ── ROLES POR TIPO DE NEGOCIO ──────────────────────────────────────────────────
const ROLES_BY_TYPE: Record<string, { id: string; label: string; icon: string; defaultPerms: Record<string, boolean> }[]> = {
  default: [
    { id: 'cajero',      label: 'Cajero',       icon: '🧾', defaultPerms: { can_sell: true,  can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: true,  can_view_repairs: false } },
    { id: 'vendedor',    label: 'Vendedor',      icon: '🛍️', defaultPerms: { can_sell: true,  can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: false, can_view_repairs: false } },
    { id: 'supervisor',  label: 'Supervisor',    icon: '👁️', defaultPerms: { can_sell: true,  can_refund: true,  can_view_reports: true,  can_manage_inventory: true,  can_manage_team: false, can_open_cash: true,  can_view_repairs: true  } },
    { id: 'bodeguero',   label: 'Bodeguero',     icon: '📦', defaultPerms: { can_sell: false, can_refund: false, can_view_reports: false, can_manage_inventory: true,  can_manage_team: false, can_open_cash: false, can_view_repairs: false } },
    { id: 'admin',       label: 'Administrador', icon: '⚙️', defaultPerms: { can_sell: true,  can_refund: true,  can_view_reports: true,  can_manage_inventory: true,  can_manage_team: true,  can_open_cash: true,  can_view_repairs: true  } },
  ],
  tienda_tecnologia: [
    { id: 'cajero',           label: 'Cajero',            icon: '🧾', defaultPerms: { can_sell: true,  can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: true,  can_view_repairs: false } },
    { id: 'tecnico_reparador',label: 'Técnico Reparador', icon: '🔧', defaultPerms: { can_sell: false, can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: false, can_view_repairs: true  } },
    { id: 'vendedor',         label: 'Vendedor',          icon: '📱', defaultPerms: { can_sell: true,  can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: false, can_view_repairs: false } },
    { id: 'supervisor',       label: 'Supervisor',        icon: '👁️', defaultPerms: { can_sell: true,  can_refund: true,  can_view_reports: true,  can_manage_inventory: true,  can_manage_team: false, can_open_cash: true,  can_view_repairs: true  } },
    { id: 'admin',            label: 'Administrador',     icon: '⚙️', defaultPerms: { can_sell: true,  can_refund: true,  can_view_reports: true,  can_manage_inventory: true,  can_manage_team: true,  can_open_cash: true,  can_view_repairs: true  } },
  ],
  restaurante: [
    { id: 'cajero',    label: 'Cajero',     icon: '🧾', defaultPerms: { can_sell: true,  can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: true,  can_view_repairs: false } },
    { id: 'mesero',    label: 'Mesero',     icon: '🍽️', defaultPerms: { can_sell: true,  can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: false, can_view_repairs: false } },
    { id: 'cocina',    label: 'Cocina',     icon: '👨‍🍳', defaultPerms: { can_sell: false, can_refund: false, can_view_reports: false, can_manage_inventory: true,  can_manage_team: false, can_open_cash: false, can_view_repairs: false } },
    { id: 'supervisor',label: 'Supervisor', icon: '👁️', defaultPerms: { can_sell: true,  can_refund: true,  can_view_reports: true,  can_manage_inventory: true,  can_manage_team: false, can_open_cash: true,  can_view_repairs: false } },
    { id: 'admin',     label: 'Administrador', icon: '⚙️', defaultPerms: { can_sell: true, can_refund: true, can_view_reports: true, can_manage_inventory: true, can_manage_team: true, can_open_cash: true, can_view_repairs: false } },
  ],
  ropa: [
    { id: 'cajero',    label: 'Cajero',     icon: '🧾', defaultPerms: { can_sell: true,  can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: true,  can_view_repairs: false } },
    { id: 'vendedor',  label: 'Vendedor',   icon: '👗', defaultPerms: { can_sell: true,  can_refund: false, can_view_reports: false, can_manage_inventory: false, can_manage_team: false, can_open_cash: false, can_view_repairs: false } },
    { id: 'bodeguero', label: 'Bodeguero',  icon: '📦', defaultPerms: { can_sell: false, can_refund: false, can_view_reports: false, can_manage_inventory: true,  can_manage_team: false, can_open_cash: false, can_view_repairs: false } },
    { id: 'supervisor',label: 'Supervisor', icon: '👁️', defaultPerms: { can_sell: true,  can_refund: true,  can_view_reports: true,  can_manage_inventory: true,  can_manage_team: false, can_open_cash: true,  can_view_repairs: false } },
    { id: 'admin',     label: 'Administrador', icon: '⚙️', defaultPerms: { can_sell: true, can_refund: true, can_view_reports: true, can_manage_inventory: true, can_manage_team: true, can_open_cash: true, can_view_repairs: false } },
  ],
};

const PERMISSION_LABELS: Record<string, string> = {
  can_sell:             '🛒 Realizar ventas',
  can_refund:           '↩️ Hacer devoluciones',
  can_view_reports:     '📊 Ver reportes',
  can_manage_inventory: '📦 Gestionar inventario',
  can_manage_team:      '👥 Gestionar equipo',
  can_open_cash:        '💰 Abrir/cerrar caja',
  can_view_repairs:     '🔧 Ver reparaciones',
};

const getRolesForType = (type: string) => ROLES_BY_TYPE[type] || ROLES_BY_TYPE.default;

const getRoleBadge = (roleId: string, type: string) => {
  const roles = getRolesForType(type);
  return roles.find(r => r.id === roleId) || { id: roleId, label: roleId, icon: '👤', defaultPerms: {} };
};

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────────
const Team: React.FC = () => {
  const { company, companyId, userRole } = useDatabase();
  const businessType = (company as any)?.business_type || 'default';
  const plan = company?.subscription_plan || 'BASIC';
  const isEnterprise = plan === 'ENTERPRISE';
  const isPro = plan === 'PRO' || isEnterprise;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');

  // Modal invitar
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cajero');
  const [inviteBranch, setInviteBranch] = useState('');
  const [invitePerms, setInvitePerms] = useState<Record<string, boolean>>({});
  const [inviting, setInviting] = useState(false);

  // Modal editar
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [editPin, setEditPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);

  // Confirmación eliminar
  const [confirmDelete, setConfirmDelete] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const roles = getRolesForType(businessType);

  useEffect(() => {
    if (companyId) {
      loadMembers();
      loadBranches();
      loadInvitations();
    }
  }, [companyId]);

  const loadMembers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at');
    if (error) toast.error('Error cargando equipo');
    setMembers((data || []) as any);
    setLoading(false);
  };

  const loadBranches = async () => {
    const { data } = await supabase.from('branches').select('id, name').eq('company_id', companyId).eq('is_active', true);
    setBranches(data || []);
  };

  const loadInvitations = async () => {
    const { data } = await supabase.from('user_invitations')
      .select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    setInvitations((data || []) as any);
  };

  const handleRoleSelect = (roleId: string) => {
    setInviteRole(roleId);
    const found = roles.find(r => r.id === roleId);
    setInvitePerms(found?.defaultPerms || {});
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error('Ingresa un email'); return; }
    setInviting(true);
    try {
      const { data: inv, error } = await supabase.from('user_invitations').insert({
        company_id: companyId,
        branch_id: inviteBranch || branches[0]?.id || null,
        email: inviteEmail.trim().toLowerCase(),
        custom_role: inviteRole,
        permissions: invitePerms,
      }).select().single();
      if (error) throw error;
      const link = `${window.location.origin}/#/invitacion/${inv.token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast.success('Invitación creada. Enlace copiado al portapapeles.');
      setShowInviteModal(false);
      setInviteEmail(''); setInviteRole('cajero'); setInviteBranch(''); setInvitePerms({});
      loadInvitations();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setInviting(false);
    }
  };

  const openEdit = (m: TeamMember) => {
    setEditMember(m);
    setEditRole(m.custom_role || m.role);
    setEditBranch(m.branch_id || '');
    setEditPerms(m.permissions || {});
    setEditPin(m.pin || '');
    setShowPin(false);
  };

  const handleSaveEdit = async () => {
    if (!editMember) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        custom_role: editRole,
        branch_id: editBranch || null,
        permissions: editPerms,
        pin: editPin || null,
      }).eq('id', editMember.id);
      if (error) throw error;
      toast.success('Miembro actualizado');
      setEditMember(null);
      loadMembers();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (m: TeamMember) => {
    const { error } = await supabase.from('profiles').update({ is_active: !m.is_active }).eq('id', m.id);
    if (error) { toast.error(error.message); return; }
    toast.success(m.is_active ? 'Usuario desactivado' : 'Usuario activado');
    loadMembers();
  };

  // ── ELIMINAR MIEMBRO ───────────────────────────────────────────────────────
  const handleDeleteMember = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      toast.success(`${confirmDelete.full_name || confirmDelete.email} eliminado del equipo`);
      setConfirmDelete(null);
      loadMembers();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/#/invitacion/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success('Enlace copiado');
  };

  const handleDeleteInvitation = async (id: string) => {
    await supabase.from('user_invitations').delete().eq('id', id);
    loadInvitations();
    toast.success('Invitación eliminada');
  };

  if (!isPro) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users size={36} className="text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Gestión de Equipo</h2>
          <p className="text-slate-500 mb-6">Esta función está disponible en los planes <span className="font-bold text-blue-600">PRO</span> y <span className="font-bold text-purple-600">ENTERPRISE</span>.</p>
          <div className="grid grid-cols-2 gap-4 text-left max-w-md mx-auto">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="font-bold text-blue-700 mb-1">PRO</p>
              <p className="text-xs text-blue-600">Roles en sede principal<br/>Hasta 5 usuarios</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
              <p className="font-bold text-purple-700 mb-1">ENTERPRISE</p>
              <p className="text-xs text-purple-600">Roles en todas las sucursales<br/>Usuarios ilimitados</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gestión de Equipo</h2>
          <p className="text-slate-500 text-sm">
            {isEnterprise ? 'Usuarios y roles en todas las sucursales' : 'Usuarios y roles en tu sede principal'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${isEnterprise ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
            {isEnterprise ? '🏢 ENTERPRISE' : '⭐ PRO'}
          </span>
          <button onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 text-sm shadow-sm">
            <Plus size={16} /> Invitar usuario
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-lg p-1 border border-slate-200 w-fit">
        <button onClick={() => setActiveTab('members')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'members' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
          <UserCheck size={15} /> Miembros activos <span className="bg-blue-200 text-blue-800 text-xs px-1.5 py-0.5 rounded-full">{members.length}</span>
        </button>
        <button onClick={() => setActiveTab('invitations')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'invitations' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
          <Mail size={15} /> Invitaciones <span className="bg-slate-200 text-slate-700 text-xs px-1.5 py-0.5 rounded-full">{invitations.filter(i => i.status === 'PENDING').length}</span>
        </button>
      </div>

      {/* ── TAB MIEMBROS ── */}
      {activeTab === 'members' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Cargando equipo...
            </div>
          ) : members.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin miembros aún</p>
              <p className="text-xs mt-1">Invita a tu primer colaborador</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Usuario', 'Rol', isEnterprise ? 'Sucursal' : '', 'Permisos clave', 'Estado', ''].map((h, i) => h && (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map(m => {
                  const roleDef = getRoleBadge(m.custom_role || m.role, businessType);
                  const branch = branches.find(b => b.id === m.branch_id);
                  return (
                    <tr key={m.id} className={`hover:bg-slate-50 transition-colors ${!m.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{m.full_name || '—'}</div>
                        <div className="text-xs text-slate-400">{m.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                          {roleDef.icon} {roleDef.label}
                        </span>
                      </td>
                      {isEnterprise && (
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Building2 size={12} /> {branch?.name || 'Sin asignar'}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(m.permissions || {}).filter(([, v]) => v).slice(0, 3).map(([k]) => (
                            <span key={k} className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100">
                              {PERMISSION_LABELS[k]?.split(' ')[1] || k}
                            </span>
                          ))}
                          {Object.values(m.permissions || {}).filter(Boolean).length === 0 && (
                            <span className="text-[10px] text-slate-400 italic">Sin permisos asignados</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {m.is_active ? <><Check size={10} /> Activo</> : <><X size={10} /> Inactivo</>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(m)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleToggleActive(m)} className={`p-1.5 rounded-lg transition-colors ${m.is_active ? 'text-amber-500 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`} title={m.is_active ? 'Desactivar' : 'Activar'}>
                            {m.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                          <button onClick={() => setConfirmDelete(m)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar usuario">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB INVITACIONES ── */}
      {activeTab === 'invitations' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {invitations.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Mail size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin invitaciones pendientes</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Email', 'Rol', 'Estado', 'Expira', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map(inv => {
                  const roleDef = getRoleBadge(inv.custom_role, businessType);
                  const expired = new Date(inv.expires_at) < new Date();
                  const statusColor = inv.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' : expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
                  const statusLabel = inv.status === 'ACCEPTED' ? '✅ Aceptada' : expired ? '⏰ Expirada' : '⏳ Pendiente';
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{inv.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs">
                          {roleDef.icon} {roleDef.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>{statusLabel}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{new Date(inv.expires_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {inv.status === 'PENDING' && !expired && (
                            <button onClick={() => handleCopyInviteLink(inv.token)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Copiar enlace">
                              <Copy size={14} />
                            </button>
                          )}
                          <button onClick={() => handleDeleteInvitation(inv.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── MODAL CONFIRMAR ELIMINAR ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-red-600 p-5 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white">Eliminar usuario</h3>
                <p className="text-xs text-red-200">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-700 text-sm mb-1">¿Eliminar permanentemente a:</p>
              <p className="font-bold text-slate-900 mb-1">{confirmDelete.full_name || '—'}</p>
              <p className="text-xs text-slate-500 mb-4">{confirmDelete.email}</p>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-5">
                <p className="text-xs text-red-700">⚠️ El usuario perderá acceso inmediatamente y no podrá iniciar sesión.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-lg font-medium hover:bg-slate-50 text-sm">
                  Cancelar
                </button>
                <button onClick={handleDeleteMember} disabled={deleting}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2 text-sm">
                  <Trash2 size={15} /> {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL INVITAR ── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-slate-900 p-5 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white">Invitar al equipo</h3>
                <p className="text-xs text-slate-400">Se enviará un enlace de registro</p>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} className="text-slate-300" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email del colaborador</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colaborador@email.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rol / Función</label>
                <div className="grid grid-cols-2 gap-2">
                  {roles.map(r => (
                    <button key={r.id} type="button" onClick={() => handleRoleSelect(r.id)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium text-left transition-all flex items-center gap-2 ${inviteRole === r.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                      <span className="text-lg">{r.icon}</span> {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {isEnterprise && branches.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Asignar a sucursal</label>
                  <select value={inviteBranch} onChange={e => setInviteBranch(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white">
                    <option value="">Sede principal</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Permisos</label>
                <div className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-100">
                  {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!invitePerms[key]} onChange={e => setInvitePerms({ ...invitePerms, [key]: e.target.checked })}
                        className="w-4 h-4 rounded accent-blue-600" />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-lg font-medium hover:bg-slate-50">Cancelar</button>
                <button type="button" onClick={handleInvite} disabled={inviting}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  <Mail size={16} /> {inviting ? 'Enviando...' : 'Crear invitación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR MIEMBRO ── */}
      {editMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-slate-900 p-5 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white">{editMember.full_name || editMember.email}</h3>
                <p className="text-xs text-slate-400">Editar rol y permisos</p>
              </div>
              <button onClick={() => setEditMember(null)} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} className="text-slate-300" /></button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rol</label>
                <div className="grid grid-cols-2 gap-2">
                  {roles.map(r => (
                    <button key={r.id} type="button"
                      onClick={() => { setEditRole(r.id); setEditPerms(r.defaultPerms); }}
                      className={`p-3 rounded-lg border-2 text-sm font-medium text-left transition-all flex items-center gap-2 ${editRole === r.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                      <span className="text-lg">{r.icon}</span> {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {isEnterprise && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sucursal</label>
                  <select value={editBranch} onChange={e => setEditBranch(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none text-sm bg-white">
                    <option value="">Sede principal</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Permisos individuales</label>
                <div className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-100">
                  {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!editPerms[key]} onChange={e => setEditPerms({ ...editPerms, [key]: e.target.checked })}
                        className="w-4 h-4 rounded accent-blue-600" />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1"><Lock size={13} /> PIN de acceso rápido (4 dígitos)</label>
                <div className="relative">
                  <input type={showPin ? 'text' : 'password'} value={editPin} onChange={e => setEditPin(e.target.value.slice(0, 4).replace(/\D/g, ''))}
                    placeholder="••••" maxLength={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono tracking-widest" />
                  <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Permite login rápido en caja sin contraseña completa</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditMember(null)} className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-lg font-medium hover:bg-slate-50">Cancelar</button>
                <button type="button" onClick={handleSaveEdit} disabled={saving}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  <Check size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Team;