// Tekst, który mówi Mikołaj. Każdy fragment ma kilka wersji o tym samym sensie,
// więc kolejne filmy różnią się trochę, ale przekaz jest zawsze ten sam.
// Mikołaj nie czyta listu: mówi, że go dostał, i wymienia prezenty wpisane przez rodziców.
import { splitSentences } from './g2p.js';

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];

/** Prosty, powtarzalny generator losowy (ten sam seed = ten sam tekst). */
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** "lalkę, rower, klocki" -> "lalkę, rower i klocki" */
export function formatGifts(text) {
  let g = String(text || '').replace(/\s+/g, ' ').replace(/[.!?;\s]+$/g, '').trim();
  if (!g) return '';
  const parts = g.split(/\s*,\s*|\s+oraz\s+/).filter(Boolean);
  if (parts.length > 1 && !/\si\s/.test(parts[parts.length - 1])) {
    g = parts.slice(0, -1).join(', ') + ' i ' + parts[parts.length - 1];
  }
  return g;
}

/**
 * Buduje scenariusz filmu.
 * @param {{vocative:string, gender:'m'|'f', gifts:string, seed?:number}} o
 * @returns {Array<{section:string, text:string, pauseAfter:number}>}
 */
export function buildScript({ vocative, gender, gifts, seed = Date.now() }) {
  const rnd = seeded(seed);
  const f = gender === 'f';
  const g = (m, w) => (f ? w : m);
  const G = formatGifts(gifts);

  const greeting = [
    `Ho, ho, ho! Witaj, ${g('drogi', 'droga')} ${vocative}!`,
    pick([
      'Pozdrawiam Cię serdecznie z mojej zaśnieżonej pracowni na dalekiej Północy.',
      'Mówi do Ciebie Święty Mikołaj, prosto z mojej ciepłej pracowni na Biegunie Północnym.',
      'Tu Święty Mikołaj. Pozdrawiam Cię gorąco z mojej pracowni w krainie wiecznego śniegu.',
    ], rnd),
  ];

  // sekcja "wish": w tym czasie na ekranie Mikołaj podnosi list, zakłada okulary i czyta
  const wish = [
    pick([
      'Mam tutaj list od Ciebie. Przeczytałem go bardzo uważnie, od pierwszego do ostatniego słowa.',
      'Moje elfy przyniosły mi Twój list. Założyłem okulary i przeczytałem go z wielką radością.',
      'Trzymam w dłoniach list od Ciebie. Przeczytałem go już kilka razy, tak bardzo mi się spodobał.',
    ], rnd),
  ];
  if (G) {
    wish.push(pick([
      `${g('Napisałeś', 'Napisałaś')} w nim, że bardzo ${g('chciałbyś', 'chciałabyś')} dostać ${G}.`,
      `Wiem z niego, że najbardziej ${g('chciałbyś', 'chciałabyś')} dostać ${G}.`,
      `${g('Napisałeś', 'Napisałaś')}, że marzysz o tym, żeby dostać ${G}.`,
    ], rnd));
  }

  const good = pick([
    `Wiem, że przez cały rok ${g('byłeś bardzo grzecznym chłopcem', 'byłaś bardzo grzeczną dziewczynką')}. Opowiedzieli mi o tym Twoi bliscy, a i ja sam widziałem to nie raz, kiedy zaglądałem przez okno.`,
    `Twoi bliscy powiedzieli mi, że przez cały rok ${g('byłeś bardzo grzeczny', 'byłaś bardzo grzeczna')}. Ja też to widziałem, gdy po cichutku zaglądałem przez okno.`,
    `Z tego, co opowiedzieli mi Twoi bliscy, i z tego, co sam widziałem przez okno, wiem, że przez cały rok ${g('byłeś bardzo grzeczny', 'byłaś bardzo grzeczna')}.`,
  ], rnd);

  const sorry = pick([
    'Muszę Ci jednak coś powiedzieć. W tym roku nie dam rady odwiedzić Cię osobiście. Na całym świecie czeka na mnie tak wiele dzieci, że moje renifery ledwo nadążają.',
    'Mam też dla Ciebie pewną wiadomość. Bardzo przepraszam, ale tym razem nie przyjadę do Ciebie osobiście. Mam do odwiedzenia mnóstwo dzieci na całym świecie, a noc wigilijna jest taka krótka.',
    'Wybacz mi, proszę, że w tym roku nie zapukam do Twoich drzwi. Muszę odwiedzić tyle dzieci na całym świecie, że nawet moje najszybsze renifery ledwo dają radę.',
  ], rnd);

  const presents = G
    ? pick([
      `Ale nie martw się! Moje elfy już pakują ${G}. W wigilijny wieczór znajdziesz wszystko pod choinką.`,
      `Ale nic się nie martw. Prezenty, o które ${g('prosiłeś', 'prosiłaś')}, będą na Ciebie czekały pod choinką w Wigilię. Elfy już pakują ${G}.`,
      `Obiecuję Ci, że w Wigilię pod Twoją choinką znajdziesz ${G}. Moje elfy właśnie je pakują.`,
    ], rnd)
    : pick([
      `Ale nie martw się! Prezenty, o które ${g('prosiłeś', 'prosiłaś')}, będą na Ciebie czekały pod choinką w wigilijny wieczór.`,
      `Obiecuję Ci jednak, że w Wigilię pod Twoją choinką pojawią się prezenty, o których ${g('pisałeś', 'pisałaś')} w liście. Elfy już je starannie pakują.`,
    ], rnd);

  const advice = pick([
    `Pamiętaj, ${g('bądź grzeczny', 'bądź grzeczna')} i pilnie się ucz przez cały przyszły rok. Ja i moje elfy wciąż na Ciebie patrzymy.`,
    `Proszę Cię, ${g('bądź grzeczny', 'bądź grzeczna')} i dobrze się ucz także w przyszłym roku. Pamiętaj, że cały czas Cię obserwuję.`,
    `A w przyszłym roku ${g('bądź tak samo grzeczny', 'bądź tak samo grzeczna')} i ucz się pilnie. Będę na Ciebie patrzył z mojej pracowni.`,
  ], rnd);

  const ending = 'Ho, ho, ho! Wesołych Świąt Bożego Narodzenia!';

  const out = [];
  const push = (section, text, pauseAfter = 0.45) => {
    for (const s of splitSentences(text)) out.push({ section, text: s, pauseAfter: 0.45 });
    if (out.length) out[out.length - 1].pauseAfter = pauseAfter;
  };
  push('greeting', greeting[0], 0.6);
  push('greeting', greeting[1], 0.8);
  wish.forEach((t) => push('wish', t, 0.8));
  push('reply', good, 0.8);
  push('reply', sorry, 0.8);
  push('gifts', presents, 0.8);
  push('reply', advice, 0.9);
  push('ending', ending, 0);
  return out;
}
