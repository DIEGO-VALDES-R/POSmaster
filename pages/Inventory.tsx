import React, { useState, useEffect, useRef } from 'react';
import { VariantManager } from '../components/VariantManager';
import { Plus, Search, Edit2, Trash2, X, Package, Upload, Image as ImageIcon, ChevronDown, List, Grid3x3, ArrowLeft, Zap, FileSpreadsheet, Download, CheckCircle, AlertCircle, Truck, Phone, Mail, AlertTriangle, ShoppingCart, Scale, TrendingUp, Calculator, BarChart3, RefreshCw, ChevronRight, Tag } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { productService, Product } from '../services/productService';
import { useCompany } from '../hooks/useCompany';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';
import DescuentosModal from '../components/DescuentosModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const EMPTY_PRODUCT = {
  company_id: '', name: '', sku: '', category: '', brand: '',
  description: '', price: 0, cost: 0, tax_rate: 19,
  stock_min: 5, stock_quantity: 0, type: 'STANDARD' as const, is_active: true, has_variants: false,
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
  name: string; sku: string; barcode?: string; imei?: string; category?: string; brand?: string;
  description?: string; price: number; cost: number; stock_quantity?: number;
  stock_min?: number; tax_rate?: number; type?: string;
  supplier_name?: string;
  _status?: 'pending' | 'ok' | 'error'; _error?: string;
}

