import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart2, Download, FileSpreadsheet, TrendingUp, Package,
  Users, MinusCircle, Calendar, RefreshCw, Truck, ShoppingCart,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────
type TabId = 'ventas' | 'inventario' | 'cartera' | 'egresos' | 'compras';
type Period = 'today' | 'week' | 'month' | 'quarter' | 'custom';

interface SaleRow {
  id: string; invoice_number: string; created_at: string;
  total_amount: number; subtotal: number; tax_amount: number;
  discount_amount: number; payment_method: any;
  customer_name?: string;
}

interface ProductRow {
  id: string; name: string; sku: string; category?: string;
  brand?: string; price: number; cost: number;
  stock_quantity: number; stock_min: number; type: string;
}

interface ReceivableRow {
  id: string; customer_name: string; customer_doc?: string;
  customer_phone?: string; amount: number; balance: number;
  due_date?: string; created_at: string; status: string;
}

interface ExpenseRow {
  id: string; concept: string; category: string;
  amount: number; created_at: string;
}

interface MovementRow {
  id: string; created_at: string; type: string;
  quantity: number; unit_cost: number; total_cost: number;
  reference_id?: string; reference_type?: string; notes?: string;
  products?: { name: string; sku: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const periodDates = (period: Period, customFrom: string, customTo: string) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  if (period === 'custom') return { from: customFrom, to: customTo };
  if (period === 'today')  return { from: fmt(now), to: fmt(now) };
  if (period === 'week') {
    const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
    return { from: fmt(mon), to: fmt(now) };
  }
  if (period === 'month')   return { from: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`, to: fmt(now) };
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return { from: `${now.getFullYear()}-${pad(q*3+1)}-01`, to: fmt(now) };
  }
  return { from: fmt(now), to: fmt(now) };
};

const groupByDay = (rows: SaleRow[]) => {
  const map: Record<string, number> = {};
  rows.forEach(r => { const day = r.created_at.slice(0, 10); map[day] = (map[day] || 0) + r.total_amount; });
  return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([date, total]) => ({ date: date.slice(5), total }));
};

const groupMovByDay = (rows: MovementRow[]) => {
  const map: Record<string, number> = {};
  rows.forEach(r => { const day = r.created_at.slice(0, 10); map[day] = (map[day] || 0) + (r.total_cost || 0); });
  return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([date, total]) => ({ date: date.slice(5), total }));
};

const payMethodLabel: Record<string, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia',
  NEQUI: 'Nequi', DAVIPLATA: 'Daviplata', CREDIT: 'Crédito', OTHER: 'Otro',
};

// ─── Component ────────────────────────────────────────────────────────────────
const Reports: React.FC = () => {
  const { companyId, branchId, company } = useDatabase();
  const { formatMoney } = useCurrency();

  const [activeTab, setActiveTab]   = useState<TabId>('ventas');
  const [period, setPeriod]         = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [loading, setLoading]       = useState(false);

  // Data
  const [sales, setSales]           = useState<SaleRow[]>([]);
  const [products, setProducts]     = useState<ProductRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [expenses, setExpenses]     = useState<ExpenseRow[]>([]);
  const [movements, setMovements]   = useState<MovementRow[]>([]);

  const { from, to } = periodDates(period, customFrom, customTo);
  const fromISO = from + 'T00:00:00';
  const toISO   = to   + 'T23:59:59';

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadVentas = useCallback(async () => {
    if (!companyId) return;
    let q = supabase.from('invoices')
      .select('id,invoice_number,created_at,total_amount,subtotal,tax_amount,discount_amount,payment_method,customer_id')
      .eq('company_id', companyId).gte('created_at', fromISO).lte('created_at', toISO)
      .order('created_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data } = await q;
    const ids = [...new Set((data||[]).map((r:any) => r.customer_id).filter(Boolean))];
    let custMap: Record<string,string> = {};
    if (ids.length) {
      const { data: custs } = await supabase.from('customers').select('id,name').in('id', ids);
      (custs||[]).forEach((c:any) => { custMap[c.id] = c.name; });
    }
    setSales((data||[]).map((r:any) => ({ ...r, customer_name: custMap[r.customer_id] || '' })));
  }, [companyId, branchId, fromISO, toISO]);

  const loadInventario = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from('products')
      .select('id,name,sku,category,brand,price,cost,stock_quantity,stock_min,type')
      .eq('company_id', companyId).eq('is_active', true).order('name');
    setProducts(data || []);
  }, [companyId]);

  const loadCartera = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from('accounts_receivable')
      .select('id,customer_name,customer_doc,customer_phone,amount,balance,due_date,created_at,status')
      .eq('company_id', companyId).order('created_at', { ascending: false });
    setReceivables(data || []);
  }, [companyId]);

  const loadEgresos = useCallback(async () => {
    if (!companyId) return;
    let q = supabase.from('cash_expenses').select('id,concept,category,amount,created_at')
      .eq('company_id', companyId).gte('created_at', fromISO).lte('created_at', toISO)
      .order('created_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data } = await q;
    setExpenses(data || []);
  }, [companyId, branchId, fromISO, toISO]);

  const loadCompras = useCallback(async () => {
    if (!companyId) return;
    let q = supabase
      .from('inventory_movements')
      .select('id,created_at,type,quantity,unit_cost,total_cost,reference_id,reference_type,notes,products(name,sku)')
      .eq('company_id', companyId)
      .eq('type', 'COMPRA')
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .order('created_at', { ascending: false });
    if (branchId) q = q.eq('branch_id', branchId);
    const { data } = await q;
    setMovements((data || []) as MovementRow[]);
  }, [companyId, branchId, fromISO, toISO]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'ventas')     await loadVentas();
      if (activeTab === 'inventario') await loadInventario();
      if (activeTab === 'cartera')    await loadCartera();
      if (activeTab === 'egresos')    await loadEgresos();
      if (activeTab === 'compras')    await loadCompras();
    } finally { setLoading(false); }
  }, [activeTab, loadVentas, loadInventario, loadCartera, loadEgresos, loadCompras]);

  useEffect(() => { load(); }, [load]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const ventasKPI = useMemo(() => {
    const total  = sales.reduce((s, r) => s + r.total_amount, 0);
    const subtot = sales.reduce((s, r) => s + r.subtotal, 0);
    const iva    = sales.reduce((s, r) => s + r.tax_amount, 0);
    const desc   = sales.reduce((s, r) => s + (r.discount_amount || 0), 0);
    const byMethod: Record<string, number> = {};
    sales.forEach(r => {
      const pm = r.payment_method;
      if (Array.isArray(pm)) pm.forEach((m:any) => { byMethod[m.method] = (byMethod[m.method]||0) + m.amount; });
      else if (pm?.method) byMethod[pm.method] = (byMethod[pm.method]||0) + r.total_amount;
    });
    return { total, subtot, iva, desc, count: sales.length, byMethod };
  }, [sales]);

  const chartData = useMemo(() => groupByDay(sales), [sales]);

  const invKPI = useMemo(() => {
    const totalValue = products.reduce((s, p) => s + (p.stock_quantity * p.cost), 0);
    const saleValue  = products.reduce((s, p) => s + (p.stock_quantity * p.price), 0);
    const lowStock   = products.filter(p => p.type !== 'SERVICE' && p.stock_quantity <= p.stock_min);
    const noStock    = products.filter(p => p.type !== 'SERVICE' && p.stock_quantity <= 0);
    return { totalValue, saleValue, lowStock: lowStock.length, noStock: noStock.length, total: products.length };
  }, [products]);

  const cartKPI = useMemo(() => {
    const total   = receivables.reduce((s, r) => s + r.amount, 0);
    const pending = receivables.filter(r => r.status !== 'PAID').reduce((s, r) => s + r.balance, 0);
    const overdue = receivables.filter(r => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'PAID');
    return { total, pending, overdue: overdue.length, count: receivables.length };
  }, [receivables]);

  const egKPI = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const byCat: Record<string, number> = {};
    expenses.forEach(e => { byCat[e.category] = (byCat[e.category]||0) + e.amount; });
    return { total, count: expenses.length, byCat };
  }, [expenses]);

  const comprasKPI = useMemo(() => {
    const totalCosto  = movements.reduce((s, m) => s + (m.total_cost || 0), 0);
    const totalUnids  = movements.reduce((s, m) => s + m.quantity, 0);
    const byProduct: Record<string, { name: string; qty: number; cost: number }> = {};
    movements.forEach(m => {
      const key = m.products?.sku || m.reference_id || m.id;
      const name = m.products?.name || m.notes || 'Producto';
      if (!byProduct[key]) byProduct[key] = { name, qty: 0, cost: 0 };
      byProduct[key].qty  += m.quantity;
      byProduct[key].cost += m.total_cost || 0;
    });
    const top5 = Object.values(byProduct).sort((a,b) => b.cost - a.cost).slice(0, 5);
    return { totalCosto, totalUnids, count: movements.length, top5 };
  }, [movements]);

  const comprasChartData = useMemo(() => groupMovByDay(movements), [movements]);

  // ── Export Excel ───────────────────────────────────────────────────────────
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const co = company?.name || 'POSmaster';

    if (activeTab === 'ventas') {
      const rows = sales.map(r => ({
        'Factura': r.invoice_number, 'Fecha': r.created_at.slice(0,10),
        'Cliente': r.customer_name || '', 'Subtotal': r.subtotal,
        'IVA': r.tax_amount, 'Descuento': r.discount_amount || 0, 'Total': r.total_amount,
      }));
      rows.push({ 'Factura': 'TOTAL', 'Fecha': '', 'Cliente': '',
        'Subtotal': ventasKPI.subtot, 'IVA': ventasKPI.iva,
        'Descuento': ventasKPI.desc, 'Total': ventasKPI.total } as any);
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [12,12,24,14,12,12,14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
      XLSX.writeFile(wb, `Ventas_${co}_${from}_${to}.xlsx`);

    } else if (activeTab === 'inventario') {
      const rows = products.map(p => ({
        'Nombre': p.name, 'SKU': p.sku, 'Categoría': p.category||'', 'Marca': p.brand||'',
        'Precio': p.price, 'Costo': p.cost, 'Stock': p.stock_quantity,
        'Mínimo': p.stock_min, 'Valor Costo': p.stock_quantity * p.cost,
        'Valor Venta': p.stock_quantity * p.price, 'Tipo': p.type,
        'Estado': p.stock_quantity <= 0 ? 'SIN STOCK' : p.stock_quantity <= p.stock_min ? 'BAJO' : 'OK',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
      XLSX.writeFile(wb, `Inventario_${co}_${new Date().toISOString().slice(0,10)}.xlsx`);

    } else if (activeTab === 'cartera') {
      const rows = receivables.map(r => ({
        'Cliente': r.customer_name, 'Doc': r.customer_doc||'', 'Tel': r.customer_phone||'',
        'Monto': r.amount, 'Saldo': r.balance, 'Vencimiento': r.due_date||'',
        'Fecha': r.created_at.slice(0,10), 'Estado': r.status,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Cartera');
      XLSX.writeFile(wb, `Cartera_${co}_${new Date().toISOString().slice(0,10)}.xlsx`);

    } else if (activeTab === 'egresos') {
      const rows = expenses.map(e => ({
        'Concepto': e.concept, 'Categoría': e.category,
        'Monto': e.amount, 'Fecha': e.created_at.slice(0,10),
      }));
      rows.push({ 'Concepto': 'TOTAL', 'Categoría': '', 'Monto': egKPI.total, 'Fecha': '' } as any);
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Egresos');
      XLSX.writeFile(wb, `Egresos_${co}_${from}_${to}.xlsx`);

    } else if (activeTab === 'compras') {
      const rows = movements.map(m => ({
        'Fecha':    m.created_at.slice(0,10),
        'Producto': m.products?.name || '—',
        'SKU':      m.products?.sku  || '—',
        'Cantidad': m.quantity,
        'Costo U.': m.unit_cost,
        'Total':    m.total_cost || 0,
        'Notas':    m.notes || '',
      }));
      rows.push({ 'Fecha': 'TOTAL', 'Producto': '', 'SKU': '', 'Cantidad': comprasKPI.totalUnids, 'Costo U.': 0, 'Total': comprasKPI.totalCosto, 'Notas': '' } as any);
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [12,30,14,10,14,14,30].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, 'Compras');
      XLSX.writeFile(wb, `Compras_${co}_${from}_${to}.xlsx`);
    }
  };

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc  = new jsPDF({ orientation: 'landscape' });
    const co   = company?.name || 'POSmaster';
    const now  = new Date().toLocaleString('es-CO');
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
    doc.text(`${co} — Reporte de ${activeTab.charAt(0).toUpperCase()+activeTab.slice(1)}`, 14, 14);
    doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.text(`Generado: ${now}  |  Período: ${from} → ${to}`, pageW - 14, 14, { align: 'right' });
    doc.setTextColor(30,30,30);

    const drawTable = (headers: string[], rows: string[][], startY: number, colWidths: number[], footRow?: string[]) => {
      const rowH = 8; const headerH = 9;
      let x = 14; let y = startY;
      const totalW = colWidths.reduce((a,b) => a+b, 0);
      doc.setFillColor(59, 130, 246);
      doc.rect(x, y, totalW, headerH, 'F');
      doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
      colWidths.forEach((w, i) => { doc.text(headers[i] || '', x + 2, y + 6); x += w; });
      doc.setTextColor(30,30,30); y += headerH;
      rows.forEach((row, ri) => {
        if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }
        doc.setFillColor(ri%2===0?248:255, ri%2===0?250:255, ri%2===0?252:255);
        doc.rect(14, y, totalW, rowH, 'F');
        doc.setFont('helvetica','normal'); doc.setFontSize(7); x = 14;
        colWidths.forEach((w, i) => { const txt = String(row[i]||''); doc.text(txt.length>28?txt.slice(0,25)+'…':txt, x+2, y+5.5); x+=w; });
        doc.setDrawColor(226,232,240); doc.setLineWidth(0.1);
        doc.line(14, y+rowH, 14+totalW, y+rowH); y += rowH;
      });
      if (footRow) {
        doc.setFillColor(241,245,249); doc.rect(14, y, totalW, rowH, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7); x = 14;
        colWidths.forEach((w, i) => { doc.text(footRow[i]||'', x+2, y+5.5); x+=w; }); y+=rowH;
      }
      doc.setDrawColor(203,213,225); doc.setLineWidth(0.3);
      doc.rect(14, startY, totalW, y-startY); return y+4;
    };

    let summaryY = 30;
    doc.setFontSize(9); doc.setFont('helvetica','bold');

    if (activeTab === 'ventas') {
      doc.text(`Total: ${formatMoney(ventasKPI.total)}  ·  Facturas: ${ventasKPI.count}  ·  IVA: ${formatMoney(ventasKPI.iva)}  ·  Descuentos: ${formatMoney(ventasKPI.desc)}`, 14, summaryY);
      drawTable(
        ['Factura','Fecha','Cliente','Subtotal','IVA','Desc.','Total'],
        sales.map(r => [r.invoice_number, r.created_at.slice(0,10), r.customer_name||'—',
          formatMoney(r.subtotal), formatMoney(r.tax_amount), formatMoney(r.discount_amount||0), formatMoney(r.total_amount)]),
        summaryY+6, [30,24,50,28,24,24,30],
        ['','','TOTAL',formatMoney(ventasKPI.subtot),formatMoney(ventasKPI.iva),formatMoney(ventasKPI.desc),formatMoney(ventasKPI.total)]
      );
    } else if (activeTab === 'inventario') {
      doc.text(`Productos: ${invKPI.total}  ·  Valor costo: ${formatMoney(invKPI.totalValue)}  ·  Bajo mínimo: ${invKPI.lowStock}  ·  Sin stock: ${invKPI.noStock}`, 14, summaryY);
      drawTable(
        ['Nombre','SKU','Categoría','Precio','Costo','Stock','Valor','Estado'],
        products.map(p => [p.name, p.sku, p.category||'—', formatMoney(p.price), formatMoney(p.cost),
          String(p.stock_quantity), formatMoney(p.stock_quantity*p.cost),
          p.stock_quantity<=0?'SIN STOCK':p.stock_quantity<=p.stock_min?'BAJO':'OK']),
        summaryY+6, [54,26,30,24,22,16,28,22]
      );
    } else if (activeTab === 'cartera') {
      doc.text(`Total cartera: ${formatMoney(cartKPI.total)}  ·  Por cobrar: ${formatMoney(cartKPI.pending)}  ·  Vencidos: ${cartKPI.overdue}`, 14, summaryY);
      drawTable(
        ['Cliente','Documento','Teléfono','Monto','Saldo','Vencimiento','Estado'],
        receivables.map(r => [r.customer_name, r.customer_doc||'—', r.customer_phone||'—',
          formatMoney(r.amount), formatMoney(r.balance), r.due_date||'—', r.status]),
        summaryY+6, [54,30,30,28,28,28,24]
      );
    } else if (activeTab === 'egresos') {
      doc.text(`Total egresos: ${formatMoney(egKPI.total)}  ·  Registros: ${egKPI.count}`, 14, summaryY);
      drawTable(
        ['Concepto','Categoría','Monto','Fecha'],
        expenses.map(e => [e.concept, e.category, formatMoney(e.amount), e.created_at.slice(0,10)]),
        summaryY+6, [100,50,40,30],
        ['','TOTAL',formatMoney(egKPI.total),'']
      );
    } else if (activeTab === 'compras') {
      doc.text(`Total invertido: ${formatMoney(comprasKPI.totalCosto)}  ·  Unidades: ${comprasKPI.totalUnids}  ·  Movimientos: ${comprasKPI.count}`, 14, summaryY);
      drawTable(
        ['Fecha','Producto','SKU','Cant.','Costo U.','Total','Notas'],
        movements.map(m => [m.created_at.slice(0,10), m.products?.name||'—', m.products?.sku||'—',
          String(m.quantity), formatMoney(m.unit_cost||0), formatMoney(m.total_cost||0), m.notes||'']),
        summaryY+6, [24,50,22,14,24,24,52],
        ['','','TOTAL',String(comprasKPI.totalUnids),'',formatMoney(comprasKPI.totalCosto),'']
      );
    }

    doc.save(`Reporte_${activeTab}_${co}_${from}.pdf`);
  };

  // ── UI Helpers ─────────────────────────────────────────────────────────────
  const KPICard = ({ label, value, sub, color = 'blue' }: { label: string; value: string; sub?: string; color?: string }) => {
    const colors: Record<string,string> = {
      blue:   'bg-blue-50 border-blue-100 text-blue-700',
      green:  'bg-green-50 border-green-100 text-green-700',
      red:    'bg-red-50 border-red-100 text-red-700',
      amber:  'bg-amber-50 border-amber-100 text-amber-700',
      purple: 'bg-purple-50 border-purple-100 text-purple-700',
      teal:   'bg-teal-50 border-teal-100 text-teal-700',
    };
    return (
      <div className={`rounded-xl border p-4 ${colors[color]}`}>
        <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
        <p className="text-2xl font-black">{value}</p>
        {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
      </div>
    );
  };

  const TABS = [
    { id: 'ventas',     label: 'Ventas',      icon: TrendingUp,  color: 'blue'   },
    { id: 'compras',    label: 'Compras',      icon: Truck,       color: 'teal'   },
    { id: 'inventario', label: 'Inventario',   icon: Package,     color: 'green'  },
    { id: 'cartera',    label: 'Cartera/CxC',  icon: Users,       color: 'purple' },
    { id: 'egresos',    label: 'Egresos',      icon: MinusCircle, color: 'red'    },
  ] as const;

  const PERIODS = [
    { id: 'today',   label: 'Hoy' },
    { id: 'week',    label: 'Esta semana' },
    { id: 'month',   label: 'Este mes' },
    { id: 'quarter', label: 'Este trimestre' },
    { id: 'custom',  label: 'Personalizado' },
  ] as const;

  const needsPeriod = activeTab !== 'inventario';

  const colorsActive: Record<string,string> = {
    blue:   'bg-blue-600 text-white',
    teal:   'bg-teal-600 text-white',
    green:  'bg-emerald-600 text-white',
    purple: 'bg-purple-600 text-white',
    red:    'bg-red-600 text-white',
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <BarChart2 size={24} className="text-blue-600" /> Reportes
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Exporta tus datos en Excel o PDF</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors">
            <FileSpreadsheet size={15} /> Excel
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors">
            <Download size={15} /> PDF
          </button>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id as TabId)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${active ? colorsActive[t.color] : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Period selector */}
      {needsPeriod && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
          <Calendar size={16} className="text-slate-400 flex-shrink-0" />
          <div className="flex flex-wrap gap-2">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id as Period)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400" />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          )}
          {needsPeriod && period !== 'custom' && (
            <span className="text-xs text-slate-400 ml-auto">{from} → {to}</span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={28} className="animate-spin text-blue-400" />
        </div>
      ) : (
        <>
          {/* ══════════════════════════ VENTAS ══════════════════════════════ */}
          {activeTab === 'ventas' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Total ventas"  value={formatMoney(ventasKPI.total)} color="blue" />
                <KPICard label="Nº facturas"   value={String(ventasKPI.count)} color="blue" sub={`Promedio ${formatMoney(ventasKPI.count ? ventasKPI.total/ventasKPI.count : 0)}`} />
                <KPICard label="IVA recaudado" value={formatMoney(ventasKPI.iva)} color="amber" />
                <KPICard label="Descuentos"    value={formatMoney(ventasKPI.desc)} color="red" />
              </div>
              {Object.keys(ventasKPI.byMethod).length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-700 mb-3">Por método de pago</p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(ventasKPI.byMethod).map(([m, v]) => (
                      <div key={m} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                        <span className="text-xs font-semibold text-slate-600">{payMethodLabel[m] || m}</span>
                        <span className="text-sm font-black text-blue-600">{formatMoney(v as number)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {chartData.length > 1 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-700 mb-3">Ventas por día</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => formatMoney(v)} />
                      <Bar dataKey="total" fill="#3b82f6" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{['Factura','Fecha','Cliente','Subtotal','IVA','Total'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sales.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Sin ventas en este período</td></tr>}
                    {sales.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-blue-600">{r.invoice_number}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{r.created_at.slice(0,10)}</td>
                        <td className="px-4 py-3 text-slate-700">{r.customer_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{formatMoney(r.subtotal)}</td>
                        <td className="px-4 py-3 text-amber-600">{formatMoney(r.tax_amount)}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">{formatMoney(r.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {sales.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-xs font-bold text-slate-500">TOTAL — {sales.length} facturas</td>
                        <td className="px-4 py-3 font-bold text-slate-700">{formatMoney(ventasKPI.subtot)}</td>
                        <td className="px-4 py-3 font-bold text-amber-600">{formatMoney(ventasKPI.iva)}</td>
                        <td className="px-4 py-3 font-black text-blue-700 text-base">{formatMoney(ventasKPI.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════ COMPRAS ═════════════════════════════ */}
          {activeTab === 'compras' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Total invertido"    value={formatMoney(comprasKPI.totalCosto)} color="teal" />
                <KPICard label="Movimientos"        value={String(comprasKPI.count)} color="teal" sub="entradas de compra" />
                <KPICard label="Unidades recibidas" value={String(comprasKPI.totalUnids)} color="green" />
                <KPICard label="Promedio/compra"    value={formatMoney(comprasKPI.count ? comprasKPI.totalCosto / comprasKPI.count : 0)} color="amber" />
              </div>

              {/* Top productos más comprados */}
              {comprasKPI.top5.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-700 mb-3">Top productos por inversión</p>
                  <div className="space-y-2">
                    {comprasKPI.top5.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-black text-slate-400 w-5">{i+1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="font-semibold text-slate-700">{p.name}</span>
                            <span className="font-bold text-teal-700">{formatMoney(p.cost)}</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full"
                              style={{ width: `${(p.cost / comprasKPI.totalCosto) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 w-16 text-right">{p.qty} uds</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gráfico compras por día */}
              {comprasChartData.length > 1 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-700 mb-3">Compras por día</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={comprasChartData} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => formatMoney(v)} />
                      <Bar dataKey="total" fill="#0d9488" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabla detalle */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{['Fecha','Producto','SKU','Cantidad','Costo U.','Total','Notas'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                          <Truck size={32} className="mx-auto mb-2 opacity-20" />
                          No hay compras registradas en este período.<br />
                          <span className="text-xs">Las compras se registran automáticamente al recibir una Orden de Compra.</span>
                        </td>
                      </tr>
                    )}
                    {movements.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-slate-500 text-xs">{m.created_at.slice(0,10)}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{m.products?.name || '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{m.products?.sku || '—'}</td>
                        <td className="px-3 py-2.5 font-bold text-slate-700">{m.quantity}</td>
                        <td className="px-3 py-2.5 text-slate-600">{formatMoney(m.unit_cost || 0)}</td>
                        <td className="px-3 py-2.5 font-bold text-teal-700">{formatMoney(m.total_cost || 0)}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs truncate max-w-[150px]">{m.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {movements.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-xs font-bold text-slate-500">TOTAL — {movements.length} movimientos</td>
                        <td className="px-3 py-3 font-bold text-slate-700">{comprasKPI.totalUnids} uds</td>
                        <td />
                        <td className="px-3 py-3 font-black text-teal-700 text-base">{formatMoney(comprasKPI.totalCosto)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════ INVENTARIO ══════════════════════════ */}
          {activeTab === 'inventario' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Total productos" value={String(invKPI.total)} color="green" />
                <KPICard label="Valor a costo"   value={formatMoney(invKPI.totalValue)} color="green" sub="Inversión en stock" />
                <KPICard label="Valor a precio"  value={formatMoney(invKPI.saleValue)} color="blue" sub="Si vendes todo" />
                <KPICard label="Bajo mínimo"     value={String(invKPI.lowStock)} color={invKPI.lowStock > 0 ? 'red' : 'green'} sub={`${invKPI.noStock} sin stock`} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{['Nombre','SKU','Categoría','Precio','Costo','Stock','Valor costo','Estado'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map(p => {
                      const st = p.stock_quantity <= 0 ? 'SIN STOCK' : p.stock_quantity <= p.stock_min ? 'BAJO' : 'OK';
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-medium text-slate-800">{p.name}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{p.sku}</td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{p.category||'—'}</td>
                          <td className="px-3 py-2.5 text-blue-600 font-semibold">{formatMoney(p.price)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{formatMoney(p.cost)}</td>
                          <td className="px-3 py-2.5 font-bold text-slate-800">{p.stock_quantity}</td>
                          <td className="px-3 py-2.5 text-slate-600">{formatMoney(p.stock_quantity * p.cost)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${st==='OK'?'bg-green-100 text-green-700':st==='BAJO'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>{st}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════ CARTERA ═════════════════════════════ */}
          {activeTab === 'cartera' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KPICard label="Cartera total"    value={formatMoney(cartKPI.total)} color="purple" />
                <KPICard label="Por cobrar"       value={formatMoney(cartKPI.pending)} color="amber" />
                <KPICard label="Cuentas vencidas" value={String(cartKPI.overdue)} color={cartKPI.overdue > 0 ? 'red' : 'green'} />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{['Cliente','Documento','Teléfono','Monto','Saldo','Vencimiento','Estado'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receivables.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Sin registros de cartera</td></tr>}
                    {receivables.map(r => {
                      const overdue = r.due_date && new Date(r.due_date) < new Date() && r.status !== 'PAID';
                      return (
                        <tr key={r.id} className={`hover:bg-slate-50 ${overdue ? 'bg-red-50/30' : ''}`}>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{r.customer_name}</td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{r.customer_doc||'—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{r.customer_phone||'—'}</td>
                          <td className="px-3 py-2.5 text-slate-700">{formatMoney(r.amount)}</td>
                          <td className="px-3 py-2.5 font-bold text-purple-600">{formatMoney(r.balance)}</td>
                          <td className={`px-3 py-2.5 text-xs ${overdue?'text-red-600 font-bold':'text-slate-500'}`}>{r.due_date||'—'}</td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.status==='PAID'?'bg-green-100 text-green-700':overdue?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>
                              {r.status==='PAID'?'Pagado':overdue?'Vencido':'Pendiente'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════ EGRESOS ═════════════════════════════ */}
          {activeTab === 'egresos' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KPICard label="Total egresos" value={formatMoney(egKPI.total)} color="red" />
                <KPICard label="Registros"     value={String(egKPI.count)} color="red" />
                <KPICard label="Promedio"      value={formatMoney(egKPI.count ? egKPI.total/egKPI.count : 0)} color="amber" />
              </div>
              {Object.keys(egKPI.byCat).length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-700 mb-3">Por categoría</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(egKPI.byCat).sort(([,a],[,b]) => (b as number)-(a as number)).map(([cat, amt]) => (
                      <div key={cat} className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-100">
                        <span className="text-xs font-semibold text-red-600 capitalize">{cat}</span>
                        <span className="text-sm font-black text-red-700">{formatMoney(amt as number)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{['Concepto','Categoría','Monto','Fecha'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">Sin egresos en este período</td></tr>}
                    {expenses.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-800">{e.concept}</td>
                        <td className="px-4 py-2.5 capitalize text-slate-500 text-xs">{e.category}</td>
                        <td className="px-4 py-2.5 font-bold text-red-600">{formatMoney(e.amount)}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{e.created_at.slice(0,10)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {expenses.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-xs font-bold text-slate-500">TOTAL</td>
                        <td className="px-4 py-3 font-black text-red-700 text-base">{formatMoney(egKPI.total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Reports;