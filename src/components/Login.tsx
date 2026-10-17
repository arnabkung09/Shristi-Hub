import { useState } from "react";
import { motion } from "framer-motion";
import {
  LoaderCircle, ShieldAlert, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import { useHub } from "../store/hub";
import { Crest } from "./ui";

export default function Login() {
  const { state, signInGoogle, firebaseStatus, announce } = useHub();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // An added (alias) email only works after an administrator confirms it on the roster.
  const [aliasPending, setAliasPending] = useState<{ aliasEmail: string; schoolEmail: string } | null>(null);

  const working = firebaseStatus === "connecting" || loading;

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "ALIAS_NOT_CONFIRMED:<alias>:<school email>" — both values are URI encoded by the
      // store, so an email address never has to survive naive string splitting.
      if (msg.startsWith("ALIAS_NOT_CONFIRMED:")) {
        const [aliasEmail, schoolEmail] = msg.slice("ALIAS_NOT_CONFIRMED:".length).split(":").map((part) => decodeURIComponent(part));
        setAliasPending({ aliasEmail, schoolEmail });
        announce("Ask a council administrator to confirm this email on the school roster.");
        return;
      }
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Left Hero Branding Section */}
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(59,130,246,0.18),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.09) 0 1px, transparent 1px 90px)",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative flex items-center gap-4"
        >
          <Crest className="h-14 w-14 rounded-xl bg-white/90 p-1" src={state.branding.logoUrl} />
          <div>
            <p className="font-display text-lg font-bold text-white">{state.branding.schoolName}</p>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-300/80">
              {state.branding.boardName} · {state.branding.session}
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="relative"
        >
          <h1 className="font-display text-4xl font-extrabold leading-tight text-white xl:text-5xl">
            {state.branding.schoolName}
            <span className="block text-indigo-300">Student Council Hub.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300/90">
            A unified portal for students, teachers, and class accounts. Verified sign-in ensures secure access across Council Hub, House Standings, and Campus Events.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
            {[
              {
                icon: <Users className="h-4 w-4" />,
                k: String(state.users.length),
                v: "Roster accounts",
              },
              { icon: <ShieldCheck className="h-4 w-4" />, k: "3", v: "House hubs" },
              { icon: <Sparkles className="h-4 w-4" />, k: "Live", v: "Council chat" },
            ].map((item) => (
              <div
                key={item.v}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur"
              >
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

      {/* Right Login / Verification Card Section */}
      <div className="flex min-h-screen w-full items-center justify-center bg-paper-100 px-5 py-10 dark:bg-ink-950">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Crest className="h-11 w-11 rounded-xl bg-white p-1" src={state.branding.logoUrl} />
            <div>
              <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                {state.branding.schoolName}
              </p>
              <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
                {state.branding.boardName} · {state.branding.session}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-black/[0.06] bg-white p-7 shadow-xl shadow-black/[0.04] dark:border-white/[0.07] dark:bg-ink-900 dark:shadow-none sm:p-8">
            {aliasPending ? (
              /* An unconfirmed alias cannot sign in by itself: identity changes are made by
                 an administrator on the roster, never by a code the client generates. */
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-500">
                  <ShieldAlert className="h-3.5 w-3.5" /> Administrator Confirmation Needed
                </span>
                <h2 className="mt-3 font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Confirm This Sign-in Email
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  <strong className="font-mono text-slate-800 dark:text-slate-200">{aliasPending.aliasEmail}</strong> is
                  listed as an added sign-in email, but it has not been confirmed yet.
                </p>

                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3.5 text-xs leading-relaxed text-amber-200">
                  <p className="font-semibold text-amber-300">What to do</p>
                  <p className="mt-1">
                    Sign in with the official school account{" "}
                    <strong className="font-mono">{aliasPending.schoolEmail}</strong>, or ask a council administrator to
                    confirm <strong className="font-mono">{aliasPending.aliasEmail}</strong> on the roster
                    (Admin Panel → Students → Login Emails → <em>Verify Now</em>).
                  </p>
                </div>

                <button
                  type="button"
                  className="btn btn-primary mt-5 w-full"
                  onClick={() => { setAliasPending(null); setError(null); }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              /* Standard Login Screen */
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                    <Sparkles className="h-3 w-3" /> Institutional Access
                  </span>
                </div>
                <h2 className="mt-2.5 font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Sign in to House Hub
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Access your account using your institutional Google Workspace or verified Gmail address.
                </p>

                <div className="mt-6 space-y-4">
                  <button
                    type="button"
                    className="btn btn-primary w-full !min-h-[50px] flex items-center justify-center gap-3 text-sm font-semibold shadow-md transition-all hover:scale-[1.01] active:scale-[0.99]"
                    onClick={() => void handleGoogleSignIn()}
                    disabled={working}
                  >
                    {working ? (
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                    ) : (
                      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>{working ? "Connecting with Google..." : "Continue with Google / Gmail"}</span>
                  </button>

                  <div className="rounded-2xl border border-black/[0.06] bg-slate-50/80 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-white/[0.06] dark:bg-ink-800/60 dark:text-slate-400">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Fast & Secure Single Sign-On
                    </p>
                    <p className="mt-1">
                      Sign-in is exclusively managed via Google Authentication. Use your institutional <code className="rounded bg-indigo-50 px-1 py-0.5 font-mono text-[11px] text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">@shristiacademy.edu.np</code> address or registered Gmail account.
                    </p>
                  </div>
                </div>

                {error && (
                  <p className="mt-4 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-red-600 dark:text-red-300">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
            {state.branding.schoolName} · {state.branding.session}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
