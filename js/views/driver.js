/**
 * Driver view:
 *   - own profile (read from session info — no /api/drivers/me/ endpoint),
 *   - routes assigned to them (backend filters /api/routes/ by driver).
 */

import { api } from "../api.js";
import { getSession } from "../auth.js";
import { t } from "../i18n.js";
import { el, clear, errorText } from "../ui.js";

export async function renderDriver(host) {
  clear(host);
  const session = getSession();

  const profileCard = el("div", { class: "card" }, el("h2", {}, t("driver.myProfile")));
  const routesCard = el("div", { class: "card" }, el("h2", {}, t("driver.myRoutes")));
  host.append(profileCard, routesCard);

  profileCard.append(
    kv(t("driver.login"), session.username),
    kv(t("driver.schema"), session.schema),
    kv(t("driver.role"), t("role.driver")),
  );

  try {
    const data = await api.get("/api/routes/");
    const routes = Array.isArray(data) ? data : (data.results || []);
    if (!routes.length) {
      routesCard.append(el("p", { class: "muted" }, t("driver.noAssigned")));
      return;
    }
    const tbl = el("table", {},
      el("thead", {}, el("tr", {},
        el("th", {}, t("field.id")),
        el("th", {}, t("field.name")),
        el("th", {}, t("field.car")),
        el("th", {}, t("field.orders")),
        el("th", {}, t("field.status")),
        el("th", {}, t("field.created")),
      )),
      el("tbody", {}, ...routes.map((r) => el("tr", {},
        el("td", {}, r.id),
        el("td", {}, r.name),
        el("td", {}, "#" + r.car),
        el("td", {}, (r.orders || []).map((o) => "#" + o).join(", ") || "—"),
        el("td", {}, el("span", { class: "pill" }, r.status)),
        el("td", {}, (r.created_at || "").slice(0, 10)),
      ))),
    );
    routesCard.append(tbl);
  } catch (error) {
    routesCard.append(el("div", { class: "message error" }, errorText(error)));
  }
}

function kv(label, value) {
  return el("div", { style: "margin: 0.3rem 0" },
    el("span", { class: "muted" }, label + ": "),
    el("strong", {}, String(value || "—")),
  );
}