import { BotFileEntry } from './botFiles';

export interface EnvConfig {
  BOT_TOKEN: string;
  ADMIN_ID: string;
  EXENTA_API_KEY: string;
  EXENTA_API_SECRET: string;
  EXENTA_BASE_URL: string;
  USE_WEBHOOK: boolean;
  EXENTA_WEBHOOK_SECRET: string;
  WEBHOOK_PORT: string;
  DB_PATH: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

export interface SimulatedPayment {
  orderId: string;
  paymentId: string;
  amount: number;
  netAmount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  notified: boolean;
  createdAt: string;
  qrPayload: string;
}

export function validateEnvConfig(config: EnvConfig): EnvValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  if (!config.BOT_TOKEN || config.BOT_TOKEN.trim().length < 10 || !config.BOT_TOKEN.includes(':')) {
    errors.BOT_TOKEN = 'Укажите корректный токен от @BotFather (формат 123456:ABC...)';
  }

  if (!config.ADMIN_ID || !/^\d+$/.test(config.ADMIN_ID.trim())) {
    errors.ADMIN_ID = 'ADMIN_ID должен состоять только из цифр (ваш Telegram ID)';
  }

  if (!config.EXENTA_API_KEY || !config.EXENTA_API_KEY.trim().startsWith('pk_')) {
    errors.EXENTA_API_KEY = 'Публичный ключ должен начинаться с префикса pk_';
  }

  if (!config.EXENTA_API_SECRET || !config.EXENTA_API_SECRET.trim().startsWith('sk_')) {
    errors.EXENTA_API_SECRET = 'Секретный ключ должен начинаться с префикса sk_';
  }

  if (!config.EXENTA_BASE_URL || !config.EXENTA_BASE_URL.startsWith('https://')) {
    errors.EXENTA_BASE_URL = 'Базовый URL должен начинаться с https://';
  }

  const portNum = Number(config.WEBHOOK_PORT);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    errors.WEBHOOK_PORT = 'Порт должен быть целым числом от 1 до 65535';
  }

  if (config.USE_WEBHOOK && (!config.EXENTA_WEBHOOK_SECRET || config.EXENTA_WEBHOOK_SECRET.trim().length < 6)) {
    errors.EXENTA_WEBHOOK_SECRET = 'При USE_WEBHOOK=true обязательно укажите EXENTA_WEBHOOK_SECRET';
  }

  if (config.EXENTA_API_KEY === 'pk_live_replace_me' || config.EXENTA_API_SECRET === 'sk_live_replace_me') {
    warnings.push('Используются демо-ключи из шаблона. Для боевых платежей подставьте ключи из ЛК Exenta.');
  }

  if (!config.USE_WEBHOOK) {
    warnings.push('Режим Polling активен (USE_WEBHOOK=false) — оптимально для первого запуска.');
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

export function formatEnvFile(config: EnvConfig): string {
  const cleanUrl = config.EXENTA_BASE_URL.replace(/\/+$/, '');
  return [
    `BOT_TOKEN=${config.BOT_TOKEN.trim()}`,
    `ADMIN_ID=${config.ADMIN_ID.trim()}`,
    `EXENTA_API_KEY=${config.EXENTA_API_KEY.trim()}`,
    `EXENTA_API_SECRET=${config.EXENTA_API_SECRET.trim()}`,
    `EXENTA_BASE_URL=${cleanUrl}`,
    '',
    '# Пока оставь выключенным — сначала проверь polling',
    `USE_WEBHOOK=${config.USE_WEBHOOK ? 'true' : 'false'}`,
    '',
    '# Заполнишь только если решишь включить webhook',
    `EXENTA_WEBHOOK_SECRET=${config.EXENTA_WEBHOOK_SECRET.trim()}`,
    `WEBHOOK_PORT=${config.WEBHOOK_PORT.trim()}`,
    `DB_PATH=${config.DB_PATH.trim() || 'database.db'}`,
    '',
  ].join('\n');
}

export function calculateNetAmount(grossAmount: number, feePercent = 1.2): number {
  const factor = Math.max(0, 100 - feePercent) / 100;
  return Math.round(grossAmount * factor * 100) / 100;
}

export function computePaymentStats(payments: SimulatedPayment[]) {
  const totalCount = payments.length;
  const successPayments = payments.filter((p) => p.status === 'SUCCESS');
  const pendingCount = payments.filter((p) => p.status === 'PENDING').length;
  const failedCount = payments.filter((p) => p.status === 'FAILED' || p.status === 'EXPIRED').length;
  const grossAmount = Math.round(successPayments.reduce((acc, p) => acc + p.amount, 0) * 100) / 100;
  const netAmount = Math.round(successPayments.reduce((acc, p) => acc + p.netAmount, 0) * 100) / 100;

  return {
    totalCount,
    successCount: successPayments.length,
    pendingCount,
    failedCount,
    grossAmount,
    netAmount,
  };
}

export function generateBashInstaller(files: BotFileEntry[], envConfig: EnvConfig): string {
  const lines: string[] = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'echo "==> Создание структуры проекта exenta_bot..."',
    'mkdir -p exenta_bot/handlers exenta_bot/services',
    'cd exenta_bot',
    '',
  ];

  for (const file of files) {
    lines.push(`cat > "${file.path}" <<'EOF_EXENTA_FILE'`);
    lines.push(file.content.replace(/\n$/, ''));
    lines.push('EOF_EXENTA_FILE');
    lines.push('');
  }

  lines.push(`cat > ".env" <<'EOF_EXENTA_ENV'`);
  lines.push(formatEnvFile(envConfig).replace(/\n$/, ''));
  lines.push('EOF_EXENTA_ENV');
  lines.push('');
  lines.push('echo "==> Готово! Все файлы разложены по папкам в ./exenta_bot"');
  lines.push('echo "Для запуска выполните: cd exenta_bot && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python main.py"');

  return lines.join('\n');
}

export function generateSystemdService(user: string, workDir: string): string {
  const cleanUser = user.trim() || 'botuser';
  const cleanDir = workDir.trim().replace(/\/+$/, '') || `/home/${cleanUser}/exenta_bot`;
  return `[Unit]
Description=Exenta Pay Telegram Bot
After=network.target

[Service]
Type=simple
User=${cleanUser}
WorkingDirectory=${cleanDir}
Environment="PATH=${cleanDir}/venv/bin"
ExecStart=${cleanDir}/venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target`;
}
