# DMR — Data Model (актуально на Этап 3)

Архитектурный контракт сущностей и связей. Для уже реализованных Этапов 1–3
точные типы и индексы определяют `prisma/schema.prisma` и
`prisma/migrations`; будущие сущности Этапов 3+ ниже остаются концептуальными.

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
  при закрытии), `openedAt`, `closedAt`, optional staff actor открытия и
  закрытия. Первый гостевой заказ за свободным активным столом может открыть
  сессию автоматически. Partial unique index
  `dining_sessions_active_per_table` гарантирует не более одной сессии не в
  `CLOSED/CANCELLED` на стол.
- **SessionParticipant** (= анонимный Guest/Device) — `sessionId`,
  device-scoped secret в HttpOnly-cookie, в БД только `tokenHash`, optional
  `displayLabel`/`seatLabel`, без персональных данных; связь используется для
  «мои позиции», не единственный источник истины для владения позицией.
- **WaiterCall** — гостевой вызов сервиса: `OPEN → ACKNOWLEDGED → RESOLVED`
  либо `CANCELLED`, timestamps принятия/завершения и staff actor. Partial
  unique index допускает только один активный вызов на DiningSession.

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
  `sessionId`, последовательный `sequence`, статус (см. state machines),
  `approvalMode` snapshot на момент создания, `isFirstRound`,
  `clientRequestId` (идемпотентность уникальна внутри session), guest/staff
  actor, `totalGrossCents`, timestamps submit/decision.
- **OrderItem** — позиция раунда: `orderedByParticipantId`, `seatLabel?`,
  immutable product snapshot (название/вариант/модификаторы/unit price/ставка
  налога на момент заказа), `quantity`, `unitPriceCents`, `lineTotalCents`, station и
  station-kind snapshots, `allocatedPaidCents`, `remainingCents`, статус и
  optional причина отказа (см. state machines).
  Пока позиция остаётся `SUBMITTED`, сотрудник с `APPROVE_ORDER_ROUND` может
  изменить только `quantity` в диапазоне 1–50 в составе решения по раунду.
  Сервер пересчитывает `lineTotalCents`, `taxAmountCents`, `remainingCents` и
  `OrderRound.totalGrossCents` из сохранённых snapshot-цены и ставки. После
  подтверждения количество снова неизменяемо.
- **OrderItemModifier** — snapshot выбранных модификаторов + их цена на
  момент заказа.
- **OrderRoundDecision** — append-only решение сотрудника: итоговый status,
  массивы принятых/отклонённых item ids, optional note, staff actor и время.
  Изменения количества сохраняются в metadata транзакционного LifecycleEvent
  и в AuditLog решения (старое/новое значение).

## 5. Производство

- **ProductionStation** — `KITCHEN`/`BAR`/`OTHER`, привязана к Venue.
- **ProductionTicket** — ровно один на принятую `OrderItem` со станцией
  (`orderItemId` unique), `stationId`, статус (см. state machines),
  `queuedAt/acceptedAt/startedAt/readyAt/handedOffAt/cancelledAt` и
  `updatedAt` как cursor polling. Создаётся в той же транзакции, в которой
  позиция становится `ACCEPTED`; уникальность делает маршрутизацию
  идемпотентной. Исторические позиции Этапа 2 backfill-ятся миграцией с
  сохранением фактического состояния.

## 6. Финансы (разделено, НЕ `paid: boolean`)

- **Bill/Check** — ровно один на `DiningSession` (`sessionId` unique),
  агрегированная сумма к оплате; статус вычисляется из allocations, не из
  UI-флага. Неизменившийся пересчёт не пишет лишний `updatedAt`.
- **PaymentAttempt** — попытка оплаты (может быть неуспешной), `billId`,
  сумма, метод, `providerRef` (Stripe PaymentIntent id), временное
  резервирование позиций/суммы на время попытки (для будущей частичной
  оплаты — резервирование освобождается по таймауту). Partial unique index
  допускает не более одной активной (`CREATED`/`PENDING`) попытки на Bill.
- **PaymentAttemptAllocation** — неизменяемый план выбранных позиций,
  количества целых единиц (`quantity`) и серверно рассчитанных сумм,
  резервируемый до подтверждения Stripe webhook или наличных сотрудником.
  `expectedRemainingCents` фиксирует остаток строки при создании плана для
  optimistic concurrency. Guest передаёт ids строк, staff — ids и quantity;
  цену и сумму клиент не передаёт.
- **Payment** — успешный факт оплаты, ссылается на `PaymentAttempt`.
- **PaymentAllocation** — распределение `Payment` по конкретным `OrderItem`,
  фактически оплаченному `quantity` и суммам; защищает от двойной оплаты позиции, оплаты выше
  остатка, отрицательного остатка, гонки двух `PaymentAttempt` за одну и
  ту же сумму.
- **PaymentProviderEvent** — сырые события Stripe webhook,
  `providerEventId` уникален. Состояния `RECEIVED/PROCESSING/PROCESSED/
  IGNORED/FAILED` и lease по `updatedAt` позволяют повторить событие после
  временного сбоя, но не обработать его параллельно.
- **CashSettlement** — подтверждённый сотрудником наличный расчёт со ссылкой
  на `Payment`, полученной суммой и сдачей. Guest создаёт только ожидающую
  попытку и не может сам отметить позиции оплаченными.
- **Refund**, **Tip** — заложены в схему; UI/flow остаётся будущей частью
  Этапа 5.
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
  (DiningSession/OrderRound/OrderItem/ProductionTicket/Payment/WaiterCall), пишется
  в той же транзакции, что и переход.
- **OutboxEvent** — при необходимости для фоновой обработки без
  выделенного worker (см. `architecture.md` §7).

## 9. Правило неизменности snapshot

`OrderItem` и все финансовые документы хранят собственный snapshot
(название, вариант, модификаторы, цена, ставка/сумма налога, станция,
итог, валюта, время создания). Изменение `MenuItem`/цены/налога **не**
меняет уже созданные `OrderItem`/`Payment`/`Bill`.
