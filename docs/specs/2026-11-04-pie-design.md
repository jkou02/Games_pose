# Pie con punta y talón — Diseño

**Fecha:** 2026-11-03
**Estado:** aprobado por el usuario

## Objetivo

Que el pie del avatar deje de ser una tabla plana: que siga la inclinación real del
pie del sujeto y que el punto de apoyo sea la punta cuando corresponde, en lugar de
hundirse en el piso.

## Alcance acordado

| Tema | Decisión |
|---|---|
| Datos | Talón y punta por pie: `landmarks` pasa de 13 a 17 puntos. |
| Orientación | Pitch (punta arriba/abajo) + yaw (giro respecto del cuerpo). |
| Roll | **No** se implementa: no es derivable con puntos colineales. |
| Contacto | El tobillo de apoyo sube en puntas según el pitch. |
| Respaldo | Sin talón/punta válidos, el pie queda plano como hoy. |

## Por qué el roll queda afuera

Talón, tobillo y punta son tres puntos prácticamente colineales sobre el eje del
pie. Con ellos se define una dirección, no un plano. El roll necesitaría un cuarto
punto lateral que MediaPipe Pose no entrega.

## Por qué no se alinea el hueso contra talón→punta

En el rig, el hueso del pie va del tobillo a la punta del pie y baja 8,72 unidades
en 10,7 de avance: está inclinado ~39°. En el payload, `talón→punta` es casi
horizontal. Alinear el hueso contra ese vector levantaría el pie 39°.

Por eso la orientación se aplica como **rotación relativa** sobre la pose de reposo
del pie (que ya tiene la planta plana), no como alineación de dirección.

## Contract

### Campos nuevos

| Clave | MediaPipe | Uso |
|---|---|---|
| `left_heel` / `right_heel` | 29 / 30 | Origen de la dirección del pie. |
| `left_foot_index` / `right_foot_index` | 31 / 32 | Extremo de la dirección del pie. |

Se agregan a `landmarks` (metros) y a `landmarks_2d`. `confidence` sigue midiendo los
9 puntos del tren superior.

## Cálculo

```
forward  = normalize(punta − talón)
pitch    = asin(−forward.y)                    + punta abajo, − punta arriba
yawPie   = atan2(forward.x, forward.z)
frente   = cross(ladoDelModelo, +Y)            ladoDelModelo = −hips_side
yawCuerpo= atan2(frente.x, frente.z)
deltaYaw = normalizar(yawPie − yawCuerpo)
```

Orientación final, relativa a la pose de reposo del pie:

```
qPitch = axisAngle(axisLateral, pitch)    axisLateral = cross(+Y, forward)
qYaw   = axisAngle(+Y, deltaYaw)
qMundo = qYaw · qPitch · qRestPie
```

Altura del tobillo para el pie de apoyo:

```
extra  = largoPie · sin(pitch)   solo si pitch > 0
yTobillo = yTobilloReposo + extra
```

`largoPie` es la distancia tobillo→punta del rig (13,82 unidades), medida al cargar.
En puntas el tobillo sube hasta ~9 unidades y la punta se mantiene en el piso.

## Validación y respaldo

| Caso | Comportamiento |
|---|---|
| Falta talón o punta | Pie plano (orientación de reposo). |
| `|punta − talón|` < 0,05 m o > 0,5 m | Pie plano: dato implausible. |
| `pitch` fuera de ±60° | Se recorta. |
| `hips_side` ausente | `deltaYaw = 0`: pie al frente. |
| `detected: false` | Todo vuelve a reposo como hoy. |

## Límite conocido

El modelo no tiene hueso de talón. En un apoyo de talón fuerte el pie puede quedar
levemente bajo; el caso de puntas, que era el que se hundía, queda resuelto.

## Pruebas

- Backend: 17 landmarks con sus `landmarks_2d`.
- Navegador con emisor sintético: fase de puntas.
  - La punta del modelo se mantiene en el piso (y ≈ 0) durante las puntas.
  - El tobillo sube respecto de la fase plana.
  - El pie se inclina (pitch medible en el hueso).
  - Sin datos de pie, la pose vuelve a la de hoy.

## Fuera de alcance

- Roll del pie.
- Hueso de talón.
- Desplazamiento horizontal.
