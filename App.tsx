import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { DatabaseProvider } from './contexts/DatabaseContext';
import Layout from './components/Layout';
import { LandingPage, RegisterPage, ClientPortal } from './LandingPage';
const SuperAdminDashboard = React.lazy(() => import('./pages/SuperAdminDashboard'));
import { ContractSign } from './ContractSign';
import AcceptInvitation from './AcceptInvitation';
import { Toaster } from 'react-hot-toast';
import PWAInstallPrompt from './components/PWAInstallPrompt';

// ── CODE SPLITTING ────────────────────────────────────────────────────────────
const Dashboard          = lazy(() => import('./pages/Dashboard'));
const POS                = lazy(() => import('./pages/POS'));
const Inventory          = lazy(() => import('./pages/Inventory'));
const Repairs            = lazy(() => import('./pages/Repairs'));
const CashControl        = lazy(() => import('./pages/CashControl'));
const AccountsReceivable = lazy(() => import('./pages/AccountsReceivable'));
const AccountsPayable    = lazy(() => import('./pages/AccountsPayable'));
const InvoiceHistory     = lazy(() => import('./pages/InvoiceHistory'));
const Settings           = lazy(() => import('./pages/Settings'));
const Hardware           = lazy(() => import('./pages/Hardware'));
const Branches           = lazy(() => import('./pages/Branches'));
const Team               = lazy(() => import('./pages/Team'));
const Tables             = lazy(() => import('./pages/Tables'));
const KitchenDisplay     = lazy(() => import('./pages/KitchenDisplay'));
const BeautySalon        = lazy(() => import('./pages/BeautySalon'));
const ShoeRepair         = lazy(() => import('./pages/ShoeRepair'));
const Odontologia        = lazy(() => import('./pages/Odontologia'));
const Veterinaria        = lazy(() => import('./pages/Veterinaria'));
const Supplies           = lazy(() => import('./pages/Supplies'));
const Farmacia           = lazy(() => import('./pages/Farmacia'));
const Optometria         = lazy(() => import('./pages/Optometria'));
const PortalPropietario  = lazy(() => import('./pages/PortalPropietario'));
const BranchKiosk        = lazy(() => import('./BranchKiosk'));
const Apartados          = lazy(() => import('./pages/Apartados'));
const Lavadero           = lazy(() => import('./pages/Lavadero'));
const LavaderoEmpleados  = lazy(() => import('./LavaderoEmpleados'));
const LavaderoSalaEspera = lazy(() => import('./LavaderoSalaEspera'));
const Customers          = lazy(() => import('./pages/Customers'));
const Quotes             = lazy(() => import('./pages/Quotes'));
const Nomina             = lazy(() => import('./pages/Nomina'));
const PurchaseOrders     = lazy(() => import('./pages/PurchaseOrders'));
const CreditNotes        = lazy(() => import('./pages/CreditNotes'));
const Reports            = lazy(() => import('./pages/Reports'));
const Expenses           = lazy(() => import('./pages/Expenses'));
const PublicCatalog      = lazy(() => import('./pages/PublicCatalog'));
const WarehouseDisplay   = lazy(() => import('./pages/WarehouseDisplay'));
const Gimnasio           = lazy(() => import('./pages/Gimnasio'));
const GymKiosk           = lazy(() => import('./pages/GymKiosk'));
const Panaderia          = lazy(() => import('./pages/Panaderia'));
const B2BMarketplace     = lazy(() => import('./pages/B2BMarketplace'));
const GymClientPortal    = lazy(() => import('./GymClientPortal'));
const GymClassesDisplay  = lazy(() => import('./GymClassesDisplay'));

const WHATSAPP_NUMBER  = import.meta.env.VITE_WHATSAPP_NUMBER  || '573204884943';
const BOLD_PAYMENT_URL = import.meta.env.VITE_BOLD_PAYMENT_URL || 'https://checkout.bold.co/payment/LNK_U58X7N71NX';
const CONTACT_EMAIL    = import.meta.env.VITE_CONTACT_EMAIL    || 'info@posmaster.org';

