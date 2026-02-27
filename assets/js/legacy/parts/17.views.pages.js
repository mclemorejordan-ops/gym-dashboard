/********************
     * 7) Views
     ********************/
    const Views = {
 Onboarding(){
  let hideRestDays = true;
  let trackProtein = true;              // ✅ NEW
  let selectedTpl = "ppl";

  const errorBox = el("div", { class:"note", style:"display:none; color: rgba(255,92,122,.95);" });

  // Hide rest days switch
  const hideRestSwitch = el("div", { class:"switch on" });
  hideRestSwitch.addEventListener("click", () => {
    hideRestDays = !hideRestDays;
    hideRestSwitch.classList.toggle("on", hideRestDays);
  });

  // Track protein switch (NEW)
  const trackProteinSwitch = el("div", { class:"switch on" });

  const tplCardsHost = el("div", { class:"tplGrid" });
  const renderTplCards = () => {
    tplCardsHost.innerHTML = "";
    RoutineTemplates.forEach(t => {
      tplCardsHost.appendChild(el("div", {
        class: "tpl" + (t.key === selectedTpl ? " selected" : ""),
        onClick: () => { selectedTpl = t.key; renderTplCards(); }
      }, [
        el("div", { class:"name", text: t.name }),
        el("div", { class:"desc", text: t.desc })
      ]));
    });
  };
  renderTplCards();

  const nameInput = el("input", { type:"text", placeholder:"Jordan" });

  const weekSelect = el("select", {});
  weekSelect.appendChild(el("option", { value:"mon", text:"Monday" }));
  weekSelect.appendChild(el("option", { value:"sun", text:"Sunday" }));
  weekSelect.value = "mon";

  const proteinInput = el("input", {
    type:"number",
    inputmode:"numeric",
    placeholder:"180",
    min:"0",
    value:"180"
  });

  // Protein goal row wrapper so we can show/hide instantly
  const proteinGoalRow = el("label", {}, [
    el("span", { text:"Protein goal (grams/day)" }),
    proteinInput
  ]);

  // Wire toggle to live show/hide protein goal input
  trackProteinSwitch.addEventListener("click", () => {
    trackProtein = !trackProtein;
    trackProteinSwitch.classList.toggle("on", trackProtein);
    proteinGoalRow.style.display = trackProtein ? "" : "none";

    // Optional UX: if turning ON and empty/0, seed a default + focus
    if(trackProtein){
      const v = Number(proteinInput.value || 0);
      if(!Number.isFinite(v) || v <= 0){
        proteinInput.value = "180";
      }
      try{ proteinInput.focus(); }catch(_){}
    }
  });

  // Initial visibility
  proteinGoalRow.style.display = trackProtein ? "" : "none";

  const finish = () => {
    errorBox.style.display = "none";
    errorBox.textContent = "";

    const cleanName = (nameInput.value || "").trim();
    const weekStartsOn = weekSelect.value === "sun" ? "sun" : "mon";

    if(!cleanName){
      errorBox.textContent = "Please enter your name.";
      errorBox.style.display = "block";
      return;
    }

    let proteinGoal = 0;
    if(trackProtein){
      const cleanProtein = Number(proteinInput.value);
      if(!Number.isFinite(cleanProtein) || cleanProtein <= 0){
        errorBox.textContent = "Please enter a valid daily protein goal (grams).";
        errorBox.style.display = "block";
        return;
      }
      proteinGoal = Math.round(cleanProtein);
    }

    const profile = {
       name: cleanName,
     
       // ✅ NEW: persisted feature flag
       trackProtein: !!trackProtein,
       proteinGoal: proteinGoal,
     
       // Goals + weekly target (Phase 1)
       workoutsPerWeekGoal: 4,
       goals: [],

       startDateISO: Dates.todayISO(),
     
       weekStartsOn,
       hideRestDays: !!hideRestDays,
     
       // ✅ 3D Preview default (ON)
       show3DPreview: true
     };

    // Seed library FIRST so template exercises can resolve to real exerciseIds
    ExerciseLibrary.ensureSeeded();

    const routineName = RoutineTemplates.find(t => t.key === selectedTpl)?.name || "Routine";
    const routine = createRoutineFromTemplate(selectedTpl, routineName);

    state.profile = profile;
    state.routines = [routine];
    state.activeRoutineId = routine.id;

    // Repair any missing links (older data / edge cases)
    repairExerciseLinks();

    Storage.save(state);
    navigate("home");
    bindHeaderPills();
    setHeaderPills();
    checkForUpdates();
  };

  return el("div", { class:"grid" }, [
    el("div", { class:"card" }, [
      el("h2", { text:"Welcome" }),
      el("div", { class:"kpi" }, [
        el("div", { class:"big", text:"Let’s set up your dashboard" }),
        el("div", { class:"small", text:"Create your profile and choose a routine template. You can edit everything later." })
      ])
    ]),

    el("div", { class:"card" }, [
      el("h2", { text:"Create profile" }),
      el("div", { class:"form" }, [

        // Row 1: Name + Week start (Profile-only)
        el("div", { class:"row2" }, [
          el("label", {}, [ el("span", { text:"Name" }), nameInput ]),
          el("label", {}, [ el("span", { text:"Week starts on" }), weekSelect ])
        ]),

        // Row 2: Track protein toggle + Hide rest days toggle
        el("div", { class:"row2" }, [
          el("div", { class:"toggle" }, [
            el("div", { class:"ttext" }, [
              el("div", { class:"a", text:"Track protein" }),
              el("div", { class:"b", text:"Turn this off to hide protein features across the app" })
            ]),
            trackProteinSwitch
          ]),

          el("div", { class:"toggle" }, [
            el("div", { class:"ttext" }, [
              el("div", { class:"a", text:"Hide rest days" }),
              el("div", { class:"b", text:"Rest days won’t appear on Home (Routine can still show them later)" })
            ]),
            hideRestSwitch
          ])
        ]),

        // Row 3: Protein goal (auto hides/shows instantly)
        el("div", { class:"row2" }, [
          proteinGoalRow,
          el("div", { class:"note", text:"You can change this later in Settings." })
        ]),

        errorBox
      ])
    ]),

    el("div", { class:"card" }, [
      el("h2", { text:"Choose a routine template" }),
      tplCardsHost,
      el("div", { style:"height:10px" }),
      el("div", { class:"btnrow" }, [
        el("button", { class:"btn primary", onClick: finish }, ["Finish setup"]),
        el("button", {
          class:"btn danger",
          onClick: () => {
            Modal.open({
              title: "Reset local data",
              bodyNode: el("div", {}, [
                el("div", { class:"note", text:"This clears everything saved in this browser for the app." }),
                el("div", { style:"height:12px" }),
                el("div", { class:"btnrow" }, [
                  el("button", {
                    class:"btn danger",
                    onClick: () => {
                      try{ BackupVault.forceSnapshot(state, "pre-reset"); }catch(_){ }
                      Storage.reset();
                      state = Storage.load();
                      Modal.close();
                      navigate("home");
                    }
                  }, ["Reset"]),
                  el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
                ])
              ])
            });
          }
        }, ["Reset"])
      ])
    ])
  ]);
},

        Home(){
  ExerciseLibrary.ensureSeeded();
  WeightEngine.ensure();

  const todayISO = Dates.todayISO();
  const weekStartsOn = state.profile?.weekStartsOn || "mon";
  const weekStartISO = Dates.startOfWeekISO(todayISO, weekStartsOn);

  const weekEndISO = Dates.addDaysISO(weekStartISO, 6);

  // Coaching window start = later of (weekStartISO, user startDateISO)
  const userStartISO = state.profile?.startDateISO || todayISO;
  const coachStartISO = (String(userStartISO) > String(weekStartISO)) ? userStartISO : weekStartISO;
  
  // Clamp: never start coaching after today
  const coachStartClampedISO = (String(coachStartISO) > String(todayISO)) ? todayISO : coachStartISO;
    
  const { routine, day } = getTodayWorkout();

  // ----------------------------
  // Today (planned)
  // ----------------------------
  const workoutTitle = !routine ? "No routine selected"
    : (!day ? "No day found"
    : (day.isRest ? "Rest Day" : (day.label || "Workout")));

  const workoutSub = !routine ? "Go to Routine → create/select a routine."
    : (!day ? "Open Routine Editor to fix day mapping."
    : (day.isRest ? "Recovery day. Hydrate + mobility."
    : `${(day.exercises || []).length} exercises planned`));

  const plannedNames = (day?.isRest || !day)
    ? []
    : (day.exercises || []).map(rx => resolveExerciseName(rx.type, rx.exerciseId, rx.nameSnap));

  const top3 = plannedNames.slice(0,3);

  // Status derives from logged sets (workout logs) for today's routine exercises
  function workoutStatus(){
    if(!routine || !day || day.isRest) return { key:"rest", label:"Rest Day", tag:"🧘 Rest Day", kind:"" };
    const ex = (day.exercises || []);
    if(ex.length === 0) return { key:"none", label:"Not Started", tag:"🔘 Not Started", kind:"" };

    let doneCount = 0;
    for(const rx of ex){
      if(rx?.id && isExerciseTrained(todayISO, rx.id)) doneCount++;
    }

    if(doneCount <= 0) return { key:"not_started", label:"Not Started", tag:"🔘 Not Started", kind:"" };
    if(doneCount < ex.length) return { key:"in_progress", label:"In Progress", tag:"🟡 In Progress", kind:"warn" };
    return { key:"complete", label:"Complete", tag:"🟢 Complete", kind:"good" };
  }

  const status = workoutStatus();

  // ----------------------------
  // This Week (aggregated)
  // ----------------------------
  const trainedThisWeek = [];
  for(let i=0;i<7;i++){
    const dISO = Dates.addDaysISO(weekStartISO, i);
    trainedThisWeek.push({ dateISO: dISO, trained: isTrained(dISO) });
  }

  // Week labels + dots (aligned)
const dotLabels = el("div", { class:"homeWeekDotLabels", style:"justify-content:center;" });
const labels = (weekStartsOn === "sun")
  ? ["S","M","T","W","T","F","S"]
  : ["M","T","W","T","F","S","S"];

labels.forEach(ch => dotLabels.appendChild(el("div", { class:"dotLbl", text: ch })));

const dots = el("div", { class:"homeWeekDots", style:"justify-content:center;" });
trainedThisWeek.forEach((d) => {
  const dot = el("div", { class:"dotDay" + (d.trained ? " on" : "") });
  dots.appendChild(dot);
});

  // Count workouts ONLY inside the coaching window (coachStartClampedISO..weekEndISO)
  // This keeps Attendance perfectly consistent for mid-week starters.
  const coachStartIdx = Math.max(
    0,
    Math.min(6, Dates.diffDaysISO(weekStartISO, coachStartClampedISO))
  );

  let workoutsDone = 0;
  for(let i = coachStartIdx; i < 7; i++){
    if(trainedThisWeek[i]?.trained) workoutsDone++;
  }
             
// ----------------------------
// Attendance target (NO default "workouts/week" goal)
// - If user has an explicit workouts_week goal, use it.
// - Otherwise derive from routine plan, aligned to user startDateISO.
// ----------------------------
function getExplicitWorkoutsWeekGoal(){
  const goals = Array.isArray(state.profile?.goals) ? state.profile.goals : [];
  const g = goals.find(x => (x?.type || "").toString() === "workouts_week");
  const t = Number(g?.target);
  return Number.isFinite(t) ? Math.max(0, Math.round(t)) : null;
}

function getPlannedWorkoutsThisWeek(){
  if(!routine || !routine.days || !routine.days.length) return 0;

  // ✅ Count ONLY inside the coaching window (coachStartClampedISO..weekEndISO)
  // This prevents "past days" from inflating the weekly plan for mid-week starters.
  let planned = 0;

  for(let i = coachStartIdx; i < 7; i++){
    const dISO = Dates.addDaysISO(weekStartISO, i);

    // Use anchored mapping so 7-day routines align to the user's week start rules
    const dayObj = anchoredRoutineDayForDate(dISO);
    if(!dayObj) continue;

    if(!dayObj.isRest) planned++;
  }

  return planned;
}

const explicitWorkoutsGoal = getExplicitWorkoutsWeekGoal();
const plannedWorkoutsGoal = getPlannedWorkoutsThisWeek();

// Final target: explicit goal wins; otherwise planned routine days
const workoutsGoal = (explicitWorkoutsGoal !== null) ? explicitWorkoutsGoal : plannedWorkoutsGoal;

// ✅ This Week denominator should exclude routine rest days.
// If we have a workoutsGoal (explicit or planned), use it as the denominator.
// Otherwise fall back to activeDaysTotal (calendar days in coaching window).
const thisWeekDenom = (workoutsGoal && workoutsGoal > 0) ? workoutsGoal : activeDaysTotal;
            
  const proteinOn = (state.profile?.trackProtein !== false);
  const proteinGoal = Math.max(0, Math.round(Number(state.profile?.proteinGoal || 0)));

  let proteinGoalDays = 0;
if(proteinOn && proteinGoal > 0){
  // ✅ Count ONLY inside the coaching window (coachStartClampedISO..weekEndISO)
  // This keeps Protein consistent for mid-week starters.
  for(let i = coachStartIdx; i < 7; i++){
    const dISO = Dates.addDaysISO(weekStartISO, i);
    const total = totalProtein(dISO); // read-only (does not create entries)
    if(total >= proteinGoal) proteinGoalDays++;
  }
}

  function weightDeltaForWeek(){
    const entries = WeightEngine.listAsc();
    if(entries.length < 2) return null;

    // last entry in (weekStart..weekStart+6)
    const weekEndISO = Dates.addDaysISO(weekStartISO, 6);

    let lastInWeek = null;
    for(const e of entries){
      if(e.dateISO >= weekStartISO && e.dateISO <= weekEndISO) lastInWeek = e;
    }
    if(!lastInWeek) return null;

    // previous entry before week start (latest before)
    let prev = null;
    for(const e of entries){
      if(e.dateISO < weekStartISO) prev = e;
      else break;
    }
    if(!prev) return null;

    const d = Number(lastInWeek.weight) - Number(prev.weight);
    return Number.isFinite(d) ? round2(d) : null;
  }

  const wDeltaWeek = weightDeltaForWeek();
  const wDeltaText = (wDeltaWeek === null)
    ? "—"
    : `${wDeltaWeek < 0 ? "↓" : (wDeltaWeek > 0 ? "↑" : "•")} ${Math.abs(wDeltaWeek).toFixed(1)} lb`;

// Pace should respect when the user started.
// If user started mid-week, expectation is based only on coachStart..weekEnd.
const activeDayIdx = Dates.diffDaysISO(coachStartClampedISO, todayISO); // 0..N
const activeDaysTotal = Math.max(1, Dates.diffDaysISO(coachStartClampedISO, weekEndISO) + 1); // include today & end
const activeDaysElapsed = Math.min(activeDaysTotal, Math.max(1, activeDayIdx + 1)); // include today

// Expected workouts by now within the active window
const expectedByNow = Math.ceil(workoutsGoal * (activeDaysElapsed / activeDaysTotal));

const paceKey = (workoutsDone >= expectedByNow) ? "on" : "behind";
const paceLabel = (paceKey === "on") ? "Pace: On Track" : "Pace: Slightly Behind";


// ----------------------------
// Routine anchoring helpers (based on profile.startDateISO)
// - Maps calendar dates to routine day index anchored to user start
// - Produces "today plan" + "remaining plans this week" (from coachStart..weekEnd)
// ----------------------------
function getActiveRoutineSafe(){
  try { return Routines.getActive(); } catch(e){ return null; }
}

function anchoredRoutineIndexForDate(dateISO){
  const routine = getActiveRoutineSafe();
  if(!routine || !Array.isArray(routine.days) || routine.days.length === 0) return null;

  const cycleLen = routine.days.length;

  // ✅ If the routine is a 7-day week (most templates), anchor it to the user's week start
  // so Mon-start => Mon=Day 0, Tue=Day 1, ... Fri=Day 4 (Pull for PPL).
  const weekStartsOn = normalizedWeekStartsOn();
  const weekAnchorISO = Dates.startOfWeekISO(dateISO, weekStartsOn);

  // For non-7-day cycles, keep the old behavior (anchor to user start date) so multi-week cycles still work.
  const startISO = (cycleLen === 7)
    ? weekAnchorISO
    : (state.profile?.startDateISO || weekAnchorISO);

  const offset = Dates.diffDaysISO(startISO, dateISO);
  const idx = ((offset % cycleLen) + cycleLen) % cycleLen; // safe modulo
  return idx;
}

function anchoredRoutineDayForDate(dateISO){
  const routine = getActiveRoutineSafe();
  if(!routine || !Array.isArray(routine.days) || routine.days.length === 0) return null;

  const idx = anchoredRoutineIndexForDate(dateISO);
  if(idx === null) return null;

  // In your data model, days use order (0..len-1)
  return (routine.days || []).find(d => Number(d.order) === Number(idx)) || null;
}

// Returns true if the anchored routine says this date is a Rest day.
// Safe: if no routine/day is found, treat as NOT a rest day (so we don't hide data accidentally).
function isRoutineRestDayForISO(dateISO){
  const dayObj = anchoredRoutineDayForDate(dateISO);
  return !!(dayObj && dayObj.isRest);
}

// Planned training days remaining in the coaching window (coachStartClampedISO..weekEndISO)
function plannedDaysRemainingThisWeek(){
  const routine = getActiveRoutineSafe();
  if(!routine || !Array.isArray(routine.days) || routine.days.length === 0) return [];

  const out = [];
  for(let i=0;i<7;i++){
    const dISO = Dates.addDaysISO(weekStartISO, i);

    // Only include days inside the user-aware coaching window
    if(dISO < coachStartClampedISO) continue;
    if(dISO > weekEndISO) continue;

    const dayObj = anchoredRoutineDayForDate(dISO);
    if(!dayObj) continue;

    // Only count non-rest days
    if(dayObj.isRest) continue;

    out.push({ dateISO: dISO, label: String(dayObj.label || "Workout") });
  }
  return out;
}

const todayPlan = anchoredRoutineDayForDate(todayISO);     // {label,isRest,...} or null
const remainingPlans = plannedDaysRemainingThisWeek();     // [{dateISO,label},...]


// ----------------------------
// Coach Insight (dual-layer: Weekly Execution + Primary Goal)
// Always includes one next action.
// ----------------------------
function pickPrimaryGoal(){
  const goals = Array.isArray(state.profile?.goals) ? state.profile.goals : [];
  if(!goals.length) return null;
  return goals[0]; // simplest: first goal = primary
}

function inferGoalType(goal){
  const type = (goal?.type || "").toString().trim();
  if(type) return type;

  // Infer from title for manual goals
  const title = (goal?.title || goal?.name || "").toString().toLowerCase();

  if(/\b(lose|cut)\b/.test(title) || /\bweight\b/.test(title)) return "weight_target";
  if(/\b(bench|squat|deadlift|press|ohp)\b/.test(title)) return "strength_target";
  if(/\b(workout|sessions?)\b/.test(title) && /\bweek\b/.test(title)) return "workouts_week";
  if(/\b(5k|10k|run|cardio)\b/.test(title)) return "cardio_target";

  return "manual";
}

function buildCoachInsight(){
  const primary = pickPrimaryGoal();
  const primaryTitle = (primary?.title || primary?.name || "").toString().trim();
  const primaryType = inferGoalType(primary);

  // If no weekly plan exists (no routine AND no workouts_goal), coach user to set it
  if(!workoutsGoal || workoutsGoal <= 0){
    return {
      line1: "I can’t pace your week yet — pick a routine to set your plan.",
      line2: "Once it’s set, I’ll coach your remaining days automatically.",
      action: "Next: go to Routine and select your program."
    };
  }

  // User-start-aware remaining window (calendar week end, but ignoring days before coachStartClampedISO)
  const remainingDays = Math.max(1, Dates.diffDaysISO(todayISO, weekEndISO) + 1);
  const remainingWorkouts = Math.max(0, workoutsGoal - workoutsDone);

  const startedMidWeek = (String(coachStartClampedISO) > String(weekStartISO));

  // Today / remaining plan (anchored to profile.startDateISO)
  const todayLabel = todayPlan ? String(todayPlan.label || "Workout") : "Workout";
  const todayIsRest = !!(todayPlan && todayPlan.isRest);

  const remainingLabels = remainingPlans
    .filter(x => x.dateISO >= todayISO)        // from today forward
    .map(x => x.label);

  // Reliability signals
  const hasProteinData = !!(proteinOn && proteinGoal > 0);
  const hasWeightData = (wDeltaWeek !== null);

  // Weekly execution layer
  const weeklyBehind = (paceKey === "behind");
  const weeklyOnTrack = (paceKey === "on");

  // --- If today is a rest day, coach recovery + small action
  if(todayIsRest){
    const nextUp = remainingLabels[0] ? `Next up: ${remainingLabels[0]}.` : "Next up: your next training day.";
    return {
      line1: `Today is a rest day — recovery is part of the plan.`,
      line2: `${nextUp}`,
      action: "Next: do 10 minutes of mobility or an easy walk to stay in rhythm."
    };
  }

  // --- FOUNDATION FIRST: if behind pace, coach the remaining window + today’s plan
  if(weeklyBehind){
    const windowLine = startedMidWeek
      ? `You started mid-week — ${remainingWorkouts} workout${remainingWorkouts===1?"":"s"} left with ${remainingDays} day${remainingDays===1?"":"s"} remaining.`
      : `You’re behind pace — ${remainingWorkouts} workout${remainingWorkouts===1?"":"s"} left with ${remainingDays} day${remainingDays===1?"":"s"} remaining.`;

    const remainLine = remainingLabels.length
      ? `Remaining plan: ${remainingLabels.join(", ")}.`
      : "Your remaining plan is light — keep it simple and execute.";

    return {
      line1: `Today: ${todayLabel}. ${windowLine}`,
      line2: remainLine,
      action: `Next: start ${todayLabel} and log your first set — momentum beats perfect.`
    };
  }

  // --- On track: coach the goal layer, but still reference Today + remaining plan
  if(weeklyOnTrack){
    const remainLine = remainingLabels.length
      ? `Remaining plan: ${remainingLabels.join(", ")}.`
      : "Your remaining plan is straightforward — execute and recover.";

    // Weight goal: protein/weight feedback
    if(primaryType === "weight_target"){
      if(!hasWeightData){
        return {
          line1: `Today: ${todayLabel}. You’re on pace this week.`,
          line2: `Goal: ${primaryTitle || "Body composition"}. Log weight so I can steer. ${remainLine}`,
          action: "Next: log tomorrow morning’s weight (same time, same conditions)."
        };
      }

      if(hasProteinData && proteinGoalDays <= 2){
        return {
          line1: `Today: ${todayLabel}. Training is on track — protein is the lever.`,
          line2: `Goal days: ${proteinGoalDays}/${activeDaysTotal} at ${proteinGoal}g. ${remainLine}`,
          action: `Next: hit ${proteinGoal}g today (plan 2 protein meals).`
        };
      }

      return {
        line1: `Today: ${todayLabel}. You’re on pace this week.`,
        line2: `Weight trend: ${wDeltaText}. ${remainLine}`,
        action: hasProteinData
          ? `Next: repeat today’s structure and hit ${proteinGoal}g.`
          : "Next: repeat today’s structure and stay consistent."
      };
    }

    // Strength goal
    if(primaryType === "strength_target"){
      return {
        line1: `Today: ${todayLabel}. You’re consistent — now we push performance.`,
        line2: `${primaryTitle ? `Focus: ${primaryTitle}. ` : ""}${remainLine}`,
        action: "Next: beat last time by +1 rep OR +2.5–5 lb on your top set."
      };
    }

    // Cardio goal
    if(primaryType === "cardio_target"){
      return {
        line1: `Today: ${todayLabel}. You’re on pace — build the engine.`,
        line2: `${primaryTitle ? `Focus: ${primaryTitle}. ` : ""}${remainLine}`,
        action: "Next: add 10–15 minutes of easy cardio today (zone 2 pace)."
      };
    }

    // No specific goal type / manual goals
    return {
      line1: `Today: ${todayLabel}. You’re on pace this week.`,
      line2: `${primaryTitle ? `Keep focus on: ${primaryTitle}. ` : ""}${remainLine}`,
      action: `Next: start ${todayLabel} and log your first set.`
    };
  }

  // --- Fallback (rare)
  return {
    line1: `Today: ${todayLabel}. Keep moving in the right direction.`,
    line2: remainingLabels.length ? `Remaining plan: ${remainingLabels.join(", ")}.` : "Stay consistent.",
    action: `Next: start ${todayLabel} and log your first set.`
  };
}

const coach = buildCoachInsight();

  const weekLabel = weekStartsOn === "sun" ? "This Week (Sun–Sat)" : "This Week (Mon–Sun)";

  const openWeekDetails = () => {
  const weekEndISO = Dates.addDaysISO(weekStartISO, 6);



  // Build per-day rows (Mon..Sun)
  const rows = [];
  for(let i=0;i<7;i++){
    const dISO = Dates.addDaysISO(weekStartISO, i);
    const trained = isTrained(dISO);

    // Protein
    const pTotal = proteinOn ? totalProtein(dISO) : 0;
    const pMet = (proteinOn && proteinGoal > 0) ? (pTotal >= proteinGoal) : false;

    // Weight entry for the day (if any)
    const wEntry = (state.logs?.weight || []).find(x => x.dateISO === dISO);
    const wVal = wEntry ? Number(wEntry.weight) : null;

    rows.push({ dISO, trained, pTotal, pMet, wVal });
  }

  // ✅ Only count days inside the coaching window for summary numerators/denominators
// ✅ Only count days inside the coaching window AND exclude routine rest days
const activeRows = rows.slice(coachStartIdx);

const plannedRows = activeRows.filter(r => !isRoutineRestDayForISO(r.dISO));
const restRows    = activeRows.filter(r =>  isRoutineRestDayForISO(r.dISO));

const trainedPlannedCount = plannedRows.filter(r => r.trained).length;
const proteinMetPlannedCount = plannedRows.filter(r => r.pMet).length;

// Denominator = planned workout days in the active window
const thisWeekDenom = Math.max(1, plannedRows.length);
const trainedCount = activeRows.filter(r => r.trained).length;
const proteinMetCount = activeRows.filter(r => r.pMet).length;

  // Weight delta within week: first available vs last available
  const weightsInWeek = rows.filter(r => Number.isFinite(r.wVal)).map(r=>r.wVal);
  let deltaInWeek = null;
  if(weightsInWeek.length >= 2){
    deltaInWeek = round2(weightsInWeek[weightsInWeek.length-1] - weightsInWeek[0]);
  }

  const summary = el("div", {}, [
    el("div", { class:"note", text:`${weekLabel} • ${weekStartISO} → ${weekEndISO}` }),
    el("div", { style:"height:10px" }),
    el("div", { class:"homeWeekMetrics" }, [
      el("div", { class:"homeMini" }, [
        el("div", { class:"lab", text:"Workouts" }),
        el("div", { class:"val", text:`${workoutsDone} / ${thisWeekDenom}` })
      ]),
      el("div", { class:"homeMini" }, [
        el("div", { class:"lab", text:"Trained Days" }),
        el("div", { class:"val", text:`${trainedPlannedCount} / ${thisWeekDenom}` })
      ]),
      el("div", { class:"homeMini" }, [
        el("div", { class:"lab", text:"Protein Goal Days" }),
        el("div", { class:"val", text: proteinOn ? `${proteinMetPlannedCount} / ${thisWeekDenom}` : "Off" })
      ])
    ]),
    el("div", { style:"height:10px" }),
    el("div", { class:"note", text:`Weight (in-week): ${deltaInWeek === null ? "—" : ((deltaInWeek < 0 ? "↓ " : "↑ ") + Math.abs(deltaInWeek).toFixed(1) + " lb")}` })
  ]);

  const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const list = el("div", { style:"margin-top:12px; display:flex; flex-direction:column; gap:10px;" });

// ✅ Only show days inside the coaching window (coachStartClampedISO..weekEndISO)
const visibleRows = rows.slice(coachStartIdx);

visibleRows.forEach((r, j) => {
  const i = coachStartIdx + j; // original weekday index (0..6)

  const line =
    `Workout: ${r.trained ? "✅" : "—"}`
    + (proteinOn ? ` • Protein: ${Math.round(r.pTotal)}g${(proteinGoal>0 ? (r.pMet ? " ✅" : " —") : "")}` : "")
    + ` • Weight: ${Number.isFinite(r.wVal) ? (r.wVal.toFixed(1) + " lb") : "—"}`;

  const left = el("div", {}, [
    el("div", { style:"font-weight:900;", text: `${dow[i]} • ${r.dISO}` }),
    el("div", { class:"note", text: line })
  ]);

const dayObj = anchoredRoutineDayForDate(r.dISO);
const isRestDay = !!dayObj?.isRest;

const tagText = r.trained ? "Trained" : (isRestDay ? "Rest" : "Planned");
const tagClass = "tag " + (r.trained ? "good" : "");

const right = el("div", { class: tagClass, text: tagText });
  list.appendChild(
    el("div", { class:"goalItem" }, [ left, right ])
  );
});

  Modal.open({
    title: "This Week — Details",
    bodyNode: el("div", {}, [
      summary,
      el("div", { style:"height:12px" }),
      list,
      el("div", { style:"height:14px" }),
      el("div", { class:"btnrow" }, [
        el("button", { class:"btn", onClick: () => { Modal.close(); navigate("attendance"); } }, ["Attendance"]),
        el("button", { class:"btn", onClick: () => { Modal.close(); navigate("weight"); } }, ["Weight"]),
        el("button", {
          class:"btn",
          onClick: () => {
            if(proteinOn){ Modal.close(); navigate("protein_history"); }
            else { showToast("Protein tracking is disabled in Settings → Profile."); }
          }
        }, ["Protein"])
      ])
    ])
  });
};

// ----------------------------
// Goals (Phase 2: structured + auto from logs; manual still supported)
// ----------------------------
if(!Array.isArray(state.profile?.goals)) state.profile.goals = [];

function getLatestWeight(){
  WeightEngine.ensure();
  const latest = WeightEngine.latest();
  return latest ? Number(latest.weight) : null;
}

function getBestLiftWeight(exType, exId){
  try{
    const bests = LogEngine.lifetimeBests(exType, exId);
    return Number.isFinite(bests?.bestWeight) ? Number(bests.bestWeight) : null;
  }catch(e){
    return null;
  }
}

function computeGoalDisplay(goal){
  // Backwards compatible fields (but we'll hide manual goals)
  const legacyTitle = (goal?.title ?? goal?.name ?? "").toString().trim();
  const legacySub   = (goal?.sub ?? "").toString().trim();
  const legacyPct   = (typeof goal?.pct === "number" && Number.isFinite(goal.pct))
    ? Math.max(0, Math.min(100, Math.round(goal.pct)))
    : null;

  const type = (goal?.type || "manual").toString();

  // ✅ Manual goals are removed from Home display
  if(type === "manual"){
    return null;
  }

  // Workouts per week (auto)
  if(type === "workouts_week"){
    const target = Math.max(0, Math.round(Number(goal?.target ?? state.profile?.workoutsPerWeekGoal ?? 4)));
    const done = workoutsDone;
    const remaining = Math.max(0, target - done);
    return {
      title: goal?.title?.trim() || `${target} workouts per week`,
      sub: `${done} / ${target} completed • ${remaining} remaining`,
      pct: (target > 0) ? Math.round((done / target) * 100) : null
    };
  }

  // Weight target (auto)
  if(type === "weight_target"){
    const target = Number(goal?.targetWeight);
    const start = Number(goal?.startWeight);
    const current = getLatestWeight();

    if(!Number.isFinite(target) || !Number.isFinite(current)){
      return { title: goal?.title?.trim() || "Weight goal", sub: "Log weight to track progress", pct: null };
    }

    const toGo = Math.abs(current - target);

    let pct = null;
    if(Number.isFinite(start) && start !== target){
      const denom = Math.abs(start - target);
      const numer = Math.abs(start - current);
      pct = Math.max(0, Math.min(100, Math.round((numer / denom) * 100)));
    }

    return {
      title: goal?.title?.trim() || `Reach ${target} lb`,
      sub: `Current: ${current.toFixed(1)} lb • ${toGo.toFixed(1)} lb to goal`,
      pct
    };
  }

  // ✅ Exercise target (Weightlifting / Cardio / Core)
  // Uses LogEngine summaries so it matches how the app logs entries.
  if(type === "strength_target"){
    const exType = (goal?.exerciseType || "weightlifting").toString();
    const exId = goal?.exerciseId;

    const exName = resolveExerciseName(exType, exId, goal?.exerciseName || "Exercise");
    const entries = (exId ? (LogEngine.entriesForExercise(exType, exId) || []) : []);

    // Determine metric + target based on exercise type
    let metric = (goal?.metric || "").toString().trim();
    let target = null;

    if(exType === "weightlifting"){
      // legacy: targetWeight
      target = Number(goal?.targetWeight);
      metric = "topWeight";
    }else{
      // cardio/core store targetValue
      target = Number(goal?.targetValue);
      if(!metric){
        metric = (exType === "cardio") ? "distance" : "volume"; // defaults
      }
    }

    // Compute best based on metric (from LogEngine summaries)
    let best = null;

    if(exType === "weightlifting"){
      for(const e of entries){
        const v = e?.summary?.bestWeight;
        if(Number.isFinite(v)) best = Math.max(best ?? -Infinity, v);
      }
      if(best === -Infinity) best = null;
    } else if(exType === "cardio"){
      if(metric === "timeSec"){
        for(const e of entries){
          const v = e?.summary?.timeSec;
          if(Number.isFinite(v)) best = Math.max(best ?? -Infinity, v);
        }
        if(best === -Infinity) best = null;
      } else {
        // distance
        for(const e of entries){
          const v = e?.summary?.distance;
          if(Number.isFinite(v)) best = Math.max(best ?? -Infinity, v);
        }
        if(best === -Infinity) best = null;
      }
    } else {
      // core:
      // Your core summary uses totalVolume (reps/sets based volume OR time-based in some flows).
      for(const e of entries){
        const v = e?.summary?.totalVolume;
        if(Number.isFinite(v)) best = Math.max(best ?? -Infinity, v);
      }
      if(best === -Infinity) best = null;
    }

    if(!Number.isFinite(target) || !Number.isFinite(best)){
      return {
        title: goal?.title?.trim() || `${exName}`.trim(),
        sub: "Log sets to track progress",
        pct: null
      };
    }

    const pct = (target > 0) ? Math.max(0, Math.min(100, Math.round((best / target) * 100))) : null;

    // Subtext formatting matching log style
    if(exType === "cardio"){
      if(metric === "timeSec"){
        const toGo = Math.max(0, target - best);
        return {
          title: goal?.title?.trim() || `${exName} time`,
          sub: `Best: ${formatTime(best)} • Target: ${formatTime(target)} • ${formatTime(toGo)} to go`,
          pct
        };
      } else {
        const toGo = Math.max(0, target - best);
        return {
          title: goal?.title?.trim() || `${exName} distance`,
          sub: `Best: ${Math.round(best * 10) / 10} • Target: ${Math.round(target * 10) / 10} • ${Math.round(toGo * 10) / 10} to go`,
          pct
        };
      }
    }

    if(exType === "core"){
      const toGo = Math.max(0, target - best);
      return {
        title: goal?.title?.trim() || `${exName}`,
        sub: `Best: ${Math.round(best)} • Target: ${Math.round(target)} • ${Math.round(toGo)} to go`,
        pct
      };
    }

    // weightlifting
    const toGo = Math.max(0, target - best);
    return {
      title: goal?.title?.trim() || `${exName} ${Math.round(target)} lb`,
      sub: `Current: ${Math.round(best)} lb • ${Math.round(toGo)} lb to goal`,
      pct
    };
  }

  // Unknown types: keep legacy fallback (but avoids crashing)
  return { title: legacyTitle || "Goal", sub: legacySub, pct: legacyPct };
}

const openGoalsEditor = () => {
  ExerciseLibrary.ensureSeeded();
  LogEngine.ensure();

  const existing = Array.isArray(state.profile?.goals) ? state.profile.goals : [];
  // ✅ Drop manual goals from the editor completely
  const working = existing
    .filter(g => String(g?.type || "") !== "manual")
    .map(g => ({ ...g }));

  function addRow(){
    working.push({
      type: "workouts_week",
      title: ""
    });
    render();
  }

  // helper: exercise options by type
  function exerciseOptionsForType(t){
    const list = (state.exerciseLibrary?.[t] || []).slice();
    return list.map(x => ({ id: x.id, name: x.name }));
  }

  const body = el("div", {}, []);

  function render(){
    body.innerHTML = "";

    working.forEach((g, idx) => {
      // ----- Type select (manual removed) -----
      const typeSel = el("select", {}, [
        el("option", { value:"workouts_week", text:"Workouts / week" }),
        el("option", { value:"weight_target", text:"Bodyweight target" }),
        el("option", { value:"strength_target", text:"Exercise target (Weightlifting/Cardio/Core)" })
      ]);
      typeSel.value = g.type || "workouts_week";
      typeSel.addEventListener("change", () => {
        g.type = typeSel.value;
        render();
      });

      const titleInput = el("input", { value:(g.title || ""), placeholder:"Title (optional)" });
      titleInput.addEventListener("input", () => { g.title = titleInput.value; });

      const typeFields = [];

      // workouts_week
      if(g.type === "workouts_week"){
        const target = el("input", { type:"number", min:"0", step:"1", value:(g.target==null?"":String(g.target)), placeholder:"Target workouts/week" });
        target.addEventListener("input", () => { g.target = target.value === "" ? null : Number(target.value); });
        typeFields.push(el("label", {}, [ el("span", { text:"Target" }), target ]));
      }

      // weight_target
      if(g.type === "weight_target"){
        const targetW = el("input", { type:"number", min:"0", step:"0.1", value:(g.targetWeight==null?"":String(g.targetWeight)), placeholder:"Target weight" });
        targetW.addEventListener("input", () => { g.targetWeight = targetW.value === "" ? null : Number(targetW.value); });

        const startW = el("input", { type:"number", min:"0", step:"0.1", value:(g.startWeight==null?"":String(g.startWeight)), placeholder:"Start weight" });
        startW.addEventListener("input", () => { g.startWeight = startW.value === "" ? null : Number(startW.value); });

        typeFields.push(el("label", {}, [ el("span", { text:"Target weight" }), targetW ]));
        typeFields.push(el("label", {}, [ el("span", { text:"Start weight" }), startW ]));
      }

      // strength_target (now supports weightlifting/cardio/core)
      if(g.type === "strength_target"){
        // exercise type
        const exTypeSel = el("select", {}, [
          el("option", { value:"weightlifting", text:"Weightlifting" }),
          el("option", { value:"cardio", text:"Cardio" }),
          el("option", { value:"core", text:"Core" })
        ]);
        exTypeSel.value = g.exerciseType || "weightlifting";
        exTypeSel.addEventListener("change", () => {
          g.exerciseType = exTypeSel.value;
          // defaults by type
          if(g.exerciseType === "cardio"){
            g.metric = g.metric || "distance"; // distance or timeSec
          } else if(g.exerciseType === "core"){
            g.metric = g.metric || "volume";   // volume or timeSec (both stored as totalVolume)
          } else {
            g.metric = "topWeight";
          }
          g.exerciseId = null;
          render();
        });

        // exercise select
        const exType = exTypeSel.value;
        const options = exerciseOptionsForType(exType);

        const exSel = el("select", {}, [
          el("option", { value:"", text:"Select exercise" }),
          ...options.map(ex => el("option", { value: ex.id, text: ex.name }))
        ]);
        exSel.value = g.exerciseId || "";
        exSel.addEventListener("change", () => { g.exerciseId = exSel.value || null; });

        typeFields.push(el("label", {}, [ el("span", { text:"Category" }), exTypeSel ]));
        typeFields.push(el("label", {}, [ el("span", { text:"Exercise" }), exSel ]));

        // ----- target inputs by type (match logging UI) -----
        if(exType === "weightlifting"){
          // legacy field: targetWeight
          const targetLift = el("input", { type:"number", min:"0", step:"1", value:(g.targetWeight==null?"":String(g.targetWeight)), placeholder:"Target weight" });
          targetLift.addEventListener("input", () => { g.targetWeight = targetLift.value === "" ? null : Number(targetLift.value); });

          typeFields.push(el("label", {}, [ el("span", { text:"Target weight (lb)" }), targetLift ]));
        }

        if(exType === "cardio"){
          // choose whether target is distance or time (same as how you log cardio)
          const metricSel = el("select", {}, [
            el("option", { value:"distance", text:"Distance" }),
            el("option", { value:"timeSec", text:"Time" })
          ]);
          metricSel.value = g.metric || "distance";
          metricSel.addEventListener("change", () => { g.metric = metricSel.value; render(); });

          typeFields.push(el("label", {}, [ el("span", { text:"Track" }), metricSel ]));

          if(metricSel.value === "timeSec"){
            const minInput = el("input", { type:"number", min:"0", step:"1", value:"", placeholder:"Min" });
            const secInput = el("input", { type:"number", min:"0", step:"1", value:"", placeholder:"Sec" });

            // prefill from stored targetValue seconds
            const t = Math.max(0, Math.floor(Number(g.targetValue) || 0));
            minInput.value = String(Math.floor(t / 60) || "");
            secInput.value = String((t % 60) || "");

            const sync = () => {
              const min = Math.max(0, Math.floor(Number(minInput.value) || 0));
              const sec = Math.max(0, Math.floor(Number(secInput.value) || 0));
              g.targetValue = (min * 60) + sec;
            };
            minInput.addEventListener("input", sync);
            secInput.addEventListener("input", sync);

            typeFields.push(el("div", { class:"row2" }, [
              el("label", {}, [ el("span", { text:"Minutes" }), minInput ]),
              el("label", {}, [ el("span", { text:"Seconds" }), secInput ])
            ]));
          } else {
            const dist = el("input", { type:"number", min:"0", step:"0.1", value:(g.targetValue==null?"":String(g.targetValue)), placeholder:"Distance" });
            dist.addEventListener("input", () => { g.targetValue = dist.value === "" ? null : Number(dist.value); });
            typeFields.push(el("label", {}, [ el("span", { text:"Distance" }), dist ]));
          }
        }

        if(exType === "core"){
          // match logging: sets+reps OR time
          const metricSel = el("select", {}, [
            el("option", { value:"volume", text:"Sets + Reps" }),
            el("option", { value:"timeSec", text:"Time" })
          ]);
          metricSel.value = g.metric || "volume";
          metricSel.addEventListener("change", () => { g.metric = metricSel.value; render(); });

          typeFields.push(el("label", {}, [ el("span", { text:"Track" }), metricSel ]));

          if(metricSel.value === "timeSec"){
            const minInput = el("input", { type:"number", min:"0", step:"1", value:"", placeholder:"Min" });
            const secInput = el("input", { type:"number", min:"0", step:"1", value:"", placeholder:"Sec" });

            const t = Math.max(0, Math.floor(Number(g.targetValue) || 0));
            minInput.value = String(Math.floor(t / 60) || "");
            secInput.value = String((t % 60) || "");

            const sync = () => {
              const min = Math.max(0, Math.floor(Number(minInput.value) || 0));
              const sec = Math.max(0, Math.floor(Number(secInput.value) || 0));
              g.targetValue = (min * 60) + sec;
            };
            minInput.addEventListener("input", sync);
            secInput.addEventListener("input", sync);

            typeFields.push(el("div", { class:"row2" }, [
              el("label", {}, [ el("span", { text:"Minutes" }), minInput ]),
              el("label", {}, [ el("span", { text:"Seconds" }), secInput ])
            ]));
          } else {
            // For goals, we store a simple numeric targetValue for volume.
            // Your core summary uses totalVolume (reps*sets*weight OR timeSec). This keeps it consistent.
            const vol = el("input", { type:"number", min:"0", step:"1", value:(g.targetValue==null?"":String(g.targetValue)), placeholder:"Target volume" });
            vol.addEventListener("input", () => { g.targetValue = vol.value === "" ? null : Number(vol.value); });
            typeFields.push(el("label", {}, [ el("span", { text:"Target (Sets/Reps volume)" }), vol ]));
          }
        }
      }

      body.appendChild(el("div", { class:"goalEditRow" }, [
        el("div", { class:"goalEditCols" }, [
          el("label", {}, [ el("span", { text:"Type" }), typeSel ]),
          el("label", {}, [ el("span", { text:"Title" }), titleInput ]),
          ...typeFields
        ]),
        el("div", { style:"height:10px" }),
        el("button", { class:"btn danger", onClick: () => { working.splice(idx, 1); render(); } }, ["Remove"])
      ]));

      body.appendChild(el("div", { style:"height:10px" }));
    });

    body.appendChild(el("div", { class:"btnrow" }, [
      el("button", { class:"btn", onClick: addRow }, ["+ Add goal"])
    ]));
  }

  render();

  Modal.open({
    title: "Edit Goals",
    bodyNode: el("div", {}, [
      body,
      el("div", { style:"height:12px" }),
      el("div", { class:"note", text:"Goals auto-update from your logs (Weightlifting, Cardio, Core)." }),
      el("div", { style:"height:12px" }),
      el("div", { class:"btnrow" }, [
        el("button", { class:"btn", onClick: Modal.close }, ["Cancel"]),
        el("button", {
          class:"btn primary",
          onClick: () => {
            const cleaned = working.map(x => {
              const base = { type: String(x.type || "workouts_week"), title: (x.title || "").trim() };

              if(base.type === "workouts_week"){
                base.target = Number.isFinite(Number(x.target))
                  ? Math.max(0, Math.round(Number(x.target)))
                  : Math.max(0, Math.round(Number(state.profile?.workoutsPerWeekGoal || 4)));
                return base;
              }

              if(base.type === "weight_target"){
                const cur = getLatestWeight();
                base.startWeight = Number.isFinite(Number(x.startWeight)) ? Number(x.startWeight) : (Number.isFinite(cur) ? cur : null);
                base.targetWeight = Number.isFinite(Number(x.targetWeight)) ? Number(x.targetWeight) : null;
                return base;
              }

              if(base.type === "strength_target"){
                base.exerciseType = String(x.exerciseType || "weightlifting");
                base.exerciseId = x.exerciseId || null;

                if(base.exerciseType === "weightlifting"){
                  base.metric = "topWeight";
                  base.targetWeight = Number.isFinite(Number(x.targetWeight)) ? Math.max(0, Math.round(Number(x.targetWeight))) : null;
                } else if(base.exerciseType === "cardio"){
                  base.metric = String(x.metric || "distance");
                  base.targetValue = Number.isFinite(Number(x.targetValue)) ? Math.max(0, Number(x.targetValue)) : null;
                } else {
                  // core
                  base.metric = String(x.metric || "volume");
                  base.targetValue = Number.isFinite(Number(x.targetValue)) ? Math.max(0, Number(x.targetValue)) : null;
                }
                return base;
              }

              return base;
            })
            // ✅ Safety filter: never persist manual goals again
            .filter(g => String(g.type) !== "manual");

            state.profile.goals = cleaned;
            Storage.save(state);
            Modal.close();
            renderView();
          }
        }, ["Save"])
      ])
    ])
  });
};

function goalsListNode(){
  const goals = (state.profile.goals || []).filter(g => String(g?.type || "") !== "manual");

  if(goals.length === 0){
    return el("div", { class:"note", text:"No goals yet. Tap “Edit Goals” to add goals." });
  }

  return el("div", { class:"goalsList" }, goals.map(g => {
    const display = computeGoalDisplay(g);
    if(!display) return null;

    const pct = (typeof display.pct === "number" && Number.isFinite(display.pct))
      ? Math.max(0, Math.min(100, Math.round(display.pct)))
      : null;

    return el("div", { class:"goalItem" }, [
      el("div", {}, [
        el("div", { style:"font-weight:900;", text: display.title || "Goal" }),
        el("div", { class:"note", text: display.sub || "" })
      ]),
      (pct === null)
        ? el("div", { class:"tag", text:"—" })
        : el("div", { class:"tag good", text:`${pct}%` })
    ]);
  }).filter(Boolean));
}
  // ----------------------------
  // Render (Option A: Today, This Week, Goals)
  // ----------------------------
  const cards = [];

  // Today
  cards.push(
    el("div", { class:"card" }, [
      el("div", { class:"homeRow" }, [
        el("div", {}, [
          el("h2", { text:"Today" }),
          el("div", { class:"note", text: workoutSub })
        ]),
        el("button", {
          class:"btn primary",
          onClick: () => navigate("routine")
        }, ["Log workout"])
      ]),

      el("div", { class:"kpi", style:"margin-top:8px" }, [
        el("div", { class:"big", text: workoutTitle })
      ]),

      el("div", { style:"height:10px" }),

      // Top 3 planned exercises (show last logged performance; supports weightlifting/cardio/core)
(top3.length === 0)
  ? el("div", { class:"note", text: (!routine ? "Select a routine to see planned exercises." : (day?.isRest ? "Rest day." : "Add exercises in Routine Editor.")) })
  : el("div", { class:"exList" }, (day.exercises || []).slice(0,3).map(rx => {

      const exName = resolveExerciseName(rx.type, rx.exerciseId, rx.nameSnap);

      // Time formatter (local + safe)
      const fmtTimeSec = (sec) => {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2,"0")}`;
      };

        // Pull the most recent TWO entries for this routine exercise (so we can show +/- since last time)
      LogEngine.ensure();

      const _entries = (state.logs?.workouts || [])
        .filter(e => e && e.routineExerciseId === rx.id)
        .sort((a,b) => (b.dateISO || "").localeCompare(a.dateISO || "") || (b.createdAt||0)-(a.createdAt||0));

      const last = _entries[0] || null;
      const prev = _entries[1] || null;

      let metaText = "No previous logs";

      function fmtSignedNumber(n){
        const v = Number(n) || 0;
        if(!v) return "0";
        return (v > 0 ? `+${v}` : `${v}`);
      }

      function deltaSuffix(type, lastEntry, prevEntry){
        if(!lastEntry || !prevEntry) return "";

        // Weightlifting: compare best set (weight first, then reps)
        if(type === "weightlifting"){
          const bestOf = (entry) => {
            const sets = Array.isArray(entry?.sets) ? entry.sets : [];
            let best = null;
            for(const s of sets){
              const w = Number(s.weight) || 0;
              const r = Math.max(0, Math.floor(Number(s.reps) || 0));
              if(!best || w > best.w || (w === best.w && r > best.r)){
                best = { w, r };
              }
            }
            return best;
          };

          const a = bestOf(lastEntry);
          const b = bestOf(prevEntry);
          if(!a || !b) return "";

          const dw = Math.round((a.w - b.w) * 100) / 100;
          if(dw){
            return ` • ${fmtSignedNumber(dw)} lb`;
          }

          const dr = (a.r || 0) - (b.r || 0);
          if(dr){
            return ` • ${fmtSignedNumber(dr)} rep${Math.abs(dr) === 1 ? "" : "s"}`;
          }

          return "";
        }

        // Cardio: compare distance first (if present), otherwise time
        if(type === "cardio"){
          const sumA = lastEntry.summary || LogEngine.computeCardioSummary(lastEntry.sets || []);
          const sumB = prevEntry.summary || LogEngine.computeCardioSummary(prevEntry.sets || []);
          const distA = Number(sumA.distance) || 0;
          const distB = Number(sumB.distance) || 0;
          const tA = Number(sumA.timeSec) || 0;
          const tB = Number(sumB.timeSec) || 0;

          if(distA || distB){
            const dd = Math.round((distA - distB) * 100) / 100;
            if(dd){
              return ` • ${fmtSignedNumber(dd)} dist`;
            }
          }

          if(tA || tB){
            const dt = Math.round(tA - tB);
            if(dt){
              const abs = Math.abs(dt);
              const pretty = fmtTimeSec(abs);
              return ` • ${dt > 0 ? "+" : "-"}${pretty}`;
            }
          }

          return "";
        }

        // Core: compare total reps first (sets×reps) if present, otherwise time
        if(type === "core"){
          const first = (entry) => (Array.isArray(entry?.sets) ? entry.sets : [])[0] || {};
          const a0 = first(lastEntry);
          const b0 = first(prevEntry);

          const setsA = Math.max(0, Math.floor(Number(a0.sets) || 0));
          const repsA = Math.max(0, Math.floor(Number(a0.reps) || 0));
          const timeA = Math.max(0, Math.floor(Number(a0.timeSec) || 0));

          const setsB = Math.max(0, Math.floor(Number(b0.sets) || 0));
          const repsB = Math.max(0, Math.floor(Number(b0.reps) || 0));
          const timeB = Math.max(0, Math.floor(Number(b0.timeSec) || 0));

          const totalRepsA = setsA * repsA;
          const totalRepsB = setsB * repsB;

          if(totalRepsA || totalRepsB){
            const dr = totalRepsA - totalRepsB;
            if(dr){
              return ` • ${fmtSignedNumber(dr)} rep${Math.abs(dr) === 1 ? "" : "s"}`;
            }
          }

          if(timeA || timeB){
            const dt = timeA - timeB;
            if(dt){
              const abs = Math.abs(dt);
              const pretty = fmtTimeSec(abs);
              return ` • ${dt > 0 ? "+" : "-"}${pretty}`;
            }
          }

          return "";
        }

        return "";
      }

      if(last){
        const type = last.type || rx.type;
        const delta = deltaSuffix(type, last, prev);

        // Weightlifting: show best set from last session
        if(type === "weightlifting"){
          const sets = Array.isArray(last.sets) ? last.sets : [];
          let best = null;
          for(const s of sets){
            const w = Number(s.weight) || 0;
            const r = Math.max(0, Math.floor(Number(s.reps) || 0));
            if(!best || w > best.w || (w === best.w && r > best.r)){
              best = { w, r };
            }
          }
          if(best && best.w > 0){
            metaText = (best.r > 0 ? `Last: ${best.w} lb × ${best.r}` : `Last: ${best.w} lb`) + delta;
          } else {
            metaText = "No previous logs";
          }
        }

        // Cardio: show distance + time (+ incline if present)
        else if(type === "cardio"){
          const sum = last.summary || LogEngine.computeCardioSummary(last.sets || []);
          const dist = Number(sum.distance) || 0;
          const t = Number(sum.timeSec) || 0;
          const inc = (sum.incline == null) ? "" : ` • Incline: ${sum.incline}`;
          if(dist > 0 || t > 0){
            metaText = `Last: ${dist > 0 ? dist : "—"} • ${t > 0 ? fmtTimeSec(t) : "—"}${inc}${delta}`;
          } else {
            metaText = "No previous logs";
          }
        }

        // Core: show sets×reps OR time (+ weight if present)
        else if(type === "core"){
          const s0 = (Array.isArray(last.sets) ? last.sets : [])[0] || {};
          const sets = Math.max(0, Math.floor(Number(s0.sets) || 0));
          const reps = Math.max(0, Math.floor(Number(s0.reps) || 0));
          const timeSec = Math.max(0, Math.floor(Number(s0.timeSec) || 0));
          const w = Number(s0.weight) || 0;

          const repPart = (sets > 0 && reps > 0) ? `${sets}×${reps}` : "";
          const timePart = (timeSec > 0) ? fmtTimeSec(timeSec) : "";
          const detail = [repPart, timePart].filter(Boolean).join(" • ");
          const wPart = (w > 0) ? ` @ ${w}` : "";

          metaText = detail ? `Last: ${detail}${wPart}${delta}` : "No previous logs";
        }

        // Fallback
        else {
          metaText = "No previous logs";
        }
      }

      return el("div", { class:"exItem" }, [
        el("div", { class:"left" }, [
          el("div", { class:"name", text: exName }),
          el("div", { class:"meta", text: metaText })
        ])
      ]);
    })),

      el("div", { style:"height:10px" }),

      // Status pill only (keep "Not Started" pill, remove redundant left text)
el("div", { class:"homeRow", style:"justify-content:flex-end;" }, [
  el("div", { class:"tag" + (status.kind ? ` ${status.kind}` : ""), text: status.tag })
])
    ])
  );

  // This Week (dots + 3 metric cards + Coach Insight)
cards.push(
  el("div", { class:"card" }, [
    el("div", { class:"homeRow" }, [
      el("div", {}, [
        el("h2", { text:"This Week" })
      ]),
      el("button", { class:"btn", onClick: openWeekDetails }, ["View details"])
    ]),

    el("div", { style:"height:10px" }),

    // Day labels above dots
    dotLabels,
    el("div", { style:"height:6px" }),
    dots,

    el("div", { style:"height:12px" }),

    // 3 separate metric cards
    el("div", { class:"homeMetricCards" }, [
      el("button", {
  class:"homeMetricCard",
  onClick: () => navigate("attendance")
}, [
  el("div", { class:"homeMetricTop" }, [
    el("div", { class:"homeMetricTitle", text:"Attendance" }),

    // ✅ Use coaching-window denominator so mid-week starters never see 0/6, 0/7, etc.
    el("div", { class:"homeMetricPill", text:`${workoutsDone}/${thisWeekDenom}` })
  ]),

  // ✅ Copy matches what we’re actually measuring (days trained in the active window)
  el("div", { class:"homeMetricSub", text:"Days trained this week" }),

  el("div", { class:"homeMetricVal", text:`${workoutsDone} / ${thisWeekDenom}` })
]),

      el("button", {
        class:"homeMetricCard",
        onClick: () => navigate("weight")
      }, [
        el("div", { class:"homeMetricTop" }, [
          el("div", { class:"homeMetricTitle", text:"Weight" }),
          el("div", { class:"homeMetricPill", text:wDeltaText })
        ]),
        el("div", { class:"homeMetricSub", text:"Change since week start" }),
        el("div", { class:"homeMetricVal", text:wDeltaText })
      ]),

      el("button", {
        class:"homeMetricCard" + (proteinOn ? "" : " disabled"),
        onClick: () => {
          if(!proteinOn){
            showToast("Protein is turned off in Settings");
            return;
          }
          navigate("protein_history");
        }
      }, [
        el("div", { class:"homeMetricTop" }, [
          el("div", { class:"homeMetricTitle", text:"Protein" }),
          el("div", { class:"homeMetricPill", text: proteinOn ? `${proteinGoalDays}/${activeDaysTotal}` : "Off" })
        ]),
        el("div", { class:"homeMetricSub", text: proteinOn ? "Days you hit your goal" : "Enable in Settings → Profile" }),
        el("div", { class:"homeMetricVal", text: proteinOn ? `${proteinGoalDays} / ${activeDaysTotal}` : "Off" })
      ])
    ]),

    // Coach Insight (replaces Consistency/Pace)
    el("div", { style:"height:12px" }),
    el("div", { class:"coachInsight" }, [
      el("div", { class:"coachTitle", text:"Coach Insight" }),
      el("div", { class:"coachText", text: `${coach.line1}\n${coach.line2}`.trim() }),
      el("div", { class:"coachAction", text: coach.action })
    ])
  ])
);

  // Goals
  cards.push(
    el("div", { class:"card" }, [
      el("div", { class:"homeRow" }, [
        el("div", {}, [
          el("h2", { text:"Goals" })
        ]),
        el("button", { class:"btn", onClick: openGoalsEditor }, ["Edit Goals"])
      ]),
      el("div", { style:"height:10px" }),
      goalsListNode()
    ])
  );

  return el("div", { class:"grid" }, cards);
},

        ProteinHistory(){
        
        if(!isProteinEnabled()){
  return el("div", { class:"grid" }, [
    el("div", { class:"card" }, [
      el("h2", { text:"Protein is turned off" }),
      el("div", { class:"note", text:"Enable protein tracking in Settings → Profile to use Protein History." }),
      el("div", { style:"height:12px" }),
      el("div", { class:"btnrow" }, [
        el("button", { class:"btn primary", onClick: () => navigate("settings") }, ["Go to Settings"]),
        el("button", { class:"btn", onClick: () => navigate("home") }, ["Back to Home"])
      ])
    ])
  ]);
}

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

Routine(){
const root = el("div", { class:"routinePage" });

  let routine = Routines.getActive();
  if(!routine){

    function openRoutineRecovery(){
      const body = el("div", {}, [
        el("div", { class:"note", text:"Choose a template to instantly recreate a routine. If you previously deleted everything, this is the fastest recovery." }),
        el("div", { style:"height:12px" })
      ]);

      const list = el("div", { class:"list" });

      (RoutineTemplates || []).forEach(tpl => {
        list.appendChild(el("div", {
          class:"item",
          onClick: () => {
            try{
              Routines.addFromTemplate(tpl.key, tpl.name); // seeds library + saves + sets active
              Modal.close();
              showToast(`Created: ${tpl.name}`);
              renderView(); // re-render current route (Routine)
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
        el("button", { class:"btn", onClick: () => { Modal.close(); navigate("settings"); } }, ["Go to Settings"]),
        el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
      ]));

      Modal.open({
        title:"Create a routine",
        center: true,
        bodyNode: body
      });
    }

    root.appendChild(el("div", { class:"card" }, [
      el("h2", { text:"Routine" }),
      el("div", { class:"note", text:"No active routine found. Create one now (you don’t need Settings)." }),
      el("div", { style:"height:12px" }),
      el("div", { class:"btnrow" }, [
        el("button", { class:"btn primary", onClick: openRoutineRecovery }, ["Create routine"]),
        el("button", {
          class:"btn",
          onClick: () => {
            // Helpful shortcut: jump to Backup & Restore section
            UIState.settings = UIState.settings || {};
            UIState.settings.open = UIState.settings.open || {};
            UIState.settings.open.backup = true;
            navigate("settings");
          }
        }, ["Backup & Restore"])
      ])
    ]));

    return root;
  }

const today = new Date();
const todayISO = Dates.todayISO(); // local date (fixes Feb 14 UTC bug)

const weekStartsOn = normalizedWeekStartsOn();
const weekStartISO = Dates.startOfWeekISO(todayISO, weekStartsOn);

// "Today" in our routine-order index (0..6 where 0 is user's week start)
const todayIndex = routineIndexFromJsDow(today.getDay(), weekStartsOn);
let selectedIndex = todayIndex;

// Map selected index (0..6 in start-of-week order) to an actual calendar date in the current week
function getSelectedDateISO(index){
  return Dates.addDaysISO(weekStartISO, index);
}
  // Label date as Today / Tomorrow / "Feb 15"
function prettyDayTag(dateISO){
  // ✅ hard guard
  if(!Dates.isISO(dateISO)) return "—";

  if(dateISO === todayISO) return "Today";
  if(dateISO === Dates.addDaysISO(todayISO, 1)) return "Tomorrow";

  return Dates.formatShort(dateISO); // "Feb 15" (never "Invalid Date")
}

  function getDay(index){
    routine = Routines.getActive(); // ✅ always refresh active routine
    return (routine?.days || []).find(d => d.order === index) || null;
  }
function openRoutinePicker(anchorBtn){
  let all = Routines.getAll() || [];
  const activeId = Routines.getActive()?.id || null;

  // Find an existing routine that was created from a template (preferred),
  // otherwise fall back to name match (for older saved data).
  function findRoutineForTemplate(tpl){
    const byKey = all.find(r => String(r.templateKey || "") === String(tpl.key || ""));
    if(byKey) return byKey;

    const byName = all.find(r => normName(r.name) === normName(tpl.name));
    return byName || null;
  }

// ────────────────────────────
// Visual-only layout upgrade
// Active pinned, rest scrollable
// ────────────────────────────

// Outer shell (column layout)
const shell = el("div", {
  style: "display:flex; flex-direction:column; max-height:70vh;"
});

// Title (fixed)
shell.appendChild(
  el("div", { class:"popTitle", text:"Select routine" })
);

// Identify active routine (visual only)
const activeRoutine = all.find(r => r.id === activeId);

// Fixed Active Section
if(activeRoutine){
  shell.appendChild(
    el("div", { style:"margin-top:8px;" }, [
      el("div", { class:"popItem" }, [
        el("div", { class:"l" }, [
          el("div", { class:"n", text: activeRoutine.name }),
          el("div", { class:"m", text:"Currently active" })
        ]),
        el("div", { class:"popBadge", text:"Active" })
      ])
    ])
  );

  shell.appendChild(el("div", {
    style:"height:1px; background:rgba(255,255,255,.08); margin:12px 0;"
  }));
}

// Scrollable area (existing + templates)
const scrollHost = el("div", {
  style:"overflow:auto; padding-right:4px; display:grid; gap:10px;"
});

// ────────────────────────────
// Existing routines (UNCHANGED LOGIC)
// ────────────────────────────

if(all.length === 0){
  scrollHost.appendChild(
    el("div", { class:"note", text:"No routines yet. Choose a template below to create one." })
  );
}else{
  all.forEach(r => {
    const isActive = (r.id === activeId);

    scrollHost.appendChild(
      el("div", {
        class:"popItem",
        onClick: () => {
          Routines.setActive(r.id);
          routine = Routines.getActive();
          selectedIndex = todayIndex;
          PopoverClose();
          repaint();
        }
      }, [
        el("div", { class:"l" }, [
          el("div", { class:"n", text:r.name }),
          el("div", { class:"m", text: isActive ? "Currently active" : "Tap to activate" })
        ]),
        isActive
          ? el("div", { class:"popBadge", text:"Active" })
          : el("div", { class:"m", text:"" })
      ])
    );
  });
}

// Spacer before templates
scrollHost.appendChild(el("div", { style:"height:12px" }));

// Templates title
scrollHost.appendChild(
  el("div", { class:"popTitle", text:"Default templates" })
);

// ────────────────────────────
// Default templates (UNCHANGED LOGIC)
// ────────────────────────────

(RoutineTemplates || []).forEach(tpl => {

  const existingAtRender = findRoutineForTemplate(tpl);
  const labelRight = existingAtRender ? "Activate" : "Add";

  scrollHost.appendChild(
    el("div", {
      class:"popItem",
      onClick: () => {

        all = Routines.getAll() || [];
        const existingNow = findRoutineForTemplate(tpl);

        if(existingNow){
          Routines.setActive(existingNow.id);
          routine = Routines.getActive();
          selectedIndex = todayIndex;

          PopoverClose();
          repaint();
          showToast(`Active: ${existingNow.name}`);
          return;
        }

        Routines.addFromTemplate(tpl.key, tpl.name);

        routine = Routines.getActive();
        selectedIndex = todayIndex;

        PopoverClose();
        repaint();
        showToast(`Created: ${tpl.name}`);
      }
    }, [
      el("div", { class:"l" }, [
        el("div", { class:"n", text: tpl.name }),
        el("div", { class:"m", text: tpl.desc || "Template" })
      ]),
      el("div", { class:"m", text: labelRight })
    ])
  );
});

// Attach scroll area
shell.appendChild(scrollHost);

// Open popover (same behavior)
PopoverOpen(anchorBtn, shell);
}

  // Phase 3: Per-exercise Workout Execution (logger)


// [moved to assets/js/modals/*.modal.js]

function isDayComplete(dateISO, day){
  const ex = (day?.exercises || []);
  if(ex.length === 0) return false;
  return ex.every(rx => hasRoutineExerciseLog(dateISO, rx.id));
}
  function repaint(){
  routine = Routines.getActive();
  root.innerHTML = "";

  // Fixed (top) vs scrollable (below carousel)
  const fixedHost = el("div", { class:"routineFixed" });
  const scrollHost = el("div", { class:"routineScroll" });
  root.appendChild(fixedHost);
  root.appendChild(scrollHost);

  const day = getDay(selectedIndex);
  const selectedDateISO = getSelectedDateISO(selectedIndex);

function openExerciseHistoryModal(type, exerciseId, exNameOverride=null){
  LogEngine.ensure();

  const exName = exNameOverride || resolveExerciseName(type, exerciseId, "Exercise");
  const entries = LogEngine.entriesForExercise(type, exerciseId); // desc (most recent first)

  const head = el("div", { class:"note" }, [
    `${exName} • ${ExerciseLibrary.typeLabel(type)}`
  ]);

  const list = el("div", { class:"list" });

  if(entries.length === 0){
    list.appendChild(el("div", { class:"note", text:"No history yet for this exercise." }));
  }else{
    // Show last entry + recent history (top 12)
    entries.slice(0, 12).forEach(e => {
      list.appendChild(el("div", { class:"item" }, [
        el("div", { class:"left" }, [
          el("div", { class:"name", text: e.dateISO }),
          el("div", { class:"meta", text: formatEntryDetail(type, e) })
        ]),
        el("div", { class:"actions" }, [
          el("div", { class:"meta", text: prBadges(e.pr) })
        ])
      ]));
    });
  }

   Modal.open({
    title: "History",
    center: true,
    bodyNode: el("div", { class:"grid" }, [
      head,
      list,
      el("div", { style:"height:10px" }),
      el("button", { class:"btn", onClick: Modal.close }, ["Close"])
    ])
  });

  function prBadges(pr){
    if(!pr) return "";
    const b = [];
    if(pr.isPRWeight) b.push("PR W");
    if(pr.isPR1RM) b.push("PR 1RM");
    if(pr.isPRVolume) b.push("PR Vol");
    if(pr.isPRPace) b.push("PR Pace");
    return b.join(" • ");
  }

  function formatEntryDetail(type, entry){
    try{
      if(type === "weightlifting"){
        const sets = (entry.sets || []).map(s => `${s.weight || 0}×${s.reps || 0}`).join(" • ");
        const top = entry.summary?.bestWeight ?? "—";
        const vol = entry.summary?.totalVolume ?? "—";
        return `Sets: ${sets || "—"} | Top: ${top} | Vol: ${vol}`;
      }
      if(type === "cardio"){
        const d = entry.summary?.distance ?? "—";
        const t = formatTime(entry.summary?.timeSec ?? 0);
        const p = formatPace(entry.summary?.paceSecPerUnit);
        const inc = (entry.summary?.incline == null) ? "" : ` | Incline: ${entry.summary.incline}`;
        return `Dist: ${d} | Time: ${t} | Pace: ${p}${inc}`;
      }
      // core
      const s0 = (entry.sets || [])[0] || {};
      const vol = entry.summary?.totalVolume ?? "—";
      const repPart = (s0.sets && s0.reps) ? `${s0.sets}×${s0.reps}` : "";
      const timePart = (s0.timeSec && s0.timeSec > 0) ? formatTime(s0.timeSec) : "";
      const wPart = (s0.weight && s0.weight > 0) ? ` @ ${s0.weight}` : "";
      const detail = [repPart, timePart].filter(Boolean).join(" • ");
      return `${detail || "—"}${wPart} | Vol: ${vol}`;
    }catch(e){
      return "—";
    }
  }
}

    // ────────────────────────────
    // Header Card (locked layout)
    // ────────────────────────────
// ✅ NEW: persisted preference (default ON)
const show3DPreview = (state.profile?.show3DPreview !== false);

function setShow3DPreview(v){
  state.profile = state.profile || {};
  state.profile.show3DPreview = !!v;
  Storage.save(state);
  renderView(); // re-render Routine cleanly
}
    fixedHost.appendChild(el("div", { class:"card routineHeaderCard" }, [
  el("h2", { text:"Routine" }),
  el("div", { class:"note", text:`${routine.name} • ${weekStartsOn === "sun" ? "Sun–Sat" : "Mon–Sun"}` }),

  // ✅ Start Today (top-right)
  el("button", {
    class:"btn primary routineStartBtn",
    onClick: () => {
      selectedIndex = todayIndex;
      repaint();
      setTimeout(()=>{
        const first = scrollHost.querySelector("[data-unlogged='true']");
        if(first){
          first.scrollIntoView({ behavior:"smooth", block:"center" });
          first.classList.add("pulse");
          setTimeout(()=>first.classList.remove("pulse"),1200);
        }
      },0);
    }
  }, ["▶ Start Today"]),

  // ✅ 3D Preview toggle (bottom-right)
  el("button", {
    class:"btn mini routine3DToggle",
    onClick: () => setShow3DPreview(!show3DPreview)
  }, [`3D Preview: ${show3DPreview ? "ON" : "OFF"} 👁`]),

  el("div", { style:"height:10px" }),

  // Left-side: routine picker only
  el("div", { class:"rHdrRow" }, [
    el("button", {
      class:"btn ghost",
      onClick: (e) => openRoutinePicker(e.currentTarget)
    }, [`${routine.name} ▼`])
  ]),

  el("div", {
    class:"manageLink",
    onClick: () => navigate("routine_editor")
  }, ["Manage Routine ▾"])
]));


    if(!day){
      scrollHost.appendChild(el("div", { class:"card note" }, ["No day found."]));
      return;
    }

    // ────────────────────────────
    // 3D Card Carousel (visual container)
    // ────────────────────────────
// ✅ Only render the 3D carousel when enabled
if(show3DPreview){
  fixedHost.appendChild(el("div", { class:"card carouselCard" }, [
    (() => {
      let down = false;
      let startX = 0;
      let dx = 0;
      const THRESH = 55;

      function onDown(e){
        down = true;
        startX = e.clientX;
        dx = 0;
        try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){}
      }
      function onMove(e){
        if(!down) return;
        dx = e.clientX - startX;
      }
      function onEnd(){
        if(!down) return;
        down = false;

        if(dx <= -THRESH) selectedIndex = (selectedIndex + 1) % 7;
        else if(dx >= THRESH) selectedIndex = (selectedIndex + 6) % 7;

        repaint();
      }

      const names = weekdayNames(weekStartsOn);
      
      const c3d = el("div", {
        class:"c3d",
        onPointerDown: onDown,
        onPointerMove: onMove,
        onPointerUp: onEnd,
        onPointerCancel: onEnd,
        onLostPointerCapture: onEnd
      }, []);

      const offsets = [-2,-1,0,1,2];
      offsets.forEach(off => {
        const idx = (selectedIndex + off + 7) % 7;
        const d = getDay(idx) || { label:"Day", isRest:false, exercises:[] };

        const abs = Math.abs(off);
        const scale = (off === 0) ? 1 : (1 - abs * 0.10);
        const x = off * 92;
        const z = -(abs * 95);
        const y = abs * 6;
        const rot = off * -22;
        const op = (off === 0) ? 1 : (abs === 1 ? .65 : .30);

        const chips = [];
        chips.push(el("div", { class:"c3dChip", text: d.isRest ? "Rest Day" : "Training Day" }));
        if(idx === selectedIndex) chips.push(el("div", { class:"c3dChip active", text:"Active" }));

        const card = el("div", {
          class: "c3dCard" + (idx === selectedIndex ? " sel" : ""),
          style: `transform: translateX(${x}px) translateY(${y}px) translateZ(${z}px) rotateY(${rot}deg) scale(${scale}); opacity:${op};`
        }, [
          el("div", {}, [
            el("div", { class:"c3dDay", text: names[idx].toUpperCase() }),
            el("div", { class:"c3dLabel", text: d.label || "Day" }),
            el("div", { class:"c3dMeta", text: d.isRest ? "Rest" : `${(d.exercises||[]).length} exercises` })
          ]),
          el("div", { class:"c3dChips" }, chips)
        ]);

        card.addEventListener("click", () => {
          selectedIndex = idx;
          repaint();
        });

        c3d.appendChild(card);
      });

      return c3d;
    })()
  ]));
}

fixedHost.appendChild(el("div", { class:"routineDayStrip" }, [
  ...[0,1,2,3,4,5,6].map(i => {
    const d = getDay(i) || { label:"", isRest:false, exercises:[] };

    // date number for the week (weekStartISO already respects weekStartsOn)
    const dateISO = Dates.addDaysISO(weekStartISO, i);
    const dayNum = (() => {
      try{ return new Date(dateISO + "T00:00:00").getDate(); }
      catch(_){ return ""; }
    })();

    const dow = weekdayNames(weekStartsOn)[i].toUpperCase();
    const dayLabel = d.isRest ? "Rest" : (d.label || "Training");

    return el("button", {
      class: "routineDayBtn" + (i === selectedIndex ? " sel" : "") + (d.isRest ? " rest" : ""),
      onClick: () => { selectedIndex = i; repaint(); }
    }, [
      el("div", { class:"dow", text: dow }),
      el("div", { class:"num", text: String(dayNum || "") }),
      el("div", { class:"lbl", text: dayLabel }),
      el("div", { class:"dot" })
    ]);
  })
]));


    // Rest Day
    if(day.isRest){
scrollHost.appendChild(el("div", { class:"card restCard" }, [
        el("h2", { text:"Rest" }),
        el("div", { class:"note", text:`Rest day scheduled for ${selectedDateISO}.` })
      ]));
      return;
    }
    // Day completion banner
    if(isDayComplete(selectedDateISO, day)){
scrollHost.appendChild(el("div", { class:"card" }, [
        el("h2", { text:"Completed" }),
        el("div", { class:"note", text:`All exercises logged for ${selectedDateISO}.` }),
        el("div", { style:"height:10px" }),
        el("div", { class:"btnrow" }, [
          el("button", {
            class:"btn danger",
            onClick: () => {
              removeWorkoutEntriesForRoutineDay(selectedDateISO, routine.id, day.id);
              attendanceRemove(selectedDateISO);
              setNextNudge(null);
              repaint();
              showToast("Marked incomplete");
            }
          }, ["Mark incomplete"])
        ])
      ]));
    }


// ────────────────────────────
// Exercise Cards (compact)
// ────────────────────────────
(day.exercises || []).forEach(rx => {
  const exName = resolveExerciseName(rx.type, rx.exerciseId, rx.nameSnap);
  const logged = hasRoutineExerciseLog(selectedDateISO, rx.id);

  const max = lifetimeMaxSet(rx.type, rx.exerciseId);
  const maxText = max ? `${max.weight} × ${max.reps}` : "—";

  scrollHost.appendChild(el("div", {
    class:"card rxCard",
    id:`rx_${rx.id}`,
    "data-unlogged": logged ? "false" : "true"
  }, [
    el("div", { class:"rxTop" }, [
      el("div", { class:"rxName", text: exName }),
      el("div", {
        class:"rxChip" + (logged ? " on" : ""),
        text: logged ? "Logged" : "Not logged"
      })
    ]),

    el("div", { class:"rxMeta", text:`🏆 Lifetime Max: ${maxText}` }),

    el("div", { class:"rxActions" }, [
      el("button", {
        class:"btn primary sm",
        onClick: () => openExerciseLogger(rx, day, selectedDateISO)
      }, ["Log Sets"]),

      el("button", {
        class:"btn ghost sm",
        onClick: () => openExerciseHistoryModal(rx.type, rx.exerciseId, exName)
      }, ["History →"])
    ])
  ]));
});

  }

  repaint();
  return root;
},

Progress(){
  ExerciseLibrary.ensureSeeded();
  LogEngine.ensure();

  // Defaults
  let type = "weightlifting";
  let exerciseId = (state.exerciseLibrary?.weightlifting?.[0]?.id) || null;

  // Filters
  let routineId = ""; // "" = All routines
  const todayISO = Dates.todayISO();

  // ✅ If you logged sets with a manual date override (including future dates),
  // default Progress "To" to the latest logged date so the chart/history populate.
  function latestWorkoutDateISO(){
    const arr = (state.logs?.workouts || []);
    let max = "";
    for(const e of arr){
      const d = String(e?.dateISO || "");
      // ISO YYYY-MM-DD strings compare correctly lexicographically
      if(d && d > max) max = d;
    }
    return max || null;
  }

  const latestISO = latestWorkoutDateISO();
  const defaultToISO = (latestISO && latestISO > todayISO) ? latestISO : todayISO;

  let toISO = defaultToISO;
  let fromISO = Dates.addDaysISO(toISO, -30);


  // Metric default per type
  let metric = defaultMetricForType(type);

  // Search state
  let query = "";

  const root = el("div", { class:"grid" });

  // Header
  root.appendChild(el("div", { class:"card" }, [
    el("h2", { text:"Progress" }),
    el("div", { class:"note", text:"Search an exercise, then view trends + history. Keep the graph front-and-center." })
  ]));

  // ────────────────────────────
  // Compact Controls + Overview (single card)
  // ────────────────────────────
  const topCard = el("div", { class:"card" }, [
    el("h2", { text:"Find exercise" })
  ]);

  // Type segmented
  const typeRow = el("div", { class:"segRow" });
  const typeBtns = {
    weightlifting: el("button", { class:"seg", onClick: () => setType("weightlifting") }, ["Weightlifting"]),
    cardio:        el("button", { class:"seg", onClick: () => setType("cardio") }, ["Cardio"]),
    core:          el("button", { class:"seg", onClick: () => setType("core") }, ["Core"])
  };
  typeRow.appendChild(typeBtns.weightlifting);
  typeRow.appendChild(typeBtns.cardio);
  typeRow.appendChild(typeBtns.core);

  // Search bar + selected pill
  const searchWrap = el("div", { class:"progSearch" }, [
    el("div", { class:"ico", text:"🔎" }),
    el("input", {
      type:"text",
      value:"",
      placeholder:"Search exercise (e.g., Bench, Squat, Treadmill)…",
      onInput: (e) => {
        query = String(e.target.value || "");
        repaint(false);
      }
    })
  ]);

  const selectedRow = el("div", { class:"pillRow" });
  const resultsHost = el("div", { class:"progResults" });

  // Routine select (kept, but compact)
  const routineSelect = el("select", {});
  routineSelect.appendChild(el("option", { value:"", text:"All routines" }));
  routineSelect.addEventListener("change", () => {
    routineId = routineSelect.value || "";
    repaint(true);
  });

  // Date range chips
  const rangeRow = el("div", { class:"segRow" });
  const r7  = el("button", { class:"seg", onClick: () => { setRange(7); } }, ["7D"]);
  const r30 = el("button", { class:"seg", onClick: () => { setRange(30); } }, ["30D"]);
  const r90 = el("button", { class:"seg", onClick: () => { setRange(90); } }, ["90D"]);
  const r1y = el("button", { class:"seg", onClick: () => { setRange(365); } }, ["1Y"]);
  rangeRow.appendChild(r7); rangeRow.appendChild(r30); rangeRow.appendChild(r90); rangeRow.appendChild(r1y);

  // Custom date inputs (still available, compact)
  const fromInput = el("input", { type:"date", value: fromISO });
  const toInput   = el("input", { type:"date", value: toISO });

  fromInput.addEventListener("change", () => {
    fromISO = fromInput.value || fromISO;
    if(fromISO > toISO){
      toISO = fromISO;
      toInput.value = toISO;
    }
    repaint(true);
  });

  toInput.addEventListener("change", () => {
    toISO = toInput.value || toISO;
    if(toISO < fromISO){
      fromISO = toISO;
      fromInput.value = fromISO;
    }
    repaint(true);
  });

  // Metric segmented
  const metricRow = el("div", { class:"segRow" });

  // Overview host (compact KPIs)
const statsHost = el("div", { class:"pillRow", style:"margin-top:8px;" });

  topCard.appendChild(el("div", { class:"note", text:"Type + search to select an exercise." }));
  topCard.appendChild(typeRow);
  topCard.appendChild(el("div", { style:"height:10px" }));
  topCard.appendChild(searchWrap);
  topCard.appendChild(selectedRow);
  topCard.appendChild(resultsHost);

  topCard.appendChild(el("div", { style:"height:10px" }));

// Dates (single-line)
topCard.appendChild(el("div", {
  style:"display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:2px;"
}, [
  el("div", { class:"note", text:"From:" }),
  fromInput,
  el("div", { class:"note", text:"|" }),
  el("div", { class:"note", text:"To:" }),
  toInput
]));

  topCard.appendChild(el("div", { style:"height:8px" }));
  topCard.appendChild(el("div", { class:"note", text:"Metric" }));
  topCard.appendChild(metricRow);

  topCard.appendChild(el("div", { style:"height:10px" }));
  topCard.appendChild(el("div", { class:"note", text:"Overview" }));
  topCard.appendChild(statsHost);

  root.appendChild(topCard);

  // ────────────────────────────
  // Graph (primary focus)
  // ────────────────────────────
  const chartCard = el("div", { class:"card" }, [
    el("h2", { text:"Trend" })
  ]);
  const chartWrap = el("div", { class:"chartWrap" });
  const canvas = el("canvas", {});
  chartWrap.appendChild(canvas);
  const chartNote = el("div", { class:"note", style:"margin-top:10px;" });

  chartCard.appendChild(chartWrap);
  chartCard.appendChild(chartNote);
  root.appendChild(chartCard);

  // ────────────────────────────
  // History (collapsible)
  // ────────────────────────────
  const tableCard = el("div", { class:"card" }, [
    el("div", { class:"accItem" }, [
      el("div", {
        class:"accHead",
        onClick: () => {
          const body = tableCard.querySelector(".accBody");
          const caret = tableCard.querySelector(".accCaret");
          const isOpen = body.style.display === "block";
          body.style.display = isOpen ? "none" : "block";
          caret.textContent = isOpen ? "▾" : "▴";
        }
      }, [
        el("div", { class:"accTitle", text:"History" }),
        el("div", { class:"accCaret", text:"▾" })
      ]),
      el("div", { class:"accBody" }, [
        el("div", { class:"note", text:"Most recent logs for the selected exercise." }),
        el("div", { style:"height:8px" }),
        el("div", { class:"list", id:"progressHistoryHost" })
      ])
    ])
  ]);
  const tableHost = tableCard.querySelector("#progressHistoryHost");
  root.appendChild(tableCard);

  // Populate routine dropdown
  repaintRoutineSelect();

  // Initial paint
  repaint(true);
  return root;

  // ---- helpers ----
  function defaultMetricForType(t){
    if(t === "weightlifting") return "topWeight";
    if(t === "cardio") return "pace";
    return "volume";
  }

  function setType(next){
    type = next;
    query = "";
    searchWrap.querySelector("input").value = "";
    exerciseId = (state.exerciseLibrary?.[type]?.[0]?.id) || null;
    metric = defaultMetricForType(type);
    repaint(true);
  }

  function setRange(days){
    fromISO = Dates.addDaysISO(todayISO, -Math.max(1, Number(days) || 30));
    toISO = todayISO;
    fromInput.value = fromISO;
    toInput.value = toISO;
    repaint(true);
  }

  function repaintRoutineSelect(){
    routineSelect.innerHTML = "";
    routineSelect.appendChild(el("option", { value:"", text:"All routines" }));
    const all = Routines.getAll?.() || [];
    all.forEach(r => routineSelect.appendChild(el("option", { value:r.id, text:r.name })));
    routineSelect.value = routineId || "";
  }

  function setMetric(next){
    metric = next;
    repaint(true);
  }

  function repaintMetricRow(){
    metricRow.innerHTML = "";

    if(type === "weightlifting"){
      metricRow.appendChild(el("button", { class:"seg", onClick: () => setMetric("topWeight") }, ["Top Weight"]));
      metricRow.appendChild(el("button", { class:"seg", onClick: () => setMetric("est1RM") }, ["Est 1RM"]));
      metricRow.appendChild(el("button", { class:"seg", onClick: () => setMetric("volume") }, ["Volume"]));
    } else if(type === "cardio"){
      metricRow.appendChild(el("button", { class:"seg", onClick: () => setMetric("pace") }, ["Pace"]));
      metricRow.appendChild(el("button", { class:"seg", onClick: () => setMetric("distance") }, ["Distance"]));
      metricRow.appendChild(el("button", { class:"seg", onClick: () => setMetric("timeSec") }, ["Time"]));
    } else {
      metricRow.appendChild(el("button", { class:"seg", onClick: () => setMetric("volume") }, ["Volume"]));
    }

    // active styles
    [...metricRow.querySelectorAll(".seg")].forEach(btn => {
      const v = (btn.textContent || "").toLowerCase();
      const isActive =
        (metric === "topWeight" && v.includes("top")) ||
        (metric === "est1RM" && v.includes("1rm")) ||
        (metric === "volume" && v.includes("volume")) ||
        (metric === "pace" && v.includes("pace")) ||
        (metric === "distance" && v.includes("distance")) ||
        (metric === "timeSec" && v.includes("time"));
      btn.classList.toggle("active", isActive);
    });
  }

  function repaintTypeRow(){
    Object.entries(typeBtns).forEach(([k,btn]) => btn.classList.toggle("active", k === type));
  }

  function confirmDeleteLog(entry){
    Modal.open({
      title: "Delete log?",
      bodyNode: el("div", { class:"grid" }, [
        el("div", { class:"note", text:`This will permanently delete this log entry:` }),
        el("div", { class:"note", text:`${entry.dateISO} • ${tableLine(entry)}` }),
        el("div", { style:"height:10px" }),
        el("div", { class:"btnrow" }, [
          el("button", {
            class:"btn danger",
            onClick: () => {
              removeWorkoutEntryById(entry.id);
              Modal.close();
              repaint(true);
              showToast("Deleted");
            }
          }, ["Delete"]),
          el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
        ])
      ]),
      size: "sm"
    });
  }

  function repaint(forceChart){
    repaintTypeRow();
    repaintMetricRow();

    // Exercise library for current type
    const lib = (state.exerciseLibrary?.[type] || []).slice()
      .sort((a,b) => (a.name||"").localeCompare(b.name||""));

    // Ensure exerciseId is valid
    if(lib.length === 0){
      exerciseId = null;
    }else{
      if(!exerciseId || !lib.some(x => x.id === exerciseId)) exerciseId = lib[0].id;
    }

    // Search results
    resultsHost.innerHTML = "";
    selectedRow.innerHTML = "";

    const selectedName = exerciseId ? resolveExerciseName(type, exerciseId, "Exercise") : null;

    if(selectedName){
      selectedRow.appendChild(el("div", { class:"pill" }, [
        el("div", { class:"t", text:selectedName }),
        el("button", {
          class:"x",
          onClick: () => {
            exerciseId = null;
            repaint(true);
          }
        }, ["×"])
      ]));
    } else {
      selectedRow.appendChild(el("div", { class:"note", text:"No exercise selected." }));
    }

    const q = normName(query);
    if(query && lib.length){
      const hits = lib.filter(x => normName(x.name).includes(q)).slice(0, 10);
      if(hits.length){
        const list = el("div", { class:"list", style:"margin-top:8px;" }, hits.map(x => {
          return el("div", {
            class:"item",
            onClick: () => {
              exerciseId = x.id;
              query = "";
              searchWrap.querySelector("input").value = "";
              repaint(true);
            }
          }, [
            el("div", { class:"left" }, [
              el("div", { class:"name", text:x.name }),
              el("div", { class:"meta", text: typeLabel(type) })
            ])
          ]);
        }));
        resultsHost.appendChild(list);
      } else {
        resultsHost.appendChild(el("div", { class:"note", text:"No matches. Try a different keyword." }));
      }
    }

    // Stats + chart + table only if exercise selected
    statsHost.innerHTML = "";
    tableHost.innerHTML = "";
    chartNote.textContent = "";

    if(!exerciseId){
      destroyProgressChart();
      chartNote.textContent = "Select an exercise to see your trend.";
      tableHost.appendChild(el("div", { class:"note", text:"Select an exercise to see history." }));
      return;
    }

    // Filter entries for selected exercise
const all = (state.logs?.workouts || []).filter(e =>
  e.type === type &&
  e.exerciseId === exerciseId &&
  (e.dateISO >= fromISO && e.dateISO <= toISO)
);


    // Overview KPIs
    const desc = all.slice().sort((a,b) => (b.dateISO||"").localeCompare(a.dateISO||"") || (b.createdAt||0)-(a.createdAt||0));
    const latest = desc[0] || null;

    const bests = LogEngine.lifetimeBests(type, exerciseId);
    const bestText = bestsText(type, bests);

    // Overview (single pill): { PR: xxx | Last: xxx }
const prVal = formatMetricValue(type, metric, prForMetric(type, metric, bests));
const lastVal = latest ? formatMetricValue(type, metric, metricValue(type, metric, latest)) : "—";

statsHost.appendChild(el("div", { class:"pill" }, [
  el("div", { class:"t", text:`{ PR: ${prVal} | Last: ${lastVal} }` })
]));

    // Chart (ascending for series builder)
    const asc = all.slice().sort((a,b) => (a.dateISO||"").localeCompare(b.dateISO||"") || (a.createdAt||0)-(b.createdAt||0));
    if(asc.length < 2){
      destroyProgressChart();
      chartNote.textContent = `Not enough data in this range (${fromISO} to ${toISO}). Log at least 2 sessions.`;
    }else{
      const series = buildSeries(type, asc);
      renderProgressChart(canvas, type, metric, series);
      chartNote.textContent = `${asc.length} points • ${fromISO} → ${toISO}`;
    }

    // History table
    if(desc.length === 0){
      tableHost.appendChild(el("div", { class:"note", text:"No logs in this range." }));
    }else{
      desc.slice(0, 40).forEach(entry => {
        tableHost.appendChild(el("div", { class:"item" }, [
          el("div", { class:"left" }, [
            el("div", { class:"name", text: entry.dateISO }),
            el("div", { class:"meta", text: tableLine(entry) })
          ]),
          el("div", { class:"actions" }, [
            el("button", { class:"mini danger", onClick: () => confirmDeleteLog(entry) }, ["Delete"])
          ])
        ]));
      });
    }
  }

  function typeLabel(t){
    if(t === "weightlifting") return "Weightlifting";
    if(t === "cardio") return "Cardio";
    return "Core";
  }

  function bestsText(t, bests){
    if(!bests) return "";
    if(t === "weightlifting"){
      const bw = bests.bestWeight != null ? `${Math.round(bests.bestWeight*10)/10} top` : "";
      const brm = bests.best1RM != null ? `${Math.round(bests.best1RM*10)/10} est 1RM` : "";
      const bv = bests.bestVolume != null ? `${Math.round(bests.bestVolume)} vol` : "";
      return [bw, brm, bv].filter(Boolean)[0] || "";
    }
    if(t === "cardio"){
      const bp = bests.bestPace != null ? `${formatTime(Math.round(bests.bestPace))} pace` : "";
      return bp || "";
    }
    const bv = bests.bestVolume != null ? `${Math.round(bests.bestVolume)} vol` : "";
    return bv || "";
  }

  // ✅ helpers must stay INSIDE Progress() (not inside Views object root)
  function metricValue(type, metric, entry){
    try{
      if(!entry) return null;

      if(type === "weightlifting"){
        if(metric === "topWeight") return entry.summary?.bestWeight ?? entry.summary?.topWeight ?? null;
        if(metric === "est1RM")    return entry.summary?.est1RM ?? null;
        if(metric === "volume")    return entry.summary?.totalVolume ?? null;
        return entry.summary?.bestWeight ?? null;
      }

      if(type === "cardio"){
        if(metric === "pace")     return entry.summary?.paceSecPerUnit ?? null;
        if(metric === "distance") return entry.summary?.distance ?? null;
        if(metric === "timeSec")  return entry.summary?.timeSec ?? null;
        return entry.summary?.paceSecPerUnit ?? null;
      }

      // core
      if(metric === "volume") return entry.summary?.totalVolume ?? null;
      return entry.summary?.totalVolume ?? null;
    }catch(e){
      return null;
    }
  }

  function prForMetric(type, metric, bests){
    try{
      if(!bests) return null;

      if(type === "weightlifting"){
        if(metric === "topWeight") return bests.bestWeight ?? null;
        if(metric === "est1RM")    return bests.best1RM ?? null;
        if(metric === "volume")    return bests.bestVolume ?? null;
        return bests.bestWeight ?? null;
      }

      if(type === "cardio"){
        if(metric === "pace")     return bests.bestPace ?? null;
        if(metric === "distance") return bests.bestDistance ?? null;
        if(metric === "timeSec")  return bests.bestTime ?? null;
        return bests.bestPace ?? null;
      }

      // core
      if(metric === "volume") return bests.bestVolume ?? null;
      return bests.bestVolume ?? null;
    }catch(e){
      return null;
    }
  }

  function formatMetricValue(type, metric, v){
    if(v == null) return "—";

    // cardio formatting
    if(type === "cardio" && metric === "pace") return formatPace(v);
    if(type === "cardio" && metric === "timeSec") return formatTime(v);

    // numeric formatting
    if(typeof v === "number"){
      const n = Math.round(v * 10) / 10;
      return String(n);
    }
    return String(v);
  }

  // ✅ FIX: was referenced but missing — caused Progress to crash
  function tableLine(entry){
    try{
      if(!entry) return "—";
      const t = entry.type || type;           // fall back to current Progress tab type
      const s = entry.summary || {};

      if(t === "weightlifting"){
        const bw  = (s.bestWeight != null) ? `${formatMetricValue("weightlifting","topWeight", s.bestWeight)} top` : "";
        const brm = (s.best1RM != null)    ? `${formatMetricValue("weightlifting","est1RM",    s.best1RM)} est1RM` : "";
        const bv  = (s.totalVolume != null)? `${formatMetricValue("weightlifting","volume",   s.totalVolume)} vol` : "";
        return [bw, brm, bv].filter(Boolean).join(" • ") || "—";
      }

      if(t === "cardio"){
        const pace = (s.paceSecPerUnit != null) ? `${formatMetricValue("cardio","pace", s.paceSecPerUnit)} pace` : "";
        const dist = (s.distance != null)       ? `${formatMetricValue("cardio","distance", s.distance)} dist` : "";
        const time = (s.timeSec != null)        ? `${formatMetricValue("cardio","timeSec", s.timeSec)} time` : "";
        return [pace, dist, time].filter(Boolean).join(" • ") || "—";
      }

      // core
      const vol = (s.totalVolume != null) ? `${formatMetricValue("core","volume", s.totalVolume)} vol` : "";
      return vol || "—";
    }catch(_){
      return "—";
    }
  }

},  // ✅ end Progress()
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
         Settings(){
        // Persist across renders (not saved to Storage)
const ui = UIState.settings || (UIState.settings = {});

// ✅ ensure accordion state exists so taps don’t crash
if(!ui.open || typeof ui.open !== "object") ui.open = {};

// ✅ default: open Profile the first time Settings is visited
if(Object.keys(ui.open).length === 0) ui.open.profile = true;

        const normalize = (s) => (s||"").toString().trim().toLowerCase();

        // Accordion builder
        const makeSection = ({ key, title, subtitle, keywords, bodyNode }) => {
          const q = normalize(ui.q);
          const hay = normalize([title, subtitle, ...(keywords||[])].join(" "));
          const match = !q || hay.includes(q);

          // Auto-open if searching and matched
          const isOpen = !!ui.open?.[key] || (q && match);

          const item = el("div", { class:"accItem", style: match ? "" : "display:none;" });

          const head = el("div", {
            class:"accHead",
          onClick: () => {
  ui.open = ui.open || {};
  ui.open[key] = !ui.open[key];
  renderView();
}
          }, [
            el("div", {}, [
              el("div", { class:"accTitle", text: title }),
              el("div", { class:"accSub", text: subtitle })
            ]),
            el("div", { class:"accCaret", text: isOpen ? "−" : "+" })
          ]);

          const body = el("div", { class:"accBody", style: isOpen ? "" : "display:none;" }, [ bodyNode ]);

          item.appendChild(head);
          item.appendChild(body);
          return item;
        };

        // --- Profile controls ---
        const nameInput = el("input", { type:"text", value: state.profile?.name || "" });
        let proteinGoalRow = null; // ✅ used for live show/hide when toggling Track protein
             

        // ✅ NEW: Track Protein toggle (default ON)
        let trackProtein = (state.profile?.trackProtein !== false);

        const proteinInput = el("input", {
          type:"number",
          min:"0",
          step:"1",
          value: state.profile?.proteinGoal || 150
        });

        // Wrap so we can show/hide cleanly
        const proteinRow = el("div", {
          class:"row2",
          style: trackProtein ? "" : "display:none;"
        }, [
          el("label", {}, [ el("span", { text:"Protein goal (grams/day)" }), proteinInput ])
        ]);

        const trackProteinSwitch = el("div", {
          class: "switch" + (trackProtein ? " on" : ""),
          onClick: () => {
            trackProtein = !trackProtein;
            trackProteinSwitch.classList.toggle("on", trackProtein);
        
            // ✅ Live show/hide the goal row immediately (no save required)
            if(proteinGoalRow){
              proteinGoalRow.style.display = trackProtein ? "" : "none";
            }
        
            // Optional: if turning ON and goal is 0/empty, seed a reasonable default
            if(trackProtein){
              const v = Number(proteinInput.value || 0);
              if(!Number.isFinite(v) || v <= 0){
                proteinInput.value = "150";
              }
              try{ proteinInput.focus(); }catch(_){}
            }
          }
        });

        const weekSelect = el("select", {});
        weekSelect.appendChild(el("option", { value:"sun", text:"Sunday" }));
        weekSelect.appendChild(el("option", { value:"mon", text:"Monday" }));

        // Backward compatible: accept older numeric values (0/1) if they exist
        const ws = state.profile?.weekStartsOn;
        const normalized =
          (ws === 0 || ws === "0" || ws === "sun") ? "sun" :
          (ws === 1 || ws === "1" || ws === "mon") ? "mon" :
          "mon";
        weekSelect.value = normalized;

        let hideRestDays = !!state.profile?.hideRestDays;
        let show3DPreview = (state.profile?.show3DPreview !== false); // default ON

        const hideRestSwitch = el("div", {
          class: "switch" + (hideRestDays ? " on" : ""),
          onClick: () => {
            hideRestDays = !hideRestDays;
            hideRestSwitch.classList.toggle("on", hideRestDays);
          }
        });

        // ✅ NEW: 3D Preview switch (persisted)
        const show3DSwitch = el("div", {
          class: "switch" + (show3DPreview ? " on" : ""),
          onClick: () => {
            show3DPreview = !show3DPreview;
            show3DSwitch.classList.toggle("on", show3DPreview);
          }
        });



          function saveProfile(){
          state.profile = state.profile || {};
          state.profile.name = (nameInput.value || "").trim();

          // ✅ NEW
          state.profile.trackProtein = !!trackProtein;
          state.profile.proteinGoal = trackProtein
            ? Math.max(0, Number(proteinInput.value || 0))
            : 0;

          state.profile.weekStartsOn = (weekSelect.value === "sun") ? "sun" : "mon";
          state.profile.hideRestDays = !!hideRestDays;
          state.profile.show3DPreview = !!show3DPreview;

          Storage.save(state);
          showToast("Saved");
          renderView();
        }

        // --- Existing import/export helpers (reuse your current functions) ---
        function openImportPasteModal(){
          const ta = el("textarea", {
            style:"width:100%; min-height: 260px; border-radius: 14px; padding: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: rgba(255,255,255,.92); font-size: 12px; outline:none; resize: vertical;",
            placeholder:"Paste your backup JSON here…"
          });

          const err = el("div", { class:"note", style:"display:none; color: rgba(255,92,122,.95);" });

          Modal.open({
            title: "Import from paste",
            bodyNode: el("div", {}, [
              el("div", { class:"note", text:"This will overwrite your current data in this browser." }),
              el("div", { style:"height:10px" }),
              ta,
              err,
              el("div", { style:"height:12px" }),
              el("div", { class:"btnrow" }, [
                el("button", {
                  class:"btn danger",
                  onClick: () => {
                    err.style.display = "none";
                    try{
                      importBackupJSON(ta.value || "");
                      Modal.close();
                      navigate("home");
                    }catch(e){
                      err.textContent = e.message || "Import failed.";
                      err.style.display = "block";
                    }
                  }
                }, ["Import (overwrite)"]),
                el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
              ])
            ])
          });
        }

        function openImportFileModal(){
          const input = el("input", { type:"file", accept:"application/json,.json" });
          const err = el("div", { class:"note", style:"display:none; color: rgba(255,92,122,.95);" });

          Modal.open({
            title: "Import from file",
            bodyNode: el("div", {}, [
              el("div", { class:"note", text:"Choose a .json backup file. Import overwrites current data." }),
              el("div", { style:"height:10px" }),
              input,
              err,
              el("div", { style:"height:12px" }),
              el("div", { class:"btnrow" }, [
                el("button", {
                  class:"btn danger",
                  onClick: async () => {
                    err.style.display = "none";
                    try{
                      const f = input.files?.[0];
                      if(!f) throw new Error("Select a JSON file first.");
                      const txt = await f.text();
                      importBackupJSON(txt);
                      Modal.close();
                      navigate("home");
                    }catch(e){
                      err.textContent = e.message || "Import failed.";
                      err.style.display = "block";
                    }
                  }
                }, ["Import (overwrite)"]),
                el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
              ])
            ])
          });
        }

        // --- Section bodies ---
        const profileBody = el("div", {}, [
          el("div", { class:"setRow" }, [
            el("div", {}, [
              el("div", { style:"font-weight:820;", text:"Name" }),
              el("div", { class:"meta", text:"Shown on Home" })
            ]),
            nameInput
          ]),
          el("div", { class:"setRow" }, [
          el("div", {}, [
            el("div", { style:"font-weight:820;", text:"Track protein" }),
            el("div", { class:"meta", text:"Enable or disable protein tracking across the app" })
          ]),
          trackProteinSwitch
        ]),
        
        // BEGIN: proteinGoalRow
        (proteinGoalRow = el("div", {
          class:"setRow",
          style: trackProtein ? "" : "display:none;"
        }, [
          el("div", {}, [
            el("div", { style:"font-weight:820;", text:"Daily protein goal" }),
            el("div", { class:"meta", text:"grams/day" })
          ]),
          proteinInput
        ])),
        // END: proteinGoalRow
          el("div", { class:"setRow" }, [
            el("div", {}, [
              el("div", { style:"font-weight:820;", text:"Week starts on" }),
              el("div", { class:"meta", text:"Affects Home week view" })
            ]),
            weekSelect
          ]),
          el("div", { class:"setRow" }, [
            el("div", {}, [
              el("div", { style:"font-weight:820;", text:"Hide rest days" }),
              el("div", { class:"meta", text:"Keep Home focused on training days" })
            ]),
            hideRestSwitch
          ]),
          el("div", { class:"setRow" }, [
  el("div", {}, [
    el("div", { style:"font-weight:820;", text:"3D Preview" }),
    el("div", { class:"meta", text:"Show/hide the 3D routine card preview on the Routine page" })
  ]),
  show3DSwitch
]),
          el("div", { style:"height:12px" }),
          el("div", { class:"btnrow" }, [
            el("button", { class:"btn primary", onClick: () => {
              try{ saveProfile(); }
              catch(e){
                Modal.open({
                  title:"Save failed",
                  bodyNode: el("div", {}, [
                    el("div", { class:"note", text: e?.message || "Could not save settings." }),
                    el("div", { style:"height:12px" }),
                    el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
                  ])
                });
              }
            }}, ["Save changes"])
          ])
        ]);

                // ────────────────────────────
        // Routines section (Recovery + Management)
        // ────────────────────────────
        function openCreateRoutineModal(afterCreateRoute=null){
          const body = el("div", {}, [
            el("div", { class:"note", text:"Pick a template to create a routine. This will set it as your active routine." }),
            el("div", { style:"height:12px" })
          ]);

          const list = el("div", { style:"display:grid; gap:10px;" });

          (RoutineTemplates || []).forEach(tpl => {
            list.appendChild(el("div", {
              class:"setLink",
              onClick: () => {
                try{
                  const r = Routines.addFromTemplate(tpl.key, tpl.name);
                  Modal.close();
                  showToast(`Created: ${r.name}`);
                  if(afterCreateRoute) navigate(afterCreateRoute);
                  else renderView();
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
              el("div", { class:"l" }, [
                el("div", { class:"a", text: tpl.name }),
                el("div", { class:"b", text: tpl.desc || "Template" })
              ]),
              el("div", { style:"opacity:.85", text:"+" })
            ]));
          });

          body.appendChild(list);

          body.appendChild(el("div", { style:"height:14px" }));
          body.appendChild(el("div", { class:"btnrow" }, [
            el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
          ]));

          Modal.open({
            title:"Create routine",
            center:true,
            bodyNode: body
          });
        }

        function openRenameRoutineModal(routine){
          const input = el("input", { type:"text", value: routine?.name || "" });

          Modal.open({
            title:"Rename routine",
            bodyNode: el("div", {}, [
              el("div", { class:"note", text:"Update the routine name." }),
              el("div", { style:"height:10px" }),
              input,
              el("div", { style:"height:12px" }),
              el("div", { class:"btnrow" }, [
                el("button", {
                  class:"btn primary",
                  onClick: () => {
                    try{
                      Routines.rename(routine.id, input.value || "");
                      Modal.close();
                      showToast("Renamed");
                      renderView();
                    }catch(e){
                      showToast(e?.message || "Rename failed");
                    }
                  }
                }, ["Save"]),
                el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
              ])
            ])
          });
        }

        const routinesBody = el("div", {}, [
          el("div", { class:"note", text:"Manage routines here. If you accidentally deleted everything, create a new routine below." }),
          el("div", { style:"height:10px" }),

          el("div", { class:"btnrow" }, [
            el("button", { class:"btn primary", onClick: () => openCreateRoutineModal("routine") }, ["+ Create routine"]),
            el("button", { class:"btn", onClick: () => navigate("routine") }, ["Open Routine"]),
            el("button", { class:"btn", onClick: () => navigate("routine_editor") }, ["Routine Editor"])
          ]),

          el("div", { style:"height:12px" }),

          (() => {
            const all = Routines.getAll() || [];
            const activeId = state.activeRoutineId || null;

            if(all.length === 0){
              return el("div", { class:"note", text:"No routines found. Tap “Create routine” to get started." });
            }

            const list = el("div", { style:"display:grid; gap:10px;" });

            all.forEach(r => {
              const isActive = (r.id === activeId);
              const meta = isActive ? "Active" : "Saved";

              list.appendChild(el("div", { class:"setRow" }, [
                el("div", {}, [
                  el("div", { style:"font-weight:850;", text: r.name || "Routine" }),
                  el("div", { class:"meta", text: meta })
                ]),
                el("div", { class:"btnrow", style:"justify-content:flex-end; flex-wrap:wrap;" }, [

                  el("button", {
                    class:"btn" + (isActive ? " primary" : ""),
                    onClick: () => {
                      try{
                        Routines.setActive(r.id);
                        showToast("Active routine set");
                        renderView();
                      }catch(e){
                        showToast(e?.message || "Could not set active");
                      }
                    }
                  }, [isActive ? "Active" : "Set active"]),

                  el("button", {
                    class:"btn",
                    onClick: () => openRenameRoutineModal(r)
                  }, ["Rename"]),

                  el("button", {
                    class:"btn",
                    onClick: () => {
                      try{
                        Routines.duplicate(r.id);
                        showToast("Routine duplicated");
                        renderView();
                      }catch(e){
                        showToast(e?.message || "Duplicate failed");
                      }
                    }
                  }, ["Duplicate"]),

                  el("button", {
                    class:"btn danger",
                    onClick: () => {
                      confirmModal({
                        title:"Delete routine",
                        note:`Delete “${r.name || "Routine"}”? This cannot be undone.\n\nTip: Auto Backups can restore if needed.`,
                        confirmText:"Delete",
                        danger:true,
                        onConfirm: () => {
                          try{
                            Routines.remove(r.id);
                            showToast("Routine deleted");
                            renderView();
                          }catch(e){
                            showToast(e?.message || "Delete failed");
                          }
                        }
                      });
                    }
                  }, ["Delete"])
                ])
              ]));
            });

            return list;
          })()
        ]);
           
        const libraryBody = el("div", {}, [
          el("div", { class:"setLink", onClick: () => navigate("exercise_library") }, [
            el("div", { class:"l" }, [
              el("div", { class:"a", text:"Open Exercise Library Manager" }),
              el("div", { class:"b", text:"Add, edit, and delete exercises" })
            ]),
            el("div", { style:"opacity:.8", text:"→" })
          ]),
          el("div", { style:"height:10px" }),
          el("div", { class:"note", text:"Tip: Exercises removed from the library will still display in old logs using the saved name snapshot." })
        ]);

        const backupBody = el("div", {}, [
          el("div", { class:"note", text:"Export your full app data as JSON. Import will overwrite your current data in this browser." }),

          // ───────────────
          // Export reminder
          // ───────────────
          el("div", { style:"height:10px" }),
          (() => {
            const last = (typeof getLastExportAt === "function") ? getLastExportAt() : 0;
            const never = !last || !Number.isFinite(last);
            const label = never
              ? "Last file backup: Never exported"
              : `Last file backup: ${new Date(last).toLocaleString()}`;
            const sub = never
              ? "Recommendation: export a file backup occasionally (helps if iOS clears storage / app is deleted)."
              : "Tip: auto backups protect against mistakes/bugs; file backups protect against phone/browser storage being wiped.";
            return el("div", { class:"note", text: `${label}\n${sub}` });
          })(),

          el("div", { style:"height:10px" }),

          // ───────────────
          // Export
          // ───────────────
          el("div", { class:"btnrow" }, [
            el("button", {
              class:"btn primary",
              onClick: () => {
                try{
                  const txt = exportBackupJSON();
                  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
                  downloadTextFile(`gym-dashboard-backup_${stamp}.json`, txt);

                  // ✅ track export for reminder UI (best-effort)
                  try{ if(typeof setLastExportAt === "function") setLastExportAt(Date.now()); }catch(_){}
                  showToast("Backup exported");
                }catch(e){
                  Modal.open({
                    title:"Export failed",
                    bodyNode: el("div", {}, [
                      el("div", { class:"note", text: e.message || "Could not export backup." }),
                      el("div", { style:"height:12px" }),
                      el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
                    ])
                  });
                }
              }
            }, ["Export JSON backup"]),

            el("button", {
              class:"btn",
              onClick: () => {
                Modal.open({
                  title: "Copy backup JSON",
                  bodyNode: el("div", {}, [
                    el("div", { class:"note", text:"Copy/paste this JSON anywhere safe." }),
                    el("div", { style:"height:10px" }),
                    el("textarea", {
                      style:"width:100%; min-height: 260px; border-radius: 14px; padding: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: rgba(255,255,255,.92); font-size: 12px; outline:none; resize: vertical;",
                    }, [exportBackupJSON()]),
                    el("div", { style:"height:12px" }),
                    el("button", { class:"btn primary", onClick: Modal.close }, ["Done"])
                  ])
                });
              }
            }, ["View JSON"])
          ]),

// ───────────────
// Auto backups (rolling snapshots)
// ───────────────
el("div", { style:"height:14px" }),
el("div", {
  class:"note",
  text:"Auto backups (recommended): the app keeps rolling snapshots so you can restore if something breaks."
}),
el("div", { style:"height:8px" }),

el("div", { class:"btnrow" }, [

  // Restore from Auto Backup
  el("button", {
    class:"btn",
    onClick: async () => {
      try{
        if(typeof BackupVault === "undefined" || !BackupVault.list){
          Modal.open({
            title:"Auto backups unavailable",
            bodyNode: el("div", {}, [
              el("div", { class:"note", text:"Auto backups are not enabled in this build." }),
              el("div", { style:"height:12px" }),
              el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
            ])
          });
          return;
        }

        const snapsRaw = await BackupVault.list(BackupVault.KEEP || 20);

        // Safety-net: remove duplicates (same createdAt)
        const seen = new Set();
        const snaps = (snapsRaw || []).filter(s => {
          const key = String(s?.createdAt ?? "");
          if(seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const container = el("div", {
          style:"max-height:70vh; overflow-y:auto; padding-right:6px;"
        });

        // Sticky Banner (always visible)
        container.appendChild(
          el("div", {
            style:[
              "position:sticky",
              "top:0",
              "z-index:5",
              "padding:10px 0",
              "background:rgba(20,20,30,.65)",
              "backdrop-filter:blur(8px)",
              "-webkit-backdrop-filter:blur(8px)",
              "border-bottom:1px solid rgba(255,255,255,.08)"
            ].join(";")
          }, [
            el("div", { style:"display:flex; align-items:center; gap:8px;" }, [
              el("div", { style:"width:8px;height:8px;border-radius:50%;background:#4CAF50;" }),
              el("div", { style:"font-weight:800;", text:"Auto Backups Active" })
            ]),
            el("div", { class:"note", text:`Keeping: ${BackupVault.KEEP || 20} snapshots` })
          ])
        );

        container.appendChild(el("div", { style:"height:12px" }));

        function normalizeReason(r){
          const rr = String(r || "").toLowerCase();
          if(rr.includes("pre-import")) return "Pre-Import";
          if(rr.includes("pre-reset")) return "Pre-Reset";
          if(rr.includes("manual")) return "Manual";
          return "Auto";
        }

        function badgeColor(label){
          const l = String(label || "").toLowerCase();
          if(l.includes("pre-import")) return "#FFC107";
          if(l.includes("pre-reset")) return "#F44336";
          if(l.includes("manual")) return "#2196F3";
          return "#4CAF50";
        }

        if(!snaps.length){
          container.appendChild(
            el("div", { class:"card" }, [
              el("div", { class:"note", text:"No auto backups found yet." })
            ])
          );
        }else{
          snaps.forEach(snap => {
            const dObj = new Date(Number(snap?.createdAt || Date.now()));
            const dt =
              dObj.toLocaleDateString(undefined, { month:"short", day:"numeric" }) +
              " • " +
              dObj.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });

            const c = snap?.counts || {};
            const reasonLabel = normalizeReason(snap?.reason);

            const card = el("div", {
              class:"card",
              style:"cursor:pointer;"
            }, [
              el("div", { style:"display:flex; justify-content:space-between; align-items:center;" }, [
                el("div", { style:"font-weight:900;", text: dt }),
                el("div", {
                  style:`
                    padding:4px 10px;
                    border-radius:999px;
                    font-size:11px;
                    font-weight:700;
                    background:${badgeColor(reasonLabel)}22;
                    color:${badgeColor(reasonLabel)};
                    border:1px solid ${badgeColor(reasonLabel)}55;
                  `
                }, [reasonLabel])
              ]),
              el("div", { style:"height:8px" }),
              el("div", { class:"note", text:`${c.routines||0} Routines • ${c.workouts||0} Workouts` }),
              el("div", { class:"note", text:`${c.protein||0} Protein • ${c.attendance||0} Attendance` })
            ]);

            card.onclick = () => {
              confirmModal({
                title:"Restore Snapshot?",
                note:`Restore snapshot from:\n${dt}\n\nThis will overwrite your current data.`,
                confirmText:"Restore",
                danger:true,
                onConfirm: () => {
                  try{
                    state = migrateState(snap.state);
                    Storage.save(state);
                    showToast("Snapshot restored");
                    Modal.close();
                    navigate("home");
                  }catch(err){
                    Modal.open({
                      title:"Restore failed",
                      bodyNode: el("div", {}, [
                        el("div", { class:"note", text: err?.message || "Could not restore snapshot." }),
                        el("div", { style:"height:12px" }),
                        el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
                      ])
                    });
                  }
                }
              });
            };

            container.appendChild(card);
            container.appendChild(el("div", { style:"height:10px" }));
          });
        }

        Modal.open({
          title:"Restore from Auto Backup",
          bodyNode: container
        });

      }catch(e){
        Modal.open({
          title:"Could not load auto backups",
          bodyNode: el("div", {}, [
            el("div", { class:"note", text: e?.message || "Could not read auto backups." }),
            el("div", { style:"height:12px" }),
            el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
          ])
        });
      }
    }
  }, ["Restore from Auto Backup"]),

  // Clear Auto Backups
  el("button", {
    class:"btn danger",
    onClick: () => {
      confirmModal({
        title:"Clear auto backups",
        note:"Deletes ALL auto backup snapshots stored on this device. This cannot be undone.",
        confirmText:"Clear auto backups",
        danger:true,
        onConfirm: async () => {
          try{
            if(typeof BackupVault !== "undefined" && BackupVault.clear){
              await BackupVault.clear();
              showToast("Auto backups cleared");
            }else{
              showToast("Auto backups not available");
            }
          }catch(_){
            showToast("Could not clear auto backups");
          }
        }
      });
    }
  }, ["Clear Auto Backups"])

]),


          // ───────────────
          // Import options
          // ───────────────
          el("div", { style:"height:14px" }),
          el("div", { class:"note", text:"Import options:" }),
          el("div", { style:"height:8px" }),
          el("div", { class:"btnrow" }, [
            el("button", { class:"btn danger", onClick: openImportPasteModal }, ["Import (paste JSON)"]),
            el("button", { class:"btn danger", onClick: openImportFileModal }, ["Import (upload file)"])
          ]),
          el("div", { style:"height:10px" }),
          el("div", { class:"note", text:"Tip: Export a file backup occasionally. Auto backups help you recover from mistakes/bugs, but a file backup is safer if iOS clears storage." })
        ]);
           
        const dataBody = el("div", {}, [
          el("div", { class:"note", text:"Repair tools and targeted clears." }),
          el("div", { style:"height:10px" }),

          el("div", { class:"setLink", onClick: () => {
            confirmModal({
              title: "Repair workout logs",
              note: "Removes duplicate log entries (same date + routine exercise). Keeps the most recent.",
              confirmText: "Repair logs",
              danger: true,
              onConfirm: () => {
                const seen = new Map();
                const cleaned = [];
                (state.logs?.workouts || [])
                  .slice()
                  .sort((a,b)=> (b.createdAt||0) - (a.createdAt||0))
                  .forEach(e => {
                    const key = `${e.dateISO}_${e.routineExerciseId}`;
                    if(!seen.has(key)){
                      seen.set(key,true);
                      cleaned.push(e);
                    }
                  });
                state.logs.workouts = cleaned;
                Storage.save(state);
                showToast("Duplicates removed");
              }
            });
          }}, [
            el("div", { class:"l" }, [
              el("div", { class:"a", text:"Repair workout logs" }),
              el("div", { class:"b", text:"Remove duplicates (keeps most recent)" })
            ]),
            el("div", { style:"opacity:.8", text:"→" })
          ]),

          el("div", { style:"height:10px" }),
          el("div", { class:"note", text:"Clear specific data:" }),
          el("div", { style:"height:8px" }),

          el("div", { class:"btnrow" }, [
            el("button", {
              class:"btn danger",
              onClick: () => confirmModal({
                title: "Clear workout logs",
                note: "Deletes all workout logs. This cannot be undone.",
                confirmText: "Clear workouts",
                danger: true,
                onConfirm: () => { state.logs.workouts = []; Storage.save(state); showToast("Workout logs cleared"); }
              })
            }, ["Clear workouts"]),
            el("button", {
              class:"btn danger",
              onClick: () => confirmModal({
                title: "Clear weight logs",
                note: "Deletes all weigh-ins. This cannot be undone.",
                confirmText: "Clear weight",
                danger: true,
                onConfirm: () => { state.logs.weight = []; Storage.save(state); showToast("Weight logs cleared"); }
              })
            }, ["Clear weight"])
          ]),
          el("div", { style:"height:10px" }),
          el("div", { class:"btnrow" }, [
            el("button", {
              class:"btn danger",
              onClick: () => confirmModal({
                title: "Clear protein logs",
                note: "Deletes all protein entries. This cannot be undone.",
                confirmText: "Clear protein",
                danger: true,
                onConfirm: () => { state.logs.protein = []; Storage.save(state); showToast("Protein logs cleared"); }
              })
            }, ["Clear protein"]),
            el("button", {
              class:"btn danger",
              onClick: () => confirmModal({
                title: "Clear attendance",
                note: "Deletes attendance history. This cannot be undone.",
                confirmText: "Clear attendance",
                danger: true,
                onConfirm: () => { state.attendance = []; Storage.save(state); showToast("Attendance cleared"); }
              })
            }, ["Clear attendance"])
          ])
        ]);

        const debugBody = el("div", {}, [
          el("div", { class:"note", text:`Schema v${state.schemaVersion} • Approx storage: ${bytesToNice(appStorageBytes())}` }),
          el("div", { style:"height:10px" }),
          el("div", { class:"btnrow" }, [
            el("button", {
              class:"btn",
              onClick: () => Modal.open({
                title: "Current State (JSON)",
                bodyNode: el("pre", { style:"white-space:pre-wrap; font-size:12px; color: rgba(255,255,255,.85);" }, [
                  JSON.stringify(state, null, 2)
                ])
              })
            }, ["View state JSON"]),
            el("button", {
              class:"btn danger",
              onClick: () => {
                Modal.open({
                  title: "Reset local data",
                  bodyNode: el("div", {}, [
                    el("div", { class:"note", text:"This clears everything saved in this browser for the app." }),
                    el("div", { style:"height:12px" }),
                    el("div", { class:"btnrow" }, [
                      el("button", {
                        class:"btn danger",
                        onClick: () => {
                          Storage.reset();
                          state = Storage.load();
                          Modal.close();
                          navigate("home");
                        }
                      }, ["Reset"]),
                      el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
                    ])
                  ])
                });
              }
            }, ["Reset local data"])
          ])
        ]);
      // --- Support / Report an issue (Formspree) ---
const supportForm = el("form", {
  action: "https://formspree.io/f/xreakwzg",
  method: "POST"
}, [
  el("label", {}, [
    el("span", { text:"Type" }),
    el("select", { class:"glassSelect", name:"issue_type" }, [
      el("option", { value:"bug", text:"Bug" }),
      el("option", { value:"feature", text:"Feature request" }),
      el("option", { value:"data", text:"Data issue" }),
      el("option", { value:"other", text:"Other" })
    ])
  ]),

  el("div", { style:"height:10px" }),

  el("label", {}, [
    el("span", { text:"Your email (optional)" }),
    el("input", { name:"email", type:"email", placeholder:"name@email.com", autocomplete:"email" })
  ]),

  el("div", { style:"height:10px" }),

  el("label", {}, [
    el("span", { text:"Subject" }),
    el("input", { name:"subject", type:"text", placeholder:"Short summary" })
  ]),

  el("div", { style:"height:10px" }),

  el("label", {}, [
    el("span", { text:"Message" }),
    el("textarea", {
      name:"message",
      placeholder:"What happened? Steps to reproduce? What did you expect?",
      style:"width:100%; min-height:160px; border-radius:14px; padding:12px; border:1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: rgba(255,255,255,.92); font-size:12px; outline:none; resize:vertical;"
    })
  ]),

  el("div", { style:"height:12px" }),

  el("div", { class:"btnrow" }, [
    el("button", { class:"btn primary", type:"submit" }, ["Send report"]),
    el("button", {
      class:"btn",
      type:"button",
      onClick: (ev) => {
        const form = ev.target.closest("form");
        if(form) form.reset();
      }
    }, ["Clear"])
  ])
]);

// ✅ Attach submit handler using the real DOM API (reliable)
supportForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.currentTarget;
  const fd = new FormData(form);

  // Auto-attach diagnostics (safe + helpful)
  fd.set("app_version_latest", String(__latestVersion || ""));
  fd.set("app_version_applied", String(__appliedVersion || ""));
  fd.set("route", String(currentRoute || ""));
  fd.set("user_agent", String(navigator.userAgent || ""));
  fd.set("ts", new Date().toISOString());

  try{
    const r = await fetch(form.action, {
      method: "POST",
      body: fd,
      headers: { "Accept": "application/json" }
    });

    if(r.ok){
      form.reset();
      showToast("Sent — thank you!");
    }else{
      let msg = "Could not send.";
      try{
        const j = await r.json();
        if(j?.errors?.[0]?.message) msg = j.errors[0].message;
      }catch(_){}
      showToast(msg);
    }
  }catch(_){
    showToast("Network error — try again.");
  }
});

const supportBody = el("div", {}, [
  el("div", { class:"note", text:"Report a bug or request a feature. This sends a message directly to the developer." }),
  el("div", { style:"height:10px" }),
  supportForm
]);
        // --- Search Bar ---
        const searchInput = el("input", {
          type:"text",
          placeholder:"Search settings…",
          value: ui.q || ""
        });
        searchInput.addEventListener("input", (e) => {
          ui.q = e.target.value || "";
          renderView();
        });

const root = el("div", { class:"settingsWrap" }, [
  el("div", { class:"settingsSearch" }, [
    el("div", { class:"ico", text:"🔎" }),
    searchInput
  ]),
  el("div", { class:"accList" }, [
    makeSection({
      key:"profile",
      title:"Profile & Preferences",
      subtitle:"Name, protein goal, week start, rest days",
      keywords:["name","protein","week","rest","goal"],
      bodyNode: profileBody
    }),
      makeSection({
      key:"routines",
      title:"Routines",
      subtitle:"Create, set active, rename, duplicate, delete",
      keywords:["routine","routines","template","active","edit","duplicate","delete","create"],
      bodyNode: routinesBody
    }),
    makeSection({
      key:"library",
      title:"Exercise Library",
      subtitle:"Manage exercises (add/edit/delete)",
      keywords:["exercise","library","weightlifting","cardio","core"],
      bodyNode: libraryBody
    }),
    makeSection({
      key:"backup",
      title:"Backup & Restore",
      subtitle:"Export/import JSON backups",
      keywords:["backup","import","export","json","restore"],
      bodyNode: backupBody
    }),
    makeSection({
      key:"data",
      title:"Data Tools",
      subtitle:"Repair duplicates + clear specific data",
      keywords:["repair","duplicates","clear","logs","attendance"],
      bodyNode: dataBody
    }),
    makeSection({
      key:"debug",
      title:"Debug / About",
      subtitle:"View raw state + reset local data",
      keywords:["debug","reset","state","storage"],
      bodyNode: debugBody
    }),
    makeSection({
      key:"support",
      title:"Support / Report an issue",
      subtitle:"Send feedback to the developer",
      keywords:["support","issue","bug","feedback","feature","help","report"],
      bodyNode: supportBody
    })
  ])
]);
        return root;
      }
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


// [moved to assets/js/modals/*.modal.js]


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
