import next from 'eslint-config-next';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat config (eslint-config-next 16 экспортирует его напрямую, FlatCompat
 * больше не нужен).
 */
const config = [
  ...next,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'src/generated/**', 'playwright-report/**'],
  },
  {
    // Архитектурный guard из docs/architecture.md §2:
    // client-компоненты не импортируют server-only слои напрямую.
    files: ['src/components/**/*.tsx', 'src/domains/**/ui/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/server/**',
                '@/lib/prisma',
                '@/lib/env',
                '@/generated/prisma*',
                'stripe',
                'pg',
                'node:fs',
                'node:child_process',
              ],
              message:
                'Client-компоненты не импортируют server-only модули. Используйте shared-типы, server actions или API routes (docs/architecture.md §2).',
            },
          ],
        },
      ],
    },
  },
];

export default config;
