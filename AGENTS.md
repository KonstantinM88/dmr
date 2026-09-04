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
- UI первой версии полностью включён на немецком (`de`) и русском (`ru`)
  для guest, staff/admin и production; немецкий остаётся default/fallback.
  Архитектура готова к `en`/другим языкам без изменения схемы.
- При ответах владельцу проекта — русский язык.

## Формат отчёта владельцу после изменений

После каждого обновления проекта финальный ответ обязательно содержит:

1. **Что изменено** — краткий список фактически изменённых функций, файлов
   или поведения без лишнего технического шума.
2. **Что проверить** — конкретные страницы, кнопки и сценарии для ручной
   проверки владельцем, а также результат уже выполненных автоматических
   проверок. Если ручная проверка не нужна, написать это явно.
3. **Рекомендация следующего шага** — один приоритетный следующий шаг и,
   при необходимости, решения или данные, которые требуются от владельца.

Не выдавать запланированное за выполненное. Отдельно отмечать известные
ограничения, пропущенные проверки и блокеры.

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

## Текущее состояние установки (2026-09-04)

- Этапы 1–4 и согласованная часть Этапа 5 установлены и локально проверены
  в `D:\projects\dmr`. Остальной scope Этапа 5 не расширять без новой команды.
- Node.js при последней проверке: `v22.14.0`, требование проекта — `>=22`.
- Зависимости установлены, `package-lock.json` создан, Prisma Client
  сгенерирован в игнорируемый `src/generated/prisma`.
- Neon project создан в AWS Europe Central 1 (Frankfurt). Neon Auth намеренно
  выключен: DMR использует собственные `StaffUser`, `StaffSession`, RBAC,
  rate limiting и password hashing. Не подключать Neon Auth без отдельного
  решения о полной замене существующей модели аутентификации.
- Применены миграции `20260817222350_stage1_foundation`,
  `20260817233152_stage2_sessions_orders` и
  `20260818004303_stage3_production_queues`,
  `20260818022747_stage4_billing_payments`,
  `20260818052000_stage5_split_cash_waiter_calls`,
  `20260902174500_stage5_quantity_split_payments` и
  `20260903013000_menu_production_sla`; Stage 2 migration содержит
  обязательный partial unique index `dining_sessions_active_per_table`,
  Stage 3 — `ProductionTicket` и безопасный backfill существующих позиций,
  Stage 4 — финансовые таблицы, partial unique/provider indexes и денежные
  CHECK constraints, Stage 5 — WaiterCall, планы распределения попыток,
  связь CashSettlement→Payment и дополнительные partial/CHECK constraints;
  quantity-split migration добавляет quantity в план/факт allocations и
  expected remainder для optimistic concurrency; menu SLA migration добавляет
  nullable пару recommended/critical preparation minutes в MenuItem и её
  immutable snapshot в OrderItem с DB CHECK-ограничениями 1–240 минут.
  На дату записи Prisma сообщает `Database schema is up to date`.
- Сид выполнен: 1 Venue, 8 DiningTable, 8 активных TableQrToken, 9 MenuItem,
  0 MediaAsset, 1 StaffUser-владелец, 6 ролей. Сид идемпотентный и после
  Stage 2 повторно не запускался. До подключения media storage admin-карточки
  показывают предусмотренный placeholder вместо фото/видео.
- 2026-09-03 по прямой команде владельца очищены все закрытые локальные
  тестовые посещения: удалены 7 `CLOSED` DiningSession, 13 OrderRound,
  28 OrderItem/ProductionTicket и 12 тестовых Payment. Контроль после
  транзакции: sessions/rounds/items/tickets/bills/payments = 0; Venue,
  9 MenuItem и StaffUser-владелец сохранены. Следующий DEV QR начинает
  полностью чистый сценарий.
- Текущая state machine разрешает оплатить/закрыть стол до завершения
  production tickets. Не менять это правило без отдельного бизнес-решения.
- Последняя проверка успешна: ESLint, TypeScript, production build, 331
  unit-тестов, migration status, реальные Neon probes, `/api/health`,
  `/api/ready` и RU browser smoke гостевого меню/admin menu editor. Browser
  подтвердил 14 локализованных allergen options, сохранение и предзаполнение
  трёх связей у тестового блюда после reload, публичный вывод названий и
  открытие WebM в media viewer, explicit camera permission/denied UI,
  заметный статус подключённого стола, фото-fallback QR-сканера, новый
  подписанный guest access и инструкции двух печатных QR-карточек.
  Backfill подтвердил
  25 planned/22 final allocations без quantity/amount нарушений; partial-unit
  SQL обновил ровно одну из двух единиц и полностью откатился. Авторизованный
  визуальный production/service flow в этой проверке не повторялся; Stage 4
  Playwright 20/20 остаётся последним полным E2E. Chromium установлен.
- Сейчас последняя тестовая DiningSession Tisch 1 `CLOSED`; следующий DEV QR
  заказ создаст новую сессию и нового participant для повторного smoke.
- Не считать dev-сервер работающим между сессиями. Всегда проверять порт и
  `/api/health`; PID — временное значение и в документацию не записывается.
