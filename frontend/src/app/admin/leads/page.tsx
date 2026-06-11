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

import { useCallback, useEffect, useState, type FormEvent } from "react";
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

interface GymInquiryItem {
  id: string;
  gym_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  num_locations: number | null;
  message: string | null;
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
  gym_inquiries: GymInquiryItem[];
  contact_inquiries: ContactInquiryItem[];
  payment_events: PaymentEventItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_KEY_STORAGE_KEY = "kinely_admin_key";
// Relative path on purpose: must hit the same-origin Next.js rewrite proxy
// so the X-Admin-Key header passes through without a CORS preflight.
const LEADS_ENDPOINT = "/api/v1/admin/leads";

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

        {/* Gym inquiries */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Gym inquiries
            <span className="ml-2 text-sm font-normal text-zinc-500">
              latest {data.gym_inquiries.length}
            </span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
            <table className="min-w-full divide-y divide-zinc-800">
              <thead>
                <tr>
                  <th className={TH_CLASS}>Gym</th>
                  <th className={TH_CLASS}>Contact</th>
                  <th className={TH_CLASS}>Email</th>
                  <th className={TH_CLASS}>Phone</th>
                  <th className={TH_CLASS}>City</th>
                  <th className={TH_CLASS}>Message</th>
                  <th className={TH_CLASS}>Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {data.gym_inquiries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`${TD_CLASS} text-zinc-500`}>
                      No gym inquiries yet.
                    </td>
                  </tr>
                ) : (
                  data.gym_inquiries.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-800/30">
                      <td className={`${TD_CLASS} font-medium text-white`}>
                        {row.gym_name}
                      </td>
                      <td className={TD_CLASS}>{row.contact_name}</td>
                      <td className={TD_CLASS}>{row.email}</td>
                      <td className={TD_CLASS}>{row.phone ?? EMPTY_CELL}</td>
                      <td className={TD_CLASS}>{row.city ?? EMPTY_CELL}</td>
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
    </main>
  );
}
