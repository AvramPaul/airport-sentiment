// ── Configuration ─────────────────────────────────────────────
const API_BASE        = "http://localhost:8000";
const LIVE_INTERVAL   = 5000;   // ms
const CHART_INTERVAL  = 60000;  // ms
const FRAME_INTERVAL  = 2000;   // ms

const CAMERA_IDS = ["CAM_01", "CAM_02", "CAM_03", "CAM_04"];

const PAGE_TITLES = {
  dashboard: "Dashboard",
  cameras:   "Camere Live",
  notify:    "Notificări Personal",
  checkin:   "Check-In",
  security:  "Security",
  lounge:    "Lounge",
  gate:      "Departure Gate",
};

// ── State ──────────────────────────────────────────────────────
let historyChart = null;
let liveData     = {};

// ── Helpers ────────────────────────────────────────────────────
function dominant(cam) {
  const m = Math.max(cam.happy, cam.neutral, cam.sad);
  if (m === cam.happy)   return "happy";
  if (m === cam.neutral) return "neutral";
  return "sad";
}

function satisfactionColor(cam) {
  const score = cam.happy - cam.sad;
  if (score > 20)  return "#22c55e";
  if (score > -20) return "#f59e0b";
  return "#ef4444";
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("ro-RO", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function isDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function chartColors() {
  return {
    grid:   isDark() ? "#1e2535" : "#e2e8f0",
    tick:   isDark() ? "#6b7fa3" : "#64748b",
    legend: isDark() ? "#c9d1d9" : "#1e293b",
  };
}

// ── Theme toggle ───────────────────────────────────────────────
function toggleTheme() {
  const next = isDark() ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  syncThemeIcon();
  if (historyChart) fetchHistory();   // re-render with new palette
  const activeZone = ZONE_PAGES.find(p =>
    document.getElementById(`page-${p}`).style.display !== "none"
  );
  if (activeZone) fetchZoneHistory(activeZone);
}

function syncThemeIcon() {
  const dark = isDark();
  document.getElementById("themeIconMoon").style.display = dark ? "none" : "";
  document.getElementById("themeIconSun").style.display  = dark ? ""     : "none";
}

// ── Live Cards ─────────────────────────────────────────────────
const DOM_LABEL = { happy: "😊 Happy",  neutral: "😐 Neutral",  sad: "😠 Stressed" };
const DOM_COLOR = { happy: "#22c55e",     neutral: "#f59e0b",    sad: "#ef4444"    };

function renderCards(cameras) {
  const grid = document.getElementById("liveGrid");

  cameras.forEach(cam => {
    let card = document.getElementById(`card-${cam.camera_id}`);
    if (!card) {
      card = document.createElement("div");
      card.className = "cam-card";
      card.id = `card-${cam.camera_id}`;
      grid.appendChild(card);
    }

    const dom = dominant(cam);
    const badgeBg  = DOM_COLOR[dom] + "20";
    const badgeClr = DOM_COLOR[dom];

    card.className = `cam-card dominant-${dom}`;
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">${cam.camera_name}</div>
          <div class="card-id">${cam.camera_id}</div>
        </div>
        <div>
          <span class="emotion-badge" style="background:${badgeBg};color:${badgeClr};border:1px solid ${badgeClr}40">
            ${DOM_LABEL[dom]}
          </span>
          <div class="card-persons" style="margin-top:6px">
            <span>${cam.total_persons}</span>persoane
          </div>
        </div>
      </div>

      <div class="emotion-row">
        <div class="emotion-label"><span>😊 Happy</span><strong>${cam.happy}%</strong></div>
        <div class="bar-track"><div class="bar-fill bar-happy" style="width:${cam.happy}%"></div></div>
      </div>
      <div class="emotion-row">
        <div class="emotion-label"><span>😐 Neutral</span><strong>${cam.neutral}%</strong></div>
        <div class="bar-track"><div class="bar-fill bar-neutral" style="width:${cam.neutral}%"></div></div>
      </div>
      <div class="emotion-row">
        <div class="emotion-label"><span>😠 Stressed</span><strong>${cam.sad}%</strong></div>
        <div class="bar-track"><div class="bar-fill bar-sad" style="width:${cam.sad}%"></div></div>
      </div>

      <div class="card-footer">Actualizat: ${cam.updated_at ? formatTime(cam.updated_at) : "—"}</div>
    `;
  });
}

// ── Heatmap ────────────────────────────────────────────────────
function updateHeatmap(cameras) {
  cameras.forEach(cam => {
    const circle = document.getElementById(`circle-${cam.camera_id}`);
    const label  = document.getElementById(`label-${cam.camera_id}`);
    if (!circle || !label) return;

    const color = satisfactionColor(cam);
    circle.setAttribute("fill", color);
    circle.style.filter = `drop-shadow(0 0 8px ${color})`;
    label.textContent   = `${cam.happy}% 😊`;

    const marker  = document.getElementById(`marker-${cam.camera_id}`);
    const tooltip = document.getElementById("tooltip");
    if (marker) {
      marker.onmouseenter = () => {
        tooltip.innerHTML = `
          <strong>${cam.camera_name}</strong><br>
          😊 Happy: ${cam.happy}%<br>
          😐 Neutral: ${cam.neutral}%<br>
          😠 Stressed: ${cam.sad}%<br>
          👥 ${cam.total_persons} persoane
        `;
        tooltip.classList.add("visible");
      };
      marker.onmouseleave = () => tooltip.classList.remove("visible");
      marker.onmousemove  = (e) => {
        const rect = document.querySelector(".heatmap-container").getBoundingClientRect();
        tooltip.style.left = (e.clientX - rect.left + 14) + "px";
        tooltip.style.top  = (e.clientY - rect.top  + 14) + "px";
      };
    }
  });
}

// ── Live Polling ───────────────────────────────────────────────
async function fetchLive() {
  try {
    const res  = await fetch(`${API_BASE}/api/live`);
    const data = await res.json();
    liveData   = {};
    data.forEach(c => liveData[c.camera_id] = c);

    renderCards(data);
    updateHeatmap(data);

    document.getElementById("connectionDot").className    = "status-dot online";
    document.getElementById("connectionLabel").textContent = "Online";
    document.getElementById("lastUpdate").textContent     =
      `Ultima actualizare: ${new Date().toLocaleTimeString("ro-RO")}`;
  } catch {
    document.getElementById("connectionDot").className    = "status-dot offline";
    document.getElementById("connectionLabel").textContent = "Offline";
  }
}

// ── History Chart ──────────────────────────────────────────────
async function fetchHistory() {
  const camId = document.getElementById("camSelect").value;
  const hours = document.getElementById("rangeSelect").value;
  let url = `${API_BASE}/api/history?hours=${hours}`;
  if (camId) url += `&camera_id=${camId}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    renderChart(data, camId);
  } catch { /* silent */ }
}

function renderChart(data, camId) {
  let labels, happySet, neutralSet, sadSet;
  const c = chartColors();

  if (!camId) {
    const grouped = {};
    data.forEach(d => {
      if (!grouped[d.recorded_at]) grouped[d.recorded_at] = [];
      grouped[d.recorded_at].push(d);
    });
    const times = Object.keys(grouped).sort();
    labels     = times.map(t => formatTime(t));
    happySet   = times.map(t => avg(grouped[t].map(x => x.happy)));
    neutralSet = times.map(t => avg(grouped[t].map(x => x.neutral)));
    sadSet     = times.map(t => avg(grouped[t].map(x => x.sad)));
  } else {
    labels     = data.map(d => formatTime(d.recorded_at));
    happySet   = data.map(d => d.happy);
    neutralSet = data.map(d => d.neutral);
    sadSet     = data.map(d => d.sad);
  }

  const ctx = document.getElementById("historyChart").getContext("2d");
  if (historyChart) historyChart.destroy();

  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "😊 Happy %",  data: happySet,   borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,.1)",   tension: 0.4, fill: true  },
        { label: "😐 Neutral %",   data: neutralSet, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,.07)", tension: 0.4, fill: false },
        { label: "😠 Stressed %",  data: sadSet,     borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.07)",  tension: 0.4, fill: false },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: c.tick, maxTicksLimit: 12 }, grid: { color: c.grid } },
        y: { min: 0, max: 100,
             ticks: { color: c.tick, callback: v => v + "%" },
             grid:  { color: c.grid } },
      },
      plugins: {
        legend: { labels: { color: c.legend, padding: 20 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } },
      },
    },
  });
}