- На 2026-09-03 `/[locale]/admin/speisekarte` содержит editor категорий и
  продуктов: create/update, DE/RU-названия и описания, состав, цена в центах,
  сортировка, острота, станция, налоговый профиль, публикация, доступность и
  структурированный выбор аллергенов EU-14. Аллергены выбираются только из
  общего справочника `Allergen`, server action отклоняет неизвестные и
  повторяющиеся ID, а `MenuItemAllergen` синхронизируется в той же транзакции,
  что и продукт; свободный текст для аллергенов не использовать.
  Hard delete категорий/продуктов намеренно не добавлен: скрытие выполняется
  через публикацию/доступность, удаление требует отдельной архивной политики.
- Каталог администратора не выводит развёрнутые карточки сплошным списком:
  `MenuCatalogWorkspace` показывает компактные строки, раскрывающие полную
  карточку по запросу, и client-side фильтры по поиску (включая DE/RU-тексты),
  категории, станции, статусу и media. Доступны сортировка, счётчики, пустое
  состояние и полный сброс; чистая логика находится в
  `domains/menu/shared/admin-catalog-filters.ts` и покрыта unit-тестами.
- Гостевое меню использует editorial layout: контейнер `max-w-4xl`, две
  колонки на desktop и одну на mobile, крупное media 16:10, выразительные
  category-заголовки и горизонтальную якорную навигацию. `MenuMediaViewer`
  открывает доступную полноэкранную галерею через portal, блокирует прокрутку
  фона, поддерживает Escape/стрелки/миниатюры; если у продукта есть VIDEO,
  оно ставится первым и открывается с native controls, poster и muted autoplay.
  Карточка без media остаётся текстовой и не показывает фиктивный placeholder.
- Локальный media upload реализован только для development: JPEG/PNG/WebP/
  AVIF до 8 МБ нормализуются Sharp в WebP (до 1600×900), MP4/WebM до 40 МБ
  транскодируются `ffmpeg-static` в WebM (до 1280×720) с WebP-постером.
  Результаты лежат в `public/uploads/menu/{images,videos,posters}`; максимум
  12 media на продукт, имена случайные, исходники удаляются. На время
  локального и Vercel-preview тестирования готовые WebP/WebM-файлы намеренно
  не игнорируются Git и могут быть явно добавлены в тестовый deployment.
  Перед переходом на рабочее media-хранилище это временное правило нужно
  пересмотреть и исключить runtime-загрузки из репозитория.
  `/api/admin/menu/media` требует staff-cookie, `MANAGE_MENU`, same-origin и
  tenant scope. Production local-provider остаётся запрещённым: Vercel
  использует явный read-only `MEDIA_STORAGE_PROVIDER=bundled`, показывает
  только файлы, включённые в deployment, и скрывает upload/delete controls.
  API в этом режиме отвечает `503 storage_read_only`. `local` в production
  по-прежнему останавливает runtime; запись media требует реализованного
  S3-compatible adapter/object storage.

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
    service-requests/        # WaiterCall и guest→service уведомления
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
На Этапе 2 добавлены `domains/{sessions,orders}`, guest cart/order actions,
service routes `/[locale]/service[/[sessionId]]`, admin tables/QR routes
`/[locale]/admin/tische[/druck]` и 40 unit-тестов. Guest `/[locale]` также
содержит production QR-camera scanner, использующий настоящий `/t/[token]`
flow. На Этапе 3 добавлены
`domains/{production,realtime}`, `/[locale]/produktion/{kueche,bar}`,
`/api/production/queue`, `/api/live/{guest,service}` и sold-out action.
На Этапе 4 добавлены `domains/{billing,payments}`, `/[locale]/bezahlen`,
`/[locale]/admin/zahlungen` и `/api/stripe/webhook`. Домен `notifications`
появится на своём этапе. В согласованной части Этапа 5 добавлен
`domains/service-requests`, split/cash UI в `/bezahlen` и service alerts.
Позже добавлены полноценный menu editor и development-only media pipeline
в `domains/media`, `/api/admin/menu/media` и `public/uploads/menu`.

## Решения, принятые на Этапах 1–5 (не пересматривать без миграции)

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
- Первый гостевой заказ за свободным активным столом автоматически открывает
  `DiningSession` (`actorType=GUEST`). Первый раунд всё равно всегда
  `SUBMITTED` и требует решения официанта, даже при `AUTO_ACCEPT`.
- `/t/[token]` не кладёт постоянный bearer QR прямо в рабочую guest-cookie:
  он выпускает HMAC-подписанный `dmr_table_access` с временем входа. Все
  guest-domain actions повторно валидируют подпись, QR token и последний
  `DiningSession.closedAt`; `CLOSED/CANCELLED` отзывает старый доступ без
  ротации напечатанного QR. Новый заказ после закрытия возможен только после
  повторного QR-entry. Старый cookie `dmr_table_token` больше не принимается.
- `reorderApprovalMode` — snapshot на OrderRound; переключение влияет только
  на будущие дозаказы и каждое изменение аудируется.
- Stage 3 заменил временный direct-serve: принятая позиция со станцией получает
  ровно один `ProductionTicket`; кухня/бар проводят его через `QUEUED →
  ACCEPTED → IN_PROGRESS → READY`, а официант проводит `READY → HANDED_OFF`
  вместе с `OrderItem READY → SERVED` в одной транзакции.
- Переходы тикета защищены optimistic concurrency (`updateMany` с исходным
  status); повторное/одновременное действие возвращает invalid transition и
  не создаёт повторный lifecycle event.
