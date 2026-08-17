# DMR — Implementation Plan

Каждый этап требует отдельного одобрения владельца перед началом
следующего. Не реализовывать весь продукт одним изменением.

## Этап 0 — Discovery/проектирование (этот пакет)

**Выполнено в этой сессии:** изучение референса (schema.prisma,
restaurant-menu*.ts, RestaurantPageContent.tsx, admin-image-upload.ts,
MenuVideoUploadField.tsx, AGENTS.md), проверка актуальности версий
(Next.js 16.3.1, Prisma 7.9.1 подтверждены как существующие стабильные
patch-релизы в разрешённых ветках), подготовка `AGENTS.md` и всех
`docs/*.md` этого пакета.

**Не выполнено в этой сессии (нужно сделать в целевой рабочей среде
`D:\projects\dmr`, т.к. требует локального/hPanel/аккаунтного доступа,
которого нет у cloud-сессии):**

- зафиксировать фактические лимиты текущего Hostinger Business в hPanel
  (Node.js версия, память/CPU, лимиты процесса, поведение SSE);
- зафиксировать текущий Neon plan и его лимиты (compute/storage/
  connections/network transfer);
- выбрать и подтвердить конкретного провайдера object storage/CDN для
  production media;
- получить подтверждение Stripe-аккаунта (test/live keys, Connect vs
  standard, домен для Apple/Google Pay);
- выбрать домен/поддомен для гостевого QR-flow.

**Открытые вопросы владельцу (материально влияют на архитектуру,
уточнить до начала Этапа 1):**

1. **Object storage/CDN** — есть ли уже используемый аккаунт (Cloudflare
   R2, Bunny CDN, S3-совместимый, др.) или нужно выбирать/заводить новый
   в рамках бюджета Этапа 6 (без покупки без отдельного разрешения)?
   Влияет на `MediaStorageAdapter`-реализацию и env contract.
2. **Stripe-аккаунт** — уже существует для этого бизнеса или создаётся
   заново? Standard account достаточно для MVP (весь счёт), но нужно
   знать заранее домен для Apple Pay/Google Pay verification.
3. **Neon project** — какой именно существующий project/plan/регион
   используется? Нужно для расчёта бюджета connection pool и порогов
   `scaling-thresholds.md`.
4. **Домен/URL для QR** — отдельный поддомен (например
   `order.<domain>`) или путь на существующем домене? Влияет на
   `NEXT_PUBLIC_SITE_URL` и генерацию QR.
5. **Связь с сайтом Waldschlösschen** — DMR полностью автономен (ссылка
   с сайта отеля опциональна) или должен быть встроен в навигацию
   существующего сайта? Влияет на то, нужен ли shared design-токен слой
   между проектами (ТЗ говорит о самостоятельной визуальной системе —
   по умолчанию считаем «нет», но стоит подтвердить).
6. **Единственный Venue** — подтверждение, что на старте один ресторан/
   один Venue (без multi-tenant UI для владельца нескольких заведений) —
   по умолчанию «да» согласно ТЗ, явное подтверждение не блокирует
   работу, но фиксируется здесь.

## Этап 1 — Фундамент и публичное меню

Next.js project (App Router, TS strict), Prisma/PostgreSQL (Neon pooled
runtime + direct migration connection), migrations, seed, дизайн-токены,
locale infrastructure (next-intl, de default), staff authentication,
базовый RBAC, публичное меню (категории, карточка блюда, image/video
поведение по чек-листу из `product-spec.md`), базовая admin-панель меню.
Проверки: `lint`, `typecheck`, `build`, unit-тесты денежных расчётов и
translation-fallback.

## Этап 2 — Столы и заказы

`DiningTable`/`TableQrToken` (генерация, отзыв, ротация), `DiningSession`,
`SessionParticipant`, корзины по устройству, первый заказ (`OrderRound`,
идемпотентность), подтверждение официантом, `reorderApprovalMode`, ручной
заказ официанта, аудит, гостевые статусы. Проверки: unit-тесты state
machines, идемпотентность/duplicate-submit, authorization matrix.

## Этап 3 — Производственные очереди

Waiter dashboard, kitchen display, bar display, `ProductionTicket`, SSE
(если подтверждено Этапом 0/1) + polling fallback, reconnect, ready/
served flow, sold-out обновления в реальном времени. Проверки: нагрузочный
smoke на несколько параллельных клиентов, reconnect-тест.

## Этап 4 — MVP оплаты

`Bill`, `PaymentAttempt`, Stripe test mode, оплата всего остатка,
`PAYMENT_PENDING` lock, идемпотентный webhook, `Payment`/
`PaymentAllocation`, success/failure UI, reconciliation, read-only
бухгалтерский отчёт, документирование фискальных ограничений (см.
`payment-model.md` §6). Проверки: Stripe webhook tests (валидный/
повторный/невалидная подпись), Playwright успешной/неуспешной оплаты.

## Этап 5 — Будущие способы оплаты (только по отдельной команде владельца)

Наличные, внешний терминал, «каждый платит своё», выбор позиций,
равный сплит, произвольная сумма, смешанные оплаты, частичные платежи,
чаевые, возвраты, сменная сверка.

## Этап 6 — Production hardening

Security/dependency/performance/accessibility аудит, деплой на Hostinger
Business, нагрузочный тест непосредственно на Hostinger (100 гостевых
сессий), тест Stripe webhook под нагрузкой, тест SSE/polling, запись
метрик Hostinger и Neon, проверка object storage/CDN, backup/restore
процедура, мониторинг, rollback, production readiness checklist, решение
о сохранении текущих тарифов на основании измерений (не автоматически).

## Правила автономности (напоминание)

Для реализации — только согласованный этап, локальные изменения,
безопасные проверки, исправление обнаруженных в рамках этапа дефектов,
без перехода к следующему этапу без одобрения. Подтверждение владельца
обязательно перед: удалением данных, database reset, production
migration, внешним деплоем, покупкой/апгрейдом Hostinger/Neon/Stripe/
storage ресурсов, созданием production Stripe resources, изменением DNS,
использованием реальных клиентских данных, материальным расширением
scope. Никаких деструктивных команд к БД в проде.
