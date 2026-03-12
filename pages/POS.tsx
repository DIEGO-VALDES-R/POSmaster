import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, Smartphone, X, Printer, Barcode, Zap, Tag, ChefHat, Beer, UtensilsCrossed, Scale, Wifi, Usb } from 'lucide-react';
import RefreshButton from '../components/RefreshButton';
import { Product, ProductType, CartItem, PaymentMethod, Sale } from '../types';
import { toast, Toaster } from 'react-hot-toast';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import InvoiceModal from '../components/InvoiceModal';
import PayPalCheckout from '../components/PayPalCheckout';
import { supabase } from '../supabaseClient';

// ── Apertura automática del cajón al facturar ─────────────────────────────
const ESC_POS_OPEN_DRAWER = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);

const autoOpenDrawer = async () => {
  try {
    const raw = localStorage.getItem('posmaster_drawer_config');
    if (!raw) return; // sin config = sin cajón configurado
    const config = JSON.parse(raw);
    const protocol = config.protocol || 'escpos-usb';

    if (protocol === 'escpos-usb') {
      if (!('usb' in navigator)) return;
      const devices = await (navigator as any).usb.getDevices();
      if (devices.length === 0) return; // sin permiso previo = no intentar
      const device = devices[0];
      await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      await device.claimInterface(0);
      const endpoint = device.configuration.interfaces[0].alternate.endpoints
        .find((e: any) => e.direction === 'out');
      if (endpoint) await device.transferOut(endpoint.endpointNumber, ESC_POS_OPEN_DRAWER);
      await device.close();

    } else if (protocol === 'escpos-network') {
      const ip = config.networkIp || '192.168.1.100';
      const port = config.networkPort || 9100;
      const hexCmd = Array.from(ESC_POS_OPEN_DRAWER).map((b: number) => b.toString(16).padStart(2, '0')).join('');
      await fetch(`http://localhost:8765/rawprint?ip=${ip}&port=${port}&hex=${hexCmd}`, { signal: AbortSignal.timeout(2000) }).catch(() => {});

    } else if (protocol === 'windows-print') {
      const printer = config.windowsPrinter || '';
      const html = `<html><head><style>body{margin:0}</style><script>
        window.onload=function(){document.title='${printer ? `\\\\localhost\\${printer}` : ''}';window.print();setTimeout(function(){window.close();},500);};
      </sc` + `ript></head><body><p style="font-size:1px;color:white;">.</p></body></html>`;
      const w = window.open('', '_blank', 'width=1,height=1,top=-100,left=-100');
      if (w) w.document.write(html);
    }
  } catch { /* silencioso — no interrumpir la venta */ }
};

