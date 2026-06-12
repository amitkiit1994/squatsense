"use client";

/**
 * Mumbai-first sales playbook (/admin/playbook).
 *
 * Static founder-only reference content behind the same admin key gate as
 * /admin/leads (shared localStorage key — unlocking either unlocks both).
 * Goal: 167 paying gyms = Rs 1 Cr ARR. Today: 1 paying gym.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdminKeyGate } from "@/components/admin/admin-key-gate";
import { EGYM_PROOF_LINE, ROI_LINK } from "@/lib/pitch";

const SECTION_CLASS =
  "rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3";
const H2_CLASS = "text-lg font-semibold text-white";
const P_CLASS = "text-sm leading-relaxed text-zinc-300";
const LI_CLASS = "text-sm leading-relaxed text-zinc-300";

const TOUCHES: { step: string; detail: string }[] = [
  {
    step: "WhatsApp intro",
    detail:
      "Use the Pitch button on the lead's row in /admin/leads — short Hinglish message with the eGym proof line. Personalize the first line if you know anything about the gym.",
  },
  {
    step: "ROI link",
    detail: `Send ${ROI_LINK}. Let the gym plug in its own numbers — the calculator's assumptions are labeled as assumptions, keep it that way in conversation too.`,
  },
  {
    step: "15-min demo",
    detail:
      "Live console at kinely.ai/app. Show their workflow, not a feature tour: member check-in, renewal due list, follow-up queue. 15 minutes, hard stop.",
  },
  {
    step: "Trial + overnight migration offer",
    detail:
      "30-day trial, no card. Offer to migrate their existing data overnight so they wake up with the trial pre-loaded — same as we did for eGym.",
  },
  {
    step: "Close at Rs 3,999-4,999",
    detail:
      "Anchor at Rs 4,999, close anywhere in the Rs 3,999-4,999 band. Pricing source of truth is src/lib/plans.ts in traqgym-cloud — do not invent discounts beyond the band.",
  },
];

const OBJECTIONS: { objection: string; response: string }[] = [
  {
    objection: '"Too expensive."',
    response:
      "Do the cost-of-one-lost-member math WITH their numbers, and label the assumption out loud. Assumption (say it as one): a typical membership runs Rs 1,500-2,500/month. If missed renewals or follow-ups quietly lose the gym even two members a month, that is Rs 3,000-5,000 of recurring revenue — more than the Rs 3,999 plan. Then plug their actual fee into the ROI calculator instead of arguing in the abstract.",
  },
  {
    objection: '"We already have software."',
    response:
      `Overnight migration plus run-both: we migrate their data overnight and they run TraqGym alongside the old system during the 30-day trial — zero switching risk. Proof line: ${EGYM_PROOF_LINE}.`,
  },
  {
    objection: '"Why should we trust a new company?"',
    response:
      "Offer an eGym Lokhandwala reference call with the owner. Do not oversell: we have exactly one paying gym and we say so. The honesty is the differentiator — every competitor claims hundreds of gyms.",
  },
];

const HONESTY_RULES: string[] = [
  "Never claim more than 1 paying gym. eGym Lokhandwala is the first and (today) the only one.",
  "Migrated figures are the gym's revenue, not ours. Never present them as Kinely numbers.",
  "Never fabricate stats. If we don't have the number, say we don't have it yet.",
  "ROI math assumptions must be labeled as assumptions — in the calculator, in the pitch, and out loud in the room.",
  "Agents' recovery is being measured, not proven. Do not quote recovery numbers as results until the measurement is done.",
];

export default function AdminPlaybookPage() {
  return (
    <AdminKeyGate
      title="Sales playbook"
      description="Enter the admin key to view the playbook."
    >
      {(lock) => (
        <main className="min-h-screen bg-zinc-950 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Mumbai-first sales playbook
                </h1>
                <p className="text-sm text-zinc-500">
                  Target: 167 paying gyms = Rs 1 Cr ARR. Today: 1 paying gym
                  (eGym Lokhandwala).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href="/admin/leads">Leads</Link>
                </Button>
                <Button variant="outline" size="sm" onClick={lock}>
                  Lock
                </Button>
              </div>
            </div>

            {/* ICP */}
            <section className={SECTION_CLASS}>
              <h2 className={H2_CLASS}>ICP — who we sell to</h2>
              <p className={P_CLASS}>
                Independent gyms with 200-2,000 members. Mumbai first —
                Robin&apos;s network gives us warm intros, and the eGym
                Lokhandwala reference is local. Skip chains and franchises
                for now: they buy on procurement cycles, not founder trust.
              </p>
            </section>

            {/* 5-touch sequence */}
            <section className={SECTION_CLASS}>
              <h2 className={H2_CLASS}>The 5-touch sequence</h2>
              <ol className="list-decimal space-y-3 pl-5">
                {TOUCHES.map((t) => (
                  <li key={t.step} className={LI_CLASS}>
                    <span className="font-semibold text-white">
                      {t.step}.
                    </span>{" "}
                    {t.detail}
                  </li>
                ))}
              </ol>
            </section>

            {/* Objection handling */}
            <section className={SECTION_CLASS}>
              <h2 className={H2_CLASS}>Objection handling</h2>
              <div className="space-y-4">
                {OBJECTIONS.map((o) => (
                  <div key={o.objection}>
                    <p className="text-sm font-semibold text-violet-400">
                      {o.objection}
                    </p>
                    <p className={P_CLASS}>{o.response}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Weekly cadence */}
            <section className={SECTION_CLASS}>
              <h2 className={H2_CLASS}>Weekly cadence</h2>
              <ul className="list-disc space-y-2 pl-5">
                <li className={LI_CLASS}>
                  <span className="font-semibold text-white">Monday:</span>{" "}
                  pipeline review on{" "}
                  <Link
                    href="/admin/leads"
                    className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
                  >
                    /admin/leads
                  </Link>{" "}
                  using the stage cards — every row in Contacted/Demo/Trial
                  must have a next action filled in.
                </li>
                <li className={LI_CLASS}>
                  <span className="font-semibold text-white">Daily:</span> 5
                  new contacts (WhatsApp intro via the Pitch button). No
                  zero days.
                </li>
              </ul>
            </section>

            {/* Honesty rules */}
            <section className={`${SECTION_CLASS} border-amber-500/30`}>
              <h2 className={H2_CLASS}>Honesty rules — non-negotiable</h2>
              <ul className="list-disc space-y-2 pl-5">
                {HONESTY_RULES.map((rule) => (
                  <li key={rule} className={LI_CLASS}>
                    {rule}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </main>
      )}
    </AdminKeyGate>
  );
}
