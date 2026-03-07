import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { toast } from 'react-hot-toast';

const Branches: React.FC = () => {
  const { company } = useDatabase();
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', nit: '', email: '', phone: '', adminEmail: '', adminPassword: '' });
  const [editForm, setEditForm] = useState({ name: '', nit: '', email: '', phone: '', subscription_status: 'ACTIVE' });

  const isPro = company?.subscription_plan === 'PRO';
  const MAX_BRANCHES = 3;

  const load = async () => {
    if (!company?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('negocio_padre_id', company.id)
      .order('created_at', { ascending: false });
    setBranches(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [company?.id]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  const fe = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditForm(p => ({ ...p, [k]: e.target.value }));

  const handleCreate = async () => {
    if (branches.length >= MAX_BRANCHES) {
      toast.error('Has alcanzado el límite máximo de 3 sucursales permitido por el plan PRO.');
      return;
    }
    if (!form.name || !form.nit || !form.adminEmail || !form.adminPassword) {
      toast.error('Completa todos los campos obligatorios'); return;
    }
    setCreating(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.adminEmail, password: form.adminPassword,
        options: { data: { full_name: form.name } }
      });
      if (authError) throw authError;

      const { data: newCompany, error: companyError } = await supabase.from('companies').insert({
        name: form.name, nit: form.nit, email: form.email, phone: form.phone,
        subscription_plan: 'BASIC',
        subscription_status: 'ACTIVE',
        tipo: 'sucursal',
        negocio_padre_id: company!.id,
        config: { tax_rate: 19, currency_symbol: '$', invoice_prefix: 'POS' }
      }).select().single();
      if (companyError) throw companyError;

      if (authData.user) {
        await supabase.from('profiles').upsert({
          id: authData.user.id, company_id: newCompany.id,
          role: 'ADMIN', full_name: form.name, email: form.adminEmail, is_active: true
        });
        const { data: branch } = await supabase.from('branches')
          .insert({ company_id: newCompany.id, name: 'Sede Principal', is_active: true }).select().single();
        if (branch) await supabase.from('profiles').update({ branch_id: branch.id }).eq('id', authData.user.id);
      }

      toast.success(`Sucursal "${form.name}" creada exitosamente`);
      setShowCreate(false);
      setForm({ name: '', nit: '', email: '', phone: '', adminEmail: '', adminPassword: '' });
      load();
    } catch (err: any) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const handleEdit = async () => {
    if (!selected) return;
    const { error } = await supabase.from('companies').update({
      name: editForm.name, nit: editForm.nit,
      email: editForm.email, phone: editForm.phone,
      subscription_status: editForm.subscription_status
    }).eq('id', selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Sucursal actualizada');
    setShowEdit(false);
    load();
  };

  const handleSuspend = async (id: string, current: string) => {
    const newStatus = current === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await supabase.from('companies').update({ subscription_status: newStatus }).eq('id', id);
    toast.success(newStatus === 'ACTIVE' ? 'Sucursal activada' : 'Sucursal suspendida');
    load();
  };

  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    ACTIVE:   { bg: '#dcfce7', color: '#16a34a', label: 'Activo' },
    INACTIVE: { bg: '#fee2e2', color: '#dc2626', label: 'Inactivo' },
    PENDING:  { bg: '#fef9c3', color: '#ca8a04', label: 'Pendiente' },
    PAST_DUE: { bg: '#ffedd5', color: '#ea580c', label: 'Vencido' },
  };

  const filtered = branches
    .filter(b => filter === 'ALL' || b.subscription_status === filter)
    .filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()) || (b.nit || '').includes(search));

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 5 };

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 text-4xl">🏪</div>
        <h2 className="text-2xl font-bold text-slate-800 mb-3">Función exclusiva del Plan PRO</h2>
        <p className="text-slate-500 mb-2 max-w-md">Con el Plan PRO puedes crear hasta 3 sucursales adicionales, cada una con su propio panel, inventario y punto de venta.</p>
        <p className="text-slate-400 text-sm mb-6">Contacta al administrador para actualizar tu plan.</p>
        <a href="https://wa.me/573204884943?text=Hola, quiero actualizar mi plan a PRO en POSmaster" target="_blank" rel="noreferrer"
          className="flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-600 transition-colors">
          💬 Actualizar a PRO
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Mis Sucursales</h1>
          <p className="text-slate-500 text-sm">{branches.length}/{MAX_BRANCHES} sucursales creadas — Plan PRO</p>
        </div>
        <button onClick={() => {
          if (branches.length >= MAX_BRANCHES) { toast.error('Has alcanzado el límite máximo de 3 sucursales.'); return; }
          setShowCreate(true);
        }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
          + Nueva Sucursal
        </button>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-slate-600">Sucursales usadas</span>
          <span className="text-sm font-bold text-slate-800">{branches.length} / {MAX_BRANCHES}</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3">
          <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${(branches.length / MAX_BRANCHES) * 100}%`, background: branches.length >= MAX_BRANCHES ? '#ef4444' : branches.length === 2 ? '#f97316' : '#3b82f6' }} />
        </div>
        {branches.length >= MAX_BRANCHES && <p className="text-xs text-red-500 font-semibold mt-2">Has alcanzado el límite máximo del plan PRO.</p>}
      </div>

      {/* Filtros + buscador */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {['ALL', 'ACTIVE', 'PENDING', 'PAST_DUE', 'INACTIVE'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-all ${filter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
              {s === 'ALL' ? 'Todos' : s === 'ACTIVE' ? 'Activos' : s === 'PENDING' ? 'Pendientes' : s === 'PAST_DUE' ? 'Vencidos' : 'Inactivos'}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar sucursal..."
          className="px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none w-52" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Negocio', 'NIT', 'Email', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No hay sucursales registradas</td></tr>
              ) : filtered.map(b => {
                const st = statusColors[b.subscription_status] || statusColors['INACTIVE'];
                return (
                  <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 font-bold text-slate-800">{b.name}</td>
                    <td className="px-5 py-4 text-slate-500 font-mono text-xs">{b.nit}</td>
                    <td className="px-5 py-4 text-slate-500 text-xs">{b.email || '—'}</td>
                    <td className="px-5 py-4">
                      <span style={{ background: st.bg, color: st.color }} className="px-2.5 py-1 rounded-full text-xs font-bold">{st.label}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => { setSelected(b); setEditForm({ name: b.name, nit: b.nit, email: b.email || '', phone: b.phone || '', subscription_status: b.subscription_status }); setShowEdit(true); }}
                          className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">✏️ Editar</button>
                        <button onClick={() => handleSuspend(b.id, b.subscription_status)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${b.subscription_status === 'ACTIVE' ? 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100' : 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100'}`}>
                          {b.subscription_status === 'ACTIVE' ? 'Suspender' : '✓ Activar'}
                        </button>
                        <a href={`https://wa.me/573204884943?text=Soporte para sucursal ${b.name}`} target="_blank" rel="noreferrer"
                          className="px-3 py-1.5 text-xs font-bold text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">💬</a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Nueva Sucursal</h3>
                <p className="text-xs text-slate-400">Plan BASIC — {MAX_BRANCHES - branches.length} disponibles</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {[{ label: 'Nombre *', key: 'name', placeholder: 'Sucursal Norte' }, { label: 'NIT *', key: 'nit', placeholder: '900123456-7' }, { label: 'Email', key: 'email', placeholder: 'sucursal@email.com' }, { label: 'Teléfono', key: 'phone', placeholder: '300 123 4567' }].map(field => (
                <div key={field.key}><label style={labelStyle}>{field.label}</label><input value={(form as any)[field.key]} onChange={f(field.key)} placeholder={field.placeholder} style={inputStyle} /></div>
              ))}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-400 uppercase mb-3">Credenciales del Administrador</p>
                <div className="space-y-3">
                  <div><label style={labelStyle}>Email Admin *</label><input type="email" value={form.adminEmail} onChange={f('adminEmail')} placeholder="admin@sucursal.com" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Contraseña *</label><input type="password" value={form.adminPassword} onChange={f('adminPassword')} placeholder="Mínimo 6 caracteres" style={inputStyle} /></div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50">Cancelar</button>
                <button onClick={handleCreate} disabled={creating} className="flex-2 flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
                  {creating ? 'Creando...' : 'Crear Sucursal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {showEdit && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Editar: {selected.name}</h3>
              <button onClick={() => setShowEdit(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {[{ label: 'Nombre', key: 'name' }, { label: 'NIT', key: 'nit' }, { label: 'Email', key: 'email' }, { label: 'Teléfono', key: 'phone' }].map(field => (
                <div key={field.key}><label style={labelStyle}>{field.label}</label><input value={(editForm as any)[field.key]} onChange={fe(field.key)} style={inputStyle} /></div>
              ))}
              <div><label style={labelStyle}>Estado</label>
                <select value={editForm.subscription_status} onChange={fe('subscription_status')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                  <option value="PENDING">Pendiente</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowEdit(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50">Cancelar</button>
                <button onClick={handleEdit} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Branches;