import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, X, Edit2, Trash2, Package, Tag, BarChart2,
  RefreshCw, CheckCircle, AlertCircle, Shirt,
  Truck, Grid3x3, List, Download,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface Referencia {
  id: string; company_id: string; nombre: string; codigo: string;
  categoria: string; genero: string; marca?: string; descripcion?: string;
  precio_venta: number; costo: number; proveedor_id?: string;
  imagen_url?: string; is_active: boolean; created_at: string;
}
interface Variante {
  id: string; referencia_id: string; company_id: string;
  talla: string; color: string; stock: number;
  codigo_barras?: string; precio_extra: number; is_active: boolean;
}
interface Proveedor { id: string; company_id: string; name: string; nit?: string; phone?: string; email?: string; }

const CATEGORIAS = ['Camisetas','Pantalones','Vestidos','Faldas','Chaquetas','Ropa Interior','Medias','Zapatos','Botas','Sandalias','Tenis','Accesorios','Otro'];
const GENEROS = ['Hombre','Mujer','Niño','Niña','Unisex'];
const TALLAS_ROPA = ['XXS','XS','S','M','L','XL','XXL','XXXL','6','8','10','12','14','16','Talla Única'];
const TALLAS_ZAPATO = ['34','35','36','37','38','39','40','41','42','43','44','45','46'];
const COLORES_BASE = ['Negro','Blanco','Gris','Azul','Rojo','Verde','Amarillo','Naranja','Morado','Rosa','Café','Beige','Multicolor'];
const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

