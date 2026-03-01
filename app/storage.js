/********************
 * Storage + Backup Vault (Module)
 * - Debounced localStorage writes + flush()
 * - Rolling snapshots (IndexedDB)
 * - Zero data loss tolerance (best-effort snapshotting)
 ********************/

import { STORAGE_KEY, DefaultState, migrateState } from "./state.js";

// ────────────────────────────
// Auto Backup Vault (Rolling Snapshots - IndexedDB)
// Keeps recent snapshots so users can restore if something goes wrong.
// ────────────────────────────
export const EXPORT_META_KEY = "gymdash:lastExportAt";

// tiny helpers (kept OUTSIDE state to avoid schema churn)
export function getLastExportAt(){
  const v = Number(localStorage.getItem(EXPORT_META_KEY) || 0);
  return Number.isFinite(v) ? v : 0;
}
export function setLastExportAt(ts){
  try{ localStorage.setItem(EXPORT_META_KEY, String(ts||Date.now())); }catch(_){}
}

export const BackupVault = (() => {
  const DB_NAME = "gymdash-backups";
  const DB_VERSION = 1;
  const STORE = "snapshots";
  const META = "meta";

  // policy
  const KEEP = 20;                    // keep last N
  const THROTTLE_MS = 5 * 60 * 1000;  // 5 min

  let _dbP = null;
  let __snapshotInFlight = null;

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

  async function _listSnapshots(db, limit){
    return new Promise((resolve) => {
      try{
        const out = [];
        const tx = db.transaction(STORE, "readonly");
        const idx = tx.objectStore(STORE).index("createdAt");
        const req = idx.openCursor(null, "prev");
        req.onsuccess = () => {
          const cur = req.result;
          if(cur && out.length < limit){
            out.push(cur.value);
            cur.continue();
          }else{
            resolve(out);
          }
        };
        req.onerror = () => resolve(out);
      }catch(_){ resolve([]); }
    });
  }

  async function _prune(db){
    // Keep only last KEEP by createdAt desc
    const snaps = await _listSnapshots(db, KEEP + 50);
    if(snaps.length <= KEEP) return true;

    const toDelete = snaps.slice(KEEP);
    return await new Promise((resolve) => {
      try{
        const tx = db.transaction(STORE, "readwrite");
        const st = tx.objectStore(STORE);
        toDelete.forEach(s => { try{ st.delete(s.id); }catch(_){ } });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      }catch(_){ resolve(false); }
    });
  }

  async function _createSnapshot(state, reason){
    const now = Date.now();
    return {
      id: `snap_${now}_${Math.random().toString(16).slice(2)}`,
      createdAt: now,
      reason: String(reason || "save"),
      data: state
    };
  }

  async function maybeSnapshot(s, reason="save"){
    // Dedupe in-flight snapshots
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

// ✅ failsafe: prevent Storage.save from crashing if handler is missing
export function handleStorageWriteError(e){
  try{
    // Minimal user-safe warning; you can enhance later
    console.warn("Storage write error:", e);
  }catch(_){}
}

// ────────────────────────────
// Storage (Debounced + Flushable)
// ────────────────────────────
export const Storage = (() => {
  const DEBOUNCE_MS = 250;

  let _timer = null;
  let _queuedState = null;

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return DefaultState();

      const parsed = JSON.parse(raw);

      // ✅ Always migrate/repair into latest schema
      return migrateState(parsed);
    }catch(_){
      return DefaultState();
    }
  }

  function _writeNow(s){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    // Auto-snapshot (non-blocking)
    try{ BackupVault.maybeSnapshot(s, "save"); }catch(_){}
  }

  function save(state){
    _queuedState = state;

    if(_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
      flush(); // flush queued
    }, DEBOUNCE_MS);
  }

  function flush(state){
    if(state) _queuedState = state;
    if(!_queuedState) return false;

    if(_timer){
      clearTimeout(_timer);
      _timer = null;
    }

    try{
      _writeNow(_queuedState);
      _queuedState = null;
      return true;
    }catch(e){
      console.warn("Storage.save failed:", e);
      handleStorageWriteError(e);
      return false;
    }
  }

  function reset(){
    try{
      if(_timer){
        clearTimeout(_timer);
        _timer = null;
      }
      _queuedState = null;
      localStorage.removeItem(STORAGE_KEY);
    }catch(e){
      console.warn("Storage.reset failed:", e);
    }
  }

  return { load, save, flush, reset };
})();
