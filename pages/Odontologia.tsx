import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, ChevronDown, Search, User, Users, Building2,
  Calendar, FileText, Stethoscope, DollarSign, CreditCard,
  CheckCircle, Clock, XCircle, Edit2, Trash2, Eye,
  Phone, Mail, MapPin, Activity, Award, BarChart2, Star
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useCompany } from '../hooks/useCompany';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';

// ─── TIPOS ───────────────────────────────────────────────────────────────────

type PersonalType = 'ODONTOLOGO' | 'AUXILIAR' | 'HIGIENISTA' | 'RECEPCION';
type PersonalStatus = 'ACTIVO' | 'INACTIVO';
type ConsultorioStatus = 'DISPONIBLE' | 'OCUPADO' | 'INACTIVO';
type CitaStatus = 'PROGRAMADA' | 'ATENDIDA' | 'CANCELADA';
type PlanDuracion = 'MENSUAL' | 'ANUAL';
type FacturaStatus = 'PAGADA' | 'PENDIENTE' | 'ABONO';

interface Personal {
  id?: string;
  company_id?: string;
  nombre: string;
  documento: string;
  tipo: PersonalType;
  especialidad: string;
  telefono: string;
  correo: string;
  estado: PersonalStatus;
}

interface Consultorio {
  id?: string;
  company_id?: string;
  nombre: string;
  codigo: string;
  odontologo_id: string;
  auxiliar_id: string;
  estado: ConsultorioStatus;
  observaciones: string;
}

interface Paciente {
  id?: string;
  company_id?: string;
  nombre: string;
  documento: string;
  fecha_nacimiento: string;
  telefono: string;
  correo: string;
  direccion: string;
  eps: string;
  plan_id: string;
  observaciones: string;
}

interface Cita {
  id?: string;
  company_id?: string;
  paciente_id: string;
  odontologo_id: string;
  auxiliar_id: string;
  consultorio_id: string;
  servicio_id: string;
  fecha: string;
  hora: string;
  estado: CitaStatus;
  notas: string;
}

interface HistoriaClinica {
  id?: string;
  company_id?: string;
  paciente_id: string;
  odontologo_id: string;
  consultorio_id: string;
  fecha: string;
  motivo: string;
  diagnostico: string;
  procedimiento: string;
  recomendaciones: string;
  observaciones: string;
}

interface Servicio {
  id?: string;
  company_id?: string;
  nombre: string;
  precio: number;
  descripcion: string;
  activo: boolean;
}

interface Plan {
  id?: string;
  company_id?: string;
  nombre: string;
  duracion: PlanDuracion;
  precio: number;
  servicios_incluidos: string;
  descuento: number;
  estado: 'ACTIVO' | 'INACTIVO';
}

interface FacturaOdonto {
  id?: string;
  company_id?: string;
  paciente_id: string;
  servicio_id: string;
  total: number;
  abonado: number;
  saldo: number;
  estado: FacturaStatus;
  fecha: string;
  notas: string;
}

// Estado dental para el odontograma
interface DienteEstado {
  numero: number;
  estado: '' | 'caries' | 'resina' | 'corona' | 'implante' | 'extraccion' | 'tratamiento';
  notas: string;
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const PERSONAL_LABELS: Record<PersonalType, string> = {
  ODONTOLOGO: 'Odontólogo',
  AUXILIAR: 'Auxiliar',
  HIGIENISTA: 'Higienista',
  RECEPCION: 'Recepción',
};

const CITA_COLORS: Record<CitaStatus, string> = {
  PROGRAMADA: 'bg-blue-100 text-blue-700',
  ATENDIDA:   'bg-green-100 text-green-700',
  CANCELADA:  'bg-red-100 text-red-600',
};

const CITA_LABELS: Record<CitaStatus, string> = {
  PROGRAMADA: 'Programada',
  ATENDIDA:   'Atendida',
  CANCELADA:  'Cancelada',
};

const CONSULTORIO_COLORS: Record<ConsultorioStatus, string> = {
  DISPONIBLE: 'bg-green-100 text-green-700',
  OCUPADO:    'bg-orange-100 text-orange-700',
  INACTIVO:   'bg-slate-100 text-slate-500',
};

const DIENTES_SUPERIORES = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28];
const DIENTES_INFERIORES = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38];

const ESTADO_DIENTE_COLORS: Record<string, string> = {
  '': '#e2e8f0',
  caries: '#fca5a5',
  resina: '#bfdbfe',
  corona: '#fde68a',
  implante: '#a7f3d0',
  extraccion: '#cbd5e1',
  tratamiento: '#e9d5ff',
};

const ESTADO_DIENTE_LABELS: Record<string, string> = {
  '': 'Sano',
  caries: 'Caries',
  resina: 'Resina',
  corona: 'Corona',
  implante: 'Implante',
  extraccion: 'Extracción',
  tratamiento: 'En tratamiento',
};

