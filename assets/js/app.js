/* =========================================================
   Gym Dashboard — Single Script Tag Stub
   - Keep index.html stable (always points at /assets/js/app.js)
   - This file delegates to /assets/js/app.entry.js
   ========================================================= */

(function(){
  "use strict";

  // If entry already loaded, do nothing
  if(window.GymDash && window.GymDash.loaded && window.GymDash.loaded.__entryLoaded) return;
  window.GymDash = window.GymDash || {};
  window.GymDash.loaded = window.GymDash.loaded || {};
  window.GymDash.loaded.__entryLoaded = true;

  const s = document.createElement('script');
  s.src = './assets/js/app.entry.js';
  s.defer = true;
  s.onload = function(){};
  s.onerror = function(){ console.error('Failed to load app.entry.js'); };
  document.head.appendChild(s);
})();
