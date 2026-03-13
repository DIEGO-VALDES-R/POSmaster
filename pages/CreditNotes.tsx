import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, RotateCcw, CheckCircle, XCircle, Clock,
  AlertTriangle, X, Save, Package, Trash2, Edit3,
  Download, Eye, ReceiptText, ArrowLeft, RefreshCw
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CNItem {
  id?: string;
  invoice_item_id?: string;
  product_id?: string;
  description: string;
  quantity: number;
  max_quantity?: number;   // máximo devolvible (cant original)
  price: number;
  tax_rate: number;
  total?: number;
  selected: boolean;
}

interface CreditNote {
  id: string;
  credit_note_number: string;
  invoice_id?: string;
  invoice_number: string;
  customer_name: string;
  customer_doc?: string;
  type: 'FULL' | 'PARTIAL';
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  reason: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  restock_items: boolean;
  refund_method: 'CASH' | 'TRANSFER' | 'CREDIT' | 'EXCHANGE';
  notes?: string;
  created_at: string;
  credit_note_items?: CNItem[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  created_at: string;
  _customer_name?: string;
  _customer_document?: string;
  invoice_items?: any[];
  payment_method?: any;
}

const STATUS_CFG = {
  PENDING:   { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700',    icon: <Clock size={11} /> },
  PROCESSED: { label: 'Procesada',  cls: 'bg-emerald-100 text-emerald-700',icon: <CheckCircle size={11} /> },
  CANCELLED: { label: 'Anulada',    cls: 'bg-red-100 text-red-700',        icon: <XCircle size={11} /> },
};

const REASONS = [
  'Producto defectuoso',
  'Producto incorrecto entregado',
  'Producto no corresponde a lo facturado',
  'Exceso en la facturación',
  'Devolución por garantía',
  'Cliente insatisfecho',
  'Error en precio',
  'Otro',
];

const REFUND_METHODS = [
  { value: 'CASH',     label: '💵 Efectivo' },
  { value: 'TRANSFER', label: '🏦 Transferencia' },
  { value: 'CREDIT',   label: '📋 Nota crédito (abono)' },
  { value: 'EXCHANGE', label: '🔄 Cambio de producto' },
];

function nextCNNumber(existing: CreditNote[]): string {
  const nums = existing.map(c => parseInt(c.credit_note_number.replace(/\D/g, '')) || 0);
  return `NC-${(Math.max(0, ...nums) + 1).toString().padStart(4, '0')}`;
}

// ─── PDF Generator ────────────────────────────────────────────────────────────
function generateCNPDF(cn: CreditNote, company: any, formatMoney: (n: number) => string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const M = 15;
  let y = M;

  doc.setFillColor(220, 38, 38); doc.rect(0, 0, W, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('NOTA CRÉDITO', M, 13);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(company?.name || 'POSmaster', M, 20);
  doc.text(`NIT: ${company?.nit || ''}`, M, 26);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(cn.credit_note_number, W - M, 13, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${new Date(cn.created_at).toLocaleDateString('es-CO')}`, W - M, 20, { align: 'right' });
  doc.text(`Factura original: ${cn.invoice_number}`, W - M, 26, { align: 'right' });
  y = 40;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', M, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(cn.customer_name, M, y); y += 4;
  if (cn.customer_doc) { doc.text(`Doc: ${cn.customer_doc}`, M, y); y += 4; }

  doc.setFont('helvetica', 'bold');
  doc.text('MOTIVO DE DEVOLUCIÓN', 110, y - 8);
  doc.setFont('helvetica', 'normal');
  doc.text(cn.reason, 110, y - 3);
  y += 3;

  doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 5;

  // Items
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.setFillColor(254, 242, 242); doc.rect(M, y - 3, W - M * 2, 7, 'F');
  doc.text('PRODUCTO', M + 1, y + 1);
  doc.text('CANT', 120, y + 1, { align: 'right' });
  doc.text('PRECIO', 150, y + 1, { align: 'right' });
  doc.text('IVA', 168, y + 1, { align: 'right' });
  doc.text('TOTAL', W - M - 1, y + 1, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  (cn.credit_note_items || []).forEach((item, i) => {
    if (y > 260) { doc.addPage(); y = M; }
    if (i % 2 === 0) { doc.setFillColor(255, 248, 248); doc.rect(M, y - 3, W - M * 2, 6, 'F'); }
    doc.text(item.description.substring(0, 50), M + 1, y);
    doc.text(item.quantity.toString(), 120, y, { align: 'right' });
    doc.text(formatMoney(item.price), 150, y, { align: 'right' });
    doc.text(item.tax_rate > 0 ? `${item.tax_rate}%` : 'EX', 168, y, { align: 'right' });
    doc.text(formatMoney(item.quantity * item.price), W - M - 1, y, { align: 'right' });
    y += 6;
  });

  y += 2; doc.line(M, y, W - M, y); y += 6;
  const tx = W - M - 80;
  doc.setFontSize(8);
  [[`Subtotal:`, formatMoney(cn.subtotal)], [`IVA:`, formatMoney(cn.tax_amount)]].forEach(([l, v]) => {
    doc.setFont('helvetica', 'normal'); doc.text(l, tx, y); doc.text(v, W - M - 1, y, { align: 'right' }); y += 5;
  });
  doc.line(tx, y - 1, W - M, y - 1); y += 2;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('TOTAL A DEVOLVER:', tx, y);
  doc.text(formatMoney(cn.total_amount), W - M - 1, y, { align: 'right' });
  y += 7;

  const refundLabel = REFUND_METHODS.find(r => r.value === cn.refund_method)?.label || cn.refund_method;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(`Método de reembolso: ${refundLabel}`, M, y);
  if (cn.restock_items) doc.text('✓ Productos devueltos al inventario', M, y + 5);

  doc.setFontSize(7); doc.setTextColor(148, 163, 184);
  doc.text('Generado por POSmaster · posmaster.app', W / 2, 290, { align: 'center' });
  doc.save(`${cn.credit_note_number}.pdf`);
}

// ─── New Credit Note Modal — search invoice + select items ────────────────────
interface NewCNModalProps {
  companyId: string;
  branchId: string | null;
  nextNumber: string;
  onClose: () => void;
  onSaved: (cn: CreditNote) => void;
  formatMoney: (n: number) => string;
}

const NewCNModal: React.FC<NewCNModalProps> = ({ companyId, branchId, nextNumber, onClose, onSaved, formatMoney }) => {
  const [step, setStep] = useState<'search' | 'items'>('search');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Invoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<CNItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    credit_note_number: nextNumber,
    reason: REASONS[0],
    custom_reason: '',
    refund_method: 'CASH' as CreditNote['refund_method'],
    restock_items: true,
    notes: '',
  });

  const searchInvoices = async () => {
    if (!invoiceSearch.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from('invoices')
      .select('*, invoice_items(*, products(name, tax_rate))')
      .eq('company_id', companyId)
      .ilike('invoice_number', `%${invoiceSearch.trim()}%`)
      .limit(10);

    // Enrich with customer data from payment_method jsonb
    const enriched = (data || []).map((inv: any) => ({
      ...inv,
      _customer_name: inv.payment_method?.customer_name || 'Consumidor Final',
      _customer_document: inv.payment_method?.customer_document || '',
    }));
    setSearchResults(enriched);
    setSearching(false);
  };

  const selectInvoice = (inv: Invoice) => {
    setSelectedInvoice(inv);
    const cnItems: CNItem[] = (inv.invoice_items || []).map((item: any) => ({
      invoice_item_id: item.id,
      product_id: item.product_id,
      description: item.products?.name || `Producto ${item.product_id?.slice(0, 6)}`,
      quantity: item.quantity,
      max_quantity: item.quantity,
      price: item.price,
      tax_rate: item.tax_rate || item.products?.tax_rate || 0,
      selected: true,
    }));
    setItems(cnItems);
    setStep('items');
  };

  const toggleItem = (idx: number) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));

  const updateQty = (idx: number, qty: number) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.min(qty, it.max_quantity || qty) } : it));

  const selectedItems = items.filter(i => i.selected);
  const subtotal = selectedItems.reduce((s, i) => s + i.quantity * i.price, 0);
  const taxAmount = selectedItems.reduce((s, i) => s + i.quantity * i.price * (i.tax_rate / 100), 0);
  const totalAmount = subtotal + taxAmount;
  const isFullReturn = selectedItems.length === items.length &&
    selectedItems.every(i => i.quantity === i.max_quantity);

  const handleSave = async () => {
    if (!selectedItems.length) { toast.error('Selecciona al menos un producto'); return; }
    const reason = form.reason === 'Otro' ? form.custom_reason : form.reason;
    if (!reason.trim()) { toast.error('Ingresa el motivo'); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId, branch_id: branchId,
        credit_note_number: form.credit_note_number,
        invoice_id: selectedInvoice!.id,
        invoice_number: selectedInvoice!.invoice_number,
        customer_name: selectedInvoice!._customer_name || 'Consumidor Final',
        customer_doc: selectedInvoice!._customer_document || null,
        type: isFullReturn ? 'FULL' : 'PARTIAL',
        status: 'PENDING',
        reason,
        subtotal, tax_amount: taxAmount, total_amount: totalAmount,
        restock_items: form.restock_items,
        refund_method: form.refund_method,
        notes: form.notes || null,
      };

      const { data: cn, error } = await supabase.from('credit_notes').insert(payload).select().single();
      if (error) throw error;

      const itemsPayload = selectedItems.map(i => ({
        credit_note_id: cn.id,
        invoice_item_id: i.invoice_item_id || null,
        product_id: i.product_id || null,
        description: i.description,
        quantity: i.quantity,
        price: i.price,
        tax_rate: i.tax_rate,
      }));
      await supabase.from('credit_note_items').insert(itemsPayload);

      const { data: saved } = await supabase
        .from('credit_notes').select('*, credit_note_items(*)')
        .eq('id', cn.id).single();

      toast.success('✅ Nota crédito creada');
      onSaved(saved);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-400 text-slate-800 bg-white';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {step === 'items' && (
              <button onClick={() => setStep('search')} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h2 className="font-bold text-slate-800">Nueva nota crédito / devolución</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 'search' ? 'Paso 1: Busca la factura original' : `Paso 2: Selecciona productos a devolver — ${selectedInvoice?.invoice_number}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-5">
          {/* ── Step 1: Buscar factura ── */}
          {step === 'search' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <p className="font-bold mb-0.5">💡 ¿Cómo funciona?</p>
                <p>Busca la factura original, selecciona los productos a devolver y confirma. El stock se puede restaurar automáticamente.</p>
              </div>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Número de factura (ej: POS-0042)..."
                  value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchInvoices()} />
                <button onClick={searchInvoices} disabled={searching}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 disabled:opacity-60 flex-shrink-0">
                  {searching ? <RefreshCw size={14} className="animate-spin" /> : 'Buscar'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{searchResults.length} facturas encontradas</p>
                  {searchResults.map(inv => (
                    <button key={inv.id} onClick={() => selectInvoice(inv)}
                      className="w-full flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-red-300 hover:bg-red-50 transition-colors text-left">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{inv.invoice_number}</p>
                        <p className="text-xs text-slate-500">{inv._customer_name} · {new Date(inv.created_at).toLocaleDateString('es-CO')}</p>
                        <p className="text-xs text-slate-400">{(inv.invoice_items || []).length} productos</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">{formatMoney(inv.total_amount)}</p>
                        <p className="text-xs text-emerald-600 font-semibold">Seleccionar →</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && invoiceSearch && !searching && (
                <div className="text-center py-8 text-slate-400">
                  <ReceiptText size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No se encontraron facturas con ese número</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Seleccionar ítems ── */}
          {step === 'items' && (
            <div className="space-y-4">
              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Productos de la factura</p>
                  <div className="flex gap-2">
                    <button onClick={() => setItems(prev => prev.map(i => ({ ...i, selected: true, quantity: i.max_quantity || i.quantity })))}
                      className="text-xs text-slate-500 hover:text-slate-800">Seleccionar todo</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={() => setItems(prev => prev.map(i => ({ ...i, selected: false })))}
                      className="text-xs text-slate-500 hover:text-slate-800">Deseleccionar todo</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${item.selected ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                      <input type="checkbox" checked={item.selected} onChange={() => toggleItem(idx)}
                        className="w-4 h-4 rounded accent-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.description}</p>
                        <p className="text-xs text-slate-400">{formatMoney(item.price)} c/u · IVA {item.tax_rate}%</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">Cant:</span>
                        <input type="number" min="0.001" step="0.001" max={item.max_quantity}
                          value={item.quantity} disabled={!item.selected}
                          onChange={e => updateQty(idx, parseFloat(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40" />
                        <span className="text-xs text-slate-400">/ {item.max_quantity}</span>
                      </div>
                      <p className="text-sm font-bold text-red-600 w-20 text-right flex-shrink-0">
                        {item.selected ? formatMoney(item.quantity * item.price) : '-'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex justify-between text-sm text-red-700 mb-1">
                  <span>Subtotal a devolver</span><span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-red-700 mb-2">
                  <span>IVA</span><span>{formatMoney(taxAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-red-800 text-base border-t border-red-200 pt-2">
                  <span>TOTAL A DEVOLVER</span><span>{formatMoney(totalAmount)}</span>
                </div>
                {isFullReturn && <p className="text-xs text-red-500 mt-1 font-semibold">✓ Devolución total</p>}
              </div>

              {/* Motivo y método */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Motivo *</label>
                  <select className={inputCls} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                    {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {form.reason === 'Otro' && (
                    <input className={inputCls + ' mt-2'} placeholder="Describe el motivo..."
                      value={form.custom_reason} onChange={e => setForm(f => ({ ...f, custom_reason: e.target.value }))} />
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Método de reembolso</label>
                  <select className={inputCls} value={form.refund_method} onChange={e => setForm(f => ({ ...f, refund_method: e.target.value as any }))}>
                    {REFUND_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <input type="checkbox" id="restock" checked={form.restock_items}
                  onChange={e => setForm(f => ({ ...f, restock_items: e.target.checked }))}
                  className="w-4 h-4 rounded accent-slate-700" />
                <label htmlFor="restock" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Devolver productos al inventario (suma el stock)
                </label>
              </div>

              <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Observaciones internas..."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 text-sm hover:bg-slate-200 rounded-lg">Cancelar</button>
          {step === 'items' && (
            <button onClick={handleSave} disabled={saving || selectedItems.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-60">
              <RotateCcw size={15} /> {saving ? 'Guardando...' : 'Crear nota crédito'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Process Modal ────────────────────────────────────────────────────────────
interface ProcessModalProps {
  cn: CreditNote;
  onClose: () => void;
  onDone: (updated: CreditNote) => void;
  formatMoney: (n: number) => string;
}

const ProcessModal: React.FC<ProcessModalProps> = ({ cn, onClose, onDone, formatMoney }) => {
  const [processing, setProcessing] = useState(false);

  const handleProcess = async () => {
    setProcessing(true);
    try {
      // 1. Si restock, restaurar stock
      if (cn.restock_items) {
        for (const item of cn.credit_note_items || []) {
          if (!item.product_id) continue;
          const { data: prod } = await supabase.from('products').select('stock_quantity').eq('id', item.product_id).single();
          if (prod) {
            await supabase.from('products').update({ stock_quantity: (prod.stock_quantity || 0) + item.quantity }).eq('id', item.product_id);
          }
        }
      }

      // 2. Marcar nota como procesada
      const { data: updated } = await supabase.from('credit_notes')
        .update({ status: 'PROCESSED' })
        .eq('id', cn.id)
        .select('*, credit_note_items(*)')
        .single();

      toast.success('✅ Nota crédito procesada' + (cn.restock_items ? ' — stock restaurado' : ''));
      onDone(updated);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const refundLabel = REFUND_METHODS.find(r => r.value === cn.refund_method)?.label || cn.refund_method;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Procesar devolución</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-slate-600">Nota crédito</span><span className="font-bold">{cn.credit_note_number}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">Factura original</span><span className="font-bold">{cn.invoice_number}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">Cliente</span><span className="font-bold">{cn.customer_name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">Motivo</span><span className="font-semibold text-red-700">{cn.reason}</span></div>
            <div className="flex justify-between font-bold text-base border-t border-red-200 pt-2">
              <span>Total a reembolsar</span><span className="text-red-700">{formatMoney(cn.total_amount)}</span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{REFUND_METHODS.find(r => r.value === cn.refund_method)?.label.split(' ')[0]}</span>
              <div>
                <p className="font-semibold text-slate-800">Reembolso por {refundLabel.replace(/^[^\s]+ /, '')}</p>
                <p className="text-xs text-slate-500">Asegúrate de entregar el reembolso al cliente antes de marcar como procesada</p>
              </div>
            </div>
            {cn.restock_items && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <Package size={16} className="text-emerald-600 flex-shrink-0" />
                <p className="text-xs text-emerald-700"><strong>Se restaurará el stock</strong> de {cn.credit_note_items?.length || 0} productos al confirmar.</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 text-slate-500 text-sm hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button onClick={handleProcess} disabled={processing}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-60">
            <CheckCircle size={15} /> {processing ? 'Procesando...' : 'Confirmar y procesar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const CreditNotes: React.FC = () => {
  const { company, companyId, branchId } = useDatabase();
  const { formatMoney } = useCurrency();
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showNew, setShowNew] = useState(false);
  const [processNote, setProcessNote] = useState<CreditNote | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase.from('credit_notes')
      .select('*, credit_note_items(*)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    setNotes(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const filtered = notes.filter(n => {
    const matchSearch = !search ||
      n.credit_note_number.toLowerCase().includes(search.toLowerCase()) ||
      n.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      n.invoice_number.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (statusFilter === 'ALL' || n.status === statusFilter);
  });

  const kpis = {
    pending: notes.filter(n => n.status === 'PENDING').length,
    processed: notes.filter(n => n.status === 'PROCESSED').length,
    totalRefunded: notes.filter(n => n.status === 'PROCESSED').reduce((s, n) => s + n.total_amount, 0),
    totalPending: notes.filter(n => n.status === 'PENDING').reduce((s, n) => s + n.total_amount, 0),
  };

  const handleCancel = async (note: CreditNote) => {
    if (!window.confirm(`¿Anular nota crédito ${note.credit_note_number}?`)) return;
    await supabase.from('credit_notes').update({ status: 'CANCELLED' }).eq('id', note.id);
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, status: 'CANCELLED' } : n));
    toast.success('Nota crédito anulada');
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Devoluciones y Notas Crédito</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona devoluciones de productos y reembolsos a clientes</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 shadow-sm">
          <Plus size={16} /> Nueva devolución
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Pendientes', value: kpis.pending, icon: <Clock size={16} />, color: 'bg-amber-100 text-amber-600' },
          { label: 'Procesadas', value: kpis.processed, icon: <CheckCircle size={16} />, color: 'bg-emerald-100 text-emerald-600' },
          { label: 'Por reembolsar', value: formatMoney(kpis.totalPending), icon: <AlertTriangle size={16} />, color: 'bg-red-100 text-red-600' },
          { label: 'Total reembolsado', value: formatMoney(kpis.totalRefunded), icon: <RotateCcw size={16} />, color: 'bg-slate-100 text-slate-600' },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${k.color}`}>{k.icon}</div>
            <p className="text-xl font-bold text-slate-800">{k.value}</p>
            <p className="text-xs text-slate-500">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-300"
            placeholder="Buscar por nota, factura o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {[['ALL','Todas'],['PENDING','Pendientes'],['PROCESSED','Procesadas'],['CANCELLED','Anuladas']].map(([k,l]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === k ? 'bg-red-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <RotateCcw size={32} className="mb-3 opacity-30" />
            <p className="font-semibold">No hay devoluciones registradas</p>
            <p className="text-sm mt-1">Usa el botón "Nueva devolución" para registrar una</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Nota Crédito</th>
                  <th className="text-left px-4 py-3">Factura orig.</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Motivo</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-center px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(note => {
                  const cfg = STATUS_CFG[note.status];
                  return (
                    <tr key={note.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-red-600 text-sm">{note.credit_note_number}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{note.invoice_number}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{note.customer_name}</p>
                        {note.customer_doc && <p className="text-xs text-slate-400">{note.customer_doc}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-32 truncate">{note.reason}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600 text-sm">- {formatMoney(note.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {note.status === 'PENDING' && (
                            <button onClick={() => setProcessNote(note)} title="Procesar devolución"
                              className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 hover:text-emerald-800">
                              <CheckCircle size={14} />
                            </button>
                          )}
                          <button onClick={() => generateCNPDF(note, company, formatMoney)} title="PDF"
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                            <Download size={14} />
                          </button>
                          {note.status === 'PENDING' && (
                            <button onClick={() => handleCancel(note)} title="Anular"
                              className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500">
                              <XCircle size={14} />
                            </button>
                          )}
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

      {showNew && (
        <NewCNModal companyId={companyId!} branchId={branchId} nextNumber={nextCNNumber(notes)}
          formatMoney={formatMoney}
          onClose={() => setShowNew(false)}
          onSaved={cn => { setNotes(prev => [cn, ...prev]); setShowNew(false); }} />
      )}

      {processNote && (
        <ProcessModal cn={processNote} formatMoney={formatMoney}
          onClose={() => setProcessNote(null)}
          onDone={updated => { setNotes(prev => prev.map(n => n.id === updated.id ? updated : n)); setProcessNote(null); }} />
      )}
    </div>
  );
};

export default CreditNotes;
