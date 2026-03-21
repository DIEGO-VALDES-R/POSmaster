import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BarChart2, ShoppingCart, Package, Wrench,
  Tag,
  Settings, LogOut, Menu, Building2, User,
  Landmark, FileText, Globe, Receipt, ShieldCheck, Users, Utensils, ChefHat,
  Scissors, Stethoscope, FlaskConical, PawPrint, Pill, UserRound,
  ChevronDown, ChevronRight, ChevronLeft, ExternalLink, Users2, Truck, RotateCcw, CreditCard, Dumbbell,
  RefreshCw, TrendingDown, Cpu, X,
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
  expenses:    '/expenses',
  hardware:    '/hardware',
  settings:    '/settings',
  branches:    '/branches',
  warehouse:   '/warehouse',
  gimnasio:    '/gimnasio',
  panaderia:   '/panaderia',
  supplies:    '/supplies',
  team:        '/team',
  nomina:      '/nomina',
  reports:     '/reports',
  apartados:   '/apartados',
  b2b:         '/b2b',
};

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

  if (customRole === 'bodeguero') {
    return [
      { label: 'Dashboard', path: MODULE_PATHS.dashboard, icon: LayoutDashboard },
      { group: 'Bodega', items: [
        { label: 'Display Bodega', path: MODULE_PATHS.warehouse, icon: Package },
        { label: 'Inventario', path: MODULE_PATHS.inventory, icon: Package },
        { label: 'Órdenes de Compra', path: MODULE_PATHS.purchases, icon: Truck },
      ]},
    ];
  }

  const invLabel =
    type==='gimnasio'  ? 'Insumos / Stock' :
    type==='panaderia' ? 'Insumos y materias primas' :
    ['restaurante','restaurant','cocina','cafeteria'].includes(type) ? 'Insumos Cocina' :
    type==='zapateria' ? 'Materiales' :
    type==='salon'||type==='salón' ? 'Insumos Salón' :
    type==='farmacia'  ? 'Insumos' :
    type==='veterinaria' ? 'Insumos Vet' :
    type==='odontologia' ? 'Insumos Dental' :
    'Inventario';

  const moduleLabel =
    type==='gimnasio'  ? 'Gimnasio' :
    type==='panaderia' ? 'Panadería' :
    ['restaurante','restaurant','cocina','cafeteria'].includes(type) ? 'Restaurante' :
    type==='salon'||type==='salón' ? 'Salón de Belleza' :
    type==='odontologia' ? 'Odontología' :
    type==='veterinaria' ? 'Veterinaria' :
    type==='farmacia'    ? 'Farmacia' :
    type==='optometria'  ? 'Optometría' :
    type==='zapateria'   ? 'Zapatería' :
    'Servicio Técnico';

  const ventasItems: NavItem[] = [];
  if (p('can_sell'))            ventasItems.push({ label: 'Punto de Venta',     path: MODULE_PATHS.pos,         icon: ShoppingCart });
  if (p('can_open_cash'))       ventasItems.push({ label: 'Control de Caja',    path: MODULE_PATHS.cash,        icon: Landmark });
  if (p('can_view_reports'))    ventasItems.push({ label: 'Historial Facturas', path: MODULE_PATHS.invoices,    icon: Receipt });
  if (p('can_sell') && hasFeature('quotes'))
                                ventasItems.push({ label: 'Cotizaciones',       path: MODULE_PATHS.quotes,      icon: FileText });
  if (p('can_refund') && hasFeature('credit_notes'))
                                ventasItems.push({ label: 'Devoluciones / NC',  path: MODULE_PATHS.creditNotes, icon: RotateCcw });
  if (p('can_sell'))            ventasItems.push({ label: 'Apartados',          path: MODULE_PATHS.apartados,   icon: Tag });

  const inventarioItems: NavItem[] = [];
  if (p('can_manage_inventory'))
                                inventarioItems.push({ label: invLabel,            path: MODULE_PATHS.inventory,   icon: Package });
  if (p('can_manage_inventory') && hasFeature('purchase_orders'))
                                inventarioItems.push({ label: 'Órdenes de Compra', path: MODULE_PATHS.purchases,   icon: Truck });
  if (isAdmin)                  inventarioItems.push({ label: 'Insumos',           path: MODULE_PATHS.supplies,    icon: FlaskConical });

  const finanzasItems: NavItem[] = [];
  if (p('can_view_reports'))    finanzasItems.push({ label: 'Clientes',         path: MODULE_PATHS.customers,   icon: UserRound });
  if (p('can_view_reports'))    finanzasItems.push({ label: 'Cartera / CxC',    path: MODULE_PATHS.receivables, icon: FileText });
  if (p('can_view_reports'))    finanzasItems.push({ label: 'Cuentas x Pagar',  path: MODULE_PATHS.payables,    icon: CreditCard });
  if (isAdmin && hasFeature('op_expenses')) finanzasItems.push({ label: 'Gastos Operativos', path: MODULE_PATHS.expenses, icon: TrendingDown });

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
  } else if (type === 'gimnasio') {
    if (p('can_sell'))  moduloItems.push({ label: 'Gimnasio',  path: MODULE_PATHS.gimnasio,  icon: Dumbbell });
  } else if (type === 'panaderia') {
    if (p('can_sell'))  moduloItems.push({ label: 'Panadería', path: MODULE_PATHS.panaderia, icon: Package });
  } else if (type === 'general' || type === 'tienda_tecnologia' || type === 'otro') {
    if (p('can_view_repairs'))                       moduloItems.push({ label: 'Servicio Técnico', path: MODULE_PATHS.repairs,  icon: Wrench });
  }

  const adminItems: NavItem[] = [];
  adminItems.push({ label: 'Reportes', path: MODULE_PATHS.reports, icon: BarChart2 });
  adminItems.push({ label: 'Marketplace B2B', path: MODULE_PATHS.b2b, icon: Building2 });
  if (isPro && p('can_manage_team'))   adminItems.push({ label: 'Equipo',  path: MODULE_PATHS.team,   icon: Users });
  if (isAdmin && hasFeature('nomina')) adminItems.push({ label: 'Nómina',  path: MODULE_PATHS.nomina, icon: Users2 });

  const result: NavEntry[] = [
    { label: 'Dashboard', path: MODULE_PATHS.dashboard, icon: LayoutDashboard },
  ];
  if (ventasItems.length)     result.push({ group: 'Ventas',                items: ventasItems });
  if (inventarioItems.length) result.push({ group: 'Inventario',            items: inventarioItems });
  if (finanzasItems.length)   result.push({ group: 'Clientes y Finanzas',   items: finanzasItems });
  if (moduloItems.length)     result.push({ group: `Módulo ${moduleLabel}`, items: moduloItems });
  if (adminItems.length)      result.push({ group: 'Administración',        items: adminItems });
  // Sucursales, Hardware y Configuración como tabs independientes al final
  if (isAdmin && isPro) result.push({ label: 'Sucursales',    path: MODULE_PATHS.branches, icon: Building2 });
  if (isAdmin)          result.push({ label: 'Hardware',      path: MODULE_PATHS.hardware, icon: Cpu });
  if (isAdmin)          result.push({ label: 'Configuración', path: MODULE_PATHS.settings, icon: Settings });

  return result;
}

