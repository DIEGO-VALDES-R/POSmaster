// ─────────────────────────────────────────────────────────────────────────────
// types.ts — Tipos globales de POSmaster
// Incluye: CORE POS + todos los módulos especializados
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// CORE — ENUMS
// ══════════════════════════════════════════════════════════════════════════════

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  TECHNICIAN = 'TECHNICIAN'
}

export enum ProductType {
  STANDARD = 'STANDARD',
  SERIALIZED = 'SERIALIZED',
  SERVICE = 'SERVICE',
  WEIGHABLE = 'WEIGHABLE'   // Producto vendido por peso (kg/lb/g)
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED',
  CREDIT_PENDING = 'CREDIT_PENDING',
  PENDING_ELECTRONIC = 'PENDING_ELECTRONIC',
  SENT_TO_DIAN = 'SENT_TO_DIAN',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  ACCEPTED_WITH_ERRORS = 'ACCEPTED_WITH_ERRORS'
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  CREDIT = 'CREDIT',
  PAYPAL = 'PAYPAL'
}

export enum RepairStatus {
  RECEIVED = 'RECEIVED',
  DIAGNOSING = 'DIAGNOSING',
  WAITING_PARTS = 'WAITING_PARTS',
  READY = 'READY',
  DELIVERED = 'DELIVERED'
}

export enum DianEnvironment {
  TEST = 'TEST',
  PRODUCTION = 'PRODUCTION'
}

// ══════════════════════════════════════════════════════════════════════════════
// CORE — INTERFACES
// ══════════════════════════════════════════════════════════════════════════════

export interface Company {
  id: string;
  name: string;
  nit: string;
  email?: string;
  address?: string;
  phone?: string;
  logo_url?: string;
  subscription_plan?: 'BASIC' | 'PRO' | 'ENTERPRISE';
  subscription_status?: 'ACTIVE' | 'INACTIVE' | 'PAST_DUE';
  config?: CompanyConfig;
  dian_settings?: DianSettings;
}

export interface CompanyConfig {
  tax_rate: number;
  currency_symbol: string;
  invoice_prefix: string;
  dian_resolution?: string;
  dian_date?: string;
  dian_range_from?: string;
  dian_range_to?: string;
}

export interface DianSettings {
  company_id: string;
  // ── Factus OAuth2 (método recomendado) ──────────────────────────
  factus_client_id?: string;     // Client ID de la app OAuth Factus
  factus_client_secret?: string; // Client Secret OAuth Factus
  factus_username?: string;      // Correo de login en Factus
  factus_password?: string;      // Contraseña de login en Factus
  // ── Factus token cacheado (gestionado automáticamente) ──────────
  factus_token: string;          // access_token vigente (auto-renovable)
  factus_token_expiry?: string;  // ISO string de expiración del token
  factus_env: 'sandbox' | 'production';  // Ambiente
  // ── Resolución DIAN ─────────────────────────────────────────────
  resolution_number: string;     // Número resolución DIAN
  resolution_date: string;       // Fecha resolución (YYYY-MM-DD)
  prefix: string;                // Prefijo (ej: SETP)
  range_from: number;            // Desde
  range_to: number;              // Hasta
  current_number: number;        // Correlativo actual
  // ── Empresa (para Factus) ────────────────────────────────────────
  nit_digit: string;             // Dígito verificación NIT
  // ── Legado ───────────────────────────────────────────────────────
  software_id?: string;
  software_pin?: string;
  technical_key?: string;
  certificate_url?: string;
  certificate_password?: string;
  environment?: DianEnvironment;
  is_active: boolean;
}

export interface ElectronicDocument {
  id: string;
  company_id: string;
  sale_id: string;
  xml_content?: string;
  cufe: string;
  qr_data: string;
  status: SaleStatus;
  dian_response?: string;
  track_id?: string;
  sent_at?: string;
  validated_at?: string;
  errors?: string[];
}

