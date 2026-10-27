export interface BotFileEntry {
  path: string;
  folder: 'root' | 'handlers' | 'services';
  sourceNote: string;
  description: string;
  language: 'python' | 'ini' | 'markdown' | 'text';
  content: string;
}

export const BOT_FILES: BotFileEntry[] = [
  {
    path: 'main.py',
    folder: 'root',
    sourceNote: 'Из последнего сообщения (второй блок, resume_pending_payments с tg_id в main.py)',
    description: 'Точка входа: init_db(), resume_pending_payments(bot) через spawn(track_payment(..., tg_id=p["tg_id"])), запуск Telegram polling и опционального процесса webhook-сервера.',
    language: 'python',
    content: `from __future__ import annotations
import asyncio
import multiprocessing
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.memory import MemoryStorage
from config import settings
from database import init_db, get_pending_payments
from exenta_client import exenta_client
from handlers.start import router as start_router
from handlers.payment import router as payment_router
from handlers.admin import router as admin_router
from logger import logger
from services.tracker import track_payment
from services.webhook_server import run_webhook_process
from utils import spawn


async def resume_pending_payments(bot: Bot) -> None:
    pending = await get_pending_payments()
    if not pending:
        return
    logger.info(f"Resuming tracking for {len(pending)} pending payments")
    for p in pending:
        spawn(
            track_payment(
                bot=bot,
                uuid=p["uuid"],
                tg_id=p["tg_id"],
                message_id=p["message_id"],
            )
        )


async def main() -> None:
    await init_db()

    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode="HTML"),
    )
    dp = Dispatcher(storage=MemoryStorage())

    dp.include_router(start_router)
    dp.include_router(payment_router)
    dp.include_router(admin_router)

    webhook_proc: multiprocessing.Process | None = None
    if settings.USE_WEBHOOK:
        webhook_proc = multiprocessing.Process(
            target=run_webhook_process, daemon=True
        )
        webhook_proc.start()
        logger.info("Webhook Server started successfully in a separate process")
    else:
        logger.info("Bot started (Telegram polling mode, webhook=off)")

    await resume_pending_payments(bot)

    try:
        await dp.start_polling(bot)
    finally:
        await exenta_client.close()
        await bot.session.close()
        if webhook_proc and webhook_proc.is_alive():
            webhook_proc.terminate()
            webhook_proc.join(timeout=3)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Bot stopped by user.")
`,
  },
  {
    path: 'config.py',
    folder: 'root',
    sourceNote: 'Из сообщения «Принято. Применяю все патчи…»',
    description: 'Валидация переменных окружения через pydantic-settings. Проверяет наличие EXENTA_WEBHOOK_SECRET при USE_WEBHOOK=true.',
    language: 'python',
    content: `from __future__ import annotations
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    BOT_TOKEN: str = Field(..., min_length=10)
    ADMIN_ID: int = Field(...)

    EXENTA_API_KEY: str = Field(..., min_length=5)
    EXENTA_API_SECRET: str = Field(..., min_length=5)
    EXENTA_BASE_URL: str = Field(default="https://exenta.pro/api/v1")

    USE_WEBHOOK: bool = Field(default=False)
    EXENTA_WEBHOOK_SECRET: str | None = Field(default=None)
    WEBHOOK_PORT: int = Field(default=8080, ge=1, le=65535)

    DB_PATH: str = Field(default="database.db")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_webhook_secret(self) -> "Settings":
        if self.USE_WEBHOOK and (
            not self.EXENTA_WEBHOOK_SECRET or not self.EXENTA_WEBHOOK_SECRET.strip()
        ):
            raise ValueError(
                "EXENTA_WEBHOOK_SECRET must be set when USE_WEBHOOK=true"
            )
        self.EXENTA_BASE_URL = self.EXENTA_BASE_URL.rstrip("/")
        return self


settings = Settings()
`,
  },
  {
    path: 'logger.py',
    folder: 'root',
    sourceNote: 'Из самого первого ответа Qwen (блок logger.py)',
    description: 'Ротация логов в bot.log и webhook.log (до 5 МБ, 3 архива) с одновременным выводом в stdout.',
    language: 'python',
    content: `import logging
import sys
from logging.handlers import RotatingFileHandler


def setup_logger(name: str = "exenta_bot", log_file: str = "bot.log") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    file_handler = RotatingFileHandler(
        log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


logger = setup_logger("exenta_bot", "bot.log")
webhook_logger = setup_logger("exenta_webhook", "webhook.log")
`,
  },
  {
    path: 'database.py',
    folder: 'root',
    sourceNote: 'Из последнего сообщения (второй блок, схема amount_kop + tuple[bool, bool])',
    description: 'Каноничная схема (id, uuid, tg_id, amount_kop, status, message_id, created_at, updated_at) и mark_status_if_pending_or_missing -> tuple[bool, bool].',
    language: 'python',
    content: `from __future__ import annotations
from typing import Any
import aiosqlite
from config import settings
from logger import logger


async def init_db() -> None:
    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE NOT NULL,
                tg_id INTEGER NOT NULL,
                amount_kop INTEGER NOT NULL,
                status TEXT NOT NULL,
                message_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);"
        )
        await db.commit()
    logger.info("Database initialized")


async def create_payment(
    uuid: str,
    tg_id: int,
    amount_kop: int,
    status: str = "PENDING",
    message_id: int | None = None,
) -> None:
    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute(
            """
            INSERT OR IGNORE INTO payments (uuid, tg_id, amount_kop, status, message_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            (uuid, tg_id, amount_kop, status, message_id),
        )
        await db.commit()


async def update_payment_status(uuid: str, status: str) -> None:
    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute(
            "UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?",
            (status, uuid),
        )
        await db.commit()


async def mark_status_if_pending_or_missing(
    uuid: str, new_status: str
) -> tuple[bool, bool]:
    async with aiosqlite.connect(settings.DB_PATH) as db:
        cur = await db.execute(
            "UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP "
            "WHERE uuid = ? AND status = 'PENDING'",
            (new_status, uuid),
        )
        await db.commit()
        if cur.rowcount > 0:
            return True, True
        cur = await db.execute("SELECT 1 FROM payments WHERE uuid = ?", (uuid,))
        exists = (await cur.fetchone()) is not None
        return False, exists


async def get_payment_by_uuid(uuid: str) -> dict[str, Any] | None:
    async with aiosqlite.connect(settings.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM payments WHERE uuid = ?", (uuid,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_pending_payments() -> list[dict[str, Any]]:
    async with aiosqlite.connect(settings.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM payments WHERE status = 'PENDING' ORDER BY id ASC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_stats() -> dict[str, Any]:
    async with aiosqlite.connect(settings.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT
                COUNT(*) AS total_payments,
                COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END), 0) AS success_payments,
                COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending_payments,
                COALESCE(SUM(CASE WHEN status IN ('FAILED', 'EXPIRED', 'CANCELLED') THEN 1 ELSE 0 END), 0) AS failed_payments,
                COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount_kop ELSE 0 END), 0) AS total_amount_kop
            FROM payments
            """
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else {}
`,
  },
  {
    path: 'exenta_client.py',
    folder: 'root',
    sourceNote: 'Из «Применяю все патчи…»',
    description: 'HTTP-клиент к Exenta API (aiohttp) с переиспользованием сессии, таймаутами и 3 попытками ретрая.',
    language: 'python',
    content: `from __future__ import annotations
import asyncio
from typing import Any
import aiohttp
from config import settings
from logger import logger


class ExentaAPIError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class ExentaClient:
    def __init__(self) -> None:
        self.base_url = settings.EXENTA_BASE_URL
        self.headers = {
            "X-API-Key": settings.EXENTA_API_KEY,
            "X-API-Secret": settings.EXENTA_API_SECRET,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self._session: aiohttp.ClientSession | None = None

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=15)
            self._session = aiohttp.ClientSession(
                headers=self.headers, timeout=timeout
            )
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def create_sbp_payment(
        self, amount: float, order_id: str, description: str = "Оплата заказа"
    ) -> dict[str, Any]:
        session = await self.get_session()
        url = f"{self.base_url}/payments/sbp"
        payload = {
            "amount": round(float(amount), 2),
            "currency": "RUB",
            "orderId": order_id,
            "description": description,
        }

        for attempt in range(1, 4):
            try:
                async with session.post(url, json=payload) as resp:
                    data = await resp.json(content_type=None)
                    if resp.status in (200, 201):
                        return data
                    logger.error(
                        f"Exenta create_sbp_payment error ({resp.status}): {data}"
                    )
                    raise ExentaAPIError(
                        f"API returned {resp.status}: {data}", status_code=resp.status
                    )
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                logger.warning(
                    f"Network error in create_sbp_payment (attempt {attempt}/3): {exc}"
                )
                if attempt == 3:
                    raise ExentaAPIError(f"Network timeout/error: {exc}") from exc
                await asyncio.sleep(1.5 * attempt)

        raise ExentaAPIError("Exhausted retries in create_sbp_payment")

    async def get_payment_status(self, payment_id: str) -> dict[str, Any]:
        session = await self.get_session()
        url = f"{self.base_url}/payments/{payment_id}"

        for attempt in range(1, 4):
            try:
                async with session.get(url) as resp:
                    data = await resp.json(content_type=None)
                    if resp.status == 200:
                        return data
                    raise ExentaAPIError(
                        f"Status check failed ({resp.status}): {data}",
                        status_code=resp.status,
                    )
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                logger.warning(
                    f"Network error in get_payment_status (attempt {attempt}/3): {exc}"
                )
                if attempt == 3:
                    raise ExentaAPIError(f"Network error: {exc}") from exc
                await asyncio.sleep(1.5 * attempt)

        raise ExentaAPIError("Exhausted retries in get_payment_status")


exenta_client = ExentaClient()
`,
  },
  {
    path: 'utils.py',
    folder: 'root',
    sourceNote: 'Из «Применяю все патчи…»',
    description: 'Генерация QR-кода в памяти (BytesIO), проверка HMAC-SHA256 подписи вебхука и безопасный spawn() фоновых задач.',
    language: 'python',
    content: `import asyncio
import hmac
import hashlib
from io import BytesIO
from typing import Coroutine, Any
import qrcode
from logger import logger

_background_tasks: set[asyncio.Task[Any]] = set()


def generate_qr_bytes(payload_url: str) -> bytes:
    """Generates a PNG QR code in memory from an SBP payload link."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(payload_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer.getvalue()


def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Verifies HMAC-SHA256 signature from X-Exenta-Signature header."""
    if not signature or not secret:
        return False
    clean_sig = signature.removeprefix("sha256=").strip()
    expected = hmac.new(
        secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected.lower(), clean_sig.lower())


def spawn(coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
    """Spawns a background task and keeps a strong reference until completion."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)

    def _on_done(t: asyncio.Task[Any]) -> None:
        _background_tasks.discard(t)
        if not t.cancelled() and t.exception():
            logger.error(f"Unhandled exception in background task: {t.exception()}", exc_info=t.exception())

    task.add_done_callback(_on_done)
    return task
`,
  },
  {
    path: 'handlers/__init__.py',
    folder: 'handlers',
    sourceNote: 'Пустой пакетный файл',
    description: 'Нужен для корректных импортов пакета handlers в Python.',
    language: 'python',
    content: '',
  },
  {
    path: 'handlers/start.py',
    folder: 'handlers',
    sourceNote: 'Из первого ответа Qwen',
    description: 'Обработчик команды /start со списком команд /pay и /stats.',
    language: 'python',
    content: `from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

router = Router(name="start_router")


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    await message.answer(
        "👋 <b>Добро пожаловать в Exenta Pay Bot!</b>\\n\\n"
        "Доступные команды:\\n"
        "• /pay — создать тестовый СБП-платёж и получить QR-код\\n"
        "• /stats — статистика платежей (для администратора)",
        parse_mode="HTML",
    )
`,
  },
  {
    path: 'handlers/payment.py',
    folder: 'handlers',
    sourceNote: 'Из последнего сообщения + комментарий CRITICAL над spawn(_delayed_tracker(...))',
    description: 'FSM-диалог приёма суммы, перевод в копейки (amount_kop), отправка QR, create_payment и запуск единственного фонового трекера.',
    language: 'python',
    content: `from __future__ import annotations
import asyncio
import uuid as uuid_lib
from aiogram import Router, F, Bot
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import StatesGroup, State
from aiogram.types import (
    Message,
    BufferedInputFile,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from database import create_payment
from exenta_client import exenta_client, ExentaAPIError
from logger import logger
from services.tracker import track_payment
from utils import generate_qr_bytes, spawn

router = Router(name="payment_router")


class PaymentStates(StatesGroup):
    waiting_for_amount = State()


async def _delayed_tracker(
    bot: Bot,
    uuid: str,
    tg_id: int,
    message_id: int | None = None,
    delay: float = 2.0,
) -> None:
    await asyncio.sleep(delay)
    await track_payment(bot=bot, uuid=uuid, tg_id=tg_id, message_id=message_id)


@router.message(Command("pay"))
async def cmd_pay(message: Message, state: FSMContext) -> None:
    await state.set_state(PaymentStates.waiting_for_amount)
    await message.answer(
        "💳 <b>Введите сумму для оплаты в рублях</b> (например, <code>10</code>):",
        parse_mode="HTML",
    )


@router.message(PaymentStates.waiting_for_amount, F.text)
async def process_amount(message: Message, state: FSMContext, bot: Bot) -> None:
    raw_text = (message.text or "").replace(",", ".").strip()
    try:
        amount = round(float(raw_text), 2)
    except ValueError:
        await message.answer(
            "⚠️ Введите корректное число (например: <code>10</code>).",
            parse_mode="HTML",
        )
        return

    if amount < 10 or amount > 500_000:
        await message.answer("⚠️ Сумма должна быть от 10 до 500 000 ₽.")
        return

    await state.clear()
    amount_kop = int(round(amount * 100))
    order_id = f"ord_{uuid_lib.uuid4().hex[:12]}"

    status_msg = await message.answer("⏳ Создаём СБП-платёж в Exenta...")

    try:
        resp = await exenta_client.create_sbp_payment(
            amount=amount,
            order_id=order_id,
            description=f"Пополнение / заказ {order_id}",
        )
    except ExentaAPIError as exc:
        logger.error(f"Failed to create payment for order {order_id}: {exc}")
        await status_msg.edit_text("❌ Ошибка при создании платежа. Попробуйте позже.")
        return

    payment_uuid = str(
        resp.get("uuid") or resp.get("paymentId") or resp.get("id") or order_id
    )
    qr_payload = resp.get("qrPayload") or resp.get("qrUrl") or resp.get("payUrl")

    if not qr_payload:
        logger.error(f"Missing qrPayload in Exenta response: {resp}")
        await status_msg.edit_text(
            "❌ Не удалось получить ссылку СБП от платёжного шлюза."
        )
        return

    qr_bytes = await asyncio.to_thread(generate_qr_bytes, qr_payload)
    photo_file = BufferedInputFile(qr_bytes, filename=f"{payment_uuid}.png")

    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔗 Оплатить через СБП", url=qr_payload)]
        ]
    )

    await status_msg.delete()
    sent_photo = await message.answer_photo(
        photo=photo_file,
        caption=(
            f"🧾 <b>Счёт на оплату: {amount:.2f} ₽</b>\\n"
            f"UUID: <code>{payment_uuid}</code>\\n\\n"
            "Отсканируйте QR-код камерой или приложением банка, "
            "либо нажмите кнопку ниже.\\n\\n"
            "⏳ <i>Ожидаем подтверждение оплаты...</i>"
        ),
        parse_mode="HTML",
        reply_markup=kb,
    )

    tg_id = message.from_user.id if message.from_user else message.chat.id
    await create_payment(
        payment_uuid,
        tg_id,
        amount_kop,
        "PENDING",
        sent_photo.message_id,
    )

    # CRITICAL: это единственный notifier в фоновом режиме после сохранения message_id
    spawn(
        _delayed_tracker(
            bot=bot,
            uuid=payment_uuid,
            tg_id=tg_id,
            message_id=sent_photo.message_id,
        )
    )
`,
  },
  {
    path: 'handlers/admin.py',
    folder: 'handlers',
    sourceNote: 'Из «Применяю все патчи…» (перевод amount_kop / 100 в рубли)',
    description: 'Команда /stats с проверкой ADMIN_ID и переводом total_amount_kop из копеек в рубли.',
    language: 'python',
    content: `from __future__ import annotations
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from config import settings
from database import get_stats

router = Router(name="admin_router")


@router.message(Command("stats"))
async def cmd_stats(message: Message) -> None:
    if not message.from_user or message.from_user.id != settings.ADMIN_ID:
        await message.answer("⛔ У вас нет прав для просмотра статистики.")
        return

    stats = await get_stats()
    total = stats.get("total_payments") or 0
    success = stats.get("success_payments") or 0
    pending = stats.get("pending_payments") or 0
    failed = stats.get("failed_payments") or 0
    amount_kop = stats.get("total_amount_kop") or 0
    amount_rub = amount_kop / 100.0

    await message.answer(
        "📊 <b>Статистика платежей Exenta</b>\\n\\n"
        f"• Всего создано: <b>{total}</b>\\n"
        f"• Успешных (SUCCESS): <b>{success}</b>\\n"
        f"• В ожидании (PENDING): <b>{pending}</b>\\n"
        f"• Отменено/Истекло: <b>{failed}</b>\\n\\n"
        f"💰 <b>Сумма успешных оплат:</b> <code>{amount_rub:.2f} ₽</code>",
        parse_mode="HTML",
    )
`,
  },
  {
    path: 'services/__init__.py',
    folder: 'services',
    sourceNote: 'Пустой пакетный файл',
    description: 'Нужен для корректных импортов пакета services в Python.',
    language: 'python',
    content: '',
  },
  {
    path: 'services/tracker.py',
    folder: 'services',
    sourceNote: 'Из «Применяю все патчи…» (updated, exists = await mark_status_if_pending_or_missing)',
    description: 'Фоновый polling: track_payment(bot, uuid, tg_id, message_id) с распаковкой кортежа (updated, exists) и проверкой if updated or not exists.',
    language: 'python',
    content: `from __future__ import annotations
import asyncio
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from database import (
    get_payment_by_uuid,
    mark_status_if_pending_or_missing,
)
from exenta_client import exenta_client, ExentaAPIError
from logger import logger

ACTIVE_TRACKERS: set[str] = set()

SUCCESS_STATUSES = {"SUCCESS", "PAID", "COMPLETED"}
FAILURE_STATUSES = {"FAILED", "EXPIRED", "CANCELED", "CANCELLED"}


async def _notify_success(
    bot: Bot, tg_id: int, message_id: int | None, uuid: str
) -> None:
    text = "✅ Оплата успешно завершена! Спасибо."
    if message_id:
        try:
            await bot.edit_message_caption(
                chat_id=tg_id,
                message_id=message_id,
                caption=f"<b>{text}</b>\\nUUID: <code>{uuid}</code>",
                parse_mode="HTML",
                reply_markup=None,
            )
            return
        except TelegramBadRequest as exc:
            logger.warning(f"Could not edit caption for {uuid}: {exc}")

    await bot.send_message(chat_id=tg_id, text=text)


async def _notify_failure(
    bot: Bot, tg_id: int, message_id: int | None, uuid: str, status: str
) -> None:
    text = f"❌ Оплата не прошла (статус: {status})."
    if message_id:
        try:
            await bot.edit_message_caption(
                chat_id=tg_id,
                message_id=message_id,
                caption=f"<b>{text}</b>\\nUUID: <code>{uuid}</code>",
                parse_mode="HTML",
                reply_markup=None,
            )
            return
        except TelegramBadRequest as exc:
            logger.warning(f"Could not edit caption for {uuid}: {exc}")

    await bot.send_message(chat_id=tg_id, text=text)


async def track_payment(
    bot: Bot,
    uuid: str,
    tg_id: int,
    message_id: int | None = None,
    poll_interval: float = 4.0,
    max_attempts: int = 225,
) -> None:
    if uuid in ACTIVE_TRACKERS:
        return
    ACTIVE_TRACKERS.add(uuid)

    try:
        for _ in range(max_attempts):
            local = await get_payment_by_uuid(uuid)
            if local and local["status"] != "PENDING":
                return

            try:
                remote = await exenta_client.get_payment_status(uuid)
                remote_status = str(remote.get("status", "")).upper()

                if remote_status in SUCCESS_STATUSES:
                    updated, exists = await mark_status_if_pending_or_missing(
                        uuid, "SUCCESS"
                    )
                    if updated or not exists:
                        await _notify_success(bot, tg_id, message_id, uuid)
                        logger.info(f"Payment {uuid} confirmed via polling (SUCCESS)")
                    return

                if remote_status in FAILURE_STATUSES:
                    updated, exists = await mark_status_if_pending_or_missing(
                        uuid, "CANCELLED"
                    )
                    if updated or not exists:
                        await _notify_failure(
                            bot, tg_id, message_id, uuid, remote_status
                        )
                        logger.info(f"Payment {uuid} finished with {remote_status}")
                    return

            except ExentaAPIError as exc:
                logger.warning(f"Polling check warning for {uuid}: {exc}")

            await asyncio.sleep(poll_interval)

        logger.info(f"Tracking timeout reached for payment {uuid}")
    finally:
        ACTIVE_TRACKERS.discard(uuid)
`,
  },
  {
    path: 'services/webhook_server.py',
    folder: 'services',
    sourceNote: 'Из последнего сообщения (второй блок, updated, exists = await mark_status_if_pending_or_missing)',
    description: 'Aiohttp-сервер для приёма POST /webhooks/exenta с проверкой HMAC-подписи и распаковкой updated, exists.',
    language: 'python',
    content: `from __future__ import annotations
import json
from aiohttp import web
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from config import settings
from database import (
    get_payment_by_uuid,
    mark_status_if_pending_or_missing,
)
from logger import webhook_logger
from services.tracker import (
    _notify_success,
    _notify_failure,
    SUCCESS_STATUSES,
    FAILURE_STATUSES,
)
from utils import verify_webhook_signature


async def handle_exenta_webhook(request: web.Request) -> web.Response:
    raw_body = await request.read()
    signature = request.headers.get("X-Exenta-Signature", "")

    if not settings.EXENTA_WEBHOOK_SECRET or not verify_webhook_signature(
        raw_body, signature, settings.EXENTA_WEBHOOK_SECRET
    ):
        webhook_logger.warning("Invalid webhook signature received")
        return web.json_response({"error": "Invalid signature"}, status=401)

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    event_type = str(payload.get("event", "")).lower()
    if event_type == "webhook.test" or payload.get("test") is True:
        webhook_logger.info("Webhook test received")
        return web.json_response({"ok": True, "mode": "test"})

    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    uuid = str(
        data.get("uuid")
        or data.get("paymentId")
        or data.get("id")
        or data.get("orderId")
        or ""
    ).strip()
    raw_status = str(data.get("status", "")).upper()
    net_amount = data.get("netAmount")

    if not uuid:
        webhook_logger.warning(f"Webhook missing payment uuid: {payload}")
        return web.json_response({"error": "Missing uuid"}, status=400)

    payment = await get_payment_by_uuid(uuid)
    if not payment:
        webhook_logger.warning(f"Webhook for unknown payment uuid={uuid}")
        return web.json_response({"ok": True, "ignored": "not_found"})

    bot: Bot = request.app["bot"]
    tg_id: int = payment["tg_id"]
    message_id: int | None = payment["message_id"]

    if raw_status in SUCCESS_STATUSES:
        updated, exists = await mark_status_if_pending_or_missing(uuid, "SUCCESS")
        if updated or not exists:
            await _notify_success(bot, tg_id, message_id, uuid)
            webhook_logger.info(
                f"Webhook processed SUCCESS for {uuid} (netAmount={net_amount})"
            )
    elif raw_status in FAILURE_STATUSES:
        updated, exists = await mark_status_if_pending_or_missing(uuid, "CANCELLED")
        if updated or not exists:
            await _notify_failure(bot, tg_id, message_id, uuid, raw_status)
            webhook_logger.info(f"Webhook processed CANCELLED for {uuid}")

    return web.json_response({"ok": True})


def create_webhook_app(bot: Bot | None = None) -> web.Application:
    app = web.Application()
    if bot is not None:
        app["bot"] = bot
    else:
        app["bot"] = Bot(
            token=settings.BOT_TOKEN,
            default=DefaultBotProperties(parse_mode="HTML"),
        )
    app.router.add_post("/webhooks/exenta", handle_exenta_webhook)
    return app


def run_webhook_process() -> None:
    app = create_webhook_app()
    web.run_app(app, host="0.0.0.0", port=settings.WEBHOOK_PORT, print=None)
`,
  },
  {
    path: 'requirements.txt',
    folder: 'root',
    sourceNote: 'Из первого ответа Qwen',
    description: 'Зависимости Python 3.11+: aiogram, aiohttp, aiosqlite, qrcode, Pillow, pydantic-settings.',
    language: 'text',
    content: `aiogram>=3.4.1,<4.0.0
aiohttp>=3.9.3,<4.0.0
aiosqlite>=0.20.0,<1.0.0
qrcode>=7.4.2,<8.0.0
Pillow>=10.2.0,<11.0.0
pydantic-settings>=2.2.1,<3.0.0
`,
  },
  {
    path: '.env.example',
    folder: 'root',
    sourceNote: 'Из первого ответа Qwen',
    description: 'Шаблон переменных окружения для быстрого старта в режиме polling или webhook.',
    language: 'ini',
    content: `BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
ADMIN_ID=123456789
EXENTA_API_KEY=pk_live_replace_me
EXENTA_API_SECRET=sk_live_replace_me
EXENTA_BASE_URL=https://exenta.pro/api/v1

# Пока оставь выключенным — сначала проверь polling
USE_WEBHOOK=false

# Заполнишь только если решишь включить webhook
EXENTA_WEBHOOK_SECRET=whsec_replace_me
WEBHOOK_PORT=8080
DB_PATH=database.db
`,
  },
  {
    path: '.gitignore',
    folder: 'root',
    sourceNote: 'Обязательная защита секретов (Раздел 4)',
    description: 'Исключает .env, базу данных *.db, логи *.log и venv из git-репозитория.',
    language: 'text',
    content: `.env
*.db
*.log
venv/
__pycache__/
*.pyc
`,
  },
  {
    path: 'README.md',
    folder: 'root',
    sourceNote: 'Из первого ответа Qwen + секция про возвраты и безопасность .env',
    description: 'Документация по запуску, правилам безопасности .env и регламенту возвратов (Refunds) по СБП.',
    language: 'markdown',
    content: `# Exenta Pay Telegram Bot (\`exenta_bot\`)

Асинхронный Telegram-бот на **Python 3.11+ / aiogram 3.x** для приёма платежей через **СБП (Exenta API)** с генерацией QR-кода, фоновым трекингом статуса (polling + опциональный HMAC-webhook) и хранением в SQLite (WAL).

---

## Возможности

- **Генерация СБП QR на лету**: создание платежа через \`POST /payments/sbp\` и отправка QR-кода пользователю с кнопкой быстрой оплаты.
- **Атомарное отслеживание (\`database.py\` + \`services/tracker.py\`)**:
  - Учёт сумм в целых копейках (\`amount_kop INTEGER NOT NULL\`), исключающий ошибки округления float.
  - Атомарный переход из \`PENDING\` через \`updated, exists = await mark_status_if_pending_or_missing(uuid, new_status)\` с проверкой \`if updated or not exists:\` гарантирует отправку уведомления даже при сбое записи \`create_payment\` и исключает дубли между polling и webhook.
  - Автоматический подхват незавершённых \`PENDING\` платежей при старте в \`main.py\` (\`resume_pending_payments\`).
- **Опциональный Webhook-сервер (\`services/webhook_server.py\`)**:
  - Проверка подписи \`X-Exenta-Signature\` по алгоритму \`HMAC-SHA256\`.
  - В логах вебхука фиксируется \`netAmount\` (сумма к зачислению за вычетом комиссии шлюза), а также поддерживается тестовый вебхук (\`Webhook test received\`).
- **Админ-статистика (\`/stats\`)**: просмотр количества платежей и общей суммы успешных оплат.

---

## Безопасность \`.env\`

1. Файл \`.env\` содержит секретный ключ \`EXENTA_API_SECRET\` (\`sk_...\`) и \`BOT_TOKEN\`.
2. Убедитесь, что \`.env\` добавлен в \`.gitignore\` (проверка: \`grep -q "^\\.env$" .gitignore\`).
3. Если вы генерировали и скачивали \`.env\` через браузерный конфигуратор, **немедленно переместите его в рабочую папку \`exenta_bot/\` и удалите копию из \`~/Downloads\`**. Никогда не пересылайте \`.env\` в мессенджерах.

---

## Возвраты (Refunds) и работа с СБП

1. **Инициация возврата**: возвраты по СБП оформляются через личный кабинет мерчанта Exenta (раздел **Платежи → Детали транзакции → Возврат**) либо через обращение в поддержку с указанием \`uuid\` / \`orderId\`.
2. **Баланс и комиссия (\`netAmount\`)**: в ЛК Exenta и в payload вебхука отображается \`netAmount\` (сумма после удержания комиссии). Для проведения возврата на доступном балансе мерчанта должна находиться полная сумма возврата.
3. **Сроки зачисления**: при возврате по СБП средства возвращаются на счёт покупателя мгновенно (обычно в течение 5–30 секунд).
`,
  },
];
