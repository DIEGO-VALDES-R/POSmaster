import React, { useState, useRef, useEffect } from 'react';
import { X, Trash2, Plus, Printer, User } from 'lucide-react';
import { PaymentMethod } from '../../types';
import PayPalCheckout from '../PayPalCheckout';
import { supabase } from '../../supabaseClient';

interface PaymentModalProps {
  companyId: string;
  totals: {
    subtotalBruto: number;
    discountAmount: number;
    tax: number;
    total: number;
    totalPaid: number;
    remaining: number;
  };
  applyIva: boolean;
  defaultTaxRate: number;
  clampedDiscount: number;
  isPartialMode: boolean;
  setIsPartialMode: (v: boolean) => void;
  shoeRepairLabel: string;
  payments: { method: PaymentMethod; amount: number }[];
  currentPaymentAmount: string;
  setCurrentPaymentAmount: (v: string) => void;
  currentPaymentMethod: PaymentMethod;
  setCurrentPaymentMethod: (m: PaymentMethod) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerDoc: string;
  setCustomerDoc: (v: string) => void;
  customerEmail: string;
  setCustomerEmail: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  paypalEnabled: boolean;
  paypalConfig: any;
  showPaypalModal: boolean;
  setShowPaypalModal: (v: boolean) => void;
  paypalAmount: number;
  setPaypalAmount: (v: number) => void;
  paypalLoading: boolean;
  setPaypalLoading: (v: boolean) => void;
  onAddPayment: () => void;
  onRemovePayment: (i: number) => void;
  onAddPaypalPayment: (amount: number) => void;
  onClose: () => void;
  onFinalize: () => void;
  formatMoney: (n: number) => string;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: '💵 Efectivo',
  CARD: '💳 Tarjeta',
  TRANSFER: '🏛️ Transf.',
  PAYPAL: '🅿️ PayPal',
  CREDIT: '⏳ Crédito',
};

