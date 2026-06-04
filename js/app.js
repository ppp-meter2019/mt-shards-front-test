/**
 * Entry point. Reads the session from localStorage and routes to the right
 * view by role. Login screen is what the user sees if no valid session.
 *
 * Also wires the language switcher: when the user toggles UA/EN, every
 * subscriber (currently this router) re-runs and re-renders the view.
 */

import { getSession, logout } from "./auth.js";
import { mountDiagnosticsBar } from "./diagnostics.js";
import { getLang, onLangChange, setLang, t } from "./i18n.js";
import { langToggle } from "./ui.js";
import { renderLogin } from "./views/login.js";
import { renderAdmin } from "./views/admin.js";
import { renderCustomer } from "./views/customer.js";
import { renderDriver } from "./views/driver.js";

const appEl = document.getElementById("app");
const topbarEl = document.getElementById("topbar");
const whoEl = document.getElementById("who");
const langSlotEl = document.getElementById("lang-slot");
const logoutBtn = document.getElementById("logout");
const diagSlotEl = document.getElementById("diag-slot");

// Reflect the active language on <html lang="..."> from the start.
document.documentElement.lang = getLang();

// Top-of-page diagnostics strip — visible across every view (login, admin,
// customer, driver) and updates after each API call.
mountDiagnosticsBar(diagSlotEl);

// Mount the language toggle once; it lives in the topbar slot for the whole
// app lifetime (also used inside the login view).
const topbarToggle = langToggle(getLang, setLang);
langSlotEl.append(topbarToggle);

logoutBtn.addEventListener("click", () => {
  logout();
  route();
});

// Cross-tab logout / language change → re-render.
window.addEventListener("storage", route);
onLangChange(() => route());

route();

function route() {
  // Re-sync the toggle's active button (in case lang changed via storage event).
  if (topbarToggle._sync) topbarToggle._sync();
  logoutBtn.textContent = t("topbar.logout");

  const session = getSession();
  if (!session) {
    topbarEl.hidden = true;
    renderLogin(appEl, () => route());
    return;
  }

  topbarEl.hidden = false;
  whoEl.textContent = `${session.username} · ${t("role." + session.role) || session.role} · ${session.schema}`;

  switch (session.role) {
    case "tenant_admin":
    case "company_admin":
      renderAdmin(appEl);
      break;
    case "customer":
      renderCustomer(appEl);
      break;
    case "driver":
      renderDriver(appEl);
      break;
    default:
      logout();
      route();
  }
}