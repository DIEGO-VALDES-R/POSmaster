import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Search, User, Users, Calendar, FileText,
  Heart, DollarSign, CheckCircle, Clock, XCircle,
  Edit2, Trash2, Eye, Phone, Mail, MapPin, Activity,
  BarChart2, Syringe, Weight, BedDouble, Pill, Star,
  ChevronDown, ChevronRight, AlertCircle, PawPrint,
  Stethoscope, ClipboardList, ShoppingCart, Receipt,
  TrendingUp, Package, RefreshCw, Printer
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useCompany } from '../hooks/useCompany';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';

// ─── TIPOS ───────────────────────────────────────────────────────────────────

type PersonalType  = 'VETERINARIO' | 'AUXILIAR' | 'CIRUJANO' | 'RECEPCION';
type PersonalStatus = 'ACTIVO' | 'INACTIVO';
type ConsultorioStatus = 'DISPONIBLE' | 'OCUPADO' | 'INACTIVO';
type CitaStatus    = 'PROGRAMADA' | 'ATENDIDA' | 'CANCELADA';
type HospitalizacionStatus = 'HOSPITALIZADO' | 'ALTA';
type FacturaStatus = 'PAGADA' | 'PENDIENTE' | 'ABONO';

interface Propietario {
  id?: string; company_id?: string;
  nombre: string; documento: string; telefono: string;
  correo: string; direccion: string; observaciones: string;
}

interface Mascota {
  id?: string; company_id?: string;
  nombre: string; propietario_id: string; propietario_nombre?: string;
  especie: string; raza: string; sexo: 'MACHO' | 'HEMBRA';
  fecha_nacimiento: string; peso_inicial: number; color: string;
  microchip: string; observaciones: string;
}

interface Personal {
  id?: string; company_id?: string;
  nombre: string; documento: string; tipo: PersonalType;
  especialidad: string; telefono: string; estado: PersonalStatus;
}

interface Consultorio {
  id?: string; company_id?: string;
  nombre: string; veterinario_id: string; auxiliar_id: string;
  estado: ConsultorioStatus; observaciones: string;
}

interface Cita {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  propietario_id: string; propietario_nombre?: string;
  veterinario_id: string; veterinario_nombre?: string;
  consultorio_id: string; fecha: string; hora: string;
  motivo: string; estado: CitaStatus; notas: string;
}

interface HistoriaClinica {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  veterinario_id: string; consultorio_id: string; fecha: string;
  peso: number; temperatura: number; diagnostico: string;
  tratamiento: string; medicamentos: string; observaciones: string;
}

interface Vacuna {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  nombre_vacuna: string; fecha_aplicada: string;
  proxima_dosis: string; veterinario_id: string;
}

interface ControlPeso {
  id?: string; company_id?: string;
  mascota_id: string; fecha: string; peso: number; observaciones: string;
}

interface Hospitalizacion {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  fecha_ingreso: string; fecha_alta?: string;
  veterinario_id: string; motivo: string;
  estado: HospitalizacionStatus;
  monitoreos?: MonitoreoHosp[];
}

interface MonitoreoHosp {
  id?: string; hospitalizacion_id?: string;
  fecha: string; temperatura: number; peso: number;
  medicacion: string; observaciones: string;
}

interface Medicamento {
  id?: string; company_id?: string;
  nombre: string; tipo: string; presentacion: string;
  stock: number; precio: number;
}

interface Servicio {
  id?: string; company_id?: string;
  nombre: string; precio: number; descripcion: string; activo: boolean;
}

interface Plan {
  id?: string; company_id?: string;
  nombre: string; precio: number;
  servicios_incluidos: string; descuento: number;
  estado: 'ACTIVO' | 'INACTIVO';
}

interface FacturaVet {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  propietario_nombre?: string;
  servicio_descripcion: string; total: number;
  abonado: number; saldo: number;
  estado: FacturaStatus; fecha: string; notas: string;
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',      label: 'Dashboard',         icon: <BarChart2 size={16} /> },
  { id: 'propietarios',   label: 'Propietarios',       icon: <Users size={16} /> },
  { id: 'mascotas',       label: 'Mascotas',           icon: <PawPrint size={16} /> },
  { id: 'personal',       label: 'Personal',           icon: <User size={16} /> },
  { id: 'consultorios',   label: 'Consultorios',       icon: <MapPin size={16} /> },
  { id: 'agenda',         label: 'Agenda / Citas',     icon: <Calendar size={16} /> },
  { id: 'historia',       label: 'Historia Clínica',   icon: <FileText size={16} /> },
  { id: 'vacunacion',     label: 'Vacunación',         icon: <Syringe size={16} /> },
  { id: 'peso',           label: 'Control de Peso',    icon: <Weight size={16} /> },
  { id: 'hospitalizacion',label: 'Hospitalización',    icon: <BedDouble size={16} /> },
  { id: 'farmacia',       label: 'Farmacia',           icon: <Pill size={16} /> },
  { id: 'servicios',      label: 'Servicios',          icon: <Stethoscope size={16} /> },
  { id: 'planes',         label: 'Planes',             icon: <Star size={16} /> },
  { id: 'facturacion',    label: 'Facturación',        icon: <Receipt size={16} /> },
] as const;
type TabId = typeof TABS[number]['id'];

const ESPECIES = ['Perro', 'Gato', 'Ave', 'Conejo', 'Reptil', 'Roedor', 'Otro'];
const TIPOS_PERSONAL: Record<PersonalType, string> = {
  VETERINARIO: 'Veterinario', AUXILIAR: 'Auxiliar',
  CIRUJANO: 'Cirujano', RECEPCION: 'Recepción',
};
const TIPOS_MEDICAMENTO = ['Antibiótico', 'Analgésico', 'Antiparasitario', 'Vitamina', 'Vacuna', 'Otro'];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().split('T')[0];

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTES UI — definidos FUERA del componente principal para evitar
// que React los destruya y recree en cada render (bug de pérdida de foco)
// ══════════════════════════════════════════════════════════════════════════════

const Card: React.FC<{ title: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }> =
  ({ title, value, sub, icon, color }) => (
  <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '18' }}>
      <span style={{ color }}>{icon}</span>
    </div>
    <div>
      <p className="text-sm text-slate-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  </div>
);

const Input: React.FC<{ label: string; value: string | number; onChange: (v: any) => void; type?: string; required?: boolean }> =
  ({ label, value, onChange, type = 'text', required }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
    <input type={type} value={value} onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent" />
  </div>
);

const Select: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }> =
  ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none bg-white">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Textarea: React.FC<{ label: string; value: string; onChange: (v: string) => void; rows?: number }> =
  ({ label, value, onChange, rows = 3 }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none resize-none" />
  </div>
);

