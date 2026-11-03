# Piernas con IK y anclaje al piso — Plan de Implementación

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Articular muslos y pantorrillas con IK de dos huesos, clavar el pie de apoyo en el piso y dejar que la cadera acompañe la altura del sujeto.

**Architecture:** El backend agrega rodillas y tobillos a `landmarks` (posiciones). El frontend estima la escala con la longitud de pierna del sujeto, mueve la cadera solo en vertical, resuelve un IK analítico por pierna con el tobillo como objetivo y la rodilla del payload como *pole*, y congela el pie de apoyo.

**Tech Stack:** Python 3.10 (`mediapipe`, `numpy`, `pytest`), Three.js 0.187 vendorizado, Flask.

**Spec:** `docs/specs/2026-11-03-piernas-ik-design.md`

## Global Constraints

- `landmarks` con 13 puntos en metros, relativos al centro de cadera.
- `confidence` se calcula sobre los **9 puntos del tren superior** (no los 13).
- Transformación `x_3d = -x_mp`, `y_3d = -y_mp`, `z_3d = -z_mp` (no cambiar).
- Nunca estirar la malla: el objetivo se limita al 98 % del alcance (`AGENTS.md` §7).
- Sin dependencias nuevas. Sin desplazamiento horizontal del avatar.
- Suavizado: se conservan los `slerp` existentes.

---

### Task 1: Rodillas y tobillos en el contrato

**Files:**
- Modify: `backend/kinematics.py`
- Modify: `backend/pose_engine.py`
- Modify: `tests/test_kinematics.py`
- Modify: `tests/test_schema.py`
- Modify: `tests/test_pose_engine.py`

**Interfaces:**
- Consumes: `pose_world_landmarks` y `pose_landmarks` de MediaPipe.
- Produces: `landmarks` y `landmarks_2d` con `left_knee`, `right_knee`, `left_ankle`, `right_ankle`; `CORE_INDICES` para `confidence`.

- [ ] **Step 1: Escribir el test que falla**

En `tests/test_kinematics.py`:

```python
def test_landmarks_incluyen_el_tren_inferior():
    assert {"left_knee", "right_knee", "left_ankle", "right_ankle"} <= set(
        LANDMARK_KEYS.values()
    )
    assert len(LANDMARK_KEYS) == 13
```

En `tests/test_pose_engine.py`, dentro del test del contrato:

```python
    assert payload["landmarks"]["left_ankle"] == [-0.10, -1.00, 0.0]
    assert payload["landmarks_2d"]["right_ankle"] == [0.44, 0.95]
```

(Agregar esos puntos al fixture `pose_de_pie`: `world[25..28]` y `image[25..28]`.)

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `.venv/bin/python -m pytest tests/test_kinematics.py -k tren_inferior -v`
Expected: FAIL (`len(LANDMARK_KEYS) == 9`).

- [ ] **Step 3: Implementar los índices**

En `backend/kinematics.py`:

```python
LEFT_KNEE = 25
RIGHT_KNEE = 26
LEFT_ANKLE = 27
RIGHT_ANKLE = 28
```

y en `LANDMARK_KEYS`:

```python
    LEFT_KNEE: "left_knee",
    RIGHT_KNEE: "right_knee",
    LEFT_ANKLE: "left_ankle",
    RIGHT_ANKLE: "right_ankle",
```

Además, para que `confidence` no dependa de los pies:

```python
#: Puntos que definen la confianza del frame: si la cámara corta los pies, el
#: avatar no debe congelarse entero.
CORE_INDICES: tuple[int, ...] = (
    NOSE,
    LEFT_SHOULDER,
    RIGHT_SHOULDER,
    LEFT_ELBOW,
    RIGHT_ELBOW,
    LEFT_WRIST,
    RIGHT_WRIST,
    LEFT_HIP,
    RIGHT_HIP,
)
```

- [ ] **Step 4: Usar `CORE_INDICES` en el motor**

En `backend/pose_engine.py`:

```python
from backend.kinematics import CORE_INDICES, LANDMARK_KEYS, compute_bones, normalize_landmarks
...
        visibility = [float(raw[index].visibility) for index in CORE_INDICES]
```

`_landmarks_2d` sigue recorriendo `LANDMARK_KEYS`, así que toma los 13.

- [ ] **Step 5: Ejecutar toda la suite**

