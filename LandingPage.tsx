import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-hot-toast';

const WHATSAPP_NUMBER = '573204884943';
const CONTACT_EMAIL = 'diegoferrangel@gmail.com';
const BOLD_PAYMENT_URL = 'https://checkout.bold.co/payment/LNK_U58X7N71NX';

// ── LANDING PAGE ─────────────────────────────────────────────────────────────
export const LandingPage: React.FC<{ onLogin: () => void; onRegister: () => void }> = ({ onLogin, onRegister }) => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const plans = [
    { id: 'BASIC', name: 'Básico', price: 'Gratis', period: '', color: '#64748b', features: ['1 Usuario', '1 Sucursal', 'POS Completo', 'Hasta 100 Productos', 'Soporte por Email'], cta: 'Empezar Gratis' },
    { id: 'PRO', name: 'Profesional', price: '$79.900', period: '/mes', color: '#3b82f6', features: ['5 Usuarios', '3 Sucursales', 'Facturación Electrónica DIAN', 'Productos Ilimitados', 'Reportes Avanzados', 'Soporte Prioritario'], cta: 'Comenzar Ahora', popular: true },
    { id: 'ENTERPRISE', name: 'Empresarial', price: '$249.900', period: '/mes', color: '#8b5cf6', features: ['Usuarios Ilimitados', 'Sucursales Ilimitadas', 'API Access', 'Gestor Dedicado', 'SLA 99.9%', 'Capacitación Incluida'], cta: 'Contactar Ventas' },
  ];

  const features = [
    { icon: '🏪', title: 'Punto de Venta', desc: 'POS rápido con soporte de código de barras, IMEI y pagos mixtos.' },
    { icon: '📦', title: 'Inventario Inteligente', desc: 'Control de stock en tiempo real con alertas de mínimos y fotos de producto.' },
    { icon: '🔧', title: 'Servicio Técnico', desc: 'Gestiona órdenes de reparación con seguimiento de estado y técnico asignado.' },
    { icon: '💰', title: 'Control de Caja', desc: 'Apertura, cierre y arqueo de turnos con historial detallado.' },
    { icon: '📊', title: 'Dashboard', desc: 'Métricas reales de ventas, utilidad y rendimiento de tu negocio.' },
    { icon: '🧾', title: 'Facturación DIAN', desc: 'Emisión de facturas electrónicas certificadas. Cumple con la normativa colombiana.' },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: '#0a0f1e', color: '#f1f5f9', minHeight: '100vh' }}>
      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(10,15,30,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : 'none',
        transition: 'all 0.3s', padding: '0 5%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#fff' }}>PM</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px' }}>POSmaster</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onLogin} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#f1f5f9', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Ingresar</button>
          <button onClick={onRegister} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Registrarse</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 5% 60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, background: 'radial-gradient(circle,rgba(59,130,246,0.15) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 780 }}>
          <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', padding: '6px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            🇨🇴 Hecho para negocios colombianos
          </div>
          <h1 style={{ fontSize: 'clamp(2.5rem,6vw,4.5rem)', fontWeight: 900, lineHeight: 1.05, marginBottom: 24, letterSpacing: '-2px' }}>
            El POS que{' '}
            <span style={{ background: 'linear-gradient(135deg,#3b82f6,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>hace crecer</span>
            {' '}tu negocio
          </h1>
          <p style={{ fontSize: 'clamp(1rem,2vw,1.25rem)', color: '#94a3b8', lineHeight: 1.7, marginBottom: 40, maxWidth: 560, margin: '0 auto 40px' }}>
            POS, inventario, reparaciones y más en una sola plataforma. Para tiendas de tecnología, misceláneas y más.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onLogin} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '14px 32px', borderRadius: 12, cursor: 'pointer', fontWeight: 700, fontSize: 16, boxShadow: '0 0 30px rgba(99,102,241,0.4)' }}>Ya tengo cuenta</button>
            <button onClick={onRegister} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', padding: '14px 32px', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 16 }}>Registrarse</button>
          </div>
          <p style={{ color: '#475569', fontSize: 13, marginTop: 20 }}>Sin tarjeta de crédito • Planes desde $65.000/mes</p>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '80px 5%', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.8rem,4vw,2.5rem)', fontWeight: 800, marginBottom: 12, letterSpacing: '-1px' }}>Todo lo que tu negocio necesita</h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: 56, fontSize: 16 }}>Una plataforma completa, sin complicaciones</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
          {features.map((f, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, transition: 'all 0.2s', cursor: 'default' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(59,130,246,0.4)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(59,130,246,0.05)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}>
              <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PLANS */}
      <section style={{ padding: '80px 5%', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.8rem,4vw,2.5rem)', fontWeight: 800, marginBottom: 12, letterSpacing: '-1px' }}>Planes y precios</h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: 56, fontSize: 16 }}>Empieza gratis, crece cuando lo necesites</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          {plans.map(plan => (
            <div key={plan.id} style={{
              background: (plan as any).popular ? 'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(99,102,241,0.1))' : 'rgba(255,255,255,0.03)',
              border: (plan as any).popular ? '2px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.07)',
              borderRadius: 20, padding: 32, position: 'relative', display: 'flex', flexDirection: 'column'
            }}>
              {(plan as any).popular && (
                <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', padding: '4px 16px', borderRadius: 100, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>MÁS POPULAR</div>
              )}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 12, color: plan.color }}>{plan.name}</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-1px' }}>{plan.price}</span>
                  <span style={{ color: '#64748b', fontSize: 14 }}>{plan.period}</span>
                </div>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', flex: 1 }}>
                {plan.features.map((feat, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 14, color: '#cbd5e1' }}>
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>✓</span> {feat}
                  </li>
                ))}
              </ul>
              <button onClick={onRegister} style={{
                background: (plan as any).popular ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'rgba(255,255,255,0.08)',
                border: 'none', color: '#fff', padding: '12px 24px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, width: '100%'
              }}>{plan.cta}</button>
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section style={{ padding: '60px 5%', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>¿Tienes preguntas?</h2>
        <p style={{ color: '#64748b', marginBottom: 32, fontSize: 15 }}>Contáctanos directamente y te ayudamos a elegir el plan ideal.</p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hola,%20quiero%20información%20sobre%20POSmaster`} target="_blank" rel="noreferrer"
            style={{ background: '#25d366', color: '#fff', padding: '12px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            💬 WhatsApp
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9', padding: '12px 24px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            ✉️ {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '40px 5%', textAlign: 'center', color: '#475569', fontSize: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#fff' }}>PM</div>
          <span style={{ fontWeight: 700, color: '#94a3b8' }}>POSmaster</span>
        </div>
        <p>© 2025 POSmaster. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
};

// ── REGISTER PAGE ─────────────────────────────────────────────────────────────
export const RegisterPage: React.FC<{ onBack: () => void; onSuccess: () => void }> = ({ onBack, onSuccess }) => {
  const [step, setStep] = useState(1); // 1=cuenta, 2=negocio, 3=pago
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    businessName: '', nit: '', phone: '', address: '', plan: 'BASIC'
  });

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleRegister = async () => {
    if (!form.businessName || !form.nit) { toast.error('Nombre y NIT son requeridos'); return; }
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { full_name: form.businessName } }
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('No se pudo crear el usuario');

      // Crear empresa con estado PENDING hasta que admin active
      const { data: company, error: companyError } = await supabase
        .from('companies').insert({
          name: form.businessName, nit: form.nit, phone: form.phone,
          address: form.address, email: form.email,
          subscription_plan: form.plan,
          subscription_status: 'PENDING',
          config: { tax_rate: 19, currency_symbol: '$', invoice_prefix: 'POS' }
        }).select().single();
      if (companyError) throw companyError;

      await supabase.from('profiles').upsert({
        id: authData.user.id, company_id: company.id,
        role: 'ADMIN', full_name: form.businessName,
        email: form.email, is_active: true
      });

      const { data: branch } = await supabase.from('branches')
        .insert({ company_id: company.id, name: 'Sede Principal', is_active: true })
        .select().single();
      if (branch) await supabase.from('profiles').update({ branch_id: branch.id }).eq('id', authData.user.id);

      setRegistered(true);
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const waMessage = encodeURIComponent(
    `Hola, acabo de registrarme en POSmaster con el negocio "${form.businessName}" (${form.email}). Plan: ${form.plan}. Quiero confirmar mi acceso.`
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#f1f5f9',
    fontSize: 15, outline: 'none', boxSizing: 'border-box'
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 500, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, margin: '0 auto 16px', color: '#fff' }}>PM</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.5px', color: '#f1f5f9' }}>
            {step === 3 ? '¡Registro exitoso!' : 'Crear cuenta en POSmaster'}
          </h1>
          {step < 3 && <p style={{ color: '#64748b', fontSize: 14 }}>Paso {step} de 2</p>}
          {step < 3 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
              {[1, 2].map(s => (
                <div key={s} style={{ height: 4, width: 60, borderRadius: 2, background: s <= step ? '#3b82f6' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
              ))}
            </div>
          )}
        </div>

        {/* PASO 1 — Credenciales */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>Email *</label><input type="email" value={form.email} onChange={f('email')} placeholder="tu@email.com" style={inputStyle} /></div>
            <div><label style={labelStyle}>Contraseña *</label><input type="password" value={form.password} onChange={f('password')} placeholder="Mínimo 6 caracteres" style={inputStyle} /></div>
            <div><label style={labelStyle}>Confirmar Contraseña *</label><input type="password" value={form.confirmPassword} onChange={f('confirmPassword')} placeholder="Repite la contraseña" style={inputStyle} /></div>
            <button onClick={() => {
              if (!form.email || !form.password) { toast.error('Completa todos los campos'); return; }
              if (form.password !== form.confirmPassword) { toast.error('Las contraseñas no coinciden'); return; }
              if (form.password.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
              setStep(2);
            }} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, marginTop: 8 }}>
              Siguiente →
            </button>
          </div>
        )}

        {/* PASO 2 — Negocio */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>Nombre del Negocio *</label><input value={form.businessName} onChange={f('businessName')} placeholder="Ej: IPHONESHOP USA" style={inputStyle} /></div>
            <div><label style={labelStyle}>NIT / Cédula *</label><input value={form.nit} onChange={f('nit')} placeholder="900123456-7" style={inputStyle} /></div>
            <div><label style={labelStyle}>Teléfono</label><input value={form.phone} onChange={f('phone')} placeholder="300 123 4567" style={inputStyle} /></div>
            <div><label style={labelStyle}>Dirección</label><input value={form.address} onChange={f('address')} placeholder="Calle 123 # 45-67" style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Plan</label>
              <select value={form.plan} onChange={f('plan')} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="BASIC">Básico — Gratis</option>
                <option value="PRO">Profesional — $79.900/mes</option>
                <option value="ENTERPRISE">Empresarial — $249.900/mes</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#f1f5f9', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>← Atrás</button>
              <button onClick={handleRegister} disabled={loading} style={{ flex: 2, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Registrando...' : 'Crear Mi Negocio ✓'}
              </button>
            </div>
          </div>
        )}

        {/* PASO 3 — Confirmación + Pago */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Estado pendiente */}
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
              <p style={{ color: '#fde047', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Cuenta en revisión</p>
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Tu cuenta fue creada pero está pendiente de activación. Contáctanos para activarla.</p>
            </div>

            {/* Botón pago Bold */}
            <a href={BOLD_PAYMENT_URL} target="_blank" rel="noreferrer"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
              💳 Pagar con Bold
            </a>

            {/* WhatsApp */}
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`} target="_blank" rel="noreferrer"
              style={{ background: '#25d366', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
              💬 Confirmar por WhatsApp
            </a>

            {/* Info contacto */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: 6 }}>También puedes escribirnos a:</p>
              <p style={{ color: '#93c5fd', fontSize: 14, fontWeight: 600 }}>✉️ {CONTACT_EMAIL}</p>
              <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Una vez confirmado el pago, activaremos tu cuenta en menos de 24 horas.</p>
            </div>

            <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#f1f5f9', padding: '11px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              Ir al Login
            </button>
          </div>
        )}

        {step < 3 && (
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: '#475569' }}>
            ¿Ya tienes cuenta?{' '}
            <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Ingresar</button>
          </p>
        )}
      </div>
    </div>
  );
};

