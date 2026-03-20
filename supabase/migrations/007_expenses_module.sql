-- ==============================================================================
-- 007 — MÓDULO DE GASTOS OPERATIVOS Y CANAL DE VENTA
-- Ejecutar en Supabase → SQL Editor
-- ==============================================================================

-- ── 1. Canal de venta en facturas ────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS sales_channel text DEFAULT 'LOCAL'
  CHECK (sales_channel IN ('LOCAL','DOMICILIO','APP_RAPPI','APP_IFOOD','APP_UBER','WEB','TELEFONO','OTRO'));

-- ── 2. Categorías de gastos (por empresa) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  color       text DEFAULT '#6366f1',   -- color para gráficas
  icon        text DEFAULT 'receipt',   -- nombre de ícono lucide
  created_at  timestamp with time zone DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_categories_company" ON expense_categories;
CREATE POLICY "expense_categories_company" ON expense_categories
  FOR ALL USING (company_id = get_auth_company_id());

-- Categorías por defecto — se insertan al crear una empresa (trigger o manual)
-- El onboarding puede llamar a esta función:
CREATE OR REPLACE FUNCTION seed_expense_categories(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO expense_categories (company_id, name, color, icon) VALUES
    (p_company_id, 'Arriendo',           '#ef4444', 'home'),
    (p_company_id, 'Servicios Públicos', '#f59e0b', 'zap'),
    (p_company_id, 'Internet / Telefonía','#3b82f6','wifi'),
    (p_company_id, 'Nómina / Sueldos',   '#8b5cf6', 'users'),
    (p_company_id, 'Publicidad',         '#10b981', 'megaphone'),
    (p_company_id, 'Transporte',         '#64748b', 'truck'),
    (p_company_id, 'Mantenimiento',      '#f97316', 'wrench'),
    (p_company_id, 'Impuestos',          '#dc2626', 'landmark'),
    (p_company_id, 'Otros',              '#94a3b8', 'more-horizontal')
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;

-- ── 3. Tabla principal de gastos operativos ───────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                  uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id          uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  branch_id           uuid REFERENCES branches(id) ON DELETE SET NULL,
  category_id         uuid REFERENCES expense_categories(id) ON DELETE SET NULL,

  description         text NOT NULL,
  amount              numeric(14, 2) NOT NULL CHECK (amount > 0),
  expense_date        date NOT NULL DEFAULT CURRENT_DATE,

  -- Recurrencia
  is_recurring        boolean DEFAULT false,
  recurrence_interval text CHECK (recurrence_interval IN ('WEEKLY','MONTHLY','QUARTERLY','ANNUALLY')),

  -- Cuentas por pagar
  due_date            date,
  status              text DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','PAID','OVERDUE','CANCELLED')),
  paid_at             timestamp with time zone,

  -- Soporte y trazabilidad
  receipt_url         text,   -- URL de comprobante en Supabase Storage (futuro)
  notes               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamp with time zone DEFAULT now(),
  updated_at          timestamp with time zone DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_company" ON expenses;
CREATE POLICY "expenses_company" ON expenses
  FOR ALL USING (company_id = get_auth_company_id());

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_expenses_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_expenses_updated_at();

-- Auto-marcar vencidos (llamar periódicamente o desde cron)
CREATE OR REPLACE FUNCTION mark_overdue_expenses()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE expenses
  SET status = 'OVERDUE'
  WHERE status = 'PENDING'
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE;
END;
$$;

-- ── 4. Vista para utilidad bruta real por producto ────────────────────────────
CREATE OR REPLACE VIEW v_product_gross_profit AS
SELECT
  i.company_id,
  i.branch_id,
  ii.product_id,
  p.name          AS product_name,
  p.sku,
  p.category,
  p.cost,
  DATE(i.created_at AT TIME ZONE 'America/Bogota') AS sale_date,
  SUM(ii.quantity)                                 AS units_sold,
  SUM(ii.price * ii.quantity)                      AS revenue,
  SUM(p.cost * ii.quantity)                        AS cogs,
  SUM((ii.price - COALESCE(p.cost, 0)) * ii.quantity) AS gross_profit
FROM invoice_items ii
JOIN invoices  i ON ii.invoice_id = i.id
JOIN products  p ON ii.product_id = p.id
WHERE i.status NOT IN ('CANCELLED', 'VOID')
GROUP BY i.company_id, i.branch_id, ii.product_id, p.name, p.sku, p.category, p.cost,
         DATE(i.created_at AT TIME ZONE 'America/Bogota');

-- ── 5. Vista para horas pico ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_sales_by_hour AS
SELECT
  company_id,
  branch_id,
  DATE(created_at AT TIME ZONE 'America/Bogota') AS sale_date,
  EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Bogota')::int AS hour_of_day,
  EXTRACT(DOW  FROM created_at AT TIME ZONE 'America/Bogota')::int AS day_of_week,
  COUNT(*)             AS invoice_count,
  SUM(total_amount)    AS total_sales
FROM invoices
WHERE status NOT IN ('CANCELLED', 'VOID')
GROUP BY company_id, branch_id,
         DATE(created_at AT TIME ZONE 'America/Bogota'),
         EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Bogota'),
         EXTRACT(DOW  FROM created_at AT TIME ZONE 'America/Bogota');

-- ── 6. Índices de rendimiento ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expenses_company_date   ON expenses (company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status         ON expenses (status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_expenses_due_date       ON expenses (due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_sales_channel  ON invoices (company_id, sales_channel);
