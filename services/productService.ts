import { supabase } from '../supabaseClient';

export interface Product {
  id?: string;
  company_id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  category?: string;
  brand?: string;
  price: number;
  cost: number;
  tax_rate?: number;
  stock_min?: number;
  stock_quantity?: number;
  type: 'STANDARD' | 'SERIALIZED' | 'SERVICE';
  image_url?: string;
  is_active?: boolean;
}

export const productService = {
  async getAll(company_id: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('company_id', company_id)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  // Inventario necesita ver TODOS los productos (activos e inactivos) para poder reactivarlos
  async getAllForInventory(company_id: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('company_id', company_id)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async reactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('products').update({ is_active: true }).eq('id', id);
    if (error) throw error;
  },

  async create(product: Omit<Product, 'id'>): Promise<Product> {
    const { data, error } = await supabase
      .from('products').insert(product).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Product>): Promise<Product> {
    const { data, error } = await supabase
      .from('products').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('products').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  },

  async decrementStock(id: string, qty: number): Promise<void> {
    const { data: p } = await supabase
      .from('products').select('stock_quantity').eq('id', id).single();
    if (p) {
      await supabase.from('products')
        .update({ stock_quantity: Math.max(0, (p.stock_quantity || 0) - qty) })
        .eq('id', id);
    }
  }
};