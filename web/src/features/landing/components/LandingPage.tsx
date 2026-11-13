"use client";

import Link from "next/link";
import { useRef } from "react";
import { SignedInRedirect } from "@/components/RootRedirect";
import "../landing.css";
import { useLandingMotion } from "./hooks";
import { Hero } from "./Hero";
import { Logo } from "./scenes";
import { FinalCta, Marquee, Modules, Problem, Proof, Story, Trust } from "./Sections";

/** The public front door: tells the story of Ember, then opens the live demo. */
export function LandingPage() {
  const root = useRef<HTMLDivElement | null>(null);
  useLandingMotion(root);

  return (
    <div className="lp" ref={root} data-surface="nav">
      <SignedInRedirect />
      <div className="lp-progress" aria-hidden="true" />
      <a href="#main" className="lp-skip">
        Skip to content
      </a>
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-brand" aria-label="Ember home">
            <Logo />
            <span>Ember</span>
          </Link>
          <nav aria-label="Page" className="lp-nav-links">
            <a href="#problem">Why Ember</a>
            <a href="#story">How it works</a>
            <a href="#product">Product</a>
            <a href="#trust">Trust</a>
          </nav>
          <div className="lp-nav-cta">
            <Link href="/sign-in" className="lp-btn lp-btn-ghost lp-btn-sm">
              Sign in
            </Link>
            <Link href="/sign-in" className="lp-btn lp-btn-primary lp-btn-sm">
              Try the demo
            </Link>
          </div>
        </div>
      </header>
      <main id="main">
        <Hero />
        <Marquee />
        <Problem />
        <Story />
        <Modules />
        <Proof />
        <Trust />
        <FinalCta />
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span className="lp-brand">
            <Logo size={22} />
            <span>Ember</span>
          </span>
          <p>The demo runs on sample data. Nothing is recorded.</p>
        </div>
      </footer>
    </div>
  );
}
