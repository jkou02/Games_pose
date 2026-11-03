import numpy as np
import pytest

from backend.kinematics import (
    BONE_DEFINITIONS,
    LANDMARK_KEYS,
    compute_bones,
    normalize_landmarks,
    to_list,
    unit,
)


def make_landmarks():
    """33 landmarks sintéticos: persona de 1.80 m en pose T."""
    lm = [(0.0, 0.0, 0.0) for _ in range(33)]
    lm[0] = (0.0, -0.72, 0.10)  # nose
    lm[11] = (0.20, -0.55, 0.0)  # left_shoulder
    lm[12] = (-0.20, -0.55, 0.0)  # right_shoulder
    lm[13] = (0.60, -0.55, 0.0)  # left_elbow
    lm[14] = (-0.60, -0.55, 0.0)  # right_elbow
    lm[15] = (1.00, -0.55, 0.0)  # left_wrist
    lm[16] = (-1.00, -0.55, 0.0)  # right_wrist
    lm[23] = (0.10, 0.0, 0.0)  # left_hip
    lm[24] = (-0.10, 0.0, 0.0)  # right_hip
    return lm


def test_contract_keys_are_the_documented_ones():
    assert set(LANDMARK_KEYS.values()) == {
        "nose",
        "left_shoulder",
        "right_shoulder",
        "left_elbow",
        "right_elbow",
        "left_wrist",
        "right_wrist",
        "left_hip",
        "right_hip",
        "left_knee",
        "right_knee",
        "left_ankle",
        "right_ankle",
    }
    assert set(BONE_DEFINITIONS) == {
        "right_upper_arm",
        "right_lower_arm",
        "left_upper_arm",
        "left_lower_arm",
    }


def test_transform_flips_all_three_axes():
    points = normalize_landmarks(make_landmarks())
    # izquierda del sujeto (+x en MediaPipe) queda en -x en Three.js
    assert points["left_shoulder"][0] < 0
    assert points["right_shoulder"][0] > 0
    # eje Y invertido: hombros por encima de la cadera (y positivo)
    assert points["left_shoulder"][1] > 0
    assert points["nose"][2] == pytest.approx(-0.10, abs=1e-6)


def test_hip_center_is_origin():
    points = normalize_landmarks(make_landmarks())
    hip_mid = (points["left_hip"] + points["right_hip"]) / 2.0
    assert np.allclose(hip_mid, 0.0, atol=1e-6)
    # la cadera izquierda conserva separación de 0.20 m respecto a la derecha
    assert np.linalg.norm(points["left_hip"] - points["right_hip"]) == pytest.approx(
        0.20, abs=1e-6
    )


def test_bones_are_unit_vectors_with_expected_direction():
    points = normalize_landmarks(make_landmarks())
    bones = compute_bones(points)
    for name, vec in bones.items():
        assert np.linalg.norm(vec) == pytest.approx(1.0, abs=1e-6), name
    # torso_up apunta hacia arriba en el espacio Three.js
    assert bones["torso_up"][1] == pytest.approx(1.0, abs=1e-6)
    # brazo derecho extendido hacia +x (derecha del sujeto -> derecha de pantalla)
    assert bones["right_upper_arm"][0] == pytest.approx(1.0, abs=1e-6)


def test_head_bone_apunta_del_centro_de_hombros_a_la_nariz():
    points = normalize_landmarks(make_landmarks())
    bones = compute_bones(points)
    assert set(bones) == set(BONE_DEFINITIONS) | {
        "torso_up",
        "torso_side",
        "hips_side",
        "head",
    }
    head = bones["head"]
    assert np.linalg.norm(head) == pytest.approx(1.0, abs=1e-6)
    # La nariz está por encima del centro de hombros en el fixture
    assert head[1] > 0.5


def test_unit_handles_zero_vector_without_nan():
    vec = unit(np.zeros(3))
    assert np.allclose(vec, 0.0)
    assert not np.isnan(vec).any()


def test_to_list_rounds_to_four_decimals():
    assert to_list(np.array([0.123456, -1.0, 0.0])) == [0.1235, -1.0, 0.0]


def test_torso_side_apunta_del_hombro_derecho_al_izquierdo():
    points = normalize_landmarks(make_landmarks())
    bones = compute_bones(points)
    side = bones["torso_side"]
    assert np.linalg.norm(side) == pytest.approx(1.0, abs=1e-6)
    # El payload ya está espejado: el hombro izquierdo del sujeto queda en -X.
    assert side[0] == pytest.approx(-1.0, abs=1e-6)


def test_hips_side_apunta_de_la_cadera_derecha_a_la_izquierda():
    points = normalize_landmarks(make_landmarks())
    bones = compute_bones(points)
    assert np.linalg.norm(bones["hips_side"]) == pytest.approx(1.0, abs=1e-6)
    # El payload ya está espejado: la cadera izquierda del sujeto queda en -X.
    assert bones["hips_side"][0] == pytest.approx(-1.0, abs=1e-6)


def test_landmarks_incluyen_el_tren_inferior():
    assert {"left_knee", "right_knee", "left_ankle", "right_ankle"} <= set(
        LANDMARK_KEYS.values()
    )
    assert len(LANDMARK_KEYS) == 13
