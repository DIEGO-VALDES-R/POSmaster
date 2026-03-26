// components/PizzaTab.tsx
// Pestaña "🍕 Pizzas" para insertar dentro de KitchenDisplay
// Permite: crear tipos de pizza, abrir pizzas al mostrador, ver stock visual en tiempo real

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Pizza, Trash2, RefreshCw, Package } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { PizzaWheel } from './PizzaWheel';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ── TYPES ──────────────────────────────────────────────────
interface PizzaType {
  id: string;
  name: string;
  size_label: string;
  slices: number;
  price: number;
  is_combined: boolean;
  flavor_a?: string;
  flavor_b?: string;
  description?: string;
  is_active: boolean;
}

interface PizzaStockRow {
  id: string;
  pizza_type_id: string;
  slices_total: number;
  slices_sold: number;
  slices_wasted: number;
  status: 'OPEN' | 'CLOSED' | 'WASTED';
  opened_at: string;
}

interface PizzaStockSummary {
  pizza_type_id: string;
  name: string;
  size_label: string;
  slices: number;
  price: number;
  is_combined: boolean;
  flavor_a?: string;
  flavor_b?: string;
  pizzas_open: number;
  slices_available: number;
  slices_sold_today: number;
  price_per_slice: number;
}

// ── EMPTY FORMS ─────────────────────────────────────────────
const EMPTY_TYPE = {
  name: '',
  size_label: 'Grande',
  slices: 8,
  price: 0,
  is_combined: false,
  flavor_a: '',
  flavor_b: '',
  description: '',
};

const SIZE_OPTIONS = ['Personal (4 porciones)', 'Mediana (6 porciones)', 'Grande (8 porciones)', 'Familiar (12 porciones)'];
const SIZE_SLICES: Record<string, number> = {
  'Personal (4 porciones)': 4,
  'Mediana (6 porciones)': 6,
  'Grande (8 porciones)': 8,
  'Familiar (12 porciones)': 12,
};

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400';
const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';
const btnPrimary = 'px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold text-sm transition-all';

interface Props {
  companyId: string;
  branchId?: string | null;
}

