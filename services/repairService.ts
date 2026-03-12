import { supabase } from '../supabaseClient';

export type RepairStatus = 'RECEIVED' | 'DIAGNOSING' | 'WAITING_PARTS' | 'IN_REPAIR' | 'READY' | 'DELIVERED' | 'CANCELLED';

export interface RepairOrder {
  id?: string;
  company_id: string;
  branch_id?: string;
  customer_name: string;
  customer_phone?: string;
  device_model: string;
  serial_number?: string;
  issue_description: string;
  status: RepairStatus;
  estimated_cost?: number;
  final_cost?: number;
  technician_id?: string;
  notes?: string;
  _parts_json?: string;  // JSON de repuestos usados
  created_at?: string;
  updated_at?: string;
}

export const repairService = {
  async getAll(company_id: string): Promise<RepairOrder[]> {
    const { data, error } = await supabase
      .from('repair_orders').select('*')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(repair: Omit<RepairOrder, 'id'>): Promise<RepairOrder> {
    const { data, error } = await supabase
      .from('repair_orders')
      .insert({ ...repair, updated_at: new Date().toISOString() })
      .select().single();
    if (error) throw error;
    return data;
  },

  async updateStatus(id: string, status: RepairStatus, notes?: string): Promise<RepairOrder> {
    const { data, error } = await supabase
      .from('repair_orders')
      .update({ status, notes, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<RepairOrder>): Promise<RepairOrder> {
    const { data, error } = await supabase
      .from('repair_orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
};