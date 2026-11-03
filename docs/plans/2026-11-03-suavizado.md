# Suavizado configurable — Plan de Implementación

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtrar las posiciones de la pose con One Euro en el backend, con parámetros por CLI, sin agregar retardo perceptible.

**Architecture:** Un módulo puro `backend/smoothing.py` con `OneEuroFilter` y `PoseSmoother`. `PoseEngine` filtra los landmarks antes de calcular huesos, y `main.py` expone los parámetros.

**Tech Stack:** Python 3.10 (`numpy`, `pytest`), `argparse`.

**Spec:** `docs/specs/2026-11-03-suavizado-design.md`

## Global Constraints

- `min_cutoff = 1.0`, `beta = 0.05`, `d_cutoff = 1.0` por defecto.
- El filtro es independiente de la tasa de frames (usa `dt`).
- Se filtran solo posiciones; los `bones` se recalculan después.
- Grupo `"3d"` y `"2d"` con estado separado.
- Sin dependencias nuevas.
- El comportamiento por defecto cambia (filtro activo): `--no-smooth` para apagarlo.

---

### Task 1: Módulo de filtrado

**Files:**
- Create: `backend/smoothing.py`
- Test: `tests/test_smoothing.py`

**Interfaces:**
- Produces: `OneEuroFilter(min_cutoff, beta, d_cutoff)` con `.filter(value, t)` y `.reset()`; `PoseSmoother(...)` con `.apply(grupo, datos, t)` y `.reset()`.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/test_smoothing.py`:

```python
import numpy as np

from backend.smoothing import OneEuroFilter, PoseSmoother


def test_primer_valor_pasa_sin_filtrar():
    f = OneEuroFilter()
    assert f.filter(5.0, 0.0) == 5.0


def test_reduce_el_ruido_de_una_senal_quieta():
    rng = np.random.default_rng(0)
    ruido = 1.0 + rng.normal(0, 0.05, 200)
    f = OneEuroFilter()
    salida = [f.filter(float(v), i / 30) for i, v in enumerate(ruido)]
    assert np.std(salida[30:]) < np.std(ruido[30:]) * 0.5


def test_es_independiente_de_los_fps():
    def correr(fps):
        f = OneEuroFilter()
        salida = None
        for i in range(fps):
            t = i / fps
            salida = f.filter(1.0 if t < 1.0 else 2.0, t)
        return salida

    assert correr(30) == pytest.approx(correr(60), abs=0.2)


def test_reset_olvida_el_historial():
    f = OneEuroFilter()
    for i in range(30):
        f.filter(1.0, i / 30)
    f.reset()
    assert f.filter(10.0, 2.0) == 10.0


def test_dt_nulo_no_rompe():
    f = OneEuroFilter()
    f.filter(1.0, 0.0)
    assert f.filter(2.0, 0.0) == 1.0


def test_los_grupos_no_comparten_estado():
    s = PoseSmoother()
    s.apply("3d", {"nose": np.array([0.0, 0.0, 0.0])}, 0.0)
    salida = s.apply("2d", {"nose": np.array([0.9, 0.9])}, 0.0)
    assert list(salida["nose"]) == [0.9, 0.9]


def test_amortigua_un_salto_brusco():
    s = PoseSmoother()
    s.apply("3d", {"nose": np.zeros(3)}, 0.0)
    salida = s.apply("3d", {"nose": np.array([1.0, 0.0, 0.0])}, 1 / 30)
    assert 0.0 < salida["nose"][0] < 1.0
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `.venv/bin/python -m pytest tests/test_smoothing.py -q`
Expected: FAIL con `ModuleNotFoundError: backend.smoothing`.

- [ ] **Step 3: Implementar el módulo**

`backend/smoothing.py`:

