/**
 * InventoryColumns — hook + panel + botón para columnas configurables
 * 
 * USO EN Inventory.tsx:
 *   import { ColumnConfigButton, useInventoryColumns, COLUMN_DEFS } from '../components/InventoryColumns';
 *
 *   const { isVisible } = useInventoryColumns();
 *   // thead: COLUMN_DEFS.filter(c => isVisible(c.key)).map(c => <th>{c.label}</th>)
 *   // tbody: {isVisible('vencimiento') && <td>{p.expiry_date}</td>}
 */

import React, { useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { Settings2, X, Check, RotateCcw, AlertTriangle, Bell } from 'lucide-react';
import toast from 'react-hot-toast';

// ══════════════════════════════════════════════════════════════════════
// TIPO: todas las claves de columna disponibles
// ══════════════════════════════════════════════════════════════════════

export type ColumnKey =
  // ── Básicas ─────────────────────────────────────
  | 'foto'
  | 'nombre'           // siempre visible
  | 'sku'
  | 'referencia'       // código interno / referencia
  | 'categoria'
  | 'marca'
  | 'codigo_barras'
  // ── Financieras ─────────────────────────────────
  | 'precio'
  | 'costo'
  | 'margen'           // calculado: (precio-costo)/precio
  | 'precio_mayorista'
  // ── Logística ───────────────────────────────────
  | 'stock'            // siempre visible
  | 'stock_min'
  | 'proveedor'
  | 'ubicacion'        // pasillo / estante
  | 'estanteria'       // número de estantería específico
  | 'peso'             // peso / volumen
  // ── Trazabilidad ────────────────────────────────
  | 'lote'             // número de lote
  | 'fecha_fabricacion'
  | 'vencimiento'      // fecha de vencimiento
  | 'alerta_vencimiento' // días de alerta antes de vencer
  | 'imei'             // IMEI / número de serie
  // ── Especializadas ───────────────────────────────
  | 'tipo'
  | 'talla_color'
  | 'garantia';

// ── Definición completa ──────────────────────────────────────────────

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  description: string;
  obligatoria?: boolean;
  defaultFor: string[];   // '*' = todos los negocios
  category: 'basico' | 'financiero' | 'logistica' | 'trazabilidad' | 'especializado';
  dbField?: string;       // campo en la tabla products (para la guía de integración)
  width?: string;         // ancho sugerido para la columna
}

