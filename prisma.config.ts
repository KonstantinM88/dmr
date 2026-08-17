import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Prisma CLI commands (migrate/studio) use the direct Neon connection.
  // `generate` does not connect to the database, so the URL may be absent
  // during the install step before `.env` is created.
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? '',
  },
});
