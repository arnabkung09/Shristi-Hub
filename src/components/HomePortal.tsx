import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Images, Send, Star } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useHub } from "../store/hub";
import { ratingStats } from "../lib/admin";
import { Reveal } from "./Effects";

function SiteRatingCard() {
  const { state, user, dispatch, announce } = useHub();
  const [hover, setHover] = useState(0);
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const stats = ratingStats(state.siteRatings);
  const mine = user ? state.siteRatings.find((r) => r.userId === user.id) : undefined;
  if (!user) return null;

  const submit = () => {
    if (!value) {
      announce("Choose a star rating first.", "error");
      return;
    }
    dispatch({ type: "SUBMIT_RATING", userId: user.id, userName: user.name, house: user.house ?? "Blue", value, comment });
    setSent(true);
    setValue(0);
    setComment("");
    announce(mine ? "Thanks — your rating has been updated." : "Thanks for rating the hub!");
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <section className="panel panel-pad hover-lift">
      <div className="panel-heading">
        <div>
          <h2><Star className="!text-amber-400" />Rate this site</h2>
          <p>Tap a star, add an optional note, and help the council improve the hub.</p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-extrabold tabular-nums">{stats.count ? stats.average.toFixed(1) : "—"}</p>
          <p className="text-[10px] text-[var(--muted)]">{stats.count} {stats.count === 1 ? "rating" : "ratings"}</p>
        </div>
      </div>
      <div className="grid items-start gap-6 md:grid-cols-[1fr_1fr]">
        <div>
          <div className="rating-stars" role="radiogroup" aria-label="Rate the site from 1 to 5 stars">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                role="radio"
                aria-checked={value === star}
                aria-label={`${star} star${star > 1 ? "s" : ""}`}
                className={(hover || value) >= star ? "lit" : ""}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                onFocus={() => setHover(star)}
                onBlur={() => setHover(0)}
                onClick={() => setValue(star)}
              >
                <Star />
              </button>
            ))}
          </div>
          <p className="mt-2 min-h-4 text-xs font-semibold text-amber-500">
            {value === 5 ? "Excellent — love it!" : value === 4 ? "Great, minor room to grow" : value === 3 ? "Good, could be better" : value === 2 ? "Needs work" : value === 1 ? "Not helpful yet" : hover ? "Tap to select" : mine ? `You rated ${mine.value} star${mine.value > 1 ? "s" : ""} — tap to change it` : "How is the hub working for you?"}
          </p>
          <textarea
            rows={2}
            maxLength={300}
            className="control mt-3 resize-y"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional: what should we improve? (300 characters max)"
          />
          <button className="btn btn-primary mt-3" onClick={submit}>
            {sent ? "Rating saved" : <><Send />Submit rating</>}
          </button>
          <p className="small-note mt-2">One rating per student — submitting again updates yours. Averages are visible to council admins.</p>
        </div>
        <div className="space-y-2.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = stats.distribution[star - 1];
            const pct = stats.count ? Math.round((count / stats.count) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2.5">
                <span className="flex w-10 items-center gap-1 text-[11px] font-bold tabular-nums">{star}<Star className="h-3 w-3 text-amber-400" /></span>
                <div className="rating-bar flex-1"><span style={{ width: `${pct}%` }} /></div>
                <span className="w-10 text-right text-[10px] tabular-nums text-[var(--muted)]">{count}</span>
              </div>
            );
          })}
          {state.siteRatings.filter((r) => r.comment).slice(0, 2).map((r) => (
            <div key={r.userId} className="rounded-xl border border-[var(--border)] bg-[var(--surface-inset)] p-3">
              <p className="text-[11px] italic leading-relaxed">“{r.comment}”</p>
              <p className="mt-1.5 text-[9px] text-[var(--faint)]">{r.userName} · {r.value}★</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HomePortal() {
  const { state, setActiveTab } = useHub();
  const [index, setIndex] = useState(0);
  const images = state.gallery.filter((g) => g.image && state.activeImageIds.includes(g.id));
  const current = images[index % Math.max(images.length, 1)];
  return <div className="space-y-7">
    <Reveal>
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--border)] pb-7"><div><p className="eyebrow mb-2">{state.branding.schoolName} / {state.branding.session}</p><h1 className="font-display text-4xl font-bold tracking-tight">{state.branding.boardName}</h1><p className="mt-3 max-w-lg text-xs leading-relaxed text-[var(--muted)]">{state.branding.tagline}</p></div><button className="btn btn-primary" onClick={() => setActiveTab("dashboard")}>Your dashboard<ArrowRight /></button></div>
    </Reveal>
    <Reveal delay={80}>
      {current ? <figure><div className="relative aspect-[2.65/1] overflow-hidden bg-[var(--surface)] max-sm:aspect-[4/3]"><AnimatePresence mode="wait"><motion.img key={current.id} initial={{ opacity: .4, scale: 1.025 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: .3 }} transition={{ duration: .5 }} src={current.image} alt={current.caption} className="h-full w-full object-cover" /></AnimatePresence></div><figcaption className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-4"><div><p className="font-display text-base font-semibold">{current.title}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{current.caption}</p></div><div className="pagination-buttons"><span className="mr-2 text-[10px] text-[var(--muted)]">{index % images.length + 1} / {images.length}</span><button aria-label="Previous school photo" onClick={() => setIndex((index - 1 + images.length) % images.length)}><ChevronLeft className="h-4 w-4" /></button><button aria-label="Next school photo" onClick={() => setIndex((index + 1) % images.length)}><ChevronRight className="h-4 w-4" /></button></div></figcaption></figure> : <div className="empty-content"><Images /><strong>No active portal images</strong><p>An administrator can select images in Admin Panel / Active Images.</p></div>}
    </Reveal>
    <Reveal delay={120}>
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">{[{ title: "What's happening", text: "Find your next event and reserve a place.", route: "events" }, { title: "Meet your council", text: "Your representatives, departments, and milestones.", route: "directory" }, { title: "Have your say", text: "Share an idea or vote in a student poll.", route: "voice" }].map((link) => <button key={link.route} className="group flex items-center justify-between border-b border-[var(--border)] px-4 py-5 text-left first:pl-0 last:pr-0 sm:border-b-0 sm:border-r sm:last:border-r-0" onClick={() => setActiveTab(link.route)}><span><strong className="font-display text-base">{link.title}</strong><span className="mt-2 block text-[10px] text-[var(--muted)]">{link.text}</span></span><ArrowRight className="ml-4 h-4 w-4 shrink-0 text-[var(--purple)] transition-transform group-hover:translate-x-1" /></button>)}</div>
    </Reveal>
    <Reveal delay={160}>
      <SiteRatingCard />
    </Reveal>
  </div>;
}
