import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BarChart2, ShoppingCart, Package, Wrench,
  Tag,
  Settings, LogOut, Menu, Building2, User,
  Landmark, FileText, Globe, Receipt, ShieldCheck, Users, Utensils, ChefHat,
  Scissors, Stethoscope, FlaskConical, PawPrint, Pill, UserRound,
  ChevronDown, ChevronRight, ExternalLink, Users2, Truck, RotateCcw, CreditCard,
} from 'lucide-react';
import { useCurrency, CurrencyCode } from '../contexts/CurrencyContext';
import OnboardingWizard from './OnboardingWizard';
import NotificationBell from './NotificationBell';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';

interface LayoutProps { children: React.ReactNode; onAdminPanel?: () => void; }

const BUSINESS_ICONS: Record<string, string> = {
  general: '🏪', tienda_tecnologia: '📱', restaurante: '🍽️',
  ropa: '👗', zapateria: '👟', ferreteria: '🔧', farmacia: '💊',
  supermercado: '🛒', salon: '💇', odontologia: '🦷', veterinaria: '🐾', optometria: '👁️', otro: '📦',
};
const BUSINESS_LABELS: Record<string, string> = {
  general: 'Tienda General', tienda_tecnologia: 'Tecnología / Celulares',
  restaurante: 'Restaurante / Cafetería', ropa: 'Ropa / Calzado',
  zapateria: 'Zapatería / Marroquinería', ferreteria: 'Ferretería / Construcción',
  farmacia: 'Farmacia / Droguería', supermercado: 'Supermercado / Abarrotes',
  salon: 'Salón de Belleza / Spa', odontologia: 'Consultorio Odontológico',
  veterinaria: 'Clínica Veterinaria', optometria: 'Consultorio Optométrico', otro: 'Negocio',
};

// Rutas base de cada módulo (sin prefijo)
const MODULE_PATHS: Record<string, string> = {
  dashboard:   '/',
  pos:         '/pos',
  cash:        '/cash-control',
  inventory:   '/inventory',
  invoices:    '/invoices',
  quotes:      '/quotes',
  purchases:   '/purchases',
  creditNotes: '/credit-notes',
  customers:   '/customers',
  repairs:     '/repairs',
  tables:      '/tables',
  kitchen:     '/kitchen',
  salon:       '/salon',
  dentistry:   '/dentistry',
  veterinaria: '/veterinaria',
  farmacia:    '/farmacia',
  shoe:        '/shoe-repair',
  optometria:  '/optometria',
  receivables: '/receivables',
  payables:    '/payables',
  warehouse:   '/warehouse',
  supplies:    '/supplies',
  team:        '/team',
  nomina:      '/nomina',
  reports:     '/reports',
  apartados:   '/apartados',
};

// Tipo para items del menú con soporte de grupos
interface NavItem { label: string; path: string; icon: React.ElementType; }
interface NavGroup { group: string; items: NavItem[]; }
type NavEntry = NavItem | NavGroup;

function isNavGroup(e: NavEntry): e is NavGroup { return 'group' in e; }

