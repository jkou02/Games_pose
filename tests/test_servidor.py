import pathlib

import pytest

from servidor import ANIMADOS_DIR, BASE_DIR, app

RUTA_MODELO = "prueba/bot.fbx"


def test_index_se_sirve_desde_templates():
    response = app.test_client().get("/")
    assert response.status_code == 200
    assert b"Ciencias Encuentro" in response.data


def test_static_se_sirve():
    assert app.test_client().get("/static/js/app.js").status_code == 200


def test_base_dir_es_la_raiz_del_repo():
    """Regresión: antes apuntaba un nivel arriba y los FBX daban 404."""
    assert (BASE_DIR / "servidor.py").is_file()
    assert ANIMADOS_DIR == BASE_DIR / "animados"


@pytest.mark.skipif(
    not (ANIMADOS_DIR / RUTA_MODELO).is_file(),
    reason="falta animados/ en esta máquina (no se versiona)",
)
def test_modelo_se_sirve_desde_animados():
    response = app.test_client().get(f"/assets/animados/{RUTA_MODELO}")
    assert response.status_code == 200


@pytest.mark.skipif(not ANIMADOS_DIR.is_dir(), reason="falta animados/")
def test_listado_de_personajes_incluye_el_bot():
    data = app.test_client().get("/api/personajes").get_json()
    assert data
    ids = {personaje["id"] for personaje in data}
    assert "animados_prueba" in ids
    assert all(
        personaje["modelo"].startswith("/assets/animados/") for personaje in data
    )


def test_static_vendor_se_sirve():
    vendor = (
        pathlib.Path(__file__).resolve().parent.parent / "static" / "vendor" / "three"
    )
    if not (vendor / "three.module.js").is_file():
        pytest.skip("vendor todavía no generado")
    assert (
        app.test_client().get("/static/vendor/three/three.module.js").status_code == 200
    )


def test_la_app_no_depende_de_internet():
    raiz = pathlib.Path(__file__).resolve().parent.parent
    for archivo in (
        "templates/index.html",
        "static/js/app.js",
        "static/js/pose-source.js",
    ):
        texto = (raiz / archivo).read_text(encoding="utf-8")
        for dominio in ("cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com"):
            assert dominio not in texto, f"{dominio} aparece en {archivo}"
