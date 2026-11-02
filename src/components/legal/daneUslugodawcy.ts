/**
 * Dane, których NIE da się wziąć z kodu — musi je podać osoba prowadząca serwis.
 *
 * Dopóki którekolwiek pole zaczyna się od „[", obie strony oznaczają się jako SZKIC
 * (patrz `SZKIC` niżej): dokument z wymyślonym usługodawcą jest GORSZY niż jego brak,
 * bo wygląda na wiążący.
 */
export const USLUGODAWCA = {
  /** Imię i nazwisko albo nazwa działalności wraz z NIP-em. */
  nazwa: "[imię i nazwisko albo nazwa firmy prowadzącej serwis]",
  /** Adres, pod który realnie trafi „proszę o usunięcie moich danych" i reklamacja.
   *  Nie jest to skrzynka, tylko przekierowanie (Cloudflare Email Routing) na prywatny
   *  adres — z punktu widzenia czytelnika bez różnicy, ale warto wiedzieć, że odpowiedź
   *  wyjdzie z innego adresu, dopóki nie dojdzie prawdziwa skrzynka. */
  email: "kontakt@pomocnikelektryka.pl",
  /** Region serwerów Supabase (Supabase → Settings → General → Region). Irlandia leży
   *  w Europejskim Obszarze Gospodarczym, więc dane konta i projekty go NIE opuszczają —
   *  i dokładnie to mówi akapit o przekazywaniu danych w polityce. Zmiana regionu na
   *  pozaeuropejski wymagałaby przepisania także tamtego akapitu. */
  regionDanych: "West EU (Irlandia)",
} as const;

/** Czy dokumenty mają jeszcze nieuzupełnione miejsca. */
export const SZKIC = Object.values(USLUGODAWCA).some((v) => v.startsWith("["));
