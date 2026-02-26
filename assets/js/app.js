
    /********************
     * 1) State + Storage
     ********************/
// ─────────────────────────────
// Storage + Versioning
// ─────────────────────────────
const STORAGE_KEY = "gymdash:v1";

// version.json is the single source of truth for version display + release notes
const REMOTE_VERSION_URL = "./version.json";

// ─────────────────────────────
// Schema versioning (production hardening)
// ─────────────────────────────
const SCHEMA_VERSION = 1;

// Migrate/repair any saved state into the latest schema safely.
// - Always merges into DefaultState() so new keys are never missing.
// - Ensures critical containers are the right types.
// - Lets you add future migrations without breaking old users.
function migrateState(saved){
  const base = DefaultState();

  // If it's not a plain object, return defaults
  if(!saved || typeof saved !== "object") return base;

  // Merge onto defaults (so newly-added keys appear automatically)
  const merged = Object.assign(base, saved);

  // Normalize version
  const v = (typeof merged.schemaVersion === "number") ? merged.schemaVersion : 0;

  // Future migrations go here:
  // if(v < 1){ ... set defaults/transform old fields ... }

  // ✅ Hard guards for containers (prevents runtime crashes)
  if(!Array.isArray(merged.routines)) merged.routines = [];
  if(typeof merged.exerciseLibrary !== "object" || !merged.exerciseLibrary) merged.exerciseLibrary = { weightlifting:[], cardio:[], core:[] };
  if(!Array.isArray(merged.exerciseLibrary.weightlifting)) merged.exerciseLibrary.weightlifting = [];
  if(!Array.isArray(merged.exerciseLibrary.cardio)) merged.exerciseLibrary.cardio = [];
  if(!Array.isArray(merged.exerciseLibrary.core)) merged.exerciseLibrary.core = [];
  if(typeof merged.logs !== "object" || !merged.logs) merged.logs = { workouts:[], weight:[], protein:[] };
  if(!Array.isArray(merged.logs.workouts)) merged.logs.workouts = [];
  if(!Array.isArray(merged.logs.weight)) merged.logs.weight = [];
  if(!Array.isArray(merged.logs.protein)) merged.logs.protein = [];
  if(!Array.isArray(merged.attendance)) merged.attendance = [];

  // Always stamp latest schema
  merged.schemaVersion = SCHEMA_VERSION;

  return merged;
}

// Version metadata only (does NOT affect user profile/state)
const VERSION_LATEST_KEY   = "gymdash:latestVersion";     // last fetched version.json value
const VERSION_APPLIED_KEY  = "gymdash:appliedVersion";    // last version applied on this device
const VERSION_NOTES_KEY    = "gymdash:latestNotes";       // JSON stringified array of notes
const VERSION_BUILD_KEY    = "gymdash:latestBuildDate";   // optional build date string




    const DefaultState = () => ({
      schemaVersion: 1,
      createdAt: Date.now(),
      profile: null,
      routines: [],
      activeRoutineId: null,
      exerciseLibrary: {
        weightlifting: [],
        cardio: [],
        core: []
      },
      logs: {
        workouts: [],
        weight: [],
        protein: []
      },
      attendance: []
    });
// ────────────────────────────
// Auto Backup Vault (Rolling Snapshots - IndexedDB)
// Keeps recent snapshots so users can restore if something goes wrong.
// ────────────────────────────
const EXPORT_META_KEY = "gymdash:lastExportAt";

// tiny helpers (kept OUTSIDE state to avoid schema churn)
function getLastExportAt(){
  const v = Number(localStorage.getItem(EXPORT_META_KEY) || 0);
  return Number.isFinite(v) ? v : 0;
}
function setLastExportAt(ts){
  try{ localStorage.setItem(EXPORT_META_KEY, String(ts||Date.now())); }catch(_){}
}

const BackupVault = (() => {
  const DB_NAME = "gymdash-backups";
  const DB_VERSION = 1;
  const STORE = "snapshots";
  const META = "meta";

  // policy
  const KEEP = 20;                    // keep last N
  const THROTTLE_MS = 5 * 60 * 1000;  // 5 min

  let _dbP = null;

  function _openDB(){
    if(_dbP) return _dbP;
    _dbP = new Promise((resolve, reject) => {
      try{
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if(!db.objectStoreNames.contains(STORE)){
            const os = db.createObjectStore(STORE, { keyPath: "id" });
            os.createIndex("createdAt", "createdAt");
          }
          if(!db.objectStoreNames.contains(META)){
            db.createObjectStore(META, { keyPath: "k" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
      }catch(e){
        reject(e);
      }
    });
    return _dbP;
  }

  async function _getMeta(db, k){
    return new Promise((resolve) => {
      try{
        const tx = db.transaction(META, "readonly");
        const st = tx.objectStore(META);
        const req = st.get(k);
        req.onsuccess = () => resolve(req.result ? req.result.v : null);
        req.onerror = () => resolve(null);
      }catch(_){ resolve(null); }
    });
  }

  async function _setMeta(db, k, v){
    return new Promise((resolve) => {
      try{
        const tx = db.transaction(META, "readwrite");
        tx.objectStore(META).put({ k, v });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      }catch(_){ resolve(false); }
    });
  }

  async function _putSnapshot(db, snap){
    return new Promise((resolve) => {
      try{
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(snap);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      }catch(_){ resolve(false); }
    });
  }

  async function _listSnapshots(db, limit=KEEP){
    return new Promise((resolve) => {
      try{
        const out = [];
        const tx = db.transaction(STORE, "readonly");
        const idx = tx.objectStore(STORE).index("createdAt");
        const req = idx.openCursor(null, "prev"); // newest first
        req.onsuccess = () => {
          const cur = req.result;
          if(!cur || out.length >= limit){
            resolve(out);
            return;
          }
          out.push(cur.value);
          cur.continue();
        };
        req.onerror = () => resolve(out);
      }catch(_){ resolve([]); }
    });
  }

  async function _deleteByIds(db, ids){
    return new Promise((resolve) => {
      try{
        const tx = db.transaction(STORE, "readwrite");
        const st = tx.objectStore(STORE);
        ids.forEach(id => { try{ st.delete(id); }catch(_){ } });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      }catch(_){ resolve(false); }
    });
  }

  async function _prune(db){
    const all = await _listSnapshots(db, 9999);
    if(all.length <= KEEP) return;
    const excess = all.slice(KEEP);
    const ids = excess.map(s => s.id);
    await _deleteByIds(db, ids);
  }

  function _safeCounts(s){
    return {
      routines: (s?.routines || []).length,
      workouts: (s?.logs?.workouts || []).length,
      weight: (s?.logs?.weight || []).length,
      protein: (s?.logs?.protein || []).length,
      attendance: (s?.attendance || []).length
    };
  }

  async function _createSnapshot(s, reason){
    const createdAt = Date.now();
    const snap = {
      id: `auto_${createdAt}_${Math.random().toString(16).slice(2)}`,
      createdAt,
      reason: String(reason || "auto"),
      schemaVersion: Number(s?.schemaVersion || 0),
      counts: _safeCounts(s),
      state: s
    };
    return snap;
  }

  // public
  // public
  // Prevent duplicate snapshots if multiple saves happen at the same time
  let __snapshotInFlight = null;

  async function maybeSnapshot(s, reason="save"){
    // If a snapshot is already being created, do NOT create another.
    // This stops duplicate rows (same timestamp) from ever being written.
    if(__snapshotInFlight) return false;

    __snapshotInFlight = (async () => {
      try{
        const db = await _openDB();

        const last = Number(await _getMeta(db, "lastSnapshotAt") || 0) || 0;
        const now = Date.now();

        // Throttle snapshots (your existing safety rule)
        if(now - last < THROTTLE_MS) return false;

        const snap = await _createSnapshot(s, reason);
        const ok = await _putSnapshot(db, snap);

        if(ok){
          await _setMeta(db, "lastSnapshotAt", now);
          await _prune(db);
        }
        return ok;
      }catch(_){
        return false;
      }finally{
        __snapshotInFlight = null;
      }
    })();

    return await __snapshotInFlight;
  }

  async function forceSnapshot(s, reason="force"){
    // Force snapshot should also respect the lock to avoid duplicates.
    if(__snapshotInFlight) return false;

    __snapshotInFlight = (async () => {
      try{
        const db = await _openDB();
        const snap = await _createSnapshot(s, reason);
        const ok = await _putSnapshot(db, snap);

        if(ok){
          await _setMeta(db, "lastSnapshotAt", Date.now());
          await _prune(db);
        }
        return ok;
      }catch(_){
        return false;
      }finally{
        __snapshotInFlight = null;
      }
    })();

    return await __snapshotInFlight;
  }

  async function list(limit=KEEP){
    try{
      const db = await _openDB();
      return await _listSnapshots(db, limit);
    }catch(_){ return []; }
  }

  async function get(id){
    try{
      const db = await _openDB();
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    }catch(_){ return null; }
  }

  async function clear(){
    try{
      const db = await _openDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE, META], "readwrite");
        tx.objectStore(STORE).clear();
        tx.objectStore(META).put({ k:"lastSnapshotAt", v:0 });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    }catch(_){ return false; }
  }

  return { maybeSnapshot, forceSnapshot, list, get, clear, KEEP, THROTTLE_MS };
})();

const Storage = {
  load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return DefaultState();

      const parsed = JSON.parse(raw);

      // ✅ Always migrate/repair into latest schema
      return migrateState(parsed);
    }catch(e){
      return DefaultState();
    }
  },

  save(state){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      // Auto-snapshot (non-blocking) — protects against bad imports/updates/resets
      try{ BackupVault.maybeSnapshot(state, "save"); }catch(_){}
    }catch(e){
      // QuotaExceededError or storage blocked in private modes
      console.warn("Storage.save failed:", e);
      handleStorageWriteError(e);
    }
  },


  reset(){
    try{
      localStorage.removeItem(STORAGE_KEY);
    }catch(e){
      console.warn("Storage.reset failed:", e);
    }
  }
};

// ✅ Load state AFTER Storage exists
let state = Storage.load();

/********************
 * Backup / Import (Step 10)
 ********************/
function downloadTextFile(filename, text, mime="application/json"){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function exportBackupJSON(){
  // Keep export simple: full state snapshot
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "gym-dashboard-dev",
    data: state
  };
  return JSON.stringify(payload, null, 2);
}

function validateImportedState(obj){
  // Accept either raw state or wrapped { data: state }
  const imported = (obj && typeof obj === "object" && "data" in obj) ? obj.data : obj;

  if(!imported || typeof imported !== "object") throw new Error("Invalid JSON object.");
  if(typeof imported.schemaVersion !== "number") throw new Error("Invalid backup: missing schemaVersion.");

  // Must contain expected top-level fields (loose validation)
  if(!("profile" in imported)) throw new Error("Invalid backup: missing profile.");
  if(!("routines" in imported)) throw new Error("Invalid backup: missing routines.");
  if(!("exerciseLibrary" in imported)) throw new Error("Invalid backup: missing exerciseLibrary.");
  if(!("logs" in imported)) throw new Error("Invalid backup: missing logs.");
  if(!("attendance" in imported)) throw new Error("Invalid backup: missing attendance.");

  return migrateState(imported);
}

function importBackupJSON(jsonText){
  // Safety net: snapshot current state BEFORE overwrite (best-effort, non-blocking)
  try{ BackupVault.forceSnapshot(state, "pre-import"); }catch(_){}

  let parsed;
  try{
    parsed = JSON.parse(jsonText);
  }catch(e){
    throw new Error("Could not parse JSON. Make sure it’s valid.");
  }

  const importedState = validateImportedState(parsed);

  // Overwrite local storage + live state
  state = importedState;
  Storage.save(state);

  // Snapshot the newly imported state as well (best-effort)
  try{ BackupVault.forceSnapshot(state, "post-import"); }catch(_){}
}

// ✅ failsafe: prevent Storage.save from crashing if handler is missing
function handleStorageWriteError(e){
  try{
    // Minimal user-safe warning; you can enhance later
    console.warn("Storage write error:", e);
  }catch(_){}
}

