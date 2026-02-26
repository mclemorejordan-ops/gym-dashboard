// Settings page (isolated)
Views.Settings = function(){
        // Persist across renders (not saved to Storage)
const ui = UIState.settings || (UIState.settings = {});

// ✅ ensure accordion state exists so taps don’t crash
if(!ui.open || typeof ui.open !== "object") ui.open = {};

// ✅ default: open Profile the first time Settings is visited
if(Object.keys(ui.open).length === 0) ui.open.profile = true;

        const normalize = (s) => (s||"").toString().trim().toLowerCase();

        // Accordion builder
        const makeSection = ({ key, title, subtitle, keywords, bodyNode }) => {
          const q = normalize(ui.q);
          const hay = normalize([title, subtitle, ...(keywords||[])].join(" "));
          const match = !q || hay.includes(q);

          // Auto-open if searching and matched
          const isOpen = !!ui.open?.[key] || (q && match);

          const item = el("div", { class:"accItem", style: match ? "" : "display:none;" });

          const head = el("div", {
            class:"accHead",
          onClick: () => {
  ui.open = ui.open || {};
  ui.open[key] = !ui.open[key];
  renderView();
}
          }, [
            el("div", {}, [
              el("div", { class:"accTitle", text: title }),
              el("div", { class:"accSub", text: subtitle })
            ]),
            el("div", { class:"accCaret", text: isOpen ? "−" : "+" })
          ]);

          const body = el("div", { class:"accBody", style: isOpen ? "" : "display:none;" }, [ bodyNode ]);

          item.appendChild(head);
          item.appendChild(body);
          return item;
        };

        // --- Profile controls ---
        const nameInput = el("input", { type:"text", value: state.profile?.name || "" });
        const proteinInput = el("input", { type:"number", min:"0", step:"1", value: state.profile?.proteinGoal || 150 });

               const weekSelect = el("select", {});
        weekSelect.appendChild(el("option", { value:"sun", text:"Sunday" }));
        weekSelect.appendChild(el("option", { value:"mon", text:"Monday" }));

        // Backward compatible: accept older numeric values (0/1) if they exist
        const ws = state.profile?.weekStartsOn;
        const normalized =
          (ws === 0 || ws === "0" || ws === "sun") ? "sun" :
          (ws === 1 || ws === "1" || ws === "mon") ? "mon" :
          "mon";
        weekSelect.value = normalized;


        let hideRestDays = !!state.profile?.hideRestDays;
        let show3DPreview = (state.profile?.show3DPreview !== false); // default ON

const hideRestSwitch = el("div", {
  class: "switch" + (hideRestDays ? " on" : ""),
  onClick: () => {
    hideRestDays = !hideRestDays;
    hideRestSwitch.classList.toggle("on", hideRestDays);
  }
});
           // ✅ NEW: 3D Preview switch (persisted)
const show3DSwitch = el("div", {
  class: "switch" + (show3DPreview ? " on" : ""),
  onClick: () => {
    show3DPreview = !show3DPreview;
    show3DSwitch.classList.toggle("on", show3DPreview);
  }
});



        function saveProfile(){
          state.profile = state.profile || {};
          state.profile.name = (nameInput.value || "").trim();
          state.profile.proteinGoal = Math.max(0, Number(proteinInput.value || 0));
          state.profile.weekStartsOn = (weekSelect.value === "sun") ? "sun" : "mon";
          state.profile.hideRestDays = !!hideRestDays;
          state.profile.show3DPreview = !!show3DPreview;
          Storage.save(state);
          showToast("Saved");
          renderView();
        }

        // --- Existing import/export helpers (reuse your current functions) ---
        function openImportPasteModal(){
          const ta = el("textarea", {
            style:"width:100%; min-height: 260px; border-radius: 14px; padding: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: rgba(255,255,255,.92); font-size: 12px; outline:none; resize: vertical;",
            placeholder:"Paste your backup JSON here…"
          });

          const err = el("div", { class:"note", style:"display:none; color: rgba(255,92,122,.95);" });

          Modal.open({
            title: "Import from paste",
            bodyNode: el("div", {}, [
              el("div", { class:"note", text:"This will overwrite your current data in this browser." }),
              el("div", { style:"height:10px" }),
              ta,
              err,
              el("div", { style:"height:12px" }),
              el("div", { class:"btnrow" }, [
                el("button", {
                  class:"btn danger",
                  onClick: () => {
                    err.style.display = "none";
                    try{
                      importBackupJSON(ta.value || "");
                      Modal.close();
                      navigate("home");
                    }catch(e){
                      err.textContent = e.message || "Import failed.";
                      err.style.display = "block";
                    }
                  }
                }, ["Import (overwrite)"]),
                el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
              ])
            ])
          });
        }

        function openImportFileModal(){
          const input = el("input", { type:"file", accept:"application/json,.json" });
          const err = el("div", { class:"note", style:"display:none; color: rgba(255,92,122,.95);" });

          Modal.open({
            title: "Import from file",
            bodyNode: el("div", {}, [
              el("div", { class:"note", text:"Choose a .json backup file. Import overwrites current data." }),
              el("div", { style:"height:10px" }),
              input,
              err,
              el("div", { style:"height:12px" }),
              el("div", { class:"btnrow" }, [
                el("button", {
                  class:"btn danger",
                  onClick: async () => {
                    err.style.display = "none";
                    try{
                      const f = input.files?.[0];
                      if(!f) throw new Error("Select a JSON file first.");
                      const txt = await f.text();
                      importBackupJSON(txt);
                      Modal.close();
                      navigate("home");
                    }catch(e){
                      err.textContent = e.message || "Import failed.";
                      err.style.display = "block";
                    }
                  }
                }, ["Import (overwrite)"]),
                el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
              ])
            ])
          });
        }

        // --- Section bodies ---
        const profileBody = el("div", {}, [
          el("div", { class:"setRow" }, [
            el("div", {}, [
              el("div", { style:"font-weight:820;", text:"Name" }),
              el("div", { class:"meta", text:"Shown on Home" })
            ]),
            nameInput
          ]),
          el("div", { class:"setRow" }, [
            el("div", {}, [
              el("div", { style:"font-weight:820;", text:"Daily protein goal" }),
              el("div", { class:"meta", text:"grams/day" })
            ]),
            proteinInput
          ]),
          el("div", { class:"setRow" }, [
            el("div", {}, [
              el("div", { style:"font-weight:820;", text:"Week starts on" }),
              el("div", { class:"meta", text:"Affects Home week view" })
            ]),
            weekSelect
          ]),
          el("div", { class:"setRow" }, [
            el("div", {}, [
              el("div", { style:"font-weight:820;", text:"Hide rest days" }),
              el("div", { class:"meta", text:"Keep Home focused on training days" })
            ]),
            hideRestSwitch
          ]),
          el("div", { class:"setRow" }, [
  el("div", {}, [
    el("div", { style:"font-weight:820;", text:"3D Preview" }),
    el("div", { class:"meta", text:"Show/hide the 3D routine card preview on the Routine page" })
  ]),
  show3DSwitch
]),
          el("div", { style:"height:12px" }),
          el("div", { class:"btnrow" }, [
            el("button", { class:"btn primary", onClick: () => {
              try{ saveProfile(); }
              catch(e){
                Modal.open({
                  title:"Save failed",
                  bodyNode: el("div", {}, [
                    el("div", { class:"note", text: e?.message || "Could not save settings." }),
                    el("div", { style:"height:12px" }),
                    el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
                  ])
                });
              }
            }}, ["Save changes"])
          ])
        ]);

                // ────────────────────────────
        // Routines section (Recovery + Management)
        // ────────────────────────────
        function openCreateRoutineModal(afterCreateRoute=null){
          const body = el("div", {}, [
            el("div", { class:"note", text:"Pick a template to create a routine. This will set it as your active routine." }),
            el("div", { style:"height:12px" })
          ]);

          const list = el("div", { style:"display:grid; gap:10px;" });

          (RoutineTemplates || []).forEach(tpl => {
            list.appendChild(el("div", {
              class:"setLink",
              onClick: () => {
                try{
                  const r = Routines.addFromTemplate(tpl.key, tpl.name);
                  Modal.close();
                  showToast(`Created: ${r.name}`);
                  if(afterCreateRoute) navigate(afterCreateRoute);
                  else renderView();
                }catch(e){
                  Modal.open({
                    title:"Could not create routine",
                    bodyNode: el("div", {}, [
                      el("div", { class:"note", text: e?.message || "Something went wrong while creating a routine." }),
                      el("div", { style:"height:12px" }),
                      el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
                    ])
                  });
                }
              }
            }, [
              el("div", { class:"l" }, [
                el("div", { class:"a", text: tpl.name }),
                el("div", { class:"b", text: tpl.desc || "Template" })
              ]),
              el("div", { style:"opacity:.85", text:"+" })
            ]));
          });

          body.appendChild(list);

          body.appendChild(el("div", { style:"height:14px" }));
          body.appendChild(el("div", { class:"btnrow" }, [
            el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
          ]));

          Modal.open({
            title:"Create routine",
            center:true,
            bodyNode: body
          });
        }

        function openRenameRoutineModal(routine){
          const input = el("input", { type:"text", value: routine?.name || "" });

          Modal.open({
            title:"Rename routine",
            bodyNode: el("div", {}, [
              el("div", { class:"note", text:"Update the routine name." }),
              el("div", { style:"height:10px" }),
              input,
              el("div", { style:"height:12px" }),
              el("div", { class:"btnrow" }, [
                el("button", {
                  class:"btn primary",
                  onClick: () => {
                    try{
                      Routines.rename(routine.id, input.value || "");
                      Modal.close();
                      showToast("Renamed");
                      renderView();
                    }catch(e){
                      showToast(e?.message || "Rename failed");
                    }
                  }
                }, ["Save"]),
                el("button", { class:"btn", onClick: Modal.close }, ["Cancel"])
              ])
            ])
          });
        }

        const routinesBody = el("div", {}, [
          el("div", { class:"note", text:"Manage routines here. If you accidentally deleted everything, create a new routine below." }),
          el("div", { style:"height:10px" }),

          el("div", { class:"btnrow" }, [
            el("button", { class:"btn primary", onClick: () => openCreateRoutineModal("routine") }, ["+ Create routine"]),
            el("button", { class:"btn", onClick: () => navigate("routine") }, ["Open Routine"]),
            el("button", { class:"btn", onClick: () => navigate("routine_editor") }, ["Routine Editor"])
          ]),

          el("div", { style:"height:12px" }),

          (() => {
            const all = Routines.getAll() || [];
            const activeId = state.activeRoutineId || null;

            if(all.length === 0){
              return el("div", { class:"note", text:"No routines found. Tap “Create routine” to get started." });
            }

            const list = el("div", { style:"display:grid; gap:10px;" });

            all.forEach(r => {
              const isActive = (r.id === activeId);
              const meta = isActive ? "Active" : "Saved";

              list.appendChild(el("div", { class:"setRow" }, [
                el("div", {}, [
                  el("div", { style:"font-weight:850;", text: r.name || "Routine" }),
                  el("div", { class:"meta", text: meta })
                ]),
                el("div", { class:"btnrow", style:"justify-content:flex-end; flex-wrap:wrap;" }, [

                  el("button", {
                    class:"btn" + (isActive ? " primary" : ""),
                    onClick: () => {
                      try{
                        Routines.setActive(r.id);
                        showToast("Active routine set");
                        renderView();
                      }catch(e){
                        showToast(e?.message || "Could not set active");
                      }
                    }
                  }, [isActive ? "Active" : "Set active"]),

                  el("button", {
                    class:"btn",
                    onClick: () => openRenameRoutineModal(r)
                  }, ["Rename"]),

                  el("button", {
                    class:"btn",
                    onClick: () => {
                      try{
                        Routines.duplicate(r.id);
                        showToast("Routine duplicated");
                        renderView();
                      }catch(e){
                        showToast(e?.message || "Duplicate failed");
                      }
                    }
                  }, ["Duplicate"]),

                  el("button", {
                    class:"btn danger",
                    onClick: () => {
                      confirmModal({
                        title:"Delete routine",
                        note:`Delete “${r.name || "Routine"}”? This cannot be undone.\n\nTip: Auto Backups can restore if needed.`,
                        confirmText:"Delete",
                        danger:true,
                        onConfirm: () => {
                          try{
                            Routines.remove(r.id);
                            showToast("Routine deleted");
                            renderView();
                          }catch(e){
                            showToast(e?.message || "Delete failed");
                          }
                        }
                      });
                    }
                  }, ["Delete"])
                ])
              ]));
            });

            return list;
          })()
        ]);
           
        const libraryBody = el("div", {}, [
          el("div", { class:"setLink", onClick: () => navigate("exercise_library") }, [
            el("div", { class:"l" }, [
              el("div", { class:"a", text:"Open Exercise Library Manager" }),
              el("div", { class:"b", text:"Add, edit, and delete exercises" })
            ]),
            el("div", { style:"opacity:.8", text:"→" })
          ]),
          el("div", { style:"height:10px" }),
          el("div", { class:"note", text:"Tip: Exercises removed from the library will still display in old logs using the saved name snapshot." })
        ]);

        const backupBody = el("div", {}, [
          el("div", { class:"note", text:"Export your full app data as JSON. Import will overwrite your current data in this browser." }),

          // ───────────────
          // Export reminder
          // ───────────────
          el("div", { style:"height:10px" }),
          (() => {
            const last = (typeof getLastExportAt === "function") ? getLastExportAt() : 0;
            const never = !last || !Number.isFinite(last);
            const label = never
              ? "Last file backup: Never exported"
              : `Last file backup: ${new Date(last).toLocaleString()}`;
            const sub = never
              ? "Recommendation: export a file backup occasionally (helps if iOS clears storage / app is deleted)."
              : "Tip: auto backups protect against mistakes/bugs; file backups protect against phone/browser storage being wiped.";
            return el("div", { class:"note", text: `${label}\n${sub}` });
          })(),

          el("div", { style:"height:10px" }),

          // ───────────────
          // Export
          // ───────────────
          el("div", { class:"btnrow" }, [
            el("button", {
              class:"btn primary",
              onClick: () => {
                try{
                  const txt = exportBackupJSON();
                  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
                  downloadTextFile(`gym-dashboard-backup_${stamp}.json`, txt);

                  // ✅ track export for reminder UI (best-effort)
                  try{ if(typeof setLastExportAt === "function") setLastExportAt(Date.now()); }catch(_){}
                  showToast("Backup exported");
                }catch(e){
                  Modal.open({
                    title:"Export failed",
                    bodyNode: el("div", {}, [
                      el("div", { class:"note", text: e.message || "Could not export backup." }),
                      el("div", { style:"height:12px" }),
                      el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
                    ])
                  });
                }
              }
            }, ["Export JSON backup"]),

            el("button", {
              class:"btn",
              onClick: () => {
                Modal.open({
                  title: "Copy backup JSON",
                  bodyNode: el("div", {}, [
                    el("div", { class:"note", text:"Copy/paste this JSON anywhere safe." }),
                    el("div", { style:"height:10px" }),
                    el("textarea", {
                      style:"width:100%; min-height: 260px; border-radius: 14px; padding: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: rgba(255,255,255,.92); font-size: 12px; outline:none; resize: vertical;",
                    }, [exportBackupJSON()]),
                    el("div", { style:"height:12px" }),
                    el("button", { class:"btn primary", onClick: Modal.close }, ["Done"])
                  ])
                });
              }
            }, ["View JSON"])
          ]),

// ───────────────
// Auto backups (rolling snapshots)
// ───────────────
el("div", { style:"height:14px" }),
el("div", {
  class:"note",
  text:"Auto backups (recommended): the app keeps rolling snapshots so you can restore if something breaks."
}),
el("div", { style:"height:8px" }),

el("div", { class:"btnrow" }, [

  // Restore from Auto Backup
  el("button", {
    class:"btn",
    onClick: async () => {
      try{
        if(typeof BackupVault === "undefined" || !BackupVault.list){
          Modal.open({
            title:"Auto backups unavailable",
            bodyNode: el("div", {}, [
              el("div", { class:"note", text:"Auto backups are not enabled in this build." }),
              el("div", { style:"height:12px" }),
              el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
            ])
          });
          return;
        }

        const snapsRaw = await BackupVault.list(BackupVault.KEEP || 20);

        // Safety-net: remove duplicates (same createdAt)
        const seen = new Set();
        const snaps = (snapsRaw || []).filter(s => {
          const key = String(s?.createdAt ?? "");
          if(seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const container = el("div", {
          style:"max-height:70vh; overflow-y:auto; padding-right:6px;"
        });

        // Sticky Banner (always visible)
        container.appendChild(
          el("div", {
            style:[
              "position:sticky",
              "top:0",
              "z-index:5",
              "padding:10px 0",
              "background:rgba(20,20,30,.65)",
              "backdrop-filter:blur(8px)",
              "-webkit-backdrop-filter:blur(8px)",
              "border-bottom:1px solid rgba(255,255,255,.08)"
            ].join(";")
          }, [
            el("div", { style:"display:flex; align-items:center; gap:8px;" }, [
              el("div", { style:"width:8px;height:8px;border-radius:50%;background:#4CAF50;" }),
              el("div", { style:"font-weight:800;", text:"Auto Backups Active" })
            ]),
            el("div", { class:"note", text:`Keeping: ${BackupVault.KEEP || 20} snapshots` })
          ])
        );

        container.appendChild(el("div", { style:"height:12px" }));

        function normalizeReason(r){
          const rr = String(r || "").toLowerCase();
          if(rr.includes("pre-import")) return "Pre-Import";
          if(rr.includes("pre-reset")) return "Pre-Reset";
          if(rr.includes("manual")) return "Manual";
          return "Auto";
        }

        function badgeColor(label){
          const l = String(label || "").toLowerCase();
          if(l.includes("pre-import")) return "#FFC107";
          if(l.includes("pre-reset")) return "#F44336";
          if(l.includes("manual")) return "#2196F3";
          return "#4CAF50";
        }

        if(!snaps.length){
          container.appendChild(
            el("div", { class:"card" }, [
              el("div", { class:"note", text:"No auto backups found yet." })
            ])
          );
        }else{
          snaps.forEach(snap => {
            const dObj = new Date(Number(snap?.createdAt || Date.now()));
            const dt =
              dObj.toLocaleDateString(undefined, { month:"short", day:"numeric" }) +
              " • " +
              dObj.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });

            const c = snap?.counts || {};
            const reasonLabel = normalizeReason(snap?.reason);

            const card = el("div", {
              class:"card",
              style:"cursor:pointer;"
            }, [
              el("div", { style:"display:flex; justify-content:space-between; align-items:center;" }, [
                el("div", { style:"font-weight:900;", text: dt }),
                el("div", {
                  style:`
                    padding:4px 10px;
                    border-radius:999px;
                    font-size:11px;
                    font-weight:700;
                    background:${badgeColor(reasonLabel)}22;
                    color:${badgeColor(reasonLabel)};
                    border:1px solid ${badgeColor(reasonLabel)}55;
                  `
                }, [reasonLabel])
              ]),
              el("div", { style:"height:8px" }),
              el("div", { class:"note", text:`${c.routines||0} Routines • ${c.workouts||0} Workouts` }),
              el("div", { class:"note", text:`${c.protein||0} Protein • ${c.attendance||0} Attendance` })
            ]);

            card.onclick = () => {
              confirmModal({
                title:"Restore Snapshot?",
                note:`Restore snapshot from:\n${dt}\n\nThis will overwrite your current data.`,
                confirmText:"Restore",
                danger:true,
                onConfirm: () => {
                  try{
                    state = migrateState(snap.state);
                    Storage.save(state);
                    showToast("Snapshot restored");
                    Modal.close();
                    navigate("home");
                  }catch(err){
                    Modal.open({
                      title:"Restore failed",
                      bodyNode: el("div", {}, [
                        el("div", { class:"note", text: err?.message || "Could not restore snapshot." }),
                        el("div", { style:"height:12px" }),
                        el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
                      ])
                    });
                  }
                }
              });
            };

            container.appendChild(card);
            container.appendChild(el("div", { style:"height:10px" }));
          });
        }

        Modal.open({
          title:"Restore from Auto Backup",
          bodyNode: container
        });

      }catch(e){
        Modal.open({
          title:"Could not load auto backups",
          bodyNode: el("div", {}, [
            el("div", { class:"note", text: e?.message || "Could not read auto backups." }),
            el("div", { style:"height:12px" }),
            el("button", { class:"btn primary", onClick: Modal.close }, ["OK"])
          ])
        });
      }
    }
  }, ["Restore from Auto Backup"]),

  // Clear Auto Backups
  el("button", {
    class:"btn danger",
    onClick: () => {
      confirmModal({
        title:"Clear auto backups",
        note:"Deletes ALL auto backup snapshots stored on this device. This cannot be undone.",
        confirmText:"Clear auto backups",
        danger:true,
        onConfirm: async () => {
          try{
            if(typeof BackupVault !== "undefined" && BackupVault.clear){
              await BackupVault.clear();
              showToast("Auto backups cleared");
            }else{
              showToast("Auto backups not available");
            }
          }catch(_){
            showToast("Could not clear auto backups");
          }
        }
      });
    }
  }, ["Clear Auto Backups"])

]),


          // ───────────────
          // Import options
          // ───────────────
          el("div", { style:"height:14px" }),
          el("div", { class:"note", text:"Import options:" }),
          el("div", { style:"height:8px" }),
          el("div", { class:"btnrow" }, [
            el("button", { class:"btn danger", onClick: openImportPasteModal }, ["Import (paste JSON)"]),
            el("button", { class:"btn danger", onClick: openImportFileModal }, ["Import (upload file)"])
          ]),
          el("div", { style:"height:10px" }),
          el("div", { class:"note", text:"Tip: Export a file backup occasionally. Auto backups help you recover from mistakes/bugs, but a file backup is safer if iOS clears storage." })
        ]);
           
        const dataBody = el("div", {}, [
          el("div", { class:"note", text:"Repair tools and targeted clears." }),
          el("div", { style:"height:10px" }),

          el("div", { class:"setLink", onClick: () => {
            confirmModal({
              title: "Repair workout logs",
              note: "Removes duplicate log entries (same date + routine exercise). Keeps the most recent.",
              confirmText: "Repair logs",
              danger: true,
              onConfirm: () => {
                const seen = new Map();
                const cleaned = [];
                (state.logs?.workouts || [])
                  .slice()
                  .sort((a,b)=> (b.createdAt||0) - (a.createdAt||0))
                  .forEach(e => {
                    const key = `${e.dateISO}_${e.routineExerciseId}`;
                    if(!seen.has(key)){
                      seen.set(key,true);
                      cleaned.push(e);
                    }
                  });
                state.logs.workouts = cleaned;
                Storage.save(state);
                showToast("Duplicates removed");
              }
            });
          }}, [
            el("div", { class:"l" }, [
              el("div", { class:"a", text:"Repair workout logs" }),
              el("div", { class:"b", text:"Remove duplicates (keeps most recent)" })
            ]),
            el("div", { style:"opacity:.8", text:"→" })
          ]),

          el("div", { style:"height:10px" }),
          el("div", { class:"note", text:"Clear specific data:" }),
          el("div", { style:"height:8px" }),

          el("div", { class:"btnrow" }, [
            el("button", {
              class:"btn danger",
              onClick: () => confirmModal({
                title: "Clear workout logs",
                note: "Deletes all workout logs. This cannot be undone.",
                confirmText: "Clear workouts",
                danger: true,
                onConfirm: () => { state.logs.workouts = []; Storage.save(state); showToast("Workout logs cleared"); }
              })
            }, ["Clear workouts"]),
            el("button", {
              class:"btn danger",
              onClick: () => confirmModal({
                title: "Clear weight logs",
                note: "Deletes all weigh-ins. This cannot be undone.",
                confirmText: "Clear weight",
                danger: true,
                onConfirm: () => { state.logs.weight = []; Storage.save(state); showToast("Weight logs cleared"); }
              })
            }, ["Clear weight"])
          ]),
          el("div", { style:"height:10px" }),
          el("div", { class:"btnrow" }, [
            el("button", {
              class:"btn danger",
              onClick: () => confirmModal({
                title: "Clear protein logs",
                note: "Deletes all protein entries. This cannot be undone.",
                confirmText: "Clear protein",
                danger: true,
                onConfirm: () => { state.logs.protein = []; Storage.save(state); showToast("Protein logs cleared"); }
              })
            }, ["Clear protein"]),
            el("button", {
              class:"btn danger",
              onClick: () => confirmModal({
                title: "Clear attendance",
                note: "Deletes attendance history. This cannot be undone.",
                confirmText: "Clear attendance",
                danger: true,
                onConfirm: () => { state.attendance = []; Storage.save(state); showToast("Attendance cleared"); }
              })
            }, ["Clear attendance"])
          ])
        ]);

        const debugBody = el("div", {}, [
          el("div", { class:"note", text:`Schema v${state.schemaVersion} • Approx storage: ${bytesToNice(appStorageBytes())}` }),
          el("div", { style:"height:10px" }),
          el("div", { class:"btnrow" }, [
            el("button", {
              class:"btn",
              onClick: () => Modal.open({
                title: "Current State (JSON)",
                bodyNode: el("pre", { style:"white-space:pre-wrap; font-size:12px; color: rgba(255,255,255,.85);" }, [
                  JSON.stringify(state, null, 2)
                ])
              })
            }, ["View state JSON"]),
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
            }, ["Reset local data"])
          ])
        ]);
      // --- Support / Report an issue (Formspree) ---
