import { supabase } from '../supabaseClient';

export interface AuditEntry {
  id?: string;
  company_id: string;
  product_id?: string;
  product_name?: string;
  product_sku?: string;
  action: 'EDIT' | 'STOCK_UPDATE' | 'PRICE_UPDATE' | 'IMPORT' | 'PURCHASE_ORDER' | 'AJUSTE_MANUAL' | 'CREATION';
  source: 'edit_modal' | 'excel_import' | 'purchase_order' | 'pos_sale' | 'manual' | 'creation';
  changed_fields?: Record<string, { before: any; after: any }>;
  quantity_before?: number;
  quantity_after?: number;
  quantity_delta?: number;
  price_before?: number;
  price_after?: number;
  cost_before?: number;
  cost_after?: number;
  reference_id?: string;
  reference_label?: string;
  notes?: string;
  user_id?: string;
  user_name?: string;
  created_at?: string;
}

// Campos que queremos rastrear y sus etiquetas legibles
const TRACKED_FIELDS: Record<string, string> = {
  name: 'Nombre',
  sku: 'SKU',
  barcode: 'Código de barras',
  imei: 'IMEI',
  price: 'Precio de venta',
  cost: 'Costo',
  stock_quantity: 'Stock',
  stock_min: 'Stock mínimo',
  tax_rate: 'IVA (%)',
  category: 'Categoría',
  brand: 'Marca',
  description: 'Descripción',
  type: 'Tipo',
  is_active: 'Activo',
  supplier_id: 'Proveedor',
  branch_id: 'Sede',
};

/**
 * Compara dos snapshots de producto y devuelve los campos que cambiaron
 */
export function diffProducts(
  before: Record<string, any>,
  after: Record<string, any>
): Record<string, { before: any; after: any }> {
  const changed: Record<string, { before: any; after: any }> = {};
  for (const key of Object.keys(TRACKED_FIELDS)) {
    const bVal = before[key] ?? null;
    const aVal = after[key] ?? null;
    if (String(bVal) !== String(aVal)) {
      changed[key] = { before: bVal, after: aVal };
    }
  }
  return changed;
}

/**
 * Registra una entrada de auditoría
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    // Obtener usuario actual si no se pasó
    if (!entry.user_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        entry.user_id = user.id;
        // Intentar obtener el nombre del perfil
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single();
        entry.user_name = profile?.full_name || profile?.email || user.email || 'Usuario';
      }
    }

    await supabase.from('product_audit_log').insert({
      company_id: entry.company_id,
      product_id: entry.product_id || null,
      product_name: entry.product_name || null,
      product_sku: entry.product_sku || null,
      action: entry.action,
      source: entry.source,
      changed_fields: entry.changed_fields || null,
      quantity_before: entry.quantity_before ?? null,
      quantity_after: entry.quantity_after ?? null,
      quantity_delta: entry.quantity_delta ?? null,
      price_before: entry.price_before ?? null,
      price_after: entry.price_after ?? null,
      cost_before: entry.cost_before ?? null,
      cost_after: entry.cost_after ?? null,
      reference_id: entry.reference_id || null,
      reference_label: entry.reference_label || null,
      notes: entry.notes || null,
      user_id: entry.user_id || null,
      user_name: entry.user_name || null,
    });
  } catch (err) {
    // No interrumpir el flujo principal si el log falla
    console.warn('[AuditLog] Error al registrar:', err);
  }
}

/**
 * Obtiene el historial de un producto específico
 */
export async function getProductHistory(
  productId: string,
  limit = 100
): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('product_audit_log')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Obtiene todo el historial de una empresa (para exportar)
 */
export async function getCompanyHistory(
  companyId: string,
  filters?: {
    fromDate?: string;
    toDate?: string;
    action?: string;
    source?: string;
    productId?: string;
  },
  limit = 500
): Promise<AuditEntry[]> {
  let query = supabase
    .from('product_audit_log')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filters?.fromDate) query = query.gte('created_at', filters.fromDate);
  if (filters?.toDate) query = query.lte('created_at', filters.toDate + 'T23:59:59');
  if (filters?.action) query = query.eq('action', filters.action);
  if (filters?.source) query = query.eq('source', filters.source);
  if (filters?.productId) query = query.eq('product_id', filters.productId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export const ACTION_LABELS: Record<string, string> = {
  EDIT: 'Edición',
  STOCK_UPDATE: 'Ajuste de stock',
  PRICE_UPDATE: 'Actualización de precio',
  IMPORT: 'Importación Excel',
  PURCHASE_ORDER: 'Orden de compra',
  AJUSTE_MANUAL: 'Ajuste manual',
  CREATION: 'Creación',
};

export const SOURCE_LABELS: Record<string, string> = {
  edit_modal: 'Edición manual',
  excel_import: 'Importación Excel',
  purchase_order: 'Orden de compra',
  pos_sale: 'Venta POS',
  manual: 'Manual',
  creation: 'Creación de producto',
};

export const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  sku: 'SKU',
  barcode: 'Código de barras',
  imei: 'IMEI',
  price: 'Precio de venta',
  cost: 'Costo',
  stock_quantity: 'Stock',
  stock_min: 'Stock mínimo',
  tax_rate: 'IVA (%)',
  category: 'Categoría',
  brand: 'Marca',
  description: 'Descripción',
  type: 'Tipo',
  is_active: 'Activo',
  supplier_id: 'Proveedor',
  branch_id: 'Sede',
};
