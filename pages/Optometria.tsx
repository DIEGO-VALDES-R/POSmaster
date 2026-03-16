import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Search, User, Users, Building2,
  Calendar, FileText, DollarSign, Eye,
  CheckCircle, Clock, XCircle, Edit2, Trash2,
  Phone, Mail, MapPin, BarChart2, Star, Printer,
  RefreshCw, ShoppingCart, Receipt, AlertTriangle,
  ChevronDown, ChevronRight, Package, Glasses,
  Activity, Settings, MessageSquare, Download
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useNavigate } from 'react-router-dom';
import RefreshButton from '../components/RefreshButton';
import ImportModuleModal, { ModuleType } from '../components/ImportModuleModal';
import toast from 'react-hot-toast';

// ══════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════

type PersonalType   = 'OPTOMETRA' | 'AUXILIAR' | 'RECEPCION' | 'OPTICO';
type PersonalStatus = 'ACTIVO' | 'INACTIVO';
type ConsultorioStatus = 'DISPONIBLE' | 'OCUPADO' | 'INACTIVO';
type CitaStatus     = 'PROGRAMADA' | 'ATENDIDA' | 'CANCELADA';
type FacturaStatus  = 'PAGADA' | 'PENDIENTE' | 'ABONO';
type LenteType      = 'MONOFOCAL' | 'BIFOCAL' | 'PROGRESIVO' | 'CONTACTO' | 'SOLAR' | 'OTRO';
type MarcoType      = 'METALICO' | 'ACETATO' | 'MIXTO' | 'TITANIO' | 'NYLON' | 'OTRO';

interface Personal {
  id?: string; company_id?: string;
  nombre: string; documento: string; tipo: PersonalType;
  especialidad: string; telefono: string; correo: string;
  estado: PersonalStatus; registro_profesional?: string;
}

interface Consultorio {
  id?: string; company_id?: string;
  nombre: string; optometra_id: string; auxiliar_id: string;
  estado: ConsultorioStatus; observaciones: string;
}

interface Paciente {
  id?: string; company_id?: string;
  nombre: string; documento: string; fecha_nacimiento: string;
  telefono: string; correo: string; direccion: string;
  eps: string; ocupacion: string; observaciones: string;
  foto_url?: string;
  // Antecedentes
  antecedentes_oculares?: string;
  antecedentes_familiares?: string;
  enfermedades_sistemicas?: string;
  medicamentos_actuales?: string;
}

interface Cita {
  id?: string; company_id?: string;
  paciente_id: string; paciente_nombre?: string;
  optometra_id: string; optometra_nombre?: string;
  consultorio_id: string; fecha: string; hora: string;
  motivo: string; tipo_cita: string; estado: CitaStatus; notas: string;
}

// Refracción ocular — el corazón de la optometría
interface Refraccion {
  id?: string; company_id?: string;
  paciente_id: string; paciente_nombre?: string;
  optometra_id: string; optometra_nombre?: string;
  fecha: string;
  // Ojo derecho (OD)
  od_esfera: string; od_cilindro: string; od_eje: number;
  od_adicion: string; od_av_sc: string; od_av_cc: string;
  od_presion?: number;
  // Ojo izquierdo (OI)
  oi_esfera: string; oi_cilindro: string; oi_eje: number;
  oi_adicion: string; oi_av_sc: string; oi_av_cc: string;
  oi_presion?: number;
  // Datos generales
  distancia_pupilar_ld: number; // DP lejos derecho
  distancia_pupilar_li: number; // DP lejos izquierdo
  distancia_pupilar_cd: number; // DP cerca derecho
  distancia_pupilar_ci: number; // DP cerca izquierdo
  tipo_lente: LenteType;
  diagnostico: string;
  recomendaciones: string;
  observaciones: string;
  proximo_control?: string;
}

// Historia clínica completa
interface HistoriaClinica {
  id?: string; company_id?: string;
  paciente_id: string; paciente_nombre?: string;
  optometra_id: string; fecha: string;
  motivo_consulta: string;
  agudeza_visual_sc_od: string; // Sin corrección OD
  agudeza_visual_sc_oi: string;
  agudeza_visual_cc_od: string; // Con corrección OD
  agudeza_visual_cc_oi: string;
  biomicroscopia?: string;       // Lámpara de hendidura
  fondo_ojo?: string;
  tonometria_od?: number;
  tonometria_oi?: number;
  diagnostico: string;
  plan_tratamiento: string;
  observaciones: string;
  proximo_control?: string;
}

// Orden de lentes / monturas
interface OrdenLentes {
  id?: string; company_id?: string;
  paciente_id: string; paciente_nombre?: string;
  refraccion_id?: string;
  fecha_orden: string; fecha_entrega?: string;
  // Lentes
  tipo_lente: LenteType;
  material_lente: string; tratamiento_lente: string;
  // Marco
  tipo_marco: MarcoType;
  marca_marco: string; referencia_marco: string; color_marco: string;
  precio_marco: number;
  // Lentes detalle
  precio_lentes: number;
  // Estado
  estado: 'PENDIENTE' | 'EN_LABORATORIO' | 'LISTO' | 'ENTREGADO';
  laboratorio?: string;
  observaciones: string;
  total: number;
  abonado: number;
  saldo: number;
  estado_pago: FacturaStatus;
}

// Inventario de monturas y lentes
interface Montura {
  id?: string; company_id?: string;
  referencia: string; marca: string; tipo: MarcoType;
  color: string; material: string; precio_costo: number;
  precio_venta: number; stock: number; stock_minimo: number;
  activo: boolean;
}

interface Servicio {
  id?: string; company_id?: string;
  nombre: string; precio: number; descripcion: string;
  categoria: string; activo: boolean;
}

interface FacturaOpto {
  id?: string; company_id?: string;
  paciente_id: string; paciente_nombre?: string;
  descripcion: string; total: number; abonado: number; saldo: number;
  estado: FacturaStatus; fecha: string; notas: string;
}

// ══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════════

const PERSONAL_LABELS: Record<PersonalType, string> = {
  OPTOMETRA: 'Optómetra', AUXILIAR: 'Auxiliar',
  RECEPCION: 'Recepción', OPTICO: 'Óptico',
};
const TIPOS_CITA   = ['Examen visual', 'Control', 'Adaptación de lentes de contacto', 'Urgencia', 'Entrega de lentes', 'Otro'];
const TIPOS_LENTE  = ['MONOFOCAL', 'BIFOCAL', 'PROGRESIVO', 'CONTACTO', 'SOLAR', 'OTRO'];
const TIPOS_MARCO  = ['METALICO', 'ACETATO', 'MIXTO', 'TITANIO', 'NYLON', 'OTRO'];
const CATEGORIAS_SRV = ['Examen visual', 'Topografía', 'Adaptación LC', 'Cirugía refractiva', 'Tratamiento', 'Otro'];
const MATERIALES_LENTE = ['CR-39', 'Policarbonato', 'Trivex', 'Alto índice 1.60', 'Alto índice 1.67', 'Alto índice 1.74'];
const TRATAMIENTOS    = ['Antireflejo', 'Fotocromatico', 'Antireflejo + Fotocromatico', 'Filtro azul', 'Sin tratamiento'];
const AV_VALUES       = ['20/20','20/25','20/30','20/40','20/50','20/60','20/80','20/100','20/200','CD','MM','PL','NPL'];

type Tab = 'dashboard' | 'pacientes' | 'personal' | 'consultorios' | 'agenda' |
           'historia' | 'refraccion' | 'ordenes' | 'monturas' | 'servicios' | 'facturacion';

const today = () => new Date().toISOString().split('T')[0];
const uid   = () => crypto.randomUUID();

// ══════════════════════════════════════════════════════════════════════
// UI HELPERS (definidos FUERA del componente)
// ══════════════════════════════════════════════════════════════════════

