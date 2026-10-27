from __future__ import annotations
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
