// ── Configuration ─────────────────────────────────────────────
const API_BASE        = "http://localhost:8000";
const LIVE_INTERVAL   = 5000;   // ms
const CHART_INTERVAL  = 60000;  // ms
const FRAME_INTERVAL  = 2000;   // ms — camera feed refresh

const CAMERA_IDS = ["CAM_01", "CAM_02", "CAM_03", "CAM_04"];

// ── State ──────────────────────────────────────────────────────
let historyChart = null;
let liveData = {};

// ── Helpers ────────────────────────────────────────────────────
function dominant(cam) {
  const m = Math.max(cam.happy, cam.neutral, cam.sad);
  if (m === cam.happy)   return "happy";
  if (m === cam.neutral) return "neutral";
  return "sad";
}

function satisfactionColor(cam) {
  const score = cam.happy - cam.sad;          // -100 to +100
  if (score > 20)  return "#22c55e";
  if (score > -20) return "#f59e0b";
  return "#ef4444";
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Live Cards ─────────────────────────────────────────────────
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
    card.className = `cam-card dominant-${dom}`;
    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">${cam.camera_name}</div>
          <div class="card-id">${cam.camera_id}</div>
        </div>
        <div class="card-persons">
          <span>${cam.total_persons}</span>
          persoane
        </div>
      </div>

      <div class="emotion-row">
        <div class="emotion-label"><span>😊 Fericit</span><strong>${cam.happy}%</strong></div>
        <div class="bar-track"><div class="bar-fill bar-happy" style="width:${cam.happy}%"></div></div>
      </div>
      <div class="emotion-row">
        <div class="emotion-label"><span>😐 Neutru</span><strong>${cam.neutral}%</strong></div>
        <div class="bar-track"><div class="bar-fill bar-neutral" style="width:${cam.neutral}%"></div></div>
      </div>
      <div class="emotion-row">
        <div class="emotion-label"><span>😠 Supărat</span><strong>${cam.sad}%</strong></div>
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
    label.textContent = `${cam.happy}% 😊`;

    // Tooltip on hover
    const marker = document.getElementById(`marker-${cam.camera_id}`);
    const tooltip = document.getElementById("tooltip");
    if (marker) {
      marker.onmouseenter = (e) => {
        tooltip.innerHTML = `
          <strong>${cam.camera_name}</strong><br>
          😊 Fericit: ${cam.happy}%<br>
          😐 Neutru: ${cam.neutral}%<br>
          😠 Supărat: ${cam.sad}%<br>
          👥 ${cam.total_persons} persoane
        `;
        tooltip.classList.add("visible");
      };
      marker.onmouseleave = () => tooltip.classList.remove("visible");
      marker.onmousemove = (e) => {
        const rect = document.querySelector(".heatmap-container").getBoundingClientRect();
        tooltip.style.left = (e.clientX - rect.left + 12) + "px";
        tooltip.style.top  = (e.clientY - rect.top  + 12) + "px";
      };
    }
  });
}

// ── Live Polling ────────────────────────────────────────────────
async function fetchLive() {
  try {
    const res  = await fetch(`${API_BASE}/api/live`);
    const data = await res.json();
    liveData = {};
    data.forEach(c => liveData[c.camera_id] = c);

    renderCards(data);
    updateHeatmap(data);

    document.getElementById("connectionDot").className   = "status-dot online";
    document.getElementById("connectionLabel").textContent = "Online";
    document.getElementById("lastUpdate").textContent    = `Ultima actualizare: ${new Date().toLocaleTimeString("ro-RO")}`;
  } catch (e) {
    document.getElementById("connectionDot").className   = "status-dot offline";
    document.getElementById("connectionLabel").textContent = "Offline";
    console.error("Live fetch error:", e);
  }
}

// ── History Chart ───────────────────────────────────────────────
async function fetchHistory() {
  const camId  = document.getElementById("camSelect").value;
  const hours  = document.getElementById("rangeSelect").value;

  let url = `${API_BASE}/api/history?hours=${hours}`;
  if (camId) url += `&camera_id=${camId}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    renderChart(data, camId);
  } catch (e) {
    console.error("History fetch error:", e);
  }
}

function renderChart(data, camId) {
  // If all cameras selected, group by timestamp and average
  let labels, happySet, neutralSet, sadSet;

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
        { label: "😊 Fericit %",  data: happySet,   borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,.1)",  tension: 0.4, fill: true },
        { label: "😐 Neutru %",   data: neutralSet, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,.08)", tension: 0.4, fill: false },
        { label: "😠 Supărat %",  data: sadSet,     borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.08)", tension: 0.4, fill: false },
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: "#6b7fa3", maxTicksLimit: 12 }, grid: { color: "#1e2535" } },
        y: { min: 0, max: 100, ticks: { color: "#6b7fa3", callback: v => v + "%" }, grid: { color: "#1e2535" } }
      },
      plugins: {
        legend: { labels: { color: "#c9d1d9", padding: 20 } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` }
        }
      }
    }
  });
}

