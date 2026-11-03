/* Fiber Planner project list: hover on desktop, swipe on touch, wrench settings. */
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
  const title = document.getElementById('project-dialog-title');
  const submit = form.querySelector('button[type="submit"]');
  if (!button || !dialog || !form || !list) return;
  const setError = (el, message) => {el.textContent = message; el.hidden = !message;};
  const wrenchSvg = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-7.8 7.8a2.12 2.12 0 0 1-3-3l7.8-7.8a6 6 0 0 1 7.9-7.9z\"/></svg>";
  let projects = [];
  let openId = null;
  let editingId = null;
  let storageAvailable = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw Error('Ugyldige prosjektdata');
      projects = parsed.filter(p => p && typeof p.id === 'string' &&
        typeof p.name === 'string' && typeof p.createdAt === 'string');
    }
  } catch {
    storageAvailable = false;
    button.disabled = true;
    setError(warning, 'Kunne ikke lese lagrede prosjekter. Eksisterende data er ikke overskrevet.');
  }
  function showTools(id) {
    openId = openId === id ? null : id;
    for (const row of list.querySelectorAll('.project-swipe')) {
      const open = row.dataset.projectId === openId;
      row.classList.toggle('open', open);
    }
  }
  function startSettings(project) {
    editingId = project.id;
    title.textContent = 'Prosjektinnstillinger';
    submit.textContent = 'Lagre endringer';
    input.value = project.name;
    desc.value = project.description || '';
    setError(formError, '');
    dialog.showModal();
    input.focus();
  }
  function projectRow(project) {
    const wrap = document.createElement('div');
    wrap.className = 'project-swipe';
    wrap.dataset.projectId = project.id;

    const tool = document.createElement('button');
    tool.type = 'button';
    tool.className = 'project-tool';
    tool.setAttribute('aria-label', 'Innstillinger for ' + project.name);
    tool.title = 'Prosjektinnstillinger';
    tool.innerHTML = wrenchSvg;
    tool.addEventListener('click', () => startSettings(project));

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
    wrap.append(tool, row);

    let start = null;
    wrap.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.project-tool')) return;
      start = { x:event.clientX, y:event.clientY, id:event.pointerId };
    });
    wrap.addEventListener('pointerup', event => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0 && openId !== project.id) showTools(project.id);
      else if (dx > 0 && openId === project.id) showTools(project.id);
    });
    wrap.addEventListener('pointercancel', () => {start = null;});
    return wrap;
  }
  function render() {
    list.replaceChildren();
    openId = null;
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
      list.append(projectRow(project));
    }
  }
  render();
  button.addEventListener('click', () => {
    editingId = null;
    title.textContent = 'Nytt prosjekt';
    submit.textContent = 'Opprett prosjekt';
    form.reset();
    setError(formError, '');
    dialog.showModal();
    input.focus();
  });
  for (const id of ['project-close', 'project-cancel']) {
    document.getElementById(id).addEventListener('click', () => dialog.close());
  }
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {editingId = null;});
  document.addEventListener('pointerdown', event => {
    if (openId && !event.target.closest('.project-swipe')) showTools(openId);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!storageAvailable) return;
    const name = input.value.trim().replace(/\s+/g, ' ');
    const description = desc.value.trim();
    if (!name || name.length > 80 || description.length > 300) {
      setError(formError, 'Prosjektnavn må ha 1–80 tegn; beskrivelse maks 300.');
      return;
    }
    if (projects.some(p => p.id !== editingId &&
        p.name.toLocaleLowerCase('nb-NO') === name.toLocaleLowerCase('nb-NO'))) {
      setError(formError, 'Prosjektnavnet er allerede i bruk.');
      return;
    }
    const now = new Date().toISOString();
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
      : 'project-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const next = editingId
      ? projects.map(p => p.id === editingId ? {...p, name, description, updatedAt:now} : p)
      : [{id, name, description, createdAt:now, updatedAt:now}, ...projects];
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
