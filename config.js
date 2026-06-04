/**
 * Frontend configuration. Edit these two constants when you deploy.
 *
 * APP_DOMAIN — your platform apex (the bare domain that resolves to nginx).
 *   Examples:
 *     "example.com"     — frontend at  https://example.com  +  https://alpha.example.com
 *     "app.example.com" — frontend at  https://app.example.com + https://alpha.app.example.com
 *     ""                — local dev fallback: tenant typed manually on login form,
 *                         apex inferred from window.location.hostname.
 *
 *   When set, the frontend reads `window.location.hostname`, strips APP_DOMAIN,
 *   and uses whatever's left as the tenant subdomain (empty = public host).
 *   Login form hides the "Тенант" field — tenant is unambiguous from the URL.
 *
 * API_PORT  — the port where the API listens.
 *   Empty ""           → same origin as the page (apex on 443, no extra port).
 *   "8000" (recommended) → API published on a separate port.
 *                          Frontend on https://alpha.example.com → API at
 *                          https://alpha.example.com:8000/api/…
 *                          External clients (curl/mobile/3rd party) hit the
 *                          same URL.
 *   "8000" in dev      → same constant works locally: page at localhost:5500
 *                        calls http://alpha.localhost:8000.
 */

export const APP_DOMAIN = "";
export const API_PORT = "8000";
