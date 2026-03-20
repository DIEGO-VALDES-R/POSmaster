import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import {
  Dumbbell, Apple, Calendar, User, CheckCircle,
  ChevronDown, ChevronUp, Clock, Target, Zap,
  Package, Star,
} from 'lucide-react';

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string; full_name: string; document?: string;
  phone?: string; email?: string;
  membership_type_name: string; membership_price: number;
  start_date: string; end_date: string; status: string;
  instructor_id?: string;
}

interface Instructor {
  id: string; full_name: string; photo_url?: string;
  specialties?: string[];
}

interface Exercise {
  name: string; sets: number; reps: string;
  rest_sec?: number; notes?: string; day?: number;
  muscle_group?: string;
}

interface Routine {
  id: string; name: string; goal?: string;
  days_per_week: number; duration_weeks: number;
  exercises: Exercise[]; notes?: string;
  created_at: string;
}

interface MealItem { name: string; qty: string; calories?: number; }
interface Meal { time: string; name: string; foods: MealItem[]; }
interface Supplement { name: string; dose: string; timing: string; notes?: string; }

interface MealPlan {
  id: string; name: string;
  calories_goal?: number; protein_g?: number; carbs_g?: number; fat_g?: number;
  meals: Meal[]; supplements: Supplement[]; notes?: string;
  created_at: string;
}

interface GymClass {
  id: string; name: string; instructor: string;
  day_of_week: number; start_time: string;
  duration_min: number; room?: string; max_capacity: number;
}

interface Company {
  id: string; name: string; logo_url?: string;
  phone?: string; email?: string;
  config?: { primary_color?: string };
}

interface Supplement_Product {
  id: string; name: string; price: number;
  description?: string; image_url?: string; stock_quantity: number;
}

const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