export const COLUMN_DEFS: ColumnDef[] = [

  // ── BÁSICAS ─────────────────────────────────────────────────────────
  {
    key: 'foto',         label: 'Foto',
    description:         'Miniatura de imagen del producto',
    defaultFor:          ['*'],
    category:            'basico',
    dbField:             'image_url',
    width:               '60px',
  },
  {
    key: 'nombre',       label: 'Nombre',
    description:         'Nombre del producto (no se puede ocultar)',
    defaultFor:          ['*'],
    category:            'basico',
    obligatoria:         true,
    dbField:             'name',
  },
  {
    key: 'sku',          label: 'SKU',
    description:         'Código interno asignado automáticamente',
    defaultFor:          ['*'],
    category:            'basico',
    dbField:             'sku',
    width:               '120px',
  },
  {
    key: 'referencia',   label: 'Referencia',
    description:         'Código propio del negocio o del fabricante',
    defaultFor:          ['tienda_tecnologia','ferreteria','ropa','optometria','joyeria','bodega','zapateria'],
    category:            'basico',
    dbField:             'extra_data->>reference',
    width:               '120px',
  },
  {
    key: 'categoria',    label: 'Categoría',
    description:         'Categoría o grupo al que pertenece',
    defaultFor:          ['*'],
    category:            'basico',
    dbField:             'category',
  },
  {
    key: 'marca',        label: 'Marca',
    description:         'Marca o fabricante del producto',
    defaultFor:          ['tienda_tecnologia','ropa','farmacia','optometria','joyeria','supermercado'],
    category:            'basico',
    dbField:             'extra_data->>brand',
  },
  {
    key: 'codigo_barras',label: 'Cód. Barras',
    description:         'Código de barras EAN/UPC del producto',
    defaultFor:          ['supermercado','farmacia','bodega'],
    category:            'basico',
    dbField:             'extra_data->>barcode',
    width:               '140px',
  },

  // ── FINANCIERAS ─────────────────────────────────────────────────────
  {
    key: 'precio',       label: 'Precio Venta',
    description:         'Precio de venta al público',
    defaultFor:          ['*'],
    category:            'financiero',
    obligatoria:         false,
    dbField:             'price',
    width:               '110px',
  },
  {
    key: 'costo',        label: 'Costo',
    description:         'Precio de compra o costo de producción',
    defaultFor:          ['*'],
    category:            'financiero',
    dbField:             'cost',
    width:               '110px',
  },
  {
    key: 'margen',       label: 'Margen %',
    description:         'Porcentaje de ganancia calculado automáticamente (precio − costo) / precio',
    defaultFor:          ['general','tienda_tecnologia','ropa','joyeria','bodega','ferreteria'],
    category:            'financiero',
    width:               '90px',
  },
  {
    key: 'precio_mayorista', label: 'P. Mayorista',
    description:         'Precio especial para clientes mayoristas',
    defaultFor:          ['bodega','supermercado'],
    category:            'financiero',
    dbField:             'extra_data->>price_wholesale',
    width:               '120px',
  },

  // ── LOGÍSTICA ────────────────────────────────────────────────────────
  {
    key: 'stock',        label: 'Stock',
    description:         'Unidades disponibles actualmente (no se puede ocultar)',
    defaultFor:          ['*'],
    category:            'logistica',
    obligatoria:         true,
    dbField:             'stock_quantity',
    width:               '80px',
  },
  {
    key: 'stock_min',    label: 'Stock Mín.',
    description:         'Alerta cuando el stock cae por debajo de este número',
    defaultFor:          ['farmacia','supermercado','bodega','veterinaria','optometria','ferreteria'],
    category:            'logistica',
    dbField:             'stock_min',
    width:               '90px',
  },
  {
    key: 'proveedor',    label: 'Proveedor',
    description:         'Proveedor o distribuidor principal',
    defaultFor:          ['*'],
    category:            'logistica',
    dbField:             'supplier_id',
  },
  {
    key: 'ubicacion',    label: 'Ubicación',
    description:         'Pasillo, zona o área en bodega. Ej: "Pasillo 3 - Góndola B"',
    defaultFor:          ['supermercado','bodega','ferreteria'],
    category:            'logistica',
    dbField:             'extra_data->>location',
    width:               '140px',
  },
  {
    key: 'estanteria',   label: 'N° Estantería',
    description:         'Número específico de estante, rack o posición. Ej: "Rack A-04-2"',
    defaultFor:          ['bodega','ferreteria','supermercado'],
    category:            'logistica',
    dbField:             'extra_data->>shelf_number',
    width:               '120px',
  },
  {
    key: 'peso',         label: 'Peso / Vol.',
    description:         'Peso en kg o volumen en litros del producto',
    defaultFor:          ['supermercado','bodega','restaurante'],
    category:            'logistica',
    dbField:             'extra_data->>weight',
    width:               '100px',
  },

  // ── TRAZABILIDAD ─────────────────────────────────────────────────────
  {
    key: 'lote',         label: 'N° Lote',
    description:         'Número de lote del fabricante. Esencial para farmacia y alimentos',
    defaultFor:          ['farmacia','supermercado','veterinaria','restaurante'],
    category:            'trazabilidad',
    dbField:             'extra_data->>lot_number',
    width:               '110px',
  },
  {
    key: 'fecha_fabricacion', label: 'Fabricación',
    description:         'Fecha de fabricación del lote actual',
    defaultFor:          ['farmacia','veterinaria'],
    category:            'trazabilidad',
    dbField:             'extra_data->>manufacture_date',
    width:               '110px',
  },
  {
    key: 'vencimiento',  label: 'Vencimiento',
    description:         'Fecha de vencimiento del lote. Se resalta en rojo cuando está próximo',
    defaultFor:          ['farmacia','supermercado','restaurante','veterinaria'],
    category:            'trazabilidad',
    dbField:             'extra_data->>expiry_date',
    width:               '120px',
  },
  {
    key: 'alerta_vencimiento', label: 'Alerta (días)',
    description:         'Número de días antes del vencimiento para mostrar alerta amarilla. Ej: 30',
    defaultFor:          ['farmacia','supermercado','veterinaria'],
    category:            'trazabilidad',
    dbField:             'extra_data->>expiry_alert_days',
    width:               '110px',
  },
  {
    key: 'imei',         label: 'IMEI / Serie',
    description:         'Número de serie o IMEI. Útil para celulares, electrodomésticos y equipos',
    defaultFor:          ['tienda_tecnologia'],
    category:            'trazabilidad',
    dbField:             'extra_data->>serial',
    width:               '140px',
  },

  // ── ESPECIALIZADAS ───────────────────────────────────────────────────
  {
    key: 'tipo',         label: 'Tipo',
    description:         'STANDARD, SERVICE, WEIGHABLE. Útil para negocios con múltiples tipos',
    defaultFor:          ['general','tienda_tecnologia','bodega'],
    category:            'especializado',
    dbField:             'type',
    width:               '110px',
  },
  {
    key: 'talla_color',  label: 'Talla / Color',
    description:         'Resumen de variantes activas del producto',
    defaultFor:          ['ropa','zapateria'],
    category:            'especializado',
    width:               '120px',
  },
  {
    key: 'garantia',     label: 'Garantía',
    description:         'Meses de garantía. Se imprime en la factura si está configurado',
    defaultFor:          ['tienda_tecnologia','joyeria'],
    category:            'especializado',
    dbField:             'extra_data->>warranty_months',
    width:               '90px',
  },
];

