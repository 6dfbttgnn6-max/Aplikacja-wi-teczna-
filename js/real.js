// Realistyczny film: montaż kilku ujęć.
//  - "pracownia": ilustracja z elfami i reniferem (plan ogólny, przebitki),
//  - "mikolaj":   zbliżenie na Mikołaja (klatka z wideo) z ruchem ust zsynchronizowanym z głosem,
//  - "wideo":     prawdziwe wideo, w którym Mikołaj zakłada okulary i czyta list.
// Do tego: ogień, mrugające światełka, śnieg za oknami, iskierki, ruch kamery, przejścia, napisy.
import { W, H, drawSubtitle, goldText, fitSize, drawFrontSnow, drawSparkles } from './scene.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Geometria ujęć (w pikselach danego obrazu)
const PROFILES = {
  pracownia: {
    src: '../img/mikolaj.jpg', w: 1080, h: 1920,
    mouth: { x: 595, y: 653, w: 44 }, jaw: { x0: 538, x1: 652, y0: 651, y1: 748 }, jawDrop: 8.5,
    face: { x: 595, y: 640 }, fire: { x: 1030, y: 760, r: 110 },
    windows: [{ x: 250, y: 250, w: 112, h: 350 }, { x: 672, y: 30, w: 208, h: 630 }],
  },
  mikolaj: {
    src: '../img/mikolaj-blisko.jpg', w: 768, h: 1344,
    mouth: { x: 375, y: 494, w: 74 }, jaw: { x0: 322, x1: 432, y0: 491, y1: 600 }, jawDrop: 11,
    face: { x: 375, y: 440 }, fire: { x: 735, y: 650, r: 75 },
    windows: [{ x: 64, y: 14, w: 178, h: 470 }],
  },
  wideo: {
    w: 768, h: 1344, fire: { x: 735, y: 650, r: 75 }, windows: [],
  },
};
export const VIDEO_SRC = '../img/czytanie.mp4';
// Klip czytania: 0-1 s patrzy w kamerę, 1-9 s podnosi list, zakłada okulary, rozwija; 9-14,9 s czyta.
const V_START = 1.0, V_LOOP_A = 9.0, V_LOOP_B = 14.9;

let RES = 1; // 1 = 720x1280, 1.5 = 1080x1920
export function setResolution(r) { RES = r; }

let loaded = false;
let video = null;

function makeCanvas(w, h) {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}

function detectLights(img, p) {
  const c = makeCanvas(p.w, p.h);
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, p.w, p.h);
  const data = cx.getImageData(0, 0, p.w, p.h).data;
  const found = [];
  const step = Math.max(4, Math.round(p.w / 216));
  for (let y = 4; y < p.h - 4; y += step) {
    for (let x = 4; x < p.w - 4; x += step) {
      const i = (y * p.w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      if (lum < 225 || r - b < 35) continue;
      if (p.jaw && x > p.jaw.x0 - 70 && x < p.jaw.x1 + 70 && y > p.face.y - 140 && y < p.jaw.y1 + 40) continue;
      if (found.some((q) => Math.abs(q.x - x) < p.w / 66 && Math.abs(q.y - y) < p.w / 66)) continue;
      found.push({ x, y, lum });
    }
  }
  found.sort((a, b) => b.lum - a.lum);
  return found.slice(0, 160).map((q, k) => ({ ...q, ph: hash(k + 7) * Math.PI * 2, sp: 1.5 + hash(k + 70) * 2.5 }));
}

/** Wczytuje obrazy i klip (raz). */
export async function loadReal() {
  if (loaded) return;
  await Promise.all(['pracownia', 'mikolaj'].map(async (k) => {
    const p = PROFILES[k];
    const im = new Image();
    im.src = new URL(p.src, import.meta.url).href;
    await im.decode();
    p.img = im;
    p.lights = detectLights(im, p);
    p.jawCanvas = makeCanvas(p.jaw.x1 - p.jaw.x0, p.jaw.y1 - p.jaw.y0 + 40);
  }));
  loaded = true;
}

