/**
 * Ciencias Encuentro 2026 - Muñeco 3D Humanoide & Reconstrucción de Pose
 * 
 * Lado izquierdo: Cámara web con esqueleto y torso extendido
 * Lado derecho: Muñeco 3D (Y-Bot de Adobe) con cinemática superior
 *               + opción alternable a Landmarks 2D detallados.
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createPoseSource } from '/static/js/pose-source.js';

// ============================================
// ESTADO GLOBAL
// ============================================
const estado = {
    ultimaPose: null, // payload del backend (contrato docs/contract.md)
    landmarksOverlay: null, // landmarks 2D derivados del payload, para el canvas
    estiloActual: 'neon',
    vistaActual: '3d', // '3d' por defecto | '2d' alternable
    particulasManos: [],
    confetis: [],
    fiesta: false,
    estadoConexion: 'connecting',

    // Sistema 3D (Three.js)
    escena3d: null,
    camara3d: null,
    renderizador3d: null,
    controles3d: null,
    modelo3d: null,
    huesos3d: {},
    restWorldDirs: {},
    restWorldQuats: {},
    restLocalQuats: new Map(),
    huesosPiernas: [],
    huesoCadera: null,
    cargando3d: true,
};

// ============================================
// ÍNDICES NATIVOS DE MEDIAPIPE POSE
// ============================================
const LM = {
    NOSE: 0,
    LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7, RIGHT_EAR: 8,
    MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
    LEFT_WRIST: 15, RIGHT_WRIST: 16,
    LEFT_PINKY: 17, RIGHT_PINKY: 18,
    LEFT_INDEX: 19, RIGHT_INDEX: 20,
    LEFT_THUMB: 21, RIGHT_THUMB: 22,
    LEFT_HIP: 23, RIGHT_HIP: 24,
    LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
    LEFT_HEEL: 29, RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
};

// ============================================
// CÁLCULO DE LANDMARKS EXTENDIDOS (TORSO Y CINTURA PARA ARRIBA)
// ============================================
function extraerLandmarksCompletos(landmarks, w, h, espejo = false) {
    if (!landmarks) return null;

    const pt = (idx) => {
        const lm = landmarks[idx];
        if (!lm) return null;
        // Aceptamos puntos con visibilidad >= 0.20 para evitar pérdidas bruscas en movimiento
        if (lm.visibility !== undefined && lm.visibility < 0.20) return null;
        return {
            x: espejo ? (1 - lm.x) * w : lm.x * w,
            y: lm.y * h,
            z: lm.z || 0,
            vis: lm.visibility ?? 1.0,
        };
    };

    const interp = (p1, p2, t = 0.5) => {
        if (!p1 || !p2) return null;
        return {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
            z: p1.z + (p2.z - p1.z) * t,
            vis: Math.min(p1.vis, p2.vis),
        };
    };

    const hI = pt(LM.LEFT_SHOULDER);
    const hD = pt(LM.RIGHT_SHOULDER);
    if (!hI || !hD) return null; // Anclaje fundamental para el tren superior

    let cI = pt(LM.LEFT_HIP);
    let cD = pt(LM.RIGHT_HIP);
    const nariz = pt(LM.NOSE);

    // Estimación geométrica en caso de que la cámara corte abajo de la cintura
    const distHombros = Math.hypot(hI.x - hD.x, hI.y - hD.y);
    const cuello = interp(hI, hD, 0.5);
    const alturaTorsoEst = distHombros * 1.35;

    let caderaCentro = null;
    if (cI && cD) {
        caderaCentro = interp(cI, cD, 0.5);
    } else if (cI && !cD) {
        caderaCentro = { x: cuello.x, y: cI.y, z: cI.z, vis: cI.vis * 0.9 };
        cD = { x: cuello.x + (cuello.x - cI.x), y: cI.y, z: cI.z, vis: cI.vis * 0.8 };
    } else if (cD && !cI) {
        caderaCentro = { x: cuello.x, y: cD.y, z: cD.z, vis: cD.vis * 0.9 };
        cI = { x: cuello.x - (cD.x - cuello.x), y: cD.y, z: cD.z, vis: cD.vis * 0.8 };
    } else {
        // Ninguna cadera visible: inferir cintura y caderas para que el torso NUNCA desaparezca
        caderaCentro = { x: cuello.x, y: cuello.y + alturaTorsoEst, z: cuello.z, vis: 0.7 };
        const semiAncho = distHombros * 0.42;
        cI = { x: cuello.x - semiAncho, y: cuello.y + alturaTorsoEst, z: cuello.z, vis: 0.7 };
        cD = { x: cuello.x + semiAncho, y: cuello.y + alturaTorsoEst, z: cuello.z, vis: 0.7 };
    }

    // ── ROSTRO Y CABEZA (Landmarks Nativos y Puntos Anatómicos) ──
    const ojoI_int = pt(LM.LEFT_EYE_INNER);
    const ojoI = pt(LM.LEFT_EYE);
    const ojoI_ext = pt(LM.LEFT_EYE_OUTER);
    const ojoD_int = pt(LM.RIGHT_EYE_INNER);
    const ojoD = pt(LM.RIGHT_EYE);
    const ojoD_ext = pt(LM.RIGHT_EYE_OUTER);
    const orejaI = pt(LM.LEFT_EAR);
    const orejaD = pt(LM.RIGHT_EAR);
    const bocaI = pt(LM.MOUTH_LEFT);
    const bocaD = pt(LM.MOUTH_RIGHT);
    const bocaCentro = (bocaI && bocaD) ? interp(bocaI, bocaD, 0.5) : null;

    // Frente (superior craneal)
    let frente = null;
    if (nariz && cuello) {
        frente = {
            x: nariz.x - (cuello.x - nariz.x) * 0.45,
            y: nariz.y - Math.abs(cuello.y - nariz.y) * 0.48,
            z: nariz.z,
            vis: nariz.vis,
        };
    } else if (ojoI && ojoD) {
        const entreOjos = interp(ojoI, ojoD, 0.5);
        frente = { x: entreOjos.x, y: entreOjos.y - distHombros * 0.20, z: entreOjos.z, vis: entreOjos.vis };
    }

    // Mentón
    const menton = bocaCentro && cuello 
        ? interp(bocaCentro, cuello, 0.35) 
        : (nariz && cuello ? interp(nariz, cuello, 0.65) : null);

    // Mandíbula lateral
    const mandibulaI = (menton && orejaI) ? interp(menton, orejaI, 0.45) : null;
    const mandibulaD = (menton && orejaD) ? interp(menton, orejaD, 0.45) : null;

    // ── COLUMNA Y CAJA TORÁCICA ──
    // Puntos vertebrales centrales
    const pechoSuperior = interp(cuello, caderaCentro, 0.18);
    const pecho = interp(cuello, caderaCentro, 0.36);
    const columnaMedia = interp(cuello, caderaCentro, 0.58);
    const ombligo = interp(cuello, caderaCentro, 0.80);

    // Clavículas
    const claviculaI = interp(cuello, hI, 0.5);
    const claviculaD = interp(cuello, hD, 0.5);

    // Pectorales
    const pectoralI = interp(pecho, hI, 0.5);
    const pectoralD = interp(pecho, hD, 0.5);

    // Costillas anatómicas completas
    const costillaSupI = interp(hI, cI, 0.28);
    const costillaSupD = interp(hD, cD, 0.28);
    const costillaMedI = interp(hI, cI, 0.50);
    const costillaMedD = interp(hD, cD, 0.50);
    const costillaInfI = interp(hI, cI, 0.72);
    const costillaInfD = interp(hD, cD, 0.72);

    // Cintura lateral
    const cinturaI = interp(hI, cI, 0.88);
    const cinturaD = interp(hD, cD, 0.88);

    // ── BRAZOS Y MANOS ──
    const codoI = pt(LM.LEFT_ELBOW);
    const codoD = pt(LM.RIGHT_ELBOW);
    const munecaI = pt(LM.LEFT_WRIST);
    const munecaD = pt(LM.RIGHT_WRIST);

    const bicepI = (hI && codoI) ? interp(hI, codoI, 0.5) : null;
    const bicepD = (hD && codoD) ? interp(hD, codoD, 0.5) : null;
    const antebrazoI = (codoI && munecaI) ? interp(codoI, munecaI, 0.5) : null;
    const antebrazoD = (codoD && munecaD) ? interp(codoD, munecaD, 0.5) : null;

    // Dedos
    const pinkyI = pt(LM.LEFT_PINKY);
    const pinkyD = pt(LM.RIGHT_PINKY);
    const indexI = pt(LM.LEFT_INDEX);
    const indexD = pt(LM.RIGHT_INDEX);
    const thumbI = pt(LM.LEFT_THUMB);
    const thumbD = pt(LM.RIGHT_THUMB);

    // Palmas y nudillos
    const palmaI = munecaI ? interp(munecaI, indexI || pinkyI || munecaI, 0.55) : null;
    const palmaD = munecaD ? interp(munecaD, indexD || pinkyD || munecaD, 0.55) : null;
    const nudilloI = (pinkyI && indexI) ? interp(pinkyI, indexI, 0.5) : null;
    const nudilloD = (pinkyD && indexD) ? interp(pinkyD, indexD, 0.5) : null;

    return {
        // Rostro y cabeza completos
        nose: nariz,
        forehead: frente,
        chin: menton,
        jaw_l: mandibulaI,
        jaw_r: mandibulaD,
        left_eye_inner: ojoI_int,
        left_eye: ojoI,
        left_eye_outer: ojoI_ext,
        right_eye_inner: ojoD_int,
        right_eye: ojoD,
        right_eye_outer: ojoD_ext,
        left_ear: orejaI,
        right_ear: orejaD,
        mouth_left: bocaI,
        mouth_right: bocaD,
        mouth_center: bocaCentro,

        // Torso, columna y cintura
        neck: cuello,
        collarbone_l: claviculaI,
        collarbone_r: claviculaD,
        chest_upper: pechoSuperior,
        chest: pecho,
        pectoral_l: pectoralI,
        pectoral_r: pectoralD,
        mid_spine: columnaMedia,
        navel: ombligo,
        hip_center: caderaCentro,
        rib_upper_l: costillaSupI,
        rib_upper_r: costillaSupD,
        rib_mid_l: costillaMedI,
        rib_mid_r: costillaMedD,
        rib_lower_l: costillaInfI,
        rib_lower_r: costillaInfD,
        waist_l: cinturaI,
        waist_r: cinturaD,

        // Hombros y caderas
        left_shoulder: hI,
        right_shoulder: hD,
        left_hip: cI,
        right_hip: cD,

        // Brazos
        left_elbow: codoI,
        right_elbow: codoD,
        left_wrist: munecaI,
        right_wrist: munecaD,
        bicep_l: bicepI,
        bicep_r: bicepD,
        forearm_l: antebrazoI,
        forearm_r: antebrazoD,

        // Manos y dedos completos
        left_pinky: pinkyI,
        right_pinky: pinkyD,
        left_index: indexI,
        right_index: indexD,
        left_thumb: thumbI,
        right_thumb: thumbD,
        palm_l: palmaI,
        palm_r: palmaD,
        knuckle_l: nudilloI,
        knuckle_r: nudilloD,

        // Piernas (ancladas fijas al piso)
        left_knee: pt(LM.LEFT_KNEE),
        right_knee: pt(LM.RIGHT_KNEE),
        left_ankle: pt(LM.LEFT_ANKLE),
        right_ankle: pt(LM.RIGHT_ANKLE),
        left_heel: pt(LM.LEFT_HEEL),
        right_heel: pt(LM.RIGHT_HEEL),
        left_foot: pt(LM.LEFT_FOOT_INDEX),
        right_foot: pt(LM.RIGHT_FOOT_INDEX),
    };
}

// Paletas de colores por estilo
const PALETAS = {
    neon: {
        fondo: '#0a0e1a',
        columna: '#00FFFF',
        torso: '#4ECDC4',
        costillas: '#38EF7D',
        brazoIzq: '#FF6B6B',
        brazoDer: '#A855F7',
        manoIzq: '#FF8E53',
        manoDer: '#C084FC',
        dedos: '#FFE66D',
        cara: '#FFD166',
        ojos: '#00FFFF',
        boca: '#FF6B6B',
        piernaIzq: '#06D6A0',
        piernaDer: '#FFD166',
        articulacion: '#FFFFFF',
        pecho: '#FFE66D',
        cabeza: '#FFE66D',
        glow: 18,
    },
    robot: {
        fondo: '#05111a',
        columna: '#00F0FF',
        torso: '#00D4FF',
        costillas: '#00A3FF',
        brazoIzq: '#00E5FF',
        brazoDer: '#00E5FF',
        manoIzq: '#FFFFFF',
        manoDer: '#FFFFFF',
        dedos: '#80E5FF',
        cara: '#80E5FF',
        ojos: '#FFFFFF',
        boca: '#00F0FF',
        piernaIzq: '#0077B6',
        piernaDer: '#0077B6',
        articulacion: '#00F0FF',
        pecho: '#00FFFF',
        cabeza: '#00FFFF',
        glow: 22,
    },
    arcade: {
        fondo: '#100720',
        columna: '#FFE600',
        torso: '#39FF14',
        costillas: '#00F5D4',
        brazoIzq: '#FF007F',
        brazoDer: '#FF007F',
        manoIzq: '#FFE600',
        manoDer: '#FFE600',
        dedos: '#FF8E53',
        cara: '#FFE600',
        ojos: '#39FF14',
        boca: '#FF007F',
        piernaIzq: '#7B2CBF',
        piernaDer: '#7B2CBF',
        articulacion: '#FFE600',
        pecho: '#FF007F',
        cabeza: '#FF007F',
        glow: 16,
    },
};

// ============================================
// DIBUJO DEL ESQUELETO COMPLETO Y DETALLADO
// ============================================
function dibujarEsqueletoDetallado(ctx, P, paleta, grosor = 6) {
    if (!P) return;

    const linea = (p1, p2, color, ancho = grosor) => {
        if (!p1 || !p2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = ancho;
        ctx.shadowColor = color;
        ctx.shadowBlur = paleta.glow;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ── 1. CABEZA, ROSTRO Y CONTORNO CRANEAL ──
    // Contorno superior y frente
    linea(P.forehead, P.left_ear, paleta.cara, grosor - 2);
    linea(P.forehead, P.right_ear, paleta.cara, grosor - 2);
    linea(P.forehead, P.nose, paleta.cara, grosor - 1);

    // Ojos y cejas
    linea(P.left_eye_inner, P.left_eye, paleta.ojos, grosor - 2);
    linea(P.left_eye, P.left_eye_outer, paleta.ojos, grosor - 2);
    linea(P.left_eye_outer, P.left_ear, paleta.ojos, grosor - 2);
    linea(P.right_eye_inner, P.right_eye, paleta.ojos, grosor - 2);
    linea(P.right_eye, P.right_eye_outer, paleta.ojos, grosor - 2);
    linea(P.right_eye_outer, P.right_ear, paleta.ojos, grosor - 2);
    linea(P.left_eye_inner, P.right_eye_inner, paleta.ojos, grosor - 2);

    // Nariz hacia ojos y boca
    linea(P.nose, P.left_eye_inner, paleta.cara, grosor - 2);
    linea(P.nose, P.right_eye_inner, paleta.cara, grosor - 2);
    linea(P.nose, P.mouth_center, paleta.cara, grosor - 2);
    linea(P.nose, P.mouth_left, paleta.cara, grosor - 3);
    linea(P.nose, P.mouth_right, paleta.cara, grosor - 3);

    // Boca y sonrisa
    linea(P.mouth_left, P.mouth_center, paleta.boca, grosor - 1);
    linea(P.mouth_center, P.mouth_right, paleta.boca, grosor - 1);
    linea(P.mouth_left, P.mouth_right, paleta.boca, grosor - 2);

    // Mandíbula y mentón
    linea(P.mouth_left, P.chin, paleta.cara, grosor - 2);
    linea(P.mouth_center, P.chin, paleta.cara, grosor - 2);
    linea(P.mouth_right, P.chin, paleta.cara, grosor - 2);
    linea(P.left_ear, P.jaw_l, paleta.cara, grosor - 2);
    linea(P.jaw_l, P.chin, paleta.cara, grosor - 2);
    linea(P.right_ear, P.jaw_r, paleta.cara, grosor - 2);
    linea(P.jaw_r, P.chin, paleta.cara, grosor - 2);

    // Conexión cervical y trapecios (cuello)
    linea(P.chin, P.neck, paleta.columna, grosor + 1);
    linea(P.left_ear, P.left_shoulder, paleta.torso, Math.max(2, grosor - 2));
    linea(P.right_ear, P.right_shoulder, paleta.torso, Math.max(2, grosor - 2));

    // ── 2. CLAVÍCULAS Y HOMBROS ──
    linea(P.neck, P.collarbone_l, paleta.torso, grosor + 1);
    linea(P.collarbone_l, P.left_shoulder, paleta.torso, grosor + 1);
    linea(P.neck, P.collarbone_r, paleta.torso, grosor + 1);
    linea(P.collarbone_r, P.right_shoulder, paleta.torso, grosor + 1);
    linea(P.left_shoulder, P.right_shoulder, paleta.torso, grosor - 1); // Barra clavicular completa

    // ── 3. COLUMNA VERTEBRAL CENTRAL (Eje conductor) ──
    linea(P.neck, P.chest_upper, paleta.columna, grosor + 2);
    linea(P.chest_upper, P.chest, paleta.columna, grosor + 2);
    linea(P.chest, P.mid_spine, paleta.columna, grosor + 2);
    linea(P.mid_spine, P.navel, paleta.columna, grosor + 2);
    linea(P.navel, P.hip_center, paleta.columna, grosor + 2);

    // ── 4. CAJA TORÁCICA Y PECTORALES ──
    // Pectorales y esternón superior
    linea(P.chest_upper, P.left_shoulder, paleta.costillas, grosor);
    linea(P.chest_upper, P.right_shoulder, paleta.costillas, grosor);
    linea(P.chest, P.pectoral_l, paleta.costillas, grosor);
    linea(P.pectoral_l, P.left_shoulder, paleta.costillas, grosor - 1);
    linea(P.pectoral_l, P.rib_upper_l, paleta.costillas, grosor - 1);
    linea(P.chest, P.pectoral_r, paleta.costillas, grosor);
    linea(P.pectoral_r, P.right_shoulder, paleta.costillas, grosor - 1);
    linea(P.pectoral_r, P.rib_upper_r, paleta.costillas, grosor - 1);

    // Costillas superiores, medias e inferiores
    linea(P.chest, P.rib_upper_l, paleta.costillas, grosor);
    linea(P.chest, P.rib_upper_r, paleta.costillas, grosor);
    linea(P.mid_spine, P.rib_mid_l, paleta.costillas, grosor);
    linea(P.mid_spine, P.rib_mid_r, paleta.costillas, grosor);
    linea(P.mid_spine, P.rib_lower_l, paleta.costillas, grosor);
    linea(P.mid_spine, P.rib_lower_r, paleta.costillas, grosor);
    linea(P.rib_lower_l, P.navel, paleta.costillas, grosor - 1);
    linea(P.rib_lower_r, P.navel, paleta.costillas, grosor - 1);

    // Contorno lateral del torso
    linea(P.left_shoulder, P.rib_upper_l, paleta.torso, grosor);
    linea(P.rib_upper_l, P.rib_mid_l, paleta.torso, grosor);
    linea(P.rib_mid_l, P.rib_lower_l, paleta.torso, grosor);
    linea(P.rib_lower_l, P.waist_l, paleta.torso, grosor);
    linea(P.waist_l, P.left_hip, paleta.torso, grosor);

    linea(P.right_shoulder, P.rib_upper_r, paleta.torso, grosor);
    linea(P.rib_upper_r, P.rib_mid_r, paleta.torso, grosor);
    linea(P.rib_mid_r, P.rib_lower_r, paleta.torso, grosor);
    linea(P.rib_lower_r, P.waist_r, paleta.torso, grosor);
    linea(P.waist_r, P.right_hip, paleta.torso, grosor);

    // ── 5. CINTURA Y CINTURÓN PÉLVICO ──
    linea(P.navel, P.waist_l, paleta.costillas, grosor - 1);
    linea(P.navel, P.waist_r, paleta.costillas, grosor - 1);
    linea(P.navel, P.left_hip, paleta.costillas, grosor - 1);
    linea(P.navel, P.right_hip, paleta.costillas, grosor - 1);

    // Cinturón pélvico cerrado
    linea(P.hip_center, P.left_hip, paleta.torso, grosor + 1);
    linea(P.hip_center, P.right_hip, paleta.torso, grosor + 1);
    linea(P.left_hip, P.right_hip, paleta.torso, grosor);
    linea(P.waist_l, P.hip_center, paleta.torso, grosor - 1);
    linea(P.waist_r, P.hip_center, paleta.torso, grosor - 1);

    // ── 6. BRAZO IZQUIERDO (Hombro -> Bíceps -> Codo -> Antebrazo -> Muñeca) ──
    linea(P.left_shoulder, P.bicep_l, paleta.brazoIzq, grosor);
    linea(P.bicep_l, P.left_elbow, paleta.brazoIzq, grosor);
    linea(P.left_shoulder, P.left_elbow, paleta.brazoIzq, grosor - 2); // Respaldo continuo
    linea(P.left_elbow, P.forearm_l, paleta.brazoIzq, grosor);
    linea(P.forearm_l, P.left_wrist, paleta.brazoIzq, grosor);
    linea(P.left_elbow, P.left_wrist, paleta.brazoIzq, grosor - 2); // Respaldo continuo

    // Mano izquierda completa
    linea(P.left_wrist, P.palm_l, paleta.manoIzq, grosor);
    linea(P.left_wrist, P.left_thumb, paleta.dedos, grosor - 1);
    linea(P.left_wrist, P.left_index, paleta.dedos, grosor - 1);
    linea(P.left_wrist, P.left_pinky, paleta.dedos, grosor - 1);
    linea(P.palm_l, P.left_thumb, paleta.dedos, grosor - 1);
    linea(P.palm_l, P.left_index, paleta.dedos, grosor - 1);
    linea(P.palm_l, P.left_pinky, paleta.dedos, grosor - 1);
    linea(P.left_pinky, P.knuckle_l, paleta.dedos, grosor - 2);
    linea(P.knuckle_l, P.left_index, paleta.dedos, grosor - 2);
    linea(P.left_index, P.left_thumb, paleta.dedos, grosor - 2);

    // ── 7. BRAZO DERECHO (Hombro -> Bíceps -> Codo -> Antebrazo -> Muñeca) ──
    linea(P.right_shoulder, P.bicep_r, paleta.brazoDer, grosor);
    linea(P.bicep_r, P.right_elbow, paleta.brazoDer, grosor);
    linea(P.right_shoulder, P.right_elbow, paleta.brazoDer, grosor - 2); // Respaldo continuo
    linea(P.right_elbow, P.forearm_r, paleta.brazoDer, grosor);
    linea(P.forearm_r, P.right_wrist, paleta.brazoDer, grosor);
    linea(P.right_elbow, P.right_wrist, paleta.brazoDer, grosor - 2); // Respaldo continuo

    // Mano derecha completa
    linea(P.right_wrist, P.palm_r, paleta.manoDer, grosor);
    linea(P.right_wrist, P.right_thumb, paleta.dedos, grosor - 1);
    linea(P.right_wrist, P.right_index, paleta.dedos, grosor - 1);
    linea(P.right_wrist, P.right_pinky, paleta.dedos, grosor - 1);
    linea(P.palm_r, P.right_thumb, paleta.dedos, grosor - 1);
    linea(P.palm_r, P.right_index, paleta.dedos, grosor - 1);
    linea(P.palm_r, P.right_pinky, paleta.dedos, grosor - 1);
    linea(P.right_pinky, P.knuckle_r, paleta.dedos, grosor - 2);
    linea(P.knuckle_r, P.right_index, paleta.dedos, grosor - 2);
    linea(P.right_index, P.right_thumb, paleta.dedos, grosor - 2);

    // ── 8. PIERNAS FIJAS AL PISO ──
    linea(P.left_hip, P.left_knee, paleta.piernaIzq, grosor);
    linea(P.left_knee, P.left_ankle, paleta.piernaIzq, grosor);
    linea(P.left_ankle, P.left_heel, paleta.piernaIzq, grosor);
    linea(P.left_heel, P.left_foot, paleta.piernaIzq, grosor);

    linea(P.right_hip, P.right_knee, paleta.piernaDer, grosor);
    linea(P.right_knee, P.right_ankle, paleta.piernaDer, grosor);
    linea(P.right_ankle, P.right_heel, paleta.piernaDer, grosor);
    linea(P.right_heel, P.right_foot, paleta.piernaDer, grosor);

    ctx.shadowBlur = 0;

    // ── 9. ARTICULACIONES / NODOS LUMINOSOS DE TODOS LOS LANDMARKS ──
    const dibujarNodo = (pt, color = paleta.articulacion, radio = 7, esRombo = false) => {
        if (!pt) return;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = paleta.glow;

        ctx.beginPath();
        if (esRombo) {
            ctx.moveTo(pt.x, pt.y - radio * 1.35);
            ctx.lineTo(pt.x + radio * 1.35, pt.y);
            ctx.lineTo(pt.x, pt.y + radio * 1.35);
            ctx.lineTo(pt.x - radio * 1.35, pt.y);
            ctx.closePath();
        } else {
            ctx.arc(pt.x, pt.y, radio, 0, Math.PI * 2);
        }
        ctx.fill();

        // Núcleo blanco nítido
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(2, radio * 0.45), 0, Math.PI * 2);
        ctx.fill();
    };

    // Nodos faciales
    dibujarNodo(P.forehead, paleta.cara, 5);
    dibujarNodo(P.nose, paleta.cara, 6);
    dibujarNodo(P.left_eye_inner, paleta.ojos, 4);
    dibujarNodo(P.left_eye, paleta.ojos, 5);
    dibujarNodo(P.left_eye_outer, paleta.ojos, 4);
    dibujarNodo(P.right_eye_inner, paleta.ojos, 4);
    dibujarNodo(P.right_eye, paleta.ojos, 5);
    dibujarNodo(P.right_eye_outer, paleta.ojos, 4);
    dibujarNodo(P.left_ear, paleta.cara, 5);
    dibujarNodo(P.right_ear, paleta.cara, 5);
    dibujarNodo(P.mouth_left, paleta.boca, 4);
    dibujarNodo(P.mouth_center, paleta.boca, 5);
    dibujarNodo(P.mouth_right, paleta.boca, 4);
    dibujarNodo(P.chin, paleta.cara, 5);
    dibujarNodo(P.jaw_l, paleta.cara, 4);
    dibujarNodo(P.jaw_r, paleta.cara, 4);

    // Nodos vertebrales de la columna y clavículas
    dibujarNodo(P.neck, paleta.columna, 8);
    dibujarNodo(P.collarbone_l, paleta.torso, 5);
    dibujarNodo(P.collarbone_r, paleta.torso, 5);
    dibujarNodo(P.chest_upper, paleta.columna, 6);
    dibujarNodo(P.chest, paleta.pecho, 10, true);       // Esternón central (gran rombo)
    dibujarNodo(P.pectoral_l, paleta.costillas, 5);
    dibujarNodo(P.pectoral_r, paleta.costillas, 5);
    dibujarNodo(P.mid_spine, paleta.columna, 7);       // Vértebra media
    dibujarNodo(P.navel, paleta.columna, 7);           // Ombligo
    dibujarNodo(P.hip_center, paleta.columna, 8);      // Pelvis central

    // Nodos de costillas y cintura
    dibujarNodo(P.rib_upper_l, paleta.costillas, 5);
    dibujarNodo(P.rib_upper_r, paleta.costillas, 5);
    dibujarNodo(P.rib_mid_l, paleta.costillas, 5);
    dibujarNodo(P.rib_mid_r, paleta.costillas, 5);
    dibujarNodo(P.rib_lower_l, paleta.costillas, 5);
    dibujarNodo(P.rib_lower_r, paleta.costillas, 5);
    dibujarNodo(P.waist_l, paleta.costillas, 5);
    dibujarNodo(P.waist_r, paleta.costillas, 5);

    // Nodos de hombros y brazos
    dibujarNodo(P.left_shoulder, paleta.articulacion, 9);
    dibujarNodo(P.right_shoulder, paleta.articulacion, 9);
    dibujarNodo(P.bicep_l, paleta.brazoIzq, 5);
    dibujarNodo(P.bicep_r, paleta.brazoDer, 5);
    dibujarNodo(P.left_elbow, paleta.articulacion, 8);
    dibujarNodo(P.right_elbow, paleta.articulacion, 8);
    dibujarNodo(P.forearm_l, paleta.brazoIzq, 5);
    dibujarNodo(P.forearm_r, paleta.brazoDer, 5);
    dibujarNodo(P.left_wrist, paleta.articulacion, 7);
    dibujarNodo(P.right_wrist, paleta.articulacion, 7);

    // Nodos de manos y dedos
    dibujarNodo(P.palm_l, paleta.manoIzq, 6);
    dibujarNodo(P.palm_r, paleta.manoDer, 6);
    dibujarNodo(P.knuckle_l, paleta.dedos, 4);
    dibujarNodo(P.knuckle_r, paleta.dedos, 4);
    dibujarNodo(P.left_thumb, paleta.dedos, 5);
    dibujarNodo(P.right_thumb, paleta.dedos, 5);
    dibujarNodo(P.left_index, paleta.dedos, 5);
    dibujarNodo(P.right_index, paleta.dedos, 5);
    dibujarNodo(P.left_pinky, paleta.dedos, 5);
    dibujarNodo(P.right_pinky, paleta.dedos, 5);

    // Nodos de piernas y pies
    dibujarNodo(P.left_hip, paleta.articulacion, 9);
    dibujarNodo(P.right_hip, paleta.articulacion, 9);
    dibujarNodo(P.left_knee, paleta.articulacion, 8);
    dibujarNodo(P.right_knee, paleta.articulacion, 8);
    dibujarNodo(P.left_ankle, paleta.articulacion, 7);
    dibujarNodo(P.right_ankle, paleta.articulacion, 7);
    dibujarNodo(P.left_heel, paleta.articulacion, 5);
    dibujarNodo(P.right_heel, paleta.articulacion, 5);
    dibujarNodo(P.left_foot, paleta.articulacion, 6);
    dibujarNodo(P.right_foot, paleta.articulacion, 6);

    ctx.shadowBlur = 0;
}

// ============================================
// DIBUJO DEL LADO DERECHO (RECONSTRUCCIÓN EN ESPEJO)
// ============================================
function renderizarEspacioLandmarks() {
    const canvas = document.getElementById('canvas-landmarks');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;

    if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    const w = canvas.width;
    const h = canvas.height;
    const paleta = PALETAS[estado.estiloActual] || PALETAS.neon;

    // Fondo limpio
    ctx.fillStyle = paleta.fondo;
    ctx.fillRect(0, 0, w, h);

    // Escenario decorativo
    dibujarEscenarioDecorativo(ctx, w, h, paleta);

    const avisoSinPose = document.getElementById('aviso-sin-pose');

    // Extraer landmarks extendidos en modo espejo (espejo = true)
    const P = extraerLandmarksCompletos(estado.poseActual, w, h, true);

    if (!P) {
        if (avisoSinPose) avisoSinPose.classList.remove('oculto');
        animarParticulasManos(ctx);
        return;
    }

    if (avisoSinPose) avisoSinPose.classList.add('oculto');

    // 1. Halo craneal translúcido de fondo (no cubre los landmarks faciales)
    if (P.nose) {
        let radioCabeza = 28;
        if (P.left_shoulder && P.right_shoulder) {
            const dist = Math.hypot(P.left_shoulder.x - P.right_shoulder.x, P.left_shoulder.y - P.right_shoulder.y);
            radioCabeza = Math.max(22, Math.min(50, dist * 0.28));
        }

        ctx.save();
        ctx.fillStyle = `${paleta.cabeza}18`; // Translúcido al 10%
        ctx.strokeStyle = `${paleta.cabeza}55`;
        ctx.lineWidth = 2;
        ctx.shadowColor = paleta.cabeza;
        ctx.shadowBlur = paleta.glow;

        ctx.beginPath();
        ctx.arc(P.nose.x, P.nose.y - radioCabeza * 0.15, radioCabeza * 1.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // 2. Dibujar el esqueleto con todos los landmarks y conexiones de la cintura para arriba
    dibujarEsqueletoDetallado(ctx, P, paleta, 7);

    // 3. Partículas de estela en las palmas
    if (P.palm_l && Math.random() < 0.6) {
        crearParticulaMano(P.palm_l.x, P.palm_l.y, paleta.manoIzq);
    }
    if (P.palm_r && Math.random() < 0.6) {
        crearParticulaMano(P.palm_r.x, P.palm_r.y, paleta.manoDer);
    }

    animarParticulasManos(ctx);
}

// Escenario decorativo de fondo
function dibujarEscenarioDecorativo(ctx, w, h, paleta) {
    const cx = w / 2;
    const cy = h * 0.88;

    for (let i = 1; i <= 3; i++) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 * i})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, (w * 0.35) * (i / 3), 35 * (i / 3), 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h);
    ctx.lineTo(cx, cy);
    ctx.moveTo(w * 0.9, h);
    ctx.lineTo(cx, cy);
    ctx.stroke();
}

function crearParticulaMano(x, y, color) {
    estado.particulasManos.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3 - 1,
        radio: Math.random() * 5 + 3,
        color: color,
        vida: 1.0,
    });
}

function animarParticulasManos(ctx) {
    for (let i = estado.particulasManos.length - 1; i >= 0; i--) {
        const p = estado.particulasManos[i];
        p.x += p.vx;
        p.y += p.vy;
        p.radio *= 0.94;
        p.vida -= 0.04;

        if (p.vida <= 0 || p.radio < 0.5) {
            estado.particulasManos.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.globalAlpha = p.vida;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radio, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ============================================
// DIBUJO DEL LADO IZQUIERDO (OVERLAY DE CÁMARA)
// ============================================
function dibujarOverlayCamara(ctx, landmarks, w, h) {
    // En el canvas sobre el video, extraemos sin modo espejo (espejo = false, ya que el video usa scaleX(-1))
    const P = extraerLandmarksCompletos(landmarks, w, h, false);
    if (!P) return;

    // Paleta ligera y de alto contraste para el video en vivo
    const paletaCamara = {
        columna: '#00FFFF',
        torso: '#00F0FF',
        costillas: '#38EF7D',
        brazoIzq: '#00F0FF',
        brazoDer: '#00F0FF',
        manoIzq: '#FFE600',
        manoDer: '#FFE600',
        piernaIzq: '#FF007F',
        piernaDer: '#FF007F',
        articulacion: '#FFFFFF',
        pecho: '#FFE600',
        cabeza: '#00F0FF',
        cara: '#FFD166',
        ojos: '#00FFFF',
        boca: '#FF6B6B',
        dedos: '#FFE600',
        glow: 8,
    };

    dibujarEsqueletoDetallado(ctx, P, paletaCamara, 4);
}

// ============================================
// MEDIAPIPE POSE EN EL NAVEGADOR
// ============================================
function iniciarMediaPipe() {
    const videoEl = document.getElementById('video-entrada');
    const canvasEl = document.getElementById('canvas-pose');
    if (!videoEl || !canvasEl) return;
    const ctx = canvasEl.getContext('2d');

    const pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        ctx.save();
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

        if (results.poseLandmarks) {
            estado.poseActual = results.poseLandmarks;
            dibujarOverlayCamara(ctx, results.poseLandmarks, canvasEl.width, canvasEl.height);
        } else {
            estado.poseActual = null;
        }
        ctx.restore();
    });

    const camera = new Camera(videoEl, {
        onFrame: async () => { await pose.send({ image: videoEl }); },
        width: 640,
        height: 480,
    });
    camera.start();
}

// ============================================
// WEBSOCKET BACKEND (FUENTE ÚNICA DE POSE)
// ============================================
//: Metros que cubre el alto del encuadre de los paneles 2D.
const ESCALA_VISTA = 1.4;

//: Índice de MediaPipe de cada landmark del contrato.
const INDICE_OVERLAY = {
    nose: 0,
    left_shoulder: 11,
    right_shoulder: 12,
    left_elbow: 13,
    right_elbow: 14,
    left_wrist: 15,
    right_wrist: 16,
    left_hip: 23,
    right_hip: 24,
};

/**
 * Proyecta los landmarks del payload (metros, cadera al origen, X ya espejada)
 * al formato normalizado 0..1 que consumen `extraerLandmarksCompletos` y el
 * overlay. Devuelve un arreglo disperso de 33 posiciones.
 */
