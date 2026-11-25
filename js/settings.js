// Ustawienia filmu (zapamiętywane na tym telefonie).
const KEY = 'mikolaj-ustawienia-v1';
export const DEFAULTS = {
  letterTempo: 0.8,   // tempo czytania listu (1 = normalne)
  santaTempo: 0.92,   // tempo pozostałych słów Mikołaja
  pause: 1.4,         // mnożnik pauz między zdaniami
  pitch: 0.87,        // wysokość głosu (mniej = niżej)
  music: 0.8,         // głośność muzyki
  subtitles: true,
  quality: 'high',    // 'high' = 1080p, 'standard' = 720p
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* brak dostępu do pamięci */ }
  return { ...DEFAULTS };
}

function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* */ }
}

const pct = (v) => Math.round(v * 100) + '%';
const FIELDS = [
  { id: 'letterTempo', fmt: pct },
  { id: 'santaTempo', fmt: pct },
  { id: 'pause', fmt: (v) => (v < 1.1 ? 'krótkie' : v < 1.6 ? 'średnie' : 'długie') },
  { id: 'pitch', fmt: (v) => (v < 0.84 ? 'bardzo niski' : v < 0.9 ? 'niski' : v < 0.96 ? 'średni' : 'naturalny') },
  { id: 'music', fmt: (v) => (v === 0 ? 'wyłączona' : pct(v)) },
];

export function initSettingsUI() {
  const s = getSettings();
  for (const f of FIELDS) {
    const el = document.getElementById('set-' + f.id);
    const out = document.getElementById('out-' + f.id);
    if (!el) continue;
    el.value = s[f.id];
    out.textContent = f.fmt(+el.value);
    el.addEventListener('input', () => {
      const cur = getSettings();
      cur[f.id] = +el.value;
      out.textContent = f.fmt(+el.value);
      save(cur);
    });
  }
  const subs = document.getElementById('set-subtitles');
  subs.checked = s.subtitles;
  subs.addEventListener('change', () => { const cur = getSettings(); cur.subtitles = subs.checked; save(cur); });
  const q = document.getElementById('set-quality');
  q.value = s.quality;
  q.addEventListener('change', () => { const cur = getSettings(); cur.quality = q.value; save(cur); });
  document.getElementById('set-reset').addEventListener('click', () => {
    save({ ...DEFAULTS });
    for (const f of FIELDS) {
      const el = document.getElementById('set-' + f.id);
      el.value = DEFAULTS[f.id];
      document.getElementById('out-' + f.id).textContent = f.fmt(DEFAULTS[f.id]);
    }
    subs.checked = DEFAULTS.subtitles;
    q.value = DEFAULTS.quality;
  });
}
