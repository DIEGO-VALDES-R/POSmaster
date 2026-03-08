import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Planes y sus permisos ─────────────────────────────────────────
const PLAN_FEATURES: Record<string, string[]> = {
  TRIAL:      ['pos', 'inventory', 'cash'],
  BASIC:      ['pos', 'inventory', 'cash', 'repairs', 'receivables', 'invoices'],
  PRO:        ['pos', 'inventory', 'cash', 'repairs', 'receivables', 'invoices', 'team', 'branches'],
  ENTERPRISE: ['pos', 'inventory', 'cash', 'repairs', 'receivables', 'invoices', 'team', 'branches', 'multi_branch'],
};

// ── Operaciones que requieren validación ──────────────────────────
const OPERATION_REQUIREMENTS: Record<string, {
  plans?: string[];
  permission?: string;
  roles?: string[];
}> = {
  // Equipo
  'team.invite':        { plans: ['PRO', 'ENTERPRISE'], permission: 'can_manage_team' },
  'team.edit':          { plans: ['PRO', 'ENTERPRISE'], permission: 'can_manage_team' },
  'team.delete':        { plans: ['PRO', 'ENTERPRISE'], permission: 'can_manage_team' },
  // Sucursales
  'branch.create':      { plans: ['ENTERPRISE'] },
  'branch.edit':        { plans: ['PRO', 'ENTERPRISE'], roles: ['ADMIN', 'MASTER'] },
  // Ventas
  'sale.create':        { permission: 'can_sell' },
  'sale.refund':        { permission: 'can_refund' },
  // Inventario
  'inventory.edit':     { permission: 'can_manage_inventory' },
  'inventory.delete':   { roles: ['ADMIN', 'MASTER'], permission: 'can_manage_inventory' },
  // Caja
  'cash.open':          { permission: 'can_open_cash' },
  'cash.close':         { permission: 'can_open_cash' },
  // Reportes
  'reports.view':       { permission: 'can_view_reports' },
  // Configuración
  'settings.edit':      { roles: ['ADMIN', 'MASTER'] },
  'settings.branding':  { roles: ['ADMIN', 'MASTER'] },
  'settings.dian':      { roles: ['ADMIN', 'MASTER'] },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Obtener JWT del usuario ───────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ allowed: false, reason: 'No autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // ── Verificar sesión ──────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ allowed: false, reason: 'Sesión inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Obtener operación solicitada ──────────────────────────────
    const { operation } = await req.json();
    if (!operation) {
      return new Response(JSON.stringify({ allowed: false, reason: 'Operación no especificada' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Super admin tiene acceso total ────────────────────────────
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (isSuperAdmin) {
      return new Response(JSON.stringify({ allowed: true, role: 'SUPER_ADMIN' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Obtener perfil y empresa del usuario ──────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, custom_role, permissions, company_id, is_active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ allowed: false, reason: 'Perfil no encontrado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!profile.is_active) {
      return new Response(JSON.stringify({ allowed: false, reason: 'Usuario desactivado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('subscription_plan, subscription_status')
      .eq('id', profile.company_id)
      .single();

    if (!company || company.subscription_status !== 'ACTIVE') {
      return new Response(JSON.stringify({ allowed: false, reason: 'Suscripción inactiva' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── MASTER y ADMIN tienen acceso total dentro de su empresa ───
    const isAdminOrMaster = ['MASTER', 'ADMIN'].includes(profile.role);
    if (isAdminOrMaster) {
      // Solo verificar plan para operaciones que lo requieren
      const req_plan = OPERATION_REQUIREMENTS[operation]?.plans;
      if (req_plan && !req_plan.includes(company.subscription_plan)) {
        return new Response(JSON.stringify({
          allowed: false,
          reason: `Esta operación requiere plan ${req_plan.join(' o ')}`,
          current_plan: company.subscription_plan,
          required_plans: req_plan,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ allowed: true, role: profile.role }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Verificar requisitos de la operación para STAFF ───────────
    const requirements = OPERATION_REQUIREMENTS[operation];
    if (!requirements) {
      // Operación no registrada = permitir si está autenticado
      return new Response(JSON.stringify({ allowed: true, role: profile.role }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar plan
    if (requirements.plans && !requirements.plans.includes(company.subscription_plan)) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: `Esta función requiere plan ${requirements.plans.join(' o ')}`,
        current_plan: company.subscription_plan,
        required_plans: requirements.plans,
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verificar rol
    if (requirements.roles && !requirements.roles.includes(profile.role)) {
      return new Response(JSON.stringify({
        allowed: false,
        reason: 'Tu rol no permite esta operación',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verificar permiso específico
    if (requirements.permission) {
      const perms = profile.permissions || {};
      if (!perms[requirements.permission]) {
        return new Response(JSON.stringify({
          allowed: false,
          reason: 'No tienes permiso para esta operación',
          missing_permission: requirements.permission,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ allowed: true, role: profile.role }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ allowed: false, reason: 'Error interno', detail: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
