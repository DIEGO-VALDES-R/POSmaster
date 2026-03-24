import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../supabaseClient';

// VES = Bolívar venezolano (soberano)
export type CurrencyCode = 'COP' | 'USD' | 'EUR' | 'VES';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
}

export const CURRENCY_INFO: Record<CurrencyCode, CurrencyInfo> = {
  COP: { code: 'COP', symbol: '$',  name: 'Peso colombiano',    locale: 'es-CO', decimals: 0 },
  USD: { code: 'USD', symbol: 'US$',name: 'Dólar americano',    locale: 'en-US', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€',  name: 'Euro',               locale: 'es-ES', decimals: 2 },
  VES: { code: 'VES', symbol: 'Bs.',name: 'Bolívar venezolano', locale: 'es-VE', decimals: 2 },
};

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  formatMoney: (amountInCOP: number) => string;
  convert: (amountInCOP: number) => number;
  exchangeRates: Record<CurrencyCode, number>;
  setExchangeRate: (code: CurrencyCode, rate: number) => Promise<void>;
  loadingRates: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// Tasas por defecto (1 COP → moneda destino)
// VES: tasa actualizable manualmente porque el BCV cambia a diario
const DEFAULT_RATES: Record<CurrencyCode, number> = {
  COP: 1,
  USD: 0.00024,   // ~1 USD = 4200 COP
  EUR: 0.00022,   // ~1 EUR = 4500 COP
  VES: 0.097,     // ~1 COP = 0.097 Bs. (ajustar según tasa del día BCV/paralelo)
};

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<CurrencyCode>('COP');
  const [rates, setRates] = useState<Record<CurrencyCode, number>>(DEFAULT_RATES);
  const [loadingRates, setLoadingRates] = useState(false);

  // Cargar moneda y tasas desde Supabase config (company config)
  useEffect(() => {
    const cargarConfig = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from('profiles').select('company_id').eq('id', user.id).single();
        if (!profile?.company_id) return;
        const { data: company } = await supabase
          .from('companies').select('config').eq('id', profile.company_id).single();
        if (!company?.config) return;
        const cfg = company.config as any;
        // Cargar moneda guardada
        if (cfg.currency_code && cfg.currency_code in CURRENCY_INFO) {
          setCurrencyState(cfg.currency_code as CurrencyCode);
        }
        // Cargar tasas personalizadas
        const savedRates = { ...DEFAULT_RATES };
        if (cfg.exchange_rate_usd) savedRates.USD = parseFloat(cfg.exchange_rate_usd);
        if (cfg.exchange_rate_eur) savedRates.EUR = parseFloat(cfg.exchange_rate_eur);
        if (cfg.exchange_rate_ves) savedRates.VES = parseFloat(cfg.exchange_rate_ves);
        setRates(savedRates);
      } catch (_) {}
    };
    cargarConfig();
  }, []);

  const setCurrency = (code: CurrencyCode) => {
    setCurrencyState(code);
    // Guardar preferencia en config de la empresa
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('company_id').eq('id', user.id).single().then(({ data: profile }) => {
        if (!profile?.company_id) return;
        supabase.from('companies').select('config').eq('id', profile.company_id).single().then(({ data: company }) => {
          const currentConfig = (company?.config as any) || {};
          supabase.from('companies').update({ config: { ...currentConfig, currency_code: code } }).eq('id', profile.company_id);
        });
      });
    });
  };

  const setExchangeRate = async (code: CurrencyCode, rate: number): Promise<void> => {
    setLoadingRates(true);
    try {
      setRates(prev => ({ ...prev, [code]: rate }));
      // Guardar en config de la empresa
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
      if (!profile?.company_id) return;
      const { data: company } = await supabase.from('companies').select('config').eq('id', profile.company_id).single();
      const currentConfig = (company?.config as any) || {};
      const key = `exchange_rate_${code.toLowerCase()}`;
      await supabase.from('companies').update({ config: { ...currentConfig, [key]: rate.toString() } }).eq('id', profile.company_id);
    } finally {
      setLoadingRates(false);
    }
  };

  const convert = (amountInCOP: number): number => {
    return amountInCOP * (rates[currency] ?? 1);
  };

  const formatMoney = (amountInCOP: number): string => {
    const converted = convert(amountInCOP);
    const info = CURRENCY_INFO[currency];
    try {
      return new Intl.NumberFormat(info.locale, {
        style: 'currency',
        currency: info.code,
        minimumFractionDigits: info.decimals,
        maximumFractionDigits: info.decimals,
      }).format(converted);
    } catch {
      return `${info.symbol}${converted.toLocaleString('es-CO', { minimumFractionDigits: info.decimals, maximumFractionDigits: info.decimals })}`;
    }
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatMoney, convert, exchangeRates: rates, setExchangeRate, loadingRates }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider');
  return context;
};