import React, { useState } from 'react';
import { CheckSquare, Square, Copy, Check, Server } from 'lucide-react';
import { generateSystemdService, SimulatedPayment } from '../utils/simulatorLogic';

interface DeployChecklistProps {
  payments: SimulatedPayment[];
}

interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
}

const INITIAL_ITEMS: ChecklistItem[] = [
  {
    id: 'py311',
    label: 'python3 --version ≥ 3.11',
    detail: 'В коде используется синтаксис int | None (union types), на Python 3.9 упадёт при импорте.',
  },
  {
    id: 'venv_deps',
    label: 'venv активирован, установлены aiogram, aiohttp, aiosqlite, qrcode, Pillow, pydantic-settings',
    detail: 'Команда: python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt',
  },
  {
    id: 'env_gitignore',
    label: '.env заполнен, .gitignore содержит .env, *.db, *.log, venv/',
    detail: 'Исключает случайную публикацию секретного ключа sk_... в публичный Git-репозиторий.',
  },
  {
    id: 'init_files',
    label: 'handlers/__init__.py и services/__init__.py существуют (пустые)',
    detail: 'Гарантируют корректное разрешение пакетных импортов при запуске python main.py.',
  },
  {
    id: 'no_importerror',
    label: 'python main.py запускается без ImportError и пишет Database initialized',
    detail: 'В логе появляется: Bot started (Telegram polling mode, webhook=off).',
  },
  {
    id: 'pay_10',
    label: '/pay → 10 ₽ → уведомление «✅ Оплата успешно завершена! Спасибо.» пришло',
    detail: 'Фоновый трекер редактирует подпись сообщения с QR-кодом и убирает inline-кнопку.',
  },
  {
    id: 'stats_cmd',
    label: '/stats показывает 1 платёж с суммой и netAmount',
    detail: 'Доступно только пользователю с вашим ADMIN_ID.',
  },
  {
    id: 'lk_exenta',
    label: 'В ЛК Exenta виден платёж SUCCESS с рассчитанным netAmount',
    detail: 'Возвраты при необходимости оформляются через ЛК Exenta → Платежи → Возврат.',
  },
];

export const DeployChecklist: React.FC<DeployChecklistProps> = ({ payments }) => {
  const hasSuccessPayment = payments.some((p) => p.status === 'SUCCESS');

  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({
    py311: true,
    venv_deps: true,
    env_gitignore: true,
    init_files: true,
    no_importerror: true,
    pay_10: hasSuccessPayment,
    stats_cmd: hasSuccessPayment,
    lk_exenta: hasSuccessPayment,
  });

  const [sysUser, setSysUser] = useState('botuser');
  const [sysWorkDir, setSysWorkDir] = useState('/home/botuser/exenta_bot');
  const [copiedUnit, setCopiedUnit] = useState(false);

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = INITIAL_ITEMS.filter((item) => checkedIds[item.id]).length;
  const systemdContent = generateSystemdService(sysUser, sysWorkDir);

  const handleCopyUnit = () => {
    navigator.clipboard?.writeText(systemdContent).catch(() => {});
    setCopiedUnit(true);
    setTimeout(() => setCopiedUnit(false), 1800);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Checklist */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Чеклист «Всё собрал правильно»
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Отметьте пункты перед переводом бота в продакшен
            </p>
          </div>
          <div className="text-right font-mono tabular-nums">
            <span className="text-sm font-bold text-blue-600">
              {completedCount} / {INITIAL_ITEMS.length}
            </span>
            <span className="block text-[11px] text-slate-500">выполнено</span>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {INITIAL_ITEMS.map((item) => {
            const isChecked = !!checkedIds[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className="w-full py-3.5 text-left flex items-start gap-3 hover:bg-slate-50/80 px-2 rounded-lg transition-colors cursor-pointer"
              >
                {isChecked ? (
                  <CheckSquare className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div
                    className={`text-xs font-medium ${
                      isChecked ? 'text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    {item.label}
                  </div>
                  <p className="text-xs text-slate-500">{item.detail}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Systemd generator */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Server className="w-4 h-4 text-blue-600" />
            <span>Генератор systemd-юнита для VPS</span>
          </div>
          <p className="text-xs text-slate-600">
            Файл <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">/etc/systemd/system/exenta-bot.service</code> с автоперезапуском и сохранением трекинга <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">PENDING</code> платежей.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label htmlFor="sys-user" className="block text-xs font-medium text-slate-700 mb-1">
                Пользователь Linux (User)
              </label>
              <input
                id="sys-user"
                type="text"
                value={sysUser}
                onChange={(e) => {
                  setSysUser(e.target.value);
                  setSysWorkDir(`/home/${e.target.value || 'botuser'}/exenta_bot`);
                }}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="sys-workdir" className="block text-xs font-medium text-slate-700 mb-1">
                Рабочая папка (WorkingDirectory)
              </label>
              <input
                id="sys-workdir"
                type="text"
                value={sysWorkDir}
                onChange={(e) => setSysWorkDir(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-950 text-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400">
              /etc/systemd/system/exenta-bot.service
            </span>
            <button
              type="button"
              onClick={handleCopyUnit}
              className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedUnit ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Копировать юнит</span>
                </>
              )}
            </button>
          </div>
          <pre className="font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed">
            {systemdContent}
          </pre>
          <div className="pt-3 border-t border-slate-800 font-mono text-[11px] text-slate-400 space-y-1">
            <div>sudo systemctl daemon-reload</div>
            <div>sudo systemctl enable --now exenta-bot</div>
            <div>sudo journalctl -u exenta-bot -f</div>
          </div>
        </div>
      </div>
    </div>
  );
};
