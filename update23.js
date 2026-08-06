(() => {
  'use strict';

  const waitFor = (predicate, timeout = 12000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) { clearInterval(timer); resolve(value); }
      else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('Benötigte Ansicht nicht gefunden')); }
    }, 100);
  });

  const style = document.createElement('style');
  style.id = 'rtDedicatedToolsStyle';
  style.textContent = `
    #rtHudEditorButton{display:none!important}
    #sessionImportCard{display:none!important}
    .rt-tool-view{position:relative;z-index:300;max-width:1280px;margin:0 auto;padding:0 12px 28px}
    .rt-tool-view[hidden]{display:none!important}
    .rt-tool-head{position:sticky;top:calc(max(env(safe-area-inset-top),12px) + 58px);z-index:350;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 -2px 14px;padding:11px 12px;border:1px solid #29435f;border-radius:15px;background:rgba(7,17,31,.97);backdrop-filter:blur(14px)}
    .rt-tool-head h2{margin:0;font-size:19px}.rt-tool-head p{margin:3px 0 0;color:#96aac1;font-size:12px}
    .rt-tool-back{min-width:88px}
    .rt-tool-card{border:1px solid #29435f;border-radius:18px;background:#0a1727;padding:14px;overflow:hidden}
    #rtHudConfigHost #rtHudEditorButton{display:none!important}
    #rtHudConfigHost #rtHudWorkspace{display:grid!important;grid-template-columns:minmax(260px,360px) minmax(0,1fr)!important;gap:14px!important}
    #rtHudConfigHost #rtHudEditor{display:block!important;grid-column:1!important;grid-row:1!important;position:relative!important;inset:auto!important;max-height:76vh!important;overflow:auto!important}
    #rtHudConfigHost #rtHudVideoColumn{grid-column:2!important;grid-row:1!important;min-width:0!important}
    #rtHudConfigHost #videoWrap{min-height:260px}
    @media(max-width:760px){
      #rtHudConfigHost #rtHudWorkspace{grid-template-columns:minmax(138px,42vw) minmax(0,1fr)!important;gap:8px!important}
      #rtHudConfigHost #rtHudEditor{font-size:12px!important;padding:10px!important;max-height:70vh!important}
      #rtHudConfigHost #rtHudEditor input[type=range]{width:100%!important}
      .rt-tool-view{padding-left:7px;padding-right:7px}
    }
  `;
  document.head.appendChild(style);

  const closeExistingViews = except => {
    document.querySelectorAll('.rt-view,.rt-tool-view').forEach(view => {
      if (view !== except) {
        if (view.classList.contains('rt-tool-view')) view.hidden = true;
        else view.remove();
      }
    });
  };

  const makeView = (id, title, subtitle) => {
    let view = document.getElementById(id);
    if (view) return view;
    view = document.createElement('section');
    view.id = id;
    view.className = 'rt-tool-view';
    view.hidden = true;
    view.innerHTML = `<header class="rt-tool-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="rt-tool-back" type="button">Zurück</button></header><div class="rt-tool-card" data-host></div>`;
    view.querySelector('.rt-tool-back').onclick = () => {
      view.hidden = true;
      document.getElementById('rtHudEditor')?.classList.remove('open');
      document.getElementById('rtHudCanvas')?.classList.remove('editing');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    document.querySelector('main')?.prepend(view);
    return view;
  };

  const hudView = makeView('rtHudConfigView', 'HUD-Konfiguration', 'Quer- und Hochformat, Elemente, Schrift, Transparenz und Wasserzeichen');
  const importView = makeView('rtImportView', 'Import & Replay', 'Native RideSessions, RidePackages und synchronisierte Videos öffnen');
  const hudHost = hudView.querySelector('[data-host]');
  hudHost.id = 'rtHudConfigHost';
  const importHost = importView.querySelector('[data-host]');
  importHost.id = 'rtImportHost';

  let originalHudParent = null;
  let hudNextSibling = null;

  async function prepareHud() {
    const workspace = await waitFor(() => document.getElementById('rtHudWorkspace'));
    if (!originalHudParent) {
      originalHudParent = workspace.parentElement;
      hudNextSibling = workspace.nextSibling;
    }
    if (workspace.parentElement !== hudHost) hudHost.appendChild(workspace);
    const editor = document.getElementById('rtHudEditor');
    editor?.classList.add('open');
    workspace.classList.add('editor-open');
    document.getElementById('rtHudEditorButton')?.setAttribute('aria-hidden', 'true');
  }

  async function prepareImport() {
    const card = await waitFor(() => document.getElementById('sessionImportCard'));
    card.style.setProperty('display', 'block', 'important');
    if (card.parentElement !== importHost) importHost.appendChild(card);
  }

  window.RideTrackerTools = {
    async showHudConfiguration() {
      closeExistingViews(hudView);
      hudView.hidden = false;
      try { await prepareHud(); } catch (error) { hudHost.innerHTML = `<p>HUD-Editor konnte nicht geladen werden: ${error.message}</p>`; }
      hudView.scrollIntoView({ block: 'start' });
    },
    async showImports() {
      closeExistingViews(importView);
      importView.hidden = false;
      try { await prepareImport(); } catch (error) { importHost.innerHTML = `<p>Importansicht konnte nicht geladen werden: ${error.message}</p>`; }
      importView.scrollIntoView({ block: 'start' });
    }
  };

  function extendDrawer() {
    const list = document.querySelector('#rtNavDrawer .rt-nav-list');
    if (!list || list.querySelector('[data-route="HUD-Konfiguration"]')) return;
    const settings = list.querySelector('[data-route="Einstellungen"]');
    const hud = document.createElement('button');
    hud.className = 'rt-nav-item'; hud.dataset.route = 'HUD-Konfiguration';
    hud.innerHTML = '<i>▣</i><span><b>HUD-Konfiguration</b><small>Overlay gestalten und Wasserzeichen verwalten</small></span>';
    const imports = document.createElement('button');
    imports.className = 'rt-nav-item'; imports.dataset.route = 'Import & Replay';
    imports.innerHTML = '<i>⇩</i><span><b>Import & Replay</b><small>RideSessions, Packages und Videos öffnen</small></span>';
    list.insertBefore(hud, settings || null);
    list.insertBefore(imports, settings || null);
    hud.onclick = () => { document.getElementById('rtNavDrawer')?.classList.remove('open'); document.getElementById('rtNavScrim')?.classList.remove('open'); window.RideTrackerTools.showHudConfiguration(); };
    imports.onclick = () => { document.getElementById('rtNavDrawer')?.classList.remove('open'); document.getElementById('rtNavScrim')?.classList.remove('open'); window.RideTrackerTools.showImports(); };
  }

  const observer = new MutationObserver(extendDrawer);
  observer.observe(document.body, { childList: true, subtree: true });
  extendDrawer();

  // Alte Dashboard-Importnavigation darf nicht mehr in den Aufnahmebereich springen.
  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-view="rides"]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById('rideDashboard')?.style.setProperty('display', 'none');
    window.RideTrackerTools.showImports();
  }, true);
})();
