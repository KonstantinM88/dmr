# AGENTS.md

## Назначение файла

Рабочая память проекта Digital Menu Restaurant (DMR) для следующих сессий
Claude Code / Codex и других агентов. Перед существенными изменениями
сначала читать этот файл и `docs/`, затем проверять актуальный код.

Обновлять этот файл, когда меняются:

- архитектура, доменные границы или client/server-разделение;
- маршруты (guest, staff, admin, api);
- Prisma schema, важные миграции или способ работы с данными;
- обязательные переменные окружения, команды запуска или проверки;
- условия деплоя, хранение media или обработка платежей.

Не записывать сюда секреты, значения `.env`, временные логи.

## Кратко о проекте

- Проект: Digital Menu Restaurant (DMR) — цифровое ресторанное меню с
  QR-кодами на столах, корзиной по устройствам, подтверждением заказов
  официантом, очередями кухни/бара, дозаказами, онлайн-оплатой Stripe и
  ролевой staff-панелью.
- Полностью отдельное приложение от сайта-отеля Waldschlösschen. Референс
  `Waldschlösschen` используется только как источник паттернов (media UX,
  разделение client/server кода), НЕ как источник схемы данных или
  аутентификации — там нет RBAC, нет translation-модели, медиа хранится
  локально и транскодируется в HTTP-запросе, что не годится для DMR.
- Стек на дату создания (2026-08-17): Next.js App Router `16.3.1+`
  (ветка 16.x), React/React DOM `19.2.8+`, TypeScript strict, Prisma ORM
  `7.9.1+` с `@prisma/adapter-pg` (PostgreSQL driver adapter, ESM),
  PostgreSQL (Neon), Tailwind CSS 4, Zod, next-intl, ESLint, Playwright,
  Vitest, Stripe, npm с lock-файлом. Не переходить на Next 17 / Prisma 8 /
  canary-beta-RC зависимости без отдельного согласования.
- Инфраструктура старта: Hostinger Business Web Hosting (Node.js Web App,
  без root/Docker/Redis/системного FFmpeg/гарантированных долгоживущих
  WebSocket), существующий Neon PostgreSQL project, Stripe. Расширение
  ресурсов — только по измеренным порогам, см. `docs/scaling-thresholds.md`.
- UI первой версии — только немецкий (`de`), локализация архитектурно
  готова к `en`/`ru`/другим с первого дня.
- При ответах владельцу проекта — русский язык.

## Источники истины

1. `package.json` — версии, scripts, зависимости.
2. `package-lock.json` — фактически разрешённые версии; не удалять и не
   пересоздавать без причины.
3. `src/app` — маршруты и точки входа (guest, staff, admin, api).
4. `prisma/schema.prisma` и `prisma/migrations` — модель данных и история БД.
5. `prisma.config.ts` — Prisma 7 CLI: путь схемы, миграции, сид и direct URL.
6. `src/domains` и `src/lib` — доменная и server-side логика по границам из
   `docs/architecture.md`.
7. `.env.example` и `src/lib/env.ts` — имена и runtime-валидация окружения.
8. `docs/` — архитектурные решения; при расхождении с кодом код имеет
   приоритет, но расхождение нужно исправить в docs или в коде.

## Текущее состояние установки (2026-08-18)

- Этап 1 установлен локально в `D:\projects\dmr`; Этап 2 НЕ начат.
- Node.js при последней проверке: `v22.14.0`, требование проекта — `>=22`.
- Зависимости установлены, `package-lock.json` создан, Prisma Client
  сгенерирован в игнорируемый `src/generated/prisma`.
- Neon project создан в AWS Europe Central 1 (Frankfurt). Neon Auth намеренно
  выключен: DMR использует собственные `StaffUser`, `StaffSession`, RBAC,
  rate limiting и password hashing. Не подключать Neon Auth без отдельного
  решения о полной замене существующей модели аутентификации.
- Применена миграция
  `prisma/migrations/20260817222350_stage1_foundation/migration.sql`; на дату
  записи `prisma migrate status` сообщает `Database schema is up to date`.
