# Migración al frontend del compañero (Flask + Three.js) — Plan de Implementación

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el frontend Vite (`frontend/`) por la aplicación de exhibición existente (`servidor.py` + `templates/` + `static/`) y alimentarla con la pose del backend por WebSocket, eliminando MediaPipe duplicado en el navegador.

**Architecture:** El backend ya probado (`backend/`, Fases 1–2) sigue siendo el único productor de pose: captura, MediaPipe, normalización y payload JSON con `landmarks` + `bones` en espacio Three.js. El frontend deja de inferir pose y se limita a consumir ese payload, mapear los vectores `bones` a huesos Mixamo y renderizar. `servidor.py` (Flask) sirve `templates/`, `static/` y los assets del avatar.

**Tech Stack:** Python 3.10 (`flask`, `websockets`, `mediapipe`, `opencv-contrib-python`, `numpy`, `pytest`), Three.js 0.187 vendorizado en `static/vendor/` (sin CDN).

**Spec:** `AGENTS.md` (§2 arquitectura, §3 contrato, §4 coordenadas, §6 decisiones postergadas, §7 reglas de calidad) y `docs/contract.md`.

## Global Constraints

- WebSocket local en `ws://127.0.0.1:8765`, sobreescribible por flag.
- Payload con las claves exactas `timestamp`, `detected`, `confidence`, `landmarks`, `bones`.
- Transformación obligatoria `x_3d = -x_mp`, `y_3d = -y_mp`, `z_3d = -z_mp` (ya implementada; no cambiar).
- Landmarks en metros, relativos al centro de cadera. `bones` unitarios.
- **Nunca** modificar `position` de articulaciones hijas por frame (§7). El anclaje de cadera se aplica **una sola vez** al cargar el modelo.
- Sin filtros de suavizado nuevos: se conservan los factores `slerp` que ya existen en `static/js/app.js` (§6 los deja para Fase 5).
- La app debe funcionar **sin internet** (todo vendorizado).
- No se commitea ningún asset `.fbx` ni credenciales.

---

## Estado de ejecución

Ejecutado el 2026-11-03 con commits por task. Desvíos respecto del plan original,
surgidos durante la ejecución:

| Cambio | Motivo |
|---|---|
| Se conservaron `/assets/animados` y `/api/personajes` | `animados/` (17 MB) apareció en el repo con `prueba/bot.fbx`; el plan original asumía que no existía |
| `animados/` está en `.gitignore` | Decisión del usuario: no versionar 17 MB de FBX |
| El modelo se sirve desde `animados/prueba/bot.fbx`, no desde `static/models/` | Se mantienen las rutas del compañero: cero cambios en `app.js` |
| Se agregó `static/vendor/three/three.core.js` | Three 0.187 divide el build: `three.module.js` lo importa y faltaba (404 detectado en navegador) |
| `PCFSoftShadowMap` → `PCFShadowMap` | Three 0.187 eliminó `PCFSoftShadowMap` |

| Task | Commit | Verificación |
|---|---|---|
| 0 — Reorganización e higiene | `58a9dca` | 16 tests, `legacy/` creado, credenciales fuera |
| 1 — `servidor.py` | `76147b6` | 6 tests de Flask, `/assets/animados/prueba/bot.fbx` 200 |
| 2 — Vendor three | `56303ef` | 932 KB vendorizados, importmap local |
| 3 — `bones.head` | `eb98a0e` | 23 tests, contrato y AGENTS.md actualizados |
| 4 — Cliente WS | `659e3d9` | sintaxis OK, reconexión y watchdog |
| 5 — Mapeo Mixamo | `7c12877` | brazo de pantalla derecha responde a `right_upper_arm` |
| 6 — Video y overlay | `63f99c6` | panel 2D renderiza con 9 landmarks del payload |
| 7 — Documentación | `0e6fd16` | README, AGENTS.md, contract.md |
| 8 — Verificación E2E | `cd7812b` | navegador: 0 errores, 0 HTTP 4xx, avatar animado con pose sintética |

**No verificado:** el feed real de la cámara (Iriun sin stream en este entorno) y el
overlay sobre el video, que depende de eso. El mapeo de huesos se validó con un
emisor de pose sintética (`/tmp/opencode/fake_pose.py`), no commiteado.

---

## Estado de partida (verificado)

| Hecho | Evidencia |
|---|---|
| `frontend/` es el Vite planificado en `2026-11-03-mocap-fase-1-3.md` | commits `f5724fc`, `d91abca` (josuepstb) |
| `servidor.py` + `static/` + `templates/` entraron en `8ae3225 mejoras` | `git show --stat 8ae3225` |
| `flask` no está instalado ni declarado | `ModuleNotFoundError: No module named 'flask'` |
| `animados/` no existe → `bot.fbx` y `/assets/animados` dan 404 | `ls ../animados` |
| `servidor.py:14` calcula `BASE_DIR` un nivel arriba del repo | `dirname(dirname(abspath(__file__)))` |
| La app del compañero ya corre MediaPipe en el navegador y **descarta** el payload WS | `static/js/app.js:846-869` escribe `estado.poseWebSocket`, nunca se lee |
| El video y el overlay están espejados por CSS | `static/css/estilos.css:168,178` |
| Su mapeo de lados es el correcto para espejo: `usuario-derecha → mixamorigLeftArm` | `static/js/app.js:1170-1177` |
| El contrato no tiene hueso de cabeza y su app necesita cuello | `docs/contract.md`, sección "Decisiones pendientes" |
| `ReconstruccionPose.py:35` conserva `admin:placa123` en texto plano | grep del archivo |

