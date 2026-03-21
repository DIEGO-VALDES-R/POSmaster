import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Clock, Users, Dumbbell } from 'lucide-react';

const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

interface GymClass {
  id: string; name: string; instructor: string;
  day_of_week: number; start_time: string;
  duration_min: number; room?: string; max_capacity: number;
  tags?: string[];
}

interface Company {
  id: string; name: string; logo_url?: string;
  config?: { primary_color?: string };
}

const CLASS_COLORS = [
  '#059669','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899',
];

const GymClassesDisplay: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany]   = useState<Company | null>(null);
  const [classes, setClasses]   = useState<GymClass[]>([]);
  const [activeDay, setActiveDay] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!companyId) return;
    supabase.from('companies').select('id, name, logo_url, config')
      .eq('id', companyId).single()
      .then(({ data }) => { if (data) setCompany(data); });

    supabase.from('gym_classes').select('*')
      .eq('company_id', companyId).eq('is_active', true)
      .order('day_of_week').order('start_time')
      .then(({ data }) => { if (data) setClasses(data); });

    // Actualizar reloj cada minuto
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [companyId]);

  const brand = company?.config?.primary_color || '#059669';
  const todayClasses = classes.filter(c => c.day_of_week === activeDay);

  // Determinar clase actual (ahora mismo)
  const currentTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  const isCurrentClass = (c: GymClass) => {
    const [sh, sm] = c.start_time.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins   = startMins + c.duration_min;
    const [nh, nm]  = currentTimeStr.split(':').map(Number);
    const nowMins   = nh * 60 + nm;
    return nowMins >= startMins && nowMins < endMins;
  };
  const isUpcoming = (c: GymClass) => {
    const [sh, sm] = c.start_time.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const [nh, nm]  = currentTimeStr.split(':').map(Number);
    const nowMins   = nh * 60 + nm;
    return startMins > nowMins && startMins - nowMins <= 30;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: '#f8fafc',
    }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${brand}, ${brand}cc)`,
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {company?.logo_url && (
            <img src={company.logo_url} alt={company.name}
              style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
          )}
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>{company?.name || 'Gimnasio'}</h1>
            <p style={{ fontSize: 14, opacity: 0.8, margin: 0 }}>Horario de clases</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -1 }}>
            {now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>
            {now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* Selector de días */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 24px', overflowX: 'auto', background: '#1e293b' }}>
        {DAYS.map((day, idx) => {
          const count = classes.filter(c => c.day_of_week === idx).length;
          const isToday = idx === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
          return (
            <button key={day} onClick={() => setActiveDay(idx)}
              style={{
                padding: '10px 20px',
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: activeDay === idx ? brand : 'rgba(255,255,255,0.08)',
                color: activeDay === idx ? '#fff' : isToday ? brand : '#94a3b8',
                fontWeight: activeDay === idx ? 800 : isToday ? 700 : 500,
                fontSize: 13,
                flexShrink: 0,
                outline: isToday && activeDay !== idx ? `2px solid ${brand}55` : 'none',
                transition: 'all 0.15s',
              }}>
              {day.slice(0, 3)}
              {count > 0 && (
                <span style={{
                  display: 'inline-block', marginLeft: 6,
                  background: activeDay === idx ? 'rgba(255,255,255,0.3)' : brand + '44',
                  color: activeDay === idx ? '#fff' : brand,
                  borderRadius: 8, fontSize: 11, fontWeight: 700,
                  padding: '0 5px',
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Clases del día */}
      <div style={{ padding: '20px 24px' }}>
        {todayClasses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
            <Dumbbell size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
            <p style={{ fontSize: 18, fontWeight: 700 }}>Sin clases este día</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {todayClasses.map((c, idx) => {
              const current  = isCurrentClass(c);
              const upcoming = isUpcoming(c);
              const color    = CLASS_COLORS[idx % CLASS_COLORS.length];

              return (
                <div key={c.id} style={{
                  background: current ? color + '22' : '#1e293b',
                  borderRadius: 20,
                  border: `2px solid ${current ? color : upcoming ? color + '66' : 'rgba(255,255,255,0.08)'}`,
                  padding: '20px 22px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: current ? `0 0 32px ${color}44` : 'none',
                  transition: 'all 0.3s',
                }}>
                  {/* Barra de color superior */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    height: 4, background: color, borderRadius: '20px 20px 0 0',
                  }} />

                  {current && (
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      background: color, color: '#fff',
                      fontSize: 10, fontWeight: 800, padding: '3px 8px',
                      borderRadius: 8, letterSpacing: '0.05em',
                    }}>
                      EN CURSO
                    </div>
                  )}
                  {upcoming && !current && (
                    <div style={{
                      position: 'absolute', top: 12, right: 12,
                      background: color + '33', color: color,
                      fontSize: 10, fontWeight: 800, padding: '3px 8px',
                      borderRadius: 8,
                    }}>
                      PRÓXIMO
                    </div>
                  )}

                  {/* Hora */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: color + '22', borderRadius: 10, padding: '4px 10px',
                    marginBottom: 12,
                  }}>
                    <Clock size={12} color={color} />
                    <span style={{ fontSize: 14, fontWeight: 800, color }}>{c.start_time}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{c.duration_min}min</span>
                  </div>

                  {/* Nombre */}
                  <p style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px', color: '#f8fafc' }}>
                    {c.name}
                  </p>

                  {/* Instructor */}
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 12px' }}>
                    👤 {c.instructor}
                    {c.room ? ` · ${c.room}` : ''}
                  </p>

                  {/* Cupos */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={13} color="#475569" />
                    <span style={{ fontSize: 12, color: '#475569' }}>Máx. {c.max_capacity} personas</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GymClassesDisplay;
