import { vocative, guessGender } from './names.js';
import { buildScript, countWords } from './script.js';
import { loadVoice, synthesize, sampleRate, VOICES } from './tts.js';
import { buildSoundtrack } from './audio.js';
import { renderFilm } from './render.js';
import { W, H } from './scene.js';
import { loadReal, loadVideo, drawReal, shotAt, setResolution } from './real.js';
import { getSettings, initSettingsUI } from './settings.js';

const $ = (s) => document.querySelector(s);
const MAX_WORDS = 200;
const FPS = 25;

const els = {
  name: $('#name'), boy: $('#boy'), girl: $('#girl'), voc: $('#voc'), vocEdit: $('#vocEdit'),
  vocRow: $('#vocRow'), greet: $('#greet'), letter: $('#letter'), count: $('#count'), go: $('#go'),
  form: $('#form'), progress: $('#progress'), step: $('#step'), bar: $('#bar'), pct: $('#pct'),
  result: $('#result'), video: $('#video'), share: $('#share'), download: $('#download'), again: $('#again'),
  hero: $('#hero'), error: $('#error'), note: $('#note'),
};

let gender = null;
let vocManual = false;

function setGender(g) {
  gender = g;
  els.boy.classList.toggle('on', g === 'm');
  els.girl.classList.toggle('on', g === 'f');
  els.boy.setAttribute('aria-pressed', g === 'm');
  els.girl.setAttribute('aria-pressed', g === 'f');
  updateVoc();
}

function updateVoc() {
  const n = els.name.value.trim();
  if (!vocManual) els.voc.value = n && gender ? vocative(n, gender) : '';
  const v = els.voc.value.trim();
  els.greet.textContent = v && gender ? `„Ho, ho, ho! Witaj, ${gender === 'f' ? 'droga' : 'drogi'} ${v}!”` : '…';
  validate();
}

function validate() {
  const words = countWords(els.letter.value);
  els.count.textContent = `${words} / ${MAX_WORDS} słów`;
  els.count.classList.toggle('over', words > MAX_WORDS);
  const ok = els.name.value.trim() && gender && els.voc.value.trim() && words > 0 && words <= MAX_WORDS;
  els.go.disabled = !ok;
  return ok;
}

els.name.addEventListener('input', () => {
  if (!gender) {
    const g = guessGender(els.name.value);
    if (g) { gender = null; setGender(g); return; }
  }
  updateVoc();
});
els.boy.addEventListener('click', () => setGender('m'));
els.girl.addEventListener('click', () => setGender('f'));
els.voc.addEventListener('input', () => { vocManual = true; updateVoc(); });
els.vocEdit.addEventListener('click', () => { els.vocRow.hidden = false; els.voc.focus(); });
els.letter.addEventListener('input', validate);

// ---------- scena na stronie (animacja "na żywo")
const heroCtx = els.hero.getContext('2d');
els.hero.width = W; els.hero.height = H;
let heroOn = true;
const t0 = performance.now();
function heroLoop() {
  if (!heroOn) return;
  const t = (performance.now() - t0) / 1000;
  drawReal(heroCtx, t, { mouth: 0 }, shotAt(t, null));
  requestAnimationFrame(heroLoop);
}
Promise.all([document.fonts.ready, loadReal()]).then(() => requestAnimationFrame(heroLoop));

// ---------- generowanie
function progress(step, frac) {
  els.step.textContent = step;
  const p = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  els.bar.style.width = p + '%';
  els.pct.textContent = p + '%';
}

let lastUrl = null;

/** Pokazuje przycisk i czeka na dotknięcie (Safari wymaga dotyku, żeby włączyć dźwięk). */
function askForTap(onTap) {
  return new Promise((resolve) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'go';
    btn.textContent = '🔊 Dotknij, aby nagrać film z dźwiękiem';
    els.progress.appendChild(btn);
    btn.addEventListener('click', async () => {
      try { await onTap(); } catch { /* */ }
      btn.remove();
      resolve();
    }, { once: true });
  });
}
let lastFile = null;