const POS: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { products, session, processSale, company, refreshAll } = useDatabase();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const location       = useLocation();
  const navigate       = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  // IVA Toggle — usa la tasa configurada en Settings
  const defaultTaxRate = company?.config?.tax_rate ?? 19;
  const [applyIva, setApplyIva] = useState(true);

  // ── PAYPAL CONFIG ─────────────────────────────────────────────────────────
  const paypalConfig = (company?.config as any)?.payment_providers?.paypal;
  const paypalEnabled = paypalConfig?.enabled && paypalConfig?.client_id;
  const [showPaypalModal, setShowPaypalModal] = useState(false);
  const [paypalLoading, setPaypalLoading] = useState(false);
  const [paypalAmount, setPaypalAmount] = useState(0);

  // ── DESCUENTO GLOBAL DEL CARRITO ──────────────────────────────────────────
  const [discountMode, setDiscountMode] = useState<'pct' | 'val'>('pct');
  const [globalDiscount, setGlobalDiscount] = useState<string>('');
  const [globalDiscountVal, setGlobalDiscountVal] = useState<string>('');
  // subtotalBruto necesario para convertir valor ↔ %. Se recalcula abajo.
  const subtotalBrutoPreview = useMemo(() =>
    cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  const clampedDiscount = useMemo(() => {
    if (discountMode === 'pct') {
      return Math.min(Math.max(parseFloat(globalDiscount) || 0, 0), 100);
    } else {
      const val = parseFloat(globalDiscountVal) || 0;
      if (!subtotalBrutoPreview) return 0;
      return Math.min((val / subtotalBrutoPreview) * 100, 100);
    }
  }, [discountMode, globalDiscount, globalDiscountVal, subtotalBrutoPreview]);

  const handleDiscountPct = (raw: string) => {
    setGlobalDiscount(raw);
    const pct = Math.min(Math.max(parseFloat(raw) || 0, 0), 100);
    if (subtotalBrutoPreview) setGlobalDiscountVal(pct ? String(Math.round(subtotalBrutoPreview * pct / 100)) : '');
  };

  const handleDiscountVal = (raw: string) => {
    setGlobalDiscountVal(raw);
    const val = parseFloat(raw) || 0;
    if (subtotalBrutoPreview) setGlobalDiscount(val ? String(+((val / subtotalBrutoPreview) * 100).toFixed(2)) : '');
  };

  // Datos cliente
  const [customerName, setCustomerName] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Pago
  const [payments, setPayments] = useState<{method: PaymentMethod, amount: number}[]>([]);
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState('');
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);

  // ── MODO ABONO ────────────────────────────────────────────────────────────
  const [isPartialMode, setIsPartialMode]   = useState(false);
  const [shoeRepairId, setShoeRepairId]     = useState<string>('');
  const [shoeRepairLabel, setShoeRepairLabel] = useState('');

  // Leer parámetros de URL cuando viene de zapatería o salón de belleza
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shoeId  = params.get('shoe');
    const salonId = params.get('salon');
    const vetId   = params.get('vet');
    const sourceId = shoeId || salonId || vetId;
    if (!sourceId) return;

    const isShoe  = !!shoeId;
    const isSalon = !!salonId;
    const isVet   = !!vetId;

    setShoeRepairId(sourceId);
    setCustomerName(params.get('cliente') || '');
    setCustomerDoc(params.get('cedula') || '');
    setCustomerPhone(params.get('tel') || '');
    setCustomerEmail(params.get('email') || '');

    const servicioNombre = params.get('servicio')
      || (isShoe  ? 'Reparación de calzado'
        : isSalon ? 'Servicio de salón'
        : 'Servicio veterinario');

    const emoji = isShoe ? '🔧' : isSalon ? '✂️' : '🐾';
    const sku   = isShoe ? 'ZAP' : isSalon ? 'SAL' : 'VET';
    setShoeRepairLabel(`${emoji} ${params.get('ticket') || sourceId.slice(0,8).toUpperCase()} — ${servicioNombre}`);

    const total = parseFloat(params.get('total') || '0');
    const abono = parseFloat(params.get('abono') || '0');

    const virtualService: any = {
      product: {
        id: `${sku.toLowerCase()}-${sourceId}`,
        name: servicioNombre,
        price: total,
        type: 'SERVICE',
        sku: `${sku}-${sourceId.slice(0, 6)}`,
        stock_quantity: 999,
        tax_rate: 0,
      },
      quantity: 1,
      price: total,
      tax_rate: 0,
      discount: 0,
    };
    setCart([virtualService]);
    setApplyIva(false);

    if (abono > 0) {
      setIsPartialMode(true);
      setPayments([{ method: PaymentMethod.CASH, amount: abono }]);
    }

    setTimeout(() => setIsPaymentModalOpen(true), 700);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const { isScanning } = useBarcodeScanner((barcode) => {
    const product = products.find(p => p.sku.toLowerCase() === barcode.toLowerCase());
    if (product) {
      addToCart(product);
      setSearchTerm('');
    } else {
      toast.error(`Producto con SKU "${barcode}" no encontrado`);
    }
  });

  const businessTypes: string[] = Array.isArray((company?.config as any)?.business_types)
    ? (company?.config as any).business_types
    : (company?.config as any)?.business_type ? [(company?.config as any).business_type] : ['general'];

  const isZapateria    = businessTypes.includes('zapateria');
  const isRestaurante  = businessTypes.some(t => ['restaurante', 'restaurant', 'cocina', 'cafeteria'].includes(t));
  const isFarmacia     = businessTypes.includes('farmacia');
  const isVeterinaria  = businessTypes.includes('veterinaria');
  const isOdontologia  = businessTypes.includes('odontologia');
  const isSalon        = businessTypes.some(t => ['salon', 'salón', 'belleza'].includes(t));
  const isSupermercado = businessTypes.some(t => ['supermercado', 'abarrotes', 'mercado'].includes(t));
  const isServiceBusiness = isZapateria || isSalon || isVeterinaria || isOdontologia;

  // ── BALANZA / PESABLES ────────────────────────────────────────────────────
  const [scaleWeight,     setScaleWeight]     = useState<number | null>(null);   // kg leído de la balanza
  const [scaleConnected,  setScaleConnected]  = useState(false);
  const [scalePort,       setScalePort]       = useState<any>(null);             // SerialPort handle
  const [scaleProtocol,   setScaleProtocol]   = useState<'serial' | 'barcode' | 'manual'>('manual');
  const [showScaleConfig, setShowScaleConfig] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [pendingWeighable, setPendingWeighable] = useState<Product | null>(null);
  const [manualWeight,    setManualWeight]    = useState('');
  const scaleBufferRef = useRef('');

  const [menuItems,  setMenuItems]  = useState<any[]>([]);
  const [beverages,  setBeverages]  = useState<any[]>([]);
  const [menuTab,    setMenuTab]    = useState<'platos' | 'bebidas'>('platos');
  const [pharmaMeds,    setPharmaMeds]    = useState<any[]>([]);
  const [pharmaLoading, setPharmaLoading] = useState(false);
  const [specialtyServices, setSpecialtyServices] = useState<any[]>([]);

  const loadRestaurantMenu = useCallback(async () => {
    if (!company?.id || !isRestaurante) return;
    const [menuRes, bevRes] = await Promise.all([
      supabase.from('rest_menu_items').select('*, rest_menu_categories(name,icon)').eq('company_id', company.id).eq('is_active', true).eq('is_available', true).order('name'),
      supabase.from('rest_beverages').select('*').eq('company_id', company.id).eq('is_active', true).order('name'),
    ]);
    if (menuRes.data) setMenuItems(menuRes.data);
    if (bevRes.data)  setBeverages(bevRes.data);
  }, [company?.id, isRestaurante]);

  const loadPharmaMeds = useCallback(async () => {
    if (!company?.id || !isFarmacia) return;
    setPharmaLoading(true);
    const { data } = await supabase
      .from('pharma_medications')
      .select('*')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .gt('stock_total', 0)
      .order('name');
    if (data) setPharmaMeds(data);
    setPharmaLoading(false);
  }, [company?.id, isFarmacia]);

  const loadSpecialtyServices = useCallback(async () => {
    if (!company?.id || (!isVeterinaria && !isOdontologia && !isSalon)) return;
    const table = isVeterinaria ? 'vet_servicios' : isOdontologia ? 'odonto_servicios' : 'salon_servicios';
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq('company_id', company.id)
      .eq('activo', true)
      .order('nombre');
    if (data) setSpecialtyServices(data);
  }, [company?.id, isVeterinaria, isOdontologia, isSalon]);

  useEffect(() => { loadRestaurantMenu(); }, [loadRestaurantMenu]);
  useEffect(() => { loadPharmaMeds(); }, [loadPharmaMeds]);
  useEffect(() => { loadSpecialtyServices(); }, [loadSpecialtyServices]);

  const filteredProducts = useMemo(() => {
    if (isRestaurante || isFarmacia || isVeterinaria || isOdontologia || isSalon) return [];
    return products.filter(p => {
      if (isZapateria && p.type !== 'SERVICE') return false;
      return ((p.stock_quantity ?? 0) > 0 || p.type === 'SERVICE') &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [searchTerm, products, isZapateria, isRestaurante, isFarmacia, isVeterinaria, isOdontologia, isSalon]);

  const filteredMenuItems = useMemo(() =>
    menuItems.filter(i => !searchTerm || i.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [menuItems, searchTerm]);
  const filteredBeverages = useMemo(() =>
    beverages.filter(b => !searchTerm || b.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [beverages, searchTerm]);
  const filteredPharmaMeds = useMemo(() =>
    pharmaMeds.filter(m =>
      !searchTerm ||
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.barcode || '').includes(searchTerm)
    ), [pharmaMeds, searchTerm]);
  const filteredSpecialtyServices = useMemo(() =>
    specialtyServices.filter(s =>
      !searchTerm || s.nombre.toLowerCase().includes(searchTerm.toLowerCase())
    ), [specialtyServices, searchTerm]);

  const addMenuItemToCart = (item: any) => {
    if (session?.status !== 'OPEN') { toast.error('Debe abrir la caja primero'); return; }
    const vp: any = { id: `menu-${item.id}`, name: item.name, price: item.price, type: 'SERVICE', sku: `MENU-${item.id.slice(0,6)}`, stock_quantity: 999, tax_rate: 0 };
    const existing = cart.find(c => c.product.id === vp.id);
    if (existing) setCart(cart.map(c => c.product.id === vp.id ? { ...c, quantity: c.quantity + 1 } : c));
    else setCart([...cart, { product: vp, quantity: 1, price: item.price, tax_rate: 0, discount: 0 }]);
    toast.success(`${item.name} agregado`);
  };

  const addBeverageToCart = (bev: any) => {
    if (session?.status !== 'OPEN') { toast.error('Debe abrir la caja primero'); return; }
    if (bev.stock <= 0) { toast.error('Bebida sin stock'); return; }
    const vp: any = { id: `bev-${bev.id}`, name: `${bev.name} (${bev.presentation})`, price: bev.price, type: 'SERVICE', sku: `BEV-${bev.id.slice(0,6)}`, stock_quantity: bev.stock, tax_rate: 0 };
    const existing = cart.find(c => c.product.id === vp.id);
    if (existing) {
      if (existing.quantity >= bev.stock) { toast.error('Stock insuficiente'); return; }
      setCart(cart.map(c => c.product.id === vp.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else setCart([...cart, { product: vp, quantity: 1, price: bev.price, tax_rate: 0, discount: 0 }]);
    toast.success(`${bev.name} agregado`);
  };

  const addPharmaToCart = (med: any) => {
    if (session?.status !== 'OPEN') { toast.error('Debe abrir la caja primero'); return; }
    if (med.stock_total <= 0) { toast.error('Sin stock'); return; }
    const vp: any = { id: `pharma-${med.id}`, name: med.name, price: med.price, type: 'SERVICE', sku: med.sku || `PHARMA-${med.id.slice(0,6)}`, stock_quantity: med.stock_total, tax_rate: 0 };
    const existing = cart.find(c => c.product.id === vp.id);
    if (existing) {
      if (existing.quantity >= med.stock_total) { toast.error('Stock insuficiente'); return; }
      setCart(cart.map(c => c.product.id === vp.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else setCart([...cart, { product: vp, quantity: 1, price: med.price, tax_rate: 0, discount: 0 }]);
    toast.success(`${med.name} agregado`);
  };

  const addSpecialtyServiceToCart = (svc: any) => {
    if (session?.status !== 'OPEN') { toast.error('Debe abrir la caja primero'); return; }
    const vp: any = { id: `svc-${svc.id}`, name: svc.nombre, price: svc.precio, type: 'SERVICE', sku: `SVC-${svc.id.slice(0,6)}`, stock_quantity: 999, tax_rate: 0 };
    const existing = cart.find(c => c.product.id === vp.id);
    if (existing) setCart(cart.map(c => c.product.id === vp.id ? { ...c, quantity: c.quantity + 1 } : c));
    else setCart([...cart, { product: vp, quantity: 1, price: svc.precio, tax_rate: 0, discount: 0 }]);
    toast.success(`${svc.nombre} agregado`);
  };

  const totals = useMemo(() => {
    const subtotalBruto = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const discountAmount = subtotalBruto * (clampedDiscount / 100);
    const subtotal = subtotalBruto - discountAmount;
    const tax = applyIva ? subtotal * (defaultTaxRate / 100) : 0;
    const total = subtotal + tax;
    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
    const remaining = total - totalPaid;
    return { subtotalBruto, discountAmount, subtotal, tax, total, totalPaid, remaining };
  }, [cart, payments, applyIva, defaultTaxRate, clampedDiscount]);

  useEffect(() => {
    if (session?.status === 'OPEN' && !isPaymentModalOpen && !showInvoice) {
      searchInputRef.current?.focus();
    }
  }, [session, isPaymentModalOpen, showInvoice, cart]);

  // ══════════════════════════════════════════════════════════════════════════
  // BALANZA — LÓGICA MULTI-PROTOCOLO
  // ══════════════════════════════════════════════════════════════════════════

  // Decodifica código de barras tipo EAN-13 pesable (estándar mundial)
  // Formato: 2X XXXXX PPPPP C   donde XX=PLU 5 dígitos, PPPPP=peso en gramos
  const decodeWeighableBarcode = (barcode: string): { plu: string; weightKg: number } | null => {
    if (barcode.length === 13 && barcode.startsWith('2')) {
      const pluRaw  = barcode.substring(1, 6);
      const weightG = parseInt(barcode.substring(7, 12), 10);
      if (!isNaN(weightG)) return { plu: pluRaw.replace(/^0+/, ''), weightKg: weightG / 1000 };
    }
    return null;
  };

  // Parsea respuesta serial de diferentes marcas de balanzas
  const parseScaleResponse = (raw: string): number | null => {
    const cleaned = raw.replace(/\r|\n/g, '').trim();
    // DIBAL / formato: "  ST,GS  +  0.850 kg"
    const dibal = cleaned.match(/[+-]?\s*(\d+[.,]\d+)\s*kg/i);
    if (dibal) return parseFloat(dibal[1].replace(',', '.'));
    // DIGI SM-100 formato: "0.850"
    const digi = cleaned.match(/^[+-]?\s*(\d+[.,]\d+)$/);
    if (digi) return parseFloat(digi[1].replace(',', '.'));
    // Toledo / Mettler formato: "S S      0.850 kg" o "N      0.850 kg"
    const toledo = cleaned.match(/[SN]\s+[SN]?\s*(\d+[.,]\d+)\s*k?g?/i);
    if (toledo) return parseFloat(toledo[1].replace(',', '.'));
    // Genérico — primer número decimal encontrado
    const generic = cleaned.match(/(\d+[.,]\d+)/);
    if (generic) { const v = parseFloat(generic[1].replace(',', '.')); if (v > 0 && v < 500) return v; }
    return null;
  };

  // Conectar balanza vía Web Serial API
  const connectScaleSerial = async () => {
    if (!('serial' in navigator)) {
      toast.error('Web Serial no disponible. Usa Chrome o Edge en escritorio.');
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort({ filters: [] });
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });
      setScalePort(port);
      setScaleConnected(true);
      setScaleProtocol('serial');
      toast.success('✅ Balanza conectada por puerto serial');
      // Leer stream
      const reader = port.readable.getReader();
      const decoder = new TextDecoder();
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            scaleBufferRef.current += decoder.decode(value);
            // Detectar fin de mensaje (\r\n o \n)
            if (scaleBufferRef.current.includes('\n') || scaleBufferRef.current.includes('\r')) {
              const weight = parseScaleResponse(scaleBufferRef.current);
              if (weight !== null && weight > 0) setScaleWeight(weight);
              scaleBufferRef.current = '';
            }
          }
        } catch { /* puerto cerrado */ }
      };
      readLoop();
    } catch (err: any) {
      if (err.name !== 'NotFoundError') toast.error('Error al conectar balanza: ' + err.message);
    }
  };

  const disconnectScale = async () => {
    if (scalePort) { try { await scalePort.close(); } catch { /* ignore */ } setScalePort(null); }
    setScaleConnected(false);
    setScaleWeight(null);
    toast('Balanza desconectada');
  };

  // Añadir producto pesable al carrito con su peso
  const addWeighableToCart = (product: Product, weightKg: number) => {
    if (session?.status !== 'OPEN') { toast.error('Debe abrir la caja primero'); return; }
    const pricePerUnit = (product as any).price_per_unit || product.price;
    const linePrice = Math.round(pricePerUnit * weightKg);
    const existing = cart.find(i => i.product.id === product.id);
    if (existing) {
      setCart(cart.map(i => i.product.id === product.id
        ? { ...i, weight_kg: (i.weight_kg || 0) + weightKg, quantity: 1, price: Math.round(pricePerUnit * ((i.weight_kg || 0) + weightKg)) }
        : i
      ));
    } else {
      setCart([...cart, { product, quantity: 1, weight_kg: weightKg, price: linePrice, tax_rate: defaultTaxRate, discount: 0 }]);
    }
    toast.success(`🥬 ${product.name} · ${weightKg.toFixed(3)} kg · $${linePrice.toLocaleString('es-CO')}`);
    setShowWeightModal(false);
    setManualWeight('');
    setPendingWeighable(null);
    if (scaleProtocol === 'serial') setScaleWeight(null); // reset after add
  };

  // Buscar producto pesable por PLU code o nombre
  const findWeighableByPlu = (term: string): Product | null => {
    const t = term.toUpperCase().trim();
    return (products as any[]).find(p =>
      p.type === 'WEIGHABLE' && (
        (p.plu_code && p.plu_code.toUpperCase() === t) ||
        p.sku?.toUpperCase() === t ||
        p.name?.toUpperCase().includes(t)
      )
    ) as Product || null;
  };

  // Interceptar Enter en el buscador para productos pesables
  const handleWeighableSearch = (term: string): boolean => {
    if (!isSupermercado) return false;
    // Caso 1: código de barras EAN-13 pesable (emitido por balanza con impresora)
    const decoded = decodeWeighableBarcode(term);
    if (decoded) {
      const product = (products as any[]).find(p =>
        p.type === 'WEIGHABLE' && (
          String(p.plu_code) === decoded.plu ||
          String(p.sku).replace(/^0+/,'') === decoded.plu
        )
      ) as Product;
      if (product) { addWeighableToCart(product, decoded.weightKg); return true; }
    }
    // Caso 2: PLU corto (F1, P23, etc.)
    const byPlu = findWeighableByPlu(term);
    if (byPlu) {
      setPendingWeighable(byPlu);
      // Si hay peso de balanza serial, usar directo; si no, pedir manual
      if (scaleWeight && scaleWeight > 0) {
        addWeighableToCart(byPlu, scaleWeight);
      } else {
        setManualWeight('');
        setShowWeightModal(true);
      }
      return true;
    }
    return false;
  };

  // ── FIN LÓGICA BALANZA ────────────────────────────────────────────────────

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchTerm) {
      // Primero intentar como producto pesable (PLU o EAN-13)
      if (handleWeighableSearch(searchTerm)) { setSearchTerm(''); return; }
      const exactMatch = products.find(p => p.sku.toLowerCase() === searchTerm.toLowerCase());
      if (exactMatch) { addToCart(exactMatch); setSearchTerm(''); }
      else if (filteredProducts.length === 1) { addToCart(filteredProducts[0]); setSearchTerm(''); }
    }
  };

  const addToCart = (product: Product) => {
    if (session?.status !== 'OPEN') { toast.error('Debe abrir la caja primero'); return; }
    if (product.stock_quantity <= 0 && product.type !== ProductType.SERVICE) { toast.error('Producto sin stock'); return; }

    if (product.type === ProductType.SERIALIZED) {
      const serial = window.prompt(`Ingrese IMEI/Serial para ${product.name}:`);
      if (!serial) return;
      if (cart.find(item => item.product.id === product.id && item.serial_number === serial)) {
        toast.error('Este serial ya esta en el carrito'); return;
      }
      setCart([...cart, { product, quantity: 1, serial_number: serial, price: product.price, tax_rate: defaultTaxRate, discount: 0 }]);
    } else {
      const existing = cart.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) { toast.error('Stock insuficiente'); return; }
        setCart(cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      } else {
        setCart([...cart, { product, quantity: 1, price: product.price, tax_rate: defaultTaxRate, discount: 0 }]);
      }
    }
    toast.success('Agregado');
  };

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    if (item.product.type === ProductType.SERIALIZED && delta > 0) { toast.error('Escanee la nueva unidad'); return; }
    if (delta > 0 && item.quantity >= item.product.stock_quantity && item.product.type !== ProductType.SERVICE) { toast.error('Stock maximo alcanzado'); return; }
    item.quantity += delta;
    if (item.quantity <= 0) newCart.splice(index, 1);
    setCart(newCart);
  };

  const removeFromCart = (index: number) => { const c = [...cart]; c.splice(index, 1); setCart(c); };

  // ── FIX: redondear amount para evitar errores de punto flotante ──────────
  const addPayment = () => {
    const amount = Math.round(parseFloat(currentPaymentAmount));
    if (!amount || amount <= 0) return;
    // Permitir vuelto (el cajero puede pagar con billete de más)
    // pero bloquear montos absurdamente superiores al total
    if (!isPartialMode && amount > totals.total * 2 + 100000) {
      toast.error('El monto excede el total restante');
      return;
    }
    setPayments([...payments, { method: currentPaymentMethod, amount }]);
    setCurrentPaymentAmount('');
  };

  const removePayment = (index: number) => { const p = [...payments]; p.splice(index, 1); setPayments(p); };

  const handleFinalizeSale = async () => {
    const amountPaid = totals.totalPaid;

    // Solo bloquear si FALTA dinero (remaining positivo). Vuelto (negativo) es válido.
    if (!isPartialMode && totals.remaining > 100) {
      toast.error('Debe cubrir el total de la venta o activar modo Abono Parcial');
      return;
    }
    if (isPartialMode && amountPaid <= 0) {
      toast.error('Ingresa al menos un monto de abono');
      return;
    }

    try {
      const sale = await processSale({
        customer:    customerName || 'Consumidor Final',
        customerDoc, customerEmail, customerPhone,
        items:       cart,
        total:       totals.total,
        subtotal:    totals.subtotal,
        taxAmount:   totals.tax,
        applyIva,
        discountPercent: clampedDiscount,
        discountAmount:  totals.discountAmount,
        amountPaid:   amountPaid,
        shoeRepairId: shoeRepairId || undefined,
      });

      setLastSale({ ...sale, _cartItems: cart, discountPercent: clampedDiscount, discountAmount: totals.discountAmount } as any);
      setShowInvoice(true);

      // Abrir cajón automáticamente si hay pago en efectivo
      const hasCash = payments.some(p => p.method === PaymentMethod.CASH);
      if (hasCash) autoOpenDrawer();

      setCart([]); setPayments([]);
      setGlobalDiscount(''); setGlobalDiscountVal('');
      setCustomerName(''); setCustomerDoc(''); setCustomerEmail(''); setCustomerPhone('');
      setIsPartialMode(false); setShoeRepairId(''); setShoeRepairLabel('');
      setIsPaymentModalOpen(false);
      navigate('/pos', { replace: true });
    } catch (err: any) {
      console.error('Error al facturar:', err);
      toast.error('Error al facturar: ' + (err?.message || 'Error desconocido'));
    }
  };

  if (session?.status !== 'OPEN') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-100 rounded-xl border border-dashed border-slate-300">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Banknote size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Caja Cerrada</h2>
          <p className="text-slate-500 mb-6">Debe realizar la apertura de caja antes de comenzar a vender.</p>
          <Link to="/cash-control" className="inline-block w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors">
            Ir a Apertura de Caja
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-theme(spacing.24))] gap-6 relative">
      <Toaster position="bottom-right" />

      <InvoiceModal isOpen={showInvoice} onClose={() => setShowInvoice(false)} sale={lastSale} company={company} />

      {isScanning && (
        <div className="fixed top-4 left-4 flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-2 border-blue-400 rounded-lg animate-pulse z-40">
          <Zap size={16} className="text-blue-600 animate-spin" />
          <span className="text-sm font-medium text-blue-600">Escaneando...</span>
        </div>
      )}

      {/* Catalogo */}
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex gap-2 mb-2">
            <RefreshButton onRefresh={
              isRestaurante ? loadRestaurantMenu :
              isFarmacia    ? loadPharmaMeds :
              isServiceBusiness ? loadSpecialtyServices :
              refreshAll
            } label="Actualizar" className="text-xs px-2 py-1.5" />
            {isRestaurante && (
              <div className="flex gap-1 ml-auto bg-slate-200 rounded-lg p-0.5">
                <button
                  onClick={() => setMenuTab('platos')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${menuTab === 'platos' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <UtensilsCrossed size={14}/> Platos
                </button>
                <button
                  onClick={() => setMenuTab('bebidas')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${menuTab === 'bebidas' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Beer size={14}/> Bebidas
                </button>
              </div>
            )}
          </div>
          {/* ── Barra de estado balanza (solo supermercado) ── */}
          {isSupermercado && (
            <div className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium mb-1 transition-all ${scaleConnected ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
              <span className={`w-2 h-2 rounded-full ${scaleConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
              {scaleConnected ? (
                <>
                  <Scale size={14} className="text-green-600" />
                  <span>Balanza conectada</span>
                  {scaleWeight !== null && scaleWeight > 0
                    ? <span className="font-black text-green-800 text-base ml-1">{scaleWeight.toFixed(3)} kg</span>
                    : <span className="text-green-500 text-xs">esperando peso...</span>
                  }
                  <button onClick={disconnectScale} className="ml-auto text-xs text-slate-400 hover:text-red-500">Desconectar</button>
                </>
              ) : (
                <>
                  <Scale size={14} />
                  <span>Sin balanza</span>
                  <button onClick={() => setShowScaleConfig(true)} className="ml-auto text-xs text-blue-500 hover:text-blue-700 font-bold">Configurar balanza</button>
                </>
              )}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={
                isRestaurante    ? 'Buscar plato o bebida...' :
                isFarmacia       ? 'Buscar medicamento, SKU o código de barras...' :
                isVeterinaria    ? 'Buscar servicio veterinario...' :
                isOdontologia    ? 'Buscar servicio odontológico...' :
                isSalon          ? 'Buscar servicio del salón...' :
                isZapateria      ? 'Buscar servicio de zapatería...' :
                isSupermercado   ? 'Código PLU (ej: F1) o escanear etiqueta de balanza...' :
                'Escanear Código de Barras / SKU / IMEI...'
              }
              className="w-full pl-10 pr-12 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {isRestaurante ? <ChefHat size={20}/> : isFarmacia ? <span className="text-base">💊</span> : isVeterinaria ? <span className="text-base">🐾</span> : isOdontologia ? <span className="text-base">🦷</span> : isSalon ? <span className="text-base">✂️</span> : <Barcode size={20} />}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">

          {/* ── CATÁLOGO RESTAURANTE ── */}
          {isRestaurante && menuTab === 'platos' && (
            <>
              {filteredMenuItems.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                  <ChefHat size={48} className="mb-2 opacity-20"/>
                  <p className="font-medium">No hay platos disponibles</p>
                  <p className="text-sm">Crea platos en Cocina → Menú</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredMenuItems.map(item => (
                  <button key={item.id} onClick={() => addMenuItemToCart(item)}
                    className="flex flex-col items-start text-left p-4 rounded-lg border border-slate-200 hover:border-orange-400 hover:shadow-md transition-all bg-white group">
                    <div className="w-full aspect-square bg-orange-50 rounded-md mb-3 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform overflow-hidden">
                      {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover"/> : (item.rest_menu_categories?.icon || '🍽️')}
                    </div>
                    <h4 className="font-semibold text-slate-800 line-clamp-2 text-sm">{item.name}</h4>
                    {item.rest_menu_categories && <p className="text-xs text-slate-400 mb-1">{item.rest_menu_categories.icon} {item.rest_menu_categories.name}</p>}
                    {item.description && <p className="text-xs text-slate-400 line-clamp-1 mb-1">{item.description}</p>}
                    <div className="mt-auto flex items-center justify-between w-full">
                      <span className="font-bold text-orange-600">{formatMoney(item.price)}</span>
                      <span className="text-[10px] text-slate-400">⏱ {item.prep_time_min} min</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {isRestaurante && menuTab === 'bebidas' && (
            <>
              {filteredBeverages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                  <Beer size={48} className="mb-2 opacity-20"/>
                  <p className="font-medium">No hay bebidas disponibles</p>
                  <p className="text-sm">Crea bebidas en Cocina → Bebidas</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredBeverages.map(bev => {
                  const isLow = bev.stock <= bev.stock_min;
                  return (
                    <button key={bev.id} onClick={() => addBeverageToCart(bev)} disabled={bev.stock <= 0}
                      className={`flex flex-col items-start text-left p-4 rounded-lg border transition-all bg-white group disabled:opacity-50 disabled:cursor-not-allowed ${
                        bev.stock <= 0 ? 'border-red-200 bg-red-50' : isLow ? 'border-amber-300 hover:border-amber-400 hover:shadow-md' : 'border-slate-200 hover:border-blue-400 hover:shadow-md'
                      }`}>
                      <div className="w-full aspect-square bg-blue-50 rounded-md mb-3 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">🥤</div>
                      <h4 className="font-semibold text-slate-800 line-clamp-2 text-sm">{bev.name}</h4>
                      <p className="text-xs text-slate-400 mb-1">{bev.category} · {bev.presentation}</p>
                      <div className={`text-xs font-bold mb-2 ${bev.stock <= 0 ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-green-600'}`}>
                        {bev.stock <= 0 ? 'Agotado' : `Stock: ${bev.stock}`}{isLow && bev.stock > 0 && ' ⚠️'}
                      </div>
                      <div className="mt-auto w-full"><span className="font-bold text-blue-600">{formatMoney(bev.price)}</span></div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ── CATÁLOGO FARMACIA ── */}
          {isFarmacia && (
            <>
              {pharmaLoading && <p className="text-slate-400 text-sm text-center py-8">Cargando medicamentos...</p>}
              {!pharmaLoading && filteredPharmaMeds.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                  <span className="text-5xl mb-2 opacity-30">💊</span>
                  <p className="font-medium">No hay medicamentos con stock</p>
                  <p className="text-sm">Registra medicamentos en el módulo de Farmacia</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredPharmaMeds.map(med => (
                  <button key={med.id} onClick={() => addPharmaToCart(med)}
                    className="flex flex-col items-start text-left p-4 rounded-lg border border-slate-200 hover:border-teal-500 hover:shadow-md transition-all bg-white group">
                    <div className="w-full aspect-square bg-teal-50 rounded-md mb-3 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">💊</div>
                    <h4 className="font-semibold text-slate-800 line-clamp-2 text-sm">{med.name}</h4>
                    <p className="text-xs text-slate-400 mb-1">{med.category} · {med.presentation}</p>
                    {med.laboratory && <p className="text-xs text-slate-400 mb-1">{med.laboratory}</p>}
                    <div className="text-xs font-bold mb-2 text-green-600">Stock: {med.stock_total}</div>
                    <div className="mt-auto w-full flex justify-between items-center">
                      <span className="font-bold text-teal-600">{formatMoney(med.price)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${med.requires_prescription ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                        {med.requires_prescription ? 'Con receta' : med.med_type === 'GENERIC' ? 'Genérico' : 'Comercial'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── CATÁLOGO VETERINARIA / ODONTOLOGÍA / SALÓN ── */}
          {isServiceBusiness && !isFarmacia && (
            <>
              {filteredSpecialtyServices.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                  <span className="text-5xl mb-2 opacity-30">{isVeterinaria ? '🐾' : isOdontologia ? '🦷' : '✂️'}</span>
                  <p className="font-medium">No hay servicios registrados</p>
                  <p className="text-sm">Crea servicios en el módulo de {isVeterinaria ? 'Veterinaria' : isOdontologia ? 'Odontología' : 'Salón de Belleza'}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredSpecialtyServices.map(svc => (
                  <button key={svc.id} onClick={() => addSpecialtyServiceToCart(svc)}
                    className="flex flex-col items-start text-left p-4 rounded-lg border border-slate-200 hover:border-purple-400 hover:shadow-md transition-all bg-white group">
                    <div className="w-full aspect-square bg-purple-50 rounded-md mb-3 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">
                      {isVeterinaria ? '🐾' : isOdontologia ? '🦷' : '✂️'}
                    </div>
                    <h4 className="font-semibold text-slate-800 line-clamp-2 text-sm">{svc.nombre}</h4>
                    {svc.descripcion && <p className="text-xs text-slate-400 line-clamp-2 mb-2">{svc.descripcion}</p>}
                    <div className="mt-auto w-full"><span className="font-bold text-purple-600">{formatMoney(svc.precio)}</span></div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── CATÁLOGO NORMAL ── */}
          {!isRestaurante && !isFarmacia && !isServiceBusiness && (
            <>
              {filteredProducts.length === 0 && searchTerm && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-slate-300 mb-4"><ShoppingCart size={48} /></div>
                  <p className="text-slate-500 font-medium">No hay productos disponibles</p>
                  <p className="text-slate-400 text-sm">Intenta con otro término de búsqueda o verifica el stock</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProducts.map(product => (
                  <button key={product.id} onClick={() => addToCart(product)}
                    disabled={product.stock_quantity === 0 && product.type !== ProductType.SERVICE}
                    className="flex flex-col items-start text-left p-4 rounded-lg border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all bg-white group disabled:opacity-50 disabled:bg-slate-50">
                    <div className="w-full aspect-square bg-slate-100 rounded-md mb-3 flex items-center justify-center text-slate-300 group-hover:text-blue-400 overflow-hidden">
                      {(product as any).image_url
                        ? <img src={(product as any).image_url} alt={product.name} className="w-full h-full object-cover" />
                        : <Smartphone size={40} />}
                    </div>
                    <h4 className="font-semibold text-slate-800 line-clamp-2">{product.name}</h4>
                    <p className="text-xs text-slate-500 mb-1">{product.sku}</p>
                    <div className={`text-xs font-bold mb-2 ${product.stock_quantity === 0 ? 'text-red-500' : 'text-green-600'}`}>
                      Stock: {product.stock_quantity}
                    </div>
                    <div className="mt-auto w-full flex justify-between items-center">
                      <span className="font-bold text-blue-600">{formatMoney(product.price)}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${product.type === ProductType.SERIALIZED ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {product.type === ProductType.SERIALIZED ? 'IMEI' : 'STD'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Carrito */}
      <div className="w-96 flex flex-col bg-white rounded-xl shadow-lg border border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <ShoppingCart size={20} /> Ticket Actual
          </h2>
          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">{cart.length} Items</span>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <ShoppingCart size={48} className="mb-2 opacity-20" />
              <p>El carrito esta vacio</p>
            </div>
          ) : cart.map((item, idx) => (
            <div key={idx} className="flex gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
              <div className="flex-1">
                <h4 className="text-sm font-medium text-slate-800">{item.product.name}</h4>
                {item.serial_number && <p className="text-xs text-slate-500 font-mono bg-yellow-50 px-1 rounded inline-block">SN: {item.serial_number}</p>}
                <span className="text-xs text-slate-500">{formatMoney(item.price)} x {item.quantity}</span>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="font-bold text-sm">{formatMoney(item.price * item.quantity)}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQuantity(idx, -1)} className="p-1 hover:bg-slate-200 rounded"><Minus size={14} /></button>
                  <button onClick={() => removeFromCart(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200">
          {/* IVA TOGGLE */}
          <button onClick={() => setApplyIva(!applyIva)}
            className={`w-full mb-3 py-2 px-4 rounded-lg text-sm font-medium border-2 transition-all flex items-center justify-between ${
              applyIva && defaultTaxRate > 0 ? 'bg-green-50 border-green-400 text-green-700' : 'bg-slate-50 border-slate-300 text-slate-500'
            }`}>
            <span>IVA {applyIva ? defaultTaxRate : 0}%</span>
            <div className={`w-10 h-5 rounded-full flex items-center transition-all px-0.5 ${applyIva && defaultTaxRate > 0 ? 'bg-green-500 justify-end' : 'bg-slate-300 justify-start'}`}>
              <div className="w-4 h-4 bg-white rounded-full shadow" />
            </div>
          </button>

          {/* ── DESCUENTO GLOBAL ─────────────────────────────────────── */}
          <div className={`mb-3 rounded-lg border-2 transition-all ${clampedDiscount > 0 ? 'bg-orange-50 border-orange-400' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 px-3 py-2">
              <Tag size={15} className={clampedDiscount > 0 ? 'text-orange-500' : 'text-slate-400'} />
              <span className={`text-sm font-medium flex-1 ${clampedDiscount > 0 ? 'text-orange-700' : 'text-slate-600'}`}>
                Descuento
              </span>
              {/* Toggle % / $ */}
              <div className="flex rounded-lg overflow-hidden border border-slate-300 text-xs font-bold">
                <button onClick={() => setDiscountMode('pct')}
                  className={`px-2 py-1 transition-colors ${discountMode === 'pct' ? 'bg-orange-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>%</button>
                <button onClick={() => setDiscountMode('val')}
                  className={`px-2 py-1 transition-colors ${discountMode === 'val' ? 'bg-orange-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>$</button>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 pb-2">
              {/* Campo % */}
              <div className="flex items-center gap-1 flex-1">
                <input type="number" min="0" max="100"
                  value={globalDiscount}
                  onChange={e => handleDiscountPct(e.target.value)}
                  placeholder="0"
                  className={`w-full text-right px-2 py-1 rounded-lg border text-sm font-bold outline-none focus:ring-2 focus:ring-orange-400 ${
                    discountMode === 'pct' ? 'bg-white border-orange-300 text-orange-700' : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`} />
                <span className={`text-sm font-bold w-4 ${clampedDiscount > 0 ? 'text-orange-600' : 'text-slate-400'}`}>%</span>
              </div>
              <span className="text-slate-300 text-xs">=</span>
              {/* Campo valor */}
              <div className="flex items-center gap-1 flex-1">
                <span className={`text-sm font-bold w-3 ${clampedDiscount > 0 ? 'text-orange-600' : 'text-slate-400'}`}>$</span>
                <input type="number" min="0"
                  value={globalDiscountVal}
                  onChange={e => handleDiscountVal(e.target.value)}
                  placeholder="0"
                  className={`w-full text-right px-2 py-1 rounded-lg border text-sm font-bold outline-none focus:ring-2 focus:ring-orange-400 ${
                    discountMode === 'val' ? 'bg-white border-orange-300 text-orange-700' : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`} />
              </div>
            </div>
            {clampedDiscount > 0 && (
              <div className="px-3 pb-2 flex justify-between text-xs text-orange-600 font-medium">
                <span>Ahorro del cliente:</span>
                <span>- {formatMoney(totals.discountAmount)}</span>
              </div>
            )}
          </div>

          {/* TOTALES */}
          <div className="space-y-1 text-sm mb-4">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{formatMoney(totals.subtotalBruto)}</span>
            </div>
            {clampedDiscount > 0 && (
              <div className="flex justify-between text-orange-600 font-medium">
                <span>Descuento ({clampedDiscount}%)</span>
                <span>- {formatMoney(totals.discountAmount)}</span>
              </div>
            )}
            <div className={`flex justify-between ${applyIva && defaultTaxRate > 0 ? 'text-slate-500' : 'text-slate-300'}`}>
              <span>IVA ({applyIva ? defaultTaxRate : 0}%)</span>
              <span>{applyIva && defaultTaxRate > 0 ? formatMoney(totals.tax) : '$ 0'}</span>
            </div>
            <div className="flex justify-between font-bold text-xl text-slate-800 mt-2 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>{formatMoney(totals.total)}</span>
            </div>
          </div>

          <button disabled={cart.length === 0} onClick={() => setIsPaymentModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-3 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2">
            <CreditCard size={20} /> Pagar
          </button>
        </div>
      </div>

      {/* Modal Pago */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-xl text-slate-800">Procesar Pago</h3>
                {shoeRepairLabel && <p className="text-xs text-blue-600 font-semibold mt-0.5">{shoeRepairLabel}</p>}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-sm font-semibold text-slate-600">Abono parcial</span>
                  <div onClick={() => setIsPartialMode(p => !p)}
                    className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${isPartialMode ? 'bg-amber-500' : 'bg-slate-200'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isPartialMode ? 'left-5' : 'left-0.5'}`} />
                  </div>
                </label>
                <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full"><X size={24} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Cliente</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg px-4 py-2" placeholder="Consumidor Final" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CC / NIT</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg px-4 py-2" placeholder="222222222" value={customerDoc} onChange={e => setCustomerDoc(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" className="w-full border border-slate-300 rounded-lg px-4 py-2" placeholder="cliente@email.com" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefono (WhatsApp)</label>
                  <input type="tel" className="w-full border border-slate-300 rounded-lg px-4 py-2" placeholder="300 123 4567" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-8 mb-8">
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-500 mb-2">Resumen de Venta</h4>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 mb-4">
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Subtotal:</span><span>{formatMoney(totals.subtotalBruto)}</span>
                    </div>
                    {clampedDiscount > 0 && (
                      <div className="flex justify-between text-sm text-orange-600 font-semibold">
                        <span>Descuento ({clampedDiscount}%):</span>
                        <span>- {formatMoney(totals.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>IVA {applyIva && defaultTaxRate > 0 ? `(${defaultTaxRate}%)` : ''}:</span>
                      <span>{applyIva && defaultTaxRate > 0 ? formatMoney(totals.tax) : '$ 0'}</span>
                    </div>
                    <div className="flex justify-between font-bold text-xl text-slate-800 pt-2 border-t border-slate-200">
                      <span>TOTAL:</span>
                      <span className="text-blue-700">{formatMoney(totals.total)}</span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">Pagos Agregados</h5>
                    {payments.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">Sin pagos registrados</p>
                    ) : payments.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-sm mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold bg-slate-200 px-2 rounded">
                            {p.method === 'CASH' ? '💵 Efectivo' : p.method === 'CARD' ? '💳 Tarjeta' : p.method === 'TRANSFER' ? '🏛️ Transf.' : p.method === 'PAYPAL' ? '🅿️ PayPal' : p.method === 'CREDIT' ? '⏳ Crédito' : p.method}
                          </span>
                          <span className="font-mono">{formatMoney(p.amount)}</span>
                        </div>
                        <button onClick={() => removePayment(idx)} className="text-red-500"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between font-bold text-sm">
                      <span>{isPartialMode ? 'Abonado:' : totals.remaining < -1 ? 'Vuelto:' : 'Restante:'}</span>
                      <span className={isPartialMode ? 'text-amber-600' : totals.remaining > 100 ? 'text-red-600' : 'text-green-600'}>
                        {isPartialMode
                          ? `${formatMoney(totals.totalPaid)} de ${formatMoney(totals.total)}`
                          : totals.remaining < -1
                            ? formatMoney(Math.abs(totals.remaining))
                            : formatMoney(totals.remaining)}
                      </span>
                    </div>
                    {!isPartialMode && totals.remaining < -1 && (
                      <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200 text-xs text-green-700 font-semibold">
                        💵 Entregar {formatMoney(Math.abs(totals.remaining))} de vuelto al cliente
                      </div>
                    )}
                    {isPartialMode && totals.remaining > 0 && (
                      <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700 font-semibold">
                        ⏳ Saldo pendiente: {formatMoney(totals.remaining)} → quedará en Cartera/CxC
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <h4 className="text-sm font-bold text-slate-500">Agregar Metodo</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.TRANSFER, PaymentMethod.CREDIT].map(m => (
                      <button key={m} onClick={() => setCurrentPaymentMethod(m)}
                        className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${currentPaymentMethod === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400'}`}>
                        {m === 'CASH' ? 'Efectivo' : m === 'CARD' ? 'Tarjeta' : m === 'CREDIT' ? 'Credito' : 'Transf.'}
                      </button>
                    ))}
                    {paypalEnabled && (
                      <button onClick={() => {
                        setPaypalAmount(Math.round(totals.remaining > 0 ? totals.remaining : totals.total));
                        setShowPaypalModal(true);
                      }}
                        className="py-2 px-3 rounded-lg border text-sm font-medium transition-all bg-[#0070BA] text-white border-[#0070BA] hover:bg-[#005ea6] flex items-center justify-center gap-1.5 col-span-2">
                        <span className="font-black tracking-tight">Pay</span><span className="font-light tracking-tight">Pal</span>
                        <span className="opacity-80 text-xs ml-1">— {formatMoney(Math.round(totals.remaining > 0 ? totals.remaining : totals.total))}</span>
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input type="number" className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-lg font-bold" placeholder="0"
                      value={currentPaymentAmount}
                      onChange={e => setCurrentPaymentAmount(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addPayment()} />
                    <button onClick={addPayment} className="bg-slate-800 text-white px-4 rounded-lg hover:bg-slate-900"><Plus /></button>
                  </div>
                  {/* FIX: redondear remaining para evitar errores de punto flotante */}
                  <button onClick={() => setCurrentPaymentAmount(Math.round(Math.max(0, totals.remaining)).toString())}
                    className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded font-medium">
                    Todo Restante
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsPaymentModalOpen(false)} className="px-6 py-3 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-white">
                Cancelar
              </button>
              <button onClick={handleFinalizeSale}
                disabled={isPartialMode ? totals.totalPaid <= 0 : totals.remaining > 100}
                className="px-6 py-3 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 disabled:bg-slate-300 flex items-center gap-2">
                <Printer size={20} /> {isPartialMode && totals.remaining > 100 ? 'Facturar con Abono' : 'Facturar e Imprimir'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ══════════════════════════════════════════════════════════════
          MODAL: PESO MANUAL — cuando no hay balanza serial
      ══════════════════════════════════════════════════════════════ */}
      {showWeightModal && pendingWeighable && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Scale size={18} className="text-green-600" />
                <div>
                  <h3 className="font-bold text-slate-800">{pendingWeighable.name}</h3>
                  <p className="text-xs text-slate-500">{formatMoney((pendingWeighable as any).price_per_unit || pendingWeighable.price)} / kg</p>
                </div>
              </div>
              <button onClick={() => { setShowWeightModal(false); setPendingWeighable(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">
                  {scaleConnected ? '📡 Peso leído de balanza' : '⌨️ Ingresa el peso manualmente'}
                </label>
                {scaleConnected && scaleWeight ? (
                  <div className="bg-green-50 border-2 border-green-300 rounded-xl px-4 py-3 text-center">
                    <p className="text-3xl font-black text-green-700">{scaleWeight.toFixed(3)} kg</p>
                    <p className="text-xs text-green-500 mt-0.5">Peso estable leído de la balanza</p>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="number" step="0.001" min="0.001" autoFocus
                      value={manualWeight}
                      onChange={e => setManualWeight(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (parseFloat(manualWeight) > 0)) {
                          addWeighableToCart(pendingWeighable, parseFloat(manualWeight));
                        }
                      }}
                      placeholder="0.000"
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-2xl font-black text-center text-slate-800 focus:outline-none focus:border-green-400 focus:ring-0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">kg</span>
                  </div>
                )}
              </div>
              {/* Precio calculado en tiempo real */}
              {(() => {
                const w = scaleConnected && scaleWeight ? scaleWeight : parseFloat(manualWeight) || 0;
                const pricePerKg = (pendingWeighable as any).price_per_unit || pendingWeighable.price;
                const total = w * pricePerKg;
                return w > 0 ? (
                  <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between">
                    <div className="text-sm text-slate-600">
                      <span className="font-mono">{w.toFixed(3)} kg</span>
                      <span className="mx-2 text-slate-400">×</span>
                      <span>{formatMoney(pricePerKg)}/kg</span>
                    </div>
                    <span className="text-xl font-black text-blue-700">{formatMoney(Math.round(total))}</span>
                  </div>
                ) : null;
              })()}
              <div className="flex gap-3">
                <button onClick={() => { setShowWeightModal(false); setPendingWeighable(null); }}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const w = scaleConnected && scaleWeight ? scaleWeight : parseFloat(manualWeight);
                    if (!w || w <= 0) { toast.error('Ingresa un peso válido'); return; }
                    addWeighableToCart(pendingWeighable, w);
                  }}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 flex items-center justify-center gap-2">
                  <ShoppingCart size={16} /> Agregar al carrito
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: CONFIGURAR BALANZA
      ══════════════════════════════════════════════════════════════ */}
      {showScaleConfig && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Scale size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-800">Configurar Balanza</h3>
              </div>
              <button onClick={() => setShowScaleConfig(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-500">Selecciona cómo está conectada tu balanza al computador:</p>

              {/* Opción 1: Serial / USB */}
              <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50">
                <div className="flex items-center gap-2 mb-2">
                  <Usb size={16} className="text-blue-600" />
                  <p className="font-bold text-blue-800">Puerto Serial / USB COM</p>
                  <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Recomendado</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Compatible con DIBAL, DIGI, Toledo, Mettler y cualquier balanza que use RS-232 o USB serial. Requiere Chrome o Edge.</p>
                <button onClick={() => { connectScaleSerial(); setShowScaleConfig(false); }}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700">
                  Conectar por serial
                </button>
              </div>

              {/* Opción 2: Código de barras */}
              <div className="border-2 border-emerald-200 rounded-xl p-4 bg-emerald-50">
                <div className="flex items-center gap-2 mb-2">
                  <Barcode size={16} className="text-emerald-600" />
                  <p className="font-bold text-emerald-800">Balanza con impresora de etiquetas</p>
                </div>
                <p className="text-xs text-slate-500 mb-3">La balanza imprime etiquetas con código EAN-13. El escáner lee la etiqueta y el POS detecta automáticamente el producto y el peso. No requiere conexión directa.</p>
                <button onClick={() => { setScaleProtocol('barcode'); setScaleConnected(true); setShowScaleConfig(false); toast.success('✅ Modo etiqueta activado. Escanea las etiquetas de tu balanza.'); }}
                  className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700">
                  Activar modo etiqueta
                </button>
              </div>

              {/* Opción 3: Peso manual */}
              <div className="border-2 border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Scale size={16} className="text-slate-600" />
                  <p className="font-bold text-slate-700">Sin balanza / Ingreso manual</p>
                </div>
                <p className="text-xs text-slate-500 mb-3">El cajero escribe el código PLU del producto y luego ingresa el peso a mano. Útil si no tienes balanza conectada.</p>
                <button onClick={() => { setScaleProtocol('manual'); setScaleConnected(false); setShowScaleConfig(false); toast('Modo manual activado'); }}
                  className="w-full py-2.5 bg-slate-600 text-white rounded-xl font-bold text-sm hover:bg-slate-700">
                  Usar modo manual
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs text-amber-700 font-medium">💡 Tip: Para el modo serial necesitas Chrome o Edge en Windows/Mac/Linux. En Chrome, activa la bandera <code>chrome://flags/#enable-experimental-web-platform-features</code> si el puerto no aparece.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PAYPAL ──────────────────────────────────────────────── */}
      {showPaypalModal && paypalConfig && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-[#0070BA] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-white font-black text-xl tracking-tight">Pay</span>
                <span className="text-white font-light text-xl tracking-tight">Pal</span>
              </div>
              <button onClick={() => setShowPaypalModal(false)} className="text-white/70 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center">
                <p className="text-slate-500 text-sm">Monto a cobrar</p>
                <p className="text-3xl font-black text-slate-900">{formatMoney(paypalAmount)}</p>
              </div>
              <div id="paypal-button-container" className="min-h-[50px]">
                {paypalLoading && (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-6 h-6 border-2 border-[#0070BA] border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2 text-sm text-slate-500">Cargando PayPal...</span>
                  </div>
                )}
              </div>
              <PayPalCheckout
                clientId={paypalConfig.client_id}
                env={paypalConfig.env || 'production'}
                amount={paypalAmount}
                currency="USD"
                onApprove={(orderId: string) => {
                  setPayments(prev => [...prev, { method: PaymentMethod.PAYPAL, amount: paypalAmount }]);
                  setShowPaypalModal(false);
                  toast.success(`✅ Pago PayPal aprobado (${orderId})`);
                }}
                onError={() => { toast.error('Error en el pago PayPal'); }}
                setLoading={setPaypalLoading}
              />
              <p className="text-xs text-slate-400 text-center">El pago se procesa directamente en PayPal. POSmaster no almacena datos de tarjetas.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;