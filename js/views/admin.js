/**
 * Admin dashboard.
 * - tenant_admin (on the public host) sees ONLY the Tenants tab.
 * - company_admin (on a tenant host) sees Cars, Drivers, Customers, Products,
 *   Orders, Routes.
 *
 * Each tab is a tiny CRUD: list on top, create-form below.
 *
 * All UI strings are looked up via i18n — tab labels and column headers are
 * resolved at render time so toggling UA/EN re-renders correctly.
 */

import { api } from "../api.js";
import { apex, getSession } from "../auth.js";
import { t } from "../i18n.js";
import { el, clear, flash, errorText } from "../ui.js";

export function renderAdmin(host) {
  clear(host);
  const session = getSession();
  const tabs = session.role === "tenant_admin" ? tenantAdminTabs() : companyAdminTabs();

  const tabBar = el("div", { class: "tabs" });
  const content = el("div");
  let active = tabs[0];

  function paint() {
    tabBar.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.id === active.id);
    });
    clear(content);
    active.render(content);
  }

  for (const tab of tabs) {
    const btn = el("button", {
      class: "tab",
      "data-id": tab.id,
      onclick: () => { active = tab; paint(); },
    }, tab.label);
    tabBar.append(btn);
  }

  host.append(tabBar, content);
  paint();
}

// ---------------------------------------------------------------------------
// Generic CRUD card builder.
// ---------------------------------------------------------------------------

function crudCard({ title, listEndpoint, createEndpoint, deleteEndpoint, columns, fields, transformCreate }) {
  return (host) => {
    const card = el("div", { class: "card" }, el("h2", {}, title));
    const tableWrap = el("div", {}, el("p", { class: "muted" }, t("common.loading")));
    const formWrap = el("div");
    card.append(tableWrap, formWrap);
    host.append(card);

    async function refresh() {
      try {
        const data = await api.get(listEndpoint);
        const rows = Array.isArray(data) ? data : (data.results || []);
        renderTable(rows);
      } catch (error) {
        clear(tableWrap);
        tableWrap.append(el("div", { class: "message error" }, errorText(error)));
      }
    }

    function renderTable(rows) {
      clear(tableWrap);
      if (!rows.length) {
        tableWrap.append(el("p", { class: "muted" }, t("common.empty")));
      } else {
        const table = el("table");
        const thead = el("thead", {}, el("tr", {},
          ...columns.map((c) => el("th", {}, c.label)),
          deleteEndpoint ? el("th", {}, "") : null,
        ));
        const tbody = el("tbody");
        for (const row of rows) {
          const tr = el("tr", {},
            ...columns.map((c) => el("td", {}, c.render ? c.render(row) : (row[c.key] ?? ""))),
            deleteEndpoint ? el("td", {},
              el("button", {
                class: "danger",
                onclick: async () => {
                  if (!confirm(t("common.confirmDelete") + row.id + "?")) return;
                  try {
                    await api.delete(deleteEndpoint(row));
                    await refresh();
                  } catch (e) { flash(card, "error", errorText(e)); }
                },
              }, t("common.delete")),
            ) : null,
          );
          tbody.append(tr);
        }
        table.append(thead, tbody);
        tableWrap.append(table);
      }
    }

    if (fields && createEndpoint) {
      formWrap.append(el("h3", {}, t("common.create")));
      const form = el("form", { class: "row" });
      for (const f of fields) {
        const wrap = el("div", { style: "min-width: 160px" });
        wrap.append(el("label", {}, f.label));
        const input = el(f.type === "textarea" ? "textarea" : "input", {
          name: f.name,
          type: f.type === "textarea" ? undefined : (f.type || "text"),
          required: f.required ? true : undefined,
          step: f.step,
        });
        wrap.append(input);
        form.append(wrap);
      }
      const submit = el("div", { style: "align-self: flex-end" },
        el("button", { type: "submit" }, t("common.add")));
      form.append(submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const payload = transformCreate ? transformCreate(data) : data;
        try {
          await api.post(createEndpoint, payload);
          form.reset();
          flash(card, "ok", t("common.added"));
          await refresh();
        } catch (e) { flash(card, "error", errorText(e)); }
      });
      formWrap.append(form);
    }

    refresh();
  };
}

