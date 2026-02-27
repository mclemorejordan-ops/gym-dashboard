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
      const weekStartsOn = normalizedWeekStartsOn();
      const routine = createRoutineFromTemplate(templateKey, nameOverride || tplName, weekStartsOn);
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
