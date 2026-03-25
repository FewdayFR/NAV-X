#!/usr/bin/env python3
"""
Script de diagnostic pour la connexion ESP32
À exécuter sur le Raspberry PI
"""

import serial
import time
import subprocess

print("=" * 50)
print("   NAVX ESP32 DIAGNOSTIC")
print("=" * 50)

# 1. Lister les ports USB disponibles
print("\n[1] VÉRIFICATION DES PORTS SÉRIE...")
try:
    result = subprocess.run(['ls', '-la', '/dev/tty*'], 
                          capture_output=True, text=True)
    print(result.stdout)
except:
    print("Impossible de lister les ports")

# 2. Chercher les ports serial courants
ports_to_try = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyACM0', '/dev/ttyACM1', '/dev/ttyS0']
print("\n[2] TEST DE CONNEXION SUR LES PORTS COURANTS...")

for port in ports_to_try:
    try:
        ser = serial.Serial(port, 115200, timeout=1)
        print(f"\n✓ PORT TROUVÉ: {port}")
        print("  Tentative de lecture pendant 3 secondes...")
        
        start = time.time()
        data_received = False
        
        while time.time() - start < 3:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    print(f"  → Données reçues: {line}")
                    data_received = True
        
        if not data_received:
            print("  ✗ Aucune donnée reçue du port")
        
        ser.close()
        
    except Exception as e:
        pass

# 3. Vérifier les permissions
print("\n[3] VÉRIFICATION DES PERMISSIONS...")
result = subprocess.run(['whoami'], capture_output=True, text=True)
user = result.stdout.strip()
print(f"Utilisateur actuel: {user}")
print(f"Pour utiliser les ports série, ajoutez l'utilisateur au groupe 'dialout':")
print(f"  sudo usermod -a -G dialout {user}")

# 4. Vérifier dmesg pour les messages USB
print("\n[4] MESSAGES USB (dernières 10 lignes)...")
try:
    result = subprocess.run(['dmesg', '|', 'tail', '-20'], 
                          shell=True, capture_output=True, text=True)
    print(result.stdout)
except:
    print("Impossible de lire dmesg")

print("\n" + "=" * 50)
print("SOLUTIONS POSSIBLES:")
print("=" * 50)
print("1. Vérifiez le câble USB ESP32 ↔ Raspberry PI")
print("2. Vérifiez que l'ESP32 est allumé et programmé")
print("3. Mettez à jour le port dans main.py avec le bon port")
print("4. Assurez-vous que l'utilisateur a les permissions sur /dev/ttyXXX")
print("5. Redémarrez le Raspberry PI")
print("=" * 50)
