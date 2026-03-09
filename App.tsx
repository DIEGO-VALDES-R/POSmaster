import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { DatabaseProvider } from './contexts/DatabaseContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Repairs from './pages/Repairs';
import CashControl from './pages/CashControl';
import AccountsReceivable from './pages/AccountsReceivable';
import InvoiceHistory from './pages/InvoiceHistory';
import Settings from './pages/Settings';
import Branches from './pages/Branches';
import Team from './pages/Team';
import Tables from './pages/Tables';
import KitchenDisplay from './pages/KitchenDisplay';
import BeautySalon from './pages/BeautySalon';
import ShoeRepair from './pages/ShoeRepair';
import Odontologia from './pages/Odontologia';
import Supplies from './pages/Supplies';
import { LandingPage, RegisterPage, AdminPanel, ClientPortal } from './LandingPage';
import { ContractSign } from './ContractSign';
import AcceptInvitation from './AcceptInvitation';
import { Toaster } from 'react-hot-toast';

// ── CORRECCIÓN AUTH-04 / FRO-01 ───────────────────────────────────────────────
// Las constantes sensibles se mueven a variables de entorno .env
// Crear archivo .env en la raíz del proyecto con estas variables:
//   VITE_WHATSAPP_NUMBER=573204884943
//   VITE_BOLD_PAYMENT_URL=https://checkout.bold.co/payment/LNK_U58X7N71NX
//   VITE_CONTACT_EMAIL=diegoferrangel@gmail.com
// El super admin ya NO está hardcodeado — se verifica contra la BD
const WHATSAPP_NUMBER    = import.meta.env.VITE_WHATSAPP_NUMBER    || '573204884943';
const BOLD_PAYMENT_URL   = import.meta.env.VITE_BOLD_PAYMENT_URL   || 'https://checkout.bold.co/payment/LNK_U58X7N71NX';
const CONTACT_EMAIL      = import.meta.env.VITE_CONTACT_EMAIL      || 'diegoferrangel@gmail.com';

// ── CORRECCIÓN AUTH-02 — Rate Limiting PIN ────────────────────────────────────
// Máximo 5 intentos de PIN por sesión, bloqueo de 15 minutos
const PIN_MAX_ATTEMPTS  = 5;
const PIN_LOCKOUT_MS    = 15 * 60 * 1000; // 15 minutos

const usePinRateLimit = () => {
  const attemptsRef = useRef<number>(0);
  const lockedUntilRef = useRef<number | null>(null);

  const checkLocked = (): { locked: boolean; remainingMs: number } => {
    if (lockedUntilRef.current && Date.now() < lockedUntilRef.current) {
      return { locked: true, remainingMs: lockedUntilRef.current - Date.now() };
    }
    if (lockedUntilRef.current && Date.now() >= lockedUntilRef.current) {
      // Lockout expiró — resetear
      attemptsRef.current = 0;
      lockedUntilRef.current = null;
    }
    return { locked: false, remainingMs: 0 };
  };

  const registerFailedAttempt = () => {
    attemptsRef.current += 1;
    if (attemptsRef.current >= PIN_MAX_ATTEMPTS) {
      lockedUntilRef.current = Date.now() + PIN_LOCKOUT_MS;
    }
  };

  const registerSuccess = () => {
    attemptsRef.current = 0;
    lockedUntilRef.current = null;
  };

  const remainingAttempts = () => PIN_MAX_ATTEMPTS - attemptsRef.current;

  return { checkLocked, registerFailedAttempt, registerSuccess, remainingAttempts };
};

