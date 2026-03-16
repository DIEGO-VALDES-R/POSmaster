import React, { useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, Download, CheckCircle, XCircle, Loader, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

// ── Tipos de módulo soportados ────────────────────────────────────────────────
export type ModuleType =
  | 'odontologia_insumos' | 'odontologia_servicios' | 'odontologia_personal'
  | 'veterinaria_medicamentos' | 'veterinaria_servicios' | 'veterinaria_insumos'
  | 'optometria_monturas' | 'optometria_servicios' | 'optometria_lentes'
  | 'farmacia_medicamentos' | 'farmacia_otc'
  | 'salon_servicios' | 'salon_insumos';

interface ColumnDef {
  key: string;
  aliases: string[];
  required?: boolean;
  type?: 'string' | 'number' | 'int' | 'boolean';
}

interface ModuleConfig {
  label: string;
  table: string;
  color: string;
  columns: ColumnDef[];
  templateFn: () => any[][];
  templateHeaders: string[];
  templateColWidths: number[];
  validate: (row: any) => string | null;
  transform: (row: any, companyId: string) => any;
}

// ── Configuración por módulo ──────────────────────────────────────────────────
const MODULES: Record<ModuleType, ModuleConfig> = {

  // ── ODONTOLOGÍA ──────────────────────────────────────────────────────────
  odontologia_insumos: {
    label: 'Insumos Dentales', table: 'products', color: '#0ea5e9',
    templateHeaders: ['Nombre *','SKU *','Categoría','Marca','Precio Venta *','Costo *','Stock','Stock Mínimo','IVA (%)','Proveedor'],
    templateColWidths: [28,14,18,16,14,12,10,12,8,22],
    templateFn: () => [
      ['Composite A1 3M','INS-COMP-A1','Resinas','3M ESPE','85000','45000','20','3','19','Dental Supply'],
      ['Anestesia Lidocaína x50','INS-ANES','Anestésicos','Septodont','95000','55000','10','2','19','Insumedical'],
      ['Ácido Grabador 37% 3ml','INS-ACID','Adhesivos','Kerr','25000','12000','30','5','19','Insumedical'],
    ],
    columns: [
      { key: 'name', aliases: ['nombre','name'], required: true },
      { key: 'sku', aliases: ['sku','código','codigo'], required: true },
      { key: 'category', aliases: ['categoría','categoria','category'] },
      { key: 'brand', aliases: ['marca','brand'] },
      { key: 'price', aliases: ['precio venta','precio','price'], required: true, type: 'number' },
      { key: 'cost', aliases: ['costo','cost'], type: 'number' },
      { key: 'stock_quantity', aliases: ['stock','stock inicial'], type: 'int' },
      { key: 'stock_min', aliases: ['stock mínimo','stock minimo'], type: 'int' },
      { key: 'tax_rate', aliases: ['iva (%)','iva'], type: 'number' },
      { key: 'supplier_name', aliases: ['proveedor','supplier'] },
    ],
    validate: (r) => !r.name ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : !r.price ? 'Precio requerido' : null,
    transform: (r, cid) => ({ company_id: cid, name: r.name, sku: r.sku, category: r.category||null, brand: r.brand||null, price: r.price||0, cost: r.cost||0, stock_quantity: r.stock_quantity||0, stock_min: r.stock_min||0, tax_rate: r.tax_rate??19, type: 'STANDARD', is_active: true, business_context: 'odontologia' }),
  },

  odontologia_servicios: {
    label: 'Servicios Odontológicos', table: 'odonto_servicios', color: '#0ea5e9',
    templateHeaders: ['Nombre *','SKU *','Categoría','Descripción','Precio *','Duración (min)','Activo'],
    templateColWidths: [30,14,20,40,14,14,10],
    templateFn: () => [
      ['Consulta General','SRV-CONS','Consultas','Evaluación clínica completa','50000','30','SI'],
      ['Limpieza Dental','SRV-LIMP','Higiene','Profilaxis y pulido coronal','80000','45','SI'],
      ['Resina Simple','SRV-RES1','Restauraciones','Composite una superficie','120000','45','SI'],
      ['Extracción Simple','SRV-EXT','Cirugía','Extracción sin complicaciones','80000','30','SI'],
      ['Blanqueamiento','SRV-BLAN','Estética','Blanqueamiento LED','300000','90','SI'],
    ],
    columns: [
      { key: 'nombre', aliases: ['nombre','name'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'categoria', aliases: ['categoría','categoria'] },
      { key: 'descripcion', aliases: ['descripción','descripcion'] },
      { key: 'precio', aliases: ['precio *','precio'], required: true, type: 'number' },
      { key: 'duracion_min', aliases: ['duración (min)','duracion'], type: 'int' },
      { key: 'activo', aliases: ['activo'] },
    ],
    validate: (r) => !r.nombre ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : !r.precio ? 'Precio requerido' : null,
    transform: (r, cid) => ({ company_id: cid, nombre: r.nombre, sku: r.sku, categoria: r.categoria||null, descripcion: r.descripcion||null, precio: r.precio||0, duracion_min: r.duracion_min||30, activo: String(r.activo||'SI').toUpperCase()!=='NO' }),
  },

  odontologia_personal: {
    label: 'Personal Odontológico', table: 'odonto_personal', color: '#0ea5e9',
    templateHeaders: ['Nombre *','Documento *','Tipo *','Especialidad','Teléfono','Correo','Estado','Registro Profesional'],
    templateColWidths: [28,14,16,22,14,28,10,18],
    templateFn: () => [
      ['Dra. Ana López','52456789','ODONTOLOGO','General','3201234567','ana@clinica.com','ACTIVO','TP-12345'],
      ['Dr. Carlos Pérez','80123456','ODONTOLOGO','Endodoncia','3157654321','carlos@clinica.com','ACTIVO','TP-23456'],
      ['María Rodríguez','36789012','RECEPCION','','3113456789','maria@clinica.com','ACTIVO',''],
    ],
    columns: [
      { key: 'nombre', aliases: ['nombre','name'], required: true },
      { key: 'documento', aliases: ['documento'], required: true },
      { key: 'tipo', aliases: ['tipo *','tipo'], required: true },
      { key: 'especialidad', aliases: ['especialidad'] },
      { key: 'telefono', aliases: ['teléfono','telefono'] },
      { key: 'correo', aliases: ['correo','email'] },
      { key: 'estado', aliases: ['estado'] },
      { key: 'registro_profesional', aliases: ['registro profesional'] },
    ],
    validate: (r) => !r.nombre ? 'Nombre requerido' : !r.documento ? 'Documento requerido' : null,
    transform: (r, cid) => ({ company_id: cid, nombre: r.nombre, documento: r.documento, tipo: (r.tipo||'ASISTENTE').toUpperCase(), especialidad: r.especialidad||null, telefono: r.telefono||null, correo: r.correo||null, estado: (r.estado||'ACTIVO').toUpperCase(), registro_profesional: r.registro_profesional||null }),
  },

  // ── VETERINARIA ──────────────────────────────────────────────────────────
  veterinaria_medicamentos: {
    label: 'Medicamentos Veterinarios', table: 'vet_medicamentos', color: '#10b981',
    templateHeaders: ['Nombre *','Tipo *','Presentación','Precio Venta *','Stock','Stock Mínimo','Laboratorio'],
    templateColWidths: [32,18,20,14,10,12,22],
    templateFn: () => [
      ['Amoxicilina 250mg x100','Antibiótico','Tabletas x100','22000','50','10','Labfarve'],
      ['Ivermectina 1% 50ml','Antiparasitario','Frasco x50ml','35000','15','3','MSD'],
      ['Vacuna Canina Múltiple','Vacuna','Frasco + diluyente','35000','25','5','MSD'],
      ['Meloxicam 1mg x30','Analgésico','Tabletas x30','32000','20','4','Boehringer'],
      ['Frontline Pipeta Grande','Antipulgas','Pipeta x1','55000','15','3','Boehringer'],
    ],
    columns: [
      { key: 'nombre', aliases: ['nombre','name'], required: true },
      { key: 'tipo', aliases: ['tipo *','tipo','type'], required: true },
      { key: 'presentacion', aliases: ['presentación','presentacion'] },
      { key: 'precio', aliases: ['precio venta *','precio venta','precio'], required: true, type: 'number' },
      { key: 'stock', aliases: ['stock'], type: 'int' },
      { key: 'stock_minimo', aliases: ['stock mínimo','stock minimo'], type: 'int' },
      { key: 'laboratorio', aliases: ['laboratorio'] },
    ],
    validate: (r) => !r.nombre ? 'Nombre requerido' : !r.tipo ? 'Tipo requerido' : !r.precio ? 'Precio requerido' : null,
    transform: (r, cid) => ({ company_id: cid, nombre: r.nombre, tipo: r.tipo||'Otro', presentacion: r.presentacion||null, precio: r.precio||0, costo: 0, stock: r.stock||0, stock_minimo: r.stock_minimo||5, laboratorio: r.laboratorio||null }),
  },

  veterinaria_servicios: {
    label: 'Servicios Veterinarios', table: 'vet_servicios', color: '#10b981',
    templateHeaders: ['Nombre *','SKU *','Categoría','Descripción','Precio *','Duración (min)','Activo'],
    templateColWidths: [30,14,20,40,14,14,10],
    templateFn: () => [
      ['Consulta General','SRV-CONS','Consultas','Evaluación clínica general','50000','30','SI'],
      ['Vacunación Canina','SRV-VAC-C','Vacunación','Aplicación vacuna múltiple','35000','15','SI'],
      ['Castración Canino','SRV-CAST','Cirugía','Orquiectomía bilateral','350000','60','SI'],
    ],
    columns: [
      { key: 'nombre', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'categoria', aliases: ['categoría','categoria'] },
      { key: 'descripcion', aliases: ['descripción','descripcion'] },
      { key: 'precio', aliases: ['precio *','precio'], required: true, type: 'number' },
      { key: 'duracion_min', aliases: ['duración (min)','duracion'], type: 'int' },
      { key: 'activo', aliases: ['activo'] },
    ],
    validate: (r) => !r.nombre ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, nombre: r.nombre, sku: r.sku, categoria: r.categoria||null, descripcion: r.descripcion||null, precio: r.precio||0, duracion_min: r.duracion_min||30, activo: String(r.activo||'SI').toUpperCase()!=='NO' }),
  },

  veterinaria_insumos: {
    label: 'Insumos Veterinarios', table: 'products', color: '#10b981',
    templateHeaders: ['Nombre *','SKU *','Categoría','Precio Venta *','Costo *','Stock','Stock Mínimo','Proveedor'],
    templateColWidths: [30,14,18,14,12,10,12,22],
    templateFn: () => [
      ['Jeringa 3ml x100','INS-VET-JER-3','Desechables','18000','8000','20','4','Insuvet'],
      ['Guantes Latex M x100','INS-VET-GUA-M','Protección','25000','11000','20','4','Insuvet'],
      ['Sutura Nylon 3-0','INS-VET-SUT-NY','Cirugía','30000','14000','10','2','Insuvet'],
    ],
    columns: [
      { key: 'name', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'category', aliases: ['categoría','categoria','tipo'] },
      { key: 'price', aliases: ['precio venta *','precio venta','precio'], required: true, type: 'number' },
      { key: 'cost', aliases: ['costo *','costo'], type: 'number' },
      { key: 'stock_quantity', aliases: ['stock'], type: 'int' },
      { key: 'stock_min', aliases: ['stock mínimo','stock minimo'], type: 'int' },
      { key: 'supplier_name', aliases: ['proveedor','laboratorio'] },
    ],
    validate: (r) => !r.name ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, name: r.name, sku: r.sku, category: r.category||null, price: r.price||0, cost: r.cost||0, stock_quantity: r.stock_quantity||0, stock_min: r.stock_min||3, tax_rate: 19, type: 'STANDARD', is_active: true, business_context: 'veterinaria' }),
  },

  // ── OPTOMETRÍA ───────────────────────────────────────────────────────────
  optometria_monturas: {
    label: 'Monturas', table: 'opto_monturas', color: '#8b5cf6',
    templateHeaders: ['Nombre *','SKU *','Marca','Referencia','Tipo','Color','Precio Venta *','Costo *','Stock','Stock Mínimo'],
    templateColWidths: [28,14,16,16,14,14,14,12,10,12],
    templateFn: () => [
      ['Montura Acetato Cuadrada','OPT-AC-001','Ray-Ban','RB5228','ACETATO','Negro','350000','160000','5','2'],
      ['Montura Metálica Aviador','OPT-MT-001','Oakley','OX5121','METALICO','Dorado','280000','125000','6','2'],
      ['Montura Titanio Minimalista','OPT-TI-001','Silhouette','M4532','TITANIO','Gris','650000','300000','3','1'],
    ],
    columns: [
      { key: 'nombre', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'marca', aliases: ['marca'] },
      { key: 'referencia', aliases: ['referencia'] },
      { key: 'tipo', aliases: ['tipo'] },
      { key: 'color', aliases: ['color'] },
      { key: 'precio', aliases: ['precio venta *','precio venta','precio'], required: true, type: 'number' },
      { key: 'costo', aliases: ['costo *','costo'], type: 'number' },
      { key: 'stock', aliases: ['stock'], type: 'int' },
      { key: 'stock_minimo', aliases: ['stock mínimo','stock minimo'], type: 'int' },
    ],
    validate: (r) => !r.nombre ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, nombre: r.nombre, sku: r.sku, marca: r.marca||null, referencia: r.referencia||null, tipo: (r.tipo||'OTRO').toUpperCase(), color: r.color||null, precio: r.precio||0, costo: r.costo||0, stock: r.stock||0, stock_minimo: r.stock_minimo||2 }),
  },

  optometria_servicios: {
    label: 'Servicios Optométricos', table: 'opto_servicios', color: '#8b5cf6',
    templateHeaders: ['Nombre *','SKU *','Categoría','Descripción','Precio *','Duración (min)','Activo'],
    templateColWidths: [32,14,20,42,14,14,10],
    templateFn: () => [
      ['Examen Visual Completo','OPT-EXAM','Exámenes','Agudeza visual y refracción','60000','45','SI'],
      ['Adaptación LC','OPT-ADAPT-LC','Lentes Contacto','Adaptación de lentes de contacto','80000','40','SI'],
      ['Topografía Corneal','OPT-TOPO','Diagnóstico','Mapeo de curvatura corneal','80000','20','SI'],
    ],
    columns: [
      { key: 'nombre', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'categoria', aliases: ['categoría','categoria'] },
      { key: 'descripcion', aliases: ['descripción','descripcion'] },
      { key: 'precio', aliases: ['precio *','precio'], required: true, type: 'number' },
      { key: 'duracion_min', aliases: ['duración (min)','duracion'], type: 'int' },
      { key: 'activo', aliases: ['activo'] },
    ],
    validate: (r) => !r.nombre ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, nombre: r.nombre, descripcion: `${r.categoria||''} - ${r.descripcion||''}`.trim(), precio: r.precio||0, activo: String(r.activo||'SI').toUpperCase()!=='NO' }),
  },

  optometria_lentes: {
    label: 'Lentes de Contacto', table: 'opto_monturas', color: '#8b5cf6',
    templateHeaders: ['Nombre *','SKU *','Tipo','Uso','Precio Venta *','Costo *','Stock','Stock Mínimo'],
    templateColWidths: [32,14,18,16,14,12,10,12],
    templateFn: () => [
      ['Acuvue Oasys Diarios x30','LC-ACO-D30','CONTACTO','Diario','85000','40000','15','3'],
      ['Air Optix Mensual x3','LC-AOX-M3','CONTACTO','Mensual','90000','42000','10','2'],
      ['Dailies Total1 x30','LC-DT1-30','CONTACTO','Diario','110000','52000','10','2'],
    ],
    columns: [
      { key: 'nombre', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'tipo', aliases: ['tipo'] },
      { key: 'referencia', aliases: ['uso'] },
      { key: 'precio', aliases: ['precio venta *','precio venta','precio'], required: true, type: 'number' },
      { key: 'costo', aliases: ['costo *','costo'], type: 'number' },
      { key: 'stock', aliases: ['stock'], type: 'int' },
      { key: 'stock_minimo', aliases: ['stock mínimo','stock minimo'], type: 'int' },
    ],
    validate: (r) => !r.nombre ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, nombre: r.nombre, sku: r.sku, marca: null, referencia: r.referencia||null, tipo: 'CONTACTO', color: null, precio: r.precio||0, costo: r.costo||0, stock: r.stock||0, stock_minimo: r.stock_minimo||2 }),
  },

  // ── FARMACIA ─────────────────────────────────────────────────────────────
  farmacia_medicamentos: {
    label: 'Medicamentos', table: 'pharma_medications', color: '#ef4444',
    templateHeaders: ['Nombre *','SKU *','Tipo','Presentación','Precio Venta *','Costo *','Stock','Stock Mínimo','Laboratorio','Requiere Fórmula'],
    templateColWidths: [32,14,20,20,14,12,10,12,20,16],
    templateFn: () => [
      ['Acetaminofén 500mg x10','FAR-ACET-500','Analgésico','Tabletas x10','2500','1000','100','20','Genfar','NO'],
      ['Amoxicilina 500mg x20','FAR-AMOX-500','Antibiótico','Cápsulas x20','18000','8000','40','8','Genfar','SI'],
      ['Omeprazol 20mg x14','FAR-OME-20','Antiácido','Cápsulas x14','12000','5500','50','10','Lafrancol','NO'],
      ['Ibuprofeno 400mg x10','FAR-IBU-400','Antiinflamatorio','Tabletas x10','3500','1500','80','15','MK','NO'],
    ],
    columns: [
      { key: 'name', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'category', aliases: ['tipo'] },
      { key: 'presentation', aliases: ['presentación','presentacion'] },
      { key: 'price', aliases: ['precio venta *','precio venta','precio'], required: true, type: 'number' },
      { key: 'cost', aliases: ['costo *','costo'], type: 'number' },
      { key: 'stock_total', aliases: ['stock'], type: 'int' },
      { key: 'stock_min', aliases: ['stock mínimo','stock minimo'], type: 'int' },
      { key: 'laboratory', aliases: ['laboratorio'] },
      { key: 'requires_prescription', aliases: ['requiere fórmula','requiere formula'] },
    ],
    validate: (r) => !r.name ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, name: r.name, sku: r.sku, category: r.category||'General', presentation: r.presentation||null, price: r.price||0, cost: r.cost||0, stock_total: r.stock_total||0, stock_min: r.stock_min||5, laboratory: r.laboratory||null, requires_prescription: String(r.requires_prescription||'NO').toUpperCase()==='SI' }),
  },

  farmacia_otc: {
    label: 'Productos OTC', table: 'pharma_medications', color: '#ef4444',
    templateHeaders: ['Nombre *','SKU *','Categoría','Precio Venta *','Costo *','Stock','Stock Mínimo'],
    templateColWidths: [32,14,20,14,12,10,12],
    templateFn: () => [
      ['Alcohol Antiséptico 250ml','FAR-ALC-250','Antisépticos','8000','3500','40','8'],
      ['Termómetro Digital','FAR-TERM','Equipos','25000','11000','10','2'],
      ['Vendaje Elástico 10cm','FAR-VEND-10','Curaciones','8500','3800','25','5'],
    ],
    columns: [
      { key: 'name', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'category', aliases: ['categoría','categoria'] },
      { key: 'price', aliases: ['precio venta *','precio venta','precio'], required: true, type: 'number' },
      { key: 'cost', aliases: ['costo *','costo'], type: 'number' },
      { key: 'stock_total', aliases: ['stock'], type: 'int' },
      { key: 'stock_min', aliases: ['stock mínimo','stock minimo'], type: 'int' },
    ],
    validate: (r) => !r.name ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, name: r.name, sku: r.sku, category: r.category||'General', presentation: null, price: r.price||0, cost: r.cost||0, stock_total: r.stock_total||0, stock_min: r.stock_min||5, laboratory: null, requires_prescription: false }),
  },

  // ── SALÓN ────────────────────────────────────────────────────────────────
  salon_servicios: {
    label: 'Servicios de Salón', table: 'salon_services', color: '#ec4899',
    templateHeaders: ['Nombre *','SKU *','Categoría','Descripción','Precio *','Duración (min)','Activo'],
    templateColWidths: [30,14,20,40,14,14,10],
    templateFn: () => [
      ['Corte Dama','SAL-COR-D','Cortes','Lavado, corte y peinado','45000','60','SI'],
      ['Tinte Color Plano','SAL-TINT-P','Colorimetría','Tinte un solo tono','90000','120','SI'],
      ['Manicure Permanente','SAL-MAN-P','Manicure','Esmalte semipermanente UV','55000','45','SI'],
    ],
    columns: [
      { key: 'name', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'category', aliases: ['categoría','categoria'] },
      { key: 'description', aliases: ['descripción','descripcion'] },
      { key: 'price', aliases: ['precio *','precio'], required: true, type: 'number' },
      { key: 'duration_minutes', aliases: ['duración (min)','duracion'], type: 'int' },
      { key: 'active', aliases: ['activo'] },
    ],
    validate: (r) => !r.name ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, name: r.name, category: r.category||null, description: r.description||null, price: r.price||0, duration_minutes: r.duration_minutes||30, active: String(r.active||'SI').toUpperCase()!=='NO' }),
  },

  salon_insumos: {
    label: 'Insumos de Salón', table: 'salon_products', color: '#ec4899',
    templateHeaders: ['Nombre *','SKU *','Categoría','Precio Venta *','Costo *','Stock','Stock Mínimo','Proveedor'],
    templateColWidths: [30,14,20,14,12,10,12,22],
    templateFn: () => [
      ['Tinte Igora Royal 60ml','INS-TIN-IG','Tintes','18000','8500','40','8','Schwarzkopf'],
      ['Oxidante 20vol 1L','INS-OXI-20','Oxidantes','22000','10000','20','4','Wella'],
      ['Keratina 1L','INS-KER-1L','Tratamientos','180000','85000','8','2','Cadiveu'],
    ],
    columns: [
      { key: 'name', aliases: ['nombre'], required: true },
      { key: 'sku', aliases: ['sku'], required: true },
      { key: 'category', aliases: ['categoría','categoria'] },
      { key: 'price', aliases: ['precio venta *','precio venta','precio'], required: true, type: 'number' },
      { key: 'cost', aliases: ['costo *','costo'], type: 'number' },
      { key: 'stock', aliases: ['stock'], type: 'int' },
      { key: 'stock_min', aliases: ['stock mínimo','stock minimo'], type: 'int' },
      { key: 'supplier', aliases: ['proveedor','supplier'] },
    ],
    validate: (r) => !r.name ? 'Nombre requerido' : !r.sku ? 'SKU requerido' : null,
    transform: (r, cid) => ({ company_id: cid, name: r.name, sku: r.sku, category: r.category||null, price: r.price||0, cost: r.cost||0, stock: r.stock||0, stock_min: r.stock_min||3, supplier: r.supplier||null }),
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface ImportModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleType: ModuleType;
  companyId: string;
  onSuccess: () => void;
}

