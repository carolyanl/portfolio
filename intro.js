'use strict';
/*
  Opening intro — "Hello, recorded."
  1. Gate: a single play button. Clicking it unlocks sound (browsers require a click).
  2. The button contracts into a dot that draws out into a silent track.
  3. A playhead sweeps the track. Two sprite-like bell notes ring as it crosses
     "Hel" and "lo,"; the waveform drawn is the real waveform of that stinger,
     and each note prints its part of the word.
  4. The sound decays to a flat line that glides up to become the header rule.
  Plays once per browser session. Add ?intro to the URL to replay it.
*/
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('has-intro')) return;
  clearTimeout(window.__helloFallback);

  const KEY = 'rol-intro-seen';
  const FPS = 24;
  const T = {lineIn: 650, sweepStart: 650, sweepEnd: 3050, decayEnd: 3550};
  const COLLAPSE = 300; // button → dot

  // ---------- DOM ----------
  const el = (tag, cls, html) => {const n = document.createElement(tag); if (cls) n.className = cls; if (html) n.innerHTML = html; return n;};
  const overlay = el('div', 'hello is-gate');
  const bg = el('div', 'hello-bg');
  const canvas = el('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const word = el('p', 'hello-word', 'Hello<span>,</span>');
  const sub = el('p', 'hello-sub', '<span lang="zh-CN">你好，我是李颜</span>I’m Carol. I make sound for stories.');
  const playhead = el('div', 'hello-playhead');
  const timecode = el('div', 'hello-timecode', '00:00:00:00');
  timecode.setAttribute('aria-hidden', 'true');
  const play = el('button', 'hello-play', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4a.6.6 0 0 0 .92.5l9.5-6.2a.6.6 0 0 0 0-1L9.42 5.3a.6.6 0 0 0-.92.5z"/></svg>');
  play.type = 'button';
  play.setAttribute('aria-label', 'Play intro with sound / 播放有声开场');
  const skip = el('button', 'hello-skip', 'Skip intro<span lang="zh-CN">跳过</span>');
  skip.type = 'button';
  const line = el('div', 'hello-line');
  overlay.append(bg, canvas, word, sub, playhead, timecode, play, skip, line);
  document.body.append(overlay);

  const ctx = canvas.getContext('2d');
  const css = getComputedStyle(root);
  const ACCENT = css.getPropertyValue('--accent').trim() || '#6f4263';
  const RULE = css.getPropertyValue('--line').trim() || '#d9d1d9';

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = {
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  };
  const GAP = .15; // seconds between the two notes: quick, light, sprite-like

  // The playhead's path: an eased sweep that dashes across the word, so it reaches
  // "Hel" and "lo," exactly when each note rings. Built as a smooth monotone curve
  // through four points, then tabulated per millisecond for fast lookups both ways.
  let sweepTable = null;
  function buildSweep() {
    const D = T.sweepEnd - T.sweepStart;
    const sineTime = x => Math.acos(1 - 2 * clamp((x - x0) / (x1 - x0))) / Math.PI * D;
    const t1 = clamp(sineTime(helX), 120, D - GAP * 1000 - 120);
    const pts = [[0, x0], [t1, helX], [t1 + GAP * 1000, loX], [D, x1]];
    const n = pts.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i]);
    sweepTable = new Float32Array(Math.ceil(D) + 1);
    for (let t = 0, k = 0; t <= D; t++) {
      while (k < n - 2 && t > pts[k + 1][0]) k++;
      const [ta, xa] = pts[k], [tb, xb] = pts[k + 1], h = tb - ta, u = (t - ta) / h;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
      sweepTable[t] = h00 * xa + h10 * h * m[k] + h01 * xb + h11 * h * m[k + 1];
    }
  }
  const headAt = t => sweepTable[clamp(Math.round(t - T.sweepStart), 0, sweepTable.length - 1)];
  // Timeline ms at which the playhead reaches x
  function timeAt(x) {
    let lo = 0, hi = sweepTable.length - 1;
    while (lo < hi) {const mid = (lo + hi) >> 1; if (sweepTable[mid] < x) lo = mid + 1; else hi = mid;}
    return T.sweepStart + lo;
  }

  // ---------- sound: a two-note sprite stinger, synthesized ----------
  const LEAD = .45; // seconds of air-swish before the first note
  function seeded(s) {return () => (s = (s * 16807) % 2147483647) / 2147483647;}

  function buildStinger(ac, out, t0, gap) {
    // t0 = first note time, gap = seconds between the two notes
    const rand = seeded(11);
    const master = ac.createGain(); master.gain.value = .51;
    const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 9500;
    const clean = ac.createBiquadFilter(); clean.type = 'highpass'; clean.frequency.value = 150;
    master.connect(clean).connect(tone).connect(out);

    // Small airy room
    const len = Math.floor(ac.sampleRate * 2.6);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let prev = 0;
      for (let i = 0; i < len; i++) {const n = rand() * 2 - 1; d[i] = (n - prev * .6) * Math.pow(1 - i / len, 3.2); prev = n;}
    }
    const verb = ac.createConvolver(); verb.buffer = ir;
    const wet = ac.createGain(); wet.gain.value = .36;
    verb.connect(wet).connect(master);

    // Stereo ping-pong echo for a little flutter
    const dl = ac.createDelay(1), dr = ac.createDelay(1), fb = ac.createGain(), echo = ac.createGain();
    dl.delayTime.value = .17; dr.delayTime.value = .17; fb.gain.value = .32; echo.gain.value = .16;
    const merger = ac.createChannelMerger(2), damp = ac.createBiquadFilter();
    damp.type = 'lowpass'; damp.frequency.value = 5200;
    echo.connect(dl); dl.connect(damp).connect(dr); dr.connect(fb).connect(dl);
    dl.connect(merger, 0, 0); dr.connect(merger, 0, 1); merger.connect(master); merger.connect(verb);

    const bus = (pan) => {
      const p = ac.createStereoPanner(); p.pan.value = pan;
      p.connect(master); p.connect(verb); p.connect(echo);
      return p;
    };

    // Rounded FM bell: a soft "ting" over a warm, slightly chorused body
    function warmBell(f, t, vel, pan, decay) {
      const dest = bus(pan);
      const oscs = [];
      const voice = (type, freq, level, attack, len, to = dest) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + attack);
        g.gain.exponentialRampToValueAtTime(.0001, t + len);
        o.connect(g).connect(to); oscs.push(o);
        return o;
      };
      // FM layer: harmonic 2:1 ratio and a gentle index, so the attack glints without biting
      const car = voice('sine', f, vel * .55, .008, decay);
      const mod = ac.createOscillator(), modGain = ac.createGain();
      mod.frequency.value = f * 2;
      modGain.gain.setValueAtTime(f * 1.1, t);
      modGain.gain.exponentialRampToValueAtTime(f * .03, t + .35);
      mod.connect(modGain).connect(car.frequency); oscs.push(mod);
      // Pure fundamental plus a hair-detuned twin for fullness
      voice('sine', f * 1.0035, vel * .3, .012, decay * .9);
      // Warm body an octave down
      voice('sine', f / 2, vel * .26, .015, decay * .7);
      // Octave shimmer and a faint glassy partial for the sprite sparkle
      voice('sine', f * 2, vel * .1, .006, decay * .45);
      voice('sine', f * 4.2, vel * .045, .004, .14);
      for (const o of oscs) {o.start(t); o.stop(t + decay + .05);}
    }

    // Glassy FM bell (the brighter first version), laid an octave above as the glint
    function glassBell(f, t, vel, pan, decay) {
      const dest = bus(pan);
      const car = ac.createOscillator(), mod = ac.createOscillator(), modGain = ac.createGain(), amp = ac.createGain();
      car.frequency.value = f; mod.frequency.value = f * 3.0;
      modGain.gain.setValueAtTime(f * 2.4, t);
      modGain.gain.exponentialRampToValueAtTime(f * .08, t + .28);
      mod.connect(modGain).connect(car.frequency);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(vel, t + .006);
      amp.gain.exponentialRampToValueAtTime(vel * .35, t + .12);
      amp.gain.exponentialRampToValueAtTime(.0001, t + decay);
      car.connect(amp).connect(dest);
      const sp = ac.createOscillator(), sg = ac.createGain();
      sp.frequency.value = f * 4.2;
      sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(vel * .18, t + .003);
      sg.gain.exponentialRampToValueAtTime(.0001, t + .22);
      sp.connect(sg).connect(dest);
      for (const o of [car, mod, sp]) {o.start(t); o.stop(t + decay + .05);}
    }

    // One note = the warm bell as the bed, with the glass bell an octave up mixed lower on top
    const GLASS = .42;
    function bell(f, t, vel, pan, decay) {
      warmBell(f, t, vel, pan, decay);
      glassBell(f * 2, t, vel * GLASS, pan, decay * .85);
    }

    // Air swish rising into the first note — the sprite arriving
    const nlen = Math.floor(ac.sampleRate * LEAD);
    const nb = ac.createBuffer(1, nlen, ac.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = rand() * 2 - 1;
    const noise = ac.createBufferSource(); noise.buffer = nb;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(900, t0 - LEAD); bp.frequency.exponentialRampToValueAtTime(7000, t0);
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0, t0 - LEAD); ng.gain.linearRampToValueAtTime(.04, t0 - .06); ng.gain.linearRampToValueAtTime(0, t0 + .02);
    noise.connect(bp).connect(ng).connect(bus(-.4));
    noise.start(t0 - LEAD);

    const E5 = 659.26, B5 = 987.77;
    bell(E5, t0, .6, -.28, 1.7);                  // "hel"
    bell(E5 * 2, t0 + gap - .045, .09, .1, .35);  // grace flick before the answer
    bell(B5, t0 + gap, .75, .3, 2.8);             // "lo,"
    // Fairy-dust tail: a few quiet pings drifting down
    const dust = [2217.46, 1975.53, 1661.22, 1479.98, 1318.51, 1975.53]; // E-major pentatonic, falling
    let t = t0 + gap + .07;
    dust.forEach((f, i) => {t += .045 + rand() * .09; bell(f, t, .05 * (1 - i / 8), rand() * 1.4 - .7, .5);});
    return master;
  }

  // Render the stinger offline once so the drawn waveform is the real one
  let envelope = null; // {rms: Float32Array, rate}
  function renderEnvelope(gap) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.resolve(null);
    const rate = 22050, dur = LEAD + gap + 2.8;
    const oac = new OAC(2, Math.ceil(rate * dur), rate);
    buildStinger(oac, oac.destination, LEAD, gap);
    return oac.startRendering().then(buf => {
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const win = Math.floor(rate * .012), n = Math.floor(L.length / win);
      const rms = new Float32Array(n); let max = 0;
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = i * win; j < (i + 1) * win; j++) {const m = (L[j] + R[j]) * .5; s += m * m;}
        rms[i] = Math.sqrt(s / win); max = Math.max(max, rms[i]);
      }
      for (let i = 0; i < n; i++) rms[i] /= max || 1;
      return {rms, step: win / rate};
    }).catch(() => null);
  }

  let ac = null, out = null;
  function unlockAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      out = ac.createGain(); out.connect(ac.destination);
      ac.resume();
    } catch (e) {ac = null;}
  }

  // ---------- layout ----------
  let W, H, dpr, x0, x1, midY, amp, bars = [], barStep, helX, loX;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mobile = W < 700;
    x0 = mobile ? 20 : Math.max(56, W * .08);
    x1 = W - x0;
    amp = clamp(H * .085, 26, 78);

    const wordH = word.getBoundingClientRect().height;
    const subH = sub.getBoundingClientRect().height;
    const gap = mobile ? 18 : 26;
    const total = wordH + gap + amp * 2 + gap + subH;
    const top = (H - total) / 2 - H * .02;
    word.style.top = top + 'px';
    midY = top + wordH + gap + amp;
    sub.style.top = (midY + amp + gap) + 'px';
    play.style.top = midY + 'px';

    playhead.style.height = (amp * 2 + 28) + 'px';
    playhead.style.top = (midY - amp - 14) + 'px';

    const range = document.createRange();
    range.selectNodeContents(word);
    const r = range.getBoundingClientRect();
    helX = r.left + r.width * .03;
    loX = r.left + r.width * .5;
    buildSweep();
    buildBars();
  }

  function buildBars() {
    barStep = W < 700 ? 3 : 3.5;
    bars = [];
    const rand = seeded(7);
    const tHel = timeAt(helX);
    for (let x = x0, i = 0; x <= x1; x += barStep, i++) {
      const room = .03 + rand() * .03;
      let a = 0;
      if (envelope) {
        const sec = LEAD + (timeAt(x) - tHel) / 1000;
        const k = Math.floor(sec / envelope.step);
        a = k >= 0 && k < envelope.rms.length ? Math.pow(envelope.rms[k], .62) : 0;
      }
      const texture = .62 + .38 * rand();
      bars.push({x, a: Math.min(1, Math.max(room, a * texture))});
    }
  }

  // ---------- drawing ----------
  function drawFlat(fromX, toX, color) {
    if (toX <= fromX) return;
    ctx.fillStyle = color;
    ctx.fillRect(fromX, midY - .5, toX - fromX, 1);
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
    return `00:00:${String(Math.floor(f / FPS)).padStart(2, '0')}:${String(f % FPS).padStart(2, '0')}`;
  }

  // ---------- timeline ----------
  let state = 'loading', start, raf, startedAt = 0;

  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    if (t < 0) {raf = requestAnimationFrame(frame); return;}

    const fadeIn = clamp(t / 500);
    timecode.style.opacity = skip.style.opacity = (fadeIn * (1 - clamp((t - T.decayEnd) / 300))).toFixed(3);
    if (t < T.decayEnd) timecode.textContent = tc(Math.min(t, T.sweepEnd));

    if (t < T.lineIn) {
      const k = ease.outCubic(t / T.lineIn);
      const c = W / 2, half = (x1 - x0) / 2 * k;
      drawFlat(c - half, c + half, RULE);
      setReveal(-100);
    } else if (t < T.sweepEnd) {
      const head = headAt(t);
      drawBars(head, 1);
      drawFlat(head, x1, RULE);
      playhead.style.opacity = clamp((t - T.sweepStart) / 200);
      playhead.style.transform = `translateX(${head}px)`;
      setReveal(head);
    } else if (t < T.decayEnd) {
      const k = ease.inOutCubic((t - T.sweepEnd) / (T.decayEnd - T.sweepEnd));
      drawBars(x1 + 60, 1 - k);
      playhead.style.opacity = 1 - k;
      playhead.style.transform = `translateX(${x1}px)`;
      setReveal(W + 100);
    } else {
      reveal(false);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function begin() {
    if (state !== 'gate') return;
    state = 'playing';
    startedAt = performance.now();
    unlockAudio();
    overlay.classList.remove('is-gate');
    overlay.classList.add('is-playing');
    play.setAttribute('tabindex', '-1');

    start = performance.now() + COLLAPSE;
    const tHel = timeAt(helX);
    const gap = GAP;
    if (ac) {
      const latency = ac.outputLatency || ac.baseLatency || 0;
      buildStinger(ac, out, ac.currentTime + (COLLAPSE + tHel) / 1000 - latency, gap);
    }
    renderEnvelope(gap).then(env => {
      envelope = env;
      if (!env) envelope = fallbackEnvelope(gap);
      buildBars();
    });
    raf = requestAnimationFrame(frame);
  }

  // Without Web Audio, draw the same two-bell shape synthetically
  function fallbackEnvelope(gap) {
    const step = .012, n = Math.ceil((LEAD + gap + 2.8) / step), rms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * step - LEAD;
      const b1 = s >= 0 ? .75 * Math.exp(-s * 3.2) : .12 * Math.max(0, 1 + s / LEAD);
      const s2 = s - gap, b2 = s2 >= 0 ? Math.exp(-s2 * 2.2) : 0;
      rms[i] = Math.min(1, b1 + b2);
    }
    return {rms, step};
  }

  function reveal(fast) {
    if (state === 'finishing') return;
    const wasGate = state === 'gate' || state === 'loading';
    state = 'finishing';
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, W, H);
    playhead.style.opacity = 0;
    timecode.style.opacity = skip.style.opacity = 0;
    if (fast && ac && out) {
      out.gain.setTargetAtTime(0, ac.currentTime, .08);
    }

    const header = document.querySelector('header.shell');
    const hr = header ? header.getBoundingClientRect() : {left: x0, width: x1 - x0, bottom: 1};
    const dur = fast ? 600 : 950;
    const curve = 'cubic-bezier(.65,0,.25,1)';

    if (wasGate) {
      play.animate([{opacity: 1}, {opacity: 0, transform: 'translate(-50%,-50%) scale(.8)'}], {duration: 300, fill: 'forwards'});
    } else {
      Object.assign(line.style, {display: 'block', left: x0 + 'px', top: (midY - .5) + 'px', width: (x1 - x0) + 'px'});
      line.animate([
        {transform: 'none', background: ACCENT},
        {transform: `translate(${hr.left - x0}px,${(hr.bottom - 1) - (midY - .5)}px) scaleX(${hr.width / (x1 - x0)})`, background: RULE}
      ], {duration: dur, easing: curve, fill: 'forwards'});
      for (const [n, d] of [[word, 0], [sub, 40]]) {
        n.animate([{opacity: 1, transform: 'none', filter: 'blur(0)'},
                   {opacity: 0, transform: 'translateY(-26px)', filter: 'blur(6px)'}],
                  {duration: dur * .5, delay: d, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards'});
      }
    }

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
    // Let the bell tail ring out, then release the audio device
    if (ac) setTimeout(() => ac.close().catch(() => {}), 3500);
  }

  const onKey = e => {
    if (e.key === 'Escape') {e.preventDefault(); reveal(true); return;}
    if (e.key === 'Enter' || e.key === ' ') {
      if (state === 'gate') {e.preventDefault(); begin();}
      else if (state === 'playing' && e.target !== skip) {e.preventDefault(); reveal(true);}
    }
  };
  play.addEventListener('click', e => {e.stopPropagation(); begin();});
  skip.addEventListener('click', e => {e.stopPropagation(); reveal(true);});
  overlay.addEventListener('click', () => {
    if (state === 'gate') begin();
    else if (state === 'playing' && performance.now() - startedAt > 600) reveal(true);
  });
  addEventListener('keydown', onKey);
  addEventListener('resize', layout);

  // Wait briefly for the italic display face so the notes line up with real letterforms
  const fontReady = document.fonts ? document.fonts.load('italic 400 100px "Cormorant Garamond"') : Promise.resolve();
  Promise.race([fontReady, new Promise(r => setTimeout(r, 700))]).then(() => {
    layout();
    state = 'gate';
    overlay.classList.add('is-ready');
  });
})();