Run: `.venv/bin/python -m pytest -q`
Expected: 32 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend tests
git commit -m "feat(contrato): rodillas y tobillos para IK de piernas"
```

---

### Task 2: Documentar el contrato

**Files:**
- Modify: `docs/contract.md`
- Modify: `AGENTS.md` (§3 y §6)

**Interfaces:**
- Consumes: nada.
- Produces: contrato documentado.

- [ ] **Step 1: `docs/contract.md`**

- Tabla de claves de `landmarks`: agregar `left_knee`, `right_knee`, `left_ankle`, `right_ankle` (13 en total).
- Campo `confidence`: aclarar que promedia los 9 puntos del tren superior.
- Nuevo apartado "Tren inferior" con el uso de rodillas (pole) y tobillos (objetivo de IK), la estimación de escala y la altura de cadera.

- [ ] **Step 2: `AGENTS.md`**

- §3: agregar los 4 puntos al ejemplo de `landmarks` y a `landmarks_2d`.
- §6: marcar el paso 2 como hecho y dejar como pendiente solo el desplazamiento horizontal y la orientación de pie.

- [ ] **Step 3: Verificar**

Run: `.venv/bin/python -m pytest -q`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/contract.md AGENTS.md
git commit -m "docs: documentar el contrato del tren inferior"
```

---

### Task 3: Calibración, cadera vertical e IK

**Files:**
- Modify: `static/js/app.js`

**Interfaces:**
- Consumes: `landmarks.left_knee/right_knee/left_ankle/right_ankle`, huesos `mixamorigLeftUpLeg`, `mixamorigLeftLeg`, `mixamorigLeftFoot` (y sus pares derechos).
- Produces: `actualizarEscala()`, `actualizarAlturaCadera()`, `resolverPiernas()`, `resolverPierna()`.

- [ ] **Step 1: Estado nuevo**

Reemplazar `huesosPiernas` por:

```js
    piernas: null,        // { left: {muslo, pantorrilla, pie, l1, l2}, right: {...} }
    escalaPiernas: 0,     // unidades del modelo por metro del sujeto
    restAnkleY: 0,        // y mundo del tobillo en reposo
    restHipsY: 0,         // y local de la cadera en reposo
    restHipsWorldY: 0,    // y mundo de la cadera en reposo
    restFootQuat: { left: null, right: null },
    pieApoyo: null,
    framesApoyo: 0,
    apoyoXZ: null,
```

- [ ] **Step 2: Calibración al cargar**

Reemplazar el bloque de `nombresPiernas`/`huesosPiernas` por:

```js
            const cadera = estado.huesos3d['mixamorigHips'];
            const LADOS = {
                left: ['mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot'],
                right: ['mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot'],
            };
            const distancia = (a, b) => {
                const pa = new THREE.Vector3();
                const pb = new THREE.Vector3();
                a.getWorldPosition(pa);
                b.getWorldPosition(pb);
                return pa.distanceTo(pb);
            };
            estado.piernas = {};
            for (const [lado, [muslo, pantorrilla, pie]] of Object.entries(LADOS)) {
                const bMuslo = estado.huesos3d[muslo];
                const bPantorrilla = estado.huesos3d[pantorrilla];
                const bPie = estado.huesos3d[pie];
                if (!bMuslo || !bPantorrilla || !bPie) {
                    console.warn(`Rig incompleto: falta la pierna ${lado}`);
                    continue;
                }
                estado.piernas[lado] = {
                    muslo: bMuslo,
                    pantorrilla: bPantorrilla,
                    pie: bPie,
                    l1: distancia(bMuslo, bPantorrilla),
                    l2: distancia(bPantorrilla, bPie),
                };
                estado.restFootQuat[lado] = bPie.getWorldQuaternion(new THREE.Quaternion());
                estado.restAnkleY = bPie.getWorldPosition(new THREE.Vector3()).y;
            }
            if (cadera) {
                estado.restHipsY = cadera.position.y;
                estado.restHipsWorldY = cadera.getWorldPosition(new THREE.Vector3()).y;
            }
            const largos = Object.values(estado.piernas ?? {});
            if (largos.length) {
                const total = largos.reduce((s, p) => s + p.l1 + p.l2, 0) / largos.length;
                estado.escalaPiernas = total / 0.9; // arranque; se ajusta por frame
            }
```

Y registrar los segmentos de las piernas junto a los demás:

```js
            registrarSegmento('left_thigh', 'mixamorigLeftUpLeg', 'mixamorigLeftLeg');
            registrarSegmento('left_shin', 'mixamorigLeftLeg', 'mixamorigLeftFoot');
            registrarSegmento('right_thigh', 'mixamorigRightUpLeg', 'mixamorigRightLeg');
            registrarSegmento('right_shin', 'mixamorigRightLeg', 'mixamorigRightFoot');
```

- [ ] **Step 3: Escala y altura de cadera**

