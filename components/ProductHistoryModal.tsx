import React, { useState, useEffect } from 'react';
import { X, Download, Filter, Clock, Package, TrendingUp, TrendingDown, Edit2, FileSpreadsheet, ShoppingCart, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
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
  const [filterSource, setFilterSource] = useState('ALL');
  const [filterAction, setFilterAction] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getProductHistory(productId, 200)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [productId]);

  const filtered = entries.filter(e => {
    if (filterSource !== 'ALL' && e.source !== filterSource) return false;
    if (filterAction !== 'ALL' && e.action !== filterAction) return false;
    return true;
  });

  const exportExcel = () => {
    const rows = entries.map(e => {
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

  // Calcular resumen
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
            <p style={{ margin: 0, fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>SKU: {productSku} · {entries.length} registro{entries.length !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={exportExcel}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              <Download size={14} /> Exportar Excel
            </button>
            <button onClick={onClose}
              style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* KPIs rápidos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
          {[
            { label: 'Total entradas', value: `+${totalStockIn}`, color: '#16a34a', bg: '#f0fdf4', icon: <TrendingUp size={16} /> },
            { label: 'Total salidas', value: String(totalStockOut), color: '#dc2626', bg: '#fef2f2', icon: <TrendingDown size={16} /> },
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

        {/* Filtros */}
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

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
              <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <p style={{ margin: 0 }}>Cargando historial...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
              <Clock size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Sin registros</p>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>Las modificaciones futuras aparecerán aquí</p>
            </div>
          ) : (
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

                    {/* Fila principal */}
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: hasChangedFields ? 'pointer' : 'default' }}
                      onClick={() => hasChangedFields && setExpandedId(isExpanded ? null : (entry.id || null))}>

                      {/* Badge fuente */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {SOURCE_ICON[entry.source]}
                        {SOURCE_LABELS[entry.source] || entry.source}
                      </div>

                      {/* Acción */}
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

                      {/* Stock delta */}
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

                      {/* Precio/Costo changes */}
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

                      {/* Usuario y fecha */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 600 }}>{entry.user_name || '—'}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{entry.created_at ? fmtDate(entry.created_at) : '—'}</p>
                      </div>

                      {/* Expand arrow */}
                      {hasChangedFields && (
                        <div style={{ color: '#94a3b8', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                          ▾
                        </div>
                      )}
                    </div>

                    {/* Detalle de campos cambiados */}
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
            Mostrando los últimos 200 registros · Los registros se generan automáticamente
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
