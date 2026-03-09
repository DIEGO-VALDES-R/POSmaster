import React, { useState, useEffect } from 'react';
import { DollarSign, Lock, Unlock, History, AlertTriangle, FileText, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { useCurrency } from '../contexts/CurrencyContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';
import RefreshButton from '../components/RefreshButton';

interface TurnInvoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  created_at: string;
  customer_name?: string;
  payment_method?: any;
}

const CashControl: React.FC = () => {
  const { session, openSession, closeSession, sessionsHistory, companyId, refreshAll } = useDatabase();
  const [openAmount, setOpenAmount] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [turnInvoices, setTurnInvoices] = useState<TurnInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [showInvoices, setShowInvoices] = useState(true);

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
        const { data, error } = await supabase
          .from('invoices')
          .select('id, invoice_number, total_amount, created_at, payment_method')
          .eq('company_id', companyId)
          .gte('created_at', session.start_time)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTurnInvoices(data || []);
      } catch (e: any) {
        console.error('Error cargando facturas del turno:', e);
      } finally {
        setLoadingInvoices(false);
      }
    };

    loadTurnInvoices();
  }, [session, companyId]);

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
                <div className="flex justify-between text-lg font-bold pt-2 text-blue-600">
                  <span>Total Esperado en Caja</span>
                  <span>{formatMoney(session.start_cash + session.total_sales_cash)}</span>
                </div>
              </div>

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
    </div>
  );
};

export default CashControl;