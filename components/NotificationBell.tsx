import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, CheckCheck, Package, FileText, Truck, DollarSign, AlertTriangle } from 'lucide-react';
import { useNotifications, AppNotification } from '../hooks/useNotifications';
import { useNavigate } from 'react-router-dom';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  low_stock:          <Package size={14} className="text-amber-500" />,
  quote_approved:     <FileText size={14} className="text-green-500" />,
  purchase_received:  <Truck size={14} className="text-blue-500" />,
  new_sale:           <DollarSign size={14} className="text-emerald-500" />,
  cash_expense:       <AlertTriangle size={14} className="text-red-400" />,
};

const TYPE_BG: Record<string, string> = {
  low_stock:          'bg-amber-50 border-amber-100',
  quote_approved:     'bg-green-50 border-green-100',
  purchase_received:  'bg-blue-50 border-blue-100',
  new_sale:           'bg-emerald-50 border-emerald-100',
  cash_expense:       'bg-red-50 border-red-100',
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return 'ahora';
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

interface Props { companyId: string | null; fontColor: string; }

const NotificationBell: React.FC<Props> = ({ companyId, fontColor }) => {
  const { notifications, unreadCount, markRead, markAllRead, deleteNotif } = useNotifications(companyId);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = (notif: AppNotification) => {
    markRead(notif.id);
    if (notif.link) {
      setOpen(false);
      window.location.hash = notif.link;
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-white/10"
        style={{ color: fontColor }}
        title="Notificaciones"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 top-10 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[300] overflow-hidden"
          style={{ maxHeight: '70vh' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-slate-600" />
              <span className="font-bold text-sm text-slate-800">Notificaciones</span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {unreadCount} nueva{unreadCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50">
                  <CheckCheck size={12} /> Marcar todas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 56px)' }}>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell size={32} className="text-slate-200 mb-3" />
                <p className="text-slate-400 text-sm font-medium">Sin notificaciones</p>
                <p className="text-slate-300 text-xs mt-1">Te avisaremos cuando algo requiera atención</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 cursor-pointer transition-all hover:bg-slate-50 ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                  onClick={() => handleClick(n)}>

                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 mt-0.5 ${TYPE_BG[n.type] || 'bg-slate-50 border-slate-100'}`}>
                    {TYPE_ICONS[n.type] || <span className="text-sm">{n.icon || '🔔'}</span>}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-bold leading-tight ${!n.is_read ? 'text-slate-800' : 'text-slate-600'}`}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[10px] text-slate-300 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                        <button onClick={e => { e.stopPropagation(); deleteNotif(n.id); }}
                          className="text-slate-200 hover:text-slate-400 p-0.5 rounded">
                          <X size={10} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{n.message}</p>
                    {!n.is_read && (
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
