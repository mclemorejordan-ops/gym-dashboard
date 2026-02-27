/********************
     * 4e) Progress Helpers (Step 7)
     ********************/
    let __progressChart = null;

    function destroyProgressChart(){
      try{
        if(__progressChart){
          __progressChart.destroy();
          __progressChart = null;
        }
      }catch(e){
        __progressChart = null;
      }
    }

    function downloadCanvasPNG(canvas, filename){
      try{
        const url = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || "progress.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }catch(e){
        Modal.open({
          title: "Download failed",
          bodyNode: el("div", {}, [
            el("div", { class:"note", text:"Could not export image. Try again or use a different browser." }),
            el("div", { style:"height:12px" }),
            el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
          ])
        });
      }
    }

    function buildSeries(type, entries){
      // entries expected ascending by date
      const labels = entries.map(e => e.dateISO);

      if(type === "weightlifting"){
        const topWeight = entries.map(e => Number(e.summary?.bestWeight) || 0);
        const est1RM = entries.map(e => Number(e.summary?.best1RM) || 0);
        const volume = entries.map(e => Number(e.summary?.totalVolume) || 0);
        return { labels, datasets: { topWeight, est1RM, volume } };
      }

      if(type === "cardio"){
        const pace = entries.map(e => (e.summary?.paceSecPerUnit == null ? null : Number(e.summary.paceSecPerUnit)));
        const distance = entries.map(e => Number(e.summary?.distance) || 0);
        const timeSec = entries.map(e => Number(e.summary?.timeSec) || 0);
        return { labels, datasets: { pace, distance, timeSec } };
      }

      // core
      const volume = entries.map(e => Number(e.summary?.totalVolume) || 0);
      return { labels, datasets: { volume } };
    }

    function renderProgressChart(canvas, type, metricKey, series){
      destroyProgressChart();

      // Build chart dataset (no custom colors per your standards — Chart.js defaults)
      let data = [];
      let label = "";

      if(type === "weightlifting"){
        if(metricKey === "topWeight"){ data = series.datasets.topWeight; label = "Top Weight"; }
        else if(metricKey === "est1RM"){ data = series.datasets.est1RM; label = "Estimated 1RM (Epley)"; }
        else { data = series.datasets.volume; label = "Volume"; }
      } else if(type === "cardio"){
        if(metricKey === "pace"){ data = series.datasets.pace; label = "Pace (sec/unit) (lower is better)"; }
        else if(metricKey === "distance"){ data = series.datasets.distance; label = "Distance"; }
        else { data = series.datasets.timeSec; label = "Time (sec)"; }
      } else {
        data = series.datasets.volume;
        label = "Core Volume";
      }

      const ctx = canvas.getContext("2d");
      __progressChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: series.labels,
          datasets: [{
            label,
            data,
            tension: 0.25,
            spanGaps: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });

      return __progressChart;
    }