- Перед решением по `SUBMITTED` OrderRound официант с
  `APPROVE_ORDER_ROUND` может изменить quantity позиции кнопками −/+ в
  диапазоне 1–50. Клиент передаёт только полный набор item ID/quantity;
  сервер использует snapshot unit price/tax rate и транзакционно пересчитывает
  line total, tax, remaining и round total до создания ProductionTicket.
  Изменение после подтверждения запрещено; минимум 1, отказ — отдельный
  checkbox. Старое/новое количество пишется в LifecycleEvent и AuditLog.
- Realtime Этапа 3 — polling по DB-time cursor: production 3/10 секунд,
  service 4/15, guest 8/15. Terminal tickets приходят как tombstones; reconnect
  сохраняет snapshot. SSE не включать до измерения на реальном Hostinger,
  контракт — `docs/realtime-contract.md`.
- Production full snapshot исключает тикеты закрытых/отменённых сессий.
  Delta отслеживает также `DiningSession.updatedAt` и возвращает оставшиеся
  тикеты закрывшейся сессии как `CANCELLED` tombstones, чтобы уже открытая
  station queue очистилась без ручного reload. Данные в БД при этом не
  удаляются автоматически.
- Операционные сигналы не имеют отдельной таблицы: кухня/бар получают
  визуальный attention и локальный opt-in звук для новых `QUEUED`, официант —
  для `SUBMITTED` раундов и `READY` позиций, guest — серверные сообщения
  принят/готовится/готов/подан. Все экраны показывают живую длительность
  текущего ожидания; звуковая настройка хранится локально и не является
  источником истины. Выдача из service board выполняет существующую атомарную
  пару `ProductionTicket READY→HANDED_OFF` + `OrderItem READY→SERVED`.
- Waiter service board и detail стола обязаны показывать все активные
  production-позиции, а не только готовые: точное состояние
  `QUEUED/ACCEPTED/IN_PROGRESS/READY`, станцию KITCHEN/BAR и живую
  длительность текущего этапа. Сортировка — самое долгое ожидание первым;
  `READY` дополнительно даёт действие подтверждения выдачи.
- Production SLA настраивается без выдуманных defaults. У MenuItem оба поля
  `recommendedPreparationMinutes`/`criticalPreparationMinutes` либо NULL,
  либо целые 1–240 с critical >= recommended. При создании OrderItem они
  копируются в immutable snapshot: изменение карточки не переписывает уже
  принятый заказ и будущую статистику. Для `QUEUED/ACCEPTED/IN_PROGRESS`
  таймер сравнивается с snapshot от `queuedAt`; для `READY` используются
  общие пороги `VenueSetting(key=production.ready_handoff_sla)` от `readyAt`.
  UI: зелёный до recommended, жёлтый после, красный после critical; при NULL
  явно показывает, что SLA не настроен.
- Оперативный sold-out меняет `MenuItem.isAvailable`, аудируется и доходит до
  гостя через change feed; сервер заказа всё равно повторно проверяет наличие.
- Не более одной незавершённой DiningSession на стол гарантируют и
  transactional check, и partial unique index в migration SQL. Prisma schema
  сам этот partial index не описывает — не потерять его при новых миграциях.
- На DiningSession существует не более одного Bill. Подготовка/просмотр счёта
  не блокирует дозаказы; блокировка начинается только с активной
  `PaymentAttempt`, когда Bill и DiningSession атомарно переходят в
  `PAYMENT_PENDING`.
- Полностью оплаченная `DiningSession` закрывается отдельным действием
  `PAID → CLOSED`. Кнопка доступна с `MANAGE_DINING_SESSION` на экране стола
  и в операционном блоке `/[locale]/admin/zahlungen`; финансовые записи при
  этом не переписываются. После `CLOSED` прежний guest access немедленно
  отклоняется сервером; повторный переход по действующему QR выдаёт новый
  access grant, а следующий заказ создаёт новую сессию и нового participant.
- Stage 5 позволяет выбрать весь остаток/целые строки OrderItem, а staff с
  `REGISTER_CASH_PAYMENT` — целое количество единиц от 1 до неоплаченного
  остатка строки. `PaymentAttemptAllocation` хранит quantity, серверную сумму
  и expected remainder; `PaymentAllocation` сохраняет фактически оплаченное
  quantity для истории и печати. Произвольная сумма и дробление одной единицы
  не реализованы; клиентские суммы никогда не принимаются.
- Stripe idempotency key создаётся один раз вместе с PaymentAttempt и
  повторно используется при неопределённом результате провайдера. Partial
  unique index запрещает две `CREATED`/`PENDING` попытки одного Bill.
- Stripe webhook — источник истины: подпись обязательна; event сначала
  захватывается через `RECEIVED → PROCESSING`, повтор/lease-retry безопасен;
  amount/currency сверяются с попыткой, а Payment, allocations, Bill,
  DiningSession и financial audit фиксируются одной транзакцией.
- Гостевая отмена PaymentIntent разрешена только QR-cookie того же стола.
  Неопределённый ответ Stripe не снимает локальный lock, чтобы не открыть
  путь к двойному списанию.
- Наличную `PaymentAttempt(method=CASH, PENDING)` может создать guest-клик
  или сам сотрудник с `REGISTER_CASH_PAYMENT` на экране стола без действия
  гостя. Выбор позиций и суммы всегда пересчитываются сервером. `Payment`,
  allocations и `CashSettlement` создаёт только сотрудник с тем же permission
  после ввода полученной суммы; сдача считается в integer cents. Полная
  оплата переводит Bill/DiningSession в PAID, после чего сотрудник отдельно
  закрывает DiningSession.
