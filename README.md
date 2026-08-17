# DMR — Digital Menu Restaurant

Цифровое ресторанное меню по QR-коду: гостевая карта, заказы с подтверждением
официантом, очереди кухни и бара, онлайн-оплата и ролевая staff-панель.

Текущее состояние: **Этап 1 — фундамент и публичное меню**.
Этапы 2–6 не начинаются без отдельного одобрения владельца
(см. `docs/implementation-plan.md`).

## Стек

Next.js 16 (App Router) · React 19 · TypeScript strict · Prisma 7 с
`@prisma/adapter-pg` · PostgreSQL (Neon) · Tailwind CSS 4 · next-intl ·
Zod · Vitest · Playwright.

## Быстрый старт

```bash
npm install                 # postinstall сам выполнит prisma generate
cp .env.example .env        # заполнить DATABASE_URL, DIRECT_DATABASE_URL,
                            # STAFF_SESSION_SECRET
npm run db:migrate          # создать миграцию и применить её к базе
npm run db:seed             # меню, столы с QR, роли, владелец
npm run dev                 # http://localhost:3000/de
```

Сид печатает выпущенные QR-токены столов в формате `/t/<token>` — по этим
ссылкам открывается гостевой вход. Повторно они не показываются: для нового
токена используйте ротацию (`rotateTableToken`).

Вход в staff-зону: `/de/anmelden`, учётные данные — из `SEED_OWNER_EMAIL` и
`SEED_OWNER_PASSWORD`.

## Команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | локальная разработка |
| `npm run build` / `npm run start` | production-сборка и запуск |
| `npm run lint` | ESLint, включая guard на server-only импорты в client-компонентах |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | unit-тесты (Vitest) |
| `npm run test:e2e` | Playwright smoke (нужна поднятая база с сидом) |
| `npm run db:generate` | генерация Prisma Client |
| `npm run db:migrate` | миграция в разработке |
| `npm run db:migrate:deploy` | применение миграций на сервере |
| `npm run db:seed` | идемпотентный сид |

## Что реализовано на Этапе 1

- **Данные:** Venue и настройки, столы с отзываемыми opaque QR-токенами,
  translation-first меню (категории, позиции, варианты, модификаторы),
  аллергены/добавки/dietary как справочники, `TaxProfile`, `MediaAsset`
  (только metadata и URL), персонал с ролями и разрешениями, append-only
  `AuditLog` и `LifecycleEvent`.
- **Гостевая часть:** публичное меню на `de`, карточка блюда с видео
  (тап — воспроизведение, пауза вне viewport, `prefers-reduced-motion`),
  вход по QR через нейтральный к языку `/t/[token]`.
- **Staff:** логин с rate limiting и временной блокировкой, отзываемые
  database-backed сессии, серверная проверка разрешений, обзор меню в
  админке (только чтение).
- **Инфраструктура:** fail-fast валидация окружения, singleton Prisma с
  явным лимитом пула, `MediaStorageAdapter` за интерфейсом, structured
  logging с маскированием секретов, `/api/health` и `/api/ready`.

## Ключевые правила проекта

- **Деньги** — только целые центы (`src/lib/money.ts`), никакого float.
  Решение зафиксировано на весь проект, смена стратегии требует миграции.
- **Переводы** — отдельные `*Translation`-таблицы, отсутствующий перевод
  безопасно откатывается на `de`.
- **Права** — проверяются на сервере в каждом action; скрытие кнопки в UI
  защитой не считается.
- **Client Components** не импортируют Prisma, `env`, server-модули —
  это проверяется правилом ESLint.
- **Медиа** не хранится в `public/` процесса: на Hostinger локальный диск
  не персистентен между деплоями.

## Не сделано и требует решения владельца

1. **Провайдер object storage/CDN не выбран** — загрузка медиа из админки
   отключена (адаптер бросает явную ошибку), меню использует внешние URL.
   `MEDIA_STORAGE_PROVIDER=local` запрещён в production проверкой в
   `src/lib/env.ts`.
2. Stripe не подключён — Этап 4, переменные окружения могут быть пустыми.
3. Поведение SSE на реальном Hostinger не измерено — решение по realtime
   принимается по замеру, не заранее (`docs/hostinger-deployment.md` §5).
4. Остальные открытые вопросы Этапа 0 — в `docs/implementation-plan.md`.

## Документация

`AGENTS.md` — рабочая память проекта. `docs/` — архитектура, модель данных,
state machines, RBAC, платежи, локализация, безопасность, деплой, пороги
масштабирования. При расхождении docs и кода приоритет у кода, но
расхождение нужно устранить.