const UIState = window.__GymDashUIState || (window.__GymDashUIState = {
  settings: {
    q: "",
    open: { "profile": true, "library": false, "backup": false, "data": false, "debug": false }
  },
  libraryManage: {
    q: "",
    type: "weightlifting",
    equipment: "all"
  }
});

    /********************
     * 2) Helpers
     ********************/
    const $ = (sel, root=document) => root.querySelector(sel);

    const el = (tag, attrs={}, children=[]) => {
      const n = document.createElement(tag);
      for (const [k,v] of Object.entries(attrs)){
        if(k === "class") n.className = v;
        else if(k === "text") n.textContent = v;
        else if(k === "html") n.innerHTML = v;
        else if(k.startsWith("on") && typeof v === "function"){
          n.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          n.setAttribute(k, v);
        }
      }
      children.forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
      return n;
    };

    const uid = (prefix="id") => `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

        const pad2 = (n) => String(n).padStart(2, "0");

const Dates = {
  // strict YYYY-MM-DD check
  isISO(dateISO){
    return typeof dateISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateISO);
  },

  // returns a Date at local midnight, or null if invalid
  parseISO(dateISO){
    if(!this.isISO(dateISO)) return null;
    const d = new Date(dateISO + "T00:00:00");
    return Number.isFinite(d.getTime()) ? d : null;
  },

  todayISO(){
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  },

  // weekStartsOn: "mon" | "sun"
  startOfWeekISO(dateISO, weekStartsOn){
    // ✅ guard: if we ever get garbage, fall back to today (prevents NaN/Invalid Date cascades)
    const baseISO = this.isISO(dateISO) ? dateISO : this.todayISO();
    const d = new Date(baseISO + "T00:00:00");

    const dow = d.getDay(); // 0=Sun..6=Sat
    const weekStart = (weekStartsOn === "sun") ? 0 : 1;

    let diff = dow - weekStart;
    if(diff < 0) diff += 7;

    d.setDate(d.getDate() - diff);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  },

  addDaysISO(dateISO, days){
    const baseISO = this.isISO(dateISO) ? dateISO : this.todayISO();
    const d = new Date(baseISO + "T00:00:00");
    d.setDate(d.getDate() + (Number(days) || 0));
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  },

  sameISO(a,b){ return String(a) === String(b); },

  // convenience: "Feb 15"
  formatShort(dateISO){
    const d = this.parseISO(dateISO);
    if(!d) return "—";
    return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  }
};
        /********************
     * Settings helpers (added)
     ********************/
    function bytesToNice(bytes){
      const n = Number(bytes || 0);
      if(!isFinite(n) || n <= 0) return "0 B";
      const units = ["B","KB","MB","GB","TB"];
      let v = n;
      let i = 0;
      while(v >= 1024 && i < units.length-1){
        v /= 1024;
        i++;
      }
      const dp = (i === 0) ? 0 : (v >= 10 ? 1 : 2);
      return `${v.toFixed(dp)} ${units[i]}`;
    }

    function appStorageBytes(){
      // Approximate localStorage usage for this origin
      let total = 0;
      try{
        for(let i=0; i<localStorage.length; i++){
          const k = localStorage.key(i);
          const v = localStorage.getItem(k) || "";
          total += (k ? k.length : 0) + v.length;
        }
      }catch(e){
        // If storage is blocked, just report 0
        total = 0;
      }
      // JS strings are ~2 bytes/char in UTF-16
      return total * 2;
    }

    function confirmModal({ title="Confirm", message="Are you sure?", confirmText="Confirm", danger=false, onConfirm }){
      const btnClass = danger ? "btn danger" : "btn primary";
      Modal.open({
        title,
        bodyNode: el("div", {}, [
          el("div", { class:"note", text: message }),
          el("div", { style:"height:12px" }),
          el("div", { class:"btnrow" }, [
            el("button", { class:"btn", onClick: Modal.close }, ["Cancel"]),
            el("button", {
              class: btnClass,
              onClick: () => {
                try{ if(typeof onConfirm === "function") onConfirm(); }
                finally{ Modal.close(); }
              }
            }, [confirmText])
          ])
        ])
      });
    }

    function getTodayWorkout(){
      const routine = Routines.getActive();
      if(!routine || !(routine.days?.length)) return { routine: null, day: null, dayIndex: null };

      const today = new Date();
      const idx = today.getDay(); // 0=Sun..6=Sat
      // Our routine days are stored order 0..6 (Day 1..Day 7)
      const day = routine.days.find(d => d.order === idx) || routine.days[idx] || null;
      return { routine, day, dayIndex: idx };
    }

    function isTrained(dateISO){
      return (state.attendance || []).includes(dateISO);
    }

    function toggleTrained(dateISO){
      state.attendance = state.attendance || [];
      const i = state.attendance.indexOf(dateISO);
      if(i >= 0) state.attendance.splice(i, 1);
      else state.attendance.push(dateISO);
      Storage.save(state);
    }
    /********************
     * Attendance Helpers (Step 9)
     ********************/
    function ymFromISO(dateISO){
      const [y,m] = String(dateISO).split("-").map(x => parseInt(x,10));
      return { y, m }; // m = 1..12
    }

    function monthTitle(y, m){
      const d = new Date(y, m-1, 1);
      return d.toLocaleString(undefined, { month:"long", year:"numeric" });
    }

    function daysInMonth(y, m){
      return new Date(y, m, 0).getDate(); // m is 1..12
    }

    function firstDayDow(y, m){
      return new Date(y, m-1, 1).getDay(); // 0=Sun..6=Sat
    }

    function isoForYMD(y, m, d){
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    const AttendanceEngine = {
      ensure(){
        state.attendance = state.attendance || [];
      },
      monthCount(y, m){
        this.ensure();
        const prefix = `${y}-${pad2(m)}-`;
        return state.attendance.filter(x => String(x).startsWith(prefix)).length;
      },
      clearMonth(y, m){
        this.ensure();
        const prefix = `${y}-${pad2(m)}-`;
        state.attendance = state.attendance.filter(x => !String(x).startsWith(prefix));
        Storage.save(state);
      }
    };

    const normName = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();

    /********************
     * 3) Routine templates
     ********************/
const RoutineTemplates = [
      // 🔥 PPL (Push / Pull / Legs) — 6 Days + Rest (Sunday)
      { key:"ppl", name:"PPL", desc:"Push / Pull / Legs • 6 days + Sunday rest",
        buildDays(){ return [
          { label:"Push", isRest:false },{ label:"Pull", isRest:false },{ label:"Legs", isRest:false },
          { label:"Push", isRest:false },{ label:"Pull", isRest:false },{ label:"Legs", isRest:false },
          { label:"Rest", isRest:true }
        ];},
        buildExerciseIndexMap(){ return ({
          0: [ // Push (Mon)
            { type:"weightlifting", name:"Barbell Bench Press", plan:{ sets:4, reps:"6–8", restSec:120 } },
            { type:"weightlifting", name:"Incline Dumbbell Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Shoulder Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Lateral Raise", plan:{ sets:3, reps:"12–15", restSec:60 } },
            { type:"weightlifting", name:"Cable Tricep Pushdown", plan:{ sets:3, reps:"10–12", restSec:60 } },
            { type:"weightlifting", name:"Overhead Tricep Extension", plan:{ sets:3, reps:"10–12", restSec:60 } }
          ],
          1: [ // Pull (Tue)
            { type:"weightlifting", name:"Barbell Deadlift", plan:{ sets:3, reps:"5", restSec:180 } },
            { type:"weightlifting", name:"Lat Pulldown", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Barbell Bent Over Row", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Face Pull", plan:{ sets:3, reps:"12–15", restSec:60 } },
            { type:"weightlifting", name:"Barbell Curl", plan:{ sets:3, reps:"8–10", restSec:60 } },
            { type:"weightlifting", name:"Hammer Curl", plan:{ sets:3, reps:"10–12", restSec:60 } }
          ],
          2: [ // Legs (Wed)
            { type:"weightlifting", name:"Back Squat", plan:{ sets:4, reps:"6–8", restSec:180 } },
            { type:"weightlifting", name:"Leg Press", plan:{ sets:3, reps:"8–10", restSec:120 } },
            { type:"weightlifting", name:"Romanian Deadlift", plan:{ sets:3, reps:"8–10", restSec:120 } },
            { type:"weightlifting", name:"Leg Curl", plan:{ sets:3, reps:"10–12", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Walking Lunge", plan:{ sets:3, reps:"10 each leg", restSec:90 } },
            { type:"weightlifting", name:"Seated Calf Raise", plan:{ sets:4, reps:"12–15", restSec:60 } }
          ],
          3: [ // Push (Thu) — repeat
            { type:"weightlifting", name:"Barbell Bench Press", plan:{ sets:4, reps:"6–8", restSec:120 } },
            { type:"weightlifting", name:"Incline Dumbbell Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Shoulder Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Lateral Raise", plan:{ sets:3, reps:"12–15", restSec:60 } },
            { type:"weightlifting", name:"Cable Tricep Pushdown", plan:{ sets:3, reps:"10–12", restSec:60 } },
            { type:"weightlifting", name:"Overhead Tricep Extension", plan:{ sets:3, reps:"10–12", restSec:60 } }
          ],
          4: [ // Pull (Fri) — repeat
            { type:"weightlifting", name:"Barbell Deadlift", plan:{ sets:3, reps:"5", restSec:180 } },
            { type:"weightlifting", name:"Lat Pulldown", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Barbell Bent Over Row", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Face Pull", plan:{ sets:3, reps:"12–15", restSec:60 } },
            { type:"weightlifting", name:"Barbell Curl", plan:{ sets:3, reps:"8–10", restSec:60 } },
            { type:"weightlifting", name:"Hammer Curl", plan:{ sets:3, reps:"10–12", restSec:60 } }
          ],
          5: [ // Legs (Sat) — repeat
            { type:"weightlifting", name:"Back Squat", plan:{ sets:4, reps:"6–8", restSec:180 } },
            { type:"weightlifting", name:"Leg Press", plan:{ sets:3, reps:"8–10", restSec:120 } },
            { type:"weightlifting", name:"Romanian Deadlift", plan:{ sets:3, reps:"8–10", restSec:120 } },
            { type:"weightlifting", name:"Leg Curl", plan:{ sets:3, reps:"10–12", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Walking Lunge", plan:{ sets:3, reps:"10 each leg", restSec:90 } },
            { type:"weightlifting", name:"Seated Calf Raise", plan:{ sets:4, reps:"12–15", restSec:60 } }
          ]
        });}
      },

      // 💪 Upper / Lower Split (4 Days)
      { key:"upper_lower", name:"Upper / Lower", desc:"4 days • Wed + weekend rest",
        buildDays(){ return [
          { label:"Upper", isRest:false },{ label:"Lower", isRest:false },{ label:"Rest", isRest:true },
          { label:"Upper", isRest:false },{ label:"Lower", isRest:false },{ label:"Rest", isRest:true },
          { label:"Rest", isRest:true }
        ];},
        buildExerciseIndexMap(){ return ({
          0: [ // Upper (Mon)
            { type:"weightlifting", name:"Barbell Bench Press", plan:{ sets:4, reps:"6–8", restSec:120 } },
            { type:"weightlifting", name:"Barbell Bent Over Row", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Shoulder Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Lat Pulldown", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Barbell Curl", plan:{ sets:3, reps:"10–12", restSec:60 } },
            { type:"weightlifting", name:"Cable Tricep Pushdown", plan:{ sets:3, reps:"10–12", restSec:60 } }
          ],
          1: [ // Lower (Tue)
            { type:"weightlifting", name:"Back Squat", plan:{ sets:4, reps:"6–8", restSec:180 } },
            { type:"weightlifting", name:"Romanian Deadlift", plan:{ sets:3, reps:"8–10", restSec:120 } },
            { type:"weightlifting", name:"Leg Press", plan:{ sets:3, reps:"10", restSec:120 } },
            { type:"weightlifting", name:"Dumbbell Step-Up", plan:{ sets:3, reps:"10 each leg", restSec:90 } },
            { type:"weightlifting", name:"Seated Calf Raise", plan:{ sets:4, reps:"12–15", restSec:60 } }
          ],
          3: [ // Upper (Thu) — repeat
            { type:"weightlifting", name:"Barbell Bench Press", plan:{ sets:4, reps:"6–8", restSec:120 } },
            { type:"weightlifting", name:"Barbell Bent Over Row", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Shoulder Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Lat Pulldown", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Barbell Curl", plan:{ sets:3, reps:"10–12", restSec:60 } },
            { type:"weightlifting", name:"Cable Tricep Pushdown", plan:{ sets:3, reps:"10–12", restSec:60 } }
          ],
          4: [ // Lower (Fri) — repeat
            { type:"weightlifting", name:"Back Squat", plan:{ sets:4, reps:"6–8", restSec:180 } },
            { type:"weightlifting", name:"Romanian Deadlift", plan:{ sets:3, reps:"8–10", restSec:120 } },
            { type:"weightlifting", name:"Leg Press", plan:{ sets:3, reps:"10", restSec:120 } },
            { type:"weightlifting", name:"Dumbbell Step-Up", plan:{ sets:3, reps:"10 each leg", restSec:90 } },
            { type:"weightlifting", name:"Seated Calf Raise", plan:{ sets:4, reps:"12–15", restSec:60 } }
          ]
        });}
      },

      // 🏋️ Full Body (3 Days)
      { key:"full_body_3", name:"Full Body (3-day)", desc:"3 days • A/B/C • Wed + weekend rest",
        buildDays(){ return [
          { label:"Full Body A", isRest:false },{ label:"Rest", isRest:true },
          { label:"Full Body B", isRest:false },{ label:"Rest", isRest:true },
          { label:"Full Body C", isRest:false },{ label:"Rest", isRest:true },{ label:"Rest", isRest:true }
        ];},
        buildExerciseIndexMap(){ return ({
          0: [ // A (Mon)
            { type:"weightlifting", name:"Back Squat", plan:{ sets:4, reps:"5", restSec:180 } },
            { type:"weightlifting", name:"Barbell Bench Press", plan:{ sets:4, reps:"6–8", restSec:120 } },
            { type:"weightlifting", name:"Barbell Bent Over Row", plan:{ sets:3, reps:"8", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Lateral Raise", plan:{ sets:3, reps:"12–15", restSec:60 } },
            { type:"core", name:"Plank", plan:{ sets:3, reps:"30–45 sec", restSec:45 } }
          ],
          2: [ // B (Wed)
            { type:"weightlifting", name:"Barbell Deadlift", plan:{ sets:3, reps:"5", restSec:180 } },
            { type:"weightlifting", name:"Incline Dumbbell Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Lat Pulldown", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Walking Lunge", plan:{ sets:3, reps:"10 each leg", restSec:90 } },
            { type:"core", name:"Hanging Leg Raise", plan:{ sets:3, reps:"12", restSec:45 } }
          ],
          4: [ // C (Fri)
            { type:"weightlifting", name:"Front Squat", plan:{ sets:4, reps:"6", restSec:180 } },
            { type:"weightlifting", name:"Dumbbell Shoulder Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Cable Row", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Leg Curl", plan:{ sets:3, reps:"10–12", restSec:90 } },
            { type:"core", name:"Russian Twist", plan:{ sets:3, reps:"20 total", restSec:45 } }
          ]
        });}
      },

      // 🧱 Body Part Split (Classic Bro Split – 5 Days)
      { key:"body_part_split", name:"Body Part Split", desc:"Chest/Back/Legs/Shoulders/Arms • weekend rest",
        buildDays(){ return [
          { label:"Chest", isRest:false },{ label:"Back", isRest:false },{ label:"Legs", isRest:false },
          { label:"Shoulders", isRest:false },{ label:"Arms", isRest:false },
          { label:"Rest", isRest:true },{ label:"Rest", isRest:true }
        ];},
        buildExerciseIndexMap(){ return ({
          0: [ // Chest
            { type:"weightlifting", name:"Barbell Bench Press", plan:{ sets:4, reps:"6–8", restSec:120 } },
            { type:"weightlifting", name:"Incline Dumbbell Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Cable Chest Fly", plan:{ sets:3, reps:"12", restSec:60 } },
            { type:"weightlifting", name:"Pec Deck", plan:{ sets:3, reps:"12", restSec:60 } }
          ],
          1: [ // Back
            { type:"weightlifting", name:"Barbell Deadlift", plan:{ sets:3, reps:"5", restSec:180 } },
            { type:"weightlifting", name:"Lat Pulldown", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Barbell Bent Over Row", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Seated Row", plan:{ sets:3, reps:"10", restSec:90 } }
          ],
          2: [ // Legs
            { type:"weightlifting", name:"Back Squat", plan:{ sets:4, reps:"6–8", restSec:180 } },
            { type:"weightlifting", name:"Leg Press", plan:{ sets:3, reps:"10", restSec:120 } },
            { type:"weightlifting", name:"Romanian Deadlift", plan:{ sets:3, reps:"8–10", restSec:120 } },
            { type:"weightlifting", name:"Leg Curl", plan:{ sets:3, reps:"12", restSec:90 } },
            { type:"weightlifting", name:"Seated Calf Raise", plan:{ sets:4, reps:"15", restSec:60 } }
          ],
          3: [ // Shoulders
            { type:"weightlifting", name:"Barbell Overhead Press", plan:{ sets:4, reps:"6–8", restSec:120 } },
            { type:"weightlifting", name:"Arnold Press", plan:{ sets:3, reps:"8–10", restSec:90 } },
            { type:"weightlifting", name:"Dumbbell Lateral Raise", plan:{ sets:3, reps:"15", restSec:60 } },
            { type:"weightlifting", name:"Face Pull", plan:{ sets:3, reps:"15", restSec:60 } }
          ],
          4: [ // Arms
            { type:"weightlifting", name:"Barbell Curl", plan:{ sets:3, reps:"8–10", restSec:60 } },
            { type:"weightlifting", name:"Incline Dumbbell Curl", plan:{ sets:3, reps:"10–12", restSec:60 } },
            { type:"weightlifting", name:"Cable Tricep Pushdown", plan:{ sets:3, reps:"10–12", restSec:60 } },
            { type:"weightlifting", name:"Overhead Tricep Extension", plan:{ sets:3, reps:"10–12", restSec:60 } },
            { type:"weightlifting", name:"Hammer Curl", plan:{ sets:3, reps:"12", restSec:60 } }
          ]
        });}
      },

      { key:"blank", name:"Blank", desc:"Start from scratch (you’ll edit days + exercises)",
        buildDays(){ return [
          { label:"Day 1", isRest:false },{ label:"Day 2", isRest:false },{ label:"Day 3", isRest:false },
          { label:"Day 4", isRest:false },{ label:"Day 5", isRest:false },{ label:"Day 6", isRest:false },
          { label:"Day 7", isRest:false }
        ];}}
    ];
      function createRoutineFromTemplate(templateKey, routineName){
      const tpl = RoutineTemplates.find(t => t.key === templateKey);
      if(!tpl) throw new Error("Invalid template key");

      // Ensure library exists so we can resolve IDs by name
      try{ ExerciseLibrary.ensureSeeded(); }catch(e){ /* safe */ }

      const routineId = uid("rt");
      const days = tpl.buildDays().map((d, idx) => ({
        id: uid("day"),
        order: idx,
        label: d.label,
        isRest: !!d.isRest,
        exercises: []
      }));

      // Helper: resolve exercise by name in library (by type)
      function findLibItem(type, name){
        const arr = (state.exerciseLibrary?.[type] || []);
        const n = normName(name);
        return arr.find(x => normName(x.name) === n) || null;
      }

      // Seed exercises if provided by template
      if(typeof tpl.buildExerciseIndexMap === "function"){
        const map = tpl.buildExerciseIndexMap() || {};
        Object.keys(map).forEach(k => {
          const idx = Number(k);
          const day = days[idx];
          if(!day || day.isRest) return;

          const items = map[k] || [];
          day.exercises = items.map(item => {
            const libItem = findLibItem(item.type, item.name);
            return {
              id: uid("rx"),
              exerciseId: libItem?.id || null,
              type: item.type,
              nameSnap: libItem?.name || item.name,
              plan: item.plan || null,        // { sets, reps, restSec }
              createdAt: Date.now()
            };
          });
        });
      }

      return {
        id: routineId,
        name: routineName || tpl.name,
        templateKey: tpl.key,
        createdAt: Date.now(),
        days
      };
    }
        // ────────────────────────────
    // Repair: backfill missing exerciseId links
    // - Fixes routines created before library seeding
    // - Fixes logs saved with exerciseId:null
    // ────────────────────────────
    function repairExerciseLinks(){
      let changed = false;

      // Ensure structures exist
      state.routines = state.routines || [];
      state.logs = state.logs || { workouts: [], weight: [], protein: [] };
      state.logs.workouts = state.logs.workouts || [];

      function findLibByName(type, name){
        const n = normName(name || "");
        if(!n) return null;
        return (state.exerciseLibrary?.[type] || []).find(x => normName(x.name) === n) || null;
      }

      function findRoutineExercise(routineId, routineExerciseId){
        const r = (state.routines || []).find(rr => rr.id === routineId);
        if(!r) return null;
        for(const d of (r.days || [])){
          const rx = (d.exercises || []).find(e => e.id === routineExerciseId);
          if(rx) return rx;
        }
        return null;
      }

      // 1) Repair routine exercises: fill missing exerciseId from library using nameSnap
      for(const r of (state.routines || [])){
        for(const d of (r.days || [])){
          for(const rx of (d.exercises || [])){
            if(rx && !rx.exerciseId){
              const libItem = findLibByName(rx.type, rx.nameSnap);
              if(libItem){
                rx.exerciseId = libItem.id;
                rx.nameSnap = libItem.name; // keep snap aligned
                changed = true;
              }
            }
          }
        }
      }

      // 2) Repair workout logs: fill missing exerciseId by looking up the routineExercise
      for(const e of (state.logs.workouts || [])){
        if(e && !e.exerciseId){
          const rx = findRoutineExercise(e.routineId, e.routineExerciseId);
          if(rx?.exerciseId){
            e.exerciseId = rx.exerciseId;
            changed = true;
          }else if(rx?.nameSnap){
            const libItem = findLibByName(e.type, rx.nameSnap);
            if(libItem){
              e.exerciseId = libItem.id;
              changed = true;
            }
          }
        }
      }

      if(changed) Storage.save(state);
      return changed;
    }
    /********************
     * 4) Exercise Library Module (Step 3)
     ********************/
    const ExerciseLibrary = {
      typeKeys: ["weightlifting","cardio","core"],
      typeLabel(type){
        if(type === "weightlifting") return "Weightlifting";
        if(type === "cardio") return "Cardio";
        return "Core";
      },
      ensureSeeded(){
        // Only seed if ALL empty
        const lib = state.exerciseLibrary || (state.exerciseLibrary = { weightlifting:[], cardio:[], core:[] });
        const empty = (lib.weightlifting?.length||0) === 0 && (lib.cardio?.length||0) === 0 && (lib.core?.length||0) === 0;

        if(empty){
          // ===================================================
// COPY-PASTE JSON LIBS (Weightlifting / Core / Cardio)
// Format per item:
// { id, type, name, equipment, primaryMuscle, secondaryMuscles, createdAt }
// ===================================================

lib.weightlifting = [
  // --- Barbell ---
  { id: uid("ex"), type:"weightlifting", name:"Barbell Bench Press", equipment:"Barbell", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Incline Barbell Bench Press", equipment:"Barbell", primaryMuscle:"Chest", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Decline Barbell Bench Press", equipment:"Barbell", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Close-Grip Bench Press", equipment:"Barbell", primaryMuscle:"Arms", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Floor Press", equipment:"Barbell", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Barbell Overhead Press", equipment:"Barbell", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Upright Row", equipment:"Barbell", primaryMuscle:"Shoulders", secondaryMuscles:["Traps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Push Press", equipment:"Barbell", primaryMuscle:"Shoulders", secondaryMuscles:["Legs"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Landmine Press", equipment:"Barbell", primaryMuscle:"Shoulders", secondaryMuscles:["Chest"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Barbell Bent Over Row", equipment:"Barbell", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Pendlay Row", equipment:"Barbell", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Incline Row", equipment:"Barbell", primaryMuscle:"Back", secondaryMuscles:["Rear Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Landmine Row", equipment:"Barbell", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Barbell Deadlift", equipment:"Barbell", primaryMuscle:"Full Body", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Rack Pull", equipment:"Barbell", primaryMuscle:"Back", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Romanian Deadlift", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Hamstrings"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Good Morning", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Hamstrings"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Sumo Deadlift", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Back Squat", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Front Squat", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Hack Squat", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Lunge", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Reverse Lunge", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Hip Thrust", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Glute Bridge", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Calf Raise", equipment:"Barbell", primaryMuscle:"Legs", secondaryMuscles:["Calves"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Barbell Curl", equipment:"Barbell", primaryMuscle:"Arms", secondaryMuscles:["Biceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Reverse Curl", equipment:"Barbell", primaryMuscle:"Arms", secondaryMuscles:["Forearms"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Barbell Skull Crusher", equipment:"Barbell", primaryMuscle:"Arms", secondaryMuscles:["Triceps"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Barbell Thruster", equipment:"Barbell", primaryMuscle:"Full Body", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Power Clean", equipment:"Barbell", primaryMuscle:"Full Body", secondaryMuscles:["Legs"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Hang Clean", equipment:"Barbell", primaryMuscle:"Full Body", secondaryMuscles:["Legs"], createdAt:Date.now() },

  // --- Dumbbell ---
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Bench Press", equipment:"Dumbbell", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Incline Dumbbell Press", equipment:"Dumbbell", primaryMuscle:"Chest", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Decline Dumbbell Press", equipment:"Dumbbell", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Fly", equipment:"Dumbbell", primaryMuscle:"Chest", secondaryMuscles:["Chest"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Pullover", equipment:"Dumbbell", primaryMuscle:"Chest", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Floor Press", equipment:"Dumbbell", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Shoulder Press", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Arnold Press", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Front Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Lateral Raise", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Side Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Front Raise", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Front Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Rear Delt Fly", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Rear Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Incline Lateral Raise", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Side Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Z Press", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Core"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell High Pull", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Traps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Shrug", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Traps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Reverse Fly", equipment:"Dumbbell", primaryMuscle:"Shoulders", secondaryMuscles:["Rear Delts"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Single-Arm Dumbbell Row", equipment:"Dumbbell", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Chest Supported Row", equipment:"Dumbbell", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Goblet Squat", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Lunge", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Walking Lunge", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Bulgarian Split Squat", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Reverse Lunge", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Step-Up", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Romanian Deadlift", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Hamstrings"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Sumo Squat", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Hip Thrust", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Glute Bridge", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Calf Raise", equipment:"Dumbbell", primaryMuscle:"Legs", secondaryMuscles:["Calves"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Curl", equipment:"Dumbbell", primaryMuscle:"Arms", secondaryMuscles:["Biceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Incline Dumbbell Curl", equipment:"Dumbbell", primaryMuscle:"Arms", secondaryMuscles:["Biceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Hammer Curl", equipment:"Dumbbell", primaryMuscle:"Arms", secondaryMuscles:["Brachialis"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Concentration Curl", equipment:"Dumbbell", primaryMuscle:"Arms", secondaryMuscles:["Biceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Overhead Tricep Extension", equipment:"Dumbbell", primaryMuscle:"Arms", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Skull Crusher", equipment:"Dumbbell", primaryMuscle:"Arms", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Tricep Kickback", equipment:"Dumbbell", primaryMuscle:"Arms", secondaryMuscles:["Triceps"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Thruster", equipment:"Dumbbell", primaryMuscle:"Full Body", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Snatch", equipment:"Dumbbell", primaryMuscle:"Full Body", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Clean and Press", equipment:"Dumbbell", primaryMuscle:"Full Body", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Swings", equipment:"Dumbbell", primaryMuscle:"Full Body", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Farmers Carry", equipment:"Dumbbell", primaryMuscle:"Full Body", secondaryMuscles:["Forearms"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dumbbell Suitcase Carry", equipment:"Dumbbell", primaryMuscle:"Full Body", secondaryMuscles:["Obliques"], createdAt:Date.now() },

  // --- Machines ---
  { id: uid("ex"), type:"weightlifting", name:"Chest Press", equipment:"Machine", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Pec Deck", equipment:"Machine", primaryMuscle:"Chest", secondaryMuscles:["Chest"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Machine Chest Fly", equipment:"Machine", primaryMuscle:"Chest", secondaryMuscles:["Chest"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Lat Pulldown", equipment:"Machine", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Seated Row", equipment:"Machine", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Assisted Pull-Up", equipment:"Machine", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Leg Press", equipment:"Machine", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Hack Squat Machine", equipment:"Machine", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Smith Machine Squat", equipment:"Smith Machine", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Leg Extension", equipment:"Machine", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Leg Curl", equipment:"Machine", primaryMuscle:"Legs", secondaryMuscles:["Hamstrings"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Hip Abduction Machine", equipment:"Machine", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Hip Adduction Machine", equipment:"Machine", primaryMuscle:"Legs", secondaryMuscles:["Adductors"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Seated Calf Raise", equipment:"Machine", primaryMuscle:"Legs", secondaryMuscles:["Calves"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Standing Calf Raise Machine", equipment:"Machine", primaryMuscle:"Legs", secondaryMuscles:["Calves"], createdAt:Date.now() },

  { id: uid("ex"), type:"weightlifting", name:"Machine Shoulder Press", equipment:"Machine", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Machine Preacher Curl", equipment:"Machine", primaryMuscle:"Arms", secondaryMuscles:["Biceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Machine Tricep Dip", equipment:"Machine", primaryMuscle:"Arms", secondaryMuscles:["Triceps"], createdAt:Date.now() },

  // --- Cable (Weightlifting) ---
  { id: uid("ex"), type:"weightlifting", name:"Cable Chest Fly", equipment:"Cable", primaryMuscle:"Chest", secondaryMuscles:["Chest"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Crossover", equipment:"Cable", primaryMuscle:"Chest", secondaryMuscles:["Chest"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Row", equipment:"Cable", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Face Pull", equipment:"Cable", primaryMuscle:"Shoulders", secondaryMuscles:["Rear Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Lateral Raise", equipment:"Cable", primaryMuscle:"Shoulders", secondaryMuscles:["Side Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Front Raise", equipment:"Cable", primaryMuscle:"Shoulders", secondaryMuscles:["Front Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Reverse Fly", equipment:"Cable", primaryMuscle:"Shoulders", secondaryMuscles:["Rear Delts"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Upright Row", equipment:"Cable", primaryMuscle:"Shoulders", secondaryMuscles:["Traps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Tricep Pushdown", equipment:"Cable", primaryMuscle:"Arms", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Overhead Tricep Extension", equipment:"Cable", primaryMuscle:"Arms", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Bicep Curl", equipment:"Cable", primaryMuscle:"Arms", secondaryMuscles:["Biceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Kickback", equipment:"Cable", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Cable Pull-Through", equipment:"Cable", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },

  // --- Bodyweight ---
  { id: uid("ex"), type:"weightlifting", name:"Push-Up", equipment:"Bodyweight", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Pull-Up", equipment:"Bodyweight", primaryMuscle:"Back", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Chin-Up", equipment:"Bodyweight", primaryMuscle:"Back", secondaryMuscles:["Biceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Dips", equipment:"Bodyweight", primaryMuscle:"Chest", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Pike Push-Up", equipment:"Bodyweight", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Bodyweight Squat", equipment:"Bodyweight", primaryMuscle:"Legs", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Nordic Hamstring Curl", equipment:"Bodyweight", primaryMuscle:"Legs", secondaryMuscles:["Hamstrings"], createdAt:Date.now() },
  { id: uid("ex"), type:"weightlifting", name:"Glute Bridge", equipment:"Bodyweight", primaryMuscle:"Legs", secondaryMuscles:["Glutes"], createdAt:Date.now() },
];

lib.cardio = [
  { id: uid("ex"), type:"cardio", name:"Treadmill Run", equipment:"Treadmill", primaryMuscle:"Cardio", secondaryMuscles:["Legs"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Incline Walk", equipment:"Treadmill", primaryMuscle:"Cardio", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Sprint Intervals", equipment:"Track/Treadmill", primaryMuscle:"Cardio", secondaryMuscles:["Legs"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Outdoor Run", equipment:"Outdoor", primaryMuscle:"Cardio", secondaryMuscles:["Legs"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Stairmaster", equipment:"Machine", primaryMuscle:"Cardio", secondaryMuscles:["Glutes"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Stationary Bike", equipment:"Bike", primaryMuscle:"Cardio", secondaryMuscles:["Quads"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Assault Bike", equipment:"Bike", primaryMuscle:"Cardio", secondaryMuscles:["Full Body"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Row Machine", equipment:"Rower", primaryMuscle:"Cardio", secondaryMuscles:["Back"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Row Sprint", equipment:"Rower", primaryMuscle:"Cardio", secondaryMuscles:["Full Body"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Ski Erg", equipment:"Machine", primaryMuscle:"Cardio", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Elliptical", equipment:"Machine", primaryMuscle:"Cardio", secondaryMuscles:["Legs"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Battle Ropes", equipment:"Ropes", primaryMuscle:"Cardio", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Sled Push", equipment:"Sled", primaryMuscle:"Cardio", secondaryMuscles:["Legs"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Sled Pull", equipment:"Sled", primaryMuscle:"Cardio", secondaryMuscles:["Back"], createdAt:Date.now() },
  { id: uid("ex"), type:"cardio", name:"Jump Rope", equipment:"Rope", primaryMuscle:"Cardio", secondaryMuscles:["Calves"], createdAt:Date.now() },
];

lib.core = [
  { id: uid("ex"), type:"core", name:"Plank", equipment:"Bodyweight", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Side Plank", equipment:"Bodyweight", primaryMuscle:"Core", secondaryMuscles:["Obliques"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Weighted Sit-Up", equipment:"Plate", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Russian Twist", equipment:"Plate/Dumbbell", primaryMuscle:"Core", secondaryMuscles:["Obliques"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Dumbbell Side Bend", equipment:"Dumbbell", primaryMuscle:"Core", secondaryMuscles:["Obliques"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Renegade Row", equipment:"Dumbbell", primaryMuscle:"Core", secondaryMuscles:["Lats"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Plank Pull-Through", equipment:"Dumbbell", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Hanging Leg Raise", equipment:"Bar", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Hanging Knee Raise", equipment:"Bar", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Weighted Leg Raise", equipment:"Plate", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Bicycle Crunch", equipment:"Bodyweight", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Decline Sit-Up", equipment:"Bench", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Ab Wheel Rollout", equipment:"Ab Wheel", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Stability Ball Crunch", equipment:"Stability Ball", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Stability Ball Rollout", equipment:"Stability Ball", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Barbell Rollout", equipment:"Barbell", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Barbell Overhead Hold", equipment:"Barbell", primaryMuscle:"Core", secondaryMuscles:["Shoulders"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Landmine Rotation", equipment:"Barbell", primaryMuscle:"Core", secondaryMuscles:["Obliques"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"V-Up", equipment:"Bodyweight", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Hollow Body Hold", equipment:"Bodyweight", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Dragon Flag", equipment:"Bench", primaryMuscle:"Core", secondaryMuscles:["Abs"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Medicine Ball Slam", equipment:"Medicine Ball", primaryMuscle:"Core", secondaryMuscles:["Full Body"], createdAt:Date.now() },
  { id: uid("ex"), type:"core", name:"Medicine Ball Russian Twist", equipment:"Medicine Ball", primaryMuscle:"Core", secondaryMuscles:["Obliques"], createdAt:Date.now() },
];

        }

        // Always attempt to repair links (covers older data / edge cases)
        const repaired = repairExerciseLinks();

        // Save if we seeded OR repaired anything
        if(empty || repaired) Storage.save(state);
      },

      list(type){
        return (state.exerciseLibrary?.[type] || []);
      },
            list(type){
        return (state.exerciseLibrary?.[type] || []);
      },

      // Category-only check (kept for UI filters, but add/update will enforce GLOBAL)
      existsByName(type, name, excludeId=null){
        const n = normName(name);
        return this.list(type).some(x => normName(x.name) === n && x.id !== excludeId);
      },

      // ✅ NEW: global check across ALL types
      existsByNameGlobal(name, excludeId=null){
        const n = normName(name);
        for(const t of this.typeKeys){
          if(this.list(t).some(x => normName(x.name) === n && x.id !== excludeId)) return true;
        }
        return false;
      },

      add(type, data){
        // ✅ GLOBAL duplicate prevention (no cross-type duplicates)
        if(this.existsByNameGlobal(data.name)) throw new Error("Exercise already exists in your library.");
        const ex = { id: uid("ex"), type, createdAt: Date.now(), ...data };
        state.exerciseLibrary[type].push(ex);
        Storage.save(state);
        return ex;
      },

      // ✅ NEW: add while preserving a specific id (needed when changing Type during Edit)
      addWithId(type, ex){
        if(!ex?.id) throw new Error("Missing exercise id.");
        if(this.existsByNameGlobal(ex.name, ex.id)) throw new Error("Exercise already exists in your library.");
        const next = { ...ex, type };
        state.exerciseLibrary[type].push(next);
        Storage.save(state);
        return next;
      },

      update(type, id, patch){
        const arr = this.list(type);
        const idx = arr.findIndex(x => x.id === id);
        if(idx < 0) throw new Error("Exercise not found.");

        const nextName = (patch?.name ?? arr[idx].name);
        // ✅ GLOBAL duplicate prevention (exclude self)
        if(this.existsByNameGlobal(nextName, id)) throw new Error("Another exercise with that name already exists.");

        // Normalize secondaryMuscles to an array if provided
        let nextPatch = { ...patch };
        if("secondaryMuscles" in nextPatch){
          const sm = nextPatch.secondaryMuscles;
          nextPatch.secondaryMuscles = Array.isArray(sm) ? sm.filter(Boolean) : [];
        }

        arr[idx] = { ...arr[idx], ...nextPatch };
        Storage.save(state);
        return arr[idx];
      },

      remove(type, id){
        const arr = this.list(type);
        const idx = arr.findIndex(x => x.id === id);
        if(idx < 0) return;
        arr.splice(idx, 1);
        Storage.save(state);
      }
    };

        /********************
     * 4b) Routine Engine (Step 4)
     ********************/
    const Routines = {
      getAll(){ return state.routines || (state.routines = []); },
      getActive(){
        const id = state.activeRoutineId;
        return this.getAll().find(r => r.id === id) || null;
      },
      setActive(id){
        state.activeRoutineId = id;
        Storage.save(state);
      },
      addFromTemplate(templateKey, nameOverride=null){
        ExerciseLibrary.ensureSeeded();
        const tplName = RoutineTemplates.find(t => t.key === templateKey)?.name || "Routine";
        const routine = createRoutineFromTemplate(templateKey, nameOverride || tplName);
        this.getAll().push(routine);
        state.activeRoutineId = routine.id;
        Storage.save(state);
        return routine;
      },
      duplicate(routineId){
        const r = this.getAll().find(x => x.id === routineId);
        if(!r) throw new Error("Routine not found.");
        const copy = {
          ...r,
          id: uid("rt"),
          name: `${r.name} (Copy)`,
          createdAt: Date.now(),
          days: (r.days || []).map(d => ({
            ...d,
            id: uid("day"),
            exercises: (d.exercises || []).map(ex => ({ ...ex, id: uid("rx") }))
          }))
        };
        this.getAll().push(copy);
        state.activeRoutineId = copy.id;
        Storage.save(state);
        return copy;
      },
      remove(routineId){
        const arr = this.getAll();
        const idx = arr.findIndex(x => x.id === routineId);
        if(idx < 0) return;
        arr.splice(idx, 1);

        // If deleted active routine, pick next best
        if(state.activeRoutineId === routineId){
          state.activeRoutineId = arr[0]?.id || null;
        }
        Storage.save(state);
      },
      rename(routineId, newName){
        const r = this.getAll().find(x => x.id === routineId);
        if(!r) throw new Error("Routine not found.");
        r.name = (newName || "").trim() || r.name;
        Storage.save(state);
      },

      getDay(routineId, dayId){
        const r = this.getAll().find(x => x.id === routineId);
        if(!r) return null;
        return (r.days || []).find(d => d.id === dayId) || null;
      },

      setRestDay(routineId, dayId, isRest){
        const day = this.getDay(routineId, dayId);
        if(!day) throw new Error("Day not found.");
        day.isRest = !!isRest;
        Storage.save(state);
      },

      setDayLabel(routineId, dayId, label){
        const day = this.getDay(routineId, dayId);
        if(!day) throw new Error("Day not found.");
        day.label = (label || "").trim() || day.label;
        Storage.save(state);
      },

      addExerciseToDay(routineId, dayId, exType, exerciseId){
        const day = this.getDay(routineId, dayId);
        if(!day) throw new Error("Day not found.");
        const libItem = (state.exerciseLibrary?.[exType] || []).find(x => x.id === exerciseId);
        if(!libItem) throw new Error("Exercise not found in library.");
        day.exercises = day.exercises || [];
        day.exercises.push({
          id: uid("rx"),
          exerciseId,
          type: exType,
          nameSnap: libItem.name,
          createdAt: Date.now()
        });
        Storage.save(state);
      },

      removeExerciseFromDay(routineId, dayId, routineExerciseId){
        const day = this.getDay(routineId, dayId);
        if(!day) throw new Error("Day not found.");
        day.exercises = day.exercises || [];
        const idx = day.exercises.findIndex(x => x.id === routineExerciseId);
        if(idx >= 0) day.exercises.splice(idx, 1);
        Storage.save(state);
      }
    };

    // Shared helper for "Pick exercise" modals
    function resolveExerciseName(type, exerciseId, fallback){
      const found = (state.exerciseLibrary?.[type] || []).find(x => x.id === exerciseId);
      return found?.name || fallback || "Unknown exercise";
    }
   /********************
 * 4c) Protein (Today) Helpers (Step 5)
 * OPTION B: A date only exists if user logs >0g and saves
 ********************/

// ✅ Read-only lookup (never creates/saves)
function findProteinEntry(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];
  return state.logs.protein.find(x => x.dateISO === dateISO) || null;
}

// ✅ Write-path helper (creates ONLY when we truly need to save something)
function ensureProteinEntry(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];
  let entry = state.logs.protein.find(x => x.dateISO === dateISO);
  if(!entry){
    entry = { dateISO, meals: [] }; // meals: [{ id, label, grams }]
    state.logs.protein.push(entry);
    Storage.save(state);
  }
  return entry;
}

// ✅ If an entry has no meals, remove the entire day so it doesn't appear in history
function cleanupProteinEntryIfEmpty(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];

  const idx = state.logs.protein.findIndex(x => x.dateISO === dateISO);
  if(idx < 0) return;

  const entry = state.logs.protein[idx];
  const meals = Array.isArray(entry?.meals) ? entry.meals : [];
  if(meals.length === 0){
    state.logs.protein.splice(idx, 1);
    Storage.save(state);
  }
}

/********************
 * 4c) Protein (Today) Helpers (Step 5)
 * OPTION B: A date only exists if user logs >0g and saves
 ********************/

// ✅ Read-only lookup (never creates/saves)
function findProteinEntry(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];
  return state.logs.protein.find(x => x.dateISO === dateISO) || null;
}

// ✅ Write-path helper (creates ONLY when we truly need to save something)
function ensureProteinEntry(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];
  let entry = state.logs.protein.find(x => x.dateISO === dateISO);
  if(!entry){
    entry = { dateISO, meals: [] }; // meals: [{ id, label, grams }]
    state.logs.protein.push(entry);
    Storage.save(state);
  }
  return entry;
}

// ✅ If an entry has no meals, remove the entire day so it doesn't appear in history
function cleanupProteinEntryIfEmpty(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];

  const idx = state.logs.protein.findIndex(x => x.dateISO === dateISO);
  if(idx < 0) return;

  const entry = state.logs.protein[idx];
  const meals = Array.isArray(entry?.meals) ? entry.meals : [];
  if(meals.length === 0){
    state.logs.protein.splice(idx, 1);
    Storage.save(state);
  }
}

// ⚠️ Keep for compatibility (but this DOES create). Use only for write paths.
function getProteinForDate(dateISO){
  return ensureProteinEntry(dateISO);
}

// ✅ Save/update a meal:
// - If grams <= 0 → treat as "no log" and delete meal if it exists
// - If grams > 0 → create the day entry if missing and save
function upsertMeal(dateISO, mealId, label, grams){
  const cleanGrams = Math.max(0, Math.round(Number(grams) || 0));

  // ✅ If user sets 0g, this means "do not keep an entry"
  if(cleanGrams <= 0){
    if(mealId) deleteMeal(dateISO, mealId); // safe: won't create a day
    return null;
  }

  const p = ensureProteinEntry(dateISO);
  p.meals = p.meals || [];

  const idx = p.meals.findIndex(m => m.id === mealId);
  const clean = {
    id: mealId || uid("meal"),
    label: (label || "").trim() || "Meal",
    grams: cleanGrams
  };

  if(idx >= 0) p.meals[idx] = clean;
  else p.meals.push(clean);

  Storage.save(state);
  return clean.id;
}

// ✅ Delete a meal without creating the day.
// If last meal removed → delete the entire day entry.
function deleteMeal(dateISO, mealId){
  const p = findProteinEntry(dateISO);
  if(!p) return;

  p.meals = p.meals || [];
  const idx = p.meals.findIndex(m => m.id === mealId);
  if(idx >= 0) p.meals.splice(idx, 1);

  Storage.save(state);
  cleanupProteinEntryIfEmpty(dateISO);
}

// ✅ Read-only total (never creates/saves)
function totalProtein(dateISO){
  const p = findProteinEntry(dateISO);
  if(!p || !Array.isArray(p.meals)) return 0;
  return p.meals.reduce((sum,m) => sum + (Number(m.grams)||0), 0);
}

    function buildProteinTodayModal(dateISO, goal){
  const container = el("div", { class:"grid" });

  // ---- helpers ----
  const MEAL_LABELS = ["Morning", "Lunch", "Pre-Gym", "Dinner", "Bedtime"];
  dateISO = clampISO(dateISO); // ✅ ensures the modal always opens on a real day (defaults to today)

  function clampISO(s){
    // ✅ Accept YYYY-M-D or YYYY-MM-DD and normalize to YYYY-MM-DD
    const v = String(s || "").trim();
    const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(!m) return Dates.todayISO();

    const y  = m[1];
    const mo = String(m[2]).padStart(2, "0");
    const d  = String(m[3]).padStart(2, "0");

    const iso = `${y}-${mo}-${d}`;
    return Dates.isISO(iso) ? iso : Dates.todayISO();
  }

  function fmtPretty(dateISO){
    // ✅ Safari-safe: parse ISO manually and build Date(y, m-1, d)
    const iso = clampISO(dateISO);
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return "—";

    const y  = Number(m[1]);
    const mo = Number(m[2]);
    const d  = Number(m[3]);

    const dt = new Date(y, mo - 1, d);
    if(Number.isNaN(dt.getTime())) return "—";

    return dt.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
  }

  function statusFor(done, goal){
    if(goal <= 0) return "No goal set";
    const pct = done / goal;
    if(pct >= 1) return "Goal Met";
    if(pct >= 0.75) return "Almost There";
    return "Under Goal";
  }

  function reopenFor(newISO){
    const nextISO = clampISO(newISO);
    Modal.close();
    Modal.open({
      title: "Protein",
      bodyNode: buildProteinTodayModal(nextISO, goal)
    });
  }

  // ---- load existing data and auto-convert (map existing meals into the 5 standard slots) ----
  const entry = findProteinEntry(dateISO) || { dateISO, meals: [] };
  const existingMeals = (entry?.meals || []).slice();

  // map by label (case-insensitive)
  function findMealByLabel(label){
    const key = String(label || "").trim().toLowerCase();
    return existingMeals.find(m => String(m?.label || "").trim().toLowerCase() === key) || null;
  }

  const slot = {};     // grams draft
  const slotId = {};   // existing meal IDs for those labels (if found)
  MEAL_LABELS.forEach(lbl => {
    const found = findMealByLabel(lbl);
    slotId[lbl] = found?.id || null;
    slot[lbl] = Number(found?.grams || 0);
    if(!Number.isFinite(slot[lbl]) || slot[lbl] < 0) slot[lbl] = 0;
  });

  // ---- UI: Header / Date row (editable) ----
  const dateRow = el("div", { class:"proteinDateRow" }, []);

  const prevBtn = el("button", {
    class:"btn",
    onClick: () => reopenFor(Dates.addDaysISO(dateISO, -1))
  }, ["←"]);

  const nextBtn = el("button", {
    class:"btn",
    onClick: () => reopenFor(Dates.addDaysISO(dateISO, 1))
  }, ["→"]);

  const dateInput = el("input", {
    type:"date",
    value: dateISO,
    onInput: (e) => {
      const v = clampISO(e?.target?.value);
      // only reopen if user typed a complete valid value
      if(v && v !== dateISO) reopenFor(v);
    }
  });

  const dateMeta = el("div", { class:"note", text: fmtPretty(dateISO) });

  dateRow.appendChild(el("div", { style:"display:flex; gap:10px; align-items:center; justify-content:space-between;" }, [
    prevBtn,
    el("div", { style:"flex:1; display:flex; flex-direction:column; gap:6px; align-items:center;" }, [
      dateInput,
      dateMeta
    ]),
    nextBtn
  ]));

  // ---- UI: Progress card (loading bar concept) ----
  const progressCard = el("div", { class:"card proteinProgressCard" }, []);
  const progTop = el("div", { class:"proteinProgTop" }, []);
  const progBar = el("div", { class:"proteinBar" }, [
    el("div", { class:"proteinBarFill" })
  ]);
  const progMeta1 = el("div", { class:"note" });
  const progMeta2 = el("div", { class:"note" });

  progressCard.appendChild(el("h2", { text:`Protein Intake (Goal ${goal}g)` }));
  progressCard.appendChild(el("div", { style:"height:8px" }));
  progressCard.appendChild(el("div", { style:"font-weight:850; margin-bottom:6px;", text:"Progress" }));
  progressCard.appendChild(progBar);
  progressCard.appendChild(el("div", { style:"height:8px" }));
  progressCard.appendChild(progMeta1);
  progressCard.appendChild(progMeta2);

  // ---- UI: Input rows (single screen, numeric keypad, updates live) ----
  const formCard = el("div", { class:"card" }, [
    el("h2", { text:"Log protein" }),
    el("div", { class:"note", text:"Updates live as you type. Tap Save when done." }),
    el("div", { style:"height:10px" })
  ]);

  const rows = el("div", { style:"display:grid; gap:10px;" }, []);
  const inputs = {}; // keep DOM refs if needed

  function makeRow(label){
    const inp = el("input", {
      type:"number",
      inputmode:"numeric",
      pattern:"[0-9]*",
      min:"0",
      step:"1",
      value: String(Math.max(0, Math.round(Number(slot[label] || 0)))),
      onInput: (e) => {
        const raw = String(e?.target?.value ?? "");
        // allow empty while typing, treat as 0 for calculations
        const n = raw === "" ? 0 : Number(raw);
        slot[label] = (Number.isFinite(n) && n >= 0) ? n : 0;
        repaintProgress(); // live UI update
      }
    });

    inputs[label] = inp;

    return el("div", { class:"proteinRow" }, [
      el("div", { style:"font-weight:820;", text: `${label} (g)` }),
      inp
    ]);
  }

  MEAL_LABELS.forEach(lbl => rows.appendChild(makeRow(lbl)));
  formCard.appendChild(rows);

  // ---- Optional: Legacy / other meals (keep safe access to older custom entries) ----
  const legacy = existingMeals.filter(m => {
    const k = String(m?.label || "").trim().toLowerCase();
    return !MEAL_LABELS.map(x => x.toLowerCase()).includes(k);
  });

  const legacyCard = el("div", { class:"card" }, [
    el("h2", { text:"Other meals" }),
    el("div", { class:"note", text: legacy.length ? "Your older custom meals are kept here." : "No other meals." }),
    el("div", { style:"height:10px" })
  ]);

  if(legacy.length){
    const list = el("div", { class:"list" });
    legacy.forEach(m => {
      list.appendChild(el("div", { class:"item" }, [
        el("div", { class:"left" }, [
          el("div", { class:"name", text: m.label || "Meal" }),
          el("div", { class:"meta", text: `${Number(m.grams)||0}g` })
        ]),
        el("div", { class:"actions" }, [
          el("button", { class:"mini", onClick: () => {
            // reuse your existing editor behavior (same as before)
            const labelInput = el("input", { type:"text", placeholder:"Meal name", value: m?.label || "" });
            const gramsInput = el("input", { type:"number", inputmode:"numeric", pattern:"[0-9]*", placeholder:"Protein grams", min:"0", value: m?.grams ?? "" });
            const err = el("div", { class:"note", style:"display:none; color: rgba(255,92,122,.95);" });

            Modal.open({
              title: "Edit meal",
              size: "sm",
              center: true,
              bodyNode: el("div", {}, [
                el("label", {}, [ el("span", { text:"Label" }), labelInput ]),
                el("label", {}, [ el("span", { text:"Protein (grams)" }), gramsInput ]),
                err,
                el("div", { style:"height:12px" }),
                el("div", { class:"btnrow" }, [
                  el("button", {
                    class:"btn primary",
                    onClick: () => {
                      err.style.display = "none";
                      const label = (labelInput.value || "").trim();
                      const grams = Number(gramsInput.value);
                      if(!label){ err.textContent="Label required."; err.style.display="block"; return; }
                      if(!Number.isFinite(grams) || grams < 0){ err.textContent="Enter valid grams."; err.style.display="block"; return; }
                      upsertMeal(dateISO, m?.id || null, label, grams);
                      Modal.close();
                      // reopen to reflect changes safely
                      reopenFor(dateISO);
                      renderView(); // refresh home ring if visible
                    }
                  }, ["Save"]),
                  el("button", { class:"btn", onClick: () => { Modal.close(); } }, ["Cancel"])
                ])
              ])
            });
          }}, ["Edit"]),
          el("button", { class:"mini danger", onClick: () => {
            deleteMeal(dateISO, m.id);
            reopenFor(dateISO);
            renderView();
          }}, ["Delete"])
        ])
      ]));
    });
    legacyCard.appendChild(list);
  }

  // ---- Footer actions ----
  const saveBtn = el("button", {
    class:"btn primary",
    onClick: () => {
      // persist the 5 standard slots
      MEAL_LABELS.forEach(lbl => {
        const grams = Math.max(0, Math.round(Number(slot[lbl] || 0)));
        // Keep the entry even if 0 (your preference); if you ever want "0 means delete", we can change later.
        const existingId = slotId[lbl] || null;
        upsertMeal(dateISO, existingId, lbl, grams);
      });

      showToast("Saved");
      renderView(); // update ring on Home
      // stay open; user asked to keep Save button + live feel
      reopenFor(dateISO);
    }
  }, ["Save"]);

  const closeBtn = el("button", { class:"btn", onClick: () => Modal.close() }, ["Close"]);

  const historyBtn = el("button", {
    class:"btn",
    onClick: () => {
      UIState.protein = UIState.protein || {};
      UIState.protein.dateISO = dateISO;
      Modal.close();
      navigate("protein_history");
    }
  }, ["History"]);

  const actions = el("div", { class:"btnrow" }, [ saveBtn, historyBtn, closeBtn ]);

  // ---- Progress repaint ----
  function repaintProgress(){
    const done = MEAL_LABELS.reduce((sum, lbl) => sum + (Number(slot[lbl]) || 0), 0);
    const cleanDone = Math.max(0, Math.round(done));
    const cleanGoal = Math.max(0, Math.round(Number(goal) || 0));
    const left = Math.max(0, cleanGoal - cleanDone);

    const pct = (cleanGoal > 0) ? Math.max(0, Math.min(1, cleanDone / cleanGoal)) : 0;
    const fill = progBar.querySelector(".proteinBarFill");
    if(fill) fill.style.width = `${Math.round(pct * 100)}%`;

    progMeta1.textContent = `${cleanDone}g / ${cleanGoal}g`;
    progMeta2.textContent = `Remaining: ${left}g • Status: ${statusFor(cleanDone, cleanGoal)}`;
  }

  // ---- build modal ----
  container.appendChild(dateRow);
  container.appendChild(progressCard);
  container.appendChild(formCard);
  container.appendChild(legacyCard);
  container.appendChild(actions);

  repaintProgress();
  return container;
}
    /********************
     * 4d) Log Engine + PR Engine (Step 6)  ✅ FIXED
     ********************/
    const LogEngine = {
      ensure(){
        state.logs = state.logs || { workouts: [], weight: [], protein: [] };
        state.logs.workouts = state.logs.workouts || [];
      },

      addEntry(entry){
        this.ensure();
        state.logs.workouts.push(entry);
        Storage.save(state);
      },

      entriesForExercise(type, exerciseId){
        this.ensure();
        return state.logs.workouts
          .filter(e => e.type === type && e.exerciseId === exerciseId)
          .sort((a,b) => (b.dateISO || "").localeCompare(a.dateISO || "") || (b.createdAt||0)-(a.createdAt||0));
      },

      lifetimeBests(type, exerciseId){
        const entries = this.entriesForExercise(type, exerciseId);
        const bests = {
          bestWeight: null,
          best1RM: null,
          bestVolume: null,
          bestPace: null
        };

        for(const e of entries){
          if(e?.summary){
            if(type === "weightlifting"){
              if(Number.isFinite(e.summary.bestWeight)) bests.bestWeight = Math.max(bests.bestWeight ?? -Infinity, e.summary.bestWeight);
              if(Number.isFinite(e.summary.best1RM)) bests.best1RM = Math.max(bests.best1RM ?? -Infinity, e.summary.best1RM);
              if(Number.isFinite(e.summary.totalVolume)) bests.bestVolume = Math.max(bests.bestVolume ?? -Infinity, e.summary.totalVolume);
            } else if(type === "cardio"){
              if(Number.isFinite(e.summary.paceSecPerUnit)){
                bests.bestPace = Math.min(bests.bestPace ?? Infinity, e.summary.paceSecPerUnit);
              }
            } else if(type === "core"){
              if(Number.isFinite(e.summary.totalVolume)) bests.bestVolume = Math.max(bests.bestVolume ?? -Infinity, e.summary.totalVolume);
            }
          }
        }

        if(bests.bestWeight === -Infinity) bests.bestWeight = null;
        if(bests.best1RM === -Infinity) bests.best1RM = null;
        if(bests.bestVolume === -Infinity) bests.bestVolume = null;
        if(bests.bestPace === Infinity) bests.bestPace = null;

        return bests;
      },

      computeWeightliftingSummary(sets){
        const cleanSets = (sets || []).map(s => ({
          weight: Number(s.weight) || 0,
          reps: Math.max(0, Math.floor(Number(s.reps) || 0))
        }));

        let totalVolume = 0;
        let bestWeight = 0;
        let best1RM = 0;

        for(const s of cleanSets){
          totalVolume += (s.weight * s.reps);
          bestWeight = Math.max(bestWeight, s.weight);
          const epley = (s.reps > 0) ? (s.weight * (1 + (s.reps / 30))) : 0;
          best1RM = Math.max(best1RM, epley);
        }

        return {
          totalVolume: round2(totalVolume),
          bestWeight: round2(bestWeight),
          best1RM: round2(best1RM)
        };
      },

      computeCardioSummary(sets){
        const clean = (sets || []).map(s => ({
          timeSec: Math.max(0, Math.floor(Number(s.timeSec) || 0)),
          distance: Number(s.distance) || 0,
          incline: Number.isFinite(Number(s.incline)) ? Number(s.incline) : null
        }));

        const s = clean[0] || { timeSec:0, distance:0, incline:null };
        const pace = (s.distance > 0) ? (s.timeSec / s.distance) : null;

        return {
          timeSec: s.timeSec,
          distance: round2(s.distance),
          incline: s.incline,
          paceSecPerUnit: (pace === null) ? null : round2(pace)
        };
      },

      computeCoreSummary(sets){
        const clean = (sets || []).map(s => ({
          sets: Math.max(0, Math.floor(Number(s.sets) || 0)),
          reps: Math.max(0, Math.floor(Number(s.reps) || 0)),
          timeSec: Math.max(0, Math.floor(Number(s.timeSec) || 0)),
          weight: Number(s.weight) || 0
        }));

        let totalVolume = 0;
        for(const s of clean){
          if(s.reps > 0){
            const w = (s.weight > 0) ? s.weight : 1;
            totalVolume += (s.reps * s.sets * w);
          }else{
            totalVolume += s.timeSec;
          }
        }

        return { totalVolume: round2(totalVolume) };
      },

      computePRFlags(type, exerciseId, summary){
        const prev = this.lifetimeBests(type, exerciseId);

        const pr = {
          isPRWeight: false,
          isPR1RM: false,
          isPRVolume: false,
          isPRPace: false
        };

        if(type === "weightlifting"){
          if(Number.isFinite(summary.bestWeight)){
            pr.isPRWeight = (prev.bestWeight === null) ? (summary.bestWeight > 0) : (summary.bestWeight > prev.bestWeight);
          }
          if(Number.isFinite(summary.best1RM)){
            pr.isPR1RM = (prev.best1RM === null) ? (summary.best1RM > 0) : (summary.best1RM > prev.best1RM);
          }
          if(Number.isFinite(summary.totalVolume)){
            pr.isPRVolume = (prev.bestVolume === null) ? (summary.totalVolume > 0) : (summary.totalVolume > prev.bestVolume);
          }
        } else if(type === "cardio"){
          if(summary.paceSecPerUnit !== null && Number.isFinite(summary.paceSecPerUnit)){
            pr.isPRPace = (prev.bestPace === null) ? (summary.paceSecPerUnit > 0) : (summary.paceSecPerUnit < prev.bestPace);
          }
        } else if(type === "core"){
          if(Number.isFinite(summary.totalVolume)){
            pr.isPRVolume = (prev.bestVolume === null) ? (summary.totalVolume > 0) : (summary.totalVolume > prev.bestVolume);
          }
        }

        return pr;
      }
    };

    // ✅ FIX: used by Progress → History delete button
    function removeWorkoutEntryById(entryId){
      LogEngine.ensure();
      const id = String(entryId || "");
      const before = (state.logs.workouts || []).length;

      state.logs.workouts = (state.logs.workouts || []).filter(e => String(e.id || "") !== id);

      Storage.save(state);
      return (state.logs.workouts || []).length !== before;
    }

    function round2(n){
      return Math.round((Number(n) || 0) * 100) / 100;
    }

    function round2(n){
      return Math.round((Number(n) || 0) * 100) / 100;
    }

    function formatTime(sec){
      const s = Math.max(0, Math.floor(Number(sec) || 0));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${String(r).padStart(2,"0")}`;
    }

    function formatPace(paceSecPerUnit){
      if(paceSecPerUnit === null || !Number.isFinite(paceSecPerUnit)) return "—";
      return `${formatTime(paceSecPerUnit)} / unit`;
    }
        /********************
     * 4e) Progress Helpers (Step 7)
     ********************/
    let __progressChart = null;

    function destroyProgressChart(){
      try{
        if(__progressChart){
          __progressChart.destroy();
          __progressChart = null;
        }
      }catch(e){
        __progressChart = null;
      }
    }

    function downloadCanvasPNG(canvas, filename){
      try{
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || "progress.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }catch(e){
        Modal.open({
          title: "Download failed",
          bodyNode: el("div", {}, [
            el("div", { class:"note", text:"Could not export image. Try again or use a different browser." }),
            el("div", { style:"height:12px" }),
            el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
          ])
        });
      }
    }

    function buildSeries(type, entries){
      // entries expected ascending by date
      const labels = entries.map(e => e.dateISO);

      if(type === "weightlifting"){
        const topWeight = entries.map(e => Number(e.summary?.bestWeight) || 0);
        const est1RM = entries.map(e => Number(e.summary?.best1RM) || 0);
        const volume = entries.map(e => Number(e.summary?.totalVolume) || 0);
        return { labels, datasets: { topWeight, est1RM, volume } };
      }

      if(type === "cardio"){
        const pace = entries.map(e => (e.summary?.paceSecPerUnit == null ? null : Number(e.summary.paceSecPerUnit)));
        const distance = entries.map(e => Number(e.summary?.distance) || 0);
        const timeSec = entries.map(e => Number(e.summary?.timeSec) || 0);
        return { labels, datasets: { pace, distance, timeSec } };
      }

      // core
      const volume = entries.map(e => Number(e.summary?.totalVolume) || 0);
      return { labels, datasets: { volume } };
    }

    function renderProgressChart(canvas, type, metricKey, series){
      destroyProgressChart();

      // Build chart dataset (no custom colors per your standards — Chart.js defaults)
      let data = [];
      let label = "";

      if(type === "weightlifting"){
        if(metricKey === "topWeight"){ data = series.datasets.topWeight; label = "Top Weight"; }
        else if(metricKey === "est1RM"){ data = series.datasets.est1RM; label = "Estimated 1RM (Epley)"; }
        else { data = series.datasets.volume; label = "Volume"; }
      } else if(type === "cardio"){
        if(metricKey === "pace"){ data = series.datasets.pace; label = "Pace (sec/unit) (lower is better)"; }
        else if(metricKey === "distance"){ data = series.datasets.distance; label = "Distance"; }
        else { data = series.datasets.timeSec; label = "Time (sec)"; }
      } else {
        data = series.datasets.volume;
        label = "Core Volume";
      }

      const ctx = canvas.getContext("2d");
      __progressChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: series.labels,
          datasets: [{
            label,
            data,
            tension: 0.25,
            spanGaps: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });

      return __progressChart;
    }
        /********************
     * 4f) Weight Engine + Chart Helpers (Step 8)
     ********************/
    const WeightEngine = {
      ensure(){
        state.logs = state.logs || { workouts: [], weight: [], protein: [] };
        state.logs.weight = state.logs.weight || [];
      },

      add(dateISO, weight){
        this.ensure();
        const d = String(dateISO || Dates.todayISO());
        const w = Number(weight);
        if(!Number.isFinite(w) || w <= 0) throw new Error("Enter a valid weight.");

        // Upsert by date (one entry per day)
        const idx = state.logs.weight.findIndex(x => x.dateISO === d);
        const entry = { id: uid("wt"), dateISO: d, weight: round2(w), createdAt: Date.now() };
        if(idx >= 0) state.logs.weight[idx] = { ...state.logs.weight[idx], ...entry };
        else state.logs.weight.push(entry);

        Storage.save(state);
        return entry;
      },

      remove(id){
        this.ensure();
        const idx = state.logs.weight.findIndex(x => x.id === id);
        if(idx >= 0){
          state.logs.weight.splice(idx, 1);
          Storage.save(state);
        }
      },

      listDesc(){
        this.ensure();
        const arr = [...state.logs.weight];
        arr.sort((a,b) => (b.dateISO || "").localeCompare(a.dateISO || "") || (b.createdAt||0)-(a.createdAt||0));
        return arr;
      },

      listAsc(){
        return this.listDesc().reverse();
      },

      latest(){
        const d = this.listDesc();
        return d[0] || null;
      },

      previous(){
        const d = this.listDesc();
        return d[1] || null;
      },

      delta(){
        const a = this.latest();
        const b = this.previous();
        if(!a || !b) return null;
        return round2((a.weight || 0) - (b.weight || 0));
      },

      avg7(dateISO){
        // 7-day window ending at dateISO (inclusive)
        this.ensure();
        const end = new Date(String(dateISO || Dates.todayISO()) + "T00:00:00");
        const start = new Date(end);
        start.setDate(start.getDate() - 6);

        const items = state.logs.weight.filter(x => {
          const d = new Date(x.dateISO + "T00:00:00");
          return d >= start && d <= end;
        });

        if(items.length === 0) return null;
        const avg = items.reduce((sum,x) => sum + (Number(x.weight)||0), 0) / items.length;
        return round2(avg);
      }
    };

    let __weightChart = null;

    function destroyWeightChart(){
      try{
        if(__weightChart){
          __weightChart.destroy();
          __weightChart = null;
        }
      }catch(e){
        __weightChart = null;
      }
    }

    function renderWeightChart(canvas, entriesAsc){
      destroyWeightChart();
      const labels = entriesAsc.map(e => e.dateISO);
      const data = entriesAsc.map(e => Number(e.weight) || 0);

      const ctx = canvas.getContext("2d");
      __weightChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Bodyweight",
            data,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true } },
          scales: { y: { beginAtZero: false } }
        }
      });

      return __weightChart;
    }
    /********************
 * 4f) Routine/Attendance Helpers (NEW)
 ********************/

