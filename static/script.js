const socket = io();
let robotPos = [43.2951, -0.3708], currentBlinker = 'OFF', lastSend = 0;
const ORS_KEY = '5b3ce3597851110001cf6248cd33a098943146c4a68f4d127a57c517';
let lastH = false, lastB1 = false, lastB2 = false, lastB3 = false;

// CARTE
const map = L.map('map', {zoomControl: false, attributionControl: false}).setView(robotPos, 18);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

const haloM = L.marker(robotPos, {icon: L.divIcon({className:'robot-halo', iconSize:[60,60]})}).addTo(map);
const robotM = L.marker(robotPos, {icon: L.icon({iconUrl:'/static/ico.png', iconSize:[50,50], iconAnchor:[25,38]})}).addTo(map);

// NAVIGATION
const routing = L.Routing.control({
    waypoints: [],
    router: L.Routing.openrouteservice(ORS_KEY, { profile: 'foot-walking' }),
    lineOptions: { styles: [{ color: '#00d4ff', weight: 6, opacity: 0.8 }] },
    createMarker: () => null,
    show: false
}).addTo(map);

routing.on('routesfound', (e) => {
    const s = e.routes[0].summary;
    document.getElementById('nav-info').style.display = 'flex';
    document.getElementById('nav-dist').innerText = (s.totalDistance / 1000).toFixed(1) + " km";
    document.getElementById('nav-time').innerText = Math.round(s.totalTime / 60) + " min";
});

// RECHERCHE (On retire les options qui polluent l'affichage)
L.Control.geocoder({
    geocoder: L.Control.Geocoder.pelias(ORS_KEY, { limit: 5 }),
    defaultMarkGeocode: false,
    collapsed: true
}).on('markgeocode', e => {
    routing.setWaypoints([L.latLng(robotM.getLatLng()), L.latLng(e.geocode.center)]);
    map.panTo(e.geocode.center, {animate: true});
}).addTo(map);

// --- BOUCLE MANETTE ULTRA-COMPATIBLE ---
function updateLoop() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let activePad = null;

    // On cherche n'importe quelle manette connectée
    for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) {
            activePad = pads[i];
            break; 
        }
    }

    const status = document.getElementById('gp-status');
    if (!activePad) {
        if (status) status.innerText = "MANETTE SCAN...";
        requestAnimationFrame(updateLoop);
        return;
    }

    if (status) status.innerText = "MANETTE OK";

    // Contrôles clignotants
    if(activePad.buttons[4].pressed && !lastB1) toggleB('L');
    if(activePad.buttons[5].pressed && !lastB2) toggleB('R');
    if(activePad.buttons[3].pressed && !lastB3) toggleB('W');
    lastB1 = activePad.buttons[4].pressed; 
    lastB2 = activePad.buttons[5].pressed; 
    lastB3 = activePad.buttons[3].pressed;

    // Envoi Socket
    const now = Date.now();
    if(now - lastSend > 50) {
        socket.emit('drive_cmd', { 
            v: Math.round((activePad.buttons[7].value - activePad.buttons[6].value) * 255), 
            d: Math.round(activePad.axes[0] * 255), 
            blinker: currentBlinker, 
            horn: activePad.buttons[14].pressed 
        });
        lastSend = now;
    }
    requestAnimationFrame(updateLoop);
}
requestAnimationFrame(updateLoop);

function toggleB(m) {
    currentBlinker = (currentBlinker === m) ? 'OFF' : m;
    const cam = document.getElementById('cam-card');
    if(cam) cam.className = 'card camera-container ' + (currentBlinker !== 'OFF' ? 'flash-' + currentBlinker : '');
}