import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Edit2, Trash2, RefreshCw, Search, DollarSign,
  CheckCircle, Clock, AlertTriangle, Package, BarChart2,
  ShoppingBag, BookOpen, Truck, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type PedidoStatus = 'PENDING' | 'PRODUCING' | 'READY' | 'DISPATCHED' | 'CANCELLED';

interface BakeryProduct {
  id: string;
  company_id: string;
  name: string;
  category: string;     // pan, pasteleria, bebidas, otro
  unit: string;         // und, docena, kg
  sale_price: number;
  cost_price: number;
  daily_target: number; // meta de producción diaria
  is_active: boolean;
}

interface ProductionEntry {
  id: string;
  company_id: string;
  product_id: string;
  product_name: string;
  date: string;
  shift: 'MADRUGADA' | 'MAÑANA' | 'TARDE';
  quantity_planned: number;
  quantity_produced: number;
  quantity_sold: number;
  waste_quantity: number;
  waste_reason?: string;
  notes?: string;
  created_at: string;
}

interface Pedido {
  id: string;
  company_id: string;
  pedido_number: string;
  client_name: string;
  client_phone?: string;
  delivery_date: string;  // fecha de entrega
  delivery_time?: string; // hora de entrega
  status: PedidoStatus;
  items: PedidoItem[];
  total_amount: number;
  advance_paid: number;
  notes?: string;
  created_at: string;
}

interface PedidoItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface RecipeIngredient {
  ingredient: string;
  quantity: number;
  unit: string;
  unit_cost: number;
}

interface Recipe {
  id: string;
  company_id: string;
  product_id: string;
  product_name: string;
  batch_size: number;    // produce X unidades
  batch_unit: string;
  ingredients: RecipeIngredient[];
  preparation_notes?: string;
}

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const PEDIDO_STATUS: Record<PedidoStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING:    { label: 'Pendiente',   cls: 'bg-slate-100 text-slate-600',   icon: <Clock size={11} /> },
  PRODUCING:  { label: 'Produciendo', cls: 'bg-amber-100 text-amber-700',   icon: <Clock size={11} /> },
  READY:      { label: 'Listo',       cls: 'bg-blue-100 text-blue-700',     icon: <CheckCircle size={11} /> },
  DISPATCHED: { label: 'Despachado',  cls: 'bg-emerald-100 text-emerald-700', icon: <Truck size={11} /> },
  CANCELLED:  { label: 'Cancelado',   cls: 'bg-red-100 text-red-700',       icon: <X size={11} /> },
};

const WASTE_REASONS = ['Quemado','Mal cocido','Vencido','Accidente','Exceso de producción','Otro'];
const SHIFTS = ['MADRUGADA','MAÑANA','TARDE'] as const;
const CATEGORIES = ['pan','pastelería','bebidas','tortas','empanadas','otro'];

