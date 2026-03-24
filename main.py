import serial
import time
import os
import pygame
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Variables d'état
esp_connected = False
last_esp_time = 0
last_horn_time = 0  # Anti-flood pour le son

# --- CONNEXION SÉRIE (ESP32) ---
ser = None
try:
    ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=0, write_timeout=0)
except:
    try:
        ser = serial.Serial('/dev/ttyACM0', 115200, timeout=0, write_timeout=0)
    except:
        print("ESP32 non détecté. Vérifiez l'USB.")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('drive_cmd')
def handle_drive(data):
    global last_horn_time
    v = data.get('v', 0)
    d = data.get('d', 0)
    b_str = data.get('blinker', 'OFF')
    
    # --- GESTION DU GONG (HORN) SUR JACK ---
    if data.get('horn'):
        now = time.time()
        # On autorise le son maximum toutes les 0.8 secondes
        if now - last_horn_time > 0.8:
            # -o alsa force la sortie vers le Jack sans passer par JACK/Pulse
            os.system("mpg123 -o alsa:hw:1,0 /home/fewday/navx/static/gong.mp3 &")
            last_horn_time = now

    # --- CONVERSION CLIGNOTANTS ---
    b = 0
    if b_str == 'L': b = 1
    elif b_str == 'R': b = 2
    elif b_str == 'W': b = 3

    # --- ENVOI ESP32 ---
    if ser:
        try:
            message = f"{v},{b},{d}\n"
            ser.write(message.encode())
            ser.flush()
        except:
            pass

def background_tasks():
    global esp_connected, last_esp_time
    while True:
        if ser and ser.in_waiting > 0:
            try:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                last_esp_time = time.time()
                if not esp_connected:
                    esp_connected = True
                    socketio.emit('esp_status', {'connected': True})
                
                if line.startswith("GPS:"):
                    coords = line.replace("GPS:", "").split(",")
                    socketio.emit('map_update', {
                        'lat': float(coords[0]), 
                        'lng': float(coords[1])
                    })
            except:
                pass
        
        if time.time() - last_esp_time > 2.0 and esp_connected:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
        socketio.sleep(0.01)

if __name__ == '__main__':
    socketio.start_background_task(background_tasks)
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)