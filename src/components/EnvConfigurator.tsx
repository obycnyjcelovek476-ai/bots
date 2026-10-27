import React, { useState } from 'react';
import { Copy, Check, ShieldAlert, CheckCircle2, Download } from 'lucide-react';
import {
  EnvConfig,
  validateEnvConfig,
  formatEnvFile,
  generateBashInstaller,
} from '../utils/simulatorLogic';
import { BotFileEntry } from '../utils/botFiles';

interface EnvConfiguratorProps {
  config: EnvConfig;
  files: BotFileEntry[];
  onChange: (next: EnvConfig) => void;
}

export const EnvConfigurator: React.FC<EnvConfiguratorProps> = ({
  config,
  files,
  onChange,
}) => {
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedBash, setCopiedBash] = useState(false);

  const validation = validateEnvConfig(config);
  const envPreview = formatEnvFile(config);
  const bashScript = generateBashInstaller(files, config);

  const updateField = <K extends keyof EnvConfig>(key: K, value: EnvConfig[K]) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  const handleCopyEnv = () => {
    navigator.clipboard?.writeText(envPreview).catch(() => {});
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 1800);
  };

  const handleCopyBash = () => {
    navigator.clipboard?.writeText(bashScript).catch(() => {});
    setCopiedBash(true);
    setTimeout(() => setCopiedBash(false), 1800);
  };

  const handleDownloadEnv = () => {
    const blob = new Blob([envPreview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.env';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Form */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="space-y-1 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Шаг 6 из инструкции</span>
            <span aria-hidden="true">·</span>
            <span>Хранение строго в RAM вкладки (без localStorage и сети)</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Настройка .env и валидация ключей
          </h2>
          <p className="text-xs text-slate-600">
            Введённые ключи обрабатываются исключительно локально в оперативной памяти браузера и никуда не передаются. После скачивания <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">.env</code> сразу переместите его в <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">exenta_bot/.env</code> и удалите копию из <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">~/Downloads</code>.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="env-bot-token" className="block text-xs font-medium text-slate-700 mb-1">
              BOT_TOKEN (от @BotFather)
            </label>
            <input
              id="env-bot-token"
              type="text"
              value={config.BOT_TOKEN}
              onChange={(e) => updateField('BOT_TOKEN', e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              placeholder="123456:ABC..."
            />
            {validation.errors.BOT_TOKEN && (
              <p className="text-xs text-red-600 mt-1">{validation.errors.BOT_TOKEN}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="env-admin-id" className="block text-xs font-medium text-slate-700 mb-1">
                ADMIN_ID (ваш Telegram ID)
              </label>
              <input
                id="env-admin-id"
                type="text"
                value={config.ADMIN_ID}
                onChange={(e) => updateField('ADMIN_ID', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                placeholder="123456789"
              />
              {validation.errors.ADMIN_ID && (
                <p className="text-xs text-red-600 mt-1">{validation.errors.ADMIN_ID}</p>
              )}
            </div>

            <div>
              <label htmlFor="env-db-path" className="block text-xs font-medium text-slate-700 mb-1">
                DB_PATH (SQLite база)
              </label>
              <input
                id="env-db-path"
                type="text"
                value={config.DB_PATH}
                onChange={(e) => updateField('DB_PATH', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                placeholder="database.db"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="env-api-key" className="block text-xs font-medium text-slate-700 mb-1">
                EXENTA_API_KEY (pk_...)
              </label>
              <input
                id="env-api-key"
                type="text"
                value={config.EXENTA_API_KEY}
                onChange={(e) => updateField('EXENTA_API_KEY', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                placeholder="pk_..."
              />
              {validation.errors.EXENTA_API_KEY && (
                <p className="text-xs text-red-600 mt-1">{validation.errors.EXENTA_API_KEY}</p>
              )}
            </div>

            <div>
              <label htmlFor="env-api-secret" className="block text-xs font-medium text-slate-700 mb-1">
                EXENTA_API_SECRET (sk_...)
              </label>
              <input
                id="env-api-secret"
                type="text"
                value={config.EXENTA_API_SECRET}
                onChange={(e) => updateField('EXENTA_API_SECRET', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                placeholder="sk_..."
              />
              {validation.errors.EXENTA_API_SECRET && (
                <p className="text-xs text-red-600 mt-1">{validation.errors.EXENTA_API_SECRET}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="env-base-url" className="block text-xs font-medium text-slate-700 mb-1">
              EXENTA_BASE_URL
            </label>
            <input
              id="env-base-url"
              type="text"
              value={config.EXENTA_BASE_URL}
              onChange={(e) => updateField('EXENTA_BASE_URL', e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
            {validation.errors.EXENTA_BASE_URL && (
              <p className="text-xs text-red-600 mt-1">{validation.errors.EXENTA_BASE_URL}</p>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-xs font-semibold text-slate-900">
                  Включить Webhook-сервер (USE_WEBHOOK)
                </span>
                <span className="text-xs text-slate-500">
                  При первом запуске оставьте выключенным для проверки polling-режима
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.USE_WEBHOOK}
                onClick={() => updateField('USE_WEBHOOK', !config.USE_WEBHOOK)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  config.USE_WEBHOOK
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {config.USE_WEBHOOK ? 'USE_WEBHOOK=true' : 'USE_WEBHOOK=false'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="env-webhook-secret" className="block text-xs font-medium text-slate-700 mb-1">
                  EXENTA_WEBHOOK_SECRET
                </label>
                <input
                  id="env-webhook-secret"
                  type="text"
                  value={config.EXENTA_WEBHOOK_SECRET}
                  onChange={(e) => updateField('EXENTA_WEBHOOK_SECRET', e.target.value)}
                  placeholder={config.USE_WEBHOOK ? 'whsec_...' : 'Не требуется при polling'}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
                {validation.errors.EXENTA_WEBHOOK_SECRET && (
                  <p className="text-xs text-red-600 mt-1">
                    {validation.errors.EXENTA_WEBHOOK_SECRET}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="env-webhook-port" className="block text-xs font-medium text-slate-700 mb-1">
                  WEBHOOK_PORT
                </label>
                <input
                  id="env-webhook-port"
                  type="text"
                  value={config.WEBHOOK_PORT}
                  onChange={(e) => updateField('WEBHOOK_PORT', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
                {validation.errors.WEBHOOK_PORT && (
                  <p className="text-xs text-red-600 mt-1">{validation.errors.WEBHOOK_PORT}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status box */}
        <div
          className={`p-4 rounded-xl border text-xs space-y-1.5 ${
            validation.valid
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-red-50/70 border-red-200 text-red-950'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {validation.valid ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Конфигурация валидна — пройдёт проверку pydantic-settings в config.py</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>Исправьте ошибки заполнения перед запуском</span>
              </>
            )}
          </div>
          {validation.warnings.map((w, idx) => (
            <p key={idx} className="text-slate-600 pl-6">
              {w}
            </p>
          ))}
        </div>
      </div>

      {/* Right: Generated .env and one-command bash installer */}
      <div className="lg:col-span-6 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/60">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Готовый файл .env</h3>
              <p className="text-xs text-slate-500">
                Защищён от попадания в Git через .gitignore
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyEnv}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedEnv ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Копировать .env</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadEnv}
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать .env</span>
              </button>
            </div>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed">
            {envPreview}
          </pre>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/60">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Однокомандный скрипт полной раскладки (Bash)
              </h3>
              <p className="text-xs text-slate-500">
                Создаёт папки, раскладывает все 17 файлов и записывает ваш .env
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyBash}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedBash ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Скрипт скопирован</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Скопировать весь Bash-скрипт</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-xs max-h-64 overflow-y-auto leading-relaxed">
            {bashScript}
          </pre>
        </div>
      </div>
    </div>
  );
};
