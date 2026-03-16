import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, X, Edit2, Trash2, Eye, DollarSign,
  User, Phone, Mail, Package, CreditCard, CheckCircle,
  Clock, XCircle, AlertTriangle, Receipt, TrendingUp,
  ChevronDown, ChevronUp, Printer, RefreshCw, Calculator
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Apartado {
  id: string;
  company_id: string;
  branch_id?: string;
  product_id?: string;
  product_name: string;
  product_sku?: string;
  precio_contado: number;
  precio_apartado: number;
  interes_pesos: number;
  interes_porcentaje: number;
  abono_inicial: number;
  saldo_pendiente: number;
  num_cuotas: number;
  valor_cuota: number;
  cliente_nombre: string;
  cliente_documento?: string;
  cliente_telefono?: string;
  cliente_email?: string;
  estado: 'ACTIVO' | 'COMPLETADO' | 'CANCELADO' | 'ENTREGADO';
  notas?: string;
  fecha_apartado: string;
  fecha_limite?: string;
  created_at: string;
  // Calculado en frontend
  total_pagado?: number;
  pagos?: Pago[];
}

interface Pago {
  id: string;
  apartado_id: string;
  monto: number;
  metodo_pago: string;
  notas?: string;
  cajero?: string;
  fecha_pago: string;
}

type EstadoBadgeType = Apartado['estado'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const ESTADO_CONFIG: Record<EstadoBadgeType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ACTIVO:     { label: 'Activo',     color: '#3b82f6', bg: '#eff6ff', icon: <Clock size={12}/> },
  COMPLETADO: { label: 'Completado', color: '#10b981', bg: '#f0fdf4', icon: <CheckCircle size={12}/> },
  ENTREGADO:  { label: 'Entregado',  color: '#8b5cf6', bg: '#f5f3ff', icon: <Package size={12}/> },
  CANCELADO:  { label: 'Cancelado',  color: '#ef4444', bg: '#fef2f2', icon: <XCircle size={12}/> },
};

const EstadoBadge: React.FC<{ estado: EstadoBadgeType }> = ({ estado }) => {
  const cfg = ESTADO_CONFIG[estado] || ESTADO_CONFIG.ACTIVO;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color + '40' }}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ── Formulario vacío ──────────────────────────────────────────────────────────