export const PizzaTab: React.FC<Props> = ({ companyId, branchId }) => {
  const [pizzaTypes,  setPizzaTypes]  = useState<PizzaType[]>([]);
  const [stockSummary, setStockSummary] = useState<PizzaStockSummary[]>([]);
  const [openRows,    setOpenRows]    = useState<PizzaStockRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);

  // Modals
  const [showTypeModal,  setShowTypeModal]  = useState(false);
  const [showOpenModal,  setShowOpenModal]  = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const [editingType,    setEditingType]    = useState<PizzaType | null>(null);
  const [typeForm,       setTypeForm]       = useState({ ...EMPTY_TYPE });
  const [selectedSizeLabel, setSelectedSizeLabel] = useState('Grande (8 porciones)');

  // Para abrir pizza
  const [openTarget,     setOpenTarget]     = useState<PizzaType | null>(null);
  const [openQty,        setOpenQty]        = useState(1);

  // Para cerrar/mermar pizza
  const [closeTarget,    setCloseTarget]    = useState<PizzaStockRow | null>(null);
  const [closeMode,      setCloseMode]      = useState<'CLOSED' | 'WASTED'>('CLOSED');
  const [wasteQty,       setWasteQty]       = useState(0);

  // ── LOAD ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [{ data: types }, { data: summary }, { data: open }] = await Promise.all([
        supabase.from('pizza_types').select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
        supabase.from('pizza_stock_summary').select('*').eq('company_id', companyId),
        supabase.from('pizza_stock').select('*').eq('company_id', companyId).eq('status', 'OPEN').order('opened_at'),
      ]);
      setPizzaTypes(types || []);
      setStockSummary(summary || []);
      setOpenRows(open || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase.channel('pizza-stock-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pizza_stock', filter: `company_id=eq.${companyId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, load]);

  // ── SAVE TYPE ──────────────────────────────────────────────
  const handleSaveType = async () => {
    if (!typeForm.name.trim()) { toast.error('Escribe el nombre de la pizza'); return; }
    if (typeForm.price <= 0)   { toast.error('El precio debe ser mayor a 0'); return; }
    if (typeForm.is_combined && (!typeForm.flavor_a || !typeForm.flavor_b)) {
      toast.error('Ingresa los nombres de ambas mitades'); return;
    }
    setSaving(true);
    const payload = {
      company_id:  companyId,
      branch_id:   branchId || null,
      name:        typeForm.name.trim(),
      size_label:  typeForm.size_label,
      slices:      typeForm.slices,
      price:       typeForm.price,
      is_combined: typeForm.is_combined,
      flavor_a:    typeForm.flavor_a?.trim() || null,
      flavor_b:    typeForm.is_combined ? typeForm.flavor_b?.trim() || null : null,
      description: typeForm.description?.trim() || null,
    };
    const { error } = editingType
      ? await supabase.from('pizza_types').update(payload).eq('id', editingType.id)
      : await supabase.from('pizza_types').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingType ? 'Pizza actualizada ✅' : 'Tipo de pizza creado ✅');
    setShowTypeModal(false);
    setEditingType(null);
    setTypeForm({ ...EMPTY_TYPE });
    load();
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('¿Desactivar este tipo de pizza?')) return;
    await supabase.from('pizza_types').update({ is_active: false }).eq('id', id);
    toast.success('Tipo eliminado');
    load();
  };

  // ── ABRIR PIZZA AL MOSTRADOR ────────────────────────────────
  const handleOpenPizza = async () => {
    if (!openTarget) return;
    setSaving(true);
    const rows = Array.from({ length: openQty }, () => ({
      company_id:    companyId,
      branch_id:     branchId || null,
      pizza_type_id: openTarget.id,
      slices_total:  openTarget.slices,
      slices_sold:   0,
      slices_wasted: 0,
      status:        'OPEN',
      opened_at:     new Date().toISOString(),
    }));
    const { error } = await supabase.from('pizza_stock').insert(rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`🍕 ${openQty} pizza${openQty > 1 ? 's' : ''} de ${openTarget.name} abierta${openQty > 1 ? 's' : ''}`);
    setShowOpenModal(false);
    setOpenTarget(null);
    setOpenQty(1);
    load();
  };

  // ── CERRAR / MERMAR PIZZA ───────────────────────────────────
  const handleClosePizza = async () => {
    if (!closeTarget) return;
    setSaving(true);
    const remaining = closeTarget.slices_total - closeTarget.slices_sold;
    const { error } = await supabase.from('pizza_stock').update({
      status:        closeMode,
      slices_wasted: closeMode === 'WASTED' ? wasteQty : remaining,
      closed_at:     new Date().toISOString(),
    }).eq('id', closeTarget.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(closeMode === 'WASTED' ? 'Merma registrada' : 'Pizza cerrada');
    setShowCloseModal(false);
    setCloseTarget(null);
    load();
  };

  // ── HELPERS ─────────────────────────────────────────────────
  const getSummary = (typeId: string) =>
    stockSummary.find(s => s.pizza_type_id === typeId);

  const getOpenRowsForType = (typeId: string) =>
    openRows.filter(r => r.pizza_type_id === typeId);

  // ── RENDER ──────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-48 text-slate-400">
      <RefreshCw size={24} className="animate-spin mr-2" /> Cargando pizzas...
    </div>
  );

  return (
    <div className="space-y-6 p-1">

      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            🍕 Gestión de Pizzas
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Crea tipos de pizza y controla el stock de porciones en tiempo real
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50">
            <RefreshCw size={14} className="text-slate-500" />
          </button>
          <button
            onClick={() => { setEditingType(null); setTypeForm({ ...EMPTY_TYPE }); setSelectedSizeLabel('Grande (8 porciones)'); setShowTypeModal(true); }}
            className={btnPrimary + ' flex items-center gap-2'}
          >
            <Plus size={15} /> Nuevo tipo de pizza
          </button>
        </div>
      </div>

      {/* STOCK VISUAL — pizzas abiertas */}
      {pizzaTypes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          <div className="text-5xl mb-3">🍕</div>
          <p className="font-semibold">No hay tipos de pizza configurados</p>
          <p className="text-sm mt-1">Crea el primer tipo para empezar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pizzaTypes.map(pt => {
            const summary = getSummary(pt.id);
            const openRowsHere = getOpenRowsForType(pt.id);
            const slicesAvailable = summary?.slices_available ?? 0;
            const pizzasOpen = summary?.pizzas_open ?? 0;
            const pricePerSlice = pt.price / pt.slices;
            // Para la rueda: primera pizza abierta
            const firstOpen = openRowsHere[0];
            const soldInFirst = firstOpen?.slices_sold ?? 0;

            return (
              <div key={pt.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col items-center gap-3">
                {/* Nombre y acciones */}
                <div className="w-full flex items-start justify-between">
                  <div>
                    <p className="font-bold text-slate-800 text-sm leading-tight">{pt.name}</p>
                    <p className="text-xs text-slate-400">{pt.size_label} · {pt.slices} porciones</p>
                    {pt.is_combined && (
                      <p className="text-[10px] mt-0.5 text-orange-600 font-semibold">
                        🔀 {pt.flavor_a} / {pt.flavor_b}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingType(pt); setTypeForm({ name: pt.name, size_label: pt.size_label, slices: pt.slices, price: pt.price, is_combined: pt.is_combined, flavor_a: pt.flavor_a || '', flavor_b: pt.flavor_b || '', description: pt.description || '' }); setShowTypeModal(true); }}
                      className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600"
                    >✏️</button>
                    <button onClick={() => handleDeleteType(pt.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Rueda de pizza */}
                <PizzaWheel
                  slices={pt.slices}
                  soldSlices={soldInFirst}
                  isHalf={pt.is_combined}
                  flavorA={pt.is_combined ? pt.flavor_a : pt.name}
                  flavorB={pt.flavor_b}
                  size={140}
                  showLabels={false}
                />

                {/* Stats */}
                <div className="w-full grid grid-cols-3 gap-1 text-center">
                  <div className="bg-orange-50 rounded-lg p-1.5">
                    <p className="text-xs text-orange-700 font-black">{pizzasOpen}</p>
                    <p className="text-[10px] text-orange-500">Abiertas</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-1.5">
                    <p className="text-xs text-green-700 font-black">{slicesAvailable}</p>
                    <p className="text-[10px] text-green-500">Disponibles</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-1.5">
                    <p className="text-xs text-slate-700 font-black">{fmt(pricePerSlice)}</p>
                    <p className="text-[10px] text-slate-500">/ porción</p>
                  </div>
                </div>

                {/* Precio total */}
                <div className="w-full flex justify-between items-center text-sm border-t border-slate-100 pt-2">
                  <span className="text-slate-500 text-xs">Pizza completa</span>
                  <span className="font-black text-slate-800">{fmt(pt.price)}</span>
                </div>

                {/* Pizzas abiertas individuales */}
                {openRowsHere.length > 0 && (
                  <div className="w-full space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Pizzas en mostrador</p>
                    {openRowsHere.map((row, idx) => (
                      <div key={row.id} className="flex items-center justify-between bg-orange-50 rounded-lg px-2 py-1">
                        <span className="text-xs text-orange-700 font-semibold">
                          Pizza #{idx + 1} · {row.slices_total - row.slices_sold} porciones
                        </span>
                        <button
                          onClick={() => { setCloseTarget(row); setWasteQty(row.slices_total - row.slices_sold); setShowCloseModal(true); }}
                          className="text-[10px] text-slate-400 hover:text-red-500 px-1"
                          title="Cerrar pizza"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botón abrir pizza */}
                <button
                  onClick={() => { setOpenTarget(pt); setOpenQty(1); setShowOpenModal(true); }}
                  className="w-full py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1"
                >
                  <Plus size={13} /> Abrir pizza al mostrador
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ════ MODAL: Crear / Editar tipo de pizza ════ */}
      {showTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">{editingType ? 'Editar pizza' : 'Nueva pizza'}</h3>
              <button onClick={() => { setShowTypeModal(false); setEditingType(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">

              {/* Nombre */}
              <div>
                <label className={labelCls}>Nombre de la pizza *</label>
                <input
                  className={inputCls}
                  placeholder="Ej: Pepperoni, Hawaiana, 4 Quesos..."
                  value={typeForm.name}
                  onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Tamaño */}
              <div>
                <label className={labelCls}>Tamaño y porciones *</label>
                <select
                  className={inputCls}
                  value={selectedSizeLabel}
                  onChange={e => {
                    const label = e.target.value;
                    setSelectedSizeLabel(label);
                    const sLabel = label.split(' (')[0];
                    const slices = SIZE_SLICES[label] || 8;
                    setTypeForm(f => ({ ...f, size_label: sLabel, slices }));
                  }}
                >
                  {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Precio */}
              <div>
                <label className={labelCls}>Precio pizza completa (COP) *</label>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="Ej: 60000"
                  value={typeForm.price || ''}
                  onChange={e => setTypeForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                />
                {typeForm.price > 0 && typeForm.slices > 0 && (
                  <p className="text-xs text-orange-600 font-semibold mt-1">
                    Precio por porción: {fmt(typeForm.price / typeForm.slices)}
                  </p>
                )}
              </div>

              {/* ¿Pizza combinada? */}
              <div>
                <label className={labelCls}>Tipo de pizza</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTypeForm(f => ({ ...f, is_combined: false }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${!typeForm.is_combined ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500'}`}
                  >
                    🍕 Un solo sabor
                  </button>
                  <button
                    onClick={() => setTypeForm(f => ({ ...f, is_combined: true }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${typeForm.is_combined ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-500'}`}
                  >
                    🔀 Mitad y mitad
                  </button>
                </div>
              </div>

              {/* Sabores */}
              {typeForm.is_combined ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Sabor mitad 1 *</label>
                    <input
                      className={inputCls}
                      placeholder="Ej: Pepperoni"
                      value={typeForm.flavor_a}
                      onChange={e => setTypeForm(f => ({ ...f, flavor_a: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Sabor mitad 2 *</label>
                    <input
                      className={inputCls}
                      placeholder="Ej: Mariscos"
                      value={typeForm.flavor_b}
                      onChange={e => setTypeForm(f => ({ ...f, flavor_b: e.target.value }))}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>Sabor / nombre del relleno</label>
                  <input
                    className={inputCls}
                    placeholder="Ej: Pepperoni, Hawaiana..."
                    value={typeForm.flavor_a}
                    onChange={e => setTypeForm(f => ({ ...f, flavor_a: e.target.value }))}
                  />
                </div>
              )}

              {/* Preview de la rueda */}
              {typeForm.slices > 0 && (
                <div className="flex flex-col items-center gap-2 py-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400 font-semibold uppercase">Vista previa</p>
                  <PizzaWheel
                    slices={typeForm.slices}
                    soldSlices={0}
                    isHalf={typeForm.is_combined}
                    flavorA={typeForm.flavor_a || typeForm.name || 'Sabor A'}
                    flavorB={typeForm.flavor_b || 'Sabor B'}
                    size={120}
                    showLabels={true}
                  />
                </div>
              )}

              {/* Descripción */}
              <div>
                <label className={labelCls}>Descripción (opcional)</label>
                <input
                  className={inputCls}
                  placeholder="Ingredientes, observaciones..."
                  value={typeForm.description}
                  onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowTypeModal(false); setEditingType(null); }} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 text-sm">
                  Cancelar
                </button>
                <button onClick={handleSaveType} disabled={saving} className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                  <Check size={14} /> {saving ? 'Guardando...' : editingType ? 'Guardar cambios' : 'Crear pizza'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: Abrir pizza al mostrador ════ */}
      {showOpenModal && openTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">Abrir pizza al mostrador</h3>
              <button onClick={() => setShowOpenModal(false)}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <p className="font-black text-slate-800">{openTarget.name}</p>
                <p className="text-sm text-orange-600">{openTarget.size_label} · {openTarget.slices} porciones · {fmt(openTarget.price)}</p>
              </div>
              <div>
                <label className={labelCls}>¿Cuántas pizzas vas a abrir?</label>
                <div className="flex items-center gap-3 justify-center">
                  <button onClick={() => setOpenQty(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xl">−</button>
                  <span className="text-3xl font-black text-slate-800 w-10 text-center">{openQty}</span>
                  <button onClick={() => setOpenQty(q => q + 1)} className="w-10 h-10 rounded-xl bg-orange-100 hover:bg-orange-200 font-bold text-xl text-orange-700">+</button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowOpenModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 text-sm">Cancelar</button>
                <button onClick={handleOpenPizza} disabled={saving} className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                  {saving ? 'Abriendo...' : `Abrir ${openQty} pizza${openQty > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: Cerrar / Mermar pizza ════ */}
      {showCloseModal && closeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">Cerrar pizza</h3>
              <button onClick={() => setShowCloseModal(false)}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600 text-center">
                {closeTarget.slices_total - closeTarget.slices_sold} porciones disponibles
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCloseMode('CLOSED')}
                  className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${closeMode === 'CLOSED' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-200 text-slate-600'}`}
                >
                  📦 Cerrar día
                </button>
                <button
                  onClick={() => setCloseMode('WASTED')}
                  className={`py-3 rounded-xl text-sm font-bold border-2 transition-all ${closeMode === 'WASTED' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600'}`}
                >
                  🗑️ Registrar merma
                </button>
              </div>
              {closeMode === 'WASTED' && (
                <div>
                  <label className={labelCls}>Porciones desperdiciadas</label>
                  <input type="number" className={inputCls} value={wasteQty} min={0} max={closeTarget.slices_total - closeTarget.slices_sold}
                    onChange={e => setWasteQty(parseInt(e.target.value) || 0)} />
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowCloseModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 text-sm">Cancelar</button>
                <button onClick={handleClosePizza} disabled={saving} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PizzaTab;
