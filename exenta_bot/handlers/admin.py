from __future__ import annotations
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
        "📊 <b>Статистика платежей Exenta</b>\n\n"
        f"• Всего создано: <b>{total}</b>\n"
        f"• Успешных (SUCCESS): <b>{success}</b>\n"
        f"• В ожидании (PENDING): <b>{pending}</b>\n"
        f"• Отменено/Истекло: <b>{failed}</b>\n\n"
        f"💰 <b>Сумма успешных оплат:</b> <code>{amount_rub:.2f} ₽</code>",
        parse_mode="HTML",
    )
