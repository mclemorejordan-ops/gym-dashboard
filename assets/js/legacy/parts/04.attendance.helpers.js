/********************
     * Attendance Helpers (Step 9)
     ********************/
    function ymFromISO(dateISO){
      const [y,m] = String(dateISO).split("-").map(x => parseInt(x,10));
      return { y, m }; // m = 1..12
    }

    function monthTitle(y, m){
      const d = new Date(y, m-1, 1);
      return d.toLocaleString(undefined, { month:"long", year:"numeric" });
    }

    function daysInMonth(y, m){
      return new Date(y, m, 0).getDate(); // m is 1..12
    }

    function firstDayDow(y, m){
      return new Date(y, m-1, 1).getDay(); // 0=Sun..6=Sat
    }

    function isoForYMD(y, m, d){
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }

    const AttendanceEngine = {
      ensure(){
        state.attendance = state.attendance || [];
      },
      monthCount(y, m){
        this.ensure();
        const prefix = `${y}-${pad2(m)}-`;
        return state.attendance.filter(x => String(x).startsWith(prefix)).length;
      },
      clearMonth(y, m){
        this.ensure();
        const prefix = `${y}-${pad2(m)}-`;
        state.attendance = state.attendance.filter(x => !String(x).startsWith(prefix));
        Storage.save(state);
      }
    };

    const normName = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