// ---------------------------------------------------------------------------
// tenant_admin tabs — built fresh on each render so labels reflect lang.
// ---------------------------------------------------------------------------

function tenantAdminTabs() {
  return [
    {
      id: "tenants",
      label: t("tab.tenants"),
      render: renderTenantsAdmin,
    },
    {
      id: "shards",
      label: t("tab.shards"),
      render: renderShardsAdmin,
    },
  ];
}

/**
 * "Shards" tab: list shards (status, tenant count, created/modified) and
 * manage them under strict rules enforced by the backend:
 *   - default shard       → read-only (no buttons);
 *   - active shard        → [Deactivate] (disabled while it hosts tenants);
 *   - deactivated shard   → [Activate] [Delete].
 */
async function renderShardsAdmin(host) {
  const card = el("div", { class: "card" }, el("h2", {}, t("tab.shards")));
  const tableWrap = el("div", {}, el("p", { class: "muted" }, t("common.loading")));
  card.append(tableWrap);
  host.append(card);

  const formatTs = (iso) =>
    !iso ? "—" : iso.replace("T", " ").replace(/\..*$/, "").replace(/[+-]\d\d:?\d\d$/, "");

  async function refresh() {
    try {
      const data = await api.get("/api/shards/");
      renderTable(Array.isArray(data) ? data : (data.results || []));
    } catch (error) {
      clear(tableWrap);
      tableWrap.append(el("div", { class: "message error" }, errorText(error)));
    }
  }

  function statusLabel(row) {
    if (row.is_default) return t("shard.status.default");
    return row.is_active ? t("status.active") : t("status.deactivated");
  }

  async function act(row, kind) {
    try {
      if (kind === "delete") {
        if (!confirm(t("shard.confirmDelete") + (row.name || row.alias) + "?")) return;
        await api.delete(`/api/shards/${row.id}/`);
      } else {
        await api.post(`/api/shards/${row.id}/${kind}/`, {});
      }
      flash(card, "ok", t(`shard.action.${kind}.success`));
      await refresh();
    } catch (e) {
      flash(card, "error", errorText(e));
    }
  }

  function renderActions(row) {
    const cell = el("td", { class: "inline-actions" });
    if (row.is_default) {
      cell.append(el("span", { class: "muted" }, t("shard.readonly")));
    } else if (row.is_active) {
      const hasTenants = (row.tenant_count || 0) > 0;
      cell.append(el("button", {
        disabled: hasTenants,
        title: hasTenants ? t("shard.deactivate.hasTenants") : "",
        onclick: () => act(row, "deactivate"),
      }, t("shard.action.deactivate")));
    } else {
      cell.append(
        el("button", { onclick: () => act(row, "activate") }, t("shard.action.activate")),
        el("button", { class: "danger", onclick: () => act(row, "delete") }, t("common.delete")),
      );
    }
    return cell;
  }

  function renderTable(rows) {
    clear(tableWrap);
    if (!rows.length) {
      tableWrap.append(el("p", { class: "muted" }, t("common.empty")));
      return;
    }
    const thead = el("thead", {}, el("tr", {},
      el("th", {}, t("field.shard")),
      el("th", {}, t("field.status")),
      el("th", {}, t("field.tenantCount")),
      el("th", {}, t("field.created")),
      el("th", {}, t("field.modified")),
      el("th", {}, t("field.actions")),
    ));
    const tbody = el("tbody");
    for (const row of rows) {
      tbody.append(el("tr", {},
        el("td", {}, `${row.name || row.alias} [${row.alias}]`),
        el("td", {}, el("span", { class: "pill" }, statusLabel(row))),
        el("td", {}, row.tenant_count == null ? "—" : String(row.tenant_count)),
        el("td", {}, formatTs(row.created_on)),
        el("td", {}, formatTs(row.modified)),
        renderActions(row),
      ));
    }
    tableWrap.append(el("table", {}, thead, tbody));
  }

  await refresh();
}

