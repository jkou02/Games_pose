"""Extracción de pose con MediaPipe y armado del payload."""

from __future__ import annotations

import cv2
import mediapipe as mp
import numpy as np

from backend.kinematics import (
    CORE_INDICES,
    LANDMARK_KEYS,
    compute_bones,
    normalize_landmarks,
)
from backend.schema import build_payload, empty_payload


class PoseEngine:
    """Procesa frames BGR y devuelve payloads listos para difundir."""

    def __init__(self, min_confidence: float = 0.5, model_complexity: int = 1) -> None:
        self.min_confidence = min_confidence
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=model_complexity,
            min_detection_confidence=min_confidence,
            min_tracking_confidence=0.5,
        )

    @staticmethod
    def _landmarks_2d(pose_landmarks) -> dict[str, list[float]]:
        """Coordenadas normalizadas de imagen (0..1) para calcar sobre el video."""
        if not pose_landmarks:
            return {}
        return {
            name: [
                round(float(pose_landmarks.landmark[index].x), 4),
                round(float(pose_landmarks.landmark[index].y), 4),
            ]
            for index, name in LANDMARK_KEYS.items()
        }

    def process(self, frame_bgr: np.ndarray) -> dict:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = self._pose.process(rgb)

        if not results.pose_world_landmarks:
            return empty_payload()

        raw = results.pose_world_landmarks.landmark
        visibility = [float(raw[index].visibility) for index in CORE_INDICES]
        confidence = float(np.mean(visibility)) if visibility else 0.0

        if confidence < self.min_confidence:
            return empty_payload()

        points = normalize_landmarks(raw)
        bones = compute_bones(points)
        return build_payload(
            points,
            bones,
            confidence,
            landmarks_2d=self._landmarks_2d(results.pose_landmarks),
        )

    def close(self) -> None:
        self._pose.close()
