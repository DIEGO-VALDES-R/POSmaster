import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Wrench, X, ChevronDown, Edit2, DollarSign, Package, Search, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { repairService, RepairOrder, RepairStatus } from '../services/repairService';
import { useCompany } from '../hooks/useCompany';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import RefreshButton from '../components/RefreshButton';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<RepairStatus, string> = {
  RECEIVED:      'bg-blue-100 text-blue-800',
  DIAGNOSING:    'bg-yellow-100 text-yellow-800',
  WAITING_PARTS: 'bg-orange-100 text-orange-800',
  IN_REPAIR:     'bg-purple-100 text-purple-800',
  READY:         'bg-green-100 text-green-800',
  DELIVERED:     'bg-slate-100 text-slate-600',
  CANCELLED:     'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<RepairStatus, string> = {
  RECEIVED:      'Recibido',
  DIAGNOSING:    'Diagnóstico',
  WAITING_PARTS: 'Esperando Repuestos',
  IN_REPAIR:     'En Reparación',
  READY:         'Listo',
  DELIVERED:     'Entregado',
  CANCELLED:     'Cancelado',
};

interface Part {
  product_id: string;
  name: string;
  sku: string;
  qty: number;
  price: number;
}

interface RepairOrderWithParts extends RepairOrder {
  parts?: Part[];
}

const EMPTY: Omit<RepairOrderWithParts, 'id' | 'created_at' | 'updated_at'> = {
  company_id: '', customer_name: '', customer_phone: '',
  device_model: '', serial_number: '', issue_description: '',
  status: 'RECEIVED', estimated_cost: 0, final_cost: 0, notes: '',
  parts: [],
};