function payloadALandmarks2D(payload) {
    if (!payload?.detected) return null;
    const salida = new Array(33).fill(null);
    for (const [clave, idx] of Object.entries(INDICE_OVERLAY)) {
        const p = payload.landmarks?.[clave];
        if (!p) continue;
        salida[idx] = {
            x: 0.5 + p[0] / (2 * ESCALA_VISTA),
            y: 0.5 - p[1] / (2 * ESCALA_VISTA),
            z: p[2],
            visibility: payload.confidence ?? 1,
        };
    }
    return salida;
}

function conectarBackend() {
    const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
    const fuente = createPoseSource({
        // Mismo host que sirvió la página: funciona en LAN sin tocar el código.
        url: `${protocolo}://${location.hostname}:8765`,
        onPose: (payload) => {
            estado.ultimaPose = payload;
            estado.landmarksOverlay = payloadALandmarks2D(payload);
        },
        onStatus: ({ state }) => {
            const etiqueta = {
                connecting: '○ conectando',
                connected: '● conectado',
                disconnected: '○ sin backend',
                error: '× error',
            };
            estado.estadoConexion = state;
            console.info('MoCap:', etiqueta[state] ?? state);
        },
    });
    return fuente;
}

// ============================================
// CONFETI 🎉
// ============================================
function lanzarConfeti() {
    const canvas = document.getElementById('canvas-confeti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colores = ['#FF6B6B','#4ECDC4','#FFE66D','#6C63FF','#FF8E53',
                     '#A855F7','#06D6A0','#FFD166','#EF476F','#F093FB'];

    for (let i = 0; i < 160; i++) {
        estado.confetis.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 12 + 5,
            h: Math.random() * 8 + 4,
            color: colores[Math.floor(Math.random() * colores.length)],
            vy: Math.random() * 5 + 3,
            vx: (Math.random() - 0.5) * 4,
            rot: Math.random() * Math.PI * 2,
            rv: (Math.random() - 0.5) * 0.2,
            vida: 1.0,
        });
    }
    estado.fiesta = true;
    setTimeout(() => {
        estado.fiesta = false;
        estado.confetis = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 4000);
}

