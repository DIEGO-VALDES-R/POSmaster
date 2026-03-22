import React, { useState } from 'react';
import {
  ShoppingCart,
  Trash2,
  Minus,
  Plus,
  CreditCard,
  Tag,
} from 'lucide-react';
import { CartItem } from '../types';

interface CartSidebarProps {
  cart: CartItem[];
  totals: {
    subtotalBruto: number;
    discountAmount: number;
    subtotal: number;
    tax: number;
    total: number;
  };
  applyIva: boolean;
  defaultTaxRate: number;
  discountMode: 'pct' | 'val';
  setDiscountMode: (m: 'pct' | 'val') => void;
  globalDiscount: string;
  globalDiscountVal: string;
  clampedDiscount: number;
  handleDiscountPct: (v: string) => void;
  handleDiscountVal: (v: string) => void;
  onToggleIva: () => void;
  onUpdateQuantity: (index: number, delta: number) => void;
  onRemoveItem: (index: number) => void;
  onOpenPayment: () => void;
  formatMoney: (n: number) => string;
}

const CartSidebar: React.FC<CartSidebarProps> = ({
  cart,
  totals,
  applyIva,
  defaultTaxRate,
  discountMode,
  setDiscountMode,
  globalDiscount,
  globalDiscountVal,
  clampedDiscount,
  handleDiscountPct,
  handleDiscountVal,
  onToggleIva,
  onUpdateQuantity,
  onRemoveItem,
  onOpenPayment,
  formatMoney,
}) => {
  const [editingQty, setEditingQty] = useState<{ idx: number; val: string } | null>(null);

  const handleQtyBlur = (idx: number, currentQty: number) => {
    if (!editingQty || editingQty.idx !== idx) return;
    const parsed = parseInt(editingQty.val, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed !== currentQty) {
      const delta = parsed - currentQty;
      onUpdateQuantity(idx, delta);
    }
    setEditingQty(null);
  };

  return (
    <div className="w-96 flex flex-col bg-white rounded-xl shadow-lg border border-slate-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <ShoppingCart size={20} /> Ticket Actual
        </h2>
        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">
          {cart.length} Items
        </span>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <ShoppingCart size={48} className="mb-2 opacity-20" />
            <p>El carrito esta vacio</p>
          </div>
        ) : (
          cart.map((item, idx) => (
            <div
              key={idx}
              className="flex gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50"
            >
              <div className="flex-1">
                <h4 className="text-sm font-medium text-slate-800">
                  {item.product.name}
                </h4>
                {(item.product as any)._variant_name && (
                  <p className="text-xs text-indigo-500 font-semibold">
                    {(item.product as any)._variant_name}
                  </p>
                )}
                {item.serial_number && (
                  <p className="text-xs text-slate-500 font-mono bg-yellow-50 px-1 rounded inline-block">
                    SN: {item.serial_number}
                  </p>
                )}
                <span className="text-xs text-slate-500">
                  {(item.discount || 0) > 0 ? (
                    <>
                      <span className="line-through text-slate-400">{formatMoney(item.price)}</span>
                      {' '}
                      <span className="text-emerald-600 font-semibold">{formatMoney(item.price - (item.discount || 0))}</span>
                      {' '}x {item.quantity}
                      {' '}<span className="text-orange-500">🏷️</span>
                    </>
                  ) : (
                    <>{formatMoney(item.price)} x {item.quantity}</>
                  )}
                </span>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-bold text-sm">
                  {formatMoney((item.price - (item.discount || 0)) * item.quantity)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateQuantity(idx, -1)}
                    className="p-1 hover:bg-slate-200 rounded"
                  >
                    <Minus size={14} />
                  </button>
                  {/* Cantidad editable directamente */}
                  <input
                    type="number"
                    min={1}
                    value={editingQty?.idx === idx ? editingQty.val : item.quantity}
                    onFocus={() => setEditingQty({ idx, val: String(item.quantity) })}
                    onChange={e => setEditingQty({ idx, val: e.target.value })}
                    onBlur={() => handleQtyBlur(idx, item.quantity)}
                    onKeyDown={e => { if (e.key === 'Enter') handleQtyBlur(idx, item.quantity); }}
                    className="w-10 text-center text-sm font-bold border border-slate-300 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300 py-0.5"
                  />
                  <button
                    onClick={() => onUpdateQuantity(idx, 1)}
                    className="p-1 hover:bg-slate-200 rounded"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => onRemoveItem(idx)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer: IVA + Descuento + Totales + Boton */}
      <div className="p-4 bg-slate-50 border-t border-slate-200">
        {/* IVA Toggle */}
        <button
          onClick={onToggleIva}
          className={`w-full mb-3 py-2 px-4 rounded-lg text-sm font-medium border-2 transition-all flex items-center justify-between ${
            applyIva && defaultTaxRate > 0
              ? 'bg-green-50 border-green-400 text-green-700'
              : 'bg-slate-50 border-slate-300 text-slate-500'
          }`}
        >
          <span>IVA {applyIva ? defaultTaxRate : 0}%</span>
          <div
            className={`w-10 h-5 rounded-full flex items-center transition-all px-0.5 ${
              applyIva && defaultTaxRate > 0
                ? 'bg-green-500 justify-end'
                : 'bg-slate-300 justify-start'
            }`}
          >
            <div className="w-4 h-4 bg-white rounded-full shadow" />
          </div>
        </button>

        {/* Descuento Global */}
        <div
          className={`mb-3 rounded-lg border-2 transition-all ${
            clampedDiscount > 0
              ? 'bg-orange-50 border-orange-400'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <Tag
              size={15}
              className={
                clampedDiscount > 0 ? 'text-orange-500' : 'text-slate-400'
              }
            />
            <span
              className={`text-sm font-medium flex-1 ${
                clampedDiscount > 0 ? 'text-orange-700' : 'text-slate-600'
              }`}
            >
              Descuento
            </span>
            <div className="flex rounded-lg overflow-hidden border border-slate-300 text-xs font-bold">
              <button
                onClick={() => setDiscountMode('pct')}
                className={`px-2 py-1 transition-colors ${
                  discountMode === 'pct'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-100'
                }`}
              >
                %
              </button>
              <button
                onClick={() => setDiscountMode('val')}
                className={`px-2 py-1 transition-colors ${
                  discountMode === 'val'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-100'
                }`}
              >
                $
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 pb-2">
            <div className="flex items-center gap-1 flex-1">
              <input
                type="number"
                min="0"
                max="100"
                value={globalDiscount}
                onChange={(e) => handleDiscountPct(e.target.value)}
                placeholder="0"
                className={`w-full text-right px-2 py-1 rounded-lg border text-sm font-bold outline-none focus:ring-2 focus:ring-orange-400 ${
                  discountMode === 'pct'
                    ? 'bg-white border-orange-300 text-orange-700'
                    : 'bg-slate-100 border-slate-200 text-slate-400'
                }`}
              />
              <span
                className={`text-sm font-bold w-4 ${
                  clampedDiscount > 0 ? 'text-orange-600' : 'text-slate-400'
                }`}
              >
                %
              </span>
            </div>
            <span className="text-slate-300 text-xs">=</span>
            <div className="flex items-center gap-1 flex-1">
              <span
                className={`text-sm font-bold w-3 ${
                  clampedDiscount > 0 ? 'text-orange-600' : 'text-slate-400'
                }`}
              >
                $
              </span>
              <input
                type="number"
                min="0"
                value={globalDiscountVal}
                onChange={(e) => handleDiscountVal(e.target.value)}
                placeholder="0"
                className={`w-full text-right px-2 py-1 rounded-lg border text-sm font-bold outline-none focus:ring-2 focus:ring-orange-400 ${
                  discountMode === 'val'
                    ? 'bg-white border-orange-300 text-orange-700'
                    : 'bg-slate-100 border-slate-200 text-slate-400'
                }`}
              />
            </div>
          </div>
          {clampedDiscount > 0 && (
            <div className="px-3 pb-2 flex justify-between text-xs text-orange-600 font-medium">
              <span>Ahorro del cliente:</span>
              <span>- {formatMoney(totals.discountAmount)}</span>
            </div>
          )}
        </div>

        {/* Totales */}
        <div className="space-y-1 text-sm mb-4">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{formatMoney(totals.subtotalBruto)}</span>
          </div>
          {clampedDiscount > 0 && (
            <div className="flex justify-between text-orange-600 font-medium">
              <span>Descuento ({clampedDiscount}%)</span>
              <span>- {formatMoney(totals.discountAmount)}</span>
            </div>
          )}
          <div
            className={`flex justify-between ${
              applyIva && defaultTaxRate > 0
                ? 'text-slate-500'
                : 'text-slate-300'
            }`}
          >
            <span>IVA ({applyIva ? defaultTaxRate : 0}%)</span>
            <span>
              {applyIva && defaultTaxRate > 0
                ? formatMoney(totals.tax)
                : '$ 0'}
            </span>
          </div>
          <div className="flex justify-between font-bold text-xl text-slate-800 mt-2 pt-2 border-t border-slate-200">
            <span>Total</span>
            <span>{formatMoney(totals.total)}</span>
          </div>
        </div>

        <button
          disabled={cart.length === 0}
          onClick={onOpenPayment}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-3 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <CreditCard size={20} /> Pagar
        </button>
      </div>
    </div>
  );
};

export default CartSidebar;