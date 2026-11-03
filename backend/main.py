"""Punto de entrada: captura -> MediaPipe -> WebSocket."""

from __future__ import annotations

import argparse
import asyncio
import logging
import time

from websockets.asyncio.server import serve

from backend.capture import CameraSource, parse_source
from backend.pose_engine import PoseEngine
from backend.schema import serialize
from backend.server import Broadcaster

logger = logging.getLogger("mocap")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Servidor MoCap MediaPipe -> WebSocket"
    )
    parser.add_argument("--source", default="0", help="Índice de cámara (0) o URL RTSP")
    parser.add_argument("--host", default="127.0.0.1", help="Interfaz de escucha")
    parser.add_argument("--port", type=int, default=8765, help="Puerto WebSocket")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument(
        "--fps", type=int, default=30, help="FPS solicitado a la cámara"
    )
    parser.add_argument("--max-fps", type=float, default=60.0, help="Tope de difusión")
    parser.add_argument("--model-complexity", type=int, choices=(0, 1, 2), default=1)
    parser.add_argument("--min-confidence", type=float, default=0.5)
    parser.add_argument(
        "--no-smooth", action="store_true", help="Desactiva el filtro de suavizado"
    )
    parser.add_argument(
        "--min-cutoff", type=float, default=1.0, help="Hz de corte en reposo"
    )
    parser.add_argument(
        "--beta", type=float, default=0.05, help="Adaptación a la velocidad"
    )
    parser.add_argument(
        "--d-cutoff", type=float, default=1.0, help="Hz del estimador de velocidad"
    )
    parser.add_argument("--log-level", default="INFO")
    return parser


async def run(args: argparse.Namespace) -> int:
    camera = CameraSource(
        parse_source(args.source),
        width=args.width,
        height=args.height,
        fps=args.fps,
    )
    if not await asyncio.to_thread(camera.open):
        logger.error("No se pudo abrir la fuente de video: %s", args.source)
        return 1

    engine = await asyncio.to_thread(
        PoseEngine,
        args.min_confidence,
        args.model_complexity,
        args.min_cutoff,
        args.beta,
        args.d_cutoff,
        not args.no_smooth,
    )
    broadcaster = Broadcaster()
    min_interval = 1.0 / args.max_fps if args.max_fps > 0 else 0.0

    async def handler(websocket) -> None:
        await broadcaster.register(websocket)
        try:
            await websocket.wait_closed()
        finally:
            await broadcaster.unregister(websocket)

    logger.info("Escuchando en ws://%s:%d", args.host, args.port)
    frames = 0
    detected_frames = 0
    window_start = time.perf_counter()
    last_sent = 0.0

    try:
        async with serve(handler, args.host, args.port):
            while True:
                frame = await asyncio.to_thread(camera.read)
                if frame is None:
                    await asyncio.sleep(0.01)
                    continue

                payload = await asyncio.to_thread(engine.process, frame)
                frames += 1
                if payload["detected"]:
                    detected_frames += 1

                now = time.perf_counter()
                if min_interval == 0.0 or (now - last_sent) >= min_interval:
                    last_sent = now
                    await broadcaster.broadcast(serialize(payload))

                if frames % 100 == 0:
                    elapsed = now - window_start
                    logger.info(
                        "%.1f FPS | detectado %d/%d | clientes %d | conf %.2f",
                        frames / elapsed if elapsed > 0 else 0.0,
                        detected_frames,
                        frames,
                        broadcaster.client_count,
                        payload["confidence"],
                    )
                    frames = 0
                    detected_frames = 0
                    window_start = now
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Cerrando servidor")
        return 0
    finally:
        await asyncio.to_thread(camera.release)
        await asyncio.to_thread(engine.close)


def main() -> int:
    args = build_parser().parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
