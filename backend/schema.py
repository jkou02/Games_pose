"""Construcción y serialización del payload JSON (AGENTS.md §3)."""

from __future__ import annotations

import json
import time
from typing import Mapping, Sequence

from backend.kinematics import to_list


def build_payload(
    landmarks: Mapping[str, Sequence[float]],
    bones: Mapping[str, Sequence[float]],
    confidence: float,
    detected: bool = True,
    timestamp: float | None = None,
) -> dict:
    """Arma el paquete estándar de un frame detectado."""
    return {
        "timestamp": round(float(time.time() if timestamp is None else timestamp), 3),
        "detected": bool(detected),
        "confidence": round(float(confidence), 3),
        "landmarks": {name: to_list(vec) for name, vec in landmarks.items()},
        "bones": {name: to_list(vec) for name, vec in bones.items()},
    }


def empty_payload(timestamp: float | None = None) -> dict:
    """Paquete de frame sin detección: el avatar debe volver a pose neutra."""
    return {
        "timestamp": round(float(time.time() if timestamp is None else timestamp), 3),
        "detected": False,
        "confidence": 0.0,
        "landmarks": {},
        "bones": {},
    }


def serialize(payload: Mapping) -> str:
    """JSON compacto para minimizar ancho de banda."""
    return json.dumps(payload, separators=(",", ":"))
