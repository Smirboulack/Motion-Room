export class WorkspaceLayout {
  constructor(root, workspace, storage = localStorage) {
    this.root = root; this.workspace = workspace; this.storage = storage; this.focused = false;
    try { this.values = JSON.parse(storage.getItem('motion-room-layout-v1')) ?? {}; } catch { this.values = {}; }
    this.values.library = Math.max(180, Math.min(360, Number(this.values.library) || 213));
    this.values.inspector = Math.max(260, Math.min(460, Number(this.values.inspector) || 291));
    this.values.timeline = Math.max(300, Math.min(Math.max(300, root.clientHeight - 320), Number(this.values.timeline) || 400));
    this.apply();
    this.makeHandle('library', root, 'Resize library', 'vertical');
    this.makeHandle('inspector', root, 'Resize inspector', 'vertical');
    this.makeHandle('timeline', document.querySelector('.timeline'), 'Resize timeline', 'horizontal');
    window.addEventListener('resize', () => { this.values.timeline = Math.min(this.values.timeline, Math.max(300, root.clientHeight - 320)); this.apply(); });
    document.getElementById('focus-workspace').addEventListener('click', () => this.focus());
    document.getElementById('reset-workspace-layout').addEventListener('click', () => {
      this.values = { library: 213, inspector: 291, timeline: 400 }; this.apply(); this.save();
    });
  }

  save() { try { this.storage.setItem('motion-room-layout-v1', JSON.stringify(this.values)); } catch { /* Layout is optional. */ } }

  apply() {
    this.root.style.setProperty('--library-width', this.values.library + 'px');
    this.root.style.setProperty('--inspector-width', this.values.inspector + 'px');
    this.workspace.style.setProperty('--advanced-height', this.values.timeline + 'px');
    for (const kind of ['library', 'inspector', 'timeline']) {
      const handle = document.getElementById('resize-' + kind);
      handle?.setAttribute('aria-valuenow', this.values[kind]); handle?.setAttribute('aria-valuetext', this.values[kind] + ' pixels');
    }
  }

  makeHandle(kind, parent, label, orientation) {
    const handle = document.createElement('div'); handle.id = 'resize-' + kind; handle.className = 'panel-resizer ' + kind + '-resizer';
    handle.tabIndex = 0; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-label', label);
    handle.setAttribute('aria-orientation', orientation); handle.setAttribute('aria-valuenow', this.values[kind]);
    const limits = () => kind === 'timeline' ? [300, Math.max(300, this.root.clientHeight - 320)] : kind === 'library' ? [180, 360] : [260, 460];
    handle.setAttribute('aria-valuemin', limits()[0]); handle.setAttribute('aria-valuemax', limits()[1]);
    const set = value => { const [min, max] = limits(); this.values[kind] = Math.round(Math.max(min, Math.min(max, value))); this.apply(); };
    let drag;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); drag = { x: event.clientX, y: event.clientY, value: this.values[kind] };
      handle.setPointerCapture(event.pointerId); this.root.classList.add('resizing-panels');
    });
    handle.addEventListener('pointermove', event => {
      if (!drag) return;
      set(drag.value + (kind === 'timeline' ? drag.y - event.clientY : kind === 'inspector' ? drag.x - event.clientX : event.clientX - drag.x));
    });
    const end = () => { if (drag) { drag = null; this.root.classList.remove('resizing-panels'); this.save(); } };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const positive = kind === 'library' ? event.key === 'ArrowRight' : kind === 'inspector' ? event.key === 'ArrowLeft' : event.key === 'ArrowUp';
      set(this.values[kind] + (positive ? 10 : -10)); this.save();
    });
    parent.append(handle);
  }

  focus() {
    this.focused = !this.focused; this.root.classList.toggle('focus-workspace', this.focused);
    const button = document.getElementById('focus-workspace'); button.setAttribute('aria-pressed', this.focused);
    button.textContent = this.focused ? 'Restore panels' : 'Focus view';
  }
}
