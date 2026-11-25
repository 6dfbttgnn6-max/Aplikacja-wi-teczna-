// Realistyczny film: montaż ujęć z ruchem kamery 2,5D (mapy głębi + WebGL).
//  - "pracownia": plan ogólny i przebitki (okno, renifer, elfy, choinka, kominek, prezenty),
//  - "blisko":    zbliżenie na Mikołaja, usta zsynchronizowane z głosem,
//  - "wideo":     prawdziwe wideo: Mikołaj podnosi list, zakłada okulary i czyta.
// Przebitki dobierane są do treści zdań (np. "okno" -> okno ze śniegiem, "renifery" -> renifer).
import { W, H, drawSubtitle, goldText, fitSize, drawFrontSnow, drawSparkles } from './scene.js';
import { glAvailable, glRegister, glRender } from './gl.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => x * x * (3 - 2 * x);
const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const PROFILES = {
  pracownia: {
    src: '../img/pracownia.jpg', depth: '../img/pracownia-glebia.png', meta: '../img/pracownia.json', w: 2160, h: 3840,
    mouth: { x: 1190, y: 1306, w: 88 }, jaw: { x0: 1076, x1: 1304, y0: 1302, y1: 1496 }, jawDrop: 17,
    face: { x: 1190, y: 1280 }, fire: { x: 2060, y: 1520, r: 220 },
    windows: [{ x: 500, y: 500, w: 224, h: 700 }, { x: 1344, y: 60, w: 416, h: 1260 }],
  },
  blisko: {
    src: '../img/blisko.jpg', depth: '../img/blisko-glebia.png', meta: '../img/blisko.json', w: 1536, h: 2688,
    mouth: { x: 750, y: 988, w: 148 }, jaw: { x0: 644, x1: 864, y0: 982, y1: 1200 }, jawDrop: 22,
    face: { x: 750, y: 880 }, fire: { x: 1470, y: 1300, r: 150 },
    windows: [{ x: 128, y: 28, w: 356, h: 940 }],
  },
  wideo: { w: 768, h: 1344, fire: { x: 735, y: 650, r: 75 }, windows: [] },
};

// Przebitki (kadry na ilustracji pracowni, współrzędne obrazu 2160x3840)
const BROLL = {
  szeroki: { from: { z: 1.0, x: 1080, y: 1920, par: [0.012, 0.002] }, to: { z: 1.12, x: 1110, y: 1840, par: [-0.012, -0.002] } },
  okno: { from: { z: 2.6, x: 1690, y: 640, par: [0.008, 0] }, to: { z: 2.45, x: 1670, y: 600, par: [-0.008, 0] } },
  renifer: { from: { z: 2.0, x: 420, y: 2020, par: [0.010, 0] }, to: { z: 2.25, x: 470, y: 1980, par: [-0.006, 0], dolly: 0.04 } },
  elfy: { from: { z: 2.0, x: 1820, y: 2380, par: [-0.010, 0] }, to: { z: 2.2, x: 1780, y: 2330, par: [0.008, 0] } },
  prezenty: { from: { z: 1.8, x: 430, y: 2950, par: [0.010, 0.002] }, to: { z: 2.0, x: 470, y: 2880, par: [-0.008, -0.002] } },
  choinka: { from: { z: 2.2, x: 330, y: 1100, par: [0.008, 0] }, to: { z: 2.0, x: 360, y: 1000, par: [-0.008, 0] } },
  kominek: { from: { z: 2.7, x: 1980, y: 1560, par: [-0.008, 0] }, to: { z: 2.5, x: 1960, y: 1500, par: [0.006, 0] } },
};
const KEYWORDS = [
  [/okn/i, 'okno'],
  [/renifer|sani/i, 'renifer'],
  [/elf|pakuj/i, 'elfy'],
  [/choink|prezent|wigili/i, 'prezenty'],
  [/pracown|północ|śnieg|krain/i, 'kominek'],
];
const FILLERS = ['choinka', 'kominek', 'prezenty', 'okno'];

export const VIDEO_SRC = '../img/czytanie.mp4';
const V_START = 1.0, V_LOOP_A = 9.0, V_LOOP_B = 14.9;