- Сид выполнен: 1 Venue, 8 DiningTable, 8 активных TableQrToken, 9 MenuItem,
  1 StaffUser-владелец, 6 ролей. Сид идемпотентный.
- Последняя полная проверка успешна: ESLint, TypeScript, production build,
  169 unit-тестов, `/api/health`, `/api/ready`, публичное меню, QR-cookie и
  редирект неавторизованного `/de/admin` на `/de/anmelden`.
- Не считать dev-сервер работающим между сессиями. Всегда проверять порт и
  `/api/health`; PID — временное значение и в документацию не записывается.

## Структура проекта (целевая, создаётся поэтапно)

```
src/
  app/                     # Next.js App Router: [locale]/t/[tableToken],
                            # (staff)/waiter, (staff)/kitchen, (staff)/bar,
                            # admin/*, api/* (включая api/stripe/webhook)
  domains/
    menu/                  # публичное меню + admin управление меню
    tables/                # DiningTable, TableQrToken, QR
    sessions/               # DiningSession, SessionParticipant, carts
    orders/                 # OrderRound, OrderItem, идемпотентность
    production/             # ProductionStation, ProductionTicket, SSE/poll
    billing/                 # Bill, аллокации
    payments/                # PaymentAttempt, Payment, Stripe webhook
    staff/                   # StaffUser, роли, разрешения, аутентификация
    localization/            # message catalogs, translation-модель
    media/                    # storage adapter, upload validation
    audit/                    # AuditLog, LifecycleEvent
    notifications/            # email/outbox abstraction
  lib/                      # cross-domain server-only утилиты (prisma
                             # singleton, env validation, rate limiting)
  components/                # client-safe UI компоненты по доменам
docs/                       # архитектурная документация (этот пакет)
prisma/
tests/
```

Правило: Client Components не импортируют Prisma, Stripe server SDK,
файловые/секретные модули напрямую — только через server actions /
API routes / server components, отдающие client-safe типы. С Этапа 1 это
дополнительно проверяется правилом `no-restricted-imports` в
`eslint.config.mjs`.

Фактически создано на Этапе 1: `src/app` (`[locale]` guest + admin,
`t/[token]`, `api/health`, `api/ready`), `src/domains/{menu,tables,staff,
media,audit,localization}`, `src/lib`, `src/components`, `prisma`, `tests`.
Домены `sessions`, `orders`, `production`, `billing`, `payments`,
`notifications` появятся на своих этапах.

## Решения, принятые на Этапе 1 (не пересматривать без миграции)

- Деньги — целые minor units (евроценты), поля `*Cents` типа `Int`,
  валюта EUR. Реализация и тесты: `src/lib/money.ts`, `tests/unit/money.test.ts`.
- Хеширование паролей — Node-встроенный `scrypt` (N=2^14, r=8, p=1,
  явный `maxmem`), формат хеша версионирован префиксом `scrypt$…`, что
  позволяет позже добавить argon2id без инвалидации существующих паролей.
- Prisma Client генерируется в `src/generated/prisma` (`prisma-client`
  generator, ESM), директория в `.gitignore` — клиент создаётся
  `postinstall`-хуком.
- Prisma CLI на версии 7 настраивается через корневой `prisma.config.ts`:
  миграции и сид используют direct `DIRECT_DATABASE_URL`, runtime-клиент —
  pooled `DATABASE_URL`. `prisma generate` должен работать до создания `.env`.
- Rate limiting — in-memory на один процесс. При переходе на несколько
  инстансов реализацию нужно заменить, интерфейс `checkRateLimit` сохранить.
- Locale-маршрутизация живёт в `src/proxy.ts` (Next.js 16 переименовал
  `middleware.ts` в `proxy.ts`); `/t/:token` и `/api/*` из неё исключены.
- Slug единственного заведения — константа `DEFAULT_VENUE_SLUG`
  в `src/lib/venue.ts`, а не литерал в запросах.

## Env contract (имена без значений, см. `docs/hostinger-deployment.md`)

Обязательные на Этапе 1:

- `DATABASE_URL` — Neon pooled runtime URL; hostname содержит `-pooler`.
- `DIRECT_DATABASE_URL` — Neon direct URL для Prisma CLI/сида; тот же
  пользователь, пароль, база и query-параметры, но hostname без `-pooler`.
- `NEXT_PUBLIC_SITE_URL` — локально `http://localhost:3000`, в production
  только финальный `https://` домен QR.
- `STAFF_SESSION_SECRET` — случайный секрет минимум 32 символа.
- `NODE_ENV` — локально `development`; `next build` сам временно выставляет
  `production`.

Дополнительные: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PUBLISHABLE_KEY`, `MEDIA_STORAGE_PROVIDER`, `MEDIA_STORAGE_BUCKET`,
`MEDIA_STORAGE_REGION`, `MEDIA_STORAGE_ENDPOINT`,
`MEDIA_STORAGE_ACCESS_KEY_ID`, `MEDIA_STORAGE_SECRET_ACCESS_KEY`,
`MEDIA_STORAGE_PUBLIC_BASE_URL`, `CRON_SECRET`, `SEED_OWNER_EMAIL`,
`SEED_OWNER_PASSWORD`.

Правила URL Neon:

- Значение должно начинаться ровно с `postgresql://` или `postgres://`.
- В `.env` вставляется только URI. Нельзя вставлять команду Neon вида
  `psql 'postgresql://…'`; убрать `psql ` и внешние одинарные кавычки.
- Не печатать URI при диагностике. Проверять только булевы признаки: схема,
  наличие `-pooler`, одинаковые user/database, SSL и успешный `SELECT 1`.
- `sslmode=require` сейчас используется по контракту проекта. При обновлении
  `pg` отдельно пересмотреть предупреждение о будущей семантике SSL mode.

## Секреты и локальные артефакты

- `.env` содержит реальные Neon credentials и секреты, исключён из Git.
- `temp/stage1-local-access.txt` содержит локальный email/password владельца
  и исходные QR-маршруты восьми столов. Вся папка `temp/` исключена из Git.
- Никогда не выводить содержимое этих файлов, connection URI, пароли,
  session secrets или QR-токены в ответ, tool output, commit, issue, docs или
  логи. Для проверки читать их внутри процесса и выводить только статусы.
- `.env.example` хранит только демонстрационные значения и должен оставаться
  пригодным как полный список переменных.
- Смена `SEED_OWNER_PASSWORD` после первого сида сама по себе НЕ меняет хеш
  существующего владельца: текущий `upsert` обновляет только `status`.
  Пароль менять отдельной явной операцией/функцией, не повторным сидом.
- Повторный сид не показывает существующие QR-токены. Не ротировать токены
  ради повторного вывода: ротация отзывает старые напечатанные QR.

## Prisma 7 и база данных

- В `prisma/schema.prisma` у datasource остаётся только
  `provider = "postgresql"`. Поля `url`/`directUrl` в Prisma 7 запрещены.
- `prisma.config.ts` загружает `.env`; CLI datasource использует
  `DIRECT_DATABASE_URL`. `src/lib/prisma.ts` отдельно создаёт runtime client
  через `PrismaPg` и pooled `DATABASE_URL`.
- `prisma generate` не подключается к базе и должен работать до создания
  `.env`; поэтому config использует `process.env.DIRECT_DATABASE_URL ?? ''`,
  а не строгий `env()` helper.
- Standalone `prisma/seed.ts` обязан импортировать `dotenv/config`, иначе
  `tsx prisma/seed.ts` не видит `.env`.
- Для новой schema change: изменить `schema.prisma` → обновить
  `docs/data-model.md` → создать именованную dev-миграцию → проверить SQL →
  применить → запустить тесты. Миграции production — только после отдельного
  подтверждения владельца и с планом backup/rollback.
- Не использовать `db push` вместо миграций и не редактировать уже
  применённую migration задним числом.
- Не выполнять reset/drop/truncate/delete массово и не пересоздавать Neon
  project/branch без явного подтверждения владельца.

## Локальные команды и Windows/Codex

Обычные команды из корня проекта:

```powershell
npm install
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run db:generate
npm run db:migrate -- --name <meaningful_name>
npm run db:migrate:deploy
npm run db:seed
npm run db:studio
```

