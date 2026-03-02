/********************
 * router.js — Phase 3.2
 * Handles route switching + view rendering
 ********************/

export function initRouter({
  renderNav,
  renderHomeView,
  renderRoutineView,
  renderProgressView,
  renderSettingsView,
  setHeaderPills,
  checkForUpdates
}){
  let currentRoute = "home";

  function renderView(){
    const host = document.getElementById("view");
    if(!host) return;

    host.innerHTML = "";

    let node;

    switch(currentRoute){
      case "routine":
        node = renderRoutineView();
        break;
      case "progress":
        node = renderProgressView();
        break;
      case "settings":
        node = renderSettingsView();
        break;
      case "home":
      default:
        node = renderHomeView();
        break;
    }

    if(node) host.appendChild(node);
  }

  function navigate(routeKey){
    currentRoute = routeKey || "home";
    renderNav(currentRoute);
    renderView();

    // keep pills fresh
    setHeaderPills();
    checkForUpdates();
  }

  function getRoute(){
    return currentRoute;
  }

  return { navigate, renderView, getRoute };
}