const Repairs: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { companyId, branchId } = useCompany();
  const navigate = useNavigate();
  const [repairs, setRepairs]   = useState<RepairOrderWithParts[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editingOrder, setEditingOrder] = useState<RepairOrderWithParts | null>(null);
  const [form, setForm]         = useState<typeof EMPTY>({ ...EMPTY });
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [showPartSearch, setShowPartSearch] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [orders, { data: prods }] = await Promise.all([
        repairService.getAll(companyId),
        supabase.from('products').select('id,name,sku,price,stock_quantity')
          .eq('company_id', companyId).eq('is_active', true).order('name'),
      ]);
      // Cargar parts guardadas en notes como JSON (solución sin migración)
      const withParts = orders.map(o => {
        try {
          const parsed = JSON.parse((o as any)._parts_json || '[]');
          return { ...o, parts: parsed };
        } catch { return { ...o, parts: [] }; }
      });
      setRepairs(withParts);
      setProducts(prods || []);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [companyId]);

  const openCreate = () => {
    setEditingOrder(null);
    setForm({ ...EMPTY, company_id: companyId || '', parts: [] });
    setShowModal(true);
  };

  const openEdit = (r: RepairOrderWithParts) => {
    setEditingOrder(r);
    setForm({ ...r, parts: r.parts || [] });
    setShowModal(true);
  };

  // Agregar repuesto desde inventario al form
  const addPart = (product: any) => {
    const existing = form.parts!.find(p => p.product_id === product.id);
    if (existing) {
      setForm(f => ({ ...f, parts: f.parts!.map(p =>
        p.product_id === product.id ? { ...p, qty: p.qty + 1 } : p
      )}));
    } else {
      setForm(f => ({ ...f, parts: [...(f.parts||[]), {
        product_id: product.id, name: product.name,
        sku: product.sku, qty: 1, price: product.price,
      }]}));
    }
    setPartSearch(''); setShowPartSearch(false);
    toast.success(`${product.name} agregado`);
  };

  const removePart = (product_id: string) =>
    setForm(f => ({ ...f, parts: f.parts!.filter(p => p.product_id !== product_id) }));

  const partTotal = useMemo(() =>
    (form.parts||[]).reduce((s, p) => s + p.price * p.qty, 0), [form.parts]);

  const handleSave = async () => {
    if (!form.customer_name || !form.device_model || !form.issue_description) {
      toast.error('Completa los campos requeridos'); return;
    }
    setSaving(true);
    try {
      // Construir payload solo con columnas que existen en repair_orders
      // 'parts' es un array virtual — no existe en la tabla, se serializa en _parts_json
      const { parts, ...formWithoutParts } = form as any;

      const payload: any = {
        ...formWithoutParts,
        company_id:  companyId!,
        branch_id:   branchId || null,
        final_cost:  form.final_cost || form.estimated_cost || 0,
        _parts_json: JSON.stringify(parts || []),
      };

      // Eliminar campos que Supabase rechazaría (no existen en la tabla)
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;

      if (editingOrder?.id) {
        await repairService.update(editingOrder.id, payload);
        toast.success('Orden actualizada');
      } else {
        await repairService.create(payload);
        toast.success('Orden creada');
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      console.error('Error guardando orden:', e);
      toast.error(e.message || 'Error al guardar la orden');
    }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (id: string, status: RepairStatus) => {
    try { await repairService.updateStatus(id, status); toast.success('Estado actualizado'); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  // Navegar al POS para cobrar la orden
  const goToPOS = (r: RepairOrderWithParts) => {
    const finalCost = r.final_cost || r.estimated_cost || 0;
    const ticket = r.id?.slice(0, 8).toUpperCase() || 'REP';
    const parts = (r.parts || []).map(p => `${p.name}×${p.qty}`).join(', ');
    const servicio = `🔧 Reparación ${r.device_model}${parts ? ` (${parts})` : ''}`;

    const params = new URLSearchParams({
      shoe: r.id!,          // reutilizamos el canal 'shoe' que ya entiende POS
      cliente: r.customer_name,
      tel: r.customer_phone || '',
      servicio,
      ticket,
      total: String(finalCost),
    });
    navigate(`/pos?${params.toString()}`);
  };

  const filtered = repairs.filter(r =>
    r.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    r.device_model.toLowerCase().includes(search.toLowerCase()) ||
    r.issue_description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredParts = products.filter(p =>
    p.name.toLowerCase().includes(partSearch.toLowerCase()) ||
    p.sku.toLowerCase().includes(partSearch.toLowerCase())
  ).slice(0, 8);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm((prev: any) => ({ ...prev, [k]: val }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Servicio Técnico</h2>
          <p className="text-slate-500 text-sm">Gestión de órdenes de reparación</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={load} />
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
            <Plus size={16} /> Nueva Orden
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['DIAGNOSING','WAITING_PARTS','IN_REPAIR','READY'] as RepairStatus[]).map(s => (
          <div key={s} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">{STATUS_LABELS[s]}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{repairs.filter(r => r.status === s).length}</p>
          </div>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente, dispositivo..."
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Cargando órdenes...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Wrench size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay órdenes de reparación</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Cliente','Dispositivo','Problema','Repuestos','Costo','Estado','Fecha','Acciones'].map(h => (
                    <th key={h} className="px-4 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-900">{r.customer_name}</p>
                      <p className="text-xs text-slate-400">{r.customer_phone}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-slate-800 font-medium">{r.device_model}</p>
                      {r.serial_number && <p className="text-xs text-slate-400 font-mono">{r.serial_number}</p>}
                    </td>
                    <td className="px-4 py-4 text-slate-600 max-w-[160px] truncate text-xs">{r.issue_description}</td>
                    <td className="px-4 py-4">
                      {(r.parts||[]).length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {r.parts!.map(p => (
                            <span key={p.product_id} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                              {p.name} ×{p.qty}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-800">{r.final_cost ? formatMoney(r.final_cost) : r.estimated_cost ? formatMoney(r.estimated_cost) : '—'}</p>
                      {r.final_cost && r.estimated_cost && r.final_cost !== r.estimated_cost && (
                        <p className="text-xs text-slate-400">Est: {formatMoney(r.estimated_cost)}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="relative">
                        <select value={r.status} onChange={e => handleStatusChange(r.id!, e.target.value as RepairStatus)}
                          className={`appearance-none pl-2 pr-6 py-1 rounded-full text-xs font-semibold cursor-pointer border-0 outline-none ${STATUS_COLORS[r.status]}`}>
                          {(Object.keys(STATUS_LABELS) as RepairStatus[]).map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-500 text-xs">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO') : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(r)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Editar">
                          <Edit2 size={14} />
                        </button>
                        {r.status === 'READY' && (
                          <button onClick={() => goToPOS(r)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700"
                            title="Cobrar en POS">
                            <DollarSign size={13} /> Cobrar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-800">
                {editingOrder ? 'Editar Orden' : 'Nueva Orden de Reparación'}
              </h3>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* Datos cliente */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Datos del cliente</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
                    <input value={form.customer_name} onChange={f('customer_name')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                    <input value={form.customer_phone || ''} onChange={f('customer_phone')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                </div>
              </div>

              {/* Datos dispositivo */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Dispositivo</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Modelo *</label>
                    <input value={form.device_model} onChange={f('device_model')}
                      placeholder="Ej: Samsung A11, iPhone 13..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Serial / IMEI</label>
                    <input value={form.serial_number || ''} onChange={f('serial_number')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descripción del problema *</label>
                    <textarea value={form.issue_description} onChange={f('issue_description')} rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm" />
                  </div>
                </div>
              </div>

              {/* Costos y estado */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Costo y estado</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Costo estimado</label>
                    <input type="number" value={form.estimated_cost || 0} onChange={f('estimated_cost')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Costo final</label>
                    <input type="number" value={form.final_cost || 0} onChange={f('final_cost')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                    <select value={form.status} onChange={f('status')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                      {(Object.keys(STATUS_LABELS) as RepairStatus[]).map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Repuestos desde inventario */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Package size={13} /> Repuestos del inventario
                  <span className="text-slate-400 font-normal">(se descontarán al facturar)</span>
                </h4>

                {/* Buscador de productos */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={partSearch}
                    onChange={e => { setPartSearch(e.target.value); setShowPartSearch(true); }}
                    onFocus={() => setShowPartSearch(true)}
                    placeholder="Buscar repuesto en inventario..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  {showPartSearch && partSearch && filteredParts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto">
                      {filteredParts.map(p => (
                        <button key={p.id} onClick={() => addPart(p)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{p.name}</p>
                            <p className="text-xs text-slate-500 font-mono">{p.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-blue-600">{formatMoney(p.price)}</p>
                            <p className="text-xs text-slate-400">Stock: {p.stock_quantity}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lista de repuestos agregados */}
                {(form.parts||[]).length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    {form.parts!.map(part => (
                      <div key={part.product_id} className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <Package size={14} className="text-purple-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-slate-800">{part.name}</p>
                            <p className="text-xs text-slate-500 font-mono">{part.sku}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setForm(f => ({ ...f, parts: f.parts!.map(p =>
                              p.product_id === part.product_id ? { ...p, qty: Math.max(1, p.qty - 1) } : p
                            )}))} className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center">-</button>
                            <span className="w-8 text-center text-sm font-semibold">{part.qty}</span>
                            <button onClick={() => setForm(f => ({ ...f, parts: f.parts!.map(p =>
                              p.product_id === part.product_id ? { ...p, qty: p.qty + 1 } : p
                            )}))} className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm flex items-center justify-center">+</button>
                          </div>
                          <span className="text-sm font-bold text-slate-700 w-20 text-right">{formatMoney(part.price * part.qty)}</span>
                          <button onClick={() => removePart(part.product_id)} className="text-red-400 hover:text-red-600 ml-1"><X size={14} /></button>
                        </div>
                      </div>
                    ))}
                    <div className="px-3 py-2 bg-slate-50 flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-600">Total repuestos</span>
                      <span className="text-sm font-bold text-purple-700">{formatMoney(partTotal)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-lg">
                    Sin repuestos agregados — busca arriba para agregar
                  </p>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas internas</label>
                <textarea value={form.notes || ''} onChange={f('notes')} rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm" />
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0 border-t bg-slate-50">
              <button onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-medium text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                <Check size={15} />{saving ? 'Guardando...' : editingOrder ? 'Guardar cambios' : 'Crear Orden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Repairs;