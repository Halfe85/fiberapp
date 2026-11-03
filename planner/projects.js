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
  const projectsView = document.querySelector('.projects-view');
  const workspace = document.getElementById('project-workspace');
  const workspaceTitle = document.getElementById('workspace-title');
  const workspaceDescription = document.getElementById('workspace-description');
  const backButton = document.getElementById('project-back');
  const plannerHeader = document.querySelector('.planner-header');
  const itemActions = document.getElementById('project-actions');
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
      row.classList.toggle('open', row.dataset.projectId === openId);
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
  function showSelectedProject() {
    const id = new URL(location.href).searchParams.get('project');
    const selected = projects.find(p => p.id === id);
    projectsView.hidden = Boolean(selected);
    workspace.hidden = !selected;
    button.hidden = Boolean(selected);
    backButton.hidden = !selected;
    itemActions.hidden = !selected;
    plannerHeader.classList.toggle('project-open', Boolean(selected));
    window.dispatchEvent(new CustomEvent('fiberapp:planner-project-changed', {
      detail: {projectId: selected ? selected.id : null}
    }));
    document.getElementById('main').setAttribute('aria-label', selected ? selected.name : 'Prosjekter');
    document.title = selected ? selected.name + ' | Fiber Planner' : 'Fiber Planner | Fiberapp';
    if (!selected) return;
    workspaceTitle.textContent = selected.name;
    workspaceDescription.textContent = selected.description || '';
    workspaceDescription.hidden = !selected.description;
  }
  function openProject(id) {
    if (!projects.some(p => p.id === id)) return;
    const url = new URL(location.href);
    url.searchParams.set('project', id);
    history.pushState(null, '', url);
    showSelectedProject();
    document.getElementById('main').scrollTop = 0;
    workspaceTitle.focus({preventScroll:true});
  }
  function backToProjects() {
    const url = new URL(location.href);
    url.searchParams.delete('project');
    history.pushState(null, '', url);
    showSelectedProject();
    document.getElementById('main').scrollTop = 0;
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
    const door = document.createElement('span');
    door.className = 'project-door';
    door.setAttribute('aria-hidden', 'true');
    action.append(tool, door);

    const row = document.createElement('article');
    row.className = 'project-row';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', 'Åpne prosjekt: ' + project.name);
    let swipeConsumed = false;
    row.addEventListener('pointerdown', () => { swipeConsumed = false; });
    row.addEventListener('click', () => {
      if (swipeConsumed) { swipeConsumed = false; return; }
      openProject(project.id);
    });
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProject(project.id);
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

    let start = null;
    wrap.addEventListener('pointerdown', event => {
      // Mouse users only reveal the wrench by hovering its right-hand zone.
      if (event.pointerType === 'mouse' || event.button !== 0 ||
          event.target.closest('.project-action-zone')) return;
      start = { x:event.clientX, y:event.clientY, id:event.pointerId };
    });
    wrap.addEventListener('pointerup', event => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      swipeConsumed = true;
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
  showSelectedProject();
  backButton.addEventListener('click', backToProjects);
  window.addEventListener('popstate', showSelectedProject);
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
      showSelectedProject();
      dialog.close();
      setError(warning, '');
    } catch {
      setError(deleteError, 'Prosjektet kunne ikke slettes. Kontroller nettleserlagringen.');
    }
  });
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
      showSelectedProject();
      dialog.close();
      setError(warning, '');
    } catch {
      setError(formError, 'Kunne ikke lagre prosjektet. Kontroller nettleserlagringen.');
    }
  });
})();
