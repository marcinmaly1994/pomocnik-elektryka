/**
 * Mapowanie adresu URL na widok aplikacji i z powrotem.
 *
 * Do tej pory cała nawigacja żyła w `useState` w App.tsx, więc aplikacja miała
 * dokładnie jeden adres („/"). Skutki były trzy i wszystkie bolały: nie dało się
 * podlinkować konkretnego kalkulatora ani protokołu (a to są rzeczy, które
 * naturalnie wysyła się komuś linkiem), przycisk „wstecz" wyrzucał ze strony
 * zamiast cofać o krok, a odświeżenie zawsze lądowało na zakładce startowej.
 *
 * Moduł jest CZYSTY — bez dotykania `window` — żeby mapowanie dało się przetestować
 * bez montowania aplikacji ani udawania historii przeglądarki. Stroną „żywą"
 * (pushState/popstate) zajmuje się `useRoute` w hooks/useRoute.ts.
 */

/**
 * Widoki najwyższego poziomu. Kolejność bez znaczenia — to zbiór, nie lista.
 *
 * Nie każdy z nich jest ZAKŁADKĄ w sensie interfejsu. „prywatnosc” i „regulamin” to strony
 * towarzyszące, do których wchodzi się linkiem ze stopki,
 * z Pomocy i z formularza rejestracji — nie ma kafla w przepływie ani pozycji
 * w pasku narzędzi. Siedzi tu mimo to, bo dzięki temu dostaje bez ani jednej
 * linijki osobnej maszynerii wszystko, co ma reszta: własny adres do wysłania,
 * „wstecz”, przeładowanie pod bezpośrednim linkiem i cofnięcie do strony
 * startowej przy literówce.
 *
 * Kroki przepływu 1→4 to OSOBNA lista (`KOLEJNOSC_KROKOW` w App.tsx) i to ona,
 * a nie ten typ, decyduje o nawigacji „Dalej/Cofnij” i o pasku przykładu.
 */
export type AppTab =
  | "kalkulatory"
  | "projekt"
  | "rozdzielnica"
  | "protokoly"
  | "schemat"
  | "kosztorys"
  | "prywatnosc"
  | "regulamin";

/**
 * Pierwszy segment ścieżki dla każdej zakładki.
 *
 * „projekt" siedzi pod PUSTYM segmentem, czyli pod „/" — jest pierwszym krokiem
 * przepływu i zarazem stroną startową, więc własny segment („/instalacja") dawałby
 * dwa adresy na to samo i pytanie, który jest tym właściwym. Nazwa segmentu idzie
 * za ETYKIETĄ z interfejsu, nie za wewnętrznym id: użytkownik widzi „Protokoły
 * pomiarowe", więc w adresie ma być „protokoly", a nie np. „protocols".
 */
const SEGMENT_ZAKLADKI: Record<AppTab, string> = {
  projekt: "",
  rozdzielnica: "rozdzielnica",
  schemat: "schemat",
  kosztorys: "kosztorys",
  kalkulatory: "kalkulatory",
  protokoly: "protokoly",
  prywatnosc: "prywatnosc",
  regulamin: "regulamin",
};

/** Zakładka domyślna — i zarazem awaryjna dla adresu, którego nie umiemy rozpoznać. */
export const ZAKLADKA_DOMYSLNA: AppTab = "projekt";

