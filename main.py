import serial
import time
import os
import pygame
import threading
from flask import Flask, render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Variables d'état
esp_connected = False
last_esp_time = 0
last_horn_time = 0  # Anti-flood pour le son
last_drive_cmd = None
ser_lock = threading.Lock()

# --- CONNEXION SÉRIE (ESP32) ---
ser = None
print("[NAVX] Recherche ESP32...")

def find_esp32_port():
    """Détecte automatiquement le port de l'ESP32"""
    import glob
    ports = []
    
    # Chercher ports USB
    for pattern in ['/dev/ttyUSB*', '/dev/ttyACM*', '/dev/ttyS*']:
        ports.extend(glob.glob(pattern))
    
    print(f"[DEBUG] Ports trouvés: {ports}")
    
    for port in sorted(ports):
        try:
            test_ser = serial.Serial(port, 115200, timeout=0.5)
            # Essayer de lire des données (timeout 1 sec)
            import time as t
            start = t.time()
            while t.time() - start < 1.0:
                if test_ser.in_waiting > 0:
                    test_ser.close()
                    return port
            test_ser.close()
        except:
            pass
    
    return None

# Chercher le port automatiquement
detected_port = find_esp32_port()

if detected_port:
    try:
        ser = serial.Serial(detected_port, 115200, timeout=0.1, write_timeout=0)
        print(f"[NAVX] ✓ ESP32 trouvé sur {detected_port}")
    except Exception as e:
        print(f"[ERROR] Impossible de se connecter à {detected_port}: {e}")
else:
    print("[ERROR] ESP32 non détecté sur aucun port série")
    print("[INFO] Utilisez debug_esp32.py pour diagnostiquer le problème")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('drive_cmd')
def handle_drive(data):
    global last_horn_time, last_drive_cmd
    
    v = int(data.get('v', 0))
    d = int(data.get('d', 0))
    b_str = data.get('blinker', 'OFF')
    
    # --- CONVERSION CLIGNOTANTS ---
    b = 0
    if b_str == 'L': b = 1
    elif b_str == 'R': b = 2
    elif b_str == 'W': b = 3
    
    # --- ENVOI ESP32 ---
    if ser:
        try:
            message = f"{v},{b},{d}\n"
            with ser_lock:
                ser.write(message.encode())
                ser.flush()
            last_drive_cmd = (v, b, d)
        except Exception as e:
            print(f"[ERROR] Impossible d'envoyer à ESP32: {e}")
    
    # --- GESTION DU GONG (HORN) SUR JACK ---
    if data.get('horn'):
        now = time.time()
        # On autorise le son maximum toutes les 0.8 secondes
        if now - last_horn_time > 0.8:
            try:
                os.system("mpg123 -o alsa:hw:1,0 /home/fewday/navx/static/gong.mp3 &")
                last_horn_time = now
            except Exception as e:
                print(f"[DEBUG] Son du klaxon non disponible: {e}")

def background_tasks():
    global esp_connected, last_esp_time
    print("[NAVX] Tâche de fond démarrée...")
    
    while True:
        try:
            if ser and ser.in_waiting > 0:
                with ser_lock:
                    line = ser.readline().decode('utf-8', errors='ignore').strip()
                
                if line:
                    last_esp_time = time.time()
                    was_disconnected = not esp_connected
                    esp_connected = True
                    
                    if was_disconnected:
                        print("[NAVX] ESP32 CONNECTÉ!")
                        socketio.emit('esp_status', {'connected': True}, broadcast=True)
                    
                    # Traiter les données GPS
                    if line.startswith("GPS:"):
                        try:
                            coords = line.replace("GPS:", "").split(",")
                            if len(coords) >= 2:
                                lat = float(coords[0])
                                lng = float(coords[1])
                                socketio.emit('map_update', {
                                    'lat': lat, 
                                    'lng': lng
                                }, broadcast=True)
                        except Exception as e:
                            print(f"[ERROR] Erreur parsing GPS: {e}")
                    elif line == "ALIVE":
                        print(f"[DEBUG] Heartbeat ESP32 reçu")
            
            # Vérifier la connexion ESP32
            if time.time() - last_esp_time > 2.5 and esp_connected:
                esp_connected = False
                print("[NAVX] ESP32 DÉCONNECTÉ!")
                socketio.emit('esp_status', {'connected': False}, broadcast=True)
            
            socketio.sleep(0.05)
        except Exception as e:
            print(f"[ERROR] Erreur tâche fond: {e}")
            socketio.sleep(0.1)

if __name__ == '__main__':
    print("\n" + "="*50)
    print("   NAVX CONTROL SYSTEM STARTING")
    print("="*50)
    print(f"[NAVX] Flask Server: http://0.0.0.0:5000")
    print(f"[NAVX] ESP32 Serial Port: {ser.port if ser else 'NOT CONNECTED'}")
    print("="*50 + "\n")
    
    socketio.start_background_task(background_tasks)
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True, debug=False)