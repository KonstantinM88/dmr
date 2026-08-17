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
  автоматическое.

## 2. OrderRound

```
SUBMITTED → ACCEPTED → IN_PROGRESS → READY → SERVED
SUBMITTED → PARTIALLY_ACCEPTED → IN_PROGRESS → READY → SERVED
SUBMITTED → REJECTED
ACCEPTED/IN_PROGRESS/READY → CANCELLED   (ограниченно, аудируется)
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

## 3. OrderItem

```
SUBMITTED → ACCEPTED → IN_PREPARATION → READY → SERVED
SUBMITTED → REJECTED
ACCEPTED/IN_PREPARATION → CANCELLED   (ограниченно, аудируется)
```

Статус `OrderItem` управляется через `ProductionTicket` соответствующей
станции, но хранится и на уровне позиции для гостевого UI.

## 4. ProductionTicket

```
QUEUED → ACCEPTED → IN_PROGRESS → READY → HANDED_OFF
QUEUED/ACCEPTED/IN_PROGRESS → CANCELLED
```

Тикет создаётся только для позиций уже `ACCEPTED` на уровне OrderRound
(вручную официантом либо автоматически при `AUTO_ACCEPT`), направляется
на станцию по `MenuItem.station`.

## 5. Payment

```
CREATED → PENDING → SUCCEEDED
CREATED → PENDING → FAILED
CREATED/PENDING → CANCELLED
SUCCEEDED → PARTIALLY_REFUNDED → REFUNDED
```

Источник истины — Stripe webhook, не client redirect. `PENDING` = ждём
webhook; `SUCCEEDED` создаётся только после верифицированного события.

## 6. Алгоритм submit OrderRound (обязательные 13 шагов, в одной транзакции где применимо)

1. Проверить активную `DiningSession` (существует, не `CLOSED`/`CANCELLED`).
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
12. Создать `LifecycleEvent`/domain event, при `ACCEPTED` — сразу создать
    `ProductionTicket` на нужные станции.
13. Вернуть детерминированный результат при безопасном повторе запроса
    (тот же `OrderRound`, не новый).

## 7. Аудит смены `reorderApprovalMode`

Каждое изменение сохраняет: `sessionId`, предыдущее значение, новое
значение, `staffUserId`, время. Пишется в `AuditLog` и отражается в
staff UI заметно (баннер текущего режима на экране стола). Только
`MANAGE_REORDER_APPROVAL` может менять; официант может вернуть
`REQUIRE_WAITER` в любой момент.

## 8. Тестовое покрытие (Этап 1-2+)

Unit-тесты каждой state machine (валидные/невалидные переходы), unit-тест
`reorderApprovalMode` (включая запрет в PAYMENT_PENDING/PAID/CLOSED/
CANCELLED), concurrency-тест на двойной submit с одним
`clientRequestId`, snapshot-тест на неизменность `OrderItem` при
изменении цены меню после отправки заказа.
