import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, ShoppingCart, X, Search,
  Pill, Stethoscope, Package, CheckCircle,
  AlertTriangle, Receipt, User, PawPrint, DollarSign
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Medicamento {
  id: string; nombre: string; tipo: string;
  presentacion: string; stock: number; precio: number;
  precio_unitario?: number; // precio por unidad/ml/tableta si está configurado
  stock_minimo?: number; laboratorio?: string;
}

interface Servicio {
  id: string; nombre: string; precio: number;
  descripcion: string; activo: boolean; categoria?: string;
}

interface InsumoProduct {
  id: string; name: string; sku: string;
  price: number; cost: number; stock_quantity: number;
  category?: string;
}

interface Mascota {
  id: string; nombre: string; especie: string; raza: string;
  propietario_id: string; propietario_nombre?: string;
}

interface Propietario {
  id: string; nombre: string; documento: string; telefono: string;
}

interface LineaFactura {
  tipo: 'servicio' | 'medicamento' | 'insumo';
  id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  // Solo medicamentos
  unidad_medida?: string;  // ml, mg, unidad, tableta
  stock_disponible?: number;
  presentacion_total?: number; // ej: 100ml en el frasco
}

interface Props {
  companyId: string;
  mascotas: Mascota[];
  propietarios: Propietario[];
  medicamentos: Medicamento[];
  servicios: Servicio[];
  onFacturaCreada: () => void;
  fmtCurrency: (n: number) => string;
  brandColor: string;
}

// ── Helper: extraer cantidad total de la presentación ─────────────────────────
// "Frasco 100ml" → 100, "Tabletas x50" → 50, "10mg/2ml" → 2
function parsePresentacion(presentacion: string): number {
  if (!presentacion) return 1;
  const match = presentacion.match(/(\d+(?:\.\d+)?)\s*(ml|mg|g|l|ui|iu|unidades?|tabletas?|caps?|x\s*\d+)/i);
  if (match) return parseFloat(match[1]);
  const numMatch = presentacion.match(/\d+/);
  return numMatch ? parseFloat(numMatch[0]) : 1;
}

