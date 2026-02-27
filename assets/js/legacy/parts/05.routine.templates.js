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
      function createRoutineFromTemplate(templateKey, routineName, weekStartsOn="mon"){
  const tpl = RoutineTemplates.find(t => t.key === templateKey);
  if(!tpl) throw new Error("Invalid template key");

  // Ensure library exists so we can resolve IDs by name
  try{ ExerciseLibrary.ensureSeeded(); }catch(e){ /* safe */ }

  const routineId = uid("rt");

  // Template days are authored in Mon→Sun order (based on your template comments).
  // If user picks Sun-start, rotate so day[0] is Sunday, then Mon..Sat.
  const rawDays = tpl.buildDays();
  const daysSrc = (weekStartsOn === "sun")
    ? [rawDays[6], ...rawDays.slice(0,6)]
    : rawDays.slice();

  const days = daysSrc.map((d, idx) => ({
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
      const oldIdx = Number(k);
      if(!Number.isFinite(oldIdx)) return;

      // If we rotated days for Sun-start, shift exercise-day keys too:
      // old 6 (Sun) -> new 0, old 0 (Mon) -> new 1 ... old 5 (Sat) -> new 6
      const idx = (weekStartsOn === "sun") ? ((oldIdx + 1) % 7) : oldIdx;

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
