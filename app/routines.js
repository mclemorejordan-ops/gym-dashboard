/********************
 * Routines Engine (extracted from app.js)
 * - Pure state engine (no DOM)
 * - Uses injected state + Storage to avoid globals
 ********************/

export function initRoutinesEngine({ getState, Storage, uid, ExerciseLibrary, RoutineTemplates, createRoutineFromTemplate }){
  if(typeof getState !== "function") throw new Error("initRoutinesEngine requires getState()");
  if(!Storage) throw new Error("initRoutinesEngine requires Storage");
  if(typeof uid !== "function") throw new Error("initRoutinesEngine requires uid()");
  if(!ExerciseLibrary) throw new Error("initRoutinesEngine requires ExerciseLibrary");
  if(!RoutineTemplates) throw new Error("initRoutinesEngine requires RoutineTemplates");
  if(typeof createRoutineFromTemplate !== "function") throw new Error("initRoutinesEngine requires createRoutineFromTemplate()");

  const Routines = {
    getAll(){
      const state = getState();
      return state.routines || (state.routines = []);
    },
    getActive(){
      const state = getState();
      const id = state.activeRoutineId;
      return this.getAll().find(r => r.id === id) || null;
    },
    setActive(id){
      const state = getState();
      state.activeRoutineId = id;
      Storage.save(state);
    },
    addFromTemplate(templateKey, nameOverride=null){
      const state = getState();
      ExerciseLibrary.ensureSeeded();
      const tplName = RoutineTemplates.find(t => t.key === templateKey)?.name || "Routine";
      const routine = createRoutineFromTemplate(templateKey, nameOverride || tplName);
      this.getAll().push(routine);
      state.activeRoutineId = routine.id;
      Storage.save(state);
      return routine;
    },
    duplicate(routineId){
      const state = getState();
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
      const state = getState();
      const arr = this.getAll();
      const idx = arr.findIndex(x => x.id === routineId);
      if(idx < 0) return;
      arr.splice(idx, 1);

      if(state.activeRoutineId === routineId){
        state.activeRoutineId = arr[0]?.id || null;
      }
      Storage.save(state);
    },
    rename(routineId, newName){
      const state = getState();
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
      const state = getState();
      const day = this.getDay(routineId, dayId);
      if(!day) throw new Error("Day not found.");
      day.isRest = !!isRest;
      Storage.save(state);
    },

    setDayLabel(routineId, dayId, label){
      const state = getState();
      const day = this.getDay(routineId, dayId);
      if(!day) throw new Error("Day not found.");
      day.label = (label || "").trim() || day.label;
      Storage.save(state);
    },

    addExerciseToDay(routineId, dayId, exType, exerciseId){
      const state = getState();
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
      const state = getState();
      const day = this.getDay(routineId, dayId);
      if(!day) throw new Error("Day not found.");
      day.exercises = day.exercises || [];
      const idx = day.exercises.findIndex(x => x.id === routineExerciseId);
      if(idx >= 0) day.exercises.splice(idx, 1);
      Storage.save(state);
    }
  };

  function resolveExerciseName(type, exerciseId, fallback){
    const state = getState();
    const found = (state.exerciseLibrary?.[type] || []).find(x => x.id === exerciseId);
    return found?.name || fallback || "Unknown exercise";
  }

  return { Routines, resolveExerciseName };
}