// ── SidebarNavItem ────────────────────────────────────────────────────────────
const SidebarNavItem: React.FC<{
  item: { label: string; path: string; icon: React.ElementType };
  isActive: boolean;
  onClick?: () => void;
}> = ({ item, isActive, onClick }) => (
  <Link
    to={item.path}
    onClick={onClick}
    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-sm w-full group"
    style={{
      background: isActive ? '#eff6ff' : 'transparent',
      color:      isActive ? '#1d4ed8' : '#64748b',
      fontWeight: isActive ? 600 : 400,
      borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
    }}
  >
    <item.icon size={15} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
    <span className="truncate">{item.label}</span>
  </Link>
);

// ── Layout ────────────────────────────────────────────────────────────────────
const Layout: React.FC<LayoutProps> = ({ children, onAdminPanel }) => {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const { company, companyId, isLoading, userRole, customRole, hasPermission, hasFeature, switchCompany, refreshAll } = useDatabase();
  const [childBranches, setChildBranches]   = useState<any[]>([]);
  const [switching, setSwitching]           = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [showUserMenu, setShowUserMenu]     = useState(false);
  const [showBranchDrop, setShowBranchDrop] = useState(false);
  const userMenuRef   = useRef<HTMLDivElement>(null);
  const branchDropRef = useRef<HTMLDivElement>(null);

  const cfg = (company?.config as any) || {};
  const normalizeType = (t: string) => {
    if (t === 'gym' || t === 'fitness') return 'gimnasio';
    if (t === 'bakery') return 'panaderia';
    if (t === 'salón') return 'salon';
    return t;
  };
  const rawTypes: string[] = Array.isArray(cfg.business_types) && cfg.business_types.length > 0
    ? cfg.business_types
    : cfg.business_type ? [cfg.business_type] : ['general'];
  const mainBusinessTypes: string[] = [...new Set(rawTypes.filter(Boolean).map(normalizeType))];

  const plan      = company?.subscription_plan || 'BASIC';
  const isBranch  = !!(company as any)?.negocio_padre_id;
  const isPro     = isBranch || ['PRO', 'ENTERPRISE', 'MASTER'].includes(plan);
  const isAdmin   = userRole === 'MASTER' || userRole === 'ADMIN';
  const brandColor  = (company?.config as any)?.primary_color || '#0f172a';
  const fontColor   = (company?.config as any)?.font_color    || '#ffffff';
  const companyName = company?.name ?? 'POSmaster';
  const logoUrl     = company?.logo_url ?? null;

  const [rootCompanyId, setRootCompanyId] = useState<string | null>(null);
  useEffect(() => {
    if (!company?.id) return;
    const padreId = (company as any).negocio_padre_id;
    setRootCompanyId(padreId || company.id);
  }, [company?.id]);

  useEffect(() => {
    if (!rootCompanyId || !isPro || (isBranch && !isAdmin)) { setChildBranches([]); return; }
    supabase
      .from('companies')
      .select('id, name, config, subscription_status')
      .eq('negocio_padre_id', rootCompanyId)
      .eq('subscription_status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .then(({ data }) => setChildBranches(data || []));
  }, [rootCompanyId, isPro, isBranch, isAdmin]);

  const handleLogout     = async () => { await supabase.auth.signOut(); };
  const handleRefreshAll = async () => {
    setRefreshing(true);
    try { await refreshAll(); } finally { setRefreshing(false); }
  };

  const handleActivate = useCallback(async (cid: string) => {
    const bt = mainBusinessTypes[0] || 'general';
    localStorage.setItem('posmaster_active_business_type', bt);
    window.dispatchEvent(new Event('posmaster_business_type_changed'));
    if (cid !== companyId) {
      setSwitching(true);
      await switchCompany(cid);
      setSwitching(false);
    }
    navigate('/');
    setShowBranchDrop(false);
  }, [companyId, switchCompany, navigate, mainBusinessTypes]);

  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (!companyId || !company || userRole !== 'ADMIN') return;
    const key = `onboarding_done_${companyId}`;
    if (!localStorage.getItem(key)) setShowOnboarding(true);
  }, [companyId, company, userRole]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (branchDropRef.current && !branchDropRef.current.contains(e.target as Node)) setShowBranchDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const bt = mainBusinessTypes[0] || 'general';
    localStorage.setItem('posmaster_active_business_type', bt);
    window.dispatchEvent(new Event('posmaster_business_type_changed'));
  }, [mainBusinessTypes.join(',')]);

  const navEntries = useMemo(() =>
    getNavItems(mainBusinessTypes[0] || 'general', hasPermission, isAdmin, isPro, hasFeature, customRole),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mainBusinessTypes[0], isAdmin, isPro, customRole]
  );

  const activeSectionFromPath = useMemo(() => {
    // Rutas independientes que no pertenecen a ningún grupo
    const independentPaths = navEntries
      .filter(e => !isNavGroup(e) && (e as NavItem).path !== MODULE_PATHS.dashboard)
      .map(e => (e as NavItem).path);
    // Si estamos en una ruta independiente, no activar ningún grupo
    if (independentPaths.includes(location.pathname)) return null;
    for (const entry of navEntries) {
      if (isNavGroup(entry) && entry.items.some(i => location.pathname.startsWith(i.path === '/' ? '/__' : i.path))) {
        return entry.group;
      }
    }
    return location.pathname === '/' ? '__dashboard__' : null;
  }, [location.pathname, navEntries]);

  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSection(activeSectionFromPath);
    if (activeSectionFromPath && activeSectionFromPath !== '__dashboard__') {
      setSidebarOpen(true);
    } else {
      // Ruta independiente o dashboard: cerrar sidebar y limpiar sección
      setSidebarOpen(false);
    }
  }, [activeSectionFromPath, location.pathname]);

  const currentGroupItems = useMemo(() =>
    navEntries.find(e => isNavGroup(e) && (e as NavGroup).group === selectedSection) as NavGroup | undefined,
    [navEntries, selectedSection]
  );

  const hasSidebar = !!currentGroupItems && selectedSection !== '__dashboard__';

  const roleDisplay =
    userRole === 'MASTER' ? 'Propietario' :
    userRole === 'ADMIN'  ? 'Administrador' : userRole || 'Usuario';

  const shortenGroup = (g: string) =>
    g === 'Clientes y Finanzas' ? 'Clientes' :
    g === 'Administración' ? 'Admin' :
    g.startsWith('Módulo ') ? g.slice(7) : g;

  const sectionIcon = (g: string): React.ElementType => {
    if (g === 'Ventas')              return ShoppingCart;
    if (g === 'Inventario')          return Package;
    if (g === 'Clientes y Finanzas') return UserRound;
    if (g === 'Administración')      return BarChart2;
    if (g.startsWith('Módulo'))      return Wrench;
    return FileText;
  };

  const handleTabClick = (group: string) => {
    if (group === '__dashboard__') {
      navigate('/');
      setSelectedSection('__dashboard__');
      setSidebarOpen(false);
    } else {
      // Navegar automáticamente al primer item del grupo
      const groupEntry = navEntries.find(e => isNavGroup(e) && (e as NavGroup).group === group) as NavGroup | undefined;
      if (groupEntry && groupEntry.items.length > 0) {
        navigate(groupEntry.items[0].path);
      }
      setSelectedSection(group);
      setSidebarOpen(true);
    }
  };

  const isTabActive = (group: string) => {
    if (group === '__dashboard__') return selectedSection === '__dashboard__' || location.pathname === '/';
    return selectedSection === group;
  };

  const rootCid = (isBranch && !isAdmin) ? (companyId || '') : (rootCompanyId || companyId || '');

  // ── Mobile Nav ─────────────────────────────────────────────────────────────
  const MobileNav = () => (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: brandColor }}>
      <div className="flex items-center justify-between p-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ background: logoUrl ? '#fff' : 'rgba(255,255,255,0.15)' }}>
            {logoUrl
              ? <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              : <Building2 size={18} className="text-white" />}
          </div>
          <p className="font-bold text-base" style={{ color: fontColor }}>{companyName}</p>
        </div>
        <button onClick={() => setIsMobileMenuOpen(false)} style={{ color: fontColor, opacity: 0.7 }}>
          <X size={22} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <Link to="/" onClick={() => setIsMobileMenuOpen(false)}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold"
          style={{
            background: location.pathname === '/' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
            color: fontColor,
          }}>
          <LayoutDashboard size={16} /> Dashboard
        </Link>
        {navEntries.filter(isNavGroup).map(entry => {
          const g = entry as NavGroup;
          const Icon = sectionIcon(g.group);
          return (
            <div key={g.group} className="pt-2">
              <p className="flex items-center gap-2 px-3 py-1 text-[10px] font-bold uppercase tracking-widest mb-1"
                style={{ color: fontColor, opacity: 0.4 }}>
                <Icon size={11} /> {shortenGroup(g.group)}
              </p>
              {g.items.map(item => (
                <Link key={item.path} to={item.path} onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all"
                  style={{
                    background: location.pathname === item.path ? 'rgba(255,255,255,0.18)' : 'transparent',
                    color: fontColor,
                    fontWeight: location.pathname === item.path ? 600 : 400,
                    opacity: location.pathname === item.path ? 1 : 0.8,
                  }}>
                  <item.icon size={14} /> {item.label}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <div className="p-4 flex-shrink-0 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(0,0,0,0.2)' }}>
          <Globe size={14} style={{ color: fontColor, opacity: 0.6 }} />
          <select value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}
            className="bg-transparent text-sm focus:outline-none w-full cursor-pointer"
            style={{ color: fontColor }}>
            <option value="COP" className="text-slate-900">COP (Peso)</option>
            <option value="USD" className="text-slate-900">USD (Dólar)</option>
            <option value="EUR" className="text-slate-900">EUR (Euro)</option>
          </select>
        </div>
        {onAdminPanel && (
          <button onClick={() => { onAdminPanel(); setIsMobileMenuOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-purple-300 rounded-xl text-sm font-medium">
            <ShieldCheck size={14} /> Panel POSmaster
          </button>
        )}
        <button onClick={handleLogout}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-red-400 rounded-xl text-sm font-medium">
          <LogOut size={14} /> Cerrar Sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
      <div className="flex flex-col h-screen" style={{ background: '#f1f5f9' }}>

        {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
        <header
          className="flex items-center flex-shrink-0 z-30"
          style={{
            background: brandColor,
            height: 64,
            borderBottom: '1px solid rgba(0,0,0,0.2)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
          }}
        >
          {/* Logo + Company name */}
          <div className="flex items-center gap-3 px-5 flex-shrink-0"
            style={{ borderRight: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ background: logoUrl ? '#fff' : 'rgba(255,255,255,0.15)' }}>
              {logoUrl
                ? <img src={logoUrl} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                : <Building2 size={18} className="text-white" />}
            </div>
            <div className="hidden md:block">
              <p className="font-bold text-sm leading-tight truncate max-w-[140px]"
                style={{ color: fontColor, letterSpacing: '0.01em' }}>{companyName}</p>
              <p className="text-[10px] font-medium tracking-widest uppercase"
                style={{ color: fontColor, opacity: 0.4 }}>POSmaster</p>
            </div>
          </div>

          {/* Branch selector */}
          {childBranches.length > 0 && isAdmin && (
            <div className="relative flex-shrink-0 hidden md:block px-3" ref={branchDropRef}>
              <button onClick={() => setShowBranchDrop(o => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: fontColor,
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>
                <Building2 size={12} />
                <span className="max-w-[90px] truncate">{company?.name}</span>
                <ChevronDown size={11} style={{ opacity: 0.6 }} />
              </button>
              {showBranchDrop && (
                <div className="absolute left-3 top-12 z-50 rounded-xl shadow-2xl overflow-hidden"
                  style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', minWidth: 220 }}>
                  <button onClick={() => handleActivate(rootCid)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/10 transition-colors"
                    style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: brandColor }}>
                      <Building2 size={12} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{companyName}</p>
                      <p className="text-[10px] text-slate-400">Sede principal</p>
                    </div>
                    {companyId === rootCid && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                  </button>
                  {childBranches.map(b => (
                    <button key={b.id} onClick={() => handleActivate(b.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/10 transition-colors"
                      style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: (b.config as any)?.primary_color || '#475569' }}>
                        <Building2 size={12} className="text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate">{b.name}</p>
                        <p className="text-[10px] text-slate-400">Sucursal</p>
                      </div>
                      {companyId === b.id && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SECTION TABS — desktop ───────────────────────────────────── */}
          <nav className="hidden md:flex items-stretch flex-1 h-full px-2">

            {/* Dashboard tab */}
            <button
              onClick={() => handleTabClick('__dashboard__')}
              className="flex items-center gap-2.5 px-5 text-sm font-semibold transition-all relative flex-shrink-0"
              style={{
                color: isTabActive('__dashboard__') ? '#fff' : fontColor,
                opacity: isTabActive('__dashboard__') ? 1 : 0.6,
                borderBottom: isTabActive('__dashboard__') ? '3px solid #fff' : '3px solid transparent',
                letterSpacing: '0.02em',
              }}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </button>

            {navEntries.filter(isNavGroup).map(entry => {
              const g = entry as NavGroup;
              const Icon = sectionIcon(g.group);
              const active = isTabActive(g.group);
              return (
                <button
                  key={g.group}
                  onClick={() => handleTabClick(g.group)}
                  className="flex items-center gap-2.5 px-5 text-sm font-semibold transition-all relative flex-shrink-0"
                  style={{
                    color: active ? '#fff' : fontColor,
                    opacity: active ? 1 : 0.6,
                    borderBottom: active ? '3px solid #fff' : '3px solid transparent',
                    letterSpacing: '0.02em',
                  }}
                >
                  <Icon size={16} />
                  {shortenGroup(g.group)}
                </button>
              );
            })}

            {/* Separador + tabs independientes (Sucursales, Configuración) */}
            {navEntries.some(e => !isNavGroup(e) && (e as NavItem).path !== MODULE_PATHS.dashboard) && (
              <div className="flex items-center ml-2" style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 8 }}>
                {navEntries.filter(e => !isNavGroup(e) && (e as NavItem).path !== MODULE_PATHS.dashboard).map(entry => {
                  const item = entry as NavItem;
                  const active = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className="flex items-center gap-2 px-4 h-full text-sm font-semibold transition-all flex-shrink-0"
                      style={{
                        color: active ? '#fff' : fontColor,
                        opacity: active ? 1 : 0.55,
                        borderBottom: active ? '3px solid #fff' : '3px solid transparent',
                        letterSpacing: '0.02em',
                      }}
                    >
                      <item.icon size={15} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 px-4 flex-shrink-0 ml-auto">

            {/* Currency */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Globe size={12} style={{ color: fontColor, opacity: 0.5 }} />
              <select value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}
                className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
                style={{ color: fontColor }}>
                <option value="COP" className="text-slate-900">COP</option>
                <option value="USD" className="text-slate-900">USD</option>
                <option value="EUR" className="text-slate-900">EUR</option>
              </select>
            </div>

            {/* Refresh */}
            <button onClick={handleRefreshAll} disabled={refreshing || isLoading}
              className="p-2 rounded-lg transition-all disabled:opacity-40 hover:bg-white/10"
              style={{ color: fontColor }}
              title="Actualizar datos">
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>

            {/* Notifications */}
            <NotificationBell companyId={companyId || null} fontColor={fontColor} />

            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button onClick={() => setShowUserMenu(o => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ml-1"
                style={{
                  background: showUserMenu ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                  color: fontColor,
                  border: '1px solid rgba(255,255,255,0.12)',
                }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <User size={13} className="text-white" />
                </div>
                <span className="hidden md:block max-w-[90px] truncate">{roleDisplay}</span>
                <ChevronDown size={12} style={{ opacity: 0.6 }} />
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-12 z-50 rounded-xl shadow-2xl overflow-hidden"
                  style={{ background: '#fff', border: '0.5px solid #e2e8f0', minWidth: 210 }}>
                  <div className="px-4 py-3.5" style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <p className="text-xs font-bold text-slate-800 truncate">{companyName}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{roleDisplay}</p>
                  </div>
                  {onAdminPanel && (
                    <button onClick={() => { onAdminPanel(); setShowUserMenu(false); }}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-semibold text-purple-600 hover:bg-purple-50 transition-colors">
                      <ShieldCheck size={14} /> Panel POSmaster
                    </button>
                  )}
                  <button onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
                    <LogOut size={14} /> Cerrar Sesión
                  </button>
                </div>
              )}
            </div>

            {/* Mobile hamburger */}
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 rounded-lg ml-1"
              style={{ color: fontColor, background: 'rgba(255,255,255,0.08)' }}>
              <Menu size={18} />
            </button>
          </div>
        </header>

        {/* Branch banner */}
        {company && (company as any).negocio_padre_id && (
          <div style={{
            background: 'linear-gradient(90deg,#1d4ed8,#4f46e5)',
            color: '#fff',
            padding: '5px 20px',
            fontSize: 11,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            letterSpacing: '0.01em',
          }}>
            <span>🏢 Sucursal activa: <strong>{company.name}</strong></span>
            <button onClick={() => rootCompanyId && handleActivate(rootCompanyId)}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                padding: '3px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 10,
              }}>
              ← Volver al principal
            </button>
          </div>
        )}

        {/* ── BODY ────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar */}
          <aside
            className="hidden md:flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200"
            style={{
              width: hasSidebar && sidebarOpen ? 220 : 0,
              background: '#fff',
              borderRight: hasSidebar && sidebarOpen ? '1px solid #e2e8f0' : 'none',
              boxShadow: hasSidebar && sidebarOpen ? '2px 0 8px rgba(0,0,0,0.04)' : 'none',
            }}
          >
            {hasSidebar && currentGroupItems && (
              <>
                <div className="px-4 py-4 flex-shrink-0"
                  style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {shortenGroup(currentGroupItems.group)}
                  </p>
                </div>
                <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
                  {currentGroupItems.items.map(item => (
                    <SidebarNavItem
                      key={item.path}
                      item={item}
                      isActive={location.pathname === item.path}
                    />
                  ))}
                </nav>
              </>
            )}
          </aside>

          {/* Sidebar toggle */}
          {hasSidebar && (
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="hidden md:flex items-center justify-center flex-shrink-0 transition-all hover:bg-slate-100"
              style={{
                width: 16,
                background: '#fff',
                borderRight: '1px solid #e2e8f0',
                color: '#94a3b8',
              }}
              title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}>
              {sidebarOpen ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
            </button>
          )}

          {/* Main content */}
          <main className="flex-1 overflow-auto" style={{ background: '#f1f5f9' }}>
            <div className="p-5 md:p-8 max-w-7xl mx-auto h-full">
              {isLoading || switching ? (
                <div className="flex items-center justify-center h-full flex-col gap-4">
                  <div style={{
                    width: 40, height: 40,
                    border: '3px solid #e2e8f0',
                    borderTop: `3px solid ${brandColor}`,
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  <p className="text-slate-400 text-sm font-medium">
                    {switching ? 'Cambiando sucursal…' : 'Cargando datos…'}
                  </p>
                </div>
              ) : children}
            </div>
          </main>
        </div>

        {/* Mobile nav overlay */}
        {isMobileMenuOpen && <MobileNav />}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
};

export default Layout;