import React, { useState, useEffect } from 'react';
import { X, Download, Filter, Clock, Package, TrendingUp, TrendingDown, Edit2, FileSpreadsheet, ShoppingCart, RefreshCw, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import {
  getProductHistory,
  AuditEntry,
  ACTION_LABELS,
  SOURCE_LABELS,
  FIELD_LABELS,
} from '../services/productAuditService';

interface Props {
  productId: string;
  productName: string;
  productSku: string;
  onClose: () => void;
}

const fmt = (n: number | null | undefined) =>
  n != null ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n) : '—';

const fmtDate = (d: string) =>
  new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

const SOURCE_ICON: Record<string, React.ReactNode> = {
  edit_modal:     <Edit2 size={13} />,
  excel_import:   <FileSpreadsheet size={13} />,
  purchase_order: <ShoppingCart size={13} />,
  pos_sale:       <Package size={13} />,
  manual:         <RefreshCw size={13} />,
  creation:       <Package size={13} />,
};

const SOURCE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  edit_modal:     { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  excel_import:   { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  purchase_order: { bg: '#fdf4ff', text: '#7c3aed', border: '#e9d5ff' },
  pos_sale:       { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  manual:         { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' },
  creation:       { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4' },
};

const ProductHistoryModal: React.FC<Props> = ({ productId, productName, productSku, onClose }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState('ALL');
  const [filterAction, setFilterAction] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setEntries([]);
    getProductHistory(productId, 200)
      .then(data => {
        setEntries(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('[ProductHistoryModal] Error al cargar historial:', err);
        const msg = err?.message || '';
        if (msg.includes('product_audit_log') || msg.includes('does not exist') || msg.includes('relation')) {
          setLoadError('La tabla de auditoría no existe aún. Ejecuta la migración SQL incluida en los archivos del fix.');
        } else if (msg.includes('permission') || msg.includes('RLS') || msg.includes('policy')) {
          setLoadError('Sin permisos para leer el historial. Revisa las políticas RLS en Supabase.');
        } else {
          setLoadError(msg || 'Error desconocido al cargar el historial.');
        }
        setLoading(false);
      });
  }, [productId]);

  const filtered = entries.filter(e => {
    if (filterSource !== 'ALL' && e.source !== filterSource) return false;
    if (filterAction !== 'ALL' && e.action !== filterAction) return false;
    return true;
  });

  // ─── EXPORTAR EXCEL ──────────────────────────────────────────────────────
  const exportExcel = () => {
    const rows = filtered.map(e => {
      const changedFields = e.changed_fields
        ? Object.entries(e.changed_fields)
            .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${v.before} → ${v.after}`)
            .join(' | ')
        : '';
      return {
        'Fecha': e.created_at ? fmtDate(e.created_at) : '—',
        'Acción': ACTION_LABELS[e.action] || e.action,
        'Fuente': SOURCE_LABELS[e.source] || e.source,
        'Producto': e.product_name || productName,
        'SKU': e.product_sku || productSku,
        'Stock anterior': e.quantity_before ?? '',
        'Stock nuevo': e.quantity_after ?? '',
        'Diferencia stock': e.quantity_delta ?? '',
        'Precio anterior': e.price_before ?? '',
        'Precio nuevo': e.price_after ?? '',
        'Costo anterior': e.cost_before ?? '',
        'Costo nuevo': e.cost_after ?? '',
        'Campos cambiados': changedFields,
        'Referencia': e.reference_label || '',
        'Notas': e.notes || '',
        'Usuario': e.user_name || '',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 28 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 50 }, { wch: 24 }, { wch: 28 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Historial');
    XLSX.writeFile(wb, `historial_${productSku}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ─── EXPORTAR PDF ────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    const M = 14;
    let y = M;

    // Encabezado
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('HISTORIAL DE PRODUCTO', M, 13);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${productName}  ·  SKU: ${productSku}`, M, 20);
    doc.setFontSize(8);
    doc.text(`${filtered.length} registro(s)  ·  Exportado: ${new Date().toLocaleString('es-CO')}`, M, 25);

    y = 34;

    // KPIs
    const totalStockIn  = filtered.filter(e => (e.quantity_delta ?? 0) > 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);
    const totalStockOut = filtered.filter(e => (e.quantity_delta ?? 0) < 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);
    const lastPrice     = filtered.find(e => e.price_after != null)?.price_after;
    const lastCost      = filtered.find(e => e.cost_after != null)?.cost_after;

    doc.setFillColor(248, 250, 252);
    doc.rect(M, y - 2, W - M * 2, 12, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    const kpis = [
      { label: 'Total entradas', value: totalStockIn > 0 ? `+${totalStockIn}` : '—' },
      { label: 'Total salidas', value: totalStockOut !== 0 ? String(totalStockOut) : '—' },
      { label: 'Último precio', value: lastPrice != null ? fmt(lastPrice) : '—' },
      { label: 'Último costo', value: lastCost != null ? fmt(lastCost) : '—' },
    ];
    kpis.forEach((kpi, i) => {
      const xPos = M + (i * (W - M * 2) / 4) + 3;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(kpi.label, xPos, y + 3);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(String(kpi.value), xPos, y + 8);
      doc.setTextColor(100, 116, 139);
    });
    y += 16;

    // Tabla header
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, W - M * 2, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    const cols = [
      { label: 'Fecha', x: M + 2, w: 28 },
      { label: 'Acción', x: M + 30, w: 24 },
      { label: 'Fuente', x: M + 54, w: 24 },
      { label: 'Stock Δ', x: M + 78, w: 16 },
      { label: 'Precio', x: M + 94, w: 26 },
      { label: 'Costo', x: M + 120, w: 26 },
      { label: 'Usuario', x: M + 146, w: 22 },
      { label: 'Notas', x: M + 168, w: 30 },
    ];
    cols.forEach(c => doc.text(c.label, c.x, y + 5));
    y += 9;

    // Filas
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    filtered.forEach((entry, i) => {
      if (y > 275) {
        doc.addPage();
        y = M;
        // Re-imprimir header en nueva página
        doc.setFillColor(241, 245, 249);
        doc.rect(M, y, W - M * 2, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        cols.forEach(c => doc.text(c.label, c.x, y + 5));
        y += 9;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
      }

      // Fondo alterno
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, y - 1, W - M * 2, 7, 'F');
      }

      doc.setTextColor(30, 41, 59);

      // Fecha
      doc.text(entry.created_at ? fmtDate(entry.created_at) : '—', cols[0].x, y + 4);

      // Acción
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(ACTION_LABELS[entry.action] || entry.action, cols[1].x, y + 4);
      doc.setFont('helvetica', 'normal');

      // Fuente
      doc.setTextColor(100, 116, 139);
      doc.text(SOURCE_LABELS[entry.source] || entry.source, cols[2].x, y + 4);

      // Stock delta
      const delta = entry.quantity_delta ?? 0;
      if (delta !== 0) {
        doc.setTextColor(delta > 0 ? 22 : 220, delta > 0 ? 163 : 38, delta > 0 ? 74 : 38);
        doc.setFont('helvetica', 'bold');
        doc.text(`${delta > 0 ? '+' : ''}${delta}`, cols[3].x, y + 4);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('—', cols[3].x, y + 4);
      }

      // Precio
      if (entry.price_before != null || entry.price_after != null) {
        doc.setTextColor(29, 78, 216);
        doc.text(`${fmt(entry.price_before)} → ${fmt(entry.price_after)}`, cols[4].x, y + 4);
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('—', cols[4].x, y + 4);
      }

      // Costo
      if (entry.cost_before != null || entry.cost_after != null) {
        doc.setTextColor(124, 58, 237);
        doc.text(`${fmt(entry.cost_before)} → ${fmt(entry.cost_after)}`, cols[5].x, y + 4);
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('—', cols[5].x, y + 4);
      }

      // Usuario
      doc.setTextColor(71, 85, 105);
      const userName = (entry.user_name || '—').substring(0, 18);
      doc.text(userName, cols[6].x, y + 4);

      // Notas (truncar)
      doc.setTextColor(148, 163, 184);
      const notesText = (entry.notes || entry.reference_label || '—').substring(0, 35);
      doc.text(notesText, cols[7].x, y + 4);

      y += 7;
    });

    // Detalle de campos cambiados (últimas 10 entradas con changed_fields)
    const withFields = filtered.filter(e => e.changed_fields && Object.keys(e.changed_fields).length > 0);
    if (withFields.length > 0) {
      y += 3;
      if (y > 260) { doc.addPage(); y = M; }
      doc.setDrawColor(226, 232, 240);
      doc.line(M, y, W - M, y);
      y += 5;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('DETALLE DE CAMBIOS POR REGISTRO', M, y);
      y += 5;

      withFields.slice(0, 15).forEach((entry, i) => {
        if (y > 270) { doc.addPage(); y = M; }
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(`${fmtDate(entry.created_at || '')} — ${ACTION_LABELS[entry.action] || entry.action}`, M + 2, y);
        y += 3;

        doc.setFont('helvetica', 'normal');
        Object.entries(entry.changed_fields!).forEach(([field, change]) => {
          if (y > 278) { doc.addPage(); y = M; }
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(`  ${FIELD_LABELS[field] || field}:`, M + 6, y);
          doc.setTextColor(220, 38, 38);
          doc.text(String(change.before ?? '—'), M + 50, y);
          doc.setTextColor(148, 163, 184);
          doc.text('→', M + 80, y);
          doc.setTextColor(22, 163, 74);
          doc.text(String(change.after ?? '—'), M + 86, y);
          y += 3;
        });
        y += 2;
      });
    }

    // Pie de página
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generado por POSmaster · ${new Date().toLocaleString('es-CO')} · Página ${p} de ${totalPages}`, W / 2, 290, { align: 'center' });
    }

    doc.save(`historial_${productSku}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Resumen
  const totalStockIn  = entries.filter(e => (e.quantity_delta ?? 0) > 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);
  const totalStockOut = entries.filter(e => (e.quantity_delta ?? 0) < 0).reduce((s, e) => s + (e.quantity_delta ?? 0), 0);
  const lastPrice     = entries.find(e => e.price_after != null)?.price_after;
  const lastCost      = entries.find(e => e.cost_after != null)?.cost_after;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={18} color="#94a3b8" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Historial de modificaciones</p>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{productName}</h2>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>
              SKU: {productSku} ·{' '}
              {loading ? 'Cargando...' : loadError ? 'Error al cargar' : `${entries.length} registro${entries.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!loading && !loadError && entries.length > 0 && (
              <>
                <button onClick={exportPDF}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  📄 Exportar PDF
                </button>
                <button onClick={exportExcel}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  📊 Exportar Excel
                </button>
              </>
            )}
            <button onClick={onClose}
              style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* KPIs */}
        {!loading && !loadError && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
            {[
              { label: 'Total entradas', value: totalStockIn > 0 ? `+${totalStockIn}` : '—', color: '#16a34a', bg: '#f0fdf4', icon: <TrendingUp size={16} /> },
              { label: 'Total salidas', value: totalStockOut !== 0 ? String(totalStockOut) : '—', color: '#dc2626', bg: '#fef2f2', icon: <TrendingDown size={16} /> },
              { label: 'Último precio', value: lastPrice != null ? fmt(lastPrice) : '—', color: '#1d4ed8', bg: '#eff6ff', icon: <TrendingUp size={16} /> },
              { label: 'Último costo', value: lastCost != null ? fmt(lastCost) : '—', color: '#7c3aed', bg: '#f5f3ff', icon: <TrendingUp size={16} /> },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: '14px 20px', background: kpi.bg, borderRight: i < 3 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: kpi.color }}>{kpi.icon}</span>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>{kpi.label}</p>
                </div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filtros */}
        {!loading && !loadError && entries.length > 0 && (
          <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'center' }}>
            <Filter size={14} color="#94a3b8" />
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, background: '#fff', color: '#0f172a', outline: 'none' }}>
              <option value="ALL">Todas las fuentes</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, background: '#fff', color: '#0f172a', outline: 'none' }}>
              <option value="ALL">Todas las acciones</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
              <div style={{
                width: 40, height: 40, border: '3px solid #e2e8f0',
                borderTopColor: '#64748b', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#64748b' }}>Cargando historial...</p>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>Consultando registros de {productName}</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {!loading && loadError && (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <div style={{
                width: 56, height: 56, background: '#fef2f2', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <AlertCircle size={28} color="#dc2626" />
              </div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#dc2626' }}>No se pudo cargar el historial</p>
              <p style={{ margin: '8px auto 0', fontSize: 13, color: '#64748b', maxWidth: 480, lineHeight: 1.6 }}>{loadError}</p>
              <div style={{ marginTop: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'left', maxWidth: 480, margin: '20px auto 0' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Pasos para solucionar</p>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#64748b', lineHeight: 1.8 }}>
                  <li>Abre el <strong>SQL Editor</strong> en Supabase</li>
                  <li>Ejecuta el archivo <code style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: 4 }}>migration_product_audit_log.sql</code></li>
                  <li>Recarga la página y vuelve a intentarlo</li>
                </ol>
              </div>
            </div>
          )}

          {!loading && !loadError && entries.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
              <div style={{
                width: 56, height: 56, background: '#f8fafc', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <Clock size={28} color="#cbd5e1" />
              </div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#64748b' }}>Sin registros aún</p>
              <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.6, maxWidth: 340, marginLeft: 'auto', marginRight: 'auto' }}>
                Las ediciones futuras de <strong>{productName}</strong> desde el modal, importaciones Excel y recepciones de órdenes de compra aparecerán aquí automáticamente.
              </p>
            </div>
          )}

          {!loading && !loadError && entries.length > 0 && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <Filter size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Sin resultados para los filtros aplicados</p>
              <button
                onClick={() => { setFilterSource('ALL'); setFilterAction('ALL'); }}
                style={{ marginTop: 12, padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: '#475569', fontWeight: 600 }}>
                Limpiar filtros
              </button>
            </div>
          )}

          {!loading && !loadError && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map((entry, i) => {
                const sc = SOURCE_COLOR[entry.source] || SOURCE_COLOR['manual'];
                const isExpanded = expandedId === entry.id;
                const hasChangedFields = entry.changed_fields && Object.keys(entry.changed_fields).length > 0;
                const hasStockChange = entry.quantity_delta != null && entry.quantity_delta !== 0;
                const hasPriceChange = entry.price_before != null || entry.price_after != null;
                const hasCostChange  = entry.cost_before  != null || entry.cost_after  != null;

                return (
                  <div key={entry.id || i}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', transition: 'box-shadow 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>

                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: hasChangedFields ? 'pointer' : 'default' }}
                      onClick={() => hasChangedFields && setExpandedId(isExpanded ? null : (entry.id || null))}>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {SOURCE_ICON[entry.source]}
                        {SOURCE_LABELS[entry.source] || entry.source}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                            {ACTION_LABELS[entry.action] || entry.action}
                          </span>
                          {entry.reference_label && (
                            <span style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                              {entry.reference_label}
                            </span>
                          )}
                        </div>
                        {entry.notes && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{entry.notes}</p>}
                      </div>

                      {hasStockChange && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: (entry.quantity_delta ?? 0) > 0 ? '#16a34a' : '#dc2626' }}>
                            {(entry.quantity_delta ?? 0) > 0 ? '+' : ''}{entry.quantity_delta}
                          </p>
                          <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>
                            {entry.quantity_before ?? '?'} → {entry.quantity_after ?? '?'}
                          </p>
                        </div>
                      )}

                      {(hasPriceChange || hasCostChange) && !hasStockChange && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {hasPriceChange && (
                            <p style={{ margin: 0, fontSize: 11, color: '#1d4ed8', fontWeight: 700 }}>
                              P: {fmt(entry.price_before)} → {fmt(entry.price_after)}
                            </p>
                          )}
                          {hasCostChange && (
                            <p style={{ margin: 0, fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>
                              C: {fmt(entry.cost_before)} → {fmt(entry.cost_after)}
                            </p>
                          )}
                        </div>
                      )}

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>{entry.user_name || '—'}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{entry.created_at ? fmtDate(entry.created_at) : '—'}</p>
                      </div>

                      {hasChangedFields && (
                        <div style={{ color: '#94a3b8', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                          ▾
                        </div>
                      )}
                    </div>

                    {isExpanded && hasChangedFields && (
                      <div style={{ padding: '0 16px 14px', borderTop: '1px solid #f1f5f9' }}>
                        <p style={{ margin: '10px 0 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Campos modificados</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {Object.entries(entry.changed_fields!).map(([field, change]) => (
                            <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#f8fafc', borderRadius: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 140 }}>
                                {FIELD_LABELS[field] || field}
                              </span>
                              <span style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 6 }}>
                                {String(change.before ?? '—')}
                              </span>
                              <span style={{ color: '#94a3b8', fontSize: 14 }}>→</span>
                              <span style={{ fontSize: 12, color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                                {String(change.after ?? '—')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
            {loading
              ? 'Consultando base de datos...'
              : loadError
              ? 'Error al cargar — ejecuta la migración SQL'
              : `Mostrando los últimos 200 registros · Los registros se generan automáticamente`}
          </p>
          <button onClick={onClose}
            style={{ padding: '8px 20px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductHistoryModal;