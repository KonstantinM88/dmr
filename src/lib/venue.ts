/**
 * На старте — одно заведение (docs/implementation-plan.md, вопрос 6).
 * Сущность Venue существует с первого дня, поэтому slug вынесен в константу,
 * а не «зашит» в запросы: добавление второго заведения не потребует
 * переписывать доменный слой.
 */
export const DEFAULT_VENUE_SLUG = 'restaurant';

/** Cookie с активным QR-токеном стола (устанавливается маршрутом /t/[token]). */
export const TABLE_TOKEN_COOKIE = 'dmr_table_token';
