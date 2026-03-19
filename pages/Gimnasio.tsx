import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, User, CheckCircle, XCircle, Clock, RefreshCw,
  X, Edit2, Trash2, DollarSign, Calendar, Search,
  Users, AlertTriangle, Dumbbell, BarChart2, Tag,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type MemberStatus = 'ACTIVE' | 'EXPIRED' | 'FROZEN' | 'CANCELLED';

interface MembershipType {
  id: string;
  company_id: string;
  name: string;           // Mensual full, Mensual mañana, Trimestral, Anual
  duration_days: number;
  price: number;
  description?: string;
  is_active: boolean;
}

interface Member {
  id: string;
  company_id: string;
  full_name: string;
  document?: string;
  phone?: string;
  email?: string;
  membership_type_id: string;
  membership_type_name: string;
  membership_price: number;
  start_date: string;
  end_date: string;
  status: MemberStatus;
  photo_url?: string;
  notes?: string;
  created_at: string;
}

interface CheckIn {
  id: string;
  company_id: string;
  member_id: string;
  member_name: string;
  checked_in_at: string;
  status: MemberStatus;
}

interface GymClass {
  id: string;
  company_id: string;
  name: string;           // Spinning, Yoga, CrossFit
  instructor: string;
  day_of_week: number;    // 0=Lun...6=Dom
  start_time: string;     // "06:00"
  duration_min: number;
  room?: string;
  max_capacity: number;
  is_active: boolean;
}

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const STATUS_CFG: Record<MemberStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  ACTIVE:    { label: 'Activa',    cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={11} /> },
  EXPIRED:   { label: 'Vencida',   cls: 'bg-red-100 text-red-700',         icon: <XCircle size={11} /> },
  FROZEN:    { label: 'Congelada', cls: 'bg-blue-100 text-blue-700',       icon: <Clock size={11} /> },
  CANCELLED: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500',     icon: <X size={11} /> },
};

const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

const emptyMember = {
  full_name: '', document: '', phone: '', email: '',
  membership_type_id: '', start_date: new Date().toISOString().split('T')[0],
  notes: '',
};

const emptyType = { name: '', duration_days: '30', price: '', description: '' };