const ModalWrapper: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; onSave: () => void; wide?: boolean; brandColor: string }> =
  ({ title, onClose, children, onSave, wide, brandColor }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className={`bg-white rounded-2xl shadow-2xl flex flex-col ${wide ? 'w-full max-w-3xl' : 'w-full max-w-lg'} max-h-[90vh]`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="font-bold text-lg text-slate-800">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
      </div>
      <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">{children}</div>
      <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancelar</button>
        <button onClick={onSave} className="px-5 py-2 rounded-lg text-white text-sm font-semibold shadow" style={{ background: brandColor }}>Guardar</button>
      </div>
    </div>
  </div>
);

const TableWrapper: React.FC<{ headers: string[]; children: React.ReactNode; onAdd: () => void; btnLabel: string; search?: boolean; brandColor: string; searchQ: string; setSearchQ: (v: string) => void }> =
  ({ headers, children, onAdd, btnLabel, search, brandColor, searchQ, setSearchQ }) => (
  <div>
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      {search && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input placeholder="Buscar..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
            className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none" />
        </div>
      )}
      <button onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow ml-auto"
        style={{ background: brandColor }}>
        <Plus size={16} />{btnLabel}
      </button>
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>{headers.map(h => <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-50">{children}</tbody>
      </table>
    </div>
  </div>
);

const Row: React.FC<{ cells: React.ReactNode[]; onEdit?: () => void; onDelete?: () => void; onView?: () => void }> =
  ({ cells, onEdit, onDelete, onView }) => (
  <tr className="hover:bg-slate-50 transition-colors">
    {cells.map((c, i) => <td key={i} className="px-4 py-3 text-slate-700">{c}</td>)}
    <td className="px-4 py-3">
      <div className="flex gap-2">
        {onView   && <button onClick={onView}   className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"><Eye size={14} /></button>}
        {onEdit   && <button onClick={onEdit}   className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500"><Edit2 size={14} /></button>}
        {onDelete && <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={14} /></button>}
      </div>
    </td>
  </tr>
);

const Veterinaria: React.FC = () => {
  const { company } = useCompany();
  const { formatCurrency } = useCurrency();
  const companyId = company?.id;
  const brandColor = (company?.config as any)?.primary_color || '#0ea5e9';
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [loading, setLoading] = useState(false);

  // ── DATA STATE ──
  const [propietarios, setPropietarios]       = useState<Propietario[]>([]);
  const [mascotas, setMascotas]               = useState<Mascota[]>([]);
  const [personal, setPersonal]               = useState<Personal[]>([]);
  const [consultorios, setConsultorios]       = useState<Consultorio[]>([]);
  const [citas, setCitas]                     = useState<Cita[]>([]);
  const [historias, setHistorias]             = useState<HistoriaClinica[]>([]);
  const [vacunas, setVacunas]                 = useState<Vacuna[]>([]);
  const [pesos, setPesos]                     = useState<ControlPeso[]>([]);
  const [hospitalizaciones, setHospitalizaciones] = useState<Hospitalizacion[]>([]);
  const [medicamentos, setMedicamentos]       = useState<Medicamento[]>([]);
  const [servicios, setServicios]             = useState<Servicio[]>([]);
  const [planes, setPlanes]                   = useState<Plan[]>([]);
  const [facturas, setFacturas]               = useState<FacturaVet[]>([]);

  // ── MODAL STATE ──
  const [modal, setModal] = useState<string | null>(null);
  const [editing, setEditing]   = useState<any>(null);
  const [searchQ, setSearchQ]   = useState('');
  const [detailItem, setDetailItem] = useState<any>(null);

  // ── FORMS ──
  const emptyPropietario = (): Propietario => ({ nombre:'', documento:'', telefono:'', correo:'', direccion:'', observaciones:'' });
  const emptyMascota     = (): Mascota     => ({ nombre:'', propietario_id:'', especie:'Perro', raza:'', sexo:'MACHO', fecha_nacimiento:'', peso_inicial:0, color:'', microchip:'', observaciones:'' });
  const emptyPersonal    = (): Personal    => ({ nombre:'', documento:'', tipo:'VETERINARIO', especialidad:'General', telefono:'', estado:'ACTIVO' });
  const emptyConsultorio = (): Consultorio => ({ nombre:'', veterinario_id:'', auxiliar_id:'', estado:'DISPONIBLE', observaciones:'' });
  const emptyCita        = (): Cita        => ({ mascota_id:'', propietario_id:'', veterinario_id:'', consultorio_id:'', fecha:today(), hora:'09:00', motivo:'Consulta general', estado:'PROGRAMADA', notas:'' });
  const emptyHistoria    = (): HistoriaClinica => ({ mascota_id:'', veterinario_id:'', consultorio_id:'', fecha:today(), peso:0, temperatura:38.5, diagnostico:'', tratamiento:'', medicamentos:'', observaciones:'' });
  const emptyVacuna      = (): Vacuna      => ({ mascota_id:'', nombre_vacuna:'', fecha_aplicada:today(), proxima_dosis:'', veterinario_id:'' });
  const emptyPeso        = (): ControlPeso => ({ mascota_id:'', fecha:today(), peso:0, observaciones:'' });
  const emptyHospitalizacion = (): Hospitalizacion => ({ mascota_id:'', fecha_ingreso:today(), veterinario_id:'', motivo:'', estado:'HOSPITALIZADO' });
  const emptyMedicamento = (): Medicamento => ({ nombre:'', tipo:'Antibiótico', presentacion:'Tabletas', stock:0, precio:0 });
  const emptyServicio    = (): Servicio    => ({ nombre:'', precio:0, descripcion:'', activo:true });
  const emptyPlan        = (): Plan        => ({ nombre:'', precio:0, servicios_incluidos:'', descuento:0, estado:'ACTIVO' });
  const emptyFactura     = (): FacturaVet  => ({ mascota_id:'', servicio_descripcion:'', total:0, abonado:0, saldo:0, estado:'PENDIENTE', fecha:today(), notas:'' });

  const [formPropietario, setFormPropietario]   = useState<Propietario>(emptyPropietario());
  const [formMascota, setFormMascota]           = useState<Mascota>(emptyMascota());
  const [formPersonal, setFormPersonal]         = useState<Personal>(emptyPersonal());
  const [formConsultorio, setFormConsultorio]   = useState<Consultorio>(emptyConsultorio());
  const [formCita, setFormCita]                 = useState<Cita>(emptyCita());
  const [formHistoria, setFormHistoria]         = useState<HistoriaClinica>(emptyHistoria());
  const [formVacuna, setFormVacuna]             = useState<Vacuna>(emptyVacuna());
  const [formPeso, setFormPeso]                 = useState<ControlPeso>(emptyPeso());
  const [formHospitalizacion, setFormHospitalizacion] = useState<Hospitalizacion>(emptyHospitalizacion());
  const [formMedicamento, setFormMedicamento]   = useState<Medicamento>(emptyMedicamento());
  const [formServicio, setFormServicio]         = useState<Servicio>(emptyServicio());
  const [formPlan, setFormPlan]                 = useState<Plan>(emptyPlan());
  const [formFactura, setFormFactura]           = useState<FacturaVet>(emptyFactura());
  const [formAbono, setFormAbono]               = useState<number>(0);
  const [formPOS, setFormPOS]                   = useState({ mascota_id: '', servicio: '', total: '' });

  // ── LOCAL STORAGE FALLBACK ──
  // ── CARGA DESDE SUPABASE ─────────────────────────────────────────────────
  const loadTable = useCallback(async (table: string, setter: React.Dispatch<any>, extra?: Record<string,any>) => {
    if (!companyId) return;
    let q = supabase.from(table).select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    if (extra) Object.entries(extra).forEach(([k,v]) => { q = q.eq(k, v); });
    const { data, error } = await q;
    if (error) { console.error(`❌ ${table}:`, error.message); return; }
    setter(data || []);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    const init = async () => {
      setLoading(true);
      await Promise.all([
        loadTable('vet_propietarios',    setPropietarios),
        loadTable('vet_mascotas',        setMascotas),
        loadTable('vet_personal',        setPersonal),
        loadTable('vet_consultorios',    setConsultorios),
        loadTable('vet_citas',           setCitas),
        loadTable('vet_historias_clinicas', setHistorias),
        loadTable('vet_vacunas',         setVacunas),
        loadTable('vet_control_peso',    setPesos),
        loadTable('vet_hospitalizaciones', setHospitalizaciones),
        loadTable('vet_medicamentos',    setMedicamentos),
        loadTable('vet_servicios',       setServicios),
        loadTable('vet_planes',          setPlanes),
        loadTable('vet_facturas',        setFacturas),
      ]);
      setLoading(false);
    };
    init();
  }, [companyId, loadTable]);

  // ── SEED DATA ──
  const seedServicios = (): Servicio[] => [
    { id: uid(), nombre: 'Consulta general',   precio: 50000,  descripcion: 'Consulta médica veterinaria', activo: true },
    { id: uid(), nombre: 'Vacunación',          precio: 40000,  descripcion: 'Aplicación de vacuna',        activo: true },
    { id: uid(), nombre: 'Desparasitación',     precio: 35000,  descripcion: 'Tratamiento antiparasitario', activo: true },
    { id: uid(), nombre: 'Baño y peluquería',   precio: 60000,  descripcion: 'Aseo completo',               activo: true },
    { id: uid(), nombre: 'Cirugía menor',       precio: 300000, descripcion: 'Procedimiento quirúrgico menor', activo: true },
    { id: uid(), nombre: 'Esterilización',      precio: 400000, descripcion: 'Castración / esterilización', activo: true },
    { id: uid(), nombre: 'Radiografía',         precio: 80000,  descripcion: 'Estudio radiológico',          activo: true },
    { id: uid(), nombre: 'Ecografía',           precio: 120000, descripcion: 'Estudio ecográfico',           activo: true },
  ];
  const seedMedicamentos = (): Medicamento[] => [
    { id: uid(), nombre: 'Amoxicilina 250mg',  tipo: 'Antibiótico',     presentacion: 'Tabletas', stock: 50, precio: 8000 },
    { id: uid(), nombre: 'Meloxicam 1mg',      tipo: 'Analgésico',      presentacion: 'Tabletas', stock: 30, precio: 5000 },
    { id: uid(), nombre: 'Ivermectina 1%',     tipo: 'Antiparasitario', presentacion: 'Inyectable', stock: 20, precio: 12000 },
  ];
  const seedPlanes = (): Plan[] => [
    { id: uid(), nombre: 'Plan Mascota Saludable', precio: 250000, servicios_incluidos: '2 consultas al año, vacunas básicas, desparasitación', descuento: 10, estado: 'ACTIVO' },
    { id: uid(), nombre: 'Plan Premium',           precio: 500000, servicios_incluidos: '4 consultas, vacunas completas, baño mensual, laboratorio', descuento: 20, estado: 'ACTIVO' },
  ];

  // ── SUPABASE CRUD HELPERS ─────────────────────────────────────────────────
  const TABLE: Record<string, string> = {
    propietarios:    'vet_propietarios',
    mascotas:        'vet_mascotas',
    personal:        'vet_personal',
    consultorios:    'vet_consultorios',
    citas:           'vet_citas',
    historias:       'vet_historias_clinicas',
    vacunas:         'vet_vacunas',
    pesos:           'vet_control_peso',
    hospitalizaciones: 'vet_hospitalizaciones',
    medicamentos:    'vet_medicamentos',
    servicios:       'vet_servicios',
    planes:          'vet_planes',
    facturas:        'vet_facturas',
  };

  const upsertDB = async (key: string, row: any) => {
    const table = TABLE[key];
    if (!table) return;
    const { error } = await supabase.from(table).upsert({ ...row, company_id: companyId });
    if (error) { console.error(`❌ upsert ${table}:`, error.message); toast.error('Error al guardar: ' + error.message); }
  };

  const deleteDB = async (key: string, id: string) => {
    const table = TABLE[key];
    if (!table) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { console.error(`❌ delete ${table}:`, error.message); toast.error('Error al eliminar: ' + error.message); }
  };

  // ─── CRUD HELPERS ────────────────────────────────────────────────────────

  const savePropietario = async () => {
    if (!formPropietario.nombre.trim()) return toast.error('El nombre es requerido');
    const row = { ...formPropietario, id: editing?.id || uid(), company_id: companyId };
    await upsertDB('propietarios', row);
    await loadTable('vet_propietarios', setPropietarios);
    toast.success(editing?.id ? 'Propietario actualizado' : 'Propietario registrado');
    closeModal();
  };

  const saveMascota = async () => {
    if (!formMascota.nombre.trim() || !formMascota.propietario_id) return toast.error('Nombre y propietario son requeridos');
    const prop = propietarios.find(p => p.id === formMascota.propietario_id);
    const row = { ...formMascota, id: editing?.id || uid(), company_id: companyId, propietario_nombre: prop?.nombre };
    await upsertDB('mascotas', row);
    await loadTable('vet_mascotas', setMascotas);
    toast.success(editing?.id ? 'Mascota actualizada' : 'Mascota registrada');
    closeModal();
  };

  const savePersonal = async () => {
    if (!formPersonal.nombre.trim()) return toast.error('El nombre es requerido');
    const row = { ...formPersonal, id: editing?.id || uid(), company_id: companyId };
    await upsertDB('personal', row);
    await loadTable('vet_personal', setPersonal);
    toast.success('Personal guardado'); closeModal();
  };

  const saveConsultorio = async () => {
    if (!formConsultorio.nombre.trim()) return toast.error('El nombre es requerido');
    const row = { ...formConsultorio, id: editing?.id || uid(), company_id: companyId };
    await upsertDB('consultorios', row);
    await loadTable('vet_consultorios', setConsultorios);
    toast.success('Consultorio guardado'); closeModal();
  };

  const saveCita = async () => {
    if (!formCita.mascota_id || !formCita.fecha) return toast.error('Mascota y fecha son requeridos');
    const mascota = mascotas.find(m => m.id === formCita.mascota_id);
    const prop = propietarios.find(p => p.id === formCita.propietario_id);
    const vet  = personal.find(p => p.id === formCita.veterinario_id);
    const row = { ...formCita, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, propietario_nombre: prop?.nombre, veterinario_nombre: vet?.nombre, company_id: companyId };
    await upsertDB('citas', row);
    await loadTable('vet_citas', setCitas);
    toast.success('Cita guardada'); closeModal();
  };

  const saveHistoria = async () => {
    if (!formHistoria.mascota_id || !formHistoria.diagnostico.trim()) return toast.error('Mascota y diagnóstico requeridos');
    const mascota = mascotas.find(m => m.id === formHistoria.mascota_id);
    const row = { ...formHistoria, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, company_id: companyId };
    await upsertDB('historias', row);
    if (formHistoria.peso > 0 && !editing?.id) {
      const pesoRow = { id: uid(), company_id: companyId, mascota_id: formHistoria.mascota_id, fecha: formHistoria.fecha, peso: formHistoria.peso, observaciones: 'Registrado desde historia clínica' };
      await upsertDB('pesos', pesoRow);
      await loadTable('vet_control_peso', setPesos);
    }
    await loadTable('vet_historias_clinicas', setHistorias);
    toast.success('Historia clínica guardada'); closeModal();
  };

  const saveVacuna = async () => {
    if (!formVacuna.mascota_id || !formVacuna.nombre_vacuna.trim()) return toast.error('Mascota y vacuna requeridos');
    const mascota = mascotas.find(m => m.id === formVacuna.mascota_id);
    const row = { ...formVacuna, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, company_id: companyId };
    await upsertDB('vacunas', row);
    await loadTable('vet_vacunas', setVacunas);
    toast.success('Vacuna registrada'); closeModal();
  };

  const savePeso = async () => {
    if (!formPeso.mascota_id || formPeso.peso <= 0) return toast.error('Mascota y peso requeridos');
    const row = { ...formPeso, id: uid(), company_id: companyId };
    await upsertDB('pesos', row);
    await loadTable('vet_control_peso', setPesos);
    toast.success('Peso registrado'); closeModal();
  };

  const saveHospitalizacion = async () => {
    if (!formHospitalizacion.mascota_id || !formHospitalizacion.motivo.trim()) return toast.error('Mascota y motivo requeridos');
    const mascota = mascotas.find(m => m.id === formHospitalizacion.mascota_id);
    const row = { ...formHospitalizacion, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, company_id: companyId };
    await upsertDB('hospitalizaciones', row);
    await loadTable('vet_hospitalizaciones', setHospitalizaciones);
    toast.success('Hospitalización guardada'); closeModal();
  };

  const saveMedicamento = async () => {
    if (!formMedicamento.nombre.trim()) return toast.error('Nombre requerido');
    const row = { ...formMedicamento, id: editing?.id || uid(), company_id: companyId };
    await upsertDB('medicamentos', row);
    await loadTable('vet_medicamentos', setMedicamentos);
    toast.success('Medicamento guardado'); closeModal();
  };

  const saveServicio = async () => {
    if (!formServicio.nombre.trim()) return toast.error('Nombre requerido');
    const row = { ...formServicio, id: editing?.id || uid(), company_id: companyId };
    await upsertDB('servicios', row);
    await loadTable('vet_servicios', setServicios);
    toast.success('Servicio guardado'); closeModal();
  };

  const savePlan = async () => {
    if (!formPlan.nombre.trim()) return toast.error('Nombre requerido');
    const row = { ...formPlan, id: editing?.id || uid(), company_id: companyId };
    await upsertDB('planes', row);
    await loadTable('vet_planes', setPlanes);
    toast.success('Plan guardado'); closeModal();
  };

  const saveFactura = async () => {
    if (!formFactura.mascota_id || formFactura.total <= 0) return toast.error('Mascota y total requeridos');
    const mascota = mascotas.find(m => m.id === formFactura.mascota_id);
    const prop = propietarios.find(p => p.id === mascota?.propietario_id);
    const saldo = formFactura.total - formFactura.abonado;
    const estado: FacturaStatus = formFactura.abonado >= formFactura.total ? 'PAGADA' : formFactura.abonado > 0 ? 'ABONO' : 'PENDIENTE';
    const row = { ...formFactura, id: uid(), company_id: companyId, saldo, estado, mascota_nombre: mascota?.nombre, propietario_nombre: prop?.nombre };
    await upsertDB('facturas', row);
    await loadTable('vet_facturas', setFacturas);
    toast.success('Factura generada'); closeModal();
  };

  const registrarAbono = async (facturaId: string) => {
    if (formAbono <= 0) return toast.error('Ingresa un abono válido');
    const f = facturas.find(x => x.id === facturaId);
    if (!f) return;
    const nuevoAbonado = (f.abonado || 0) + formAbono;
    const nuevoSaldo = f.total - nuevoAbonado;
    const nuevoEstado: FacturaStatus = nuevoSaldo <= 0 ? 'PAGADA' : 'ABONO';
    const row = { ...f, abonado: nuevoAbonado, saldo: Math.max(0, nuevoSaldo), estado: nuevoEstado };
    await upsertDB('facturas', row);
    await loadTable('vet_facturas', setFacturas);
    toast.success('Abono registrado'); setModal(null); setFormAbono(0);
  };

  const SETTER_MAP: Record<string, [any[], React.Dispatch<any>, string]> = {
    propietarios: [propietarios, setPropietarios, 'vet_propietarios'],
    mascotas:     [mascotas,     setMascotas,     'vet_mascotas'],
    personal:     [personal,     setPersonal,     'vet_personal'],
    consultorios: [consultorios, setConsultorios, 'vet_consultorios'],
    citas:        [citas,        setCitas,        'vet_citas'],
    historias:    [historias,    setHistorias,    'vet_historias_clinicas'],
    vacunas:      [vacunas,      setVacunas,      'vet_vacunas'],
    medicamentos: [medicamentos, setMedicamentos, 'vet_medicamentos'],
    servicios:    [servicios,    setServicios,    'vet_servicios'],
    planes:       [planes,       setPlanes,       'vet_planes'],
    facturas:     [facturas,     setFacturas,     'vet_facturas'],
  };

  const deleteItem = async (collection: string, id: string) => {
    const entry = SETTER_MAP[collection];
    if (!entry) return;
    const [, setter, table] = entry;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    setter((prev: any[]) => prev.filter(x => x.id !== id));
    toast.success('Eliminado');
  };

  const closeModal = () => { setModal(null); setEditing(null); };

  // ── ENVIAR AL POS ──────────────────────────────────────────────────────────
  const enviarAlPOS = (mascota: Mascota, propietario: Propietario | undefined, servicio: string, total: number) => {
    const params = new URLSearchParams({
      vet:      mascota.id!,
      cliente:  propietario?.nombre || mascota.nombre,
      cedula:   propietario?.documento || '',
      tel:      propietario?.telefono || '',
      email:    propietario?.correo || '',
      servicio,
      total:    total.toString(),
      ticket:   `VET-${mascota.id!.slice(0,6).toUpperCase()}`,
    });
    navigate(`/pos?${params.toString()}`);
  };

  const openEdit = (tab: string, item: any) => {
    setEditing(item);
    const formMap: Record<string, [React.Dispatch<any>, any]> = {
      propietarios: [setFormPropietario, item],
      mascotas:     [setFormMascota,     item],
      personal:     [setFormPersonal,    item],
      consultorios: [setFormConsultorio, item],
      citas:        [setFormCita,        item],
      historia:     [setFormHistoria,    item],
      vacunas:      [setFormVacuna,      item],
      medicamentos: [setFormMedicamento, item],
      servicios:    [setFormServicio,    item],
      planes:       [setFormPlan,        item],
    };
    const [setter, val] = formMap[tab] || [];
    if (setter) setter(val);
    setModal(tab);
  };

  // ─── STATS para dashboard ─────────────────────────────────────────────────
  const stats = {
    totalMascotas:    mascotas.length,
    citasHoy:         citas.filter(c => c.fecha === today() && c.estado === 'PROGRAMADA').length,
    hospitalizados:   hospitalizaciones.filter(h => h.estado === 'HOSPITALIZADO').length,
    vacunasPendientes: vacunas.filter(v => v.proxima_dosis && v.proxima_dosis <= today()).length,
    ingresosMes:      facturas.filter(f => f.fecha?.startsWith(today().slice(0,7))).reduce((s, f) => s + (f.abonado||0), 0),
    facturasPendientes: facturas.filter(f => f.estado !== 'PAGADA').length,
  };

  // ─── RENDER HELPERS ───────────────────────────────────────────────────────

  const fmtCurrency = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  const pill = (text: string, color: string) => (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: color + '22', color }}>{text}</span>
  );

  const statusPill = (status: string) => {
    const map: Record<string, [string, string]> = {
      PROGRAMADA: ['#3b82f6', 'Programada'], ATENDIDA: ['#10b981', 'Atendida'], CANCELADA: ['#ef4444', 'Cancelada'],
      ACTIVO: ['#10b981', 'Activo'], INACTIVO: ['#94a3b8', 'Inactivo'],
      DISPONIBLE: ['#10b981', 'Disponible'], OCUPADO: ['#f59e0b', 'Ocupado'],
      HOSPITALIZADO: ['#ef4444', 'Hospitalizado'], ALTA: ['#10b981', 'Alta'],
      PAGADA: ['#10b981', 'Pagada'], PENDIENTE: ['#f59e0b', 'Pendiente'], ABONO: ['#3b82f6', 'Abono'],
    };
    const [c, l] = map[status] || ['#94a3b8', status];
    return pill(l, c);
  };

  const mascotas_opts = mascotas.map(m => ({ value: m.id!, label: `${m.nombre} (${m.especie})` }));
  const personal_vets = personal.filter(p => p.tipo === 'VETERINARIO' || p.tipo === 'CIRUJANO');
  const personal_opts = personal.map(p => ({ value: p.id!, label: p.nombre }));
  const vet_opts = personal_vets.map(p => ({ value: p.id!, label: p.nombre }));
  const consultorio_opts = consultorios.map(c => ({ value: c.id!, label: c.nombre }));
  const propietario_opts = propietarios.map(p => ({ value: p.id!, label: p.nombre }));

  const filteredQ = (arr: any[], keys: string[]) => !searchQ ? arr :
    arr.filter(item => keys.some(k => (item[k] || '').toLowerCase().includes(searchQ.toLowerCase())));

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER TABS
  // ══════════════════════════════════════════════════════════════════════════

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card title="Mascotas"          value={stats.totalMascotas}    icon={<PawPrint size={22} />}    color="#0ea5e9" />
        <Card title="Citas Hoy"         value={stats.citasHoy}         icon={<Calendar size={22} />}    color="#8b5cf6" />
        <Card title="Hospitalizados"    value={stats.hospitalizados}   icon={<BedDouble size={22} />}   color="#ef4444" />
        <Card title="Vacunas Vencidas"  value={stats.vacunasPendientes} icon={<Syringe size={22} />}   color="#f59e0b" sub="Próximas/vencidas" />
        <Card title="Ingresos del Mes"  value={fmtCurrency(stats.ingresosMes)} icon={<DollarSign size={22} />} color="#10b981" />
        <Card title="Facturas Pendientes" value={stats.facturasPendientes} icon={<Receipt size={22} />} color="#6366f1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Citas de hoy */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><Calendar size={16} style={{ color: brandColor }} /> Citas de Hoy</h3>
          {citas.filter(c => c.fecha === today()).length === 0
            ? <p className="text-slate-400 text-sm text-center py-4">No hay citas para hoy</p>
            : citas.filter(c => c.fecha === today()).map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">{c.hora} — {c.mascota_nombre || 'N/A'}</p>
                  <p className="text-xs text-slate-400">{c.motivo} · {c.veterinario_nombre || 'Sin vet'}</p>
                </div>
                {statusPill(c.estado)}
              </div>
            ))
          }
        </div>

        {/* Vacunas próximas */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><Syringe size={16} style={{ color: '#f59e0b' }} /> Alertas de Vacunas</h3>
          {vacunas.filter(v => v.proxima_dosis).length === 0
            ? <p className="text-slate-400 text-sm text-center py-4">Sin alertas de vacunas</p>
            : vacunas.filter(v => v.proxima_dosis).slice(0, 5).map(v => {
              const vencida = v.proxima_dosis <= today();
              return (
                <div key={v.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="font-semibold text-slate-700 text-sm">{v.mascota_nombre} — {v.nombre_vacuna}</p>
                    <p className="text-xs text-slate-400">Próxima: {v.proxima_dosis}</p>
                  </div>
                  {pill(vencida ? 'Vencida' : 'Próxima', vencida ? '#ef4444' : '#f59e0b')}
                </div>
              );
            })
          }
        </div>
      </div>

      {/* Hospitalizaciones activas */}
      {stats.hospitalizados > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><BedDouble size={16} className="text-red-500" /> Pacientes Hospitalizados</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hospitalizaciones.filter(h => h.estado === 'HOSPITALIZADO').map(h => (
              <div key={h.id} className="rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="font-bold text-slate-700">{h.mascota_nombre || 'N/A'}</p>
                <p className="text-xs text-slate-500">Ingreso: {h.fecha_ingreso}</p>
                <p className="text-xs text-slate-500">Motivo: {h.motivo}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderPropietarios = () => (
    <TableWrapper headers={['Nombre','Documento','Teléfono','Correo','Mascotas','Acciones']}
      onAdd={() => { setFormPropietario(emptyPropietario()); setModal('propietarios'); }} btnLabel="Nuevo Propietario" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(propietarios, ['nombre','documento','telefono']).map(p => (
        <Row key={p.id}
          cells={[
            <span className="font-semibold">{p.nombre}</span>,
            p.documento, p.telefono, p.correo || '-',
            <span className="font-bold" style={{ color: brandColor }}>{mascotas.filter(m => m.propietario_id === p.id).length}</span>,
          ]}
          onEdit={() => openEdit('propietarios', p)}
          onDelete={() => deleteItem('propietarios', p.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderMascotas = () => (
    <TableWrapper headers={['Nombre','Propietario','Especie','Raza','Sexo','Fecha Nac.','Acciones']}
      onAdd={() => { setFormMascota(emptyMascota()); setModal('mascotas'); }} btnLabel="Nueva Mascota" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(mascotas, ['nombre','especie','raza','propietario_nombre']).map(m => (
        <Row key={m.id}
          cells={[
            <span className="font-semibold">{m.nombre}</span>,
            m.propietario_nombre || '-', m.especie, m.raza,
            m.sexo === 'MACHO' ? '♂ Macho' : '♀ Hembra',
            m.fecha_nacimiento,
          ]}
          onEdit={() => openEdit('mascotas', m)}
          onDelete={() => deleteItem('mascotas', m.id!)}
          onView={() => setDetailItem({ type: 'mascota', data: m })}
        />
      ))}
    </TableWrapper>
  );

  const renderPersonal = () => (
    <TableWrapper headers={['Nombre','Documento','Tipo','Especialidad','Teléfono','Estado','Acciones']}
      onAdd={() => { setFormPersonal(emptyPersonal()); setModal('personal'); }} btnLabel="Nuevo Personal" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(personal, ['nombre','documento','especialidad']).map(p => (
        <Row key={p.id}
          cells={[
            <span className="font-semibold">{p.nombre}</span>,
            p.documento, TIPOS_PERSONAL[p.tipo], p.especialidad, p.telefono,
            statusPill(p.estado),
          ]}
          onEdit={() => openEdit('personal', p)}
          onDelete={() => deleteItem('personal', p.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderConsultorios = () => (
    <TableWrapper headers={['Nombre','Veterinario','Auxiliar','Estado','Acciones']}
      onAdd={() => { setFormConsultorio(emptyConsultorio()); setModal('consultorios'); }} btnLabel="Nuevo Consultorio" brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {consultorios.map(c => (
        <Row key={c.id}
          cells={[
            <span className="font-semibold">{c.nombre}</span>,
            personal.find(p => p.id === c.veterinario_id)?.nombre || '-',
            personal.find(p => p.id === c.auxiliar_id)?.nombre || '-',
            statusPill(c.estado),
          ]}
          onEdit={() => openEdit('consultorios', c)}
          onDelete={() => deleteItem('consultorios', c.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderAgenda = () => (
    <TableWrapper headers={['Mascota','Propietario','Fecha','Hora','Veterinario','Motivo','Estado','Acciones']}
      onAdd={() => { setFormCita(emptyCita()); setModal('citas'); }} btnLabel="Nueva Cita" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(citas, ['mascota_nombre','propietario_nombre','motivo']).sort((a,b) => a.fecha > b.fecha ? -1 : 1).map(c => (
        <Row key={c.id}
          cells={[
            <span className="font-semibold">{c.mascota_nombre || '-'}</span>,
            c.propietario_nombre || '-', c.fecha, c.hora,
            c.veterinario_nombre || '-', c.motivo,
            statusPill(c.estado),
          ]}
          onEdit={() => openEdit('citas', c)}
          onDelete={() => deleteItem('citas', c.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderHistoria = () => (
    <TableWrapper headers={['Mascota','Fecha','Veterinario','Diagnóstico','Peso','T°','Acciones']}
      onAdd={() => { setFormHistoria(emptyHistoria()); setModal('historia'); }} btnLabel="Nueva Historia" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(historias, ['mascota_nombre','diagnostico']).sort((a,b) => a.fecha > b.fecha ? -1 : 1).map(h => (
        <Row key={h.id}
          cells={[
            <span className="font-semibold">{h.mascota_nombre || '-'}</span>,
            h.fecha,
            personal.find(p => p.id === h.veterinario_id)?.nombre || '-',
            <span className="max-w-[200px] truncate block">{h.diagnostico}</span>,
            h.peso ? `${h.peso} kg` : '-',
            h.temperatura ? `${h.temperatura}°C` : '-',
          ]}
          onView={() => setDetailItem({ type: 'historia', data: h })}
          onDelete={() => deleteItem('historias', h.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderVacunacion = () => (
    <div className="space-y-4">
      <TableWrapper headers={['Mascota','Vacuna','Fecha Aplicada','Próxima Dosis','Veterinario','Estado','Acciones']}
        onAdd={() => { setFormVacuna(emptyVacuna()); setModal('vacunas'); }} btnLabel="Registrar Vacuna" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
        {filteredQ(vacunas, ['mascota_nombre','nombre_vacuna']).sort((a,b) => a.fecha_aplicada > b.fecha_aplicada ? -1 : 1).map(v => {
          const vencida = v.proxima_dosis && v.proxima_dosis <= today();
          return (
            <Row key={v.id}
              cells={[
                <span className="font-semibold">{v.mascota_nombre || '-'}</span>,
                v.nombre_vacuna, v.fecha_aplicada,
                v.proxima_dosis || '-',
                personal.find(p => p.id === v.veterinario_id)?.nombre || '-',
                v.proxima_dosis ? pill(vencida ? 'Vencida' : 'Vigente', vencida ? '#ef4444' : '#10b981') : '-',
              ]}
              onDelete={() => deleteItem('vacunas', v.id!)}
            />
          );
        })}
      </TableWrapper>
    </div>
  );

  const renderPeso = () => {
    const mascotaSeleccionada = mascotas[0];
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={() => { setFormPeso(emptyPeso()); setModal('peso'); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow"
            style={{ background: brandColor }}>
            <Plus size={16} /> Registrar Peso
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mascotas.map(m => {
            const registros = pesos.filter(p => p.mascota_id === m.id).sort((a,b) => a.fecha > b.fecha ? -1 : 1);
            if (registros.length === 0) return null;
            return (
              <div key={m.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <PawPrint size={16} style={{ color: brandColor }} /> {m.nombre}
                  <span className="text-xs text-slate-400 font-normal">({m.especie})</span>
                </h4>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100">
                    <th className="text-left py-1 text-xs text-slate-400">Fecha</th>
                    <th className="text-left py-1 text-xs text-slate-400">Peso</th>
                    <th className="text-left py-1 text-xs text-slate-400">Obs.</th>
                  </tr></thead>
                  <tbody>
                    {registros.map(r => (
                      <tr key={r.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-1.5">{r.fecha}</td>
                        <td className="py-1.5 font-semibold">{r.peso} kg</td>
                        <td className="py-1.5 text-slate-400 text-xs">{r.observaciones}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {pesos.length === 0 && (
            <div className="col-span-2 text-center py-10 text-slate-400">No hay registros de peso. ¡Registra el primer control!</div>
          )}
        </div>
      </div>
    );
  };

  const renderHospitalizacion = () => (
    <TableWrapper headers={['Mascota','Fecha Ingreso','Veterinario','Motivo','Estado','Acciones']}
      onAdd={() => { setFormHospitalizacion(emptyHospitalizacion()); setModal('hospitalizacion'); }} btnLabel="Nueva Hospitalización" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(hospitalizaciones, ['mascota_nombre','motivo']).sort((a,b) => a.fecha_ingreso > b.fecha_ingreso ? -1 : 1).map(h => (
        <Row key={h.id}
          cells={[
            <span className="font-semibold">{h.mascota_nombre || '-'}</span>,
            h.fecha_ingreso,
            personal.find(p => p.id === h.veterinario_id)?.nombre || '-',
            h.motivo, statusPill(h.estado),
          ]}
          onEdit={() => openEdit('hospitalizacion', h)}
          onDelete={() => deleteItem('hospitalizaciones', h.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderFarmacia = () => (
    <TableWrapper headers={['Nombre','Tipo','Presentación','Stock','Precio','Acciones']}
      onAdd={() => { setFormMedicamento(emptyMedicamento()); setModal('medicamentos'); }} btnLabel="Nuevo Medicamento" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(medicamentos, ['nombre','tipo']).map(m => (
        <Row key={m.id}
          cells={[
            <span className="font-semibold">{m.nombre}</span>,
            m.tipo, m.presentacion,
            <span className={`font-bold ${m.stock < 5 ? 'text-red-500' : 'text-slate-700'}`}>{m.stock}</span>,
            fmtCurrency(m.precio),
          ]}
          onEdit={() => openEdit('medicamentos', m)}
          onDelete={() => deleteItem('medicamentos', m.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderServicios = () => (
    <TableWrapper headers={['Nombre','Descripción','Precio','Estado','Acciones']}
      onAdd={() => { setFormServicio(emptyServicio()); setModal('servicios'); }} btnLabel="Nuevo Servicio" brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {servicios.map(s => (
        <Row key={s.id}
          cells={[
            <span className="font-semibold">{s.nombre}</span>,
            s.descripcion,
            <span className="font-bold text-emerald-600">{fmtCurrency(s.precio)}</span>,
            statusPill(s.activo ? 'ACTIVO' : 'INACTIVO'),
          ]}
          onEdit={() => openEdit('servicios', s)}
          onDelete={() => deleteItem('servicios', s.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderPlanes = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setFormPlan(emptyPlan()); setModal('planes'); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow"
          style={{ background: brandColor }}>
          <Plus size={16} /> Nuevo Plan
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {planes.map(p => (
          <div key={p.id} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-bold text-slate-800">{p.nombre}</h4>
                {statusPill(p.estado)}
              </div>
              <p className="text-2xl font-extrabold" style={{ color: brandColor }}>{fmtCurrency(p.precio)}</p>
            </div>
            <p className="text-sm text-slate-500 mb-2">{p.servicios_incluidos}</p>
            {p.descuento > 0 && <p className="text-xs font-semibold text-emerald-600">{p.descuento}% descuento en medicamentos</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={() => openEdit('planes', p)} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">Editar</button>
              <button onClick={() => deleteItem('planes', p.id!)} className="px-3 py-1.5 rounded-lg border border-red-100 text-xs font-semibold text-red-400 hover:bg-red-50">Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderFacturacion = () => {
    const handleEnviarPOS = () => {
      if (!formPOS.mascota_id || !formPOS.servicio.trim() || !parseFloat(formPOS.total)) {
        toast.error('Completa mascota, servicio y total');
        return;
      }
      const mascota = mascotas.find(m => m.id === formPOS.mascota_id);
      const prop = propietarios.find(p => p.id === mascota?.propietario_id);
      if (!mascota) return;
      enviarAlPOS(mascota, prop, formPOS.servicio, parseFloat(formPOS.total));
    };

    return (
    <div className="space-y-6">
      {/* ── Enviar al POS ── */}
      <div className="bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center">
            <ShoppingCart size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Generar Factura en POS</h3>
            <p className="text-xs text-slate-500">Envía el servicio directamente al Punto de Venta para facturar</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* Mascota */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Mascota / Paciente <span className="text-red-400">*</span></label>
            <select value={formPOS.mascota_id} onChange={e => setFormPOS(f => ({...f, mascota_id: e.target.value}))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none bg-white">
              <option value="">Seleccionar mascota...</option>
              {mascotas.map(m => {
                const prop = propietarios.find(p => p.id === m.propietario_id);
                return <option key={m.id} value={m.id}>{m.nombre} ({m.especie}){prop ? ` — ${prop.nombre}` : ''}</option>;
              })}
            </select>
          </div>

          {/* Servicio */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Servicio / Descripción <span className="text-red-400">*</span></label>
            <select value={formPOS.servicio} onChange={e => setFormPOS(f => ({...f, servicio: e.target.value}))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none bg-white">
              <option value="">Seleccionar o escribir...</option>
              {servicios.filter(s => s.activo).map(s => (
                <option key={s.id} value={s.nombre}>{s.nombre} — {fmtCurrency(s.precio)}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="O escribe el servicio manualmente..."
              value={formPOS.servicio}
              onChange={e => setFormPOS(f => ({...f, servicio: e.target.value}))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none mt-1"
            />
          </div>

          {/* Total */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Total a cobrar <span className="text-red-400">*</span></label>
            <input
              type="number"
              placeholder="0"
              value={formPOS.total}
              onChange={e => {
                const v = e.target.value;
                setFormPOS(f => ({...f, total: v}));
                // Auto-fill from selected service
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
            />
          </div>
        </div>

        {/* Preview propietario */}
        {formPOS.mascota_id && (() => {
          const m = mascotas.find(x => x.id === formPOS.mascota_id);
          const p = propietarios.find(x => x.id === m?.propietario_id);
          return m ? (
            <div className="bg-white rounded-xl border border-sky-100 p-3 mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center"><PawPrint size={16} className="text-sky-500" /></div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">{m.nombre} <span className="text-slate-400 font-normal">({m.especie} · {m.raza})</span></p>
                {p && <p className="text-xs text-slate-500">Propietario: {p.nombre} · {p.telefono}</p>}
              </div>
              {formPOS.total && <p className="font-bold text-lg text-sky-600">{fmtCurrency(parseFloat(formPOS.total) || 0)}</p>}
            </div>
          ) : null;
        })()}

        <button onClick={handleEnviarPOS}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold shadow-lg hover:opacity-90 transition-opacity"
          style={{ background: `linear-gradient(135deg, ${brandColor}, #6366f1)` }}>
          <ShoppingCart size={18} /> Ir al POS y Facturar
        </button>
      </div>

      {/* ── Historial de cobros internos / abonos ── */}
      <div>
        <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Receipt size={16} style={{ color: brandColor }} /> Historial de Cobros Veterinarios
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Mascota','Propietario','Fecha','Servicio','Total','Abonado','Saldo','Estado','Acciones'].map(h =>
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">{h}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {facturas.sort((a,b) => a.fecha > b.fecha ? -1 : 1).map(f => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">{f.mascota_nombre || '-'}</td>
                  <td className="px-4 py-3">{f.propietario_nombre || '-'}</td>
                  <td className="px-4 py-3">{f.fecha}</td>
                  <td className="px-4 py-3 max-w-[160px] truncate">{f.servicio_descripcion}</td>
                  <td className="px-4 py-3 font-bold">{fmtCurrency(f.total)}</td>
                  <td className="px-4 py-3 text-emerald-600 font-semibold">{fmtCurrency(f.abonado)}</td>
                  <td className="px-4 py-3 text-red-500 font-semibold">{fmtCurrency(f.saldo)}</td>
                  <td className="px-4 py-3">{statusPill(f.estado)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {f.estado !== 'PAGADA' && (
                        <button
                          onClick={() => {
                            const mascota = mascotas.find(m => m.id === f.mascota_id);
                            const prop = propietarios.find(p => p.id === mascota?.propietario_id);
                            const saldo = f.saldo || (f.total - (f.abonado || 0));
                            if (mascota) enviarAlPOS(mascota, prop, f.servicio_descripcion, saldo);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-white"
                          style={{ background: brandColor }}>
                          <ShoppingCart size={11} /> Cobrar Saldo
                        </button>
                      )}
                      <button onClick={() => deleteItem('facturas', f.id!)} className="p-1.5 rounded hover:bg-red-50 text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {facturas.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-slate-400">Las facturas generadas desde el POS aparecerán aquí</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );};

  // ─── TAB CONTENT MAP ──────────────────────────────────────────────────────
  const tabContent: Record<TabId, () => React.ReactNode> = {
    dashboard:       renderDashboard,
    propietarios:    renderPropietarios,
    mascotas:        renderMascotas,
    personal:        renderPersonal,
    consultorios:    renderConsultorios,
    agenda:          renderAgenda,
    historia:        renderHistoria,
    vacunacion:      renderVacunacion,
    peso:            renderPeso,
    hospitalizacion: renderHospitalizacion,
    farmacia:        renderFarmacia,
    servicios:       renderServicios,
    planes:          renderPlanes,
    facturacion:     renderFacturacion,
  };

  // ─── DETAIL VIEWS ─────────────────────────────────────────────────────────
  const renderDetail = () => {
    if (!detailItem) return null;

    if (detailItem.type === 'mascota') {
      const m: Mascota = detailItem.data;
      const prop = propietarios.find(p => p.id === m.propietario_id);
      const histMascota = historias.filter(h => h.mascota_id === m.id).sort((a,b) => a.fecha > b.fecha ? -1 : 1);
      const vacMascota = vacunas.filter(v => v.mascota_id === m.id);
      const pesosMascota = pesos.filter(p => p.mascota_id === m.id).sort((a,b) => a.fecha > b.fecha ? -1 : 1);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100" style={{ background: brandColor }}>
              <h3 className="font-bold text-lg text-white flex items-center gap-2"><PawPrint size={20} /> {m.nombre}</h3>
              <button onClick={() => setDetailItem(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Propietario:</span> <strong>{prop?.nombre}</strong></div>
                <div><span className="text-slate-400">Especie/Raza:</span> <strong>{m.especie} · {m.raza}</strong></div>
                <div><span className="text-slate-400">Sexo:</span> <strong>{m.sexo}</strong></div>
                <div><span className="text-slate-400">F. Nacimiento:</span> <strong>{m.fecha_nacimiento}</strong></div>
                <div><span className="text-slate-400">Color:</span> <strong>{m.color}</strong></div>
                <div><span className="text-slate-400">Microchip:</span> <strong>{m.microchip || 'N/A'}</strong></div>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-2">Historial Clínico ({histMascota.length})</h4>
                {histMascota.length === 0 ? <p className="text-slate-400 text-sm">Sin historia clínica</p> :
                  histMascota.slice(0,3).map(h => (
                    <div key={h.id} className="border border-slate-100 rounded-lg p-3 mb-2">
                      <p className="text-xs text-slate-400">{h.fecha} · {personal.find(p=>p.id===h.veterinario_id)?.nombre}</p>
                      <p className="font-semibold text-sm text-slate-700">{h.diagnostico}</p>
                      <p className="text-xs text-slate-500">{h.tratamiento}</p>
                    </div>
                  ))
                }
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-2">Vacunas ({vacMascota.length})</h4>
                {vacMascota.length === 0 ? <p className="text-slate-400 text-sm">Sin vacunas</p> :
                  <table className="w-full text-xs"><thead><tr className="border-b border-slate-100">
                    <th className="text-left py-1 text-slate-400">Vacuna</th>
                    <th className="text-left py-1 text-slate-400">Aplicada</th>
                    <th className="text-left py-1 text-slate-400">Próxima</th>
                  </tr></thead><tbody>
                  {vacMascota.map(v => <tr key={v.id} className="border-b border-slate-50"><td className="py-1 font-medium">{v.nombre_vacuna}</td><td>{v.fecha_aplicada}</td><td>{v.proxima_dosis}</td></tr>)}
                  </tbody></table>
                }
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-2">Control de Peso</h4>
                {pesosMascota.length === 0 ? <p className="text-slate-400 text-sm">Sin registros</p> :
                  <div className="flex gap-2 flex-wrap">
                    {pesosMascota.map(p => (
                      <div key={p.id} className="bg-slate-50 rounded-lg px-3 py-2 text-xs">
                        <p className="text-slate-400">{p.fecha}</p>
                        <p className="font-bold text-slate-700">{p.peso} kg</p>
                      </div>
                    ))}
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (detailItem.type === 'historia') {
      const h: HistoriaClinica = detailItem.data;
      const mascota = mascotas.find(m => m.id === h.mascota_id);
      const vet = personal.find(p => p.id === h.veterinario_id);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800">Historia Clínica</h3>
              <button onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-slate-400">Paciente:</span> <strong>{mascota?.nombre}</strong></div>
                <div><span className="text-slate-400">Fecha:</span> <strong>{h.fecha}</strong></div>
                <div><span className="text-slate-400">Veterinario:</span> <strong>{vet?.nombre}</strong></div>
                <div><span className="text-slate-400">Peso:</span> <strong>{h.peso} kg</strong></div>
                <div><span className="text-slate-400">Temperatura:</span> <strong>{h.temperatura}°C</strong></div>
              </div>
              <div><span className="text-slate-400 font-semibold">Diagnóstico:</span><p className="mt-1 p-3 bg-slate-50 rounded-lg">{h.diagnostico}</p></div>
              <div><span className="text-slate-400 font-semibold">Tratamiento:</span><p className="mt-1 p-3 bg-slate-50 rounded-lg">{h.tratamiento}</p></div>
              {h.medicamentos && <div><span className="text-slate-400 font-semibold">Medicamentos:</span><p className="mt-1 p-3 bg-slate-50 rounded-lg">{h.medicamentos}</p></div>}
              {h.observaciones && <div><span className="text-slate-400 font-semibold">Observaciones:</span><p className="mt-1 p-3 bg-slate-50 rounded-lg">{h.observaciones}</p></div>}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // MODALS
  // ══════════════════════════════════════════════════════════════════════════

  const renderModals = () => (
    <>
      {modal === 'propietarios' && (
        <ModalWrapper title={editing?.id ? 'Editar Propietario' : 'Nuevo Propietario'} onClose={closeModal} onSave={savePropietario} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre completo *" value={formPropietario.nombre} onChange={v => setFormPropietario(f => ({...f, nombre: v}))} required /></div>
            <Input label="Documento" value={formPropietario.documento} onChange={v => setFormPropietario(f => ({...f, documento: v}))} />
            <Input label="Teléfono" value={formPropietario.telefono} onChange={v => setFormPropietario(f => ({...f, telefono: v}))} />
            <Input label="Correo" value={formPropietario.correo} onChange={v => setFormPropietario(f => ({...f, correo: v}))} type="email" />
            <Input label="Dirección" value={formPropietario.direccion} onChange={v => setFormPropietario(f => ({...f, direccion: v}))} />
            <div className="col-span-2"><Textarea label="Observaciones" value={formPropietario.observaciones} onChange={v => setFormPropietario(f => ({...f, observaciones: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'mascotas' && (
        <ModalWrapper title={editing?.id ? 'Editar Mascota' : 'Nueva Mascota'} onClose={closeModal} onSave={saveMascota} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre *" value={formMascota.nombre} onChange={v => setFormMascota(f => ({...f, nombre: v}))} required />
            <Select label="Propietario *" value={formMascota.propietario_id}
              onChange={v => setFormMascota(f => ({...f, propietario_id: v}))}
              options={[{value:'', label:'Seleccionar...'}, ...propietario_opts]} />
            <Select label="Especie" value={formMascota.especie}
              onChange={v => setFormMascota(f => ({...f, especie: v}))}
              options={ESPECIES.map(e => ({value: e, label: e}))} />
            <Input label="Raza" value={formMascota.raza} onChange={v => setFormMascota(f => ({...f, raza: v}))} />
            <Select label="Sexo" value={formMascota.sexo}
              onChange={v => setFormMascota(f => ({...f, sexo: v as any}))}
              options={[{value:'MACHO', label:'Macho'},{value:'HEMBRA', label:'Hembra'}]} />
            <Input label="Fecha de Nacimiento" value={formMascota.fecha_nacimiento} onChange={v => setFormMascota(f => ({...f, fecha_nacimiento: v}))} type="date" />
            <Input label="Peso Inicial (kg)" value={formMascota.peso_inicial} onChange={v => setFormMascota(f => ({...f, peso_inicial: v}))} type="number" />
            <Input label="Color" value={formMascota.color} onChange={v => setFormMascota(f => ({...f, color: v}))} />
            <div className="col-span-2"><Input label="Microchip" value={formMascota.microchip} onChange={v => setFormMascota(f => ({...f, microchip: v}))} /></div>
            <div className="col-span-2"><Textarea label="Observaciones" value={formMascota.observaciones} onChange={v => setFormMascota(f => ({...f, observaciones: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'personal' && (
        <ModalWrapper title={editing?.id ? 'Editar Personal' : 'Nuevo Personal'} onClose={closeModal} onSave={savePersonal} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre *" value={formPersonal.nombre} onChange={v => setFormPersonal(f => ({...f, nombre: v}))} required /></div>
            <Input label="Documento" value={formPersonal.documento} onChange={v => setFormPersonal(f => ({...f, documento: v}))} />
            <Input label="Teléfono" value={formPersonal.telefono} onChange={v => setFormPersonal(f => ({...f, telefono: v}))} />
            <Select label="Tipo" value={formPersonal.tipo}
              onChange={v => setFormPersonal(f => ({...f, tipo: v as PersonalType}))}
              options={Object.entries(TIPOS_PERSONAL).map(([k,l]) => ({value:k, label:l}))} />
            <Input label="Especialidad" value={formPersonal.especialidad} onChange={v => setFormPersonal(f => ({...f, especialidad: v}))} />
            <Select label="Estado" value={formPersonal.estado}
              onChange={v => setFormPersonal(f => ({...f, estado: v as PersonalStatus}))}
              options={[{value:'ACTIVO',label:'Activo'},{value:'INACTIVO',label:'Inactivo'}]} />
          </div>
        </ModalWrapper>
      )}

      {modal === 'consultorios' && (
        <ModalWrapper title={editing?.id ? 'Editar Consultorio' : 'Nuevo Consultorio'} onClose={closeModal} onSave={saveConsultorio} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre *" value={formConsultorio.nombre} onChange={v => setFormConsultorio(f => ({...f, nombre: v}))} required /></div>
            <Select label="Veterinario" value={formConsultorio.veterinario_id}
              onChange={v => setFormConsultorio(f => ({...f, veterinario_id: v}))}
              options={[{value:'', label:'Sin asignar'}, ...vet_opts]} />
            <Select label="Auxiliar" value={formConsultorio.auxiliar_id}
              onChange={v => setFormConsultorio(f => ({...f, auxiliar_id: v}))}
              options={[{value:'', label:'Sin asignar'}, ...personal_opts]} />
            <Select label="Estado" value={formConsultorio.estado}
              onChange={v => setFormConsultorio(f => ({...f, estado: v as ConsultorioStatus}))}
              options={[{value:'DISPONIBLE',label:'Disponible'},{value:'OCUPADO',label:'Ocupado'},{value:'INACTIVO',label:'Inactivo'}]} />
            <div className="col-span-2"><Textarea label="Observaciones" value={formConsultorio.observaciones} onChange={v => setFormConsultorio(f => ({...f, observaciones: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'citas' && (
        <ModalWrapper title={editing?.id ? 'Editar Cita' : 'Nueva Cita'} onClose={closeModal} onSave={saveCita} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mascota *" value={formCita.mascota_id}
              onChange={v => {
                const mascota = mascotas.find(m => m.id === v);
                setFormCita(f => ({...f, mascota_id: v, propietario_id: mascota?.propietario_id || ''}));
              }}
              options={[{value:'', label:'Seleccionar...'}, ...mascotas_opts]} />
            <Select label="Veterinario" value={formCita.veterinario_id}
              onChange={v => setFormCita(f => ({...f, veterinario_id: v}))}
              options={[{value:'', label:'Sin asignar'}, ...vet_opts]} />
            <Input label="Fecha *" value={formCita.fecha} onChange={v => setFormCita(f => ({...f, fecha: v}))} type="date" />
            <Input label="Hora" value={formCita.hora} onChange={v => setFormCita(f => ({...f, hora: v}))} type="time" />
            <Select label="Consultorio" value={formCita.consultorio_id}
              onChange={v => setFormCita(f => ({...f, consultorio_id: v}))}
              options={[{value:'', label:'Sin asignar'}, ...consultorio_opts]} />
            <Select label="Estado" value={formCita.estado}
              onChange={v => setFormCita(f => ({...f, estado: v as CitaStatus}))}
              options={[{value:'PROGRAMADA',label:'Programada'},{value:'ATENDIDA',label:'Atendida'},{value:'CANCELADA',label:'Cancelada'}]} />
            <div className="col-span-2"><Input label="Motivo" value={formCita.motivo} onChange={v => setFormCita(f => ({...f, motivo: v}))} /></div>
            <div className="col-span-2"><Textarea label="Notas" value={formCita.notas} onChange={v => setFormCita(f => ({...f, notas: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'historia' && (
        <ModalWrapper title="Nueva Historia Clínica" onClose={closeModal} onSave={saveHistoria} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mascota *" value={formHistoria.mascota_id}
              onChange={v => setFormHistoria(f => ({...f, mascota_id: v}))}
              options={[{value:'', label:'Seleccionar...'}, ...mascotas_opts]} />
            <Select label="Veterinario" value={formHistoria.veterinario_id}
              onChange={v => setFormHistoria(f => ({...f, veterinario_id: v}))}
              options={[{value:'', label:'Sin asignar'}, ...vet_opts]} />
            <Input label="Fecha" value={formHistoria.fecha} onChange={v => setFormHistoria(f => ({...f, fecha: v}))} type="date" />
            <Select label="Consultorio" value={formHistoria.consultorio_id}
              onChange={v => setFormHistoria(f => ({...f, consultorio_id: v}))}
              options={[{value:'', label:'Sin asignar'}, ...consultorio_opts]} />
            <Input label="Peso (kg)" value={formHistoria.peso} onChange={v => setFormHistoria(f => ({...f, peso: v}))} type="number" />
            <Input label="Temperatura (°C)" value={formHistoria.temperatura} onChange={v => setFormHistoria(f => ({...f, temperatura: v}))} type="number" />
            <div className="col-span-2"><Textarea label="Diagnóstico *" value={formHistoria.diagnostico} onChange={v => setFormHistoria(f => ({...f, diagnostico: v}))} /></div>
            <div className="col-span-2"><Textarea label="Tratamiento" value={formHistoria.tratamiento} onChange={v => setFormHistoria(f => ({...f, tratamiento: v}))} /></div>
            <div className="col-span-2"><Textarea label="Medicamentos" value={formHistoria.medicamentos} onChange={v => setFormHistoria(f => ({...f, medicamentos: v}))} rows={2} /></div>
            <div className="col-span-2"><Textarea label="Observaciones" value={formHistoria.observaciones} onChange={v => setFormHistoria(f => ({...f, observaciones: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'vacunas' && (
        <ModalWrapper title="Registrar Vacuna" onClose={closeModal} onSave={saveVacuna} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mascota *" value={formVacuna.mascota_id}
              onChange={v => setFormVacuna(f => ({...f, mascota_id: v}))}
              options={[{value:'', label:'Seleccionar...'}, ...mascotas_opts]} />
            <Input label="Nombre de la Vacuna *" value={formVacuna.nombre_vacuna} onChange={v => setFormVacuna(f => ({...f, nombre_vacuna: v}))} />
            <Input label="Fecha Aplicada" value={formVacuna.fecha_aplicada} onChange={v => setFormVacuna(f => ({...f, fecha_aplicada: v}))} type="date" />
            <Input label="Próxima Dosis" value={formVacuna.proxima_dosis} onChange={v => setFormVacuna(f => ({...f, proxima_dosis: v}))} type="date" />
            <div className="col-span-2">
              <Select label="Veterinario" value={formVacuna.veterinario_id}
                onChange={v => setFormVacuna(f => ({...f, veterinario_id: v}))}
                options={[{value:'', label:'Sin asignar'}, ...vet_opts]} />
            </div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'peso' && (
        <ModalWrapper title="Registrar Peso" onClose={closeModal} onSave={savePeso} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mascota *" value={formPeso.mascota_id}
              onChange={v => setFormPeso(f => ({...f, mascota_id: v}))}
              options={[{value:'', label:'Seleccionar...'}, ...mascotas_opts]} />
            <Input label="Fecha" value={formPeso.fecha} onChange={v => setFormPeso(f => ({...f, fecha: v}))} type="date" />
            <Input label="Peso (kg) *" value={formPeso.peso} onChange={v => setFormPeso(f => ({...f, peso: v}))} type="number" />
            <div className="col-span-1"><Textarea label="Observaciones" value={formPeso.observaciones} onChange={v => setFormPeso(f => ({...f, observaciones: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'hospitalizacion' && (
        <ModalWrapper title="Nueva Hospitalización" onClose={closeModal} onSave={saveHospitalizacion} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mascota *" value={formHospitalizacion.mascota_id}
              onChange={v => setFormHospitalizacion(f => ({...f, mascota_id: v}))}
              options={[{value:'', label:'Seleccionar...'}, ...mascotas_opts]} />
            <Select label="Veterinario" value={formHospitalizacion.veterinario_id}
              onChange={v => setFormHospitalizacion(f => ({...f, veterinario_id: v}))}
              options={[{value:'', label:'Sin asignar'}, ...vet_opts]} />
            <Input label="Fecha Ingreso" value={formHospitalizacion.fecha_ingreso} onChange={v => setFormHospitalizacion(f => ({...f, fecha_ingreso: v}))} type="date" />
            <Select label="Estado" value={formHospitalizacion.estado}
              onChange={v => setFormHospitalizacion(f => ({...f, estado: v as HospitalizacionStatus}))}
              options={[{value:'HOSPITALIZADO',label:'Hospitalizado'},{value:'ALTA',label:'Alta'}]} />
            <div className="col-span-2"><Textarea label="Motivo / Diagnóstico *" value={formHospitalizacion.motivo} onChange={v => setFormHospitalizacion(f => ({...f, motivo: v}))} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'medicamentos' && (
        <ModalWrapper title={editing?.id ? 'Editar Medicamento' : 'Nuevo Medicamento'} onClose={closeModal} onSave={saveMedicamento} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre *" value={formMedicamento.nombre} onChange={v => setFormMedicamento(f => ({...f, nombre: v}))} required /></div>
            <Select label="Tipo" value={formMedicamento.tipo}
              onChange={v => setFormMedicamento(f => ({...f, tipo: v}))}
              options={TIPOS_MEDICAMENTO.map(t => ({value:t, label:t}))} />
            <Input label="Presentación" value={formMedicamento.presentacion} onChange={v => setFormMedicamento(f => ({...f, presentacion: v}))} />
            <Input label="Stock" value={formMedicamento.stock} onChange={v => setFormMedicamento(f => ({...f, stock: v}))} type="number" />
            <Input label="Precio" value={formMedicamento.precio} onChange={v => setFormMedicamento(f => ({...f, precio: v}))} type="number" />
          </div>
        </ModalWrapper>
      )}

      {modal === 'servicios' && (
        <ModalWrapper title={editing?.id ? 'Editar Servicio' : 'Nuevo Servicio'} onClose={closeModal} onSave={saveServicio} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre *" value={formServicio.nombre} onChange={v => setFormServicio(f => ({...f, nombre: v}))} required /></div>
            <Input label="Precio" value={formServicio.precio} onChange={v => setFormServicio(f => ({...f, precio: v}))} type="number" />
            <Select label="Estado" value={formServicio.activo ? 'ACTIVO' : 'INACTIVO'}
              onChange={v => setFormServicio(f => ({...f, activo: v === 'ACTIVO'}))}
              options={[{value:'ACTIVO',label:'Activo'},{value:'INACTIVO',label:'Inactivo'}]} />
            <div className="col-span-2"><Textarea label="Descripción" value={formServicio.descripcion} onChange={v => setFormServicio(f => ({...f, descripcion: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'planes' && (
        <ModalWrapper title={editing?.id ? 'Editar Plan' : 'Nuevo Plan'} onClose={closeModal} onSave={savePlan} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre del Plan *" value={formPlan.nombre} onChange={v => setFormPlan(f => ({...f, nombre: v}))} required /></div>
            <Input label="Precio" value={formPlan.precio} onChange={v => setFormPlan(f => ({...f, precio: v}))} type="number" />
            <Input label="Descuento en Medicamentos (%)" value={formPlan.descuento} onChange={v => setFormPlan(f => ({...f, descuento: v}))} type="number" />
            <Select label="Estado" value={formPlan.estado}
              onChange={v => setFormPlan(f => ({...f, estado: v as 'ACTIVO'|'INACTIVO'}))}
              options={[{value:'ACTIVO',label:'Activo'},{value:'INACTIVO',label:'Inactivo'}]} />
            <div className="col-span-2"><Textarea label="Servicios Incluidos" value={formPlan.servicios_incluidos} onChange={v => setFormPlan(f => ({...f, servicios_incluidos: v}))} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'facturas' && (
        <ModalWrapper title="Nueva Factura" onClose={closeModal} onSave={saveFactura} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mascota *" value={formFactura.mascota_id}
              onChange={v => setFormFactura(f => ({...f, mascota_id: v}))}
              options={[{value:'', label:'Seleccionar...'}, ...mascotas_opts]} />
            <Input label="Fecha" value={formFactura.fecha} onChange={v => setFormFactura(f => ({...f, fecha: v}))} type="date" />
            <div className="col-span-2"><Input label="Descripción de Servicio" value={formFactura.servicio_descripcion} onChange={v => setFormFactura(f => ({...f, servicio_descripcion: v}))} /></div>
            <Input label="Total" value={formFactura.total} onChange={v => setFormFactura(f => ({...f, total: v}))} type="number" />
            <Input label="Abono Inicial" value={formFactura.abonado} onChange={v => setFormFactura(f => ({...f, abonado: v}))} type="number" />
            <div className="col-span-2"><Textarea label="Notas" value={formFactura.notas} onChange={v => setFormFactura(f => ({...f, notas: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'abono' && detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800">Registrar Abono</h3>
              <button onClick={() => { setModal(null); setDetailItem(null); setFormAbono(0); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                <p className="text-sm text-slate-500">Factura: <span className="font-semibold text-slate-700">{detailItem.servicio_descripcion}</span></p>
                <p className="text-sm text-slate-500">Total: <span className="font-bold text-slate-800">{fmtCurrency(detailItem.total)}</span></p>
                <p className="text-sm text-slate-500">Abonado: <span className="font-bold text-emerald-600">{fmtCurrency(detailItem.abonado)}</span></p>
                <p className="text-sm text-slate-500">Saldo: <span className="font-bold text-red-500">{fmtCurrency(detailItem.saldo)}</span></p>
              </div>
              <Input label="Valor del Abono" value={formAbono} onChange={v => setFormAbono(v)} type="number" />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => { setModal(null); setDetailItem(null); setFormAbono(0); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium">Cancelar</button>
              <button onClick={() => registrarAbono(detailItem.id!)} className="px-5 py-2 rounded-lg text-white text-sm font-semibold shadow" style={{ background: brandColor }}>Abonar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: brandColor + '20' }}>
            <PawPrint size={22} style={{ color: brandColor }} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">Veterinaria</h1>
            <p className="text-sm text-slate-400">Gestión integral de clínica veterinaria</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-hide">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setSearchQ(''); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === t.id ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
            }`}
            style={activeTab === t.id ? { background: brandColor } : {}}>
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        {tabContent[activeTab]()}
      </div>

      {/* Modals */}
      {renderModals()}

      {/* Detail Views */}
      {detailItem && renderDetail()}
    </div>
  );
};

export default Veterinaria;