let RES = 1;
export function setResolution(r) { RES = r; }
let loaded = false;
let useGL = false;
let video = null;
let layer = null;     // canvas pomocniczy do przenikań
let grainTile = null;

function makeCanvas(w, h) {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}
async function loadImage(url) {
  const im = new Image();
  im.src = new URL(url, import.meta.url).href;
  await im.decode();
  return im;
}

export async function loadReal() {
  if (loaded) return;
  useGL = glAvailable();
  await Promise.all(['pracownia', 'blisko'].map(async (k) => {
    const p = PROFILES[k];
    const [img, dep, meta] = await Promise.all([
      loadImage(p.src), loadImage(p.depth),
      fetch(new URL(p.meta, import.meta.url).href).then((r) => r.json()),
    ]);
    p.img = img;
    p.focus = meta.focus;
    p.lights = meta.lights.map(([x, y, d], i) => ({ x, y, d, ph: hash(i + 7) * Math.PI * 2, sp: 1.5 + hash(i + 70) * 2.5 }));
    // głębia okien (do przesuwania śniegu razem z obrazem)
    const dc = makeCanvas(dep.width, dep.height);
    const dx = dc.getContext('2d', { willReadFrequently: true });
    dx.drawImage(dep, 0, 0);
    const sx = dep.width / p.w;
    p.windows.forEach((w) => {
      const px = dx.getImageData(Math.floor((w.x + w.w / 2) * sx), Math.floor((w.y + w.h / 2) * sx), 1, 1).data;
      w.d = px[0] / 255;
    });
    p.jawCanvas = makeCanvas(p.jaw.x1 - p.jaw.x0, p.jaw.y1 - p.jaw.y0 + 50);
    if (useGL) {
      try { glRegister(k, img, dep); } catch (e) { console.warn('WebGL wyłączony', e); useGL = false; }
    }
  }));
  // ziarno filmowe
  grainTile = makeCanvas(256, 256);
  const g = grainTile.getContext('2d');
  const id = g.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 120;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  loaded = true;
}

export async function loadVideo() {
  if (video) return video;
  const res = await fetch(new URL(VIDEO_SRC, import.meta.url).href);
  const blob = await res.blob();
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.preload = 'auto';
  v.src = URL.createObjectURL(blob);
  await new Promise((ok, fail) => {
    v.onloadeddata = ok;
    v.onerror = () => fail(new Error('Nie udało się wczytać wideo z Mikołajem.'));
    v.load();
  });
  video = v;
  return v;
}

export async function seekVideo(t) {
  if (!video) return;
  if (Math.abs(video.currentTime - t) < 0.004 && video.readyState >= 2) return;
  await new Promise((ok) => {
    const done = () => { video.removeEventListener('seeked', done); ok(); };
    video.addEventListener('seeked', done);
    video.currentTime = t;
    setTimeout(done, 1500);
  });
}

export function syncVideoLive(shot) {
  if (!video) return;
  const v = shot.cur.kind === 'wideo' ? shot.cur : shot.prev && shot.prev.kind === 'wideo' ? shot.prev : null;
  if (v) {
    if (video.paused) { video.currentTime = v.vt; video.play().catch(() => {}); }
    else if (Math.abs(video.currentTime - v.vt) > 0.35) video.currentTime = v.vt;
  } else if (!video.paused) video.pause();
}

// ---------------------------------------------------------------- reżyseria

function closeCam(i) {
  const side = i % 2 ? 1 : -1;
  return {
    from: { z: 1.12, x: 768 - side * 30, y: 1300, par: [side * 0.006, 0.004] },
    to: { z: 1.42, x: 768 + side * 20, y: 1120, par: [-side * 0.004, -0.003], dolly: 0.05 },
  };
}