```js
function distanciaMetros(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Escala unidades/metro estimada con la longitud de pierna del sujeto. */
function actualizarEscala(landmarks) {
    const { left_knee: rI, right_knee: rD, left_ankle: tI, right_ankle: tD } = landmarks;
    if (!rI || !rD || !tI || !tD || !landmarks.left_hip || !landmarks.right_hip) return;

    const sujeto =
        (distanciaMetros(landmarks.left_hip, rI) + distanciaMetros(rI, tI) +
         distanciaMetros(landmarks.right_hip, rD) + distanciaMetros(rD, tD)) / 2;
    if (sujeto < 0.5) return;

    const largos = Object.values(estado.piernas ?? {});
    if (!largos.length) return;
    const avatar = largos.reduce((s, p) => s + p.l1 + p.l2, 0) / largos.length;
    const objetivo = Math.min(Math.max(avatar / sujeto, 80), 140);
    estado.escalaPiernas += (objetivo - estado.escalaPiernas) * 0.05;
}

/** Sube o baja la cadera para acompañar la altura del sujeto. */
function actualizarAlturaCadera(landmarks) {
    const cadera = estado.huesos3d['mixamorigHips'];
    const tobillos = [landmarks.left_ankle, landmarks.right_ankle].filter(Boolean);
    if (!cadera || !tobillos.length || !estado.escalaPiernas) return;

    const masBajo = Math.min(...tobillos.map((t) => t[1]));
    const mundo = estado.restAnkleY + Math.abs(masBajo) * estado.escalaPiernas;
    cadera.position.y = estado.restHipsY + (mundo - estado.restHipsWorldY);
    estado.modelo3d.updateMatrixWorld(true);
}
```

- [ ] **Step 4: Solver**

```js
/** Pie de apoyo: el tobillo más bajo, con histéresis de 3 frames. */
function actualizarApoyo(landmarks) {
    const tI = landmarks.left_ankle;
    const tD = landmarks.right_ankle;
    if (!tI || !tD) return;
    const candidato = tI[1] <= tD[1] ? 'left' : 'right';
    if (candidato === estado.pieApoyo) {
        estado.framesApoyo = 0;
        return;
    }
    estado.framesApoyo += 1;
    if (estado.framesApoyo >= 3) {
        estado.pieApoyo = candidato;
        estado.framesApoyo = 0;
        estado.apoyoXZ = null; // se recaptura al plantar
    }
}

function resolverPiernas(landmarks) {
    const cadera = estado.huesos3d['mixamorigHips'];
    if (!cadera || !estado.piernas || !landmarks?.left_ankle || !landmarks?.right_ankle) {
        volverAReposo();
        return;
    }

    actualizarApoyo(landmarks);
    const posCadera = cadera.getWorldPosition(new THREE.Vector3());

    for (const lado of ['left', 'right']) {
        resolverPierna(lado, landmarks[`${lado}_ankle`], landmarks[`${lado}_knee`], posCadera);
    }
}

function resolverPierna(lado, tobillo, rodilla, posCadera) {
    const pierna = estado.piernas[lado];
    if (!pierna || !tobillo) return;
    const { muslo, pantorrilla, pie, l1, l2 } = pierna;
    const escala = estado.escalaPiernas;

    const objetivo = new THREE.Vector3(
        posCadera.x + tobillo[0] * escala,
        posCadera.y + tobillo[1] * escala,
        posCadera.z + tobillo[2] * escala,
    );

    if (lado === estado.pieApoyo) {
        objetivo.y = estado.restAnkleY;
        if (!estado.apoyoXZ) estado.apoyoXZ = { x: objetivo.x, z: objetivo.z };
        objetivo.x = estado.apoyoXZ.x;
        objetivo.z = estado.apoyoXZ.z;
    } else {
        objetivo.y = Math.max(objetivo.y, estado.restAnkleY);
    }

    // Alcance: nunca estirar la malla.
    const v = objetivo.clone().sub(posCadera);
    const maxD = (l1 + l2) * 0.98;
    const minD = Math.abs(l1 - l2) + 1e-3;
    const d = Math.min(Math.max(v.length(), minD), maxD);
    v.setLength(d);
    objetivo.copy(posCadera).add(v);

    // Rodilla analítica con pole vector.
    const dir = v.clone().normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));

    let pole = null;
    if (rodilla) {
        const objetivoRodilla = new THREE.Vector3(
            posCadera.x + rodilla[0] * escala,
            posCadera.y + rodilla[1] * escala,
            posCadera.z + rodilla[2] * escala,
        );
        const rel = objetivoRodilla.sub(posCadera);
        const proyeccion = dir.clone().multiplyScalar(rel.dot(dir));
        pole = rel.sub(proyeccion);
        if (pole.lengthSq() < 1e-6) pole = null;
    }
    if (!pole) {
        // Frente del avatar: las rodillas se doblan hacia +Z.
        const frente = new THREE.Vector3(0, 0, 1);
        const proyeccion = dir.clone().multiplyScalar(frente.dot(dir));
        pole = frente.sub(proyeccion);
        if (pole.lengthSq() < 1e-6) pole = new THREE.Vector3(0, 0, 1);
    }
    pole.normalize();

    const posRodilla = posCadera
        .clone()
        .add(dir.clone().multiplyScalar(a))
        .add(pole.multiplyScalar(h));

    orientarHueso(
        muslo,
        estado.restWorldDirs[`${lado}_thigh`],
        estado.restWorldQuats[`${lado}_thigh`],
        posRodilla.clone().sub(posCadera).normalize(),
        0.4,
    );
    estado.modelo3d.updateMatrixWorld(true);
    orientarHueso(
        pantorrilla,
        estado.restWorldDirs[`${lado}_shin`],
        estado.restWorldQuats[`${lado}_shin`],
        objetivo.clone().sub(posRodilla).normalize(),
        0.4,
    );
    estado.modelo3d.updateMatrixWorld(true);

    // Pie nivelado: se conserva la orientación de reposo.
    const restQ = estado.restFootQuat[lado];
    if (pie && restQ) {
        const parentQ = new THREE.Quaternion();
        pie.parent.getWorldQuaternion(parentQ);
        pie.quaternion.slerp(parentQ.invert().multiply(restQ), 0.3);
        estado.modelo3d.updateMatrixWorld(true);
    }
}
```

