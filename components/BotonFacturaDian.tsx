import React, { useState } from 'react';
import { FileText, Loader2, CheckCircle, XCircle, ExternalLink, Receipt } from 'lucide-react';
import { emitirFacturaElectronica, TipoDocumento } from '../services/dianService';
import toast from 'react-hot-toast';

interface Props {
  invoiceId: string;
  invoiceNumber?: string;
  currentStatus?: string;
  cufe?: string;
  onSuccess?: (cufe: string, pdfUrl: string) => void;
  tipo?: TipoDocumento;       // 'FEV' (defecto) | 'POS'
  compact?: boolean;           // botón pequeño para tabla
}

const BotonFacturaDian: React.FC<Props> = ({
  invoiceId,
  invoiceNumber,
  currentStatus,
  cufe,
  onSuccess,
  tipo = 'FEV',
  compact = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ cufe?: string; pdf_url?: string } | null>(null);

  // Ya fue aceptada
  if (currentStatus === 'ACCEPTED' && (cufe || resultado?.cufe)) {
    const theCufe = resultado?.cufe || cufe!;
    const pdfUrl  = resultado?.pdf_url;
    if (compact) {
      return (
        <div className="flex items-center gap-1">
          <CheckCircle size={13} className="text-emerald-500" />
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer"
              className="text-xs text-emerald-600 hover:underline flex items-center gap-0.5">
              PDF <ExternalLink size={10} />
            </a>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
          <CheckCircle size={16} /> Aceptada por DIAN
        </div>
        <div className="text-[10px] text-slate-400 break-all bg-slate-50 p-2 rounded-lg font-mono">
          <span className="font-bold text-slate-500">CUFE: </span>{theCufe}
        </div>
        {pdfUrl && (
          <a href={pdfUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            <ExternalLink size={12} /> Ver factura en Factus
          </a>
        )}
      </div>
    );
  }

  // Rechazada
  if (currentStatus === 'REJECTED') {
    return compact
      ? <span className="flex items-center gap-1 text-xs text-red-500"><XCircle size={12} /> Rechazada</span>
      : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-600 text-sm font-semibold">
            <XCircle size={16} /> Rechazada por DIAN
          </div>
          <button onClick={handleEmitir}
            className="text-xs text-blue-600 hover:underline">
            Reintentar envío
          </button>
        </div>
      );
  }

  async function handleEmitir() {
    const label = tipo === 'POS' ? 'documento POS' : 'factura electrónica';
    const confirmar = window.confirm(
      `¿Enviar ${label} ${invoiceNumber ? `#${invoiceNumber}` : ''} a la DIAN?\n\n` +
      `Esta acción genera un documento legal. Una vez enviado no puede modificarse.`
    );
    if (!confirmar) return;

    setLoading(true);
    try {
      const res = await emitirFacturaElectronica(invoiceId, tipo);

      if (res.success && res.cufe) {
        setResultado({ cufe: res.cufe, pdf_url: res.pdf_url });
        toast.success(`✅ ${res.message || 'Factura enviada a DIAN'}`);
        if (res.pdf_url) window.open(res.pdf_url, '_blank');
        onSuccess?.(res.cufe, res.pdf_url || '');
      } else {
        toast.error(`Error DIAN: ${res.error || 'Error desconocido'}`);
        console.error('[BotonFacturaDian]', res.detail);
      }
    } catch (err: any) {
      toast.error('Error de conexión. Verifica tu internet e intenta de nuevo.');
      console.error('[BotonFacturaDian] Error de red:', err);
    } finally {
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <button onClick={handleEmitir} disabled={loading}
        title="Enviar a DIAN"
        className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors">
        {loading
          ? <Loader2 size={11} className="animate-spin" />
          : <FileText size={11} />
        }
        {loading ? 'Enviando...' : 'DIAN'}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-medium mb-0.5">
          {tipo === 'POS' ? '🧾 Documento equivalente POS' : '📄 Factura electrónica de venta (FEV)'}
        </p>
        <p className="text-[11px] text-blue-500">
          {tipo === 'POS'
            ? 'Documento válido para ventas a consumidor final sin NIT.'
            : 'Factura con plena validez legal ante la DIAN.'}
        </p>
      </div>
      <button
        onClick={handleEmitir}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Enviando a DIAN...</>
          : <><FileText size={16} /> {tipo === 'POS' ? 'Emitir doc. POS' : 'Emitir factura electrónica'}</>
        }
      </button>
    </div>
  );
};

export default BotonFacturaDian;