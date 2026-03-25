const socket = io();
let robotPos = [43.2951, -0.3708], currentBlinker = 'OFF', lastSend = 0;

// Initialisation Carte
const map = L.map('map', {zoomControl: false}).setView(robotPos, 18);
const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
const haloM = L.marker(robotPos, {icon: L.divIcon({className:'robot-halo', iconSize:[60,60]})}).addTo(map);
const robotM = L.marker(robotPos, {icon: L.icon({iconUrl:'/static/ico.png', iconSize:[50,50], iconAnchor:[25,38]})}).addTo(map);

function setMapStyle(s) {
    if(s === 'sat') { map.addLayer(satLayer); map.removeLayer(darkLayer); }
    else { map.addLayer(darkLayer); map.removeLayer(satLayer); }
    document.getElementById('btn-dark').classList.toggle('active', s==='dark');
    document.getElementById('btn-sat').classList.toggle('active', s==='sat');
}

// Navigation
const routing = L.Routing.control({
    waypoints: [],
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'foot' }),
    lineOptions: { styles: [{ color: '#00d4ff', weight: 5, opacity: 0.8 }] },
    createMarker: () => null, show: false
}).addTo(map);

L.Control.geocoder({defaultMarkGeocode:false}).on('markgeocode', e => {
    routing.setWaypoints([L.latLng(robotM.getLatLng()), L.latLng(e.geocode.center)]);
    map.panTo(e.geocode.center, {animate: true});
}).addTo(map);

let lastB1=false, lastB2=false, lastB3=false, lastH=false;

function update() {
    const gamepads = navigator.getGamepads();
    let gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];

    if(!gp) {
        document.getElementById('gp-status').innerText = "SCANNING...";
        return requestAnimationFrame(update);
    }
    document.getElementById('gp-status').innerText = "CONNECTED";

    // Boutons
    if(gp.buttons[4].pressed && !lastB1) toggleB('L');
    if(gp.buttons[5].pressed && !lastB2) toggleB('R');
    if(gp.buttons[3].pressed && !lastB3) toggleB('W');

    lastB1=gp.buttons[4].pressed; lastB2=gp.buttons[5].pressed; lastB3=gp.buttons[3].pressed; 
    lastH=gp.buttons[14].pressed; // Flèche Gauche pour le Gong

    // Affichage jauges
    document.getElementById('fillL2').style.height = (gp.buttons[6].value * 100) + "%";
    document.getElementById('fillR2').style.height = (gp.buttons[7].value * 100) + "%";

    const now = Date.now();
    if(now - lastSend > 50) {
        socket.emit('drive_cmd', { 
            v: Math.round((gp.buttons[7].value - gp.buttons[6].value) * 255), 
            d: Math.round(gp.axes[0] * 255), 
            blinker: currentBlinker, 
            horn: lastH 
        });
        lastSend = now;
    }
    requestAnimationFrame(update);
}

function toggleB(m) {
    const cam = document.getElementById('cam-card'), dL = document.getElementById('dotL'), dR = document.getElementById('dotR');
    currentBlinker = (currentBlinker !== 'OFF') ? 'OFF' : m;
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
    map.panTo(p, { animate: true, duration: 1.0 });
    const wps = routing.getWaypoints();
    if (wps[1] && wps[1].latLng) routing.spliceWaypoints(0, 1, L.latLng(p));
    document.getElementById('speed-display').innerText = Math.round(d.speed || 0);
});

requestAnimationFrame(update);