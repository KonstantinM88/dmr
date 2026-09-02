import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedRussianTranslations } from './seed-russian-translations.js';

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DIRECT_DATABASE_URL или DATABASE_URL обязателен.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const venue = await prisma.venue.findUnique({
    where: { slug: 'restaurant' },
    select: { id: true },
  });
  if (!venue) throw new Error('Заведение restaurant не найдено. Сначала выполните основной сид.');

  await seedRussianTranslations(prisma, venue.id);
  console.log('Русские переводы демо-меню добавлены.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
