/* Fiber Planner: fixed project tiles with a sliding wrench door on the right. */
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
  const deleteOpen = document.getElementById('project-delete-open');
  const deleteForm = document.getElementById('project-delete-form');
  const deleteInput = document.getElementById('project-delete-name');
  const deleteTarget = document.getElementById('project-delete-target');
  const deleteConfirm = document.getElementById('project-delete-confirm');
  const deleteError = document.getElementById('project-delete-error');
  const deleteBack = document.getElementById('project-delete-back');
  if (!button || !dialog || !form || !list || !deleteForm || !deleteInput || !deleteConfirm) return;
  const setError = (el, message) => {el.textContent = message; el.hidden = !message;};
  const wrenchSvg = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-7.8 7.8a2.12 2.12 0 0 1-3-3l7.8-7.8a6 6 0 0 1 7.9-7.9z\"/></svg>";
  let projects = [];
  let openId = null;
  let doorTimer = null;
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
  // Mobile uses a tap-controlled door; desktop keeps its zone-only hover.
  const isTouchLayout = () => window.matchMedia?.(
    '(hover: none), (pointer: coarse), (max-width: 699px)'
  ).matches ?? false;
  function closeTools() {
    if (doorTimer !== null) clearTimeout(doorTimer);
    doorTimer = null;
    openId = null;
    for (const row of list.querySelectorAll('.project-swipe')) {
      row.classList.remove('open');
      row.querySelector('.project-door')?.setAttribute('aria-expanded','false');
    }
  }
  function showTools(id) {
    if (openId === id) {
      closeTools();
      return;
    }
    closeTools(); // Only one project can expose its settings action.
    openId = id;
    for (const row of list.querySelectorAll('.project-swipe')) {
      const opened=row.dataset.projectId === id;
      row.classList.toggle('open', opened);
      row.querySelector('.project-door')?.setAttribute('aria-expanded',String(opened));
    }
    if (isTouchLayout()) {
      doorTimer = setTimeout(() => closeTools(), 3000);
    }
  }
  function resetDeleteView() {
    deleteForm.hidden = true;
    form.hidden = false;
    deleteInput.value = '';
    deleteConfirm.disabled = true;
    setError(deleteError, '');
  }
  function startSettings(project) {
    closeTools();
    resetDeleteView();
    deleteOpen.hidden = false;
    editingId = project.id;
    title.textContent = 'Prosjektinnstillinger';
    submit.textContent = 'Lagre endringer';
    input.value = project.name;
    desc.value = project.description || '';
    setError(formError, '');
    dialog.showModal();
    input.focus();
  }
  function openProjectMap(id) {
    if(!projects.some(project=>project.id===id))return;
    location.assign('./map.html?project='+encodeURIComponent(id));
  }
  function projectRow(project) {
    const wrap = document.createElement('div');
    wrap.className = 'project-swipe';
    wrap.dataset.projectId = project.id;

    const action = document.createElement('div');
    action.className = 'project-action-zone';
    const tool = document.createElement('button');
    tool.type = 'button';
    tool.className = 'project-tool';
    tool.setAttribute('aria-label', 'Innstillinger for ' + project.name);
    tool.title = 'Prosjektinnstillinger';
    tool.innerHTML = wrenchSvg;
    tool.addEventListener('click', () => startSettings(project));
    const door = document.createElement('button');
    door.type = 'button';
    door.className = 'project-door';
    door.setAttribute('aria-label','Vis innstillinger for '+project.name);
    door.setAttribute('aria-expanded','false');
    door.title = 'Vis prosjektinnstillinger';
    door.addEventListener('click', event => {
      event.stopPropagation();
      showTools(project.id);
      // Touch clicks leave focus behind; it must not force the door open.
      if(event.detail !== 0)door.blur();
    });
    action.append(tool, door);

    const row = document.createElement('article');
    row.className = 'project-row';
    row.setAttribute('role','button');
    row.setAttribute('tabindex','0');
    row.setAttribute('aria-label','Åpne kart for '+project.name);
    row.addEventListener('click',()=>openProjectMap(project.id));
    row.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();openProjectMap(project.id);
      }
    });
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
    wrap.append(row, action);

    return wrap;
  }
  function render() {
    closeTools();
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
      list.append(projectRow(project));
    }
  }
  render();
  button.addEventListener('click', () => {
    resetDeleteView();
    deleteOpen.hidden = true;
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
  dialog.addEventListener('close', () => {
    editingId = null;
    resetDeleteView();
  });
  deleteOpen.addEventListener('click', () => {
    const project = projects.find(p => p.id === editingId);
    if (!project || !storageAvailable) {
      setError(formError, 'Prosjektet finnes ikke lenger eller lokal lagring er utilgjengelig.');
      return;
    }
    title.textContent = 'Slett prosjekt';
    deleteTarget.textContent = project.name;
    setError(deleteError, '');
    deleteInput.value = '';
    deleteConfirm.disabled = true;
    form.hidden = true;
    deleteForm.hidden = false;
    deleteInput.focus();
  });
  deleteBack.addEventListener('click', () => {
    resetDeleteView();
    title.textContent = 'Prosjektinnstillinger';
    input.focus();
  });
  deleteInput.addEventListener('input', () => {
    const project = projects.find(p => p.id === editingId);
    deleteConfirm.disabled = !storageAvailable || !project || deleteInput.value !== project.name;
    setError(deleteError, '');
  });
  deleteForm.addEventListener('submit', event => {
    event.preventDefault();
    const project = projects.find(p => p.id === editingId);
    if (!storageAvailable || !project || deleteInput.value !== project.name) {
      setError(deleteError, 'Prosjektnavnet må være identisk med det som vises over.');
      return;
    }
    const next = projects.filter(p => p.id !== project.id);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      projects = next;
      render();
      dialog.close();
      setError(warning, '');
    } catch {
      setError(deleteError, 'Prosjektet kunne ikke slettes. Kontroller nettleserlagringen.');
    }
  });
  document.addEventListener('pointerdown', event => {
    if (openId && !event.target.closest('.project-swipe')) closeTools();
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
      ? projects.map(p => {
          if(p.id!==editingId)return p;
          const {postcode: _legacy, ...withoutPostcode}=p;
          return {...withoutPostcode,name,description,updatedAt:now};
        })
      : [{id,name,description,createdAt:now,updatedAt:now},...projects];
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
