const socket = io();

// --- 1. INITIALISATION CARTE (SANS ROUTING POUR ÉVITER LES CRASHS) ---
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([43.2951, -0.3708], 18);
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}');

function setMap(type) {
    if (type === 'sat') {
        map.addLayer(satLayer);
        map.removeLayer(darkLayer);
    } else {
        map.addLayer(darkLayer);
        map.removeLayer(satLayer);
    }
    document.getElementById('btn-dark').classList.toggle('active', type === 'dark');
    document.getElementById('btn-sat').classList.toggle('active', type === 'sat');
}

// --- 2. DÉTECTION ET BOUCLE DE LA MANETTE ---
function updateGamepad() {
    // On récupère TOUS les gamepads connectés
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;

    // On cherche le premier qui n'est pas nul
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
            gp = gamepads[i];
            break;
        }
    }

    const statusLabel = document.getElementById('joy-label');

    if (gp) {
        statusLabel.innerText = "MANETTE CONNECTÉE : " + gp.id.substring(0, 20);
        statusLabel.style.color = "#00d4ff";

        // Mise à jour des jauges (L2 est souvent l'axe ou bouton 6, R2 le 7)
        // Attention : sur certains navigateurs ce sont des boutons, sur d'autres des axes.
        const valL2 = gp.buttons[6].value; // Frein
        const valR2 = gp.buttons[7].value; // Accel

        document.getElementById('fill-l2').style.width = (valL2 * 100) + "%";
        document.getElementById('fill-r2').style.width = (valR2 * 100) + "%";

        // Gestion des clignotants avec les boutons L1 (4) et R1 (5)
        updateBlinkers(gp);
    } else {
        statusLabel.innerText = "SCANNING GAMEPAD... (APPUYEZ SUR UN BOUTON)";
        statusLabel.style.color = "#444";
    }

    requestAnimationFrame(updateGamepad);
}

// Lancer la boucle
requestAnimationFrame(updateGamepad);

function updateBlinkers(gp) {
    const btnL1 = gp.buttons[4].pressed;
    const btnR1 = gp.buttons[5].pressed;
    const btnY = gp.buttons[3].pressed; // Warning

    document.getElementById('gui-L').classList.toggle('is-blinking', btnL1 || btnY);
    document.getElementById('dot-L').classList.toggle('active', btnL1 || btnY);
    
    document.getElementById('gui-R').classList.toggle('is-blinking', btnR1 || btnY);
    document.getElementById('dot-R').classList.toggle('active', btnR1 || btnY);
    
    document.getElementById('dot-W').classList.toggle('active', btnY);
}

// --- 3. PING ET SOCKETS ---
setInterval(async () => {
    const start = Date.now();
    try {
        await fetch('/static/style.css', { method: 'HEAD' });
        document.getElementById('ping-val').innerText = Date.now() - start;
    } catch (e) {
        document.getElementById('ping-val').innerText = "??";
    }
}, 2000);

socket.on('robot_status', (data) => {
    document.getElementById('speed').innerText = Math.round(data.speed);
    const esp = document.getElementById('esp-stat');
    esp.innerText = data.connected ? "CONNECTED" : "OFFLINE";
    esp.className = data.connected ? "" : "status-off";
});