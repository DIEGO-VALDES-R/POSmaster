import { useState, useCallback } from 'react';
import { Product, ProductType } from '../types';

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface CartItem {
  product: Product;
  quantity: number;
  price: number;
  tax_rate: number;
  discount: number;
  weight_kg?: number;
  // Para items virtuales (menú, farmacia, servicios)
  virtualType?: 'menu' | 'bev' | 'pharma' | 'svc';
  virtualId?: string;
  isEdited?: boolean; // Flag para saber si el precio fue editado
}

export interface UseCartOptions {
  sessionStatus?: string;
  defaultTaxRate?: number;
}

export interface UseCartReturn {
  // State
  cart: CartItem[];
  variantPending: Product | null;

  // Setters
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setVariantPending: React.Dispatch<React.SetStateAction<Product | null>>;

  // Actions
  addToCart: (product: Product, variant?: any) => void;
  updateQuantity: (index: number, quantity: number) => void;
  updatePrice: (index: number, newPrice: number) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  addVirtualItem: (type: 'menu' | 'bev' | 'pharma' | 'svc', id: string, name: string, price: number, stock?: number) => void;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER: Calcular descuento por producto según configuración
// ══════════════════════════════════════════════════════════════════════════════

const calcularDescuentoProducto = (product: Product): number => {
  // Si no hay tipo de descuento, no hay descuento
  if (!product.discount_type) {
    return 0;
  }

  // Verificar si el descuento ha expirado
  if (product.discount_expires_at) {
    const expiryDate = new Date(product.discount_expires_at);
    const now = new Date();
    if (now > expiryDate) {
      return 0; // Descuento expirado
    }
  }

  // Calcular descuento según el tipo
  if (product.discount_type === 'pct' && product.discount_pct && product.discount_pct > 0) {
    // Descuento por porcentaje
    const discountAmount = product.price * (product.discount_pct / 100);
    return Math.round(discountAmount);
  }

  if (product.discount_type === 'value' && product.discount_value && product.discount_value > 0) {
    // Descuento por valor fijo
    return Math.min(product.discount_value, product.price); // No puede ser mayor al precio
  }

  return 0;
};

// ══════════════════════════════════════════════════════════════════════════════
// HOOK
// ══════════════════════════════════════════════════════════════════════════════

export function useCart(options: UseCartOptions = {}): UseCartReturn {
  const { sessionStatus, defaultTaxRate = 19 } = options;

  // ── STATE ───────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [variantPending, setVariantPending] = useState<Product | null>(null);

  // ── ACTIONS ─────────────────────────────────────────────────────────────────

  /**
   * Agregar un producto al carrito.
   * Si el producto tiene variantes, abre el selector.
   * Si el producto es serializado, verifica stock.
   * Calcula automáticamente el descuento activo del producto.
   */
  const addToCart = useCallback((product: Product, variant?: any) => {
    // Verificar sesión de caja
    if (sessionStatus !== 'OPEN') {
      console.warn('Caja no abierta');
      return;
    }

    // Si tiene variantes y no se especificó una, abrir selector
    if ((product as any).has_variants && !variant) {
      setVariantPending(product);
      return;
    }

    // Determinar el producto final (con variante si aplica)
    const finalProduct = variant ? { ...product, ...variant } : product;
    const finalPrice = variant?.price || product.price;
    const finalTaxRate = (product as any).tax_rate ?? defaultTaxRate;
    
    // ✅ Calcular descuento del producto
    const discount = calcularDescuentoProducto(finalProduct);

    setCart(prev => {
      // Para productos pesables, verificar si ya existe
      if (product.type === 'WEIGHABLE' as any) {
        return [...prev, {
          product: finalProduct,
          quantity: 1,
          price: finalPrice,
          tax_rate: finalTaxRate,
          discount,
        }];
      }

      // Para productos serializados, siempre agregar uno nuevo
      if (product.type === ProductType.SERIALIZED) {
        return [...prev, {
          product: finalProduct,
          quantity: 1,
          price: finalPrice,
          tax_rate: finalTaxRate,
          discount,
        }];
      }

      // Para productos estándar, incrementar cantidad si ya existe
      const existingIndex = prev.findIndex(
        item => item.product.id === finalProduct.id && !item.virtualType
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        const existing = updated[existingIndex];
        const newQuantity = existing.quantity + 1;
        const maxStock = finalProduct.stock_quantity ?? Infinity;

        updated[existingIndex] = {
          ...existing,
          quantity: Math.min(newQuantity, maxStock),
        };
        return updated;
      }

      // Agregar nuevo producto
      return [...prev, {
        product: finalProduct,
        quantity: 1,
        price: finalPrice,
        tax_rate: finalTaxRate,
        discount,
      }];
    });
  }, [sessionStatus, defaultTaxRate]);

  /**
   * Actualizar la cantidad de un item en el carrito
   */
  const updateQuantity = useCallback((index: number, quantity: number) => {
    setCart(prev => {
      if (index < 0 || index >= prev.length) return prev;

      if (quantity <= 0) {
        return prev.filter((_, i) => i !== index);
      }

      const updated = [...prev];
      const item = updated[index];
      const maxStock = item.product.stock_quantity ?? Infinity;

      updated[index] = {
        ...item,
        quantity: Math.min(quantity, maxStock),
      };

      return updated;
    });
  }, []);

  /**
   * ✅ Actualizar el precio de un item en el carrito
   * Útil para editar precios desde el ticket
   */
  const updatePrice = useCallback((index: number, newPrice: number) => {
    setCart(prev => {
      if (index < 0 || index >= prev.length) return prev;
      if (newPrice < 0) return prev; // No permitir precios negativos

      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        price: newPrice,
        isEdited: true, // Marcar como editado
      };

      return updated;
    });
  }, []);

  /**
   * Eliminar un item del carrito
   */
  const removeFromCart = useCallback((index: number) => {
    setCart(prev => {
      if (index < 0 || index >= prev.length) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  /**
   * Limpiar el carrito completamente
   */
  const clearCart = useCallback(() => {
    setCart([]);
    setVariantPending(null);
  }, []);

  /**
   * Agregar un item virtual (menú restaurante, farmacia, servicios)
   */
  const addVirtualItem = useCallback((
    type: 'menu' | 'bev' | 'pharma' | 'svc',
    id: string,
    name: string,
    price: number,
    stock?: number
  ) => {
    // Crear producto virtual
    const virtualProduct: Product = {
      id: `${type}-${id}`,
      name,
      price,
      cost: 0,
      type: ProductType.SERVICE,
      sku: type.toUpperCase(),
      stock_quantity: stock ?? 999,
    } as Product;

    setCart(prev => {
      // Para items virtuales, siempre agregar uno nuevo
      return [...prev, {
        product: virtualProduct,
        quantity: 1,
        price,
        tax_rate: 0, // Los virtuales generalmente sin IVA
        discount: 0,
        virtualType: type,
        virtualId: id,
      }];
    });
  }, []);

  // ══════════════════════════════════════════════════════════════════════════════
  // RETURN
  // ══════════════════════════════════════════════════════════════════════════════

  return {
    // State
    cart,
    variantPending,

    // Setters
    setCart,
    setVariantPending,

    // Actions
    addToCart,
    updateQuantity,
    updatePrice,
    removeFromCart,
    clearCart,
    addVirtualItem,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ══════════════════════════════════════════════════════════════════════════════

export default useCart;