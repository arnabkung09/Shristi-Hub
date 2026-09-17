import { useState } from "react";
import { motion } from "framer-motion";
import { LoaderCircle, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useHub } from "../store/hub";
import { Crest } from "./ui";

export default function Login() {
  const { state, signInGoogle, firebaseStatus } = useHub();
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setError(null);
    try {
      await signInGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  };

  const working = firebaseStatus === "connecting";

  return (
    <div className="flex min-h-screen bg-slate-950 lg:grid lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(59,130,246,0.18),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "repeating-linear-gradient(115deg, rgba(255,255,255,0.09) 0 1px, transparent 1px 90px)" }} />
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative flex items-center gap-4">
          <Crest className="h-14 w-14 rounded-xl bg-white/90 p-1" src={state.branding.logoUrl} />
          <div>
            <p className="font-display text-lg font-bold text-white">{state.branding.schoolName}</p>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-300/80">{state.branding.boardName} · {state.branding.session}</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15 }} className="relative">
          <h1 className="font-display text-4xl font-extrabold leading-tight text-white xl:text-5xl">
            {state.branding.schoolName}
            <span className="block text-indigo-300">Student Council.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300/90">
            One sign-in checks your Google email against the official roster. Students, teachers, and council members land in the same hub.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
            {[
              { icon: <Users className="h-4 w-4" />, k: String(state.users.length), v: "Roster accounts" },
              { icon: <ShieldCheck className="h-4 w-4" />, k: "3", v: "House hubs" },
              { icon: <Sparkles className="h-4 w-4" />, k: "Live", v: "Council chat" },
            ].map((item) => (
              <div key={item.v} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur">
                <span className="text-indigo-300">{item.icon}</span>
                <p className="mt-2 font-display text-xl font-bold text-white">{item.k}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400">{item.v}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="relative text-[11px] uppercase tracking-[0.25em] text-slate-500">
          Official domain · @shristiacademy.edu.np
        </p>
      </div>

      <div className="flex min-h-screen w-full items-center justify-center bg-paper-100 px-5 py-10 dark:bg-ink-950">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Crest className="h-11 w-11 rounded-xl bg-white p-1" src={state.branding.logoUrl} />
            <div>
              <p className="font-display text-base font-bold text-slate-900 dark:text-white">{state.branding.schoolName}</p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{state.branding.boardName} · {state.branding.session}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-black/[0.06] bg-white p-7 shadow-xl shadow-black/[0.04] dark:border-white/[0.07] dark:bg-ink-900 dark:shadow-none sm:p-8">
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Your Google email is verified against the school roster before access is granted.
            </p>

            <button
              type="button"
              className="btn btn-primary mt-6 w-full !min-h-[48px]"
              onClick={() => void signIn()}
              disabled={working}
            >
              {working ? <LoaderCircle className="animate-spin" /> : <span className="grid h-5 w-5 place-items-center rounded-full bg-white font-bold text-blue-600">G</span>}
              {working ? "Checking roster..." : "Sign in with Google"}
            </button>

            {error && <p className="mt-4 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-red-600 dark:text-red-300">{error}</p>}

            <p className="mt-6 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              Access requires an account on the school roster. Council administrators manage roster emails in the Admin Panel.
            </p>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
            {state.branding.schoolName} · {state.branding.session}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
