import numpy as np

from backend.pose_engine import PoseEngine

FRAME = np.zeros((48, 64, 3), dtype=np.uint8)


class Punto:
    def __init__(self, x: float, y: float, z: float = 0.0, visibility: float = 0.9):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = visibility


class Landmarks:
    def __init__(self, puntos):
        self.landmark = puntos


class Resultados:
    def __init__(self, world=None, image=None):
        self.pose_world_landmarks = world
        self.pose_landmarks = image


class PoseFalsa:
    def __init__(self, resultados):
        self._resultados = resultados

    def process(self, _rgb):
        return self._resultados


def pose_de_pie():
    """33 puntos en pose T, en metros y en coordenadas de imagen."""
    world = [Punto(0.0, 0.0) for _ in range(33)]
    image = [Punto(0.5, 0.5) for _ in range(33)]
    world[0], image[0] = Punto(0.0, -0.72, 0.10), Punto(0.50, 0.20)
    world[11], image[11] = Punto(0.20, -0.55), Punto(0.62, 0.35)
    world[12], image[12] = Punto(-0.20, -0.55), Punto(0.38, 0.35)
    world[13], image[13] = Punto(0.60, -0.55), Punto(0.78, 0.36)
    world[14], image[14] = Punto(-0.60, -0.55), Punto(0.22, 0.36)
    world[15], image[15] = Punto(1.00, -0.55), Punto(0.90, 0.37)
    world[16], image[16] = Punto(-1.00, -0.55), Punto(0.10, 0.37)
    world[23], image[23] = Punto(0.10, 0.0), Punto(0.56, 0.60)
    world[24], image[24] = Punto(-0.10, 0.0), Punto(0.44, 0.60)
    return Landmarks(world), Landmarks(image)


def motor(resultados, min_confidence: float = 0.5) -> PoseEngine:
    engine = object.__new__(PoseEngine)
    engine.min_confidence = min_confidence
    engine._pose = PoseFalsa(resultados)
    return engine


def test_procesa_frame_y_emite_contrato_completo():
    world, image = pose_de_pie()
    payload = motor(Resultados(world, image)).process(FRAME)

    assert payload["detected"] is True
    assert payload["confidence"] > 0.5
    assert set(payload["bones"]) == {
        "right_upper_arm",
        "right_lower_arm",
        "left_upper_arm",
        "left_lower_arm",
        "torso_up",
        "torso_side",
        "hips_side",
        "head",
    }
    assert payload["landmarks_2d"]["nose"] == [0.5, 0.2]
    assert payload["landmarks_2d"]["left_shoulder"] == [0.62, 0.35]
    assert set(payload["landmarks_2d"]) == set(payload["landmarks"])


def test_sin_deteccion_devuelve_payload_vacio():
    payload = motor(Resultados(None, None)).process(FRAME)
    assert payload["detected"] is False
    assert payload["landmarks"] == {}
    assert payload["landmarks_2d"] == {}


def test_baja_confianza_se_reporta_como_sin_deteccion():
    world, image = pose_de_pie()
    payload = motor(Resultados(world, image), min_confidence=0.99).process(FRAME)
    assert payload["detected"] is False
