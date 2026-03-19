import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, FileText, Eye, X, ChevronDown, ChevronUp,
  User, Calendar, Hash, DollarSign, AlertCircle,
  CheckCircle, Clock, XCircle, Printer, MessageCircle,
  Mail, QrCode, AlertTriangle, Package, Zap, Trash2, Lock, ShieldAlert
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useCurrency } from '../contexts/CurrencyContext';
import { useDatabase } from '../contexts/DatabaseContext';
import BotonFacturaDian from '../components/BotonFacturaDian';

interface InvoiceItem {
  id: string;
  product_id: string;
  description?: string;
  quantity: number;
  price: number;
  tax_rate: number;
  serial_number?: string;
  products?: { name: string };
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  payment_method: any;
  created_at: string;
  dian_cufe?: string;
  invoice_items?: InvoiceItem[];
  _customer_name?: string;
  _customer_document?: string;
  _customer_email?: string;
  _customer_phone?: string;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    ACCEPTED:           { label: 'DIAN: Aceptada',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle size={11} /> },
    REJECTED:           { label: 'DIAN: Rechazada', cls: 'bg-red-100 text-red-700 border-red-200',             icon: <XCircle size={11} /> },
    PENDING_ELECTRONIC: { label: 'Pend. Envio',     cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: <Clock size={11} /> },
    COMPLETED:          { label: 'Completado',       cls: 'bg-blue-100 text-blue-700 border-blue-200',          icon: <CheckCircle size={11} /> },
    PAID:               { label: 'Pagado',           cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle size={11} /> },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: <FileText size={11} /> };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
};