```python
"""Suavizado One Euro de posiciones (AGENTS.md §6)."""

from __future__ import annotations

import math
from typing import Mapping, Sequence

import numpy as np


class OneEuroFilter:
    """Filtro One Euro de una dimensión, independiente de la tasa de frames."""

    def __init__(
        self, min_cutoff: float = 1.0, beta: float = 0.05, d_cutoff: float = 1.0
    ) -> None:
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x: float | None = None
        self._dx = 0.0
        self._t: float | None = None

    @staticmethod
    def _alpha(cutoff: float, dt: float) -> float:
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def reset(self) -> None:
        self._x = None
        self._dx = 0.0
        self._t = None

    def filter(self, value: float, timestamp: float) -> float:
        if self._x is None or self._t is None:
            self._x = value
            self._t = timestamp
            return value

        dt = timestamp - self._t
        if dt <= 0:
            return self._x

        dx = (value - self._x) / dt
        a_d = self._alpha(self.d_cutoff, dt)
        self._dx = a_d * dx + (1.0 - a_d) * self._dx

        cutoff = self.min_cutoff + self.beta * abs(self._dx)
        a = self._alpha(cutoff, dt)
        self._x = a * value + (1.0 - a) * self._x
        self._t = timestamp
        return self._x


class PoseSmoother:
    """Un `OneEuroFilter` por (grupo, clave, eje)."""

    def __init__(
        self, min_cutoff: float = 1.0, beta: float = 0.05, d_cutoff: float = 1.0
    ) -> None:
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._filtros: dict[tuple[str, str, int], OneEuroFilter] = {}

    def reset(self) -> None:
        for filtro in self._filtros.values():
            filtro.reset()

    def _filtro(self, grupo: str, clave: str, eje: int) -> OneEuroFilter:
        clave_filtro = (grupo, clave, eje)
        filtro = self._filtros.get(clave_filtro)
        if filtro is None:
            filtro = OneEuroFilter(self.min_cutoff, self.beta, self.d_cutoff)
            self._filtros[clave_filtro] = filtro
        return filtro

    def apply(
        self,
        grupo: str,
        datos: Mapping[str, Sequence[float]],
        timestamp: float,
    ) -> dict[str, np.ndarray]:
        """Filtra cada componente; devuelve arreglos de numpy."""
        salida: dict[str, np.ndarray] = {}
        for clave, vector in datos.items():
            valores = [
                self._filtro(grupo, clave, eje).filter(float(componente), timestamp)
                for eje, componente in enumerate(vector)
            ]
            salida[clave] = np.asarray(valores, dtype=np.float64)
        return salida
```

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `.venv/bin/python -m pytest tests/test_smoothing.py -q`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/smoothing.py tests/test_smoothing.py
git commit -m "feat(backend): filtro One Euro para las posiciones de la pose"
```

---

### Task 2: Integrar en el motor y la CLI

**Files:**
- Modify: `backend/pose_engine.py`
- Modify: `backend/main.py`
- Modify: `tests/test_pose_engine.py`

**Interfaces:**
- Consumes: `PoseSmoother` (Task 1).
- Produces: `PoseEngine(min_confidence, model_complexity, min_cutoff, beta, d_cutoff, smooth)`.

- [ ] **Step 1: Escritura del test**

En `tests/test_pose_engine.py`:

```python
def test_el_filtro_amortigua_un_cambio_brusco():
    world, image = pose_de_pie()
    engine = motor(Resultados(world, image))
    primero = engine.process(FRAME)
    for punto in world.landmark:
        punto.x += 1.0
    segundo = engine.process(FRAME)
    # La posición filtrada queda entre la anterior y la nueva, no salta entera.
    assert segundo["landmarks"]["nose"][0] < primero["landmarks"]["nose"][0] + 1.0


def test_sin_suavizado_el_payload_es_crudo():
    world, image = pose_de_pie()
    engine = motor(Resultados(world, image), smooth=False)
    payload = engine.process(FRAME)
    assert payload["landmarks"]["left_ankle"] == [-0.10, 0.90, 0.0]
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `.venv/bin/python -m pytest tests/test_pose_engine.py -q`
Expected: FAIL (`motor()` no acepta `smooth`, y el payload salta entero).

- [ ] **Step 3: Modificar `PoseEngine`**

```python
from backend.smoothing import PoseSmoother


class PoseEngine:
    def __init__(
        self,
        min_confidence: float = 0.5,
        model_complexity: int = 1,
        min_cutoff: float = 1.0,
        beta: float = 0.05,
        d_cutoff: float = 1.0,
        smooth: bool = True,
    ) -> None:
        self.min_confidence = min_confidence
        self._smoother = (
            PoseSmoother(min_cutoff, beta, d_cutoff) if smooth else None
        )
        self._pose = mp.solutions.pose.Pose(...)   # igual que antes
```

En `process`, después de `points = normalize_landmarks(raw)`:

```python
        ahora = time.perf_counter()
        if self._smoother:
            points = self._smoother.apply("3d", points, ahora)
        bones = compute_bones(points)

        landmarks_2d = self._landmarks_2d(results.pose_landmarks)
        if self._smoother:
            landmarks_2d = self._smoother.apply("2d", landmarks_2d, ahora)

        return build_payload(points, bones, confidence, landmarks_2d=landmarks_2d)
```

