import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Product, Sale, RepairOrder, Customer, RepairStatus, CashRegisterSession, Company, DianSettings } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';

interface DatabaseContextType {
  company: Company | null;
  companyId: string | null;
  branchId: string | null;
  products: Product[];
  repairs: RepairOrder[];
  sales: Sale[];
  customers: Customer[];
  session: CashRegisterSession | null;
  sessionsHistory: CashRegisterSession[];
  isLoading: boolean;
  userRole: string | null;
  customRole: string | null;
  permissions: Record<string, boolean>;
  availableCompanies: Company[];
  addProduct: (product: Omit<Product, 'id' | 'company_id'>) => Promise<void>;
  updateProduct: (id: string, data: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addRepair: (repair: Omit<RepairOrder, 'id'>) => Promise<void>;
  updateRepairStatus: (id: string, status: RepairStatus) => Promise<void>;
  processSale: (saleData: {
    customer: string; customerDoc?: string; customerEmail?: string;
    customerPhone?: string; items: any[]; total: number;
    subtotal: number; taxAmount: number; applyIva?: boolean;
    discountPercent?: number; discountAmount?: number;
  }) => Promise<Sale>;
  updateCompanyConfig: (data: Partial<Company>) => Promise<void>;
  saveDianSettings: (settings: DianSettings) => void;
  openSession: (amount: number) => Promise<void>;
  closeSession: (endAmount: number) => Promise<void>;
  refreshProducts: () => Promise<void>;
  refreshCompany: () => Promise<void>;
  refreshAll: () => Promise<void>;
  switchCompany: (cid: string) => Promise<void>;
  hasPermission: (key: string) => boolean;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const DatabaseProvider: React.FC<{ children: React.ReactNode; overrideCompanyId?: string }> = ({ children, overrideCompanyId }) => {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [repairs, setRepairs] = useState<RepairOrder[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [session, setSession] = useState<CashRegisterSession | null>(null);
  const [sessionsHistory, setSessionsHistory] = useState<CashRegisterSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [customRole, setCustomRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [availableCompanies, setAvailableCompanies] = useState<Company[]>([]);

  // Helper: verificar permiso
  const hasPermission = useCallback((key: string): boolean => {
    // MASTER y ADMIN tienen todos los permisos
    if (userRole === 'MASTER' || userRole === 'ADMIN') return true;
    return permissions[key] === true;
  }, [userRole, permissions]);

  const loadCompany = async (cid: string) => {
    const { data, error } = await supabase.from('companies').select('*').eq('id', cid).single();
    if (error) { console.error('❌ loadCompany:', error.message); return; }
    if (data) setCompany(data as any);
  };

  const loadProducts = async (cid: string) => {
    const { data, error } = await supabase.from('products').select('*')
      .eq('company_id', cid).eq('is_active', true).order('name');
    if (error) console.error('❌ loadProducts:', error.message);
    setProducts((data || []) as any);
  };

  const loadRepairs = async (cid: string) => {
    const { data, error } = await supabase.from('repair_orders').select('*')
      .eq('company_id', cid).order('created_at', { ascending: false }).limit(50);
    if (error) console.error('❌ loadRepairs:', error.message);
    setRepairs((data || []) as any);
  };

  const loadSales = async (cid: string) => {
    const { data, error } = await supabase.from('invoices')
      .select('id, invoice_number, total_amount, subtotal, tax_amount, status, payment_method, created_at, customer_id')
      .eq('company_id', cid).order('created_at', { ascending: false }).limit(50);
    if (error) console.error('❌ loadSales:', error.message);
    else console.log('✅ Sales cargadas:', data?.length);
    setSales((data || []) as any);
  };

  const loadCustomers = async (cid: string) => {
    const { data, error } = await supabase.from('customers').select('*')
      .eq('company_id', cid).order('name');
    if (error) console.error('❌ loadCustomers:', error.message);
    setCustomers((data || []) as any);
  };

  const loadSession = async (cid: string) => {
    if (!cid) return;
    const [{ data: openSession, error: e1 }, { data: history, error: e2 }] = await Promise.all([
      supabase.from('cash_register_sessions').select('*').eq('company_id', cid).eq('status', 'OPEN').maybeSingle(),
      supabase.from('cash_register_sessions').select('*').eq('company_id', cid).eq('status', 'CLOSED')
        .order('start_time', { ascending: false }).limit(20),
    ]);
    if (e1) console.error('❌ loadSession(open):', e1.message);
    if (e2) console.error('❌ loadSession(history):', e2.message);
    setSession(openSession as any || null);
    setSessionsHistory((history || []) as any);
  };

  const loadAllData = async (cid: string) => {
    setIsLoading(true);
    await loadCompany(cid);
    await Promise.all([loadProducts(cid), loadSales(cid), loadSession(cid), loadRepairs(cid), loadCustomers(cid)]);
    setIsLoading(false);
  };

  const resolvebranchId = async (cid: string): Promise<string | null> => {
    const { data: branches } = await supabase.from('branches').select('id').eq('company_id', cid).limit(1);
    if (branches && branches.length > 0) return branches[0].id;
    const { data: newBranch, error } = await supabase.from('branches').insert({
      company_id: cid, name: 'Principal', is_active: true,
    }).select('id').single();
    if (error) { console.error('❌ No se pudo crear branch:', error.message); return null; }
    return newBranch.id;
  };

  useEffect(() => {
    if (overrideCompanyId) {
      setCompanyId(overrideCompanyId);
      setUserRole('ADMIN');
      setCustomRole(null);
      setPermissions({});
      resolvebranchId(overrideCompanyId).then(bid => setBranchId(bid));
      loadAllData(overrideCompanyId);
      return;
    }

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('company_id, branch_id, role, custom_role, permissions')
        .eq('id', user.id).maybeSingle();

      if (error || !profile) {
        console.warn('⚠️ Sin perfil para este usuario:', user.email);
        setIsLoading(false);
        return;
      }

      setUserRole(profile.role);
      setCustomRole(profile.custom_role || null);
      setPermissions(profile.permissions || {});

      if (profile.company_id) {
        setCompanyId(profile.company_id);
        let bid = profile.branch_id || null;
        if (!bid) bid = await resolvebranchId(profile.company_id);
        setBranchId(bid);
        await loadAllData(profile.company_id);
      } else {
        setIsLoading(false);
      }
    };
    init();
  }, [overrideCompanyId]);

  const switchCompany = async (cid: string) => {
    setIsLoading(true);
    setCompanyId(cid);
    setProducts([]); setSales([]); setRepairs([]); setCustomers([]);
    setSession(null); setCompany(null);
    const bid = await resolvebranchId(cid);
    setBranchId(bid);
    await loadAllData(cid);
    toast.success('Empresa cambiada');
  };

  const refreshProducts = useCallback(async () => {
    if (companyId) await loadProducts(companyId);
  }, [companyId]);

  const refreshCompany = useCallback(async () => {
    if (companyId) await loadCompany(companyId);
  }, [companyId]);

  const refreshAll = useCallback(async () => {
    if (!companyId) return;
    await Promise.all([
      loadCompany(companyId),
      loadProducts(companyId),
      loadSales(companyId),
      loadRepairs(companyId),
      loadSession(companyId),
      loadCustomers(companyId),
    ]);
  }, [companyId]);

  const addProduct = async (data: Omit<Product, 'id' | 'company_id'>) => {
    if (!companyId) return;
    const { error } = await supabase.from('products').insert({ ...data, company_id: companyId, is_active: true });
    if (error) { toast.error(error.message); return; }
    await loadProducts(companyId);
    toast.success('Producto creado');
  };

  const updateProduct = async (id: string, data: Partial<Product>) => {
    const { error } = await supabase.from('products').update(data).eq('id', id);
    if (error) { toast.error(error.message); return; }
    if (companyId) await loadProducts(companyId);
    toast.success('Producto actualizado');
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    if (companyId) await loadProducts(companyId);
    toast.success('Producto eliminado');
  };

  const updateRepairStatus = async (id: string, status: RepairStatus) => {
    const { error } = await supabase.from('repair_orders')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    if (companyId) await loadRepairs(companyId);
    toast.success(`Estado: ${status}`);
  };

  const addRepair = async (data: Omit<RepairOrder, 'id'>) => {
    if (!companyId) return;
    const resolvedBranchId = branchId || await resolvebranchId(companyId);
    const { error } = await supabase.from('repair_orders').insert({
      ...data, company_id: companyId, branch_id: resolvedBranchId, updated_at: new Date().toISOString()
    });
    if (error) { toast.error(error.message); return; }
    await loadRepairs(companyId);
    toast.success('Orden creada');
  };

  const processSale = async (saleData: {
    customer: string; customerDoc?: string; customerEmail?: string;
    customerPhone?: string; items: any[]; total: number;
    subtotal: number; taxAmount: number; applyIva?: boolean;
    discountPercent?: number; discountAmount?: number;
    amountPaid?: number;          // nuevo: monto efectivamente pagado
    shoeRepairId?: string;        // nuevo: id orden zapatería si aplica
  }): Promise<Sale> => {
    if (!companyId) throw new Error('No company');
    const resolvedBranchId = branchId || await resolvebranchId(companyId);
    if (!resolvedBranchId) throw new Error('No se pudo obtener la sucursal');

    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const invoiceNumber = `POS-${timestamp}${random}`;

    // Calcular saldo
    const amountPaid   = saleData.amountPaid ?? saleData.total;
    const balanceDue   = Math.max(saleData.total - amountPaid, 0);
    const paymentStatus = balanceDue === 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING';

    const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
      company_id: companyId, branch_id: resolvedBranchId, invoice_number: invoiceNumber,
      customer_id: null,
      subtotal: Math.round(saleData.subtotal), tax_amount: Math.round(saleData.taxAmount),
      total_amount: Math.round(saleData.total), status: 'PENDING_ELECTRONIC',
      // Guardar toda la info del cliente y pago en el campo jsonb payment_method
      payment_method: {
        method: 'CASH', amount: amountPaid,
        customer_name:     saleData.customer || null,
        customer_document: saleData.customerDoc || null,
        customer_email:    saleData.customerEmail || null,
        customer_phone:    saleData.customerPhone || null,
        balance_due:       balanceDue,
        payment_status:    paymentStatus,
        // Items de servicios virtuales (zapatería, etc.) que no tienen product_id real
        virtual_items: saleData.items
          .filter((i: any) => ['shoe-','salon-','vet-'].some(p => String(i.product.id).startsWith(p)))
          .map((i: any) => ({
            name:     i.product.name,
            price:    i.price ?? i.product.price,
            quantity: i.quantity,
            sku:      i.product.sku,
          })),
      }
    }).select().single();

    if (invErr) throw invErr;

    // Solo insertar items con product_id real (UUID válido, no ids virtuales de zapatería/salón)
    const realItems = saleData.items.filter((i: any) =>
      !String(i.product.id).startsWith('shoe-') &&
      !String(i.product.id).startsWith('salon-') &&
      !String(i.product.id).startsWith('vet-')
    );
    if (realItems.length > 0) {
      const itemsToInsert = realItems.map((i: any) => ({
        invoice_id:    invoice.id,
        product_id:    i.product.id,
        quantity:      i.quantity,
        price:         i.price ?? i.product.price,
        tax_rate:      i.tax_rate ?? i.product.tax_rate ?? 0,
        serial_number: i.serial_number || null,
      }));
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsToInsert);
      if (itemsErr) console.error('Error insertando items:', itemsErr);
    }

    // Si viene de zapatería, vincular factura y registrar en historial
    if (saleData.shoeRepairId) {
      await supabase.from('shoe_repair_orders')
        .update({ invoice_id: invoice.id, status: 'DELIVERED' })
        .eq('id', saleData.shoeRepairId);
      await supabase.from('shoe_repair_history').insert({
        company_id: companyId,
        repair_id: saleData.shoeRepairId,
        event: 'INVOICED',
        description: `Factura generada: ${invoiceNumber}. Pagado: $${amountPaid.toLocaleString('es-CO')}${balanceDue > 0 ? ` · Saldo pendiente: $${balanceDue.toLocaleString('es-CO')}` : ''}`,
        user_name: 'POS',
      });
    }

    for (const i of saleData.items.filter((i: any) => i.product.type !== 'SERVICE')) {
      const currentStock = i.product.stock_quantity ?? 0;
      const newStock = Math.max(0, currentStock - i.quantity);
      await supabase.from('products').update({ stock_quantity: newStock }).eq('id', i.product.id);
    }

    setProducts(prev => prev.map(p => {
      const soldItem = saleData.items.find((i: any) => i.product.id === p.id && i.product.type !== 'SERVICE');
      if (!soldItem) return p;
      return { ...p, stock_quantity: Math.max(0, (p.stock_quantity ?? 0) - soldItem.quantity) };
    }));

    if (session?.id) {
      await supabase.from('cash_register_sessions')
        .update({ total_sales_cash: (session.total_sales_cash || 0) + amountPaid })
        .eq('id', session.id);
    }

    await Promise.all([loadProducts(companyId), loadSales(companyId), loadSession(companyId)]);
    toast.success(balanceDue > 0 ? `Factura con saldo pendiente: $${balanceDue.toLocaleString('es-CO')}` : 'Venta guardada');
    return invoice as any;
  };

