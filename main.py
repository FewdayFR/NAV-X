import serial
import time
import pygame
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

esp_connected = False
last_esp_time = 0

pygame.mixer.init()
try:
    gong_sound = pygame.mixer.Sound("gong.mp3")
except:
    gong_sound = None

try:
    ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=0.01, write_timeout=0)
except:
    try:
        ser = serial.Serial('/dev/ttyACM0', 115200, timeout=0.01, write_timeout=0)
    except:
        ser = None

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('drive_cmd')
def handle_drive(data):
    v = data.get('v', 0)
    d = data.get('d', 0)
    b_str = data.get('blinker')
    if data.get('horn') and gong_sound:
        gong_sound.play()

    b = 0
    if b_str == 'L': b = 1
    elif b_str == 'R': b = 2
    elif b_str == 'W': b = 3

    if ser:
        ser.write(f"{v},{b},{d}\n".encode())
        ser.flush()

def background_tasks():
    global esp_connected, last_esp_time
    while True:
        if ser and ser.in_waiting > 0:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            last_esp_time = time.time()
            if not esp_connected:
                esp_connected = True
                socketio.emit('esp_status', {'connected': True})
            
            if line.startswith("GPS:"):
                coords = line.replace("GPS:", "").split(",")
                socketio.emit('map_update', {'lat': float(coords[0]), 'lng': float(coords[1])})
        
        if time.time() - last_esp_time > 2.0 and esp_connected:
            esp_connected = False
            socketio.emit('esp_status', {'connected': False})
            
        socketio.sleep(0.01)

if __name__ == '__main__':
    socketio.start_background_task(background_tasks)
    socketio.run(app, host='0.0.0.0', port=5000)