/**
 * Custom render for the "Tenants" tab (instead of generic crudCard).
 *
 * Why separate: the `domain` is computed from schema_name + apex() rather
 * than typed, the create form needs a shard dropdown (fetched from
 * /api/shards/), and the per-row action buttons are conditional on the
 * tenant's (schema_exists, status) state machine.
 *
 * Action button matrix (driven by status + schema_exists):
 *   schema_exists=false, status=NEW         → [Create Schema]    (no-op placeholder)
 *   schema_exists=true,  status=NEW         → [Run Migrations]   (no-op placeholder)
 *   schema_exists=*,     status=PENDING     → "Pending since: <ts>"
 *   schema_exists=*,     status=FAILED      → "Failed since: <ts>" + last_error
 *   schema_exists=true,  status=ACTIVE      → [Deactivate] [Create Admin]
 *   schema_exists=true,  status=DEACTIVATED → [Activate]
 *
 * After any state-changing call the row is re-fetched via refresh().
 */
async function renderTenantsAdmin(host) {
  const card = el("div", { class: "card" }, el("h2", {}, t("tab.tenants")));
  const tableWrap = el("div", {}, el("p", { class: "muted" }, t("common.loading")));
  const formWrap = el("div");
  card.append(tableWrap, formWrap);
  host.append(card);

  // apex() — the helper also used by auth.js for tenant detection: returns
  // APP_DOMAIN as-is (or, in dev, derives it from window.location.hostname).
  // The same formula in both places guarantees that the hostname we create
  // here is what detectTenant() will see on login.

  let shards = [];

  async function loadShards() {
    try {
      const data = await api.get("/api/shards/");
      const all = Array.isArray(data) ? data : (data.results || []);
      // /api/shards/ now lists ALL shards (for the management tab); the tenant
      // create-form only offers active, non-default shards for placement.
      shards = all.filter((s) => s.is_active && !s.is_default);
    } catch (error) {
      shards = [];
      flash(card, "error", errorText(error));
    }
  }

  async function refresh() {
    try {
      const data = await api.get("/api/tenants/");
      const rows = Array.isArray(data) ? data : (data.results || []);
      renderTable(rows);
    } catch (error) {
      clear(tableWrap);
      tableWrap.append(el("div", { class: "message error" }, errorText(error)));
    }
  }

  function renderTable(rows) {
    clear(tableWrap);
    if (!rows.length) {
      tableWrap.append(el("p", { class: "muted" }, t("common.empty")));
      return;
    }
    const table = el("table");
    const thead = el("thead", {}, el("tr", {},
      el("th", {}, t("field.schema")),
      el("th", {}, t("field.name")),
      el("th", {}, t("field.shard")),
      el("th", {}, t("field.status")),
      el("th", {}, t("field.schemaExists")),
      el("th", {}, t("field.lastMigration")),
      el("th", {}, t("field.domains")),
      el("th", {}, t("field.admins")),
      el("th", {}, t("field.actions")),
    ));
    const tbody = el("tbody");
    for (const row of rows) {
      tbody.append(renderTenantRow(row, tbody));
    }
    table.append(thead, tbody);
    tableWrap.append(table);
  }

  function renderTenantRow(row, tbody) {
    const shardLabel = row.shard ? `${row.shard.name || row.shard.alias} [${row.shard.alias}]` : "—";

    const adminsCell = el("td", {});
    const admins = row.admins || [];
    if (!admins.length) {
      adminsCell.append(el("span", { class: "muted" }, "—"));
    } else {
      for (const a of admins) {
        const pill = el("span", {
          class: "pill",
          style: a.is_active ? "margin-right: 4px" : "margin-right: 4px; opacity: 0.5; text-decoration: line-through",
        }, a.username);
        adminsCell.append(pill);
      }
    }

    const schemaCell = row.schema_exists
      ? el("td", {}, t("tenant.schema.yes"))
      : el("td", {}, el("span", { class: "muted" }, t("tenant.schema.no")));

    const lm = row.last_migration;
    const migrationCell = lm
      ? el("td", {},
          el("span", {}, `${lm.app}.${lm.name}`),
          lm.applied
            ? el("span", { class: "muted", style: "margin-left: 6px" }, formatTs(lm.applied))
            : null,
        )
      : el("td", {}, el("span", { class: "muted" }, "—"));

    const tr = el("tr", {},
      el("td", {}, row.schema_name),
      el("td", {}, row.name),
      el("td", {}, shardLabel),
      el("td", {}, el("span", { class: "pill" }, t(`status.${row.status}`))),
      schemaCell,
      migrationCell,
      el("td", {}, (row.domains || []).map((d) => d.domain).join(", ")),
      adminsCell,
      el("td", { class: "inline-actions" }),
    );

    fillActions(tr.lastChild, row, tr, tbody);
    return tr;
  }

  function fillActions(cell, row, anchorTr, tbody) {
    // The public/management tenant is shown but read-only: it is a system
    // record the backend rejects every write on. No action buttons for it.
    if (row.is_public) {
      cell.append(el("span", { class: "muted" }, t("tenant.readonly")));
      return;
    }

    // Action buttons driven by the (schema_exists, status) state machine.
    // Buttons marked "no-op" are intentional placeholders — the UI shows
    // the right affordance but the backend wiring isn't built yet.
    if (row.status === "new") {
      if (!row.schema_exists) {
        cell.append(el("button", { disabled: true, title: "not wired yet" }, t("tenant.action.createSchema")));
      } else {
        cell.append(el("button", { disabled: true, title: "not wired yet" }, t("tenant.action.runMigrations")));
      }
    } else if (row.status === "pending") {
      cell.append(el("span", { class: "muted" }, `${t("tenant.pending.since")} ${formatTs(row.status_changed_at)}`));
    } else if (row.status === "failed") {
      cell.append(el("div", {},
        el("span", { class: "muted" }, `${t("tenant.failed.since")} ${formatTs(row.status_changed_at)}`),
        row.last_error
          ? el("div", { class: "muted", style: "font-size: 0.85em; margin-top: 0.2rem; max-width: 320px; word-break: break-word" }, row.last_error)
          : null,
      ));
    } else if (row.status === "active") {
      cell.append(
        el("button", {
          onclick: () => transition(row, "deactivate", t("tenant.action.deactivated.success")),
        }, t("tenant.action.deactivate")),
        el("button", {
          onclick: () => toggleCreateAdminRow(row, anchorTr, tbody),
        }, t("tenant.createAdmin.button")),
      );
    } else if (row.status === "deactivated") {
      cell.append(el("button", {
        onclick: () => transition(row, "activate", t("tenant.action.activated.success")),
      }, t("tenant.action.activate")));
    }

    cell.append(el("button", {
      class: "danger",
      onclick: async () => {
        if (!confirm(t("common.confirmDelete") + row.id + "?")) return;
        try {
          await api.delete(`/api/tenants/${row.id}/`);
          await refresh();
        } catch (e) { flash(card, "error", errorText(e)); }
      },
    }, t("common.delete")));
  }

  async function transition(tenant, endpoint, successMsg) {
    try {
      await api.post(`/api/tenants/${tenant.id}/${endpoint}/`, {});
      flash(card, "ok", successMsg);
      await refresh();
    } catch (e) {
      flash(card, "error", errorText(e));
    }
  }

  function formatTs(iso) {
    if (!iso) return "—";
    // "2026-05-29T14:08:42.123456+00:00" → "2026-05-29 14:08:42"
    return iso.replace("T", " ").replace(/\..*$/, "").replace(/[+-]\d\d:?\d\d$/, "");
  }

  /**
   * Toggle an inline form row directly under the tenant row for creating
   * the first company-admin. One open form at a time — opening a new one
   * removes any previous instance.
   */
  function toggleCreateAdminRow(tenant, anchorTr, tbody) {
    tbody.querySelectorAll(".admin-form-row").forEach((n) => n.remove());

    if (anchorTr.dataset.adminFormOpen === "1") {
      anchorTr.dataset.adminFormOpen = "";
      return;
    }
    anchorTr.dataset.adminFormOpen = "1";

    const username = el("input", { placeholder: "admin", required: true, autocomplete: "off" });
    const password = el("input", { type: "password", required: true, autocomplete: "new-password" });
    const submit = el("button", { type: "button" }, t("common.create"));
    const cancel = el("button", { type: "button", class: "secondary" }, t("common.cancel"));

    function close() {
      formRow.remove();
      anchorTr.dataset.adminFormOpen = "";
    }
    cancel.addEventListener("click", close);

    submit.addEventListener("click", async () => {
      const u = username.value.trim();
      const p = password.value;
      if (!u || !p) { return; }
      submit.disabled = true;
      try {
        await api.post(`/api/tenants/${tenant.id}/create-admin/`, { username: u, password: p });
        flash(card, "ok", `${t("tenant.createAdmin.success")} (${u} @ ${tenant.schema_name})`);
        close();
        await refresh();
      } catch (e) {
        flash(card, "error", errorText(e));
      } finally {
        submit.disabled = false;
      }
    });

    const formRow = el("tr", { class: "admin-form-row" },
      el("td", { colspan: 8 },
        el("div", { style: "display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; padding: 0.4rem 0" },
          el("span", { class: "muted" }, t("tenant.createAdmin.helper")),
          username,
          password,
          submit,
          cancel,
        ),
      ),
    );
    anchorTr.insertAdjacentElement("afterend", formRow);
    username.focus();
  }

  // -------------------------------------------------------------------
  // Create form. Built once after shards are loaded; submit POSTs
  // {schema_name, name, shard_id, domain} and re-fetches the list.
  // -------------------------------------------------------------------

  await loadShards();

  formWrap.append(el("h3", {}, t("common.create")));

  const schemaInput = el("input", { name: "schema_name", required: true, placeholder: "delta" });
  const nameInput = el("input", { name: "name", required: true, placeholder: "Delta LLC" });
  const shardSelect = el("select", { name: "shard_id", required: true },
    el("option", { value: "" }, t("tenant.shard.placeholder")),
    ...shards.map((s) => el("option", { value: s.id }, `${s.name || s.alias} [${s.alias}]`)),
  );
  const domainPreview = el("code", { style: "background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 4px" }, "—");

  function updatePreview() {
    const schema = (schemaInput.value || "").toLowerCase().trim();
    domainPreview.textContent = schema ? `${schema}.${apex()}` : "—";
  }
  schemaInput.addEventListener("input", updatePreview);

  const form = el("form", { class: "row" },
    el("div", { style: "min-width: 160px" },
      el("label", {}, t("tenant.field.schema")),
      schemaInput,
    ),
    el("div", { style: "min-width: 220px" },
      el("label", {}, t("tenant.field.name")),
      nameInput,
    ),
    el("div", { style: "min-width: 220px" },
      el("label", {}, t("tenant.field.shard")),
      shardSelect,
    ),
    el("div", { style: "min-width: 240px" },
      el("label", {}, t("tenant.field.domain")),
      el("div", { style: "padding-top: 0.4rem" }, domainPreview),
    ),
    el("div", { style: "align-self: flex-end" }, el("button", { type: "submit" }, t("common.add"))),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const schema = (schemaInput.value || "").toLowerCase().trim();
    const shardId = shardSelect.value;
    if (!shardId) {
      flash(card, "error", t("tenant.shard.placeholder"));
      return;
    }
    const payload = {
      schema_name: schema,
      name: nameInput.value.trim(),
      shard_id: Number(shardId),
      domain: `${schema}.${apex()}`,
    };
    try {
      await api.post("/api/tenants/", payload);
      flash(card, "ok", t("common.added"));
      form.reset();
      updatePreview();
      await refresh();
    } catch (e) {
      flash(card, "error", errorText(e));
    }
  });
  formWrap.append(form);

  refresh();
}

