import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Edit2, Trash2, X, Check, ChevronDown, ChevronUp,
  DollarSign, Calendar, FileText, Calculator, Download, AlertTriangle,
  Briefcase, Clock, TrendingUp, Award, RefreshCw, Search, Eye,
  UserCheck, Printer, BarChart2, ArrowUpRight, ArrowDownRight, Info,
  Shirt, Package, Bell, CheckCircle2, ChevronRight
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { useDatabase } from '../contexts/DatabaseContext';
import toast from 'react-hot-toast';

// ─── CONSTANTES LEGALES COLOMBIA 2025 ─────────────────────────────────────────
const COLOMBIA_2025 = {
  SMMLV: 1_750_905,                  // Salario mínimo mensual legal vigente 2026
  AUXILIO_TRANSPORTE: 249_095,        // Subsidio de transporte 2026
  // Aportes empleador
  SALUD_EMPLEADOR: 0.085,            // 8.5%
  PENSION_EMPLEADOR: 0.12,           // 12%
  ARL_I: 0.00522,                    // Riesgo I (oficina)
  ARL_II: 0.01044,                   // Riesgo II
  ARL_III: 0.02436,                  // Riesgo III
  ARL_IV: 0.04350,                   // Riesgo IV
  ARL_V: 0.06960,                    // Riesgo V (alto riesgo)
  CAJA_COMPENSACION: 0.04,           // 4%
  SENA: 0.02,                        // 2% (empresas >10 trabajadores)
  ICBF: 0.03,                        // 3% (empresas >10 trabajadores)
  // Aportes empleado
  SALUD_EMPLEADO: 0.04,              // 4%
  PENSION_EMPLEADO: 0.04,            // 4%
  FONDO_SOLIDARIDAD: 0.01,           // 1% (salarios ≥ 4 SMMLV)
  FONDO_SOLIDARIDAD_EXTRA: 0.005,    // 0.5% adicional (salarios ≥ 16 SMMLV)
  // Prestaciones sociales (sobre salario base sin aux transporte)
  CESANTIAS: 1 / 12,                 // 1 mes por año = 8.33%
  INTERESES_CESANTIAS: 0.12,         // 12% anual sobre cesantías
  PRIMA: 1 / 12,                     // 15 días por semestre = 8.33%
  VACACIONES: 15 / 360,             // 15 días hábiles por año = 4.17%
  // Retención en la fuente (tablas simplificadas, UVT 2025 = $49.799)
  UVT_2025: 49_799,
};

const ARL_RATES: Record<string, number> = {
  'I':   COLOMBIA_2025.ARL_I,
  'II':  COLOMBIA_2025.ARL_II,
  'III': COLOMBIA_2025.ARL_III,
  'IV':  COLOMBIA_2025.ARL_IV,
  'V':   COLOMBIA_2025.ARL_V,
};

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type ContractType = 'INDEFINIDO' | 'FIJO' | 'OBRA' | 'APRENDIZAJE' | 'HORA' | 'DIA' | 'PRESTACION';
type PayFrequency = 'MENSUAL' | 'QUINCENAL' | 'SEMANAL';
type RiskLevel = 'I' | 'II' | 'III' | 'IV' | 'V';
type TabKey = 'empleados' | 'liquidacion' | 'historial' | 'reportes' | 'dotacion';

interface Employee {
  id: string;
  company_id: string;
  branch_id?: string;
  full_name: string;
  document_type: 'CC' | 'CE' | 'PAS' | 'TI';
  document_number: string;
  email?: string;
  phone?: string;
  address?: string;
  birth_date?: string;
  hire_date: string;
  termination_date?: string;
  contract_type: ContractType;
  job_title: string;
  department?: string;
  base_salary: number;
  pay_frequency: PayFrequency;
  risk_level: RiskLevel;
  bank_name?: string;
  bank_account?: string;
  bank_account_type?: 'AHORROS' | 'CORRIENTE';
  eps?: string;
  pension_fund?: string;
  cesantias_fund?: string;
  caja_compensacion?: string;
  // Campos especiales
  applies_transport_subsidy: boolean;  // true si salario ≤ 2 SMMLV
  applies_parafiscales: boolean;       // SENA + ICBF (>10 trabajadores)
  income_tax_deduction?: number;       // retención manual si aplica
  is_active: boolean;
  notes?: string;
  created_at: string;
}

interface PayrollPeriod {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  // Devengado
  base_salary: number;
  transport_subsidy: number;
  overtime_hours: number;
  overtime_amount: number;
  nocturnal_hours: number;
  nocturnal_amount: number;
  sunday_holiday_hours: number;
  sunday_holiday_amount: number;
  commissions: number;
  bonuses: number;
  other_income: number;
  gross_salary: number;
  // Deducciones empleado
  health_employee: number;
  pension_employee: number;
  solidarity_fund: number;
  income_tax: number;
  loan_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_salary: number;
  // Aportes empleador (no van al colilla pero sí al PILA)
  health_employer: number;
  pension_employer: number;
  arl: number;
  parafiscales: number;
  cesantias_provision: number;
  interest_cesantias: number;
  prima_provision: number;
  vacaciones_provision: number;
  total_employer_cost: number;
  // Meta
  status: 'BORRADOR' | 'LIQUIDADO' | 'PAGADO';
  notes?: string;
  created_at: string;
}