function getNavItems(
  businessType: string,
  hasPermission: (k: string) => boolean,
  isAdmin: boolean,
  isPro: boolean,
  hasFeature: (f: string) => boolean,
  customRole?: string | null,
): NavEntry[] {
  const p = (key: string) => hasPermission(key) || isAdmin;
  const type = businessType || 'general';

  // ── Vista simplificada para Bodeguero ───────────────────────
  if (customRole === 'bodeguero') {
    const items: NavEntry[] = [
      { label: 'Dashboard',         path: MODULE_PATHS.dashboard,  icon: LayoutDashboard },
      { group: 'Bodega', items: [
        { label: 'Display Bodega',   path: MODULE_PATHS.warehouse,  icon: Package },
        { label: 'Inventario',       path: MODULE_PATHS.inventory,  icon: Package },
        { label: 'Órdenes de Compra',path: MODULE_PATHS.purchases,  icon: Truck },
      ]},
    ];
    return items;
  }

  const invLabel =
    ['restaurante','restaurant','cocina','cafeteria'].includes(type) ? 'Insumos Cocina' :
    type==='zapateria' ? 'Materiales' :
    type==='salon'||type==='salón' ? 'Insumos Salón' :
    type==='farmacia'  ? 'Insumos' :
    type==='veterinaria' ? 'Insumos Vet' :
    type==='odontologia' ? 'Insumos Dental' :
    'Inventario';

  const moduleLabel =
    ['restaurante','restaurant','cocina','cafeteria'].includes(type) ? 'Restaurante' :
    type==='salon'||type==='salón' ? 'Salón de Belleza' :
    type==='odontologia' ? 'Odontología' :
    type==='veterinaria' ? 'Veterinaria' :
    type==='farmacia'    ? 'Farmacia' :
    type==='optometria'  ? 'Optometría' :
    type==='zapateria'   ? 'Zapatería' :
    'Servicio Técnico';

  // ── Grupo Ventas ────────────────────────────────────────────
  const ventasItems: NavItem[] = [];
  if (p('can_sell'))            ventasItems.push({ label: 'Punto de Venta',     path: MODULE_PATHS.pos,         icon: ShoppingCart });
  if (p('can_open_cash'))       ventasItems.push({ label: 'Control de Caja',    path: MODULE_PATHS.cash,        icon: Landmark });
  if (p('can_view_reports'))    ventasItems.push({ label: 'Historial Facturas', path: MODULE_PATHS.invoices,    icon: Receipt });
  if (p('can_sell') && hasFeature('quotes'))
                                ventasItems.push({ label: 'Cotizaciones',       path: MODULE_PATHS.quotes,      icon: FileText });
  if (p('can_refund') && hasFeature('credit_notes'))
                                ventasItems.push({ label: 'Devoluciones / NC',  path: MODULE_PATHS.creditNotes, icon: RotateCcw });
  if (p('can_sell'))            ventasItems.push({ label: 'Apartados',          path: MODULE_PATHS.apartados,   icon: Tag });

  // ── Grupo Inventario ─────────────────────────────────────────
  const inventarioItems: NavItem[] = [];
  if (p('can_manage_inventory'))
                                inventarioItems.push({ label: invLabel,            path: MODULE_PATHS.inventory,   icon: Package });
  if (p('can_manage_inventory') && hasFeature('purchase_orders'))
                                inventarioItems.push({ label: 'Órdenes de Compra', path: MODULE_PATHS.purchases,   icon: Truck });
  if (isAdmin)                  inventarioItems.push({ label: 'Insumos',           path: MODULE_PATHS.supplies,    icon: FlaskConical });

  // ── Grupo Clientes y Finanzas ────────────────────────────────
  const finanzasItems: NavItem[] = [];
  if (p('can_view_reports'))    finanzasItems.push({ label: 'Clientes',       path: MODULE_PATHS.customers,   icon: UserRound });
  if (p('can_view_reports'))    finanzasItems.push({ label: 'Cartera / CxC',   path: MODULE_PATHS.receivables, icon: FileText });
  if (p('can_view_reports'))    finanzasItems.push({ label: 'Cuentas x Pagar', path: MODULE_PATHS.payables,    icon: CreditCard });

  // ── Grupo Módulo vertical ────────────────────────────────────
  const moduloItems: NavItem[] = [];
  if (['restaurante','restaurant','cocina','cafeteria'].includes(type)) {
    if (p('can_sell') && hasFeature('restaurant'))  moduloItems.push({ label: 'Mesas',          path: MODULE_PATHS.tables,      icon: Utensils });
    if (isAdmin && hasFeature('restaurant'))         moduloItems.push({ label: 'Display Cocina', path: MODULE_PATHS.kitchen,     icon: ChefHat });
  } else if ((type==='salon'||type==='salón') && hasFeature('salon')) {
    if (p('can_sell'))                               moduloItems.push({ label: 'Salón de Belleza', path: MODULE_PATHS.salon,     icon: Scissors });
  } else if (type==='odontologia' && hasFeature('dental')) {
    if (p('can_sell'))                               moduloItems.push({ label: 'Odontología',    path: MODULE_PATHS.dentistry,   icon: Stethoscope });
  } else if (type==='veterinaria' && hasFeature('vet')) {
    if (p('can_sell'))                               moduloItems.push({ label: 'Veterinaria',    path: MODULE_PATHS.veterinaria, icon: PawPrint });
  } else if (type==='farmacia' && hasFeature('pharmacy')) {
    if (p('can_sell'))                               moduloItems.push({ label: 'Farmacia',       path: MODULE_PATHS.farmacia,    icon: Pill });
  } else if (type==='optometria' && hasFeature('dental')) {
    if (p('can_sell'))                               moduloItems.push({ label: 'Optometría',     path: MODULE_PATHS.optometria,  icon: Stethoscope });
  } else if (type==='zapateria' && hasFeature('shoe_repair')) {
    if (p('can_view_repairs'))                       moduloItems.push({ label: 'Zapatería / Rep.', path: MODULE_PATHS.shoe,     icon: Wrench });
  } else if (type === 'general' || type === 'tienda_tecnologia' || type === 'otro') {
    if (p('can_view_repairs'))                       moduloItems.push({ label: 'Servicio Técnico', path: MODULE_PATHS.repairs,  icon: Wrench });
  }

  // ── Grupo Administración ─────────────────────────────────────
  const adminItems: NavItem[] = [];
  adminItems.push({ label: 'Reportes', path: MODULE_PATHS.reports, icon: BarChart2 });
  if (isPro && p('can_manage_team'))                    adminItems.push({ label: 'Equipo',  path: MODULE_PATHS.team,   icon: Users });
  if (isAdmin && hasFeature('nomina'))                  adminItems.push({ label: 'Nómina',  path: MODULE_PATHS.nomina, icon: Users2 });

  // ── Componer resultado ───────────────────────────────────────
  const result: NavEntry[] = [
    { label: 'Dashboard', path: MODULE_PATHS.dashboard, icon: LayoutDashboard },
  ];
  if (ventasItems.length)     result.push({ group: 'Ventas',                items: ventasItems });
  if (inventarioItems.length) result.push({ group: 'Inventario',            items: inventarioItems });
  if (finanzasItems.length)   result.push({ group: 'Clientes y Finanzas',   items: finanzasItems });
  if (moduloItems.length)     result.push({ group: `Módulo ${moduleLabel}`, items: moduloItems });
  if (adminItems.length)      result.push({ group: 'Administración',        items: adminItems });

  return result;
}