function avg(arr) {
  return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
}

// ── Camera Feeds ─────────────────────────────────────────────────
function refreshFeeds() {
  CAMERA_IDS.forEach(camId => {
    const img = document.getElementById(`feed-${camId}`);
    const noSignal = document.getElementById(`nosignal-${camId}`);
    if (!img) return;

    const newSrc = `${API_BASE}/api/frame/${camId}?t=${Date.now()}`;
    const tester = new Image();
    tester.onload = () => {
      img.src = newSrc;
      if (noSignal) noSignal.style.display = "none";
    };
    tester.onerror = () => {
      if (noSignal) noSignal.style.display = "flex";
    };
    tester.src = newSrc;

    // Update emotion stats below each feed from liveData
    const stats = document.getElementById(`feedstats-${camId}`);
    if (stats && liveData[camId]) {
      const cam = liveData[camId];
      stats.innerHTML = `
        <div class="feed-stat-row">
          <span class="feed-emotion-dot" style="background:var(--happy)"></span>
          <span>Fericit</span><strong>${cam.happy}%</strong>
          <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.happy}%;background:var(--happy)"></div></div>
        </div>
        <div class="feed-stat-row">
          <span class="feed-emotion-dot" style="background:var(--neutral)"></span>
          <span>Neutru</span><strong>${cam.neutral}%</strong>
          <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.neutral}%;background:var(--neutral)"></div></div>
        </div>
        <div class="feed-stat-row">
          <span class="feed-emotion-dot" style="background:var(--sad)"></span>
          <span>Supărat</span><strong>${cam.sad}%</strong>
          <div class="feed-bar-track"><div class="feed-bar-fill" style="width:${cam.sad}%;background:var(--sad)"></div></div>
        </div>
        <div class="feed-persons">👥 ${cam.total_persons} persoane detectate</div>
      `;
    }
  });
}

// ── Page Navigation & Plane Animation ─────────────────────────────
let _feedInterval = null;
const planeLogo = document.getElementById("planeLogo");
const navMenu = document.getElementById("navMenu");

// Funcția care gestionează decolarea și meniul
planeLogo.addEventListener("click", (e) => {
  e.stopPropagation();
  
  // Dacă meniul nu este deschis, pornim animația și îl deschidem
  if (!navMenu.classList.contains("open")) {
    planeLogo.classList.add("flying");
    navMenu.classList.add("open");
  } else {
    // Dacă e deja deschis, îl închidem și aducem avionul înapoi
    closeMenu();
  }
});

function closeMenu() {
  navMenu.classList.remove("open");
  planeLogo.classList.remove("flying");
}

function showPage(page) {
  // Switch între pagini
  document.getElementById("page-dashboard").style.display = page === "dashboard" ? "" : "none";
  document.getElementById("page-cameras").style.display   = page === "cameras"   ? "" : "none";

  // Actualizare vizuală meniu (clasa active)
  document.querySelectorAll(".nav-item").forEach(el => {
    // Verificăm dacă atributul onclick conține numele paginii
    const isTargetPage = el.getAttribute("onclick").includes(page);
    el.classList.toggle("active", isTargetPage);
  });

  // Gestionare intervale camere
  if (page === "cameras") {
    refreshFeeds();
    if (!_feedInterval) _feedInterval = setInterval(refreshFeeds, FRAME_INTERVAL);
  } else {
    if (_feedInterval) { clearInterval(_feedInterval); _feedInterval = null; }
  }

  // După ce alegem o pagină, închidem meniul și resetăm avionul
  closeMenu();
}

// Închide meniul dacă se dă click oriunde altundeva în pagină
document.addEventListener("click", (e) => {
  if (navMenu.classList.contains("open")) {
    closeMenu();
  }
});

// Dropdown toggle
document.getElementById("navBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("navMenu").classList.toggle("open");
});
document.addEventListener("click", () => {
  document.getElementById("navMenu").classList.remove("open");
});

// ── Event Listeners ─────────────────────────────────────────────
document.getElementById("camSelect").addEventListener("change", fetchHistory);
document.getElementById("rangeSelect").addEventListener("change", fetchHistory);

// ── Init ────────────────────────────────────────────────────────
fetchLive();
fetchHistory();
setInterval(fetchLive, LIVE_INTERVAL);
setInterval(fetchHistory, CHART_INTERVAL);
