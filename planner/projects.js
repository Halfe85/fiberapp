/* Fiber Planner — project creation prototype, no SQL dependencies. */
(() => {
  'use strict';
  const KEY = 'fiberapp.planner.projects.v1';
  const button = document.getElementById('add-project');
  const dialog = document.getElementById('project-dialog');
  const form = document.getElementById('project-form');
  const input = document.getElementById('project-name');
  const desc = document.getElementById('project-description');
  const list = document.getElementById('project-list');
  const count = document.getElementById('project-count');
  const warning = document.getElementById('project-error');
  const formError = document.getElementById('project-form-error');
  if (!button || !dialog || !form || !list) return;
  const setError = (el, message) => {el.textContent = message; el.hidden = !message;};
  let projects = [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw Error('Ugyldige prosjektdata');
      projects = parsed.filter(p => p && typeof p.id === 'string' &&
        typeof p.name === 'string' && typeof p.createdAt === 'string');
    }
  } catch {
    button.disabled = true;
    setError(warning, 'Kunne ikke lese lagrede prosjekter. Eksisterende data er ikke overskrevet.');
  }
  function render() {
    list.replaceChildren();
    count.textContent = projects.length === 1 ? '1 prosjekt' : projects.length + ' prosjekter';
    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-projects';
      empty.innerHTML = '<span class="empty-plus" aria-hidden="true">+</span>' +
        '<h3>Ingen prosjekter ennå</h3><p>Trykk på + i headeren for å opprette et prosjekt.</p>';
      list.append(empty);
      return;
    }
    for (const project of [...projects].sort((a,b) => b.createdAt.localeCompare(a.createdAt))) {
      const row = document.createElement('article');
      row.className = 'project-row';
      const info = document.createElement('div');
      info.className = 'content';
      const name = document.createElement('strong');
      name.textContent = project.name;
      info.append(name);
      if (project.description) {
        const description = document.createElement('p');
        description.textContent = project.description;
        info.append(description);
      }
      const date = document.createElement('time');
      date.dateTime = project.createdAt;
      date.textContent = new Date(project.createdAt).toLocaleDateString('nb-NO');
      row.append(info, date);
      list.append(row);
    }
  }
  render();
  button.addEventListener('click', () => {
    form.reset();
    setError(formError, '');
    dialog.showModal();
    input.focus();
  });
  for (const id of ['project-close', 'project-cancel']) {
    document.getElementById(id).addEventListener('click', () => dialog.close());
  }
  dialog.addEventListener('click', e => {
    if (e.target === dialog) dialog.close();
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    const description = desc.value.trim();
    if (!name || name.length > 80 || description.length > 300) {
      setError(formError, 'Prosjektnavn må ha 1–80 tegn; beskrivelse maks 300.');
      return;
    }
    if (projects.some(p => p.name.toLocaleLowerCase('nb-NO') === name.toLocaleLowerCase('nb-NO'))) {
      setError(formError, 'Prosjektnavnet er allerede i bruk.');
      return;
    }
    const now = new Date().toISOString();
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
      : 'project-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const next = [{id, name, description, createdAt:now, updatedAt:now}, ...projects];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      projects = next;
      render();
      dialog.close();
      setError(warning, '');
    } catch {
      setError(formError, 'Kunne ikke lagre prosjektet. Kontroller nettleserlagringen.');
    }
  });
})();
