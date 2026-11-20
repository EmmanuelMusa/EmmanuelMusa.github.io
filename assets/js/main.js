// Navigation, the header axis cursor, the mobile menu and the section rules.

const head = document.getElementById('site-head');
const nav = document.getElementById('site-nav');
const menuButton = document.querySelector('.menu-btn');

// ----- mobile menu -----

if (nav && menuButton) {
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
  };
  menuButton.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
      menuButton.focus();
    }
  });
}

// ----- the axis cursor: shows where the reader is along the page -----

if (head && nav) {
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const sections = links
    .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);
  const cursor = nav.querySelector('.axis-cursor');
  const scale = head.querySelector('.head-scale-cursor');
  let tops = [];
  let stops = [];
  let queued = false;
  let active = -1;

  const measure = () => {
    const offset = window.scrollY;
    tops = [0, ...sections.map((section) => section.getBoundingClientRect().top + offset)];
    const navLeft = nav.getBoundingClientRect().left;
    stops = [0, ...links.map((link) => {
      const box = link.getBoundingClientRect();
      return box.left - navLeft + box.width / 2;
    })];
  };

  const update = () => {
    queued = false;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    // The probe slides from the top of the window to the bottom as the page scrolls,
    // so the first section is active at the top and the last at the very end.
    const probe = window.scrollY + progress * window.innerHeight;

    let index = 0;
    for (let i = 0; i < tops.length; i++) if (probe >= tops[i] - 1) index = i;
    const start = tops[index];
    const end = index + 1 < tops.length ? tops[index + 1] : document.documentElement.scrollHeight;
    const within = end > start ? Math.min(1, Math.max(0, (probe - start) / (end - start))) : 0;

    if (cursor && stops.length) {
      const from = stops[index];
      const to = index + 1 < stops.length ? stops[index + 1] : stops[index];
      cursor.style.setProperty('--x', `${(from + (to - from) * within).toFixed(1)}px`);
    }
    if (scale) scale.style.setProperty('--p', progress.toFixed(4));

    if (index !== active) {
      active = index;
      links.forEach((link, i) => {
        if (i === index - 1) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }
  };

  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  const remeasure = () => {
    measure();
    request();
  };

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', remeasure);
  window.addEventListener('load', remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  remeasure();
}

// ----- section rules draw in once, when first seen -----

const rules = [...document.querySelectorAll('.rule')];
if ('IntersectionObserver' in window) {
  const seen = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  rules.forEach((rule) => seen.observe(rule));
} else {
  rules.forEach((rule) => rule.classList.add('in'));
}
