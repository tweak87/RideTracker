(() => {
  const wrap = document.getElementById('videoWrap');
  const editor = document.getElementById('rtHudEditor');
  const canvas = document.getElementById('rtHudCanvas');
  if (!wrap || !editor || !canvas) return;

  const style = document.createElement('style');
  style.id = 'rtHudDockStyle';
  style.textContent = `
    #rtHudWorkspace{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start;width:100%}
    #rtHudWorkspace.editor-open{grid-template-columns:minmax(0,1fr) minmax(300px,380px)}
    #rtHudVideoColumn{min-width:0}
    #rtHudEditor{
      position:relative!important;inset:auto!important;margin:0!important;width:100%!important;max-width:none!important;
      max-height:min(78vh,900px)!important;z-index:10!important;box-sizing:border-box!important;
      border-radius:16px!important;box-shadow:none!important;display:none!important;
    }
    #rtHudEditor.open{display:block!important}
    #rtHudCanvas.editing{pointer-events:auto!important;touch-action:none!important;cursor:move!important}
    #rtHudCanvas.editing + *{}
    #rtHudDragState{display:none;margin:8px 0 0;padding:8px 10px;border:1px solid #00e5ff;border-radius:10px;background:rgba(0,229,255,.10);color:#f5fbff;font:600 12px system-ui}
    #rtHudWorkspace.drag-active #rtHudDragState{display:block}
    #rtHudWorkspace.drag-active #videoWrap{outline:2px solid #00e5ff;outline-offset:3px}
    @media(max-width:900px){
      #rtHudWorkspace.editor-open{grid-template-columns:1fr}
      #rtHudEditor{max-height:none!important}
    }
  `;
  document.head.appendChild(style);

  let workspace = document.getElementById('rtHudWorkspace');
  if (!workspace) {
    workspace = document.createElement('div');
    workspace.id = 'rtHudWorkspace';
    const videoColumn = document.createElement('div');
    videoColumn.id = 'rtHudVideoColumn';
    const parent = wrap.parentElement;
    parent.insertBefore(workspace, wrap);
    workspace.appendChild(videoColumn);
    videoColumn.appendChild(wrap);
    workspace.appendChild(editor);

    const dragState = document.createElement('div');
    dragState.id = 'rtHudDragState';
    dragState.textContent = 'Verschiebemodus aktiv: Element direkt im Videobild antippen und ziehen.';
    videoColumn.appendChild(dragState);
  }

  const syncState = () => {
    const open = editor.classList.contains('open');
    const editing = canvas.classList.contains('editing');
    workspace.classList.toggle('editor-open', open);
    workspace.classList.toggle('drag-active', open && editing);
    canvas.style.pointerEvents = open && editing ? 'auto' : 'none';
    canvas.style.touchAction = open && editing ? 'none' : 'auto';
  };

  new MutationObserver(syncState).observe(editor, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(syncState).observe(canvas, { attributes: true, attributeFilter: ['class'] });

  editor.addEventListener('click', event => {
    if (event.target?.id === 'rtDragMode') requestAnimationFrame(syncState);
    if (event.target?.id === 'rtCloseEditor') requestAnimationFrame(syncState);
  });

  canvas.addEventListener('pointerdown', event => {
    if (!canvas.classList.contains('editing')) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });

  syncState();
})();
