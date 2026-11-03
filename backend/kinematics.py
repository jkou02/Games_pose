"""Transformación de landmarks de MediaPipe a espacio Three.js y vectores óseos.

Módulo puro: no importa mediapipe. La entrada son secuencias de 33 puntos o
landmarks con atributos .x/.y/.z.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

NOSE = 0
LEFT_SHOULDER = 11
RIGHT_SHOULDER = 12
LEFT_ELBOW = 13
RIGHT_ELBOW = 14
LEFT_WRIST = 15
RIGHT_WRIST = 16
LEFT_HIP = 23
RIGHT_HIP = 24

#: Subconjunto del contrato: índice MediaPipe -> clave del payload.
LANDMARK_KEYS: dict[int, str] = {
    NOSE: "nose",
    LEFT_SHOULDER: "left_shoulder",
    RIGHT_SHOULDER: "right_shoulder",
    LEFT_ELBOW: "left_elbow",
    RIGHT_ELBOW: "right_elbow",
    LEFT_WRIST: "left_wrist",
    RIGHT_WRIST: "right_wrist",
    LEFT_HIP: "left_hip",
    RIGHT_HIP: "right_hip",
}

#: Segmentos del contrato: nombre -> (índice origen, índice destino).
BONE_DEFINITIONS: dict[str, tuple[int, int]] = {
    "right_upper_arm": (RIGHT_SHOULDER, RIGHT_ELBOW),
    "right_lower_arm": (RIGHT_ELBOW, RIGHT_WRIST),
    "left_upper_arm": (LEFT_SHOULDER, LEFT_ELBOW),
    "left_lower_arm": (LEFT_ELBOW, LEFT_WRIST),
}

_EPS = 1e-8


def _xyz(landmark) -> tuple[float, float, float]:
    if hasattr(landmark, "x"):
        return float(landmark.x), float(landmark.y), float(landmark.z)
    return float(landmark[0]), float(landmark[1]), float(landmark[2])


def to_three_space(point: Sequence[float]) -> np.ndarray:
    """Aplica x_3d = -x, y_3d = -y, z_3d = -z (AGENTS.md §4)."""
    x, y, z = float(point[0]), float(point[1]), float(point[2])
    return np.array([-x, -y, -z], dtype=np.float64)


def normalize_landmarks(raw) -> dict[str, np.ndarray]:
    """Convierte landmarks crudos a metros, centrados en la cadera, en espacio Three.js."""
    points = {
        name: to_three_space(_xyz(raw[idx])) for idx, name in LANDMARK_KEYS.items()
    }
    hip_mid = (points["left_hip"] + points["right_hip"]) / 2.0
    return {name: point - hip_mid for name, point in points.items()}


def unit(vec: Sequence[float]) -> np.ndarray:
    """Normaliza; devuelve vector nulo si la norma es despreciable."""
    arr = np.asarray(vec, dtype=np.float64)
    norm = float(np.linalg.norm(arr))
    if norm < _EPS:
        return np.zeros(3, dtype=np.float64)
    return arr / norm


def compute_bones(points: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Vectores unitarios de cada segmento del contrato."""
    bones = {
        name: unit(points[LANDMARK_KEYS[end]] - points[LANDMARK_KEYS[start]])
        for name, (start, end) in BONE_DEFINITIONS.items()
    }
    hip_mid = (points["left_hip"] + points["right_hip"]) / 2.0
    shoulder_mid = (points["left_shoulder"] + points["right_shoulder"]) / 2.0
    bones["torso_up"] = unit(shoulder_mid - hip_mid)
    # Cabeza: del centro de hombros a la nariz. Lo necesita el avatar para
    # rotar el cuello (Mixamo `Neck`); no estaba en el contrato original.
    bones["head"] = unit(points["nose"] - shoulder_mid)
    return bones


def to_list(vec: Sequence[float], decimals: int = 4) -> list[float]:
    """Redondea para reducir ancho de banda del payload."""
    values = [round(float(component), decimals) for component in vec]
    # Evita -0.0 en el JSON sin cambiar el valor numérico.
    return [0.0 if value == 0 else value for value in values]
