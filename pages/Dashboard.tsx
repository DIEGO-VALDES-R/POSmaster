import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  DollarSign, TrendingUp, Package, AlertCircle,
  ShoppingCart, Wrench, ArrowUpRight, ArrowDownRight, Calendar,
  Droplets, Car, Clock, CheckCircle
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';
import RefreshButton from '../components/RefreshButton';

// ── TIPOS DE PERÍODO ──────────────────────────────────────────────────────────
type Period = 'week' | 'month' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  week:  'Esta semana',
  month: 'Este mes',
  year:  'Este año',
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const startOf = (period: Period): Date => {
  const d = new Date();
  if (period === 'week')  { d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); }
  if (period === 'month') { d.setDate(1); d.setHours(0,0,0,0); }
  if (period === 'year')  { d.setMonth(0,1); d.setHours(0,0,0,0); }
  return d;
};

const prevPeriodStart = (period: Period): Date => {
  const d = new Date();
  if (period === 'week')  { d.setDate(d.getDate() - d.getDay() - 7); d.setHours(0,0,0,0); }
  if (period === 'month') { d.setMonth(d.getMonth()-1, 1); d.setHours(0,0,0,0); }
  if (period === 'year')  { d.setFullYear(d.getFullYear()-1, 0, 1); d.setHours(0,0,0,0); }
  return d;
};

// ── STAT CARD ─────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, subtext, icon: Icon, color = 'blue', trend }: any) => {
  const colors: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-600',
    green:  'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
  };
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1 truncate">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg flex-shrink-0 ml-3 ${colors[color]}`}>
          <Icon size={22} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-slate-400 text-xs">{subtext}</p>
        {trend !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
};

// ── CUSTOM TOOLTIP ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: {formatter ? formatter(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

