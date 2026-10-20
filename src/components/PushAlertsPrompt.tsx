import { useState, useEffect } from 'react';
import { BellRing, X } from 'lucide-react';
import PushAlertsButton from './PushAlertsButton';
import { useHub } from '../store/hub';

export default function PushAlertsPrompt() {
  const { state, user } = useHub();
  const [show, setShow] = useState(false);
  const currentUser = user;

  useEffect(() => {
    // Check if user is signed in
    if (!currentUser) return;
    
    // Check if push is supported
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    // Check if user has already granted or denied permissions
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return;
    }

    // Check if user dismissed it previously
    const dismissed = localStorage.getItem(`shristi_push_dismissed_${currentUser.id}`);
    if (dismissed === 'true') {
      return;
    }

    // If we reach here, we should prompt the user
    setShow(true);
  }, [currentUser]);

  if (!show) return null;

  const handleDismiss = () => {
    if (currentUser) {
      localStorage.setItem(`shristi_push_dismissed_${currentUser.id}`, 'true');
    }
    setShow(false);
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 sm:px-0">
      <div className="bg-slate-900 border border-slate-700 shadow-xl rounded-xl p-4 sm:p-5 flex flex-col gap-3 relative animate-in slide-in-from-top-5 fade-in duration-300">
        <button 
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-200 transition-colors p-1"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        
        <div className="flex gap-3.5 items-center">
          {state.branding.logoUrl ? (
            <img src={state.branding.logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-1.5 object-contain shadow-sm" />
          ) : (
            <div className="text-emerald-400 bg-emerald-500/10 p-2.5 rounded-xl shrink-0">
              <BellRing className="h-6 w-6" />
            </div>
          )}
          <div className="flex-1 pr-4">
            <h4 className="text-sm font-semibold text-slate-100">Enable {state.branding.schoolName} Alerts</h4>
            <p className="text-xs text-slate-400 mt-1">
              Get instantly notified on your lock screen when council tasks or announcements are broadcast.
            </p>
          </div>
        </div>
        
        <div className="mt-1 flex flex-col gap-2">
          <PushAlertsButton />
          <button 
            onClick={handleDismiss}
            className="text-xs font-medium text-slate-500 hover:text-slate-300 py-1.5 transition-colors"
          >
            Never show this again
          </button>
        </div>
      </div>
    </div>
  );
}