// Attendance helpers (explicit add/remove for manual override scenarios)
function attendanceHas(dateISO){
  state.attendance = state.attendance || [];
  return state.attendance.includes(dateISO);
}
function attendanceAdd(dateISO){
  state.attendance = state.attendance || [];
  if(!state.attendance.includes(dateISO)){
    state.attendance.push(dateISO);
    Storage.save(state);
  }
}
function attendanceRemove(dateISO){
  state.attendance = state.attendance || [];
  const i = state.attendance.indexOf(dateISO);
  if(i >= 0){
    state.attendance.splice(i, 1);
    Storage.save(state);
  }
}

// Routine logging helpers (per-routine-exercise instance)
function hasRoutineExerciseLog(dateISO, routineExerciseId){
  LogEngine.ensure();
  return state.logs.workouts.some(e => e.dateISO === dateISO && e.routineExerciseId === routineExerciseId);
}

function lifetimeMaxSet(type, exerciseId){
  if(type !== "weightlifting") return null;
  const entries = LogEngine.entriesForExercise(type, exerciseId);
  let best = null;
  for(const e of entries){
    for(const s of (e.sets || [])){
      const w = Number(s.weight) || 0;
      const r = Math.max(0, Math.floor(Number(s.reps) || 0));
      if(w <= 0 || r <= 0) continue;
      if(!best) best = { weight: w, reps: r };
      else if(w > best.weight) best = { weight: w, reps: r };
      else if(w === best.weight && r > best.reps) best = { weight: w, reps: r };
    }
  }
  return best;
}

// Floating "Next →" nudge (transient UI only)
let __nextNudge = null; // { dateISO, dayOrder, nextRoutineExerciseId }
function setNextNudge(n){ __nextNudge = n; }

function ensureFloatNext(){
  if(document.getElementById("floatNext")) return;
  const host = el("div", { class:"floatNext", id:"floatNext" }, [
    el("button", { class:"btn", id:"floatNextBtn" }, ["Next →"])
  ]);
  document.body.appendChild(host);
}

function maybeShowNextNudge(dateISO, day){
  const host = document.getElementById("floatNext");
  const btn = document.getElementById("floatNextBtn");
  if(!host || !btn) return;

  const shouldShow = __nextNudge &&
    __nextNudge.dateISO === dateISO &&
    __nextNudge.dayOrder === day.order &&
    __nextNudge.nextRoutineExerciseId;

  host.classList.toggle("show", !!shouldShow);

  if(shouldShow){
    btn.onclick = () => {
      const rxId = __nextNudge.nextRoutineExerciseId;
      const node = document.getElementById(`rx_${rxId}`);
      if(node){
        node.scrollIntoView({ behavior:"smooth", block:"center" });
        node.classList.remove("pulse");
        void node.offsetWidth;
        node.classList.add("pulse");
      }
      __nextNudge = null;
      host.classList.remove("show");
    };
  }else{
    btn.onclick = null;
  }
}

