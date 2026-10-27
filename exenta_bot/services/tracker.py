from __future__ import annotations
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
                caption=f"<b>{text}</b>\nUUID: <code>{uuid}</code>",
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
                caption=f"<b>{text}</b>\nUUID: <code>{uuid}</code>",
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