Y en los dos retornos de `empty_payload()` (sin detección y baja confianza):

```python
        if self._smoother:
            self._smoother.reset()
        return empty_payload()
```

Agregar `import time` y `import numpy as np` (ya está numpy).

- [ ] **Step 4: Modificar la CLI**

En `main.py`, al parser:

```python
    parser.add_argument("--no-smooth", action="store_true", help="Desactiva el filtro")
    parser.add_argument("--min-cutoff", type=float, default=1.0, help="Hz en reposo")
    parser.add_argument("--beta", type=float, default=0.05, help="Adaptación a la velocidad")
    parser.add_argument("--d-cutoff", type=float, default=1.0, help="Hz de la derivada")
```

Y la construcción del motor:

```python
    engine = await asyncio.to_thread(
        PoseEngine,
        args.min_confidence,
        args.model_complexity,
        args.min_cutoff,
        args.beta,
        args.d_cutoff,
        not args.no_smooth,
    )
```

- [ ] **Step 5: Ajustar el helper `motor()` de los tests**

```python
def motor(resultados, min_confidence: float = 0.5, smooth: bool = True) -> PoseEngine:
    engine = object.__new__(PoseEngine)
    engine.min_confidence = min_confidence
    engine._smoother = PoseSmoother() if smooth else None
    engine._pose = PoseFalsa(resultados)
    return engine
```

- [ ] **Step 6: Ejecutar toda la suite**

Run: `.venv/bin/python -m pytest -q`
Expected: 41 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend tests
git commit -m "feat(backend): suavizado configurable en el motor y la CLI"
```

---

### Task 3: Documentación

**Files:**
- Modify: `docs/contract.md`
- Modify: `README.md`
- Modify: `AGENTS.md` §6

- [ ] **Step 1: `docs/contract.md`**

Agregar una nota en "Campos":

```markdown
Las posiciones llegan **ya filtradas** (One Euro, `--min-cutoff`/`--beta`/`--d-cutoff`).
`bones` se deriva de esas posiciones, así que es coherente con `landmarks`. Con
`--no-smooth` el payload sale crudo.
```

- [ ] **Step 2: `README.md`**

Agregar a la tabla de flags:

```markdown
| `--no-smooth` | — | Desactiva el filtro de suavizado |
| `--min-cutoff` | `1.0` | Hz: suavizado en reposo |
| `--beta` | `0.05` | Adaptación del filtro a la velocidad |
| `--d-cutoff` | `1.0` | Hz del estimador de velocidad |
```

- [ ] **Step 3: `AGENTS.md` §6**

Reemplazar el bullet de suavizado por:

```markdown
* **Parámetros del filtro de suavizado (One Euro):**
  - *Definido:* `min_cutoff = 1.0`, `beta = 0.05`, `d_cutoff = 1.0`, ajustables por
    CLI (`--min-cutoff`, `--beta`, `--d-cutoff`; `--no-smooth` lo apaga).
  - *Pendiente:* afinar los tres valores con la cámara física de la exhibición.
```

- [ ] **Step 4: Verificar**

Run: `.venv/bin/python -m pytest -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/contract.md README.md AGENTS.md
git commit -m "docs: documentar el filtro de suavizado"
```

---

### Task 4: Verificación en navegador

**Files:** ninguno.

- [ ] **Step 1: Levantar el backend con la cámara real**

```bash
.venv/bin/python -m backend.main --source 0
```

Esperado: arranca sin errores con los valores por defecto.

- [ ] **Step 2: Comparar filtro activo y apagado**

```bash
.venv/bin/python -m backend.main --source 0 --no-smooth
```

Con la app abierta, comparar el temblor en reposo y la respuesta en gestos rápidos.
Si queda temblor, bajar `--min-cutoff`; si arrastra, subir `--beta`.

- [ ] **Step 3: Reportar**

Dejar registrados los valores finales en `AGENTS.md` §6 si difieren de los defaults.

---

## Self-review

**Cobertura del spec:** módulo y algoritmo → Task 1; integración, orden de filtrado,
reset y `--no-smooth` → Task 2; parámetros y documentación → Task 3; verificación →
Task 4. Los casos de `dt <= 0`, primer frame y grupos separados están cubiertos por
tests de la Task 1.

**Placeholders:** ninguno.

**Consistencia:** `PoseSmoother.apply(grupo, datos, timestamp)` y `reset()` se usan
con la misma firma en el motor; los nombres de flags coinciden entre `main.py`,
README y `AGENTS.md`.
