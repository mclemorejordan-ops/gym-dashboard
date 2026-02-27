/********************
     * Settings helpers (added)
     ********************/
    function bytesToNice(bytes){
      const n = Number(bytes || 0);
      if(!isFinite(n) || n <= 0) return "0 B";
      const units = ["B","KB","MB","GB","TB"];
      let v = n;
      let i = 0;
      while(v >= 1024 && i < units.length-1){
        v /= 1024;
        i++;
      }
      const dp = (i === 0) ? 0 : (v >= 10 ? 1 : 2);
      return `${v.toFixed(dp)} ${units[i]}`;
    }

    function appStorageBytes(){
      // Approximate localStorage usage for this origin
      let total = 0;
      try{
        for(let i=0; i<localStorage.length; i++){
          const k = localStorage.key(i);
          const v = localStorage.getItem(k) || "";
          total += (k ? k.length : 0) + v.length;
        }
      }catch(e){
        // If storage is blocked, just report 0
        total = 0;
      }
      // JS strings are ~2 bytes/char in UTF-16
      return total * 2;
    }

    function confirmModal({ title="Confirm", message="Are you sure?", confirmText="Confirm", danger=false, onConfirm }){
      const btnClass = danger ? "btn danger" : "btn primary";
      Modal.open({
        title,
        bodyNode: el("div", {}, [
          el("div", { class:"note", text: message }),
          el("div", { style:"height:12px" }),
          el("div", { class:"btnrow" }, [
            el("button", { class:"btn", onClick: Modal.close }, ["Cancel"]),
            el("button", {
              class: btnClass,
              onClick: () => {
                try{ if(typeof onConfirm === "function") onConfirm(); }
                finally{ Modal.close(); }
              }
            }, [confirmText])
          ])
        ])
      });
    }

    function getTodayWorkout(){
    const routine = Routines.getActive();
    if(!routine || !(routine.days?.length)) return { routine: null, day: null, dayIndex: null };
  
    const weekStartsOn = normalizedWeekStartsOn();
    const today = new Date();
    const jsDow = today.getDay(); // 0=Sun..6=Sat
    const idx = routineIndexFromJsDow(jsDow, weekStartsOn);
  
    // Our routine days are stored order 0..6 where 0 == user's week start
    const day = routine.days.find(d => d.order === idx) || routine.days[idx] || null;
    return { routine, day, dayIndex: idx };
  }

    function isTrained(dateISO){
      return (state.attendance || []).includes(dateISO);
    }

    function toggleTrained(dateISO){
      state.attendance = state.attendance || [];
      const i = state.attendance.indexOf(dateISO);
      if(i >= 0) state.attendance.splice(i, 1);
      else state.attendance.push(dateISO);
      Storage.save(state);
    }
