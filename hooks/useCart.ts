import { useState, useMemo } from 'react';
import { Product, ProductType, CartItem, PaymentMethod } from '../types';
import { ProductVariant } from '../components/VariantManager';
import { toast } from 'react-hot-toast';

interface UseCartOptions {
  sessionStatus: string | undefined;
  defaultTaxRate: number;
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
          discount: 0,
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
            discount: 0,
            _checkId: checkId,
          } as any,
        ]);
      }
    }
    toast.success('Agregado');
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
      toast.error('Stock maximo alcanzado');
      return;
    }
    item.quantity += delta;
    if (item.quantity <= 0) newCart.splice(index, 1);
    setCart(newCart);
  };

  const removeFromCart = (index: number) => {
    const c = [...cart];
    c.splice(index, 1);
    setCart(c);
  };

  const clearCart = () => setCart([]);

  // Virtual item adders (restaurante, farmacia, specialty, etc.)
  const addVirtualItem = (
    idPrefix: string,
    id: string,
    name: string,
    price: number,
    stockQuantity: number = 999
  ) => {
    if (sessionStatus !== 'OPEN') {
      toast.error('Debe abrir la caja primero');
      return;
    }
    const vp: any = {
      id: `${idPrefix}-${id}`,
      name,
      price,
      type: 'SERVICE',
      sku: `${idPrefix.toUpperCase()}-${id.slice(0, 6)}`,
      stock_quantity: stockQuantity,
      tax_rate: 0,
    };
    const existing = cart.find((c) => c.product.id === vp.id);
    if (existing) {
      if (stockQuantity !== 999 && existing.quantity >= stockQuantity) {
        toast.error('Stock insuficiente');
        return;
      }
      setCart(
        cart.map((c) =>
          c.product.id === vp.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      );
    } else {
      setCart([
        ...cart,
        { product: vp, quantity: 1, price, tax_rate: 0, discount: 0 },
      ]);
    }
    toast.success(`${name} agregado`);
  };

  return {
    cart,
    setCart,
    variantPending,
    setVariantPending,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    addVirtualItem,
  };
}