interface LiquidacionFinal {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name: string;
  hire_date: string;
  termination_date: string;
  termination_reason: 'RENUNCIA' | 'DESPIDO_JUSTA' | 'DESPIDO_INJUSTA' | 'MUTUO_ACUERDO' | 'VENCIMIENTO';
  base_salary: number;
  dias_trabajados_ultimo: number;
  // Conceptos liquidación
  cesantias: number;
  intereses_cesantias: number;
  prima: number;
  vacaciones: number;
  indemnizacion: number;        // solo en despido injustificado
  dias_pendientes: number;
  salario_pendiente: number;
  bonificaciones: number;
  total_a_pagar: number;
  // Deducciones
  deudas_empresa: number;
  anticipos: number;
  total_deducciones: number;
  total_neto: number;
  status: 'BORRADOR' | 'FIRMADA' | 'PAGADA';
  created_at: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

const CONTRACT_LABELS: Record<ContractType, string> = {
  INDEFINIDO: 'Término Indefinido',
  FIJO: 'Término Fijo',
  OBRA: 'Por Obra/Labor',
  APRENDIZAJE: 'Aprendizaje SENA',
  HORA: 'Por Horas',
  DIA: 'Por Días',
  PRESTACION: 'Prestación de Servicios',
};

const CONTRACT_COLORS: Record<ContractType, string> = {
  INDEFINIDO: '#166534',
  FIJO: '#1d4ed8',
  OBRA: '#92400e',
  APRENDIZAJE: '#6b21a8',
  HORA: '#0e7490',
  DIA: '#0369a1',
  PRESTACION: '#9f1239',
};

const TERMINATION_LABELS: Record<string, string> = {
  RENUNCIA: 'Renuncia Voluntaria',
  DESPIDO_JUSTA: 'Despido con Justa Causa',
  DESPIDO_INJUSTA: 'Despido sin Justa Causa',
  MUTUO_ACUERDO: 'Mutuo Acuerdo',
  VENCIMIENTO: 'Vencimiento Contrato',
};

// ─── CÁLCULO NÓMINA ───────────────────────────────────────────────────────────
function calcularNomina(emp: Employee, overrides: Partial<{
  overtimeHours: number;
  nocturnalHours: number;
  sundayHours: number;
  commissions: number;
  bonuses: number;
  otherIncome: number;
  loanDeduction: number;
  otherDeductions: number;
}> = {}) {
  const s = emp.base_salary;
  const smmlv = COLOMBIA_2025.SMMLV;

  // Auxilio transporte: aplica si salario ≤ 2 SMMLV y contrato con vínculo laboral
  const appliesTransport = emp.applies_transport_subsidy &&
    s <= 2 * smmlv &&
    emp.contract_type !== 'PRESTACION';

  const transport = appliesTransport ? COLOMBIA_2025.AUXILIO_TRANSPORTE : 0;

  // Horas extras (base hora = salario / 240 horas mes)
  const hourRate = s / 240;
  const otHours = overrides.overtimeHours ?? 0;
  const otAmt = otHours * hourRate * 1.25; // diurno ordinario +25%
  const nocHours = overrides.nocturnalHours ?? 0;
  const nocAmt = nocHours * hourRate * 1.75; // nocturno +75%
  const sunHours = overrides.sundayHours ?? 0;
  const sunAmt = sunHours * hourRate * 2.0; // dominical/festivo 100%

  const commissions = overrides.commissions ?? 0;
  const bonuses = overrides.bonuses ?? 0;
  const otherIncome = overrides.otherIncome ?? 0;

  const grossSalary = s + transport + otAmt + nocAmt + sunAmt + commissions + bonuses + otherIncome;

  // Base para aportes (no incluye transporte)
  const baseAportes = s + otAmt + nocAmt + sunAmt + commissions + bonuses + otherIncome;

  // Deducciones empleado
  const healthEmp = baseAportes * COLOMBIA_2025.SALUD_EMPLEADO;
  const pensionEmp = baseAportes * COLOMBIA_2025.PENSION_EMPLEADO;
  const solidarity = baseAportes >= 4 * smmlv
    ? baseAportes * COLOMBIA_2025.FONDO_SOLIDARIDAD +
      (baseAportes >= 16 * smmlv ? baseAportes * COLOMBIA_2025.FONDO_SOLIDARIDAD_EXTRA : 0)
    : 0;
  const incomeTax = emp.income_tax_deduction ?? 0;
  const loanDed = overrides.loanDeduction ?? 0;
  const otherDed = overrides.otherDeductions ?? 0;

  const totalDed = healthEmp + pensionEmp + solidarity + incomeTax + loanDed + otherDed;
  const netSalary = grossSalary - totalDed;

  // Aportes empleador
  const healthEmpr = baseAportes * COLOMBIA_2025.SALUD_EMPLEADOR;
  const pensionEmpr = baseAportes * COLOMBIA_2025.PENSION_EMPLEADOR;
  const arl = baseAportes * ARL_RATES[emp.risk_level];
  const parafiscales = emp.applies_parafiscales
    ? baseAportes * (COLOMBIA_2025.SENA + COLOMBIA_2025.ICBF + COLOMBIA_2025.CAJA_COMPENSACION)
    : baseAportes * COLOMBIA_2025.CAJA_COMPENSACION;

  // Provisiones
  const cesantias = baseAportes * COLOMBIA_2025.CESANTIAS;
  const intCesantias = cesantias * COLOMBIA_2025.INTERESES_CESANTIAS / 12;
  const prima = baseAportes * COLOMBIA_2025.PRIMA;
  const vacaciones = s * COLOMBIA_2025.VACACIONES;

  const totalEmployerCost = netSalary + healthEmpr + pensionEmpr + arl + parafiscales +
    cesantias + intCesantias + prima + vacaciones;

  return {
    base_salary: s,
    transport_subsidy: transport,
    overtime_hours: otHours, overtime_amount: otAmt,
    nocturnal_hours: nocHours, nocturnal_amount: nocAmt,
    sunday_holiday_hours: sunHours, sunday_holiday_amount: sunAmt,
    commissions, bonuses, other_income: otherIncome,
    gross_salary: grossSalary,
    health_employee: healthEmp,
    pension_employee: pensionEmp,
    solidarity_fund: solidarity,
    income_tax: incomeTax,
    loan_deduction: loanDed,
    other_deductions: otherDed,
    total_deductions: totalDed,
    net_salary: netSalary,
    health_employer: healthEmpr,
    pension_employer: pensionEmpr,
    arl,
    parafiscales,
    cesantias_provision: cesantias,
    interest_cesantias: intCesantias,
    prima_provision: prima,
    vacaciones_provision: vacaciones,
    total_employer_cost: totalEmployerCost,
  };
}

// ─── CÁLCULO LIQUIDACIÓN ──────────────────────────────────────────────────────
function calcularLiquidacion(emp: Employee, terminationDate: string, reason: string, diasUltimoPeriodo: number, deudas = 0, anticipos = 0, bonificaciones = 0) {
  const hire = new Date(emp.hire_date);
  const term = new Date(terminationDate);
  const diffMs = term.getTime() - hire.getTime();
  const diasTrabajados = diffMs / (1000 * 60 * 60 * 24);
  const aniosTrabajados = diasTrabajados / 365;
  const s = emp.base_salary;

  // Cesantías: (salario * días trabajados) / 360
  const cesantias = (s * diasTrabajados) / 360;
  // Intereses: cesantías × 12% × (días/360)
  const intCesantias = cesantias * 0.12 * (diasTrabajados / 360);
  // Prima: (salario * días) / 360 — proporcional
  const prima = (s * diasTrabajados) / 360;
  // Vacaciones: (salario * días) / 720
  const vacaciones = (s * diasTrabajados) / 720;

  // Indemnización (solo despido sin justa causa)
  let indemnizacion = 0;
  if (reason === 'DESPIDO_INJUSTA') {
    if (emp.contract_type === 'INDEFINIDO') {
      if (aniosTrabajados <= 1) {
        indemnizacion = s * 30 / 30; // 30 días primer año
      } else {
        indemnizacion = s + (s * 20 / 30) * (aniosTrabajados - 1);
      }
    } else if (emp.contract_type === 'FIJO') {
      // Valor de los días que faltaban para terminar el contrato
      indemnizacion = s * diasUltimoPeriodo / 30;
    }
  }

  // Días pendientes del último período
  const salarioPendiente = (s / 30) * diasUltimoPeriodo;

  const totalBruto = cesantias + intCesantias + prima + vacaciones + indemnizacion + salarioPendiente + bonificaciones;
  const totalDed = deudas + anticipos;
  const totalNeto = totalBruto - totalDed;

  return {
    dias_trabajados: Math.round(diasTrabajados),
    anios: aniosTrabajados.toFixed(2),
    cesantias, intereses_cesantias: intCesantias,
    prima, vacaciones, indemnizacion,
    salario_pendiente: salarioPendiente,
    bonificaciones,
    total_a_pagar: totalBruto,
    deudas_empresa: deudas,
    anticipos,
    total_deducciones: totalDed,
    total_neto: totalNeto,
  };
}


// ─── DOTACIÓN ─────────────────────────────────────────────────────────────────
type TallaRopa  = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL';
type TallaZapato = '34'|'35'|'36'|'37'|'38'|'39'|'40'|'41'|'42'|'43'|'44'|'45';

interface DotacionEntrega {
  id: string;
  company_id: string;
  branch_id?: string;
  employee_id: string;
  employee_name: string;
  fecha_entrega: string;
  periodo: string;           // ej: "2026-P1", "2026-P2", "2026-P3"
  items: DotacionItem[];
  costo_total: number;
  observaciones?: string;
  recibido_por: string;      // firma/confirmación del empleado
  created_at: string;
}

interface DotacionItem {
  descripcion: string;       // "Camisa polo manga corta"
  cantidad: number;
  talla_ropa?: TallaRopa;
  talla_zapato?: TallaZapato;
  costo_unitario: number;
  subtotal: number;
}

interface DotacionConfig {
  costo_estimado_periodo: number;  // costo por entrega (3 al año)
  items_base: { descripcion: string; costo_unitario: number; cantidad: number }[];
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
const Nomina: React.FC = () => {
  const { company, branchId } = useDatabase();
  const companyId = company?.id;

  const [activeTab, setActiveTab] = useState<TabKey>('empleados');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [payrollEmployee, setPayrollEmployee] = useState<Employee | null>(null);
  const [showLiqModal, setShowLiqModal] = useState(false);
  const [liqEmployee, setLiqEmployee] = useState<Employee | null>(null);
  const [showColilla, setShowColilla] = useState(false);
  const [colillaPeriod, setColillaPeriod] = useState<PayrollPeriod | null>(null);

  // Dotación
  const [dotaciones, setDotaciones]       = useState<DotacionEntrega[]>([]);
  const [showDotModal, setShowDotModal]   = useState(false);
  const [dotEmployee, setDotEmployee]     = useState<Employee | null>(null);
  const [dotForm, setDotForm]             = useState<{
    fecha_entrega: string; items: DotacionItem[]; observaciones: string; recibido_por: string;
  }>({ fecha_entrega: new Date().toISOString().split('T')[0], items: [], observaciones: '', recibido_por: '' });

  // Form empleado
  const emptyEmp = (): Omit<Employee, 'id' | 'company_id' | 'created_at'> => ({
    branch_id: branchId ?? undefined,
    full_name: '', document_type: 'CC', document_number: '',
    email: '', phone: '', address: '', birth_date: '',
    hire_date: new Date().toISOString().split('T')[0],
    contract_type: 'INDEFINIDO', job_title: '', department: '',
    base_salary: COLOMBIA_2025.SMMLV,
    pay_frequency: 'MENSUAL', risk_level: 'I',
    bank_name: '', bank_account: '', bank_account_type: 'AHORROS',
    eps: '', pension_fund: '', cesantias_fund: '',
    caja_compensacion: '',
    applies_transport_subsidy: true,
    applies_parafiscales: false,
    income_tax_deduction: 0,
    is_active: true, notes: '',
  });
  const [empForm, setEmpForm] = useState(emptyEmp());

  // Form nómina
  const [payForm, setPayForm] = useState({
    period_start: '', period_end: '', pay_date: '',
    overtime_hours: 0, nocturnal_hours: 0, sunday_holiday_hours: 0,
    commissions: 0, bonuses: 0, other_income: 0,
    loan_deduction: 0, other_deductions: 0, notes: '',
  });

  // Form liquidación
  const [liqForm, setLiqForm] = useState({
    termination_date: new Date().toISOString().split('T')[0],
    termination_reason: 'RENUNCIA' as string,
    dias_ultimo_periodo: 0,
    bonificaciones: 0, deudas: 0, anticipos: 0,
  });

  // ── CARGA DE DATOS ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: emps }, { data: perds }, { data: dots }] = await Promise.all([
      supabase.from('employees').select('*').eq('company_id', companyId).order('full_name'),
      supabase.from('payroll_periods').select('*').eq('company_id', companyId).order('period_end', { ascending: false }).limit(100),
      supabase.from('dotacion_entregas').select('*').eq('company_id', companyId).order('fecha_entrega', { ascending: false }),
    ]);
    setEmployees((emps as Employee[]) ?? []);
    setPeriods((perds as PayrollPeriod[]) ?? []);
    setDotaciones((dots ?? []).map((d: any) => ({ ...d, items: d.items || [] })));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── CRUD EMPLEADO ──────────────────────────────────────────────────────────
  const saveEmployee = async () => {
    if (!companyId) return;
    if (!empForm.full_name || !empForm.document_number || !empForm.hire_date) {
      toast.error('Completa los campos obligatorios'); return;
    }
    const payload = { ...empForm, company_id: companyId };
    const { error } = editingEmp
      ? await supabase.from('employees').update(payload).eq('id', editingEmp.id)
      : await supabase.from('employees').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editingEmp ? 'Empleado actualizado' : 'Empleado registrado');
    setShowEmpModal(false); setEditingEmp(null); setEmpForm(emptyEmp());
    loadData();
  };

  const openEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpForm({ ...emp });
    setShowEmpModal(true);
  };

  const toggleActive = async (emp: Employee) => {
    await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id);
    loadData();
  };

  // ── LIQUIDAR NÓMINA ────────────────────────────────────────────────────────
  const processPayroll = async () => {
    if (!payrollEmployee || !companyId) return;
    const calc = calcularNomina(payrollEmployee, {
      overtimeHours: payForm.overtime_hours,
      nocturnalHours: payForm.nocturnal_hours,
      sundayHours: payForm.sunday_holiday_hours,
      commissions: payForm.commissions,
      bonuses: payForm.bonuses,
      otherIncome: payForm.other_income,
      loanDeduction: payForm.loan_deduction,
      otherDeductions: payForm.other_deductions,
    });
    const { error } = await supabase.from('payroll_periods').insert({
      company_id: companyId,
      employee_id: payrollEmployee.id,
      employee_name: payrollEmployee.full_name,
      period_start: payForm.period_start,
      period_end: payForm.period_end,
      pay_date: payForm.pay_date,
      ...calc,
      notes: payForm.notes,
      status: 'LIQUIDADO',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Nómina liquidada correctamente');
    setShowPayrollModal(false);
    loadData();
  };

  // ── LIQUIDACIÓN FINAL ──────────────────────────────────────────────────────
  const processLiquidacion = async () => {
    if (!liqEmployee || !companyId) return;
    const calc = calcularLiquidacion(
      liqEmployee, liqForm.termination_date, liqForm.termination_reason,
      liqForm.dias_ultimo_periodo, liqForm.deudas, liqForm.anticipos, liqForm.bonificaciones
    );
    const { error } = await supabase.from('liquidaciones').insert({
      company_id: companyId,
      employee_id: liqEmployee.id,
      employee_name: liqEmployee.full_name,
      hire_date: liqEmployee.hire_date,
      termination_date: liqForm.termination_date,
      termination_reason: liqForm.termination_reason,
      base_salary: liqEmployee.base_salary,
      dias_trabajados_ultimo: liqForm.dias_ultimo_periodo,
      cesantias: calc.cesantias,
      intereses_cesantias: calc.intereses_cesantias,
      prima: calc.prima,
      vacaciones: calc.vacaciones,
      indemnizacion: calc.indemnizacion,
      dias_pendientes: liqForm.dias_ultimo_periodo,
      salario_pendiente: calc.salario_pendiente,
      bonificaciones: calc.bonificaciones,
      total_a_pagar: calc.total_a_pagar,
      deudas_empresa: calc.deudas_empresa,
      anticipos: calc.anticipos,
      total_deducciones: calc.total_deducciones,
      total_neto: calc.total_neto,
      status: 'BORRADOR',
    });
    if (error) { toast.error(error.message); return; }
    // Marcar empleado como inactivo
    await supabase.from('employees').update({
      is_active: false,
      termination_date: liqForm.termination_date,
    }).eq('id', liqEmployee.id);
    toast.success('Liquidación generada');
    setShowLiqModal(false);
    loadData();
  };

  // ── UTILIDADES VISTA ───────────────────────────────────────────────────────
  const filteredEmps = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.document_number.includes(search) ||
    e.job_title.toLowerCase().includes(search.toLowerCase())
  );
  const activeEmps = employees.filter(e => e.is_active);
  const totalPayroll = activeEmps.reduce((s, e) => s + e.base_salary, 0);
  const smmlv = COLOMBIA_2025.SMMLV;

  // ─── PREVIEW CALCULADORA ───────────────────────────────────────────────────
  const previewCalc = payrollEmployee ? calcularNomina(payrollEmployee, {
    overtimeHours: payForm.overtime_hours,
    nocturnalHours: payForm.nocturnal_hours,
    sundayHours: payForm.sunday_holiday_hours,
    commissions: payForm.commissions,
    bonuses: payForm.bonuses,
    otherIncome: payForm.other_income,
    loanDeduction: payForm.loan_deduction,
    otherDeductions: payForm.other_deductions,
  }) : null;

  const previewLiq = liqEmployee ? calcularLiquidacion(
    liqEmployee, liqForm.termination_date, liqForm.termination_reason,
    liqForm.dias_ultimo_periodo, liqForm.deudas, liqForm.anticipos, liqForm.bonificaciones
  ) : null;

  // ─── ESTILOS ───────────────────────────────────────────────────────────────
  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';
  const sectionHead = 'text-xs font-bold text-slate-400 uppercase tracking-wider col-span-full mt-2 mb-1';

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── HEADER ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Nómina y Empleados</h1>
              <p className="text-xs text-slate-500">Legislación colombiana — SMMLV 2026: {fmt(smmlv)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => { setEditingEmp(null); setEmpForm(emptyEmp()); setShowEmpModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
            >
              <Plus size={16} /> Nuevo Empleado
            </button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex gap-1 mt-4">
          {([
            ['empleados', Users, 'Empleados'],
            ['liquidacion', Calculator, 'Liquidar Nómina'],
            ['historial', FileText, 'Historial'],
            ['dotacion', Shirt, 'Dotación'],
            ['reportes', BarChart2, 'Reportes'],
          ] as [TabKey, any, string][]).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Empleados activos', value: activeEmps.length.toString(), icon: UserCheck, color: 'bg-green-50 text-green-700', border: 'border-green-200' },
            { label: 'Masa salarial mensual', value: fmt(totalPayroll), icon: DollarSign, color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
            { label: 'Costo total empleador', value: fmt(totalPayroll * 1.52), icon: TrendingUp, color: 'bg-orange-50 text-orange-700', border: 'border-orange-200', tooltip: 'Incluye aportes + prestaciones (~52%)' },
            { label: 'Nóminas este mes', value: periods.filter(p => p.period_end.startsWith(new Date().toISOString().slice(0, 7))).length.toString(), icon: FileText, color: 'bg-purple-50 text-purple-700', border: 'border-purple-200' },
          ].map((kpi, i) => (
            <div key={i} className={`bg-white rounded-xl border ${kpi.border} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">{kpi.label}</span>
                <div className={`w-8 h-8 rounded-lg ${kpi.color} flex items-center justify-center`}>
                  <kpi.icon size={15} />
                </div>
              </div>
              <p className="text-lg font-bold text-slate-800">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════
            TAB: EMPLEADOS
        ════════════════════════════════════════════════════════════ */}
        {activeTab === 'empleados' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, cédula o cargo..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <span className="text-xs text-slate-500">{filteredEmps.length} empleados</span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">Cargando...</div>
            ) : filteredEmps.length === 0 ? (
              <div className="p-12 text-center">
                <Users size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No hay empleados registrados</p>
                <p className="text-slate-400 text-sm">Agrega tu primer empleado para comenzar</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Empleado</th>
                      <th className="px-4 py-3 text-left">Cargo / Contrato</th>
                      <th className="px-4 py-3 text-right">Salario Base</th>
                      <th className="px-4 py-3 text-right">Costo Total</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEmps.map(emp => {
                      const costoTotal = emp.base_salary * 1.52;
                      return (
                        <tr key={emp.id} className={`hover:bg-slate-50 ${!emp.is_active ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{emp.full_name}</div>
                            <div className="text-xs text-slate-500">{emp.document_type} {emp.document_number}</div>
                            {emp.email && <div className="text-xs text-slate-400">{emp.email}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700">{emp.job_title}</div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1"
                              style={{ backgroundColor: CONTRACT_COLORS[emp.contract_type] + '20', color: CONTRACT_COLORS[emp.contract_type] }}>
                              {CONTRACT_LABELS[emp.contract_type]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold text-slate-800">{fmt(emp.base_salary)}</div>
                            <div className="text-xs text-slate-400">{(emp.base_salary / smmlv).toFixed(1)} SMMLV</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold text-orange-700">{fmt(costoTotal)}</div>
                            <div className="text-xs text-slate-400">+{Math.round((costoTotal / emp.base_salary - 1) * 100)}%</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${emp.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                              {emp.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEditEmp(emp)} title="Editar"
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600">
                                <Edit2 size={14} />
                              </button>
                              {emp.is_active && (
                                <>
                                  <button onClick={() => { setPayrollEmployee(emp); setShowPayrollModal(true); }} title="Liquidar nómina"
                                    className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600">
                                    <DollarSign size={14} />
                                  </button>
                                  <button onClick={() => { setLiqEmployee(emp); setShowLiqModal(true); }} title="Liquidación final"
                                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600">
                                    <FileText size={14} />
                                  </button>
                                </>
                              )}
                              <button onClick={() => toggleActive(emp)} title={emp.is_active ? 'Desactivar' : 'Activar'}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                                {emp.is_active ? <UserCheck size={14} /> : <UserCheck size={14} className="opacity-40" />}
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
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB: LIQUIDAR NÓMINA
        ════════════════════════════════════════════════════════════ */}
        {activeTab === 'liquidacion' && (
          <div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
              <Info size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <strong>Tasas vigentes 2025:</strong> Salud empleado 4% | Pensión empleado 4% | Salud empleador 8.5% | Pensión empleador 12% | ARL según riesgo | SENA 2% | ICBF 3% | Caja 4%
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeEmps.map(emp => {
                const calc = calcularNomina(emp);
                const lastPayroll = periods.find(p => p.employee_id === emp.id);
                return (
                  <div key={emp.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-slate-800">{emp.full_name}</p>
                        <p className="text-xs text-slate-500">{emp.job_title}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full font-medium"
                        style={{ backgroundColor: CONTRACT_COLORS[emp.contract_type] + '20', color: CONTRACT_COLORS[emp.contract_type] }}>
                        {CONTRACT_LABELS[emp.contract_type].split(' ')[0]}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-600 mb-4">
                      <div className="flex justify-between"><span>Salario base</span><span className="font-semibold">{fmt(calc.base_salary)}</span></div>
                      {calc.transport_subsidy > 0 && <div className="flex justify-between"><span>Auxilio transporte</span><span className="text-green-700">+{fmt(calc.transport_subsidy)}</span></div>}
                      <div className="flex justify-between text-red-600"><span>Deducciones (salud+pensión)</span><span>-{fmt(calc.health_employee + calc.pension_employee)}</span></div>
                      <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-100"><span>Neto a pagar</span><span>{fmt(calc.net_salary)}</span></div>
                      <div className="flex justify-between text-orange-700 font-medium"><span>Costo total empleador</span><span>{fmt(calc.total_employer_cost)}</span></div>
                    </div>
                    {lastPayroll && (
                      <p className="text-xs text-slate-400 mb-3">Última nómina: {lastPayroll.period_end}</p>
                    )}
                    <button
                      onClick={() => { setPayrollEmployee(emp); setShowPayrollModal(true); }}
                      className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                    >
                      Liquidar período
                    </button>
                  </div>
                );
              })}
              {activeEmps.length === 0 && (
                <div className="col-span-full p-12 text-center bg-white rounded-xl border border-slate-200">
                  <Users size={40} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500">No hay empleados activos. Agrega empleados en la pestaña anterior.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            TAB: HISTORIAL
        ════════════════════════════════════════════════════════════ */}
        {activeTab === 'historial' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-700">Historial de Nóminas</h3>
              <p className="text-xs text-slate-500">Últimas 100 liquidaciones</p>
            </div>
            {periods.length === 0 ? (
              <div className="p-12 text-center text-slate-400">Sin registros de nómina aún</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Empleado</th>
                      <th className="px-4 py-3 text-center">Período</th>
                      <th className="px-4 py-3 text-right">Devengado</th>
                      <th className="px-4 py-3 text-right">Deducciones</th>
                      <th className="px-4 py-3 text-right">Neto</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Colilla</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periods.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.employee_name}</td>
                        <td className="px-4 py-3 text-center text-xs text-slate-500">{p.period_start} → {p.period_end}</td>
                        <td className="px-4 py-3 text-right text-green-700 font-semibold">{fmt(p.gross_salary)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{fmt(p.total_deductions)}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">{fmt(p.net_salary)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            p.status === 'PAGADO' ? 'bg-green-100 text-green-700' :
                            p.status === 'LIQUIDADO' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{p.status}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => { setColillaPeriod(p); setShowColilla(true); }}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600">
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}


        {/* ════════════════════════════════════════════════════════════
            TAB: DOTACIÓN
        ════════════════════════════════════════════════════════════ */}
        {activeTab === 'dotacion' && (() => {
          const COP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
          const activeEmps2 = employees.filter(e => e.is_active);

          // Items base de dotación por ley colombiana
          const ITEMS_LEY = [
            { descripcion: 'Calzado / Zapatos de trabajo', costo_unitario: 120_000, cantidad: 1 },
            { descripcion: 'Pantalón de trabajo', costo_unitario: 85_000, cantidad: 1 },
            { descripcion: 'Camisa / Blusa de trabajo', costo_unitario: 65_000, cantidad: 1 },
          ];

          // Calcular alertas: empleados que no han recibido dotación en los últimos 4 meses
          const hoy = new Date();
          const alertas = activeEmps2.filter(emp => {
            const entregas = dotaciones.filter(d => d.employee_id === emp.id);
            if (entregas.length === 0) return true;
            const ultima = new Date(entregas[0].fecha_entrega);
            const meses = (hoy.getTime() - ultima.getTime()) / (1000 * 60 * 60 * 24 * 30);
            return meses >= 4;
          });

          // Costo total histórico
          const costoTotal = dotaciones.reduce((s, d) => s + (d.costo_total || 0), 0);

          // Resumen por período
          const periodosSummary = dotaciones.reduce((acc: Record<string, number>, d) => {
            acc[d.periodo] = (acc[d.periodo] || 0) + d.costo_total;
            return acc;
          }, {});

          // Guardar entrega
          const saveDotacion = async () => {
            if (!dotEmployee || !companyId) return;
            if (dotForm.items.length === 0) { toast.error('Agrega al menos un ítem de dotación'); return; }
            const costo_total = dotForm.items.reduce((s, i) => s + i.subtotal, 0);
            const now = new Date();
            const periodo = `${now.getFullYear()}-P${Math.ceil((now.getMonth() + 1) / 4)}`;
            const payload = {
              company_id: companyId,
              branch_id: dotEmployee.branch_id || null,
              employee_id: dotEmployee.id,
              employee_name: dotEmployee.full_name,
              fecha_entrega: dotForm.fecha_entrega,
              periodo,
              items: dotForm.items,
              costo_total,
              observaciones: dotForm.observaciones,
              recibido_por: dotForm.recibido_por,
            };
            const { error } = await supabase.from('dotacion_entregas').insert(payload);
            if (error) { toast.error(error.message); return; }
            toast.success('✅ Dotación registrada');
            setShowDotModal(false);
            setDotEmployee(null);
            setDotForm({ fecha_entrega: new Date().toISOString().split('T')[0], items: [], observaciones: '', recibido_por: '' });
            loadData();
          };

          const openDotModal = (emp: Employee) => {
            setDotEmployee(emp);
            setDotForm({
              fecha_entrega: new Date().toISOString().split('T')[0],
              items: ITEMS_LEY.map(i => ({ ...i, talla_ropa: 'M' as any, talla_zapato: undefined, subtotal: i.costo_unitario * i.cantidad })),
              observaciones: '', recibido_por: '',
            });
            setShowDotModal(true);
          };

          const updateItem = (idx: number, field: string, value: any) => {
            setDotForm(f => {
              const items = [...f.items];
              items[idx] = { ...items[idx], [field]: value };
              if (field === 'cantidad' || field === 'costo_unitario') {
                items[idx].subtotal = items[idx].cantidad * items[idx].costo_unitario;
              }
              return { ...f, items };
            });
          };

          return (
            <div className="space-y-5">

              {/* KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Empleados activos', value: activeEmps2.length, icon: '👥', color: 'blue' },
                  { label: 'Con alerta pendiente', value: alertas.length, icon: '🔔', color: alertas.length > 0 ? 'red' : 'green' },
                  { label: 'Entregas totales', value: dotaciones.length, icon: '📦', color: 'indigo' },
                  { label: 'Costo total histórico', value: COP(costoTotal), icon: '💰', color: 'emerald', isText: true },
                ].map(({ label, value, icon, color, isText }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{icon}</span>
                      <p className="text-xs text-slate-500 font-medium">{label}</p>
                    </div>
                    <p className={`font-bold text-${color}-600 ${isText ? 'text-sm' : 'text-2xl'}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Alertas */}
              {alertas.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell size={16} className="text-amber-600" />
                    <p className="font-bold text-amber-800 text-sm">
                      {alertas.length} empleado{alertas.length > 1 ? 's' : ''} sin dotación en los últimos 4 meses
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {alertas.map(emp => (
                      <button key={emp.id} onClick={() => openDotModal(emp)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg text-xs font-medium text-amber-800 transition-colors">
                        <Shirt size={12} /> {emp.full_name} → Registrar dotación
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabla de empleados con estado dotación */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">Estado de Dotación por Empleado</h3>
                  <p className="text-xs text-slate-400">Dotación obligatoria cada 4 meses (Art. 230 CST)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Empleado</th>
                        <th className="px-4 py-3 text-left">Cargo</th>
                        <th className="px-4 py-3 text-left">Última entrega</th>
                        <th className="px-4 py-3 text-left">Próxima entrega</th>
                        <th className="px-4 py-3 text-right">Costo total</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                        <th className="px-4 py-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {activeEmps2.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No hay empleados activos</td></tr>
                      ) : activeEmps2.map(emp => {
                        const entregas = dotaciones.filter(d => d.employee_id === emp.id);
                        const ultimaEntrega = entregas[0];
                        const costoEmp = entregas.reduce((s, d) => s + d.costo_total, 0);
                        let estadoLabel = '⚠️ Pendiente';
                        let estadoColor = 'bg-amber-100 text-amber-700';
                        let proximaFecha = '—';
                        if (ultimaEntrega) {
                          const ultima = new Date(ultimaEntrega.fecha_entrega);
                          const proxima = new Date(ultima);
                          proxima.setMonth(proxima.getMonth() + 4);
                          proximaFecha = proxima.toLocaleDateString('es-CO');
                          const meses = (hoy.getTime() - ultima.getTime()) / (1000 * 60 * 60 * 24 * 30);
                          if (meses < 3.5) { estadoLabel = '✅ Al día'; estadoColor = 'bg-green-100 text-green-700'; }
                          else if (meses < 4) { estadoLabel = '🟡 Próximo'; estadoColor = 'bg-yellow-100 text-yellow-700'; }
                          else { estadoLabel = '🔴 Vencido'; estadoColor = 'bg-red-100 text-red-700'; }
                        }
                        return (
                          <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-800">{emp.full_name}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{emp.job_title}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {ultimaEntrega ? new Date(ultimaEntrega.fecha_entrega).toLocaleDateString('es-CO') : 'Sin registros'}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{proximaFecha}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700">{COP(costoEmp)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${estadoColor}`}>{estadoLabel}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => openDotModal(emp)}
                                className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                                + Registrar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Historial de entregas */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800">Historial de Entregas</h3>
                </div>
                {dotaciones.length === 0 ? (
                  <div className="px-5 py-8 text-center text-slate-400">
                    <Shirt size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No hay entregas registradas aún</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">Empleado</th>
                          <th className="px-4 py-3 text-left">Fecha</th>
                          <th className="px-4 py-3 text-left">Período</th>
                          <th className="px-4 py-3 text-left">Ítems</th>
                          <th className="px-4 py-3 text-right">Costo</th>
                          <th className="px-4 py-3 text-left">Recibió</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {dotaciones.map(d => (
                          <tr key={d.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-800">{d.employee_name}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{new Date(d.fecha_entrega).toLocaleDateString('es-CO')}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{d.periodo}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {d.items.map((i: DotacionItem) => `${i.descripcion}${i.talla_ropa ? ` T${i.talla_ropa}` : ''}${i.talla_zapato ? ` #${i.talla_zapato}` : ''}`).join(', ')}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800">{COP(d.costo_total)}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{d.recibido_por || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Resumen de costos por período */}
              {Object.keys(periodosSummary).length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-800 mb-4">Costo por Período</h3>
                  <div className="space-y-2">
                    {Object.entries(periodosSummary).sort((a, b) => b[0].localeCompare(a[0])).map(([periodo, costo]) => (
                      <div key={periodo} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-500 w-16">{periodo}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                          <div className="h-2 bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min((costo / costoTotal) * 100, 100)}%` }} />
                        </div>
                        <span className="text-sm font-bold text-slate-700 w-28 text-right">{COP(costo as number)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal registrar dotación */}
              {showDotModal && dotEmployee && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between px-5 py-4 border-b">
                      <div>
                        <h3 className="font-bold text-slate-800">Registrar Dotación</h3>
                        <p className="text-xs text-slate-500">{dotEmployee.full_name} · {dotEmployee.job_title}</p>
                      </div>
                      <button onClick={() => setShowDotModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de entrega</label>
                          <input type="date" value={dotForm.fecha_entrega}
                            onChange={e => setDotForm(f => ({ ...f, fecha_entrega: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de quien recibe</label>
                          <input type="text" value={dotForm.recibido_por} placeholder="Firma/nombre empleado"
                            onChange={e => setDotForm(f => ({ ...f, recibido_por: e.target.value }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                        </div>
                      </div>

                      {/* Items */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-slate-600 uppercase">Ítems de dotación</label>
                          <button onClick={() => setDotForm(f => ({ ...f, items: [...f.items, { descripcion: '', cantidad: 1, talla_ropa: 'M', costo_unitario: 0, subtotal: 0 }] }))}
                            className="text-xs text-blue-600 hover:text-blue-800 font-bold">+ Agregar ítem</button>
                        </div>
                        <div className="space-y-3">
                          {dotForm.items.map((item, idx) => (
                            <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                              <div className="flex gap-2">
                                <input value={item.descripcion} placeholder="Descripción (ej: Camisa polo)"
                                  onChange={e => updateItem(idx, 'descripcion', e.target.value)}
                                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-300" />
                                <button onClick={() => setDotForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                                  className="p-1.5 text-red-400 hover:text-red-600"><X size={14} /></button>
                              </div>
                              <div className="grid grid-cols-4 gap-2">
                                <div>
                                  <label className="text-[10px] text-slate-500">Cant.</label>
                                  <input type="number" min="1" value={item.cantidad}
                                    onChange={e => updateItem(idx, 'cantidad', +e.target.value)}
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-500">Talla ropa</label>
                                  <select value={item.talla_ropa || ''} onChange={e => updateItem(idx, 'talla_ropa', e.target.value)}
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none">
                                    <option value="">N/A</option>
                                    {(['XS','S','M','L','XL','XXL','3XL'] as TallaRopa[]).map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-500">Talla zapato</label>
                                  <select value={item.talla_zapato || ''} onChange={e => updateItem(idx, 'talla_zapato', e.target.value || undefined)}
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none">
                                    <option value="">N/A</option>
                                    {['34','35','36','37','38','39','40','41','42','43','44','45'].map(t => <option key={t} value={t}>#{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-500">Costo unit.</label>
                                  <input type="number" min="0" value={item.costo_unitario}
                                    onChange={e => updateItem(idx, 'costo_unitario', +e.target.value)}
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none" />
                                </div>
                              </div>
                              <div className="text-right text-xs font-bold text-slate-700">
                                Subtotal: {COP(item.subtotal)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones</label>
                        <textarea value={dotForm.observaciones} rows={2} placeholder="Notas adicionales..."
                          onChange={e => setDotForm(f => ({ ...f, observaciones: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      </div>

                      <div className="flex items-center justify-between bg-blue-50 rounded-xl p-3">
                        <span className="text-sm font-bold text-blue-700">Costo total entrega:</span>
                        <span className="text-lg font-black text-blue-700">
                          {COP(dotForm.items.reduce((s, i) => s + i.subtotal, 0))}
                        </span>
                      </div>

                      <div className="flex gap-3">
                        <button onClick={() => setShowDotModal(false)}
                          className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 text-sm">
                          Cancelar
                        </button>
                        <button onClick={saveDotacion}
                          className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 text-sm flex items-center justify-center gap-2">
                          <CheckCircle2 size={16} /> Guardar dotación
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          );
        })()}

        {/* ════════════════════════════════════════════════════════════
            TAB: REPORTES
        ════════════════════════════════════════════════════════════ */}
        {activeTab === 'reportes' && (
          <div className="space-y-6">
            {/* Export button */}
            <div className="flex justify-end">
              <button onClick={() => {
                const wb = XLSX.utils.book_new();
                // Hoja empleados
                const empRows = employees.map((e:any) => ({
                  'Nombre': e.full_name, 'Cargo': e.position||'', 'Tipo': e.employee_type,
                  'Salario Base': e.base_salary, 'Auxilio Transporte': e.transport_allowance||0,
                  'Estado': e.is_active ? 'Activo' : 'Inactivo',
                }));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empRows), 'Empleados');
                // Hoja nóminas si existen
                if (payrolls && payrolls.length > 0) {
                  const payRows = payrolls.map((p:any) => ({
                    'Período': p.period_label||p.period, 'Empleado': p.employee_name||'',
                    'Salario': p.base_salary, 'Devengado': p.total_devengado,
                    'Deducciones': p.total_deducciones, 'Neto': p.net_pay, 'Estado': p.status,
                  }));
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payRows), 'Nóminas');
                }
                XLSX.writeFile(wb, `Nomina_Reporte_${new Date().toISOString().slice(0,10)}.xlsx`);
              }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700">
                <Download size={15} /> Exportar Excel
              </button>
            </div>
            {/* Resumen PILA */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-bold text-slate-800 mb-1">Resumen PILA — Planilla Integrada de Liquidación</h3>
              <p className="text-xs text-slate-500 mb-4">Aportes a pagar mensualmente ante UGPP / Operadores PILA</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <th className="px-3 py-2 text-left">Empleado</th>
                      <th className="px-3 py-2 text-right">Salud Emp.</th>
                      <th className="px-3 py-2 text-right">Pensión Emp.</th>
                      <th className="px-3 py-2 text-right">Salud Empl.</th>
                      <th className="px-3 py-2 text-right">Pensión Empl.</th>
                      <th className="px-3 py-2 text-right">ARL</th>
                      <th className="px-3 py-2 text-right">Parafiscales</th>
                      <th className="px-3 py-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeEmps.map(emp => {
                      const c = calcularNomina(emp);
                      const total = c.health_employee + c.pension_employee + c.health_employer + c.pension_employer + c.arl + c.parafiscales;
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium">{emp.full_name}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(c.health_employee)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(c.pension_employee)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(c.health_employer)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(c.pension_employer)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(c.arl)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(c.parafiscales)}</td>
                          <td className="px-3 py-2 text-right font-bold text-blue-700">{fmt(total)}</td>
                        </tr>
                      );
                    })}
                    {activeEmps.length > 0 && (() => {
                      const totals = activeEmps.reduce((acc, emp) => {
                        const c = calcularNomina(emp);
                        return {
                          he: acc.he + c.health_employee, pe: acc.pe + c.pension_employee,
                          hempl: acc.hempl + c.health_employer, pempl: acc.pempl + c.pension_employer,
                          arl: acc.arl + c.arl, para: acc.para + c.parafiscales,
                        };
                      }, { he: 0, pe: 0, hempl: 0, pempl: 0, arl: 0, para: 0 });
                      const total = Object.values(totals).reduce((a, b) => a + b, 0);
                      return (
                        <tr className="bg-blue-50 font-bold">
                          <td className="px-3 py-2">TOTALES</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(totals.he)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(totals.pe)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(totals.hempl)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(totals.pempl)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(totals.arl)}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(totals.para)}</td>
                          <td className="px-3 py-2 text-right text-blue-800">{fmt(total)}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Provisiones */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-bold text-slate-800 mb-1">Provisiones Mensuales</h3>
              <p className="text-xs text-slate-500 mb-4">Valores a provisionar mensualmente para obligaciones futuras</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {activeEmps.length > 0 && (() => {
                  const totals = activeEmps.reduce((acc, emp) => {
                    const c = calcularNomina(emp);
                    return {
                      ces: acc.ces + c.cesantias_provision,
                      intCes: acc.intCes + c.interest_cesantias,
                      prima: acc.prima + c.prima_provision,
                      vac: acc.vac + c.vacaciones_provision,
                    };
                  }, { ces: 0, intCes: 0, prima: 0, vac: 0 });
                  return (
                    <>
                      {[
                        { label: 'Cesantías', value: totals.ces, pct: '8.33%', color: 'blue' },
                        { label: 'Int. Cesantías', value: totals.intCes, pct: '1% mensual', color: 'indigo' },
                        { label: 'Prima', value: totals.prima, pct: '8.33%', color: 'purple' },
                        { label: 'Vacaciones', value: totals.vac, pct: '4.17%', color: 'teal' },
                      ].map(item => (
                        <div key={item.label} className={`bg-${item.color}-50 border border-${item.color}-200 rounded-xl p-4`}>
                          <p className={`text-xs font-semibold text-${item.color}-700 mb-1`}>{item.label}</p>
                          <p className={`text-lg font-bold text-${item.color}-800`}>{fmt(item.value)}</p>
                          <p className={`text-xs text-${item.color}-500`}>{item.pct}</p>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Notas legales */}
            <div className="bg-slate-800 rounded-xl p-6 text-white">
              <h3 className="font-bold mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-yellow-400" /> Obligaciones legales — Calendario</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-300">
                {[
                  ['Pago PILA', 'Mensual — antes del 10 del mes siguiente. Operadores: SOI, Aportes en línea, SIMPLE'],
                  ['Pago nómina', 'Según frecuencia pactada (mensual, quincenal, semanal)'],
                  ['Cesantías', 'Consignar al fondo antes del 14 de febrero de cada año'],
                  ['Intereses cesantías', 'Pagar directamente al trabajador antes del 31 de enero'],
                  ['Prima junio', 'Pagar antes del 30 de junio (15 días de salario)'],
                  ['Prima diciembre', 'Pagar antes del 20 de diciembre (15 días de salario)'],
                  ['Retención en fuente', 'Declarar mensual ante DIAN — Formulario 350'],
                  ['Informe anual empleados', 'Información exógena — Medios Magnéticos DIAN'],
                ].map(([title, desc]) => (
                  <div key={title} className="flex gap-2">
                    <Check size={14} className="text-green-400 mt-0.5 shrink-0" />
                    <div><span className="font-semibold text-white">{title}:</span> {desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: EMPLEADO
      ══════════════════════════════════════════════════════════════ */}
      {showEmpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-bold text-lg text-slate-800">{editingEmp ? 'Editar Empleado' : 'Nuevo Empleado'}</h3>
              <button onClick={() => { setShowEmpModal(false); setEditingEmp(null); }} className="p-2 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Datos personales */}
              <p className={sectionHead}>Datos Personales</p>
              <div className="md:col-span-2">
                <label className={labelCls}>Nombre completo *</label>
                <input value={empForm.full_name} onChange={e => setEmpForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tipo de documento</label>
                <select value={empForm.document_type} onChange={e => setEmpForm(f => ({ ...f, document_type: e.target.value as any }))} className={inputCls}>
                  <option value="CC">Cédula de Ciudadanía</option>
                  <option value="CE">Cédula de Extranjería</option>
                  <option value="PAS">Pasaporte</option>
                  <option value="TI">Tarjeta de Identidad</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Número de documento *</label>
                <input value={empForm.document_number} onChange={e => setEmpForm(f => ({ ...f, document_number: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Teléfono</label>
                <input value={empForm.phone} onChange={e => setEmpForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Dirección</label>
                <input value={empForm.address} onChange={e => setEmpForm(f => ({ ...f, address: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fecha de nacimiento</label>
                <input type="date" value={empForm.birth_date} onChange={e => setEmpForm(f => ({ ...f, birth_date: e.target.value }))} className={inputCls} />
              </div>

              {/* Contrato */}
              <p className={sectionHead}>Información Laboral</p>
              <div>
                <label className={labelCls}>Cargo *</label>
                <input value={empForm.job_title} onChange={e => setEmpForm(f => ({ ...f, job_title: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Área / Departamento</label>
                <input value={empForm.department} onChange={e => setEmpForm(f => ({ ...f, department: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tipo de contrato</label>
                <select value={empForm.contract_type} onChange={e => setEmpForm(f => ({ ...f, contract_type: e.target.value as ContractType }))} className={inputCls}>
                  {Object.entries(CONTRACT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Frecuencia de pago</label>
                <select value={empForm.pay_frequency} onChange={e => setEmpForm(f => ({ ...f, pay_frequency: e.target.value as PayFrequency }))} className={inputCls}>
                  <option value="MENSUAL">Mensual</option>
                  <option value="QUINCENAL">Quincenal</option>
                  <option value="SEMANAL">Semanal</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Fecha de ingreso *</label>
                <input type="date" value={empForm.hire_date} onChange={e => setEmpForm(f => ({ ...f, hire_date: e.target.value }))} className={inputCls} />
              </div>

              {/* Salario */}
              <p className={sectionHead}>Salario y Deducciones</p>
              <div>
                <label className={labelCls}>Salario base mensual (COP) *</label>
                <input type="number" value={empForm.base_salary} onChange={e => setEmpForm(f => ({ ...f, base_salary: Number(e.target.value) }))} className={inputCls} />
                <p className="text-xs text-slate-400 mt-1">{(empForm.base_salary / smmlv).toFixed(2)} SMMLV — Mínimo: {fmt(smmlv)}</p>
              </div>
              <div>
                <label className={labelCls}>Nivel de riesgo ARL</label>
                <select value={empForm.risk_level} onChange={e => setEmpForm(f => ({ ...f, risk_level: e.target.value as RiskLevel }))} className={inputCls}>
                  <option value="I">Nivel I — Riesgo Mínimo (0.522%)</option>
                  <option value="II">Nivel II — Riesgo Bajo (1.044%)</option>
                  <option value="III">Nivel III — Riesgo Medio (2.436%)</option>
                  <option value="IV">Nivel IV — Riesgo Alto (4.350%)</option>
                  <option value="V">Nivel V — Riesgo Máximo (6.960%)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Retención en la fuente mensual</label>
                <input type="number" value={empForm.income_tax_deduction} onChange={e => setEmpForm(f => ({ ...f, income_tax_deduction: Number(e.target.value) }))} className={inputCls} />
                <p className="text-xs text-slate-400 mt-1">Aplica si salario {">"} ~{fmt(COLOMBIA_2025.UVT_2025 * 95)} (95 UVT)</p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={empForm.applies_transport_subsidy} onChange={e => setEmpForm(f => ({ ...f, applies_transport_subsidy: e.target.checked }))} className="rounded" />
                  <span className="text-sm">Aplica auxilio de transporte ({fmt(COLOMBIA_2025.AUXILIO_TRANSPORTE)})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={empForm.applies_parafiscales} onChange={e => setEmpForm(f => ({ ...f, applies_parafiscales: e.target.checked }))} className="rounded" />
                  <span className="text-sm">Aplica SENA + ICBF (empresa {">"} 10 trabajadores)</span>
                </label>
              </div>

              {/* Entidades */}
              <p className={sectionHead}>Entidades de Seguridad Social</p>
              <div>
                <label className={labelCls}>EPS</label>
                <input value={empForm.eps} onChange={e => setEmpForm(f => ({ ...f, eps: e.target.value }))} placeholder="Ej: Sura, Compensar, Sanitas" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fondo de pensiones</label>
                <input value={empForm.pension_fund} onChange={e => setEmpForm(f => ({ ...f, pension_fund: e.target.value }))} placeholder="Ej: Porvenir, Protección, Colfondos" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fondo de cesantías</label>
                <input value={empForm.cesantias_fund} onChange={e => setEmpForm(f => ({ ...f, cesantias_fund: e.target.value }))} placeholder="Ej: Porvenir, Protección, FNA" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Caja de compensación</label>
                <input value={empForm.caja_compensacion} onChange={e => setEmpForm(f => ({ ...f, caja_compensacion: e.target.value }))} placeholder="Ej: Compensar, Cafam, Colsubsidio" className={inputCls} />
              </div>

              {/* Cuenta bancaria */}
              <p className={sectionHead}>Datos Bancarios</p>
              <div>
                <label className={labelCls}>Banco</label>
                <input value={empForm.bank_name} onChange={e => setEmpForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="Ej: Bancolombia, Davivienda" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Número de cuenta</label>
                <input value={empForm.bank_account} onChange={e => setEmpForm(f => ({ ...f, bank_account: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tipo de cuenta</label>
                <select value={empForm.bank_account_type} onChange={e => setEmpForm(f => ({ ...f, bank_account_type: e.target.value as any }))} className={inputCls}>
                  <option value="AHORROS">Ahorros</option>
                  <option value="CORRIENTE">Corriente</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelCls}>Notas</label>
                <textarea value={empForm.notes} onChange={e => setEmpForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3">
              <button onClick={() => { setShowEmpModal(false); setEditingEmp(null); }} className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-100">Cancelar</button>
              <button onClick={saveEmployee} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
                <Check size={14} className="inline mr-1" />{editingEmp ? 'Guardar cambios' : 'Registrar empleado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: LIQUIDAR NÓMINA
      ══════════════════════════════════════════════════════════════ */}
      {showPayrollModal && payrollEmployee && previewCalc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Liquidar Nómina — {payrollEmployee.full_name}</h3>
                <p className="text-xs text-slate-500">{CONTRACT_LABELS[payrollEmployee.contract_type]} · Salario {fmt(payrollEmployee.base_salary)}</p>
              </div>
              <button onClick={() => setShowPayrollModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Formulario */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-700">Período y Variables</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Inicio período *</label>
                    <input type="date" value={payForm.period_start} onChange={e => setPayForm(f => ({ ...f, period_start: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Fin período *</label>
                    <input type="date" value={payForm.period_end} onChange={e => setPayForm(f => ({ ...f, period_end: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Fecha de pago *</label>
                    <input type="date" value={payForm.pay_date} onChange={e => setPayForm(f => ({ ...f, pay_date: e.target.value }))} className={inputCls} />
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <h5 className="text-xs font-bold text-green-700 uppercase mb-3">Ingresos adicionales</h5>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['overtime_hours', 'Horas extra diurnas (+25%)', 'h'],
                      ['nocturnal_hours', 'Horas nocturnas (+75%)', 'h'],
                      ['sunday_holiday_hours', 'Horas dominical/festivo (+100%)', 'h'],
                    ].map(([key, label, unit]) => (
                      <div key={key}>
                        <label className={labelCls}>{label}</label>
                        <div className="relative">
                          <input type="number" min="0" value={(payForm as any)[key]}
                            onChange={e => setPayForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                            className={inputCls + ' pr-8'} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{unit}</span>
                        </div>
                      </div>
                    ))}
                    {[
                      ['commissions', 'Comisiones'],
                      ['bonuses', 'Bonificaciones'],
                      ['other_income', 'Otros ingresos'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className={labelCls}>{label}</label>
                        <input type="number" min="0" value={(payForm as any)[key]}
                          onChange={e => setPayForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                          className={inputCls} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h5 className="text-xs font-bold text-red-700 uppercase mb-3">Deducciones adicionales</h5>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['loan_deduction', 'Cuota préstamo'],
                      ['other_deductions', 'Otras deducciones'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className={labelCls}>{label}</label>
                        <input type="number" min="0" value={(payForm as any)[key]}
                          onChange={e => setPayForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                          className={inputCls} />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Notas</label>
                  <textarea value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
                </div>
              </div>

              {/* Vista previa colilla */}
              <div>
                <h4 className="font-bold text-slate-700 mb-4">Vista previa colilla de pago</h4>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-1">
                  <div className="font-bold text-center text-slate-700 mb-3 pb-2 border-b">COMPROBANTE DE NÓMINA</div>

                  <div className="font-semibold text-green-700 text-xs uppercase mb-1">Devengado</div>
                  {[
                    ['Salario base', previewCalc.base_salary],
                    previewCalc.transport_subsidy > 0 ? ['Auxilio transporte', previewCalc.transport_subsidy] : null,
                    previewCalc.overtime_amount > 0 ? [`H. extra (${previewCalc.overtime_hours}h)`, previewCalc.overtime_amount] : null,
                    previewCalc.nocturnal_amount > 0 ? [`H. nocturnas (${previewCalc.nocturnal_hours}h)`, previewCalc.nocturnal_amount] : null,
                    previewCalc.sunday_holiday_amount > 0 ? [`H. dominical (${previewCalc.sunday_holiday_hours}h)`, previewCalc.sunday_holiday_amount] : null,
                    previewCalc.commissions > 0 ? ['Comisiones', previewCalc.commissions] : null,
                    previewCalc.bonuses > 0 ? ['Bonificaciones', previewCalc.bonuses] : null,
                    previewCalc.other_income > 0 ? ['Otros ingresos', previewCalc.other_income] : null,
                  ].filter(Boolean).map(([label, val]: any) => (
                    <div key={label} className="flex justify-between text-slate-600">
                      <span>{label}</span><span>{fmt(val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-green-700 pt-1 border-t">
                    <span>Total devengado</span><span>{fmt(previewCalc.gross_salary)}</span>
                  </div>

                  <div className="font-semibold text-red-700 text-xs uppercase mt-3 mb-1">Deducciones</div>
                  {[
                    ['Salud (4%)', previewCalc.health_employee],
                    ['Pensión (4%)', previewCalc.pension_employee],
                    previewCalc.solidarity_fund > 0 ? ['Fondo solidaridad', previewCalc.solidarity_fund] : null,
                    previewCalc.income_tax > 0 ? ['Retención en fuente', previewCalc.income_tax] : null,
                    previewCalc.loan_deduction > 0 ? ['Cuota préstamo', previewCalc.loan_deduction] : null,
                    previewCalc.other_deductions > 0 ? ['Otras deducciones', previewCalc.other_deductions] : null,
                  ].filter(Boolean).map(([label, val]: any) => (
                    <div key={label} className="flex justify-between text-slate-600">
                      <span>{label}</span><span className="text-red-600">-{fmt(val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-red-700 pt-1 border-t">
                    <span>Total deducciones</span><span>-{fmt(previewCalc.total_deductions)}</span>
                  </div>

                  <div className="flex justify-between font-bold text-xl text-slate-800 pt-2 border-t-2 border-slate-300 mt-2">
                    <span>NETO A PAGAR</span><span>{fmt(previewCalc.net_salary)}</span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-dashed">
                    <div className="font-semibold text-orange-700 text-xs uppercase mb-1">Aportes empleador (informativo)</div>
                    {[
                      ['Salud empleador (8.5%)', previewCalc.health_employer],
                      ['Pensión empleador (12%)', previewCalc.pension_employer],
                      [`ARL Riesgo ${payrollEmployee.risk_level}`, previewCalc.arl],
                      ['Parafiscales', previewCalc.parafiscales],
                      ['Provisión cesantías', previewCalc.cesantias_provision],
                      ['Provisión prima', previewCalc.prima_provision],
                    ].map(([label, val]: any) => (
                      <div key={label} className="flex justify-between text-xs text-slate-500">
                        <span>{label}</span><span>{fmt(val)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-orange-700 text-xs pt-1 border-t">
                      <span>Costo total empleador</span><span>{fmt(previewCalc.total_employer_cost)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowPayrollModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-100">Cancelar</button>
              <button onClick={processPayroll} className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
                <Check size={14} className="inline mr-1" />Confirmar y guardar nómina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: LIQUIDACIÓN FINAL
      ══════════════════════════════════════════════════════════════ */}
      {showLiqModal && liqEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Liquidación Final — {liqEmployee.full_name}</h3>
                <p className="text-xs text-slate-500">Ingreso: {liqEmployee.hire_date} · Salario: {fmt(liqEmployee.base_salary)}</p>
              </div>
              <button onClick={() => setShowLiqModal(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-6 grid md:grid-cols-2 gap-6">
              {/* Form */}
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Fecha de retiro</label>
                  <input type="date" value={liqForm.termination_date} onChange={e => setLiqForm(f => ({ ...f, termination_date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Causa del retiro</label>
                  <select value={liqForm.termination_reason} onChange={e => setLiqForm(f => ({ ...f, termination_reason: e.target.value }))} className={inputCls}>
                    {Object.entries(TERMINATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {liqForm.termination_reason === 'DESPIDO_INJUSTA' && (
                    <p className="text-xs text-red-600 mt-1">⚠️ Se calculará indemnización según Art. 64 CST</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Días trabajados en último período incompleto</label>
                  <input type="number" min="0" max="30" value={liqForm.dias_ultimo_periodo} onChange={e => setLiqForm(f => ({ ...f, dias_ultimo_periodo: Number(e.target.value) }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Bonificaciones adicionales</label>
                  <input type="number" min="0" value={liqForm.bonificaciones} onChange={e => setLiqForm(f => ({ ...f, bonificaciones: Number(e.target.value) }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Deudas con la empresa</label>
                  <input type="number" min="0" value={liqForm.deudas} onChange={e => setLiqForm(f => ({ ...f, deudas: Number(e.target.value) }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Anticipos otorgados</label>
                  <input type="number" min="0" value={liqForm.anticipos} onChange={e => setLiqForm(f => ({ ...f, anticipos: Number(e.target.value) }))} className={inputCls} />
                </div>
              </div>

              {/* Vista previa */}
              {previewLiq && (
                <div>
                  <h4 className="font-bold text-slate-700 mb-3">Liquidación estimada</h4>
                  <div className="bg-slate-50 border rounded-xl p-4 text-sm space-y-1">
                    <p className="text-xs text-slate-500 mb-2">{previewLiq.dias_trabajados} días trabajados · {previewLiq.anios} años</p>

                    {[
                      ['Cesantías', previewLiq.cesantias],
                      ['Intereses sobre cesantías', previewLiq.intereses_cesantias],
                      ['Prima proporcional', previewLiq.prima],
                      ['Vacaciones proporcionales', previewLiq.vacaciones],
                      previewLiq.indemnizacion > 0 ? ['Indemnización (Art. 64 CST)', previewLiq.indemnizacion] : null,
                      ['Salario días pendientes', previewLiq.salario_pendiente],
                      previewLiq.bonificaciones > 0 ? ['Bonificaciones', previewLiq.bonificaciones] : null,
                    ].filter(Boolean).map(([label, val]: any) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-slate-600">{label}</span>
                        <span className="font-medium text-green-700">{fmt(val)}</span>
                      </div>
                    ))}

                    <div className="flex justify-between font-bold text-green-700 pt-1 border-t">
                      <span>Total bruto</span><span>{fmt(previewLiq.total_a_pagar)}</span>
                    </div>

                    {previewLiq.total_deducciones > 0 && (
                      <>
                        <div className="mt-2 pt-1 border-t">
                          {previewLiq.deudas_empresa > 0 && <div className="flex justify-between text-red-600"><span>Deudas empresa</span><span>-{fmt(previewLiq.deudas_empresa)}</span></div>}
                          {previewLiq.anticipos > 0 && <div className="flex justify-between text-red-600"><span>Anticipos</span><span>-{fmt(previewLiq.anticipos)}</span></div>}
                        </div>
                      </>
                    )}

                    <div className="flex justify-between font-bold text-2xl text-slate-800 pt-2 border-t-2">
                      <span>TOTAL A PAGAR</span><span>{fmt(previewLiq.total_neto)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowLiqModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancelar</button>
              <button onClick={processLiquidacion} className="px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">
                <Check size={14} className="inline mr-1" />Generar liquidación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: COLILLA DE PAGO
      ══════════════════════════════════════════════════════════════ */}
      {showColilla && colillaPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">Colilla de Pago</h3>
              <button onClick={() => setShowColilla(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={15} /></button>
            </div>
            <div className="p-5 text-sm space-y-1">
              <div className="text-center mb-3">
                <p className="font-bold text-slate-800 text-base">{company?.name}</p>
                <p className="text-slate-500 text-xs">NIT: {company?.nit}</p>
                <p className="font-semibold text-slate-700 mt-2">{colillaPeriod.employee_name}</p>
                <p className="text-xs text-slate-500">Período: {colillaPeriod.period_start} al {colillaPeriod.period_end}</p>
                <p className="text-xs text-slate-500">Fecha pago: {colillaPeriod.pay_date}</p>
              </div>
              <div className="border-t pt-2">
                <p className="text-xs font-bold text-green-700 uppercase mb-1">DEVENGADO</p>
                {[
                  ['Salario', colillaPeriod.base_salary],
                  colillaPeriod.transport_subsidy > 0 ? ['Aux. transporte', colillaPeriod.transport_subsidy] : null,
                  colillaPeriod.overtime_amount > 0 ? ['H. extra', colillaPeriod.overtime_amount] : null,
                  colillaPeriod.commissions > 0 ? ['Comisiones', colillaPeriod.commissions] : null,
                  colillaPeriod.bonuses > 0 ? ['Bonificaciones', colillaPeriod.bonuses] : null,
                ].filter(Boolean).map(([l, v]: any) => (
                  <div key={l} className="flex justify-between text-slate-600"><span>{l}</span><span>{fmt(v)}</span></div>
                ))}
                <div className="flex justify-between font-bold text-green-700 border-t mt-1 pt-1"><span>Total devengado</span><span>{fmt(colillaPeriod.gross_salary)}</span></div>
              </div>
              <div className="border-t pt-2">
                <p className="text-xs font-bold text-red-700 uppercase mb-1">DEDUCCIONES</p>
                {[
                  ['Salud 4%', colillaPeriod.health_employee],
                  ['Pensión 4%', colillaPeriod.pension_employee],
                  colillaPeriod.solidarity_fund > 0 ? ['F. Solidaridad', colillaPeriod.solidarity_fund] : null,
                  colillaPeriod.income_tax > 0 ? ['Ret. fuente', colillaPeriod.income_tax] : null,
                  colillaPeriod.loan_deduction > 0 ? ['Préstamo', colillaPeriod.loan_deduction] : null,
                ].filter(Boolean).map(([l, v]: any) => (
                  <div key={l} className="flex justify-between text-slate-600"><span>{l}</span><span className="text-red-600">-{fmt(v)}</span></div>
                ))}
                <div className="flex justify-between font-bold text-red-700 border-t mt-1 pt-1"><span>Total deducciones</span><span>-{fmt(colillaPeriod.total_deductions)}</span></div>
              </div>
              <div className="flex justify-between font-bold text-lg text-slate-800 border-t-2 pt-2 mt-2">
                <span>NETO PAGADO</span><span>{fmt(colillaPeriod.net_salary)}</span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => window.print()} className="w-full py-2 border border-slate-300 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-slate-50">
                <Printer size={14} /> Imprimir colilla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Nomina;