// Helper para obtener lista plana (para secciones inactivas / preview)
function flatNavItems(entries: NavEntry[]): NavItem[] {
  return entries.flatMap(e => isNavGroup(e) ? e.items : [e]);
}

// ── NavLink ───────────────────────────────────────────────────────────────────
const NavLink: React.FC<{
  item:      { label: string; path: string; icon: React.ElementType };
  isActive:  boolean;
  fontColor: string;
  onClick?:  () => void;
}> = ({ item, isActive, fontColor, onClick }) => (
  <Link
    to={item.path}
    onClick={onClick}
    className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-sm"
    style={{
      background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
      color:      fontColor,
      fontWeight: isActive ? 700 : 400,
      opacity:    isActive ? 1 : 0.85,
    }}
  >
    <item.icon size={16} />
    <span>{item.label}</span>
  </Link>
);

// ── BranchSection ─────────────────────────────────────────────────────────────
// activeSectionId: la sección que "posee" los items activos del menú
// Solo la sección activa evalúa isActive — las demás nunca resaltan nada
const BranchSection: React.FC<{
  sectionId:      string;           // id único de esta sección (companyId + businessType)
  companyId:      string;
  branchLinkId?:  string;           // id para generar link de sucursal (solo child branches)
  name:           string;
  businessType:   string;
  items:          NavEntry[];
  activeSectionId: string;          // ← CLAVE: qué sección está actualmente activa
  setActiveSectionId: (id: string) => void;
  fontColor:      string;
  defaultOpen?:   boolean;
  onNav?:         () => void;
  onActivate:     (companyId: string, sectionId: string) => Promise<void>;
  switching:      boolean;
  currentPath:    string;
}> = ({
  sectionId, companyId, branchLinkId, name, businessType, items,
  activeSectionId, setActiveSectionId,
  fontColor, defaultOpen = false,
  onNav, onActivate, switching, currentPath,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const isThisActive = activeSectionId === sectionId;

  // isActive SOLO funciona si esta sección es la activa
  // → previene que todas las secciones resalten el mismo path
  const isActive = (path: string) => isThisActive && currentPath === path;

  const icon  = BUSINESS_ICONS[businessType]  || '🏪';
  const label = BUSINESS_LABELS[businessType] || 'Negocio';
  const isCurrentlyActive = isThisActive;

  const handleHeaderClick = async () => {
    if (!isCurrentlyActive) {
      await onActivate(companyId, sectionId);
      setOpen(true);
    } else {
      setOpen(o => !o);
    }
  };

  return (
    <div className="mb-1">
      <button
        onClick={handleHeaderClick}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all"
        style={{
          background: isCurrentlyActive
            ? 'rgba(255,255,255,0.12)'
            : open ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
          color:   fontColor,
          border:  isCurrentlyActive ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
          cursor:  'pointer',
          opacity: switching && !isCurrentlyActive ? 0.55 : 1,
          transition: 'all 0.15s',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0">{icon}</span>
          <div className="text-left min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold truncate leading-tight">{name}</p>
              {isCurrentlyActive && (
                <span style={{
                  background: 'rgba(59,130,246,0.35)', color: '#93c5fd',
                  fontSize: 9, fontWeight: 700, padding: '1px 5px',
                  borderRadius: 4, flexShrink: 0,
                }}>ACTIVO</span>
              )}
            </div>
            <p className="text-[10px] truncate leading-tight" style={{ opacity: 0.5 }}>{label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {switching && !isCurrentlyActive && (
            <div style={{
              width: 10, height: 10,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff', borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
          )}
          {open ? <ChevronDown size={13} style={{ opacity: 0.55 }} /> : <ChevronRight size={13} style={{ opacity: 0.55 }} />}
        </div>
      </button>

      {open && (
        <div className="ml-3 mt-0.5 pl-2 space-y-0.5"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.12)' }}>

          {!isCurrentlyActive ? (
            /* Sección inactiva: preview + botón para abrir en nueva pestaña */
            <>
              {branchLinkId && (
                <button
                  onClick={() => window.open(`${window.location.origin}/#/sucursal/${branchLinkId}`, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg w-full text-left"
                  style={{ color: '#60a5fa', fontSize: 11, fontWeight: 600, background: 'rgba(59,130,246,0.1)', marginBottom: 3 }}>
                  <ExternalLink size={11} />
                  <span>Abrir en nueva pestaña</span>
                </button>
              )}
              <div style={{ opacity: 0.35, pointerEvents: 'none' }}>
                {flatNavItems(items).slice(0, 5).map(item => (
                  <div key={item.path} className="flex items-center gap-2.5 px-3 py-1.5 text-sm" style={{ color: fontColor }}>
                    <item.icon size={14} />
                    <span style={{ fontSize: 12 }}>{item.label}</span>
                  </div>
                ))}
                {flatNavItems(items).length > 5 && (
                  <p className="px-3 py-1 text-[10px]" style={{ color: fontColor, opacity: 0.4 }}>
                    +{flatNavItems(items).length - 5} módulos más…
                  </p>
                )}
              </div>
            </>
          ) : (
            /* Sección activa: items con grupos y separadores */
            items.map((entry, idx) => {
              if (isNavGroup(entry)) {
                return (
                  <div key={entry.group}>
                    {idx > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0 2px' }} />}
                    <p style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                      textTransform: 'uppercase', opacity: 0.4,
                      color: fontColor, padding: '4px 12px 2px',
                    }}>{entry.group}</p>
                    {entry.items.map(item => (
                      <NavLink key={item.path} item={item} isActive={isActive(item.path)} fontColor={fontColor} onClick={onNav} />
                    ))}
                  </div>
                );
              }
              return (
                <NavLink key={entry.path} item={entry} isActive={isActive(entry.path)} fontColor={fontColor} onClick={onNav} />
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

// ── Layout ────────────────────────────────────────────────────────────────────
const Layout: React.FC<LayoutProps> = ({ children, onAdminPanel }) => {
  const location = useLocation();
  const navigate  = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const { company, companyId, isLoading, userRole, customRole, hasPermission, hasFeature, switchCompany } = useDatabase();
  const [childBranches, setChildBranches] = useState<any[]>([]);
  const [switching, setSwitching] = useState(false);

  // ── sectionId activo: companyId + businessType ────────────────────────────
  // Garantiza que cada sección (incluso del mismo negocio con múltiples tipos)
  // sea independiente. Ej: "abc123__restaurante" vs "abc123__salon"
  const makeSectionId = (cid: string, bt: string) => `${cid}__${bt}`;

  const cfg = (company?.config as any) || {};
  const mainBusinessTypes: string[] = Array.isArray(cfg.business_types)
    ? cfg.business_types
    : cfg.business_type ? [cfg.business_type] : ['general'];

  // El sectionId activo por defecto es el primer tipo del negocio actual
  const defaultSectionId = companyId
    ? makeSectionId(companyId, mainBusinessTypes[0] || 'general')
    : '';
  const [activeSectionId, setActiveSectionIdState] = useState(defaultSectionId);

  // Sincronizar tipo de negocio activo con localStorage al inicializar
  useEffect(() => {
    const bt = defaultSectionId.split('__')[1] || mainBusinessTypes[0] || 'general';
    localStorage.setItem('posmaster_active_business_type', bt);
    window.dispatchEvent(new Event('posmaster_business_type_changed'));
  }, [defaultSectionId]);

  // Cuando el companyId cambia (switchCompany), actualizar el sectionId activo
  const prevCompanyId = useRef<string | null>(null);
  useEffect(() => {
    if (companyId && companyId !== prevCompanyId.current) {
      prevCompanyId.current = companyId;
      // Calcular el primer tipo de la empresa recién activa
      const firstType = mainBusinessTypes[0] || 'general';
      setActiveSectionIdState(makeSectionId(companyId, firstType));
    }
  }, [companyId]);

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const plan      = company?.subscription_plan || 'BASIC';

  // Onboarding — mostrar la primera vez que un ADMIN nuevo entra
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!companyId || !company || userRole !== 'ADMIN') return;
    const key = `onboarding_done_${companyId}`;
    if (!localStorage.getItem(key)) setShowOnboarding(true);
  }, [companyId, company, userRole]);
  // BUG FIX: branches are created with plan='BASIC' but their parent is PRO.
  // Employees who log into a branch must still see the full menu.
  const isBranch  = !!(company as any)?.negocio_padre_id;
  const isPro     = isBranch || ['PRO', 'ENTERPRISE', 'MASTER'].includes(plan);
  const isAdmin   = userRole === 'MASTER' || userRole === 'ADMIN';
  const brandColor = (company?.config as any)?.primary_color || '#1e293b';
  const fontColor  = (company?.config as any)?.font_color    || '#ffffff';
  const companyName = company?.name ?? 'POSmaster';
  const logoUrl     = company?.logo_url ?? null;

  // Id del negocio raíz
  const [rootCompanyId, setRootCompanyId] = useState<string | null>(null);
  useEffect(() => {
    if (!company?.id) return;
    const padreId = (company as any).negocio_padre_id;
    setRootCompanyId(padreId || company.id);
  }, [company?.id]);

  useEffect(() => {
    // Employees of a branch (non-admin) must NEVER see or switch to other companies
    if (!rootCompanyId || !isPro || (isBranch && !isAdmin)) { setChildBranches([]); return; }
    supabase
      .from('companies')
      .select('id, name, config, subscription_status')
      .eq('negocio_padre_id', rootCompanyId)
      .eq('subscription_status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .then(({ data }) => setChildBranches(data || []));
  }, [rootCompanyId, isPro, isBranch, isAdmin]);

  // Activar una sección: si es otra empresa → switchCompany, luego setActiveSectionId
  const handleActivate = useCallback(async (cid: string, sid: string) => {
    setActiveSectionIdState(sid);
    // Extraer el businessType del sectionId (formato: "companyId__businessType")
    const activeBt = sid.split('__')[1] || 'general';
    localStorage.setItem('posmaster_active_business_type', activeBt);
    // Notificar a DatabaseContext para que recargue los productos del nuevo tipo
    window.dispatchEvent(new Event('posmaster_business_type_changed'));
    if (cid !== companyId) {
      setSwitching(true);
      await switchCompany(cid);
      setSwitching(false);
    }
    // Navegar al dashboard al cambiar sección
    navigate('/');
  }, [companyId, switchCompany, navigate]);

  const hexToRgb = (hex: string) => {
    if (!hex || hex.length < 7) return '30,41,59';
    return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
  };
  const brandRgb = brandColor.startsWith('#') ? hexToRgb(brandColor) : '30,41,59';

  const roleDisplay =
    userRole === 'MASTER' ? 'Propietario' :
    userRole === 'ADMIN'  ? 'Administrador' : userRole || 'Usuario';

  const isActivePath = (p: string) => location.pathname === p;

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => {
    // Branch employees must only see their own company, never the parent root.
    // Only ADMIN/MASTER can see and switch between companies.
    const rootCid = (isBranch && !isAdmin) ? (companyId || '') : (rootCompanyId || companyId || '');

    return (
      <>
        {/* Header */}
        <div className="p-4 flex items-center gap-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{ background: logoUrl ? '#fff' : 'rgba(0,0,0,0.3)' }}>
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain mix-blend-multiply" />
              : <Building2 size={20} className="text-white" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-sm leading-tight truncate" style={{ color: fontColor }} title={companyName}>
              {companyName}
            </h1>
            <p className="text-[10px]" style={{ color: fontColor, opacity: 0.5 }}>POSmaster</p>
          </div>

          {/* Quick branch switcher icon — solo si hay sucursales */}
          {childBranches.length > 0 && isAdmin && (
            <div className="relative flex-shrink-0" title="Cambiar sucursal">
              <button
                onClick={e => { e.stopPropagation(); (window as any)._branchDropOpen = !(window as any)._branchDropOpen; document.getElementById('branch-quick-drop')?.classList.toggle('hidden'); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,0.15)', color: fontColor }}>
                <Building2 size={14} />
              </button>
              <div id="branch-quick-drop" className="hidden absolute right-0 top-9 z-50 rounded-xl shadow-xl border overflow-hidden"
                style={{ background: '#1e293b', borderColor: 'rgba(255,255,255,0.15)', minWidth: 200 }}>
                {/* Sede principal */}
                <button
                  onClick={() => { handleActivate(rootCid, `${rootCid}__general`); document.getElementById('branch-quick-drop')?.classList.add('hidden'); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/10 transition-colors"
                  style={{ borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: brandColor }}>
                    <Building2 size={11} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{companyName}</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Sede principal</p>
                  </div>
                  {companyId === rootCid && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-auto flex-shrink-0" />}
                </button>
                {/* Sucursales hijas */}
                {childBranches.map(b => (
                  <button key={b.id}
                    onClick={() => { const bt = b.config?.business_type || 'general'; handleActivate(b.id, `${b.id}__${bt}`); document.getElementById('branch-quick-drop')?.classList.add('hidden'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/10 transition-colors"
                    style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: (b.config as any)?.primary_color || '#475569' }}>
                      <Building2 size={11} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{b.name}</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Sucursal</p>
                    </div>
                    {companyId === b.id && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {(childBranches.length > 0 || mainBusinessTypes.length > 1) && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: fontColor, opacity: 0.35 }}>
              Negocios
            </p>
          </div>
        )}

        {/* Acordeón */}
        <nav className="flex-1 p-3 overflow-y-auto space-y-1">
          {/* Negocio principal — una sección por cada tipo de negocio */}
          {mainBusinessTypes.map((bt) => {
            const sid = makeSectionId(rootCid, bt);
            return (
              <BranchSection
                key={sid}
                sectionId={sid}
                companyId={rootCid}
                name={companyName}
                businessType={bt}
                items={getNavItems(bt, hasPermission, isAdmin, isPro, hasFeature, customRole)}
                activeSectionId={activeSectionId}
                setActiveSectionId={setActiveSectionIdState}
                fontColor={fontColor}
                defaultOpen={activeSectionId === sid}
                onNav={onNav}
                onActivate={handleActivate}
                switching={switching}
                currentPath={location.pathname}
              />
            );
          })}

          {/* Sucursales hijas */}
          {childBranches.map(b => {
            const bt = b.config?.business_type || b.config?.business_types?.[0] || 'general';
            const sid = makeSectionId(b.id, bt);
            return (
              <BranchSection
                key={sid}
                sectionId={sid}
                companyId={b.id}
                branchLinkId={b.id}
                name={b.name}
                businessType={bt}
                items={getNavItems(bt, hasPermission, isAdmin, isPro, hasFeature, customRole)}
                activeSectionId={activeSectionId}
                setActiveSectionId={setActiveSectionIdState}
                fontColor={fontColor}
                defaultOpen={activeSectionId === sid}
                onNav={onNav}
                onActivate={handleActivate}
                switching={switching}
                currentPath={location.pathname}
              />
            );
          })}
        </nav>

        {/* Sucursales + Configuración */}
        <div className="px-3 pb-2 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 10 }}>
          {isPro && isAdmin && (
            <Link to="/branches" onClick={onNav}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-sm w-full"
              style={{
                background: isActivePath('/branches') ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: fontColor, fontWeight: isActivePath('/branches') ? 700 : 400,
                opacity: isActivePath('/branches') ? 1 : 0.8,
              }}>
              <Building2 size={16} /> Sucursales
            </Link>
          )}
          {isAdmin && (
            <Link to="/settings" onClick={onNav}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-sm w-full"
              style={{
                background: isActivePath('/settings') ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: fontColor, fontWeight: isActivePath('/settings') ? 700 : 400,
                opacity: isActivePath('/settings') ? 1 : 0.8,
              }}>
              <Settings size={16} /> Configuración
            </Link>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 space-y-1.5 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <Globe size={14} style={{ color: fontColor, opacity: 0.7 }} />
            <select value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}
              className="bg-transparent text-xs font-medium focus:outline-none w-full cursor-pointer"
              style={{ color: fontColor }}>
              <option value="COP" className="text-slate-900">COP (Peso)</option>
              <option value="USD" className="text-slate-900">USD (Dólar)</option>
              <option value="EUR" className="text-slate-900">EUR (Euro)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
              <User size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate" style={{ color: fontColor }}>{company?.name || companyName}</p>
              <p className="text-[10px]" style={{ color: fontColor, opacity: 0.6 }}>{roleDisplay}</p>
            </div>
            <NotificationBell companyId={companyId || null} fontColor={fontColor} />
          </div>

          {onAdminPanel && (
            <button onClick={onAdminPanel}
              className="flex w-full items-center gap-2 px-3 py-2 text-purple-300 hover:bg-purple-900/20 rounded-lg transition-colors text-xs font-medium">
              <ShieldCheck size={14} /> Panel POSmaster
            </button>
          )}
          <button onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors text-xs font-medium">
            <LogOut size={14} /> Cerrar Sesión
          </button>
        </div>

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </>
    );
  };

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
      <div className="flex h-screen bg-slate-50">
        <aside className="hidden md:flex flex-col w-60 text-white shadow-xl flex-shrink-0"
          style={{ background: brandColor, transition: 'background 0.4s ease' }}>
          <SidebarContent />
        </aside>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col"
          style={{ background: `rgba(${brandRgb},0.97)` }}>
          <div className="flex justify-end p-4 flex-shrink-0">
            <button onClick={() => setIsMobileMenuOpen(false)} className="text-white text-2xl font-bold">✕</button>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <SidebarContent onNav={() => setIsMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Banner cuando se está en una sucursal */}
        {company && (company as any).negocio_padre_id && (
          <div style={{
            background: 'linear-gradient(135deg,#1d4ed8,#4f46e5)',
            color: '#fff', padding: '5px 16px', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>🏢 Sucursal: <strong>{company.name}</strong></span>
            <button
              onClick={async () => {
                if (rootCompanyId) {
                  const firstBt = mainBusinessTypes[0] || 'general';
                  await handleActivate(rootCompanyId, makeSectionId(rootCompanyId, firstBt));
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.2)', border: 'none',
                color: '#fff', padding: '2px 10px', borderRadius: 6,
                cursor: 'pointer', fontWeight: 700, fontSize: 11,
              }}>
              ← Volver al principal
            </button>
          </div>
        )}

        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            {logoUrl && <img src={logoUrl} className="w-8 h-8 rounded object-cover" alt="logo" />}
            <h1 className="font-bold text-slate-800 text-sm">{companyName}</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-600">
            <Menu size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {isLoading || switching
              ? (
                <div className="flex items-center justify-center h-full flex-col gap-3">
                  <div style={{
                    width: 36, height: 36,
                    border: '3px solid #e2e8f0', borderTop: '3px solid #3b82f6',
                    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                  }} />
                  <p className="text-slate-400 text-sm animate-pulse">
                    {switching ? 'Cambiando sucursal…' : 'Cargando datos…'}
                  </p>
                </div>
              )
              : children}
          </div>
        </div>
      </main>
    </div>
    </>
  );
};

export default Layout;