  const updateCompanyConfig = async (data: Partial<Company>) => {
    if (!companyId) return;
    const { error } = await supabase.from('companies').update(data).eq('id', companyId);
    if (error) { toast.error(error.message); return; }
    await loadCompany(companyId);
    toast.success('Configuración actualizada');
  };

  const saveDianSettings = (_settings: DianSettings) => {
    toast.success('Ajustes DIAN guardados (simulado)');
  };

  const openSession = async (amount: number) => {
    if (!companyId) { toast.error('No hay empresa configurada'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('No hay sesión de usuario'); return; }
    const resolvedBranchId = branchId || await resolvebranchId(companyId);
    if (!resolvedBranchId) { toast.error('No se pudo obtener la sucursal'); return; }
    if (!branchId) setBranchId(resolvedBranchId);
    const { error } = await supabase.from('cash_register_sessions').insert({
      company_id: companyId,
      register_id: '00000000-0000-0000-0000-000000000000',
      user_id: user.id,
      start_cash: amount,
      start_time: new Date().toISOString(),
      status: 'OPEN'
    });
    if (error) { toast.error(error.message); return; }
    await loadSession(companyId);
    toast.success('Caja abierta');
  };

  const closeSession = async (endAmount: number) => {
    if (!session) return;
    const { error } = await supabase.from('cash_register_sessions').update({
      end_cash: endAmount, end_time: new Date().toISOString(), status: 'CLOSED',
      difference: endAmount - ((session.start_cash || 0) + (session.total_sales_cash || 0)),
    }).eq('id', session.id);
    if (error) { toast.error(error.message); return; }
    if (companyId) await loadSession(companyId);
    toast.success('Caja cerrada');
  };

  return (
    <DatabaseContext.Provider value={{
      company, companyId, branchId, products, repairs, sales, customers,
      session, sessionsHistory, isLoading, userRole, customRole, permissions,
      availableCompanies, addProduct, updateProduct, deleteProduct, addRepair,
      updateRepairStatus, processSale, updateCompanyConfig, saveDianSettings,
      openSession, closeSession, refreshProducts, refreshCompany, refreshAll, switchCompany, hasPermission,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (context === undefined) throw new Error('useDatabase must be used within a DatabaseProvider');
  return context;
};