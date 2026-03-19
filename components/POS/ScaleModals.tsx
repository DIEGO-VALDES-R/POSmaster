import React from 'react';
import { X, Scale, Usb, Barcode, ShoppingCart } from 'lucide-react';
import { Product } from '../../types';

// ── Modal: Ingresar peso manualmente ────────────────────────────────────────
interface WeightModalProps {
  pendingWeighable: Product;
  scaleConnected: boolean;
  scaleWeight: number | null;
  manualWeight: string;
  setManualWeight: (v: string) => void;
  onConfirm: (weightKg: number) => void;
  onClose: () => void;
  formatMoney: (n: number) => string;
}

export const WeightModal: React.FC<WeightModalProps> = ({
  pendingWeighable,
  scaleConnected,
  scaleWeight,
  manualWeight,
  setManualWeight,
  onConfirm,
  onClose,
  formatMoney,
}) => {
  const effectiveWeight =
    scaleConnected && scaleWeight ? scaleWeight : parseFloat(manualWeight) || 0;
  const pricePerKg =
    (pendingWeighable as any).price_per_unit || pendingWeighable.price;

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-green-600" />
            <div>
              <h3 className="font-bold text-slate-800">
                {pendingWeighable.name}
              </h3>
              <p className="text-xs text-slate-500">
                {formatMoney(pricePerKg)} / kg
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">
              {scaleConnected
                ? '📡 Peso leído de balanza'
                : '⌨️ Ingresa el peso manualmente'}
            </label>
            {scaleConnected && scaleWeight ? (
              <div className="bg-green-50 border-2 border-green-300 rounded-xl px-4 py-3 text-center">
                <p className="text-3xl font-black text-green-700">
                  {scaleWeight.toFixed(3)} kg
                </p>
                <p className="text-xs text-green-500 mt-0.5">
                  Peso estable leído de la balanza
                </p>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  autoFocus
                  value={manualWeight}
                  onChange={(e) => setManualWeight(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && parseFloat(manualWeight) > 0) {
                      onConfirm(parseFloat(manualWeight));
                    }
                  }}
                  placeholder="0.000"
                  className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-2xl font-black text-center text-slate-800 focus:outline-none focus:border-green-400 focus:ring-0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                  kg
                </span>
              </div>
            )}
          </div>

          {effectiveWeight > 0 && (
            <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between">
              <div className="text-sm text-slate-600">
                <span className="font-mono">{effectiveWeight.toFixed(3)} kg</span>
                <span className="mx-2 text-slate-400">×</span>
                <span>{formatMoney(pricePerKg)}/kg</span>
              </div>
              <span className="text-xl font-black text-blue-700">
                {formatMoney(Math.round(effectiveWeight * pricePerKg))}
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (!effectiveWeight || effectiveWeight <= 0) return;
                onConfirm(effectiveWeight);
              }}
              className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <ShoppingCart size={16} /> Agregar al carrito
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Modal: Configurar balanza ────────────────────────────────────────────────
interface ScaleConfigModalProps {
  onConnectSerial: () => void;
  onActivateBarcode: () => void;
  onActivateManual: () => void;
  onClose: () => void;
}

export const ScaleConfigModal: React.FC<ScaleConfigModalProps> = ({
  onConnectSerial,
  onActivateBarcode,
  onActivateManual,
  onClose,
}) => (
  <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2">
          <Scale size={18} className="text-blue-600" />
          <h3 className="font-bold text-slate-800">Configurar Balanza</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-100 rounded-lg"
        >
          <X size={16} />
        </button>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-500">
          Selecciona cómo está conectada tu balanza al computador:
        </p>

        <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50">
          <div className="flex items-center gap-2 mb-2">
            <Usb size={16} className="text-blue-600" />
            <p className="font-bold text-blue-800">Puerto Serial / USB COM</p>
            <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
              Recomendado
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Compatible con DIBAL, DIGI, Toledo, Mettler y cualquier balanza que
            use RS-232 o USB serial. Requiere Chrome o Edge.
          </p>
          <button
            onClick={onConnectSerial}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700"
          >
            Conectar por serial
          </button>
        </div>

        <div className="border-2 border-emerald-200 rounded-xl p-4 bg-emerald-50">
          <div className="flex items-center gap-2 mb-2">
            <Barcode size={16} className="text-emerald-600" />
            <p className="font-bold text-emerald-800">
              Balanza con impresora de etiquetas
            </p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            La balanza imprime etiquetas con código EAN-13. El escáner lee la
            etiqueta y el POS detecta automáticamente el producto y el peso.
          </p>
          <button
            onClick={onActivateBarcode}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700"
          >
            Activar modo etiqueta
          </button>
        </div>

        <div className="border-2 border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scale size={16} className="text-slate-600" />
            <p className="font-bold text-slate-700">
              Sin balanza / Ingreso manual
            </p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            El cajero escribe el código PLU del producto y luego ingresa el
            peso a mano.
          </p>
          <button
            onClick={onActivateManual}
            className="w-full py-2.5 bg-slate-600 text-white rounded-xl font-bold text-sm hover:bg-slate-700"
          >
            Usar modo manual
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-700 font-medium">
            💡 Tip: Para el modo serial necesitas Chrome o Edge en
            Windows/Mac/Linux. Activa{' '}
            <code>
              chrome://flags/#enable-experimental-web-platform-features
            </code>{' '}
            si el puerto no aparece.
          </p>
        </div>
      </div>
    </div>
  </div>
);