const supportForm = el("form", {
  action: "https://formspree.io/f/xreakwzg",
  method: "POST"
}, [
  el("label", {}, [
    el("span", { text:"Type" }),
    el("select", { class:"glassSelect", name:"issue_type" }, [
      el("option", { value:"bug", text:"Bug" }),
      el("option", { value:"feature", text:"Feature request" }),
      el("option", { value:"data", text:"Data issue" }),
      el("option", { value:"other", text:"Other" })
    ])
  ]),

  el("div", { style:"height:10px" }),

  el("label", {}, [
    el("span", { text:"Your email (optional)" }),
    el("input", { name:"email", type:"email", placeholder:"name@email.com", autocomplete:"email" })
  ]),

  el("div", { style:"height:10px" }),

  el("label", {}, [
    el("span", { text:"Subject" }),
    el("input", { name:"subject", type:"text", placeholder:"Short summary" })
  ]),

  el("div", { style:"height:10px" }),

  el("label", {}, [
    el("span", { text:"Message" }),
    el("textarea", {
      name:"message",
      placeholder:"What happened? Steps to reproduce? What did you expect?",
      style:"width:100%; min-height:160px; border-radius:14px; padding:12px; border:1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: rgba(255,255,255,.92); font-size:12px; outline:none; resize:vertical;"
    })
  ]),

  el("div", { style:"height:12px" }),

  el("div", { class:"btnrow" }, [
    el("button", { class:"btn primary", type:"submit" }, ["Send report"]),
    el("button", {
      class:"btn",
      type:"button",
      onClick: (ev) => {
        const form = ev.target.closest("form");
        if(form) form.reset();
      }
    }, ["Clear"])
  ])
]);

