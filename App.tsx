import React, { useState, useEffect } from 'react';
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
import { LandingPage, RegisterPage, AdminPanel } from './LandingPage';
import { ContractSign } from './ContractSign';
import { Toaster } from 'react-hot-toast';

const SUPER_ADMIN_EMAIL = 'diegofernando@office365tl.onmicrosoft.com';
const WHATSAPP_NUMBER = '573204884943';
const BOLD_PAYMENT_URL = 'https://checkout.bold.co/payment/LNK_U58X7N71NX';
const CONTACT_EMAIL = 'diegoferrangel@gmail.com';

// ── PANTALLA CUENTA PENDIENTE ─────────────────────────────────────────────────
const PendingScreen: React.FC<{ email: string; onRetry: () => void }> = ({ email, onRetry }) => {
  const [checking, setChecking] = React.useState(false);
  const waMessage = encodeURIComponent(`Hola, soy ${email}. Me registré en POSmaster y quiero activar mi cuenta.`);

  const handleRetry = async () => {
    setChecking(true);
    await new Promise(r => setTimeout(r, 500));
    onRetry();
    setChecking(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, background: 'rgba(234,179,8,0.15)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>⏳</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 10 }}>Cuenta en revisión</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
          Tu cuenta <strong style={{ color: '#fde047' }}>{email}</strong> fue registrada exitosamente pero está pendiente de activación.
        </p>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 32 }}>
          Una vez confirmado tu pago, activaremos tu acceso en menos de 24 horas.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={handleRetry} disabled={checking}
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: checking ? 0.7 : 1 }}>
            {checking ? '🔄 Verificando...' : '✓ Ya pagué — Verificar acceso'}
          </button>
          <a href={BOLD_PAYMENT_URL} target="_blank" rel="noreferrer"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>
            💳 Pagar con Bold
          </a>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`} target="_blank" rel="noreferrer"
            style={{ background: '#25d366', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>
            💬 Confirmar por WhatsApp
          </a>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
            <p style={{ color: '#93c5fd', fontSize: 13, fontWeight: 600 }}>✉️ {CONTACT_EMAIL}</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()}
          style={{ marginTop: 24, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
};

// ── PANTALLA SUSCRIPCIÓN VENCIDA ──────────────────────────────────────────────
const PastDueScreen: React.FC<{ email: string; onRetry: () => void }> = ({ email, onRetry }) => {
  const [checking, setChecking] = React.useState(false);
  const handleRetry = async () => { setChecking(true); await new Promise(r => setTimeout(r, 500)); onRetry(); setChecking(false); };
  const waMessage = encodeURIComponent(`Hola, soy ${email}. Mi suscripción de POSmaster venció. Adjunto mi comprobante de pago para renovarla.`);
  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 24, padding: 40, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, background: 'rgba(239,68,68,0.12)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 10 }}>Suscripción Vencida</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
          La suscripción de <strong style={{ color: '#fca5a5' }}>{email}</strong> ha vencido.
        </p>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 32 }}>
          Para continuar usando POSmaster realiza el pago y envía tu comprobante por WhatsApp. Activaremos tu cuenta en menos de 24 horas.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={handleRetry} disabled={checking}
            style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: checking ? 0.7 : 1 }}>
            {checking ? '🔄 Verificando...' : '✓ Ya pagué — Verificar acceso'}
          </button>
          <a href={BOLD_PAYMENT_URL} target="_blank" rel="noreferrer"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>
            💳 Pagar con Bold
          </a>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`} target="_blank" rel="noreferrer"
            style={{ background: '#25d366', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>
            💬 Enviar comprobante por WhatsApp
          </a>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
            <p style={{ color: '#93c5fd', fontSize: 13, fontWeight: 600 }}>✉️ {CONTACT_EMAIL}</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()}
          style={{ marginTop: 24, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
const Login: React.FC<{ onShowLanding: () => void; onShowRegister: () => void }> = ({ onShowLanding, onShowRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : authError.message);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <button onClick={onShowLanding} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          ← Volver a POSmaster
        </button>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, margin: '0 auto 16px', color: '#fff' }}>PM</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 6, letterSpacing: '-0.5px' }}>Bienvenido a POSmaster</h1>
            <p style={{ color: '#475569', fontSize: 14 }}>Ingresa con tus credenciales</p>
          </div>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            <button type="submit" disabled={loading}
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: '#475569' }}>
            ¿No tienes cuenta?{' '}
            <button onClick={onShowRegister} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Registrarse gratis</button>
          </p>
        </div>
      </div>
    </div>
  );
};