const emptyProduct = { name: '', category: 'pan', unit: 'und', sale_price: '', cost_price: '', daily_target: '100' };
const emptyPedido  = { client_name: '', client_phone: '', delivery_date: '', delivery_time: '', notes: '', advance_paid: '0' };

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}
function todayStr() { return new Date().toISOString().split('T')[0]; }

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const Panaderia: React.FC = () => {
  const { companyId } = useDatabase();
  const { formatMoney } = useCurrency();

  const [tab, setTab]           = useState<'production' | 'orders' | 'recipes' | 'products' | 'stats'>('production');
  const [products, setProducts] = useState<BakeryProduct[]>([]);
  const [entries, setEntries]   = useState<ProductionEntry[]>([]);
  const [pedidos, setPedidos]   = useState<Pedido[]>([]);
  const [recipes, setRecipes]   = useState<Recipe[]>([]);
  const [loading, setLoading]   = useState(true);
  const [productionDate, setProductionDate] = useState(todayStr());
  const [activeShift, setActiveShift] = useState<typeof SHIFTS[number]>('MADRUGADA');

  // Production entry state (inline editing)
  const [entryEdits, setEntryEdits] = useState<Record<string, { produced: number; sold: number; waste: number; waste_reason: string; notes: string }>>({});

  // Modals
  const [showProduct, setShowProduct]   = useState(false);
  const [editProduct, setEditProduct]   = useState<BakeryProduct | null>(null);
  const [productForm, setProductForm]   = useState(emptyProduct);

  const [showPedido, setShowPedido]     = useState(false);
  const [editPedido, setEditPedido]     = useState<Pedido | null>(null);
  const [pedidoForm, setPedidoForm]     = useState(emptyPedido);
  const [pedidoItems, setPedidoItems]   = useState<PedidoItem[]>([]);

  const [showRecipe, setShowRecipe]     = useState(false);
  const [editRecipe, setEditRecipe]     = useState<Recipe | null>(null);
  const [recipeProductId, setRecipeProductId] = useState('');
  const [recipeBatch, setRecipeBatch]   = useState('100');
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([{ ingredient: '', quantity: 0, unit: 'kg', unit_cost: 0 }]);
  const [recipeNotes, setRecipeNotes]   = useState('');

  const [saving, setSaving]             = useState(false);
  const [expandedPedido, setExpandedPedido] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: p }, { data: e }, { data: pd }, { data: r }] = await Promise.all([
      supabase.from('bakery_products').select('*').eq('company_id', companyId).eq('is_active', true).order('name'),
      supabase.from('bakery_production').select('*').eq('company_id', companyId)
        .eq('date', productionDate).eq('shift', activeShift).order('product_name'),
      supabase.from('bakery_pedidos').select('*').eq('company_id', companyId)
        .not('status', 'in', '(DISPATCHED,CANCELLED)')
        .order('delivery_date').order('delivery_time'),
      supabase.from('bakery_recipes').select('*').eq('company_id', companyId),
    ]);
    setProducts(p || []);
    setEntries(e || []);
    setPedidos(pd || []);
    setRecipes(r || []);
    setLoading(false);
  }, [companyId, productionDate, activeShift]);

  useEffect(() => { load(); }, [load]);

  // ── Production entry ─────────────────────────────────────
  const getOrCreateEntry = async (product: BakeryProduct) => {
    const existing = entries.find(e => e.product_id === product.id);
    if (existing) return existing;
    const { data, error } = await supabase.from('bakery_production').insert({
      company_id: companyId,
      product_id: product.id,
      product_name: product.name,
      date: productionDate,
      shift: activeShift,
      quantity_planned: product.daily_target,
      quantity_produced: 0,
      quantity_sold: 0,
      waste_quantity: 0,
    }).select().single();
    if (error) { toast.error(error.message); return null; }
    await load();
    return data;
  };

  const saveEntry = async (entry: ProductionEntry, vals: typeof entryEdits[string]) => {
    const available = vals.produced - vals.waste;
    const { error } = await supabase.from('bakery_production').update({
      quantity_produced: vals.produced,
      quantity_sold:     vals.sold,
      waste_quantity:    vals.waste,
      waste_reason:      vals.waste_reason || null,
      notes:             vals.notes || null,
    }).eq('id', entry.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${entry.product_name} — producción guardada`);
    const newEdits = { ...entryEdits };
    delete newEdits[entry.id];
    setEntryEdits(newEdits);
    load();
  };

  // ── Product CRUD ─────────────────────────────────────────
  const saveProduct = async () => {
    if (!productForm.name.trim()) { toast.error('Nombre obligatorio'); return; }
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: productForm.name.trim(),
      category: productForm.category,
      unit: productForm.unit,
      sale_price: parseFloat(productForm.sale_price) || 0,
      cost_price: parseFloat(productForm.cost_price) || 0,
      daily_target: parseInt(productForm.daily_target) || 0,
      is_active: true,
    };
    const { error } = editProduct
      ? await supabase.from('bakery_products').update(payload).eq('id', editProduct.id)
      : await supabase.from('bakery_products').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editProduct ? 'Producto actualizado' : 'Producto creado');
    setShowProduct(false); setSaving(false); load();
  };

  // ── Pedido CRUD ──────────────────────────────────────────
  const savePedido = async () => {
    if (!pedidoForm.client_name.trim()) { toast.error('Nombre del cliente obligatorio'); return; }
    if (!pedidoForm.delivery_date) { toast.error('Fecha de entrega obligatoria'); return; }
    if (pedidoItems.length === 0 || pedidoItems.every(i => i.quantity <= 0)) { toast.error('Agrega al menos un producto'); return; }
    setSaving(true);
    const items = pedidoItems.filter(i => i.quantity > 0);
    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const num = `PED-${Date.now().toString().slice(-6)}`;
    const payload = {
      company_id: companyId,
      pedido_number: editPedido?.pedido_number || num,
      client_name: pedidoForm.client_name.trim(),
      client_phone: pedidoForm.client_phone.trim() || null,
      delivery_date: pedidoForm.delivery_date,
      delivery_time: pedidoForm.delivery_time || null,
      status: 'PENDING' as PedidoStatus,
      items,
      total_amount: total,
      advance_paid: parseFloat(pedidoForm.advance_paid) || 0,
      notes: pedidoForm.notes.trim() || null,
    };
    const { error } = editPedido
      ? await supabase.from('bakery_pedidos').update(payload).eq('id', editPedido.id)
      : await supabase.from('bakery_pedidos').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editPedido ? 'Pedido actualizado' : '✅ Pedido registrado');
    setShowPedido(false); setSaving(false); load();
  };

  const updatePedidoStatus = async (id: string, status: PedidoStatus) => {
    await supabase.from('bakery_pedidos').update({ status }).eq('id', id);
    toast.success(PEDIDO_STATUS[status].label);
    load();
  };

  // ── Recipe CRUD ──────────────────────────────────────────
  const saveRecipe = async () => {
    if (!recipeProductId) { toast.error('Selecciona el producto'); return; }
    setSaving(true);
    const prod = products.find(p => p.id === recipeProductId);
    const payload = {
      company_id: companyId,
      product_id: recipeProductId,
      product_name: prod?.name || '',
      batch_size: parseInt(recipeBatch) || 100,
      batch_unit: prod?.unit || 'und',
      ingredients: recipeIngredients.filter(i => i.ingredient.trim()),
      preparation_notes: recipeNotes.trim() || null,
    };
    const { error } = editRecipe
      ? await supabase.from('bakery_recipes').update(payload).eq('id', editRecipe.id)
      : await supabase.from('bakery_recipes').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editRecipe ? 'Receta actualizada' : 'Receta guardada');
    setShowRecipe(false); setSaving(false); load();
  };

  // ── KPIs ─────────────────────────────────────────────────
  const totalProduced = entries.reduce((s, e) => s + e.quantity_produced, 0);
  const totalWaste    = entries.reduce((s, e) => s + e.waste_quantity, 0);
  const wasteRate     = totalProduced > 0 ? ((totalWaste / totalProduced) * 100).toFixed(1) : '0.0';
  const todayPedidos  = pedidos.filter(p => p.delivery_date === todayStr()).length;
  const pendingAmount = pedidos.reduce((s, p) => s + (p.total_amount - p.advance_paid), 0);

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400";
  const labelCls = "block text-sm font-medium text-slate-700 mb-1";

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            🥐 Panadería
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">Producción, pedidos anticipados y mermas</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Producido hoy', value: `${totalProduced} und`, color: 'text-slate-800' },
          { label: 'Merma del turno', value: `${wasteRate}%`, color: parseFloat(wasteRate) > 5 ? 'text-red-600' : 'text-amber-600' },
          { label: 'Pedidos para hoy', value: todayPedidos, color: 'text-blue-600' },
          { label: 'Por cobrar (pedidos)', value: formatMoney(pendingAmount), color: 'text-emerald-600' },
        ].map(k => (
          <div key={k.label} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-xs font-medium">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {([
          ['production', '🍞 Producción'],
          ['orders',     '📋 Pedidos'],
          ['recipes',    '📖 Recetas'],
          ['products',   '🧁 Productos'],
          ['stats',      '📊 Resumen'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: PRODUCCIÓN ──────────────────────────────────── */}
      {tab === 'production' && (
        <div className="space-y-4">
          {/* Date + Shift selector */}
          <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fecha</label>
              <input type="date" value={productionDate} onChange={e => setProductionDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Turno</label>
              <div className="flex gap-1">
                {SHIFTS.map(s => (
                  <button key={s} onClick={() => setActiveShift(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeShift === s ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {s === 'MADRUGADA' ? '🌙 Madrugada' : s === 'MAÑANA' ? '☀️ Mañana' : '🌤️ Tarde'}
                  </button>
                ))}
              </div>
            </div>
            {entries.length > 0 && (
              <div className="ml-auto text-sm text-slate-500">
                {totalProduced > 0 && <span>{totalProduced} und producidas</span>}
                {parseFloat(wasteRate) > 0 && <span className="ml-3 text-amber-600">Merma: {wasteRate}%</span>}
              </div>
            )}
          </div>

          {/* Product production grid */}
          {products.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <p className="font-medium">Sin productos registrados</p>
              <p className="text-sm mt-1">Ve a 🧁 Productos para agregar tus productos de panadería</p>
            </div>
          ) : (
            <div className="space-y-2">
              {products.map(prod => {
                const entry = entries.find(e => e.product_id === prod.id);
                const edit  = entry ? entryEdits[entry.id] : null;
                const vals  = edit || {
                  produced:     entry?.quantity_produced ?? 0,
                  sold:         entry?.quantity_sold ?? 0,
                  waste:        entry?.waste_quantity ?? 0,
                  waste_reason: entry?.waste_reason || '',
                  notes:        entry?.notes || '',
                };
                const available = vals.produced - vals.waste;

                return (
                  <div key={prod.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800">{prod.name}</p>
                        <p className="text-xs text-slate-400">{prod.category} · Meta: {prod.daily_target} {prod.unit}</p>
                      </div>

                      {/* Inline fields */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400 mb-0.5">Producido</p>
                          <input type="number" min={0} value={vals.produced}
                            onChange={async e => {
                              let ent = entry;
                              if (!ent) ent = await getOrCreateEntry(prod);
                              if (!ent) return;
                              setEntryEdits(prev => ({ ...prev, [ent!.id]: { ...vals, produced: parseInt(e.target.value) || 0 } }));
                            }}
                            className="w-16 text-center border border-slate-300 rounded-lg py-1 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400" />
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400 mb-0.5">Vendido</p>
                          <input type="number" min={0} max={available} value={vals.sold}
                            onChange={e => entry && setEntryEdits(prev => ({ ...prev, [entry.id]: { ...vals, sold: parseInt(e.target.value) || 0 } }))}
                            className="w-16 text-center border border-slate-300 rounded-lg py-1 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400" />
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-red-400 mb-0.5">Merma</p>
                          <input type="number" min={0} max={vals.produced} value={vals.waste}
                            onChange={e => entry && setEntryEdits(prev => ({ ...prev, [entry.id]: { ...vals, waste: parseInt(e.target.value) || 0 } }))}
                            className="w-16 text-center border border-red-200 rounded-lg py-1 text-sm font-bold outline-none focus:ring-2 focus:ring-red-400" />
                        </div>
                        <div className="text-center min-w-[60px]">
                          <p className="text-[10px] text-slate-400 mb-0.5">Disponible</p>
                          <p className={`text-sm font-black ${available < 0 ? 'text-red-600' : available < 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {available}
                          </p>
                        </div>

                        {entry && edit && (
                          <button onClick={() => saveEntry(entry, edit)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors">
                            Guardar
                          </button>
                        )}
                        {!entry && (
                          <button onClick={() => getOrCreateEntry(prod)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors">
                            + Iniciar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Waste reason row */}
                    {entry && edit && edit.waste > 0 && (
                      <div className="px-5 py-2 bg-red-50 border-t border-red-100 flex items-center gap-3">
                        <p className="text-xs text-red-600 font-medium flex-shrink-0">Motivo merma:</p>
                        <select value={edit.waste_reason} onChange={e => setEntryEdits(prev => ({ ...prev, [entry.id]: { ...edit, waste_reason: e.target.value } }))}
                          className="text-xs border border-red-200 rounded px-2 py-1 bg-white outline-none">
                          <option value="">Seleccionar...</option>
                          {WASTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: PEDIDOS ────────────────────────────────────── */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditPedido(null); setPedidoForm(emptyPedido); setPedidoItems(products.slice(0, 3).map(p => ({ product_id: p.id, product_name: p.name, quantity: 0, unit_price: p.sale_price }))); setShowPedido(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium text-sm">
              <Plus size={15} /> Nuevo pedido
            </button>
          </div>

          {pedidos.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <ShoppingBag size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin pedidos anticipados</p>
              <p className="text-sm mt-1">Registra los pedidos de clientes frecuentes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pedidos.map(ped => {
                const isExpanded = expandedPedido === ped.id;
                const cfg = PEDIDO_STATUS[ped.status];
                const saldo = ped.total_amount - ped.advance_paid;
                const isToday = ped.delivery_date === todayStr();
                return (
                  <div key={ped.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isToday ? 'border-amber-300' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-4 px-5 py-3.5">
                      {isToday && <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" title="Entrega hoy" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-800">{ped.client_name}</p>
                          <span className="font-mono text-xs text-slate-400">{ped.pedido_number}</span>
                          {isToday && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Hoy</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                          <span>📅 {fmtDate(ped.delivery_date)}{ped.delivery_time ? ` · ${ped.delivery_time}` : ''}</span>
                          {ped.client_phone && <span>📱 {ped.client_phone}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-slate-800">{formatMoney(ped.total_amount)}</p>
                        {saldo > 0 && <p className="text-xs text-red-500">Saldo: {formatMoney(saldo)}</p>}
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls} flex-shrink-0`}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <div className="flex gap-1 flex-shrink-0">
                        {ped.status === 'PENDING' && (
                          <button onClick={() => updatePedidoStatus(ped.id, 'PRODUCING')}
                            className="px-2.5 py-1 text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg">
                            Producir
                          </button>
                        )}
                        {ped.status === 'PRODUCING' && (
                          <button onClick={() => updatePedidoStatus(ped.id, 'READY')}
                            className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg">
                            Listo
                          </button>
                        )}
                        {ped.status === 'READY' && (
                          <button onClick={() => updatePedidoStatus(ped.id, 'DISPATCHED')}
                            className="px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg">
                            Despachar
                          </button>
                        )}
                        <button onClick={() => setExpandedPedido(isExpanded ? null : ped.id)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
                        <div className="space-y-1">
                          {(ped.items || []).map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-slate-700">{item.quantity} × {item.product_name}</span>
                              <span className="text-slate-600">{formatMoney(item.quantity * item.unit_price)}</span>
                            </div>
                          ))}
                        </div>
                        {ped.notes && <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2">📝 {ped.notes}</p>}
                        {ped.advance_paid > 0 && (
                          <p className="text-xs text-emerald-700 mt-2">✅ Anticipo: {formatMoney(ped.advance_paid)}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: RECETAS ────────────────────────────────────── */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditRecipe(null); setRecipeProductId(''); setRecipeBatch('100'); setRecipeIngredients([{ ingredient: '', quantity: 0, unit: 'kg', unit_cost: 0 }]); setRecipeNotes(''); setShowRecipe(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium text-sm">
              <Plus size={15} /> Nueva receta
            </button>
          </div>
          {recipes.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <BookOpen size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin recetas registradas</p>
              <p className="text-sm mt-1">Registra las recetas para calcular costos automáticamente</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recipes.map(rec => {
                const totalCost = rec.ingredients.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
                const unitCost = rec.batch_size > 0 ? totalCost / rec.batch_size : 0;
                const prod = products.find(p => p.id === rec.product_id);
                const margin = prod && prod.sale_price > 0 ? ((prod.sale_price - unitCost) / prod.sale_price * 100) : 0;
                return (
                  <div key={rec.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-slate-800">{rec.product_name}</p>
                        <p className="text-xs text-slate-400">Receta para {rec.batch_size} {rec.batch_unit}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditRecipe(rec); setRecipeProductId(rec.product_id); setRecipeBatch(String(rec.batch_size)); setRecipeIngredients(rec.ingredients.length > 0 ? rec.ingredients : [{ ingredient: '', quantity: 0, unit: 'kg', unit_cost: 0 }]); setRecipeNotes(rec.preparation_notes || ''); setShowRecipe(true); }}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 mb-3">
                      {rec.ingredients.map((ing, i) => (
                        <div key={i} className="flex justify-between text-xs text-slate-600">
                          <span>{ing.ingredient}</span>
                          <span className="text-slate-400">{ing.quantity} {ing.unit} · {formatMoney(ing.quantity * ing.unit_cost)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-slate-100 pt-2 flex justify-between text-sm">
                      <div>
                        <p className="text-xs text-slate-400">Costo x unidad</p>
                        <p className="font-bold text-slate-800">{formatMoney(Math.round(unitCost))}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Margen</p>
                        <p className={`font-bold ${margin < 20 ? 'text-red-600' : margin < 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {Math.round(margin)}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: PRODUCTOS ──────────────────────────────────── */}
      {tab === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditProduct(null); setProductForm(emptyProduct); setShowProduct(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium text-sm">
              <Plus size={15} /> Nuevo producto
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {products.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Package size={36} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin productos. Agrega los productos que produces.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>{['Nombre','Categoría','Precio','Costo','Meta diaria','Margen',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map(p => {
                    const margin = p.sale_price > 0 ? ((p.sale_price - p.cost_price) / p.sale_price * 100) : 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                        <td className="px-4 py-3 capitalize text-slate-500">{p.category}</td>
                        <td className="px-4 py-3 font-semibold text-slate-700">{formatMoney(p.sale_price)}</td>
                        <td className="px-4 py-3 text-slate-500">{formatMoney(p.cost_price)}</td>
                        <td className="px-4 py-3 text-slate-500">{p.daily_target} {p.unit}</td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${margin < 20 ? 'text-red-600' : margin < 40 ? 'text-amber-600' : 'text-emerald-600'}`}>{Math.round(margin)}%</span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => { setEditProduct(p); setProductForm({ name: p.name, category: p.category, unit: p.unit, sale_price: String(p.sale_price), cost_price: String(p.cost_price), daily_target: String(p.daily_target) }); setShowProduct(true); }}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                            <Edit2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: STATS ──────────────────────────────────────── */}
      {tab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart2 size={16} /> Producción de hoy</p>
            {entries.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Sin registros de producción hoy</p>
            ) : (
              <div className="space-y-3">
                {entries.map(e => {
                  const prog = e.quantity_planned > 0 ? Math.min((e.quantity_produced / e.quantity_planned) * 100, 100) : 0;
                  return (
                    <div key={e.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700">{e.product_name}</span>
                        <span className="text-slate-500">{e.quantity_produced}/{e.quantity_planned}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-amber-500" style={{ width: `${prog}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-bold text-slate-700 mb-4 flex items-center gap-2"><AlertTriangle size={16} /> Pedidos pendientes</p>
            <div className="space-y-2">
              {pedidos.filter(p => ['PENDING','PRODUCING','READY'].includes(p.status)).slice(0, 6).map(p => (
                <div key={p.id} className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                  <div>
                    <span className="font-medium text-slate-800">{p.client_name}</span>
                    <span className="text-xs text-slate-400 ml-2">{fmtDate(p.delivery_date)}</span>
                  </div>
                  <span className="font-bold text-slate-700">{formatMoney(p.total_amount)}</span>
                </div>
              ))}
              {pedidos.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Sin pedidos pendientes</p>}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODALS ══════════════════════════════════════════ */}

      {/* Modal producto */}
      {showProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">{editProduct ? 'Editar producto' : 'Nuevo producto'}</h3>
              <button onClick={() => setShowProduct(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className={labelCls}>Nombre *</label><input className={inputCls} value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Mogolla" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Categoría</label>
                  <select className={inputCls} value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label className={labelCls}>Unidad</label>
                  <select className={inputCls} value={productForm.unit} onChange={e => setProductForm(f => ({ ...f, unit: e.target.value }))}>
                    {['und','docena','kg','lb','500g'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select></div>
                <div><label className={labelCls}>Precio venta</label>
                  <input type="number" className={inputCls} value={productForm.sale_price} onChange={e => setProductForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="500" /></div>
                <div><label className={labelCls}>Costo</label>
                  <input type="number" className={inputCls} value={productForm.cost_price} onChange={e => setProductForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="300" /></div>
                <div className="col-span-2"><label className={labelCls}>Meta de producción diaria</label>
                  <input type="number" className={inputCls} value={productForm.daily_target} onChange={e => setProductForm(f => ({ ...f, daily_target: e.target.value }))} placeholder="200" /></div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowProduct(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button onClick={saveProduct} disabled={saving} className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editProduct ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pedido */}
      {showPedido && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-800">{editPedido ? 'Editar pedido' : 'Nuevo pedido anticipado'}</h3>
              <button onClick={() => setShowPedido(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className={labelCls}>Cliente *</label><input className={inputCls} value={pedidoForm.client_name} onChange={e => setPedidoForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Café Central, Hotel Luna..." /></div>
                <div><label className={labelCls}>Teléfono</label><input className={inputCls} value={pedidoForm.client_phone} onChange={e => setPedidoForm(f => ({ ...f, client_phone: e.target.value }))} placeholder="311 234 5678" /></div>
                <div><label className={labelCls}>Fecha entrega *</label><input type="date" className={inputCls} value={pedidoForm.delivery_date} onChange={e => setPedidoForm(f => ({ ...f, delivery_date: e.target.value }))} /></div>
                <div><label className={labelCls}>Hora entrega</label><input type="time" className={inputCls} value={pedidoForm.delivery_time} onChange={e => setPedidoForm(f => ({ ...f, delivery_time: e.target.value }))} /></div>
                <div><label className={labelCls}>Anticipo recibido</label>
                  <div className="relative"><DollarSign size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input type="number" className={inputCls + ' pl-8'} value={pedidoForm.advance_paid} onChange={e => setPedidoForm(f => ({ ...f, advance_paid: e.target.value }))} placeholder="0" /></div></div>
              </div>

              {/* Items */}
              <div>
                <label className={labelCls}>Productos del pedido</label>
                <div className="space-y-2">
                  {pedidoItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm outline-none"
                        value={item.product_id}
                        onChange={e => {
                          const prod = products.find(p => p.id === e.target.value);
                          setPedidoItems(items => items.map((it, i) => i === idx ? { ...it, product_id: e.target.value, product_name: prod?.name || '', unit_price: prod?.sale_price || 0 } : it));
                        }}>
                        <option value="">Seleccionar...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input type="number" min={0} placeholder="Cant." value={item.quantity || ''}
                        onChange={e => setPedidoItems(items => items.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 0 } : it))}
                        className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center outline-none" />
                      <button onClick={() => setPedidoItems(items => items.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-300 hover:text-red-400">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setPedidoItems(i => [...i, { product_id: '', product_name: '', quantity: 0, unit_price: 0 }])}
                    className="text-xs text-amber-600 hover:underline">+ Agregar producto</button>
                </div>
                <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span>{formatMoney(pedidoItems.reduce((s, i) => s + i.quantity * i.unit_price, 0))}</span>
                </div>
              </div>

              <div><label className={labelCls}>Notas</label><input className={inputCls} value={pedidoForm.notes} onChange={e => setPedidoForm(f => ({ ...f, notes: e.target.value }))} placeholder="Instrucciones especiales..." /></div>
            </div>
            <div className="flex gap-3 p-6 pt-0 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setShowPedido(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button onClick={savePedido} disabled={saving} className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editPedido ? 'Guardar' : 'Registrar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal receta */}
      {showRecipe && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-800">{editRecipe ? 'Editar receta' : 'Nueva receta'}</h3>
              <button onClick={() => setShowRecipe(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className={labelCls}>Producto *</label>
                  <select className={inputCls} value={recipeProductId} onChange={e => setRecipeProductId(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></div>
                <div className="col-span-2"><label className={labelCls}>Receta para cuántas unidades</label>
                  <input type="number" className={inputCls} value={recipeBatch} onChange={e => setRecipeBatch(e.target.value)} placeholder="100" /></div>
              </div>

              <div>
                <label className={labelCls}>Ingredientes</label>
                <div className="space-y-2">
                  {recipeIngredients.map((ing, idx) => (
                    <div key={idx} className="grid grid-cols-5 gap-2">
                      <input placeholder="Insumo" className="col-span-2 border border-slate-300 rounded px-2 py-1.5 text-xs outline-none" value={ing.ingredient} onChange={e => setRecipeIngredients(ings => ings.map((i, n) => n === idx ? { ...i, ingredient: e.target.value } : i))} />
                      <input type="number" placeholder="Cant." className="border border-slate-300 rounded px-2 py-1.5 text-xs outline-none text-center" value={ing.quantity || ''} onChange={e => setRecipeIngredients(ings => ings.map((i, n) => n === idx ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i))} />
                      <select className="border border-slate-300 rounded px-1 py-1.5 text-xs outline-none" value={ing.unit} onChange={e => setRecipeIngredients(ings => ings.map((i, n) => n === idx ? { ...i, unit: e.target.value } : i))}>
                        {['kg','g','l','ml','und','taza','cucharada'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <input type="number" placeholder="$/kg" className="border border-slate-300 rounded px-2 py-1.5 text-xs outline-none text-right" value={ing.unit_cost || ''} onChange={e => setRecipeIngredients(ings => ings.map((i, n) => n === idx ? { ...i, unit_cost: parseFloat(e.target.value) || 0 } : i))} />
                    </div>
                  ))}
                  <button onClick={() => setRecipeIngredients(i => [...i, { ingredient: '', quantity: 0, unit: 'kg', unit_cost: 0 }])}
                    className="text-xs text-amber-600 hover:underline">+ Agregar insumo</button>
                </div>
                {/* Cost summary */}
                <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Costo total receta</span>
                    <span className="font-bold">{formatMoney(Math.round(recipeIngredients.reduce((s, i) => s + i.quantity * i.unit_cost, 0)))}</span>
                  </div>
                  {parseInt(recipeBatch) > 0 && (
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-slate-500">Costo x unidad</span>
                      <span className="font-bold text-amber-600">{formatMoney(Math.round(recipeIngredients.reduce((s, i) => s + i.quantity * i.unit_cost, 0) / parseInt(recipeBatch)))}</span>
                    </div>
                  )}
                </div>
              </div>
              <div><label className={labelCls}>Notas de preparación</label>
                <textarea rows={3} className={inputCls + ' resize-none'} value={recipeNotes} onChange={e => setRecipeNotes(e.target.value)} placeholder="Temperatura del horno, tiempos de reposo..." /></div>
            </div>
            <div className="flex gap-3 p-6 pt-0 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setShowRecipe(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button onClick={saveRecipe} disabled={saving} className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editRecipe ? 'Guardar' : 'Guardar receta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Panaderia;
