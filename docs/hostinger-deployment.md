# DMR — Hostinger Deployment

## 1. Модель деплоя

Next.js как полноценное server-side Node.js приложение через **Hostinger
Node.js Web App** (не статический экспорт, не serverless functions).
Деплой из GitHub, production build (`npm run build`), start command
(`npm run start` / Hostinger-managed process manager), env variables
через hPanel, persistent Node.js process.

## 2. Что НЕ предполагается доступным (проверять эмпирически, не считать данностью)

root access, Docker, локальный Redis, отдельный постоянно работающий
worker-процесс, системный FFmpeg, произвольные системные пакеты,
неограниченная локальная файловая система, гарантированная поддержка
долгоживущих WebSocket-соединений. Референс-проект (Waldschlösschen)
сегодня полагается на `spawn` бандл-бинарника `ffmpeg-static` и локальный
`public/uploads` — это прямое нарушение этих ограничений и не переносится
в DMR (см. `architecture.md` §8).

## 3. Env contract (имена, без значений)

`DATABASE_URL` (Neon pooled), `DIRECT_DATABASE_URL` (Neon direct, для
миграций), `NEXT_PUBLIC_SITE_URL`, `STAFF_SESSION_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
`MEDIA_STORAGE_*` (набор зависит от выбранного провайдера — открытый
вопрос, см. `implementation-plan.md`), `CRON_SECRET` (fail-closed без
него), `NODE_ENV`. Значения никогда не попадают в docs/commits/логи.

## 4. Обязательные эндпоинты

- `GET /api/health` — процесс жив (без обращения к БД, быстрый ответ).
- `GET /api/ready` — готовность (проверка соединения с Neon), если
  поддерживается окружением/процесс-менеджером Hostinger.
- `POST /api/stripe/webhook` — с проверкой подписи, независимый источник
  истины по платежам.
- `POST /api/cron/*` (если используется) — защищён `CRON_SECRET`,
  fail-closed без секрета (аналог `/api/admin/cron` в референсе —
  паттерн подтверждён как рабочий).

## 5. SSE vs polling — решение по измерению, не заранее

1. Этап 3 локально использует cursor-based polling; localhost не считается
   доказательством пригодности SSE на shared hosting.
2. На Этапе 6 — прямой тест SSE route handler на реальном Hostinger Node.js
   Web App: держим соединение открытым N минут под параллельными клиентами,
   проверяем таймауты прокси и буферизацию.
3. Если стабильно — используется `RealtimeTransport` с SSE-реализацией
   для guest order statuses, waiter dashboard, kitchen/bar queue.
4. Если нестабильно — сохраняется polling: guest-статусы каждые 5–10 c,
   активные staff-очереди каждые 3–5 c, с уменьшением частоты на
   `document.hidden` (Page Visibility API), запросы только «что
   изменилось после cursor/updatedAt», без перезагрузки полной истории.
5. Reconnect и восстановление состояния — обязательны в обеих ветках.
6. Redis/внешний realtime-provider не подключается без измеренной
   необходимости и отдельного согласования владельца.

## 6. Media

Production media — не в `public/uploads` локального диска процесса
(не гарантированно персистентно между деплоями/инстансами на shared
hosting). Используется отдельный object storage/CDN (конкретный
провайдер — открытый вопрос владельца, см. `implementation-plan.md`).
Next.js хранит только `MediaAsset` metadata+URL. Тяжёлый transcoding —
вне основного HTTP-запроса (см. `architecture.md` §7).

## 7. Мониторинг, откат, восстановление

- Deployment logs через Hostinger hPanel.
- Мониторинг CPU/RAM/I/O на стороне Hostinger, мониторинг connections/
  compute/storage/network transfer на стороне Neon (см.
  `scaling-thresholds.md`).
- Безопасный restart процесса без потери in-flight запросов на webhook
  (Stripe ретраит недоставленные события — не критично при коротком evroцессе restart).
- Rollback procedure: откат на предыдущий известный good-деплой из
  GitHub + `prisma migrate status` проверка перед повторным стартом,
  миграции — только forward-compatible до подтверждения отката (не
  деструктивные down-миграции в проде без отдельного шага).
- Backup/restore — на стороне Neon (point-in-time recovery), процедура
  восстановления документируется отдельно перед production (Этап 6).
- Webhook failure alerts — на основе `PaymentProviderEvent`/ошибок
  обработки, требует канал уведомления (email/иное) — уточняется на
  Этапе 4.

## 8. Что нужно подтвердить эмпирически до Этапа 1 (см. открытые вопросы)

Точная версия Node.js, поддерживаемая Hostinger Node.js Web App (целевая
— Node 24 LTS, иначе — актуальная совместимая LTS), лимиты процесса
(память/CPU/таймаут запроса), поведение при параллельных запросах,
доступность cron-механизма hPanel, реальное поведение SSE.
