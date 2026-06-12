"use client";

/**
 * Founder leads dashboard (/admin/leads).
 *
 * Key-gated view over GET /api/v1/admin/leads. The admin key is entered
 * once, validated against the backend, and persisted in localStorage
 * (never in the URL). All requests go through the same-origin /api
 * Next.js rewrite proxy so the custom X-Admin-Key header never needs a
 * CORS preflight (the backend CORS allowlist does not include it).
 */

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { ADMIN_KEY_STORAGE_KEY, ADMIN_LEADS_ENDPOINT } from "@/lib/admin-key";
import { PitchDialog } from "@/components/admin/pitch-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types (mirror backend/schemas/admin.py)
// ---------------------------------------------------------------------------

interface LeadCounts {
  gym_inquiries: number;
  contact_inquiries: number;
  waitlist_emails: number;
  users: number;
  payment_events: number;
}

const GYM_STAGES = [
  "new",
  "contacted",
  "demo",
  "trial",
  "won",
  "lost",
] as const;

type GymStage = (typeof GYM_STAGES)[number];

interface GymInquiryItem {
  id: string;
  gym_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  num_locations: number | null;
  message: string | null;
  stage: GymStage;
  next_action: string | null;
  stage_updated_at: string | null;
  created_at: string;
}

interface ContactInquiryItem {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  number_of_offices: string | null;
  estimated_employees: string | null;
  message: string | null;
  created_at: string;
}

interface PaymentEventItem {
  id: string;
  source: string;
  event_type: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  plan_id: string | null;
  billing: string | null;
  amount: number | null;
  currency: string;
  payer_email: string | null;
  created_at: string;
}