// ---------------------------------------------------------------------------
// company_admin tabs
// ---------------------------------------------------------------------------

function companyAdminTabs() {
  return [
    {
      id: "products",
      label: t("tab.products"),
      render: crudCard({
        title: t("tab.products"),
        listEndpoint: "/api/products/",
        createEndpoint: "/api/products/",
        deleteEndpoint: (row) => `/api/products/${row.id}/`,
        columns: [
          { key: "id", label: t("field.id") },
          { key: "name", label: t("field.name") },
          { key: "price", label: t("field.price") },
        ],
        fields: [
          { name: "name", label: t("field.name"), required: true },
          { name: "price", label: t("field.price"), required: true, type: "number", step: "0.01" },
        ],
      }),
    },
    {
      id: "cars",
      label: t("tab.cars"),
      render: crudCard({
        title: t("tab.cars"),
        listEndpoint: "/api/cars/",
        createEndpoint: "/api/cars/",
        deleteEndpoint: (row) => `/api/cars/${row.id}/`,
        columns: [
          { key: "id", label: t("field.id") },
          { key: "brand", label: t("field.brand") },
          { key: "model", label: t("field.model") },
          { key: "year", label: t("field.year") },
          { key: "license_plate", label: t("field.licensePlate") },
        ],
        fields: [
          { name: "brand", label: t("field.brand"), required: true },
          { name: "model", label: t("field.model"), required: true },
          { name: "year", label: t("field.year"), required: true, type: "number" },
          { name: "license_plate", label: t("field.licensePlate"), required: true },
        ],
        transformCreate: (d) => ({ ...d, year: Number(d.year) }),
      }),
    },
    {
      id: "drivers",
      label: t("tab.drivers"),
      render: crudCard({
        title: t("tab.drivers"),
        listEndpoint: "/api/drivers/",
        createEndpoint: "/api/drivers/",
        deleteEndpoint: (row) => `/api/drivers/${row.id}/`,
        columns: [
          { key: "id", label: t("field.id") },
          { key: "username", label: t("field.username") },
          { key: "first_name", label: t("field.firstName") },
          { key: "last_name", label: t("field.lastName") },
          { key: "date_of_birth", label: t("field.dateOfBirth") },
          { key: "license_number", label: t("field.licenseNumber") },
        ],
        fields: [
          { name: "username", label: t("field.username"), required: true },
          { name: "password", label: t("field.password"), required: true, type: "password" },
          { name: "first_name", label: t("field.firstName"), required: true },
          { name: "last_name", label: t("field.lastName"), required: true },
          { name: "date_of_birth", label: t("field.dateOfBirth"), required: true, type: "date" },
          { name: "license_number", label: t("field.licenseNumber"), required: true },
        ],
      }),
    },
    {
      id: "customers",
      label: t("tab.customers"),
      render: crudCard({
        title: t("tab.customers"),
        listEndpoint: "/api/customers/",
        createEndpoint: "/api/customers/",
        deleteEndpoint: (row) => `/api/customers/${row.id}/`,
        columns: [
          { key: "id", label: t("field.id") },
          { key: "username", label: t("field.username") },
          { key: "first_name", label: t("field.firstName") },
          { key: "last_name", label: t("field.lastName") },
          { key: "phone", label: t("field.phone") },
        ],
        fields: [
          { name: "username", label: t("field.username"), required: true },
          { name: "password", label: t("field.password"), required: true, type: "password" },
          { name: "first_name", label: t("field.firstName") },
          { name: "last_name", label: t("field.lastName") },
          { name: "email", label: t("field.email") },
          { name: "phone", label: t("field.phone") },
          { name: "address", label: t("field.address") },
        ],
      }),
    },
    {
      id: "orders",
      label: t("tab.orders"),
      render: renderOrdersAdmin,
    },
    {
      id: "routes",
      label: t("tab.routes"),
      render: renderRoutesAdmin,
    },
  ];
}