## Decisiones ya acordadas con el usuario

| Tema | Decisión |
|---|---|
| Frontend canónico | La app de `servidor.py` + `static/` + `templates/`. |
| Fuente de pose | Backend por WebSocket. Se elimina MediaPipe del navegador. |
| `frontend/` (Vite) | Se mueve a `legacy/frontend-vite/`, no se borra. |
| Hueso de cabeza | Se agrega `bones.head` al contrato (vector hombros→nariz). |
| Modelo 3D | `static/models/bot.fbx`, servido por Flask. Debe aportarlo el usuario. |

## Estructura final

```
servidor.py                  # Flask: / y static/
templates/index.html         # sin CDN
static/css/estilos.css
static/js/app.js             # consume payload, sin MediaPipe propio
static/js/pose-source.js     # NUEVO: cliente WS + watchdog + reconexión
static/models/bot.fbx        # asset del usuario (no se versiona)
static/vendor/three/         # NUEVO: three 0.187 + addons, sin CDN
backend/                     # sin cambios de ubicación
legacy/frontend-vite/        # frontend Vite anterior (archivado)
legacy/ReconstruccionPose.py # prototipo archivado, sin credenciales
```

**Riesgos a comunicar al usuario:** el `.fbx` no está en el repo, así que la verificación visual end-to-end queda bloqueada hasta que se copie `bot.fbx` en `static/models/`. Todo lo demás es verificable con tests.

---

### Task 0: Reorganización e higiene

**Files:**
- Move: `frontend/` → `legacy/frontend-vite/`
- Move: `ReconstruccionPose.py` → `legacy/ReconstruccionPose.py`
- Modify: `.gitignore`, `requirements.txt`
- Modify: `legacy/ReconstruccionPose.py:32-38`

**Interfaces:**
- Consumes: nada.
- Produces: árbol `legacy/` con el frontend Vite archivado y el prototipo sin credenciales.

- [ ] **Step 1: Crear el directorio y mover los dos elementos**

```bash
mkdir -p legacy
git mv frontend legacy/frontend-vite
git mv ReconstruccionPose.py legacy/ReconstruccionPose.py
```

- [ ] **Step 2: Actualizar `.gitignore`**

Reemplazar el archivo completo por:

```
.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/
node_modules/
legacy/frontend-vite/dist/
static/models/*.fbx
static/models/*.glb
*.log
.DS_Store
```

- [ ] **Step 3: Agregar Flask a `requirements.txt`**

`requirements.txt` queda:

```
flask>=3.0,<4.0
mediapipe==0.10.9
numpy==1.26.4
opencv-contrib-python==4.10.0.84
protobuf==3.20.3
websockets==15.0.1
```

No se fija versión exacta de Flask para no inventar un número que pip no pueda resolver; tras instalar, se puede endurecer el pin con la versión real que reporte `pip show flask`.

- [ ] **Step 4: Eliminar las credenciales del prototipo**

En `legacy/ReconstruccionPose.py`, reemplazar el bloque:

```python
ipcam = "192.168.2.26"
url = os.getenv(
    "RTSP_URL",
    f"rtsp://admin:placa123@{ipcam}:554/snl/live/1/1",
)
cap = cv2.VideoCapture(url)
```

por:

```python
url = os.getenv("RTSP_URL")
if not url:
    raise SystemExit(
        "Definí RTSP_URL. Ejemplo:\n"
        "  RTSP_URL='rtsp://usuario:clave@192.168.2.26:554/snl/live/1/1' \\\n"
        "  .venv/bin/python legacy/ReconstruccionPose.py"
    )
cap = cv2.VideoCapture(url)
```

- [ ] **Step 5: Instalar la dependencia y verificar que nada se rompió**

Run: `.venv/bin/python -m pip install -r requirements.txt && .venv/bin/python -m pytest -q`
Expected: 16 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: archivar frontend Vite en legacy/ y quitar credenciales del prototipo"
```

---

### Task 1: `servidor.py` mínimo y funcional

**Files:**
- Modify: `servidor.py` (reescritura completa)
- Test: `tests/test_servidor.py` (nuevo)

**Interfaces:**
- Consumes: `templates/index.html`, `static/` (Flask los resuelve por `root_path` del módulo, que está en la raíz del repo).
- Produces: `app` (instancia `flask.Flask`) importable desde tests, y `main()` como entrypoint.

- [ ] **Step 1: Escribir el test que falla**

`tests/test_servidor.py`:

```python
from servidor import app


def test_index_se_sirve_desde_templates():
    response = app.test_client().get("/")
    assert response.status_code == 200
    assert "Ciencias Encuentro".encode() in response.data


def test_static_se_sirve():
    response = app.test_client().get("/static/js/app.js")
    assert response.status_code == 200


def test_no_hay_rutas_de_assets_externos():
    """Las rutas que dependían de la carpeta ../animados fueron eliminadas."""
    client = app.test_client()
    assert client.get("/api/personajes").status_code == 404
    assert client.get("/assets/animados/prueba/bot.fbx").status_code == 404
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `.venv/bin/python -m pytest tests/test_servidor.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'flask'` (o, si ya se instaló en Task 0, FAIL en la última aserción porque `/api/personajes` aún existe).

- [ ] **Step 3: Reescribir `servidor.py`**

```python
"""Servidor web de la app de exhibición «Ciencias Encuentro».

Sirve `templates/index.html`, `static/` y los modelos 3D de `static/models/`.
La pose llega por WebSocket desde `backend.main` (ws://127.0.0.1:8765).
"""

from __future__ import annotations

import threading
import webbrowser

from flask import Flask, render_template

HOST = "0.0.0.0"
PORT = 5000

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


def open_browser() -> None:
    webbrowser.open(f"http://localhost:{PORT}")


def main() -> None:
    print("=" * 60)
    print("  🎮 CIENCIAS ENCUENTRO 2026 — Muñeco 3D")
    print("=" * 60)
    print(f"  App web:      http://localhost:{PORT}")
    print("  Pose:         ws://127.0.0.1:8765  (backend.main)")
    print("  Modelo 3D:    static/models/bot.fbx")
    print("  Ctrl+C para detener")
    print("=" * 60)
    threading.Timer(1.5, open_browser).start()
    app.run(host=HOST, port=PORT, debug=False)


if __name__ == "__main__":
    main()
```

Se eliminan: `BASE_DIR`, la ruta `/assets/animados/<path>`, `NOMBRES_ANIMADOS`, `PRIORIDAD_PERSONAJES`, `nombre_bonito` y `/api/personajes`. Ninguno tiene consumidor en `templates/index.html` (verificado: no hay selector de personajes en la plantilla).

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `.venv/bin/python -m pytest tests/test_servidor.py -v`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add servidor.py tests/test_servidor.py
git commit -m "fix(servidor): rutas propias, sin carpeta externa y con tests"
```

---

### Task 2: Three.js vendorizado (offline)

**Files:**
- Create: `static/vendor/three/three.module.js`
- Create: `static/vendor/three/addons/loaders/FBXLoader.js`
- Create: `static/vendor/three/addons/controls/OrbitControls.js`
- Create: `static/vendor/three/addons/libs/fflate.module.js`
- Create: `static/vendor/three/addons/curves/NURBSCurve.js`
- Create: `static/vendor/three/addons/curves/NURBSUtils.js`
- Modify: `templates/index.html` (importmap y scripts de MediaPipe)
- Test: `tests/test_servidor.py` (agregar casos)

**Interfaces:**
- Consumes: `legacy/frontend-vite/node_modules/three@0.187.0` (ya instalado localmente).
- Produces: importmap con `"three"` y `"three/addons/"` apuntando a `/static/vendor/three/`, preservando los especificadores actuales de `app.js`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `tests/test_servidor.py`:

```python
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent

ARCHIVOS_VENDOR = [
    "/static/vendor/three/three.module.js",
    "/static/vendor/three/addons/loaders/FBXLoader.js",
    "/static/vendor/three/addons/controls/OrbitControls.js",
    "/static/vendor/three/addons/libs/fflate.module.js",
    "/static/vendor/three/addons/curves/NURBSCurve.js",
    "/static/vendor/three/addons/curves/NURBSUtils.js",
]


def test_three_esta_vendorizado_y_se_sirve():
    client = app.test_client()
    for ruta in ARCHIVOS_VENDOR:
        assert client.get(ruta).status_code == 200, ruta


def test_la_app_no_depende_de_internet():
    html = (RAIZ / "templates" / "index.html").read_text(encoding="utf-8")
    assert "cdn.jsdelivr.net" not in html
    assert "unpkg.com" not in html
    js = (RAIZ / "static" / "js" / "app.js").read_text(encoding="utf-8")
    assert "cdn.jsdelivr.net" not in js
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `.venv/bin/python -m pytest tests/test_servidor.py -v`
Expected: FAIL, `assert 404 == 200` en la primera ruta vendorizada.

- [ ] **Step 3: Copiar los archivos desde el frontend archivado**

```bash
ORIGEN=legacy/frontend-vite/node_modules/three
mkdir -p static/vendor/three/addons/loaders \
         static/vendor/three/addons/controls \
         static/vendor/three/addons/libs \
         static/vendor/three/addons/curves
cp "$ORIGEN/build/three.module.js"                       static/vendor/three/
cp "$ORIGEN/examples/jsm/loaders/FBXLoader.js"           static/vendor/three/addons/loaders/
cp "$ORIGEN/examples/jsm/controls/OrbitControls.js"      static/vendor/three/addons/controls/
cp "$ORIGEN/examples/jsm/libs/fflate.module.js"          static/vendor/three/addons/libs/
cp "$ORIGEN/examples/jsm/curves/NURBSCurve.js"           static/vendor/three/addons/curves/
cp "$ORIGEN/examples/jsm/curves/NURBSUtils.js"           static/vendor/three/addons/curves/
```

