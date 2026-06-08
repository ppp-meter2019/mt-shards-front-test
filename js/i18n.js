/**
 * Bilingual UI strings (uk / en).
 *
 * Pattern:
 *   - View code never has hardcoded UI text — it goes through `t("key")`.
 *   - Active language is read from localStorage, default "uk".
 *   - When the user toggles the language, subscribers are notified so the
 *     current view can re-render in the new language.
 *
 * Backend error payloads are NOT translated — DRF returns field-keyed
 * messages in English and we surface them as-is, since they describe API
 * shape rather than UI labels.
 */

const KEY = "tenants_demo_lang";
const DEFAULT_LANG = "uk";
const SUPPORTED = ["uk", "en"];

const DICT = {
  uk: {
    // login
    "login.title": "Вхід",
    "login.hint.manual": "Залиште поле «Тенант» порожнім для адміністратора платформи. Введіть alpha / beta / gamma — для адміна компанії, водія або клієнта.",
    "login.hint.detected": "Тенант визначено з адреси:",
    "login.hint.public": "Ви на основному сайті — увійдіть як адміністратор платформи.",
    "login.field.subdomain": "Тенант (необов'язково)",
    "login.field.username": "Логін",
    "login.field.password": "Пароль",
    "login.submit": "Увійти",

    // top bar
    "topbar.logout": "Вийти",
    "topbar.langLabel": "Мова",

    // role labels
    "role.tenant_admin": "Адмін платформи",
    "role.company_admin": "Адмін компанії",
    "role.customer": "Клієнт",
    "role.driver": "Водій",

    // tabs
    "tab.tenants": "Тенанти",
    "tab.products": "Товари",
    "tab.cars": "Машини",
    "tab.drivers": "Водії",
    "tab.customers": "Замовники",
    "tab.orders": "Замовлення",
    "tab.routes": "Маршрути",

    // common
    "common.loading": "Завантаження...",
    "common.empty": "Поки що порожньо.",
    "common.create": "Створити",
    "common.add": "Додати",
    "common.delete": "Видалити",
    "common.added": "Додано.",
    "common.confirmDelete": "Видалити запис #",

    // generic field labels
    "field.id": "ID",
    "field.name": "Назва",
    "field.price": "Ціна",
    "field.brand": "Бренд",
    "field.model": "Модель",
    "field.year": "Рік",
    "field.licensePlate": "Номер",
    "field.username": "Логін",
    "field.password": "Пароль",
    "field.firstName": "Ім'я",
    "field.lastName": "Прізвище",
    "field.dateOfBirth": "Дата народж.",
    "field.licenseNumber": "Ліцензія",
    "field.email": "Email",
    "field.phone": "Телефон",
    "field.address": "Адреса",
    "field.customer": "Клієнт",
    "field.status": "Статус",
    "field.items": "Позиції",
    "field.created": "Створено",
    "field.driver": "Водій",
    "field.car": "Машина",
    "field.orders": "Замовлення",
    "field.domains": "Домени",
    "field.admins": "Адміни",
    "field.schema": "Schema",
    "field.shard": "Шард",
    "field.lastError": "Остання помилка",
    "field.schemaExists": "Схема",
    "field.lastMigration": "Остання міграція",
    "field.actions": "Дії",
    "field.product": "Товар",
    "field.quantity": "Кількість",
    "field.total": "Разом:",
    "field.sum": "Сума",

    // tenants form placeholders
    "tenant.field.schema": "Schema (alpha)",
    "tenant.field.name": "Назва (Alpha LLC)",
    "tenant.field.domain": "Домен (alpha.localhost)",
    "tenant.field.shard": "Шард",
    "tenant.shard.placeholder": "— виберіть шард —",
    "tenant.createAdmin.button": "Створити адміна",
    "tenant.createAdmin.helper": "Логін і пароль для першого company-адміна цього тенанта:",
    "tenant.createAdmin.success": "Адміна створено.",
    "common.cancel": "Скасувати",

    // tenant status state machine
    "status.new": "Новий",
    "status.pending": "Виконується міграція",
    "status.active": "Активний",
    "status.deactivated": "Деактивовано",
    "status.failed": "Помилка міграції",

    // tenant per-row actions
    "tenant.action.createSchema": "Створити схему",
    "tenant.action.runMigrations": "Запустити міграції",
    "tenant.action.deactivate": "Деактивувати",
    "tenant.action.activate": "Активувати",
    "tenant.action.deactivated.success": "Тенант деактивовано.",
    "tenant.action.activated.success": "Тенант активовано.",
    "tenant.readonly": "Системний тенант — лише перегляд",

    // status timestamps
    "tenant.pending.since": "Pending з:",
    "tenant.failed.since": "Failed з:",
    "tenant.schema.yes": "так",
    "tenant.schema.no": "ні",

    // orders / routes (admin)
    "orders.empty": "Замовлень немає.",
    "routes.empty": "Маршрутів немає.",
    "routes.new": "Новий маршрут",
    "routes.placeholder.driver": "— водій —",
    "routes.placeholder.car": "— машина —",
    "routes.placeholder.orders": "Замовлення (Ctrl+click)",
    "routes.created": "Маршрут створено.",

    // customer
    "customer.myOrders": "Мої замовлення",
    "customer.createNew": "Створити нове замовлення",
    "customer.noOrders": "У вас поки немає замовлень.",
    "customer.emptyCatalog": "Каталог порожній — попросіть адміністратора додати товари.",
    "customer.pickAtLeastOne": "Виберіть хоча б один товар.",
    "customer.orderCreated": "Замовлення створено.",
    "customer.checkout": "Оформити замовлення",

    // driver
    "driver.myProfile": "Мій профіль",
    "driver.myRoutes": "Мої маршрути",
    "driver.noAssigned": "На вас поки що нічого не призначено.",
    "driver.login": "Логін",
    "driver.schema": "Тенант (схема)",
    "driver.role": "Роль",
  },

  en: {
    "login.title": "Sign in",
    "login.hint.manual": "Leave \"Tenant\" empty to sign in as the platform admin. Type alpha / beta / gamma to sign in as a company admin, driver or customer.",
    "login.hint.detected": "Tenant detected from URL:",
    "login.hint.public": "You're on the management host — sign in as the platform admin.",
    "login.field.subdomain": "Tenant (optional)",
    "login.field.username": "Login",
    "login.field.password": "Password",
    "login.submit": "Sign in",

    "topbar.logout": "Sign out",
    "topbar.langLabel": "Language",

    "role.tenant_admin": "Platform admin",
    "role.company_admin": "Company admin",
    "role.customer": "Customer",
    "role.driver": "Driver",

    "tab.tenants": "Tenants",
    "tab.products": "Products",
    "tab.cars": "Cars",
    "tab.drivers": "Drivers",
    "tab.customers": "Customers",
    "tab.orders": "Orders",
    "tab.routes": "Routes",

    "common.loading": "Loading...",
    "common.empty": "Nothing here yet.",
    "common.create": "Create",
    "common.add": "Add",
    "common.delete": "Delete",
    "common.added": "Added.",
    "common.confirmDelete": "Delete record #",

    "field.id": "ID",
    "field.name": "Name",
    "field.price": "Price",
    "field.brand": "Brand",
    "field.model": "Model",
    "field.year": "Year",
    "field.licensePlate": "Plate",
    "field.username": "Login",
    "field.password": "Password",
    "field.firstName": "First name",
    "field.lastName": "Last name",
    "field.dateOfBirth": "DOB",
    "field.licenseNumber": "License",
    "field.email": "Email",
    "field.phone": "Phone",
    "field.address": "Address",
    "field.customer": "Customer",
    "field.status": "Status",
    "field.items": "Items",
    "field.created": "Created",
    "field.driver": "Driver",
    "field.car": "Car",
    "field.orders": "Orders",
    "field.domains": "Domains",
    "field.admins": "Admins",
    "field.schema": "Schema",
    "field.shard": "Shard",
    "field.lastError": "Last error",
    "field.schemaExists": "Schema",
    "field.lastMigration": "Last migration",
    "field.actions": "Actions",
    "field.product": "Product",
    "field.quantity": "Quantity",
    "field.total": "Total:",
    "field.sum": "Sum",

    "tenant.field.schema": "Schema (alpha)",
    "tenant.field.name": "Name (Alpha LLC)",
    "tenant.field.domain": "Domain (alpha.localhost)",
    "tenant.field.shard": "Shard",
    "tenant.shard.placeholder": "— pick a shard —",
    "tenant.createAdmin.button": "Create admin",
    "tenant.createAdmin.helper": "Login and password for the first company admin of this tenant:",
    "tenant.createAdmin.success": "Admin created.",
    "common.cancel": "Cancel",

    "status.new": "New",
    "status.pending": "Migrating",
    "status.active": "Active",
    "status.deactivated": "Deactivated",
    "status.failed": "Migration failed",

    "tenant.action.createSchema": "Create schema",
    "tenant.action.runMigrations": "Run migrations",
    "tenant.action.deactivate": "Deactivate",
    "tenant.action.activate": "Activate",
    "tenant.action.deactivated.success": "Tenant deactivated.",
    "tenant.action.activated.success": "Tenant activated.",
    "tenant.readonly": "System tenant — read-only",

    "tenant.pending.since": "Pending since:",
    "tenant.failed.since": "Failed since:",
    "tenant.schema.yes": "yes",
    "tenant.schema.no": "no",

    "orders.empty": "No orders yet.",
    "routes.empty": "No routes yet.",
    "routes.new": "New route",
    "routes.placeholder.driver": "— driver —",
    "routes.placeholder.car": "— car —",
    "routes.placeholder.orders": "Orders (Ctrl+click)",
    "routes.created": "Route created.",

    "customer.myOrders": "My orders",
    "customer.createNew": "Place a new order",
    "customer.noOrders": "You don't have any orders yet.",
    "customer.emptyCatalog": "Catalog is empty — ask the admin to add products.",
    "customer.pickAtLeastOne": "Pick at least one product.",
    "customer.orderCreated": "Order placed.",
    "customer.checkout": "Place order",

    "driver.myProfile": "My profile",
    "driver.myRoutes": "My routes",
    "driver.noAssigned": "Nothing assigned to you yet.",
    "driver.login": "Login",
    "driver.schema": "Tenant (schema)",
    "driver.role": "Role",
  },
};

const subscribers = new Set();

export function getLang() {
  const stored = localStorage.getItem(KEY);
  return SUPPORTED.includes(stored) ? stored : DEFAULT_LANG;
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
  for (const fn of subscribers) {
    try { fn(lang); } catch { /* swallow — one bad listener shouldn't break others */ }
  }
}

export function onLangChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Look up a UI string in the active language; falls back to en, then key. */
export function t(key) {
  const lang = getLang();
  return DICT[lang]?.[key] ?? DICT.en[key] ?? key;
}

export const SUPPORTED_LANGUAGES = SUPPORTED;