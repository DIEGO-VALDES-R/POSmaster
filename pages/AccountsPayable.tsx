import React, { useState, useEffect } from 'react';
import {
  Plus, X, DollarSign, AlertTriangle, Clock,
  CheckCircle, RefreshCw, Trash2, Building2,
  CreditCard, FileText, ChevronDown
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { payableService, Payable } from '../services/payableService';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────
const STATUS_CFG = {
  PENDING:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700',  icon: <Clock size={11} /> },
  OVERDUE:  { label: 'Vencida',   cls: 'bg-red-100 text-red-700',      icon: <AlertTriangle size={11} /> },
  PARTIAL:  { label: 'Parcial',   cls: 'bg-blue-100 text-blue-700',    icon: <ChevronDown size={11} /> },
  PAID:     { label: 'Pagada',    cls: 'bg-green-100 text-green-700',  icon: <CheckCircle size={11} /> },
};

const PAYMENT_METHODS = [
  { value: 'CASH',      label: '💵 Efectivo' },
  { value: 'TRANSFER',  label: '🏛️ Transferencia' },
  { value: 'CARD',      label: '💳 Tarjeta' },
  { value: 'NEQUI',     label: '🟣 Nequi' },
  { value: 'DAVIPLATA', label: '🔴 Daviplata' },
];

const CATEGORIES = ['proveedor', 'servicios', 'arriendo', 'nómina', 'impuestos', 'otro'];

const emptyForm = {
  supplier_name: '',
  concept:       '',
  total_amount:  '',
  paid_amount:   '0',
  due_date:      '',
  notes:         '',
  invoice_ref:   '',
};

// ─────────────────────────────────────────────────────────────
const AccountsPayable: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { companyId, branchId, session } = useDatabase();

  const [payables,  setPayables]  = useState<Payable[]>([]);
  const [summary,   setSummary]   = useState({ totalPending: 0, overdue: 0, paidThisMonth: 0 });
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  // ── Modal nueva CxP ──────────────────────────────────────────
  const [showNew,  setShowNew]  = useState(false);
  const [newForm,  setNewForm]  = useState(emptyForm);
  const [saving,   setSaving]   = useState(false);

  // ── Modal pago ───────────────────────────────────────────────
  const [showPay,      setShowPay]      = useState(false);
  const [selectedPay,  setSelectedPay]  = useState<Payable | null>(null);
  const [payAmount,    setPayAmount]    = useState('');
  const [payMethod,    setPayMethod]    = useState('CASH');
  const [payNotes,     setPayNotes]     = useState('');
  const [payToExpense, setPayToExpense] = useState(true);
  const [savingPay,    setSavingPay]    = useState(false);

  // ── Carga ────────────────────────────────────────────────────
  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [data, sum] = await Promise.all([
        payableService.getAll(companyId),
        payableService.getSummary(companyId),
      ]);
      setPayables(data);
      setSummary(sum);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [companyId]);

  // ── Crear CxP ────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newForm.supplier_name.trim()) { toast.error('Ingresa el proveedor'); return; }
    if (!newForm.concept.trim())       { toast.error('Ingresa el concepto');   return; }
    if (!newForm.total_amount)         { toast.error('Ingresa el monto total'); return; }
    if (!newForm.due_date)             { toast.error('Ingresa la fecha de vencimiento'); return; }
    setSaving(true);
    try {
      await payableService.create({
        company_id:    companyId!,
        supplier_name: newForm.supplier_name.trim(),
        concept:       newForm.concept.trim(),
        total_amount:  parseFloat(newForm.total_amount),
        paid_amount:   parseFloat(newForm.paid_amount || '0'),
        due_date:      newForm.due_date,
        status:        'PENDING',
        notes:         newForm.notes.trim() || undefined,
        invoice_ref:   newForm.invoice_ref.trim() || undefined,
      });
      toast.success('✅ Cuenta por pagar creada');
      setShowNew(false);
      setNewForm(emptyForm);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Registrar pago ───────────────────────────────────────────
  const handlePayment = async () => {
    if (!selectedPay?.id) return;
    const amount = parseFloat(payAmount);
    const maxBalance = selectedPay.total_amount - selectedPay.paid_amount;
    if (isNaN(amount) || amount <= 0)     { toast.error('Monto inválido'); return; }
    if (amount > maxBalance + 0.01)       { toast.error(`El monto supera el saldo (${formatMoney(maxBalance)})`); return; }

    setSavingPay(true);
    try {
      await payableService.registerPayment({
        payable_id:  selectedPay.id,
        amount,
        method:      payMethod,
        notes:       payNotes || undefined,
        session_id:  payToExpense && session?.status === 'OPEN' ? session.id : undefined,
        company_id:  companyId!,
        branch_id:   branchId || undefined,
      });
      toast.success(
        amount >= maxBalance - 0.01
          ? '✅ Cuenta pagada completamente'
          : `💰 Pago parcial registrado — Saldo: ${formatMoney(maxBalance - amount)}`
      );
      if (payToExpense && session?.status === 'OPEN') {
        toast.success('📋 Egreso registrado en Control de Caja', { duration: 3000 });
      }
      setShowPay(false);
      setSelectedPay(null);
      setPayAmount('');
      setPayNotes('');
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingPay(false);
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────
  const handleDelete = async (p: Payable) => {
    if (!window.confirm(`¿Eliminar la cuenta por pagar de "${p.supplier_name}"?`)) return;
    try {
      await payableService.delete(p.id!);
      toast.success('Cuenta eliminada');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Vista ────────────────────────────────────────────────────
  const displayed = activeTab === 'pending'
    ? payables.filter(p => p.status !== 'PAID')
    : payables;

  const f = (k: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setNewForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Cuentas por Pagar</h2>
          <p className="text-slate-500 text-sm mt-0.5">Gestión de obligaciones con proveedores</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-600 hover:bg-slate-50 text-sm">
            <RefreshCw size={14} /> Actualizar
          </button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm">
            <Plus size={16} /> Nueva CxP
          </button>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-sm font-medium flex items-center gap-1.5">
            <Building2 size={14} /> Total por Pagar
          </p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1">{formatMoney(summary.totalPending)}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-red-200">
          <p className="text-red-500 text-sm font-medium flex items-center gap-1.5">
            <AlertTriangle size={14} /> Vencidas
          </p>
          <h3 className="text-2xl font-bold text-red-600 mt-1">{formatMoney(summary.overdue)}</h3>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-green-200">
          <p className="text-green-600 text-sm font-medium flex items-center gap-1.5">
            <CheckCircle size={14} /> Pagado este mes
          </p>
          <h3 className="text-2xl font-bold text-green-700 mt-1">{formatMoney(summary.paidThisMonth)}</h3>
        </div>
      </div>

      {/* ── Aviso sesión de caja ────────────────────────────────── */}
      {session?.status !== 'OPEN' && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            <span className="font-bold">Caja cerrada.</span> Los pagos que registres no se insertarán como egreso de caja.
            Abre la caja primero si quieres que el pago se registre automáticamente en Control de Caja.
          </p>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          ['pending', '⏳ Pendientes'],
          ['all',     '📋 Todas'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tabla ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Cargando cuentas por pagar...</div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin cuentas por pagar {activeTab === 'pending' ? 'pendientes' : ''}</p>
            <p className="text-sm mt-1">Registra las facturas pendientes con el botón "Nueva CxP"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Proveedor', 'Concepto', 'Ref. Factura', 'Total', 'Pagado', 'Saldo', 'Vencimiento', 'Estado', ''].map(h => (
                    <th key={h} className="px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayed.map(pay => {
                  const balance = pay.total_amount - pay.paid_amount;
                  const cfg     = STATUS_CFG[pay.status] || STATUS_CFG.PENDING;
                  const isOverdue = pay.status === 'OVERDUE';
                  return (
                    <tr key={pay.id} className={`hover:bg-slate-50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{pay.supplier_name}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{pay.concept}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{pay.invoice_ref || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{formatMoney(pay.total_amount)}</td>
                      <td className="px-4 py-3 text-green-700 font-medium">{formatMoney(pay.paid_amount)}</td>
                      <td className="px-4 py-3 font-bold text-red-600">{formatMoney(balance)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                          {new Date(pay.due_date + 'T12:00:00').toLocaleDateString('es-CO')}
                          {isOverdue && ' ⚠️'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          {pay.status !== 'PAID' && (
                            <button
                              onClick={() => {
                                setSelectedPay(pay);
                                setPayAmount(String(balance));
                                setPayMethod('CASH');
                                setPayNotes('');
                                setPayToExpense(session?.status === 'OPEN');
                                setShowPay(true);
                              }}
                              className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                              <DollarSign size={12} /> Pagar
                            </button>
                          )}
                          <button onClick={() => handleDelete(pay)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Nueva CxP ─────────────────────────────────── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Nueva Cuenta por Pagar</h3>
                <p className="text-xs text-slate-400 mt-0.5">Registra una obligación con un proveedor</p>
              </div>
              <button onClick={() => setShowNew(false)}>
                <X size={20} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Proveedor *</label>
                  <input value={newForm.supplier_name} onChange={f('supplier_name')}
                    placeholder="Nombre del proveedor"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Concepto *</label>
                  <input value={newForm.concept} onChange={f('concept')}
                    placeholder="Ej: Factura #1234 — Mercancía enero"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto Total *</label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="number" min="0" value={newForm.total_amount} onChange={f('total_amount')}
                      placeholder="0"
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Abono Inicial</label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="number" min="0" value={newForm.paid_amount} onChange={f('paid_amount')}
                      placeholder="0"
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Vencimiento *</label>
                  <input type="date" value={newForm.due_date} onChange={f('due_date')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ref. Factura</label>
                  <input value={newForm.invoice_ref} onChange={f('invoice_ref')}
                    placeholder="FAC-001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                  <input value={newForm.notes} onChange={f('notes')}
                    placeholder="Observaciones adicionales..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowNew(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : '✅ Crear CxP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Registrar Pago ─────────────────────────────── */}
      {showPay && selectedPay && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Registrar Pago</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedPay.supplier_name} — {selectedPay.concept}</p>
              </div>
              <button onClick={() => setShowPay(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">

              {/* Resumen */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                {[
                  ['Total factura',   formatMoney(selectedPay.total_amount)],
                  ['Ya pagado',       formatMoney(selectedPay.paid_amount)],
                  ['Saldo pendiente', formatMoney(selectedPay.total_amount - selectedPay.paid_amount)],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm">
                    <span className="text-slate-500">{l}</span>
                    <span className="font-semibold text-slate-800">{v}</span>
                  </div>
                ))}
              </div>

              {/* Monto */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto del Pago *</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    max={selectedPay.total_amount - selectedPay.paid_amount} placeholder="0"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={() => setPayAmount(String(selectedPay.total_amount - selectedPay.paid_amount))}
                  className="mt-1 text-xs text-blue-600 hover:underline">
                  Pagar saldo completo ({formatMoney(selectedPay.total_amount - selectedPay.paid_amount)})
                </button>
              </div>

              {/* Método */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value} onClick={() => setPayMethod(m.value)}
                      className={`px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                        payMethod === m.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400'
                      }`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                <input value={payNotes} onChange={e => setPayNotes(e.target.value)}
                  placeholder="Referencia de transferencia, banco, etc."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Toggle egreso de caja */}
              <div className={`flex items-start gap-3 p-3 rounded-xl border ${
                session?.status === 'OPEN'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}>
                <input type="checkbox" id="payToExpense"
                  checked={payToExpense && session?.status === 'OPEN'}
                  disabled={session?.status !== 'OPEN'}
                  onChange={e => setPayToExpense(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-green-600 cursor-pointer" />
                <label htmlFor="payToExpense" className="text-sm cursor-pointer">
                  <p className="font-semibold text-slate-700">
                    Registrar como egreso en Control de Caja
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {session?.status === 'OPEN'
                      ? 'Se insertará automáticamente en los egresos del turno actual.'
                      : 'La caja está cerrada — no se puede registrar egreso ahora.'}
                  </p>
                </label>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowPay(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
                Cancelar
              </button>
              <button onClick={handlePayment} disabled={savingPay || !payAmount}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                <CreditCard size={16} />
                {savingPay ? 'Procesando...' : 'Registrar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AccountsPayable;
