/* =========================================================
   legacy/app.legacy.js (shim)
   This file is intentionally minimal.

   The legacy monolith has been split into ordered parts under:
     assets/js/legacy/parts/

   Boot is now driven by assets/js/app.entry.js which loads parts
   in deterministic order.

   Keeping this file prevents old caches / references from breaking.
   ========================================================= */
window.GymDash = window.GymDash || {};
window.GymDash.env = window.GymDash.env || {};
window.GymDash.env.legacySplit = true;