// ── Badge para tipo de documento de apartado ───────────────────────────────
const ApartadoBadge: React.FC<{ saleType?: string }> = ({ saleType }) => {
  if (!saleType) return null;
  const map: Record<string, { label: string; cls: string }> = {
    APARTADO_INICIAL: { label: 'Abono inicial', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    CUOTA:            { label: 'Cuota',          cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    ENTREGA_FINAL:    { label: 'Entrega final',  cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  };
  const cfg = map[saleType];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
      📦 {cfg.label}
    </span>
  );
};

interface InvoiceDetailModalProps {
  invoice: Invoice;
  company: any;
  onClose: () => void;
  formatMoney: (n: number) => string;
  onDianSuccess: (invoiceId: string) => void;
}

const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ invoice, company, onClose, formatMoney, onDianSuccess }) => {
  const companyName = company?.name ?? 'IPHONESHOP USA';
  const showIva = (invoice.tax_amount ?? 0) > 0;
  const dianEnabled = company?.dian_settings?.is_active || false;
  const isApartado = (invoice as any).business_type === 'apartado';

  const handlePrint = () => setTimeout(() => window.print(), 200);

  const handleWhatsApp = () => {
    const msg = `Hola ${invoice._customer_name || 'Cliente'}, tu factura ${invoice.invoice_number} de ${companyName} por ${formatMoney(invoice.total_amount)}. Gracias!`;
    const phone = invoice._customer_phone?.replace(/\D/g, '');
    const finalPhone = phone && phone.length === 10 ? `57${phone}` : phone;
    window.open(finalPhone ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Factura ${invoice.invoice_number} - ${companyName}`);
    const body = encodeURIComponent(`Hola ${invoice._customer_name || 'Cliente'},\n\nGracias por tu compra.\nTotal: ${formatMoney(invoice.total_amount)}\n\n${companyName}`);
    const target = invoice._customer_email || prompt('Ingrese el correo del cliente:');
    if (target) window.location.href = `mailto:${target}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[95vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 print:hidden flex-shrink-0">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-slate-800 text-sm">Detalle de Factura</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={invoice.status} />
              {isApartado && <ApartadoBadge saleType={(invoice as any).sale_type} />}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleWhatsApp} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600" title="WhatsApp"><MessageCircle size={16} /></button>
            <button onClick={handleEmail} className="p-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700" title="Email"><Mail size={16} /></button>
            <button onClick={handlePrint} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700" title="Imprimir"><Printer size={16} /></button>
            <button onClick={onClose} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg"><X size={16} /></button>
          </div>
        </div>

        <div id="invoice-print-area" className="flex-1 overflow-auto p-6 bg-white text-sm font-mono text-slate-900">
          <div className="text-center mb-6">
            {company?.logo_url && (
              <div className="flex justify-center mb-3">
                <img src={company.logo_url} alt="Logo" className="h-16 w-auto object-contain" style={{ maxWidth: '140px' }} />
              </div>
            )}
            <h2 className="font-bold text-xl uppercase mb-1">{companyName}</h2>
            <p className="text-xs">NIT: {company?.nit ?? '-'}</p>
            <p className="text-xs">{company?.address ?? ''}</p>
            <p className="text-xs">Tel: {company?.phone ?? ''}</p>
            <p className="text-xs text-slate-500">{company?.email ?? ''}</p>
            <div className="my-4 border-t border-b border-slate-300 py-2">
              {isApartado ? (
                <>
                  <p className="font-bold text-xs">COMPROBANTE DE APARTADO</p>
                  <ApartadoBadge saleType={(invoice as any).sale_type} />
                </>
              ) : (
                <p className="font-bold text-xs">FACTURA ELECTRONICA DE VENTA</p>
              )}
              <p className="font-bold text-lg">{invoice.invoice_number}</p>
            </div>
          </div>

          <div className="mb-6 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Fecha:</span><span>{new Date(invoice.created_at).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><span className="font-bold uppercase">{invoice._customer_name || 'Consumidor Final'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">C.C./NIT:</span><span>{invoice._customer_document || '222222222222'}</span></div>
            {invoice._customer_phone && <div className="flex justify-between"><span className="text-slate-500">Telefono:</span><span>{invoice._customer_phone}</span></div>}
            {/* Referencia apartado si aplica */}
            {isApartado && (invoice as any).reference_id && (
              <div className="flex justify-between">
                <span className="text-slate-500">Ref. apartado:</span>
                <span className="font-mono text-xs">#{(invoice as any).reference_id.slice(-8).toUpperCase()}</span>
              </div>
            )}
          </div>

          <table className="w-full mb-6 text-xs border-collapse">
            <thead>
              <tr className="border-b border-black">
                <th className="text-left py-1">Cant.</th>
                <th className="text-left py-1">Descripcion</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const realItems = invoice.invoice_items || [];
                const virtualItems = (invoice.payment_method as any)?.virtual_items || [];
                // Para apartados, construir item desde las notas de la factura
                const allItems = [
                  ...realItems.map((item: any) => ({ name: item.description || item.products?.name || 'Producto', qty: item.quantity, price: item.price, serial: item.serial_number })),
                  ...virtualItems.map((v: any) => ({ name: v.name || 'Servicio', qty: v.quantity, price: v.price, serial: null })),
                ];
                // Si es apartado y no hay items, mostrar descripción desde notas
                if (allItems.length === 0 && isApartado) {
                  const notes = (invoice as any).notes || '';
                  const productMatch = notes.match(/^[^|—]+/);
                  const productName = productMatch ? productMatch[0].trim() : 'Apartado';
                  return (
                    <tr className="border-b border-slate-100">
                      <td className="py-2 align-top">1</td>
                      <td className="py-2 align-top">
                        <div>{productName}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{notes}</div>
                      </td>
                      <td className="py-2 text-right align-top">{formatMoney(invoice.total_amount)}</td>
                    </tr>
                  );
                }
                if (allItems.length === 0) {
                  return <tr><td colSpan={3} className="text-center text-slate-400 py-4">Sin items registrados</td></tr>;
                }
                return allItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 align-top">{item.qty}</td>
                    <td className="py-2 align-top">
                      <div>{item.name}</div>
                      {item.serial && <div className="text-[10px] text-slate-500">SN: {item.serial}</div>}
                    </td>
                    <td className="py-2 text-right align-top">{formatMoney(item.price * item.qty)}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>

          <div className="space-y-1 mb-6 border-t border-black pt-2 text-xs">
            <div className="flex justify-between"><span>Subtotal:</span><span>{formatMoney(invoice.subtotal)}</span></div>
            {showIva
              ? <div className="flex justify-between text-slate-600"><span>IVA:</span><span>{formatMoney(invoice.tax_amount)}</span></div>
              : <div className="flex justify-between text-slate-400"><span>IVA:</span><span>No aplica</span></div>
            }
            <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-slate-300">
              <span>TOTAL A PAGAR:</span><span>{formatMoney(invoice.total_amount)}</span>
            </div>
          </div>

          {invoice.dian_cufe ? (
            <div className="text-center space-y-3">
              <div className="text-[10px] text-slate-400 break-all bg-slate-50 p-2 rounded"><span className="font-bold">CUFE:</span> {invoice.dian_cufe}</div>
              <div className="flex justify-center my-4"><QrCode size={80} className="text-slate-900" /></div>
            </div>
          ) : !isApartado ? (
            <div className="text-center bg-amber-50 p-4 rounded-lg border border-amber-100">
              <AlertTriangle size={24} className="text-amber-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-amber-700">Factura en Proceso de Envio</p>
              <p className="text-[10px] text-amber-600">El CUFE se generara una vez la DIAN valide el documento.</p>
            </div>
          ) : null}

          {/* ── BOTÓN DIAN dentro del modal ── */}
          {dianEnabled && !isApartado && invoice.status === 'PENDING_ELECTRONIC' && (
            <div className="mt-4 print:hidden">
              <BotonFacturaDian
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoice_number}
                currentStatus={invoice.status}
                cufe={invoice.dian_cufe}
                tipo={(invoice as any).customers?.document_number ? 'FEV' : 'POS'}
                onSuccess={(cufe: string, pdfUrl: string) => {
                  onDianSuccess(invoice.id);
                }}
              />
            </div>
          )}

          {(() => {
            const terms = (company?.config as any)?.invoice_terms?.trim();
            if (!terms) return null;
            return (
              <div className="mt-6 pt-4 border-t border-slate-300 text-[9px] text-slate-500 leading-tight">
                <p className="font-bold uppercase text-slate-700 text-[10px] text-center tracking-wide mb-2">
                  Términos y Condiciones
                </p>
                {terms.split('\n').map((line: string, i: number) => (
                  <p key={i} className={line.startsWith('•') || line.startsWith('-') ? 'ml-1' : line === line.toUpperCase() && line.length > 3 ? 'font-bold text-slate-600 mt-1.5 uppercase text-[9px]' : ''}>
                    {line || <br />}
                  </p>
                ))}
              </div>
            );
          })()}

          <p className="text-xs font-bold mt-6 text-center">GRACIAS POR SU COMPRA!</p>
        </div>
      </div>
      <style>{`
        @media print {
          @page { margin: 0; size: 80mm auto; }
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area { position: fixed !important; top: 0 !important; left: 0 !important; width: 80mm !important; background: white !important; }
        }
      `}</style>
    </div>
  );
};