// ── Categorías con colores ────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  basico:        { label: 'Básicas',         color: '#6366f1', icon: '📋' },
  financiero:    { label: 'Financieras',     color: '#10b981', icon: '💰' },
  logistica:     { label: 'Logística',       color: '#f59e0b', icon: '📦' },
  trazabilidad:  { label: 'Trazabilidad',    color: '#ef4444', icon: '🔍' },
  especializado: { label: 'Especializadas',  color: '#8b5cf6', icon: '⚡' },
};

// ── Defaults por tipo de negocio ──────────────────────────────────────

export const DEFAULT_COLUMNS_BY_BUSINESS: Record<string, ColumnKey[]> = {
  general:           ['foto','nombre','sku','categoria','precio','costo','stock','tipo','proveedor'],
  tienda_tecnologia: ['foto','nombre','sku','referencia','marca','categoria','precio','costo','margen','stock','imei','garantia','proveedor'],
  restaurante:       ['foto','nombre','sku','categoria','precio','costo','stock','peso','lote','vencimiento','proveedor'],
  ropa:              ['foto','nombre','referencia','marca','categoria','precio','costo','margen','stock','talla_color','proveedor'],
  zapateria:         ['foto','nombre','referencia','marca','categoria','precio','costo','stock','talla_color','proveedor'],
  ferreteria:        ['foto','nombre','sku','referencia','categoria','precio','costo','stock','stock_min','ubicacion','estanteria','proveedor'],
  farmacia:          ['foto','nombre','sku','referencia','marca','categoria','precio','costo','stock','stock_min','lote','fecha_fabricacion','vencimiento','alerta_vencimiento','proveedor'],
  salon:             ['foto','nombre','sku','categoria','precio','costo','stock','stock_min','proveedor'],
  odontologia:       ['foto','nombre','sku','categoria','precio','costo','stock','stock_min','proveedor'],
  veterinaria:       ['foto','nombre','sku','categoria','precio','costo','stock','stock_min','lote','vencimiento','alerta_vencimiento','proveedor'],
  supermercado:      ['foto','nombre','sku','codigo_barras','marca','categoria','precio','costo','stock','stock_min','ubicacion','estanteria','peso','lote','vencimiento','alerta_vencimiento','proveedor'],
  optometria:        ['foto','nombre','sku','referencia','marca','categoria','precio','costo','stock','stock_min','proveedor'],
  joyeria:           ['foto','nombre','referencia','marca','categoria','precio','costo','margen','stock','garantia','proveedor'],
  bodega:            ['nombre','sku','referencia','codigo_barras','categoria','precio','costo','margen','precio_mayorista','stock','stock_min','ubicacion','estanteria','peso','lote','proveedor'],
  otro:              ['foto','nombre','sku','categoria','precio','costo','stock','proveedor'],
};

// ══════════════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════════════

export function useInventoryColumns() {
  const { company, companyId } = useDatabase();
  const cfg          = (company?.config as any) || {};
  const businessType = cfg.business_type || 'general';

  const storedColumns: ColumnKey[] | null = cfg.inventory_columns || null;
  const defaultCols  = DEFAULT_COLUMNS_BY_BUSINESS[businessType] || DEFAULT_COLUMNS_BY_BUSINESS.general;
  const visibleColumns: ColumnKey[] = storedColumns || defaultCols;

  const isVisible = useCallback((key: ColumnKey): boolean => {
    const def = COLUMN_DEFS.find(c => c.key === key);
    if (def?.obligatoria) return true;
    return visibleColumns.includes(key);
  }, [visibleColumns]);

  const saveColumns = useCallback(async (cols: ColumnKey[]) => {
    if (!companyId) return;
    const obligatorias = COLUMN_DEFS.filter(c => c.obligatoria).map(c => c.key);
    const final        = [...new Set([...obligatorias, ...cols])];
    const newConfig    = { ...(company?.config || {}), inventory_columns: final };
    const { error }    = await supabase.from('companies').update({ config: newConfig }).eq('id', companyId);
    if (error) { toast.error('Error guardando columnas'); return; }
    toast.success(`${final.length} columnas aplicadas`);
    window.location.reload();
  }, [companyId, company]);

  const resetToDefaults = useCallback(async () => {
    if (!companyId) return;
    const newConfig = { ...(company?.config || {}) };
    delete (newConfig as any).inventory_columns;
    const { error } = await supabase.from('companies').update({ config: newConfig }).eq('id', companyId);
    if (!error) { toast.success('Columnas restablecidas al default del negocio'); window.location.reload(); }
  }, [companyId, company]);

  return { visibleColumns, isVisible, saveColumns, resetToDefaults, businessType, defaultCols };
}

// ══════════════════════════════════════════════════════════════════════
// PANEL DE CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════════════

