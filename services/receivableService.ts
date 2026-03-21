import { supabase } from '../supabaseClient';

export type ReceivableStatus = 'PENDING' | 'OVERDUE' | 'PAID' | 'PARTIAL';

export interface Receivable {
  id?: string;
  company_id: string;
  customer_id?: string;
  customer_name: string;
  customer_document?: string;
  invoice_id?: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  due_date: string;
  status: ReceivableStatus;
  notes?: string;
}

export const receivableService = {
  async getAll(company_id: string): Promise<Receivable[]> {
    const { data, error } = await supabase
      .from('receivables').select('*')
      .eq('company_id', company_id)
      .neq('status', 'PAID')
      .order('due_date');
    if (error) throw error;
    const now = new Date().toISOString();
    return (data || []).map(r => ({
      ...r,
      status: r.status !== 'PAID' && r.due_date < now ? 'OVERDUE' : r.status
    }));
  },

  async create(rec: Omit<Receivable, 'id' | 'balance'>): Promise<Receivable> {
    const balance = rec.total_amount - (rec.paid_amount || 0);
    const { data, error } = await supabase
      .from('receivables').insert({ ...rec, balance }).select().single();
    if (error) throw error;
    return data;
  },

  async registerPayment(receivable_id: string, amount: number, method: string, notes?: string): Promise<Receivable> {
    const { data: rec, error: fetchErr } = await supabase
      .from('receivables').select('*').eq('id', receivable_id).single();
    if (fetchErr) throw fetchErr;

    const newPaid = rec.paid_amount + amount;
    const newBalance = Math.max(0, rec.total_amount - newPaid);
    const newStatus: ReceivableStatus = newBalance === 0 ? 'PAID' : 'PARTIAL';

    const { data, error } = await supabase
      .from('receivables')
      .update({ paid_amount: newPaid, balance: newBalance, status: newStatus })
      .eq('id', receivable_id).select().single();
    if (error) throw error;

    await supabase.from('payment_records').insert({
      receivable_id,
      company_id: rec.company_id,
      amount,
      payment_method: method,
      notes,
    });

    return data;
  },

  async getSummary(company_id: string) {
    const { data } = await supabase
      .from('receivables').select('balance, paid_amount, status, due_date')
      .eq('company_id', company_id);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    return {
      totalPortfolio: (data || []).filter(r => r.status !== 'PAID').reduce((s, r) => s + r.balance, 0),
      overdue30: (data || []).filter(r => r.due_date < thirtyDaysAgo && r.status !== 'PAID').reduce((s, r) => s + r.balance, 0),
      collectedThisMonth: (data || []).filter(r => r.status === 'PAID').reduce((s, r) => s + r.paid_amount, 0),
    };
  }
};