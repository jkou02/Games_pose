# MoCap Avatar 3D en Tiempo Real

Captura de movimiento *markerless* con MediaPipe que anima un avatar 3D en el
navegador. El backend captura video, extrae la pose y la difunde por WebSocket; el
frontend renderiza la escena con Three.js.

## Estado actual

| Fase | Descripción | Estado |
|---|---|---|
| 1 | Captura y normalización de landmarks | ✅ |
| 2 | Servidor de difusión WebSocket | ✅ |
| 3 | Escena base y conexión | ✅ |
| 4 | Mapeo de huesos y cinemática | ⏳ pendiente |
| 5 | Suavizado y PiP de video | ⏳ pendiente |

En la Fase 3 el frontend muestra la escena, un avatar **placeholder** (maniquí de
cajas) y el estado de conexión. Los landmarks llegan al navegador pero todavía no
se aplican al avatar: eso corresponde a la Fase 4.

## Requisitos

- Python 3.10+
- Node 20+ (probado con Node 24)
- Cámara web accesible, o una URL RTSP

## Instalación

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt

cd frontend
npm install
```

`requirements.txt` fija `mediapipe==0.10.9` con `numpy==1.26.4` y
`opencv-contrib-python==4.10.0.84`. La combinación es obligatoria: las versiones
nuevas de OpenCV exigen `numpy>=2`, que es incompatible con MediaPipe.

## Ejecución

### 1. Backend

Webcam local:

```bash
.venv/bin/python -m backend.main --source 0
```

Cámara IP RTSP:

```bash
.venv/bin/python -m backend.main --source "rtsp://usuario:clave@192.168.2.26:554/snl/live/1/1"
```

Queda escuchando en `ws://127.0.0.1:8765`.

Opciones útiles:

| Flag | Default | Uso |
|---|---|---|
| `--source` | `0` | Índice de cámara, ruta de archivo o URL RTSP |
| `--port` | `8765` | Puerto WebSocket |
| `--width` / `--height` | `1280` / `720` | Resolución solicitada a la cámara |
| `--max-fps` | `60` | Tope de difusión por segundo |
| `--model-complexity` | `1` | `0` = lite (más rápido), `2` = heavy (más preciso) |
| `--min-confidence` | `0.5` | Debajo de esto se emite `detected: false` |
| `--log-level` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

### 2. Frontend

Desarrollo:

```bash
cd frontend
npm run dev
```

Abrir `http://127.0.0.1:5173`.

Build para exhibición (no requiere internet, sirve archivos estáticos):

```bash
cd frontend
npm run build
npm run preview
```

### 3. Avatar real

El frontend busca `frontend/public/models/avatar.glb`. Si el archivo no existe usa
el maniquí de prueba y lo informa por consola. Para reemplazarlo:

```bash
cp mi-avatar.glb frontend/public/models/avatar.glb
```

El modelo debe ser un `.glb`/`.gltf` con esqueleto humanoide bajo convención
**Mixamo**. Los nombres de huesos se expondrán en la Fase 4.

## Verificación

```bash
.venv/bin/python -m pytest -v
```

16 tests: transformación de coordenadas, contrato JSON, parseo de fuente de video y
broadcast WebSocket. Ninguno requiere cámara ni GPU.

## Estructura

```
backend/
  kinematics.py    # coordenadas MediaPipe -> Three.js y vectores óseos
  schema.py        # payload JSON y serialización compacta
  capture.py       # cv2.VideoCapture configurable
  pose_engine.py   # MediaPipe Pose -> payload
  server.py        # broadcast WebSocket tolerante a clientes lentos
  main.py          # CLI y loop asíncrono
tests/             # pytest
frontend/src/
  scene.js         # renderer, cámara, luces, piso
  avatar.js        # loader .glb + maniquí placeholder
  ws-client.js     # cliente WebSocket con reconexión automática
  main.js          # composición y HUD
docs/contract.md   # contrato de datos con ejemplo real
```

## Rendimiento medido

En la máquina de desarrollo actual (Intel ADL GT2, 1280x720):

| `--model-complexity` | FPS de inferencia | ms/frame |
|---|---|---|
| `0` (lite) | ~41 | 24 ms |
| `1` (full) | ~29 | 34 ms |

El payload pesa ~620 bytes, equivalente a ~18 KB/s por cliente a 30 FPS.

## Limitaciones conocidas

- Sin mapeo cinemático: el avatar no se mueve todavía (Fase 4).
- Sin suavizado temporal: cuando se conecte la cinemática habrá *jitter* (Fase 5).
- Sin seguimiento de piernas ni anclaje al suelo (`AGENTS.md` §6).
- Sin manos ni rostro.
- El HUD muestra los FPS de mensajes recibidos, no del render.
- Si el dispositivo `/dev/video0` está ocupado o sin stream (por ejemplo Iriun sin
  transmitir), el backend falla con `No se pudo abrir la fuente de video`. Verificar
  con `v4l2-ctl --list-devices`.

## Script legacy

`ReconstruccionPose.py` es el prototipo original: dibuja el esqueleto con Matplotlib
y una ventana de OpenCV en lugar de difundir por WebSocket. Se conserva como
referencia. Usa la variable de entorno `RTSP_URL` si está definida.

```bash
RTSP_URL="rtsp://..." .venv/bin/python ReconstruccionPose.py
```

## Documentación

- [`docs/contract.md`](docs/contract.md) — contrato de datos con ejemplo real.
- [`AGENTS.md`](AGENTS.md) — directrices del proyecto, fases y decisiones postergadas.
- [`docs/plans/2026-11-03-mocap-fase-1-3.md`](docs/plans/2026-11-03-mocap-fase-1-3.md) — plan ejecutado.
