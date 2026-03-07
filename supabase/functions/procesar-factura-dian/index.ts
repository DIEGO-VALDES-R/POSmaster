import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS para llamadas desde el navegador (React/Vite)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Configuración del cliente Supabase con privilegios de servicio para actualizar tablas
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { invoice_id } = await req.json()

    // 1. OBTENER DATOS: Buscamos la factura y sus productos relacionados
    const { data: inv, error: invError } = await supabase
      .from('invoices')
      .select(`*, invoice_items(*)`)
      .eq('id', invoice_id)
      .single()

    if (invError || !inv) throw new Error("Factura no encontrada en la base de datos.")

    const TOKEN = Deno.env.get('FACTUS_TOKEN')

    // 2. MODO SIMULACIÓN: Si el TOKEN es el temporal, devolvemos un éxito ficticio
    if (!TOKEN || TOKEN === "esperando_token") {
      const mockResponse = {
        success: true,
        data: { 
          bill: { 
            cufe: "MOCK-CUFE-" + Math.random().toString(36).substring(7), 
            public_url: "https://disenante.com/demo.pdf", 
            qr: "MOCK-QR-DATA" 
          } 
        }
      }

      // Actualizamos la base de datos con los datos de prueba
      await supabase.from('invoices').update({
        dian_status: 'exitoso_demo',
        dian_cufe: mockResponse.data.bill.cufe,
        dian_pdf_url: mockResponse.data.bill.public_url
      }).eq('id', invoice_id)

      return new Response(JSON.stringify(mockResponse), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 3. MAPEO PARA FACTUS: Estructura legal requerida
    const payload = {
      "number": 0, // 0 para que Factus asigne el siguiente en el rango
      "type_document_id": 1,
      "customer": {
        "identification": inv.customer_nit || "222222222222",
        "names": inv.customer_name || "Consumidor Final",
        "email": inv.customer_email || "cliente@tienda.com",
        "type_document_identification_id": 6,
        "type_organization_id": 1, 
        "municipality_id": 985, 
        "type_regime_id": 1
      },
      "items": inv.invoice_items.map((item: any) => ({
        "name": "Producto ID: " + (item.product_id || "Gral"),
        "quantity": item.quantity,
        "price": item.price,
        "tax_id": 1, // IVA 19%
        "discount_value": item.discount || 0
      })),
      "payment_form_id": 1, 
      "payment_method_id": 10
    }

    // 4. ENVÍO A LA API REAL (Sandbox o Producción)
    const response = await fetch("https://api-sandbox.factus.com.co/v1/bills/auth", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${TOKEN}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()

    // 5. ACTUALIZACIÓN FINAL: Guardamos el CUFE y PDF real en tu tabla 'invoices'
    if (result.success) {
      await supabase.from('invoices').update({
        dian_status: 'exitoso',
        dian_cufe: result.data.bill.cufe,
        dian_pdf_url: result.data.bill.public_url,
        dian_qr_data: result.data.bill.qr
      }).eq('id', invoice_id)
    } else {
      // Si la DIAN rechaza, guardamos el porqué
      await supabase.from('invoices').update({
        dian_status: 'error',
        dian_error_log: JSON.stringify(result.errors || result.message)
      }).eq('id', invoice_id)
    }

    return new Response(JSON.stringify(result), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 400, 
      headers: corsHeaders 
    })
  }
})