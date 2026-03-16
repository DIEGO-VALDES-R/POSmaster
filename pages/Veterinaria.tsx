import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Search, User, Users, Calendar, FileText,
  Heart, DollarSign, CheckCircle, Clock, XCircle,
  Edit2, Trash2, Eye, Phone, Mail, MapPin, Activity,
  BarChart2, Syringe, Weight, BedDouble, Pill, Star,
  ChevronDown, ChevronRight, AlertCircle, PawPrint,
  Stethoscope, ClipboardList, ShoppingCart, Receipt,
  TrendingUp, Package, RefreshCw, Printer,
  FlaskConical, FileCheck, Bell, MessageSquare,
  AlertTriangle, Download, Grid, List
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import RefreshButton from '../components/RefreshButton';
import ImportModuleModal, { ModuleType } from '../components/ImportModuleModal';
import VetFacturacionClinica from '../components/VetFacturacionClinica';
import { useDatabase } from '../contexts/DatabaseContext';
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
  foto_url?: string; esterilizado?: boolean; seguro?: string;
}

interface Personal {
  id?: string; company_id?: string;
  nombre: string; documento: string; tipo: PersonalType;
  especialidad: string; telefono: string; estado: PersonalStatus;
  registro_profesional?: string;
}

interface Consultorio {
  id?: string; company_id?: string;
  nombre: string; veterinario_id: string; auxiliar_id: string;
  estado: ConsultorioStatus; observaciones: string;
}

// Tipos de atención disponibles para veterinarias con convenio público
type TipoAtencion = 'PARTICULAR' | 'ALCALDIA' | 'GOBERNACION' | 'JORNADA_GRATUITA' | 'RURAL' | 'OTRO_CONVENIO';

interface Cita {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  propietario_id: string; propietario_nombre?: string;
  veterinario_id: string; veterinario_nombre?: string;
  consultorio_id: string; fecha: string; hora: string;
  motivo: string; estado: CitaStatus; notas: string;
  tipo_cita?: string;
  tipo_atencion: TipoAtencion;
  zona: 'URBANA' | 'RURAL';
  convenio_numero?: string;   // Número del contrato/convenio
  entidad_convenio?: string;  // Nombre del contrato si aplica
}

interface HistoriaClinica {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  veterinario_id: string; consultorio_id: string; fecha: string;
  peso: number; temperatura: number; diagnostico: string;
  tratamiento: string; medicamentos: string; observaciones: string;
  proximo_control?: string;
  tipo_atencion: TipoAtencion;
  zona: 'URBANA' | 'RURAL';
  convenio_numero?: string;
  entidad_convenio?: string;
}

interface ResultadoLab {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  tipo: string; fecha: string; descripcion: string;
  archivo_url?: string; veterinario_id: string;
  resultado: string; valores_referencia?: string;
}

interface Vacuna {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  nombre_vacuna: string; fecha_aplicada: string;
  proxima_dosis: string; veterinario_id: string;
  lote?: string; laboratorio?: string;
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
  estado: HospitalizacionStatus; jaula?: string;
}

interface MonitoreoHosp {
  id?: string; hospitalizacion_id?: string; company_id?: string;
  fecha: string; hora: string; temperatura: number; peso: number;
  frecuencia_cardiaca?: number; frecuencia_respiratoria?: number;
  medicacion: string; observaciones: string; responsable?: string;
}

interface Medicamento {
  id?: string; company_id?: string;
  nombre: string; tipo: string; presentacion: string;
  stock: number; precio: number; stock_minimo?: number;
  laboratorio?: string;
}

interface Servicio {
  id?: string; company_id?: string;
  nombre: string; precio: number; descripcion: string; activo: boolean;
  categoria?: string; duracion_min?: number;
}

interface Plan {
  id?: string; company_id?: string;
  nombre: string; precio: number;
  servicios_incluidos: string; descuento: number;
  estado: 'ACTIVO' | 'INACTIVO'; vigencia_meses?: number;
}

interface Consentimiento {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  propietario_id: string; propietario_nombre?: string;
  tipo: string; fecha: string; descripcion: string;
  firmado: boolean; veterinario_id: string;
}

interface FacturaVet {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  propietario_nombre?: string;
  servicio_descripcion: string; total: number;
  abonado: number; saldo: number;
  estado: FacturaStatus; fecha: string; notas: string;
  tipo_atencion: TipoAtencion;
  zona: 'URBANA' | 'RURAL';
  convenio_numero?: string;
  entidad_convenio?: string;
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',       label: 'Dashboard',         icon: <BarChart2 size={16} /> },
  { id: 'propietarios',    label: 'Propietarios',       icon: <Users size={16} /> },
  { id: 'mascotas',        label: 'Mascotas',           icon: <PawPrint size={16} /> },
  { id: 'personal',        label: 'Personal',           icon: <User size={16} /> },
  { id: 'consultorios',    label: 'Consultorios',       icon: <MapPin size={16} /> },
  { id: 'agenda',          label: 'Agenda',             icon: <Calendar size={16} /> },
  { id: 'historia',        label: 'Historia Clínica',   icon: <FileText size={16} /> },
  { id: 'laboratorio',     label: 'Laboratorio',        icon: <FlaskConical size={16} /> },
  { id: 'vacunacion',      label: 'Vacunación',         icon: <Syringe size={16} /> },
  { id: 'peso',            label: 'Control de Peso',    icon: <Weight size={16} /> },
  { id: 'hospitalizacion', label: 'Hospitalización',    icon: <BedDouble size={16} /> },
  { id: 'farmacia',        label: 'Farmacia',           icon: <Pill size={16} /> },
  { id: 'servicios',       label: 'Servicios',          icon: <Stethoscope size={16} /> },
  { id: 'planes',          label: 'Planes',             icon: <Star size={16} /> },
  { id: 'consentimientos', label: 'Consentimientos',    icon: <FileCheck size={16} /> },
  { id: 'facturacion',     label: 'Facturación',        icon: <Receipt size={16} /> },
  { id: 'convenios',       label: 'Reporte Convenios',  icon: <BarChart2 size={16} /> },
] as const;
type TabId = typeof TABS[number]['id'];

const ESPECIES = ['Perro', 'Gato', 'Ave', 'Conejo', 'Reptil', 'Roedor', 'Otro'];
const TIPOS_PERSONAL: Record<PersonalType, string> = {
  VETERINARIO: 'Veterinario', AUXILIAR: 'Auxiliar',
  CIRUJANO: 'Cirujano', RECEPCION: 'Recepción',
};
const TIPOS_MEDICAMENTO = ['Antibiótico', 'Analgésico', 'Antiparasitario', 'Vitamina', 'Vacuna', 'Otro'];

// ─── TIPOS DE ATENCIÓN (sistema de convenios públicos) ────────────────────────
const TIPOS_ATENCION: Record<TipoAtencion, { label: string; color: string; icon: string }> = {
  PARTICULAR:       { label: 'Particular',          color: '#6366f1', icon: '💰' },
  ALCALDIA:         { label: 'Convenio Alcaldía',    color: '#0ea5e9', icon: '🏛️' },
  GOBERNACION:      { label: 'Convenio Gobernación', color: '#8b5cf6', icon: '🏢' },
  JORNADA_GRATUITA: { label: 'Jornada Gratuita',     color: '#10b981', icon: '💚' },
  RURAL:            { label: 'Rural',                color: '#f59e0b', icon: '🌾' },
  OTRO_CONVENIO:    { label: 'Otro Convenio',         color: '#64748b', icon: '📋' },
};

const ZONA_OPTS = [
  { value: 'URBANA', label: '🏙️ Urbana' },
  { value: 'RURAL',  label: '🌾 Rural' },
];

const TIPOS_CITA_VET = ['Consulta general','Vacunación','Control','Cirugía','Peluquería','Urgencia','Jornada','Otro'];

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

// ══════════════════════════════════════════════════════════════════════════════
// HOOK DICTADO DE VOZ
// ══════════════════════════════════════════════════════════════════════════════

function useSpeechField(onResult: (text: string) => void) {
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef<any>(null);
  const start = React.useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Tu navegador no soporta dictado de voz. Usa Chrome o Edge.'); return; }
    const rec = new SR();
    rec.lang = 'es-CO'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join(' ');
      onResult(t); setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend   = () => setListening(false);
    rec.start(); recRef.current = rec; setListening(true);
  }, [onResult]);
  const stop = React.useCallback(() => { recRef.current?.stop(); setListening(false); }, []);
  return { listening, start, stop };
}

const VoiceTextarea: React.FC<{ label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; required?: boolean }> =
  ({ label, value, onChange, rows = 3, placeholder, required }) => {
  const { listening, start, stop } = useSpeechField((text) => onChange(value ? value + ' ' + text : text));
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
        <span className="ml-2 text-[10px] text-slate-300 font-normal">🎤</span>
      </label>
      <div className="relative">
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
          className={`w-full border rounded-lg px-3 py-2 pr-10 text-sm text-slate-800 focus:outline-none resize-none transition-colors ${
            listening ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:ring-2 focus:ring-sky-400'
          }`}/>
        <button type="button" onClick={listening ? stop : start}
          title={listening ? 'Detener' : 'Dictar con voz'}
          className={`absolute right-2 top-2 p-1.5 rounded-lg transition-all ${
            listening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 hover:bg-sky-100 text-slate-400 hover:text-sky-600'
          }`}>
          {listening
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          }
        </button>
      </div>
      {listening && <p className="text-xs text-red-500 font-semibold mt-1 flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full animate-ping inline-block"/>Escuchando...</p>}
    </div>
  );
};

