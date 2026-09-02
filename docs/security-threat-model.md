# DMR — Security Threat Model

## 1. Поверхности атаки

1. Гостевой QR-flow (анонимный, без аутентификации) — самая широкая
   поверхность, доступна кому угодно с камерой.
2. Staff/admin аутентифицированная зона.
3. Payment endpoints (создание PaymentIntent, Stripe webhook).
4. Media upload (admin).
5. Realtime endpoints (SSE/polling).

## 2. Угрозы и меры

| Угроза | Мера |
| --- | --- |
| Перебор/угадывание номера стола через QR URL | `TableQrToken` — непрогнозируемый opaque token, не последовательный ID; отзыв и ротация без пересоздания стола |
| Массовые ложные заказы с одного стола/устройства | Rate limiting на submit OrderRound по participant+table, идемпотентность через `clientRequestId` |
| Подделка цены на клиенте | Сервер всегда пересчитывает по БД (см. `order-state-machines.md` §7), клиентская цена — только preview |
| CSRF на server actions/mutations | Next.js server actions + explicit origin check / CSRF token на custom API routes |
| XSS через описание блюда/отзыв | Экранирование по умолчанию (React), Zod-валидация на входе, без `dangerouslySetInnerHTML` для пользовательского контента |
| Открытая переадресация через QR/redirect параметры | Whitelist разрешённых internal-путей для redirect, без произвольного `next=` из query |
| Mass assignment на admin/staff формах | Zod-схемы с explicit allow-list полей на каждый server action, не `...body` напрямую в Prisma `update` |
| Брутфорс staff-логина | Rate limiting + временная блокировка после N попыток, audit входов |
| Кража/переиспользование session cookie | HttpOnly + Secure + SameSite, database-backed revocable session, ротация при логине |
| Поддельный Stripe webhook | Обязательная проверка подписи (`STRIPE_WEBHOOK_SECRET`) на каждый запрос, отказ без валидной подписи |
| Повторная доставка webhook создаёт задвоение | `providerEventId` unique, атомарный processing lease, уникальный `Payment.attemptId` |
| Временный сбой после записи webhook навсегда теряет событие | `FAILED` и просроченный `PROCESSING` повторно захватываются; Stripe получает 500 при временной ошибке |
| Злоупотребление payment endpoint (спам PaymentIntent) | Rate limiting на создание PaymentIntent + серверная проверка состояния Bill перед созданием |
| Гость отменяет чужую попытку оплаты | attemptId дополнительно связывается с DiningSession текущего QR-стола server-side |
| Два одновременных клика создают два PaymentIntent | partial unique active-attempt index + стабильный Stripe idempotency key |
| Гость передаёт чужие/оплаченные позиции или ложную сумму | Guest передаёт только OrderItem ids; server заново проверяет принадлежность Bill и вычисляет остатки, `PaymentAttemptAllocation` фиксирует план |
| Гость сам объявляет наличные полученными | Guest может создать только CASH PaymentAttempt; Payment/CashSettlement создаёт staff action с `REGISTER_CASH_PAYMENT` после проверки received amount |
| Две группы одновременно платят одну позицию | Один active PaymentAttempt на Bill для CASH и STRIPE, planned allocations и optimistic update остатков |
| Спам кнопкой вызова официанта | Rate limit новых WaiterCall + partial unique один active call на DiningSession; повтор возвращает существующий вызов |
| Сотрудник меняет вызов/наличный запрос другого заведения | Каждое staff action повторно ограничивает сущность по `principal.venueId` |
| Вредоносный upload (media) | Проверка реального MIME (не расширения), лимит размера, серверная проверка контейнера, безопасные сгенерированные filenames, storage prefix изолирован от произвольного path traversal |
| MIME sniffing на отдаваемых файлах | `Content-Type`/`X-Content-Type-Options: nosniff` на media-раздаче через storage/CDN |
| Утечка секретов в client bundle | Секреты только в server-only модулях/env, явный lint-guard на импорт server-only в client-компоненты |
| Утечка секретов в логах | Маскирование/исключение Stripe secrets, session tokens, полных cookie, паролей, платёжных данных из structured logging |
| Случайная публикация локального QR-helper | `/api/dev/qr-entry` имеет двойной `NODE_ENV === 'development'` guard (route + server-only domain service), в production отвечает `404`, не отдаёт токен в HTML/JSON и перенаправляет только на фиксированный внутренний `/t/[token]` |
| Доступ кухни к бару или бара к кухне | Queue GET и transition server action независимо требуют staff session, `MANAGE_PRODUCTION_TICKET` и station-specific `VIEW_KITCHEN_QUEUE`/`VIEW_BAR_QUEUE`; domain service повторно сверяет `venueId` и `station.kind` тикета |
| Утечка realtime-данных через кэш | Все polling endpoints отвечают `private, no-store`; guest feed разрешает стол только по HttpOnly QR-cookie, staff feeds — только по revocable staff session |
| Избыточный сбор персональных данных | GDPR data minimization: гость не обязан давать email/телефон/имя, если это не требуется выбранным способом оплаты |
| Отсутствие retention-политики | Явная retention policy для `SessionParticipant`/логов, задокументирована перед production |

## 3. Заголовки и общая защита

Content Security Policy (без `unsafe-inline` где возможно), стандартные
security headers (`X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`,
`Strict-Transport-Security` на проде), env validation при старте
процесса (fail-fast при отсутствующем обязательном secret), явный список
доверенных origin для CORS (по умолчанию — none, кроме собственного
домена).

## 4. Аудит

Критические действия — в `AuditLog`/`LifecycleEvent`/
`FinancialAuditEvent`: смена ролей, смена `reorderApprovalMode`, ручные
финансовые операции, отзыв/ротация QR, изменения цен и availability.

## 5. Тестовое покрытие

Authorization matrix tests (см. `rbac-matrix.md` §4), idempotency/
duplicate-submit tests, invalid Stripe signature test, upload validation
tests (неверный MIME, превышение размера), rate-limit тест на QR/order
endpoint, security headers smoke test на production build.
