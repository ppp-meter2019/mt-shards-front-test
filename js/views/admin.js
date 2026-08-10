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
import { getSession } from "../auth.js";
import { t } from "../i18n.js";
import { el, clear, flash, errorText, modal } from "../ui.js";

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

function crudCard({ title, listEndpoint, createEndpoint, deleteEndpoint, columns, fields, transformCreate, headerActions }) {
  return (host) => {
    const card = el("div", { class: "card" });
    const header = el("div", { class: "card-header" }, el("h2", {}, title));
    const tableWrap = el("div", {}, el("p", { class: "muted" }, t("common.loading")));
    const formWrap = el("div");
    card.append(header, tableWrap, formWrap);
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

    // Optional header buttons (e.g. "Generate 2 products"); placed after refresh
    // so a handler can re-list once its action is queued/done.
    for (const a of (headerActions || [])) {
      header.append(el("button", {
        class: a.class,
        onclick: () => a.run({ card, refresh }),
      }, a.label));
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
    {
      id: "reserved",
      label: t("tab.reserved"),
      render: renderReservedHostsAdmin,
    },
  ];
}

/**
 * "Reserved hosts" tab: manage the deny rules that stop business tenants from
 * claiming service subdomains (www/api/admin/...) and platform hosts. Backed by
 * /api/reserved-hosts/ (CRUD + /{id}/conflicts/). Enforced server-side on tenant
 * and domain creation.
 */
async function renderReservedHostsAdmin(host) {
  const card = el("div", { class: "card" }, el("h2", {}, t("tab.reserved")));
  card.append(el("p", { class: "muted" }, t("reserved.help")));
  const tableWrap = el("div", {}, el("p", { class: "muted" }, t("common.loading")));
  const formWrap = el("div");
  card.append(tableWrap, formWrap);
  host.append(card);

  const formatTs = (iso) =>
    !iso ? "—" : iso.replace("T", " ").replace(/\..*$/, "").replace(/[+-]\d\d:?\d\d$/, "");
  const typeLabel = (mt) => t(`reserved.matchType.${mt}`);

  async function refresh() {
    try {
      const data = await api.get("/api/reserved-hosts/");
      renderTable(Array.isArray(data) ? data : (data.results || []));
    } catch (error) {
      clear(tableWrap);
      tableWrap.append(el("div", { class: "message error" }, errorText(error)));
    }
  }

  async function toggleActive(row) {
    try {
      await api.patch(`/api/reserved-hosts/${row.id}/`, { is_active: !row.is_active });
      flash(card, "ok", t("reserved.toggled"));
      await refresh();
    } catch (e) { flash(card, "error", errorText(e)); }
  }

  async function del(row) {
    if (!confirm(t("reserved.confirmDelete") + `"${row.value}"?`)) return;
    try {
      await api.delete(`/api/reserved-hosts/${row.id}/`);
      flash(card, "ok", t("reserved.deleted"));
      await refresh();
    } catch (e) { flash(card, "error", errorText(e)); }
  }

  async function showConflicts(row) {
    const body = el("div", {}, el("p", { class: "muted" }, t("common.loading")));
    modal(`${t("reserved.conflicts.title")} — ${row.value}`, body);
    try {
      const data = await api.get(`/api/reserved-hosts/${row.id}/conflicts/`);
      clear(body);
      if (!data.count) {
        body.append(el("p", { class: "muted" }, t("reserved.conflicts.none")));
        return;
      }
      body.append(el("p", {}, `${t("reserved.conflicts.count")} ${data.count}`));
      if (data.sample) {
        body.append(el("p", { class: "muted", style: "font-size: 0.85em" },
          `${t("reserved.conflicts.sampleShown")} ${data.domains.length} / ${data.count}`));
      }
      body.append(el("table", {},
        el("thead", {}, el("tr", {},
          el("th", {}, t("field.domains")), el("th", {}, t("field.schema")))),
        el("tbody", {}, ...data.domains.map((d) => el("tr", {},
          el("td", {}, d.domain), el("td", {}, d.tenant)))),
      ));
    } catch (e) {
      clear(body);
      body.append(el("div", { class: "message error" }, errorText(e)));
    }
  }

  function renderTable(rows) {
    clear(tableWrap);
    if (!rows.length) {
      tableWrap.append(el("p", { class: "muted" }, t("common.empty")));
      return;
    }
    const thead = el("thead", {}, el("tr", {},
      el("th", {}, t("reserved.field.matchType")),
      el("th", {}, t("reserved.field.value")),
      el("th", {}, t("reserved.field.base")),
      el("th", {}, t("reserved.field.active")),
      el("th", {}, t("reserved.field.note")),
      el("th", {}, t("field.modified")),
      el("th", {}, t("field.actions")),
    ));
    const tbody = el("tbody");
    for (const row of rows) {
      tbody.append(el("tr", {},
        el("td", {}, typeLabel(row.match_type)),
        el("td", {}, el("code", {}, row.value)),
        el("td", {}, row.base_domain || "—"),
        el("td", {}, el("span", { class: "pill" },
          row.is_active ? t("reserved.active.yes") : t("reserved.active.no"))),
        el("td", {}, row.note || "—"),
        el("td", {}, formatTs(row.modified)),
        el("td", { class: "inline-actions" },
          el("button", { class: "secondary", onclick: () => showConflicts(row) },
            t("reserved.action.conflicts")),
          el("button", { onclick: () => toggleActive(row) },
            row.is_active ? t("reserved.action.disable") : t("reserved.action.enable")),
          el("button", { class: "danger", onclick: () => del(row) }, t("common.delete")),
        ),
      ));
    }
    tableWrap.append(el("table", {}, thead, tbody));
  }

  // -------------------------------------------------------------------
  // Create form. base_domain is only meaningful for match_type=label;
  // it's enabled only then (the backend clears it for exact/suffix anyway).
  // -------------------------------------------------------------------
  formWrap.append(el("h3", {}, t("reserved.add")));

  const typeSelect = el("select", { name: "match_type" },
    el("option", { value: "label" }, t("reserved.matchType.label")),
    el("option", { value: "exact" }, t("reserved.matchType.exact")),
    el("option", { value: "suffix" }, t("reserved.matchType.suffix")),
  );
  const valueInput = el("input", { name: "value", required: true, placeholder: "www" });
  const baseInput = el("input", { name: "base_domain", placeholder: t("reserved.base.placeholder") });
  const noteInput = el("input", { name: "note" });

  function syncBase() {
    const isLabel = typeSelect.value === "label";
    baseInput.disabled = !isLabel;
    if (!isLabel) baseInput.value = "";
    valueInput.placeholder = isLabel ? "www" : "manage.routegenie.com";
  }
  typeSelect.addEventListener("change", syncBase);
  syncBase();

  const form = el("form", { class: "row" },
    formField(t("reserved.field.matchType"), typeSelect),
    formField(t("reserved.field.value"), valueInput),
    el("div", { style: "min-width: 200px" },
      el("label", {}, t("reserved.field.base")),
      baseInput,
      el("div", { class: "muted", style: "font-size: 0.8em; margin-top: 0.2rem" }, t("reserved.base.hint")),
    ),
    formField(t("reserved.field.note"), noteInput),
    el("div", { style: "align-self: flex-end" }, el("button", { type: "submit" }, t("common.add"))),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      match_type: typeSelect.value,
      value: valueInput.value.trim(),
      base_domain: typeSelect.value === "label" ? baseInput.value.trim() : "",
      note: noteInput.value.trim(),
    };
    try {
      await api.post("/api/reserved-hosts/", payload);
      flash(card, "ok", t("reserved.added"));
      form.reset();
      syncBase();
      await refresh();
    } catch (e) { flash(card, "error", errorText(e)); }
  });
  formWrap.append(form);

  await refresh();
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

  async function showSchemas(row) {
    const body = el("div", {}, el("p", { class: "muted" }, t("common.loading")));
    modal(`\\dn+ — ${row.name || row.alias}`, body);
    try {
      const data = await api.get(`/api/shards/${row.id}/schemas/`);
      clear(body);
      body.append(el("pre", { class: "console" }, data.output));
    } catch (e) {
      clear(body);
      body.append(el("div", { class: "message error" }, errorText(e)));
    }
  }

  function renderActions(row) {
    const cell = el("td", { class: "inline-actions" });
    // Low-level DB peek — available for every shard (incl. the default one).
    cell.append(el("button", {
      class: "secondary",
      onclick: () => showSchemas(row),
    }, t("shard.lowlevel")));
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
  let baseDomains = [];

  async function loadBaseDomains() {
    try {
      const data = await api.get("/api/base-domains/");
      baseDomains = data.base_domains || [];
    } catch (error) {
      baseDomains = [];
      flash(card, "error", errorText(error));
    }
  }

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
      el("th", {}, t("field.companyName")),
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
      el("td", { title: row.description || "" }, row.company_name),
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

    // Action buttons driven by the tenant status. Provisioning runs ONLY on a
    // NEW tenant (the backend rejects re-provisioning); every other status
    // shows its own affordance instead.
    if (row.status === "new") {
      cell.append(el("button", {
        onclick: () => transition(row, "provision", t("tenant.action.provision.success")),
      }, t("tenant.action.provision")));
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
      class: "secondary",
      onclick: () => openEditTenant(row),
    }, t("tenant.edit.button")));

    cell.append(el("button", {
      class: "danger",
      onclick: () => confirmDeleteTenant(row),
    }, t("common.delete")));
  }

  function confirmDeleteTenant(row) {
    const dropChk = el("input", { type: "checkbox" });
    let close;
    const doDelete = async () => {
      const drop = dropChk.checked;
      close();
      try {
        // ?drop_schema=true → backend queues a service task that drops the
        // schema on the tenant's shard after the row is removed.
        await api.delete(`/api/tenants/${row.id}/${drop ? "?drop_schema=true" : ""}`);
        flash(card, "ok", drop ? t("tenant.delete.queuedDrop") : t("tenant.delete.done"));
        await refresh();
      } catch (e) { flash(card, "error", errorText(e)); }
    };
    const body = el("div", {},
      el("p", {}, `${t("tenant.delete.confirm")} "${row.schema_name}"?`),
      el("label", { style: "display:flex; align-items:center; gap:0.5rem; font-weight:normal; margin:0.6rem 0" },
        dropChk, t("tenant.delete.dropSchema")),
      el("div", { style: "margin-top:1rem; display:flex; gap:0.5rem" },
        el("button", { class: "danger", onclick: doDelete }, t("common.delete")),
        el("button", { class: "secondary", onclick: () => close() }, t("common.cancel")),
      ),
    );
    close = modal(t("tenant.delete.title"), body);
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
  // Edit modal: company_name + description + primary domain. schema_name is
  // immutable (shown read-only); shard is not editable here. Domain uses the
  // same picker, initialized from the tenant's current primary domain.
  // -------------------------------------------------------------------
  function openEditTenant(row) {
    const company = el("input", { required: true, value: row.company_name || "" });
    const desc = el("textarea", { rows: 2 });
    desc.value = row.description || "";
    const picker = makeDomainPicker(baseDomains, () => {});
    const primary = (row.domains || []).find((d) => d.is_primary) || (row.domains || [])[0];
    if (primary) picker.init(primary.domain);

    let close;
    const save = async () => {
      if (!company.value.trim()) { flash(card, "error", t("tenant.form.incomplete")); return; }
      const domErr = picker.selected() ? picker.validate() : null;
      if (domErr) { flash(card, "error", domErr); return; }
      const payload = { company_name: company.value.trim(), description: desc.value.trim() };
      if (picker.selected()) payload.domain = picker.value();   // omit => keep current
      try {
        await api.patch(`/api/tenants/${row.id}/`, payload);
        flash(card, "ok", t("tenant.edit.saved"));
        close();
        await refresh();
      } catch (e) { flash(card, "error", errorText(e)); }
    };

    const body = el("div", {},
      el("p", { class: "muted" }, `${t("field.schema")}: `, el("code", {}, row.schema_name)),
      formField(t("tenant.field.company"), company),
      formField(t("tenant.field.description"), desc),
      formField(t("tenant.field.domain"), picker.el),
      el("div", { style: "margin-top:1rem; display:flex; gap:0.5rem" },
        el("button", { onclick: save }, t("common.save")),
        el("button", { class: "secondary", onclick: () => close() }, t("common.cancel")),
      ),
    );
    close = modal(t("tenant.edit.title"), body);
  }

  // -------------------------------------------------------------------
  // Create form. Fields stay DISABLED until a base domain (or "Custom") is
  // chosen in the domain picker (the dropdown is the gate). Then
  // {schema_name, company_name, description, shard_id, domain} is POSTed.
  // -------------------------------------------------------------------
  await Promise.all([loadShards(), loadBaseDomains()]);

  formWrap.append(el("h3", {}, t("common.create")));

  const companyInput = el("input", { required: true, placeholder: "Alpha LLC", disabled: true });
  const descInput = el("textarea", { rows: 2, disabled: true });
  const schemaInput = el("input", { required: true, placeholder: "alpha", disabled: true });
  const shardSelect = el("select", { required: true, disabled: true },
    el("option", { value: "" }, t("tenant.shard.placeholder")),
    ...shards.map((s) => el("option", { value: s.id }, `${s.name || s.alias} [${s.alias}]`)),
  );
  const gated = [companyInput, descInput, schemaInput, shardSelect];

  const picker = makeDomainPicker(baseDomains, (selected) => {
    gated.forEach((i) => { i.disabled = !selected; });
  });

  const form = el("form", { class: "row" },
    // Domain picker FIRST: its dropdown is the gate — until an option is chosen the
    // fields below stay disabled, so the form reads top-down.
    formField(t("tenant.field.domain"), picker.el),
    formField(t("tenant.field.company"), companyInput),
    formField(t("tenant.field.description"), descInput),
    formField(t("tenant.field.schema"), schemaInput),
    formField(t("tenant.field.shard"), shardSelect),
    el("div", { style: "align-self: flex-end" }, el("button", { type: "submit" }, t("common.add"))),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!picker.selected()) { flash(card, "error", t("tenant.domain.pick")); return; }
    const domErr = picker.validate();
    if (domErr) { flash(card, "error", domErr); return; }
    const schema = schemaInput.value.trim().toLowerCase();
    const company = companyInput.value.trim();
    const shardId = shardSelect.value;
    if (!company || !schema || !shardId) { flash(card, "error", t("tenant.form.incomplete")); return; }
    try {
      await api.post("/api/tenants/", {
        schema_name: schema,
        company_name: company,
        description: descInput.value.trim(),
        shard_id: Number(shardId),
        domain: picker.value(),
      });
      flash(card, "ok", t("common.added"));
      form.reset();
      picker.reset();          // clears the picker AND re-gates the fields (disabled)
      await refresh();
    } catch (e) { flash(card, "error", errorText(e)); }
  });
  formWrap.append(form);

  refresh();
}