const ImportModal: React.FC<{ companyId: string; branchId: string | null; suppliers: Supplier[]; branches: {id: string; name: string}[]; onClose: () => void; onSuccess: () => void }> = ({ companyId, branchId, suppliers, branches, onClose, onSuccess }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ ok: 0, errors: 0 });
  const [updateStock, setUpdateStock] = useState(false);
  const [addToStock, setAddToStock]   = useState(false);
  const [updatePrices, setUpdatePrices] = useState(true);
  const [updateSupplier, setUpdateSupplier] = useState(true);
  const [newLotOnDiffSupplier, setNewLotOnDiffSupplier] = useState(false);
  const [registerAsCompra, setRegisterAsCompra] = useState(true);

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
        imei: ['imei', 'número imei', 'numero imei', 'imei/serial'],
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
      const startRow = headerRow + 1;
      for (let i = startRow; i < raw.length; i++) {
        const row = raw[i];
        if (!row || row.length === 0) continue;
        const nameVal = colMap['name'] !== undefined ? row[colMap['name']] : undefined;
        const skuVal = colMap['sku'] !== undefined ? row[colMap['sku']] : undefined;
        if (!nameVal || !skuVal) continue;
        const nameStr = String(nameVal).trim();
        if (nameStr.startsWith('Ej:') || nameStr === 'Nombre *') continue;

        const get = (field: string) => colMap[field] !== undefined ? row[colMap[field]] : undefined;
        const num = (v: any) => parseFloat(String(v || '0').replace(/[^0-9.]/g, '')) || 0;
        const int = (v: any) => parseInt(String(v || '0').replace(/[^0-9]/g, '')) || 0;

        const item: ImportRow = {
          name: nameStr, sku: String(skuVal).trim(),
          barcode: get('barcode') ? String(get('barcode')).trim() : undefined,
          imei: get('imei') ? String(get('imei')).trim() : undefined,
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

  const supplierCache: Record<string, string> = {};

  const resolveSupplier = async (name: string): Promise<string | null> => {
    if (!name?.trim()) return null;
    const cleanName = name.trim();
    const key = cleanName.toLowerCase();
    if (supplierCache[key]) return supplierCache[key];
    const existing = suppliers.find(s => s.name.trim().toLowerCase() === key);
    if (existing) { supplierCache[key] = existing.id; return existing.id; }
    const { data: found } = await supabase.from('suppliers')
      .select('id').eq('company_id', companyId).ilike('name', cleanName).maybeSingle();
    if (found) { supplierCache[key] = found.id; return found.id; }
    const { data, error } = await supabase.from('suppliers')
      .insert({ company_id: companyId, name: cleanName, products_supplied: '' })
      .select('id').single();
    if (error || !data) { console.warn('Error creando proveedor:', cleanName, error); return null; }
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
        // Lógica de duplicado:
        // - Con IMEI    → buscar SKU + IMEI   (mismo SKU + IMEI distinto = producto distinto → INSERT)
        // - Con Barcode → buscar SKU + Barcode (mismo SKU + barcode distinto = producto distinto → INSERT)
        // - Sin ninguno → buscar solo por SKU
        let existing: { id: string; stock_quantity: number } | null = null;

        if (row.imei) {
          const { data } = await supabase
            .from('products').select('id, stock_quantity')
            .eq('company_id', companyId).eq('sku', row.sku).eq('imei', row.imei).maybeSingle();
          existing = data;
        } else if (row.barcode) {
          const { data } = await supabase
            .from('products').select('id, stock_quantity')
            .eq('company_id', companyId).eq('sku', row.sku).eq('barcode', row.barcode).maybeSingle();
          existing = data;
        } else {
          const { data } = await supabase
            .from('products').select('id, stock_quantity')
            .eq('company_id', companyId).eq('sku', row.sku).maybeSingle();
          existing = data;
        }

        let error: any = null;
        if (existing) {
          if (newLotOnDiffSupplier && supplier_id && row.stock_quantity && row.stock_quantity > 0) {
            const existingFull = await supabase.from('products')
              .select('supplier_id').eq('id', existing.id).single();
            const existingSupplier = existingFull.data?.supplier_id;
            const isDifferentSupplier = existingSupplier && existingSupplier !== supplier_id;
            if (isDifferentSupplier) {
              const supplierObj = suppliers.find(s => s.id === supplier_id);
              const suffix = (supplierObj?.name || 'LOTE').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
              let newSku = `${row.sku}-${suffix}`;
              const { data: skuCheck } = await supabase.from('products')
                .select('id').eq('company_id', companyId).eq('sku', newSku).maybeSingle();
              if (skuCheck) newSku = `${newSku}-${Date.now().toString().slice(-4)}`;
              const { error: e } = await supabase.from('products').insert({
                company_id: companyId, branch_id: branchId || null,
                name: row.name, sku: newSku,
                barcode: null, imei: null, category: row.category || null,
                brand: row.brand || null, description: row.description || null,
                price: row.price, cost: row.cost,
                stock_quantity: row.stock_quantity ?? 0, stock_min: row.stock_min ?? 0,
                tax_rate: row.tax_rate ?? 19, type: 'STANDARD', is_active: true,
                supplier_id,
              });
              error = e;
              if (!e) updated[i]._status = 'ok';
              else { updated[i]._status = 'error'; updated[i]._error = e.message; errors++; }
              setProgress(Math.round(((i + 1) / updated.length) * 100));
              setRows([...updated]);
              if (!e) ok++;
              continue;
            }
          }
          const updatePayload: any = {
            name: row.name,
            category: row.category || null,
            brand: row.brand || null,
            description: row.description || null,
            barcode: row.barcode || null,
            imei: row.imei || null,
          };
          if (updatePrices) {
            updatePayload.price = row.price;
            updatePayload.cost = row.cost;
            updatePayload.tax_rate = row.tax_rate ?? 19;
            updatePayload.stock_min = row.stock_min ?? 0;
          }
          if (updateStock) {
            updatePayload.stock_quantity = row.stock_quantity ?? 0;
          }
          if (addToStock && !updateStock) {
            updatePayload.stock_quantity = (existing.stock_quantity || 0) + (row.stock_quantity ?? 0);
          }
          if (updateSupplier && supplier_id) {
            updatePayload.supplier_id = supplier_id;
          }
          const { error: e } = await supabase.from('products').update(updatePayload).eq('id', existing.id);
          error = e;
          if (!e && registerAsCompra && (addToStock || updateStock) && (row.stock_quantity ?? 0) > 0) {
            await supabase.from('inventory_movements').insert({
              company_id:     companyId,
              branch_id:      branchId || null,
              product_id:     existing.id,
              type:           'COMPRA',
              quantity:       row.stock_quantity ?? 0,
              unit_cost:      row.cost || 0,
              total_cost:     (row.stock_quantity ?? 0) * (row.cost || 0),
              reference_type: 'excel_import',
              notes:          `Importación Excel — ${row.supplier_name ? 'Proveedor: ' + row.supplier_name : 'sin proveedor'}`,
            });
          }
        } else {
          const { data: inserted, error: e } = await supabase.from('products').insert({
            company_id: companyId, branch_id: branchId || null, name: row.name, sku: row.sku,
            barcode: row.barcode || null, imei: row.imei || null, category: row.category || null,
            brand: row.brand || null, description: row.description || null,
            price: row.price, cost: row.cost,
            stock_quantity: row.stock_quantity ?? 0, stock_min: row.stock_min ?? 0,
            tax_rate: row.tax_rate ?? 19,
            type: row.type === 'SERVICE' ? 'SERVICE' : 'STANDARD',
            is_active: true,
            ...(supplier_id ? { supplier_id } : {}),
          }).select('id').single();
          error = e;
          if (!e && registerAsCompra && inserted?.id && (row.stock_quantity ?? 0) > 0) {
            await supabase.from('inventory_movements').insert({
              company_id:     companyId,
              branch_id:      branchId || null,
              product_id:     inserted.id,
              type:           'COMPRA',
              quantity:       row.stock_quantity ?? 0,
              unit_cost:      row.cost || 0,
              total_cost:     (row.stock_quantity ?? 0) * (row.cost || 0),
              reference_type: 'excel_import',
              notes:          `Importación Excel — stock inicial${row.supplier_name ? ' · Proveedor: ' + row.supplier_name : ''}`,
            });
          }
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
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div>
              <p className="font-bold text-blue-800 text-sm">¿Primera vez?</p>
              <p className="text-blue-600 text-xs mt-0.5">Descarga la plantilla con el formato correcto</p>
            </div>
            <button onClick={() => {
              const wb = XLSX.utils.book_new();
              const headers = ['Nombre *','SKU *','Código de Barras','IMEI','Categoría','Marca','Descripción','Precio Venta *','Costo *','Stock Inicial','Stock Mínimo','IVA (%)','Tipo','Proveedor','Sede','Fecha Creación'];
              const branchNames = branches.map(b => b.name).join(' | ') || 'Sede Principal';
              const examples = [
                ['Camiseta Azul M','CAM-AZ-M','','','CAMISETAS','BRAND','Camiseta algodón talla M','35000','18000','10','2','19','STANDARD','Distribuidora XYZ','Sede Principal'],
                ['Pantalla Samsung A11','SKU-001','7890123456789','351234567890123','PANTALLAS','SAMSUNG','Pantalla original','45000','30000','4','1','19','STANDARD','Samsung Colombia','Sede Principal'],
                ['Servicio Técnico','SERV-01','','','SERVICIOS','','Diagnóstico y reparación','50000','0','0','0','0','SERVICE','','Sede Principal'],
              ];
              const notes = [
                ['💡 INSTRUCCIONES:'],
                ['• Campos con * son obligatorios'],
                ['• Tipo: STANDARD (normal) o SERVICE (servicio sin stock)'],
                ['• Código de Barras: EAN/UPC del producto (se puede leer con pistola de barras)'],
                ['• IMEI: número IMEI del equipo (solo para celulares/tablets serializados)'],
                ['• Proveedor: escribe el nombre exactamente — se crea automáticamente si no existe'],
                ['• IVA: escribe solo el número (19, 5, 0)'],
                ['• Stock Inicial: cantidad en bodega al importar'],
                [`• Sede: escribe el nombre exacto de la sede. Opciones disponibles: ${branchNames}`],
              ];
              const wsData = [headers, ...examples, [], ...notes];
              const ws = XLSX.utils.aoa_to_sheet(wsData);
              ws['!cols'] = headers.map((_h, i) => ({ wch: [28,14,18,16,16,14,28,14,10,13,13,8,10,22,20,16][i] || 16 }));
              XLSX.utils.book_append_sheet(wb, ws, 'Productos');
              const supHeaders = ['Nombre del Proveedor','NIT','Teléfono','Email'];
              const supExamples = [
                ['Distribuidora XYZ','900123456-1','3001234567','ventas@xyz.com'],
                ['Samsung Colombia','800654321-0','6017654321',''],
              ];
              const supNotes = [[''],['💡 Esta hoja es de referencia — los proveedores de la columna "Proveedor" en la hoja Productos se crean automáticamente.']];
              const wsProveedores = XLSX.utils.aoa_to_sheet([supHeaders, ...supExamples, ...supNotes]);
              wsProveedores['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 26 }];
              XLSX.utils.book_append_sheet(wb, wsProveedores, 'Proveedores (referencia)');
              XLSX.writeFile(wb, 'plantilla_inventario_POSmaster.xlsx');
            }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
              <Download size={15} /> Plantilla Excel
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">¿Qué hacer con productos que ya existen?</p>
            {[
              { key: 'updatePrices', state: updatePrices, set: setUpdatePrices, label: 'Actualizar precio, costo e IVA', desc: 'Sobreescribe los precios actuales con los del Excel', recommended: true },
              { key: 'addToStock',   state: addToStock,   set: setAddToStock,   label: 'Sumar al stock existente', desc: 'Ej: tienes 10 unidades y el Excel trae 20 → queda en 30', recommended: true },
              { key: 'updateStock',  state: updateStock,  set: setUpdateStock,  label: 'Reemplazar stock', desc: 'Establece el stock exacto del Excel (útil para conteo físico)', recommended: false },
              { key: 'updateSupplier', state: updateSupplier, set: setUpdateSupplier, label: 'Actualizar proveedor', desc: 'Asigna o cambia el proveedor según la columna "Proveedor"', recommended: true },
              { key: 'newLotOnDiffSupplier', state: newLotOnDiffSupplier, set: setNewLotOnDiffSupplier, label: 'Nuevo lote si proveedor diferente', desc: 'Ej: 20 Samsung de Juan + 10 Samsung de Diego → dos líneas separadas en inventario', recommended: false },
            ].map(opt => (
              <button key={opt.key} type="button"
                onClick={() => {
                  if (opt.key === 'addToStock' && !opt.state) setUpdateStock(false);
                  if (opt.key === 'updateStock' && !opt.state) setAddToStock(false);
                  if (opt.key === 'newLotOnDiffSupplier' && !opt.state) setUpdateSupplier(true);
                  opt.set(!opt.state);
                }}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border transition-colors text-left ${opt.state ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${opt.state ? 'bg-blue-600' : 'bg-white border-2 border-slate-300'}`}>
                  {opt.state && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-xs font-semibold ${opt.state ? 'text-blue-700' : 'text-slate-600'}`}>{opt.label}</p>
                    {opt.recommended && <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-bold">Recomendado</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                </div>
              </button>
            ))}
            <p className="text-[10px] text-slate-400 pt-1">
              💡 Productos nuevos (SKU no existe) siempre se insertan completos. Con "Nuevo lote", el SKU del lote se genera automáticamente como SKU-PROVEEDOR.
            </p>
          </div>

          <button type="button" onClick={() => setRegisterAsCompra(v => !v)}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 transition-all text-left ${registerAsCompra ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${registerAsCompra ? 'bg-teal-500' : 'bg-white border-2 border-slate-300'}`}>
              {registerAsCompra && <svg width="10" height="7" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-bold ${registerAsCompra ? 'text-teal-700' : 'text-slate-600'}`}>📦 Registrar como compra en Reportes</p>
                <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-bold">Recomendado</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Cada producto importado aparece en Reportes → Compras con su proveedor, cantidad y costo total</p>
            </div>
          </button>

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
const SuppliersTab: React.FC<{ companyId: string; businessContext: string }> = ({ companyId, businessContext }) => {
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
    let query = supabase.from('suppliers').select('*').eq('company_id', companyId).order('name');
    if (businessContext !== 'general') {
      query = query.or(`business_context.eq.${businessContext},business_context.is.null,business_context.eq.general`);
    }
    const { data } = await query;
    setSuppliers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId, businessContext]);

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
        const { error } = await supabase.from('suppliers').insert({ ...form, company_id: companyId, business_context: businessContext });
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
// PESABLES TAB
// ─────────────────────────────────────────────
interface PesablesTabProps {
  companyId: string;
  branchId: string | null;
  formatMoney: (n: number) => string;
}

const PesablesTab: React.FC<PesablesTabProps> = ({ companyId, branchId, formatMoney }) => {
  const [pesables, setPesables] = useState<any[]>([]);
  const [loadingP, setLoadingP] = useState(true);
  const [showPModal, setShowPModal] = useState(false);
  const [editingP, setEditingP] = useState<any>(null);
  const [calc, setCalc] = useState({ kg_comprados: '', valor_compra: '', precio_venta: '' });
  const [calcResult, setCalcResult] = useState<{ costo_kg: number; ganancia_kg: number; margen: number; ganancia_total: number } | null>(null);

  const emptyP = () => ({
    name: '', plu_code: '', category: 'Frutas y verduras',
    unit_type: 'kg', price_per_unit: 0, cost: 0,
    stock_quantity: 0, stock_min_weight: 1000,
    description: '', is_active: true,
    type: 'WEIGHABLE', company_id: companyId,
    business_context: 'supermercado',
  });
  const [pForm, setPForm] = useState<any>(emptyP());

  useEffect(() => {
    if (!companyId) return;
    setLoadingP(true);
    supabase.from('products').select('*')
      .eq('company_id', companyId).eq('type', 'WEIGHABLE')
      .order('name')
      .then(({ data }) => { setPesables(data || []); setLoadingP(false); });
  }, [companyId]);

  const saveP = async () => {
    if (!pForm.name || !pForm.plu_code) { toast.error('Nombre y código PLU son obligatorios'); return; }
    const payload = {
      ...pForm,
      price: pForm.price_per_unit,
      company_id: companyId,
      branch_id: branchId || null,
      sku: pForm.plu_code,
    };
    const { error } = editingP
      ? await supabase.from('products').update(payload).eq('id', editingP.id)
      : await supabase.from('products').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editingP ? 'Producto actualizado' : 'Producto pesable creado');
    setShowPModal(false); setEditingP(null); setPForm(emptyP());
    const { data } = await supabase.from('products').select('*').eq('company_id', companyId!).eq('type', 'WEIGHABLE').order('name');
    setPesables(data || []);
  };

  const deleteP = async (id: string) => {
    if (!window.confirm('¿Eliminar este producto pesable?')) return;
    await supabase.from('products').delete().eq('id', id);
    setPesables(p => p.filter(x => x.id !== id));
    toast.success('Eliminado');
  };

  const calcRentabilidad = () => {
    const kg = parseFloat(calc.kg_comprados);
    const valor = parseFloat(calc.valor_compra);
    const pventa = parseFloat(calc.precio_venta);
    if (!kg || !valor) { toast.error('Ingresa kg comprados y valor de compra'); return; }
    const costo_kg = valor / kg;
    const ganancia_kg = pventa ? pventa - costo_kg : 0;
    const margen = pventa ? (ganancia_kg / pventa) * 100 : 0;
    const ganancia_total = pventa ? ganancia_kg * kg : 0;
    setCalcResult({ costo_kg, ganancia_kg, margen, ganancia_total });
  };

  const COP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
  const stockKg = (g: number) => `${(g / 1000).toFixed(2)} kg`;
  const CATEGORIAS = ['Frutas y verduras', 'Granos y cereales', 'Carnes y embutidos', 'Lácteos y quesos', 'Panadería y repostería', 'Otro'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: '🥬', label: 'Productos pesables', value: pesables.length, color: 'green' },
          { icon: '⚠️', label: 'Stock bajo', value: pesables.filter(p => p.stock_quantity < (p.stock_min_weight || 1000)).length, color: 'amber' },
          { icon: '💰', label: 'Más rentable', value: pesables.sort((a,b) => (b.price_per_unit - b.cost) - (a.price_per_unit - a.cost))[0]?.name || '—', color: 'blue', text: true },
          { icon: '📦', label: 'Total SKUs activos', value: pesables.filter(p => p.is_active).length, color: 'indigo' },
        ].map(({ icon, label, value, color, text }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{icon}</span>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
            <p className={`font-bold text-${color}-600 ${text ? 'text-sm' : 'text-2xl'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Calculator size={16} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Calculadora de Rentabilidad</h3>
            <p className="text-xs text-slate-500">Calcula el costo por kg y la ganancia antes de fijar tu precio de venta</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Kg comprados</label>
            <div className="relative">
              <input type="number" min="0" step="0.1" placeholder="ej: 50"
                value={calc.kg_comprados}
                onChange={e => setCalc(c => ({ ...c, kg_comprados: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">kg</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Valor total de compra</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
              <input type="number" min="0" placeholder="ej: 30000"
                value={calc.valor_compra}
                onChange={e => setCalc(c => ({ ...c, valor_compra: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl pl-6 pr-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Mi precio de venta / kg</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
              <input type="number" min="0" placeholder="ej: 3500"
                value={calc.precio_venta}
                onChange={e => setCalc(c => ({ ...c, precio_venta: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl pl-6 pr-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>
          </div>
        </div>
        <button onClick={calcRentabilidad}
          className="w-full md:w-auto px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors flex items-center gap-2">
          <TrendingUp size={15} /> Calcular rentabilidad
        </button>
        {calcResult && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Costo por kg', value: COP(calcResult.costo_kg), color: 'bg-slate-100 text-slate-700', icon: '📥' },
              { label: 'Ganancia por kg', value: COP(calcResult.ganancia_kg), color: calcResult.ganancia_kg > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700', icon: calcResult.ganancia_kg > 0 ? '✅' : '❌' },
              { label: 'Margen de ganancia', value: `${calcResult.margen.toFixed(1)}%`, color: calcResult.margen >= 30 ? 'bg-green-100 text-green-700' : calcResult.margen >= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700', icon: '📊' },
              { label: `Ganancia sobre ${calc.kg_comprados} kg`, value: COP(calcResult.ganancia_total), color: calcResult.ganancia_total > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700', icon: '💵' },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className={`rounded-xl p-3 ${color}`}>
                <p className="text-xs font-medium mb-1">{icon} {label}</p>
                <p className="text-lg font-black">{value}</p>
              </div>
            ))}
            <div className="col-span-2 md:col-span-4 mt-1">
              {calcResult.margen < 15 && <p className="text-xs text-red-600 font-semibold">⚠️ Margen muy bajo. Considera aumentar el precio de venta o negociar mejor el precio de compra.</p>}
              {calcResult.margen >= 15 && calcResult.margen < 30 && <p className="text-xs text-yellow-600 font-semibold">🟡 Margen aceptable. Un precio de venta de {COP(calcResult.costo_kg * 1.35)} daría un 35% de margen.</p>}
              {calcResult.margen >= 30 && <p className="text-xs text-green-600 font-semibold">✅ Precio viable. Margen saludable sobre el {calcResult.margen.toFixed(1)}%.</p>}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-green-600" />
            <h3 className="font-bold text-slate-800">Productos Pesables</h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{pesables.length}</span>
          </div>
          <button onClick={() => { setEditingP(null); setPForm(emptyP()); setShowPModal(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-colors">
            <Plus size={15} /> Nuevo producto
          </button>
        </div>
        {loadingP ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : pesables.length === 0 ? (
          <div className="p-10 text-center">
            <Scale size={36} className="mx-auto mb-2 text-slate-200" />
            <p className="text-slate-500 font-medium mb-1">Sin productos pesables</p>
            <p className="text-xs text-slate-400">Crea tu primer producto para vender por kg o lb</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Código PLU</th>
                  <th className="px-4 py-3 text-left">Categoría</th>
                  <th className="px-4 py-3 text-right">Precio / kg</th>
                  <th className="px-4 py-3 text-right">Costo / kg</th>
                  <th className="px-4 py-3 text-right">Margen</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pesables.map(p => {
                  const margin = p.price_per_unit && p.cost ? ((p.price_per_unit - p.cost) / p.price_per_unit * 100) : 0;
                  const stockG = p.stock_quantity || 0;
                  const lowStock = stockG < (p.stock_min_weight || 1000);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg text-xs">{p.plu_code || p.sku}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{p.category}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{COP(p.price_per_unit || p.price || 0)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{COP(p.cost || 0)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${margin >= 30 ? 'bg-green-100 text-green-700' : margin >= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {margin.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-semibold ${lowStock ? 'text-red-600' : 'text-slate-600'}`}>
                          {stockKg(stockG)} {lowStock && '⚠️'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {p.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setEditingP(p); setPForm({ ...p, price_per_unit: p.price_per_unit || p.price }); setShowPModal(true); }}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={13} /></button>
                          <button onClick={() => deleteP(p.id)}
                            className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
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

      {showPModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">{editingP ? 'Editar producto pesable' : 'Nuevo producto pesable'}</h3>
              <button onClick={() => setShowPModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nombre del producto *</label>
                  <input value={pForm.name} onChange={e => setPForm((f: any) => ({ ...f, name: e.target.value }))}
                    placeholder="ej: Limón Tahití, Papa criolla..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Código PLU * <span className="text-slate-400 font-normal">(en el POS escribe este código)</span></label>
                  <input value={pForm.plu_code} onChange={e => setPForm((f: any) => ({ ...f, plu_code: e.target.value.toUpperCase() }))}
                    placeholder="ej: F1, P23, L01"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-green-400" />
                  <p className="text-[10px] text-slate-400 mt-0.5">Código corto único para identificar el producto en caja</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Unidad de venta</label>
                  <select value={pForm.unit_type} onChange={e => setPForm((f: any) => ({ ...f, unit_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="kg">Kilogramos (kg)</option>
                    <option value="lb">Libras (lb)</option>
                    <option value="g">Gramos (g)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Precio de venta / {pForm.unit_type}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                    <input type="number" min="0" value={pForm.price_per_unit || ''}
                      onChange={e => setPForm((f: any) => ({ ...f, price_per_unit: parseFloat(e.target.value) || 0, price: parseFloat(e.target.value) || 0 }))}
                      placeholder="3500"
                      className="w-full border border-slate-200 rounded-xl pl-6 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Costo de compra / {pForm.unit_type}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                    <input type="number" min="0" value={pForm.cost || ''}
                      onChange={e => setPForm((f: any) => ({ ...f, cost: parseFloat(e.target.value) || 0 }))}
                      placeholder="600"
                      className="w-full border border-slate-200 rounded-xl pl-6 pr-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Categoría</label>
                  <select value={pForm.category} onChange={e => setPForm((f: any) => ({ ...f, category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400">
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Stock inicial (kg)</label>
                  <input type="number" min="0" step="0.01"
                    value={pForm.stock_quantity ? (pForm.stock_quantity / 1000).toFixed(2) : ''}
                    onChange={e => setPForm((f: any) => ({ ...f, stock_quantity: Math.round((parseFloat(e.target.value) || 0) * 1000) }))}
                    placeholder="ej: 50 (= 50 kg)"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
                  <p className="text-[10px] text-slate-400 mt-0.5">Ingresa en kg. Internamente se guarda en gramos.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Alerta stock mínimo (kg)</label>
                  <input type="number" min="0" step="0.1"
                    value={pForm.stock_min_weight ? (pForm.stock_min_weight / 1000).toFixed(1) : ''}
                    onChange={e => setPForm((f: any) => ({ ...f, stock_min_weight: Math.round((parseFloat(e.target.value) || 0) * 1000) }))}
                    placeholder="ej: 2 (= 2 kg)"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
              </div>
              {pForm.price_per_unit > 0 && pForm.cost > 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm text-emerald-700">Margen estimado:</span>
                  <span className="font-black text-emerald-700 text-lg">
                    {(((pForm.price_per_unit - pForm.cost) / pForm.price_per_unit) * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 text-sm">Cancelar</button>
                <button onClick={saveP}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 text-sm flex items-center justify-center gap-2">
                  <Scale size={15} /> {editingP ? 'Actualizar' : 'Crear producto'}
                </button>
              </div>
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
  const isSupermercado = businessTypes.some(t => ['supermercado', 'abarrotes', 'mercado'].includes(t));

  const currentBusinessContext =
    isRestaurante  ? 'restaurante'  :
    isZapateria    ? 'zapateria'    :
    isSalon        ? 'salon'        :
    isFarmacia     ? 'farmacia'     :
    isVeterinaria  ? 'veterinaria'  :
    isOdontologia  ? 'odontologia'  :
    isSupermercado ? 'supermercado' :
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
  const [branches, setBranches] = useState<{id: string; name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'list' | 'category'>('list');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [showBarcodeNotification, setShowBarcodeNotification] = useState(false);
  const [activeTab, setActiveTab] = useState<'products' | 'suppliers' | 'pesables'>('products');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showLowStock, setShowLowStock] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [showDescuentos, setShowDescuentos] = useState(false);

  useEffect(() => {
    if (!loading && products.length > 0) {
      if (sessionStorage.getItem('lowStockShown')) return;
      const hasLow = products.some(p => p.type !== 'SERVICE' && (p.stock_quantity ?? 0) <= (p.stock_min ?? 5));
      if (hasLow) { setShowLowStock(true); sessionStorage.setItem('lowStockShown', '1'); }
    }
  }, [loading, products]);

  const { isScanning } = useBarcodeScanner((barcode) => {
    const q = barcode.toLowerCase();
    const product = products.find(p =>
      p.sku.toLowerCase() === q ||
      ((p as any).barcode && (p as any).barcode.toLowerCase() === q) ||
      ((p as any).imei && (p as any).imei.toLowerCase() === q)
    );
    if (product) {
      setScannedProduct(product); setShowBarcodeNotification(true);
      openEdit(product); setTimeout(() => setShowBarcodeNotification(false), 3000);
    } else { toast.error(`Producto no encontrado (SKU/Barcode/IMEI: "${barcode}")`); }
  });

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setProducts(await productService.getAllForInventory(companyId));
      const { data: sups } = await supabase.from('suppliers').select('*').eq('company_id', companyId).order('name');
      setSuppliers(sups || []);
      const { data: brs } = await supabase.from('branches').select('id, name').eq('company_id', companyId).eq('is_active', true).order('name');
      setBranches(brs || []);
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
      const productData = { ...form, supplier_id: (form as any).supplier_id || null, branch_id: (form as any).branch_id || branchId || null };
      if (editing?.id) {
        await productService.update(editing.id, productData);
        toast.success('Producto actualizado');
        setShowModal(false); load();
      } else {
        const created = await productService.create({ ...productData, company_id: companyId! });
        toast.success('Producto creado');
        setShowModal(false);
        await load();
        if ((form as any).has_variants && created?.id) {
          setVariantProduct({ ...productData, id: created.id, company_id: companyId! } as any);
        }
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ─── ELIMINAR PRODUCTO ACTIVO: verifica historial ───────────────
  // Si tiene historial → soft delete (desactiva)
  // Si no tiene historial → hard delete (borra permanentemente)
  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
      const [{ count: invoiceCount }, { count: movCount }] = await Promise.all([
        supabase.from('invoice_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
        supabase.from('inventory_movements').select('id', { count: 'exact', head: true }).eq('product_id', id),
      ]);
      const hasHistory = (invoiceCount ?? 0) > 0 || (movCount ?? 0) > 0;
      if (hasHistory) {
        // Tiene historial → solo desactivar (soft delete)
        await productService.delete(id);
        toast.success('Producto desactivado (tiene historial asociado)');
      } else {
        // Sin historial → eliminar permanentemente
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        toast.success('Producto eliminado permanentemente');
      }
      load();
    } catch (e: any) { toast.error(e.message); }
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

  // ─── ELIMINACIÓN MASIVA ─────────────────────────────────────────
  // Detecta si hay inactivos en la selección para decidir el tipo de operación
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    const hasInactive = ids.some(id => {
      const p = products.find(x => x.id === id);
      return p && (p as any).is_active === false;
    });
    const hasActive = ids.some(id => {
      const p = products.find(x => x.id === id);
      return p && (p as any).is_active !== false;
    });

    if (hasActive && !hasInactive) {
      // Solo activos → verificar historial por cada uno
      if (!confirm(`¿Eliminar ${ids.length} producto${ids.length > 1 ? 's' : ''}? Los que tengan historial se desactivarán; los demás se borrarán permanentemente.`)) return;
      let softDeleted = 0; let hardDeleted = 0;
      for (const id of ids) {
        try {
          const [{ count: invoiceCount }, { count: movCount }] = await Promise.all([
            supabase.from('invoice_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
            supabase.from('inventory_movements').select('id', { count: 'exact', head: true }).eq('product_id', id),
          ]);
          const hasHistory = (invoiceCount ?? 0) > 0 || (movCount ?? 0) > 0;
          if (hasHistory) {
            await productService.delete(id);
            softDeleted++;
          } else {
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (!error) hardDeleted++;
          }
        } catch {}
      }
      if (hardDeleted > 0) toast.success(`${hardDeleted} producto${hardDeleted > 1 ? 's' : ''} eliminado${hardDeleted > 1 ? 's' : ''} permanentemente`);
      if (softDeleted > 0) toast.success(`${softDeleted} producto${softDeleted > 1 ? 's' : ''} desactivado${softDeleted > 1 ? 's' : ''} (tenían historial)`);
    } else {
      // Hay inactivos → eliminación permanente directa
      if (!confirm(`⚠️ ELIMINACIÓN PERMANENTE\n\n${ids.length} producto${ids.length > 1 ? 's' : ''} se borrarán definitivamente.\n\nLos que tengan facturas o movimientos asociados NO se eliminarán.\n\n¿Continuar?`)) return;
      let ok = 0; let skipped = 0;
      for (const id of ids) {
        try {
          const [{ count: invoiceCount }, { count: movCount }] = await Promise.all([
            supabase.from('invoice_items').select('id', { count: 'exact', head: true }).eq('product_id', id),
            supabase.from('inventory_movements').select('id', { count: 'exact', head: true }).eq('product_id', id),
          ]);
          const hasHistory = (invoiceCount ?? 0) > 0 || (movCount ?? 0) > 0;
          if (hasHistory) { skipped++; continue; }
          const { error } = await supabase.from('products').delete().eq('id', id);
          if (!error) ok++;
        } catch {}
      }
      if (ok > 0) toast.success(`${ok} producto${ok > 1 ? 's' : ''} eliminado${ok > 1 ? 's' : ''} permanentemente`);
      if (skipped > 0) toast.error(`${skipped} no se pudo${skipped > 1 ? 'eron' : ''} eliminar (tiene${skipped > 1 ? 'n' : ''} historial asociado)`);
    }

    setSelectedIds(new Set());
    load();
  };

  const filtered = products.filter(p => {
    if (!showInactive && (p as any).is_active === false) return false;
    if ((p as any).type === 'WEIGHABLE') return false;
    const ctx = (p as any).business_context || 'general';
    const contextMatch = currentBusinessContext === 'general'
      ? (ctx === 'general' || ctx === null)
      : ctx === currentBusinessContext;
    if (!contextMatch) return false;
    return (
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(search.toLowerCase()) ||
      ((p as any).barcode || '').toLowerCase().includes(search.toLowerCase()) ||
      ((p as any).imei || '').toLowerCase().includes(search.toLowerCase())
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
    const isInactive = !(p as any).is_active;
    return (
      <tr className={`hover:bg-slate-50 ${isChecked ? 'bg-blue-50' : ''} ${isInactive ? 'opacity-60' : ''}`}>
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
        <td className="px-4 py-3 font-medium text-slate-900">
          <div className="flex items-center gap-2">
            {p.name}
            {(p as any).has_variants && (
              <span className="px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-600 rounded font-bold flex items-center gap-0.5">
                <Tag size={9} /> VAR
              </span>
            )}
            {isInactive && <span className="px-1.5 py-0.5 text-[10px] bg-slate-200 text-slate-500 rounded font-bold">INACTIVO</span>}
          </div>
        </td>
        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.sku}</td>
        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{(p as any).barcode || <span className="text-slate-200">—</span>}</td>
        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{(p as any).imei || <span className="text-slate-200">—</span>}</td>
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
        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
          {(p as any).created_at
            ? new Date((p as any).created_at).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })
            : '—'}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2 items-center">
            <button onClick={() => openEdit(p)} className="text-blue-600 hover:text-blue-800"><Edit2 size={15} /></button>
            <button onClick={() => setVariantProduct(p)} title="Variantes" className="text-indigo-500 hover:text-indigo-700"><Tag size={15} /></button>
            {isInactive ? (
              // ── Producto INACTIVO: Activar o Borrar definitivamente ──
              <div className="flex gap-1">
                <button
                  onClick={async () => {
                    await productService.reactivate(p.id!);
                    toast.success('Producto reactivado');
                    load();
                  }}
                  className="text-green-600 hover:text-green-800 text-xs font-bold px-2 py-0.5 border border-green-300 rounded">
                  Activar
                </button>
                <button
                  onClick={async () => {
                    // Verificar historial antes de borrar
                    const [{ count: invoiceCount }, { count: movCount }] = await Promise.all([
                      supabase.from('invoice_items').select('id', { count: 'exact', head: true }).eq('product_id', p.id!),
                      supabase.from('inventory_movements').select('id', { count: 'exact', head: true }).eq('product_id', p.id!),
                    ]);
                    const hasHistory = (invoiceCount ?? 0) > 0 || (movCount ?? 0) > 0;
                    if (hasHistory) {
                      toast.error(
                        `No se puede eliminar: tiene ${invoiceCount ?? 0} factura(s) y ${movCount ?? 0} movimiento(s) asociados. Este registro es necesario para mantener el historial.`,
                        { duration: 6000 }
                      );
                      return;
                    }
                    if (!confirm(`⚠️ ELIMINACIÓN PERMANENTE\n\n"${p.name}"\n\nEsta acción NO se puede deshacer. ¿Estás seguro?`)) return;
                    // Hard delete directo — producto inactivo sin historial
                    const { error } = await supabase.from('products').delete().eq('id', p.id!);
                    if (error) { toast.error('Error al eliminar: ' + error.message); return; }
                    toast.success('Producto eliminado permanentemente');
                    load();
                  }}
                  className="text-red-600 hover:text-red-800 text-xs font-bold px-2 py-0.5 border border-red-300 rounded bg-red-50"
                  title="Eliminar permanentemente">
                  🗑️ Borrar
                </button>
              </div>
            ) : (
              // ── Producto ACTIVO: eliminar (con lógica automática) ──
              <button
                onClick={() => handleDelete(p.id!)}
                className="text-red-500 hover:text-red-700"
                title="Eliminar">
                <Trash2 size={15} />
              </button>
            )}
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
          {(p as any).type === 'WEIGHABLE' ? `Stock: ${((p as any).unit_type === 'g' ? (p.stock_quantity ?? 0) + ' g' : (p as any).unit_type === 'lb' ? ((( p.stock_quantity ?? 0) / 453.592).toFixed(2)) + ' lb' : (((p.stock_quantity ?? 0) / 1000).toFixed(2)) + ' kg')}` : `Stock: ${p.stock_quantity ?? 0}`}
        </div>
        {(p as any).has_variants && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] font-bold flex items-center gap-0.5">
            <Tag size={9} /> VAR
          </div>
        )}
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
          <button onClick={() => setVariantProduct(p)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded transition-colors"><Tag size={14} /> Variantes</button>
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
          <button onClick={() => {
              const url = window.location.origin + window.location.pathname + '#/catalogo/' + companyId;
              const msg = encodeURIComponent('🛍️ Mira nuestro catálogo:\n' + url);
              window.open('https://wa.me/?text=' + msg, '_blank');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white rounded-lg hover:bg-[#1fba59] font-medium text-sm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Catálogo WhatsApp
          </button>
          <button onClick={() => {
            const lowStock = products.filter((p: any) => p.type !== 'SERVICE' && p.type !== 'WEIGHABLE' && (p.stock_quantity ?? 0) <= (p.stock_min ?? 5));
            const now = new Date().toLocaleString('es-CO');
            const rows = products.map((p: any) => `<tr><td>${p.name}</td><td>${p.sku || '—'}</td><td>${p.category || '—'}</td><td>${p.brand || '—'}</td><td style="text-align:right">${p.stock_quantity ?? 0}</td><td style="text-align:right">${p.stock_min ?? 5}</td><td style="text-align:right">${formatMoney(p.price)}</td><td style="text-align:right">${formatMoney(p.cost)}</td><td>${p.type}</td><td>${p.created_at ? new Date(p.created_at).toLocaleDateString('es-CO') : '—'}</td></tr>`).join('');
            const lowRows = lowStock.map((p: any) => `<tr style="background:#fef2f2"><td><strong>${p.name}</strong></td><td>${p.sku || '—'}</td><td>${p.category || '—'}</td><td style="text-align:right;color:#ef4444;font-weight:700">${p.stock_quantity ?? 0}</td><td style="text-align:right">${p.stock_min ?? 5}</td><td style="text-align:right">${formatMoney(p.price)}</td></tr>`).join('');
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Inventario</title><style>body{font-family:Arial,sans-serif;margin:0;padding:24px 32px;color:#0f172a;font-size:11px}h1{font-size:18px;margin:0}h2{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin:18px 0 5px;border-bottom:2px solid #e2e8f0;padding-bottom:3px}table{width:100%;border-collapse:collapse;margin-top:4px}th{background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;padding:5px 6px;text-align:left}td{padding:4px 6px;border-bottom:1px solid #f1f5f9}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}}</style></head><body><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #0f172a"><div><h1>${company?.name || 'POSmaster'}</h1><p style="margin:3px 0 0;color:#64748b;font-size:11px">NIT: ${company?.nit || '—'}</p></div><div style="text-align:right"><p style="font-weight:800;font-size:15px;color:#3b82f6;margin:0">REPORTE DE INVENTARIO</p><p style="font-size:11px;color:#64748b;margin:3px 0">${now} · ${products.length} productos</p></div></div><h2>Todos los Productos</h2><table><thead><tr><th>Nombre</th><th>SKU</th><th>Categoría</th><th>Marca</th><th style="text-align:right">Stock</th><th style="text-align:right">Mín.</th><th style="text-align:right">Precio</th><th style="text-align:right">Costo</th><th>Tipo</th><th>Creado</th></tr></thead><tbody>${rows}</tbody></table>${lowStock.length > 0 ? `<h2 style="color:#ef4444">⚠️ Stock Bajo (${lowStock.length} productos)</h2><table><thead><tr><th>Nombre</th><th>SKU</th><th>Categoría</th><th style="text-align:right">Stock</th><th style="text-align:right">Mínimo</th><th style="text-align:right">Precio</th></tr></thead><tbody>${lowRows}</tbody></table>` : ''}<p style="margin-top:24px;text-align:center;font-size:10px;color:#94a3b8">Generado por POSmaster · ${now}</p></body></html>`;
            const w = window.open('', '_blank', 'width=1200,height=800');
            if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
          }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 font-medium text-sm">
            📄 Exportar PDF
          </button>
          <button onClick={() => setShowDescuentos(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium text-sm">
            <Tag size={16} /> Descuentos
          </button>
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
        {isSupermercado && (
          <button onClick={() => setActiveTab('pesables')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === 'pesables' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Scale size={16} /> Pesables
          </button>
        )}
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

      <div className="flex gap-3 flex-wrap items-center">
        <button onClick={() => { setViewMode('list'); setSelectedCategory(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
          <List size={16} /> Vista Lista
        </button>
        <button onClick={() => { setViewMode('category'); setSelectedCategory(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${viewMode === 'category' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
          <Grid3x3 size={16} /> Por Categoría
        </button>
        <label className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-slate-100 text-slate-700 cursor-pointer hover:bg-slate-200 transition-all select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded border-slate-300" />
          Ver inactivos
          {products.filter(p => (p as any).is_active === false).length > 0 && (
            <span className="bg-slate-400 text-white text-xs px-1.5 py-0.5 rounded-full">
              {products.filter(p => (p as any).is_active === false).length}
            </span>
          )}
        </label>
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
                <span className="text-sm font-semibold text-blue-700">
                  {selectedIds.size} producto{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100">
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      let ok = 0;
                      for (const id of Array.from(selectedIds)) {
                        try { await productService.reactivate(id); ok++; } catch {}
                      }
                      toast.success(`${ok} producto${ok > 1 ? 's' : ''} activado${ok > 1 ? 's' : ''}`);
                      setSelectedIds(new Set());
                      load();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                    <CheckCircle size={14} /> Activar {selectedIds.size}
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
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
                  {['Foto','Producto','SKU','Cód. Barras','IMEI','Categoría','Precio','Costo','Stock','Tipo','Proveedor','Creado',''].map(h => (
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

      {activeTab === 'pesables' && isSupermercado && companyId && (
        <PesablesTab companyId={companyId} branchId={branchId} formatMoney={formatMoney} />
      )}

      {activeTab === 'suppliers' && companyId && <SuppliersTab companyId={companyId} businessContext={currentBusinessContext} />}

      {variantProduct && (
        <VariantManager
          product={variantProduct}
          formatMoney={formatMoney}
          onClose={() => setVariantProduct(null)}
          onSaved={() => { setVariantProduct(null); load(); }}
        />
      )}

      {showLowStock && (
        <LowStockModal products={products} suppliers={suppliers} onClose={() => setShowLowStock(false)} onGoInventory={() => setActiveTab('products')} />
      )}

      {showImport && companyId && (
        <ImportModal
          companyId={companyId}
          branchId={branchId}
          suppliers={suppliers}
          branches={branches}
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load(); }}
        />
      )}

      {showDescuentos && companyId && (
        <DescuentosModal
          companyId={companyId}
          onClose={() => setShowDescuentos(false)}
        />
      )}

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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código de Barras</label>
                  <input value={(form as any).barcode || ''} onChange={f('barcode')} placeholder="EAN / UPC" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">IMEI <span className="text-slate-400 font-normal text-xs">(celulares/tablets)</span></label>
                  <input value={(form as any).imei || ''} onChange={f('imei')} placeholder="351234567890123" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                  <select value={form.type} onChange={f('type')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="STANDARD">Estándar</option>
                    <option value="SERIALIZED">Serializado</option>
                    <option value="SERVICE">Servicio</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Variantes</label>
                  <button type="button"
                    onClick={() => setForm((prev: any) => ({ ...prev, has_variants: !prev.has_variants }))}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 transition-all text-left ${(form as any).has_variants ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${(form as any).has_variants ? 'bg-indigo-600' : 'bg-white border-2 border-slate-300'}`}>
                      {(form as any).has_variants && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${(form as any).has_variants ? 'text-indigo-700' : 'text-slate-600'}`}>
                        Este producto tiene variantes (talla, color, capacidad…)
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {(form as any).has_variants
                          ? 'Al guardar, podrás definir las variantes con su propio SKU y stock'
                          : 'Activa si el mismo producto viene en diferentes presentaciones'}
                      </p>
                    </div>
                  </button>
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
                {branches.length > 1 && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      🏪 Sucursal / Sede
                    </label>
                    <select
                      value={(form as any).branch_id || ''}
                      onChange={e => setForm((prev: any) => ({ ...prev, branch_id: e.target.value || null }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Sede Principal</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      Elige la sede donde estará disponible este producto.
                    </p>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                  <textarea value={form.description || ''} onChange={f('description')} rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving || uploading}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium disabled:opacity-50 transition-colors ${(form as any).has_variants && !editing ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                {saving ? 'Guardando...' : editing ? 'Actualizar' : (form as any).has_variants ? '💾 Guardar y definir variantes →' : 'Crear Producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;