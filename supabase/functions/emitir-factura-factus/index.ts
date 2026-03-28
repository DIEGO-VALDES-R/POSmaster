import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// EDGE FUNCTION: emitir-factura-factus  v3
// Emite facturas electrónicas a través de múltiples proveedores DIAN:
//   - Factus  (OAuth2 password grant)
//   - Siigo   (Bearer token con Partner-Id)
//   - Alegra  (Basic Auth email:token)
//
// Proveedor activo: company.config.dian_proveedor ('factus' | 'siigo' | 'alegra')
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── Mapeos ────────────────────────────────────────────────────────────────────
const DOC_TYPE_MAP: Record<string, number> = {
  CC: 13, CE: 22, NIT: 31, PAS: 41, TI: 12, RC: 11, DE: 50,
};
const PAYMENT_METHOD_MAP: Record<string, string> = {
  CASH: '10', CARD: '48', TRANSFER: '42', CREDIT: 'ZZZ', PAYPAL: '48',
};
const MUNICIPALITY_MAP: Record<string, number> = {
  'bogota': 149, 'bogotá': 149, 'medellin': 448, 'medellín': 448,
  'cali': 679, 'barranquilla': 53, 'cartagena': 120, 'bucaramanga': 86,
  'cucuta': 198, 'cúcuta': 198, 'pereira': 563, 'manizales': 407,
  'ibague': 344, 'ibagué': 344, 'villavicencio': 660, 'santa marta': 612,
  'neiva': 482, 'pasto': 548, 'armenia': 43, 'monteria': 464,
  'popayan': 569, 'valledupar': 650, 'tunja': 646,
};
const getMunicipalityId = (address = '', city = ''): number => {
  const text = (city || address).toLowerCase();
  for (const [key, id] of Object.entries(MUNICIPALITY_MAP)) {
    if (text.includes(key)) return id;
  }
  return 149;
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS COMUNES
// ══════════════════════════════════════════════════════════════════════════════

function buildCommonData(invoice: any) {
  const company  = invoice.companies;
  const customer = invoice.customers;
  const isConsumidorFinal = !customer?.document_number
    || customer.document_number === '0'
    || customer.document_number === '222222222222';

  const municipioId = getMunicipalityId(
    customer?.address || company?.address,
    customer?.city    || company?.city,
  );

  const fechaHoy = new Date().toISOString().split('T')[0];

  const paymentMethods = Array.isArray(invoice.payment_method)
    ? invoice.payment_method
    : [{ method: typeof invoice.payment_method === 'string' ? invoice.payment_method : 'CASH', amount: invoice.total_amount }];

  const isCredit = paymentMethods.some((p: any) => p.method === 'CREDIT');
  const fechaVencimiento = isCredit
    ? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    : fechaHoy;

  const items = (invoice.invoice_items || []).map((item: any, idx: number) => {
    const product   = item.products;
    const unitPrice = parseFloat(item.price);
    const qty       = parseInt(item.quantity);
    const taxPct    = parseFloat(item.tax_rate) || 0;
    const priceBase = taxPct > 0 ? unitPrice / (1 + taxPct / 100) : unitPrice;
    return { product, unitPrice, qty, taxPct, priceBase, idx };
  });

  return { company, customer, isConsumidorFinal, municipioId, fechaHoy, fechaVencimiento, isCredit, items, paymentMethods };
}

// ══════════════════════════════════════════════════════════════════════════════
// FACTUS
// ══════════════════════════════════════════════════════════════════════════════

async function getFactusToken(supabase: any, companyId: string, cfg: any, base: string): Promise<string | null> {
  if (cfg.factus_token && cfg.factus_token_expiry) {
    if (Date.now() < new Date(cfg.factus_token_expiry).getTime() - 5 * 60 * 1000) {
      return cfg.factus_token;
    }
  }
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      grant_type:    'password',
      client_id:     cfg.factus_client_id,
      client_secret: cfg.factus_client_secret,
      username:      cfg.factus_username,
      password:      cfg.factus_password,
    }),
  });
  if (!res.ok) { console.error('[Factus] Auth error:', res.status); return null; }
  const data = await res.json();
  if (!data.access_token) return null;
  const expiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await supabase.from('companies').update({
    config: { ...cfg, factus_token: data.access_token, factus_token_expiry: expiry },
  }).eq('id', companyId);
  return data.access_token;
}