// ── Componente principal ──────────────────────────────────────────────────────
const VetFacturacionClinica: React.FC<Props> = ({
  companyId, mascotas, propietarios, medicamentos, servicios,
  onFacturaCreada, fmtCurrency, brandColor
}) => {
  const [step, setStep] = useState<'seleccion' | 'items' | 'pago'>('seleccion');
  const [mascotaId, setMascotaId] = useState('');
  const [searchMascota, setSearchMascota] = useState('');
  const [lineas, setLineas] = useState<LineaFactura[]>([]);
  const [insumos, setInsumos] = useState<InsumoProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [seccionActiva, setSeccionActiva] = useState<'servicios' | 'medicamentos' | 'insumos'>('servicios');
  const [amountPaid, setAmountPaid] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal cantidad para medicamentos
  const [modalMed, setModalMed] = useState<{ med: Medicamento } | null>(null);
  const [cantidadMed, setCantidadMed] = useState('');
  const [unidadMed, setUnidadMed] = useState<'frasco_completo' | 'ml' | 'mg' | 'tabletas' | 'unidad'>('unidad');

  const mascota = mascotas.find(m => m.id === mascotaId);
  const propietario = mascota ? propietarios.find(p => p.id === mascota.propietario_id) : null;

  // Cargar insumos de veterinaria desde products
  const loadInsumos = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, price, cost, stock_quantity, category')
      .eq('company_id', companyId)
      .eq('business_context', 'veterinaria')
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .order('name');
    setInsumos(data || []);
  }, [companyId]);

  useEffect(() => { loadInsumos(); }, [loadInsumos]);

  const total = lineas.reduce((s, l) => s + l.total, 0);
  const pagado = parseFloat(amountPaid) || 0;
  const cambio = pagado - total;
  const saldo = Math.max(0, total - pagado);

  // ── Agregar servicio ──────────────────────────────────────────────────────
  const agregarServicio = (svc: Servicio) => {
    const existe = lineas.find(l => l.id === svc.id && l.tipo === 'servicio');
    if (existe) {
      setLineas(prev => prev.map(l =>
        l.id === svc.id && l.tipo === 'servicio'
          ? { ...l, cantidad: l.cantidad + 1, total: (l.cantidad + 1) * l.precio_unitario }
          : l
      ));
    } else {
      setLineas(prev => [...prev, {
        tipo: 'servicio', id: svc.id, nombre: svc.nombre,
        cantidad: 1, precio_unitario: svc.precio, total: svc.precio,
      }]);
    }
    toast.success(`${svc.nombre} agregado`);
  };

  // ── Agregar medicamento con cantidad ─────────────────────────────────────
  const confirmarMedicamento = () => {
    if (!modalMed) return;
    const med = modalMed.med;
    const cant = parseFloat(cantidadMed) || 0;
    if (cant <= 0) { toast.error('Ingresa una cantidad válida'); return; }

    let precioLinea = 0;
    let nombreLinea = med.nombre;
    const presentTotal = parsePresentacion(med.presentacion);
    // Usar precio_unitario si está configurado, sino calcular proporcional del frasco
    const precioUnitBase = med.precio_unitario && med.precio_unitario > 0
      ? med.precio_unitario
      : (presentTotal > 0 ? med.precio / presentTotal : med.precio);

    if (unidadMed === 'frasco_completo') {
      precioLinea = med.precio;
      nombreLinea = `${med.nombre} (frasco completo)`;
      if (cant > med.stock) { toast.error(`Stock insuficiente. Disponible: ${med.stock}`); return; }
    } else {
      precioLinea = Math.round(precioUnitBase * cant);
      nombreLinea = `${med.nombre} (${cant} ${unidadMed})`;
      const fraccionUsada = cant / presentTotal;
      if (fraccionUsada > med.stock) { toast.error(`Stock insuficiente`); return; }
    }

    setLineas(prev => [...prev, {
      tipo: 'medicamento', id: med.id,
      nombre: nombreLinea,
      cantidad: unidadMed === 'frasco_completo' ? cant : 1,
      precio_unitario: precioLinea,
      total: precioLinea,
      unidad_medida: unidadMed,
      stock_disponible: med.stock,
      presentacion_total: presentTotal,
    }]);

    setModalMed(null);
    setCantidadMed('');
    toast.success(`${nombreLinea} agregado`);
  };

  // ── Agregar insumo ────────────────────────────────────────────────────────
  const agregarInsumo = (ins: InsumoProduct) => {
    const existe = lineas.find(l => l.id === ins.id && l.tipo === 'insumo');
    if (existe) {
      if (existe.cantidad >= ins.stock_quantity) { toast.error('Stock insuficiente'); return; }
      setLineas(prev => prev.map(l =>
        l.id === ins.id && l.tipo === 'insumo'
          ? { ...l, cantidad: l.cantidad + 1, total: (l.cantidad + 1) * l.precio_unitario }
          : l
      ));
    } else {
      setLineas(prev => [...prev, {
        tipo: 'insumo', id: ins.id, nombre: ins.name,
        cantidad: 1, precio_unitario: ins.price, total: ins.price,
        stock_disponible: ins.stock_quantity,
      }]);
    }
    toast.success(`${ins.name} agregado`);
  };

  const cambiarCantidad = (idx: number, delta: number) => {
    setLineas(prev => {
      const updated = [...prev];
      const l = { ...updated[idx] };
      const nueva = l.cantidad + delta;
      if (nueva <= 0) { updated.splice(idx, 1); return updated; }
      if (l.stock_disponible && nueva > l.stock_disponible) {
        toast.error('Stock insuficiente'); return prev;
      }
      l.cantidad = nueva;
      l.total = nueva * l.precio_unitario;
      updated[idx] = l;
      return updated;
    });
  };

  const eliminarLinea = (idx: number) => setLineas(prev => prev.filter((_, i) => i !== idx));

  // ── Confirmar pago y guardar ──────────────────────────────────────────────
  const confirmarPago = async () => {
    if (!mascotaId) { toast.error('Selecciona una mascota'); return; }
    if (lineas.length === 0) { toast.error('Agrega al menos un servicio o producto'); return; }
    setSaving(true);
    try {
      const estado: 'PAGADA' | 'ABONO' | 'PENDIENTE' =
        saldo === 0 ? 'PAGADA' : pagado > 0 ? 'ABONO' : 'PENDIENTE';

      // Descripción resumida
      const descripcion = lineas.map(l => `${l.nombre} x${l.cantidad}`).join(', ');

      // 1. Guardar en vet_facturas (saldo es columna generada — no se inserta)
      const { error: factErr } = await supabase.from('vet_facturas').insert({
        company_id: companyId,
        mascota_id: mascotaId,
        mascota_nombre: mascota?.nombre,
        propietario_nombre: propietario?.nombre,
        servicio_descripcion: descripcion,
        total,
        abonado: pagado,
        estado,
        fecha: new Date().toISOString().split('T')[0],
        notas,
        tipo_atencion: 'PARTICULAR',
        zona: 'URBANA',
        _items_json: JSON.stringify(lineas),
      });
      if (factErr) throw factErr;

      // 2. Descontar stock medicamentos
      for (const linea of lineas.filter(l => l.tipo === 'medicamento')) {
        const med = medicamentos.find(m => m.id === linea.id);
        if (!med) continue;
        let stockDescontar = 0;
        if (linea.unidad_medida === 'frasco_completo') {
          stockDescontar = linea.cantidad;
        } else {
          // Descontar fracción proporcional del frasco
          const presentTotal = linea.presentacion_total || parsePresentacion(
            medicamentos.find(m => m.id === linea.id)?.presentacion || ''
          );
          const cantUsada = parseFloat(linea.nombre.match(/\((\d+(?:\.\d+)?)/)?.[1] || '0');
          stockDescontar = Math.ceil(cantUsada / presentTotal);
        }
        if (stockDescontar > 0) {
          await supabase.from('vet_medicamentos')
            .update({ stock: Math.max(0, (med.stock || 0) - stockDescontar) })
            .eq('id', linea.id);
        }
      }

      // 3. Descontar stock insumos (products)
      for (const linea of lineas.filter(l => l.tipo === 'insumo')) {
        const ins = insumos.find(i => i.id === linea.id);
        if (!ins) continue;
        await supabase.from('products')
          .update({ stock_quantity: Math.max(0, ins.stock_quantity - linea.cantidad) })
          .eq('id', linea.id);
      }

      toast.success('Factura generada exitosamente');
      // Reset
      setStep('seleccion');
      setMascotaId('');
      setLineas([]);
      setAmountPaid('');
      setNotas('');
      onFacturaCreada();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Filtros de búsqueda ───────────────────────────────────────────────────
  const mascotasFiltradas = mascotas.filter(m =>
    !searchMascota ||
    m.nombre.toLowerCase().includes(searchMascota.toLowerCase()) ||
    (m.propietario_nombre || '').toLowerCase().includes(searchMascota.toLowerCase())
  );

  const serviciosFiltrados = servicios.filter(s =>
    s.activo && (!searchTerm || s.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const medicamentosFiltrados = medicamentos.filter(m =>
    m.stock > 0 && (!searchTerm || m.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const insumosFiltrados = insumos.filter(i =>
    !searchTerm || i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tipoColor = { servicio: '#8b5cf6', medicamento: '#ef4444', insumo: '#f59e0b' };
  const tipoIcon = { servicio: <Stethoscope size={12}/>, medicamento: <Pill size={12}/>, insumo: <Package size={12}/> };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">

      {/* ── PASO 1: Selección de mascota ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
          <PawPrint size={16} style={{ color: brandColor }}/> Paciente
        </h3>
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            placeholder="Buscar mascota o propietario..."
            value={searchMascota}
            onChange={e => setSearchMascota(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        {mascotaId && mascota ? (
          <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center">
                <PawPrint size={16} className="text-sky-500"/>
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">{mascota.nombre}
                  <span className="text-slate-400 font-normal ml-1">({mascota.especie} · {mascota.raza})</span>
                </p>
                {propietario && <p className="text-xs text-slate-500">👤 {propietario.nombre} · {propietario.telefono}</p>}
              </div>
            </div>
            <button onClick={() => setMascotaId('')} className="text-slate-400 hover:text-red-500">
              <X size={16}/>
            </button>
          </div>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {mascotasFiltradas.slice(0, 8).map(m => {
              const prop = propietarios.find(p => p.id === m.propietario_id);
              return (
                <button key={m.id} onClick={() => { setMascotaId(m.id); setSearchMascota(''); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-left border border-transparent hover:border-slate-200 transition-all">
                  <PawPrint size={14} className="text-slate-400 flex-shrink-0"/>
                  <div>
                    <span className="font-semibold text-sm text-slate-700">{m.nombre}</span>
                    <span className="text-xs text-slate-400 ml-2">{m.especie}</span>
                    {prop && <span className="text-xs text-slate-400 ml-2">· {prop.nombre}</span>}
                  </div>
                </button>
              );
            })}
            {mascotasFiltradas.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-3">No se encontraron mascotas</p>
            )}
          </div>
        )}
      </div>

      {/* ── PASO 2: Agregar items ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {([
            { id: 'servicios', label: 'Servicios', icon: <Stethoscope size={14}/>, color: '#8b5cf6', count: serviciosFiltrados.length },
            { id: 'medicamentos', label: 'Medicamentos', icon: <Pill size={14}/>, color: '#ef4444', count: medicamentosFiltrados.length },
            { id: 'insumos', label: 'Insumos', icon: <Package size={14}/>, color: '#f59e0b', count: insumosFiltrados.length },
          ] as const).map(t => (
            <button key={t.id} onClick={() => { setSeccionActiva(t.id); setSearchTerm(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all border-b-2 ${
                seccionActiva === t.id ? 'border-current' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
              style={seccionActiva === t.id ? { color: t.color, borderColor: t.color } : {}}>
              {t.icon} {t.label}
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: seccionActiva === t.id ? t.color + '20' : '#f1f5f9', color: seccionActiva === t.id ? t.color : '#94a3b8' }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input placeholder={`Buscar ${seccionActiva}...`} value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none"/>
          </div>
        </div>

        {/* Lista items */}
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">

          {seccionActiva === 'servicios' && serviciosFiltrados.map(svc => (
            <button key={svc.id} onClick={() => agregarServicio(svc)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-50 transition-colors text-left">
              <div>
                <p className="font-semibold text-sm text-slate-700">{svc.nombre}</p>
                {svc.descripcion && <p className="text-xs text-slate-400 truncate max-w-xs">{svc.descripcion}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-bold text-purple-600 text-sm">{fmtCurrency(svc.precio)}</span>
                <Plus size={16} className="text-purple-400"/>
              </div>
            </button>
          ))}

          {seccionActiva === 'medicamentos' && medicamentosFiltrados.map(med => (
            <button key={med.id} onClick={() => { setModalMed({ med }); setCantidadMed(''); setUnidadMed('unidad'); }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-50 transition-colors text-left">
              <div>
                <p className="font-semibold text-sm text-slate-700">{med.nombre}</p>
                <p className="text-xs text-slate-400">{med.tipo} · {med.presentacion} · Stock: {med.stock}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-bold text-red-500 text-sm">{fmtCurrency(med.precio)}</span>
                <Plus size={16} className="text-red-400"/>
              </div>
            </button>
          ))}

          {seccionActiva === 'insumos' && insumosFiltrados.map(ins => (
            <button key={ins.id} onClick={() => agregarInsumo(ins)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50 transition-colors text-left">
              <div>
                <p className="font-semibold text-sm text-slate-700">{ins.name}</p>
                <p className="text-xs text-slate-400">{ins.category} · Stock: {ins.stock_quantity}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-bold text-amber-600 text-sm">{fmtCurrency(ins.price)}</span>
                <Plus size={16} className="text-amber-400"/>
              </div>
            </button>
          ))}

          {((seccionActiva === 'servicios' && serviciosFiltrados.length === 0) ||
            (seccionActiva === 'medicamentos' && medicamentosFiltrados.length === 0) ||
            (seccionActiva === 'insumos' && insumosFiltrados.length === 0)) && (
            <div className="py-8 text-center text-slate-400 text-sm">
              {searchTerm ? 'Sin resultados' : `No hay ${seccionActiva} disponibles`}
            </div>
          )}
        </div>
      </div>

      {/* ── RESUMEN FACTURA ───────────────────────────────────────────────── */}
      {lineas.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <Receipt size={16} style={{ color: brandColor }}/> Factura
            </h3>
            <span className="text-xs text-slate-400">{lineas.length} ítem(s)</span>
          </div>
          <div className="divide-y divide-slate-50">
            {lineas.map((l, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]"
                  style={{ background: tipoColor[l.tipo] }}>
                  {tipoIcon[l.tipo]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{l.nombre}</p>
                  <p className="text-xs text-slate-400">{fmtCurrency(l.precio_unitario)} c/u</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => cambiarCantidad(idx, -1)}
                    className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 text-sm font-bold">−</button>
                  <span className="w-6 text-center text-sm font-bold text-slate-700">{l.cantidad}</span>
                  <button onClick={() => cambiarCantidad(idx, 1)}
                    className="w-6 h-6 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 text-sm font-bold">+</button>
                  <span className="w-20 text-right font-bold text-slate-800 text-sm">{fmtCurrency(l.total)}</span>
                  <button onClick={() => eliminarLinea(idx)} className="text-slate-300 hover:text-red-500">
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totales y pago */}
          <div className="px-5 py-4 border-t border-slate-100 space-y-3 bg-slate-50">
            <div className="flex justify-between font-bold text-lg text-slate-800">
              <span>TOTAL</span>
              <span style={{ color: brandColor }}>{fmtCurrency(total)}</span>
            </div>

            {/* Notas */}
            <textarea
              placeholder="Notas de la consulta (opcional)..."
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
            />

            {/* Pago */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Monto recibido</label>
                <input
                  type="number"
                  placeholder="0"
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <div className="space-y-1">
                {cambio > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-green-600 font-medium">Cambio</p>
                    <p className="font-bold text-green-700">{fmtCurrency(cambio)}</p>
                  </div>
                )}
                {saldo > 0 && pagado > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-amber-600 font-medium">Saldo pendiente</p>
                    <p className="font-bold text-amber-700">{fmtCurrency(saldo)}</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={confirmarPago}
              disabled={saving || !mascotaId}
              className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${brandColor}, #6366f1)` }}>
              {saving ? '⏳ Guardando...' : <><CheckCircle size={16}/> Confirmar y Generar Factura</>}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL CANTIDAD MEDICAMENTO ────────────────────────────────────── */}
      {modalMed && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Agregar Medicamento</h3>
                <p className="text-xs text-slate-500 mt-0.5">{modalMed.med.nombre}</p>
              </div>
              <button onClick={() => setModalMed(null)} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Info del medicamento */}
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Presentación:</span><span className="font-semibold">{modalMed.med.presentacion}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Stock disponible:</span><span className="font-semibold text-green-600">{modalMed.med.stock} {modalMed.med.tipo === 'Vacuna' ? 'dosis' : 'unidades'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Precio frasco:</span><span className="font-bold text-red-600">{fmtCurrency(modalMed.med.precio)}</span></div>
              </div>

              {/* Tipo de uso */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-2 block">¿Cómo se usa?</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'frasco_completo', label: 'Frasco completo', desc: 'Se usa/vende todo' },
                    { value: 'ml', label: 'Por ml', desc: 'Fracción en ml' },
                    { value: 'mg', label: 'Por mg', desc: 'Fracción en mg' },
                    { value: 'tabletas', label: 'Tabletas', desc: 'Unidades del blíster' },
                    { value: 'unidad', label: 'Por unidad', desc: 'Piezas individuales' },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => setUnidadMed(opt.value as any)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        unidadMed === opt.value
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}>
                      <p className="text-xs font-bold">{opt.label}</p>
                      <p className="text-[10px] text-slate-400">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cantidad */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">
                  Cantidad {unidadMed !== 'frasco_completo' ? `(${unidadMed})` : ''}
                </label>
                <input
                  type="number"
                  placeholder={unidadMed === 'frasco_completo' ? 'Ej: 1' : 'Ej: 5'}
                  value={cantidadMed}
                  onChange={e => setCantidadMed(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  autoFocus
                />
              </div>

              {/* Preview precio */}
              {cantidadMed && parseFloat(cantidadMed) > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 text-sm">
                  {unidadMed === 'frasco_completo' ? (
                    <div className="flex justify-between font-bold">
                      <span>Total a cobrar:</span>
                      <span className="text-red-600">{fmtCurrency(modalMed.med.precio * parseFloat(cantidadMed))}</span>
                    </div>
                  ) : (
                    <>
                      {(() => {
                        const presentTotal = parsePresentacion(modalMed.med.presentacion);
                        const precioUnit = modalMed.med.precio_unitario && modalMed.med.precio_unitario > 0
                          ? modalMed.med.precio_unitario
                          : Math.round(modalMed.med.precio / (presentTotal || 1));
                        const totalCobrar = Math.round(precioUnit * parseFloat(cantidadMed));
                        return (
                          <>
                            <div className="flex justify-between text-slate-500 text-xs mb-1">
                              <span>Precio por {unidadMed}:</span>
                              <span>{fmtCurrency(precioUnit)}</span>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span>Total a cobrar:</span>
                              <span className="text-red-600">{fmtCurrency(totalCobrar)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setModalMed(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={confirmarMedicamento}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold"
                style={{ background: '#ef4444' }}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VetFacturacionClinica;