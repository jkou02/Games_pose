import os

import cv2
import mediapipe as mp
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

# --- Configuración Inicial ---
# Inicializar MediaPipe Pose
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)
mp_drawing = mp.solutions.drawing_utils

# Configuración de Matplotlib para la animación
fig, ax = plt.subplots(figsize=(10, 10))
ax.set_title("Esqueleto Corporal Animado con MediaPipe")
# Los límites se ajustan para el cuerpo, pero se mantiene el efecto espejo
ax.set_xlim(1, 0)
ax.set_ylim(1, 0)
ax.set_aspect("equal", adjustable="box")
plt.grid(True)

# Obtener las conexiones del esqueleto de MediaPipe Pose
POSE_CONNECTIONS = mp_pose.POSE_CONNECTIONS

# --- Captura de video y procesamiento ---
url = os.getenv("RTSP_URL")
if not url:
    raise SystemExit(
        "Definí RTSP_URL. Ejemplo:\n"
        "  RTSP_URL='rtsp://usuario:clave@192.168.2.26:554/snl/live/1/1' \\\n"
        "  .venv/bin/python legacy/ReconstruccionPose.py"
    )
cap = cv2.VideoCapture(url)
# cap = cv2.VideoCapture(0) # Inicia la captura de la cámara web

# Establecer resolución deseada
# cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
# cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
# cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
# cap.set(cv2.CAP_PROP_FPS, 30)


def update_plot(frame_data):
    """
    Actualiza la posición de los puntos y líneas del esqueleto en la gráfica.
    """
    if frame_data:
        landmarks = frame_data.landmark

        # Extraer coordenadas y visibilidad
        x_coords = [lm.x for lm in landmarks]
        y_coords = [lm.y for lm in landmarks]
        visibility = [lm.visibility for lm in landmarks]

        # Limpiar la gráfica anterior para redibujar
        ax.clear()
        ax.set_title("Esqueleto Corporal Animado con MediaPipe")
        ax.set_xlim(1, 0)
        ax.set_ylim(1, 0)
        ax.grid(True)

        # Dibujar los puntos (landmarks)
        ax.plot(x_coords, y_coords, "ro", markersize=3)

        # Dibujar las conexiones (huesos)
        for connection in POSE_CONNECTIONS:
            start_idx = connection[0]
            end_idx = connection[1]

            # ✨ Mejora: Solo dibujar la conexión si ambos puntos son visibles
            if visibility[start_idx] > 0.5 and visibility[end_idx] > 0.5:
                ax.plot(
                    [x_coords[start_idx], x_coords[end_idx]],
                    [y_coords[start_idx], y_coords[end_idx]],
                    "b-",
                )


def get_pose_landmarks():
    """
    Generador que captura un fotograma, procesa los puntos del cuerpo
    y los cede (yield) para la animación.
    """
    while cap.isOpened():
        success, image = cap.read()
        if not success:
            continue

        # Convertir la imagen a RGB y procesarla con MediaPipe
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = pose.process(image_rgb)

        # Dibujar el esqueleto en la ventana de OpenCV para visualización
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        if results.pose_landmarks:
            mp_drawing.draw_landmarks(
                image_bgr, results.pose_landmarks, POSE_CONNECTIONS
            )

        nuevo_ancho = 960
        nuevo_alto = 640
        image_bgr = cv2.resize(image_bgr, (nuevo_ancho, nuevo_alto))

        cv2.imshow("MediaPipe Pose (OpenCV)", cv2.resize(image_bgr, (960, 540)))
        # cv2.imshow('MediaPipe Pose (OpenCV)', cv2.resize(image_bgr, (1280,720)))

        # Ceder los landmarks para la animación de Matplotlib
        yield results.pose_landmarks

        if cv2.waitKey(5) & 0xFF == 27:  # Presiona 'ESC' para salir
            break


# --- Iniciar la Animación ---
ani = FuncAnimation(
    fig, update_plot, frames=get_pose_landmarks, blit=False, interval=20
)

plt.show()

# --- Liberar Recursos ---
cap.release()
cv2.destroyAllWindows()
pose.close()