La estructura relativa importa: `FBXLoader.js` importa `'../libs/fflate.module.js'` y `'../curves/NURBSCurve.js'`, y `NURBSCurve.js` importa `'../curves/NURBSUtils.js'`. Si se aplana, el navegador da 404.

- [ ] **Step 4: Actualizar el `<head>` de `templates/index.html`**

Reemplazar el bloque `importmap` y borrar los tres `<script>` de MediaPipe del final del `<body>`. El `<head>` queda:

```html
    <link rel="stylesheet" href="/static/css/estilos.css" />
    <script type="importmap">
    {
      "imports": {
        "three": "/static/vendor/three/three.module.js",
        "three/addons/": "/static/vendor/three/addons/"
      }
    }
    </script>
```

Y el final del `<body>` queda solo con:

```html
    <script type="module" src="/static/js/app.js"></script>
```

- [ ] **Step 5: Ejecutar y ver el verde**

Run: `.venv/bin/python -m pytest tests/test_servidor.py -v`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add static/vendor templates/index.html tests/test_servidor.py
git commit -m "feat(web): vendorizar three.js y eliminar dependencias de CDN"
```

---

### Task 3: Agregar `bones.head` al contrato

**Files:**
- Modify: `backend/kinematics.py:77-86`
- Modify: `tests/test_kinematics.py`
- Modify: `tests/test_schema.py:22-28` (fixture `sample_bones`)
- Modify: `docs/contract.md`
- Modify: `AGENTS.md` (§3, ejemplo JSON y lista de huesos)

**Interfaces:**
- Consumes: `compute_bones(points)` existente.
- Produces: `bones["head"]` = vector unitario de centro de hombros → nariz. El frontend lo usa para `mixamorigNeck`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `tests/test_kinematics.py`:

```python
def test_head_bone_apunta_del_centro_de_hombros_a_la_nariz():
    points = normalize_landmarks(make_landmarks())
    bones = compute_bones(points)
    assert set(bones) == set(BONE_DEFINITIONS) | {"torso_up", "head"}
    head = bones["head"]
    assert np.linalg.norm(head) == pytest.approx(1.0, abs=1e-6)
    # La nariz está por encima del centro de hombros en el fixture
    assert head[1] > 0.5
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `.venv/bin/python -m pytest tests/test_kinematics.py::test_head_bone_apunta_del_centro_de_hombros_a_la_nariz -v`
Expected: FAIL con `KeyError: 'head'` al comparar el set.

- [ ] **Step 3: Implementar**

En `backend/kinematics.py`, dentro de `compute_bones`, después de `bones["torso_up"]`:

```python
    # Cabeza: del centro de hombros a la nariz. Necesario para rotar el cuello
    # del avatar (Mixamo `Neck`); el contrato no lo incluía en Fase 1.
    bones["head"] = unit(points["nose"] - shoulder_mid)
```

- [ ] **Step 4: Actualizar los fixtures de schema**

En `tests/test_schema.py`, `sample_bones()` agrega:

```python
        "head": np.array([0.0, 1.0, 0.1]),
```

- [ ] **Step 5: Ejecutar y ver el verde**

Run: `.venv/bin/python -m pytest -q`
Expected: PASS (17 tests o más, todos verdes).

- [ ] **Step 6: Documentar el hueso**

En `docs/contract.md`, agregar la fila a la tabla de `bones`:

```markdown
| `head` | centro de hombros | `nose` |
```

Y actualizar la sección "Decisiones pendientes antes de la Fase 4" para dejar constancia de que la decisión se tomó y el ítem quedó cerrado.

En `AGENTS.md` §3, agregar `"head": [0.0, 0.55, 0.22]` al objeto `bones` del JSON de ejemplo.

- [ ] **Step 7: Commit**

```bash
git add backend/kinematics.py tests docs AGENTS.md
git commit -m "feat(contrato): agregar hueso head para el cuello del avatar"
```

---

### Task 4: Cliente WebSocket del frontend

**Files:**
- Create: `static/js/pose-source.js`
- Modify: `static/js/app.js` (eliminar `conectarWebSocket`, usarlo desde `iniciar()`)

**Interfaces:**
- Produces: `createPoseSource({ url, onPose, onStatus, reconnectDelay })` → `{ close() }`.
  - `onPose(payload)` recibe el payload del contrato, o `{ detected: false, confidence: 0 }` cuando se pierde la señal.
  - `onStatus({ state, detail, url })` con `state` en `connecting | connected | disconnected | error`.

- [ ] **Step 1: Crear el módulo**

`static/js/pose-source.js`:

