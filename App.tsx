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
import { LandingPage, RegisterPage, AdminPanel } from './LandingPage';
import { Toaster } from 'react-hot-toast';

const SUPER_ADMIN_EMAIL = 'diegofernando@office365tl.onmicrosoft.com';
const WHATSAPP_NUMBER = '573204884943';
const BOLD_PAYMENT_URL = 'https://checkout.bold.co/payment/LNK_U58X7N71NX';

// ── PANTALLA CUENTA PENDIENTE ─────────────────────────────────────────────────
const PendingScreen: React.FC<{ email: string }> = ({ email }) => {
  const waMessage = encodeURIComponent(`Hola, soy ${email}. Me registré en POSmaster y quiero activar mi cuenta.`);
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
          <a href={BOLD_PAYMENT_URL} target="_blank" rel="noreferrer"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>
            💳 Pagar con Bold
          </a>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`} target="_blank" rel="noreferrer"
            style={{ background: '#25d366', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', display: 'block' }}>
            💬 Confirmar por WhatsApp
          </a>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
            <p style={{ color: '#93c5fd', fontSize: 13, fontWeight: 600 }}>✉️ diegoferrangel@gmail.com</p>
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
type AppView = 'landing' | 'login' | 'register' | 'app' | 'admin' | 'pending';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<AppView>('landing');
  const [userEmail, setUserEmail] = useState('');
  const [companyStatus, setCompanyStatus] = useState<string | null>(null);

  const checkCompanyStatus = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles').select('company_id').eq('id', userId).single();
    if (!profile?.company_id) return null;
    const { data: company } = await supabase
      .from('companies').select('subscription_status').eq('id', profile.company_id).single();
    return company?.subscription_status || null;
  };

  useEffect(() => {
    const timeout = setTimeout(() => setChecking(false), 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
      if (session) {
        const email = session.user.email || '';
        setUserEmail(email);
        if (email === SUPER_ADMIN_EMAIL) {
          setView('admin');
        } else {
          const status = await checkCompanyStatus(session.user.id);
          setCompanyStatus(status);
          setView(status === 'ACTIVE' ? 'app' : 'pending');
        }
      }
      setChecking(false);
    }).catch(() => { clearTimeout(timeout); setChecking(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        const email = session.user.email || '';
        setUserEmail(email);
        if (email === SUPER_ADMIN_EMAIL) {
          setChecking(false);
          setView('admin');
          return;
        }
        try {
          const status = await Promise.race([
            checkCompanyStatus(session.user.id),
            new Promise<null>((_, reject) => setTimeout(() => reject('timeout'), 5000))
          ]);
          setCompanyStatus(status as string);
          setView((status as string) === 'ACTIVE' ? 'app' : 'pending');
        } catch {
          setView('pending');
        }
        setChecking(false);
      } else {
        setView('landing');
        setCompanyStatus(null);
        setChecking(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#3b82f6', fontSize: 18, fontWeight: 700 }}>Cargando POSmaster...</div>
      </div>
    );
  }

  // Panel admin completamente separado
  if (view === 'admin') {
    return (
      <>
        <Toaster position="top-right" />
        <AdminPanel onExit={() => setView('app')} />
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
        <PendingScreen email={userEmail} />
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

  // App principal
  return (
    <>
      <Toaster position="top-right" />
      <Router>
        <DatabaseProvider>
          <Routes>
            <Route path="/*" element={
              <Layout onAdminPanel={userEmail === SUPER_ADMIN_EMAIL ? () => setView('admin') : undefined}>
                <Routes>
                  <Route path="/"             element={<Dashboard />} />
                  <Route path="/pos"          element={<POS />} />
                  <Route path="/inventory"    element={<Inventory />} />
                  <Route path="/repairs"      element={<Repairs />} />
                  <Route path="/cash-control" element={<CashControl />} />
                  <Route path="/receivables"  element={<AccountsReceivable />} />
                  <Route path="/invoices"     element={<InvoiceHistory />} />
                  <Route path="/settings"     element={<Settings />} />
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