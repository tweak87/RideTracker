(() => {
  'use strict';

  const waitFor = (predicate, timeout = 15000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) { clearInterval(timer); resolve(value); }
      else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('Komponente konnte nicht initialisiert werden')); }
    }, 100);
  });

  function ensureHudWorkspace() {
    const wrap = document.getElementById('videoWrap');
    const editor = document.getElementById('rtHudEditor');
    const canvas = document.getElementById('rtHudCanvas');
    if (!wrap || !editor || !canvas) return null;
    let workspace = document.getElementById('rtHudWorkspace');
    if (!workspace) {
      workspace = document.createElement('div');
      workspace.id = 'rtHudWorkspace';
      const column = document.createElement('div');
      column.id = 'rtHudVideoColumn';
      const parent = wrap.parentElement;
      parent.insertBefore(workspace, wrap);
      workspace.append(column, editor);
      column.appendChild(wrap);
    } else {
      let column = document.getElementById('rtHudVideoColumn');
      if (!column) {
        column = document.createElement('div');
        column.id = 'rtHudVideoColumn';
        workspace.prepend(column);
      }
      if (!column.contains(wrap)) column.appendChild(wrap);
      if (!workspace.contains(editor)) workspace.appendChild(editor);
    }
    return workspace;
  }

  async function openHud() {
    document.getElementById('rideDashboard')?.style.setProperty('display', 'none');
    const view = document.getElementById('rtHudConfigView');
    if (!view) throw new Error('HUD-Konfigurationsansicht fehlt');
    document.querySelectorAll('.rt-view,.rt-tool-view,#rtSettingsView').forEach(item => {
      if (item === view) return;
      if ('hidden' in item) item.hidden = true;
    });
    view.hidden = false;
    const workspace = await waitFor(ensureHudWorkspace);
    const host = document.getElementById('rtHudConfigHost');
    if (!host) throw new Error('HUD-Konfigurationsbereich fehlt');
    host.replaceChildren(workspace);
    const editor = document.getElementById('rtHudEditor');
    editor.classList.add('open');
    workspace.classList.add('editor-open');
    view.querySelector('[data-host]')?.removeAttribute('data-error');
    view.scrollIntoView({ block: 'start' });
  }

  async function openImports() {
    document.getElementById('rideDashboard')?.style.setProperty('display', 'none');
    const view = document.getElementById('rtImportView');
    const card = await waitFor(() => document.getElementById('sessionImportCard'));
    const host = document.getElementById('rtImportHost');
    if (!view || !host) throw new Error('Importansicht fehlt');
    document.querySelectorAll('.rt-view,.rt-tool-view,#rtSettingsView').forEach(item => {
      if (item === view) return;
      if ('hidden' in item) item.hidden = true;
    });
    view.hidden = false;
    card.style.setProperty('display', 'block', 'important');
    host.replaceChildren(card);
    view.scrollIntoView({ block: 'start' });
  }

  window.RideTrackerTools = {
    ...(window.RideTrackerTools || {}),
    showHudConfiguration: () => openHud().catch(showHudError),
    showImports: () => openImports().catch(showImportError)
  };

  function showHudError(error) {
    const host = document.getElementById('rtHudConfigHost');
    if (host) host.innerHTML = `<div class="notice"><b>HUD-Editor nicht verfügbar.</b><br>${error.message}<br><button id="rtRetryHud" type="button">Erneut laden</button></div>`;
    document.getElementById('rtRetryHud')?.addEventListener('click', () => window.RideTrackerTools.showHudConfiguration());
  }
  function showImportError(error) {
    const host = document.getElementById('rtImportHost');
    if (host) host.innerHTML = `<div class="notice"><b>Import nicht verfügbar.</b><br>${error.message}<br><button id="rtRetryImport" type="button">Erneut laden</button></div>`;
    document.getElementById('rtRetryImport')?.addEventListener('click', () => window.RideTrackerTools.showImports());
  }

  document.addEventListener('click', event => {
    const route = event.target.closest?.('[data-route="HUD-Konfiguration"]');
    if (route) { event.preventDefault(); event.stopImmediatePropagation(); window.RideTrackerTools.showHudConfiguration(); }
    const imports = event.target.closest?.('[data-route="Import & Replay"]');
    if (imports) { event.preventDefault(); event.stopImmediatePropagation(); window.RideTrackerTools.showImports(); }
  }, true);

  const verify = () => {
    ensureHudWorkspace();
    const status = {
      hudCanvas: !!document.getElementById('rtHudCanvas'),
      hudEditor: !!document.getElementById('rtHudEditor'),
      import: !!document.getElementById('sessionImportCard'),
      settings: !!document.getElementById('rtSettingsView'),
      recording: !!document.getElementById('videoWrap')
    };
    window.RideTrackerFeatureStatus = status;
    console.info('RideTracker feature status', status);
  };
  setTimeout(verify, 1000);
})();