const Ropa: React.FC = () => {
  const { companyId } = useDatabase() as any;
  const { formatMoney } = useCurrency();
  const [tab, setTab] = useState<'catalogo'|'variantes'|'proveedores'|'reportes'>('catalogo');
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroGenero, setFiltroGenero] = useState('');
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [showRefModal, setShowRefModal] = useState(false);
  const [showVarModal, setShowVarModal] = useState(false);
  const [showProvModal, setShowProvModal] = useState(false);
  const [editingRef, setEditingRef] = useState<Referencia|null>(null);
  const [editingVar, setEditingVar] = useState<Variante|null>(null);
  const [selectedRef, setSelectedRef] = useState<Referencia|null>(null);
  const [saving, setSaving] = useState(false);
  const emptyRef = () => ({ nombre:'',codigo:'',categoria:'Camisetas',genero:'Unisex',marca:'',descripcion:'',precio_venta:0,costo:0,proveedor_id:'',imagen_url:'',is_active:true });
  const emptyVar = () => ({ talla:'M',color:'Negro',stock:0,codigo_barras:'',precio_extra:0,is_active:true });
  const [refForm, setRefForm] = useState<any>(emptyRef());
  const [varForm, setVarForm] = useState<any>(emptyVar());
  const [provForm, setProvForm] = useState<any>({ name:'',nit:'',phone:'',email:'' });

  const cargar = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: refs },{ data: vars },{ data: provs }] = await Promise.all([
      supabase.from('ropa_referencias').select('*').eq('company_id', companyId).order('nombre'),
      supabase.from('ropa_variantes').select('*').eq('company_id', companyId),
      supabase.from('suppliers').select('*').eq('company_id', companyId).order('name'),
    ]);
    setReferencias(refs || []); setVariantes(vars || []); setProveedores(provs || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { cargar(); }, [cargar]);

  const refsFiltradas = referencias.filter(r => {
    const q = search.toLowerCase();
    return (!q || r.nombre.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q) || (r.marca||'').toLowerCase().includes(q))
      && (!filtroCategoria || r.categoria === filtroCategoria)
      && (!filtroGenero || r.genero === filtroGenero)
      && r.is_active;
  });

  const variantesDeRef = (refId: string) => variantes.filter(v => v.referencia_id === refId && v.is_active);
  const stockTotal = (refId: string) => variantesDeRef(refId).reduce((s,v) => s + (v.stock||0), 0);

  const guardarRef = async () => {
    if (!refForm.nombre || !refForm.codigo) { toast.error('Nombre y código requeridos'); return; }
    setSaving(true);
    try {
      const payload = { ...refForm, company_id: companyId };
      if (editingRef) { await supabase.from('ropa_referencias').update(payload).eq('id', editingRef.id); toast.success('Actualizado'); }
      else { await supabase.from('ropa_referencias').insert(payload); toast.success('Referencia creada'); }
      setShowRefModal(false); setEditingRef(null); setRefForm(emptyRef()); cargar();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const eliminarRef = async (id: string) => {
    if (!window.confirm('¿Eliminar esta referencia y todas sus variantes?')) return;
    await supabase.from('ropa_variantes').delete().eq('referencia_id', id);
    await supabase.from('ropa_referencias').delete().eq('id', id);
    toast.success('Eliminado'); cargar();
  };

  const guardarVar = async () => {
    if (!selectedRef || !varForm.talla || !varForm.color) { toast.error('Talla y color requeridos'); return; }
    setSaving(true);
    try {
      const payload = { ...varForm, company_id: companyId, referencia_id: selectedRef.id };
      if (editingVar) { await supabase.from('ropa_variantes').update(payload).eq('id', editingVar.id); toast.success('Actualizado'); }
      else { await supabase.from('ropa_variantes').insert(payload); toast.success('Variante creada'); }
      setShowVarModal(false); setEditingVar(null); setVarForm(emptyVar()); cargar();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const eliminarVar = async (id: string) => {
    if (!window.confirm('¿Eliminar esta variante?')) return;
    await supabase.from('ropa_variantes').delete().eq('id', id);
    toast.success('Eliminado'); cargar();
  };

  const guardarProv = async () => {
    if (!provForm.name) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    try {
      await supabase.from('suppliers').insert({ ...provForm, company_id: companyId, products_supplied: 'Ropa y Calzado' });
      toast.success('Proveedor creado'); setShowProvModal(false); setProvForm({ name:'',nit:'',phone:'',email:'' }); cargar();
    } catch(e:any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const exportarExcel = () => {
    const rows = referencias.flatMap(ref => variantesDeRef(ref.id).map(v => ({
      Referencia: ref.nombre, Código: ref.codigo, Categoría: ref.categoria, Género: ref.genero,
      Marca: ref.marca||'', Talla: v.talla, Color: v.color, Stock: v.stock,
      'Precio Venta': ref.precio_venta + v.precio_extra, Costo: ref.costo, 'Código Barras': v.codigo_barras||'',
    })));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario Ropa');
    XLSX.writeFile(wb, 'inventario_ropa.xlsx');
  };

  const totalUnidades = variantes.reduce((s,v) => s + (v.stock||0), 0);
  const stockBajo = referencias.filter(r => stockTotal(r.id) < 3 && r.is_active).length;
  const valorInventario = variantes.reduce((s,v) => { const ref = referencias.find(r => r.id === v.referencia_id); return s + (ref?.costo||0) * (v.stock||0); }, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">👗 Ropa y Calzado</h2>
          <p className="text-slate-500 text-sm">Gestión de referencias, tallas, colores e inventario</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportarExcel} className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800"><Download size={15} /> Excel</button>
          <button onClick={() => { setEditingRef(null); setRefForm(emptyRef()); setShowRefModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><Plus size={15} /> Nueva Referencia</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Referencias activas', value: referencias.filter(r=>r.is_active).length, color:'text-blue-600', icon:'👗' },
          { label:'Unidades en stock', value: totalUnidades.toLocaleString('es-CO'), color:'text-emerald-600', icon:'📦' },
          { label:'Stock bajo (<3)', value: stockBajo, color:'text-red-600', icon:'⚠️' },
          { label:'Valor inventario', value: fmt(valorInventario), color:'text-amber-600', icon:'💰', small:true },
        ].map(({ label, value, color, icon, small }:any) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1"><span className="text-lg">{icon}</span><p className="text-xs text-slate-500 font-semibold uppercase">{label}</p></div>
            <p className={`font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {([['catalogo','👗 Catálogo'],['variantes','📐 Tallas/Colores'],['proveedores','🚚 Proveedores'],['reportes','📊 Reportes']] as const).map(([k,label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab===k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
        ))}
      </div>

      {tab === 'catalogo' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, código, marca..." className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtroGenero} onChange={e => setFiltroGenero(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Todos los géneros</option>
              {GENEROS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <div className="flex gap-1">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg border ${viewMode==='grid' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 text-slate-500'}`}><Grid3x3 size={16}/></button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg border ${viewMode==='list' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 text-slate-500'}`}><List size={16}/></button>
            </div>
          </div>
          {loading ? <div className="text-center py-12 text-slate-400">Cargando...</div>
          : refsFiltradas.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Shirt size={40} className="mx-auto mb-3 text-slate-200" />
              <p className="text-slate-500 font-medium">No hay referencias</p>
              <p className="text-sm text-slate-400 mt-1">Crea tu primera referencia de ropa o calzado</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {refsFiltradas.map(ref => {
                const vars = variantesDeRef(ref.id);
                const stock = stockTotal(ref.id);
                const tallas = [...new Set(vars.map(v => v.talla))];
                const colores = [...new Set(vars.map(v => v.color))];
                return (
                  <div key={ref.id} className="bg-white rounded-xl border border-slate-200 hover:shadow-md transition-all overflow-hidden">
                    <div className="relative h-36 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      {ref.imagen_url ? <img src={ref.imagen_url} alt={ref.nombre} className="w-full h-full object-cover" /> : <Shirt size={40} className="text-slate-300" />}
                      <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold ${stock<3 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{stock} und</div>
                      {ref.genero && <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">{ref.genero}</div>}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-slate-800 text-sm truncate">{ref.nombre}</p>
                      <p className="text-xs text-slate-400 font-mono">{ref.codigo} · {ref.categoria}</p>
                      <p className="font-bold text-blue-600 mt-1">{fmt(ref.precio_venta)}</p>
                      <div className="flex flex-wrap gap-1 mt-2">{tallas.slice(0,4).map(t => <span key={t} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">{t}</span>)}{tallas.length>4 && <span className="text-xs text-slate-400">+{tallas.length-4}</span>}</div>
                      <div className="flex flex-wrap gap-1 mt-1">{colores.slice(0,3).map(c => <span key={c} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{c}</span>)}</div>
                      <div className="flex gap-1 mt-3 pt-2 border-t border-slate-100">
                        <button onClick={() => { setSelectedRef(ref); setTab('variantes'); }} className="flex-1 py-1.5 text-xs bg-slate-50 text-slate-600 rounded hover:bg-slate-100 font-medium">Tallas/Colores</button>
                        <button onClick={() => { setEditingRef(ref); setRefForm({...ref}); setShowRefModal(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={13}/></button>
                        <button onClick={() => eliminarRef(ref.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr>{['Referencia','Código','Categoría','Género','Precio','Stock','Tallas',''].map(h => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {refsFiltradas.map(ref => {
                    const stock = stockTotal(ref.id);
                    const tallas = [...new Set(variantesDeRef(ref.id).map(v => v.talla))];
                    return (
                      <tr key={ref.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3"><p className="font-semibold text-slate-800">{ref.nombre}</p>{ref.marca && <p className="text-xs text-slate-400">{ref.marca}</p>}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{ref.codigo}</td>
                        <td className="px-4 py-3 text-slate-500">{ref.categoria}</td>
                        <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">{ref.genero}</span></td>
                        <td className="px-4 py-3 font-bold text-blue-600">{fmt(ref.precio_venta)}</td>
                        <td className="px-4 py-3"><span className={`font-bold ${stock<3?'text-red-600':'text-emerald-600'}`}>{stock}</span></td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{tallas.slice(0,5).map(t => <span key={t} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">{t}</span>)}</div></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => { setSelectedRef(ref); setTab('variantes'); }} className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">Variantes</button>
                            <button onClick={() => { setEditingRef(ref); setRefForm({...ref}); setShowRefModal(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={13}/></button>
                            <button onClick={() => eliminarRef(ref.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={13}/></button>
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

      {tab === 'variantes' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-semibold text-slate-600 mb-2">Selecciona una referencia:</label>
            <select value={selectedRef?.id||''} onChange={e => setSelectedRef(referencias.find(r=>r.id===e.target.value)||null)} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm">
              <option value="">Seleccionar referencia...</option>
              {referencias.filter(r=>r.is_active).map(r => <option key={r.id} value={r.id}>{r.nombre} ({r.codigo}) — {r.categoria}</option>)}
            </select>
          </div>
          {selectedRef && (
            <>
              <div className="flex items-center justify-between">
                <div><h3 className="font-bold text-slate-800">{selectedRef.nombre}</h3><p className="text-sm text-slate-400">{selectedRef.codigo} · {selectedRef.categoria} · Base: {fmt(selectedRef.precio_venta)}</p></div>
                <button onClick={() => { setEditingVar(null); setVarForm(emptyVar()); setShowVarModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><Plus size={15}/> Agregar Talla/Color</button>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {variantesDeRef(selectedRef.id).length === 0 ? (
                  <div className="p-10 text-center text-slate-400"><p className="text-2xl mb-2">📐</p><p className="font-medium">Sin variantes aún</p></div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr>{['Talla','Color','Stock','Precio Final','Código Barras',''].map(h => <th key={h} className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {variantesDeRef(selectedRef.id).map(v => (
                        <tr key={v.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3"><span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold font-mono">{v.talla}</span></td>
                          <td className="px-4 py-3"><span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-semibold">{v.color}</span></td>
                          <td className="px-4 py-3"><span className={`font-bold ${v.stock<3?'text-red-600':'text-emerald-600'}`}>{v.stock}</span>{v.stock<3&&<span className="ml-1 text-xs text-red-400">⚠️</span>}</td>
                          <td className="px-4 py-3 font-semibold text-blue-700">{fmt(selectedRef.precio_venta+(v.precio_extra||0))}{v.precio_extra>0&&<span className="text-xs text-slate-400 ml-1">(+{fmt(v.precio_extra)})</span>}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.codigo_barras||'—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => { setEditingVar(v); setVarForm({...v}); setShowVarModal(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={13}/></button>
                              <button onClick={() => eliminarVar(v.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={13}/></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'proveedores' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">{proveedores.length} proveedores</p>
            <button onClick={() => setShowProvModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><Plus size={15}/> Nuevo Proveedor</button>
          </div>
          {proveedores.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400"><Truck size={40} className="mx-auto mb-3 opacity-30"/><p className="font-medium">No hay proveedores</p></div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr>{['Proveedor','NIT','Teléfono','Email'].map(h=><th key={h} className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {proveedores.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.nit||'—'}</td>
                      <td className="px-4 py-3 text-slate-500">{p.phone||'—'}</td>
                      <td className="px-4 py-3 text-slate-500">{p.email||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'reportes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart2 size={16}/> Stock por categoría</h3>
              <div className="space-y-3">
                {CATEGORIAS.filter(cat => referencias.some(r=>r.categoria===cat&&r.is_active)).map(cat => {
                  const stockcat = referencias.filter(r=>r.categoria===cat&&r.is_active).reduce((s,r)=>s+stockTotal(r.id),0);
                  const maxStock = Math.max(1,...CATEGORIAS.map(c=>referencias.filter(r=>r.categoria===c&&r.is_active).reduce((s,r)=>s+stockTotal(r.id),0)));
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs text-slate-600 mb-1"><span>{cat}</span><span className="font-bold">{stockcat} und</span></div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{width:`${(stockcat/maxStock)*100}%`}}/></div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><AlertCircle size={16} className="text-red-500"/> Stock bajo</h3>
              {referencias.filter(r=>stockTotal(r.id)<3&&r.is_active).length===0 ? (
                <div className="text-center text-slate-400 py-6"><CheckCircle size={32} className="mx-auto mb-2 text-emerald-400"/><p className="text-sm">¡Todo bien! Sin stock bajo</p></div>
              ) : (
                <div className="space-y-2">
                  {referencias.filter(r=>stockTotal(r.id)<3&&r.is_active).map(ref => (
                    <div key={ref.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                      <div><p className="font-semibold text-red-800 text-sm">{ref.nombre}</p><p className="text-xs text-red-400">{ref.codigo} · {ref.categoria}</p></div>
                      <span className="font-bold text-red-600 text-lg">{stockTotal(ref.id)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRefModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-lg">{editingRef?'Editar':'Nueva'} Referencia</h3>
              <button onClick={()=>{setShowRefModal(false);setEditingRef(null);setRefForm(emptyRef());}}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label><input value={refForm.nombre||''} onChange={e=>setRefForm((p:any)=>({...p,nombre:e.target.value}))} placeholder="Ej: Camiseta Básica" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Código *</label><input value={refForm.codigo||''} onChange={e=>setRefForm((p:any)=>({...p,codigo:e.target.value}))} placeholder="CAM-001" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Marca</label><input value={refForm.marca||''} onChange={e=>setRefForm((p:any)=>({...p,marca:e.target.value}))} placeholder="Nike, Zara..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label><select value={refForm.categoria||'Camisetas'} onChange={e=>setRefForm((p:any)=>({...p,categoria:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">{CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Género</label><select value={refForm.genero||'Unisex'} onChange={e=>setRefForm((p:any)=>({...p,genero:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">{GENEROS.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Precio venta *</label><input type="number" min="0" value={refForm.precio_venta||''} onChange={e=>setRefForm((p:any)=>({...p,precio_venta:parseFloat(e.target.value)||0}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Costo</label><input type="number" min="0" value={refForm.costo||''} onChange={e=>setRefForm((p:any)=>({...p,costo:parseFloat(e.target.value)||0}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Proveedor</label><select value={refForm.proveedor_id||''} onChange={e=>setRefForm((p:any)=>({...p,proveedor_id:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"><option value="">Sin proveedor</option>{proveedores.map(pv=><option key={pv.id} value={pv.id}>{pv.name}</option>)}</select></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea value={refForm.descripcion||''} onChange={e=>setRefForm((p:any)=>({...p,descripcion:e.target.value}))} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              </div>
              {refForm.precio_venta>0&&refForm.costo>0&&<div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700 font-medium">Margen: {(((refForm.precio_venta-refForm.costo)/refForm.precio_venta)*100).toFixed(1)}%</div>}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={()=>{setShowRefModal(false);setEditingRef(null);setRefForm(emptyRef());}} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium text-sm">Cancelar</button>
              <button onClick={guardarRef} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50">{saving?'Guardando...':editingRef?'Actualizar':'Crear'}</button>
            </div>
          </div>
        </div>
      )}

      {showVarModal && selectedRef && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b"><div><h3 className="font-bold text-lg">{editingVar?'Editar':'Nueva'} Variante</h3><p className="text-sm text-slate-400">{selectedRef.nombre}</p></div><button onClick={()=>{setShowVarModal(false);setEditingVar(null);setVarForm(emptyVar());}}><X size={20} className="text-slate-400"/></button></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Talla *</label>
                  <input value={varForm.talla||''} onChange={e=>setVarForm((p:any)=>({...p,talla:e.target.value}))} placeholder="Ej: M, 38, XL..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  <div className="flex flex-wrap gap-1 mt-2">{[...TALLAS_ROPA.slice(0,8),...TALLAS_ZAPATO.slice(0,6)].map(t=><button key={t} type="button" onClick={()=>setVarForm((p:any)=>({...p,talla:t}))} className={`px-2 py-0.5 text-xs rounded border ${varForm.talla===t?'bg-blue-600 text-white border-blue-600':'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{t}</button>)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Color *</label>
                  <input value={varForm.color||''} onChange={e=>setVarForm((p:any)=>({...p,color:e.target.value}))} placeholder="Ej: Negro, Azul Rey..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  <div className="flex flex-wrap gap-1 mt-2">{COLORES_BASE.slice(0,8).map(c=><button key={c} type="button" onClick={()=>setVarForm((p:any)=>({...p,color:c}))} className={`px-2 py-0.5 text-xs rounded border ${varForm.color===c?'bg-blue-600 text-white border-blue-600':'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{c}</button>)}</div>
                </div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Stock *</label><input type="number" min="0" value={varForm.stock??0} onChange={e=>setVarForm((p:any)=>({...p,stock:parseInt(e.target.value)||0}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Precio extra</label><input type="number" min="0" value={varForm.precio_extra??0} onChange={e=>setVarForm((p:any)=>({...p,precio_extra:parseFloat(e.target.value)||0}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/><p className="text-xs text-slate-400 mt-0.5">Base: {fmt(selectedRef.precio_venta)}</p></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Código de barras</label><input value={varForm.codigo_barras||''} onChange={e=>setVarForm((p:any)=>({...p,codigo_barras:e.target.value}))} placeholder="Escanea o escribe..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              </div>
              {varForm.talla&&varForm.color&&<div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">Talla <strong>{varForm.talla}</strong> · Color <strong>{varForm.color}</strong> · Precio: <strong>{fmt(selectedRef.precio_venta+(varForm.precio_extra||0))}</strong></div>}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={()=>{setShowVarModal(false);setEditingVar(null);setVarForm(emptyVar());}} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium text-sm">Cancelar</button>
              <button onClick={guardarVar} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50">{saving?'Guardando...':editingVar?'Actualizar':'Agregar'}</button>
            </div>
          </div>
        </div>
      )}

      {showProvModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b"><h3 className="font-bold text-lg">Nuevo Proveedor</h3><button onClick={()=>setShowProvModal(false)}><X size={20} className="text-slate-400"/></button></div>
            <div className="p-6 space-y-4">
              {[{k:'name',l:'Nombre *',ph:'Distribuidora Moda S.A.S'},{k:'nit',l:'NIT',ph:'900.123.456-7'},{k:'phone',l:'Teléfono/WhatsApp',ph:'573001234567'},{k:'email',l:'Email',ph:'ventas@proveedor.com'}].map(({k,l,ph})=>(
                <div key={k}><label className="block text-sm font-medium text-slate-700 mb-1">{l}</label><input value={(provForm as any)[k]||''} onChange={e=>setProvForm((p:any)=>({...p,[k]:e.target.value}))} placeholder={ph} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
              ))}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={()=>setShowProvModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium text-sm">Cancelar</button>
              <button onClick={guardarProv} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50">{saving?'Guardando...':'Crear Proveedor'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ropa;
