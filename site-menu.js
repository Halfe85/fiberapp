/* Simple shared menu for the three static GitHub Pages pages. */
(() => {
  const button = document.querySelector('.menu-toggle');
  const menu = document.getElementById('site-menu');
  if (!button || !menu) return;
  function setOpen(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Lukk meny' : 'Åpne meny');
  }
  button.addEventListener('click', () => setOpen(menu.hidden));
  document.addEventListener('pointerdown', event => {
    if (!menu.hidden && !button.contains(event.target) && !menu.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  menu.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });
})();
