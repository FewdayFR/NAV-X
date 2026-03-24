import serial
import time
import pygame
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# --- INITIALISATION AUDIO ---
pygame.mixer.init()
try:
    gong_sound = pygame.mixer.Sound("gong.mp3")
except:
    print("Alerte: gong.mp3 introuvable !")
    gong_sound = None

# --- CONNEXION ESP32 ---
try:
    ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=0.1)
    print("ESP32 Connecté avec succès")
except:
    print("Erreur: ESP32 introuvable sur /dev/ttyUSB0")
    ser = None

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('drive_cmd')
def handle_drive(data):
    v = data.get('v', 0)
    d = data.get('d', 0)
    b_str = data.get('blinker')
    horn = data.get('horn', False)

    # 1. Jouer le klaxon sur le Jack du Raspberry Pi
    if horn and gong_sound:
        gong_sound.play()

    # 2. Préparer les données pour l'ESP32
    # 0:Off, 1:L, 2:R, 3:W
    b = 0
    if b_str == 'L': b = 1
    elif b_str == 'R': b = 2
    elif b_str == 'W': b = 3

    if ser:
        # Envoi formaté: Vitesse,Blinker,Direction (Servo)
        cmd = f"{v},{b},{d}\n"
        ser.write(cmd.encode())

def read_gps():
    while True:
        if ser and ser.in_waiting > 0:
            try:
                line = ser.readline().decode('utf-8').strip()
                if line.startswith("GPS:"):
                    coords = line.replace("GPS:", "").split(",")
                    if len(coords) == 2:
                        socketio.emit('map_update', {
                            'lat': float(coords[0]), 
                            'lng': float(coords[1]),
                            'speed': 0
                        })
            except: pass
        socketio.sleep(0.1)

if __name__ == '__main__':
    socketio.start_background_task(read_gps)
    socketio.run(app, host='0.0.0.0', port=5000)