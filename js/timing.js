// Wspólne zgranie czasu klipu "czytanie.mp4" z filmem (używane przez montaż i dźwięk).
// Klip: 0-1 s patrzy w kamerę, 1-3,5 s podnosi list, 3,5-8,8 s zakłada okulary i rozwija list,
// od 8,8 s czyta. Zakładanie okularów lekko przyspieszamy, żeby pauza w mowie nie była za długa.
export const V = { start: 1.0, liftEnd: 3.5, readStart: 8.8, loopA: 9.0, loopB: 14.9, ramp: 1.5 };

const LIFT = V.liftEnd - V.start;                  // 2,5 s
const GLASSES = (V.readStart - V.liftEnd) / V.ramp; // ok. 3,5 s

/** Ile sekund filmu po starcie wideo Mikołaj zaczyna czytać. */
export const READ_OFFSET = LIFT + GLASSES;

/** Czas w klipie dla u sekund od początku ujęcia z wideo. */
export function clipTime(u, live = false) {
  u = Math.max(0, u);
  if (u < LIFT) return V.start + u;
  if (u < LIFT + GLASSES) return V.liftEnd + (u - LIFT) * V.ramp;
  const r = u - LIFT - GLASSES;
  const first = V.loopB - V.readStart;
  if (r < first) return V.readStart + r;
  const L = V.loopB - V.loopA;
  const q = r - first;
  if (live) return V.loopA + (q % L);
  const p = q % (2 * L);
  return p < L ? V.loopB - p : V.loopA + (p - L); // płynnie w tył i w przód
}

/** Prędkość odtwarzania klipu (dla nagrywania na żywo). */
export function clipRate(u) {
  return u >= LIFT && u < LIFT + GLASSES ? V.ramp : 1;
}

/** Odwrotnie: po ilu sekundach od startu wideo pojawia się dana chwila klipu (do efektów dźwiękowych). */
export function filmOffset(vt) {
  if (vt <= V.liftEnd) return Math.max(0, vt - V.start);
  if (vt <= V.readStart) return LIFT + (vt - V.liftEnd) / V.ramp;
  return LIFT + GLASSES + (vt - V.readStart);
}
