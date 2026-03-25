const socket = io();
let robotPos = [43.2951, -0.3708], currentBlinker = 'OFF', lastSend = 0;
const ORS_KEY = '5b3ce3597851110001cf6248cd33a098943146c4a68f4d127a57c517';
let lastH = false;
let lastB1 = false, lastB2 = false, lastB3 = false;

// SONS
const soundGong = new Audio('/static/gong.mp3');
const soundClick = new Audio('https://www.soundjay.com/buttons/sounds/button-20.mp3');

// CARTE
const map = L.map('map', {zoomControl: false, attributionControl: false}).setView(robotPos, 18);
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

const haloM = L.marker(robotPos, {icon: L.divIcon({className:'robot-halo', iconSize:[60,60]})}).addTo(map);
const robotM = L.marker(robotPos, {icon: L.icon({iconUrl:'/static/ico.png', iconSize:[50,50], iconAnchor:[25,38]})}).addTo(map);

// NAVIGATION AVEC OPENROUTESERVICE
const routing = L.Routing.control({
    waypoints: [],
    router: L.Routing.openrouteservice(ORS_KEY, {
        profile: 'foot-walking'
    }),
    lineOptions: { styles: [{ color: '#00d4ff', weight: 6, opacity: 0.8 }] },
    createMarker: () => null,
    addWaypoints: false,
    show: false
}).addTo(map);

routing.on('routesfound', function(e) {
    const summary = e.routes[0].summary;
    document.getElementById('nav-info').style.display = 'flex';
    document.getElementById('nav-dist').innerText = (summary.totalDistance / 1000).toFixed(1) + " km";
    document.getElementById('nav-time').innerText = Math.round(summary.totalTime / 60) + " min";
});

// RECHERCHE D'ADRESSE
const geocoder = L.Control.Geocoder.pelias(ORS_KEY, {
    placeholder: "Où voulez-vous aller ?",
    limit: 5
});

L.Control.geocoder({
    geocoder: geocoder,
    defaultMarkGeocode: false,
    collapsed: true
}).on('markgeocode', e => {
    routing.setWaypoints([L.latLng(robotM.getLatLng()), L.latLng(e.geocode.center)]);
    map.panTo(e.geocode.center, {animate: true});
}).addTo(map);

// AUTO-CENTRAGE TOUTES LES 5S
setInterval(() => {
    map.panTo(robotM.getLatLng(), { animate: true, duration: 1.5 });
}, 5000);

// --- BOUCLE DE MISE À JOUR MANETTE ---
function update() {
    const gamepads = navigator.getGamepads();
    let gp = gamepads[0] || gamepads[1];

    if (!gp) {
        // Si pas de manette, on continue de chercher sans bloquer le reste
        requestAnimationFrame(update);
        return;
    }

    // GESTION DES CLIGNOTANTS (Boutons L1, R1, Y/Triangle)
    if(gp.buttons[4].pressed && !lastB1) toggleB('L');
    if(gp.buttons[5].pressed && !lastB2) toggleB('R');
    if(gp.buttons[3].pressed && !lastB3) toggleB('W');
    
    // GESTION DU KLAXON (Bouton flèche gauche ou spécifique)
    if(gp.buttons[14].pressed && !lastH) {
        soundGong.play();
        lastH = true;
    } else if (!gp.buttons[14].pressed) {
        lastH = false;
    }

    // Mise à jour des états précédents pour éviter les répétitions
    lastB1 = gp.buttons[4].pressed; 
    lastB2 = gp.buttons[5].pressed; 
    lastB3 = gp.buttons[3].pressed;

    // MISE À JOUR VISUELLE DES JAUGES (Trigger L2 / R2)
    const fillL = document.getElementById('fillL2');
    const fillR = document.getElementById('fillR2');
    if(fillL) fillL.style.height = (gp.buttons[6].value * 100) + "%";
    if(fillR) fillR.style.height = (gp.buttons[7].value * 100) + "%";

    // ENVOI DES COMMANDES AU SERVEUR (Toutes les 50ms)
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

// LANCEMENT DE LA BOUCLE
requestAnimationFrame(update);

// FONCTIONS UTILES
function setMapStyle(s) {
    if(s === 'sat') { map.addLayer(satLayer); map.removeLayer(darkLayer); }
    else { map.addLayer(darkLayer); map.removeLayer(satLayer); }
    document.getElementById('btn-dark').classList.toggle('active', s==='dark');
    document.getElementById('btn-sat').classList.toggle('active', s==='sat');
}

function toggleB(m) {
    const cam = document.getElementById('cam-card');
    const dL = document.getElementById('dotL');
    const dR = document.getElementById('dotR');
    
    currentBlinker = (currentBlinker !== 'OFF' && currentBlinker === m) ? 'OFF' : m;
    
    if(currentBlinker !== 'OFF') soundClick.play();

    // Reset classes
    cam.className = 'card camera-container';
    if(dL) dL.classList.remove('active-dot');
    if(dR) dR.classList.remove('active-dot');
    
    if(currentBlinker !== 'OFF') {
        if(currentBlinker==='L') { cam.classList.add('flash-L'); if(dL) dL.classList.add('active-dot'); }
        if(currentBlinker==='R') { cam.classList.add('flash-R'); if(dR) dR.classList.add('active-dot'); }
        if(currentBlinker==='W') { cam.classList.add('flash-W'); if(dL) dL.classList.add('active-dot'); if(dR) dR.classList.add('active-dot'); }
    }
}

socket.on('map_update', d => {
    const p = [d.lat, d.lng];
    robotM.setLatLng(p); 
    haloM.setLatLng(p);
    const speedEl = document.getElementById('speed-display');
    if(speedEl) speedEl.innerText = Math.round(d.speed || 0);
});