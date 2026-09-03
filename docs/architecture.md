# DMR — Architecture

## 1. Стиль архитектуры

Модульный монолит на Next.js App Router. Один деплоящийся Node.js-процесс
(Hostinger Node.js Web App), внутри — доменные модули с чёткими границами
(`src/domains/*`), без микросервисов и без обязательного постоянного
background worker.

## 2. Доменные границы

`menu`, `tables` (QR), `sessions` (DiningSession/Participant/carts),
`orders` (OrderRound/OrderItem/идемпотентность), `production`
(станции/тикеты/realtime), `billing`, `payments` (Stripe), `staff`
(RBAC/аутентификация), `localization`, `media`, `audit`, `notifications`,
`reports`. Каждый домен: server-only Prisma/бизнес-логика в
`src/domains/<domain>/server/`, client-safe типы в
`src/domains/<domain>/shared/`, UI в `src/components/<domain>/` или
`src/domains/<domain>/ui/`.

Правило импорта (обязательное, проверяется code review/lint-правилом):
Client Components импортируют только `shared`-типы и вызывают server
actions/API routes; никогда не импортируют Prisma, Stripe server SDK,
`fs`/`child_process`, password hashing, файлы из `server/`.

## 3. Слои

- **Server Components** — публичное чтение меню, безопасное кэширование
  (revalidateTag по домену меню, инвалидация при admin-изменениях).
- **Client Components** — интерактив: корзина, карточка блюда, видео,
  staff dashboards с realtime-обновлениями.
- **Server actions / route handlers** — единственная точка мутаций;
  вся Zod-валидация внешних границ здесь.
- **Domain services** (`server/*.service.ts`) — бизнес-правила, state
  machines, транзакции Prisma.
- **Prisma access** — только из domain services, singleton client (см. §5).
- **Payment integration** — изолирован в `domains/payments`, единственное
  место со Stripe server SDK.
- **Media/storage integration** — изолирован в `domains/media`, storage
  provider скрыт за интерфейсом (`MediaStorageAdapter`).
- **Background operations** — `OutboxEvent` в Postgres + идемпотентная
  обработка + Hostinger cron endpoint / lazy processing при запросе,
  без обязательного worker-процесса (см. §7).

## 4. Абстракции инфраструктуры (обязательные интерфейсы)

```
MediaStorageAdapter   { putObject, getSignedUrl, deleteObject }
RealtimeTransport      { publish(channel, event), subscribe(...) } // SSE-реализация + polling fallback за одним интерфейсом
PaymentProvider         { createIntent, retrieveEvent, verifySignature }
EmailProvider            { send(template, to, data) }
BackgroundJobTrigger      { enqueue(outboxEvent), processDue() }
```

Все — env-driven, конкретный провайдер подставляется конфигурацией, не
захардкожен в domain-логике. Это то, что позволяет позже перейти на
Hostinger Cloud/VPS без переписывания бизнес-логики.

## 5. Prisma / Neon

- Единственный `PrismaClient` singleton через `globalThis` guard
  (server-only модуль, аналог `src/lib/prisma.ts` в референсе, но с
  `@prisma/adapter-pg` под Prisma 7 ESM).
- Runtime queries → Neon **pooled** `DATABASE_URL`.
- Migrations/introspection/backup → Neon **direct** `DIRECT_DATABASE_URL`.
- SSL обязателен, connection pool ограничен явным лимитом, query timeout
  на критических путях (submit order, create PaymentIntent), retry на
  transient disconnect.

## 6. Realtime

Единый `RealtimeTransport`-интерфейс с двумя реализациями:
1. SSE (route handler со стримом) — если стабильно работает на реальном
   Hostinger Node.js Web App (проверяется эмпирически на Этапе 0/1, не
   предполагается заранее).
2. Polling fallback с cursor/`updatedAt`/sequence, без полной перезагрузки
   истории, с уменьшением частоты на скрытой вкладке (Page Visibility
   API) — гостевые статусы 5–10 c, staff-очереди 3–5 c.

На Этапе 3 до измерения SSE на реальном Hostinger основным транспортом
реализован polling fallback: production queue получает только тикеты с
`updatedAt > cursor` (включая terminal tombstones), guest/service сначала
запрашивают лёгкий change feed и обновляют Server Components только при
изменении. Активная station queue — 3 c, waiter — 4 c, guest — 8 c;
в скрытой вкладке частота снижается. Есть reconnect по `online` и
`visibilitychange`, последний snapshot сохраняется при offline.

Операционное представление поверх этого транспорта не создаёт отдельную
notification-таблицу: `SUBMITTED OrderRound`, `QUEUED/READY ProductionTicket`
и связанные `OrderItem` остаются единственными источниками истины. Кухня/бар
получают сигнал о новых `QUEUED`, официант — о `SUBMITTED` и `READY`, гость —
визуальный серверный статус до `SERVED`. Локальный opt-in звук не заменяет
очередь и не влияет на доменные переходы.

