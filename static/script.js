const socket = io();

// --- CARTE & MARQUEUR ---
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([43.2951, -0.3708], 17);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

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

function updateGamepad() {
    const gp = navigator.getGamepads()[0] || navigator.getGamepads()[1];
    if (gp) {
        document.getElementById('joy-label').innerText = "GAMEPAD CONNECTED";
        document.getElementById('joy-label').style.color = "#00d4ff";

        // Mise à jour des jauges
        document.getElementById('fill-l2').style.height = (gp.buttons[6].value * 100) + "%";
        document.getElementById('fill-r2').style.height = (gp.buttons[7].value * 100) + "%";

        // Détection boutons clignotants
        if (gp.buttons[4].pressed && !lastButtons[4]) toggleBlinker('L');
        if (gp.buttons[5].pressed && !lastButtons[5]) toggleBlinker('R');
        if (gp.buttons[3].pressed && !lastButtons[3]) toggleBlinker('W');

        socket.emit('drive_cmd', {
            v: Math.round(gp.buttons[7].value * 100),
            d: Math.round(gp.axes[0] * 100),
            blinker: blinkerState,
            horn: gp.buttons[14] ? gp.buttons[14].pressed : false
        });
        gp.buttons.forEach((btn, i) => { lastButtons[i] = btn.pressed; });
    }
    requestAnimationFrame(updateGamepad);
}

function toggleBlinker(mode) {
    blinkerState = (blinkerState === mode) ? 'OFF' : mode;
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
    } else {
        s.innerText = "ESP32 OFFLINE";
        s.classList.add('status-off');
        s.classList.remove('status-on');
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