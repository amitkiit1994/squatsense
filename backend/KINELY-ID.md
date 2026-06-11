# Kinely ID — Common Auth Blueprint

Status: DESIGN ONLY. We are explicitly NOT building the full identity
provider now. This document is the blueprint so that every auth change we
ship from here on (starting with email OTP verification, which is live in
this backend) moves toward Kinely ID instead of away from it.

Location note: this file lives at `backend/KINELY-ID.md` because the
repo-level `docs/` directory is gitignored (planning docs only).

## Goal

One account — a Kinely ID — that works across all Kinely products:

| Product | Surface | Today's auth |
|---------|---------|--------------|
| SquatSense | squatsense.ai (game, kiosk/arena) | League JWT (this backend) |
| FreeForm Fitness | freeformfitness.ai (training platform) | FreeForm JWT (this backend) |
| TraqGym Cloud | traqgym.com (gym management SaaS) | NextAuth.js v4, credentials provider |

A member of a gym should be able to play SquatSense at the kiosk, train on
FreeForm, and check their membership in TraqGym with the same identity, and
a gym owner should see that as one person.

## Current State (June 2026)

Three auth systems, zero shared identity:

1. FreeForm auth (`backend/routers/auth.py`, `deps.py:get_current_user_id`)
   - JWT HS256 signed with `JWT_SECRET_KEY`, `type: "access"`, 15-minute
     expiry; 7-day single-use refresh tokens (SHA-256 hash stored in
     `refresh_tokens`).
   - `users` table: UUID PK, email + bcrypt password, profile fields,
     `auth_provider` / `auth_provider_id` columns already exist (currently
     always "email") and `email_verified` (new, set by the OTP flow).
2. League auth (`backend/routers/league_auth.py`, `deps.py:get_league_player_id`)
   - JWT with `type: "league"`, 30-day expiry, same signing key.
   - `league_players` table: anonymous join by nickname, optional
     email + password registration, `email_verified` via magic-link JWT.
3. TraqGym (separate codebase, `traqgym/` — one Next.js + PostgreSQL
   instance per gym)
   - NextAuth.js v4 credentials provider; checks a `Worker` table
     (admin/staff) first, then `User` (member). Session carries
     `actorType`, `role`, `locationId`. Prisma, per-gym database.
   - TraqGym Cloud is the multi-tenant evolution of this.

Consequences: three password stores, three reset flows, no cross-product
view of a person, and a gym cannot link its TraqGym members to their
SquatSense/FreeForm activity.

## Proposed Architecture

This FastAPI backend becomes the identity provider. It already owns the
two largest user stores, runs the email infrastructure (Resend), and has
the JWT plumbing.

- Issuer: `https://kinely.ai` (`iss` claim). Tokens are minted ONLY by this
  backend.
- Products are consumers. They validate Kinely-issued JWTs and keep their
  own product data keyed by the Kinely user UUID (`sub`).
- Token shape (target):

```json
{
  "iss": "https://kinely.ai",
  "sub": "<kinely user uuid>",
  "type": "access",
  "products": ["freeform", "squatsense"],
  "orgs": [{"org_id": "<uuid>", "role": "member", "products": ["traqgym"]}],
  "email_verified": true,
  "exp": 1760000000
}
```

- Signing: stay on HS256 short-term (all consumers are first-party).
  Move to RS256/ES256 with a published JWKS (`/.well-known/jwks.json`)
  before any consumer we do not deploy ourselves validates tokens — RS256
  means consumers never hold the signing secret.
- Existing claims stay valid during migration: `type: "access"` (FreeForm)
  and `type: "league"` (SquatSense) tokens keep working until each product
  is moved over.

### Org Model

The gym is the organizing unit and owns its members across products.

- `orgs`: id (UUID), name, slug, kind ("gym" initially), created_at.
- `org_memberships`: org_id, user_id, role (`owner`, `staff`, `member`),
  product grants (JSONB, e.g. `{"traqgym": true, "squatsense": true}`),
  status, created_at. Unique on (org_id, user_id).
- A user can belong to multiple orgs (trains at two gyms) and to no org
  (direct B2C FreeForm subscriber).
- TraqGym's Worker-vs-User split maps to membership roles: Worker(admin)
  -> `owner`/`staff`, User(member) -> `member`. `locationId` stays
  product-side — Kinely ID does not model gym floor plans.
- Kiosk/arena flows stay anonymous-capable: an org can have anonymous
  players that are later claimed by a Kinely ID (the existing
  league "claim by email registration" path generalizes to this).

### Migration Path Per Product

FreeForm Fitness (easiest — already on the IdP database):
1. `users` becomes the Kinely ID user table in place; add `iss` and
   product claims to minted tokens (additive, consumers ignore unknown
   claims today).
