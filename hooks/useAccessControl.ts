import { useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from 'react-hot-toast';

type Operation =
  | 'team.invite' | 'team.edit' | 'team.delete'
  | 'branch.create' | 'branch.edit'
  | 'sale.create' | 'sale.refund'
  | 'inventory.edit' | 'inventory.delete'
  | 'cash.open' | 'cash.close'
  | 'reports.view'
  | 'settings.edit' | 'settings.branding' | 'settings.dian';

interface AccessResult {
  allowed: boolean;
  reason?: string;
  required_plans?: string[];
  current_plan?: string;
}

export const useAccessControl = () => {
  const checkAccess = useCallback(async (operation: Operation): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('No autenticado'); return false; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-access`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ operation }),
        }
      );

      const result: AccessResult = await response.json();

      if (!result.allowed) {
        if (result.required_plans) {
          toast.error(`Esta función requiere plan ${result.required_plans.join(' o ')} 🔒`);
        } else {
          toast.error(result.reason || 'Acceso denegado');
        }
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error validando acceso:', err);
      // En caso de error de red, permitir (degradación elegante)
      return true;
    }
  }, []);

  return { checkAccess };
};
