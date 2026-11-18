import { icon } from './icons.js';

export class ProjectManager {
  constructor(api) { this.api = api; this.trashOpen = false; this.busy = false; }
  get state() { return this.api.getState(); }
  get profile() { return this.api.profile; }

  render() {
    const $ = id => document.getElementById(id), blocked = this.api.blocked() || this.state.loading || this.busy;
    const rows = this.profile.projects.map(project => {
      const row = document.createElement('div'); row.className = 'project-row';
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'project-item' + (this.state.kind === 'project' && this.state.id === project.id ? ' current' : ''); button.dataset.project = project.id;
      const symbol = document.createElement('span'); symbol.className = 'motion-icon'; symbol.innerHTML = icon('key');
      const text = document.createElement('span'); text.className = 'motion-name';
      const title = document.createElement('strong'); title.textContent = project.name;
      const subtitle = document.createElement('small'); subtitle.textContent = 'Saved take'; text.append(title, subtitle); button.append(symbol, text);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button project-delete';
      remove.dataset.deleteProject = project.id; remove.setAttribute('aria-label', 'Delete project ' + project.name);
      remove.title = 'Move to Trash'; remove.innerHTML = icon('trash'); remove.disabled = blocked;
      row.append(button, remove); return row;
    });
    if (!rows.length) { const empty = document.createElement('p'); empty.className = 'empty-projects'; empty.textContent = 'Create an animation, open a project file or import a clip to start.'; rows.push(empty); }
    $('project-list').replaceChildren(...rows);
    const deleted = this.profile.trash.map(project => {
      const row = document.createElement('div'); row.className = 'project-row deleted-project';
      const text = document.createElement('span'); text.className = 'motion-name';
      const title = document.createElement('strong'); title.textContent = project.name;
      const subtitle = document.createElement('small'); subtitle.textContent = 'In Trash'; text.append(title, subtitle);
      const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'button small';
      restore.dataset.restoreProject = project.id; restore.textContent = 'Restore'; restore.setAttribute('aria-label', 'Restore project ' + project.name); restore.disabled = blocked;
      row.append(text, restore); return row;
    });
    if (!deleted.length) { const empty = document.createElement('p'); empty.className = 'empty-projects'; empty.textContent = 'No deleted projects. Projects moved here can be restored at any time.'; deleted.push(empty); }
    $('project-trash').replaceChildren(...deleted);
    $('project-trash-toggle').innerHTML = icon(this.trashOpen ? 'arrow' : 'trash');
    const label = document.createElement('span'); label.textContent = this.trashOpen ? 'Back to projects' : 'Trash (' + this.profile.trash.length + ')'; $('project-trash-toggle').append(label);
  }

  setTab(tab) {
    const $ = id => document.getElementById(id), projects = tab === 'projects';
    $('motion-library').hidden = projects; $('project-list').hidden = !projects || this.trashOpen;
    $('project-trash').hidden = !projects || !this.trashOpen; $('project-trash-toggle').hidden = !projects;
    $('library-title').textContent = projects ? this.trashOpen ? 'Deleted projects' : 'Your animations' : 'Reference library';
    $('library-count').textContent = projects ? this.trashOpen ? this.profile.trash.length : this.profile.projects.length : this.api.studyCount;
    for (const button of document.querySelectorAll('[data-workspace]')) {
      const active = button.dataset.workspace === tab; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    }
  }

  async register(record) {
    if (!this.profile.projects.some(item => item.id === record.id)) this.profile.projects.push({ id: record.id, name: record.name });
    this.api.cache(record); this.api.persist();
    return this.api.write(record);
  }

  async remove(id) {
    if (this.api.blocked() || this.state.loading || this.busy) return;
    const position = this.profile.projects.findIndex(project => project.id === id); if (position < 0) return;
    const project = this.profile.projects[position]; this.busy = true; this.api.refresh();
    try {
      if (this.state.kind === 'project' && this.state.id === id) { if (!await this.api.loadStudy(this.profile.studyId)) return; }
      this.profile.projects = this.profile.projects.filter(item => item.id !== id);
      this.profile.trash = [...this.profile.trash.filter(item => item.id !== id), { ...project, position, deletedAt: Date.now() }];
      if (this.profile.projectId === id) this.profile.projectId = this.profile.projects.at(-1)?.id ?? null;
      this.trashOpen = false; this.api.persist(); this.render(); this.setTab('projects');
      this.api.toast('“' + project.name + '” moved to Trash.', { label: 'Undo', run: () => this.restore(id) });
    } finally { this.busy = false; this.api.refresh(); }
  }

  restore(id) {
    if (this.api.blocked() || this.state.loading || this.busy) return;
    const project = this.profile.trash.find(item => item.id === id); if (!project) return;
    if (!this.profile.projects.some(item => item.id === id)) this.profile.projects.splice(Math.max(0, Math.min(this.profile.projects.length, project.position ?? this.profile.projects.length)), 0, { id: project.id, name: project.name });
    this.profile.trash = this.profile.trash.filter(item => item.id !== id); this.trashOpen = false;
    this.api.persist(); this.render(); this.setTab('projects'); this.api.refresh(); this.api.toast('“' + project.name + '” restored.');
  }

  async copy() {
    if (!this.state.editor || this.api.blocked() || this.busy) return;
    const record = this.api.capture(); record.id = crypto.randomUUID(); record.kind = 'project'; record.name += ' · copy';
    this.busy = true; this.api.refresh();
    try { const stored = await this.register(record); this.render(); this.api.toast(stored ? 'Take saved as a separate project.' : 'Copy kept for this session. Retry the local save or save a project file.'); }
    finally { this.busy = false; this.api.refresh(); }
  }
}
