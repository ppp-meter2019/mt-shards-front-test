/**
 * Customer view:
 *   - browse the product catalog,
 *   - tick products + set quantities,
 *   - submit an order — backend forces customer = self,
 *   - see history of own orders.
 */

import { api } from "../api.js";
import { t } from "../i18n.js";
import { el, clear, flash, errorText } from "../ui.js";

export async function renderCustomer(host) {
  clear(host);

  const ordersCard = el("div", { class: "card" }, el("h2", {}, t("customer.myOrders")));
  const catalogCard = el("div", { class: "card" }, el("h2", {}, t("customer.createNew")));
  host.append(ordersCard, catalogCard);

  await refreshOrders(ordersCard);
  await renderCatalog(catalogCard, () => refreshOrders(ordersCard));
}

async function refreshOrders(card) {
  Array.from(card.children).slice(1).forEach((c) => c.remove());
  try {
    const data = await api.get("/api/orders/");
    const rows = Array.isArray(data) ? data : (data.results || []);
    if (!rows.length) {
      card.append(el("p", { class: "muted" }, t("customer.noOrders")));
      return;
    }
    const table = el("table", {},
      el("thead", {}, el("tr", {},
        el("th", {}, t("field.id")),
        el("th", {}, t("field.status")),
        el("th", {}, t("field.items")),
        el("th", {}, t("field.sum")),
        el("th", {}, t("field.created")),
      )),
      el("tbody", {}, ...rows.map((o) => {
        const total = (o.items || []).reduce((s, i) => s + Number(i.product_price) * i.quantity, 0);
        return el("tr", {},
          el("td", {}, o.id),
          el("td", {}, el("span", { class: "pill" }, o.status)),
          el("td", {}, (o.items || []).map((i) => `${i.product_name} ×${i.quantity}`).join(", ")),
          el("td", {}, total.toFixed(2)),
          el("td", {}, (o.created_at || "").slice(0, 10)),
        );
      })),
    );
    card.append(table);
  } catch (error) {
    card.append(el("div", { class: "message error" }, errorText(error)));
  }
}

async function renderCatalog(card, onCreated) {
  let products = [];
  try {
    const data = await api.get("/api/products/");
    products = Array.isArray(data) ? data : (data.results || []);
  } catch (error) {
    card.append(el("div", { class: "message error" }, errorText(error)));
    return;
  }

  if (!products.length) {
    card.append(el("p", { class: "muted" }, t("customer.emptyCatalog")));
    return;
  }

  const cart = new Map();
  const totalLabel = el("strong", {}, "0.00");

  function recomputeTotal() {
    let sum = 0;
    for (const [id, qty] of cart) {
      const p = products.find((x) => x.id === id);
      if (p) sum += Number(p.price) * qty;
    }
    totalLabel.textContent = sum.toFixed(2);
  }

  const list = el("table", {},
    el("thead", {}, el("tr", {},
      el("th", {}, ""),
      el("th", {}, t("field.product")),
      el("th", {}, t("field.price")),
      el("th", {}, t("field.quantity")),
    )),
    el("tbody", {}, ...products.map((p) => {
      const checkbox = el("input", {
        type: "checkbox",
        onchange: () => {
          if (checkbox.checked) {
            const q = Number(qtyInput.value) || 1;
            cart.set(p.id, q);
          } else {
            cart.delete(p.id);
          }
          recomputeTotal();
        },
      });
      const qtyInput = el("input", {
        type: "number", min: "1", value: "1", style: "width: 5rem",
        onchange: () => {
          const q = Math.max(1, Number(qtyInput.value) || 1);
          qtyInput.value = q;
          if (checkbox.checked) { cart.set(p.id, q); recomputeTotal(); }
        },
      });
      return el("tr", {},
        el("td", {}, checkbox),
        el("td", {}, p.name),
        el("td", {}, p.price),
        el("td", {}, qtyInput),
      );
    })),
  );

  const submit = el("button", { type: "button" }, t("customer.checkout"));
  submit.addEventListener("click", async () => {
    if (cart.size === 0) {
      flash(card, "error", t("customer.pickAtLeastOne"));
      return;
    }
    const items = Array.from(cart, ([product, quantity]) => ({ product, quantity }));
    submit.disabled = true;
    try {
      await api.post("/api/orders/", { items });
      flash(card, "ok", t("customer.orderCreated"));
      cart.clear();
      list.querySelectorAll("input[type=checkbox]").forEach((c) => (c.checked = false));
      recomputeTotal();
      await onCreated();
    } catch (e) {
      flash(card, "error", errorText(e));
    } finally {
      submit.disabled = false;
    }
  });

  const summary = el("div", { style: "margin-top: 0.75rem; display: flex; align-items: center; gap: 1rem" },
    el("span", {}, t("field.total")), totalLabel,
    submit,
  );

  card.append(list, summary);
}