Особенности этой managed Windows-среды:

- В автоматической PowerShell-сессии `node`/`npm` могут отсутствовать в
  `PATH`, хотя установлены в `C:\Program Files\nodejs`.
- Сначала проверять стандартные команды. Если PATH недоступен, использовать
  `C:\Program Files\nodejs\node.exe` и
  `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`, временно
  добавив `C:\Program Files\nodejs` в PATH процесса для npm scripts.
- npm cache профиля `C:\Users\user\AppData\Local\npm-cache` может быть
  закрыт sandbox. В этом случае передавать локальный cache внутри
  `D:\projects\dmr\temp\npm-cache` и удалить только этот созданный cache
  после успешной установки.
- Загрузка npm packages, Prisma engines, Google Fonts и соединение с Neon
  могут требовать разрешённого внешнего доступа. Не обходить блокировку и не
  менять зависимости из-за сетевой ошибки.
- Перед запуском dev проверять порт 3000. Background `Start-Process` способен
  оставить дочерний Next process; после неудачного запуска проверять живой
  процесс и `.next/dev/logs/next-development.log`, а не запускать дубликаты.
- Next 16 автоматически добавляет блок `nextjs-agent-rules` в конец этого
  файла. Не удалять его: `next dev` создаст блок снова.

## Сборка и обязательная проверка

- `next build` всегда выставляет `NODE_ENV=production`. В `src/lib/env.ts`
  deployment-only проверки пропускаются только при
  `NEXT_PHASE=phase-production-build`; реальный production runtime всё равно
  запрещает `MEDIA_STORAGE_PROVIDER=local` и требует HTTPS site URL.
- Не подменять `MEDIA_STORAGE_PROVIDER=s3` фиктивно только ради зелёной
  сборки. До выбора object storage локально остаётся `local`.
- Production build загружает Bricolage Grotesque, Karla и IBM Plex Mono с
  Google Fonts. Сетевая ошибка шрифтов не означает ошибку TypeScript/кода.
- Минимальный gate после изменения кода: `npm run lint`,
  `npm run typecheck`, `npm run test`, `npm run build`.
- Изменение auth/RBAC/денег/rate limit обязательно сопровождается
  релевантными отрицательными unit-тестами.
- `npm run test:e2e` требует установленных Playwright browsers, запущенной и
  засеянной тестовой БД; не направлять E2E на production.
- Smoke после запуска: `/api/health` → `status=ok`; `/api/ready` →
  `status=ready,database=up`; `/de` → 200; `/de/anmelden` → 200;
  неавторизованный `/de/admin` → redirect на `/de/anmelden`; валидный
  `/t/<token>` → cookie `dmr_table_token`, redirect `/de`, бейдж `Tisch N`.
- При HTTP-автоматизации проверять QR в два шага (ответ 307/Set-Cookie, затем
  `/de` с той же cookie session): некоторые клиенты теряют cookie при
  автоматическом redirect и дают ложный отрицательный результат.

## Известные dependency/security замечания

- На 2026-08-18 `npm audit` показывает три high entries одной цепочки:
  devDependency `prisma` → `@prisma/config` → `deepmerge-ts <8`, advisory
  GHSA-ggr8-5vv4-36mx (stack exhaustion на циклических object graphs).
- Runtime приложения этот Prisma CLI dependency не использует. Не запускать
  `npm audit fix --force`: npm предлагает несовместимый откат Prisma до 6.12.
  Ждать совместимого обновления Prisma, затем обновлять осознанно с полным
  gate. Не добавлять override `deepmerge-ts@8` без проверки совместимости.

## Открытые решения (не принимать автоматически)

- Object storage/CDN — не выбран; это блокирует production media upload.
- Stripe account/production resources — не подключены; Этап 4.
- Финальный домен/поддомен QR — не выбран; не печатать финальные QR до решения.
- Neon plan/лимиты соединений — уточнить до нагрузочных решений.
- Интеграция с сайтом Waldschlösschen — по умолчанию отсутствует.
- Одно заведение — текущий default; multi-venue не добавлять без решения.
- SSE/polling на Hostinger — выбирать только после измерения на реальном
  хостинге.

