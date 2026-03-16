import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart2, PawPrint, Syringe, DollarSign, Users,
  TrendingUp, Calendar, Stethoscope, Download, RefreshCw,
  BedDouble, FlaskConical, FileText, AlertTriangle,
  FileSpreadsheet, Printer, ChevronDown, X
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface ReportData {
  mascotasPorEspecie:   { especie: string; count: number }[];
  serviciosMasVendidos: { nombre: string; count: number; total: number }[];
  ingresosPorMes:       { mes: string; total: number }[];
  mascotasPorVet:       { nombre: string; count: number }[];
  vacunasProximas:      { mascota: string; vacuna: string; fecha: string }[];
  resumenGeneral: {
    totalMascotas: number; totalPropietarios: number; totalCitas: number;
    totalFacturado: number; totalPendiente: number; citasEstesMes: number;
    hospitalizadosActivos: number; stockBajoCount: number;
  };
}

const today    = () => new Date().toISOString().split('T')[0];
const mesActual = () => today().slice(0, 7);
const MESES: Record<string, string> = {
  '01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun',
  '07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic',
};

// ─── COMPONENTES UI ───────────────────────────────────────────────────────────

const KPI: React.FC<{ title: string; value: string|number; sub?: string; icon: React.ReactNode; color: string }> =
  ({ title, value, sub, icon, color }) => (
  <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '18' }}>
      <span style={{ color }}>{icon}</span>
    </div>
    <div>
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-extrabold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  </div>
);

const HBar: React.FC<{ label: string; value: number; max: number; sub?: string; color: string }> =
  ({ label, value, max, sub, color }) => (
  <div className="flex items-center gap-3">
    <div className="w-28 text-right text-sm text-slate-600 font-medium truncate">{label}</div>
    <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
      <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
        style={{ width: `${max > 0 ? Math.max((value / max) * 100, 8) : 8}%`, background: color }}>
        <span className="text-xs text-white font-bold">{value}</span>
      </div>
    </div>
    {sub && <div className="text-xs text-slate-400 w-24 text-right">{sub}</div>}
  </div>
);

// ─── DROPDOWN DE EXPORTACIÓN ──────────────────────────────────────────────────