function avg(arr) {
  return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
}

// ── Camera Feeds ───────────────────────────────────────────────
function refreshFeeds() {
  CAMERA_IDS.forEach(camId => {
    const img      = document.getElementById(`feed-${camId}`);
    const noSignal = document.getElementById(`nosignal-${camId}`);
    if (!img) return;

    const newSrc = `${API_BASE}/api/frame/${camId}?t=${Date.now()}`;
    const tester = new Image();
    tester.onload  = () => { img.src = newSrc; if (noSignal) noSignal.style.display = "none"; };
    tester.onerror = () => { if (noSignal) noSignal.style.display = "flex"; };
    tester.src = newSrc;

    const stats = document.getElementById(`feedstats-${camId}`);
    if (stats && liveData[camId]) {
      const cam = liveData[camId];
      stats.innerHTML = `
        <div class="feed-stat-row">
          <span class="feed-emotion-dot" style="background:var(--happy)"></span>
          <span>Happy</span><strong>${cam.happy}%</strong>
          <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.happy}%;background:var(--happy)"></div></div>
        </div>
        <div class="feed-stat-row">
          <span class="feed-emotion-dot" style="background:var(--neutral)"></span>
          <span>Neutral</span><strong>${cam.neutral}%</strong>
          <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.neutral}%;background:var(--neutral)"></div></div>
        </div>
        <div class="feed-stat-row">
          <span class="feed-emotion-dot" style="background:var(--sad)"></span>
          <span>Stressed</span><strong>${cam.sad}%</strong>
          <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.sad}%;background:var(--sad)"></div></div>
        </div>
        <div class="feed-persons">👥 ${cam.total_persons} persoane detectate</div>
      `;
    }
  });
}

