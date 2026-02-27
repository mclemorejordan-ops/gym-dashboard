/********************
 * 4g) Glass Dropdown (Popover) UI
 ********************/
let __pop = null;

// Tracks whether THIS popover session locked scroll (so we only unlock when appropriate)
let __popoverLockedScroll = false;

function PopoverEnsure(){
  if(__pop) return __pop;

  const host = el("div", { class:"popHost", id:"popHost" }, []);
  const backdrop = el("div", { class:"popBackdrop", id:"popBackdrop" }, []);
  const panel = el("div", { class:"popPanel", id:"popPanel" }, []);

  backdrop.addEventListener("click", PopoverClose);

  host.appendChild(backdrop);
  host.appendChild(panel);
  document.body.appendChild(host);

  __pop = { host, panel };
  return __pop;
}

function PopoverOpen(anchorEl, bodyNode){
  const { host, panel } = PopoverEnsure();

  panel.innerHTML = "";
  if(bodyNode) panel.appendChild(bodyNode);

  // Show first so we can compute panel size accurately
  host.classList.add("show");
  host.style.display = "block";

  // ✅ Lock background scroll while popover is open (uses your existing iOS-safe lock)
  // Only lock if nothing else already locked it.
  if(!document.body.classList.contains("modalOpen")){
    lockBodyScroll();
    __popoverLockedScroll = true;
  }else{
    __popoverLockedScroll = false;
  }

  // Position under anchor, keep within viewport
  const r = anchorEl.getBoundingClientRect();
  const pad = 12;

  const pw = panel.offsetWidth || Math.min(420, window.innerWidth - 24);

  // default: left aligned to anchor, clamped to viewport
  let left = r.left;
  left = Math.max(pad, Math.min(left, window.innerWidth - pw - pad));

  let top = r.bottom + 10;
  const ph = panel.offsetHeight || 320;

  // if it would go below, flip above anchor
  if(top + ph > window.innerHeight - pad){
    top = Math.max(pad, r.top - ph - 10);
  }

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top  = `${Math.round(top)}px`;
}

function PopoverClose(){
  const p = PopoverEnsure();
  p.host.classList.remove("show");
  p.host.style.display = "none";   // ✅ actually hide it
  p.panel.innerHTML = "";          // ✅ clear list so it doesn't linger

  // ✅ Restore background scroll ONLY if this popover was the thing that locked it
  if(__popoverLockedScroll){
    __popoverLockedScroll = false;

    // If a modal is open for any reason, don't unlock yet
    const modalHost = document.getElementById("modalHost");
    const modalIsOpen = !!(modalHost && modalHost.classList.contains("show"));

    if(!modalIsOpen){
      unlockBodyScroll();
    }
  }
}
