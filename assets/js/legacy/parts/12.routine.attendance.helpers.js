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

// Back-compat alias used by Home workoutStatus()
// (keeps Home readable while reusing the canonical helper)
function isExerciseTrained(dateISO, routineExerciseId){
  return hasRoutineExerciseLog(dateISO, routineExerciseId);
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