```js
const WATCHDOG_MS = 600

/**
 * Cliente del backend MoCap. Reconecta con backoff exponencial y avisa
 * `detected: false` si deja de recibir frames, para que el avatar vuelva a
 * reposo (AGENTS.md §7) en lugar de congelarse en la última pose.
 */
export function createPoseSource({
  url,
  onPose,
  onStatus,
  reconnectDelay = 1000,
} = {}) {
  let socket = null
  let closed = false
  let attempt = 0
  let watchdog = null

  const setStatus = (state, detail = '') => onStatus?.({ state, detail, url })
  const sinSenal = () => onPose?.({ detected: false, confidence: 0 })

  function connect() {
    if (closed) return
    setStatus('connecting')
    socket = new WebSocket(url)

    socket.onopen = () => {
      attempt = 0
      setStatus('connected')
    }

    socket.onmessage = (event) => {
      try {
        onPose?.(JSON.parse(event.data))
      } catch (error) {
        console.warn('Payload inválido del backend', error)
      }
      clearTimeout(watchdog)
      watchdog = setTimeout(sinSenal, WATCHDOG_MS)
    }

    socket.onerror = () => {
      setStatus('error')
      clearTimeout(watchdog)
      sinSenal()
    }

    socket.onclose = () => {
      clearTimeout(watchdog)
      sinSenal()
      if (closed) return
      attempt = Math.min(attempt + 1, 8)
      setStatus('disconnected')
      setTimeout(connect, Math.min(reconnectDelay * 2 ** (attempt - 1), 8000))
    }
  }

  connect()

  return {
    close() {
      closed = true
      clearTimeout(watchdog)
      socket?.close()
    },
  }
}
```

- [ ] **Step 2: Borrar el cliente viejo de `app.js`**

Eliminar la función `conectarWebSocket()` completa (`static/js/app.js:846-869`) y las propiedades `estado.wsConectado` y `estado.poseWebSocket`.

- [ ] **Step 3: Conectarlo en `iniciar()`**

Al inicio de `static/js/app.js`, agregar el import:

```js
import { createPoseSource } from '/static/js/pose-source.js'
```

Reemplazar la llamada `conectarWebSocket()` de `iniciar()` por:

```js
const fuentePose = createPoseSource({
  // Mismo host que sirvió la página: funciona en LAN sin tocar el código.
  url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8765`,
  onPose: (payload) => {
    estado.ultimaPose = payload
  },
  onStatus: ({ state }) => {
    const etiqueta = {
      connecting: '○ conectando',
      connected: '● conectado',
      disconnected: '○ sin backend',
      error: '× error',
    }
    estado.estadoConexion = state
    console.info('MoCap:', etiqueta[state] ?? state)
  },
})
```

Agregar al objeto `estado`: `ultimaPose: null` y `estadoConexion: 'connecting'`, y quitar `poseActual` y `poseWebSocket`.

- [ ] **Step 4: Verificar sintaxis de los módulos**

Run: `node --input-type=module --check < static/js/app.js && node --input-type=module --check < static/js/pose-source.js`
Expected: sin salida (sintaxis válida).

- [ ] **Step 5: Commit**

```bash
git add static/js/pose-source.js static/js/app.js
git commit -m "feat(web): consumir la pose del backend por WebSocket con watchdog"
```

---

### Task 5: Mapear `bones` a huesos Mixamo

**Files:**
- Modify: `static/js/app.js:930-1240` (bloque 3D)

**Interfaces:**
- Consumes: `estado.ultimaPose` (Task 4), `estado.huesos3d`, `estado.restWorldDirs`, `estado.restWorldQuats`, `orientarHueso`.
- Produces: `aplicarPose3D(payload)`, `anclarPiernas()`, `volverAReposo()`.

**Regla de lados (no cambiar):** el backend ya espejó X (`docs/contract.md`), y el video también está espejado por CSS. Por eso el brazo que el público ve a la derecha (`bones.right_*`) mueve el hueso **izquierdo** del avatar, que es el que se dibuja a la derecha de la pantalla. Es la misma convención que ya usaba `app.js:1170-1177`.

- [ ] **Step 1: Registrar los segmentos con las claves del contrato**

En `iniciarThreeJS()`, reemplazar el bloque de seis `registrarSegmento(...)` por:

```js
            // Clave del payload -> (hueso, hijo) del rig Mixamo.
            // El swap de lados es intencional: ver docs/contract.md §espejo.
            registrarSegmento('torso_up', 'mixamorigSpine', 'mixamorigSpine2')
            registrarSegmento('head', 'mixamorigNeck', 'mixamorigHead')
            registrarSegmento('right_upper_arm', 'mixamorigLeftArm', 'mixamorigLeftForeArm')
            registrarSegmento('right_lower_arm', 'mixamorigLeftForeArm', 'mixamorigLeftHand')
            registrarSegmento('left_upper_arm', 'mixamorigRightArm', 'mixamorigRightForeArm')
            registrarSegmento('left_lower_arm', 'mixamorigRightForeArm', 'mixamorigRightHand')
```

- [ ] **Step 2: Reemplazar `actualizarMuñeco3D` por la versión basada en el payload**

Borrar `actualizarMuñeco3D` completa (líneas 1132-1230) y su helper local `dirVec`, y agregar:

```js
const MAPA_HUESOS = [
  { clave: 'torso_up', hueso: 'mixamorigSpine', suavizado: 0.22 },
  { clave: 'head', hueso: 'mixamorigNeck', suavizado: 0.28 },
  { clave: 'right_upper_arm', hueso: 'mixamorigLeftArm', suavizado: 0.35 },
  { clave: 'right_lower_arm', hueso: 'mixamorigLeftForeArm', suavizado: 0.35 },
  { clave: 'left_upper_arm', hueso: 'mixamorigRightArm', suavizado: 0.35 },
  { clave: 'left_lower_arm', hueso: 'mixamorigRightForeArm', suavizado: 0.35 },
]