- [ ] **Step 5: Enganchar en el flujo**

En `aplicarPose3D`, bloque `if (valido)`:

```js
        actualizarEscala(landmarks);
        actualizarAlturaCadera(landmarks);
        orientarCadera(bones);
        orientarTorso(bones);
        // ... brazos ...
        resolverPiernas(landmarks);
```

En el `else`, reemplazar `volverAReposo(); anclarPiernas();` por solo `volverAReposo();`.

En `volverAReposo`:

```js
        } else {
            // Incluye piernas y cadera; solo rotación.
            bone.quaternion.slerp(restQ, 0.08);
        }
```

y al final, devolver la altura:

```js
    if (estado.huesoCadera && estado.restHipsY) {
        estado.huesoCadera.position.y +=
            (estado.restHipsY - estado.huesoCadera.position.y) * 0.08;
    }
```

Eliminar `anclarPiernas` y las referencias a `huesosPiernas`.

- [ ] **Step 6: Verificar sintaxis**

Run: `node --input-type=module --check < static/js/app.js`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add static/js/app.js
git commit -m "feat(web): IK de dos huesos con pie de apoyo anclado"
```

---

### Task 4: Verificación en navegador

**Files:** ninguno.

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: evidencia de que el pie queda clavado y la cadera acompaña.

- [ ] **Step 1: Emisor sintético con tren inferior**

En `/tmp/opencode/fake_pose.py`, agregar a `landmarks` y `landmarks_2d` las 4 claves
nuevas y animar dos estados: agachada (rodillas flexionadas, cadera baja) y
levantamiento de un pie.

- [ ] **Step 2: Levantar servicios**

```bash
.venv/bin/python /tmp/opencode/fake_pose.py &
.venv/bin/python servidor.py &
```

- [ ] **Step 3: Medir**

Con `window.__mocap`, en varias muestras:

- `y` mundo del pie de apoyo ≈ `restAnkleY` (8.73) mientras está plantado.
- `y` mundo de la cadera baja durante la agachada y vuelve.
- `|cadera − tobillo| ≤ 0.98 · (l1 + l2)` siempre.

- [ ] **Step 4: Capturas**

Una en agachada y otra con un pie levantado.

- [ ] **Step 5: Cerrar procesos y reportar**

---

## Self-review

**Cobertura del spec:** contrato 13 puntos → Task 1; documentación → Task 2;
escala, cadera vertical, histéresis, solver, orden y degradaciones → Task 3;
evidencia → Task 4.

**Placeholders:** ninguno; todas las funciones están escritas.

**Consistencia:** `escalaPiernas`, `restAnkleY`, `restHipsY`, `restHipsWorldY`,
`pieApoyo`, `apoyoXZ` se definen en el Step 1 y se usan con el mismo nombre en los
Steps 2-5. Las claves `left_thigh`/`left_shin` se registran en el Step 2 y se
consumen en el Step 4.
