import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Save, Building, Receipt, Shield, X, CreditCard, 
  Upload, Image as ImageIcon, Lock, KeyRound, 
  FileCode, Check, AlertTriangle, Palette, Crown,
  Eye, EyeOff, ShieldCheck, Printer, Wifi, Monitor, Cpu
} from 'lucide-react';
import { useDatabase } from '../contexts/DatabaseContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { DianEnvironment, DianSettings } from '../types';

const PLANS = [
  { id: 'BASIC', name: 'Plan Basic', price: '$65.000 / mes', features: ['1 sucursal', '1 usuario admin', 'POS y ventas', 'Inventario ilimitado', 'Control de caja', 'Servicio técnico', 'Cartera / CxC', 'Soporte WhatsApp'], color: 'border-slate-200', accentClass: 'bg-slate-600' },
  { id: 'PRO', name: 'Plan Pro', price: '$120.000 / mes', features: ['Hasta 3 sucursales', 'Hasta 5 usuarios', 'Todo lo del Basic', 'Roles y permisos', 'PIN de acceso rápido', 'Dashboard multi-sucursal', 'Soporte Prioritario'], color: 'border-blue-500 ring-2 ring-blue-500/20', accentClass: 'bg-blue-600', popular: true },
  { id: 'ENTERPRISE', name: 'Plan Enterprise', price: '$249.900 / mes', features: ['Sucursales ilimitadas', 'Usuarios ilimitados', 'Todo lo del Pro', 'Facturación DIAN', 'API + Webhooks', 'Gerente de cuenta dedicado', 'SLA 99.9% uptime', 'Soporte Dedicado'], color: 'border-purple-500 ring-2 ring-purple-500/20', accentClass: 'bg-purple-600', enterprise: true }
];

const BUSINESS_TYPES = [
  { id: 'general',           label: '🏪 Tienda General' },
  { id: 'tienda_tecnologia', label: '📱 Tecnología / Celulares' },
  { id: 'restaurante',       label: '🍽️ Restaurante / Cafetería' },
  { id: 'ropa',              label: '👗 Ropa / Calzado' },
  { id: 'zapateria',         label: '👟 Zapatería / Marroquinería' },
  { id: 'ferreteria',        label: '🔧 Ferretería / Construcción' },
  { id: 'farmacia',          label: '💊 Farmacia / Droguería' },
  { id: 'supermercado',      label: '🛒 Supermercado / Abarrotes' },
  { id: 'salon',             label: '💇 Salón de Belleza / Spa' },
  { id: 'odontologia',       label: '🦷 Consultorio Odontológico' },
  { id: 'veterinaria',       label: '🐾 Clínica Veterinaria' },
  { id: 'optometria',        label: '👁️ Optometría' },
  { id: 'lavadero',          label: '🚿 Lavadero de Vehículos' },
  { id: 'gimnasio',          label: '🏋️ Gimnasio / Centro Deportivo' },
  { id: 'panaderia',         label: '🥐 Panadería / Pastelería' },
  { id: 'otro',              label: '📦 Otro' },
];

const COLOR_PRESETS = [
  { label: 'Azul',    primary: '#3b82f6', secondary: '#6366f1' },
  { label: 'Verde',   primary: '#10b981', secondary: '#059669' },
  { label: 'Morado',  primary: '#8b5cf6', secondary: '#7c3aed' },
  { label: 'Rojo',    primary: '#ef4444', secondary: '#dc2626' },
  { label: 'Naranja', primary: '#f59e0b', secondary: '#d97706' },
  { label: 'Rosa',    primary: '#ec4899', secondary: '#db2777' },
  { label: 'Gris',    primary: '#475569', secondary: '#334155' },
  { label: 'Negro',   primary: '#0f172a', secondary: '#1e293b' },
];

const FONT_PRESETS = [
  { label: 'Blanco',       color: '#ffffff' },
  { label: 'Gris claro',   color: '#e2e8f0' },
  { label: 'Gris azulado', color: '#94a3b8' },
  { label: 'Negro',        color: '#0f172a' },
  { label: 'Amarillo',     color: '#fde68a' },
  { label: 'Cian',         color: '#67e8f9' },
];

const MASTER_KEY = 'admin123';

const Settings: React.FC = () => {
  const { company, updateCompanyConfig, saveDianSettings, refreshCompany } = useDatabase();

  // Mantenemos el ID que aparece en tu captura de Supabase
  const safeCompany = company || {
    id: 'b44f2b8c-e792-4d15-a661-ecadc111fbcd', 
    name: 'iPhone Shop Usa', 
    nit: '14839897-2', 
    phone: '3161545554', 
    address: 'Calle 11 # 9-03', 
    email: 'iphoneshopcal@gmail.com',
    subscription_plan: 'PRO', 
    subscription_status: 'ACTIVE', 
    logo_url: '',
    primary_color: '#3b82f6', 
    secondary_color: '#6366f1', 
    business_type: 'general',
    config: { tax_rate: 0, invoice_prefix: 'POS' },
    dian_settings: null
  };

  const plan = safeCompany.subscription_plan || 'BASIC';
  const ALLOWED_PAYMENT_METHODS: Record<string, string[]> = {
    BASIC:      ['cash', 'transfer', 'paypal'],
    PRO:        ['cash', 'transfer', 'wompi', 'paypal'],
    ENTERPRISE: ['cash', 'transfer', 'wompi', 'bold', 'payu', 'dataphone', 'paypal'],
  };
  const allowedMethods = ALLOWED_PAYMENT_METHODS[plan] || ALLOWED_PAYMENT_METHODS['BASIC'];

  const [formData, setFormData] = useState(safeCompany);
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'DIAN' | 'BRANDING' | 'PAGOS' | 'CATALOGO' | 'HARDWARE'>('GENERAL');

  // Abrir tab según parámetro URL (?tab=hardware)
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab')?.toUpperCase();
    if (tab === 'HARDWARE') setActiveTab('HARDWARE');
  }, [location.search]);
  const [taxRate, setTaxRate] = useState<number>(safeCompany.config?.tax_rate ?? 0);

  // ── Hardware: cajón registradora ──────────────────────────────────────────
  type DrawerProtocol = 'escpos-usb' | 'escpos-network' | 'windows-print';
  interface DrawerConfig { protocol: DrawerProtocol; networkIp?: string; networkPort?: number; windowsPrinter?: string; }
  const [drawerConfig, setDrawerConfig] = useState<DrawerConfig>(() => {
    try { return JSON.parse(localStorage.getItem('posmaster_drawer_config') || '{}'); } catch { return {}; }
  });
  const [drawerSaved, setDrawerSaved] = useState(false);
  const saveDrawerConfig = (cfg: DrawerConfig) => {
    try { localStorage.setItem('posmaster_drawer_config', JSON.stringify(cfg)); } catch {}
    setDrawerConfig(cfg);
    setDrawerSaved(true);
    setTimeout(() => setDrawerSaved(false), 2500);
  };
  const [deleteInvoicePin, setDeleteInvoicePin] = useState<string>(
    (safeCompany.config as any)?.delete_invoice_pin || ''
  );
  // ── PIN auth: requiere contraseña del propietario para editar el PIN de facturas
  const [pinAuthOpen, setPinAuthOpen] = useState(false);
  const [pinAuthPassword, setPinAuthPassword] = useState('');
  const [pinAuthShowPw, setPinAuthShowPw] = useState(false);
  const [pinAuthLoading, setPinAuthLoading] = useState(false);
  const [pinUnlocked, setPinUnlocked] = useState(false); // true = edición desbloqueada
  const [primaryColor, setPrimaryColor] = useState(
    safeCompany.primary_color || (safeCompany.config as any)?.primary_color || '#3b82f6'
  );
  const [secondaryColor, setSecondaryColor] = useState(
    safeCompany.secondary_color || (safeCompany.config as any)?.secondary_color || '#6366f1'
  );
  const [fontColor, setFontColor] = useState(
    (safeCompany.config as any)?.font_color || '#ffffff'
  );
  // businessTypes es ahora un array — BASIC: 1, PRO: hasta 3, ENTERPRISE: ilimitado
  const maxBusinessTypes = plan === 'ENTERPRISE' ? 99 : plan === 'PRO' ? 3 : 1; // BASIC y TRIAL = 1
  const parseBusinessTypes = (cfg: any): string[] => {
    if (Array.isArray(cfg?.business_types)) return cfg.business_types;
    if (cfg?.business_type) return [cfg.business_type]; // migración de dato antiguo
    return ['general'];
  };
  const [businessTypes, setBusinessTypes] = useState<string[]>(
    parseBusinessTypes((safeCompany.config as any))
  );
  const toggleBusinessType = (id: string) => {
    setBusinessTypes(prev => {
      // Si ya está seleccionado, deseleccionar (pero nunca dejar vacío)
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== id);
      }
      // BASIC y TRIAL: swap directo — reemplaza el único seleccionado
      if (plan === 'BASIC' || plan === 'TRIAL') return [id];
      // PRO: hasta 3
      if (prev.length >= maxBusinessTypes) {
        toast.error('El plan PRO permite hasta 3 tipos. Actualiza a ENTERPRISE para tener todos.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const [savingBranding, setSavingBranding] = useState(false);
  const [invoiceTerms, setInvoiceTerms] = useState<string>('');
  // ── Catálogo WhatsApp ────────────────────────────────────────────────────
  const [catalogEnabled, setCatalogEnabled] = useState<boolean>((safeCompany as any).catalog_enabled || false);
  const [catalogWhatsapp, setCatalogWhatsapp] = useState<string>((safeCompany as any).catalog_whatsapp || '');
  const [catalogMessage, setCatalogMessage] = useState<string>((safeCompany as any).catalog_message || '¡Hola! Me interesa este producto:');
  const [catalogLinkCopied, setCatalogLinkCopied] = useState(false);

  // Sincronizar TODOS los estados cuando el contexto carga/actualiza company
  // Resuelve el caso donde company llega null en el primer render (async)
  useEffect(() => {
    if (!company) return;
    const cfg = (company.config as any) || {};
    setFormData(company as any);
    setTaxRate(cfg.tax_rate ?? 0);
    setDeleteInvoicePin(cfg.delete_invoice_pin || '');
    setPinUnlocked(false); // re-lock whenever company reloads
    setPrimaryColor(cfg.primary_color || '#3b82f6');
    setSecondaryColor(cfg.secondary_color || '#6366f1');
    setFontColor(cfg.font_color || '#ffffff');
    // Resuelve el bug donde Odontologia (y otros tipos) no aparecian seleccionados
    setBusinessTypes(parseBusinessTypes(cfg));
    setInvoiceTerms(cfg.invoice_terms || '');
  }, [company]);
  const [paymentProviders, setPaymentProviders] = useState<Record<string, any>>({
    cash:      { enabled: true,  label: 'Efectivo',             icon: '💵' },
    dataphone: { enabled: false, label: 'Datáfono físico',      icon: '📟', acquirer: 'redeban', note: '' },
    transfer:  { enabled: false, label: 'Transferencia / PSE',  icon: '🏛️', bank_name: '', account_number: '', account_type: 'ahorros', id_type: 'NIT', id_number: '' },
    wompi:     { enabled: false, label: 'Wompi',                icon: '🏦', pub_key: '', env: 'prod' },
    bold:      { enabled: false, label: 'Bold',                 icon: '⚡', api_key: '' },
    payu:      { enabled: false, label: 'PayU',                 icon: '💳', merchant_id: '', api_key: '', api_login: '' },
    paypal:    { enabled: false, label: 'PayPal',               icon: '🅿️', client_id: '', env: 'production' },
  });
  const [savingPayments, setSavingPayments] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [dianForm, setDianForm] = useState<DianSettings>(safeCompany.dian_settings || {
    company_id: safeCompany.id,
    factus_token:    (safeCompany.config as any)?.factus_token || '',
    factus_env:      (safeCompany.config as any)?.factus_env  || 'sandbox',
    resolution_number: (safeCompany.config as any)?.dian_resolution || '',
    resolution_date:   (safeCompany.config as any)?.dian_resolution_date || '',
    prefix:          (safeCompany.config as any)?.dian_prefix || 'SETP',
    range_from:      (safeCompany.config as any)?.dian_range_from || 1,
    range_to:        (safeCompany.config as any)?.dian_range_to  || 5000000,
    current_number:  1,
    nit_digit:       (safeCompany.config as any)?.dian_nit_digit || '0',
    software_id: '', software_pin: '', technical_key: '',
    environment: DianEnvironment.TEST,
    is_active: !!(safeCompany.config as any)?.factus_token,
  });

  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isSecurityCheckOpen, setIsSecurityCheckOpen] = useState(false);
  const [inputMasterKey, setInputMasterKey] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // LOGICA DE GUARDADO CORREGIDA PARA 'business_settings'
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (activeTab === 'GENERAL') {
        await updateCompanyConfig({
          ...formData,
          config: { ...(formData.config || {}), tax_rate: taxRate, delete_invoice_pin: deleteInvoicePin }
        });
        toast.success('Configuración General Guardada');
        setPinUnlocked(false); // re-lock PIN after saving
      } 
      else if (activeTab === 'DIAN') {
        // Guardar en company.config — cada campo Factus vive aquí
        const currentConfig = (safeCompany.config as any) || {};
        const newConfig = {
          ...currentConfig,
          factus_token:        dianForm.factus_token,
          factus_env:          dianForm.factus_env,
          dian_resolution:     dianForm.resolution_number,
          dian_resolution_date: dianForm.resolution_date,
          dian_prefix:         dianForm.prefix,
          dian_range_from:     dianForm.range_from,
          dian_range_to:       dianForm.range_to,
          dian_nit_digit:      dianForm.nit_digit,
        };
        const { error } = await supabase
          .from('companies')
          .update({ config: newConfig })
          .eq('id', safeCompany.id);

        if (error) throw error;
        saveDianSettings(dianForm);
        toast.success('✅ Configuración Factus guardada');
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBranding = async () => {
    if (!safeCompany.id) return;
    setSavingBranding(true);
    try {
      // Merge colors into the config jsonb column (already exists in companies)
      const currentConfig = safeCompany.config || {};
      const newConfig = {
        ...currentConfig,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        font_color: fontColor,
        business_type: businessTypes[0] || 'general',   // compatibilidad legacy
        business_types: businessTypes,
        invoice_terms: invoiceTerms,
      };
      const { error } = await supabase.from('companies')
        .update({ config: newConfig })
        .eq('id', safeCompany.id);
      if (error) throw error;
      // Refrescar el company en contexto para que Layout refleje cambios al instante
      await refreshCompany();
      toast.success('¡Personalización guardada!');
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSavePayments = async () => {
    setSavingPayments(true);
    try {
      const { error } = await supabase.from('business_settings')
        .update({ payment_providers: paymentProviders })
        .eq('id', safeCompany.id);
      if (error) throw error;
      toast.success('Métodos de pago guardados');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingPayments(false);
    }
  };

  const [savingCatalog, setSavingCatalog] = useState(false);
  const handleSaveCatalog = async () => {
    setSavingCatalog(true);
    try {
      const { error } = await supabase.from('companies').update({
        catalog_enabled: catalogEnabled,
        catalog_whatsapp: catalogWhatsapp || null,
        catalog_message: catalogMessage || null,
      }).eq('id', safeCompany.id);
      if (error) throw error;
      toast.success('Catálogo guardado');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingCatalog(false);
    }
  };

  const handlePlanChange = (planId: string) => {
    updateCompanyConfig({ subscription_plan: planId } as any);
    setIsSubscriptionModalOpen(false);
    toast.success(`Plan actualizado`);
  };

  const handleVerifyMasterKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMasterKey === MASTER_KEY) {
      toast.success('Acceso Autorizado');
      setIsSecurityCheckOpen(false);
      setInputMasterKey('');
      setIsSubscriptionModalOpen(true);
    } else {
      toast.error('Clave Maestra Incorrecta');
      setInputMasterKey('');
    }
  };

  // ── Verificar contraseña real del propietario antes de editar PIN de facturas
  const handlePinAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinAuthPassword) return;
    setPinAuthLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No se pudo obtener el usuario actual');
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: pinAuthPassword,
      });
      if (error) {
        toast.error('Contraseña incorrecta. Solo el propietario puede cambiar este PIN.');
        setPinAuthPassword('');
        return;
      }
      toast.success('✓ Identidad verificada. Puedes editar el PIN.');
      setPinUnlocked(true);
      setPinAuthOpen(false);
      setPinAuthPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Error verificando contraseña');
    } finally {
      setPinAuthLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `logo-${safeCompany.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('company-logos').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('company-logos').getPublicUrl(fileName);
      setFormData({ ...formData, logo_url: data.publicUrl });
      updateCompanyConfig({ logo_url: data.publicUrl } as any);
      toast.success('Logo actualizado');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const currentPlan = PLANS.find(p => p.id === safeCompany.subscription_plan) || PLANS[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* HEADER CON TABS */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Configuracion</h2>
          <p className="text-slate-500 text-sm">Administra los datos de tu empresa</p>
        </div>
        <div className="flex bg-white rounded-lg p-1 border border-slate-200 flex-wrap gap-1">
          <button type="button" onClick={() => setActiveTab('GENERAL')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'GENERAL' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            General
          </button>
          <button type="button" onClick={() => setActiveTab('BRANDING')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'BRANDING' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Palette size={15} /> Marca
          </button>
          <button type="button" onClick={() => setActiveTab('DIAN')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'DIAN' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <FileCode size={16} /> Facturacion Electronica
          </button>
          <button type="button" onClick={() => setActiveTab('PAGOS')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'PAGOS' ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <CreditCard size={16} /> Métodos de Pago
          </button>
          <button type="button" onClick={() => setActiveTab('CATALOGO')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'CATALOGO' ? 'bg-green-100 text-green-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            🛍️ Catálogo WhatsApp
          </button>
          <button type="button" onClick={() => setActiveTab('HARDWARE')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'HARDWARE' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Cpu size={15} /> Hardware
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          
          {/* TAB GENERAL - COMPLETO */}
          {activeTab === 'GENERAL' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Building size={20} className="text-blue-600" /> Datos Generales
              </h3>
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="relative w-20 h-20 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {formData.logo_url ? <img src={formData.logo_url} className="w-full h-full object-cover" alt="logo" /> : <ImageIcon className="text-slate-400" size={32} />}
                  {isUploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
                </div>
                <div>
                  <h4 className="font-medium text-slate-700 text-sm mb-1">Logotipo</h4>
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                    className="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-md font-medium flex items-center gap-1 hover:bg-slate-50 transition-colors">
                    <Upload size={12} /> Subir Imagen
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial</label>
                  <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">NIT / RUC</label>
                  <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.nit || ''} onChange={e => setFormData({ ...formData, nit: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
                  <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Direccion</label>
                  <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">IVA por Defecto</label>
                  <select value={taxRate} onChange={e => setTaxRate(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white">
                    <option value={0}>0% - Excluido de IVA</option>
                    <option value={5}>5% - Tarifa Reducida</option>
                    <option value={19}>19% - Tarifa General</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Se aplica a productos nuevos por defecto</p>
                </div>

                {/* ── PIN ELIMINACIÓN DE FACTURAS ────────────────────────── */}
                <div className="md:col-span-2 border border-amber-200 bg-amber-50 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                      <Lock size={18} className="text-amber-700" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-bold text-amber-900 mb-1">
                        PIN de Seguridad — Eliminar Facturas
                      </label>
                      <p className="text-xs text-amber-700 mb-3">
                        Se solicitará este PIN de 4 dígitos antes de eliminar cualquier factura del historial.
                        Para cambiar este PIN debes verificar tu identidad con tu contraseña de acceso.
                      </p>

                      {!pinUnlocked ? (
                        /* LOCKED STATE */
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1.5">
                            {[0,1,2,3].map(i => (
                              <div key={i} className="w-8 h-9 rounded-lg bg-amber-100 border-2 border-amber-300 flex items-center justify-center">
                                <span className="text-amber-700 text-lg">
                                  {deleteInvoicePin.length > i ? '●' : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => { setPinAuthOpen(true); setPinAuthPassword(''); setPinAuthShowPw(false); }}
                            className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors"
                          >
                            <KeyRound size={13} />
                            {deleteInvoicePin.length === 4 ? 'Cambiar PIN' : 'Configurar PIN'}
                          </button>
                          {deleteInvoicePin.length === 4 && (
                            <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-lg">✓ PIN activo</span>
                          )}
                          {deleteInvoicePin.length === 0 && (
                            <span className="text-xs text-slate-400">Sin protección activa</span>
                          )}
                        </div>
                      ) : (
                        /* UNLOCKED STATE */
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
                            <ShieldCheck size={14} />
                            Identidad verificada — puedes editar el PIN
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <input
                              type="password"
                              maxLength={4}
                              placeholder="Nuevo PIN (4 dígitos)"
                              value={deleteInvoicePin}
                              autoFocus
                              onChange={e => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                                setDeleteInvoicePin(v);
                              }}
                              className="w-36 px-3 py-2 border-2 border-amber-400 bg-white rounded-lg outline-none focus:ring-2 focus:ring-amber-400 font-mono text-center text-lg tracking-widest"
                            />
                            <button
                              type="button"
                              onClick={() => { setPinUnlocked(false); }}
                              className="text-xs text-slate-500 hover:text-red-600 underline"
                            >
                              Cancelar
                            </button>
                            {deleteInvoicePin.length === 4 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-lg">✓ Listo — guarda los cambios</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPinUnlocked(false);
                                    setPinAuthOpen(true);
                                    setPinAuthPassword('');
                                    setPinAuthShowPw(false);
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors"
                                >
                                  <KeyRound size={12} />
                                  Cambiar PIN
                                </button>
                              </div>
                            )}
                            {deleteInvoicePin.length === 0 && (
                              <span className="text-xs text-slate-500">Dejar vacío = sin PIN</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB BRANDING - COMPLETO */}
          {activeTab === 'BRANDING' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-8">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Palette size={20} className="text-blue-600" /> Personalización de Marca
              </h3>
              
              <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                <div style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }} className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-white font-bold">
                    {formData.logo_url ? <img src={formData.logo_url} className="w-8 h-8 object-contain" /> : (formData.name || 'M').charAt(0)}
                  </div>
                  <div>
                    <p className="text-white font-bold text-base">{formData.name || 'Mi Negocio'}</p>
                    <p className="text-white/70 text-xs">
                      {businessTypes.map(id => BUSINESS_TYPES.find(b => b.id === id)?.label).filter(Boolean).join(' · ') || 'Tienda'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-slate-700">Tipo de negocio</label>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    plan === 'ENTERPRISE' ? 'bg-purple-100 text-purple-700' :
                    plan === 'PRO'        ? 'bg-blue-100 text-blue-700' :
                                           'bg-slate-100 text-slate-500'
                  }`}>
                    {plan === 'ENTERPRISE' ? '✨ Todos disponibles' :
                     plan === 'PRO'        ? `${businessTypes.length}/3 seleccionados` :
                     plan === 'TRIAL'      ? `${businessTypes.length}/1 · Prueba` :
                                            `${businessTypes.length}/1 seleccionado`}
                  </span>
                </div>
                {(plan === 'BASIC' || plan === 'TRIAL') && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    ⚠️ {plan === 'TRIAL' ? 'Plan de prueba' : 'Plan BASIC'}: solo puedes tener <strong>1 tipo de negocio</strong>. Al seleccionar uno nuevo el anterior se reemplaza automáticamente. Actualiza a <strong>PRO</strong> para hasta 3, o <strong>ENTERPRISE</strong> para todos.
                  </p>
                )}
                {plan === 'PRO' && (
                  <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
                    💡 Plan PRO: puedes seleccionar hasta <strong>3 tipos</strong>. Actualiza a <strong>ENTERPRISE</strong> para todos.
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {BUSINESS_TYPES.map(bt => {
                    const isSelected = businessTypes.includes(bt.id);
                    // Solo bloquear en PRO cuando ya tiene 3 y este no está seleccionado
                    const isLocked = plan === 'PRO' && !isSelected && businessTypes.length >= maxBusinessTypes;
                    return (
                      <button key={bt.id} type="button" onClick={() => toggleBusinessType(bt.id)}
                        disabled={isLocked}
                        className={`p-3 rounded-lg border-2 text-sm font-medium text-left transition-all relative ${
                          isSelected  ? 'border-blue-500 bg-blue-50 text-blue-700' :
                          isLocked    ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed' :
                                        'border-slate-200 hover:border-slate-300 text-slate-600'
                        }`}>
                        {bt.label}
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                        )}
                        {isLocked && (
                          <span className="absolute top-1.5 right-1.5 text-[10px]">🔒</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Color de marca <span className="text-slate-400 font-normal text-xs">(color del menú lateral)</span></label>
                <div className="flex flex-wrap gap-3">
                  {COLOR_PRESETS.map(preset => (
                    <button key={preset.label} type="button" title={preset.label}
                      onClick={() => { setPrimaryColor(preset.primary); setSecondaryColor(preset.secondary); }}
                      className={`w-10 h-10 rounded-full border-4 transition-all ${primaryColor === preset.primary ? 'border-slate-800 scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                      style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})` }} />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Color de fuentes <span className="text-slate-400 font-normal text-xs">(textos del menú lateral)</span></label>
                <div className="flex flex-wrap gap-3 items-center">
                  {FONT_PRESETS.map(fp => (
                    <button key={fp.label} type="button" title={fp.label}
                      onClick={() => setFontColor(fp.color)}
                      className={`w-10 h-10 rounded-full border-4 transition-all flex items-center justify-center text-xs font-bold ${fontColor === fp.color ? 'border-slate-800 scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                      style={{ background: fp.color === '#ffffff' ? '#e2e8f0' : fp.color === '#0f172a' ? '#0f172a' : fp.color, color: fp.color === '#ffffff' || fp.color === '#e2e8f0' ? '#0f172a' : '#fff' }}>
                      A
                    </button>
                  ))}
                  <div className="flex items-center gap-2 ml-2">
                    <label className="text-xs text-slate-500">Personalizado:</label>
                    <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  </div>
                </div>
                <div className="mt-3 p-3 rounded-lg flex items-center gap-3" style={{ background: primaryColor }}>
                  <span className="text-sm font-medium" style={{ color: fontColor }}>📦 Vista previa del menú</span>
                  <span className="text-xs opacity-70" style={{ color: fontColor }}>← así se verán los textos</span>
                </div>
              </div>

              {/* Términos y condiciones de factura */}
              <div className="mt-2 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <label className="block text-sm font-bold text-slate-700">
                  📄 Términos y Condiciones de la Factura
                </label>
                <p className="text-xs text-slate-400">
                  Aparecerán al pie de cada factura impresa. Personaliza según el tipo de negocio.
                  Usa mayúsculas para títulos de sección y • para items de lista.
                </p>
                <textarea
                  value={invoiceTerms}
                  onChange={e => setInvoiceTerms(e.target.value)}
                  rows={8}
                  placeholder={"GARANTÍA\n• Productos tienen garantía de 30 días\n• No se aceptan devoluciones sin factura\n\nCONDICIONES\n• El establecimiento no se hace responsable por pérdida o daño de objetos personales"}
                  className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono leading-relaxed"
                />
              </div>

              <button type="button" onClick={handleSaveBranding} disabled={savingBranding}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-white transition-all shadow-md active:scale-[0.98]"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`, opacity: savingBranding ? 0.7 : 1 }}>
                <Save size={18} /> {savingBranding ? 'Guardando...' : 'Guardar Personalización'}
              </button>
            </div>
          )}

          {/* ══ TAB DIAN / FACTUS ══════════════════════════════════════════════════ */}
          {activeTab === 'DIAN' && (
            <div className="space-y-5">

              {/* ── Encabezado ─────────────────────────────────────────────── */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Receipt size={20} className="text-blue-600" />
                    <h3 className="font-bold text-slate-800">Facturación Electrónica — Factus</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{dianForm.is_active ? 'Activo' : 'Inactivo'}</span>
                    <button type="button" onClick={() => setDianForm(f => ({ ...f, is_active: !f.is_active }))}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${dianForm.is_active ? 'bg-green-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                    </button>
                  </div>
                </div>

                {/* Instrucción Factus */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-xs text-blue-700 space-y-1">
                  <p className="font-bold text-blue-800">¿Cómo obtener tu token de Factus?</p>
                  <p>1. Entra a <strong>factus.com.co</strong> y crea tu cuenta (cada empresa usa la suya).</p>
                  <p>2. Ve a <strong>Perfil → API Tokens</strong> y genera un token.</p>
                  <p>3. Pega el token abajo. Factus ya tiene tu resolución DIAN configurada.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Token Factus */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Token API de Factus <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..."
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl font-mono text-sm outline-none focus:ring-2 focus:ring-blue-400"
                      value={dianForm.factus_token || ''}
                      onChange={e => setDianForm(f => ({ ...f, factus_token: e.target.value }))}
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Se guarda cifrado. Nunca lo compartás.</p>
                  </div>

                  {/* Ambiente */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Ambiente</label>
                    <select
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      value={dianForm.factus_env || 'sandbox'}
                      onChange={e => setDianForm(f => ({ ...f, factus_env: e.target.value as any }))}>
                      <option value="sandbox">🧪 Sandbox / Pruebas (homologación)</option>
                      <option value="production">🏭 Producción (facturas reales)</option>
                    </select>
                  </div>

                  {/* Prefijo resolución */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Prefijo de resolución</label>
                    <input type="text" placeholder="SETP"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono uppercase"
                      value={dianForm.prefix || ''}
                      onChange={e => setDianForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))} />
                  </div>

                  {/* Número resolución */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Número de resolución DIAN</label>
                    <input type="text" placeholder="18764000001"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono"
                      value={dianForm.resolution_number || ''}
                      onChange={e => setDianForm(f => ({ ...f, resolution_number: e.target.value }))} />
                  </div>

                  {/* Fecha resolución */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Fecha resolución</label>
                    <input type="date"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      value={dianForm.resolution_date || ''}
                      onChange={e => setDianForm(f => ({ ...f, resolution_date: e.target.value }))} />
                  </div>

                  {/* Rango desde */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Rango desde</label>
                    <input type="number" min="1" placeholder="1"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      value={dianForm.range_from || ''}
                      onChange={e => setDianForm(f => ({ ...f, range_from: +e.target.value }))} />
                  </div>

                  {/* Rango hasta */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Rango hasta</label>
                    <input type="number" min="1" placeholder="5000000"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      value={dianForm.range_to || ''}
                      onChange={e => setDianForm(f => ({ ...f, range_to: +e.target.value }))} />
                  </div>

                  {/* Dígito NIT */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Dígito verificación NIT</label>
                    <input type="text" maxLength={1} placeholder="0"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono"
                      value={dianForm.nit_digit || ''}
                      onChange={e => setDianForm(f => ({ ...f, nit_digit: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* ── Tipos de documento habilitados ──────────────────────── */}
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h4 className="font-bold text-slate-700 text-sm mb-3">Documentos habilitados</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Receipt size={16} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Factura electrónica de venta (FEV)</p>
                      <p className="text-xs text-slate-500">Para ventas a empresas o personas con NIT/CC. Plena validez legal.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 border border-slate-200 rounded-xl">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">🧾</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Documento equivalente POS</p>
                      <p className="text-xs text-slate-500">Para ventas rápidas a consumidor final sin identificación.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Alerta producción ───────────────────────────────────── */}
              {(dianForm.factus_env || 'sandbox') === 'production' && (
                <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl flex gap-3">
                  <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="font-bold text-amber-800 text-sm">Ambiente de producción activo</h4>
                    <p className="text-xs text-amber-700 mt-0.5">Todas las facturas que emitas tendrán validez legal ante la DIAN. Asegúrate de haber completado las pruebas de homologación en sandbox primero.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SIDEBAR DERECHO */}
        <div className="space-y-6">
          {(() => {
              const PLAN_INFO: Record<string, { label: string; color: string; accent: string; icon: string; features: string[] }> = {
                TRIAL:      { label: '7 días gratis',   color: 'bg-emerald-600', accent: 'text-emerald-400', icon: '🎁', features: ['Acceso completo 7 días', 'POS y ventas', 'Inventario', 'Control de caja', 'Sin compromiso'] },
                BASIC:      { label: 'Plan Basic',       color: 'bg-slate-600',   accent: 'text-slate-300',   icon: '📦', features: ['1 sucursal · 1 usuario', 'POS y ventas', 'Inventario ilimitado', 'Control de caja', 'Cartera / CxC', 'Soporte WhatsApp'] },
                PRO:        { label: 'Plan Pro',         color: 'bg-blue-600',    accent: 'text-blue-400',    icon: '⭐', features: ['Hasta 3 sucursales', 'Hasta 5 usuarios', 'Roles y permisos', 'Dashboard multi-sucursal', 'Soporte Prioritario'] },
                ENTERPRISE: { label: 'Plan Enterprise', color: 'bg-purple-600',  accent: 'text-purple-400',  icon: '🏢', features: ['Sucursales ilimitadas', 'Usuarios ilimitados', 'Facturación DIAN', 'API + Webhooks', 'Soporte Dedicado · SLA 99.9%'] },
              };
              const info = PLAN_INFO[plan] || PLAN_INFO['BASIC'];
              const statusLabel: Record<string, string> = { ACTIVE: 'Activo', INACTIVE: 'Inactivo', PENDING: 'Pendiente', PAST_DUE: 'Vencido', TRIAL: 'En prueba' };
              const statusColor: Record<string, string> = { ACTIVE: 'text-green-400', INACTIVE: 'text-red-400', PENDING: 'text-yellow-400', PAST_DUE: 'text-orange-400', TRIAL: 'text-emerald-400' };
              const st = safeCompany.subscription_status || 'ACTIVE';
              return (
                <div className="bg-slate-900 text-white p-5 rounded-xl shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10"><Shield size={90} /></div>
                  <div className="flex items-center gap-3 mb-4 relative z-10">
                    <div className={`p-2 ${info.color} rounded-lg text-lg leading-none`}>{info.icon}</div>
                    <div>
                      <h4 className="font-bold text-sm">{info.label}</h4>
                      <p className={`text-xs font-semibold ${statusColor[st] || 'text-slate-400'}`}>● {statusLabel[st] || st}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 mb-5 relative z-10">
                    {info.features.map((feat, i) => (
                      <div key={i} className="flex gap-2 items-center text-xs text-slate-300">
                        <Check size={11} className={info.accent} /><span>{feat}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setIsSecurityCheckOpen(true)}
                    className={`w-full py-2 ${info.color} hover:opacity-90 rounded-lg font-bold text-sm flex items-center justify-center gap-2 relative z-10 transition-all`}>
                    <Crown size={15} /> Gestionar plan
                  </button>
                </div>
              );
            })()}

          {activeTab !== 'BRANDING' && (
            <button type="submit" disabled={isSaving} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-70">
              <Save size={20} /> {isSaving ? 'Guardando...' : activeTab === 'GENERAL' ? 'Guardar Cambios' : 'Guardar Config. DIAN'}
            </button>
          )}
        </div>

        {/* TAB PAGOS */}
        {activeTab === 'PAGOS' && (
          <div className="md:col-span-3 space-y-5">

            {/* HEADER */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-1">
                <CreditCard size={20} className="text-purple-600" /> Métodos de pago del negocio
              </h3>
              <p className="text-sm text-slate-500">
                Configura cómo tus clientes pagan en el punto de venta. Activa solo los métodos que usas y completa los datos de <strong>tu propio</strong> cuenta o terminal — el dinero siempre va directo a ti.
              </p>
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex gap-2">
                <span>🔒</span>
                <span>Las credenciales se guardan cifradas en tu cuenta. POSmaster <strong>nunca</strong> procesa ni retiene ningún pago — somos solo la pantalla que conecta al cajero con tu pasarela.</span>
              </div>
              {plan !== 'ENTERPRISE' && (
                <div className="mt-3 p-3 rounded-lg border flex items-center justify-between gap-3"
                  style={{ background: plan === 'PRO' ? '#faf5ff' : '#f0fdf4', borderColor: plan === 'PRO' ? '#d8b4fe' : '#86efac' }}>
                  <div className="text-xs" style={{ color: plan === 'PRO' ? '#7c3aed' : '#15803d' }}>
                    {plan === 'PRO'
                      ? <><strong>Plan Pro:</strong> tienes Efectivo, Transferencia y Wompi. Actualiza a <strong>Enterprise</strong> para Bold, PayU y Datáfono físico.</>
                      : <><strong>Plan Basic:</strong> tienes Efectivo y Transferencia. Actualiza a <strong>Pro</strong> para Wompi o <strong>Enterprise</strong> para todos los métodos.</>
                    }
                  </div>
                  <button onClick={() => setIsSecurityCheckOpen(true)}
                    className="whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                    style={{ background: plan === 'PRO' ? '#8b5cf6' : '#16a34a' }}>
                    Ver planes
                  </button>
                </div>
              )}
            </div>

            {allowedMethods.includes('cash') && (
              <div className={`bg-white p-5 rounded-xl shadow-sm border-2 ${paymentProviders.cash.enabled ? 'border-green-400' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💵</span>
                    <div>
                      <p className="font-bold text-slate-800">Efectivo</p>
                      <p className="text-xs text-slate-500">Sin integración externa — el cajero registra manualmente el monto recibido y el cambio.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={paymentProviders.cash.enabled}
                      onChange={e => setPaymentProviders(p => ({ ...p, cash: { ...p.cash, enabled: e.target.checked } }))} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                  </label>
                </div>
                {paymentProviders.cash.enabled && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">
                    ✅ El POS mostrará campo de monto recibido y calculará el cambio automáticamente.
                  </div>
                )}
              </div>


            )}
            {allowedMethods.includes('dataphone') && (
              <div className={`bg-white p-5 rounded-xl shadow-sm border-2 ${paymentProviders.dataphone.enabled ? 'border-blue-400' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📟</span>
                    <div>
                      <p className="font-bold text-slate-800">Datáfono físico</p>
                      <p className="text-xs text-slate-500">Terminal propio con Redeban, Credibanco o Getnet. El cobro lo procesa tu banco — el POS solo guía al cajero.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={paymentProviders.dataphone.enabled}
                      onChange={e => setPaymentProviders(p => ({ ...p, dataphone: { ...p.dataphone, enabled: e.target.checked } }))} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                  </label>
                </div>
                {paymentProviders.dataphone.enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Adquirente / Red</label>
                        <select value={paymentProviders.dataphone.acquirer}
                          onChange={e => setPaymentProviders(p => ({ ...p, dataphone: { ...p.dataphone, acquirer: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400 outline-none">
                          <option value="redeban">Redeban Multicolor</option>
                          <option value="credibanco">Credibanco</option>
                          <option value="getnet">Getnet (Bancolombia)</option>
                          <option value="nequi">Nequi datafono</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Nota para el cajero (opcional)</label>
                        <input type="text" placeholder="Ej: Terminal caja 1, Visa/MC/Amex" value={paymentProviders.dataphone.note}
                          onChange={e => setPaymentProviders(p => ({ ...p, dataphone: { ...p.dataphone, note: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none" />
                      </div>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                      ℹ️ El POS mostrará al cajero: <em>"Cobrar ${'{total}'} en datáfono {paymentProviders.dataphone.acquirer} y confirmar"</em>. No hay integración automática — el aprobado lo verifica el cajero en el terminal.
                    </div>
                  </div>
                )}
              </div>


            )}
            {allowedMethods.includes('transfer') && (
              <div className={`bg-white p-5 rounded-xl shadow-sm border-2 ${paymentProviders.transfer.enabled ? 'border-indigo-400' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏛️</span>
                    <div>
                      <p className="font-bold text-slate-800">Transferencia bancaria / PSE</p>
                      <p className="text-xs text-slate-500">El POS muestra tus datos bancarios al cliente para que transfiera. Tú verificas el recibo.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={paymentProviders.transfer.enabled}
                      onChange={e => setPaymentProviders(p => ({ ...p, transfer: { ...p.transfer, enabled: e.target.checked } }))} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                  </label>
                </div>
                {paymentProviders.transfer.enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 mb-3">Datos bancarios que verá el cliente en pantalla y en el recibo:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Banco</label>
                        <input type="text" placeholder="Ej: Bancolombia" value={paymentProviders.transfer.bank_name}
                          onChange={e => setPaymentProviders(p => ({ ...p, transfer: { ...p.transfer, bank_name: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de cuenta</label>
                        <select value={paymentProviders.transfer.account_type}
                          onChange={e => setPaymentProviders(p => ({ ...p, transfer: { ...p.transfer, account_type: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-400 outline-none">
                          <option value="ahorros">Ahorros</option>
                          <option value="corriente">Corriente</option>
                          <option value="nequi">Nequi</option>
                          <option value="daviplata">Daviplata</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Número de cuenta / celular</label>
                        <input type="text" placeholder="Ej: 0123456789" value={paymentProviders.transfer.account_number}
                          onChange={e => setPaymentProviders(p => ({ ...p, transfer: { ...p.transfer, account_number: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo ID titular</label>
                        <select value={paymentProviders.transfer.id_type}
                          onChange={e => setPaymentProviders(p => ({ ...p, transfer: { ...p.transfer, id_type: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-400 outline-none">
                          <option value="NIT">NIT</option>
                          <option value="CC">Cédula (CC)</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Número de identificación del titular</label>
                        <input type="text" placeholder="Ej: 900123456-7" value={paymentProviders.transfer.id_number}
                          onChange={e => setPaymentProviders(p => ({ ...p, transfer: { ...p.transfer, id_number: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none" />
                      </div>
                    </div>
                    <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700">
                      ℹ️ El cajero podrá marcar la venta como <strong>"pendiente de verificación"</strong> hasta confirmar que el dinero llegó a tu cuenta.
                    </div>
                  </div>
                )}
              </div>


            )}
            {allowedMethods.includes('wompi') && (
              <div className={`bg-white p-5 rounded-xl shadow-sm border-2 ${paymentProviders.wompi.enabled ? 'border-emerald-400' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏦</span>
                    <div>
                      <p className="font-bold text-slate-800">Wompi <span className="text-xs font-normal text-slate-400">(de Bancolombia)</span></p>
                      <p className="text-xs text-slate-500">El POS genera un link de pago Wompi <strong>de tu cuenta</strong>. El dinero va a tu cuenta Bancolombia.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={paymentProviders.wompi.enabled}
                      onChange={e => setPaymentProviders(p => ({ ...p, wompi: { ...p.wompi, enabled: e.target.checked } }))} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
                {paymentProviders.wompi.enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Llave pública de tu cuenta Wompi</label>
                        <input type="text" placeholder="pub_prod_XXXXXXXX o pub_stagtest_XXXXXXXX"
                          value={paymentProviders.wompi.pub_key}
                          onChange={e => setPaymentProviders(p => ({ ...p, wompi: { ...p.wompi, pub_key: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 outline-none font-mono" />
                        <p className="text-xs text-slate-400 mt-1">Solo la llave pública — nunca la privada. Se usa solo para crear el link de pago.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Ambiente</label>
                        <select value={paymentProviders.wompi.env}
                          onChange={e => setPaymentProviders(p => ({ ...p, wompi: { ...p.wompi, env: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-400 outline-none">
                          <option value="prod">Producción (real)</option>
                          <option value="sandbox">Sandbox (pruebas)</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <a href="https://comercios.wompi.co" target="_blank" rel="noopener noreferrer"
                          className="text-xs text-emerald-600 hover:underline">🔗 Crear / ver mi cuenta Wompi</a>
                      </div>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-800">
                      ✅ Al cobrar, el POS abrirá el checkout de Wompi con el monto exacto. El cliente paga con tarjeta o PSE y el dinero llega a tu cuenta Bancolombia. POSmaster no toca el pago.
                    </div>
                  </div>
                )}
              </div>


            )}
            {allowedMethods.includes('bold') && (
              <div className={`bg-white p-5 rounded-xl shadow-sm border-2 ${paymentProviders.bold.enabled ? 'border-yellow-400' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">⚡</span>
                    <div>
                      <p className="font-bold text-slate-800">Bold</p>
                      <p className="text-xs text-slate-500">Genera un link de pago Bold <strong>de tu cuenta</strong>. Compatible con terminal físico Bold y link QR. Dinero va a tu cuenta Bold.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={paymentProviders.bold.enabled}
                      onChange={e => setPaymentProviders(p => ({ ...p, bold: { ...p.bold, enabled: e.target.checked } }))} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                  </label>
                </div>
                {paymentProviders.bold.enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">API Key de tu cuenta Bold</label>
                      <input type="password" placeholder="sk_prod_XXXXXXXX"
                        value={paymentProviders.bold.api_key}
                        onChange={e => setPaymentProviders(p => ({ ...p, bold: { ...p.bold, api_key: e.target.value } }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 outline-none font-mono" />
                      <p className="text-xs text-slate-400 mt-1">Encuéntrala en tu Dashboard Bold → Desarrolladores → API Keys.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <a href="https://bold.co" target="_blank" rel="noopener noreferrer"
                        className="text-xs text-yellow-600 hover:underline">🔗 Ir a mi cuenta Bold</a>
                      <a href="https://docs.bold.co" target="_blank" rel="noopener noreferrer"
                        className="text-xs text-slate-400 hover:underline">📄 Documentación Bold</a>
                    </div>
                    <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-xs text-yellow-800">
                      ✅ Al cobrar, el POS creará un link de pago Bold por el monto exacto y lo mostrará como QR o enlace. El cliente paga y el dinero llega a tu cuenta Bold. POSmaster no toca el pago.
                    </div>
                  </div>
                )}
              </div>


            )}
            {allowedMethods.includes('payu') && (
              <div className={`bg-white p-5 rounded-xl shadow-sm border-2 ${paymentProviders.payu.enabled ? 'border-orange-400' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💳</span>
                    <div>
                      <p className="font-bold text-slate-800">PayU Latam</p>
                      <p className="text-xs text-slate-500">Genera un link de pago PayU <strong>de tu cuenta</strong>. Acepta tarjetas, PSE, efectivo (Efecty). Dinero va a tu cuenta PayU.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={paymentProviders.payu.enabled}
                      onChange={e => setPaymentProviders(p => ({ ...p, payu: { ...p.payu, enabled: e.target.checked } }))} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>
                {paymentProviders.payu.enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Merchant ID</label>
                        <input type="text" placeholder="Tu Merchant ID" value={paymentProviders.payu.merchant_id}
                          onChange={e => setPaymentProviders(p => ({ ...p, payu: { ...p.payu, merchant_id: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">API Key</label>
                        <input type="password" placeholder="API Key PayU" value={paymentProviders.payu.api_key}
                          onChange={e => setPaymentProviders(p => ({ ...p, payu: { ...p.payu, api_key: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">API Login</label>
                        <input type="text" placeholder="API Login PayU" value={paymentProviders.payu.api_login}
                          onChange={e => setPaymentProviders(p => ({ ...p, payu: { ...p.payu, api_login: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none font-mono" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <a href="https://www.payu.com.co" target="_blank" rel="noopener noreferrer"
                        className="text-xs text-orange-600 hover:underline">🔗 Ir a mi cuenta PayU</a>
                      <a href="https://developers.payulatam.com" target="_blank" rel="noopener noreferrer"
                        className="text-xs text-slate-400 hover:underline">📄 Documentación PayU</a>
                    </div>
                    <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-800">
                      ✅ Al cobrar, el POS redirigirá al checkout de PayU con el monto exacto. El cliente paga y el dinero llega a tu cuenta PayU. POSmaster no toca el pago.
                    </div>
                  </div>
                )}
              </div>


            )}
            {allowedMethods.includes('paypal') && (
              <div className={`bg-white p-5 rounded-xl shadow-sm border-2 ${paymentProviders.paypal?.enabled ? 'border-blue-500' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🅿️</span>
                    <div>
                      <p className="font-bold text-slate-800">PayPal</p>
                      <p className="text-xs text-slate-500">Acepta pagos internacionales con PayPal. El cliente paga en la ventana de PayPal y el dinero llega a tu cuenta PayPal Business.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={paymentProviders.paypal?.enabled || false}
                      onChange={e => setPaymentProviders(p => ({ ...p, paypal: { ...(p.paypal || {}), enabled: e.target.checked } }))} />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                  </label>
                </div>
                {paymentProviders.paypal?.enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Client ID de tu cuenta PayPal Business</label>
                        <input type="text" placeholder="AXxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          value={paymentProviders.paypal?.client_id || ''}
                          onChange={e => setPaymentProviders(p => ({ ...p, paypal: { ...(p.paypal || {}), client_id: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none font-mono" />
                        <p className="text-xs text-slate-400 mt-1">Solo el Client ID (público). Encuéntralo en <strong>developer.paypal.com → My Apps → tu app → Client ID</strong>.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Ambiente</label>
                        <select value={paymentProviders.paypal?.env || 'production'}
                          onChange={e => setPaymentProviders(p => ({ ...p, paypal: { ...(p.paypal || {}), env: e.target.value } }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400 outline-none">
                          <option value="production">Producción (dinero real)</option>
                          <option value="sandbox">Sandbox (pruebas)</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <a href="https://developer.paypal.com/dashboard/applications" target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline">🔗 Obtener mi Client ID en PayPal Developer</a>
                      </div>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
                      ✅ Al cobrar con PayPal, el POS cargará el botón oficial de PayPal con el monto exacto. El cliente completa el pago en la ventana de PayPal. <strong>Solo necesitas el Client ID</strong> — no se requiere servidor ni webhooks para cobrar.
                    </div>
                  </div>
                )}
              </div>

            )}
            {/* BOTÓN GUARDAR */}
            <div className="flex justify-end pb-2">
              <button onClick={handleSavePayments} disabled={savingPayments}
                className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all shadow-md disabled:opacity-60">
                {savingPayments ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={18} />}
                Guardar configuración de pagos
              </button>
            </div>

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB CATÁLOGO WHATSAPP                                             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'CATALOGO' && (() => {
          const catalogUrl = `${window.location.origin}${window.location.pathname}#/catalogo/${safeCompany.id}`;
          const waShareUrl = `https://wa.me/?text=${encodeURIComponent('🛍️ Mira nuestro catálogo en línea:\n' + catalogUrl)}`;
          return (
            <div className="md:col-span-3 space-y-5">

              {/* Header */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-1">
                  🛍️ Catálogo Digital por WhatsApp
                </h3>
                <p className="text-sm text-slate-500">
                  Comparte un enlace público con tus clientes para que vean tus productos y te escriban directamente por WhatsApp.
                </p>
              </div>

              {/* Toggle habilitar */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">Habilitar catálogo público</p>
                    <p className="text-xs text-slate-400 mt-0.5">Cualquier persona con el link puede ver tus productos</p>
                  </div>
                  <button type="button" onClick={() => setCatalogEnabled(!catalogEnabled)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${catalogEnabled ? 'bg-green-500' : 'bg-slate-200'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${catalogEnabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {catalogEnabled && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-xs font-bold text-green-700 mb-2">🔗 Link de tu catálogo:</p>
                    <div className="flex gap-2">
                      <input readOnly value={catalogUrl}
                        className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-slate-600 font-mono" />
                      <button type="button"
                        onClick={() => { navigator.clipboard.writeText(catalogUrl); setCatalogLinkCopied(true); setTimeout(() => setCatalogLinkCopied(false), 2000); }}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 whitespace-nowrap">
                        {catalogLinkCopied ? '✓ Copiado' : 'Copiar'}
                      </button>
                      <a href={waShareUrl} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-2 bg-[#25D366] text-white rounded-lg text-xs font-bold hover:bg-[#1fba59] whitespace-nowrap flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Compartir
                      </a>
                    </div>
                    <a href={catalogUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-green-600 hover:underline">
                      👁️ Ver catálogo como cliente →
                    </a>
                  </div>
                )}
              </div>

              {/* Configuración WhatsApp */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                <h4 className="font-semibold text-slate-700">Configuración de contacto</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Número de WhatsApp
                    <span className="ml-2 text-xs text-slate-400 font-normal">Con o sin código de país (ej: 3001234567 o 573001234567)</span>
                  </label>
                  <input value={catalogWhatsapp} onChange={e => setCatalogWhatsapp(e.target.value)}
                    placeholder="3001234567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-400" />
                  {catalogWhatsapp && (
                    <a href={`https://wa.me/${catalogWhatsapp.replace(/\D/g,'').replace(/^(?!57)/,'57')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-green-600 hover:underline">
                      ✓ Probar este número →
                    </a>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Mensaje de apertura
                    <span className="ml-2 text-xs text-slate-400 font-normal">Se envía antes del nombre del producto</span>
                  </label>
                  <textarea value={catalogMessage} onChange={e => setCatalogMessage(e.target.value)}
                    rows={2} placeholder="¡Hola! Me interesa este producto:"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-400 resize-none" />
                  <p className="text-xs text-slate-400 mt-1">
                    Vista previa del mensaje que recibe tu WhatsApp: "<em>{catalogMessage} *Nombre del producto* Precio: $35.000</em>"
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1.5">
                <p className="font-semibold text-slate-600">¿Cómo funciona?</p>
                <p>• Comparte el link por WhatsApp, Instagram o donde quieras</p>
                <p>• Tus clientes ven todos tus productos con foto, precio y descripción</p>
                <p>• Cada producto tiene un botón "Pedir por WhatsApp" que abre el chat directo contigo</p>
                <p>• Para ocultar un producto del catálogo, desactívalo en Inventario</p>
              </div>

              {/* Botón guardar */}
              <div className="flex justify-end">
                <button type="button" onClick={handleSaveCatalog} disabled={savingCatalog}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 text-sm">
                  {savingCatalog ? 'Guardando...' : '💾 Guardar configuración'}
                </button>
              </div>

            </div>
          );
        })()}


      {/* ── TAB: HARDWARE ─────────────────────────────────────────── */}
      {activeTab === 'HARDWARE' && (
        <div className="md:col-span-3 space-y-6">

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                <Printer size={18} className="text-slate-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Cajón registradora</h3>
                <p className="text-xs text-slate-400">Cómo se abre el cajón al completar una venta</p>
              </div>
              {drawerSaved && <span className="ml-auto text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">✓ Guardado</span>}
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                {([
                  { id: 'escpos-usb',     icon: '🖨️', label: 'USB (ESC/POS via WebUSB)',  desc: 'Impresora térmica por USB directo. Requiere Chrome / Edge.' },
                  { id: 'escpos-network', icon: '🌐', label: 'Red / IP (ESC/POS)',           desc: 'Impresora térmica con IP en la red local.' },
                  { id: 'windows-print',  icon: '🪟', label: 'Impresora Windows',            desc: 'Impresora instalada en el sistema operativo.' },
                ] as const).map(opt => (
                  <label key={opt.id} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${(drawerConfig.protocol || 'escpos-usb') === opt.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="drawer-proto" value={opt.id}
                      checked={(drawerConfig.protocol || 'escpos-usb') === opt.id}
                      onChange={() => setDrawerConfig((p: any) => ({ ...p, protocol: opt.id }))}
                      className="mt-1" />
                    <span className="text-lg mt-0.5">{opt.icon}</span>
                    <div>
                      <p className="font-semibold text-sm text-slate-800">{opt.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {(drawerConfig.protocol || 'escpos-usb') === 'escpos-network' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">IP de la impresora</label>
                    <input value={(drawerConfig as any).networkIp || ''} onChange={e => setDrawerConfig((p: any) => ({ ...p, networkIp: e.target.value }))}
                      placeholder="192.168.1.100" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Puerto</label>
                    <input type="number" value={(drawerConfig as any).networkPort || 9100}
                      onChange={e => setDrawerConfig((p: any) => ({ ...p, networkPort: parseInt(e.target.value) || 9100 }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
              )}

              {(drawerConfig.protocol || 'escpos-usb') === 'windows-print' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de impresora (opcional)</label>
                  <input value={(drawerConfig as any).windowsPrinter || ''} onChange={e => setDrawerConfig((p: any) => ({ ...p, windowsPrinter: e.target.value }))}
                    placeholder="Ej: POS58 Thermal Printer" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                  <p className="text-xs text-slate-400 mt-1">Dejar vacío usa la impresora predeterminada</p>
                </div>
              )}

              <button onClick={() => saveDrawerConfig(drawerConfig)}
                className="w-full py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 flex items-center justify-center gap-2">
                <Cpu size={15} /> Guardar configuración del cajón
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                <Monitor size={18} className="text-slate-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Lector de códigos de barras</h3>
                <p className="text-xs text-slate-400">Sin configuración — funciona automáticamente como teclado</p>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-blue-800 mb-1">✅ Sin configuración requerida</p>
                <p className="text-xs text-blue-600">Conecta el lector por USB. El POS detecta el código escaneado y busca el producto automáticamente. Compatible con cualquier lector HID estándar.</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                <Wifi size={18} className="text-slate-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Balanza electrónica</h3>
                <p className="text-xs text-slate-400">Para negocios con productos pesables</p>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-amber-800 mb-1">⚖️ Se configura en el POS</p>
                <p className="text-xs text-amber-700">Al agregar un producto pesable en el Punto de Venta aparece la opción de conectar la balanza. Protocolos: Serial (Web Serial API), código de barras y manual.</p>
              </div>
            </div>
          </div>

        </div>
      )}
      </form>


      {/* MODAL DE SEGURIDAD (PASSWORD ADMIN) */}
      {isSecurityCheckOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-900 p-6 text-white text-center">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3"><Lock size={32} className="text-blue-400" /></div>
              <h3 className="font-bold text-lg">Acceso Restringido</h3>
              <p className="text-xs text-slate-400">Requiere autorizacion para cambiar planes.</p>
            </div>
            <form onSubmit={handleVerifyMasterKey} className="p-6">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Clave Maestra</label>
              <div className="relative mb-4">
                <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="password" autoFocus className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ingrese clave..." value={inputMasterKey} onChange={e => setInputMasterKey(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setIsSecurityCheckOpen(false); setInputMasterKey(''); }} className="flex-1 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg">Cancelar</button>
                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Verificar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE SUSCRIPCION (PLANES) */}
      {isSubscriptionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-2xl text-slate-800">Planes de Suscripcion</h3>
                <p className="text-slate-500 text-sm">Actualiza tu capacidad de operacion</p>
              </div>
              <button onClick={() => setIsSubscriptionModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={24} className="text-slate-500" /></button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {PLANS.map(plan => {
                  const isCurrent = safeCompany.subscription_plan === plan.id;
                  return (
                    <div key={plan.id} className={`bg-white rounded-xl p-6 border flex flex-col transition-all hover:shadow-lg ${isCurrent ? ((plan as any).enterprise ? 'border-purple-500 ring-2 ring-purple-500/20 shadow-lg' : 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg') : (plan as any).enterprise ? 'border-purple-200' : 'border-slate-200'}`}>
                      {(plan as any).popular && <div className="text-xs font-bold text-blue-600 bg-blue-50 rounded-full px-3 py-1 mb-3 self-start">⭐ Más Popular</div>}
                      {(plan as any).enterprise && <div className="text-xs font-bold text-purple-600 bg-purple-50 rounded-full px-3 py-1 mb-3 self-start">🏢 Enterprise</div>}
                      <div className="mb-4">
                        <h4 className="font-bold text-lg text-slate-800">{plan.name}</h4>
                        <div className={`text-2xl font-bold mt-2 ${(plan as any).enterprise ? 'text-purple-700' : 'text-slate-900'}`}>{plan.price}</div>
                      </div>
                      <div className="flex-1 space-y-3 mb-6">
                        {plan.features.map((feature, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                            <Check size={16} className={(plan as any).enterprise ? 'text-purple-500 flex-shrink-0' : 'text-green-500 flex-shrink-0'} />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>
                      {(plan as any).enterprise ? (
                        <button onClick={() => window.open('https://wa.me/573001234567?text=Hola%2C+quiero+info+del+plan+Enterprise+de+POSmaster', '_blank')}
                          className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white hover:from-purple-700 hover:to-violet-700 shadow-md transition-all">
                          <CreditCard size={18} /> Contactar Ventas
                        </button>
                      ) : (
                        <button disabled={isCurrent} onClick={() => handlePlanChange(plan.id)}
                          className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 ${isCurrent ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md active:translate-y-0.5 transition-all'}`}>
                          {isCurrent ? <><Check size={18} /> Plan Actual</> : <><CreditCard size={18} /> Seleccionar</>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Verificar contraseña para editar PIN de facturas ── */}
      {pinAuthOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-5 text-center">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <ShieldCheck size={28} className="text-white" />
              </div>
              <h3 className="text-white font-bold text-lg">Verificación de Identidad</h3>
              <p className="text-white/80 text-xs mt-1">
                Para modificar el PIN de facturas, confirma tu contraseña de acceso al sistema
              </p>
            </div>
            {/* Body */}
            <form onSubmit={handlePinAuth} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Tu contraseña de acceso
                </label>
                <div className="relative">
                  <input
                    type={pinAuthShowPw ? 'text' : 'password'}
                    autoFocus
                    value={pinAuthPassword}
                    onChange={e => setPinAuthPassword(e.target.value)}
                    placeholder="Ingresa tu contraseña..."
                    className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-400 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setPinAuthShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {pinAuthShowPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Esta es la misma contraseña con la que iniciaste sesión.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setPinAuthOpen(false); setPinAuthPassword(''); }}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-semibold text-sm hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pinAuthLoading || !pinAuthPassword}
                  className="flex-1 py-2.5 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {pinAuthLoading
                    ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Verificando...</>
                    : <><ShieldCheck size={15} /> Verificar</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Settings;