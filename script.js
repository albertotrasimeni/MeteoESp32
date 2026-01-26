const q = id => document.getElementById(id);
let miniCharts = {};
let bigChart = null;
let lastChartUpdate = 0;
let isManualLocation = false;
let tempoInizioRicercaAntenna = null; 
let ricercaManualeSuggerita = false;  
let tempoInizioDashboard = Date.now();
let ultimaLat = 0;
let ultimaLon = 0;

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

// --- LOGICA GPS ---

function convertiInDMS(lat, lon) {
    const toDMS = (v) => {
        const d = Math.floor(Math.abs(v));
        const m = Math.floor((Math.abs(v) - d) * 60);
        const s = ((Math.abs(v) - d - (m / 60)) * 3600).toFixed(1);
        return `${d}° ${m}′ ${s}″`;
    };
    return `${toDMS(lat)} ${lat >= 0 ? 'N' : 'S'}<br>${toDMS(lon)} ${lon >= 0 ? 'E' : 'W'}`;
}

function applyGPSData() {
    const manuale = localStorage.getItem('ultimaPosizione');
    const automatico = localStorage.getItem('ultimaPosizioneValida');
    const datiSalvati = manuale || automatico;
    if (datiSalvati) {
        try {
            const pos = JSON.parse(datiSalvati);
            if (pos && pos.lat) {
                if (q('localitaNome')) q('localitaNome').innerText = pos.nome || pos.localita || "Posizione salvata";
                if (q('gpsRaw')) q('gpsRaw').innerText = `LAT: ${parseFloat(pos.lat).toFixed(5)} | LON: ${parseFloat(pos.lon).toFixed(5)}`;
                if (q('gpsCoordinate')) q('gpsCoordinate').innerHTML = convertiInDMS(pos.lat, pos.lon);
            }
        } catch (e) { console.error("Errore cache GPS:", e); }
    }
}

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

