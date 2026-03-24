import serial
import time
import pygame
import os
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Variables d'état
ser = None
esp_connected = False
last_esp_time = 0

# --- INITIALISATION AUDIO SÉCURISÉE ---
gong_sound = None
try:
    pygame.mixer.init()
    if os.path.exists("gong.mp3"):
        gong_sound = pygame.mixer.Sound("gong.mp3")
        print("✅ Système Audio : OK")
except Exception as e:
    print(f"⚠️ Audio non disponible (ALSA Error): {e}")

def connect_esp32():
    """ Tente de se connecter à l'ESP32 en boucle toutes les 2 secondes """
    global ser
    while ser is None:
        for port in ['/dev/ttyUSB0', '/dev/ttyACM0']:
            try:
                temp_ser = serial.Serial(port, 115200, timeout=0.1)
                ser = temp_ser
                print(f"✅ ESP32 détecté sur {port}")
                return
            except:
                continue
        
        print("⏳ ESP32 introuvable... Re-tentative dans 2s")
        time.sleep(2)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('drive_cmd')
def handle_drive(data):
    global ser
    v = data.get('v', 0)
    d = data.get('d', 0)
    b_str = data.get('blinker', 'Off')
    horn = data.get('horn', False)

    if horn and gong_sound:
        try: gong_sound.play()
        except: pass

    b = 1 if b_str == 'L' else 2 if b_str == 'R' else 3 if b_str == 'W' else 0

    if ser:
        try:
            ser.write(f"{v},{b},{d}\n".encode())
        except:
            print("❌ Erreur d'envoi : ESP32 déconnecté !")
            ser = None # Force la reconnexion dans la tâche de fond

def background_tasks():
    global esp_connected, last_esp_time, ser
    while True:
        if ser is None:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
            connect_esp32()
        
        try:
            if ser and ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                last_esp_time = time.time()
                
                if not esp_connected:
                    esp_connected = True
                    socketio.emit('esp_status', {'connected': True})

                if line.startswith("GPS:"):
                    coords = line.replace("GPS:", "").split(",")
                    if len(coords) >= 2:
                        socketio.emit('map_update', {'lat': float(coords[0]), 'lng': float(coords[1])})
        except Exception as e:
            print(f"⚠️ Erreur lecture Serial : {e}")
            ser = None # On perd la main, on redemande une connexion
        
        # Timeout de sécurité
        if time.time() - last_esp_time > 3.0 and esp_connected:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
            
        socketio.sleep(0.1)

if __name__ == '__main__':
    socketio.start_background_task(background_tasks)
    print("🚀 Serveur NAV-X lancé sur http://0.0.0.0:5000")
    socketio.run(app, host='0.0.0.0', port=5000)