async function makeFilm() {
  if (!validate()) return;
  els.error.hidden = true;
  // AudioContext musi powstać w momencie kliknięcia (wymóg iPhone'a)
  let audioCtx = null;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
    // iPhone: krótki cichy dźwięk w chwili dotknięcia "odblokowuje" silnik audio
    const b = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const s = audioCtx.createBufferSource();
    s.buffer = b; s.connect(audioCtx.destination); s.start(0);
  } catch { /* później */ }
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch { /* brak */ }

  els.form.hidden = true;
  els.result.hidden = true;
  els.progress.hidden = false;
  try {
    const name = els.name.value.trim();
    const voc = els.voc.value.trim();
    progress('Pobieram głos Świętego Mikołaja (tylko za pierwszym razem, ok. 63 MB)…', 0);
    await loadVoice(VOICES.mc_speech, (f) => progress('Pobieram głos Świętego Mikołaja (tylko za pierwszym razem, ok. 63 MB)…', f * 0.98));

    const cfg = getSettings();
    const script = buildScript({ vocative: voc, gender, letter: els.letter.value });
    for (const s of script) s.pauseAfter *= s.section === 'letter' ? cfg.pause : Math.max(1, cfg.pause * 0.8);
    const segs = [];
    for (let i = 0; i < script.length; i++) {
      progress('Mikołaj nagrywa swoje słowa…', i / script.length);
      const sec = script[i].section;
      const tempo = sec === 'letter' ? cfg.letterTempo : cfg.santaTempo;
      const audio = await synthesize(script[i].text, { lengthScale: 1.1 / tempo });
      segs.push({ ...script[i], audio });
      await new Promise((r) => setTimeout(r, 0));
    }
    progress('Elfy dodają muzykę i dzwoneczki…', 0.5);
    const track = await buildSoundtrack(segs, sampleRate(), { fps: FPS, pitch: cfg.pitch, music: cfg.music });
    const film = { ...track, subtitles: cfg.subtitles, titleText: `${gender === 'f' ? 'Droga' : 'Drogi'} ${voc}!` };

    heroOn = false;
    els.hero.classList.add('rendering');
    const res = await renderFilm(film, els.hero, {
      quality: cfg.quality,
      requestGesture: askForTap,
      audioCtx,
      onProgress: (f) => progress('Elfy montują film… Nie wyłączaj ekranu.', f),
    });
    const fileName = `film-od-swietego-mikolaja-${name.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/ł/g, 'l').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}.${res.ext}`;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(res.blob);
    lastFile = new File([res.blob], fileName, { type: res.mime });
    els.video.src = lastUrl;
    els.download.href = lastUrl;
    els.download.download = fileName;
    els.share.hidden = !(navigator.canShare && navigator.canShare({ files: [lastFile] }));
    const notes = [];
    if (res.ext !== 'mp4') notes.push('Uwaga: ten telefon zapisał film w formacie WebM. Jeśli WhatsApp go nie przyjmie, otwórz aplikację w Chrome (Android) lub Safari (iPhone).');
    if (res.audioOk === false) notes.push('⚠️ Ten film wyszedł BEZ DŹWIĘKU. Kliknij „Zrób kolejny film” i spróbuj jeszcze raz, nie wyłączając ekranu i nie przełączając aplikacji.');
    if (res.audioOk === true) notes.push('Dźwięk w filmie: sprawdzony ✓. Jeśli go nie słychać, podgłośnij telefon i sprawdź przełącznik wyciszenia z boku iPhone\'a.');
    notes.push(`Sposób zapisu: ${res.method.kind === 'webcodecs' ? 'szybki' : 'na żywo'} (${res.mime}${res.method.audio ? ', ' + res.method.audio : ''}).`);
    els.note.textContent = notes.join(' ');
    els.progress.hidden = true;
    els.result.hidden = false;
    els.result.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    els.progress.hidden = true;
    els.form.hidden = false;
    els.error.hidden = false;
    els.error.textContent = 'Coś poszło nie tak: ' + (e && e.message ? e.message : e) + ' Spróbuj jeszcze raz.';
  } finally {
    els.hero.classList.remove('rendering');
    setResolution(1);
    els.hero.width = W; els.hero.height = H;
    heroOn = true;
    requestAnimationFrame(heroLoop);
    try { await wake?.release(); } catch { /* */ }
    try { audioCtx?.close(); } catch { /* */ }
  }
}

els.go.addEventListener('click', makeFilm);
els.share.addEventListener('click', async () => {
  try { await navigator.share({ files: [lastFile], title: 'Film od Świętego Mikołaja' }); } catch { /* anulowano */ }
});
els.again.addEventListener('click', () => {
  els.result.hidden = true;
  els.form.hidden = false;
  els.form.scrollIntoView({ behavior: 'smooth' });
});

validate();
initSettingsUI();
