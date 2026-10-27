import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEnvConfig,
  formatEnvFile,
  calculateNetAmount,
  computePaymentStats,
  generateBashInstaller,
  generateSystemdService,
  EnvConfig,
  SimulatedPayment,
} from './simulatorLogic';
import { BOT_FILES } from './botFiles';

test('validateEnvConfig passes valid polling configuration', () => {
  const validConfig: EnvConfig = {
    BOT_TOKEN: '123456789:ABCDEF1234567890abcdef',
    ADMIN_ID: '987654321',
    EXENTA_API_KEY: 'pk_live_abc12345',
    EXENTA_API_SECRET: 'sk_live_secret98765',
    EXENTA_BASE_URL: 'https://exenta.pro/api/v1',
    USE_WEBHOOK: false,
    EXENTA_WEBHOOK_SECRET: '',
    WEBHOOK_PORT: '8080',
    DB_PATH: 'database.db',
  };

  const result = validateEnvConfig(validConfig);
  assert.equal(result.valid, true);
  assert.equal(Object.keys(result.errors).length, 0);
});

test('validateEnvConfig catches missing webhook secret when USE_WEBHOOK=true', () => {
  const invalidWebhookConfig: EnvConfig = {
    BOT_TOKEN: '123456789:ABCDEF1234567890abcdef',
    ADMIN_ID: '987654321',
    EXENTA_API_KEY: 'pk_live_abc12345',
    EXENTA_API_SECRET: 'sk_live_secret98765',
    EXENTA_BASE_URL: 'https://exenta.pro/api/v1',
    USE_WEBHOOK: true,
    EXENTA_WEBHOOK_SECRET: '',
    WEBHOOK_PORT: '8080',
    DB_PATH: 'database.db',
  };

  const result = validateEnvConfig(invalidWebhookConfig);
  assert.equal(result.valid, false);
  assert.ok(result.errors.EXENTA_WEBHOOK_SECRET);
});

test('calculateNetAmount and computePaymentStats compute exact RUB totals', () => {
  const net10 = calculateNetAmount(10, 1.0);
  assert.equal(net10, 9.9);

  const payments: SimulatedPayment[] = [
    {
      orderId: 'ord_1',
      paymentId: 'pay_1',
      amount: 10,
      netAmount: 9.88,
      status: 'SUCCESS',
      notified: true,
      createdAt: '12:00:00',
      qrPayload: 'https://qr.nspk.ru/1',
    },
    {
      orderId: 'ord_2',
      paymentId: 'pay_2',
      amount: 250,
      netAmount: 247.0,
      status: 'PENDING',
      notified: false,
      createdAt: '12:01:00',
      qrPayload: 'https://qr.nspk.ru/2',
    },
  ];

  const stats = computePaymentStats(payments);
  assert.equal(stats.totalCount, 2);
  assert.equal(stats.successCount, 1);
  assert.equal(stats.pendingCount, 1);
  assert.equal(stats.grossAmount, 10);
  assert.equal(stats.netAmount, 9.88);
});

test('BOT_FILES contains all 17 project files with canonical database and tracker methods', () => {
  assert.equal(BOT_FILES.length, 17);
  const paymentPy = BOT_FILES.find((f) => f.path === 'handlers/payment.py');
  assert.ok(paymentPy);
  assert.ok(paymentPy.content.includes('# CRITICAL: это единственный notifier'));
  assert.ok(paymentPy.content.includes('amount_kop'));

  const dbPy = BOT_FILES.find((f) => f.path === 'database.py');
  assert.ok(dbPy);
  assert.ok(dbPy.content.includes('amount_kop INTEGER NOT NULL'));
  assert.ok(dbPy.content.includes('tg_id INTEGER NOT NULL'));
  assert.ok(dbPy.content.includes('updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'));
  assert.ok(dbPy.content.includes('-> tuple[bool, bool]:'));
  assert.ok(dbPy.content.includes('return True, True'));
  assert.ok(dbPy.content.includes('return False, exists'));

  const trackerPy = BOT_FILES.find((f) => f.path === 'services/tracker.py');
  assert.ok(trackerPy);
  assert.ok(trackerPy.content.includes('updated, exists = await mark_status_if_pending_or_missing('));
  assert.ok(trackerPy.content.includes('if updated or not exists:'));

  const mainPy = BOT_FILES.find((f) => f.path === 'main.py');
  assert.ok(mainPy);
  assert.ok(mainPy.content.includes('async def resume_pending_payments(bot: Bot)'));
  assert.ok(mainPy.content.includes('tg_id=p["tg_id"]'));
});

test('generateBashInstaller and generateSystemdService produce valid scripts', () => {
  const cfg: EnvConfig = {
    BOT_TOKEN: '123456:ABC-DEF1234ghIkl',
    ADMIN_ID: '123456789',
    EXENTA_API_KEY: 'pk_test_12345',
    EXENTA_API_SECRET: 'sk_test_12345',
    EXENTA_BASE_URL: 'https://exenta.pro/api/v1/',
    USE_WEBHOOK: false,
    EXENTA_WEBHOOK_SECRET: '',
    WEBHOOK_PORT: '8080',
    DB_PATH: 'database.db',
  };

  const envText = formatEnvFile(cfg);
  assert.ok(envText.includes('EXENTA_BASE_URL=https://exenta.pro/api/v1\n'));

  const bash = generateBashInstaller(BOT_FILES, cfg);
  assert.ok(bash.includes('mkdir -p exenta_bot/handlers exenta_bot/services'));

  const unit = generateSystemdService('deploy', '/opt/exenta_bot/');
  assert.ok(unit.includes('User=deploy'));
  assert.ok(unit.includes('ExecStart=/opt/exenta_bot/venv/bin/python main.py'));
});