function showToast(message){
  try{
    const existing = document.getElementById("toastTemp");
    if(existing) existing.remove();
    const t = el("div", {
      id:"toastTemp",
      style:"position:fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 90; padding: 10px 12px; border-radius: 999px; background: rgba(16,20,30,.92); border: 1px solid rgba(255,255,255,.12); color: rgba(255,255,255,.92); font-size: 12.5px; box-shadow: 0 18px 44px rgba(0,0,0,.55);"
    }, [message]);
    document.body.appendChild(t);
    setTimeout(() => { try{ t.remove(); }catch(e){} }, 1100);
  }catch(e){}
}
    /********************
 * 🔥 Crash Failsafe (prevents blank UI)
 ********************/
function __formatErr(err){
  try{
    if(!err) return "Unknown error";
    if(typeof err === "string") return err;
    if(err instanceof Error) return `${err.name}: ${err.message}\n${err.stack || ""}`.trim();
    return JSON.stringify(err, null, 2);
  }catch(e){
    return "Unrenderable error";
  }
}

function __showFatalOverlay(title, detail){
  try{
    // avoid duplicates
    const existing = document.getElementById("fatalOverlay");
    if(existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "fatalOverlay";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:9999",
      "background:rgba(11,15,23,.94)",
      "backdrop-filter: blur(12px)",
      "color:rgba(255,255,255,.92)",
      "padding:18px",
      "display:flex",
      "align-items:center",
      "justify-content:center"
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "width:min(720px, 92vw)",
      "border:1px solid rgba(255,255,255,.14)",
      "background:rgba(255,255,255,.06)",
      "border-radius:18px",
      "box-shadow:0 22px 70px rgba(0,0,0,.65)",
      "padding:16px"
    ].join(";");

    const h = document.createElement("div");
    h.textContent = title || "App error";
    h.style.cssText = "font-weight:900; font-size:16px; letter-spacing:.2px; margin-bottom:10px;";

    const p = document.createElement("div");
    p.textContent = "The app hit an error and stopped rendering. Copy the details below and send it to yourself.";
    p.style.cssText = "color:rgba(255,255,255,.68); font-size:13px; line-height:1.35; margin-bottom:12px;";

    const pre = document.createElement("pre");
    pre.textContent = detail || "No details available";
    pre.style.cssText = [
      "white-space:pre-wrap",
      "word-break:break-word",
      "margin:0",
      "padding:12px",
      "border-radius:14px",
      "border:1px solid rgba(255,255,255,.12)",
      "background:rgba(0,0,0,.22)",
      "color:rgba(255,255,255,.86)",
      "font-size:12px",
      "line-height:1.35",
      "max-height:52vh",
      "overflow:auto"
    ].join(";");

    const row = document.createElement("div");
    row.style.cssText = "display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;";

    const btnReload = document.createElement("button");
    btnReload.className = "btn primary";
    btnReload.textContent = "Reload app";
    btnReload.onclick = () => location.reload();

    const btnClose = document.createElement("button");
    btnClose.className = "btn";
    btnClose.textContent = "Dismiss";
    btnClose.onclick = () => overlay.remove();

    row.appendChild(btnReload);
    row.appendChild(btnClose);

    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(pre);
    card.appendChild(row);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }catch(e){
    // last resort: at least log
    console.error("Fatal overlay failed:", e);
  }
}

function __fatal(err, context){
  const detail = `[${context || "runtime"}]\n` + __formatErr(err);
  console.error("FATAL:", detail);
  __showFatalOverlay("Gym Dashboard crashed", detail);
}

// Catch synchronous runtime errors
window.addEventListener("error", (ev) => {
  __fatal(ev?.error || ev?.message || ev, "window.error");
});

// Catch async errors (Promise rejections)
window.addEventListener("unhandledrejection", (ev) => {
  __fatal(ev?.reason || ev, "unhandledrejection");
});
/********************
 * 4g) Glass Dropdown (Popover) UI
 ********************/
let __pop = null;

// Tracks whether THIS popover session locked scroll (so we only unlock when appropriate)
let __popoverLockedScroll = false;

function PopoverEnsure(){
  if(__pop) return __pop;

  const host = el("div", { class:"popHost", id:"popHost" }, []);
  const backdrop = el("div", { class:"popBackdrop", id:"popBackdrop" }, []);
  const panel = el("div", { class:"popPanel", id:"popPanel" }, []);

  backdrop.addEventListener("click", PopoverClose);

  host.appendChild(backdrop);
  host.appendChild(panel);
  document.body.appendChild(host);

  __pop = { host, panel };
  return __pop;
}

function PopoverOpen(anchorEl, bodyNode){
  const { host, panel } = PopoverEnsure();

  panel.innerHTML = "";
  if(bodyNode) panel.appendChild(bodyNode);

  // Show first so we can compute panel size accurately
  host.classList.add("show");
  host.style.display = "block";

  // ✅ Lock background scroll while popover is open (uses your existing iOS-safe lock)
  // Only lock if nothing else already locked it.
  if(!document.body.classList.contains("modalOpen")){
    lockBodyScroll();
    __popoverLockedScroll = true;
  }else{
    __popoverLockedScroll = false;
  }

  // Position under anchor, keep within viewport
  const r = anchorEl.getBoundingClientRect();
  const pad = 12;

  const pw = panel.offsetWidth || Math.min(420, window.innerWidth - 24);

  // default: left aligned to anchor, clamped to viewport
  let left = r.left;
  left = Math.max(pad, Math.min(left, window.innerWidth - pw - pad));

  let top = r.bottom + 10;
  const ph = panel.offsetHeight || 320;

  // if it would go below, flip above anchor
  if(top + ph > window.innerHeight - pad){
    top = Math.max(pad, r.top - ph - 10);
  }

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top  = `${Math.round(top)}px`;
}

function PopoverClose(){
  const p = PopoverEnsure();
  p.host.classList.remove("show");
  p.host.style.display = "none";   // ✅ actually hide it
  p.panel.innerHTML = "";          // ✅ clear list so it doesn't linger

  // ✅ Restore background scroll ONLY if this popover was the thing that locked it
  if(__popoverLockedScroll){
    __popoverLockedScroll = false;

    // If a modal is open for any reason, don't unlock yet
    const modalHost = document.getElementById("modalHost");
    const modalIsOpen = !!(modalHost && modalHost.classList.contains("show"));

    if(!modalIsOpen){
      unlockBodyScroll();
    }
  }
}

    /********************
     * 5) Modal
     ********************/
      let __modalScrollY = 0;

