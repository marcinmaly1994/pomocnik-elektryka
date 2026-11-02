/** Kroki odpowiadają 1:1 nazwom narzędzi/zakładek w interfejsie (patrz `ToolRail.tsx`
 *  i `FlowCard` w `App.tsx`) — laik szukający pomocy musi rozpoznać to, co widzi na
 *  ekranie, w tekście, który czyta. */
export const KROKI: { tytul: string; opis: string }[] = [
  {
    tytul: "Wgraj rzut albo narysuj dom",
    opis: "W zakładce „Instalacja” wgraj zdjęcie lub skan rzutu mieszkania. Nie masz rzutu? Narysuj ściany od zera narzędziem „Narysuj Ścianę”.",
  },
  {
    tytul: "Ustaw skalę",
    opis: "Narzędziem „Kalibracja skali” wskaż na rzucie odcinek o znanej długości (np. szerokość drzwi) i podaj, ile ma metrów. Bez tego aplikacja nie policzy długości przewodów ani powierzchni pomieszczeń.",
  },
  {
    tytul: "Obrysuj i nazwij pomieszczenia",
    opis: "Narzędziem „Narysuj Pomieszczenie” obrysuj każde pomieszczenie, nadaj mu nazwę i wybierz typ z listy. Kuchnia, łazienka, pralnia i kotłownia mają własne wymagania — aplikacja uwzględni je automatycznie na podstawie wybranego typu.",
  },
  {
    tytul: "Rozstaw gniazdka, łączniki i oświetlenie",
    opis: "Narzędziem „Wstaw Element” wybierz element z listy i kliknij na rzucie, żeby go postawić. Drzwi dodasz narzędziem „Drzwi i okna”, klikając w ścianę albo krawędź pomieszczenia, w które mają być wstawione.",
  },
  {
    tytul: "Sprawdź rozdzielnicę i schemat",
    opis: "Zakładki „Rozdzielnica” i „Schemat” uzupełniają się same na podstawie tego, co postawiono na planie — dobór zabezpieczeń i schemat jednokreskowy nie wymagają osobnej pracy.",
  },
  {
    tytul: "Sprawdź kosztorys",
    opis: "Zakładka „Kosztorys” zestawia materiały i orientacyjny koszt instalacji na podstawie projektu — przydatne do rozmowy z wykonawcą albo własnej wyceny.",
  },
];

/**
 * Skróty klawiszowe edytora — DANE, a nie wpisany ręcznie rząd `<li>`.
 *
 * Powód ten sam, co przy `KROKI` obok: spis w Pomocy ma odpowiadać temu, co
 * aplikacja naprawdę robi, a lista wpisana wprost w JSX nie daje się o to zapytać.
 * Pilnuje tego `pomoc-nazwy.test.ts`.
 *
 * `Ctrl` także na Macu, gdzie działa `Cmd` — pisanie obu wariantów w każdym wierszu
 * rozdmuchałoby spis, a `Cmd` jest dla użytkownika Maca oczywistym odpowiednikiem.
 */
export const SKROTY: { klawisz: string; opis: string }[] = [
  { klawisz: "Ctrl + Z", opis: "cofa ostatnią zmianę — także pojedynczy punkt w trakcie rysowania ściany" },
  { klawisz: "Ctrl + Shift + Z", opis: "ponawia cofniętą zmianę" },
  { klawisz: "R", opis: "obraca zaznaczony element albo otwór (drzwi) o 180°" },
  { klawisz: "Delete", opis: "usuwa zaznaczenie" },
  { klawisz: "Enter", opis: "zatwierdza rysowaną ścianę albo zaznaczony obszar" },
  { klawisz: "Esc", opis: "anuluje bieżącą operację" },
  { klawisz: "F", opis: "przełącza pełny ekran — rysunek dostaje całe okno" },
  /**
   * Dwa gesty myszy w spisie KLAWISZY, bo tu ludzie szukają odpowiedzi na „jak to
   * przybliżyć" — i dotąd jej nie znajdowali. Nawigacja po płótnie jest jedyną rzeczą
   * wziętą w tej aplikacji wprost z programów CAD: samo kółko przewija stronę (inaczej
   * nie dałoby się jej przewinąć znad rzutu), a przybliża dopiero `Ctrl` + kółko.
   * Kto tego nie wie, ten kręci kółkiem i patrzy, jak ucieka mu cała strona.
   */
  { klawisz: "Ctrl + kółko", opis: "przybliża i oddala rzut w miejscu, gdzie stoi kursor — samo kółko przewija stronę" },
  { klawisz: "wciśnięta rolka", opis: "przesuwa widok planu, bez przerywania rysowania i bez zmiany narzędzia" },
  /** Na dotyku nie ma ani `Ctrl`, ani rolki — patrz `gestDotyku.ts`. */
  { klawisz: "szczypanie dwoma palcami", opis: "przybliża i oddala rzut na ekranie dotykowym — jednym palcem przewija się strona" },
  /**
   * Na dotyku nie ma prawego przycisku, a w menu kontekstowym mieszka usuwanie,
   * obracanie i zatwierdzanie ściany — bez tego gestu telefon pozwalał narysować
   * cały plan i nie pozwalał niczego z niego skasować.
   */
  { klawisz: "przytrzymanie palcem", opis: "otwiera menu podręczne elementu, ściany albo pomieszczenia — odpowiednik prawego przycisku myszy" },
  {
    klawisz: "dwuklik w puste miejsce",
    opis: "dopasowuje widok do rysunku — to samo co ikona obok procentów; działa też jako podwójne dotknięcie",
  },
];
