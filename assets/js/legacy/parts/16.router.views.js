/********************
     * 6) Router + Views
     ********************/
const Routes = {
  // Bottom nav (mobile-first)
  home: { label: "Home", nav:true },
  routine: { label: "Routine", nav:true },
  progress: { label: "Progress", nav:true },
  settings: { label: "Settings", nav:true },

  // Non-nav routes (opened via buttons/links)
  weight: { label: "Weight", nav:false },
  attendance: { label: "Attendance", nav:false },
  routine_editor: { label: "Routine Editor", nav:false },
  exercise_library: { label: "Exercise Library", nav:false }
};


const NAV_KEYS = Object.entries(Routes)
  .filter(([,v]) => v.nav)
  .map(([k]) => k);

function renderNav(){
  const nav = $("#navbar");
  nav.innerHTML = "";

  const disabled = !state.profile;

  NAV_KEYS.forEach((key) => {
    const r = Routes[key];
    nav.appendChild(el("button", {
      class: "navbtn" + (key === currentRoute ? " active" : ""),
      onClick: () => {
        if(disabled){ navigate("home"); return; }
        navigate(key);
      }
    }, [
      el("div", { class:"dot" }),
      el("div", { text: r.label })
    ]));
  });
}


    let currentRoute = "home";

function setChip(){
  const chip = $("#chipStatus");
  if(!chip) return;

  if(state.profile?.name) chip.textContent = `Hi, ${state.profile.name}`;
  else chip.textContent = "Not set up";
}
// ─────────────────────────────
// Version + Sync Pills (Service Worker powered updates)
// Goals:
// - vX pill comes ONLY from version.json
// - Release notes ("What's New") are read from version.json
// - "Update Available" is TRUE when a new Service Worker is waiting (real, ready-to-apply update)
// - "Downloading…" shows while the Service Worker is installing
// - Reload to update activates the waiting SW and reloads WITHOUT clearing user profile/localStorage
// ─────────────────────────────
let __latestVersion  = (localStorage.getItem(VERSION_LATEST_KEY)  || "").trim() || null;
let __appliedVersion = (localStorage.getItem(VERSION_APPLIED_KEY) || "").trim() || null;

let __latestNotes = (() => {
  try { return JSON.parse(localStorage.getItem(VERSION_NOTES_KEY) || "[]"); }
  catch(e){ return []; }
})();
let __latestBuildDate = (localStorage.getItem(VERSION_BUILD_KEY) || "").trim() || null;

let __swReg = null;
let __swUrlRegistered = null; // ✅ tracks which SW URL (including ?v=...) we registered
let __swUpdateReady = false;
let __swInstalling = false;


function __hasSwUpdateWaiting(){
  return !!(__swReg && __swReg.waiting) || __swUpdateReady;
}

function setHeaderPills(){
  const syncPill = $("#syncPill");
  const verPill  = $("#verPill");
  if(!syncPill || !verPill) return;

  // Version pill comes ONLY from version.json (fallback to applied/offline)
  const shown = __latestVersion || __appliedVersion || "—";
  verPill.textContent = `v${shown}`;

  // Connectivity
  if(!navigator.onLine){
    syncPill.textContent = "Offline";
    syncPill.classList.remove("ok","warn");
    syncPill.classList.add("off");
    return;
  }

  // Downloading/Installing state (SW is fetching the new build)
  if(__swInstalling){
    syncPill.textContent = "Downloading…";
    syncPill.classList.remove("ok","off");
    syncPill.classList.add("warn");
    return;
  }

  // Update ready-to-apply state
  if(__hasSwUpdateWaiting()){
    syncPill.textContent = "Update Available";
    syncPill.classList.remove("ok","off");
    syncPill.classList.add("warn");
  }else{
    syncPill.textContent = "Synced";
    syncPill.classList.remove("warn","off");
    syncPill.classList.add("ok");
  }
}

