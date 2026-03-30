import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Truck, Package, CheckCircle, XCircle, Clock,
  Edit3, Trash2, Eye, Download, Send, X, Save, AlertCircle,
  ChevronDown, ArrowRight, ReceiptText, RefreshCw, Banknote
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { Product } from '../types';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { logAudit, AuditEntry, ACTION_LABELS, SOURCE_LABELS, FIELD_LABELS } from '../services/productAuditService';
import ProductHistoryModal from '../components/ProductHistoryModal';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Supplier { id: string; name: string; nit?: string; phone?: string; email?: string; }

interface POItem {
  id?: string;
  product_id?: string;
  description: string;
  sku?: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  tax_rate: number;
  total?: number;
  _product?: Product;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_id?: string;
  supplier_name: string;
  supplier_nit?: string;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  expected_date?: string;
  received_date?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  created_at: string;
  company_id?: string;
  branch_id?: string;
  purchase_order_items?: POItem[];
}

const STATUS_CFG = {
  DRAFT:     { label: 'Borrador',   cls: 'bg-slate-100 text-slate-600',     icon: <Edit3 size={11} /> },
  SENT:      { label: 'Enviada',    cls: 'bg-blue-100 text-blue-700',       icon: <Send size={11} /> },
  PARTIAL:   { label: 'Parcial',    cls: 'bg-amber-100 text-amber-700',     icon: <Clock size={11} /> },
  RECEIVED:  { label: 'Recibida',   cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={11} /> },
  CANCELLED: { label: 'Cancelada',  cls: 'bg-red-100 text-red-700',         icon: <XCircle size={11} /> },
};

const EMPTY_ITEM: POItem = { description: '', sku: '', quantity_ordered: 1, quantity_received: 0, unit_cost: 0, tax_rate: 19 };

function nextOrderNumber(existing: PurchaseOrder[]): string {
  const nums = existing.map(o => parseInt(o.order_number.replace(/\D/g, '')) || 0);
  return `OC-${(Math.max(0, ...nums) + 1).toString().padStart(4, '0')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) =>
  n != null ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n) : '—';

const fmtDate = (d: string) =>
  new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

// ─── PDF Generator ────────────────────────────────────────────────────────────
function generatePOPDF(order: PurchaseOrder, company: any, formatMoney: (n: number) => string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const M = 15;
  let y = M;

  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('ORDEN DE COMPRA', M, 13);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(company?.name || 'POSmaster', M, 20);
  doc.text(`NIT: ${company?.nit || ''}`, M, 26);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(order.order_number, W - M, 13, { align: 'right' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${new Date(order.created_at).toLocaleDateString('es-CO')}`, W - M, 20, { align: 'right' });
  if (order.expected_date) doc.text(`Entrega esperada: ${new Date(order.expected_date + 'T12:00:00').toLocaleDateString('es-CO')}`, W - M, 26, { align: 'right' });
  y = 40;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR', M, y); y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(order.supplier_name, M, y); y += 4;
  if (order.supplier_nit) { doc.text(`NIT: ${order.supplier_nit}`, M, y); y += 4; }
  y += 3;
  doc.setDrawColor(226, 232, 240); doc.line(M, y, W - M, y); y += 5;

  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.setFillColor(241, 245, 249); doc.rect(M, y - 3, W - M * 2, 7, 'F');
  doc.text('DESCRIPCIÓN', M + 1, y + 1);
  doc.text('SKU', 95, y + 1);
  doc.text('CANT', 120, y + 1, { align: 'right' });
  doc.text('COSTO U.', 150, y + 1, { align: 'right' });
  doc.text('IVA', 168, y + 1, { align: 'right' });
  doc.text('TOTAL', W - M - 1, y + 1, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal');
  (order.purchase_order_items || []).forEach((item, i) => {
    if (y > 260) { doc.addPage(); y = M; }
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(M, y - 3, W - M * 2, 6, 'F'); }
    doc.text(item.description.substring(0, 38), M + 1, y);
    doc.text(item.sku || '-', 95, y);
    doc.text(item.quantity_ordered.toString(), 120, y, { align: 'right' });
    doc.text(formatMoney(item.unit_cost), 150, y, { align: 'right' });
    doc.text(item.tax_rate > 0 ? `${item.tax_rate}%` : 'EX', 168, y, { align: 'right' });
    doc.text(formatMoney(item.quantity_ordered * item.unit_cost), W - M - 1, y, { align: 'right' });
    y += 6;
  });

  y += 2; doc.line(M, y, W - M, y); y += 6;
  const tx = W - M - 80;
  const tot = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, tx, y); doc.text(val, W - M - 1, y, { align: 'right' }); y += 5;
  };
  doc.setFontSize(8);
  tot('Subtotal:', formatMoney(order.subtotal));
  tot('IVA:', formatMoney(order.tax_amount));
  doc.line(tx, y - 1, W - M, y - 1); y += 2;
  doc.setFontSize(10);
  tot('TOTAL:', formatMoney(order.total_amount), true);

  if (order.notes) {
    y += 4; doc.line(M, y, W - M, y); y += 5;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('NOTAS', M, y); y += 4;
    doc.setFont('helvetica', 'normal');
    order.notes.split('\n').forEach(l => { if (y < 280) { doc.text(l, M, y); y += 3.5; } });
  }

  doc.setFontSize(7); doc.setTextColor(148, 163, 184);
  doc.text('Generado por POSmaster · posmaster.app', W / 2, 290, { align: 'center' });
  doc.save(`${order.order_number}.pdf`);
}

// ─── Receive Modal ────────────────────────────────────────────────────────────
interface ReceiveModalProps {
  order: PurchaseOrder;
  sessionId: string | null;
  suppliers: Supplier[];
  onClose: () => void;
  onDone: (updatedOrder: PurchaseOrder, stockChanges: string[]) => void;
  formatMoney: (n: number) => string;
}

