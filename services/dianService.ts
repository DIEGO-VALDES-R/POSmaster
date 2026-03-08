import { supabase } from '../supabaseClient'; 

export const emitirFacturaElectronica = async (invoiceId: string) => {
  try {
    // Llamamos a la Edge Function que desplegamos
    const { data, error } = await supabase.functions.invoke('procesar-factura-dian', {
      body: { invoice_id: invoiceId }
    });

    if (error) throw new Error(error.message);

    if (data && data.success) {
      return {
        success: true,
        pdfUrl: data.data.bill.public_url,
        cufe: data.data.bill.cufe
      };
    } else {
      throw new Error(data?.message || "Error desconocido en la DIAN");
    }
  } catch (error: any) {
    console.error("Error al emitir factura:", error);
    return { success: false, error: error.message };
  }
};