async function checkForUpdates(){
  // Fetch version.json (single source of truth for version + notes)
  if(!navigator.onLine){
    setHeaderPills();
    return { ok:false, reason:"offline" };
  }
  try{
    const url = `${REMOTE_VERSION_URL}?t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const latest = String(data?.version || "").trim() || null;
    const notesRaw = Array.isArray(data?.notes) ? data.notes : [];
    const notes = notesRaw
      .map(x => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 12); // keep it tight in UI

    const buildDate = String(data?.buildDate || data?.build || data?.date || "").trim() || null;

    const prevLatest = __latestVersion;

    if(latest){
      __latestVersion = latest;
      localStorage.setItem(VERSION_LATEST_KEY, latest);

      // First run: initialize applied version so modal has a baseline
      if(!__appliedVersion){
        __appliedVersion = latest;
        localStorage.setItem(VERSION_APPLIED_KEY, latest);
      }
    }

   // ✅ If version.json changed, re-register the SW with the new ?v= URL.
// This makes "version.json is the source of truth" actually trigger the update pipeline.
const versionChanged = !!(__latestVersion && __latestVersion !== prevLatest);

if(versionChanged){
  // Ensure SW URL becomes ./sw.js?v=<latest>
  try{ await registerServiceWorker(); }catch(_){}
  // Ask the SW registration to check the server immediately
  if(__swReg){
    try{ await __swReg.update(); }catch(_){}
  }
}



    __latestNotes = notes;
    localStorage.setItem(VERSION_NOTES_KEY, JSON.stringify(notes));

    __latestBuildDate = buildDate;
    if(buildDate) localStorage.setItem(VERSION_BUILD_KEY, buildDate);

    setHeaderPills();
    return {
      ok:true,
      latestVersion: __latestVersion,
      appliedVersion: __appliedVersion,
      notes: __latestNotes,
      buildDate: __latestBuildDate,
      swUpdateWaiting: __hasSwUpdateWaiting(),
      swInstalling: __swInstalling
    };
  }catch(e){
    setHeaderPills();
    return { ok:false, reason:"fetch_failed" };
  }
}

async function registerServiceWorker(){
  if(!("serviceWorker" in navigator)) return;

  try{
    // ✅ Version the SW script URL so a version.json bump forces a new SW install
    // (this is what makes cache cleanup deterministic for users)
    const v = (__latestVersion || __appliedVersion || "").trim();
    const swUrl = v ? `./sw.js?v=${encodeURIComponent(v)}` : "./sw.js";

    // If we already registered this exact URL, don't re-register.
    if(__swReg && __swUrlRegistered === swUrl) return;
    __swUrlRegistered = swUrl;

    __swReg = await navigator.serviceWorker.register(swUrl);

    // If an update is already waiting
    if(__swReg.waiting){
      __swUpdateReady = true;
      __swInstalling = false;
      setHeaderPills();
    }

    __swReg.addEventListener("updatefound", () => {
      const installing = __swReg.installing;
      if(!installing) return;

      __swInstalling = true;
      setHeaderPills();

      installing.addEventListener("statechange", () => {
        // installed + existing controller => update is ready and waiting
        if(installing.state === "installed" && navigator.serviceWorker.controller){
          __swInstalling = false;
          __swUpdateReady = true;
          setHeaderPills();
        }

        // If it becomes redundant/failed, stop showing "Downloading…"
        if(installing.state === "redundant"){
          __swInstalling = false;
          setHeaderPills();
        }
      });
    });

    // When new SW takes control, mark applied version (metadata only) and reload once
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if(reloaded) return;
      reloaded = true;

      if(__latestVersion){
        __appliedVersion = __latestVersion;
        localStorage.setItem(VERSION_APPLIED_KEY, __latestVersion);
      }

      // Reload under the new build; does NOT clear user profile/localStorage
      location.reload();
    });

  }catch(e){
    console.warn("Service worker registration failed:", e);
  }
}

function applyUpdateNow(){
  // ✅ Prevent losing changes that are still pending in debounce
  try{ Storage.flush(state); }catch(_){}

  // If an update is waiting, activate it (skip waiting). Otherwise, just reload.
  try{
    if(__swReg && __swReg.waiting){
      __swReg.waiting.postMessage({ type:"SKIP_WAITING" });
      return;
    }
  }catch(_){}

  location.reload();
}


function openVersionModal(){
  const status = !navigator.onLine
    ? "You’re offline. Updates can’t be checked right now."
    : (__swInstalling
        ? "Downloading the update in the background…"
        : (__hasSwUpdateWaiting()
            ? "A newer version is ready. Reload to apply the update."
            : "You’re up to date."));

  const notesNode = (__latestNotes && __latestNotes.length)
    ? el("div", {}, [
        el("div", { class:"note", text:"What’s new" }),
        el("div", { style:"height:8px" }),
        el("ul", {
          style:"margin:0; padding-left:18px; color: rgba(255,255,255,.78); font-size: 13px; line-height: 1.35;"
        }, __latestNotes.map(n => el("li", { text: n }))),
        el("div", { style:"height:10px" })
      ])
    : el("div", { style:"height:0" });

  Modal.open({
    title: "About",
    bodyNode: el("div", { class:"grid" }, [
      el("div", { class:"note", text:`Version (version.json): ${__latestVersion ? "v"+__latestVersion : "—"}` }),
      el("div", { class:"note", text:`Applied on device: ${__appliedVersion ? "v"+__appliedVersion : "—"}` }),
      (__latestBuildDate ? el("div", { class:"note", text:`Build: ${__latestBuildDate}` }) : el("div", { style:"display:none" })),
      el("div", { style:"height:10px" }),
      el("div", { class:"note", text: status }),
      el("div", { style:"height:12px" }),
      notesNode,
      el("div", { class:"btnrow" }, [
        el("button", {
          class:"btn",
          onClick: async () => {
            const r = await checkForUpdates();
            showToast(r.ok ? "Checked version.json" : "Couldn’t check updates");
          }
        }, ["Check for updates"]),
        el("button", {
          class:"btn primary",
          onClick: () => applyUpdateNow()
        }, [__hasSwUpdateWaiting() ? "Reload to update" : "Reload"])
      ])
    ])
  });
}

let __headerPillsBound = false;
function bindHeaderPills(){
  if(__headerPillsBound) return;
  __headerPillsBound = true;

  const syncPill = $("#syncPill");
  const verPill  = $("#verPill");

  if(syncPill){
    syncPill.addEventListener("click", async () => {
      await checkForUpdates();
      openVersionModal();
    });
  }

  if(verPill){
    verPill.addEventListener("click", () => openVersionModal());
  }

  window.addEventListener("online",  () => { setHeaderPills(); checkForUpdates(); });
  window.addEventListener("offline", () => { setHeaderPills(); });
}



    function navigate(routeKey){
  destroyProgressChart();
  destroyWeightChart();

  currentRoute = routeKey;

  renderNav();
  renderView();
  bindHeaderPills();
  checkForUpdates();

  // ─────────────────────────────
  // GA4: SPA route tracking (page_view)
  // ─────────────────────────────
  try{
    if(typeof gtag === "function"){
      const label = (Routes?.[routeKey]?.label) || routeKey || "unknown";
      const pagePath = "/" + String(routeKey || "unknown");

      gtag("event", "page_view", {
        page_title: label,
        page_path: pagePath,
        page_location: (location?.origin || "") + pagePath
      });
    }
  }catch(e){
    // never let analytics break navigation
  }
}


    function renderView(){
setChip();
setHeaderPills();
      const root = $("#viewRoot");
      root.innerHTML = "";

      if(!state.profile){
        root.appendChild(Views.Onboarding());
        return;
      }

         if(currentRoute === "home") root.appendChild(Views.Home());
else if(currentRoute === "routine") root.appendChild(Views.Routine());
else if(currentRoute === "progress") root.appendChild(Views.Progress());
else if(currentRoute === "settings") root.appendChild(Views.Settings());
else if(currentRoute === "weight") root.appendChild(Views.Weight());
else if(currentRoute === "attendance") root.appendChild(Views.Attendance());
else if(currentRoute === "routine_editor") root.appendChild(Views.RoutineEditor());
else if(currentRoute === "exercise_library") root.appendChild(Views.ExerciseLibraryManager());
else if(currentRoute === "protein_history") root.appendChild(Views.ProteinHistory());
else root.appendChild(el("div", { class:"card" }, [
  el("h2", { text:"Not found" }),
  el("div", { class:"note", text:`Unknown route: ${currentRoute}` })
]));

    }