/** Wczytuje klip czytania do pamięci (szybkie i pewne przewijanie, także na iPhonie). */
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

/** Przewija klip dokładnie do czasu t (tryb renderowania klatka po klatce). */
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

/** Tryb nagrywania na żywo: klip gra sam, poprawiamy go tylko przy dużym rozjechaniu. */
export function syncVideoLive(shot) {
  if (!video) return;
  if (shot.kind === 'wideo') {
    if (video.paused) { video.currentTime = shot.vt; video.play().catch(() => {}); }
    else if (Math.abs(video.currentTime - shot.vt) > 0.35) video.currentTime = shot.vt;
  } else if (!video.paused) video.pause();
}

// ---------------------------------------------------------------- montaż

/** Lista ujęć dla filmu: [{kind, start, end, cam:[od, do]}] */
function buildShots(film) {
  const tl = film.timeline;
  const D = film.duration;
  const first = tl.length ? tl[0].start : 3;
  const letters = tl.filter((x) => x.section === 'letter');
  const shots = [];
  const push = (kind, start, end, from, to) => { if (end - start > 0.05) shots.push({ kind, start, end, cam: [from, to] }); };
  const close = (z, y) => ({ z, x: 384, y });
  // 1. plan ogólny pracowni z tytułem
  push('pracownia', 0, first - 0.15, { z: 1.0, x: 540, y: 960 }, { z: 1.12, x: 560, y: 900 });
  if (!letters.length) {
    push('mikolaj', first - 0.15, D, close(1.05, 700), close(1.3, 600));
    return shots;
  }
  const ls = letters[0].start - V_START - 0.2;
  const le = letters[letters.length - 1].end + 0.6;
  // 2. powitanie: zbliżenie na Mikołaja
  push('mikolaj', first - 0.15, ls, close(1.0, 700), close(1.32, 600));
  // 3. czytanie listu: prawdziwe wideo
  push('wideo', ls, le, { z: 1.0, x: 384, y: 672 }, { z: 1.1, x: 384, y: 640 });
  // 4. reszta: przebitki na pracownię z elfami przy podziękowaniu i przy prezentach
  const after = tl.filter((x) => x.start > le - 0.1);
  let cursor = le;
  const gifts = after.filter((x) => x.section === 'gifts');
  const thanksEnd = after.length ? after[0].end + 0.3 : le + 3;
  push('pracownia', cursor, Math.min(thanksEnd, D), { z: 1.75, x: 820, y: 1440 }, { z: 1.9, x: 880, y: 1470 });
  cursor = Math.min(thanksEnd, D);
  const last = tl[tl.length - 1];
  const endWide = last ? Math.max(cursor, last.end - 0.2) : D;
  if (gifts.length) {
    const gs = gifts[0].start - 0.25, ge = gifts[gifts.length - 1].end + 0.3;
    push('mikolaj', cursor, gs, close(1.1, 660), close(1.3, 590));
    push('pracownia', gs, ge, { z: 1.8, x: 900, y: 1450 }, { z: 1.6, x: 420, y: 1500 });
    cursor = ge;
  }
  push('mikolaj', cursor, endWide, close(1.15, 640), close(1.38, 580));
  // 5. finał: cała pracownia
  push('pracownia', endWide, D, { z: 1.2, x: 560, y: 980 }, { z: 1.0, x: 540, y: 960 });
  return shots;
}

