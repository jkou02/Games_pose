"""Difusión broadcast de payloads a clientes WebSocket."""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

SEND_TIMEOUT = 0.1


class Broadcaster:
    """Registro de clientes y envío tolerante a fallos."""

    def __init__(self) -> None:
        self._clients: set = set()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def register(self, websocket) -> None:
        self._clients.add(websocket)
        logger.info("Cliente conectado (%d activos)", self.client_count)

    async def unregister(self, websocket) -> None:
        self._clients.discard(websocket)
        logger.info("Cliente desconectado (%d activos)", self.client_count)

    async def broadcast(self, message: str) -> None:
        """Envía a todos; descarta clientes que fallen o excedan el timeout."""
        if not self._clients:
            return
        await asyncio.gather(
            *(self._send(websocket, message) for websocket in list(self._clients)),
            return_exceptions=True,
        )

    async def _send(self, websocket, message: str) -> None:
        try:
            await asyncio.wait_for(websocket.send(message), timeout=SEND_TIMEOUT)
        except Exception:
            self._clients.discard(websocket)
