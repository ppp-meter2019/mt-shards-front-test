/**
 * Session storage + base-URL derivation.
 *
 * Two deployment modes (selected via /config.js):
 *
 * 1. Same-origin (production behind nginx) — `API_PORT === ""`.
 *    The frontend lives at https://<sub>.<APP_DOMAIN>/ and nginx proxies
 *    /api, /admin, /static to Django. We use relative URLs and the tenant
 *    is whatever's already in the address bar — no manual input needed.
 *
 * 2. Split-origin (local dev) — `API_PORT === "8000"`.
 *    Frontend on :5500, Django on :8000. We construct a cross-origin URL
 *    out of the requested subdomain + the bare apex.
 */

import { APP_DOMAIN, API_PORT } from "../config.js";
import { decodeJwt, loginRequest } from "./api.js";

const KEY = "tenants_demo_session";

export function getSession() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

function saveSession(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** True when the deployment uses cross-origin requests (dev). */
export function isSplitOriginMode() {
  return Boolean(API_PORT);
}

/**
 * Apex domain we work against.
 *   - If APP_DOMAIN is set (production), return it as-is. It IS the apex —
 *     don't strip anything from it.
 *   - Otherwise (dev fallback), take current hostname and chop the first
 *     label: "alpha.localhost" → "localhost"; bare "localhost" → "localhost".
 *
 * Exported because the admin "create tenant" form composes new tenant
 * hostnames as `<schema>.<apex>` and must use the same logic.
 */
export function apex() {
  if (APP_DOMAIN) return APP_DOMAIN;
  const host = window.location.hostname || "localhost";
  const dot = host.indexOf(".");
  return dot === -1 ? host : host.slice(dot + 1);
}

/**
 * Tenant subdomain inferred from `window.location.hostname` minus the apex.
 * Empty string means "we're on the public/management host".
 */
export function detectTenant() {
  const host = window.location.hostname;
  const root = apex();
  if (!host || host === root) return "";
  if (host.endsWith("." + root)) return host.slice(0, -(root.length + 1));
  return "";  // hostname doesn't match the configured apex → treat as public
}

/**
 * Build the API base URL.
 *   - same-origin: returns "" (callers will use relative paths).
 *   - split-origin: returns "http://<sub>.<apex>:<port>", honoring the
 *     subdomain override the operator typed on the login form.
 */
export function buildBaseUrl(subdomainOverride) {
  if (!isSplitOriginMode()) return "";
  const sub = (subdomainOverride !== undefined ? subdomainOverride : detectTenant()) || "";
  const target = sub ? `${sub}.${apex()}` : apex();
  const proto = window.location.protocol === "https:" ? "https" : "http";
  return `${proto}://${target}:${API_PORT}`;
}

export async function login(subdomainOverride, username, password) {
  // In same-origin mode the override is ignored — the browser is already on
  // the right hostname. In split-origin dev the override decides which
  // backend host to hit.
  const baseUrl = buildBaseUrl(subdomainOverride);
  const tokens = await loginRequest(baseUrl, username, password);
  const claims = decodeJwt(tokens.access);
  const session = {
    baseUrl,
    subdomain: subdomainOverride || detectTenant(),
    username: claims.username || username,
    role: tokens.role || claims.role,
    schema: tokens.schema || claims.schema,
    access: tokens.access,
    refresh: tokens.refresh,
  };
  saveSession(session);
  return session;
}

export function logout() {
  clearSession();
}