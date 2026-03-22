import React, { useState, useEffect, useCallback } from 'react';
import { Tag, Search, X, Save, Trash2, Calendar, Percent, DollarSign, AlertCircle, CheckCircle, Package } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';

interface ProductDiscount {
  id: string;
  name: string;
  sku: string;
  price: number;
  category?: string;
  discount_type: 'pct' | 'value' | null;
  discount_pct: number;
  discount_value: number;
  discount_expires_at: string | null;
  discount_label: string | null;
}

interface Props {
  companyId: string;
  onClose: () => void;
}

interface FormState {
  discount_type: 'pct' | 'value';
  discount_pct: string;
  discount_value: string;
  discount_expires_at: string;
  discount_label: string;
}

interface TarjetaProps {
  p: ProductDiscount;
  editando: string | null;
  form: FormState;
  saving: string | null;
  onAbrirEditor: (p: ProductDiscount) => void;
  onSetForm: (updater: (f: FormState) => FormState) => void;
  onGuardar: (id: string) => void;
  onEliminar: (id: string, nombre: string) => void;
  onCancelar: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

// ── TarjetaProducto FUERA del componente principal para evitar re-renders ──
const TarjetaProducto = ({
  p, editando, form, saving,
  onAbrirEditor, onSetForm, onGuardar, onEliminar, onCancelar,
}: TarjetaProps) => {
  const isEditando = editando === p.id;
  const vencido = p.discount_expires_at && new Date(p.discount_expires_at) < new Date();

  const precioFinal = () => {
    if (!p.discount_type) return p.price;
    if (p.discount_type === 'pct')   return Math.round(p.price * (1 - p.discount_pct / 100));
    if (p.discount_type === 'value') return Math.max(p.price - p.discount_value, 0);
    return p.price;
  };

  const previewPrecio = () => {
    if (form.discount_type === 'pct')
      return Math.round(p.price * (1 - (parseFloat(form.discount_pct) || 0) / 100));
    return Math.max(p.price - (parseFloat(form.discount_value) || 0), 0);
  };

  return (
    <div className={`border rounded-xl p-3 transition-all ${
      vencido ? 'border-red-200 bg-red-50' :
      p.discount_type ? 'border-emerald-200 bg-emerald-50' :
      'border-slate-200 bg-white'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Package size={13} className="text-slate-400 shrink-0" />
            <p className="font-semibold text-slate-800 text-sm truncate">{p.name}</p>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">SKU: {p.sku} {p.category ? `· ${p.category}` : ''}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400 line-through">{fmt(p.price)}</p>
          <p className={`font-bold text-sm ${p.discount_type && !vencido ? 'text-emerald-600' : 'text-slate-700'}`}>
            {fmt(precioFinal())}
          </p>
        </div>
      </div>

      {/* Badge descuento activo */}
      {p.discount_type && !isEditando && (
        <div className={`flex items-center gap-2 mb-2 p-1.5 rounded-lg text-xs ${
          vencido ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {vencido ? <AlertCircle size={11} /> : <CheckCircle size={11} />}
          <span>
            {p.discount_type === 'pct'
              ? `${p.discount_pct}% descuento`
              : `${fmt(p.discount_value)} descuento`}
            {p.discount_label ? ` · ${p.discount_label}` : ''}
            {p.discount_expires_at
              ? ` · Vence: ${new Date(p.discount_expires_at).toLocaleDateString('es-CO')}`
              : ''}
            {vencido ? ' (VENCIDO)' : ''}
          </span>
        </div>
      )}

      {/* Formulario inline */}
      {isEditando ? (
        <div className="space-y-2 mt-2 border-t border-slate-200 pt-2">
          {/* Tipo */}
          <div className="flex gap-2">
            <button
              onClick={() => onSetForm(f => ({ ...f, discount_type: 'pct' }))}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                form.discount_type === 'pct'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}>
              <Percent size={11} /> Porcentaje
            </button>
            <button
              onClick={() => onSetForm(f => ({ ...f, discount_type: 'value' }))}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                form.discount_type === 'value'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}>
              <DollarSign size={11} /> Valor fijo
            </button>
          </div>

          {/* Valor + preview */}
          <div className="flex gap-2">
            {form.discount_type === 'pct' ? (
              <div className="flex-1 relative">
                <input
                  type="number" min="1" max="100" step="0.5"
                  value={form.discount_pct}
                  onChange={e => onSetForm(f => ({ ...f, discount_pct: e.target.value }))}
                  placeholder="Ej: 15"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
              </div>
            ) : (
              <div className="flex-1 relative">
                <input
                  type="number" min="1"
                  value={form.discount_value}
                  onChange={e => onSetForm(f => ({ ...f, discount_value: e.target.value }))}
                  placeholder="Ej: 5000"
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm pl-6 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
              </div>
            )}
            <div className="flex items-center px-2 bg-slate-100 rounded-lg text-xs text-slate-600 whitespace-nowrap">
              → {fmt(previewPrecio())}
            </div>
          </div>

          {/* Etiqueta */}
          <input
            type="text"
            value={form.discount_label}
            onChange={e => onSetForm(f => ({ ...f, discount_label: e.target.value }))}
            placeholder="Etiqueta (opcional, ej: Promo marzo)"
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />

          {/* Fecha vencimiento */}
          <div className="relative">
            <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={form.discount_expires_at}
              onChange={e => onSetForm(f => ({ ...f, discount_expires_at: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          {!form.discount_expires_at && (
            <p className="text-[10px] text-slate-400">Sin fecha = descuento permanente</p>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onGuardar(p.id)}
              disabled={saving === p.id}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              <Save size={11} /> {saving === p.id ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={onCancelar}
              className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            {p.discount_type && (
              <button
                onClick={() => onEliminar(p.id, p.name)}
                disabled={saving === p.id}
                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs hover:bg-red-100 transition-colors">
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => onAbrirEditor(p)}
          className="w-full mt-1 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs hover:bg-slate-50 transition-colors">
          {p.discount_type ? 'Editar descuento' : '+ Agregar descuento'}
        </button>
      )}
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function DescuentosModal({ companyId, onClose }: Props) {
  const [tab, setTab] = useState<'activos' | 'buscar'>('activos');
  const [productos, setProductos] = useState<ProductDiscount[]>([]);
  const [activos, setActivos] = useState<ProductDiscount[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    discount_type: 'pct',
    discount_pct: '',
    discount_value: '',
    discount_expires_at: '',
    discount_label: '',
  });

  const cargarActivos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, price, category, discount_type, discount_pct, discount_value, discount_expires_at, discount_label')
      .eq('company_id', companyId)
      .not('discount_type', 'is', null)
      .order('name');
    if (error) toast.error('Error cargando descuentos');
    else setActivos((data || []) as ProductDiscount[]);
    setLoading(false);
  }, [companyId]);

  const buscar = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setProductos([]); return; }
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, price, category, discount_type, discount_pct, discount_value, discount_expires_at, discount_label')
      .eq('company_id', companyId)
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .eq('is_active', true)
      .limit(20);
    setProductos((data || []) as ProductDiscount[]);
  }, [companyId]);

  useEffect(() => { cargarActivos(); }, [cargarActivos]);
  useEffect(() => {
    const t = setTimeout(() => buscar(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda, buscar]);

  const abrirEditor = (p: ProductDiscount) => {
    setEditando(p.id);
    setForm({
      discount_type: p.discount_type || 'pct',
      discount_pct: p.discount_pct ? String(p.discount_pct) : '',
      discount_value: p.discount_value ? String(p.discount_value) : '',
      discount_expires_at: p.discount_expires_at ? p.discount_expires_at.split('T')[0] : '',
      discount_label: p.discount_label || '',
    });
  };

  const guardar = async (productoId: string) => {
    const pct   = parseFloat(form.discount_pct) || 0;
    const valor = parseFloat(form.discount_value) || 0;
    if (form.discount_type === 'pct' && (pct <= 0 || pct > 100)) {
      toast.error('El porcentaje debe ser entre 1 y 100'); return;
    }
    if (form.discount_type === 'value' && valor <= 0) {
      toast.error('El valor debe ser mayor a 0'); return;
    }
    setSaving(productoId);
    const { error } = await supabase.from('products').update({
      discount_type:       form.discount_type,
      discount_pct:        form.discount_type === 'pct'   ? pct   : 0,
      discount_value:      form.discount_type === 'value' ? valor : 0,
      discount_expires_at: form.discount_expires_at
        ? new Date(form.discount_expires_at + 'T23:59:59').toISOString()
        : null,
      discount_label: form.discount_label || null,
    }).eq('id', productoId).eq('company_id', companyId);
    setSaving(null);
    if (error) { toast.error('Error guardando descuento'); return; }
    toast.success('Descuento guardado ✓');
    setEditando(null);
    cargarActivos();
    if (tab === 'buscar') buscar(busqueda);
  };

  const eliminar = async (productoId: string, nombre: string) => {
    if (!window.confirm(`¿Quitar descuento de "${nombre}"?`)) return;
    setSaving(productoId);
    await supabase.from('products').update({
      discount_type: null, discount_pct: 0,
      discount_value: 0, discount_expires_at: null, discount_label: null,
    }).eq('id', productoId).eq('company_id', companyId);
    setSaving(null);
    toast.success('Descuento eliminado');
    setEditando(null);
    cargarActivos();
    if (tab === 'buscar') buscar(busqueda);
  };

  const tarjetaProps = {
    editando, form, saving,
    onAbrirEditor: abrirEditor,
    onSetForm: setForm,
    onGuardar: guardar,
    onEliminar: eliminar,
    onCancelar: () => setEditando(null),
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Tag size={18} className="text-orange-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Descuentos por Producto</h2>
              <p className="text-xs text-slate-500">Se aplican automáticamente en el POS</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4">
          <button
            onClick={() => setTab('activos')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'activos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            En oferta ({activos.length})
          </button>
          <button
            onClick={() => setTab('buscar')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'buscar' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            Buscar producto
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'activos' ? (
            loading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : activos.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Tag size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No hay productos en oferta</p>
                <p className="text-xs mt-1">Ve a "Buscar producto" para agregar descuentos</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activos.map(p => <TarjetaProducto key={p.id} p={p} {...tarjetaProps} />)}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o SKU..."
                  autoFocus
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                {busqueda && (
                  <button onClick={() => { setBusqueda(''); setProductos([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X size={13} className="text-slate-400" />
                  </button>
                )}
              </div>
              {busqueda.length > 0 && busqueda.length < 2 && (
                <p className="text-xs text-slate-400 text-center">Escribe al menos 2 caracteres</p>
              )}
              {productos.length > 0 && (
                <div className="space-y-2">
                  {productos.map(p => <TarjetaProducto key={p.id} p={p} {...tarjetaProps} />)}
                </div>
              )}
              {busqueda.length >= 2 && productos.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">No se encontraron productos</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}