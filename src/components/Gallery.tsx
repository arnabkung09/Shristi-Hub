import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronLeft, ChevronRight, Images, Link2, Plus, X, ZoomIn, ZoomOut } from "lucide-react";
import { uid, useHub, fmtDate } from "../store/hub";
import { Btn, Card, Field, Modal, SectionTitle, Select, inputCls } from "./ui";
import { cn } from "../utils/cn";

const ALBUMS = ["All", "Sports Day", "Annual Day", "Debate Championship", "Investiture Ceremony", "Science Exhibition", "Clubs & Fairs"];

export default function Gallery() {
  const { state, user, hasPermission, dispatch } = useHub();
  const canManage = hasPermission("gallery");
  const [album, setAlbum] = useState("All");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", date: "", category: ALBUMS[1], caption: "", url: "" });

  const items = useMemo(
    () => state.gallery.filter((g) => (album === "All" ? true : g.category === album)),
    [state.gallery, album]
  );

  const close = useCallback(() => { setLightbox(null); setZoom(1); }, []);
  const step = useCallback((dir: 1 | -1) => {
    setLightbox((cur) => (cur === null ? null : (cur + dir + items.length) % items.length));
    setZoom(1);
  }, [items.length]);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, close, step]);

  if (!user) return null;
  const current = lightbox !== null ? items[lightbox] : null;

  const addPhoto = () => {
    if (!form.title.trim() || !form.date) return setError("Title and date are required.");
    const hasUrl = form.url.trim().length > 8;
    dispatch({
      type: "ADD_PHOTO",
      item: {
        id: uid(), title: form.title.trim(), date: form.date, category: form.category,
        caption: form.caption.trim() || "Added by the council media desk.",
        image: hasUrl ? form.url.trim() : undefined,
        gradient: hasUrl ? undefined : "from-sky-500 via-indigo-500 to-violet-600",
      },
    });
    setOpen(false); setError(null);
    setForm({ title: "", date: "", category: ALBUMS[1], caption: "", url: "" });
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Activities & Photo Gallery"
        subtitle="Student life and council milestones, documented"
        action={canManage && <Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Upload / Add Photos</Btn>}
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {ALBUMS.map((a) => (
          <button
            key={a}
            onClick={() => setAlbum(a)}
            className={cn(
              "min-h-[38px] shrink-0 rounded-full px-4 text-xs font-bold transition-all",
              album === a ? "bg-accent text-white shadow-sm" : "border border-black/10 text-slate-500 hover:bg-black/[0.04] dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.06]"
            )}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((g, i) => (
          <Card key={g.id} className="group cursor-zoom-in overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/[0.08] dark:hover:shadow-black/40" >
            <button className="block w-full text-left" onClick={() => { setLightbox(i); setZoom(1); }}>
              <div className="relative aspect-[4/3] overflow-hidden">
                {g.image ? (
                  <img src={g.image} alt={g.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
                ) : (
                  <div className={cn("flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br", g.gradient ?? "from-slate-500 to-slate-700")}>
                    <Images className="h-8 w-8 text-white/80" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Media desk</span>
                  </div>
                )}
                <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                  {g.category}
                </span>
                <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                  <ZoomIn className="h-4 w-4" />
                </span>
              </div>
              <div className="p-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{g.title}</h3>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">{fmtDate(g.date)}</p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{g.caption}</p>
              </div>
            </button>
          </Card>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {current && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex flex-col bg-black/92 backdrop-blur-md"
            onClick={close}
          >
            <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold sm:text-base">{current.title}</p>
                <p className="text-[11px] uppercase tracking-wider text-white/50">{fmtDate(current.date)} · {current.category}</p>
              </div>
              <div className="flex items-center gap-1">
                <button aria-label="Zoom out" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(1, z - 0.5)); }} className="grid h-10 w-10 place-items-center rounded-full text-white/70 hover:bg-white/10"><ZoomOut className="h-5 w-5" /></button>
                <span className="w-11 text-center text-xs font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
                <button aria-label="Zoom in" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(3, z + 0.5)); }} className="grid h-10 w-10 place-items-center rounded-full text-white/70 hover:bg-white/10"><ZoomIn className="h-5 w-5" /></button>
                <button aria-label="Close" onClick={close} className="ml-1 grid h-10 w-10 place-items-center rounded-full text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden px-12" onClick={(e) => e.stopPropagation()}>
              <button aria-label="Previous" onClick={() => step(-1)} className="absolute left-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 sm:left-5"><ChevronLeft className="h-5 w-5" /></button>
              <motion.div key={current.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }} className="max-h-full overflow-hidden rounded-2xl">
                {current.image ? (
                  <img src={current.image} alt={current.title} style={{ transform: `scale(${zoom})` }} className="max-h-[70vh] rounded-2xl object-contain transition-transform duration-300" />
                ) : (
                  <div className={cn("flex h-[46vh] w-[min(78vw,720px)] flex-col items-center justify-center gap-3 rounded-2xl bg-gradient-to-br", current.gradient ?? "from-slate-600 to-slate-800")}>
                    <Images className="h-12 w-12 text-white/80" />
                    <p className="text-sm font-bold text-white/90">High-res media uploading soon</p>
                  </div>
                )}
              </motion.div>
              <button aria-label="Next" onClick={() => step(1)} className="absolute right-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 sm:right-5"><ChevronRight className="h-5 w-5" /></button>
            </div>

            <p className="px-6 pb-5 text-center text-xs text-white/60">{current.caption} · {lightbox! + 1} / {items.length} — arrow keys navigate, Esc closes</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <Modal open={open && canManage} onClose={() => { setOpen(false); setError(null); }} title="Upload / Add Photos">
        <div className="space-y-4">
          <Field label="Photo title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Relay Finals — Photo Finish" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Album / event">
              <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })}>
                {ALBUMS.filter((a) => a !== "All").map((a) => <option key={a}>{a}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Caption"><input className={inputCls} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="One line describing the moment" /></Field>
          <Field label="Image URL" hint="Leave blank to reserve a gradient placeholder — media desk fills it later.">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputCls} pl-10`} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
            </div>
          </Field>
          {error && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn onClick={addPhoto}><Camera className="h-4 w-4" /> Add to gallery</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
