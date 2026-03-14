import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, X, Edit2, Trash2, Package, AlertTriangle,
  CheckCircle, Clock, ShoppingCart, FileText, BarChart2,
  Truck, FlaskConical, Pill, Calendar, ChevronDown, ChevronUp,
  AlertCircle, Eye, DollarSign, Users, RefreshCw, Filter,
  Download, Clipboard, ShieldCheck, TrendingUp, Archive
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface PharmaMedication {
  id: string;
  company_id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  laboratory: string;
  presentation: string;
  concentration: string;
  med_type: 'GENERIC' | 'COMMERCIAL';
  price: number;
  cost: number;
  stock_total: number;
  requires_prescription: boolean;
  is_controlled: boolean;
  is_active: boolean;
  image_url?: string;
}

interface PharmaLot {
  id: string;
  company_id: string;
  medication_id: string;
  medication_name?: string;
  lot_number: string;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  supplier_id?: string;
  supplier_name?: string;
  created_at: string;
}

interface PharmaSupplier {
  id: string;
  company_id: string;
  name: string;
  nit: string;
  phone: string;
  address: string;
  email: string;
  notes?: string;
}

interface PharmaPurchase {
  id: string;
  company_id: string;
  supplier_id: string;
  supplier_name?: string;
  purchase_date: string;
  total_amount: number;
  notes?: string;
  items: PharmaPurchaseItem[];
  created_at: string;
}

interface PharmaPurchaseItem {
  medication_id: string;
  medication_name: string;
  lot_number: string;
  expiry_date: string;
  quantity: number;
  unit_cost: number;
}

interface PharmaPrescription {
  id: string;
  company_id: string;
  patient_name: string;
  patient_document: string;
  doctor_name: string;
  prescription_date: string;
  medications: string;
  notes?: string;
  image_url?: string;
  created_at: string;
}

interface PharmaControlledSale {
  id: string;
  company_id: string;
  medication_id: string;
  medication_name?: string;
  patient_name: string;
  patient_document: string;
  prescription_number: string;
  doctor_name: string;
  sale_date: string;
  quantity: number;
  created_at: string;
}

// ── CONSTANTS ──────────────────────────────────────────────────────────────────

const MED_CATEGORIES = [
  'Analgésico', 'Antibiótico', 'Antiinflamatorio', 'Antialérgico',
  'Antihipertensivo', 'Antidiabético', 'Antiácido', 'Vitaminas/Suplementos',
  'Dermatológico', 'Oftalmológico', 'Pediátrico', 'Controlado', 'Otro'
];

const PRESENTATIONS = [
  'Tabletas', 'Cápsulas', 'Jarabe', 'Suspensión', 'Inyectable',
  'Crema', 'Gel', 'Gotas', 'Supositorio', 'Parche', 'Polvo', 'Otro'
];

const TABS = [
  { id: 'medications', label: 'Medicamentos',    icon: <Pill size={16} /> },
  { id: 'lots',        label: 'Lotes',            icon: <Archive size={16} /> },
  { id: 'suppliers',   label: 'Proveedores',      icon: <Truck size={16} /> },
  { id: 'purchases',   label: 'Compras',          icon: <ShoppingCart size={16} /> },
  { id: 'prescriptions',label: 'Recetas',         icon: <FileText size={16} /> },
  { id: 'controlled',  label: 'Controlados',      icon: <ShieldCheck size={16} /> },
  { id: 'reports',     label: 'Reportes',         icon: <BarChart2 size={16} /> },
] as const;
type TabId = typeof TABS[number]['id'];

const DAYS_WARN = 90; // days before expiry to show warning

