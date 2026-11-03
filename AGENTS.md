# Directrices de Desarrollo - MoCap Avatar 3D en Tiempo Real

## 1. Objetivo del Proyecto
Construir un sistema de captura de movimiento en tiempo real (*markerless motion capture*) para demostración interactiva al público en general. La aplicación capturará el movimiento corporal de una persona frente a una cámara web mediante MediaPipe y animará simultáneamente un avatar 3D con baja latencia y alta fluidez visual en un navegador web.

---

## 2. Stack Tecnológico y Arquitectura

Se adopta una **arquitectura desacoplada (Productor - Consumidor)**:

```
[ Cámara Web ]
      │
      ▼
[ Backend: Python ]
  ├── OpenCV (Captura de frames)
  ├── MediaPipe Pose (`pose_world_landmarks`)
  ├── Normalización y conversión de coordenadas
  └── Servidor WebSocket local (`asyncio` + `websockets`)
      │
      │  JSON vía ws://127.0.0.1:8765 (30-60 FPS)
      ▼
[ Frontend: Web / Three.js ]
  ├── Servidor Flask (`servidor.py`) que sirve plantilla y estáticos
  ├── Cliente WebSocket (`static/js/pose-source.js`)
  ├── Motor de render Three.js vendorizado en `static/vendor/three`
  ├── Gestor de avatar (Loader `.fbx` desde `animados/`)
  └── Solver cinemático (Mapeo de rotaciones a huesos Mixamo)
```

* **Backend:** Python 3.10+ con `opencv-python` y `mediapipe`.
* **Frontend:** Flask + Three.js en módulos ES nativos, sin build ni CDN. Sirve offline.
* **Canal de Transporte:** WebSocket local bidireccional/broadcast (puerto por defecto: `8765`). Se elige WebSocket sobre UDP simple por su compatibilidad nativa inmediata con APIs de navegador sin proxys ni pasarelas intermedias.
* **Formato 3D:** Modelos `.fbx` con esqueleto humanoide (*rig*) bajo convención de nombres **Mixamo**, servidos desde `animados/`.

---

## 3. Contrato de Datos (Payload Schema)

El backend transmitirá paquetes en formato JSON en cada cuadro procesado. Para mantener el ancho de banda y el parseo ultraligeros, el contrato define puntos de referencia espaciales y vectores directores ya calculados.

### Schema JSON estándar:
```json
{
  "timestamp": 1730650000.123,
  "detected": true,
  "confidence": 0.92,
  "landmarks": {
    "nose": [0.0, 1.65, 0.1],
    "left_shoulder": [-0.2, 1.4, 0.0],
    "right_shoulder": [0.2, 1.4, 0.0],
    "left_elbow": [-0.45, 1.15, 0.05],
    "right_elbow": [0.45, 1.15, 0.05],
    "left_wrist": [-0.5, 0.85, 0.1],
    "right_wrist": [0.5, 0.85, 0.1],
    "left_hip": [-0.15, 0.9, 0.0],
    "right_hip": [0.15, 0.9, 0.0],
    "left_knee": [-0.16, 0.45, 0.02],
    "right_knee": [0.16, 0.45, 0.02],
    "left_ankle": [-0.17, 0.05, 0.0],
    "right_ankle": [0.17, 0.05, 0.0]
  },
  "landmarks_2d": {
    "nose": [0.50, 0.22],
    "left_shoulder": [0.60, 0.36],
    "right_shoulder": [0.40, 0.36],
    "left_elbow": [0.66, 0.50],
    "right_elbow": [0.34, 0.50],
    "left_wrist": [0.68, 0.62],
    "right_wrist": [0.32, 0.62],
    "left_hip": [0.56, 0.70],
    "right_hip": [0.44, 0.70],
    "left_knee": [0.57, 0.82],
    "right_knee": [0.43, 0.82],
    "left_ankle": [0.58, 0.95],
    "right_ankle": [0.42, 0.95]
  },
  "bones": {
    "right_upper_arm": [0.82, -0.57, 0.0],
    "right_lower_arm": [0.15, -0.98, 0.1],
    "left_upper_arm": [-0.82, -0.57, 0.0],
    "left_lower_arm": [-0.15, -0.98, 0.1],
    "torso_up": [0.0, 1.0, 0.0],
    "torso_side": [-1.0, 0.0, 0.0],
    "hips_side": [-1.0, 0.0, 0.0],
    "head": [0.0, 0.55, 0.83]
  }
}
```

* `landmarks`: Coordenadas métricas $(X, Y, Z)$ relativas a la cadera en el sistema de coordenadas de Three.js.
* `landmarks_2d`: Coordenadas normalizadas $(x, y) \in [0,1]$ de la imagen original, sin espejar. Necesarias para calcar el esqueleto sobre el video.
* `bones`: Vectores unitarios normalizados $(\Delta X, \Delta Y, \Delta Z)$ de cada segmento óseo, calculados en el backend para aligerar la carga matemática del cliente web.
  `torso_up` va del centro de cadera al centro de hombros, `torso_side` del hombro derecho al izquierdo y `head` del centro de hombros a la nariz. `torso_up` y `torso_side` juntos definen la orientación del torso, incluido su giro.

---

## 4. Convención de Sistemas de Coordenadas

Para evitar discrepancias donde el avatar quede invertido o mirando hacia el lado contrario, se fija la transformación estándar desde el backend:

