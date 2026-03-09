import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Edit2, Trash2, X, AlertTriangle, Package,
  Truck, ArrowDownCircle, ArrowUpCircle, BarChart2, RefreshCw,
  ChevronDown, CheckCircle, Clock, Filter, Download
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────

type UnitType = 'unidad' | 'gramo' | 'kilogramo' | 'mililitro' | 'litro' | 'metro' | 'centimetro' | 'caja' | 'rollo' | 'par';

interface Supply {
  id: string;
  company_id: string;
  name: string;
  category: string;
  unit: UnitType;
  stock_quantity: number;
  stock_min: number;
  cost: number;
  supplier: string;
  notes: string;
  is_active: boolean;
  created_at: string;
}

interface SupplyMovement {
  id: string;
  company_id: string;
  supply_id: string;
  supply_name?: string;
  type: 'ENTRADA' | 'CONSUMO' | 'AJUSTE';
  quantity: number;
  cost_per_unit: number;
  reason: string;
  user_name: string;
  created_at: string;
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const UNITS: { value: UnitType; label: string }[] = [
  { value: 'unidad',      label: 'Unidad (und)' },
  { value: 'gramo',       label: 'Gramo (g)' },
  { value: 'kilogramo',   label: 'Kilogramo (kg)' },
  { value: 'mililitro',   label: 'Mililitro (ml)' },
  { value: 'litro',       label: 'Litro (L)' },
  { value: 'metro',       label: 'Metro (m)' },
  { value: 'centimetro',  label: 'Centímetro (cm)' },
  { value: 'caja',        label: 'Caja' },
  { value: 'rollo',       label: 'Rollo' },
  { value: 'par',         label: 'Par' },
];

const UNIT_ABBR: Record<UnitType, string> = {
  unidad: 'und', gramo: 'g', kilogramo: 'kg', mililitro: 'ml',
  litro: 'L', metro: 'm', centimetro: 'cm', caja: 'caja', rollo: 'rollo', par: 'par',
};

const CATEGORIES = [
  '🧴 Limpieza e higiene',
  '🧪 Químicos y reactivos',
  '🩺 Material médico/estético',
  '🍳 Ingredientes y alimentos',
  '🔩 Repuestos y piezas',
  '📦 Empaques y embalaje',
  '🖨️ Papelería y oficina',
  '💡 Electricidad y electrónica',
  '🪡 Textiles y telas',
  '📋 Otro',
];

const TABS = [
  { id: 'catalogo',    label: 'Catálogo',       icon: <Package size={15} /> },
  { id: 'entradas',    label: 'Entradas',        icon: <ArrowDownCircle size={15} /> },
  { id: 'consumos',    label: 'Consumos',        icon: <ArrowUpCircle size={15} /> },
  { id: 'alertas',     label: 'Alertas',         icon: <AlertTriangle size={15} /> },
  { id: 'movimientos', label: 'Movimientos',     icon: <BarChart2 size={15} /> },
] as const;
type TabId = typeof TABS[number]['id'];

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const EMPTY_SUPPLY: Omit<Supply, 'id' | 'company_id' | 'created_at'> = {
  name: '', category: CATEGORIES[0], unit: 'unidad',
  stock_quantity: 0, stock_min: 5, cost: 0,
  supplier: '', notes: '', is_active: true,
};

// ── MODAL INSUMO ──────────────────────────────────────────────────────────────

const SupplyModal: React.FC<{
  initial: Partial<Supply>;
  onClose: () => void;
  onSave: (data: Partial<Supply>) => Promise<void>;
  saving: boolean;
}> = ({ initial, onClose, onSave, saving }) => {
  const [form, setForm] = useState({ ...EMPTY_SUPPLY, ...initial });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg">
            {initial.id ? 'Editar insumo' : 'Nuevo insumo'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Nombre del insumo *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Ej: Guantes de nitrilo talla M" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Categoría</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Unidad de medida</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value as UnitType)} className={inputCls}>
                {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Stock actual</label>
              <input type="number" min="0" value={form.stock_quantity}
                onChange={e => set('stock_quantity', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Stock mínimo (alerta)</label>
              <input type="number" min="0" value={form.stock_min}
                onChange={e => set('stock_min', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Costo unitario ($)</label>
              <input type="number" min="0" value={form.cost}
                onChange={e => set('cost', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Proveedor</label>
              <input value={form.supplier} onChange={e => set('supplier', e.target.value)}
                placeholder="Nombre del proveedor" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notas internas</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                rows={2} placeholder="Observaciones, marca, referencia..."
                className={inputCls + ' resize-none'} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)}
                className="w-4 h-4 accent-blue-600" />
              <label htmlFor="is_active" className="text-sm text-slate-600">Insumo activo</label>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Guardando...</> : 'Guardar insumo'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── MODAL MOVIMIENTO ──────────────────────────────────────────────────────────

const MovementModal: React.FC<{
  supply: Supply;
  type: 'ENTRADA' | 'CONSUMO' | 'AJUSTE';
  onClose: () => void;
  onSave: (qty: number, cost: number, reason: string) => Promise<void>;
  saving: boolean;
}> = ({ supply, type, onClose, onSave, saving }) => {
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(supply.cost);
  const [reason, setReason] = useState('');

  const config = {
    ENTRADA:  { label: 'Registrar entrada',  color: 'bg-green-600 hover:bg-green-700',  icon: <ArrowDownCircle size={16} />, qtyLabel: 'Cantidad que ingresa' },
    CONSUMO:  { label: 'Registrar consumo',  color: 'bg-orange-500 hover:bg-orange-600', icon: <ArrowUpCircle size={16} />,  qtyLabel: 'Cantidad consumida' },
    AJUSTE:   { label: 'Ajustar stock',      color: 'bg-slate-700 hover:bg-slate-800',  icon: <RefreshCw size={16} />,      qtyLabel: 'Nuevo stock total' },
  }[type];

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800">{config.label}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{supply.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 flex justify-between text-sm">
            <span className="text-slate-500">Stock actual</span>
            <span className="font-bold text-slate-800">{supply.stock_quantity} {UNIT_ABBR[supply.unit]}</span>
          </div>
          <div>
            <label className={labelCls}>{config.qtyLabel} *</label>
            <input type="number" min="0.01" step="0.01" value={qty}
              onChange={e => setQty(Number(e.target.value))} className={inputCls} />
          </div>
          {type === 'ENTRADA' && (
            <div>
              <label className={labelCls}>Costo unitario ($)</label>
              <input type="number" min="0" value={cost}
                onChange={e => setCost(Number(e.target.value))} className={inputCls} />
            </div>
          )}
          <div>
            <label className={labelCls}>Motivo / Referencia</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              placeholder={type === 'ENTRADA' ? 'Ej: Compra factura #123' : type === 'CONSUMO' ? 'Ej: Servicio cliente' : 'Ej: Conteo físico'}
              className={inputCls} />
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={() => onSave(qty, cost, reason)} disabled={saving || qty <= 0}
            className={`flex-1 px-4 py-2.5 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 ${config.color}`}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : config.icon}
            {saving ? 'Guardando...' : config.label}
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

const Supplies: React.FC = () => {
  const { company } = useDatabase();
  const companyId = company?.id;
  const brandColor = (company?.config as any)?.primary_color || '#3b82f6';

  const [activeTab, setActiveTab] = useState<TabId>('catalogo');
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [movements, setMovements] = useState<SupplyMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  // Modals
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [editingSupply, setEditingSupply] = useState<Partial<Supply> | null>(null);
  const [movModal, setMovModal] = useState<{ supply: Supply; type: 'ENTRADA' | 'CONSUMO' | 'AJUSTE' } | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────

  const loadSupplies = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('supplies')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) {
      if (error.code === '42P01') {
        toast.error('Tabla "supplies" no existe. Ejecuta el SQL en Supabase primero.');
      } else {
        toast.error('Error al cargar insumos: ' + error.message);
      }
    } else {
      setSupplies(data || []);
    }
    setLoading(false);
  }, [companyId]);

  const loadMovements = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('supply_movements')
      .select('*, supplies(name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(200);
    setMovements((data || []).map((m: any) => ({ ...m, supply_name: m.supplies?.name })));
  }, [companyId]);

  useEffect(() => { loadSupplies(); loadMovements(); }, [loadSupplies, loadMovements]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const handleSaveSupply = async (data: Partial<Supply>) => {
    if (!companyId) return;
    setSaving(true);
    if (data.id) {
      const { error } = await supabase.from('supplies').update({ ...data, company_id: companyId }).eq('id', data.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Insumo actualizado');
    } else {
      const { error } = await supabase.from('supplies').insert({ ...data, company_id: companyId });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Insumo creado');
    }
    setSaving(false);
    setShowSupplyModal(false);
    setEditingSupply(null);
    loadSupplies();
  };

  const handleDelete = async (s: Supply) => {
    if (!confirm(`¿Eliminar "${s.name}"? Se perderá el historial de movimientos.`)) return;
    const { error } = await supabase.from('supplies').delete().eq('id', s.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Insumo eliminado');
    loadSupplies();
  };

  const handleMovement = async (qty: number, cost: number, reason: string) => {
    if (!movModal || !companyId) return;
    setSaving(true);
    const { supply, type } = movModal;

    // Calcular nuevo stock
    let newStock = supply.stock_quantity;
    if (type === 'ENTRADA')  newStock = supply.stock_quantity + qty;
    if (type === 'CONSUMO')  newStock = Math.max(0, supply.stock_quantity - qty);
    if (type === 'AJUSTE')   newStock = qty;

    // Registrar movimiento
    const { error: movError } = await supabase.from('supply_movements').insert({
      company_id: companyId,
      supply_id: supply.id,
      type,
      quantity: qty,
      cost_per_unit: type === 'ENTRADA' ? cost : supply.cost,
      reason: reason || '-',
      user_name: (company as any)?.name || 'Admin',
      stock_before: supply.stock_quantity,
      stock_after: newStock,
    });

    if (movError) { toast.error(movError.message); setSaving(false); return; }

    // Actualizar stock en insumo
    const updateData: any = { stock_quantity: newStock };
    if (type === 'ENTRADA' && cost > 0) updateData.cost = cost;

    const { error: stockError } = await supabase.from('supplies').update(updateData).eq('id', supply.id);
    if (stockError) { toast.error(stockError.message); setSaving(false); return; }

    const labels = { ENTRADA: '✅ Entrada registrada', CONSUMO: '📤 Consumo registrado', AJUSTE: '🔧 Stock ajustado' };
    toast.success(labels[type]);
    setSaving(false);
    setMovModal(null);
    loadSupplies();
    loadMovements();
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = supplies.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.supplier.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || s.category === filterCat;
    return matchSearch && matchCat;
  });

  const alerts = supplies.filter(s => s.is_active && s.stock_quantity <= s.stock_min);
  const totalValue = supplies.reduce((acc, s) => acc + s.stock_quantity * s.cost, 0);
  const categories = [...new Set(supplies.map(s => s.category))].sort();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Insumos</h1>
          <p className="text-slate-500 text-sm">Control de materiales y consumibles de operación</p>
        </div>
        <button onClick={() => { setEditingSupply({}); setShowSupplyModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-lg transition-all hover:opacity-90"
          style={{ background: brandColor }}>
          <Plus size={16} /> Nuevo Insumo
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total insumos',   value: supplies.filter(s => s.is_active).length, icon: <Package size={20} />,      color: 'blue' },
          { label: 'Bajo stock',       value: alerts.length,                             icon: <AlertTriangle size={20} />, color: alerts.length > 0 ? 'red' : 'green' },
          { label: 'Categorías',       value: categories.length,                         icon: <Filter size={20} />,        color: 'purple' },
          { label: 'Valor en insumos', value: fmt(totalValue),                           icon: <BarChart2 size={20} />,     color: 'slate', wide: true },
        ].map(k => (
          <div key={k.label} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 ${k.wide ? 'col-span-2 md:col-span-1' : ''}`}>
            <div className={`p-2.5 rounded-xl bg-${k.color}-50 text-${k.color}-600 flex-shrink-0`}>{k.icon}</div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{k.label}</p>
              <p className="text-xl font-bold text-slate-800">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex gap-1 p-3 border-b border-slate-100 bg-slate-50 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === t.id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.icon} {t.label}
              {t.id === 'alertas' && alerts.length > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{alerts.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">

          {/* ── CATÁLOGO ── */}
          {activeTab === 'catalogo' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar insumo o proveedor..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none bg-white">
                  <option value="">Todas las categorías</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {loading ? (
                <div className="text-center py-12 text-slate-400">Cargando...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Package size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No hay insumos registrados</p>
                  <p className="text-sm mt-1">Crea tu primer insumo con el botón "Nuevo Insumo"</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-4 py-3 rounded-l-xl">Insumo</th>
                        <th className="px-4 py-3">Categoría</th>
                        <th className="px-4 py-3 text-center">Stock</th>
                        <th className="px-4 py-3 text-center">Mínimo</th>
                        <th className="px-4 py-3 text-right">Costo unit.</th>
                        <th className="px-4 py-3">Proveedor</th>
                        <th className="px-4 py-3 rounded-r-xl text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map(s => {
                        const isLow = s.stock_quantity <= s.stock_min;
                        const isEmpty = s.stock_quantity === 0;
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800">{s.name}</div>
                              {s.notes && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{s.notes}</div>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{s.category}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                isEmpty ? 'bg-red-100 text-red-700' :
                                isLow   ? 'bg-amber-100 text-amber-700' :
                                          'bg-green-100 text-green-700'
                              }`}>
                                {isEmpty && <AlertTriangle size={11} />}
                                {s.stock_quantity} {UNIT_ABBR[s.unit]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-slate-500">
                              {s.stock_min} {UNIT_ABBR[s.unit]}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">{fmt(s.cost)}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{s.supplier || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => setMovModal({ supply: s, type: 'ENTRADA' })}
                                  title="Registrar entrada"
                                  className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors">
                                  <ArrowDownCircle size={15} />
                                </button>
                                <button onClick={() => setMovModal({ supply: s, type: 'CONSUMO' })}
                                  title="Registrar consumo"
                                  className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-500 transition-colors">
                                  <ArrowUpCircle size={15} />
                                </button>
                                <button onClick={() => setMovModal({ supply: s, type: 'AJUSTE' })}
                                  title="Ajustar stock"
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                                  <RefreshCw size={14} />
                                </button>
                                <button onClick={() => { setEditingSupply(s); setShowSupplyModal(true); }}
                                  className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors">
                                  <Edit2 size={14} />
                                </button>
                                <button onClick={() => handleDelete(s)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors">
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
          )}

          {/* ── ENTRADAS ── */}
          {activeTab === 'entradas' && (
            <EntradaRapida supplies={supplies.filter(s => s.is_active)} onDone={() => { loadSupplies(); loadMovements(); }} companyId={companyId!} />
          )}

          {/* ── CONSUMOS ── */}
          {activeTab === 'consumos' && (
            <ConsumoRapido supplies={supplies.filter(s => s.is_active)} onDone={() => { loadSupplies(); loadMovements(); }} companyId={companyId!} />
          )}

          {/* ── ALERTAS ── */}
          {activeTab === 'alertas' && (
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
                  <p className="font-semibold text-slate-700">¡Todo en orden!</p>
                  <p className="text-sm text-slate-400 mt-1">Todos los insumos están sobre el stock mínimo</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-500">{alerts.length} insumo{alerts.length > 1 ? 's' : ''} requieren reabastecimiento</p>
                  {alerts.map(s => {
                    const isEmpty = s.stock_quantity === 0;
                    return (
                      <div key={s.id} className={`flex items-center justify-between p-4 rounded-xl border ${
                        isEmpty ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                      }`}>
                        <div className="flex items-center gap-3">
                          <AlertTriangle size={18} className={isEmpty ? 'text-red-500' : 'text-amber-500'} />
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                            <p className="text-xs text-slate-500">
                              {s.category} · Proveedor: {s.supplier || 'No especificado'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <p className={`text-lg font-bold ${isEmpty ? 'text-red-600' : 'text-amber-600'}`}>
                              {s.stock_quantity} <span className="text-xs font-normal">{UNIT_ABBR[s.unit]}</span>
                            </p>
                            <p className="text-xs text-slate-400">Mín: {s.stock_min} {UNIT_ABBR[s.unit]}</p>
                          </div>
                          <button onClick={() => setMovModal({ supply: s, type: 'ENTRADA' })}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 flex items-center gap-1">
                            <ArrowDownCircle size={13} /> Ingresar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── MOVIMIENTOS ── */}
          {activeTab === 'movimientos' && (
            <MovimientosTab movements={movements} supplies={supplies} />
          )}

        </div>
      </div>

      {/* Modals */}
      {showSupplyModal && editingSupply !== null && (
        <SupplyModal
          initial={editingSupply}
          onClose={() => { setShowSupplyModal(false); setEditingSupply(null); }}
          onSave={handleSaveSupply}
          saving={saving}
        />
      )}

      {movModal && (
        <MovementModal
          supply={movModal.supply}
          type={movModal.type}
          onClose={() => setMovModal(null)}
          onSave={handleMovement}
          saving={saving}
        />
      )}
    </div>
  );
};

// ── ENTRADA RÁPIDA ────────────────────────────────────────────────────────────

const EntradaRapida: React.FC<{ supplies: Supply[]; onDone: () => void; companyId: string }> = ({ supplies, onDone, companyId }) => {
  const [selected, setSelected] = useState<Supply | null>(null);
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = supplies.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!selected || qty <= 0) return;
    setSaving(true);
    const newStock = selected.stock_quantity + qty;
    await supabase.from('supply_movements').insert({
      company_id: companyId, supply_id: selected.id,
      type: 'ENTRADA', quantity: qty,
      cost_per_unit: cost || selected.cost,
      reason: reason || 'Entrada manual',
      user_name: 'Admin',
      stock_before: selected.stock_quantity,
      stock_after: newStock,
    });
    const updateData: any = { stock_quantity: newStock };
    if (cost > 0) updateData.cost = cost;
    await supabase.from('supplies').update(updateData).eq('id', selected.id);
    toast.success(`✅ Entrada registrada: +${qty} ${UNIT_ABBR[selected.unit]} de ${selected.name}`);
    setSaving(false);
    setSelected(null); setQty(1); setCost(0); setReason('');
    onDone();
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1';

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-600">Selecciona el insumo</p>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar insumo..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
          {filtered.map(s => (
            <button key={s.id} onClick={() => { setSelected(s); setCost(s.cost); }}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                selected?.id === s.id ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{s.name}</span>
                <span className={`text-xs font-bold ${s.stock_quantity <= s.stock_min ? 'text-red-500' : 'text-green-600'}`}>
                  {s.stock_quantity} {UNIT_ABBR[s.unit]}
                </span>
              </div>
              <span className="text-xs text-slate-400">{s.category}</span>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="font-semibold text-green-800 text-sm">{selected.name}</p>
            <p className="text-xs text-green-600 mt-0.5">Stock actual: {selected.stock_quantity} {UNIT_ABBR[selected.unit]}</p>
          </div>
          <div>
            <label className={labelCls}>Cantidad que ingresa *</label>
            <input type="number" min="0.01" step="0.01" value={qty}
              onChange={e => setQty(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Costo unitario ($)</label>
            <input type="number" min="0" value={cost}
              onChange={e => setCost(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Referencia / Factura proveedor</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Ej: Factura #456 - Distribuidora XYZ" className={inputCls} />
          </div>
          {qty > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 text-sm flex justify-between">
              <span className="text-slate-500">Nuevo stock estimado</span>
              <span className="font-bold text-slate-800">{selected.stock_quantity + qty} {UNIT_ABBR[selected.unit]}</span>
            </div>
          )}
          <button onClick={handleSave} disabled={saving || qty <= 0}
            className="w-full py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownCircle size={15} />}
            {saving ? 'Guardando...' : 'Registrar entrada'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center text-slate-400 text-sm">
          <div className="text-center">
            <ArrowDownCircle size={32} className="mx-auto mb-2 opacity-30" />
            <p>Selecciona un insumo para registrar la entrada</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ── CONSUMO RÁPIDO ────────────────────────────────────────────────────────────

const ConsumoRapido: React.FC<{ supplies: Supply[]; onDone: () => void; companyId: string }> = ({ supplies, onDone, companyId }) => {
  const [items, setItems] = useState<{ supply: Supply; qty: number }[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = supplies.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) && !items.find(i => i.supply.id === s.id)
  );

  const addItem = (s: Supply) => setItems(p => [...p, { supply: s, qty: 1 }]);
  const removeItem = (id: string) => setItems(p => p.filter(i => i.supply.id !== id));
  const updateQty = (id: string, qty: number) => setItems(p => p.map(i => i.supply.id === id ? { ...i, qty } : i));

  const handleSave = async () => {
    if (items.length === 0) return;
    setSaving(true);
    for (const item of items) {
      const newStock = Math.max(0, item.supply.stock_quantity - item.qty);
      await supabase.from('supply_movements').insert({
        company_id: companyId, supply_id: item.supply.id,
        type: 'CONSUMO', quantity: item.qty,
        cost_per_unit: item.supply.cost,
        reason: reason || 'Consumo manual',
        user_name: 'Admin',
        stock_before: item.supply.stock_quantity,
        stock_after: newStock,
      });
      await supabase.from('supplies').update({ stock_quantity: newStock }).eq('id', item.supply.id);
    }
    toast.success(`✅ ${items.length} consumo${items.length > 1 ? 's' : ''} registrado${items.length > 1 ? 's' : ''}`);
    setSaving(false);
    setItems([]); setReason('');
    onDone();
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-600">Insumos a consumir</p>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar insumo..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
          {filtered.map(s => (
            <button key={s.id} onClick={() => addItem(s)}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-sm transition-all">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{s.name}</span>
                <span className={`text-xs font-bold ${s.stock_quantity <= s.stock_min ? 'text-red-500' : 'text-slate-500'}`}>
                  {s.stock_quantity} {UNIT_ABBR[s.unit]}
                </span>
              </div>
              <span className="text-xs text-slate-400">{s.category}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm text-center">
            <div>
              <ArrowUpCircle size={32} className="mx-auto mb-2 opacity-30" />
              <p>Selecciona insumos de la lista</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {items.map(item => (
                <div key={item.supply.id} className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{item.supply.name}</p>
                    <p className="text-xs text-slate-400">Disponible: {item.supply.stock_quantity} {UNIT_ABBR[item.supply.unit]}</p>
                  </div>
                  <input type="number" min="0.01" step="0.01" value={item.qty}
                    onChange={e => updateQty(item.supply.id, Number(e.target.value))}
                    className="w-20 px-2 py-1 border border-orange-300 rounded-lg text-sm text-center focus:outline-none" />
                  <span className="text-xs text-slate-400">{UNIT_ABBR[item.supply.unit]}</span>
                  <button onClick={() => removeItem(item.supply.id)}
                    className="p-1 hover:bg-red-100 rounded-lg text-red-400"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Motivo del consumo</label>
              <input value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Ej: Atención cliente, servicio #123..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <button onClick={handleSave} disabled={saving}
              className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowUpCircle size={15} />}
              {saving ? 'Registrando...' : `Registrar ${items.length} consumo${items.length > 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── MOVIMIENTOS TAB ───────────────────────────────────────────────────────────

const MovimientosTab: React.FC<{ movements: SupplyMovement[]; supplies: Supply[] }> = ({ movements, supplies }) => {
  const [filterType, setFilterType] = useState('');
  const [filterSupply, setFilterSupply] = useState('');
  const [search, setSearch] = useState('');

  const filtered = movements.filter(m => {
    const matchType = !filterType || m.type === filterType;
    const matchSupply = !filterSupply || m.supply_id === filterSupply;
    const matchSearch = !search || (m.supply_name || '').toLowerCase().includes(search.toLowerCase()) ||
      m.reason.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSupply && matchSearch;
  });

  const TYPE_CONFIG = {
    ENTRADA: { label: 'Entrada',  bg: 'bg-green-100',  color: 'text-green-700',  icon: <ArrowDownCircle size={13} /> },
    CONSUMO: { label: 'Consumo',  bg: 'bg-orange-100', color: 'text-orange-700', icon: <ArrowUpCircle size={13} /> },
    AJUSTE:  { label: 'Ajuste',   bg: 'bg-slate-100',  color: 'text-slate-700',  icon: <RefreshCw size={13} /> },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en movimientos..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none bg-white">
          <option value="">Todos los tipos</option>
          <option value="ENTRADA">Entradas</option>
          <option value="CONSUMO">Consumos</option>
          <option value="AJUSTE">Ajustes</option>
        </select>
        <select value={filterSupply} onChange={e => setFilterSupply(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none bg-white max-w-xs">
          <option value="">Todos los insumos</option>
          {supplies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <Clock size={32} className="mx-auto mb-2 opacity-30" />
          <p>Sin movimientos registrados</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 rounded-l-xl">Fecha</th>
                <th className="px-4 py-3">Insumo</th>
                <th className="px-4 py-3 text-center">Tipo</th>
                <th className="px-4 py-3 text-center">Cantidad</th>
                <th className="px-4 py-3 text-right">Costo unit.</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3 rounded-r-xl">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(m => {
                const cfg = TYPE_CONFIG[m.type];
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{m.supply_name || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-slate-700">
                      {m.type === 'CONSUMO' ? '-' : '+'}{m.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {m.cost_per_unit > 0 ? fmt(m.cost_per_unit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{m.reason}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{m.user_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Supplies;