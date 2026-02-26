// Home page (isolated)
Views.Home = function(){
        ExerciseLibrary.ensureSeeded();
        WeightEngine.ensure();


        const todayISO = Dates.todayISO();
        const weekStartsOn = state.profile?.weekStartsOn || "mon";
        const weekStartISO = Dates.startOfWeekISO(todayISO, weekStartsOn);

        const { routine, day } = getTodayWorkout();

        const trainedThisWeek = [];
        for(let i=0;i<7;i++){
          const dISO = Dates.addDaysISO(weekStartISO, i);
          trainedThisWeek.push({ dateISO: dISO, trained: isTrained(dISO) });
        }

        // Protein
        const goal = Number(state.profile?.proteinGoal) || 0;
        const done = totalProtein(todayISO);
        const left = Math.max(0, goal - done);
        const pct = goal > 0 ? Math.max(0, Math.min(1, done / goal)) : 0;
        const deg = Math.round(pct * 360);

const openProteinModal = (dateISO = todayISO) => {
  Modal.open({
    title: "Protein",
    bodyNode: buildProteinTodayModal(dateISO, goal)
  });
};


        const openCheckIn = () => {
          toggleTrained(todayISO);
          renderView();
        };

        const workoutTitle = !routine ? "No routine selected"
          : (!day ? "No day found"
          : (day.isRest ? "Rest Day" : day.label));

        const workoutSub = !routine ? "Go to Routine → create/select a routine."
          : (!day ? "Open Routine Editor to fix day mapping."
          : (day.isRest ? "Recovery day. Hydrate + mobility."
          : `${(day.exercises || []).length} exercises planned`));

        const workoutExercises = (day?.isRest || !day) ? []
          : (day.exercises || []).map(rx => resolveExerciseName(rx.type, rx.exerciseId, rx.nameSnap));

        const ring = el("div", {
          class:"ringWrap",
          style: `background: conic-gradient(rgba(124,92,255,.95) 0deg ${deg}deg, rgba(255,255,255,.10) ${deg}deg 360deg);`
        }, [
          el("div", { class:"ringText" }, [
            el("div", { class:"big", text: `${left}g` }),
            el("div", { class:"small", text: "left" }),
            el("div", { class:"small", text: `${done} / ${goal}g` })
          ])
        ]);

        const dots = el("div", { class:"dots" });
        trainedThisWeek.forEach((d, idx) => {
          const dot = el("div", { class:"dotDay" + (d.trained ? " on" : "") });
          dots.appendChild(dot);
        });

        const weekLabel = weekStartsOn === "sun" ? "Week (Sun–Sat)" : "Week (Mon–Sun)";

        const wLatest = WeightEngine.latest();
        const wPrev = WeightEngine.previous();
        const wDelta = (wLatest && wPrev)
          ? (Number(wLatest.weight) - Number(wPrev.weight))
          : null;

        const wDeltaText = (wDelta === null || !Number.isFinite(wDelta))
          ? "—"
          : `${wDelta > 0 ? "+" : ""}${wDelta.toFixed(1)}`;

        return el("div", { class:"grid cols2" }, [
          el("div", { class:"card" }, [
            el("h2", { text:"Today’s workout" }),

// ✅ KPI + action (Edit routine) on the same row
el("div", { class:"homeRow" }, [
  el("div", { class:"kpi" }, [
    el("div", { class:"big", text: workoutTitle }),
    el("div", { class:"small", text: workoutSub })
  ]),
  el("button", {
    class:"btn",
    onClick: () => navigate("routine")
  }, ["Edit routine"])
]),


el("div", { style:"height:10px" }),

/* Planned exercises (unchanged) */
(workoutExercises.length === 0)
  ? el("div", {
      class:"note",
      text: day?.isRest ? "Rest day is enabled." : "Add exercises in Routine Editor."
    })
  : el("div", { class:"list" }, workoutExercises.slice(0,6).map(n =>
      el("div", { class:"item" }, [
        el("div", { class:"left" }, [ el("div", { class:"name", text: n }) ]),
        el("div", { class:"actions" }, [ el("div", { class:"meta", text:"Planned" }) ])
      ])
    ))
]),

// ✅ Removed from Today's Workout card:
// el("div", { style:"height:10px" }),
// el("div", { class:"btnrow" }, [
//   el("button", { class:"btn primary", onClick: openCheckIn }, [isTrained(todayISO) ? "Undo check-in" : "Check in"]),
//   el("button", { class:"btn", onClick: () => navigate("routine") }, ["Open Routine"])
// ])

el("div", { class:"card" }, [
  el("h2", { text:"Protein" }),
  el("div", { class:"homeRow" }, [
    el("div", { class:"kpi" }, [
      el("div", { class:"big", text: `${left}g left` }),
      el("div", { class:"small", text:"Tap to log meals for today." })
    ]),
    el("div", { onClick: openProteinModal }, [ ring ])
  ]),
  el("div", { style:"height:10px" }),
  el("div", { class:"btnrow" }, [
    el("button", { class:"btn primary", onClick: openProteinModal }, ["Log meals"])
  ])
]),

el("div", { class:"card" }, [
  // Header row + action buttons
  el("div", { class:"homeRow" }, [
    el("div", {}, [
      el("h2", { text:"Attendance" }),
      el("div", { class:"note", text: weekLabel })
    ]),

    // ✅ Stack actions: Check in ABOVE View calendar
    el("div", {
      style:"display:flex; flex-direction:column; gap:8px; align-items:flex-end;"
    }, [
      el("button", {
        class:"btn primary",
        onClick: openCheckIn
      }, [isTrained(todayISO) ? "Undo check-in" : "Check in"]),

      el("button", {
        class:"btn",
        onClick: () => navigate("attendance")
      }, ["View calendar"])
    ])
  ]),


  el("div", { style:"height:10px" }),

  // Make the dots preview clickable too
  el("div", {
    onClick: () => navigate("attendance"),
    style:"cursor:pointer;"
  }, [ dots ]),

  el("div", { style:"height:10px" }),
  el("div", { class:"note", text:`This week: ${trainedThisWeek.filter(x => x.trained).length} sessions` })
]),
              
// ✅ NEW: Weight card (Weight tab replacement)
          el("div", { class:"card" }, [
            el("h2", { text:"Weight" }),
            el("div", { class:"kpi" }, [
              el("div", { class:"big", text: wLatest ? `${Number(wLatest.weight).toFixed(1)}` : "—" }),
              el("div", { class:"small", text: wLatest ? `Latest • ${wLatest.dateISO}` : "No weight entries yet." }),
              el("div", { class:"small", text: `Delta vs previous: ${wDeltaText}` })
            ]),
            el("div", { style:"height:10px" }),
            el("div", { class:"btnrow" }, [
              el("button", { class:"btn primary", onClick: () => navigate("weight") }, ["Log weight"])
            ])
          ])
        ]);
      
};
