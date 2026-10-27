import asyncio
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
