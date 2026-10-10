import { useState } from 'react';
import { Bell, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useHub } from '../store/hub';
import { enableFirebasePush } from '../lib/firebase-client';

export default function PushAlertsButton() {
  const { user, announce } = useHub();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleEnable = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await enableFirebasePush(user);
      setSuccess(true);
      announce("Push notifications have been enabled for this device!");
    } catch (err: any) {
      console.error(err);
      announce(err.message || "Failed to enable push notifications", "error");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-500">
        <CheckCircle2 className="h-4 w-4" />
        Alerts Enabled
      </div>
    );
  }

  return (
    <button
      onClick={handleEnable}
      disabled={loading}
      className="btn btn-primary w-full text-sm py-2"
    >
      {loading ? (
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <Bell className="h-4 w-4 mr-2" />
      )}
      {loading ? "Enabling..." : "Enable Council Alerts"}
    </button>
  );
}
