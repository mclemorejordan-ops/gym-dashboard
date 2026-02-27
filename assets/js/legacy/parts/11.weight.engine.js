/********************
     * 4f) Weight Engine + Chart Helpers (Step 8)
     ********************/
    const WeightEngine = {
      ensure(){
        state.logs = state.logs || { workouts: [], weight: [], protein: [] };
        state.logs.weight = state.logs.weight || [];
      },

      add(dateISO, weight){
        this.ensure();
        const d = String(dateISO || Dates.todayISO());
        const w = Number(weight);
        if(!Number.isFinite(w) || w <= 0) throw new Error("Enter a valid weight.");

        // Upsert by date (one entry per day)
        const idx = state.logs.weight.findIndex(x => x.dateISO === d);
        const entry = { id: uid("wt"), dateISO: d, weight: round2(w), createdAt: Date.now() };
        if(idx >= 0) state.logs.weight[idx] = { ...state.logs.weight[idx], ...entry };
        else state.logs.weight.push(entry);

        Storage.save(state);
        return entry;
      },

      remove(id){
        this.ensure();
        const idx = state.logs.weight.findIndex(x => x.id === id);
        if(idx >= 0){
          state.logs.weight.splice(idx, 1);
          Storage.save(state);
        }
      },

      listDesc(){
        this.ensure();
        const arr = [...state.logs.weight];
        arr.sort((a,b) => (b.dateISO || "").localeCompare(a.dateISO || "") || (b.createdAt||0)-(a.createdAt||0));
        return arr;
      },

      listAsc(){
        return this.listDesc().reverse();
      },

      latest(){
        const d = this.listDesc();
        return d[0] || null;
      },

      previous(){
        const d = this.listDesc();
        return d[1] || null;
      },

      delta(){
        const a = this.latest();
        const b = this.previous();
        if(!a || !b) return null;
        return round2((a.weight || 0) - (b.weight || 0));
      },

      avg7(dateISO){
        // 7-day window ending at dateISO (inclusive)
        this.ensure();
        const end = new Date(String(dateISO || Dates.todayISO()) + "T00:00:00");
        const start = new Date(end);
        start.setDate(start.getDate() - 6);

        const items = state.logs.weight.filter(x => {
          const d = new Date(x.dateISO + "T00:00:00");
          return d >= start && d <= end;
        });

        if(items.length === 0) return null;
        const avg = items.reduce((sum,x) => sum + (Number(x.weight)||0), 0) / items.length;
        return round2(avg);
      }
    };

    let __weightChart = null;

    function destroyWeightChart(){
      try{
        if(__weightChart){
          __weightChart.destroy();
          __weightChart = null;
        }
      }catch(e){
        __weightChart = null;
      }
    }

    function renderWeightChart(canvas, entriesAsc){
      destroyWeightChart();
      const labels = entriesAsc.map(e => e.dateISO);
      const data = entriesAsc.map(e => Number(e.weight) || 0);

      const ctx = canvas.getContext("2d");
      __weightChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Bodyweight",
            data,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true } },
          scales: { y: { beginAtZero: false } }
        }
      });

      return __weightChart;
    }