// ── APP ───────────────────────────────────────────────────────────────────────
type AppView = 'landing' | 'login' | 'register' | 'app' | 'admin' | 'pending' | 'past_due' | 'preview';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<AppView>('landing');
  const [userEmail, setUserEmail] = useState('');
  const [companyStatus, setCompanyStatus] = useState<string | null>(null);
  const [previewCompanyId, setPreviewCompanyId] = useState<string | null>(null);

  // ── Detectar enlace de contrato en la URL ──────────────────────────────────
  const contractTokenMatch = window.location.hash.match(/^#\/contrato\/([a-f0-9]{64})$/);
  const contractToken = contractTokenMatch ? contractTokenMatch[1] : null;

  const retryCheck = async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) { setView('login'); return; }
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', s.user.id).maybeSingle();
    if (!profile?.company_id) { setView('pending'); return; }
    const { data: company } = await supabase
      .from('companies').select('subscription_status').eq('id', profile.company_id).maybeSingle();
    if (!company) { setView('pending'); return; }
    setCompanyStatus(company.subscription_status);
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
      if (email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
        setView('admin'); setChecking(false); return;
      }
      try {
        const { data: profile } = await supabase
          .from('profiles').select('company_id').eq('id', session.user.id).maybeSingle();
        if (!profile?.company_id) { setView('pending'); setChecking(false); return; }
        const { data: company } = await supabase
          .from('companies').select('subscription_status, subscription_end_date')
          .eq('id', profile.company_id).maybeSingle();
        if (!company) { setView('pending'); setChecking(false); return; }
        let status = company.subscription_status;
        if (company.subscription_end_date) {
          const today = new Date().toISOString().split('T')[0];
          if (company.subscription_end_date < today && status === 'ACTIVE') {
            await supabase.from('companies').update({ subscription_status: 'PAST_DUE' }).eq('id', profile.company_id);
            status = 'PAST_DUE';
          }
        }
        setCompanyStatus(status);
        setView(resolveView(status));
      } catch (err) {
        console.error('❌ Error verificando estado:', err);
        setView('landing');
      }
      setChecking(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') handleSession(session);
      if (event === 'SIGNED_OUT') { setSession(null); setView('landing'); setChecking(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Si la URL tiene token de contrato, mostrar página de firma ──────────────
  if (contractToken) {
    return <ContractSign token={contractToken} />;
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, color: '#fff', margin: '0 auto 20px', boxShadow: '0 0 40px rgba(59,130,246,0.4)' }}>PM</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
          <p style={{ color: '#475569', fontSize: 14, fontWeight: 600 }}>Iniciando POSmaster...</p>
          <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0);opacity:0.3} 40%{transform:scale(1);opacity:1} }`}</style>
        </div>
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <>
        <Toaster position="top-right" />
        <AdminPanel
          onExit={() => { supabase.auth.signOut(); }}
          onPreview={(companyId: string) => { setPreviewCompanyId(companyId); setView('preview'); }}
        />
      </>
    );
  }

  if (view === 'register') {
    return (
      <>
        <Toaster position="top-right" />
        <RegisterPage onBack={() => setView('login')} onSuccess={() => setView('login')} />
      </>
    );
  }

  if (view === 'pending' && session) {
    return (
      <>
        <Toaster position="top-right" />
        <PendingScreen email={userEmail} onRetry={retryCheck} />
      </>
    );
  }

  if (view === 'past_due' && session) {
    return (
      <>
        <Toaster position="top-right" />
        <PastDueScreen email={userEmail} onRetry={retryCheck} />
      </>
    );
  }

  if (view === 'login') {
    return (
      <>
        <Toaster position="top-right" />
        <Login onShowLanding={() => setView('landing')} onShowRegister={() => setView('register')} />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Toaster position="top-right" />
        <LandingPage onLogin={() => setView('login')} onRegister={() => setView('register')} />
      </>
    );
  }

  if (view === 'preview' && previewCompanyId) {
    return (
      <>
        <Toaster position="top-right" />
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
          <span>👁️ Modo Vista Previa — Estás viendo el panel del cliente (solo lectura)</span>
          <button onClick={() => { setPreviewCompanyId(null); setView('admin'); }}
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            ← Volver al Panel Admin
          </button>
        </div>
        <div style={{ paddingTop: 48 }}>
          <Router>
            <DatabaseProvider overrideCompanyId={previewCompanyId}>
              <Routes>
                <Route path="/*" element={
                  <Layout onAdminPanel={undefined}>
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
                    </Routes>
                  </Layout>
                } />
              </Routes>
            </DatabaseProvider>
          </Router>
        </div>
      </>
    );
  }

  // App principal
  return (
    <>
      <Toaster position="top-right" />
      <Router>
        <DatabaseProvider>
          <Routes>
            <Route path="/*" element={
              <Layout onAdminPanel={undefined}>
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
                </Routes>
              </Layout>
            } />
          </Routes>
        </DatabaseProvider>
      </Router>
    </>
  );
};

export default App;