const socket = io();
let robotPos = [43.2951, -0.3708], currentBlinker = 'OFF', lastSend = 0;
const ORS_KEY = '5b3ce3597851110001cf6248cd33a098943146c4a68f4d127a57c517';
let lastH = false, lastB1 = false, lastB2 = false, lastB3 = false;

// SONS
const soundGong = new Audio('/static/gong.mp3');
const soundClick = new Audio('https://www.soundjay.com/buttons/sounds/button-20.mp3');

// CARTE (Attribution retirée pour épurer)
const map = L.map('map', {zoomControl: false, attributionControl: false}).setView(robotPos, 18);
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

// MARQUEURS (Halo bleu transparent statique)
const haloM = L.marker(robotPos, {icon: L.divIcon({className:'robot-halo', iconSize:[60,60]})}).addTo(map);
const robotM = L.marker(robotPos, {icon: L.icon({iconUrl:'/static/ico.png', iconSize:[50,50], iconAnchor:[25,38]})}).addTo(map);

// ROUTAGE OPENROUTE SERVICe
const routing = L.Routing.control({
    waypoints: [],
    router: L.Routing.openrouteservice(ORS_KEY, { profile: 'foot-walking' }),
    lineOptions: { styles: [{ color: '#00d4ff', weight: 6, opacity: 0.8 }] },
    createMarker: () => null,
    show: false
}).addTo(map);

routing.on('routesfound', function(e) {
    const summary = e.routes[0].summary;
    const navInfo = document.getElementById('nav-info');
    if(navInfo) {
        navInfo.style.display = 'flex';
        document.getElementById('nav-dist').innerText = (summary.totalDistance / 1000).toFixed(1) + " km";
        document.getElementById('nav-time').innerText = Math.round(summary.totalTime / 60) + " min";
    }
});

// RECHERCHE (Nettoyée)
const geocoder = L.Control.geocoder({
    geocoder: L.Control.Geocoder.pelias(ORS_KEY, { limit: 5 }),
    defaultMarkGeocode: false,
    collapsed: true,
    placeholder: "Recherche..."
}).on('markgeocode', e => {
    routing.setWaypoints([L.latLng(robotM.getLatLng()), L.latLng(e.geocode.center)]);
    map.panTo(e.geocode.center, {animate: true});
}).addTo(map);

// BOUCLE MANETTE
function update() {
    const gamepads = navigator.getGamepads();
    // On cherche la manette sur les slots 0 à 3
    let gp = null;
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) { gp = gamepads[i]; break; }
    }

    const statusEl = document.getElementById('gp-status');
    if (!gp) {
        if(statusEl) statusEl.innerText = "MANETTE SCAN...";
        requestAnimationFrame(update);
        return;
    }

    if(statusEl) statusEl.innerText = "MANETTE OK";

    // Inputs Clignotants
    if(gp.buttons[4].pressed && !lastB1) toggleB('L');
    if(gp.buttons[5].pressed && !lastB2) toggleB('R');
    if(gp.buttons[3].pressed && !lastB3) toggleB('W');
    
    // Klaxon
    if(gp.buttons[14].pressed && !lastH) { soundGong.play(); lastH = true; } 
    else if (!gp.buttons[14].pressed) { lastH = false; }

    lastB1 = gp.buttons[4].pressed; lastB2 = gp.buttons[5].pressed; lastB3 = gp.buttons[3].pressed;

    // Jauges L2/R2
    const fL = document.getElementById('fillL2'), fR = document.getElementById('fillR2');
    if(fL) fL.style.height = (gp.buttons[6].value * 100) + "%";
    if(fR) fR.style.height = (gp.buttons[7].value * 100) + "%";

    // Envoi Socket
    const now = Date.now();
    if(now - lastSend > 50) {
        socket.emit('drive_cmd', { 
            v: Math.round((gp.buttons[7].value - gp.buttons[6].value) * 255), 
            d: Math.round(gp.axes[0] * 255), 
            blinker: currentBlinker, 
            horn: gp.buttons[14].pressed 
        });
        lastSend = now;
    }
    requestAnimationFrame(update);
}
requestAnimationFrame(update);

// --- FONCTIONS SYSTÈME ---
function setMapStyle(s) {
    if(s === 'sat') { map.addLayer(satLayer); map.removeLayer(darkLayer); }
    else { map.addLayer(darkLayer); map.removeLayer(satLayer); }
    document.getElementById('btn-dark').classList.toggle('active', s==='dark');
    document.getElementById('btn-sat').classList.toggle('active', s==='sat');
}

function toggleB(m) {
    currentBlinker = (currentBlinker === m) ? 'OFF' : m;
    if(currentBlinker !== 'OFF') soundClick.play();
    
    const cam = document.getElementById('cam-card');
    const dL = document.getElementById('dotL'), dR = document.getElementById('dotR');
    if(cam) cam.className = 'card camera-container ' + (currentBlinker !== 'OFF' ? 'flash-' + currentBlinker : '');
    if(dL) dL.classList.toggle('active-dot', currentBlinker === 'L' || currentBlinker === 'W');
    if(dR) dR.classList.toggle('active-dot', currentBlinker === 'R' || currentBlinker === 'W');
}

socket.on('map_update', d => {
    const p = [d.lat, d.lng];
    robotM.setLatLng(p); haloM.setLatLng(p);
    const sp = document.getElementById('speed-display');
    if(sp) sp.innerText = Math.round(d.speed || 0);
});