/** Ujęcie i kamera w chwili t. */
export function shotAt(t, film) {
  if (!film) {
    // podgląd na stronie: powolny ruch po pracowni
    const k = 0.5 - 0.5 * Math.cos(t * 0.12);
    return { kind: 'pracownia', cam: { z: lerp(1.0, 1.3, k), x: lerp(540, 610, k), y: lerp(960, 860, k) }, dip: 0 };
  }
  if (!film.shots) film.shots = buildShots(film);
  const shots = film.shots;
  let sh = shots.find((s) => t >= s.start && t < s.end) || shots[shots.length - 1];
  const k = ease(clamp((t - sh.start) / Math.max(0.1, sh.end - sh.start)));
  const sway = { x: Math.sin(t * 0.37) * 4, y: Math.sin(t * 0.29 + 1) * 3 };
  const cam = {
    z: lerp(sh.cam[0].z, sh.cam[1].z, k),
    x: lerp(sh.cam[0].x, sh.cam[1].x, k) + sway.x,
    y: lerp(sh.cam[0].y, sh.cam[1].y, k) + sway.y,
  };
  // krótkie przyciemnienie na cięciu (oprócz początku i końca filmu)
  const DIP = 0.22;
  let dip = 0;
  if (sh.start > 0.01) dip = Math.max(dip, 1 - (t - sh.start) / DIP);
  if (sh.end < film.duration - 0.01) dip = Math.max(dip, 1 - (sh.end - t) / DIP);
  const out = { kind: sh.kind, cam, dip: clamp(dip) * 0.85 };
  if (sh.kind === 'wideo') {
    const u = t - sh.start;
    const intro = V_LOOP_A - V_START;
    if (u < intro) out.vt = V_START + u;
    else {
      const L = V_LOOP_B - V_LOOP_A;
      const p = (u - intro) % (2 * L);
      out.vt = film.live ? V_LOOP_A + ((u - intro) % L) : (p < L ? V_LOOP_A + p : V_LOOP_B - (p - L));
    }
  }
  return out;
}

// ---------------------------------------------------------------- rysowanie

function applyCamera(ctx, p, cam) {
  const base = Math.max(W / p.w, H / p.h);
  const s = base * cam.z * RES;
  const halfW = (W * RES) / s / 2, halfH = (H * RES) / s / 2;
  const cx = clamp(cam.x, halfW, p.w - halfW);
  const cy = clamp(cam.y, halfH, p.h - halfH);
  ctx.setTransform(s, 0, 0, s, (W * RES) / 2 - cx * s, (H * RES) / 2 - cy * s);
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
  // górna warga i wąsy zostają na miejscu
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(mouth.x, mouth.y - mouth.w * 0.2, mouth.w * 0.85, mouth.w * 0.25, 0, 0, Math.PI * 2);
  ctx.clip();
  const hw = mouth.w * 1.15, hh = mouth.w * 0.6;
  ctx.drawImage(img, mouth.x - hw, mouth.y - hh, hw * 2, hh, mouth.x - hw, mouth.y - hh, hw * 2, hh);
  ctx.restore();
}