2. Email OTP verification (shipped) becomes the account-confirmation step.
3. No data migration needed.

SquatSense:
1. Keep anonymous join untouched (core funnel — do not add friction).
2. When a league player registers an email, create-or-link a Kinely user
   with the same email (post-OTP verification) and store
   `league_players.kinely_user_id`.
3. New logins issue Kinely tokens with `products: ["squatsense"]`; the
   `type: "league"` token remains accepted by league endpoints until the
   web client is fully switched.

TraqGym Cloud:
1. Keep NextAuth as the session layer; swap the credentials provider for
   an OIDC/custom provider pointing at this backend (NextAuth v4 supports
   custom OAuth providers). NextAuth keeps doing cookies/CSRF; Kinely ID
   does the authenticating.
2. Backfill: for each gym instance, match Worker/User rows to Kinely users
   by verified email; unmatched users get a Kinely ID lazily on next login
   (password re-set via email — we cannot port bcrypt hashes across
   different hashing parameters reliably, and forcing one reset per user
   is acceptable for gym-scale numbers).
3. Per-gym instance -> org mapping: one org per gym, `org_memberships`
   built from the gym's Worker/User tables.
4. Product keeps its own `User` row for gym-domain data, plus
   `kinelyUserId` column.

Order: FreeForm (in place) -> SquatSense link-on-register -> TraqGym Cloud
provider swap. Each step is independently shippable and reversible.

### Endpoints the IdP Will Eventually Expose (not built yet)

- `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` —
  exist today, gain product/org claims.
- `POST /auth/request-otp`, `/auth/verify-otp` — exist today (this change).
- `GET /.well-known/jwks.json` — with the RS256 move.
- `GET /auth/authorize` + `POST /auth/token` — minimal OAuth2/OIDC code
  flow, needed only when TraqGym's NextAuth provider swap happens.
- `GET /me`, `GET /me/orgs` — profile and membership introspection.

## Google SSO Requirements

`users.auth_provider` / `auth_provider_id` columns already exist, so the
schema is ready. What is needed:

1. FOUNDER ACTION: create a Google Cloud project + OAuth 2.0 Client ID
   (type "Web application") in the Google Cloud Console, configure the
   OAuth consent screen (app name "Kinely", support email, privacy policy
   URL), and provide `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` as backend
   env vars. Publishing the consent screen to "In production" requires the
   privacy policy and terms pages to be live.
2. Authorized redirect URIs to register on that client:
   - `https://kinely.ai/api/v1/auth/google/callback` (canonical, once the
     backend answers on kinely.ai)
   - `https://www.freeformfitness.ai/auth/google/callback`
   - `https://www.squatsense.ai/auth/google/callback`
   - `https://traqgym.com/api/auth/callback/google` (NextAuth convention)
   - `http://localhost:3000/auth/google/callback` and
     `http://localhost:8000/api/v1/auth/google/callback` (local dev)
3. Backend work (later): `/auth/google/start` + `/auth/google/callback`
   implementing the code flow, then find-or-create user by verified Google
   email (`email_verified=true` automatically — Google emails are
   verified), linking via `auth_provider="google"` + `auth_provider_id`.
4. Account-linking rule: if a Google sign-in email matches an existing
   password account, link only when the existing account's email is
   verified; otherwise require OTP verification first (prevents
   pre-registration account takeover).

## Human-Verification Strategy

- Now: email OTP (shipped in this backend). 6-digit code, SHA-256 hash at
  rest, 10-minute expiry, 5 attempts per code, newest code invalidates
  prior ones, 3 requests/minute/IP, enumeration-safe responses.
  Verification is OPTIONAL — registration is unchanged; enforcement comes
  later product by product.
- Later (optional): CAPTCHA on registration and OTP request if abuse shows
  up. Cloudflare Turnstile is the default candidate (free, privacy-fine,
  invisible mode). FOUNDER ACTION when triggered: create a Turnstile
  widget and supply `TURNSTILE_SITE_KEY` (frontend) and
  `TURNSTILE_SECRET_KEY` (backend env) — vendor keys are the only blocker,
  the backend check is a single server-side POST.
- Not planned: SMS OTP (cost, India DLT compliance overhead) unless
  phone-first gym members make it necessary for TraqGym.

## Explicit Non-Goals (for now)

- No full OAuth2/OIDC server, no JWKS, no consent screens — until the
  TraqGym provider swap is scheduled.
- No cross-product UI: SquatSense and FreeForm remain separate user-facing
  products with no CTAs or visible account linking between them.
- No change to registration friction anywhere: anonymous SquatSense join
  stays, FreeForm registration stays verification-optional.
- No new infrastructure: Kinely ID is this backend, not a new service.
