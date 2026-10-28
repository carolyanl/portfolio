'use strict';
const track = document.querySelector('.poster-track');
const slides = [...track.children];
const previous = document.querySelector('#poster-prev');
const next = document.querySelector('#poster-next');
const count = document.querySelector('#poster-count');
let current = 0;
function update() {
  current = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  count.textContent = `${String(current + 1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;
  previous.disabled = current === 0;
  next.disabled = current === slides.length - 1;
}
function move(delta) {
  const target = Math.max(0, Math.min(slides.length - 1, current + delta));
  track.scrollTo({left: target * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
}
previous.addEventListener('click', () => move(-1));
next.addEventListener('click', () => move(1));
track.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
  }
});
track.addEventListener('scroll', update, {passive:true});
new ResizeObserver(() => {track.scrollTo({left:current * track.clientWidth,behavior:'instant'});update();}).observe(track);
update();
