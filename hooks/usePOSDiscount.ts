import { useState, useMemo } from 'react';

export function usePOSDiscount(subtotalBruto: number) {
  const [discountMode, setDiscountMode] = useState<'pct' | 'val'>('pct');
  const [globalDiscount, setGlobalDiscount] = useState<string>('');
  const [globalDiscountVal, setGlobalDiscountVal] = useState<string>('');

  const clampedDiscount = useMemo(() => {
    if (discountMode === 'pct') {
      return Math.min(Math.max(parseFloat(globalDiscount) || 0, 0), 100);
    } else {
      const val = parseFloat(globalDiscountVal) || 0;
      if (!subtotalBruto) return 0;
      return Math.min((val / subtotalBruto) * 100, 100);
    }
  }, [discountMode, globalDiscount, globalDiscountVal, subtotalBruto]);

  const handleDiscountPct = (raw: string) => {
    setGlobalDiscount(raw);
    const pct = Math.min(Math.max(parseFloat(raw) || 0, 0), 100);
    if (subtotalBruto)
      setGlobalDiscountVal(
        pct ? String(Math.round((subtotalBruto * pct) / 100)) : ''
      );
  };

  const handleDiscountVal = (raw: string) => {
    setGlobalDiscountVal(raw);
    const val = parseFloat(raw) || 0;
    if (subtotalBruto)
      setGlobalDiscount(
        val ? String(+((val / subtotalBruto) * 100).toFixed(2)) : ''
      );
  };

  const resetDiscount = () => {
    setGlobalDiscount('');
    setGlobalDiscountVal('');
  };

  return {
    discountMode,
    setDiscountMode,
    globalDiscount,
    globalDiscountVal,
    clampedDiscount,
    handleDiscountPct,
    handleDiscountVal,
    resetDiscount,
  };
}