interface AdminLeadsResponse {
  counts: LeadCounts;
  stage_counts: Record<GymStage, number>;
  gym_inquiries: GymInquiryItem[];
  contact_inquiries: ContactInquiryItem[];
  payment_events: PaymentEventItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ADMIN_KEY_STORAGE_KEY / ADMIN_LEADS_ENDPOINT live in @/lib/admin-key and
// are shared with /admin/playbook (same key gate, same localStorage entry).
// Relative paths on purpose: must hit the same-origin Next.js rewrite proxy
// so the X-Admin-Key header passes through without a CORS preflight.
const LEADS_ENDPOINT = ADMIN_LEADS_ENDPOINT;
const GYM_PATCH_ENDPOINT = (id: string) => `/api/v1/admin/leads/gym/${id}`;

const STAGE_LABELS: Record<GymStage, string> = {
  new: "New",
  contacted: "Contacted",
  demo: "Demo",
  trial: "Trial",
  won: "Won",
  lost: "Lost",
};

/** Per-stage accent classes for the pipeline cards and stage selects. */
const STAGE_TEXT_CLASS: Record<GymStage, string> = {
  new: "text-zinc-200",
  contacted: "text-sky-400",
  demo: "text-violet-400",
  trial: "text-amber-400",
  won: "text-emerald-400",
  lost: "text-red-400",
};

const STAGE_SELECT_CLASS: Record<GymStage, string> = {
  new: "border-zinc-700 text-zinc-300",
  contacted: "border-sky-500/40 text-sky-400",
  demo: "border-violet-500/40 text-violet-400",
  trial: "border-amber-500/40 text-amber-400",
  won: "border-emerald-500/40 text-emerald-400",
  lost: "border-red-500/40 text-red-400",
};

const EMPTY_CELL = "—"; // em dash

const TH_CLASS =
  "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap";
const TD_CLASS = "px-3 py-2 text-sm text-zinc-300 whitespace-nowrap align-top";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Amounts arrive in paise; render as rupees (or `CODE value` if not INR). */
function formatAmount(amount: number | null, currency: string): string {
  if (amount === null || amount === undefined) return EMPTY_CELL;
  const value = (amount / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
  return currency === "INR" ? `₹${value}` : `${currency} ${value}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ViewState = "checking" | "locked" | "loading" | "ready";

export default function AdminLeadsPage() {
  const [view, setView] = useState<ViewState>("checking");
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<AdminLeadsResponse | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stageFilter, setStageFilter] = useState<GymStage | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);
  // Uncommitted next-action edits, keyed by inquiry id.
  const [nextActionDrafts, setNextActionDrafts] = useState<
    Record<string, string>
  >({});
  // Ids with an in-flight PATCH (disables that row's controls).
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  // Lead currently shown in the outreach pitch modal (null = closed).
  const [pitchLead, setPitchLead] = useState<GymInquiryItem | null>(null);

  /**
   * Fetch leads with the given key. `fromStorage` only changes the wording
   * of the 401 message (stored key rejected vs typed key rejected).
   */
  const loadLeads = useCallback(
    async (key: string, fromStorage: boolean): Promise<void> => {
      const hasData = Boolean(data);
      if (hasData) {
        setRefreshing(true);
        setRefreshError(null);
      } else {
        setView("loading");
        setGateError(null);
      }

      try {
        const res = await fetch(LEADS_ENDPOINT, {
          headers: { "X-Admin-Key": key },
          cache: "no-store",
        });

        if (res.status === 401) {
          localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
          setData(null);
          setGateError(
            fromStorage
              ? "Your saved admin key was rejected. Enter the key again."
              : "Invalid admin key. Check the key and try again.",
          );
          setView("locked");
          return;
        }

        if (res.status === 503) {
          setData(null);
          setGateError(
            "Admin API not configured. Set ADMIN_API_KEY on the backend.",
          );
          setView("locked");
          return;
        }

        if (!res.ok) {
          throw new Error(`Request failed with HTTP ${res.status}`);
        }

        const body = (await res.json()) as AdminLeadsResponse;
        localStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
        setData(body);
        setGateError(null);
        setView("ready");
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Could not reach the server.";
        if (hasData) {
          setRefreshError(message);
        } else {
          setGateError(message);
          setView("locked");
        }
      } finally {
        setRefreshing(false);
      }
    },
    [data],
  );

  // On mount: try the stored key, otherwise show the gate.
  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
    if (stored) {
      void loadLeads(stored, true);
    } else {
      setView("locked");
    }
    // Intentionally run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUnlock(e: FormEvent) {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) {
      setGateError("Enter the admin key.");
      return;
    }
    void loadLeads(key, false);
  }

  function handleRefresh() {
    const stored = localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
    if (stored) {
      void loadLeads(stored, true);
    } else {
      setData(null);
      setGateError("No saved admin key. Enter the key again.");
      setView("locked");
    }
  }

  function handleLock() {
    localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    setData(null);
    setKeyInput("");
    setGateError(null);
    setRefreshError(null);
    setView("locked");
  }

  // ── Pipeline CRM helpers ──────────────────────────────────────────────────

  /**
   * Apply a partial update to one gym inquiry row in local state. When the
   * stage changes, stage_counts is adjusted by the same delta so the
   * pipeline summary stays consistent without a refetch.
   */
  function mutateGymRow(id: string, fields: Partial<GymInquiryItem>) {
    setData((prev) => {
      if (!prev) return prev;
      const row = prev.gym_inquiries.find((g) => g.id === id);
      if (!row) return prev;

      const stageCounts = { ...prev.stage_counts };
      if (fields.stage && fields.stage !== row.stage) {
        stageCounts[row.stage] = Math.max(0, (stageCounts[row.stage] ?? 0) - 1);
        stageCounts[fields.stage] = (stageCounts[fields.stage] ?? 0) + 1;
      }

      return {
        ...prev,
        stage_counts: stageCounts,
        gym_inquiries: prev.gym_inquiries.map((g) =>
          g.id === id ? { ...g, ...fields } : g,
        ),
      };
    });
  }

  /** PATCH pipeline fields for one inquiry; throws on any non-2xx. */
  async function patchGymInquiry(
    id: string,
    body: { stage?: GymStage; next_action?: string | null },
  ): Promise<GymInquiryItem> {
    const key = localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
    if (!key) {
      handleLock();
      throw new Error("No saved admin key. Enter the key again.");
    }
    const res = await fetch(GYM_PATCH_ENDPOINT(id), {
      method: "PATCH",
      headers: {
        "X-Admin-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      handleLock();
      setGateError("Your saved admin key was rejected. Enter the key again.");
      throw new Error("Admin key rejected.");
    }
    if (!res.ok) {
      throw new Error(`Update failed with HTTP ${res.status}`);
    }
    return (await res.json()) as GymInquiryItem;
  }

  /** Optimistic stage change with revert on error. */
  function handleStageChange(row: GymInquiryItem, nextStage: GymStage) {
    if (nextStage === row.stage || savingIds[row.id]) return;
    const previous = {
      stage: row.stage,
      stage_updated_at: row.stage_updated_at,
    };

    setPatchError(null);
    setSavingIds((prev) => ({ ...prev, [row.id]: true }));
    mutateGymRow(row.id, {
      stage: nextStage,
      stage_updated_at: new Date().toISOString(),
    });

    void patchGymInquiry(row.id, { stage: nextStage })
      .then((updated) => {
        mutateGymRow(row.id, {
          stage: updated.stage,
          stage_updated_at: updated.stage_updated_at,
          next_action: updated.next_action,
        });
      })
      .catch((err: unknown) => {
        mutateGymRow(row.id, previous);
        setPatchError(
          err instanceof Error && err.message
            ? err.message
            : "Could not update the stage.",
        );
      })
      .finally(() => {
        setSavingIds((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      });
  }

  /** Commit a next-action draft (on blur / Enter), optimistic with revert. */
  function commitNextAction(row: GymInquiryItem) {
    const draft = nextActionDrafts[row.id];
    if (draft === undefined) return;

    setNextActionDrafts((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });

    const value = draft.trim();
    if (value === (row.next_action ?? "")) return;
    if (savingIds[row.id]) return;

    const previous = { next_action: row.next_action };
    setPatchError(null);
    setSavingIds((prev) => ({ ...prev, [row.id]: true }));
    mutateGymRow(row.id, { next_action: value || null });

    void patchGymInquiry(row.id, { next_action: value || null })
      .then((updated) => {
        mutateGymRow(row.id, { next_action: updated.next_action });
      })
      .catch((err: unknown) => {
        mutateGymRow(row.id, previous);
        setPatchError(
          err instanceof Error && err.message
            ? err.message
            : "Could not update the next action.",
        );
      })
      .finally(() => {
        setSavingIds((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      });
  }

  function handleNextActionKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    row: GymInquiryItem,
  ) {
    if (e.key === "Enter") {
      e.currentTarget.blur(); // blur triggers commitNextAction
    } else if (e.key === "Escape") {
      // Drop the draft; the controlled input falls back to the saved value.
      // No blur here: blur would commit before the state update lands.
      setNextActionDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  }

  // ── Checking / loading (no data yet) ────────────────────────────────────
  if (view === "checking" || view === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <p className="text-sm text-zinc-500">Loading leads…</p>
      </main>
    );
  }

  // ── Key gate ─────────────────────────────────────────────────────────────
  if (view === "locked" || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-sm">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader>
              <CardTitle className="text-white">Founder leads</CardTitle>
              <CardDescription className="text-zinc-400">
                Enter the admin key to view lead data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUnlock} className="space-y-4">
                {gateError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {gateError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="admin-key" className="text-zinc-300">
                    Admin key
                  </Label>
                  <Input
                    id="admin-key"
                    type="password"
                    placeholder="Admin key"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    autoComplete="off"
                    autoFocus
                    className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Unlock
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  const countCards: { label: string; value: number }[] = [
    { label: "Gym inquiries", value: data.counts.gym_inquiries },
    { label: "Office contacts", value: data.counts.contact_inquiries },
    { label: "Waitlist", value: data.counts.waitlist_emails },
    { label: "Users", value: data.counts.users },
    { label: "Payment events", value: data.counts.payment_events },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Founder leads</h1>
            <p className="text-sm text-zinc-500">
              Latest inquiries, signups, and payment activity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/playbook">Playbook</Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLock}>
              Lock
            </Button>
          </div>
        </div>

        {refreshError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            Refresh failed: {refreshError}
          </div>
        )}

        {/* Count cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {countCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {card.value.toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>

        {/* Gym pipeline */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Gym pipeline
            <span className="ml-2 text-sm font-normal text-zinc-500">
              all inquiries by stage
            </span>
          </h2>

          {/* Stage summary cards — click to filter the table below */}
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {GYM_STAGES.map((stage) => {
              const active = stageFilter === stage;
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStageFilter(active ? null : stage)}
                  aria-pressed={active}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-zinc-400 bg-zinc-800"
                      : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {STAGE_LABELS[stage]}
                  </p>
                  <p
                    className={`mt-1 text-xl font-bold tabular-nums ${STAGE_TEXT_CLASS[stage]}`}
                  >
                    {(data.stage_counts[stage] ?? 0).toLocaleString("en-IN")}
                  </p>
                  {stage === "won" && (
                    <p className="text-[10px] leading-tight text-zinc-600">
                      paying gyms — stage count only
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {patchError && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Update failed: {patchError}
            </div>
          )}

          {(() => {
            const visibleRows = stageFilter
              ? data.gym_inquiries.filter((row) => row.stage === stageFilter)
              : data.gym_inquiries;
            return (
              <>
                <h3 className="mb-3 text-sm font-semibold text-white">
                  Gym inquiries
                  <span className="ml-2 font-normal text-zinc-500">
                    {stageFilter
                      ? `${visibleRows.length} in ${STAGE_LABELS[stageFilter]} (of latest ${data.gym_inquiries.length})`
                      : `latest ${data.gym_inquiries.length}`}
                  </span>
                  {stageFilter && (
                    <button
                      type="button"
                      onClick={() => setStageFilter(null)}
                      className="ml-3 text-xs font-medium text-zinc-400 underline underline-offset-2 hover:text-white"
                    >
                      Clear filter
                    </button>
                  )}
                </h3>
                <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
                  <table className="min-w-full divide-y divide-zinc-800">
                    <thead>
                      <tr>
                        <th className={TH_CLASS}>Gym</th>
                        <th className={TH_CLASS}>Pitch</th>
                        <th className={TH_CLASS}>Stage</th>
                        <th className={TH_CLASS}>Next action</th>
                        <th className={TH_CLASS}>Contact</th>
                        <th className={TH_CLASS}>Email</th>
                        <th className={TH_CLASS}>Phone</th>
                        <th className={TH_CLASS}>City</th>
                        <th className={TH_CLASS}>Message</th>
                        <th className={TH_CLASS}>Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {visibleRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className={`${TD_CLASS} text-zinc-500`}>
                            {stageFilter
                              ? `No gym inquiries in ${STAGE_LABELS[stageFilter]}.`
                              : "No gym inquiries yet."}
                          </td>
                        </tr>
                      ) : (
                        visibleRows.map((row) => (
                          <tr key={row.id} className="hover:bg-zinc-800/30">
                            <td className={`${TD_CLASS} font-medium text-white`}>
                              {row.gym_name}
                            </td>
                            <td className={TD_CLASS}>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setPitchLead(row)}
                                aria-label={`Generate pitch for ${row.gym_name}`}
                                className="h-7 border-violet-500/40 bg-zinc-900 px-2 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
                              >
                                Pitch
                              </Button>
                            </td>
                            <td className={TD_CLASS}>
                              <select
                                value={row.stage}
                                disabled={Boolean(savingIds[row.id])}
                                onChange={(e) =>
                                  handleStageChange(
                                    row,
                                    e.target.value as GymStage,
                                  )
                                }
                                aria-label={`Stage for ${row.gym_name}`}
                                title={
                                  row.stage_updated_at
                                    ? `Stage set ${formatDate(row.stage_updated_at)}`
                                    : undefined
                                }
                                className={`rounded-md border bg-zinc-900 px-2 py-1 text-xs font-semibold uppercase tracking-wide focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 ${STAGE_SELECT_CLASS[row.stage]}`}
                              >
                                {GYM_STAGES.map((stage) => (
                                  <option key={stage} value={stage}>
                                    {STAGE_LABELS[stage]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className={TD_CLASS}>
                              <input
                                type="text"
                                value={
                                  nextActionDrafts[row.id] ??
                                  row.next_action ??
                                  ""
                                }
                                placeholder="Add next action"
                                disabled={Boolean(savingIds[row.id])}
                                onChange={(e) =>
                                  setNextActionDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                                onBlur={() => commitNextAction(row)}
                                onKeyDown={(e) =>
                                  handleNextActionKeyDown(e, row)
                                }
                                maxLength={255}
                                aria-label={`Next action for ${row.gym_name}`}
                                className="w-44 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
                              />
                            </td>
                            <td className={TD_CLASS}>{row.contact_name}</td>
                            <td className={TD_CLASS}>{row.email}</td>
                            <td className={TD_CLASS}>
                              {row.phone ?? EMPTY_CELL}
                            </td>
                            <td className={TD_CLASS}>
                              {row.city ?? EMPTY_CELL}
                            </td>
                            <td
                              className={`${TD_CLASS} max-w-xs truncate`}
                              title={row.message ?? undefined}
                            >
                              {row.message ?? EMPTY_CELL}
                            </td>
                            <td className={`${TD_CLASS} text-zinc-500`}>
                              {formatDate(row.created_at)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </section>

        {/* Office contacts */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Office contacts
            <span className="ml-2 text-sm font-normal text-zinc-500">
              latest {data.contact_inquiries.length}
            </span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
            <table className="min-w-full divide-y divide-zinc-800">
              <thead>
                <tr>
                  <th className={TH_CLASS}>Company</th>
                  <th className={TH_CLASS}>Contact</th>
                  <th className={TH_CLASS}>Email</th>
                  <th className={TH_CLASS}>Employees</th>
                  <th className={TH_CLASS}>Message</th>
                  <th className={TH_CLASS}>Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {data.contact_inquiries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`${TD_CLASS} text-zinc-500`}>
                      No office contacts yet.
                    </td>
                  </tr>
                ) : (
                  data.contact_inquiries.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-800/30">
                      <td className={`${TD_CLASS} font-medium text-white`}>
                        {row.company_name}
                      </td>
                      <td className={TD_CLASS}>{row.contact_name}</td>
                      <td className={TD_CLASS}>{row.email}</td>
                      <td className={TD_CLASS}>
                        {row.estimated_employees ?? EMPTY_CELL}
                      </td>
                      <td
                        className={`${TD_CLASS} max-w-xs truncate`}
                        title={row.message ?? undefined}
                      >
                        {row.message ?? EMPTY_CELL}
                      </td>
                      <td className={`${TD_CLASS} text-zinc-500`}>
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Payment events */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Payment events
            <span className="ml-2 text-sm font-normal text-zinc-500">
              latest {data.payment_events.length}
            </span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
            <table className="min-w-full divide-y divide-zinc-800">
              <thead>
                <tr>
                  <th className={TH_CLASS}>Type</th>
                  <th className={TH_CLASS}>Order</th>
                  <th className={TH_CLASS}>Amount</th>
                  <th className={TH_CLASS}>Email</th>
                  <th className={TH_CLASS}>Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {data.payment_events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`${TD_CLASS} text-zinc-500`}>
                      No payment events yet.
                    </td>
                  </tr>
                ) : (
                  data.payment_events.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-800/30">
                      <td className={`${TD_CLASS} font-medium text-white`}>
                        {row.event_type}
                      </td>
                      <td className={`${TD_CLASS} font-mono text-xs`}>
                        {row.razorpay_order_id}
                      </td>
                      <td className={`${TD_CLASS} tabular-nums`}>
                        {formatAmount(row.amount, row.currency)}
                      </td>
                      <td className={TD_CLASS}>
                        {row.payer_email ?? EMPTY_CELL}
                      </td>
                      <td className={`${TD_CLASS} text-zinc-500`}>
                        {formatDate(row.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Per-lead outreach copy modal (client-side templates only). */}
      <PitchDialog
        lead={
          pitchLead
            ? {
                gym_name: pitchLead.gym_name,
                contact_name: pitchLead.contact_name,
                city: pitchLead.city,
              }
            : null
        }
        onClose={() => setPitchLead(null)}
      />
    </main>
  );
}
