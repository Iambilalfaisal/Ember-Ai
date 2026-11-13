"use client";

import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";
import { spring } from "../motion";

/**
 * A list whose items collapse out when handled while the rest settle into place with a spring.
 * Reduced motion turns the movement off; items still leave the list.
 */
export function ReflowList({
  children,
  className,
  ...aria
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <ul className={className} {...aria}>
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </MotionConfig>
  );
}

/** One item of a ReflowList. Give it a stable key. */
export function ReflowItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.li
      layout="position"
      transition={spring}
      exit={{ opacity: 0, height: 0, overflow: "hidden", transition: { duration: 0.2 } }}
      className={className}
    >
      {children}
    </motion.li>
  );
}

/** Wraps a board whose tiles move between containers: reduced motion turns the movement off. */
export function SpringBoard({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>{children}</LayoutGroup>
    </MotionConfig>
  );
}

/** A tile that glides to its new place when it changes container. Give it a stable `id`. */
export function SpringTile({
  id,
  children,
  className,
  dimmed = false,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  /** Used while the tile is being dragged: the real tile stays behind, faded. */
  dimmed?: boolean;
}) {
  return (
    <motion.div
      layoutId={id}
      transition={spring}
      animate={{ opacity: dimmed ? 0.4 : 1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