// ── PANTALLAS PENDING / PAST_DUE ──────────────────────────────────────────────
const PendingScreen: React.FC<{ email: string; onRetry: () => void }> = ({ email, onRetry }) => {
  const [checking, setChecking] = React.useState(false);
  const waMessage = encodeURIComponent(`Hola, soy ${email}. Me registré en POSmaster y quiero activar mi cuenta.`);
  const handleRetry = async () => { setChecking(true); await new Promise(r => setTimeout(r, 500)); onRetry(); setChecking(false); };
  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 10 }}>Cuenta en revisión</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 8 }}>Tu cuenta <strong style={{ color: '#fde047' }}>{email}</strong> está pendiente de activación.</p>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 32 }}>Una vez confirmado tu pago, activaremos tu acceso en menos de 24 horas.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={handleRetry} disabled={checking} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: checking ? 0.7 : 1 }}>
            {checking ? '🔄 Verificando...' : '✓ Ya pagué — Verificar acceso'}
          </button>
          <a href={BOLD_PAYMENT_URL} target="_blank" rel="noreferrer" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>💳 Pagar con Bold</a>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`} target="_blank" rel="noreferrer" style={{ background: '#25d366', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>💬 Confirmar por WhatsApp</a>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 24, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cerrar sesión</button>
      </div>
    </div>
  );
};

const PastDueScreen: React.FC<{ email: string; onRetry: () => void }> = ({ email, onRetry }) => {
  const [checking, setChecking] = React.useState(false);
  const handleRetry = async () => { setChecking(true); await new Promise(r => setTimeout(r, 500)); onRetry(); setChecking(false); };
  const waMessage = encodeURIComponent(`Hola, soy ${email}. Mi suscripción de POSmaster venció. Adjunto comprobante.`);
  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 24, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 10 }}>Suscripción Vencida</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 32 }}>La suscripción de <strong style={{ color: '#fca5a5' }}>{email}</strong> ha vencido.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={handleRetry} disabled={checking} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: checking ? 0.7 : 1 }}>
            {checking ? '🔄 Verificando...' : '✓ Ya pagué — Verificar acceso'}
          </button>
          <a href={BOLD_PAYMENT_URL} target="_blank" rel="noreferrer" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>💳 Pagar con Bold</a>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`} target="_blank" rel="noreferrer" style={{ background: '#25d366', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>💬 Enviar comprobante</a>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 24, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cerrar sesión</button>
      </div>
    </div>
  );
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
const Login: React.FC<{ onShowLanding: () => void; onShowRegister: () => void }> = ({ onShowLanding, onShowRegister }) => {
  const [mode, setMode] = useState<'normal' | 'pin' | 'pin-found'>('normal');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── CORRECCIÓN AUTH-02 — Rate limiting ──
  const { checkLocked, registerFailedAttempt, registerSuccess, remainingAttempts } = usePinRateLimit();
  const [lockMsg, setLockMsg] = useState('');

  // Actualiza el mensaje de bloqueo cada segundo si está bloqueado
  useEffect(() => {
    const interval = setInterval(() => {
      const { locked, remainingMs } = checkLocked();
      if (locked) {
        const mins = Math.ceil(remainingMs / 60000);
        setLockMsg(`Demasiados intentos. Espera ${mins} min.`);
      } else {
        setLockMsg('');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : authError.message);
    setLoading(false);
  };

  const handlePinLogin = async () => {
    // ── Verificar rate limit antes de consultar ──
    const { locked, remainingMs } = checkLocked();
    if (locked) {
      const mins = Math.ceil(remainingMs / 60000);
      setError(`Demasiados intentos fallidos. Espera ${mins} minuto(s).`);
      return;
    }

    const fullPin = pinDigits.join('');
    if (fullPin.length !== 4) { setError('Ingresa los 4 dígitos'); return; }
    setLoading(true); setError('');

    try {
      // ── CORRECCIÓN SUP-04 — Verificar PIN con hash via función SQL ──
      const { data, error: pErr } = await supabase
        .rpc('verify_pin', { input_pin: fullPin });

      if (pErr || !data || data.length === 0) {
        registerFailedAttempt();
        const left = remainingAttempts() - 1;
        setError(left > 0
          ? `PIN incorrecto. ${left} intento(s) restantes.`
          : 'Cuenta bloqueada por 15 minutos.'
        );
        setLoading(false);
        return;
      }

      registerSuccess();
      setEmail(data[0].user_email || '');
      setMode('pin-found');
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleDigit = (i: number, val: string) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const arr = [...pinDigits]; arr[i] = v;
    setPinDigits(arr);
    if (v && i < 3) document.getElementById(`pind-${i+1}`)?.focus();
    if (!v && i > 0) document.getElementById(`pind-${i-1}`)?.focus();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <button onClick={onShowLanding} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, marginBottom: 24, fontWeight: 600 }}>← Volver a POSmaster</button>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, margin: '0 auto 14px', color: '#fff' }}>PM</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>Bienvenido a POSmaster</h1>
          </div>

          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, marginBottom: 24 }}>
            <button onClick={() => { setMode('normal'); setError(''); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: mode === 'normal' ? 'rgba(59,130,246,0.3)' : 'transparent', color: mode === 'normal' ? '#93c5fd' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              📧 Email / Contraseña
            </button>
            <button onClick={() => { setMode('pin'); setError(''); setPinDigits(['','','','']); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: mode === 'pin' ? 'rgba(16,185,129,0.3)' : 'transparent', color: mode === 'pin' ? '#6ee7b7' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              🔢 PIN Rápido
            </button>
          </div>

          {/* Login normal */}
          {mode === 'normal' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@email.com"
                  style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                  style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 14, padding: '10px 14px', borderRadius: 8 }}>{error}</div>}
              <button type="submit" disabled={loading} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Verificando...' : 'Ingresar'}
              </button>
            </form>
          )}

          {/* Login PIN */}
          {mode === 'pin' && (
            <div>
              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>Ingresa tu PIN de 4 dígitos</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
                {[0,1,2,3].map(i => (
                  <input key={i} id={`pind-${i}`} type="password" inputMode="numeric" maxLength={1}
                    value={pinDigits[i]}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Backspace' && !pinDigits[i] && i > 0) document.getElementById(`pind-${i-1}`)?.focus(); }}
                    disabled={!!checkLocked().locked}
                    style={{ width: 56, height: 64, textAlign: 'center', fontSize: 28, fontWeight: 800, background: 'rgba(255,255,255,0.06)', border: `2px solid ${pinDigits[i] ? '#10b981' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, color: '#f1f5f9', outline: 'none' }} />
                ))}
              </div>

              {/* Mensaje de bloqueo */}
              {lockMsg && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>
                  🔒 {lockMsg}
                </div>
              )}

              {error && !lockMsg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>{error}</div>}

              <button onClick={handlePinLogin} disabled={loading || pinDigits.join('').length < 4 || !!checkLocked().locked}
                style={{ width: '100%', background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: (loading || pinDigits.join('').length < 4 || !!checkLocked().locked) ? 0.5 : 1 }}>
                {loading ? 'Buscando...' : '→ Entrar con PIN'}
              </button>
            </div>
          )}

          {/* PIN encontrado — pedir contraseña */}
          {mode === 'pin-found' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 4 }}>
                <p style={{ color: '#6ee7b7', fontSize: 13 }}>✅ PIN válido — cuenta: <strong>{email}</strong></p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus placeholder="••••••••"
                  style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 14, padding: '10px 14px', borderRadius: 8 }}>{error}</div>}
              <button type="submit" disabled={loading} style={{ background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Ingresando...' : '→ Confirmar e ingresar'}
              </button>
            </form>
          )}

          {mode === 'normal' && (
            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#475569' }}>
              ¿No tienes cuenta?{' '}
              <button onClick={onShowRegister} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Registrarse gratis</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── RUTAS ─────────────────────────────────────────────────────────────────────
const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/"             element={<Dashboard />} />
    <Route path="/pos"          element={<POS />} />
    <Route path="/inventory"    element={<Inventory />} />
    <Route path="/repairs"      element={<Repairs />} />
    <Route path="/cash-control" element={<CashControl />} />
    <Route path="/receivables"  element={<AccountsReceivable />} />
    <Route path="/invoices"     element={<InvoiceHistory />} />
    <Route path="/settings"     element={<Settings />} />
    <Route path="/branches"     element={<Branches />} />
    <Route path="/team"         element={<Team />} />
    <Route path="/tables"       element={<Tables />} />
    <Route path="/kitchen"      element={<KitchenDisplay />} />
    <Route path="/salon"        element={<BeautySalon />} />
    <Route path="/shoe-repair"  element={<ShoeRepair />} />
    <Route path="/dentistry"    element={<Odontologia />} />
    <Route path="/supplies"     element={<Supplies />} />
  </Routes>
);

// ── APP ───────────────────────────────────────────────────────────────────────
type AppView = 'landing' | 'login' | 'register' | 'app' | 'admin' | 'pending' | 'past_due' | 'preview' | 'portal';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<AppView>('landing');
  const [userEmail, setUserEmail] = useState('');
  const [previewCompanyId, setPreviewCompanyId] = useState<string | null>(null);

  const contractTokenMatch  = window.location.hash.match(/^#\/contrato\/([a-f0-9]{64})$/);
  const contractToken       = contractTokenMatch ? contractTokenMatch[1] : null;
  const invitationTokenMatch = window.location.hash.match(/^#\/invitacion\/([a-f0-9]{32})$/);
  const invitationToken     = invitationTokenMatch ? invitationTokenMatch[1] : null;

  const retryCheck = async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) { setView('login'); return; }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', s.user.id).maybeSingle();
    if (!profile?.company_id) { setView('pending'); return; }
    const { data: company } = await supabase.from('companies').select('subscription_status').eq('id', profile.company_id).maybeSingle();
    if (!company) { setView('pending'); return; }
    setView(resolveView(company.subscription_status));
  };

  const resolveView = (status: string | null): AppView => {
    if (status === 'ACTIVE') return 'app';
    if (status === 'PAST_DUE') return 'past_due';
    return 'pending';
  };

  useEffect(() => {
    const handleSession = async (session: any) => {
      if (!session) { setView('landing'); setChecking(false); return; }
      const email = session.user.email || '';
      setUserEmail(email);
      setSession(session);

      try {
        // ── CORRECCIÓN AUTH-04 — Super admin verificado en BD, no hardcodeado ──
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id, is_super_admin')
          .eq('id', session.user.id)
          .maybeSingle();

        // Verificar is_super_admin desde la base de datos
        if (profile?.is_super_admin === true) {
          setView('admin');
          setChecking(false);
          return;
        }

        if (!profile?.company_id) { setView('pending'); setChecking(false); return; }

        const { data: company } = await supabase
          .from('companies')
          .select('subscription_status, subscription_end_date')
          .eq('id', profile.company_id)
          .maybeSingle();

        if (!company) { setView('pending'); setChecking(false); return; }

        let status = company.subscription_status;
        if (company.subscription_end_date) {
          const today = new Date().toISOString().split('T')[0];
          if (company.subscription_end_date < today && status === 'ACTIVE') {
            await supabase.from('companies').update({ subscription_status: 'PAST_DUE' }).eq('id', profile.company_id);
            status = 'PAST_DUE';
          }
        }
        setView(resolveView(status));
      } catch {
        setView('landing');
      }
      setChecking(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') handleSession(session);
      if (event === 'SIGNED_OUT') { setSession(null); setView('landing'); setChecking(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (contractToken)   return <ContractSign token={contractToken} />;
  if (invitationToken) return <><Toaster position="top-right" /><AcceptInvitation token={invitationToken} /></>;

  if (checking) return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, color: '#fff', margin: '0 auto 20px' }}>PM</div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', animation: `bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
        </div>
        <p style={{ color: '#475569', fontSize: 14, fontWeight: 600 }}>Iniciando POSmaster...</p>
        <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0);opacity:.3}40%{transform:scale(1);opacity:1}}`}</style>
      </div>
    </div>
  );

  if (view === 'admin')    return (<><Toaster position="top-right" /><AdminPanel onExit={() => supabase.auth.signOut()} onPreview={(id: string) => { setPreviewCompanyId(id); setView('preview'); }} /></>);
  if (view === 'register') return (<><Toaster position="top-right" /><RegisterPage onBack={() => setView('login')} onSuccess={() => setView('login')} /></>);
  if (view === 'portal')   return (<><Toaster position="top-right" /><ClientPortal onBack={() => setView('landing')} /></> );
  if (view === 'pending'  && session) return (<><Toaster position="top-right" /><PendingScreen  email={userEmail} onRetry={retryCheck} /></>);
  if (view === 'past_due' && session) return (<><Toaster position="top-right" /><PastDueScreen  email={userEmail} onRetry={retryCheck} /></>);
  if (view === 'login')    return (<><Toaster position="top-right" /><Login onShowLanding={() => setView('landing')} onShowRegister={() => setView('register')} /></>);
  if (!session)            return (<><Toaster position="top-right" /><LandingPage onLogin={() => setView('login')} onRegister={() => setView('register')} onClientPortal={() => setView('portal')} /></>);

  if (view === 'preview' && previewCompanyId) return (
    <>
      <Toaster position="top-right" />
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <span>👁️ Modo Vista Previa</span>
        <button onClick={() => { setPreviewCompanyId(null); setView('admin'); }} style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>← Volver al Panel Admin</button>
      </div>
      <div style={{ paddingTop: 48 }}>
        <Router><DatabaseProvider overrideCompanyId={previewCompanyId}><Routes><Route path="/*" element={<Layout onAdminPanel={undefined}><AppRoutes /></Layout>} /></Routes></DatabaseProvider></Router>
      </div>
    </>
  );

  return (
    <>
      <Toaster position="top-right" />
      <Router>
        <DatabaseProvider>
          <Routes>
            <Route path="/*" element={<Layout onAdminPanel={undefined}><AppRoutes /></Layout>} />
          </Routes>
        </DatabaseProvider>
      </Router>
    </>
  );
};

export default App;