// ---------------------------------------------------------------------------
// Orders / Routes need richer UI than the generic helper supports
// ---------------------------------------------------------------------------

async function renderOrdersAdmin(host) {
  const card = el("div", { class: "card" }, el("h2", {}, t("tab.orders")));
  host.append(card);
  try {
    const orders = await api.get("/api/orders/");
    const rows = Array.isArray(orders) ? orders : (orders.results || []);
    if (!rows.length) {
      card.append(el("p", { class: "muted" }, t("orders.empty")));
      return;
    }
    const table = el("table", {},
      el("thead", {}, el("tr", {},
        el("th", {}, t("field.id")),
        el("th", {}, t("field.customer")),
        el("th", {}, t("field.status")),
        el("th", {}, t("field.items")),
        el("th", {}, t("field.created")),
      )),
      el("tbody", {}, ...rows.map((o) => el("tr", {},
        el("td", {}, o.id),
        el("td", {}, o.customer),
        el("td", {}, el("span", { class: "pill" }, o.status)),
        el("td", {}, (o.items || []).map((i) => `${i.product_name} ×${i.quantity}`).join(", ")),
        el("td", {}, (o.created_at || "").slice(0, 10)),
      ))),
    );
    card.append(table);
  } catch (e) {
    card.append(el("div", { class: "message error" }, errorText(e)));
  }
}