async function cercaIndirizzo() {
    const input = q('addressInput');
    if (!input || input.value.trim().length < 3) return;
    try {
        const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(input.value)}&maxLocations=1&sourceCountry=ITA`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.candidates && data.candidates.length > 0) {
            const p = data.candidates[0];
            const nuovaPosizione = { nome: p.address, lat: p.location.y, lon: p.location.x };
            localStorage.setItem('ultimaPosizione', JSON.stringify(nuovaPosizione));
            applyGPSData(); toggleSearch(); input.value = "";
        } else { alert("Indirizzo non trovato."); }
    } catch (error) { console.error("Errore ricerca:", error); }
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
    const titoloModale = document.getElementById('modalTitle').innerText;
    // Puliamo il titolo: togliamo "Storico: " per avere solo il nome del sensore
    const nomeSensore = titoloModale.replace('Storico: ', '').toUpperCase();
    
    const chartProprio = Chart.getChart("bigChartCanvas");

    // 1. SET COLORI NERI (PER IL PDF)
    const colorOriginale = chartProprio.options.scales.x.ticks.color;
    const gridOriginale = chartProprio.options.scales.x.grid.color;

    chartProprio.options.scales.x.ticks.color = 'black';
    chartProprio.options.scales.y.ticks.color = 'black';
    chartProprio.options.scales.x.grid.color = 'rgba(0,0,0,0.1)';
    chartProprio.options.scales.y.grid.color = 'rgba(0,0,0,0.1)';
    chartProprio.update('none');

    const imgData = chartProprio.canvas.toDataURL('image/png');

    // RIPRISTINO DASHBOARD
    chartProprio.options.scales.x.ticks.color = colorOriginale;
    chartProprio.options.scales.y.ticks.color = colorOriginale;
    chartProprio.options.scales.x.grid.color = gridOriginale;
    chartProprio.options.scales.y.grid.color = gridOriginale;
    chartProprio.update('none');

    // 2. IFRAME NASCOSTO
    let iframe = document.getElementById('printFrame');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'printFrame';
        iframe.style.position = 'fixed';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow.document;

    doc.open();
    doc.write(`
        <html>
            <head>
                <style>
                    @page { size: A4 landscape; margin: 10mm; }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background: white; color: black; }
                    .header { 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center; 
                        border-bottom: 2px solid #38bdf8; 
                        padding-bottom: 10px;
                        margin-bottom: 20px;
                    }
                    .header h1 { margin: 0; font-size: 22pt; letter-spacing: 1px; }
                    .header h2 { margin: 0; font-size: 16pt; color: #333; }
                    .chart-box { text-align: center; width: 100%; }
                    img { width: 100%; height: auto; max-height: 155mm; object-fit: contain; }
                    .footer { 
                        position: fixed; bottom: 0; width: 100%;
                        border-top: 1px solid #eee; padding-top: 5px;
                        font-size: 10pt; color: #666; display: flex; justify-content: space-between;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>REPORT MONITORAGGIO</h1>
                    <h2>SENSORE: ${nomeSensore}</h2>
                </div>
                <div class="chart-box">
                    <img src="${imgData}">
                </div>
                <div class="footer">
                    <span>Generato il: ${new Date().toLocaleString()}</span>
                    <span>Stazione Meteo ESP32 - Dashboard IoT</span>
                </div>
            </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 600);
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

async function aggiornaPosizioneGPS() {
    const urlGPS = "https://api.thingspeak.com/channels/3236443/feeds/last.json?api_key=PFSWSJSXRCV4C3I3";
    
    try {
        const response = await fetch(urlGPS);
        const data = await response.json();
        
        if (data.field1 && data.field2) {
            const lat = parseFloat(data.field1);
            const lon = parseFloat(data.field2);
            // RECUPERO ALTITUDINE dal field3 (novità)
            const alt = data.field3 ? parseFloat(data.field3).toFixed(1) : "--";

            // CONTROLLO FIX: Se le coordinate sono 0, ferma tutto qui
            if (lat === 0 && lon === 0) {
                if (q('localitaNome')) q('localitaNome').innerHTML = "ATTESA SEGNALE GPS...";
                if (q('gpsCoordinate')) q('gpsCoordinate').innerHTML = "RICERCA SATELLITI...";
                if (q('gpsRaw')) q('gpsRaw').innerHTML = "NO FIX";
                return; 
            }

            // SE IL FIX C'È, RECUPERA L'INDIRIZZO
            const urlReverse = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&location=${lon},${lat}`;
            const resAddr = await fetch(urlReverse);
            const dataAddr = await resAddr.json();
            
            if (dataAddr && dataAddr.address) {
                const indirizzo = dataAddr.address.Match_addr;
                if (q('localitaNome')) q('localitaNome').innerHTML = indirizzo.toUpperCase();
            }

            if (q('gpsCoordinate')) {
                q('gpsCoordinate').innerHTML = convertiInDMS(lat, lon);
            }

            // COORDINATE RAW IN FONDO + ALTITUDINE (Integrata qui per non sformattare)
            if (q('gpsRaw')) {
                q('gpsRaw').innerHTML = `LAT: ${lat.toFixed(6)} | LON: ${lon.toFixed(6)} | ALT: <span style="color: #00ff88;">${alt} m</span>`;
            }

            // Salva la posizione buona in memoria (inclusa altitudine se vuoi)
            localStorage.setItem('ultimaPosizioneValida', JSON.stringify({lat, lon, alt}));
        }
    } catch (err) { 
        console.log("Errore aggiornamento GPS"); 
    }
}

function aggiornaOrologio() {
    const oraAttuale = new Date();
    
    // Prende ore, minuti e secondi
    const ore = String(oraAttuale.getHours()).padStart(2, '0');
    const minuti = String(oraAttuale.getMinutes()).padStart(2, '0');
    const secondi = String(oraAttuale.getSeconds()).padStart(2, '0');
    
    // Cerca l'elemento con ID 'clock' o 'orologio'
    // Se nel tuo HTML l'id è diverso, cambialo qui sotto
    const displayOrologio = document.getElementById('orologio') || document.getElementById('clock');
    
    if (displayOrologio) {
        displayOrologio.innerHTML = `${ore}:${minuti}:${secondi}`;
    }
}

// Avvia l'orologio ogni secondo
setInterval(aggiornaOrologio, 1000);

// Eseguila subito all'avvio
aggiornaOrologio();

document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    caricaPreferenzeUtente();
    applyGPSData(); 
    await fetchSensorData();
    await aggiornaPosizioneGPS(); 
    setInterval(fetchSensorData, getSavedInterval());
    setInterval(aggiornaPosizioneGPS, 20000); // Aggiorna GPS ogni 20 secondi
});

function closeModal() { q('chartModal').style.display = 'none'; }
function toggleMenu() { q('sideMenu').classList.toggle('active'); }
function avviaStampa(campo) { if (q('sideMenu')) q('sideMenu').classList.remove('active'); openModal(campo); }