export interface Product {
  id: string;
  company_id: string;
  name: string;
  sku: string;
  description?: string;
  price: number;          // precio por kg/lb/unidad según unit_type
  cost: number;
  tax_rate: number;
  type: ProductType;
  category?: string;
  brand?: string;
  stock_quantity: number; // stock en unidad base (gramos para pesables)
  // ── Campos para productos pesables (WEIGHABLE) ──
  unit_type?: 'kg' | 'lb' | 'g' | 'unidad';
  price_per_unit?: number;  // precio por kg o lb
  stock_min_weight?: number; // alerta cuando stock (en g) baja de este valor
  plu_code?: string;         // código corto para POS ej: "F1", "P23"
  // ── Campos de descuento por producto ──
  discount_type?: 'pct' | 'value' | null;
  discount_pct?: number;
  discount_value?: number;
  discount_expires_at?: string | null;
  discount_label?: string | null;
}

export interface Customer {
  id: string;
  name: string;
  document_number: string;
  email?: string;
  phone?: string;
  address?: string;
  credit_limit?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  serial_number?: string;
  price: number;
  tax_rate: number;
  weight_kg?: number;     // peso real en kg para productos WEIGHABLE
  discount: number;
}

export interface Sale {
  id: string;
  invoice_number: string;
  customer_name?: string;
  customer_document?: string;
  customer_email?: string;
  customer_phone?: string;
  total_amount: number;
  status: SaleStatus;
  created_at: string;
  items: CartItem[];
  dian_cufe?: string;
  dian_qr_data?: string;
  electronic_doc?: ElectronicDocument;
}

export interface RepairOrder {
  id: string;
  customer_name: string;
  device_model: string;
  serial_number: string;
  issue_description: string;
  status: RepairStatus;
  estimated_cost: number;
  technician_notes?: string;
  created_at: string;
}

export interface CashRegisterSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  start_cash: number;
  start_time: string;
  end_time?: string;
  end_cash?: number;
  difference?: number;
  total_sales_cash: number;
  total_sales_card: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO: FARMACIA  (tablas: pharma_*)
// ══════════════════════════════════════════════════════════════════════════════