function lockBodyScroll(){
  __modalScrollY = window.scrollY || 0;

  // iOS-safe lock: freeze body position
  document.body.classList.add("modalOpen");
  document.body.style.position = "fixed";
  document.body.style.top = `-${__modalScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockBodyScroll(){
  document.body.classList.remove("modalOpen");

  // restore body scrolling
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  window.scrollTo(0, __modalScrollY);
}

// ─────────────────────────────
// Modal (production hardening)
// - Focus is moved into the modal when opened
// - Tab/Shift+Tab are trapped inside the modal
// - Focus is restored to the triggering element when closed
// ─────────────────────────────
let __modalLastFocus = null;
let __modalKeydownHandler = null;

function __getModalFocusables(sheet){
  if(!sheet) return [];
  const nodes = sheet.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter(el => {
    // visible + enabled
    const style = window.getComputedStyle(el);
    if(style.visibility === "hidden" || style.display === "none") return false;
    if(el.hasAttribute("disabled")) return false;
    return true;
  });
}

const Modal = {
  open({ title, bodyNode, center = true, size = "md" }){
    const host  = $("#modalHost");
    const body  = $("#modalBody");
    const sheet = host.querySelector(".sheet");

    // Remember last focused element (so we can restore on close)
    __modalLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    $("#modalTitle").textContent = title || "Modal";

    // Position mode
    host.classList.toggle("center", !!center);

    // Size mode
    if(sheet){
      sheet.classList.remove("sm", "md", "lg");
      sheet.classList.add(size);
    }

    body.innerHTML = "";
    if(bodyNode) body.appendChild(bodyNode);

    host.classList.add("show");
    host.setAttribute("aria-hidden", "false");

    lockBodyScroll();

    // Focus management: move focus into modal (prefer Close button)
    const closeBtn = $("#modalClose");
    const focusablesNow = __getModalFocusables(sheet);
    const first = closeBtn || focusablesNow[0] || sheet;

    // Ensure sheet is focusable if nothing else is
    if(sheet && !sheet.hasAttribute("tabindex")) sheet.setAttribute("tabindex", "-1");

    // Use next tick so DOM is fully ready
    setTimeout(() => {
      try { first && first.focus && first.focus(); } catch(e){}
    }, 0);

    // Trap Tab navigation inside modal
    __modalKeydownHandler = (e) => {
      if(!host.classList.contains("show")) return;

      // ESC should still work via your existing listeners, but keep safe here too
      if(e.key === "Escape"){
        e.preventDefault();
        Modal.close();
        return;
      }

      if(e.key !== "Tab") return;

      const focusables = __getModalFocusables(sheet);
      if(focusables.length === 0){
        e.preventDefault();
        sheet && sheet.focus && sheet.focus();
        return;
      }

      const active = document.activeElement;
      const firstEl = focusables[0];
      const lastEl  = focusables[focusables.length - 1];

      // Shift+Tab on first -> wrap to last
      if(e.shiftKey && active === firstEl){
        e.preventDefault();
        lastEl.focus();
        return;
      }

      // Tab on last -> wrap to first
      if(!e.shiftKey && active === lastEl){
        e.preventDefault();
        firstEl.focus();
        return;
      }
    };

    document.addEventListener("keydown", __modalKeydownHandler, true);
  },

  close(){
    const host  = $("#modalHost");
    const sheet = host.querySelector(".sheet");

    host.classList.remove("show");
    host.classList.remove("center");
    host.setAttribute("aria-hidden", "true");

    $("#modalBody").innerHTML = "";

    // Reset size classes
    if(sheet){
      sheet.classList.remove("sm", "md", "lg");
    }

    unlockBodyScroll();

    // Remove keydown trap
    if(__modalKeydownHandler){
      document.removeEventListener("keydown", __modalKeydownHandler, true);
      __modalKeydownHandler = null;
    }

    // Restore focus back to what opened the modal (if still in DOM)
    if(__modalLastFocus && document.contains(__modalLastFocus)){
      try { __modalLastFocus.focus(); } catch(e){}
    }
    __modalLastFocus = null;
  }
};
    (function bindModalControls(){
  const closeBtn = $("#modalClose");
  const backdrop = $("#modalBackdrop");

  if(closeBtn){
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      Modal.close();
    });
  }

  if(backdrop){
    backdrop.addEventListener("click", (e) => {
      e.preventDefault();
      Modal.close();
    });
  }

  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      const host = $("#modalHost");
      if(host && host.classList.contains("show")){
        Modal.close();
      }
    }
  });
})();

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

    /********************
     * 7) Views
     ********************/
    const Views = {
      ProteinHistory(){

        const root = el("div", { class:"grid" });

        // Read-only totals (do NOT call totalProtein() here because it can auto-create entries)
        function proteinTotalForDateRO(dateISO){
          const entry = (state?.logs?.protein || []).find(x => x.dateISO === dateISO);
          if(!entry || !Array.isArray(entry.meals)) return 0;
          return entry.meals.reduce((sum, m) => sum + (Number(m?.grams) || 0), 0);
        }

        function statusFor(total, goal){
          if(goal <= 0) return "No goal set";
          if(total >= goal) return "Goal Met";
          if(total >= (goal * 0.8)) return "Almost There";
          return "Under Goal";
        }

        function fmtDateLabel(dateISO){
          const d = new Date(String(dateISO) + "T00:00:00");
          if(isNaN(d.getTime())) return String(dateISO || "—");
          return d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
        }

        const todayISO = Dates.todayISO();
        const weekStartsOn = state.profile?.weekStartsOn || "mon";
        const goal = Math.max(0, Math.round(Number(state?.profile?.proteinGoal || 0)));

        const startThisWeekISO = Dates.startOfWeekISO(todayISO, weekStartsOn);
        const startLastWeekISO = Dates.addDaysISO(startThisWeekISO, -7);

        // Collect logged days (from actual stored entries)
        const entries = Array.isArray(state?.logs?.protein) ? state.logs.protein.slice() : [];
        // keep only valid ISO-ish dates
        const cleaned = entries
          .filter(e => e && typeof e.dateISO === "string" && e.dateISO.length >= 10)
          .sort((a,b) => String(b.dateISO).localeCompare(String(a.dateISO)));

        // Week stats (this week)
        let weekLoggedDays = 0;
        let weekSum = 0;
        let weekBest = 0;
        let weekGoalMet = 0;

        for(let i=0;i<7;i++){
          const dISO = Dates.addDaysISO(startThisWeekISO, i);
          const total = proteinTotalForDateRO(dISO);
          const hasEntry = total > 0;
          if(hasEntry){
            weekLoggedDays++;
            weekSum += total;
            weekBest = Math.max(weekBest, total);
            if(goal > 0 && total >= goal) weekGoalMet++;
          }
        }

        const weekAvg = (weekLoggedDays > 0) ? Math.round(weekSum / weekLoggedDays) : 0;

        // Sticky in-view header (global header is already fixed)
        const headerRow = el("div", {
          style:[
            "position:sticky",
            "top:0",
            "z-index:5",
            "padding:6px 0 10px",
            "background: rgba(0,0,0,.18)",
            "backdrop-filter: blur(10px)"
          ].join(";")
        }, [
          el("div", { class:"homeRow" }, [
            el("button", { class:"btn", onClick: () => navigate("home") }, ["← Back"]),
            el("div", { style:"font-weight:900; letter-spacing:.2px;" , text:"Protein History" }),
            el("div", { style:"width:72px" }) // spacer to balance
          ])
        ]);

        function progressBar(total, goal){
          const pct = (goal > 0) ? Math.max(0, Math.min(1, total / goal)) : 0;
          return el("div", { class:"proteinBarTrack", style:"height:12px; border-radius:999px; overflow:hidden;" }, [
            el("div", { class:"proteinBarFill", style:`width:${Math.round(pct*100)}%; height:100%;` })
          ]);
        }

        const summaryCard = el("div", { class:"card" }, [
          el("h2", { text:"This Week" }),
          el("div", { class:"note", text:`${weekLoggedDays}/7 days logged • Avg: ${weekAvg}g` }),
          el("div", { class:"note", text:`Best: ${weekBest}g • Goal Met Days: ${weekGoalMet}` })
        ]);

        function dayCard(dateISO){
          const total = proteinTotalForDateRO(dateISO);
          const left = Math.max(0, goal - total);
          const st = statusFor(total, goal);

          const title = Dates.sameISO(dateISO, todayISO)
            ? `${fmtDateLabel(dateISO)} (Today)`
            : fmtDateLabel(dateISO);

          return el("div", { class:"card", style:"cursor:pointer;" , onClick: () => {
            // open the existing protein modal for that date
            UIState.protein = UIState.protein || {};
            UIState.protein.dateISO = dateISO;
            Modal.open({ title:"Protein", bodyNode: buildProteinTodayModal(dateISO, goal) });
          }}, [
            el("div", { class:"homeRow" }, [
              el("div", {}, [
                el("div", { style:"font-weight:900;", text: title }),
                el("div", { class:"note", text: `${left}g remaining • ${st}` })
              ]),
              el("div", { style:"font-weight:900;", text: `${total}g` })
            ]),
            el("div", { style:"height:10px" }),
            progressBar(total, goal)
          ]);
        }

        // Build sections
        const thisWeekDates = [];
        const lastWeekDates = [];

        for(let i=0;i<7;i++){
          thisWeekDates.push(Dates.addDaysISO(startThisWeekISO, i));
          lastWeekDates.push(Dates.addDaysISO(startLastWeekISO, i));
        }

        // Older: anything before last week start
        const olderDates = cleaned
          .map(x => x.dateISO)
          .filter(dISO => dISO < startLastWeekISO);

        function section(title, dateList){
          // show only days that actually have entries (plus today for “This Week” visibility)
          const cards = [];
          for(const dISO of dateList){
            const hasEntry = proteinTotalForDateRO(dISO) > 0;
            if(hasEntry || (title === "This Week" && Dates.sameISO(dISO, todayISO))){
              cards.push(dayCard(dISO));
            }
          }
          if(cards.length === 0) return null;

          return el("div", {}, [
            el("div", { class:"addExSectionLabel", text:title }),
            el("div", { style:"display:grid; gap:10px;" }, cards)
          ]);
        }

        // Compose
        root.appendChild(headerRow);
        root.appendChild(summaryCard);

        const a = section("This Week", thisWeekDates);
        const b = section("Last Week", lastWeekDates);
        const c = section("Older", olderDates);

        if(a) root.appendChild(a);
        if(b) root.appendChild(b);
        if(c) root.appendChild(c);

        // Empty state
        if(!a && !b && !c){
          root.appendChild(el("div", { class:"card" }, [
            el("h2", { text:"Protein History" }),
            el("div", { class:"note", text:"No protein logged yet." }),
            el("div", { style:"height:12px" }),
            el("button", { class:"btn primary", onClick: () => {
              UIState.protein = UIState.protein || {};
              UIState.protein.dateISO = todayISO;
              Modal.open({ title:"Protein", bodyNode: buildProteinTodayModal(todayISO, goal) });
            } }, ["Start today"])
          ]));
        }

        return root;
      },
,  // ✅ end Progress()
  Weight(){
  WeightEngine.ensure();

  const root = el("div", { class:"grid weightPage" });

  const todayISO = Dates.todayISO();

  // Local UI state
  let rangeDays = 30;      // 7, 30, 90, 365
  let historyOpen = false;

  // ---- UI: Summary (Top) ----
  const summaryCard = el("div", { class:"card" }, [
    el("div", { class:"weightTop" }, [
      el("div", {}, [
        el("h2", { text:"Weight" }),
        el("div", { class:"note", text:"Quick view + trend. Tap History to see past entries." })
      ]),
      el("button", {
        class:"btn primary weightLogBtn",
        onClick: () => openLogModal()
      }, ["+ Log"])
    ])
  ]);

  const summaryKpi = el("div", { class:"kpi weightSummaryKpi" });
  summaryCard.appendChild(summaryKpi);

  // ---- UI: Graph (Middle) ----
  const chartCard = el("div", { class:"card" }, [
    el("div", { class:"weightChartHead" }, [
      el("h2", { text:"Trend" }),
      el("div", { class:"segRow" }, [
        segBtn("7D", 7),
        segBtn("30D", 30),
        segBtn("90D", 90),
        segBtn("1Y", 365)
      ])
    ])
  ]);

  const chartWrap = el("div", { class:"chartWrap weightChartWrap" });
  const canvas = el("canvas", {});
  chartWrap.appendChild(canvas);
  const chartNote = el("div", { class:"note" });

  chartCard.appendChild(chartWrap);
  chartCard.appendChild(el("div", { style:"height:10px" }));
  chartCard.appendChild(chartNote);

  // ---- UI: History (Bottom - collapsible) ----
  const historyCard = el("div", { class:"card" }, [
    el("div", {
      class:"accHeader",
      onClick: () => {
        historyOpen = !historyOpen;
        repaintHistory();
      }
    }, [
      el("h2", { text:"History" }),
      el("div", { class:"accChevron", text:"▾" })
    ])
  ]);

  const historyBody = el("div", { class:"accBody" });
  const tableHost = el("div", { class:"list" });
  historyBody.appendChild(tableHost);
  historyCard.appendChild(historyBody);

  root.appendChild(summaryCard);
  root.appendChild(chartCard);
  root.appendChild(historyCard);

  repaintAll();
  return root;

  // -----------------------------
  // Helpers
  // -----------------------------
  function segBtn(label, days){
    const b = el("button", {
      class:"seg" + (days === rangeDays ? " active" : ""),
      onClick: () => {
        rangeDays = days;
        repaintChart();
        // update active styles
        const all = chartCard.querySelectorAll(".seg");
        all.forEach(x => x.classList.remove("active"));
        b.classList.add("active");
      }
    }, [label]);
    return b;
  }

  function openLogModal(){
    const dateInput = el("input", { type:"date", value: todayISO });
    const weightInput = el("input", { type:"number", inputmode:"decimal", placeholder:"e.g., 185.4", min:"0", step:"0.1" });
    const err = el("div", { class:"note", style:"display:none; color: rgba(255,92,122,.95);" });

    Modal.open({
      title: "Log weight",
      center: true,
      size: "sm",
      bodyNode: el("div", {}, [
        el("label", {}, [ el("span", { text:"Date" }), dateInput ]),
        el("label", {}, [ el("span", { text:"Weight (lb)" }), weightInput ]),
        err,
        el("div", { style:"height:12px" }),
        el("div", { class:"btnrow" }, [
          el("button", {
            class:"btn primary",
            onClick: () => {
              try{
                err.style.display = "none";
                WeightEngine.add(dateInput.value || todayISO, weightInput.value);
                Modal.close();
                repaintAll();
              }catch(e){
                err.textContent = e.message || "Unable to save weight.";
                err.style.display = "block";
              }
            }
          }, ["Save"]),
          el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
        ])
      ])
    });
  }

  function repaintAll(){
    repaintSummary();
    repaintChart();
    repaintHistory(); // keeps collapsed by default
  }

  function repaintSummary(){
    const latest = WeightEngine.latest();
    const avg7 = WeightEngine.avg7(latest?.dateISO || todayISO);

    summaryKpi.innerHTML = "";

    const main = latest ? `${latest.weight}` : "—";
    const sub = latest
      ? ((latest.dateISO === todayISO) ? "Today" : `Latest • ${latest.dateISO}`)
      : "No weight entries yet.";

    // Change vs 7D avg (matches your mock)
    let change7 = null;
    if(latest && avg7 != null) change7 = round2((Number(latest.weight)||0) - (Number(avg7)||0));
    const change7Text = (change7 == null) ? "—" : (change7 > 0 ? `+${change7}` : `${change7}`);

    summaryKpi.appendChild(el("div", { class:"big", text: `${main} lb` }));
    summaryKpi.appendChild(el("div", { class:"small", text: sub }));
    summaryKpi.appendChild(el("div", { class:"small", text: `Change: ${change7Text} lb (7d)` }));
  }

  function repaintChart(){
    const ascAll = WeightEngine.listAsc();
    const asc = ascAll.slice(-rangeDays);

    if(asc.length < 2){
      destroyWeightChart();
      chartNote.textContent = "Add at least 2 entries to see the trend line.";
      return;
    }

    renderWeightChart(canvas, asc);
    chartNote.textContent = `Showing last ${asc.length} entries`;
  }

  function repaintHistory(){
    // collapsed by default
    historyCard.classList.toggle("open", !!historyOpen);
    historyBody.style.display = historyOpen ? "block" : "none";

    const chevron = historyCard.querySelector(".accChevron");
    if(chevron) chevron.textContent = historyOpen ? "▴" : "▾";

    if(!historyOpen) return;

    const desc = WeightEngine.listDesc();
    tableHost.innerHTML = "";

    if(desc.length === 0){
      tableHost.appendChild(el("div", { class:"note", text:"No entries yet. Tap + Log to add your first one." }));
      return;
    }

    desc.slice(0, 60).forEach(row => {
      tableHost.appendChild(el("div", { class:"item" }, [
        el("div", { class:"left" }, [
          el("div", { class:"name", text: row.dateISO }),
          el("div", { class:"meta", text: `${row.weight} lb` })
        ]),
        el("div", { class:"actions" }, [
          el("button", {
            class:"mini danger",
            onClick: () => {
              Modal.open({
                title: "Delete entry?",
                center: true,
                size: "sm",
                bodyNode: el("div", {}, [
                  el("div", { class:"note", text:`Delete ${row.weight} lb on ${row.dateISO}?` }),
                  el("div", { style:"height:12px" }),
                  el("div", { class:"btnrow" }, [
                    el("button", {
                      class:"btn danger",
                      onClick: () => {
                        WeightEngine.remove(row.id);
                        Modal.close();
                        repaintAll();
                      }
                    }, ["Delete"]),
                    el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
                  ])
                ])
              });
            }
          }, ["Delete"])
        ])
      ]));
    });
  }
},
  Attendance(){

        AttendanceEngine.ensure();

        // default month = current
        const today = Dates.todayISO();
        let { y, m } = ymFromISO(today);

        const weekStartsOn = state.profile?.weekStartsOn || "mon"; // affects calendar header order
        const weekStart = (weekStartsOn === "sun") ? 0 : 1;

        const root = el("div", { class:"grid" });

        const header = el("div", { class:"card" }, [
          el("h2", { text:"Attendance" }),
          el("div", { class:"note", text:"Tap a day to mark it trained. Shows monthly count + clear month." })
        ]);

        const card = el("div", { class:"card" }, [
          el("h2", { text:"Calendar" })
        ]);

        const wrap = el("div", { class:"calWrap" });
        const top = el("div", { class:"calTop" });

        const title = el("div", { class:"calTitle" });
        const monthKpi = el("div", { class:"note" });

        const prevBtn = el("button", { class:"btn", onClick: () => { stepMonth(-1); } }, ["Prev"]);
        const nextBtn = el("button", { class:"btn", onClick: () => { stepMonth(1); } }, ["Next"]);

        const clearBtn = el("button", {
          class:"btn danger",
          onClick: () => {
            Modal.open({
              title: "Clear this month?",
              bodyNode: el("div", {}, [
                el("div", { class:"note", text:`This removes all trained days for ${monthTitle(y,m)}.` }),
                el("div", { style:"height:12px" }),
                el("div", { class:"btnrow" }, [
                  el("button", {
                    class:"btn danger",
                    onClick: () => {
                      AttendanceEngine.clearMonth(y, m);
                      Modal.close();
                      repaint();
                      renderView(); // Home dots update too
                    }
                  }, ["Clear month"]),
                  el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
                ])
              ])
            });
          }
        }, ["Clear month"]);

        top.appendChild(el("div", { class:"btnrow" }, [prevBtn, nextBtn]));
        top.appendChild(el("div", { style:"flex:1" }));
        top.appendChild(clearBtn);

        const grid = el("div", { class:"calGrid" });

        wrap.appendChild(top);
        wrap.appendChild(el("div", { style:"height:10px" }));
        wrap.appendChild(title);
        wrap.appendChild(el("div", { style:"height:6px" }));
        wrap.appendChild(monthKpi);
        wrap.appendChild(el("div", { style:"height:12px" }));
        wrap.appendChild(grid);

        card.appendChild(wrap);
        root.appendChild(header);
        root.appendChild(card);

        repaint();
        return root;

        function stepMonth(delta){
          m += delta;
          if(m <= 0){ m = 12; y -= 1; }
          if(m >= 13){ m = 1; y += 1; }
          repaint();
        }

        function weekdayLabels(){
          const sun = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          if(weekStart === 0) return sun;
          return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
        }

        function repaint(){
          AttendanceEngine.ensure();
          title.textContent = monthTitle(y, m);

          const count = AttendanceEngine.monthCount(y, m);
          monthKpi.textContent = `This month: ${count} sessions`;

          grid.innerHTML = "";

          // headers
          weekdayLabels().forEach(lbl => {
            grid.appendChild(el("div", { class:"calCell header", text: lbl }));
          });

          const dim = daysInMonth(y, m);
          const firstDow = firstDayDow(y, m); // 0=Sun..6=Sat

          // convert firstDow to our grid index based on weekStart
          let leading = firstDow - weekStart;
          if(leading < 0) leading += 7;

          for(let i=0;i<leading;i++){
            grid.appendChild(el("div", { class:"calCell blank", text:"" }));
          }

          for(let d=1; d<=dim; d++){
            const dateISO = isoForYMD(y, m, d);
            const on = isTrained(dateISO);

            const cell = el("div", {
              class: "calCell" + (on ? " on" : ""),
              text: String(d),
              onClick: () => {
                toggleTrained(dateISO);
                repaint();
                renderView(); // updates Home dots too
              }
            });

            grid.appendChild(cell);
          }

          // pad to full weeks for cleaner bottom edge (optional)
          const totalCells = 7 + leading + dim; // +7 for header row
          const remainder = totalCells % 7;
          if(remainder !== 0){
            const pads = 7 - remainder;
            for(let i=0;i<pads;i++){
              grid.appendChild(el("div", { class:"calCell blank", text:"" }));
            }
          }
        }
      },

    }; // ✅ end Views object
    Views.ExerciseLibraryManager = function(){
  ExerciseLibrary.ensureSeeded();

  const ui = UIState.libraryManage;
  const root = el("div", { class:"grid" });

  // Header
  root.appendChild(el("div", { class:"card" }, [
    el("div", { class:"kpi" }, [
      el("div", { class:"big", text:"Exercise Library" }),
      el("div", { class:"small", text:"Search, add, edit, or delete exercises." })
    ]),
    el("div", { style:"height:10px" }),
    el("div", { class:"btnrow" }, [
      el("button", { class:"btn", onClick: () => navigate("settings") }, ["← Settings"]),
      el("button", { class:"btn primary", onClick: () => openAddEditModal(null) }, ["+ Add Exercise"])
    ])
  ]));

  // Controls
  const controls = el("div", { class:"card" }, [ el("h2", { text:"Filters" }) ]);

  const typeChips = el("div", { class:"chips" });
  ExerciseLibrary.typeKeys.forEach(t => {
    typeChips.appendChild(el("div", {
      class:"chip" + (ui.type === t ? " on" : ""),
      onClick: () => { ui.type = t; ui.equipment = "all"; renderView(); }
    }, [ExerciseLibrary.typeLabel(t)]));
  });

  const search = el("input", { type:"text", placeholder:"Search exercises…", value: ui.q || "" });
  search.addEventListener("input", (e) => { ui.q = e.target.value || ""; renderList(); });

  const equipSelect = el("select", {});
  equipSelect.appendChild(el("option", { value:"all", text:"All equipment" }));
  const equipSet = new Set();
  ExerciseLibrary.list(ui.type).forEach(x => { if(x.equipment) equipSet.add(x.equipment); });
  Array.from(equipSet).sort().forEach(eq => equipSelect.appendChild(el("option", { value:eq, text:eq })));
  equipSelect.value = ui.equipment || "all";
  equipSelect.addEventListener("change", (e) => { ui.equipment = e.target.value || "all"; renderList(); });

  controls.appendChild(el("div", { class:"note", text:"Type" }));
  controls.appendChild(typeChips);
  controls.appendChild(el("div", { style:"height:10px" }));
  controls.appendChild(el("div", { class:"row2" }, [
    el("label", {}, [ el("span", { text:"Search" }), search ]),
    el("label", {}, [ el("span", { text:"Equipment" }), equipSelect ])
  ]));

  root.appendChild(controls);

  // List
  const listCard = el("div", { class:"card" }, [
    el("h2", { text:"Exercises" }),
    el("div", { class:"note", text:"Tip: Deleting an exercise will not erase old logs (they use the saved name snapshot)." })
  ]);
const listHost = el("div", { style:"display:flex; flex-direction:column; gap:10px; margin-top:10px;" });

function renderList(){
  listHost.innerHTML = "";

  const q = (ui.q || "").trim().toLowerCase();
  const eq = ui.equipment || "all";

  const items = ExerciseLibrary.list(ui.type)
    .filter(x => !q || (x.name || "").toLowerCase().includes(q))
    .filter(x => eq === "all" || (x.equipment || "") === eq)
    .sort((a,b) => (a.name || "").localeCompare(b.name || ""));

  if(items.length === 0){
    listHost.appendChild(el("div", { class:"note", text:"No exercises match your filters." }));
  } else {
    items.forEach(ex => {
      const sub = (() => {
        if(ui.type === "weightlifting"){
          const parts = [];
          if(ex.primaryMuscle) parts.push(ex.primaryMuscle);
          if(ex.equipment) parts.push(ex.equipment);
          if(typeof ex.isCompound === "boolean") parts.push(ex.isCompound ? "compound" : "isolation");
          return parts.join(" • ") || "—";
        }
        if(ui.type === "cardio"){
          const parts = [];
          if(ex.modality) parts.push(ex.modality);
          if(ex.supportsIncline) parts.push("incline");
          return parts.join(" • ") || "—";
        }
        const parts = [];
        if(ex.equipment) parts.push(ex.equipment);
        return parts.join(" • ") || "—";
      })();

      listHost.appendChild(el("div", { class:"item" }, [
        el("div", { style:"font-weight:860; letter-spacing:.1px;", text: ex.name }),
        el("div", { class:"meta", text: sub }),
        el("div", { style:"height:10px" }),
        el("div", { class:"btnrow" }, [
          el("button", { class:"btn", onClick: () => openAddEditModal(ex) }, ["Edit"]),
          el("button", { class:"btn danger", onClick: () => attemptDelete(ex) }, ["Delete"])
        ])
      ]));
    });
  }
}

// ✅ initial paint
renderList();

listCard.appendChild(listHost);
root.appendChild(listCard);

  function countRoutineRefs(type, exerciseId){
    let count = 0;
    (state.routines || []).forEach(r => {
      (r.days || []).forEach(d => {
        (d.exercises || []).forEach(rx => {
          if(rx.type === type && rx.exerciseId === exerciseId) count++;
        });
      });
    });
    return count;
  }

  function attemptDelete(ex){
    const refs = countRoutineRefs(ui.type, ex.id);
    const note = refs
      ? `This exercise is currently used in ${refs} routine slot(s). Deleting it will remove it from those routines.`
      : "Delete this exercise from your library?";

    confirmModal({
      title: "Delete exercise",
      note,
      confirmText: "Delete",
      danger: true,
      onConfirm: () => {
        ExerciseLibrary.remove(ui.type, ex.id);
        Storage.save(state);
        showToast("Deleted");
        renderView();
      }
    });
  }
function openAddEditModal(existing){
  const isEdit = !!existing;

  // Keep old type (important for migrations)
  const oldType = String(existing?.type || ui.type || "weightlifting");

  const name = el("input", {
    type:"text",
    value: existing?.name || "",
    placeholder:"Exercise name"
  });

  const equip = el("input", {
    type:"text",
    value: existing?.equipment || "",
    placeholder:"e.g., Dumbbell, Barbell, Machine"
  });

  // ────────────────────────────
  // Glass dropdown options
  // ────────────────────────────
  const TYPE_OPTS = [
    { v:"weightlifting", t:"Weightlifting" },
    { v:"cardio",        t:"Cardio" },
    { v:"core",          t:"Core" }
  ];

  const PRIMARY_OPTS = [
    "Chest","Shoulders","Arms","Back","Legs","Full Body","Cardio","Core"
  ];

  const SECONDARY_OPTS = [
    "Upper Chest",
    "Lower Chest",
    "Front Delts",
    "Side Delts",
    "Rear Delts",
    "Traps",
    "Biceps",
    "Triceps",
    "Brachialis",
    "Forearms",
    "Lats",
    "Rhomboids",
    "Erector Spinae",
    "Quads",
    "Hamstrings",
    "Glutes",
    "Calves",
    "Adductors",
    "Abductors",
    "Abs",
    "Obliques",
    "Transverse Abdominis",
    "Grip",
    "Hip Flexors"
  ];

  function makeSelect(options, value){
    const sel = el("select", {
      style: [
        "width:100%",
        "border-radius:14px",
        "padding:12px",
        "border:1px solid rgba(255,255,255,12)",
        "background: rgba(255,255,255,06)",
        "color: rgba(255,255,255,92)",
        "outline:none"
      ].join(";")
    });

    options.forEach(opt => {
      if(typeof opt === "string"){
        sel.appendChild(el("option", { value: opt, text: opt }));
      }else{
        sel.appendChild(el("option", { value: opt.v, text: opt.t }));
      }
    });

    if(value != null) sel.value = String(value);
    return sel;
  }

  function makeMultiSelect(options, selectedArr){
    const sel = el("select", {
      multiple: true,
      style: [
        "width:100%",
        "border-radius:14px",
        "padding:12px",
        "border:1px solid rgba(255,255,255,12)",
        "background: rgba(255,255,255,06)",
        "color: rgba(255,255,255,92)",
        "outline:none",
        // multi-select needs height to be usable on phone
        "min-height:140px"
      ].join(";")
    });

    const selected = new Set((selectedArr || []).map(String));
    options.forEach(v => {
      const opt = el("option", { value: v, text: v });
      if(selected.has(String(v))) opt.selected = true;
      sel.appendChild(opt);
    });

    return sel;
  }

  // Type dropdown (NEW)
  const typeSel = makeSelect(TYPE_OPTS, oldType);

  // Primary + Secondary dropdowns (NEW)
  const primarySel = makeSelect(PRIMARY_OPTS, existing?.primaryMuscle || "");
  const secondarySel = makeMultiSelect(SECONDARY_OPTS, existing?.secondaryMuscles || []);

  // If they change Type, auto-suggest Primary for cardio/core (non-destructive)
  typeSel.addEventListener("change", () => {
    const t = String(typeSel.value || "");
    if(t === "cardio" && (!primarySel.value || primarySel.value === "")) primarySel.value = "Cardio";
    if(t === "core" && (!primarySel.value || primarySel.value === "")) primarySel.value = "Core";
  });

  function migrateReferences(exId, fromType, toType){
    if(!exId || fromType === toType) return;

    // Update routine slots
    (state.routines || []).forEach(r => {
      (r.days || []).forEach(d => {
        (d.exercises || []).forEach(rx => {
          if(rx.exerciseId === exId && rx.type === fromType){
            rx.type = toType;
          }
        });
      });
    });

    // Update workout logs
    (state.logs?.workouts || []).forEach(e => {
      if(e.exerciseId === exId && e.type === fromType){
        e.type = toType;
      }
    });
  }

  Modal.open({
    title: isEdit ? "Edit exercise" : "Add exercise",
    bodyNode: el("div", {}, [
      el("label", {}, [ el("span", { text:"Name" }), name ]),
      el("div", { style:"height:10px" }),

      // NEW: Type selector
      el("label", {}, [ el("span", { text:"Type" }), typeSel ]),
      el("div", { style:"height:10px" }),

      el("label", {}, [ el("span", { text:"Equipment" }), equip ]),
      el("div", { style:"height:10px" }),

      // NEW: Primary/Secondary selectors
      el("label", {}, [ el("span", { text:"Primary muscle" }), primarySel ]),
      el("div", { style:"height:10px" }),

      el("label", {}, [
        el("span", { text:"Secondary muscles (multi-select)" }),
        secondarySel
      ]),
      el("div", { class:"note", text:"Tip: iPhone — you can tap multiple options. (This saves to secondaryMuscles[] and won’t break existing logic.)" }),

      el("div", { style:"height:12px" }),
      el("div", { class:"btnrow" }, [
        el("button", {
          class:"btn primary",
          onClick: () => {
            const nm = (name.value || "").trim();
            if(!nm) return showToast("Name is required");

            const newType = String(typeSel.value || ui.type || "weightlifting");
            const exId = existing?.id || uid("ex");

            const selectedSecondary = Array.from(secondarySel.selectedOptions || [])
              .map(o => String(o.value || "").trim())
              .filter(Boolean);

            // Preserve existing fields to avoid wiping cardio/core-specific properties
            const payload = {
              ...(existing || {}),
              id: exId,
              type: newType,
              name: nm,
              equipment: (equip.value || "").trim(),
              primaryMuscle: String(primarySel.value || "").trim(),
              secondaryMuscles: selectedSecondary
            };

            // If editing AND type changes: migrate library bucket + update routine/log refs
            if(isEdit){
              if(oldType !== newType){
                // Move exercise to new library type
                ExerciseLibrary.remove(oldType, exId);
                ExerciseLibrary.add(newType, payload);

                // Keep routines/logs consistent
                migrateReferences(exId, oldType, newType);

                // Keep UI on the new type so the user sees it immediately
                ui.type = newType;
              }else{
                ExerciseLibrary.update(newType, payload);
              }
            }else{
              ExerciseLibrary.add(newType, payload);
              ui.type = newType;
            }

            Storage.save(state);
            Modal.close();
            showToast(isEdit ? "Updated" : "Added");
            renderView();
          }
        }, [isEdit ? "Save" : "Add"]),
        el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
      ])
    ])
  });
}

  return root;
};
Views.RoutineEditor = function(){
  ExerciseLibrary.ensureSeeded();

  const root = el("div", { class:"grid" });
  const active = Routines.getActive();

  if(!active){

    function openRoutineRecovery(){
      const body = el("div", {}, [
        el("div", { class:"note", text:"Choose a template to recreate a routine. This will set it as active and reopen the editor." }),
        el("div", { style:"height:12px" })
      ]);

      const list = el("div", { class:"list" });

      (RoutineTemplates || []).forEach(tpl => {
        list.appendChild(el("div", {
          class:"item",
          onClick: () => {
            try{
              Routines.addFromTemplate(tpl.key, tpl.name);
              Modal.close();
              showToast(`Created: ${tpl.name}`);
              renderView(); // RoutineEditor will re-render with the new active routine
            }catch(e){
              Modal.open({
                title:"Could not create routine",
                bodyNode: el("div", {}, [
                  el("div", { class:"note", text: e?.message || "Something went wrong while creating a routine." }),
                  el("div", { style:"height:12px" }),
                  el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
                ])
              });
            }
          }
        }, [
          el("div", { class:"left" }, [
            el("div", { class:"name", text: tpl.name }),
            el("div", { class:"meta", text: tpl.desc || "Template" })
          ]),
          el("div", { class:"actions" }, [
            el("div", { class:"meta", text:"Create" })
          ])
        ]));
      });

      body.appendChild(list);

      body.appendChild(el("div", { style:"height:14px" }));
      body.appendChild(el("div", { class:"btnrow" }, [
        el("button", { class:"btn", onClick: () => { Modal.close(); navigate("routine"); } }, ["Back to Routine"]),
        el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
      ]));

      Modal.open({
        title:"Create a routine",
        center: true,
        bodyNode: body
      });
    }

    root.appendChild(el("div", { class:"card" }, [
      el("h2", { text:"Routine Editor" }),
      el("div", { class:"note", text:"No active routine found. Create one to continue." }),
      el("div", { style:"height:12px" }),
      el("div", { class:"btnrow" }, [
        el("button", { class:"btn primary", onClick: openRoutineRecovery }, ["Create routine"]),
        el("button", { class:"btn", onClick: () => navigate("routine") }, ["Back to Routine"])
      ])
    ]));

    return root;
  }

  const header = el("div", { class:"card" }, [
    el("h2", { text:"Routine Editor" }),
    el("div", { class:"note", text:`Editing: ${active.name}` }),
    el("div", { style:"height:10px" }),
    el("div", { class:"btnrow" }, [
      el("button", {
        class:"btn",
        onClick: () => navigate("routine")
      }, ["Back to Routine"]),
      el("button", {
        class:"btn",
        onClick: (e) => renameRoutine(e.currentTarget, active.id)
      }, ["Rename"]),
      el("button", {
        class:"btn",
        onClick: () => { Routines.duplicate(active.id); renderView(); }
      }, ["Duplicate"]),
      el("button", {
        class:"btn danger",
        onClick: (e) => confirmDelete(e.currentTarget, active.id)
      }, ["Delete"])
    ])
  ]);
  // ────────────────────────────
  // Templates (same 5 as Onboarding)
  // ────────────────────────────
  const templatesCard = el("div", { class:"card" }, [
    el("h2", { text:"Templates" }),
    el("div", { class:"note", text:"Choose a template to switch your active routine. If it already exists, it will activate (no duplicates)." }),
    el("div", { style:"height:10px" })
  ]);

  const tplList = el("div", { class:"list" });

  function findExistingRoutineForTemplate(tpl){
    const all = Routines.getAll() || [];
    // Prefer templateKey match
    const byKey = all.find(r => String(r.templateKey || "") === String(tpl.key || ""));
    if(byKey) return byKey;
    // Fallback to name match (older saves)
    const byName = all.find(r => normName(r.name) === normName(tpl.name));
    return byName || null;
  }

  (RoutineTemplates || []).forEach(tpl => {
    const existing = findExistingRoutineForTemplate(tpl);

    tplList.appendChild(el("div", {
      class:"item",
      onClick: () => {
        // If it exists, activate it (no recreation)
        const existingNow = findExistingRoutineForTemplate(tpl);
        if(existingNow){
          Routines.setActive(existingNow.id);
          showToast(`Active: ${existingNow.name}`);
          renderView(); // re-render editor on the newly active routine
          return;
        }

        // Otherwise create ONE routine for that template (exact template name)
        Routines.addFromTemplate(tpl.key, tpl.name);
        showToast(`Created: ${tpl.name}`);
        renderView();
      }
    }, [
      el("div", { class:"left" }, [
        el("div", { class:"name", text: tpl.name }),
        el("div", { class:"meta", text: tpl.desc || "Template" })
      ]),
      el("div", { class:"actions" }, [
        el("div", { class:"meta", text: existing ? "Activate" : "Add" })
      ])
    ]));
  });

  templatesCard.appendChild(tplList);

  const daysCard = el("div", { class:"card" }, [
    el("h2", { text:"Days" }),
    el("div", { class:"note", text:"Tap a day to edit label, rest day, or exercises." })
  ]);

  const daysGrid = el("div", { class:"dayGrid" });
  daysCard.appendChild(el("div", { style:"height:10px" }));
  daysCard.appendChild(daysGrid);

  root.appendChild(header);
  root.appendChild(templatesCard);
  root.appendChild(daysCard);

  repaintDays();
  return root;

  function repaintDays(){
    const r = Routines.getActive();
    daysGrid.innerHTML = "";

    (r.days || []).forEach(day => {
      const exCount = (day.exercises || []).length;

      const card = el("div", { class:"dayCard" }, [
        el("div", { class:"dayTop" }, [
          el("div", { class:"dayTitle" }, [
            el("div", { class:"lbl", text: `${["SUN","MON","TUE","WED","THU","FRI","SAT"][day.order]} — ${day.label}` }),
            el("div", { class:"sub", text: day.isRest ? "Rest day" : `${exCount} exercises` })
          ]),
          el("button", {
            class:"mini",
            onClick: () => editDay(day)
          }, ["Edit"])
        ])
      ]);

      const list = el("div", { class:"exList" });

      if(day.isRest){
        list.appendChild(el("div", { class:"note", text:"No exercises on rest days." }));
      }else if(exCount === 0){
        list.appendChild(el("div", { class:"note", text:"No exercises yet. Tap Edit → Add exercise." }));
      }else{
        (day.exercises || []).forEach(rx => {
          const name = resolveExerciseName(rx.type, rx.exerciseId, rx.nameSnap);
          list.appendChild(el("div", { class:"exRow" }, [
            el("div", { class:"n", text:name }),
            el("button", {
              class:"mini danger",
              onClick: () => { Routines.removeExerciseFromDay(r.id, day.id, rx.id); repaintDays(); }
            }, ["Remove"])
          ]));
        });
      }

      card.appendChild(list);
      daysGrid.appendChild(card);
    });
  }

function renameRoutine(anchorEl, routineId){
  const current = Routines.getActive();
  const input = el("input", {
    type:"text",
    value: current?.name || "",
    style:"width:100%;"
  });

  const err = el("div", {
    class:"note",
    style:"display:none; color: rgba(255,92,122,.95); margin-top:8px;"
  });

  const body = el("div", {}, [
    el("div", { class:"popTitle", text:"Rename routine" }),
    el("div", { style:"display:grid; gap:10px;" }, [
      input,
      err,
      el("div", { class:"btnrow" }, [
        el("button", {
          class:"btn primary",
          onClick: () => {
            err.style.display = "none";
            const name = (input.value || "").trim();
            if(!name){
              err.textContent = "Enter a name.";
              err.style.display = "block";
              return;
            }
            Routines.rename(routineId, name);
            PopoverClose();
            renderView();
          }
        }, ["Save"]),
        el("button", { class:"btn", onClick: PopoverClose }, ["Cancel"])
      ])
    ])
  ]);

  PopoverOpen(anchorEl, body);
  setTimeout(() => input.focus(), 0);
}

function confirmDelete(anchorEl, routineId){
  const body = el("div", {}, [
    el("div", { class:"popTitle", text:"Delete routine?" }),
    el("div", { class:"note", text:"This deletes the routine. Logs stay, but the routine schedule will be removed." }),
    el("div", { style:"height:10px" }),
    el("div", { class:"btnrow" }, [
      el("button", {
        class:"btn danger",
        onClick: () => {
          Routines.remove(routineId);
          PopoverClose();
          navigate("routine");
        }
      }, ["Delete"]),
      el("button", { class:"btn", onClick: PopoverClose }, ["Cancel"])
    ])
  ]);

  PopoverOpen(anchorEl, body);
}

  function editDay(day){
    const r = Routines.getActive();

    const labelInput = el("input", { type:"text", value: day.label || "" });

    const restSwitch = el("div", { class:"switch" + (day.isRest ? " on" : "") });
    restSwitch.addEventListener("click", () => {
      const next = !restSwitch.classList.contains("on");
      restSwitch.classList.toggle("on", next);
    });

const addBtn = el("button", {
  class:"btn primary",
  onClick: () => openAddExercise(r.id, day.id, { keepOpen:false })
}, ["Add exercise"]);

const addMultiBtn = el("button", {
  class:"btn",
  onClick: () => openAddExercise(r.id, day.id, { keepOpen:true })
}, ["Add multiple"]);


    Modal.open({
      title: "Edit day",
      bodyNode: el("div", {}, [
        el("label", {}, [ el("span", { text:"Label" }), labelInput ]),
        el("div", { style:"height:10px" }),
        el("div", { class:"toggle" }, [
          el("div", { class:"ttext" }, [
            el("div", { class:"a", text:"Rest day" }),
            el("div", { class:"b", text:"If enabled, exercises are hidden on Routine." })
          ]),
          restSwitch
        ]),
        el("div", { style:"height:12px" }),
        el("div", { class:"btnrow" }, [ addBtn, addMultiBtn ]),
        el("div", { style:"height:12px" }),
        el("div", { class:"btnrow" }, [
          el("button", {
            class:"btn",
            onClick: () => {
              const nextLabel = (labelInput.value || "").trim() || day.label;
              const isRest = restSwitch.classList.contains("on");
              Routines.setDayLabel(r.id, day.id, nextLabel);
              Routines.setRestDay(r.id, day.id, isRest);
              Modal.close();
              repaintDays();
            }
          }, ["Save"]),
          el("button", { class:"btn", onClick: Modal.close }, ["Close"])
        ])
      ])
    });
  }

  function openAddExercise(routineId, dayId, opts={}){
    // Compact, phone-first "Add Exercise" modal
    // - Active day context (top)
    // - Fixed search bar
    // - Scrollable exercise sections grouped by Primary Muscle (tap to expand)
    // - Fixed Add/Done bar (supports multi-add when opts.keepOpen === true)
    ExerciseLibrary.ensureSeeded();

    const routine = (state.routines || []).find(r => r.id === routineId) || Routines.getActive();
    const day = (routine?.days || []).find(d => d.id === dayId) || null;

    const dayIndex = day ? (routine.days || []).findIndex(d => d.id === dayId) : -1;
    const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const dayTag = (dayIndex >= 0 && dayIndex < 7) ? dow[dayIndex] : "Day";
    const dayLabel = (day?.label || "").trim();
    const dayTitle = dayLabel ? `${dayTag} • ${dayLabel}` : `${dayTag}`;

    // Tracks what the user adds during THIS open session (for live count)
    const addedThisSession = new Set();

    // Persisted exercises already on this day (to prevent duplicates)
    function getExistingSetForDay(){
      const s = new Set();
      (day?.exercises || []).forEach(rx => s.add(`${rx.type}:${rx.exerciseId}`));
      return s;
    }

    // Search state
    let query = "";

    // Collapsed/expanded groups (session only)
    const openGroups = new Set();

    // If day label hints a muscle, open that group by default
    (function seedOpenGroupFromDay(){
      const hint = normName(dayLabel || "");
      const mus = (state.exerciseLibrary?.weightlifting || [])
        .map(x => String(x.primaryMuscle || "").trim())
        .filter(Boolean);

      const match = mus.find(m => hint && hint.includes(normName(m)));
      if(match) openGroups.add(match);
    })();

    // UI nodes
    const ctx = el("div", { class:"addExCtx" }, [
      el("div", { class:"addExCtxA", text:"Add exercises to" }),
      el("div", { class:"addExCtxB", text: dayTitle })
    ]);

    const searchWrap = el("div", { class:"addExSearch" }, [
      el("div", { class:"ico", text:"🔎" }),
      el("input", {
        type:"text",
        value:"",
        placeholder:"Search exercises…",
        onInput: (e) => {
          query = String(e.target.value || "");
          repaint();
        }
      })
    ]);

    const scroller = el("div", { class:"addExScroller" });
    const bottomBar = el("div", { class:"addExBottom" });

    const countPill = el("div", { class:"addExCount", text:"0 added" });
    const doneBtn = el("button", {
      class:"btn primary",
      onClick: () => Modal.close()
    }, [opts.keepOpen ? "Done" : "Close"]);

    function updateCount(){
      countPill.textContent = `${addedThisSession.size} added`;
    }
    // Helper: find the routineExerciseId (rx.id) for a given library exercise on this day
    function findRxIdOnDay(type, exId){
      // Always re-fetch the latest day object (in case state changed while modal is open)
      const latestDay = Routines.getDay(routineId, dayId) || day;
      const rx = (latestDay?.exercises || []).find(e => e.type === type && e.exerciseId === exId);
      return rx?.id || null;
    }

    // Helper: set button/row UI state
    function setRowState({ row, btn, mode }){
      // mode: "add" | "remove"
      if(!row || !btn) return;

      row.classList.remove("selected", "disabledRow");
      btn.classList.remove("added", "disabledBtn", "danger");

      if(mode === "remove"){
        row.classList.add("selected");
        btn.classList.add("danger");
        btn.textContent = "Remove";
        btn.disabled = false;
      }else{
        btn.textContent = "Add";
        btn.disabled = false;
      }
    }

    function addExercise(type, exId, key, rowBtn, rowEl){
      // Toggle behavior:
      // - If already in day: remove
      // - If not: add
      const existingSet = getExistingSetForDay();
      const alreadyInDay = existingSet.has(key);

      if(alreadyInDay){
        const rxId = findRxIdOnDay(type, exId);
        if(rxId){
          Routines.removeExerciseFromDay(routineId, dayId, rxId);
        }

        // If it was added during THIS modal session, reduce the counter
        if(addedThisSession.has(key)) addedThisSession.delete(key);
        updateCount();

        // Refresh Routine + modal list states
        repaintDays();
        repaint();

        // For single-add modal, keep it open on remove (less annoying)
        return;
      }

      // Add path (original behavior preserved)
      Routines.addExerciseToDay(routineId, dayId, type, exId);
      repaintDays();

      if(opts.keepOpen){
        addedThisSession.add(key);
        updateCount();

        // Keep open and flip the row into "Remove" state
        setRowState({ row: rowEl, btn: rowBtn, mode: "remove" });
      }else{
        Modal.close();
      }
    }

    function renderRow(type, x, existingSet){
      const key = `${type}:${x.id}`;
      const alreadyInDay = existingSet.has(key);

      const row = el("div", { class:"item addExRow" });
      const btn = el("button", { class:"mini" }, ["Add"]);

      // Build meta as DOM nodes so we can highlight secondary muscles
      const metaNodes = [];

      // Helpers
      const pushSep = () => metaNodes.length ? metaNodes.push(document.createTextNode(" • ")) : null;
      const pushText = (t) => {
        const s = String(t || "").trim();
        if(!s) return;
        pushSep();
        metaNodes.push(document.createTextNode(s));
      };
      const pushSecondary = (t) => {
        const s = String(t || "").trim();
        if(!s) return;
        pushSep();
        metaNodes.push(el("span", { class:"secMuscle", text: s }));
      };

      if(type === "weightlifting"){
        // Primary muscle (support legacy "Chest / Triceps" formatting)
        const rawPrimary = String(x.primaryMuscle || "").trim();
        const primaryOnly = rawPrimary.includes("/") ? rawPrimary.split("/")[0].trim() : rawPrimary;
        if(primaryOnly) pushText(primaryOnly);

        // Secondary muscles (preferred: array)
        const secs = Array.isArray(x.secondaryMuscles) ? x.secondaryMuscles.filter(Boolean) : [];
        if(secs.length){
          secs.forEach(sm => pushSecondary(sm));
        }else{
          // Fallback: parse legacy "Primary / Secondary" format
          if(rawPrimary.includes("/")){
            const parsed = rawPrimary.split("/").slice(1).join("/").trim();
            if(parsed) pushSecondary(parsed);
          }
        }

        // Equipment
        if(x.equipment) pushText(x.equipment);
      }else{
        // Cardio/Core keep current meta style
        if(x.equipment) pushText(x.equipment);
      }

      // Type label always last
      pushText(ExerciseLibrary.typeLabel(type));

      row.appendChild(
        el("div", { class:"left" }, [
          el("div", { class:"name", text:x.name }),
          el("div", { class:"meta" }, metaNodes.length ? metaNodes : [document.createTextNode("")])
        ])
      );
      row.appendChild(el("div", { class:"actions" }, [ btn ]));

      // ✅ NEW: if it’s already in the day, show a removable state (not disabled)
      if(alreadyInDay){
        setRowState({ row, btn, mode: "remove" });
      }else{
        setRowState({ row, btn, mode: "add" });
      }

      btn.addEventListener("click", () => addExercise(type, x.id, key, btn, row));
      return row;
    }

    function toggleGroup(name){
      if(openGroups.has(name)) openGroups.delete(name);
      else openGroups.add(name);
      repaint();
    }

    function renderGroup(title, items, existingSet){
      const isOpen = openGroups.has(title);

      const head = el("div", {
        class:"addExGroupHead",
        onClick: () => toggleGroup(title)
      }, [
        el("div", { class:"addExGroupLeft" }, [
          el("div", { class:"addExGroupTitle", text:title }),
          el("div", { class:"addExGroupSub", text:`${items.length} exercise${items.length===1?"":"s"}` })
        ]),
        el("div", { class:"addExGroupCaret", text: isOpen ? "▾" : "▸" })
      ]);

      const body = el("div", {
        class:"addExGroupBody",
        style: isOpen ? "" : "display:none;"
      });

      items.forEach(x => body.appendChild(renderRow(x.type, x, existingSet)));

      return el("div", { class:"addExGroup" }, [ head, body ]);
    }

    function repaint(){
      scroller.innerHTML = "";
      const existingSet = getExistingSetForDay();

      // ✅ No segmented control: unify all categories
      const libs = {
        weightlifting: (state.exerciseLibrary?.weightlifting || []).slice(),
        cardio:        (state.exerciseLibrary?.cardio || []).slice(),
        core:          (state.exerciseLibrary?.core || []).slice()
      };

      const all = []
        .concat(libs.weightlifting.map(x => ({...x, type:"weightlifting"})))
        .concat(libs.cardio.map(x => ({...x, type:"cardio"})))
        .concat(libs.core.map(x => ({...x, type:"core"})));

      const q = normName(query || "");

      // Search: flat list (fast + compact)
      if(q){
        const hits = all
          .filter(x => normName(x.name).includes(q))
          .sort((a,b) => (a.name||"").localeCompare(b.name||""))
          .slice(0, 60);

        if(hits.length === 0){
          scroller.appendChild(el("div", { class:"note", text:"No matches. Try a different keyword." }));
          updateCount();
          return;
        }

        scroller.appendChild(el("div", { class:"addExSearchHint", text:`Results (${hits.length})` }));
        const wrap = el("div", { class:"list" });
        hits.forEach(x => wrap.appendChild(renderRow(x.type, x, existingSet)));
        scroller.appendChild(wrap);

        updateCount();
        return;
      }

      // Weightlifting grouped by primaryMuscle (tap to expand)
      const wl = libs.weightlifting
        .map(x => ({...x, type:"weightlifting"}))
        .sort((a,b) => (a.name||"").localeCompare(b.name||""));

      // ✅ Fixed display order (your requirement)
      const MUSCLE_ORDER = ["Chest", "Shoulders", "Arms", "Back", "Legs", "Full Body"];

      // ✅ Normalize messy primaryMuscle labels into our 6 buckets
      function normalizeBucket(primaryMuscle){
        const raw = String(primaryMuscle || "").trim();
        const m = raw.toLowerCase();

        if(!m) return "Other";

        // Full Body
        if(m.includes("full body")) return "Full Body";

        // Chest
        if(m.includes("chest") || m.includes("pec")) return "Chest";

        // Shoulders
        if(m.includes("shoulder") || m.includes("delt")) return "Shoulders";

        // Arms (also catches biceps/triceps/forearms)
        if(m.includes("arm") || m.includes("bicep") || m.includes("tricep") || m.includes("forearm")) return "Arms";

        // Back (also catches lats/traps)
        if(m.includes("back") || m.includes("lat") || m.includes("trap")) return "Back";

        // Legs (also catches quads/hamstrings/glutes/calves)
        if(
          m.includes("leg") || m.includes("quad") || m.includes("hamstring") ||
          m.includes("glute") || m.includes("calf")
        ) return "Legs";

        return "Other";
      }

      const byMuscle = new Map();
      wl.forEach(x => {
        const bucket = normalizeBucket(x.primaryMuscle);
        if(!byMuscle.has(bucket)) byMuscle.set(bucket, []);
        byMuscle.get(bucket).push(x);
      });

      // ✅ Only render buckets that actually have exercises
      const orderedBuckets = MUSCLE_ORDER.filter(k => (byMuscle.get(k) || []).length);

      // Safety bucket (only shows if needed)
      const otherItems = byMuscle.get("Other") || [];
      if(otherItems.length) orderedBuckets.push("Other");

      // Used later for the empty-state check (prevents "muscleNames" crashes)
      const hasWeightliftingGroups = orderedBuckets.length > 0;

      if(hasWeightliftingGroups){
        scroller.appendChild(el("div", { class:"addExSectionLabel", text:"Weightlifting (by muscle)" }));

        orderedBuckets.forEach(name => {
          const items = byMuscle.get(name) || [];
          // Keep alphabetical inside each muscle bucket (clean scanning)
          items.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
          scroller.appendChild(renderGroup(name, items, existingSet));
        });
      }

        // Cardio collapsible group
  const cardioItems = libs.cardio.map(x => ({...x, type:"cardio"}))
    .sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  
  if(cardioItems.length){
    scroller.appendChild(el("div", { style:"height:10px" }));
    scroller.appendChild(el("div", { class:"addExSectionLabel", text:"Cardio" }));
    // Default state: collapsed (do NOT auto-open)
    scroller.appendChild(renderGroup("Cardio", cardioItems, existingSet));
  }



// Core collapsible group
const coreItems = libs.core.map(x => ({...x, type:"core"}))
  .sort((a,b)=>(a.name||"").localeCompare(b.name||""));

if(coreItems.length){
  scroller.appendChild(el("div", { style:"height:10px" }));
  scroller.appendChild(el("div", { class:"addExSectionLabel", text:"Core" }));
  // Default state: collapsed (do NOT auto-open)
  scroller.appendChild(renderGroup("Core", coreItems, existingSet));
}


       if(!hasWeightliftingGroups && !cardioItems.length && !coreItems.length){
        scroller.appendChild(el("div", { class:"note", text:"No exercises yet. Seed the library or add exercises in Settings." }));
      }

      updateCount();
    }

    // Bottom bar content
    bottomBar.appendChild(countPill);
    bottomBar.appendChild(el("div", { style:"flex:1" }));
    bottomBar.appendChild(doneBtn);

    // First paint
    repaint();
    updateCount();

    Modal.open({
      title: "Add exercise",
      size: "lg",
      bodyNode: el("div", { class:"addExModal" }, [
        ctx,
        searchWrap,
        scroller,
        bottomBar
      ])
    });

    // Focus search immediately (fast on phones)
    setTimeout(() => {
      try{
        const inp = searchWrap.querySelector("input");
        inp && inp.focus && inp.focus();
      }catch(e){}
    }, 0);
  }
};   // ✅ closes Views.RoutineEditor function
