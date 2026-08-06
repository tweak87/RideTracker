(async () => {
  const wrap = document.getElementById('videoWrap');
  const editor = document.getElementById('rtHudEditor');
  const canvas = document.getElementById('rtHudCanvas');
  if (!wrap || !editor || !canvas) return;

  const spec = await fetch('./shared/overlay/overlay-spec.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  const keys = ['pulse', 'gDial', 'gValues', 'speed', 'vibration', 'dynamics'];
  const labels = {
    pulse: 'Puls',
    gDial: 'G-Kraft-Kreis',
    gValues: 'G-Achsen',
    speed: 'Geschwindigkeit',
    vibration: 'Vibration',
    dynamics: 'Fahrdynamik'
  };

  const style = document.createElement('style');
  style.id = 'rtHudDockStyle';
  style.textContent = `
    #rtHudWorkspace{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"video";gap:14px;align-items:start;width:100%}
    #rtHudWorkspace.editor-open{grid-template-columns:clamp(220px,30vw,360px) minmax(0,1fr);grid-template-areas:"editor video"}
    #rtHudEditorColumn{grid-area:editor;min-width:0;display:none}
    #rtHudWorkspace.editor-open #rtHudEditorColumn{display:block}
    #rtHudVideoColumn{grid-area:video;min-width:0;position:relative;width:100%}
    #rtHudVideoColumn #videoWrap{width:100%!important;max-width:100%!important;margin-inline:auto!important}
    #rtHudEditor{
      position:sticky!important;top:calc(env(safe-area-inset-top,0px) + 76px)!important;inset:auto!important;
      margin:0!important;width:100%!important;max-width:none!important;max-height:calc(100dvh - 100px)!important;
      z-index:10!important;box-sizing:border-box!important;border-radius:16px!important;box-shadow:none!important;
      display:none!important;overflow:auto!important;padding:14px!important
    }
    #rtHudEditor.open{display:block!important}
    #rtHudCanvas.editing{pointer-events:auto!important;touch-action:none!important;cursor:grab!important;-webkit-user-select:none!important;user-select:none!important}
    #rtHudCanvas.editing:active{cursor:grabbing!important}
    #rtHudDragState{display:none;margin:8px 0 0;padding:8px 10px;border:1px solid #00e5ff;border-radius:10px;background:rgba(0,229,255,.10);color:#f5fbff;font:600 12px system-ui}
    #rtHudWorkspace.drag-active #rtHudDragState{display:block}
    #rtHudWorkspace.drag-active #videoWrap{outline:2px solid #00e5ff;outline-offset:3px;overscroll-behavior:contain}
    #rtHudQuickNav{display:grid;grid-template-columns:1fr;gap:7px;margin:10px 0 14px}
    #rtHudQuickNav button{display:flex;align-items:center;justify-content:space-between;width:100%;padding:9px 10px;border:1px solid #315361;border-radius:10px;background:#102733;color:#fff;font:600 12px system-ui;text-align:left}
    #rtHudQuickNav button.active{border-color:#00e5ff;background:rgba(0,229,255,.14)}
    #rtHudEditor .element{position:relative;padding-top:42px!important;max-height:42px;overflow:hidden;transition:max-height .2s ease,border-color .2s ease}
    #rtHudEditor .element.rt-open{max-height:420px;border-color:#00e5ff}
    #rtHudEditor .rtElementHeader{position:absolute;inset:0 0 auto 0;height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;background:#102733;border:0;color:#fff;font:700 12px system-ui;width:100%;box-sizing:border-box}
    #rtHudEditor .rtElementHeader span:last-child{font-size:16px;color:#00e5ff}
    #rtHudHandles{position:absolute;inset:0;z-index:85;pointer-events:none;display:none}
    #rtHudWorkspace.editor-open #rtHudHandles{display:block}
    .rtHudHandle{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;width:30px;height:30px;border-radius:50%;border:2px solid #00e5ff;background:#07161b;color:#fff;font:700 15px system-ui;box-shadow:0 2px 10px #000;display:grid;place-items:center;padding:0}
    .rtHudHandle.active{background:#00e5ff;color:#061416}

    /* Smartphone-Hochformat: Vorschau in voller Breite, Einstellungen darunter. */
    @media (max-width:720px) and (orientation:portrait){
      #rtHudWorkspace.editor-open{grid-template-columns:minmax(0,1fr);grid-template-areas:"video" "editor";gap:12px}
      #rtHudEditor{position:relative!important;top:auto!important;max-height:none!important;padding:12px!important;font-size:13px!important}
      #rtHudEditorColumn{width:100%!important}
      #rtHudVideoColumn{width:100%!important}
      #rtHudVideoColumn #videoWrap{min-height:0!important;aspect-ratio:9/16!important;max-height:68dvh!important}
      #rtHudEditor .row{grid-template-columns:1fr auto!important}
      #rtHudEditor input[type=range]{width:min(46vw,190px)!important}
      #rtHudEditorButton{font-size:11px!important;padding:8px 9px!important}
      .rtHudHandle{width:30px;height:30px;font-size:14px}
    }

    /* Smartphone-Querformat: kompakter Editor links, große Vorschau rechts. */
    @media (max-height:720px) and (orientation:landscape){
      #rtHudWorkspace.editor-open{grid-template-columns:clamp(210px,32vw,330px) minmax(0,1fr);grid-template-areas:"editor video";gap:10px}
      #rtHudEditor{top:calc(env(safe-area-inset-top,0px) + 8px)!important;max-height:calc(100dvh - 20px)!important;padding:10px!important;font-size:12px!important}
      #rtHudEditor .row{grid-template-columns:1fr!important}
      #rtHudEditor input[type=range]{width:100%!important}
      #rtHudVideoColumn #videoWrap{height:min(82dvh,720px)!important;aspect-ratio:16/9!important}
      .rtHudHandle{width:28px;height:28px;font-size:13px}
    }
  `;
  document.getElementById('rtHudDockStyle')?.remove();
  document.head.appendChild(style);

  let workspace = document.getElementById('rtHudWorkspace');
  let editorColumn;
  let videoColumn;
  if (!workspace) {
    workspace = document.createElement('div');
    workspace.id = 'rtHudWorkspace';
    editorColumn = document.createElement('div');
    editorColumn.id = 'rtHudEditorColumn';
    videoColumn = document.createElement('div');
    videoColumn.id = 'rtHudVideoColumn';
    const parent = wrap.parentElement;
    parent.insertBefore(workspace, wrap);
    workspace.append(editorColumn, videoColumn);
    editorColumn.appendChild(editor);
    videoColumn.appendChild(wrap);
    const dragState = document.createElement('div');
    dragState.id = 'rtHudDragState';
    dragState.textContent = 'Verschiebemodus aktiv: Element gedrückt halten und frei an die gewünschte Position ziehen.';
    videoColumn.appendChild(dragState);
  } else {
    editorColumn = document.getElementById('rtHudEditorColumn') || document.createElement('div');
    videoColumn = document.getElementById('rtHudVideoColumn') || document.createElement('div');
    editorColumn.id = 'rtHudEditorColumn';
    videoColumn.id = 'rtHudVideoColumn';
    if (!editorColumn.parentElement) workspace.prepend(editorColumn);
    if (!videoColumn.parentElement) workspace.append(videoColumn);
    editorColumn.appendChild(editor);
    if (wrap.parentElement !== videoColumn) videoColumn.prepend(wrap);
    workspace.prepend(editorColumn);
  }

  document.getElementById('rtHudHandles')?.remove();
  const handles = document.createElement('div');
  handles.id = 'rtHudHandles';
  wrap.appendChild(handles);
  const handleMap = new Map();
  keys.forEach(key => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rtHudHandle';
    button.dataset.key = key;
    button.title = `${labels[key]} konfigurieren`;
    button.setAttribute('aria-label', `${labels[key]} konfigurieren`);
    button.textContent = '⚙';
    handles.appendChild(button);
    handleMap.set(key, button);
  });

  let selectedKey = 'pulse';

  function decorateEditor() {
    if (!editor.classList.contains('open')) return;
    let nav = editor.querySelector('#rtHudQuickNav');
    if (!nav) {
      nav = document.createElement('div');
      nav.id = 'rtHudQuickNav';
      const heading = editor.querySelector('h3');
      (heading || editor.firstElementChild)?.insertAdjacentElement('afterend', nav);
    }
    nav.innerHTML = keys.map(key => `<button type="button" data-quick="${key}" class="${key === selectedKey ? 'active' : ''}"><span>${labels[key]}</span><span>⚙</span></button>`).join('');

    editor.querySelectorAll('.element').forEach(element => {
      const control = element.querySelector('[data-k]');
      const key = control?.dataset.k;
      if (!key) return;
      if (!element.querySelector('.rtElementHeader')) {
        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'rtElementHeader';
        header.dataset.openElement = key;
        header.innerHTML = `<span>${labels[key] || key}</span><span>⚙</span>`;
        element.prepend(header);
      }
      element.classList.toggle('rt-open', key === selectedKey);
      element.dataset.elementKey = key;
    });
  }

  function selectElement(key) {
    selectedKey = key;
    editor.classList.add('open');
    requestAnimationFrame(() => {
      decorateEditor();
      editor.querySelector(`[data-select="${key}"]`)?.click();
      editor.querySelector(`[data-element-key="${key}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      handleMap.forEach((button, handleKey) => button.classList.toggle('active', handleKey === key));
      syncState();
    });
  }

  handles.addEventListener('click', event => {
    const button = event.target.closest('.rtHudHandle');
    if (button) selectElement(button.dataset.key);
  });

  editor.addEventListener('click', event => {
    const quick = event.target.closest('[data-quick]');
    const header = event.target.closest('[data-open-element]');
    if (quick) selectElement(quick.dataset.quick);
    if (header) selectElement(header.dataset.openElement);
    if (event.target?.id === 'rtDragMode' || event.target?.id === 'rtCloseEditor') requestAnimationFrame(syncState);
  });

  new MutationObserver(() => requestAnimationFrame(decorateEditor)).observe(editor, { childList: true, subtree: true });

  function readConfig() {
    try { return JSON.parse(localStorage.getItem('rideTracker.hud.configuration.v1') || '{}'); }
    catch { return {}; }
  }

  function visibleVideo() {
    return [...wrap.querySelectorAll('video')].find(v => getComputedStyle(v).display !== 'none' && !v.classList.contains('hidden') && (v.videoWidth || v.clientWidth));
  }

  function contentRect() {
    const box = wrap.getBoundingClientRect();
    const video = visibleVideo();
    const sw = video?.videoWidth || (matchMedia('(orientation: portrait)').matches ? 1080 : 1920);
    const sh = video?.videoHeight || (matchMedia('(orientation: portrait)').matches ? 1920 : 1080);
    const sa = sw / sh;
    const ba = box.width / Math.max(box.height, 1);
    let x = 0, y = 0, width = box.width, height = box.height;
    if (ba > sa) { height = box.height; width = height * sa; x = (box.width - width) / 2; }
    else { width = box.width; height = width / sa; y = (box.height - height) / 2; }
    return { x, y, width, height, orientation: sa < 1 ? 'portrait' : 'landscape' };
  }

  function updateHandles() {
    const rect = contentRect();
    const config = readConfig();
    const profile = config.profiles?.[rect.orientation];
    const base = spec?.layouts?.[rect.orientation] || {};
    keys.forEach(key => {
      const element = profile?.elements?.[key];
      const source = element || (base[key] ? { x: base[key][0], y: base[key][1], width: base[key][2], height: base[key][3], scale: 1, visible: true } : null);
      const button = handleMap.get(key);
      if (!source || source.visible === false) { button.style.display = 'none'; return; }
      button.style.display = 'grid';
      const scale = source.scale || 1;
      const right = Math.min(1, source.x + source.width * scale);
      const top = Math.max(0, source.y);
      button.style.left = `${rect.x + right * rect.width - 4}px`;
      button.style.top = `${rect.y + top * rect.height + 4}px`;
    });
    requestAnimationFrame(updateHandles);
  }

  const syncState = () => {
    const open = editor.classList.contains('open');
    const editing = canvas.classList.contains('editing');
    workspace.classList.toggle('editor-open', open);
    workspace.classList.toggle('drag-active', open && editing);
    canvas.style.pointerEvents = open && editing ? 'auto' : 'none';
    canvas.style.touchAction = open && editing ? 'none' : 'auto';
    if (open) decorateEditor();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };

  new MutationObserver(syncState).observe(editor, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncState).observe(canvas, { attributes: true, attributeFilter: ['class'] });

  /* Wichtig: Pointer-Ereignisse werden nicht mehr im Capture-Handler gestoppt.
     Dadurch erreicht eine Fingerbewegung den eigentlichen Drag-Handler in update21.js
     kontinuierlich vom pointerdown bis pointerup. */
  canvas.addEventListener('pointerdown', event => {
    if (!canvas.classList.contains('editing')) return;
    event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointermove', event => {
    if (canvas.classList.contains('editing')) event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointercancel', () => {
    try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
  });

  const orientationRefresh = () => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      syncState();
    });
  };
  addEventListener('orientationchange', () => setTimeout(orientationRefresh, 120));
  screen.orientation?.addEventListener?.('change', orientationRefresh);

  syncState();
  requestAnimationFrame(updateHandles);
})();