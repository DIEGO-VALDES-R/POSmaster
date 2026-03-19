import { useState, useRef } from 'react';
import { Product } from '../types';
import { toast } from 'react-hot-toast';

// ── Decodifica código de barras EAN-13 pesable (estándar mundial) ──────────
// Formato: 2X XXXXX PPPPP C  donde XX=PLU 5 dígitos, PPPPP=peso en gramos
export function decodeWeighableBarcode(
  barcode: string
): { plu: string; weightKg: number } | null {
  if (barcode.length === 13 && barcode.startsWith('2')) {
    const pluRaw = barcode.substring(1, 6);
    const weightG = parseInt(barcode.substring(7, 12), 10);
    if (!isNaN(weightG))
      return { plu: pluRaw.replace(/^0+/, ''), weightKg: weightG / 1000 };
  }
  return null;
}

// ── Parsea respuesta serial de diferentes marcas de balanzas ──────────────
function parseScaleResponse(raw: string): number | null {
  const cleaned = raw.replace(/\r|\n/g, '').trim();
  const dibal = cleaned.match(/[+-]?\s*(\d+[.,]\d+)\s*kg/i);
  if (dibal) return parseFloat(dibal[1].replace(',', '.'));
  const digi = cleaned.match(/^[+-]?\s*(\d+[.,]\d+)$/);
  if (digi) return parseFloat(digi[1].replace(',', '.'));
  const toledo = cleaned.match(/[SN]\s+[SN]?\s*(\d+[.,]\d+)\s*k?g?/i);
  if (toledo) return parseFloat(toledo[1].replace(',', '.'));
  const generic = cleaned.match(/(\d+[.,]\d+)/);
  if (generic) {
    const v = parseFloat(generic[1].replace(',', '.'));
    if (v > 0 && v < 500) return v;
  }
  return null;
}

export function useScaleIntegration() {
  const [scaleWeight, setScaleWeight] = useState<number | null>(null);
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scalePort, setScalePort] = useState<any>(null);
  const [scaleProtocol, setScaleProtocol] = useState<
    'serial' | 'barcode' | 'manual'
  >('manual');
  const [showScaleConfig, setShowScaleConfig] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [pendingWeighable, setPendingWeighable] = useState<Product | null>(
    null
  );
  const [manualWeight, setManualWeight] = useState('');
  const scaleBufferRef = useRef('');

  const connectScaleSerial = async () => {
    if (!('serial' in navigator)) {
      toast.error(
        'Web Serial no disponible. Usa Chrome o Edge en escritorio.'
      );
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort({ filters: [] });
      await port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });
      setScalePort(port);
      setScaleConnected(true);
      setScaleProtocol('serial');
      toast.success('✅ Balanza conectada por puerto serial');

      const reader = port.readable.getReader();
      const decoder = new TextDecoder();
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            scaleBufferRef.current += decoder.decode(value);
            if (
              scaleBufferRef.current.includes('\n') ||
              scaleBufferRef.current.includes('\r')
            ) {
              const weight = parseScaleResponse(scaleBufferRef.current);
              if (weight !== null && weight > 0) setScaleWeight(weight);
              scaleBufferRef.current = '';
            }
          }
        } catch {
          /* puerto cerrado */
        }
      };
      readLoop();
    } catch (err: any) {
      if (err.name !== 'NotFoundError')
        toast.error('Error al conectar balanza: ' + err.message);
    }
  };

  const disconnectScale = async () => {
    if (scalePort) {
      try {
        await scalePort.close();
      } catch {
        /* ignore */
      }
      setScalePort(null);
    }
    setScaleConnected(false);
    setScaleWeight(null);
    toast('Balanza desconectada');
  };

  const activateBarcodeMode = () => {
    setScaleProtocol('barcode');
    setScaleConnected(true);
    setShowScaleConfig(false);
    toast.success(
      '✅ Modo etiqueta activado. Escanea las etiquetas de tu balanza.'
    );
  };

  const activateManualMode = () => {
    setScaleProtocol('manual');
    setScaleConnected(false);
    setShowScaleConfig(false);
    toast('Modo manual activado');
  };

  const resetScaleWeight = () => setScaleWeight(null);

  return {
    scaleWeight,
    scaleConnected,
    scaleProtocol,
    showScaleConfig,
    setShowScaleConfig,
    showWeightModal,
    setShowWeightModal,
    pendingWeighable,
    setPendingWeighable,
    manualWeight,
    setManualWeight,
    connectScaleSerial,
    disconnectScale,
    activateBarcodeMode,
    activateManualMode,
    resetScaleWeight,
  };
}