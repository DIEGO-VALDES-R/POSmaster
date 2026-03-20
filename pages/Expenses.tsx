import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, Filter, Pencil, Trash2, CheckCircle2, XCircle,
  Receipt, RefreshCw, Download, TrendingDown, AlertCircle,
  Calendar, Tag, Building2, ChevronDown, MoreHorizontal,
  FileSpreadsheet, Clock, Repeat,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
}

interface Branch {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  company_id: string;
  branch_id: string | null;
  category_id: string | null;
  description: string;
  amount: number;
  expense_date: string;
  is_recurring: boolean;
  recurrence_interval: string | null;
  due_date: string | null;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  expense_categories?: { name: string; color: string } | null;
  branches?: { name: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Pendiente',
  PAID:      'Pagado',
  OVERDUE:   'Vencido',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700 border-amber-200',
  PAID:      'bg-green-100 text-green-700 border-green-200',
  OVERDUE:   'bg-red-100 text-red-700 border-red-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const RECURRENCE_LABELS: Record<string, string> = {
  WEEKLY:    'Semanal',
  MONTHLY:   'Mensual',
  QUARTERLY: 'Trimestral',
  ANNUALLY:  'Anual',
};

// ─── Default form ─────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  description: '',
  amount: '',
  expense_date: new Date().toISOString().split('T')[0],
  category_id: '',
  branch_id: '',
  is_recurring: false,
  recurrence_interval: 'MONTHLY',
  due_date: '',
  status: 'PENDING' as const,
  notes: '',
};

