/**
 * LavaderoSalaEspera.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Pantalla TV para la sala de espera del lavadero.
 * Ruta pública: /#/lavadero-espera/:companyId
 *
 * Muestra en tiempo real el estado de todos los vehículos activos.
 * Diseño grande y legible para TV — no requiere login.
 * Auto-refresco con Supabase Realtime.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

type OrdenEstado = 'ESPERANDO' | 'EN_PROCESO' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';

interface Orden {
  id: string;
  cliente_nombre: string;
  placa?: string;
  tipo_vehiculo: string;
  color_vehiculo?: string;
  marca_vehiculo?: string;
  servicio_nombre: string;
  lavador_nombre?: string;
  estado: OrdenEstado;
  created_at: string;
  iniciado_at?: string;
  terminado_at?: string;
}

interface Company {
  name: string;
  logo_url?: string;
  config?: any;
}

const TIPO_EMOJI: Record<string, string> = {
  moto: '🏍️', carro: '🚗', camioneta: '🛻', bus: '🚌',
};

const elapsed = (from: string) => {
  const diff = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
};

const getCompanyId = () => {
  const parts = window.location.hash.split('/');
  return parts[parts.length - 1] || '';
};

const ESTADO = {
  ESPERANDO:  { label: 'EN ESPERA',   bg: '#1a1000', border: '#f59e0b', text: '#fbbf24', icon: '⏳', pulse: false },
  EN_PROCESO: { label: 'LAVANDO',     bg: '#0c1a2e', border: '#3b82f6', text: '#60a5fa', icon: '🧼', pulse: true  },
  LISTO:      { label: '✅ LISTO',    bg: '#052e16', border: '#22c55e', text: '#4ade80', icon: '🔔', pulse: false },
  ENTREGADO:  { label: 'ENTREGADO',   bg: '#1e293b', border: '#475569', text: '#64748b', icon: '✓',  pulse: false },
  CANCELADO:  { label: 'CANCELADO',   bg: '#2d0000', border: '#ef4444', text: '#f87171', icon: '✕',  pulse: false },
};

const LavaderoSalaEspera: React.FC = () => {
  const companyId = getCompanyId();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [hora, setHora] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [anuncio, setAnuncio] = useState<Orden | null>(null);

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    const [{ data: ords }, { data: comp }] = await Promise.all([
      supabase.from('lavadero_ordenes').select('*')
        .eq('company_id', companyId)
        .in('estado', ['ESPERANDO', 'EN_PROCESO', 'LISTO'])
        .order('created_at', { ascending: true }),
      supabase.from('companies').select('name, logo_url, config').eq('id', companyId).single(),
    ]);
    setOrdenes(ords || []);
    if (comp) setCompany(comp as Company);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime — detectar cuando un vehículo pasa a LISTO para mostrar anuncio
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase.channel('lavadero-espera-' + companyId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'lavadero_ordenes',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        const nueva = payload.new as Orden;
        if (nueva.estado === 'LISTO') {
          setAnuncio(nueva);
          setTimeout(() => setAnuncio(null), 15000); // 15s de anuncio
        }
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, load]);

  const primaryColor = company?.config?.primary_color || '#1e40af';

  const listos    = ordenes.filter(o => o.estado === 'LISTO');
  const enProceso = ordenes.filter(o => o.estado === 'EN_PROCESO');
  const esperando = ordenes.filter(o => o.estado === 'ESPERANDO');
  const todoOrden = [...listos, ...enProceso, ...esperando];

  return (
    <div style={{
      minHeight: '100vh', background: '#060b14',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: '#f1f5f9', overflow: 'hidden', position: 'relative',
    }}>

      {/* CSS animaciones */}
      <style>{`
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
          70% { box-shadow: 0 0 0 20px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        @keyframes slide-in {
          from { transform: translateY(-100px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        @keyframes lava-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .pulse-listo { animation: pulse-ring 2s infinite; }
        .anuncio { animation: slide-in 0.5s ease; }
        .blink { animation: blink 1s ease infinite; }
        .lava { animation: lava-pulse 1.5s ease infinite; }
      `}</style>

      {/* ANUNCIO — vehículo listo */}
      {anuncio && (
        <div className="anuncio" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          background: 'linear-gradient(135deg, #052e16, #14532d)',
          border: '4px solid #22c55e',
          padding: '24px 40px',
          display: 'flex', alignItems: 'center', gap: 24,
          boxShadow: '0 0 60px rgba(34,197,94,0.5)',
        }}>
          <div style={{ fontSize: 64 }}>🔔</div>
          <div>
            <div className="blink" style={{ fontSize: 16, color: '#86efac', fontWeight: 700, letterSpacing: 2 }}>
              ¡VEHÍCULO LISTO!
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>
              {anuncio.placa
                ? <span style={{ fontFamily: 'monospace', letterSpacing: 6 }}>{anuncio.placa}</span>
                : anuncio.cliente_nombre
              }
            </div>
            <div style={{ fontSize: 20, color: '#4ade80' }}>
              {TIPO_EMOJI[anuncio.tipo_vehiculo]} {anuncio.servicio_nombre} — PUEDE PASAR A CAJA
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${primaryColor}dd, #0f172a)`,
        padding: '20px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `3px solid ${primaryColor}`,
        marginTop: anuncio ? 140 : 0, transition: 'margin-top 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {company?.logo_url ? (
            <img src={company.logo_url} alt="logo" style={{ height: 60, borderRadius: 12 }}/>
          ) : (
            <div style={{ fontSize: 48 }}>🚿</div>
          )}
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
              {company?.name || 'LAVADERO DE VEHÍCULOS'}
            </h1>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>Estado de vehículos en tiempo real</p>
          </div>
        </div>

        {/* Stats rápidos */}
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: 'LISTOS', count: listos.length, color: '#22c55e' },
            { label: 'LAVANDO', count: enProceso.length, color: '#3b82f6' },
            { label: 'EN ESPERA', count: esperando.length, color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{
              textAlign: 'center', background: '#0f172a80',
              borderRadius: 12, padding: '12px 20px',
              border: `2px solid ${s.color}40`,
            }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 700, letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Reloj */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 40, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: 3 }}>
            {hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {hora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* Grid de vehículos */}
      <div style={{ padding: '28px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 120, color: '#334155' }}>
            <div style={{ fontSize: 72 }}>🔄</div>
            <p style={{ fontSize: 24, marginTop: 16 }}>Cargando...</p>
          </div>
        ) : todoOrden.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 120, color: '#1e293b' }}>
            <div style={{ fontSize: 100 }}>😴</div>
            <p style={{ fontSize: 28, fontWeight: 700, color: '#334155', marginTop: 16 }}>
              No hay vehículos en proceso
            </p>
            <p style={{ fontSize: 18, color: '#1e293b', marginTop: 8 }}>
              Bienvenido — en cuanto ingrese su vehículo aparecerá aquí
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(todoOrden.length, 4)}, 1fr)`,
            gap: 24,
          }}>
            {todoOrden.map(orden => {
              const st = ESTADO[orden.estado];
              const tiempoEstimado = orden.estado === 'EN_PROCESO' && orden.iniciado_at
                ? `${elapsed(orden.iniciado_at)} lavando`
                : orden.estado === 'ESPERANDO'
                ? `${elapsed(orden.created_at)} esperando`
                : orden.terminado_at ? `Listo hace ${elapsed(orden.terminado_at)}` : '';

              return (
                <div key={orden.id}
                  className={orden.estado === 'LISTO' ? 'pulse-listo' : ''}
                  style={{
                    background: st.bg,
                    borderRadius: 24,
                    border: `3px solid ${st.border}`,
                    padding: 28,
                    position: 'relative',
                    transition: 'all 0.3s',
                  }}>

                  {/* Estado badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 20,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: st.border + '20', borderRadius: 999,
                      padding: '6px 16px',
                    }}>
                      <span className={orden.estado === 'EN_PROCESO' ? 'lava' : ''} style={{ fontSize: 18 }}>
                        {st.icon}
                      </span>
                      <span style={{ color: st.text, fontWeight: 900, fontSize: 14, letterSpacing: 1 }}>
                        {st.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, color: '#334155', fontFamily: 'monospace' }}>
                      #{orden.id.slice(-5).toUpperCase()}
                    </span>
                  </div>

                  {/* Vehículo */}
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 8 }}>
                      {TIPO_EMOJI[orden.tipo_vehiculo] || '🚗'}
                    </div>
                    {orden.placa ? (
                      <div style={{
                        background: '#f1f5f9', color: '#0f172a',
                        fontFamily: 'monospace', fontSize: 36, fontWeight: 900,
                        letterSpacing: 6, padding: '8px 20px', borderRadius: 10,
                        display: 'inline-block', border: '3px solid #cbd5e1',
                      }}>
                        {orden.placa}
                      </div>
                    ) : (
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>
                        {orden.marca_vehiculo || orden.tipo_vehiculo}
                        {orden.color_vehiculo ? ` · ${orden.color_vehiculo}` : ''}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ background: '#0f172a60', borderRadius: 14, padding: '14px 18px' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>
                      {orden.cliente_nombre}
                    </div>
                    <div style={{ fontSize: 15, color: st.text, fontWeight: 600 }}>
                      {orden.servicio_nombre}
                    </div>
                    {orden.lavador_nombre && (
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
                        👤 {orden.lavador_nombre}
                      </div>
                    )}
                  </div>

                  {/* Tiempo */}
                  {tiempoEstimado && (
                    <div style={{ textAlign: 'center', marginTop: 14, fontSize: 14, color: '#475569' }}>
                      ⏱️ {tiempoEstimado}
                    </div>
                  )}

                  {/* Mensaje para LISTO */}
                  {orden.estado === 'LISTO' && (
                    <div className="blink" style={{
                      textAlign: 'center', marginTop: 16,
                      background: '#14532d', borderRadius: 12,
                      padding: '12px', fontSize: 16, fontWeight: 900,
                      color: '#4ade80', letterSpacing: 1,
                    }}>
                      🔔 PASE A CAJA
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0a0f1a', borderTop: '1px solid #1e293b',
        padding: '10px 40px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: 13, color: '#1e293b',
      }}>
        <span style={{ color: '#334155' }}>🚿 {company?.name || 'Lavadero'} · Estado en tiempo real</span>
        <span style={{ color: '#1e293b', fontFamily: 'monospace' }}>
          Actualización automática · {hora.toLocaleTimeString('es-CO')}
        </span>
      </div>
    </div>
  );
};

export default LavaderoSalaEspera;
