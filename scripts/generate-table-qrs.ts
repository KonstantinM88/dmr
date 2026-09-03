import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import QRCode from 'qrcode';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DIRECT_DATABASE_URL или DATABASE_URL обязателен для генерации QR.');
}

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const siteUrlValue = readArgument('site-url') ?? process.env.NEXT_PUBLIC_SITE_URL;
if (!siteUrlValue) throw new Error('Передайте --site-url=https://example.com.');

const siteUrl = new URL(siteUrlValue);
if (!['http:', 'https:'].includes(siteUrl.protocol)) {
  throw new Error('site-url должен использовать http или https.');
}

const labels = (readArgument('tables') ?? '1,2')
  .split(',')
  .map((label) => label.trim())
  .filter(Boolean);

if (labels.length === 0 || labels.length > 50) {
  throw new Error('Передайте от 1 до 50 названий столов через --tables=1,2.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const outputDirectory = resolve(process.cwd(), 'temp', 'qr-print');

try {
  const tables = await prisma.diningTable.findMany({
    where: {
      venue: { slug: 'restaurant' },
      label: { in: labels },
      isActive: true,
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      label: true,
      qrTokens: {
        where: { revokedAt: null },
        orderBy: { issuedAt: 'desc' },
        take: 1,
        select: { token: true },
      },
    },
  });

  await mkdir(outputDirectory, { recursive: true });

  let generatedCount = 0;
  for (const table of tables) {
    const token = table.qrTokens[0]?.token;
    if (!token) continue;

    const safeLabel = table.label.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
    const outputPath = resolve(outputDirectory, `table-${safeLabel || generatedCount + 1}.png`);
    const tableUrl = new URL(`/t/${token}`, siteUrl).toString();

    await QRCode.toFile(outputPath, tableUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 1200,
      color: { dark: '#111111', light: '#ffffff' },
    });

    generatedCount += 1;
    process.stdout.write(`QR для стола ${table.label}: ${outputPath}\n`);
  }

  if (generatedCount !== labels.length) {
    throw new Error(
      `Создано ${generatedCount} из ${labels.length}: проверьте названия, активность столов и QR-токены.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