const InvoiceHistory: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { company, companyId, userRole, hasPermission, session, refreshAll } = useDatabase();

  // Filtrar facturas por tipo de negocio activo
  const businessTypes: string[] = Array.isArray((company?.config as any)?.business_types)
    ? (company?.config as any).business_types
    : (company?.config as any)?.business_type ? [(company?.config as any).business_type] : [];

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchDoc, setSearchDoc] = useState('');
  const [searchInvoice, setSearchInvoice] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // ── Filtro de tipo de documento ───────────────────────────────────────────
  const [filterType, setFilterType] = useState<'TODOS' | 'VENTA' | 'APARTADO'>('TODOS');

  // ── PIN DELETE STATE ──────────────────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);

  const dianEnabled = (company as any)?.dian_settings?.is_active || false;

  const enrichInvoice = (inv: any): Invoice => {
    const pm = inv.payment_method || {};
    return {
      ...inv,
      _customer_name:     pm.customer_name     || inv.customer_name     || null,
      _customer_document: pm.customer_document || inv.customer_document || null,
      _customer_email:    pm.customer_email    || inv.customer_email    || null,
      _customer_phone:    pm.customer_phone    || inv.customer_phone    || null,
    };
  };

  const loadInvoices = useCallback(async (reset = false) => {
    if (!companyId) return;
    setLoading(true);
    const currentPage = reset ? 0 : page;
    if (reset) setPage(0);
    try {
      let query = supabase
        .from('invoices')
        .select('*, invoice_items(id, product_id, description, quantity, price, tax_rate, serial_number, products(name))', { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

      // ── FIX: siempre incluir 'apartado' en el filtro de business_type ──
      // Las facturas de apartados tienen business_type='apartado' y deben
      // aparecer siempre en el historial, sin importar el tipo de negocio.
      if (businessTypes.length > 0) {
        // Agregar 'apartado' a los tipos permitidos para que siempre se muestren
        const allAllowedTypes = [...new Set([...businessTypes, 'apartado'])].join(',');
        query = query.or(`business_type.in.(${allAllowedTypes}),business_type.is.null`);
      }

      // ── Filtro por tipo de documento (venta normal vs apartado) ──
      if (filterType === 'VENTA') {
        query = query.neq('business_type', 'apartado');
      } else if (filterType === 'APARTADO') {
        query = query.eq('business_type', 'apartado');
      }

      if (searchInvoice.trim()) query = query.ilike('invoice_number', `%${searchInvoice.trim()}%`);
      if (searchDate) {
        query = query.gte('created_at', `${searchDate}T00:00:00`).lte('created_at', `${searchDate}T23:59:59`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      let enriched = (data || []).map(enrichInvoice);

      if (searchDoc.trim()) {
        const term = searchDoc.trim().toLowerCase();
        enriched = enriched.filter(inv =>
          (inv._customer_document || '').toLowerCase().includes(term) ||
          (inv._customer_name     || '').toLowerCase().includes(term)
        );
      }

      setInvoices(reset ? enriched : prev => [...prev, ...enriched]);
      setTotal(count || 0);
    } catch (e: any) {
      console.error('Error cargando facturas:', e);
    } finally {
      setLoading(false);
    }
  }, [companyId, searchInvoice, searchDate, page, searchDoc, filterType, businessTypes]);

  useEffect(() => { loadInvoices(true); }, [companyId]);

  const handleSearch = () => loadInvoices(true);
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };
  useEffect(() => { if (page > 0) loadInvoices(false); }, [page]);

  // Re-cargar cuando cambia el filtro de tipo
  useEffect(() => { loadInvoices(true); }, [filterType]);

  // Cuando DIAN confirma éxito, actualizar status en lista sin recargar todo
  const handleDianSuccess = (invoiceId: string) => {
    setInvoices(prev => prev.map(inv =>
      inv.id === invoiceId ? { ...inv, status: 'ACCEPTED' } : inv
    ));
    setSelectedInvoice(null);
  };

  const handleDeleteInvoice = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();

    const isMaster = userRole === 'MASTER';
    const canDelete = isMaster || hasPermission('can_delete_invoices');
    if (!canDelete) {
      import('react-hot-toast').then(({ default: toast }) =>
        toast.error('No tienes permiso para eliminar facturas')
      );
      return;
    }

    const companyConfig = (company as any)?.config || {};
    const deletePin: string = companyConfig.delete_invoice_pin || '';

    if (deletePin && deletePin.length === 4) {
      setPendingDelete(inv);
      setPinInput('');
      setPinError('');
      setPinAttempts(0);
    } else {
      if (!confirm(`¿Eliminar la factura ${inv.invoice_number}? Esta acción no se puede deshacer.`)) return;
      await doDeleteInvoice(inv);
    }
  };

  const doDeleteInvoice = async (inv: Invoice) => {
    try {
      // 1. Obtener items de la factura para restaurar stock
      const { data: items } = await supabase
        .from('invoice_items')
        .select('product_id, quantity')
        .eq('invoice_id', inv.id);

      // 2. Eliminar items y factura
      await supabase.from('invoice_items').delete().eq('invoice_id', inv.id);
      const { error } = await supabase.from('invoices').delete().eq('id', inv.id);
      if (error) throw error;

      // 3. Restaurar stock de cada producto
      if (items && items.length > 0) {
        for (const item of items) {
          if (!item.product_id) continue;
          const { data: prod } = await supabase
            .from('products').select('stock_quantity').eq('id', item.product_id).single();
          if (prod) {
            await supabase.from('products')
              .update({ stock_quantity: (prod.stock_quantity ?? 0) + item.quantity })
              .eq('id', item.product_id);
          }
        }
      }

      // 4. Descontar el valor de la caja activa
      if (session?.id) {
        const amountPaid = inv.payment_method?.amount ?? inv.total_amount ?? 0;
        const newTotal = Math.max(0, (session.total_sales_cash ?? 0) - amountPaid);
        await supabase.from('cash_register_sessions')
          .update({ total_sales_cash: newTotal })
          .eq('id', session.id);
      }

      // 5. Actualizar UI local
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      setTotal(t => t - 1);
      if (selectedInvoice?.id === inv.id) setSelectedInvoice(null);

      // 6. Refrescar contexto global
      await refreshAll();

    } catch (e: any) {
      alert('Error al eliminar: ' + e.message);
    }
  };

  const handlePinConfirm = async () => {
    if (!pendingDelete) return;
    const companyConfig = (company as any)?.config || {};
    const deletePin: string = companyConfig.delete_invoice_pin || '';

    if (pinInput === deletePin) {
      setPendingDelete(null);
      setPinInput('');
      setPinError('');
      await doDeleteInvoice(pendingDelete);
    } else {
      const newAttempts = pinAttempts + 1;
      setPinAttempts(newAttempts);
      setPinInput('');
      if (newAttempts >= 3) {
        setPendingDelete(null);
        setPinError('');
        import('react-hot-toast').then(({ default: toast }) =>
          toast.error('Demasiados intentos fallidos. Operación cancelada.')
        );
      } else {
        setPinError(`PIN incorrecto. ${3 - newAttempts} intento(s) restante(s).`);
      }
    }
  };

  const hasMore = invoices.length < total;
  const totalShown = invoices.reduce((s, inv) => s + inv.total_amount, 0);

  // Contadores por tipo para los badges de los tabs
  const countApartados = invoices.filter(inv => (inv as any).business_type === 'apartado').length;
  const countVentas    = invoices.filter(inv => (inv as any).business_type !== 'apartado').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Historial de Facturas</h2>
          <p className="text-slate-500 text-sm">Consulta, reimpresion, apartados y validacion de garantias</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <FileText size={16} className="text-blue-600" />
          <span className="text-sm font-bold text-blue-700">{total} facturas en total</span>
        </div>
      </div>

      {/* ── FILTROS TIPO DOCUMENTO ─────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key: 'TODOS',    label: 'Todas',    count: total },
          { key: 'VENTA',    label: 'Ventas',   count: countVentas },
          { key: 'APARTADO', label: 'Apartados', count: countApartados },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setFilterType(tab.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              filterType === tab.key ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                filterType === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Search size={13} /> Buscar factura para garantia o consulta
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Cedula o nombre del cliente..." value={searchDoc}
              onChange={e => setSearchDoc(e.target.value)} onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="relative">
            <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Numero de factura (POS-...)" value={searchInvoice}
              onChange={e => setSearchInvoice(e.target.value)} onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="relative">
            <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSearch} disabled={loading}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            <Search size={15} />{loading ? 'Buscando...' : 'Buscar'}
          </button>
          <button onClick={() => { setSearchDoc(''); setSearchInvoice(''); setSearchDate(''); setFilterType('TODOS'); setTimeout(() => loadInvoices(true), 50); }}
            className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
            Limpiar
          </button>
        </div>
      </div>

      {(searchDoc || searchInvoice || searchDate) && invoices.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs text-blue-500 font-medium">Resultados</p>
            <p className="text-xl font-bold text-blue-700">{invoices.length}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-xs text-emerald-500 font-medium">Total facturado</p>
            <p className="text-xl font-bold text-emerald-700">{formatMoney(totalShown)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Cargando facturas...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No se encontraron facturas</p>
            <p className="text-xs mt-1">Intenta con otro criterio de busqueda</p>
          </div>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Factura','Fecha','Cliente','Cedula/NIT','Total','Estado', dianEnabled ? 'DIAN' : '', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map(inv => {
                  const isExpanded  = expandedId === inv.id;
                  const isPending   = inv.status === 'PENDING_ELECTRONIC';
                  const isApartado  = (inv as any).business_type === 'apartado';
                  return (
                    <React.Fragment key={inv.id}>
                      <tr
                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${isApartado ? 'border-l-2 border-l-indigo-300' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-xs font-bold text-blue-600">{inv.invoice_number}</span>
                            {/* Badge de apartado visible en la fila */}
                            {isApartado && <ApartadoBadge saleType={(inv as any).sale_type} />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {new Date(inv.created_at).toLocaleDateString()}<br />
                          <span className="text-slate-400">{new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{inv._customer_name || <span className="text-slate-400 italic">Consumidor Final</span>}</div>
                          {inv._customer_phone && <div className="text-xs text-slate-400">{inv._customer_phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {inv._customer_document
                            ? <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">{inv._customer_document}</span>
                            : <span className="text-slate-300 text-xs italic">-</span>}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800">{formatMoney(inv.total_amount)}</td>
                        <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>

                        {/* ── COLUMNA DIAN — solo para ventas normales ── */}
                        {dianEnabled && (
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            {!isApartado && isPending ? (
                              <button
                                onClick={() => setSelectedInvoice(inv)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                                title="Enviar a DIAN">
                                <Zap size={12} /> Facturar
                              </button>
                            ) : !isApartado && inv.status === 'ACCEPTED' ? (
                              <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                                <CheckCircle size={13} /> OK
                              </span>
                            ) : isApartado ? (
                              <span className="text-xs text-slate-400">—</span>
                            ) : null}
                          </td>
                        )}

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={e => { e.stopPropagation(); setSelectedInvoice(inv); }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver factura completa">
                              <Eye size={15} />
                            </button>
                            <button onClick={e => handleDeleteInvoice(inv, e)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar factura">
                              <Trash2 size={15} />
                            </button>
                            {isExpanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-blue-50/40">
                          <td colSpan={dianEnabled ? 8 : 7} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                                  <Package size={12} /> {isApartado ? 'Detalle del Apartado' : 'Productos'}
                                </p>
                                {isApartado ? (
                                  // Vista especial para apartados
                                  <div className="bg-white rounded-lg border border-indigo-100 px-4 py-3 space-y-1.5 text-xs">
                                    {(inv as any).notes && (
                                      <p className="text-slate-600">{(inv as any).notes}</p>
                                    )}
                                    {(inv as any).reference_id && (
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Ref. apartado:</span>
                                        <span className="font-mono font-bold text-indigo-700">
                                          #{(inv as any).reference_id.slice(-8).toUpperCase()}
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Tipo:</span>
                                      <ApartadoBadge saleType={(inv as any).sale_type} />
                                    </div>
                                  </div>
                                ) : (() => {
                                  const realItems = inv.invoice_items || [];
                                  const virtualItems: any[] = (inv.payment_method as any)?.virtual_items || [];
                                  const allItems = [
                                    ...realItems.map((item: any) => ({
                                      name: item.description || item.products?.name || 'Producto',
                                      qty: item.quantity,
                                      price: item.price,
                                      serial: item.serial_number,
                                    })),
                                    ...virtualItems.map((v: any) => ({
                                      name: v.name || 'Servicio',
                                      qty: v.quantity || 1,
                                      price: v.price || 0,
                                      serial: null,
                                    })),
                                  ];
                                  if (allItems.length === 0) {
                                    return (
                                      <div className="text-xs text-slate-400 italic space-y-1 p-2">
                                        <p>Sin detalle disponible.</p>
                                        <p className="text-[10px]">Facturas anteriores a la actualización del sistema. El total es correcto.</p>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="space-y-1">
                                      {allItems.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-xs bg-white rounded-lg px-3 py-2 border border-slate-100">
                                          <div>
                                            <span className="font-medium text-slate-700">{item.name}</span>
                                            {item.serial && <span className="ml-2 text-[10px] bg-yellow-50 text-yellow-700 px-1 rounded font-mono">SN: {item.serial}</span>}
                                            <span className="text-slate-400 ml-2">x{item.qty}</span>
                                          </div>
                                          <span className="font-bold text-slate-800">{formatMoney(item.price * item.qty)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><DollarSign size={12} /> Resumen de pago</p>
                                <div className="bg-white rounded-lg border border-slate-100 px-3 py-3 space-y-1.5 text-xs">
                                  <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatMoney(inv.subtotal)}</span></div>
                                  <div className="flex justify-between text-slate-500"><span>IVA</span><span>{inv.tax_amount > 0 ? formatMoney(inv.tax_amount) : 'No aplica'}</span></div>
                                  <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-100"><span>Total</span><span className="text-blue-600">{formatMoney(inv.total_amount)}</span></div>
                                  <div className="flex justify-between text-slate-400 pt-1">
                                    <span>Metodo</span>
                                    <span className="font-mono text-[10px] bg-slate-100 px-1 rounded">
                                      {inv.payment_method?.method || 'CASH'}
                                    </span>
                                  </div>
                                </div>
                                {!isApartado && (
                                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <p className="text-[10px] font-bold text-amber-700 uppercase flex items-center gap-1"><AlertCircle size={11} /> Info Garantia</p>
                                    <p className="text-[10px] text-amber-600 mt-1">
                                      Compra: {new Date(inv.created_at).toLocaleDateString()}<br />
                                      Garantia accesorios: {new Date(new Date(inv.created_at).getTime() + 30 * 86400000).toLocaleDateString()}<br />
                                      Proceso garantia: 8 dias habiles - Solo con factura original
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {hasMore && (
              <div className="p-4 border-t border-slate-200 text-center">
                <button onClick={() => setPage(p => p + 1)} disabled={loading}
                  className="px-6 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  {loading ? 'Cargando...' : `Cargar mas (${invoices.length} de ${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          company={company}
          onClose={() => setSelectedInvoice(null)}
          formatMoney={formatMoney}
          onDianSuccess={handleDianSuccess}
        />
      )}

      {/* ── PIN DELETE MODAL ───────────────────────────────────────────── */}
      {pendingDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 360, boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #dc2626, #991b1b)', padding: '24px 24px 20px', textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ShieldAlert size={28} color="#fff" />
              </div>
              <h3 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 800 }}>Autorización requerida</h3>
              <p style={{ color: 'rgba(255,255,255,0.8)', margin: '6px 0 0', fontSize: 13 }}>
                Factura <strong>{pendingDelete.invoice_number}</strong>
              </p>
            </div>

            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', margin: '0 0 20px' }}>
                Ingresa el PIN de 4 dígitos para confirmar la eliminación de esta factura.
                <br /><span style={{ color: '#dc2626', fontWeight: 600 }}>Esta acción no se puede deshacer.</span>
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{
                    width: 48, height: 56, borderRadius: 12, border: `2px solid ${pinError ? '#dc2626' : pinInput.length > i ? '#dc2626' : '#e2e8f0'}`,
                    background: pinInput.length > i ? '#fef2f2' : '#f8fafc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 800, color: '#dc2626',
                    transition: 'all 0.15s',
                  }}>
                    {pinInput.length > i ? '●' : ''}
                  </div>
                ))}
              </div>

              {pinError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', textAlign: 'center', fontSize: 13, color: '#dc2626', marginBottom: 12 }}>
                  {pinError}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, idx) => (
                  <button key={idx} disabled={!k}
                    onClick={() => {
                      if (k === '⌫') {
                        setPinInput(p => p.slice(0, -1));
                        setPinError('');
                      } else if (k && pinInput.length < 4) {
                        const next = pinInput + k;
                        setPinInput(next);
                        setPinError('');
                        if (next.length === 4) {
                          setTimeout(() => {
                            const companyConfig = (company as any)?.config || {};
                            const deletePin: string = companyConfig.delete_invoice_pin || '';
                            if (next === deletePin) {
                              setPendingDelete(null);
                              setPinInput('');
                              doDeleteInvoice(pendingDelete!);
                            } else {
                              const newAttempts = pinAttempts + 1;
                              setPinAttempts(newAttempts);
                              setPinInput('');
                              if (newAttempts >= 3) {
                                setPendingDelete(null);
                                import('react-hot-toast').then(({ default: toast }) =>
                                  toast.error('Demasiados intentos. Operación cancelada.')
                                );
                              } else {
                                setPinError(`PIN incorrecto. ${3 - newAttempts} intento(s) restante(s).`);
                              }
                            }
                          }, 120);
                        }
                      }
                    }}
                    style={{
                      padding: '14px 0', borderRadius: 10, border: 'none', cursor: k ? 'pointer' : 'default',
                      background: !k ? 'transparent' : k === '⌫' ? '#fef2f2' : '#f8fafc',
                      color: k === '⌫' ? '#dc2626' : '#1e293b',
                      fontSize: 18, fontWeight: 700,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (k) (e.currentTarget as HTMLButtonElement).style.background = k === '⌫' ? '#fee2e2' : '#f1f5f9'; }}
                    onMouseLeave={e => { if (k) (e.currentTarget as HTMLButtonElement).style.background = !k ? 'transparent' : k === '⌫' ? '#fef2f2' : '#f8fafc'; }}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <button onClick={() => { setPendingDelete(null); setPinInput(''); setPinError(''); }}
                style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceHistory;