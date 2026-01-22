const q = id => document.getElementById(id);
let miniCharts = {};
let bigChart = null;
let lastChartUpdate = 0;
let isManualLocation = false;
let tempoInizioRicercaAntenna = null; // Memorizza quando inizia la ricerca antenna 
let ricercaManualeSuggerita = false;  // Evita che il messaggio appaia ripetutamente

function getSavedInterval() {
    const saved = localStorage.getItem('updateInterval');
    return saved ? parseInt(saved) : 15000;
}

const sensorCfg = {
    temp: { id: 'Temp', c: '#ef4444', min: -10, max: 50, u: '°C', targetId: 'tempValue' },
    hum: { id: 'Hum', c: '#3b82f6', min: 0, max: 100, u: '%', targetId: 'humValue' },
    press_mb: { id: 'Press', c: '#f59e0b', min: 950, max: 1050, u: 'hPa', targetId: 'pressValue' },
    iaq: { id: 'Iaq', c: '#10b981', u: 'IAQ', targetId: 'iaqValue' },
    co2: { id: 'Co2', c: '#a855f7', u: 'ppm', targetId: 'co2Value' },
    pm25: { id: 'Pm25', c: '#64748b', u: 'µg/m³', targetId: 'pm25Value' },
    uv: { id: 'Uv', c: '#fbbf24', u: 'Index', targetId: 'uvValue' },
    wind: { id: 'Wind', c: '#0ea5e9', u: 'km/h', targetId: 'windValue' }
};

function getAQIInfo(tipo, val) {
    if (tipo === 'iaq') {
        if (val <= 50) return { c: '#10b981', t: 'OTTIMA' };
        if (val <= 100) return { c: '#f59e0b', t: 'MEDIOCRE' };
        return { c: '#ef4444', t: 'RISCHIO' };
    }
    if (tipo === 'co2') {
        if (val <= 800) return { c: '#10b981', t: 'ECCELLENTE' };
        if (val <= 1200) return { c: '#f59e0b', t: 'ATTENZIONE' };
        return { c: '#ef4444', t: 'ALTA' };
    }
    if (tipo === 'pm25') {
        if (val <= 25) return { c: '#10b981', t: 'BUONA' };
        if (val <= 50) return { c: '#f59e0b', t: 'MODERATA' };
        return { c: '#ef4444', t: 'ALTA' };
    }
    if (tipo === 'uv') {
        if (val <= 2) return { c: '#10b981', t: 'BASSO' };
        if (val <= 5) return { c: '#f59e0b', t: 'MODERATO' };
        if (val <= 7) return { c: '#f97316', t: 'ALTO' };
        return { c: '#ef4444', t: 'ESTREMO' };
    }
    if (tipo === 'wind') {
        if (val <= 19) return { c: '#10b981', t: 'BREZZA' };
        if (val <= 38) return { c: '#f59e0b', t: 'MODERATO' };
        return { c: '#ef4444', t: 'FORTE' };
    }
    return { c: '#10b981', t: '--' };
}

function updateStatusLEDs(status, data = null) {
    const basicLeds = { 'led-temp': 'online', 'led-hum': 'online', 'led-press': 'online' };
    Object.keys(basicLeds).forEach(id => {
        const el = q(id);
        if (el) el.className = 'led ' + (status === 'online' ? 'led-online' : 'led-offline');
    });
    const smartSensors = ['iaq', 'co2', 'pm25', 'uv', 'wind'];
    if (status === 'online' && data) {
        smartSensors.forEach(s => {
            const elLed = q('led-' + s);
            const elLabel = q('label-' + s);
            const val = data[s] !== undefined ? parseFloat(data[s]) : 0;
            const info = getAQIInfo(s, val);
            if (elLed) { elLed.style.backgroundColor = info.c; elLed.style.boxShadow = `0 0 8px ${info.c}`; }
            if (elLabel) { elLabel.innerText = info.t; elLabel.style.color = info.c; }
        });
    } else if (status === 'offline') {
        smartSensors.forEach(s => {
            const elLed = q('led-' + s);
            const elLabel = q('label-' + s);
            if (elLed) { elLed.style.backgroundColor = '#64748b'; elLed.style.boxShadow = ''; }
            if (elLabel) { elLabel.innerText = '--'; elLabel.style.color = '#64748b'; }
        });
    }
}

function drawGauge(canvasId, val, cfg) {
    const canvas = q(canvasId); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height || 120;
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const cx = w / 2;
    const cy = h * 0.85;
    const r = Math.min(w, h) * 0.48;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
    const fontSize = w < 130 ? 8 : 10;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    for (let i = 0; i <= 10; i++) {
        const angle = Math.PI + (Math.PI * (i / 10));
        const v = cfg.min + (i * (cfg.max - cfg.min) / 10);
        ctx.beginPath(); ctx.lineWidth = 1.5;
        ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        ctx.lineTo(cx + Math.cos(angle) * (r + 6), cy + Math.sin(angle) * (r + 6));
        ctx.stroke();
        if (w > 100) {
            const txtR = r + 16;
            ctx.fillText(v.toFixed(0), cx + Math.cos(angle) * txtR, cy + Math.sin(angle) * txtR);
        }
    }
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.strokeStyle = '#2d3748'; ctx.lineWidth = w < 130 ? 10 : 16; ctx.stroke();
    const p = (Math.min(Math.max(val, cfg.min), cfg.max) - cfg.min) / (cfg.max - cfg.min);
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + (Math.PI * p));
    ctx.strokeStyle = cfg.c; ctx.lineWidth = w < 130 ? 10 : 16; ctx.stroke();
    const na = Math.PI + (Math.PI * p);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (r + 2), cy + Math.sin(na) * (r + 2)); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
}

function toggleSearch() {
    const container = document.querySelector('.gps-search-container');
    const input = q('addressInput');
    if (container) container.classList.toggle('active');
    if (container && container.classList.contains('active') && input) input.focus();
}

// NUOVA FUNZIONE DI AGGIORNAMENTO GPS BLOCCATA
async function aggiornaPosizioneGPS() {
    const localitaEl = document.getElementById("localitaNome");
    const gpsCoordEl = document.getElementById("gpsCoordinate");
    const ESP_URL = "http://meteo.local/api/data"; 

    try {
        const response = await fetch(ESP_URL, { mode: 'cors', cache: 'no-store' });
        const data = await response.json();
        
        const oraAttuale = Date.now();
        const millisecondiDallAvvio = oraAttuale - tempoInizioDashboard;

        if (millisecondiDallAvvio < 6000) {
            if (localitaEl) localitaEl.innerHTML = `<span style="color:#facc15;font-weight:bold;"><i class="fas fa-sync fa-spin"></i> Avvio Gps....</span>`;
            return; 
        }

        if (data.lat === "0.0" || parseFloat(data.lat) === 0) {
            if (!tempoInizioRicercaAntenna) tempoInizioRicercaAntenna = oraAttuale;

            if (localitaEl) localitaEl.innerHTML = `<span style="color:#facc15;font-weight:bold;"><i class="fas fa-satellite-dish fa-spin"></i> GPS: Ricerca antenna</span>`;

            // TEST RAPIDO: 10 secondi (10000 ms) invece di 20 minuti
            if (oraAttuale - tempoInizioRicercaAntenna >1200000 && !ricercaManualeSuggerita) {
                ricercaManualeSuggerita = true;
                toggleSearch(); 
            }
            
            const salvata = localStorage.getItem('ultimaPosizioneValida');
            if (salvata && gpsCoordEl) {
                const d = JSON.parse(salvata);
                gpsCoordEl.innerHTML = `<small style="color:#94a3b8;">Ultimo fix: ${parseFloat(d.lat).toFixed(4)}, ${parseFloat(d.lon).toFixed(4)}</small>`;
            }
        } else {
            tempoInizioRicercaAntenna = null;
            ricercaManualeSuggerita = false;
            // ... resto della logica fix (indirizzo e coordinate) ...
            const lat = parseFloat(data.lat);
            const lon = parseFloat(data.lon);
            if (lat !== ultimaLat || lon !== ultimaLon) {
                indirizzoSalvato = await ottieniIndirizzoTestuale(lat, lon);
                ultimaLat = lat; ultimaLon = lon;
                localStorage.setItem('ultimaPosizioneValida', JSON.stringify({lat, lon, localita: indirizzoSalvato}));
            }
            if (localitaEl) localitaEl.innerHTML = `<span style="color:#4ade80;font-weight:bold;">📍 ${indirizzoSalvato}</span>`;
            if (gpsCoordEl) gpsCoordEl.innerHTML = convertiInDMS(lat, lon);
        }
    } catch (err) {
        console.warn("ESP32 Offline - Avvio timer emergenza");
        if (!tempoInizioRicercaAntenna) tempoInizioRicercaAntenna = Date.now();
        
        // TEST RAPIDO ANCHE PER STATO OFFLINE: 10 secondi
        if (Date.now() - tempoInizioRicercaAntenna > 10000 && !ricercaManualeSuggerita) {
            ricercaManualeSuggerita = true;
            toggleSearch(); 
        }
    }
}

