"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** True when the person (or the demo's motion switch) asked for less movement. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset["motion"] === "reduce") return true;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The landing page's whole motion layer, in one place:
 * - reveals elements marked data-reveal as they scroll into view,
 * - lets any element marked data-glow follow the pointer with a light (--mx, --my),
 * - publishes the scroll position (--sy in px, --p from 0 to 1) for the parallax and progress bar.
 * Everything is skipped for reduced motion, and the page reads correctly without it.
 */
export function useLandingMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = prefersReducedMotion();
    const targets = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]"));

    let observer: IntersectionObserver | undefined;
    if (reduced || typeof IntersectionObserver === "undefined") {
      targets.forEach((t) => t.classList.add("is-in"));
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-in");
            observer?.unobserve(entry.target);
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
      );
      targets.forEach((t) => observer?.observe(t));
      el.setAttribute("data-ready", "true");
    }

    const onPointer = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-glow]");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      target.style.setProperty("--my", `${event.clientY - rect.top}px`);
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        el.style.setProperty("--sy", `${window.scrollY}`);
        el.style.setProperty("--p", `${Math.min(1, window.scrollY / max)}`);
      });
    };

    if (!reduced) {
      el.addEventListener("pointermove", onPointer);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    return () => {
      observer?.disconnect();
      el.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [root]);
}

/** Which of the elements is nearest the middle of the screen, for the scrolling story. */
export function useActiveIndex(count: number) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = refs.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.slice(0, count).forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [count]);

  return { active, setActive, refs };
}

/** A number that counts up once it is on screen. The final value is the server markup. */
export function useCountUp(to: number, from = 0, duration = 1400) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setValue(Math.round(from + (to - from) * eased));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        setValue(from);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [to, from, duration]);

  return { ref, value };
}
