(() => {
  'use strict';

  const waitFor = (predicate, timeout = 12000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('Benötigte Ansicht nicht gefunden'));
      }
    }, 100);
  });

  const style = document.createElement('style');
  style.id = 'rtDedicatedToolsStyle';
  style.textContent = `
    #sessionImportCard{display:none!important}
    .rt-tool-view{position:relative;z-index:300;max-width:1280px;margin:0 auto;padding:0 12px 28px}
    .rt-tool-view[hidden]{display:none!important}
    .rt-tool-head{position:sticky;top:calc(max(env(safe-area-inset-top),12px) + 58px);z-index:350;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 -2px 14px;padding:11px 12px;border:1px solid #29435f;border-radius:15px;background:rgba(7,17,31,.97);backdrop-filter:blur(14px)}
    .rt-tool-head h2{margin:0;font-size:19px}.rt-tool-head p{margin:3px 0 0;color:#96aac1;font-size:12px}
    .rt-tool-back{min-width:88px}
    .rt-tool-card{border:1px solid #29435f;border-radius:18px;background:#0a1727;padding:14px;overflow:hidden}
    @media(max-width:760px){.rt-tool-view{padding-left:7px;padding-right:7px}}
  `;
  document.head.appendChild(style);

  const closeExistingViews = except => {
    document.querySelectorAll('.rt-view,.rt-tool-view').forEach(view => {
      if (view === except) return;
      if (view.classList.contains('rt-tool-view')) view.hidden = true;
      else view.remove();
    });
  };

  function makeImportView() {
    let view = document.getElementById('rtImportView');
    if (view) return view;
    view = document.createElement('section');
    view.id = 'rtImportView';
    view.className = 'rt-tool-view';
    view.hidden = true;
    view.innerHTML = `<header class="rt-tool-head"><div><h2>Import & Replay</h2><p>Native RideSessions, RidePackages und synchronisierte Videos öffnen</p></div><button class="rt-tool-back" type="button">Zurück</button></header><div class="rt-tool-card" id="rtImportHost"></div>`;
    view.querySelector('.rt-tool-back').onclick = () => {
      view.hidden = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    document.querySelector('main')?.prepend(view);
    return view;
  }

  async function showImports() {
    const view = makeImportView();
    closeExistingViews(view);
    view.hidden = false;
    const host = view.querySelector('#rtImportHost');
    try {
      const card = await waitFor(() => document.getElementById('sessionImportCard'));
      card.style.setProperty('display', 'block', 'important');
      if (card.parentElement !== host) host.appendChild(card);
    } catch (error) {
      host.innerHTML = `<p>Importansicht konnte nicht geladen werden: ${error.message}</p>`;
    }
    view.scrollIntoView({ block: 'start' });
  }

  function showHudConfiguration() {
    return window.RideTrackerStandaloneHudEditor?.open?.();
  }

  window.RideTrackerTools = {
    ...(window.RideTrackerTools || {}),
    showHudConfiguration,
    showImports
  };

  function extendDrawer() {
    const list = document.querySelector('#rtNavDrawer .rt-nav-list');
    if (!list) return;
    const settings = list.querySelector('[data-route="Einstellungen"]');

    let hud = list.querySelector('[data-route="HUD-Konfiguration"]');
    if (!hud) {
      hud = document.createElement('button');
      hud.className = 'rt-nav-item';
      hud.dataset.route = 'HUD-Konfiguration';
      hud.innerHTML = '<i>▣</i><span><b>HUD-Konfiguration</b><small>Overlay gestalten und Wasserzeichen verwalten</small></span>';
      list.insertBefore(hud, settings || null);
    }

    let imports = list.querySelector('[data-route="Import & Replay"]');
    if (!imports) {
      imports = document.createElement('button');
      imports.className = 'rt-nav-item';
      imports.dataset.route = 'Import & Replay';
      imports.innerHTML = '<i>⇩</i><span><b>Import & Replay</b><small>RideSessions, Packages und Videos öffnen</small></span>';
      list.insertBefore(imports, settings || null);
    }

    hud.onclick = () => {
      document.getElementById('rtNavDrawer')?.classList.remove('open');
      document.getElementById('rtNavScrim')?.classList.remove('open');
      showHudConfiguration();
    };
    imports.onclick = () => {
      document.getElementById('rtNavDrawer')?.classList.remove('open');
      document.getElementById('rtNavScrim')?.classList.remove('open');
      showImports();
    };
  }

  new MutationObserver(extendDrawer).observe(document.body, { childList: true, subtree: true });
  extendDrawer();

  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-view="rides"]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById('rideDashboard')?.style.setProperty('display', 'none');
    showImports();
  }, true);
})();
