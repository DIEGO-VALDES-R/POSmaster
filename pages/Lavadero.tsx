import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, X, Eye, DollarSign, User, CheckCircle,
  Clock, XCircle, RefreshCw, Tag, Users, Calendar,
  BarChart2, Droplets, Car, Truck, Bike, ShoppingCart,
  Edit2, Trash2, AlertCircle, Timer, ArrowRight, Zap, Printer
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type OrdenEstado = 'ESPERANDO' | 'EN_PROCESO' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';

interface ServicioLavado {
  id: string;
  company_id: string;
  nombre: string;
  categoria: string;
  tipo_vehiculo: string;
  precio: number;
  duracion_min: number;
  descripcion: string;
  is_active: boolean;
}

interface Lavador {
  id: string;
  company_id: string;
  nombre: string;
  is_active: boolean;
}

interface OrdenLavado {
  id: string;
  company_id: string;
  branch_id?: string;
  cliente_nombre: string;
  cliente_telefono?: string;
  placa?: string;
  tipo_vehiculo: string;
  color_vehiculo?: string;
  marca_vehiculo?: string;
  servicio_id: string;
  servicio_nombre: string;
  servicio_precio: number;
  lavador_id?: string;
  lavador_nombre?: string;
  estado: OrdenEstado;
  notas?: string;
  created_at: string;
  iniciado_at?: string;
  terminado_at?: string;
  invoice_id?: string;
}

// ── Catálogo por defecto ───────────────────────────────────────────────────────
const CATALOGO_DEFAULT: Omit<ServicioLavado, 'id' | 'company_id' | 'is_active'>[] = [
  // MOTOS
  { nombre: 'Lavado Sencillo',        categoria: 'basico',    tipo_vehiculo: 'moto',      precio: 12000,  duracion_min: 20, descripcion: 'Lavado exterior, llantas y cadena' },
  { nombre: 'Lavado Completo',         categoria: 'completo',  tipo_vehiculo: 'moto',      precio: 18000,  duracion_min: 30, descripcion: 'Lavado exterior + limpieza motor + brillado plásticos' },
  { nombre: 'Lavado + Encerado',       categoria: 'premium',   tipo_vehiculo: 'moto',      precio: 25000,  duracion_min: 45, descripcion: 'Lavado completo + cera de carnauba' },
  { nombre: 'Detailing Moto',          categoria: 'detailing', tipo_vehiculo: 'moto',      precio: 60000,  duracion_min: 90, descripcion: 'Desengrase profundo, pulida de plásticos, brillado total' },

  // CARROS
  { nombre: 'Lavado Sencillo',        categoria: 'basico',    tipo_vehiculo: 'carro',     precio: 18000,  duracion_min: 25, descripcion: 'Lavado exterior, vidrios y llantas' },
  { nombre: 'Lavado Completo',         categoria: 'completo',  tipo_vehiculo: 'carro',     precio: 28000,  duracion_min: 40, descripcion: 'Exterior + aspirado interior + limpieza tablero' },
  { nombre: 'Lavado + Encerado',       categoria: 'premium',   tipo_vehiculo: 'carro',     precio: 42000,  duracion_min: 60, descripcion: 'Lavado completo + cera + brillo llantas' },
  { nombre: 'Lavado + Polichado',      categoria: 'premium',   tipo_vehiculo: 'carro',     precio: 120000, duracion_min: 120, descripcion: 'Lavado + pulida con máquina + cera profesional' },
  { nombre: 'Lavado Tapicería',        categoria: 'interior',  tipo_vehiculo: 'carro',     precio: 80000,  duracion_min: 180, descripcion: 'Lavado profundo asientos y alfombras a vapor' },
  { nombre: 'Detailing Completo',      categoria: 'detailing', tipo_vehiculo: 'carro',     precio: 250000, duracion_min: 240, descripcion: 'Detailing interior + exterior, ceramizado, ozono' },
  { nombre: 'Lavado a Vapor',          categoria: 'especial',  tipo_vehiculo: 'carro',     precio: 55000,  duracion_min: 60, descripcion: 'Lavado ecológico a vapor, interior y exterior' },
  { nombre: 'Descontaminación Pintura',categoria: 'especial',  tipo_vehiculo: 'carro',     precio: 90000,  duracion_min: 120, descripcion: 'Claybar + descontaminante + sellante de pintura' },

  // CAMIONETAS / SUV
  { nombre: 'Lavado Sencillo',        categoria: 'basico',    tipo_vehiculo: 'camioneta',  precio: 25000,  duracion_min: 30, descripcion: 'Lavado exterior, vidrios y llantas' },
  { nombre: 'Lavado Completo',         categoria: 'completo',  tipo_vehiculo: 'camioneta',  precio: 38000,  duracion_min: 50, descripcion: 'Exterior + aspirado + limpieza tablero' },
  { nombre: 'Lavado + Encerado',       categoria: 'premium',   tipo_vehiculo: 'camioneta',  precio: 53000,  duracion_min: 75, descripcion: 'Lavado completo + cera + brillo llantas' },
  { nombre: 'Lavado + Polichado',      categoria: 'premium',   tipo_vehiculo: 'camioneta',  precio: 140000, duracion_min: 150, descripcion: 'Lavado + pulida máquina + cera profesional' },
  { nombre: 'Detailing Completo',      categoria: 'detailing', tipo_vehiculo: 'camioneta',  precio: 350000, duracion_min: 300, descripcion: 'Detailing interior + exterior profesional' },

  // BUS / BUSETA / VAN
  { nombre: 'Lavado Sencillo',        categoria: 'basico',    tipo_vehiculo: 'bus',        precio: 40000,  duracion_min: 45, descripcion: 'Lavado exterior completo' },
  { nombre: 'Lavado Completo',         categoria: 'completo',  tipo_vehiculo: 'bus',        precio: 65000,  duracion_min: 75, descripcion: 'Exterior + interior básico' },
  { nombre: 'Lavado Completo Premium', categoria: 'premium',   tipo_vehiculo: 'bus',        precio: 100000, duracion_min: 120, descripcion: 'Exterior + interior profundo + desinfección' },
];