function animarConfeti() {
    if (!estado.fiesta || !estado.confetis.length) return;
    const canvas = document.getElementById('canvas-confeti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const c of estado.confetis) {
        c.y += c.vy; c.x += c.vx; c.rot += c.rv; c.vida -= 0.003;
        if (c.vida <= 0) continue;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.globalAlpha = c.vida;
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w/2, -c.h/2, c.w, c.h);
        ctx.restore();
    }
}

// ============================================
// MÓDULO 3D THREE.JS - MUÑECO HUMANOIDE (Y-BOT DE ADOBE)
// ============================================
function registrarSegmento(key, boneName, childName) {
    const b = estado.huesos3d[boneName];
    const c = estado.huesos3d[childName];
    if (!b || !c) {
        console.warn(`Rig incompleto: faltan ${boneName} o ${childName}`);
        return;
    }
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();
    b.getWorldPosition(pB);
    c.getWorldPosition(pC);
    estado.restWorldDirs[key] = new THREE.Vector3().subVectors(pC, pB).normalize();
    const q = new THREE.Quaternion();
    b.getWorldQuaternion(q);
    estado.restWorldQuats[key] = q;
}

function orientarHueso(bone, restDir, restWorldQuat, targetDir, slerpFactor = 0.28) {
    if (!bone || !bone.parent || !targetDir || targetDir.lengthSq() < 0.001) return;
    // 1. Delta en espacio de mundo desde la dirección de reposo hacia el objetivo
    const deltaQ = new THREE.Quaternion().setFromUnitVectors(restDir, targetDir);
    const targetWorldQ = deltaQ.multiply(restWorldQuat);

    // 2. Transformar a coordenadas locales del hueso padre
    const parentWorldQ = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentWorldQ);
    const localQ = parentWorldQ.clone().invert().multiply(targetWorldQ);

    // 3. Suavizado e interpolación
    bone.quaternion.slerp(localQ, slerpFactor);
}

