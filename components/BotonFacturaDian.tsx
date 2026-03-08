import React, { useState } from 'react';
import { emitirFacturaElectronica } from '../services/dianService';

interface Props {
  invoiceId: string;
  tipoVenta: 'general' | 'electronica'; // La lógica que mencionas
}

const BotonFacturaDian: React.FC<Props> = ({ invoiceId, tipoVenta }) => {
  const [cargando, setCargando] = useState(false);

  // Si la configuración del negocio es "General", el botón podría estar oculto o deshabilitado
  if (tipoVenta === 'general') {
    return (
      <div style={{ color: '#666', fontSize: '0.8rem', padding: '10px' }}>
        ℹ️ Venta marcada como Factura General (No reportada a DIAN).
      </div>
    );
  }

  const handleFacturar = async () => {
    const confirmar = window.confirm(
      "Confirmación de Facturación Electrónica:\n\n" +
      "Esta acción enviará los datos a la DIAN y generará un documento legal. ¿Deseas continuar?"
    );
    
    if (!confirmar) return;
    
    setCargando(true);
    const resultado = await emitirFacturaElectronica(invoiceId);
    setCargando(false);

    if (resultado.success) {
      alert("¡Factura reportada exitosamente a la DIAN!");
      window.open(resultado.pdfUrl, '_blank');
      window.location.reload(); 
    } else {
      alert("Error de validación DIAN: " + resultado.error);
    }
  };

  return (
    <button 
      onClick={handleFacturar} 
      disabled={cargando}
      className="btn-primary" // Asumo que usas clases de CSS globales, si no, dejo el style abajo
      style={{
        backgroundColor: cargando ? '#94a3b8' : '#2563eb',
        color: 'white',
        padding: '12px 24px',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 'bold',
        cursor: cargando ? 'not-allowed' : 'pointer',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        transition: 'all 0.2s'
      }}
    >
      {cargando ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
           ⏳ Procesando con la DIAN...
        </span>
      ) : (
        '🚀 Emitir Factura Electrónica'
      )}
    </button>
  );
};

export default BotonFacturaDian;