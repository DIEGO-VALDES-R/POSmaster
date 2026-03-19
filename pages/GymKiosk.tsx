import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type Screen = 'idle' | 'loading' | 'result';
type ResultType = 'IN' | 'OUT' | 'EXPIRED' | 'FROZEN' | 'NOT_FOUND';

interface Member {
  id: string;
  full_name: string;
  document: string;
  membership_type_name: string;
  membership_price: number;
  end_date: string;
  status: 'ACTIVE' | 'EXPIRED' | 'FROZEN' | 'CANCELLED';
}

interface LastCheckin {
  id: string;
  type: 'IN' | 'OUT';
  checked_in_at: string;
}

interface Company {
  id: string;
  name: string;
  logo_url?: string;
  config?: {
    primary_color?: string;
    turnstile_webhook_url?: string;
    kiosk_auto_return_seconds?: number;
  };
}

interface ResultData {
  type: ResultType;
  member?: Member;
  durationMinutes?: number;
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
// MAIN KIOSK COMPONENT
// ══════════════════════════════════════════════════════════════

const GymKiosk: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();

  const [company,    setCompany]    = useState<Company | null>(null);
  const [screen,     setScreen]     = useState<Screen>('idle');
  const [cedula,     setCedula]     = useState('');
  const [result,     setResult]     = useState<ResultData | null>(null);
  const [autoReturn, setAutoReturn] = useState(0);

  const inputRef     = useRef<HTMLInputElement>(null);
  const returnTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoReturnSecs = company?.config?.kiosk_auto_return_seconds ?? 5;

  // ── Load company ─────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    supabase.from('companies')
      .select('id, name, logo_url, config')
      .eq('id', companyId)
      .single()
      .then(({ data }) => { if (data) setCompany(data); });
  }, [companyId]);

  // ── Always keep input focused (kiosk mode) ───────────────────
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
        if (prev <= 1) {
          resetToIdle();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (returnTimer.current) clearInterval(returnTimer.current); };
  }, [screen]);

  const resetToIdle = useCallback(() => {
    if (returnTimer.current) clearInterval(returnTimer.current);
    setCedula('');
    setResult(null);
    setScreen('idle');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── Turnstile webhook ────────────────────────────────────────
  const openTurnstile = useCallback(async () => {
    const url = company?.config?.turnstile_webhook_url;
    if (!url) return;
    try {
      await fetch(url, { method: 'GET', mode: 'no-cors' });
    } catch {
      // silent — no-cors requests always throw but the signal still goes
    }
  }, [company]);

  // ── Process check-in / check-out ─────────────────────────────
  const processCheckin = useCallback(async (doc: string) => {
    if (!companyId || doc.length < 5) return;
    setScreen('loading');

    try {
      // Find member by document
      const { data: members } = await supabase
        .from('gym_members')
        .select('*')
        .eq('company_id', companyId)
        .eq('document', doc.trim())
        .limit(1);

      if (!members || members.length === 0) {
        setResult({ type: 'NOT_FOUND' });
        setScreen('result');
        return;
      }

      const member: Member = members[0];

      // Check membership status
      const today = new Date().toISOString().split('T')[0];
      const isExpired = member.status === 'ACTIVE' && member.end_date < today;
      const effectiveStatus = isExpired ? 'EXPIRED' : member.status;

      if (effectiveStatus === 'EXPIRED') {
        // Auto-update status in DB
        await supabase.from('gym_members').update({ status: 'EXPIRED' }).eq('id', member.id);
        setResult({ type: 'EXPIRED', member });
        setScreen('result');
        return;
      }

      if (effectiveStatus === 'FROZEN' || effectiveStatus === 'CANCELLED') {
        setResult({ type: 'FROZEN', member });
        setScreen('result');
        return;
      }

      // Determine IN or OUT — check last checkin today
      const todayStart = today + 'T00:00:00';
      const { data: lastCheckins } = await supabase
        .from('gym_checkins')
        .select('id, type, checked_in_at')
        .eq('company_id', companyId)
        .eq('member_id', member.id)
        .gte('checked_in_at', todayStart)
        .order('checked_in_at', { ascending: false })
        .limit(1);

      const lastCheckin: LastCheckin | null = lastCheckins?.[0] || null;
      const checkType: 'IN' | 'OUT' = (!lastCheckin || lastCheckin.type === 'OUT') ? 'IN' : 'OUT';

      // Calculate duration if OUT
      let durationMinutes: number | undefined;
      if (checkType === 'OUT' && lastCheckin) {
        const entryTime = new Date(lastCheckin.checked_in_at).getTime();
        durationMinutes = Math.round((Date.now() - entryTime) / 60000);
      }

      // Insert checkin record
      await supabase.from('gym_checkins').insert({
        company_id:     companyId,
        member_id:      member.id,
        member_name:    member.full_name,
        status:         member.status,
        type:           checkType,
        duration_minutes: checkType === 'OUT' ? durationMinutes : null,
      });

      // Open turnstile on entry
      if (checkType === 'IN') {
        openTurnstile();
      }

      setResult({ type: checkType, member, durationMinutes });
      setScreen('result');

    } catch (err) {
      console.error('Kiosk error:', err);
      setResult({ type: 'NOT_FOUND' });
      setScreen('result');
    }
  }, [companyId, openTurnstile]);

  // ── Keypad input handler (also catches fingerprint reader) ───
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
    setCedula(val);
    // Fingerprint readers often send cédula + Enter — auto-submit on 8+ digits
    // Also handled by onKeyDown below
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && cedula.length >= 5) {
      processCheckin(cedula);
    }
  }, [cedula, processCheckin]);

  const addDigit = (d: string) => {
    if (cedula.length < 11) {
      const next = cedula + d;
      setCedula(next);
    }
  };

  const delDigit = () => setCedula(c => c.slice(0, -1));

  // ── Colors ───────────────────────────────────────────────────
  const brand = company?.config?.primary_color || '#065f46';

  // ══════════════════════════════════════════════════════════════
  // RESULT CONFIG
  // ══════════════════════════════════════════════════════════════
  const RESULT_CFG = {
    IN: {
      bg:      '#064e3b',
      iconBg:  '#065f46',
      icon:    '✓',
      badge:   'ENTRADA REGISTRADA',
      badgeBg: '#064e3b',
      badgeFg: '#6ee7b7',
      msg:     (m: Member) => `Bienvenido/a. Tienes ${daysLeft(m.end_date)} días de membresía.`,
      sub:     (m: Member, dur?: number) => `${m.membership_type_name}`,
    },
    OUT: {
      bg:      '#1e3a5f',
      iconBg:  '#1e40af',
      icon:    '👋',
      badge:   'SALIDA REGISTRADA',
      badgeBg: '#1e3a5f',
      badgeFg: '#93c5fd',
      msg:     (m: Member, dur?: number) => dur ? `Tiempo en el gimnasio: ${fmtTime(dur)}. ¡Buen entrenamiento!` : '¡Hasta la próxima!',
      sub:     (m: Member) => m.membership_type_name,
    },
    EXPIRED: {
      bg:      '#7f1d1d',
      iconBg:  '#991b1b',
      icon:    '✕',
      badge:   'MEMBRESÍA VENCIDA',
      badgeBg: '#7f1d1d',
      badgeFg: '#fca5a5',
      msg:     (m: Member) => `Tu membresía venció el ${new Date(m.end_date + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'long' })}. Habla con recepción para renovar.`,
      sub:     (m: Member) => m.membership_type_name,
    },
    FROZEN: {
      bg:      '#1e3a5f',
      iconBg:  '#1d4ed8',
      icon:    '❄️',
      badge:   'MEMBRESÍA CONGELADA',
      badgeBg: '#1e3a5f',
      badgeFg: '#93c5fd',
      msg:     () => 'Tu membresía está congelada. Habla con recepción para activarla.',
      sub:     (m: Member) => m.membership_type_name,
    },
    NOT_FOUND: {
      bg:      '#3b1f00',
      iconBg:  '#92400e',
      icon:    '?',
      badge:   'NO ENCONTRADO',
      badgeBg: '#3b1f00',
      badgeFg: '#fcd34d',
      msg:     () => 'No encontramos un socio con esa cédula. Verifica el número o habla con recepción.',
      sub:     () => '',
    },
  };

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
      {/* Hidden input to capture fingerprint reader input */}
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
        width: '100%',
        maxWidth: 420,
        background: '#1f2937',
        borderRadius: 28,
        padding: '32px 24px',
        border: '1px solid #374151',
      }}>

        {/* ── IDLE SCREEN ───────────────────────────────────── */}
        {(screen === 'idle' || screen === 'loading') && (
          <>
            {/* Logo / Company */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              {company?.logo_url ? (
                <img src={company.logo_url} alt="Logo"
                  style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px', display: 'block', border: '2px solid #374151' }} />
              ) : (
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: brand, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 16px',
                  fontSize: 32,
                }}>💪</div>
              )}
              <p style={{ fontSize: 22, fontWeight: 700, color: '#f9fafb', marginBottom: 6 }}>
                {company?.name || 'Gimnasio'}
              </p>
              <p style={{ fontSize: 14, color: '#6b7280' }}>Registra tu ingreso o salida</p>
            </div>

            {/* Cédula display */}
            <div
              onClick={() => inputRef.current?.focus()}
              style={{
                background: '#111827',
                border: `2px solid ${cedula ? brand : '#374151'}`,
                borderRadius: 16,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 20,
                cursor: 'text',
                transition: 'border-color 0.2s',
              }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Número de cédula
                </p>
                <p style={{
                  fontSize: cedula ? 32 : 16,
                  fontWeight: 700,
                  color: cedula ? '#f9fafb' : '#374151',
                  letterSpacing: cedula ? 4 : 0,
                  minHeight: 40,
                  lineHeight: '40px',
                  transition: 'all 0.15s',
                }}>
                  {cedula
                    ? cedula.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
                    : 'Escribe o usa el huellero'
                  }
                </p>
              </div>
              {/* Fingerprint icon */}
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none"
                style={{ opacity: 0.5, flexShrink: 0 }}>
                <circle cx="18" cy="18" r="17" stroke={brand} strokeWidth="2"/>
                <path d="M18 10a8 8 0 0 1 8 8M10 18a8 8 0 0 0 13.66 5.66" stroke={brand} strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M14 18a4 4 0 0 0 7.46 2" stroke={brand} strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="18" cy="18" r="1.5" fill={brand}/>
              </svg>
            </div>

            {/* Numpad */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 16,
            }}>
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <button key={d} onClick={() => addDigit(d)} style={{
                  background: '#111827',
                  border: '1px solid #374151',
                  borderRadius: 14,
                  padding: '18px 0',
                  fontSize: 24,
                  fontWeight: 600,
                  color: '#f9fafb',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                  onMouseDown={e => (e.currentTarget.style.background = '#374151')}
                  onMouseUp={e => (e.currentTarget.style.background = '#111827')}
                >{d}</button>
              ))}
              <button onClick={delDigit} style={{
                background: '#111827', border: '1px solid #374151', borderRadius: 14,
                padding: '18px 0', fontSize: 20, color: '#9ca3af', cursor: 'pointer',
              }}>⌫</button>
              <button onClick={() => addDigit('0')} style={{
                background: '#111827', border: '1px solid #374151', borderRadius: 14,
                padding: '18px 0', fontSize: 24, fontWeight: 600, color: '#f9fafb', cursor: 'pointer',
              }}>0</button>
              <button onClick={() => setCedula('')} style={{
                background: '#111827', border: '1px solid #374151', borderRadius: 14,
                padding: '18px 0', fontSize: 13, color: '#6b7280', cursor: 'pointer',
              }}>Limpiar</button>
            </div>

            {/* Submit button */}
            <button
              onClick={() => cedula.length >= 5 && processCheckin(cedula)}
              disabled={cedula.length < 5 || screen === 'loading'}
              style={{
                width: '100%',
                padding: '18px',
                background: cedula.length >= 5 ? brand : '#374151',
                border: 'none',
                borderRadius: 16,
                fontSize: 17,
                fontWeight: 700,
                color: '#fff',
                cursor: cedula.length >= 5 ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
                opacity: screen === 'loading' ? 0.7 : 1,
              }}>
              {screen === 'loading' ? 'Verificando...' : 'Registrar ingreso / salida →'}
            </button>

            {screen === 'loading' && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <div style={{
                  width: 28, height: 28,
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
          const cfg = RESULT_CFG[result.type];
          const member = result.member;

          return (
            <div style={{ textAlign: 'center' }}>
              {/* Big icon */}
              <div style={{
                width: 100, height: 100,
                borderRadius: '50%',
                background: cfg.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
                fontSize: 44,
                border: `3px solid ${cfg.badgeFg}33`,
              }}>
                {cfg.icon}
              </div>

              {/* Name */}
              {member && (
                <p style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', marginBottom: 6 }}>
                  {member.full_name}
                </p>
              )}
              {!member && (
                <p style={{ fontSize: 22, fontWeight: 700, color: '#f9fafb', marginBottom: 6 }}>
                  Cédula no registrada
                </p>
              )}

              {/* Membership type */}
              {member && (
                <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 16 }}>
                  {cfg.sub(member)}
                  {result.type === 'OUT' && result.durationMinutes
                    ? ` · ${fmtTime(result.durationMinutes)}`
                    : member ? ` · Vence ${new Date(member.end_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}` : ''}
                </p>
              )}

              {/* Badge */}
              <div style={{
                display: 'inline-block',
                background: cfg.badgeBg,
                color: cfg.badgeFg,
                borderRadius: 100,
                padding: '6px 20px',
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 20,
                border: `1px solid ${cfg.badgeFg}44`,
                letterSpacing: '0.04em',
              }}>
                {cfg.badge}
              </div>

              {/* Message */}
              <p style={{ fontSize: 15, color: '#9ca3af', marginBottom: 32, lineHeight: 1.6 }}>
                {member ? cfg.msg(member, result.durationMinutes) : cfg.msg({} as Member)}
              </p>

              {/* Auto-return countdown */}
              <div style={{
                background: '#111827',
                borderRadius: 14,
                padding: '14px 20px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 14, color: '#6b7280' }}>Volviendo al inicio en</span>
                <span style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: autoReturn <= 2 ? '#ef4444' : cfg.badgeFg,
                  minWidth: 32,
                  textAlign: 'right',
                }}>{autoReturn}s</span>
              </div>

              <button
                onClick={resetToIdle}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#111827',
                  border: '1px solid #374151',
                  borderRadius: 14,
                  fontSize: 15,
                  color: '#9ca3af',
                  cursor: 'pointer',
                }}>
                ← Volver ahora
              </button>
            </div>
          );
        })()}
      </div>

      {/* Footer */}
      <p style={{ fontSize: 11, color: '#374151', marginTop: 20 }}>
        POSmaster · Kiosk Gimnasio
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default GymKiosk;