function aplicarPose3D(payload) {
  if (!estado.modelo3d || estado.cargando3d) return

  const aviso = document.getElementById('aviso-sin-pose')
  const bones = payload?.bones ?? {}
  // Un frame con todos los vectores en cero significa tracking perdido.
  const valido = payload?.detected && (bones.torso_up ?? []).some((v) => v !== 0)

  if (valido) {
    aviso?.classList.add('oculto')
    for (const { clave, hueso, suavizado } of MAPA_HUESOS) {
      const dir = bones[clave]
      if (!dir || dir.every((v) => v === 0)) continue
      orientarHueso(
        estado.huesos3d[hueso],
        estado.restWorldDirs[clave],
        estado.restWorldQuats[clave],
        new THREE.Vector3(dir[0], dir[1], dir[2]),
        suavizado,
      )
      estado.modelo3d.updateMatrixWorld(true)
    }
  } else {
    if (aviso && estado.vistaActual === '3d') aviso.classList.remove('oculto')
    volverAReposo()
  }

  anclarPiernas()
}

function volverAReposo() {
  const t = performance.now() * 0.002
  for (const [bone, restQ] of estado.restLocalQuats.entries()) {
    if (bone === estado.huesos3d['mixamorigSpine']) {
      const breathQ = restQ.clone()
      breathQ.x += Math.sin(t * 1.6) * 0.015
      bone.quaternion.slerp(breathQ, 0.08)
    } else if (!estado.huesosPiernas.includes(bone) && bone !== estado.huesoCadera) {
      bone.quaternion.slerp(restQ, 0.08)
    }
  }
}

function anclarPiernas() {
  // §6: el avatar queda fijo de la cadera hacia abajo. La cadera se fija una
  // sola vez al cargar el modelo; acá sólo se congelan las piernas.
  for (const leg of estado.huesosPiernas) {
    const q = estado.restLocalQuats.get(leg)
    if (q) leg.quaternion.copy(q)
  }
}
```

- [ ] **Step 3: Mover el anclaje de cadera al cargador (una sola vez)**

En el callback de `loader.load(...)`, después de calcular `estado.huesoCadera`, agregar:

```js
            // §7: se fija una única vez, nunca por frame.
            if (estado.huesoCadera) {
              estado.huesoCadera.position.set(0, 104.27, 1.55)
            }
```

y **eliminar** el bloque que hacía `estado.huesoCadera.position.set(0, 104.27, 1.55)` en cada frame (último bloque de la función vieja).

- [ ] **Step 4: Actualizar el bucle de animación**

En `loopAnimacion()`, reemplazar `actualizarMuñeco3D(estado.poseActual)` por:

```js
        aplicarPose3D(estado.ultimaPose)
```

- [ ] **Step 5: Avisar si el rig no es Mixamo**

Al final de `registrarSegmento`, agregar la advertencia (el `return` temprano actual falla en silencio):

```js
    if (!b || !c) {
        console.warn(`Rig incompleto: faltan ${boneName} o ${childName}`)
        return
    }
```

- [ ] **Step 6: Verificar sintaxis**

Run: `node --input-type=module --check < static/js/app.js`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add static/js/app.js
git commit -m "feat(web): mapear bones del contrato a huesos Mixamo"
```

---

### Task 6: Cámara local y panel de landmarks desde el payload

**Files:**
- Modify: `static/js/app.js` (`iniciarMediaPipe`, `renderizarEspacioLandmarks`, `dibujarOverlayCamara`)

**Interfaces:**
- Consumes: `estado.ultimaPose` (Task 4), `extraerLandmarksCompletos(landmarks, w, h, espejo)` existente.
- Produces: `iniciarVideoLocal()`, `payloadALandmarks2D(payload)`, `dibujarOverlayPayload(ctx, payload, w, h)`.

MediaPipe en el navegador se elimina: con el backend como fuente, la cámara local sólo se usa como preview. `getUserMedia` requiere contexto seguro (`localhost` o HTTPS); si falla, se muestra un aviso y el avatar sigue funcionando.

- [ ] **Step 1: Reemplazar `iniciarMediaPipe` por `iniciarVideoLocal`**

```js
const ESCALA_VISTA = 1.4 // metros que cubre el alto del encuadre del panel

function payloadALandmarks2D(payload) {
  if (!payload?.detected) return null
  const INDICE = {
    nose: 0,
    left_shoulder: 11,
    right_shoulder: 12,
    left_elbow: 13,
    right_elbow: 14,
    left_wrist: 15,
    right_wrist: 16,
    left_hip: 23,
    right_hip: 24,
  }
  const salida = new Array(33).fill(null)
  for (const [clave, idx] of Object.entries(INDICE)) {
    const p = payload.landmarks?.[clave]
    if (!p) continue
    salida[idx] = {
      // Ya viene espejado en X desde el backend: se proyecta sin invertir.
      x: 0.5 + p[0] / (2 * ESCALA_VISTA),
      y: 0.5 - p[1] / (2 * ESCALA_VISTA),
      z: p[2],
      visibility: payload.confidence ?? 1,
    }
  }
  return salida
}

function iniciarVideoLocal() {
  const video = document.getElementById('video-entrada')
  if (!video) return
  if (!navigator.mediaDevices?.getUserMedia) {
    console.info('Cámara local no disponible: se requiere localhost o HTTPS.')
    return
  }
  navigator.mediaDevices
    .getUserMedia({ video: { width: 640, height: 480 } })
    .then((stream) => {
      video.srcObject = stream
      return video.play()
    })
    .catch(() => {
      console.info('Cámara local bloqueada; el avatar sigue funcionando.')
    })
}
```