const ReceiveModal: React.FC<ReceiveModalProps> = ({ order, sessionId, suppliers, onClose, onDone, formatMoney }) => {
  const [items, setItems] = useState<POItem[]>(
    (order.purchase_order_items || []).map(i => ({ ...i, quantity_received: i.quantity_received || 0 }))
  );
  const [saving, setSaving] = useState(false);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [payWithCash, setPayWithCash] = useState(false);
  const [cashAmount, setCashAmount] = useState(order.total_amount || 0);

  // Estado del proveedor (el de la OC + poder cambiarlo)
  const [selectedSupplierId, setSelectedSupplierId] = useState(order.supplier_id || '');
  const [selectedSupplierName, setSelectedSupplierName] = useState(order.supplier_name || '');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const allReceived = items.every(i => i.quantity_received >= i.quantity_ordered);
  const someReceived = items.some(i => i.quantity_received > 0);

  // Filtrar proveedores para el dropdown
  const filteredSuppliers = suppliers.filter(s =>
    !supplierSearch ||
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.nit || '').includes(supplierSearch)
  ).slice(0, 8);

  // Seleccionar un proveedor existente
  const selectSupplier = (id: string) => {
    const sup = suppliers.find(s => s.id === id);
    if (sup) {
      setSelectedSupplierId(sup.id);
      setSelectedSupplierName(sup.name);
    }
    setShowSupplierDropdown(false);
    setSupplierSearch('');
  };

  // Crear proveedor nuevo si no existe
  const handleSupplierBlur = async () => {
    setShowSupplierDropdown(false);
    const name = selectedSupplierName.trim();
    if (!name) return;

    // Buscar si ya existe
    const existing = suppliers.find(s => s.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setSelectedSupplierId(existing.id);
      setSelectedSupplierName(existing.name);
      return;
    }

    // Crear nuevo proveedor
    setCreatingSupplier(true);
    try {
      const { data, error } = await supabase.from('suppliers').insert({
        company_id: order.company_id || null,
        name: name,
      }).select('id').single();

      if (error) throw error;
      if (data) {
        setSelectedSupplierId(data.id);
        toast.success(`Proveedor "${name}" creado`);
      }
    } catch (err: any) {
      console.warn('Error creando proveedor:', err);
      toast.error('Error al crear proveedor: ' + err.message);
    } finally {
      setCreatingSupplier(false);
    }
  };

  const handleSave = async () => {
    // Validar que la OC esté en estado ENVIADA o PARCIAL
    if (order.status === 'DRAFT') {
      toast.error('⚠️ Diligencie primero la orden de compra. Cambie el estado a "Enviada" antes de recibir.');
      return;
    }

    setSaving(true);
    const receivedProductIds: string[] = [];

    try {
      // Actualizar proveedor en la OC si cambió
      if (selectedSupplierId !== order.supplier_id || selectedSupplierName !== order.supplier_name) {
        await supabase.from('purchase_orders').update({
          supplier_id: selectedSupplierId || null,
          supplier_name: selectedSupplierName,
        }).eq('id', order.id);
      }

      // 1. Actualizar cantidad recibida en cada item
      for (const item of items) {
        if (!item.id) continue;
        await supabase.from('purchase_order_items')
          .update({ quantity_received: item.quantity_received })
          .eq('id', item.id);
      }

      // 2. Actualizar stock + Kardex + Auditoría por cada item recibido
      for (const item of items) {
        const prevReceived = order.purchase_order_items?.find(i => i.id === item.id)?.quantity_received || 0;
        const newQty = item.quantity_received - prevReceived;
        if (newQty <= 0) continue;

        let prodId: string | null = item.product_id || null;
        let prod: any = null;

        if (prodId) {
          const { data } = await supabase
            .from('products')
            .select('id, name, sku, stock_quantity, cost, price, company_id, branch_id')
            .eq('id', prodId).single();
          prod = data;
        } else if (item.sku) {
          const { data } = await supabase
            .from('products')
            .select('id, name, sku, stock_quantity, cost, price, company_id, branch_id')
            .eq('sku', item.sku).maybeSingle();
          prod = data;
          if (prod) prodId = prod.id;
        }

        if (!prod || !prodId) {
          console.warn(`Item sin producto en inventario: ${item.description}`);
          continue;
        }

        const stockBefore = prod.stock_quantity ?? 0;
        const stockAfter  = stockBefore + newQty;
        const costBefore  = prod.cost ?? 0;
        const costAfter   = item.unit_cost > 0 ? item.unit_cost : costBefore;

        await supabase.from('products').update({
          stock_quantity: stockAfter,
          cost: costAfter,
        }).eq('id', prodId);

        receivedProductIds.push(prodId);

        await supabase.from('inventory_movements').insert({
          company_id:     prod.company_id,
          branch_id:      prod.branch_id || null,
          product_id:     prodId,
          type:           'COMPRA',
          quantity:       newQty,
          unit_cost:      item.unit_cost,
          total_cost:     newQty * item.unit_cost,
          reference_id:   order.id,
          reference_type: 'purchase_order',
          notes:          `OC ${order.order_number} — ${item.description}`,
        });

        await logAudit({
          company_id:     prod.company_id,
          product_id:     prodId,
          product_name:   prod.name,
          product_sku:    prod.sku,
          action:         'PURCHASE_ORDER',
          source:         'purchase_order',
          changed_fields: {
            stock_quantity: { before: stockBefore, after: stockAfter },
            ...(item.unit_cost > 0 && item.unit_cost !== costBefore
              ? { cost: { before: costBefore, after: costAfter } }
              : {}),
          },
          quantity_before:  stockBefore,
          quantity_after:   stockAfter,
          quantity_delta:   newQty,
          cost_before:      costBefore,
          cost_after:       costAfter,
          reference_id:     order.id,
          reference_label:  `Orden de Compra #${order.order_number} — ${selectedSupplierName}`,
          notes:            `Recepción de ${newQty} unidad(es) — OC ${allReceived ? 'completada' : 'parcial'}`,
        });

        if (!item.product_id && prodId && item.id) {
          await supabase.from('purchase_order_items')
            .update({ product_id: prodId }).eq('id', item.id);
        }
      }

      // 3. Actualizar estado de la OC
      const newStatus = allReceived ? 'RECEIVED' : 'PARTIAL';
      const { data: updated } = await supabase.from('purchase_orders')
        .update({
          status: newStatus,
          received_date: receiveDate,
          received_at: new Date().toISOString(),
          supplier_id: selectedSupplierId || null,
          supplier_name: selectedSupplierName,
        })
        .eq('id', order.id)
        .select('*, purchase_order_items(*)')
        .single();

      // 4. Registrar egreso en caja si el usuario activó esa opción
      if (payWithCash && cashAmount > 0 && sessionId) {
        await supabase.from('cash_expenses').insert({
          company_id:   order.company_id || updated?.company_id,
          branch_id:    order.branch_id  || updated?.branch_id || null,
          session_id:   sessionId,
          concept:      `Pago OC ${order.order_number} — ${selectedSupplierName}`,
          amount:       cashAmount,
          category:     'compra_mercancia',
          reference_id: order.id,
        });
        toast.success('💵 Egreso de compra registrado en caja');
      }

      toast.success(allReceived ? '✅ Orden recibida — stock y trazabilidad actualizados' : '📦 Recepción parcial registrada');
      onDone(updated, receivedProductIds);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 text-slate-800 bg-white text-right';

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Registrar recepción</h2>
            <p className="text-xs text-slate-400 mt-0.5">{order.order_number}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* ── Selector de Proveedor con Dropdown ── */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1">
              <Truck size={13} /> Proveedor
            </p>
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Seleccionar o escribir proveedor</label>
              <div className="relative">
                <Truck size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={selectedSupplierName}
                  onChange={e => {
                    setSelectedSupplierName(e.target.value);
                    setSupplierSearch(e.target.value);
                    setSelectedSupplierId('');
                    setShowSupplierDropdown(true);
                  }}
                  onFocus={() => { setShowSupplierDropdown(true); setSupplierSearch(''); }}
                  onBlur={() => setTimeout(handleSupplierBlur, 300)}
                  placeholder="Buscar proveedor o escribir uno nuevo..."
                  className="w-full pl-9 pr-4 py-2.5 border border-blue-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 text-slate-800 bg-white"
                />
                {creatingSupplier && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Dropdown de proveedores existentes */}
              {showSupplierDropdown && filteredSuppliers.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                  {filteredSuppliers.map(s => (
                    <button
                      key={s.id}
                      onMouseDown={() => selectSupplier(s.id)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left border-b border-slate-50 last:border-0"
                    >
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{s.name}</p>
                        {s.nit && <p className="text-[10px] text-slate-400">NIT: {s.nit}</p>}
                      </div>
                      {(s.phone || s.email) && (
                        <span className="text-[10px] text-blue-500">
                          {s.phone ? `📞 ${s.phone}` : `📧 ${s.email}`}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {showSupplierDropdown && filteredSuppliers.length === 0 && supplierSearch && (
                <div className="absolute top-full left-0 right-0 z-30 bg-white border border-blue-200 rounded-xl shadow-lg mt-1 p-3">
                  <p className="text-xs text-blue-600 font-semibold">
                    No se encontró "{supplierSearch}"
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Al salir del campo se creará como proveedor nuevo
                  </p>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Fecha de recepción</label>
            <input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-400 text-slate-800" />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
            <p className="font-bold mb-0.5">💡 Trazabilidad automática</p>
            <p>Al confirmar, se actualizan el stock, el Kardex y el <strong>historial de auditoría</strong> de cada producto.</p>
          </div>

          <div>
            <div className="grid grid-cols-12 gap-1 text-[10px] font-bold text-slate-400 uppercase px-1 mb-2">
              <span className="col-span-5">Producto</span>
              <span className="col-span-2 text-right">Pedido</span>
              <span className="col-span-2 text-right">Ya recibido</span>
              <span className="col-span-3 text-right">Recibiendo ahora</span>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const prevReceived = order.purchase_order_items?.find(i => i.id === item.id)?.quantity_received || 0;
                const remaining = item.quantity_ordered - prevReceived;
                const isComplete = item.quantity_received >= item.quantity_ordered;
                return (
                  <div key={idx} className={`grid grid-cols-12 gap-1 items-center p-2 rounded-lg ${isComplete ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                    <div className="col-span-5">
                      <p className="text-xs font-semibold text-slate-800 truncate">{item.description}</p>
                      {item.sku && <p className="text-[10px] text-slate-400">{item.sku}</p>}
                    </div>
                    <div className="col-span-2 text-right text-xs text-slate-500">{item.quantity_ordered}</div>
                    <div className="col-span-2 text-right text-xs text-slate-500">{prevReceived}</div>
                    <div className="col-span-3">
                      <input type="number" min="0" max={item.quantity_ordered} step="0.001"
                        className={inputCls}
                        value={item.quantity_received}
                        onChange={e => setItems(prev => prev.map((it, i) =>
                          i === idx ? { ...it, quantity_received: parseFloat(e.target.value) || 0 } : it
                        ))} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {items.some(i => !i.product_id && !i.sku) && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-800">
              <p className="font-bold mb-1">⚠️ Algunos productos no tienen SKU ni están vinculados al inventario</p>
              <p>Esos items <strong>no actualizarán el stock</strong>. Para que funcione, edita la OC y selecciona cada producto desde el buscador del inventario.</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setItems(prev => prev.map(i => ({ ...i, quantity_received: i.quantity_ordered })))}
              className="flex-1 py-2 text-xs font-bold text-emerald-700 bg-emerald-100 rounded-xl hover:bg-emerald-200">
              ✅ Recibir todo completo
            </button>
            <button onClick={() => setItems(prev => prev.map(i => ({ ...i, quantity_received: 0 })))}
              className="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200">
              Limpiar
            </button>
          </div>

          <div className={`rounded-xl border-2 p-4 transition-all ${payWithCash ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Banknote size={16} className={payWithCash ? 'text-emerald-600' : 'text-slate-400'} />
                <span className="text-sm font-bold text-slate-700">Registrar pago en caja (efectivo)</span>
                {!sessionId && (
                  <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">
                    Caja cerrada
                  </span>
                )}
              </div>
              <div
                onClick={() => sessionId && setPayWithCash(p => !p)}
                className={`relative w-11 h-6 rounded-full transition-colors ${!sessionId ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${payWithCash ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${payWithCash ? 'left-5' : 'left-0.5'}`} />
              </div>
            </div>
            {payWithCash && (
              <div className="space-y-2">
                <p className="text-xs text-emerald-700">Se registrará un egreso automático en el turno de caja activo.</p>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Monto pagado ($)</label>
                  <input
                    type="number" min="0" step="1000"
                    value={cashAmount}
                    onChange={e => setCashAmount(parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 border border-emerald-300 rounded-lg text-sm font-bold text-emerald-800 bg-white outline-none focus:ring-2 focus:ring-emerald-400 text-right"
                  />
                </div>
                <p className="text-[10px] text-slate-400">Total OC: {formatMoney(order.total_amount)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 text-sm hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !someReceived}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-60">
            <Package size={15} /> {saving ? 'Guardando...' : 'Confirmar recepción'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Order Form ───────────────────────────────────────────────────────────────
interface OrderFormProps {
  initial?: PurchaseOrder | null;
  products: Product[];
  suppliers: Supplier[];
  companyId: string;
  branchId: string | null;
  nextNumber: string;
  onClose: () => void;
  onSaved: (o: PurchaseOrder) => void;
  formatMoney: (n: number) => string;
}

const OrderForm: React.FC<OrderFormProps> = ({ initial, products, suppliers, companyId, branchId, nextNumber, onClose, onSaved, formatMoney }) => {
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [showProductList, setShowProductList] = useState(false);
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // ★ CAMBIO CRÍTICO: El estado inicial siempre es DRAFT, nunca RECEIVED
  const [form, setForm] = useState({
    order_number: initial?.order_number || nextNumber,
    supplier_id: initial?.supplier_id || '',
    supplier_name: initial?.supplier_name || '',
    supplier_nit: initial?.supplier_nit || '',
    expected_date: initial?.expected_date || '',
    notes: initial?.notes || '',
    status: (initial?.status === 'DRAFT' || initial?.status === 'SENT')
      ? initial.status
      : 'DRAFT' as PurchaseOrder['status'],
  });

  const [items, setItems] = useState<POItem[]>(() => {
    if (initial?.purchase_order_items?.length) return initial.purchase_order_items;
    try {
      const prefill = sessionStorage.getItem('posmaster_po_prefill');
      if (prefill) {
        sessionStorage.removeItem('posmaster_po_prefill');
        const p = JSON.parse(prefill);
        return [{ ...EMPTY_ITEM, ...p }];
      }
    } catch {}
    return [{ ...EMPTY_ITEM }];
  });

  const subtotal    = items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0);
  const taxAmount   = items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost * (i.tax_rate / 100), 0);
  const totalAmount = subtotal + taxAmount;

  const filteredProducts = products.filter(p =>
    !productSearch ||
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 8);

  const selectSupplier = (id: string) => {
    const sup = suppliers.find(s => s.id === id);
    setForm(f => ({ ...f, supplier_id: id, supplier_name: sup?.name || '', supplier_nit: sup?.nit || '' }));
  };

  const selectProduct = (product: Product, idx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item, product_id: product.id, description: product.name,
      sku: product.sku || '', unit_cost: product.cost || 0, tax_rate: product.tax_rate || 19, _product: product,
    } : item));
    setShowProductList(false); setProductSearch(''); setActiveItemIdx(null);
  };

  const updateItem = (idx: number, field: keyof POItem, value: any) =>
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  const handleSave = async () => {
    if (!form.supplier_name.trim()) { toast.error('Selecciona o ingresa el proveedor'); return; }
    if (items.every(i => !i.description.trim())) { toast.error('Agrega al menos un producto'); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId, branch_id: branchId,
        order_number: form.order_number, supplier_id: form.supplier_id || null,
        supplier_name: form.supplier_name, supplier_nit: form.supplier_nit || null,
        expected_date: form.expected_date || null, notes: form.notes || null,
        status: form.status, subtotal, tax_amount: taxAmount, total_amount: totalAmount,
      };

      let orderId = initial?.id;
      if (isEdit) {
        await supabase.from('purchase_orders').update(payload).eq('id', orderId);
        await supabase.from('purchase_order_items').delete().eq('order_id', orderId);
      } else {
        const { data, error } = await supabase.from('purchase_orders').insert(payload).select().single();
        if (error) throw error;
        orderId = data.id;
      }

      const itemsPayload = items.filter(i => i.description.trim()).map(i => ({
        order_id: orderId, product_id: i.product_id || null, description: i.description,
        sku: i.sku || null, quantity_ordered: i.quantity_ordered, quantity_received: 0,
        unit_cost: i.unit_cost, tax_rate: i.tax_rate,
      }));
      if (itemsPayload.length) await supabase.from('purchase_order_items').insert(itemsPayload);

      const { data: saved } = await supabase.from('purchase_orders')
        .select('*, purchase_order_items(*)')
        .eq('id', orderId).single();

      toast.success(isEdit ? 'Orden actualizada' : 'Orden de compra creada');
      onSaved(saved);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-400 text-slate-800 bg-white';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">{isEdit ? 'Editar orden' : 'Nueva orden de compra'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{form.order_number}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Proveedor</p>
              {suppliers.length > 0 && (
                <select className={inputCls} value={form.supplier_id} onChange={e => selectSupplier(e.target.value)}>
                  <option value="">— Seleccionar proveedor —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <input className={inputCls} placeholder="Nombre del proveedor *" value={form.supplier_name}
                onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} />
              <input className={inputCls} placeholder="NIT del proveedor" value={form.supplier_nit}
                onChange={e => setForm(f => ({ ...f, supplier_nit: e.target.value }))} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Detalles</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Número OC</label>
                  <input className={inputCls} value={form.order_number} onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Fecha entrega esperada</label>
                  <input className={inputCls} type="date" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
                </div>
              </div>
              {/* ★ CAMBIO: Solo permite DRAFT y SENT. RECIBIDA se alcanza por el flujo de Recepción */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">
                  Estado
                  <span className="ml-1 text-[10px] text-blue-500 font-normal">(solo Borrador o Enviada al crear)</span>
                </label>
                <select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as PurchaseOrder['status'] }))}>
                  <option value="DRAFT">Borrador</option>
                  <option value="SENT">Enviada</option>
                </select>
              </div>
              <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Notas u observaciones..."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Productos a pedir</p>
              <button onClick={() => setItems(prev => [...prev, { ...EMPTY_ITEM }])}
                className="flex items-center gap-1 text-xs text-slate-600 font-semibold hover:text-slate-900">
                <Plus size={13} /> Agregar producto
              </button>
            </div>
            <div className="grid grid-cols-12 gap-1 text-[10px] font-bold text-slate-400 uppercase px-1 mb-1">
              <span className="col-span-4">Descripción</span>
              <span className="col-span-2">SKU</span>
              <span className="col-span-2 text-right">Cantidad</span>
              <span className="col-span-2 text-right">Costo unit.</span>
              <span className="col-span-1 text-right">IVA%</span>
              <span className="col-span-1"></span>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="relative">
                  <div className="grid grid-cols-12 gap-1 items-center">
                    <div className="col-span-4 relative">
                      <input className={inputCls + ' pr-7'} placeholder="Nombre del producto..."
                        value={item.description}
                        onChange={e => { updateItem(idx, 'description', e.target.value); setProductSearch(e.target.value); setActiveItemIdx(idx); setShowProductList(true); }}
                        onFocus={() => { setActiveItemIdx(idx); setShowProductList(true); setProductSearch(item.description); }}
                        onBlur={() => setTimeout(() => setShowProductList(false), 200)} />
                      <Package size={12} className="absolute right-2 top-2.5 text-slate-300" />
                    </div>
                    <div className="col-span-2">
                      <input className={inputCls} placeholder="SKU" value={item.sku || ''}
                        onChange={e => updateItem(idx, 'sku', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <input className={inputCls + ' text-right'} type="number" min="0.001" step="0.001"
                        value={item.quantity_ordered} onChange={e => updateItem(idx, 'quantity_ordered', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-2">
                      <input className={inputCls + ' text-right'} type="number" min="0"
                        value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-1">
                      <input className={inputCls + ' text-right'} type="number" min="0" max="100"
                        value={item.tax_rate} onChange={e => updateItem(idx, 'tax_rate', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="col-span-1 flex items-center justify-end">
                      <button onClick={() => {
                        if (items.length === 1) { setItems([{ ...EMPTY_ITEM }]); return; }
                        setItems(prev => prev.filter((_, i) => i !== idx));
                      }} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 pr-6 mt-0.5">
                    {formatMoney(item.quantity_ordered * item.unit_cost)}
                    {item.tax_rate > 0 && <span className="ml-1 text-amber-500">+IVA {item.tax_rate}%</span>}
                  </div>
                  {showProductList && activeItemIdx === idx && filteredProducts.length > 0 && (
                    <div className="absolute top-full left-0 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-20 mt-1 overflow-hidden">
                      {filteredProducts.map(p => (
                        <button key={p.id} onMouseDown={() => selectProduct(p, idx)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{p.name}</p>
                            <p className="text-[10px] text-slate-400">{p.sku} · Stock: {p.stock_quantity}</p>
                          </div>
                          <span className="text-xs font-bold text-slate-500">Costo: {formatMoney(p.cost)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between text-slate-500"><span>IVA</span><span>{formatMoney(taxAmount)}</span></div>
              <div className="flex justify-between font-bold text-slate-800 text-base border-t border-slate-200 pt-1.5">
                <span>Total OC</span><span>{formatMoney(totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 text-sm hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 disabled:opacity-60">
            <Save size={15} /> {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear orden'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const PurchaseOrders: React.FC = () => {
  const { products, company, companyId, branchId, session, refreshAll } = useDatabase();
  const { formatMoney } = useCurrency();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editOrder, setEditOrder] = useState<PurchaseOrder | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);

  const [localProductStock, setLocalProductStock] = useState<Record<string, number>>({});
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [zeroStockSearch, setZeroStockSearch] = useState('');
  const [historyProduct, setHistoryProduct] = useState<{id: string; name: string; sku: string} | null>(null);

  const productsWithLocalStock = (products || []).map(p => ({
    ...p,
    stock_quantity: localProductStock[p.id!] !== undefined
      ? localProductStock[p.id!]
      : p.stock_quantity,
  }));

  const zeroStockProducts = productsWithLocalStock.filter(p =>
    p.stock_quantity <= 0 &&
    p.type !== 'SERVICE' &&
    (p as any).type !== 'WEIGHABLE' &&
    (!zeroStockSearch ||
      p.name.toLowerCase().includes(zeroStockSearch.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(zeroStockSearch.toLowerCase()) ||
      ((p as any).category || '').toLowerCase().includes(zeroStockSearch.toLowerCase()))
  );

  const addZeroStockToNewOrder = (product: Product) => {
    setShowZeroStock(false);
    sessionStorage.setItem('posmaster_po_prefill', JSON.stringify({
      product_id: product.id,
      description: product.name,
      sku: product.sku || '',
      unit_cost: product.cost || 0,
      tax_rate: (product as any).tax_rate || 19,
    }));
    setEditOrder(null);
    setShowForm(true);
  };

  // ★ NUEVO: Handler para el botón 🔄 Recibir en Productos Agotados
  const handleQuickReceive = () => {
    toast.error('⚠️ Diligencie primero la orden de compra (OC)', {
      duration: 4000,
      icon: '🚫',
      id: 'quick-receive-blocked',
    });
  };

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: ords }, { data: sups }] = await Promise.all([
      supabase.from('purchase_orders').select('*, purchase_order_items(*)').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('company_id', companyId).order('name'),
    ]);
    setOrders(ords || []);
    setSuppliers(sups || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.order_number.toLowerCase().includes(search.toLowerCase()) || o.supplier_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const kpis = {
    draft:        orders.filter(o => o.status === 'DRAFT').length,
    sent:         orders.filter(o => o.status === 'SENT').length,
    pending:      orders.filter(o => ['DRAFT','SENT','PARTIAL'].includes(o.status)).length,
    totalPending: orders.filter(o => ['SENT','PARTIAL'].includes(o.status)).reduce((s, o) => s + o.total_amount, 0),
  };

  const handleDelete = async (order: PurchaseOrder) => {
    if (!window.confirm(`¿Eliminar orden ${order.order_number}?`)) return;
    await supabase.from('purchase_orders').delete().eq('id', order.id);
    toast.success('Orden eliminada');
    setOrders(prev => prev.filter(o => o.id !== order.id));
  };

  const handleStatusChange = async (order: PurchaseOrder, status: PurchaseOrder['status']) => {
    // ★ SEGURIDAD: No permitir cambiar a RECEIVED directamente desde aquí
    if (status === 'RECEIVED') {
      toast.error('⚠️ Para marcar como Recibida, use el botón "Recibir" en el detalle de la OC');
      return;
    }
    await supabase.from('purchase_orders').update({ status }).eq('id', order.id);
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status } : o));
    if (detailOrder?.id === order.id) setDetailOrder(prev => prev ? { ...prev, status } : null);
    toast.success(`Orden marcada como ${STATUS_CFG[status].label}`);
  };

  // ─── EXPORTAR HISTORIAL PDF ───────────────────────────────────────────
  const exportOrderHistoryPDF = async (order: PurchaseOrder) => {
    toast.loading('Generando historial PDF...', { id: 'export-pdf' });
    try {
      const itemIds = (order.purchase_order_items || [])
        .map(i => i.product_id)
        .filter((id): id is string => !!id);

      if (itemIds.length === 0) {
        toast.error('No hay productos vinculados a esta OC', { id: 'export-pdf' });
        return;
      }

      const { data: history }: { data: AuditEntry[] | null } = await supabase
        .from('product_audit_log')
        .select('*')
        .in('product_id', itemIds)
        .eq('source', 'purchase_order')
        .order('created_at', { ascending: true });

      const allHistory = history || [];

      if (allHistory.length === 0) {
        toast.error('Sin registros de historial para esta OC', { id: 'export-pdf' });
        return;
      }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210;
      const M = 14;
      let y = M;

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 30, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('HISTORIAL POR ORDEN DE COMPRA', M, 13);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`${order.order_number} — ${order.supplier_name}`, M, 20);
      doc.text(`Exportado: ${new Date().toLocaleString('es-CO')}`, M, 26);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(order.order_number, W - M, 13, { align: 'right' });
      doc.text(formatMoney(order.total_amount), W - M, 20, { align: 'right' });
      y = 38;

      const totalIn = allHistory.filter(e => (e.quantity_delta ?? 0) > 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);
      const totalOut = allHistory.filter(e => (e.quantity_delta ?? 0) < 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);

      doc.setFillColor(248, 250, 252);
      doc.rect(M, y, W - M * 2, 10, 'F');
      const summaryKpis = [
        { label: 'Productos', value: itemIds.length.toString() },
        { label: 'Registros', value: allHistory.length.toString() },
        { label: 'Total entradas', value: totalIn > 0 ? `+${totalIn}` : '—' },
        { label: 'Total salidas', value: totalOut !== 0 ? String(totalOut) : '—' },
      ];
      summaryKpis.forEach((kpi, i) => {
        const xPos = M + (i * (W - M * 2) / 4) + 4;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, xPos, y + 3);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(kpi.value, xPos, y + 7);
      });
      y += 15;

      const grouped: Record<string, AuditEntry[]> = {};
      allHistory.forEach(e => {
        const key = e.product_id || 'unknown';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
      });

      for (const [, entries] of Object.entries(grouped)) {
        const firstEntry = entries[0];
        const prodName = firstEntry.product_name || 'Producto desconocido';
        const prodSku = firstEntry.product_sku || '—';

        if (y > 255) { doc.addPage(); y = M; }

        doc.setFillColor(241, 245, 249);
        doc.rect(M, y, W - M * 2, 9, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.line(M, y, W - M, y);
        doc.line(M, y + 9, W - M, y + 9);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(prodName, M + 4, y + 6);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`SKU: ${prodSku}`, M + 100, y + 6);

        const prodIn = entries.filter(e => (e.quantity_delta ?? 0) > 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);
        if (prodIn > 0) {
          doc.setTextColor(22, 163, 74);
          doc.setFont('helvetica', 'bold');
          doc.text(`+${prodIn}`, W - M - 4, y + 6, { align: 'right' });
        }
        y += 12;

        const headerCols = [
          { label: 'Fecha', x: M + 2, w: 28 },
          { label: 'Acción', x: M + 30, w: 28 },
          { label: 'Stock Δ', x: M + 58, w: 16 },
          { label: 'Stock Ant.', x: M + 74, w: 16 },
          { label: 'Stock Nuevo', x: M + 90, w: 16 },
          { label: 'Costo', x: M + 106, w: 30 },
          { label: 'Usuario', x: M + 136, w: 28 },
          { label: 'Notas', x: M + 164, w: 32 },
        ];

        doc.setFillColor(248, 250, 252);
        doc.rect(M, y, W - M * 2, 7, 'F');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        headerCols.forEach(c => doc.text(c.label, c.x, y + 5));
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);

        entries.forEach((entry, i) => {
          if (y > 275) {
            doc.addPage(); y = M;
            doc.setFillColor(248, 250, 252);
            doc.rect(M, y, W - M * 2, 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(100, 116, 139);
            headerCols.forEach(c => doc.text(c.label, c.x, y + 5));
            y += 8;
            doc.setFont('helvetica', 'normal');
          }

          if (i % 2 === 0) {
            doc.setFillColor(252, 252, 253);
            doc.rect(M, y - 1, W - M * 2, 6, 'F');
          }

          doc.setTextColor(30, 41, 59);
          doc.text(entry.created_at ? fmtDate(entry.created_at) : '—', headerCols[0].x, y + 3);

          doc.setFont('helvetica', 'bold');
          doc.text(ACTION_LABELS[entry.action] || entry.action, headerCols[1].x, y + 3);
          doc.setFont('helvetica', 'normal');

          const delta = entry.quantity_delta ?? 0;
          if (delta !== 0) {
            doc.setTextColor(delta > 0 ? 22 : 220, delta > 0 ? 163 : 38, delta > 0 ? 74 : 38);
            doc.setFont('helvetica', 'bold');
            doc.text(`${delta > 0 ? '+' : ''}${delta}`, headerCols[2].x, y + 3);
            doc.setFont('helvetica', 'normal');
          } else {
            doc.setTextColor(148, 163, 184);
            doc.text('—', headerCols[2].x, y + 3);
          }

          doc.setTextColor(71, 85, 105);
          doc.text(String(entry.quantity_before ?? '—'), headerCols[3].x, y + 3);
          doc.setTextColor(22, 163, 74);
          doc.setFont('helvetica', 'bold');
          doc.text(String(entry.quantity_after ?? '—'), headerCols[4].x, y + 3);
          doc.setFont('helvetica', 'normal');

          if (entry.cost_before != null || entry.cost_after != null) {
            doc.setTextColor(124, 58, 237);
            doc.text(`${fmt(entry.cost_before)} → ${fmt(entry.cost_after)}`, headerCols[5].x, y + 3);
          } else {
            doc.setTextColor(148, 163, 184);
            doc.text('—', headerCols[5].x, y + 3);
          }

          doc.setTextColor(71, 85, 105);
          doc.text((entry.user_name || '—').substring(0, 20), headerCols[6].x, y + 3);

          doc.setTextColor(148, 163, 184);
          doc.text((entry.notes || '').substring(0, 40), headerCols[7].x, y + 3);

          y += 7;
        });

        y += 5;
      }

      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `${order.order_number} · ${order.supplier_name} · Generado por POSmaster · Página ${p} de ${totalPages}`,
          W / 2, 290, { align: 'center' }
        );
      }

      doc.save(`historial_OC_${order.order_number}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF generado con éxito', { id: 'export-pdf' });
    } catch (err: any) {
      toast.error('Error al generar PDF: ' + err.message, { id: 'export-pdf' });
    }
  };

  // ─── EXPORTAR HISTORIAL EXCEL ───────────────────────────────────────────
  const exportOrderHistoryExcel = async (order: PurchaseOrder) => {
    toast.loading('Generando historial Excel...', { id: 'export-xlsx' });
    try {
      const itemIds = (order.purchase_order_items || [])
        .map(i => i.product_id)
        .filter((id): id is string => !!id);

      if (itemIds.length === 0) {
        toast.error('No hay productos vinculados a esta OC', { id: 'export-xlsx' });
        return;
      }

      const { data: history }: { data: AuditEntry[] | null } = await supabase
        .from('product_audit_log')
        .select('*')
        .in('product_id', itemIds)
        .eq('source', 'purchase_order')
        .order('created_at', { ascending: true });

      const allHistory = history || [];

      if (allHistory.length === 0) {
        toast.error('Sin registros de historial para esta OC', { id: 'export-xlsx' });
        return;
      }

      const grouped: Record<string, AuditEntry[]> = {};
      allHistory.forEach(e => {
        const key = e.product_id || 'unknown';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
      });

      const summaryRows = Object.entries(grouped).map(([, entries]) => {
        const first = entries[0];            // más antiguo (para nombre, SKU)
        const last  = entries[entries.length - 1]; // ★ más reciente (para "último")
        const totalIn = entries.filter(e => (e.quantity_delta ?? 0) > 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);
        const totalOut = entries.filter(e => (e.quantity_delta ?? 0) < 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);
        // Buscar último precio y costo desde el final hacia atrás
        const lastWithPrice  = [...entries].reverse().find(e => e.price_after != null);
        const lastWithCost   = [...entries].reverse().find(e => e.cost_after != null);
        return {
          'Producto': first.product_name || 'Desconocido',
          'SKU': first.product_sku || '—',
          'Registros': entries.length,
          'Total entradas': totalIn > 0 ? totalIn : 0,
          'Total salidas': totalOut,
          'Último costo': lastWithCost?.cost_after ?? '',
          'Último precio': lastWithPrice?.price_after ?? '',
          'Último stock': last.quantity_after ?? '',
          'Usuario últ. movimiento': last.user_name || '',
        };
      });

      const detailRows = allHistory.map(e => {
        const changedFields = e.changed_fields
          ? Object.entries(e.changed_fields)
              .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${v.before} → ${v.after}`)
              .join(' | ')
          : '';
        return {
          'Fecha': e.created_at ? fmtDate(e.created_at) : '—',
          'Producto': e.product_name || '',
          'SKU': e.product_sku || '',
          'Acción': ACTION_LABELS[e.action] || e.action,
          'Fuente': SOURCE_LABELS[e.source] || e.source,
          'Stock anterior': e.quantity_before ?? '',
          'Stock nuevo': e.quantity_after ?? '',
          'Diferencia': e.quantity_delta ?? '',
          'Precio anterior': e.price_before ?? '',
          'Precio nuevo': e.price_after ?? '',
          'Costo anterior': e.cost_before ?? '',
          'Costo nuevo': e.cost_after ?? '',
          'Campos cambiados': changedFields,
          'Referencia': e.reference_label || '',
          'Notas': e.notes || '',
          'Usuario': e.user_name || '',
        };
      });

      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.json_to_sheet(summaryRows);
      ws1['!cols'] = [
        { wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen por Producto');

      const ws2 = XLSX.utils.json_to_sheet(detailRows);
      ws2['!cols'] = [
        { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 50 }, { wch: 24 }, { wch: 28 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws2, 'Detalle Completo');

      XLSX.writeFile(wb, `historial_OC_${order.order_number}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel generado con éxito', { id: 'export-xlsx' });
    } catch (err: any) {
      toast.error('Error al generar Excel: ' + err.message, { id: 'export-xlsx' });
    }
  };

  const nextNumber = nextOrderNumber(orders);

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Órdenes de Compra</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestiona pedidos a proveedores y recepción de mercancía</p>
        </div>

        <button
          onClick={() => {
            const now = new Date().toLocaleString('es-CO');
            const totalGeneral = filtered.reduce((s, o) => s + o.total_amount, 0);
            const rows = filtered.map(o => {
              const cfg = STATUS_CFG[o.status];
              return `<tr>
                <td>${o.order_number}</td>
                <td>${o.supplier_name}${o.supplier_nit ? `<br><span style="color:#94a3b8;font-size:10px">NIT: ${o.supplier_nit}</span>` : ''}</td>
                <td>${new Date(o.created_at).toLocaleDateString('es-CO')}</td>
                <td>${o.expected_date ? new Date(o.expected_date + 'T12:00:00').toLocaleDateString('es-CO') : '—'}</td>
                <td style="text-align:center"><span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${o.status==='RECEIVED'?'#d1fae5':o.status==='SENT'?'#dbeafe':o.status==='PARTIAL'?'#fef3c7':o.status==='CANCELLED'?'#fee2e2':'#f1f5f9'};color:${o.status==='RECEIVED'?'#065f46':o.status==='SENT'?'#1e40af':o.status==='PARTIAL'?'#92400e':o.status==='CANCELLED'?'#991b1b':'#475569'}">${cfg.label}</span></td>
                <td style="text-align:right;font-weight:700">$${o.total_amount.toLocaleString('es-CO')}</td>
              </tr>`;
            }).join('');

            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Órdenes de Compra</title>
            <style>
              body{font-family:Arial,sans-serif;margin:0;padding:24px 32px;color:#0f172a;font-size:11px}
              h1{font-size:18px;margin:0}
              table{width:100%;border-collapse:collapse;margin-top:8px}
              th{background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;padding:7px 10px;text-align:left;border-bottom:2px solid #e2e8f0}
              td{padding:6px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
              tr:hover td{background:#f8fafc}
              .total-row td{font-weight:800;font-size:13px;border-top:2px solid #0f172a;background:#f8fafc}
              @page{size:A4 landscape;margin:12mm}
              @media print{button{display:none}}
            </style></head><body>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #0f172a">
              <div>
                <h1>${company?.name || 'POSmaster'}</h1>
                <p style="margin:3px 0 0;color:#64748b;font-size:11px">NIT: ${company?.nit || '—'}</p>
              </div>
              <div style="text-align:right">
                <p style="font-weight:800;font-size:15px;color:#3b82f6;margin:0">ÓRDENES DE COMPRA</p>
                <p style="font-size:11px;color:#64748b;margin:3px 0">${now} · ${filtered.length} órdenes</p>
                ${statusFilter !== 'ALL' ? `<p style="font-size:11px;color:#f59e0b;margin:0">Filtro: ${STATUS_CFG[statusFilter as keyof typeof STATUS_CFG]?.label || statusFilter}</p>` : ''}
              </div>
            </div>
            <table>
              <thead><tr>
                <th>Número</th><th>Proveedor</th><th>Fecha</th><th>Entrega Esp.</th><th style="text-align:center">Estado</th><th style="text-align:right">Total</th>
              </tr></thead>
              <tbody>
                ${rows}
                <tr class="total-row">
                  <td colspan="5" style="text-align:right">TOTAL GENERAL (${filtered.length} órdenes)</td>
                  <td style="text-align:right;color:#1e40af">$${totalGeneral.toLocaleString('es-CO')}</td>
                </tr>
              </tbody>
            </table>
            <p style="margin-top:24px;text-align:center;font-size:10px;color:#94a3b8">Generado por POSmaster · ${now}</p>
            </body></html>`;

            const w = window.open('', '_blank', 'width=1200,height=800');
            if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-xl font-bold text-sm hover:bg-slate-800 shadow-sm"
        >
          📄 Exportar PDF
        </button>

        <button
          onClick={() => { window.location.hash = '/warehouse'; }}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 shadow-sm"
          title="Ir al Display de Bodega">
          📦 Display Bodega
        </button>
        <button onClick={() => { setEditOrder(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 shadow-sm">
          <Plus size={16} /> Nueva orden
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Borradores', value: kpis.draft,                     icon: <Edit3 size={16} />,        color: 'bg-slate-100 text-slate-600'   },
          { label: 'Enviadas',   value: kpis.sent,                      icon: <Send size={16} />,         color: 'bg-blue-100 text-blue-600'     },
          { label: 'Pendientes', value: kpis.pending,                    icon: <Clock size={16} />,        color: 'bg-amber-100 text-amber-600'   },
          { label: 'Por pagar',  value: formatMoney(kpis.totalPending),  icon: <ReceiptText size={16} />,  color: 'bg-purple-100 text-purple-600' },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${k.color}`}>{k.icon}</div>
            <p className="text-xl font-bold text-slate-800">{k.value}</p>
            <p className="text-xs text-slate-500">{k.label}</p>
          </div>
        ))}
      </div>

      {/* ═══════════════════ Panel Productos Agotados ═══════════════════ */}
      <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowZeroStock(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-red-100 transition-colors">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-red-500" />
            <span className="font-bold text-red-700 text-sm">Productos Agotados (Stock = 0)</span>
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {productsWithLocalStock.filter(p => p.stock_quantity <= 0 && p.type !== 'SERVICE' && (p as any).type !== 'WEIGHABLE').length}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-red-500 font-medium">
            {showZeroStock ? 'Ocultar' : 'Ver y agregar a orden'}
            <ChevronDown size={14} className={`transition-transform ${showZeroStock ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {showZeroStock && (
          <div className="border-t border-red-200 p-4">
            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-300"
                placeholder="Filtrar por nombre, SKU o categoría..."
                value={zeroStockSearch}
                onChange={e => setZeroStockSearch(e.target.value)}
              />
            </div>
            {zeroStockProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Package size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">{zeroStockSearch ? 'Sin coincidencias' : '¡Sin productos agotados! 🎉'}</p>
              </div>
            ) : (
              <div className="border border-red-100 rounded-xl overflow-hidden">
                <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
                  <table className="w-full text-xs">
                    <thead className="bg-red-50 sticky top-0 z-10">
                      <tr className="text-red-600 font-bold uppercase tracking-wide">
                        <th className="text-left px-3 py-2">Producto</th>
                        <th className="text-left px-3 py-2">SKU</th>
                        <th className="text-left px-3 py-2">Categoría</th>
                        <th className="text-right px-3 py-2">Stock</th>
                        <th className="text-right px-3 py-2">Costo</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                      {zeroStockProducts.map(p => (
                        <tr key={p.id} className="hover:bg-red-50 transition-colors">
                          <td className="px-3 py-2 font-semibold text-slate-800">{p.name}</td>
                          <td className="px-3 py-2 font-mono text-slate-400">{p.sku || '—'}</td>
                          <td className="px-3 py-2 text-slate-400">{(p as any).category || '—'}</td>
                          <td className="px-3 py-2 text-right font-bold text-red-500">{p.stock_quantity}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{formatMoney(p.cost)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {/* ★ BOTÓN 🔄 RECIBIR — Muestra error, NO permite recibir directo */}
                              <button
                                onClick={handleQuickReceive}
                                title="Debe crear una orden de compra primero"
                                className="flex items-center gap-1 px-2.5 py-1 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors text-[10px] font-bold"
                              >
                                🔄 Recibir
                              </button>
                              {/* ★ BOTÓN OC — Abre formulario de orden de compra */}
                              <button
                                onClick={() => addZeroStockToNewOrder(p)}
                                title="Crear orden de compra formal con este producto"
                                className="flex items-center gap-1 px-2.5 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-[10px] font-bold"
                              >
                                <Plus size={11} /> Crear OC
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center justify-between">
                  <span className="text-[11px] text-red-500 font-semibold">{zeroStockProducts.length} productos agotados</span>
                  <span className="text-[11px] text-slate-400">
                    Haz clic en <strong className="text-red-600">OC</strong> para crear orden de compra ·
                    <span className="text-orange-500 ml-1">🔄 Recibir requiere OC primero</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Buscar por número o proveedor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[['ALL','Todas'],['DRAFT','Borrador'],['SENT','Enviadas'],['PARTIAL','Parcial'],['RECEIVED','Recibidas'],['CANCELLED','Canceladas']].map(([k,l]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${statusFilter === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════ Tabla de Órdenes ═══════════════════ */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Cargando órdenes...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Truck size={32} className="mb-3 opacity-30" />
            <p className="font-semibold">No hay órdenes de compra</p>
            <p className="text-sm mt-1">Crea tu primera orden con el botón de arriba</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Número</th>
                  <th className="text-left px-4 py-3">Proveedor</th>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Entrega esp.</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-center px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(order => {
                  const cfg = STATUS_CFG[order.status];
                  const overdue = order.expected_date && new Date(order.expected_date) < new Date() && !['RECEIVED','CANCELLED'].includes(order.status);
                  const canReceive = ['SENT', 'PARTIAL'].includes(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => setDetailOrder(order)} className="font-bold text-slate-700 hover:text-blue-600 text-sm underline-offset-2 hover:underline">
                          {order.order_number}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{order.supplier_name}</p>
                        {order.supplier_nit && <p className="text-xs text-slate-400">NIT: {order.supplier_nit}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString('es-CO')}</td>
                      <td className="px-4 py-3 text-xs">
                        {order.expected_date
                          ? <span className={overdue ? 'text-red-500 font-semibold' : 'text-slate-500'}>
                              {new Date(order.expected_date + 'T12:00:00').toLocaleDateString('es-CO')}{overdue && ' ⚠️'}
                            </span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 text-sm">{formatMoney(order.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {canReceive ? (
                            <button onClick={() => setReceiveOrder(order)} title="Registrar recepción"
                              className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 hover:text-emerald-800">
                              <Package size={14} />
                            </button>
                          ) : order.status === 'DRAFT' ? (
                            <span className="p-1.5 text-slate-300" title="Cambie el estado a 'Enviada' para poder recibir">
                              <Package size={14} />
                            </span>
                          ) : null}
                          <button onClick={() => generatePOPDF(order, company, formatMoney)} title="PDF"
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                            <Download size={14} />
                          </button>
                          {!['RECEIVED','CANCELLED'].includes(order.status) && (
                            <button onClick={() => { setEditOrder(order); setShowForm(true); }} title="Editar"
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                              <Edit3 size={14} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(order)} title="Eliminar"
                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500">
                            <Trash2 size={14} />
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

      {/* ═══════════════════ Modales ═══════════════════ */}

      {/* Modal OrderForm */}
      {showForm && (
        <OrderForm
          initial={editOrder} products={products} suppliers={suppliers}
          companyId={companyId!} branchId={branchId} nextNumber={nextNumber}
          formatMoney={formatMoney}
          onClose={() => { setShowForm(false); setEditOrder(null); }}
          onSaved={saved => {
            setOrders(prev => editOrder ? prev.map(o => o.id === saved.id ? saved : o) : [saved, ...prev]);
            setShowForm(false); setEditOrder(null);
          }}
        />
      )}

      {/* Modal ReceiveModal */}
      {receiveOrder && (
        <ReceiveModal
          order={receiveOrder}
          sessionId={session?.id || null}
          suppliers={suppliers}
          formatMoney={formatMoney}
          onClose={() => setReceiveOrder(null)}
          onDone={(updated, receivedProductIds) => {
            setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
            setReceiveOrder(null);

            // Actualizar también detailOrder si está abierto
            if (detailOrder?.id === updated.id) {
              setDetailOrder(updated);
            }

            if (receivedProductIds.length > 0) {
              // 1. Consultar stock actualizado inmediatamente para override optimista
              supabase
                .from('products')
                .select('id, stock_quantity')
                .in('id', receivedProductIds)
                .then(({ data }) => {
                  if (data && data.length > 0) {
                    setLocalProductStock(prev => {
                      const next = { ...prev };
                      data.forEach(p => { next[p.id] = p.stock_quantity; });
                      return next;
                    });
                  }
                });

              // 2. Limpiar overrides DESPUÉS de que refreshAll termine
              const clearOverrides = () => {
                setLocalProductStock(prev => {
                  const next = { ...prev };
                  receivedProductIds.forEach(id => delete next[id]);
                  return Object.keys(next).length > 0 ? next : {};
                });
              };

              const result = refreshAll?.();
              if (result && typeof result.then === 'function') {
                result.then(clearOverrides).catch(clearOverrides);
              } else {
                setTimeout(clearOverrides, 2000);
              }
            } else {
              refreshAll?.();
            }
          }}
        />
      )}

      {/* ═══════════════════ Modal detalle OC ═══════════════════ */}
      {detailOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800 text-lg">{detailOrder.order_number}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {detailOrder.supplier_name}{detailOrder.supplier_nit ? ` · NIT: ${detailOrder.supplier_nit}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => generatePOPDF(detailOrder, company, formatMoney)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900">
                  <Download size={13} /> PDF
                </button>
                <button
                  onClick={() => exportOrderHistoryPDF(detailOrder)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700"
                  title="Exportar historial de TODOS los productos de esta OC en un solo PDF">
                  📄 Historial PDF
                </button>
                <button
                  onClick={() => exportOrderHistoryExcel(detailOrder)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700"
                  title="Exportar historial de TODOS los productos de esta OC en un solo Excel">
                  📊 Historial Excel
                </button>
                {!['RECEIVED','CANCELLED'].includes(detailOrder.status) && (
                  <button onClick={() => { setEditOrder(detailOrder); setShowForm(true); setDetailOrder(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700">
                    <Edit3 size={13} /> Editar
                  </button>
                )}
                {/* ★ BOTÓN RECIBIR — Solo visible cuando estado es SENT o PARTIAL */}
                {['SENT','PARTIAL'].includes(detailOrder.status) && (
                  <button onClick={() => { setReceiveOrder(detailOrder); setDetailOrder(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700">
                    <Package size={13} /> Recibir
                  </button>
                )}
                {/* ★ Cuando está en DRAFT: mostrar botón gris deshabilitado con tooltip */}
                {detailOrder.status === 'DRAFT' && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-400 text-xs font-bold rounded-lg cursor-not-allowed"
                    title="Cambie el estado a 'Enviada' primero para poder recibir">
                    <Package size={13} /> Recibir
                  </span>
                )}
                <button onClick={() => setDetailOrder(null)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {[
                  { label: 'Estado',           value: <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CFG[detailOrder.status].cls}`}>{STATUS_CFG[detailOrder.status].icon} {STATUS_CFG[detailOrder.status].label}</span> },
                  { label: 'Fecha creación',   value: new Date(detailOrder.created_at).toLocaleDateString('es-CO') },
                  { label: 'Entrega esperada', value: detailOrder.expected_date ? new Date(detailOrder.expected_date + 'T12:00:00').toLocaleDateString('es-CO') : '—' },
                  { label: 'Fecha recibido',   value: detailOrder.received_date  ? new Date(detailOrder.received_date).toLocaleDateString('es-CO') : '—' },
                ].map((f, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-slate-400 mb-1">{f.label}</p>
                    <div className="font-semibold text-slate-800">{f.value}</div>
                  </div>
                ))}
              </div>

              {/* ★ AVISO cuando está en DRAFT */}
              {detailOrder.status === 'DRAFT' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  <p className="font-bold flex items-center gap-1"><AlertCircle size={13} /> Orden en Borrador</p>
                  <p className="mt-1">Para poder recibir mercancía, primero debe <strong>cambiar el estado a "Enviada"</strong> usando los botones de abajo. La recepción directa no está permitida en estado Borrador.</p>
                </div>
              )}

              {/* ★ AVISO cuando ya está RECIBIDA */}
              {detailOrder.status === 'RECEIVED' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700">
                  <p className="font-bold flex items-center gap-1"><CheckCircle size={13} /> Orden Recibida</p>
                  <p className="mt-1">Esta orden ya fue recibida y el stock fue actualizado. Puede consultar el historial de cambios usando el botón 🕐 en cada producto.</p>
                </div>
              )}

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Package size={12} /> Productos
                </p>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-slate-500 font-bold uppercase tracking-wide">
                        <th className="text-left px-3 py-2">Descripción</th>
                        <th className="text-right px-3 py-2">Pedido</th>
                        <th className="text-right px-3 py-2">Recibido</th>
                        <th className="text-right px-3 py-2">Costo u.</th>
                        <th className="text-right px-3 py-2">Total</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(detailOrder.purchase_order_items || []).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{item.description}</p>
                            {item.sku && <p className="text-slate-400">{item.sku}</p>}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">{item.quantity_ordered}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={item.quantity_received >= item.quantity_ordered ? 'text-emerald-600 font-bold' : item.quantity_received > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}>
                              {item.quantity_received}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">{formatMoney(item.unit_cost)}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">{formatMoney(item.quantity_ordered * item.unit_cost)}</td>
                          <td className="px-3 py-2 text-center">
                            {item.product_id && (
                              <button
                                onClick={() => setHistoryProduct({
                                  id: item.product_id!,
                                  name: item.description,
                                  sku: item.sku || '',
                                })}
                                className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-500 hover:text-amber-700"
                                title="Ver historial del producto">
                                <Clock size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="w-56 space-y-1.5 text-sm bg-slate-50 rounded-xl p-4">
                  <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatMoney(detailOrder.subtotal)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>IVA</span><span>{formatMoney(detailOrder.tax_amount)}</span></div>
                  <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-1.5">
                    <span>Total</span><span className="text-blue-700">{formatMoney(detailOrder.total_amount)}</span>
                  </div>
                </div>
              </div>

              {detailOrder.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-xs font-bold text-amber-700 mb-1">Notas</p>
                  <p className="text-xs text-amber-800">{detailOrder.notes}</p>
                </div>
              )}

              {/* ★ CAMBIO: "Cambiar estado" — No permite RECIBIDA directamente */}
              {!['RECEIVED','CANCELLED'].includes(detailOrder.status) && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Cambiar estado</p>
                  <div className="flex flex-wrap gap-2">
                    {(['DRAFT','SENT','PARTIAL','CANCELLED'] as PurchaseOrder['status'][])
                      .filter(s => s !== detailOrder.status)
                      .map(s => (
                        <button key={s} onClick={() => handleStatusChange(detailOrder, s)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${STATUS_CFG[s].cls} hover:opacity-80`}>
                          {STATUS_CFG[s].icon} {STATUS_CFG[s].label}
                        </button>
                      ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    💡 El estado <strong>"Recibida"</strong> se alcanza automáticamente al usar el botón <strong>"📦 Recibir"</strong> de arriba
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de historial de producto individual */}
      {historyProduct && (
        <ProductHistoryModal
          productId={historyProduct.id}
          productName={historyProduct.name}
          productSku={historyProduct.sku}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </div>
  );
};

export default PurchaseOrders;