// Onboarding page (isolated)
Views.Onboarding = function(){
        let hideRestDays = true;
        let selectedTpl = "ppl";

        const errorBox = el("div", { class:"note", style:"display:none; color: rgba(255,92,122,.95);" });

        const switchNode = el("div", { class:"switch on" });
        switchNode.addEventListener("click", () => {
          hideRestDays = !hideRestDays;
          switchNode.classList.toggle("on", hideRestDays);
        });

        const tplCardsHost = el("div", { class:"tplGrid" });
        const renderTplCards = () => {
          tplCardsHost.innerHTML = "";
          RoutineTemplates.forEach(t => {
            tplCardsHost.appendChild(el("div", {
              class: "tpl" + (t.key === selectedTpl ? " selected" : ""),
              onClick: () => { selectedTpl = t.key; renderTplCards(); }
            }, [
              el("div", { class:"name", text: t.name }),
              el("div", { class:"desc", text: t.desc })
            ]));
          });
        };
        renderTplCards();

        const nameInput = el("input", { type:"text", placeholder:"Jordan" });
        const proteinInput = el("input", { type:"number", inputmode:"numeric", placeholder:"180", min:"0" });

        const weekSelect = el("select", {});
        weekSelect.appendChild(el("option", { value:"mon", text:"Monday" }));
        weekSelect.appendChild(el("option", { value:"sun", text:"Sunday" }));
        weekSelect.value = "mon";

        const finish = () => {
          errorBox.style.display = "none";
          errorBox.textContent = "";

          const cleanName = (nameInput.value || "").trim();
          const cleanProtein = Number(proteinInput.value);
          const weekStartsOn = weekSelect.value === "sun" ? "sun" : "mon";

          if(!cleanName){
            errorBox.textContent = "Please enter your name.";
            errorBox.style.display = "block";
            return;
          }
          if(!Number.isFinite(cleanProtein) || cleanProtein <= 0){
            errorBox.textContent = "Please enter a valid daily protein goal (grams).";
            errorBox.style.display = "block";
            return;
          }

          const profile = {
          name: cleanName,
          proteinGoal: Math.round(cleanProtein),
          weekStartsOn,
          hideRestDays: !!hideRestDays,
        
          // ✅ NEW: 3D Preview default (ON)
          show3DPreview: true
        };


          // Seed library FIRST so template exercises can resolve to real exerciseIds
          ExerciseLibrary.ensureSeeded();

          const routineName = RoutineTemplates.find(t => t.key === selectedTpl)?.name || "Routine";
          const routine = createRoutineFromTemplate(selectedTpl, routineName);

          state.profile = profile;
          state.routines = [routine];
          state.activeRoutineId = routine.id;

          // Repair any missing links (older data / edge cases)
          repairExerciseLinks();


          Storage.save(state);
          navigate("home");
          bindHeaderPills();
          setHeaderPills();
          checkForUpdates();

        };

        return el("div", { class:"grid" }, [
          el("div", { class:"card" }, [
            el("h2", { text:"Welcome" }),
            el("div", { class:"kpi" }, [
              el("div", { class:"big", text:"Let’s set up your dashboard" }),
              el("div", { class:"small", text:"Create your profile and choose a routine template. You can edit everything later." })
            ])
          ]),
          el("div", { class:"card" }, [
            el("h2", { text:"Create profile" }),
            el("div", { class:"form" }, [
              el("div", { class:"row2" }, [
                el("label", {}, [ el("span", { text:"Name" }), nameInput ]),
                el("label", {}, [ el("span", { text:"Protein goal (grams/day)" }), proteinInput ])
              ]),
              el("div", { class:"row2" }, [
                el("label", {}, [ el("span", { text:"Week starts on" }), weekSelect ]),
                el("div", { class:"toggle" }, [
                  el("div", { class:"ttext" }, [
                    el("div", { class:"a", text:"Hide rest days" }),
                    el("div", { class:"b", text:"Rest days won’t appear on Home (Routine can still show them later)" })
                  ]),
                  switchNode
                ])
              ]),
              errorBox
            ])
          ]),
          el("div", { class:"card" }, [
            el("h2", { text:"Choose a routine template" }),
            tplCardsHost,
            el("div", { style:"height:10px" }),
            el("div", { class:"btnrow" }, [
              el("button", { class:"btn primary", onClick: finish }, ["Finish setup"]),
              el("button", {
                class:"btn danger",
                onClick: () => {
                  Modal.open({
                    title: "Reset local data",
                    bodyNode: el("div", {}, [
                      el("div", { class:"note", text:"This clears everything saved in this browser for the app." }),
                      el("div", { style:"height:12px" }),
                      el("div", { class:"btnrow" }, [
                        el("button", {
                          class:"btn danger",
                          onClick: () => {
                            try{ BackupVault.forceSnapshot(state, "pre-reset"); }catch(_){ }
                            Storage.reset();
                            state = Storage.load();
                            Modal.close();
                            navigate("home");
                          }
                        }, ["Reset"]),
                        el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
                      ])
                    ])
                  });
                }
              }, ["Reset"])
            ])
          ])
        ]);
      
};
