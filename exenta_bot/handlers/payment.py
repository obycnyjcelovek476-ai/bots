from __future__ import annotations
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
            f"🧾 <b>Счёт на оплату: {amount:.2f} ₽</b>\n"
            f"UUID: <code>{payment_uuid}</code>\n\n"
            "Отсканируйте QR-код камерой или приложением банка, "
            "либо нажмите кнопку ниже.\n\n"
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
