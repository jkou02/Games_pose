"""
Servidor Flask para la aplicación "Imita al Muñeco"
Sirve la interfaz web y los modelos 3D de la carpeta animados.
"""

from flask import Flask, render_template, send_from_directory, jsonify
import os
import webbrowser
import threading

app = Flask(__name__)

# Ruta base del proyecto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/assets/animados/<path:filename>')
def serve_animados(filename):
    """Sirve archivos de la carpeta animados."""
    return send_from_directory(
        os.path.join(BASE_DIR, 'animados'),
        filename
    )


NOMBRES_ANIMADOS = {
    'prueba': 'Robot Humanoide 🤖',
    'bot': 'Robot Humanoide 🤖',
    'Cool Bannana Guy': 'Plátano Cool 🍌',
    'Sandwich Character': 'Sándwich 🥪',
    'Steve': 'Steve 🏃',
    'Zombie': 'Zombie 🧟',
    'Skeleton': 'Esqueleto ☠️',
    'Skeleton Boy': 'Chico Calavera 💀',
    'Alien': 'Alien 👽',
    'Frog Man': 'Hombre Rana 🐸',
    'Character Base': 'Robot Base 🤖',
}


def nombre_bonito(nombre_carpeta):
    """Devuelve un nombre limpio y divertido para niños."""
    if nombre_carpeta in NOMBRES_ANIMADOS:
        return NOMBRES_ANIMADOS[nombre_carpeta]
    return nombre_carpeta


PRIORIDAD_PERSONAJES = [
    'prueba',
    'bot',
    'Steve by Quaternius',
    'Zombie by Quaternius',
    'Skeleton by Quaternius',
]


@app.route('/api/personajes')
def listar_personajes():
    """Devuelve la lista de personajes animados, priorizando los que tienen esqueleto para imitar."""
    personajes = []
    animados_dir = os.path.join(BASE_DIR, 'animados')

    if os.path.exists(animados_dir):
        carpetas = sorted(os.listdir(animados_dir))
        # Priorizar los modelos con esqueleto funcional
        carpetas.sort(key=lambda c: next((i for i, p in enumerate(PRIORIDAD_PERSONAJES) if p in c), 999))

        for carpeta in carpetas:
            carpeta_path = os.path.join(animados_dir, carpeta)
            if not os.path.isdir(carpeta_path):
                continue
            for archivo in sorted(os.listdir(carpeta_path)):
                if archivo.endswith('.fbx'):
                    nombre_carpeta = carpeta.split(' by ')[0].strip()
                    personajes.append({
                        'id': f'animados_{carpeta}',
                        'nombre': nombre_bonito(nombre_carpeta),
                        'modelo': f'/assets/animados/{carpeta}/{archivo}',
                        'tipo': 'animado',
                    })
                    break

    return jsonify(personajes)


def open_browser():
    """Abre el navegador automáticamente después de un breve retraso."""
    webbrowser.open('http://localhost:5000')


if __name__ == '__main__':
    print("=" * 60)
    print("  🎮 IMITA AL MUÑECO - Detección de Pose para Niños")
    print("=" * 60)
    print("  Modelos cargados desde: carpeta 'animados'")
    print("  Abriendo en el navegador: http://localhost:5000")
    print("  Presiona Ctrl+C para detener el servidor")
    print("=" * 60)

    threading.Timer(1.5, open_browser).start()
    app.run(debug=False, host='0.0.0.0', port=5000)
