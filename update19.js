(() => {
  'use strict';

  const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) { clearInterval(timer); resolve(value); }
      else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('Element nicht gefunden')); }
    }, 100);
  });

  function installStyles() {
    if (document.getElementById('rtShell19Style')) return;
    const style = document.createElement('style');
    style.id = 'rtShell19Style';
    style.textContent = `
      :root{--rt-top-safe:max(env(safe-area-inset-top),12px);--rt-bottom-safe:max(env(safe-area-inset-bottom),12px)}
      body{padding-top:calc(var(--rt-top-safe) + 58px)!important;padding-bottom:calc(var(--rt-bottom-safe) + 86px)!important}
      main{padding-top:14px!important}
      .rt-appbar{position:fixed;top:0;left:0;right:0;z-index:60000;height:calc(var(--rt-top-safe) + 58px);padding:var(--rt-top-safe) 12px 8px;display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:10px;background:rgba(6,15,27,.96);border-bottom:1px solid #29435f;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
      .rt-appbar button{min-width:44px;height:42px;padding:0 11px;border-radius:13px}.rt-app-title{min-width:0}.rt-app-title strong{display:block;font-size:18px}.rt-app-title span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#96aac1;font-size:11px}.rt-app-profile{max-width:145px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #rtUserBadge{display:none!important}
      .rt-nav-scrim{position:fixed;inset:0;z-index:60990;background:rgba(0,0,0,.52);display:none}.rt-nav-scrim.open{display:block}
      .rt-nav-drawer{position:fixed;z-index:61000;left:10px;top:calc(var(--rt-top-safe) + 62px);bottom:calc(var(--rt-bottom-safe) + 12px);width:min(330px,calc(100vw - 20px));padding:14px;border:1px solid #29435f;border-radius:20px;background:#091626;box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:auto;transform:translateX(calc(-100% - 24px));transition:transform .22s ease}.rt-nav-drawer.open{transform:translateX(0)}
      .rt-nav-drawer h2{margin:2px 4px 12px}.rt-nav-list{display:grid;gap:8px}.rt-nav-item{width:100%;display:grid;grid-template-columns:34px 1fr;gap:10px;text-align:left;align-items:center;padding:12px;border-radius:14px}.rt-nav-item i{font-style:normal;font-size:21px}.rt-nav-item span{display:grid}.rt-nav-item small{color:#96aac1;font-weight:500;margin-top:2px}
      .rt-view{padding-top:0!important}.rt-view .rt-shell{padding-top:10px!important}.rt-view .rt-head{position:sticky!important;top:calc(var(--rt-top-safe) + 58px)!important;z-index:200!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:10px 12px!important;margin:0 -1px 12px!important;background:rgba(7,17,31,.96)!important;backdrop-filter:blur(14px)!important}.rt-view .rt-back{position:static!important;flex:0 0 auto!important;margin-left:10px!important;min-width:78px!important}
      .rt-recording-banner{bottom:calc(var(--rt-bottom-safe) + 76px)!important;left:10px!important;right:10px!important;z-index:62000!important}
      @media(display-mode:standalone){body{padding-bottom:calc(var(--rt-bottom-safe) + 20px)!important}.rt-recording-banner{bottom:calc(var(--rt-bottom-safe) + 10px)!important}}
    `;
    document.head.appendChild(style);
  }

  function activeProfileName() {
    return window.RideTrackerProfiles?.activeProfile?.()?.name || 'Standardnutzer';
  }

  function findButton(text) {
    return [...document.querySelectorAll('button')].find(button => (button.textContent || '').includes(text));
  }

  function invokeMenu(name) {
    closeDrawer();
    const direct = {
      'Fahrten': () => findButton('Meine Fahrten')?.click(),
      'Karte': () => findButton('Karte')?.click(),
      'Statistiken': () => window.RideTrackerStats?.showStats?.(),
      'Achievements': () => window.RideTrackerStats?.showAchievements?.(),
      'Bilder': () => window.RideTrackerRideMedia?.showRideMedia?.(),
      'Profil': () => window.RideTrackerProfiles?.showProfiles?.()
    }[name];
    if (direct) return direct();
    if (name === 'Neue Fahrt') {
      document.querySelectorAll('.rt-view').forEach(view => view.remove());
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (name === 'Einstellungen') {
      document.querySelectorAll('.rt-view').forEach(view => view.remove());
      const target = document.getElementById('calMode') || document.getElementById('hudSize') || document.querySelector('.configGrid');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function closeDrawer() {
    document.getElementById('rtNavDrawer')?.classList.remove('open');
    document.getElementById('rtNavScrim')?.classList.remove('open');
  }

  function installAppBar() {
    if (document.getElementById('rtAppBar')) return;
    const bar = document.createElement('header');
    bar.id = 'rtAppBar'; bar.className = 'rt-appbar';
    bar.innerHTML = `<button id="rtMenuButton" aria-label="Menü öffnen">☰</button><div class="rt-app-title"><strong>RideTracker</strong><span>Fahrten · Telemetrie · Community</span></div><button id="rtTopProfile" class="rt-app-profile">👤 ${activeProfileName()}</button>`;
    document.body.appendChild(bar);

    const scrim = document.createElement('div'); scrim.id = 'rtNavScrim'; scrim.className = 'rt-nav-scrim'; scrim.onclick = closeDrawer;
    const drawer = document.createElement('nav'); drawer.id = 'rtNavDrawer'; drawer.className = 'rt-nav-drawer';
    const items = [
      ['🎢','Neue Fahrt','Aufzeichnung vorbereiten und starten'],['📁','Fahrten','Gespeicherte RidePackages öffnen'],['🗺️','Karte','Parks, Bahnen und Strecken'],['📈','Statistiken','Kilometer, Fahrzeit und Rekorde'],['🏆','Achievements','Persönliche Meilensteine'],['📷','Bilder','Bahnbilder und Bewertungen'],['👤','Profil','Benutzer wechseln und verwalten'],['⚙️','Einstellungen','HUD, Kalibrierung und Sensoren']
    ];
    drawer.innerHTML = `<h2>Menü</h2><div class="rt-nav-list">${items.map(([icon,title,sub]) => `<button class="rt-nav-item" data-route="${title}"><i>${icon}</i><span><b>${title}</b><small>${sub}</small></span></button>`).join('')}</div>`;
    drawer.querySelectorAll('[data-route]').forEach(button => button.onclick = () => invokeMenu(button.dataset.route));
    document.body.append(scrim, drawer);
    bar.querySelector('#rtMenuButton').onclick = () => { drawer.classList.add('open'); scrim.classList.add('open'); };
    bar.querySelector('#rtTopProfile').onclick = () => window.RideTrackerProfiles?.showProfiles?.();
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
  }

  function observeProfile() {
    setInterval(() => {
      const button = document.getElementById('rtTopProfile');
      if (button) button.textContent = `👤 ${activeProfileName()}`;
    }, 1000);
  }

  installStyles(); installAppBar(); observeProfile();
  waitFor(() => document.body).catch(() => {});
})();
