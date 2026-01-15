const q = id => document.getElementById(id);
let miniCharts = {};
let bigChart = null;
let lastChartUpdate = 0;
let coordsAttuali = "";

// Legge l'intervallo da settings.html
function getSavedInterval() {
    const saved = localStorage.getItem('updateInterval');
    return saved ? parseInt(saved) : 15000;
}

// CONFIGURAZIONE SENSORI
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

// --- LOGICA COLORI E TESTI QUALITÀ ARIA ---
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
        if (val <= 7) return { c: '#f97316', t: 'ALTO' }; // Arancione
        return { c: '#ef4444', t: 'ESTREMO' };
    }

    if (tipo === 'wind') {
        if (val <= 19) return { c: '#10b981', t: 'BREZZA' };
        if (val <= 38) return { c: '#f59e0b', t: 'MODERATO' };
        return { c: '#ef4444', t: 'FORTE' };
    }

    return { c: '#10b981', t: '--' };
}

// --- FUNZIONE AGGIORNATA PER LED E TESTI DINAMICI ---
function updateStatusLEDs(status, data = null) {
    // 1. LED BASE (Semplice Online/Offline)
    const basicLeds = { 'led-temp': 'online', 'led-hum': 'online', 'led-press': 'online' };

    Object.keys(basicLeds).forEach(id => {
        const el = q(id);
        if (el) el.className = 'led ' + (status === 'online' ? 'led-online' : 'led-offline');
    });

    // 2. LED DINAMICI (Cambiata qui: aggiunti 'uv' e 'wind')
    const smartSensors = ['iaq', 'co2', 'pm25', 'uv', 'wind'];

    if (status === 'online' && data) {
        smartSensors.forEach(s => {
            const elLed = q('led-' + s);
            const elLabel = q('label-' + s);

            // Assicurati che data[s] esista prima di calcolare
            const val = data[s] !== undefined ? parseFloat(data[s]) : 0;
            const info = getAQIInfo(s, val);

            if (elLed) {
                elLed.style.backgroundColor = info.c;
                elLed.style.boxShadow = `0 0 8px ${info.c}`;
            }
            if (elLabel) {
                elLabel.innerText = info.t;
                elLabel.style.color = info.c;
            }
        });
    } else if (status === 'offline') {
        smartSensors.forEach(s => {
            const elLed = q('led-' + s);
            const elLabel = q('label-' + s);
            if (elLed) {
                elLed.style.backgroundColor = '#64748b';
                elLed.style.boxShadow = '';
            }
            if (elLabel) {
                elLabel.innerText = '--';
                elLabel.style.color = '#64748b';
            }
        });
    }
}
// --- GAUGE OTTIMIZZATO PER GRIGLIA 3x3 ---
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

// --- MODALE ---
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
                label: cfg.id,
                data: miniCharts[sensor].data.datasets[0].data,
                borderColor: cfg.c,
                backgroundColor: cfg.c + '33',
                fill: true, tension: 0.3, pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#ffffff' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#ffffff' },
                    grid: {
                        color: 'rgba(148,163,184,0.35)'
                    }
                },
                y: {
                    ticks: { color: '#ffffff' },
                    grid: {
                        color: 'rgba(148,163,184,0.35)'
                    }
                }
            }

        }

    });
}

// --- LOGICA DI STAMPA ---
function avviaStampa(campo) {
    if (q('sideMenu')) q('sideMenu').classList.remove('active');
    openModal(campo);
}

function eseguiStampaEffettiva() {
    if (!bigChart) return;
    bigChart.options.scales.x.ticks.color = '#000000';
    bigChart.options.scales.y.ticks.color = '#000000';
    bigChart.options.plugins.legend.labels.color = '#000000';
    bigChart.update('none');
    setTimeout(() => {
        const imgData = bigChart.toBase64Image();
        let pImg = q('printImg');
        if (!pImg) {
            pImg = document.createElement('img');
            pImg.id = 'printImg';
            document.querySelector('#chartModal .modal-content').appendChild(pImg);
        }
        pImg.src = imgData;
        pImg.style.display = 'block';
        q('bigChartCanvas').style.visibility = 'hidden';
        if (q('modalCoords')) { q('modalCoords').innerText = coordsAttuali; q('modalCoords').style.color = 'black'; }
        window.print();
        setTimeout(() => {
            if (pImg) pImg.style.display = 'none';
            q('bigChartCanvas').style.visibility = 'visible';
            bigChart.options.scales.x.ticks.color = '#ffffff';
            bigChart.options.scales.y.ticks.color = '#ffffff';
            bigChart.options.plugins.legend.labels.color = '#ffffff';
            bigChart.update('none');
            if (q('modalCoords')) q('modalCoords').style.color = 'white';
        }, 500);
    }, 250);
}

