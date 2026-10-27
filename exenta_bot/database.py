from __future__ import annotations
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
