import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search, ShoppingCart, Banknote, Barcode, Zap,
  ChefHat, Beer, UtensilsCrossed, Scale, Smartphone, Pizza,
} from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Product, ProductType, PaymentMethod, Sale } from '../types';
import { useCurrency } from '../contexts/CurrencyContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useCart } from '../hooks/useCart';
import { usePOSDiscount } from '../hooks/usePOSDiscount';
import { usePOSPayment } from '../hooks/usePOSPayment';
import { useScaleIntegration, decodeWeighableBarcode } from '../hooks/useScaleIntegration';

import RefreshButton from '../components/RefreshButton';
import InvoiceModal from '../components/InvoiceModal';
import { VariantSelector } from '../components/VariantManager';
import CartSidebar from '../components/POS/CartSidebar';
import PaymentModal from '../components/POS/PaymentModal';
import { WeightModal, ScaleConfigModal } from '../components/POS/ScaleModals';
import { supabase } from '../supabaseClient';

// ── Apertura automática del cajón al facturar ─────────────────────────────
const ESC_POS_OPEN_DRAWER = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);

const autoOpenDrawer = async () => {
  try {
    const raw = localStorage.getItem('posmaster_drawer_config');
    if (!raw) return;
    const config = JSON.parse(raw);
    const protocol = config.protocol || 'escpos-usb';
    if (protocol === 'escpos-usb') {
      if (!('usb' in navigator)) return;
      const devices = await (navigator as any).usb.getDevices();
      if (devices.length === 0) return;
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
      const html = `<html><head><style>body{margin:0}</style><script>window.onload=function(){document.title='${printer ? `\\\\\\\\localhost\\\\${printer}` : ''}';window.print();setTimeout(function(){window.close();},500);};</sc` + `ript></head><body><p style="font-size:1px;color:white;">.</p></body></html>`;
      const w = window.open('', '_blank', 'width=1,height=1,top=-100,left=-100');
      if (w) w.document.write(html);
    }
  } catch { /* silencioso */ }
};

// ─────────────────────────────────────────────────────────────────────────────

const POS: React.FC = () => {
  const { formatMoney } = useCurrency();
  const { products, session, processSale, company, refreshAll, userRole } = useDatabase();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // ── Fullscreen para cajero ────────────────────────────────────────────────
  const isCashier = userRole === 'CASHIER' || userRole === 'STAFF';
  useEffect(() => {
    if (!isCashier) return;
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    return () => { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); };
  }, [isCashier]);

  // ── Config empresa ────────────────────────────────────────────────────────
  const defaultTaxRate = company?.config?.tax_rate ?? 19;
  const [applyIva, setApplyIva] = useState(true);
  const paypalConfig = (company?.config as any)?.payment_providers?.paypal;
  const paypalEnabled = paypalConfig?.enabled && paypalConfig?.client_id;
  const [showPaypalModal, setShowPaypalModal] = useState(false);
  const [paypalLoading, setPaypalLoading] = useState(false);
  const [paypalAmount, setPaypalAmount] = useState(0);

  // ── Tipo de negocio ───────────────────────────────────────────────────────
  const businessTypes: string[] = Array.isArray((company?.config as any)?.business_types)
    ? (company?.config as any).business_types
    : (company?.config as any)?.business_type ? [(company?.config as any).business_type] : ['general'];

  const isZapateria    = businessTypes.includes('zapateria');
  const isRestaurante  = businessTypes.some(t => ['restaurante', 'restaurant', 'cocina', 'cafeteria'].includes(t));
  const isFarmacia     = businessTypes.includes('farmacia');
  const isVeterinaria  = businessTypes.includes('veterinaria');
  const isOdontologia  = businessTypes.includes('odontologia');
  const isOptometria   = businessTypes.includes('optometria');
  const isSalon        = businessTypes.some(t => ['salon', 'salón', 'belleza'].includes(t));
  const isSupermercado = businessTypes.some(t => ['supermercado', 'abarrotes', 'mercado'].includes(t));
  const isLavadero     = businessTypes.includes('lavadero');
  const isServiceBusiness = isZapateria || isSalon || isVeterinaria || isOdontologia || isOptometria;
  const isGimnasio  = businessTypes.some(t => ['gimnasio', 'gym'].includes(t));
  const isPanaderia = businessTypes.some(t => ['panaderia', 'panadería', 'bakery'].includes(t));

  const [searchTerm, setSearchTerm] = useState('');

  // ── Hooks de lógica ───────────────────────────────────────────────────────
  const { cart, setCart, variantPending, setVariantPending, addToCart, updateQuantity, updatePrice, removeFromCart, clearCart, addVirtualItem } = useCart({ sessionStatus: session?.status, defaultTaxRate });

  const subtotalBrutoPreview = useMemo(() => {
    const bruto = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const prodDesc = cart.reduce((s, i) => s + (i.discount || 0) * i.quantity, 0);
    return bruto - prodDesc;
  }, [cart]);

  const { discountMode, setDiscountMode, globalDiscount, globalDiscountVal, clampedDiscount, handleDiscountPct, handleDiscountVal, resetDiscount } = usePOSDiscount(subtotalBrutoPreview);

  const { payments, setPayments, currentPaymentAmount, setCurrentPaymentAmount, currentPaymentMethod, setCurrentPaymentMethod, isPartialMode, setIsPartialMode, shoeRepairId, setShoeRepairId, shoeRepairLabel, setShoeRepairLabel, addPayment, removePayment, resetPayments, addPaypalPayment } = usePOSPayment();

  const { scaleWeight, scaleConnected, scaleProtocol, showScaleConfig, setShowScaleConfig, showWeightModal, setShowWeightModal, pendingWeighable, setPendingWeighable, manualWeight, setManualWeight, connectScaleSerial, disconnectScale, activateBarcodeMode, activateManualMode, resetScaleWeight } = useScaleIntegration();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  // ── Datos menú / farmacia / especialidad ──────────────────────────────────
  const [menuItems, setMenuItems]   = useState<any[]>([]);
  const [beverages, setBeverages]   = useState<any[]>([]);
  const [pizzaSummary, setPizzaSummary] = useState<any[]>([]);
  const [selectedPizzaSlices, setSelectedPizzaSlices] = useState<Record<string, number[]>>({});
  const [menuTab, setMenuTab]       = useState<'platos' | 'bebidas' | 'pizzas'>('platos');
  const [pharmaMeds, setPharmaMeds] = useState<any[]>([]);
  const [pharmaLoading, setPharmaLoading] = useState(false);
  const [specialtyServices, setSpecialtyServices] = useState<any[]>([]);

  const [customerName,  setCustomerName]  = useState('');
  const [customerDoc,   setCustomerDoc]   = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // ── PIZZA STOCK HELPER ────────────────────────────────────────────────────
  /**
   * Extrae el pizza_type_id de un product.id virtual de pizza.
   * Formato: "pizza-{typeId}-slice" o "pizza-{typeId}-whole"
   */
  const extractPizzaTypeId = (productId: string): string | null => {
    if (!productId.startsWith('pizza-')) return null;
    const withoutPrefix = productId.slice('pizza-'.length);
    if (withoutPrefix.endsWith('-slice')) return withoutPrefix.slice(0, -'-slice'.length);
    if (withoutPrefix.endsWith('-whole')) return withoutPrefix.slice(0, -'-whole'.length);
    return null;
  };

  /**
   * Devuelve N porciones al stock cuando se elimina/reduce un ítem de pizza del carrito.
   * Solo actúa si el productId termina en "-slice".
   */
  const returnPizzaSlicesToStock = useCallback(async (productId: string, qty: number) => {
    if (!productId.startsWith('pizza-') || !productId.endsWith('-slice')) return;
    const typeId = extractPizzaTypeId(productId);
    if (!typeId || !company?.id) return;

    const { data: openRows } = await supabase
      .from('pizza_stock').select('id, slices_sold')
      .eq('pizza_type_id', typeId).eq('status', 'OPEN')
      .order('opened_at').limit(1);

    if (openRows?.[0]) {
      const newSold = Math.max(0, openRows[0].slices_sold - qty);
      await supabase.from('pizza_stock')
        .update({ slices_sold: newSold })
        .eq('id', openRows[0].id);
    }

    // Refrescar resumen visual
    try {
      const { data } = await supabase.from('pizza_stock_summary').select('*')
        .eq('company_id', company.id).gt('slices_available', 0);
      setPizzaSummary(data || []);
    } catch { /* ok */ }
  }, [company?.id]);

  /**
   * Wrapper de removeFromCart que devuelve el stock de porciones de pizza
   * antes de eliminar el ítem del carrito.
   */
  const removeFromCartWithStockReturn = useCallback(async (index: number) => {
  const item = cart[index];
  if (!item) { removeFromCart(index); return; }

  const productId = item.product?.id || '';
  if (productId.startsWith('pizza-') && productId.endsWith('-slice')) {
    await returnPizzaSlicesToStock(productId, item.quantity);
  }
  removeFromCart(index);
}, [cart, removeFromCart, returnPizzaSlicesToStock]);


