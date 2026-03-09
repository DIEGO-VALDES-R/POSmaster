import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Search, Plus, X, Edit2, Trash2, Phone, Mail,
  MapPin, FileText, ShoppingBag, TrendingUp, Star,
  ChevronDown, ChevronUp, Calendar, CreditCard, RefreshCw,
  UserCheck, AlertCircle, Download, MessageCircle, Zap
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { toast } from 'react-hot-toast';
import RefreshButton from '../components/RefreshButton';

// ── TYPES ─────────────────────────────────────────────────────────────────────
interface CustomerRecord {
  id: string;
  company_id: string;
  name: string;
  document_number?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  // computed from sales
  total_spent?: number;
  purchase_count?: number;
  last_purchase?: string;
  avg_ticket?: number;
}

interface SaleRecord {
  id: string;
  invoice_number: string;
  total_amount: number;
  created_at: string;
  payment_method: any;
  status: string;
}

const EMPTY_CUSTOMER: Partial<CustomerRecord> = {
  name: '', document_number: '', email: '', phone: '', address: '', notes: ''
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const getRankLabel = (spent: number): { label: string; color: string } => {
  if (spent >= 2000000) return { label: '💎 VIP', color: 'bg-purple-100 text-purple-700' };
  if (spent >= 500000)  return { label: '⭐ Frecuente', color: 'bg-amber-100 text-amber-700' };
  if (spent >= 100000)  return { label: '👤 Regular', color: 'bg-blue-100 text-blue-700' };
  return { label: '🆕 Nuevo', color: 'bg-slate-100 text-slate-600' };
};

// ── COMPONENT ─────────────────────────────────────────────────────────────────
const Customers: React.FC = () => {
  const { companyId } = useDatabase();
  const { formatMoney } = useCurrency();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'spent' | 'purchases' | 'last'>('spent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [form, setForm] = useState<Partial<CustomerRecord>>(EMPTY_CUSTOMER);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customerSales, setCustomerSales] = useState<SaleRecord[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [filterRank, setFilterRank] = useState<string>('all');
  const [allInvoices, setAllInvoices] = useState<any[]>([]);

  // Load ALL invoices for proper enrichment (context only has last 50)
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, created_at, payment_method, status')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setAllInvoices(data || []));
  }, [companyId]);

  // ── Sync customers from invoices JSONB ──────────────────────────────────
  const syncFromInvoices = useCallback(async () => {
    if (!companyId) return 0;
    // Load ALL invoices with customer data in payment_method
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, payment_method, created_at, total_amount')
      .eq('company_id', companyId)
      .not('payment_method->customer_name', 'is', null);
    if (error || !invoices) return 0;

    // Build unique customer map keyed by document (or name if no doc)
    const map = new Map<string, {
      name: string; document_number: string; phone: string;
      email: string; invoiceCount: number; lastDate: string;
    }>();

    for (const inv of invoices) {
      const pm = inv.payment_method || {};
      const name = (pm.customer_name || '').trim();
      if (!name || name.toLowerCase() === 'consumidor final') continue;
      const doc  = (pm.customer_document || '').trim();
      const key  = doc || name.toLowerCase();
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.invoiceCount++;
        if (inv.created_at > existing.lastDate) existing.lastDate = inv.created_at;
      } else {
        map.set(key, {
          name,
          document_number: doc,
          phone: (pm.customer_phone || '').trim(),
          email: (pm.customer_email || '').trim(),
          invoiceCount: 1,
          lastDate: inv.created_at,
        });
      }
    }
    if (map.size === 0) return 0;

    // Load existing customers to avoid duplicates
    const { data: existing } = await supabase
      .from('customers').select('name, document_number').eq('company_id', companyId);
    const existingDocs  = new Set((existing || []).map((c: any) => c.document_number).filter(Boolean));
    const existingNames = new Set((existing || []).map((c: any) => c.name.toLowerCase()));

    const toInsert: any[] = [];
    for (const [, c] of map) {
      const alreadyExists = (c.document_number && existingDocs.has(c.document_number))
        || existingNames.has(c.name.toLowerCase());
      if (!alreadyExists) {
        toInsert.push({
          company_id:      companyId,
          name:            c.name,
          document_number: c.document_number || null,
          phone:           c.phone || null,
          email:           c.email || null,
        });
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('customers').insert(toInsert);
    }
    return toInsert.length;
  }, [companyId]);

  // ── Load customers from DB ─────────────────────────────────────────────────
  const loadCustomers = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCustomers((data || []) as CustomerRecord[]);
    } catch (e: any) {
      toast.error('Error cargando clientes: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // On mount: sync from invoices first, then load
  useEffect(() => {
    if (!companyId) return;
    const init = async () => {
      setLoading(true);
      await syncFromInvoices();
      await loadCustomers();
    };
    init();
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncNow = async () => {
    setLoading(true);
    const added = await syncFromInvoices();
    await loadCustomers();
    if (added > 0) toast.success(`✅ ${added} cliente(s) importados desde facturas`);
    else toast.success('Todo al día — no hay clientes nuevos por importar');
  };

  // ── Enrich customers with ALL invoices (not just last 50 from context) ───
  const enriched = useMemo(() => {
    return customers.map(c => {
      const cSales = allInvoices.filter((s: any) => {
        const pm = s.payment_method || {};
        const docMatch = c.document_number && pm.customer_document === c.document_number;
        const nameMatch = !docMatch && c.name &&
          (pm.customer_name || '').toLowerCase() === c.name.toLowerCase();
        return docMatch || nameMatch;
      });
      const total_spent = cSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
      const purchase_count = cSales.length;
      const last_purchase = cSales.length
        ? [...cSales].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at
        : undefined;
      const avg_ticket = purchase_count > 0 ? total_spent / purchase_count : 0;
      return { ...c, total_spent, purchase_count, last_purchase, avg_ticket };
    });
  }, [customers, allInvoices]);

  // ── Filtered + sorted ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = enriched;
    if (search) {
      const t = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(t) ||
        (c.document_number || '').includes(t) ||
        (c.email || '').toLowerCase().includes(t) ||
        (c.phone || '').includes(t)
      );
    }
    if (filterRank !== 'all') {
      list = list.filter(c => getRankLabel(c.total_spent || 0).label.includes(filterRank));
    }
    list = [...list].sort((a, b) => {
      let va: any, vb: any;
      if (sortBy === 'name')      { va = a.name; vb = b.name; }
      if (sortBy === 'spent')     { va = a.total_spent || 0; vb = b.total_spent || 0; }
      if (sortBy === 'purchases') { va = a.purchase_count || 0; vb = b.purchase_count || 0; }
      if (sortBy === 'last')      { va = a.last_purchase || ''; vb = b.last_purchase || ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [enriched, search, filterRank, sortBy, sortDir]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: enriched.length,
    vip: enriched.filter(c => (c.total_spent || 0) >= 2000000).length,
    frequent: enriched.filter(c => (c.total_spent || 0) >= 500000 && (c.total_spent || 0) < 2000000).length,
    totalRevenue: enriched.reduce((s, c) => s + (c.total_spent || 0), 0),
  }), [enriched]);

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_CUSTOMER);
    setShowModal(true);
  };

  const openEdit = (c: CustomerRecord) => {
    setEditing(c);
    setForm({ name: c.name, document_number: c.document_number, email: c.email, phone: c.phone, address: c.address, notes: c.notes });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('customers').update({
          name: form.name, document_number: form.document_number,
          email: form.email, phone: form.phone, address: form.address, notes: form.notes
        }).eq('id', editing.id);
        if (error) throw error;
        toast.success('Cliente actualizado');
      } else {
        const { error } = await supabase.from('customers').insert({
          company_id: companyId,
          name: form.name, document_number: form.document_number,
          email: form.email, phone: form.phone, address: form.address, notes: form.notes
        });
        if (error) throw error;
        toast.success('Cliente creado');
      }
      setShowModal(false);
      loadCustomers();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cliente? Se perderán sus datos (el historial de compras se conserva en facturas).')) return;
    setDeleting(id);
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      toast.success('Cliente eliminado');
      setCustomers(prev => prev.filter(c => c.id !== id));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(null);
    }
  };

  // ── Load detail sales for expanded row (uses allInvoices already loaded) ─
  const loadCustomerSales = useCallback((customer: CustomerRecord) => {
    setLoadingSales(true);
    const relevant = allInvoices.filter((s: any) => {
      const pm = s.payment_method || {};
      const docMatch = customer.document_number && pm.customer_document === customer.document_number;
      const nameMatch = !docMatch && customer.name &&
        (pm.customer_name || '').toLowerCase() === customer.name.toLowerCase();
      return docMatch || nameMatch;
    });
    setCustomerSales(relevant as SaleRecord[]);
    setLoadingSales(false);
  }, [allInvoices]);

  const toggleExpand = (customer: CustomerRecord) => {
    if (expandedId === customer.id) {
      setExpandedId(null);
    } else {
      setExpandedId(customer.id);
      loadCustomerSales(customer);
    }
  };

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const whatsapp = (phone: string, name: string) => {
    const clean = phone.replace(/\D/g, '');
    const msg = encodeURIComponent(`Hola ${name}, te contactamos desde nuestra tienda.`);
    window.open(`https://wa.me/57${clean}?text=${msg}`, '_blank');
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Historial de Clientes</h2>
          <p className="text-slate-500 text-sm">Gestión de clientes y su historial de compras</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={loadCustomers} />
          <button onClick={handleSyncNow} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm disabled:opacity-60"
            title="Importar clientes desde facturas existentes">
            <Zap size={16} /> Sincronizar facturas
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm shadow-sm">
            <Plus size={16} /> Nuevo Cliente
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Users size={18} className="text-blue-600" /></div>
            <div>
              <p className="text-xs text-slate-500">Total clientes</p>
              <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Star size={18} className="text-purple-600" /></div>
            <div>
              <p className="text-xs text-slate-500">Clientes VIP</p>
              <p className="text-2xl font-bold text-slate-800">{stats.vip}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg"><UserCheck size={18} className="text-amber-600" /></div>
            <div>
              <p className="text-xs text-slate-500">Frecuentes</p>
              <p className="text-2xl font-bold text-slate-800">{stats.frequent}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><TrendingUp size={18} className="text-green-600" /></div>
            <div>
              <p className="text-xs text-slate-500">Ingresos clientes</p>
              <p className="text-lg font-bold text-slate-800">{formatMoney(stats.totalRevenue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por nombre, cédula, email o teléfono..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'VIP', label: '💎 VIP' },
            { key: 'Frecuente', label: '⭐ Frecuente' },
            { key: 'Regular', label: '👤 Regular' },
            { key: 'Nuevo', label: '🆕 Nuevo' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterRank(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                filterRank === f.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">
          <div className="col-span-4">
            <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-slate-700">
              Cliente {sortBy === 'name' && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
            </button>
          </div>
          <div className="col-span-2 hidden md:block">Contacto</div>
          <div className="col-span-2">
            <button onClick={() => toggleSort('spent')} className="flex items-center gap-1 hover:text-slate-700">
              Total compras {sortBy === 'spent' && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
            </button>
          </div>
          <div className="col-span-1 hidden md:block">
            <button onClick={() => toggleSort('purchases')} className="flex items-center gap-1 hover:text-slate-700">
              # {sortBy === 'purchases' && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
            </button>
          </div>
          <div className="col-span-2 hidden md:block">
            <button onClick={() => toggleSort('last')} className="flex items-center gap-1 hover:text-slate-700">
              Última compra {sortBy === 'last' && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
            </button>
          </div>
          <div className="col-span-1 text-right">Acciones</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw size={20} className="animate-spin mr-2" /> Cargando clientes...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Users size={40} className="mb-3 opacity-30" />
            <p className="font-medium">
              {search || filterRank !== 'all' ? 'Sin resultados' : 'No hay clientes registrados'}
            </p>
            {!search && filterRank === 'all' && (
              <p className="text-sm mt-1">Agrega tu primer cliente con el botón "Nuevo Cliente"</p>
            )}
          </div>
        ) : (
          filtered.map(customer => {
            const rank = getRankLabel(customer.total_spent || 0);
            const isExpanded = expandedId === customer.id;
            return (
              <React.Fragment key={customer.id}>
                <div
                  className={`grid grid-cols-12 gap-2 px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                  onClick={() => toggleExpand(customer)}
                >
                  {/* Name + rank */}
                  <div className="col-span-4">
                    <div className="font-semibold text-slate-800 text-sm">{customer.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${rank.color}`}>{rank.label}</span>
                      {customer.document_number && (
                        <span className="text-xs text-slate-400 font-mono">{customer.document_number}</span>
                      )}
                    </div>
                  </div>
                  {/* Contact */}
                  <div className="col-span-2 hidden md:flex flex-col justify-center gap-0.5">
                    {customer.phone && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone size={11} /> {customer.phone}
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 truncate">
                        <Mail size={11} /> {customer.email}
                      </div>
                    )}
                  </div>
                  {/* Total spent */}
                  <div className="col-span-2 flex items-center">
                    <span className="font-bold text-sm text-slate-800">
                      {customer.total_spent ? formatMoney(customer.total_spent) : <span className="text-slate-300">—</span>}
                    </span>
                  </div>
                  {/* # purchases */}
                  <div className="col-span-1 hidden md:flex items-center">
                    <span className="text-sm text-slate-600">{customer.purchase_count || 0}</span>
                  </div>
                  {/* Last purchase */}
                  <div className="col-span-2 hidden md:flex items-center">
                    {customer.last_purchase ? (
                      <span className="text-xs text-slate-500">
                        {new Date(customer.last_purchase).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    ) : <span className="text-slate-300 text-xs">Sin compras</span>}
                  </div>
                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {customer.phone && (
                      <button onClick={() => whatsapp(customer.phone!, customer.name)}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="WhatsApp">
                        <MessageCircle size={14} />
                      </button>
                    )}
                    <button onClick={() => openEdit(customer)}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors" title="Editar">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(customer.id)} disabled={deleting === customer.id}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
                    <div className="grid md:grid-cols-3 gap-4 mb-4">
                      {/* Info */}
                      <div className="bg-white rounded-xl p-4 border border-blue-100">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Información</p>
                        {customer.address && (
                          <div className="flex items-start gap-2 text-sm text-slate-600 mb-1.5">
                            <MapPin size={14} className="text-slate-400 mt-0.5 flex-shrink-0" /> {customer.address}
                          </div>
                        )}
                        {customer.notes && (
                          <div className="flex items-start gap-2 text-sm text-slate-600">
                            <FileText size={14} className="text-slate-400 mt-0.5 flex-shrink-0" /> {customer.notes}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                          <Calendar size={12} />
                          Cliente desde {new Date(customer.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                      {/* Spending summary */}
                      <div className="bg-white rounded-xl p-4 border border-blue-100">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Resumen de Compras</p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Total gastado</span>
                            <span className="font-bold text-slate-800">{formatMoney(customer.total_spent || 0)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Nº de compras</span>
                            <span className="font-semibold text-slate-700">{customer.purchase_count || 0}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Ticket promedio</span>
                            <span className="font-semibold text-slate-700">{formatMoney(customer.avg_ticket || 0)}</span>
                          </div>
                        </div>
                      </div>
                      {/* Quick actions */}
                      <div className="bg-white rounded-xl p-4 border border-blue-100">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Acciones Rápidas</p>
                        <div className="space-y-2">
                          {customer.phone && (
                            <button onClick={() => whatsapp(customer.phone!, customer.name)}
                              className="w-full flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-semibold hover:bg-green-100 transition-colors">
                              <MessageCircle size={14} /> Enviar WhatsApp
                            </button>
                          )}
                          {customer.email && (
                            <button onClick={() => window.open(`mailto:${customer.email}`)}
                              className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors">
                              <Mail size={14} /> Enviar correo
                            </button>
                          )}
                          <button onClick={() => openEdit(customer)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-100 transition-colors">
                            <Edit2 size={14} /> Editar datos
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Purchase history */}
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                        <ShoppingBag size={13} /> Historial de compras (últimas 20)
                      </p>
                      {loadingSales ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                          <RefreshCw size={14} className="animate-spin" /> Cargando...
                        </div>
                      ) : customerSales.length === 0 ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                          <AlertCircle size={14} /> Sin facturas encontradas para este cliente
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {customerSales.map(s => (
                            <div key={s.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-blue-100 text-sm">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                                  #{s.invoice_number}
                                </span>
                                <span className="text-slate-500 text-xs">
                                  {new Date(s.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                  s.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {s.status === 'completed' ? 'Pagada' : s.status}
                                </span>
                                <span className="font-bold text-slate-800">{formatMoney(s.total_amount)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}

        {/* Footer count */}
        {filtered.length > 0 && (
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
            Mostrando {filtered.length} de {enriched.length} clientes
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <Users size={18} className="text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-800">{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Nombre completo *</label>
                <input type="text" value={form.name || ''} onChange={f('name')} placeholder="Ej: Juan Pérez"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Cédula / NIT</label>
                <input type="text" value={form.document_number || ''} onChange={f('document_number')} placeholder="1234567890"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono / WhatsApp</label>
                <input type="tel" value={form.phone || ''} onChange={f('phone')} placeholder="300 123 4567"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Correo electrónico</label>
                <input type="email" value={form.email || ''} onChange={f('email')} placeholder="cliente@email.com"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Dirección</label>
                <input type="text" value={form.address || ''} onChange={f('address')} placeholder="Calle 10 # 20-30, Bogotá"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Notas</label>
                <textarea value={form.notes || ''} onChange={f('notes')} rows={2} placeholder="Preferencias, observaciones..."
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><RefreshCw size={14} className="animate-spin" /> Guardando...</> : (editing ? 'Actualizar' : 'Crear Cliente')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;