// ── ADMIN PANEL ───────────────────────────────────────────────────────────────
export const AdminPanel: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [newCompany, setNewCompany] = useState({ name: '', nit: '', email: '', phone: '', plan: 'BASIC', adminEmail: '', adminPassword: '' });

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    setCompanies(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setNewCompany(prev => ({ ...prev, [k]: e.target.value }));

  const handleCreate = async () => {
    if (!newCompany.name || !newCompany.nit || !newCompany.adminEmail || !newCompany.adminPassword) {
      toast.error('Completa todos los campos obligatorios'); return;
    }
    setCreating(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newCompany.adminEmail, password: newCompany.adminPassword,
        options: { data: { full_name: newCompany.name } }
      });
      if (authError) throw authError;

      const { data: company, error: companyError } = await supabase.from('companies').insert({
        name: newCompany.name, nit: newCompany.nit, email: newCompany.email, phone: newCompany.phone,
        subscription_plan: newCompany.plan, subscription_status: 'ACTIVE',
        config: { tax_rate: 19, currency_symbol: '$', invoice_prefix: 'POS' }
      }).select().single();
      if (companyError) throw companyError;

      if (authData.user) {
        await supabase.from('profiles').upsert({
          id: authData.user.id, company_id: company.id,
          role: 'ADMIN', full_name: newCompany.name, email: newCompany.adminEmail, is_active: true
        });
        const { data: branch } = await supabase.from('branches')
          .insert({ company_id: company.id, name: 'Sede Principal', is_active: true }).select().single();
        if (branch) await supabase.from('profiles').update({ branch_id: branch.id }).eq('id', authData.user.id);
      }

      toast.success(`Negocio "${newCompany.name}" creado y activado`);
      setShowCreate(false);
      setNewCompany({ name: '', nit: '', email: '', phone: '', plan: 'BASIC', adminEmail: '', adminPassword: '' });
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.from('companies').update({ subscription_status: status }).eq('id', id);
    toast.success(status === 'ACTIVE' ? 'Cuenta activada' : status === 'INACTIVE' ? 'Cuenta suspendida' : 'Actualizado');
    load();
  };

  const planColors: Record<string, string> = { BASIC: '#64748b', PRO: '#3b82f6', ENTERPRISE: '#8b5cf6' };
  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    ACTIVE:   { bg: '#dcfce7', color: '#16a34a', label: 'Activo' },
    INACTIVE: { bg: '#fee2e2', color: '#dc2626', label: 'Inactivo' },
    PENDING:  { bg: '#fef9c3', color: '#ca8a04', label: 'Pendiente' },
    PAST_DUE: { bg: '#ffedd5', color: '#ea580c', label: 'Vencido' },
  };

  const filtered = filterStatus === 'ALL' ? companies : companies.filter(c => c.subscription_status === filterStatus);

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#1e293b' };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {/* Top bar */}
      <div style={{ background: '#0a0f1e', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff' }}>PM</div>
          <span style={{ color: '#fff', fontWeight: 700 }}>POSmaster</span>
          <span style={{ color: '#475569', fontSize: 13, marginLeft: 8 }}>/ Panel Administrador</span>
        </div>
        <button onClick={onExit} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ← Volver a mi negocio
        </button>
      </div>

      <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Negocios', value: companies.length, color: '#3b82f6' },
            { label: 'Activos', value: companies.filter(c => c.subscription_status === 'ACTIVE').length, color: '#22c55e' },
            { label: 'Pendientes', value: companies.filter(c => c.subscription_status === 'PENDING').length, color: '#f59e0b' },
            { label: 'Plan PRO', value: companies.filter(c => c.subscription_plan === 'PRO').length, color: '#3b82f6' },
            { label: 'Enterprise', value: companies.filter(c => c.subscription_plan === 'ENTERPRISE').length, color: '#8b5cf6' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Header + filtros */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['ALL', 'PENDING', 'ACTIVE', 'INACTIVE'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: filterStatus === s ? '#0f172a' : '#fff', color: filterStatus === s ? '#fff' : '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {s === 'ALL' ? 'Todos' : s === 'PENDING' ? 'Pendientes' : s === 'ACTIVE' ? 'Activos' : 'Inactivos'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)} style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
            + Nuevo Negocio
          </button>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Negocio', 'NIT', 'Email', 'Plan', 'Estado', 'Creado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No hay registros</td></tr>
              ) : filtered.map(c => {
                const st = statusColors[c.subscription_status] || statusColors['INACTIVE'];
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>{c.name}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: 13 }}>{c.nit}</td>
                    <td style={{ padding: '14px 16px', color: '#64748b', fontSize: 13 }}>{c.email || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: planColors[c.subscription_plan] + '20', color: planColors[c.subscription_plan], padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{c.subscription_plan}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b', fontSize: 13 }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {c.subscription_status !== 'ACTIVE' && (
                          <button onClick={() => setStatus(c.id, 'ACTIVE')}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#16a34a' }}>
                            ✓ Activar
                          </button>
                        )}
                        {c.subscription_status === 'ACTIVE' && (
                          <button onClick={() => setStatus(c.id, 'INACTIVE')}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                            Suspender
                          </button>
                        )}
                        <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hola, tu cuenta ${c.name} en POSmaster ha sido activada. Ya puedes ingresar.`} target="_blank" rel="noreferrer"
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#16a34a', textDecoration: 'none' }}>
                          💬
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear negocio */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 24 }}>Crear Nuevo Negocio</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Nombre del Negocio *', key: 'name', placeholder: 'IPHONESHOP USA' },
                { label: 'NIT *', key: 'nit', placeholder: '900123456-7' },
                { label: 'Email del Negocio', key: 'email', placeholder: 'negocio@email.com' },
                { label: 'Teléfono', key: 'phone', placeholder: '300 123 4567' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>{field.label}</label>
                  <input value={(newCompany as any)[field.key]} onChange={f(field.key)} placeholder={field.placeholder} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Plan</label>
                <select value={newCompany.plan} onChange={f('plan')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="BASIC">Básico — Gratis</option>
                  <option value="PRO">Profesional — $79.900/mes</option>
                  <option value="ENTERPRISE">Empresarial — $249.900/mes</option>
                </select>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 12 }}>CREDENCIALES DEL ADMINISTRADOR</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Email Admin *</label>
                    <input type="email" value={newCompany.adminEmail} onChange={f('adminEmail')} placeholder="admin@negocio.com" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>Contraseña *</label>
                    <input type="password" value={newCompany.adminPassword} onChange={f('adminPassword')} placeholder="Mínimo 6 caracteres" style={inputStyle} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '11px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>Cancelar</button>
                <button onClick={handleCreate} disabled={creating} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: creating ? 0.7 : 1 }}>
                  {creating ? 'Creando...' : 'Crear Negocio'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};