const updateQuantityWithStockSync = useCallback(async (index: number, newQty: number) => {
  const item = cart[index];
  if (!item) { updateQuantity(index, newQty); return; }

  const productId = item.product?.id || '';

  if (productId.startsWith('pizza-') && productId.endsWith('-slice')) {
    // newQty <= 0 significa eliminación total — devolver todas las porciones
    const delta = newQty <= 0 ? -item.quantity : newQty - item.quantity;
    if (delta !== 0) {
      const typeId = extractPizzaTypeId(productId);
      if (typeId) {
        const { data: openRows } = await supabase
          .from('pizza_stock').select('id, slices_sold')
          .eq('pizza_type_id', typeId).eq('status', 'OPEN')
          .order('opened_at').limit(1);
        if (openRows?.[0]) {
          const newSold = Math.max(0, openRows[0].slices_sold + delta);
          await supabase.from('pizza_stock')
            .update({ slices_sold: newSold })
            .eq('id', openRows[0].id);
        }
        try {
          const { data } = await supabase.from('pizza_stock_summary').select('*')
            .eq('company_id', company?.id).gt('slices_available', 0);
          setPizzaSummary(data || []);
        } catch { /* ok */ }
      }
    }
  }
  updateQuantity(index, newQty);
}, [cart, updateQuantity, company?.id]);