const emptyClass = {
  name: '', instructor: '', day_of_week: '0',
  start_time: '06:00', duration_min: '60', room: '', max_capacity: '20',
};

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function daysLeft(endDate: string) {
  return Math.ceil((new Date(endDate + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const Gimnasio: React.FC = () => {
  const { companyId, session } = useDatabase();
  const { formatMoney } = useCurrency();

  const [tab, setTab]                 = useState<'members' | 'checkin' | 'classes' | 'types' | 'stats'>('members');
  const [members, setMembers]         = useState<Member[]>([]);
  const [types, setTypes]             = useState<MembershipType[]>([]);
  const [checkins, setCheckins]       = useState<CheckIn[]>([]);
  const [classes, setClasses]         = useState<GymClass[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState<MemberStatus | 'ALL'>('ALL');

  // Modals
  const [showMember, setShowMember]   = useState(false);
  const [editMember, setEditMember]   = useState<Member | null>(null);
  const [memberForm, setMemberForm]   = useState(emptyMember);

  const [showType, setShowType]       = useState(false);
  const [editType, setEditType]       = useState<MembershipType | null>(null);
  const [typeForm, setTypeForm]       = useState(emptyType);

  const [showClass, setShowClass]     = useState(false);
  const [editClass, setEditClass]     = useState<GymClass | null>(null);
  const [classForm, setClassForm]     = useState(emptyClass);

  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinSearch, setCheckinSearch] = useState('');
  const [saving, setSaving]           = useState(false);

  // ── Load ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const [{ data: m }, { data: t }, { data: c }, { data: cl }] = await Promise.all([
      supabase.from('gym_members').select('*').eq('company_id', companyId).order('full_name'),
      supabase.from('gym_membership_types').select('*').eq('company_id', companyId).eq('is_active', true).order('price'),
      supabase.from('gym_checkins').select('*').eq('company_id', companyId)
        .gte('checked_in_at', today + 'T00:00:00').order('checked_in_at', { ascending: false }),
      supabase.from('gym_classes').select('*').eq('company_id', companyId).eq('is_active', true).order('day_of_week').order('start_time'),
    ]);
    // Auto-update expired memberships
    const updated = (m || []).map((mem: any) => ({
      ...mem,
      status: mem.status === 'ACTIVE' && mem.end_date < today ? 'EXPIRED' : mem.status,
    }));
    setMembers(updated);
    setTypes(t || []);
    setCheckins(c || []);
    setClasses(cl || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // ── Check-in ─────────────────────────────────────────────
  const handleCheckin = async (member: Member) => {
    if (member.status === 'EXPIRED') {
      toast.error(`${member.full_name} tiene la membresía vencida. Debe renovar.`);
      return;
    }
    if (member.status === 'FROZEN') {
      toast.error(`${member.full_name} tiene la membresía congelada.`);
      return;
    }
    const { error } = await supabase.from('gym_checkins').insert({
      company_id: companyId,
      member_id: member.id,
      member_name: member.full_name,
      status: member.status,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ ${member.full_name} — Ingreso registrado`);
    setCheckinSearch('');
    load();
  };

  // ── Member CRUD ──────────────────────────────────────────
  const openNewMember = () => {
    setEditMember(null);
    setMemberForm(emptyMember);
    setShowMember(true);
  };

  const openEditMember = (m: Member) => {
    setEditMember(m);
    setMemberForm({
      full_name: m.full_name, document: m.document || '',
      phone: m.phone || '', email: m.email || '',
      membership_type_id: m.membership_type_id,
      start_date: m.start_date, notes: m.notes || '',
    });
    setShowMember(true);
  };

  const saveMember = async () => {
    if (!memberForm.full_name.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!memberForm.membership_type_id) { toast.error('Selecciona un tipo de membresía'); return; }
    setSaving(true);
    const mtype = types.find(t => t.id === memberForm.membership_type_id);
    if (!mtype) { toast.error('Tipo de membresía no encontrado'); setSaving(false); return; }
    const end = new Date(memberForm.start_date);
    end.setDate(end.getDate() + mtype.duration_days);
    const payload = {
      company_id: companyId,
      full_name: memberForm.full_name.trim(),
      document: memberForm.document.trim() || null,
      phone: memberForm.phone.trim() || null,
      email: memberForm.email.trim() || null,
      membership_type_id: mtype.id,
      membership_type_name: mtype.name,
      membership_price: mtype.price,
      start_date: memberForm.start_date,
      end_date: end.toISOString().split('T')[0],
      status: 'ACTIVE' as MemberStatus,
      notes: memberForm.notes.trim() || null,
    };
    const { error } = editMember
      ? await supabase.from('gym_members').update(payload).eq('id', editMember.id)
      : await supabase.from('gym_members').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editMember ? 'Socio actualizado' : '✅ Socio registrado');
    setShowMember(false);
    setSaving(false);
    load();
  };

  const toggleFreeze = async (m: Member) => {
    const newStatus = m.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    await supabase.from('gym_members').update({ status: newStatus }).eq('id', m.id);
    toast.success(newStatus === 'FROZEN' ? '🧊 Membresía congelada' : '✅ Membresía activada');
    load();
  };

  const renewMember = async (m: Member) => {
    const mtype = types.find(t => t.id === m.membership_type_id);
    if (!mtype) return;
    const base = m.status === 'ACTIVE' && m.end_date > new Date().toISOString().split('T')[0]
      ? m.end_date : new Date().toISOString().split('T')[0];
    const end = new Date(base);
    end.setDate(end.getDate() + mtype.duration_days);
    await supabase.from('gym_members').update({
      status: 'ACTIVE',
      end_date: end.toISOString().split('T')[0],
    }).eq('id', m.id);
    toast.success(`♻️ Membresía renovada hasta ${fmtDate(end.toISOString().split('T')[0])}`);
    load();
  };

  // ── Type CRUD ────────────────────────────────────────────
  const saveType = async () => {
    if (!typeForm.name.trim() || !typeForm.price) { toast.error('Nombre y precio son obligatorios'); return; }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: typeForm.name.trim(),
      duration_days: parseInt(typeForm.duration_days) || 30,
      price: parseFloat(typeForm.price),
      description: typeForm.description.trim() || null,
      is_active: true,
    };
    const { error } = editType
      ? await supabase.from('gym_membership_types').update(payload).eq('id', editType.id)
      : await supabase.from('gym_membership_types').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editType ? 'Tipo actualizado' : 'Tipo creado');
    setShowType(false); setSaving(false); load();
  };

  // ── Class CRUD ───────────────────────────────────────────
  const saveClass = async () => {
    if (!classForm.name.trim() || !classForm.instructor.trim()) { toast.error('Nombre e instructor son obligatorios'); return; }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: classForm.name.trim(),
      instructor: classForm.instructor.trim(),
      day_of_week: parseInt(classForm.day_of_week),
      start_time: classForm.start_time,
      duration_min: parseInt(classForm.duration_min) || 60,
      room: classForm.room.trim() || null,
      max_capacity: parseInt(classForm.max_capacity) || 20,
      is_active: true,
    };
    const { error } = editClass
      ? await supabase.from('gym_classes').update(payload).eq('id', editClass.id)
      : await supabase.from('gym_classes').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editClass ? 'Clase actualizada' : 'Clase creada');
    setShowClass(false); setSaving(false); load();
  };

  // ── Filtered members ─────────────────────────────────────
  const filtered = members.filter(m => {
    const matchSearch = !search ||
      m.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.document || '').includes(search) ||
      (m.phone || '').includes(search);
    const matchStatus = filterStatus === 'ALL' || m.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── KPIs ─────────────────────────────────────────────────
  const kpis = {
    active:    members.filter(m => m.status === 'ACTIVE').length,
    expiringSoon: members.filter(m => m.status === 'ACTIVE' && daysLeft(m.end_date) <= 7).length,
    expired:   members.filter(m => m.status === 'EXPIRED').length,
    todayCheckins: checkins.length,
    monthRevenue: members.filter(m => m.status === 'ACTIVE').reduce((s, m) => s + (m.membership_price / 30), 0) * 30,
  };

  const checkinFiltered = members.filter(m =>
    checkinSearch.length >= 2 &&
    (m.full_name.toLowerCase().includes(checkinSearch.toLowerCase()) ||
     (m.document || '').includes(checkinSearch))
  ).slice(0, 5);

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400";
  const labelCls = "block text-sm font-medium text-slate-700 mb-1";

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Dumbbell size={24} className="text-emerald-600" /> Gimnasio
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">Membresías, check-in y clases grupales</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">
            <RefreshCw size={14} /> Actualizar
          </button>
          <button
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}#/gimnasio-kiosk/${companyId}`;
              navigator.clipboard.writeText(url).then(() => toast.success('🔗 Link del kiosk copiado'));
            }}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm"
            title="Copiar link para la tablet de recepción">
            📟 Link Kiosk
          </button>
          <button onClick={openNewMember}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
            <Plus size={16} /> Nuevo socio
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Socios activos',    value: kpis.active,        color: 'text-slate-800' },
          { label: 'Vencen en 7 días',  value: kpis.expiringSoon,  color: 'text-amber-600' },
          { label: 'Membresías vencidas', value: kpis.expired,     color: 'text-red-600' },
          { label: 'Check-ins hoy',     value: kpis.todayCheckins, color: 'text-emerald-600' },
          { label: 'Ingresos del mes',  value: formatMoney(Math.round(kpis.monthRevenue)), color: 'text-blue-600' },
        ].map(k => (
          <div key={k.label} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-xs font-medium">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          ['members', '👥 Socios'],
          ['checkin', '✅ Check-in'],
          ['classes', '🏋️ Clases'],
          ['types',   '🏷️ Membresías'],
          ['stats',   '📊 Estadísticas'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: SOCIOS ──────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Buscar por nombre, cédula o teléfono..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(['ALL','ACTIVE','EXPIRED','FROZEN'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === s ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                  {s === 'ALL' ? 'Todos' : STATUS_CFG[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Cargando socios...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Users size={36} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin socios registrados</p>
                <p className="text-sm mt-1">Registra el primer socio con el botón de arriba</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Socio','Membresía','Inicio','Vence','Días restantes','Estado',''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(m => {
                      const days = daysLeft(m.end_date);
                      const cfg = STATUS_CFG[m.status];
                      return (
                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{m.full_name}</p>
                            {m.document && <p className="text-xs text-slate-400">CC {m.document}</p>}
                            {m.phone    && <p className="text-xs text-slate-400">📱 {m.phone}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">{m.membership_type_name}</p>
                            <p className="text-xs text-slate-400">{formatMoney(m.membership_price)}/período</p>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(m.start_date)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(m.end_date)}</td>
                          <td className="px-4 py-3">
                            {m.status === 'ACTIVE' ? (
                              <span className={`font-bold text-sm ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {days > 0 ? `${days} días` : 'Vence hoy'}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 justify-end">
                              {(m.status === 'EXPIRED' || (m.status === 'ACTIVE' && days <= 7)) && (
                                <button onClick={() => renewMember(m)}
                                  className="px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors">
                                  ♻️ Renovar
                                </button>
                              )}
                              <button onClick={() => toggleFreeze(m)}
                                className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors">
                                {m.status === 'FROZEN' ? '▶️ Activar' : '🧊 Congelar'}
                              </button>
                              <button onClick={() => openEditMember(m)}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                                <Edit2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: CHECK-IN ──────────────────────────────────── */}
      {tab === 'checkin' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-bold text-slate-700 mb-3">Registrar ingreso</p>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder="Buscar socio por nombre o cédula..."
                  value={checkinSearch}
                  onChange={e => setCheckinSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            {checkinFiltered.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                {checkinFiltered.map(m => {
                  const cfg = STATUS_CFG[m.status];
                  return (
                    <button key={m.id} onClick={() => handleCheckin(m)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 text-left">
                      <div>
                        <p className="font-semibold text-slate-800">{m.full_name}</p>
                        <p className="text-xs text-slate-400">{m.membership_type_name} · Vence: {fmtDate(m.end_date)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <p className="font-bold text-slate-700 text-sm">Check-ins de hoy — {checkins.length} socios</p>
            </div>
            {checkins.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <CheckCircle size={32} className="mx-auto mb-3 opacity-30" />
                <p>Sin check-ins hoy</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {checkins.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800 text-sm">{c.member_name}</p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(c.checked_in_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_CFG[c.status]?.cls || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_CFG[c.status]?.icon} {STATUS_CFG[c.status]?.label || c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: CLASES ────────────────────────────────────── */}
      {tab === 'classes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditClass(null); setClassForm(emptyClass); setShowClass(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
              <Plus size={15} /> Nueva clase
            </button>
          </div>

          {/* Group by day */}
          {DAYS.map((day, idx) => {
            const dayClasses = classes.filter(c => c.day_of_week === idx);
            if (dayClasses.length === 0) return null;
            return (
              <div key={day} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200">
                  <p className="font-bold text-slate-700 text-sm">{day}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {dayClasses.map(c => (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="bg-emerald-50 rounded-xl px-3 py-2 text-center flex-shrink-0 min-w-[56px]">
                        <p className="font-bold text-emerald-700 text-sm">{c.start_time}</p>
                        <p className="text-[10px] text-emerald-500">{c.duration_min}min</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800">{c.name}</p>
                        <p className="text-xs text-slate-500">Prof. {c.instructor}{c.room ? ` · ${c.room}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Máx. {c.max_capacity} personas</span>
                        <button onClick={() => { setEditClass(c); setClassForm({ name: c.name, instructor: c.instructor, day_of_week: String(c.day_of_week), start_time: c.start_time, duration_min: String(c.duration_min), room: c.room || '', max_capacity: String(c.max_capacity) }); setShowClass(true); }}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={async () => { await supabase.from('gym_classes').update({ is_active: false }).eq('id', c.id); load(); }}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {classes.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Dumbbell size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin clases registradas</p>
              <p className="text-sm mt-1">Agrega la primera clase con el botón de arriba</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TIPOS DE MEMBRESÍA ─────────────────────────── */}
      {tab === 'types' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditType(null); setTypeForm(emptyType); setShowType(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
              <Plus size={15} /> Nuevo tipo
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-slate-800">{t.name}</p>
                    {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                  </div>
                  <button onClick={() => { setEditType(t); setTypeForm({ name: t.name, duration_days: String(t.duration_days), price: String(t.price), description: t.description || '' }); setShowType(true); }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                    <Edit2 size={13} />
                  </button>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t.duration_days} días</span>
                  <span className="font-bold text-emerald-600">{formatMoney(t.price)}</span>
                </div>
                <div className="mt-3 text-xs text-slate-400">
                  {members.filter(m => m.membership_type_id === t.id && m.status === 'ACTIVE').length} socios activos con este tipo
                </div>
              </div>
            ))}
            {types.length === 0 && (
              <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <Tag size={36} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin tipos de membresía</p>
                <p className="text-sm mt-1">Crea los tipos (mensual, trimestral, anual, etc.)</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: ESTADÍSTICAS ──────────────────────────────── */}
      {tab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart2 size={16} /> Por tipo de membresía</p>
            <div className="space-y-3">
              {types.map(t => {
                const count = members.filter(m => m.membership_type_id === t.id && m.status === 'ACTIVE').length;
                const total = members.filter(m => m.status === 'ACTIVE').length || 1;
                return (
                  <div key={t.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">{t.name}</span>
                      <span className="font-bold text-slate-800">{count} socios</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(count/total)*100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-bold text-slate-700 mb-4 flex items-center gap-2"><AlertTriangle size={16} /> Próximos a vencer</p>
            <div className="space-y-2">
              {members.filter(m => m.status === 'ACTIVE' && daysLeft(m.end_date) <= 14)
                .sort((a, b) => daysLeft(a.end_date) - daysLeft(b.end_date))
                .slice(0, 8)
                .map(m => {
                  const days = daysLeft(m.end_date);
                  return (
                    <div key={m.id} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                      <span className="text-slate-700">{m.full_name}</span>
                      <span className={`font-bold ${days <= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                        {days <= 0 ? 'Hoy' : `${days}d`}
                      </span>
                    </div>
                  );
                })}
              {members.filter(m => m.status === 'ACTIVE' && daysLeft(m.end_date) <= 14).length === 0 && (
                <p className="text-slate-400 text-sm text-center py-4">Sin vencimientos en los próximos 14 días</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODALS ══════════════════════════════════════════ */}

      {/* Modal nuevo/editar socio */}
      {showMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">{editMember ? 'Editar socio' : 'Nuevo socio'}</h3>
              <button onClick={() => setShowMember(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Nombre completo *</label>
                  <input className={inputCls} value={memberForm.full_name} onChange={e => setMemberForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ana Sofía Mora" />
                </div>
                <div>
                  <label className={labelCls}>Cédula</label>
                  <input className={inputCls} value={memberForm.document} onChange={e => setMemberForm(f => ({ ...f, document: e.target.value }))} placeholder="1.020.456.789" />
                </div>
                <div>
                  <label className={labelCls}>Teléfono / WhatsApp</label>
                  <input className={inputCls} value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} placeholder="311 234 5678" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" className={inputCls} value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} placeholder="ana@email.com" />
                </div>
                <div>
                  <label className={labelCls}>Fecha de inicio</label>
                  <input type="date" className={inputCls} value={memberForm.start_date} onChange={e => setMemberForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Tipo de membresía *</label>
                  <select className={inputCls} value={memberForm.membership_type_id} onChange={e => setMemberForm(f => ({ ...f, membership_type_id: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {types.map(t => (
                      <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)} / {t.duration_days} días</option>
                    ))}
                  </select>
                  {types.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Primero crea los tipos de membresía en la pestaña 🏷️ Membresías</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notas</label>
                  <input className={inputCls} value={memberForm.notes} onChange={e => setMemberForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observaciones opcionales..." />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowMember(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancelar</button>
              <button onClick={saveMember} disabled={saving} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editMember ? 'Guardar' : 'Registrar socio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo tipo de membresía */}
      {showType && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">{editType ? 'Editar tipo' : 'Nuevo tipo de membresía'}</h3>
              <button onClick={() => setShowType(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input className={inputCls} value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Mensual full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Duración (días) *</label>
                  <input type="number" className={inputCls} value={typeForm.duration_days} onChange={e => setTypeForm(f => ({ ...f, duration_days: e.target.value }))} placeholder="30" />
                </div>
                <div>
                  <label className={labelCls}>Precio *</label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input type="number" className={inputCls + ' pl-8'} value={typeForm.price} onChange={e => setTypeForm(f => ({ ...f, price: e.target.value }))} placeholder="120000" />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Descripción</label>
                <input className={inputCls} value={typeForm.description} onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} placeholder="Acceso completo, todas las clases..." />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowType(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button onClick={saveType} disabled={saving} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editType ? 'Guardar' : 'Crear tipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva clase */}
      {showClass && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">{editClass ? 'Editar clase' : 'Nueva clase'}</h3>
              <button onClick={() => setShowClass(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Nombre de la clase *</label>
                  <input className={inputCls} value={classForm.name} onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))} placeholder="Spinning, Yoga, CrossFit..." />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Instructor *</label>
                  <input className={inputCls} value={classForm.instructor} onChange={e => setClassForm(f => ({ ...f, instructor: e.target.value }))} placeholder="Prof. Ramírez" />
                </div>
                <div>
                  <label className={labelCls}>Día</label>
                  <select className={inputCls} value={classForm.day_of_week} onChange={e => setClassForm(f => ({ ...f, day_of_week: e.target.value }))}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Hora inicio</label>
                  <input type="time" className={inputCls} value={classForm.start_time} onChange={e => setClassForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Duración (min)</label>
                  <input type="number" className={inputCls} value={classForm.duration_min} onChange={e => setClassForm(f => ({ ...f, duration_min: e.target.value }))} placeholder="60" />
                </div>
                <div>
                  <label className={labelCls}>Sala / Espacio</label>
                  <input className={inputCls} value={classForm.room} onChange={e => setClassForm(f => ({ ...f, room: e.target.value }))} placeholder="Sala A" />
                </div>
                <div>
                  <label className={labelCls}>Cupos máximos</label>
                  <input type="number" className={inputCls} value={classForm.max_capacity} onChange={e => setClassForm(f => ({ ...f, max_capacity: e.target.value }))} placeholder="20" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowClass(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button onClick={saveClass} disabled={saving} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editClass ? 'Guardar' : 'Crear clase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gimnasio;