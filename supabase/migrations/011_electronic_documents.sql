-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011: Facturación electrónica Factus/DIAN
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabla de documentos electrónicos emitidos
CREATE TABLE IF NOT EXISTS electronic_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id          UUID REFERENCES invoices(id) ON DELETE SET NULL,
  document_type    TEXT NOT NULL DEFAULT 'FEV', -- FEV | POS | NC
  cufe             TEXT,
  qr_data          TEXT,
  status           TEXT NOT NULL DEFAULT 'PENDING',
  -- Factus metadata
  factus_bill_id   TEXT,
  factus_number    TEXT,
  pdf_url          TEXT,
  xml_url          TEXT,
  dian_response    JSONB,
  -- Timestamps
  sent_at          TIMESTAMPTZ,
  validated_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sale_id)
);

-- Columnas adicionales en invoices para DIAN (si no existen)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS dian_cufe    TEXT,
  ADD COLUMN IF NOT EXISTS dian_qr_data TEXT,
  ADD COLUMN IF NOT EXISTS notes        TEXT;

-- Columna city en customers (para municipio en Factus)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS document_type    TEXT DEFAULT 'CC';

-- RLS
ALTER TABLE electronic_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company docs" ON electronic_documents;
CREATE POLICY "Company docs" ON electronic_documents
  FOR ALL USING (company_id = get_auth_company_id());

-- Índices
CREATE INDEX IF NOT EXISTS idx_edocs_company   ON electronic_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_edocs_sale      ON electronic_documents(sale_id);
CREATE INDEX IF NOT EXISTS idx_edocs_status    ON electronic_documents(status);
CREATE INDEX IF NOT EXISTS idx_invoices_cufe   ON invoices(dian_cufe) WHERE dian_cufe IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_electronic_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_edocs_updated_at ON electronic_documents;
CREATE TRIGGER trig_edocs_updated_at
  BEFORE UPDATE ON electronic_documents
  FOR EACH ROW EXECUTE FUNCTION update_electronic_documents_updated_at();

COMMENT ON TABLE electronic_documents IS 'Registro de facturas electrónicas enviadas a Factus/DIAN';
COMMENT ON COLUMN electronic_documents.document_type IS 'FEV=Factura electrónica venta, POS=Documento equivalente, NC=Nota crédito';
COMMENT ON COLUMN electronic_documents.cufe IS 'Código Único de Factura Electrónica asignado por DIAN';
COMMENT ON COLUMN electronic_documents.status IS 'PENDING|ACCEPTED|REJECTED|SENT_TO_DIAN';
