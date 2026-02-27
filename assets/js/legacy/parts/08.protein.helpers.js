/********************
 * 4c) Protein (Today) Helpers (Step 5)
 * OPTION B: A date only exists if user logs >0g and saves
 ********************/

// ✅ Read-only lookup (never creates/saves)
function findProteinEntry(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];
  return state.logs.protein.find(x => x.dateISO === dateISO) || null;
}

// ✅ Write-path helper (creates ONLY when we truly need to save something)
function ensureProteinEntry(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];
  let entry = state.logs.protein.find(x => x.dateISO === dateISO);
  if(!entry){
    entry = { dateISO, meals: [] }; // meals: [{ id, label, grams }]
    state.logs.protein.push(entry);
    Storage.save(state);
  }
  return entry;
}

// ✅ If an entry has no meals, remove the entire day so it doesn't appear in history
function cleanupProteinEntryIfEmpty(dateISO){
  state.logs = state.logs || { workouts: [], weight: [], protein: [] };
  state.logs.protein = state.logs.protein || [];

  const idx = state.logs.protein.findIndex(x => x.dateISO === dateISO);
  if(idx < 0) return;

  const entry = state.logs.protein[idx];
  const meals = Array.isArray(entry?.meals) ? entry.meals : [];
  if(meals.length === 0){
    state.logs.protein.splice(idx, 1);
    Storage.save(state);
  }
}


// ⚠️ Keep for compatibility (but this DOES create). Use only for write paths.
function getProteinForDate(dateISO){
  return ensureProteinEntry(dateISO);
}

// ✅ Save/update a meal:
// - If grams <= 0 → treat as "no log" and delete meal if it exists
// - If grams > 0 → create the day entry if missing and save
function upsertMeal(dateISO, mealId, label, grams){
  const cleanGrams = Math.max(0, Math.round(Number(grams) || 0));

  // ✅ If user sets 0g, this means "do not keep an entry"
  if(cleanGrams <= 0){
    if(mealId) deleteMeal(dateISO, mealId); // safe: won't create a day
    return null;
  }

  const p = ensureProteinEntry(dateISO);
  p.meals = p.meals || [];

  const idx = p.meals.findIndex(m => m.id === mealId);
  const clean = {
    id: mealId || uid("meal"),
    label: (label || "").trim() || "Meal",
    grams: cleanGrams
  };

  if(idx >= 0) p.meals[idx] = clean;
  else p.meals.push(clean);

  Storage.save(state);
  return clean.id;
}

// ✅ Delete a meal without creating the day.
// If last meal removed → delete the entire day entry.
function deleteMeal(dateISO, mealId){
  const p = findProteinEntry(dateISO);
  if(!p) return;

  p.meals = p.meals || [];
  const idx = p.meals.findIndex(m => m.id === mealId);
  if(idx >= 0) p.meals.splice(idx, 1);

  Storage.save(state);
  cleanupProteinEntryIfEmpty(dateISO);
}

// ✅ Read-only total (never creates/saves)
function totalProtein(dateISO){
  const p = findProteinEntry(dateISO);
  if(!p || !Array.isArray(p.meals)) return 0;
  return p.meals.reduce((sum,m) => sum + (Number(m.grams)||0), 0);
}

    

// [moved to assets/js/modals/*.modal.js]
