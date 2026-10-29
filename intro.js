'use strict';
/*
  Opening intro — "Hello, recorded."
  A playhead sweeps a silent track and records the waveform of a spoken "hel-lo".
  Each syllable prints the word above it; the sound decays back to a flat line,
  and that line glides up to become the hairline under the header.
  Plays once per browser session. Add ?intro to the URL to replay it.
*/
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('has-intro')) return;
  clearTimeout(window.__helloFallback);

  const KEY = 'rol-intro-seen';
  const FPS = 24;
  // Timeline (ms)
  const T = {lineIn: 650, sweepStart: 650, sweepEnd: 3050, decayEnd: 3550, revealEnd: 4500};

  const el = (tag, cls, html) => {const n = document.createElement(tag); if (cls) n.className = cls; if (html) n.innerHTML = html; return n;};
  const overlay = el('div', 'hello');
  overlay.setAttribute('aria-label', 'Hello — 你好，我是李颜');
  const bg = el('div', 'hello-bg');
  const canvas = el('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const word = el('p', 'hello-word', 'Hello<span>,</span>');
  const sub = el('p', 'hello-sub', '<span lang="zh-CN">你好，我是李颜</span>I’m Carol. I make sound for stories.');
  const playhead = el('div', 'hello-playhead');
  const timecode = el('div', 'hello-timecode', '00:00:00:00');
  timecode.setAttribute('aria-hidden', 'true');
  const skip = el('button', 'hello-skip', 'Skip intro<span lang="zh-CN">跳过</span>');
  skip.type = 'button';
  const line = el('div', 'hello-line');
  overlay.append(bg, canvas, word, sub, playhead, timecode, skip, line);
  document.body.append(overlay);

  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(root);
  const ACCENT = css.getPropertyValue('--accent').trim() || '#6f4263';
  const RULE = css.getPropertyValue('--line').trim() || '#d9d1d9';

  // ---------- layout ----------
  let W, H, dpr, x0, x1, midY, amp, bars = [], barStep;
  const ease = {
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // A syllable: quick attack, longer natural decay
  function syllable(x, start, end, peak, tail = 1.8) {
    const u = (x - start) / (end - start);
    if (u < 0 || u > tail) return 0;
    const a = .14;
    return peak * (u < a ? Math.pow(u / a, 1.4) : Math.exp(-(u - a) * 2.4));
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mobile = W < 700;
    x0 = mobile ? 20 : Math.max(56, W * .08);
    x1 = W - x0;
    amp = clamp(H * .085, 26, 78);

    // Stack: word / waveform / subline, centred as a group
    const wordH = word.getBoundingClientRect().height;
    const subH = sub.getBoundingClientRect().height;
    const gap = mobile ? 18 : 26;
    const total = wordH + gap + amp * 2 + gap + subH;
    const top = (H - total) / 2 - H * .02;
    word.style.top = top + 'px';
    midY = top + wordH + gap + amp;
    sub.style.top = (midY + amp + gap) + 'px';

    playhead.style.height = (amp * 2 + 28) + 'px';
    playhead.style.top = (midY - amp - 14) + 'px';

    // Align the "hel" and "lo," bursts under the printed word
    const range = document.createRange();
    range.selectNodeContents(word);
    const r = range.getBoundingClientRect();
    const wl = r.left, ww = r.width;

    barStep = mobile ? 3 : 3.5;
    bars = [];
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let x = x0, i = 0; x <= x1; x += barStep, i++) {
      const room = .035 + rand() * .03;
      const voice =
        syllable(x, wl - ww * .06, wl + ww * .02, .25, 1.2) +   // breath in
        syllable(x, wl + ww * .02, wl + ww * .44, 1) +            // "hel"
        syllable(x, wl + ww * .48, wl + ww * .98, .86, 2.1);      // "lo,"
      const texture = (.45 + .55 * rand()) * (.78 + .22 * Math.sin(i * .83) * Math.sin(i * .21));
      bars.push({x, a: Math.min(1, Math.max(room, voice * texture * 1.45))});
    }
  }

  // ---------- drawing ----------
  function drawFlat(fromX, toX, color, alpha = 1) {
    if (toX <= fromX) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(fromX, midY - .5, toX - fromX, 1);
    ctx.globalAlpha = 1;
  }

  function drawBars(head, scale) {
    ctx.fillStyle = ACCENT;
    const bw = barStep * .55;
    for (const b of bars) {
      if (b.x > head) break;
      const grow = ease.outCubic(clamp((head - b.x) / 42));
      const h = Math.max(.5, b.a * amp * grow * scale);
      ctx.globalAlpha = .32 + .63 * Math.min(1, b.a * 1.3);
      ctx.fillRect(b.x - bw / 2, midY - h, bw, h * 2);
    }
    ctx.globalAlpha = 1;
  }

  function setReveal(x) {
    const v = x + 36 + 'px';
    for (const n of [word, sub]) n.style.setProperty('--reveal', v);
  }

  function tc(ms) {
    const f = Math.floor(ms / (1000 / FPS));
    const s = Math.floor(f / FPS), fr = f % FPS;
    return `00:00:${String(s).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
  }

  // ---------- timeline ----------
  let start, raf, finishing = false;
  function frame(now) {
    if (start === undefined) start = now;
    const t = now - start;
    ctx.clearRect(0, 0, W, H);

    const fadeIn = clamp(t / 500);
    timecode.style.opacity = skip.style.opacity = (fadeIn * (1 - clamp((t - T.decayEnd) / 300))).toFixed(3);
    if (t < T.decayEnd) timecode.textContent = tc(Math.min(t, T.sweepEnd));

    if (t < T.lineIn) {
      // Silence: the track line draws outward from the centre
      const k = ease.outCubic(t / T.lineIn);
      const c = (x0 + x1) / 2, half = (x1 - x0) / 2 * k;
      drawFlat(c - half, c + half, RULE);
      setReveal(-100);
    } else if (t < T.sweepEnd) {
      const k = ease.inOutSine((t - T.sweepStart) / (T.sweepEnd - T.sweepStart));
      const head = x0 + (x1 - x0) * k;
      drawBars(head, 1);
      drawFlat(head, x1, RULE);
      playhead.style.opacity = clamp((t - T.sweepStart) / 200);
      playhead.style.transform = `translateX(${head}px)`;
      setReveal(head);
    } else if (t < T.decayEnd) {
      // The take ends: sound decays back to the room
      const k = ease.inOutCubic((t - T.sweepEnd) / (T.decayEnd - T.sweepEnd));
      drawBars(x1 + 60, 1 - k);
      playhead.style.opacity = 1 - k;
      playhead.style.transform = `translateX(${x1}px)`;
      setReveal(W + 100);
    } else if (!finishing) {
      reveal(false);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function reveal(fast) {
    if (finishing) return;
    finishing = true;
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, W, H);
    playhead.style.opacity = 0;
    timecode.style.opacity = skip.style.opacity = 0;

    // Hand the flat line over to a DOM element and glide it onto the header rule
    const header = document.querySelector('header.shell');
    const hr = header ? header.getBoundingClientRect() : {left: x0, width: x1 - x0, bottom: 1};
    Object.assign(line.style, {display: 'block', left: x0 + 'px', top: (midY - .5) + 'px', width: (x1 - x0) + 'px'});
    const dur = fast ? 600 : 950;
    const dy = (hr.bottom - 1) - (midY - .5);
    const sx = hr.width / (x1 - x0);
    const dx = hr.left - x0;
    const curve = 'cubic-bezier(.65,0,.25,1)';

    line.animate([
      {transform: 'none', background: ACCENT},
      {transform: `translate(${dx}px,${dy}px) scaleX(${sx})`, background: RULE}
    ], {duration: dur, easing: curve, fill: 'forwards'});
    for (const [n, d] of [[word, 0], [sub, 40]]) {
      n.animate([{opacity: 1, transform: 'none', filter: 'blur(0)'},
                 {opacity: 0, transform: 'translateY(-26px)', filter: 'blur(6px)'}],
                {duration: dur * .5, delay: d, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards'});
    }

    // Uncover the page beneath while the line travels
    root.classList.remove('has-intro');
    root.classList.add('hello-done');
    bg.animate([{opacity: 1}, {opacity: 0}], {duration: dur * .8, delay: dur * .4, easing: 'ease-in-out', fill: 'forwards'})
      .finished.then(done, done);
  }

  function done() {
    overlay.remove();
    removeEventListener('resize', layout);
    removeEventListener('keydown', onKey);
    try {sessionStorage.setItem(KEY, '1');} catch (e) {}
  }

  const onKey = e => {if (['Escape', 'Enter', ' '].includes(e.key)) {e.preventDefault(); reveal(true);}};
  skip.addEventListener('click', e => {e.stopPropagation(); reveal(true);});
  overlay.addEventListener('click', () => reveal(true));
  addEventListener('keydown', onKey);
  addEventListener('resize', layout);

  // Wait briefly for the italic display face so the bursts line up with real letterforms
  const fontReady = document.fonts ? document.fonts.load('italic 400 100px "Cormorant Garamond"') : Promise.resolve();
  Promise.race([fontReady, new Promise(r => setTimeout(r, 700))]).then(() => {
    layout();
    raf = requestAnimationFrame(frame);
  });
})();