async function getFactusRangeId(base: string, token: string, prefix: string, savedId?: number | null): Promise<number | null> {
  if (savedId) return savedId;
  try {
    const res = await fetch(`${base}/v1/numbering-ranges`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    let ranges: any[] = [];
    if (Array.isArray(data)) ranges = data;
    else if (Array.isArray(data?.data)) ranges = data.data;
    else if (Array.isArray(data?.data?.data)) ranges = data.data.data;
    let range = ranges.find((r: any) => r.prefix?.toUpperCase() === prefix?.toUpperCase() && !r.is_expired);
    if (!range) range = ranges.find((r: any) => !r.is_expired);
    if (!range) range = ranges[0];
    return range?.id || null;
  } catch { return null; }
}

async function emitirFactus(supabase: any, invoice: any, cfg: any, tipoDoc: string) {
  const env  = cfg.factus_env || 'sandbox';
  const BASE = env === 'production' ? 'https://api.factus.com.co' : 'https://api-sandbox.factus.com.co';

  const hasOAuth = cfg.factus_client_id && cfg.factus_client_secret && cfg.factus_username && cfg.factus_password;
  if (!hasOAuth && !cfg.factus_token) throw new Error('Credenciales Factus no configuradas. Ve a Configuración → Facturación DIAN.');

  const token = hasOAuth
    ? await getFactusToken(supabase, invoice.companies.id, cfg, BASE)
    : cfg.factus_token;
  if (!token) throw new Error('No se pudo obtener token de Factus. Verifica credenciales OAuth.');

  const rangeId = await getFactusRangeId(BASE, token, cfg.dian_prefix || 'SETP', cfg.numbering_range_id);
  if (!rangeId) throw new Error('No hay rango de numeración activo en Factus. Configura el prefijo en Ajustes → DIAN.');

  const { company, customer, isConsumidorFinal, municipioId, fechaHoy, fechaVencimiento, isCredit, items, paymentMethods } = buildCommonData(invoice);

  const buyerPayload = isConsumidorFinal ? {
    identification: '222222222222', dv: null, company: null, trade_name: null,
    names: 'Consumidor Final', address: null, email: 'consumidor@factus.com.co',
    mobile: null, phone: null,
    type_document_identification_id: 13, type_organization_id: 2,
    municipality_id: 149, type_regime_id: 2, type_liability_id: 117, type_currency_id: 35,
  } : {
    identification: customer.document_number, dv: null,
    company: customer.name, trade_name: customer.name, names: customer.name,
    address: customer.address || 'No registrada',
    email:   customer.email   || `${customer.document_number}@sin-email.com`,
    mobile:  customer.phone   || null, phone: customer.phone || null,
    type_document_identification_id: DOC_TYPE_MAP[customer.document_type || 'CC'] || 13,
    type_organization_id: customer.document_type === 'NIT' ? 1 : 2,
    municipality_id: municipioId, type_regime_id: 2, type_liability_id: 117, type_currency_id: 35,
  };

  const factusItems = items.map(({ product, qty, taxPct, priceBase, idx }: any) => ({
    code_reference:    product?.sku || `ITEM-${idx + 1}`,
    name:              (product?.name || `Producto ${idx + 1}`).substring(0, 100),
    quantity:          qty,
    discount_rate:     '0.00',
    price:             priceBase.toFixed(6),
    tax_rate:          taxPct.toFixed(2),
    unit_measure_id:   70,
    standard_code_id:  1,
    is_excluded:       taxPct === 0 ? 1 : 0,
    tribute_id:        1,
    withholding_taxes: [],
  }));

  const payload = {
    document:            tipoDoc,
    numbering_range_id:  rangeId,
    reference_code:      invoice.invoice_number || null,
    observation:         invoice.notes || null,
    payment_form:        isCredit ? '2' : '1',
    payment_due_date:    fechaVencimiento,
    payment_method_code: PAYMENT_METHOD_MAP[paymentMethods[0]?.method || 'CASH'] || '10',
    billing_period:      null,
    order_reference:     null,
    customer:            buyerPayload,
    items:               factusItems,
    withholding_taxes:   [],
  };

  const endpoint = tipoDoc === '03' ? `${BASE}/v1/bills/pos` : `${BASE}/v1/bills/validate`;
  console.log(`[Factus] POST ${endpoint} env=${env}`);

  const factRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload),
  });
  const factData = await factRes.json();
  if (!factRes.ok || factData.status === 'error') {
    const errDetail = factData.data?.errors ? JSON.stringify(factData.data.errors) : '';
    throw new Error(`${factData.message || 'Error Factus'} ${errDetail}`.trim());
  }
  const bill = factData.data?.bill || factData.bill || factData.data || {};
  return {
    cufe:    bill.cufe || bill.uuid || '',
    pdf_url: bill.public_url || bill.pdf_url || '',
    numero:  bill.number || '',
    env,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// SIIGO
// ══════════════════════════════════════════════════════════════════════════════

async function getSiigoToken(supabase: any, companyId: string, cfg: any): Promise<string | null> {
  if (cfg.siigo_token && cfg.siigo_token_expiry) {
    if (Date.now() < new Date(cfg.siigo_token_expiry).getTime() - 10 * 60 * 1000) {
      return cfg.siigo_token;
    }
  }
  const res = await fetch('https://api.siigo.com/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Partner-Id': cfg.siigo_partner_id || '' },
    body: JSON.stringify({ username: cfg.siigo_username, access_key: cfg.siigo_access_key }),
  });
  if (!res.ok) { console.error('[Siigo] Auth error:', res.status); return null; }
  const data = await res.json();
  if (!data.access_token) return null;
  const expiry = new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString();
  await supabase.from('companies').update({
    config: { ...cfg, siigo_token: data.access_token, siigo_token_expiry: expiry },
  }).eq('id', companyId);
  return data.access_token;
}