async function cercaIndirizzo() {
    const input = q('addressInput');
    if (!input || input.value.trim().length < 3) {
        console.log("Inserire almeno 3 caratteri");
        return;
    }

    console.log("Ricerca in corso per:", input.value);

    try {
        // Usiamo un servizio di geocodifica gratuito
        const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(input.value)}&maxLocations=1&sourceCountry=ITA`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
            const p = data.candidates[0];

            // Salvataggio preciso nel localStorage
            const nuovaPosizione = {
                nome: p.address,
                lat: p.location.y,
                lon: p.location.x
            };

            localStorage.setItem('ultimaPosizione', JSON.stringify(nuovaPosizione));
            console.log("Posizione salvata:", nuovaPosizione);

            applyGPSData(); // Aggiorna subito l'interfaccia
            toggleSearch(); // Chiude la barra di ricerca
            input.value = ""; // Pulisce il campo
        } else {
            alert("Indirizzo non trovato. Prova ad aggiungere la città (es: Via Roma, Milano)");
        }
    } catch (error) {
        console.error("Errore durante la ricerca:", error);
        alert("Errore nel servizio di ricerca.");
    }
}

function convertiInDMS(lat, lon) {
    const toDMS = (v) => {
        const d = Math.floor(Math.abs(v));
        const m = Math.floor((Math.abs(v) - d) * 60);
        const s = ((Math.abs(v) - d - (m / 60)) * 3600).toFixed(1);
        return `${d}° ${m}′ ${s}″`;
    };
    return `${toDMS(lat)} ${lat >= 0 ? 'N' : 'S'}<br>${toDMS(lon)} ${lon >= 0 ? 'E' : 'W'}`;
}

async function fetchSensorData() {
    const wifiLed = q('wifi-led');
    try {
        const response = await fetch('https://api.thingspeak.com/channels/3221413/feeds/last.json');
        if (!response.ok) throw new Error('Network error');
        const tsData = await response.json();

        const data = {
            temp: tsData.field1, hum: tsData.field2, press_mb: tsData.field3,
            iaq: tsData.field4, co2: tsData.field5, pm25: tsData.field6,
            uv: tsData.field7, wind: tsData.field8,
            ora: new Date().toLocaleTimeString('it-IT'),
            data: new Date(tsData.created_at).toLocaleDateString('it-IT')
        };

        if (wifiLed) wifiLed.className = 'led led-online';
        updateStatusLEDs('online', data);
        if (q('clock')) q('clock').innerText = data.ora;
        if (q('date')) q('date').innerText = data.data;

        // RIAPPLICA SEMPRE I DATI GPS SALVATI (Così non tornano a Cannara)
       //applyGPSData();

        const oraAttuale = Date.now();
        const intervallo = getSavedInterval();
        let deveAggiornare = (oraAttuale - lastChartUpdate >= intervallo);
        if (deveAggiornare) lastChartUpdate = oraAttuale;

        Object.keys(sensorCfg).forEach(key => {
            const val = parseFloat(data[key]);
            if (isNaN(val)) return;
            const cfg = sensorCfg[key];
            if (q(cfg.targetId)) {
                let vDisp = (key === 'press_mb') ? val.toFixed(0) : val.toFixed(1);
                q(cfg.targetId).innerText = vDisp + (cfg.u ? ' ' + cfg.u : '');
            }
            if (deveAggiornare) {
                updateMiniChart(key, val);
                if (['temp', 'hum', 'press_mb'].includes(key)) drawGauge('gauge' + cfg.id, val, cfg);
            }
            if (key === 'iaq' && q('iaqIcon')) {
                q('iaqIcon').style.setProperty('color', getAQIInfo('iaq', val).c, 'important');
            }
        });
    } catch (e) {
        if (wifiLed) wifiLed.className = 'led led-offline';
        updateStatusLEDs('offline');
    }
}

function updateMiniChart(key, val) {
    const chart = miniCharts[key]; if (!chart) return;
    const timeLabel = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (chart.data.labels.length > 20) { chart.data.labels.shift(); chart.data.datasets[0].data.shift(); }
    chart.data.labels.push(timeLabel); chart.data.datasets[0].data.push(val);
    chart.update('none');
}

function openModal(sensor) {
    q('chartModal').style.display = 'flex';
    const cfg = sensorCfg[sensor];
    if (!cfg || !miniCharts[sensor]) return;
    q('modalTitle').innerText = "Storico: " + cfg.id;
    const ctx = q('bigChartCanvas').getContext('2d');
    if (bigChart) bigChart.destroy();
    bigChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: miniCharts[sensor].data.labels,
            datasets: [{
                label: cfg.id, data: miniCharts[sensor].data.datasets[0].data,
                borderColor: cfg.c, backgroundColor: cfg.c + '33', fill: true, tension: 0.3, pointRadius: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#ffffff' } } },
            scales: {
                x: { ticks: { color: '#ffffff' }, grid: { color: 'rgba(148,163,184,0.35)' } },
                y: { ticks: { color: '#ffffff' }, grid: { color: 'rgba(148,163,184,0.35)' } }
            }
        }
    });
}

function eseguiStampaEffettiva() {
    if (!bigChart) return;
    bigChart.options.scales.x.ticks.color = '#000000';
    bigChart.options.scales.y.ticks.color = '#000000';
    bigChart.options.plugins.legend.labels.color = '#000000';
    bigChart.update('none');
    setTimeout(() => {
        const imgData = bigChart.toBase64Image();
        let pImg = q('printImg') || document.createElement('img');
        pImg.id = 'printImg'; pImg.src = imgData; pImg.style.display = 'block';
        document.querySelector('#chartModal .modal-content').appendChild(pImg);
        q('bigChartCanvas').style.visibility = 'hidden';

        // Usa le coordinate attuali salvate per la stampa
        const salvataggio = JSON.parse(localStorage.getItem('ultimaPosizione')) || { lat: 43.0125, lon: 12.5852 };
        if (q('modalCoords')) {
            q('modalCoords').innerText = `LAT: ${salvataggio.lat} | LON: ${salvataggio.lon}`;
            q('modalCoords').style.color = 'black';
        }

        window.print();
        setTimeout(() => {
            pImg.style.display = 'none'; q('bigChartCanvas').style.visibility = 'visible';
            bigChart.options.scales.x.ticks.color = '#ffffff'; bigChart.options.scales.y.ticks.color = '#ffffff';
            bigChart.options.plugins.legend.labels.color = '#ffffff'; bigChart.update('none');
            if (q('modalCoords')) q('modalCoords').style.color = 'white';
        }, 500);
    }, 250);
}

async function esportaCSV() {
    try {
        const intervalloMs = getSavedInterval();
        let risultati = 500; let timescale = "";
        if (intervalloMs <= 15000) risultati = 480;
        else if (intervalloMs <= 60000) { risultati = 720; timescale = "&timescale=1"; }
        else { risultati = 540; timescale = "&timescale=240"; }
        const url = `https://api.thingspeak.com/channels/3221413/feeds.json?results=${risultati}${timescale}`;
        const res = await fetch(url);
        const feeds = (await res.json()).feeds;
        if (!feeds || feeds.length === 0) { alert("Nessun dato trovato."); return; }
        let csv = "GIORNO;MESE;ANNO;ORA;" + Object.keys(sensorCfg).map(k => sensorCfg[k].id.toUpperCase()).join(";") + "\n";
        let ultimoT = 0;
        feeds.forEach(f => {
            const d = new Date(f.created_at);
            const t = d.getTime();
            if (t - ultimoT < (intervalloMs - 2000)) return;
            ultimoT = t;
            const riga = [
                String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear(),
                d.getHours().toString().padStart(2, '0') + ":" + d.getMinutes().toString().padStart(2, '0') + ":" + d.getSeconds().toString().padStart(2, '0'),
                f.field1, f.field2, f.field3, f.field4, f.field5, f.field6, f.field7, f.field8
            ].map(v => v?.toString().replace('.', ',')).join(";");
            csv += riga + "\n";
        });
        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Report_Meteo.csv`);
        link.click();
    } catch (e) { alert("Errore download."); }
}

function initCharts() {
    Object.keys(sensorCfg).forEach(k => {
        const canvas = q('mini' + sensorCfg[k].id); if (!canvas) return;
        miniCharts[k] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ data: [], borderColor: sensorCfg[k].c, borderWidth: 2, pointRadius: 0, fill: false }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: true, ticks: { color: '#ffffff', font: { size: 8 } }, grid: { color: 'rgba(148,163,184,0.45)' } },
                    y: { display: true, ticks: { color: '#ffffff', font: { size: 8 } }, grid: { color: 'rgba(148,163,184,0.45)' } }
                }
            }
        });
    });
}

function caricaPreferenzeUtente() {
    ['temp', 'hum', 'press_mb', 'iaq', 'co2', 'pm25', 'uv', 'wind', 'gps'].forEach(s => {
        let stato = localStorage.getItem('show_' + s);
        if (q('block-' + s) && stato !== null) q('block-' + s).style.setProperty('display', (stato === 'false' ? 'none' : 'flex'), 'important');
    });
}

window.addEventListener('resize', () => {
    Object.keys(sensorCfg).forEach(k => {
        if (['temp', 'hum', 'press_mb'].includes(k)) {
            const val = parseFloat(q(sensorCfg[k].targetId)?.innerText);
            if (!isNaN(val)) drawGauge('gauge' + sensorCfg[k].id, val, sensorCfg[k]);
        }
    });
});

document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    caricaPreferenzeUtente();
    
    // 1. Prima proviamo a caricare l'ultima posizione nota dal browser (cache)
    applyGPSData(); 
    
    // 2. Chiamiamo immediatamente l'ESP32 per i dati reali (sovrascriverà la cache o "Cannara")
    aggiornaPosizioneGPS(); 
    
    // 3. Carichiamo i dati dei sensori da ThingSpeak
    await fetchSensorData();
    
    // Timer per aggiornamento sensori (1 secondo)
    setInterval(fetchSensorData, 1000);
});

// 2. FUNZIONI DI UTILITÀ (Mettila qui!)
async function ottieniIndirizzoTestuale(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'it' }
        });
        const data = await response.json();
        const addr = data.address;
        const citta = addr.city || addr.town || addr.village || addr.municipality || "Località sconosciuta";
        const via = addr.road || addr.suburb || "";
        return via ? `${via}, ${citta}` : citta;
    } catch (error) {
        console.error("Errore geocoding:", error);
        return "Indirizzo non disponibile";
    }
}

// === GESTIONE BLOCCO POSIZIONE GPS (ESP32 via mDNS) ===
const ESP_HOST = "http://meteo.local";  // oppure "http://192.168.x.x"
const GPS_ENDPOINT = "http://meteo.local/api/data";

let ultimaLat = 0;
let ultimaLon = 0;
let indirizzoSalvato = "";

// Aggiungi queste variabili in alto nel file script.js
let tempoInizioDashboard = Date.now();
let faseInizialeCompletata = false;

// --- 1. FUNZIONE DI VISUALIZZAZIONE (Da aggiungere) ---
function applyGPSData() {
    const manuale = localStorage.getItem('ultimaPosizione');
    const automatico = localStorage.getItem('ultimaPosizioneValida');
    const datiSalvati = manuale || automatico;

    if (datiSalvati) {
        try {
            const pos = JSON.parse(datiSalvati);
            if (pos && pos.lat && pos.lon) {
                if (q('localitaNome')) q('localitaNome').innerText = pos.nome || pos.localita || "Posizione impostata";
                if (q('gpsRaw')) q('gpsRaw').innerText = `LAT: ${parseFloat(pos.lat).toFixed(5)} | LON: ${parseFloat(pos.lon).toFixed(5)}`;
                if (q('gpsCoordinate')) q('gpsCoordinate').innerHTML = convertiInDMS(pos.lat, pos.lon);
            }
        } catch (e) {
            console.error("Errore GPS:", e);
        }
    }
}

// Incolla qui la nuova funzione
function chiudiSearchSeAperta() {
    const searchBar = document.getElementById('search-bar'); 
    // Se la tua barra di ricerca ha un ID o una classe diversa, modificali qui
    if (searchBar && searchBar.classList.contains('active')) {
        toggleSearch(); // Chiama la tua funzione esistente per chiuderla
    }
}

// ... fine del file o altre funzioni ...


async function aggiornaPosizioneGPS() {
    const localitaEl = document.getElementById("localitaNome");
    const gpsCoordEl = document.getElementById("gpsCoordinate");
    const gpsRawEl = document.getElementById("gpsRaw"); // Punta ai trattini LAT: -- | LON: --
    const ESP_URL = "http://meteo.local/api/data"; 

    try {
        const response = await fetch(ESP_URL, { mode: 'cors', cache: 'no-store' });
        const data = await response.json();
        
        const oraAttuale = Date.now();
        const millisecondiDallAvvio = oraAttuale - tempoInizioDashboard;

        // --- 1. FASE AVVIO (Primi 6 secondi) ---
        if (millisecondiDallAvvio < 6000) {
            if (localitaEl) localitaEl.innerHTML = `<span style="color:#facc15;font-weight:bold;"><i class="fas fa-sync fa-spin"></i> Avvio Gps....</span>`;
            return; 
        }

        // --- 2. FASE RICERCA ANTENNA (Latitudine 0.0) ---
        if (data.lat === "0.0" || parseFloat(data.lat) === 0) {
            if (!tempoInizioRicercaAntenna) {
                tempoInizioRicercaAntenna = Date.now();
            }

            if (localitaEl) {
                localitaEl.innerHTML = `<span style="color:#facc15;font-weight:bold;"><i class="fas fa-satellite-dish fa-spin"></i> GPS: Ricerca antenna</span>`;
            }

            // Se passano 20 minuti, apre la ricerca manuale
            if (Date.now() - tempoInizioRicercaAntenna > 1200000 && !ricercaManualeSuggerita) {
                ricercaManualeSuggerita = true;
                toggleSearch(); 
            }
            
            applyGPSData(); // Mostra i dati memorizzati
        } 
        
        // --- 3. FASE FIX OTTENUTO (Segnale valido) ---
        else {
            tempoInizioRicercaAntenna = null; 
            ricercaManualeSuggerita = false;

            // Reset: chiude la lentina e cancella indirizzo manuale temporaneo
            localStorage.removeItem('ultimaPosizione'); 
            chiudiSearchSeAperta(); 

            const lat = parseFloat(data.lat);
            const lon = parseFloat(data.lon);

            // AGGIORNAMENTO COORDINATE DECIMALI (Sostituisce i trattini -- )
            if (gpsRawEl) {
                gpsRawEl.innerText = `LAT: ${lat.toFixed(5)} | LON: ${lon.toFixed(5)}`;
            }

            // Aggiorna indirizzo e DMS solo se la posizione è cambiata
            if (lat !== ultimaLat || lon !== ultimaLon) {
                const indirizzo = await ottieniIndirizzoTestuale(lat, lon);
                
                if (localitaEl) localitaEl.innerHTML = `<span style="color:#4ade80;font-weight:bold;">📍 ${indirizzo}</span>`;
                if (gpsCoordEl) gpsCoordEl.innerHTML = convertiInDMS(lat, lon);
                
                // Salva come ultima posizione valida automatica
                localStorage.setItem('ultimaPosizioneValida', JSON.stringify({
                    lat: lat, lon: lon, localita: indirizzo
                }));
                
                ultimaLat = lat; 
                ultimaLon = lon;
            }
        }

    } catch (err) {
        // --- 4. FASE ERRORE (ESP spento o offline) ---
        const millisecondiDallAvvio = Date.now() - tempoInizioDashboard;
        if (millisecondiDallAvvio > 6000) {
            if (!tempoInizioRicercaAntenna) tempoInizioRicercaAntenna = Date.now();
            
            if (localitaEl) {
                localitaEl.innerHTML = `<span style="color:#ef4444;font-weight:bold;"><i class="fas fa-plug"></i> GPS: Modulo Offline</span>`;
            }

            applyGPSData();

            if (Date.now() - tempoInizioRicercaAntenna > 1200000 && !ricercaManualeSuggerita) {
                ricercaManualeSuggerita = true;
                toggleSearch(); 
            }
        }
    }
}

setInterval(aggiornaPosizioneGPS, 10000);

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Facciamo partire il cronometro immediatamente
    tempoInizioDashboard = Date.now(); 
    
    initCharts();
    caricaPreferenzeUtente();
    
    // 2. Placeholder immediato per evitare di vedere "Cannara" o campi vuoti
    if (q('localitaNome')) q('localitaNome').innerHTML = `<i class="fas fa-spinner fa-spin"></i> Caricamento...`;

    // 3. Eseguiamo il primo controllo GPS (entrerà nella FASE 1 dei 6 secondi)
    await aggiornaPosizioneGPS(); 
    
    // 4. Carichiamo i dati dai sensori cloud
    await fetchSensorData();
    
    // 5. Impostiamo i timer di aggiornamento
    // Controllo GPS ogni 2 secondi per gestire i cambi di stato (Avvio -> Ricerca -> Fix)
    setInterval(aggiornaPosizioneGPS, 2000);
    
    // Aggiornamento dati ThingSpeak ogni 15 secondi (o quanto impostato)
    setInterval(fetchSensorData, getSavedInterval());
});

// --- le righe successive del tuo file ---
function closeModal() { q('chartModal').style.display = 'none'; }
function toggleMenu() { q('sideMenu').classList.toggle('active'); }
function avviaStampa(campo) { if (q('sideMenu')) q('sideMenu').classList.remove('active'); openModal(campo); } 