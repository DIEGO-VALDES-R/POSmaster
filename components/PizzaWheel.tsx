// components/PizzaWheel.tsx
// Componente reutilizable — rueda de pizza con porciones disponibles/vendidas
// Usado en: KitchenDisplay (stock visual), Tables (pedir porciones), POS

import React, { useMemo } from 'react';

interface PizzaWheelProps {
  slices: number;          // total de porciones de la pizza
  soldSlices?: number;     // porciones ya vendidas (grises)
  selectedSlices?: number[]; // índices seleccionados en modo selector
  isHalf?: boolean;        // pizza mitad y mitad
  flavorA?: string;        // nombre sabor A (o único)
  flavorB?: string;        // nombre sabor B (solo si isHalf)
  size?: number;           // diámetro en px (default 160)
  interactive?: boolean;   // permite click en porciones
  onSliceClick?: (index: number) => void;
  showLabels?: boolean;
}

const COLORS = {
  available:  '#f97316',   // naranja — disponible
  sold:       '#e2e8f0',   // gris claro — vendida
  selected:   '#22c55e',   // verde — seleccionada por el usuario
  halfB:      '#dc2626',   // rojo — segunda mitad (combinada)
  stroke:     '#ffffff',
  text:       '#1e293b',
};

export const PizzaWheel: React.FC<PizzaWheelProps> = ({
  slices,
  soldSlices = 0,
  selectedSlices = [],
  isHalf = false,
  flavorA = '',
  flavorB = '',
  size = 160,
  interactive = false,
  onSliceClick,
  showLabels = true,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const r  = (size / 2) * 0.82;
  const innerR = r * 0.22; // radio del "hoyo" central

  // Calcular porciones ya vendidas como set de índices (primeras N)
  const soldSet = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < Math.min(soldSlices, slices); i++) s.add(i);
    return s;
  }, [soldSlices, slices]);

  const selectedSet = useMemo(() => new Set(selectedSlices), [selectedSlices]);

  // Generar path SVG de cada porción
  const slicePaths = useMemo(() => {
    const paths: { d: string; index: number; cx: number; cy: number }[] = [];
    const angleStep = (2 * Math.PI) / slices;
    const startOffset = -Math.PI / 2; // empezar arriba

    for (let i = 0; i < slices; i++) {
      const startAngle = startOffset + i * angleStep;
      const endAngle   = startOffset + (i + 1) * angleStep;
      const midAngle   = (startAngle + endAngle) / 2;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);

      const largeArc = angleStep > Math.PI ? 1 : 0;

      const d = [
        `M ${ix1} ${iy1}`,
        `L ${x1} ${y1}`,
        `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${ix2} ${iy2}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}`,
        'Z',
      ].join(' ');

      // Posición del label de la porción (para íconos pequeños)
      const labelR = r * 0.62;
      const lcx = cx + labelR * Math.cos(midAngle);
      const lcy = cy + labelR * Math.sin(midAngle);

      paths.push({ d, index: i, cx: lcx, cy: lcy });
    }
    return paths;
  }, [slices, cx, cy, r, innerR]);

  const getSliceColor = (index: number): string => {
    if (soldSet.has(index)) return COLORS.sold;
    if (selectedSet.has(index)) return COLORS.selected;
    // Si es pizza mitad/mitad: mitad B en rojo
    if (isHalf && index >= slices / 2) return COLORS.halfB;
    return COLORS.available;
  };

  const availableCount = slices - soldSlices;
  const pricePerSlice  = 0; // se calcula afuera si se necesita

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ cursor: interactive ? 'pointer' : 'default', overflow: 'visible' }}
      >
        {/* Sombra suave */}
        <defs>
          <filter id="pizza-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* Fondo circular (borde de la pizza) */}
        <circle
          cx={cx} cy={cy} r={r + 4}
          fill="#92400e"
          filter="url(#pizza-shadow)"
        />

        {/* Porciones */}
        {slicePaths.map(({ d, index, cx: lcx, cy: lcy }) => {
          const color  = getSliceColor(index);
          const isSold = soldSet.has(index);
          const isSelected = selectedSet.has(index);
          return (
            <g key={index} onClick={() => interactive && !isSold && onSliceClick?.(index)}>
              <path
                d={d}
                fill={color}
                stroke={COLORS.stroke}
                strokeWidth={2}
                opacity={isSold ? 0.45 : 1}
                style={{
                  transition: 'fill 0.2s, opacity 0.2s',
                  cursor: interactive && !isSold ? 'pointer' : 'default',
                }}
              />
              {/* Indicador vendida */}
              {isSold && (
                <text
                  x={lcx} y={lcy}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={size * 0.09}
                  fill="#94a3b8"
                >
                  ✓
                </text>
              )}
              {/* Indicador seleccionada */}
              {isSelected && (
                <text
                  x={lcx} y={lcy}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={size * 0.1}
                  fill="white"
                  fontWeight="bold"
                >
                  ●
                </text>
              )}
            </g>
          );
        })}

        {/* Círculo central (etiqueta de porciones disponibles) */}
        <circle cx={cx} cy={cy} r={innerR * 0.95} fill="white" />
        <text
          x={cx} y={cy - size * 0.02}
          textAnchor="middle" dominantBaseline="central"
          fontSize={size * 0.11}
          fontWeight="bold"
          fill={availableCount > 0 ? COLORS.text : '#94a3b8'}
        >
          {availableCount}
        </text>
        <text
          x={cx} y={cy + size * 0.09}
          textAnchor="middle" dominantBaseline="central"
          fontSize={size * 0.07}
          fill="#64748b"
        >
          disp.
        </text>
      </svg>

      {/* Labels de sabores */}
      {showLabels && (
        <div className="text-center space-y-0.5">
          {isHalf ? (
            <div className="flex items-center gap-2 text-xs font-semibold justify-center">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLORS.available }} />
                {flavorA || 'Mitad 1'}
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLORS.halfB }} />
                {flavorB || 'Mitad 2'}
              </span>
            </div>
          ) : (
            flavorA && (
              <p className="text-xs font-semibold text-slate-700">{flavorA}</p>
            )
          )}
        </div>
      )}
    </div>
  );
};

