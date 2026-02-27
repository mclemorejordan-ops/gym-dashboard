/* =========================================================
   Gym Dashboard — Option A (No build) Restructure
   - Single entry point (index.html loads only /assets/js/app.js)
   - Deterministic boot order to prevent "undefined" and script-order bugs
   - All feature scripts loaded from one place
   ========================================================= */

(function(){
  "use strict";

  // ---- Global namespace (one place for shared app surface area) ----
  const root = window;
  const GymDash = root.GymDash = root.GymDash || {};
  GymDash.version = GymDash.version || "optionA-boot";
  GymDash.loaded = GymDash.loaded || {};

  // ---- Small loader with strict sequencing ----
  function loadScript(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // maintain order
      s.defer = true;
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function boot(){
    // Prevent double-boot (can happen on bfcache restores)
    if(GymDash.loaded.__boot) return;
    GymDash.loaded.__boot = true;

    // Keep list centralized so changes don't require editing index.html
    const scripts = [
            // Core guardrails (crash overlay + global namespace)
      './assets/js/core/guard.js',

      // Core app (legacy monolith preserved for stability)
      // Legacy split (ordered parts)
      './assets/js/legacy/parts/00.state.storage.js',
      './assets/js/legacy/parts/01.backup.import.js',
      './assets/js/legacy/parts/02.helpers.js',
      './assets/js/legacy/parts/03.settings.helpers.js',
      './assets/js/legacy/parts/04.attendance.helpers.js',
      './assets/js/legacy/parts/05.routine.templates.js',
      './assets/js/legacy/parts/06.exercise.library.js',
      './assets/js/legacy/parts/07.routine.engine.js',
      './assets/js/legacy/parts/08.protein.helpers.js',
      './assets/js/legacy/parts/09.logengine.prengine.js',
      './assets/js/legacy/parts/10.progress.helpers.js',
      './assets/js/legacy/parts/11.weight.engine.js',
      './assets/js/legacy/parts/12.routine.attendance.helpers.js',
      './assets/js/legacy/parts/13.crash.failsafe.js',
      './assets/js/legacy/parts/14.glass.dropdown.js',
      './assets/js/legacy/parts/15.modal.core.js',
      './assets/js/legacy/parts/16.router.views.js',
      './assets/js/legacy/parts/17.views.pages.js',
      './assets/js/legacy/parts/18.boot.js',

// Modals (still separate files, but now loaded deterministically)
      './assets/js/modals/protein.modal.js',
      './assets/js/modals/logsets.modal.js',
      './assets/js/modals/exercise-addedit.modal.js'
    ];

    // Load sequentially
    for(const src of scripts){
      await loadScript(src);
    }

    // Export known modal builders into the namespace (safe, optional)
    GymDash.modals = GymDash.modals || {};
    if(typeof root.buildProteinTodayModal === 'function') GymDash.modals.buildProteinTodayModal = root.buildProteinTodayModal;
    if(typeof root.buildLogSetsModal === 'function') GymDash.modals.buildLogSetsModal = root.buildLogSetsModal;
    if(typeof root.buildExerciseAddEditModal === 'function') GymDash.modals.buildExerciseAddEditModal = root.buildExerciseAddEditModal;

    // Optional: lightweight health flag
    GymDash.loaded.bootComplete = true;
  }

  // Boot after DOM is ready (but before renderView if legacy uses defer)
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { boot().catch(console.error); }, { once:true });
  }else{
    boot().catch(console.error);
  }
})();
