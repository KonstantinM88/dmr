import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Playwright использует loopback-адрес, тогда как ручная разработка идёт
  // через localhost. Разрешаем только этот дополнительный локальный origin.
  allowedDevOrigins: ['127.0.0.1'],
  // Prisma + pg должны остаться внешними для серверного бандла.
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
