import { APP_DOMAIN } from "../../config.js";
import { detectTenant, login } from "../auth.js";
import { getLang, setLang, t } from "../i18n.js";
import { el, clear, flash, errorText, langToggle } from "../ui.js";

export function renderLogin(host, onLogged) {
  clear(host);
  // The "Тенант" field is shown only when APP_DOMAIN isn't configured —
  // in that fallback we don't know how to derive the tenant from the URL,
  // so the operator types it manually. When APP_DOMAIN is set (any prod
  // setup), the tenant is unambiguous from window.location.hostname.
  const askTenantManually = !APP_DOMAIN;
  const detected = detectTenant();

  const wrap = el("div", { class: "login-wrap card" });

  // Header row: title + language switch.
  wrap.append(
    el("div", { style: "display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.6rem" },
      el("h2", { style: "margin: 0; flex: 1" }, t("login.title")),
      langToggle(getLang, setLang),
    ),
  );

  if (askTenantManually) {
    wrap.append(el("p", { class: "muted" }, t("login.hint.manual")));
  } else {
    wrap.append(el("p", { class: "muted" },
      detected
        ? `${t("login.hint.detected")} ${detected}`
        : t("login.hint.public")));
  }

  const form = el("form", {});

  if (askTenantManually) {
    form.append(formField(
      t("login.field.subdomain"),
      el("input", { name: "subdomain", placeholder: "alpha", value: detected }),
    ));
  }
  form.append(
    formField(t("login.field.username"),
      el("input", { name: "username", required: true, autocomplete: "username" })),
    formField(t("login.field.password"),
      el("input", { name: "password", type: "password", required: true, autocomplete: "current-password" })),
    el("div", { class: "row", style: "margin-top: 0.5rem" },
      el("button", { type: "submit" }, t("login.submit")),
    ),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const subdomain = askTenantManually
      ? (data.get("subdomain") || "").toString().trim().toLowerCase()
      : undefined;  // undefined → auth.js falls back to detectTenant()
    const username = (data.get("username") || "").toString().trim();
    const password = (data.get("password") || "").toString();
    try {
      const session = await login(subdomain, username, password);
      onLogged(session);
    } catch (error) {
      flash(wrap, "error", errorText(error));
    }
  });

  wrap.append(form);
  host.append(wrap);
}

function formField(label, input) {
  return el("div", { style: "margin-bottom: 0.6rem" },
    el("label", {}, label),
    input,
  );
}