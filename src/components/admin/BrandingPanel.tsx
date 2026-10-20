import { useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Eye,
  FileText,
  Home,
  Image,
  LoaderCircle,
  RotateCcw,
  Save,
  Scale,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { useHub, persistBrandingToCache, uid } from "../../store/hub";
import { DEFAULT_BRANDING, DEFAULT_HOUSES, DEFAULT_LEGAL, renderRichText } from "../../lib/content";
import { HOUSES } from "../../lib/seed";
import type { Branding, House, HouseBranding, LegalContent } from "../../lib/types";
import { triggerOSNotification } from "../../lib/firebase-client";
import { Crest, HouseMark, compressLogoImage } from "../ui";

const BRANDING_FORM_DRAFT_KEY = "shristi_branding_form_draft_v1";

interface BrandingFormDraft {
  branding: Branding;
  houses: Record<House, HouseBranding>;
  legal: LegalContent;
  isDirty: boolean;
  updatedAt: number;
}

function loadBrandingFormDraft(): BrandingFormDraft | null {
  try {
    const raw = localStorage.getItem(BRANDING_FORM_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrandingFormDraft;
    if (parsed && parsed.isDirty && parsed.branding && parsed.houses && parsed.legal) {
      return parsed;
    }
  } catch {}
  return null;
}

function saveBrandingFormDraft(draft: BrandingFormDraft) {
  try {
    localStorage.setItem(BRANDING_FORM_DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

function clearBrandingFormDraft() {
  try {
    localStorage.removeItem(BRANDING_FORM_DRAFT_KEY);
  } catch {}
}

export default function BrandingPanel() {
  const { state, dispatch, announce, saveStateToDatabase, setActiveTab } = useHub();

  const [initialDraft] = useState<BrandingFormDraft | null>(() => loadBrandingFormDraft());

  const [branding, setBranding] = useState<Branding>(() =>
    initialDraft?.branding
      ? { ...DEFAULT_BRANDING, ...initialDraft.branding }
      : { ...DEFAULT_BRANDING, ...state.branding }
  );

  const [houses, setHouses] = useState<Record<House, HouseBranding>>(() =>
    initialDraft?.houses
      ? {
          Blue: { ...DEFAULT_HOUSES.Blue, ...(initialDraft.houses.Blue || {}) },
          Red: { ...DEFAULT_HOUSES.Red, ...(initialDraft.houses.Red || {}) },
          Green: { ...DEFAULT_HOUSES.Green, ...(initialDraft.houses.Green || {}) },
        }
      : {
          Blue: { ...DEFAULT_HOUSES.Blue, ...(state.houses?.Blue || {}) },
          Red: { ...DEFAULT_HOUSES.Red, ...(state.houses?.Red || {}) },
          Green: { ...DEFAULT_HOUSES.Green, ...(state.houses?.Green || {}) },
        }
  );

  const [legal, setLegal] = useState<LegalContent>(() =>
    initialDraft?.legal
      ? { ...DEFAULT_LEGAL, ...initialDraft.legal }
      : { ...DEFAULT_LEGAL, ...state.legal }
  );

  const [isDirty, setIsDirty] = useState<boolean>(() => Boolean(initialDraft?.isDirty));
  const [error, setError] = useState("");
  const [houseError, setHouseError] = useState("");
  const [legalError, setLegalError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [view, setView] = useState<"terms" | "credits">("terms");

  const [savingBranding, setSavingBranding] = useState(false);
  const [savingHouses, setSavingHouses] = useState(false);
  const [savingLegal, setSavingLegal] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHouse, setUploadingHouse] = useState<House | null>(null);

  const showSavedBanner = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => {
      setSavedNotice((prev) => (prev === msg ? "" : prev));
    }, 5000);
  };

  // Persist current form inputs to browser storage draft immediately so nothing is ever lost or reverted
  const persistDraftState = (
    nextBranding: Branding,
    nextHouses: Record<House, HouseBranding>,
    nextLegal: LegalContent
  ) => {
    setIsDirty(true);
    saveBrandingFormDraft({
      branding: nextBranding,
      houses: nextHouses,
      legal: nextLegal,
      isDirty: true,
      updatedAt: Date.now(),
    });
  };

  const updateBrandingField = (patch: Partial<Branding>) => {
    setBranding((prev) => {
      const next = { ...prev, ...patch };
      persistDraftState(next, houses, legal);
      return next;
    });
  };

  const updateHouseField = (house: House, patch: Partial<HouseBranding>) => {
    setHouses((prev) => {
      const next = {
        ...prev,
        [house]: { ...prev[house], ...patch },
      };
      persistDraftState(branding, next, legal);
      return next;
    });
  };

  const updateLegalField = (patch: Partial<LegalContent>) => {
    setLegal((prev) => {
      const next = { ...prev, ...patch };
      persistDraftState(branding, houses, next);
      return next;
    });
  };

  const discardUnsavedDraft = () => {
    clearBrandingFormDraft();
    setIsDirty(false);
    setError("");
    setHouseError("");
    setLegalError("");
    setBranding({ ...DEFAULT_BRANDING, ...state.branding });
    setHouses({
      Blue: { ...DEFAULT_HOUSES.Blue, ...(state.houses?.Blue || {}) },
      Red: { ...DEFAULT_HOUSES.Red, ...(state.houses?.Red || {}) },
      Green: { ...DEFAULT_HOUSES.Green, ...(state.houses?.Green || {}) },
    });
    setLegal({ ...DEFAULT_LEGAL, ...state.legal });
    announce("Discarded unsaved form draft and restored current saved branding.", "success");
  };

  // Commit all current form state atomically so saving one section never reverts another section
  const commitFormToStoreAndDatabase = async (
    targetBranding: Branding,
    targetHouses: Record<House, HouseBranding>,
    targetLegal: LegalContent,
    customMessage: string,
    sectionSetter: (saving: boolean) => void,
    errorSetter: (msg: string) => void
  ) => {
    try {
      sectionSetter(true);
      errorSetter("");

      const normalizedBranding: Branding = {
        ...targetBranding,
        schoolName: targetBranding.schoolName.trim() || "Student Council",
        boardName: targetBranding.boardName.trim() || "Shristi Academy Board",
        session: targetBranding.session.trim() || "Session 2025-26",
        logoUrl: (targetBranding.logoUrl ?? "").trim(),
        tagline: targetBranding.tagline ?? "",
        footerNote: targetBranding.footerNote ?? "",
      };

      const normalizedHouses: Record<House, HouseBranding> = {
        Blue: {
          name: targetHouses.Blue?.name?.trim() || "Blue",
          logoUrl: (targetHouses.Blue?.logoUrl ?? "").trim(),
        },
        Red: {
          name: targetHouses.Red?.name?.trim() || "Red",
          logoUrl: (targetHouses.Red?.logoUrl ?? "").trim(),
        },
        Green: {
          name: targetHouses.Green?.name?.trim() || "Green",
          logoUrl: (targetHouses.Green?.logoUrl ?? "").trim(),
        },
      };

      const normalizedLegal: LegalContent = {
        terms: targetLegal.terms?.trim() ? targetLegal.terms : DEFAULT_LEGAL.terms,
        credits: targetLegal.credits?.trim() ? targetLegal.credits : DEFAULT_LEGAL.credits,
      };

      setBranding(normalizedBranding);
      setHouses(normalizedHouses);
      setLegal(normalizedLegal);
      clearBrandingFormDraft();
      setIsDirty(false);

      const nowTs = Date.now();
      persistBrandingToCache({
        branding: normalizedBranding,
        houses: normalizedHouses,
        legal: normalizedLegal,
        lastModified: nowTs,
      });

      dispatch({ type: "SET_BRANDING", branding: normalizedBranding });
      (HOUSES as readonly House[]).forEach((h) => {
        dispatch({
          type: "SET_HOUSE_BRANDING",
          house: h,
          name: normalizedHouses[h].name,
          logoUrl: normalizedHouses[h].logoUrl,
        });
      });
      dispatch({ type: "SET_LEGAL", legal: normalizedLegal });

      try {
        await saveStateToDatabase();
      } catch (dbErr) {
        console.warn("Database sync notice (saved locally):", dbErr);
      }

      showSavedBanner(customMessage);
      announce(customMessage, "success");
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unable to save branding changes.";
      errorSetter(errMsg);
      announce(errMsg, "error");
    } finally {
      sectionSetter(false);
    }
  };

  const applyAndSaveBranding = async (nextBranding: Branding, customMessage?: string) => {
    await commitFormToStoreAndDatabase(
      nextBranding,
      houses,
      legal,
      customMessage || "Council branding & logo saved across Top Logo, Home Screen, and Notifications.",
      setSavingBranding,
      setError
    );
  };

  const applyAndSaveHouses = async (nextHouses: Record<House, HouseBranding>, customMessage?: string) => {
    await commitFormToStoreAndDatabase(
      branding,
      nextHouses,
      legal,
      customMessage || "House names and logos saved across all standings, hubs, and badges.",
      setSavingHouses,
      setHouseError
    );
  };

  const applyAndSaveLegal = async (nextLegal: LegalContent, customMessage?: string) => {
    await commitFormToStoreAndDatabase(
      branding,
      houses,
      nextLegal,
      customMessage || "Terms and credits content saved across the platform.",
      setSavingLegal,
      setLegalError
    );
  };

  const saveAllBranding = async () => {
    await commitFormToStoreAndDatabase(
      branding,
      houses,
      legal,
      "All branding, logos, house names, and legal content saved!",
      setSavingBranding,
      setError
    );
  };

  // Stage uploaded Council Logo into the draft without triggering a premature mid-form save
  const handleCouncilLogoUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploadingLogo(true);
    setError("");
    try {
      const optimizedDataUrl = await compressLogoImage(file, 360);
      setBranding((prev) => {
        const next = { ...prev, logoUrl: optimizedDataUrl };
        persistDraftState(next, houses, legal);
        return next;
      });
      showSavedBanner("Logo staged in your form draft — click Save when you finish filling out the form.");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unable to process logo file.";
      setError(errMsg);
      announce(errMsg, "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveCouncilLogo = () => {
    setBranding((prev) => {
      const next = { ...prev, logoUrl: "" };
      persistDraftState(next, houses, legal);
      return next;
    });
    showSavedBanner("Logo removal staged in your form draft — click Save to apply.");
  };

  // Stage uploaded House Logo into the draft without triggering a premature mid-form save
  const handleHouseLogoUpload = async (house: House, file: File | undefined) => {
    if (!file) return;
    setUploadingHouse(house);
    setHouseError("");
    try {
      const optimizedDataUrl = await compressLogoImage(file, 256);
      setHouses((prev) => {
        const nextHouses = {
          ...prev,
          [house]: { ...prev[house], logoUrl: optimizedDataUrl },
        };
        persistDraftState(branding, nextHouses, legal);
        return nextHouses;
      });
      showSavedBanner(`${houses[house]?.name || house} House logo staged in your draft — click Save when ready.`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unable to process house logo.";
      setHouseError(errMsg);
      announce(errMsg, "error");
    } finally {
      setUploadingHouse(null);
    }
  };

  const handleRemoveHouseLogo = (house: House) => {
    setHouses((prev) => {
      const nextHouses = {
        ...prev,
        [house]: { ...prev[house], logoUrl: "" },
      };
      persistDraftState(branding, nextHouses, legal);
      return nextHouses;
    });
    showSavedBanner(`${houses[house]?.name || house} House logo removal staged — click Save to apply.`);
  };

  const handleTestNotificationLogo = async () => {
    const activeLogo = (branding.logoUrl || "").trim();
    const title = `${branding.schoolName || "Student Council"} Branding Verification`;
    const body = activeLogo
      ? "Your custom uploaded logo is active in Notifications, the Home Screen, and the Top Logo."
      : "No custom logo is currently set — notifications display without any fallback logo.";

    dispatch({
      type: "PUSH_NOTIFICATION",
      notification: {
        id: uid(),
        title,
        body,
        urgent: false,
        audience: { kind: "all" },
        senderName: branding.schoolName || "Council",
        senderRole: "admin",
        timestamp: Date.now(),
        actionTab: "home",
        readBy: [],
        kind: "system",
      },
    });

    await triggerOSNotification({
      title,
      body,
      icon: activeLogo || undefined,
      actionTab: "home",
      urgent: false,
    });

    announce("Sent a live test notification using your current branding configuration!", "success");
  };

  return (
    <div className="space-y-5">
      {/* Top Status & Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          {branding.logoUrl ? (
            <Crest
              src={branding.logoUrl}
              className="h-10 w-10 shrink-0 rounded-xl border border-[var(--border)] bg-white p-1"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[9px] font-bold text-[var(--faint)]">
              No Logo
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-display text-sm font-bold text-[var(--text)] truncate">
                {branding.schoolName || "Student Council"}
              </strong>
              <span className="text-[11px] font-medium text-[var(--muted)]">
                · {branding.logoUrl ? "Custom Logo Ready" : "Text-Only Branding (No Logo)"}
              </span>
              {isDirty && (
                <span className="text-[11px] font-semibold text-amber-500">
                  · Unsaved Draft Locked
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--muted)] truncate">
              {branding.boardName} · {branding.session}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <button
              type="button"
              className="btn btn-secondary !min-h-8 !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
              onClick={discardUnsavedDraft}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Discard Draft
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary !min-h-8 !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            onClick={() => void handleTestNotificationLogo()}
          >
            <Bell className="h-3.5 w-3.5" /> Test Notification Logo
          </button>
          <button
            type="button"
            className="btn btn-secondary !min-h-8 !px-3 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            onClick={() => setActiveTab("home")}
          >
            <Eye className="h-3.5 w-3.5" /> View Home Screen
          </button>
          <button
            type="button"
            className="btn btn-primary !min-h-8 !px-3.5 !py-1.5 !text-xs whitespace-nowrap shrink-0"
            disabled={savingBranding || savingHouses || savingLegal}
            onClick={() => void saveAllBranding()}
          >
            {savingBranding || savingHouses || savingLegal ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save All Changes
          </button>
        </div>
      </div>

      {isDirty && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-600 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              <strong>Unsaved draft protected:</strong> Your form inputs and staged logos are locked locally and will never auto-revert. Click <strong>Save All Changes</strong> when you are ready to publish.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary !min-h-7 !px-3 !py-1 !text-[11px] whitespace-nowrap shrink-0"
              disabled={savingBranding || savingHouses || savingLegal}
              onClick={() => void saveAllBranding()}
            >
              Save Now
            </button>
          </div>
        </div>
      )}

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

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
                    <Crest
                      className="h-14 w-14 shrink-0 rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-sm"
                      src={branding.logoUrl}
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[10px] font-bold text-[var(--faint)]">
                      No Logo
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold truncate">
                      {branding.schoolName || "Council name"}
                    </p>
                    <p className="text-[10px] text-[var(--muted)] truncate">
                      {branding.boardName} / {branding.session}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--faint)]">
                      {branding.logoUrl
                        ? "Custom logo staged for Top Logo, Home Screen & Notifications"
                        : "No logo uploaded — default crest is hidden everywhere"}
                    </p>
                  </div>
                </div>
                {branding.logoUrl && (
                  <button
                    type="button"
                    className="btn btn-secondary !min-h-7 !px-2.5 !py-1 !text-[10px] !text-rose-500 shrink-0 whitespace-nowrap"
                    onClick={handleRemoveCouncilLogo}
                  >
                    <Trash2 className="h-3 w-3" /> Remove logo
                  </button>
                )}
              </div>

              {/* Live Placement Verification: Top Logo, Home Screen, Notifications */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[var(--border)]">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 flex items-center gap-2">
                  {branding.logoUrl ? (
                    <Crest src={branding.logoUrl} className="h-6 w-6 shrink-0 rounded object-contain bg-white p-0.5" />
                  ) : null}
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--purple)]">Top Logo</span>
                    <span className="block text-[10px] font-semibold truncate">{branding.schoolName || "Student Council"}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 flex items-center gap-2">
                  {branding.logoUrl ? (
                    <Crest src={branding.logoUrl} className="h-6 w-6 shrink-0 rounded object-contain bg-white p-0.5" />
                  ) : null}
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--purple)]">Home Screen</span>
                    <span className="block text-[10px] font-semibold truncate">{branding.boardName || "Shristi Academy Board"}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 flex items-center gap-2">
                  {branding.logoUrl ? (
                    <Crest src={branding.logoUrl} className="h-6 w-6 shrink-0 rounded object-contain bg-white p-0.5" />
                  ) : null}
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--purple)]">Notifications</span>
                    <span className="block text-[10px] font-semibold truncate">Push & In-App Alerts</span>
                  </div>
                </div>
              </div>
            </div>

            <label className="file-drop cursor-pointer">
              {uploadingLogo ? <LoaderCircle className="animate-spin" /> : <Upload />}
              <strong>{uploadingLogo ? "Optimizing & staging logo..." : "Upload your custom logo"}</strong>
              <span>PNG, JPG, WebP, or SVG (auto-optimized, preserves transparency) — stages in your draft until you click Save.</span>
              <input
                type="file"
                accept="image/*"
                aria-label="Upload council logo"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void handleCouncilLogoUpload(file);
                }}
              />
            </label>

            <label className="form-field">
              <span>Or paste a direct logo image URL</span>
              <div className="flex gap-2">
                <input
                  className="control flex-1"
                  value={branding.logoUrl.startsWith("data:") ? "" : branding.logoUrl}
                  placeholder={branding.logoUrl.startsWith("data:") ? "Uploaded image file staged — paste https:// URL to replace" : "https://..."}
                  onChange={(e) => updateBrandingField({ logoUrl: e.target.value })}
                />
              </div>
            </label>

            <div className="form-grid">
              <label className="form-field">
                <span>Council name</span>
                <input
                  className="control"
                  value={branding.schoolName}
                  maxLength={60}
                  onChange={(e) => updateBrandingField({ schoolName: e.target.value })}
                />
              </label>
              <label className="form-field">
                <span>Board line</span>
                <input
                  className="control"
                  value={branding.boardName}
                  maxLength={80}
                  onChange={(e) => updateBrandingField({ boardName: e.target.value })}
                />
              </label>
            </div>
            <label className="form-field">
              <span>Session label</span>
              <input
                className="control"
                value={branding.session}
                maxLength={50}
                onChange={(e) => updateBrandingField({ session: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Home portal tagline</span>
              <textarea
                rows={3}
                className="control resize-y"
                value={branding.tagline}
                maxLength={320}
                onChange={(e) => updateBrandingField({ tagline: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Footer credit line</span>
              <input
                className="control"
                value={branding.footerNote}
                maxLength={140}
                onChange={(e) => updateBrandingField({ footerNote: e.target.value })}
              />
            </label>
            {error && <p role="alert" className="inline-message error">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary whitespace-nowrap shrink-0"
                disabled={savingBranding}
                onClick={() => void applyAndSaveBranding(branding)}
              >
                {savingBranding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save />}
                Save branding
              </button>
              <button
                type="button"
                className="btn btn-secondary whitespace-nowrap shrink-0"
                disabled={savingBranding}
                onClick={() =>
                  void applyAndSaveBranding(
                    { ...DEFAULT_BRANDING },
                    "Council branding reset to default."
                  )
                }
              >
                <RotateCcw />Reset to default
              </button>
            </div>
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="panel-heading">
            <div>
              <h2><Scale />Terms & Credits Content</h2>
              <p>Edit the pages linked in the footer. Use "## " to start a new heading.</p>
            </div>
          </div>
          <div className="compact-tabs mb-4">
            <button
              type="button"
              className={view === "terms" ? "active" : ""}
              onClick={() => setView("terms")}
            >
              <FileText />Terms & Conditions
            </button>
            <button
              type="button"
              className={view === "credits" ? "active" : ""}
              onClick={() => setView("credits")}
            >
              <Sparkles />Credits
            </button>
          </div>
          <div className="form-stack">
            <label className="form-field">
              <span>{view === "terms" ? "Terms & conditions" : "Credits page"}</span>
              <textarea
                rows={14}
                className="control resize-y font-mono !text-[10px]"
                value={view === "terms" ? legal.terms : legal.credits}
                onChange={(e) => updateLegalField({ [view]: e.target.value })}
              />
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
            {legalError && <p role="alert" className="inline-message error">{legalError}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary whitespace-nowrap shrink-0"
                disabled={savingLegal}
                onClick={() => void applyAndSaveLegal(legal)}
              >
                {savingLegal ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save />}
                Save content
              </button>
              <button
                type="button"
                className="btn btn-secondary whitespace-nowrap shrink-0"
                disabled={savingLegal}
                onClick={() =>
                  void applyAndSaveLegal(
                    { ...DEFAULT_LEGAL },
                    "Terms and credits reset to default."
                  )
                }
              >
                <RotateCcw />Reset to default
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="panel panel-pad">
        <div className="panel-heading">
          <div>
            <h2><Home />House Names & Logos</h2>
            <p>Rename any house and upload its logo. Changes stay in your draft until you click Save.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {(HOUSES as readonly House[]).map((h) => (
            <div key={h} className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {houses[h]?.logoUrl ? (
                    <img
                      src={houses[h].logoUrl}
                      alt={`${houses[h].name} logo preview`}
                      className="house-logo h-12 w-12 rounded-xl object-contain bg-white p-1 border border-[var(--border)]"
                    />
                  ) : (
                    <HouseMark house={h} className="h-12 w-12 !rounded-xl text-base" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--faint)]">{h} House</p>
                    <p className="font-display text-sm font-bold truncate">
                      {houses[h]?.name ? `${houses[h].name} House` : `${h} House`}
                    </p>
                  </div>
                </div>
                {houses[h]?.logoUrl && (
                  <button
                    type="button"
                    className="text-action !text-[10px] text-rose-500 shrink-0 whitespace-nowrap"
                    onClick={() => handleRemoveHouseLogo(h)}
                  >
                    Remove logo
                  </button>
                )}
              </div>
              <label className="form-field mt-3">
                <span>Display name</span>
                <input
                  className="control"
                  value={houses[h]?.name ?? ""}
                  maxLength={30}
                  onChange={(e) => updateHouseField(h, { name: e.target.value })}
                  placeholder={h}
                />
              </label>
              <label className="form-field mt-3">
                <span>Logo image URL</span>
                <input
                  className="control"
                  value={(houses[h]?.logoUrl ?? "").startsWith("data:") ? "" : (houses[h]?.logoUrl ?? "")}
                  placeholder={(houses[h]?.logoUrl ?? "").startsWith("data:") ? "Uploaded image staged — paste URL to replace" : "https://..."}
                  onChange={(e) => updateHouseField(h, { logoUrl: e.target.value })}
                />
              </label>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-[10px] font-semibold text-[var(--muted)] transition-colors hover:border-[var(--purple)] hover:text-[var(--text)]">
                {uploadingHouse === h ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Image className="h-3.5 w-3.5" />
                )}
                {uploadingHouse === h ? "Optimizing logo..." : "Upload house logo (stages in draft)"}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void handleHouseLogoUpload(h, file);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
        {houseError && <p role="alert" className="inline-message error mt-3">{houseError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary whitespace-nowrap shrink-0"
            disabled={savingHouses}
            onClick={() => void applyAndSaveHouses(houses)}
          >
            {savingHouses ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save />}
            Save house branding
          </button>
          <button
            type="button"
            className="btn btn-secondary whitespace-nowrap shrink-0"
            disabled={savingHouses}
            onClick={() =>
              void applyAndSaveHouses(
                {
                  Blue: { ...DEFAULT_HOUSES.Blue },
                  Red: { ...DEFAULT_HOUSES.Red },
                  Green: { ...DEFAULT_HOUSES.Green },
                },
                "House names and logos reset to default."
              )
            }
          >
            <RotateCcw />Reset houses
          </button>
        </div>
      </section>
    </div>
  );
}
