# DMR — Realtime Contract (Этап 3)

## Решение

До измерения долгоживущих соединений на реальном Hostinger используется
polling fallback. SSE-интерфейс остаётся архитектурной альтернативой, но не
объявляется production-ready на основании localhost-теста.

## Каналы

| Consumer | Endpoint | Интервал active/hidden | Данные |
| --- | --- | --- | --- |
| Kitchen/Bar | `GET /api/production/queue?kind=…&cursor=…` | 3/10 c | Изменённые после cursor тикеты; новые `QUEUED` подсвечиваются и подают локальный opt-in сигнал, terminal статусы служат tombstones |
| Waiter | `GET /api/live/service?cursor=…` | 4/15 c | Изменения сессий, заказов, Bill/PaymentAttempt и WaiterCall; `SUBMITTED` и все незавершённые `QUEUED/ACCEPTED/IN_PROGRESS/READY` попадают в контроль обслуживания со станцией и таймером, ответ `changed` запускает RSC refresh |
| Guest | `GET /api/live/guest?cursor=…` | 8/15 c (на оплате 3/15 c) | Изменения меню, заказов, Bill/PaymentAttempt и WaiterCall текущего QR-стола; RSC показывает серверные статусы принят/готовится/готов/подан |

Все ответы `private, no-store`. Cursor — ISO timestamp snapshot-а БД;
запрос выбирает `updatedAt > cursor AND updatedAt <= snapshotAt`, затем
возвращает `snapshotAt` следующим cursor, чтобы не терять изменения между
выборкой и ответом.

## Reconnect

- При `navigator.onLine=false` UI сохраняет последний snapshot и показывает
  offline-состояние.
- `online` и `visibilitychange` запускают немедленный запрос.
- Ошибка сети переводит канал в reconnecting; следующий polling повторяет
  запрос с тем же cursor, поэтому изменения не теряются.
- Полный snapshot production queue запрашивается при первом SSR/загрузке;
  далее применяются только delta.
- Full snapshot никогда не включает тикеты `CLOSED`/`CANCELLED` сессий.
  Если сессия закрылась после открытия station screen, изменение её
  `updatedAt` возвращает связанные незавершённые тикеты как `CANCELLED`
  tombstones, чтобы удалить карточки без ручной перезагрузки.

## Операционные сигналы

- Звук на экранах кухни, бара и официанта включается сотрудником явно один
  раз: браузеры запрещают autoplay без пользовательского жеста. Настройка
  хранится только в `localStorage`, показанные в этой вкладке signal ID — в
  `sessionStorage`; финансовые или персональные данные туда не записываются.
- Звук и vibration — вспомогательный UX. Источником истины остаётся визуальная
  очередь из БД с `aria-live`, статусом и живой длительностью ожидания.
- Один новый объект подаёт один сигнал на канал; reconnect или RSC refresh не
  должны повторять уже увиденный в этой вкладке сигнал.

## Авторизация

- Production/service: revocable staff session + server-side permissions.
- Production дополнительно проверяет station kind и venue в domain service.
- Guest: действующий opaque QR-token только из HttpOnly cookie.
