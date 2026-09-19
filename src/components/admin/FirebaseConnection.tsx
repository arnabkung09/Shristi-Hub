import { useEffect, useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  CircleCheck,
  Cloud,
  CloudDownload,
  CloudUpload,
  DatabaseZap,
  Download,
  KeyRound,
  Layers3,
  LoaderCircle,
  LogIn,
  Palette,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import {
  firebaseAuth,
  firebaseConfig,
  getVapidKey,
  saveVapidKey,
  testFirebaseConnection,
  PRIMARY_ADMIN_EMAIL,
} from "../../lib/firebase-client";
import { useHub } from "../../store/hub";
import { downloadJson, publicRoster, PRIMARY_ADMIN_ID } from "../../lib/admin";
import { INSTITUTIONAL_EMAIL_DOMAIN } from "../../lib/ssot-auth";
import { HOUSES } from "../../lib/seed";
import { Crest, HouseMark, Modal } from "../ui";

export default function FirebaseConnection() {
  const {
    state,
    announce,
    firebaseStatus,
    firebaseEmail,
    uploadAllToFirestore,
    loadAllFromFirestore,
    signInGoogle,
    setActiveTab,
  } = useHub();

  const [vapid, setVapid] = useState(getVapidKey());
  const [status, setStatus] = useState<"testing" | "connected" | "secured" | "error">("testing");
  const [message, setMessage] = useState("Testing the configured Firebase project...");
  const [syncing, setSyncing] = useState<"upload" | "download" | null>(null);
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [checks, setChecks] = useState<{ label: string; pass: boolean }[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const test = async () => {
    setStatus("testing");
    try {
      const result = await testFirebaseConnection();
      setStatus(result.state);
      setMessage(result.message);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Firebase could not be reached.");
    }
  };

  useEffect(() => {
    void test();
  }, []);

  const savePushKey = async () => {
    try {
      await saveVapidKey(vapid);
      announce(
        vapid.trim()
          ? "Firebase Web Push VAPID key saved to shared Firestore configuration."
          : "Web Push VAPID key removed."
      );
    } catch (error) {
      announce(error instanceof Error ? error.message : "Unable to save VAPID key.", "error");
    }
  };

  const upload = async () => {
    setSyncing("upload");
    try {
      await uploadAllToFirestore();
      const now = new Date().toLocaleTimeString();
      setLastSynced(now);
      announce(
        `All site data including branding (${state.branding.schoolName}), house logos, tasks, and ${state.users.length} roster records were synchronized to Firestore.`
      );
    } catch (error) {
      announce(error instanceof Error ? error.message : "Firestore upload failed.", "error");
    } finally {
      setSyncing(null);
    }
  };

  const download = async () => {
    setConfirmLoad(false);
    setSyncing("download");
    try {
      await loadAllFromFirestore();
      const now = new Date().toLocaleTimeString();
      setLastSynced(now);
      announce("All site data including branding was updated from Firestore.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Firestore download failed.", "error");
    } finally {
      setSyncing(null);
    }
  };

  const runIntegrityChecks = () => {
    const brandingValid =
      Boolean(state.branding.schoolName.trim()) &&
      Boolean(state.branding.boardName.trim()) &&
      Boolean(state.branding.session.trim()) &&
      Boolean(state.branding.footerNote.trim());

    const housesValid = (HOUSES as readonly string[]).every(
      (h) => state.houses[h as keyof typeof state.houses]?.name !== undefined
    );

    const next = [
      {
        label: `Branding & Identity intact (${state.branding.schoolName || "Not configured"})`,
        pass: brandingValid,
      },
      {
        label: `House Branding configured for all 3 houses (Blue, Red, Green)`,
        pass: housesValid,
      },
      {
        label: `Unique roster identities (${state.users.length} students)`,
        pass:
          new Set(state.users.map((u) => u.id)).size === state.users.length &&
          new Set(state.users.map((u) => u.email.toLowerCase())).size === state.users.length,
      },
      {
        label: "All accounts use the institutional email domain",
        pass: state.users.every((u) => u.email.endsWith(INSTITUTIONAL_EMAIL_DOMAIN)),
      },
      {
        label: `Council Hub explicit membership list (${state.councilHubMembers.length} accounts)`,
        pass: state.councilHubMembers.includes(PRIMARY_ADMIN_ID),
      },
      {
        label: "Primary administrator is protected",
        pass: state.users.some(
          (u) =>
            u.id === PRIMARY_ADMIN_ID &&
            u.role === "admin" &&
            u.name === "Arnab Shrestha" &&
            u.grade === 9 &&
            u.house === "Red"
        ),
      },
    ];

    setChecks(next);
    setCheckedAt(new Date().toLocaleTimeString());
    announce(
      next.every((c) => c.pass)
        ? "All local site and branding integrity checks passed."
        : "A site integrity check needs attention.",
      next.every((c) => c.pass) ? "success" : "error"
    );
  };

  const isPrimaryAdminGoogle =
    firebaseEmail?.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();

  return (
    <div className="space-y-6">
      {/* Cloud Status & Project Info */}
      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2>
              <DatabaseZap className="!text-orange-500" />
              Firestore Cloud Synchronization
            </h2>
            <p>
              Synchronize all platform data — branding, house logos, student roster, council
              departments, tasks, events, and settings — directly into Firestore.
            </p>
          </div>
          <span
            className={`status-label ${
              status === "connected" || status === "secured" ? "active" : ""
            }`}
          >
            {status === "testing" && <LoaderCircle className="h-3 w-3 animate-spin" />}
            {status === "connected" || status === "secured" ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Cloud className="h-3 w-3" />
            )}
            {status === "testing"
              ? "Testing"
              : status === "secured"
              ? "Reachable · Auth required"
              : status}
          </span>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="eyebrow">Project ID</p>
              <p className="mt-1 font-mono text-xs">{firebaseConfig.projectId}</p>
            </div>
            <div>
              <p className="eyebrow">Auth domain</p>
              <p className="mt-1 font-mono text-xs">{firebaseConfig.authDomain}</p>
            </div>
            <div>
              <p className="eyebrow">Authenticated Google User</p>
              <p className="mt-1 break-all font-mono text-xs">
                {firebaseEmail ?? "Not signed in"}
              </p>
            </div>
          </div>
          <p
            className={`mt-3 text-[10px] leading-relaxed ${
              status === "error" ? "text-rose-400" : "text-[var(--muted)]"
            }`}
          >
            {message}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="btn btn-secondary"
            onClick={() => void test()}
            disabled={status === "testing"}
          >
            <RefreshCw />
            Test Connection
          </button>
          {!firebaseAuth.currentUser && (
            <button
              className="btn btn-primary"
              onClick={() => {
                void signInGoogle().catch((e) =>
                  announce(e instanceof Error ? e.message : "Google sign-in failed.", "error")
                );
              }}
            >
              <LogIn />
              Sign in with Google
            </button>
          )}
          {firebaseAuth.currentUser && !isPrimaryAdminGoogle && (
            <span className="small-note text-amber-500">
              Note: Full cloud synchronization requires the primary administrator Google account ({PRIMARY_ADMIN_EMAIL}).
            </span>
          )}
        </div>
      </section>

      {/* Branding & House Identity Firestore Sync Status */}
      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2>
              <Palette className="!text-indigo-400" />
              Branding & Identity Payload
            </h2>
            <p>
              All council branding and house configurations are packaged and synchronized into
              the shared Firestore document (<code>hubState/main</code>).
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setActiveTab("admin?section=branding")}
          >
            <Palette />
            Edit Branding
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Council Emblem & Main Info */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
            <div className="flex items-center gap-3">
              <Crest className="h-12 w-12 rounded-lg bg-white p-1" src={state.branding.logoUrl} />
              <div className="min-w-0">
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-500">
                  <Sparkles className="mr-1 inline h-2.5 w-2.5" />
                  Synced to Firestore
                </span>
                <p className="mt-1 font-display text-sm font-bold truncate">
                  {state.branding.schoolName || "Shristi Academy"}
                </p>
                <p className="text-[10px] text-[var(--muted)]">
                  {state.branding.boardName} · {state.branding.session}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3 text-[10px]">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Logo status:</span>
                <strong className="text-[var(--text)]">
                  {state.branding.logoUrl ? (state.branding.logoUrl.startsWith("data:") ? "Custom Image Upload" : "Remote URL") : "Default Crest"}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Portal Tagline:</span>
                <span className="max-w-[200px] truncate text-right text-[var(--text)]" title={state.branding.tagline}>
                  {state.branding.tagline || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Footer Credit:</span>
                <span className="max-w-[200px] truncate text-right text-[var(--text)]" title={state.branding.footerNote}>
                  {state.branding.footerNote || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* House Configurations */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
            <p className="eyebrow mb-2">House Brandings Synced to Cloud</p>
            <div className="space-y-2">
              {(HOUSES as readonly ("Blue" | "Red" | "Green")[]).map((h) => {
                const house = state.houses[h];
                return (
                  <div key={h} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                    <div className="flex items-center gap-2">
                      {house?.logoUrl ? (
                        <img src={house.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                      ) : (
                        <HouseMark house={h} className="h-6 w-6 !text-[8px]" />
                      )}
                      <div>
                        <strong className="text-xs">{house?.name ? `${house.name} House` : `${h} House`}</strong>
                        <span className="block text-[9px] text-[var(--muted)]">{h} House</span>
                      </div>
                    </div>
                    <span className="text-[9px] font-semibold text-[var(--green)]">
                      {house?.logoUrl ? "Custom Logo" : "Default Mark"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Main Site Data Sync Hub */}
      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2>
              <CloudUpload className="!text-[var(--purple)]" />
              Full Site Data Synchronization
            </h2>
            <p>
              <strong>Save</strong> stores the complete site state — branding, house logos,
              student roster, council settings, tasks, events, polls, and every other section —
              into the shared Firestore document (<code>hubState/main</code>). Any future version
              of this site you deploy automatically loads this saved data the moment an
              administrator signs in, so your configuration carries across deploys.
            </p>
          </div>
          {lastSynced && (
            <span className="status-label active">
              <CircleCheck className="h-3 w-3" /> Last Synced: {lastSynced}
            </span>
          )}
        </div>

        {/* Site Data Breakdown Grid */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <Palette className="h-3.5 w-3.5 text-indigo-400" />
              Branding & House Identity
            </span>
            <strong className="text-[10px] text-emerald-400">Included (Logo + 3 Houses)</strong>
          </div>
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <Users className="h-3.5 w-3.5 text-blue-400" />
              Student Roster & Accounts
            </span>
            <strong className="text-[10px]">{state.users.length} accounts</strong>
          </div>
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <Shield className="h-3.5 w-3.5 text-purple-400" />
              Council Hub Members
            </span>
            <strong className="text-[10px]">{state.councilHubMembers.length} explicit members</strong>
          </div>
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
              Task Management Board
            </span>
            <strong className="text-[10px]">{state.tasks.length} tasks</strong>
          </div>
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <Building2 className="h-3.5 w-3.5 text-amber-400" />
              Council Departments
            </span>
            <strong className="text-[10px]">{state.departments.length} departments</strong>
          </div>
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <Calendar className="h-3.5 w-3.5 text-rose-400" />
              Calendar Events & Notices
            </span>
            <strong className="text-[10px]">{state.events.length} events / {state.announcements.length} notices</strong>
          </div>
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              Polls, Suggestions & Ratings
            </span>
            <strong className="text-[10px]">{state.polls.length} polls / {state.siteRatings.length} ratings</strong>
          </div>
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <Wallet className="h-3.5 w-3.5 text-teal-400" />
              Finance Ledger & Meetings
            </span>
            <strong className="text-[10px]">{state.finances.length} transactions / {state.meetings.length} meetings</strong>
          </div>
          <div className="integration-row !py-2">
            <span className="flex items-center gap-2 text-xs">
              <Layers3 className="h-3.5 w-3.5 text-orange-400" />
              Active Images & Gallery
            </span>
            <strong className="text-[10px]">{state.activeImageIds.length} active / {state.gallery.length} items</strong>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            disabled={firebaseStatus !== "connected" || syncing !== null}
            onClick={() => setConfirmSave(true)}
          >
            {syncing === "upload" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CloudUpload />
            )}
            Save all site data to Firestore
          </button>
          <button
            className="btn btn-secondary"
            disabled={firebaseStatus !== "connected" || syncing !== null}
            onClick={() => setConfirmLoad(true)}
          >
            {syncing === "download" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CloudDownload />
            )}
            Load existing Firestore data
          </button>
        </div>

        {firebaseStatus !== "connected" && (
          <p className="mt-3 text-[10px] text-amber-400">
            Sign in with the primary administrator Google account ({PRIMARY_ADMIN_EMAIL}) to synchronize site data with Firestore.
          </p>
        )}
      </section>

      {/* Pre-Sync Integrity & Diagnostics */}
      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2>
              <ShieldCheck className="!text-emerald-400" />
              Site Data & Roster Integrity
            </h2>
            <p>Inspect local state integrity before syncing, or export an offline credential-free snapshot.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={runIntegrityChecks}>
            <ShieldCheck />
            Run integrity check
          </button>
          <button
            className="btn btn-secondary"
            onClick={() =>
              downloadJson("shristi-site-snapshot.json", {
                school: state.branding.schoolName || "Shristi Academy",
                exportedAt: new Date().toISOString(),
                branding: state.branding,
                houses: state.houses,
                departments: state.departments,
                tasks: state.tasks,
                totalStudents: state.users.length,
                students: publicRoster(state.users),
              })
            }
          >
            <Download />
            Export full site snapshot
          </button>
        </div>

        {checks.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {checks.map((check) => (
              <div key={check.label} className="integration-row !py-2">
                <span className="text-xs">{check.label}</span>
                <strong className={check.pass ? "text-[var(--green)]" : "text-rose-400"}>
                  {check.pass ? "Passed" : "Failed"}
                </strong>
              </div>
            ))}
            {checkedAt && <p className="small-note mt-2">Last verified at {checkedAt}</p>}
          </div>
        )}
      </section>

      {/* Web Push VAPID Key Configuration */}
      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2>
              <KeyRound className="!text-[var(--purple)]" />
              Web Push VAPID Public Key
            </h2>
            <p>
              Public key generated in Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.
            </p>
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <input
            className="control flex-1 font-mono text-xs"
            type="password"
            autoComplete="off"
            value={vapid}
            onChange={(event) => setVapid(event.target.value)}
            placeholder="B... public VAPID key"
          />
          <button className="btn btn-primary" onClick={() => void savePushKey()}>
            <Save />
            Save key
          </button>
        </div>

        <p className="inline-message mt-4 flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>The web configuration and VAPID key are public client identifiers. Never paste a private service-account key into this app.</span>
        </p>
      </section>

      {/* Confirmation Modal for Restore */}
      <Modal
        open={confirmLoad}
        onClose={() => setConfirmLoad(false)}
        title="Load existing Firestore data?"
        icon={<CloudDownload />}
        subtitle="This replaces the current browser's local state and branding with the current cloud document."
      >
        <p className="inline-message">
          Unsynchronized local changes may be overwritten by the Firestore version. The current Firebase session and theme preference are preserved.
        </p>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={() => setConfirmLoad(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void download()}>
            <CloudDownload />
            Load and replace local data
          </button>
        </div>
      </Modal>

      {/* Confirmation Modal for Save (store all site data in Firestore) */}
      <Modal
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        title="Save all site data to Firestore?"
        icon={<CloudUpload />}
        subtitle="This overwrites the shared cloud copy with your current local site data."
      >
        <p className="inline-message">
          Every section of the site — branding, house logos, the full student roster, council
          departments, tasks, events, polls, suggestions, finances, gallery, and settings — will
          be written to <code>hubState/main</code>. Any future version of this site you deploy
          will automatically load this saved data as soon as an administrator signs in, so your
          configuration survives the update.
        </p>
        <p className="inline-message mt-3 flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>You must be signed in with the primary administrator Google account ({PRIMARY_ADMIN_EMAIL}) to write to Firestore.</span>
        </p>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={() => setConfirmSave(false)}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={syncing !== null}
            onClick={() => {
              setConfirmSave(false);
              void upload();
            }}
          >
            <CloudUpload />
            Save to Firestore
          </button>
        </div>
      </Modal>
    </div>
  );
}