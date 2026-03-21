import React, { useState, useEffect } from 'react';
import { Filter, AlertTriangle, Clock, X, DollarSign, Plus, Receipt, RefreshCw } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { receivableService, Receivable } from '../services/receivableService';
import { useCompany } from '../hooks/useCompany';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';
import InvoiceModal from '../components/InvoiceModal';
import toast from 'react-hot-toast';

const AccountsReceivable: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { companyId } = useCompany();
  const { company } = useDatabase();

  // Invoice modal state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceSale, setInvoiceSale] = useState<any>(null);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [summary, setSummary] = useState({ totalPortfolio: 0, overdue30: 0, collectedThisMonth: 0 });
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedRec, setSelectedRec] = useState<Receivable | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({ customer_name: '', total_amount: '', paid_amount: '0', due_date: '', notes: '' });

  // Facturas POS con saldo pendiente
  const [activeTab, setActiveTab] = useState<'cartera' | 'facturas'>('cartera');
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [showInvPayModal, setShowInvPayModal] = useState(false);
  const [selectedInv, setSelectedInv] = useState<any>(null);
  const [invPayAmount, setInvPayAmount] = useState('');
  const [invPayMethod, setInvPayMethod] = useState('CASH');
  const [savingInv, setSavingInv] = useState(false);

  const loadPendingInvoices = async () => {
    if (!companyId) return;
    setLoadingInv(true);
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('company_id', companyId)
      .in('payment_status', ['PARTIAL', 'PENDING'])
      .gt('balance_due', 0)
      .order('created_at', { ascending: false });
    setPendingInvoices(data || []);
    setLoadingInv(false);
  };

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [data, sum] = await Promise.all([
        receivableService.getAll(companyId),
        receivableService.getSummary(companyId)
      ]);
      setReceivables(data); setSummary(sum);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); loadPendingInvoices(); }, [companyId]);

  const handlePayment = async () => {
    if (!selectedRec?.id || !payAmount || !companyId) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0 || amount > (selectedRec.balance + 0.01)) {
      toast.error('Monto inválido'); return;
    }
    setSaving(true);
    try {
      // 1. Registrar abono en receivables
      await receivableService.registerPayment(selectedRec.id, amount, payMethod, payNotes);

      // 2. Generar número de recibo de abono
      const ts  = Date.now().toString().slice(-6);
      const rnd = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      const recNum = `REC-${ts}${rnd}`;

      // 3. Crear factura / recibo de abono en historial
      const isFullPayment = amount >= selectedRec.balance - 0.01;
      const { data: inv } = await supabase.from('invoices').insert({
        company_id:        companyId,
        invoice_number:    recNum,
        customer_name:     selectedRec.customer_name,
        customer_document: selectedRec.customer_document || null,
        subtotal:          amount,
        tax_amount:        0,
        total_amount:      amount,
        status:            'COMPLETED',
        payment_method:    [{ method: payMethod, amount }],
        notes:             `Abono CxC${selectedRec.notes ? ' — ' + selectedRec.notes : ''} · Referencia original: ${selectedRec.invoice_id || '—'}`,
      }).select('*').single();

      if (inv) {
        // Items de la factura — descripción del abono
        await supabase.from('invoice_items').insert({
          invoice_id:  inv.id,
          product_id:  null,
          quantity:    1,
          price:       amount,
          tax_rate:    0,
          discount:    0,
        });

        // 4. Preparar sale para InvoiceModal
        const saleForModal = {
          ...inv,
          customer_name:     selectedRec.customer_name,
          customer_document: selectedRec.customer_document,
          _cartItems: [{
            product:  { name: isFullPayment ? 'Pago total CxC' : 'Abono a cuenta por cobrar' },
            quantity: 1,
            price:    amount,
            tax_rate: 0,
            discount: 0,
          }],
        };

        setShowPayModal(false);
        setInvoiceSale(saleForModal);
        setShowInvoiceModal(true);
        toast.success(`✅ Abono de ${formatMoney(amount)} registrado · Recibo ${recNum}`);
        load();
      } else {
        toast.success('Abono registrado');
        setShowPayModal(false);
        load();
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // Registrar abono sobre factura POS
  const handleInvoicePayment = async () => {
    if (!selectedInv || !invPayAmount) return;
    const amount = parseFloat(invPayAmount);
    if (isNaN(amount) || amount <= 0 || amount > selectedInv.balance_due) { toast.error('Monto inválido'); return; }
    setSavingInv(true);
    const newPaid   = (selectedInv.amount_paid || 0) + amount;
    const newBalance = Math.max((selectedInv.balance_due || 0) - amount, 0);
    const newStatus  = newBalance === 0 ? 'PAID' : 'PARTIAL';
    const { error } = await supabase.from('invoices')
      .update({ amount_paid: newPaid, balance_due: newBalance, payment_status: newStatus })
      .eq('id', selectedInv.id);
    if (!error) {
      await supabase.from('invoice_payments').insert({
        company_id:     companyId,
        invoice_id:     selectedInv.id,
        source_type:    'POS',
        amount,
        payment_method: invPayMethod.toLowerCase(),
        user_name:      'Admin',
      });
    }
    setSavingInv(false);
    if (error) { toast.error(error.message); return; }
    toast.success(newBalance === 0 ? '✅ Factura pagada completamente' : `Abono registrado. Saldo: ${formatMoney(newBalance)}`);
    setShowInvPayModal(false); setSelectedInv(null); setInvPayAmount('');
    loadPendingInvoices();
  };

  const handleCreateReceivable = async () => {
    const total = parseFloat(newForm.total_amount);
    const paid = parseFloat(newForm.paid_amount || '0');
    if (!newForm.customer_name || !total || !newForm.due_date) { toast.error('Completa los campos requeridos'); return; }
    setSaving(true);
    try {
      await receivableService.create({
        company_id: companyId!, customer_name: newForm.customer_name,
        total_amount: total, paid_amount: paid,
        due_date: new Date(newForm.due_date).toISOString(),
        status: 'PENDING', notes: newForm.notes,
      });
      toast.success('Cuenta por cobrar creada');
      setShowNewModal(false);
      setNewForm({ customer_name: '', total_amount: '', paid_amount: '0', due_date: '', notes: '' });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const totalPendingInvoices = pendingInvoices.reduce((s, i) => s + (i.balance_due || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Cuentas por Cobrar</h2>
          <p className="text-slate-500">Gestión de cartera y créditos a clientes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { load(); loadPendingInvoices(); }} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-50 text-sm">
            <RefreshCw size={14} /> Actualizar
          </button>
          <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
            <Plus size={16} /> Nueva Cuenta
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-sm font-medium">Cartera manual</p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1">{formatMoney(summary.totalPortfolio)}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-red-500 text-sm font-medium">Vencida &gt; 30 días</p>
          <h3 className="text-2xl font-bold text-red-600 mt-1">{formatMoney(summary.overdue30)}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-green-500 text-sm font-medium">Recaudado este mes</p>
          <h3 className="text-2xl font-bold text-green-600 mt-1">{formatMoney(summary.collectedThisMonth)}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-amber-200">
          <p className="text-amber-600 text-sm font-medium flex items-center gap-1"><Receipt size={14} /> Saldo facturas POS</p>
          <h3 className="text-2xl font-bold text-amber-700 mt-1">{formatMoney(totalPendingInvoices)}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{pendingInvoices.length} factura{pendingInvoices.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([['facturas', '🧾 Facturas con Saldo'], ['cartera', '📋 Cartera Manual']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: FACTURAS CON SALDO ── */}
      {activeTab === 'facturas' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loadingInv ? (
            <div className="p-12 text-center text-slate-400">Cargando facturas...</div>
          ) : pendingInvoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Receipt size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin facturas con saldo pendiente</p>
              <p className="text-sm mt-1">Las facturas con abono parcial aparecerán aquí</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Factura', 'Cliente', 'Total', 'Pagado', 'Saldo', 'Estado', 'Acción'].map(h => (
                  <th key={h} className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingInvoices.map(inv => {
                  const pm = inv.payment_method || {};
                  const clientName = pm.customer_name || inv.client_name || '—';
                  const statusColor = inv.payment_status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                  const statusLabel = inv.payment_status === 'PARTIAL' ? '⏳ Parcial' : '🔴 Pendiente';
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono font-bold text-slate-700">{inv.invoice_number}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{clientName}</p>
                        <p className="text-xs text-slate-400">{new Date(inv.created_at).toLocaleDateString('es-CO')}</p>
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-700">{formatMoney(inv.total_amount)}</td>
                      <td className="px-5 py-3 text-green-700 font-medium">{formatMoney(inv.amount_paid || 0)}</td>
                      <td className="px-5 py-3 font-bold text-red-600">{formatMoney(inv.balance_due)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => { setSelectedInv(inv); setInvPayAmount(''); setInvPayMethod('CASH'); setShowInvPayModal(true); }}
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100">
                          <DollarSign size={12} /> Registrar Abono
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB: CARTERA MANUAL ── */}
      {activeTab === 'cartera' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400">Cargando cartera...</div>
          ) : receivables.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No hay cuentas por cobrar pendientes</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Cliente','Referencia','Monto Orig.','Saldo','Vencimiento','Estado','Acción'].map(h => (
                  <th key={h} className="px-6 py-4 font-semibold text-slate-700">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receivables.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">{rec.customer_name}</td>
                    <td className="px-6 py-4 text-xs text-slate-400">{rec.notes || '—'}</td>
                    <td className="px-6 py-4 text-slate-500">{formatMoney(rec.total_amount)}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{formatMoney(rec.balance)}</td>
                    <td className="px-6 py-4 text-slate-600">{new Date(rec.due_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        rec.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
                        rec.status === 'PARTIAL' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {rec.status === 'OVERDUE' ? <AlertTriangle size={12} /> : <Clock size={12} />}
                        {rec.status === 'OVERDUE' ? 'Vencida' : rec.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => { setSelectedRec(rec); setPayAmount(''); setPayMethod('CASH'); setPayNotes(''); setShowPayModal(true); }}
                        className="text-blue-600 font-medium hover:underline text-xs">
                        Registrar Abono
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal abono factura POS */}
      {showInvPayModal && selectedInv && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Registrar Abono</h3>
                <p className="text-xs text-slate-400 mt-0.5">Factura {selectedInv.invoice_number}</p>
              </div>
              <button onClick={() => setShowInvPayModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                {[
                  ['Cliente',          (selectedInv.payment_method?.customer_name || '—')],
                  ['Total factura',    formatMoney(selectedInv.total_amount)],
                  ['Ya pagado',        formatMoney(selectedInv.amount_paid || 0)],
                  ['Saldo pendiente',  formatMoney(selectedInv.balance_due)],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-slate-500">{l}</span>
                    <span className="font-semibold text-slate-800">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto del Abono</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" value={invPayAmount} onChange={e => setInvPayAmount(e.target.value)}
                    max={selectedInv.balance_due} placeholder="0"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={() => setInvPayAmount(String(selectedInv.balance_due))}
                  className="mt-1 text-xs text-blue-600 hover:underline">Pagar saldo completo ({formatMoney(selectedInv.balance_due)})</button>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago</label>
                <select value={invPayMethod} onChange={e => setInvPayMethod(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="NEQUI">Nequi</option>
                  <option value="DAVIPLATA">Daviplata</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowInvPayModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancelar</button>
              <button onClick={handleInvoicePayment} disabled={savingInv || !invPayAmount}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {savingInv ? 'Guardando...' : '✅ Registrar Abono'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPayModal && selectedRec && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">Registrar Abono</h3>
              <button onClick={() => setShowPayModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-slate-500">Cliente</p>
                <p className="font-semibold text-slate-800">{selectedRec.customer_name}</p>
                <p className="text-sm text-slate-500 mt-2">Saldo pendiente</p>
                <p className="font-bold text-red-600 text-xl">{formatMoney(selectedRec.balance)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto del Abono</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} max={selectedRec.balance} placeholder="0"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="NEQUI">Nequi</option>
                  <option value="DAVIPLATA">Daviplata</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                <input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Referencia de pago..."
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowPayModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancelar</button>
              <button onClick={handlePayment} disabled={saving || !payAmount} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : 'Registrar Abono'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">Nueva Cuenta por Cobrar</h3>
              <button onClick={() => setShowNewModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
                <input value={newForm.customer_name} onChange={e => setNewForm(p => ({ ...p, customer_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto Total *</label>
                  <input type="number" value={newForm.total_amount} onChange={e => setNewForm(p => ({ ...p, total_amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Abono Inicial</label>
                  <input type="number" value={newForm.paid_amount} onChange={e => setNewForm(p => ({ ...p, paid_amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Vencimiento *</label>
                <input type="date" value={newForm.due_date} onChange={e => setNewForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <input value={newForm.notes} onChange={e => setNewForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowNewModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancelar</button>
              <button onClick={handleCreateReceivable} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de factura / recibo de abono ── */}
      <InvoiceModal
        isOpen={showInvoiceModal}
        onClose={() => { setShowInvoiceModal(false); setInvoiceSale(null); }}
        sale={invoiceSale}
        company={company as any}
      />
    </div>
  );
};

export default AccountsReceivable;