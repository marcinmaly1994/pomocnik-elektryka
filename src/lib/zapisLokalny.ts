/**
 * Treść wskaźnika autozapisu lokalnego.
 *
 * Osobno od komponentu, bo to decyzja o TREŚCI, nie o wyglądzie: nieudany zapis musi
 * wygrać z godziną ostatniego udanego. Wcześniej wyjątek z `localStorage` (przepełniona
 * pamięć przeglądarki) był połykany po cichu, więc wskaźnik zamierał na starej godzinie —
 * zielony, z ptaszkiem, twierdząc, że projekt jest zapisany. Patrz `localSaveError`
 * w `useProjectStore`.
 */

export interface StanZapisu {
  tekst: string;
  /** Wersja do paska stanu edytora, gdzie miejsca jest na kilkanaście znaków. */
  krotki: string;
  /** Podpowiedź: co się stało i co z tym zrobić. */
  tytul: string;
  ostrzezenie: boolean;
}

/** Co pokazać i co z tym zrobić — treść osobno od widoku, żeby dała się sprawdzić testem. */
export function komunikatZapisu(
  blad: "bezPodkladu" | "brak" | null,
  lastLocalSaveAt: number | null
): StanZapisu | null {
  if (blad === "brak") {
    return {
      tekst: "NIE ZAPISANO — pamięć przeglądarki pełna",
      krotki: "Nie zapisano",
      tytul:
        "Projekt NIE zapisał się w tej przeglądarce — zabrakło miejsca. Zamknięcie karty go straci. " +
        "Usuń podkład rzutu, pobierz projekt do pliku albo zaloguj się i zapisz go na koncie.",
      ostrzezenie: true,
    };
  }
  if (blad === "bezPodkladu") {
    return {
      tekst: "Zapisano bez podkładu",
      krotki: "Bez podkładu",
      tytul:
        "Rysunek się zapisał, ale podkład rzutu nie zmieścił się w pamięci przeglądarki i po odświeżeniu go nie będzie. " +
        "Wgraj lżejszy plik albo zapisz projekt na koncie, gdzie limitu nie ma.",
      ostrzezenie: true,
    };
  }
  if (!lastLocalSaveAt) return null;
  const czas = new Date(lastLocalSaveAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  return {
    tekst: `Zapisano lokalnie ${czas}`,
    krotki: "Zapisano",
    tytul: `Projekt zapisuje się automatycznie w tej przeglądarce — ostatnio o ${czas}`,
    ostrzezenie: false,
  };
}