// ── SELECTOR DE PORCIONES ───────────────────────────────────────────────────
// Modo interactivo: el usuario hace click en las porciones que quiere comprar

interface PizzaSliceSelectorProps {
  pizzaTypeId: string;
  name: string;
  slices: number;
  soldSlices: number;
  pricePerSlice: number;
  priceWhole: number;
  isHalf?: boolean;
  flavorA?: string;
  flavorB?: string;
  onAddToOrder: (qty: number, type: 'whole' | 'slice', selectedIndices: number[]) => void;
}

export const PizzaSliceSelector: React.FC<PizzaSliceSelectorProps> = ({
  name, slices, soldSlices, pricePerSlice, priceWhole,
  isHalf, flavorA, flavorB, onAddToOrder,
}) => {
  const [selectedSlices, setSelectedSlices] = React.useState<number[]>([]);
  const availableCount = slices - soldSlices;

  const soldSet = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < Math.min(soldSlices, slices); i++) s.add(i);
    return s;
  }, [soldSlices, slices]);

  const toggleSlice = (index: number) => {
    if (soldSet.has(index)) return;
    setSelectedSlices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleAddSlices = () => {
    if (selectedSlices.length === 0) return;
    onAddToOrder(selectedSlices.length, 'slice', selectedSlices);
    setSelectedSlices([]);
  };

  const handleAddWhole = () => {
    onAddToOrder(1, 'whole', []);
    setSelectedSlices([]);
  };

  const totalSelected = selectedSlices.length * pricePerSlice;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col items-center gap-3">
      <div className="text-center">
        <p className="font-bold text-slate-800 text-sm">{name}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {availableCount} de {slices} porciones disponibles
        </p>
      </div>

      <PizzaWheel
        slices={slices}
        soldSlices={soldSlices}
        selectedSlices={selectedSlices}
        isHalf={isHalf}
        flavorA={flavorA}
        flavorB={flavorB}
        size={160}
        interactive={true}
        onSliceClick={toggleSlice}
        showLabels={true}
      />

      {/* Botones de acción */}
      <div className="w-full space-y-2">
        {selectedSlices.length > 0 && (
          <button
            onClick={handleAddSlices}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-all"
          >
            + {selectedSlices.length} porción{selectedSlices.length > 1 ? 'es' : ''} —{' '}
            {new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(totalSelected)}
          </button>
        )}
        <button
          onClick={handleAddWhole}
          disabled={availableCount < slices}
          className="w-full py-2 border border-orange-300 text-orange-700 hover:bg-orange-50 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
        >
          Pizza completa —{' '}
          {new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(priceWhole)}
        </button>
      </div>

      {selectedSlices.length === 0 && (
        <p className="text-xs text-slate-400 text-center">
          Toca las porciones naranjas para seleccionarlas
        </p>
      )}
    </div>
  );
};

export default PizzaWheel;