async function renderRoutesAdmin(host) {
  const card = el("div", { class: "card" }, el("h2", {}, t("tab.routes")));
  host.append(card);

  let drivers = [], cars = [], orders = [], routes = [];
  try {
    [drivers, cars, orders, routes] = await Promise.all([
      api.get("/api/drivers/"),
      api.get("/api/cars/"),
      api.get("/api/orders/"),
      api.get("/api/routes/"),
    ]);
  } catch (e) {
    card.append(el("div", { class: "message error" }, errorText(e)));
    return;
  }
  drivers = drivers.results || drivers;
  cars = cars.results || cars;
  orders = orders.results || orders;
  routes = routes.results || routes;

  if (routes.length) {
    const tbl = el("table", {},
      el("thead", {}, el("tr", {},
        el("th", {}, t("field.id")),
        el("th", {}, t("field.name")),
        el("th", {}, t("field.driver")),
        el("th", {}, t("field.car")),
        el("th", {}, t("field.orders")),
        el("th", {}, t("field.status")),
      )),
      el("tbody", {}, ...routes.map((r) => el("tr", {},
        el("td", {}, r.id),
        el("td", {}, r.name),
        el("td", {}, labelDriver(drivers.find((d) => d.id === r.driver))),
        el("td", {}, labelCar(cars.find((c) => c.id === r.car))),
        el("td", {}, (r.orders || []).join(", ") || "—"),
        el("td", {}, el("span", { class: "pill" }, r.status)),
      ))),
    );
    card.append(tbl);
  } else {
    card.append(el("p", { class: "muted" }, t("routes.empty")));
  }

  card.append(el("h3", {}, t("routes.new")));
  const form = el("form", { class: "row" });
  const inputName = el("input", { name: "name", required: true });
  const selectDriver = el("select", { name: "driver", required: true },
    el("option", { value: "" }, t("routes.placeholder.driver")),
    ...drivers.map((d) => el("option", { value: d.id }, labelDriver(d))),
  );
  const selectCar = el("select", { name: "car", required: true },
    el("option", { value: "" }, t("routes.placeholder.car")),
    ...cars.map((c) => el("option", { value: c.id }, labelCar(c))),
  );
  const ordersBox = el("select", { name: "orders", multiple: true, size: Math.min(6, Math.max(3, orders.length)) },
    ...orders.map((o) => el("option", { value: o.id }, `#${o.id} — ${o.customer} (${o.status})`)),
  );
  const selectStatus = el("select", { name: "status" },
    ...["planned", "active", "completed", "cancelled"].map((s) => el("option", { value: s }, s)),
  );

  form.append(
    formField(t("field.name"), inputName),
    formField(t("field.driver"), selectDriver),
    formField(t("field.car"), selectCar),
    formField(t("routes.placeholder.orders"), ordersBox),
    formField(t("field.status"), selectStatus),
    el("div", { style: "align-self: flex-end" }, el("button", { type: "submit" }, t("common.create"))),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const orderIds = Array.from(ordersBox.selectedOptions).map((o) => Number(o.value));
    const payload = {
      name: inputName.value.trim(),
      driver: Number(selectDriver.value),
      car: Number(selectCar.value),
      orders: orderIds,
      status: selectStatus.value,
    };
    try {
      await api.post("/api/routes/", payload);
      flash(card, "ok", t("routes.created"));
      renderRoutesAdmin(host);
      card.remove();
    } catch (e) { flash(card, "error", errorText(e)); }
  });
  card.append(form);
}

function formField(label, input) {
  return el("div", { style: "min-width: 180px" },
    el("label", {}, label),
    input,
  );
}

function labelDriver(d) {
  if (!d) return "—";
  return `${d.first_name || ""} ${d.last_name || ""} (${d.username})`.trim();
}
function labelCar(c) {
  if (!c) return "—";
  return `${c.brand} ${c.model} [${c.license_plate}]`;
}
