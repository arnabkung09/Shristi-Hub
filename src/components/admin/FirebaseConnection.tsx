import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, CloudDownload, CloudUpload, DatabaseZap, KeyRound, LoaderCircle, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { firebaseAuth, firebaseConfig, getVapidKey, saveVapidKey, testFirebaseConnection } from "../../lib/firebase-client";
import { useHub } from "../../store/hub";
import { Modal } from "../ui";

export default function FirebaseConnection() {
  const { announce, firebaseStatus, firebaseEmail, uploadAllToFirestore, loadAllFromFirestore } = useHub();
  const [vapid, setVapid] = useState(getVapidKey());
  const [status, setStatus] = useState<"testing" | "connected" | "secured" | "error">("testing");
  const [message, setMessage] = useState("Testing the configured Firebase project...");
  const [syncing, setSyncing] = useState<"upload" | "download" | null>(null);
  const [confirmLoad, setConfirmLoad] = useState(false);

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

  useEffect(() => { void test(); }, []);

  const savePushKey = async () => {
    try {
      await saveVapidKey(vapid);
      announce(vapid.trim() ? "Firebase Web Push VAPID key saved to shared Firestore configuration." : "Web Push VAPID key removed.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Unable to save VAPID key.", "error");
    }
  };

  const upload = async () => {
    setSyncing("upload");
    try { await uploadAllToFirestore(); }
    catch (error) { announce(error instanceof Error ? error.message : "Firestore upload failed.", "error"); }
    finally { setSyncing(null); }
  };

  const download = async () => {
    setConfirmLoad(false);
    setSyncing("download");
    try { await loadAllFromFirestore(); }
    catch (error) { announce(error instanceof Error ? error.message : "Firestore download failed.", "error"); }
    finally { setSyncing(null); }
  };

  return (
    <section className="panel panel-pad">
      <div className="panel-heading">
        <div><h2><DatabaseZap className="!text-orange-500" />Firebase Spark Project</h2><p>Google Auth, free-tier Firestore, Hosting, and FCM receiving are configured. Storage and Functions are not deployed.</p></div>
        <span className={`status-label ${status === "connected" || status === "secured" ? "active" : ""}`}>
          {status === "testing" && <LoaderCircle className="h-3 w-3 animate-spin" />}
          {status === "connected" || status === "secured" ? <CheckCircle2 className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
          {status === "testing" ? "Testing" : status === "secured" ? "Reachable · Auth required" : status}
        </span>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><p className="eyebrow">Project ID</p><p className="mt-1 font-mono text-xs">{firebaseConfig.projectId}</p></div>
          <div><p className="eyebrow">Auth domain</p><p className="mt-1 font-mono text-xs">{firebaseConfig.authDomain}</p></div>
        </div>
        <p className={`mt-3 text-[10px] leading-relaxed ${status === "error" ? "text-rose-400" : "text-[var(--muted)]"}`}>{message}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-secondary" onClick={() => void test()} disabled={status === "testing"}><RefreshCw />Test Firebase</button>
        <span className="small-note">Google user: {firebaseAuth.currentUser?.email ?? "not signed in"}</span>
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-5">
        <div className="flex items-center gap-2"><Cloud className="h-4 w-4 text-[var(--purple)]" /><h3 className="text-xs font-bold">Manual site data synchronization</h3></div>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">Upload writes the complete sanitized site state and roster to Firestore. Load replaces this browser's current site data with `hubState/main` from Firestore.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={firebaseStatus !== "connected" || syncing !== null} onClick={() => void upload()}>{syncing === "upload" ? <LoaderCircle className="animate-spin" /> : <CloudUpload />}Upload all site data</button>
          <button className="btn btn-secondary" disabled={firebaseStatus !== "connected" || syncing !== null} onClick={() => setConfirmLoad(true)}>{syncing === "download" ? <LoaderCircle className="animate-spin" /> : <CloudDownload />}Load existing Firestore data</button>
        </div>
        {firebaseStatus !== "connected" && <p className="mt-2 text-[9px] text-amber-400">Sign in with the primary admin Google account before synchronizing.</p>}
        {firebaseEmail && <p className="mt-2 text-[9px] text-[var(--faint)]">Authenticated as {firebaseEmail}</p>}
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-5">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-[var(--purple)]" /><h3 className="text-xs font-bold">Web Push VAPID public key</h3></div>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">Generate this in Firebase Console → Project Settings → Cloud Messaging → Web Push certificates. This public key is required for browser FCM tokens.</p>
        <div className="mt-3 flex gap-2">
          <input className="control flex-1 font-mono" type="password" autoComplete="off" value={vapid} onChange={(event) => setVapid(event.target.value)} placeholder="B... public VAPID key" />
          <button className="btn btn-primary" onClick={() => void savePushKey()}><Save />Save key</button>
        </div>
      </div>

      <p className="inline-message mt-5 flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>The web configuration and VAPID key are public client identifiers. Never paste a Firebase service-account private key into this app.</span></p>

      <Modal open={confirmLoad} onClose={() => setConfirmLoad(false)} title="Load existing Firestore data?" icon={<CloudDownload />} subtitle="This replaces the current browser's site data with the current cloud document.">
        <p className="inline-message">Unsynchronized local changes may be lost. The current Firebase session and theme are preserved.</p>
        <div className="dialog-actions"><button className="btn btn-secondary" onClick={() => setConfirmLoad(false)}>Cancel</button><button className="btn btn-primary" onClick={() => void download()}><CloudDownload />Load and replace local data</button></div>
      </Modal>
    </section>
  );
}