const TIPO_VEHICULO_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; emoji: string }> = {
  moto:      { label: 'Moto',       icon: <Bike size={16}/>,  color: '#f59e0b', emoji: '🏍️' },
  carro:     { label: 'Carro',      icon: <Car size={16}/>,   color: '#3b82f6', emoji: '🚗' },
  camioneta: { label: 'Camioneta',  icon: <Truck size={16}/>, color: '#10b981', emoji: '🛻' },
  bus:       { label: 'Bus / Van',  icon: <Truck size={16}/>, color: '#8b5cf6', emoji: '🚌' },
};

const ESTADO_CONFIG: Record<OrdenEstado, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ESPERANDO:  { label: 'Esperando',   color: '#f59e0b', bg: '#fffbeb', icon: <Clock size={12}/> },
  EN_PROCESO: { label: 'En proceso',  color: '#3b82f6', bg: '#eff6ff', icon: <Droplets size={12}/> },
  LISTO:      { label: 'Listo',       color: '#10b981', bg: '#f0fdf4', icon: <CheckCircle size={12}/> },
  ENTREGADO:  { label: 'Entregado',   color: '#6b7280', bg: '#f9fafb', icon: <Car size={12}/> },
  CANCELADO:  { label: 'Cancelado',   color: '#ef4444', bg: '#fef2f2', icon: <XCircle size={12}/> },
};

const CATEGORIA_CONFIG: Record<string, { label: string; color: string }> = {
  basico:    { label: 'Básico',       color: '#64748b' },
  completo:  { label: 'Completo',     color: '#3b82f6' },
  premium:   { label: 'Premium',      color: '#f59e0b' },
  interior:  { label: 'Interior',     color: '#8b5cf6' },
  detailing: { label: 'Detailing',    color: '#ec4899' },
  especial:  { label: 'Especial',     color: '#10b981' },
};

const TABS = [
  { id: 'panel',     label: 'Panel',      icon: <BarChart2 size={15}/> },
  { id: 'catalogo',  label: 'Catálogo',   icon: <Tag size={15}/> },
  { id: 'lavadores', label: 'Lavadores',  icon: <Users size={15}/> },
  { id: 'historial', label: 'Historial',  icon: <Calendar size={15}/> },
] as const;
type TabId = typeof TABS[number]['id'];

