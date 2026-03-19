import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { toast } from 'react-hot-toast';

const WHATSAPP_NUMBER = '573204884943';
const CONTACT_EMAIL = 'info@posmaster.org';
const BOLD_PAYMENT_URL_DEFAULT = 'https://checkout.bold.co/payment/LNK_U58X7N71NX';
const BOLD_PAYMENT_PRO_URL_DEFAULT = 'https://checkout.bold.co/payment/LNK_F385LJNMKI';
const EDGE_URL = `${(supabase as any).supabaseUrl}/functions/v1/master-admin-actions`;

// ── LANDING PAGE ─────────────────────────────────────────────────────────────
export const LandingPage: React.FC<{ onLogin: () => void; onRegister: () => void; onClientPortal?: () => void }> = ({ onLogin, onRegister, onClientPortal }) => {
  const [scrolled, setScrolled] = useState(false);
  const [activeBiz, setActiveBiz] = useState(0);
  const [boldBasicUrl, setBoldBasicUrl] = useState(BOLD_PAYMENT_URL_DEFAULT);
  const [boldProUrl,   setBoldProUrl]   = useState(BOLD_PAYMENT_PRO_URL_DEFAULT);

  // ── Precios dinámicos desde platform_settings ──────────────
  const [planPrices, setPlanPrices] = useState<Record<string, string>>({
    basic_price: '$65.000', pro_price: '$120.000', enterprise_price: '$249.900',
    basic_desc: 'Para negocios pequeños', pro_desc: 'Para negocios con varias sucursales',
    enterprise_desc: 'Empresas con facturación electrónica y API',
    basic_features: '1 Negocio · 1 sucursal,POS Completo,Inventario Ilimitado,Control de Caja,Servicio Técnico,Cartera / CxC,Soporte por WhatsApp',
    pro_features: 'Todo lo del Basic,Hasta 3 sucursales,Hasta 5 usuarios,Roles y permisos,PIN de acceso rápido,Dashboard avanzado,Soporte Prioritario',
    enterprise_features: 'Todo lo del Pro,Sucursales ilimitadas,Usuarios ilimitados,Facturación electrónica,API + Webhooks,Gerente de cuenta dedicado,SLA 99.9%',
  });

  useEffect(() => {
    supabase.from('platform_settings').select('key, value')
      .in('key', ['bold_basic_url', 'bold_pro_url',
                  'basic_price', 'pro_price', 'enterprise_price',
                  'basic_desc', 'pro_desc', 'enterprise_desc',
                  'basic_features', 'pro_features', 'enterprise_features'])
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data || []).forEach((row: any) => { if (row.value) map[row.key] = row.value; });
        if (map.bold_basic_url) setBoldBasicUrl(map.bold_basic_url);
        if (map.bold_pro_url)   setBoldProUrl(map.bold_pro_url);
        // Only update prices if they exist in DB
        const priceKeys = ['basic_price','pro_price','enterprise_price','basic_desc','pro_desc','enterprise_desc','basic_features','pro_features','enterprise_features'];
        const updates: Record<string,string> = {};
        priceKeys.forEach(k => { if (map[k]) updates[k] = map[k]; });
        if (Object.keys(updates).length > 0) setPlanPrices(prev => ({ ...prev, ...updates }));
      }).catch(() => {});
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setActiveBiz(p => (p + 1) % businesses.length), 2800);
    return () => clearInterval(t);
  }, []);

  const businesses = [
    { icon: '👟', label: 'Zapaterías',         color: '#f59e0b', desc: 'Reparaciones, pedidos y entregas' },
    { icon: '🐾', label: 'Veterinarias',        color: '#10b981', desc: 'Historial clínico y vacunas' },
    { icon: '💇', label: 'Salones de Belleza',  color: '#ec4899', desc: 'Servicios y estilistas' },
    { icon: '💊', label: 'Farmacias',           color: '#06b6d4', desc: 'Medicamentos y lotes' },
    { icon: '🔧', label: 'Servicio Técnico',    color: '#6366f1', desc: 'Equipos y diagnósticos' },
    { icon: '🍽️', label: 'Restaurantes',        color: '#ef4444', desc: 'Mesas, cocina y comandas' },
    { icon: '🦷', label: 'Odontología',         color: '#3b82f6', desc: 'Pacientes y citas' },
    { icon: '📱', label: 'Tecnología',          color: '#8b5cf6', desc: 'IMEI, reparaciones y garantías' },
  ];

  const bizModules = [
    {
      icon: '👟', name: 'Zapaterías & Marroquinería', color: '#f59e0b',
      items: ['Control de órdenes de reparación', 'Seguimiento por cliente y modelo', 'Registro de materiales usados', 'Estado del trabajo en tiempo real'],
    },
    {
      icon: '🐾', name: 'Clínicas Veterinarias', color: '#10b981',
      items: ['Historia clínica por mascota', 'Control de vacunas y desparasitación', 'Agenda de citas y consultas', 'Hospitalización y seguimiento'],
    },
    {
      icon: '💇', name: 'Salones de Belleza & Spa', color: '#ec4899',
      items: ['Gestión de servicios y paquetes', 'Comisiones por estilista', 'Control de productos usados', 'Agenda y reservas'],
    },
    {
      icon: '💊', name: 'Farmacias & Droguerías', color: '#06b6d4',
      items: ['Inventario con lotes y vencimientos', 'Alertas de stock mínimo', 'Registro de medicamentos controlados', 'Recetas y proveedores'],
    },
    {
      icon: '🔧', name: 'Servicio Técnico', color: '#6366f1',
      items: ['Órdenes de trabajo con diagnóstico', 'IMEI, serial y modelo del equipo', 'Técnico asignado y estado', 'Entrega y garantía'],
    },
    {
      icon: '🍽️', name: 'Restaurantes & Cafeterías', color: '#ef4444',
      items: ['Gestión de mesas en tiempo real', 'Comandas a cocina', 'Combos y modificadores', 'Display de cocina integrado'],
    },
  ];

  const plans = [
    {
      id: 'TRIAL', name: 'Prueba Gratis', price: 'Gratis', period: '7 días',
      color: '#10b981', borderColor: 'rgba(16,185,129,0.35)',
      badge: '🎁 Sin tarjeta',
      features: ['Acceso completo 7 días', 'POS Completo', 'Inventario', 'Control de Caja', 'Servicio Técnico', 'Sin compromiso'],
      cta: 'Probar Gratis',
    },
    {
      id: 'BASIC', name: 'Basic', price: planPrices.basic_price, period: '/mes',
      color: '#64748b', borderColor: 'rgba(100,116,139,0.3)',
      desc: planPrices.basic_desc,
      features: planPrices.basic_features.split(','),
      cta: 'Comenzar',
    },
    {
      id: 'PRO', name: 'Pro', price: planPrices.pro_price, period: '/mes',
      color: '#3b82f6', borderColor: 'rgba(59,130,246,0.5)',
      badge: '⭐ Más popular', popular: true,
      desc: planPrices.pro_desc,
      features: planPrices.pro_features.split(','),
      cta: 'Comenzar Ahora',
    },
    {
      id: 'ENTERPRISE', name: 'Enterprise', price: planPrices.enterprise_price, period: '/mes',
      color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.5)',
      badge: '🏢 Para grandes negocios', enterprise: true,
      desc: planPrices.enterprise_desc,
      features: planPrices.enterprise_features.split(','),
      cta: 'Contactar Ventas',
    },
  ];

  const painPoints = [
    { bad: '❌ Cuadernos y papelitos', good: '✅ Todo digital y organizado' },
    { bad: '❌ Excel desactualizado',  good: '✅ Inventario en tiempo real' },
    { bad: '❌ No saber cuánto vendes', good: '✅ Dashboard con tus métricas' },
    { bad: '❌ Clientes que deben sin control', good: '✅ Cartera / CxC integrada' },
    { bad: '❌ Reparaciones sin seguimiento', good: '✅ Órdenes con estado y técnico' },
    { bad: '❌ Caja cuadrada a ojo', good: '✅ Arqueo automático por turno' },
  ];

  const payments = [
    { name: 'Wompi', color: '#7c3aed' },
    { name: 'Bold', color: '#f59e0b' },
    { name: 'PayU', color: '#2563eb' },
    { name: 'PSE', color: '#059669' },
    { name: 'Datáfono', color: '#64748b' },
    { name: 'Efectivo', color: '#10b981' },
  ];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
    @keyframes fadeUp { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse-ring { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.18);opacity:0} }
    @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
    @keyframes glow-blue { 0%,100%{box-shadow:0 0 20px rgba(59,130,246,.3)} 50%{box-shadow:0 0 40px rgba(59,130,246,.6)} }
    .fade-up { animation: fadeUp .7s ease both; }
    .d1 { animation-delay:.1s } .d2{animation-delay:.22s} .d3{animation-delay:.35s} .d4{animation-delay:.5s} .d5{animation-delay:.65s}
    .plan-card:hover { transform:translateY(-4px); transition:transform .2s; }
    .biz-card:hover { border-color:rgba(255,255,255,.2) !important; background:rgba(255,255,255,.07) !important; }
    .feat-card:hover { border-color:rgba(59,130,246,.4) !important; }
  `;

  // Negocios en landing
  const [landingCompanies, setLandingCompanies] = React.useState<any[]>([]);
  React.useEffect(() => {
    supabase.from('companies')
      .select('id,name,logo_url,subscription_plan')
      .eq('show_in_landing', true)
      .eq('subscription_status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .then(({ data }) => setLandingCompanies(data || []));
  }, []);

  const C = {
    bg:   '#080d1a',
    bg2:  '#0d1426',
    card: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)',
    text:  '#f1f5f9',
    muted: '#64748b',
    dim:   '#94a3b8',
    blue:  '#3b82f6',
    violet:'#8b5cf6',
  };

  return (
    <div style={{ fontFamily:"'DM Sans','Segoe UI',sans-serif", background: C.bg, color: C.text, minHeight:'100vh', overflowX:'hidden' }}>
      <style>{css}</style>

      {/* ── NAV ── */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:100,
        background: scrolled ? 'rgba(8,13,26,0.97)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? `1px solid ${C.border}` : 'none',
        transition:'all .35s', padding:'0 6%',
        display:'flex', alignItems:'center', justifyContent:'space-between', height:64,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <img src="https://wdaabpbpxbbfhurvjvwj.supabase.co/storage/v1/object/public/company-logos/logo.png"
            alt="POSmaster" style={{height:34,width:'auto',filter:'brightness(0) invert(1)'}} />
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {onClientPortal && (
            <button onClick={onClientPortal} style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${C.border}`,color:C.dim,padding:'7px 16px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13}}>
              👤 Mis facturas
            </button>
          )}
          <button onClick={onLogin} style={{background:'transparent',border:`1px solid rgba(255,255,255,0.18)`,color:C.text,padding:'7px 18px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:13}}>
            Ingresar
          </button>
          <button onClick={onRegister} style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)',border:'none',color:'#fff',padding:'8px 20px',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:13,boxShadow:'0 0 18px rgba(99,102,241,.35)'}}>
            Registrarse
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        minHeight:'100vh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        textAlign:'center', padding:'100px 6% 80px', position:'relative', overflow:'hidden',
      }}>
        <div style={{position:'absolute',top:'15%',left:'20%',width:500,height:500,background:'radial-gradient(circle,rgba(59,130,246,0.12) 0%,transparent 70%)',pointerEvents:'none',borderRadius:'50%'}} />
        <div style={{position:'absolute',bottom:'20%',right:'15%',width:400,height:400,background:'radial-gradient(circle,rgba(139,92,246,0.1) 0%,transparent 70%)',pointerEvents:'none',borderRadius:'50%'}} />

        <div style={{position:'relative',zIndex:1,maxWidth:820}}>
          <div className="fade-up d1" style={{display:'inline-flex',alignItems:'center',gap:8,background:'rgba(59,130,246,0.12)',border:'1px solid rgba(59,130,246,0.25)',color:'#93c5fd',padding:'6px 18px',borderRadius:100,fontSize:13,fontWeight:600,marginBottom:28}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:'#3b82f6',display:'inline-block',boxShadow:'0 0 8px #3b82f6',animation:'pulse-ring 2s ease infinite'}} />
            🇨🇴 Hecho para negocios colombianos
          </div>

          <div className="fade-up d1" style={{display:'flex',justifyContent:'center',marginBottom:32}}>
            <img src="https://wdaabpbpxbbfhurvjvwj.supabase.co/storage/v1/object/public/company-logos/logo.png"
              alt="POSmaster" style={{height:200,width:'auto',filter:'drop-shadow(0 8px 32px rgba(99,102,241,0.45))'}} />
          </div>

          <h1 className="fade-up d2" style={{fontFamily:"'Syne',sans-serif",fontSize:'clamp(2.2rem,5.5vw,4.2rem)',fontWeight:800,lineHeight:1.08,marginBottom:16,letterSpacing:'-2px'}}>
            El sistema POS{' '}
            <span style={{background:'linear-gradient(135deg,#3b82f6,#a78bfa)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>especializado</span>
            <br/>para tu tipo de negocio
          </h1>

          <div className="fade-up d2" style={{marginBottom:20,height:52,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {businesses.map((b, i) => (
              <div key={i} style={{
                position:'absolute',
                opacity: activeBiz === i ? 1 : 0,
                transform: activeBiz === i ? 'translateY(0)' : 'translateY(12px)',
                transition:'all .4s ease',
                display:'flex',alignItems:'center',gap:10,
                background:`${b.color}18`,
                border:`1px solid ${b.color}40`,
                borderRadius:12,padding:'10px 20px',
              }}>
                <span style={{fontSize:22}}>{b.icon}</span>
                <div style={{textAlign:'left'}}>
                  <p style={{margin:0,fontWeight:700,fontSize:15,color:b.color}}>{b.label}</p>
                  <p style={{margin:0,fontSize:12,color:C.dim}}>{b.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="fade-up d3" style={{fontSize:'clamp(.95rem,1.8vw,1.15rem)',color:C.dim,lineHeight:1.75,margin:'0 auto 16px',maxWidth:560}}>
            Ventas, inventario, servicios, clientes y caja desde una sola plataforma.
            Sin complicaciones. Sin papelitos. Sin excusas.
          </p>

          <div className="fade-up d3" style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',marginBottom:40}}>
            {businesses.map((b,i) => (
              <button key={i} onClick={() => setActiveBiz(i)} style={{
                display:'flex',alignItems:'center',gap:6,
                padding:'6px 14px',borderRadius:100,border:`1px solid ${activeBiz===i ? b.color+'60' : C.border}`,
                background: activeBiz===i ? `${b.color}18` : 'transparent',
                color: activeBiz===i ? b.color : C.muted,
                cursor:'pointer',fontSize:13,fontWeight:600,transition:'all .2s',
              }}>
                <span>{b.icon}</span>{b.label}
              </button>
            ))}
          </div>

          <div className="fade-up d4" style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap',marginBottom:20}}>
            <button onClick={onRegister} style={{
              background:'linear-gradient(135deg,#3b82f6,#6366f1)',border:'none',color:'#fff',
              padding:'15px 36px',borderRadius:12,cursor:'pointer',fontWeight:700,fontSize:16,
              boxShadow:'0 0 32px rgba(99,102,241,.45)',animation:'glow-blue 3s ease infinite',
            }}>
              Probar 7 días gratis →
            </button>
            <button onClick={onLogin} style={{
              background:'rgba(255,255,255,0.05)',border:`1px solid rgba(255,255,255,0.15)`,
              color:C.text,padding:'15px 32px',borderRadius:12,cursor:'pointer',fontWeight:600,fontSize:16,
            }}>
              Ya tengo cuenta
            </button>
          </div>
          <p className="fade-up d5" style={{color:'#475569',fontSize:13}}>
            {`7 días gratis sin tarjeta • Planes desde ${planPrices.basic_price}/mes • Activación inmediata`}
          </p>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section style={{padding:'80px 6%',background:C.bg2}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:56}}>
            <p style={{color:C.blue,fontWeight:700,fontSize:13,letterSpacing:2,textTransform:'uppercase',marginBottom:12}}>¿Te identificas?</p>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:'clamp(1.6rem,3.5vw,2.4rem)',fontWeight:800,letterSpacing:'-1px',marginBottom:12}}>
              Problemas que POSmaster <span style={{color:C.blue}}>resuelve</span>
            </h2>
            <p style={{color:C.muted,fontSize:15,maxWidth:500,margin:'0 auto'}}>
              Muchos negocios colombianos aún trabajan así — y pierden plata sin saberlo
            </p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:16}}>
            {painPoints.map((p,i) => (
              <div key={i} style={{
                background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:'20px 24px',
                display:'flex',flexDirection:'column',gap:10,
              }}>
                <p style={{margin:0,color:'#f87171',fontSize:14,fontWeight:500}}>{p.bad}</p>
                <div style={{width:'100%',height:1,background:C.border}} />
                <p style={{margin:0,color:'#4ade80',fontSize:14,fontWeight:600}}>{p.good}</p>
              </div>
            ))}
          </div>
          <div style={{textAlign:'center',marginTop:40}}>
            <button onClick={onRegister} style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)',border:'none',color:'#fff',padding:'12px 32px',borderRadius:10,cursor:'pointer',fontWeight:700,fontSize:15}}>
              Solucionar todo con POSmaster →
            </button>
          </div>
        </div>
      </section>

      {/* ── MÓDULOS POR NEGOCIO ── */}
      <section style={{padding:'80px 6%'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:56}}>
            <p style={{color:C.violet,fontWeight:700,fontSize:13,letterSpacing:2,textTransform:'uppercase',marginBottom:12}}>Especialización</p>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:'clamp(1.6rem,3.5vw,2.4rem)',fontWeight:800,letterSpacing:'-1px',marginBottom:12}}>
              POSmaster se adapta a <span style={{color:C.violet}}>tu negocio</span>
            </h2>
            <p style={{color:C.muted,fontSize:15,maxWidth:520,margin:'0 auto'}}>
              Módulos especializados que ningún POS genérico tiene.
            </p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:20}}>
            {bizModules.map((biz,i) => (
              <div key={i} className="biz-card" style={{
                background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:'28px 24px',
                transition:'all .2s',cursor:'default',
              }}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
                  <div style={{width:48,height:48,borderRadius:14,background:`${biz.color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>
                    {biz.icon}
                  </div>
                  <h3 style={{fontWeight:700,fontSize:16,color:biz.color,margin:0}}>{biz.name}</h3>
                </div>
                <ul style={{listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:8}}>
                  {biz.items.map((item,j) => (
                    <li key={j} style={{display:'flex',alignItems:'center',gap:10,fontSize:14,color:C.dim}}>
                      <span style={{color:biz.color,fontWeight:700,flexShrink:0}}>▸</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{padding:'80px 6%',background:C.bg2}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:56}}>
            <p style={{color:C.blue,fontWeight:700,fontSize:13,letterSpacing:2,textTransform:'uppercase',marginBottom:12}}>Plataforma completa</p>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:'clamp(1.6rem,3.5vw,2.4rem)',fontWeight:800,letterSpacing:'-1px',marginBottom:12}}>
              Todo lo que tu negocio necesita
            </h2>
            <p style={{color:C.muted,fontSize:15}}>Sin complicaciones. Sin módulos que nunca usarás.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:20}}>
            {[
              { icon:'🏪', title:'Punto de Venta', desc:'POS rápido con soporte de código de barras, IMEI, pagos mixtos y ventas con cuota.',color:'#3b82f6' },
              { icon:'📦', title:'Inventario Inteligente', desc:'Stock en tiempo real, alertas de mínimos, fotos de producto y control por categoría.',color:'#10b981' },
              { icon:'🔧', title:'Servicio Técnico', desc:'Órdenes de reparación con técnico asignado, diagnóstico, IMEI y seguimiento de estado.',color:'#6366f1' },
              { icon:'💰', title:'Control de Caja', desc:'Apertura, cierre y arqueo de turnos con historial detallado y conciliación automática.',color:'#f59e0b' },
              { icon:'📊', title:'Dashboard', desc:'Métricas reales de ventas, utilidad estimada, rendimiento por sucursal y por período.',color:'#ec4899' },
              { icon:'🤝', title:'Cartera / CxC', desc:'Controla deudas, cuentas por cobrar, pagos parciales y envía recordatorios por WhatsApp.',color:'#06b6d4' },
              { icon:'👥', title:'Historial de Clientes', desc:'Perfil completo por cliente: compras, deudas, categoría VIP/Frecuente y contacto directo.',color:'#8b5cf6' },
              { icon:'📄', title:'Facturación', desc:'Facturas con número consecutivo, IVA configurable, descuentos y envío por WhatsApp o email.',color:'#ef4444' },
            ].map((f,i) => (
              <div key={i} className="feat-card" style={{
                background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:'24px 22px',
                transition:'border-color .2s',cursor:'default',
              }}>
                <div style={{width:44,height:44,borderRadius:12,background:`${f.color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,marginBottom:14}}>
                  {f.icon}
                </div>
                <h3 style={{fontWeight:700,fontSize:16,marginBottom:8,color:C.text}}>{f.title}</h3>
                <p style={{color:C.muted,fontSize:13.5,lineHeight:1.65,margin:0}}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAGOS COLOMBIA ── */}
      <section style={{padding:'60px 6%'}}>
        <div style={{maxWidth:900,margin:'0 auto',textAlign:'center'}}>
          <p style={{color:C.muted,fontSize:13,fontWeight:600,letterSpacing:2,textTransform:'uppercase',marginBottom:12}}>Integración de pagos</p>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:'clamp(1.4rem,3vw,2rem)',fontWeight:800,letterSpacing:'-1px',marginBottom:8}}>
            Compatible con todos los medios de pago en Colombia
          </h2>
          <p style={{color:C.muted,fontSize:14,marginBottom:36}}>Acepta cómo quieran pagar tus clientes, sin complicaciones</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:14,justifyContent:'center'}}>
            {payments.map((p,i) => (
              <div key={i} style={{
                padding:'12px 24px',borderRadius:12,
                background:`${p.color}12`,border:`1px solid ${p.color}35`,
                color:p.color,fontWeight:700,fontSize:15,
              }}>
                {p.name}
              </div>
            ))}
          </div>
          <p style={{color:'#475569',fontSize:13,marginTop:20}}>
            También: transferencias, QR, fiado registrado, pagos mixtos y más
          </p>
        </div>
      </section>

      {/* ── CLIENTES ── */}
      {landingCompanies.length > 0 && (
        <section style={{padding:'56px 6%', background: C.bg, borderTop:`1px solid ${C.border}`}}>
          <div style={{maxWidth:1100,margin:'0 auto',textAlign:'center'}}>
            <p style={{color:C.muted,fontSize:12,fontWeight:700,letterSpacing:3,textTransform:'uppercase',marginBottom:28}}>
              Negocios que confían en POSmaster
            </p>
            <div style={{
              display:'flex', flexWrap:'wrap', gap:20,
              justifyContent:'center', alignItems:'center',
            }}>
              {landingCompanies.map(c => (
                <div key={c.id} style={{
                  display:'flex', alignItems:'center', gap:10,
                  background:'rgba(255,255,255,0.04)',
                  border:'1px solid rgba(255,255,255,0.08)',
                  borderRadius:12, padding:'10px 18px',
                  transition:'all 0.2s',
                }}>
                  {c.logo_url ? (
                    <img src={c.logo_url} alt={c.name}
                      style={{width:32,height:32,borderRadius:8,objectFit:'cover',background:'#fff'}} />
                  ) : (
                    <div style={{
                      width:32,height:32,borderRadius:8,
                      background:'linear-gradient(135deg,#3b82f6,#6366f1)',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:13,fontWeight:800,color:'#fff',flexShrink:0,
                    }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span style={{color:'#cbd5e1',fontSize:13,fontWeight:600,whiteSpace:'nowrap'}}>
                    {c.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── PLANES ── */}
      <section style={{padding:'80px 6%',background:C.bg2}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:56}}>
            <p style={{color:C.blue,fontWeight:700,fontSize:13,letterSpacing:2,textTransform:'uppercase',marginBottom:12}}>Precios</p>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:'clamp(1.6rem,3.5vw,2.4rem)',fontWeight:800,letterSpacing:'-1px',marginBottom:12}}>
              Planes y precios
            </h2>
            <p style={{color:C.muted,fontSize:15}}>Empieza gratis 7 días. Crece cuando lo necesites.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>
            {plans.map(plan => (
              <div key={plan.id} className="plan-card" style={{
                background: (plan as any).enterprise
                  ? 'linear-gradient(135deg,rgba(139,92,246,.12),rgba(109,40,217,.08))'
                  : (plan as any).popular
                  ? 'linear-gradient(135deg,rgba(59,130,246,.1),rgba(99,102,241,.08))'
                  : C.card,
                border:`${ (plan as any).popular || (plan as any).enterprise ? '2' : '1'}px solid ${plan.borderColor}`,
                borderRadius:20,padding:'26px 20px',position:'relative',
                display:'flex',flexDirection:'column',
              }}>
                {(plan as any).popular && (
                  <div style={{position:'absolute',top:-13,left:'50%',transform:'translateX(-50%)',background:'linear-gradient(135deg,#3b82f6,#6366f1)',color:'#fff',padding:'4px 16px',borderRadius:100,fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>
                    MÁS POPULAR
                  </div>
                )}
                {(plan as any).enterprise && (
                  <div style={{position:'absolute',top:-13,left:'50%',transform:'translateX(-50%)',background:'linear-gradient(135deg,#8b5cf6,#6d28d9)',color:'#fff',padding:'4px 16px',borderRadius:100,fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>
                    🏢 ENTERPRISE
                  </div>
                )}
                <div style={{marginBottom:8}}>
                  <h3 style={{fontWeight:700,fontSize:18,marginBottom:4,color:plan.color}}>{plan.name}</h3>
                  {(plan as any).desc && <p style={{fontSize:12,color:C.muted,margin:'0 0 12px'}}>{(plan as any).desc}</p>}
                  <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                    <span style={{fontSize:34,fontWeight:900,letterSpacing:'-1px'}}>{plan.price}</span>
                    <span style={{color:C.muted,fontSize:14}}>{plan.period}</span>
                  </div>
                </div>
                <ul style={{listStyle:'none',padding:0,margin:'0 0 28px',flex:1}}>
                  {plan.features.map((feat,i) => (
                    <li key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:9,fontSize:13.5,color:'#cbd5e1'}}>
                      <span style={{color:(plan as any).enterprise ? '#a78bfa' : '#22c55e',fontWeight:700,flexShrink:0}}>✓</span>{feat}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => (plan as any).enterprise
                    ? window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=Hola%2C+quiero+información+sobre+el+plan+Enterprise+de+POSmaster`, '_blank')
                    : onRegister()}
                  style={{
                    background:(plan as any).enterprise
                      ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)'
                      : (plan as any).popular
                      ? 'linear-gradient(135deg,#3b82f6,#6366f1)'
                      : 'rgba(255,255,255,0.08)',
                    border:'none',color:'#fff',padding:'12px 24px',borderRadius:10,
                    cursor:'pointer',fontWeight:700,fontSize:15,width:'100%',
                  }}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARATIVA ── */}
      <section style={{padding:'60px 6%'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <h2 style={{fontFamily:"'Syne',sans-serif",textAlign:'center',fontSize:'clamp(1.4rem,3vw,2rem)',fontWeight:800,marginBottom:8,letterSpacing:'-1px'}}>
            Comparativa de planes
          </h2>
          <p style={{textAlign:'center',color:C.muted,marginBottom:40,fontSize:14}}>Todo lo que incluye cada plan</p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',background:C.card,borderRadius:16,overflow:'hidden',border:`1px solid ${C.border}`}}>
              <thead>
                <tr>
                  <th style={{padding:'15px 20px',textAlign:'left',color:C.dim,fontSize:13,fontWeight:600,borderBottom:`1px solid ${C.border}`}}>Función</th>
                  {[{name:'Basic',color:'#64748b'},{name:'Pro',color:'#3b82f6'},{name:'Enterprise',color:'#8b5cf6'}].map(p => (
                    <th key={p.name} style={{padding:'15px 20px',textAlign:'center',color:p.color,fontSize:15,fontWeight:800,borderBottom:`1px solid ${C.border}`,minWidth:110}}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {feature:'POS y ventas',basic:'✅',pro:'✅',enterprise:'✅'},
                  {feature:'Inventario ilimitado',basic:'✅',pro:'✅',enterprise:'✅'},
                  {feature:'Control de caja',basic:'✅',pro:'✅',enterprise:'✅'},
                  {feature:'Servicio técnico',basic:'✅',pro:'✅',enterprise:'✅'},
                  {feature:'Cartera / CxC',basic:'✅',pro:'✅',enterprise:'✅'},
                  {feature:'Historial de clientes',basic:'✅',pro:'✅',enterprise:'✅'},
                  {feature:'Módulos especializados',basic:'✅',pro:'✅',enterprise:'✅'},
                  {feature:'Sucursales',basic:'1',pro:'Hasta 3',enterprise:'Ilimitadas'},
                  {feature:'Usuarios / colaboradores',basic:'1 admin',pro:'Hasta 5',enterprise:'Ilimitados'},
                  {feature:'Roles y permisos',basic:'❌',pro:'✅',enterprise:'✅'},
                  {feature:'PIN de acceso rápido',basic:'❌',pro:'✅',enterprise:'✅'},
                  {feature:'Dashboard multi-sucursal',basic:'❌',pro:'✅',enterprise:'✅'},
                  {feature:'Facturación electrónica',basic:'❌',pro:'❌',enterprise:'✅'},
                  {feature:'API + Webhooks',basic:'❌',pro:'❌',enterprise:'✅'},
                  {feature:'Gerente de cuenta',basic:'❌',pro:'❌',enterprise:'✅'},
                  {feature:'SLA uptime',basic:'99%',pro:'99.5%',enterprise:'99.9%'},
                  {feature:'Soporte',basic:'WhatsApp',pro:'Prioritario',enterprise:'Dedicado'},
                ].map((row,i) => (
                  <tr key={i} style={{background:i%2===0?'transparent':'rgba(255,255,255,0.02)'}}>
                    <td style={{padding:'12px 20px',fontSize:13.5,color:'#cbd5e1',borderBottom:`1px solid rgba(255,255,255,0.04)`}}>{row.feature}</td>
                    <td style={{padding:'12px 20px',textAlign:'center',fontSize:13.5,color:C.dim,borderBottom:`1px solid rgba(255,255,255,0.04)`}}>{row.basic}</td>
                    <td style={{padding:'12px 20px',textAlign:'center',fontSize:13.5,color:'#60a5fa',borderBottom:`1px solid rgba(255,255,255,0.04)`,fontWeight:row.pro==='✅'?700:400}}>{row.pro}</td>
                    <td style={{padding:'12px 20px',textAlign:'center',fontSize:13.5,color:'#a78bfa',borderBottom:`1px solid rgba(255,255,255,0.04)`,fontWeight:row.enterprise==='✅'?700:400}}>{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{padding:'80px 6%',background:C.bg2}}>
        <div style={{
          maxWidth:700,margin:'0 auto',textAlign:'center',
          background:'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(139,92,246,0.08))',
          border:`1px solid rgba(99,102,241,0.25)`,
          borderRadius:28,padding:'56px 40px',
        }}>
          <div style={{fontSize:48,marginBottom:16}}>🚀</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:'clamp(1.6rem,3.5vw,2.2rem)',fontWeight:800,letterSpacing:'-1px',marginBottom:12}}>
            Empieza hoy sin riesgo
          </h2>
          <p style={{color:C.dim,fontSize:16,lineHeight:1.7,marginBottom:36}}>
            7 días de acceso completo. Sin tarjeta de crédito.<br/>
            Configuración en menos de 5 minutos.
          </p>
          <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap',marginBottom:24}}>
            <button onClick={onRegister} style={{
              background:'linear-gradient(135deg,#3b82f6,#6366f1)',border:'none',
              color:'#fff',padding:'15px 40px',borderRadius:12,cursor:'pointer',
              fontWeight:700,fontSize:16,boxShadow:'0 0 30px rgba(99,102,241,.4)',
            }}>
              Crear mi cuenta gratis
            </button>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hola%2C+quiero+información+sobre+POSmaster`}
              target="_blank" rel="noreferrer"
              style={{
                background:'#25d366',border:'none',color:'#fff',
                padding:'15px 32px',borderRadius:12,cursor:'pointer',
                fontWeight:700,fontSize:16,textDecoration:'none',display:'flex',alignItems:'center',gap:8,
              }}>
              💬 Hablar por WhatsApp
            </a>
          </div>
          <div style={{display:'flex',gap:24,justifyContent:'center',flexWrap:'wrap'}}>
            {['✓ Sin tarjeta requerida','✓ Activación inmediata','✓ Soporte en español','✓ Hecho para Colombia'].map((t,i) => (
              <span key={i} style={{color:C.muted,fontSize:13,fontWeight:500}}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section style={{padding:'50px 6%',maxWidth:580,margin:'0 auto',textAlign:'center'}}>
        <h2 style={{fontSize:20,fontWeight:800,marginBottom:10}}>¿Tienes preguntas?</h2>
        <p style={{color:C.muted,marginBottom:28,fontSize:14}}>Contáctanos directamente y te ayudamos a elegir el plan ideal para tu negocio.</p>
        <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap'}}>
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hola,%20quiero%20información%20sobre%20POSmaster`}
            target="_blank" rel="noreferrer"
            style={{background:'#25d366',color:'#fff',padding:'11px 22px',borderRadius:10,fontWeight:700,fontSize:14,textDecoration:'none',display:'flex',alignItems:'center',gap:8}}>
            💬 WhatsApp
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`}
            style={{background:'rgba(255,255,255,0.07)',border:`1px solid ${C.border}`,color:C.text,padding:'11px 22px',borderRadius:10,fontWeight:700,fontSize:14,textDecoration:'none'}}>
            ✉️ {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{borderTop:`1px solid ${C.border}`,padding:'36px 6%',textAlign:'center',color:'#475569',fontSize:13}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:10}}>
          <div style={{width:28,height:28,background:'linear-gradient(135deg,#3b82f6,#8b5cf6)',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:11,color:'#fff'}}>PM</div>
          <span style={{fontWeight:700,color:C.dim}}>POSmaster</span>
        </div>
        <p style={{margin:'0 0 6px'}}>Hecho con ❤️ para negocios colombianos</p>
        <p style={{margin:0}}>© 2026 POSmaster. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
};

// ── REGISTER PAGE ─────────────────────────────────────────────────────────────
export const RegisterPage: React.FC<{ onBack: () => void; onSuccess: () => void }> = ({ onBack, onSuccess }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    businessName: '', nit: '', phone: '', address: '', plan: 'BASIC',
    businessType: 'general'
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

      const { data: company, error: companyError } = await supabase
        .from('companies').insert({
          name: form.businessName, nit: form.nit, phone: form.phone,
          address: form.address, email: form.email,
          subscription_plan: form.plan,
          subscription_status: 'PENDING',
          config: { tax_rate: 19, currency_symbol: '$', invoice_prefix: 'POS', business_type: form.businessType, business_types: [form.businessType] }
        }).select().single();
      if (companyError) throw companyError;

      // onConflict:'id' garantiza que si el trigger ya creó el perfil, se actualiza con company_id
      await supabase.from('profiles').upsert({
        id: authData.user.id, company_id: company.id,
        role: 'ADMIN', full_name: form.businessName,
        email: form.email, is_active: true
      }, { onConflict: 'id' });

      // Actualizar metadata del JWT con company_id y role
      await supabase.auth.updateUser({
        data: { company_id: company.id, role: 'ADMIN', full_name: form.businessName }
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
            {step === 0 ? 'Elige tu plan' : step === 3 ? '¡Registro exitoso!' : 'Crear cuenta en POSmaster'}
          </h1>
          {step > 0 && step < 3 && <p style={{ color: '#64748b', fontSize: 14 }}>Paso {step} de 2</p>}
          {step > 0 && step < 3 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
              {[1, 2].map(s => (
                <div key={s} style={{ height: 4, width: 60, borderRadius: 2, background: s <= step ? '#3b82f6' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
              ))}
            </div>
          )}
        </div>

        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { id: 'TRIAL',      icon: '🎁', name: '7 días gratis',     price: 'Gratis',          desc: 'Prueba completa sin tarjeta',                  color: '#10b981', border: 'rgba(16,185,129,0.4)' },
              { id: 'BASIC',      icon: '📦', name: 'Basic',             price: planPrices.basic_price+'/mes',      desc: planPrices.basic_desc,      color: '#64748b', border: 'rgba(100,116,139,0.4)' },
              { id: 'PRO',        icon: '⭐', name: 'Pro',               price: planPrices.pro_price+'/mes',        desc: planPrices.pro_desc,        color: '#3b82f6', border: 'rgba(59,130,246,0.5)',  popular: true },
              { id: 'ENTERPRISE', icon: '🏢', name: 'Enterprise',        price: planPrices.enterprise_price+'/mes', desc: planPrices.enterprise_desc, color: '#8b5cf6', border: 'rgba(139,92,246,0.5)' },
            ].map(p => (
              <button key={p.id} onClick={() => { setForm(prev => ({ ...prev, plan: p.id })); setStep(1); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 18px',
                  background: 'rgba(255,255,255,0.04)', border: `2px solid ${p.border}`,
                  borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  position: 'relative', overflow: 'hidden',
                }}>
                {(p as any).popular && (
                  <span style={{ position: 'absolute', top: 8, right: 10, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>MÁS POPULAR</span>
                )}
                <span style={{ fontSize: 26 }}>{p.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 15, color: p.color, margin: 0 }}>{p.name}</p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>{p.desc}</p>
                </div>
                <span style={{ fontWeight: 800, fontSize: 14, color: '#f1f5f9', whiteSpace: 'nowrap' }}>{p.price}</span>
              </button>
            ))}
            <p style={{ textAlign: 'center', fontSize: 12, color: '#475569', marginTop: 4 }}>
              ¿Ya tienes cuenta?{' '}
              <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Ingresar</button>
            </p>
          </div>
        )}

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

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>Nombre del Negocio *</label><input value={form.businessName} onChange={f('businessName')} placeholder="Ej: IPHONESHOP USA" style={inputStyle} /></div>
            <div><label style={labelStyle}>NIT / Cédula *</label><input value={form.nit} onChange={f('nit')} placeholder="900123456-7" style={inputStyle} /></div>
            <div><label style={labelStyle}>Teléfono</label><input value={form.phone} onChange={f('phone')} placeholder="300 123 4567" style={inputStyle} /></div>
            <div><label style={labelStyle}>Dirección</label><input value={form.address} onChange={f('address')} placeholder="Calle 123 # 45-67" style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Tipo de negocio</label>
              <select value={form.businessType} onChange={f('businessType')} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="general">🏪 Tienda General</option>
                <option value="tienda_tecnologia">📱 Tecnología / Celulares</option>
                <option value="restaurante">🍽️ Restaurante / Cafetería</option>
                <option value="ropa">👗 Ropa / Calzado</option>
                <option value="zapateria">👟 Zapatería / Marroquinería</option>
                <option value="ferreteria">🔧 Ferretería / Construcción</option>
                <option value="farmacia">💊 Farmacia / Droguería</option>
                <option value="supermercado">🛒 Supermercado / Abarrotes</option>
                <option value="salon">💇 Salón de Belleza / Spa</option>
                <option value="odontologia">🦷 Consultorio Odontológico</option>
                <option value="otro">📦 Otro</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Plan</label>
              <select value={form.plan} onChange={f('plan')} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="TRIAL">🎁 7 días gratis — Sin tarjeta</option>
                <option value="BASIC">Basic — $65.000/mes</option>
                <option value="PRO">Pro — $120.000/mes ⭐</option>
                <option value="ENTERPRISE">Enterprise — $249.900/mes 🏢</option>
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

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
              <p style={{ color: '#fde047', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Cuenta en revisión</p>
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Tu cuenta fue creada pero está pendiente de activación. Contáctanos para activarla.</p>
            </div>
            <a href={boldBasicUrl} target="_blank" rel="noreferrer"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
              💳 Pagar con Bold
            </a>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`} target="_blank" rel="noreferrer"
              style={{ background: '#25d366', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
              💬 Confirmar por WhatsApp
            </a>
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

        {step > 0 && step < 3 && (
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: '#475569' }}>
            ¿Ya tienes cuenta?{' '}
            <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>Ingresar</button>
          </p>
        )}
      </div>
    </div>
  );
};

// ── USER MANAGEMENT PANEL ─────────────────────────────────────────────────────
const UserManagementPanel: React.FC<{ company: any; onClose: () => void }> = ({ company, onClose }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [action, setAction] = useState<{ type: string; userId: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_active, created_at')
        .eq('company_id', company.id);
      setUsers(profiles || []);
      setLoading(false);
    };
    load();
  }, [company.id]);

  const callEdge = async (payload: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error en la operación');
    return json;
  };

  const handleAction = async () => {
    if (!action) return;
    setWorking(true);
    try {
      if (action.type === 'recovery') {
        await callEdge({ action: 'send_recovery', user_id: action.userId });
        toast.success(`Correo de recuperación enviado a ${action.email}`);
      } else if (action.type === 'password') {
        if (!newPassword || newPassword.length < 6) { toast.error('Mínimo 6 caracteres'); setWorking(false); return; }
        await callEdge({ action: 'set_password', user_id: action.userId, new_password: newPassword });
        toast.success('Contraseña actualizada');
        setNewPassword('');
      } else if (action.type === 'email') {
        if (!newEmail.includes('@')) { toast.error('Email inválido'); setWorking(false); return; }
        await callEdge({ action: 'change_email', user_id: action.userId, new_email: newEmail });
        toast.success('Correo de login actualizado');
        setUsers(prev => prev.map(u => u.id === action.userId ? { ...u, email: newEmail } : u));
        setNewEmail('');
      }
      setAction(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', borderRadius: '20px 20px 0 0' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, textTransform: 'uppercase' }}>Gestión de Usuarios</p>
            <h3 style={{ margin: '4px 0 0', fontWeight: 800, fontSize: 18, color: '#fff' }}>{company.name}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 16, color: '#fff' }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Cargando usuarios...</p>
          ) : users.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No hay usuarios registrados</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {users.map(user => (
                <div key={user.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{user.full_name || '—'}</p>
                      <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 13 }}>{user.email}</p>
                      <span style={{ background: user.role === 'ADMIN' ? '#dbeafe' : '#f1f5f9', color: user.role === 'ADMIN' ? '#2563eb' : '#64748b', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{user.role}</span>
                    </div>
                    <span style={{ background: user.is_active ? '#dcfce7' : '#fee2e2', color: user.is_active ? '#16a34a' : '#dc2626', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                      {user.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setAction({ type: 'recovery', userId: user.id, email: user.email })}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#2563eb' }}>
                      📤 Enviar recuperación
                    </button>
                    <button onClick={() => setAction({ type: 'password', userId: user.id, email: user.email })}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e9d5ff', background: '#f5f3ff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>
                      🔒 Cambiar contraseña
                    </button>
                    <button onClick={() => setAction({ type: 'email', userId: user.id, email: user.email })}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fed7aa', background: '#fff7ed', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#ea580c' }}>
                      ✉️ Cambiar correo
                    </button>
                  </div>

                  {/* Sub-panel acción */}
                  {action?.userId === user.id && (
                    <div style={{ marginTop: 12, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      {action.type === 'recovery' && (
                        <div>
                          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>
                            Se enviará un correo de recuperación a <strong>{user.email}</strong>
                          </p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setAction(null)} style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>Cancelar</button>
                            <button onClick={handleAction} disabled={working}
                              style={{ flex: 2, padding: '8px', border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: working ? 0.7 : 1 }}>
                              {working ? 'Enviando...' : '📤 Enviar correo'}
                            </button>
                          </div>
                        </div>
                      )}
                      {action.type === 'password' && (
                        <div>
                          <input
                            type="password" placeholder="Nueva contraseña (mín. 6 caracteres)"
                            value={newPassword} onChange={e => setNewPassword(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' as const, outline: 'none' }}
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setAction(null); setNewPassword(''); }} style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>Cancelar</button>
                            <button onClick={handleAction} disabled={working}
                              style={{ flex: 2, padding: '8px', border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: working ? 0.7 : 1 }}>
                              {working ? 'Guardando...' : '🔒 Establecer contraseña'}
                            </button>
                          </div>
                        </div>
                      )}
                      {action.type === 'email' && (
                        <div>
                          <input
                            type="email" placeholder="Nuevo correo de login"
                            value={newEmail} onChange={e => setNewEmail(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' as const, outline: 'none' }}
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setAction(null); setNewEmail(''); }} style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#64748b' }}>Cancelar</button>
                            <button onClick={handleAction} disabled={working || !newEmail.includes('@')}
                              style={{ flex: 2, padding: '8px', border: 'none', borderRadius: 8, background: '#ea580c', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: (working || !newEmail.includes('@')) ? 0.7 : 1 }}>
                              {working ? 'Actualizando...' : '✉️ Cambiar correo'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── ADMIN PANEL ───────────────────────────────────────────────────────────────
export const AdminPanel: React.FC<{ onExit: () => void; onPreview: (companyId: string) => void }> = ({ onExit, onPreview }) => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showConfirmPayment, setShowConfirmPayment] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [userMgmtCompany, setUserMgmtCompany] = useState<any>(null);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'clients' | 'contracts' | 'payment_links' | 'plan_pricing'>('clients');
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [savingLinks,  setSavingLinks]  = useState(false);
  const [pricingData,  setPricingData]  = useState<Record<string, string>>({
    basic_price: '$65.000', pro_price: '$120.000', enterprise_price: '$249.900',
    basic_desc: 'Para negocios pequeños', pro_desc: 'Para negocios con varias sucursales',
    enterprise_desc: 'Empresas con facturación electrónica y API',
    basic_features: '1 Negocio · 1 sucursal,POS Completo,Inventario Ilimitado,Control de Caja,Servicio Técnico,Cartera / CxC,Soporte por WhatsApp',
    pro_features: 'Todo lo del Basic,Hasta 3 sucursales,Hasta 5 usuarios,Roles y permisos,PIN de acceso rápido,Dashboard avanzado,Soporte Prioritario',
    enterprise_features: 'Todo lo del Pro,Sucursales ilimitadas,Usuarios ilimitados,Facturación electrónica,API + Webhooks,Gerente de cuenta dedicado,SLA 99.9%',
  });
  const [savingPricing, setSavingPricing] = useState(false);

  const loadPricingData = async () => {
    const { data } = await supabase.from('platform_settings').select('key, value')
      .in('key', ['basic_price','pro_price','enterprise_price','basic_desc','pro_desc','enterprise_desc','basic_features','pro_features','enterprise_features']);
    if (data && data.length > 0) {
      const map: Record<string, string> = {};
      data.forEach((row: any) => { map[row.key] = row.value; });
      setPricingData(prev => ({ ...prev, ...map }));
    }
  };

  const loadPaymentLinks = async () => {
    const { data } = await supabase.from('platform_settings').select('key, value').eq('category', 'payment');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((row: any) => { map[row.key] = row.value; });
      setPaymentLinks(map);
    }
  };

  const [newCompany, setNewCompany] = useState({
    name: '', nit: '', email: '', phone: '', plan: 'BASIC',
    adminEmail: '', adminPassword: '',
    subscription_start_date: new Date().toISOString().split('T')[0],
    subscription_end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  });
  const FEATURE_DEFS_LP = [
    { id: 'credit_notes',    label: 'Devoluciones / NC',          cat: 'Ventas',     defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'quotes',          label: 'Cotizaciones',                cat: 'Ventas',     defaultPlans: ['BASIC','PRO','ENTERPRISE','TRIAL'] },
    { id: 'dian',            label: 'Facturación DIAN',            cat: 'Ventas',     defaultPlans: ['ENTERPRISE'] },
    { id: 'variants',        label: 'Variantes de producto',       cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'purchase_orders', label: 'Órdenes de compra',           cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'weighable',       label: 'Productos pesables',          cat: 'Inventario', defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'nomina',          label: 'Nómina y dotación',           cat: 'Finanzas',   defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'cash_expenses',   label: 'Egresos de caja',             cat: 'Finanzas',   defaultPlans: ['BASIC','PRO','ENTERPRISE','TRIAL'] },
    { id: 'restaurant',      label: 'Módulo Restaurante',          cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'salon',           label: 'Módulo Salón',                cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'dental',          label: 'Módulo Odontología',          cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'vet',             label: 'Módulo Veterinaria',          cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'pharmacy',        label: 'Módulo Farmacia',             cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'shoe_repair',     label: 'Módulo Zapatería',            cat: 'Módulos',    defaultPlans: ['PRO','ENTERPRISE'] },
    { id: 'catalog',         label: 'Catálogo WhatsApp',           cat: 'Marketing',  defaultPlans: ['BASIC','PRO','ENTERPRISE'] },
    { id: 'branding',        label: 'Personalización marca',       cat: 'Marketing',  defaultPlans: ['PRO','ENTERPRISE'] },
  ];

  const getDefaultFlagsLP = (plan: string): Record<string,boolean> => {
    const flags: Record<string,boolean> = {};
    FEATURE_DEFS_LP.forEach(f => { flags[f.id] = f.defaultPlans.includes(plan); });
    return flags;
  };

  const [editForm, setEditForm] = useState({
    name: '', nit: '', email: '', phone: '', plan: 'BASIC',
    subscription_status: 'ACTIVE',
    subscription_start_date: '', subscription_end_date: '',
    feature_flags: {} as Record<string,boolean>,
    show_in_landing: false,
  });

  const load = async () => {
    setLoading(true);
    loadPaymentLinks();
    loadPricingData();
    const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    try {
      const { data: contractsData } = await supabase.from('contracts').select('*').order('created_at', { ascending: false });
      setContracts(contractsData || []);
      const { data: notifs } = await supabase.from('admin_notifications').select('*').eq('is_read', false).order('created_at', { ascending: false }).limit(20);
      setNotifications(notifs || []);
    } catch (_) {}
    setCompanies(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('contracts-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contracts', filter: 'status=eq.SIGNED' },
        (payload: any) => {
          setContracts(prev => prev.map(c => c.id === payload.new.id ? payload.new : c));
          setNotifications(prev => [{
            id: payload.new.id, type: 'CONTRACT_SIGNED',
            title: '✍️ Contrato firmado',
            message: `${payload.new.client_name} firmó el contrato del plan ${payload.new.plan}`,
            is_read: false, created_at: payload.new.signed_at,
          }, ...prev]);
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (companies.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    companies.forEach(async (c) => {
      if (c.subscription_end_date && c.subscription_end_date < today && c.subscription_status === 'ACTIVE') {
        await supabase.from('companies').update({ subscription_status: 'PAST_DUE' }).eq('id', c.id);
      }
    });
  }, [companies]);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setNewCompany(prev => ({ ...prev, [k]: e.target.value }));
  const fe = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditForm(prev => ({ ...prev, [k]: e.target.value }));

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
        subscription_start_date: newCompany.subscription_start_date,
        subscription_end_date: newCompany.subscription_end_date,
        config: { tax_rate: 19, currency_symbol: '$', invoice_prefix: 'POS' }
      }).select().single();
      if (companyError) throw companyError;
      if (authData.user) {
        // onConflict:'id' garantiza que si el trigger ya creó el perfil, se actualiza con company_id
        await supabase.from('profiles').upsert({
          id: authData.user.id, company_id: company.id,
          role: 'ADMIN', full_name: newCompany.name, email: newCompany.adminEmail, is_active: true
        }, { onConflict: 'id' });
        const { data: branch } = await supabase.from('branches')
          .insert({ company_id: company.id, name: 'Sede Principal', is_active: true }).select().single();
        if (branch) await supabase.from('profiles').update({ branch_id: branch.id }).eq('id', authData.user.id);
      }
      toast.success(`Negocio "${newCompany.name}" creado`);
      setShowCreate(false);
      setNewCompany({ name: '', nit: '', email: '', phone: '', plan: 'BASIC', adminEmail: '', adminPassword: '',
        subscription_start_date: new Date().toISOString().split('T')[0],
        subscription_end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
      });
      load();
    } catch (err: any) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const handleEdit = async () => {
    if (!selectedCompany) return;
    const { error } = await supabase.from('companies').update({
      name: editForm.name, nit: editForm.nit, email: editForm.email,
      phone: editForm.phone, subscription_plan: editForm.plan,
      subscription_status: editForm.subscription_status,
      subscription_start_date: editForm.subscription_start_date || null,
      subscription_end_date: editForm.subscription_end_date || null,
      feature_flags: editForm.feature_flags,
      show_in_landing: editForm.show_in_landing,
    }).eq('id', selectedCompany.id);
    if (error) { toast.error(error.message); return; }
    setCompanies(prev => prev.map(c => c.id === selectedCompany.id ? {
      ...c, name: editForm.name, nit: editForm.nit, email: editForm.email,
      phone: editForm.phone, subscription_plan: editForm.plan,
      subscription_status: editForm.subscription_status,
      subscription_start_date: editForm.subscription_start_date || null,
      subscription_end_date: editForm.subscription_end_date || null,
    } : c));
    toast.success('Negocio actualizado ✓');
    setShowEdit(false);
  };

  const handleDelete = async () => {
    if (!selectedCompany) return;
    try {
      await supabase.from('profiles').delete().eq('company_id', selectedCompany.id);
      await supabase.from('branches').delete().eq('company_id', selectedCompany.id);
      const { error } = await supabase.from('companies').delete().eq('id', selectedCompany.id);
      if (error) throw error;
      toast.success(`"${selectedCompany.name}" eliminado`);
      setShowDelete(false); setSelectedCompany(null); load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleConfirmPayment = async () => {
    if (!selectedCompany) return;
    const newStart = new Date().toISOString().split('T')[0];
    const newEnd = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const { error } = await supabase.from('companies').update({
      subscription_status: 'ACTIVE',
      subscription_start_date: newStart,
      subscription_end_date: newEnd,
    }).eq('id', selectedCompany.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Pago confirmado. Suscripción renovada hasta ${newEnd}`);
    setShowConfirmPayment(false);
    load();
  };

  const handleViewLogs = async (company: any) => {
    setSelectedCompany(company);
    const { data: invoices } = await supabase.from('invoices')
      .select('id, total, status, created_at, payment_method')
      .eq('company_id', company.id).order('created_at', { ascending: false }).limit(20);
    const { data: sessions } = await supabase.from('cash_register_sessions')
      .select('id, status, opening_cash, created_at')
      .eq('company_id', company.id).order('created_at', { ascending: false }).limit(10);
    setLogs([
      ...(invoices || []).map(i => ({ type: 'Factura', detail: `$${i.total?.toLocaleString()} — ${i.payment_method || 'N/A'}`, status: i.status, date: i.created_at })),
      ...(sessions || []).map(s => ({ type: 'Caja', detail: `Apertura: $${s.opening_cash?.toLocaleString()}`, status: s.status, date: s.created_at })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setShowLogs(true);
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('companies').update({ subscription_status: status }).eq('id', id);
    if (error) { toast.error('Error al actualizar estado'); return; }
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, subscription_status: status } : c));
    toast.success(status === 'ACTIVE' ? 'Cuenta activada ✓' : 'Cuenta suspendida');
  };

  const openEdit = (c: any) => {
    setSelectedCompany(c);
    setEditForm({
      name: c.name, nit: c.nit, email: c.email || '', phone: c.phone || '',
      plan: c.subscription_plan, subscription_status: c.subscription_status,
      subscription_start_date: c.subscription_start_date || '',
      subscription_end_date: c.subscription_end_date || '',
      feature_flags: c.feature_flags && Object.keys(c.feature_flags).length > 0
        ? c.feature_flags
        : getDefaultFlagsLP(c.subscription_plan || 'BASIC'),
      show_in_landing: c.show_in_landing || false,
    });
    setShowEdit(true);
  };

  const getDaysLeft = (endDate: string) => {
    if (!endDate) return null;
    return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  };

  const planColors: Record<string, string> = { TRIAL: '#10b981', BASIC: '#64748b', PRO: '#3b82f6', ENTERPRISE: '#8b5cf6' };
  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
    ACTIVE:   { bg: '#dcfce7', color: '#16a34a', label: 'Activo' },
    INACTIVE: { bg: '#fee2e2', color: '#dc2626', label: 'Inactivo' },
    PENDING:  { bg: '#fef9c3', color: '#ca8a04', label: 'Pendiente' },
    PAST_DUE: { bg: '#ffedd5', color: '#ea580c', label: 'Vencido' },
  };

  const buildGrouped = () => {
    const principales = companies.filter(c => c.tipo !== 'sucursal' || !c.negocio_padre_id);
    const result: any[] = [];
    principales.forEach(p => {
      const matchP = (filterStatus === 'ALL' || p.subscription_status === filterStatus) &&
        (!search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.nit || '').includes(search) || (p.email || '').toLowerCase().includes(search.toLowerCase()));
      const sucursales = companies.filter(c => c.negocio_padre_id === p.id);
      const matchedSucursales = sucursales.filter(s =>
        (filterStatus === 'ALL' || s.subscription_status === filterStatus) &&
        (!search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.nit || '').includes(search))
      );
      if (matchP) { result.push({ ...p, _indent: false }); matchedSucursales.forEach(s => result.push({ ...s, _indent: true })); }
      else if (matchedSucursales.length > 0) { result.push({ ...p, _indent: false }); matchedSucursales.forEach(s => result.push({ ...s, _indent: true })); }
    });
    return result;
  };
  const filtered = buildGrouped();

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#1e293b' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 5 };

  const sendContract = async (company: any) => {
    const existing = contracts.find(x => x.company_id === company.id);
    if (existing) {
      const link = `${window.location.origin}/#/contrato/${existing.token}`;
      const statusMsg = existing.status === 'SIGNED' ? '✅ Este cliente ya firmó el contrato.' : '⏳ Ya existe un contrato pendiente de firma.';
      const action = window.confirm(`${statusMsg}\n\n¿Copiar el enlace existente?\n\n(Cancela si quieres crear uno nuevo)`);
      if (action) {
        navigator.clipboard.writeText(link).then(() => alert('✅ Enlace copiado')).catch(() => prompt('Copia el enlace:', link));
        return;
      }
    }
    const { data, error } = await supabase.from('contracts').insert({
      company_id: company.id,
      client_name: company.profiles?.[0]?.full_name || company.name,
      client_doc: '',
      client_email: company.profiles?.[0]?.email || '',
      client_phone: '',
      business_name: company.name,
      plan: company.subscription_plan || 'BASIC',
      status: 'PENDING',
    }).select().single();
    if (error) { alert('Error: ' + error.message); return; }
    setContracts(prev => [data, ...prev]);
    const link = `${window.location.origin}/#/contrato/${data.token}`;
    navigator.clipboard.writeText(link).then(() => {
      alert(`✅ Enlace de contrato copiado al portapapeles:\n\n${link}\n\nEnvíalo al cliente por WhatsApp o email.`);
    }).catch(() => {
      prompt('Copia este enlace y envíalo al cliente:', link);
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {/* Top bar */}
      <div style={{ background: '#0a0f1e', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff' }}>PM</div>
          <span style={{ color: '#fff', fontWeight: 700 }}>POSmaster</span>
          <span style={{ color: '#475569', fontSize: 13, marginLeft: 8 }}>/ Panel Administrador</span>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); onExit(); }}
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Cerrar sesión
        </button>
      </div>

      <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
          {[
            { key: 'clients', label: '🏢 Clientes', count: companies.length },
            { key: 'contracts', label: '📄 Contratos', count: contracts.filter(c => c.status === 'SIGNED').length },
            { key: 'payment_links', label: '🔗 Links de Pago', count: 0 },
            { key: 'plan_pricing',  label: '💰 Planes y Precios', count: 0 },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              style={{ padding: '10px 20px', border: 'none', borderBottom: activeTab === tab.key ? '3px solid #3b82f6' : '3px solid transparent',
                background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                color: activeTab === tab.key ? '#3b82f6' : '#64748b', marginBottom: -2 }}>
              {tab.label}
              <span style={{ marginLeft: 8, background: activeTab === tab.key ? '#dbeafe' : '#f1f5f9',
                color: activeTab === tab.key ? '#2563eb' : '#94a3b8',
                borderRadius: 20, padding: '1px 8px', fontSize: 12 }}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* TAB CONTRATOS */}
        {activeTab === 'contracts' && (
          <div>
            <h3 style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 20 }}>Contratos de Licencia</h3>
            {contracts.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                <p style={{ color: '#64748b', fontWeight: 600 }}>No hay contratos generados aún.</p>
                <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Usa el botón 📄 Contrato en la pestaña Clientes para generar uno.</p>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Estado', 'Cliente', 'Negocio', 'Plan', 'Generado', 'Firmado', 'Acciones'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          {c.status === 'SIGNED'
                            ? <span style={{ background: '#dcfce7', color: '#16a34a', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>✅ Firmado</span>
                            : <span style={{ background: '#fef9c3', color: '#b45309', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⏳ Pendiente</span>
                          }
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>{c.client_name || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#475569' }}>{c.business_name || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: '#dbeafe', color: '#2563eb', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{c.plan}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString('es-CO')}</td>
                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 12 }}>
                          {c.signed_at ? new Date(c.signed_at).toLocaleDateString('es-CO') + ' ' + new Date(c.signed_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => {
                              const link = `${window.location.origin}/#/contrato/${c.token}`;
                              navigator.clipboard.writeText(link).then(() => alert('✅ Enlace copiado')).catch(() => prompt('Copia el enlace:', link));
                            }} style={{ padding: '4px 10px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                              🔗 Enlace
                            </button>
                            {c.client_signature_url && (
                              <button onClick={() => window.open(c.client_signature_url, '_blank')}
                                style={{ padding: '4px 10px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                ✍️ Firma
                              </button>
                            )}
                            {c.status === 'SIGNED' && (
                              <button onClick={() => {
                                const win = window.open('', '_blank');
                                if (!win) return;
                                win.document.write(`<!DOCTYPE html><html><head><title>Contrato ${c.client_name}</title></head><body>
                                  <h2>Contrato firmado — ${c.business_name}</h2>
                                  <p><strong>Cliente:</strong> ${c.client_name}</p>
                                  <p><strong>Plan:</strong> ${c.plan}</p>
                                  <p><strong>Firmado:</strong> ${c.signed_at ? new Date(c.signed_at).toLocaleString('es-CO') : '—'}</p>
                                  <p><strong>Email:</strong> ${c.client_email}</p>
                                  ${c.client_signature_url ? `<p><strong>Firma del cliente:</strong><br/><img src="${c.client_signature_url}" style="max-height:80px;border:1px solid #ccc;padding:8px"/></p>` : ''}
                                  <hr/><p style="color:#888;font-size:12px">Contrato ID: ${c.id}</p>
                                </body></html>`);
                                win.document.close();
                                win.print();
                              }} style={{ padding: '4px 10px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                📥 Ver PDF
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: PLANES Y PRECIOS ───────────────────────────── */}
        {activeTab === 'plan_pricing' && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 6 }}>💰 Planes y Precios</h3>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                Edita los precios, descripciones y características de cada plan. Los cambios se reflejan inmediatamente en la landing page y el registro sin tocar el código.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 1000 }}>
              {([
                { id: 'basic',      label: 'Plan Basic',      color: '#64748b' },
                { id: 'pro',        label: 'Plan Pro',         color: '#3b82f6' },
                { id: 'enterprise', label: 'Plan Enterprise',  color: '#8b5cf6' },
              ] as const).map(plan => (
                <div key={plan.id} style={{ background: '#fff', borderRadius: 16, padding: 24, border: `2px solid ${plan.color}22` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: plan.color }} />
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{plan.label}</span>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                      Precio mensual
                    </label>
                    <input
                      type="text"
                      value={pricingData[`${plan.id}_price`] || ''}
                      onChange={e => setPricingData(p => ({ ...p, [`${plan.id}_price`]: e.target.value }))}
                      placeholder="$65.000"
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 15, fontWeight: 700, color: plan.color, fontFamily: 'monospace', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                      Descripción corta
                    </label>
                    <input
                      type="text"
                      value={pricingData[`${plan.id}_desc`] || ''}
                      onChange={e => setPricingData(p => ({ ...p, [`${plan.id}_desc`]: e.target.value }))}
                      placeholder="Para negocios pequeños"
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#374151', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                      Características (una por línea)
                    </label>
                    <textarea
                      rows={7}
                      value={(pricingData[`${plan.id}_features`] || '').split(',').join('\n')}
                      onChange={e => setPricingData(p => ({ ...p, [`${plan.id}_features`]: e.target.value.split('\n').filter(l => l.trim()).join(',') }))}
                      placeholder={'POS Completo\nInventario\nControl de Caja'}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#374151', resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.8, boxSizing: 'border-box' }}
                    />
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Cada línea = una característica con ✓ en la landing</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24 }}>
              <button
                onClick={async () => {
                  setSavingPricing(true);
                  try {
                    const keys = ['basic_price','pro_price','enterprise_price','basic_desc','pro_desc','enterprise_desc','basic_features','pro_features','enterprise_features'];
                    for (const key of keys) {
                      if (pricingData[key] !== undefined) {
                        await supabase.from('platform_settings').upsert(
                          { key, value: pricingData[key], category: 'pricing' },
                          { onConflict: 'key' }
                        );
                      }
                    }
                    toast.success('✅ Precios actualizados en la landing page');
                  } catch { toast.error('Error guardando precios'); }
                  finally { setSavingPricing(false); }
                }}
                disabled={savingPricing}
                style={{ padding: '12px 32px', background: savingPricing ? '#94a3b8' : '#0f172a', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: savingPricing ? 'not-allowed' : 'pointer' }}>
                {savingPricing ? 'Guardando...' : '💾 Guardar cambios en la landing'}
              </button>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                Los visitantes verán los nuevos precios en su próxima visita (sin redespliegue).
              </p>
            </div>
          </div>
        )}

                {/* ── TAB: LINKS DE PAGO ─────────────────────────────── */}
        {activeTab === 'payment_links' && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 6 }}>🔗 Links de Pago — Bold</h3>
              <p style={{ color: '#64748b', fontSize: 13 }}>Actualiza los links de Bold aquí. Se reflejan automáticamente en la landing page sin tocar el código.</p>
            </div>
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, border: '1px solid #e2e8f0', maxWidth: 600 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 6 }}>💳 Plan Básico — URL de pago Bold</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="url" value={paymentLinks['bold_basic_url'] || ''} onChange={e => setPaymentLinks(p => ({ ...p, bold_basic_url: e.target.value }))} placeholder="https://checkout.bold.co/payment/LNK_..."
                    style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'monospace' }} />
                  <a href={paymentLinks['bold_basic_url'] || '#'} target="_blank" rel="noreferrer"
                    style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                    Probar ↗
                  </a>
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 6 }}>💳 Plan Profesional — URL de pago Bold</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="url" value={paymentLinks['bold_pro_url'] || ''} onChange={e => setPaymentLinks(p => ({ ...p, bold_pro_url: e.target.value }))} placeholder="https://checkout.bold.co/payment/LNK_..."
                    style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'monospace' }} />
                  <a href={paymentLinks['bold_pro_url'] || '#'} target="_blank" rel="noreferrer"
                    style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                    Probar ↗
                  </a>
                </div>
              </div>
              <button onClick={async () => {
                setSavingLinks(true);
                try {
                  for (const [key, value] of Object.entries(paymentLinks)) {
                    await supabase.from('platform_settings').upsert({ key, value, category: 'payment' }, { onConflict: 'key' });
                  }
                  toast.success('✅ Links actualizados correctamente');
                } catch { toast.error('Error guardando los links'); }
                finally { setSavingLinks(false); }
              }} disabled={savingLinks}
                style={{ width: '100%', padding: '11px 0', background: savingLinks ? '#94a3b8' : '#0f172a', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: savingLinks ? 'not-allowed' : 'pointer' }}>
                {savingLinks ? 'Guardando...' : '💾 Guardar Links de Pago'}
              </button>
            </div>
          </div>
        )}

                {/* TAB CLIENTES */}
        {activeTab === 'clients' && <div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Negocios', value: companies.length, color: '#3b82f6' },
            { label: 'Activos', value: companies.filter(c => c.subscription_status === 'ACTIVE').length, color: '#22c55e' },
            { label: 'Pendientes', value: companies.filter(c => c.subscription_status === 'PENDING').length, color: '#f59e0b' },
            { label: 'Vencidos', value: companies.filter(c => c.subscription_status === 'PAST_DUE').length, color: '#ef4444' },
            { label: 'Por vencer (7d)', value: companies.filter(c => { const d = getDaysLeft(c.subscription_end_date); return d !== null && d >= 0 && d <= 7; }).length, color: '#f97316' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['ALL', 'PENDING', 'ACTIVE', 'PAST_DUE', 'INACTIVE'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: filterStatus === s ? '#0f172a' : '#fff', color: filterStatus === s ? '#fff' : '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {s === 'ALL' ? 'Todos' : s === 'PENDING' ? 'Pendientes' : s === 'ACTIVE' ? 'Activos' : s === 'PAST_DUE' ? 'Vencidos' : 'Inactivos'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar negocio..."
              style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', width: 200 }} />
            <button onClick={() => setShowCreate(true)}
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
              + Nuevo Negocio
            </button>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Negocio', 'Tipo', 'Plan', 'Estado', 'Inicio', 'Vencimiento', 'Días', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No hay registros</td></tr>
              ) : filtered.map(c => {
                const st = statusColors[c.subscription_status] || statusColors['INACTIVE'];
                const daysLeft = getDaysLeft(c.subscription_end_date);
                const daysColor = daysLeft === null ? '#94a3b8' : daysLeft < 0 ? '#dc2626' : daysLeft <= 7 ? '#f97316' : '#16a34a';
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{c.name}</p>
                      <p style={{ fontSize: 12, color: '#94a3b8' }}>{c.email || '—'}</p>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: c.tipo === 'sucursal' ? '#fdf4ff' : '#eff6ff', color: c.tipo === 'sucursal' ? '#9333ea' : '#2563eb', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                        {c.tipo === 'sucursal' ? '🏪 Sucursal' : '🏢 Principal'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: planColors[c.subscription_plan] + '20', color: planColors[c.subscription_plan], padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                        {c.subscription_plan === 'TRIAL' ? '🎁 TRIAL' : c.subscription_plan === 'BASIC' ? '⚡ BASIC' : c.subscription_plan === 'PRO' ? '⭐ PRO' : c.subscription_plan}
                      </span>
                      {(() => {
                        const ct = contracts.find((x: any) => x.company_id === c.id);
                        if (!ct) return null;
                        return ct.status === 'SIGNED'
                          ? <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>✅ Contrato firmado</span>
                          : <span style={{ background: '#fef9c3', color: '#b45309', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>⏳ Contrato pendiente</span>;
                      })()}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{c.subscription_start_date || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>{c.subscription_end_date || '—'}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      {daysLeft !== null ? (
                        <span style={{ fontWeight: 800, color: daysColor, fontSize: 13 }}>
                          {daysLeft < 0 ? `Venció hace ${Math.abs(daysLeft)}d` : daysLeft === 0 ? 'Vence hoy' : `${daysLeft}d`}
                        </span>
                      ) : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {/* 👤 GESTIÓN USUARIOS */}
                        <button onClick={() => { setUserMgmtCompany(c); setShowUserMgmt(true); }}
                          title="Gestionar usuarios (contraseña / correo)"
                          style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #e9d5ff', background: '#f5f3ff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>
                          👤
                        </button>
                        {/* Confirmar pago */}
                        <button onClick={() => { setSelectedCompany(c); setShowConfirmPayment(true); }}
                          style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                          💰 Pago
                        </button>
                        {c.subscription_status !== 'ACTIVE' && (
                          <button onClick={() => setStatus(c.id, 'ACTIVE')}
                            style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
                            ✓ Activar
                          </button>
                        )}
                        {c.subscription_status === 'ACTIVE' && (
                          <button onClick={() => setStatus(c.id, 'INACTIVE')}
                            style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                            Suspender
                          </button>
                        )}
                        <button onClick={() => openEdit(c)}
                          style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #e9d5ff', background: '#f5f3ff', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>
                          ✏️
                        </button>
                        <button onClick={() => handleViewLogs(c)}
                          style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                          📋
                        </button>
                        {(() => {
                          const ct = contracts.find((x: any) => x.company_id === c.id && x.status === 'SIGNED');
                          const ctPending = contracts.find((x: any) => x.company_id === c.id);
                          if (ct) {
                            return (
                              <button onClick={() => {
                                const win = window.open('', '_blank');
                                if (!win) return;
                                win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Contrato firmado</title>
                                <style>body{font-family:Arial,sans-serif;padding:40px;max-width:700px;margin:0 auto}h1{color:#1e3a8a}hr{margin:24px 0}.sig{display:flex;gap:40px;margin-top:32px}.sig-block{flex:1;text-align:center}.sig-block img{max-height:70px;border:1px solid #ccc;padding:8px}.sig-line{border-top:2px solid #333;margin:8px 0}</style>
                                </head><body>
                                <h1>Contrato de Licencia — POSmaster</h1>
                                <p><strong>Cliente:</strong> ${ct.client_name}</p>
                                <p><strong>Negocio:</strong> ${ct.business_name}</p>
                                <p><strong>Plan:</strong> ${ct.plan}</p>
                                <p><strong>Email:</strong> ${ct.client_email}</p>
                                <p><strong>Firmado:</strong> ${ct.signed_at ? new Date(ct.signed_at).toLocaleString('es-CO') : '—'}</p>
                                <hr/>
                                <div class="sig">
                                  <div class="sig-block">
                                    <img src="https://wdaabpbpxbbfhurvjvwj.supabase.co/storage/v1/object/public/company-logos/firma_diego.png" crossorigin="anonymous"/>
                                    <div class="sig-line"></div>
                                    <strong>DIEGO FERNANDO VALDÉS RANGEL</strong><br/><small>C.C. 1.130.668.648 — Cali</small><br/><small>EL LICENCIANTE</small>
                                  </div>
                                  <div class="sig-block">
                                    ${ct.client_signature_url ? `<img src="${ct.client_signature_url}"/>` : '<p>(sin firma)</p>'}
                                    <div class="sig-line"></div>
                                    <strong>${ct.client_name}</strong><br/><small>EL LICENCIATARIO</small>
                                  </div>
                                </div>
                                <hr/><p style="color:#888;font-size:11px">ID contrato: ${ct.id}</p>
                                </body></html>`);
                                win.document.close();
                                setTimeout(() => win.print(), 800);
                              }} style={{ padding: '4px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                📥 Ver contrato
                              </button>
                            );
                          }
                          return (
                            <button onClick={() => sendContract(c)}
                              style={{ padding: '4px 10px', background: ctPending ? '#d97706' : '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                              {ctPending ? '🔗 Copiar enlace' : '📄 Contrato'}
                            </button>
                          );
                        })()}
                        <button onClick={() => onPreview(c.id)}
                          style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #ddd6fe', background: '#f5f3ff', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>
                          👁️ Ver
                        </button>
                        <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hola ${c.name}, te escribimos desde POSmaster.`} target="_blank" rel="noreferrer"
                          style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', fontSize: 11, fontWeight: 700, color: '#16a34a', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          💬
                        </a>
                        <button onClick={() => { setSelectedCompany(c); setShowDelete(true); }}
                          style={{ padding: '4px 9px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff1f2', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        </div>}{/* fin tab clientes */}

      </div>

      {/* MODAL CONFIRMAR PAGO */}
      {showConfirmPayment && selectedCompany && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 440, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Confirmar Pago</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 4 }}>Negocio:</p>
            <p style={{ fontWeight: 800, color: '#0f172a', fontSize: 16, marginBottom: 16 }}>{selectedCompany.name}</p>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, marginBottom: 24, textAlign: 'left' }}>
              <p style={{ color: '#16a34a', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>✓ Al confirmar:</p>
              <p style={{ color: '#64748b', fontSize: 13 }}>• Estado → <strong>Activo</strong></p>
              <p style={{ color: '#64748b', fontSize: 13 }}>• Inicio: <strong>{new Date().toLocaleDateString()}</strong></p>
              <p style={{ color: '#64748b', fontSize: 13 }}>• Vencimiento: <strong>{new Date(Date.now() + 30 * 86400000).toLocaleDateString()}</strong></p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirmPayment(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>Cancelar</button>
              <button onClick={handleConfirmPayment} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>✓ Confirmar Pago</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Crear Nuevo Negocio</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[{ label: 'Nombre *', key: 'name', placeholder: 'IPHONESHOP USA' }, { label: 'NIT *', key: 'nit', placeholder: '900123456-7' }, { label: 'Email', key: 'email', placeholder: 'negocio@email.com' }, { label: 'Teléfono', key: 'phone', placeholder: '300 123 4567' }].map(field => (
                <div key={field.key}><label style={labelStyle}>{field.label}</label><input value={(newCompany as any)[field.key]} onChange={f(field.key)} placeholder={(field as any).placeholder} style={inputStyle} /></div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Fecha Inicio</label><input type="date" value={newCompany.subscription_start_date} onChange={f('subscription_start_date')} style={inputStyle} /></div>
                <div><label style={labelStyle}>Fecha Vencimiento</label><input type="date" value={newCompany.subscription_end_date} onChange={f('subscription_end_date')} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Plan</label>
                <select value={newCompany.plan} onChange={f('plan')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="TRIAL">Prueba (7 días)</option><option value="BASIC">Basic — $65.000/mes</option><option value="PRO">Pro — $120.000/mes</option><option value="ENTERPRISE">Enterprise — $249.900/mes 🏢</option>
                </select>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase' as const }}>Credenciales del Admin</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div><label style={labelStyle}>Email Admin *</label><input type="email" value={newCompany.adminEmail} onChange={f('adminEmail')} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Contraseña *</label><input type="password" value={newCompany.adminPassword} onChange={f('adminPassword')} style={inputStyle} /></div>
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

      {/* MODAL EDITAR */}
      {showEdit && selectedCompany && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Editar: {selectedCompany.name}</h3>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[{ label: 'Nombre', key: 'name' }, { label: 'NIT', key: 'nit' }, { label: 'Email', key: 'email' }, { label: 'Teléfono', key: 'phone' }].map(field => (
                <div key={field.key}><label style={labelStyle}>{field.label}</label><input value={(editForm as any)[field.key]} onChange={fe(field.key)} style={inputStyle} /></div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Fecha Inicio</label><input type="date" value={editForm.subscription_start_date} onChange={fe('subscription_start_date')} style={inputStyle} /></div>
                <div><label style={labelStyle}>Fecha Vencimiento</label><input type="date" value={editForm.subscription_end_date} onChange={fe('subscription_end_date')} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Plan</label>
                <select value={editForm.plan} onChange={fe('plan')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="TRIAL">Prueba (7 días)</option>
                  <option value="BASIC">Basic — $65.000/mes</option>
                  <option value="PRO">Pro — $120.000/mes</option>
                  <option value="ENTERPRISE">Enterprise — $249.900/mes 🏢</option>
                </select>
              </div>
              <div><label style={labelStyle}>Estado</label>
                <select value={editForm.subscription_status} onChange={fe('subscription_status')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option><option value="PENDING">Pendiente</option><option value="PAST_DUE">Vencido</option>
                </select>
              </div>

              {/* ── Mostrar en landing ── */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Mostrar en página principal</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      El logo/nombre aparece en la sección "Negocios que confían en nosotros"
                    </p>
                  </div>
                  <button type="button"
                    onClick={() => setEditForm(prev => ({ ...prev, show_in_landing: !prev.show_in_landing }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: editForm.show_in_landing ? '#22c55e' : '#e2e8f0',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3, transition: 'left 0.2s',
                      left: editForm.show_in_landing ? 23 : 3,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              </div>

              {/* ── Feature Flags ── */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, fontWeight: 700, color: '#0f172a' }}>Features habilitados</label>
                  <button type="button"
                    onClick={() => setEditForm(prev => ({ ...prev, feature_flags: getDefaultFlagsLP(prev.plan) }))}
                    style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>
                    Restaurar por plan
                  </button>
                </div>
                <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                  Activa o desactiva features individualmente para esta empresa
                </p>
                {(() => {
                  const cats = [...new Set(FEATURE_DEFS_LP.map(f => f.cat))];
                  const flags = editForm.feature_flags && Object.keys(editForm.feature_flags).length > 0
                    ? editForm.feature_flags
                    : getDefaultFlagsLP(editForm.plan);
                  return cats.map(cat => (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{cat}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {FEATURE_DEFS_LP.filter(f => f.cat === cat).map(feat => {
                          const isOn = flags[feat.id] !== undefined ? flags[feat.id] : feat.defaultPlans.includes(editForm.plan);
                          return (
                            <button key={feat.id} type="button"
                              onClick={() => setEditForm(prev => ({
                                ...prev,
                                feature_flags: { ...flags, [feat.id]: !isOn }
                              }))}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                                border: isOn ? '1.5px solid #86efac' : '1.5px solid #e2e8f0',
                                background: isOn ? '#f0fdf4' : '#f8fafc',
                                color: isOn ? '#15803d' : '#94a3b8',
                                fontSize: 12, fontWeight: 600, textAlign: 'left' as const,
                              }}>
                              <div style={{
                                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                background: isOn ? '#22c55e' : '#e2e8f0',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}>
                                {isOn && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                              </div>
                              {feat.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setShowEdit(false)} style={{ flex: 1, padding: '11px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>Cancelar</button>
                <button onClick={handleEdit} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {showDelete && selectedCompany && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>¿Eliminar negocio?</h3>
            <p style={{ fontWeight: 800, color: '#dc2626', fontSize: 16, marginBottom: 8 }}>{selectedCompany.name}</p>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 28 }}>Se eliminarán sus perfiles y sucursales. Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDelete(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>Cancelar</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: 10, background: '#dc2626', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL LOGS */}
      {showLogs && selectedCompany && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Actividad: {selectedCompany.name}</h3>
                <p style={{ color: '#64748b', fontSize: 13 }}>Últimas facturas y sesiones de caja</p>
              </div>
              <button onClick={() => setShowLogs(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Sin actividad registrada</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f8fafc' }}>
                  {['Tipo', 'Detalle', 'Estado', 'Fecha'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 12 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: log.type === 'Factura' ? '#eff6ff' : '#f5f3ff', color: log.type === 'Factura' ? '#2563eb' : '#7c3aed', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{log.type}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{log.detail}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>{log.status || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' as const }}>{new Date(log.date).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* PANEL GESTIÓN DE USUARIOS */}
      {showUserMgmt && userMgmtCompany && (
        <UserManagementPanel
          company={userMgmtCompany}
          onClose={() => { setShowUserMgmt(false); setUserMgmtCompany(null); }}
        />
      )}
    </div>
  );
};

// ── PORTAL DE CLIENTE ─────────────────────────────────────────────────────────
export const ClientPortal: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [cedula,   setCedula]   = React.useState('');
  const [results,  setResults]  = React.useState<any[] | null>(null);
  const [loading,  setLoading]  = React.useState(false);
  const [detail,   setDetail]   = React.useState<any>(null);

  const search = async () => {
    if (!cedula.trim()) { toast.error('Ingresa tu número de cédula'); return; }
    setLoading(true); setResults(null);
    const { data, error } = await supabase.rpc('buscar_por_cedula', { p_cedula: cedula.trim() });
    if (error) { toast.error('Error: ' + error.message); setResults([]); setLoading(false); return; }
    let parsed = data;
    if (typeof data === 'string') { try { parsed = JSON.parse(data); } catch { parsed = {}; } }
    const invoices = Array.isArray(parsed?.invoices) ? parsed.invoices : [];
    const shoes    = Array.isArray(parsed?.shoes)    ? parsed.shoes    : [];
    buildResults(invoices, shoes);
  };

  const buildResults = (invoiceData: any[], shoeData: any[]) => {
    const invoices = invoiceData.map((r: any) => {
      const pm = r.payment_method || {};
      const virtualItems = (pm.virtual_items || []).map((v: any) => v.name).filter(Boolean);
      const service = virtualItems.length > 0 ? virtualItems.join(', ') : pm.method === 'CASH' ? 'Venta en efectivo' : pm.method || 'Venta POS';
      return { ...r, _type: 'invoice', _label: 'Factura POS', client_name: pm.customer_name || '—', total: r.total_amount, amount_paid: pm.amount || r.total_amount || 0, balance_due: pm.balance_due ?? Math.max(0, (r.total_amount || 0) - (pm.amount || 0)), payment_status: pm.payment_status || 'PAID', service };
    });
    const shoeMap = new Map(shoeData.map((r: any) => [r.id, r]));
    const shoeItems = Array.from(shoeMap.values()).map((r: any) => {
      const isDelivered = r.status === 'DELIVERED';
      const balance = isDelivered ? 0 : Math.max(0, (r.estimated_price || 0) - (r.deposit_amount || 0));
      return { ...r, _type: 'shoe', _label: 'Reparación Calzado', invoice_number: r.ticket_number || r.id?.slice(0, 8).toUpperCase(), total: r.estimated_price || 0, amount_paid: isDelivered ? (r.estimated_price || 0) : (r.deposit_amount || 0), balance_due: balance, payment_status: isDelivered ? 'PAID' : (r.deposit_amount > 0) ? 'PARTIAL' : 'PENDING', service: r.service_type || '—', client_name: r.client_name || '—' };
    });
    const all = [...invoices, ...shoeItems].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setResults(all);
    setLoading(false);
  };

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

  const statusLabel = (s: string) =>
    s === 'PAID' ? '✅ Pagado' : s === 'PARTIAL' ? '⏳ Pago parcial' : s === 'DELIVERED' ? '✅ Entregado' :
    s === 'IN_PROGRESS' ? '🔧 En proceso' : s === 'PENDING_DELIVERY' ? '📦 Listo p/ entregar' :
    s === 'RECEIVED' ? '📥 Recibido' : s === 'PENDING_ELECTRONIC' ? '🧾 Pendiente' : '⏳ Pendiente';

  const statusColor = (s: string) =>
    (s === 'PAID' || s === 'DELIVERED') ? '#059669' : (s === 'PARTIAL' || s === 'PENDING_DELIVERY') ? '#d97706' : '#3b82f6';

  const containerStyle: React.CSSProperties = { minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px' };
  const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 20, boxShadow: '0 25px 60px rgba(0,0,0,0.3)', width: '100%', maxWidth: 640, overflow: 'hidden' };
  const inputStyle: React.CSSProperties = { width: '100%', border: '2px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', fontSize: 18, outline: 'none', boxSizing: 'border-box' as const, letterSpacing: 2, textAlign: 'center' as const };

  return (
    <div style={containerStyle}>
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <img src="https://wdaabpbpxbbfhurvjvwj.supabase.co/storage/v1/object/public/company-logos/logo.png" alt="POSmaster" style={{ height: 32, filter: 'brightness(0) invert(1)' }} />
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← Volver</button>
      </div>
      <div style={cardStyle}>
        <div style={{ background: 'linear-gradient(135deg,#1e293b,#334155)', padding: '32px 32px 28px' }}>
          <p style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Portal de consulta</p>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Mis facturas y servicios</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Ingresa tu número de cédula o NIT para consultar tu historial</p>
        </div>
        <div style={{ padding: 32 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <input type="number" placeholder="Número de cédula o NIT" value={cedula} onChange={e => setCedula(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} style={inputStyle} />
            <button onClick={search} disabled={loading} style={{ padding: '12px 24px', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', border: 'none', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' as const }}>
              {loading ? '...' : '🔍 Buscar'}
            </button>
          </div>
          {results !== null && (
            results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                <p style={{ fontWeight: 700, fontSize: 16, color: '#475569', marginBottom: 4 }}>No se encontraron registros.</p>
                <p style={{ fontSize: 13 }}>Verifica que el número de cédula sea correcto.</p>
              </div>
            ) : (
              <div style={{ marginTop: 20 }}>
                <p style={{ color: '#475569', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{results.length} registro{results.length > 1 ? 's' : ''} encontrado{results.length > 1 ? 's' : ''}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {results.map((row, i) => {
                    const status = row.payment_status || row.status;
                    return (
                      <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, cursor: 'pointer', background: '#fafafa', transition: 'border-color 0.15s' }}
                        onClick={() => setDetail(row)}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ background: row._type === 'invoice' ? '#eff6ff' : '#f5f3ff', color: row._type === 'invoice' ? '#2563eb' : '#7c3aed', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{row._label}</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569', fontSize: 13 }}>#{row.invoice_number || row.ticket_number}</span>
                            </div>
                            <p style={{ margin: '2px 0', color: '#1e293b', fontWeight: 600, fontSize: 14 }}>{row.service || row.client_name || 'Ver detalle'}</p>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: 12 }}>{new Date(row.created_at).toLocaleDateString('es-CO')}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#1e293b' }}>{fmt(row.total)}</p>
                            <span style={{ background: statusColor(status) + '18', color: statusColor(status), padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{statusLabel(status)}</span>
                            {row.balance_due > 0 && <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: 12, fontWeight: 600 }}>Saldo: {fmt(row.balance_due)}</p>}
                          </div>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                          <span style={{ color: '#3b82f6', fontSize: 12, fontWeight: 600 }}>Ver detalle →</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </div>
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{detail._label}</p>
                <h3 style={{ margin: '4px 0 0', fontWeight: 800, fontSize: 18 }}>#{detail.invoice_number || detail.ticket_number}</h3>
              </div>
              <button onClick={() => setDetail(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              {[
                ['Cliente', detail.client_name],
                ['Servicio / Items', detail.service || '—'],
                ['Fecha', new Date(detail.created_at).toLocaleDateString('es-CO', { dateStyle: 'long' })],
                ['Total', fmt(detail.total)],
                ['Abono pagado', fmt(detail.amount_paid)],
                ['Saldo pendiente', fmt(detail.balance_due)],
                ['Estado', statusLabel(detail.payment_status || detail.status)],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b', fontSize: 13 }}>{l}</span>
                  <span style={{ color: '#1e293b', fontWeight: 600, fontSize: 13, textAlign: 'right', maxWidth: '65%' }}>{v}</span>
                </div>
              ))}
              {detail.payment_method?.virtual_items?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontWeight: 700, color: '#475569', fontSize: 13, marginBottom: 8 }}>Servicios incluidos</p>
                  {detail.payment_method.virtual_items.map((vi: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: '#475569' }}>{vi.name} × {vi.quantity || 1}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{fmt(vi.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};