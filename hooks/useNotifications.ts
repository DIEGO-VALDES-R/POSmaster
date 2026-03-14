import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  icon?: string;
  is_read: boolean;
  created_at: string;
}

export function useNotifications(companyId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications(data || []);
    setLoading(false);
  }, [companyId]);

  // Carga inicial
  useEffect(() => { load(); }, [load]);

  // Realtime subscription — escucha INSERT en notifications
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`notifications-${companyId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        const newNotif = payload.new as AppNotification;
        setNotifications(prev => [newNotif, ...prev.slice(0, 29)]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    if (!companyId) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true })
      .eq('company_id', companyId).eq('is_read', false);
  };

  const deleteNotif = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  };

  return { notifications, unreadCount, loading, markRead, markAllRead, deleteNotif, reload: load };
}