const elapsed = (from: string) => {
  const diff = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}min`;
};

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
const Lavadero: React.FC = () => {
  const { companyId, branchId, session } = useDatabase();
  const { formatMoney } = useCurrency();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabId>('panel');
  const [ordenes, setOrdenes] = useState<OrdenLavado[]>([]);
  const [servicios, setServicios] = useState<ServicioLavado[]>([]);
  const [lavadores, setLavadores] = useState<Lavador[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [tick, setTick] = useState(0);

  // Modales
  const [showNuevaOrden, setShowNuevaOrden] = useState(false);
  const [showNuevoServicio, setShowNuevoServicio] = useState(false);
  const [showNuevoLavador, setShowNuevoLavador] = useState(false);
  const [editingServicio, setEditingServicio] = useState<ServicioLavado | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal cobro
  const [showCobro, setShowCobro] = useState<OrdenLavado | null>(null);
  const [metodoCobro, setMetodoCobro] = useState('EFECTIVO');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');

  // Form nueva orden
  const [formOrden, setFormOrden] = useState({
    cliente_nombre: '', cliente_telefono: '', placa: '',
    tipo_vehiculo: 'carro', color_vehiculo: '', marca_vehiculo: '',
    servicio_id: '', lavador_id: '', notas: '',
  });

  // Form servicio
  const [formServicio, setFormServicio] = useState({
    nombre: '', categoria: 'basico', tipo_vehiculo: 'carro',
    precio: '', duracion_min: '30', descripcion: '',
  });

  // Form lavador
  const [formLavador, setFormLavador] = useState({ nombre: '' });

  // Ticker para tiempos en vivo
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // ── Cargar datos ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [{ data: ords }, { data: svcs }, { data: lavs }] = await Promise.all([
        supabase.from('lavadero_ordenes').select('*').eq('company_id', companyId)
          .not('estado', 'in', '("ENTREGADO","CANCELADO")')
          .order('created_at', { ascending: false }),
        supabase.from('lavadero_servicios').select('*').eq('company_id', companyId)
          .eq('is_active', true).order('tipo_vehiculo').order('precio'),
        supabase.from('lavadero_lavadores').select('*').eq('company_id', companyId)
          .eq('is_active', true),
      ]);
      setOrdenes(ords || []);
      setServicios(svcs || []);
      setLavadores(lavs || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const loadHistorial = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from('lavadero_ordenes').select('*')
      .eq('company_id', companyId)
      .in('estado', ['ENTREGADO', 'CANCELADO'])
      .order('created_at', { ascending: false })
      .limit(100);
    return data || [];
  }, [companyId]);

  const [historial, setHistorial] = useState<OrdenLavado[]>([]);
  useEffect(() => {
    if (tab === 'historial') loadHistorial().then(d => setHistorial(d || []));
  }, [tab, loadHistorial]);

  useEffect(() => { load(); }, [load]);

  // ── Importar catálogo por defecto ────────────────────────────────────────────
  const importarCatalogo = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const payload = CATALOGO_DEFAULT.map(s => ({
        ...s, company_id: companyId, is_active: true,
      }));
      const { error } = await supabase.from('lavadero_servicios').insert(payload);
      if (error) throw error;
      toast.success(`✅ ${payload.length} servicios importados correctamente`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Nueva orden ──────────────────────────────────────────────────────────────
  const handleNuevaOrden = async () => {
    if (!formOrden.cliente_nombre.trim()) { toast.error('Nombre del cliente requerido'); return; }
    if (!formOrden.servicio_id) { toast.error('Selecciona un servicio'); return; }
    const svc = servicios.find(s => s.id === formOrden.servicio_id);
    if (!svc) return;
    const lav = lavadores.find(l => l.id === formOrden.lavador_id);
    setSaving(true);
    try {
      const { error } = await supabase.from('lavadero_ordenes').insert({
        company_id:       companyId,
        branch_id:        branchId || null,
        cliente_nombre:   formOrden.cliente_nombre.trim(),
        cliente_telefono: formOrden.cliente_telefono || null,
        placa:            formOrden.placa?.toUpperCase() || null,
        tipo_vehiculo:    formOrden.tipo_vehiculo,
        color_vehiculo:   formOrden.color_vehiculo || null,
        marca_vehiculo:   formOrden.marca_vehiculo || null,
        servicio_id:      svc.id,
        servicio_nombre:  svc.nombre,
        servicio_precio:  svc.precio,
        lavador_id:       lav?.id || null,
        lavador_nombre:   lav?.nombre || null,
        estado:           lav ? 'EN_PROCESO' : 'ESPERANDO',
        notas:            formOrden.notas || null,
        iniciado_at:      lav ? new Date().toISOString() : null,
      });
      if (error) throw error;
      toast.success('✅ Orden creada — imprimiendo ticket...');
      setShowNuevaOrden(false);
      setFormOrden({ cliente_nombre: '', cliente_telefono: '', placa: '', tipo_vehiculo: 'carro', color_vehiculo: '', marca_vehiculo: '', servicio_id: '', lavador_id: '', notas: '' });
      await load();
      // Imprimir ticket de la orden recién creada
      const { data: nuevaOrden } = await supabase.from('lavadero_ordenes').select('*')
        .eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).single();
      if (nuevaOrden) imprimirTicketOrden(nuevaOrden as OrdenLavado);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Cambiar estado de orden ───────────────────────────────────────────────────
  const cambiarEstado = async (orden: OrdenLavado, nuevoEstado: OrdenEstado) => {
    const update: Record<string, any> = { estado: nuevoEstado };
    if (nuevoEstado === 'EN_PROCESO') update.iniciado_at = new Date().toISOString();
    if (nuevoEstado === 'LISTO') update.terminado_at = new Date().toISOString();
    const { error } = await supabase.from('lavadero_ordenes').update(update).eq('id', orden.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado → ${ESTADO_CONFIG[nuevoEstado].label}`);
    await load();
  };

  // ── Abrir modal de cobro ─────────────────────────────────────────────────────
  const cobrarOrden = (orden: OrdenLavado) => {
    setShowCobro(orden);
    setMetodoCobro('EFECTIVO');
    setEfectivoRecibido('');
  };

  // ── Confirmar cobro y generar factura ─────────────────────────────────────────
  const confirmarCobro = async () => {
    if (!showCobro) return;
    const orden = showCobro;
    const monto = orden.servicio_precio;

    if (metodoCobro === 'EFECTIVO') {
      const recibido = parseFloat(efectivoRecibido);
      if (!recibido || recibido < monto) {
        toast.error(`El efectivo recibido debe ser al menos ${formatMoney(monto)}`);
        return;
      }
    }

    setSaving(true);
    try {
      // Generar número de factura correlativo
      const { data: lastInv } = await supabase.from('invoices').select('invoice_number')
        .eq('company_id', companyId!).order('created_at', { ascending: false }).limit(1);
      const lastNum = lastInv?.[0]?.invoice_number || 'FAC-0000';
      const match = lastNum.match(/(\d+)$/);
      const nextNum = match ? parseInt(match[1]) + 1 : 1;
      const prefix = lastNum.replace(/\d+$/, '');
      const invNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;

      const recibido = metodoCobro === 'EFECTIVO' ? parseFloat(efectivoRecibido) : monto;
      const vuelto  = metodoCobro === 'EFECTIVO' ? recibido - monto : 0;

      // Insertar factura
      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        company_id:      companyId,
        branch_id:       branchId || null,
        session_id:      session?.id || null,
        invoice_number:  invNumber,
        customer_name:   orden.cliente_nombre,
        subtotal:        monto,
        tax_amount:      0,
        discount_amount: 0,
        total_amount:    monto,
        amount_paid:     recibido,
        balance_due:     0,
        payment_method:  {
          method:   metodoCobro,
          amount:   monto,
          received: recibido,
          change:   vuelto,
        },
        payment_status:  'PAID',
        status:          'COMPLETED',
        document_type:   'VENTA',
        business_type:   'lavadero',
        notes: [
          `Lavadero — ${orden.servicio_nombre}`,
          `Vehículo: ${TIPO_VEHICULO_CONFIG[orden.tipo_vehiculo]?.label}${orden.marca_vehiculo ? ' ' + orden.marca_vehiculo : ''}${orden.color_vehiculo ? ' ' + orden.color_vehiculo : ''}`,
          orden.placa ? `Placa: ${orden.placa}` : '',
          orden.lavador_nombre ? `Lavador: ${orden.lavador_nombre}` : '',
        ].filter(Boolean).join(' | '),
        reference_id: orden.id,
      }).select('id').single();
      if (invErr) throw invErr;

      // Insertar item en invoice_items
      const itemDesc = [
        orden.servicio_nombre,
        `${TIPO_VEHICULO_CONFIG[orden.tipo_vehiculo]?.label}${orden.marca_vehiculo ? ' ' + orden.marca_vehiculo : ''}${orden.color_vehiculo ? ' ' + orden.color_vehiculo : ''}`,
        orden.placa ? `Placa: ${orden.placa}` : '',
      ].filter(Boolean).join(' | ');

      await supabase.from('invoice_items').insert({
        invoice_id:    inv.id,
        product_id:    null,   // servicios de lavadero no están en products
        quantity:      1,
        price:         monto,
        tax_rate:      0,
        discount:      0,
        description:   itemDesc,
        serial_number: orden.placa || orden.servicio_nombre,
      });

      // Marcar orden entregada
      await supabase.from('lavadero_ordenes').update({
        estado:       'ENTREGADO',
        invoice_id:   inv.id,
        terminado_at: orden.terminado_at || new Date().toISOString(),
      }).eq('id', orden.id);

      // Registrar en caja según método de pago
      if (session?.id) {
        const cajaUpdate: Record<string, number> = {};
        if (metodoCobro === 'EFECTIVO')
          cajaUpdate.total_sales_cash = (session.total_sales_cash || 0) + monto;
        else if (metodoCobro === 'TARJETA')
          cajaUpdate.total_sales_card = (session.total_sales_card || 0) + monto;
        else
          cajaUpdate.total_sales_transfer = (session.total_sales_transfer || 0) + monto;
        await supabase.from('cash_register_sessions').update(cajaUpdate).eq('id', session.id);
      }

      const vueltoMsg = vuelto > 0 ? ` · Vuelto: ${formatMoney(vuelto)}` : '';
      toast.success(`✅ Cobrado ${formatMoney(monto)} (${metodoCobro})${vueltoMsg}`);
      setShowCobro(null);

      // Imprimir ticket de cobro automáticamente
      imprimirTicketCobro(orden, inv.id, invNumber, metodoCobro, recibido, vuelto);

      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Imprimir ticket de orden nueva (con código de barras JsBarcode) ───────────
  const imprimirTicketOrden = (orden: OrdenLavado) => {
    const tipo = TIPO_VEHICULO_CONFIG[orden.tipo_vehiculo];
    const codigo = orden.placa || orden.id.slice(-8).toUpperCase();
    const html = `<!DOCTYPE html><html><head>
    <title>Ticket Lavadero</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:monospace;width:80mm;padding:4mm;font-size:11px}
      h1{text-align:center;font-size:15px;font-weight:900;letter-spacing:2px;margin-bottom:2mm}
      .sub{text-align:center;font-size:10px;color:#555;margin-bottom:3mm}
      .sep{border-top:1px dashed #999;margin:3mm 0}
      .row{display:flex;justify-content:space-between;margin:1.5mm 0}
      .label{color:#666}.val{font-weight:700}
      .total{font-size:16px;font-weight:900;text-align:center;margin:3mm 0}
      .estado{text-align:center;background:#000;color:#fff;padding:2mm;font-weight:900;font-size:13px;letter-spacing:1px;margin:3mm 0}
      svg{display:block;margin:0 auto}
      .footer{text-align:center;font-size:9px;color:#888;margin-top:4mm}
    </style></head><body>
    <h1>🚿 LAVADERO</h1>
    <div class="sub">Ticket de servicio</div>
    <div class="sep"></div>
    <div class="row"><span class="label">Cliente:</span><span class="val">${orden.cliente_nombre}</span></div>
    ${orden.cliente_telefono ? `<div class="row"><span class="label">Tel:</span><span class="val">${orden.cliente_telefono}</span></div>` : ''}
    <div class="sep"></div>
    <div class="row"><span class="label">Vehículo:</span><span class="val">${tipo?.emoji} ${tipo?.label}${orden.marca_vehiculo ? ' ' + orden.marca_vehiculo : ''}${orden.color_vehiculo ? ' ' + orden.color_vehiculo : ''}</span></div>
    ${orden.placa ? `<div class="row"><span class="label">Placa:</span><span class="val" style="font-size:16px;letter-spacing:2px">${orden.placa}</span></div>` : ''}
    <div class="sep"></div>
    <div class="row"><span class="label">Servicio:</span><span class="val">${orden.servicio_nombre}</span></div>
    ${orden.lavador_nombre ? `<div class="row"><span class="label">Lavador:</span><span class="val">${orden.lavador_nombre}</span></div>` : ''}
    <div class="row"><span class="label">Hora entrada:</span><span class="val">${new Date(orden.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span></div>
    <div class="sep"></div>
    <div class="total">$ ${orden.servicio_precio.toLocaleString('es-CO')}</div>
    <div class="estado">EN PROCESO</div>
    <svg id="barcode"></svg>
    <div class="footer">Conserve este ticket para reclamar su vehículo<br>#${orden.id.slice(-8).toUpperCase()}</div>
    <script>
      JsBarcode("#barcode","${codigo}",{format:"CODE128",width:2,height:50,displayValue:true,fontSize:12});
      window.onload=()=>{setTimeout(()=>window.print(),400)};
    <\/script>
    </body></html>`;
    const w = window.open('','_blank','width=400,height=600');
    w?.document.write(html);
    w?.document.close();
  };

  // ── Imprimir ticket de cobro / factura simplificada ────────────────────────
  const imprimirTicketCobro = (
    orden: OrdenLavado,
    invoiceId: string,
    invNumber: string,
    metodo: string,
    recibido: number,
    vuelto: number
  ) => {
    const tipo = TIPO_VEHICULO_CONFIG[orden.tipo_vehiculo];
    const html = `<!DOCTYPE html><html><head>
    <title>Factura Lavadero</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:monospace;width:80mm;padding:4mm;font-size:11px}
      h1{text-align:center;font-size:13px;font-weight:900;margin-bottom:1mm}
      .sub{text-align:center;font-size:9px;color:#555;margin-bottom:3mm}
      .sep{border-top:1px dashed #999;margin:3mm 0}
      .row{display:flex;justify-content:space-between;margin:1.5mm 0}
      .label{color:#555}.val{font-weight:700}
      .total{font-size:18px;font-weight:900;text-align:right;padding:2mm 0;border-top:2px solid #000;border-bottom:2px solid #000;margin:3mm 0}
      .gracias{text-align:center;font-weight:900;font-size:12px;margin:4mm 0}
      .footer{text-align:center;font-size:9px;color:#888;margin-top:2mm}
    </style></head><body>
    <h1>🚿 LAVADERO DE VEHÍCULOS</h1>
    <div class="sub">${invNumber} · ${new Date().toLocaleDateString('es-CO')} ${new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</div>
    <div class="sep"></div>
    <div class="row"><span class="label">Cliente:</span><span class="val">${orden.cliente_nombre}</span></div>
    ${orden.placa ? `<div class="row"><span class="label">Placa:</span><span class="val">${orden.placa}</span></div>` : ''}
    <div class="row"><span class="label">Vehículo:</span><span class="val">${tipo?.emoji} ${tipo?.label}${orden.marca_vehiculo ? ' '+orden.marca_vehiculo : ''}</span></div>
    <div class="sep"></div>
    <div class="row"><span class="label">1x ${orden.servicio_nombre}</span><span class="val">$ ${orden.servicio_precio.toLocaleString('es-CO')}</span></div>
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>$ ${orden.servicio_precio.toLocaleString('es-CO')}</span></div>
    <div class="row"><span>IVA</span><span>No aplica</span></div>
    <div class="total"><span>TOTAL $ ${orden.servicio_precio.toLocaleString('es-CO')}</span></div>
    <div class="row"><span class="label">Método:</span><span class="val">${metodo}</span></div>
    ${metodo==='EFECTIVO' ? `
    <div class="row"><span class="label">Recibido:</span><span class="val">$ ${recibido.toLocaleString('es-CO')}</span></div>
    <div class="row" style="font-size:14px"><span class="label">Vuelto:</span><span class="val">$ ${vuelto.toLocaleString('es-CO')}</span></div>
    ` : ''}
    <div class="gracias">¡GRACIAS POR SU VISITA!</div>
    <div class="footer">Ref: ${orden.id.slice(-8).toUpperCase()}</div>
    <script>window.onload=()=>{setTimeout(()=>window.print(),400)}<\/script>
    </body></html>`;
    const w = window.open('','_blank','width=400,height=600');
    w?.document.write(html);
    w?.document.close();
  };

  // ── Guardar servicio ──────────────────────────────────────────────────────────
  const handleGuardarServicio = async () => {
    if (!formServicio.nombre.trim() || !formServicio.precio) {
      toast.error('Nombre y precio requeridos'); return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id:    companyId,
        nombre:        formServicio.nombre.trim(),
        categoria:     formServicio.categoria,
        tipo_vehiculo: formServicio.tipo_vehiculo,
        precio:        parseFloat(formServicio.precio),
        duracion_min:  parseInt(formServicio.duracion_min) || 30,
        descripcion:   formServicio.descripcion,
        is_active:     true,
      };
      if (editingServicio) {
        const { error } = await supabase.from('lavadero_servicios').update(payload).eq('id', editingServicio.id);
        if (error) throw error;
        toast.success('Servicio actualizado');
      } else {
        const { error } = await supabase.from('lavadero_servicios').insert(payload);
        if (error) throw error;
        toast.success('Servicio creado');
      }
      setShowNuevoServicio(false);
      setEditingServicio(null);
      setFormServicio({ nombre: '', categoria: 'basico', tipo_vehiculo: 'carro', precio: '', duracion_min: '30', descripcion: '' });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Guardar lavador ───────────────────────────────────────────────────────────
  const handleGuardarLavador = async () => {
    if (!formLavador.nombre.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('lavadero_lavadores').insert({
        company_id: companyId, nombre: formLavador.nombre.trim(), is_active: true,
      });
      if (error) throw error;
      toast.success('Lavador agregado');
      setShowNuevoLavador(false);
      setFormLavador({ nombre: '' });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = {
    esperando:  ordenes.filter(o => o.estado === 'ESPERANDO').length,
    enProceso:  ordenes.filter(o => o.estado === 'EN_PROCESO').length,
    listos:     ordenes.filter(o => o.estado === 'LISTO').length,
    ingresoHoy: historial.filter(o => o.created_at?.startsWith(new Date().toISOString().split('T')[0]))
                  .reduce((s, o) => s + o.servicio_precio, 0),
  };

  // Servicios filtrados para la orden nueva
  const serviciosFiltrados = servicios.filter(s =>
    s.tipo_vehiculo === formOrden.tipo_vehiculo
  );

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Droplets size={24} className="text-blue-500"/> Lavadero de Vehículos
          </h2>
          <p className="text-slate-500 text-sm">Gestión de órdenes, servicios y facturación automática</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500">
            <RefreshCw size={16}/>
          </button>
          <button onClick={() => setShowNuevaOrden(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">
            <Plus size={16}/> Nueva Orden
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'En espera',   value: stats.esperando,            color: '#f59e0b', icon: <Clock size={20}/> },
          { label: 'En proceso',  value: stats.enProceso,            color: '#3b82f6', icon: <Droplets size={20}/> },
          { label: 'Listos',      value: stats.listos,               color: '#10b981', icon: <CheckCircle size={20}/> },
          { label: 'Ingreso hoy', value: formatMoney(stats.ingresoHoy), color: '#8b5cf6', icon: <DollarSign size={20}/> },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: s.color + '18', color: s.color }}>
              {s.icon}
            </div>
            <div>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-xl font-bold text-slate-800">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── PANEL OPERATIVO ─────────────────────────────────────────────────── */}
      {tab === 'panel' && (
        <div>
          {/* Filtro tipo vehículo */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {[{ k: 'todos', label: 'Todos', emoji: '🚘' }, ...Object.entries(TIPO_VEHICULO_CONFIG).map(([k, v]) => ({ k, label: v.label, emoji: v.emoji }))].map(t => (
              <button key={t.k} onClick={() => setFiltroTipo(t.k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                  filtroTipo === t.k ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="bg-white rounded-xl p-12 text-center text-slate-400 border border-slate-100">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2"/>
              Cargando órdenes...
            </div>
          ) : ordenes.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center text-slate-400 border border-slate-100">
              <Droplets size={40} className="mx-auto mb-3 opacity-30"/>
              <p className="font-semibold">No hay órdenes activas</p>
              <p className="text-sm mt-1">Crea una nueva orden con el botón "Nueva Orden"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {ordenes
                .filter(o => filtroTipo === 'todos' || o.tipo_vehiculo === filtroTipo)
                .map(orden => {
                  const est = ESTADO_CONFIG[orden.estado];
                  const tipo = TIPO_VEHICULO_CONFIG[orden.tipo_vehiculo];
                  return (
                    <div key={orden.id}
                      className="bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                      style={{ borderColor: est.color + '40', borderLeftWidth: 4, borderLeftColor: est.color }}>

                      {/* Header tarjeta */}
                      <div className="px-4 py-3 flex items-center justify-between"
                        style={{ background: est.bg }}>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tipo?.emoji}</span>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{orden.cliente_nombre}</p>
                            {orden.placa && (
                              <span className="text-xs font-mono bg-slate-800 text-white px-1.5 py-0.5 rounded">
                                {orden.placa}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border"
                          style={{ color: est.color, borderColor: est.color + '40', background: 'white' }}>
                          {est.icon} {est.label}
                        </span>
                      </div>

                      {/* Body */}
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-700 text-sm">{orden.servicio_nombre}</p>
                            <p className="text-xs text-slate-400">{tipo?.label}{orden.marca_vehiculo ? ` · ${orden.marca_vehiculo}` : ''}{orden.color_vehiculo ? ` · ${orden.color_vehiculo}` : ''}</p>
                          </div>
                          <p className="font-extrabold text-blue-600 text-base">{formatMoney(orden.servicio_precio)}</p>
                        </div>

                        {orden.lavador_nombre && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <User size={11}/> {orden.lavador_nombre}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Timer size={11}/>
                            {orden.estado === 'EN_PROCESO' && orden.iniciado_at
                              ? `En proceso: ${elapsed(orden.iniciado_at)}`
                              : orden.estado === 'ESPERANDO'
                              ? `Esperando: ${elapsed(orden.created_at)}`
                              : orden.estado === 'LISTO' && orden.terminado_at
                              ? `Listo hace: ${elapsed(orden.terminado_at)}`
                              : elapsed(orden.created_at)
                            }
                          </span>
                          <span className="font-mono">#{orden.id.slice(-5).toUpperCase()}</span>
                        </div>
                      </div>

                      {/* Acciones */}
                      <div className="px-4 pb-3 flex gap-2">
                        {orden.estado === 'ESPERANDO' && (
                          <button onClick={() => cambiarEstado(orden, 'EN_PROCESO')}
                            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center justify-center gap-1">
                            <Droplets size={13}/> Iniciar lavado
                          </button>
                        )}
                        {orden.estado === 'EN_PROCESO' && (
                          <button onClick={() => cambiarEstado(orden, 'LISTO')}
                            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 flex items-center justify-center gap-1">
                            <CheckCircle size={13}/> Marcar listo
                          </button>
                        )}
                        {orden.estado === 'LISTO' && (
                          <button onClick={() => cobrarOrden(orden)}
                            className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center justify-center gap-1">
                            <DollarSign size={13}/> Cobrar y entregar
                          </button>
                        )}
                        <button onClick={() => imprimirTicketOrden(orden)}
                          className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors"
                          title="Imprimir ticket">
                          <Printer size={14}/>
                        </button>
                        {(orden.estado === 'ESPERANDO' || orden.estado === 'EN_PROCESO') && (
                          <button onClick={() => cambiarEstado(orden, 'CANCELADO')}
                            className="p-2 rounded-lg border border-slate-200 text-red-400 hover:bg-red-50 transition-colors">
                            <XCircle size={14}/>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── CATÁLOGO ─────────────────────────────────────────────────────────── */}
      {tab === 'catalogo' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input placeholder="Buscar servicio..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-64"/>
            </div>
            <div className="flex gap-2">
              {servicios.length === 0 && (
                <button onClick={importarCatalogo} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600">
                  <Zap size={15}/> Importar catálogo base
                </button>
              )}
              <button onClick={() => { setEditingServicio(null); setShowNuevoServicio(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">
                <Plus size={15}/> Nuevo servicio
              </button>
            </div>
          </div>

          {Object.keys(TIPO_VEHICULO_CONFIG).map(tipo => {
            const svcs = servicios.filter(s => s.tipo_vehiculo === tipo &&
              (!search || s.nombre.toLowerCase().includes(search.toLowerCase())));
            if (svcs.length === 0) return null;
            const cfg = TIPO_VEHICULO_CONFIG[tipo];
            return (
              <div key={tipo}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{cfg.emoji}</span>
                  <h3 className="font-bold text-slate-700">{cfg.label}</h3>
                  <span className="text-xs text-slate-400">({svcs.length} servicios)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {svcs.map(svc => {
                    const cat = CATEGORIA_CONFIG[svc.categoria];
                    return (
                      <div key={svc.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{svc.nombre}</p>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: cat?.color + '18', color: cat?.color }}>
                              {cat?.label}
                            </span>
                          </div>
                          <p className="font-extrabold text-blue-600">{formatMoney(svc.precio)}</p>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">{svc.descripcion}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={10}/> {svc.duracion_min} min
                          </span>
                          <button onClick={() => {
                            setEditingServicio(svc);
                            setFormServicio({
                              nombre: svc.nombre, categoria: svc.categoria,
                              tipo_vehiculo: svc.tipo_vehiculo,
                              precio: String(svc.precio), duracion_min: String(svc.duracion_min),
                              descripcion: svc.descripcion,
                            });
                            setShowNuevoServicio(true);
                          }}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400">
                            <Edit2 size={12}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {servicios.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
              <Droplets size={36} className="mx-auto mb-3 text-amber-400"/>
              <p className="font-semibold text-amber-800">Sin servicios configurados</p>
              <p className="text-sm text-amber-600 mt-1 mb-4">
                Importa el catálogo base con {CATALOGO_DEFAULT.length} servicios predefinidos para todos los tipos de vehículo, o créalos manualmente.
              </p>
              <button onClick={importarCatalogo} disabled={saving}
                className="px-6 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600">
                <Zap size={14} className="inline mr-1"/> Importar catálogo base ({CATALOGO_DEFAULT.length} servicios)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── LAVADORES ──────────────────────────────────────────────────────────── */}
      {tab === 'lavadores' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowNuevoLavador(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">
              <Plus size={15}/> Agregar lavador
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {lavadores.map(lav => {
              const activo = ordenes.find(o => o.lavador_id === lav.id && o.estado === 'EN_PROCESO');
              return (
                <div key={lav.id} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 text-xl font-bold ${
                    activo ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {lav.nombre.charAt(0).toUpperCase()}
                  </div>
                  <p className="font-semibold text-slate-800 text-sm">{lav.nombre}</p>
                  {activo ? (
                    <div className="mt-1">
                      <span className="text-xs text-blue-600 font-semibold">🧼 En proceso</span>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{activo.cliente_nombre}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-green-600 font-semibold mt-1 block">✓ Disponible</span>
                  )}
                </div>
              );
            })}
            {lavadores.length === 0 && (
              <div className="col-span-full bg-slate-50 rounded-xl p-8 text-center text-slate-400">
                <Users size={32} className="mx-auto mb-2 opacity-30"/>
                <p className="font-medium">Sin lavadores registrados</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORIAL ──────────────────────────────────────────────────────────── */}
      {tab === 'historial' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Cliente / Placa','Vehículo','Servicio','Valor','Lavador','Estado','Fecha'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historial.map(o => {
                const est = ESTADO_CONFIG[o.estado];
                const tipo = TIPO_VEHICULO_CONFIG[o.tipo_vehiculo];
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{o.cliente_nombre}</p>
                      {o.placa && <span className="text-xs font-mono bg-slate-800 text-white px-1 rounded">{o.placa}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{tipo?.emoji} {tipo?.label}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{o.servicio_nombre}</td>
                    <td className="px-4 py-3 font-bold text-blue-600">{formatMoney(o.servicio_precio)}</td>
                    <td className="px-4 py-3 text-slate-500">{o.lavador_nombre || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ color: est.color, background: est.bg }}>
                        {est.icon} {est.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(o.created_at).toLocaleDateString('es-CO')}
                    </td>
                  </tr>
                );
              })}
              {historial.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Sin historial</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL — NUEVA ORDEN
      ══════════════════════════════════════════════════════════════════════════ */}
      {showNuevaOrden && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <Droplets size={18}/> Nueva Orden de Lavado
              </h3>
              <button onClick={() => setShowNuevaOrden(false)} className="text-white/70 hover:text-white"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Tipo de vehículo */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Tipo de Vehículo</p>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(TIPO_VEHICULO_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setFormOrden(f => ({ ...f, tipo_vehiculo: k, servicio_id: '' }))}
                      className={`py-3 rounded-xl border-2 flex flex-col items-center gap-1 text-sm font-semibold transition-all ${
                        formOrden.tipo_vehiculo === k
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      <span className="text-2xl">{v.emoji}</span>
                      <span className="text-xs">{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Servicio */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Servicio <span className="text-red-500">*</span>
                </p>
                {serviciosFiltrados.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-sm text-amber-700">
                    No hay servicios para {TIPO_VEHICULO_CONFIG[formOrden.tipo_vehiculo]?.label}.
                    Ve al catálogo para agregarlos.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {serviciosFiltrados.map(svc => {
                      const cat = CATEGORIA_CONFIG[svc.categoria];
                      return (
                        <button key={svc.id}
                          onClick={() => setFormOrden(f => ({ ...f, servicio_id: svc.id }))}
                          className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                            formOrden.servicio_id === svc.id
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}>
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-slate-700 text-sm">{svc.nombre}</p>
                            <p className="font-bold text-blue-600 text-sm">{formatMoney(svc.precio)}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold px-1 rounded"
                              style={{ background: cat?.color + '18', color: cat?.color }}>
                              {cat?.label}
                            </span>
                            <span className="text-[10px] text-slate-400">{svc.duracion_min} min</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cliente */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Datos del Cliente</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Nombre <span className="text-red-500">*</span></label>
                    <input value={formOrden.cliente_nombre} onChange={e => setFormOrden(f => ({ ...f, cliente_nombre: e.target.value }))}
                      placeholder="Nombre del cliente"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Teléfono</label>
                    <input value={formOrden.cliente_telefono} onChange={e => setFormOrden(f => ({ ...f, cliente_telefono: e.target.value }))}
                      placeholder="3001234567"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Placa</label>
                    <input value={formOrden.placa} onChange={e => setFormOrden(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                      placeholder="ABC123"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Marca</label>
                    <input value={formOrden.marca_vehiculo} onChange={e => setFormOrden(f => ({ ...f, marca_vehiculo: e.target.value }))}
                      placeholder="Toyota, Renault..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Color</label>
                    <input value={formOrden.color_vehiculo} onChange={e => setFormOrden(f => ({ ...f, color_vehiculo: e.target.value }))}
                      placeholder="Rojo, Blanco..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                  </div>
                </div>
              </div>

              {/* Lavador */}
              {lavadores.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Asignar Lavador</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setFormOrden(f => ({ ...f, lavador_id: '' }))}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                        !formOrden.lavador_id ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-200 text-slate-500'
                      }`}>
                      Sin asignar
                    </button>
                    {lavadores.map(lav => {
                      const ocupado = ordenes.find(o => o.lavador_id === lav.id && o.estado === 'EN_PROCESO');
                      return (
                        <button key={lav.id} onClick={() => setFormOrden(f => ({ ...f, lavador_id: lav.id }))}
                          disabled={!!ocupado}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                            formOrden.lavador_id === lav.id
                              ? 'bg-blue-600 text-white border-blue-600'
                              : ocupado
                              ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                              : 'border-slate-200 text-slate-600 hover:border-blue-300'
                          }`}>
                          {ocupado ? '🔴' : '🟢'} {lav.nombre}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notas */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Notas</label>
                <textarea value={formOrden.notas} onChange={e => setFormOrden(f => ({ ...f, notas: e.target.value }))}
                  rows={2} placeholder="Observaciones, daños previos, solicitudes especiales..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"/>
              </div>

              {/* Resumen */}
              {formOrden.servicio_id && (() => {
                const svc = serviciosFiltrados.find(s => s.id === formOrden.servicio_id);
                if (!svc) return null;
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-blue-800">{svc.nombre}</p>
                      <p className="text-xs text-blue-600">{TIPO_VEHICULO_CONFIG[formOrden.tipo_vehiculo]?.emoji} {TIPO_VEHICULO_CONFIG[formOrden.tipo_vehiculo]?.label} · {svc.duracion_min} min estimados</p>
                    </div>
                    <p className="text-2xl font-extrabold text-blue-700">{formatMoney(svc.precio)}</p>
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end bg-slate-50 flex-shrink-0">
              <button onClick={() => setShowNuevaOrden(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button onClick={handleNuevaOrden} disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? <><RefreshCw size={14} className="animate-spin"/> Guardando...</> : <><Droplets size={14}/> Crear Orden</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL — NUEVO / EDITAR SERVICIO
      ══════════════════════════════════════════════════════════════════════════ */}
      {showNuevoServicio && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-700 to-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white">{editingServicio ? 'Editar Servicio' : 'Nuevo Servicio'}</h3>
              <button onClick={() => { setShowNuevoServicio(false); setEditingServicio(null); }} className="text-white/70 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Nombre *</label>
                  <input value={formServicio.nombre} onChange={e => setFormServicio(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Lavado Completo"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Tipo vehículo</label>
                  <select value={formServicio.tipo_vehiculo} onChange={e => setFormServicio(f => ({ ...f, tipo_vehiculo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    {Object.entries(TIPO_VEHICULO_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.emoji} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Categoría</label>
                  <select value={formServicio.categoria} onChange={e => setFormServicio(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    {Object.entries(CATEGORIA_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Precio *</label>
                  <input type="number" value={formServicio.precio} onChange={e => setFormServicio(f => ({ ...f, precio: e.target.value }))}
                    placeholder="18000"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Duración (min)</label>
                  <input type="number" value={formServicio.duracion_min} onChange={e => setFormServicio(f => ({ ...f, duracion_min: e.target.value }))}
                    placeholder="30"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none"/>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Descripción</label>
                  <textarea value={formServicio.descripcion} onChange={e => setFormServicio(f => ({ ...f, descripcion: e.target.value }))}
                    rows={2} placeholder="¿Qué incluye este servicio?"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"/>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => { setShowNuevoServicio(false); setEditingServicio(null); }}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancelar</button>
              <button onClick={handleGuardarServicio} disabled={saving}
                className="px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 disabled:opacity-50">
                {saving ? 'Guardando...' : editingServicio ? 'Actualizar' : 'Crear Servicio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL — NUEVO LAVADOR
      ══════════════════════════════════════════════════════════════════════════ */}
      {showNuevoLavador && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-700 to-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white">Agregar Lavador</h3>
              <button onClick={() => setShowNuevoLavador(false)} className="text-white/70 hover:text-white"><X size={20}/></button>
            </div>
            <div className="p-6">
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Nombre del lavador *</label>
              <input value={formLavador.nombre} onChange={e => setFormLavador({ nombre: e.target.value })}
                placeholder="Carlos, Juan..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"/>
            </div>
            <div className="px-6 pb-6 flex gap-3 justify-end">
              <button onClick={() => setShowNuevoLavador(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancelar</button>
              <button onClick={handleGuardarLavador} disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL — COBRO (igual que POS: efectivo, tarjeta, transferencia, vuelto)
      ══════════════════════════════════════════════════════════════════════════ */}
      {showCobro && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-green-600 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <DollarSign size={18}/> Cobrar Servicio
              </h3>
              <button onClick={() => setShowCobro(null)} className="text-white/70 hover:text-white"><X size={20}/></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Resumen del servicio */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-semibold">{showCobro.cliente_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Servicio:</span>
                  <span className="font-semibold">{showCobro.servicio_nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vehículo:</span>
                  <span className="font-semibold">
                    {TIPO_VEHICULO_CONFIG[showCobro.tipo_vehiculo]?.emoji}{' '}
                    {showCobro.marca_vehiculo || TIPO_VEHICULO_CONFIG[showCobro.tipo_vehiculo]?.label}
                    {showCobro.placa ? ` · ${showCobro.placa}` : ''}
                  </span>
                </div>
                {showCobro.lavador_nombre && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Lavador:</span>
                    <span className="font-semibold">{showCobro.lavador_nombre}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-bold text-slate-700">TOTAL A COBRAR:</span>
                  <span className="font-extrabold text-blue-600 text-lg">{formatMoney(showCobro.servicio_precio)}</span>
                </div>
              </div>

              {/* Método de pago */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Método de pago</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'EFECTIVO',       label: '💵 Efectivo' },
                    { id: 'TRANSFERENCIA',  label: '🏦 Transf.' },
                    { id: 'TARJETA',        label: '💳 Tarjeta' },
                  ].map(m => (
                    <button key={m.id} onClick={() => { setMetodoCobro(m.id); setEfectivoRecibido(''); }}
                      className={`py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${
                        metodoCobro === m.id
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Efectivo recibido */}
              {metodoCobro === 'EFECTIVO' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
                    Efectivo recibido
                  </label>
                  <input
                    type="number"
                    value={efectivoRecibido}
                    onChange={e => setEfectivoRecibido(e.target.value)}
                    placeholder={String(showCobro.servicio_precio)}
                    autoFocus
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-2xl font-extrabold text-center focus:outline-none focus:border-emerald-500"
                  />
                  {/* Botones rápidos de billetes */}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[10000, 20000, 50000, 100000].map(v => (
                      <button key={v} onClick={() => setEfectivoRecibido(String(v))}
                        className="px-2 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-semibold">
                        {formatMoney(v)}
                      </button>
                    ))}
                    <button onClick={() => setEfectivoRecibido(String(showCobro.servicio_precio))}
                      className="px-2 py-1 text-xs border border-emerald-300 rounded-lg hover:bg-emerald-50 text-emerald-700 font-semibold">
                      Exacto
                    </button>
                  </div>

                  {/* Vuelto */}
                  {parseFloat(efectivoRecibido) >= showCobro.servicio_precio && (
                    <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex justify-between items-center">
                      <span className="font-bold text-emerald-700">Vuelto:</span>
                      <span className="text-2xl font-extrabold text-emerald-700">
                        {formatMoney(parseFloat(efectivoRecibido) - showCobro.servicio_precio)}
                      </span>
                    </div>
                  )}
                  {efectivoRecibido && parseFloat(efectivoRecibido) < showCobro.servicio_precio && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <span className="text-red-600 font-semibold text-sm">
                        Faltan {formatMoney(showCobro.servicio_precio - parseFloat(efectivoRecibido))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {(metodoCobro === 'TARJETA' || metodoCobro === 'TRANSFERENCIA') && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-blue-700 font-bold">{formatMoney(showCobro.servicio_precio)}</p>
                  <p className="text-blue-500 text-xs mt-1">
                    {metodoCobro === 'TARJETA' ? 'Procese el pago en el datáfono' : 'Confirme la transferencia antes de continuar'}
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowCobro(null)}
                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={confirmarCobro} disabled={saving || (metodoCobro === 'EFECTIVO' && parseFloat(efectivoRecibido || '0') < showCobro.servicio_precio)}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving
                  ? <><RefreshCw size={15} className="animate-spin"/> Procesando...</>
                  : <><CheckCircle size={15}/> Confirmar cobro</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Lavadero;