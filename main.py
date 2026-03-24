import serial
import time
import pygame
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Variables d'état
esp_connected = False
last_esp_time = 0

# --- INITIALISATION AUDIO SÉCURISÉE ---
# Le bloc try/except empêche le crash du robot si la carte son est occupée
try:
    pygame.mixer.init()
    gong_sound = pygame.mixer.Sound("gong.mp3")
    print("Audio OK : Prêt pour le klaxon.")
except Exception as e:
    print(f"ALERTE AUDIO : Impossible d'ouvrir ALSA ({e}). Le robot fonctionnera sans son.")
    gong_sound = None

# --- CONNEXION SÉRIE (ESP32) ---
try:
    # On force timeout=0 et write_timeout=0 pour supprimer la latence USB
    ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=0, write_timeout=0)
except:
    try:
        ser = serial.Serial('/dev/ttyACM0', 115200, timeout=0, write_timeout=0)
    except:
        print("ESP32 non détecté sur USB. Vérifiez le câble.")
        ser = None

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('drive_cmd')
def handle_drive(data):
    v = data.get('v', 0)
    d = data.get('d', 0)
    b_str = data.get('blinker', 'OFF')
    
    # Jouer le son si le bouton est pressé et que l'audio fonctionne
    if data.get('horn') and gong_sound:
        try:
            gong_sound.play()
        except:
            pass

    # Conversion du mode clignotant pour l'ESP32
    b = 0
    if b_str == 'L': b = 1
    elif b_str == 'R': b = 2
    elif b_str == 'W': b = 3

    # Envoi immédiat à l'ESP32
    if ser:
        try:
            message = f"{v},{b},{d}\n"
            ser.write(message.encode())
            ser.flush()  # Force l'envoi immédiat sans bufferiser
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
        
        # Si plus de signal de l'ESP32 pendant 2 secondes
        if time.time() - last_esp_time > 2.0 and esp_connected:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
            
        socketio.sleep(0.01) # Laisse respirer le processeur du Pi

if __name__ == '__main__':
    socketio.start_background_task(background_tasks)
    # Lancement du serveur sur le port 5000
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)