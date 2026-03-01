/********************
 * Versioning + Updates (Module)
 * - version.json is source of truth
 * - throttled checks + in-flight dedupe
 * - UI: header pills + version modal
 ********************/

import {
  REMOTE_VERSION_URL,
  VERSION_LATEST_KEY,
  VERSION_APPLIED_KEY,
  VERSION_NOTES_KEY,
  VERSION_BUILD_KEY
} from "./state.js";

import { $, el, Modal, showToast } from "./ui.js";
import { Storage } from "./storage.js";

// ────────────────────────────
// Phase 2.1: rate-limit update checks
// ────────────────────────────
const UPDATE_CHECK_COOLDOWN_MS = 30_000; // 30s
let __updateCheckInFlight = null;
let __lastUpdateCheckAt = 0;
let __lastUpdateResult = null;

// Local module state (mirrors what you used in app.js)
let __latestVersion = localStorage.getItem(VERSION_LATEST_KEY) || null;
let __appliedVersion = localStorage.getItem(VERSION_APPLIED_KEY) || null;

let __latestNotes = (() => {
  try{
    const raw = localStorage.getItem(VERSION_NOTES_KEY);
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  }catch(_){
    return [];
  }
})();

let __latestBuildDate = localStorage.getItem(VERSION_BUILD_KEY) || null;

// Injected from app.js so we don’t import SW module directly
let __getSwReg = () => null;
let __hasSwUpdateWaiting = () => false;
let __getSwInstalling = () => false;
let __registerServiceWorker = async () => {};
let __forceReloadToUpdate = () => {};
let __getStateRef = () => null;

// UI hooks (optional)
let __openVersionModalExternal = null;

/********************
 * Public init: provide SW + state hooks
 ********************/
export function initVersioning({
  getSwReg,
  hasSwUpdateWaiting,
  getSwInstalling,
  registerServiceWorker,
  forceReloadToUpdate,
  getStateRef,
  openVersionModalExternal
}){
  if(typeof getSwReg === "function") __getSwReg = getSwReg;
  if(typeof hasSwUpdateWaiting === "function") __hasSwUpdateWaiting = hasSwUpdateWaiting;
  if(typeof getSwInstalling === "function") __getSwInstalling = getSwInstalling;

  if(typeof registerServiceWorker === "function") __registerServiceWorker = registerServiceWorker;
  if(typeof forceReloadToUpdate === "function") __forceReloadToUpdate = forceReloadToUpdate;

  if(typeof getStateRef === "function") __getStateRef = getStateRef;

  if(typeof openVersionModalExternal === "function") __openVersionModalExternal = openVersionModalExternal;
}

/********************
 * Header pills: update UI state
 ********************/
export function setHeaderPills(){
  // These ids/classes must match your existing DOM
  const pill = $("#pillUpdate");
  const dot  = $("#pillDot");
  if(!pill) return;

  const waiting = __hasSwUpdateWaiting();
  const installing = !!__getSwInstalling();

  // Show update pill if SW has an update waiting OR latest > applied
  const hasVersionDelta =
    __latestVersion && __appliedVersion && (__latestVersion !== __appliedVersion);

  const show = waiting || installing || hasVersionDelta;

  pill.style.display = show ? "" : "none";

  if(dot){
    dot.style.display = (waiting || installing) ? "" : "none";
  }

  // Update pill label text if you have an inner span
  const label = pill.querySelector(".label");
  if(label){
    if(waiting) label.textContent = "Update ready";
    else if(installing) label.textContent = "Updating…";
    else if(hasVersionDelta) label.textContent = "New version";
    else label.textContent = "Updates";
  }
}

/********************
 * Check version.json (throttled + in-flight dedupe)
 ********************/
