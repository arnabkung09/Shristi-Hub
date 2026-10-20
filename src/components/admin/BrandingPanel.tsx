import { useEffect, useState } from "react";
import { FileText, Home, Image, LoaderCircle, RotateCcw, Save, Scale, Type } from "lucide-react";
import { useHub, persistBrandingToCache } from "../../store/hub";
import { DEFAULT_BRANDING, DEFAULT_HOUSES, DEFAULT_LEGAL, renderRichText } from "../../lib/content";
import { HOUSES } from "../../lib/seed";
import type { House, HouseBranding } from "../../lib/types";
import { Crest, HouseMark } from "../ui";

export default function BrandingPanel() {
  const { state, dispatch, announce, saveStateToDatabase } = useHub();
  const [branding, setBranding] = useState(state.branding);
  const [legal, setLegal] = useState(state.legal);
  const [houses, setHouses] = useState<Record<House, HouseBranding>>(state.houses);
  const [error, setError] = useState("");
  const [view, setView] = useState<"terms" | "credits">("terms");

  const [savingBranding, setSavingBranding] = useState(false);
  const [savingHouses, setSavingHouses] = useState(false);
  const [savingLegal, setSavingLegal] = useState(false);

  useEffect(() => {
    setBranding(state.branding);
  }, [state.branding]);

  useEffect(() => {
    setHouses(state.houses);
  }, [state.houses]);

  useEffect(() => {
    setLegal(state.legal);
  }, [state.legal]);

  const saveBranding = async () => {
    try {
      setSavingBranding(true);
      setError("");
      persistBrandingToCache({ branding, houses, legal });
      dispatch({ type: "SET_BRANDING", branding });
      await saveStateToDatabase();
      announce("Council branding updated across all site pages, devices, and saved to MongoDB.", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save branding.");
      announce(e instanceof Error ? e.message : "Unable to save branding to database.", "error");
    } finally {
      setSavingBranding(false);
    }
  };

  const saveLegal = async () => {
    try {
      setSavingLegal(true);
      setError("");
      persistBrandingToCache({ branding, houses, legal });
      dispatch({ type: "SET_LEGAL", legal });
      await saveStateToDatabase();
      announce("Terms and credits updated across all site pages, devices, and saved to MongoDB.", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save content.");
      announce(e instanceof Error ? e.message : "Unable to save legal content to database.", "error");
    } finally {
      setSavingLegal(false);
    }
  };

  const saveHouses = async () => {
    try {
      setSavingHouses(true);
      setError("");
      persistBrandingToCache({ branding, houses, legal });
      (HOUSES as readonly House[]).forEach((h) => {
        dispatch({ type: "SET_HOUSE_BRANDING", house: h, name: houses[h].name, logoUrl: houses[h].logoUrl });
      });
      await saveStateToDatabase();
      announce("House names and logos updated across all site pages, devices, and saved to MongoDB.", "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save house branding.");
      announce(e instanceof Error ? e.message : "Unable to save house branding to database.", "error");
    } finally {
      setSavingHouses(false);
    }
  };

  const onHouseFile = (house: House, file: File | undefined) => {
    if (!file) return;
    if (file.size > 300 * 1024) { setError("Choose a logo smaller than 300 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => { setHouses({ ...houses, [house]: { ...houses[house], logoUrl: String(reader.result) } }); setError(""); };
    reader.onerror = () => setError("Unable to read this file.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5">
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2><Type />Council Identity & Logo</h2>
            <p>Only the logo you add here will appear in the Top Logo, the Home Screen, and Notifications.</p>
          </div>
        </div>
        <div className="form-stack">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {branding.logoUrl ? (
                  <Crest className="h-12 w-12 shrink-0 rounded-lg border border-[var(--border)] bg-white p-1" src={branding.logoUrl} />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[10px] font-bold text-[var(--faint)]">
                    No Logo
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold truncate">{branding.schoolName || "Council name"}</p>
                  <p className="text-[10px] text-[var(--muted)] truncate">{branding.boardName} / {branding.session}</p>
                </div>
              </div>
              {branding.logoUrl && (
                <button
                  type="button"
                  className="text-action !text-[10px] text-rose-500 shrink-0"
                  onClick={() => setBranding({ ...branding, logoUrl: "" })}
                >
                  Remove logo
                </button>
              )}
            </div>

            {/* Live Placement Verification: Top Logo, Home Screen, Notifications */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[var(--border)]">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 flex items-center gap-2">
                {branding.logoUrl ? (
                  <Crest src={branding.logoUrl} className="h-6 w-6 shrink-0 rounded object-contain" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--purple)]">Top Logo</span>
                  <span className="block text-[10px] font-semibold truncate">{branding.schoolName}</span>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 flex items-center gap-2">
                {branding.logoUrl ? (
                  <Crest src={branding.logoUrl} className="h-6 w-6 shrink-0 rounded object-contain" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--purple)]">Home Screen</span>
                  <span className="block text-[10px] font-semibold truncate">{branding.boardName}</span>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 flex items-center gap-2">
                {branding.logoUrl ? (
                  <Crest src={branding.logoUrl} className="h-6 w-6 shrink-0 rounded object-contain" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--purple)]">Notifications</span>
                  <span className="block text-[10px] font-semibold truncate">Push & In-App Alerts</span>
                </div>
              </div>
            </div>
          </div>

          <label className="file-drop"><Image /><strong>Upload your custom logo</strong><span>PNG, JPG, WebP, or SVG up to 500 KB — shown in Top Logo, Home Screen, and Notifications.</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-label="Upload council logo" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 500 * 1024) { setError("Choose a logo smaller than 500 KB."); return; }
              const reader = new FileReader();
              reader.onload = () => { setBranding({ ...branding, logoUrl: String(reader.result) }); setError(""); };
              reader.onerror = () => setError("Unable to read this file.");
              reader.readAsDataURL(file);
            }} />
          </label>
          <label className="form-field"><span>Or logo image URL</span><input className="control" value={branding.logoUrl.startsWith("data:") ? "" : branding.logoUrl} placeholder="https://..." onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })} /></label>
          <div className="form-grid">
            <label className="form-field"><span>Council name</span><input className="control" value={branding.schoolName} maxLength={40} onChange={(e) => setBranding({ ...branding, schoolName: e.target.value })} /></label>
            <label className="form-field"><span>Board line</span><input className="control" value={branding.boardName} maxLength={60} onChange={(e) => setBranding({ ...branding, boardName: e.target.value })} /></label>
          </div>
          <label className="form-field"><span>Session label</span><input className="control" value={branding.session} maxLength={40} onChange={(e) => setBranding({ ...branding, session: e.target.value })} /></label>
          <label className="form-field"><span>Home portal tagline</span><textarea rows={3} className="control resize-y" value={branding.tagline} maxLength={280} onChange={(e) => setBranding({ ...branding, tagline: e.target.value })} /></label>
          <label className="form-field"><span>Footer credit line</span><input className="control" value={branding.footerNote} maxLength={120} onChange={(e) => setBranding({ ...branding, footerNote: e.target.value })} /></label>
          {error && <p role="alert" className="inline-message error">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={savingBranding} onClick={saveBranding}>
              {savingBranding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save />}
              Save branding
            </button>
            <button className="btn btn-secondary" onClick={() => { setBranding({ ...DEFAULT_BRANDING }); setError(""); }}><RotateCcw />Reset to default</button>
          </div>
        </div>
      </section>

      <section className="panel panel-pad">
        <div className="panel-heading"><div><h2><Scale />Terms & Credits Content</h2><p>Edit the pages linked in the footer. Use "## " to start a new heading.</p></div></div>
        <div className="compact-tabs mb-4">
          <button className={view === "terms" ? "active" : ""} onClick={() => setView("terms")}><FileText />Terms & Conditions</button>
          <button className={view === "credits" ? "active" : ""} onClick={() => setView("credits")}><FileText />Credits</button>
        </div>
        <div className="form-stack">
          <label className="form-field"><span>{view === "terms" ? "Terms & conditions" : "Credits page"}</span>
            <textarea rows={14} className="control resize-y font-mono !text-[10px]" value={view === "terms" ? legal.terms : legal.credits} onChange={(e) => setLegal({ ...legal, [view]: e.target.value })} />
          </label>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
            <p className="eyebrow mb-2">Live preview</p>
            {renderRichText(view === "terms" ? legal.terms : legal.credits).map((block) => (
              <div key={block.key} className="mb-3">
                {block.heading && <h3 className="font-display text-xs font-bold">{block.heading}</h3>}
                <p className="mt-1 whitespace-pre-wrap text-[10px] leading-relaxed text-[var(--muted)]">{block.body}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={savingLegal} onClick={saveLegal}>
              {savingLegal ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save />}
              Save content
            </button>
            <button className="btn btn-secondary" onClick={() => setLegal({ ...DEFAULT_LEGAL })}><RotateCcw />Reset to default</button>
          </div>
        </div>
      </section>
    </div>

    <section className="panel panel-pad">
      <div className="panel-heading"><div><h2><Home />House Names & Logos</h2><p>Rename any house and upload its logo. Changes apply to standings, hubs, badges, rosters, and notifications everywhere.</p></div></div>
      <div className="grid gap-4 md:grid-cols-3">
        {(HOUSES as readonly House[]).map((h) => (
          <div key={h} className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
            <div className="flex items-center gap-3">
              {houses[h].logoUrl ? (
                <img src={houses[h].logoUrl} alt={`${houses[h].name} logo preview`} className="house-logo h-12 w-12" />
              ) : (
                <HouseMark house={h} className="h-12 w-12 !rounded-xl text-base" />
              )}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--faint)]">{h} House</p>
                <p className="font-display text-sm font-bold">{houses[h].name ? `${houses[h].name} House` : "—"}</p>
              </div>
            </div>
            <label className="form-field mt-3"><span>Display name</span><input className="control" value={houses[h].name} maxLength={30} onChange={(e) => setHouses({ ...houses, [h]: { ...houses[h], name: e.target.value } })} placeholder={h} /></label>
            <label className="form-field mt-3"><span>Logo image URL</span><input className="control" value={houses[h].logoUrl.startsWith("data:") ? "" : houses[h].logoUrl} placeholder="https://..." onChange={(e) => setHouses({ ...houses, [h]: { ...houses[h], logoUrl: e.target.value } })} /></label>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-[10px] font-semibold text-[var(--muted)] transition-colors hover:border-[var(--purple)] hover:text-[var(--text)]">
              <Image className="h-3.5 w-3.5" /> Upload logo (300 KB max)
              <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => { onHouseFile(h, e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {houses[h].logoUrl && <button className="text-action mt-2 !text-[9px]" onClick={() => setHouses({ ...houses, [h]: { ...houses[h], logoUrl: "" } })}>Remove logo</button>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={savingHouses} onClick={saveHouses}>
          {savingHouses ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save />}
          Save house branding
        </button>
        <button className="btn btn-secondary" onClick={() => setHouses({ Blue: { ...DEFAULT_HOUSES.Blue }, Red: { ...DEFAULT_HOUSES.Red }, Green: { ...DEFAULT_HOUSES.Green } })}><RotateCcw />Reset houses</button>
      </div>
    </section>
    </div>
  );
}
