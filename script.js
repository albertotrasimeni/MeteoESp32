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

// --- GAUGE OTTIMIZZATO PER GRIGLIA 3x3 (Smartphone/Tablet) ---
function drawGauge(canvasId, val, cfg) {
    const canvas = q(canvasId); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Rilevamento dinamico dimensioni contenitore per non rompere la griglia
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
    
    // Raggio proporzionale alla larghezza del blocco
    const r = Math.min(w, h) * 0.48; 

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; 
    
    // Font adattivo per blocchi piccoli
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
        
        // Disegna i numeri solo se c'è spazio sufficiente nel blocco
        if (w > 100) {
            const txtR = r + 16;
            ctx.fillText(v.toFixed(0), cx + Math.cos(angle) * txtR, cy + Math.sin(angle) * txtR);
        }
    }

    // Arco base
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.strokeStyle = '#2d3748'; ctx.lineWidth = w < 130 ? 10 : 16; ctx.stroke();
    
    // Arco valore (Progress)
    const p = (Math.min(Math.max(val, cfg.min), cfg.max) - cfg.min) / (cfg.max - cfg.min);
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + (Math.PI * p));
    ctx.strokeStyle = cfg.c; ctx.lineWidth = w < 130 ? 10 : 16; ctx.stroke();
    
    // Lancetta
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
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#ffffff' } } },
            scales: {
                x: { ticks: { color: '#ffffff' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { ticks: { color: '#ffffff' }, grid: { color: 'rgba(255,255,255,0.1)' } }
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

        if (q('modalCoords')) {
            q('modalCoords').innerText = coordsAttuali;
            q('modalCoords').style.color = 'black';
        }

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

        if (wifiLed) wifiLed.className = 'led led-online';

        const data = {
            temp: tsData.field1,
            hum: tsData.field2,
            press_mb: tsData.field3,
            iaq: tsData.field4,
            co2: tsData.field5,
            pm25: tsData.field6,
            uv: tsData.field7,
            wind: tsData.field8,
            lat: "43.0125", 
            lon: "12.5852",
            localita: "Cannara (PG)",
            ora: new Date().toLocaleTimeString('it-IT'),
            data: new Date(tsData.created_at).toLocaleDateString('it-IT')
        };

        coordsAttuali = `LAT: ${data.lat} | LON: ${data.lon}`;

        if (q('clock')) q('clock').innerText = data.ora;
        if (q('date')) q('date').innerText = data.data;
        if (q('localitaNome')) q('localitaNome').innerText = data.localita;
        if (q('gpsRaw')) q('gpsRaw').innerText = `LAT: ${data.lat} | LON: ${data.lon}`;
        if (q('gpsCoordinate')) q('gpsCoordinate').innerHTML = `${data.lat} N<br>${data.lon} E`;

        const oraAttuale = Date.now();
        const intervallo = getSavedInterval();

        let deveAggiornare = false;
        if (oraAttuale - lastChartUpdate >= intervallo) {
            deveAggiornare = true;
            lastChartUpdate = oraAttuale;
        }

        Object.keys(sensorCfg).forEach(key => {
            const val = parseFloat(data[key]);
            if (isNaN(val)) return;
            const cfg = sensorCfg[key];
            if (deveAggiornare) {
                if (q(cfg.targetId)) {
                    let valoreDisplay = (key === 'press_mb') ? val.toFixed(0) : val.toFixed(1);
                    q(cfg.targetId).innerText = valoreDisplay + (cfg.u ? ' ' + cfg.u : '');
                }
                updateMiniChart(key, val);
                if (key === 'temp' || key === 'hum' || key === 'press_mb') {
                    drawGauge('gauge' + cfg.id, val, cfg);
                }
            }
            if (key === 'iaq' && q('iaqIcon')) {
                let col = val <= 50 ? '#10b981' : (val <= 100 ? '#f59e0b' : '#ef4444');
                q('iaqIcon').style.setProperty('color', col, 'important');
            }
        });
    } catch (e) { 
        console.error("Errore Fetch:", e); 
        if (wifiLed) wifiLed.className = 'led led-offline';
    }
}

function updateMiniChart(key, val) {
    const chart = miniCharts[key]; if (!chart) return;
    const timeLabel = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (chart.data.labels.length > 20) { chart.data.labels.shift(); chart.data.datasets[0].data.shift(); }
    chart.data.labels.push(timeLabel); chart.data.datasets[0].data.push(val);
    chart.update('none');
}

function esportaCSV() {
    const righeDati = {};
    const sensoriPresenti = Object.keys(miniCharts);
    sensoriPresenti.forEach(key => {
        const chart = miniCharts[key];
        chart.data.labels.forEach((label, index) => {
            if (!righeDati[label]) righeDati[label] = {};
            righeDati[label][key] = chart.data.datasets[0].data[index];
        });
    });
    let csvContent = "sep=,\nOra," + sensoriPresenti.map(key => sensorCfg[key].id).join(",") + "\n";
    Object.keys(righeDati).forEach(ora => {
        let riga = [ora];
        sensoriPresenti.forEach(key => {
            riga.push(righeDati[ora][key] || "");
        });
        csvContent += riga.join(",") + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Meteo_${new Date().toLocaleDateString('it-IT')}.csv`;
    link.click();
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
                    x: { display: true, ticks: { color: '#ffffff', font: { size: 8 } } },
                    y: { display: true, ticks: { color: '#ffffff', font: { size: 8 } } }
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

// Fix per ridisegnare i gauge al cambio di orientamento dello smartphone
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