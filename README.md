# tenants_front — vanilla-JS frontend

Простий SPA на чистому JS (ES-модулі, без бандлера, без npm).

## Два режими роботи

Конфіг — `tenants_front/config.js`. Дві константи: `APP_DOMAIN` і `API_PORT`.

| Що ставимо                                          | Поведінка                                                                                                                  |
|-----------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `APP_DOMAIN=""`, `API_PORT="8000"` (за замовч.)     | **Дев split-origin.** Фронт на `:5500`, бек на `:8000`. На логіні видно поле «Тенант».                                     |
| `APP_DOMAIN="example.com"`, `API_PORT="8000"`       | **Прод із публічним API на :8000.** Фронт на 443, API на 8000. Зовнішні клієнти теж стукаються на `:8000`. Поле «Тенант» приховане. |
| `APP_DOMAIN="example.com"`, `API_PORT=""`           | Прод same-origin (усе через nginx :443, без окремого API-порта).                                                            |

---

## A. Локальний дев (split-origin, як було)

1. Підняти бекенд (`tenants_back`) на `localhost:8000`. У `/etc/hosts`:
   ```
   127.0.0.1   localhost alpha.localhost beta.localhost gamma.localhost
   ```

2. У `tenants_front/`:
   ```bash
   python3 -m http.server 5500
   ```
   (`file://` не підійде — ES-модулі браузер так не вантажить.)

3. Відкрити <http://localhost:5500>.

| Кого логінимо           | Поле «Тенант» | Що показує           |
|-------------------------|---------------|----------------------|
| `root`/`rootpass`       | _порожнє_     | Список тенантів      |
| `admin`/`adminpass`     | `alpha` …     | Усі сутності тенанта |
| Замовник                | `alpha` …     | Каталог + замовлення |
| Водій                   | `alpha` …     | Профіль + маршрути   |

---

## B. Продакшн із nginx + реальним доменом

**Логіка**: користувач набирає в браузері `https://alpha.example.com` —
nginx на :443 віддає статичний фронт. Фронт бачить hostname, вираховує
тенант = `alpha`, посилає API-запити на `https://alpha.example.com:8000/api/...`.
На :8000 живе той самий nginx, який проксує `/api/` в gunicorn.
Зовнішні клієнти (curl/мобілка/3rd-party) теж ходять на `:8000`.

Бек (django-tenants) дивиться на заголовок `Host` і перемикає схему —
порт у виборі схеми участі не бере.

### 1. DNS

Підніми wildcard-A-запис: `*.example.com → IP_сервера` плюс `example.com → IP_сервера`.

### 2. TLS

Випусти wildcard-сертифікат (Let's Encrypt через DNS-01):
```bash
certbot certonly --dns-... -d example.com -d '*.example.com'
```

### 3. Файлова структура на сервері

```
/home/webmaster/tenants_front/                       # сюди викладаємо вміст tenants_front/
/home/webmaster/tenants_back/                        # бекенд (manage.py, settings.py, ...)
/home/webmaster/tenants_back/staticfiles/            # сюди йде collectstatic
/home/webmaster/tenants_back/run/gunicorn.sock       # UNIX-сокет, який створює bin/gunicorn_start.sh
```

### 4. Налаштування фронта

У `tenants_front/config.js`:
```js
export const APP_DOMAIN = "example.com";
export const API_PORT   = "8000";
```

Фронт із `https://alpha.example.com` буде стукатися на
`https://alpha.example.com:8000/api/...`. Поле «Тенант» на формі логіна
зникає — тенант визначається з адреси.

Якщо хочеш все на 443 без публічного API-порта — постав `API_PORT = ""`
і прибери `server { listen 8000 ssl; ... }` з nginx-конфігу.

### 5. Налаштування бекенда

Усі прод-overrides Django-настройок (`SECRET_KEY`, `ALLOWED_HOSTS`,
`CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGIN_REGEXES`, `DATABASES`, …)
живуть у `tenants_back/tenants_back/settings_local.py`. Шаблон —
`settings_local.py.example` у репозиторії; перед першим запуском:

```bash
cp tenants_back/tenants_back/settings_local.py.example \
   tenants_back/tenants_back/settings_local.py
nano tenants_back/tenants_back/settings_local.py    # SECRET_KEY, домен, DB
```

`bin/gunicorn_start.sh` сам по собі прод-значень не тримає — лише
активує venv, експортує `DJANGO_SETTINGS_MODULE` і запускає gunicorn.

Bootstrap (`migrate_schemas`, `bootstrap_public`, `bootstrap_tenant`) і
запуск — повністю у `tenants_back/deploy/README.md` (розділ 3
«supervisor + bin/gunicorn_start.sh» і розділ 7 «Перший bootstrap»).

### 6. nginx

Готовий шаблон — `tenants_back/deploy/nginx.example.conf`. Заміни
`example.com` на свій домен і шляхи до сертифікатів. У шаблоні два
`server`-блоки з тим самим wildcard-сертифікатом:

**:443 (фронт + admin)**
- `location /` → `root /home/webmaster/tenants_front; try_files $uri $uri/ /index.html;` (SPA-фолбек).
- `location /admin/` → проксі на gunicorn (Django admin зручно тримати на основному домені).
- `location /static/` → `alias /home/webmaster/tenants_back/staticfiles/`.

**:8000 (публічний API)**
- `location /api/` → проксі на той самий gunicorn-сокет.
- `location /` → `return 404;` (щоб `:8000` лишався чистим API-ендпоінтом).
- Той самий `*.example.com`-сертифікат — нічого додатково не випускаєш.

`upstream` в обох блоках указує на сокет із `bin/gunicorn_start.sh`:
`unix:/home/webmaster/tenants_back/run/gunicorn.sock`. У всіх `proxy_pass`
обов'язково `proxy_set_header Host $host;` — `TenantMainMiddleware`
маршрутизує саме за `Host`.

Не забудь відкрити порт 8000 у фаєрволі:
```bash
sudo ufw allow 8000/tcp
```

Поведінка для користувача:
| URL                          | Що показує                                                |
|------------------------------|-----------------------------------------------------------|
| `https://example.com`        | Логін → форма без поля тенанта → роль `tenant_admin`      |
| `https://alpha.example.com`  | Логін → роль `company_admin`/`customer`/`driver` для alpha |
| `https://beta.example.com`   | Те саме для beta                                          |

---

## Структура

```
tenants_front/
├── index.html       # точка входу, темплейти
├── style.css
├── config.js        # APP_DOMAIN + API_PORT (єдине, що оператор редагує)
├── README.md
└── js/
    ├── api.js       # fetch + JWT + decode
    ├── auth.js      # login + session + детект тенанта з hostname
    ├── ui.js        # tiny DOM helpers
    ├── app.js       # router (role → view)
    └── views/
        ├── login.js
        ├── admin.js     # tenant_admin або company_admin
        ├── customer.js
        └── driver.js
```