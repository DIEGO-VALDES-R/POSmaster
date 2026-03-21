import React, { useState, useEffect } from 'react';
import { DollarSign, Lock, Unlock, History, AlertTriangle, FileText, ChevronDown, ChevronUp, RefreshCw, Printer, Wifi, Monitor, Settings, MinusCircle, Plus, Trash2, X } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { useCurrency } from '../contexts/CurrencyContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';
import RefreshButton from '../components/RefreshButton';

// ─────────────────────────────────────────────
// APERTURA DE CAJÓN REGISTRADORA
// Soporta: ESC/POS USB, ESC/POS en red (IP), Impresora Windows
// ─────────────────────────────────────────────
type DrawerProtocol = 'escpos-usb' | 'escpos-network' | 'windows-print';

interface DrawerConfig {
  protocol: DrawerProtocol;
  networkIp?: string;
  networkPort?: number;
  windowsPrinter?: string;
}

// Comando ESC/POS estándar para abrir cajón (DLE EOT + pulso en pin 2)
const ESC_POS_OPEN_DRAWER = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);

const openCashDrawer = async (config: DrawerConfig): Promise<{ ok: boolean; msg: string }> => {
  try {
    switch (config.protocol) {

      // ── USB (WebUSB API) ────────────────────────────────
      case 'escpos-usb': {
        if (!('usb' in navigator)) return { ok: false, msg: 'WebUSB no disponible en este navegador. Usa Chrome/Edge.' };
        const device = await (navigator as any).usb.requestDevice({ filters: [] });
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        await device.claimInterface(0);
        const endpoint = device.configuration.interfaces[0].alternate.endpoints
          .find((e: any) => e.direction === 'out');
        if (!endpoint) { await device.close(); return { ok: false, msg: 'No se encontró endpoint de salida en la impresora.' }; }
        await device.transferOut(endpoint.endpointNumber, ESC_POS_OPEN_DRAWER);
        await device.close();
        return { ok: true, msg: 'Cajón abierto (USB ESC/POS)' };
      }

      // ── Red / IP (fetch a backend proxy o Web Serial como fallback) ───
      case 'escpos-network': {
        const ip = config.networkIp || '192.168.1.100';
        const port = config.networkPort || 9100;
        // Intentar via fetch a un proxy local (si está configurado)
        // En producción esto requiere un proxy o servidor local en el POS
        const hexCmd = Array.from(ESC_POS_OPEN_DRAWER).map(b => b.toString(16).padStart(2, '0')).join('');
        const proxyUrl = `http://localhost:8765/rawprint?ip=${ip}&port=${port}&hex=${hexCmd}`;
        try {
          const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(3000) });
          if (res.ok) return { ok: true, msg: `Cajón abierto (Red ${ip}:${port})` };
        } catch { /* proxy no disponible */ }
        // Fallback: mostrar instrucciones
        return {
          ok: false,
          msg: `Impresora de red detectada en ${ip}:${port}. Para apertura automática instala POSmaster-Bridge en el equipo. Descarga en: posmaster.app/bridge`
        };
      }

      // ── Windows (window.print con página en blanco + script nativo) ──
      case 'windows-print': {
        const printer = config.windowsPrinter || '';
        // Generar página imperceptible para forzar apertura de cajón via driver Windows
        const html = `<html><head><style>body{margin:0;padding:0}</style><script>
          window.onload = function() {
            document.title = '${printer ? `\\\\localhost\\${printer}` : ''}';
            window.print();
            setTimeout(function(){ window.close(); }, 500);
          };
        </sc` + `ript></head><body><p style="font-size:1px;color:white;">.</p></body></html>`;
        const w = window.open('', '_blank', 'width=1,height=1,top=-100,left=-100');
        if (!w) return { ok: false, msg: 'El navegador bloqueó la ventana emergente. Permite popups para este sitio.' };
        w.document.write(html);
        return { ok: true, msg: 'Señal enviada a impresora Windows. El cajón debe abrirse.' };
      }

      default:
        return { ok: false, msg: 'Protocolo no reconocido.' };
    }
  } catch (err: any) {
    return { ok: false, msg: err?.message || 'Error desconocido al abrir cajón.' };
  }
};