- Staff-ввод наличных принимает фактически полученный номинал, показывает
  сдачу до подтверждения и предлагает точную/ближайшие суммы. Источник истины
  остаётся серверным: `CashSettlement.receivedCents/changeCents` считаются в
  integer cents и недоплата отклоняется.
- Печатные маршруты `/[locale]/service/[sessionId]/druck[/[paymentId]]`
  показывают внутреннюю полную ведомость или одну сохранённую успешную оплату,
  scoped по `venueId` и защищены `VIEW_ASSIGNED_TABLES`. Это не Kassenbon,
  не Rechnung и не TSE-документ; не ослаблять маркировку до POS/TSE-решения.
- Финансовые интерактивные транзакции используют `timeout=20s` для удалённого
  Neon. Подтверждение CASH обновляет выбранные OrderItem одной optimistic
  SQL batch-операцией; несовпадение любого ожидаемого остатка откатывает всю
  транзакцию и не оставляет частичных Payment/allocations/CashSettlement.
- Одновременно на Bill разрешена только одна активная попытка независимо от
  CASH/STRIPE. Поэтому разные гости платят последовательно и не могут
  зарезервировать одну позицию дважды.
- WaiterCall: `OPEN → ACKNOWLEDGED → RESOLVED`, guest может CANCEL активный
  вызов. Partial unique index допускает один активный вызов на DiningSession;
  service board показывает Tisch и живую длительность ожидания.

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

`MEDIA_STORAGE_PROVIDER`: `local` — writable только локально; `bundled` —
read-only файлы из Git/deployment для временного Vercel-теста; `s3` — целевой
production provider после реализации и настройки адаптера.

Stripe contract Этапа 4: все три переменные либо пусты, либо заданы вместе.
Пока они пусты, приложение работает с явно отключённой оплатой. Разрешены
только test-mode префиксы `sk_test_`, `pk_test_`, `whsec_`; значения никогда
не выводить. Live mode без отдельного production-решения запрещён.

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
- `temp/qr-print/` содержит тестовые печатные PNG действующих QR-кодов. Эти
  изображения также являются bearer-доступом к столам: не коммитить, не
  публиковать как статические assets и не отправлять посторонним.
- `.env.example` хранит только демонстрационные значения и должен оставаться
  пригодным как полный список переменных.
- Смена `SEED_OWNER_PASSWORD` после первого сида сама по себе НЕ меняет хеш
  существующего владельца: текущий `upsert` обновляет только `status`.
  Пароль менять отдельной явной операцией/функцией, не повторным сидом.
- Повторный сид не показывает существующие QR-токены. Не ротировать токены
  ради повторного вывода: ротация отзывает старые напечатанные QR.

- Основной guest QR-flow — обычная камера телефона → HTTPS `/t/[token]`;
  установка приложения и разрешение камеры сайту не требуются. Резервный
  production-сканер на `/[locale]` открывается отдельно и вызывает камеру
  только после явной кнопки разрешения; при отказе показывает Android/iOS
  подсказки и ручной retry. Для Android добавлен fallback через системную
  камеру (`capture=environment`) и выбор готового фото: постоянный видеодоступ
  сайту для этого не нужен, но конкретный picker зависит от ОС/браузера.
  Он принимает исключительно точный
  `/t/<opaque-token>` текущего либо `NEXT_PUBLIC_SITE_URL` origin без
  query/hash, не заменяет server-side проверку токена и не является
  production-версией `/api/dev/qr-entry`.
- Печатная страница `/[locale]/admin/tische/druck` требует
  `MANAGE_TABLES_QR`; plaintext token не передаётся в Client Component.
  `npm run qr:generate:test` создаёт PNG столов 1 и 2 из действующих токенов
  в `temp/qr-print` с доменом из `NEXT_PUBLIC_SITE_URL`. До выбора финального
  домена считать их только тестовыми и после ротации генерировать заново.
- Для будущего NFC использовать пассивную NDEF-метку с тем же HTTPS
  `/t/<opaque-token>` URL, что QR; отдельный backend-flow не создавать, QR
  оставлять fallback. После token rotation перезаписывать метку одновременно
  с заменой QR. Web NFC не считать кроссплатформенным admin writer.

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
npm run db:seed:ru
npm run db:studio
npm run qr:generate:test
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
  Временный Vercel-тест закоммиченных media использует только явный read-only
  `MEDIA_STORAGE_PROVIDER=bundled`; не подменять им рабочее object storage.
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
  `/t/<token>` → подписанная cookie `dmr_table_access`, redirect `/de`, бейдж
  `Tisch N`; после закрытия старая cookie показывает требование повторного QR.
- Stage 3 smoke: без staff-cookie `/api/production/queue?kind=KITCHEN` и
  `/api/live/service` → 401; invalid realtime cursor → 400; с owner-session
  `/de/produktion/kueche` показывает текущий `QUEUED` тикет, а
  `/de/produktion/bar` — отдельную очередь. Для production delta проверять
  full snapshot, затем cursor delta и удаление `HANDED_OFF` tombstone.
