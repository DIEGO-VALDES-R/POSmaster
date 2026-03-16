import React, { useState, useEffect } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';
import { useCurrency } from '../contexts/CurrencyContext';
import { CheckCircle, ArrowRight, ArrowLeft, Package, ShoppingCart, Settings, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface OnboardingWizardProps { onComplete: () => void; }

const BUSINESS_TYPES = [
  { id: 'general',           label: 'Tienda General',           emoji: '🏪' },
  { id: 'tienda_tecnologia', label: 'Tecnología / Celulares',   emoji: '📱' },
  { id: 'restaurante',       label: 'Restaurante / Cafetería',  emoji: '🍽️' },
  { id: 'ropa',              label: 'Ropa / Moda',              emoji: '👗' },
  { id: 'zapateria',         label: 'Zapatería',                emoji: '👟' },
  { id: 'ferreteria',        label: 'Ferretería',               emoji: '🔧' },
  { id: 'farmacia',          label: 'Farmacia / Droguería',     emoji: '💊' },
  { id: 'salon',             label: 'Salón de Belleza',         emoji: '✂️' },
  { id: 'odontologia',       label: 'Odontología',              emoji: '🦷' },
  { id: 'veterinaria',       label: 'Veterinaria',              emoji: '🐾' },
  { id: 'optometria',        label: 'Optometría',               emoji: '👁️' },
  { id: 'supermercado',      label: 'Supermercado / Abarrotes', emoji: '🛒' },
  { id: 'otro',              label: 'Otro',                     emoji: '🏢' },
];

const STEPS = [
  { id: 'welcome',   label: 'Bienvenida',       icon: Sparkles },
  { id: 'business',  label: 'Tu negocio',        icon: Settings },
  { id: 'product',   label: 'Primer producto',   icon: Package },
  { id: 'pos',       label: 'Punto de Venta',    icon: ShoppingCart },
  { id: 'done',      label: '¡Listo!',           icon: CheckCircle },
];

// ─── Component ────────────────────────────────────────────────────────────────
const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const { company, companyId, updateCompanyConfig } = useDatabase();
  const { formatMoney } = useCurrency();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 — business config
  const [businessType, setBusinessType] = useState(
    (company?.config as any)?.business_types?.[0] || 'general'
  );
  const [whatsapp, setWhatsapp] = useState(company?.phone || '');
  const [address, setAddress] = useState(company?.address || '');

  // Step 2 — first product
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productCost, setProductCost] = useState('');
  const [productStock, setProductStock] = useState('1');
  const [productCategory, setProductCategory] = useState('');
  const [productSku, setProductSku] = useState('');
  const [skipProduct, setSkipProduct] = useState(false);

  const totalSteps = STEPS.length;
  const progress = (step / (totalSteps - 1)) * 100;

  const saveBusiness = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await supabase.from('companies').update({
        phone: whatsapp || null,
        address: address || null,
        config: {
          ...(company?.config || {}),
          business_type: businessType,
          business_types: [businessType],
          tax_rate: 19, currency_symbol: '$', invoice_prefix: 'POS',
        }
      }).eq('id', companyId);
      setStep(s => s + 1);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const saveProduct = async () => {
    if (skipProduct) { setStep(s => s + 1); return; }
    if (!productName || !productPrice) { toast.error('Nombre y precio son requeridos'); return; }
    if (!companyId) return;
    setSaving(true);
    try {
      const sku = productSku || productName.slice(0,6).toUpperCase().replace(/\s/g,'-') + '-001';
      const { data: branch } = await supabase.from('branches').select('id').eq('company_id', companyId).single();
      await supabase.from('products').insert({
        company_id: companyId,
        branch_id: branch?.id || null,
        name: productName,
        sku,
        price: parseFloat(productPrice),
        cost: parseFloat(productCost || '0'),
        stock_quantity: parseInt(productStock || '1'),
        stock_min: 2,
        category: productCategory || null,
        type: 'STANDARD',
        is_active: true,
        tax_rate: 19,
      });
      toast.success('¡Producto creado!');
      setStep(s => s + 1);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const completeOnboarding = () => {
    if (companyId) localStorage.setItem(`onboarding_done_${companyId}`, '1');
    onComplete();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Progress bar */}
        <div className="h-1.5 bg-slate-100">
          <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.id} className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  done  ? 'bg-green-500 text-white' :
                  active ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {done ? <CheckCircle size={16} /> : <Icon size={15} />}
                </div>
                <span className={`text-[9px] font-semibold hidden sm:block ${active ? 'text-blue-600' : done ? 'text-green-600' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-6 py-5 min-h-[380px] flex flex-col">

          {/* ── STEP 0: WELCOME ── */}
          {step === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-blue-200">
                🚀
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">
                  ¡Bienvenido a POSmaster!
                </h2>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                  Hola <strong>{company?.name}</strong>, en 3 pasos rápidos configuras tu negocio y haces tu primera venta.
                </p>
              </div>
              <div className="w-full space-y-2 pt-2">
                {[
                  { icon: '🏪', text: 'Confirma el tipo de tu negocio' },
                  { icon: '📦', text: 'Agrega tu primer producto' },
                  { icon: '💰', text: 'Conoce el Punto de Venta' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-xl text-sm text-slate-600">
                    <span className="text-lg">{item.icon}</span>
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 1: BUSINESS TYPE ── */}
          {step === 1 && (
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">¿Qué tipo de negocio tienes?</h2>
                <p className="text-slate-400 text-sm mt-1">Esto personaliza el menú y los módulos disponibles</p>
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                {BUSINESS_TYPES.map(bt => (
                  <button key={bt.id} type="button"
                    onClick={() => setBusinessType(bt.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                      businessType === bt.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}>
                    <span className="text-xl">{bt.emoji}</span>
                    <span className="text-[10px] font-semibold leading-tight">{bt.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">WhatsApp del negocio</label>
                  <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                    placeholder="3001234567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección</label>
                  <input value={address} onChange={e => setAddress(e.target.value)}
                    placeholder="Calle 123 # 45-67"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: FIRST PRODUCT ── */}
          {step === 2 && (
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-xl font-black text-slate-800">Agrega tu primer producto</h2>
                <p className="text-slate-400 text-sm mt-1">Puedes agregar más desde Inventario después</p>
              </div>

              {!skipProduct ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del producto *</label>
                      <input value={productName} onChange={e => setProductName(e.target.value)}
                        placeholder="Ej: Pantalla Samsung A54"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Precio de venta *</label>
                      <input type="number" min="0" value={productPrice} onChange={e => setProductPrice(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Costo</label>
                      <input type="number" min="0" value={productCost} onChange={e => setProductCost(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Stock inicial</label>
                      <input type="number" min="0" value={productStock} onChange={e => setProductStock(e.target.value)}
                        placeholder="1"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría</label>
                      <input value={productCategory} onChange={e => setProductCategory(e.target.value)}
                        placeholder="Ej: Pantallas"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                  </div>
                  {productName && productPrice && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
                      <span className="font-semibold">{productName}</span> · Precio: {formatMoney(parseFloat(productPrice||'0'))}
                      {productCost ? ` · Margen: ${Math.round((1 - parseFloat(productCost)/parseFloat(productPrice)) * 100)}%` : ''}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-8 space-y-3">
                  <span className="text-5xl">📦</span>
                  <p className="text-slate-500 text-sm">Puedes agregar productos luego desde <strong>Inventario</strong> en el menú lateral.</p>
                </div>
              )}

              <button type="button" onClick={() => setSkipProduct(s => !s)}
                className="text-xs text-slate-400 hover:text-slate-600 underline w-full text-center">
                {skipProduct ? '← Agregar un producto ahora' : 'Omitir por ahora →'}
              </button>
            </div>
          )}

          {/* ── STEP 3: POS TIP ── */}
          {step === 3 && (
            <div className="flex-1 flex flex-col justify-center space-y-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">Tu Punto de Venta está listo</h2>
                <p className="text-slate-400 text-sm mt-1">Así funciona en 3 clicks</p>
              </div>
              <div className="space-y-3">
                {[
                  { step: '1', color: 'bg-blue-100 text-blue-700',   icon: '🔍', title: 'Busca o escanea', desc: 'Escribe el nombre del producto o usa el escáner de barras' },
                  { step: '2', color: 'bg-indigo-100 text-indigo-700', icon: '🛒', title: 'Agrega al carrito', desc: 'Haz clic para agregar. Ajusta cantidades y aplica descuentos' },
                  { step: '3', color: 'bg-green-100 text-green-700',  icon: '💳', title: 'Cobra y factura', desc: 'Selecciona el método de pago y genera la factura en segundos' },
                ].map(item => (
                  <div key={item.step} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                    <div className={`w-8 h-8 rounded-full ${item.color} flex items-center justify-center font-black text-sm flex-shrink-0`}>
                      {item.step}
                    </div>
                    <div className="text-2xl">{item.icon}</div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                💡 <strong>Tip:</strong> Puedes abrir el POS desde el menú lateral o presionando <kbd className="bg-white border border-amber-200 rounded px-1 font-mono">F5</kbd>
              </div>
            </div>
          )}

          {/* ── STEP 4: DONE ── */}
          {step === 4 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-5xl shadow-lg shadow-green-200">
                  🎉
                </div>
                <div className="absolute -top-1 -right-1 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-lg">⭐</div>
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">¡Todo listo!</h2>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                  <strong>{company?.name}</strong> está configurado.<br/>
                  Ya puedes empezar a vender.
                </p>
              </div>
              <div className="w-full grid grid-cols-2 gap-3 pt-2">
                {[
                  { emoji: '💰', label: 'Ir al POS', path: '/pos', primary: true },
                  { emoji: '📦', label: 'Ver Inventario', path: '/inventory', primary: false },
                  { emoji: '📊', label: 'Dashboard', path: '/', primary: false },
                  { emoji: '⚙️', label: 'Configuración', path: '/settings', primary: false },
                ].map(btn => (
                  <button key={btn.path} onClick={() => {
                    completeOnboarding();
                    window.location.hash = btn.path;
                  }}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
                      btn.primary
                        ? 'bg-blue-600 text-white hover:bg-blue-700 col-span-2'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}>
                    <span className="text-lg">{btn.emoji}</span>
                    {btn.label}
                    {btn.primary && <ArrowRight size={16} className="ml-auto" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {step < 4 && (
          <div className="flex gap-3 px-6 pb-6">
            {step > 0 ? (
              <button onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium text-sm">
                <ArrowLeft size={15} /> Atrás
              </button>
            ) : (
              <button onClick={completeOnboarding}
                className="px-4 py-2.5 text-slate-400 hover:text-slate-600 font-medium text-sm">
                Omitir todo
              </button>
            )}
            <button
              onClick={step === 0 ? () => setStep(1) : step === 1 ? saveBusiness : step === 2 ? saveProduct : () => setStep(s => s + 1)}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : step === 0 ? 'Empezar configuración' : step === 3 ? '¡Entendido!' : 'Continuar'}
              {!saving && step < 3 && <ArrowRight size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingWizard;