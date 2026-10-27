/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { BOT_FILES, BotFileEntry } from './utils/botFiles';
import {
  EnvConfig,
  SimulatedPayment,
  generateBashInstaller,
} from './utils/simulatorLogic';
import { FileExplorer } from './components/FileExplorer';
import { EnvConfigurator } from './components/EnvConfigurator';
import { BotSimulator } from './components/BotSimulator';
import { DeployChecklist } from './components/DeployChecklist';

type ActiveTab = 'files' | 'env' | 'simulator' | 'checklist';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('files');
  const [files, setFiles] = useState<BotFileEntry[]>(BOT_FILES);
  const [envConfig, setEnvConfig] = useState<EnvConfig>({
    BOT_TOKEN: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    ADMIN_ID: '123456789',
    EXENTA_API_KEY: 'pk_live_replace_me',
    EXENTA_API_SECRET: 'sk_live_replace_me',
    EXENTA_BASE_URL: 'https://exenta.pro/api/v1',
    USE_WEBHOOK: false,
    EXENTA_WEBHOOK_SECRET: '',
    WEBHOOK_PORT: '8080',
    DB_PATH: 'database.db',
  });

  const [payments, setPayments] = useState<SimulatedPayment[]>([
    {
      orderId: 'ord_a91f4c82e011',
      paymentId: 'pay_a91f4c82e011',
      amount: 10,
      netAmount: 9.88,
      status: 'SUCCESS',
      notified: true,
      createdAt: '09:58:14',
      qrPayload: 'https://qr.nspk.ru/AS1A000A91F4C82E011?type=02&bank=100000000111&sum=1000&cur=RUB',
    },
  ]);

  const handleUpdateFile = (path: string, newContent: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, content: newContent } : f))
    );
  };

  const handleAddPayment = (payment: SimulatedPayment) => {
    setPayments((prev) => [payment, ...prev]);
  };

  const handleUpdatePaymentStatus = (
    orderId: string,
    status: 'SUCCESS' | 'FAILED' | 'EXPIRED'
  ) => {
    setPayments((prev) =>
      prev.map((p) =>
        p.orderId === orderId ? { ...p, status, notified: true } : p
      )
    );
  };

  const handleDownloadBundleScript = () => {
    const script = generateBashInstaller(files, envConfig);
    const blob = new Blob([script], { type: 'text/x-shellscript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assemble_exenta_bot.sh';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-20">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('files');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Exenta Bot Studio
        </a>

        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'files'
                ? 'text-blue-600 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Файлы проекта (17)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('env')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'env'
                ? 'text-blue-600 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Конфигуратор .env
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'simulator'
                ? 'text-blue-600 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Песочница СБП
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checklist')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'checklist'
                ? 'text-blue-600 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-900'
            }`}
          >
            Чеклист и Systemd
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadBundleScript}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Скачать сборку (.sh)
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-8">
        {activeTab === 'files' && (
          <FileExplorer
            files={files}
            envConfig={envConfig}
            onUpdateFile={handleUpdateFile}
          />
        )}
        {activeTab === 'env' && (
          <EnvConfigurator
            config={envConfig}
            files={files}
            onChange={setEnvConfig}
          />
        )}
        {activeTab === 'simulator' && (
          <BotSimulator
            envConfig={envConfig}
            payments={payments}
            onAddPayment={handleAddPayment}
            onUpdatePaymentStatus={handleUpdatePaymentStatus}
            onResetPayments={() => setPayments([])}
          />
        )}
        {activeTab === 'checklist' && <DeployChecklist payments={payments} />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Проект разложен в рабочей директории <code className="font-mono text-slate-800">/exenta_bot</code> · Python 3.11+ · aiogram 3.x · SQLite WAL
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Проверить /pay → 10 ₽
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab('checklist')}
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Systemd юнит
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

