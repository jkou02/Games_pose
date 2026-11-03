import json

import numpy as np

from backend.schema import build_payload, empty_payload, serialize


def sample_points():
    return {
        "nose": np.array([0.0, 0.7, -0.1]),
        "left_shoulder": np.array([-0.2, 0.55, 0.0]),
        "right_shoulder": np.array([0.2, 0.55, 0.0]),
        "left_elbow": np.array([-0.6, 0.55, 0.0]),
        "right_elbow": np.array([0.6, 0.55, 0.0]),
        "left_wrist": np.array([-1.0, 0.55, 0.0]),
        "right_wrist": np.array([1.0, 0.55, 0.0]),
        "left_hip": np.array([-0.1, 0.0, 0.0]),
        "right_hip": np.array([0.1, 0.0, 0.0]),
    }


def sample_bones():
    return {
        "right_upper_arm": np.array([1.0, 0.0, 0.0]),
        "right_lower_arm": np.array([1.0, 0.0, 0.0]),
        "left_upper_arm": np.array([-1.0, 0.0, 0.0]),
        "left_lower_arm": np.array([-1.0, 0.0, 0.0]),
        "torso_up": np.array([0.0, 1.0, 0.0]),
        "head": np.array([0.0, 1.0, 0.1]),
        "torso_side": np.array([-1.0, 0.0, 0.0]),
    }


def test_payload_matches_contract_keys():
    payload = build_payload(
        sample_points(), sample_bones(), 0.92, timestamp=1730650000.123
    )
    assert set(payload) == {
        "timestamp",
        "detected",
        "confidence",
        "landmarks",
        "landmarks_2d",
        "bones",
    }
    assert payload["detected"] is True
    assert payload["confidence"] == 0.92
    assert payload["timestamp"] == 1730650000.123
    assert set(payload["landmarks"]) == set(sample_points())
    assert set(payload["bones"]) == set(sample_bones())
    assert payload["bones"]["torso_up"] == [0.0, 1.0, 0.0]


def test_empty_payload_signals_lost_tracking():
    payload = empty_payload(timestamp=1.0)
    assert payload["detected"] is False
    assert payload["confidence"] == 0.0
    assert payload["landmarks"] == {}
    assert payload["landmarks_2d"] == {}
    assert payload["bones"] == {}


def test_serialize_is_compact_and_roundtrips():
    payload = build_payload(sample_points(), sample_bones(), 0.5, timestamp=1.0)
    message = serialize(payload)
    assert " " not in message
    assert json.loads(message) == payload


def test_serialize_emits_plain_python_types():
    payload = build_payload(
        sample_points(), sample_bones(), np.float32(0.75), timestamp=1.0
    )
    message = serialize(payload)
    decoded = json.loads(message)
    assert isinstance(decoded["confidence"], float)
    assert isinstance(decoded["landmarks"]["nose"], list)
    assert isinstance(decoded["landmarks"]["nose"][0], float)


def test_landmarks_2d_se_incluyen_para_el_overlay():
    puntos_2d = {"nose": [0.5, 0.2], "left_shoulder": [0.4, 0.35]}
    payload = build_payload(
        sample_points(), sample_bones(), 0.9, timestamp=1.0, landmarks_2d=puntos_2d
    )
    assert payload["landmarks_2d"] == puntos_2d
