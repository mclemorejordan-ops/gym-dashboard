/********************
     * 2) Helpers
     ********************/
    const $ = (sel, root=document) => root.querySelector(sel);

    const el = (tag, attrs={}, children=[]) => {
      const n = document.createElement(tag);
      for (const [k,v] of Object.entries(attrs)){
        if(k === "class") n.className = v;
        else if(k === "text") n.textContent = v;
        else if(k === "html") n.innerHTML = v;
        else if(k.startsWith("on") && typeof v === "function"){
          n.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          n.setAttribute(k, v);
        }
      }
      children.forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
      return n;
    };

    const uid = (prefix="id") => `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

        const pad2 = (n) => String(n).padStart(2, "0");

const Dates = {
  // strict YYYY-MM-DD check
  isISO(dateISO){
    return typeof dateISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateISO);
  },

  // returns a Date at local midnight, or null if invalid
  parseISO(dateISO){
    if(!this.isISO(dateISO)) return null;
    const d = new Date(dateISO + "T00:00:00");
    return Number.isFinite(d.getTime()) ? d : null;
  },

  todayISO(){
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  },

  // weekStartsOn: "mon" | "sun"
  startOfWeekISO(dateISO, weekStartsOn){
    // ✅ guard: if we ever get garbage, fall back to today (prevents NaN/Invalid Date cascades)
    const baseISO = this.isISO(dateISO) ? dateISO : this.todayISO();
    const d = new Date(baseISO + "T00:00:00");

    const dow = d.getDay(); // 0=Sun..6=Sat
    const weekStart = (weekStartsOn === "sun") ? 0 : 1;

    let diff = dow - weekStart;
    if(diff < 0) diff += 7;

    d.setDate(d.getDate() - diff);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  },

  addDaysISO(dateISO, days){
    const baseISO = this.isISO(dateISO) ? dateISO : this.todayISO();
    const d = new Date(baseISO + "T00:00:00");
    d.setDate(d.getDate() + (Number(days) || 0));
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  },

  // Day difference between 2 ISO dates (b - a), ignoring time/DST.
  // Example: diffDaysISO(weekStartISO, todayISO) => 0..6
  diffDaysISO(aISO, bISO){
    const a = this.isISO(aISO) ? aISO : this.todayISO();
    const b = this.isISO(bISO) ? bISO : this.todayISO();

    const toUTC = (iso) => {
      const [y,m,d] = String(iso).split("-").map(n => Number(n));
      return Date.UTC(y, (m||1)-1, d||1);
    };

    const ms = toUTC(b) - toUTC(a);
    return Math.round(ms / 86400000);
  },

  sameISO(a,b){ return String(a) === String(b); },

  // convenience: "Feb 15"
  formatShort(dateISO){
    const d = this.parseISO(dateISO);
    if(!d) return "—";
    return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
  }
};
