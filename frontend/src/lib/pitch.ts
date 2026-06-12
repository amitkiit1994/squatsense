/**
 * Deterministic outreach copy templates for gym leads.
 *
 * Pure client-side string building — no API calls, no randomness. The same
 * lead always produces the same copy. Honesty rules baked in:
 * - eGym Lokhandwala is our FIRST paying gym; the copy says so.
 * - The only proof line used is the real one: 11 years of data migrated
 *   overnight for eGym Lokhandwala.
 * - No invented stats, no inflated customer counts.
 */

export interface PitchFields {
  gym_name: string;
  contact_name: string;
  city: string | null;
}

export interface EmailPitch {
  subject: string;
  body: string;
}

export const ROI_LINK = "https://traqgym.kinely.ai/roi";

/** The one-line eGym proof, verbatim, used across all variants. */
export const EGYM_PROOF_LINE =
  "11 saal ka data raat bhar mein migrate - eGym Lokhandwala live hai";

/** First word of the contact name, for an informal WhatsApp greeting. */
function firstName(contactName: string): string {
  const first = contactName.trim().split(/\s+/)[0];
  return first || contactName.trim();
}

/**
 * Short, Hinglish-friendly WhatsApp message. One screen, one link, one ask.
 */
export function buildWhatsAppPitch(fields: PitchFields): string {
  const name = firstName(fields.contact_name);
  const city = fields.city?.trim();
  const roiIntro = city
    ? `${city} ke gyms ke liye ROI 2 min mein yahan dekhein`
    : "Aapke gym ke liye ROI 2 min mein yahan dekhein";

  return (
    `Hi ${name}! Kinely se message kar raha hoon, ${fields.gym_name} ke liye. ` +
    `Hum gym management software banate hain aur switch karna easy hai: ` +
    `${EGYM_PROOF_LINE}. ${roiIntro}: ${ROI_LINK}\n\n` +
    `Sahi lage toh bataiye, 15-min demo fix kar lete hain. ` +
    `30-day free trial, card ki zaroorat nahi.`
  );
}

/**
 * Email variant: subject + ~120-word body. Honest framing — first paying
 * gym, 30-day trial, no card.
 */
export function buildEmailPitch(fields: PitchFields): EmailPitch {
  const city = fields.city?.trim();
  const likeYours = city
    ? `for a gym like yours in ${city}`
    : "for a gym like yours";

  const subject = `${fields.gym_name} — overnight data migration, 30-day free trial of TraqGym`;

  const body =
    `Hi ${fields.contact_name},\n\n` +
    `I am writing from Kinely about ${fields.gym_name}. We build TraqGym, ` +
    `gym management software for independent gyms: memberships, renewals, ` +
    `payments, and follow-ups in one place.\n\n` +
    `To be upfront about where we are: eGym Lokhandwala in Mumbai is our ` +
    `first paying gym. When they switched to us, we migrated 11 years of ` +
    `their member data overnight and they were live the next morning.\n\n` +
    `You can see the ROI numbers ${likeYours} here: ${ROI_LINK}\n\n` +
    `If it looks useful, we offer a 30-day free trial, no card required, ` +
    `and we handle the migration. Would a 15-minute demo some time this ` +
    `week work for you?\n\n` +
    `Thanks,\nTeam Kinely`;

  return { subject, body };
}