// ── Rate Limiting PIN ─────────────────────────────────────────────────────────
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS   = 15 * 60 * 1000;

const usePinRateLimit = () => {
  const attemptsRef    = useRef<number>(0);
  const lockedUntilRef = useRef<number | null>(null);

  const checkLocked = (): { locked: boolean; remainingMs: number } => {
    if (lockedUntilRef.current && Date.now() < lockedUntilRef.current) {
      return { locked: true, remainingMs: lockedUntilRef.current - Date.now() };
    }
    if (lockedUntilRef.current && Date.now() >= lockedUntilRef.current) {
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

// ── Pantalla PENDING ──────────────────────────────────────────────────────────
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

// ── Pantalla PAST_DUE ─────────────────────────────────────────────────────────
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

// ── Login ─────────────────────────────────────────────────────────────────────
const Login: React.FC<{ onShowLanding: () => void; onShowRegister: () => void }> = ({ onShowLanding, onShowRegister }) => {
  const [mode, setMode] = useState<'normal' | 'pin' | 'pin-found' | 'forgot' | 'forgot-sent'>('normal');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { checkLocked, registerFailedAttempt, registerSuccess, remainingAttempts } = usePinRateLimit();
  const [lockMsg, setLockMsg] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const { locked, remainingMs } = checkLocked();
      if (locked) { const mins = Math.ceil(remainingMs / 60000); setLockMsg(`Demasiados intentos. Espera ${mins} min.`); }
      else { setLockMsg(''); }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : authError.message);
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Ingresa tu email'); return; }
    setLoading(true); setError('');
    const redirectTo = `${window.location.origin}/#/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setMode('forgot-sent');
  };

  const handlePinLogin = async () => {
    const { locked, remainingMs } = checkLocked();
    if (locked) { const mins = Math.ceil(remainingMs / 60000); setError(`Demasiados intentos fallidos. Espera ${mins} minuto(s).`); return; }
    const fullPin = pinDigits.join('');
    if (fullPin.length !== 4) { setError('Ingresa los 4 dígitos'); return; }
    setLoading(true); setError('');
    try {
      const { data, error: pErr } = await supabase.rpc('verify_pin', { input_pin: fullPin });
      if (pErr || !data || data.length === 0) {
        registerFailedAttempt();
        const left = remainingAttempts() - 1;
        setError(left > 0 ? `PIN incorrecto. ${left} intento(s) restantes.` : 'Cuenta bloqueada por 15 minutos.');
        setLoading(false); return;
      }
      registerSuccess();
      setEmail(data[0].user_email || '');
      setMode('pin-found');
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  const handleDigit = (i: number, val: string) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const arr = [...pinDigits]; arr[i] = v; setPinDigits(arr);
    if (v && i < 3) document.getElementById(`pind-${i+1}`)?.focus();
    if (!v && i > 0) document.getElementById(`pind-${i-1}`)?.focus();
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 };
  const errorBox = error && (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 14, padding: '10px 14px', borderRadius: 8 }}>{error}</div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <button onClick={onShowLanding} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, marginBottom: 24, fontWeight: 600 }}>← Volver a POSmaster</button>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, margin: '0 auto 14px', color: '#fff' }}>PM</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>
              {mode === 'forgot' || mode === 'forgot-sent' ? 'Restablecer contraseña' : 'Bienvenido a POSmaster'}
            </h1>
          </div>

          {(mode === 'normal' || mode === 'pin' || mode === 'pin-found') && (
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, marginBottom: 24 }}>
              <button onClick={() => { setMode('normal'); setError(''); }}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: mode === 'normal' ? 'rgba(59,130,246,0.3)' : 'transparent', color: mode === 'normal' ? '#93c5fd' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                📧 Email / Contraseña
              </button>
              <button onClick={() => { setMode('pin'); setError(''); setPinDigits(['','','','']); }}
                style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: mode === 'pin' ? 'rgba(16,185,129,0.3)' : 'transparent', color: mode === 'pin' ? '#6ee7b7' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                🔢 PIN Rápido
              </button>
            </div>
          )}

          {mode === 'normal' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@email.com" style={inputStyle} /></div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Contraseña</label>
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); }} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>¿Olvidaste tu contraseña?</button>
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={inputStyle} />
              </div>
              {errorBox}
              <button type="submit" disabled={loading} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Verificando...' : 'Ingresar'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 4, fontSize: 14, color: '#475569' }}>
                ¿No tienes cuenta?{' '}
                <button onClick={onShowRegister} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Registrarse gratis</button>
              </p>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 4 }}>Ingresa tu email y te enviaremos un link para restablecer tu contraseña.</p>
              <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@email.com" autoFocus style={inputStyle} /></div>
              {errorBox}
              <button type="submit" disabled={loading} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Enviando...' : '📧 Enviar link de restablecimiento'}
              </button>
              <button type="button" onClick={() => { setMode('normal'); setError(''); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Volver al inicio de sesión</button>
            </form>
          )}

          {mode === 'forgot-sent' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
              <p style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>¡Revisa tu bandeja!</p>
              <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 24 }}>Enviamos un link a <strong style={{ color: '#93c5fd' }}>{email}</strong>.<br />Haz clic en el link para crear una nueva contraseña.<br /><span style={{ fontSize: 11, opacity: 0.6 }}>El link expira en 1 hora.</span></p>
              <button onClick={() => { setMode('normal'); setError(''); setEmail(''); }} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Volver al inicio de sesión</button>
            </div>
          )}

          {mode === 'pin' && (
            <div>
              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>Ingresa tu PIN de 4 dígitos</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
                {[0,1,2,3].map(i => (
                  <input key={i} id={`pind-${i}`} type="password" inputMode="numeric" maxLength={1}
                    value={pinDigits[i]} onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Backspace' && !pinDigits[i] && i > 0) document.getElementById(`pind-${i-1}`)?.focus(); }}
                    disabled={!!checkLocked().locked}
                    style={{ width: 56, height: 64, textAlign: 'center', fontSize: 28, fontWeight: 800, background: 'rgba(255,255,255,0.06)', border: `2px solid ${pinDigits[i] ? '#10b981' : 'rgba(255,255,255,0.12)'}`, borderRadius: 12, color: '#f1f5f9', outline: 'none' }} />
                ))}
              </div>
              {lockMsg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>🔒 {lockMsg}</div>}
              {error && !lockMsg && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>{error}</div>}
              <button onClick={handlePinLogin} disabled={loading || pinDigits.join('').length < 4 || !!checkLocked().locked}
                style={{ width: '100%', background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: (loading || pinDigits.join('').length < 4 || !!checkLocked().locked) ? 0.5 : 1 }}>
                {loading ? 'Buscando...' : '→ Entrar con PIN'}
              </button>
            </div>
          )}

          {mode === 'pin-found' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 4 }}>
                <p style={{ color: '#6ee7b7', fontSize: 13 }}>✅ PIN válido — cuenta: <strong>{email}</strong></p>
              </div>
              <div><label style={labelStyle}>Contraseña</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus placeholder="••••••••" style={inputStyle} /></div>
              {errorBox}
              <button type="submit" disabled={loading} style={{ background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Ingresando...' : '→ Confirmar e ingresar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Reset Password ────────────────────────────────────────────────────────────
const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return; }
    if (password !== password2) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true); setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    setDone(true);
    setTimeout(() => { window.location.hash = '/'; }, 2500);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9', fontSize: 15, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, margin: '0 auto 14px', color: '#fff' }}>PM</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>{done ? '✅ Contraseña actualizada' : 'Nueva contraseña'}</h1>
            {!done && <p style={{ color: '#64748b', fontSize: 13 }}>Ingresa tu nueva contraseña para POSmaster</p>}
          </div>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#6ee7b7', fontSize: 14, marginBottom: 8 }}>¡Tu contraseña se guardó correctamente!</p>
              <p style={{ color: '#475569', fontSize: 12 }}>Redirigiendo al inicio de sesión...</p>
            </div>
          ) : (
            <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Nueva contraseña</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus placeholder="Mínimo 6 caracteres" style={inputStyle} /></div>
              <div><label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Confirmar contraseña</label><input type="password" value={password2} onChange={e => setPassword2(e.target.value)} required placeholder="Repite la contraseña" style={inputStyle} /></div>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 14, padding: '10px 14px', borderRadius: 8 }}>{error}</div>}
              <button type="submit" disabled={loading} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '13px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Guardando...' : '🔒 Guardar nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Page Loader ───────────────────────────────────────────────────────────────
const PageLoader: React.FC = () => (
  <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Cargando módulo...</p>
    </div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ── App Routes ────────────────────────────────────────────────────────────────
const AppRoutes: React.FC = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/"              element={<Dashboard />} />
      <Route path="/pos"           element={<POS />} />
      <Route path="/inventory"     element={<Inventory />} />
      <Route path="/repairs"       element={<Repairs />} />
      <Route path="/cash-control"  element={<CashControl />} />
      <Route path="/receivables"   element={<AccountsReceivable />} />
      <Route path="/payables"      element={<AccountsPayable />} />
      <Route path="/invoices"      element={<InvoiceHistory />} />
      <Route path="/settings"      element={<Settings />} />
      <Route path="/hardware"      element={<Hardware />} />
      <Route path="/branches"      element={<Branches />} />
      <Route path="/team"          element={<Team />} />
      <Route path="/tables"        element={<Tables />} />
      <Route path="/kitchen"       element={<KitchenDisplay />} />
      <Route path="/salon"         element={<BeautySalon />} />
      <Route path="/shoe-repair"   element={<ShoeRepair />} />
      <Route path="/dentistry"     element={<Odontologia />} />
      <Route path="/veterinaria"   element={<Veterinaria />} />
      <Route path="/supplies"      element={<Supplies />} />
      <Route path="/farmacia"      element={<Farmacia />} />
      <Route path="/customers"     element={<Customers />} />
      <Route path="/quotes"        element={<Quotes />} />
      <Route path="/nomina"        element={<Nomina />} />
      <Route path="/purchases"     element={<PurchaseOrders />} />
      <Route path="/credit-notes"  element={<CreditNotes />} />
      <Route path="/reports"       element={<Reports />} />
      <Route path="/expenses"      element={<Expenses />} />
      <Route path="/optometria"    element={<Optometria />} />
      <Route path="/portal"        element={<PortalPropietario />} />
      <Route path="/kiosk"         element={<BranchKiosk />} />
      <Route path="/apartados"     element={<Apartados />} />
      <Route path="/lavadero"      element={<Lavadero />} />
      <Route path="/warehouse"     element={<WarehouseDisplay />} />
      <Route path="/gimnasio"      element={<Gimnasio />} />
      <Route path="/b2b"           element={<B2BMarketplace />} />
      <Route path="/panaderia"     element={<Panaderia />} />
    </Routes>
  </Suspense>
);

// ── App ───────────────────────────────────────────────────────────────────────
type AppView = 'landing' | 'login' | 'register' | 'app' | 'admin' | 'pending' | 'past_due' | 'preview' | 'portal' | 'warehouse';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<AppView>('landing');
  const [userEmail, setUserEmail] = useState('');
  const [previewCompanyId, setPreviewCompanyId] = useState<string | null>(null);

  const contractTokenMatch   = window.location.hash.match(/^#\/contrato\/([a-f0-9]{64})$/);
  const contractToken        = contractTokenMatch ? contractTokenMatch[1] : null;
  const invitationTokenMatch = window.location.hash.match(/^#\/invitacion\/([a-f0-9]{32})$/);
  const invitationToken      = invitationTokenMatch ? invitationTokenMatch[1] : null;
  const isResetPassword      = window.location.hash.startsWith('#/reset-password');

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
      setUserEmail(email); setSession(session);
      try {
        const { data: profile } = await supabase.from('profiles').select('company_id, is_super_admin, custom_role').eq('id', session.user.id).maybeSingle();
        if (profile?.is_super_admin === true) { setView('admin'); setChecking(false); return; }
        if (!profile?.company_id) { setView('pending'); setChecking(false); return; }
        if (profile.custom_role === 'bodeguero') { setView('warehouse'); setChecking(false); return; }
        const { data: company } = await supabase.from('companies').select('subscription_status, subscription_end_date').eq('id', profile.company_id).maybeSingle();
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
      } catch { setView('landing'); }
      setChecking(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') handleSession(session);
      if (event === 'SIGNED_OUT') { setSession(null); setView('landing'); setChecking(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (isResetPassword) return <><Toaster position="top-right" /><ResetPassword /></>;
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

  if (view === 'warehouse') return (
    <><Toaster position="top-right" />
      <Router><DatabaseProvider><Suspense fallback={<PageLoader />}><WarehouseDisplay /></Suspense></DatabaseProvider></Router>
    </>
  );

  if (view === 'admin')    return <><Toaster position="top-right" /><Suspense fallback={<PageLoader />}><SuperAdminDashboard onExit={() => supabase.auth.signOut()} onPreview={(id: string) => { setPreviewCompanyId(id); setView('preview'); }} /></Suspense></>;
  if (view === 'register') return <><Toaster position="top-right" /><RegisterPage onBack={() => setView('login')} onSuccess={() => setView('login')} /></>;
  if (view === 'portal')   return <><Toaster position="top-right" /><ClientPortal onBack={() => setView('landing')} /></>;
  if (view === 'pending'  && session) return <><Toaster position="top-right" /><PendingScreen  email={userEmail} onRetry={retryCheck} /></>;
  if (view === 'past_due' && session) return <><Toaster position="top-right" /><PastDueScreen  email={userEmail} onRetry={retryCheck} /></>;
  if (view === 'login')    return <><Toaster position="top-right" /><Login onShowLanding={() => setView('landing')} onShowRegister={() => setView('register')} /></>;
  if (!session)            return <><Toaster position="top-right" /><LandingPage onLogin={() => setView('login')} onRegister={() => setView('register')} onClientPortal={() => setView('portal')} /></>;

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
      <PWAInstallPrompt />
      <Router>
        <Routes>
          <Route path="/catalogo/:companyId"        element={<Suspense fallback={<PageLoader />}><PublicCatalog /></Suspense>} />
          <Route path="/gimnasio-kiosk/:companyId"  element={<Suspense fallback={<PageLoader />}><GymKiosk /></Suspense>} />
          <Route path="/gym-portal/:token"          element={<Suspense fallback={<PageLoader />}><GymClientPortal /></Suspense>} />
          <Route path="/gym-classes/:companyId"     element={<Suspense fallback={<PageLoader />}><GymClassesDisplay /></Suspense>} />
          <Route path="/lavadero-display/:companyId" element={<Suspense fallback={<PageLoader />}><LavaderoEmpleados /></Suspense>} />
          <Route path="/lavadero-espera/:companyId"  element={<Suspense fallback={<PageLoader />}><LavaderoSalaEspera /></Suspense>} />
          <Route path="/*" element={
            <DatabaseProvider>
              <Routes>
                <Route path="/*" element={<Layout onAdminPanel={undefined}><AppRoutes /></Layout>} />
              </Routes>
            </DatabaseProvider>
          } />
        </Routes>
      </Router>
    </>
  );
};

export default App;