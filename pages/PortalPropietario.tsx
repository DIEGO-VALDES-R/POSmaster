import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import {
  PawPrint, Syringe, Calendar, FileText, Weight,
  Phone, Mail, MapPin, AlertTriangle, CheckCircle,
  Clock, ChevronDown, ChevronRight, Heart
} from 'lucide-react';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface Mascota {
  id: string; nombre: string; especie: string; raza: string;
  sexo: string; fecha_nacimiento: string; color: string;
  microchip: string; foto_url?: string; esterilizado?: boolean;
}
interface Vacuna {
  id: string; nombre_vacuna: string; fecha_aplicada: string;
  proxima_dosis: string; laboratorio?: string; lote?: string;
}
interface Cita {
  id: string; fecha: string; hora: string; motivo: string;
  estado: string; veterinario_nombre?: string; tipo_cita?: string;
}
interface Historia {
  id: string; fecha: string; diagnostico: string; tratamiento: string;
  medicamentos: string; peso: number; temperatura: number;
  veterinario_nombre?: string; proximo_control?: string;
}
interface ControlPeso {
  id: string; fecha: string; peso: number;
}
interface Company {
  name: string; phone?: string; email?: string; address?: string;
  logo_url?: string; config?: any;
}

const today = () => new Date().toISOString().split('T')[0];

// ─── COMPONENTES UI ───────────────────────────────────────────────────────────

