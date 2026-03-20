import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, User, CheckCircle, XCircle, Clock, RefreshCw,
  X, Edit2, Trash2, DollarSign, Calendar, Search,
  Users, AlertTriangle, Dumbbell, BarChart2, Tag,
  CreditCard, Printer, MessageCircle, Banknote, Receipt,
  ArrowRight, Smartphone, UserCheck, Activity, Apple,
  Link2, QrCode, Copy, ChevronDown, ChevronUp, Target,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useDatabase } from '../contexts/DatabaseContext';
import { useCurrency } from '../contexts/CurrencyContext';
import toast from 'react-hot-toast';

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type MemberStatus = 'ACTIVE' | 'EXPIRED' | 'FROZEN' | 'CANCELLED';
type PayMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'NEQUI' | 'DAVIPLATA';

interface MembershipType {
  id: string; company_id: string; name: string;
  duration_days: number; price: number; description?: string; is_active: boolean;
}

interface Member {
  id: string; company_id: string; full_name: string;
  document?: string; phone?: string; email?: string;
  membership_type_id: string; membership_type_name: string;
  membership_price: number; start_date: string; end_date: string;
  status: MemberStatus; photo_url?: string; notes?: string; created_at: string;
}

interface CheckIn {
  id: string; company_id: string; member_id: string;
  member_name: string; checked_in_at: string; status: MemberStatus;
  type?: 'IN' | 'OUT';
}

interface GymClass {
  id: string; company_id: string; name: string; instructor: string;
  day_of_week: number; start_time: string; duration_min: number;
  room?: string; max_capacity: number; is_active: boolean;
}

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const STATUS_CFG: Record<MemberStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  ACTIVE:    { label: 'Activa',    cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle size={11} /> },
  EXPIRED:   { label: 'Vencida',   cls: 'bg-red-100 text-red-700',         icon: <XCircle size={11} /> },
  FROZEN:    { label: 'Congelada', cls: 'bg-blue-100 text-blue-700',       icon: <Clock size={11} /> },
  CANCELLED: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500',     icon: <X size={11} /> },
};

const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  CASH: '💵 Efectivo', CARD: '💳 Tarjeta',
  TRANSFER: '🏛️ Transferencia', NEQUI: '🟣 Nequi', DAVIPLATA: '🔴 Daviplata',
};

const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

