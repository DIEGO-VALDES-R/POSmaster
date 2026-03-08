import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// ── CONSTANTES DEL LICENCIANTE ────────────────────────────────────────────────
const LICENCIANTE = {
  nombre: 'DIEGO FERNANDO VALDÉS RANGEL',
  cedula: '1.130.668.648',
  ciudad_cedula: 'Cali',
  domicilio: 'Cúcuta',
  firma_url: 'https://wdaabpbpxbbfhurvjvwj.supabase.co/storage/v1/object/public/company-logos/firma_diego.png',
  email: 'diegoferrangel@gmail.com',
  whatsapp: '573204884943',
};

const PLAN_PRECIOS: Record<string, string> = {
  TRIAL: 'Gratis – 7 días',
  BASIC: '$65.000/mes',
  PRO: '$120.000/mes',
};

// ── TIPOS ─────────────────────────────────────────────────────────────────────
interface Contract {
  id: string; token: string; status: string;
  client_name: string; client_doc: string; client_email: string;
  client_phone: string; business_name: string; plan: string;
  signed_at?: string; client_signature_url?: string; pdf_url?: string;
  created_at: string;
}

// ── GENERADOR DE PDF (HTML → Blob via print) ──────────────────────────────────
const generateContractHTML = (contract: Contract, clientSigDataUrl: string): string => {
  const today = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  const planLabel = PLAN_PRECIOS[contract.plan] || contract.plan;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.6; padding: 40px 60px; }
  .header { text-align: center; border-bottom: 3px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 16pt; color: #1e3a8a; font-weight: 900; }
  .header h2 { font-size: 13pt; color: #2563eb; margin-top: 4px; }
  .header p { color: #64748b; font-size: 9pt; margin-top: 6px; }
  .clause-title { background: #eff6ff; color: #1e3a8a; font-weight: 700; font-size: 10.5pt;
    padding: 6px 12px; margin: 20px 0 8px; border-left: 4px solid #2563eb; }
  p { text-align: justify; margin-bottom: 8px; }
  ul { margin: 6px 0 8px 24px; }
  li { margin-bottom: 4px; }
  .field { border-bottom: 1px solid #94a3b8; min-height: 18px; margin: 4px 0 12px; padding: 2px 0; }
  .field-label { font-weight: 700; font-size: 9pt; color: #374151; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; gap: 40px; }
  .sig-block { flex: 1; text-align: center; }
  .sig-block img { max-height: 70px; max-width: 200px; margin-bottom: 4px; }
  .sig-line { border-top: 1.5px solid #374151; margin: 8px 0 4px; }
  .sig-name { font-weight: 700; font-size: 9pt; color: #1e3a8a; }
  .sig-sub { font-size: 8pt; color: #64748b; }
  .footer { margin-top: 32px; border-top: 1px solid #dbeafe; padding-top: 8px;
    text-align: center; font-size: 8pt; color: #94a3b8; }
  .highlight { background: #eff6ff; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  @media print { body { padding: 20px 40px; } }
</style>
</head>
<body>
<div class="header">
  <h1>CONTRATO DE LICENCIA DE USO DE SOFTWARE</h1>
  <h2>POSmaster — Soluciones Inteligentes para tu Negocio</h2>
  <p>Fecha: ${today} &nbsp;|&nbsp; Contrato N.° ${contract.id.slice(0, 8).toUpperCase()} &nbsp;|&nbsp; Plan: <strong>${planLabel}</strong></p>
</div>

<div class="clause-title">CLÁUSULA I. IDENTIFICACIÓN DE LAS PARTES</div>
<p><strong>LICENCIANTE:</strong> ${LICENCIANTE.nombre}, identificado con cédula de ciudadanía N.° ${LICENCIANTE.cedula} de ${LICENCIANTE.ciudad_cedula}, domiciliado en la ciudad de ${LICENCIANTE.domicilio}, Colombia, propietario y desarrollador del software POSmaster.</p>
<p><strong>LICENCIATARIO:</strong></p>
<div class="field-label">Nombre / Razón Social:</div><div class="field">${contract.client_name}</div>
<div class="field-label">N.° Identificación:</div><div class="field">${contract.client_doc}</div>
<div class="field-label">Correo electrónico:</div><div class="field">${contract.client_email}</div>
<div class="field-label">Teléfono:</div><div class="field">${contract.client_phone}</div>
<div class="field-label">Nombre del negocio:</div><div class="field">${contract.business_name}</div>

<div class="clause-title">CLÁUSULA II. NATURALEZA — LICENCIA, NO VENTA</div>
<p>El presente instrumento constituye un Contrato de Licencia de Uso de Software y NO una compraventa. El Licenciatario adquiere únicamente el derecho de uso del software POSmaster. El software y todos sus componentes son y seguirán siendo propiedad exclusiva de ${LICENCIANTE.nombre}.</p>

<div class="clause-title">CLÁUSULA III. PROPIEDAD INTELECTUAL</div>
<p>El software POSmaster es obra original protegida por las leyes de propiedad intelectual de Colombia (Ley 23 de 1982, Decisión Andina 351 de 1993). El Licenciatario NO puede copiar, modificar, descompilar, distribuir ni sublicenciar el software.</p>

<div class="clause-title">CLÁUSULA IV. PLAN CONTRATADO Y VIGENCIA</div>
<p>Plan suscrito: <span class="highlight">${contract.plan} — ${planLabel}</span>. La vigencia inicia en la fecha de activación según el período contratado. La no renovación oportuna suspenderá el acceso automáticamente.</p>

<div class="clause-title">CLÁUSULA V. PORTABILIDAD Y BORRADO DE DATOS</div>
<p>Al terminar la licencia, el Licenciatario tendrá <strong>30 días calendario</strong> para solicitar la exportación de sus datos. Transcurrido dicho plazo, el Licenciante procederá a la eliminación definitiva de los datos sin obligación de recuperación.</p>

<div class="clause-title">CLÁUSULA VI. RESPONSABILIDAD LIMITADA</div>
<p>El Licenciante no será responsable por pérdida de datos, ingresos o daños indirectos. La responsabilidad máxima no excederá el valor pagado en los 3 meses anteriores al evento.</p>

<div class="clause-title">CLÁUSULA VII. FIRMA Y ACEPTACIÓN</div>
<p>Las partes declaran haber leído y aceptado los términos del presente contrato, suscribiéndolo en señal de conformidad.</p>

<div class="signatures">
  <div class="sig-block">
    <img src="${LICENCIANTE.firma_url}" alt="Firma Licenciante" crossorigin="anonymous"/>
    <div class="sig-line"></div>
    <div class="sig-name">${LICENCIANTE.nombre}</div>
    <div class="sig-sub">C.C. ${LICENCIANTE.cedula} — ${LICENCIANTE.ciudad_cedula}</div>
    <div class="sig-sub">EL LICENCIANTE</div>
    <div class="sig-sub">${today}</div>
  </div>
  <div class="sig-block">
    <img src="${clientSigDataUrl}" alt="Firma Licenciatario"/>
    <div class="sig-line"></div>
    <div class="sig-name">${contract.client_name}</div>
    <div class="sig-sub">${contract.client_doc}</div>
    <div class="sig-sub">EL LICENCIATARIO</div>
    <div class="sig-sub">${today}</div>
  </div>
</div>

<div class="footer">
  POSmaster &nbsp;|&nbsp; © ${LICENCIANTE.nombre} — Todos los derechos reservados &nbsp;|&nbsp;
  Contrato firmado electrónicamente el ${today} &nbsp;|&nbsp; Token: ${contract.token.slice(0, 16)}...
</div>
</body>
</html>`;
};

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export const ContractSign: React.FC<{ token: string }> = ({ token }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('contracts').select('*').eq('token', token).maybeSingle();
      if (error || !data) { setError('Contrato no encontrado o enlace inválido.'); setLoading(false); return; }
      if (data.status === 'SIGNED') { setDone(true); setContract(data); setLoading(false); return; }
      setContract(data);
      setLoading(false);
    };
    load();
  }, [token]);

  // Canvas setup
  useEffect(() => {
    if (!canvasRef.current || !contract) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [contract]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const pos = getPos(e, canvasRef.current);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setHasSig(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const pos = getPos(e, canvasRef.current);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => setDrawing(false);

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSig(false);
  };

  const handleSign = async () => {
    if (!contract || !canvasRef.current || !hasSig || !agreed) return;
    setSubmitting(true);
    try {
      const sigDataUrl = canvasRef.current.toDataURL('image/png');

      // Subir firma a Supabase Storage
      const base64 = sigDataUrl.split(',')[1];
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const fileName = `signatures/${contract.token}.png`;
      const { error: uploadErr } = await supabase.storage
        .from('company-logos').upload(fileName, byteArray, { contentType: 'image/png', upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(fileName);
      const sigUrl = urlData.publicUrl;

      // Actualizar contrato
      const { error: updateErr } = await supabase.from('contracts').update({
        status: 'SIGNED',
        signed_at: new Date().toISOString(),
        client_signature_url: sigUrl,
      }).eq('id', contract.id);
      if (updateErr) throw updateErr;

      // Generar y abrir PDF para imprimir/guardar
      const html = generateContractHTML({ ...contract, client_signature_url: sigUrl }, sigDataUrl);
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 1200);
      }

      // Notificar al admin
      await supabase.from('admin_notifications').insert({
        type: 'CONTRACT_SIGNED',
        title: '✍️ Contrato firmado',
        message: `${contract.client_name} (${contract.business_name}) firmó el contrato del plan ${contract.plan}.`,
        data: { contract_id: contract.id, client_email: contract.client_email },
        is_read: false,
      });

      setDone(true);
      setContract(prev => prev ? { ...prev, status: 'SIGNED' } : prev);
    } catch (err: any) {
      setError('Error al procesar la firma: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ width: 48, height: 48, border: '4px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <p>Cargando contrato...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: '#1e293b', borderRadius: 16, padding: 40, maxWidth: 420, textAlign: 'center', border: '1px solid #ef4444' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <p style={{ color: '#f87171', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Enlace inválido</p>
        <p style={{ color: '#94a3b8' }}>{error}</p>
      </div>
    </div>
  );

  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <div style={{ background: '#1e293b', borderRadius: 16, padding: 40, maxWidth: 480, textAlign: 'center', border: '1px solid #22c55e' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ color: '#22c55e', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>¡Contrato firmado exitosamente!</h2>
        <p style={{ color: '#94a3b8', marginBottom: 24 }}>Gracias {contract?.client_name}. Tu contrato ha sido firmado y registrado. Puedes cerrar esta ventana.</p>
        <p style={{ color: '#60a5fa', fontSize: 13 }}>Una copia fue guardada para ambas partes.</p>
      </div>
    </div>
  );

  if (!contract) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: '24px 16px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="https://wdaabpbpxbbfhurvjvwj.supabase.co/storage/v1/object/public/company-logos/logo.png"
            alt="POSmaster" style={{ height: 60, marginBottom: 16 }} />
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>Contrato de Licencia de Uso</h1>
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>Por favor lee el contrato y firma al final para activar tu licencia</p>
        </div>

        {/* Datos del cliente */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 20, border: '1px solid #334155' }}>
          <h3 style={{ color: '#60a5fa', fontWeight: 700, marginBottom: 16, fontSize: 15 }}>📋 Datos del contrato</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Cliente', contract.client_name],
              ['Identificación', contract.client_doc],
              ['Negocio', contract.business_name],
              ['Plan', `${contract.plan} — ${PLAN_PRECIOS[contract.plan] || ''}`],
              ['Email', contract.client_email],
              ['Teléfono', contract.client_phone],
            ].map(([label, value]) => (
              <div key={label}>
                <p style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{label}</p>
                <p style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Resumen del contrato */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 20, border: '1px solid #334155', maxHeight: 320, overflowY: 'auto' }}>
          <h3 style={{ color: '#60a5fa', fontWeight: 700, marginBottom: 16, fontSize: 15 }}>📄 Términos de la licencia</h3>
          {[
            ['II. Naturaleza', 'Este contrato es una LICENCIA DE USO, no una venta. El software POSmaster y todos sus componentes son propiedad exclusiva de Diego Fernando Valdés Rangel.'],
            ['III. Propiedad intelectual', 'No puede copiar, modificar, descompilar, distribuir ni sublicenciar el software. Protegido por Ley 23 de 1982 y Decisión Andina 351 de 1993.'],
            ['IV. Plan contratado', `Plan ${contract.plan} — ${PLAN_PRECIOS[contract.plan] || ''}. La vigencia inicia en la fecha de activación según el período contratado.`],
            ['V. Portabilidad de datos', 'Al terminar la licencia tiene 30 días para solicitar exportación de sus datos. Vencido el plazo, los datos serán eliminados definitivamente.'],
            ['VI. Responsabilidad limitada', 'El licenciante no responde por pérdidas indirectas. Responsabilidad máxima: valor pagado en los últimos 3 meses.'],
            ['VII. Obligaciones', 'Mantener confidencialidad de credenciales. Usar el software solo para fines lícitos. No ceder el acceso a terceros.'],
          ].map(([titulo, texto]) => (
            <div key={titulo} style={{ marginBottom: 16 }}>
              <p style={{ color: '#3b82f6', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{titulo}</p>
              <p style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6, textAlign: 'justify' }}>{texto}</p>
            </div>
          ))}
        </div>

        {/* Firma del licenciante */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 20, border: '1px solid #334155' }}>
          <h3 style={{ color: '#60a5fa', fontWeight: 700, marginBottom: 16, fontSize: 15 }}>✍️ Firma del Licenciante</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <img src={LICENCIANTE.firma_url} alt="Firma Diego"
              style={{ maxHeight: 70, maxWidth: 200, background: '#fff', padding: 8, borderRadius: 8 }} />
            <div>
              <p style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>{LICENCIANTE.nombre}</p>
              <p style={{ color: '#64748b', fontSize: 12 }}>C.C. {LICENCIANTE.cedula} — {LICENCIANTE.ciudad_cedula}</p>
              <p style={{ color: '#64748b', fontSize: 12 }}>Domicilio: {LICENCIANTE.domicilio}, Colombia</p>
            </div>
          </div>
        </div>

        {/* Canvas firma cliente */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, marginBottom: 20, border: '1px solid #334155' }}>
          <h3 style={{ color: '#60a5fa', fontWeight: 700, marginBottom: 8, fontSize: 15 }}>✍️ Tu firma</h3>
          <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Firma dentro del recuadro con el dedo (celular) o el mouse (computador)</p>
          <div style={{ position: 'relative', background: '#fff', borderRadius: 8, overflow: 'hidden', border: '2px solid #3b82f6', touchAction: 'none' }}>
            <canvas
              ref={canvasRef} width={620} height={160}
              style={{ display: 'block', width: '100%', cursor: 'crosshair', touchAction: 'none' }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
            />
            {!hasSig && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <p style={{ color: '#94a3b8', fontSize: 14 }}>← Firma aquí →</p>
              </div>
            )}
          </div>
          <button onClick={clearCanvas} style={{ marginTop: 8, background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
            🗑 Borrar y volver a firmar
          </button>
        </div>

        {/* Aceptación y botón */}
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, border: '1px solid #334155' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 24 }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 2, accentColor: '#3b82f6', flexShrink: 0 }} />
            <span style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
              He leído, entendido y acepto en su totalidad los términos del Contrato de Licencia de Uso de Software POSmaster. Entiendo que este contrato es una licencia de uso y NO una compraventa, y que la propiedad intelectual pertenece a Diego Fernando Valdés Rangel.
            </span>
          </label>

          <button
            onClick={handleSign}
            disabled={!hasSig || !agreed || submitting}
            style={{
              width: '100%', padding: '16px', borderRadius: 12, border: 'none', cursor: !hasSig || !agreed || submitting ? 'not-allowed' : 'pointer',
              background: !hasSig || !agreed || submitting ? '#334155' : 'linear-gradient(135deg, #2563eb, #7c3aed)',
              color: !hasSig || !agreed || submitting ? '#64748b' : '#fff',
              fontWeight: 800, fontSize: 16, transition: 'all 0.2s',
            }}
          >
            {submitting ? '⏳ Procesando firma...' : !agreed ? 'Acepta los términos para continuar' : !hasSig ? 'Firma para continuar' : '✅ Firmar y descargar contrato'}
          </button>

          {(!hasSig || !agreed) && (
            <p style={{ color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 8 }}>
              {!agreed && !hasSig ? 'Acepta los términos y firma para continuar' : !agreed ? 'Acepta los términos para continuar' : 'Coloca tu firma para continuar'}
            </p>
          )}
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: 11, marginTop: 16 }}>
          © POSmaster — Diego Fernando Valdés Rangel. Todos los derechos reservados.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ContractSign;