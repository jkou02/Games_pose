# Contrato de datos — MoCap Avatar 3D

Payload JSON emitido por el backend una vez por frame procesado, difundido a todos
los clientes WebSocket conectados en `ws://127.0.0.1:8765`.

## Ejemplo real

Capturado del backend (`python -m backend.main --source 0`), con una persona
detectada:

```json
{
  "timestamp": 1793734562.352,
  "detected": true,
  "confidence": 0.962,
  "landmarks": {
    "nose": [-0.0983, 0.6297, 0.2206],
    "left_shoulder": [-0.1655, 0.4824, 0.0058],
    "right_shoulder": [0.1441, 0.4724, 0.1056],
    "left_elbow": [-0.2022, 0.2688, 0.0512],
    "right_elbow": [0.1968, 0.2124, 0.0717],
    "left_wrist": [-0.1665, 0.2232, 0.2605],
    "right_wrist": [0.1842, -0.0296, 0.117],
    "left_hip": [-0.1065, 0.0, -0.0238],
    "right_hip": [0.1065, 0.0, 0.0238]
  },
  "bones": {
    "right_upper_arm": [0.1969, -0.9722, -0.1266],
    "right_lower_arm": [-0.0508, -0.9817, 0.1835],
    "left_upper_arm": [-0.1658, -0.9646, 0.2051],
    "left_lower_arm": [0.1641, -0.2102, 0.9638],
    "torso_up": [-0.0222, 0.993, 0.1158]
  }
}
```

> El ejemplo se capturó antes de agregar `bones.head`. El backend ahora emite
> también ese campo (vector centro de hombros → nariz), así que `bones` tiene 6
> entradas.

## Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `timestamp` | float | Segundos desde epoch, 3 decimales. |
| `detected` | bool | `false` si no hay persona o la confianza es menor a `--min-confidence`. |
| `confidence` | float | Promedio de `visibility` de los 9 landmarks del contrato, 3 decimales. |
| `landmarks` | objeto | 9 puntos, coordenadas `[x, y, z]` en metros. |
| `bones` | objeto | 6 vectores unitarios `[x, y, z]`. |

### `landmarks`

Coordenadas en metros, **relativas al centro de cadera** (`(left_hip + right_hip) / 2`
es el origen), en el sistema de Three.js:

- `+X` hacia la derecha de la pantalla.
- `+Y` hacia arriba.
- `+Z` hacia el observador.

Transformación aplicada por el backend sobre `pose_world_landmarks`:

```python
x_3d = -x_mediapipe
y_3d = -y_mediapipe
z_3d = -z_mediapipe
```

El signo invertido en X produce el efecto espejo: si la persona levanta su mano
izquierda, el avatar la levanta del mismo lado que ve el público. Por eso el
frontend **no** debe aplicar `scale.x = -1` ni espejar la cámara.

Claves: `nose`, `left_shoulder`, `right_shoulder`, `left_elbow`, `right_elbow`,
`left_wrist`, `right_wrist`, `left_hip`, `right_hip`.

Contradicción conocida: el ejemplo de `AGENTS.md` §3 muestra `"nose": [0.0, 1.65, 0.1]`,
que corresponde a altura absoluta y contradice el texto "relativas a la cadera".
La implementación sigue el texto normativo (relativo a cadera). Para una persona de
1.80 m parada, `nose.y ≈ 0.63`.

### `bones`

Vectores unitarios (`norma == 1.0`) que apuntan del origen al destino del segmento:

| Clave | Origen | Destino |
|---|---|---|
| `right_upper_arm` | `right_shoulder` | `right_elbow` |
| `right_lower_arm` | `right_elbow` | `right_wrist` |
| `left_upper_arm` | `left_shoulder` | `left_elbow` |
| `left_lower_arm` | `left_elbow` | `left_wrist` |
| `torso_up` | centro de cadera | centro de hombros |
| `head` | centro de hombros | `nose` |

Los nombres `left_*` / `right_*` son siempre desde el punto de vista del sujeto.

Si un segmento tiene longitud despreciable (`< 1e-8`) el backend emite `[0.0, 0.0, 0.0]`
en lugar de `NaN`. Un cliente debe ignorar vectores nulos.

## Pérdida de seguimiento

Cuando `detected` es `false`, `landmarks` y `bones` vienen vacíos:

```json
{"timestamp": 1793734563.011, "detected": false, "confidence": 0.0, "landmarks": {}, "bones": {}}
```

El cliente debe interpolar suavemente hacia la pose neutra. No debe congelar la
última pose recibida (`AGENTS.md` §7).

## Ancho de banda

Payload medido: **~620 bytes** por frame (JSON compacto, sin espacios, 4 decimales).
A 30 FPS son ~18 KB/s por cliente.

## Mapeo a huesos Mixamo

El consumidor actual es `static/js/app.js`. Traduce los vectores de `bones` a
rotaciones de huesos del rig Mixamo, **con swap de lados deliberado**:

| `bones` | Hueso del avatar |
|---|---|
| `torso_up` | `mixamorigSpine` |
| `head` | `mixamorigNeck` |
| `right_upper_arm` / `right_lower_arm` | `mixamorigLeftArm` / `mixamorigLeftForeArm` |
| `left_upper_arm` / `left_lower_arm` | `mixamorigRightArm` / `mixamorigRightForeArm` |

El swap es obligatorio: el backend ya espeja X y el video también está espejado por
CSS, así que el brazo que el público ve a la derecha corresponde al hueso izquierdo
del avatar (que es el que se dibuja a la derecha de la pantalla). Un cliente que
mapee los nombres sin invertir mostrará el avatar con los brazos cruzados.

Sólo se rotan huesos: nunca se modifica `position` de articulaciones hijas
(`AGENTS.md` §7). El anclaje de cadera se aplica una única vez al cargar el modelo.

