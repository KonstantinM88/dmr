# DMR — RBAC Matrix

Все проверки — **server-side**. Скрытие кнопки в UI не считается защитой.
Каждый server action/route handler проверяет permission явно. Один
`StaffUser` может иметь несколько `Role` одновременно (уния разрешений).

## 1. Permissions (базовый набор, расширяется по мере реализации)

| Permission | Смысл |
| --- | --- |
| `VIEW_ASSIGNED_TABLES` | видеть назначенные столы/сессии |
| `MANAGE_DINING_SESSION` | открывать/закрывать сессию (в разрешённых случаях) |
| `APPROVE_ORDER_ROUND` | подтверждать/отклонять OrderRound и менять quantity его SUBMITTED-позиций |
| `CREATE_MANUAL_ORDER` | создавать ручной заказ от лица официанта |
| `MANAGE_REORDER_APPROVAL` | менять `reorderApprovalMode` сессии |
| `MARK_ITEM_SERVED` | отмечать подачу позиции |
| `REQUEST_PAYMENT` | инициировать запрос оплаты счёта |
| `REGISTER_CASH_PAYMENT` | начинать, подтверждать и отменять наличный платёж (Этап 5) |
| `VIEW_KITCHEN_QUEUE` / `VIEW_BAR_QUEUE` | видеть производственную очередь |
| `MANAGE_PRODUCTION_TICKET` | принимать/менять статус тикета своей станции |
| `MANAGE_MENU` | категории/позиции/цены/availability |
| `MANAGE_TABLES_QR` | столы, генерация/отзыв/ротация QR |
| `MANAGE_OPERATIONAL_SETTINGS` | VenueSetting |
| `MANAGE_STAFF` | сотрудники и назначение ролей в пределах permission |
| `VIEW_PAYMENTS` / `VIEW_REFUNDS` / `VIEW_TAX_REPORTS` | финансовая отчётность |
| `EXPORT_FINANCIAL_DATA` | разрешённые экспорты |
| `PROCESS_REFUND` | выполнение возврата (Этап 5) |
| `MANAGE_ROLES` | назначение ролей (только OWNER) |
| `VIEW_AUDIT_LOG` | просмотр аудита |
| `MANAGE_INTEGRATIONS` | Stripe configuration metadata и др. |

Финансовая история никогда не удаляется ни одной ролью — на уровне схемы
нет операции delete для `Payment`/`PaymentAllocation`/`AuditLog`/
`LifecycleEvent` (append-only, доступны только create/read).

## 2. Матрица роль × разрешение

| Permission | WAITER | BARTENDER | CHEF | ADMIN | ACCOUNTANT | OWNER |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| VIEW_ASSIGNED_TABLES | ✔ | | | | | ✔ |
| MANAGE_DINING_SESSION | ✔ | | | | | ✔ |
| APPROVE_ORDER_ROUND | ✔ | | | | | ✔ |
| CREATE_MANUAL_ORDER | ✔ | | | | | ✔ |
| MANAGE_REORDER_APPROVAL | ✔ | | | | | ✔ |
| MARK_ITEM_SERVED | ✔ | | | | | ✔ |
| REQUEST_PAYMENT | ✔ | | | | | ✔ |
| REGISTER_CASH_PAYMENT | ✔ | | | | ✔ | ✔ |
| VIEW_BAR_QUEUE | | ✔ | | | | ✔ |
| VIEW_KITCHEN_QUEUE | | | ✔ | | | ✔ |
| MANAGE_PRODUCTION_TICKET | | ✔(bar) | ✔(kitchen) | | | ✔ |
| MANAGE_MENU | | | | ✔ | | ✔ |
| MANAGE_TABLES_QR | | | | ✔ | | ✔ |
| MANAGE_OPERATIONAL_SETTINGS | | | | ✔ | | ✔ |
| MANAGE_STAFF (в пределах) | | | | ✔ | | ✔ |
| VIEW_PAYMENTS / VIEW_REFUNDS / VIEW_TAX_REPORTS | | | | | ✔ | ✔ |
| EXPORT_FINANCIAL_DATA | | | | | ✔ | ✔ |
| PROCESS_REFUND | | | | | ✔(если выдано) | ✔ |
| MANAGE_ROLES | | | | | | ✔ |
| VIEW_AUDIT_LOG | | | | | | ✔ |
| MANAGE_INTEGRATIONS | | | | | | ✔ |

Явные запреты по ТЗ (проверяются тестами authorization matrix):
WAITER не управляет глобальными ролями; BARTENDER не управляет кухней,
сотрудниками, глобальными платёжными настройками; CHEF не управляет
платежами и сотрудниками; ADMIN не может удалять финансовую историю;
ACCOUNTANT не управляет кухонной/барной очередью.

С Этапа 3 station scope проверяется дважды: queue route/server action требуют
соответствующее `VIEW_KITCHEN_QUEUE` либо `VIEW_BAR_QUEUE`, а production
domain service повторно сверяет `venueId` и `station.kind` самого тикета.

Изменение количества является частью `APPROVE_ORDER_ROUND`, а не отдельным
неаудируемым редактированием заказа. Domain service повторно проверяет
`venueId`, статус `SUBMITTED`, полный набор item ID, уникальность ID и предел
1–50; цены и суммы из клиента не принимает.

С Этапа 5 `VIEW_ASSIGNED_TABLES` разрешает принять/завершить WaiterCall
только внутри venue сотрудника. Создать или отменить гостевой вызов можно
только с действующим QR-cookie этого стола. `REGISTER_CASH_PAYMENT` отдельно
обязателен для прямого staff-запуска, подтверждения и отмены наличной
PaymentAttempt; permission также разрешает выбрать целое оплачиваемое
quantity в пределах неоплаченного количества строки. Guest никогда не создаёт
`Payment` или `CashSettlement` напрямую. Все staff-операции дополнительно
ограничены `venueId` сотрудника.

То же `VIEW_ASSIGNED_TABLES` открывает read-only печатные представления
внутренней полной платёжной ведомости и конкретной успешной оплаты только для
сессии из venue сотрудника. Это не даёт права менять финансовые записи;
регистрация наличных по-прежнему требует `REGISTER_CASH_PAYMENT`.

Экран `/[locale]/admin/zahlungen` показывает read-only финансовый отчёт по
`VIEW_PAYMENTS`/`VIEW_TAX_REPORTS`. Операционная кнопка закрытия уже полностью
оплаченной `DiningSession` показывается отдельно и на сервере требует
`MANAGE_DINING_SESSION`; она не меняет `Bill`, `Payment` или allocations.

## 3. Аутентификация

- Password hashing проверенной библиотекой (argon2id/bcrypt), не
  собственная реализация.
- `StaffSession`: database-backed, HttpOnly secure cookie, ротация при
  логине, явный logout/revoke (в т.ч. массовый revoke по StaffUser).
- Rate limiting + временная блокировка после N неудачных попыток.
- Аудит входов (успех/неуспех, IP/UA без избыточного PII в логах).
- Опциональные TOTP/passkey для OWNER и ADMIN (флаг на StaffUser).
- Секреты (`STAFF_SESSION_SECRET`, хэши паролей) никогда не попадают в
  client bundle и не логируются.

## 4. Тестовое покрытие (обязательное, Этап 1+)

Unit-тесты permissions (каждая пара роль×действие из матрицы, включая
отрицательные кейсы), authorization matrix tests как параметризованный
набор, тест на то, что UI-скрытие элемента не подменяет серверную
проверку (интеграционный тест вызывает action напрямую с ролью без
permission → ожидается отказ).
