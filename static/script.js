const socket = io();

// --- CONFIGURATION CARTE ---
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([43.2951, -0.3708], 18);
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}');

function setMap(type) {
    if (type === 'sat') { map.addLayer(satLayer); map.removeLayer(darkLayer); }
    else { map.addLayer(darkLayer); map.removeLayer(satLayer); }
    document.getElementById('btn-dark').classList.toggle('active', type === 'dark');
    document.getElementById('btn-sat').classList.toggle('active', type === 'sat');
}

// --- ÉTAT ET SONS ---
let blinkerState = 'OFF'; 
let lastButtons = {}; 

const sndBlinker = new Audio('/static/sounds/clignotant.mp3');
const sndGong = new Audio('/static/sounds/gong.mp3');
sndBlinker.loop = true;

// --- BOUCLE DE CONTRÔLE ---
function updateGamepad() {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0] || gamepads[1];
    const statusLabel = document.getElementById('joy-label');

    if (gp) {
        statusLabel.innerText = "MANETTE CONNECTÉE";
        statusLabel.style.color = "#00d4ff";

        // Jauges L2 (Frein) / R2 (Accel)
        document.getElementById('fill-l2').style.width = (gp.buttons[6].value * 100) + "%";
        document.getElementById('fill-r2').style.width = (gp.buttons[7].value * 100) + "%";

        // LOGIQUE : L1(4), R1(5), Y(3), X(2)
        if (gp.buttons[4].pressed && !lastButtons[4]) handleBlinkerInput('L');
        if (gp.buttons[5].pressed && !lastButtons[5]) handleBlinkerInput('R');
        if (gp.buttons[3].pressed && !lastButtons[3]) handleBlinkerInput('W');
        
        // GONG (Bouton Carré/X)
        if (gp.buttons[2].pressed && !lastButtons[2]) {
            sndGong.currentTime = 0;
            sndGong.play();
        }

        // Sauvegarde état pour le prochain cycle
        gp.buttons.forEach((btn, i) => { lastButtons[i] = btn.pressed; });
    } else {
        statusLabel.innerText = "SCANNING GAMEPAD...";
        statusLabel.style.color = "#444";
    }
    requestAnimationFrame(updateGamepad);
}

// --- TA LOGIQUE SPÉCIFIQUE D'ANNULATION ---
function handleBlinkerInput(newMode) {
    // Si un clignotant est déjà allumé (n'importe lequel)
    if (blinkerState !== 'OFF') {
        // Peu importe sur quoi on appuie (opposé ou même), on éteint tout
        setBlinker('OFF');
    } else {
        // Si tout était éteint, on allume le nouveau mode demandé
        setBlinker(newMode);
    }
}

function setBlinker(mode) {
    blinkerState = mode;

    // Reset visuel total
    document.getElementById('gui-L').classList.remove('is-blinking');
    document.getElementById('gui-R').classList.remove('is-blinking');
    document.querySelectorAll('.led').forEach(el => el.classList.remove('active'));

    // Gestion Audio
    sndBlinker.pause();
    sndBlinker.currentTime = 0;

    if (mode === 'OFF') return;

    // On lance le tic-tac
    sndBlinker.play();

    if (mode === 'L' || mode === 'W') {
        document.getElementById('gui-L').classList.add('is-blinking');
        document.getElementById('dot-L').classList.add('active');
    }
    if (mode === 'R' || mode === 'W') {
        document.getElementById('gui-R').classList.add('is-blinking');
        document.getElementById('dot-R').classList.add('active');
    }
    if (mode === 'W') {
        document.getElementById('dot-W').classList.add('active');
    }
}

requestAnimationFrame(updateGamepad);

// --- SOCKETS & PING ---
socket.on('robot_status', (data) => {
    document.getElementById('speed').innerText = Math.round(data.speed || 0);
    const esp = document.getElementById('esp-stat');
    esp.innerText = data.connected ? "CONNECTED" : "OFFLINE";
    esp.className = data.connected ? "" : "status-off";
});

setInterval(async () => {
    const start = Date.now();
    try {
        await fetch('/static/style.css', { method: 'HEAD' });
        document.getElementById('ping-val').innerText = Date.now() - start;
    } catch (e) { document.getElementById('ping-val').innerText = "??"; }
}, 2000);