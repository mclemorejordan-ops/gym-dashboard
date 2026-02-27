/* =========================================================
   core/guard.js — Runtime Guardrail + Debug Overlay
   Purpose:
   - Catch runtime errors early (instead of a blank screen)
   - Give the user a clear recovery path (reload / update / clear cache)
   - Keep this file dependency-free (must run before app.legacy.js)
   ========================================================= */
(function(){
  "use strict";

  const root = window;

  // Single global namespace (safe shared surface)
  const GymDash = root.GymDash = root.GymDash || {};
  GymDash.env = GymDash.env || {};
  GymDash.env.build = GymDash.env.build || {};

  // ---- Minimal crash overlay (only shown on fatal errors) ----
  function ensureOverlay(){
    let el = document.getElementById("__gdCrash");
    if(el) return el;

    el = document.createElement("div");
    el.id = "__gdCrash";
    el.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:999999",
      "background:rgba(8,10,14,.92)",
      "color:#fff",
      "padding:18px",
      "display:none",
      "overflow:auto",
      "font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
    ].join(";");

    el.innerHTML = [
      "<div style='max-width:760px;margin:0 auto'>",
      "<div style='font-weight:900;font-size:18px;letter-spacing:.2px'>Performance Coach hit an error</div>",
      "<div style='opacity:.78;margin-top:8px;line-height:1.45'>",
      "This is a safety screen so the app doesn’t silently break.",
      "</div>",
      "<div id='__gdCrashMsg' style='margin-top:14px;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12.5px;opacity:.92'></div>",
      "<div style='margin-top:14px;display:flex;gap:10px;flex-wrap:wrap'>",
      "<button id='__gdReload' style='border:0;border-radius:12px;padding:10px 12px;font-weight:800;cursor:pointer'>Reload</button>",
      "<button id='__gdHardReload' style='border:0;border-radius:12px;padding:10px 12px;font-weight:800;cursor:pointer'>Hard reload (clear SW)</button>",
      "</div>",
      "<div style='opacity:.72;margin-top:12px;font-size:12.5px;line-height:1.45'>",
      "Tip: If you recently updated, use <b>Hard reload</b> to remove old cached files.",
      "</div>",
      "</div>"
    ].join("");

    document.documentElement.appendChild(el);

    // Button wiring
    el.querySelector("#__gdReload").addEventListener("click", () => {
      try{ location.reload(); }catch(_){ }
    });

    el.querySelector("#__gdHardReload").addEventListener("click", async () => {
      try{
        // Unregister SW + clear caches (best effort)
        if("serviceWorker" in navigator){
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if("caches" in window){
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      }catch(_){}
      try{ location.reload(); }catch(_){ }
    });

    return el;
  }

  function showCrash(msg){
    try{
      const overlay = ensureOverlay();
      const box = overlay.querySelector("#__gdCrashMsg");
      box.textContent = String(msg || "Unknown error");
      overlay.style.display = "block";
    }catch(_){}
  }

  // Don't spam: show only first fatal error overlay.
  let shown = false;
  function maybeShow(errLike){
    if(shown) return;
    shown = true;
    const msg = (errLike && errLike.stack) ? errLike.stack : String(errLike || "");
    showCrash(msg);
  }

  root.addEventListener("error", (e) => {
    try{
      const err = e?.error || new Error(e?.message || "Uncaught error");
      maybeShow(err);
    }catch(_){}
  });

  root.addEventListener("unhandledrejection", (e) => {
    try{
      const reason = e?.reason || "Unhandled promise rejection";
      maybeShow(reason);
    }catch(_){}
  });

})();