type Tab = 'dashboard' | 'pacientes' | 'personal' | 'consultorios' |
           'agenda' | 'historia' | 'odontograma' | 'servicios' |
           'planes' | 'facturacion' | 'reportes';

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const Odontologia: React.FC = () => {
  const { companyId } = useCompany();
  const { formatMoney } = useCurrency();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Estado global compartido
  const [personal,     setPersonal]     = useState<Personal[]>([]);
  const [consultorios, setConsultorios] = useState<Consultorio[]>([]);
  const [pacientes,    setPacientes]    = useState<Paciente[]>([]);
  const [citas,        setCitas]        = useState<Cita[]>([]);
  const [historias,    setHistorias]    = useState<HistoriaClinica[]>([]);
  const [servicios,    setServicios]    = useState<Servicio[]>([]);
  const [planes,       setPlanes]       = useState<Plan[]>([]);
  const [facturas,     setFacturas]     = useState<FacturaOdonto[]>([]);
  const [loading,      setLoading]      = useState(false);

  // Cargar todo desde Supabase (con fallback a mock si las tablas no existen aún)
  const loadAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const run = async (table: string, setter: (d: any[]) => void) => {
        const { data } = await supabase.from(table).select('*').eq('company_id', companyId);
        if (data) setter(data);
      };
      await Promise.all([
        run('odonto_personal',    setPersonal),
        run('odonto_consultorios',setConsultorios),
        run('odonto_pacientes',   setPacientes),
        run('odonto_citas',       setCitas),
        run('odonto_historias',   setHistorias),
        run('odonto_servicios',   setServicios),
        run('odonto_planes',      setPlanes),
        run('odonto_facturas',    setFacturas),
      ]);
    } catch {
      // Las tablas aún no existen — trabajar con estado local
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Helper para guardar en Supabase o solo en estado local si la tabla no existe
  const saveToSupabase = async (table: string, record: any, setter: (fn: (prev: any[]) => any[]) => void) => {
    const payload = { ...record, company_id: companyId };
    delete payload.id;
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) {
      // Fallback: guardar solo en estado local con id temporal
      const local = { ...payload, id: `local-${Date.now()}` };
      setter(prev => [...prev, local]);
      return local;
    }
    setter(prev => [...prev, data]);
    return data;
  };

  const updateInSupabase = async (table: string, id: string, updates: any, setter: (fn: (prev: any[]) => any[]) => void) => {
    const { error } = await supabase.from(table).update(updates).eq('id', id);
    if (error) {
      setter(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
      return;
    }
    setter(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteFromSupabase = async (table: string, id: string, setter: (fn: (prev: any[]) => any[]) => void) => {
    await supabase.from(table).delete().eq('id', id);
    setter(prev => prev.filter(r => r.id !== id));
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard',    label: 'Dashboard',      icon: <BarChart2 size={16} /> },
    { id: 'pacientes',    label: 'Pacientes',       icon: <User size={16} /> },
    { id: 'personal',     label: 'Personal',        icon: <Users size={16} /> },
    { id: 'consultorios', label: 'Consultorios',    icon: <Building2 size={16} /> },
    { id: 'agenda',       label: 'Agenda / Citas',  icon: <Calendar size={16} /> },
    { id: 'historia',     label: 'Historia Clínica',icon: <FileText size={16} /> },
    { id: 'odontograma',  label: 'Odontograma',     icon: <Activity size={16} /> },
    { id: 'servicios',    label: 'Servicios',        icon: <Stethoscope size={16} /> },
    { id: 'planes',       label: 'Planes',           icon: <Award size={16} /> },
    { id: 'facturacion',  label: 'Facturación',      icon: <DollarSign size={16} /> },
    { id: 'reportes',     label: 'Reportes',         icon: <BarChart2 size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">🦷 Módulo Odontológico</h2>
          <p className="text-slate-500 text-sm">Gestión integral de clínica dental</p>
        </div>
        <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
          {pacientes.length} pacientes · {citas.filter(c => c.estado === 'PROGRAMADA').length} citas hoy
        </div>
      </div>

      {/* Tabs de navegación */}
      <div className="flex gap-1 overflow-x-auto pb-1 bg-white border border-slate-200 rounded-xl p-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all
              ${activeTab === t.id
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Contenido de cada tab */}
      {loading && <div className="py-12 text-center text-slate-400">Cargando...</div>}

      {!loading && activeTab === 'dashboard' && (
        <DashboardTab
          pacientes={pacientes} citas={citas} personal={personal}
          consultorios={consultorios} facturas={facturas} formatMoney={formatMoney}
        />
      )}
      {!loading && activeTab === 'pacientes' && (
        <PacientesTab
          pacientes={pacientes} planes={planes} companyId={companyId!}
          onAdd={p => saveToSupabase('odonto_pacientes', p, setPacientes).then(() => toast.success('Paciente guardado'))}
          onUpdate={(id, u) => updateInSupabase('odonto_pacientes', id, u, setPacientes).then(() => toast.success('Actualizado'))}
          onDelete={id => deleteFromSupabase('odonto_pacientes', id, setPacientes).then(() => toast.success('Eliminado'))}
        />
      )}
      {!loading && activeTab === 'personal' && (
        <PersonalTab
          personal={personal} companyId={companyId!}
          onAdd={p => saveToSupabase('odonto_personal', p, setPersonal).then(() => toast.success('Personal guardado'))}
          onUpdate={(id, u) => updateInSupabase('odonto_personal', id, u, setPersonal).then(() => toast.success('Actualizado'))}
          onDelete={id => deleteFromSupabase('odonto_personal', id, setPersonal).then(() => toast.success('Eliminado'))}
        />
      )}
      {!loading && activeTab === 'consultorios' && (
        <ConsultoriosTab
          consultorios={consultorios} personal={personal} companyId={companyId!}
          onAdd={c => saveToSupabase('odonto_consultorios', c, setConsultorios).then(() => toast.success('Consultorio guardado'))}
          onUpdate={(id, u) => updateInSupabase('odonto_consultorios', id, u, setConsultorios).then(() => toast.success('Actualizado'))}
          onDelete={id => deleteFromSupabase('odonto_consultorios', id, setConsultorios).then(() => toast.success('Eliminado'))}
        />
      )}
      {!loading && activeTab === 'agenda' && (
        <AgendaTab
          citas={citas} pacientes={pacientes} personal={personal}
          consultorios={consultorios} servicios={servicios} companyId={companyId!}
          onAdd={c => saveToSupabase('odonto_citas', c, setCitas).then(() => toast.success('Cita agendada'))}
          onUpdate={(id, u) => updateInSupabase('odonto_citas', id, u, setCitas).then(() => toast.success('Actualizado'))}
          onDelete={id => deleteFromSupabase('odonto_citas', id, setCitas).then(() => toast.success('Cita eliminada'))}
        />
      )}
      {!loading && activeTab === 'historia' && (
        <HistoriaTab
          historias={historias} pacientes={pacientes} personal={personal}
          consultorios={consultorios} companyId={companyId!}
          onAdd={h => saveToSupabase('odonto_historias', h, setHistorias).then(() => toast.success('Historia guardada'))}
        />
      )}
      {!loading && activeTab === 'odontograma' && (
        <OdontogramaTab pacientes={pacientes} companyId={companyId!} />
      )}
      {!loading && activeTab === 'servicios' && (
        <ServiciosTab
          servicios={servicios} companyId={companyId!} formatMoney={formatMoney}
          onAdd={s => saveToSupabase('odonto_servicios', s, setServicios).then(() => toast.success('Servicio guardado'))}
          onUpdate={(id, u) => updateInSupabase('odonto_servicios', id, u, setServicios).then(() => toast.success('Actualizado'))}
          onDelete={id => deleteFromSupabase('odonto_servicios', id, setServicios).then(() => toast.success('Eliminado'))}
        />
      )}
      {!loading && activeTab === 'planes' && (
        <PlanesTab
          planes={planes} companyId={companyId!} formatMoney={formatMoney}
          onAdd={p => saveToSupabase('odonto_planes', p, setPlanes).then(() => toast.success('Plan guardado'))}
          onUpdate={(id, u) => updateInSupabase('odonto_planes', id, u, setPlanes).then(() => toast.success('Actualizado'))}
          onDelete={id => deleteFromSupabase('odonto_planes', id, setPlanes).then(() => toast.success('Eliminado'))}
        />
      )}
      {!loading && activeTab === 'facturacion' && (
        <FacturacionTab
          facturas={facturas} pacientes={pacientes} servicios={servicios}
          companyId={companyId!} formatMoney={formatMoney}
          onAdd={f => saveToSupabase('odonto_facturas', f, setFacturas).then(() => toast.success('Factura creada'))}
          onAbono={(id, monto) => {
            const f = facturas.find(x => x.id === id);
            if (!f) return;
            const abonado = f.abonado + monto;
            const saldo = f.total - abonado;
            const estado: FacturaStatus = saldo <= 0 ? 'PAGADA' : 'ABONO';
            updateInSupabase('odonto_facturas', id, { abonado, saldo, estado }, setFacturas)
              .then(() => toast.success('Abono registrado'));
          }}
          onDelete={id => deleteFromSupabase('odonto_facturas', id, setFacturas).then(() => toast.success('Eliminado'))}
        />
      )}
      {!loading && activeTab === 'reportes' && (
        <ReportesTab
          pacientes={pacientes} citas={citas} personal={personal}
          facturas={facturas} servicios={servicios} planes={planes}
          formatMoney={formatMoney}
        />
      )}
    </div>
  );
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

const DashboardTab: React.FC<{
  pacientes: Paciente[]; citas: Cita[]; personal: Personal[];
  consultorios: Consultorio[]; facturas: FacturaOdonto[]; formatMoney: (n:number)=>string;
}> = ({ pacientes, citas, personal, consultorios, facturas, formatMoney }) => {
  const hoy = new Date().toISOString().split('T')[0];
  const citasHoy = citas.filter(c => c.fecha === hoy);
  const totalFacturado = facturas.reduce((s, f) => s + f.total, 0);
  const totalPendiente = facturas.filter(f => f.estado !== 'PAGADA').reduce((s, f) => s + f.saldo, 0);
  const odontologos = personal.filter(p => p.tipo === 'ODONTOLOGO' && p.estado === 'ACTIVO');

  const stats = [
    { label: 'Total Pacientes',    value: pacientes.length,                    icon: <User size={20} />,        color: 'teal'   },
    { label: 'Citas Hoy',          value: citasHoy.length,                     icon: <Calendar size={20} />,    color: 'blue'   },
    { label: 'Total Facturado',    value: formatMoney(totalFacturado),          icon: <DollarSign size={20} />,  color: 'green'  },
    { label: 'Saldo Pendiente',    value: formatMoney(totalPendiente),          icon: <CreditCard size={20} />,  color: 'orange' },
    { label: 'Odontólogos activos',value: odontologos.length,                  icon: <Stethoscope size={20} />, color: 'purple' },
    { label: 'Consultorios',       value: consultorios.filter(c=>c.estado!=='INACTIVO').length, icon: <Building2 size={20} />, color: 'slate' },
  ];

  const colorMap: Record<string, string> = {
    teal:   'bg-teal-100 text-teal-600',
    blue:   'bg-blue-100 text-blue-600',
    green:  'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
    slate:  'bg-slate-100 text-slate-600',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-slate-500 font-medium">{s.label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{s.value}</p>
              </div>
              <div className={`p-2.5 rounded-lg ${colorMap[s.color]}`}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Próximas citas */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-700">📅 Próximas citas</h3>
            <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-full">{citasHoy.length} hoy</span>
          </div>
          <div className="divide-y divide-slate-50">
            {citas.filter(c=>c.estado==='PROGRAMADA').slice(0,5).map(c => (
              <div key={c.id} className="px-5 py-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{c.fecha} {c.hora}</p>
                  <p className="text-xs text-slate-400">Paciente ID: {c.paciente_id?.slice(0,8) || '—'}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CITA_COLORS['PROGRAMADA']}`}>
                  {CITA_LABELS['PROGRAMADA']}
                </span>
              </div>
            ))}
            {citas.filter(c=>c.estado==='PROGRAMADA').length === 0 && (
              <p className="px-5 py-8 text-center text-slate-400 text-sm">No hay citas programadas</p>
            )}
          </div>
        </div>

        {/* Consultorios */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-700">🏥 Estado de Consultorios</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {consultorios.map(c => (
              <div key={c.id} className="px-5 py-3 flex justify-between items-center">
                <p className="text-sm font-semibold text-slate-800">{c.nombre}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONSULTORIO_COLORS[c.estado]}`}>
                  {c.estado}
                </span>
              </div>
            ))}
            {consultorios.length === 0 && (
              <p className="px-5 py-8 text-center text-slate-400 text-sm">Sin consultorios registrados</p>
            )}
          </div>
        </div>
      </div>

      {/* Facturas pendientes */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-700">💰 Facturas con saldo pendiente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Paciente ID','Fecha','Total','Abonado','Saldo','Estado'].map(h =>
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {facturas.filter(f=>f.estado!=='PAGADA').slice(0,5).map(f => (
                <tr key={f.id}>
                  <td className="px-4 py-3 text-slate-700 font-mono text-xs">{f.paciente_id?.slice(0,8) || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{f.fecha}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(f.total)}</td>
                  <td className="px-4 py-3 text-green-600">{formatMoney(f.abonado)}</td>
                  <td className="px-4 py-3 text-orange-600 font-semibold">{formatMoney(f.saldo)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${f.estado==='ABONO' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-50 text-red-600'}`}>
                      {f.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {facturas.filter(f=>f.estado!=='PAGADA').length === 0 && (
            <p className="px-5 py-8 text-center text-slate-400 text-sm">Sin facturas pendientes ✅</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── PACIENTES ────────────────────────────────────────────────────────────────

const EMPTY_PACIENTE: Paciente = {
  nombre:'', documento:'', fecha_nacimiento:'', telefono:'',
  correo:'', direccion:'', eps:'', plan_id:'', observaciones:''
};

const PacientesTab: React.FC<{
  pacientes: Paciente[]; planes: Plan[]; companyId: string;
  onAdd:(p:Paciente)=>void; onUpdate:(id:string,u:Partial<Paciente>)=>void; onDelete:(id:string)=>void;
}> = ({ pacientes, planes, onAdd, onUpdate, onDelete }) => {
  const [search, setSearch] = useState('');
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState<Paciente>(EMPTY_PACIENTE);
  const [editing, setEditing] = useState<string | null>(null);

  const filtered = pacientes.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.documento.includes(search)
  );

  const f = (k: keyof Paciente) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.nombre || !form.documento) { toast.error('Nombre y documento son requeridos'); return; }
    if (editing) { onUpdate(editing, form); }
    else         { onAdd(form); }
    setModal(false); setEditing(null); setForm(EMPTY_PACIENTE);
  };

  const openEdit = (p: Paciente) => {
    setForm(p); setEditing(p.id!); setModal(true);
  };

  const today = new Date();
  const calcAge = (dob: string) => {
    if (!dob) return '—';
    const d = new Date(dob);
    return Math.floor((today.getTime() - d.getTime()) / 31557600000) + ' años';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o documento..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-72 outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <button onClick={() => { setForm(EMPTY_PACIENTE); setEditing(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold">
          <Plus size={15} /> Nuevo Paciente
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400"><User size={36} className="mx-auto mb-3 opacity-30" /><p>No hay pacientes registrados</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>{['Nombre','Documento','Edad','Teléfono','EPS/Seguro','Plan','Acciones'].map(h =>
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
              )}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-800">{p.nombre}</p>
                    {p.correo && <p className="text-xs text-slate-400">{p.correo}</p>}
                  </td>
                  <td className="px-5 py-3 font-mono text-slate-700">{p.documento}</td>
                  <td className="px-5 py-3 text-slate-600">{calcAge(p.fecha_nacimiento)}</td>
                  <td className="px-5 py-3 text-slate-600">{p.telefono || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{p.eps || '—'}</td>
                  <td className="px-5 py-3">
                    {p.plan_id ? (
                      <span className="text-xs bg-teal-50 text-teal-700 font-semibold px-2 py-0.5 rounded-full">
                        {planes.find(pl => pl.id === p.plan_id)?.nombre || 'Plan activo'}
                      </span>
                    ) : <span className="text-xs text-slate-400">Sin plan</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Edit2 size={13} /></button>
                      <button onClick={() => onDelete(p.id!)} className="p-1.5 hover:bg-red-50 rounded text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Paciente' : 'Nuevo Paciente'} onClose={() => setModal(false)} onSave={handleSave}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre completo *" value={form.nombre} onChange={f('nombre')} />
            <Field label="Documento *" value={form.documento} onChange={f('documento')} />
            <Field label="Fecha nacimiento" type="date" value={form.fecha_nacimiento} onChange={f('fecha_nacimiento')} />
            <Field label="Teléfono" value={form.telefono} onChange={f('telefono')} />
            <Field label="Correo" value={form.correo} onChange={f('correo')} />
            <Field label="Dirección" value={form.direccion} onChange={f('direccion')} />
            <Field label="EPS / Seguro" value={form.eps} onChange={f('eps')} />
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Plan / Membresía</label>
              <select value={form.plan_id} onChange={f('plan_id')} className={inputCls}>
                <option value="">Sin plan</option>
                {planes.filter(pl => pl.estado === 'ACTIVO').map(pl => (
                  <option key={pl.id} value={pl.id}>{pl.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones</label>
              <textarea value={form.observaciones} onChange={f('observaciones')} rows={2}
                className={`${inputCls} resize-none`} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── PERSONAL ─────────────────────────────────────────────────────────────────

const EMPTY_PERSONAL: Personal = {
  nombre:'', documento:'', tipo:'ODONTOLOGO', especialidad:'', telefono:'', correo:'', estado:'ACTIVO'
};

const PersonalTab: React.FC<{
  personal: Personal[]; companyId: string;
  onAdd:(p:Personal)=>void; onUpdate:(id:string,u:Partial<Personal>)=>void; onDelete:(id:string)=>void;
}> = ({ personal, onAdd, onUpdate, onDelete }) => {
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState<Personal>(EMPTY_PERSONAL);
  const [editing, setEditing] = useState<string|null>(null);

  const f = (k: keyof Personal) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.nombre || !form.documento) { toast.error('Nombre y documento requeridos'); return; }
    editing ? onUpdate(editing, form) : onAdd(form);
    setModal(false); setEditing(null); setForm(EMPTY_PERSONAL);
  };

  const byType = (tipo: PersonalType) => personal.filter(p => p.tipo === tipo);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          {(Object.keys(PERSONAL_LABELS) as PersonalType[]).map(t => (
            <div key={t} className="bg-white border border-slate-100 rounded-lg px-4 py-2 text-center shadow-sm">
              <p className="text-xs text-slate-400">{PERSONAL_LABELS[t]}</p>
              <p className="text-xl font-bold text-slate-800">{byType(t).length}</p>
            </div>
          ))}
        </div>
        <button onClick={() => { setForm(EMPTY_PERSONAL); setEditing(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold">
          <Plus size={15} /> Nuevo Personal
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {personal.length === 0 ? (
          <div className="py-12 text-center text-slate-400"><Users size={36} className="mx-auto mb-3 opacity-30"/><p>Sin personal registrado</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>{['Nombre','Documento','Tipo','Especialidad','Teléfono','Estado','Acciones'].map(h =>
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
              )}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {personal.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-800">{p.nombre}</td>
                  <td className="px-5 py-3 font-mono text-slate-600">{p.documento}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs bg-teal-50 text-teal-700 font-semibold px-2 py-0.5 rounded-full">{PERSONAL_LABELS[p.tipo]}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{p.especialidad || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{p.telefono || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.estado==='ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => { setForm(p); setEditing(p.id!); setModal(true); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Edit2 size={13}/></button>
                      <button onClick={() => onDelete(p.id!)} className="p-1.5 hover:bg-red-50 rounded text-red-400"><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Personal' : 'Nuevo Personal'} onClose={() => setModal(false)} onSave={handleSave}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre completo *" value={form.nombre} onChange={f('nombre')} />
            <Field label="Documento *" value={form.documento} onChange={f('documento')} />
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo *</label>
              <select value={form.tipo} onChange={f('tipo')} className={inputCls}>
                {(Object.keys(PERSONAL_LABELS) as PersonalType[]).map(t =>
                  <option key={t} value={t}>{PERSONAL_LABELS[t]}</option>
                )}
              </select>
            </div>
            <Field label="Especialidad" value={form.especialidad} onChange={f('especialidad')} placeholder="General, Ortodoncia..." />
            <Field label="Teléfono" value={form.telefono} onChange={f('telefono')} />
            <Field label="Correo" value={form.correo} onChange={f('correo')} />
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
              <select value={form.estado} onChange={f('estado')} className={inputCls}>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── CONSULTORIOS ─────────────────────────────────────────────────────────────

const EMPTY_CONSULTORIO: Consultorio = {
  nombre:'', codigo:'', odontologo_id:'', auxiliar_id:'', estado:'DISPONIBLE', observaciones:''
};

const ConsultoriosTab: React.FC<{
  consultorios: Consultorio[]; personal: Personal[]; companyId: string;
  onAdd:(c:Consultorio)=>void; onUpdate:(id:string,u:Partial<Consultorio>)=>void; onDelete:(id:string)=>void;
}> = ({ consultorios, personal, onAdd, onUpdate, onDelete }) => {
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState<Consultorio>(EMPTY_CONSULTORIO);
  const [editing, setEditing] = useState<string|null>(null);

  const f = (k: keyof Consultorio) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.nombre) { toast.error('El nombre es requerido'); return; }
    editing ? onUpdate(editing, form) : onAdd(form);
    setModal(false); setEditing(null); setForm(EMPTY_CONSULTORIO);
  };

  const odontologos = personal.filter(p => p.tipo === 'ODONTOLOGO' && p.estado === 'ACTIVO');
  const auxiliares  = personal.filter(p => p.tipo === 'AUXILIAR'   && p.estado === 'ACTIVO');

  const getNombre = (id: string) => personal.find(p => p.id === id)?.nombre || '—';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setForm(EMPTY_CONSULTORIO); setEditing(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold">
          <Plus size={15} /> Nuevo Consultorio
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {consultorios.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-slate-800">{c.nombre}</h3>
                {c.codigo && <p className="text-xs text-slate-400 font-mono">#{c.codigo}</p>}
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONSULTORIO_COLORS[c.estado]}`}>
                {c.estado}
              </span>
            </div>
            <div className="space-y-1.5 text-sm mb-4">
              <div className="flex items-center gap-2 text-slate-600">
                <Stethoscope size={13} className="text-teal-500" />
                <span>Dr. {getNombre(c.odontologo_id)}</span>
              </div>
              {c.auxiliar_id && (
                <div className="flex items-center gap-2 text-slate-600">
                  <User size={13} className="text-blue-400" />
                  <span>{getNombre(c.auxiliar_id)}</span>
                </div>
              )}
              {c.observaciones && <p className="text-xs text-slate-400 mt-2">{c.observaciones}</p>}
            </div>
            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => { setForm(c); setEditing(c.id!); setModal(true); }}
                className="flex-1 text-xs py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Editar</button>
              <button onClick={() => onDelete(c.id!)}
                className="px-3 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50 text-xs">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {consultorios.length === 0 && (
          <div className="col-span-3 py-12 text-center text-slate-400">
            <Building2 size={36} className="mx-auto mb-3 opacity-30" /><p>Sin consultorios registrados</p>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Consultorio' : 'Nuevo Consultorio'} onClose={() => setModal(false)} onSave={handleSave}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre *" value={form.nombre} onChange={f('nombre')} placeholder="Consultorio 1" />
            <Field label="Código" value={form.codigo} onChange={f('codigo')} placeholder="Opcional" />
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Odontólogo asignado</label>
              <select value={form.odontologo_id} onChange={f('odontologo_id')} className={inputCls}>
                <option value="">Sin asignar</option>
                {odontologos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Auxiliar asignado</label>
              <select value={form.auxiliar_id} onChange={f('auxiliar_id')} className={inputCls}>
                <option value="">Sin asignar</option>
                {auxiliares.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
              <select value={form.estado} onChange={f('estado')} className={inputCls}>
                <option value="DISPONIBLE">Disponible</option>
                <option value="OCUPADO">Ocupado</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones</label>
              <textarea value={form.observaciones} onChange={f('observaciones')} rows={2} className={`${inputCls} resize-none`} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── AGENDA ───────────────────────────────────────────────────────────────────

const EMPTY_CITA: Cita = {
  paciente_id:'', odontologo_id:'', auxiliar_id:'', consultorio_id:'',
  servicio_id:'', fecha:'', hora:'', estado:'PROGRAMADA', notas:''
};

const AgendaTab: React.FC<{
  citas: Cita[]; pacientes: Paciente[]; personal: Personal[];
  consultorios: Consultorio[]; servicios: Servicio[]; companyId: string;
  onAdd:(c:Cita)=>void; onUpdate:(id:string,u:Partial<Cita>)=>void; onDelete:(id:string)=>void;
}> = ({ citas, pacientes, personal, consultorios, servicios, onAdd, onUpdate, onDelete }) => {
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState<Cita>(EMPTY_CITA);
  const [editing, setEditing] = useState<string|null>(null);
  const [filtroFecha, setFiltroFecha] = useState('');

  const f = (k: keyof Cita) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.paciente_id || !form.odontologo_id || !form.fecha || !form.hora) {
      toast.error('Paciente, odontólogo, fecha y hora son requeridos'); return;
    }
    editing ? onUpdate(editing, form) : onAdd(form);
    setModal(false); setEditing(null); setForm(EMPTY_CITA);
  };

  const getNombre = (arr: any[], id: string) => arr.find(x => x.id === id)?.nombre || '—';

  const filtered = filtroFecha
    ? citas.filter(c => c.fecha === filtroFecha)
    : citas;

  const odontologos = personal.filter(p => p.tipo === 'ODONTOLOGO');
  const auxiliares  = personal.filter(p => p.tipo === 'AUXILIAR');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500" />
          {filtroFecha && (
            <button onClick={() => setFiltroFecha('')} className="text-xs text-slate-400 hover:text-slate-600">✕ Limpiar</button>
          )}
        </div>
        <button onClick={() => { setForm(EMPTY_CITA); setEditing(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold">
          <Plus size={15} /> Nueva Cita
        </button>
      </div>

      {/* Resumen de estados */}
      <div className="grid grid-cols-3 gap-3">
        {(['PROGRAMADA','ATENDIDA','CANCELADA'] as CitaStatus[]).map(s => (
          <div key={s} className="bg-white border border-slate-100 rounded-xl px-4 py-3 text-center shadow-sm">
            <p className="text-xs text-slate-400">{CITA_LABELS[s]}</p>
            <p className="text-2xl font-bold text-slate-800">{citas.filter(c=>c.estado===s).length}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400"><Calendar size={36} className="mx-auto mb-3 opacity-30"/><p>Sin citas</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>{['Fecha','Hora','Paciente','Odontólogo','Consultorio','Servicio','Estado','Acciones'].map(h =>
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
              )}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...filtered].sort((a,b) => a.fecha.localeCompare(b.fecha)).map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{c.fecha}</td>
                  <td className="px-4 py-3 text-slate-700 font-mono">{c.hora}</td>
                  <td className="px-4 py-3 text-slate-700">{getNombre(pacientes, c.paciente_id)}</td>
                  <td className="px-4 py-3 text-slate-600">{getNombre(personal, c.odontologo_id)}</td>
                  <td className="px-4 py-3 text-slate-600">{getNombre(consultorios, c.consultorio_id)}</td>
                  <td className="px-4 py-3 text-slate-600">{getNombre(servicios, c.servicio_id)}</td>
                  <td className="px-4 py-3">
                    <select value={c.estado}
                      onChange={e => onUpdate(c.id!, { estado: e.target.value as CitaStatus })}
                      className={`appearance-none pl-2 pr-6 py-1 rounded-full text-xs font-semibold cursor-pointer border-0 outline-none ${CITA_COLORS[c.estado]}`}>
                      {(Object.keys(CITA_LABELS) as CitaStatus[]).map(s =>
                        <option key={s} value={s}>{CITA_LABELS[s]}</option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setForm(c); setEditing(c.id!); setModal(true); }} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><Edit2 size={13}/></button>
                      <button onClick={() => onDelete(c.id!)} className="p-1.5 hover:bg-red-50 rounded text-red-400"><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Cita' : 'Nueva Cita'} onClose={() => setModal(false)} onSave={handleSave}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Paciente *</label>
              <select value={form.paciente_id} onChange={f('paciente_id')} className={inputCls}>
                <option value="">Seleccionar</option>
                {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Odontólogo *</label>
              <select value={form.odontologo_id} onChange={f('odontologo_id')} className={inputCls}>
                <option value="">Seleccionar</option>
                {odontologos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Auxiliar</label>
              <select value={form.auxiliar_id} onChange={f('auxiliar_id')} className={inputCls}>
                <option value="">Ninguno</option>
                {auxiliares.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Consultorio</label>
              <select value={form.consultorio_id} onChange={f('consultorio_id')} className={inputCls}>
                <option value="">Sin asignar</option>
                {consultorios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <Field label="Fecha *" type="date" value={form.fecha} onChange={f('fecha')} />
            <Field label="Hora *" type="time" value={form.hora} onChange={f('hora')} />
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Servicio</label>
              <select value={form.servicio_id} onChange={f('servicio_id')} className={inputCls}>
                <option value="">Sin especificar</option>
                {servicios.filter(s=>s.activo).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
              <select value={form.estado} onChange={f('estado')} className={inputCls}>
                {(Object.keys(CITA_LABELS) as CitaStatus[]).map(s =>
                  <option key={s} value={s}>{CITA_LABELS[s]}</option>
                )}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
              <textarea value={form.notas} onChange={f('notas')} rows={2} className={`${inputCls} resize-none`} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── HISTORIA CLÍNICA ─────────────────────────────────────────────────────────

const EMPTY_HISTORIA: HistoriaClinica = {
  paciente_id:'', odontologo_id:'', consultorio_id:'',
  fecha: new Date().toISOString().split('T')[0],
  motivo:'', diagnostico:'', procedimiento:'', recomendaciones:'', observaciones:''
};

const HistoriaTab: React.FC<{
  historias: HistoriaClinica[]; pacientes: Paciente[];
  personal: Personal[]; consultorios: Consultorio[]; companyId: string;
  onAdd:(h:HistoriaClinica)=>void;
}> = ({ historias, pacientes, personal, consultorios, onAdd }) => {
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState<HistoriaClinica>(EMPTY_HISTORIA);
  const [verPaciente, setVer]     = useState<string>('');

  const f = (k: keyof HistoriaClinica) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.paciente_id || !form.motivo || !form.diagnostico) {
      toast.error('Paciente, motivo y diagnóstico son requeridos'); return;
    }
    onAdd(form);
    setModal(false); setForm(EMPTY_HISTORIA);
  };

  const getNombre = (arr: any[], id: string) => arr.find(x => x.id === id)?.nombre || '—';

  const historial = verPaciente
    ? historias.filter(h => h.paciente_id === verPaciente)
    : historias;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-600">Filtrar paciente:</label>
          <select value={verPaciente} onChange={e => setVer(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500 min-w-48">
            <option value="">Todos los pacientes</option>
            {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <button onClick={() => { setForm(EMPTY_HISTORIA); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold">
          <Plus size={15} /> Nuevo Registro
        </button>
      </div>

      <div className="space-y-3">
        {historial.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <FileText size={36} className="mx-auto mb-3 opacity-30"/><p>Sin registros clínicos</p>
          </div>
        ) : (
          [...historial].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(h => (
            <div key={h.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold text-slate-800 text-base">{getNombre(pacientes, h.paciente_id)}</p>
                  <p className="text-xs text-slate-400">{h.fecha} · Dr. {getNombre(personal, h.odontologo_id)} · {getNombre(consultorios, h.consultorio_id)}</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs font-semibold text-slate-500 mb-0.5">Motivo</p><p className="text-slate-700">{h.motivo}</p></div>
                <div><p className="text-xs font-semibold text-slate-500 mb-0.5">Diagnóstico</p><p className="text-slate-700">{h.diagnostico}</p></div>
                <div><p className="text-xs font-semibold text-slate-500 mb-0.5">Procedimiento</p><p className="text-slate-700">{h.procedimiento || '—'}</p></div>
                <div><p className="text-xs font-semibold text-slate-500 mb-0.5">Recomendaciones</p><p className="text-slate-700">{h.recomendaciones || '—'}</p></div>
                {h.observaciones && <div className="md:col-span-2"><p className="text-xs font-semibold text-slate-500 mb-0.5">Observaciones</p><p className="text-slate-600 text-xs">{h.observaciones}</p></div>}
              </div>
            </div>
          ))
        )}
      </div>

      {modal && (
        <Modal title="Nuevo Registro Clínico" onClose={() => setModal(false)} onSave={handleSave} wide>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Paciente *</label>
              <select value={form.paciente_id} onChange={f('paciente_id')} className={inputCls}>
                <option value="">Seleccionar</option>
                {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Odontólogo</label>
              <select value={form.odontologo_id} onChange={f('odontologo_id')} className={inputCls}>
                <option value="">Seleccionar</option>
                {personal.filter(p=>p.tipo==='ODONTOLOGO').map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Consultorio</label>
              <select value={form.consultorio_id} onChange={f('consultorio_id')} className={inputCls}>
                <option value="">Seleccionar</option>
                {consultorios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <Field label="Fecha" type="date" value={form.fecha} onChange={f('fecha')} />
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo de consulta *</label>
              <textarea value={form.motivo} onChange={f('motivo')} rows={2} className={`${inputCls} resize-none`} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Diagnóstico *</label>
              <textarea value={form.diagnostico} onChange={f('diagnostico')} rows={2} className={`${inputCls} resize-none`} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Procedimiento realizado</label>
              <textarea value={form.procedimiento} onChange={f('procedimiento')} rows={2} className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Recomendaciones</label>
              <textarea value={form.recomendaciones} onChange={f('recomendaciones')} rows={2} className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones</label>
              <textarea value={form.observaciones} onChange={f('observaciones')} rows={2} className={`${inputCls} resize-none`} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── ODONTOGRAMA ──────────────────────────────────────────────────────────────

const OdontogramaTab: React.FC<{ pacientes: Paciente[]; companyId: string }> = ({ pacientes }) => {
  const [pacienteId, setPacienteId] = useState('');
  const [dientes, setDientes]       = useState<DienteEstado[]>(() => {
    const todos = [...DIENTES_SUPERIORES, ...DIENTES_INFERIORES];
    return todos.map(n => ({ numero: n, estado: '', notas: '' }));
  });
  const [selected, setSelected]     = useState<number | null>(null);
  const [nota, setNota]             = useState('');
  const [estadoSel, setEstadoSel]   = useState<DienteEstado['estado']>('');

  const getDiente = (n: number) => dientes.find(d => d.numero === n)!;

  const aplicar = () => {
    if (selected === null) return;
    setDientes(prev => prev.map(d =>
      d.numero === selected ? { ...d, estado: estadoSel, notas: nota } : d
    ));
    toast.success(`Diente ${selected} actualizado`);
  };

  const limpiar = () => {
    setDientes(prev => prev.map(d => ({ ...d, estado: '', notas: '' })));
    toast.success('Odontograma limpiado');
  };

  const renderDiente = (n: number) => {
    const d = getDiente(n);
    const color = ESTADO_DIENTE_COLORS[d.estado];
    const isSelected = selected === n;
    return (
      <button key={n} onClick={() => { setSelected(n); setEstadoSel(d.estado); setNota(d.notas); }}
        title={`${n} - ${ESTADO_DIENTE_LABELS[d.estado]}`}
        style={{ background: color }}
        className={`w-10 h-10 rounded-lg border-2 text-xs font-bold transition-all
          ${isSelected ? 'border-teal-500 scale-110 shadow-lg' : 'border-slate-300 hover:border-teal-300'}`}>
        {n}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {/* Selector de paciente */}
        <div className="flex items-center gap-4 mb-6">
          <label className="text-sm font-semibold text-slate-600">Paciente:</label>
          <select value={pacienteId} onChange={e => setPacienteId(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500 min-w-56">
            <option value="">Seleccionar paciente</option>
            {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre} — {p.documento}</option>)}
          </select>
          <button onClick={limpiar} className="ml-auto text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5">
            Limpiar todo
          </button>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(ESTADO_DIENTE_LABELS).map(([k, label]) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
              <div className="w-3.5 h-3.5 rounded border border-slate-200" style={{ background: ESTADO_DIENTE_COLORS[k] }} />
              {label}
            </div>
          ))}
        </div>

        {/* Odontograma superior */}
        <div className="mb-6">
          <p className="text-xs font-bold text-slate-400 text-center mb-2">SUPERIOR</p>
          <div className="flex justify-center gap-1.5 flex-wrap">
            {DIENTES_SUPERIORES.map(n => renderDiente(n))}
          </div>
        </div>

        {/* Separador */}
        <div className="border-t-2 border-dashed border-slate-200 my-4" />

        {/* Odontograma inferior */}
        <div className="mt-4">
          <div className="flex justify-center gap-1.5 flex-wrap">
            {DIENTES_INFERIORES.map(n => renderDiente(n))}
          </div>
          <p className="text-xs font-bold text-slate-400 text-center mt-2">INFERIOR</p>
        </div>

        {/* Panel de edición del diente seleccionado */}
        {selected !== null && (
          <div className="mt-6 p-4 bg-teal-50 border border-teal-200 rounded-xl">
            <p className="text-sm font-bold text-teal-700 mb-3">Editando diente #{selected}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
                <select value={estadoSel} onChange={e => setEstadoSel(e.target.value as DienteEstado['estado'])}
                  className={inputCls}>
                  {Object.entries(ESTADO_DIENTE_LABELS).map(([k, label]) =>
                    <option key={k} value={k}>{label}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
                <input value={nota} onChange={e => setNota(e.target.value)}
                  placeholder="Observaciones del diente..." className={inputCls} />
              </div>
            </div>
            <button onClick={aplicar}
              className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700">
              Aplicar cambio
            </button>
          </div>
        )}
      </div>

      {/* Tabla de resumen */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-700">Resumen de condiciones</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Diente','Condición','Notas'].map(h =>
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {dientes.filter(d => d.estado !== '').map(d => (
                <tr key={d.numero} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono font-bold text-slate-700">#{d.numero}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ background: ESTADO_DIENTE_COLORS[d.estado] }} />
                      <span className="text-slate-700">{ESTADO_DIENTE_LABELS[d.estado]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{d.notas || '—'}</td>
                </tr>
              ))}
              {dientes.filter(d => d.estado !== '').length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Sin condiciones marcadas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── SERVICIOS ────────────────────────────────────────────────────────────────

const EMPTY_SERVICIO: Servicio = { nombre:'', precio:0, descripcion:'', activo:true };

const ServiciosTab: React.FC<{
  servicios: Servicio[]; companyId: string; formatMoney:(n:number)=>string;
  onAdd:(s:Servicio)=>void; onUpdate:(id:string,u:Partial<Servicio>)=>void; onDelete:(id:string)=>void;
}> = ({ servicios, formatMoney, onAdd, onUpdate, onDelete }) => {
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState<Servicio>(EMPTY_SERVICIO);
  const [editing, setEditing] = useState<string|null>(null);

  const f = (k: keyof Servicio) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm(prev => ({ ...prev, [k]: val }));
  };

  const handleSave = () => {
    if (!form.nombre || form.precio <= 0) { toast.error('Nombre y precio requeridos'); return; }
    editing ? onUpdate(editing, form) : onAdd(form);
    setModal(false); setEditing(null); setForm(EMPTY_SERVICIO);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setForm(EMPTY_SERVICIO); setEditing(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold">
          <Plus size={15} /> Nuevo Servicio
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {servicios.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="flex justify-between items-start mb-1">
              <h3 className="font-bold text-slate-800">{s.nombre}</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {s.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            {s.descripcion && <p className="text-xs text-slate-500 mb-2">{s.descripcion}</p>}
            <p className="text-xl font-bold text-teal-600 mb-3">{formatMoney(s.precio)}</p>
            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => { setForm(s); setEditing(s.id!); setModal(true); }}
                className="flex-1 text-xs py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Editar</button>
              <button onClick={() => onDelete(s.id!)}
                className="px-3 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50 text-xs"><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
        {servicios.length === 0 && (
          <div className="col-span-3 py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <Stethoscope size={36} className="mx-auto mb-3 opacity-30"/><p>Sin servicios registrados</p>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Servicio' : 'Nuevo Servicio'} onClose={() => setModal(false)} onSave={handleSave}>
          <div className="space-y-4">
            <Field label="Nombre del servicio *" value={form.nombre} onChange={f('nombre')} placeholder="Ej: Limpieza dental" />
            <Field label="Precio *" type="number" value={String(form.precio)} onChange={f('precio')} />
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
              <textarea value={form.descripcion} onChange={f('descripcion')} rows={2} className={`${inputCls} resize-none`} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="activo" checked={form.activo}
                onChange={e => setForm(prev => ({ ...prev, activo: e.target.checked }))} className="w-4 h-4 accent-teal-600" />
              <label htmlFor="activo" className="text-sm font-medium text-slate-700">Servicio activo</label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── PLANES ───────────────────────────────────────────────────────────────────

const EMPTY_PLAN: Plan = { nombre:'', duracion:'MENSUAL', precio:0, servicios_incluidos:'', descuento:0, estado:'ACTIVO' };

const PlanesTab: React.FC<{
  planes: Plan[]; companyId: string; formatMoney:(n:number)=>string;
  onAdd:(p:Plan)=>void; onUpdate:(id:string,u:Partial<Plan>)=>void; onDelete:(id:string)=>void;
}> = ({ planes, formatMoney, onAdd, onUpdate, onDelete }) => {
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState<Plan>(EMPTY_PLAN);
  const [editing, setEditing] = useState<string|null>(null);

  const f = (k: keyof Plan) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = (k === 'precio' || k === 'descuento') ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm(prev => ({ ...prev, [k]: val }));
  };

  const handleSave = () => {
    if (!form.nombre || form.precio <= 0) { toast.error('Nombre y precio requeridos'); return; }
    editing ? onUpdate(editing, form) : onAdd(form);
    setModal(false); setEditing(null); setForm(EMPTY_PLAN);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setForm(EMPTY_PLAN); setEditing(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold">
          <Plus size={15} /> Nuevo Plan
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {planes.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{p.nombre}</h3>
                <span className="text-xs text-slate-400">{p.duracion}</span>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.estado === 'ACTIVO' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                {p.estado}
              </span>
            </div>
            <p className="text-2xl font-bold text-teal-600 mb-2">{formatMoney(p.precio)}</p>
            {p.descuento > 0 && (
              <p className="text-xs bg-orange-50 text-orange-600 font-semibold px-2 py-0.5 rounded-full inline-block mb-2">
                {p.descuento}% descuento en tratamientos
              </p>
            )}
            {p.servicios_incluidos && (
              <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-3">
                <p className="font-semibold text-slate-700 mb-1">Incluye:</p>
                {p.servicios_incluidos.split('\n').map((l, i) =>
                  <p key={i} className="flex items-start gap-1"><CheckCircle size={11} className="text-teal-500 mt-0.5 flex-shrink-0" />{l}</p>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
              <button onClick={() => { setForm(p); setEditing(p.id!); setModal(true); }}
                className="flex-1 text-xs py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Editar</button>
              <button onClick={() => onDelete(p.id!)}
                className="px-3 py-1.5 border border-red-100 rounded-lg text-red-400 hover:bg-red-50 text-xs"><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
        {planes.length === 0 && (
          <div className="col-span-2 py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            <Award size={36} className="mx-auto mb-3 opacity-30"/><p>Sin planes registrados</p>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Plan' : 'Nuevo Plan'} onClose={() => setModal(false)} onSave={handleSave} wide>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre del plan *" value={form.nombre} onChange={f('nombre')} placeholder="Ej: Plan Preventivo Anual" />
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Duración</label>
              <select value={form.duracion} onChange={f('duracion')} className={inputCls}>
                <option value="MENSUAL">Mensual</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>
            <Field label="Precio *" type="number" value={String(form.precio)} onChange={f('precio')} />
            <Field label="Descuento %" type="number" value={String(form.descuento)} onChange={f('descuento')} placeholder="0" />
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Servicios incluidos (uno por línea)</label>
              <textarea value={form.servicios_incluidos} onChange={f('servicios_incluidos')} rows={4}
                placeholder={"2 limpiezas dentales\n1 consulta de revisión\n..."}
                className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
              <select value={form.estado} onChange={f('estado')} className={inputCls}>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── FACTURACIÓN ──────────────────────────────────────────────────────────────

const EMPTY_FACTURA: Omit<FacturaOdonto,'saldo'|'estado'> = {
  paciente_id:'', servicio_id:'', total:0, abonado:0,
  fecha: new Date().toISOString().split('T')[0], notas:''
};

const FacturacionTab: React.FC<{
  facturas: FacturaOdonto[]; pacientes: Paciente[]; servicios: Servicio[];
  companyId: string; formatMoney:(n:number)=>string;
  onAdd:(f:FacturaOdonto)=>void; onAbono:(id:string,monto:number)=>void; onDelete:(id:string)=>void;
}> = ({ facturas, pacientes, servicios, formatMoney, onAdd, onAbono, onDelete }) => {
  const [modal, setModal]       = useState(false);
  const [abonoModal, setAbonoM] = useState<string|null>(null);
  const [monto, setMonto]       = useState(0);
  const [form, setForm]         = useState<typeof EMPTY_FACTURA>(EMPTY_FACTURA);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = ['total','abonado'].includes(k) ? parseFloat(e.target.value)||0 : e.target.value;
    setForm(prev => ({ ...prev, [k]: val }));
  };

  const handleSave = () => {
    if (!form.paciente_id || form.total <= 0) { toast.error('Paciente y total requeridos'); return; }
    const saldo = form.total - form.abonado;
    const estado: FacturaStatus = saldo <= 0 ? 'PAGADA' : form.abonado > 0 ? 'ABONO' : 'PENDIENTE';
    onAdd({ ...form, saldo, estado });
    setModal(false); setForm(EMPTY_FACTURA);
  };

  const handleAbono = () => {
    if (!abonoModal || monto <= 0) { toast.error('Ingresa un monto válido'); return; }
    const f = facturas.find(x => x.id === abonoModal);
    if (f && monto > f.saldo) { toast.error(`El abono no puede superar el saldo (${formatMoney(f.saldo)})`); return; }
    onAbono(abonoModal, monto);
    setAbonoM(null); setMonto(0);
  };

  const getNombre = (arr: any[], id: string) => arr.find(x => x.id === id)?.nombre || '—';

  const totalFacturado = facturas.reduce((s,f) => s + f.total, 0);
  const totalPendiente = facturas.filter(f=>f.estado!=='PAGADA').reduce((s,f) => s + f.saldo, 0);
  const totalRecaudado = facturas.reduce((s,f) => s + f.abonado, 0);

  return (
    <div className="space-y-4">
      {/* Resumen financiero */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Facturado', val: formatMoney(totalFacturado), color: 'text-slate-800' },
          { label: 'Total Recaudado', val: formatMoney(totalRecaudado), color: 'text-green-600' },
          { label: 'Saldo Pendiente', val: formatMoney(totalPendiente), color: 'text-orange-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button onClick={() => { setForm(EMPTY_FACTURA); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold">
          <Plus size={15} /> Nueva Factura
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {facturas.length === 0 ? (
          <div className="py-12 text-center text-slate-400"><DollarSign size={36} className="mx-auto mb-3 opacity-30"/><p>Sin facturas</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>{['Fecha','Paciente','Servicio','Total','Abonado','Saldo','Estado','Acciones'].map(h =>
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
              )}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...facturas].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(fc => (
                <tr key={fc.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{fc.fecha}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{getNombre(pacientes, fc.paciente_id)}</td>
                  <td className="px-4 py-3 text-slate-600">{getNombre(servicios, fc.servicio_id)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{formatMoney(fc.total)}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{formatMoney(fc.abonado)}</td>
                  <td className="px-4 py-3 font-bold text-orange-600">{formatMoney(fc.saldo)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${fc.estado==='PAGADA'   ? 'bg-green-100 text-green-700'  :
                        fc.estado==='ABONO'    ? 'bg-yellow-100 text-yellow-700' :
                                                  'bg-red-50 text-red-600'}`}>
                      {fc.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {fc.estado !== 'PAGADA' && (
                        <button onClick={() => { setAbonoM(fc.id!); setMonto(0); }}
                          className="px-2 py-1 bg-teal-50 text-teal-700 rounded text-xs font-semibold hover:bg-teal-100">
                          + Abono
                        </button>
                      )}
                      <button onClick={() => onDelete(fc.id!)} className="p-1.5 hover:bg-red-50 rounded text-red-400"><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nueva factura */}
      {modal && (
        <Modal title="Nueva Factura" onClose={() => setModal(false)} onSave={handleSave}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Paciente *</label>
              <select value={form.paciente_id} onChange={f('paciente_id')} className={inputCls}>
                <option value="">Seleccionar</option>
                {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Servicio</label>
              <select value={form.servicio_id} onChange={f('servicio_id')} className={inputCls}>
                <option value="">Sin especificar</option>
                {servicios.filter(s=>s.activo).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <Field label="Total *" type="number" value={String(form.total)} onChange={f('total')} />
            <Field label="Abono inicial" type="number" value={String(form.abonado)} onChange={f('abonado')} />
            <Field label="Fecha" type="date" value={form.fecha} onChange={f('fecha')} />
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
              <textarea value={form.notas} onChange={f('notas')} rows={2} className={`${inputCls} resize-none`} />
            </div>
            {form.total > 0 && (
              <div className="col-span-2 p-3 bg-slate-50 rounded-lg text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Saldo pendiente:</span>
                  <span className="font-bold text-orange-600">{(() => {
                    const saldo = form.total - form.abonado;
                    return saldo <= 0 ? '✅ Pagado' : `$${saldo.toLocaleString()}`;
                  })()}</span>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal abono */}
      {abonoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800">Registrar Abono</h3>
              <button onClick={() => setAbonoM(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            {(() => {
              const fc = facturas.find(x => x.id === abonoModal);
              return fc ? (
                <div className="space-y-4">
                  <div className="bg-orange-50 rounded-lg p-3 text-sm">
                    <p className="text-slate-600">Saldo actual: <span className="font-bold text-orange-600">{formatMoney(fc.saldo)}</span></p>
                  </div>
                  <Field label="Monto del abono *" type="number" value={String(monto)}
                    onChange={e => setMonto(parseFloat(e.target.value)||0)} />
                  {monto > 0 && (
                    <div className="bg-slate-50 rounded-lg p-3 text-sm">
                      <p className="text-slate-500">Saldo restante: <span className="font-bold">{formatMoney(Math.max(0, fc.saldo - monto))}</span></p>
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setAbonoM(null)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50">Cancelar</button>
                    <button onClick={handleAbono} className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700">Registrar</button>
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── REPORTES ─────────────────────────────────────────────────────────────────

const ReportesTab: React.FC<{
  pacientes: Paciente[]; citas: Cita[]; personal: Personal[];
  facturas: FacturaOdonto[]; servicios: Servicio[]; planes: Plan[];
  formatMoney:(n:number)=>string;
}> = ({ pacientes, citas, personal, facturas, servicios, planes, formatMoney }) => {
  // Citas por estado
  const citasAtendidas = citas.filter(c=>c.estado==='ATENDIDA').length;
  const citasCanceladas = citas.filter(c=>c.estado==='CANCELADA').length;

  // Facturas por estado
  const factPagadas   = facturas.filter(f=>f.estado==='PAGADA').length;
  const factPendientes = facturas.filter(f=>f.estado!=='PAGADA').length;
  const totalRecaudado = facturas.reduce((s,f) => s + f.abonado, 0);
  const totalPendiente = facturas.filter(f=>f.estado!=='PAGADA').reduce((s,f)=>s+f.saldo, 0);

  // Top servicios (por frecuencia en facturas)
  const servicioCount: Record<string, number> = {};
  facturas.forEach(f => { if (f.servicio_id) servicioCount[f.servicio_id] = (servicioCount[f.servicio_id]||0)+1; });
  const topServicios = servicios.map(s => ({ nombre: s.nombre, count: servicioCount[s.id!]||0 }))
    .sort((a,b)=>b.count-a.count).slice(0,5);

  // Ingresos por odontólogo (via citas → facturas en el mismo día con mismo paciente)
  const odontologos = personal.filter(p=>p.tipo==='ODONTOLOGO');

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Total pacientes',    val: pacientes.length,             sub:'registrados' },
          { label:'Citas atendidas',    val: citasAtendidas,               sub:`${citasCanceladas} canceladas` },
          { label:'Total recaudado',    val: formatMoney(totalRecaudado),  sub:'en abonos y pagos' },
          { label:'Saldo por cobrar',   val: formatMoney(totalPendiente),  sub:`${factPendientes} facturas` },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{k.val}</p>
            <p className="text-xs text-slate-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top servicios */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-700">⭐ Servicios más solicitados</h3>
          </div>
          <div className="p-5 space-y-3">
            {topServicios.map((s, i) => (
              <div key={s.nombre} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-4">{i+1}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{s.nombre}</span>
                    <span className="text-xs text-slate-400">{s.count} veces</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full">
                    <div className="h-1.5 bg-teal-500 rounded-full"
                      style={{ width: `${topServicios[0].count ? (s.count / topServicios[0].count) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {topServicios.every(s=>s.count===0) && (
              <p className="text-center text-slate-400 text-sm py-4">Sin datos de servicios aún</p>
            )}
          </div>
        </div>

        {/* Personal activo */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-700">👨‍⚕️ Personal activo</h3>
          </div>
          <div className="p-5 space-y-2">
            {odontologos.filter(o=>o.estado==='ACTIVO').map(o => {
              const citasDr = citas.filter(c=>c.odontologo_id===o.id && c.estado==='ATENDIDA').length;
              return (
                <div key={o.id} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{o.nombre}</p>
                    <p className="text-xs text-slate-400">{o.especialidad || 'General'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-teal-600">{citasDr} atendidas</p>
                  </div>
                </div>
              );
            })}
            {odontologos.filter(o=>o.estado==='ACTIVO').length === 0 && (
              <p className="text-center text-slate-400 text-sm py-4">Sin odontólogos activos</p>
            )}
          </div>
        </div>

        {/* Pacientes con plan */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-700">🏅 Pacientes por membresía</h3>
          </div>
          <div className="p-5 space-y-2">
            {planes.map(pl => {
              const count = pacientes.filter(p=>p.plan_id===pl.id).length;
              return (
                <div key={pl.id} className="flex justify-between items-center">
                  <span className="text-sm text-slate-700">{pl.nombre}</span>
                  <span className="text-sm font-bold text-teal-600">{count} pacientes</span>
                </div>
              );
            })}
            {planes.length === 0 && <p className="text-center text-slate-400 text-sm py-4">Sin planes configurados</p>}
          </div>
        </div>

        {/* Estado de facturas */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-700">💳 Estado de facturación</h3>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label:'Pagadas',    count: factPagadas,                                    color:'bg-green-500'  },
              { label:'Con abono',  count: facturas.filter(f=>f.estado==='ABONO').length,  color:'bg-yellow-400' },
              { label:'Pendientes', count: facturas.filter(f=>f.estado==='PENDIENTE').length, color:'bg-red-400' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                <span className="text-sm text-slate-600 flex-1">{s.label}</span>
                <span className="text-sm font-bold text-slate-800">{s.count}</span>
              </div>
            ))}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total facturas:</span>
                <span className="font-bold text-slate-700">{facturas.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── COMPONENTES REUTILIZABLES ────────────────────────────────────────────────

const inputCls = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white";

const Field: React.FC<{
  label: string; value: string; onChange: (e: any) => void;
  type?: string; placeholder?: string;
}> = ({ label, value, onChange, type = 'text', placeholder }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      className={inputCls} />
  </div>
);

const Modal: React.FC<{
  title: string; onClose: () => void; onSave: () => void;
  children: React.ReactNode; wide?: boolean;
}> = ({ title, onClose, onSave, children, wide }) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 flex-shrink-0">
        <h3 className="font-bold text-slate-800 text-base">{title}</h3>
        <button onClick={onClose}><X size={18} className="text-slate-400 hover:text-slate-600" /></button>
      </div>
      <div className="overflow-y-auto p-6 flex-1">{children}</div>
      <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
        <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50">Cancelar</button>
        <button onClick={onSave}  className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700">Guardar</button>
      </div>
    </div>
  </div>
);

export default Odontologia;