export async function checkForUpdates(opts = {}){
  const force = !!opts.force;

  if(!navigator.onLine){
    setHeaderPills();
    __lastUpdateResult = { ok:false, reason:"offline" };
    return __lastUpdateResult;
  }

  if(__updateCheckInFlight) return __updateCheckInFlight;

  const now = Date.now();
  if(!force && __lastUpdateResult && (now - __lastUpdateCheckAt) < UPDATE_CHECK_COOLDOWN_MS){
    setHeaderPills();
    return { ...__lastUpdateResult, throttled:true };
  }

  __lastUpdateCheckAt = now;

  __updateCheckInFlight = (async () => {
    try{
      const url = `${REMOTE_VERSION_URL}?t=${Date.now()}`;
      const res = await fetch(url, { cache:"no-store" });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const latest = String(data?.version || "").trim() || null;
      const notesRaw = Array.isArray(data?.notes) ? data.notes : [];
      const notes = notesRaw.map(x => String(x||"").trim()).filter(Boolean).slice(0, 12);
      const buildDate = String(data?.buildDate || data?.build || data?.date || "").trim() || null;

      const prevLatest = __latestVersion;

      if(latest){
        __latestVersion = latest;
        localStorage.setItem(VERSION_LATEST_KEY, latest);

        if(!__appliedVersion){
          __appliedVersion = latest;
          localStorage.setItem(VERSION_APPLIED_KEY, latest);
        }
      }

      const versionChanged = !!(__latestVersion && __latestVersion !== prevLatest);

      if(versionChanged){
        try{ await __registerServiceWorker(); }catch(_){}
        const reg = __getSwReg();
        if(reg){
          try{ await reg.update(); }catch(_){}
        }
      }

      __latestNotes = notes;
      localStorage.setItem(VERSION_NOTES_KEY, JSON.stringify(notes));

      __latestBuildDate = buildDate;
      if(buildDate) localStorage.setItem(VERSION_BUILD_KEY, buildDate);

      setHeaderPills();

      const result = {
        ok:true,
        latestVersion: __latestVersion,
        appliedVersion: __appliedVersion,
        notes: __latestNotes,
        buildDate: __latestBuildDate,
        swUpdateWaiting: __hasSwUpdateWaiting(),
        swInstalling: !!__getSwInstalling()
      };

      __lastUpdateResult = result;
      return result;
    }catch(_e){
      setHeaderPills();
      __lastUpdateResult = { ok:false, reason:"fetch_failed" };
      return __lastUpdateResult;
    }finally{
      __updateCheckInFlight = null;
    }
  })();

  return __updateCheckInFlight;
}

/********************
 * Version modal UI
 ********************/
export function openVersionModal(){
  const latest = __latestVersion || "—";
  const applied = __appliedVersion || "—";
  const build = __latestBuildDate || "—";
  const notes = Array.isArray(__latestNotes) ? __latestNotes : [];

  const waiting = __hasSwUpdateWaiting();
  const installing = !!__getSwInstalling();

  const body = el("div", { class:"grid" }, [
    el("div", { class:"card" }, [
      el("div", { class:"note", text:`Applied: ${applied}` }),
      el("div", { class:"note", text:`Latest: ${latest}` }),
      el("div", { class:"note", text:`Build: ${build}` }),
      el("div", { style:"height:10px" }),

      el("div", { class:"btnrow" }, [
        el("button", {
          class:"btn",
          onClick: async () => {
            const r = await checkForUpdates({ force:true });
            showToast(r.ok ? "Checked version.json" : "Couldn’t check updates");
            // re-open to refresh displayed info
            Modal.close();
            openVersionModal();
          }
        }, ["Check for updates"]),

        el("button", {
          class: waiting ? "btn primary" : "btn",
          onClick: () => {
            // flush state before reload (zero data loss)
            try{
              const s = __getStateRef();
              if(s) Storage.flush(s);
            }catch(_){}

            if(waiting){
              __forceReloadToUpdate();
            }else{
              showToast(installing ? "Update downloading…" : "No update ready");
            }
          }
        }, [waiting ? "Reload to update" : (installing ? "Updating…" : "No update")])
      ])
    ]),

    el("div", { class:"card" }, [
      el("div", { class:"note", text:"Release notes" }),
      el("div", { style:"height:8px" }),
      ...(notes.length ? notes.map(n => el("div", { class:"note", text:`• ${n}` })) :
        [el("div", { class:"note", text:"No notes available." })])
    ])
  ]);

  Modal.open({
    title: "Version",
    bodyNode: body
  });
}

/********************
 * Bind header pill click handlers (call once)
 ********************/
export function bindUpdatePill(){
  const pill = $("#pillUpdate");
  if(!pill) return;

  // Avoid duplicate listeners: mark once
  if(pill.__bound) return;
  pill.__bound = true;

  pill.addEventListener("click", async (e) => {
    e.preventDefault();
    await checkForUpdates({ force:true });
    // If app.js provides a wrapper, use it; otherwise open our own
    if(__openVersionModalExternal) __openVersionModalExternal();
    else openVersionModal();
  });
}