- Stage 4 smoke без Stripe-ключей: QR-entry → `/de/bezahlen` показывает
  fail-closed сообщение; неподписанный/поддельный webhook → 503; анонимный
  `/de/admin/zahlungen` → redirect. С тестовыми ключами дополнительно нужны
  Stripe CLI, success/failure test cards и повторная доставка того же event.
- Stage 5 smoke: после QR `/de` содержит `Service rufen`; `/de/bezahlen`
  содержит выбор открытых строк и наличных, а card показывает disabled при
  пустом Stripe env. Вручную проверить call→ack→resolve и cash
  request→staff confirm→partial/full PAID→close table.
- Locale smoke: `/ru`, `/ru/anmelden`, guest/staff/admin/production экраны и
  форматирование денег работают на русском; переключатель `DE/RU` сохраняет
  текущий маршрут. `npm run db:seed:ru` идемпотентно добавляет только русские
  переводы демо-меню и не меняет операционные данные.
- Повторный локальный QR-smoke через `/api/dev/qr-entry` очищает только
  participant-cookie, имитируя новое гостевое устройство. Сначала полностью
  оплатить и закрыть прежнюю сессию; QR-токен при этом не ротируется.
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
- Stripe test keys локально ещё не настроены, production account/resources
  не подключены. Наличные работают независимо; не переходить на live mode.
- Финальный домен/поддомен QR — не выбран; не печатать финальные QR до решения.
- Neon plan/лимиты соединений — уточнить до нагрузочных решений.
- Интеграция с сайтом Waldschlösschen — по умолчанию отсутствует.
- Одно заведение — текущий default; multi-venue не добавлять без решения.
- Сейчас выбран polling. SSE можно включить только после измерения на реальном
  Hostinger в Этапе 6; не считать localhost-smoke достаточным.