function iniciarThreeJS() {
    const container = document.getElementById('contenedor-3d');
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;

    // 1. Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d1a);
    scene.fog = new THREE.FogExp2(0x080d1a, 0.0018);
    estado.escena3d = scene;

    // 2. Cámara (enfocada al cuerpo completo y centrada en el torso)
    const camera = new THREE.PerspectiveCamera(42, width / height, 1, 1000);
    camera.position.set(0, 115, 275);
    camera.lookAt(0, 100, 0);
    estado.camara3d = camera;

    // 3. Renderizador WebGL
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    estado.renderizador3d = renderer;

    // 4. Controles orbitales (para rotar e interactuar con el muñeco)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 100, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // No permitir pasar por debajo del suelo
    controls.minDistance = 120;
    controls.maxDistance = 500;
    estado.controles3d = controls;

    // 5. Escenario / Tarima tecnológica (para que los pies se vean firmemente anclados)
    const stageGeo = new THREE.CylinderGeometry(85, 92, 4, 48);
    const stageMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.7 });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = -2;
    stage.receiveShadow = true;
    scene.add(stage);

    // Anillo exterior de neón cian
    const ringGeo = new THREE.RingGeometry(84, 88, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00F0FF, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    scene.add(ring);

    // Anillo interior decorativo fucsia
    const innerRingGeo = new THREE.RingGeometry(55, 57, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xFF007F, side: THREE.DoubleSide });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.1;
    scene.add(innerRing);

    // Cuadrícula futurista suave
    const grid = new THREE.GridHelper(200, 20, 0x00F0FF, 0x1e293b);
    grid.position.y = 0.15;
    scene.add(grid);

    // 6. Iluminación cinematográfica
    const ambient = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x70b8ff, 0x151d2c, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
    keyLight.position.set(110, 230, 170);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x99ccff, 0.85);
    fillLight.position.set(-110, 180, 130);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00F0FF, 1.3);
    rimLight.position.set(0, 190, -170);
    scene.add(rimLight);

    // 7. Redimensionamiento responsivo
    const resizeObserver = new ResizeObserver(() => {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
    });
    resizeObserver.observe(container);

    // 8. Carga del Humanoide 3D (Y-Bot de Adobe)
    const loader = new FBXLoader();
    loader.load(
        '/assets/animados/prueba/bot.fbx',
        (fbx) => {
            fbx.position.set(0, 0, 0);
            fbx.rotation.set(0, 0, 0); // Orientación natural de frente a la cámara (+Z)

            fbx.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach((m) => {
                            if (m.isMeshPhongMaterial) {
                                m.shininess = 60;
                                m.specular = new THREE.Color(0x555555);
                            }
                        });
                    }
                }
                if (child.isBone) {
                    // Evitar hojas dummy con 0 hijos que comparten nombre en FBX
                    if (!estado.huesos3d[child.name] || child.children.length > 0) {
                        estado.huesos3d[child.name] = child;
                    }
                    estado.restLocalQuats.set(child, child.quaternion.clone());
                }
            });

            scene.add(fbx);
            estado.modelo3d = fbx;
            fbx.updateMatrixWorld(true);

            // Identificar y almacenar huesos de las piernas para anclaje estático
            const nombresPiernas = [
                'mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot', 'mixamorigLeftToeBase',
                'mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot', 'mixamorigRightToeBase'
            ];
            estado.huesosPiernas = nombresPiernas.map((n) => estado.huesos3d[n]).filter(Boolean);
            estado.huesoCadera = estado.huesos3d['mixamorigHips'];

            // §7: la cadera se ancla UNA sola vez al cargar, nunca por frame.
            if (estado.huesoCadera) {
                estado.huesoCadera.position.set(0, 104.27, 1.55);
            }

            // Registrar direcciones y rotaciones del mundo en pose de reposo (T-Pose)
            // Clave del payload -> (hueso, hijo) del rig Mixamo.
            // El swap de lados es intencional: ver docs/contract.md §mapeo.
            registrarSegmento('torso_up', 'mixamorigSpine', 'mixamorigSpine2');
            registrarSegmento('head', 'mixamorigNeck', 'mixamorigHead');
            registrarSegmento('right_upper_arm', 'mixamorigLeftArm', 'mixamorigLeftForeArm');
            registrarSegmento('right_lower_arm', 'mixamorigLeftForeArm', 'mixamorigLeftHand');
            registrarSegmento('left_upper_arm', 'mixamorigRightArm', 'mixamorigRightForeArm');
            registrarSegmento('left_lower_arm', 'mixamorigRightForeArm', 'mixamorigRightHand');

            // Ocultar indicador de carga
            const loadingEl = document.getElementById('loading-3d');
            if (loadingEl) loadingEl.classList.add('oculto');
            estado.cargando3d = false;
            console.log('✅ Muñeco 3D Y-Bot cargado y calibrado con éxito.');
        },
        undefined,
        (err) => {
            console.error('Error al cargar bot.fbx:', err);
            const loadingEl = document.getElementById('loading-3d');
            if (loadingEl) {
                loadingEl.innerHTML = '<div style="font-size:2rem">⚠️</div><p style="color:#ff6b6b">Error al cargar el modelo 3D</p>';
            }
        }
    );
}