function daysLeft(endDate: string) {
  return Math.ceil((new Date(endDate + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────

const GymClientPortal: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [member, setMember]       = useState<Member | null>(null);
  const [company, setCompany]     = useState<Company | null>(null);
  const [instructor, setInstructor] = useState<Instructor | null>(null);
  const [routines, setRoutines]   = useState<Routine[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [classes, setClasses]     = useState<GymClass[]>([]);
  const [supplements, setSupplements] = useState<Supplement_Product[]>([]);
  const [tab, setTab]             = useState<'routine' | 'nutrition' | 'classes' | 'supplements'>('routine');
  const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);
  const [expandedMeal, setExpandedMeal]       = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('Link inválido'); setLoading(false); return; }
    loadData();
  }, [token]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Buscar socio por token
      const { data: memberData, error: memberErr } = await supabase
        .from('gym_members')
        .select('*')
        .eq('portal_token', token)
        .single();

      if (memberErr || !memberData) { setError('No encontramos tu perfil. Verifica el link.'); setLoading(false); return; }
      setMember(memberData);

      // 2. Empresa
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, name, logo_url, phone, email, config')
        .eq('id', memberData.company_id)
        .single();
      setCompany(companyData);

      // 3. Instructor asignado
      if (memberData.instructor_id) {
        const { data: instData } = await supabase
          .from('gym_instructors')
          .select('id, full_name, photo_url, specialties')
          .eq('id', memberData.instructor_id)
          .single();
        setInstructor(instData);
      }

      // 4. Rutinas activas
      const { data: routineData } = await supabase
        .from('gym_routines')
        .select('*')
        .eq('member_id', memberData.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      setRoutines(routineData || []);
      if (routineData && routineData.length > 0) setExpandedRoutine(routineData[0].id);

      // 5. Plan de alimentación activo
      const { data: mealData } = await supabase
        .from('gym_meal_plans')
        .select('*')
        .eq('member_id', memberData.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      setMealPlans(mealData || []);

      // 6. Clases del gimnasio
      const { data: classData } = await supabase
        .from('gym_classes')
        .select('*')
        .eq('company_id', memberData.company_id)
        .eq('is_active', true)
        .order('day_of_week').order('start_time');
      setClasses(classData || []);

      // 7. Suplementos propios del gimnasio
      const { data: suppData } = await supabase
        .from('gym_supplements')
        .select('id, name, price, description, image_url, stock_quantity, brand, category')
        .eq('company_id', memberData.company_id)
        .eq('is_active', true)
        .gt('stock_quantity', 0)
        .order('name');
      setSupplements(suppData || []);

    } catch (e: any) {
      setError('Error cargando tu información. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  };

  const brand = company?.config?.primary_color || '#059669';

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderWidth: 3 }} />
        <p className="text-slate-400 text-sm">Cargando tu perfil...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
          <Dumbbell size={28} className="text-red-400" />
        </div>
        <p className="text-white font-bold text-lg">{error}</p>
        <p className="text-slate-400 text-sm">Contacta a tu gimnasio para obtener un nuevo link.</p>
      </div>
    </div>
  );

  if (!member || !company) return null;

  const days = daysLeft(member.end_date);
  const isActive = member.status === 'ACTIVE' && days > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ background: brand }} className="px-5 py-6 text-center">
        {company.logo_url && (
          <img src={company.logo_url} alt={company.name}
            className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 border-2 border-white/30" />
        )}
        <h1 className="font-black text-xl text-white">{company.name}</h1>
        <p className="text-white/70 text-sm mt-0.5">Portal del Socio</p>
      </div>

      {/* Perfil del socio */}
      <div className="px-5 py-4 bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl"
            style={{ background: brand + '33', color: brand }}>
            {member.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-black text-white text-lg leading-tight">{member.full_name}</p>
            <p className="text-slate-400 text-sm">{member.membership_type_name}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-xs font-black ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
            {isActive ? `${days}d restantes` : 'Vencida'}
          </div>
        </div>

        {/* Fechas membresía */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-slate-800 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Inicio</p>
            <p className="text-white text-xs font-semibold mt-0.5">{fmtDate(member.start_date)}</p>
          </div>
          <div className="bg-slate-800 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-500 uppercase font-bold">Vence</p>
            <p className={`text-xs font-semibold mt-0.5 ${days <= 7 ? 'text-red-400' : 'text-white'}`}>{fmtDate(member.end_date)}</p>
          </div>
        </div>

        {/* Instructor asignado */}
        {instructor && (
          <div className="mt-3 flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0"
              style={{ background: brand + '33' }}>
              {instructor.photo_url
                ? <img src={instructor.photo_url} alt={instructor.full_name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center font-black" style={{ color: brand }}>{instructor.full_name.charAt(0)}</div>
              }
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold">Tu instructor</p>
              <p className="text-white font-bold text-sm">{instructor.full_name}</p>
              {instructor.specialties && instructor.specialties.length > 0 && (
                <p className="text-slate-400 text-xs">{instructor.specialties.join(' · ')}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="flex overflow-x-auto px-4 py-2 gap-1 no-scrollbar">
          {([
            ['routine',     '🏋️', 'Rutina'],
            ['nutrition',   '🥗', 'Nutrición'],
            ['classes',     '📅', 'Clases'],
            ['supplements', '💊', 'Suplementos'],
          ] as const).map(([id, emoji, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                tab === id
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={tab === id ? { background: brand } : { background: 'transparent' }}>
              {emoji} {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-5 space-y-4 pb-20">

        {/* ── RUTINA ── */}
        {tab === 'routine' && (
          <div className="space-y-4">
            {routines.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Dumbbell size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold">Sin rutina asignada</p>
                <p className="text-sm mt-1">Tu instructor aún no ha creado tu rutina</p>
              </div>
            ) : (
              routines.map(routine => {
                const isExp = expandedRoutine === routine.id;
                // Agrupar ejercicios por día
                const byDay: Record<number, Exercise[]> = {};
                (routine.exercises || []).forEach(ex => {
                  const day = ex.day ?? 1;
                  if (!byDay[day]) byDay[day] = [];
                  byDay[day].push(ex);
                });

                return (
                  <div key={routine.id} className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800">
                    <button
                      onClick={() => setExpandedRoutine(isExp ? null : routine.id)}
                      className="w-full flex items-center justify-between px-5 py-4">
                      <div className="text-left">
                        <p className="font-black text-white text-base">{routine.name}</p>
                        {routine.goal && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <Target size={12} className="text-emerald-400" />
                            <p className="text-sm text-emerald-400 font-semibold">{routine.goal}</p>
                          </div>
                        )}
                        <p className="text-slate-400 text-xs mt-0.5">
                          {routine.days_per_week} días/semana · {routine.duration_weeks} semanas
                        </p>
                      </div>
                      {isExp ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                    </button>

                    {isExp && (
                      <div className="px-5 pb-5 space-y-4 border-t border-slate-800 pt-4">
                        {Object.entries(byDay).sort(([a],[b]) => Number(a)-Number(b)).map(([day, exercises]) => (
                          <div key={day}>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                              Día {day}
                            </p>
                            <div className="space-y-2">
                              {exercises.map((ex, idx) => (
                                <div key={idx} className="bg-slate-800 rounded-xl px-4 py-3">
                                  <div className="flex items-start justify-between">
                                    <p className="font-bold text-white">{ex.name}</p>
                                    <div className="flex gap-2 text-xs">
                                      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-lg font-bold">
                                        {ex.sets} × {ex.reps}
                                      </span>
                                      {ex.rest_sec && (
                                        <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                                          <Clock size={10} /> {ex.rest_sec}s
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {ex.muscle_group && (
                                    <p className="text-xs text-slate-500 mt-0.5">{ex.muscle_group}</p>
                                  )}
                                  {ex.notes && (
                                    <p className="text-xs text-amber-400 mt-1 italic">💡 {ex.notes}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {routine.notes && (
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                            <p className="text-xs font-bold text-amber-400 uppercase mb-1">Notas del instructor</p>
                            <p className="text-sm text-amber-200">{routine.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── NUTRICIÓN ── */}
        {tab === 'nutrition' && (
          <div className="space-y-4">
            {mealPlans.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Apple size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold">Sin plan de alimentación</p>
                <p className="text-sm mt-1">Tu instructor aún no ha creado tu plan</p>
              </div>
            ) : (
              mealPlans.map(plan => {
                const isExp = expandedMeal === plan.id;
                return (
                  <div key={plan.id} className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800">
                    <button onClick={() => setExpandedMeal(isExp ? null : plan.id)}
                      className="w-full flex items-center justify-between px-5 py-4">
                      <div className="text-left">
                        <p className="font-black text-white text-base">{plan.name}</p>
                        {plan.calories_goal && (
                          <p className="text-emerald-400 text-sm font-semibold mt-0.5">{plan.calories_goal} kcal/día</p>
                        )}
                        {(plan.protein_g || plan.carbs_g || plan.fat_g) && (
                          <div className="flex gap-3 mt-1">
                            {plan.protein_g && <span className="text-xs text-blue-400">P: {plan.protein_g}g</span>}
                            {plan.carbs_g && <span className="text-xs text-yellow-400">C: {plan.carbs_g}g</span>}
                            {plan.fat_g && <span className="text-xs text-red-400">G: {plan.fat_g}g</span>}
                          </div>
                        )}
                      </div>
                      {isExp ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                    </button>

                    {isExp && (
                      <div className="px-5 pb-5 border-t border-slate-800 pt-4 space-y-4">
                        {/* Comidas */}
                        {(plan.meals || []).map((meal, idx) => (
                          <div key={idx} className="bg-slate-800 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-700">
                              <Clock size={13} className="text-slate-400" />
                              <span className="text-slate-300 text-xs font-bold">{meal.time}</span>
                              <span className="font-black text-white text-sm ml-1">{meal.name}</span>
                            </div>
                            <div className="px-4 py-2 space-y-1">
                              {(meal.foods || []).map((food, fidx) => (
                                <div key={fidx} className="flex justify-between text-sm py-0.5">
                                  <span className="text-slate-300">{food.name}</span>
                                  <div className="flex gap-3">
                                    <span className="text-slate-400 text-xs">{food.qty}</span>
                                    {food.calories && <span className="text-emerald-400 text-xs">{food.calories}kcal</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* Suplementos del plan */}
                        {(plan.supplements || []).length > 0 && (
                          <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Suplementos recomendados</p>
                            <div className="space-y-2">
                              {plan.supplements.map((supp, idx) => (
                                <div key={idx} className="bg-slate-800 rounded-xl px-4 py-3">
                                  <div className="flex justify-between">
                                    <p className="font-bold text-white">{supp.name}</p>
                                    <span className="text-xs text-slate-400">{supp.dose}</span>
                                  </div>
                                  <p className="text-xs text-emerald-400 mt-0.5">{supp.timing}</p>
                                  {supp.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{supp.notes}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {plan.notes && (
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                            <p className="text-xs font-bold text-amber-400 uppercase mb-1">Notas</p>
                            <p className="text-sm text-amber-200">{plan.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── CLASES ── */}
        {tab === 'classes' && (
          <div className="space-y-3">
            {classes.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold">Sin clases programadas</p>
              </div>
            ) : (
              DAYS.map((day, idx) => {
                const dayClasses = classes.filter(c => c.day_of_week === idx);
                if (dayClasses.length === 0) return null;
                return (
                  <div key={day} className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800">
                    <div className="px-5 py-2.5 bg-slate-800">
                      <p className="font-black text-white text-sm">{day}</p>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {dayClasses.map(c => (
                        <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                          <div className="text-center w-14 flex-shrink-0"
                            style={{ background: brand + '22', borderRadius: 12, padding: '6px 4px' }}>
                            <p className="font-black text-sm" style={{ color: brand }}>{c.start_time}</p>
                            <p className="text-[10px] text-slate-500">{c.duration_min}min</p>
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-white">{c.name}</p>
                            <p className="text-xs text-slate-400">
                              {c.instructor}{c.room ? ` · ${c.room}` : ''}
                            </p>
                          </div>
                          <span className="text-xs text-slate-500">{c.max_capacity} cupos</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── SUPLEMENTOS ── */}
        {tab === 'supplements' && (
          <div className="space-y-3">
            {supplements.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Package size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-semibold">Sin suplementos disponibles</p>
                <p className="text-sm mt-1">Consulta en recepción los productos disponibles</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {supplements.map(s => (
                  <div key={s.id} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                    {s.image_url ? (
                      <img src={s.image_url} alt={s.name} className="w-full h-28 object-cover" />
                    ) : (
                      <div className="w-full h-28 flex items-center justify-center" style={{ background: brand + '22' }}>
                        <Package size={32} style={{ color: brand }} />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="font-bold text-white text-sm leading-tight">{s.name}</p>
                      {s.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{s.description}</p>}
                      <p className="font-black mt-2" style={{ color: brand }}>
                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(s.price)}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Stock: {s.stock_quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur border-t border-slate-800 px-5 py-3 text-center">
        <p className="text-slate-500 text-xs">{company.name} · POSmaster</p>
        {company.phone && (
          <a href={`https://wa.me/57${company.phone.replace(/\D/g,'')}`}
            className="text-xs font-semibold mt-0.5 block" style={{ color: brand }}>
            📱 Contactar al gimnasio
          </a>
        )}
      </div>
    </div>
  );
};

export default GymClientPortal;