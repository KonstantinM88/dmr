# DMR — Data Model (Этап 0, концептуальный уровень)

Это описание сущностей и связей, а не готовый `schema.prisma` — конкретные
типы полей/индексы фиксируются в Этапе 1-2 при реализации, здесь —
архитектурный контракт, обязательный к соблюдению.

## 1. Venue / инфраструктура ресторана

- **Venue** — один ресторан (не multi-tenant SaaS, но сущность есть с
  первого дня). Хранит название, локаль по умолчанию, налоговые/валютные
  настройки по умолчанию.
- **VenueSetting** — key/value операционные настройки (например,
  дефолтный `reorderApprovalMode` для новых сессий, лимиты rate limiting).
- **DiningTable** — стол: номер/label, `venueId`, активен/неактивен.
- **TableQrToken** — opaque непрогнозируемый token на стол (не
  последовательный ID), `revokedAt`, история ротации; один стол может
  иметь несколько токенов во времени (старые отозваны).

## 2. Сессии и участники

- **DiningSession** — одно посещение стола: `tableId`, статус (см.
  `order-state-machines.md`), `reorderApprovalMode`
  (`REQUIRE_WAITER`/`AUTO_ACCEPT`, default `REQUIRE_WAITER`, сбрасывается
  при закрытии), `openedAt`, `closedAt`.
- **SessionParticipant** (= анонимный Guest/Device) — `sessionId`,
  device-scoped session token (HttpOnly), без персональных данных если не
  требуется способом оплаты; связь используется для «мои позиции», не
  единственный источник истины для владения позицией.

## 3. Меню (translation-first, НЕ nameDe/nameEn/nameRu-поля)

- **MenuCategory** + **MenuCategoryTranslation** (`locale`, `title`,
  `description`) — 1:N, fallback на `de` при отсутствии перевода.
- **MenuItem** + **MenuItemTranslation** (`locale`, `name`,
  `shortDescription`, `fullDescription`, `ingredients`).
- **MenuVariant** + **MenuVariantTranslation** — размеры/варианты с
  собственной ценой.
- **ModifierGroup** + **ModifierGroupTranslation**,
  **ModifierOption** + **ModifierOptionTranslation** — обязательные и
  необязательные группы, min/max selections.
- **Allergen** + **AllergenTranslation**, **Additive**, **DietaryTag** —
  структурированные, не свободный текст. Отсутствие записи ≠ «нет
  аллергенов»; UI обязан показывать немецкое предупреждение уточнять у
  персонала.
- **TaxProfile** — ставка НДС/название, привязывается к MenuItem/Variant,
  редактируется бухгалтером/owner, не хардкодится константой.
- **MediaAsset** — `itemId`/`variantId`, `kind` (image/video), `url`
  (object storage), `posterUrl`, `status` (processing/ready/failed),
  `sortOrder`. Next.js хранит только metadata+URL, не сами файлы.

## 4. Заказы

- **OrderRound** — один «раунд» отправки (первый заказ или дозаказ):
  `sessionId`, статус (см. state machines), `approvalMode` snapshot на
  момент создания, `clientRequestId` (идемпотентность), `createdByParticipantId`.
- **OrderItem** — позиция раунда: `orderedByParticipantId`, `seatLabel?`,
  immutable product snapshot (название/вариант/модификаторы/цена/налог на
  момент заказа), `quantity`, `unitPrice`, `lineTotal`, `station`,
  `allocatedPaidAmount`, `remainingAmount`, статус (см. state machines).
- **OrderItemModifier** — snapshot выбранных модификаторов + их цена на
  момент заказа.

## 5. Производство

- **ProductionStation** — `KITCHEN`/`BAR`/`OTHER`, привязана к Venue.
- **ProductionTicket** — `orderItemId`, `stationId`, статус (см. state
  machines), таймстемпы переходов.

## 6. Финансы (разделено, НЕ `paid: boolean`)

- **Bill/Check** — `sessionId`, агрегированная сумма к оплате, статус
  вычисляется из allocations, не из UI-флага.
- **PaymentAttempt** — попытка оплаты (может быть неуспешной), `billId`,
  сумма, метод, `providerRef` (Stripe PaymentIntent id), временное
  резервирование позиций/суммы на время попытки (для будущей частичной
  оплаты — резервирование освобождается по таймауту).
- **Payment** — успешный факт оплаты, ссылается на `PaymentAttempt`.
- **PaymentAllocation** — распределение `Payment` по конкретным
  `OrderItem`/суммам; защищает от двойной оплаты позиции, оплаты выше
  остатка, отрицательного остатка, гонки двух `PaymentAttempt` за одну и
  ту же сумму.
- **PaymentProviderEvent** — сырые события Stripe webhook,
  `providerEventId` уникален (идемпотентность повторной доставки).
- **Refund**, **Tip**, **CashSettlement** — заложены в MVP-схему, UI/flow
  — Этап 5.
- **FinancialAuditEvent** — append-only журнал финансовых операций.

## 7. Staff/RBAC

- **StaffUser**, **StaffSession** (revocable, database-backed).
- **Role**, **Permission**, **StaffRole** (N:N StaffUser↔Role),
  **RolePermission** (N:N Role↔Permission). Один сотрудник — несколько
  ролей. См. полную матрицу в `docs/rbac-matrix.md`.

## 8. Аудит и фоновые операции

- **AuditLog** — общий append-only журнал административных/staff действий
  (включая смену `reorderApprovalMode`).
- **LifecycleEvent** — append-only журнал переходов state machines
  (DiningSession/OrderRound/OrderItem/ProductionTicket/Payment), пишется
  в той же транзакции, что и переход.
- **OutboxEvent** — при необходимости для фоновой обработки без
  выделенного worker (см. `architecture.md` §7).

## 9. Правило неизменности snapshot

`OrderItem` и все финансовые документы хранят собственный snapshot
(название, вариант, модификаторы, цена, ставка/сумма налога, станция,
итог, валюта, время создания). Изменение `MenuItem`/цены/налога **не**
меняет уже созданные `OrderItem`/`Payment`/`Bill`.
