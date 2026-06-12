/**
 * Shared constants for the key-gated founder admin pages (/admin/*).
 *
 * The admin key lives in localStorage only (never in the URL) and is sent
 * as the X-Admin-Key header through the same-origin /api Next.js rewrite
 * proxy, so no CORS preflight is needed.
 */

export const ADMIN_KEY_STORAGE_KEY = "kinely_admin_key";

/** Endpoint used both for data and for validating a key. */
export const ADMIN_LEADS_ENDPOINT = "/api/v1/admin/leads";
