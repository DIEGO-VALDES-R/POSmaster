import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Wrench,
  Settings, LogOut, Menu, Building2, User,
  Landmark, FileText, Globe, Receipt, ShieldCheck, Users, Utensils, ChefHat
} from 'lucide-react';
import { useCurrency, CurrencyCode } from '../contexts/CurrencyContext';
import { useDatabase } from '../contexts/DatabaseContext';
import { supabase } from '../supabaseClient';

interface LayoutProps { children: React.ReactNode; onAdminPanel?: () => void; }

const Layout: React.FC<LayoutProps> = ({ children, onAdminPanel }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const { currency, setCurrency } = useCurrency();
  const { company, isLoading, userRole, customRole, permissions, hasPermission } = useDatabase();

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const plan = company?.subscription_plan || 'BASIC';
  const isPro = plan === 'PRO' || plan === 'ENTERPRISE';
  const isEnterprise = plan === 'ENTERPRISE';
  const isAdminOrMaster = userRole === 'MASTER' || userRole === 'ADMIN';

  // Tipo de negocio configurado en Ajustes > Marca (se guarda en config jsonb)
  const businessType: string = (company?.config as any)?.business_type || 'general';
  const isRestaurant = businessType === 'restaurante';

  const navItems = [
    { label: 'Dashboard',          path: '/',             icon: LayoutDashboard, show: true },
    { label: 'Punto de Venta',     path: '/pos',          icon: ShoppingCart,    show: hasPermission('can_sell') || isAdminOrMaster },
    { label: 'Control de Caja',    path: '/cash-control', icon: Landmark,        show: hasPermission('can_open_cash') || isAdminOrMaster },
    { label: 'Inventario',         path: '/inventory',    icon: Package,         show: hasPermission('can_manage_inventory') || isAdminOrMaster },
    { label: 'Historial Facturas', path: '/invoices',     icon: Receipt,         show: hasPermission('can_view_reports') || isAdminOrMaster },
    { label: 'Servicio Técnico',   path: '/repairs',      icon: Wrench,          show: hasPermission('can_view_repairs') || isAdminOrMaster },
    { label: 'Cartera / CxC',      path: '/receivables',  icon: FileText,        show: hasPermission('can_view_reports') || isAdminOrMaster },
    { label: 'Mesas / Restaurante', path: '/tables',      icon: Utensils,        show: isRestaurant && isAdminOrMaster },
    { label: 'Display de Cocina',  path: '/kitchen',      icon: ChefHat,         show: isRestaurant && isAdminOrMaster },
    { label: 'Sucursales',         path: '/branches',     icon: Building2,       show: isPro && isAdminOrMaster },
    { label: 'Equipo',             path: '/team',         icon: Users,           show: isPro && (hasPermission('can_manage_team') || isAdminOrMaster) },
    { label: 'Configuración',      path: '/settings',     icon: Settings,        show: isAdminOrMaster },
  ].filter(item => item.show);

  const isActive = (path: string) => location.pathname === path;
  const companyName = company?.name ?? 'IPHONESHOP USA';
  const logoUrl = company?.logo_url ?? null;

  // Brand color from Settings > Marca (stored in company.config.primary_color)
  const brandColor = (company?.config as any)?.primary_color || '#1e293b';
  const fontColor  = (company?.config as any)?.font_color   || '#ffffff';
  const hexToRgb = (hex: string) => {
    if (!hex || hex.length < 7) return '30,41,59';
    return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
  };
  const brandRgb = brandColor.startsWith('#') ? hexToRgb(brandColor) : '30,41,59';

  // Nombre del rol a mostrar en sidebar
  const roleDisplay = customRole
    ? customRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : userRole === 'MASTER' ? 'Propietario'
    : userRole === 'ADMIN' ? 'Administrador'
    : userRole || 'Usuario';

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 text-white shadow-xl" style={{ background: brandColor, transition: 'background 0.4s ease' }}>
        <div className="p-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg flex items-center justify-center overflow-hidden w-12 h-12 flex-shrink-0" style={{ background: logoUrl ? '#fff' : 'rgba(0,0,0,0.3)' }}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain mix-blend-multiply" />
                : <Building2 size={24} className="text-white" />}
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight leading-tight line-clamp-1" title={companyName}>
                {companyName}
              </h1>
              <p className="text-xs text-slate-400">POSmaster</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-2 px-2" style={{ color: fontColor, opacity: 0.45 }}>
            Menú Principal
          </label>
          {navItems.map((item) => (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive(item.path) ? 'font-semibold' : ''
              }`}
              style={{ background: isActive(item.path) ? 'rgba(0,0,0,0.3)' : 'transparent', color: fontColor }}>
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <Globe size={18} style={{ color: fontColor, opacity: 0.7 }} />
            <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="bg-transparent text-sm font-medium focus:outline-none w-full cursor-pointer" style={{ color: fontColor }}>
              <option value="COP" className="text-slate-900">COP (Peso)</option>
              <option value="USD" className="text-slate-900">USD (Dólar)</option>
              <option value="EUR" className="text-slate-900">EUR (Euro)</option>
            </select>
          </div>

          <div className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.25)' }}>
            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
              <User size={16} />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate" style={{ color: fontColor }}>{companyName}</p>
              <p className="text-xs" style={{ color: fontColor, opacity: 0.65 }}>{roleDisplay}</p>
            </div>
          </div>

          {onAdminPanel && (
            <button onClick={onAdminPanel}
              className="flex w-full items-center gap-3 px-4 py-2 text-purple-400 hover:bg-purple-900/20 rounded-lg transition-colors">
              <ShieldCheck size={20} />
              <span className="font-medium text-sm">Panel POSmaster</span>
            </button>
          )}

          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col p-4" style={{ background: `rgba(${brandRgb},0.97)` }}>
          <div className="flex justify-end mb-8">
            <button onClick={() => setIsMobileMenuOpen(false)} className="text-white text-2xl font-bold">✕</button>
          </div>
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-4 text-white text-xl py-4 border-b border-slate-700">
              <item.icon size={24} />
              <span>{item.label}</span>
            </Link>
          ))}
          <div className="mt-4">
            <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full text-white p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <option value="COP">COP (Colombia)</option>
              <option value="USD">USD (Dólar)</option>
              <option value="EUR">EUR (Euro)</option>
            </select>
          </div>
          {onAdminPanel && (
            <button onClick={onAdminPanel} className="mt-4 flex items-center gap-3 text-purple-400 py-3">
              <ShieldCheck size={20} />
              <span>Panel POSmaster</span>
            </button>
          )}
          <button onClick={handleLogout} className="mt-4 flex items-center gap-3 text-red-400 py-3">
            <LogOut size={20} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-2">
            {logoUrl && <img src={logoUrl} className="w-8 h-8 rounded object-cover" alt="logo" />}
            <h1 className="font-bold text-slate-800">{companyName}</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-600">
            <Menu size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {isLoading
              ? <div className="flex items-center justify-center h-full">
                  <div className="text-slate-400 text-lg animate-pulse">Cargando datos...</div>
                </div>
              : children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;