Reconnect и восстановление состояния — обязательны для обеих реализаций.
Внешний realtime-provider или Redis не подключаются без измеренной
необходимости и согласования владельца.

## 7. Background operations без выделенного worker

`OutboxEvent` (Postgres-таблица) фиксирует событие в той же транзакции,
что и доменное изменение. Обработка — идемпотентный consumer, вызываемый
либо Hostinger cron endpoint (защищённый `CRON_SECRET`, fail-closed), либо
lazy processing при следующем релевантном HTTP-запросе. Тяжёлый
transcoding медиа не выполняется в процессе Next.js — см. `docs/media`
раздел в data-model и урок из референса ниже.

## 8. Вывод из референс-проекта (что НЕ переносить)

Референс `Waldschlösschen` транскодирует видео через `child_process.spawn`
бандл-бинарника `ffmpeg-static` прямо в HTTP-запросе admin-загрузки и
пишет файлы в `public/uploads` локального диска процесса
(`src/lib/admin-image-upload.ts`). На Hostinger Business Web Hosting это
несовместимо с ограничениями ТЗ (нет гарантии spawn произвольных
бинарников, `public/uploads` не гарантированно персистентен между
деплоями/инстансами). DMR с первого дня: изображения оптимизируются перед
загрузкой или внешним media-сервисом, видео — либо предобрабатываются
заранее, либо транскодинг выносится за пределы основного HTTP-запроса;
production media хранится в отдельном object storage/CDN, Next.js хранит
только metadata и URL (`MediaAsset`). Конкретный провайдер object storage
— открытый вопрос владельца, см. `docs/implementation-plan.md` §«Открытые
вопросы».

Переиспользуемые паттерны референса: разделение `*-shared.ts` (client-safe
типы) от server-only query-модуля; upsert-based сидинг; поведение
видео-карточки (`RestaurantMenuMedia`) как отправная точка для гостевой
карточки блюда, доработанная под чек-лист accessibility/perf из ТЗ
(IntersectionObserver-остановка вне viewport, лимит на количество
одновременно играющих видео, `prefers-reduced-motion`, `aria-label`).

## 9. Аутентификация сотрудников

Реализованное решение: versioned password hashing на Node `scrypt`
(`scrypt$…`, параметры и миграционный путь зафиксированы в `AGENTS.md`),
HttpOnly secure cookies,
database-backed revocable `StaffSession` с ротацией, rate limiting и
временная блокировка на login, audit входов, опциональные TOTP/passkey
для OWNER/ADMIN. Полностью новая система, не расширение HMAC-cookie
единственного admin-аккаунта из референса.

## 10. Кэширование публичного меню

Server Components + `revalidateTag`/`revalidatePath` на изменения меню из
admin. Заказы/статусы/платежи/разрешения — всегда динамические, без кэша.

## 11. Реализованные маршруты Этапов 2–3

- Guest: `/[locale]` (меню, корзина, submit/status), `/t/[token]` (QR entry).
- Service: `/[locale]/service`, `/[locale]/service/[sessionId]`; защищённые
  печатные представления внутренней полной ведомости и отдельной успешной
  оплаты — `/[locale]/service/[sessionId]/druck[/[paymentId]]`.
- Production: `/[locale]/produktion/kueche`, `/[locale]/produktion/bar`,
  `/api/production/queue`.
- Realtime polling: `/api/live/guest`, `/api/live/service`.
- Billing/Stripe: `/[locale]/bezahlen`, `/api/stripe/webhook`,
  `/[locale]/admin/zahlungen`; server SDK импортируется только доменом
  `payments/server`.
- Admin tables/QR: `/[locale]/admin/tische`.
- Маршруты Этапа 1 сохраняются: `/[locale]/anmelden`, `/[locale]/admin`,
  `/[locale]/admin/speisekarte`, `/api/health`, `/api/ready`.
- Локальный dev-helper: `/api/dev/qr-entry` находит активный QR-токен стола 1
  только на сервере и перенаправляет через настоящий `/t/[token]`. В
  production он fail-closed отвечает `404`; токен не рендерится в HTML.
- Production: `/[locale]/produktion/kueche`, `/[locale]/produktion/bar`.
- Polling: `/api/production/queue` (staff-auth + station RBAC, cursor delta),
  `/api/live/guest` и `/api/live/service` (лёгкие change feeds, no-store).
- Admin menu dashboard: `/[locale]/admin/speisekarte` показывает rich-карточки
  текущего меню с image/video metadata, описанием, ценой, станцией и
  availability. Там же `MANAGE_MENU` задаёт рекомендуемый/критический SLA
  приготовления, а `MANAGE_OPERATIONAL_SETTINGS` — общий SLA выдачи готовой
  позиции. Все мутации проходят server actions и аудит; guest change feed
  подхватывает availability без reload.
