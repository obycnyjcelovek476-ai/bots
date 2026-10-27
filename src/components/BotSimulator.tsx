import React, { useState, useRef, useEffect } from 'react';
import { Send, QrCode, RefreshCw, CheckCircle2, Play, RotateCcw } from 'lucide-react';
import {
  EnvConfig,
  SimulatedPayment,
  calculateNetAmount,
  computePaymentStats,
} from '../utils/simulatorLogic';

interface BotSimulatorProps {
  envConfig: EnvConfig;
  payments: SimulatedPayment[];
  onAddPayment: (payment: SimulatedPayment) => void;
  onUpdatePaymentStatus: (
    orderId: string,
    status: 'SUCCESS' | 'FAILED' | 'EXPIRED'
  ) => void;
  onResetPayments: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  orderId?: string;
  amount?: number;
  qrPayload?: string;
  status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  timestamp: string;
}

export const BotSimulator: React.FC<BotSimulatorProps> = ({
  envConfig,
  payments,
  onAddPayment,
  onUpdatePaymentStatus,
  onResetPayments,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'bot',
      text: '👋 Добро пожаловать в Exenta Pay Bot!\n\nДоступные команды:\n• /pay — создать тестовый СБП-платёж и получить QR-код\n• /stats — статистика платежей (для администратора)',
      timestamp: '10:00:01',
    },
  ]);
  const [waitingForAmount, setWaitingForAmount] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('10');
  const [botLogs, setBotLogs] = useState<string[]>([
    '2026-10-27 10:00:00 | INFO     | exenta_bot | Database initialized',
    envConfig.USE_WEBHOOK
      ? '2026-10-27 10:00:00 | INFO     | exenta_bot | Webhook Server started successfully in a separate process'
      : '2026-10-27 10:00:00 | INFO     | exenta_bot | Bot started (Telegram polling mode, webhook=off)',
  ]);
  const [webhookLogs, setWebhookLogs] = useState<string[]>([
    '2026-10-27 10:00:00 | INFO     | exenta_webhook | Listening on POST /webhooks/exenta',
  ]);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const nowTime = () => {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
  };

  const appendBotLog = (line: string) => {
    setBotLogs((prev) => [...prev, `2026-10-27 ${nowTime()} | INFO     | exenta_bot | ${line}`]);
  };

  const appendWebhookLog = (line: string) => {
    setWebhookLogs((prev) => [
      ...prev,
      `2026-10-27 ${nowTime()} | INFO     | exenta_webhook | ${line}`,
    ]);
  };

  const handleCommandStart = () => {
    const t = nowTime();
    setWaitingForAmount(false);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'user', text: '/start', timestamp: t },
      {
        id: `b-${Date.now() + 1}`,
        sender: 'bot',
        text: '👋 Добро пожаловать в Exenta Pay Bot!\n\nДоступные команды:\n• /pay — создать тестовый СБП-платёж и получить QR-код\n• /stats — статистика платежей (для администратора)',
        timestamp: t,
      },
    ]);
  };

  const handleCommandPay = () => {
    const t = nowTime();
    setWaitingForAmount(true);
    setInputValue('10');
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'user', text: '/pay', timestamp: t },
      {
        id: `b-${Date.now() + 1}`,
        sender: 'bot',
        text: '💳 Введите сумму для оплаты в рублях (например, 10):',
        timestamp: t,
      },
    ]);
  };

  const handleCommandStats = () => {
    const t = nowTime();
    const stats = computePaymentStats(payments);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'user', text: '/stats', timestamp: t },
      {
        id: `b-${Date.now() + 1}`,
        sender: 'bot',
        text:
          `📊 Статистика платежей Exenta\n\n` +
          `• Всего создано: ${stats.totalCount}\n` +
          `• Успешных (SUCCESS): ${stats.successCount}\n` +
          `• В ожидании (PENDING): ${stats.pendingCount}\n` +
          `• Отменено/Истекло: ${stats.failedCount}\n\n` +
          `💰 Сумма успешных оплат: ${stats.grossAmount.toFixed(2)} ₽`,
        timestamp: t,
      },
    ]);
  };

  const createOrderWithAmount = (raw: string) => {
    const t = nowTime();
    const normalized = raw.replace(',', '.').trim();
    const parsed = Number(normalized);

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'user', text: raw, timestamp: t },
    ]);

    if (Number.isNaN(parsed)) {
      setMessages((prev) => [
        ...prev,
        {
          id: `b-err-${Date.now()}`,
          sender: 'bot',
          text: '⚠️ Введите корректное число (например: 10).',
          timestamp: t,
        },
      ]);
      return;
    }

    if (parsed < 10 || parsed > 500000) {
      setMessages((prev) => [
        ...prev,
        {
          id: `b-err-${Date.now()}`,
          sender: 'bot',
          text: '⚠️ Сумма должна быть от 10 до 500 000 ₽.',
          timestamp: t,
        },
      ]);
      return;
    }

    const amount = Math.round(parsed * 100) / 100;
    const suffix = Math.random().toString(16).slice(2, 10);
    const orderId = `ord_${suffix}`;
    const paymentId = `pay_${suffix}`;
    const qrPayload = `https://qr.nspk.ru/AS1A000${suffix.toUpperCase()}?type=02&bank=100000000111&sum=${Math.round(
      amount * 100
    )}&cur=RUB`;

    const newPayment: SimulatedPayment = {
      orderId,
      paymentId,
      amount,
      netAmount: calculateNetAmount(amount, 1.2),
      status: 'PENDING',
      notified: false,
      createdAt: t,
      qrPayload,
    };

    onAddPayment(newPayment);
    setWaitingForAmount(false);
    setInputValue('');

    setMessages((prev) => [
      ...prev,
      {
        id: `b-qr-${orderId}`,
        sender: 'bot',
        text: `🧾 Счёт на оплату: ${amount.toFixed(2)} ₽\nUUID: ${orderId}\n\nОтсканируйте QR-код камерой или приложением банка, либо нажмите кнопку ниже.\n\n⏳ Ожидаем подтверждение оплаты...`,
        orderId,
        amount,
        qrPayload,
        status: 'PENDING',
        timestamp: t,
      },
    ]);

    appendBotLog(
      `Created SBP payment ${orderId} (${amount.toFixed(2)} RUB) — spawn(_delayed_tracker)`
    );
  };

  const handleSendInput = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (trimmed === '/start') {
      handleCommandStart();
      setInputValue('');
      return;
    }
    if (trimmed === '/pay') {
      handleCommandPay();
      return;
    }
    if (trimmed === '/stats') {
      handleCommandStats();
      setInputValue('');
      return;
    }

    if (waitingForAmount || /^\d+([.,]\d+)?$/.test(trimmed)) {
      createOrderWithAmount(trimmed);
      return;
    }

    const t = nowTime();
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: 'user', text: trimmed, timestamp: t },
      {
        id: `b-${Date.now() + 1}`,
        sender: 'bot',
        text: 'Используйте команду /pay для создания СБП-платежа или /stats для просмотра статистики.',
        timestamp: t,
      },
    ]);
    setInputValue('');
  };

  const confirmPayment = (orderId: string, via: 'polling' | 'webhook') => {
    const target = payments.find((p) => p.orderId === orderId);
    onUpdatePaymentStatus(orderId, 'SUCCESS');
    setMessages((prev) =>
      prev.map((m) => {
        if (m.orderId === orderId) {
          return {
            ...m,
            status: 'SUCCESS',
            text: `🧾 Счёт на оплату: ${(m.amount || 10).toFixed(2)} ₽\nUUID: ${orderId}\n\n✅ Оплата успешно завершена! Спасибо.`,
          };
        }
        return m;
      })
    );

    if (via === 'webhook') {
      appendWebhookLog(
        `Webhook processed SUCCESS for ${orderId} (netAmount=${(target?.netAmount || 9.88).toFixed(2)})`
      );
      appendBotLog(
        `mark_status_if_pending_or_missing(${orderId}, 'SUCCESS') -> True`
      );
    } else {
      appendBotLog(`Payment ${orderId} confirmed via polling (SUCCESS)`);
    }
  };

  const handleTestWebhookButton = () => {
    appendWebhookLog('Webhook test received');
  };

  const handleSimulateRestart = () => {
    const pendingCount = payments.filter((p) => p.status === 'PENDING').length;
    appendBotLog('Bot stopped by user.');
    appendBotLog('Database initialized');
    appendBotLog(
      envConfig.USE_WEBHOOK
        ? 'Webhook Server started successfully in a separate process'
        : 'Bot started (Telegram polling mode, webhook=off)'
    );
    if (pendingCount > 0) {
      appendBotLog(`Resuming tracking for ${pendingCount} pending payments`);
    }
  };

  const stats = computePaymentStats(payments);

  return (
    <div className="space-y-6">
      {/* Top KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Всего платежей в SQLite (Mock)</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {stats.totalCount}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            PENDING: {stats.pendingCount} · SUCCESS: {stats.successCount}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">Сумма оплат в /stats (amount)</span>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {stats.grossAmount.toFixed(2)} ₽
          </div>
          <div className="text-xs text-slate-500 mt-1">Хранится в таблице payments (SQLite)</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs text-slate-500">В ЛК Exenta / Webhook (netAmount)</span>
          <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
            {stats.netAmount.toFixed(2)} ₽
          </div>
          <div className="text-xs text-slate-500 mt-1">Приходит в data.netAmount вебхука</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs text-slate-500">Изолированный Mock-режим (без API)</span>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={handleSimulateRestart}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Рестарт бота</span>
            </button>
            <button
              type="button"
              onClick={handleTestWebhookButton}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Test webhook
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-column simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Telegram Bot Chat */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Mock-песочница Telegram-бота (не создаёт реальных счетов в Exenta)
              </h2>
              <p className="text-xs text-slate-500">
                Полная локальная эмуляция: /pay → 10 → mark_status_if_pending_or_missing → /stats
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCommandStart}
                className="px-2.5 py-1 text-xs font-mono font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                /start
              </button>
              <button
                type="button"
                onClick={handleCommandPay}
                className="px-2.5 py-1 text-xs font-mono font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                /pay
              </button>
              <button
                type="button"
                onClick={handleCommandStats}
                className="px-2.5 py-1 text-xs font-mono font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                /stats
              </button>
            </div>
          </div>

          <div
            ref={chatContainerRef}
            className="p-4 space-y-3 h-[420px] overflow-y-auto bg-slate-50/40"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-900'
                  }`}
                >
                  {msg.orderId && (
                    <div className="mb-3 pb-3 border-b border-slate-100 flex items-center gap-3">
                      <div className="w-14 h-14 bg-slate-50 rounded flex items-center justify-center shrink-0">
                        <QrCode className="w-11 h-11 text-slate-900" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="text-[11px] font-semibold text-slate-900">
                          СБП QR · НСПК
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          {msg.qrPayload}
                        </div>
                        {msg.status === 'PENDING' ? (
                          <button
                            type="button"
                            onClick={() => confirmPayment(msg.orderId!, 'polling')}
                            className="mt-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            <span>Оплатить {msg.amount?.toFixed(2)} ₽ с телефона</span>
                          </button>
                        ) : (
                          <div className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Статус в БД: {msg.status}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="whitespace-pre-line">{msg.text}</div>
                  <div
                    className={`text-[10px] font-mono tabular-nums mt-1.5 text-right ${
                      msg.sender === 'user' ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleSendInput}
            className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
          >
            <label htmlFor="telegram-sim-input" className="sr-only">
              Сообщение или сумма платежа
            </label>
            <input
              id="telegram-sim-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                waitingForAmount
                  ? 'Введите сумму в рублях (например: 10)...'
                  : 'Введите сумму (10) или команду (/pay, /stats)...'
              }
              className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Отправить</span>
            </button>
          </form>
        </div>

        {/* Right: Exenta Merchant Table & Logs */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Личный кабинет Exenta · Таблица транзакций SQLite
                </h3>
                <p className="text-xs text-slate-500">
                  Управляйте статусом платежей через Polling (4–8 сек) или мгновенный Webhook
                </p>
              </div>
              {payments.length > 0 && (
                <button
                  type="button"
                  onClick={onResetPayments}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Очистить БД</span>
                </button>
              )}
            </div>

            {payments.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-xs text-slate-600">
                  В таблице <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">payments</code> пока нет записей.
                </p>
                <button
                  type="button"
                  onClick={() => createOrderWithAmount('10')}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Создать тестовый платёж на 10 ₽
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/50">
                      <th className="py-2.5 px-4">Order ID</th>
                      <th className="py-2.5 px-4 text-right">Сумма</th>
                      <th className="py-2.5 px-4 text-right">netAmount</th>
                      <th className="py-2.5 px-4">Статус</th>
                      <th className="py-2.5 px-4 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {payments.map((p) => (
                      <tr key={p.orderId} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4 font-mono">{p.orderId}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {p.amount.toFixed(2)} ₽
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                          {p.netAmount.toFixed(2)} ₽
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          <span
                            className={
                              p.status === 'SUCCESS'
                                ? 'text-emerald-700 font-semibold'
                                : p.status === 'PENDING'
                                ? 'text-amber-700 font-semibold'
                                : 'text-red-700 font-semibold'
                            }
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {p.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => confirmPayment(p.orderId, 'polling')}
                                className="px-2.5 py-1 text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Подтвердить (Polling)
                              </button>
                              <button
                                type="button"
                                onClick={() => confirmPayment(p.orderId, 'webhook')}
                                className="px-2.5 py-1 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 text-white rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Webhook
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">
                              notified=1
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Live Logs */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 px-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <span className="text-xs font-semibold text-slate-900">
                Журнал выполнения (bot.log и webhook.log)
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                RotatingFileHandler · 5 MB
              </span>
            </div>
            <div className="p-4 bg-slate-950 text-slate-200 font-mono text-[11px] space-y-1.5 max-h-52 overflow-y-auto">
              {botLogs.map((l, i) => (
                <div key={`b-${i}`} className="text-slate-300">
                  {l}
                </div>
              ))}
              {webhookLogs.map((l, i) => (
                <div key={`w-${i}`} className="text-blue-300">
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