function drawWindowsSnow(ctx, p, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const sc = p.w / 1080;
  p.windows.forEach((w, wi) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();
    const n = Math.round((w.w * w.h) / (1400 * sc * sc));
    for (let i = 0; i < n; i++) {
      const id = i + wi * 1000;
      const sp = (25 + hash(id) * 35) * sc;
      const y = w.y + ((hash(id + 3) * w.h + t * sp) % w.h);
      const x = w.x + ((hash(id + 5) * w.w + Math.sin(t * 0.7 + id) * 8 * sc + w.w) % w.w);
      ctx.globalAlpha = 0.35 + hash(id + 9) * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, (1.1 + hash(id + 11) * 2) * sc, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawLights(ctx, p, t) {
  if (!p.lights) return;
  const sc = p.w / 1080;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of p.lights) {
    const k = 0.5 + 0.5 * Math.sin(t * l.sp + l.ph);
    const a = 0.08 + k * k * 0.32;
    const r = (7 + k * 6) * sc;
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, `rgba(255,230,170,${a})`);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
  }
  ctx.restore();
}

function drawFire(ctx, p, t) {
  const F = p.fire;
  const sc = p.w / 1080;
  const f = 0.75 + 0.25 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1) + 0.1 * Math.sin(t * 17);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(F.x, F.y, 5, F.x, F.y, F.r * 2.6);
  g.addColorStop(0, `rgba(255,150,60,${0.2 * f})`);
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(F.x - F.r * 2.6, F.y - F.r * 2.6, F.r * 5.2, F.r * 5.2);
  for (let i = 0; i < 14; i++) {
    const life = (t * (0.5 + hash(i) * 0.4) + hash(i + 3)) % 1;
    const x = F.x - 30 * sc + hash(i + 5) * 70 * sc + Math.sin(life * 9 + i) * 8 * sc;
    const y = F.y + 30 * sc - life * 170 * sc;
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
  for (let i = 0; i < 36; i++) {
    const life = (t * 0.05 * (0.6 + hash(i) * 0.8) + hash(i + 40)) % 1;
    const x = (hash(i + 80) * p.w + Math.sin(t * 0.3 + i) * 30 * sc + p.w) % p.w;
    const y = p.h * (0.9 - life * 0.8);
    if (p.face && Math.abs(x - p.face.x) < p.w * 0.13 && Math.abs(y - p.face.y) < p.w * 0.15) continue;
    ctx.globalAlpha = Math.sin(life * Math.PI) * (0.25 + hash(i + 7) * 0.35);
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(x, y, (1.5 + hash(i + 9) * 2.5) * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function grade(ctx) {
  const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.28, W / 2, H * 0.5, H * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(8,3,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Rysuje klatkę.
 * st: stan z stateAt() (mouth, subtitle, mode, title, titleAlpha, ending); shot: z shotAt()
 */
export function drawReal(ctx, t, st, shot) {
  ctx.save();
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const p = PROFILES[shot.kind];
  applyCamera(ctx, p, shot.cam);
  if (shot.kind === 'wideo') {
    if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, p.w, p.h);
    drawFire(ctx, p, t);
  } else {
    ctx.drawImage(p.img, 0, 0, p.w, p.h);
    // usta ruszają się tylko w zbliżeniu (w planie ogólnym twarz jest mała, a mówi lektor)
    if (shot.kind === 'mikolaj') drawJaw(ctx, p, clamp(st.mouth || 0));
    drawWindowsSnow(ctx, p, t);
    drawFire(ctx, p, t);
    drawLights(ctx, p, t);
  }
  drawMotes(ctx, p, t);
  ctx.restore();
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  grade(ctx);
  if (shot.dip > 0) {
    ctx.fillStyle = `rgba(0,0,0,${shot.dip})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (st.ending > 0) {
    drawFrontSnow(ctx, t, clamp(st.ending * 1.5) * 0.8);
    drawSparkles(ctx, t * 1.6, 36, [0, 100, W, 900], clamp(st.ending * 1.5));
  }
  drawSubtitle(ctx, st.subtitle, st.mode, st.subAlpha ?? 1);
  if (st.titleAlpha > 0 && st.title) {
    ctx.save();
    ctx.globalAlpha = st.titleAlpha * 0.45;
    ctx.fillStyle = '#12060a';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    goldText(ctx, 'Film od', W / 2, 470, fitSize(ctx, 'Film od', 64, W - 80), st.titleAlpha);
    goldText(ctx, 'Świętego Mikołaja', W / 2, 560, fitSize(ctx, 'Świętego Mikołaja', 78, W - 60), st.titleAlpha);
    goldText(ctx, st.title, W / 2, 690, fitSize(ctx, st.title, 70, W - 80), st.titleAlpha);
  }
  if (st.ending > 0.3) {
    const a = clamp((st.ending - 0.3) / 0.3);
    const sz = fitSize(ctx, 'Wesołych Świąt!', 96, W - 60);
    goldText(ctx, 'Wesołych Świąt!', W / 2, 260, sz * (0.9 + 0.1 * a), a);
  }
}
