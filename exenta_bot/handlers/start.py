from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

router = Router(name="start_router")


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    await message.answer(
        "👋 <b>Добро пожаловать в Exenta Pay Bot!</b>\n\n"
        "Доступные команды:\n"
        "• /pay — создать тестовый СБП-платёж и получить QR-код\n"
        "• /stats — статистика платежей (для администратора)",
        parse_mode="HTML",
    )
