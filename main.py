import serial
import time
import pygame
import os
import eventlet
from flask import Flask, render_template
from flask_socketio import SocketIO

# Forcer Eventlet pour la basse latence
eventlet.monkey_patch()

app = Flask(__name__)
# Suppression du buffering SocketIO
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet', buffered=False)

# Variables d'état
ser = None
esp_connected = False
last_esp_time = 0

# --- INITIALISATION AUDIO ---
gong_sound = None
try:
    pygame.mixer.init()
    if os.path.exists("gong.mp3"):
        gong_sound = pygame.mixer.Sound("gong.mp3")
        print("✅ Audio Ready")
except Exception as e:
    print(f"⚠️ Audio Bypass: {e}")

def connect_esp32():
    global ser
    while ser is None:
        for port in ['/dev/ttyUSB0', '/dev/ttyACM0']:
            try:
                # Timeout réglé au minimum (1ms) pour éviter les lags
                temp_ser = serial.Serial(port, 115200, timeout=0.001)
                ser = temp_ser
                ser.flushInput() # On vide les vieilles données
                print(f"✅ ESP32 Connected on {port}")
                return
            except:
                continue
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
            # Envoi direct sans délai
            ser.write(f"{v},{b},{d}\n".encode())
        except:
            ser = None

def background_tasks():
    global esp_connected, last_esp_time, ser
    while True:
        if ser is None:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
            connect_esp32()
        
        try:
            # On lit tout ce qui arrive d'un coup pour ne pas accumuler de retard
            while ser and ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                last_esp_time = time.time()
                
                if not esp_connected:
                    esp_connected = True
                    socketio.emit('esp_status', {'connected': True})

                if line.startswith("GPS:"):
                    coords = line.replace("GPS:", "").split(",")
                    if len(coords) >= 2:
                        socketio.emit('map_update', {
                            'lat': float(coords[0]), 
                            'lng': float(coords[1])
                        })
        except:
            ser = None
        
        # Monitoring connexion
        if time.time() - last_esp_time > 2.0 and esp_connected:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
            
        # Fréquence de rafraîchissement rapide (10ms)
        socketio.sleep(0.01)

if __name__ == '__main__':
    socketio.start_background_task(background_tasks)
    print("🚀 NAV-X Live - Low Latency Mode Active")
    socketio.run(app, host='0.0.0.0', port=5000)