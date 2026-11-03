# Suavizado configurable (One Euro) — Diseño

**Fecha:** 2026-11-03
**Estado:** aprobado por el usuario
**Alcance:** Fase 5, supresión de temblor. Cierra el ítem de `AGENTS.md` §6
"Parámetros del filtro de suavizado".

## Objetivo

Eliminar el temblor de la pose sin agregar retardo perceptible en movimientos
rápidos, con parámetros ajustables sin recompilar.

## Decisiones acordadas

| Tema | Decisión |
|---|---|
| Dónde se filtra | Backend, antes de serializar. |
| Qué se filtra | Solo posiciones: `landmarks` y `landmarks_2d`. |
| `bones` | Se recalculan desde los landmarks filtrados (coherencia por construcción). |
| Algoritmo | One Euro, independiente de la tasa de frames. |
| `--min-cutoff` | `1.0` Hz |
| `--beta` | `0.05` |
| `--d-cutoff` | `1.0` Hz |
| Desactivar | `--no-smooth` |

## Por qué One Euro y no un EMA simple

Un EMA con alfa fijo obliga a elegir entre suavizar poco (queda temblor) o mucho
(arrastra en gestos rápidos). Además su alfa depende de los FPS: a 60 fps el mismo
valor suaviza distinto que a 30.

One Euro adapta el corte según la velocidad estimada:

```
cutoff = min_cutoff + beta · |dx_filtrada|
alpha  = 1 / (1 + tau/dt)      con tau = 1/(2π · cutoff)
```

Quieta, la señal se filtra con `min_cutoff` (mucho suavizado). En movimiento, el
corte sube y el filtro se abre (poco retardo).

## Módulo `backend/smoothing.py`

Dos unidades:

- `OneEuroFilter`: una dimensión, con estado (`x`, `dx`, `t`) y `reset()`.
- `PoseSmoother`: mantiene un filtro por `(grupo, clave, eje)` y aplica el filtro a
  un diccionario de vectores.

`grupo` separa `"3d"` (metros) de `"2d"` (normalizado): son magnitudes distintas y
no deben compartir estado.

## Integración en `PoseEngine`

```
frame → MediaPipe → normalize_landmarks
      → PoseSmoother("3d")
      → compute_bones
      → landmarks_2d → PoseSmoother("2d")
      → payload
```

El orden importa: filtrar **antes** de `compute_bones` garantiza que `torso_up`,
`hips_side` y los brazos salgan de las mismas posiciones suavizadas. Si se filtraran
también los huesos por separado, podrían discrepar de los landmarks.

## Manejo de estado

| Caso | Comportamiento |
|---|---|
| Primer frame tras un reinicio | Pasa sin filtrar (no hay historial). |
| `dt <= 0` | Se devuelve el último valor filtrado; no se rompe la división. |
| Pérdida de detección | Se reinicia el filtro, para no arrastrar la pose vieja al recuperar. |
| `--no-smooth` | El motor no crea el filtro y el payload sale crudo. |

## Pruebas

- Reducción de ruido: desviación del ruido de salida menor que la de entrada.
- Independencia de FPS: la misma señal física muestreada a 30 y 60 fps converge a
  valores parecidos.
- `reset()` olvida el historial.
- Los grupos `2d` y `3d` no comparten estado.
- `--no-smooth` no altera el payload.
- Con filtro activo, un salto brusco entre dos frames queda amortiguado.

## Fuera de alcance

- Suavizado en el cliente (los `slerp` actuales se conservan para interpolar a 60 fps).
- Interpolación predictiva de objetivos entre payloads.
- Orientación de pie con punta y talón.
- Desplazamiento horizontal del avatar.

## Límite conocido

El backend emite a ~30 fps y el cliente renderiza a 60: las piernas, que se aplican
de forma directa para no perder precisión de apoyo, se actualizan a 30 fps. El
filtro reduce el temblor, pero no la cadencia.
