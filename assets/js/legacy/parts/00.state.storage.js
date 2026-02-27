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

  // Profile hard guards (future-proof Home/Goals)
  if(merged.profile && typeof merged.profile === "object"){
    if(!Array.isArray(merged.profile.goals)) merged.profile.goals = [];

    // ✅ NEW: used to align routine days to when the user starts
    if(!merged.profile.startDateISO) merged.profile.startDateISO = Dates.todayISO();
  }

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

// ─────────────────────────────
// Profile helpers (Protein toggle + Week start mapping)
// ─────────────────────────────
function isProteinEnabled(){
  // Backward compatible default: enabled unless explicitly turned off
  return (state?.profile?.trackProtein !== false);
}

function normalizedWeekStartsOn(){
  const ws = state?.profile?.weekStartsOn;
  return (ws === 0 || ws === "0" || ws === "sun") ? "sun" : "mon";
}

// Convert JS Date.getDay() (0=Sun..6=Sat) into our "routine order index"
// where index 0 is the user's chosen week start.
function routineIndexFromJsDow(jsDow, weekStartsOn){
  const wd = Number(jsDow);
  if(!Number.isFinite(wd)) return 0;
  return (weekStartsOn === "sun") ? wd : ((wd + 6) % 7); // Mon-start => Mon=0 ... Sun=6
}

function weekdayNames(weekStartsOn){
  return (weekStartsOn === "sun")
    ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
    : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
}