export interface PharmaMedication {
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

export interface PharmaLot {
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

export interface PharmaSupplier {
  id: string;
  company_id: string;
  name: string;
  nit: string;
  phone: string;
  address: string;
  email: string;
  notes?: string;
}

export interface PharmaPurchase {
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

export interface PharmaPurchaseItem {
  medication_id: string;
  medication_name: string;
  lot_number: string;
  expiry_date: string;
  quantity: number;
  unit_cost: number;
}

export interface PharmaPrescription {
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

export interface PharmaControlledSale {
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

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO: ODONTOLOGÍA  (tablas: odonto_*)
// ══════════════════════════════════════════════════════════════════════════════

export type OdontoPersonalType = 'ODONTOLOGO' | 'AUXILIAR' | 'HIGIENISTA' | 'RECEPCION';
export type OdontoPersonalStatus = 'ACTIVO' | 'INACTIVO';
export type OdontoConsultorioStatus = 'DISPONIBLE' | 'OCUPADO' | 'INACTIVO';
export type OdontoCitaStatus = 'PROGRAMADA' | 'ATENDIDA' | 'CANCELADA';
export type OdontoPlanDuracion = 'MENSUAL' | 'ANUAL';
export type OdontoFacturaStatus = 'PAGADA' | 'PENDIENTE' | 'ABONO';

export interface OdontoPersonal {
  id?: string;
  company_id?: string;
  nombre: string;
  documento: string;
  tipo: OdontoPersonalType;
  especialidad: string;
  telefono: string;
  estado: OdontoPersonalStatus;
}

export interface OdontoConsultorio {
  id?: string;
  company_id?: string;
  nombre: string;
  odontologo_id: string;
  auxiliar_id: string;
  estado: OdontoConsultorioStatus;
  observaciones: string;
}

export interface OdontoPaciente {
  id?: string;
  company_id?: string;
  nombre: string;
  documento: string;
  telefono: string;
  correo: string;
  direccion: string;
  fecha_nacimiento: string;
  grupo_sanguineo: string;
  alergias: string;
  antecedentes: string;
  observaciones: string;
}

export interface OdontoCita {
  id?: string;
  company_id?: string;
  paciente_id: string;
  paciente_nombre?: string;
  odontologo_id: string;
  odontologo_nombre?: string;
  consultorio_id: string;
  fecha: string;
  hora: string;
  motivo: string;
  estado: OdontoCitaStatus;
  notas: string;
}

export interface OdontoHistoriaClinica {
  id?: string;
  company_id?: string;
  paciente_id: string;
  paciente_nombre?: string;
  odontologo_id: string;
  fecha: string;
  motivo_consulta: string;
  diagnostico: string;
  tratamiento: string;
  dientes_tratados: string;
  observaciones: string;
  proxima_cita: string;
}

export interface OdontoServicio {
  id?: string;
  company_id?: string;
  nombre: string;
  descripcion: string;
  precio: number;
  activo: boolean;
}

export interface OdontoPlan {
  id?: string;
  company_id?: string;
  nombre: string;
  descripcion: string;
  precio: number;
  duracion: OdontoPlanDuracion;
  sesiones_incluidas: number;
  activo: boolean;
}

export interface OdontoFactura {
  id?: string;
  company_id?: string;
  paciente_id: string;
  paciente_nombre?: string;
  servicio_descripcion: string;
  total: number;
  abonado: number;
  saldo: number;
  estado: OdontoFacturaStatus;
  fecha: string;
  notas: string;
}

export interface OdontoDienteEstado {
  numero: number;
  estado: 'sano' | 'caries' | 'obturado' | 'extraccion' | 'corona' | 'implante' | 'ausente';
  notas: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO: VETERINARIA  (tablas: vet_*)
// ══════════════════════════════════════════════════════════════════════════════

export type VetPersonalType  = 'VETERINARIO' | 'AUXILIAR' | 'CIRUJANO' | 'RECEPCION';
export type VetPersonalStatus = 'ACTIVO' | 'INACTIVO';
export type VetConsultorioStatus = 'DISPONIBLE' | 'OCUPADO' | 'INACTIVO';
export type VetCitaStatus    = 'PROGRAMADA' | 'ATENDIDA' | 'CANCELADA';
export type VetHospitalizacionStatus = 'HOSPITALIZADO' | 'ALTA';
export type VetFacturaStatus = 'PAGADA' | 'PENDIENTE' | 'ABONO';

export interface VetPropietario {
  id?: string; company_id?: string;
  nombre: string; documento: string; telefono: string;
  correo: string; direccion: string; observaciones: string;
}

export interface VetMascota {
  id?: string; company_id?: string;
  nombre: string; propietario_id: string; propietario_nombre?: string;
  especie: string; raza: string; sexo: 'MACHO' | 'HEMBRA';
  fecha_nacimiento: string; peso_inicial: number; color: string;
  microchip: string; observaciones: string;
}

export interface VetPersonal {
  id?: string; company_id?: string;
  nombre: string; documento: string; tipo: VetPersonalType;
  especialidad: string; telefono: string; estado: VetPersonalStatus;
}

export interface VetConsultorio {
  id?: string; company_id?: string;
  nombre: string; veterinario_id: string; auxiliar_id: string;
  estado: VetConsultorioStatus; observaciones: string;
}

export interface VetCita {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  propietario_id: string; propietario_nombre?: string;
  veterinario_id: string; veterinario_nombre?: string;
  consultorio_id: string;
  fecha: string; hora: string; motivo: string;
  estado: VetCitaStatus; notas: string;
}

export interface VetHistoriaClinica {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  veterinario_id: string; fecha: string;
  motivo_consulta: string; diagnostico: string; tratamiento: string;
  temperatura: number; peso: number; observaciones: string;
}

export interface VetVacuna {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  nombre_vacuna: string; fecha_aplicacion: string;
  proxima_dosis: string; veterinario_id: string; lote: string; observaciones: string;
}

export interface VetControlPeso {
  id?: string; company_id?: string;
  mascota_id: string; fecha: string;
  peso: number; observaciones: string;
}

export interface VetHospitalizacion {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string;
  fecha_ingreso: string; fecha_alta?: string;
  motivo: string; veterinario_id: string;
  estado: VetHospitalizacionStatus; observaciones: string;
}

export interface VetMedicamento {
  id?: string; company_id?: string;
  nombre: string; tipo: string; presentacion: string;
  stock: number; precio: number;
}

export interface VetServicio {
  id?: string; company_id?: string;
  nombre: string; descripcion: string; precio: number; activo: boolean;
}

export interface VetPlan {
  id?: string; company_id?: string;
  nombre: string; precio: number;
  servicios_incluidos: string; descuento: number;
  estado: 'ACTIVO' | 'INACTIVO';
}

export interface VetFactura {
  id?: string; company_id?: string;
  mascota_id: string; mascota_nombre?: string; propietario_nombre?: string;
  servicio_descripcion: string; total: number;
  abonado: number; saldo: number;
  estado: VetFacturaStatus; fecha: string; notas: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO: SALÓN DE BELLEZA  (tablas: salon_*)
// ══════════════════════════════════════════════════════════════════════════════

export type SalonServiceStatus = 'WAITING' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface SalonService {
  id: string;
  company_id: string;
  name: string;
  duration_min: number;
  price: number;
  category: string;
  is_active: boolean;
}

export interface SalonStylist {
  id: string;
  company_id: string;
  name: string;
  specialty: string;
  phone?: string;
  is_active: boolean;
}

export interface SalonOrder {
  id: string;
  company_id: string;
  customer_name: string;
  customer_phone?: string;
  service_id: string;
  service_name?: string;
  stylist_id?: string;
  stylist_name?: string;
  status: SalonServiceStatus;
  price: number;
  notes?: string;
  started_at?: string;
  finished_at?: string;
  invoice_id?: string;
  created_at: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO: ZAPATERÍA / MARROQUINERÍA  (tablas: shoe_repair_*)
// ══════════════════════════════════════════════════════════════════════════════

export type ShoeRepairStatus = 'RECEIVED' | 'ASSIGNED' | 'IN_REPAIR' | 'PENDING_DELIVERY' | 'DELIVERED' | 'CANCELLED';

export interface ShoeRepairOrder {
  id: string;
  company_id: string;
  ticket_number: string;
  customer_name: string;
  customer_phone: string;
  customer_document?: string;
  item_description: string;
  item_brand?: string;
  item_color?: string;
  issue_description: string;
  service_type: string;
  estimated_cost: number;
  final_cost?: number;
  status: ShoeRepairStatus;
  technician_id?: string;
  technician_name?: string;
  received_at: string;
  estimated_delivery?: string;
  delivered_at?: string;
  invoice_id?: string;
  notes?: string;
  photo_url?: string;
}

export interface ShoeRepairTechnician {
  id: string;
  company_id: string;
  name: string;
  specialty?: string;
  phone?: string;
  is_active: boolean;
}

export interface ShoeRepairMaterial {
  id: string;
  company_id: string;
  name: string;
  unit: string;
  stock: number;
  cost: number;
  is_active: boolean;
}

export interface ShoeRepairHistoryEntry {
  id: string;
  company_id: string;
  repair_id: string;
  event: string;
  description: string;
  user_name: string;
  created_at: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO: RESTAURANTE  (tablas: restaurant_*, table_orders)
// ══════════════════════════════════════════════════════════════════════════════

export type RestaurantTableStatus = 'FREE' | 'OCCUPIED' | 'ORDERING' | 'READY' | 'BILLING';
export type RestaurantOrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type KitchenItemStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED';

export interface RestaurantTable {
  id: string;
  company_id: string;
  number: number;
  capacity: number;
  status: RestaurantTableStatus;
  current_order_id?: string;
  area?: string;
}

export interface RestaurantOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  notes?: string;
  status: KitchenItemStatus;
}

export interface RestaurantOrder {
  id: string;
  company_id: string;
  table_id: string;
  table_number?: number;
  items: RestaurantOrderItem[];
  status: RestaurantOrderStatus;
  total: number;
  waiter_name?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO: INSUMOS  (tablas: supplies, supply_movements)
// ══════════════════════════════════════════════════════════════════════════════

export type SupplyUnitType = 'unidad' | 'gramo' | 'kilogramo' | 'mililitro' | 'litro' | 'metro' | 'centimetro' | 'caja' | 'rollo' | 'par';

export interface Supply {
  id: string;
  company_id: string;
  name: string;
  category: string;
  unit: SupplyUnitType;
  stock_quantity: number;
  stock_min: number;
  cost: number;
  supplier: string;
  notes: string;
  is_active: boolean;
  created_at: string;
}

export interface SupplyMovement {
  id: string;
  company_id: string;
  supply_id: string;
  supply_name?: string;
  type: 'ENTRADA' | 'CONSUMO' | 'AJUSTE';
  quantity: number;
  cost_per_unit: number;
  reason: string;
  user_name: string;
  created_at: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO: SERVICIO TÉCNICO  (tablas: repair_orders)
// ══════════════════════════════════════════════════════════════════════════════
// RepairOrder y RepairStatus ya están definidos en CORE arriba