const emptyMember = {
  full_name: '', document: '', phone: '', email: '',
  membership_type_id: '', start_date: new Date().toISOString().split('T')[0],
  notes: '',
};
const emptyType  = { name: '', duration_days: '30', price: '', description: '' };
const emptyClass = {
  name: '', instructor: '', day_of_week: '0',
  start_time: '06:00', duration_min: '60', room: '', max_capacity: '20',
};

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function daysLeft(endDate: string) {
  return Math.ceil((new Date(endDate + 'T23:59:59').getTime() - Date.now()) / 86400000);
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ══════════════════════════════════════════════════════════════
// MODAL DE PAGO DE MEMBRESÍA
// ══════════════════════════════════════════════════════════════

interface PaymentModalProps {
  member: Member | null;    // null = socio nuevo
  memberForm?: any;          // datos del form si es nuevo
  type: MembershipType;
  isRenewal: boolean;
  company: any;
  companyId: string;
  branchId: string | null;
  session: any;
  onClose: () => void;
  onSuccess: (member: Member) => void;
  formatMoney: (n: number) => string;
}

const MembershipPaymentModal: React.FC<PaymentModalProps> = ({
  member, memberForm, type, isRenewal, company, companyId, branchId, session, onClose, onSuccess, formatMoney,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate]     = useState(
    isRenewal && member?.status === 'ACTIVE' && member.end_date > today
      ? member.end_date  // renueva desde donde termina
      : today
  );
  const [payMethod, setPayMethod]     = useState<PayMethod>('CASH');
  const [saving, setSaving]           = useState(false);

  // Instructores
  const [instructors, setInstructors]           = useState<any[]>([]);
  const [showInstructor, setShowInstructor]     = useState(false);
  const [editInstructor, setEditInstructor]     = useState<any | null>(null);
  const [instrForm, setInstrForm]               = useState({ full_name: '', document: '', phone: '', email: '', specialties: '', pin: '' });
  const [activeSessions, setActiveSessions]     = useState<any[]>([]);

  // Rutinas
  const [routines, setRoutines]                 = useState<any[]>([]);
  const [showRoutine, setShowRoutine]           = useState(false);
  const [routineTarget, setRoutineTarget]       = useState<any | null>(null); // member
  const [routineForm, setRoutineForm]           = useState({ name: '', goal: '', days_per_week: '3', duration_weeks: '4', notes: '' });
  const [routineExercises, setRoutineExercises] = useState<any[]>([]);
  const [exForm, setExForm]                     = useState({ name: '', sets: '3', reps: '12', rest_sec: '60', day: '1', muscle_group: '', notes: '' });
  const [showReceipt, setShowReceipt] = useState(false);
  const [savedMember, setSavedMember] = useState<Member | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const receiptRef = useRef<HTMLDivElement>(null);

  const endDate = (() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + type.duration_days);
    return d.toISOString().split('T')[0];
  })();

  const handlePay = async () => {
    setSaving(true);
    try {
      // 1. Crear/actualizar socio en gym_members
      const memberPayload: any = {
        company_id:           companyId,
        membership_type_id:   type.id,
        membership_type_name: type.name,
        membership_price:     type.price,
        start_date:           startDate,
        end_date:             endDate,
        status:               'ACTIVE' as MemberStatus,
        last_payment_date:    today,
        last_payment_amount:  type.price,
      };

      let finalMember: Member;

      if (member) {
        // Renovación
        const { data, error } = await supabase
          .from('gym_members')
          .update(memberPayload)
          .eq('id', member.id)
          .select()
          .single();
        if (error) throw error;
        finalMember = data as Member;
      } else {
        // Nuevo socio
        const { data, error } = await supabase
          .from('gym_members')
          .insert({
            ...memberPayload,
            full_name: memberForm.full_name.trim(),
            document:  memberForm.document?.trim() || null,
            phone:     memberForm.phone?.trim() || null,
            email:     memberForm.email?.trim() || null,
            notes:     memberForm.notes?.trim() || null,
          })
          .select()
          .single();
        if (error) throw error;
        finalMember = data as Member;
      }

      // 2. Generar factura en el sistema
      const timestamp    = Date.now().toString().slice(-6);
      const random       = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      const invNumber    = `GYM-${timestamp}${random}`;
      setInvoiceNumber(invNumber);

      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          company_id:     companyId,
          branch_id:      branchId,
          invoice_number: invNumber,
          customer_id:    null,
          subtotal:       type.price,
          tax_amount:     0,
          total_amount:   type.price,
          status:         'COMPLETED',
          business_type:  null,
          payment_method: {
            method:            payMethod,
            amount:            type.price,
            customer_name:     finalMember.full_name,
            customer_document: finalMember.document || null,
            customer_phone:    finalMember.phone    || null,
            payment_status:    'PAID',
            gym_member_id:     finalMember.id,
            membership_type:   type.name,
            start_date:        startDate,
            end_date:          endDate,
          },
        })
        .select()
        .single();

      if (!invErr && invoice) {
        // Guardar item de factura
        await supabase.from('invoice_items').insert({
          invoice_id:  invoice.id,
          product_id:  null,
          description: `Membresía ${type.name} — ${fmtDate(startDate)} al ${fmtDate(endDate)}`,
          quantity:    1,
          price:       type.price,
          tax_rate:    0,
        });

        // Vincular factura con el socio
        await supabase.from('gym_members').update({ invoice_id: invoice.id }).eq('id', finalMember.id);

        // Guardar/actualizar socio en tabla customers para que aparezca en CRM
        if (finalMember.full_name && finalMember.full_name.toLowerCase() !== 'consumidor final') {
          try {
            const matchField = finalMember.document ? 'document_number' : 'name';
            const matchValue = finalMember.document || finalMember.full_name;
            const { data: existing } = await supabase
              .from('customers')
              .select('id, phone, email')
              .eq('company_id', companyId)
              .eq(matchField, matchValue)
              .maybeSingle();
            if (existing) {
              const updates: any = {};
              if (!existing.phone && finalMember.phone) updates.phone = finalMember.phone;
              if (!existing.email && finalMember.email) updates.email = finalMember.email;
              if (Object.keys(updates).length > 0) {
                await supabase.from('customers').update(updates).eq('id', existing.id);
              }
            } else {
              await supabase.from('customers').insert({
                company_id:      companyId,
                branch_id:       branchId,
                name:            finalMember.full_name,
                document_number: finalMember.document || null,
                phone:           finalMember.phone || null,
                email:           finalMember.email || null,
              });
            }
          } catch (e) {
            console.warn('Customer upsert failed:', e);
          }
        }

        // Registrar en historial de pagos
        await supabase.from('gym_membership_payments').insert({
          company_id:        companyId,
          member_id:         finalMember.id,
          invoice_id:        invoice.id,
          membership_type_id: type.id,
          amount:            type.price,
          payment_method:    payMethod,
          start_date:        startDate,
          end_date:          endDate,
        });

        // Registrar en sesión de caja activa (todos los métodos)
        if (session?.id) {
          const field = payMethod === 'CASH' ? 'total_sales_cash' : 'total_sales_card';
          const current = (session as any)[field] || 0;
          await supabase.from('cash_register_sessions').update({
            [field]: current + type.price,
          }).eq('id', session.id);
        }
      }

      setSavedMember(finalMember);
      setShowReceipt(true);
      toast.success(`✅ Membresía ${isRenewal ? 'renovada' : 'registrada'} — Factura ${invNumber}`);
      onSuccess(finalMember);  // esto dispara refreshAll en el padre

    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleWhatsApp = () => {
    if (!savedMember?.phone) { toast.error('El socio no tiene teléfono registrado'); return; }
    const companyName = company?.name || 'Gimnasio';
    const msg = `Hola ${savedMember.full_name} 💪\n\nTu membresía *${type.name}* en *${companyName}* ha sido ${isRenewal ? 'renovada' : 'activada'} exitosamente.\n\n📅 Válida del: *${fmtDate(startDate)}*\n📅 Hasta el: *${fmtDate(endDate)}*\n💰 Valor pagado: *${formatMoney(type.price)}*\n\n¡Gracias por confiar en nosotros! 🏋️`;
    const phone = savedMember.phone.replace(/\D/g, '');
    const finalPhone = phone.length === 10 ? `57${phone}` : phone;
    window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handlePrint = () => {
    const printArea = receiptRef.current;
    if (!printArea) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`
      <html><head><style>
        body { font-family: monospace; font-size: 12px; margin: 0; padding: 16px; }
        h2 { font-size: 16px; text-align: center; margin-bottom: 4px; }
        p { margin: 2px 0; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 8px 0; }
        .big { font-size: 18px; font-weight: bold; }
      </style></head><body>
        ${printArea.innerHTML}
        <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}</script>
      </body></html>
    `);
    w.document.close();
  };

  // Vista de comprobante después de pagar
  if (showReceipt && savedMember) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Header éxito */}
          <div className="bg-emerald-500 px-6 py-5 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={36} className="text-white" />
            </div>
            <h3 className="text-white font-black text-xl">¡Pago exitoso!</h3>
            <p className="text-emerald-100 text-sm mt-1">{invoiceNumber}</p>
          </div>

          {/* Comprobante imprimible */}
          <div ref={receiptRef} className="p-5 font-mono text-xs text-slate-800">
            <h2 className="text-center font-bold text-base mb-1">{company?.name || 'GIMNASIO'}</h2>
            <p className="text-center text-slate-500 mb-3">NIT: {company?.nit || '—'}</p>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <p className="font-bold text-sm mb-2">COMPROBANTE DE MEMBRESÍA</p>
            <p><span className="text-slate-500">Socio:</span> {savedMember.full_name}</p>
            {savedMember.document && <p><span className="text-slate-500">CC:</span> {savedMember.document}</p>}
            {savedMember.phone    && <p><span className="text-slate-500">Tel:</span> {savedMember.phone}</p>}
            <div className="border-t border-dashed border-slate-300 my-2" />
            <p><span className="text-slate-500">Plan:</span> <span className="font-bold">{type.name}</span></p>
            <p><span className="text-slate-500">Vigencia:</span> {type.duration_days} días</p>
            <p><span className="text-slate-500">Inicio:</span> {fmtDate(startDate)}</p>
            <p><span className="text-slate-500">Vence:</span> <span className="font-bold">{fmtDate(endDate)}</span></p>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <p><span className="text-slate-500">Método:</span> {PAY_METHOD_LABELS[payMethod]}</p>
            <p className="text-lg font-black mt-1">TOTAL: {formatMoney(type.price)}</p>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <p className="text-center text-slate-500 text-[10px]">¡Gracias por tu preferencia!</p>
          </div>

          {/* Acciones */}
          <div className="p-4 space-y-2 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={handlePrint}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900">
                <Printer size={15} /> Imprimir
              </button>
              <button onClick={handleWhatsApp} disabled={!savedMember.phone}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 disabled:opacity-40">
                <MessageCircle size={15} /> WhatsApp
              </button>
            </div>
            <button onClick={onClose}
              className="w-full px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Vista del formulario de pago
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-black text-lg">
                {isRenewal ? '♻️ Renovar membresía' : '🏋️ Nueva membresía'}
              </h3>
              <p className="text-emerald-100 text-sm mt-0.5">
                {member?.full_name || memberForm?.full_name}
              </p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Resumen del plan */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-emerald-800 text-base">{type.name}</p>
                {type.description && <p className="text-emerald-600 text-xs mt-0.5">{type.description}</p>}
                <p className="text-emerald-600 text-sm mt-1">{type.duration_days} días de vigencia</p>
              </div>
              <p className="text-2xl font-black text-emerald-700">{formatMoney(type.price)}</p>
            </div>
          </div>

          {/* Fecha de inicio */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              📅 Fecha de inicio
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <ArrowRight size={12} />
              <span>Vence el <strong className="text-emerald-700">{fmtDate(endDate)}</strong></span>
            </div>
          </div>

          {/* Método de pago */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              💳 Método de pago
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(PAY_METHOD_LABELS) as [PayMethod, string][]).map(([method, label]) => (
                <button
                  key={method}
                  onClick={() => setPayMethod(method)}
                  className={`px-3 py-2.5 rounded-xl border-2 text-sm font-semibold text-left transition-all ${
                    payMethod === method
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="bg-slate-50 rounded-xl p-4 flex justify-between items-center">
            <span className="font-bold text-slate-700">Total a cobrar</span>
            <span className="text-2xl font-black text-slate-800">{formatMoney(type.price)}</span>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-3 border border-slate-300 text-slate-600 rounded-xl font-bold hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handlePay} disabled={saving}
            className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-black text-base hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
            ) : (
              <><Receipt size={18} /> Cobrar {formatMoney(type.price)}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

const Gimnasio: React.FC = () => {
  const { companyId, branchId, session, company, refreshAll } = useDatabase();
  const { formatMoney } = useCurrency();

  const [tab, setTab]                 = useState<'members' | 'checkin' | 'classes' | 'types' | 'stats' | 'instructors' | 'routines'>('members');
  const [members, setMembers]         = useState<Member[]>([]);
  const [types, setTypes]             = useState<MembershipType[]>([]);
  const [checkins, setCheckins]       = useState<CheckIn[]>([]);
  const [classes, setClasses]         = useState<GymClass[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState<MemberStatus | 'ALL'>('ALL');

  // Modals
  const [showMember, setShowMember]   = useState(false);
  const [editMember, setEditMember]   = useState<Member | null>(null);
  const [memberForm, setMemberForm]   = useState(emptyMember);

  const [showType, setShowType]       = useState(false);
  const [editType, setEditType]       = useState<MembershipType | null>(null);
  const [typeForm, setTypeForm]       = useState(emptyType);

  const [showClass, setShowClass]     = useState(false);
  const [editClass, setEditClass]     = useState<GymClass | null>(null);
  const [classForm, setClassForm]     = useState(emptyClass);

  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinSearch, setCheckinSearch] = useState('');
  const [saving, setSaving]           = useState(false);

  // Instructores
  const [instructors, setInstructors]           = useState<any[]>([]);
  const [showInstructor, setShowInstructor]     = useState(false);
  const [editInstructor, setEditInstructor]     = useState<any | null>(null);
  const [instrForm, setInstrForm]               = useState({ full_name: '', document: '', phone: '', email: '', specialties: '', pin: '' });
  const [activeSessions, setActiveSessions]     = useState<any[]>([]);

  // Rutinas
  const [routines, setRoutines]                 = useState<any[]>([]);
  const [showRoutine, setShowRoutine]           = useState(false);
  const [routineTarget, setRoutineTarget]       = useState<any | null>(null); // member
  const [routineForm, setRoutineForm]           = useState({ name: '', goal: '', days_per_week: '3', duration_weeks: '4', notes: '' });
  const [routineExercises, setRoutineExercises] = useState<any[]>([]);
  const [exForm, setExForm]                     = useState({ name: '', sets: '3', reps: '12', rest_sec: '60', day: '1', muscle_group: '', notes: '' });

  // Payment modal state
  const [paymentTarget, setPaymentTarget] = useState<{
    member: Member | null;
    memberForm?: any;
    type: MembershipType;
    isRenewal: boolean;
  } | null>(null);

  // Step for new member: 1=datos, 2=plan+pago
  const [newMemberStep, setNewMemberStep] = useState<1 | 2>(1);
  const [selectedTypeForNew, setSelectedTypeForNew] = useState<MembershipType | null>(null);

  // ── Load ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const [{ data: m }, { data: t }, { data: c }, { data: cl }, { data: instr }, { data: sessions }] = await Promise.all([
      supabase.from('gym_members').select('*').eq('company_id', companyId).order('full_name'),
      supabase.from('gym_membership_types').select('*').eq('company_id', companyId).eq('is_active', true).order('price'),
      supabase.from('gym_checkins').select('*').eq('company_id', companyId)
        .gte('checked_in_at', today + 'T00:00:00').order('checked_in_at', { ascending: false }),
      supabase.from('gym_classes').select('*').eq('company_id', companyId).eq('is_active', true).order('day_of_week').order('start_time'),
      supabase.from('gym_instructors').select('*').eq('company_id', companyId).eq('is_active', true).order('full_name'),
      supabase.from('gym_instructor_sessions').select('*, gym_instructors(full_name)').eq('company_id', companyId).eq('date', today).is('logout_at', null),
    ]);
    const updated = (m || []).map((mem: any) => ({
      ...mem,
      status: mem.status === 'ACTIVE' && mem.end_date < today ? 'EXPIRED' : mem.status,
    }));
    setMembers(updated);
    setTypes(t || []);
    setCheckins(c || []);
    setClasses(cl || []);
    setInstructors(instr || []);
    setActiveSessions(sessions || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // ── Check-in ─────────────────────────────────────────────
  const handleCheckin = async (member: Member) => {
    if (member.status === 'EXPIRED') {
      toast.error(`${member.full_name} tiene la membresía vencida. Debe renovar.`);
      return;
    }
    if (member.status === 'FROZEN') {
      toast.error(`${member.full_name} tiene la membresía congelada.`);
      return;
    }
    const { error } = await supabase.from('gym_checkins').insert({
      company_id: companyId, member_id: member.id,
      member_name: member.full_name, status: member.status,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ ${member.full_name} — Ingreso registrado`);
    setCheckinSearch(''); load();
  };

  // ── Nuevo socio — paso 1: datos personales ───────────────
  const openNewMember = () => {
    setEditMember(null);
    setMemberForm(emptyMember);
    setNewMemberStep(1);
    setSelectedTypeForNew(null);
    setShowMember(true);
  };

  const openEditMember = (m: Member) => {
    setEditMember(m);
    setMemberForm({
      full_name: m.full_name, document: m.document || '',
      phone: m.phone || '', email: m.email || '',
      membership_type_id: m.membership_type_id,
      start_date: m.start_date, notes: m.notes || '',
    });
    setNewMemberStep(1);
    setShowMember(true);
  };

  // Paso 2: abrir modal de pago con el tipo seleccionado
  const handleNewMemberProceedToPayment = () => {
    const mtype = types.find(t => t.id === memberForm.membership_type_id);
    if (!memberForm.full_name.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!mtype) { toast.error('Selecciona un tipo de membresía'); return; }
    setSelectedTypeForNew(mtype);
    setShowMember(false);
    setPaymentTarget({
      member:     null,
      memberForm: memberForm,
      type:       mtype,
      isRenewal:  false,
    });
  };

  // Editar socio sin pago (solo datos)
  const saveEditMember = async () => {
    if (!editMember) return;
    if (!memberForm.full_name.trim()) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    const { error } = await supabase.from('gym_members').update({
      full_name: memberForm.full_name.trim(),
      document:  memberForm.document?.trim() || null,
      phone:     memberForm.phone?.trim() || null,
      email:     memberForm.email?.trim() || null,
      notes:     memberForm.notes?.trim() || null,
    }).eq('id', editMember.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Socio actualizado');
    setShowMember(false); setSaving(false); load();
  };

  // Renovar con pago
  const openRenewPayment = (m: Member) => {
    const mtype = types.find(t => t.id === m.membership_type_id);
    if (!mtype) { toast.error('Tipo de membresía no encontrado'); return; }
    setPaymentTarget({ member: m, type: mtype, isRenewal: true });
  };

  const toggleFreeze = async (m: Member) => {
    const newStatus = m.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    await supabase.from('gym_members').update({ status: newStatus }).eq('id', m.id);
    toast.success(newStatus === 'FROZEN' ? '🧊 Membresía congelada' : '✅ Membresía activada');
    load();
  };

  // ── Type CRUD ────────────────────────────────────────────
  const saveType = async () => {
    if (!typeForm.name.trim() || !typeForm.price) { toast.error('Nombre y precio son obligatorios'); return; }
    setSaving(true);
    const payload = {
      company_id: companyId, name: typeForm.name.trim(),
      duration_days: parseInt(typeForm.duration_days) || 30,
      price: parseFloat(typeForm.price),
      description: typeForm.description.trim() || null,
      is_active: true,
    };
    const { error } = editType
      ? await supabase.from('gym_membership_types').update(payload).eq('id', editType.id)
      : await supabase.from('gym_membership_types').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editType ? 'Tipo actualizado' : 'Tipo creado');
    setShowType(false); setSaving(false); load();
  };

  // ── Class CRUD ───────────────────────────────────────────
  const saveClass = async () => {
    if (!classForm.name.trim() || !classForm.instructor.trim()) { toast.error('Nombre e instructor son obligatorios'); return; }
    setSaving(true);
    const payload = {
      company_id: companyId, name: classForm.name.trim(),
      instructor: classForm.instructor.trim(),
      day_of_week: parseInt(classForm.day_of_week),
      start_time: classForm.start_time,
      duration_min: parseInt(classForm.duration_min) || 60,
      room: classForm.room.trim() || null,
      max_capacity: parseInt(classForm.max_capacity) || 20,
      is_active: true,
    };
    const { error } = editClass
      ? await supabase.from('gym_classes').update(payload).eq('id', editClass.id)
      : await supabase.from('gym_classes').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editClass ? 'Clase actualizada' : 'Clase creada');
    setShowClass(false); setSaving(false); load();
  };

  // ── Filtered ─────────────────────────────────────────────
  const filtered = members.filter(m => {
    const matchSearch = !search ||
      m.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (m.document || '').includes(search) ||
      (m.phone || '').includes(search);
    const matchStatus = filterStatus === 'ALL' || m.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const kpis = {
    active:       members.filter(m => m.status === 'ACTIVE').length,
    expiringSoon: members.filter(m => m.status === 'ACTIVE' && daysLeft(m.end_date) <= 7).length,
    expired:      members.filter(m => m.status === 'EXPIRED').length,
    todayCheckins: checkins.length,
    monthRevenue: members.filter(m => m.status === 'ACTIVE').reduce((s, m) => s + (m.membership_price / 30), 0) * 30,
  };

  const checkinFiltered = members.filter(m =>
    checkinSearch.length >= 2 &&
    (m.full_name.toLowerCase().includes(checkinSearch.toLowerCase()) ||
     (m.document || '').includes(checkinSearch))
  ).slice(0, 5);

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400";
  const labelCls = "block text-sm font-medium text-slate-700 mb-1";

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Dumbbell size={24} className="text-emerald-600" /> Gimnasio
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">Membresías, check-in y clases grupales</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">
            <RefreshCw size={14} /> Actualizar
          </button>
          <button
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}#/gimnasio-kiosk/${companyId}`;
              navigator.clipboard.writeText(url).then(() => toast.success('🔗 Link del kiosk copiado'));
            }}
            className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm"
            title="Copiar link para la tablet de recepción">
            📟 Link Kiosk
          </button>
          <button onClick={openNewMember}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
            <Plus size={16} /> Nuevo socio
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Socios activos',      value: kpis.active,                          color: 'text-slate-800' },
          { label: 'Vencen en 7 días',    value: kpis.expiringSoon,                    color: 'text-amber-600' },
          { label: 'Membresías vencidas', value: kpis.expired,                         color: 'text-red-600' },
          { label: 'Check-ins hoy',       value: kpis.todayCheckins,                   color: 'text-emerald-600' },
          { label: 'Ingresos del mes',    value: formatMoney(Math.round(kpis.monthRevenue)), color: 'text-blue-600' },
        ].map(k => (
          <div key={k.label} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <p className="text-slate-500 text-xs font-medium">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
        {([
          ['members',     '👥 Socios'],
          ['checkin',     '✅ Check-in'],
          ['instructors', '👨‍🏫 Instructores'],
          ['routines',    '📋 Rutinas'],
          ['classes',     '🏋️ Clases'],
          ['types',       '🏷️ Membresías'],
          ['stats',       '📊 Estadísticas'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: SOCIOS ──────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input className="w-full pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Buscar por nombre, cédula o teléfono..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(['ALL','ACTIVE','EXPIRED','FROZEN'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === s ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                  {s === 'ALL' ? 'Todos' : STATUS_CFG[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Cargando socios...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Users size={36} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin socios registrados</p>
                <p className="text-sm mt-1">Registra el primer socio con el botón de arriba</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Socio','Membresía','Inicio','Vence','Días restantes','Estado',''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(m => {
                      const days = daysLeft(m.end_date);
                      const cfg  = STATUS_CFG[m.status];
                      return (
                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-800">{m.full_name}</p>
                            {m.document && <p className="text-xs text-slate-400">CC {m.document}</p>}
                            {m.phone    && <p className="text-xs text-slate-400">📱 {m.phone}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">{m.membership_type_name}</p>
                            <p className="text-xs text-slate-400">{formatMoney(m.membership_price)}/período</p>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(m.start_date)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(m.end_date)}</td>
                          <td className="px-4 py-3">
                            {m.status === 'ACTIVE' ? (
                              <span className={`font-bold text-sm ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {days > 0 ? `${days} días` : 'Vence hoy'}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 justify-end">
                              {/* Botón renovar con pago */}
                              {(m.status === 'EXPIRED' || (m.status === 'ACTIVE' && days <= 7)) && (
                                <button onClick={() => openRenewPayment(m)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors">
                                  <Receipt size={11} /> Renovar
                                </button>
                              )}
                              <button onClick={() => toggleFreeze(m)}
                                className="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors">
                                {m.status === 'FROZEN' ? '▶️ Activar' : '🧊 Congelar'}
                              </button>
                              <button onClick={() => openEditMember(m)}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                                <Edit2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: CHECK-IN ──────────────────────────────────── */}
      {tab === 'checkin' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-bold text-slate-700 mb-3">Registrar ingreso</p>
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Buscar socio por nombre o cédula..."
                value={checkinSearch}
                onChange={e => setCheckinSearch(e.target.value)}
                autoFocus
              />
            </div>
            {checkinFiltered.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                {checkinFiltered.map(m => {
                  const cfg = STATUS_CFG[m.status];
                  return (
                    <button key={m.id} onClick={() => handleCheckin(m)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 text-left">
                      <div>
                        <p className="font-semibold text-slate-800">{m.full_name}</p>
                        <p className="text-xs text-slate-400">{m.membership_type_name} · Vence: {fmtDate(m.end_date)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.cls}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <p className="font-bold text-slate-700 text-sm">Check-ins de hoy — {checkins.length} socios</p>
            </div>
            {checkins.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <CheckCircle size={32} className="mx-auto mb-3 opacity-30" />
                <p>Sin check-ins hoy</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {checkins.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800 text-sm">{c.member_name}</p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(c.checked_in_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                      c.type === 'OUT' ? 'bg-blue-100 text-blue-700'
                      : c.type === 'IN' ? 'bg-emerald-100 text-emerald-700'
                      : STATUS_CFG[c.status]?.cls || 'bg-slate-100 text-slate-600'
                    }`}>
                      {c.type === 'IN' ? <><CheckCircle size={11} /> Entrada</>
                       : c.type === 'OUT' ? <><Clock size={11} /> Salida</>
                       : <>{STATUS_CFG[c.status]?.icon} {STATUS_CFG[c.status]?.label}</>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: INSTRUCTORES ────────────────────────────── */}
      {tab === 'instructors' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-800">Instructores</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeSessions.length} activos hoy de {instructors.length} registrados
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}#/gym-instructor/${companyId}`;
                  navigator.clipboard.writeText(url).then(() => toast.success('Link copiado'));
                }}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                <Link2 size={14} /> Link login
              </button>
              <button onClick={() => { setEditInstructor(null); setInstrForm({ full_name: '', document: '', phone: '', email: '', specialties: '', pin: '' }); setShowInstructor(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
                <Plus size={15} /> Nuevo instructor
              </button>
            </div>
          </div>

          {instructors.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <UserCheck size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin instructores registrados</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {instructors.map(instr => {
                const isActive = activeSessions.some(s => s.instructor_id === instr.id);
                return (
                  <div key={instr.id} className={`bg-white rounded-xl border-2 p-5 ${isActive ? 'border-emerald-400' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {instr.full_name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-800">{instr.full_name}</p>
                        {instr.phone && <p className="text-xs text-slate-400">📱 {instr.phone}</p>}
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isActive ? '🟢 Activo' : '⚫ Inactivo'}
                      </span>
                    </div>
                    {instr.specialties && instr.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {instr.specialties.map((s: string) => (
                          <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-semibold">{s}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => { setEditInstructor(instr); setInstrForm({ full_name: instr.full_name, document: instr.document || '', phone: instr.phone || '', email: instr.email || '', specialties: (instr.specialties || []).join(', '), pin: instr.pin || '' }); setShowInstructor(true); }}
                        className="flex-1 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1">
                        <Edit2 size={11} /> Editar
                      </button>
                      {isActive ? (
                        <button onClick={async () => {
                            const s = activeSessions.find(s => s.instructor_id === instr.id);
                            if (s) { await supabase.from('gym_instructor_sessions').update({ logout_at: new Date().toISOString() }).eq('id', s.id); load(); toast.success('Sesión cerrada'); }
                          }}
                          className="flex-1 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1">
                          Dar salida
                        </button>
                      ) : (
                        <button onClick={async () => {
                            await supabase.from('gym_instructor_sessions').insert({ company_id: companyId, instructor_id: instr.id }); load(); toast.success('Instructor activado');
                          }}
                          className="flex-1 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 flex items-center justify-center gap-1">
                          Dar entrada
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: RUTINAS ─────────────────────────────────── */}
      {tab === 'routines' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800">Rutinas y planes personalizados</h3>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <p className="text-xs font-bold text-slate-500 uppercase">Selecciona un socio para ver o crear su rutina</p>
            </div>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {members.filter(m => m.status === 'ACTIVE').map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 flex-shrink-0">
                    {m.full_name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 text-sm">{m.full_name}</p>
                    <p className="text-xs text-slate-400">{m.membership_type_name}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setRoutineTarget(m); setRoutineForm({ name: '', goal: '', days_per_week: '3', duration_weeks: '4', notes: '' }); setRoutineExercises([]); setShowRoutine(true); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
                      <Plus size={11} /> Rutina
                    </button>
                    <button onClick={() => {
                        const token = m.portal_token;
                        if (token) {
                          const url = `${window.location.origin}${window.location.pathname}#/gym-portal/${token}`;
                          navigator.clipboard.writeText(url).then(() => toast.success(`Link copiado para ${m.full_name}`));
                        } else { toast.error('Socio sin token. Ejecuta el SQL de migración.'); }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50">
                      <Link2 size={11} /> Portal
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: CLASES ────────────────────────────────────── */}
      {tab === 'classes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditClass(null); setClassForm(emptyClass); setShowClass(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
              <Plus size={15} /> Nueva clase
            </button>
          </div>
          {DAYS.map((day, idx) => {
            const dayClasses = classes.filter(c => c.day_of_week === idx);
            if (dayClasses.length === 0) return null;
            return (
              <div key={day} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200">
                  <p className="font-bold text-slate-700 text-sm">{day}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {dayClasses.map(c => (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="bg-emerald-50 rounded-xl px-3 py-2 text-center flex-shrink-0 min-w-[56px]">
                        <p className="font-bold text-emerald-700 text-sm">{c.start_time}</p>
                        <p className="text-[10px] text-emerald-500">{c.duration_min}min</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800">{c.name}</p>
                        <p className="text-xs text-slate-500">Prof. {c.instructor}{c.room ? ` · ${c.room}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Máx. {c.max_capacity}</span>
                        <button onClick={() => { setEditClass(c); setClassForm({ name: c.name, instructor: c.instructor, day_of_week: String(c.day_of_week), start_time: c.start_time, duration_min: String(c.duration_min), room: c.room || '', max_capacity: String(c.max_capacity) }); setShowClass(true); }}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><Edit2 size={13} /></button>
                        <button onClick={async () => { await supabase.from('gym_classes').update({ is_active: false }).eq('id', c.id); load(); }}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {classes.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Dumbbell size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Sin clases registradas</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TIPOS DE MEMBRESÍA ─────────────────────────── */}
      {tab === 'types' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setEditType(null); setTypeForm(emptyType); setShowType(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium text-sm">
              <Plus size={15} /> Nuevo tipo
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-slate-800">{t.name}</p>
                    {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                  </div>
                  <button onClick={() => { setEditType(t); setTypeForm({ name: t.name, duration_days: String(t.duration_days), price: String(t.price), description: t.description || '' }); setShowType(true); }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><Edit2 size={13} /></button>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{t.duration_days} días</span>
                  <span className="font-bold text-emerald-600">{formatMoney(t.price)}</span>
                </div>
                <div className="mt-3 text-xs text-slate-400">
                  {members.filter(m => m.membership_type_id === t.id && m.status === 'ACTIVE').length} socios activos
                </div>
              </div>
            ))}
            {types.length === 0 && (
              <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <Tag size={36} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin tipos de membresía</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: ESTADÍSTICAS ──────────────────────────────── */}
      {tab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart2 size={16} /> Por tipo de membresía</p>
            <div className="space-y-3">
              {types.map(t => {
                const count = members.filter(m => m.membership_type_id === t.id && m.status === 'ACTIVE').length;
                const total = members.filter(m => m.status === 'ACTIVE').length || 1;
                return (
                  <div key={t.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">{t.name}</span>
                      <span className="font-bold">{count} socios</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(count/total)*100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <p className="font-bold text-slate-700 mb-4 flex items-center gap-2"><AlertTriangle size={16} /> Próximos a vencer</p>
            <div className="space-y-2">
              {members.filter(m => m.status === 'ACTIVE' && daysLeft(m.end_date) <= 14)
                .sort((a, b) => daysLeft(a.end_date) - daysLeft(b.end_date))
                .slice(0, 8)
                .map(m => {
                  const days = daysLeft(m.end_date);
                  return (
                    <div key={m.id} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                      <span className="text-slate-700">{m.full_name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${days <= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                          {days <= 0 ? 'Hoy' : `${days}d`}
                        </span>
                        <button onClick={() => openRenewPayment(m)}
                          className="px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 rounded-lg font-bold hover:bg-emerald-100">
                          Renovar
                        </button>
                      </div>
                    </div>
                  );
                })}
              {members.filter(m => m.status === 'ACTIVE' && daysLeft(m.end_date) <= 14).length === 0 && (
                <p className="text-slate-400 text-sm text-center py-4">Sin vencimientos en los próximos 14 días</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODALS ══════════════════════════════════════════ */}

      {/* Modal nuevo/editar socio — paso 1: datos */}
      {showMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {editMember ? 'Editar socio' : '🏋️ Nuevo socio'}
                </h3>
                {!editMember && (
                  <p className="text-xs text-slate-400 mt-0.5">Paso 1 de 2 — Datos personales</p>
                )}
              </div>
              <button onClick={() => setShowMember(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Nombre completo *</label>
                  <input className={inputCls} value={memberForm.full_name}
                    onChange={e => setMemberForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Ana Sofía Mora" />
                </div>
                <div>
                  <label className={labelCls}>Cédula</label>
                  <input className={inputCls} value={memberForm.document}
                    onChange={e => setMemberForm(f => ({ ...f, document: e.target.value }))}
                    placeholder="1.020.456.789" />
                </div>
                <div>
                  <label className={labelCls}>Teléfono / WhatsApp</label>
                  <input className={inputCls} value={memberForm.phone}
                    onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="311 234 5678" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" className={inputCls} value={memberForm.email}
                    onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="ana@email.com" />
                </div>
                <div>
                  <label className={labelCls}>Notas</label>
                  <input className={inputCls} value={memberForm.notes}
                    onChange={e => setMemberForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Observaciones opcionales..." />
                </div>

                {/* Si es nuevo, seleccionar el plan aquí */}
                {!editMember && (
                  <div className="col-span-2">
                    <label className={labelCls}>Plan de membresía *</label>
                    {types.length === 0 ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        Primero crea tipos de membresía en la pestaña 🏷️ Membresías
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 mt-1">
                        {types.map(t => (
                          <button key={t.id}
                            onClick={() => setMemberForm(f => ({ ...f, membership_type_id: t.id }))}
                            className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all ${
                              memberForm.membership_type_id === t.id
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}>
                            <div>
                              <p className={`font-bold text-sm ${memberForm.membership_type_id === t.id ? 'text-emerald-700' : 'text-slate-800'}`}>
                                {t.name}
                              </p>
                              {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
                              <p className="text-xs text-slate-400">{t.duration_days} días</p>
                            </div>
                            <p className={`text-lg font-black ${memberForm.membership_type_id === t.id ? 'text-emerald-600' : 'text-slate-700'}`}>
                              {formatMoney(t.price)}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowMember(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
                Cancelar
              </button>
              {editMember ? (
                <button onClick={saveEditMember} disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              ) : (
                <button onClick={handleNewMemberProceedToPayment} disabled={!memberForm.membership_type_id}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                  <CreditCard size={16} /> Continuar al pago
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo tipo */}
      {showType && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">{editType ? 'Editar tipo' : 'Nuevo tipo de membresía'}</h3>
              <button onClick={() => setShowType(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input className={inputCls} value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Mensual full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Duración (días) *</label>
                  <input type="number" className={inputCls} value={typeForm.duration_days} onChange={e => setTypeForm(f => ({ ...f, duration_days: e.target.value }))} placeholder="30" />
                </div>
                <div>
                  <label className={labelCls}>Precio *</label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input type="number" className={inputCls + ' pl-8'} value={typeForm.price} onChange={e => setTypeForm(f => ({ ...f, price: e.target.value }))} placeholder="120000" />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Descripción</label>
                <input className={inputCls} value={typeForm.description} onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} placeholder="Acceso completo, todas las clases..." />
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowType(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button onClick={saveType} disabled={saving} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editType ? 'Guardar' : 'Crear tipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva clase */}
      {showClass && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">{editClass ? 'Editar clase' : 'Nueva clase'}</h3>
              <button onClick={() => setShowClass(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Nombre de la clase *</label>
                  <input className={inputCls} value={classForm.name} onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))} placeholder="Spinning, Yoga, CrossFit..." />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Instructor *</label>
                  <input className={inputCls} value={classForm.instructor} onChange={e => setClassForm(f => ({ ...f, instructor: e.target.value }))} placeholder="Prof. Ramírez" />
                </div>
                <div>
                  <label className={labelCls}>Día</label>
                  <select className={inputCls} value={classForm.day_of_week} onChange={e => setClassForm(f => ({ ...f, day_of_week: e.target.value }))}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Hora inicio</label>
                  <input type="time" className={inputCls} value={classForm.start_time} onChange={e => setClassForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Duración (min)</label>
                  <input type="number" className={inputCls} value={classForm.duration_min} onChange={e => setClassForm(f => ({ ...f, duration_min: e.target.value }))} placeholder="60" />
                </div>
                <div>
                  <label className={labelCls}>Sala / Espacio</label>
                  <input className={inputCls} value={classForm.room} onChange={e => setClassForm(f => ({ ...f, room: e.target.value }))} placeholder="Sala A" />
                </div>
                <div>
                  <label className={labelCls}>Cupos máximos</label>
                  <input type="number" className={inputCls} value={classForm.max_capacity} onChange={e => setClassForm(f => ({ ...f, max_capacity: e.target.value }))} placeholder="20" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowClass(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button onClick={saveClass} disabled={saving} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editClass ? 'Guardar' : 'Crear clase'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: NUEVO INSTRUCTOR ══ */}
      {showInstructor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800">{editInstructor ? 'Editar instructor' : 'Nuevo instructor'}</h3>
              <button onClick={() => setShowInstructor(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div><label className={labelCls}>Nombre completo *</label>
                <input className={inputCls} value={instrForm.full_name} onChange={e => setInstrForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Prof. Ana Ramírez" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Cédula</label>
                  <input className={inputCls} value={instrForm.document} onChange={e => setInstrForm(f => ({ ...f, document: e.target.value }))} /></div>
                <div><label className={labelCls}>Teléfono</label>
                  <input className={inputCls} value={instrForm.phone} onChange={e => setInstrForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div><label className={labelCls}>Email</label>
                <input type="email" className={inputCls} value={instrForm.email} onChange={e => setInstrForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label className={labelCls}>Especialidades (separadas por coma)</label>
                <input className={inputCls} value={instrForm.specialties} onChange={e => setInstrForm(f => ({ ...f, specialties: e.target.value }))} placeholder="Crossfit, Yoga, Spinning" /></div>
              <div><label className={labelCls}>PIN de ingreso (4 dígitos)</label>
                <input className={inputCls} value={instrForm.pin} onChange={e => setInstrForm(f => ({ ...f, pin: e.target.value.replace(/\D/g,'').slice(0,4) }))} placeholder="1234" maxLength={4} /></div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowInstructor(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button disabled={saving} onClick={async () => {
                  if (!instrForm.full_name.trim()) { toast.error('Nombre requerido'); return; }
                  setSaving(true);
                  const payload = {
                    company_id: companyId,
                    full_name: instrForm.full_name.trim(),
                    document: instrForm.document || null,
                    phone: instrForm.phone || null,
                    email: instrForm.email || null,
                    specialties: instrForm.specialties.split(',').map((s: string) => s.trim()).filter(Boolean),
                    pin: instrForm.pin || null,
                    qr_token: editInstructor?.qr_token || Math.random().toString(36).slice(2,18),
                  };
                  if (editInstructor) {
                    await supabase.from('gym_instructors').update(payload).eq('id', editInstructor.id);
                  } else {
                    await supabase.from('gym_instructors').insert(payload);
                  }
                  setSaving(false); setShowInstructor(false); load();
                  toast.success(editInstructor ? 'Instructor actualizado' : '✅ Instructor registrado');
                }}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : editInstructor ? 'Guardar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: NUEVA RUTINA ══ */}
      {showRoutine && routineTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Nueva rutina</h3>
                <p className="text-xs text-slate-400 mt-0.5">Para: {routineTarget.full_name}</p>
              </div>
              <button onClick={() => setShowRoutine(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className={labelCls}>Nombre de la rutina *</label>
                  <input className={inputCls} value={routineForm.name} onChange={e => setRoutineForm(f => ({ ...f, name: e.target.value }))} placeholder="Rutina semana 1, Plan fuerza..." /></div>
                <div><label className={labelCls}>Objetivo</label>
                  <input className={inputCls} value={routineForm.goal} onChange={e => setRoutineForm(f => ({ ...f, goal: e.target.value }))} placeholder="Pérdida de peso, Fuerza..." /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>Días/semana</label>
                    <input type="number" className={inputCls} value={routineForm.days_per_week} onChange={e => setRoutineForm(f => ({ ...f, days_per_week: e.target.value }))} /></div>
                  <div><label className={labelCls}>Semanas</label>
                    <input type="number" className={inputCls} value={routineForm.duration_weeks} onChange={e => setRoutineForm(f => ({ ...f, duration_weeks: e.target.value }))} /></div>
                </div>
              </div>

              {/* Ejercicios */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Ejercicios</p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input className={inputCls} value={exForm.name} onChange={e => setExForm(f => ({ ...f, name: e.target.value }))} placeholder="Ejercicio" />
                  <input className={inputCls} value={exForm.sets} onChange={e => setExForm(f => ({ ...f, sets: e.target.value }))} placeholder="Series" type="number" />
                  <input className={inputCls} value={exForm.reps} onChange={e => setExForm(f => ({ ...f, reps: e.target.value }))} placeholder="Reps (ej: 12 o 12-15)" />
                  <input className={inputCls} value={exForm.rest_sec} onChange={e => setExForm(f => ({ ...f, rest_sec: e.target.value }))} placeholder="Descanso (seg)" type="number" />
                  <input className={inputCls} value={exForm.day} onChange={e => setExForm(f => ({ ...f, day: e.target.value }))} placeholder="Día (1, 2, 3...)" type="number" />
                  <input className={inputCls} value={exForm.muscle_group} onChange={e => setExForm(f => ({ ...f, muscle_group: e.target.value }))} placeholder="Músculo" />
                  <input className={inputCls + ' col-span-2'} value={exForm.notes} onChange={e => setExForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas del ejercicio" />
                  <button onClick={() => {
                      if (!exForm.name.trim()) { toast.error('Nombre del ejercicio requerido'); return; }
                      setRoutineExercises(prev => [...prev, { ...exForm, sets: parseInt(exForm.sets), rest_sec: parseInt(exForm.rest_sec), day: parseInt(exForm.day) }]);
                      setExForm(f => ({ ...f, name: '', notes: '', muscle_group: '' }));
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700">
                    + Agregar
                  </button>
                </div>
                {routineExercises.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {routineExercises.map((ex, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                        <span className="text-slate-400 text-xs">Día {ex.day}</span>
                        <span className="font-semibold text-slate-800 flex-1">{ex.name}</span>
                        <span className="text-emerald-600 font-bold">{ex.sets}×{ex.reps}</span>
                        <button onClick={() => setRoutineExercises(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div><label className={labelCls}>Notas generales</label>
                <textarea className={inputCls} value={routineForm.notes} onChange={e => setRoutineForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            </div>
            <div className="flex gap-3 p-6 pt-0 flex-shrink-0">
              <button onClick={() => setShowRoutine(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium">Cancelar</button>
              <button disabled={saving || !routineForm.name.trim()} onClick={async () => {
                  setSaving(true);
                  const { data: { user } } = await supabase.auth.getUser();
                  await supabase.from('gym_routines').insert({
                    company_id: companyId,
                    member_id: routineTarget.id,
                    name: routineForm.name.trim(),
                    goal: routineForm.goal || null,
                    days_per_week: parseInt(routineForm.days_per_week),
                    duration_weeks: parseInt(routineForm.duration_weeks),
                    exercises: routineExercises,
                    notes: routineForm.notes || null,
                    is_active: true,
                  });
                  setSaving(false); setShowRoutine(false);
                  toast.success('✅ Rutina creada y enviada al portal del socio');
                }}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : 'Crear rutina'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DE PAGO DE MEMBRESÍA ══ */}
      {paymentTarget && (
        <MembershipPaymentModal
          member={paymentTarget.member}
          memberForm={paymentTarget.memberForm}
          type={paymentTarget.type}
          isRenewal={paymentTarget.isRenewal}
          company={company}
          companyId={companyId!}
          branchId={branchId}
          session={session}
          formatMoney={formatMoney}
          onClose={() => { setPaymentTarget(null); load(); refreshAll && refreshAll(); }}
          onSuccess={(savedMember) => {
            // El modal muestra el comprobante, load() se llama al cerrar
          }}
        />
      )}

    </div>
  );
};

export default Gimnasio;