const MAPA_HUESOS = [
    { clave: 'torso_up', hueso: 'mixamorigSpine', suavizado: 0.22 },
    { clave: 'head', hueso: 'mixamorigNeck', suavizado: 0.28 },
    { clave: 'right_upper_arm', hueso: 'mixamorigLeftArm', suavizado: 0.35 },
    { clave: 'right_lower_arm', hueso: 'mixamorigLeftForeArm', suavizado: 0.35 },
    { clave: 'left_upper_arm', hueso: 'mixamorigRightArm', suavizado: 0.35 },
    { clave: 'left_lower_arm', hueso: 'mixamorigRightForeArm', suavizado: 0.35 },
];

function aplicarPose3D(payload) {
    if (!estado.modelo3d || estado.cargando3d) return;

    const avisoSinPose = document.getElementById('aviso-sin-pose');
    const bones = payload?.bones ?? {};
    // Todos los vectores en cero significa tracking perdido.
    const valido = payload?.detected && (bones.torso_up ?? []).some((v) => v !== 0);

    if (valido) {
        if (avisoSinPose) avisoSinPose.classList.add('oculto');

        for (const { clave, hueso, suavizado } of MAPA_HUESOS) {
            const dir = bones[clave];
            if (!dir || dir.every((v) => v === 0)) continue;
            orientarHueso(
                estado.huesos3d[hueso],
                estado.restWorldDirs[clave],
                estado.restWorldQuats[clave],
                new THREE.Vector3(dir[0], dir[1], dir[2]),
                suavizado,
            );
            estado.modelo3d.updateMatrixWorld(true);
        }
    } else {
        if (avisoSinPose && estado.vistaActual === '3d') avisoSinPose.classList.remove('oculto');
        volverAReposo();
    }

    anclarPiernas();
}

