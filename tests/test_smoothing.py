import numpy as np
import pytest

from backend.smoothing import OneEuroFilter, PoseSmoother


def test_primer_valor_pasa_sin_filtrar():
    f = OneEuroFilter()
    assert f.filter(5.0, 0.0) == 5.0


def test_reduce_el_ruido_de_una_senal_quieta():
    rng = np.random.default_rng(0)
    ruido = 1.0 + rng.normal(0, 0.05, 200)
    f = OneEuroFilter()
    salida = [f.filter(float(v), i / 30) for i, v in enumerate(ruido)]
    assert np.std(salida[30:]) < np.std(ruido[30:]) * 0.5


def test_es_independiente_de_los_fps():
    def correr(fps: int) -> float:
        f = OneEuroFilter()
        salida = 0.0
        for i in range(fps):
            t = i / fps
            salida = f.filter(1.0 if t < 1.0 else 2.0, t)
        return salida

    assert correr(30) == pytest.approx(correr(60), abs=0.2)


def test_reset_olvida_el_historial():
    f = OneEuroFilter()
    for i in range(30):
        f.filter(1.0, i / 30)
    f.reset()
    assert f.filter(10.0, 2.0) == 10.0


def test_dt_nulo_no_rompe():
    f = OneEuroFilter()
    f.filter(1.0, 0.0)
    assert f.filter(2.0, 0.0) == 1.0


def test_los_grupos_no_comparten_estado():
    s = PoseSmoother()
    s.apply("3d", {"nose": np.array([0.0, 0.0, 0.0])}, 0.0)
    salida = s.apply("2d", {"nose": np.array([0.9, 0.9])}, 0.0)
    assert list(salida["nose"]) == [0.9, 0.9]


def test_amortigua_un_salto_brusco():
    s = PoseSmoother()
    s.apply("3d", {"nose": np.zeros(3)}, 0.0)
    salida = s.apply("3d", {"nose": np.array([1.0, 0.0, 0.0])}, 1 / 30)
    assert 0.0 < salida["nose"][0] < 1.0
