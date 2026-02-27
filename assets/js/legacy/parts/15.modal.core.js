/********************
     * 5) Modal
     ********************/
      let __modalScrollY = 0;

function lockBodyScroll(){
  __modalScrollY = window.scrollY || 0;

  // iOS-safe lock: freeze body position
  document.body.classList.add("modalOpen");
  document.body.style.position = "fixed";
  document.body.style.top = `-${__modalScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockBodyScroll(){
  document.body.classList.remove("modalOpen");

  // restore body scrolling
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  window.scrollTo(0, __modalScrollY);
}

// ─────────────────────────────
// Modal (production hardening)
// - Focus is moved into the modal when opened
// - Tab/Shift+Tab are trapped inside the modal
// - Focus is restored to the triggering element when closed
// ─────────────────────────────
let __modalLastFocus = null;
let __modalKeydownHandler = null;

function __getModalFocusables(sheet){
  if(!sheet) return [];
  const nodes = sheet.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter(el => {
    // visible + enabled
    const style = window.getComputedStyle(el);
    if(style.visibility === "hidden" || style.display === "none") return false;
    if(el.hasAttribute("disabled")) return false;
    return true;
  });
}

const Modal = {
  open({ title, bodyNode, center = true, size = "md" }){
    const host  = $("#modalHost");
    const body  = $("#modalBody");
    const sheet = host.querySelector(".sheet");

    // Remember last focused element (so we can restore on close)
    __modalLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    $("#modalTitle").textContent = title || "Modal";

    // Position mode
    host.classList.toggle("center", !!center);

    // Size mode
    if(sheet){
      sheet.classList.remove("sm", "md", "lg");
      sheet.classList.add(size);
    }

    body.innerHTML = "";
    if(bodyNode) body.appendChild(bodyNode);

    host.classList.add("show");
    host.setAttribute("aria-hidden", "false");

    lockBodyScroll();

    // Focus management: move focus into modal (prefer Close button)
    const closeBtn = $("#modalClose");
    const focusablesNow = __getModalFocusables(sheet);
    const first = closeBtn || focusablesNow[0] || sheet;

    // Ensure sheet is focusable if nothing else is
    if(sheet && !sheet.hasAttribute("tabindex")) sheet.setAttribute("tabindex", "-1");

    // Use next tick so DOM is fully ready
    setTimeout(() => {
      try { first && first.focus && first.focus(); } catch(e){}
    }, 0);

    // Trap Tab navigation inside modal
    __modalKeydownHandler = (e) => {
      if(!host.classList.contains("show")) return;

      // ESC should still work via your existing listeners, but keep safe here too
      if(e.key === "Escape"){
        e.preventDefault();
        Modal.close();
        return;
      }

      if(e.key !== "Tab") return;

      const focusables = __getModalFocusables(sheet);
      if(focusables.length === 0){
        e.preventDefault();
        sheet && sheet.focus && sheet.focus();
        return;
      }

      const active = document.activeElement;
      const firstEl = focusables[0];
      const lastEl  = focusables[focusables.length - 1];

      // Shift+Tab on first -> wrap to last
      if(e.shiftKey && active === firstEl){
        e.preventDefault();
        lastEl.focus();
        return;
      }

      // Tab on last -> wrap to first
      if(!e.shiftKey && active === lastEl){
        e.preventDefault();
        firstEl.focus();
        return;
      }
    };

    document.addEventListener("keydown", __modalKeydownHandler, true);
  },

  close(){
    const host  = $("#modalHost");
    const sheet = host.querySelector(".sheet");

    host.classList.remove("show");
    host.classList.remove("center");
    host.setAttribute("aria-hidden", "true");

    $("#modalBody").innerHTML = "";

    // Reset size classes
    if(sheet){
      sheet.classList.remove("sm", "md", "lg");
    }

    unlockBodyScroll();

    // Remove keydown trap
    if(__modalKeydownHandler){
      document.removeEventListener("keydown", __modalKeydownHandler, true);
      __modalKeydownHandler = null;
    }

    // Restore focus back to what opened the modal (if still in DOM)
    if(__modalLastFocus && document.contains(__modalLastFocus)){
      try { __modalLastFocus.focus(); } catch(e){}
    }
    __modalLastFocus = null;
  }
};
    (function bindModalControls(){
  const closeBtn = $("#modalClose");
  const backdrop = $("#modalBackdrop");

  if(closeBtn){
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      Modal.close();
    });
  }

  if(backdrop){
    backdrop.addEventListener("click", (e) => {
      e.preventDefault();
      Modal.close();
    });
  }

  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      const host = $("#modalHost");
      if(host && host.classList.contains("show")){
        Modal.close();
      }
    }
  });
})();
