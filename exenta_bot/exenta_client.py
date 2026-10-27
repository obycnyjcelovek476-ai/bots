from __future__ import annotations
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
