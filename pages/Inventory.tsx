import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, X, Package, Upload, Image as ImageIcon, ChevronDown, List, Grid3x3, ArrowLeft, Zap, FileSpreadsheet, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { productService, Product } from '../services/productService';
import { useCompany } from '../hooks/useCompany';
import { supabase } from '../supabaseClient';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const EMPTY_PRODUCT = {
  company_id: '', name: '', sku: '', category: '', brand: '',
  description: '', price: 0, cost: 0, tax_rate: 19,
  stock_min: 5, stock_quantity: 0, type: 'STANDARD' as const, is_active: true,
  image_url: '',
};

const numVal = (val: number | undefined | null, fallback = 0): string => {
  const v = val ?? fallback;
  return v === 0 ? '' : String(v);
};

// ─────────────────────────────────────────────
// MODAL IMPORTAR EXCEL
// ─────────────────────────────────────────────
interface ImportRow {
  name: string; sku: string; barcode?: string; category?: string; brand?: string;
  description?: string; price: number; cost: number; stock_quantity?: number;
  stock_min?: number; tax_rate?: number; type?: string;
  _status?: 'pending' | 'ok' | 'error'; _error?: string;
}

const ImportModal: React.FC<{ companyId: string; onClose: () => void; onSuccess: () => void }> = ({ companyId, onClose, onSuccess }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ ok: 0, errors: 0 });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      let headerRow = 0;
      for (let i = 0; i < Math.min(5, raw.length); i++) {
        const r = (raw[i] || []).map((c: any) => String(c || '').toLowerCase());
        if (r.some((c: string) => c.includes('nombre') || c === 'name')) { headerRow = i; break; }
      }

      const headers = (raw[headerRow] || []).map((h: any) => String(h || '').toLowerCase().trim());
      const colMap: Record<string, number> = {};
      const fieldMap: Record<string, string[]> = {
        name: ['name', 'nombre'], sku: ['sku', 'código', 'codigo'],
        barcode: ['barcode', 'código de barras', 'codigo de barras', 'ean'],
        category: ['category', 'categoría', 'categoria'], brand: ['brand', 'marca'],
        description: ['description', 'descripción', 'descripcion'],
        price: ['price', 'precio venta', 'precio', 'precio de venta'], cost: ['cost', 'costo'],
        stock_quantity: ['stock_quantity', 'stock inicial', 'stock', 'cantidad'],
        stock_min: ['stock_min', 'stock mínimo', 'stock minimo', 'mínimo'],
        tax_rate: ['tax_rate', 'iva (%)', 'iva', 'impuesto'], type: ['type', 'tipo'],
      };
      Object.entries(fieldMap).forEach(([field, aliases]) => {
        const idx = headers.findIndex((h: string) => aliases.some(a => h.includes(a)));
        if (idx >= 0) colMap[field] = idx;
      });

      const parsed: ImportRow[] = [];
      // Saltamos fila de instrucciones (headerRow+2) pero también intentamos desde headerRow+1
      const startRow = headerRow + 1;
      for (let i = startRow; i < raw.length; i++) {
        const row = raw[i];
        if (!row || row.length === 0) continue;
        const nameVal = colMap['name'] !== undefined ? row[colMap['name']] : undefined;
        const skuVal = colMap['sku'] !== undefined ? row[colMap['sku']] : undefined;
        if (!nameVal || !skuVal) continue;
        // Saltar fila de instrucciones/ejemplo (detectar si parece instrucción)
        const nameStr = String(nameVal).trim();
        if (nameStr.startsWith('Ej:') || nameStr === 'Nombre *') continue;

        const get = (field: string) => colMap[field] !== undefined ? row[colMap[field]] : undefined;
        const num = (v: any) => parseFloat(String(v || '0').replace(/[^0-9.]/g, '')) || 0;
        const int = (v: any) => parseInt(String(v || '0').replace(/[^0-9]/g, '')) || 0;

        const item: ImportRow = {
          name: nameStr, sku: String(skuVal).trim(),
          barcode: get('barcode') ? String(get('barcode')).trim() : undefined,
          category: get('category') ? String(get('category')).trim() : undefined,
          brand: get('brand') ? String(get('brand')).trim() : undefined,
          description: get('description') ? String(get('description')).trim() : undefined,
          price: num(get('price')), cost: num(get('cost')),
          stock_quantity: int(get('stock_quantity')), stock_min: int(get('stock_min')),
          tax_rate: num(get('tax_rate')),
          type: get('type') ? String(get('type')).toUpperCase().trim() : 'PRODUCT',
          _status: 'pending',
        };
        if (!item.name) item._error = 'Nombre requerido';
        else if (!item.sku) item._error = 'SKU requerido';
        else if (!item.price || item.price <= 0) item._error = 'Precio inválido';
        else if (item.cost === undefined || item.cost < 0) item._error = 'Costo inválido';
        if (item._error) item._status = 'error';
        parsed.push(item);
      }
      setRows(parsed);
      setDone(false);
      setProgress(0);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!companyId || rows.length === 0) return;
    setImporting(true);
    let ok = 0; let errors = 0;
    const updated = [...rows];
    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      if (row._status === 'error') { errors++; continue; }
      try {
        // Buscar si ya existe un producto con ese SKU en esta empresa
        const { data: existing } = await supabase
          .from('products').select('id, stock_quantity')
          .eq('company_id', companyId).eq('sku', row.sku).maybeSingle();

        let error: any = null;
        if (existing) {
          // Ya existe: actualizar precio, costo y SUMAR stock
          const { error: e } = await supabase.from('products').update({
            name: row.name, price: row.price, cost: row.cost,
            category: row.category || null, brand: row.brand || null,
            description: row.description || null,
            barcode: row.barcode || null,
            stock_quantity: (existing.stock_quantity ?? 0) + (row.stock_quantity ?? 0),
            stock_min: row.stock_min ?? 0,
            tax_rate: row.tax_rate ?? 19,
          }).eq('id', existing.id);
          error = e;
        } else {
          // No existe: insertar nuevo
          const { error: e } = await supabase.from('products').insert({
            company_id: companyId, name: row.name, sku: row.sku,
            barcode: row.barcode || null, category: row.category || null,
            brand: row.brand || null, description: row.description || null,
            price: row.price, cost: row.cost,
            stock_quantity: row.stock_quantity ?? 0, stock_min: row.stock_min ?? 0,
            tax_rate: row.tax_rate ?? 19,
            type: row.type === 'SERVICE' ? 'SERVICE' : 'STANDARD',
            is_active: true,
          });
          error = e;
        }
        if (error) { updated[i]._status = 'error'; updated[i]._error = error.message; errors++; }
        else { updated[i]._status = 'ok'; ok++; }
      } catch (err: any) { updated[i]._status = 'error'; updated[i]._error = err.message; errors++; }
      setProgress(Math.round(((i + 1) / updated.length) * 100));
      setRows([...updated]);
    }
    setStats({ ok, errors });
    setDone(true);
    setImporting(false);
    if (ok > 0) { toast.success(`${ok} productos importados`); onSuccess(); }
    if (errors > 0) toast.error(`${errors} productos con errores`);
  };

  const validRows = rows.filter(r => r._status !== 'error');
  const errorRows = rows.filter(r => r._status === 'error');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-600">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><FileSpreadsheet size={20} /> Importar desde Excel</h2>
            <p className="text-blue-100 text-xs mt-0.5">Carga masiva de productos a tu inventario</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Descargar plantilla */}
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div>
              <p className="font-bold text-blue-800 text-sm">¿Primera vez?</p>
              <p className="text-blue-600 text-xs mt-0.5">Descarga la plantilla con el formato correcto</p>
            </div>
            <a href="/plantilla_inventario.xlsx" download
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
              <Download size={15} /> Plantilla Excel
            </a>
          </div>

          {/* Upload area */}
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
            <Upload size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-600 text-sm">Haz clic para seleccionar tu archivo Excel</p>
            <p className="text-slate-400 text-xs mt-1">Formato .xlsx o .xls</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </div>

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-green-600">{validRows.length}</p>
                  <p className="text-xs text-green-600 font-semibold">Listos</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-red-500">{errorRows.length}</p>
                  <p className="text-xs text-red-500 font-semibold">Con errores</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-600">{rows.length}</p>
                  <p className="text-xs text-slate-500 font-semibold">Total</p>
                </div>
              </div>

              {importing && (
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                    <span>Importando...</span><span>{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Vista previa</div>
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>{['', 'Nombre', 'SKU', 'Precio', 'Costo', 'Stock', 'Categoría'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-bold text-slate-500">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {rows.slice(0, 15).map((r, i) => (
                        <tr key={i} className={r._status === 'error' ? 'bg-red-50' : r._status === 'ok' ? 'bg-green-50' : ''}>
                          <td className="px-3 py-2">
                            {r._status === 'ok' && <CheckCircle size={13} className="text-green-500" />}
                            {r._status === 'error' && <span title={r._error}><AlertCircle size={13} className="text-red-500" /></span>}
                            {r._status === 'pending' && <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" />}
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-700 max-w-[140px] truncate">{r.name}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{r.sku}</td>
                          <td className="px-3 py-2 text-slate-600">${r.price?.toLocaleString('es-CO')}</td>
                          <td className="px-3 py-2 text-slate-600">${r.cost?.toLocaleString('es-CO')}</td>
                          <td className="px-3 py-2 text-slate-600">{r.stock_quantity}</td>
                          <td className="px-3 py-2 text-slate-500">{r.category || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 15 && (
                  <div className="bg-slate-50 px-4 py-2 text-xs text-slate-400 text-center">... y {rows.length - 15} más</div>
                )}
              </div>

              {errorRows.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="font-bold text-red-700 text-xs mb-1">⚠️ Productos con errores</p>
                  {errorRows.slice(0, 5).map((r, i) => (
                    <p key={i} className="text-xs text-red-600">• {r.name || 'Sin nombre'} — {r._error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t flex gap-3 bg-slate-50">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 text-sm">
            {done ? 'Cerrar' : 'Cancelar'}
          </button>
          {!done && rows.length > 0 && validRows.length > 0 && (
            <button onClick={handleImport} disabled={importing}
              className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-60 text-sm shadow-lg shadow-blue-200">
              {importing ? `Importando ${progress}%...` : `Importar ${validRows.length} productos`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
const Inventory: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { companyId } = useCompany();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'list' | 'category'>('list');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [showBarcodeNotification, setShowBarcodeNotification] = useState(false);

  const { isScanning } = useBarcodeScanner((barcode) => {
    const product = products.find(p => p.sku.toLowerCase() === barcode.toLowerCase());
    if (product) {
      setScannedProduct(product); setShowBarcodeNotification(true);
      openEdit(product); setTimeout(() => setShowBarcodeNotification(false), 3000);
    } else { toast.error(`Producto con SKU "${barcode}" no encontrado`); }
  });

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try { setProducts(await productService.getAll(companyId)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [companyId]);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_PRODUCT, company_id: companyId || '' }); setShowModal(true); };
  const openEdit = (p: Product) => { setEditing(p); setForm({ ...p } as any); setShowModal(true); };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const validTypes = ['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif'];
    const isValidByType = validTypes.includes(file.type.toLowerCase());
    const isValidByExt = /\.(jpg|jpeg|png|webp|gif|heic|heif|avif)$/i.test(file.name);
    if (!isValidByType && !isValidByExt) { toast.error('Solo se permiten imágenes'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen no puede superar 5MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${companyId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
      setForm((prev: any) => ({ ...prev, image_url: data.publicUrl }));
      toast.success('Imagen subida correctamente');
    } catch (err: any) { toast.error('Error al subir imagen: ' + err.message); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleSave = async () => {
    if (!form.name || !form.sku) { toast.error('Nombre y SKU son requeridos'); return; }
    setSaving(true);
    try {
      if (editing?.id) { await productService.update(editing.id, form); toast.success('Producto actualizado'); }
      else { await productService.create({ ...form, company_id: companyId! }); toast.success('Producto creado'); }
      setShowModal(false); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;
    try { await productService.delete(id); toast.success('Eliminado'); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const filtered = products.filter(p => {
    if (p.type !== 'SERVICE' && (p.stock_quantity ?? 0) <= 0) return false;
    return (
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const groupedByCategory = filtered.reduce((acc, product) => {
    const category = product.category || 'Sin Categoría';
    if (!acc[category]) acc[category] = [];
    acc[category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm((prev: any) => ({ ...prev, [k]: val }));
  };

  const handleNumChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setForm((prev: any) => ({ ...prev, [key]: raw === '' ? 0 : parseFloat(raw) || 0 }));
  };

  const ProductRow = ({ p }: { p: Product }) => (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        {(p as any).image_url ? (
          <img src={(p as any).image_url} alt={p.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200" />
        ) : (
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><Package size={16} className="text-slate-400" /></div>
        )}
      </td>
      <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.sku}</td>
      <td className="px-4 py-3 text-slate-500">{p.category || '—'}</td>
      <td className="px-4 py-3 font-semibold text-slate-800">{formatMoney(p.price)}</td>
      <td className="px-4 py-3 text-slate-500">{formatMoney(p.cost)}</td>
      <td className="px-4 py-3">
        <span className={`font-bold ${(p.stock_quantity||0) <= (p.stock_min||5) ? 'text-red-600' : 'text-green-600'}`}>{p.stock_quantity ?? 0}</span>
      </td>
      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{p.type}</span></td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={() => openEdit(p)} className="text-blue-600 hover:text-blue-800"><Edit2 size={15} /></button>
          <button onClick={() => handleDelete(p.id!)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
        </div>
      </td>
    </tr>
  );

  const ProductCard = ({ p }: { p: Product }) => (
    <div className="bg-white rounded-lg border border-slate-200 hover:shadow-lg hover:border-blue-300 transition-all overflow-hidden group">
      <div className="relative h-40 bg-slate-100 overflow-hidden">
        {(p as any).image_url ? (
          <img src={(p as any).image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Package size={32} className="text-slate-300" /></div>
        )}
        <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-semibold ${(p.stock_quantity||0) <= (p.stock_min||5) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          Stock: {p.stock_quantity ?? 0}
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <h4 className="font-semibold text-slate-900 line-clamp-2 text-sm">{p.name}</h4>
          <p className="text-xs text-slate-500 font-mono mt-1">{p.sku}</p>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between items-center"><span className="text-xs text-slate-500">Precio:</span><span className="font-bold text-blue-600">{formatMoney(p.price)}</span></div>
          <div className="flex justify-between items-center"><span className="text-xs text-slate-500">Costo:</span><span className="text-xs text-slate-600">{formatMoney(p.cost)}</span></div>
        </div>
        <div className="flex gap-1 pt-2">
          <span className="px-2 py-1 rounded text-xs bg-slate-100 text-slate-600 flex-1 text-center">{p.type}</span>
          {p.category && <span className="px-2 py-1 rounded text-xs bg-blue-50 text-blue-600 flex-1 text-center truncate">{p.category}</span>}
        </div>
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button onClick={() => openEdit(p)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors"><Edit2 size={14} /> Editar</button>
          <button onClick={() => handleDelete(p.id!)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors"><Trash2 size={14} /> Eliminar</button>
        </div>
      </div>
    </div>
  );

  const CategoryCard = ({ category, count }: { category: string; count: number }) => (
    <button onClick={() => setSelectedCategory(category)}
      className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl p-6 hover:shadow-lg hover:scale-105 transition-all text-left group">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{category}</h3>
          <p className="text-sm text-slate-600 mt-1">{count} producto{count !== 1 ? 's' : ''}</p>
        </div>
        <Package size={40} className="text-blue-300 group-hover:text-blue-400 transition-colors" />
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Inventario</h2>
          <p className="text-slate-500">Gestión de productos y stock</p>
        </div>
        <div className="flex gap-2">
          {/* BOTÓN IMPORTAR EXCEL */}
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
            <FileSpreadsheet size={16} /> Importar Excel
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
            <Plus size={16} /> Nuevo Producto
          </button>
          {scannedProduct && showBarcodeNotification && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border-2 border-green-400 rounded-lg">
              <span className="text-sm font-medium text-green-700">✓ {scannedProduct.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, SKU o categoría..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
      </div>

      {isScanning && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-2 border-blue-400 rounded-lg animate-pulse">
          <Zap size={16} className="text-blue-600 animate-spin" />
          <span className="text-sm font-medium text-blue-600">Escaneando...</span>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => { setViewMode('list'); setSelectedCategory(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
          <List size={16} /> Vista Lista
        </button>
        <button onClick={() => { setViewMode('category'); setSelectedCategory(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${viewMode === 'category' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
          <Grid3x3 size={16} /> Por Categoría
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Cargando productos...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay productos. Crea el primero o importa desde Excel.</p>
          </div>
        ) : viewMode === 'list' ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Foto','Producto','SKU','Categoría','Precio','Costo','Stock','Tipo',''].map(h => (
                <th key={h} className="px-4 py-4 font-semibold text-slate-700">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => <ProductRow key={p.id} p={p} />)}
            </tbody>
          </table>
        ) : selectedCategory ? (
          <div className="p-6 space-y-6">
            <button onClick={() => setSelectedCategory(null)} className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-800 font-medium text-sm hover:bg-blue-50 rounded-lg transition-colors">
              <ArrowLeft size={16} /> Volver a Categorías
            </button>
            <div className="border-b-2 border-slate-200 pb-4">
              <h3 className="text-2xl font-bold text-slate-900">{selectedCategory}</h3>
              <p className="text-slate-500 mt-1">{groupedByCategory[selectedCategory]?.length || 0} productos</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(groupedByCategory[selectedCategory] || []).map(p => <ProductCard key={p.id} p={p} />)}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Object.entries(groupedByCategory).map(([category, products]) => (
                <CategoryCard key={category} category={category} count={products.length} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL IMPORTAR */}
      {showImport && companyId && (
        <ImportModal
          companyId={companyId}
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load(); }}
        />
      )}

      {/* MODAL CREAR/EDITAR */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h3 className="text-lg font-bold">{editing ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Foto del Producto</label>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50 flex-shrink-0">
                      {(form as any).image_url ? <img src={(form as any).image_url} alt="preview" className="w-full h-full object-cover" /> : <ImageIcon size={28} className="text-slate-300" />}
                    </div>
                    <div className="flex-1 space-y-2">
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-blue-400 transition-all disabled:opacity-50">
                        {uploading ? <><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Subiendo...</> : <><Upload size={16} /> Subir imagen</>}
                      </button>
                      {(form as any).image_url && (
                        <button type="button" onClick={() => setForm((prev: any) => ({ ...prev, image_url: '' }))}
                          className="w-full px-4 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg border border-red-200">Quitar imagen</button>
                      )}
                      <p className="text-xs text-slate-400">JPG, PNG, WEBP, HEIF · Max 5MB</p>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={handleImageUpload} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                  <input value={form.name} onChange={f('name')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SKU *</label>
                  <input value={form.sku} onChange={f('sku')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                  <select value={form.type} onChange={f('type')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="STANDARD">Estándar</option>
                    <option value="SERIALIZED">Serializado</option>
                    <option value="SERVICE">Servicio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Precio Venta</label>
                  <input type="number" min="0" value={numVal(form.price)} onChange={handleNumChange('price')} placeholder="0" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo</label>
                  <input type="number" min="0" value={numVal(form.cost)} onChange={handleNumChange('cost')} placeholder="0" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                  <input value={form.category || ''} onChange={f('category')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Marca</label>
                  <input value={(form as any).brand || ''} onChange={f('brand')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock Inicial</label>
                  <input type="number" min="0" value={numVal(form.stock_quantity)} onChange={handleNumChange('stock_quantity')} placeholder="0" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stock Mínimo</label>
                  <input type="number" min="0" value={numVal(form.stock_min, 5)} onChange={handleNumChange('stock_min')} placeholder="5" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                  <textarea value={form.description || ''} onChange={f('description')} rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving || uploading} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;