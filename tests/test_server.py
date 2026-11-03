import asyncio
import json

from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

from backend.server import Broadcaster


def test_broadcast_reaches_connected_client():
    async def scenario():
        broadcaster = Broadcaster()

        async def handler(websocket):
            await broadcaster.register(websocket)
            try:
                await websocket.wait_closed()
            finally:
                await broadcaster.unregister(websocket)

        async with serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            async with connect(f"ws://127.0.0.1:{port}") as client:
                for _ in range(100):
                    if broadcaster.client_count == 1:
                        break
                    await asyncio.sleep(0.01)
                assert broadcaster.client_count == 1

                await broadcaster.broadcast(json.dumps({"detected": True}))
                received = await asyncio.wait_for(client.recv(), timeout=1.0)
                assert json.loads(received) == {"detected": True}

    asyncio.run(scenario())


def test_broadcast_without_clients_is_noop():
    async def scenario():
        broadcaster = Broadcaster()
        await broadcaster.broadcast(json.dumps({"detected": False}))
        assert broadcaster.client_count == 0

    asyncio.run(scenario())


def test_dead_client_is_dropped():
    async def scenario():
        broadcaster = Broadcaster()

        async def handler(websocket):
            await broadcaster.register(websocket)
            try:
                await websocket.wait_closed()
            finally:
                await broadcaster.unregister(websocket)

        async with serve(handler, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            client = await connect(f"ws://127.0.0.1:{port}")
            for _ in range(100):
                if broadcaster.client_count == 1:
                    break
                await asyncio.sleep(0.01)
            await client.close()
            for _ in range(100):
                if broadcaster.client_count == 0:
                    break
                await asyncio.sleep(0.01)
            assert broadcaster.client_count == 0

    asyncio.run(scenario())
