import numpy as np

from backend.pose_engine import PoseEngine
from backend.smoothing import PoseSmoother

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
    world[25], image[25] = Punto(0.10, -0.45), Punto(0.58, 0.75)
    world[26], image[26] = Punto(-0.10, -0.45), Punto(0.42, 0.75)
    world[27], image[27] = Punto(0.10, -0.90), Punto(0.60, 0.95)
    world[28], image[28] = Punto(-0.10, -0.90), Punto(0.40, 0.95)
    return Landmarks(world), Landmarks(image)


def motor(resultados, min_confidence: float = 0.5, smooth: bool = True) -> PoseEngine:
    engine = object.__new__(PoseEngine)
    engine.min_confidence = min_confidence
    engine._smoother = PoseSmoother() if smooth else None
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
    # El espejo de X: la rodilla izquierda del sujeto queda en -x del payload.
    assert payload["landmarks"]["left_knee"] == [-0.10, 0.45, 0.0]
    assert payload["landmarks"]["right_ankle"] == [0.10, 0.90, 0.0]
    assert payload["landmarks_2d"]["right_ankle"] == [0.4, 0.95]
    assert len(payload["landmarks"]) == 13
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


def test_confidence_ignora_el_tren_inferior():
    """Si la cámara corta los pies, el avatar no debe congelarse entero."""
    world, image = pose_de_pie()
    for índice in (25, 26, 27, 28):
        world.landmark[índice].visibility = 0.0
    payload = motor(Resultados(world, image)).process(FRAME)
    assert payload["detected"] is True
    assert payload["confidence"] > 0.5


def test_el_filtro_amortigua_un_cambio_brusco():
    world, image = pose_de_pie()
    engine = motor(Resultados(world, image))
    primero = engine.process(FRAME)
    # Solo la nariz: desplazar todos los puntos no cambia nada, porque el
    # payload se centra en la cadera.
    world.landmark[0].x += 0.5
    segundo = engine.process(FRAME)
    # El desplazamiento filtrado es parcial: no salta los 50 cm completos.
    salto = abs(segundo["landmarks"]["nose"][0] - primero["landmarks"]["nose"][0])
    assert 0.0 < salto < 0.5


def test_sin_suavizado_el_payload_es_crudo():
    world, image = pose_de_pie()
    engine = motor(Resultados(world, image), smooth=False)
    payload = engine.process(FRAME)
    assert payload["landmarks"]["left_ankle"] == [-0.10, 0.90, 0.0]
