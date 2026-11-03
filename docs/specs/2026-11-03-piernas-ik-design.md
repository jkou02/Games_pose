# Piernas con IK y anclaje al piso — Diseño

**Fecha:** 2026-11-03
**Estado:** aprobado por el usuario
**Alcance:** paso 2 de 2 del tren inferior. Reemplaza la "alternativa base inicial"
de `AGENTS.md` §6 (avatar fijo de la cadera hacia abajo).

## Objetivo

Que las piernas del avatar sigan al sujeto con muslos y pantorrillas articulados, y
que el pie de apoyo quede clavado en el piso mientras la cadera acompaña la altura
del sujeto.

## Decisiones acordadas

| Tema | Decisión |
|---|---|
| Cinemática | IK analítico de dos huesos (muslo + pantorrilla) por pierna. |
| Objetivos | Tobillos del payload, en metros, escalados al rig. |
| Cadera | Se mueve **solo en vertical**, siguiendo la altura estimada del sujeto. |
| Desplazamiento horizontal | Ninguno: el avatar permanece en el centro del escenario. |
| Pie de apoyo | El tobillo más bajo, con histéresis. Se clava al piso y su XZ se congela. |
| Orientación del pie | Nivelada (sin seguir punta ni talón). |

## Contrato

### Campos nuevos

`landmarks` pasa de 9 a 13 puntos, en metros, relativos al centro de cadera:

| Clave nueva | MediaPipe | Uso |
|---|---|---|
| `left_knee` / `right_knee` | 25 / 26 | Plano de flexión de la rodilla (*pole vector*). |
| `left_ankle` / `right_ankle` | 27 / 28 | Objetivo del IK. |

`landmarks_2d` pasa a los mismos 13 puntos (el overlay y el panel 2D dibujan el
cuerpo completo). No se agregan vectores a `bones`: el IK trabaja con posiciones.

### `confidence`

Sigue midiendo la visibilidad de los **9 puntos del tren superior**, no de los 13.
Motivo: en una exhibición la cámara suele cortar los pies, y promediar los tobillos
haría que un encuadre cerrado marque `detected: false` y congele el avatar entero.
La calidad del tren inferior se valida en el cliente de forma geométrica
(alcance, altura, vectores degenerados), no con `confidence`.

## Retargeting

La escala no es una constante: se estima con la longitud de pierna del sujeto, que
es invariante a la pose porque se calcula sumando segmentos.

```
pierna_sujeto = media(|rodilla−cadera| + |tobillo−rodilla|)   (metros)
escala        = pierna_avatar / pierna_sujeto                 (unidades por metro)
```

`escala` se suaviza con EMA (α = 0.05) y se limita a `[80, 140]`. Medido en el rig:
pierna del avatar = 95.5 unidades, persona ≈ 0.9 m → ≈ 106 unidades/m.

## Altura de la cadera

El único dato absoluto disponible es el tobillo de apoyo:

```
hips.y_mundo = y_tobillo_reposo + |tobillo_apoyo_y| · escala
```

`y_tobillo_reposo` se captura al cargar el modelo (8.73 unidades). Se aplica como
delta sobre la `position` local de la cadera, para no depender de la transformación
del armature. Con una persona de pie da ≈104, igual que antes; al agacharse baja.

## Solver de dos huesos

Por pierna, en espacio de mundo:

1. `objetivo = posición_mundo(cadera) + tobillo_payload · escala`.
2. Pie de apoyo: `objetivo.y = y_tobillo_reposo` y `objetivo.xz` congelado mientras
   siga siendo apoyo.
3. Se limita `|objetivo − hip|` a `0.98 · (muslo + pantorrilla)`.
4. Ley de cosenos → posición de la rodilla; el *pole* sale de la rodilla del payload
   proyectada sobre el plano perpendicular a la línea cadera–tobillo. Si es
   degenerado, se usa el frente de la cadera.
5. Se orienta el muslo hacia la rodilla y la pantorrilla hacia el tobillo
   conservando el roll del hueso (`orientarHueso`).
6. Pie: se mantiene la orientación de reposo (nivelado).

## Orden de aplicación

Cadera (rotación + altura) → columna → brazos → piernas. Las piernas van al final
porque dependen de dónde quedó la cadera y de la altura ya resuelta.

## Detección del pie de apoyo

- Apoyo = el tobillo con `y` más negativa del payload.
- Cambio de apoyo solo si el otro pie es más bajo durante 3 frames consecutivos.
- Al cambiar, se recaptura la XZ del nuevo pie.
- El pie que no apoya sigue al sujeto con `y` limitada a no atravesar el piso.

## Degradaciones

| Caso | Comportamiento |
|---|---|
| Payload sin tobillos ni rodillas (backend viejo) | Piernas congeladas, como antes del paso 2. |
| `detected: false` | Vuelta suave a reposo: rotaciones y altura de cadera. |
| Objetivo inalcanzable | Se clampea al 98 % del alcance; la malla nunca se estira. |
| Rodilla del payload degenerada | *Pole* por defecto según la cadera. |
| Pierna con longitud cero | Se ignora el IK de ese lado. |

## Pruebas

- **Backend:** los 13 landmarks y sus `landmarks_2d`; `confidence` sobre 9.
- **Navegador:** emisor sintético con agachada y levantamiento de pie.
  - Tobillo de apoyo en `y = 8.73` (±0.5) mientras está plantado.
  - Cadera baja durante la agachada.
  - `|cadera→tobillo| ≤ 95.5` siempre (no se estira la pierna).
  - Capturas de ambos estados.

## Fuera de alcance

- Desplazamiento horizontal del avatar (caminar de verdad en el escenario).
- Orientación de pie con punta y talón.
- Dedos, manos y rostro.
- Filtros de suavizado configurables (`AGENTS.md` §6 sigue pendiente).

## Límites conocidos

- Si el sujeto camina, el avatar da pasos en el lugar.
- Los pies se mantienen nivelados: no se ve el apoyo de punta ni de talón.