- [ ] **Step 2: Dibujar el overlay de la cámara con los 9 puntos**

Reemplazar la función `dibujarOverlayCamara` por:

```js
const CONEXIONES = [
  ['nose', 'left_shoulder'],
  ['nose', 'right_shoulder'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_hip', 'right_hip'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
]

function dibujarOverlayPayload(ctx, payload, w, h) {
  const lm = payloadALandmarks2D(payload)
  if (!lm) return
  // El canvas está espejado por CSS (#canvas-pose), así que se invierte X
  // para que el esqueleto caiga sobre el cuerpo del video.
  const punto = (idx) => (lm[idx] ? { x: (1 - lm[idx].x) * w, y: lm[idx].y * h } : null)

  const paleta = PALETAS[estado.estiloActual] || PALETAS.neon
  ctx.lineWidth = 4
  ctx.strokeStyle = paleta.brazoDer || '#00F0FF'
  for (const [a, b] of CONEXIONES) {
    const pa = punto(INDICE_OVERLAY[a])
    const pb = punto(INDICE_OVERLAY[b])
    if (!pa || !pb) continue
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
    ctx.stroke()
  }
  ctx.fillStyle = paleta.articulacion || '#FFFFFF'
  for (const idx of Object.values(INDICE_OVERLAY)) {
    const p = punto(idx)
    if (!p) continue
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
}
```

Definir junto a `payloadALandmarks2D`:

```js
const INDICE_OVERLAY = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
}
```

- [ ] **Step 3: Enchufar el overlay al loop**

En `loopAnimacion()`, antes del render 3D:

```js
  const canvasPose = document.getElementById('canvas-pose')
  if (canvasPose) {
    const video = document.getElementById('video-entrada')
    if (canvasPose.width !== video?.videoWidth) canvasPose.width = video?.videoWidth || 0
    if (canvasPose.height !== video?.videoHeight) canvasPose.height = video?.videoHeight || 0
    const ctx = canvasPose.getContext('2d')
    ctx.clearRect(0, 0, canvasPose.width, canvasPose.height)
    dibujarOverlayPayload(ctx, estado.ultimaPose, canvasPose.width, canvasPose.height)
  }
```

- [ ] **Step 4: Alimentar el panel de landmarks 2D desde el payload**

En `renderizarEspacioLandmarks`, reemplazar `estado.poseActual` por `payloadALandmarks2D(estado.ultimaPose)` y pasar `espejo = false`, porque la X ya viene espejada:

```js
    const P = extraerLandmarksCompletos(payloadALandmarks2D(estado.ultimaPose), w, h, false)
```

- [ ] **Step 5: Arrancar la cámara local en `iniciar()`**

Reemplazar `iniciarMediaPipe()` por `iniciarVideoLocal()`.

- [ ] **Step 6: Verificar que no queda MediaPipe en el frontend**

Run: `grep -rn "MediaPipe\|new Pose(\|Camera(" static/ templates/ || echo "sin restos"`
Expected: `sin restos`.

- [ ] **Step 7: Verificar sintaxis**

Run: `node --input-type=module --check < static/js/app.js`
Expected: sin salida.

- [ ] **Step 8: Commit**

```bash
git add static/js/app.js
git commit -m "feat(web): preview de cámara y overlay de landmarks desde el payload"
```

---

### Task 7: Documentación de la nueva arquitectura

**Files:**
- Modify: `README.md` (reescritura)
- Modify: `docs/contract.md` (nota de consumidor)
- Modify: `AGENTS.md` §2 (frontend sin Vite) y §5 (estado de fases)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: instrucciones reproducibles de instalación, ejecución y verificación.

- [ ] **Step 1: Reescribir `README.md`**

Contenido mínimo obligatorio (sin inventar comandos que no existan):

```markdown
# Ciencias Encuentro 2026 — MoCap Avatar 3D

Captura de movimiento con MediaPipe en Python que anima un avatar 3D en el
navegador. Backend productor (WebSocket) + app web Flask con Three.js.

## Requisitos
- Python 3.10+, Node no requerido en ejecución.
- Cámara web o URL RTSP.

## Instalación
```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

## Ejecución
```bash
# 1. Backend de pose (deja el WebSocket en ws://127.0.0.1:8765)
.venv/bin/python -m backend.main --source 0

# 2. App web (http://localhost:5000)
.venv/bin/python servidor.py
```

