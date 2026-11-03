"""Fuente de video configurable: webcam local, archivo o RTSP."""

from __future__ import annotations

import cv2
import numpy as np


def parse_source(raw: str) -> int | str:
    """Convierte '0' en índice de cámara; deja URLs y rutas como texto."""
    value = raw.strip()
    if value.isdigit():
        return int(value)
    return value


class CameraSource:
    """Envoltura mínima de cv2.VideoCapture con configuración opcional."""

    def __init__(
        self,
        source: int | str,
        width: int = 1280,
        height: int = 720,
        fps: int = 30,
    ) -> None:
        self.source = source
        self.width = width
        self.height = height
        self.fps = fps
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> bool:
        self._cap = cv2.VideoCapture(self.source)
        if not self._cap.isOpened():
            return False
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self._cap.set(cv2.CAP_PROP_FPS, self.fps)
        return True

    def read(self) -> np.ndarray | None:
        if self._cap is None:
            return None
        ok, frame = self._cap.read()
        if not ok:
            return None
        return frame

    def release(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
