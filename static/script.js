const socket = io({
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    transports: ['websocket', 'polling']
});

// --- CONNEXION SOCKET ---
socket.on('connect', () => {
    console.log('[NAVX] Connecté au serveur');
    document.getElementById('joy-label').style.borderColor = '#00d4ff';
});

socket.on('disconnect', () => {
    console.log('[NAVX] Déconnecté du serveur');
    document.getElementById('joy-label').style.borderColor = '#ff0000';
});

socket.on('connect_error', (error) => {
    console.error('[ERROR] Erreur connexion:', error);
});

// --- CARTE & MARQUEUR ---
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([43.2951, -0.3708], 17);

// Créer les deux couches de tuiles
const darkLayerUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const satelliteLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const darkLayer = L.tileLayer(darkLayerUrl);
const satelliteLayer = L.tileLayer(satelliteLayerUrl);

// Ajouter la couche par défaut
darkLayer.addTo(map);

let currentLayer = 'dark';

// Fonction pour basculer entre les couches
function toggleMapLayer() {
    if (currentLayer === 'dark') {
        map.removeLayer(darkLayer);
        map.addLayer(satelliteLayer);
        currentLayer = 'satellite';
        const btn = document.getElementById('map-toggle-btn');
        if (btn) btn.innerText = '🛰️ SATELLITE';
        console.log('[NAVX] Fond de carte: SATELLITE');
    } else {
        map.removeLayer(satelliteLayer);
        map.addLayer(darkLayer);
        currentLayer = 'dark';
        const btn = document.getElementById('map-toggle-btn');
        if (btn) btn.innerText = '🗺️ CLASSIQUE';
        console.log('[NAVX] Fond de carte: CLASSIQUE');
    }
}

// Écouter le clic sur le bouton (sera créé dans le HTML)
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('map-toggle-btn');
    if (btn) {
        btn.addEventListener('click', toggleMapLayer);
    }
});

const robotIcon = L.icon({
    iconUrl: '/static/ico.png',
    iconSize: [48, 48],
    iconAnchor: [24, 24]
});
let robotMarker = L.marker([43.2951, -0.3708], { icon: robotIcon }).addTo(map);

// --- ÉTAT ---
let blinkerState = 'OFF';
let lastButtons = {};
const sndBlinker = new Audio('https://lasonotheque.org/UPLOAD/mp3/3110.mp3');
sndBlinker.loop = true;
const sndGong = new Audio('/static/gong.mp3');
sndGong.volume = 1.0;

function updateGamepad() {
    const gp = navigator.getGamepads()[0] || navigator.getGamepads()[1];
    if (gp) {
        document.getElementById('joy-label').innerText = "GAMEPAD CONNECTED";
        document.getElementById('joy-label').style.color = "#00d4ff";

        // Mise à jour des jauges
        document.getElementById('fill-l2').style.height = (gp.buttons[6].value * 100) + "%";
        document.getElementById('fill-r2').style.height = (gp.buttons[7].value * 100) + "%";

        // Détection boutons clignotants
        if (gp.buttons[4].pressed && !lastButtons[4]) {
            toggleBlinker('L');
            console.log('[NAVX] Clignotant GAUCHE');
        }
        if (gp.buttons[5].pressed && !lastButtons[5]) {
            toggleBlinker('R');
            console.log('[NAVX] Clignotant DROIT');
        }
        if (gp.buttons[3].pressed && !lastButtons[3]) {
            toggleBlinker('W');
            console.log('[NAVX] Warning');
        }
        
        // Détection flèche gauche pour gong
        if (gp.buttons[14].pressed && !lastButtons[14]) {
            sndGong.currentTime = 0;
            sndGong.play().catch(() => {});
            console.log('[NAVX] GONG!');
        }

        // Envoi commande de conduite
        if (socket.connected) {
            socket.emit('drive_cmd', {
                v: Math.round(gp.buttons[7].value * 100),
                d: Math.round(gp.axes[0] * 100),
                blinker: blinkerState,
                horn: gp.buttons[14] ? gp.buttons[14].pressed : false
            });
        }
        
        gp.buttons.forEach((btn, i) => { lastButtons[i] = btn.pressed; });
    } else {
        document.getElementById('joy-label').innerText = "WAITING FOR GAMEPAD...";
        document.getElementById('joy-label').style.color = "#ff6b6b";
    }
    requestAnimationFrame(updateGamepad);
}

function toggleBlinker(mode) {
    // Si le même bouton est appuyé → éteint
    if (blinkerState === mode) {
        blinkerState = 'OFF';
    } 
    // Si aucun clignotant actif → allume le nouveau
    else if (blinkerState === 'OFF') {
        blinkerState = mode;
    } 
    // Si un autre clignotant est actif → éteint l'actuel
    else {
        blinkerState = 'OFF';
    }

    document.querySelectorAll('.halo-light, .icon-btn').forEach(e => e.classList.remove('active-sync'));
    sndBlinker.pause();

    if (blinkerState === 'OFF') return;
    
    sndBlinker.play().catch(() => {});
    if (blinkerState === 'L' || blinkerState === 'W') {
        document.getElementById('gui-L').classList.add('active-sync');
        document.getElementById('dot-L').classList.add('active-sync');
    }
    if (blinkerState === 'R' || blinkerState === 'W') {
        document.getElementById('gui-R').classList.add('active-sync');
        document.getElementById('dot-R').classList.add('active-sync');
    }
    if (blinkerState === 'W') document.getElementById('dot-W').classList.add('active-sync');
}

socket.on('map_update', (data) => {
    robotMarker.setLatLng([data.lat, data.lng]);
    map.panTo([data.lat, data.lng]);
});

socket.on('esp_status', (data) => {
    const s = document.getElementById('esp-stat');
    if (data.connected) {
        s.innerText = "ESP32 ONLINE";
        s.classList.remove('status-off');
        s.classList.add('status-on');
        console.log('[NAVX] ESP32 connecté!');
    } else {
        s.innerText = "ESP32 OFFLINE";
        s.classList.add('status-off');
        s.classList.remove('status-on');
        console.log('[WARNING] ESP32 déconnecté!');
    }
});

// Ping
setInterval(async () => {
    const start = Date.now();
    try {
        await fetch('/static/style.css', { method: 'HEAD' });
        document.getElementById('ping-val').innerText = Date.now() - start;
    } catch (e) {}
}, 2000);

requestAnimationFrame(updateGamepad);