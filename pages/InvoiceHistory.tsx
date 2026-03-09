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
  };
  const s = map[status] || { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: <FileText size={11} /> };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.cls}`}>
      {s.icon}{s.label}
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
            <StatusBadge status={invoice.status} />
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
              <p className="font-bold text-xs">FACTURA ELECTRONICA DE VENTA</p>
              <p className="font-bold text-lg">{invoice.invoice_number}</p>
            </div>
          </div>

          <div className="mb-6 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Fecha:</span><span>{new Date(invoice.created_at).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><span className="font-bold uppercase">{invoice._customer_name || 'Consumidor Final'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">C.C./NIT:</span><span>{invoice._customer_document || '222222222222'}</span></div>
            {invoice._customer_phone && <div className="flex justify-between"><span className="text-slate-500">Telefono:</span><span>{invoice._customer_phone}</span></div>}
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
                const allItems = [
                  ...realItems.map((item: any) => ({ name: item.products?.name || 'Producto', qty: item.quantity, price: item.price, serial: item.serial_number })),
                  ...virtualItems.map((v: any) => ({ name: v.name || 'Servicio', qty: v.quantity, price: v.price, serial: null })),
                ];
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
          ) : (
            <div className="text-center bg-amber-50 p-4 rounded-lg border border-amber-100">
              <AlertTriangle size={24} className="text-amber-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-amber-700">Factura en Proceso de Envio</p>
              <p className="text-[10px] text-amber-600">El CUFE se generara una vez la DIAN valide el documento.</p>
            </div>
          )}

          {/* ── BOTÓN DIAN dentro del modal ── */}
          {dianEnabled && invoice.status === 'PENDING_ELECTRONIC' && (
            <div className="mt-4 print:hidden">
              <BotonFacturaDian
                invoiceId={invoice.id}
                tipoVenta="electronica"
              />
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-300 text-[9px] text-slate-500 leading-tight space-y-2">
            <p className="font-bold uppercase text-slate-700 text-[10px] text-center tracking-wide">Terminos y Condiciones de Garantia</p>
            <p>- Pantallas y vidrios no tienen cobertura de garantia</p>
            <p>- Accesorios tienen garantia de 30 dias</p>
            <p>- El proceso de garantia tiene duracion de 8 dias habiles</p>
            <p>- No se realizan devoluciones de dinero</p>
            <p>- El cliente debe presentar su factura original</p>
            <div className="pt-1 border-t border-slate-200 text-center">
              <p className="font-bold text-slate-600">Contacto: 316-154 55 54 | WhatsApp disponible</p>
            </div>
          </div>

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
  const { company, companyId, userRole, hasPermission } = useDatabase();

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
        .select('*, invoice_items(*, products(name))', { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

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
  }, [companyId, searchInvoice, searchDate, page, searchDoc]);

  useEffect(() => { loadInvoices(true); }, [companyId]);

  const handleSearch = () => loadInvoices(true);
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };
  useEffect(() => { if (page > 0) loadInvoices(false); }, [page]);

  // Cuando DIAN confirma éxito, actualizar status en lista sin recargar todo
  const handleDianSuccess = (invoiceId: string) => {
    setInvoices(prev => prev.map(inv =>
      inv.id === invoiceId ? { ...inv, status: 'ACCEPTED' } : inv
    ));
    setSelectedInvoice(null);
  };

  const handleDeleteInvoice = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();

    // Solo el MASTER (propietario) puede eliminar sin restricciones de permiso.
    // ADMIN y todos los demás necesitan tener can_delete_invoices = true.
    const isMaster = userRole === 'MASTER';
    const canDelete = isMaster || hasPermission('can_delete_invoices');
    if (!canDelete) {
      setPinError('');
      // Show "no permission" feedback via toast - handled below
      import('react-hot-toast').then(({ default: toast }) =>
        toast.error('No tienes permiso para eliminar facturas')
      );
      return;
    }

    const companyConfig = (company as any)?.config || {};
    const deletePin: string = companyConfig.delete_invoice_pin || '';

    if (deletePin && deletePin.length === 4) {
      // PIN is configured — open PIN modal
      setPendingDelete(inv);
      setPinInput('');
      setPinError('');
      setPinAttempts(0);
    } else {
      // No PIN configured — confirm dialog fallback (admin-only)
      if (!confirm(`¿Eliminar la factura ${inv.invoice_number}? Esta acción no se puede deshacer.`)) return;
      await doDeleteInvoice(inv);
    }
  };

  const doDeleteInvoice = async (inv: Invoice) => {
    try {
      await supabase.from('invoice_items').delete().eq('invoice_id', inv.id);
      const { error } = await supabase.from('invoices').delete().eq('id', inv.id);
      if (error) throw error;
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      setTotal(t => t - 1);
      if (selectedInvoice?.id === inv.id) setSelectedInvoice(null);
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Historial de Facturas</h2>
          <p className="text-slate-500 text-sm">Consulta, reimpresion y validacion de garantias</p>
        </div>
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <FileText size={16} className="text-blue-600" />
          <span className="text-sm font-bold text-blue-700">{total} facturas en total</span>
        </div>
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
          <button onClick={() => { setSearchDoc(''); setSearchInvoice(''); setSearchDate(''); setTimeout(() => loadInvoices(true), 50); }}
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
                  const isExpanded = expandedId === inv.id;
                  const isPending = inv.status === 'PENDING_ELECTRONIC';
                  return (
                    <React.Fragment key={inv.id}>
                      <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
                        <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-blue-600">{inv.invoice_number}</span></td>
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

                        {/* ── COLUMNA DIAN ── solo visible si DIAN habilitado */}
                        {dianEnabled && (
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            {isPending ? (
                              <button
                                onClick={() => setSelectedInvoice(inv)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                                title="Enviar a DIAN">
                                <Zap size={12} /> Facturar
                              </button>
                            ) : inv.status === 'ACCEPTED' ? (
                              <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                                <CheckCircle size={13} /> OK
                              </span>
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
                                <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><Package size={12} /> Productos</p>
                                {!inv.invoice_items || inv.invoice_items.length === 0 ? (
                                  <p className="text-xs text-slate-400 italic">Sin detalle disponible</p>
                                ) : (
                                  <div className="space-y-1">
                                    {inv.invoice_items.map((item, idx) => (
                                      <div key={idx} className="flex justify-between text-xs bg-white rounded-lg px-3 py-2 border border-slate-100">
                                        <div>
                                          <span className="font-medium text-slate-700">{item.products?.name || 'Producto'}</span>
                                          {item.serial_number && <span className="ml-2 text-[10px] bg-yellow-50 text-yellow-700 px-1 rounded font-mono">SN: {item.serial_number}</span>}
                                          <span className="text-slate-400 ml-2">x{item.quantity}</span>
                                        </div>
                                        <span className="font-bold text-slate-800">{formatMoney(item.price * item.quantity)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><DollarSign size={12} /> Resumen de pago</p>
                                <div className="bg-white rounded-lg border border-slate-100 px-3 py-3 space-y-1.5 text-xs">
                                  <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatMoney(inv.subtotal)}</span></div>
                                  <div className="flex justify-between text-slate-500"><span>IVA</span><span>{inv.tax_amount > 0 ? formatMoney(inv.tax_amount) : 'No aplica'}</span></div>
                                  <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-100"><span>Total</span><span className="text-blue-600">{formatMoney(inv.total_amount)}</span></div>
                                  <div className="flex justify-between text-slate-400 pt-1"><span>Metodo</span><span className="font-mono text-[10px] bg-slate-100 px-1 rounded">{inv.payment_method?.method || 'CASH'}</span></div>
                                </div>
                                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                  <p className="text-[10px] font-bold text-amber-700 uppercase flex items-center gap-1"><AlertCircle size={11} /> Info Garantia</p>
                                  <p className="text-[10px] text-amber-600 mt-1">
                                    Compra: {new Date(inv.created_at).toLocaleDateString()}<br />
                                    Garantia accesorios: {new Date(new Date(inv.created_at).getTime() + 30 * 86400000).toLocaleDateString()}<br />
                                    Proceso garantia: 8 dias habiles - Solo con factura original
                                  </p>
                                </div>
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
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #dc2626, #991b1b)', padding: '24px 24px 20px', textAlign: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ShieldAlert size={28} color="#fff" />
              </div>
              <h3 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 800 }}>Autorización requerida</h3>
              <p style={{ color: 'rgba(255,255,255,0.8)', margin: '6px 0 0', fontSize: 13 }}>
                Factura <strong>{pendingDelete.invoice_number}</strong>
              </p>
            </div>

            {/* Body */}
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', margin: '0 0 20px' }}>
                Ingresa el PIN de 4 dígitos para confirmar la eliminación de esta factura.
                <br /><span style={{ color: '#dc2626', fontWeight: 600 }}>Esta acción no se puede deshacer.</span>
              </p>

              {/* PIN input dots */}
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

              {/* Numpad */}
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
                          // Auto-confirm after short delay for UX
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