/********************
 * backup.js — extracted from app.js (Phase 3.0)
 * File backup export + JSON import validation + safe apply.
 *
 * State safety:
 * - Never edits schema directly
 * - All imported data passes through migrateState(saved)
 * - Import replaces the live in-memory state only after validation succeeds
 ********************/

export function initBackup({
  getState,
  setState,
  Storage,
  BackupVault,
  migrateState
}){
  if(typeof getState !== "function") throw new Error("initBackup requires getState()");
  if(typeof setState !== "function") throw new Error("initBackup requires setState(next)");
  if(!Storage) throw new Error("initBackup requires Storage");
  if(typeof migrateState !== "function") throw new Error("initBackup requires migrateState()");
  // BackupVault is best-effort (can be missing in some environments)

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
    const state = getState();
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
    const current = getState();

    // Safety net: snapshot current state BEFORE overwrite (best-effort, non-blocking)
    try{ BackupVault?.forceSnapshot?.(current, "pre-import"); }catch(_){}

    let parsed;
    try{
      parsed = JSON.parse(jsonText);
    }catch(e){
      throw new Error("Could not parse JSON. Make sure it’s valid.");
    }

    const importedState = validateImportedState(parsed);

    // Overwrite local storage + live state
    setState(importedState);
    Storage.save(importedState);

    // Snapshot the newly imported state as well (best-effort)
    try{ BackupVault?.forceSnapshot?.(importedState, "post-import"); }catch(_){}
  }

  return {
    downloadTextFile,
    exportBackupJSON,
    validateImportedState,
    importBackupJSON
  };
}