function buildShots(film) {
  const tl = film.timeline;
  const D = film.duration;
  const beats = [];
  if (!tl.length) return [{ kind: 'pracownia', start: 0, end: D, cam: BROLL.szeroki }];
  // wideo (Mikołaj podnosi list, zakłada okulary i czyta) obejmuje zdania o liście i prezentach
  const wish = tl.filter((x) => x.section === 'wish' || x.section === 'letter');
  const videoStart = wish.length ? wish[0].start - 0.3 : Infinity;
  const videoEnd = wish.length ? wish[wish.length - 1].end + 0.4 : -Infinity;

  // 1. typ ujęcia dla każdego zdania
  let filler = 0;
  tl.forEach((it, i) => {
    let type = 'blisko';
    if (it.start >= videoStart - 0.01 && it.start < videoEnd) type = 'wideo';
    else {
      // zdania zwracające się do dziecka zostają w zbliżeniu
      const direct = /^(ho|witaj|wiem|pamiętaj|proszę|muszę|bardzo przepraszam|wybacz|dziękuję|jaki wspaniały|wesołych)/i.test(it.text);
      const kw = KEYWORDS.find(([re]) => re.test(it.text));
      if (kw && !direct) type = kw[1];
      else if (kw && direct && it.end - it.start > 4.5) type = kw[1];
    }
    beats.push({ type, start: it.start, end: it.end });
  });
  // 2. długie bloki zbliżeń przerywamy przebitką (rytm montażu)
  let run = [];
  const flush = () => {
    if (run.length >= 3) {
      const dur = beats[run[run.length - 1]].end - beats[run[0]].start;
      if (dur > 10) beats[run[Math.floor(run.length / 2)]].type = FILLERS[filler++ % FILLERS.length];
    }
    run = [];
  };
  beats.forEach((b, i) => { if (b.type === 'blisko') run.push(i); else flush(); });
  flush();

  // 3. ujęcia: cięcie tuż przed zdaniem, sklejanie tych samych typów
  const shots = [{ kind: 'pracownia', name: 'szeroki', start: 0, end: beats[0].start - 0.25 }];
  beats.forEach((b) => {
    const kind = b.type === 'blisko' ? 'blisko' : b.type === 'wideo' ? 'wideo' : 'pracownia';
    const name = b.type;
    const start = b.type === 'wideo' ? Math.min(b.start - 0.25, videoStart) : b.start - 0.25;
    const last = shots[shots.length - 1];
    if (last.name === name) return;
    if (start - last.start < 1.8 && shots.length > 1) { last.name = name; last.kind = kind; return; }
    last.end = start;
    shots.push({ kind, name, start, end: start });
  });
  // finał: plan ogólny po ostatnim zdaniu
  const lastEnd = tl[tl.length - 1].end;
  shots[shots.length - 1].end = Math.min(D, lastEnd + 0.4);
  shots.push({ kind: 'pracownia', name: 'final', start: Math.min(D, lastEnd + 0.4), end: D });
  // kamery
  let closeN = 0;
  shots.forEach((s) => {
    if (s.kind === 'blisko') s.cam = closeCam(closeN++);
    else if (s.kind === 'wideo') s.cam = { from: { z: 1.0, x: 384, y: 680 }, to: { z: 1.1, x: 384, y: 640 } };
    else if (s.name === 'final') s.cam = { from: { z: 1.25, x: 1150, y: 1700, par: [0, 0.006] }, to: { z: 1.0, x: 1080, y: 1920, par: [0.008, -0.004] } };
    else s.cam = BROLL[s.name] || BROLL.szeroki;
  });
  return shots.filter((s) => s.end - s.start > 0.05);
}

function camAt(sh, t) {
  const k = easeIO(clamp((t - sh.start) / Math.max(0.1, sh.end - sh.start), -0.1, 1.1));
  const a = sh.cam.from, b = sh.cam.to;
  const sway = { x: Math.sin(t * 0.37) * 3, y: Math.sin(t * 0.29 + 1) * 2 };
  const ap = a.par || [0, 0], bp = b.par || [0, 0];
  const orbit = [Math.sin(t * 0.45) * 0.0015, Math.cos(t * 0.33) * 0.001];
  return {
    z: lerp(a.z, b.z, k), x: lerp(a.x, b.x, k) + sway.x, y: lerp(a.y, b.y, k) + sway.y,
    par: [lerp(ap[0], bp[0], k) + orbit[0], lerp(ap[1], bp[1], k) + orbit[1]],
    dolly: lerp(a.dolly || 0, b.dolly || 0, k),
  };
}

function videoTime(sh, t, live) {
  const u = Math.max(0, t - sh.start);
  const intro = V_LOOP_A - V_START;
  if (u < intro) return V_START + u;
  const L = V_LOOP_B - V_LOOP_A;
  const p = (u - intro) % (2 * L);
  return live ? V_LOOP_A + ((u - intro) % L) : (p < L ? V_LOOP_A + p : V_LOOP_B - (p - L));
}