const Badge: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: color + '22', color }}>{text}</span>
);

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; color?: string }> =
  ({ title, icon, children, color = '#0ea5e9' }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
            <span style={{ color }}>{icon}</span>
          </div>
          <h3 className="font-bold text-slate-800">{title}</h3>
        </div>
        {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
};

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const PortalPropietario: React.FC = () => {
  const [searchParams] = useSearchParams();
  const propietarioId = searchParams.get('pid');
  const companyId     = searchParams.get('cid');

  const [company,   setCompany]   = useState<Company | null>(null);
  const [mascotas,  setMascotas]  = useState<Mascota[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [vacunas,   setVacunas]   = useState<Vacuna[]>([]);
  const [citas,     setCitas]     = useState<Cita[]>([]);
  const [historias, setHistorias] = useState<Historia[]>([]);
  const [pesos,     setPesos]     = useState<ControlPeso[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  const brandColor = (company?.config as any)?.primary_color || '#0ea5e9';

  useEffect(() => {
    if (!propietarioId || !companyId) { setError('Enlace inválido'); setLoading(false); return; }
    loadData();
  }, [propietarioId, companyId]);

  useEffect(() => {
    if (selected) loadMascotaData(selected);
  }, [selected]);

  const loadData = async () => {
    try {
      const [{ data: comp }, { data: mascs }] = await Promise.all([
        supabase.from('companies').select('name,phone,email,address,logo_url,config').eq('id', companyId!).single(),
        supabase.from('vet_mascotas').select('id,nombre,especie,raza,sexo,fecha_nacimiento,color,microchip,foto_url,esterilizado').eq('company_id', companyId!).eq('propietario_id', propietarioId!),
      ]);
      if (comp) setCompany(comp);
      if (mascs && mascs.length > 0) { setMascotas(mascs); setSelected(mascs[0].id); }
      else setError('No se encontraron mascotas para este propietario.');
    } catch (e) {
      setError('Error al cargar los datos.');
    } finally {
      setLoading(false);
    }
  };

  const loadMascotaData = async (mascotaId: string) => {
    const [{ data: vacs }, { data: cits }, { data: hists }, { data: peso }] = await Promise.all([
      supabase.from('vet_vacunas').select('*').eq('company_id', companyId!).eq('mascota_id', mascotaId).order('fecha_aplicada', { ascending: false }),
      supabase.from('vet_citas').select('*').eq('company_id', companyId!).eq('mascota_id', mascotaId).order('fecha', { ascending: false }),
      supabase.from('vet_historias_clinicas').select('*').eq('company_id', companyId!).eq('mascota_id', mascotaId).order('fecha', { ascending: false }),
      supabase.from('vet_control_peso').select('*').eq('company_id', companyId!).eq('mascota_id', mascotaId).order('fecha', { ascending: false }),
    ]);
    setVacunas(vacs || []);
    setCitas(cits || []);
    setHistorias(hists || []);
    setPesos(peso || []);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full border-4 border-sky-500 border-t-transparent animate-spin mx-auto mb-4"/>
        <p className="text-slate-500">Cargando historial...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center max-w-sm">
        <AlertTriangle size={40} className="text-red-400 mx-auto mb-4"/>
        <p className="text-slate-600">{error}</p>
      </div>
    </div>
  );

  const mascotaActual = mascotas.find(m => m.id === selected);
  const edad = mascotaActual?.fecha_nacimiento ? (() => {
    const d = Date.now() - new Date(mascotaActual.fecha_nacimiento).getTime();
    const y = Math.floor(d / (1000*60*60*24*365));
    const mo = Math.floor((d % (1000*60*60*24*365)) / (1000*60*60*24*30));
    return y > 0 ? `${y} año${y>1?'s':''} ${mo}m` : `${mo} meses`;
  })() : 'Desconocida';

  const vacunasVencidas  = vacunas.filter(v => v.proxima_dosis && v.proxima_dosis <= today());
  const vacunasVigentes  = vacunas.filter(v => !v.proxima_dosis || v.proxima_dosis > today());
  const citasProximas    = citas.filter(c => c.fecha >= today() && c.estado === 'PROGRAMADA').sort((a,b) => a.fecha > b.fecha ? 1 : -1);
  const citasPasadas     = citas.filter(c => c.fecha < today() || c.estado === 'ATENDIDA');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="text-white py-6 px-4" style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)` }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            {company?.logo_url
              ? <img src={company.logo_url} alt={company.name} className="w-10 h-10 rounded-xl object-cover bg-white/20"/>
              : <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><PawPrint size={20} className="text-white"/></div>
            }
            <div>
              <p className="font-bold text-lg leading-tight">{company?.name || 'Clínica Veterinaria'}</p>
              <p className="text-white/70 text-sm">Portal de Propietario</p>
            </div>
          </div>
          {(company?.phone || company?.address) && (
            <div className="flex flex-wrap gap-3 mt-3 text-white/80 text-xs">
              {company.phone  && <span className="flex items-center gap-1"><Phone size={12}/> {company.phone}</span>}
              {company.address && <span className="flex items-center gap-1"><MapPin size={12}/> {company.address}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Selector de mascotas */}
        {mascotas.length > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {mascotas.map(m => (
              <button key={m.id} onClick={() => setSelected(m.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all border ${selected === m.id ? 'text-white shadow-md border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                style={selected === m.id ? { background: brandColor, borderColor: brandColor } : {}}>
                {m.foto_url
                  ? <img src={m.foto_url} alt={m.nombre} className="w-6 h-6 rounded-full object-cover"/>
                  : <PawPrint size={16}/>
                }
                {m.nombre}
              </button>
            ))}
          </div>
        )}

        {/* Ficha de la mascota */}
        {mascotaActual && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center gap-4">
              {mascotaActual.foto_url
                ? <img src={mascotaActual.foto_url} alt={mascotaActual.nombre} className="w-20 h-20 rounded-2xl object-cover shadow-md"/>
                : (
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: brandColor + '18' }}>
                    <PawPrint size={36} style={{ color: brandColor }}/>
                  </div>
                )
              }
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-extrabold text-slate-800">{mascotaActual.nombre}</h2>
                  {mascotaActual.esterilizado && <Badge text="Esterilizado" color="#8b5cf6"/>}
                </div>
                <p className="text-slate-500 text-sm">{mascotaActual.especie} · {mascotaActual.raza} · {mascotaActual.sexo === 'MACHO' ? '♂' : '♀'}</p>
                <p className="text-slate-400 text-xs mt-1">Edad: {edad}</p>
                {mascotaActual.microchip && <p className="text-slate-400 text-xs">Microchip: {mascotaActual.microchip}</p>}
              </div>
            </div>

            {/* Alertas de vacunas */}
            {vacunasVencidas.length > 0 && (
              <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-red-600 font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle size={16}/> {vacunasVencidas.length} vacuna{vacunasVencidas.length>1?'s':''} vencida{vacunasVencidas.length>1?'s':''}
                </p>
                {vacunasVencidas.map(v => (
                  <p key={v.id} className="text-red-500 text-xs mt-1">• {v.nombre_vacuna} — venció: {v.proxima_dosis}</p>
                ))}
                <p className="text-red-400 text-xs mt-2">Contacte a su veterinario para programar la cita.</p>
              </div>
            )}

            {/* Próxima cita */}
            {citasProximas.length > 0 && (
              <div className="mt-3 rounded-xl p-3 border" style={{ background: brandColor + '0d', borderColor: brandColor + '33' }}>
                <p className="font-semibold text-sm flex items-center gap-2" style={{ color: brandColor }}>
                  <Calendar size={16}/> Próxima cita
                </p>
                <p className="text-slate-700 text-sm mt-1 font-medium">{citasProximas[0].fecha} a las {citasProximas[0].hora}</p>
                <p className="text-slate-500 text-xs">{citasProximas[0].tipo_cita || citasProximas[0].motivo} {citasProximas[0].veterinario_nombre ? `· ${citasProximas[0].veterinario_nombre}` : ''}</p>
              </div>
            )}
          </div>
        )}

        {/* Vacunas */}
        <Section title={`Vacunas (${vacunas.length})`} icon={<Syringe size={18}/>} color="#f59e0b">
          {vacunas.length === 0
            ? <p className="text-slate-400 text-sm py-2">Sin vacunas registradas</p>
            : (
              <div className="space-y-2">
                {vacunas.map(v => {
                  const venc = v.proxima_dosis && v.proxima_dosis <= today();
                  return (
                    <div key={v.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                      <div>
                        <p className="font-semibold text-slate-700 text-sm">{v.nombre_vacuna}</p>
                        <p className="text-xs text-slate-400">Aplicada: {v.fecha_aplicada}{v.laboratorio ? ` · ${v.laboratorio}` : ''}</p>
                        {v.proxima_dosis && <p className={`text-xs font-medium ${venc ? 'text-red-500' : 'text-emerald-600'}`}>Próxima dosis: {v.proxima_dosis}</p>}
                      </div>
                      <Badge text={venc ? 'Vencida' : 'Vigente'} color={venc ? '#ef4444' : '#10b981'}/>
                    </div>
                  );
                })}
              </div>
            )
          }
        </Section>

        {/* Citas */}
        <Section title={`Citas (${citas.length})`} icon={<Calendar size={18}/>} color="#8b5cf6">
          {citas.length === 0
            ? <p className="text-slate-400 text-sm py-2">Sin citas registradas</p>
            : (
              <div className="space-y-2">
                {citasProximas.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-1 mb-2">Próximas</p>
                    {citasProximas.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <div>
                          <p className="font-semibold text-slate-700 text-sm">{c.fecha} · {c.hora}</p>
                          <p className="text-xs text-slate-400">{c.tipo_cita || c.motivo}{c.veterinario_nombre ? ` · ${c.veterinario_nombre}` : ''}</p>
                        </div>
                        <Badge text="Programada" color="#8b5cf6"/>
                      </div>
                    ))}
                  </>
                )}
                {citasPasadas.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mt-3 mb-2">Historial</p>
                    {citasPasadas.slice(0, 5).map(c => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <div>
                          <p className="font-semibold text-slate-700 text-sm">{c.fecha} · {c.hora}</p>
                          <p className="text-xs text-slate-400">{c.tipo_cita || c.motivo}</p>
                        </div>
                        <Badge text={c.estado === 'ATENDIDA' ? 'Atendida' : 'Cancelada'} color={c.estado === 'ATENDIDA' ? '#10b981' : '#ef4444'}/>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )
          }
        </Section>

        {/* Historia clínica */}
        <Section title={`Historia Clínica (${historias.length} registros)`} icon={<FileText size={18}/>} color="#0ea5e9">
          {historias.length === 0
            ? <p className="text-slate-400 text-sm py-2">Sin historia clínica</p>
            : (
              <div className="space-y-3">
                {historias.slice(0, 5).map(h => (
                  <div key={h.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-slate-700 text-sm">{h.fecha}</p>
                      <div className="flex gap-3 text-xs text-slate-400">
                        {h.peso > 0 && <span>⚖ {h.peso}kg</span>}
                        {h.temperatura > 0 && <span>🌡 {h.temperatura}°C</span>}
                      </div>
                    </div>
                    <p className="text-slate-700 text-sm font-semibold">{h.diagnostico}</p>
                    {h.tratamiento && <p className="text-slate-500 text-xs mt-1">{h.tratamiento}</p>}
                    {h.medicamentos && (
                      <div className="mt-2 bg-blue-50 rounded-lg px-3 py-1.5">
                        <p className="text-xs text-blue-700 font-medium">💊 {h.medicamentos}</p>
                      </div>
                    )}
                    {h.proximo_control && (
                      <p className="text-xs text-emerald-600 font-semibold mt-2">📅 Próximo control: {h.proximo_control}</p>
                    )}
                    {h.veterinario_nombre && <p className="text-xs text-slate-400 mt-1">Dr(a). {h.veterinario_nombre}</p>}
                  </div>
                ))}
                {historias.length > 5 && <p className="text-center text-xs text-slate-400">Mostrando los 5 más recientes de {historias.length}</p>}
              </div>
            )
          }
        </Section>

        {/* Control de peso */}
        {pesos.length > 0 && (
          <Section title={`Control de Peso (${pesos.length} registros)`} icon={<Weight size={18}/>} color="#10b981">
            <div className="flex gap-2 flex-wrap">
              {pesos.slice(0, 8).map((p, i) => (
                <div key={p.id} className={`rounded-xl px-3 py-2 text-center ${i === 0 ? 'text-white' : 'bg-slate-50'}`} style={i === 0 ? { background: brandColor } : {}}>
                  <p className="text-xs opacity-70">{p.fecha}</p>
                  <p className="font-bold text-sm">{p.peso} kg</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
            <Heart size={12} className="text-red-400"/>
            <span>Portal generado por {company?.name || 'Clínica Veterinaria'} · Powered by POSmaster</span>
          </div>
          {company?.phone && (
            <a href={`tel:${company.phone}`} className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ background: brandColor }}>
              <Phone size={14}/> Llamar a la clínica
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortalPropietario;
