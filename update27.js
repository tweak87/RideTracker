(() => {
  'use strict';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitUntil = async (predicate, timeout = 60000, interval = 100) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try { if (predicate()) return true; } catch (_) {}
      await sleep(interval);
    }
    return false;
  };

  const style = document.createElement('style');
  style.id = 'rtRecordingFlow27Style';
  style.textContent = `
    body.rt-record-mode #rtHudWorkspace{display:block!important;width:100%!important}
    body.rt-record-mode #rtHudEditorColumn,
    body.rt-record-mode #rtHudEditor,
    body.rt-record-mode #rtHudHandles,
    body.rt-record-mode #rtHudDragState{display:none!important}
    body.rt-record-mode #rtHudVideoColumn{display:block!important;width:100%!important;min-width:0!important}
    body.rt-record-mode #videoWrap{display:block!important;width:100%!important;min-height:min(72vh,760px)!important;background:#000!important}
    body.rt-record-mode #videoWrap video{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important}
    #rtStartCountdown{position:absolute;inset:0;z-index:1000;display:none;place-items:center;background:rgba(0,0,0,.56);color:#fff;text-align:center;pointer-events:none}
    #rtStartCountdown.active{display:grid}
    #rtStartCountdown .rt-count-value{font:900 clamp(74px,22vw,210px)/1 system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums;text-shadow:0 0 30px rgba(0,229,255,.75)}
    #rtStartCountdown .rt-count-label{margin-top:12px;font:750 clamp(15px,3.8vw,28px)/1.25 system-ui;color:#f5fbff}
    #rtStartCountdown .rt-count-state{margin-top:8px;color:#00e5ff;font:650 clamp(12px,2.8vw,20px)/1.25 system-ui}
    body.rt-live-capture-fullscreen{overflow:hidden!important;background:#000!important}
    body.rt-live-capture-fullscreen #videoWrap{position:fixed!important;inset:0!important;z-index:999999!important;width:100vw!important;height:100dvh!important;min-height:100dvh!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;background:#000!important}
    body.rt-live-capture-fullscreen #videoWrap video{width:100%!important;height:100%!important;object-fit:cover!important}
    body.rt-live-capture-fullscreen #rtHudCanvas{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;z-index:45!important}
    body.rt-live-capture-fullscreen #rtRecordingDetailsToggle{display:block!important}
    #rtRecordingDetailsToggle{position:fixed;z-index:1000002;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));display:none;border:1px solid rgba(255,255,255,.6);border-radius:999px;background:rgba(6,20,22,.84);color:#fff;padding:10px 14px;font:750 13px system-ui;backdrop-filter:blur(12px)}
    #rtRecordingStopOverlay{position:fixed;z-index:1000002;left:50%;bottom:max(18px,calc(env(safe-area-inset-bottom) + 10px));transform:translateX(-50%);display:none;align-items:center;gap:10px;border:1px solid rgba(255,59,48,.65);border-radius:999px;background:rgba(45,4,8,.88);color:#fff;padding:9px 12px 9px 16px;backdrop-filter:blur(12px)}
    body.rt-live-capture-fullscreen.rt-confirmed-recording #rtRecordingStopOverlay{display:flex}
    #rtRecordingStopOverlay button{border:0;border-radius:999px;background:#ff3b30;color:#fff;padding:9px 15px;font-weight:800}
    @media(orientation:portrait){body.rt-live-capture-fullscreen #videoWrap{aspect-ratio:auto!important}}
    @media(orientation:landscape){body.rt-live-capture-fullscreen #videoWrap{aspect-ratio:auto!important}}
  `;
  document.head.appendChild(style);

  function videoCard() {
    return document.getElementById('videoWrap')?.closest('.rt-record-video-card,.card');
  }

  function restoreRecordingWorkspace() {
    const workspace = document.getElementById('rtHudWorkspace');
    const wrap = document.getElementById('videoWrap');
    const card = videoCard();
    if (!workspace || !wrap || !card) return false;
    if (workspace.parentElement !== card) card.prepend(workspace);
    let videoColumn = document.getElementById('rtHudVideoColumn');
    if (!videoColumn) {
      videoColumn = document.createElement('div');
      videoColumn.id = 'rtHudVideoColumn';
      workspace.appendChild(videoColumn);
    }
    if (wrap.parentElement !== videoColumn) videoColumn.prepend(wrap);
    document.getElementById('rtHudEditor')?.classList.remove('open');
    document.getElementById('rtHudCanvas')?.classList.remove('editing');
    workspace.classList.remove('editor-open', 'drag-active');
    return true;
  }

  function ensureCountdown() {
    const wrap = document.getElementById('videoWrap');
    if (!wrap) return null;
    let overlay = document.getElementById('rtStartCountdown');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'rtStartCountdown';
      overlay.innerHTML = '<div><div class="rt-count-value">3</div><div class="rt-count-label">Aufnahme startet gleich</div><div class="rt-count-state">Kalibrierung vorbereiten</div></div>';
      wrap.appendChild(overlay);
    }
    return overlay;
  }

  function ensureFullscreenControls() {
    if (!document.getElementById('rtRecordingDetailsToggle')) {
      const details = document.createElement('button');
      details.id = 'rtRecordingDetailsToggle';
      details.type = 'button';
      details.textContent = 'Details anzeigen';
      details.onclick = exitCaptureFullscreen;
      document.body.appendChild(details);
    }
    if (!document.getElementById('rtRecordingStopOverlay')) {
      const bar = document.createElement('div');
      bar.id = 'rtRecordingStopOverlay';
      bar.innerHTML = '<span>● Aufnahme läuft</span><button type="button">Stoppen</button>';
      bar.querySelector('button').onclick = () => document.getElementById('stop')?.click();
      document.body.appendChild(bar);
    }
  }

  function enterCaptureFullscreen() {
    restoreRecordingWorkspace();
    ensureFullscreenControls();
    document.body.classList.add('rt-live-capture-fullscreen');
    const wrap = document.getElementById('videoWrap');
    wrap?.classList.add('rt-app-fullscreen');
    window.dispatchEvent(new Event('resize'));
  }

  async function exitCaptureFullscreen() {
    document.body.classList.remove('rt-live-capture-fullscreen');
    document.getElementById('videoWrap')?.classList.remove('rt-app-fullscreen');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) {}
    window.dispatchEvent(new Event('resize'));
  }

  function isRunning() {
    const stop = document.getElementById('stop');
    const dot = document.getElementById('dot');
    const text = document.getElementById('status')?.textContent || '';
    return stop?.disabled === false || dot?.classList.contains('on') || /aufnahme läuft|recording|läuft/i.test(text);
  }

  async function clickReady(id, timeout) {
    const ready = await waitUntil(() => {
      const element = document.getElementById(id);
      return element && !element.disabled;
    }, timeout);
    if (!ready) throw new Error(`${id} wurde nicht verfügbar`);
    document.getElementById(id).click();
  }

  function chooseVideo() {
    return new Promise(resolve => {
      const modal = document.createElement('div');
      modal.className = 'rt-modal';
      modal.innerHTML = '<div class="rt-modal-card"><h3>Neue Fahrt starten</h3><p>Zuerst werden Kamera und Sensoren initialisiert. Danach erfolgt die Kalibrierung. Ein Countdown zeigt den exakten Beginn der finalen Aufzeichnung.</p><div class="rt-modal-actions"><button class="primary" data-choice="video">Mit Video starten</button><button data-choice="sensors">Ohne Video starten</button><button data-choice="cancel">Abbrechen</button></div></div>';
      modal.addEventListener('click', event => {
        const choice = event.target?.dataset?.choice;
        if (!choice) return;
        modal.remove();
        resolve(choice === 'cancel' ? null : choice === 'video');
      });
      document.body.appendChild(modal);
    });
  }

  let starting = false;
  async function calibratedStart() {
    if (starting || isRunning()) return;
    const withVideo = await chooseVideo();
    if (withVideo == null) return;
    starting = true;
    restoreRecordingWorkspace();
    document.body.classList.add('rt-record-mode');
    const overlay = ensureCountdown();
    try {
      const videoMode = document.getElementById('videoMode');
      const currentlyOn = /ein|on|aktiv/i.test(videoMode?.textContent || '');
      if (videoMode && currentlyOn !== withVideo) videoMode.click();

      const init = document.getElementById('init');
      if (init && !init.disabled) init.click();

      if (overlay) {
        overlay.classList.add('active');
        overlay.querySelector('.rt-count-value').textContent = '…';
        overlay.querySelector('.rt-count-state').textContent = 'Berechtigungen und Kamera werden initialisiert';
      }

      await clickReady('arm', 90000);
      if (overlay) overlay.querySelector('.rt-count-state').textContent = 'Kalibrierung läuft – Telefon ruhig halten';

      const startReady = await waitUntil(() => {
        const start = document.getElementById('start');
        return start && !start.disabled;
      }, 30000);
      if (!startReady) throw new Error('Kalibrierung wurde nicht abgeschlossen');

      for (let value = 3; value >= 1; value -= 1) {
        if (overlay) {
          overlay.querySelector('.rt-count-value').textContent = String(value);
          overlay.querySelector('.rt-count-state').textContent = value === 1 ? 'Aufnahme startet jetzt' : 'Kalibrierung abgeschlossen';
        }
        await sleep(1000);
      }

      enterCaptureFullscreen();
      document.getElementById('start').click();
      const started = await waitUntil(isRunning, 12000);
      if (!started) throw new Error('Aufzeichnung konnte nicht bestätigt werden');
      document.body.classList.add('rt-confirmed-recording');
    } catch (error) {
      console.error('RideTracker Startfehler', error);
      await exitCaptureFullscreen();
      alert(`Start fehlgeschlagen: ${error.message}`);
    } finally {
      overlay?.classList.remove('active');
      starting = false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button) return;
    if (/Kalibrieren\s*&\s*Fahrt starten/i.test(button.textContent || '')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      calibratedStart();
      return;
    }
    const record = event.target.closest?.('[data-view="record"],[data-route="Neue Fahrt"]');
    if (record) requestAnimationFrame(restoreRecordingWorkspace);
    if (button.id === 'stop') {
      setTimeout(() => {
        document.body.classList.remove('rt-confirmed-recording');
        exitCaptureFullscreen();
      }, 120);
    }
  }, true);

  // Beim Verlassen der HUD-Konfiguration muss Kamera/Video zuverlässig zur Aufnahme zurückkehren.
  document.addEventListener('click', event => {
    if (!event.target.closest?.('#rtHudConfigView .rt-tool-back')) return;
    requestAnimationFrame(restoreRecordingWorkspace);
  }, true);

  const observer = new MutationObserver(() => {
    ensureCountdown();
    ensureFullscreenControls();
    if (document.body.classList.contains('rt-record-mode') && !document.getElementById('rtHudConfigView')?.contains(document.getElementById('rtHudWorkspace'))) {
      restoreRecordingWorkspace();
    }
    document.body.classList.toggle('rt-confirmed-recording', isRunning());
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });

  restoreRecordingWorkspace();
  ensureCountdown();
  ensureFullscreenControls();
})();
