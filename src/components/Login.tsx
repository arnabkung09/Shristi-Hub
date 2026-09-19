import { useState } from "react";
import { motion } from "framer-motion";
import {
  Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldAlert, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import { DEVELOPMENT_BUILD, useHub } from "../store/hub";
import { Crest } from "./ui";

type LoginMode = "google" | "password";

export default function Login() {
  const { state, signInGoogle, signInPassword, signInDirect, firebaseStatus, announce } = useHub();
  const [mode, setMode] = useState<LoginMode>("google");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  const handlePasswordSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    const rawId = identifier.trim().toLowerCase();
    if (!rawId) {
      setError("Please enter your school email, ID, or verified alias.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      // Find matching user by email, ID, or aliases
      const targetUser = state.users.find(
        (u) =>
          u.email.toLowerCase() === rawId ||
          u.id.toLowerCase() === rawId ||
          (u.aliases ?? []).some((a) => a.toLowerCase() === rawId)
      );

      if (!targetUser) {
        throw new Error("No account found matching this email or ID on the school roster.");
      }

      // Check if signing in with an added alias email
      const isAlias =
        targetUser.email.toLowerCase() !== rawId &&
        (targetUser.aliases ?? []).some((a) => a.toLowerCase() === rawId);

      const isVerified =
        !isAlias || (targetUser.verifiedAliases ?? []).includes(rawId);

      if (isAlias && !isVerified) {
        setAliasPending({ aliasEmail: rawId, schoolEmail: targetUser.email });
        announce("Ask a council administrator to confirm this email on the school roster.");
        return;
      }

      // If verified or using primary school email, proceed with password verification
      await signInPassword(rawId, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please verify credentials.");
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
                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Sign in
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Select your authentication method to access the council hub.
                </p>

                {/* Sign-in Mode Tabs */}
                <div className="mt-5 flex rounded-xl border border-black/[0.08] bg-black/[0.02] p-1 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <button
                    type="button"
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                      mode === "google"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-ink-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                    onClick={() => setMode("google")}
                  >
                    Google Workspace
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                      mode === "password"
                        ? "bg-white text-slate-900 shadow-sm dark:bg-ink-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                    onClick={() => setMode("password")}
                  >
                    School ID / Password
                  </button>
                </div>

                {mode === "google" ? (
                  <div className="mt-6 space-y-4">
                    <button
                      type="button"
                      className="btn btn-primary w-full !min-h-[48px]"
                      onClick={() => void handleGoogleSignIn()}
                      disabled={working}
                    >
                      {working ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-white font-bold text-blue-600">
                          G
                        </span>
                      )}
                      {working ? "Verifying Google token..." : "Sign in with Google"}
                    </button>
                    <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                      Google OAuth verifies your institutional address against the school roster.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordSignIn} className="mt-5 space-y-3.5">
                    <label className="form-field">
                      <span>School Email, ID, or Verified Alias</span>
                      <div className="relative">
                        <input
                          required
                          type="text"
                          className="control !pl-9"
                          placeholder="e.g. 72019arnab@shristiacademy.edu.np"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                        />
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      </div>
                    </label>

                    <label className="form-field">
                      <span>Password</span>
                      <div className="relative">
                        <input
                          required
                          type={showPassword ? "text" : "password"}
                          className="control !pl-9 !pr-10"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <button
                          type="button"
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </label>

                    <button
                      type="submit"
                      disabled={working}
                      className="btn btn-primary w-full !min-h-[44px] mt-2"
                    >
                      {working ? <LoaderCircle className="animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {working ? "Authenticating..." : "Sign in to Hub"}
                    </button>
                  </form>
                )}

                {error && (
                  <p className="mt-4 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-red-600 dark:text-red-300">
                    {error}
                  </p>
                )}

                {DEVELOPMENT_BUILD && (
                  /* Local preview builds only: pick a roster account without a Firebase
                     session. Production builds render nothing here and refuse the call. */
                  <div className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/[0.08]">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Development sign-in · this build only
                    </span>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {state.users.filter((account) => account.status === "active").slice(0, 6).map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface-inset)] px-2 py-1.5 text-left text-[10px] font-semibold transition-colors hover:border-accent"
                          onClick={() => {
                            try {
                              signInDirect(account.id);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Unable to open that account.");
                            }
                          }}
                        >
                          {account.name.split(" ")[0]}
                          <span className="block text-[8px] font-normal text-slate-400">{account.role}</span>
                        </button>
                      ))}
                    </div>
                  </div>
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