- Статический QR остаётся bearer URL: подписанный access закрывает старые
  вкладки, но сохранённую ссылку можно открыть заново. До production выбрать
  следующий уровень защиты от намеренного удалённого входа: подтверждение
  нового устройства официантом (предпочтительно) или visit PIN.

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
| 2026-09-04 | Android QR UX получил независимый fallback через системную камеру/file picker и выбор готового фото; инструкции учитывают Chrome Site settings, Android App permissions и общий camera privacy switch. `/t/[token]` теперь выпускает HMAC-подписанный 8-часовой `dmr_table_access`; `CLOSED/CANCELLED` инвалидирует все ранее выданные grant на menu/order/payment/waiter-call/guest polling, а старый raw `dmr_table_token` не принимается. Добавлены RU/DE состояния повторного сканирования и 10 отрицательных/граничных тестов token/service. Проверены lint, typecheck, production build, 331 unit-тест, health/readiness, распознавание QR-файла, mobile 390×844 и чистые логи после перезапуска. | По просьбе владельца исправить непрактичный Android permission flow и отделить закончившееся посещение от следующего. Схема БД и напечатанные QR не менялись. Статический QR не доказывает физическое присутствие тому, кто сохранил URL; следующим security-решением выбрать waiter approval нового устройства или visit PIN. |
| 2026-09-04 | QR-onboarding сделан понятнее для первого визита: основной путь через обычную камеру телефона показан пошагово, подключённый стол отображается заметным статусом, а резервный встроенный сканер получил отдельную кнопку разрешения, проверку permission state и Android/iOS-подсказки после запрета. Печатные карточки получили тот же трёхшаговый сценарий и пояснение, что приложение устанавливать не нужно. Добавлены unit-тесты определения платформы и browser-smoke permission denied/table connected/двух печатных карточек. | По просьбе владельца снизить сложность доступа к камере. Браузер не может программно отменить системный запрет, поэтому UI ведёт пользователя к настройке сайта и повторной проверке. Для будущего NFC принят совместимый подход: тот же `/t/[token]` URL в пассивной NDEF-метке, QR остаётся fallback. |
| 2026-09-04 | Добавлен безопасный QR-сканер с камерой на гостевом DE/RU-меню, защищённая `MANAGE_TABLES_QR` печатная страница столов, повторяемый генератор тестовых PNG и favicon. Сканер принимает только точный `/t/<token>` текущего/настроенного origin; plaintext-токены не попадают в Client Component или логи. Созданы и декодированием проверены 1200×1200 PNG Tisch 1/2 для текущего Vercel test domain в ignored `temp/qr-print`; оба live-входа вернули ожидаемые 307, Secure HttpOnly table cookie и locale redirect. Проверены lint, typecheck, production build, 318 unit-тестов и browser smoke кнопки/permission-error/admin print layout. | Приложенные 83 Vercel-события: 0 error-level, 0 HTTP 5xx, 71 HTTP 200; только 6 favicon 404, устранённых `app/icon.svg`. Домен Vercel остаётся тестовым: до печати финальных ресторанных табличек выбрать постоянный домен и обновить `NEXT_PUBLIC_SITE_URL`. |
| 2026-09-04 | Исправлен runtime 500 первого Vercel deployment: добавлен явный `MEDIA_STORAGE_PROVIDER=bundled` для read-only показа закоммиченных `public/uploads` файлов. `local` остаётся запрещённым в production; bundled UI скрывает upload/delete, API возвращает `503 storage_read_only`, storage adapter не допускает запись. Проверены lint, typecheck, production build, 308 unit-тестов и отдельный production-smoke: health ok, Neon ready, `/ru` 200, bundled media 200. | Vercel build был успешен, но `/de`, `/ru` и favicon падали из-за собственной production env-проверки. Для следующего deployment нужно заменить значение Vercel env `MEDIA_STORAGE_PROVIDER` с `local` на `bundled`; постоянный production по-прежнему требует S3-compatible storage. |
| 2026-09-03 | В редактор продукта добавлен локализованный multi-select полного справочника аллергенов EU-14, видимые allergen badges в admin-карточке, server-side проверка уникальных существующих ID и атомарная синхронизация `MenuItemAllergen`. Публичное меню продолжает получать названия через существующий DE/RU translation fallback. Загруженные владельцем media проверены на диске и в browser: изображения нормализованы в WebP, видео — в WebM с WebP-постерами, WebM открывается в полноэкранном viewer. Проверены lint, typecheck, production build, 304 unit-теста, health/readiness и свежий dev-log без ошибок. | Устранён разрыв: schema, seed и guest query поддерживали аллергены, но admin editor раньше их не загружал и не сохранял. Schema/migration не менялись. |
| 2026-09-03 | `/[locale]/admin` оформлен как расширяемый dashboard, а `/[locale]/admin/speisekarte` — как rich-каталог карточек с фото/видео preview, описанием, составом, ценой, станцией, публикацией и availability. В карточке с `MANAGE_MENU` задаётся recommended/critical preparation SLA; общий READY→handoff SLA требует `MANAGE_OPERATIONAL_SETTINGS`. Миграция `20260903013000_menu_production_sla` добавила MenuItem-поля и OrderItem snapshot с CHECK constraints. Кухня/бар/официант показывают зелёный/жёлтый/красный SLA либо явное «не настроен». Изменения настроек аудируются. | По команде владельца заложить основу admin dashboard для будущих модулей и хранить реальные нормативы в карточках продуктов. Media upload/edit и CRUD содержимого пока не включены: карточки отображают уже существующие MediaAsset/translation данные, production-файлы по-прежнему требуют выбранного object storage. |
| 2026-09-03 | Официантский service board и detail стола расширены с ready-only до полного контроля незавершённого производства. Для каждой позиции показываются количество, кухня/бар, точный статус `QUEUED/ACCEPTED/IN_PROGRESS/READY` и живое время в текущем статусе; самые старые ожидания идут первыми, `READY` сохраняет прямое подтверждение выдачи. Текущий DB probe подтвердил согласованность: кофе и суп `HANDED_OFF/SERVED`, пиво `IN_PROGRESS`, лисички `READY`; свежие логи — 11 production transitions, 2 handoff, 0 ошибок/5xx. | По просьбе владельца не допустить незаметно забытую позицию на кухне или в баре. Schema/migration не менялись; SLA-пороги намеренно не придуманы без бизнес-решения. |
| 2026-09-03 | Разобран production-тест: действия кухни/бара прошли без Prisma/5xx, но очередь показывала 17 незавершённых тикетов семи уже закрытых посещений. Full snapshot теперь исключает `CLOSED`/`CANCELLED` sessions, delta превращает их тикеты в terminal tombstones. По прямой команде владельца транзакционно удалены все 7 закрытых локальных тестовых сессий: 13 раундов, 28 позиций/тикетов и 12 платежей; Venue/menu/owner сохранены. Invalid locale теперь отклоняется до menu query. Проверены lint, typecheck, production build, 281 unit-тест, health/readiness, корректные 404 invalid locale и чистый stderr после перезапуска. | Очистка только локальной тестовой Neon branch для нового полного прохода. Автоматическое удаление истории при обычном закрытии не добавлялось. |
| 2026-09-02 | Поверх существующей Stage 3 state machine добавлены сквозные операционные уведомления: новые `SUBMITTED` раунды и `READY` позиции входят в attention board официанта с таймерами и прямым подтверждением выдачи; кухня/бар подсвечивают новые `QUEUED`, показывают длительность каждого этапа и могут подать opt-in звук/vibration; guest видит серверные сигналы принят/готовится/готов/подан. Звук дедуплицируется в рамках вкладки, визуальная DB-очередь остаётся источником истины. Проверены ESLint, TypeScript, production build, 280 unit-тестов, health/readiness, RU QR browser smoke и свежие dev-логи. | По просьбе владельца завершить цепочку guest → waiter → kitchen/bar → waiter → guest с уведомлением каждого участника. Schema/migration не менялись; Browser Audio требует однократного нажатия «Включить звук». Полный авторизованный ручной проход обеих станций оставлен владельцу на новом заказе. |
| 2026-09-02 | Официант может дробить строку заказа по целым единицам при прямом CASH-расчёте: UI −/+ выбирает quantity от 0 до неоплаченного остатка, сумма считается по snapshot unit price. `PaymentAttemptAllocation` хранит quantity и expectedRemainingCents, `PaymentAllocation` — фактически оплаченное quantity; CASH и Stripe webhook проверяют план, печать показывает количество конкретной части. Миграция `20260902174500_stage5_quantity_split_payments` применена с backfill. Проверены lint, typecheck, build, 278 unit-тестов, migration status, 25/22 старых allocations и rollback-probe одной из двух единиц. | По просьбе владельца разрешить официанту принять оплату за 1 единицу из строки quantity=2. Клиент не передаёт сумму; произвольная сумма и дробление одной единицы остаются вне scope. Последний ручной счёт 35,50 EUR закрыт до установки нового UI, поэтому новый сценарий требуется проверить на свежей сессии. |
| 2026-09-02 | На наличном экране официанта добавлены быстрые номиналы и живой расчёт сдачи до подтверждения; серверная проверка и integer-cents `CashSettlement` сохранены. Добавлены защищённые venue-scoped печатные маршруты полной внутренней платёжной ведомости и каждой успешной частичной оплаты, обязательная нефискальная маркировка и постоянная кнопка возврата к списку столов на detail-экране. Проверены lint, typecheck, production build, 274 unit-теста и read-only Neon probe: 3 части/69,00 EUR, allocations сходятся, чужой venue получает null. | По просьбе владельца ускорить расчёт наличными, подготовить раздельную печать и навигацию официанта между многими столами. Это внутренние ведомости, не Kassenbon/Rechnung/TSE; schema/migration не менялись. Последний Tisch 1 закрыт, но его 6 production tickets всё ещё QUEUED — отдельное бизнес-решение следующего шага. |
| 2026-09-02 | На экране решения официанта добавлены кнопки −/+ для изменения количества каждой выбранной позиции до подтверждения (1–50) с немедленным перерасчётом видимой суммы. Server action принимает только item ID/quantity; domain service проверяет venue, SUBMITTED, полный уникальный набор позиций и транзакционно пересчитывает line/tax/remaining/round totals из snapshot-цены до создания ProductionTicket. Изменения количества аудируются в LifecycleEvent/AuditLog. Проверены lint, typecheck, production build, 271 unit-тест, реальный rollback-probe SQL в Neon и HTTP readiness; dev-сервер запущен на 3000 без записи временного PID в документацию. | По просьбе владельца разрешить официанту корректировать количество перед подтверждением. Schema/migration не менялись; quantity после подтверждения остаётся неизменяемым, 0 не заменяет явное отклонение позиции. Текущий Tisch 1 OPEN с одним pending-раундом из пяти позиций сохранён для ручной проверки. |
| 2026-08-18 | Исправлен P2028 при подтверждении наличных через удалённый Neon: финансовые транзакции получили timeout 20s, последовательные обновления OrderItem заменены одной optimistic SQL batch-операцией с полным rollback при конфликте. На staff-экране стола добавлен прямой выбор всего остатка/отдельных позиций и запуск CASH PaymentAttempt без guest-клика. Проверены lint, typecheck, build, 263 unit-теста, реальный повтор ранее откатившейся операции, DB-инварианты и чистый HTTP-smoke. | По просьбе владельца устранить timeout и позволить официанту принять оплату без возврата гостя в приложение. Тестовый счёт 93,10 EUR теперь полностью `PAID` и готов к ручной проверке закрытия. Stripe/терминальная оплата сотрудником остаётся отдельным будущим scope до подключения провайдера. |
| 2026-08-18 | Полностью включена локаль `ru`: общий `DE/RU` switcher, сохранение locale при staff login/logout, русские guest/staff/admin/production каталоги, Stripe locale и русские переводы seed-меню (`db:seed:ru`). На `/[locale]/admin/zahlungen` добавлен отдельный операционный список `PAID` сессий с закрытием через существующий `MANAGE_DINING_SESSION`; DEV QR очищает participant-cookie для нового guest-smoke. Проверены lint, typecheck, build, 263 unit-теста, `de`/`ru`/login/QR HTTP-smoke и чистые новые логи. | По просьбе владельца добавить русский язык, видимое закрытие полностью оплаченного стола и повторный клиентский QR-тест. Схема/миграции и финансовые записи не менялись. Текущий Bill ещё `OPEN` с остатком 93,10 EUR, поэтому кнопка появится после полной оплаты. |
| 2026-08-18 | Реализована согласованная часть Этапа 5: выбор всего остатка/конкретных позиций, последовательные CASH/STRIPE attempts, staff-подтверждение наличных со сдачей и allocations, полное закрытие оплаченной DiningSession, guest WaiterCall и service alert с длительностью. Миграция `20260818052000_stage5_split_cash_waiter_calls` применена; 259 unit-тестов, lint/typecheck/build, DB-invariants и QR HTTP-smoke прошли. | По явной команде владельца добавить наличные/split и вызов официанта. Stripe остаётся fail-closed. Интерактивный browser binding был недоступен, поэтому визуальный call/cash staff flow проверить вручную. Терминал, дробление одной строки/произвольная сумма, tips/refunds/shift reconciliation не реализовывать без новой команды. |
| 2026-08-18 | Реализован и локально установлен Этап 4: Bill/PaymentAttempt/Payment/PaymentAllocation, Stripe Payment Element и webhook, PAYMENT_PENDING lock, reconciliation и read-only отчёт. Миграция `20260818022747_stage4_billing_payments` применена к Neon и усилена partial unique/provider indexes и денежными CHECK constraints. Проверки: lint, typecheck, build, 252 unit-теста, 20/20 Playwright, QR payment fail-closed, migration status и DB-инварианты. | По явной команде владельца установить `DMR-этап4-установка.md` и `dmr-stage4-files.zip`. Stripe-переменные пока пусты, поэтому реальных PaymentAttempt/Payment/provider events нет; полный подписанный test-mode webhook сценарий выполнить после подключения test keys и Stripe CLI. Этап 5 без отдельной команды не начинать. |
| 2026-08-18 | Реализован и локально установлен Этап 3. Добавлены `ProductionTicket`, state machine, транзакционное создание тикетов при принятии заказа, очереди кухни/бара со station/venue scope, waiter handoff/serve, aggregate round status, sold-out toggle и cursor-based polling/reconnect для production/service/guest. Миграция `20260818004303_stage3_production_queues` применилась к Neon и backfill-перенесла 4 тестовые позиции без дублей. Проверки: lint, typecheck, build, 221 unit-тест, migration status, DB-инварианты, QR/auth/cursor HTTP smoke и 20 параллельных guest polls. | По явной команде владельца начать Этап 3. SSE намеренно не включён до измерения на реальном Hostinger; автоматизированный браузер не был доступен, поэтому авторизованный визуальный проход кухни/бара оставлен владельцу. Этап 4 без отдельной команды не начинать. |
| 2026-08-18 | Добавлен локальный developer QR-entry: кнопка на `/de` вызывает `/api/dev/qr-entry`, server-only получает активный токен стола 1 и пропускает запрос через реальный `/t/[token]` flow. Токен не попадает в HTML/JSON; route и domain helper независимо закрыты в production через `NODE_ENV`, production-ответ — `404`. Проверены lint, typecheck, production build, 209 unit-тестов и HTTP-flow `menu → dev helper → QR entry → Tisch 1` с HttpOnly-cookie. | По просьбе владельца для полноценного локального теста. Это только тестовая обвязка Этапа 2, не начало Этапа 3. При изменениях сохранять fail-closed guard и не переносить токен в Client Component. |
| 2026-08-18 | Реализован и установлен Этап 2 (столы и заказы). Схема: DiningSession, SessionParticipant, OrderRound, OrderItem, OrderItemModifier, OrderRoundDecision + enum'ы SessionStatus/ReorderApprovalMode/OrderRoundStatus/OrderItemStatus; migration дополнена partial unique index активной сессии на стол. Добавлены server-side state machines, идемпотентная отправка по clientRequestId, immutable snapshots, решения официанта, reorder approval audit, ручной заказ, временная прямая отметка подачи, admin tables/QR, guest cart/status и service UI. Проверки: lint, typecheck, build, 209 unit-тестов, Neon schema/index и HTTP smoke — успешно. ProductionTicket намеренно не создавался. | По команде владельца установить `DMR-этап2-установка.md` и `dmr-stage2-files.zip`. Текущее решение: первый заказ за свободным столом автоматически открывает DiningSession (`actorType=GUEST`); первый раунд всегда требует официанта. Этап 3 без отдельной команды не начинать. |
| 2026-08-18 | Локально установлен и проверен Этап 1. Конфигурация приведена к Prisma 7 (`prisma.config.ts`, URL удалены из `schema.prisma`, standalone-сид загружает `.env`), создана и применена миграция `stage1_foundation`, выполнен идемпотентный сид. Локальная production-сборка разрешена в фазе `next build`, при реальном production runtime запрет `MEDIA_STORAGE_PROVIDER=local` сохранён. Проверки: `lint`, `typecheck`, `build`, 169 unit-тестов, health/readiness, публичное меню, QR-cookie и редирект защиты админки — успешно. | Neon: Frankfurt, pooled runtime + direct migrations. Секреты, пароль владельца и QR-токены хранятся только локально в исключённых из Git `.env` и `temp/stage1-local-access.txt`. Этап 2 не начинался. |
| 2026-08-17 | Реализован Этап 1 (фундамент и публичное меню). Создан репозиторий: Next.js 16.3.1 / React 19.2.8 / Prisma 7.9.1 / next-intl 4.13.7 / Tailwind 4. Prisma schema Этапа 1 (Venue, VenueSetting, DiningTable, TableQrToken, ProductionStation, TaxProfile, translation-first меню, Allergen/Additive/DietaryTag, MediaAsset, StaffUser/StaffSession/Role/Permission, AuditLog, LifecycleEvent), идемпотентный сид, публичное меню на `de`, вход по QR `/t/[token]`, логин персонала с rate limiting и отзываемыми сессиями, admin-обзор меню (read-only), `/api/health` и `/api/ready`, security headers. Проверки: `lint` — чисто, `test` — 169 тестов проходят (authorization matrix, деньги, translation fallback, rate limiting, пароли). Модели и маршруты Этапов 2–4 намеренно не создавались. | По команде владельца «Создавай проект согласно инструкциям». Открытые вопросы Этапа 0 остаются открытыми: провайдер object storage не выбран (загрузка медиа отключена, `MEDIA_STORAGE_PROVIDER=local` запрещён в production), Stripe не подключён, поведение SSE на Hostinger не измерено. |
| 2026-08-17 | Подготовлен пакет документов Этапа 0 (discovery/проектирование) без создания репозитория и без кода. | По команде владельца «Начинай реализацию DMR» подтверждено, что фактическая реализация будет вестись в отдельной локальной сессии с доступом к `D:\projects\dmr`; эта cloud-сессия подготовила `AGENTS.md` и `docs/*.md` для переноса. Референс `konstantinm88/waldschl-sschen` изучен только для чтения (schema.prisma, restaurant-menu*.ts, RestaurantPageContent.tsx, admin-image-upload.ts, MenuVideoUploadField.tsx, AGENTS.md) — конкретные выводы см. в `docs/architecture.md` и `docs/implementation-plan.md`. |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