const emptyForm = () => ({
  product_name: '',
  product_sku: '',
  product_id: '',
  precio_contado: '',
  precio_apartado: '',
  abono_inicial: '',
  num_cuotas: '1',
  cliente_nombre: '',
  cliente_documento: '',
  cliente_telefono: '',
  cliente_email: '',
  fecha_limite: '',
  notas: '',
});

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
const Apartados: React.FC = () => {
  const { companyId, branchId, session, products } = useDatabase();
  const { formatMoney } = useCurrency();

  const [apartados, setApartados]     = useState<Apartado[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [showModal, setShowModal]     = useState(false);
  const [showPagoModal, setShowPagoModal] = useState<Apartado | null>(null);
  const [showDetalle, setShowDetalle] = useState<Apartado | null>(null);
  const [editing, setEditing]         = useState<Apartado | null>(null);
  const [form, setForm]               = useState(emptyForm());
  const [montoPago, setMontoPago]     = useState('');
  const [metodoPago, setMetodoPago]   = useState('EFECTIVO');
  const [saving, setSaving]           = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Calculados del formulario ───────────────────────────────────────────
  const pc = parseFloat(form.precio_contado) || 0;
  const pa = parseFloat(form.precio_apartado) || 0;
  const ai = parseFloat(form.abono_inicial) || 0;
  const nc = parseInt(form.num_cuotas) || 1;
  const interesPesos = pa - pc;
  const interesPct = pc > 0 ? ((pa - pc) / pc * 100) : 0;
  const saldoPendiente = pa - ai;
  const valorCuota = nc > 0 ? Math.round(saldoPendiente / nc) : 0;

  // ── Cargar apartados ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: apts, error } = await supabase
        .from('apartados')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Cargar pagos para cada apartado
      const { data: pagos } = await supabase
        .from('apartados_pagos')
        .select('*')
        .eq('company_id', companyId)
        .order('fecha_pago', { ascending: true });

      const pagosPorApartado: Record<string, Pago[]> = {};
      (pagos || []).forEach(p => {
        if (!pagosPorApartado[p.apartado_id]) pagosPorApartado[p.apartado_id] = [];
        pagosPorApartado[p.apartado_id].push(p);
      });

      const enriched = (apts || []).map(apt => ({
        ...apt,
        pagos: pagosPorApartado[apt.id] || [],
        total_pagado: apt.abono_inicial + (pagosPorApartado[apt.id] || []).reduce((s, p) => s + p.monto, 0),
      }));

      setApartados(enriched);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // ── Guardar apartado ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.product_name.trim()) { toast.error('Nombre del producto requerido'); return; }
    if (!form.cliente_nombre.trim()) { toast.error('Nombre del cliente requerido'); return; }
    if (pc <= 0) { toast.error('Precio de contado requerido'); return; }
    if (pa <= 0) { toast.error('Precio de apartado requerido'); return; }
    if (ai < 0) { toast.error('El abono no puede ser negativo'); return; }
    if (ai > pa) { toast.error('El abono no puede ser mayor al precio de apartado'); return; }

    setSaving(true);
    try {
      const payload = {
        company_id:        companyId,
        branch_id:         branchId || null,
        product_id:        form.product_id || null,
        product_name:      form.product_name.trim(),
        product_sku:       form.product_sku || null,
        precio_contado:    pc,
        precio_apartado:   pa,
        abono_inicial:     ai,
        num_cuotas:        nc,
        cliente_nombre:    form.cliente_nombre.trim(),
        cliente_documento: form.cliente_documento || null,
        cliente_telefono:  form.cliente_telefono || null,
        cliente_email:     form.cliente_email || null,
        fecha_limite:      form.fecha_limite || null,
        notas:             form.notas || null,
        estado:            'ACTIVO',
      };

      if (editing?.id) {
        const { error } = await supabase.from('apartados').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Apartado actualizado');
      } else {
        const { error } = await supabase.from('apartados').insert(payload);
        if (error) throw error;

        // Registrar abono inicial en caja si hay sesión abierta
        if (ai > 0 && session?.id) {
          await supabase.from('cash_register_sessions')
            .update({ total_sales_cash: (session.total_sales_cash || 0) + ai })
            .eq('id', session.id);

          // Registrar en pagos del apartado
          // (se hace después de obtener el ID del apartado nuevo)
        }

        toast.success('Apartado creado');
      }

      setShowModal(false);
      setEditing(null);
      setForm(emptyForm());
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Registrar pago/abono ────────────────────────────────────────────────
  const handlePago = async () => {
    if (!showPagoModal) return;
    const monto = parseFloat(montoPago);
    if (!monto || monto <= 0) { toast.error('Ingresa un monto válido'); return; }

    const saldoReal = showPagoModal.precio_apartado - (showPagoModal.total_pagado || 0);
    if (monto > saldoReal) {
      toast.error(`El pago no puede superar el saldo: ${formatMoney(saldoReal)}`);
      return;
    }

    setSaving(true);
    try {
      // 1. Registrar pago
      const { error: pagoErr } = await supabase.from('apartados_pagos').insert({
        apartado_id: showPagoModal.id,
        company_id:  companyId,
        branch_id:   branchId || null,
        monto,
        metodo_pago: metodoPago,
        session_id:  session?.id || null,
      });
      if (pagoErr) throw pagoErr;

      // 2. Calcular nuevo total pagado
      const nuevoTotalPagado = (showPagoModal.total_pagado || 0) + monto;
      const nuevoEstado: Apartado['estado'] = nuevoTotalPagado >= showPagoModal.precio_apartado
        ? 'COMPLETADO' : 'ACTIVO';

      // 3. Actualizar estado si se completó
      if (nuevoEstado === 'COMPLETADO') {
        await supabase.from('apartados')
          .update({ estado: 'COMPLETADO' })
          .eq('id', showPagoModal.id);
      }

      // 4. Sumar a caja
      if (session?.id) {
        await supabase.from('cash_register_sessions')
          .update({ total_sales_cash: (session.total_sales_cash || 0) + monto })
          .eq('id', session.id);
      }

      toast.success(nuevoEstado === 'COMPLETADO'
        ? '🎉 ¡Apartado completado! Producto listo para entregar'
        : `Pago registrado. Saldo: ${formatMoney(saldoReal - monto)}`
      );

      setShowPagoModal(null);
      setMontoPago('');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Cambiar estado ──────────────────────────────────────────────────────
  const cambiarEstado = async (id: string, estado: Apartado['estado']) => {
    const { error } = await supabase.from('apartados').update({ estado }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado actualizado a ${ESTADO_CONFIG[estado].label}`);
    await load();
  };

  // ── Imprimir comprobante ────────────────────────────────────────────────
  const imprimirComprobante = (apt: Apartado) => {
    const totalPagado = apt.total_pagado || 0;
    const saldo = apt.precio_apartado - totalPagado;
    const html = `<!DOCTYPE html><html><head><title>Comprobante Apartado</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;max-width:400px;margin:0 auto;font-size:13px}
      h1{text-align:center;font-size:18px;margin-bottom:4px}
      .sub{text-align:center;color:#64748b;font-size:11px;margin-bottom:20px}
      .sep{border-top:1px dashed #94a3b8;margin:12px 0}
      .row{display:flex;justify-content:space-between;margin:4px 0}
      .label{color:#64748b}.val{font-weight:600}
      .total{font-size:16px;font-weight:800;color:#1e40af}
      .cuota{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;margin:10px 0;text-align:center}
      .cuota p{margin:0;font-size:14px;font-weight:700;color:#166534}
      .footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:20px}
    </style></head><body>
    <h1>APARTADO #${apt.id.slice(-6).toUpperCase()}</h1>
    <div class="sub">${new Date(apt.created_at).toLocaleDateString('es-CO')} · ${new Date(apt.created_at).toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'})}</div>
    <div class="sep"></div>
    <div class="row"><span class="label">Producto:</span><span class="val">${apt.product_name}</span></div>
    ${apt.product_sku ? `<div class="row"><span class="label">SKU:</span><span class="val">${apt.product_sku}</span></div>` : ''}
    <div class="sep"></div>
    <div class="row"><span class="label">Cliente:</span><span class="val">${apt.cliente_nombre}</span></div>
    ${apt.cliente_documento ? `<div class="row"><span class="label">Cédula:</span><span class="val">${apt.cliente_documento}</span></div>` : ''}
    ${apt.cliente_telefono ? `<div class="row"><span class="label">Teléfono:</span><span class="val">${apt.cliente_telefono}</span></div>` : ''}
    <div class="sep"></div>
    <div class="row"><span class="label">Precio contado:</span><span class="val">${formatMoney(apt.precio_contado)}</span></div>
    <div class="row"><span class="label">Precio apartado:</span><span class="val">${formatMoney(apt.precio_apartado)}</span></div>
    <div class="row"><span class="label">Interés:</span><span class="val">${formatMoney(apt.interes_pesos)} (${apt.interes_porcentaje}%)</span></div>
    <div class="sep"></div>
    <div class="row"><span class="label">Abono inicial:</span><span class="val">${formatMoney(apt.abono_inicial)}</span></div>
    <div class="row"><span class="label">Total pagado:</span><span class="val">${formatMoney(totalPagado)}</span></div>
    <div class="row total"><span>Saldo pendiente:</span><span>${formatMoney(saldo)}</span></div>
    ${apt.num_cuotas > 1 ? `
    <div class="cuota">
      <p>${apt.num_cuotas} cuota(s) de ${formatMoney(apt.valor_cuota)}</p>
    </div>` : ''}
    ${apt.fecha_limite ? `<div class="row"><span class="label">Fecha límite:</span><span class="val">${apt.fecha_limite}</span></div>` : ''}
    ${apt.notas ? `<div class="sep"></div><div style="font-size:11px;color:#64748b">${apt.notas}</div>` : ''}
    <div class="footer">Este comprobante es válido como prueba de apartado.<br>Consérvelo para sus registros.</div>
    </body></html>`;
    const w = window.open('', '_blank');
    w?.document.write(html);
    w?.document.close();
    w?.print();
  };

  // ── Filtros ─────────────────────────────────────────────────────────────
  const filtrados = apartados.filter(a => {
    const matchEstado = filtroEstado === 'TODOS' || a.estado === filtroEstado;
    const matchSearch = !search ||
      a.product_name.toLowerCase().includes(search.toLowerCase()) ||
      a.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
      (a.cliente_documento || '').includes(search) ||
      (a.cliente_telefono || '').includes(search);
    return matchEstado && matchSearch;
  });

  const productsFiltrados = products.filter(p =>
    searchProduct &&
    (p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
     p.sku.toLowerCase().includes(searchProduct.toLowerCase()))
  ).slice(0, 8);

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = {
    activos:    apartados.filter(a => a.estado === 'ACTIVO').length,
    completados: apartados.filter(a => a.estado === 'COMPLETADO' || a.estado === 'ENTREGADO').length,
    totalCapital: apartados.filter(a => a.estado === 'ACTIVO')
      .reduce((s, a) => s + (a.precio_apartado - (a.total_pagado || 0)), 0),
    totalAbonado: apartados.filter(a => a.estado === 'ACTIVO')
      .reduce((s, a) => s + (a.total_pagado || 0), 0),
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package size={24} className="text-blue-600"/> Sistema de Apartados
          </h2>
          <p className="text-slate-500 text-sm">Gestión de productos separados con abonos y cuotas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500">
            <RefreshCw size={16}/>
          </button>
          <button onClick={() => { setEditing(null); setForm(emptyForm()); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">
            <Plus size={16}/> Nuevo Apartado
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Apartados activos',  value: stats.activos,              icon: <Clock size={20}/>,       color: '#3b82f6' },
          { label: 'Completados',        value: stats.completados,          icon: <CheckCircle size={20}/>, color: '#10b981' },
          { label: 'Capital pendiente',  value: formatMoney(stats.totalCapital), icon: <AlertTriangle size={20}/>, color: '#f59e0b' },
          { label: 'Total abonado',      value: formatMoney(stats.totalAbonado), icon: <TrendingUp size={20}/>,    color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: s.color + '18', color: s.color }}>
              {s.icon}
            </div>
            <div>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-lg font-bold text-slate-800">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input placeholder="Buscar por producto, cliente o cédula..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>
        <div className="flex gap-1">
          {['TODOS','ACTIVO','COMPLETADO','ENTREGADO','CANCELADO'].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filtroEstado === e ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}>
              {e === 'TODOS' ? 'Todos' : ESTADO_CONFIG[e as EstadoBadgeType]?.label || e}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2"/>
            Cargando apartados...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Package size={40} className="mx-auto mb-3 opacity-30"/>
            <p className="font-medium">No hay apartados</p>
            <p className="text-xs mt-1">Crea el primero con el botón "Nuevo Apartado"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Producto','Cliente','Precio Apart.','Abonado','Saldo','Cuotas','Estado','Acciones'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map(apt => {
                  const totalPagado = apt.total_pagado || 0;
                  const saldoReal = apt.precio_apartado - totalPagado;
                  const pctPagado = apt.precio_apartado > 0 ? (totalPagado / apt.precio_apartado * 100) : 0;
                  return (
                    <tr key={apt.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{apt.product_name}</p>
                        {apt.product_sku && <p className="text-xs text-slate-400 font-mono">{apt.product_sku}</p>}
                        <p className="text-xs text-slate-400">{apt.fecha_apartado}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700">{apt.cliente_nombre}</p>
                        {apt.cliente_documento && <p className="text-xs text-slate-400">{apt.cliente_documento}</p>}
                        {apt.cliente_telefono && (
                          <a href={`https://wa.me/57${apt.cliente_telefono.replace(/\D/g,'')}`}
                            target="_blank" rel="noreferrer"
                            className="text-xs text-green-600 hover:underline">
                            📱 {apt.cliente_telefono}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800">{formatMoney(apt.precio_apartado)}</p>
                        {apt.interes_pesos > 0 && (
                          <p className="text-xs text-amber-600">+{formatMoney(apt.interes_pesos)} ({apt.interes_porcentaje}%)</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-green-600">{formatMoney(totalPagado)}</p>
                        <div className="w-20 h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${Math.min(pctPagado, 100)}%` }}/>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{Math.round(pctPagado)}% pagado</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`font-bold ${saldoReal > 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {formatMoney(Math.max(0, saldoReal))}
                        </p>
                        {apt.fecha_limite && (
                          <p className="text-xs text-slate-400">Límite: {apt.fecha_limite}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {apt.num_cuotas > 1 ? (
                          <div>
                            <p className="font-semibold text-slate-700">{apt.num_cuotas} cuotas</p>
                            <p className="text-xs text-blue-600">{formatMoney(apt.valor_cuota)}/cuota</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Pago único</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><EstadoBadge estado={apt.estado}/></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {apt.estado === 'ACTIVO' && (
                            <button onClick={() => { setShowPagoModal(apt); setMontoPago(''); }}
                              className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                              title="Registrar pago">
                              <DollarSign size={14}/>
                            </button>
                          )}
                          <button onClick={() => setShowDetalle(apt)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors" title="Ver detalle">
                            <Eye size={14}/>
                          </button>
                          <button onClick={() => imprimirComprobante(apt)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors" title="Imprimir">
                            <Printer size={14}/>
                          </button>
                          {apt.estado === 'COMPLETADO' && (
                            <button onClick={() => cambiarEstado(apt.id, 'ENTREGADO')}
                              className="p-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                              title="Marcar como entregado">
                              <Package size={14}/>
                            </button>
                          )}
                          {apt.estado === 'ACTIVO' && (
                            <button onClick={() => cambiarEstado(apt.id, 'CANCELADO')}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors" title="Cancelar">
                              <XCircle size={14}/>
                            </button>
                          )}
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

      {/* ── MODAL NUEVO/EDITAR APARTADO ──────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">

            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <Package size={18}/> {editing ? 'Editar Apartado' : 'Nuevo Apartado'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Producto */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                  <Package size={12}/> Producto Apartado
                </p>
                <div className="grid grid-cols-1 gap-3">
                  <div className="relative" ref={searchRef}>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">
                      Buscar en inventario <span className="text-slate-400 font-normal">(opcional)</span>
                    </label>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input
                        placeholder="Buscar producto del inventario..."
                        value={searchProduct}
                        onFocus={() => setShowProductSearch(true)}
                        onChange={e => { setSearchProduct(e.target.value); setShowProductSearch(true); }}
                        className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"
                      />
                    </div>
                    {showProductSearch && productsFiltrados.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
                        {productsFiltrados.map(p => (
                          <button key={p.id} onClick={() => {
                            setForm(f => ({ ...f, product_id: p.id, product_name: p.name, product_sku: p.sku, precio_contado: String(p.price) }));
                            setSearchProduct(p.name);
                            setShowProductSearch(false);
                          }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0">
                            <div>
                              <p className="font-semibold text-sm text-slate-700">{p.name}</p>
                              <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                            </div>
                            <span className="font-bold text-blue-600 text-sm">{formatMoney(p.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Nombre del producto *</label>
                      <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                        placeholder="Ej: iPhone 15 Pro 256GB Negro"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">SKU / Referencia</label>
                      <input value={form.product_sku} onChange={e => setForm(f => ({ ...f, product_sku: e.target.value }))}
                        placeholder="SKU-001"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                    </div>
                  </div>
                </div>
              </div>

              {/* Precios */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                  <Calculator size={12}/> Precios y Cuotas
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Precio de contado *</label>
                    <input type="number" value={form.precio_contado}
                      onChange={e => setForm(f => ({ ...f, precio_contado: e.target.value }))}
                      placeholder="1500000"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">
                      Precio de apartado *
                      <span className="ml-1 text-slate-400 font-normal">(con interés)</span>
                    </label>
                    <input type="number" value={form.precio_apartado}
                      onChange={e => setForm(f => ({ ...f, precio_apartado: e.target.value }))}
                      placeholder="1650000"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Abono inicial</label>
                    <input type="number" value={form.abono_inicial}
                      onChange={e => setForm(f => ({ ...f, abono_inicial: e.target.value }))}
                      placeholder="600000"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Número de cuotas</label>
                    <input type="number" min="1" value={form.num_cuotas}
                      onChange={e => setForm(f => ({ ...f, num_cuotas: e.target.value }))}
                      placeholder="3"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                </div>

                {/* Resumen calculado */}
                {pa > 0 && (
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-xs text-slate-500">Interés</p>
                      <p className="font-bold text-amber-600">{formatMoney(interesPesos)}</p>
                      <p className="text-[10px] text-slate-400">{interesPct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Saldo pendiente</p>
                      <p className="font-bold text-red-600">{formatMoney(saldoPendiente)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Valor por cuota</p>
                      <p className="font-bold text-blue-600">{formatMoney(valorCuota)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Total a pagar</p>
                      <p className="font-bold text-slate-800">{formatMoney(pa)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Cliente */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                  <User size={12}/> Datos del Cliente
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Nombre completo *</label>
                    <input value={form.cliente_nombre} onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))}
                      placeholder="Nombre del cliente"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Cédula / NIT</label>
                    <input value={form.cliente_documento} onChange={e => setForm(f => ({ ...f, cliente_documento: e.target.value }))}
                      placeholder="1234567890"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Teléfono</label>
                    <input value={form.cliente_telefono} onChange={e => setForm(f => ({ ...f, cliente_telefono: e.target.value }))}
                      placeholder="3001234567"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Email</label>
                    <input value={form.cliente_email} onChange={e => setForm(f => ({ ...f, cliente_email: e.target.value }))}
                      placeholder="cliente@email.com"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Fecha límite pago</label>
                    <input type="date" value={form.fecha_limite} onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Notas</label>
                    <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                      rows={2} placeholder="Observaciones del apartado..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"/>
                  </div>
                </div>
              </div>

            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Apartado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL REGISTRAR PAGO ─────────────────────────────────────────── */}
      {showPagoModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-green-600 to-emerald-600">
              <h3 className="font-bold text-white flex items-center gap-2"><DollarSign size={18}/> Registrar Pago</h3>
              <button onClick={() => setShowPagoModal(null)} className="text-white/70 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Info apartado */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Producto:</span>
                  <span className="font-semibold">{showPagoModal.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-semibold">{showPagoModal.cliente_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total apartado:</span>
                  <span className="font-bold">{formatMoney(showPagoModal.precio_apartado)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ya pagado:</span>
                  <span className="font-bold text-green-600">{formatMoney(showPagoModal.total_pagado || 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-slate-500 font-semibold">Saldo pendiente:</span>
                  <span className="font-bold text-red-600 text-base">
                    {formatMoney(showPagoModal.precio_apartado - (showPagoModal.total_pagado || 0))}
                  </span>
                </div>
                {showPagoModal.num_cuotas > 1 && (
                  <div className="flex justify-between bg-blue-50 rounded-lg px-3 py-2">
                    <span className="text-blue-600 text-xs">Valor cuota sugerido:</span>
                    <span className="font-bold text-blue-700">{formatMoney(showPagoModal.valor_cuota)}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Monto del pago *</label>
                <input type="number" value={montoPago} onChange={e => setMontoPago(e.target.value)}
                  placeholder="0" autoFocus
                  className="w-full border border-slate-200 rounded-lg px-3 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-400"/>
                {/* Botón de cuota sugerida */}
                {showPagoModal.num_cuotas > 1 && showPagoModal.valor_cuota > 0 && (
                  <button onClick={() => setMontoPago(String(showPagoModal.valor_cuota))}
                    className="mt-2 text-xs text-blue-600 underline">
                    Usar valor de cuota: {formatMoney(showPagoModal.valor_cuota)}
                  </button>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Método de pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {['EFECTIVO','TRANSFERENCIA','TARJETA'].map(m => (
                    <button key={m} onClick={() => setMetodoPago(m)}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                        metodoPago === m ? 'bg-green-600 text-white border-green-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      {m === 'EFECTIVO' ? '💵 Efectivo' : m === 'TRANSFERENCIA' ? '🏦 Transf.' : '💳 Tarjeta'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {montoPago && parseFloat(montoPago) > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
                  {(() => {
                    const monto = parseFloat(montoPago);
                    const saldoActual = showPagoModal.precio_apartado - (showPagoModal.total_pagado || 0);
                    const saldoNuevo = saldoActual - monto;
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Nuevo saldo:</span>
                          <span className={`font-bold ${saldoNuevo <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {saldoNuevo <= 0 ? '✅ PAGADO COMPLETO' : formatMoney(saldoNuevo)}
                          </span>
                        </div>
                        {metodoPago === 'EFECTIVO' && (
                          <div className="flex justify-between mt-1 text-xs text-slate-500">
                            <span>Se sumará al arqueo de caja</span>
                            <span className="font-semibold text-green-600">+{formatMoney(monto)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowPagoModal(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600">
                Cancelar
              </button>
              <button onClick={handlePago} disabled={saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Registrando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE ────────────────────────────────────────────────── */}
      {showDetalle && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg">Detalle del Apartado</h3>
              <div className="flex gap-2">
                <button onClick={() => imprimirComprobante(showDetalle)}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500">
                  <Printer size={16}/>
                </button>
                <button onClick={() => setShowDetalle(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <EstadoBadge estado={showDetalle.estado}/>
                <span className="text-xs text-slate-400">#{showDetalle.id.slice(-8).toUpperCase()}</span>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <p className="font-bold text-slate-700 text-base">{showDetalle.product_name}</p>
                {showDetalle.product_sku && <p className="text-xs font-mono text-slate-400">{showDetalle.product_sku}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-100 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Precio contado</p>
                  <p className="font-bold text-slate-700">{formatMoney(showDetalle.precio_contado)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Precio apartado</p>
                  <p className="font-bold text-amber-700">{formatMoney(showDetalle.precio_apartado)}</p>
                  <p className="text-xs text-amber-500">+{formatMoney(showDetalle.interes_pesos)} ({showDetalle.interes_porcentaje}%)</p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Total pagado</p>
                  <p className="font-bold text-green-600">{formatMoney(showDetalle.total_pagado || 0)}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Saldo pendiente</p>
                  <p className="font-bold text-red-600">
                    {formatMoney(Math.max(0, showDetalle.precio_apartado - (showDetalle.total_pagado || 0)))}
                  </p>
                </div>
              </div>

              {showDetalle.num_cuotas > 1 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-blue-500 mb-1">{showDetalle.num_cuotas} cuotas pactadas</p>
                  <p className="text-2xl font-extrabold text-blue-700">{formatMoney(showDetalle.valor_cuota)}</p>
                  <p className="text-xs text-blue-500">por cuota</p>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Cliente:</span><span className="font-semibold">{showDetalle.cliente_nombre}</span></div>
                {showDetalle.cliente_documento && <div className="flex justify-between"><span className="text-slate-400">Cédula:</span><span>{showDetalle.cliente_documento}</span></div>}
                {showDetalle.cliente_telefono && <div className="flex justify-between"><span className="text-slate-400">Teléfono:</span><span>{showDetalle.cliente_telefono}</span></div>}
                {showDetalle.fecha_limite && <div className="flex justify-between"><span className="text-slate-400">Fecha límite:</span><span className="font-semibold text-red-600">{showDetalle.fecha_limite}</span></div>}
              </div>

              {/* Historial de pagos */}
              {showDetalle.pagos && showDetalle.pagos.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Historial de Pagos</p>
                  <div className="space-y-2">
                    <div className="flex justify-between px-3 py-2 bg-blue-50 rounded-lg text-xs">
                      <span className="text-blue-600 font-semibold">Abono inicial</span>
                      <span className="font-bold text-blue-700">{formatMoney(showDetalle.abono_inicial)}</span>
                    </div>
                    {showDetalle.pagos.map((p, i) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-lg text-xs">
                        <div>
                          <span className="font-semibold text-green-700">Cuota {i + 1}</span>
                          <span className="text-slate-400 ml-2">{new Date(p.fecha_pago).toLocaleDateString('es-CO')}</span>
                          <span className="ml-2 text-slate-400">{p.metodo_pago}</span>
                        </div>
                        <span className="font-bold text-green-700">{formatMoney(p.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showDetalle.notas && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Notas</p>
                  <p className="text-sm text-slate-600">{showDetalle.notas}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Apartados;
