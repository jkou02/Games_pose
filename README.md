# Ciencias Encuentro 2026 — MoCap Avatar 3D

Captura de movimiento *markerless* con MediaPipe que anima un avatar 3D en el
navegador. El backend captura video, extrae la pose y la difunde por WebSocket; la
app web (Flask + Three.js) consume esa pose y mueve el muñeco en tiempo real.

## Estado actual

| Fase | Descripción | Estado |
|---|---|---|
| 1 | Captura y normalización de landmarks | ✅ |
| 2 | Servidor de difusión WebSocket | ✅ |
| 3 | Escena base y conexión | ✅ |
| 4 | Mapeo de huesos y cinemática | ✅ tren superior |
| 5 | Suavizado y PiP de video | ⏳ pendiente |

La pose se calcula **solo en el backend**. El navegador no infiere nada: recibe
`landmarks` y `bones` ya normalizados y aplica rotaciones a los huesos del avatar.

## Requisitos

- Python 3.10+
- Cámara web accesible, o una URL RTSP
- Node **no** es necesario para ejecutar (solo si querés reconstruir el frontend
  archivado en `legacy/`)

## Instalación

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

`requirements.txt` fija `mediapipe==0.10.9` con `numpy==1.26.4` y
`opencv-contrib-python==4.10.0.84`. La combinación es obligatoria: las versiones
nuevas de OpenCV exigen `numpy>=2`, que es incompatible con MediaPipe.

## Modelos 3D

Los `.fbx` de `animados/` **no se versionan** (pesan ~17 MB). Hay que copiarlos
en la raíz del proyecto:

```
animados/
  prueba/bot.fbx          # personaje por defecto
  Steve by Quaternius .../
  ...
```

Sin esa carpeta la app muestra el error de carga del modelo, pero el backend y
los tests funcionan igual.

## Ejecución

### 1. Backend de pose

```bash
.venv/bin/python -m backend.main --source 0
```

Queda escuchando en `ws://127.0.0.1:8765`.

| Flag | Default | Uso |
|---|---|---|
| `--source` | `0` | Índice de cámara, ruta de archivo o URL RTSP |
| `--host` | `127.0.0.1` | Interfaz de escucha (`0.0.0.0` para LAN) |
| `--port` | `8765` | Puerto WebSocket |
| `--width` / `--height` | `1280` / `720` | Resolución solicitada a la cámara |
| `--max-fps` | `60` | Tope de difusión por segundo |
| `--model-complexity` | `1` | `0` = lite (más rápido), `2` = heavy (más preciso) |
| `--min-confidence` | `0.5` | Debajo de esto se emite `detected: false` |
| `--no-smooth` | — | Desactiva el filtro de suavizado |
| `--min-cutoff` | `1.0` | Hz de corte en reposo (más bajo = más suave y con más lag) |
| `--beta` | `0.05` | Cuánto se abre el filtro al moverse |
| `--d-cutoff` | `1.0` | Hz del estimador de velocidad |

### 2. App web

```bash
.venv/bin/python servidor.py
```

Abre `http://localhost:5000`.

### 3. Exhibición en LAN

El avatar funciona desde cualquier máquina de la red. El backend tiene que
escuchar fuera de loopback y el navegador del cliente apunta al mismo host que
sirvió la página:

```bash
.venv/bin/python -m backend.main --source 0 --host 0.0.0.0
```

Limitación: el panel de video en vivo usa `getUserMedia`, que el navegador solo
permite en `localhost` o HTTPS. Desde otra máquina por IP de LAN el video no se
muestra, pero el avatar sí se mueve.

## Verificación

```bash
.venv/bin/python -m pytest -q
```

24 tests: transformación de coordenadas, contrato JSON, parseo de fuente de video,
broadcast WebSocket, rutas de Flask y ausencia de dependencias de CDN. Ninguno
requiere cámara ni GPU.

## Estructura

```
servidor.py            # Flask: plantilla, estáticos y modelos
templates/index.html   # UI de exhibición (importmap local)
static/js/app.js       # escena, mapeo a Mixamo y HUD
static/js/pose-source.js  # cliente WebSocket con watchdog y reconexión
static/vendor/three/   # three 0.187 + FBXLoader + OrbitControls (offline)
backend/
  kinematics.py        # MediaPipe -> Three.js y vectores óseos
  schema.py            # payload JSON y serialización compacta
  capture.py           # cv2.VideoCapture configurable
  pose_engine.py       # MediaPipe Pose -> payload
  server.py            # broadcast WebSocket tolerante a clientes lentos
  main.py              # CLI y loop asíncrono
tests/
legacy/
  frontend-vite/       # frontend Vite anterior (archivado)
  ReconstruccionPose.py  # prototipo original con Matplotlib
docs/contract.md       # contrato de datos
```

## Limitaciones conocidas

- Piernas y cadera fijas: el avatar no camina ni se desplaza (`AGENTS.md` §6).
- Sin parámetros de suavizado acordados: se usan los `slerp` heredados (Fase 5).
- Sin manos ni rostro.
- El panel de video requiere `localhost` o HTTPS.
- Si `/dev/video0` está ocupado o sin stream (por ejemplo Iriun sin transmitir), el
  backend falla con `No se pudo abrir la fuente de video`. Verificar con
  `v4l2-ctl --list-devices`.