// ── REPAIR STATUS COLORS ──────────────────────────────────────────────────────
const REPAIR_COLORS: Record<string, string> = {
  RECEIVED:    '#3b82f6',
  DIAGNOSING:  '#f59e0b',
  IN_PROGRESS: '#8b5cf6',
  WAITING:     '#64748b',
  READY:       '#10b981',
  DELIVERED:   '#94a3b8',
  CANCELLED:   '#ef4444',
};
const REPAIR_LABELS: Record<string, string> = {
  RECEIVED:    'Recibido',
  DIAGNOSING:  'Diagnóstico',
  IN_PROGRESS: 'En proceso',
  WAITING:     'Esperando',
  READY:       'Listo',
  DELIVERED:   'Entregado',
  CANCELLED:   'Cancelado',
};

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { products, repairs, sales, isLoading, company, companyId, refreshAll } = useDatabase();

  const [period, setPeriod] = useState<Period>('week');
  const [chartReady, setChartReady] = useState(false);

  // ── Gastos operativos del período ─────────────────────────────────────────
  const [opExpenses, setOpExpenses] = useState(0);
  const [pendingExpenses, setPendingExpenses] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      const now = new Date();
      const start = startOf(period);
      const fromISO = start.toISOString();
      const toISO   = now.toISOString();
      const [{ data: expData }, { data: pendData }] = await Promise.all([
        supabase
          .from('expenses')
          .select('amount')
          .eq('company_id', companyId)
          .neq('status', 'CANCELLED')
          .gte('expense_date', fromISO.slice(0,10))
          .lte('expense_date', toISO.slice(0,10)),
        supabase
          .from('expenses')
          .select('id, description, amount, due_date, status, expense_categories(name, color)')
          .eq('company_id', companyId)
          .in('status', ['PENDING', 'OVERDUE'])
          .order('due_date', { ascending: true })
          .limit(5),
      ]);
      const total = (expData || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
      setOpExpenses(total);
      setPendingExpenses(pendData || []);
    };
    load();
  }, [companyId, period]);

  // ── Tipo de negocio ACTIVO (lee el que está seleccionado en el sidebar) ──────
  // Layout guarda en localStorage el tipo activo cuando el usuario cambia de sección
  const [activeBusinessType, setActiveBusinessType] = useState<string>(() => {
    return localStorage.getItem('posmaster_active_business_type') || 'general';
  });

  // Escuchar cambios de sección mientras el Dashboard está montado
  useEffect(() => {
    const check = () => {
      const bt = localStorage.getItem('posmaster_active_business_type') || 'general';
      setActiveBusinessType(bt);
    };
    // Chequear al montar y cada vez que el storage cambia
    check();
    window.addEventListener('storage', check);
    // También chequear periódicamente por si cambia en la misma pestaña
    const t = setInterval(check, 500);
    return () => { window.removeEventListener('storage', check); clearInterval(t); };
  }, []);

  const cfg = (company?.config as any) || {};
  const businessTypes: string[] = Array.isArray(cfg.business_types)
    ? cfg.business_types
    : cfg.business_type ? [cfg.business_type] : ['general'];

  // Usar el tipo ACTIVO del sidebar, no todos los tipos del negocio
  const activeType = activeBusinessType;
  const isZapateria  = activeType === 'zapateria';
  const isSalon      = activeType === 'salon';
  const isRestaurant = activeType === 'restaurante';
  const isLavadero   = activeType === 'lavadero';
  const isVeterinaria = activeType === 'veterinaria';
  const isOdontologia = activeType === 'odontologia';
  const isFarmacia   = activeType === 'farmacia';
  const showRepairs  = !isZapateria && !isSalon && !isRestaurant && !isLavadero && !isVeterinaria && !isOdontologia;
  // Negocios que tienen inventario físico relevante
  const TIPOS_CON_INVENTARIO = ['general','tienda_tecnologia','ropa','zapateria','ferreteria','supermercado','otro'];
  const showInventory = TIPOS_CON_INVENTARIO.includes(activeType);
  const showTop5      = TIPOS_CON_INVENTARIO.includes(activeType);

  // ── Stats de lavadero ─────────────────────────────────────────────────────
  const [lavaderoStats, setLavaderoStats] = useState({
    esperando: 0, enProceso: 0, listos: 0,
    totalHoy: 0, totalMes: 0, ordenesHoy: 0,
  });

  useEffect(() => {
    if (!isLavadero || !company?.id) return;
    const load = async () => {
      const hoy = new Date().toISOString().split('T')[0];
      const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [{ data: activas }, { data: hoyOrd }, { data: mesOrd }] = await Promise.all([
        supabase.from('lavadero_ordenes').select('estado')
          .eq('company_id', company.id).in('estado', ['ESPERANDO','EN_PROCESO','LISTO']),
        supabase.from('lavadero_ordenes').select('servicio_precio')
          .eq('company_id', company.id).eq('estado', 'ENTREGADO')
          .gte('created_at', hoy),
        supabase.from('lavadero_ordenes').select('servicio_precio')
          .eq('company_id', company.id).eq('estado', 'ENTREGADO')
          .gte('created_at', mesInicio),
      ]);
      setLavaderoStats({
        esperando: activas?.filter(o => o.estado === 'ESPERANDO').length || 0,
        enProceso: activas?.filter(o => o.estado === 'EN_PROCESO').length || 0,
        listos:    activas?.filter(o => o.estado === 'LISTO').length || 0,
        totalHoy:  hoyOrd?.reduce((s, o) => s + (o.servicio_precio || 0), 0) || 0,
        totalMes:  mesOrd?.reduce((s, o) => s + (o.servicio_precio || 0), 0) || 0,
        ordenesHoy: hoyOrd?.length || 0,
      });
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [isLavadero, company?.id]);

  useEffect(() => {
    const t = setTimeout(() => setChartReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // ── FILTRAR VENTAS POR PERÍODO ────────────────────────────────────────────
  const { currentSales, prevSales } = useMemo(() => {
    const start = startOf(period);
    const prevStart = prevPeriodStart(period);
    // Solo mostrar ventas del tipo de negocio activo (o sin tipo = legacy)
    const salesByType = sales.filter((s: any) =>
      !s.business_type || businessTypes.includes(s.business_type)
    );
    const current = salesByType.filter((s: any) => new Date(s.created_at) >= start);
    const prev    = salesByType.filter((s: any) => {
      const d = new Date(s.created_at);
      return d >= prevStart && d < start;
    });
    return { currentSales: current, prevSales: prev };
  }, [sales, period, businessTypes]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalSales     = currentSales.reduce((s: number, v: any) => s + (v.total_amount || 0), 0);
  const prevTotal      = prevSales.reduce((s: number, v: any) => s + (v.total_amount || 0), 0);
  const salesTrend     = prevTotal > 0 ? ((totalSales - prevTotal) / prevTotal) * 100 : undefined;

  // Productos pesables: stock en gramos → convertir a kg para valor y mostrar correctamente
  const normalProducts  = products.filter((p: any) => p.type !== 'WEIGHABLE');
  const weighableProducts = products.filter((p: any) => p.type === 'WEIGHABLE');

  const totalUnidades = normalProducts.reduce((s, p) => s + (p.stock_quantity || 0), 0)
    + weighableProducts.length; // pesables cuentan como 1 referencia c/u, no por gramos

  const inventoryValuePrecio =
    normalProducts.reduce((s, p) => s + (p.price * (p.stock_quantity || 0)), 0) +
    weighableProducts.reduce((s, p: any) => {
      const kg = (p.stock_quantity || 0) / 1000; // gramos → kg
      const pricePerKg = p.price_per_unit || p.price || 0;
      return s + (pricePerKg * kg);
    }, 0);

  const inventoryValueCosto =
    normalProducts.reduce((s, p) => s + ((p.cost || 0) * (p.stock_quantity || 0)), 0) +
    weighableProducts.reduce((s, p: any) => {
      const kg = (p.stock_quantity || 0) / 1000;
      return s + ((p.cost || 0) * kg);
    }, 0);

  const gananciaPotencial = inventoryValuePrecio - inventoryValueCosto;

  // Utilidad real = ventas - costo de los productos vendidos (aprox por margen promedio)
  const avgMarginRate = inventoryValuePrecio > 0
    ? (inventoryValuePrecio - inventoryValueCosto) / inventoryValuePrecio
    : 0.25;
  const utilidadEstimada = totalSales * avgMarginRate;

  // Utilidad neta = utilidad bruta estimada - gastos operativos del período
  const utilidadNeta = utilidadEstimada - opExpenses;

  const activeRepairs = repairs.filter((r: any) => !['DELIVERED','CANCELLED'].includes(r.status)).length;
  const readyRepairs  = repairs.filter((r: any) => r.status === 'READY').length;

  // ── GRÁFICA VENTAS POR DÍA / MES ─────────────────────────────────────────
  const salesChart = useMemo(() => {
    if (period === 'week') {
      const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      const grouped: Record<string, { current: number; prev: number }> = {};
      DAY_NAMES.forEach(d => { grouped[d] = { current: 0, prev: 0 }; });
      currentSales.forEach((s: any) => {
        const d = DAY_NAMES[new Date(s.created_at).getDay()];
        grouped[d].current += s.total_amount || 0;
      });
      prevSales.forEach((s: any) => {
        const d = DAY_NAMES[new Date(s.created_at).getDay()];
        grouped[d].prev += s.total_amount || 0;
      });
      return DAY_NAMES.map(name => ({ name, ...grouped[name] }));
    }
    if (period === 'month') {
      const weeks = ['Sem 1','Sem 2','Sem 3','Sem 4'];
      const grouped: Record<string, number> = { 'Sem 1': 0, 'Sem 2': 0, 'Sem 3': 0, 'Sem 4': 0 };
      currentSales.forEach((s: any) => {
        const day = new Date(s.created_at).getDate();
        const w = day <= 7 ? 'Sem 1' : day <= 14 ? 'Sem 2' : day <= 21 ? 'Sem 3' : 'Sem 4';
        grouped[w] += s.total_amount || 0;
      });
      return weeks.map(name => ({ name, current: grouped[name], prev: 0 }));
    }
    // year
    const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const grouped: Record<string, number> = {};
    MONTHS.forEach(m => { grouped[m] = 0; });
    currentSales.forEach((s: any) => {
      const m = MONTHS[new Date(s.created_at).getMonth()];
      grouped[m] += s.total_amount || 0;
    });
    return MONTHS.map(name => ({ name, current: grouped[name], prev: 0 }));
  }, [currentSales, prevSales, period]);

  // ── GRÁFICA REPARACIONES POR ESTADO ──────────────────────────────────────
  const repairChart = useMemo(() => {
    const grouped: Record<string, number> = {};
    repairs.forEach((r: any) => {
      grouped[r.status] = (grouped[r.status] || 0) + 1;
    });
    return Object.entries(grouped)
      .filter(([, v]) => v > 0)
      .map(([status, count]) => ({
        name: REPAIR_LABELS[status] || status,
        value: count,
        color: REPAIR_COLORS[status] || '#94a3b8',
      }));
  }, [repairs]);

  // ── TOP PRODUCTOS ─────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const effectivePrice = (p: any) => p.type === 'WEIGHABLE' ? (p.price_per_unit || p.price || 0) : (p.price || 0);
    return [...products]
      .sort((a: any, b: any) => (effectivePrice(b) - (b.cost||0)) - (effectivePrice(a) - (a.cost||0)))
      .slice(0, 5);
  }, [products]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            {isLavadero ? '🚿' : isVeterinaria ? '🐾' : isOdontologia ? '🦷' : isSalon ? '💇' : isFarmacia ? '💊' : isRestaurant ? '🍽️' : '📊'}
            {' '}Dashboard
            {isLavadero && <span className="text-sm font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Lavadero</span>}
            {isVeterinaria && <span className="text-sm font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Veterinaria</span>}
            {isOdontologia && <span className="text-sm font-normal text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">Odontología</span>}
            {isSalon && <span className="text-sm font-normal text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full">Salón</span>}
          </h2>
          <p className="text-slate-500 text-sm">{company?.name || 'POSmaster'}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={refreshAll} />
          <Calendar size={16} className="text-slate-400" />
          <div className="flex bg-white border border-slate-200 rounded-lg p-1 gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI CARDS — cambian según el tipo de negocio activo ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* ── LAVADERO ── */}
        {isLavadero ? (
          <>
            <StatCard
              title="Ingresos hoy"
              value={formatMoney(lavaderoStats.totalHoy)}
              subtext={`${lavaderoStats.ordenesHoy} vehículos entregados hoy`}
              icon={DollarSign} color="blue"
            />
            <StatCard
              title="Ingresos del mes"
              value={formatMoney(lavaderoStats.totalMes)}
              subtext="Total cobrado este mes"
              icon={TrendingUp} color="green"
            />
            <StatCard
              title="En proceso ahora"
              value={lavaderoStats.enProceso.toString()}
              subtext={`${lavaderoStats.esperando} esperando · ${lavaderoStats.listos} listos`}
              icon={Droplets} color="purple"
            />
            <StatCard
              title="Ventas del período"
              value={formatMoney(totalSales)}
              subtext={`${currentSales.length} servicios facturados`}
              icon={Car} color="orange"
              trend={salesTrend}
            />
          </>
        ) : (
          <>
            {/* ── RESTO DE NEGOCIOS ── */}
            <StatCard
              title="Ventas del período"
              value={formatMoney(totalSales)}
              subtext={`${currentSales.length} facturas`}
              icon={DollarSign} color="blue"
              trend={salesTrend}
            />
            <StatCard
              title="Utilidad estimada"
              value={formatMoney(utilidadEstimada)}
              subtext={`Margen ~${(avgMarginRate * 100).toFixed(0)}% sobre ventas`}
              icon={TrendingUp} color="green"
            />
            <StatCard
              title="Gastos operativos"
              value={formatMoney(opExpenses)}
              subtext={`${PERIOD_LABELS[period]}`}
              icon={ArrowDownRight} color="orange"
            />
            <StatCard
              title="Utilidad neta est."
              value={formatMoney(utilidadNeta)}
              subtext="Ut. bruta − gastos operativos"
              icon={TrendingUp} color={utilidadNeta >= 0 ? 'green' : 'orange'}
            />
            {showTop5 && (
              <StatCard
                title="Inventario (precio venta)"
                value={formatMoney(inventoryValuePrecio)}
                subtext={`${totalUnidades} uds · ${products.length} refs${weighableProducts.length > 0 ? ` · ${weighableProducts.length} pesables` : ''}`}
                icon={Package} color="purple"
              />
            )}
            {showRepairs && (
              <StatCard
                title="Reparaciones activas"
                value={activeRepairs.toString()}
                subtext={`${readyRepairs} listas para entregar`}
                icon={Wrench} color="orange"
              />
            )}
            {isZapateria && (
              <StatCard
                title="Órdenes activas"
                value={activeRepairs.toString()}
                subtext={`${readyRepairs} pendientes de entrega`}
                icon={ShoppingCart} color="orange"
              />
            )}
            {(isSalon || isVeterinaria || isOdontologia) && (
              <StatCard
                title="Servicios del período"
                value={currentSales.length.toString()}
                subtext="Atenciones realizadas"
                icon={ShoppingCart} color="purple"
              />
            )}
          </>
        )}
      </div>

      {/* ── FILA INVENTARIO — solo negocios con stock físico ── */}
      {showInventory && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex justify-between items-center">
          <div>
            <p className="text-xs font-semibold text-purple-500 uppercase tracking-wide">Valor a precio venta</p>
            <p className="text-xl font-bold text-purple-700 mt-1">{formatMoney(inventoryValuePrecio)}</p>
          </div>
          <span className="text-3xl">📦</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between items-center">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor a costo</p>
            <p className="text-xl font-bold text-slate-700 mt-1">{formatMoney(inventoryValueCosto)}</p>
          </div>
          <span className="text-3xl">🏷️</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex justify-between items-center">
          <div>
            <p className="text-xs font-semibold text-green-500 uppercase tracking-wide">Ganancia potencial</p>
            <p className="text-xl font-bold text-green-700 mt-1">{formatMoney(gananciaPotencial)}</p>
            <p className="text-xs text-green-400 mt-0.5">Si se vende todo el stock</p>
          </div>
          <span className="text-3xl">💰</span>
        </div>
      </div>
      )}

      {/* ── Panel especial lavadero — órdenes activas en tiempo real ── */}
      {isLavadero && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'En espera', value: lavaderoStats.esperando, color: '#f59e0b', bg: '#fffbeb', icon: '⏳' },
            { label: 'Lavando',   value: lavaderoStats.enProceso, color: '#3b82f6', bg: '#eff6ff', icon: '🧼' },
            { label: 'Listos',    value: lavaderoStats.listos,    color: '#10b981', bg: '#f0fdf4', icon: '✅' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-5 border-2 flex items-center gap-4"
              style={{ background: s.bg, borderColor: s.color + '60' }}>
              <span className="text-4xl">{s.icon}</span>
              <div>
                <p className="text-3xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── GRÁFICAS FILA 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Ventas por período */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">
              Ventas — {PERIOD_LABELS[period]}
            </h3>
            {period === 'week' && (
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Actual</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-300 inline-block" /> Semana anterior</span>
              </div>
            )}
          </div>
          <div className="h-72">
            {chartReady ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesChart} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                  <Tooltip content={<CustomTooltip formatter={formatMoney} />} cursor={{ fill: '#f8fafc' }} />
                  {period === 'week' && (
                    <Bar dataKey="prev" name="Sem. anterior" fill="#e2e8f0" radius={[3,3,0,0]} barSize={16} />
                  )}
                  <Bar dataKey="current" name="Período actual" fill="#3b82f6" radius={[4,4,0,0]} barSize={period === 'week' ? 20 : 36} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Top productos — solo para negocios con inventario físico */}
        {showTop5 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-5">Top 5 por margen</h3>
          <div className="space-y-3">
            {topProducts.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Sin productos aún</p>
            ) : topProducts.map((p, i) => {
              const effectivePx = (p as any).type === 'WEIGHABLE' ? ((p as any).price_per_unit || p.price || 0) : p.price;
              const margin = effectivePx - (p.cost || 0);
              const marginPct = effectivePx > 0 ? (margin / effectivePx) * 100 : 0;
              return (
                <div key={p.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-slate-100 text-slate-600' :
                    i === 2 ? 'bg-orange-100 text-orange-600' :
                    'bg-slate-50 text-slate-400'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(marginPct, 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-green-600 font-semibold">{marginPct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-600 flex-shrink-0">{formatMoney(margin)}</span>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* ── GRÁFICAS FILA 2 ── */}
      {showRepairs && !isLavadero && repairs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Tendencia de ventas - LineChart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-6">Tendencia acumulada — {PERIOD_LABELS[period]}</h3>
            <div className="h-56">
              {chartReady ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                    <Tooltip content={<CustomTooltip formatter={formatMoney} />} />
                    <Line type="monotone" dataKey="current" name="Ventas" stroke="#3b82f6" strokeWidth={2.5}
                      dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} />
                    {period === 'week' && (
                      <Line type="monotone" dataKey="prev" name="Sem. anterior" stroke="#cbd5e1"
                        strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Reparaciones por estado */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Estado de reparaciones</h3>
            {chartReady && repairChart.length > 0 ? (
              <>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={repairChart} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                        paddingAngle={3} dataKey="value">
                        {repairChart.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${v} reparaciones`]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 mt-2">
                  {repairChart.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                        <span className="text-slate-600">{r.name}</span>
                      </span>
                      <span className="font-semibold text-slate-700">{r.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-44 flex items-center justify-center text-slate-300 text-sm">
                Sin reparaciones
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Gastos pendientes próximos a vencer ──────────────────────────── */}
      {pendingExpenses.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-500" />
              Gastos pendientes de pago
            </h3>
            <a href="#/expenses" className="text-xs text-blue-600 font-semibold hover:underline">Ver todos →</a>
          </div>
          <div className="space-y-2">
            {pendingExpenses.map((e: any) => {
              const today   = new Date().toISOString().split('T')[0];
              const overdue = e.status === 'OVERDUE' || (e.due_date && e.due_date < today);
              return (
                <div key={e.id} className={`flex items-center justify-between p-3 rounded-lg border ${overdue ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                  <div className="flex items-center gap-3">
                    {e.expense_categories && (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.expense_categories.color }} />
                    )}
                    <div>
                      <p className={`text-sm font-semibold ${overdue ? 'text-red-800' : 'text-slate-800'}`}>{e.description}</p>
                      {e.due_date && (
                        <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                          {overdue ? '⚠ Vencido: ' : 'Vence: '}{e.due_date}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`font-black text-sm ${overdue ? 'text-red-700' : 'text-amber-700'}`}>
                    {formatMoney(e.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;