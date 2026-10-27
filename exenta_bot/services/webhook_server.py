from __future__ import annotations
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