interface ParsedRow {
  [key: string]: any;
  _status: 'pending' | 'ok' | 'error';
  _error?: string;
}

// ── Componente ────────────────────────────────────────────────────────────────
const ImportModuleModal: React.FC<ImportModuleModalProps> = ({ isOpen, onClose, moduleType, companyId, onSuccess }) => {
  const config = MODULES[moduleType];
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ ok: 0, errors: 0 });

  if (!isOpen || !config) return null;

  // ── Parsear Excel ───────────────────────────────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Detectar fila de encabezados
      let headerRow = 0;
      for (let i = 0; i < Math.min(5, raw.length); i++) {
        const r = (raw[i] || []).map((c: any) => String(c || '').toLowerCase());
        if (r.some((c: string) => c.includes('nombre') || c.includes('name') || c === 'sku')) {
          headerRow = i; break;
        }
      }

      const headers = (raw[headerRow] || []).map((h: any) => String(h || '').toLowerCase().trim());

      // Mapear columnas
      const colMap: Record<string, number> = {};
      config.columns.forEach(col => {
        const idx = headers.findIndex(h => col.aliases.some(a => h.includes(a.toLowerCase())));
        if (idx >= 0) colMap[col.key] = idx;
      });

      const parsed: ParsedRow[] = [];
      for (let i = headerRow + 1; i < raw.length; i++) {
        const row = raw[i];
        if (!row || row.length === 0) continue;

        const r: ParsedRow = { _status: 'pending' };

        config.columns.forEach(col => {
          const idx = colMap[col.key];
          const raw_val = idx !== undefined ? row[idx] : undefined;
          if (raw_val === undefined || raw_val === null || raw_val === '') {
            r[col.key] = col.type === 'number' || col.type === 'int' ? 0 : null;
          } else if (col.type === 'number') {
            r[col.key] = parseFloat(String(raw_val).replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
          } else if (col.type === 'int') {
            r[col.key] = parseInt(String(raw_val).replace(/[^0-9]/g, '')) || 0;
          } else {
            r[col.key] = String(raw_val).trim();
          }
        });

        // Saltar filas vacías o de instrucciones
        const nameKey = config.columns.find(c => c.required)?.key;
        const nameVal = nameKey ? r[nameKey] : null;
        if (!nameVal || String(nameVal).startsWith('💡') || String(nameVal).startsWith('•')) continue;

        const error = config.validate(r);
        if (error) { r._status = 'error'; r._error = error; }
        parsed.push(r);
      }
      setRows(parsed);
      setDone(false);
      setProgress(0);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ── Importar a Supabase ─────────────────────────────────────────────────
  const handleImport = async () => {
    if (!companyId || rows.length === 0) return;
    setImporting(true);
    let ok = 0; let errors = 0;
    const updated = [...rows];

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      if (row._status === 'error') { errors++; continue; }
      try {
        const payload = config.transform(row, companyId);
        const { error } = await supabase.from(config.table).upsert(payload);
        if (error) { updated[i]._status = 'error'; updated[i]._error = error.message; errors++; }
        else { updated[i]._status = 'ok'; ok++; }
      } catch (err: any) {
        updated[i]._status = 'error'; updated[i]._error = err.message; errors++;
      }
      setProgress(Math.round(((i + 1) / updated.length) * 100));
      setRows([...updated]);
    }

    setStats({ ok, errors });
    setDone(true);
    setImporting(false);
    if (ok > 0) { toast.success(`${ok} registros importados`); onSuccess(); }
    if (errors > 0) toast.error(`${errors} registros con errores`);
  };

  // ── Descargar plantilla ─────────────────────────────────────────────────
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const examples = config.templateFn();
    const notes = [
      [], ['💡 INSTRUCCIONES:'],
      ['• Campos con * son obligatorios'],
      ['• No modificar los encabezados de la primera fila'],
      ['• Eliminar las filas de ejemplo antes de importar (o dejarlas — se ignorarán si el SKU ya existe)'],
      ['• Precios en pesos colombianos sin puntos ni comas'],
    ];
    const wsData = [config.templateHeaders, ...examples, ...notes];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = config.templateColWidths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, config.label);
    XLSX.writeFile(wb, `plantilla_${moduleType}.xlsx`);
  };

  const validRows = rows.filter(r => r._status !== 'error');
  const errorRows = rows.filter(r => r._status === 'error');
  const nameKey = config.columns[0].key;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center" style={{ background: `linear-gradient(135deg, ${config.color}, ${config.color}dd)` }}>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet size={20} /> Importar {config.label}
            </h2>
            <p className="text-white/80 text-xs mt-0.5">Carga masiva desde Excel</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Descargar plantilla */}
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div>
              <p className="font-bold text-blue-800 text-sm">¿Primera vez?</p>
              <p className="text-blue-600 text-xs mt-0.5">Descarga la plantilla con el formato correcto y 3 ejemplos</p>
            </div>
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
              <Download size={15} /> Plantilla Excel
            </button>
          </div>

          {/* Upload */}
          {!done && (
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
              <Upload size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-slate-600 text-sm">Haz clic para seleccionar tu archivo Excel</p>
              <p className="text-slate-400 text-xs mt-1">Formato .xlsx o .xls</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !done && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="px-2 py-1 rounded-lg bg-green-100 text-green-700 font-bold">{validRows.length} válidos</span>
                {errorRows.length > 0 && <span className="px-2 py-1 rounded-lg bg-red-100 text-red-700 font-bold">{errorRows.length} con errores</span>}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-500">Nombre</th>
                      <th className="text-left px-3 py-2 text-slate-500">SKU</th>
                      <th className="text-left px-3 py-2 text-slate-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, i) => (
                      <tr key={i} className={row._status === 'error' ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 font-medium text-slate-700">{row[nameKey] || '-'}</td>
                        <td className="px-3 py-2 text-slate-500 font-mono">{row.sku || '-'}</td>
                        <td className="px-3 py-2">
                          {row._status === 'error'
                            ? <span className="text-red-500 flex items-center gap-1"><XCircle size={12}/> {row._error}</span>
                            : row._status === 'ok'
                              ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12}/> OK</span>
                              : <span className="text-slate-400">Pendiente</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progreso */}
          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span className="flex items-center gap-2"><Loader size={14} className="animate-spin"/> Importando...</span>
                <span className="font-bold">{progress}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: config.color }} />
              </div>
            </div>
          )}

          {/* Resultado */}
          {done && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-2">
              <CheckCircle size={32} className="mx-auto text-green-500" />
              <p className="font-bold text-green-800">{stats.ok} registros importados exitosamente</p>
              {stats.errors > 0 && (
                <p className="text-red-600 text-sm flex items-center justify-center gap-1">
                  <AlertTriangle size={14}/> {stats.errors} registros con errores (revisa la lista)
                </p>
              )}
              <button onClick={() => { setRows([]); setDone(false); fileRef.current && (fileRef.current.value = ''); }}
                className="text-sm text-blue-600 underline">Importar otro archivo</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
            Cerrar
          </button>
          {rows.length > 0 && !done && (
            <button onClick={handleImport} disabled={importing || validRows.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-bold disabled:opacity-50 transition-colors"
              style={{ background: config.color }}>
              {importing ? <><Loader size={14} className="animate-spin"/> Importando...</> : `Importar ${validRows.length} registros`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModuleModal;