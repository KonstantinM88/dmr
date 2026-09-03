# DMR — Order State Machines

Все state machines — централизованные server-side модули
(`src/domains/*/server/*-state-machine.ts`), UI не предлагает переход,
который сервер запретит. Каждый разрешённый переход пишет
`LifecycleEvent` в той же транзакции, что и само изменение.

## 1. DiningSession

```
OPEN → PAYMENT_PENDING → PARTIALLY_PAID → PAID → CLOSED
OPEN → CANCELLED
PAYMENT_PENDING → OPEN            (сбой оплаты возвращает в безопасное состояние)
PARTIALLY_PAID → PAYMENT_PENDING  (новая попытка оплаты остатка)
```

- Новые `OrderRound` запрещены, пока сессия в `PAYMENT_PENDING`.
- `reorderApprovalMode` живёт только пока сессия не в
  `{PAYMENT_PENDING, PAID, CLOSED, CANCELLED}` — `AUTO_ACCEPT` запрещён
  в этих статусах.
- Закрытие (`CLOSED`) — отдельное бизнес-действие после `PAID`, не
  автоматическое. Оно доступно сотруднику с `MANAGE_DINING_SESSION` как на
  экране стола, так и в операционном блоке полностью оплаченных столов на
  `/[locale]/admin/zahlungen`; финансовые записи при этом не изменяются.
- После `CLOSED` тот же действующий QR-код может начать новое посещение:
  первый новый заказ создаёт новую `DiningSession` и нового участника.

## 2. OrderRound

```
SUBMITTED → ACCEPTED → IN_PROGRESS → READY → SERVED
SUBMITTED → PARTIALLY_ACCEPTED → IN_PROGRESS → READY → SERVED
SUBMITTED → REJECTED
ACCEPTED/PARTIALLY_ACCEPTED/IN_PROGRESS/READY → CANCELLED
                                             (ограниченно, аудируется)
```

- Первый `OrderRound` сессии всегда создаётся в `SUBMITTED` и требует
  действия официанта (`APPROVE_ORDER_ROUND`), независимо от
  `reorderApprovalMode`.
- Для последующих раундов: если `reorderApprovalMode = AUTO_ACCEPT` на
  момент submit — раунд получает `ACCEPTED` немедленно и позиции сразу
  маршрутизируются на станции; если `REQUIRE_WAITER` — остаётся
  `SUBMITTED`.
- Переключение `reorderApprovalMode` влияет только на **будущие**
  раунды; уже созданные `OrderRound` не меняют статус ретроактивно.
- Пока раунд находится в `SUBMITTED`, официант с `APPROVE_ORDER_ROUND` может
  перед подтверждением изменить количество каждой выбранной позиции в
  диапазоне 1–50. Клиент передаёт только item ID и количество; сервер заново
  рассчитывает строку, налог, остаток и итог раунда из snapshot-цены. Правка
  количества, решение, статусы позиций, создание ProductionTicket и
  LifecycleEvent фиксируются одной optimistic транзакцией. После выхода из
  `SUBMITTED` количество изменять нельзя.

## 3. OrderItem

```
SUBMITTED → ACCEPTED → IN_PREPARATION → READY → SERVED
SUBMITTED → REJECTED
ACCEPTED/IN_PREPARATION → CANCELLED   (ограниченно, аудируется)
```

С Этапа 3 `ProductionTicket` управляет переходами позиции:
`IN_PROGRESS` тикета переводит позицию в `IN_PREPARATION`, `READY` — в
`READY`. Только после этого официант может выполнить «Serviert»: тикет
`READY → HANDED_OFF`, позиция `READY → SERVED` в одной транзакции.
Прямой Stage 2 путь из `ACCEPTED` больше не разрешён.
Уменьшение количества до нуля не используется как скрытая отмена: минимум —
1, для отказа от позиции официант снимает её чекбокс и указывает причину.

## 4. ProductionTicket

```
QUEUED → ACCEPTED → IN_PROGRESS → READY → HANDED_OFF
QUEUED/ACCEPTED/IN_PROGRESS → CANCELLED
```

Тикет создаётся только для позиций уже `ACCEPTED` на уровне OrderRound
(вручную официантом либо автоматически при `AUTO_ACCEPT`), направляется
на станцию по `MenuItem.station`.

- CHEF/BARTENDER могут менять только тикеты своей `station.kind`; проверка
  выполняется server-side помимо общего `MANAGE_PRODUCTION_TICKET`.
- Статус раунда агрегируется по активным позициям: первая готовящаяся
  позиция → `IN_PROGRESS`, все активные готовы/поданы → `READY`, все поданы
  → `SERVED`. Переходы записываются последовательно без перепрыгивания.
- Каждый переход тикета и позиции пишет `LifecycleEvent` в той же
  транзакции; staff-действие дополнительно пишет `AuditLog`.
- `QUEUED` является ожидающим действием кухни/бара; station queue показывает
  время с `queuedAt`. После `READY` позиция исчезает из обязанностей станции
  только при `HANDED_OFF`, а до этого видна официанту как готовая к выдаче с
  временем с `readyAt`.
- Официант может выполнить `READY → HANDED_OFF` прямо из attention board
  столов или из detail-экрана стола. Guest change feed затем показывает
  позицию как `SERVED`; отдельного клиентского подтверждения не требуется.
- Waiter board и detail стола показывают не только `READY`, но весь
  незавершённый путь тикета: `QUEUED`, `ACCEPTED`, `IN_PROGRESS`, `READY`.
  Для каждой позиции видны кухня/бар и время с начала текущего статуса;
  список сортируется от самого старого ожидания. `HANDED_OFF`/`CANCELLED`
  из контроля исчезают.
- Для `QUEUED`/`ACCEPTED`/`IN_PROGRESS` SLA считается от `queuedAt` по
  неизменяемому snapshot нормативов MenuItem: до recommended — зелёный,
  после recommended — жёлтый, после critical — красный. Для `READY` тот же
  индикатор считает время от `readyAt` по отдельной VenueSetting выдачи.
  Если администратор не настроил оба предела, UI явно показывает, что SLA
  не настроен, и не подставляет выдуманные значения.

## 5. Payment

```
CREATED → PENDING → SUCCEEDED
CREATED → PENDING → FAILED
CREATED → SUCCEEDED/FAILED        (webhook обогнал локальную запись PENDING)
CREATED/PENDING → CANCELLED
SUCCEEDED → PARTIALLY_REFUNDED → REFUNDED
```

Для `STRIPE` источник истины — webhook, не client redirect. Для `CASH`
`PENDING` означает ожидание подтверждения официантом; эту попытку может
начать гость или сотрудник с `REGISTER_CASH_PAYMENT`. `SUCCEEDED` создаёт
только staff action с тем же permission после фактического получения денег.

## 6. WaiterCall

```
OPEN → ACKNOWLEDGED → RESOLVED
OPEN → RESOLVED
OPEN/ACKNOWLEDGED → CANCELLED
```

Повторный guest-клик возвращает существующий активный вызов. Partial unique
index запрещает два активных вызова одной DiningSession. Терминальные вызовы
не возобновляются; новый вызов создаётся отдельной записью.

## 7. Алгоритм submit OrderRound (обязательные 13 шагов, в одной транзакции где применимо)

1. Разрешить активный стол по QR. Если активной `DiningSession` нет, первый
   гостевой заказ открывает её в той же транзакции (`actorType=GUEST`);
   partial unique index не допускает две активные сессии на одном столе.
2. Проверить, что сессия не в `PAYMENT_PENDING`.
3. Проверить QR/participant session token.
4. Проверить rate limit (по столу/участнику).
5. Проверить `clientRequestId` (идемпотентность — при повторе вернуть тот
   же результат, не создавать дубликат).
6. Загрузить актуальные `MenuItem`/`MenuVariant`/`ModifierOption` из БД
   (не доверять клиентским ценам).
7. Проверить публикацию (`isPublished`) и availability каждой позиции.
8. Взять цены только из БД на момент запроса.
9. Рассчитать сумму на сервере (integer minor units, см.
   `payment-model.md`).
10. Создать неизменяемые product snapshots на `OrderItem`.
11. Определить `SUBMITTED` vs `ACCEPTED` по текущему
    `reorderApprovalMode` сессии (для первого раунда — всегда
    `SUBMITTED`).
12. Создать `LifecycleEvent`/domain event. На Этапе 2 сохранить station в
    snapshot позиции; `ProductionTicket` намеренно откладывается до Этапа 3.
13. Вернуть детерминированный результат при безопасном повторе запроса
    (тот же `OrderRound`, не новый).

## 8. Аудит смены `reorderApprovalMode`

Каждое изменение сохраняет: `sessionId`, предыдущее значение, новое
значение, `staffUserId`, время. Пишется в `AuditLog` и отражается в
staff UI заметно (баннер текущего режима на экране стола). Только
`MANAGE_REORDER_APPROVAL` может менять; официант может вернуть
`REQUIRE_WAITER` в любой момент.

## 9. Тестовое покрытие (Этап 1-5)

После добавления русской локали и admin close flow проходят 263 unit-теста,
включая валидные/невалидные переходы
DiningSession/OrderRound/OrderItem, правила первого раунда и
`reorderApprovalMode`, а также server-side pricing и snapshot-суммы.
Идемпотентность дополнительно защищена unique constraint
`(sessionId, clientRequestId)`; DB-level concurrency и snapshot integration
tests остаются обязательными перед production hardening.
Этап 3 добавляет unit-тесты полного/недопустимого пути ProductionTicket,
сопоставления Ticket→OrderItem, агрегирования OrderRound и reconnect merge
очереди (full snapshot, delta, terminal tombstones).
Этап 4 добавляет арифметику Bill/PaymentAllocation, защиту от переплаты,
tax snapshot и переходы PaymentAttempt, включая ранний webhook.
Этап 5 добавляет выбранные allocation plans, наличную сдачу и WaiterCall,
включая запрет возобновления терминального вызова.
