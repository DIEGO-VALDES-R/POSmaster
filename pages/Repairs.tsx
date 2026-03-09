import React, { useState, useEffect } from 'react';
import { Plus, Wrench, X, ChevronDown } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { repairService, RepairOrder, RepairStatus } from '../services/repairService';
import { useCompany } from '../hooks/useCompany';
import RefreshButton from '../components/RefreshButton';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<RepairStatus, string> = {
  RECEIVED: 'bg-blue-100 text-blue-800',
  DIAGNOSING: 'bg-yellow-100 text-yellow-800',
  WAITING_PARTS: 'bg-orange-100 text-orange-800',
  IN_REPAIR: 'bg-purple-100 text-purple-800',
  READY: 'bg-green-100 text-green-800',
  DELIVERED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<RepairStatus, string> = {
  RECEIVED: 'Recibido',
  DIAGNOSING: 'Diagnóstico',
  WAITING_PARTS: 'Esperando Repuestos',
  IN_REPAIR: 'En Reparación',
  READY: 'Listo',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

const EMPTY = {
  company_id: '', customer_name: '', customer_phone: '',
  device_model: '', serial_number: '', issue_description: '',
  status: 'RECEIVED' as RepairStatus, estimated_cost: 0, notes: '',
};

const Repairs: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { companyId, branchId } = useCompany();
  const [repairs, setRepairs] = useState<RepairOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try { setRepairs(await repairService.getAll(companyId)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [companyId]);

  const handleCreate = async () => {
    if (!form.customer_name || !form.device_model || !form.issue_description) {
      toast.error('Completa los campos requeridos'); return;
    }
    setSaving(true);
    try {
      await repairService.create({ ...form, company_id: companyId!, branch_id: branchId || undefined });
      toast.success('Orden creada'); setShowModal(false); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (id: string, status: RepairStatus) => {
    try { await repairService.updateStatus(id, status); toast.success('Estado actualizado'); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm((prev: any) => ({ ...prev, [k]: val }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Reparaciones</h2>
          <p className="text-slate-500">Gestión de órdenes de servicio técnico</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={load} />
          <button onClick={() => { setForm({ ...EMPTY, company_id: companyId || '' }); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
            <Plus size={16} /> Nueva Orden
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['DIAGNOSING','WAITING_PARTS','IN_REPAIR','READY'] as RepairStatus[]).map(s => (
          <div key={s} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">{STATUS_LABELS[s]}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{repairs.filter(r => r.status === s).length}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Cargando órdenes...</div>
        ) : repairs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Wrench size={40} className="mx-auto mb-3 opacity-30" />
            <p>No hay órdenes de reparación</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Cliente','Dispositivo','Problema','Costo Est.','Estado','Fecha'].map(h => (
                <th key={h} className="px-6 py-4 font-semibold text-slate-700">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {repairs.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{r.customer_name}</p>
                    <p className="text-xs text-slate-400">{r.customer_phone}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-slate-800">{r.device_model}</p>
                    {r.serial_number && <p className="text-xs text-slate-400 font-mono">{r.serial_number}</p>}
                  </td>
                  <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate">{r.issue_description}</td>
                  <td className="px-6 py-4 font-medium text-slate-800">{r.estimated_cost ? formatMoney(r.estimated_cost) : '—'}</td>
                  <td className="px-6 py-4">
                    <div className="relative">
                      <select value={r.status} onChange={e => handleStatusChange(r.id!, e.target.value as RepairStatus)}
                        className={`appearance-none pl-2 pr-6 py-1 rounded-full text-xs font-medium cursor-pointer border-0 outline-none ${STATUS_COLORS[r.status]}`}>
                        {(Object.keys(STATUS_LABELS) as RepairStatus[]).map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
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
              <h3 className="text-lg font-bold">Nueva Orden de Reparación</h3>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
                  <input value={form.customer_name} onChange={f('customer_name')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input value={form.customer_phone || ''} onChange={f('customer_phone')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Modelo Dispositivo *</label>
                  <input value={form.device_model} onChange={f('device_model')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Serial / IMEI</label>
                  <input value={form.serial_number || ''} onChange={f('serial_number')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo Estimado</label>
                  <input type="number" value={form.estimated_cost || 0} onChange={f('estimated_cost')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estado Inicial</label>
                  <select value={form.status} onChange={f('status')} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
                    {(Object.keys(STATUS_LABELS) as RepairStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Descripción del Problema *</label>
                  <textarea value={form.issue_description} onChange={f('issue_description')} rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notas internas</label>
                  <textarea value={form.notes || ''} onChange={f('notes')} rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancelar</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                {saving ? 'Guardando...' : 'Crear Orden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Repairs;
