import React, { useState } from 'react';
import { Printer, Monitor, Wifi, Cpu } from 'lucide-react';

const Hardware: React.FC = () => {
  type DrawerProtocol = 'escpos-usb' | 'escpos-network' | 'windows-print';
  interface DrawerConfig { protocol: DrawerProtocol; networkIp?: string; networkPort?: number; windowsPrinter?: string; }

  const [drawerConfig, setDrawerConfig] = useState<DrawerConfig>(() => {
    try { return JSON.parse(localStorage.getItem('posmaster_drawer_config') || '{}'); } catch { return {}; }
  });
  const [drawerSaved, setDrawerSaved] = useState(false);

  const saveDrawerConfig = (cfg: DrawerConfig) => {
    try { localStorage.setItem('posmaster_drawer_config', JSON.stringify(cfg)); } catch {}
    setDrawerConfig(cfg);
    setDrawerSaved(true);
    setTimeout(() => setDrawerSaved(false), 2500);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Cpu size={24} className="text-slate-600" /> Hardware
        </h2>
        <p className="text-slate-500 text-sm mt-1">Configura los dispositivos físicos de tu punto de venta</p>
      </div>

      {/* Cajón registradora */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <Printer size={18} className="text-slate-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-800">Cajón registradora</h3>
            <p className="text-xs text-slate-400">Cómo se abre el cajón al completar una venta</p>
          </div>
          {drawerSaved && (
            <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">
              ✓ Guardado
            </span>
          )}
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            {([
              { id: 'escpos-usb',     icon: '🖨️', label: 'USB (ESC/POS via WebUSB)',  desc: 'Impresora térmica por USB directo. Requiere Chrome / Edge.' },
              { id: 'escpos-network', icon: '🌐', label: 'Red / IP (ESC/POS)',          desc: 'Impresora térmica con IP en la red local.' },
              { id: 'windows-print',  icon: '🪟', label: 'Impresora Windows',           desc: 'Impresora instalada en el sistema operativo.' },
            ] as const).map(opt => (
              <label
                key={opt.id}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  (drawerConfig.protocol || 'escpos-usb') === opt.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="drawer-proto"
                  value={opt.id}
                  checked={(drawerConfig.protocol || 'escpos-usb') === opt.id}
                  onChange={() => setDrawerConfig(p => ({ ...p, protocol: opt.id }))}
                  className="mt-1"
                />
                <span className="text-lg mt-0.5">{opt.icon}</span>
                <div>
                  <p className="font-semibold text-sm text-slate-800">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {(drawerConfig.protocol || 'escpos-usb') === 'escpos-network' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">IP de la impresora</label>
                <input
                  value={(drawerConfig as any).networkIp || ''}
                  onChange={e => setDrawerConfig(p => ({ ...p, networkIp: e.target.value }))}
                  placeholder="192.168.1.100"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Puerto</label>
                <input
                  type="number"
                  value={(drawerConfig as any).networkPort || 9100}
                  onChange={e => setDrawerConfig(p => ({ ...p, networkPort: parseInt(e.target.value) || 9100 }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
          )}

          {(drawerConfig.protocol || 'escpos-usb') === 'windows-print' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de impresora (opcional)</label>
              <input
                value={(drawerConfig as any).windowsPrinter || ''}
                onChange={e => setDrawerConfig(p => ({ ...p, windowsPrinter: e.target.value }))}
                placeholder="Ej: POS58 Thermal Printer"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-xs text-slate-400 mt-1">Dejar vacío usa la impresora predeterminada</p>
            </div>
          )}

          <button
            onClick={() => saveDrawerConfig(drawerConfig)}
            className="w-full py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 flex items-center justify-center gap-2 transition-colors"
          >
            <Cpu size={15} /> Guardar configuración del cajón
          </button>
        </div>
      </div>

      {/* Lector de códigos */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <Monitor size={18} className="text-slate-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Lector de códigos de barras</h3>
            <p className="text-xs text-slate-400">Sin configuración — funciona automáticamente como teclado</p>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-800 mb-1">✅ Sin configuración requerida</p>
            <p className="text-xs text-blue-600">
              Conecta el lector por USB. El POS detecta el código escaneado y busca el producto automáticamente.
              Compatible con cualquier lector HID estándar.
            </p>
          </div>
        </div>
      </div>

      {/* Balanza */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
            <Wifi size={18} className="text-slate-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Balanza electrónica</h3>
            <p className="text-xs text-slate-400">Para negocios con productos pesables</p>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">⚖️ Se configura en el POS</p>
            <p className="text-xs text-amber-700">
              Al agregar un producto pesable en el Punto de Venta aparece la opción de conectar la balanza.
              Protocolos: Serial (Web Serial API), código de barras y manual.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hardware;