function volverAReposo() {
    // §7: sin detección se interpola suave a la pose neutra, nunca se congela.
    const t = performance.now() * 0.002;
    for (const [bone, restQ] of estado.restLocalQuats.entries()) {
        if (bone === estado.huesos3d['mixamorigSpine']) {
            const breathQ = restQ.clone();
            breathQ.x += Math.sin(t * 1.6) * 0.015;
            bone.quaternion.slerp(breathQ, 0.08);
        } else if (!estado.huesosPiernas.includes(bone) && bone !== estado.huesoCadera) {
            bone.quaternion.slerp(restQ, 0.08);
        }
    }
}

function anclarPiernas() {
    // §6: el avatar queda fijo de la cadera hacia abajo. La cadera se ancla una
    // sola vez al cargar; acá solo se congelan las piernas.
    for (const leg of estado.huesosPiernas) {
        const q = estado.restLocalQuats.get(leg);
        if (q) leg.quaternion.copy(q);
    }
}

// ============================================
// BUCLE PRINCIPAL DE ANIMACIÓN
// ============================================
function loopAnimacion() {
    if (estado.vistaActual === '3d') {
        aplicarPose3D(estado.ultimaPose);
        if (estado.renderizador3d && estado.escena3d && estado.camara3d) {
            if (estado.controles3d) estado.controles3d.update();
            estado.renderizador3d.render(estado.escena3d, estado.camara3d);
        }
    } else {
        renderizarEspacioLandmarks();
    }
    animarConfeti();
    requestAnimationFrame(loopAnimacion);
}