// ✅ Attach submit handler using the real DOM API (reliable)
supportForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.currentTarget;
  const fd = new FormData(form);

  // Auto-attach diagnostics (safe + helpful)
  fd.set("app_version_latest", String(__latestVersion || ""));
  fd.set("app_version_applied", String(__appliedVersion || ""));
  fd.set("route", String(currentRoute || ""));
  fd.set("user_agent", String(navigator.userAgent || ""));
  fd.set("ts", new Date().toISOString());

  try{
    const r = await fetch(form.action, {
      method: "POST",
      body: fd,
      headers: { "Accept": "application/json" }
    });

    if(r.ok){
      form.reset();
      showToast("Sent — thank you!");
    }else{
      let msg = "Could not send.";
      try{
        const j = await r.json();
        if(j?.errors?.[0]?.message) msg = j.errors[0].message;
      }catch(_){}
      showToast(msg);
    }
  }catch(_){
    showToast("Network error — try again.");
  }
});

const supportBody = el("div", {}, [
  el("div", { class:"note", text:"Report a bug or request a feature. This sends a message directly to the developer." }),
  el("div", { style:"height:10px" }),
  supportForm
]);
        // --- Search Bar ---
        const searchInput = el("input", {
          type:"text",
          placeholder:"Search settings…",
          value: ui.q || ""
        });
        searchInput.addEventListener("input", (e) => {
          ui.q = e.target.value || "";
          renderView();
        });