// --- FETCH E DATI (THINGSPEAK) ---
async function fetchSensorData() {
    const wifiLed = q('wifi-led');
    try {
        const response = await fetch('https://api.thingspeak.com/channels/3221413/feeds/last.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const tsData = await response.json();

        const data = {
            temp: tsData.field1, hum: tsData.field2, press_mb: tsData.field3,
            iaq: tsData.field4, co2: tsData.field5, pm25: tsData.field6,
            uv: tsData.field7, wind: tsData.field8,
            lat: "43.0125", lon: "12.5852", localita: "Cannara (PG)",
            ora: new Date().toLocaleTimeString('it-IT'),
            data: new Date(tsData.created_at).toLocaleDateString('it-IT')
        };

        // 1. STATO CONNESSIONE E LED/TESTI (Sempre immediati)
        if (wifiLed) wifiLed.className = 'led led-online';
        updateStatusLEDs('online', data);

        coordsAttuali = `LAT: ${data.lat} | LON: ${data.lon}`;
        if (q('clock')) q('clock').innerText = data.ora;
        if (q('date')) q('date').innerText = data.data;
        if (q('localitaNome')) q('localitaNome').innerText = data.localita;
        if (q('gpsRaw')) q('gpsRaw').innerText = `LAT: ${data.lat} | LON: ${data.lon}`;
        if (q('gpsCoordinate')) q('gpsCoordinate').innerHTML = `${data.lat} N<br>${data.lon} E`;

        const oraAttuale = Date.now();
        const intervallo = getSavedInterval();
        let deveAggiornare = false;
        if (oraAttuale - lastChartUpdate >= intervallo) { deveAggiornare = true; lastChartUpdate = oraAttuale; }

        Object.keys(sensorCfg).forEach(key => {
            const val = parseFloat(data[key]);
            if (isNaN(val)) return;
            const cfg = sensorCfg[key];

            // 2. AGGIORNAMENTO VALORI NUMERICI (Sempre, per essere sincronizzati con i LED)
            if (q(cfg.targetId)) {
                let valoreDisplay = (key === 'press_mb') ? val.toFixed(0) : val.toFixed(1);
                q(cfg.targetId).innerText = valoreDisplay + (cfg.u ? ' ' + cfg.u : '');
            }

            // 3. AGGIORNAMENTO GRAFICI E GAUGE (Solo ogni "intervallo" per non appesantire)
            if (deveAggiornare) {
                updateMiniChart(key, val);
                if (key === 'temp' || key === 'hum' || key === 'press_mb') {
                    drawGauge('gauge' + cfg.id, val, cfg);
                }
            }

            // Icona IAQ laterale
            if (key === 'iaq' && q('iaqIcon')) {
                let info = getAQIInfo('iaq', val);
                q('iaqIcon').style.setProperty('color', info.c, 'important');
            }
        });
    } catch (e) {
        console.error("Errore Fetch:", e);
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

async function esportaCSV() {
    try {
        // Legge il tempo impostato sulla dashboard (da 15000ms a 14400000ms)
        const intervalloMs = getSavedInterval(); 
        
        let risultati = 500; 
        let timescale = "";   
        
        // --- 1. CONFIGURAZIONE DINAMICA (Tabella Documentazione) ---
        if (intervalloMs <= 15000) {        
            risultati = 480; // 15 sec -> Ultime 2 ore
        } else if (intervalloMs <= 30000) { 
            risultati = 480; // 30 sec -> Ultime 4 ore
        } else if (intervalloMs <= 60000) { 
            risultati = 720; timescale = "&timescale=1"; // 1 min -> Ultime 12 ore
        } else if (intervalloMs <= 300000) { 
            risultati = 288; timescale = "&timescale=5"; // 5 min -> Ultime 24 ore
        } else if (intervalloMs <= 600000) { 
            risultati = 288; timescale = "&timescale=10"; // 10 min -> Ultime 48 ore
        } else if (intervalloMs <= 1800000) { 
            risultati = 336; timescale = "&timescale=30"; // 30 min -> 7 giorni
        } else if (intervalloMs <= 3600000) { 
            risultati = 360; timescale = "&timescale=60"; // 1 ora -> 15 giorni
        } else if (intervalloMs <= 7200000) { 
            risultati = 360; timescale = "&timescale=120"; // 2 ore -> 1 mese
        } else {                             
            risultati = 540; timescale = "&timescale=240"; // 4 ore -> 3 mesi
        }

        const channelID = "3221413";
        const url = `https://api.thingspeak.com/channels/${channelID}/feeds.json?results=${risultati}${timescale}`;

        const response = await fetch(url);
        const dataJson = await response.json();
        const feeds = dataJson.feeds;

        if (!feeds || feeds.length === 0) {
            alert("Nessun dato trovato per l'intervallo selezionato.");
            return;
        }

        const sensoriPresenti = Object.keys(sensorCfg);
        let csvContent = "GIORNO;MESE;ANNO;ORA;" + sensoriPresenti.map(key => sensorCfg[key].id.toUpperCase()).join(";") + "\n";

        // --- 2. FILTRO DI SINCRONIZZAZIONE ---
        // Questa parte assicura che venga scritta solo 1 riga ogni 'intervalloMs'
        let ultimoTimestampSalvato = 0;

        feeds.forEach(f => {
            const dataCorrente = new Date(f.created_at);
            const timestampCorrente = dataCorrente.getTime();

            // Calcoliamo la differenza di tempo dall'ultima riga inserita
            // Usiamo un margine di tolleranza di 2 secondi (2000ms) per piccoli ritardi di rete
            if (timestampCorrente - ultimoTimestampSalvato < (intervalloMs - 2000)) {
                return; // Salta questa riga: è un doppione o un invio troppo ravvicinato
            }

            ultimoTimestampSalvato = timestampCorrente;

            const giorno = String(dataCorrente.getDate()).padStart(2, '0');
            const mese = String(dataCorrente.getMonth() + 1).padStart(2, '0');
            const anno = dataCorrente.getFullYear();
            const ora = dataCorrente.getHours().toString().padStart(2, '0') + ":" + 
                        dataCorrente.getMinutes().toString().padStart(2, '0') + ":" + 
                        dataCorrente.getSeconds().toString().padStart(2, '0');

            let riga = [giorno, mese, anno, ora];
            const fields = [f.field1, f.field2, f.field3, f.field4, f.field5, f.field6, f.field7, f.field8];
            
            fields.forEach(val => {
                let valFmt = (val !== undefined && val !== null) ? val.toString().replace('.', ',') : "";
                riga.push(valFmt);
            });
            
            csvContent += riga.join(";") + "\n";
        });

        // --- 3. DOWNLOAD DEL FILE ---
        const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Report_Meteo_Sincro.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Errore esportazione:", err);
        alert("Si è verificato un errore durante il download del CSV.");
    }
}

function initCharts() {
    Object.keys(sensorCfg).forEach(k => {
        const canvas = q('mini' + sensorCfg[k].id); if (!canvas) return;
        miniCharts[k] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: sensorCfg[k].c,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        display: true,
                        ticks: {
                            color: '#ffffff',
                            font: { size: 8 }
                        },
                        grid: {
                            color: 'rgba(148,163,184,0.45)'
                        }
                    },
                    y: {
                        display: true,
                        ticks: {
                            color: '#ffffff',
                            font: { size: 8 }
                        },
                        grid: {
                            color: 'rgba(148,163,184,0.45)'
                        }
                    }
                }
            }
        });

    });
}

function caricaPreferenzeUtente() {
    const sensori = ['temp', 'hum', 'press_mb', 'iaq', 'co2', 'pm25', 'uv', 'wind', 'gps'];
    sensori.forEach(s => {
        let stato = localStorage.getItem('show_' + s);
        const div = document.getElementById('block-' + s);
        if (div && stato !== null) div.style.setProperty('display', (stato === 'false' ? 'none' : 'flex'), 'important');
    });
}

window.addEventListener('resize', () => {
    Object.keys(sensorCfg).forEach(key => {
        const cfg = sensorCfg[key];
        const valTxt = q(cfg.targetId)?.innerText;
        if (valTxt && (key === 'temp' || key === 'hum' || key === 'press_mb')) {
            drawGauge('gauge' + cfg.id, parseFloat(valTxt), cfg);
        }
    });
});

document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    caricaPreferenzeUtente();
    await fetchSensorData();
    setInterval(async () => { await fetchSensorData(); }, 1000);
});

function closeModal() { q('chartModal').style.display = 'none'; }
function toggleMenu() { q('sideMenu').classList.toggle('active'); }