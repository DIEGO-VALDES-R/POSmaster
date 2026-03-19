import { useState } from 'react';
import { PaymentMethod } from '../types';
import { toast } from 'react-hot-toast';

export function usePOSPayment() {
  const [payments, setPayments] = useState<
    { method: PaymentMethod; amount: number }[]
  >([]);
  const [currentPaymentAmount, setCurrentPaymentAmount] = useState('');
  const [currentPaymentMethod, setCurrentPaymentMethod] =
    useState<PaymentMethod>(PaymentMethod.CASH);
  const [isPartialMode, setIsPartialMode] = useState(false);
  const [shoeRepairId, setShoeRepairId] = useState<string>('');
  const [shoeRepairLabel, setShoeRepairLabel] = useState('');

  const addPayment = (totalAmount: number) => {
    const amount = Math.round(parseFloat(currentPaymentAmount));
    if (!amount || amount <= 0) return;
    if (!isPartialMode && amount > totalAmount * 2 + 100000) {
      toast.error('El monto excede el total restante');
      return;
    }
    setPayments([...payments, { method: currentPaymentMethod, amount }]);
    setCurrentPaymentAmount('');
  };

  const removePayment = (index: number) => {
    const p = [...payments];
    p.splice(index, 1);
    setPayments(p);
  };

  const resetPayments = () => {
    setPayments([]);
    setCurrentPaymentAmount('');
    setCurrentPaymentMethod(PaymentMethod.CASH);
    setIsPartialMode(false);
    setShoeRepairId('');
    setShoeRepairLabel('');
  };

  const addPaypalPayment = (amount: number) => {
    setPayments((prev) => [...prev, { method: PaymentMethod.PAYPAL, amount }]);
  };

  return {
    payments,
    setPayments,
    currentPaymentAmount,
    setCurrentPaymentAmount,
    currentPaymentMethod,
    setCurrentPaymentMethod,
    isPartialMode,
    setIsPartialMode,
    shoeRepairId,
    setShoeRepairId,
    shoeRepairLabel,
    setShoeRepairLabel,
    addPayment,
    removePayment,
    resetPayments,
    addPaypalPayment,
  };
}