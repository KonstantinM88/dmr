/**
 * На старте — одно заведение (docs/implementation-plan.md, вопрос 6).
 * Сущность Venue существует с первого дня, поэтому slug вынесен в константу,
 * а не «зашит» в запросы: добавление второго заведения не потребует
 * переписывать доменный слой.
 */
export const DEFAULT_VENUE_SLUG = 'restaurant';

/** Подписанный пропуск последнего QR-входа; неподписанный bearer QR cookie не принимается. */
export const TABLE_ACCESS_COOKIE = 'dmr_table_access';