export const ColumnConfigPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { visibleColumns, saveColumns, businessType, defaultCols } = useInventoryColumns();
  const [selected, setSelected] = useState<Set<ColumnKey>>(new Set(visibleColumns));
  const [saving,   setSaving]   = useState(false);

  const toggle = (key: ColumnKey) => {
    const def = COLUMN_DEFS.find(c => c.key === key);
    if (def?.obligatoria) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await saveColumns(Array.from(selected));
    setSaving(false);
  };

  const handleReset = async () => {
    setSelected(new Set(defaultCols));
    setSaving(true);
    await saveColumns(defaultCols);
    setSaving(false);
  };

  const categories = ['basico', 'financiero', 'logistica', 'trazabilidad', 'especializado'] as const;

  const BUSINESS_LABEL: Record<string, string> = {
    general:'Tienda General', tienda_tecnologia:'Tecnología', restaurante:'Restaurante',
    ropa:'Ropa / Moda', zapateria:'Zapatería', ferreteria:'Ferretería',
    farmacia:'Farmacia', salon:'Salón de Belleza', odontologia:'Odontología',
    veterinaria:'Veterinaria', supermercado:'Supermercado', optometria:'Optometría',
    joyeria:'Joyería / Óptica', bodega:'Bodega / Mayorista', otro:'Otro',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-lg text-slate-800">Columnas del Inventario</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              <span className="font-semibold text-indigo-600">{BUSINESS_LABEL[businessType] || businessType}</span>
              {' · '}<span className="font-semibold text-slate-600">{selected.size}</span> activas de {COLUMN_DEFS.length} disponibles
            </p>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
          {categories.map(cat => {
            const cols   = COLUMN_DEFS.filter(c => c.category === cat);
            const catCfg = CATEGORY_LABELS[cat];
            const activeInCat = cols.filter(c => c.obligatoria || selected.has(c.key)).length;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: catCfg.color }} />
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                    {catCfg.icon} {catCfg.label}
                  </p>
                  <span className="ml-auto text-[11px] text-slate-400 font-medium">
                    {activeInCat}/{cols.length} activas
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {cols.map(col => {
                    const isOn      = col.obligatoria || selected.has(col.key);
                    const isDefault = defaultCols.includes(col.key);
                    return (
                      <button key={col.key} type="button"
                        onClick={() => toggle(col.key)}
                        disabled={col.obligatoria}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all group ${
                          isOn
                            ? 'border-transparent shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        } ${col.obligatoria ? 'cursor-default' : 'cursor-pointer'}`}
                        style={isOn ? { background: catCfg.color } : {}}>

                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors ${
                          isOn ? 'bg-white/25' : 'border border-slate-300 bg-white'
                        }`}>
                          {isOn && <Check size={10} className="text-white" strokeWidth={3} />}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate leading-snug ${isOn ? 'text-white' : 'text-slate-700'}`}>
                            {col.label}
                          </p>
                          <p className={`text-[10px] mt-0.5 leading-snug ${isOn ? 'text-white/75' : 'text-slate-400'}`}>
                            {col.description}
                          </p>
                          {/* Badges */}
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {col.obligatoria && (
                              <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${isOn ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                SIEMPRE
                              </span>
                            )}
                            {isDefault && !col.obligatoria && (
                              <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${isOn ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-500'}`}>
                                TU NEGOCIO
                              </span>
                            )}
                            {cat === 'trazabilidad' && (
                              <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${isOn ? 'bg-white/20 text-white' : 'bg-red-50 text-red-400'}`}>
                                TRAZAB.
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Info trazabilidad */}
          {(selected.has('vencimiento') || selected.has('alerta_vencimiento')) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <Bell size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-700">Columna "Alerta (días)" activada</p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  Cuando el vencimiento esté dentro del número de días configurado, la fila se resaltará en amarillo. Cuando ya venció, en rojo.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <button onClick={handleReset} disabled={saving}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm font-medium transition-colors">
            <RotateCcw size={13} /> Defaults del negocio
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Aplicando...' : <><Check size={14} /> Aplicar {selected.size} columnas</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════
// BOTÓN (toolbar del inventario)
// ══════════════════════════════════════════════════════════════════════

export const ColumnConfigButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { visibleColumns } = useInventoryColumns();
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Configurar columnas visibles del inventario"
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium transition-colors shadow-sm">
        <Settings2 size={15} />
        <span className="hidden sm:inline">Columnas</span>
        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-[10px] font-bold min-w-[20px] text-center">
          {visibleColumns.length}
        </span>
      </button>
      {open && <ColumnConfigPanel onClose={() => setOpen(false)} />}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════
// HELPER: color de fila según vencimiento
// Úsalo en ProductRow para resaltar filas críticas
// ══════════════════════════════════════════════════════════════════════

export function getExpiryRowClass(
  expiryDate: string | null | undefined,
  alertDays: number = 30
): string {
  if (!expiryDate) return '';
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diff   = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0)         return 'bg-red-50 border-l-2 border-red-400';   // ya venció
  if (diff <= alertDays) return 'bg-amber-50 border-l-2 border-amber-400'; // próximo a vencer
  return '';
}

// ══════════════════════════════════════════════════════════════════════
// SQL: ALTER TABLE para nuevos campos (copiar a Supabase)
// ══════════════════════════════════════════════════════════════════════
/*
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS extra_data JSONB;

-- Los campos de trazabilidad y logística se guardan en extra_data:
-- extra_data->>'reference'       → Referencia
-- extra_data->>'brand'           → Marca
-- extra_data->>'barcode'         → Código de barras
-- extra_data->>'location'        → Ubicación
-- extra_data->>'shelf_number'    → N° Estantería
-- extra_data->>'weight'          → Peso / volumen
-- extra_data->>'lot_number'      → N° Lote
-- extra_data->>'manufacture_date'→ Fecha fabricación
-- extra_data->>'expiry_date'     → Fecha vencimiento
-- extra_data->>'expiry_alert_days'→ Días alerta vencimiento
-- extra_data->>'serial'          → IMEI / Serie
-- extra_data->>'warranty_months' → Garantía (meses)
-- extra_data->>'price_wholesale' → Precio mayorista
*/
