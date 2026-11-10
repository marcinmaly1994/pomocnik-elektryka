/**
 * Dokąd wraca fokus po zamknięciu okna, które nie ma własnego `DialogTrigger`.
 *
 * Okna Pomocy, Kompletu, logowania i „Nowy projekt” są sterowane z `App` (stan
 * `open`), bo ich przyciski stoją dwa razy: w pasku nagłówka i w arkuszu „Menu” na
 * telefonie, który zamyka się w chwili wyboru pozycji. Radix nie wie wtedy, kto okno
 * otworzył, i po zamknięciu oddaje fokus `<body>` — klawiatura i czytnik ekranu
 * zaczynają od początku strony.
 *
 * Otwieracze są oznaczone atrybutem `data-otwieracz`, nie wyszukiwane po `aria-label`:
 * nazwa dostępna to tekst dla ludzi i wolno ją zmienić, nie psując fokusu.
 *
 * Kolejność wyboru celu:
 *  1. przycisk, którym okno NAPRAWDĘ otwarto, jeśli nadal jest na ekranie;
 *  2. jeśli zniknął razem z arkuszem — przycisk „Menu”, którym arkusz otwarto;
 *  3. inaczej pierwszy widoczny otwieracz tego okna (okno otwarte z innego miejsca,
 *     np. logowanie z edytora), a w ostateczności „Menu”.
 */

let ostatni: HTMLElement | null = null;

// Ostatnio użyty otwieracz zapamiętujemy w fazie przechwytywania — zanim jego `onClick`
// otworzy okno i zamknie arkusz (a z nim odmontuje sam przycisk).
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-otwieracz]");
      if (el) ostatni = el;
    },
    true
  );
}

const widoczny = (el: HTMLElement) => el.isConnected && el.offsetParent !== null;
const pierwszyWidoczny = (otwieracz: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-otwieracz="${otwieracz}"]`)].find(widoczny);

export function wrocFokusDoOtwieracza(otwieracz: string) {
  return (e: Event) => {
    const zTegoOkna = ostatni?.dataset.otwieracz === otwieracz ? ostatni : null;
    let cel: HTMLElement | undefined;
    if (zTegoOkna && widoczny(zTegoOkna)) cel = zTegoOkna;
    else if (zTegoOkna && !zTegoOkna.isConnected) cel = pierwszyWidoczny("menu") ?? pierwszyWidoczny(otwieracz);
    else cel = pierwszyWidoczny(otwieracz) ?? pierwszyWidoczny("menu");
    // Bez celu (np. po zalogowaniu znika „Zaloguj się”, a na monitorze nie ma „Menu”)
    // zostawiamy domyślne zachowanie Radixa zamiast wołać `preventDefault` w próżnię.
    if (!cel) return;
    e.preventDefault();
    cel.focus();
  };
}