### Espacio MediaPipe (`pose_world_landmarks`)
* Origen $(0, 0, 0)$: Centro de la cadera del sujeto.
* Eje $+X$: Hacia la derecha del usuario.
* Eje $+Y$: Hacia abajo (gravedad invertida respecto al estándar 3D).
* Eje $+Z$: Hacia adelante / alejándose de la cámara.

### Espacio Three.js (Mundo 3D)
* Origen $(0, 0, 0)$: Centro del escenario / base del avatar.
* Eje $+X$: Hacia la derecha de la pantalla.
* Eje $+Y$: Hacia arriba.
* Eje $+Z$: Hacia afuera de la pantalla (hacia el usuario que observa).

### Regla de Transformación Obligatoria (en Backend):
```python
x_3d = -x_mediapipe  # Invierte eje horizontal para efecto espejo natural
y_3d = -y_mediapipe  # Invierte vertical para que +Y sea hacia arriba
z_3d = -z_mediapipe  # Profundidad alineada con la mirada del avatar
```

---

## 5. Fases de Implementación (Orden Estricto)

El desarrollo debe realizarse de forma secuencial y verificable por hitos:

1. **Fase 1: Captura y Normalización (Backend)**
   - Script Python que captura webcam a 30+ FPS.
   - Extracción de `pose_world_landmarks` y cálculo de vectores directores.
   - Transformación de coordenadas al espacio Three.js.
2. **Fase 2: Servidor de Difusión (Backend)**
   - Loop asíncrono con `asyncio` y `websockets`.
   - Serialización JSON según el contrato de datos.
3. **Fase 3: Escena Base y Conexión (Frontend)**
   - Canvas Three.js con iluminación básica, piso y cámara configurada.
   - Carga de un avatar `.glb` humanoide en Pose T.
   - Cliente WebSocket que recibe paquetes y muestra estado de conexión en pantalla.
4. **Fase 4: Mapeo de Huesos y Cinemática (Frontend)**
   - Mapeo de vectores directores a cuaterniones locales de los huesos principales del tren superior (`mixamorig:RightArm`, `mixamorig:RightForeArm`, `mixamorig:LeftArm`, `mixamorig:LeftForeArm`, `mixamorig:Head`).
   - Aplicación estricta de rotación local sin alterar posiciones para proteger la integridad de la malla.
   - **Estado:** implementada en `static/js/app.js` (`MAPA_HUESOS` + `aplicarPose3D`). El mapeo invierte lados de forma deliberada (`right_*` → `mixamorigLeft*`) porque el eje X llega espejado desde el backend; ver `docs/contract.md`.
5. **Fase 5: Integración y Estabilización**
   - Incorporación del filtro de suavizado temporal para suprimir el temblor (*jitter*).
   - Inserción de ventana PiP (*Picture-in-Picture*) con el feed de video y el esqueleto superpuesto para retroalimentación visual al público.

---

## 6. Decisiones Técnicas Postergadas

Las siguientes características y ajustes **no deben implementarse en el arranque**. Deberán discutirse, evaluarse y definirse puntualmente al comenzar la fase que las requiera:

> **Nota para agentes y desarrolladores:** Antes de escribir código para cualquiera de los siguientes puntos, se debe pausar y acordar los parámetros y la estrategia técnica específica con el usuario.

* **Parámetros del filtro de suavizado (One Euro Filter / EMA):**
  - *Cuándo decidir:* Al finalizar la Fase 4, probando en vivo frente a la cámara web física.
  - *Variables a definir:* Frecuencia de corte mínima (`min_cutoff`) y coeficiente de velocidad (`beta`).
* **Seguimiento de piernas y anclaje al suelo (*Foot IK / Grounding*):**
  - *Paso 1 (hecho):* rotación de cadera con `hips_side` (giro + inclinación).
    Piernas rígidas respecto de la pelvis; el avatar no se traslada. Queda un
    patinaje angular leve porque la pelvis pivota sobre su punto.
  - *Paso 2 (hecho):* muslos y pantorrillas con IK de dos huesos. El pie de apoyo
    (el tobillo más bajo, con histéresis de 3 frames) se clava al piso y su XZ se
    congela; la cadera se mueve en vertical con la altura del sujeto. Sin
    desplazamiento horizontal: si el sujeto camina, el avatar da pasos en el lugar.
    Ver `docs/specs/2026-11-03-piernas-ik-design.md`.
* **Entorno visual y dirección de arte:**
  - *Cuándo decidir:* Una vez que la cinemática funcione con precisión.
  - *Variables a definir:* Tipo de iluminación (sombras dinámicas vs. luces básicas), textura del escenario, efectos de partículas o estilo visual del avatar.
* **Seguimiento fino de manos y rostro:**
  - *Cuándo decidir:* Solo si el rendimiento de hardware de la máquina de exhibición permite correr MediaPipe Holistic a 60 FPS estables sin caídas de cuadros.

---

## 7. Reglas de Calidad para Agentes de Código
* **Latencia primero:** No añadir librerías pesadas ni cálculos de deep learning adicionales que eleven el tiempo total de respuesta por encima de 100 ms.
* **Prohibido estirar la malla:** Nunca modificar la posición (`position`) de articulaciones hijas; solo se modifican rotaciones (`quaternion` o `rotation`).
* **Resiliencia ante pérdida de tracking:** Si la persona sale del cuadro (`detected: false`), el avatar debe interpolar suavemente de regreso a su pose de reposo neutra en lugar de congelarse en poses extrañas o deformadas.