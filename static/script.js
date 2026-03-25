const socket = io();
let robotPos = [43.2951, -0.3708], currentBlinker = 'OFF', lastSend = 0;
let lastH = false;

// SONS
const soundGong = new Audio('/static/gong.mp3');
const soundClick = new Audio('https://www.soundjay.com/buttons/sounds/button-20.mp3');

// CARTE
const map = L.map('map', {zoomControl: false}).setView(robotPos, 18);
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

const haloM = L.marker(robotPos, {icon: L.divIcon({className:'robot-halo', iconSize:[60,60]})}).addTo(map);
const robotM = L.marker(robotPos, {icon: L.icon({iconUrl:'/static/ico.png', iconSize:[50,50], iconAnchor:[25,38]})}).addTo(map);

// Auto-center 5s
setInterval(() => {
    map.panTo(robotM.getLatLng(), { animate: true, duration: 1.5 });
}, 5000);

function setMapStyle(s) {
    if(s === 'sat') { map.addLayer(satLayer); map.removeLayer(darkLayer); }
    else { map.addLayer(darkLayer); map.removeLayer(satLayer); }
    document.getElementById('btn-dark').classList.toggle('active', s==='dark');
    document.getElementById('btn-sat').classList.toggle('active', s==='sat');
}

// NAVIGATION
const routing = L.Routing.control({
    waypoints: [],
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'foot' }),
    lineOptions: { styles: [{ color: '#00d4ff', weight: 6, opacity: 0.8 }] },
    createMarker: () => null,
    addWaypoints: false,
    show: false // On cache le panneau par défaut
}).addTo(map);

// Récupérer les infos de la route pour le bandeau
routing.on('routesfound', function(e) {
    const routes = e.routes;
    const summary = routes[0].summary;
    const distance = (summary.totalDistance / 1000).toFixed(1) + " km";
    const time = Math.round(summary.totalTime / 60) + " min";
    
    document.getElementById('nav-info').style.display = 'flex';
    document.getElementById('nav-dist').innerText = distance;
    document.getElementById('nav-time').innerText = time;
});

L.Control.geocoder({
    defaultMarkGeocode: false,
    placeholder: "Rechercher..."
}).on('markgeocode', e => {
    routing.setWaypoints([L.latLng(robotM.getLatLng()), L.latLng(e.geocode.center)]);
    map.panTo(e.geocode.center, {animate: true});
}).addTo(map);

// MANETTE
let lastB1=false, lastB2=false, lastB3=false;
function update() {
    const gamepads = navigator.getGamepads();
    let gp = gamepads[0] || gamepads[1];
    if(!gp) { document.getElementById('gp-status').innerText = "SCANNING..."; return requestAnimationFrame(update); }
    document.getElementById('gp-status').innerText = "CONNECTED";

    if(gp.buttons[4].pressed && !lastB1) toggleB('L');
    if(gp.buttons[5].pressed && !lastB2) toggleB('R');
    if(gp.buttons[3].pressed && !lastB3) toggleB('W');
    if(gp.buttons[14].pressed && !lastH) { soundGong.play(); lastH = true; } else if (!gp.buttons[14].pressed) { lastH = false; }

    lastB1=gp.buttons[4].pressed; lastB2=gp.buttons[5].pressed; lastB3=gp.buttons[3].pressed; 
    document.getElementById('fillL2').style.height = (gp.buttons[6].value * 100) + "%";
    document.getElementById('fillR2').style.height = (gp.buttons[7].value * 100) + "%";

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

function toggleB(m) {
    const cam = document.getElementById('cam-card'), dL = document.getElementById('dotL'), dR = document.getElementById('dotR');
    currentBlinker = (currentBlinker !== 'OFF') ? 'OFF' : m;
    if(currentBlinker !== 'OFF') soundClick.play();
    cam.className = 'card camera-container';
    dL.classList.remove('active-dot'); dR.classList.remove('active-dot');
    if(currentBlinker !== 'OFF') {
        if(currentBlinker==='L') { cam.classList.add('flash-L'); dL.classList.add('active-dot'); }
        if(currentBlinker==='R') { cam.classList.add('flash-R'); dR.classList.add('active-dot'); }
        if(currentBlinker==='W') { cam.classList.add('flash-W'); dL.classList.add('active-dot'); dR.classList.add('active-dot'); }
    }
}

socket.on('map_update', d => {
    const p = [d.lat, d.lng];
    robotM.setLatLng(p); haloM.setLatLng(p);
    const wps = routing.getWaypoints();
    if (wps[1] && wps[1].latLng) routing.spliceWaypoints(0, 1, L.latLng(p));
    document.getElementById('speed-display').innerText = Math.round(d.speed || 0);
});

requestAnimationFrame(update);