/**
 * Domain picker: a base-domain dropdown (+ "Custom") that gates and assembles the
 * domain. Base selected → prefix input + fixed ".<base>" suffix (domain = prefix +
 * "." + base; multi-level prefix allowed). Custom → free host input (light client
 * check; the backend is the authority). onSelectionChange(bool) fires so the caller
 * can enable/disable the rest of the form.
 */
function makeDomainPicker(baseDomains, onSelectionChange) {
  const CUSTOM = "__custom__";
  const select = el("select", {},
    el("option", { value: "" }, t("tenant.domain.pick")),
    ...baseDomains.map((b) => el("option", { value: b }, `.${b}`)),
    el("option", { value: CUSTOM }, t("tenant.domain.custom")),
  );
  const prefix = el("input", { placeholder: "acme", disabled: true });
  const suffix = el("code", { class: "muted" }, "");
  const prefixWrap = el("span", { style: "display:none; align-items:center; gap:4px" }, prefix, suffix);
  const custom = el("input", { placeholder: "acme.example.com", disabled: true, style: "display:none" });

  function refresh() {
    const v = select.value;
    const isBase = Boolean(v) && v !== CUSTOM;
    const isCustom = v === CUSTOM;
    prefixWrap.style.display = isBase ? "inline-flex" : "none";
    prefix.disabled = !isBase;
    custom.style.display = isCustom ? "inline-block" : "none";
    custom.disabled = !isCustom;
    if (isBase) suffix.textContent = `.${v}`;
    onSelectionChange(Boolean(v));
  }
  select.addEventListener("change", refresh);

  return {
    el: el("div", { style: "display:flex; flex-wrap:wrap; align-items:center; gap:6px" },
      select, prefixWrap, custom),
    selected: () => Boolean(select.value),
    value() {
      const v = select.value;
      if (!v) return "";
      if (v === CUSTOM) return custom.value.trim().toLowerCase();
      return `${prefix.value.trim().toLowerCase()}.${v}`;
    },
    validate() {
      const v = select.value;
      if (!v) return t("tenant.domain.pick");
      if (v === CUSTOM) {
        const h = custom.value.trim().toLowerCase();
        if (!h || !/^[a-z0-9.-]+$/.test(h) || !h.includes(".")) return t("tenant.domain.invalidCustom");
        return null;
      }
      if (!prefix.value.trim()) return t("tenant.domain.prefixRequired");
      return null;
    },
    init(host) {
      host = (host || "").toLowerCase();   // stored host may be non-normalized (CLI)
      const base = baseDomains
        .filter((b) => host === b || host.endsWith(`.${b}`))
        .sort((a, b) => b.length - a.length)[0];
      if (base && host.endsWith(`.${base}`)) {
        select.value = base;
        refresh();
        prefix.value = host.slice(0, -(base.length + 1));
      } else {
        select.value = CUSTOM;
        refresh();
        custom.value = host;
      }
    },
    reset() {
      select.value = "";
      prefix.value = "";
      custom.value = "";
      refresh();
    },
  };
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
        headerActions: [
          {
            label: t("product.generate"),
            class: "secondary",
            // Async: the worker creates the products → 202 now, list a moment later.
            run: async ({ card, refresh }) => {
              try {
                await api.post("/api/products/generate/", {});
                flash(card, "ok", t("product.generate.queued"));
                setTimeout(refresh, 1500);
              } catch (e) {
                flash(card, "error", errorText(e));
              }
            },
          },
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
