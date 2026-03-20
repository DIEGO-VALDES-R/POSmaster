import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type Screen   = 'idle' | 'loading' | 'result';
type Mode     = 'AUTO' | 'IN' | 'OUT';   // AUTO = detecta automáticamente
type ResultType = 'IN' | 'OUT' | 'EXPIRED' | 'FROZEN' | 'NOT_FOUND' | 'ALREADY_IN' | 'ALREADY_OUT';

interface Member {
  id: string; full_name: string; document: string;
  membership_type_name: string; membership_price: number;
  end_date: string; status: 'ACTIVE' | 'EXPIRED' | 'FROZEN' | 'CANCELLED';
}

interface LastCheckin {
  id: string; type: 'IN' | 'OUT'; checked_in_at: string;
}

interface Company {
  id: string; name: string; logo_url?: string;
  config?: {
    primary_color?: string;
    turnstile_webhook_url?: string;
    kiosk_auto_return_seconds?: number;
  };
}

interface ResultData {
  type: ResultType; member?: Member; durationMinutes?: number;
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function daysLeft(endDate: string) {
  return Math.ceil((new Date(endDate + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

function fmtTime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ══════════════════════════════════════════════════════════════
// RESULT CONFIG
// ══════════════════════════════════════════════════════════════

const RESULT_CFG: Record<ResultType, {
  bg: string; iconBg: string; icon: string;
  badge: string; badgeBg: string; badgeFg: string;
  msg: (m: Member, dur?: number) => string;
  sub: (m: Member, dur?: number) => string;
}> = {
  IN: {
    bg: '#064e3b', iconBg: '#065f46', icon: '✓',
    badge: 'ENTRADA REGISTRADA', badgeBg: '#064e3b', badgeFg: '#6ee7b7',
    msg: (m) => `Bienvenido/a. Tienes ${daysLeft(m.end_date)} días de membresía.`,
    sub: (m) => m.membership_type_name,
  },
  OUT: {
    bg: '#1e3a5f', iconBg: '#1e40af', icon: '👋',
    badge: 'SALIDA REGISTRADA', badgeBg: '#1e3a5f', badgeFg: '#93c5fd',
    msg: (m, dur) => dur ? `Tiempo en el gimnasio: ${fmtTime(dur)}. ¡Buen entrenamiento!` : '¡Hasta la próxima!',
    sub: (m) => m.membership_type_name,
  },
  EXPIRED: {
    bg: '#7f1d1d', iconBg: '#991b1b', icon: '✕',
    badge: 'MEMBRESÍA VENCIDA', badgeBg: '#7f1d1d', badgeFg: '#fca5a5',
    msg: (m) => `Tu membresía venció el ${new Date(m.end_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long' })}. Habla con recepción para renovar.`,
    sub: (m) => m.membership_type_name,
  },
  FROZEN: {
    bg: '#1e3a5f', iconBg: '#1d4ed8', icon: '❄️',
    badge: 'MEMBRESÍA CONGELADA', badgeBg: '#1e3a5f', badgeFg: '#93c5fd',
    msg: () => 'Tu membresía está congelada. Habla con recepción para activarla.',
    sub: (m) => m.membership_type_name,
  },
  NOT_FOUND: {
    bg: '#3b1f00', iconBg: '#92400e', icon: '?',
    badge: 'NO ENCONTRADO', badgeBg: '#3b1f00', badgeFg: '#fcd34d',
    msg: () => 'No encontramos un socio con esa cédula. Verifica el número o habla con recepción.',
    sub: () => '',
  },
  ALREADY_IN: {
    bg: '#3b2f00', iconBg: '#92600e', icon: '⚠️',
    badge: 'YA REGISTRASTE ENTRADA', badgeBg: '#3b2f00', badgeFg: '#fcd34d',
    msg: () => 'Ya registraste tu entrada hoy. Si ya saliste, usa el botón de SALIDA.',
    sub: (m) => m.membership_type_name,
  },
  ALREADY_OUT: {
    bg: '#3b2f00', iconBg: '#92600e', icon: '⚠️',
    badge: 'YA REGISTRASTE SALIDA', badgeBg: '#3b2f00', badgeFg: '#fcd34d',
    msg: () => 'Ya registraste tu salida. Si vas a ingresar de nuevo, usa el botón de ENTRADA.',
    sub: (m) => m.membership_type_name,
  },
};

// ══════════════════════════════════════════════════════════════
// MAIN KIOSK COMPONENT
// ══════════════════════════════════════════════════════════════

const GymKiosk: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();

  const [company,    setCompany]    = useState<Company | null>(null);
  const [screen,     setScreen]     = useState<Screen>('idle');
  const [cedula,     setCedula]     = useState('');
  const [result,     setResult]     = useState<ResultData | null>(null);
  const [autoReturn, setAutoReturn] = useState(0);
  const [mode,       setMode]       = useState<Mode>('AUTO');

  const inputRef    = useRef<HTMLInputElement>(null);
  const returnTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoReturnSecs = company?.config?.kiosk_auto_return_seconds ?? 5;
  const brand = company?.config?.primary_color || '#065f46';

  // ── Load company ─────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    supabase.from('companies').select('id, name, logo_url, config')
      .eq('id', companyId).single()
      .then(({ data }) => { if (data) setCompany(data); });
  }, [companyId]);

  // ── Always keep input focused ────────────────────────────────
  useEffect(() => {
    if (screen === 'idle') {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [screen, cedula]);

  // ── Auto-return to idle after result ────────────────────────
  useEffect(() => {
    if (screen !== 'result') return;
    setAutoReturn(autoReturnSecs);
    returnTimer.current = setInterval(() => {
      setAutoReturn(prev => {
        if (prev <= 1) { resetToIdle(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (returnTimer.current) clearInterval(returnTimer.current); };
  }, [screen]);

  const resetToIdle = useCallback(() => {
    if (returnTimer.current) clearInterval(returnTimer.current);
    setCedula(''); setResult(null); setScreen('idle');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── Turnstile webhook ────────────────────────────────────────
  const openTurnstile = useCallback(async () => {
    const url = company?.config?.turnstile_webhook_url;
    if (!url) return;
    try { await fetch(url, { method: 'GET', mode: 'no-cors' }); } catch {}
  }, [company]);

  // ── Process check-in / check-out ─────────────────────────────
  const processCheckin = useCallback(async (doc: string, forcedMode: Mode = mode) => {
    if (!companyId || doc.length < 5) return;
    setScreen('loading');

    try {
      // 1. Buscar socio por cédula
      const { data: members } = await supabase
        .from('gym_members').select('*')
        .eq('company_id', companyId).eq('document', doc.trim()).limit(1);

      if (!members || members.length === 0) {
        setResult({ type: 'NOT_FOUND' }); setScreen('result'); return;
      }

      const member: Member = members[0];
      const today = new Date().toISOString().split('T')[0];
      const isExpired = member.status === 'ACTIVE' && member.end_date < today;
      const effectiveStatus = isExpired ? 'EXPIRED' : member.status;

      if (effectiveStatus === 'EXPIRED') {
        await supabase.from('gym_members').update({ status: 'EXPIRED' }).eq('id', member.id);
        setResult({ type: 'EXPIRED', member }); setScreen('result'); return;
      }
      if (effectiveStatus === 'FROZEN' || effectiveStatus === 'CANCELLED') {
        setResult({ type: 'FROZEN', member }); setScreen('result'); return;
      }

      // 2. Buscar último checkin del día
      const { data: lastCheckins } = await supabase
        .from('gym_checkins').select('id, type, checked_in_at')
        .eq('company_id', companyId).eq('member_id', member.id)
        .gte('checked_in_at', today + 'T00:00:00')
        .order('checked_in_at', { ascending: false }).limit(1);

      const lastCheckin: LastCheckin | null = lastCheckins?.[0] || null;

      // 3. Determinar tipo según el modo seleccionado
      let checkType: 'IN' | 'OUT';

      if (forcedMode === 'AUTO') {
        // Lógica automática: alterna IN/OUT
        checkType = (!lastCheckin || lastCheckin.type === 'OUT') ? 'IN' : 'OUT';
      } else if (forcedMode === 'IN') {
        // Modo entrada forzado — avisar si ya entró sin salir
        if (lastCheckin && lastCheckin.type === 'IN') {
          setResult({ type: 'ALREADY_IN', member }); setScreen('result'); return;
        }
        checkType = 'IN';
      } else {
        // Modo salida forzado — avisar si ya salió
        if (!lastCheckin || lastCheckin.type === 'OUT') {
          setResult({ type: 'ALREADY_OUT', member }); setScreen('result'); return;
        }
        checkType = 'OUT';
      }

      // 4. Calcular duración si es salida
      let durationMinutes: number | undefined;
      if (checkType === 'OUT' && lastCheckin) {
        durationMinutes = Math.round((Date.now() - new Date(lastCheckin.checked_in_at).getTime()) / 60000);
      }

      // 5. Insertar checkin
      await supabase.from('gym_checkins').insert({
        company_id: companyId, member_id: member.id,
        member_name: member.full_name, status: member.status,
        type: checkType,
        duration_minutes: checkType === 'OUT' ? durationMinutes : null,
      });

      if (checkType === 'IN') openTurnstile();

      setResult({ type: checkType, member, durationMinutes });
      setScreen('result');

    } catch (err) {
      console.error('Kiosk error:', err);
      setResult({ type: 'NOT_FOUND' }); setScreen('result');
    }
  }, [companyId, openTurnstile, mode]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
    setCedula(val);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && cedula.length >= 5) processCheckin(cedula);
  }, [cedula, processCheckin]);

  const addDigit = (d: string) => {
    if (cedula.length < 11) setCedula(c => c + d);
  };
  const delDigit = () => setCedula(c => c.slice(0, -1));

  // ── Button style helpers ──────────────────────────────────────
  const modeBtn = (m: Mode, label: string, activeColor: string, activeText: string, emoji: string) => ({
    flex: 1,
    padding: '14px 8px',
    borderRadius: 14,
    border: `2px solid ${mode === m ? activeColor : '#374151'}`,
    background: mode === m ? activeColor + '22' : '#111827',
    color: mode === m ? activeColor : '#6b7280',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
    // Retroiluminación con box-shadow
    boxShadow: mode === m ? `0 0 16px ${activeColor}55, inset 0 0 8px ${activeColor}22` : 'none',
  });

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: '100vh',
      background: '#111827',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      userSelect: 'none',
    }}>
      {/* Hidden input — captura huellero */}
      <input
        ref={inputRef}
        value={cedula}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
        inputMode="numeric"
        autoComplete="off"
        tabIndex={-1}
      />

      <div style={{
        width: '100%', maxWidth: 420,
        background: '#1f2937',
        borderRadius: 28,
        padding: '32px 24px',
        border: '1px solid #374151',
      }}>

        {/* ── IDLE / LOADING ────────────────────────────────── */}
        {(screen === 'idle' || screen === 'loading') && (
          <>
            {/* Logo / nombre */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              {company?.logo_url ? (
                <img src={company.logo_url} alt="Logo"
                  style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 12px', display: 'block', border: '2px solid #374151' }} />
              ) : (
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: brand, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 12px', fontSize: 28,
                }}>💪</div>
              )}
              <p style={{ fontSize: 20, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>
                {company?.name || 'Gimnasio'}
              </p>
              <p style={{ fontSize: 13, color: '#6b7280' }}>Registro de ingreso y salida</p>
            </div>

            {/* ── BOTONES DE MODO ───────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {/* ENTRADA */}
              <button
                onClick={() => setMode(m => m === 'IN' ? 'AUTO' : 'IN')}
                style={modeBtn('IN', 'Entrada', '#10b981', '#fff', '🟢')}>
                <span style={{ fontSize: 22 }}>🟢</span>
                <span>ENTRADA</span>
                {mode === 'IN' && (
                  <span style={{ fontSize: 10, opacity: 0.8 }}>ACTIVO</span>
                )}
              </button>

              {/* AUTO */}
              <button
                onClick={() => setMode('AUTO')}
                style={modeBtn('AUTO', 'Auto', '#8b5cf6', '#fff', '⚡')}>
                <span style={{ fontSize: 22 }}>⚡</span>
                <span>AUTO</span>
                {mode === 'AUTO' && (
                  <span style={{ fontSize: 10, opacity: 0.8 }}>ACTIVO</span>
                )}
              </button>

              {/* SALIDA */}
              <button
                onClick={() => setMode(m => m === 'OUT' ? 'AUTO' : 'OUT')}
                style={modeBtn('OUT', 'Salida', '#3b82f6', '#fff', '🔵')}>
                <span style={{ fontSize: 22 }}>🔵</span>
                <span>SALIDA</span>
                {mode === 'OUT' && (
                  <span style={{ fontSize: 10, opacity: 0.8 }}>ACTIVO</span>
                )}
              </button>
            </div>

            {/* Indicador de modo activo */}
            <div style={{
              textAlign: 'center',
              marginBottom: 16,
              fontSize: 11,
              color: mode === 'IN' ? '#10b981' : mode === 'OUT' ? '#3b82f6' : '#8b5cf6',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
            }}>
              {mode === 'AUTO'
                ? '⚡ Modo automático — detecta entrada o salida'
                : mode === 'IN'
                ? '🟢 Modo entrada — registra INGRESO al gimnasio'
                : '🔵 Modo salida — registra SALIDA del gimnasio'}
            </div>

            {/* Display cédula */}
            <div
              onClick={() => inputRef.current?.focus()}
              style={{
                background: '#111827',
                border: `2px solid ${cedula
                  ? mode === 'IN' ? '#10b981'
                    : mode === 'OUT' ? '#3b82f6'
                    : brand
                  : '#374151'}`,
                borderRadius: 16,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
                cursor: 'text',
                transition: 'border-color 0.2s',
              }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                  Número de cédula
                </p>
                <p style={{
                  fontSize: cedula ? 28 : 15,
                  fontWeight: 700,
                  color: cedula ? '#f9fafb' : '#374151',
                  letterSpacing: cedula ? 4 : 0,
                  minHeight: 36,
                  lineHeight: '36px',
                  transition: 'all 0.15s',
                }}>
                  {cedula
                    ? cedula.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
                    : 'Escribe o usa el huellero'}
                </p>
              </div>
              <svg width="32" height="32" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
                <circle cx="18" cy="18" r="17" stroke={brand} strokeWidth="2"/>
                <path d="M18 10a8 8 0 0 1 8 8M10 18a8 8 0 0 0 13.66 5.66" stroke={brand} strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M14 18a4 4 0 0 0 7.46 2" stroke={brand} strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="18" cy="18" r="1.5" fill={brand}/>
              </svg>
            </div>

            {/* Numpad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button key={d} onClick={() => addDigit(d)} style={{
                  background: '#111827', border: '1px solid #374151',
                  borderRadius: 12, padding: '16px 0',
                  fontSize: 22, fontWeight: 600, color: '#f9fafb',
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
                  onMouseDown={e => (e.currentTarget.style.background = '#374151')}
                  onMouseUp={e => (e.currentTarget.style.background = '#111827')}
                >{d}</button>
              ))}
              <button onClick={delDigit} style={{
                background: '#111827', border: '1px solid #374151', borderRadius: 12,
                padding: '16px 0', fontSize: 18, color: '#9ca3af', cursor: 'pointer',
              }}>⌫</button>
              <button onClick={() => addDigit('0')} style={{
                background: '#111827', border: '1px solid #374151', borderRadius: 12,
                padding: '16px 0', fontSize: 22, fontWeight: 600, color: '#f9fafb', cursor: 'pointer',
              }}>0</button>
              <button onClick={() => setCedula('')} style={{
                background: '#111827', border: '1px solid #374151', borderRadius: 12,
                padding: '16px 0', fontSize: 12, color: '#6b7280', cursor: 'pointer',
              }}>Limpiar</button>
            </div>

            {/* Botón registrar — color cambia según modo */}
            <button
              onClick={() => cedula.length >= 5 && processCheckin(cedula)}
              disabled={cedula.length < 5 || screen === 'loading'}
              style={{
                width: '100%',
                padding: '16px',
                background: cedula.length >= 5
                  ? mode === 'IN' ? '#10b981'
                    : mode === 'OUT' ? '#3b82f6'
                    : brand
                  : '#374151',
                border: 'none',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 700,
                color: '#fff',
                cursor: cedula.length >= 5 ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
                opacity: screen === 'loading' ? 0.7 : 1,
                boxShadow: cedula.length >= 5
                  ? `0 4px 20px ${mode === 'IN' ? '#10b98155' : mode === 'OUT' ? '#3b82f655' : brand + '55'}`
                  : 'none',
              }}>
              {screen === 'loading' ? 'Verificando...'
                : mode === 'IN' ? '🟢 Registrar ENTRADA'
                : mode === 'OUT' ? '🔵 Registrar SALIDA'
                : '⚡ Registrar →'}
            </button>

            {screen === 'loading' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <div style={{
                  width: 26, height: 26,
                  border: `3px solid #374151`,
                  borderTopColor: brand,
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                  margin: '0 auto',
                }} />
              </div>
            )}
          </>
        )}

        {/* ── RESULT SCREEN ─────────────────────────────────── */}
        {screen === 'result' && result && (() => {
          const cfg    = RESULT_CFG[result.type];
          const member = result.member;
          return (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 96, height: 96, borderRadius: '50%',
                background: cfg.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
                fontSize: 42,
                border: `3px solid ${cfg.badgeFg}33`,
                boxShadow: `0 0 32px ${cfg.iconBg}`,
              }}>
                {cfg.icon}
              </div>

              {member && (
                <p style={{ fontSize: 26, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>
                  {member.full_name}
                </p>
              )}
              {!member && (
                <p style={{ fontSize: 20, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>
                  Cédula no registrada
                </p>
              )}

              {member && (
                <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 14 }}>
                  {cfg.sub(member)}
                  {result.type === 'OUT' && result.durationMinutes
                    ? ` · ${fmtTime(result.durationMinutes)}`
                    : member && result.type === 'IN'
                    ? ` · Vence ${new Date(member.end_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`
                    : ''}
                </p>
              )}

              <div style={{
                display: 'inline-block',
                background: cfg.badgeBg,
                color: cfg.badgeFg,
                borderRadius: 100,
                padding: '6px 20px',
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 18,
                border: `1px solid ${cfg.badgeFg}44`,
                letterSpacing: '0.04em',
                boxShadow: `0 0 16px ${cfg.badgeFg}33`,
              }}>
                {cfg.badge}
              </div>

              <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 28, lineHeight: 1.6 }}>
                {member ? cfg.msg(member, result.durationMinutes) : cfg.msg({} as Member)}
              </p>

              {/* Countdown */}
              <div style={{
                background: '#111827', borderRadius: 12,
                padding: '12px 18px', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>Volviendo al inicio en</span>
                <span style={{
                  fontSize: 20, fontWeight: 700,
                  color: autoReturn <= 2 ? '#ef4444' : cfg.badgeFg,
                  minWidth: 30, textAlign: 'right',
                }}>{autoReturn}s</span>
              </div>

              <button onClick={resetToIdle} style={{
                width: '100%', padding: '12px',
                background: '#111827', border: '1px solid #374151',
                borderRadius: 12, fontSize: 14, color: '#9ca3af', cursor: 'pointer',
              }}>
                ← Volver ahora
              </button>
            </div>
          );
        })()}
      </div>

      <p style={{ fontSize: 10, color: '#374151', marginTop: 16 }}>
        POSmaster · Kiosk Gimnasio
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default GymKiosk;