import serial
import time
import pygame
import os
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Variables d'état pour le monitoring
esp_connected = False
last_esp_time = 0

# --- INITIALISATION AUDIO SÉCURISÉE ---
# On essaie d'initialiser le son, si ça rate (Erreur ALSA 524), on ignore
gong_sound = None
try:
    pygame.mixer.init()
    if os.path.exists("gong.mp3"):
        gong_sound = pygame.mixer.Sound("gong.mp3")
        print("✅ Système Audio : OK")
    else:
        print("⚠️ Alerte : gong.mp3 introuvable dans le dossier.")
except Exception as e:
    print(f"❌ Erreur Audio (ALSA) : {e}")
    print("👉 Le robot démarrera sans le klaxon pour éviter le crash.")

# --- CONNEXION ESP32 ---
try:
    # On teste les deux ports les plus courants sur Raspberry Pi
    try:
        ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=0.1)
    except:
        ser = serial.Serial('/dev/ttyACM0', 115200, timeout=0.1)
    print("✅ ESP32 : Connecté avec succès")
except Exception as e:
    print(f"❌ Erreur : ESP32 introuvable ({e})")
    ser = None

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('drive_cmd')
def handle_drive(data):
    global gong_sound
    v = data.get('v', 0)
    d = data.get('d', 0)
    b_str = data.get('blinker')
    horn = data.get('horn', False)

    # 1. Jouer le klaxon si disponible
    if horn and gong_sound:
        try:
            gong_sound.play()
        except:
            pass

    # 2. Préparer les données pour l'ESP32
    # 0:Off, 1:L, 2:R, 3:W
    b = 0
    if b_str == 'L': b = 1
    elif b_str == 'R': b = 2
    elif b_str == 'W': b = 3

    if ser:
        try:
            # Envoi formaté: Vitesse,Blinker,Direction
            cmd = f"{v},{b},{d}\n"
            ser.write(cmd.encode())
        except Exception as e:
            print(f"Erreur envoi série : {e}")

def background_tasks():
    global esp_connected, last_esp_time
    while True:
        if ser and ser.in_waiting > 0:
            try:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                
                # HEARTBEAT & STATUS
                last_esp_time = time.time()
                if not esp_connected:
                    esp_connected = True
                    socketio.emit('esp_status', {'connected': True})

                # GPS DATA
                if line.startswith("GPS:"):
                    coords = line.replace("GPS:", "").split(",")
                    if len(coords) >= 2:
                        socketio.emit('map_update', {
                            'lat': float(coords[0]), 
                            'lng': float(coords[1])
                        })
            except:
                pass
        
        # Vérification déconnexion ESP32 (timeout 3 secondes)
        if time.time() - last_esp_time > 3.0 and esp_connected:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
            
        socketio.sleep(0.1)

if __name__ == '__main__':
    # Lancement des tâches de fond (GPS + Monitoring)
    socketio.start_background_task(background_tasks)
    # Lancement du serveur Web
    print("🚀 Serveur NAV-X lancé sur http://0.0.0.0:5000")
    socketio.run(app, host='0.0.0.0', port=5000)