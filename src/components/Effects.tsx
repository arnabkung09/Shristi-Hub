import { Children, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { cn } from "../utils/cn";
import { Modal } from "./ui";

/* Scroll-triggered reveal: fades/slides content in the first time it enters view. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -32px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "is-visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Wraps a page's top-level blocks so each one fades and rises the first time it
 * scrolls into view, with a gentle stagger down the page. Blocks that are plain
 * text or empty are passed through untouched.
 */
export function RevealBlocks({ children, step = 80 }: { children: ReactNode; step?: number }) {
  const parts = Children.toArray(children);
  let index = 0;
  return (
    <>
      {parts.map((child, idx) => {
        // Primitives (whitespace strings, numbers, booleans) pass through as-is.
        if (child == null || typeof child !== "object") return child;
        const el = child as ReactElement;
        // AnimatePresence often holds a fixed/absolute overlay (e.g. the gallery
        // lightbox) and Modal portals to <body>; a transformed reveal wrapper
        // would break their containing blocks or leave an empty spacer, so
        // pass both through untouched.
        if (el.type === AnimatePresence || el.type === Modal) return child;
        const delay = Math.min(index * step, 480);
        index += 1;
        return (
          <Reveal key={el.key ?? `block-${idx}`} delay={delay} className="h-full min-w-0">
            {child}
          </Reveal>
        );
      })}
    </>
  );
}

/* Subtle ambient glow that drifts toward the cursor. Disabled on touch / reduced-motion. */
export function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return;
    }
    const el = ref.current;
    if (!el) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 3;
    let tx = x;
    let ty = y;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const tick = () => {
      x += (tx - x) * 0.075;
      y += (ty - y) * 0.075;
      el.style.transform = `translate3d(${x - 280}px, ${y - 280}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="mouse-glow" aria-hidden="true" />;
}
