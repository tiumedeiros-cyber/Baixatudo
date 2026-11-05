// Interações da landing: marquees infinitos + FAQ exclusivo.
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('[data-marquee] .mq-track').forEach(track => {
  if (reduce) return;
  // duplica o conteúdo para o loop -50% ficar contínuo
  const items = [...track.children];
  if (track.scrollWidth <= track.parentElement.clientWidth) return;
  items.forEach(el => track.appendChild(el.cloneNode(true)));
  track.querySelectorAll('[aria-hidden], .mq-item').forEach(el => el.setAttribute('aria-hidden', 'true'));
  // a primeira cópia já é lida pelos leitores; esconde apenas duplicatas:
  items.forEach(el => el.removeAttribute('aria-hidden'));
});

// FAQ: mantém um aberto por vez
const faq = document.querySelectorAll('.faq details');
faq.forEach(d => d.addEventListener('toggle', () => {
  if (!d.open) return;
  faq.forEach(o => { if (o !== d && o.open) o.open = false; });
}));