async function emitirSiigo(supabase: any, invoice: any, cfg: any) {
  if (!cfg.siigo_username || !cfg.siigo_access_key) {
    throw new Error('Credenciales Siigo no configuradas. Ve a Configuración → Facturación DIAN.');
  }
  const token = await getSiigoToken(supabase, invoice.companies.id, cfg);
  if (!token) throw new Error('No se pudo autenticar con Siigo. Verifica usuario y access_key.');

  const { customer, isConsumidorFinal, fechaHoy, fechaVencimiento, isCredit, items } = buildCommonData(invoice);

  const siigoItems = items.map(({ product, qty, unitPrice, taxPct, idx }: any) => ({
    code:        product?.sku || `ITEM${idx + 1}`,
    description: (product?.name || `Producto ${idx + 1}`).substring(0, 255),
    quantity:    qty,
    price:       unitPrice,
    discount:    0,
    taxes:       taxPct > 0 ? [{ id: cfg.siigo_tax_id || '001' }] : [],
  }));

  const payload = {
    document:     { id: parseInt(cfg.siigo_document_id || '0') || undefined },
    date:         fechaHoy,
    customer: {
      person_type:    isConsumidorFinal ? 'Person' : (customer?.document_type === 'NIT' ? 'Company' : 'Person'),
      id_type:        { code: isConsumidorFinal ? '22' : (customer?.document_type === 'NIT' ? '31' : '13') },
      identification: isConsumidorFinal ? '222222222222' : customer?.document_number,
      name:           [isConsumidorFinal ? 'Consumidor Final' : customer?.name],
      address: {
        address:  customer?.address || 'Colombia',
        city:     { country_code: 'Co', state_code: '11', city_code: '11001' },
      },
      phones:  [{ number: customer?.phone || '0000000000' }],
      email:   customer?.email || 'sin-email@sin.com',
    },
    currency:     { code: 'COP', exchange_rate: 1 },
    items:        siigoItems,
    payments:     [{
      id:       parseInt(cfg.siigo_payment_id || '0') || undefined,
      value:    invoice.total_amount,
      due_date: fechaVencimiento,
    }],
    observations: invoice.notes || '',
  };

  console.log('[Siigo] POST /v1/invoices');
  const res = await fetch('https://api.siigo.com/v1/invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Partner-Id':    cfg.siigo_partner_id || '',
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const errMsg = data.Errors?.map((e: any) => e.Message).join(', ') || data.message || `Error ${res.status}`;
    throw new Error(`Siigo: ${errMsg}`);
  }
  return {
    cufe:    data.cufe || String(data.id || ''),
    pdf_url: data.pdf_download_url || data.public_url || '',
    numero:  data.name || String(data.number || ''),
    env:     'production',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ALEGRA
// ══════════════════════════════════════════════════════════════════════════════

async function emitirAlegra(invoice: any, cfg: any) {
  if (!cfg.alegra_email || !cfg.alegra_token) {
    throw new Error('Credenciales Alegra no configuradas. Ve a Configuración → Facturación DIAN.');
  }
  const basicAuth = btoa(`${cfg.alegra_email}:${cfg.alegra_token}`);
  const { customer, isConsumidorFinal, fechaHoy, fechaVencimiento, isCredit, items } = buildCommonData(invoice);

  const alegraItems = items.map(({ product, qty, unitPrice, taxPct, idx }: any) => ({
    name:     (product?.name || `Producto ${idx + 1}`).substring(0, 255),
    price:    unitPrice,
    quantity: qty,
    discount: 0,
    tax:      taxPct > 0 ? [{ id: cfg.alegra_tax_id || 3 }] : [],
  }));

  const payload = {
    date:    fechaHoy,
    dueDate: fechaVencimiento,
    client: {
      name:           isConsumidorFinal ? 'Consumidor Final' : customer?.name,
      identification: isConsumidorFinal ? '222222222222'    : customer?.document_number,
      email:          customer?.email || null,
      address:        { address: customer?.address || 'Colombia' },
    },
    items:        alegraItems,
    paymentType:  isCredit ? 'credit' : 'cash',
    observations: invoice.notes || '',
    stamp:        { generateStamp: true },
  };

  console.log('[Alegra] POST /api/v1/invoices');
  const res = await fetch('https://app.alegra.com/api/v1/invoices', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Alegra: ${data.message || data.error || `Error ${res.status}`}`);
  }
  return {
    cufe:    data.stamp?.cufe || data.cufe || String(data.id || ''),
    pdf_url: data.url || data.pdf || '',
    numero:  String(data.numberTemplate?.fullNumber || data.number || ''),
    env:     'production',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, error: 'No autenticado' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return json({ success: false, error: 'Sesión inválida' }, 401);

    const body = await req.json();
    const { invoice_id, tipo_documento } = body;
    const tipoDoc = tipo_documento || '01';
    if (!invoice_id) return json({ success: false, error: 'invoice_id requerido' }, 400);

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select(`
        *,
        invoice_items (id, quantity, price, tax_rate, discount, total, products(id, name, sku, description)),
        customers (id, name, document_type, document_number, email, address, phone, city),
        companies (id, name, nit, email, phone, address, city, config)
      `)
      .eq('id', invoice_id)
      .single();

    if (invErr || !invoice) return json({ success: false, error: 'Factura no encontrada' }, 404);
    if (['ACCEPTED', 'SENT_TO_DIAN'].includes(invoice.status) && invoice.dian_cufe) {
      return json({ success: false, error: 'Esta factura ya fue enviada a la DIAN', cufe: invoice.dian_cufe }, 409);
    }

    const cfg       = invoice.companies.config || {};
    const proveedor = cfg.dian_proveedor || 'factus';
    console.log(`[DIAN] proveedor=${proveedor} invoice=${invoice_id}`);

    let resultado: { cufe: string; pdf_url: string; numero: string; env: string };

    if (proveedor === 'siigo') {
      resultado = await emitirSiigo(supabase, invoice, cfg);
    } else if (proveedor === 'alegra') {
      resultado = await emitirAlegra(invoice, cfg);
    } else {
      resultado = await emitirFactus(supabase, invoice, cfg, tipoDoc);
    }

    // Guardar resultado
    await supabase.from('invoices').update({
      status:       'ACCEPTED',
      dian_cufe:    resultado.cufe,
      dian_qr_data: resultado.cufe,
    }).eq('id', invoice_id);

    try {
      await supabase.from('electronic_documents').upsert({
        company_id:    invoice.company_id,
        sale_id:       invoice_id,
        cufe:          resultado.cufe,
        status:        'ACCEPTED',
        dian_response: JSON.stringify(resultado),
        sent_at:       new Date().toISOString(),
        validated_at:  new Date().toISOString(),
      }, { onConflict: 'sale_id' });
    } catch (_) { /* tabla opcional */ }

    return json({
      success:        true,
      cufe:           resultado.cufe,
      pdf_url:        resultado.pdf_url,
      numero_factura: resultado.numero,
      environment:    resultado.env,
      proveedor,
      message:        `✅ Factura electrónica validada por DIAN vía ${proveedor}`,
    });

  } catch (err: any) {
    console.error('[emitir-factura] Error crítico:', err.message);
    return json({ success: false, error: err.message || 'Error interno del servidor' }, 500);
  }
});