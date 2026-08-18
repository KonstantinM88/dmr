# DMR — Realtime Contract (Этап 3)

## Решение

До измерения долгоживущих соединений на реальном Hostinger используется
polling fallback. SSE-интерфейс остаётся архитектурной альтернативой, но не
объявляется production-ready на основании localhost-теста.

## Каналы

| Consumer | Endpoint | Интервал active/hidden | Данные |
| --- | --- | --- | --- |
| Kitchen/Bar | `GET /api/production/queue?kind=…&cursor=…` | 3/10 c | Изменённые после cursor тикеты; terminal статусы служат tombstones |
| Waiter | `GET /api/live/service?cursor=…` | 4/15 c | Только `changed` + новый cursor; RSC refresh выполняется при изменении |
| Guest | `GET /api/live/guest?cursor=…` | 8/15 c | Только `changed` + новый cursor по заказам и availability меню |

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

## Авторизация

- Production/service: revocable staff session + server-side permissions.
- Production дополнительно проверяет station kind и venue в domain service.
- Guest: действующий opaque QR-token только из HttpOnly cookie.