/** Ujęcie (i ewentualnie poprzednie, przy przenikaniu) w chwili t. */
export function shotAt(t, film) {
  if (!film) {
    const k = 0.5 - 0.5 * Math.cos(t * 0.15);
    const cam = {
      z: lerp(1.0, 1.25, k), x: lerp(1080, 1180, k), y: lerp(1920, 1700, k),
      par: [Math.sin(t * 0.3) * 0.012, Math.cos(t * 0.21) * 0.004], dolly: 0.02 * k,
    };
    return { cur: { kind: 'pracownia', cam }, prev: null, mix: 1 };
  }
  if (!film.shots) film.shots = buildShots(film);
  const shots = film.shots;
  let i = shots.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) i = shots.length - 1;
  const sh = shots[i];
  const mk = (s) => {
    const o = { kind: s.kind, name: s.name, cam: camAt(s, t) };
    if (s.kind === 'wideo') o.vt = videoTime(s, t, film.live);
    return o;
  };
  const cur = mk(sh);
  let prev = null, mix = 1;
  if (i > 0) {
    const DUR = sh.name === 'final' ? 0.9 : shots[i - 1].name === 'szeroki' ? 0.7 : 0.32;
    const k = (t - sh.start) / DUR;
    if (k < 1) { prev = mk(shots[i - 1]); mix = ease(clamp(k)); }
  }
  return { cur, prev, mix };
}

// ---------------------------------------------------------------- rysowanie

function viewFor(p, cam) {
  const base = Math.max(W / p.w, H / p.h);
  const s = base * cam.z * RES;
  const halfW = (W * RES) / s / 2, halfH = (H * RES) / s / 2;
  const cx = clamp(cam.x, halfW, p.w - halfW);
  const cy = clamp(cam.y, halfH, p.h - halfH);
  return { s, cx, cy, halfW, halfH };
}

function applyCamera(ctx, p, cam) {
  const v = viewFor(p, cam);
  ctx.setTransform(v.s, 0, 0, v.s, (W * RES) / 2 - v.cx * v.s, (H * RES) / 2 - v.cy * v.s);
  return v;
}

/** Przesunięcie punktu obrazu wynikające z paralaksy (żeby nakładki trzymały się obrazu). */
function dispPx(p, v, cam, x, y, d) {
  if (!useGL || p.focus === undefined) return [0, 0];
  const u = x / p.w, w = y / p.h;
  const cu = v.cx / p.w, cw = v.cy / p.h;
  const f = d - p.focus;
  return [f * (cam.par[0] + (u - cu) * cam.dolly) * p.w, f * (cam.par[1] + (w - cw) * cam.dolly) * p.h];
}

function drawJaw(ctx, p, open) {
  if (open < 0.04) return;
  const { jaw, mouth, img } = p;
  const D = open * p.jawDrop;
  const jw = jaw.x1 - jaw.x0, jh = jaw.y1 - jaw.y0;
  const jc = p.jawCanvas.getContext('2d');
  jc.setTransform(1, 0, 0, 1, 0, 0);
  jc.globalCompositeOperation = 'source-over';
  jc.clearRect(0, 0, p.jawCanvas.width, p.jawCanvas.height);
  const rx = mouth.w * 0.46, ry = D * 0.6 + 2;
  jc.save();
  jc.translate(mouth.x - jaw.x0, 2 + D * 0.5);
  jc.scale(1, ry / rx);
  const mg = jc.createRadialGradient(0, 0, 0, 0, 0, rx);
  mg.addColorStop(0, '#1a0605');
  mg.addColorStop(0.65, '#33100e');
  mg.addColorStop(1, 'rgba(60,22,18,0)');
  jc.fillStyle = mg;
  jc.fillRect(-rx, -rx, rx * 2, rx * 2);
  jc.restore();
  const strip = 2;
  for (let r = 0; r < jh; r += strip) {
    const off = D * Math.pow(1 - r / jh, 1.1);
    jc.drawImage(img, jaw.x0, jaw.y0 + r, jw, strip, 0, r + off, jw, strip + 0.8);
  }
  jc.globalCompositeOperation = 'destination-in';
  jc.save();
  jc.translate(jw / 2, jh * 0.32);
  jc.scale(1, (jh * 0.95) / (jw * 0.5));
  const mask = jc.createRadialGradient(0, 0, jw * 0.18, 0, 0, jw * 0.5);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  jc.fillStyle = mask;
  jc.fillRect(-jw, -jw, jw * 2, jw * 2);
  jc.restore();
  jc.globalCompositeOperation = 'source-over';
  ctx.drawImage(p.jawCanvas, jaw.x0, jaw.y0);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(mouth.x, mouth.y - mouth.w * 0.2, mouth.w * 0.85, mouth.w * 0.25, 0, 0, Math.PI * 2);
  ctx.clip();
  const hw = mouth.w * 1.15, hh = mouth.w * 0.6;
  ctx.drawImage(img, mouth.x - hw, mouth.y - hh, hw * 2, hh, mouth.x - hw, mouth.y - hh, hw * 2, hh);
  ctx.restore();
}

