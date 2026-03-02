/********************
 * attendance.js — extracted from app.js (Phase 2.9)
 * - Attendance helpers (explicit add/remove)
 * - Routine logging helpers (uses LogEngine)
 * - Floating "Next →" nudge UI helpers (transient only)
 *
 * State safety: preserves state.attendance and state.logs.workouts
 ********************/

export function initAttendance({
  getState,
  Storage,
  LogEngine,
  el
}){
  if(typeof getState !== "function") throw new Error("initAttendance requires getState()");
  if(!Storage) throw new Error("initAttendance requires Storage");
  if(!LogEngine) throw new Error("initAttendance requires LogEngine");
  if(typeof el !== "function") throw new Error("initAttendance requires el()");

  // ─────────────────────────────
  // Attendance helpers
  // ─────────────────────────────
  function attendanceHas(dateISO){
    const state = getState();
    state.attendance = state.attendance || [];
    return state.attendance.includes(dateISO);
  }

  function attendanceAdd(dateISO){
    const state = getState();
    state.attendance = state.attendance || [];
    if(!state.attendance.includes(dateISO)){
      state.attendance.push(dateISO);
      Storage.save(state);
    }
  }

  function attendanceRemove(dateISO){
    const state = getState();
    state.attendance = state.attendance || [];
    const i = state.attendance.indexOf(dateISO);
    if(i >= 0){
      state.attendance.splice(i, 1);
      Storage.save(state);
    }
  }

  // ─────────────────────────────
  // Routine logging helpers (per routine exercise instance)
  // ─────────────────────────────
  function hasRoutineExerciseLog(dateISO, routineExerciseId){
    const state = getState();
    LogEngine.ensure();
    return (state.logs.workouts || []).some(e =>
      e.dateISO === dateISO && e.routineExerciseId === routineExerciseId
    );
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

  // ─────────────────────────────
  // Floating "Next →" nudge (transient UI only)
  // ─────────────────────────────
  let __nextNudge = null; // { dateISO, dayOrder, nextRoutineExerciseId }

  function setNextNudge(n){
    __nextNudge = n;
  }

  function ensureFloatNext(){
    if(document.getElementById("floatNext")) return;

    const host = el("div", { class:"floatNext", id:"floatNext" }, [
      el("button", { class:"btn", id:"floatNextBtn" }, ["Next →"])
    ]);

    document.body.appendChild(host);
  }

  function maybeShowNextNudge(dateISO, day){
    const host = document.getElementById("floatNext");
    const btn  = document.getElementById("floatNextBtn");
    if(!host || !btn) return;

    const shouldShow = __nextNudge &&
      __nextNudge.dateISO === dateISO &&
      __nextNudge.dayOrder === day.order &&
      __nextNudge.nextRoutineExerciseId;

    host.classList.toggle("show", !!shouldShow);
  }

  function bindFloatNext(onNext){
    // avoid duplicate listeners by marking the button
    ensureFloatNext();
    const btn = document.getElementById("floatNextBtn");
    if(!btn || btn.__bound) return;
    btn.__bound = true;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if(typeof onNext === "function") onNext(__nextNudge);
    });
  }

  function clearNextNudge(){
    __nextNudge = null;
    const host = document.getElementById("floatNext");
    if(host) host.classList.remove("show");
  }

  return {
    // attendance
    attendanceHas,
    attendanceAdd,
    attendanceRemove,

    // routine log helpers
    hasRoutineExerciseLog,
    lifetimeMaxSet,

    // nudge
    setNextNudge,
    ensureFloatNext,
    maybeShowNextNudge,
    bindFloatNext,
    clearNextNudge
  };
}
