import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      company_id,   // UUID de la empresa — se usa para leer su config
      channel,      // 'whatsapp' | 'email'
      client_name,
      client_phone,
      client_email,
      service_name,
      stylist_name,
      scheduled_at,
      company_name,
    } = body;

    // ── Validaciones básicas ─────────────────────────────────────────────────
    if (!company_id) {
      return json({ success: false, error: 'company_id es requerido.' }, 400);
    }
    if (!channel || !['whatsapp', 'email'].includes(channel)) {
      return json({ success: false, error: 'Canal inválido. Usa whatsapp o email.' }, 400);
    }
    if (!scheduled_at) {
      return json({ success: false, error: 'scheduled_at es requerido.' }, 400);
    }

    // ── Leer credenciales del config de la empresa en Supabase ──────────────
    // Usamos service_role_key para que la Edge Function pueda leer
    // la tabla companies sin restricciones de RLS.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: company, error: compErr } = await supabaseAdmin
      .from('companies')
      .select('config, name')
      .eq('id', company_id)
      .single();

    if (compErr || !company) {
      return json({ success: false, error: 'Empresa no encontrada.' }, 404);
    }

    // cfg es el JSONB de companies.config
    // Estructura esperada (definida en ConfiguracionIntegraciones.tsx):
    // {
    //   whatsapp_token:    string,   // token de Meta Cloud API
    //   whatsapp_phone_id: string,   // Phone Number ID de Meta
    //   resend_api_key:    string,   // API Key de resend.com
    //   salon_email_from:  string,   // email remitente (opcional)
    // }
    const cfg = (company.config as Record<string, any>) || {};
    const resolvedName = company_name || company.name || 'el salón';

    const fechaHora = fmtDateTime(scheduled_at);
    const mensaje =
      `Hola ${client_name} 👋, te recordamos tu cita en *${resolvedName}*:\n\n` +
      `✂️ *Servicio:* ${service_name}` +
      (stylist_name ? `\n💆 *Estilista:* ${stylist_name}` : '') +
      `\n📅 *Fecha y hora:* ${fechaHora}\n\n` +
      `¡Te esperamos! Si necesitas cancelar o reprogramar, responde este mensaje.`;

    // ── WhatsApp (Meta Cloud API) ────────────────────────────────────────────
    if (channel === 'whatsapp') {
      const waToken   = cfg.whatsapp_token   as string | undefined;
      const waPhoneId = cfg.whatsapp_phone_id as string | undefined;

      if (!waToken || !waPhoneId) {
        return json({
          success: false,
          error:
            'WhatsApp no configurado para este negocio. ' +
            'Ve a Configuración → Integraciones y completa el Token y Phone ID de Meta.',
        }, 422);
      }

      if (!client_phone) {
        return json({ success: false, error: 'El cliente no tiene teléfono registrado.' }, 422);
      }

      // Normalizar número colombiano: solo dígitos, prefijo 57 si empieza por 3
      let phone = String(client_phone).replace(/\D/g, '');
      if (phone.length === 10 && phone.startsWith('3')) phone = '57' + phone;

      const waRes = await fetch(
        `https://graph.facebook.com/v19.0/${waPhoneId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${waToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: mensaje },
          }),
        },
      );

      const waData = await waRes.json();
      if (!waRes.ok) {
        console.error('[salon-reminder] WhatsApp error:', waData);
        return json(
          { success: false, error: waData?.error?.message || `HTTP ${waRes.status}`, detail: waData },
          422,
        );
      }

      return json({
        success: true,
        message: 'WhatsApp enviado ✅',
        id: waData?.messages?.[0]?.id,
      });
    }

    // ── Email (Resend) ───────────────────────────────────────────────────────
    if (channel === 'email') {
      const resendKey = cfg.resend_api_key as string | undefined;

      if (!resendKey) {
        return json({
          success: false,
          error:
            'Email no configurado para este negocio. ' +
            'Ve a Configuración → Integraciones y agrega tu API Key de Resend.',
        }, 422);
      }

      if (!client_email) {
        return json({ success: false, error: 'El cliente no tiene email registrado.' }, 422);
      }

      // Email remitente: usa el configurado por el negocio o el dominio de POSmaster
      const fromEmail = cfg.salon_email_from
        ? cfg.salon_email_from
        : `recordatorios@posmaster.co`;
      const fromDisplay = `${resolvedName} <${fromEmail}>`;

      const htmlBody = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8f5ff;border-radius:16px">
          <h2 style="color:#7c3aed;margin-bottom:4px">Recordatorio de cita 💜</h2>
          <p style="color:#64748b;font-size:14px">
            Hola <strong>${client_name}</strong>, te esperamos en
            <strong>${resolvedName}</strong>.
          </p>
          <div style="background:white;border-radius:12px;padding:20px;margin:16px 0;border-left:4px solid #7c3aed">
            <p style="margin:0 0 8px">
              <span style="color:#7c3aed;font-weight:bold">✂️ Servicio:</span> ${service_name}
            </p>
            ${stylist_name
              ? `<p style="margin:0 0 8px">
                   <span style="color:#7c3aed;font-weight:bold">💆 Estilista:</span> ${stylist_name}
                 </p>`
              : ''}
            <p style="margin:0">
              <span style="color:#7c3aed;font-weight:bold">📅 Fecha y hora:</span> ${fechaHora}
            </p>
          </div>
          <p style="color:#94a3b8;font-size:12px">
            Si necesitas cancelar o reprogramar, comunícate con nosotros.
          </p>
        </div>
      `;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    fromDisplay,
          to:      [client_email],
          subject: `Recordatorio: tu cita de ${service_name} — ${fechaHora}`,
          html:    htmlBody,
        }),
      });

      const emailData = await emailRes.json();
      if (!emailRes.ok) {
        console.error('[salon-reminder] Resend error:', emailData);
        return json(
          { success: false, error: emailData?.message || `HTTP ${emailRes.status}`, detail: emailData },
          422,
        );
      }

      return json({
        success: true,
        message: 'Email enviado ✅',
        id: emailData?.id,
      });
    }

    return json({ success: false, error: 'Canal inválido. Usa whatsapp o email.' }, 400);

  } catch (err: any) {
    console.error('[salon-reminder] Error interno:', err);
    return json({ success: false, error: err.message || 'Error interno del servidor.' }, 500);
  }
});