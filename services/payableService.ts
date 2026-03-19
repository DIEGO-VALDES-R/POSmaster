import { supabase } from '../supabaseClient';

export type PayableStatus = 'PENDING' | 'OVERDUE' | 'PARTIAL' | 'PAID';

export interface Payable {
  id?: string;
  company_id: string;
  supplier_name: string;
  supplier_id?: string;
  concept: string;
  total_amount: number;
  paid_amount: number;
  balance?: number;
  due_date: string;
  status: PayableStatus;
  notes?: string;
  invoice_ref?: string;
  created_at?: string;
}

export const payableService = {
  async getAll(company_id: string): Promise<Payable[]> {
    const { data, error } = await supabase
      .from('payables')
      .select('*')
      .eq('company_id', company_id)
      .neq('status', 'PAID')
      .order('due_date');
    if (error) throw error;
    const today = new Date().toISOString().split('T')[0];
    return (data || []).map(r => ({
      ...r,
      status: r.status !== 'PAID' && r.due_date < today ? 'OVERDUE' : r.status,
    }));
  },

  async create(payable: Omit<Payable, 'id' | 'balance'>): Promise<Payable> {
    const { data, error } = await supabase
      .from('payables')
      .insert({ ...payable })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Payable>): Promise<Payable> {
    const { data, error } = await supabase
      .from('payables')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('payables').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Registra un pago parcial o total sobre una cuenta por pagar.
   * Si el pago cubre el saldo, marca la cuenta como PAID.
   * Opcionalmente inserta un egreso en la sesión de caja activa.
   */
  async registerPayment(opts: {
    payable_id:     string;
    amount:         number;
    method:         string;
    notes?:         string;
    session_id?:    string;   // si se pasa, inserta egreso en cash_expenses
    company_id:     string;
    branch_id?:     string;
  }): Promise<Payable> {
    const { payable_id, amount, method, notes, session_id, company_id, branch_id } = opts;

    // Leer cuenta actual
    const { data: payable, error: fetchErr } = await supabase
      .from('payables')
      .select('*')
      .eq('id', payable_id)
      .single();
    if (fetchErr) throw fetchErr;

    const newPaid    = (payable.paid_amount || 0) + amount;
    const newBalance = Math.max(0, payable.total_amount - newPaid);
    const newStatus: PayableStatus = newBalance === 0 ? 'PAID' : 'PARTIAL';

    const { data: updated, error: updateErr } = await supabase
      .from('payables')
      .update({ paid_amount: newPaid, status: newStatus })
      .eq('id', payable_id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Insertar egreso en caja si hay sesión activa
    if (session_id) {
      await supabase.from('cash_expenses').insert({
        session_id,
        company_id,
        branch_id:  branch_id || null,
        concept:    `Pago CxP: ${payable.supplier_name} — ${payable.concept}`,
        amount,
        category:   'proveedor',
        payment_method: method,
        notes:      notes || null,
      });
    }

    return updated;
  },

  async getSummary(company_id: string) {
    const { data } = await supabase
      .from('payables')
      .select('balance, paid_amount, status, due_date, total_amount')
      .eq('company_id', company_id);

    const today = new Date().toISOString().split('T')[0];

    return {
      totalPending:  (data || []).filter(r => r.status !== 'PAID').reduce((s, r) => s + (r.total_amount - r.paid_amount), 0),
      overdue:       (data || []).filter(r => r.due_date < today && r.status !== 'PAID').reduce((s, r) => s + (r.total_amount - r.paid_amount), 0),
      paidThisMonth: (data || []).filter(r => r.status === 'PAID').reduce((s, r) => s + r.paid_amount, 0),
    };
  },
};