function drawWindowsSnow(ctx, p, v, cam, t) {
  const sc = p.w / 1080;
  p.windows.forEach((w, wi) => {
    const [ox, oy] = dispPx(p, v, cam, w.x + w.w / 2, w.y + w.h / 2, w.d ?? 0.1);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();
    ctx.fillStyle = '#fff';
    const n = Math.round((w.w * w.h) / (1400 * sc * sc));
    for (let i = 0; i < n; i++) {
      const id = i + wi * 1000;
      const sp = (25 + hash(id) * 35) * sc;
      const y = w.y + ((hash(id + 3) * w.h + t * sp) % w.h);
      const x = w.x + ((hash(id + 5) * w.w + Math.sin(t * 0.7 + id) * 8 * sc + w.w) % w.w);
      ctx.globalAlpha = 0.3 + hash(id + 9) * 0.45;
      ctx.beginPath();
      ctx.arc(x, y, (1.1 + hash(id + 11) * 2) * sc, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawLights(ctx, p, v, cam, t) {
  if (!p.lights) return;
  const sc = p.w / 1080;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of p.lights) {
    const [ox, oy] = dispPx(p, v, cam, l.x, l.y, l.d);
    const x = l.x + ox, y = l.y + oy;
    const k = 0.5 + 0.5 * Math.sin(t * l.sp + l.ph);
    const a = 0.06 + k * k * 0.3;
    const r = (7 + k * 7) * sc;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,230,170,${a})`);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

function drawFire(ctx, p, v, cam, t) {
  const F = p.fire;
  const sc = p.w / 1080;
  const [ox, oy] = p.focus !== undefined ? dispPx(p, v, cam, F.x, F.y, 0.3) : [0, 0];
  const fx = F.x + ox, fy = F.y + oy;
  const f = 0.75 + 0.25 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1) + 0.1 * Math.sin(t * 17);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(fx, fy, 5, fx, fy, F.r * 2.6);
  g.addColorStop(0, `rgba(255,150,60,${0.18 * f})`);
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(fx - F.r * 2.6, fy - F.r * 2.6, F.r * 5.2, F.r * 5.2);
  for (let i = 0; i < 14; i++) {
    const life = (t * (0.5 + hash(i) * 0.4) + hash(i + 3)) % 1;
    const x = fx - 30 * sc + hash(i + 5) * 70 * sc + Math.sin(life * 9 + i) * 8 * sc;
    const y = fy + 30 * sc - life * 170 * sc;
    ctx.globalAlpha = Math.sin(life * Math.PI) * 0.9;
    ctx.fillStyle = '#ffb04a';
    ctx.beginPath();
    ctx.arc(x, y, 1.6 * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMotes(ctx, p, t) {
  const sc = p.w / 1080;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 34; i++) {
    const life = (t * 0.05 * (0.6 + hash(i) * 0.8) + hash(i + 40)) % 1;
    const x = (hash(i + 80) * p.w + Math.sin(t * 0.3 + i) * 30 * sc + p.w) % p.w;
    const y = p.h * (0.9 - life * 0.8);
    if (p.face && Math.abs(x - p.face.x) < p.w * 0.13 && Math.abs(y - p.face.y) < p.w * 0.15) continue;
    ctx.globalAlpha = Math.sin(life * Math.PI) * (0.2 + hash(i + 7) * 0.3);
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(x, y, (1.5 + hash(i + 9) * 2.5) * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Rysuje jedno ujęcie (bez napisów) na ctx o rozmiarze OW x OH. */
function drawShot(ctx, t, st, sh) {
  const p = PROFILES[sh.kind];
  const OW = Math.round(W * RES), OH = Math.round(H * RES);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OW, OH);
  if (sh.kind === 'wideo') {
    applyCamera(ctx, p, sh.cam);
    if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, p.w, p.h);
    drawFire(ctx, p, null, sh.cam, t);
    drawMotes(ctx, p, t);
  } else {
    const v = viewFor(p, sh.cam);
    if (useGL) {
      const glc = glRender(sh.kind, { cx: v.cx / p.w, cy: v.cy / p.h, halfW: v.halfW / p.w, halfH: v.halfH / p.h },
        { par: sh.cam.par, dolly: sh.cam.dolly, focus: p.focus }, OW, OH);
      ctx.drawImage(glc, 0, 0, OW, OH);
      applyCamera(ctx, p, sh.cam);
    } else {
      applyCamera(ctx, p, sh.cam);
      ctx.drawImage(p.img, 0, 0, p.w, p.h);
    }
    if (sh.kind === 'blisko') drawJaw(ctx, p, clamp(st.mouth || 0));
    drawWindowsSnow(ctx, p, v, sh.cam, t);
    drawFire(ctx, p, v, sh.cam, t);
    drawLights(ctx, p, v, sh.cam, t);
    drawMotes(ctx, p, t);
  }
  ctx.restore();
}

function grade(ctx, t) {
  ctx.save();
  // ciepła, filmowa kolorystyka wspólna dla zdjęć i wideo
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255,170,90,0.22)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.5, H * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,3,0,0.5)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  // delikatne ziarno filmowe
  if (grainTile) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    const ox = Math.floor(hash(Math.floor(t * 25)) * 256), oy = Math.floor(hash(Math.floor(t * 25) + 9) * 256);
    ctx.translate(-ox, -oy);
    const pat = ctx.createPattern(grainTile, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W + 256, H + 256);
  }
  ctx.restore();
}

/** Rysuje kompletną klatkę filmu. */
export function drawReal(ctx, t, st, shot) {
  const OW = Math.round(W * RES), OH = Math.round(H * RES);
  if (shot.prev && shot.mix < 1) {
    drawShot(ctx, t, st, shot.prev);
    if (!layer || layer.width !== OW || layer.height !== OH) layer = makeCanvas(OW, OH);
    const lc = layer.getContext('2d');
    drawShot(lc, t, st, shot.cur);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = shot.mix;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  } else {
    drawShot(ctx, t, st, shot.cur);
  }
  ctx.save();
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  grade(ctx, t);
  ctx.restore();
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  if (st.ending > 0) {
    drawFrontSnow(ctx, t, clamp(st.ending * 1.5) * 0.75);
    drawSparkles(ctx, t * 1.6, 36, [0, 100, W, 900], clamp(st.ending * 1.5));
  }
  drawSubtitle(ctx, st.subtitle, st.mode, st.subAlpha ?? 1);
  if (st.titleAlpha > 0 && st.title) {
    ctx.save();
    ctx.globalAlpha = st.titleAlpha * 0.4;
    ctx.fillStyle = '#12060a';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const a = st.titleAlpha, rise = (1 - a) * 18;
    goldText(ctx, 'Film od', W / 2, 470 + rise, fitSize(ctx, 'Film od', 64, W - 80), a);
    goldText(ctx, 'Świętego Mikołaja', W / 2, 560 + rise, fitSize(ctx, 'Świętego Mikołaja', 78, W - 60), a);
    goldText(ctx, st.title, W / 2, 690 + rise, fitSize(ctx, st.title, 70, W - 80), a);
  }
  if (st.ending > 0.3) {
    const a = clamp((st.ending - 0.3) / 0.3);
    const sz = fitSize(ctx, 'Wesołych Świąt!', 96, W - 60);
    goldText(ctx, 'Wesołych Świąt!', W / 2, 260, sz * (0.9 + 0.1 * a), a);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