const clearCartWithStockReturn = useCallback(async () => {
  const pizzaSliceItems = cart.filter(i =>
    (i.product?.id || '').startsWith('pizza-') &&
    (i.product?.id || '').endsWith('-slice')
  );
  await Promise.all(
    pizzaSliceItems.map(i => returnPizzaSlicesToStock(i.product.id, i.quantity))
  );
  clearCart();
}, [cart, clearCart, returnPizzaSlicesToStock]);

  // ── Carga de menú / farmacia / especialidad ───────────────────────────────
  const loadRestaurantMenu = useCallback(async () => {
    if (!company?.id || !isRestaurante) return;
    const [menuRes, bevRes] = await Promise.all([
      supabase.from('rest_menu_items').select('*, rest_menu_categories(name,icon)').eq('company_id', company.id).eq('is_active', true).eq('is_available', true).order('name'),
      supabase.from('rest_beverages').select('*').eq('company_id', company.id).eq('is_active', true).order('name'),
    ]);
    if (menuRes.data) setMenuItems(menuRes.data);
    if (bevRes.data)  setBeverages(bevRes.data);
    try {
      const { data: pizzas } = await supabase
        .from('pizza_stock_summary').select('*')
        .eq('company_id', company.id).gt('slices_available', 0);
      setPizzaSummary(pizzas || []);
    } catch { setPizzaSummary([]); }
  }, [company?.id, isRestaurante]);

  const loadPharmaMeds = useCallback(async () => {
    if (!company?.id || !isFarmacia) return;
    setPharmaLoading(true);
    const { data } = await supabase.from('pharma_medications').select('*').eq('company_id', company.id).eq('is_active', true).gt('stock_total', 0).order('name');
    if (data) setPharmaMeds(data);
    setPharmaLoading(false);
  }, [company?.id, isFarmacia]);

  const loadSpecialtyServices = useCallback(async () => {
    if (!company?.id) return;
    const hasSpecialty = isVeterinaria || isOdontologia || isSalon || isLavadero || isOptometria;
    if (!hasSpecialty) return;

    if (isLavadero) {
      const { data } = await supabase
        .from('lavadero_servicios')
        .select('id, nombre, precio, categoria, tipo_vehiculo, descripcion, is_active')
        .eq('company_id', company.id).eq('is_active', true)
        .order('tipo_vehiculo').order('precio');
      if (data) setSpecialtyServices(data.map(s => ({ ...s, nombre: s.nombre, precio: Number(s.precio) || 0 })));
      return;
    }
    if (isSalon) {
      const { data } = await supabase
        .from('salon_servicios')
        .select('id, nombre, name, price, category, duration_minutes, activo, is_active')
        .eq('company_id', company.id);
      if (data) setSpecialtyServices(
        data.filter(s => s.activo === true || s.is_active === true)
          .map(s => ({ ...s, nombre: s.nombre || s.name || '', precio: Number(s.price) || 0 }))
      );
      return;
    }
    if (isVeterinaria) {
      const { data } = await supabase
        .from('vet_servicios')
        .select('id, nombre, precio, categoria, activo, is_active')
        .eq('company_id', company.id);
      if (data) setSpecialtyServices(
        data.filter(s => s.activo === true || s.is_active === true)
          .map(s => ({ ...s, precio: Number(s.precio) || 0 }))
      );
      return;
    }
    if (isOdontologia) {
      const { data } = await supabase
        .from('odonto_servicios')
        .select('id, nombre, precio, activo')
        .eq('company_id', company.id).eq('activo', true).order('nombre');
      if (data) setSpecialtyServices(data.map(s => ({ ...s, precio: Number(s.precio) || 0 })));
      return;
    }
    if (isOptometria) {
      const { data } = await supabase
        .from('opto_servicios')
        .select('id, nombre, precio, categoria, activo')
        .eq('company_id', company.id).eq('activo', true).order('nombre');
      if (data) setSpecialtyServices(data.map(s => ({ ...s, precio: Number(s.precio) || 0 })));
      return;
    }
    if (isGimnasio) {
      const [memRes, supRes] = await Promise.all([
        supabase.from('gym_membership_types').select('id, name, price, is_active').eq('company_id', company.id).eq('is_active', true).order('name'),
        supabase.from('gym_supplements').select('id, name, price, sku, stock_quantity, category, is_active').eq('company_id', company.id).eq('is_active', true).gt('stock_quantity', 0).order('name'),
      ]);
      const membresias  = (memRes.data || []).map(m => ({ ...m, nombre: `🏋️ ${m.name}`, precio: Number(m.price) || 0 }));
      const suplementos = (supRes.data || []).map(s => ({ ...s, nombre: `💊 ${s.name}`, precio: Number(s.price) || 0 }));
      setSpecialtyServices([...membresias, ...suplementos]);
      return;
    }
    if (isPanaderia) {
      const { data } = await supabase
        .from('bakery_products')
        .select('id, name, is_active, category')
        .eq('company_id', company.id).eq('is_active', true).order('name');
      if (data) setSpecialtyServices(data.map(s => ({ ...s, nombre: s.name || '', precio: 0 })));
      return;
    }
  }, [company?.id, isVeterinaria, isOdontologia, isSalon, isLavadero, isOptometria, isGimnasio, isPanaderia]);

  useEffect(() => { loadRestaurantMenu(); },    [loadRestaurantMenu]);
  useEffect(() => { loadPharmaMeds(); },        [loadPharmaMeds]);
  useEffect(() => { loadSpecialtyServices(); }, [loadSpecialtyServices]);

  // ── Prefill desde URL ─────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shoeId = params.get('shoe'); const salonId = params.get('salon'); const vetId = params.get('vet');
    const sourceId = shoeId || salonId || vetId;

    const returnUrlParam = params.get('returnUrl');
    if (returnUrlParam) setReturnUrl(decodeURIComponent(returnUrlParam));

    if (!sourceId) return;
    const isShoe = !!shoeId; const isSalon_ = !!salonId;
    setShoeRepairId(sourceId);
    setCustomerName(params.get('cliente') || ''); setCustomerDoc(params.get('cedula') || '');
    setCustomerPhone(params.get('tel') || ''); setCustomerEmail(params.get('email') || '');
    const servicioNombre = params.get('servicio') || (isShoe ? 'Reparación de calzado' : isSalon_ ? 'Servicio de salón' : 'Servicio veterinario');
    const emoji = isShoe ? '🔧' : isSalon_ ? '✂️' : '🐾';
    const sku   = isShoe ? 'ZAP' : isSalon_ ? 'SAL' : 'VET';
    setShoeRepairLabel(`${emoji} ${params.get('ticket') || sourceId.slice(0,8).toUpperCase()} — ${servicioNombre}`);
    const total = parseFloat(params.get('total') || '0');
    const abono = parseFloat(params.get('abono') || '0');
    const virtualService: any = { product: { id: `${sku.toLowerCase()}-${sourceId}`, name: servicioNombre, price: total, type: 'SERVICE', sku: `${sku}-${sourceId.slice(0,6)}`, stock_quantity: 999, tax_rate: 0 }, quantity: 1, price: total, tax_rate: 0, discount: 0 };
    setCart([virtualService]); setApplyIva(false);
    if (abono > 0) { setIsPartialMode(true); setPayments([{ method: PaymentMethod.CASH, amount: abono }]); }
    setTimeout(() => setIsPaymentModalOpen(true), 700);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ── Prefill desde cotización ──────────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem('pos_prefill_quote');
    if (!raw || !products.length) return;
    try {
      const prefill = JSON.parse(raw);
      sessionStorage.removeItem('pos_prefill_quote');
      const newCart: any[] = (prefill.items || []).map((item: any) => {
        const real = products.find((p) => p.id === item.product_id);
        const vp: any = real || { id: item.product_id || 'quote-' + Math.random(), name: item.description, price: item.price, cost: 0, type: 'SERVICE', sku: 'COT', stock_quantity: 999, tax_rate: item.tax_rate ?? 0 };
        return { product: vp, quantity: item.quantity ?? 1, price: item.price, tax_rate: item.tax_rate ?? 0, discount: item.discount ?? 0 };
      });
      if (newCart.length > 0) { setCart(newCart); toast.success('Cotizacion ' + prefill.quote_number + ' cargada en el carrito', { duration: 4000 }); }
    } catch (e) { console.error('prefill error', e); }
  }, [products]);

  // ── Prefill desde pedido B2B ──────────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem('pos_prefill_b2b');
    if (!raw || !products.length) return;
    try {
      const prefill = JSON.parse(raw);
      sessionStorage.removeItem('pos_prefill_b2b');
      const newCart: any[] = (prefill.items || []).map((item: any) => {
        const real = products.find((p) => p.id === item.product_id);
        const vp: any = real || { id: item.product_id || 'b2b-' + Math.random(), name: item.description, price: item.price, cost: 0, type: 'STANDARD', sku: 'B2B', stock_quantity: 999, tax_rate: 0 };
        return { product: vp, quantity: item.quantity ?? 1, price: item.price, tax_rate: 0, discount: 0 };
      });
      if (newCart.length > 0) {
        setCart(newCart);
        toast.success(`🛒 Pedido B2B ${prefill.order_number} de ${prefill.buyer_name} cargado · Total: $${prefill.total_amount?.toLocaleString('es-CO')}`, { duration: 6000 });
      }
    } catch (e) { console.error('b2b prefill error', e); }
  }, [products]);

  // ── Escáner de barras ─────────────────────────────────────────────────────
  const { isScanning } = useBarcodeScanner((barcode) => {
    const product = products.find((p) => p.sku.toLowerCase() === barcode.toLowerCase());
    if (product) { addToCart(product); setSearchTerm(''); }
    else toast.error(`Producto con SKU "${barcode}" no encontrado`);
  });

  useEffect(() => {
    if (session?.status === 'OPEN' && !isPaymentModalOpen && !showInvoice) searchInputRef.current?.focus();
  }, [session, isPaymentModalOpen, showInvoice, cart]);

  // ── Totales ───────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const subtotalBruto      = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const productDiscounts   = cart.reduce((acc, item) => acc + (item.discount || 0) * item.quantity, 0);
    const subtotalPostProd   = subtotalBruto - productDiscounts;
    const globalDiscountAmt  = subtotalPostProd * (clampedDiscount / 100);
    const discountAmount     = productDiscounts + globalDiscountAmt;
    const subtotal           = subtotalBruto - discountAmount;
    const tax                = applyIva ? subtotal * (defaultTaxRate / 100) : 0;
    const total              = subtotal + tax;
    const totalPaid          = payments.reduce((acc, p) => acc + p.amount, 0);
    const remaining          = total - totalPaid;
    return { subtotalBruto, discountAmount, subtotal, tax, total, totalPaid, remaining };
  }, [cart, payments, applyIva, defaultTaxRate, clampedDiscount]);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (isRestaurante || isFarmacia || isVeterinaria || isOdontologia || isOptometria || isSalon || isLavadero) return [];
    return products.filter((p) => {
      if (isZapateria && p.type !== 'SERVICE') return false;
      return ((p.stock_quantity ?? 0) > 0 || p.type === 'SERVICE') && (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [searchTerm, products, isZapateria, isRestaurante, isFarmacia, isVeterinaria, isOdontologia, isSalon]);
  const filteredMenuItems         = useMemo(() => menuItems.filter((i) => !searchTerm || i.name.toLowerCase().includes(searchTerm.toLowerCase())), [menuItems, searchTerm]);
  const filteredBeverages         = useMemo(() => beverages.filter((b) => !searchTerm || b.name.toLowerCase().includes(searchTerm.toLowerCase())), [beverages, searchTerm]);
  const filteredPharmaMeds        = useMemo(() => pharmaMeds.filter((m) => !searchTerm || m.name.toLowerCase().includes(searchTerm.toLowerCase()) || (m.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) || (m.barcode || '').includes(searchTerm)), [pharmaMeds, searchTerm]);
  const filteredSpecialtyServices = useMemo(() => specialtyServices.filter((s) => !searchTerm || s.nombre.toLowerCase().includes(searchTerm.toLowerCase())), [specialtyServices, searchTerm]);

  // ── Adders virtuales ──────────────────────────────────────────────────────
  const addMenuItemToCart         = (item: any) => addVirtualItem('menu',   item.id, item.name,  item.price);
  const addBeverageToCart         = (bev:  any) => { if (bev.stock <= 0) { toast.error('Bebida sin stock'); return; } addVirtualItem('bev', bev.id, `${bev.name} (${bev.presentation})`, bev.price, bev.stock); };
  const addPharmaToCart           = (med:  any) => { if (med.stock_total <= 0) { toast.error('Sin stock'); return; } addVirtualItem('pharma', med.id, med.name, med.price, med.stock_total); };
  const addSpecialtyServiceToCart = (svc:  any) => addVirtualItem('svc', svc.id, svc.nombre, svc.precio);

  const addPizzaToCart = async (pizza: any, qty: number, type: 'whole' | 'slice') => {
    const unitPrice = type === 'whole' ? pizza.price : Math.round(pizza.price / pizza.slices);
    const name = type === 'whole'
      ? `🍕 ${pizza.name} — completa`
      : `🍕 ${pizza.name} × ${qty} porción${qty > 1 ? 'es' : ''}`;
    addVirtualItem('pizza', `${pizza.pizza_type_id}-${type}`, name, unitPrice);

    // Descontar porciones del stock (solo para porciones, no pizza completa)
    if (type === 'slice') {
      const { data: openRows } = await supabase
        .from('pizza_stock').select('id, slices_sold')
        .eq('pizza_type_id', pizza.pizza_type_id).eq('status', 'OPEN')
        .order('opened_at').limit(1);
      if (openRows?.[0]) {
        await supabase.from('pizza_stock')
          .update({ slices_sold: openRows[0].slices_sold + qty })
          .eq('id', openRows[0].id);
      }
    }
    setSelectedPizzaSlices(prev => ({ ...prev, [pizza.pizza_type_id]: [] }));
    try {
      const { data } = await supabase.from('pizza_stock_summary').select('*')
        .eq('company_id', company?.id).gt('slices_available', 0);
      setPizzaSummary(data || []);
    } catch { /* ok */ }
    toast.success(name);
  };

  // ── Balanza ───────────────────────────────────────────────────────────────
  const addWeighableToCart = (product: Product, weightKg: number) => {
    if (session?.status !== 'OPEN') { toast.error('Debe abrir la caja primero'); return; }
    const pricePerUnit = (product as any).price_per_unit || product.price;
    const linePrice = Math.round(pricePerUnit * weightKg);
    const existing = cart.find((i) => i.product.id === product.id);
    if (existing) {
      setCart(cart.map((i) => i.product.id === product.id ? { ...i, weight_kg: (i.weight_kg || 0) + weightKg, quantity: 1, price: Math.round(pricePerUnit * ((i.weight_kg || 0) + weightKg)) } : i));
    } else {
      setCart([...cart, { product, quantity: 1, weight_kg: weightKg, price: linePrice, tax_rate: defaultTaxRate, discount: 0 }]);
    }
    toast.success(`🥬 ${product.name} · ${weightKg.toFixed(3)} kg · $${linePrice.toLocaleString('es-CO')}`);
    setShowWeightModal(false); setManualWeight(''); setPendingWeighable(null);
    if (scaleProtocol === 'serial') resetScaleWeight();
  };

  const findWeighableByPlu = (term: string): Product | null => {
    const t = term.toUpperCase().trim();
    return (products as any[]).find((p) => p.type === 'WEIGHABLE' && ((p.plu_code && p.plu_code.toUpperCase() === t) || p.sku?.toUpperCase() === t || p.name?.toUpperCase().includes(t))) as Product || null;
  };

  const handleWeighableSearch = (term: string): boolean => {
    if (!isSupermercado) return false;
    const decoded = decodeWeighableBarcode(term);
    if (decoded) {
      const product = (products as any[]).find((p) => p.type === 'WEIGHABLE' && (String(p.plu_code) === decoded.plu || String(p.sku).replace(/^0+/, '') === decoded.plu)) as Product;
      if (product) { addWeighableToCart(product, decoded.weightKg); return true; }
    }
    const byPlu = findWeighableByPlu(term);
    if (byPlu) {
      setPendingWeighable(byPlu);
      if (scaleWeight && scaleWeight > 0) addWeighableToCart(byPlu, scaleWeight);
      else { setManualWeight(''); setShowWeightModal(true); }
      return true;
    }
    return false;
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchTerm) {
      if (handleWeighableSearch(searchTerm)) { setSearchTerm(''); return; }
      const exactMatch = products.find((p) => p.sku.toLowerCase() === searchTerm.toLowerCase());
      if (exactMatch) { addToCart(exactMatch); setSearchTerm(''); }
      else if (filteredProducts.length === 1) { addToCart(filteredProducts[0]); setSearchTerm(''); }
    }
  };

  // ── Finalizar venta ───────────────────────────────────────────────────────
  const handleFinalizeSale = async () => {
    if (!isPartialMode && totals.remaining > 100) { toast.error('Debe cubrir el total de la venta o activar modo Abono Parcial'); return; }
    if (isPartialMode && totals.totalPaid <= 0) { toast.error('Ingresa al menos un monto de abono'); return; }

    try {
      const sale = await processSale({
        customer: customerName || 'Consumidor Final', customerDoc, customerEmail, customerPhone,
        items: cart, total: totals.total, subtotal: totals.subtotal, taxAmount: totals.tax,
        applyIva, discountPercent: clampedDiscount, discountAmount: totals.discountAmount,
        amountPaid: totals.totalPaid, shoeRepairId: shoeRepairId || undefined,
        business_type: businessTypes[0] || 'general',
      });

      setLastSale({ ...sale, _cartItems: cart, discountPercent: clampedDiscount, discountAmount: totals.discountAmount } as any);
      setShowInvoice(true);
      if (payments.some((p) => p.method === PaymentMethod.CASH)) autoOpenDrawer();

      // Limpiar sin devolver stock (la venta confirma el descuento)
      clearCart();
      resetPayments(); resetDiscount();
      setCustomerName(''); setCustomerDoc(''); setCustomerEmail(''); setCustomerPhone('');
      setIsPaymentModalOpen(false);

      if (returnUrl) {
        const invoiceId = sale.id;
        const separator = returnUrl.includes('?') ? '&' : '?';
        navigate(`${returnUrl}${separator}invoice_id=${invoiceId}`);
      } else {
        navigate('/pos', { replace: true });
      }
    } catch (err: any) {
      toast.error('Error al facturar: ' + (err?.message || 'Error desconocido'));
    }
  };

  // ── Caja cerrada ──────────────────────────────────────────────────────────
  if (session?.status !== 'OPEN') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-100 rounded-xl border border-dashed border-slate-300">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><Banknote size={32} /></div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Caja Cerrada</h2>
          <p className="text-slate-500 mb-6">Debe realizar la apertura de caja antes de comenzar a vender.</p>
          <Link to="/cash-control" className="inline-block w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors">Ir a Apertura de Caja</Link>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`flex gap-6 relative ${isCashier ? 'h-screen fixed inset-0 z-50 bg-white' : 'h-[calc(100vh-theme(spacing.24))]'}`}>
      <Toaster position="bottom-right" />
      <InvoiceModal isOpen={showInvoice} onClose={() => setShowInvoice(false)} sale={lastSale} company={company} />
      {variantPending && (
        <VariantSelector product={variantPending} formatMoney={formatMoney} onClose={() => setVariantPending(null)}
          onSelect={(variant) => { addToCart(variantPending, variant); setVariantPending(null); }} />
      )}
      {isScanning && (
        <div className="fixed top-4 left-4 flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-2 border-blue-400 rounded-lg animate-pulse z-40">
          <Zap size={16} className="text-blue-600 animate-spin" />
          <span className="text-sm font-medium text-blue-600">Escaneando...</span>
        </div>
      )}

      {/* Catálogo */}
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex gap-2 mb-2">
            <RefreshButton onRefresh={isRestaurante ? loadRestaurantMenu : isFarmacia ? loadPharmaMeds : isServiceBusiness ? loadSpecialtyServices : refreshAll} label="Actualizar" className="text-xs px-2 py-1.5" />
            {isRestaurante && (
              <div className="flex gap-1 ml-auto bg-slate-200 rounded-lg p-0.5">
                {(['platos', 'bebidas', 'pizzas'] as const).map((tab) => (
                  <button key={tab} onClick={() => setMenuTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                      menuTab === tab
                        ? tab === 'platos' ? 'bg-white text-orange-600 shadow-sm'
                        : tab === 'bebidas' ? 'bg-white text-blue-600 shadow-sm'
                        : 'bg-white text-red-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {tab === 'platos'  ? <><UtensilsCrossed size={14}/> Platos</>
                    : tab === 'bebidas' ? <><Beer size={14}/> Bebidas</>
                    : <><Pizza size={14}/> Pizzas{pizzaSummary.length > 0 && <span className="bg-orange-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{pizzaSummary.length}</span>}</>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {isSupermercado && (
            <div className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium mb-1 transition-all ${scaleConnected ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
              <span className={`w-2 h-2 rounded-full ${scaleConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
              {scaleConnected ? (<><Scale size={14} className="text-green-600" /><span>Balanza conectada</span>{scaleWeight !== null && scaleWeight > 0 ? <span className="font-black text-green-800 text-base ml-1">{scaleWeight.toFixed(3)} kg</span> : <span className="text-green-500 text-xs">esperando peso...</span>}<button onClick={disconnectScale} className="ml-auto text-xs text-slate-400 hover:text-red-500">Desconectar</button></>) : (<><Scale size={14} /><span>Sin balanza</span><button onClick={() => setShowScaleConfig(true)} className="ml-auto text-xs text-blue-500 hover:text-blue-700 font-bold">Configurar balanza</button></>)}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input ref={searchInputRef} type="text"
              placeholder={isRestaurante ? 'Buscar plato o bebida...' : isFarmacia ? 'Buscar medicamento, SKU o código de barras...' : isVeterinaria ? 'Buscar servicio veterinario...' : isOdontologia ? 'Buscar servicio odontológico...' : isLavadero ? 'Buscar servicio de lavadero...' : isSalon ? 'Buscar servicio del salón...' : isZapateria ? 'Buscar servicio de zapatería...' : isSupermercado ? 'Código PLU (ej: F1) o escanear etiqueta de balanza...' : 'Escanear Código de Barras / SKU / IMEI...'}
              className="w-full pl-10 pr-12 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleSearchKeyDown} autoFocus />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {isRestaurante ? <ChefHat size={20}/> : isFarmacia ? <span className="text-base">💊</span> : isVeterinaria ? <span className="text-base">🐾</span> : isOdontologia ? <span className="text-base">🦷</span> : isSalon ? <span className="text-base">✂️</span> : <Barcode size={20} />}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {/* Restaurante: platos */}
          {isRestaurante && menuTab === 'platos' && (<>{filteredMenuItems.length === 0 && (<div className="flex flex-col items-center justify-center h-full text-center text-slate-400"><ChefHat size={48} className="mb-2 opacity-20"/><p className="font-medium">No hay platos disponibles</p><p className="text-sm">Crea platos en Cocina → Menú</p></div>)}<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{filteredMenuItems.map((item) => (<button key={item.id} onClick={() => addMenuItemToCart(item)} className="flex flex-col items-start text-left p-4 rounded-lg border border-slate-200 hover:border-orange-400 hover:shadow-md transition-all bg-white group"><div className="w-full aspect-square bg-orange-50 rounded-md mb-3 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform overflow-hidden">{item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover"/> : (item.rest_menu_categories?.icon || '🍽️')}</div><h4 className="font-semibold text-slate-800 line-clamp-2 text-sm">{item.name}</h4>{item.rest_menu_categories && <p className="text-xs text-slate-400 mb-1">{item.rest_menu_categories.icon} {item.rest_menu_categories.name}</p>}{item.description && <p className="text-xs text-slate-400 line-clamp-1 mb-1">{item.description}</p>}<div className="mt-auto flex items-center justify-between w-full"><span className="font-bold text-orange-600">{formatMoney(item.price)}</span><span className="text-[10px] text-slate-400">⏱ {item.prep_time_min} min</span></div></button>))}</div></>)}

          {/* Restaurante: bebidas */}
          {isRestaurante && menuTab === 'bebidas' && (<>{filteredBeverages.length === 0 && (<div className="flex flex-col items-center justify-center h-full text-center text-slate-400"><Beer size={48} className="mb-2 opacity-20"/><p className="font-medium">No hay bebidas disponibles</p><p className="text-sm">Crea bebidas en Cocina → Bebidas</p></div>)}<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{filteredBeverages.map((bev) => { const isLow = bev.stock <= bev.stock_min; return (<button key={bev.id} onClick={() => addBeverageToCart(bev)} disabled={bev.stock <= 0} className={`flex flex-col items-start text-left p-4 rounded-lg border transition-all bg-white group disabled:opacity-50 disabled:cursor-not-allowed ${bev.stock <= 0 ? 'border-red-200 bg-red-50' : isLow ? 'border-amber-300 hover:border-amber-400 hover:shadow-md' : 'border-slate-200 hover:border-blue-400 hover:shadow-md'}`}><div className="w-full aspect-square bg-blue-50 rounded-md mb-3 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">🥤</div><h4 className="font-semibold text-slate-800 line-clamp-2 text-sm">{bev.name}</h4><p className="text-xs text-slate-400 mb-1">{bev.category} · {bev.presentation}</p><div className={`text-xs font-bold mb-2 ${bev.stock <= 0 ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-green-600'}`}>{bev.stock <= 0 ? 'Agotado' : `Stock: ${bev.stock}`}{isLow && bev.stock > 0 && ' ⚠️'}</div><div className="mt-auto w-full"><span className="font-bold text-blue-600">{formatMoney(bev.price)}</span></div></button>); })}</div></>)}

          {/* Pizzas */}
          {isRestaurante && menuTab === 'pizzas' && (
            <>
              {pizzaSummary.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                  <Pizza size={48} className="mb-2 opacity-20"/>
                  <p className="font-medium">No hay pizzas disponibles</p>
                  <p className="text-sm">Ábrelas en Cocina → Pizzas</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pizzaSummary.map((pizza: any) => {
                    const selected = selectedPizzaSlices[pizza.pizza_type_id] || [];
                    const soldSlices = pizza.slices - pizza.slices_available;
                    const soldSet = new Set(Array.from({ length: Math.min(soldSlices, pizza.slices) }, (_: any, i: number) => i));
                    const selectedSet = new Set(selected);
                    const pricePerSlice = Math.round(pizza.price / pizza.slices);
                    const cx = 70; const cy = 70; const r = 58; const innerR = 13;
                    const slicePaths = Array.from({ length: pizza.slices }, (_: any, i: number) => {
                      const step = (2 * Math.PI) / pizza.slices;
                      const start = -Math.PI / 2 + i * step; const end = -Math.PI / 2 + (i + 1) * step;
                      const mid = (start + end) / 2; const la = step > Math.PI ? 1 : 0;
                      const x1 = cx + r * Math.cos(start); const y1 = cy + r * Math.sin(start);
                      const x2 = cx + r * Math.cos(end);   const y2 = cy + r * Math.sin(end);
                      const ix1 = cx + innerR * Math.cos(start); const iy1 = cy + innerR * Math.sin(start);
                      const ix2 = cx + innerR * Math.cos(end);   const iy2 = cy + innerR * Math.sin(end);
                      const lx = cx + r * 0.62 * Math.cos(mid); const ly = cy + r * 0.62 * Math.sin(mid);
                      return { d: `M${ix1} ${iy1} L${x1} ${y1} A${r} ${r} 0 ${la} 1 ${x2} ${y2} L${ix2} ${iy2} A${innerR} ${innerR} 0 ${la} 0 ${ix1} ${iy1}Z`, i, lx, ly };
                    });
                    const getColor = (i: number) => soldSet.has(i) ? '#e2e8f0' : selectedSet.has(i) ? '#22c55e' : pizza.is_combined && i >= pizza.slices / 2 ? '#dc2626' : '#f97316';
                    const toggleSlice = (i: number) => {
                      if (soldSet.has(i)) return;
                      setSelectedPizzaSlices((prev: any) => {
                        const cur = prev[pizza.pizza_type_id] || [];
                        return { ...prev, [pizza.pizza_type_id]: cur.includes(i) ? cur.filter((x: number) => x !== i) : [...cur, i] };
                      });
                    };
                    return (
                      <div key={pizza.pizza_type_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold text-slate-800">{pizza.name}</p>
                            <p className="text-xs text-slate-500">{pizza.size_label} · {pizza.slices} porciones · <span className="text-green-600 font-semibold">{pizza.slices_available} disp.</span></p>
                            {pizza.is_combined && <p className="text-[11px] text-orange-600 font-semibold mt-0.5">🔀 {pizza.flavor_a} / {pizza.flavor_b}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-400">/ porción</p>
                            <p className="font-black text-orange-600">{formatMoney(pricePerSlice)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <svg width={140} height={140} viewBox="0 0 140 140" style={{ cursor: 'pointer', flexShrink: 0 }}>
                            <circle cx={cx} cy={cy} r={r + 4} fill="#92400e" />
                            {slicePaths.map(({ d, i, lx, ly }: any) => (
                              <g key={i} onClick={() => toggleSlice(i)}>
                                <path d={d} fill={getColor(i)} stroke="white" strokeWidth={2} opacity={soldSet.has(i) ? 0.4 : 1} style={{ cursor: soldSet.has(i) ? 'default' : 'pointer', transition: 'fill 0.15s' }} />
                                {soldSet.has(i) && <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#94a3b8">✓</text>}
                                {selectedSet.has(i) && <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="white" fontWeight="bold">●</text>}
                              </g>
                            ))}
                            <circle cx={cx} cy={cy} r={innerR * 0.9} fill="white" />
                            <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight="bold" fill="#1e293b">{pizza.slices_available}</text>
                            <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#64748b">disp.</text>
                          </svg>
                          <div className="flex-1 space-y-2">
                            {selected.length > 0 && (
                              <button onClick={() => addPizzaToCart(pizza, selected.length, 'slice')} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm">
                                + {selected.length} porción{selected.length > 1 ? 'es' : ''}<br/>
                                <span className="text-xs font-normal">{formatMoney(selected.length * pricePerSlice)}</span>
                              </button>
                            )}
                            <button onClick={() => addPizzaToCart(pizza, 1, 'whole')} className="w-full py-2 border border-orange-300 text-orange-700 hover:bg-orange-50 rounded-xl font-semibold text-sm">
                              Pizza completa — {formatMoney(pizza.price)}
                            </button>
                            {selected.length === 0 && <p className="text-[10px] text-slate-400 text-center">Toca las porciones naranjas para seleccionar</p>}
                          </div>
                        </div>
                        {pizza.is_combined && (
                          <div className="flex items-center gap-3 mt-2 justify-center text-xs">
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"/> {pizza.flavor_a}</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"/> {pizza.flavor_b}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Farmacia */}
          {isFarmacia && (<>{pharmaLoading && <p className="text-slate-400 text-sm text-center py-8">Cargando medicamentos...</p>}{!pharmaLoading && filteredPharmaMeds.length === 0 && (<div className="flex flex-col items-center justify-center h-full text-center text-slate-400"><span className="text-5xl mb-2 opacity-30">💊</span><p className="font-medium">No hay medicamentos con stock</p><p className="text-sm">Registra medicamentos en el módulo de Farmacia</p></div>)}<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{filteredPharmaMeds.map((med) => (<button key={med.id} onClick={() => addPharmaToCart(med)} className="flex flex-col items-start text-left p-4 rounded-lg border border-slate-200 hover:border-teal-500 hover:shadow-md transition-all bg-white group"><div className="w-full aspect-square bg-teal-50 rounded-md mb-3 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">💊</div><h4 className="font-semibold text-slate-800 line-clamp-2 text-sm">{med.name}</h4><p className="text-xs text-slate-400 mb-1">{med.category} · {med.presentation}</p>{med.laboratory && <p className="text-xs text-slate-400 mb-1">{med.laboratory}</p>}<div className="text-xs font-bold mb-2 text-green-600">Stock: {med.stock_total}</div><div className="mt-auto w-full flex justify-between items-center"><span className="font-bold text-teal-600">{formatMoney(med.price)}</span><span className={`text-[10px] px-2 py-0.5 rounded-full ${med.requires_prescription ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{med.requires_prescription ? 'Con receta' : med.med_type === 'GENERIC' ? 'Genérico' : 'Comercial'}</span></div></button>))}</div></>)}

          {/* Veterinaria / Odontología / Salón / Lavadero */}
          {(isServiceBusiness || isLavadero) && !isFarmacia && (<>{filteredSpecialtyServices.length === 0 && (<div className="flex flex-col items-center justify-center h-full text-center text-slate-400"><span className="text-5xl mb-2 opacity-30">{isVeterinaria ? '🐾' : isOdontologia ? '🦷' : isLavadero ? '🚿' : '✂️'}</span><p className="font-medium">No hay servicios registrados</p><p className="text-sm">Crea servicios en el módulo de {isVeterinaria ? 'Veterinaria' : isOdontologia ? 'Odontología' : isLavadero ? 'Lavadero' : 'Salón de Belleza'}</p></div>)}<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{filteredSpecialtyServices.map((svc) => (<button key={svc.id} onClick={() => addSpecialtyServiceToCart(svc)} className={`flex flex-col items-start text-left p-4 rounded-lg border border-slate-200 hover:shadow-md transition-all bg-white group ${isLavadero ? 'hover:border-blue-400' : 'hover:border-purple-400'}`}><div className={`w-full aspect-square rounded-md mb-3 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform ${isLavadero ? 'bg-blue-50' : 'bg-purple-50'}`}>{isLavadero ? (svc.tipo_vehiculo === 'moto' ? '🏍️' : svc.tipo_vehiculo === 'camioneta' ? '🛻' : svc.tipo_vehiculo === 'bus' ? '🚌' : '🚗') : isVeterinaria ? '🐾' : isOdontologia ? '🦷' : '✂️'}</div><h4 className="font-semibold text-slate-800 line-clamp-2 text-sm">{svc.nombre}</h4>{isLavadero && svc.tipo_vehiculo && <p className="text-[10px] text-slate-400 mb-1 capitalize">{svc.tipo_vehiculo}</p>}{svc.descripcion && <p className="text-xs text-slate-400 line-clamp-2 mb-2">{svc.descripcion}</p>}<div className="mt-auto w-full"><span className={`font-bold ${isLavadero ? 'text-blue-600' : 'text-purple-600'}`}>{formatMoney(svc.precio)}</span></div></button>))}</div></>)}

          {/* General / retail */}
          {!isRestaurante && !isFarmacia && !isServiceBusiness && (<>{filteredProducts.length === 0 && searchTerm && (<div className="flex flex-col items-center justify-center h-full text-center"><div className="text-slate-300 mb-4"><ShoppingCart size={48} /></div><p className="text-slate-500 font-medium">No hay productos disponibles</p><p className="text-slate-400 text-sm">Intenta con otro término de búsqueda o verifica el stock</p></div>)}<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{filteredProducts.map((product) => (<button key={product.id} onClick={() => addToCart(product)} disabled={product.stock_quantity === 0 && product.type !== ProductType.SERVICE} className="flex flex-col items-start text-left p-4 rounded-lg border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all bg-white group disabled:opacity-50 disabled:bg-slate-50"><div className="w-full aspect-square bg-slate-100 rounded-md mb-3 flex items-center justify-center text-slate-300 group-hover:text-blue-400 overflow-hidden">{(product as any).image_url ? <img src={(product as any).image_url} alt={product.name} className="w-full h-full object-cover" /> : <Smartphone size={40} />}</div><h4 className="font-semibold text-slate-800 line-clamp-2">{product.name}</h4><p className="text-xs text-slate-500 mb-1">{product.sku}</p><div className={`text-xs font-bold mb-2 ${product.stock_quantity === 0 ? 'text-red-500' : 'text-green-600'}`}>{product.type === 'WEIGHABLE' ? `Stock: ${(product as any).unit_type === 'g' ? (product.stock_quantity) + ' g' : (product as any).unit_type === 'lb' ? ((product.stock_quantity / 453.592).toFixed(2)) + ' lb' : ((product.stock_quantity / 1000).toFixed(2)) + ' kg'}` : `Stock: ${product.stock_quantity}`}</div><div className="mt-auto w-full flex justify-between items-center"><span className="font-bold text-blue-600">{product.type === 'WEIGHABLE' ? `${formatMoney((product as any).price_per_unit || product.price)}/${(product as any).unit_type || 'kg'}` : formatMoney(product.price)}</span><span className={`text-[10px] px-2 py-0.5 rounded-full ${product.type === ProductType.SERIALIZED ? 'bg-amber-100 text-amber-700' : product.type === 'WEIGHABLE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{product.type === ProductType.SERIALIZED ? 'IMEI' : product.type === 'WEIGHABLE' ? '⚖️ KG' : 'STD'}</span></div></button>))}</div></>)}
        </div>
      </div>

      {/* Carrito — se pasan los wrappers con devolución de stock */}
      <CartSidebar
        cart={cart}
        totals={totals}
        applyIva={applyIva}
        defaultTaxRate={defaultTaxRate}
        discountMode={discountMode}
        setDiscountMode={setDiscountMode}
        globalDiscount={globalDiscount}
        globalDiscountVal={globalDiscountVal}
        clampedDiscount={clampedDiscount}
        handleDiscountPct={handleDiscountPct}
        handleDiscountVal={handleDiscountVal}
        onToggleIva={() => setApplyIva((v) => !v)}
        onUpdateQuantity={updateQuantityWithStockSync}
        onUpdatePrice={updatePrice}
        onRemoveItem={removeFromCartWithStockReturn}
        onOpenPayment={() => setIsPaymentModalOpen(true)}
        formatMoney={formatMoney}
      />

      {/* Modal de pago */}
      {isPaymentModalOpen && (
        <PaymentModal
          totals={totals} applyIva={applyIva} defaultTaxRate={defaultTaxRate} clampedDiscount={clampedDiscount}
          isPartialMode={isPartialMode} setIsPartialMode={setIsPartialMode} shoeRepairLabel={shoeRepairLabel}
          payments={payments} currentPaymentAmount={currentPaymentAmount} setCurrentPaymentAmount={setCurrentPaymentAmount}
          currentPaymentMethod={currentPaymentMethod} setCurrentPaymentMethod={setCurrentPaymentMethod}
          companyId={company?.id || ''}
          customerName={customerName} setCustomerName={setCustomerName}
          customerDoc={customerDoc} setCustomerDoc={setCustomerDoc}
          customerEmail={customerEmail} setCustomerEmail={setCustomerEmail}
          customerPhone={customerPhone} setCustomerPhone={setCustomerPhone}
          paypalEnabled={!!paypalEnabled} paypalConfig={paypalConfig}
          showPaypalModal={showPaypalModal} setShowPaypalModal={setShowPaypalModal}
          paypalAmount={paypalAmount} setPaypalAmount={setPaypalAmount}
          paypalLoading={paypalLoading} setPaypalLoading={setPaypalLoading}
          onAddPayment={() => addPayment(totals.total)} onRemovePayment={removePayment}
          onAddPaypalPayment={addPaypalPayment} onClose={() => setIsPaymentModalOpen(false)}
          onFinalize={handleFinalizeSale} formatMoney={formatMoney}
        />
      )}

      {/* Modales balanza */}
      {showWeightModal && pendingWeighable && (
        <WeightModal pendingWeighable={pendingWeighable} scaleConnected={scaleConnected} scaleWeight={scaleWeight}
          manualWeight={manualWeight} setManualWeight={setManualWeight}
          onConfirm={(w) => addWeighableToCart(pendingWeighable, w)}
          onClose={() => { setShowWeightModal(false); setPendingWeighable(null); }} formatMoney={formatMoney} />
      )}
      {showScaleConfig && (
        <ScaleConfigModal onConnectSerial={() => { connectScaleSerial(); setShowScaleConfig(false); }}
          onActivateBarcode={activateBarcodeMode} onActivateManual={activateManualMode}
          onClose={() => setShowScaleConfig(false)} />
      )}
    </div>
  );
};

export default POS;