const ExportMenu: React.FC<{
  onExcel: () => void;
  onPDF:   () => void;
  onCSV:   () => void;
  loading: boolean;
  brandColor: string;
}> = ({ onExcel, onPDF, onCSV, loading, brandColor }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90 transition-opacity"
        style={{ background: brandColor }}>
        <Download size={15}/>
        Exportar
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Formato de exportación</p>
          </div>
          <button
            onClick={() => { onExcel(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors text-left">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <FileSpreadsheet size={16} className="text-green-600"/>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Excel (.xlsx)</p>
              <p className="text-xs text-slate-400">Abre en Microsoft Excel</p>
            </div>
          </button>
          <button
            onClick={() => { onPDF(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left border-t border-slate-50">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <Printer size={16} className="text-red-500"/>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">PDF / Imprimir</p>
              <p className="text-xs text-slate-400">Guardar como PDF o imprimir</p>
            </div>
          </button>
          <button
            onClick={() => { onCSV(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left border-t border-slate-50">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText size={16} className="text-blue-500"/>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">CSV / Excel antiguo</p>
              <p className="text-xs text-slate-400">Compatible con todas las versiones</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

const ReportesVeterinaria: React.FC = () => {
  const { company, companyId } = useDatabase();
  const { formatMoney } = useCurrency();
  const brandColor = (company?.config as any)?.primary_color || '#0ea5e9';

  const [data,        setData]        = useState<ReportData | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [exporting,   setExporting]   = useState(false);

  const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);

  const loadReports = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [
        { data: mascotas },
        { data: propietarios },
        { data: citas },
        { data: facturas },
        { data: historias },
        { data: vacunas },
        { data: hospitalizaciones },
        { data: medicamentos },
        { data: personal },
      ] = await Promise.all([
        supabase.from('vet_mascotas').select('especie,propietario_id').eq('company_id', companyId),
        supabase.from('vet_propietarios').select('id').eq('company_id', companyId),
        supabase.from('vet_citas').select('fecha,veterinario_id,veterinario_nombre,estado').eq('company_id', companyId),
        supabase.from('vet_facturas').select('total,abonado,saldo,estado,fecha,servicio_descripcion').eq('company_id', companyId),
        supabase.from('vet_historias_clinicas').select('fecha,veterinario_id').eq('company_id', companyId),
        supabase.from('vet_vacunas').select('mascota_nombre,nombre_vacuna,proxima_dosis').eq('company_id', companyId),
        supabase.from('vet_hospitalizaciones').select('estado').eq('company_id', companyId),
        supabase.from('vet_medicamentos').select('stock,stock_minimo').eq('company_id', companyId),
        supabase.from('vet_personal').select('id,nombre').eq('company_id', companyId),
      ]);

      const especieMap: Record<string, number> = {};
      (mascotas || []).forEach(m => { especieMap[m.especie] = (especieMap[m.especie] || 0) + 1; });
      const mascotasPorEspecie = Object.entries(especieMap)
        .map(([especie, count]) => ({ especie, count }))
        .sort((a, b) => b.count - a.count);

      const srvMap: Record<string, { count: number; total: number }> = {};
      (facturas || []).forEach(f => {
        const k = f.servicio_descripcion || 'Sin descripción';
        if (!srvMap[k]) srvMap[k] = { count: 0, total: 0 };
        srvMap[k].count++;
        srvMap[k].total += f.abonado || 0;
      });
      const serviciosMasVendidos = Object.entries(srvMap)
        .map(([nombre, v]) => ({ nombre, ...v }))
        .sort((a, b) => b.count - a.count).slice(0, 8);

      const mesMap: Record<string, number> = {};
      (facturas || []).forEach(f => {
        if (f.fecha) { const m = f.fecha.slice(0, 7); mesMap[m] = (mesMap[m] || 0) + (f.abonado || 0); }
      });
      const ingresosPorMes = Object.entries(mesMap)
        .sort((a, b) => a[0] > b[0] ? 1 : -1).slice(-6)
        .map(([mes, total]) => ({ mes, total }));

      const vetMap: Record<string, { nombre: string; count: number }> = {};
      (historias || []).forEach(h => {
        if (h.veterinario_id) {
          const vet = (personal || []).find((p: any) => p.id === h.veterinario_id);
          if (!vetMap[h.veterinario_id]) vetMap[h.veterinario_id] = { nombre: vet?.nombre || 'Sin nombre', count: 0 };
          vetMap[h.veterinario_id].count++;
        }
      });
      const mascotasPorVet = Object.values(vetMap).sort((a, b) => b.count - a.count);

      const en30 = new Date(); en30.setDate(en30.getDate() + 30);
      const vacunasProximas = (vacunas || [])
        .filter(v => v.proxima_dosis && v.proxima_dosis >= today() && v.proxima_dosis <= en30.toISOString().split('T')[0])
        .map(v => ({ mascota: v.mascota_nombre || '-', vacuna: v.nombre_vacuna, fecha: v.proxima_dosis }))
        .sort((a, b) => a.fecha > b.fecha ? 1 : -1).slice(0, 15);

      setData({
        mascotasPorEspecie, serviciosMasVendidos, ingresosPorMes, mascotasPorVet, vacunasProximas,
        resumenGeneral: {
          totalMascotas:        mascotas?.length || 0,
          totalPropietarios:    propietarios?.length || 0,
          totalCitas:           citas?.length || 0,
          totalFacturado:       (facturas || []).reduce((s, f) => s + (f.abonado || 0), 0),
          totalPendiente:       (facturas || []).filter(f => f.estado !== 'PAGADA').reduce((s, f) => s + (f.saldo || 0), 0),
          citasEstesMes:        (citas || []).filter(c => c.fecha?.startsWith(mesActual())).length,
          hospitalizadosActivos:(hospitalizaciones || []).filter(h => h.estado === 'HOSPITALIZADO').length,
          stockBajoCount:       (medicamentos || []).filter(m => m.stock <= (m.stock_minimo || 5)).length,
        },
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // ── EXPORTAR EXCEL (SheetJS via CDN) ──────────────────────────────────────
  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      // Cargar SheetJS dinámicamente
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs' as any);
      const wb = XLSX.utils.book_new();
      const r  = data.resumenGeneral;

      // ── Hoja 1: Resumen General
      const wsResumen = XLSX.utils.aoa_to_sheet([
        [`REPORTE VETERINARIO — ${company?.name || 'Clínica'}`],
        [`Generado: ${new Date().toLocaleDateString('es-CO')} ${new Date().toLocaleTimeString('es-CO')}`],
        [],
        ['INDICADOR', 'VALOR'],
        ['Total Mascotas',         r.totalMascotas],
        ['Total Propietarios',     r.totalPropietarios],
        ['Total Citas Históricas', r.totalCitas],
        ['Citas Este Mes',         r.citasEstesMes],
        ['Ingresos Totales (COP)', r.totalFacturado],
        ['Cartera Pendiente (COP)',r.totalPendiente],
        ['Hospitalizados Activos', r.hospitalizadosActivos],
        ['Medicamentos Stock Bajo',r.stockBajoCount],
      ]);
      wsResumen['!cols'] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

      // ── Hoja 2: Mascotas por Especie
      const wsEspecie = XLSX.utils.aoa_to_sheet([
        ['MASCOTAS POR ESPECIE'],
        ['Especie', 'Cantidad'],
        ...data.mascotasPorEspecie.map(e => [e.especie, e.count]),
      ]);
      wsEspecie['!cols'] = [{ wch: 20 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsEspecie, 'Por Especie');

      // ── Hoja 3: Servicios Más Vendidos
      const wsServ = XLSX.utils.aoa_to_sheet([
        ['SERVICIOS MÁS VENDIDOS'],
        ['Servicio', 'Cantidad', 'Ingresos (COP)'],
        ...data.serviciosMasVendidos.map(s => [s.nombre, s.count, s.total]),
        [],
        ['TOTAL', `=SUM(B3:B${data.serviciosMasVendidos.length + 2})`, `=SUM(C3:C${data.serviciosMasVendidos.length + 2})`],
      ]);
      wsServ['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsServ, 'Servicios');

      // ── Hoja 4: Ingresos por Mes
      const wsMes = XLSX.utils.aoa_to_sheet([
        ['INGRESOS POR MES'],
        ['Mes', 'Ingresos (COP)'],
        ...data.ingresosPorMes.map(m => {
          const [anio, mes] = m.mes.split('-');
          return [`${MESES[mes] || mes} ${anio}`, m.total];
        }),
      ]);
      wsMes['!cols'] = [{ wch: 15 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsMes, 'Ingresos por Mes');

      // ── Hoja 5: Atenciones por Veterinario
      const wsVet = XLSX.utils.aoa_to_sheet([
        ['HISTORIAS CLÍNICAS POR VETERINARIO'],
        ['Veterinario', 'Historias Registradas'],
        ...data.mascotasPorVet.map(v => [v.nombre, v.count]),
      ]);
      wsVet['!cols'] = [{ wch: 30 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsVet, 'Por Veterinario');

      // ── Hoja 6: Vacunas Próximas
      const wsVac = XLSX.utils.aoa_to_sheet([
        ['VACUNAS PRÓXIMAS A VENCER (30 días)'],
        ['Mascota', 'Vacuna', 'Fecha Próxima', 'Días Restantes'],
        ...data.vacunasProximas.map(v => {
          const dias = Math.ceil((new Date(v.fecha).getTime() - Date.now()) / (1000*60*60*24));
          return [v.mascota, v.vacuna, v.fecha, dias];
        }),
      ]);
      wsVac['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsVac, 'Vacunas Próximas');

      XLSX.writeFile(wb, `reporte_veterinaria_${today()}.xlsx`);
    } catch (e) {
      console.error('Error exportando Excel:', e);
      // Fallback a CSV si SheetJS no carga
      exportCSV();
    } finally {
      setExporting(false);
    }
  };

  // ── EXPORTAR PDF (impresión del navegador) ────────────────────────────────
  const exportPDF = () => {
    if (!data) return;
    const r = data.resumenGeneral;
    const COLORS = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#6366f1','#ec4899','#14b8a6'];
    const maxSrv = Math.max(...data.serviciosMasVendidos.map(s => s.count), 1);
    const maxEsp = Math.max(...data.mascotasPorEspecie.map(e => e.count), 1);
    const maxVet = Math.max(...data.mascotasPorVet.map(v => v.count), 1);
    const maxMes = Math.max(...data.ingresosPorMes.map(m => m.total), 1);

    const barRow = (label: string, value: number, max: number, color: string, sub?: string) =>
      `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="width:120px;text-align:right;font-size:12px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</div>
        <div style="flex:1;background:#f1f5f9;border-radius:6px;height:22px;overflow:hidden">
          <div style="height:100%;border-radius:6px;background:${color};min-width:30px;width:${Math.max((value/max)*100,5)}%;display:flex;align-items:center;justify-content:flex-end;padding-right:6px">
            <span style="font-size:11px;color:white;font-weight:bold">${value}</span>
          </div>
        </div>
        ${sub ? `<div style="font-size:11px;color:#94a3b8;width:90px;text-align:right">${sub}</div>` : ''}
      </div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Veterinaria</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;color:#1e293b;background:#fff;padding:0}
      .page{padding:32px;max-width:900px;margin:0 auto}
      .header{background:linear-gradient(135deg,${brandColor},${brandColor}bb);color:white;padding:24px 32px;margin:-32px -32px 28px;border-radius:0 0 16px 16px}
      .header h1{font-size:22px;font-weight:900;margin-bottom:4px}
      .header p{font-size:13px;opacity:.8}
      .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
      .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px}
      .kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:4px}
      .kpi-val{font-size:20px;font-weight:900;color:#1e293b}
      .kpi-sub{font-size:10px;color:#cbd5e1;margin-top:2px}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}
      .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px}
      .card-full{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:18px}
      .card h3{font-size:13px;font-weight:800;color:#334155;margin-bottom:14px;display:flex;align-items:center;gap:6px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#f8fafc;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0}
      td{padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#475569}
      tr:last-child td{border-bottom:none}
      .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600}
      .footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0}
      @media print{body{background:#fff}@page{margin:1cm;size:A4}}
    </style></head><body>
    <div class="page">
      <div class="header">
        <h1>📊 Reporte Veterinario</h1>
        <p>${company?.name || 'Clínica Veterinaria'} · Generado el ${new Date().toLocaleDateString('es-CO')} a las ${new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</p>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Mascotas</div><div class="kpi-val" style="color:#0ea5e9">${r.totalMascotas}</div></div>
        <div class="kpi"><div class="kpi-label">Propietarios</div><div class="kpi-val" style="color:#8b5cf6">${r.totalPropietarios}</div></div>
        <div class="kpi"><div class="kpi-label">Citas Este Mes</div><div class="kpi-val" style="color:#6366f1">${r.citasEstesMes}</div><div class="kpi-sub">Total: ${r.totalCitas}</div></div>
        <div class="kpi"><div class="kpi-label">Hospitalizados</div><div class="kpi-val" style="color:#ef4444">${r.hospitalizadosActivos}</div></div>
        <div class="kpi"><div class="kpi-label">Ingresos Totales</div><div class="kpi-val" style="color:#10b981;font-size:14px">${fmtCOP(r.totalFacturado)}</div></div>
        <div class="kpi"><div class="kpi-label">Cartera Pendiente</div><div class="kpi-val" style="color:#f59e0b;font-size:14px">${fmtCOP(r.totalPendiente)}</div></div>
        <div class="kpi"><div class="kpi-label">Stock Bajo</div><div class="kpi-val" style="color:#dc2626">${r.stockBajoCount}</div><div class="kpi-sub">medicamentos</div></div>
        <div class="kpi"><div class="kpi-label">Total Citas</div><div class="kpi-val">${r.totalCitas}</div></div>
      </div>

      <div class="grid2">
        <div class="card">
          <h3>🐾 Mascotas por Especie</h3>
          ${data.mascotasPorEspecie.map((e,i) => barRow(e.especie, e.count, maxEsp, COLORS[i%COLORS.length])).join('')}
        </div>
        <div class="card">
          <h3>💰 Ingresos por Mes</h3>
          ${data.ingresosPorMes.map((m,i) => {
            const [anio,mes] = m.mes.split('-');
            return barRow(`${MESES[mes]||mes} ${anio}`, Math.round(m.total/1000), Math.round(maxMes/1000), '#10b981', fmtCOP(m.total));
          }).join('')}
          <p style="font-size:10px;color:#94a3b8;margin-top:8px">* Barras en miles COP</p>
        </div>
        <div class="card">
          <h3>🩺 Servicios Más Vendidos</h3>
          ${data.serviciosMasVendidos.map((s,i) => barRow(s.nombre, s.count, maxSrv, COLORS[i%COLORS.length], fmtCOP(s.total))).join('')}
        </div>
        <div class="card">
          <h3>👨‍⚕️ Historias por Veterinario</h3>
          ${data.mascotasPorVet.map((v,i) => barRow(v.nombre, v.count, maxVet, COLORS[i%COLORS.length])).join('')}
        </div>
      </div>

      ${data.vacunasProximas.length > 0 ? `
      <div class="card-full">
        <h3>💉 Vacunas Próximas a Vencer (30 días)</h3>
        <table>
          <thead><tr><th>Mascota</th><th>Vacuna</th><th>Fecha</th><th>Días Restantes</th></tr></thead>
          <tbody>
            ${data.vacunasProximas.map(v => {
              const dias = Math.ceil((new Date(v.fecha).getTime() - Date.now()) / (1000*60*60*24));
              return `<tr>
                <td><strong>${v.mascota}</strong></td>
                <td>${v.vacuna}</td>
                <td>${v.fecha}</td>
                <td><span class="tag" style="background:${dias<=7?'#fee2e2':'#fef3c7'};color:${dias<=7?'#ef4444':'#f59e0b'}">${dias} días</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div class="footer">
        Reporte generado por POSmaster · ${company?.name || ''} · ${new Date().toLocaleDateString('es-CO')}
      </div>
    </div>
    <script>window.onload = () => { window.print(); }</script>
    </body></html>`;

    const w = window.open('', '_blank', 'width=950,height=700');
    w?.document.write(html);
    w?.document.close();
  };

  // ── EXPORTAR CSV (fallback) ───────────────────────────────────────────────
  const exportCSV = () => {
    if (!data) return;
    const r = data.resumenGeneral;
    const rows = [
      [`REPORTE VETERINARIO — ${company?.name || ''}`, `Fecha: ${new Date().toLocaleDateString('es-CO')}`],
      [],
      ['=== RESUMEN GENERAL ==='],
      ['Indicador', 'Valor'],
      ['Total Mascotas',          r.totalMascotas],
      ['Total Propietarios',      r.totalPropietarios],
      ['Total Citas',             r.totalCitas],
      ['Citas Este Mes',          r.citasEstesMes],
      ['Ingresos Totales (COP)',  r.totalFacturado],
      ['Cartera Pendiente (COP)', r.totalPendiente],
      ['Hospitalizados Activos',  r.hospitalizadosActivos],
      ['Medicamentos Stock Bajo', r.stockBajoCount],
      [],
      ['=== MASCOTAS POR ESPECIE ==='],
      ['Especie', 'Cantidad'],
      ...data.mascotasPorEspecie.map(e => [e.especie, e.count]),
      [],
      ['=== SERVICIOS MÁS VENDIDOS ==='],
      ['Servicio', 'Cantidad', 'Ingresos COP'],
      ...data.serviciosMasVendidos.map(s => [s.nombre, s.count, s.total]),
      [],
      ['=== INGRESOS POR MES ==='],
      ['Mes', 'Ingresos COP'],
      ...data.ingresosPorMes.map(m => { const [a,mo]=m.mes.split('-'); return [`${MESES[mo]||mo} ${a}`, m.total]; }),
      [],
      ['=== ATENCIONES POR VETERINARIO ==='],
      ['Veterinario', 'Historias'],
      ...data.mascotasPorVet.map(v => [v.nombre, v.count]),
      [],
      ['=== VACUNAS PRÓXIMAS 30 DÍAS ==='],
      ['Mascota', 'Vacuna', 'Fecha', 'Días restantes'],
      ...data.vacunasProximas.map(v => {
        const dias = Math.ceil((new Date(v.fecha).getTime() - Date.now()) / (1000*60*60*24));
        return [v.mascota, v.vacuna, v.fecha, dias];
      }),
    ];
    const BOM = '\uFEFF';
    const csv = BOM + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `reporte_veterinaria_${today()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <RefreshCw size={24} className="animate-spin mr-3"/> Generando reportes...
    </div>
  );
  if (!data) return null;

  const { resumenGeneral: r } = data;
  const COLORS = ['#0ea5e9','#8b5cf6','#10b981','#f59e0b','#ef4444','#6366f1','#ec4899','#14b8a6'];
  const maxEsp = Math.max(...data.mascotasPorEspecie.map(e => e.count), 1);
  const maxSrv = Math.max(...data.serviciosMasVendidos.map(s => s.count), 1);
  const maxVet = Math.max(...data.mascotasPorVet.map(v => v.count), 1);
  const maxMes = Math.max(...data.ingresosPorMes.map(m => m.total), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: brandColor + '20' }}>
            <BarChart2 size={22} style={{ color: brandColor }}/>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">Reportes Veterinaria</h1>
            <p className="text-sm text-slate-400">Análisis integral de la clínica</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={loadReports} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Actualizar
          </button>
          <ExportMenu
            onExcel={exportExcel}
            onPDF={exportPDF}
            onCSV={exportCSV}
            loading={exporting}
            brandColor={brandColor}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI title="Mascotas Registradas"   value={r.totalMascotas}          icon={<PawPrint size={22}/>}      color="#0ea5e9"/>
        <KPI title="Propietarios"           value={r.totalPropietarios}      icon={<Users size={22}/>}         color="#8b5cf6"/>
        <KPI title="Citas Este Mes"         value={r.citasEstesMes}          icon={<Calendar size={22}/>}      color="#6366f1" sub="mes en curso"/>
        <KPI title="Total Citas"            value={r.totalCitas}             icon={<Calendar size={22}/>}      color="#ec4899"/>
        <KPI title="Ingresos Totales"       value={fmtCOP(r.totalFacturado)} icon={<DollarSign size={22}/>}    color="#10b981"/>
        <KPI title="Cartera Pendiente"      value={fmtCOP(r.totalPendiente)} icon={<TrendingUp size={22}/>}    color="#f59e0b"/>
        <KPI title="Hospitalizados Activos" value={r.hospitalizadosActivos}  icon={<BedDouble size={22}/>}     color="#ef4444"/>
        <KPI title="Stock Bajo"             value={r.stockBajoCount}         icon={<AlertTriangle size={22}/>} color="#dc2626"/>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Por especie */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-5 flex items-center gap-2">
            <PawPrint size={16} style={{ color: brandColor }}/> Mascotas por Especie
          </h3>
          <div className="space-y-3">
            {data.mascotasPorEspecie.length === 0
              ? <p className="text-slate-400 text-sm">Sin datos</p>
              : data.mascotasPorEspecie.map((e, i) => <HBar key={e.especie} label={e.especie} value={e.count} max={maxEsp} color={COLORS[i % COLORS.length]}/>)
            }
          </div>
        </div>

        {/* Ingresos por mes */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-5 flex items-center gap-2">
            <DollarSign size={16} style={{ color: '#10b981' }}/> Ingresos por Mes
          </h3>
          <div className="space-y-3">
            {data.ingresosPorMes.length === 0
              ? <p className="text-slate-400 text-sm">Sin datos</p>
              : data.ingresosPorMes.map((m) => {
                const [anio, mes] = m.mes.split('-');
                return <HBar key={m.mes} label={`${MESES[mes]||mes} ${anio}`} value={Math.round(m.total/1000)} max={Math.round(maxMes/1000)} sub={fmtCOP(m.total)} color="#10b981"/>;
              })
            }
          </div>
          <p className="text-xs text-slate-400 mt-3">* Barras en miles COP</p>
        </div>

        {/* Servicios más vendidos */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-5 flex items-center gap-2">
            <Stethoscope size={16} style={{ color: '#8b5cf6' }}/> Servicios Más Vendidos
          </h3>
          <div className="space-y-3">
            {data.serviciosMasVendidos.length === 0
              ? <p className="text-slate-400 text-sm">Sin datos</p>
              : data.serviciosMasVendidos.map((s, i) => <HBar key={s.nombre} label={s.nombre} value={s.count} max={maxSrv} sub={fmtCOP(s.total)} color={COLORS[i % COLORS.length]}/>)
            }
          </div>
        </div>

        {/* Por veterinario */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-5 flex items-center gap-2">
            <FileText size={16} style={{ color: '#f59e0b' }}/> Historias por Veterinario
          </h3>
          <div className="space-y-3">
            {data.mascotasPorVet.length === 0
              ? <p className="text-slate-400 text-sm">Sin datos</p>
              : data.mascotasPorVet.map((v, i) => <HBar key={v.nombre} label={v.nombre} value={v.count} max={maxVet} color={COLORS[i % COLORS.length]}/>)
            }
          </div>
        </div>

        {/* Vacunas próximas */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 md:col-span-2">
          <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Syringe size={16} style={{ color: '#f59e0b' }}/> Vacunas Pendientes — Próximos 30 días
          </h3>
          {data.vacunasProximas.length === 0
            ? <p className="text-slate-400 text-sm">No hay vacunas próximas a vencer 🎉</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>{['Mascota','Vacuna','Fecha Próxima','Días Restantes'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.vacunasProximas.map((v, i) => {
                      const dias = Math.ceil((new Date(v.fecha).getTime() - Date.now()) / (1000*60*60*24));
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold">{v.mascota}</td>
                          <td className="px-4 py-3">{v.vacuna}</td>
                          <td className="px-4 py-3">{v.fecha}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ background: dias <= 7 ? '#fee2e2' : '#fef3c7', color: dias <= 7 ? '#ef4444' : '#f59e0b' }}>
                              {dias} días
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
};

export default ReportesVeterinaria;