Para acceder desde otra máquina de la LAN:
```bash
.venv/bin/python -m backend.main --source 0 --host 0.0.0.0
```
El video de la cámara local del navegador sólo se muestra en `localhost` o HTTPS;
el avatar funciona igual desde cualquier cliente.

## Modelo 3D
Copiar el rig Mixamo:
```bash
mkdir -p static/models
cp mi-modelo.fbx static/models/bot.fbx
```

## Verificación
```bash
.venv/bin/python -m pytest -q
```

## Estructura
[tabla con servidor.py, static/js, static/vendor, backend/, tests/, legacy/]
```

- [ ] **Step 2: Nota de consumidor en `docs/contract.md`**

Agregar al final:

```markdown
## Consumidor actual

`static/js/app.js` mapea `bones` a huesos Mixamo con swap de lados deliberado
(`right_*` → `mixamorigLeft*`), porque tanto el backend como el video están
espejados. Cualquier cliente nuevo debe respetar esa convención o mostrará el
avatar invertido.
```

- [ ] **Step 3: Actualizar `AGENTS.md`**

- §2: reemplazar la línea de Frontend por: `Frontend: Flask + Three.js (vanilla ES modules, three vendorizado en static/vendor/)`.
- §5: marcar Fase 4 como implementada y agregar que el frontend base es `static/js/app.js`.

- [ ] **Step 4: Verificar que los tests siguen verdes**

Run: `.venv/bin/python -m pytest -q`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/contract.md AGENTS.md
git commit -m "docs: documentar la arquitectura Flask + backend WebSocket"
```

---

### Task 8: Verificación end-to-end manual

**Files:** ninguno (verificación).

**Interfaces:**
- Consumes: todo.
- Produces: evidencia para el usuario.

- [ ] **Step 1: Backend arriba**

Run: `.venv/bin/python -m backend.main --source 0 --log-level DEBUG`
Expected: `Escuchando en ws://127.0.0.1:8765` y luego líneas de FPS.

- [ ] **Step 2: App web arriba**

Run: `.venv/bin/python servidor.py`
Expected: `http://localhost:5000` responde 200 y abre el navegador.

- [ ] **Step 3: Comprobar la consola del navegador**

Expected:
- `MoCap: ● conectado`
- Sin errores 404 de `static/vendor/` ni de `static/models/bot.fbx`.
- Presente el rig, el avatar sigue brazos, cuello y torso.
- Al tapar la cámara: `aviso-sin-pose` visible y el avatar vuelve a reposo suave.
- Al matar el backend: `○ sin backend`, el avatar vuelve a reposo y reconecta al reiniciarlo.

- [ ] **Step 4: Reportar resultados**

Si algo falla por falta de `bot.fbx`, informar al usuario que el bloqueo es el asset, no el código.

---

## Self-review

**Cobertura del spec:**
- Frontend único (§2) → Tasks 0, 1.
- Contrato con `head` (§3) → Task 3.
- Coordenadas y espejo (§4) → Task 5 Step 1-2, documentado en Task 7.
- Fase 4: mapeo de huesos del tren superior (incluye cabeza, que §5 pide) → Task 5.
- Fase 5: suavizado y PiP → explícitamente fuera de alcance; se conservan los `slerp` existentes y se documenta.
- Sin modificar `position` por frame (§7) → Task 5 Step 3.
- Resiliencia ante pérdida de tracking (§7) → Task 4 (watchdog) y Task 5 (`volverAReposo`).
- Latencia (§7) → sin inferencia en el cliente; el navegador sólo aplica rotaciones.

**Placeholders:** no quedan TBD; todos los pasos con código lo incluyen. Los valores `104.27`/`1.55` se conservan de la app original porque dependen de la escala del FBX.

**Consistencia de nombres:** `estado.ultimaPose` (Task 4) es el nombre usado en Tasks 5 y 6; `aplicarPose3D`, `volverAReposo`, `anclarPiernas`, `payloadALandmarks2D`, `dibujarOverlayPayload`, `INDICE_OVERLAY`, `createPoseSource` se usan con el mismo nombre en todos los pasos.

**Riesgo abierto:** el `.fbx` no está en el repo. Sin él, Tasks 5 y 6 no se pueden verificar visualmente. Se debe avisar antes de empezar.

## Correcciones posteriores (reporte del usuario)

| Síntoma | Causa verificada | Corrección |
|---|---|---|
| El torso no se movía aunque los brazos sí | `bones` solo llevaba `torso_up`, un vector vertical que no distingue el giro alrededor de su eje. Girar los hombros sin inclinarse no cambiaba el vector. | Se agregó `bones.torso_side` y el cliente reconstruye una base ortonormal (inclinación + giro) para `mixamorigSpine`. |
| El esqueleto no se ajustaba al cuerpo en el video | El overlay deducía la posición en pantalla desde metros con una escala fija (`ESCALA_VISTA`), que depende de la distancia y el FOV de la cámara. | El backend emite `landmarks_2d` (coordenadas normalizadas de imagen) y el overlay las usa directamente. |

Verificación: con el emisor sintético, `torso_side [-0.98, 0, 0.20]` produce hombros
del modelo `[0.974, 0, -0.228]` (espejo exacto) y el giro es visible en pantalla.
