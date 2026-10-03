import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Monitor, ShieldAlert, X } from "lucide-react";
import { useHub } from "../store/hub";

interface OSAlertDetail {
  id: string;
  title: string;
  body: string;
  actionTab?: string;
  urgent?: boolean;
  timestamp: number;
}

export default function OSNotificationBeacon() {
  const { setActiveTab } = useHub();
  const [activeAlert, setActiveAlert] = useState<OSAlertDetail | null>(null);

  useEffect(() => {
    const handleOSAlert = (e: Event) => {
      const custom = e as CustomEvent<{
        title: string;
        body: string;
        actionTab?: string;
        urgent?: boolean;
        timestamp: number;
      }>;
      if (custom.detail) {
        const alertObj: OSAlertDetail = {
          id: `os-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: custom.detail.title,
          body: custom.detail.body,
          actionTab: custom.detail.actionTab,
          urgent: custom.detail.urgent,
          timestamp: custom.detail.timestamp || Date.now(),
        };
        setActiveAlert(alertObj);

        // Auto-dismiss after 4.5 seconds
        const timer = setTimeout(() => {
          setActiveAlert((current) => (current?.id === alertObj.id ? null : current));
        }, 4500);

        return () => clearTimeout(timer);
      }
    };

    window.addEventListener("shristi-os-notification-fired", handleOSAlert);
    return () => window.removeEventListener("shristi-os-notification-fired", handleOSAlert);
  }, []);

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[999] flex w-[min(94vw,390px)] flex-col gap-2">
      <AnimatePresence>
        {activeAlert && (
          <motion.div
            key={activeAlert.id}
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 450, damping: 30 }}
            className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${
              activeAlert.urgent
                ? "border-red-500/60 bg-red-950/95 text-white shadow-red-900/30"
                : "border-indigo-500/40 bg-slate-900/95 text-white shadow-indigo-950/40 dark:border-indigo-400/40 dark:bg-ink-950/95"
            }`}
          >
            {/* Visual Indicator Top Banner */}
            <div
              className={`flex items-center justify-between border-b px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                activeAlert.urgent
                  ? "border-red-500/30 bg-red-500/20 text-red-200"
                  : "border-indigo-500/20 bg-indigo-500/20 text-indigo-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                      activeAlert.urgent ? "bg-red-400" : "bg-emerald-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                      activeAlert.urgent ? "bg-red-500" : "bg-emerald-500"
                    }`}
                  />
                </span>
                <span className="flex items-center gap-1">
                  <Monitor className="h-3 w-3" />
                  OS Desktop Alert Dispatched
                </span>
              </div>
              <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-mono text-emerald-400">
                0ms latency
              </span>
            </div>

            {/* Notification Summary */}
            <div className="flex items-start gap-3 p-3.5">
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                  activeAlert.urgent ? "bg-red-500/20 text-red-300" : "bg-indigo-500/20 text-indigo-300"
                }`}
              >
                {activeAlert.urgent ? <ShieldAlert className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">{activeAlert.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-300">{activeAlert.body}</p>

                {activeAlert.actionTab && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(activeAlert.actionTab!);
                      setActiveAlert(null);
                    }}
                    className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${
                      activeAlert.urgent ? "text-red-300 hover:text-red-200" : "text-indigo-300 hover:text-indigo-200"
                    }`}
                  >
                    Open {activeAlert.actionTab}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                aria-label="Dismiss OS alert indicator"
                onClick={() => setActiveAlert(null)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
