# Film od Świętego Mikołaja

Aplikacja w przeglądarce (Android i iPhone): rodzic wpisuje imię dziecka i jego list, a aplikacja tworzy film MP4,
w którym Święty Mikołaj wita dziecko po imieniu, czyta list, odpowiada i życzy Wesołych Świąt.

Wszystko dzieje się na telefonie. Imię i list nie są nigdzie wysyłane.

## Jak to działa

| Element | Rozwiązanie |
|---|---|
| Głos | Darmowy model mowy Piper `pl_PL mc_speech` uruchamiany w przeglądarce (onnxruntime-web). Model (ok. 63 MB) pobiera się z Hugging Face za pierwszym razem i zostaje w pamięci przeglądarki. Głos jest obniżony i ma pogłos „pracowni”. |
| Wymowa | Własna zamiana pisowni na głoski (`js/g2p.js`), bo fonetyzator WASM gubi polskie znaki. |
| Imię | Automatyczny wołacz (`js/names.js`: Zosia → Zosiu, Jan → Janie), z możliwością ręcznej poprawki. |
| Tekst Mikołaja | `js/script.js`: kilka wersji każdego fragmentu, ten sam sens, forma zależna od płci. |
| Obraz | Montaż w `js/real.js`: plan ogólny pracowni z elfami (`img/mikolaj.jpg`), zbliżenie na Mikołaja z ruchem ust zsynchronizowanym z głosem (`img/mikolaj-blisko.jpg`) i prawdziwe wideo czytania listu w okularach (`img/czytanie.mp4`, wygenerowane w Canva). Do tego ogień, światełka, śnieg, ruch kamery, przejścia i napisy. |
| Muzyka | „Cicha noc” (F. X. Gruber, 1818, domena publiczna) generowana w przeglądarce, ciszej, gdy Mikołaj mówi, plus dzwoneczki sań. |
| Plik | WebCodecs + mp4-muxer (H.264 + AAC), a gdy telefon tego nie obsługuje, nagrywanie przez MediaRecorder. |

## Uruchomienie lokalne

Dowolny serwer plików statycznych, np. `python3 -m http.server` w tym folderze, potem `http://localhost:8000`.

Test odmiany imion: `node tests/names.check.mjs`.

## Licencje

Czcionki Lobster i Nunito: SIL Open Font License (pliki w `fonts/`). onnxruntime-web: MIT. mp4-muxer: MIT. Ilustracja: wygenerowana w Canva (AI).
Piper: MIT; model głosu `mc_speech`: zgodnie z licencją podaną w repozytorium modeli Piper.
