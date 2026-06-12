"use client";

/**
 * Per-lead outreach modal for /admin/leads.
 *
 * Generates personalized WhatsApp + Email copy entirely client-side from
 * deterministic templates in @/lib/pitch (no API calls), with one-click
 * copy-to-clipboard for each piece.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildEmailPitch,
  buildWhatsAppPitch,
  type PitchFields,
} from "@/lib/pitch";

interface PitchDialogProps {
  /** Lead to pitch, or null when the dialog is closed. */
  lead: PitchFields | null;
  onClose: () => void;
}

const COPY_RESET_MS = 2000;

const BLOCK_CLASS =
  "whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm leading-relaxed text-zinc-200";

export function PitchDialog({ lead, onClose }: PitchDialogProps) {
  // Which copy button last succeeded, for "Copied" feedback.
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  // Reset feedback whenever the dialog switches lead / closes.
  useEffect(() => {
    setCopied(null);
    setCopyError(null);
  }, [lead]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), COPY_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!lead) return null;

  const whatsapp = buildWhatsAppPitch(lead);
  const email = buildEmailPitch(lead);

  async function copyToClipboard(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyError(null);
      setCopied(label);
    } catch {
      setCopyError(
        "Clipboard unavailable. Select the text and copy manually.",
      );
    }
  }

  function copyButton(label: string, text: string) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void copyToClipboard(label, text)}
        className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white"
      >
        {copied === label ? "Copied" : `Copy ${label}`}
      </Button>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-200">
        <DialogHeader>
          <DialogTitle className="text-white">
            Pitch — {lead.gym_name}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Personalized copy for {lead.contact_name}
            {lead.city ? ` (${lead.city})` : ""}. Generated locally from
            templates — review before sending.
          </DialogDescription>
        </DialogHeader>

        {copyError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {copyError}
          </div>
        )}

        {/* WhatsApp variant */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
              WhatsApp
            </h3>
            {copyButton("WhatsApp", whatsapp)}
          </div>
          <p className={BLOCK_CLASS}>{whatsapp}</p>
        </section>

        {/* Email variant */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-violet-400">
              Email
            </h3>
            <div className="flex gap-2">
              {copyButton("subject", email.subject)}
              {copyButton("body", email.body)}
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Subject
          </p>
          <p className={BLOCK_CLASS}>{email.subject}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Body
          </p>
          <p className={BLOCK_CLASS}>{email.body}</p>
        </section>

        <p className="text-xs text-zinc-500">
          Honesty check: eGym Lokhandwala is our only paying gym — the copy
          says &quot;first paying gym&quot; and must stay that way until gym
          number two is live.
        </p>
      </DialogContent>
    </Dialog>
  );
}
