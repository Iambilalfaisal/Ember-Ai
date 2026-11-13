import type { Metadata } from "next";
import { LandingPage } from "@/features/landing";

export const metadata: Metadata = {
  title: "Ember: the AI sales copilot that never lets a lead go quiet",
  description:
    "Ember tells each rep who needs them today, answers technical questions on the call with a source, and has the follow-up ready before the customer hangs up.",
};

export default function Home() {
  return <LandingPage />;
}
