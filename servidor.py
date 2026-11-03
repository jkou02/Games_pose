"""Servidor web de la app de exhibición «Ciencias Encuentro 2026».

Sirve `templates/index.html`, `static/` y los modelos `animados/`.
La pose llega por WebSocket desde `backend.main` (ws://127.0.0.1:8765).
"""

from __future__ import annotations

import threading
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, render_template, send_from_directory

HOST = "0.0.0.0"
PORT = 5000

app = Flask(__name__)

#: Raíz del repo: servidor.py vive acá, junto a templates/, static/ y animados/.
BASE_DIR = Path(__file__).resolve().parent
ANIMADOS_DIR = BASE_DIR / "animados"

NOMBRES_ANIMADOS = {
    "prueba": "Robot Humanoide 🤖",
    "bot": "Robot Humanoide 🤖",
    "Cool Bannana Guy": "Plátano Cool 🍌",
    "Sandwich Character": "Sándwich 🥪",
    "Steve": "Steve 🏃",
    "Zombie": "Zombie 🧟",
    "Skeleton": "Esqueleto ☠️",
    "Skeleton Boy": "Chico Calavera 💀",
    "Alien": "Alien 👽",
    "Frog Man": "Hombre Rana 🐸",
    "Character Base": "Robot Base 🤖",
}

#: Los primeros de la lista son los que mejor siguen el movimiento.
PRIORIDAD_PERSONAJES = [
    "prueba",
    "bot",
    "Steve by Quaternius",
    "Zombie by Quaternius",
    "Skeleton by Quaternius",
]


def nombre_bonito(nombre_carpeta: str) -> str:
    """Devuelve un nombre limpio y divertido para el público."""
    return NOMBRES_ANIMADOS.get(nombre_carpeta, nombre_carpeta)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/assets/animados/<path:filename>")
def serve_animados(filename: str):
    """Sirve los modelos 3D de la carpeta animados/."""
    return send_from_directory(ANIMADOS_DIR, filename)


@app.get("/api/personajes")
def listar_personajes():
    """Lista los personajes con esqueleto, priorizando los que mejor imitan."""
    personajes = []
    if not ANIMADOS_DIR.is_dir():
        return jsonify(personajes)

    def prioridad(carpeta: str) -> int:
        for indice, buscado in enumerate(PRIORIDAD_PERSONAJES):
            if buscado in carpeta:
                return indice
        return len(PRIORIDAD_PERSONAJES)

    for carpeta in sorted(ANIMADOS_DIR.iterdir(), key=lambda p: prioridad(p.name)):
        if not carpeta.is_dir():
            continue
        for archivo in sorted(carpeta.iterdir()):
            if archivo.suffix.lower() == ".fbx":
                nombre_carpeta = carpeta.name.split(" by ")[0].strip()
                personajes.append(
                    {
                        "id": f"animados_{carpeta.name}",
                        "nombre": nombre_bonito(nombre_carpeta),
                        "modelo": f"/assets/animados/{carpeta.name}/{archivo.name}",
                        "tipo": "animado",
                    }
                )
                break

    return jsonify(personajes)


def open_browser() -> None:
    webbrowser.open(f"http://localhost:{PORT}")


def main() -> None:
    print("=" * 60)
    print("  🎮 CIENCIAS ENCUENTRO 2026 — Muñeco 3D")
    print("=" * 60)
    print(f"  App web:     http://localhost:{PORT}")
    print("  Pose:        ws://127.0.0.1:8765  (backend.main)")
    print(f"  Modelos:     {ANIMADOS_DIR}")
    print("  Ctrl+C para detener el servidor")
    print("=" * 60)
    threading.Timer(1.5, open_browser).start()
    app.run(host=HOST, port=PORT, debug=False)


if __name__ == "__main__":
    main()