const root = el("div", { class:"settingsWrap" }, [
  el("div", { class:"settingsSearch" }, [
    el("div", { class:"ico", text:"🔎" }),
    searchInput
  ]),
  el("div", { class:"accList" }, [
    makeSection({
      key:"profile",
      title:"Profile & Preferences",
      subtitle:"Name, protein goal, week start, rest days",
      keywords:["name","protein","week","rest","goal"],
      bodyNode: profileBody
    }),
      makeSection({
      key:"routines",
      title:"Routines",
      subtitle:"Create, set active, rename, duplicate, delete",
      keywords:["routine","routines","template","active","edit","duplicate","delete","create"],
      bodyNode: routinesBody
    }),
    makeSection({
      key:"library",
      title:"Exercise Library",
      subtitle:"Manage exercises (add/edit/delete)",
      keywords:["exercise","library","weightlifting","cardio","core"],
      bodyNode: libraryBody
    }),
    makeSection({
      key:"backup",
      title:"Backup & Restore",
      subtitle:"Export/import JSON backups",
      keywords:["backup","import","export","json","restore"],
      bodyNode: backupBody
    }),
    makeSection({
      key:"data",
      title:"Data Tools",
      subtitle:"Repair duplicates + clear specific data",
      keywords:["repair","duplicates","clear","logs","attendance"],
      bodyNode: dataBody
    }),
    makeSection({
      key:"debug",
      title:"Debug / About",
      subtitle:"View raw state + reset local data",
      keywords:["debug","reset","state","storage"],
      bodyNode: debugBody
    }),
    makeSection({
      key:"support",
      title:"Support / Report an issue",
      subtitle:"Send feedback to the developer",
      keywords:["support","issue","bug","feedback","feature","help","report"],
      bodyNode: supportBody
    })
  ])
]);
        return root;
      
};
