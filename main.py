import serial
import time
import pygame
import os
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Variables d'état
esp_connected = False
last_esp_time = 0

# --- INITIALISATION AUDIO SÉCURISÉE ---
try:
    pygame.mixer.init()
    # Utilisation du chemin complet pour éviter les erreurs de service
    gong_sound = pygame.mixer.Sound("/home/fewday/navx/static/gong.mp3")
    print("Audio OK : Prêt pour le klaxon.")
except Exception as e:
    print(f"ALERTE AUDIO : Impossible d'ouvrir ALSA ({e}).")
    gong_sound = None

# --- CONNEXION SÉRIE (ESP32) ---
ser = None
try:
    ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=0, write_timeout=0)
except:
    try:
        ser = serial.Serial('/dev/ttyACM0', 115200, timeout=0, write_timeout=0)
    except:
        print("ESP32 non détecté sur USB. Vérifiez le câble.")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('drive_cmd')
def handle_drive(data):
    v = data.get('v', 0)
    d = data.get('d', 0)
    b_str = data.get('blinker', 'OFF')
    
    # 1. GESTION DU KLAKSON (HORN)
    if data.get('horn'):
        # On utilise 'aplay' ou 'paplay' avec le chemin complet
        # '&' permet de ne pas figer le robot pendant que le son joue
        os.system("paplay /home/fewday/navx/static/gong.mp3 &")

    # 2. CONVERSION CLIGNOTANTS
    b = 0
    if b_str == 'L': b = 1
    elif b_str == 'R': b = 2
    elif b_str == 'W': b = 3

    # 3. ENVOI À L'ESP32
    if ser:
        try:
            message = f"{v},{b},{d}\n"
            ser.write(message.encode())
            ser.flush()
        except Exception as e:
            print(f"Erreur envoi série : {e}")

def background_tasks():
    """ Gère le retour d'infos de l'ESP32 (Heartbeat et GPS) """
    global esp_connected, last_esp_time
    while True:
        if ser and ser.in_waiting > 0:
            try:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                last_esp_time = time.time()
                
                if not esp_connected:
                    esp_connected = True
                    socketio.emit('esp_status', {'connected': True})
                
                # Si l'ESP32 envoie des coordonnées GPS
                if line.startswith("GPS:"):
                    coords = line.replace("GPS:", "").split(",")
                    socketio.emit('map_update', {
                        'lat': float(coords[0]), 
                        'lng': float(coords[1])
                    })
            except:
                pass
        
        # Timeout connexion ESP32
        if time.time() - last_esp_time > 2.0 and esp_connected:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
            
        socketio.sleep(0.01)

if __name__ == '__main__':
    socketio.start_background_task(background_tasks)
    # allow_unsafe_werkzeug=True est nécessaire pour Flask-SocketIO sur les versions récentes
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)