export interface Route {
  tab: AppTab;
  /**
   * Drugi segment ścieżki: id kalkulatora (`/kalkulatory/spadek`) albo klucz
   * protokołu (`/protokoly/izolacja`). `null`, gdy adres go nie niesie.
   *
   * Świadomie `string`, a nie `CalcId | ProtocolKey`: tu jest warstwa adresu, która
   * nie ma prawa wiedzieć, jakie kalkulatory istnieją. Sprawdzenie, czy taki
   * kalkulator/protokół jest, należy do zakładki, która go wyświetla — i tylko ona
   * wie, co zrobić, gdy go nie ma.
   */
  param: string | null;
  /**
   * Czy adres dało się rozpoznać. `false` znaczy, że `tab` to wynik cofnięcia do
   * zakładki domyślnej, a nie odczytu ze ścieżki.
   *
   * Potrzebne, bo samego `tab` nie da się odróżnić od prawdziwego „/": powłoka
   * aplikacji ma po takim cofnięciu POPRAWIĆ adres w pasku, żeby nie twierdził, że
   * jesteśmy pod „/nie-ma-takiej-strony", skoro widać stronę startową.
   */
  rozpoznana: boolean;
}

/**
 * Rozbiera ścieżkę na zakładkę i parametr.
 *
 * Nieznany pierwszy segment cofa do zakładki domyślnej zamiast rzucać albo pokazywać
 * pustkę — literówka w ręcznie wpisanym adresie ma wylądować na czymś sensownym, a nie
 * na białym ekranie (dokładnie ta sama zasada, co przy nieistniejącym id kalkulatora
 * zapisanym w localStorage sprzed aktualizacji).
 */
export function parsePath(pathname: string): Route {
  const segmenty = pathname.split("/").filter(Boolean).map(dekodujSegment);
  const [pierwszy, drugi] = segmenty;

  // Puste „/" to prawidłowy adres zakładki startowej, nie cofnięcie się do niej.
  if (!pierwszy) return { tab: ZAKLADKA_DOMYSLNA, param: null, rozpoznana: true };

  const wpis = (Object.entries(SEGMENT_ZAKLADKI) as [AppTab, string][]).find(
    // Bez rozróżniania wielkości liter: adres bywa przepisywany ręcznie albo
    // z komunikatora, który „poprawi" pierwszą literę.
    ([, segment]) => segment !== "" && segment.toLowerCase() === pierwszy.toLowerCase()
  );
  if (!wpis) return { tab: ZAKLADKA_DOMYSLNA, param: null, rozpoznana: false };

  return { tab: wpis[0], param: drugi ?? null, rozpoznana: true };
}

/** Odwrotność `parsePath`. Parametr dokładany tylko tam, gdzie zakładka go używa —
 *  „/kosztorys/cokolwiek" nie ma znaczenia, więc nie powstaje. */
export function buildPath(tab: AppTab, param?: string | null): string {
  const segment = SEGMENT_ZAKLADKI[tab];
  if (!segment) return "/";
  if (!param) return `/${segment}`;
  return `/${segment}/${encodeURIComponent(param)}`;
}

/** Czy zakładka w ogóle niesie drugi segment. Poza tymi dwiema parametr jest
 *  ignorowany przy budowaniu adresu — patrz `buildPath`. */
export function zakladkaZParametrem(tab: AppTab): boolean {
  return tab === "kalkulatory" || tab === "protokoly";
}

/**
 * Dopasowuje parametr z adresu do listy dozwolonych wartości, ignorując wielkość
 * liter, i zwraca wartość KANONICZNĄ (tak jak zapisano ją w kodzie).
 *
 * Powód: część id kalkulatorów jest camelCase („gGWkladka", „bilansFaz"), a nikt
 * nie przepisze tego z pamięci co do wielkości liter. Adres ma działać także wpisany
 * małymi literami, ale w pasku adresu ma się potem pokazać jedna, kanoniczna postać.
 */
export function dopasujParam<T extends string>(param: string | null, dozwolone: readonly T[]): T | null {
  if (!param) return null;
  const szukane = param.toLowerCase();
  return dozwolone.find((v) => v.toLowerCase() === szukane) ?? null;
}

/** Dekodowanie pojedynczego segmentu, odporne na niepoprawne sekwencje `%` —
 *  `decodeURIComponent` rzuca na czymś takim jak „/kalkulatory/100%", a ręcznie
 *  sklejony adres potrafi tak wyglądać. */
function dekodujSegment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