// ── Staff Notifications ────────────────────────────────────────
async function sendNotification() {
  const recipient = document.getElementById("notifyRecipient").value;
  const message   = document.getElementById("notifyMessage").value.trim();
  const btn       = document.getElementById("notifyBtn");
  const status    = document.getElementById("notifyStatus");

  if (!message) {
    status.textContent = "⚠️ Mesajul nu poate fi gol.";
    status.className   = "notify-status error";
    return;
  }

  btn.disabled       = true;
  status.textContent = "Se trimite...";
  status.className   = "notify-status";

  try {
    const res = await fetch(`${API_BASE}/api/notify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ recipient, message }),
    });
    if (res.ok) {
      const label = document.getElementById("notifyRecipient").selectedOptions[0].text;
      status.textContent = `✅ Mesaj trimis către ${label}.`;
      status.className   = "notify-status success";
      document.getElementById("notifyMessage").value = "";
    } else {
      const err = await res.json();
      status.textContent = `❌ Eroare: ${err.detail}`;
      status.className   = "notify-status error";
    }
  } catch {
    status.textContent = "❌ Nu s-a putut contacta serverul.";
    status.className   = "notify-status error";
  } finally {
    btn.disabled = false;
  }
}

// ── Zone Dashboards ────────────────────────────────────────────
const ZONE_CONFIG = {
  checkin:  { camId: "CAM_01", canvasId: "chartCheckin" },
  security: { camId: "CAM_02", canvasId: "chartSecurity" },
  lounge:   { camId: "CAM_03", canvasId: "chartLounge" },
  gate:     { camId: "CAM_04", canvasId: "chartGate" },
};
const ZONE_PAGES = Object.keys(ZONE_CONFIG);

const _zoneCharts = {};
let _zoneFeedInterval = null;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function initZoneStats() {
  document.getElementById("zstat-checkin-active").textContent   = randInt(2, 4);
  document.getElementById("zstat-checkin-staff").textContent    = randInt(3, 9);
  document.getElementById("zstat-checkin-persons").textContent  = randInt(5, 20);
  document.getElementById("zstat-security-active").textContent  = randInt(2, 3);
  document.getElementById("zstat-security-staff").textContent   = randInt(4, 8);
  document.getElementById("zstat-security-persons").textContent = randInt(3, 15);
  document.getElementById("zstat-lounge-staff").textContent     = randInt(2, 5);
  document.getElementById("zstat-lounge-persons").textContent   = randInt(8, 35);
  document.getElementById("zstat-gate-active").textContent      = randInt(1, 3);
  document.getElementById("zstat-gate-staff").textContent       = randInt(2, 6);
  document.getElementById("zstat-gate-persons").textContent     = randInt(10, 50);
}

// ── Lounge climate simulation ───────────────────────────────────
let _loungeTemp     = 22.3;
let _loungeHumidity = 48;

function initLoungeClimate() {
  document.getElementById("zstat-lounge-temp").textContent     = _loungeTemp.toFixed(1) + " °C";
  document.getElementById("zstat-lounge-humidity").textContent = _loungeHumidity + " %";
}

function tickLoungeTemp() {
  // ~40% chance to drift ±0.1, stays within 21.0–23.5 °C
  if (Math.random() < 0.4) {
    const delta = Math.random() < 0.5 ? 0.1 : -0.1;
    _loungeTemp = Math.min(23.5, Math.max(21.0, +(_loungeTemp + delta).toFixed(1)));
    document.getElementById("zstat-lounge-temp").textContent = _loungeTemp.toFixed(1) + " °C";
  }
}

function tickLoungeHumidity() {
  // ~30% chance to drift ±1, stays within 40–60 %
  if (Math.random() < 0.3) {
    const delta = Math.random() < 0.5 ? 1 : -1;
    _loungeHumidity = Math.min(60, Math.max(40, _loungeHumidity + delta));
    document.getElementById("zstat-lounge-humidity").textContent = _loungeHumidity + " %";
  }
}

function updateZoneStatsSlow() {
  document.getElementById("zstat-checkin-active").textContent   = randInt(2, 4);
  document.getElementById("zstat-checkin-staff").textContent    = randInt(3, 9);
  document.getElementById("zstat-security-active").textContent  = randInt(2, 3);
  document.getElementById("zstat-security-staff").textContent   = randInt(4, 8);
  document.getElementById("zstat-lounge-staff").textContent     = randInt(2, 5);
  document.getElementById("zstat-gate-active").textContent      = randInt(1, 3);
  document.getElementById("zstat-gate-staff").textContent       = randInt(2, 6);
}

function updateZoneStatsFast() {
  document.getElementById("zstat-checkin-persons").textContent  = randInt(5, 20);
  document.getElementById("zstat-security-persons").textContent = randInt(3, 15);
  document.getElementById("zstat-lounge-persons").textContent   = randInt(8, 35);
  document.getElementById("zstat-gate-persons").textContent     = randInt(10, 50);
}

function refreshZoneFeed(camId) {
  const img      = document.getElementById(`zfeed-${camId}`);
  const noSignal = document.getElementById(`znosignal-${camId}`);
  if (!img) return;

  const newSrc = `${API_BASE}/api/frame/${camId}?t=${Date.now()}`;
  const tester = new Image();
  tester.onload  = () => { img.src = newSrc; if (noSignal) noSignal.style.display = "none"; };
  tester.onerror = () => { if (noSignal) noSignal.style.display = "flex"; };
  tester.src = newSrc;

  const stats = document.getElementById(`zfeedstats-${camId}`);
  if (stats && liveData[camId]) {
    const cam = liveData[camId];
    stats.innerHTML = `
      <div class="feed-stat-row">
        <span class="feed-emotion-dot" style="background:var(--happy)"></span>
        <span>Happy</span><strong>${cam.happy}%</strong>
        <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.happy}%;background:var(--happy)"></div></div>
      </div>
      <div class="feed-stat-row">
        <span class="feed-emotion-dot" style="background:var(--neutral)"></span>
        <span>Neutral</span><strong>${cam.neutral}%</strong>
        <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.neutral}%;background:var(--neutral)"></div></div>
      </div>
      <div class="feed-stat-row">
        <span class="feed-emotion-dot" style="background:var(--sad)"></span>
        <span>Stressed</span><strong>${cam.sad}%</strong>
        <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.sad}%;background:var(--sad)"></div></div>
      </div>
      <div class="feed-persons">👥 ${cam.total_persons} persoane detectate</div>
    `;
  }
}

async function fetchZoneHistory(zone) {
  const { camId, canvasId } = ZONE_CONFIG[zone];
  try {
    const res  = await fetch(`${API_BASE}/api/history?hours=24&camera_id=${camId}`);
    const data = await res.json();
    renderZoneChart(data, zone, canvasId);
  } catch { /* silent */ }
}

function renderZoneChart(data, zone, canvasId) {
  const labels     = data.map(d => formatTime(d.recorded_at));
  const happySet   = data.map(d => d.happy);
  const neutralSet = data.map(d => d.neutral);
  const sadSet     = data.map(d => d.sad);
  const c = chartColors();

  const ctx = document.getElementById(canvasId).getContext("2d");
  if (_zoneCharts[zone]) _zoneCharts[zone].destroy();

  _zoneCharts[zone] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "😊 Happy %",  data: happySet,   borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,.1)",   tension: 0.4, fill: true  },
        { label: "😐 Neutral %",   data: neutralSet, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,.07)", tension: 0.4, fill: false },
        { label: "😠 Stressed %",  data: sadSet,     borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.07)",  tension: 0.4, fill: false },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: c.tick, maxTicksLimit: 12 }, grid: { color: c.grid } },
        y: { min: 0, max: 100,
             ticks: { color: c.tick, callback: v => v + "%" },
             grid:  { color: c.grid } },
      },
      plugins: {
        legend: { labels: { color: c.legend, padding: 20 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } },
      },
    },
  });
}

// ── Page Navigation ────────────────────────────────────────────
const _pages = ["dashboard", "cameras", "notify", "checkin", "security", "lounge", "gate"];
let _feedInterval = null;

function showPage(page) {
  _pages.forEach(p => {
    document.getElementById(`page-${p}`).style.display = p === page ? "" : "none";
  });

  document.querySelectorAll(".sidebar-nav .nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  document.getElementById("pageTitle").textContent = PAGE_TITLES[page] || "";

  // Clear all feed intervals
  if (_feedInterval)     { clearInterval(_feedInterval);     _feedInterval     = null; }
  if (_zoneFeedInterval) { clearInterval(_zoneFeedInterval); _zoneFeedInterval = null; }

  if (page === "cameras") {
    refreshFeeds();
    _feedInterval = setInterval(refreshFeeds, FRAME_INTERVAL);
  } else if (ZONE_PAGES.includes(page)) {
    const camId = ZONE_CONFIG[page].camId;
    refreshZoneFeed(camId);
    _zoneFeedInterval = setInterval(() => refreshZoneFeed(camId), FRAME_INTERVAL);
    fetchZoneHistory(page);
  }
}

// ── Event Listeners ────────────────────────────────────────────
document.getElementById("camSelect").addEventListener("change", fetchHistory);
document.getElementById("rangeSelect").addEventListener("change", fetchHistory);

// ── Init ───────────────────────────────────────────────────────
syncThemeIcon();
fetchLive();
fetchHistory();
initZoneStats();
initLoungeClimate();
setInterval(fetchLive,           LIVE_INTERVAL);
setInterval(fetchHistory,        CHART_INTERVAL);
setInterval(updateZoneStatsSlow, 10 * 60 * 1000);
setInterval(updateZoneStatsFast,  2 * 60 * 1000);
setInterval(tickLoungeTemp,      10 * 1000);
setInterval(tickLoungeHumidity,  60 * 1000);