const AtencionBadge: React.FC<{ tipo: TipoAtencion; zona?: string }> = ({ tipo, zona }) => {
  const cfg = TIPOS_ATENCION[tipo] || TIPOS_ATENCION.PARTICULAR;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: cfg.color + '20', color: cfg.color }}>
        {cfg.icon} {cfg.label}
      </span>
      {zona === 'RURAL' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">🌾 Rural</span>}
    </div>
  );
};

const AtencionSelector: React.FC<{
  tipo: TipoAtencion; zona: 'URBANA' | 'RURAL';
  convenioNumero?: string; entidadConvenio?: string;
  onChange: (patch: Partial<{ tipo_atencion: TipoAtencion; zona: 'URBANA'|'RURAL'; convenio_numero: string; entidad_convenio: string }>) => void;
}> = ({ tipo, zona, convenioNumero, entidadConvenio, onChange }) => {
  const esConvenio = ['ALCALDIA','GOBERNACION','OTRO_CONVENIO'].includes(tipo);
  return (
    <div className="col-span-2">
      <div className="border border-indigo-100 rounded-xl p-4 space-y-3 bg-indigo-50/50">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
          <span>⚕️</span> Tipo de Atención / Convenio
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.entries(TIPOS_ATENCION) as [TipoAtencion, typeof TIPOS_ATENCION[TipoAtencion]][]).map(([key, cfg]) => (
            <button key={key} type="button" onClick={() => onChange({ tipo_atencion: key })}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all text-left ${
                tipo === key ? 'text-white border-transparent shadow-sm' : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
              }`}
              style={tipo === key ? { background: cfg.color } : {}}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Zona de Atención</label>
            <div className="flex gap-2">
              {ZONA_OPTS.map(z => (
                <button key={z.value} type="button" onClick={() => onChange({ zona: z.value as 'URBANA'|'RURAL' })}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${zona === z.value ? 'bg-indigo-500 text-white border-indigo-500' : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'}`}>
                  {z.label}
                </button>
              ))}
            </div>
          </div>
          {esConvenio && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">N° Contrato / Convenio</label>
              <input value={convenioNumero||''} onChange={e=>onChange({convenio_numero:e.target.value})}
                placeholder="Ej: CONV-2025-012"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"/>
            </div>
          )}
          {tipo === 'OTRO_CONVENIO' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Entidad del convenio</label>
              <input value={entidadConvenio||''} onChange={e=>onChange({entidad_convenio:e.target.value})}
                placeholder="Nombre de la entidad..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Veterinaria: React.FC = () => {
  const { company, companyId } = useDatabase();
  const { formatMoney } = useCurrency();
  const brandColor = (company?.config as any)?.primary_color || '#0ea5e9';
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [importModal, setImportModal] = useState<ModuleType | null>(null);
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
  const [resultadosLab, setResultadosLab]     = useState<ResultadoLab[]>([]);
  const [monitoreos, setMonitoreos]           = useState<MonitoreoHosp[]>([]);
  const [consentimientos, setConsentimientos] = useState<Consentimiento[]>([]);
  const [hospSeleccionada, setHospSeleccionada] = useState<Hospitalizacion | null>(null);
  const [agendaVista, setAgendaVista]         = useState<'tabla' | 'semana'>('tabla');

  // ── MODAL STATE ──
  const [modal, setModal] = useState<string | null>(null);
  const [editing, setEditing]   = useState<any>(null);
  const [searchQ, setSearchQ]   = useState('');
  const [detailItem, setDetailItem] = useState<any>(null);

  // ── FORMS ──
  const nowTime = () => new Date().toTimeString().slice(0, 5);
  const emptyPropietario   = (): Propietario     => ({ nombre:'', documento:'', telefono:'', correo:'', direccion:'', observaciones:'' });
  const emptyMascota       = (): Mascota         => ({ nombre:'', propietario_id:'', especie:'Perro', raza:'', sexo:'MACHO', fecha_nacimiento:'', peso_inicial:0, color:'', microchip:'', observaciones:'', esterilizado:false });
  const emptyPersonal      = (): Personal        => ({ nombre:'', documento:'', tipo:'VETERINARIO', especialidad:'General', telefono:'', estado:'ACTIVO', registro_profesional:'' });
  const emptyConsultorio   = (): Consultorio     => ({ nombre:'', veterinario_id:'', auxiliar_id:'', estado:'DISPONIBLE', observaciones:'' });
  const emptyCita          = (): Cita            => ({ mascota_id:'', propietario_id:'', veterinario_id:'', consultorio_id:'', fecha:today(), hora:'09:00', motivo:'', estado:'PROGRAMADA', notas:'', tipo_cita:'Consulta general', tipo_atencion:'PARTICULAR', zona:'URBANA', convenio_numero:'', entidad_convenio:'' });
  const emptyHistoria      = (): HistoriaClinica => ({ mascota_id:'', veterinario_id:'', consultorio_id:'', fecha:today(), peso:0, temperatura:38.5, diagnostico:'', tratamiento:'', medicamentos:'', observaciones:'', proximo_control:'', tipo_atencion:'PARTICULAR', zona:'URBANA', convenio_numero:'', entidad_convenio:'' });
  const emptyLab           = (): ResultadoLab    => ({ mascota_id:'', tipo:'Hemograma', fecha:today(), descripcion:'', archivo_url:'', veterinario_id:'', resultado:'', valores_referencia:'' });
  const emptyVacuna        = (): Vacuna          => ({ mascota_id:'', nombre_vacuna:'', fecha_aplicada:today(), proxima_dosis:'', veterinario_id:'', lote:'', laboratorio:'' });
  const emptyPeso          = (): ControlPeso     => ({ mascota_id:'', fecha:today(), peso:0, observaciones:'' });
  const emptyHospitalizacion = (): Hospitalizacion => ({ mascota_id:'', fecha_ingreso:today(), veterinario_id:'', motivo:'', estado:'HOSPITALIZADO', jaula:'' });
  const emptyMonitoreo     = (): MonitoreoHosp   => ({ fecha:today(), hora:nowTime(), temperatura:38.5, peso:0, frecuencia_cardiaca:0, frecuencia_respiratoria:0, medicacion:'', observaciones:'', responsable:'' });
  const emptyMedicamento   = (): Medicamento     => ({ nombre:'', tipo:'Antibiótico', presentacion:'Tabletas', stock:0, precio:0, stock_minimo:5 });
  const emptyServicio      = (): Servicio        => ({ nombre:'', precio:0, descripcion:'', activo:true, categoria:'Consulta', duracion_min:30 });
  const emptyPlan          = (): Plan            => ({ nombre:'', precio:0, servicios_incluidos:'', descuento:0, estado:'ACTIVO', vigencia_meses:12 });
  const emptyConsentimiento = (): Consentimiento => ({ mascota_id:'', propietario_id:'', tipo:'Cirugía', fecha:today(), descripcion:'', firmado:false, veterinario_id:'' });
  const emptyFactura       = (): FacturaVet      => ({ mascota_id:'', servicio_descripcion:'', total:0, abonado:0, saldo:0, estado:'PENDIENTE', fecha:today(), notas:'', tipo_atencion:'PARTICULAR', zona:'URBANA', convenio_numero:'', entidad_convenio:'' });

  const [formPropietario,     setFormPropietario]     = useState<Propietario>(emptyPropietario());
  const [formMascota,         setFormMascota]         = useState<Mascota>(emptyMascota());
  const [formPersonal,        setFormPersonal]        = useState<Personal>(emptyPersonal());
  const [formConsultorio,     setFormConsultorio]     = useState<Consultorio>(emptyConsultorio());
  const [formCita,            setFormCita]            = useState<Cita>(emptyCita());
  const [formHistoria,        setFormHistoria]        = useState<HistoriaClinica>(emptyHistoria());
  const [formLab,             setFormLab]             = useState<ResultadoLab>(emptyLab());
  const [formVacuna,          setFormVacuna]          = useState<Vacuna>(emptyVacuna());
  const [formPeso,            setFormPeso]            = useState<ControlPeso>(emptyPeso());
  const [formHospitalizacion, setFormHospitalizacion] = useState<Hospitalizacion>(emptyHospitalizacion());
  const [formMonitoreo,       setFormMonitoreo]       = useState<MonitoreoHosp>(emptyMonitoreo());
  const [formMedicamento,     setFormMedicamento]     = useState<Medicamento>(emptyMedicamento());
  const [formServicio,        setFormServicio]        = useState<Servicio>(emptyServicio());
  const [formPlan,            setFormPlan]            = useState<Plan>(emptyPlan());
  const [formConsentimiento,  setFormConsentimiento]  = useState<Consentimiento>(emptyConsentimiento());
  const [formFactura,         setFormFactura]         = useState<FacturaVet>(emptyFactura());
  const [formAbono,           setFormAbono]           = useState<number>(0);
  const [formPOS,             setFormPOS]             = useState({ mascota_id: '', servicio: '', total: '' });

  // ── CARGA DESDE SUPABASE ─────────────────────────────────────────────────
  const loadTable = useCallback(async (table: string, setter: React.Dispatch<any>) => {
    if (!companyId) return;
    const { data, error } = await supabase.from(table).select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    if (error) { console.error(`❌ ${table}:`, error.message); return; }
    setter(data || []);
  }, [companyId]);

  const reloadAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    await Promise.all([
      loadTable('vet_propietarios',       setPropietarios),
      loadTable('vet_mascotas',           setMascotas),
      loadTable('vet_personal',           setPersonal),
      loadTable('vet_consultorios',       setConsultorios),
      loadTable('vet_citas',              setCitas),
      loadTable('vet_historias_clinicas', setHistorias),
      loadTable('vet_resultados_lab',     setResultadosLab),
      loadTable('vet_vacunas',            setVacunas),
      loadTable('vet_control_peso',       setPesos),
      loadTable('vet_hospitalizaciones',  setHospitalizaciones),
      loadTable('vet_monitoreos_hosp',    setMonitoreos),
      loadTable('vet_medicamentos',       setMedicamentos),
      loadTable('vet_servicios',          setServicios),
      loadTable('vet_planes',             setPlanes),
      loadTable('vet_consentimientos',    setConsentimientos),
      loadTable('vet_facturas',           setFacturas),
    ]);
    setLoading(false);
  }, [companyId, loadTable]);

  useEffect(() => {
    if (!companyId) return;
    reloadAll();
  }, [companyId, loadTable]);

  // ── TABLE MAP para upsert/delete ──────────────────────────────────────────
  const TABLE: Record<string, string> = {
    propietarios: 'vet_propietarios', mascotas: 'vet_mascotas',
    personal: 'vet_personal', consultorios: 'vet_consultorios',
    citas: 'vet_citas', historias: 'vet_historias_clinicas',
    laboratorio: 'vet_resultados_lab', vacunas: 'vet_vacunas',
    pesos: 'vet_control_peso', hospitalizaciones: 'vet_hospitalizaciones',
    monitoreos: 'vet_monitoreos_hosp', medicamentos: 'vet_medicamentos',
    servicios: 'vet_servicios', planes: 'vet_planes',
    consentimientos: 'vet_consentimientos', facturas: 'vet_facturas',
  };

  const descontarStock = async (texto: string) => {
    const nombres = texto.split(',').map(s => s.trim()).filter(Boolean);
    for (const nombre of nombres) {
      const med = medicamentos.find(m => m.nombre.toLowerCase().includes(nombre.toLowerCase()));
      if (!med?.id) continue;
      const nuevo = Math.max(0, med.stock - 1);
      await supabase.from('vet_medicamentos').update({ stock: nuevo }).eq('id', med.id);
      setMedicamentos(p => p.map(m => m.id === med.id ? { ...m, stock: nuevo } : m));
      if (nuevo <= (med.stock_minimo || 5)) toast(`⚠️ Stock bajo: ${med.nombre} — ${nuevo} uds`, { icon: '🔔' });
    }
  };

  const enviarRecordatorio = (c: Cita) => {
    const prop = propietarios.find(p => p.id === c.propietario_id);
    if (!prop?.telefono) return toast.error('Sin teléfono registrado');
    const tel = prop.telefono.replace(/\D/g, '');
    const msg = encodeURIComponent(`Hola ${prop.nombre}, recuerde la cita veterinaria el *${c.fecha}* a las *${c.hora}* para *${c.mascota_nombre}*. Motivo: ${c.motivo}. ¡Los esperamos! 🐾`);
    window.open(`https://wa.me/57${tel}?text=${msg}`, '_blank');
    toast.success('Recordatorio enviado por WhatsApp');
  };

  const imprimirReceta = (h: HistoriaClinica) => {
    const m   = mascotas.find(x => x.id === h.mascota_id);
    const p   = propietarios.find(x => x.id === m?.propietario_id);
    const vet = personal.find(x => x.id === h.veterinario_id);
    const html = `<!DOCTYPE html><html><head><title>Receta</title><style>
      body{font-family:Arial,sans-serif;padding:40px;max-width:700px;margin:0 auto;color:#1e293b}
      .hdr{display:flex;justify-content:space-between;border-bottom:3px solid ${brandColor};padding-bottom:16px;margin-bottom:20px}
      .clinic{font-size:22px;font-weight:bold;color:${brandColor}}.badge{background:${brandColor};color:#fff;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:bold}
      .sec{background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:16px}.sec h3{font-size:11px;text-transform:uppercase;color:#94a3b8;margin-bottom:10px}
      .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.f label{font-size:11px;color:#64748b}.f p{font-size:14px;font-weight:600;margin:2px 0 0}
      .meds{background:#eff6ff;border-left:4px solid ${brandColor};padding:14px;border-radius:0 8px 8px 0;white-space:pre-wrap;font-size:14px}
      .ftr{border-top:1px solid #e2e8f0;padding-top:20px;margin-top:24px;display:flex;justify-content:space-between}
      .firma{text-align:center}.firma .ln{border-bottom:1px solid #94a3b8;width:200px;margin:40px auto 6px}.firma p{font-size:12px;color:#64748b}
    </style></head><body>
    <div class="hdr"><div><div class="clinic">${company?.name||'Clínica Veterinaria'}</div><div style="font-size:12px;color:#64748b">${company?.address||''}</div></div><div class="badge">RECETA MÉDICA</div></div>
    <div class="sec"><h3>Datos del Paciente</h3><div class="g2">
      <div class="f"><label>Paciente</label><p>${m?.nombre||'-'}</p></div>
      <div class="f"><label>Especie / Raza</label><p>${m?.especie||''} · ${m?.raza||''}</p></div>
      <div class="f"><label>Propietario</label><p>${p?.nombre||'-'}</p></div>
      <div class="f"><label>Teléfono</label><p>${p?.telefono||'-'}</p></div>
      <div class="f"><label>Fecha</label><p>${h.fecha}</p></div>
      <div class="f"><label>Peso / Temperatura</label><p>${h.peso}kg · ${h.temperatura}°C</p></div>
    </div></div>
    <div class="sec"><h3>Diagnóstico</h3><div style="font-size:15px;font-weight:600">${h.diagnostico}</div>${h.tratamiento?`<div style="margin-top:8px;font-size:13px;color:#475569">${h.tratamiento}</div>`:''}</div>
    <div class="sec"><h3>Medicamentos (Rp/)</h3><div class="meds">${h.medicamentos||'Sin medicamentos prescritos'}</div></div>
    ${h.observaciones?`<div class="sec"><h3>Observaciones</h3><p style="font-size:14px">${h.observaciones}</p></div>`:''}
    ${h.proximo_control?`<div style="background:#f0fdf4;border-radius:8px;padding:12px;font-size:14px;color:#166534;margin-bottom:16px">📅 <strong>Próximo control:</strong> ${h.proximo_control}</div>`:''}
    <div class="ftr">
      <div class="firma"><div class="ln"></div><p><strong>${vet?.nombre||'Médico Veterinario'}</strong></p><p>${vet?.especialidad||''}</p>${vet?.registro_profesional?`<p>M.V. Reg. ${vet.registro_profesional}</p>`:''}</div>
      <div style="font-size:11px;color:#94a3b8;text-align:right;align-self:flex-end"><p>Emitido: ${new Date().toLocaleDateString('es-CO')}</p><p>${company?.name||''}</p></div>
    </div></body></html>`;
    const w = window.open('', '_blank'); w?.document.write(html); w?.document.close(); w?.print();
  };

  const imprimirConsentimiento = (c: Consentimiento) => {
    const m   = mascotas.find(x => x.id === c.mascota_id);
    const p   = propietarios.find(x => x.id === c.propietario_id);
    const vet = personal.find(x => x.id === c.veterinario_id);
    const html = `<!DOCTYPE html><html><head><title>Consentimiento</title><style>
      body{font-family:Arial,sans-serif;padding:50px;max-width:680px;margin:0 auto;line-height:1.6;color:#1e293b}
      h1{text-align:center;font-size:20px;color:${brandColor};border-bottom:2px solid ${brandColor};padding-bottom:10px}
      .data{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:16px}
      .f label{font-size:11px;color:#94a3b8;display:block}.f span{font-size:14px;font-weight:600}
      .desc{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:12px 0;font-size:14px}
      .firmas{display:flex;justify-content:space-around;margin-top:60px}.fb{text-align:center}
      .fb .ln{border-bottom:1px solid #334155;width:180px;margin:50px auto 6px}.fb p{font-size:12px;color:#64748b}
    </style></head><body>
    <h1>CONSENTIMIENTO INFORMADO VETERINARIO</h1>
    <p style="text-align:center;font-size:13px;color:#64748b">${company?.name||'Clínica Veterinaria'} · ${new Date().toLocaleDateString('es-CO')}</p>
    <div class="data">
      <div class="f"><label>Mascota</label><span>${m?.nombre||'-'} (${m?.especie||''})</span></div>
      <div class="f"><label>Raza</label><span>${m?.raza||''}</span></div>
      <div class="f"><label>Propietario</label><span>${p?.nombre||'-'}</span></div>
      <div class="f"><label>Documento</label><span>${p?.documento||'-'}</span></div>
      <div class="f"><label>Teléfono</label><span>${p?.telefono||'-'}</span></div>
      <div class="f"><label>Procedimiento</label><span>${c.tipo}</span></div>
    </div>
    <h2 style="font-size:14px;text-transform:uppercase;color:#64748b">Descripción</h2>
    <div class="desc">${c.descripcion||'Procedimiento veterinario autorizado.'}</div>
    <p style="font-size:14px">Yo, <strong>${p?.nombre||'___'}</strong>, C.C. <strong>${p?.documento||'___'}</strong>, propietario(a) de <strong>${m?.nombre||'___'}</strong>, declaro haber sido informado(a) y <strong>AUTORIZO</strong> el procedimiento de <strong>${c.tipo}</strong>.</p>
    <div class="firmas">
      <div class="fb"><div class="ln"></div><p><strong>Firma Propietario</strong></p><p>${p?.nombre||''}</p></div>
      <div class="fb"><div class="ln"></div><p><strong>Médico Veterinario</strong></p><p>${vet?.nombre||''}</p>${vet?.registro_profesional?`<p>Reg. ${vet.registro_profesional}</p>`:''}</div>
    </div></body></html>`;
    const w = window.open('', '_blank'); w?.document.write(html); w?.document.close(); w?.print();
  };

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

  // Convierte strings vacíos en campos UUID a null para evitar
  // "invalid input syntax for type uuid: ''" en PostgreSQL
  const sanitizeRow = (row: any): any => {
    const UUID_FIELDS = [
      'veterinario_id', 'auxiliar_id', 'consultorio_id', 'mascota_id',
      'propietario_id', 'personal_id', 'empresa_id', 'plan_id'
    ];
    const clean = { ...row };
    UUID_FIELDS.forEach(f => { if (clean[f] === '') clean[f] = null; });
    return clean;
  };

  // Retorna true si el upsert fue exitoso, false si hubo error
  const upsertDB = async (key: string, row: any): Promise<boolean> => {
    const table = TABLE[key];
    if (!table) return false;
    const { error } = await supabase.from(table).upsert(sanitizeRow({ ...row, company_id: companyId }));
    if (error) {
      console.error('upsert error:', table, error.message);
      toast.error('Error al guardar: ' + error.message);
      return false;
    }
    return true;
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
    if (!(await upsertDB('propietarios', row))) return;
    await loadTable('vet_propietarios', setPropietarios);
    toast.success(editing?.id ? 'Propietario actualizado' : 'Propietario registrado');
    closeModal();
  };

  const saveMascota = async () => {
    if (!formMascota.nombre.trim() || !formMascota.propietario_id) return toast.error('Nombre y propietario son requeridos');
    const prop = propietarios.find(p => p.id === formMascota.propietario_id);
    const row = { ...formMascota, id: editing?.id || uid(), company_id: companyId, propietario_nombre: prop?.nombre };
    if (!(await upsertDB('mascotas', row))) return;
    await loadTable('vet_mascotas', setMascotas);
    toast.success(editing?.id ? 'Mascota actualizada' : 'Mascota registrada');
    closeModal();
  };

  const savePersonal = async () => {
    if (!formPersonal.nombre.trim()) return toast.error('El nombre es requerido');
    const row = { ...formPersonal, id: editing?.id || uid(), company_id: companyId };
    if (!(await upsertDB('personal', row))) return;
    await loadTable('vet_personal', setPersonal);
    toast.success('Personal guardado'); closeModal();
  };

  const saveConsultorio = async () => {
    if (!formConsultorio.nombre.trim()) return toast.error('El nombre es requerido');
    const row = { ...formConsultorio, id: editing?.id || uid(), company_id: companyId };
    if (!(await upsertDB('consultorios', row))) return;
    await loadTable('vet_consultorios', setConsultorios);
    toast.success('Consultorio guardado'); closeModal();
  };

  const saveCita = async () => {
    if (!formCita.mascota_id || !formCita.fecha) return toast.error('Mascota y fecha son requeridos');
    const mascota = mascotas.find(m => m.id === formCita.mascota_id);
    const prop = propietarios.find(p => p.id === formCita.propietario_id);
    const vet  = personal.find(p => p.id === formCita.veterinario_id);
    const row = { ...formCita, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, propietario_nombre: prop?.nombre, veterinario_nombre: vet?.nombre, company_id: companyId };
    if (!(await upsertDB('citas', row))) return;
    await loadTable('vet_citas', setCitas);
    toast.success('Cita guardada'); closeModal();
  };

  const saveHistoria = async () => {
    if (!formHistoria.mascota_id || !formHistoria.diagnostico.trim()) return toast.error('Mascota y diagnóstico requeridos');
    const mascota = mascotas.find(m => m.id === formHistoria.mascota_id);
    const row = { ...formHistoria, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, company_id: companyId };
    if (!(await upsertDB('historias', row))) return;
    if (formHistoria.medicamentos && !editing?.id) await descontarStock(formHistoria.medicamentos);
    if (formHistoria.peso > 0 && !editing?.id) {
      const pesoRow = { id: uid(), company_id: companyId, mascota_id: formHistoria.mascota_id, fecha: formHistoria.fecha, peso: formHistoria.peso, observaciones: 'Registrado desde historia clínica' };
      await upsertDB('pesos', pesoRow);
      await loadTable('vet_control_peso', setPesos);
    }
    await loadTable('vet_historias_clinicas', setHistorias);
    toast.success('Historia clínica guardada'); closeModal();
  };

  const saveLab = async () => {
    if (!formLab.mascota_id) return toast.error('Mascota requerida');
    const mascota = mascotas.find(m => m.id === formLab.mascota_id);
    const row = { ...formLab, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, company_id: companyId };
    if (!(await upsertDB('laboratorio', row))) return;
    await loadTable('vet_resultados_lab', setResultadosLab);
    toast.success('Resultado guardado'); closeModal();
  };

  const saveMonitoreo = async (hospId: string) => {
    if (!formMonitoreo.temperatura) return toast.error('Temperatura requerida');
    const row = { ...formMonitoreo, id: uid(), company_id: companyId, hospitalizacion_id: hospId };
    if (!(await upsertDB('monitoreos', row))) return;
    await loadTable('vet_monitoreos_hosp', setMonitoreos);
    toast.success('Monitoreo guardado'); setFormMonitoreo(emptyMonitoreo()); setModal(null);
  };

  const saveConsentimiento = async () => {
    if (!formConsentimiento.mascota_id) return toast.error('Mascota requerida');
    const mascota = mascotas.find(m => m.id === formConsentimiento.mascota_id);
    const prop = propietarios.find(p => p.id === formConsentimiento.propietario_id);
    const row = { ...formConsentimiento, id: editing?.id || uid(), company_id: companyId, mascota_nombre: mascota?.nombre, propietario_nombre: prop?.nombre };
    if (!(await upsertDB('consentimientos', row))) return;
    await loadTable('vet_consentimientos', setConsentimientos);
    toast.success('Consentimiento guardado'); closeModal();
  };

  const saveVacuna = async () => {
    if (!formVacuna.mascota_id || !formVacuna.nombre_vacuna.trim()) return toast.error('Mascota y vacuna requeridos');
    const mascota = mascotas.find(m => m.id === formVacuna.mascota_id);
    const row = { ...formVacuna, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, company_id: companyId };
    if (!(await upsertDB('vacunas', row))) return;
    await loadTable('vet_vacunas', setVacunas);
    toast.success('Vacuna registrada'); closeModal();
  };

  const savePeso = async () => {
    if (!formPeso.mascota_id || formPeso.peso <= 0) return toast.error('Mascota y peso requeridos');
    const row = { ...formPeso, id: uid(), company_id: companyId };
    if (!(await upsertDB('pesos', row))) return;
    await loadTable('vet_control_peso', setPesos);
    toast.success('Peso registrado'); closeModal();
  };

  const saveHospitalizacion = async () => {
    if (!formHospitalizacion.mascota_id || !formHospitalizacion.motivo.trim()) return toast.error('Mascota y motivo requeridos');
    const mascota = mascotas.find(m => m.id === formHospitalizacion.mascota_id);
    const row = { ...formHospitalizacion, id: editing?.id || uid(), mascota_nombre: mascota?.nombre, company_id: companyId };
    if (!(await upsertDB('hospitalizaciones', row))) return;
    await loadTable('vet_hospitalizaciones', setHospitalizaciones);
    toast.success('Hospitalización guardada'); closeModal();
  };

  const saveMedicamento = async () => {
    if (!formMedicamento.nombre.trim()) return toast.error('Nombre requerido');
    const row = { ...formMedicamento, id: editing?.id || uid(), company_id: companyId };
    if (!(await upsertDB('medicamentos', row))) return;
    await loadTable('vet_medicamentos', setMedicamentos);
    toast.success('Medicamento guardado'); closeModal();
  };

  const saveServicio = async () => {
    if (!formServicio.nombre.trim()) return toast.error('Nombre requerido');
    const row = { ...formServicio, id: editing?.id || uid(), company_id: companyId };
    if (!(await upsertDB('servicios', row))) return;
    await loadTable('vet_servicios', setServicios);
    toast.success('Servicio guardado'); closeModal();
  };

  const savePlan = async () => {
    if (!formPlan.nombre.trim()) return toast.error('Nombre requerido');
    const row = { ...formPlan, id: editing?.id || uid(), company_id: companyId };
    if (!(await upsertDB('planes', row))) return;
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
    if (!(await upsertDB('facturas', row))) return;
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
    if (!(await upsertDB('facturas', row))) return;
    await loadTable('vet_facturas', setFacturas);
    toast.success('Abono registrado'); setModal(null); setFormAbono(0);
  };

  const SETTER_MAP: Record<string, [any[], React.Dispatch<any>, string]> = {
    propietarios:    [propietarios,    setPropietarios,    'vet_propietarios'],
    mascotas:        [mascotas,        setMascotas,        'vet_mascotas'],
    personal:        [personal,        setPersonal,        'vet_personal'],
    consultorios:    [consultorios,    setConsultorios,    'vet_consultorios'],
    citas:           [citas,           setCitas,           'vet_citas'],
    historias:       [historias,       setHistorias,       'vet_historias_clinicas'],
    laboratorio:     [resultadosLab,   setResultadosLab,   'vet_resultados_lab'],
    vacunas:         [vacunas,         setVacunas,         'vet_vacunas'],
    pesos:           [pesos,           setPesos,           'vet_control_peso'],
    hospitalizaciones:[hospitalizaciones,setHospitalizaciones,'vet_hospitalizaciones'],
    monitoreos:      [monitoreos,      setMonitoreos,      'vet_monitoreos_hosp'],
    medicamentos:    [medicamentos,    setMedicamentos,    'vet_medicamentos'],
    servicios:       [servicios,       setServicios,       'vet_servicios'],
    planes:          [planes,          setPlanes,          'vet_planes'],
    consentimientos: [consentimientos, setConsentimientos, 'vet_consentimientos'],
    facturas:        [facturas,        setFacturas,        'vet_facturas'],
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
      propietarios:    [setFormPropietario,    item],
      mascotas:        [setFormMascota,        item],
      personal:        [setFormPersonal,       item],
      consultorios:    [setFormConsultorio,    item],
      citas:           [setFormCita,           item],
      historia:        [setFormHistoria,       item],
      laboratorio:     [setFormLab,            item],
      vacunas:         [setFormVacuna,         item],
      hospitalizacion: [setFormHospitalizacion,item],
      medicamentos:    [setFormMedicamento,    item],
      servicios:       [setFormServicio,       item],
      planes:          [setFormPlan,           item],
      consentimientos: [setFormConsentimiento, item],
    };
    const [setter, val] = formMap[tab] || [];
    if (setter) setter(val);
    setModal(tab);
  };

  // ─── STATS para dashboard ─────────────────────────────────────────────────
  const stats = {
    totalMascotas:     mascotas.length,
    citasHoy:          citas.filter(c => c.fecha === today() && c.estado === 'PROGRAMADA').length,
    hospitalizados:    hospitalizaciones.filter(h => h.estado === 'HOSPITALIZADO').length,
    vacunasPendientes: vacunas.filter(v => v.proxima_dosis && v.proxima_dosis <= today()).length,
    ingresosMes:       facturas.filter(f => f.fecha?.startsWith(today().slice(0,7))).reduce((s, f) => s + (f.abonado||0), 0),
    facturasPendientes:facturas.filter(f => f.estado !== 'PAGADA').length,
    stockBajo:         medicamentos.filter(m => m.stock <= (m.stock_minimo || 5)).length,
    labPendientes:     resultadosLab.filter(r => !r.resultado || r.resultado.trim() === '').length,
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Mascotas"            value={stats.totalMascotas}      icon={<PawPrint size={22}/>}      color="#0ea5e9" onClick={() => setActiveTab('mascotas')} />
        <Card title="Citas Hoy"           value={stats.citasHoy}           icon={<Calendar size={22}/>}     color="#8b5cf6" onClick={() => setActiveTab('agenda')} />
        <Card title="Hospitalizados"      value={stats.hospitalizados}     icon={<BedDouble size={22}/>}    color="#ef4444" onClick={() => setActiveTab('hospitalizacion')} />
        <Card title="Vacunas Vencidas"    value={stats.vacunasPendientes}  icon={<Syringe size={22}/>}      color="#f59e0b" onClick={() => setActiveTab('vacunacion')} />
        <Card title="Ingresos del Mes"    value={fmtCurrency(stats.ingresosMes)} icon={<DollarSign size={22}/>} color="#10b981" />
        <Card title="Facturas Pendientes" value={stats.facturasPendientes} icon={<Receipt size={22}/>}      color="#6366f1" onClick={() => setActiveTab('facturacion')} />
        <Card title="Stock Bajo"          value={stats.stockBajo}          icon={<AlertTriangle size={22}/>} color="#dc2626" onClick={() => setActiveTab('farmacia')} />
        <Card title="Labs Pendientes"     value={stats.labPendientes}      icon={<FlaskConical size={22}/>} color="#0891b2" onClick={() => setActiveTab('laboratorio')} />
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
                <div className="flex items-center gap-2">
                  {statusPill(c.estado)}
                  <button onClick={() => enviarRecordatorio(c)} title="Recordatorio WhatsApp"
                    className="p-1.5 rounded-lg hover:bg-green-50 text-green-500">
                    <MessageSquare size={14}/>
                  </button>
                </div>
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

      {stats.stockBajo > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500"/> Stock Bajo en Farmacia
          </h3>
          {medicamentos.filter(m => m.stock <= (m.stock_minimo || 5)).map(m => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div>
                <p className="font-semibold text-slate-700 text-sm">{m.nombre}</p>
                <p className="text-xs text-slate-400">{m.tipo} · {m.presentacion}</p>
              </div>
              <span className="font-bold text-red-500">{m.stock} uds</span>
            </div>
          ))}
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
    <TableWrapper headers={['','Nombre','Propietario','Especie','Raza','Sexo','Acciones']}
      onAdd={() => { setFormMascota(emptyMascota()); setModal('mascotas'); }} btnLabel="Nueva Mascota" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(mascotas, ['nombre','especie','raza','propietario_nombre']).map(m => (
        <Row key={m.id}
          cells={[
            m.foto_url
              ? <img src={m.foto_url} alt={m.nombre} className="w-9 h-9 rounded-full object-cover"/>
              : <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><PawPrint size={16} className="text-slate-400"/></div>,
            <div>
              <span className="font-semibold">{m.nombre}</span>
              {m.esterilizado && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">Esterilizado</span>}
            </div>,
            m.propietario_nombre || '-', m.especie, m.raza,
            m.sexo === 'MACHO' ? '♂ Macho' : '♀ Hembra',
          ]}
          onView={() => setDetailItem({ type: 'mascota', data: m })}
          onEdit={() => openEdit('mascotas', m)}
          onDelete={() => deleteItem('mascotas', m.id!)}
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
    <TableWrapper headers={['Mascota','Propietario','Fecha','Hora','Veterinario','Tipo','Atención / Convenio','Estado','Acciones']}
      onAdd={() => { setFormCita(emptyCita()); setModal('citas'); }} btnLabel="Nueva Cita" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(citas, ['mascota_nombre','propietario_nombre','motivo']).sort((a,b) => a.fecha > b.fecha ? -1 : 1).map(c => (
        <Row key={c.id}
          cells={[
            <span className="font-semibold">{c.mascota_nombre || '-'}</span>,
            c.propietario_nombre || '-', c.fecha, c.hora,
            c.veterinario_nombre || '-',
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{c.tipo_cita || c.motivo}</span>,
            <AtencionBadge tipo={(c.tipo_atencion as TipoAtencion) || 'PARTICULAR'} zona={c.zona} />,
            statusPill(c.estado),
          ]}
          onEdit={() => openEdit('citas', c)}
          onDelete={() => deleteItem('citas', c.id!)}
          onView={() => enviarRecordatorio(c)}
        />
      ))}
    </TableWrapper>
  );

  const renderHistoria = () => (
    <TableWrapper headers={['Mascota','Fecha','Atención','Veterinario','Diagnóstico','Peso','T°','Acciones']}
      onAdd={() => { setFormHistoria(emptyHistoria()); setModal('historia'); }} btnLabel="Nueva Historia" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(historias, ['mascota_nombre','diagnostico']).sort((a,b) => b.fecha > a.fecha ? 1 : -1).map(h => (
        <Row key={h.id}
          cells={[
            <span className="font-semibold">{h.mascota_nombre || '-'}</span>,
            h.fecha,
            <AtencionBadge tipo={(h.tipo_atencion as TipoAtencion) || 'PARTICULAR'} zona={h.zona} />,
            personal.find(p => p.id === h.veterinario_id)?.nombre || '-',
            <span className="max-w-[160px] truncate block">{h.diagnostico}</span>,
            h.peso ? `${h.peso} kg` : '-',
            h.temperatura ? `${h.temperatura}°C` : '-',
          ]}
          onView={() => setDetailItem({ type: 'historia', data: h })}
          onPrint={() => imprimirReceta(h)}
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
    <div className="space-y-6">
      <TableWrapper headers={['Mascota','Jaula','Ingreso','Veterinario','Motivo','Estado','Acciones']}
        onAdd={() => { setFormHospitalizacion(emptyHospitalizacion()); setModal('hospitalizacion'); }} btnLabel="Nueva Hospitalización"
        search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
        {filteredQ(hospitalizaciones, ['mascota_nombre','motivo']).sort((a,b) => b.fecha_ingreso > a.fecha_ingreso ? 1 : -1).map(h => (
          <Row key={h.id}
            cells={[
              <span className="font-semibold">{h.mascota_nombre || '-'}</span>,
              h.jaula || '-', h.fecha_ingreso,
              personal.find(p => p.id === h.veterinario_id)?.nombre || '-',
              h.motivo, statusPill(h.estado),
            ]}
            onView={() => setHospSeleccionada(hospSeleccionada?.id === h.id ? null : h)}
            onEdit={() => openEdit('hospitalizacion', h)}
            onDelete={() => deleteItem('hospitalizaciones', h.id!)}
          />
        ))}
      </TableWrapper>

      {hospSeleccionada && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Monitoreos — {hospSeleccionada.mascota_nombre}</h3>
              <p className="text-sm text-slate-500">Ingreso: {hospSeleccionada.fecha_ingreso} · {hospSeleccionada.motivo}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setFormMonitoreo(emptyMonitoreo()); setModal('monitoreo'); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow" style={{ background: brandColor }}>
                <Plus size={16} /> Agregar Monitoreo
              </button>
              <button onClick={() => setHospSeleccionada(null)} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"><X size={16} /></button>
            </div>
          </div>
          <div className="space-y-3">
            {monitoreos.filter(m => m.hospitalizacion_id === hospSeleccionada.id)
              .sort((a,b) => b.fecha > a.fecha ? 1 : -1)
              .map(mon => (
              <div key={mon.id} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-slate-700">{mon.fecha} {mon.hora}</p>
                  <div className="flex gap-3 text-sm flex-wrap">
                    <span className="font-semibold text-red-500">🌡 {mon.temperatura}°C</span>
                    {(mon.peso || 0) > 0 && <span className="font-semibold text-sky-500">⚖ {mon.peso}kg</span>}
                    {(mon.frecuencia_cardiaca || 0) > 0 && <span className="font-semibold text-pink-500">❤ {mon.frecuencia_cardiaca}bpm</span>}
                    {(mon.frecuencia_respiratoria || 0) > 0 && <span className="font-semibold text-indigo-500">💨 {mon.frecuencia_respiratoria}rpm</span>}
                  </div>
                </div>
                {mon.medicacion && <p className="text-sm text-slate-600"><span className="font-semibold">Medicación:</span> {mon.medicacion}</p>}
                {mon.observaciones && <p className="text-sm text-slate-500 mt-1">{mon.observaciones}</p>}
                {mon.responsable && <p className="text-xs text-slate-400 mt-1">Responsable: {mon.responsable}</p>}
                <button onClick={() => deleteItem('monitoreos', mon.id!)} className="mt-2 text-xs text-red-400 hover:underline">Eliminar</button>
              </div>
            ))}
            {monitoreos.filter(m => m.hospitalizacion_id === hospSeleccionada.id).length === 0 && (
              <div className="text-center py-8 text-slate-400">Sin monitoreos registrados. Agrega el primero.</div>
            )}
          </div>
        </div>
      )}
    </div>
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

  const renderFacturacion = () => (
    <VetFacturacionClinica
      companyId={companyId || ''}
      mascotas={mascotas}
      propietarios={propietarios}
      medicamentos={medicamentos}
      servicios={servicios}
      onFacturaCreada={reloadAll}
      fmtCurrency={fmtCurrency}
      brandColor={brandColor}
    />
  );

  // ─── REPORTE DE CONVENIOS ────────────────────────────────────────────────────

  const renderConvenios = () => {
    // Agrupar citas, historias y facturas por tipo_atencion
    const allRecords = [
      ...citas.map(c => ({ tipo: (c.tipo_atencion as TipoAtencion)||'PARTICULAR', zona: c.zona||'URBANA', fecha: c.fecha, tipo_registro: 'Cita', mascota: c.mascota_nombre||'-', propietario: c.propietario_nombre||'-', convenio: c.convenio_numero||'', entidad: c.entidad_convenio||'', monto: 0 })),
      ...historias.map(h => ({ tipo: (h.tipo_atencion as TipoAtencion)||'PARTICULAR', zona: h.zona||'URBANA', fecha: h.fecha, tipo_registro: 'Historia Clínica', mascota: h.mascota_nombre||'-', propietario: '', convenio: h.convenio_numero||'', entidad: h.entidad_convenio||'', monto: 0 })),
      ...facturas.map(f => ({ tipo: (f.tipo_atencion as TipoAtencion)||'PARTICULAR', zona: f.zona||'URBANA', fecha: f.fecha, tipo_registro: 'Factura', mascota: f.mascota_nombre||'-', propietario: f.propietario_nombre||'-', convenio: f.convenio_numero||'', entidad: f.entidad_convenio||'', monto: f.total })),
    ];

    const resumen = Object.entries(TIPOS_ATENCION).map(([key, cfg]) => {
      const regs = allRecords.filter(r => r.tipo === key);
      const citsCount = citas.filter(c => (c.tipo_atencion||'PARTICULAR') === key).length;
      const histCount = historias.filter(h => (h.tipo_atencion||'PARTICULAR') === key).length;
      const factTotal = facturas.filter(f => (f.tipo_atencion||'PARTICULAR') === key).reduce((s,f) => s+(f.total||0), 0);
      const factCobrado = facturas.filter(f => (f.tipo_atencion||'PARTICULAR') === key).reduce((s,f) => s+(f.abonado||0), 0);
      const ruralCount = regs.filter(r => r.zona === 'RURAL').length;
      return { key: key as TipoAtencion, cfg, citsCount, histCount, factTotal, factCobrado, ruralCount, total: regs.length };
    }).filter(r => r.total > 0);

    const mesActual = today().slice(0,7);
    const registrosMes = allRecords.filter(r => r.fecha?.startsWith(mesActual));

    const exportarCSV = () => {
      const header = ['Tipo Atención','Zona','Fecha','Tipo Registro','Mascota','Propietario','Convenio Nº','Entidad','Monto'];
      const rows = allRecords.map(r => [
        TIPOS_ATENCION[r.tipo]?.label||r.tipo, r.zona, r.fecha,
        r.tipo_registro, r.mascota, r.propietario,
        r.convenio, r.entidad, r.monto,
      ]);
      const BOM = '\uFEFF';
      const csv = BOM + [header, ...rows].map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `reporte_convenios_${today()}.csv`;
      a.click(); URL.revokeObjectURL(url);
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Reporte de Convenios y Atenciones</h3>
            <p className="text-sm text-slate-400">Resumen para rendición de cuentas al municipio y gobernación</p>
          </div>
          <button onClick={exportarCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold"
            style={{ background: brandColor }}>
            <Download size={15}/> Exportar CSV
          </button>
        </div>

        {/* Tarjetas resumen por tipo */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {resumen.map(r => (
            <div key={r.key} className="bg-white rounded-xl p-5 border shadow-sm" style={{ borderLeftWidth: 4, borderLeftColor: r.cfg.color }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{r.cfg.icon}</span>
                <p className="font-bold text-slate-700">{r.cfg.label}</p>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Citas</span><span className="font-bold">{r.citsCount}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Historias</span><span className="font-bold">{r.histCount}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Rural</span><span className="font-bold text-amber-600">{r.ruralCount}</span></div>
                {r.key !== 'JORNADA_GRATUITA' && r.key !== 'ALCALDIA' && r.key !== 'GOBERNACION' && (
                  <>
                    <div className="flex justify-between border-t border-slate-100 pt-1"><span className="text-slate-400">Facturado</span><span className="font-bold text-slate-700">{fmtCurrency(r.factTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Cobrado</span><span className="font-bold text-emerald-600">{fmtCurrency(r.factCobrado)}</span></div>
                  </>
                )}
                {(r.key === 'ALCALDIA' || r.key === 'GOBERNACION') && (
                  <div className="mt-2 px-2 py-1 rounded-lg text-xs font-semibold text-center" style={{ background: r.cfg.color + '20', color: r.cfg.color }}>
                    Servicio Gratuito — {r.total} atenciones
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Este mes */}
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
          <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart2 size={16} style={{ color: brandColor }}/> Atenciones Este Mes ({mesActual})
            <span className="ml-2 text-sm font-normal text-slate-400">{registrosMes.length} registros</span>
          </h4>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(TIPOS_ATENCION).map(([key, cfg]) => {
              const cnt = registrosMes.filter(r => r.tipo === key).length;
              if (cnt === 0) return null;
              return (
                <div key={key} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: cfg.color + '15' }}>
                  <span>{cfg.icon}</span>
                  <div>
                    <p className="text-xs text-slate-500">{cfg.label}</p>
                    <p className="text-xl font-extrabold" style={{ color: cfg.color }}>{cnt}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabla detallada de convenios */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="font-bold text-slate-700 text-sm">Detalle de Registros con Convenio</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>{['Tipo','Zona','Mascota','Propietario','Fecha','Tipo Registro','Convenio','Entidad'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allRecords.filter(r => r.tipo !== 'PARTICULAR').length === 0
                  ? <tr><td colSpan={8} className="text-center py-8 text-slate-400">Sin registros de convenios aún</td></tr>
                  : allRecords.filter(r => r.tipo !== 'PARTICULAR').sort((a,b) => b.fecha > a.fecha ? 1 : -1).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><AtencionBadge tipo={r.tipo} zona={r.zona} /></td>
                      <td className="px-4 py-3"><span className={`text-xs font-semibold ${r.zona==='RURAL'?'text-amber-600':'text-slate-500'}`}>{r.zona === 'RURAL' ? '🌾 Rural' : '🏙️ Urbana'}</span></td>
                      <td className="px-4 py-3 font-semibold">{r.mascota}</td>
                      <td className="px-4 py-3">{r.propietario||'-'}</td>
                      <td className="px-4 py-3">{r.fecha}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{r.tipo_registro}</span></td>
                      <td className="px-4 py-3 font-mono text-xs">{r.convenio||'-'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{r.entidad||'-'}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ─── NUEVOS RENDER: LABORATORIO, CONSENTIMIENTOS, HOSPITALIZACION MEJORADA ──

  const renderLaboratorio = () => (
    <TableWrapper headers={['Mascota','Tipo','Fecha','Descripción','Resultado','Acciones']}
      onAdd={() => { setFormLab(emptyLab()); setModal('laboratorio'); }} btnLabel="Nuevo Resultado"
      search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(resultadosLab, ['mascota_nombre','tipo','descripcion']).sort((a,b) => b.fecha > a.fecha ? 1 : -1).map(r => (
        <Row key={r.id}
          cells={[
            <span className="font-semibold">{r.mascota_nombre || '-'}</span>,
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-700">{r.tipo}</span>,
            r.fecha,
            <span className="max-w-[140px] truncate block text-xs">{r.descripcion}</span>,
            r.resultado
              ? <span className="text-emerald-600 font-semibold text-xs">{r.resultado.slice(0,30)}{r.resultado.length>30?'...':''}</span>
              : pill('Pendiente','#f59e0b'),
          ]}
          onView={() => setDetailItem({ type: 'laboratorio', data: r })}
          onEdit={() => openEdit('laboratorio', r)}
          onDelete={() => deleteItem('laboratorio', r.id!)}
        />
      ))}
    </TableWrapper>
  );

  const renderConsentimientos = () => (
    <TableWrapper headers={['Mascota','Propietario','Tipo','Fecha','Veterinario','Firmado','Acciones']}
      onAdd={() => { setFormConsentimiento(emptyConsentimiento()); setModal('consentimientos'); }}
      btnLabel="Nuevo Consentimiento" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filteredQ(consentimientos, ['mascota_nombre','propietario_nombre','tipo']).sort((a,b) => b.fecha > a.fecha ? 1 : -1).map(c => (
        <Row key={c.id}
          cells={[
            <span className="font-semibold">{c.mascota_nombre || '-'}</span>,
            c.propietario_nombre || '-',
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">{c.tipo}</span>,
            c.fecha,
            personal.find(p => p.id === c.veterinario_id)?.nombre || '-',
            c.firmado ? pill('Firmado','#10b981') : pill('Pendiente','#f59e0b'),
          ]}
          onPrint={() => imprimirConsentimiento(c)}
          onEdit={() => openEdit('consentimientos', c)}
          onDelete={() => deleteItem('consentimientos', c.id!)}
        />
      ))}
    </TableWrapper>
  );

  // ─── TAB CONTENT MAP ──────────────────────────────────────────────────────
  const tabContent: Record<TabId, () => React.ReactNode> = {
    dashboard:       renderDashboard,
    propietarios:    renderPropietarios,
    mascotas:        renderMascotas,
    personal:        renderPersonal,
    consultorios:    renderConsultorios,
    agenda:          renderAgenda,
    historia:        renderHistoria,
    laboratorio:     renderLaboratorio,
    vacunacion:      renderVacunacion,
    peso:            renderPeso,
    hospitalizacion: renderHospitalizacion,
    farmacia:        renderFarmacia,
    servicios:       renderServicios,
    planes:          renderPlanes,
    consentimientos: renderConsentimientos,
    facturacion:     renderFacturacion,
    convenios:       renderConvenios,
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

    if (detailItem.type === 'laboratorio') {
      const r = detailItem.data;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800">Resultado de Laboratorio</h3>
              <button onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-slate-400">Paciente:</span> <strong>{r.mascota_nombre}</strong></div>
                <div><span className="text-slate-400">Tipo:</span> <strong>{r.tipo}</strong></div>
                <div><span className="text-slate-400">Fecha:</span> <strong>{r.fecha}</strong></div>
                <div><span className="text-slate-400">Veterinario:</span> <strong>{personal.find((p: any) => p.id === r.veterinario_id)?.nombre || '-'}</strong></div>
              </div>
              {r.descripcion && <div><p className="font-semibold text-slate-600 mb-1">Descripción</p><p className="p-3 bg-slate-50 rounded-lg">{r.descripcion}</p></div>}
              {r.resultado && <div><p className="font-semibold text-slate-600 mb-1">Resultado</p><p className="p-3 bg-emerald-50 rounded-lg text-emerald-800">{r.resultado}</p></div>}
              {r.valores_referencia && <div><p className="font-semibold text-slate-600 mb-1">Valores de Referencia</p><p className="p-3 bg-slate-50 rounded-lg font-mono text-xs">{r.valores_referencia}</p></div>}
              {r.archivo_url && <a href={r.archivo_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sky-600 hover:underline font-semibold"><Download size={16}/> Ver archivo adjunto</a>}
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
            <div className="col-span-2"><VoiceTextarea label="Observaciones" value={formPropietario.observaciones} onChange={v => setFormPropietario(f => ({...f, observaciones: v}))} rows={2} /></div>
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
            <div className="col-span-2"><VoiceTextarea label="Observaciones" value={formMascota.observaciones} onChange={v => setFormMascota(f => ({...f, observaciones: v}))} rows={2} /></div>
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
            <div className="col-span-2"><VoiceTextarea label="Observaciones" value={formConsultorio.observaciones} onChange={v => setFormConsultorio(f => ({...f, observaciones: v}))} rows={2} /></div>
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
            <Select label="Tipo de Cita" value={formCita.tipo_cita || 'Consulta general'}
              onChange={v => setFormCita(f => ({...f, tipo_cita: v, motivo: v}))}
              options={['Consulta general','Vacunación','Control','Cirugía','Peluquería','Urgencia','Jornada','Otro'].map(t => ({value:t, label:t}))} />
            <Select label="Consultorio" value={formCita.consultorio_id}
              onChange={v => setFormCita(f => ({...f, consultorio_id: v}))}
              options={[{value:'', label:'Sin asignar'}, ...consultorio_opts]} />
            <Select label="Estado" value={formCita.estado}
              onChange={v => setFormCita(f => ({...f, estado: v as CitaStatus}))}
              options={[{value:'PROGRAMADA',label:'Programada'},{value:'ATENDIDA',label:'Atendida'},{value:'CANCELADA',label:'Cancelada'}]} />
            <div className="col-span-2"><Input label="Motivo adicional" value={formCita.motivo} onChange={v => setFormCita(f => ({...f, motivo: v}))} /></div>
            <AtencionSelector
              tipo={(formCita.tipo_atencion as TipoAtencion) || 'PARTICULAR'}
              zona={formCita.zona as 'URBANA'|'RURAL' || 'URBANA'}
              convenioNumero={formCita.convenio_numero}
              entidadConvenio={formCita.entidad_convenio}
              onChange={patch => setFormCita(f => ({...f, ...patch}))}
            />
            <div className="col-span-2"><VoiceTextarea label="Notas" value={formCita.notas} onChange={v => setFormCita(f => ({...f, notas: v}))} rows={2} placeholder="Notas adicionales... (puede dictar con el micrófono 🎤)" /></div>
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
            <AtencionSelector
              tipo={(formHistoria.tipo_atencion as TipoAtencion) || 'PARTICULAR'}
              zona={(formHistoria.zona as 'URBANA'|'RURAL') || 'URBANA'}
              convenioNumero={formHistoria.convenio_numero}
              entidadConvenio={formHistoria.entidad_convenio}
              onChange={patch => setFormHistoria(f => ({...f, ...patch}))}
            />
            <div className="col-span-2"><VoiceTextarea label="Diagnóstico *" value={formHistoria.diagnostico} onChange={v => setFormHistoria(f => ({...f, diagnostico: v}))} required placeholder="Describa el diagnóstico... (puede dictar 🎤)" /></div>
            <div className="col-span-2"><VoiceTextarea label="Tratamiento" value={formHistoria.tratamiento} onChange={v => setFormHistoria(f => ({...f, tratamiento: v}))} placeholder="Describa el tratamiento indicado..." /></div>
            <div className="col-span-2"><VoiceTextarea label="Medicamentos (separados por coma — se descontarán del stock)" value={formHistoria.medicamentos} onChange={v => setFormHistoria(f => ({...f, medicamentos: v}))} rows={2} placeholder="Amoxicilina 250mg, Meloxicam 1mg" /></div>
            <Input label="Próximo control" value={formHistoria.proximo_control || ''} onChange={v => setFormHistoria(f => ({...f, proximo_control: v}))} type="date" />
            <div className="col-span-2"><VoiceTextarea label="Observaciones" value={formHistoria.observaciones} onChange={v => setFormHistoria(f => ({...f, observaciones: v}))} rows={2} placeholder="Observaciones adicionales..." /></div>
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
            <div className="col-span-1"><VoiceTextarea label="Observaciones" value={formPeso.observaciones} onChange={v => setFormPeso(f => ({...f, observaciones: v}))} rows={2} /></div>
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
            <div className="col-span-2"><VoiceTextarea label="Motivo / Diagnóstico *" value={formHospitalizacion.motivo} onChange={v => setFormHospitalizacion(f => ({...f, motivo: v}))} /></div>
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
            <div className="col-span-2"><VoiceTextarea label="Descripción" value={formServicio.descripcion} onChange={v => setFormServicio(f => ({...f, descripcion: v}))} rows={2} /></div>
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
            <div className="col-span-2"><VoiceTextarea label="Servicios Incluidos" value={formPlan.servicios_incluidos} onChange={v => setFormPlan(f => ({...f, servicios_incluidos: v}))} /></div>
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
            <AtencionSelector
              tipo={(formFactura.tipo_atencion as TipoAtencion) || 'PARTICULAR'}
              zona={(formFactura.zona as 'URBANA'|'RURAL') || 'URBANA'}
              convenioNumero={formFactura.convenio_numero}
              entidadConvenio={formFactura.entidad_convenio}
              onChange={patch => setFormFactura(f => ({...f, ...patch}))}
            />
            <div className="col-span-2"><VoiceTextarea label="Notas" value={formFactura.notas} onChange={v => setFormFactura(f => ({...f, notas: v}))} rows={2} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'laboratorio' && (
        <ModalWrapper title={editing?.id ? 'Editar Resultado' : 'Nuevo Resultado de Laboratorio'} onClose={closeModal} onSave={saveLab} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mascota *" value={formLab.mascota_id} onChange={v => setFormLab(f => ({...f, mascota_id: v}))} options={[{value:'',label:'Seleccionar...'}, ...mascotas_opts]} />
            <Select label="Tipo *" value={formLab.tipo} onChange={v => setFormLab(f => ({...f, tipo: v}))} options={['Hemograma','Uroanálisis','Coprologico','Bioquímica','Radiografía','Ecografía','Citología','Cultivo','PCR','Otro'].map(t => ({value:t,label:t}))} />
            <Input label="Fecha" value={formLab.fecha} onChange={v => setFormLab(f => ({...f, fecha: v}))} type="date" />
            <Select label="Veterinario" value={formLab.veterinario_id} onChange={v => setFormLab(f => ({...f, veterinario_id: v}))} options={[{value:'',label:'Sin asignar'}, ...vet_opts]} />
            <div className="col-span-2"><VoiceTextarea label="Descripción / Parámetros" value={formLab.descripcion} onChange={v => setFormLab(f => ({...f, descripcion: v}))} rows={2} /></div>
            <div className="col-span-2"><VoiceTextarea label="Resultado" value={formLab.resultado} onChange={v => setFormLab(f => ({...f, resultado: v}))} rows={3} placeholder="Resultados del análisis..." /></div>
            <div className="col-span-2"><VoiceTextarea label="Valores de Referencia" value={formLab.valores_referencia || ''} onChange={v => setFormLab(f => ({...f, valores_referencia: v}))} rows={2} placeholder="Eritrocitos: 5.5-8.5 M/µL..." /></div>
            <div className="col-span-2"><Input label="URL Archivo adjunto" value={formLab.archivo_url || ''} onChange={v => setFormLab(f => ({...f, archivo_url: v}))} placeholder="https://drive.google.com/..." /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'monitoreo' && hospSeleccionada && (
        <ModalWrapper title="Agregar Monitoreo" onClose={() => setModal(null)} onSave={() => saveMonitoreo(hospSeleccionada.id!)} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" value={formMonitoreo.fecha} onChange={v => setFormMonitoreo(f => ({...f, fecha: v}))} type="date" />
            <Input label="Hora" value={formMonitoreo.hora} onChange={v => setFormMonitoreo(f => ({...f, hora: v}))} type="time" />
            <Input label="Temperatura (°C) *" value={formMonitoreo.temperatura} onChange={v => setFormMonitoreo(f => ({...f, temperatura: v}))} type="number" />
            <Input label="Peso (kg)" value={formMonitoreo.peso} onChange={v => setFormMonitoreo(f => ({...f, peso: v}))} type="number" />
            <Input label="Frec. Cardíaca (bpm)" value={formMonitoreo.frecuencia_cardiaca || 0} onChange={v => setFormMonitoreo(f => ({...f, frecuencia_cardiaca: v}))} type="number" />
            <Input label="Frec. Respiratoria (rpm)" value={formMonitoreo.frecuencia_respiratoria || 0} onChange={v => setFormMonitoreo(f => ({...f, frecuencia_respiratoria: v}))} type="number" />
            <div className="col-span-2"><VoiceTextarea label="Medicación administrada" value={formMonitoreo.medicacion} onChange={v => setFormMonitoreo(f => ({...f, medicacion: v}))} rows={2} /></div>
            <div className="col-span-2"><VoiceTextarea label="Observaciones" value={formMonitoreo.observaciones} onChange={v => setFormMonitoreo(f => ({...f, observaciones: v}))} rows={2} /></div>
            <div className="col-span-2"><Input label="Responsable" value={formMonitoreo.responsable || ''} onChange={v => setFormMonitoreo(f => ({...f, responsable: v}))} /></div>
          </div>
        </ModalWrapper>
      )}

      {modal === 'consentimientos' && (
        <ModalWrapper title={editing?.id ? 'Editar Consentimiento' : 'Nuevo Consentimiento Informado'} onClose={closeModal} onSave={saveConsentimiento} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Mascota *" value={formConsentimiento.mascota_id}
              onChange={v => { const m = mascotas.find(x => x.id === v); setFormConsentimiento(f => ({...f, mascota_id: v, propietario_id: m?.propietario_id || ''})); }}
              options={[{value:'',label:'Seleccionar...'}, ...mascotas_opts]} />
            <Select label="Tipo de Procedimiento *" value={formConsentimiento.tipo} onChange={v => setFormConsentimiento(f => ({...f, tipo: v}))}
              options={['Cirugía','Anestesia','Eutanasia','Procedimiento diagnóstico','Hospitalización','Transfusión','Otro'].map(t => ({value:t,label:t}))} />
            <Input label="Fecha" value={formConsentimiento.fecha} onChange={v => setFormConsentimiento(f => ({...f, fecha: v}))} type="date" />
            <Select label="Veterinario" value={formConsentimiento.veterinario_id} onChange={v => setFormConsentimiento(f => ({...f, veterinario_id: v}))} options={[{value:'',label:'Sin asignar'}, ...vet_opts]} />
            <div className="col-span-2"><VoiceTextarea label="Descripción del procedimiento y riesgos" value={formConsentimiento.descripcion} onChange={v => setFormConsentimiento(f => ({...f, descripcion: v}))} rows={4} placeholder="Describa el procedimiento, riesgos y alternativas informadas al propietario..." /></div>
            <div className="col-span-2 flex items-center gap-2 mt-1">
              <input type="checkbox" id="firmado" checked={formConsentimiento.firmado} onChange={e => setFormConsentimiento(f => ({...f, firmado: e.target.checked}))} className="w-4 h-4 rounded" />
              <label htmlFor="firmado" className="text-sm text-slate-700 cursor-pointer">Consentimiento firmado por el propietario</label>
            </div>
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
        <div className="flex items-center gap-2">
          {activeTab === 'farmacia' && (
            <button onClick={() => setImportModal('veterinaria_medicamentos')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700">
              📥 Importar Medicamentos
            </button>
          )}
          {activeTab === 'servicios' && (
            <button onClick={() => setImportModal('veterinaria_servicios')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700">
              📥 Importar Servicios
            </button>
          )}
          <RefreshButton onRefresh={reloadAll} />
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

      {/* Import Modal */}
      {importModal && companyId && (
        <ImportModuleModal
          isOpen={!!importModal}
          onClose={() => setImportModal(null)}
          moduleType={importModal}
          companyId={companyId}
          onSuccess={() => { setImportModal(null); reloadAll(); }}
        />
      )}
    </div>
  );
};

export default Veterinaria;