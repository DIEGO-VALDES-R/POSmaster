import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, X, Package, Upload, Image as ImageIcon, ChevronDown, List, Grid3x3, ArrowLeft, Zap, FileSpreadsheet, Download, CheckCircle, AlertCircle, Truck, Phone, Mail, AlertTriangle, ShoppingCart } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { productService, Product } from '../services/productService';
import { useCompany } from '../hooks/useCompany';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
const EMPTY_PRODUCT = {
  company_id: '', name: '', sku: '', category: '', brand: '',
  description: '', price: 0, cost: 0, tax_rate: 19,
  stock_min: 5, stock_quantity: 0, type: 'STANDARD' as const, is_active: true,
  image_url: '', supplier_id: '', business_context: 'general',
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
  supplier_name?: string;
  _status?: 'pending' | 'ok' | 'error'; _error?: string;
}

const ImportModal: React.FC<{ companyId: string; branchId: string | null; suppliers: Supplier[]; onClose: () => void; onSuccess: () => void }> = ({ companyId, branchId, suppliers, onClose, onSuccess }) => {
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
        supplier: ['supplier', 'proveedor', 'supplier_name'],
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
          supplier_name: get('supplier') ? String(get('supplier')).trim() : undefined,
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

  // Cache de proveedores creados durante la importación (nombre → id)
  const supplierCache: Record<string, string> = {};

  const resolveSupplier = async (name: string): Promise<string | null> => {
    if (!name) return null;
    const key = name.toLowerCase();
    if (supplierCache[key]) return supplierCache[key];
    // Buscar existente
    const existing = suppliers.find(s => s.name.toLowerCase() === key);
    if (existing) { supplierCache[key] = existing.id; return existing.id; }
    // Crear nuevo
    const { data, error } = await supabase.from('suppliers')
      .insert({ company_id: companyId, name, products_supplied: '' })
      .select('id').single();
    if (error || !data) return null;
    supplierCache[key] = data.id;
    return data.id;
  };

  const handleImport = async () => {
    if (!companyId || rows.length === 0) return;
    setImporting(true);
    let ok = 0; let errors = 0;
    const updated = [...rows];
    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      if (row._status === 'error') { errors++; continue; }
      const supplier_id = row.supplier_name ? await resolveSupplier(row.supplier_name) : null;
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
            ...(supplier_id ? { supplier_id } : {}),
          }).eq('id', existing.id);
          error = e;
        } else {
          // No existe: insertar nuevo
          const { error: e } = await supabase.from('products').insert({
            company_id: companyId, branch_id: branchId || null, name: row.name, sku: row.sku,
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
                          <td className="px-3 py-2 text-slate-500">{r.supplier_name || '—'}</td>
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
// INTERFAZ PROVEEDOR
// ─────────────────────────────────────────────
interface Supplier {
  id: string;
  company_id: string;
  name: string;
  nit?: string;
  phone?: string;
  email?: string;
  products_supplied?: string;
  balance?: number;
  notes?: string;
}

const EMPTY_SUPPLIER: Omit<Supplier, 'id' | 'company_id'> = {
  name: '', nit: '', phone: '', email: '', products_supplied: '', balance: 0, notes: '',
};

// ─────────────────────────────────────────────
// MODAL STOCK BAJO
// ─────────────────────────────────────────────
const LowStockModal: React.FC<{
  products: Product[];
  suppliers: Supplier[];
  onClose: () => void;
  onGoInventory: () => void;
}> = ({ products, suppliers, onClose, onGoInventory }) => {
  const lowStock = products.filter(p => p.type !== 'SERVICE' && (p.stock_quantity ?? 0) <= (p.stock_min ?? 5));
  const [orderSupplier, setOrderSupplier] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [showOrder, setShowOrder] = useState(false);

  const handleCreateOrder = () => {
    if (!orderSupplier) { toast.error('Selecciona un proveedor'); return; }
    const supplier = suppliers.find(s => s.id === orderSupplier);
    const items = lowStock.map(p => `• ${p.name} (SKU: ${p.sku}) — Actual: ${p.stock_quantity ?? 0} / Mínimo: ${p.stock_min ?? 5}`).join('\n');
    const msg = encodeURIComponent(`Hola ${supplier?.name}, necesitamos reponer:\n\n${items}${orderNote ? `\n\nNota: ${orderNote}` : ''}`);
    if (supplier?.phone) window.open(`https://wa.me/${supplier.phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
    else if (supplier?.email) window.open(`mailto:${supplier.email}?subject=Orden de reposición&body=${decodeURIComponent(msg)}`, '_blank');
    else toast.error('El proveedor no tiene teléfono ni email');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex justify-between items-center bg-gradient-to-r from-red-500 to-orange-500">
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} className="text-white" />
            <div>
              <h2 className="text-lg font-bold text-white">⚠️ Alerta de Stock Bajo</h2>
              <p className="text-red-100 text-xs mt-0.5">{lowStock.length} producto{lowStock.length !== 1 ? 's' : ''} por debajo del mínimo</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={22} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {lowStock.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                {(p as any).image_url
                  ? <img src={(p as any).image_url} alt={p.name} className="w-10 h-10 object-cover rounded-lg border border-red-200" />
                  : <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><Package size={16} className="text-red-400" /></div>}
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{p.name}</p>
                  <p className="text-xs text-slate-500 font-mono">{p.sku} · {p.category || 'Sin categoría'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Actual / Mínimo</p>
                <p className="font-bold">
                  <span className="text-red-600 text-lg">{p.stock_quantity ?? 0}</span>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className="text-slate-600">{p.stock_min ?? 5}</span>
                </p>
              </div>
            </div>
          ))}
          {suppliers.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button onClick={() => setShowOrder(!showOrder)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2 font-semibold text-slate-700 text-sm">
                  <ShoppingCart size={16} className="text-blue-500" /> Crear orden a proveedor
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${showOrder ? 'rotate-180' : ''}`} />
              </button>
              {showOrder && (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedor</label>
                    <select value={orderSupplier} onChange={e => setOrderSupplier(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Seleccionar proveedor...</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nota adicional (opcional)</label>
                    <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} rows={2}
                      placeholder="Ej: Urgente, necesitamos para el lunes..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  </div>
                  <button onClick={handleCreateOrder}
                    className="w-full py-2.5 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 flex items-center justify-center gap-2">
                    <ShoppingCart size={15} /> Enviar orden por WhatsApp / Email
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="p-5 border-t flex gap-3 bg-slate-50">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 text-sm">Cerrar</button>
          <button onClick={() => { onClose(); onGoInventory(); }}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 text-sm flex items-center justify-center gap-2">
            <Package size={15} /> Ir a Inventario
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// TAB PROVEEDORES
// ─────────────────────────────────────────────
const SuppliersTab: React.FC<{ companyId: string }> = ({ companyId }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Omit<Supplier, 'id' | 'company_id'>>(EMPTY_SUPPLIER);
  const [saving, setSaving] = useState(false);
  const { formatMoney } = useCurrency();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').eq('company_id', companyId).order('name');
    setSuppliers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_SUPPLIER }); setShowModal(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setForm({ ...s }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        const { error } = await supabase.from('suppliers').update(form).eq('id', editing.id);
        if (error) throw error;
        toast.success('Proveedor actualizado');
      } else {
        const { error } = await supabase.from('suppliers').insert({ ...form, company_id: companyId });
        if (error) throw error;
        toast.success('Proveedor creado');
      }
      setShowModal(false); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este proveedor?')) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Proveedor eliminado'); load();
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.nit || '').includes(search) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
          <Plus size={16} /> Nuevo Proveedor
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Cargando proveedores...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Truck size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay proveedores registrados. Agrega el primero.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Proveedor','NIT','Contacto','Productos que suministra','Saldo / Deuda',''].map(h => (
                <th key={h} className="px-4 py-4 font-semibold text-slate-700">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center"><Truck size={16} className="text-indigo-500" /></div>
                      <span className="font-semibold text-slate-800">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.nit || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {s.phone && <div className="flex items-center gap-1 text-xs text-slate-600"><Phone size={11} />{s.phone}</div>}
                      {s.email && <div className="flex items-center gap-1 text-xs text-slate-600"><Mail size={11} />{s.email}</div>}
                      {!s.phone && !s.email && <span className="text-slate-400 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{s.products_supplied || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold text-sm ${(s.balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatMoney(s.balance || 0)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {s.phone && (
                        <a href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-green-500 hover:text-green-700" title="WhatsApp">
                          <Phone size={15} />
                        </a>
                      )}
                      <button onClick={() => openEdit(s)} className="text-blue-600 hover:text-blue-800"><Edit2 size={15} /></button>
                      <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h3 className="text-lg font-bold">{editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Razón Social *</label>
                  <input value={form.name} onChange={f('name')} placeholder="Ej: Distribuidora ABC S.A.S"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">NIT / RUT</label>
                  <input value={form.nit || ''} onChange={f('nit')} placeholder="900.123.456-7"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono / WhatsApp</label>
                  <input value={form.phone || ''} onChange={f('phone')} placeholder="573001234567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" value={form.email || ''} onChange={f('email')} placeholder="ventas@proveedor.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Productos que suministra</label>
                  <input value={form.products_supplied || ''} onChange={f('products_supplied')} placeholder="Ej: iPhone, Samsung, Accesorios"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Saldo / Deuda pendiente</label>
                  <input type="number" min="0" value={form.balance || ''} onChange={e => setForm(p => ({ ...p, balance: parseFloat(e.target.value) || 0 }))} placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                  <textarea value={form.notes || ''} onChange={f('notes')} rows={2} placeholder="Observaciones adicionales..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
const Inventory: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { companyId } = useCompany();
  const { company, branchId } = useDatabase();

  // Detectar tipo de negocio para adaptar etiquetas y mensajes
  const cfg = (company?.config as any) || {};
  const businessTypes: string[] = Array.isArray(cfg.business_types)
    ? cfg.business_types
    : cfg.business_type ? [cfg.business_type] : ['general'];
  const isRestaurante  = businessTypes.some(t => ['restaurante', 'restaurant', 'cocina', 'cafeteria'].includes(t));
  const isZapateria    = businessTypes.includes('zapateria');
  const isSalon        = businessTypes.some(t => ['salon', 'salón', 'belleza'].includes(t));
  const isFarmacia     = businessTypes.includes('farmacia');
  const isVeterinaria  = businessTypes.includes('veterinaria');
  const isOdontologia  = businessTypes.includes('odontologia');
  // Negocios con módulo propio que no usan el inventario genérico para vender
  const hasOwnInventory = isFarmacia; // Farmacia tiene pharma_medications
  const isServiceOnly   = isVeterinaria || isOdontologia; // Solo servicios, sin inventario físico propio

  // Contexto activo: qué tipo de insumos/productos pertenecen a este negocio
  const currentBusinessContext =
    isRestaurante ? 'restaurante' :
    isZapateria   ? 'zapateria'   :
    isSalon       ? 'salon'       :
    isFarmacia    ? 'farmacia'    :
    isVeterinaria ? 'veterinaria' :
    isOdontologia ? 'odontologia' :
    'general';

  const inventoryLabel =
    isRestaurante  ? '🥣 Insumos de Cocina'       :
    isZapateria    ? '🧵 Materiales e Insumos'      :
    isSalon        ? '💆 Insumos del Salón'         :
    isFarmacia     ? '🧴 Insumos y Materiales'      :
    isVeterinaria  ? '🧪 Insumos y Materiales Vet'  :
    isOdontologia  ? '🧪 Insumos y Materiales Dental' :
    '📦 Inventario de Productos';

  const inventoryDescription =
    isRestaurante  ? 'Ingredientes e insumos de cocina. Los platos y bebidas del menú se administran en Display Cocina.' :
    isZapateria    ? 'Materiales, pegantes, tintes e insumos para el taller.' :
    isSalon        ? 'Tintes, cremas, productos químicos e insumos del salón.' :
    isFarmacia     ? 'Insumos no-farmacológicos: bolsas, guantes, tapabocas, elementos de aseo, etc. Los medicamentos se gestionan en el módulo Farmacia.' :
    isVeterinaria  ? 'Materiales y suministros del consultorio: guantes, jeringas, gasas, etc. Los servicios se gestionan en el módulo Veterinaria.' :
    isOdontologia  ? 'Materiales e insumos del consultorio: guantes, gasas, materiales dentales, etc. Los servicios se gestionan en el módulo Odontología.' :
    'Productos para la venta con control de stock, precios y proveedores.';
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
  const [activeTab, setActiveTab] = useState<'products' | 'suppliers'>('products');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showLowStock, setShowLowStock] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Mostrar alerta de stock bajo UNA SOLA VEZ mientras la página esté abierta
  // sessionStorage se limpia al cerrar/recargar la pestaña
  useEffect(() => {
    if (!loading && products.length > 0) {
      if (sessionStorage.getItem('lowStockShown')) return;
      const hasLow = products.some(p => p.type !== 'SERVICE' && (p.stock_quantity ?? 0) <= (p.stock_min ?? 5));
      if (hasLow) { setShowLowStock(true); sessionStorage.setItem('lowStockShown', '1'); }
    }
  }, [loading, products]);

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
    try {
      setProducts(await productService.getAll(companyId));
      const { data: sups } = await supabase.from('suppliers').select('*').eq('company_id', companyId).order('name');
      setSuppliers(sups || []);
    }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [companyId]);

  const loadSuppliers = async () => {
    if (!companyId) return;
    const { data } = await supabase.from('suppliers').select('*').eq('company_id', companyId).order('name');
    setSuppliers(data || []);
  };

  const openCreate = () => {
    loadSuppliers();
    setEditing(null);
    setForm({ ...EMPTY_PRODUCT, company_id: companyId || '', business_context: currentBusinessContext });
    setShowModal(true);
  };
  const openEdit = (p: Product) => {
    loadSuppliers();
    setEditing(p); setForm({ ...p } as any); setShowModal(true);
  };

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
      const productData = { ...form, supplier_id: (form as any).supplier_id || null, branch_id: branchId || null };
      if (editing?.id) { await productService.update(editing.id, productData); toast.success('Producto actualizado'); }
      else { await productService.create({ ...productData, company_id: companyId! }); toast.success('Producto creado'); }
      setShowModal(false); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;
    try { await productService.delete(id); toast.success('Eliminado'); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id!)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} producto${selectedIds.size > 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return;
    let ok = 0;
    for (const id of Array.from(selectedIds)) {
      try { await productService.delete(id); ok++; } catch {}
    }
    toast.success(`${ok} producto${ok > 1 ? 's' : ''} eliminado${ok > 1 ? 's' : ''}`);
    setSelectedIds(new Set());
    load();
  };

  const filtered = products.filter(p => {
    // Filtrar por contexto de negocio:
    // - Productos con business_context NULL o 'general' son visibles en negocios 'general'
    // - Para otros tipos, solo mostrar los del mismo contexto
    const ctx = (p as any).business_context || 'general';
    const contextMatch = currentBusinessContext === 'general'
      ? ctx === 'general'
      : ctx === currentBusinessContext || ctx === 'general' && false; // estricto: solo el propio contexto
    if (!contextMatch) return false;

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

  const ProductRow = ({ p }: { p: Product }) => {
    const supplier = suppliers.find(s => s.id === (p as any).supplier_id);
    const isChecked = selectedIds.has(p.id!);
    return (
      <tr className={`hover:bg-slate-50 ${isChecked ? 'bg-blue-50' : ''}`}>
        <td className="px-3 py-3">
          <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(p.id!)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
        </td>
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
        <td className="px-4 py-3 text-xs">
          {supplier ? (
            <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-medium whitespace-nowrap">{supplier.name}</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <button onClick={() => openEdit(p)} className="text-blue-600 hover:text-blue-800"><Edit2 size={15} /></button>
            <button onClick={() => handleDelete(p.id!)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
          </div>
        </td>
      </tr>
    );
  };

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

  const lowStockCount = products.filter(p => p.type !== 'SERVICE' && (p.stock_quantity ?? 0) <= (p.stock_min ?? 5)).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{inventoryLabel}</h2>
          <p className="text-slate-500 text-sm max-w-xl">{inventoryDescription}</p>
        </div>
        <div className="flex gap-2">
          {lowStockCount > 0 && (
            <button onClick={() => setShowLowStock(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-100 font-medium text-sm animate-pulse">
              <AlertTriangle size={16} /> {lowStockCount} bajo mínimo
            </button>
          )}
          {activeTab === 'products' && <>
          {/* BOTÓN IMPORTAR EXCEL */}
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
            <FileSpreadsheet size={16} /> Importar Excel
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
            <Plus size={16} /> {
              isRestaurante                      ? 'Nuevo Insumo' :
              isZapateria || isSalon             ? 'Nuevo Material' :
              isFarmacia                         ? 'Nuevo Insumo General' :
              isVeterinaria || isOdontologia     ? 'Nuevo Insumo' :
              'Nuevo Producto'
            }
          </button>
          {scannedProduct && showBarcodeNotification && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border-2 border-green-400 rounded-lg">
              <span className="text-sm font-medium text-green-700">✓ {scannedProduct.name}</span>
            </div>
          )}
          </>}
        </div>
      </div>

      {/* Banner contextual para tipos especiales */}
      {(isRestaurante || isFarmacia || isVeterinaria || isOdontologia) && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${
          isRestaurante ? 'bg-orange-50 border-orange-200' :
          isFarmacia    ? 'bg-teal-50 border-teal-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <span className="text-2xl">
            {isRestaurante ? '👨‍🍳' : isFarmacia ? '💊' : isVeterinaria ? '🐾' : '🦷'}
          </span>
          <div>
            <p className={`font-semibold text-sm ${
              isRestaurante ? 'text-orange-800' : isFarmacia ? 'text-teal-800' : 'text-blue-800'
            }`}>
              {isRestaurante ? 'Aquí van los insumos de cocina, no los platos del menú'  :
               isFarmacia    ? 'Aquí van insumos no-farmacológicos (bolsas, guantes, tapabocas...)' :
               isVeterinaria ? 'Aquí van materiales del consultorio (guantes, jeringas, gasas...)' :
                               'Aquí van materiales e insumos del consultorio dental'}
            </p>
            <p className={`text-xs mt-1 ${
              isRestaurante ? 'text-orange-600' : isFarmacia ? 'text-teal-600' : 'text-blue-600'
            }`}>
              {isRestaurante
                ? '👉 Los platos y bebidas se crean en Display Cocina → Menú / Bebidas.'
                : isFarmacia
                ? '👉 Los medicamentos con lotes, vencimientos y recetas se gestionan en el módulo Farmacia.'
                : isVeterinaria
                ? '👉 Los servicios, tarifas e historia clínica se gestionan en el módulo Veterinaria.'
                : '👉 Los servicios, tarifas e historia clínica se gestionan en el módulo Odontología.'}
            </p>
          </div>
        </div>
      )}

      {/* PESTAÑAS */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        <button onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'products' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Package size={16} /> {
            isRestaurante                    ? 'Insumos' :
            isZapateria || isSalon           ? 'Materiales' :
            isFarmacia                       ? 'Insumos generales' :
            isVeterinaria || isOdontologia   ? 'Insumos y Materiales' :
            'Productos'
          }
        </button>
        <button onClick={() => setActiveTab('suppliers')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'suppliers' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <Truck size={16} /> Proveedores
          {suppliers.length > 0 && <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">{suppliers.length}</span>}
        </button>
      </div>

      {activeTab === 'products' && (<>
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
          <>
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-200">
                <span className="text-sm font-semibold text-blue-700">{selectedIds.size} producto{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100">Cancelar</button>
                  <button onClick={handleBulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                    <Trash2 size={14} /> Eliminar {selectedIds.size}
                  </button>
                </div>
              </div>
            )}
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-4">
                  <input type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
                </th>
                {['Foto','Producto','SKU','Categoría','Precio','Costo','Stock','Tipo','Proveedor',''].map(h => (
                  <th key={h} className="px-4 py-4 font-semibold text-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => <ProductRow key={p.id} p={p} />)}
            </tbody>
          </table>
          </>
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

      </>)}

      {/* TAB PROVEEDORES */}
      {activeTab === 'suppliers' && companyId && <SuppliersTab companyId={companyId} />}

      {/* MODAL STOCK BAJO */}
      {showLowStock && (
        <LowStockModal products={products} suppliers={suppliers} onClose={() => setShowLowStock(false)} onGoInventory={() => setActiveTab('products')} />
      )}

      {/* MODAL IMPORTAR */}
      {showImport && companyId && (
        <ImportModal
          companyId={companyId}
          branchId={branchId}
          suppliers={suppliers}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Proveedor</label>
                  <select value={(form as any).supplier_id || ''} onChange={e => setForm((prev: any) => ({ ...prev, supplier_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Sin proveedor</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      Primero registra proveedores en la pestaña <strong>Proveedores</strong>
                    </p>
                  )}
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