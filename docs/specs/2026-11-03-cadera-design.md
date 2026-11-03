# Cadera con giro e inclinación — Diseño

**Fecha:** 2026-11-03
**Estado:** aprobado por el usuario
**Alcance:** paso 1 de 2 del tren inferior. Piernas articuladas y anclaje al piso
quedan para el paso 2 (ver `AGENTS.md` §6).

## Objetivo

Que la parte inferior del avatar responda al movimiento de la pelvis del sujeto:
giro (yaw) e inclinación lateral (roll), sin trasladar el avatar y sin articular
las piernas.

Hasta ahora el avatar estaba fijo de la cadera hacia abajo (`AGENTS.md` §6,
"alternativa base inicial"). Esta es la primera etapa para levantarlo.

## Decisiones acordadas

| Tema | Decisión |
|---|---|
| Alcance | Solo rotación de cadera. Piernas rígidas respecto de la pelvis. |
| Ejes | Giro + inclinación. Sin desplazamiento del avatar. |
| Datos | Un único campo nuevo en el contrato: `bones.hips_side`. |
| Vertical de referencia | Eje +Y del mundo. No se usa el tronco, para no duplicar la rotación de la columna. |
| Suavizado | `slerp 0.22`, igual que la columna. |

## Contrato

### Campo nuevo

| Campo | Valor | Semántica |
|---|---|---|
| `bones.hips_side` | `unit(left_hip − right_hip)` | Eje lateral de la pelvis, en espacio Three.js espejado. En reposo vale `[-1, 0, 0]`. |

Se mantiene todo lo existente. `landmarks` ya incluía `left_hip` y `right_hip`, así
que no hay campos nuevos de posiciones.

### Invariantes

- `hips_side` es unitario. Si la distancia entre caderas es despreciable, el
  backend emite `[0, 0, 0]` (igual que el resto de `bones`) y el cliente ignora el
  frame para la cadera.
- Con `detected: false`, `bones` viene vacío y la cadera vuelve a reposo.

## Componentes

### Backend — `backend/kinematics.py`

`compute_bones` agrega `hips_side` derivado de `points`, junto a `torso_up`,
`torso_side` y `head`.

### Frontend — `static/js/app.js`

1. **Calibración al cargar:** se guarda `restHipsSide` (dirección `LeftUpLeg −
   RightUpLeg` en el mundo, tomada del modelo en reposo) y `restHipsQuat`
   (cuaternión mundial de `mixamorigHips`).
2. **`orientarCadera(bones)`:** arma dos bases ortonormales `(side, +Y mundo)`
   —una de reposo y una objetivo—, calcula el delta, lo lleva a espacio local del
   padre y aplica `slerp`.
3. **Orden de aplicación:** cadera → columna → brazos. La columna es hija de la
   cadera; si se orienta antes que ella, la pose sale torcida porque se calcula
   contra un padre que todavía no se movió.
4. **Sin traslación:** `huesoCadera.position` se fija una sola vez al cargar
   (`AGENTS.md` §7) y no se toca por frame.
5. **Piernas:** `anclarPiernas` las mantiene en su rotación de reposo local, así
   que heredan el giro de la cadera y quedan rígidas. Es el comportamiento pedido.
6. **Pérdida de tracking:** `volverAReposo` incluye la cadera (solo rotación) para
   que vuelva suave a neutro.

## Flujo de datos

```
MediaPipe (left_hip, right_hip) → kinematics.hips_side → payload JSON
   → orientarCadera → mixamorigHips (yaw + roll)
   → piernas y columna heredan → brazos se orientan en mundo
```

## Manejo de errores y degradación

| Caso | Comportamiento |
|---|---|
| Payload sin `hips_side` (backend viejo) | La cadera queda en reposo; el resto sigue funcionando. |
| `hips_side` en cero | Se ignora ese frame para la cadera. |
| Vector casi vertical (no proyectable) | Se ignora (no hay eje lateral válido). |
| `detected: false` | Vuelta suave a reposo. |
| Rig sin `LeftUpLeg`/`RightUpLeg` | No se calibra la cadera y se avisa por consola. |

## Pruebas

- **Unitarias (pytest):** `hips_side` unitario y con dirección `[-1, 0, 0]` en el
  fixture; claves del contrato actualizadas en `test_kinematics`, `test_schema` y
  `test_pose_engine`.
- **Navegador:** emisor sintético que rota `hips_side`; se mide que
  `RightUpLeg − LeftUpLeg` del modelo siga al payload y que las piernas no se
  deformen (quedan rígidas), más captura visual.

## Fuera de alcance

- Articular muslos y pantorrillas.
- Anclaje de pies / IK / evitar patinaje.
- Desplazamiento del avatar en el escenario.
- Suavizado configurable (sigue en `AGENTS.md` §6).

## Límite conocido

La pelvis pivota sobre su propio punto, así que los pies giran en el lugar: hay un
patinaje angular leve. Es el costo acordado de no implementar IK todavía y queda
documentado como pendiente del paso 2.