const PaymentModal: React.FC<PaymentModalProps> = ({
  totals,
  applyIva,
  defaultTaxRate,
  clampedDiscount,
  isPartialMode,
  setIsPartialMode,
  shoeRepairLabel,
  payments,
  currentPaymentAmount,
  setCurrentPaymentAmount,
  currentPaymentMethod,
  setCurrentPaymentMethod,
  customerName,
  setCustomerName,
  customerDoc,
  setCustomerDoc,
  customerEmail,
  setCustomerEmail,
  customerPhone,
  setCustomerPhone,
  paypalEnabled,
  paypalConfig,
  showPaypalModal,
  setShowPaypalModal,
  paypalAmount,
  setPaypalAmount,
  paypalLoading,
  setPaypalLoading,
  onAddPayment,
  onRemovePayment,
  onAddPaypalPayment,
  onClose,
  onFinalize,
  formatMoney,
  companyId,
}) => {
  // ── Autocomplete clientes ─────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  const searchCustomers = async (q: string) => {
    if (q.trim().length < 1) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }
    setLoadingSugg(true);
    try {
      console.log('[POS AutoComplete] companyId recibido:', companyId, '| buscando:', q);

      // Primero sin filtro company_id para ver si hay datos en la tabla
      const { data: sinFiltro, error: e1 } = await supabase
        .from('customers')
        .select('id, name, document_number, email, phone, company_id')
        .ilike('name', `%${q}%`)
        .limit(10);
      console.log('[POS AutoComplete] Sin company_id filter:', sinFiltro, 'error:', e1);

      // Luego con filtro
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, document_number, email, phone')
        .eq('company_id', companyId)
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(8);
      console.log('[POS AutoComplete] Con company_id filter:', data, 'error:', error);

      // Usar resultado sin filtro si el filtrado da vacío (para diagnóstico)
      const result = (data && data.length > 0) ? data : (sinFiltro || []);
      setSuggestions(result);
      setShowSuggest(result.length > 0);
    } catch (e) {
      console.error('[POS AutoComplete] Error:', e);
    } finally {
      setLoadingSugg(false);
    }
  };

  const selectCustomer = (c: any) => {
    setCustomerName(c.name || '');
    setCustomerDoc(c.document_number || '');
    setCustomerEmail(c.email || '');
    setCustomerPhone(c.phone || '');
    setSuggestions([]);
    setShowSuggest(false);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node))
        setShowSuggest(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <>
      {/* Main Payment Modal */}
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="font-bold text-xl text-slate-800">
                Procesar Pago
              </h3>
              {shoeRepairLabel && (
                <p className="text-xs text-blue-600 font-semibold mt-0.5">
                  {shoeRepairLabel}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-sm font-semibold text-slate-600">
                  Abono parcial
                </span>
                <div
                  onClick={() => setIsPartialMode(!isPartialMode)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                    isPartialMode ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      isPartialMode ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </div>
              </label>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-full"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto p-6">
            {/* Datos del cliente */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              {/* Campo nombre con autocomplete */}
              <div className="col-span-2" ref={suggestRef} style={{ position: 'relative' }}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre Cliente
                </label>
                <div className="relative">
                  <User
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="Consumidor Final"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      searchCustomers(e.target.value);
                    }}
                    onFocus={() => {
                      if (customerName.length >= 1) searchCustomers(customerName);
                    }}
                    autoComplete="off"
                  />
                  {loadingSugg && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                {showSuggest && suggestions.length > 0 && (
                  <div
                    className="absolute left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 overflow-hidden"
                    style={{ zIndex: 9999 }}
                  >
                    {suggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectCustomer(c);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-slate-50 last:border-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-600 text-xs font-bold">
                            {c.name?.[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 text-sm truncate">
                            {c.name}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {[c.document_number, c.phone]
                              .filter(Boolean)
                              .join(' · ') ||
                              c.email ||
                              '—'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CC / NIT */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  CC / NIT
                </label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2"
                  placeholder="222222222"
                  value={customerDoc}
                  onChange={(e) => setCustomerDoc(e.target.value)}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2"
                  placeholder="cliente@email.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>

              {/* Teléfono */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Telefono (WhatsApp)
                </label>
                <input
                  type="tel"
                  className="w-full border border-slate-300 rounded-lg px-4 py-2"
                  placeholder="300 123 4567"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-8 mb-8">
              {/* Resumen */}
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-500 mb-2">
                  Resumen de Venta
                </h4>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 mb-4">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal:</span>
                    <span>{formatMoney(totals.subtotalBruto)}</span>
                  </div>
                  {clampedDiscount > 0 && (
                    <div className="flex justify-between text-sm text-orange-600 font-semibold">
                      <span>Descuento ({clampedDiscount}%):</span>
                      <span>- {formatMoney(totals.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>
                      IVA{' '}
                      {applyIva && defaultTaxRate > 0
                        ? `(${defaultTaxRate}%)`
                        : ''}
                      :
                    </span>
                    <span>
                      {applyIva && defaultTaxRate > 0
                        ? formatMoney(totals.tax)
                        : '$ 0'}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-xl text-slate-800 pt-2 border-t border-slate-200">
                    <span>TOTAL:</span>
                    <span className="text-blue-700">
                      {formatMoney(totals.total)}
                    </span>
                  </div>
                </div>

                {/* Pagos agregados */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Pagos Agregados
                  </h5>
                  {payments.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">
                      Sin pagos registrados
                    </p>
                  ) : (
                    payments.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-sm mb-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold bg-slate-200 px-2 rounded">
                            {PAYMENT_LABELS[p.method] || p.method}
                          </span>
                          <span className="font-mono">
                            {formatMoney(p.amount)}
                          </span>
                        </div>
                        <button
                          onClick={() => onRemovePayment(idx)}
                          className="text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between font-bold text-sm">
                    <span>
                      {isPartialMode
                        ? 'Abonado:'
                        : totals.remaining < -1
                        ? 'Vuelto:'
                        : 'Restante:'}
                    </span>
                    <span
                      className={
                        isPartialMode
                          ? 'text-amber-600'
                          : totals.remaining > 100
                          ? 'text-red-600'
                          : 'text-green-600'
                      }
                    >
                      {isPartialMode
                        ? `${formatMoney(totals.totalPaid)} de ${formatMoney(totals.total)}`
                        : totals.remaining < -1
                        ? formatMoney(Math.abs(totals.remaining))
                        : formatMoney(totals.remaining)}
                    </span>
                  </div>
                  {!isPartialMode && totals.remaining < -1 && (
                    <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200 text-xs text-green-700 font-semibold">
                      💵 Entregar {formatMoney(Math.abs(totals.remaining))} de
                      vuelto al cliente
                    </div>
                  )}
                  {isPartialMode && totals.remaining > 0 && (
                    <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700 font-semibold">
                      ⏳ Saldo pendiente: {formatMoney(totals.remaining)} →
                      quedará en Cartera/CxC
                    </div>
                  )}
                </div>
              </div>

              {/* Agregar método de pago */}
              <div className="flex-1 space-y-4">
                <h4 className="text-sm font-bold text-slate-500">
                  Agregar Metodo
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    PaymentMethod.CASH,
                    PaymentMethod.CARD,
                    PaymentMethod.TRANSFER,
                    PaymentMethod.CREDIT,
                  ].map((m) => (
                    <button
                      key={m}
                      onClick={() => setCurrentPaymentMethod(m)}
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                        currentPaymentMethod === m
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400'
                      }`}
                    >
                      {m === 'CASH'
                        ? 'Efectivo'
                        : m === 'CARD'
                        ? 'Tarjeta'
                        : m === 'CREDIT'
                        ? 'Credito'
                        : 'Transf.'}
                    </button>
                  ))}
                  {paypalEnabled && (
                    <button
                      onClick={() => {
                        setPaypalAmount(
                          Math.round(
                            totals.remaining > 0
                              ? totals.remaining
                              : totals.total
                          )
                        );
                        setShowPaypalModal(true);
                      }}
                      className="py-2 px-3 rounded-lg border text-sm font-medium transition-all bg-[#0070BA] text-white border-[#0070BA] hover:bg-[#005ea6] flex items-center justify-center gap-1.5 col-span-2"
                    >
                      <span className="font-black tracking-tight">Pay</span>
                      <span className="font-light tracking-tight">Pal</span>
                      <span className="opacity-80 text-xs ml-1">
                        —{' '}
                        {formatMoney(
                          Math.round(
                            totals.remaining > 0
                              ? totals.remaining
                              : totals.total
                          )
                        )}
                      </span>
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-lg font-bold"
                    placeholder="0"
                    value={currentPaymentAmount}
                    onChange={(e) => setCurrentPaymentAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onAddPayment()}
                  />
                  <button
                    onClick={onAddPayment}
                    className="bg-slate-800 text-white px-4 rounded-lg hover:bg-slate-900"
                  >
                    <Plus />
                  </button>
                </div>
                <button
                  onClick={() =>
                    setCurrentPaymentAmount(
                      Math.round(Math.max(0, totals.remaining)).toString()
                    )
                  }
                  className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded font-medium"
                >
                  Todo Restante
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-white"
            >
              Cancelar
            </button>
            <button
              onClick={onFinalize}
              disabled={
                isPartialMode
                  ? totals.totalPaid <= 0
                  : totals.remaining > 100
              }
              className="px-6 py-3 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 disabled:bg-slate-300 flex items-center gap-2"
            >
              <Printer size={20} />{' '}
              {isPartialMode && totals.remaining > 100
                ? 'Facturar con Abono'
                : 'Facturar e Imprimir'}
            </button>
          </div>
        </div>
      </div>

      {/* PayPal Modal */}
      {showPaypalModal && paypalConfig && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#0070BA] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-white font-black text-xl tracking-tight">
                  Pay
                </span>
                <span className="text-white font-light text-xl tracking-tight">
                  Pal
                </span>
              </div>
              <button
                onClick={() => setShowPaypalModal(false)}
                className="text-white/70 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-slate-500 text-sm">Monto a cobrar</p>
                <p className="text-3xl font-black text-slate-900">
                  {formatMoney(paypalAmount)}
                </p>
              </div>
              <div id="paypal-button-container" className="min-h-[50px]">
                {paypalLoading && (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-6 h-6 border-2 border-[#0070BA] border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2 text-sm text-slate-500">
                      Cargando PayPal...
                    </span>
                  </div>
                )}
              </div>
              <PayPalCheckout
                clientId={paypalConfig.client_id}
                env={paypalConfig.env || 'production'}
                amount={paypalAmount}
                currency="USD"
                onApprove={(orderId: string) => {
                  onAddPaypalPayment(paypalAmount);
                  setShowPaypalModal(false);
                }}
                onError={() => {}}
                setLoading={setPaypalLoading}
              />
              <p className="text-xs text-slate-400 text-center">
                El pago se procesa directamente en PayPal. POSmaster no
                almacena datos de tarjetas.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PaymentModal;