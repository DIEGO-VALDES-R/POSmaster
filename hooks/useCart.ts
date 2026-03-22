import { useState, useMemo } from 'react';
import { Product, ProductType, CartItem, PaymentMethod } from '../types';
import { ProductVariant } from '../components/VariantManager';
import { toast } from 'react-hot-toast';

interface UseCartOptions {
  sessionStatus: string | undefined;
  defaultTaxRate: number;
}

// ── Calcula el descuento automático de un producto ────────────────────────────
function calcularDescuentoProducto(product: Product): number {
  const hoy = new Date();
  const expires = product.discount_expires_at ? new Date(product.discount_expires_at) : null;

  // Si tiene fecha de vencimiento y ya venció, no aplica
  if (expires && expires < hoy) return 0;

  if (product.discount_type === 'pct' && (product.discount_pct ?? 0) > 0) {
    return Math.round(product.price * ((product.discount_pct ?? 0) / 100));
  }
  if (product.discount_type === 'value' && (product.discount_value ?? 0) > 0) {
    return Math.min(product.discount_value ?? 0, product.price);
  }
  return 0;
}

export function useCart({ sessionStatus, defaultTaxRate }: UseCartOptions) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [variantPending, setVariantPending] = useState<Product | null>(null);

  const addToCart = (product: Product, variantOverride?: ProductVariant) => {
    if (sessionStatus !== 'OPEN') {
      toast.error('Debe abrir la caja primero');
      return;
    }

    if ((product as any).has_variants && !variantOverride) {
      setVariantPending(product);
      return;
    }

    if (product.stock_quantity <= 0 && product.type !== ProductType.SERVICE) {
      toast.error('Producto sin stock');
      return;
    }

    const effectiveProduct = variantOverride
      ? ({
          ...product,
          id: product.id,
          _variant_id: variantOverride.id,
          _variant_name: variantOverride.display_name,
          _variant_sku: variantOverride.sku,
          price: variantOverride.price_override ?? product.price,
          cost: variantOverride.cost_override ?? product.cost,
          stock_quantity: variantOverride.stock_quantity,
          sku: variantOverride.sku,
        } as any)
      : product;

    const checkId = variantOverride
      ? `${product.id}__${variantOverride.id}`
      : product.id;

    // ── Calcular descuento automático del producto ──────────────
    const descuentoAuto = calcularDescuentoProducto(effectiveProduct);

    if (effectiveProduct.type === ProductType.SERIALIZED) {
      const serial = window.prompt(`Ingrese IMEI/Serial para ${effectiveProduct.name}:`);
      if (!serial) return;
      if (
        cart.find(
          (item) =>
            (item as any)._checkId === checkId &&
            item.serial_number === serial
        )
      ) {
        toast.error('Este serial ya esta en el carrito');
        return;
      }
      setCart([
        ...cart,
        {
          product: effectiveProduct,
          quantity: 1,
          serial_number: serial,
          price: effectiveProduct.price,
          tax_rate: defaultTaxRate,
          discount: descuentoAuto,
          _checkId: checkId,
        } as any,
      ]);
    } else {
      const existing = cart.find(
        (item) =>
          (item as any)._checkId === checkId ||
          item.product.id === checkId
      );
      if (existing) {
        if (existing.quantity >= effectiveProduct.stock_quantity) {
          toast.error('Stock insuficiente');
          return;
        }
        setCart(
          cart.map((item) =>
            (item as any)._checkId === checkId ||
            item.product.id === checkId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        );
      } else {
        setCart([
          ...cart,
          {
            product: effectiveProduct,
            quantity: 1,
            price: effectiveProduct.price,
            tax_rate: defaultTaxRate,
            discount: descuentoAuto,
            _checkId: checkId,
          } as any,
        ]);
      }
    }

    // Notificar si se aplicó descuento automático
    if (descuentoAuto > 0) {
      const label = effectiveProduct.discount_label
        ? ` · ${effectiveProduct.discount_label}`
        : '';
      toast.success(`Agregado con descuento${label} ✓`, { icon: '🏷️' });
    } else {
      toast.success('Agregado');
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    if (item.product.type === ProductType.SERIALIZED && delta > 0) {
      toast.error('Escanee la nueva unidad');
      return;
    }
    if (
      delta > 0 &&
      item.quantity >= item.product.stock_quantity &&
      item.product.type !== ProductType.SERVICE
    ) {
      toast.error('Stock insuficiente');
      return;
    }
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      newCart.splice(index, 1);
    } else {
      newCart[index] = { ...item, quantity: newQty };
    }
    setCart(newCart);
  };

  const updateDiscount = (index: number, discount: number) => {
    setCart(cart.map((item, i) => (i === index ? { ...item, discount } : item)));
  };

  const updatePrice = (index: number, price: number) => {
    setCart(cart.map((item, i) => (i === index ? { ...item, price } : item)));
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const clearCart = () => setCart([]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    let discountTotal = 0;

    for (const item of cart) {
      const lineBase     = item.price * item.quantity;
      const lineDiscount = (item.discount || 0) * item.quantity;
      const lineNet      = lineBase - lineDiscount;
      const lineTax      = lineNet * (item.tax_rate / 100);

      subtotal      += lineNet;
      taxAmount     += lineTax;
      discountTotal += lineDiscount;
    }

    return {
      subtotal:      Math.round(subtotal),
      taxAmount:     Math.round(taxAmount),
      discountTotal: Math.round(discountTotal),
      total:         Math.round(subtotal + taxAmount),
    };
  }, [cart]);

  return {
    cart,
    setCart,
    variantPending,
    setVariantPending,
    addToCart,
    updateQuantity,
    updateDiscount,
    updatePrice,
    removeFromCart,
    clearCart,
    totals,
  };
}