const Input: React.FC<{ label: string; value: string|number; onChange:(v:any)=>void; type?:string; required?:boolean; placeholder?:string; small?:boolean }> =
  ({ label, value, onChange, type='text', required, placeholder, small }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(type==='number' ? parseFloat(e.target.value)||0 : e.target.value)}
      className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${small ? 'text-xs' : 'text-sm'}`} />
  </div>
);

const Select: React.FC<{ label:string; value:string; onChange:(v:string)=>void; options:{value:string;label:string}[] }> =
  ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none bg-white">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Textarea: React.FC<{ label:string; value:string; onChange:(v:string)=>void; rows?:number; placeholder?:string }> =
  ({ label, value, onChange, rows=3, placeholder }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none resize-none" />
  </div>
);

const ModalWrapper: React.FC<{ title:string; onClose:()=>void; children:React.ReactNode; onSave:()=>void; wide?:boolean; extraWide?:boolean; brandColor:string }> =
  ({ title, onClose, children, onSave, wide, extraWide, brandColor }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className={`bg-white rounded-2xl shadow-2xl flex flex-col ${extraWide?'w-full max-w-5xl':wide?'w-full max-w-3xl':'w-full max-w-lg'} max-h-[90vh]`}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="font-bold text-lg text-slate-800">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
      </div>
      <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">{children}</div>
      <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium">Cancelar</button>
        <button onClick={onSave} className="px-5 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: brandColor }}>Guardar</button>
      </div>
    </div>
  </div>
);

const TableWrapper: React.FC<{ headers:string[]; children:React.ReactNode; onAdd:()=>void; btnLabel:string; search?:boolean; brandColor:string; searchQ:string; setSearchQ:(v:string)=>void; extra?:React.ReactNode }> =
  ({ headers, children, onAdd, btnLabel, search, brandColor, searchQ, setSearchQ, extra }) => (
  <div>
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      {search && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input placeholder="Buscar..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
            className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none"/>
        </div>
      )}
      {extra}
      <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold ml-auto" style={{ background: brandColor }}>
        <Plus size={16}/>{btnLabel}
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

const Row: React.FC<{ cells:React.ReactNode[]; onEdit?:()=>void; onDelete?:()=>void; onView?:()=>void; onPrint?:()=>void }> =
  ({ cells, onEdit, onDelete, onView, onPrint }) => (
  <tr className="hover:bg-slate-50 transition-colors">
    {cells.map((c,i) => <td key={i} className="px-4 py-3 text-slate-700">{c}</td>)}
    <td className="px-4 py-3">
      <div className="flex gap-1.5">
        {onView   && <button onClick={onView}   className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"><Eye size={14}/></button>}
        {onPrint  && <button onClick={onPrint}  className="p-1.5 rounded-lg hover:bg-purple-50 text-purple-500"><Printer size={14}/></button>}
        {onEdit   && <button onClick={onEdit}   className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500"><Edit2 size={14}/></button>}
        {onDelete && <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={14}/></button>}
      </div>
    </td>
  </tr>
);

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

const Optometria: React.FC = () => {
  const { company, companyId } = useDatabase();
  const { formatMoney }        = useCurrency();
  const brandColor = (company?.config as any)?.primary_color || '#6366f1';
  const navigate   = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [importModal, setImportModal] = useState<ModuleType | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [searchQ,   setSearchQ]   = useState('');
  const [modal,     setModal]     = useState<string|null>(null);
  const [editing,   setEditing]   = useState<any>(null);
  const [detailItem,setDetailItem]= useState<any>(null);

  // ── Data state ────────────────────────────────────────────────────
  const [personal,     setPersonal]     = useState<Personal[]>([]);
  const [consultorios, setConsultorios] = useState<Consultorio[]>([]);
  const [pacientes,    setPacientes]    = useState<Paciente[]>([]);
  const [citas,        setCitas]        = useState<Cita[]>([]);
  const [historias,    setHistorias]    = useState<HistoriaClinica[]>([]);
  const [refracciones, setRefracciones] = useState<Refraccion[]>([]);
  const [ordenes,      setOrdenes]      = useState<OrdenLentes[]>([]);
  const [monturas,     setMonturas]     = useState<Montura[]>([]);
  const [servicios,    setServicios]    = useState<Servicio[]>([]);
  const [facturas,     setFacturas]     = useState<FacturaOpto[]>([]);

  // ── Forms ────────────────────────────────────────────────────────
  const emptyPersonal    = (): Personal    => ({ nombre:'', documento:'', tipo:'OPTOMETRA', especialidad:'Optometría', telefono:'', correo:'', estado:'ACTIVO', registro_profesional:'' });
  const emptyConsultorio = (): Consultorio => ({ nombre:'', optometra_id:'', auxiliar_id:'', estado:'DISPONIBLE', observaciones:'' });
  const emptyPaciente    = (): Paciente    => ({ nombre:'', documento:'', fecha_nacimiento:'', telefono:'', correo:'', direccion:'', eps:'', ocupacion:'', observaciones:'', antecedentes_oculares:'', antecedentes_familiares:'', enfermedades_sistemicas:'', medicamentos_actuales:'' });
  const emptyCita        = (): Cita        => ({ paciente_id:'', optometra_id:'', consultorio_id:'', fecha:today(), hora:'09:00', motivo:'', tipo_cita:'Examen visual', estado:'PROGRAMADA', notas:'' });
  const emptyHistoria    = (): HistoriaClinica => ({ paciente_id:'', optometra_id:'', fecha:today(), motivo_consulta:'', agudeza_visual_sc_od:'', agudeza_visual_sc_oi:'', agudeza_visual_cc_od:'', agudeza_visual_cc_oi:'', biomicroscopia:'', fondo_ojo:'', tonometria_od:0, tonometria_oi:0, diagnostico:'', plan_tratamiento:'', observaciones:'', proximo_control:'' });
  const emptyRefraccion  = (): Refraccion  => ({ paciente_id:'', optometra_id:'', fecha:today(), od_esfera:'', od_cilindro:'', od_eje:0, od_adicion:'', od_av_sc:'', od_av_cc:'', od_presion:0, oi_esfera:'', oi_cilindro:'', oi_eje:0, oi_adicion:'', oi_av_sc:'', oi_av_cc:'', oi_presion:0, distancia_pupilar_ld:0, distancia_pupilar_li:0, distancia_pupilar_cd:0, distancia_pupilar_ci:0, tipo_lente:'MONOFOCAL', diagnostico:'', recomendaciones:'', observaciones:'', proximo_control:'' });
  const emptyOrden       = (): OrdenLentes => ({ paciente_id:'', fecha_orden:today(), tipo_lente:'MONOFOCAL', material_lente:'CR-39', tratamiento_lente:'Antireflejo', tipo_marco:'METALICO', marca_marco:'', referencia_marco:'', color_marco:'', precio_marco:0, precio_lentes:0, estado:'PENDIENTE', laboratorio:'', observaciones:'', total:0, abonado:0, saldo:0, estado_pago:'PENDIENTE' });
  const emptyMontura     = (): Montura     => ({ referencia:'', marca:'', tipo:'METALICO', color:'', material:'', precio_costo:0, precio_venta:0, stock:0, stock_minimo:3, activo:true });
  const emptyServicio    = (): Servicio    => ({ nombre:'', precio:0, descripcion:'', categoria:'Examen visual', activo:true });
  const emptyFactura     = (): FacturaOpto => ({ paciente_id:'', descripcion:'', total:0, abonado:0, saldo:0, estado:'PENDIENTE', fecha:today(), notas:'' });

  const [fPers,  setFPers]  = useState<Personal>(emptyPersonal());
  const [fCons,  setFCons]  = useState<Consultorio>(emptyConsultorio());
  const [fPac,   setFPac]   = useState<Paciente>(emptyPaciente());
  const [fCita,  setFCita]  = useState<Cita>(emptyCita());
  const [fHist,  setFHist]  = useState<HistoriaClinica>(emptyHistoria());
  const [fRef,   setFRef]   = useState<Refraccion>(emptyRefraccion());
  const [fOrden, setFOrden] = useState<OrdenLentes>(emptyOrden());
  const [fMont,  setFMont]  = useState<Montura>(emptyMontura());
  const [fSrv,   setFSrv]   = useState<Servicio>(emptyServicio());
  const [fFact,  setFFact]  = useState<FacturaOpto>(emptyFactura());

  // ── DB helpers ────────────────────────────────────────────────────
  const TABLE: Record<string,string> = {
    personal: 'opto_personal', consultorios: 'opto_consultorios',
    pacientes: 'opto_pacientes', citas: 'opto_citas',
    historias: 'opto_historias', refracciones: 'opto_refracciones',
    ordenes: 'opto_ordenes_lentes', monturas: 'opto_monturas',
    servicios: 'opto_servicios', facturas: 'opto_facturas',
  };

  const load = useCallback(async (key: string, setter: React.Dispatch<any>) => {
    if (!companyId) return;
    const { data } = await supabase.from(TABLE[key]).select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    if (data) setter(data);
  }, [companyId]);

  const reloadAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    await Promise.all([
      load('personal', setPersonal), load('consultorios', setConsultorios),
      load('pacientes', setPacientes), load('citas', setCitas),
      load('historias', setHistorias), load('refracciones', setRefracciones),
      load('ordenes', setOrdenes), load('monturas', setMonturas),
      load('servicios', setServicios), load('facturas', setFacturas),
    ]);
    setLoading(false);
  }, [companyId, load]);

  useEffect(() => { reloadAll(); }, [reloadAll]);

  const upsert = async (key: string, row: any) => {
    const { error } = await supabase.from(TABLE[key]).upsert({ ...row, company_id: companyId });
    if (error) { toast.error('Error: ' + error.message); throw error; }
  };

  const del = async (key: string, id: string, setter: React.Dispatch<any>) => {
    await supabase.from(TABLE[key]).delete().eq('id', id);
    setter((p: any[]) => p.filter(x => x.id !== id));
    toast.success('Eliminado');
  };

  const closeModal = () => { setModal(null); setEditing(null); };

  const openEdit = (tab: string, item: any) => {
    setEditing(item);
    const map: Record<string, React.Dispatch<any>> = {
      personal: setFPers, consultorios: setFCons, pacientes: setFPac,
      citas: setFCita, historias: setFHist, refracciones: setFRef,
      ordenes: setFOrden, monturas: setFMont, servicios: setFSrv,
    };
    map[tab]?.(item); setModal(tab);
  };

  // ── Saves ─────────────────────────────────────────────────────────
  const save = async (key: string, form: any, setter: React.Dispatch<any>, emptyFn: ()=>any, enrichFn?: (f:any)=>any) => {
    const row = { ...(enrichFn ? enrichFn(form) : form), id: editing?.id || uid() };
    await upsert(key, row);
    await load(key, setter);
    toast.success(editing?.id ? 'Actualizado' : 'Guardado');
    closeModal();
  };

  // Helpers lookup
  const opto_opts  = personal.filter(p=>p.tipo==='OPTOMETRA'||p.tipo==='OPTICO').map(p=>({value:p.id!,label:p.nombre}));
  const pers_opts  = personal.map(p=>({value:p.id!,label:p.nombre}));
  const cons_opts  = consultorios.map(c=>({value:c.id!,label:c.nombre}));
  const pac_opts   = pacientes.map(p=>({value:p.id!,label:p.nombre}));
  const filtQ      = (arr:any[],keys:string[]) => !searchQ?arr:arr.filter(item=>keys.some(k=>(item[k]||'').toLowerCase().includes(searchQ.toLowerCase())));
  const fmtCOP     = (n:number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
  const pill       = (text:string,color:string) => <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:color+'22',color}}>{text}</span>;
  const statusPill = (s:string) => {
    const m:Record<string,[string,string]> = { PROGRAMADA:['#3b82f6','Programada'], ATENDIDA:['#10b981','Atendida'], CANCELADA:['#ef4444','Cancelada'], ACTIVO:['#10b981','Activo'], INACTIVO:['#94a3b8','Inactivo'], DISPONIBLE:['#10b981','Disponible'], OCUPADO:['#f59e0b','Ocupado'], PAGADA:['#10b981','Pagada'], PENDIENTE:['#f59e0b','Pendiente'], ABONO:['#3b82f6','Abono'], EN_LABORATORIO:['#8b5cf6','En lab.'], LISTO:['#10b981','Listo'], ENTREGADO:['#6366f1','Entregado'] };
    const [c,l]=m[s]||['#94a3b8',s]; return pill(l,c);
  };

  const enviarRecordatorio = (c: Cita) => {
    const pac = pacientes.find(p=>p.id===c.paciente_id);
    if(!pac?.telefono) return toast.error('Sin teléfono');
    const tel = pac.telefono.replace(/\D/g,'');
    const msg = encodeURIComponent(`Hola ${pac.nombre}, le recordamos su cita en nuestra óptica el *${c.fecha}* a las *${c.hora}*. Motivo: ${c.motivo || c.tipo_cita}. ¡Lo esperamos! 👓`);
    window.open(`https://wa.me/57${tel}?text=${msg}`,'_blank');
  };

  // ── Imprimir fórmula óptica ────────────────────────────────────────
  const imprimirFormula = (r: Refraccion) => {
    const pac = pacientes.find(p=>p.id===r.paciente_id);
    const opt = personal.find(p=>p.id===r.optometra_id);
    const html = `<!DOCTYPE html><html><head><title>Fórmula Óptica</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;padding:32px;color:#1e293b;max-width:680px;margin:0 auto}
      .header{border-bottom:3px solid ${brandColor};padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}
      .clinic{font-size:22px;font-weight:900;color:${brandColor}}
      .badge{background:${brandColor};color:#fff;padding:6px 16px;border-radius:999px;font-size:13px;font-weight:bold}
      .sec{background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:16px}
      .sec h3{font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:1px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:${brandColor}18;padding:8px 12px;text-align:center;font-weight:700;color:#475569;font-size:11px}
      td{padding:10px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600}
      .eye-label{background:${brandColor};color:white;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:bold}
      .dp-box{display:inline-block;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 20px;text-align:center;margin:4px}
      .dp-val{font-size:20px;font-weight:900;color:${brandColor}}
      .dp-lbl{font-size:10px;color:#64748b}
      .firma-box{text-align:center}
      .firma-line{border-bottom:1px solid #94a3b8;width:220px;margin:40px auto 6px}
      @media print{body{padding:16px}}
    </style></head><body>
    <div class="header">
      <div><div class="clinic">${company?.name||'Óptica'}</div><div style="font-size:12px;color:#64748b;margin-top:4px">${company?.address||''} · ${company?.phone||''}</div></div>
      <div class="badge">FÓRMULA ÓPTICA</div>
    </div>
    <div class="sec">
      <h3>Datos del Paciente</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:13px">
        <div><div style="color:#94a3b8;font-size:11px">Nombre</div><strong>${pac?.nombre||'-'}</strong></div>
        <div><div style="color:#94a3b8;font-size:11px">Documento</div><strong>${pac?.documento||'-'}</strong></div>
        <div><div style="color:#94a3b8;font-size:11px">Fecha</div><strong>${r.fecha}</strong></div>
      </div>
    </div>
    <div class="sec">
      <h3>Refracción</h3>
      <table>
        <thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th><th>AV S/C</th><th>AV C/C</th><th>PIO</th></tr></thead>
        <tbody>
          <tr>
            <td><span class="eye-label">OD</span></td>
            <td>${r.od_esfera||'Plano'}</td><td>${r.od_cilindro||'—'}</td>
            <td>${r.od_eje||'—'}°</td><td>${r.od_adicion||'—'}</td>
            <td>${r.od_av_sc||'—'}</td><td>${r.od_av_cc||'—'}</td>
            <td>${r.od_presion||'—'} mmHg</td>
          </tr>
          <tr>
            <td><span class="eye-label">OI</span></td>
            <td>${r.oi_esfera||'Plano'}</td><td>${r.oi_cilindro||'—'}</td>
            <td>${r.oi_eje||'—'}°</td><td>${r.oi_adicion||'—'}</td>
            <td>${r.oi_av_sc||'—'}</td><td>${r.oi_av_cc||'—'}</td>
            <td>${r.oi_presion||'—'} mmHg</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="sec">
      <h3>Distancia Pupilar</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
        ${[['DP Lejos OD', r.distancia_pupilar_ld],['DP Lejos OI', r.distancia_pupilar_li],['DP Cerca OD', r.distancia_pupilar_cd],['DP Cerca OI', r.distancia_pupilar_ci]].map(([l,v])=>`<div class="dp-box"><div class="dp-val">${v||'—'}</div><div class="dp-lbl">${l}</div></div>`).join('')}
      </div>
    </div>
    ${r.diagnostico?`<div class="sec"><h3>Diagnóstico</h3><p style="font-size:14px;font-weight:600">${r.diagnostico}</p></div>`:''}
    ${r.recomendaciones?`<div class="sec"><h3>Recomendaciones / Tipo de Lente</h3><p style="font-size:14px">${r.tipo_lente} — ${r.recomendaciones}</p></div>`:''}
    ${r.proximo_control?`<div style="background:#f0fdf4;border-radius:8px;padding:10px;font-size:13px;color:#166534;margin-bottom:16px">📅 <strong>Próximo control:</strong> ${r.proximo_control}</div>`:''}
    <div style="display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:20px;margin-top:16px">
      <div class="firma-box"><div class="firma-line"></div><p style="font-size:12px;font-weight:bold">${opt?.nombre||'Optómetra'}</p><p style="font-size:11px;color:#64748b">${opt?.especialidad||''}</p>${opt?.registro_profesional?`<p style="font-size:11px;color:#64748b">Reg. ${opt.registro_profesional}</p>`:''}</div>
      <div style="font-size:11px;color:#94a3b8;text-align:right;align-self:flex-end"><p>Emitido: ${new Date().toLocaleDateString('es-CO')}</p><p>${company?.name||''} · NIT ${company?.nit||''}</p></div>
    </div>
    <script>window.onload=()=>window.print()</script>
    </body></html>`;
    const w=window.open('','_blank'); w?.document.write(html); w?.document.close();
  };

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = {
    pacientes:        pacientes.length,
    citasHoy:         citas.filter(c=>c.fecha===today()&&c.estado==='PROGRAMADA').length,
    ordenesEnLab:     ordenes.filter(o=>o.estado==='EN_LABORATORIO').length,
    ordenesListas:    ordenes.filter(o=>o.estado==='LISTO').length,
    stockBajo:        monturas.filter(m=>m.stock<=(m.stock_minimo||3)).length,
    ingresosMes:      facturas.filter(f=>f.fecha?.startsWith(today().slice(0,7))).reduce((s,f)=>s+(f.abonado||0),0),
    factPendientes:   facturas.filter(f=>f.estado!=='PAGADA').length,
    examenesHoy:      historias.filter(h=>h.fecha===today()).length,
  };

  // ══════════════════════════════════════════════════════════════════
  // TABS
  // ══════════════════════════════════════════════════════════════════

  const TABS_LIST: {id:Tab;label:string;icon:React.ReactNode}[] = [
    { id:'dashboard',    label:'Dashboard',        icon:<BarChart2 size={16}/> },
    { id:'pacientes',    label:'Pacientes',         icon:<User size={16}/> },
    { id:'personal',     label:'Personal',          icon:<Users size={16}/> },
    { id:'consultorios', label:'Consultorios',      icon:<Building2 size={16}/> },
    { id:'agenda',       label:'Agenda',            icon:<Calendar size={16}/> },
    { id:'historia',     label:'Historia Clínica',  icon:<FileText size={16}/> },
    { id:'refraccion',   label:'Refracción',        icon:<Eye size={16}/> },
    { id:'ordenes',      label:'Órdenes de Lentes', icon:<Glasses size={16}/> },
    { id:'monturas',     label:'Monturas',          icon:<Package size={16}/> },
    { id:'servicios',    label:'Servicios',         icon:<Activity size={16}/> },
    { id:'facturacion',  label:'Facturación',       icon:<Receipt size={16}/> },
  ];

  // ── Dashboard ─────────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title:'Pacientes',        value:stats.pacientes,     icon:<User size={22}/>,       color:'#6366f1', tab:'pacientes'    as Tab },
          { title:'Citas Hoy',        value:stats.citasHoy,      icon:<Calendar size={22}/>,   color:'#8b5cf6', tab:'agenda'       as Tab },
          { title:'Órdenes en Lab.',  value:stats.ordenesEnLab,  icon:<Glasses size={22}/>,    color:'#f59e0b', tab:'ordenes'      as Tab },
          { title:'Órdenes Listas',   value:stats.ordenesListas, icon:<CheckCircle size={22}/>,color:'#10b981', tab:'ordenes'      as Tab },
          { title:'Ingresos del Mes', value:fmtCOP(stats.ingresosMes), icon:<DollarSign size={22}/>, color:'#10b981', tab:'facturacion' as Tab },
          { title:'Fact. Pendientes', value:stats.factPendientes,icon:<Receipt size={22}/>,    color:'#f59e0b', tab:'facturacion'  as Tab },
          { title:'Stock Bajo',       value:stats.stockBajo,     icon:<AlertTriangle size={22}/>, color:'#dc2626', tab:'monturas'  as Tab },
          { title:'Exámenes Hoy',     value:stats.examenesHoy,   icon:<Eye size={22}/>,        color:'#0ea5e9', tab:'historia'     as Tab },
        ].map(k => (
          <div key={k.title} onClick={() => setActiveTab(k.tab)} className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: k.color+'18' }}>
              <span style={{ color: k.color }}>{k.icon}</span>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{k.title}</p>
              <p className="text-2xl font-bold text-slate-800">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Citas de hoy */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><Calendar size={16} style={{color:brandColor}}/> Citas de Hoy</h3>
          {citas.filter(c=>c.fecha===today()).length===0
            ? <p className="text-slate-400 text-sm text-center py-4">Sin citas para hoy</p>
            : citas.filter(c=>c.fecha===today()).map(c=>(
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">{c.hora} — {c.paciente_nombre||'N/A'}</p>
                  <p className="text-xs text-slate-400">{c.tipo_cita} · {c.optometra_nombre||'Sin asignar'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusPill(c.estado)}
                  <button onClick={()=>enviarRecordatorio(c)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-500"><MessageSquare size={13}/></button>
                </div>
              </div>
            ))
          }
        </div>

        {/* Órdenes listas para entregar */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><Glasses size={16} style={{color:'#10b981'}}/> Órdenes Listas para Entregar</h3>
          {ordenes.filter(o=>o.estado==='LISTO').length===0
            ? <p className="text-slate-400 text-sm text-center py-4">Sin órdenes listas</p>
            : ordenes.filter(o=>o.estado==='LISTO').map(o=>(
              <div key={o.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">{o.paciente_nombre||'-'}</p>
                  <p className="text-xs text-slate-400">{o.tipo_lente} · {o.marca_marco}</p>
                </div>
                {pill('✅ Lista','#10b981')}
              </div>
            ))
          }
        </div>

        {/* Stock bajo monturas */}
        {stats.stockBajo>0 && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-red-500"/> Stock Bajo — Monturas</h3>
            {monturas.filter(m=>m.stock<=(m.stock_minimo||3)).map(m=>(
              <div key={m.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div><p className="font-semibold text-slate-700 text-sm">{m.referencia} — {m.marca}</p><p className="text-xs text-slate-400">{m.tipo} · {m.color}</p></div>
                <span className="font-bold text-red-500">{m.stock} uds</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── Pacientes ─────────────────────────────────────────────────────
  const renderPacientes = () => (
    <TableWrapper headers={['Nombre','Documento','Teléfono','EPS','Última visita','Acciones']}
      onAdd={()=>{setFPac(emptyPaciente());setModal('pacientes');}} btnLabel="Nuevo Paciente" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filtQ(pacientes,['nombre','documento','telefono','eps']).map(p=>{
        const lastVisit = historias.filter(h=>h.paciente_id===p.id).sort((a,b)=>b.fecha>a.fecha?1:-1)[0];
        return (<Row key={p.id} cells={[
          <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{background:brandColor}}>{p.nombre.charAt(0)}</div><span className="font-semibold">{p.nombre}</span></div>,
          p.documento, p.telefono, p.eps||'-', lastVisit?.fecha||'Sin visitas',
        ]} onView={()=>setDetailItem({type:'paciente',data:p})} onEdit={()=>openEdit('pacientes',p)} onDelete={()=>del('pacientes',p.id!,setPacientes)}/>);
      })}
    </TableWrapper>
  );

  // ── Personal ──────────────────────────────────────────────────────
  const renderPersonal = () => (
    <TableWrapper headers={['Nombre','Tipo','Especialidad','Teléfono','Registro','Estado','Acciones']}
      onAdd={()=>{setFPers(emptyPersonal());setModal('personal');}} btnLabel="Nuevo Personal" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filtQ(personal,['nombre','especialidad']).map(p=>(
        <Row key={p.id} cells={[<span className="font-semibold">{p.nombre}</span>, PERSONAL_LABELS[p.tipo], p.especialidad, p.telefono, p.registro_profesional||'-', statusPill(p.estado)]}
          onEdit={()=>openEdit('personal',p)} onDelete={()=>del('personal',p.id!,setPersonal)}/>
      ))}
    </TableWrapper>
  );

  // ── Consultorios ──────────────────────────────────────────────────
  const renderConsultorios = () => (
    <TableWrapper headers={['Nombre','Optómetra','Auxiliar','Estado','Acciones']}
      onAdd={()=>{setFCons(emptyConsultorio());setModal('consultorios');}} btnLabel="Nuevo Consultorio" brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {consultorios.map(c=>(
        <Row key={c.id} cells={[<span className="font-semibold">{c.nombre}</span>, personal.find(p=>p.id===c.optometra_id)?.nombre||'-', personal.find(p=>p.id===c.auxiliar_id)?.nombre||'-', statusPill(c.estado)]}
          onEdit={()=>openEdit('consultorios',c)} onDelete={()=>del('consultorios',c.id!,setConsultorios)}/>
      ))}
    </TableWrapper>
  );

  // ── Agenda ────────────────────────────────────────────────────────
  const renderAgenda = () => (
    <TableWrapper headers={['Paciente','Fecha','Hora','Tipo','Optómetra','Estado','Acciones']}
      onAdd={()=>{setFCita(emptyCita());setModal('citas');}} btnLabel="Nueva Cita" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filtQ(citas,['paciente_nombre','tipo_cita']).sort((a,b)=>b.fecha>a.fecha?1:-1).map(c=>(
        <Row key={c.id} cells={[
          <span className="font-semibold">{c.paciente_nombre||'-'}</span>, c.fecha, c.hora,
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{c.tipo_cita}</span>,
          c.optometra_nombre||'-', statusPill(c.estado),
        ]} onEdit={()=>openEdit('citas',c)} onDelete={()=>del('citas',c.id!,setCitas)} onView={()=>enviarRecordatorio(c)}/>
      ))}
    </TableWrapper>
  );

  // ── Historia Clínica ──────────────────────────────────────────────
  const renderHistoria = () => (
    <TableWrapper headers={['Paciente','Fecha','Motivo','AV S/C OD','AV S/C OI','Diagnóstico','Acciones']}
      onAdd={()=>{setFHist(emptyHistoria());setModal('historias');}} btnLabel="Nueva Historia" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filtQ(historias,['paciente_nombre','diagnostico','motivo_consulta']).sort((a,b)=>b.fecha>a.fecha?1:-1).map(h=>(
        <Row key={h.id} cells={[
          <span className="font-semibold">{h.paciente_nombre||'-'}</span>, h.fecha, h.motivo_consulta,
          h.agudeza_visual_sc_od||'-', h.agudeza_visual_sc_oi||'-',
          <span className="max-w-[160px] truncate block text-xs">{h.diagnostico}</span>,
        ]} onView={()=>setDetailItem({type:'historia',data:h})} onDelete={()=>del('historias',h.id!,setHistorias)}/>
      ))}
    </TableWrapper>
  );

  // ── Refracción ────────────────────────────────────────────────────
  const renderRefraccion = () => (
    <TableWrapper headers={['Paciente','Fecha','OD Esfera','OD Cil.','OI Esfera','OI Cil.','Tipo Lente','Acciones']}
      onAdd={()=>{setFRef(emptyRefraccion());setModal('refracciones');}} btnLabel="Nueva Refracción" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filtQ(refracciones,['paciente_nombre']).sort((a,b)=>b.fecha>a.fecha?1:-1).map(r=>(
        <Row key={r.id} cells={[
          <span className="font-semibold">{r.paciente_nombre||'-'}</span>, r.fecha,
          <span className="font-mono text-sm">{r.od_esfera||'Plano'}</span>,
          <span className="font-mono text-sm">{r.od_cilindro||'—'}</span>,
          <span className="font-mono text-sm">{r.oi_esfera||'Plano'}</span>,
          <span className="font-mono text-sm">{r.oi_cilindro||'—'}</span>,
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">{r.tipo_lente}</span>,
        ]} onView={()=>setDetailItem({type:'refraccion',data:r})} onPrint={()=>imprimirFormula(r)} onDelete={()=>del('refracciones',r.id!,setRefracciones)}/>
      ))}
    </TableWrapper>
  );

  // ── Órdenes de Lentes ─────────────────────────────────────────────
  const renderOrdenes = () => (
    <TableWrapper headers={['Paciente','Fecha Orden','Tipo','Marco','Laboratorio','Estado','Total','Pago','Acciones']}
      onAdd={()=>{setFOrden(emptyOrden());setModal('ordenes');}} btnLabel="Nueva Orden" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filtQ(ordenes,['paciente_nombre','marca_marco','laboratorio']).sort((a,b)=>b.fecha_orden>a.fecha_orden?1:-1).map(o=>(
        <Row key={o.id} cells={[
          <span className="font-semibold">{o.paciente_nombre||'-'}</span>,
          o.fecha_orden,
          <span className="text-xs font-semibold">{o.tipo_lente}</span>,
          <span className="text-xs">{o.marca_marco} {o.referencia_marco}</span>,
          o.laboratorio||'-',
          statusPill(o.estado),
          <span className="font-bold text-slate-700">{fmtCOP(o.total)}</span>,
          statusPill(o.estado_pago),
        ]} onEdit={()=>openEdit('ordenes',o)} onDelete={()=>del('ordenes',o.id!,setOrdenes)}/>
      ))}
    </TableWrapper>
  );

  // ── Monturas ──────────────────────────────────────────────────────
  const renderMonturas = () => (
    <TableWrapper headers={['Referencia','Marca','Tipo','Color','Stock','Mín.','Precio Venta','Acciones']}
      onAdd={()=>{setFMont(emptyMontura());setModal('monturas');}} btnLabel="Nueva Montura" search brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {filtQ(monturas,['referencia','marca','color']).map(m=>{
        const bajo = m.stock<=(m.stock_minimo||3);
        return (<Row key={m.id} cells={[
          <span className="font-semibold font-mono text-xs">{m.referencia}</span>,
          m.marca, m.tipo, m.color,
          <span className={`font-bold ${bajo?'text-red-500':'text-slate-700'}`}>{m.stock}{bajo&&' ⚠️'}</span>,
          m.stock_minimo||3,
          <span className="font-bold text-emerald-600">{fmtCOP(m.precio_venta)}</span>,
        ]} onEdit={()=>openEdit('monturas',m)} onDelete={()=>del('monturas',m.id!,setMonturas)}/>);
      })}
    </TableWrapper>
  );

  // ── Servicios ─────────────────────────────────────────────────────
  const renderServicios = () => (
    <TableWrapper headers={['Nombre','Categoría','Precio','Estado','Acciones']}
      onAdd={()=>{setFSrv(emptyServicio());setModal('servicios');}} btnLabel="Nuevo Servicio" brandColor={brandColor} searchQ={searchQ} setSearchQ={setSearchQ}>
      {servicios.map(s=>(
        <Row key={s.id} cells={[<span className="font-semibold">{s.nombre}</span>, s.categoria, <span className="font-bold text-emerald-600">{fmtCOP(s.precio)}</span>, statusPill(s.activo?'ACTIVO':'INACTIVO')]}
          onEdit={()=>openEdit('servicios',s)} onDelete={()=>del('servicios',s.id!,setServicios)}/>
      ))}
    </TableWrapper>
  );

  // ── Facturación ───────────────────────────────────────────────────
  const renderFacturacion = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={()=>{setFFact(emptyFactura());setModal('facturas');}} className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{background:brandColor}}>
          <Plus size={16}/> Nueva Factura
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>{['Paciente','Descripción','Fecha','Total','Abonado','Saldo','Estado','Acciones'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {facturas.sort((a,b)=>b.fecha>a.fecha?1:-1).map(f=>(
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{f.paciente_nombre||'-'}</td>
                <td className="px-4 py-3 max-w-[160px] truncate">{f.descripcion}</td>
                <td className="px-4 py-3">{f.fecha}</td>
                <td className="px-4 py-3 font-bold">{fmtCOP(f.total)}</td>
                <td className="px-4 py-3 text-emerald-600 font-semibold">{fmtCOP(f.abonado)}</td>
                <td className="px-4 py-3 text-red-500 font-semibold">{fmtCOP(f.saldo)}</td>
                <td className="px-4 py-3">{statusPill(f.estado)}</td>
                <td className="px-4 py-3">
                  <button onClick={()=>del('facturas',f.id!,setFacturas)} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 size={13}/></button>
                </td>
              </tr>
            ))}
            {facturas.length===0&&<tr><td colSpan={8} className="text-center py-8 text-slate-400">Sin facturas</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // DETAIL VIEWS
  // ══════════════════════════════════════════════════════════════════

  const renderDetail = () => {
    if (!detailItem) return null;

    if (detailItem.type === 'paciente') {
      const p: Paciente = detailItem.data;
      const hists = historias.filter(h=>h.paciente_id===p.id).sort((a,b)=>b.fecha>a.fecha?1:-1);
      const refs  = refracciones.filter(r=>r.paciente_id===p.id).sort((a,b)=>b.fecha>a.fecha?1:-1);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4" style={{background:brandColor}}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center"><User size={24} className="text-white"/></div>
                <div><h3 className="font-bold text-xl text-white">{p.nombre}</h3><p className="text-white/80 text-sm">{p.documento} · {p.eps||'Sin EPS'}</p></div>
              </div>
              <button onClick={()=>setDetailItem(null)} className="text-white/80 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Teléfono:</span> <strong>{p.telefono}</strong></div>
                <div><span className="text-slate-400">Correo:</span> <strong>{p.correo||'-'}</strong></div>
                <div><span className="text-slate-400">F. Nacimiento:</span> <strong>{p.fecha_nacimiento}</strong></div>
                <div><span className="text-slate-400">Ocupación:</span> <strong>{p.ocupacion||'-'}</strong></div>
              </div>
              {(p.antecedentes_oculares||p.enfermedades_sistemicas||p.medicamentos_actuales) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                  <p className="font-bold text-amber-700 text-sm mb-2">⚕ Antecedentes</p>
                  {p.antecedentes_oculares&&<p className="text-xs text-slate-600"><strong>Oculares:</strong> {p.antecedentes_oculares}</p>}
                  {p.antecedentes_familiares&&<p className="text-xs text-slate-600"><strong>Familiares:</strong> {p.antecedentes_familiares}</p>}
                  {p.enfermedades_sistemicas&&<p className="text-xs text-slate-600"><strong>Enfermedades:</strong> {p.enfermedades_sistemicas}</p>}
                  {p.medicamentos_actuales&&<p className="text-xs text-slate-600"><strong>Medicamentos:</strong> {p.medicamentos_actuales}</p>}
                </div>
              )}
              <div>
                <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><Eye size={15}/> Última Refracción</h4>
                {refs.length===0?<p className="text-slate-400 text-sm">Sin refracciones</p>:(
                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 cursor-pointer hover:bg-indigo-50" onClick={()=>{setDetailItem(null);imprimirFormula(refs[0]);}}>
                    <div className="flex justify-between mb-2"><span className="font-bold text-slate-700 text-sm">{refs[0].fecha}</span><Printer size={14} className="text-slate-400"/></div>
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                      <div><p className="font-bold text-indigo-600 mb-1">OD</p><p>Esf: {refs[0].od_esfera||'Pl'} · Cil: {refs[0].od_cilindro||'—'} · Eje: {refs[0].od_eje}°</p></div>
                      <div><p className="font-bold text-indigo-600 mb-1">OI</p><p>Esf: {refs[0].oi_esfera||'Pl'} · Cil: {refs[0].oi_cilindro||'—'} · Eje: {refs[0].oi_eje}°</p></div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><FileText size={15}/> Historial ({hists.length})</h4>
                {hists.slice(0,3).map(h=>(
                  <div key={h.id} className="border border-slate-100 rounded-lg p-3 mb-2 bg-slate-50">
                    <p className="text-xs text-slate-400">{h.fecha}</p>
                    <p className="font-semibold text-sm text-slate-700">{h.diagnostico}</p>
                    <p className="text-xs text-slate-500">{h.motivo_consulta}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (detailItem.type === 'historia') {
      const h: HistoriaClinica = detailItem.data;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b"><h3 className="font-bold text-lg">Historia Clínica</h3><button onClick={()=>setDetailItem(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button></div>
            <div className="p-6 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-slate-400">Paciente:</span> <strong>{h.paciente_nombre}</strong></div>
                <div><span className="text-slate-400">Fecha:</span> <strong>{h.fecha}</strong></div>
              </div>
              <div><p className="font-semibold text-slate-600">Agudeza Visual S/C</p><div className="grid grid-cols-2 gap-2 mt-1"><div className="p-2 bg-slate-50 rounded-lg text-center"><p className="text-xs text-slate-400">OD</p><p className="font-bold">{h.agudeza_visual_sc_od||'-'}</p></div><div className="p-2 bg-slate-50 rounded-lg text-center"><p className="text-xs text-slate-400">OI</p><p className="font-bold">{h.agudeza_visual_sc_oi||'-'}</p></div></div></div>
              {(h.tonometria_od||h.tonometria_oi)&&<div className="grid grid-cols-2 gap-2"><div className="p-2 bg-blue-50 rounded-lg text-center"><p className="text-xs text-slate-400">PIO OD</p><p className="font-bold">{h.tonometria_od} mmHg</p></div><div className="p-2 bg-blue-50 rounded-lg text-center"><p className="text-xs text-slate-400">PIO OI</p><p className="font-bold">{h.tonometria_oi} mmHg</p></div></div>}
              <div><p className="font-semibold text-slate-600">Diagnóstico:</p><p className="mt-1 p-3 bg-slate-50 rounded-lg">{h.diagnostico}</p></div>
              {h.plan_tratamiento&&<div><p className="font-semibold text-slate-600">Plan de Tratamiento:</p><p className="mt-1 p-3 bg-slate-50 rounded-lg">{h.plan_tratamiento}</p></div>}
              {h.proximo_control&&<div className="bg-green-50 rounded-lg p-3 text-green-700 font-semibold text-sm">📅 Próximo control: {h.proximo_control}</div>}
            </div>
          </div>
        </div>
      );
    }

    if (detailItem.type === 'refraccion') {
      const r: Refraccion = detailItem.data;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-lg">Refracción — {r.paciente_nombre}</h3>
              <div className="flex gap-2">
                <button onClick={()=>imprimirFormula(r)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm hover:bg-slate-50"><Printer size={14}/> Fórmula</button>
                <button onClick={()=>setDetailItem(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left text-xs font-bold text-slate-500"></th><th className="px-3 py-2 text-center text-xs font-bold">ESFERA</th><th className="px-3 py-2 text-center text-xs font-bold">CILINDRO</th><th className="px-3 py-2 text-center text-xs font-bold">EJE</th><th className="px-3 py-2 text-center text-xs font-bold">ADICIÓN</th><th className="px-3 py-2 text-center text-xs font-bold">AV S/C</th><th className="px-3 py-2 text-center text-xs font-bold">AV C/C</th><th className="px-3 py-2 text-center text-xs font-bold">PIO</th></tr></thead>
                  <tbody>
                    {[['OD',r.od_esfera,r.od_cilindro,r.od_eje,r.od_adicion,r.od_av_sc,r.od_av_cc,r.od_presion],['OI',r.oi_esfera,r.oi_cilindro,r.oi_eje,r.oi_adicion,r.oi_av_sc,r.oi_av_cc,r.oi_presion]].map(([eye,...vals])=>(
                      <tr key={eye as string} className="border-b border-slate-100">
                        <td className="px-3 py-3"><span className="px-2 py-1 rounded-lg text-xs font-bold text-white" style={{background:brandColor}}>{eye}</span></td>
                        {vals.map((v,i)=><td key={i} className="px-3 py-3 text-center font-mono font-semibold">{v||'—'}{i===2?'°':i===6?' mmHg':''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[['DP Lejos OD',r.distancia_pupilar_ld],['DP Lejos OI',r.distancia_pupilar_li],['DP Cerca OD',r.distancia_pupilar_cd],['DP Cerca OI',r.distancia_pupilar_ci]].map(([l,v])=>(
                  <div key={l as string} className="bg-indigo-50 rounded-xl p-3 text-center"><p className="text-xs text-slate-400">{l}</p><p className="text-xl font-extrabold text-indigo-600">{v||'—'}</p><p className="text-xs text-slate-400">mm</p></div>
                ))}
              </div>
              {r.diagnostico&&<div><p className="font-semibold text-slate-600 text-sm">Diagnóstico:</p><p className="mt-1 p-3 bg-slate-50 rounded-lg text-sm">{r.diagnostico}</p></div>}
              {r.recomendaciones&&<div><p className="font-semibold text-slate-600 text-sm">Recomendaciones ({r.tipo_lente}):</p><p className="mt-1 p-3 bg-slate-50 rounded-lg text-sm">{r.recomendaciones}</p></div>}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // ══════════════════════════════════════════════════════════════════
  // MODALS
  // ══════════════════════════════════════════════════════════════════

  const renderModals = () => (
    <>
      {modal==='pacientes'&&(
        <ModalWrapper title={editing?.id?'Editar Paciente':'Nuevo Paciente'} onClose={closeModal} onSave={()=>save('pacientes',{...fPac,id:editing?.id||uid()},setPacientes,emptyPaciente)} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre completo *" value={fPac.nombre} onChange={v=>setFPac(f=>({...f,nombre:v}))} required/></div>
            <Input label="Documento" value={fPac.documento} onChange={v=>setFPac(f=>({...f,documento:v}))}/>
            <Input label="Fecha de Nacimiento" value={fPac.fecha_nacimiento} onChange={v=>setFPac(f=>({...f,fecha_nacimiento:v}))} type="date"/>
            <Input label="Teléfono" value={fPac.telefono} onChange={v=>setFPac(f=>({...f,telefono:v}))}/>
            <Input label="Correo" value={fPac.correo} onChange={v=>setFPac(f=>({...f,correo:v}))} type="email"/>
            <Input label="EPS / Aseguradora" value={fPac.eps} onChange={v=>setFPac(f=>({...f,eps:v}))}/>
            <Input label="Ocupación" value={fPac.ocupacion} onChange={v=>setFPac(f=>({...f,ocupacion:v}))}/>
            <div className="col-span-2"><Input label="Dirección" value={fPac.direccion} onChange={v=>setFPac(f=>({...f,direccion:v}))}/></div>
            <div className="col-span-2 border-t border-slate-100 pt-3"><p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Antecedentes</p></div>
            <Textarea label="Antecedentes oculares" value={fPac.antecedentes_oculares||''} onChange={v=>setFPac(f=>({...f,antecedentes_oculares:v}))} rows={2} placeholder="Cirugías, patologías previas..."/>
            <Textarea label="Antecedentes familiares" value={fPac.antecedentes_familiares||''} onChange={v=>setFPac(f=>({...f,antecedentes_familiares:v}))} rows={2}/>
            <Textarea label="Enfermedades sistémicas" value={fPac.enfermedades_sistemicas||''} onChange={v=>setFPac(f=>({...f,enfermedades_sistemicas:v}))} rows={2} placeholder="Diabetes, HTA, tiroides..."/>
            <Textarea label="Medicamentos actuales" value={fPac.medicamentos_actuales||''} onChange={v=>setFPac(f=>({...f,medicamentos_actuales:v}))} rows={2}/>
            <div className="col-span-2"><Textarea label="Observaciones" value={fPac.observaciones} onChange={v=>setFPac(f=>({...f,observaciones:v}))} rows={2}/></div>
          </div>
        </ModalWrapper>
      )}

      {modal==='personal'&&(
        <ModalWrapper title={editing?.id?'Editar Personal':'Nuevo Personal'} onClose={closeModal} onSave={()=>save('personal',{...fPers,id:editing?.id||uid()},setPersonal,emptyPersonal)} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre *" value={fPers.nombre} onChange={v=>setFPers(f=>({...f,nombre:v}))} required/></div>
            <Input label="Documento" value={fPers.documento} onChange={v=>setFPers(f=>({...f,documento:v}))}/>
            <Input label="Teléfono" value={fPers.telefono} onChange={v=>setFPers(f=>({...f,telefono:v}))}/>
            <Input label="Correo" value={fPers.correo} onChange={v=>setFPers(f=>({...f,correo:v}))} type="email"/>
            <Select label="Tipo" value={fPers.tipo} onChange={v=>setFPers(f=>({...f,tipo:v as PersonalType}))} options={Object.entries(PERSONAL_LABELS).map(([k,l])=>({value:k,label:l}))}/>
            <Input label="Especialidad" value={fPers.especialidad} onChange={v=>setFPers(f=>({...f,especialidad:v}))}/>
            <Input label="Registro Profesional" value={fPers.registro_profesional||''} onChange={v=>setFPers(f=>({...f,registro_profesional:v}))} placeholder="TP-XXXXX"/>
            <Select label="Estado" value={fPers.estado} onChange={v=>setFPers(f=>({...f,estado:v as PersonalStatus}))} options={[{value:'ACTIVO',label:'Activo'},{value:'INACTIVO',label:'Inactivo'}]}/>
          </div>
        </ModalWrapper>
      )}

      {modal==='consultorios'&&(
        <ModalWrapper title={editing?.id?'Editar Consultorio':'Nuevo Consultorio'} onClose={closeModal} onSave={()=>save('consultorios',{...fCons,id:editing?.id||uid()},setConsultorios,emptyConsultorio)} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre *" value={fCons.nombre} onChange={v=>setFCons(f=>({...f,nombre:v}))} required/></div>
            <Select label="Optómetra" value={fCons.optometra_id} onChange={v=>setFCons(f=>({...f,optometra_id:v}))} options={[{value:'',label:'Sin asignar'},...opto_opts]}/>
            <Select label="Auxiliar" value={fCons.auxiliar_id} onChange={v=>setFCons(f=>({...f,auxiliar_id:v}))} options={[{value:'',label:'Sin asignar'},...pers_opts]}/>
            <Select label="Estado" value={fCons.estado} onChange={v=>setFCons(f=>({...f,estado:v as ConsultorioStatus}))} options={[{value:'DISPONIBLE',label:'Disponible'},{value:'OCUPADO',label:'Ocupado'},{value:'INACTIVO',label:'Inactivo'}]}/>
            <div className="col-span-2"><Textarea label="Observaciones" value={fCons.observaciones} onChange={v=>setFCons(f=>({...f,observaciones:v}))} rows={2}/></div>
          </div>
        </ModalWrapper>
      )}

      {modal==='citas'&&(
        <ModalWrapper title={editing?.id?'Editar Cita':'Nueva Cita'} onClose={closeModal} onSave={async()=>{
          if(!fCita.paciente_id||!fCita.fecha) return toast.error('Paciente y fecha requeridos');
          const pac=pacientes.find(p=>p.id===fCita.paciente_id);
          const opt=personal.find(p=>p.id===fCita.optometra_id);
          await upsert('citas',{...fCita,id:editing?.id||uid(),paciente_nombre:pac?.nombre,optometra_nombre:opt?.nombre});
          await load('citas',setCitas); toast.success('Guardado'); closeModal();
        }} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Paciente *" value={fCita.paciente_id} onChange={v=>setFCita(f=>({...f,paciente_id:v}))} options={[{value:'',label:'Seleccionar...'},...pac_opts]}/>
            <Select label="Optómetra" value={fCita.optometra_id} onChange={v=>setFCita(f=>({...f,optometra_id:v}))} options={[{value:'',label:'Sin asignar'},...opto_opts]}/>
            <Input label="Fecha *" value={fCita.fecha} onChange={v=>setFCita(f=>({...f,fecha:v}))} type="date"/>
            <Input label="Hora" value={fCita.hora} onChange={v=>setFCita(f=>({...f,hora:v}))} type="time"/>
            <Select label="Tipo de Cita" value={fCita.tipo_cita} onChange={v=>setFCita(f=>({...f,tipo_cita:v,motivo:v}))} options={TIPOS_CITA.map(t=>({value:t,label:t}))}/>
            <Select label="Consultorio" value={fCita.consultorio_id} onChange={v=>setFCita(f=>({...f,consultorio_id:v}))} options={[{value:'',label:'Sin asignar'},...cons_opts]}/>
            <Select label="Estado" value={fCita.estado} onChange={v=>setFCita(f=>({...f,estado:v as CitaStatus}))} options={[{value:'PROGRAMADA',label:'Programada'},{value:'ATENDIDA',label:'Atendida'},{value:'CANCELADA',label:'Cancelada'}]}/>
            <div className="col-span-2"><Textarea label="Notas" value={fCita.notas} onChange={v=>setFCita(f=>({...f,notas:v}))} rows={2}/></div>
          </div>
        </ModalWrapper>
      )}

      {modal==='historias'&&(
        <ModalWrapper title="Nueva Historia Clínica" onClose={closeModal} onSave={async()=>{
          if(!fHist.paciente_id||!fHist.diagnostico) return toast.error('Paciente y diagnóstico requeridos');
          const pac=pacientes.find(p=>p.id===fHist.paciente_id);
          await upsert('historias',{...fHist,id:editing?.id||uid(),paciente_nombre:pac?.nombre});
          await load('historias',setHistorias); toast.success('Guardado'); closeModal();
        }} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Paciente *" value={fHist.paciente_id} onChange={v=>setFHist(f=>({...f,paciente_id:v}))} options={[{value:'',label:'Seleccionar...'},...pac_opts]}/>
            <Select label="Optómetra" value={fHist.optometra_id} onChange={v=>setFHist(f=>({...f,optometra_id:v}))} options={[{value:'',label:'Sin asignar'},...opto_opts]}/>
            <Input label="Fecha" value={fHist.fecha} onChange={v=>setFHist(f=>({...f,fecha:v}))} type="date"/>
            <div className="col-span-2"><Input label="Motivo de Consulta" value={fHist.motivo_consulta} onChange={v=>setFHist(f=>({...f,motivo_consulta:v}))}/></div>
            <p className="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wide pt-1">Agudeza Visual Sin Corrección</p>
            <Select label="AV S/C OD" value={fHist.agudeza_visual_sc_od} onChange={v=>setFHist(f=>({...f,agudeza_visual_sc_od:v}))} options={[{value:'',label:'—'},...AV_VALUES.map(v=>({value:v,label:v}))]}/>
            <Select label="AV S/C OI" value={fHist.agudeza_visual_sc_oi} onChange={v=>setFHist(f=>({...f,agudeza_visual_sc_oi:v}))} options={[{value:'',label:'—'},...AV_VALUES.map(v=>({value:v,label:v}))]}/>
            <Select label="AV C/C OD" value={fHist.agudeza_visual_cc_od} onChange={v=>setFHist(f=>({...f,agudeza_visual_cc_od:v}))} options={[{value:'',label:'—'},...AV_VALUES.map(v=>({value:v,label:v}))]}/>
            <Select label="AV C/C OI" value={fHist.agudeza_visual_cc_oi} onChange={v=>setFHist(f=>({...f,agudeza_visual_cc_oi:v}))} options={[{value:'',label:'—'},...AV_VALUES.map(v=>({value:v,label:v}))]}/>
            <Input label="Tonometría OD (mmHg)" value={fHist.tonometria_od||0} onChange={v=>setFHist(f=>({...f,tonometria_od:v}))} type="number"/>
            <Input label="Tonometría OI (mmHg)" value={fHist.tonometria_oi||0} onChange={v=>setFHist(f=>({...f,tonometria_oi:v}))} type="number"/>
            <Textarea label="Biomicroscopía" value={fHist.biomicroscopia||''} onChange={v=>setFHist(f=>({...f,biomicroscopia:v}))} rows={2} placeholder="Lámpara de hendidura..."/>
            <Textarea label="Fondo de Ojo" value={fHist.fondo_ojo||''} onChange={v=>setFHist(f=>({...f,fondo_ojo:v}))} rows={2}/>
            <div className="col-span-2"><Textarea label="Diagnóstico *" value={fHist.diagnostico} onChange={v=>setFHist(f=>({...f,diagnostico:v}))}/></div>
            <div className="col-span-2"><Textarea label="Plan de Tratamiento" value={fHist.plan_tratamiento} onChange={v=>setFHist(f=>({...f,plan_tratamiento:v}))}/></div>
            <Input label="Próximo Control" value={fHist.proximo_control||''} onChange={v=>setFHist(f=>({...f,proximo_control:v}))} type="date"/>
            <div className="col-span-2"><Textarea label="Observaciones" value={fHist.observaciones} onChange={v=>setFHist(f=>({...f,observaciones:v}))} rows={2}/></div>
          </div>
        </ModalWrapper>
      )}

      {modal==='refracciones'&&(
        <ModalWrapper title="Nueva Refracción" onClose={closeModal} onSave={async()=>{
          if(!fRef.paciente_id) return toast.error('Paciente requerido');
          const pac=pacientes.find(p=>p.id===fRef.paciente_id);
          const opt=personal.find(p=>p.id===fRef.optometra_id);
          await upsert('refracciones',{...fRef,id:editing?.id||uid(),paciente_nombre:pac?.nombre,optometra_nombre:opt?.nombre});
          await load('refracciones',setRefracciones); toast.success('Guardado'); closeModal();
        }} extraWide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Paciente *" value={fRef.paciente_id} onChange={v=>setFRef(f=>({...f,paciente_id:v}))} options={[{value:'',label:'Seleccionar...'},...pac_opts]}/>
            <Select label="Optómetra" value={fRef.optometra_id} onChange={v=>setFRef(f=>({...f,optometra_id:v}))} options={[{value:'',label:'Sin asignar'},...opto_opts]}/>
            <Input label="Fecha" value={fRef.fecha} onChange={v=>setFRef(f=>({...f,fecha:v}))} type="date"/>
            <Select label="Tipo de Lente Prescrito" value={fRef.tipo_lente} onChange={v=>setFRef(f=>({...f,tipo_lente:v as LenteType}))} options={TIPOS_LENTE.map(t=>({value:t,label:t}))}/>
          </div>

          {/* Tabla de refracción visual */}
          <div className="border border-slate-200 rounded-xl overflow-hidden mt-2">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200"><p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Datos de Refracción</p></div>
            <div className="p-4 space-y-4">
              {/* OD */}
              <div>
                <div className="flex items-center gap-2 mb-2"><span className="px-2 py-1 rounded-lg text-xs font-bold text-white" style={{background:brandColor}}>OD — Ojo Derecho</span></div>
                <div className="grid grid-cols-4 gap-2">
                  <Input label="Esfera" value={fRef.od_esfera} onChange={v=>setFRef(f=>({...f,od_esfera:v}))} placeholder="+1.00"/>
                  <Input label="Cilindro" value={fRef.od_cilindro} onChange={v=>setFRef(f=>({...f,od_cilindro:v}))} placeholder="-0.50"/>
                  <Input label="Eje (°)" value={fRef.od_eje} onChange={v=>setFRef(f=>({...f,od_eje:v}))} type="number"/>
                  <Input label="Adición" value={fRef.od_adicion} onChange={v=>setFRef(f=>({...f,od_adicion:v}))} placeholder="+2.00"/>
                  <Select label="AV Sin Corrección" value={fRef.od_av_sc} onChange={v=>setFRef(f=>({...f,od_av_sc:v}))} options={[{value:'',label:'—'},...AV_VALUES.map(v=>({value:v,label:v}))]}/>
                  <Select label="AV Con Corrección" value={fRef.od_av_cc} onChange={v=>setFRef(f=>({...f,od_av_cc:v}))} options={[{value:'',label:'—'},...AV_VALUES.map(v=>({value:v,label:v}))]}/>
                  <Input label="PIO (mmHg)" value={fRef.od_presion||0} onChange={v=>setFRef(f=>({...f,od_presion:v}))} type="number"/>
                </div>
              </div>
              {/* OI */}
              <div>
                <div className="flex items-center gap-2 mb-2"><span className="px-2 py-1 rounded-lg text-xs font-bold text-white bg-slate-500">OI — Ojo Izquierdo</span></div>
                <div className="grid grid-cols-4 gap-2">
                  <Input label="Esfera" value={fRef.oi_esfera} onChange={v=>setFRef(f=>({...f,oi_esfera:v}))} placeholder="+1.00"/>
                  <Input label="Cilindro" value={fRef.oi_cilindro} onChange={v=>setFRef(f=>({...f,oi_cilindro:v}))} placeholder="-0.50"/>
                  <Input label="Eje (°)" value={fRef.oi_eje} onChange={v=>setFRef(f=>({...f,oi_eje:v}))} type="number"/>
                  <Input label="Adición" value={fRef.oi_adicion} onChange={v=>setFRef(f=>({...f,oi_adicion:v}))} placeholder="+2.00"/>
                  <Select label="AV Sin Corrección" value={fRef.oi_av_sc} onChange={v=>setFRef(f=>({...f,oi_av_sc:v}))} options={[{value:'',label:'—'},...AV_VALUES.map(v=>({value:v,label:v}))]}/>
                  <Select label="AV Con Corrección" value={fRef.oi_av_cc} onChange={v=>setFRef(f=>({...f,oi_av_cc:v}))} options={[{value:'',label:'—'},...AV_VALUES.map(v=>({value:v,label:v}))]}/>
                  <Input label="PIO (mmHg)" value={fRef.oi_presion||0} onChange={v=>setFRef(f=>({...f,oi_presion:v}))} type="number"/>
                </div>
              </div>
              {/* DP */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Distancia Pupilar (mm)</p>
                <div className="grid grid-cols-4 gap-2">
                  <Input label="DP Lejos OD" value={fRef.distancia_pupilar_ld} onChange={v=>setFRef(f=>({...f,distancia_pupilar_ld:v}))} type="number"/>
                  <Input label="DP Lejos OI" value={fRef.distancia_pupilar_li} onChange={v=>setFRef(f=>({...f,distancia_pupilar_li:v}))} type="number"/>
                  <Input label="DP Cerca OD" value={fRef.distancia_pupilar_cd} onChange={v=>setFRef(f=>({...f,distancia_pupilar_cd:v}))} type="number"/>
                  <Input label="DP Cerca OI" value={fRef.distancia_pupilar_ci} onChange={v=>setFRef(f=>({...f,distancia_pupilar_ci:v}))} type="number"/>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Textarea label="Diagnóstico" value={fRef.diagnostico} onChange={v=>setFRef(f=>({...f,diagnostico:v}))} rows={2}/></div>
            <div className="col-span-2"><Textarea label="Recomendaciones" value={fRef.recomendaciones} onChange={v=>setFRef(f=>({...f,recomendaciones:v}))} rows={2}/></div>
            <Input label="Próximo Control" value={fRef.proximo_control||''} onChange={v=>setFRef(f=>({...f,proximo_control:v}))} type="date"/>
          </div>
        </ModalWrapper>
      )}

      {modal==='ordenes'&&(
        <ModalWrapper title={editing?.id?'Editar Orden':'Nueva Orden de Lentes'} onClose={closeModal} onSave={async()=>{
          if(!fOrden.paciente_id) return toast.error('Paciente requerido');
          const pac=pacientes.find(p=>p.id===fOrden.paciente_id);
          const total=fOrden.precio_marco+fOrden.precio_lentes;
          const saldo=total-fOrden.abonado;
          const estadoPago:FacturaStatus=fOrden.abonado>=total?'PAGADA':fOrden.abonado>0?'ABONO':'PENDIENTE';
          await upsert('ordenes',{...fOrden,id:editing?.id||uid(),paciente_nombre:pac?.nombre,total,saldo,estado_pago:estadoPago});
          await load('ordenes',setOrdenes); toast.success('Guardado'); closeModal();
        }} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Paciente *" value={fOrden.paciente_id} onChange={v=>setFOrden(f=>({...f,paciente_id:v}))} options={[{value:'',label:'Seleccionar...'},...pac_opts]}/>
            <Input label="Fecha Orden" value={fOrden.fecha_orden} onChange={v=>setFOrden(f=>({...f,fecha_orden:v}))} type="date"/>
            <p className="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wide pt-1">Lentes</p>
            <Select label="Tipo de Lente" value={fOrden.tipo_lente} onChange={v=>setFOrden(f=>({...f,tipo_lente:v as LenteType}))} options={TIPOS_LENTE.map(t=>({value:t,label:t}))}/>
            <Select label="Material" value={fOrden.material_lente} onChange={v=>setFOrden(f=>({...f,material_lente:v}))} options={MATERIALES_LENTE.map(t=>({value:t,label:t}))}/>
            <Select label="Tratamiento" value={fOrden.tratamiento_lente} onChange={v=>setFOrden(f=>({...f,tratamiento_lente:v}))} options={TRATAMIENTOS.map(t=>({value:t,label:t}))}/>
            <Input label="Precio Lentes" value={fOrden.precio_lentes} onChange={v=>setFOrden(f=>({...f,precio_lentes:v}))} type="number"/>
            <p className="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wide pt-1">Montura</p>
            <Select label="Tipo Marco" value={fOrden.tipo_marco} onChange={v=>setFOrden(f=>({...f,tipo_marco:v as MarcoType}))} options={TIPOS_MARCO.map(t=>({value:t,label:t}))}/>
            <Input label="Marca" value={fOrden.marca_marco} onChange={v=>setFOrden(f=>({...f,marca_marco:v}))}/>
            <Input label="Referencia" value={fOrden.referencia_marco} onChange={v=>setFOrden(f=>({...f,referencia_marco:v}))}/>
            <Input label="Color" value={fOrden.color_marco} onChange={v=>setFOrden(f=>({...f,color_marco:v}))}/>
            <Input label="Precio Marco" value={fOrden.precio_marco} onChange={v=>setFOrden(f=>({...f,precio_marco:v}))} type="number"/>
            <Input label="Laboratorio" value={fOrden.laboratorio||''} onChange={v=>setFOrden(f=>({...f,laboratorio:v}))}/>
            <Select label="Estado Orden" value={fOrden.estado} onChange={v=>setFOrden(f=>({...f,estado:v as any}))} options={[{value:'PENDIENTE',label:'Pendiente'},{value:'EN_LABORATORIO',label:'En Laboratorio'},{value:'LISTO',label:'Listo'},{value:'ENTREGADO',label:'Entregado'}]}/>
            <Input label="Fecha Entrega Estimada" value={fOrden.fecha_entrega||''} onChange={v=>setFOrden(f=>({...f,fecha_entrega:v}))} type="date"/>
            <p className="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wide pt-1">Pago</p>
            <Input label="Abono Inicial" value={fOrden.abonado} onChange={v=>setFOrden(f=>({...f,abonado:v}))} type="number"/>
            <div className="flex items-end pb-1"><div className="bg-slate-50 rounded-xl px-4 py-2 text-center w-full"><p className="text-xs text-slate-400">Total</p><p className="text-lg font-bold text-slate-800">{fmtCOP(fOrden.precio_marco+fOrden.precio_lentes)}</p></div></div>
            <div className="col-span-2"><Textarea label="Observaciones" value={fOrden.observaciones} onChange={v=>setFOrden(f=>({...f,observaciones:v}))} rows={2}/></div>
          </div>
        </ModalWrapper>
      )}

      {modal==='monturas'&&(
        <ModalWrapper title={editing?.id?'Editar Montura':'Nueva Montura'} onClose={closeModal} onSave={()=>save('monturas',{...fMont,id:editing?.id||uid()},setMonturas,emptyMontura)} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Referencia *" value={fMont.referencia} onChange={v=>setFMont(f=>({...f,referencia:v}))} required/>
            <Input label="Marca" value={fMont.marca} onChange={v=>setFMont(f=>({...f,marca:v}))}/>
            <Select label="Tipo" value={fMont.tipo} onChange={v=>setFMont(f=>({...f,tipo:v as MarcoType}))} options={TIPOS_MARCO.map(t=>({value:t,label:t}))}/>
            <Input label="Color" value={fMont.color} onChange={v=>setFMont(f=>({...f,color:v}))}/>
            <Input label="Material" value={fMont.material} onChange={v=>setFMont(f=>({...f,material:v}))}/>
            <Input label="Stock" value={fMont.stock} onChange={v=>setFMont(f=>({...f,stock:v}))} type="number"/>
            <Input label="Stock Mínimo" value={fMont.stock_minimo||3} onChange={v=>setFMont(f=>({...f,stock_minimo:v}))} type="number"/>
            <Input label="Precio Costo" value={fMont.precio_costo} onChange={v=>setFMont(f=>({...f,precio_costo:v}))} type="number"/>
            <Input label="Precio Venta" value={fMont.precio_venta} onChange={v=>setFMont(f=>({...f,precio_venta:v}))} type="number"/>
          </div>
        </ModalWrapper>
      )}

      {modal==='servicios'&&(
        <ModalWrapper title={editing?.id?'Editar Servicio':'Nuevo Servicio'} onClose={closeModal} onSave={()=>save('servicios',{...fSrv,id:editing?.id||uid()},setServicios,emptyServicio)} brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Input label="Nombre *" value={fSrv.nombre} onChange={v=>setFSrv(f=>({...f,nombre:v}))} required/></div>
            <Select label="Categoría" value={fSrv.categoria} onChange={v=>setFSrv(f=>({...f,categoria:v}))} options={CATEGORIAS_SRV.map(c=>({value:c,label:c}))}/>
            <Input label="Precio" value={fSrv.precio} onChange={v=>setFSrv(f=>({...f,precio:v}))} type="number"/>
            <div className="col-span-2"><Textarea label="Descripción" value={fSrv.descripcion} onChange={v=>setFSrv(f=>({...f,descripcion:v}))} rows={2}/></div>
            <div className="flex items-center gap-2 col-span-2">
              <input type="checkbox" checked={fSrv.activo} onChange={e=>setFSrv(f=>({...f,activo:e.target.checked}))} className="w-4 h-4 rounded"/>
              <span className="text-sm text-slate-700">Servicio activo</span>
            </div>
          </div>
        </ModalWrapper>
      )}

      {modal==='facturas'&&(
        <ModalWrapper title="Nueva Factura" onClose={closeModal} onSave={async()=>{
          if(!fFact.paciente_id||fFact.total<=0) return toast.error('Paciente y total requeridos');
          const pac=pacientes.find(p=>p.id===fFact.paciente_id);
          const saldo=fFact.total-fFact.abonado;
          const estado:FacturaStatus=fFact.abonado>=fFact.total?'PAGADA':fFact.abonado>0?'ABONO':'PENDIENTE';
          await upsert('facturas',{...fFact,id:uid(),paciente_nombre:pac?.nombre,saldo,estado});
          await load('facturas',setFacturas); toast.success('Guardado'); closeModal();
        }} wide brandColor={brandColor}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Paciente *" value={fFact.paciente_id} onChange={v=>setFFact(f=>({...f,paciente_id:v}))} options={[{value:'',label:'Seleccionar...'},...pac_opts]}/>
            <Input label="Fecha" value={fFact.fecha} onChange={v=>setFFact(f=>({...f,fecha:v}))} type="date"/>
            <div className="col-span-2"><Input label="Descripción (examen, lentes, etc.)" value={fFact.descripcion} onChange={v=>setFFact(f=>({...f,descripcion:v}))}/></div>
            <Input label="Total" value={fFact.total} onChange={v=>setFFact(f=>({...f,total:v}))} type="number"/>
            <Input label="Abono Inicial" value={fFact.abonado} onChange={v=>setFFact(f=>({...f,abonado:v}))} type="number"/>
            <div className="col-span-2"><Textarea label="Notas" value={fFact.notas} onChange={v=>setFFact(f=>({...f,notas:v}))} rows={2}/></div>
          </div>
        </ModalWrapper>
      )}
    </>
  );

  // ══════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════════

  const tabContent: Record<Tab, ()=>React.ReactNode> = {
    dashboard: renderDashboard, pacientes: renderPacientes,
    personal: renderPersonal, consultorios: renderConsultorios,
    agenda: renderAgenda, historia: renderHistoria,
    refraccion: renderRefraccion, ordenes: renderOrdenes,
    monturas: renderMonturas, servicios: renderServicios,
    facturacion: renderFacturacion,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: brandColor + '20' }}>
            <Eye size={22} style={{ color: brandColor }}/>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">Optometría</h1>
            <p className="text-sm text-slate-400">Gestión integral de óptica y optometría</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats.stockBajo>0&&<div onClick={()=>setActiveTab('monturas')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-semibold cursor-pointer"><AlertTriangle size={14}/> {stats.stockBajo} stock bajo</div>}
          {stats.ordenesListas>0&&<div onClick={()=>setActiveTab('ordenes')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 border border-green-100 text-green-600 text-xs font-semibold cursor-pointer"><Glasses size={14}/> {stats.ordenesListas} lista{stats.ordenesListas>1?'s':''}</div>}
          {activeTab === 'monturas' && (
            <button onClick={() => setImportModal('optometria_monturas')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700">
              📥 Importar Monturas
            </button>
          )}
          {activeTab === 'servicios' && (
            <button onClick={() => setImportModal('optometria_servicios')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700">
              📥 Importar Servicios
            </button>
          )}
          <RefreshButton onRefresh={reloadAll}/>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-1 pb-1 scrollbar-hide">
        {TABS_LIST.map(t=>(
          <button key={t.id} onClick={()=>{setActiveTab(t.id);setSearchQ('');}}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${activeTab===t.id?'text-white shadow-sm':'text-slate-500 hover:bg-slate-100'}`}
            style={activeTab===t.id?{background:brandColor}:{}}>
            {t.icon}<span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw size={24} className="animate-spin mr-3"/> Cargando...
          </div>
        ) : tabContent[activeTab]()}
      </div>

      {renderModals()}
      {detailItem && renderDetail()}
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

export default Optometria;