// ─────────────────────────────────────────────
// MODAL CONFIGURACIÓN DE CAJÓN
// ─────────────────────────────────────────────
const DrawerConfigModal: React.FC<{
  config: DrawerConfig;
  onChange: (c: DrawerConfig) => void;
  onClose: () => void;
}> = ({ config, onChange, onClose }) => {
  const [local, setLocal] = useState<DrawerConfig>(config);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b flex justify-between items-center bg-gradient-to-r from-slate-700 to-slate-800">
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-white" />
            <h2 className="text-lg font-bold text-white">Configurar Cajón Registradora</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Protocolo de apertura</label>
            <div className="space-y-2">
              {[
                { id: 'escpos-usb', icon: <Printer size={18} />, label: 'USB (ESC/POS via WebUSB)', desc: 'Impresora térmica conectada por USB directo' },
                { id: 'escpos-network', icon: <Wifi size={18} />, label: 'Red / IP (ESC/POS)', desc: 'Impresora térmica con IP en la red local' },
                { id: 'windows-print', icon: <Monitor size={18} />, label: 'Impresora Windows', desc: 'Impresora instalada en el sistema operativo' },
              ].map(opt => (
                <label key={opt.id} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${local.protocol === opt.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="proto" value={opt.id} checked={local.protocol === opt.id}
                    onChange={() => setLocal(p => ({ ...p, protocol: opt.id as DrawerProtocol }))} className="mt-1" />
                  <div className={`mt-0.5 ${local.protocol === opt.id ? 'text-blue-600' : 'text-slate-400'}`}>{opt.icon}</div>
                  <div>
                    <p className="font-semibold text-sm text-slate-800">{opt.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {local.protocol === 'escpos-network' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">IP de la impresora</label>
                <input value={local.networkIp || ''} onChange={e => setLocal(p => ({ ...p, networkIp: e.target.value }))}
                  placeholder="192.168.1.100" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Puerto</label>
                <input type="number" value={local.networkPort || 9100} onChange={e => setLocal(p => ({ ...p, networkPort: parseInt(e.target.value) || 9100 }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {local.protocol === 'windows-print' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de impresora (opcional)</label>
              <input value={local.windowsPrinter || ''} onChange={e => setLocal(p => ({ ...p, windowsPrinter: e.target.value }))}
                placeholder="Ej: POS58 Thermal Printer" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-slate-400 mt-1">Dejar vacío usa la impresora predeterminada del sistema</p>
            </div>
          )}
        </div>
        <div className="p-5 border-t flex gap-3 bg-slate-50">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 text-sm">Cancelar</button>
          <button onClick={() => { onChange(local); onClose(); }}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 text-sm">
            Guardar configuración
          </button>
        </div>
      </div>
    </div>
  );
};


interface TurnInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  created_at: string;
  customer_name?: string;
  payment_method?: any;
}

interface CashExpense {
  id?: string;
  concept: string;
  amount: number;
  category: string;
  created_at?: string;
}

const EXPENSE_CATEGORIES = [
  { id: 'general',    label: 'General' },
  { id: 'servicios',  label: 'Servicios (agua, luz…)' },
  { id: 'compras',    label: 'Compras menores' },
  { id: 'transporte', label: 'Transporte / mensajería' },
  { id: 'aseo',       label: 'Aseo / mantenimiento' },
  { id: 'otro',       label: 'Otro' },
];


// ── Generador PDF de Turno ───────────────────────────────────────────────────
function generateCashPDF(opts: {
  company: any; session: any; expenses: any[];
  turnInvoices: any[]; totalExpenses: number; formatMoney: (n: number) => string;
}) {
  const { company, session, expenses, turnInvoices, totalExpenses, formatMoney } = opts;
  const isOpen = session?.status === 'OPEN';
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const totalVentas = (session?.total_sales_cash || 0) + (session?.total_sales_card || 0);
  const totalEsperado = (session?.start_cash || 0) + (session?.total_sales_cash || 0) - totalExpenses;

  const invoiceRows = turnInvoices.slice(0, 60).map((inv: any) => {
    const method = inv.payment_method?.method || inv.payment_method || 'CASH';
    const hour = new Date(inv.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `<tr style="border-bottom:1px solid #f8fafc"><td style="padding:5px 8px;font-size:12px;font-weight:600">${inv.invoice_number}</td><td style="padding:5px 8px;font-size:12px;color:#64748b">${hour}</td><td style="padding:5px 8px;font-size:12px">${method}</td><td style="padding:5px 8px;font-size:12px;text-align:right;font-weight:700">${formatMoney(inv.total_amount)}</td></tr>`;
  }).join('');

  const expenseRows = expenses.map((exp: any) => {
    const hour = new Date(exp.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `<tr style="border-bottom:1px solid #f8fafc"><td style="padding:5px 8px;font-size:12px;font-weight:600">${exp.concept}</td><td style="padding:5px 8px;font-size:12px;color:#64748b">${exp.category}</td><td style="padding:5px 8px;font-size:12px;color:#64748b">${hour}</td><td style="padding:5px 8px;font-size:12px;text-align:right;font-weight:700;color:#ef4444">- ${formatMoney(exp.amount)}</td></tr>`;
  }).join('');

  const diffHtml = (() => {
    if (!session?.end_time) return '';
    const diff = (session.end_cash || 0) - totalEsperado;
    const col = diff < 0 ? '#ef4444' : diff > 0 ? '#22c55e' : '#64748b';
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Diferencia</span><span style="font-weight:700;color:${col}">${diff >= 0 ? '+' : ''}${formatMoney(diff)} ${diff < 0 ? '(Faltante)' : diff > 0 ? '(Sobrante)' : '(Cuadre exacto)'}</span></div>`;
  })();

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Informe de Caja</title>
  <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:24px 32px;color:#0f172a;font-size:12px}h2{font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin:20px 0 6px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:4px}th{background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;padding:6px 8px;text-align:left}@page{size:A4;margin:20mm}@media print{button{display:none}}</style>
  </head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #0f172a">
    <div><p style="font-weight:800;font-size:18px;margin:0">${company?.name || 'POSmaster'}</p><p style="margin:4px 0 0;color:#64748b;font-size:12px">NIT: ${company?.nit || '—'} · ${company?.address || ''}</p></div>
    <div style="text-align:right"><p style="font-weight:800;font-size:16px;color:#3b82f6;margin:0">INFORME DE CAJA</p><p style="font-size:11px;color:#64748b;margin:4px 0">${dateStr} · ${timeStr}</p><span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:${isOpen ? '#dcfce7' : '#f1f5f9'};color:${isOpen ? '#166534' : '#64748b'}">${isOpen ? '🟢 TURNO ABIERTO' : '⚫ TURNO CERRADO'}</span></div>
  </div>
  <h2>Apertura</h2>
  <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Fecha / Hora Apertura</span><span style="font-weight:700">${session?.start_time ? new Date(session.start_time).toLocaleString('es-CO') : '—'}</span></div>
  <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Base Inicial</span><span style="font-weight:700">${formatMoney(session?.start_cash || 0)}</span></div>
  ${session?.end_time ? `<h2>Cierre</h2><div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Fecha / Hora Cierre</span><span style="font-weight:700">${new Date(session.end_time).toLocaleString('es-CO')}</span></div><div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Dinero Contado</span><span style="font-weight:700">${formatMoney(session.end_cash || 0)}</span></div>${diffHtml}` : ''}
  <h2>Balance Financiero</h2>
  <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Ventas Efectivo</span><span style="font-weight:700">${formatMoney(session?.total_sales_cash || 0)}</span></div>
  <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Ventas Tarjeta / Otros</span><span style="font-weight:700">${formatMoney(session?.total_sales_card || 0)}</span></div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0f172a;font-size:14px;font-weight:800"><span>Total Ventas</span><span>${formatMoney(totalVentas)}</span></div>
  <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#ef4444">Egresos de Caja</span><span style="font-weight:700;color:#ef4444">- ${formatMoney(totalExpenses)}</span></div>
  <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #3b82f6;font-size:15px;font-weight:800;color:#3b82f6"><span>Total Esperado en Caja</span><span>${formatMoney(totalEsperado)}</span></div>
  ${turnInvoices.length > 0 ? `<h2>Facturas del Turno (${turnInvoices.length})</h2><table><thead><tr><th>N° Factura</th><th>Hora</th><th>Método</th><th style="text-align:right">Total</th></tr></thead><tbody>${invoiceRows}</tbody></table>` : ''}
  ${expenses.length > 0 ? `<h2>Egresos (${expenses.length})</h2><table><thead><tr><th>Concepto</th><th>Categoría</th><th>Hora</th><th style="text-align:right">Monto</th></tr></thead><tbody>${expenseRows}</tbody><tfoot><tr style="background:#fef2f2"><td colspan="3" style="padding:7px 8px;font-weight:700">Total Egresos</td><td style="padding:7px 8px;font-weight:800;text-align:right;color:#ef4444">- ${formatMoney(totalExpenses)}</td></tr></tfoot></table>` : ''}
  <p style="margin-top:28px;text-align:center;font-size:10px;color:#94a3b8">Generado por POSmaster · ${dateStr} ${timeStr}</p>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
}

const CashControl: React.FC = () => {
  const { session, openSession, closeSession, sessionsHistory, companyId, branchId, refreshAll } = useDatabase();
  const [openAmount, setOpenAmount] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [turnInvoices, setTurnInvoices] = useState<TurnInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [showInvoices, setShowInvoices] = useState(true);
  const [drawerConfig, setDrawerConfig] = useState<DrawerConfig>(() => {
    try { return JSON.parse(localStorage.getItem('posmaster_drawer_config') || '{}'); } catch { return {}; }
  });
  const [drawerProtocol, setDrawerProtocol] = useState<DrawerProtocol>(
    (drawerConfig as any).protocol || 'escpos-usb'
  );
  const [showDrawerConfig, setShowDrawerConfig] = useState(false);
  const [openingDrawer, setOpeningDrawer] = useState(false);

  // Egresos de caja
  const [expenses, setExpenses] = useState<CashExpense[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseConcept, setExpenseConcept] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('general');
  const [savingExpense, setSavingExpense] = useState(false);

  const { formatMoney } = useCurrency();

  // Cargar facturas del turno actual
  useEffect(() => {
    const loadTurnInvoices = async () => {
      if (!session?.id || !companyId || session.status !== 'OPEN') {
        setTurnInvoices([]);
        return;
      }
      setLoadingInvoices(true);
      try {
        let query = supabase
          .from('invoices')
          .select('id, invoice_number, total_amount, created_at, payment_method')
          .eq('company_id', companyId)
          .gte('created_at', session.start_time)
          .order('created_at', { ascending: false });

        if (branchId) query = query.eq('branch_id', branchId);

        const { data, error } = await query;
        if (error) throw error;
        setTurnInvoices(data || []);
      } catch (e: any) {
        console.error('Error cargando facturas del turno:', e);
      } finally {
        setLoadingInvoices(false);
      }
    };

    loadTurnInvoices();
  }, [session, companyId, branchId]);

  // Cargar egresos del turno actual
  useEffect(() => {
    const loadExpenses = async () => {
      if (!session?.id || session.status !== 'OPEN') { setExpenses([]); return; }
      const { data } = await supabase.from('cash_expenses')
        .select('*').eq('session_id', session.id).order('created_at', { ascending: false });
      setExpenses(data || []);
    };
    loadExpenses();
  }, [session]);

  const handleSaveExpense = async () => {
    if (!expenseConcept.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
      toast.error('Completa el concepto y el monto'); return;
    }
    if (!session?.id || !companyId) return;
    setSavingExpense(true);
    try {
      const { data, error } = await supabase.from('cash_expenses').insert({
        company_id: companyId,
        branch_id: branchId || null,
        session_id: session.id,
        concept: expenseConcept.trim(),
        amount: parseFloat(expenseAmount),
        category: expenseCategory,
      }).select().single();
      if (error) throw error;
      setExpenses(prev => [data, ...prev]);
      setExpenseConcept('');
      setExpenseAmount('');
      setExpenseCategory('general');
      setShowExpenseModal(false);
      toast.success('Egreso registrado');
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingExpense(false); }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('¿Eliminar este egreso?')) return;
    await supabase.from('cash_expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    toast.success('Egreso eliminado');
  };

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const handleOpenRegister = (e: React.FormEvent) => {
    e.preventDefault();
    openSession(parseFloat(openAmount));
    setOpenAmount('');
  };

  const handleCloseRegister = (e: React.FormEvent) => {
    e.preventDefault();
    closeSession(parseFloat(closeAmount));
    setCloseAmount('');
    setNotes('');
  };

  const handleOpenDrawer = async () => {
    setOpeningDrawer(true);
    const cfg: DrawerConfig = {
      protocol: drawerConfig.protocol || 'escpos-usb',
      networkIp: drawerConfig.networkIp,
      networkPort: drawerConfig.networkPort,
      windowsPrinter: drawerConfig.windowsPrinter,
    };
    const result = await openCashDrawer(cfg);
    if (result.ok) toast.success(result.msg);
    else toast.error(result.msg, { duration: 6000 });
    setOpeningDrawer(false);
  };

  const saveDrawerConfig = (cfg: DrawerConfig) => {
    setDrawerConfig(cfg);
    try { localStorage.setItem('posmaster_drawer_config', JSON.stringify(cfg)); } catch {}
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Toaster />
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Control de Caja</h2>
          <p className="text-slate-500">Apertura, cierre y arqueo de turnos</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={refreshAll} />
          <button onClick={handleOpenDrawer} disabled={openingDrawer || session?.status !== 'OPEN'}
            title="Abrir cajón registradora"
            className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg font-medium text-sm transition-all">
            {openingDrawer ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <DollarSign size={16} />}
            Abrir Cajón
          </button>

          <div className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${session?.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {session?.status === 'OPEN' ? <Unlock size={20} /> : <Lock size={20} />}
            {session?.status === 'OPEN' ? 'CAJA ABIERTA' : 'CAJA CERRADA'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Estado Actual */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-lg text-slate-800 mb-4">Estado Actual</h3>

          {!session || session.status === 'CLOSED' ? (
            <form onSubmit={handleOpenRegister} className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-4">
                <p className="text-sm text-blue-800">Ingrese el monto base (sencillo) para iniciar operaciones.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base de Caja ($)</label>
                <input
                  type="number"
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                  value={openAmount}
                  onChange={e => setOpenAmount(e.target.value)}
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700">
                Abrir Caja
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Hora Apertura</p>
                  <p className="font-mono font-bold">{new Date(session.start_time).toLocaleTimeString()}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Base Inicial</p>
                  <p className="font-mono font-bold">{formatMoney(session.start_cash)}</p>
                </div>
              </div>

              <div className="py-4 border-t border-b border-slate-100 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Ventas Efectivo (Sistema)</span>
                  <span className="font-bold text-slate-800">{formatMoney(session.total_sales_cash)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Ventas Tarjeta/Otros</span>
                  <span className="font-bold text-slate-800">{formatMoney(session.total_sales_card)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Facturas en este turno</span>
                  <span className="font-bold text-blue-600">{turnInvoices.length} facturas</span>
                </div>
                {totalExpenses > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600">Egresos registrados</span>
                    <span className="font-bold text-red-600">- {formatMoney(totalExpenses)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 text-blue-600">
                  <span>Total Esperado en Caja</span>
                  <span>{formatMoney(session.start_cash + session.total_sales_cash - totalExpenses)}</span>
                </div>
              </div>

              {/* ── Egresos de caja ──────────────────────────────────────── */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <MinusCircle size={15} className="text-red-500" />
                    <span className="text-sm font-semibold text-slate-700">Egresos de caja</span>
                    {expenses.length > 0 && (
                      <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full">
                        {formatMoney(totalExpenses)}
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => setShowExpenseModal(true)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold">
                    <Plus size={12} /> Registrar egreso
                  </button>
                </div>
                {expenses.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Sin egresos en este turno</p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {expenses.map(exp => (
                      <div key={exp.id} className="flex items-center justify-between px-4 py-2 text-sm">
                        <div>
                          <p className="font-medium text-slate-700">{exp.concept}</p>
                          <p className="text-xs text-slate-400 capitalize">{exp.category} · {new Date(exp.created_at!).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-600">{formatMoney(exp.amount)}</span>
                          <button type="button" onClick={() => handleDeleteExpense(exp.id!)} className="text-slate-300 hover:text-red-400">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón PDF turno actual */}
              <button
                type="button"
                onClick={() => generateCashPDF({ company, session, expenses, turnInvoices, totalExpenses, formatMoney })}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-slate-300 text-slate-600 font-bold rounded-lg hover:border-slate-400 hover:bg-slate-50 transition-colors text-sm mb-2">
                📄 Exportar PDF del Turno
              </button>

              <form onSubmit={handleCloseRegister} className="space-y-4 pt-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dinero Contado (Arqueo)</label>
                  <input
                    type="number"
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
                    placeholder="Ingrese total contado..."
                    value={closeAmount}
                    onChange={e => setCloseAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notas / Observaciones</label>
                  <textarea
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
                <button type="submit" className="w-full bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700 flex justify-center gap-2">
                  <Lock size={18} /> Cerrar Turno
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Historial de Turnos */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
            <History size={20} /> Historial Reciente
          </h3>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {sessionsHistory.length === 0 ? (
              <div className="text-center py-8">
                <History size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-400 text-sm">No hay turnos cerrados aún.</p>
                <p className="text-slate-300 text-xs mt-1">El historial aparecerá cuando cierres el primer turno.</p>
              </div>
            ) : (
              sessionsHistory.map((hist) => {
                const diff = hist.difference || 0;
                const isNegative = diff < 0;
                const isPositive = diff > 0;

                return (
                  <div key={hist.id} className={`p-3 border rounded-lg hover:bg-slate-50 transition-colors ${isNegative ? 'border-l-4 border-l-red-500' : isPositive ? 'border-l-4 border-l-blue-500' : 'border-slate-100'}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-bold text-slate-700">
                        {new Date(hist.start_time).toLocaleDateString()} — {new Date(hist.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {diff === 0 ? (
                        <span className="text-green-600 font-bold text-xs bg-green-100 px-2 py-0.5 rounded">Cuadrado</span>
                      ) : (
                        <span className={`font-bold text-xs px-2 py-0.5 rounded ${isNegative ? 'text-red-600 bg-red-100' : 'text-blue-600 bg-blue-100'}`}>
                          {isNegative ? 'Faltante: ' : 'Sobrante: '}{formatMoney(Math.abs(diff))}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Base: {formatMoney(hist.start_cash)}</span>
                      <span>Ventas: {formatMoney((hist.total_sales_cash || 0) + (hist.total_sales_card || 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>Total esperado: {formatMoney((hist.start_cash || 0) + (hist.total_sales_cash || 0))}</span>
                      {hist.end_cash != null && <span>Contado: {formatMoney(hist.end_cash)}</span>}
                    </div>
                    {hist.end_time && (
                      <div className="text-[10px] text-slate-400 mt-1 text-right">
                        Cierre: {new Date(hist.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Facturas del Turno Actual */}
      {session?.status === 'OPEN' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <button
            onClick={() => setShowInvoices(!showInvoices)}
            className="w-full p-4 flex justify-between items-center hover:bg-slate-50 transition-colors"
          >
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <FileText size={20} className="text-blue-600" />
              Facturas de este Turno
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full ml-1">
                {turnInvoices.length}
              </span>
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-blue-600">
                Total: {formatMoney(turnInvoices.reduce((sum, inv) => sum + inv.total_amount, 0))}
              </span>
              {showInvoices ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
            </div>
          </button>

          {showInvoices && (
            <div className="border-t border-slate-200">
              {loadingInvoices ? (
                <div className="p-8 text-center text-slate-400">Cargando facturas...</div>
              ) : turnInvoices.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <FileText size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No hay ventas registradas en este turno aún.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600"># Factura</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Hora</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Método</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {turnInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-blue-600 font-bold">{inv.invoice_number}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                            {inv.payment_method?.method || 'CASH'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">
                          {formatMoney(inv.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 font-bold text-slate-700">TOTAL TURNO</td>
                      <td className="px-4 py-3 text-right font-bold text-lg text-blue-600">
                        {formatMoney(turnInvoices.reduce((sum, inv) => sum + inv.total_amount, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </div>
      )}



      {/* ── Modal Egreso de Caja ─────────────────────────────────────── */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MinusCircle size={18} className="text-red-500" />
                <h3 className="font-bold text-slate-800">Registrar egreso</h3>
              </div>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Concepto *</label>
                <input
                  autoFocus
                  value={expenseConcept}
                  onChange={e => setExpenseConcept(e.target.value)}
                  placeholder="Ej: Papel para impresora, domicilio..."
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-400">
                  {EXPENSE_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
                <input
                  type="number"
                  min="0"
                  value={expenseAmount}
                  onChange={e => setExpenseAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-400"
                  onKeyDown={e => e.key === 'Enter' && handleSaveExpense()}
                />
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setShowExpenseModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium">
                Cancelar
              </button>
              <button onClick={handleSaveExpense} disabled={savingExpense}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold disabled:opacity-50">
                {savingExpense ? 'Guardando...' : 'Registrar egreso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashControl;