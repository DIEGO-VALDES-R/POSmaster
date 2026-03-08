import React, { useState, useRef, useEffect } from 'react';
import { 
  Save, Building, Receipt, Shield, X, CreditCard, 
  Upload, Image as ImageIcon, Lock, KeyRound, 
  FileCode, Check, AlertTriangle, Palette 
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
  { id: 'ferreteria',        label: '🔧 Ferretería / Construcción' },
  { id: 'farmacia',          label: '💊 Farmacia / Droguería' },
  { id: 'supermercado',      label: '🛒 Supermercado / Abarrotes' },
  { id: 'salon',             label: '💇 Salón de Belleza / Spa' },
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

const MASTER_KEY = 'admin123';

const Settings: React.FC = () => {
  const { company, updateCompanyConfig, saveDianSettings } = useDatabase();

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
    BASIC:      ['cash', 'transfer'],
    PRO:        ['cash', 'transfer', 'wompi'],
    ENTERPRISE: ['cash', 'transfer', 'wompi', 'bold', 'payu', 'dataphone'],
  };
  const allowedMethods = ALLOWED_PAYMENT_METHODS[plan] || ALLOWED_PAYMENT_METHODS['BASIC'];

  const [formData, setFormData] = useState(safeCompany);
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'DIAN' | 'BRANDING' | 'PAGOS'>('GENERAL');
  const [taxRate, setTaxRate] = useState<number>(safeCompany.config?.tax_rate ?? 0);
  const [primaryColor, setPrimaryColor] = useState(
    safeCompany.primary_color || (safeCompany.config as any)?.primary_color || '#3b82f6'
  );
  const [secondaryColor, setSecondaryColor] = useState(
    safeCompany.secondary_color || (safeCompany.config as any)?.secondary_color || '#6366f1'
  );
  const [businessType, setBusinessType] = useState(
    safeCompany.business_type || (safeCompany.config as any)?.business_type || 'general'
  );
  const [savingBranding, setSavingBranding] = useState(false);
  const [paymentProviders, setPaymentProviders] = useState<Record<string, any>>({
    cash:      { enabled: true,  label: 'Efectivo',             icon: '💵' },
    dataphone: { enabled: false, label: 'Datáfono físico',      icon: '📟', acquirer: 'redeban', note: '' },
    transfer:  { enabled: false, label: 'Transferencia / PSE',  icon: '🏛️', bank_name: '', account_number: '', account_type: 'ahorros', id_type: 'NIT', id_number: '' },
    wompi:     { enabled: false, label: 'Wompi',                icon: '🏦', pub_key: '', env: 'prod' },
    bold:      { enabled: false, label: 'Bold',                 icon: '⚡', api_key: '' },
    payu:      { enabled: false, label: 'PayU',                 icon: '💳', merchant_id: '', api_key: '', api_login: '' },
  });
  const [savingPayments, setSavingPayments] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [dianForm, setDianForm] = useState<DianSettings>(safeCompany.dian_settings || {
    company_id: safeCompany.id, 
    software_id: '', 
    software_pin: '',
    resolution_number: '', 
    prefix: '', 
    current_number: 1,
    range_from: 1, 
    range_to: 10000, 
    technical_key: '',
    environment: DianEnvironment.TEST, 
    is_active: false
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
          config: { ...(formData.config || {}), tax_rate: taxRate }
        });
        toast.success('Configuración General Guardada');
      } 
      else if (activeTab === 'DIAN') {
        // 1. Guardar en Contexto local
        saveDianSettings(dianForm);
        
        // 2. Persistir en la tabla real 'business_settings' según tu captura
        const { error } = await supabase
          .from('business_settings')
          .update({ 
            dian_environment: dianForm.environment,
            dian_software_id: dianForm.software_id,
            dian_pin: dianForm.software_pin,
            invoice_mode: dianForm.is_active ? 'electronic' : 'general',
            // Asegúrate de mapear otras columnas si existen en tu DB
          })
          .eq('id', safeCompany.id);

        if (error) throw error;
        toast.success('Configuración DIAN Sincronizada');
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
        business_type: businessType,
      };
      const { error } = await supabase.from('companies')
        .update({ config: newConfig })
        .eq('id', safeCompany.id);
      if (error) throw error;
      await updateCompanyConfig({ config: newConfig } as any);
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
                    <p className="text-white/70 text-xs">{BUSINESS_TYPES.find(b => b.id === businessType)?.label || 'Tienda'}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Tipo de negocio</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {BUSINESS_TYPES.map(bt => (
                    <button key={bt.id} type="button" onClick={() => setBusinessType(bt.id)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium text-left transition-all ${businessType === bt.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                      {bt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Color de marca</label>
                <div className="flex flex-wrap gap-3">
                  {COLOR_PRESETS.map(preset => (
                    <button key={preset.label} type="button" onClick={() => { setPrimaryColor(preset.primary); setSecondaryColor(preset.secondary); }}
                      className={`w-10 h-10 rounded-full border-4 transition-all ${primaryColor === preset.primary ? 'border-slate-800 scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                      style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})` }} />
                  ))}
                </div>
              </div>

              <button type="button" onClick={handleSaveBranding} disabled={savingBranding}
                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-white transition-all shadow-md active:scale-[0.98]"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`, opacity: savingBranding ? 0.7 : 1 }}>
                <Save size={18} /> {savingBranding ? 'Guardando...' : 'Guardar Personalización'}
              </button>
            </div>
          )}

          {/* TAB DIAN - COMPLETO CON SWITCH */}
          {activeTab === 'DIAN' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                    <Receipt size={20} className="text-blue-600" /> Configuracion DIAN
                  </h3>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-700">Habilitar</label>
                    <button type="button" onClick={() => setDianForm({ ...dianForm, is_active: !dianForm.is_active })}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${dianForm.is_active ? 'bg-green-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ambiente</label>
                    <select className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none" 
                      value={dianForm.environment} 
                      onChange={e => setDianForm({ ...dianForm, environment: e.target.value as DianEnvironment })}>
                      <option value={DianEnvironment.TEST}>Pruebas / Habilitacion</option>
                      <option value={DianEnvironment.PRODUCTION}>Produccion</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Prefijo (Ej. SETT)</label>
                    <input type="text" placeholder="Ej: SETT" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none" value={dianForm.prefix} onChange={e => setDianForm({ ...dianForm, prefix: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">ID Software (DIAN)</label>
                    <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm outline-none" value={dianForm.software_id} onChange={e => setDianForm({ ...dianForm, software_id: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">PIN Software</label>
                    <input type="password" placeholder="••••••••" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none" value={dianForm.software_pin} onChange={e => setDianForm({ ...dianForm, software_pin: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Clave Tecnica</label>
                    <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm outline-none" value={dianForm.technical_key} onChange={e => setDianForm({ ...dianForm, technical_key: e.target.value })} />
                  </div>
                </div>

                {/* AREA DE CERTIFICADO */}
                <div className="mt-6 border-t pt-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Certificado Digital (.p12)</label>
                  <div className="flex items-center gap-3">
                    <button type="button" className="px-4 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-200 transition-colors">
                      <Upload size={16} /> Seleccionar
                    </button>
                    <span className="text-xs text-slate-400">Ningun archivo</span>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña Certificado</label>
                    <input type="password" placeholder="Clave del archivo .p12" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none" />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex gap-3">
                <AlertTriangle className="text-blue-600 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-blue-800 text-sm">Informacion Importante</h4>
                  <p className="text-xs text-blue-700 mt-1">Al activar PRODUCCION, todas las facturas seran enviadas a la DIAN. Complete las pruebas de habilitacion antes.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR DERECHO */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Shield size={100} /></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="p-2 bg-blue-600 rounded-lg"><Shield size={24} /></div>
              <div>
                <h4 className="font-bold">{currentPlan.name}</h4>
                <p className="text-xs text-slate-400">Estado: {safeCompany.subscription_status || 'ACTIVE'}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-slate-300 mb-6 relative z-10">
              <div className="flex gap-2 items-center text-xs"><Check size={12} className="text-green-400" /><span>5 Usuarios</span></div>
              <div className="flex gap-2 items-center text-xs"><Check size={12} className="text-green-400" /><span>3 Sucursales</span></div>
              <div className="flex gap-2 items-center text-xs"><Check size={12} className="text-green-400" /><span>Facturacion Electronica</span></div>
            </div>
            <button type="button" onClick={() => setIsSecurityCheckOpen(true)}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg font-bold flex items-center justify-center gap-2 relative z-10 transition-colors">
              <Lock size={16} /> Gestionar Suscripcion
            </button>
          </div>

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
    </div>
  );
};

export default Settings;