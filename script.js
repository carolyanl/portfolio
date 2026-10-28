'use strict';
const reels = {
  trailer: {src:'assets/trailer.mp4', poster:'assets/trailer.jpg', id:'ZkxBv8CI-68', title:'Game Trailer Sound Re-design Demo / 游戏预告片声音重设计演示'},
  wwise: {src:'assets/wwise.mp4', poster:'assets/wwise.jpg', id:'LQzc5HbuFsg', title:'Wwise — Sound Design & Implementation Demo / 声音设计与音频实现演示'},
  ue5: {src:'assets/ue5.mp4', poster:'assets/ue5.jpg', id:'k8CmHc_EsKo', title:'UE5 — Sound Design & Implementation Demo / 声音设计与音频实现演示'}
};
const dialog = document.querySelector('#player');
const slot = document.querySelector('#player-slot');
const status = document.querySelector('#player-status');
let opener, activeReel, player, timer, generation = 0, apiPromise;
function loadAPI() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const deadline = setTimeout(() => {script.remove(); apiPromise = null; reject(new Error('timeout'));}, 10000);
    window.onYouTubeIframeAPIReady = () => {clearTimeout(deadline); resolve();};
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {clearTimeout(deadline); script.remove(); apiPromise = null; reject(new Error('network'));};
    document.head.append(script);
  });
  return apiPromise;
}
function cleanup() {
  clearTimeout(timer);
  if (player) {player.destroy(); player = null;}
  const video = slot.querySelector('video');
  if (video) {video.pause(); video.removeAttribute('src'); video.load();}
  slot.replaceChildren();
}
function failure(message) {
  cleanup();
  status.textContent = message;
  const panel = document.createElement('div');
  panel.className = 'video-unavailable';
  const title = document.createElement('p');
  title.textContent = 'Unable to load the embedded player. / 无法加载播放器。';
  const link = document.createElement('a');
  link.textContent = 'Watch on YouTube / 前往 YouTube 观看 ↗';
  link.href = `https://www.youtube.com/watch?v=${activeReel.id}`;
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  panel.append(title, link); slot.append(panel);
}
async function startVideo() {
  const token = ++generation;
  cleanup();
  if (activeReel.src) {
    status.textContent = 'Loading video… / 正在加载视频…';
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.poster = activeReel.poster;
    video.setAttribute('aria-label', activeReel.title);
    video.src = activeReel.src;
    const current = () => token === generation && dialog.open;
    video.addEventListener('playing', () => {if (current()) status.textContent = 'Playing / 正在播放';});
    video.addEventListener('pause', () => {if (current()) status.textContent = 'Paused / 已暂停';});
    video.addEventListener('waiting', () => {if (current()) status.textContent = 'Buffering… / 正在缓冲…';});
    video.addEventListener('ended', () => {if (current()) status.textContent = 'Finished / 播放结束';});
    video.addEventListener('error', () => {if (current()) status.textContent = 'Could not load video. Retry or open the video directly. / 加载失败，请重试或直接打开视频。';});
    slot.append(video);
    video.play().catch(() => {if (current() && !video.error) status.textContent = 'Press play to begin. / 点击播放开始。';});
    return;
  }
  status.textContent = 'Connecting to YouTube… / 正在连接 YouTube…';
  const loading = document.createElement('div');
  loading.className = 'video-unavailable';
  loading.textContent = 'Connecting to YouTube… / 正在连接 YouTube…';
  slot.append(loading);
  try {await loadAPI();} catch {
    if (token === generation && dialog.open) failure('Connection timed out. Try YouTube directly or retry. / 连接超时，请重试或前往 YouTube。');
    return;
  }
  if (token !== generation || !dialog.open) return;
  const mount = document.createElement('div');
  slot.replaceChildren(mount);
  timer = setTimeout(() => {
    if (token !== generation || !dialog.open) return;
    ++generation;
    failure('The player did not respond. Try YouTube directly. / 播放器无响应，请前往 YouTube。');
  }, 12000);
  player = new YT.Player(mount, {
    videoId: activeReel.id,
    playerVars: {autoplay:1, playsinline:1, rel:0, origin:location.origin},
    events: {
      onReady(event) {
        if (token !== generation) return;
        clearTimeout(timer);
        status.textContent = 'Ready — press play if needed. / 已就绪，可点击播放。';
        event.target.getIframe().title = activeReel.title;
        event.target.playVideo();
      },
      onStateChange(event) {
        if (token !== generation) return;
        if (event.data === 1) {clearTimeout(timer); status.textContent = 'Playing / 正在播放';}
        else if (event.data === 2) status.textContent = 'Paused / 已暂停';
        else if (event.data === 3) {
          clearTimeout(timer);
          status.textContent = 'Buffering… / 正在缓冲…';
          timer = setTimeout(() => {
            if (token !== generation || !dialog.open) return;
            ++generation;
            failure('Video loading stalled. Try YouTube directly or retry. / 视频加载中断，请重试或前往 YouTube。');
          }, 15000);
        }
        else if (event.data === 0) status.textContent = 'Finished / 播放结束';
      },
      onAutoplayBlocked() {if (token === generation) status.textContent = 'Press play in the video to begin. / 点击视频中的播放按钮开始。';},
      onError(event) {
        if (token !== generation) return;
        ++generation;
        failure(`YouTube could not play this video / YouTube 无法播放此视频（${event.data}）。`);
      }
    }
  });
}
document.querySelectorAll('[data-video]').forEach(button => button.addEventListener('click', () => {
  opener = button;
  activeReel = reels[button.dataset.video];
  const direct = document.querySelector('#direct-video');
  direct.href = activeReel.src || `https://www.youtube.com/watch?v=${activeReel.id}`;
  direct.textContent = activeReel.src ? 'Open video / 打开视频 ↗' : 'Watch on YouTube / 前往 YouTube 观看 ↗';
  document.querySelector('#player-title').textContent = activeReel.title;
  dialog.showModal();
  startVideo();
}));
document.querySelector('#retry-video').addEventListener('click', () => {if (dialog.open) startVideo();});
document.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
});
dialog.addEventListener('close', () => {++generation; cleanup(); opener?.focus();});