## Рабочие правила для следующих изменений

- Сначала искать существующий паттерн в соседнем домене, не дублировать
  доменную логику по разным route-файлам.
- Любое изменение схемы Prisma → обновить `docs/data-model.md`.
- Любое изменение ролей/разрешений → обновить `docs/rbac-matrix.md`.
- Любой новый переход state machine → обновить
  `docs/order-state-machines.md` и `AuditLog`/`LifecycleEvent`.
- Не переходить к следующему Этапу реализации без явного одобрения
  владельца по каждому этапу отдельно.
- Не деплоить, не менять DNS, не создавать production Stripe resources, не
  покупать/апгрейдить тарифы и не выполнять production migration без
  отдельного явного подтверждения владельца.
- Перед изменением Next.js API/конвенций сначала читать подходящий документ в
  `node_modules/next/dist/docs/`, как требует автоматически добавленный блок
  в конце файла; не полагаться на память о старых версиях Next.js.
- Сохранять пользовательские изменения в dirty worktree; не применять
  `git reset --hard`, не удалять и не перезаписывать несвязанные файлы.

## Журнал важных изменений

| Дата | Изменение | Контекст |
| --- | --- | --- |
| 2026-08-18 | Локально установлен и проверен Этап 1. Конфигурация приведена к Prisma 7 (`prisma.config.ts`, URL удалены из `schema.prisma`, standalone-сид загружает `.env`), создана и применена миграция `stage1_foundation`, выполнен идемпотентный сид. Локальная production-сборка разрешена в фазе `next build`, при реальном production runtime запрет `MEDIA_STORAGE_PROVIDER=local` сохранён. Проверки: `lint`, `typecheck`, `build`, 169 unit-тестов, health/readiness, публичное меню, QR-cookie и редирект защиты админки — успешно. | Neon: Frankfurt, pooled runtime + direct migrations. Секреты, пароль владельца и QR-токены хранятся только локально в исключённых из Git `.env` и `temp/stage1-local-access.txt`. Этап 2 не начинался. |
| 2026-08-17 | Реализован Этап 1 (фундамент и публичное меню). Создан репозиторий: Next.js 16.3.1 / React 19.2.8 / Prisma 7.9.1 / next-intl 4.13.7 / Tailwind 4. Prisma schema Этапа 1 (Venue, VenueSetting, DiningTable, TableQrToken, ProductionStation, TaxProfile, translation-first меню, Allergen/Additive/DietaryTag, MediaAsset, StaffUser/StaffSession/Role/Permission, AuditLog, LifecycleEvent), идемпотентный сид, публичное меню на `de`, вход по QR `/t/[token]`, логин персонала с rate limiting и отзываемыми сессиями, admin-обзор меню (read-only), `/api/health` и `/api/ready`, security headers. Проверки: `lint` — чисто, `test` — 169 тестов проходят (authorization matrix, деньги, translation fallback, rate limiting, пароли). Модели и маршруты Этапов 2–4 намеренно не создавались. | По команде владельца «Создавай проект согласно инструкциям». Открытые вопросы Этапа 0 остаются открытыми: провайдер object storage не выбран (загрузка медиа отключена, `MEDIA_STORAGE_PROVIDER=local` запрещён в production), Stripe не подключён, поведение SSE на Hostinger не измерено. |
| 2026-08-17 | Подготовлен пакет документов Этапа 0 (discovery/проектирование) без создания репозитория и без кода. | По команде владельца «Начинай реализацию DMR» подтверждено, что фактическая реализация будет вестись в отдельной локальной сессии с доступом к `D:\projects\dmr`; эта cloud-сессия подготовила `AGENTS.md` и `docs/*.md` для переноса. Референс `konstantinm88/waldschl-sschen` изучен только для чтения (schema.prisma, restaurant-menu*.ts, RestaurantPageContent.tsx, admin-image-upload.ts, MenuVideoUploadField.tsx, AGENTS.md) — конкретные выводы см. в `docs/architecture.md` и `docs/implementation-plan.md`. |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
