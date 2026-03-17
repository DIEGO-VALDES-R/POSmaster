/**
 * LavaderoEmpleados.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Pantalla para tablets en el área de lavado.
 * Ruta pública: /#/lavadero-display/:companyId
 *
 * El empleado ve sus órdenes asignadas, puede marcar "Iniciar" y "Listo".
 * No requiere login — acceso por URL directa desde tablet/TV del lavadero.
 * Se auto-actualiza cada 15 segundos con Supabase Realtime.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

type OrdenEstado = 'ESPERANDO' | 'EN_PROCESO' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';

interface Orden {
  id: string;
  cliente_nombre: string;
  cliente_telefono?: string;
  placa?: string;
  tipo_vehiculo: string;
  color_vehiculo?: string;
  marca_vehiculo?: string;
  servicio_nombre: string;
  servicio_precio: number;
  lavador_id?: string;
  lavador_nombre?: string;
  estado: OrdenEstado;
  notas?: string;
  created_at: string;
  iniciado_at?: string;
  terminado_at?: string;
}

interface Lavador {
  id: string;
  nombre: string;
}

const TIPO_EMOJI: Record<string, string> = {
  moto: '🏍️', carro: '🚗', camioneta: '🛻', bus: '🚌',
};

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const elapsed = (from: string) => {
  const diff = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
};

// Extrae companyId de la URL  /#/lavadero-display/:companyId
const getCompanyId = () => {
  const parts = window.location.hash.split('/');
  return parts[parts.length - 1] || '';
};

const LavaderoEmpleados: React.FC = () => {
  const companyId = getCompanyId();
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [lavadores, setLavadores] = useState<Lavador[]>([]);
  const [lavadorSeleccionado, setLavadorSeleccionado] = useState<string>('todos');
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [hora, setHora] = useState(new Date());

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Ticker de tiempos
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    const [{ data: ords }, { data: lavs }] = await Promise.all([
      supabase.from('lavadero_ordenes').select('*')
        .eq('company_id', companyId)
        .in('estado', ['ESPERANDO', 'EN_PROCESO', 'LISTO'])
        .order('created_at', { ascending: true }),
      supabase.from('lavadero_lavadores').select('*')
        .eq('company_id', companyId).eq('is_active', true),
    ]);
    setOrdenes(ords || []);
    setLavadores(lavs || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase.channel('lavadero-empleados-' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lavadero_ordenes', filter: `company_id=eq.${companyId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, load]);

  const cambiarEstado = async (orden: Orden, nuevoEstado: OrdenEstado) => {
    setSaving(orden.id);
    const update: Record<string, any> = { estado: nuevoEstado };
    if (nuevoEstado === 'EN_PROCESO') update.iniciado_at = new Date().toISOString();
    if (nuevoEstado === 'LISTO') update.terminado_at = new Date().toISOString();
    await supabase.from('lavadero_ordenes').update(update).eq('id', orden.id);
    setSaving(null);
  };

  const asignarLavador = async (ordenId: string, lavId: string, lavNombre: string) => {
    await supabase.from('lavadero_ordenes').update({
      lavador_id: lavId, lavador_nombre: lavNombre,
      estado: 'EN_PROCESO', iniciado_at: new Date().toISOString(),
    }).eq('id', ordenId);
  };

  const ordenesFiltradas = ordenes.filter(o =>
    lavadorSeleccionado === 'todos' || o.lavador_id === lavadorSeleccionado || !o.lavador_id
  );

  const ESTADO_STYLE = {
    ESPERANDO:  { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', label: 'EN ESPERA',  dot: '#f59e0b' },
    EN_PROCESO: { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a5f', label: 'LAVANDO',    dot: '#3b82f6' },
    LISTO:      { bg: '#dcfce7', border: '#22c55e', text: '#14532d', label: '✅ LISTO',   dot: '#22c55e' },
    ENTREGADO:  { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', label: 'ENTREGADO',  dot: '#94a3b8' },
    CANCELADO:  { bg: '#fee2e2', border: '#ef4444', text: '#7f1d1d', label: 'CANCELADO',  dot: '#ef4444' },
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: '#f1f5f9',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
        borderBottom: '2px solid #1e40af',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 36 }}>🚿</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: 1 }}>
              LAVADERO — PANEL EMPLEADOS
            </h1>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
              {ordenesFiltradas.filter(o => o.estado === 'EN_PROCESO').length} en proceso ·{' '}
              {ordenesFiltradas.filter(o => o.estado === 'ESPERANDO').length} esperando ·{' '}
              {ordenesFiltradas.filter(o => o.estado === 'LISTO').length} listos
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>
            {hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {hora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* Filtro por lavador */}
      <div style={{ padding: '12px 24px', background: '#1e293b', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: '1px solid #334155' }}>
        <button onClick={() => setLavadorSeleccionado('todos')}
          style={{
            padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            background: lavadorSeleccionado === 'todos' ? '#3b82f6' : '#334155',
            color: lavadorSeleccionado === 'todos' ? '#fff' : '#94a3b8',
            whiteSpace: 'nowrap',
          }}>
          👥 Todos
        </button>
        {lavadores.map(lav => {
          const ocupado = ordenes.filter(o => o.lavador_id === lav.id && o.estado === 'EN_PROCESO').length;
          return (
            <button key={lav.id} onClick={() => setLavadorSeleccionado(lav.id)}
              style={{
                padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                background: lavadorSeleccionado === lav.id ? '#3b82f6' : '#334155',
                color: lavadorSeleccionado === lav.id ? '#fff' : '#94a3b8',
                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: ocupado > 0 ? '#f59e0b' : '#22c55e', display: 'inline-block',
              }}/>
              {lav.nombre}
              {ocupado > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>({ocupado})</span>}
            </button>
          );
        })}
      </div>

      {/* Órdenes */}
      <div style={{ padding: 24 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#475569' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <p style={{ fontSize: 18 }}>Cargando órdenes...</p>
          </div>
        ) : ordenesFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#475569' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>😴</div>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#64748b' }}>Sin órdenes activas</p>
            <p style={{ fontSize: 15, color: '#475569', marginTop: 8 }}>Las nuevas órdenes aparecerán aquí automáticamente</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
            {ordenesFiltradas.map(orden => {
              const st = ESTADO_STYLE[orden.estado] || ESTADO_STYLE.ESPERANDO;
              const tiempoLabel = orden.estado === 'EN_PROCESO' && orden.iniciado_at
                ? `Lavando: ${elapsed(orden.iniciado_at)}`
                : orden.estado === 'ESPERANDO'
                ? `Esperando: ${elapsed(orden.created_at)}`
                : orden.terminado_at ? `Listo hace: ${elapsed(orden.terminado_at)}` : '';

              return (
                <div key={orden.id} style={{
                  background: '#1e293b',
                  borderRadius: 20,
                  border: `2px solid ${st.border}`,
                  overflow: 'hidden',
                  boxShadow: orden.estado === 'EN_PROCESO' ? `0 0 20px ${st.border}40` : 'none',
                }}>
                  {/* Badge estado */}
                  <div style={{
                    background: st.bg, color: st.text,
                    padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: st.dot, display: 'inline-block' }}/>
                      <span style={{ fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>{st.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>#{orden.id.slice(-6).toUpperCase()}</span>
                  </div>

                  {/* Contenido */}
                  <div style={{ padding: 20 }}>
                    {/* Vehículo y placa */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 40 }}>{TIPO_EMOJI[orden.tipo_vehiculo] || '🚗'}</span>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                            {orden.marca_vehiculo || orden.tipo_vehiculo.charAt(0).toUpperCase() + orden.tipo_vehiculo.slice(1)}
                            {orden.color_vehiculo ? ` · ${orden.color_vehiculo}` : ''}
                          </div>
                          {orden.placa && (
                            <div style={{
                              background: '#0f172a', color: '#f1f5f9',
                              fontFamily: 'monospace', fontSize: 22, fontWeight: 900,
                              padding: '4px 12px', borderRadius: 8, letterSpacing: 3, marginTop: 4,
                              border: '2px solid #334155',
                            }}>
                              {orden.placa}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Cliente y servicio */}
                    <div style={{ background: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>
                        {orden.cliente_nombre}
                      </div>
                      <div style={{ fontSize: 14, color: '#60a5fa', fontWeight: 700 }}>
                        {orden.servicio_nombre}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#4ade80', marginTop: 6 }}>
                        {fmt(orden.servicio_precio)}
                      </div>
                    </div>

                    {/* Lavador asignado */}
                    {orden.lavador_nombre ? (
                      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
                        👤 Asignado a: <strong style={{ color: '#e2e8f0' }}>{orden.lavador_nombre}</strong>
                      </div>
                    ) : (
                      lavadores.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <p style={{ fontSize: 12, color: '#f59e0b', marginBottom: 6 }}>⚠️ Sin lavador asignado</p>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {lavadores.filter(l => !ordenes.find(o => o.lavador_id === l.id && o.estado === 'EN_PROCESO')).map(lav => (
                              <button key={lav.id} onClick={() => asignarLavador(orden.id, lav.id, lav.nombre)}
                                style={{
                                  padding: '6px 14px', borderRadius: 99, border: '1px solid #334155',
                                  background: '#1e293b', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 600,
                                }}>
                                {lav.nombre}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    )}

                    {/* Tiempo */}
                    {tiempoLabel && (
                      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                        ⏱️ {tiempoLabel}
                      </div>
                    )}

                    {orden.notas && (
                      <div style={{ background: '#fef3c730', border: '1px solid #f59e0b40', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#fde68a', marginBottom: 12 }}>
                        📝 {orden.notas}
                      </div>
                    )}

                    {/* Acciones */}
                    <div style={{ display: 'flex', gap: 10 }}>
                      {orden.estado === 'ESPERANDO' && (
                        <button
                          onClick={() => cambiarEstado(orden, 'EN_PROCESO')}
                          disabled={saving === orden.id}
                          style={{
                            flex: 1, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                            background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                            color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: 0.5,
                          }}>
                          {saving === orden.id ? '...' : '🧼 INICIAR LAVADO'}
                        </button>
                      )}
                      {orden.estado === 'EN_PROCESO' && (
                        <button
                          onClick={() => cambiarEstado(orden, 'LISTO')}
                          disabled={saving === orden.id}
                          style={{
                            flex: 1, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                            background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                            color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: 0.5,
                          }}>
                          {saving === orden.id ? '...' : '✅ LISTO — ENTREGAR'}
                        </button>
                      )}
                      {orden.estado === 'LISTO' && (
                        <div style={{
                          flex: 1, padding: '14px', borderRadius: 12, textAlign: 'center',
                          background: '#14532d30', border: '2px solid #22c55e',
                          color: '#4ade80', fontSize: 15, fontWeight: 800,
                        }}>
                          ✅ ESPERANDO COBRO EN CAJA
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer con instrucciones */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0f172a', borderTop: '1px solid #1e293b',
        padding: '10px 24px', display: 'flex', gap: 24, alignItems: 'center',
        fontSize: 12, color: '#475569',
      }}>
        <span>🔄 Actualización automática cada 15s</span>
        <span>🧼 Toca "INICIAR LAVADO" cuando comiences</span>
        <span>✅ Toca "LISTO" cuando termines</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', color: '#334155' }}>
          {companyId.slice(-8).toUpperCase()}
        </span>
      </div>
    </div>
  );
};

export default LavaderoEmpleados;