function daysUntilExpiry(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function fmt(n: number) {
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
}

// ── EMPTY STATES ──────────────────────────────────────────────────────────────

const EMPTY_MED: Omit<PharmaMedication, 'id' | 'company_id' | 'stock_total'> = {
  name: '', sku: '', barcode: '', category: 'Analgésico', laboratory: '',
  presentation: 'Tabletas', concentration: '', med_type: 'GENERIC',
  price: 0, cost: 0, requires_prescription: false, is_controlled: false,
  is_active: true, image_url: '',
};

const EMPTY_LOT: Omit<PharmaLot, 'id' | 'company_id' | 'created_at' | 'medication_name' | 'supplier_name'> = {
  medication_id: '', lot_number: '', expiry_date: '', quantity: 0,
  purchase_price: 0, supplier_id: '',
};

const EMPTY_SUPPLIER: Omit<PharmaSupplier, 'id' | 'company_id'> = {
  name: '', nit: '', phone: '', address: '', email: '', notes: '',
};

const EMPTY_PRESCRIPTION: Omit<PharmaPrescription, 'id' | 'company_id' | 'created_at'> = {
  patient_name: '', patient_document: '', doctor_name: '',
  prescription_date: new Date().toISOString().slice(0, 10),
  medications: '', notes: '', image_url: '',
};

const EMPTY_CONTROLLED: Omit<PharmaControlledSale, 'id' | 'company_id' | 'created_at' | 'medication_name'> = {
  medication_id: '', patient_name: '', patient_document: '',
  prescription_number: '', doctor_name: '',
  sale_date: new Date().toISOString().slice(0, 10), quantity: 1,
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

const Farmacia: React.FC = () => {
  const { companyId } = useDatabase();
  const [tab, setTab] = useState<TabId>('medications');

  // Data
  const [medications, setMedications] = useState<PharmaMedication[]>([]);
  const [lots, setLots] = useState<PharmaLot[]>([]);
  const [suppliers, setSuppliers] = useState<PharmaSupplier[]>([]);
  const [purchases, setPurchases] = useState<PharmaPurchase[]>([]);
  const [prescriptions, setPrescriptions] = useState<PharmaPrescription[]>([]);
  const [controlledSales, setControlledSales] = useState<PharmaControlledSale[]>([]);
  const [loading, setLoading] = useState(false);

  // Search/filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Modals
  const [medModal, setMedModal] = useState<{ open: boolean; data: Partial<PharmaMedication> }>({ open: false, data: {} });
  const [lotModal, setLotModal] = useState<{ open: boolean; data: Partial<PharmaLot> }>({ open: false, data: {} });
  const [supplierModal, setSupplierModal] = useState<{ open: boolean; data: Partial<PharmaSupplier> }>({ open: false, data: {} });
  const [purchaseModal, setPurchaseModal] = useState<{ open: boolean; data: Partial<PharmaPurchase> & { items: PharmaPurchaseItem[] } }>({ open: false, data: { items: [] } });
  const [prescModal, setPrescModal] = useState<{ open: boolean; data: Partial<PharmaPrescription> }>({ open: false, data: {} });
  const [controlledModal, setControlledModal] = useState<{ open: boolean; data: Partial<PharmaControlledSale> }>({ open: false, data: {} });

  // ── LOAD ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [medsR, lotsR, suppR, purchR, prescR, ctrlR] = await Promise.all([
        supabase.from('pharma_medications').select('*').eq('company_id', companyId).order('name'),
        supabase.from('pharma_lots').select('*').eq('company_id', companyId).order('expiry_date'),
        supabase.from('pharma_suppliers').select('*').eq('company_id', companyId).order('name'),
        supabase.from('pharma_purchases').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('pharma_prescriptions').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('pharma_controlled_sales').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);

      if (medsR.data) {
        const medsWithStock = (medsR.data as PharmaMedication[]).map(m => ({
          ...m,
          stock_total: (lotsR.data || [])
            .filter((l: any) => l.medication_id === m.id && daysUntilExpiry(l.expiry_date) >= 0)
            .reduce((s: number, l: any) => s + (l.quantity || 0), 0)
        }));
        setMedications(medsWithStock);
      }
      if (lotsR.data) {
        const withNames = (lotsR.data as PharmaLot[]).map(l => ({
          ...l,
          medication_name: (medsR.data || []).find((m: any) => m.id === l.medication_id)?.name || 'Desconocido',
          supplier_name: (suppR.data || []).find((s: any) => s.id === l.supplier_id)?.name || '',
        }));
        setLots(withNames);
      }
      if (suppR.data) setSuppliers(suppR.data as PharmaSupplier[]);
      if (purchR.data) setPurchases(purchR.data as PharmaPurchase[]);
      if (prescR.data) setPrescriptions(prescR.data as PharmaPrescription[]);
      if (ctrlR.data) {
        const withNames = (ctrlR.data as PharmaControlledSale[]).map(c => ({
          ...c,
          medication_name: (medsR.data || []).find((m: any) => m.id === c.medication_id)?.name || 'Desconocido',
        }));
        setControlledSales(withNames);
      }
    } catch (err) {
      toast.error('Error cargando datos del módulo farmacia');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // ── CRUD MEDICATIONS ────────────────────────────────────────────────────────

  const saveMedication = async () => {
    if (!companyId) return;
    const d = medModal.data;
    if (!d.name || !d.sku) { toast.error('Nombre y SKU son requeridos'); return; }
    try {
      if (d.id) {
        const { error } = await supabase.from('pharma_medications').update({ ...d, company_id: companyId }).eq('id', d.id);
        if (error) throw error;
        toast.success('Medicamento actualizado');
      } else {
        const { error } = await supabase.from('pharma_medications').insert({ ...EMPTY_MED, ...d, company_id: companyId, stock_total: 0 });
        if (error) throw error;
        toast.success('Medicamento creado');
      }
      setMedModal({ open: false, data: {} });
      load();
    } catch (err: any) { toast.error(err.message || 'Error guardando'); }
  };

  const deleteMedication = async (id: string) => {
    if (!confirm('¿Eliminar este medicamento?')) return;
    const { error } = await supabase.from('pharma_medications').delete().eq('id', id);
    if (error) { toast.error('Error eliminando'); return; }
    toast.success('Eliminado');
    load();
  };

  // ── CRUD LOTS ───────────────────────────────────────────────────────────────

  const saveLot = async () => {
    if (!companyId) return;
    const d = lotModal.data;
    if (!d.medication_id || !d.lot_number || !d.expiry_date) {
      toast.error('Medicamento, lote y vencimiento son requeridos'); return;
    }
    try {
      if (d.id) {
        await supabase.from('pharma_lots').update({ ...d, company_id: companyId }).eq('id', d.id);
        toast.success('Lote actualizado');
      } else {
        await supabase.from('pharma_lots').insert({ ...EMPTY_LOT, ...d, company_id: companyId });
        toast.success('Lote registrado');
      }
      setLotModal({ open: false, data: {} });
      load();
    } catch (err: any) { toast.error(err.message || 'Error guardando lote'); }
  };

  const deleteLot = async (id: string) => {
    if (!confirm('¿Eliminar este lote?')) return;
    await supabase.from('pharma_lots').delete().eq('id', id);
    toast.success('Lote eliminado'); load();
  };

  // ── CRUD SUPPLIERS ───────────────────────────────────────────────────────────

  const saveSupplier = async () => {
    if (!companyId) return;
    const d = supplierModal.data;
    if (!d.name) { toast.error('El nombre del proveedor es requerido'); return; }
    try {
      if (d.id) {
        await supabase.from('pharma_suppliers').update({ ...d, company_id: companyId }).eq('id', d.id);
        toast.success('Proveedor actualizado');
      } else {
        await supabase.from('pharma_suppliers').insert({ ...EMPTY_SUPPLIER, ...d, company_id: companyId });
        toast.success('Proveedor creado');
      }
      setSupplierModal({ open: false, data: {} });
      load();
    } catch (err: any) { toast.error(err.message || 'Error guardando proveedor'); }
  };

  const deleteSupplier = async (id: string) => {
    if (!confirm('¿Eliminar este proveedor?')) return;
    await supabase.from('pharma_suppliers').delete().eq('id', id);
    toast.success('Proveedor eliminado'); load();
  };

  // ── CRUD PRESCRIPTIONS ────────────────────────────────────────────────────────

  const savePrescription = async () => {
    if (!companyId) return;
    const d = prescModal.data;
    if (!d.patient_name || !d.doctor_name) { toast.error('Paciente y médico son requeridos'); return; }
    try {
      if (d.id) {
        await supabase.from('pharma_prescriptions').update({ ...d, company_id: companyId }).eq('id', d.id);
        toast.success('Receta actualizada');
      } else {
        await supabase.from('pharma_prescriptions').insert({ ...EMPTY_PRESCRIPTION, ...d, company_id: companyId });
        toast.success('Receta registrada');
      }
      setPrescModal({ open: false, data: {} });
      load();
    } catch (err: any) { toast.error(err.message || 'Error guardando receta'); }
  };

  // ── CRUD CONTROLLED SALES ────────────────────────────────────────────────────

  const saveControlled = async () => {
    if (!companyId) return;
    const d = controlledModal.data;
    if (!d.medication_id || !d.patient_name || !d.prescription_number) {
      toast.error('Medicamento, paciente y número de receta son requeridos'); return;
    }
    try {
      await supabase.from('pharma_controlled_sales').insert({ ...EMPTY_CONTROLLED, ...d, company_id: companyId });
      toast.success('Registro de venta controlada guardado');
      setControlledModal({ open: false, data: {} });
      load();
    } catch (err: any) { toast.error(err.message || 'Error guardando'); }
  };

  // ── SAVE PURCHASE ─────────────────────────────────────────────────────────────

  const savePurchase = async () => {
    if (!companyId) return;
    const d = purchaseModal.data;
    if (!d.supplier_id || !d.items?.length) {
      toast.error('Seleccione proveedor y agregue al menos un medicamento'); return;
    }
    try {
      const total = d.items.reduce((s, i) => s + i.quantity * i.unit_cost, 0);
      const { data: pur, error: purErr } = await supabase.from('pharma_purchases').insert({
        company_id: companyId,
        supplier_id: d.supplier_id,
        purchase_date: d.purchase_date || new Date().toISOString().slice(0, 10),
        total_amount: total,
        notes: d.notes || '',
        items: d.items,
      }).select().single();
      if (purErr) throw purErr;

      // Create lots from purchase items
      for (const item of d.items!) {
        await supabase.from('pharma_lots').insert({
          company_id: companyId,
          medication_id: item.medication_id,
          lot_number: item.lot_number,
          expiry_date: item.expiry_date,
          quantity: item.quantity,
          purchase_price: item.unit_cost,
          supplier_id: d.supplier_id,
        });
      }
      toast.success('Compra registrada y lotes actualizados');
      setPurchaseModal({ open: false, data: { items: [] } });
      load();
    } catch (err: any) { toast.error(err.message || 'Error registrando compra'); }
  };

  // ── DERIVED DATA ──────────────────────────────────────────────────────────────

  const expiringSoon = lots.filter(l => {
    const d = daysUntilExpiry(l.expiry_date);
    return d >= 0 && d <= DAYS_WARN;
  });
  const expired = lots.filter(l => daysUntilExpiry(l.expiry_date) < 0);

  const filteredMeds = medications.filter(m => {
    const q = search.toLowerCase();
    const matchQ = !q || m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || (m.barcode || '').includes(q);
    const matchC = !filterCategory || m.category === filterCategory;
    return matchQ && matchC;
  });

  // ── STATS ─────────────────────────────────────────────────────────────────────

  const totalMeds = medications.length;
  const lowStock = medications.filter(m => m.stock_total < 10).length;
  const totalSuppliers = suppliers.length;
  const pendingPrescriptions = prescriptions.length;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen" style={{ background: '#f0f9ff', fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0891b2 100%)', padding: '24px 32px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 12 }}>
              <FlaskConical size={28} color="#fff" />
            </div>
            <div>
              <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
                Módulo Farmacia
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: 0 }}>
                Droguería · Control farmacéutico integral
              </p>
            </div>
          </div>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 0, paddingBottom: 0 }}>
          {[
            { label: 'Medicamentos', value: totalMeds, icon: <Pill size={18} />, color: '#34d399' },
            { label: 'Stock bajo (<10)', value: lowStock, icon: <AlertTriangle size={18} />, color: '#fbbf24', alert: lowStock > 0 },
            { label: 'Por vencer', value: expiringSoon.length, icon: <Clock size={18} />, color: '#f97316', alert: expiringSoon.length > 0 },
            { label: 'Vencidos', value: expired.length, icon: <AlertCircle size={18} />, color: '#f87171', alert: expired.length > 0 },
            { label: 'Proveedores', value: totalSuppliers, icon: <Truck size={18} />, color: '#a78bfa' },
            { label: 'Recetas', value: pendingPrescriptions, icon: <FileText size={18} />, color: '#60a5fa' },
          ].map((s, i) => (
            <div key={i} style={{
              background: s.alert ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.12)',
              borderRadius: '12px 12px 0 0', padding: '12px 16px',
              border: s.alert ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.1)',
              borderBottom: 'none',
            }}>
              <div style={{ color: s.color, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 2, marginTop: 16 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as TabId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                background: tab === t.id ? '#fff' : 'rgba(255,255,255,0.12)',
                color: tab === t.id ? '#0f766e' : 'rgba(255,255,255,0.85)',
                border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                transition: 'all 0.15s',
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: 24 }}>

        {/* ── MEDICATIONS TAB ─────────────────────────────────────────────── */}
        {tab === 'medications' && (
          <div>
            {/* Alerts */}
            {(expiringSoon.length > 0 || expired.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: expired.length > 0 ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 20 }}>
                {expiringSoon.length > 0 && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={20} color="#f97316" />
                    <div>
                      <div style={{ fontWeight: 700, color: '#c2410c', fontSize: 13 }}>⚠️ {expiringSoon.length} lote(s) por vencer en {DAYS_WARN} días</div>
                      <div style={{ fontSize: 12, color: '#9a3412' }}>{expiringSoon.slice(0, 3).map(l => `${l.medication_name} (${l.lot_number})`).join(', ')}{expiringSoon.length > 3 ? '...' : ''}</div>
                    </div>
                  </div>
                )}
                {expired.length > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertCircle size={20} color="#ef4444" />
                    <div>
                      <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 13 }}>🚫 {expired.length} lote(s) VENCIDOS — requieren acción inmediata</div>
                      <div style={{ fontSize: 12, color: '#991b1b' }}>{expired.slice(0, 3).map(l => `${l.medication_name} (${l.lot_number})`).join(', ')}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, SKU o código..."
                  style={{ width: '100%', paddingLeft: 38, padding: '10px 12px 10px 38px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#fff' }} />
              </div>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: '#fff', color: '#334155' }}>
                <option value="">Todas las categorías</option>
                {MED_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <button onClick={() => setMedModal({ open: true, data: { ...EMPTY_MED } })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}>
                <Plus size={16} /> Nuevo Medicamento
              </button>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Medicamento', 'Categoría', 'Laboratorio', 'Presentación', 'Precio', 'Stock', 'Receta', 'Controlado', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMeds.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      <Pill size={32} style={{ marginBottom: 8, opacity: 0.4 }} /><br />No hay medicamentos registrados
                    </td></tr>
                  ) : filteredMeds.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>SKU: {m.sku} {m.barcode ? `· ${m.barcode}` : ''}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>{m.category}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>{m.laboratory || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>{m.presentation}<br /><span style={{ fontSize: 11, color: '#94a3b8' }}>{m.concentration}</span></td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#0f766e' }}>{fmt(m.price)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: m.stock_total < 10 ? '#fee2e2' : m.stock_total < 30 ? '#fef9c3' : '#dcfce7',
                          color: m.stock_total < 10 ? '#dc2626' : m.stock_total < 30 ? '#ca8a04' : '#16a34a',
                        }}>{m.stock_total}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {m.requires_prescription
                          ? <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>Sí</span>
                          : <span style={{ color: '#94a3b8', fontSize: 12 }}>No</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {m.is_controlled
                          ? <span style={{ background: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>⚠️ Controlado</span>
                          : <span style={{ color: '#94a3b8', fontSize: 12 }}>No</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setMedModal({ open: true, data: { ...m } })}
                            style={{ background: '#eff6ff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: '#2563eb' }}><Edit2 size={14} /></button>
                          <button onClick={() => deleteMedication(m.id)}
                            style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── LOTS TAB ─────────────────────────────────────────────────────── */}
        {tab === 'lots' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Control de Lotes y Vencimientos</h2>
              <button onClick={() => setLotModal({ open: true, data: { ...EMPTY_LOT } })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                <Plus size={16} /> Nuevo Lote
              </button>
            </div>

            {/* Summary chips */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: '✅ Vigentes', count: lots.filter(l => daysUntilExpiry(l.expiry_date) > DAYS_WARN).length, bg: '#dcfce7', color: '#16a34a' },
                { label: `⚠️ Por vencer (<${DAYS_WARN}d)`, count: expiringSoon.length, bg: '#fef9c3', color: '#ca8a04' },
                { label: '🚫 Vencidos', count: expired.length, bg: '#fee2e2', color: '#dc2626' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, color: s.color, padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                  {s.label}: {s.count}
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Medicamento', 'Lote', 'Vencimiento', 'Días restantes', 'Cantidad', 'Costo compra', 'Proveedor', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lots.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>No hay lotes registrados</td></tr>
                  ) : lots.map(l => {
                    const days = daysUntilExpiry(l.expiry_date);
                    const isExp = days < 0;
                    const isWarn = days >= 0 && days <= DAYS_WARN;
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: isExp ? '#fff5f5' : isWarn ? '#fffbeb' : 'transparent' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{l.medication_name}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569', fontFamily: 'monospace' }}>{l.lot_number}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>{new Date(l.expiry_date).toLocaleDateString('es-CO')}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                            background: isExp ? '#fee2e2' : isWarn ? '#fef9c3' : '#dcfce7',
                            color: isExp ? '#dc2626' : isWarn ? '#ca8a04' : '#16a34a',
                          }}>
                            {isExp ? `Vencido (${Math.abs(days)}d)` : `${days} días`}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#334155' }}>{l.quantity} unid.</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>{fmt(l.purchase_price)}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>{l.supplier_name || '—'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setLotModal({ open: true, data: { ...l } })}
                              style={{ background: '#eff6ff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: '#2563eb' }}><Edit2 size={14} /></button>
                            <button onClick={() => deleteLot(l.id)}
                              style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SUPPLIERS TAB ────────────────────────────────────────────────── */}
        {tab === 'suppliers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Proveedores</h2>
              <button onClick={() => setSupplierModal({ open: true, data: { ...EMPTY_SUPPLIER } })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                <Plus size={16} /> Nuevo Proveedor
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {suppliers.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                  <Truck size={32} style={{ marginBottom: 8, opacity: 0.4 }} /><br />No hay proveedores registrados
                </div>
              ) : suppliers.map(s => (
                <div key={s.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{s.name}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setSupplierModal({ open: true, data: { ...s } })}
                        style={{ background: '#eff6ff', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#2563eb' }}><Edit2 size={13} /></button>
                      <button onClick={() => deleteSupplier(s.id)}
                        style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {[
                    { label: 'NIT', val: s.nit }, { label: 'Tel', val: s.phone },
                    { label: 'Email', val: s.email }, { label: 'Dirección', val: s.address },
                  ].map(f => f.val ? (
                    <div key={f.label} style={{ fontSize: 13, color: '#64748b', marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{f.label}: </span>{f.val}
                    </div>
                  ) : null)}
                  {s.notes && <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>{s.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PURCHASES TAB ────────────────────────────────────────────────── */}
        {tab === 'purchases' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Compras a Proveedores</h2>
              <button onClick={() => setPurchaseModal({ open: true, data: { supplier_id: '', purchase_date: new Date().toISOString().slice(0, 10), items: [] } })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                <Plus size={16} /> Nueva Compra
              </button>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Fecha', 'Proveedor', 'Medicamentos', 'Total', 'Notas'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {purchases.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>No hay compras registradas</td></tr>
                  ) : purchases.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>{new Date(p.purchase_date).toLocaleDateString('es-CO')}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.supplier_name || suppliers.find(s => s.id === p.supplier_id)?.name || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>{(p.items as any)?.length || 0} ítem(s)</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#0f766e' }}>{fmt(p.total_amount)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8' }}>{p.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PRESCRIPTIONS TAB ───────────────────────────────────────────── */}
        {tab === 'prescriptions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Recetas Médicas</h2>
              <button onClick={() => setPrescModal({ open: true, data: { ...EMPTY_PRESCRIPTION } })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                <Plus size={16} /> Nueva Receta
              </button>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Fecha', 'Paciente', 'Documento', 'Médico', 'Medicamentos', 'Notas'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      <FileText size={32} style={{ marginBottom: 8, opacity: 0.4 }} /><br />No hay recetas registradas
                    </td></tr>
                  ) : prescriptions.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>{new Date(p.prescription_date).toLocaleDateString('es-CO')}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.patient_name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569', fontFamily: 'monospace' }}>{p.patient_document}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569' }}>{p.doctor_name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569', maxWidth: 200 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.medications}</div></td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8' }}>{p.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CONTROLLED TAB ───────────────────────────────────────────────── */}
        {tab === 'controlled' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Medicamentos Controlados</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Registro de ventas de opioides, psicotrópicos y sedantes</p>
              </div>
              <button onClick={() => setControlledModal({ open: true, data: { ...EMPTY_CONTROLLED } })}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                <Plus size={16} /> Registrar Venta Controlada
              </button>
            </div>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={20} color="#f97316" />
              <div style={{ fontSize: 13, color: '#9a3412' }}>
                <strong>Cumplimiento normativo:</strong> Todos los registros de medicamentos controlados quedan en el libro de ventas para auditorías sanitarias.
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Fecha', 'Medicamento', 'Paciente', 'Documento', 'N° Receta', 'Médico', 'Cantidad'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {controlledSales.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      <ShieldCheck size={32} style={{ marginBottom: 8, opacity: 0.4 }} /><br />No hay registros de ventas controladas
                    </td></tr>
                  ) : controlledSales.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>{new Date(c.sale_date).toLocaleDateString('es-CO')}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.medication_name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>{c.patient_name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontFamily: 'monospace' }}>{c.patient_document}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontFamily: 'monospace' }}>{c.prescription_number}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>{c.doctor_name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{c.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REPORTS TAB ──────────────────────────────────────────────────── */}
        {tab === 'reports' && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin:0 }}>Reportes del Módulo</h2>
              <button onClick={() => {
                const wb = XLSX.utils.book_new();
                const rows = medications.map(m => ({
                  'Nombre': m.name, 'Categoría': m.category, 'Fabricante': m.manufacturer||'',
                  'Stock Total': m.stock_total, 'Precio': m.sale_price,
                  'Requiere Receta': m.requires_prescription ? 'Sí' : 'No',
                  'Controlado': m.is_controlled ? 'Sí' : 'No',
                  'Vencimiento': m.expiry_date || '',
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Medicamentos');
                XLSX.writeFile(wb, `Farmacia_Reporte_${new Date().toISOString().slice(0,10)}.xlsx`);
              }} style={{ display:'flex', alignItems:'center', gap:6, background:'#16a34a', color:'#fff', border:'none', borderRadius:10, padding:'8px 16px', cursor:'pointer', fontWeight:700, fontSize:13 }}>
                <Download size={14} /> Exportar Excel
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>

              {/* Medications by category */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: '#e0f2fe', borderRadius: 8, padding: 8 }}><Pill size={18} color="#0891b2" /></div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Medicamentos por Categoría</div>
                </div>
                {MED_CATEGORIES.filter(c => medications.some(m => m.category === c)).map(c => {
                  const count = medications.filter(m => m.category === c).length;
                  const pct = Math.round((count / totalMeds) * 100);
                  return (
                    <div key={c} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                        <span style={{ color: '#475569' }}>{c}</span>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{count}</span>
                      </div>
                      <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6 }}>
                        <div style={{ background: '#0891b2', width: `${pct}%`, height: '100%', borderRadius: 4, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stock summary */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: '#dcfce7', borderRadius: 8, padding: 8 }}><Archive size={18} color="#16a34a" /></div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Resumen de Inventario</div>
                </div>
                {[
                  { label: 'Total medicamentos', value: totalMeds, color: '#0891b2' },
                  { label: 'Con stock suficiente (≥30)', value: medications.filter(m => m.stock_total >= 30).length, color: '#16a34a' },
                  { label: 'Stock bajo (10-29)', value: medications.filter(m => m.stock_total >= 10 && m.stock_total < 30).length, color: '#ca8a04' },
                  { label: 'Stock crítico (<10)', value: medications.filter(m => m.stock_total < 10).length, color: '#dc2626' },
                  { label: 'Requieren receta', value: medications.filter(m => m.requires_prescription).length, color: '#7c3aed' },
                  { label: 'Controlados', value: medications.filter(m => m.is_controlled).length, color: '#dc2626' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{r.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: r.color }}>{r.value}</span>
                  </div>
                ))}
              </div>

              {/* Expiry report */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: '#fef9c3', borderRadius: 8, padding: 8 }}><Clock size={18} color="#ca8a04" /></div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Alertas de Vencimiento</div>
                </div>
                {expired.length === 0 && expiringSoon.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#16a34a', padding: '20px 0' }}>
                    <CheckCircle size={28} style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>¡Todo en orden! Sin vencimientos próximos</div>
                  </div>
                ) : [...expired.map(l => ({ ...l, isExpired: true })), ...expiringSoon.map(l => ({ ...l, isExpired: false }))].slice(0, 8).map(l => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{l.medication_name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Lote {l.lot_number}</div>
                    </div>
                    <span style={{
                      padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: (l as any).isExpired ? '#fee2e2' : '#fef9c3',
                      color: (l as any).isExpired ? '#dc2626' : '#ca8a04'
                    }}>
                      {(l as any).isExpired ? 'VENCIDO' : `${daysUntilExpiry(l.expiry_date)}d`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Purchase summary */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: '#ede9fe', borderRadius: 8, padding: 8 }}><TrendingUp size={18} color="#7c3aed" /></div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Resumen de Compras</div>
                </div>
                {[
                  { label: 'Total compras', value: purchases.length, fmt: false },
                  { label: 'Inversión total', value: purchases.reduce((s, p) => s + (p.total_amount || 0), 0), fmt: true },
                  { label: 'Total lotes', value: lots.length, fmt: false },
                  { label: 'Unidades en inventario', value: lots.filter(l => daysUntilExpiry(l.expiry_date) >= 0).reduce((s, l) => s + l.quantity, 0), fmt: false },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, color: '#475569' }}>{r.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed' }}>{r.fmt ? fmt(r.value) : r.value}</span>
                  </div>
                ))}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* Medication Modal */}
      {medModal.open && (
        <Modal title={medModal.data.id ? 'Editar Medicamento' : 'Nuevo Medicamento'} onClose={() => setMedModal({ open: false, data: {} })}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nombre *" required>
              <input value={medModal.data.name || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, name: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="SKU *">
              <input value={medModal.data.sku || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, sku: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Código de barras">
              <input value={medModal.data.barcode || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, barcode: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Laboratorio">
              <input value={medModal.data.laboratory || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, laboratory: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Categoría">
              <select value={medModal.data.category || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, category: e.target.value } }))} style={inputStyle}>
                {MED_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Presentación">
              <select value={medModal.data.presentation || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, presentation: e.target.value } }))} style={inputStyle}>
                {PRESENTATIONS.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Concentración">
              <input placeholder="Ej: 500mg" value={medModal.data.concentration || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, concentration: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Tipo">
              <select value={medModal.data.med_type || 'GENERIC'} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, med_type: e.target.value as any } }))} style={inputStyle}>
                <option value="GENERIC">Genérico</option>
                <option value="COMMERCIAL">Comercial</option>
              </select>
            </Field>
            <Field label="Precio de venta">
              <input type="number" value={medModal.data.price || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, price: +e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Precio de compra">
              <input type="number" value={medModal.data.cost || ''} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, cost: +e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="" span>
              <div style={{ display: 'flex', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#334155' }}>
                  <input type="checkbox" checked={!!medModal.data.requires_prescription} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, requires_prescription: e.target.checked } }))} style={{ width: 16, height: 16 }} />
                  Requiere receta médica
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#334155' }}>
                  <input type="checkbox" checked={!!medModal.data.is_controlled} onChange={e => setMedModal(m => ({ ...m, data: { ...m.data, is_controlled: e.target.checked } }))} style={{ width: 16, height: 16 }} />
                  Medicamento controlado
                </label>
              </div>
            </Field>
          </div>
          <ModalFooter onCancel={() => setMedModal({ open: false, data: {} })} onSave={saveMedication} />
        </Modal>
      )}

      {/* Lot Modal */}
      {lotModal.open && (
        <Modal title={lotModal.data.id ? 'Editar Lote' : 'Nuevo Lote'} onClose={() => setLotModal({ open: false, data: {} })}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Medicamento *" span>
              <select value={lotModal.data.medication_id || ''} onChange={e => setLotModal(m => ({ ...m, data: { ...m.data, medication_id: e.target.value } }))} style={inputStyle}>
                <option value="">Seleccionar...</option>
                {medications.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Número de lote *">
              <input value={lotModal.data.lot_number || ''} onChange={e => setLotModal(m => ({ ...m, data: { ...m.data, lot_number: e.target.value } }))} style={inputStyle} placeholder="Ej: L001" />
            </Field>
            <Field label="Fecha de vencimiento *">
              <input type="date" value={lotModal.data.expiry_date || ''} onChange={e => setLotModal(m => ({ ...m, data: { ...m.data, expiry_date: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Cantidad">
              <input type="number" value={lotModal.data.quantity || ''} onChange={e => setLotModal(m => ({ ...m, data: { ...m.data, quantity: +e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Precio de compra">
              <input type="number" value={lotModal.data.purchase_price || ''} onChange={e => setLotModal(m => ({ ...m, data: { ...m.data, purchase_price: +e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Proveedor">
              <select value={lotModal.data.supplier_id || ''} onChange={e => setLotModal(m => ({ ...m, data: { ...m.data, supplier_id: e.target.value } }))} style={inputStyle}>
                <option value="">Sin proveedor</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <ModalFooter onCancel={() => setLotModal({ open: false, data: {} })} onSave={saveLot} />
        </Modal>
      )}

      {/* Supplier Modal */}
      {supplierModal.open && (
        <Modal title={supplierModal.data.id ? 'Editar Proveedor' : 'Nuevo Proveedor'} onClose={() => setSupplierModal({ open: false, data: {} })}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nombre empresa *" span>
              <input value={supplierModal.data.name || ''} onChange={e => setSupplierModal(m => ({ ...m, data: { ...m.data, name: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="NIT">
              <input value={supplierModal.data.nit || ''} onChange={e => setSupplierModal(m => ({ ...m, data: { ...m.data, nit: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Teléfono">
              <input value={supplierModal.data.phone || ''} onChange={e => setSupplierModal(m => ({ ...m, data: { ...m.data, phone: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Correo electrónico">
              <input type="email" value={supplierModal.data.email || ''} onChange={e => setSupplierModal(m => ({ ...m, data: { ...m.data, email: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Dirección">
              <input value={supplierModal.data.address || ''} onChange={e => setSupplierModal(m => ({ ...m, data: { ...m.data, address: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Observaciones" span>
              <textarea value={supplierModal.data.notes || ''} onChange={e => setSupplierModal(m => ({ ...m, data: { ...m.data, notes: e.target.value } }))} style={{ ...inputStyle, height: 80, resize: 'vertical' }} />
            </Field>
          </div>
          <ModalFooter onCancel={() => setSupplierModal({ open: false, data: {} })} onSave={saveSupplier} />
        </Modal>
      )}

      {/* Purchase Modal */}
      {purchaseModal.open && (
        <Modal title="Nueva Compra" onClose={() => setPurchaseModal({ open: false, data: { items: [] } })} wide>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Field label="Proveedor *" span>
              <select value={purchaseModal.data.supplier_id || ''} onChange={e => setPurchaseModal(m => ({ ...m, data: { ...m.data, supplier_id: e.target.value } }))} style={inputStyle}>
                <option value="">Seleccionar proveedor...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Fecha de compra">
              <input type="date" value={purchaseModal.data.purchase_date || ''} onChange={e => setPurchaseModal(m => ({ ...m, data: { ...m.data, purchase_date: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Notas">
              <input value={purchaseModal.data.notes || ''} onChange={e => setPurchaseModal(m => ({ ...m, data: { ...m.data, notes: e.target.value } }))} style={inputStyle} />
            </Field>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 10 }}>Medicamentos comprados</div>
            <PurchaseItemsEditor
              items={purchaseModal.data.items || []}
              medications={medications}
              onChange={items => setPurchaseModal(m => ({ ...m, data: { ...m.data, items } }))}
            />
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f766e' }}>
              Total: {fmt((purchaseModal.data.items || []).reduce((s, i) => s + i.quantity * i.unit_cost, 0))}
            </div>
          </div>

          <ModalFooter onCancel={() => setPurchaseModal({ open: false, data: { items: [] } })} onSave={savePurchase} saveLabel="Registrar Compra" />
        </Modal>
      )}

      {/* Prescription Modal */}
      {prescModal.open && (
        <Modal title="Registrar Receta Médica" onClose={() => setPrescModal({ open: false, data: {} })}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Paciente *">
              <input value={prescModal.data.patient_name || ''} onChange={e => setPrescModal(m => ({ ...m, data: { ...m.data, patient_name: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Documento">
              <input value={prescModal.data.patient_document || ''} onChange={e => setPrescModal(m => ({ ...m, data: { ...m.data, patient_document: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Médico *">
              <input value={prescModal.data.doctor_name || ''} onChange={e => setPrescModal(m => ({ ...m, data: { ...m.data, doctor_name: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Fecha">
              <input type="date" value={prescModal.data.prescription_date || ''} onChange={e => setPrescModal(m => ({ ...m, data: { ...m.data, prescription_date: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Medicamentos recetados" span>
              <textarea placeholder="Ej: Amoxicilina 500mg c/8h x 7 días, Ibuprofeno 400mg PRN" value={prescModal.data.medications || ''} onChange={e => setPrescModal(m => ({ ...m, data: { ...m.data, medications: e.target.value } }))} style={{ ...inputStyle, height: 80, resize: 'vertical' }} />
            </Field>
            <Field label="Observaciones" span>
              <textarea value={prescModal.data.notes || ''} onChange={e => setPrescModal(m => ({ ...m, data: { ...m.data, notes: e.target.value } }))} style={{ ...inputStyle, height: 60, resize: 'vertical' }} />
            </Field>
          </div>
          <ModalFooter onCancel={() => setPrescModal({ open: false, data: {} })} onSave={savePrescription} />
        </Modal>
      )}

      {/* Controlled Sale Modal */}
      {controlledModal.open && (
        <Modal title="Registrar Venta Medicamento Controlado" onClose={() => setControlledModal({ open: false, data: {} })}>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#b91c1c' }}>
            ⚠️ Este registro es obligatorio para cumplir la normativa sanitaria colombiana.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Medicamento *" span>
              <select value={controlledModal.data.medication_id || ''} onChange={e => setControlledModal(m => ({ ...m, data: { ...m.data, medication_id: e.target.value } }))} style={inputStyle}>
                <option value="">Seleccionar...</option>
                {medications.filter(m => m.is_controlled).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                {medications.filter(m => !m.is_controlled).length > 0 && (
                  <>
                    <option disabled>── Otros medicamentos ──</option>
                    {medications.filter(m => !m.is_controlled).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </>
                )}
              </select>
            </Field>
            <Field label="Paciente *">
              <input value={controlledModal.data.patient_name || ''} onChange={e => setControlledModal(m => ({ ...m, data: { ...m.data, patient_name: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Documento paciente">
              <input value={controlledModal.data.patient_document || ''} onChange={e => setControlledModal(m => ({ ...m, data: { ...m.data, patient_document: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="N° Receta *">
              <input value={controlledModal.data.prescription_number || ''} onChange={e => setControlledModal(m => ({ ...m, data: { ...m.data, prescription_number: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Médico tratante *">
              <input value={controlledModal.data.doctor_name || ''} onChange={e => setControlledModal(m => ({ ...m, data: { ...m.data, doctor_name: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Fecha venta">
              <input type="date" value={controlledModal.data.sale_date || ''} onChange={e => setControlledModal(m => ({ ...m, data: { ...m.data, sale_date: e.target.value } }))} style={inputStyle} />
            </Field>
            <Field label="Cantidad">
              <input type="number" min={1} value={controlledModal.data.quantity || 1} onChange={e => setControlledModal(m => ({ ...m, data: { ...m.data, quantity: +e.target.value } }))} style={inputStyle} />
            </Field>
          </div>
          <ModalFooter onCancel={() => setControlledModal({ open: false, data: {} })} onSave={saveControlled} saveLabel="Registrar" saveColor="#dc2626" />
        </Modal>
      )}
    </div>
  );
};

// ── PURCHASE ITEMS EDITOR ──────────────────────────────────────────────────────

const PurchaseItemsEditor: React.FC<{
  items: PharmaPurchaseItem[];
  medications: PharmaMedication[];
  onChange: (items: PharmaPurchaseItem[]) => void;
}> = ({ items, medications, onChange }) => {
  const [newItem, setNewItem] = useState<Partial<PharmaPurchaseItem>>({});

  const addItem = () => {
    if (!newItem.medication_id || !newItem.lot_number || !newItem.expiry_date) {
      toast.error('Medicamento, lote y vencimiento son requeridos'); return;
    }
    const med = medications.find(m => m.id === newItem.medication_id);
    onChange([...items, {
      medication_id: newItem.medication_id!,
      medication_name: med?.name || '',
      lot_number: newItem.lot_number!,
      expiry_date: newItem.expiry_date!,
      quantity: newItem.quantity || 1,
      unit_cost: newItem.unit_cost || 0,
    }]);
    setNewItem({});
  };

  return (
    <div>
      {/* Add row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
        <div><label style={labelStyle}>Medicamento</label>
          <select value={newItem.medication_id || ''} onChange={e => setNewItem(n => ({ ...n, medication_id: e.target.value }))} style={inputStyle}>
            <option value="">Seleccionar...</option>
            {medications.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>Lote</label>
          <input value={newItem.lot_number || ''} onChange={e => setNewItem(n => ({ ...n, lot_number: e.target.value }))} style={inputStyle} placeholder="L001" />
        </div>
        <div><label style={labelStyle}>Vencimiento</label>
          <input type="date" value={newItem.expiry_date || ''} onChange={e => setNewItem(n => ({ ...n, expiry_date: e.target.value }))} style={inputStyle} />
        </div>
        <div><label style={labelStyle}>Cantidad</label>
          <input type="number" value={newItem.quantity || ''} onChange={e => setNewItem(n => ({ ...n, quantity: +e.target.value }))} style={inputStyle} />
        </div>
        <div><label style={labelStyle}>Costo unit.</label>
          <input type="number" value={newItem.unit_cost || ''} onChange={e => setNewItem(n => ({ ...n, unit_cost: +e.target.value }))} style={inputStyle} />
        </div>
        <button onClick={addItem} style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', marginTop: 18 }}>
          <Plus size={16} />
        </button>
      </div>

      {/* Items list */}
      {items.length > 0 && (
        <div style={{ background: '#f8fafc', borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Medicamento', 'Lote', 'Vencimiento', 'Cantidad', 'Costo unit.', 'Total', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{item.medication_name}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{item.lot_number}</td>
                  <td style={{ padding: '8px 12px' }}>{new Date(item.expiry_date).toLocaleDateString('es-CO')}</td>
                  <td style={{ padding: '8px 12px' }}>{item.quantity}</td>
                  <td style={{ padding: '8px 12px' }}>{fmt(item.unit_cost)}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f766e' }}>{fmt(item.quantity * item.unit_cost)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <button onClick={() => onChange(items.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── SHARED UI HELPERS ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#1e293b',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4,
};

const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean; span?: boolean }> = ({ label, children, required, span }) => (
  <div style={{ gridColumn: span ? '1 / -1' : undefined }}>
    {label && <label style={labelStyle}>{label}{required && <span style={{ color: '#dc2626' }}> *</span>}</label>}
    {children}
  </div>
);

const Modal: React.FC<{ title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ title, children, onClose, wide }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: wide ? 860 : 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{title}</h3>
        <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>
);

const ModalFooter: React.FC<{ onCancel: () => void; onSave: () => void; saveLabel?: string; saveColor?: string }> = ({ onCancel, onSave, saveLabel = 'Guardar', saveColor = '#0f766e' }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
    <button onClick={onCancel} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
      Cancelar
    </button>
    <button onClick={onSave} style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: saveColor, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
      {saveLabel}
    </button>
  </div>
);

export default Farmacia;