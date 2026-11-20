// Opens a screenshot large in a native <dialog>. Without this script each
// screenshot is a plain link to its full-size file.

const dialog = document.getElementById('lightbox');
const shots = [...document.querySelectorAll('a.shot')];

if (dialog && typeof dialog.showModal === 'function' && shots.length) {
  const el = {
    title: dialog.querySelector('#lightbox-title'),
    stage: dialog.querySelector('#lightbox-stage'),
    caption: dialog.querySelector('#lightbox-caption'),
    steps: dialog.querySelector('#lightbox-steps'),
    count: dialog.querySelector('#lightbox-count'),
    prev: dialog.querySelector('#lightbox-prev'),
    next: dialog.querySelector('#lightbox-next'),
    close: dialog.querySelector('#lightbox-close'),
  };
  const image = document.createElement('img');
  image.decoding = 'async';
  el.stage.append(image);

  let set = [];
  let index = 0;

  // The screenshots that belong together: everything in the same plate set.
  const setOf = (shot) => {
    const group = shot.closest('.plate-set');
    return group ? [...group.querySelectorAll('a.shot')] : [shot];
  };

  function show(at) {
    index = (at + set.length) % set.length;
    const shot = set[index];
    const thumb = shot.querySelector('img');
    const name = shot.querySelector('.shot-name');
    const note = document.getElementById(shot.dataset.caption || '');

    image.alt = thumb ? thumb.alt : '';
    if (thumb) {
      image.width = thumb.getAttribute('width');
      image.height = thumb.getAttribute('height');
    }
    image.src = shot.href;

    el.title.replaceChildren(...(name ? [...name.cloneNode(true).childNodes] : []));
    el.caption.textContent = note ? note.textContent.trim() : '';
    el.steps.hidden = set.length < 2;
    el.count.textContent = `${index + 1} of ${set.length}`;

    // The frame takes the colour of the project the screenshot belongs to.
    const accent = getComputedStyle(shot).getPropertyValue('--accent').trim();
    if (accent) dialog.style.setProperty('--accent', accent);
    else dialog.style.removeProperty('--accent');
  }

  function open(shot) {
    set = setOf(shot);
    show(set.indexOf(shot));
    dialog.showModal();
    el.close.focus();
  }

  shots.forEach((shot) => {
    shot.setAttribute('aria-haspopup', 'dialog');
    shot.addEventListener('click', (event) => {
      // Leave modified clicks alone so the file can still open in a new tab.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault();
      open(shot);
    });
  });

  el.prev.addEventListener('click', () => show(index - 1));
  el.next.addEventListener('click', () => show(index + 1));
  el.close.addEventListener('click', shut);

  dialog.addEventListener('keydown', (event) => {
    if (set.length < 2) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
  });

  // A click on the dark surround, outside the frame, closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) shut();
  });

  // Esc arrives as a cancel event. Closing it here keeps one path for every way out.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    shut();
  });
  dialog.addEventListener('close', () => { if (!dialog.open) giveFocusBack(); });

  function shut() {
    if (dialog.open) dialog.close();
    giveFocusBack();
  }

  // Focus goes back to the thumbnail of the screenshot last shown.
  function giveFocusBack() {
    const shot = set[index];
    image.removeAttribute('src');
    set = [];
    if (shot) shot.focus();
  }
}