// ─── Component ────────────────────────────────────────────────────────────────
const Expenses: React.FC = () => {
  const { companyId, branchId, hasFeature } = useDatabase();
  const { formatMoney }         = useCurrency();

  // Data
  const [expenses,   setExpenses]   = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [branches,   setBranches]   = useState<Branch[]>([]);
  const [loading,    setLoading]    = useState(true);

  // UI state
  const [showModal,    setShowModal]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [form,         setForm]         = useState({ ...EMPTY_FORM });
  const [saving,       setSaving]       = useState(false);
  const [searchText,   setSearchText]   = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterCat,    setFilterCat]    = useState('ALL');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  // ── DB error state ──────────────────────────────────────────────────────────
  const [dbError, setDbError] = useState<string | null>(null);

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setDbError(null);
    try {
      // 1. Load branches (always works)
      const { data: brData } = await supabase
        .from('branches')
        .select('id, name')
        .eq('company_id', companyId);
      setBranches(brData || []);

      // 2. Load categories — detect if table exists
      const catRes = await supabase
        .from('expense_categories')
        .select('id, name, color')
        .eq('company_id', companyId)
        .order('name');

      if (catRes.error) {
        // Table doesn't exist → show migration notice
        setDbError(catRes.error.message);
        setLoading(false);
        return;
      }

      // 3. If categories exist but are empty → seed them
      if ((catRes.data || []).length === 0) {
        const { error: rpcErr } = await supabase.rpc('seed_expense_categories', {
          p_company_id: companyId,
        });
        if (!rpcErr) {
          const { data: seeded } = await supabase
            .from('expense_categories')
            .select('id, name, color')
            .eq('company_id', companyId)
            .order('name');
          setCategories(seeded || []);
        } else {
          // RPC doesn't exist — insert defaults manually
          const defaults = [
            { company_id: companyId, name: 'Arriendo',            color: '#ef4444' },
            { company_id: companyId, name: 'Servicios Públicos',   color: '#f59e0b' },
            { company_id: companyId, name: 'Internet / Telefonía', color: '#3b82f6' },
            { company_id: companyId, name: 'Nómina / Sueldos',     color: '#8b5cf6' },
            { company_id: companyId, name: 'Publicidad',           color: '#10b981' },
            { company_id: companyId, name: 'Transporte',           color: '#64748b' },
            { company_id: companyId, name: 'Mantenimiento',        color: '#f97316' },
            { company_id: companyId, name: 'Impuestos',            color: '#dc2626' },
            { company_id: companyId, name: 'Otros',                color: '#94a3b8' },
          ];
          await supabase.from('expense_categories').insert(defaults);
          const { data: seeded2 } = await supabase
            .from('expense_categories')
            .select('id, name, color')
            .eq('company_id', companyId)
            .order('name');
          setCategories(seeded2 || []);
        }
      } else {
        setCategories(catRes.data || []);
      }

      // 4. Load expenses
      const expRes = await supabase
        .from('expenses')
        .select('*, expense_categories(name, color), branches(name)')
        .eq('company_id', companyId)
        .order('expense_date', { ascending: false })
        .order('created_at',   { ascending: false });

      if (expRes.error) {
        setDbError(expRes.error.message);
      } else {
        setExpenses(expRes.data || []);
      }
    } catch (e: any) {
      setDbError(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (filterStatus !== 'ALL' && e.status !== filterStatus) return false;
      if (filterCat    !== 'ALL' && e.category_id !== filterCat) return false;
      if (searchText && !e.description.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (dateFrom && e.expense_date < dateFrom) return false;
      if (dateTo   && e.expense_date > dateTo)   return false;
      return true;
    });
  }, [expenses, filterStatus, filterCat, searchText, dateFrom, dateTo]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const now   = new Date();
    const m1    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const total = filtered.reduce((s, e) => s + e.amount, 0);
    const thisMonth = filtered
      .filter(e => e.expense_date >= m1 && e.status !== 'CANCELLED')
      .reduce((s, e) => s + e.amount, 0);
    const pending  = filtered.filter(e => e.status === 'PENDING').reduce((s, e) => s + e.amount, 0);
    const overdue  = filtered.filter(e => e.status === 'OVERDUE').length;
    return { total, thisMonth, pending, overdue };
  }, [filtered]);

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, branch_id: branchId || '' });
    setShowModal(true);
  };

  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({
      description:         e.description,
      amount:              String(e.amount),
      expense_date:        e.expense_date,
      category_id:         e.category_id || '',
      branch_id:           e.branch_id   || '',
      is_recurring:        e.is_recurring,
      recurrence_interval: e.recurrence_interval || 'MONTHLY',
      due_date:            e.due_date || '',
      status:              e.status,
      notes:               e.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error('Ingresa una descripción'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    if (!companyId) return;

    setSaving(true);
    try {
      const payload: any = {
        company_id:          companyId,
        branch_id:           form.branch_id   || null,
        category_id:         form.category_id || null,
        description:         form.description.trim(),
        amount:              parseFloat(form.amount),
        expense_date:        form.expense_date,
        is_recurring:        form.is_recurring,
        recurrence_interval: form.is_recurring ? form.recurrence_interval : null,
        due_date:            form.due_date || null,
        status:              form.status,
        notes:               form.notes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', editingId);
        if (error) throw error;
        toast.success('Gasto actualizado');
      } else {
        const { error } = await supabase.from('expenses').insert(payload);
        if (error) throw error;
        toast.success('Gasto registrado');
      }
      setShowModal(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    await supabase.from('expenses').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('id', id);
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: 'PAID' as const } : e));
    toast.success('Marcado como pagado');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return;
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    toast.success('Gasto eliminado');
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const rows = filtered.map(e => ({
      Fecha:        e.expense_date,
      Descripción:  e.description,
      Categoría:    e.expense_categories?.name || '—',
      Sucursal:     e.branches?.name || '—',
      Monto:        e.amount,
      Estado:       STATUS_LABEL[e.status],
      Vencimiento:  e.due_date || '—',
      Recurrente:   e.is_recurring ? RECURRENCE_LABELS[e.recurrence_interval || ''] || 'Sí' : 'No',
      Notas:        e.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
    XLSX.writeFile(wb, `Gastos_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const isOverdue = (e: Expense) =>
    e.status === 'PENDING' && e.due_date && e.due_date < new Date().toISOString().split('T')[0];

  const sf = (field: keyof typeof EMPTY_FORM) => (val: any) =>
    setForm(f => ({ ...f, [field]: val }));

  // ── Render ───────────────────────────────────────────────────────────────────
  // Feature gate
  if (!hasFeature('op_expenses')) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <TrendingDown size={28} className="text-amber-600" />
          </div>
          <h2 className="text-lg font-black text-slate-800 mb-2">Gastos Operativos</h2>
          <p className="text-sm text-slate-500 mb-4">Este módulo no está habilitado para tu cuenta. Contacta al administrador para activarlo.</p>
          <span className="inline-block px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">Plan PRO o ENTERPRISE</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <TrendingDown size={24} className="text-red-500" /> Gastos Operativos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Registra y controla tus egresos mensuales</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors">
            <FileSpreadsheet size={15} /> Excel
          </button>
          <button onClick={loadAll} disabled={loading} className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-500' : 'text-slate-600'} />
          </button>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Nuevo Gasto
          </button>
        </div>
      </div>

      {/* Migration error banner */}
      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-red-700 text-sm">Las tablas de Gastos no existen aún en la base de datos</p>
              <p className="text-red-600 text-xs mt-1 mb-3">Debes ejecutar la migración SQL antes de usar este módulo.</p>
              <p className="text-xs font-semibold text-red-500 mb-2">Pasos:</p>
              <ol className="text-xs text-red-600 space-y-1 list-decimal list-inside mb-3">
                <li>Abre <strong>Supabase → SQL Editor</strong></li>
                <li>Copia el contenido del archivo <code className="bg-red-100 px-1 rounded">supabase/migrations/007_expenses_module.sql</code></li>
                <li>Pega y ejecuta el script completo</li>
                <li>Vuelve aquí y presiona el botón de recarga</li>
              </ol>
              <details className="text-xs">
                <summary className="cursor-pointer text-red-400 hover:text-red-600">Ver error técnico</summary>
                <code className="block mt-1 bg-red-100 p-2 rounded text-red-700 break-all">{dbError}</code>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards — only show when DB is working */}
      {!dbError && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard label="Este mes" value={formatMoney(kpi.thisMonth)} color="red" icon={<Calendar size={18} />} />
          <KPICard label="Total (filtrado)" value={formatMoney(kpi.total)} color="orange" icon={<Receipt size={18} />} />
          <KPICard label="Pendiente pago" value={formatMoney(kpi.pending)} color="amber" icon={<Clock size={18} />} />
          <KPICard label="Vencidos" value={String(kpi.overdue)} color={kpi.overdue > 0 ? 'red' : 'green'} icon={<AlertCircle size={18} />} />
        </div>
      )}

      {!dbError && (
      <>
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={15} className="text-slate-400" />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar por descripción..."
            className="w-full text-sm outline-none text-slate-700 placeholder-slate-400"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-300">
          <option value="ALL">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="PAID">Pagado</option>
          <option value="OVERDUE">Vencido</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-300">
          <option value="ALL">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={28} className="animate-spin text-blue-400" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide">Fecha</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide">Descripción</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">Categoría</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Vence</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600 text-xs uppercase tracking-wide">Monto</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600 text-xs uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600 text-xs uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <TrendingDown size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium">Sin gastos registrados</p>
                    <p className="text-xs mt-1">Haz clic en "Nuevo Gasto" para empezar</p>
                  </td>
                </tr>
              )}
              {filtered.map(e => {
                const vencido = isOverdue(e);
                return (
                  <tr key={e.id} className={`hover:bg-slate-50 transition-colors ${vencido ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                      {e.expense_date}
                      {e.is_recurring && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-blue-500">
                          <Repeat size={10} />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 leading-tight">{e.description}</p>
                      {e.branches?.name && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <Building2 size={10} /> {e.branches.name}
                        </p>
                      )}
                      {e.notes && <p className="text-xs text-slate-400 mt-0.5 italic truncate max-w-[200px]">{e.notes}</p>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {e.expense_categories ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.expense_categories.color }} />
                          {e.expense_categories.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {e.due_date ? (
                        <span className={`text-xs font-mono ${vencido ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                          {vencido && '⚠ '}{e.due_date}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${e.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {formatMoney(e.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[e.status]}`}>
                        {STATUS_LABEL[e.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {e.status === 'PENDING' && (
                          <button onClick={() => handleMarkPaid(e.id)}
                            title="Marcar como pagado"
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors">
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                        <button onClick={() => openEdit(e)}
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => handleDelete(e.id)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-slate-500">{filtered.length} registro(s)</td>
                  <td className="px-4 py-3 text-right font-black text-slate-800">
                    {formatMoney(filtered.filter(e => e.status !== 'CANCELLED').reduce((s, e) => s + e.amount, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-800">
                {editingId ? 'Editar Gasto' : 'Nuevo Gasto Operativo'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <XCircle size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descripción *</label>
                <input
                  value={form.description}
                  onChange={e => sf('description')(e.target.value)}
                  placeholder="Ej: Arriendo local marzo 2026"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 text-slate-800"
                />
              </div>

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Monto *</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.amount}
                    onChange={e => sf('amount')(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha del gasto *</label>
                  <input
                    type="date"
                    value={form.expense_date}
                    onChange={e => sf('expense_date')(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Category + Branch */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Categoría</label>
                  <select value={form.category_id} onChange={e => sf('category_id')(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 text-slate-700">
                    <option value="">Sin categoría</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sucursal</label>
                  <select value={form.branch_id} onChange={e => sf('branch_id')(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 text-slate-700">
                    <option value="">General</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estado</label>
                <select value={form.status} onChange={e => sf('status')(e.target.value as any)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 text-slate-700">
                  <option value="PENDING">Pendiente</option>
                  <option value="PAID">Pagado</option>
                  <option value="OVERDUE">Vencido</option>
                  <option value="CANCELLED">Cancelado</option>
                </select>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha de vencimiento (opcional)</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => sf('due_date')(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Recurring */}
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={form.is_recurring}
                  onChange={e => sf('is_recurring')(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
                <label htmlFor="recurring" className="text-sm font-semibold text-blue-700 cursor-pointer flex items-center gap-1.5">
                  <Repeat size={14} /> Gasto recurrente
                </label>
                {form.is_recurring && (
                  <select value={form.recurrence_interval} onChange={e => sf('recurrence_interval')(e.target.value)}
                    className="ml-auto px-2 py-1 border border-blue-200 rounded-lg text-xs text-blue-700 bg-white outline-none">
                    <option value="WEEKLY">Semanal</option>
                    <option value="MONTHLY">Mensual</option>
                    <option value="QUARTERLY">Trimestral</option>
                    <option value="ANNUALLY">Anual</option>
                  </select>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas (opcional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => sf('notes')(e.target.value)}
                  rows={2}
                  placeholder="Observaciones adicionales..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 text-slate-700 resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Guardar Gasto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────────
const KPICard: React.FC<{
  label: string; value: string; color: string; icon: React.ReactNode;
}> = ({ label, value, color, icon }) => {
  const colors: Record<string, string> = {
    red:    'bg-red-50   border-red-100   text-red-600',
    orange: 'bg-orange-50 border-orange-100 text-orange-600',
    amber:  'bg-amber-50  border-amber-100  text-amber-600',
    green:  'bg-green-50  border-green-100  text-green-600',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.orange}`}>
      <div className="flex items-center gap-2 mb-1 opacity-70">{icon}<p className="text-xs font-medium">{label}</p></div>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
};

export default Expenses;
