(function () {
  "use strict";

  const cfg = window.PARKING_CONFIG;
  const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 42; // r=42 i SVG-en under

  const els = {
    grid: document.getElementById("grid"),
    banner: document.getElementById("banner"),
    countdown: document.getElementById("countdown"),
    lastUpdated: document.getElementById("lastUpdated"),
    refreshBtn: document.getElementById("refreshBtn"),
    timerRing: document.querySelector(".timer-ring-fg"),
  };

  const TIMER_CIRCUMFERENCE = 2 * Math.PI * 16; // r=16 i header-ringen
  els.timerRing.style.strokeDasharray = TIMER_CIRCUMFERENCE;

  let secondsLeft = cfg.refreshInterval;
  let countdownTimer = null;
  let isFetching = false;
  let lastApiUpdate = null; // tidsstempel fra API-svaret, hvis tilgjengelig
  let apiStatus = null;     // "status"-feltet fra API-svaret ("OK" når feeden er frisk)

  // ---------- Demo-data (vises kun hvis API ikke kan nås) ----------
  const DEMO_DATA = [
    { Name: "Bygarasjen", NumFreeSpaces: 412, NumAvailableChargepoints: 18, CurrentPrice: 28, MaxPricePer24Hours: 190, StatusMessage: "Åpent", _capacity: 1250 },
    { Name: "Klostergarasjen", NumFreeSpaces: 64, NumAvailableChargepoints: 6, CurrentPrice: 34, MaxPricePer24Hours: 210, StatusMessage: "Åpent", _capacity: 450 },
    { Name: "Bontelabo", NumFreeSpaces: 9, NumAvailableChargepoints: 1, CurrentPrice: 30, MaxPricePer24Hours: 180, StatusMessage: "Få plasser", _capacity: 320 },
    { Name: "Citypark Solheimsviken", NumFreeSpaces: 0, NumAvailableChargepoints: 0, CurrentPrice: 26, MaxPricePer24Hours: 160, StatusMessage: "Fullt", _capacity: 280 },
    { Name: "Grieggarasjen", NumFreeSpaces: 188, NumAvailableChargepoints: 12, CurrentPrice: 32, MaxPricePer24Hours: 200, StatusMessage: "Åpent", _capacity: 700 },
    { Name: "Nøstet", NumFreeSpaces: 23, NumAvailableChargepoints: 0, CurrentPrice: 24, MaxPricePer24Hours: 150, StatusMessage: "Åpent", _capacity: 160 },
  ];

  // ---------- Hjelpefunksjoner ----------

  function classifyStatus(free, capacity) {
    if (free <= 0) return "red";
    if (capacity > 0) {
      const ratio = free / capacity;
      if (ratio >= cfg.greenThreshold) return "green";
      if (ratio <= cfg.redThreshold) return "red";
      return "yellow";
    }
    // Uten kapasitet: bruk absolutte tall som fallback
    if (free >= 40) return "green";
    if (free >= 8) return "yellow";
    return "red";
  }

  // Returnerer hvor "fullt" huset er (0–1) for progress-ringen.
  function fillRatio(free, capacity) {
    if (capacity > 0) {
      const occupied = Math.max(0, capacity - free);
      return Math.min(1, occupied / capacity);
    }
    // Uten kapasitet anslår vi fylling ut fra et antatt "fullt" nivå.
    const assumed = Math.max(free, 50);
    return Math.min(1, 1 - free / assumed);
  }

  function fmtPrice(value) {
    if (value === null || value === undefined || value === "") return "–";
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return num.toLocaleString("no-NO");
  }

  function fmtTime(date) {
    return date.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  // ---------- Cache: sist kjente gode ledig-plass-tall ----------
  // API-ets ledig-plass-feed er tidvis nede (status="" og 0 for alle hus),
  // mens ladepunkt-/prisdata fortsatt er live. Da viser vi de siste *ekte*
  // tallene vi har sett per hus, slik den offisielle nettsiden også gjør.
  const CACHE_KEY = "pbergen_freecache_v1";

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveCache(cache) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
    catch (e) { /* localStorage utilgjengelig – hopp over */ }
  }
  function houseKey(house) {
    return house.Name || house.Id || house.id || "";
  }

  // Annoterer hvert hus med _displayFree (tallet som skal vises) og _cachedAt
  // (tidspunkt hvis tallet er hentet fra cache). Oppdaterer cachen med ferske,
  // pålitelige avlesninger. Returnerer om minst ett hus viser cachet tall.
  function applyFreeSpaceCache(houses) {
    const apiOk = apiStatus != null && apiStatus.toUpperCase() === "OK";
    const cache = loadCache();
    const at = lastApiUpdate ? lastApiUpdate.getTime() : Date.now();
    let usedCache = false;

    houses.forEach((house) => {
      const key = houseKey(house);
      const live = Number(house.NumFreeSpaces) || 0;
      // En avlesning er til å stole på når hele svaret er "OK", eller når
      // huset rapporterer et reelt tall > 0 (lekker gjennom selv ved degradert feed).
      const trustworthy = apiOk || live > 0;

      if (trustworthy) {
        if (key) cache[key] = { free: live, at: at };
        house._displayFree = live;
        house._cachedAt = null;
      } else if (key && cache[key]) {
        house._displayFree = cache[key].free;
        house._cachedAt = cache[key].at;
        usedCache = true;
      } else {
        house._displayFree = live; // 0, og ingen historikk å falle tilbake på
        house._cachedAt = null;
      }
    });

    saveCache(cache);
    return { usedCache: usedCache };
  }

  // ---------- Rendering ----------

  function buildCard(house) {
    const free = Number(house._displayFree != null ? house._displayFree : house.NumFreeSpaces) || 0;
    const capacity = Number(house._capacity || (cfg.capacities && cfg.capacities[house.Name])) || 0;
    const status = classifyStatus(free, capacity);
    const ratio = fillRatio(free, capacity);
    const pct = Math.round(ratio * 100);
    const offset = PROGRESS_CIRCUMFERENCE * (1 - ratio);

    const badgeText = status === "green" ? "God plass" : status === "yellow" ? "Få plasser" : (free <= 0 ? "Fullt" : "Nesten fullt");

    const overrides = cfg.nameOverrides || {};
    // Bruk evt. overstyrt navn, og fjern et avsluttende ", Bergen".
    const displayName = (overrides[house.Name] || house.Name).replace(/,?\s*Bergen\s*$/i, "");
    const chargepoints = Number(house.NumAvailableChargepoints) || 0;
    const cachedNote = house._cachedAt
      ? `<span class="cached-note">Sist kjent kl. ${fmtTime(new Date(house._cachedAt))}</span>`
      : "";
    const statusMsg = house.StatusMessage ? `<p class="status-msg">${esc(house.StatusMessage)}</p>` : "";

    // Veibeskrivelse: bruk evt. egendefinert lenke, ellers Google Maps-rute til navnet.
    const dirOverride = cfg.directions && cfg.directions[house.Name];
    const dirUrl = dirOverride
      || "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(house.Name);

    const card = document.createElement("article");
    card.className = `card status-${status}${house._cachedAt ? " is-cached" : ""}`;
    card.innerHTML = `
      <div class="card-head">
        <h2 class="card-name">${esc(displayName)}</h2>
        <span class="badge badge-${status}">${badgeText}</span>
      </div>

      <div class="card-body">
        <div class="progress" role="img" aria-label="${pct} prosent fullt">
          <svg viewBox="0 0 96 96" width="96" height="96">
            <circle class="progress-bg" cx="48" cy="48" r="42"></circle>
            <circle class="progress-fg status-${status}" cx="48" cy="48" r="42"
              stroke-dasharray="${PROGRESS_CIRCUMFERENCE.toFixed(1)}"
              stroke-dashoffset="${offset.toFixed(1)}"></circle>
          </svg>
          <div class="progress-label">
            <span class="progress-pct">${pct}%</span>
            <span class="progress-pct-sub">fullt</span>
          </div>
        </div>

        <div class="free-block">
          <span class="free-number status-${status}">${free}</span>
          <span class="free-label">ledige plasser</span>
          ${cachedNote}
          ${statusMsg}
        </div>
      </div>

      <div class="card-meta">
        <div class="meta">
          <span class="meta-icon charge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none"/>
            </svg>
          </span>
          <span class="meta-text">
            <span class="meta-value">${chargepoints}</span>
            <span class="meta-label">Ladepunkt</span>
          </span>
        </div>

        <div class="meta">
          <span class="meta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 2"/>
            </svg>
          </span>
          <span class="meta-text">
            <span class="meta-value">${fmtPrice(house.CurrentPrice)} kr</span>
            <span class="meta-label">Pris nå / 30 min</span>
          </span>
        </div>

        <div class="meta meta-full">
          <span class="meta-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <path d="M2 10h20"/>
            </svg>
          </span>
          <span class="meta-text">
            <span class="meta-value">${fmtPrice(house.MaxPricePer24Hours)} kr</span>
            <span class="meta-label">Maks per døgn</span>
          </span>
        </div>
      </div>

      <a class="dir-link" href="${dirUrl}" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
        </svg>
        Veibeskrivelse
      </a>
    `;
    return card;
  }

  function renderCards(houses) {
    els.grid.innerHTML = "";
    // Sorter: mest ledige først
    const freeOf = (h) => Number(h._displayFree != null ? h._displayFree : h.NumFreeSpaces) || 0;
    houses
      .slice()
      .sort((a, b) => freeOf(b) - freeOf(a))
      .forEach((house, i) => {
        const card = buildCard(house);
        card.style.animationDelay = `${Math.min(i * 0.04, 0.4)}s`;
        els.grid.appendChild(card);
      });
  }

  function renderSkeletons(n = 6) {
    els.grid.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const s = document.createElement("div");
      s.className = "skeleton";
      els.grid.appendChild(s);
    }
  }

  function showBanner(message, isError) {
    els.banner.textContent = message;
    els.banner.className = "banner" + (isError ? " error" : "");
  }

  function hideBanner() {
    els.banner.className = "banner hidden";
  }

  // ---------- Datahenting ----------

  async function fetchData() {
    const auth = "Basic " + btoa(`${cfg.token}:${cfg.tokenKey}`);
    const res = await fetch(`${cfg.baseUrl}/freespaces`, {
      method: "GET",
      headers: { Authorization: auth, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`API svarte med status ${res.status}`);
    }
    const data = await res.json();

    // Ta vare på API-ets eget tidsstempel hvis det finnes.
    if (data && typeof data.updated === "number") {
      lastApiUpdate = new Date(data.updated);
    }
    apiStatus = data && typeof data.status === "string" ? data.status : null;

    // API-et returnerer husene som et OBJEKT under "data", nøklet på id:
    //   { updated, status, data: { bygarasjen: {...}, klostergarasjen: {...} } }
    // Men vi støtter også liste-varianter for sikkerhets skyld.
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.freespaces)) return data.freespaces;
    if (Array.isArray(data.ParkingHouses)) return data.ParkingHouses;
    if (Array.isArray(data.data)) return data.data;
    if (data.data && typeof data.data === "object") return Object.values(data.data);
    return [];
  }

  async function refresh() {
    if (isFetching) return;
    isFetching = true;
    els.refreshBtn.classList.add("spinning");

    try {
      const houses = await fetchData();
      if (!houses.length) throw new Error("Tomt svar fra API-et");

      // Fyll inn sist kjente gode tall der live-feeden er nede.
      const { usedCache } = applyFreeSpaceCache(houses);
      renderCards(houses);
      els.lastUpdated.textContent = fmtTime(lastApiUpdate || new Date());

      // Er ledig-plass-feeden degradert? (status ikke "OK" og ingen live-tall > 0)
      const totalLiveFree = houses.reduce((s, h) => s + (Number(h.NumFreeSpaces) || 0), 0);
      const statusOk = apiStatus === null || apiStatus.toUpperCase() === "OK";
      const degraded = !statusOk && totalLiveFree === 0;

      if (degraded && usedCache) {
        showBanner(
          "API-et leverer akkurat nå ikke live antall ledige plasser. Viser sist " +
          "kjente tall (merket «Sist kjent kl.» på hvert kort). Ladepunkt- og prisdata er live.",
          false
        );
      } else if (degraded) {
        showBanner(
          "Ladepunkt- og prisdata hentes som normalt, men API-et leverer akkurat nå ikke " +
          "antall ledige plasser (status er ikke «OK», og alle hus rapporterer 0). Så snart " +
          "feeden leverer ekte tall, huskes de og vises her – også om feeden går ned igjen.",
          false
        );
      } else {
        hideBanner();
      }
    } catch (err) {
      if (cfg.useDemoFallback) {
        renderCards(DEMO_DATA);
        showBanner(
          `Kunne ikke hente live-data (${err.message}). Viser demo-data. ` +
          `Sjekk at token/tokenkey er fylt inn i config.js – og merk at nettleseren kan blokkere ` +
          `kallet pga. CORS. Da trengs en liten server/proxy mellom appen og API-et.`,
          false
        );
        els.lastUpdated.textContent = fmtTime(new Date()) + " (demo)";
      } else {
        els.grid.innerHTML = "";
        showBanner(`Feil ved henting av data: ${err.message}`, true);
      }
    } finally {
      isFetching = false;
      els.refreshBtn.classList.remove("spinning");
      resetCountdown();
    }
  }

  // ---------- Nedtelling ----------

  function updateTimerRing() {
    const frac = secondsLeft / cfg.refreshInterval;
    els.timerRing.style.strokeDashoffset = TIMER_CIRCUMFERENCE * (1 - frac);
  }

  function resetCountdown() {
    secondsLeft = cfg.refreshInterval;
    els.countdown.textContent = secondsLeft;
    updateTimerRing();
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        refresh();
      } else {
        els.countdown.textContent = secondsLeft;
        updateTimerRing();
      }
    }, 1000);
  }

  // ---------- Init ----------

  els.refreshBtn.addEventListener("click", () => refresh());

  // Pause nedtelling når fanen er skjult, hent friskt når den vises igjen.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (countdownTimer) clearInterval(countdownTimer);
    } else {
      refresh();
      startCountdown();
    }
  });

  renderSkeletons();
  resetCountdown();
  refresh();
  startCountdown();
})();
