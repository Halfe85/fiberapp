/* Fiber Planner project items — UI-first localStorage storage, no SQL. */
(() => {
  'use strict';
  const KEY = 'fiberapp.planner.items.v1';
  const wrapper = document.getElementById('project-actions');
  const toggle = document.getElementById('project-add-toggle');
  const menu = document.getElementById('project-add-menu');
  const dialog = document.getElementById('project-item-dialog');
  const form = document.getElementById('project-item-form');
  const modalTitle = document.getElementById('project-item-title');
  const name = document.getElementById('project-item-name');
  const nameLabel = document.getElementById('project-item-name-label');
  const note = document.getElementById('project-item-note');
  const typeFields = document.getElementById('project-equipment-type-fields');
  const equipmentType = document.getElementById('project-equipment-type');
  const errorBox = document.getElementById('project-item-error');
  const itemsContainer = document.getElementById('project-items');
  const sections = {
    address: {
      section: document.getElementById('project-addresses-section'),
      list: document.getElementById('project-addresses')
    },
    equipment: {
      section: document.getElementById('project-equipment-section'),
      list: document.getElementById('project-equipment')
    }
  };
  if (!wrapper || !toggle || !menu || !dialog || !form) return;
  let rows = [];
  let currentProjectId = null;
  let currentKind = null;
  let canSave = true;

  function error(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }
  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  function selectedProject() {
    const projectId = new URL(location.href).searchParams.get('project');
    if (!projectId || wrapper.hidden) return null;
    return projectId;
  }
  function reload() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { rows = []; return; }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Ugyldige data');
      rows = parsed.filter(item => item && typeof item.id === 'string' &&
        typeof item.projectId === 'string' && ['address','equipment'].includes(item.kind) &&
        typeof item.name === 'string');
    } catch {
      canSave = false;
      toggle.disabled = true;
      rows = [];
      console.error('Fiber Planner: kan ikke lese lagrede adresser eller utstyr.');
    }
  }
  function render() {
    currentProjectId = selectedProject();
    closeMenu();
    if (!currentProjectId && dialog.open) dialog.close();
    for (const kind of ['address', 'equipment']) {
      const target = sections[kind];
      target.list.replaceChildren();
      const found = rows.filter(item => item.projectId === currentProjectId && item.kind === kind);
      target.section.hidden = !found.length;
      for (const item of found) {
        const article = document.createElement('article');
        article.className = 'project-item';
        const strong = document.createElement('strong');
        strong.textContent = item.name;
        article.append(strong);
        if (kind === 'equipment' && item.equipmentType) {
          const type = document.createElement('span');
          type.className = 'project-item-type';
          type.textContent = item.equipmentType;
          article.append(type);
        }
        if (item.note) {
          const detail = document.createElement('p');
          detail.textContent = item.note;
          article.append(detail);
        }
        target.list.append(article);
      }
    }
    itemsContainer.hidden = !currentProjectId ||
      (sections.address.section.hidden && sections.equipment.section.hidden);
  }
  function openModal(kind) {
    closeMenu();
    const projectId = selectedProject();
    if (!projectId || !canSave) return;
    currentProjectId = projectId;
    currentKind = kind;
    form.reset();
    error('');
    modalTitle.textContent = kind === 'address' ? 'Ny adresse' : 'Nytt utstyr';
    nameLabel.textContent = kind === 'address' ? 'Adresse *' : 'Utstyrsnavn / ID *';
    name.placeholder = kind === 'address' ? 'Gateadresse' : 'F.eks. ODF-01';
    typeFields.hidden = kind !== 'equipment';
    dialog.showModal();
    name.focus();
  }
  reload();
  render();
  window.addEventListener('fiberapp:planner-project-changed', render);
  window.addEventListener('popstate', render);

  toggle.addEventListener('click', () => {
    if (!canSave || !selectedProject()) return;
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.getElementById('add-address').addEventListener('click', () => openModal('address'));
  document.getElementById('add-equipment').addEventListener('click', () => openModal('equipment'));
  document.addEventListener('pointerdown', event => {
    if (!wrapper.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
      toggle.focus();
    }
  });
  document.getElementById('project-item-close').addEventListener('click', () => dialog.close());
  document.getElementById('project-item-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const projectId = selectedProject();
    const label = name.value.trim().replace(/\s+/g, ' ');
    const noteText = note.value.trim();
    if (!canSave || !currentKind || !projectId || projectId !== currentProjectId) return;
    if (!label || label.length > 120 || noteText.length > 300) {
      error('Navnet må ha 1–120 tegn, beskrivelse maks 300 tegn.');
      return;
    }
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
      : 'item-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const next = [...rows, {
      id,projectId,kind:currentKind,name:label,
      note:noteText,
      equipmentType:currentKind === 'equipment' ? equipmentType.value : '',
      createdAt:new Date().toISOString()
    }];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      rows = next;
      dialog.close();
      render();
    } catch {
      error('Kunne ikke lagre. Kontroller nettleserlagringen.');
    }
  });
})();