// ============================================
// CONFIGURACIÓN DE EVENTOS
// ============================================
function configurarEventos() {
    // Selector de estilo (Neón, Robot, Arcade)
    const botonesEstilo = document.querySelectorAll('.btn-estilo');
    botonesEstilo.forEach((btn) => {
        btn.addEventListener('click', () => {
            botonesEstilo.forEach((b) => b.classList.remove('activo'));
            btn.classList.add('activo');
            estado.estiloActual = btn.dataset.estilo;
        });
    });

    // Selector de vista: 🤖 Muñeco 3D vs ✨ Landmarks 2D
    const btnVista3d = document.getElementById('btn-vista-3d');
    const btnVista2d = document.getElementById('btn-vista-2d');
    const contenedor3d = document.getElementById('contenedor-3d');
    const canvasLandmarks = document.getElementById('canvas-landmarks');
    const tituloDerecho = document.getElementById('titulo-panel-derecho');

    if (btnVista3d && btnVista2d) {
        btnVista3d.addEventListener('click', () => {
            estado.vistaActual = '3d';
            btnVista3d.classList.add('activo');
            btnVista2d.classList.remove('activo');
            if (contenedor3d) contenedor3d.classList.remove('oculto');
            if (canvasLandmarks) canvasLandmarks.classList.add('oculto');
            if (tituloDerecho) tituloDerecho.textContent = '🤖 Muñeco 3D (Bot de Adobe)';
            if (estado.controles3d) estado.controles3d.update();
        });

        btnVista2d.addEventListener('click', () => {
            estado.vistaActual = '2d';
            btnVista2d.classList.add('activo');
            btnVista3d.classList.remove('activo');
            if (contenedor3d) contenedor3d.classList.add('oculto');
            if (canvasLandmarks) canvasLandmarks.classList.remove('oculto');
            if (tituloDerecho) tituloDerecho.textContent = '✨ Reconstrucción de Landmarks';
        });
    }

    // Botón fiesta / confeti
    const btnConfeti = document.getElementById('btn-confeti');
    if (btnConfeti) btnConfeti.addEventListener('click', lanzarConfeti);

    document.addEventListener('keydown', (e) => {
        if (e.key === ' ') {
            e.preventDefault();
            lanzarConfeti();
        }
    });
}

// ============================================
// INICIO
// ============================================
function iniciar() {
    configurarEventos();
    iniciarThreeJS();
    iniciarMediaPipe();
    conectarBackend();
    requestAnimationFrame(loopAnimacion);
}

iniciar();
