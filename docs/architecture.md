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

Проверенное решение (не собственная криптография): password hashing
(argon2id/bcrypt через устоявшуюся библиотеку), HttpOnly secure cookies,
database-backed revocable `StaffSession` с ротацией, rate limiting и
временная блокировка на login, audit входов, опциональные TOTP/passkey
для OWNER/ADMIN. Полностью новая система, не расширение HMAC-cookie
единственного admin-аккаунта из референса.

## 10. Кэширование публичного меню

Server Components + `revalidateTag`/`revalidatePath` на изменения меню из
admin. Заказы/статусы/платежи/разрешения — всегда динамические, без кэша.
