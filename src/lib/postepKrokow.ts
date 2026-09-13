/**
 * Stan czterech etapów przepływu (Instalacja → Rozdzielnica → Schemat → Kosztorys)
 * pokazywany na kaflach w pasku etapów.
 *
 * PO CO: cztery kafle wyglądały identycznie i wszystkie były klikalne, więc nowy
 * użytkownik obchodził je po kolei i trafiał w trzy puste ekrany. Nic na nich nie
 * mówiło, że etapy 02-04 nie są równoległymi zakładkami, tylko NASTĘPSTWEM tego, co
 * powstanie na 01 — ani czego konkretnie im brakuje.
 *
 * Czysta funkcja, bez Reacta i bez store'a — stan etapu to wniosek z kilku liczb,
 * a nie fragment widoku, więc da się go domknąć testem bez montowania aplikacji.
 *
 * CELOWO NIE liczy tu obwodów ani kosztorysu. Pasek etapów żyje w `App`, czyli
 * w kawałku wejściowym, a `computeSizedCircuits`/`computeCosts` ciągną za sobą
 * tablice normatywne i dobór — czyli dokładnie to, co podział na kawałki wyniósł
 * z wejścia (patrz komentarz przy `wczytaj` w App.tsx). Liczba obwodów przychodzi
 * więc z ZEWNĄTRZ: podaje ją zakładka, która i tak musiała ją policzyć dla siebie
 * (patrz `obwody` w `FaktyEtapow` i `setLicznikObwodow` w store).
 */

/** Który etap przepływu. Te same identyfikatory co zakładki w `lib/routing.ts`. */
export type EtapId = "projekt" | "rozdzielnica" | "schemat" | "kosztorys";

/**
 * `czeka` — etap nie ma jeszcze z czego powstać i wejście w niego pokaże pusty ekran.
 * `gotowy` — jest treść.
 *
 * Świadomie DWA stany, nie trzy. Kusiło, żeby dołożyć „w trakcie", ale etapy 02-04
 * nie mają stanu pośredniego: albo rozdzielnica da się policzyć z rzutu, albo nie.
 */
export type StanEtapu = "czeka" | "gotowy";

export interface FaktyEtapow {
  /** Osprzęt na rzucie — CAŁEGO projektu, nie tylko bieżącej kondygnacji: pasek
   *  etapów opisuje projekt, a rozdzielnica i kosztorys liczą się z wszystkich pięter. */
  elementy: number;
  /** Nazwane pomieszczenia — pokazywane, dopóki nie ma jeszcze osprzętu. */
  pomieszczenia: number;
  /** Ściany. Same w sobie nie wypełniają dalszych etapów, ale świadczą, że projekt
   *  już się zaczął — więc etap 01 przestaje wołać „zacznij tutaj". */
  sciany: number;
  /**
   * Liczba policzonych obwodów albo `null`, gdy jeszcze jej nie znamy.
   *
   * `null` NIE znaczy „zero": znaczy „żadna zakładka jeszcze nie zdążyła policzyć".
   * Kafel pokazuje wtedy sam stan, bez liczby — zamiast twierdzić „0 obwodów" na
   * projekcie, który obwody na pewno ma.
   */
  obwody: number | null;
  /** Rozdzielnica składana ręcznie (`panelTryb === "reczny"`) — wtedy etap 02 jest
   *  gotowy niezależnie od tego, co stoi na rzucie, bo aparaty wpisuje użytkownik. */
  trybReczny: boolean;
  /** Aparaty dołożone ręcznie — utrzymują etapy 02-03 przy życiu nawet bez rzutu. */
  aparatyReczne: number;
}

export interface Etap {
  id: EtapId;
  stan: StanEtapu;
  /** Krótka plakietka przy tytule kafla: „38 el.", „8 obw.", „czeka". Mieści się
   *  w kaflu, więc jest bardzo zwięzła — pełne zdanie niesie `tytulPelny`. */
  plakietka: string;
  /**
   * Pełne zdanie do `title` kafla (i do czytnika ekranu jako opis przycisku):
   * co na tym etapie jest albo CZEGO MU BRAKUJE i gdzie to zrobić.
   *
   * To jest właściwa odpowiedź na zgłoszoną bolączkę — plakietka mówi „czeka",
   * a dopiero to zdanie mówi, na co i co z tym zrobić.
   */
  opis: string;
}

/** Etap 01 ma z czego żyć, gdy cokolwiek narysowano — liczy się każdy obiekt,
 *  nie tylko osprzęt (te same przesłanki co `projektPusty` w App.tsx). */
function stanInstalacji(f: FaktyEtapow): Etap {
  if (f.elementy > 0) {
    return {
      id: "projekt",
      stan: "gotowy",
      // Skrót „el." jest nieodmienny — pełną odmianę niesie `opis` w tooltipie.
      plakietka: `${f.elementy} el.`,
      opis: `Na rzucie stoi ${f.elementy} ${odmianaElementow(f.elementy)}.`,
    };
  }
  if (f.pomieszczenia > 0 || f.sciany > 0) {
    // Rzut się zaczął, ale nie ma na nim jeszcze ani jednego gniazdka — a to osprzęt,
    // nie ściany, napędza wszystkie trzy dalsze etapy. Kafel ma o to poprosić.
    const co = f.pomieszczenia > 0 ? `${f.pomieszczenia} ${odmianaPomieszczen(f.pomieszczenia)}` : "ściany";
    return {
      id: "projekt",
      stan: "czeka",
      plakietka: f.pomieszczenia > 0 ? `${f.pomieszczenia} pom.` : "szkic",
      opis: `Rzut ma ${co}, ale nie ma na nim jeszcze osprzętu — rozstaw gniazdka i oświetlenie.`,
    };
  }
  return {
    id: "projekt",
    stan: "czeka",
    plakietka: "zacznij tutaj",
    opis: "Tu zaczyna się projekt: wgraj rzut albo narysuj ściany, potem rozstaw osprzęt.",
  };
}

/**
 * Czy etapy 02-04 mają z czego powstać.
 *
 * Rozdzielnicę da się złożyć RĘCZNIE, bez rzutu (patrz „Zbuduj rozdzielnicę bez
 * rzutu" w PanelTab) — i wtedy schemat powstaje z niej, a nie z planu. Próg liczony
 * wyłącznie z zawartości rzutu mówiłby „czeka" komuś, kto ma pełną rozdzielnicę.
 */
function maZCzegoPowstac(f: FaktyEtapow): boolean {
  return f.elementy > 0 || f.trybReczny || f.aparatyReczne > 0;
}

/** Liczba obwodów jako plakietka — albo `zapas`, gdy nikt jej jeszcze nie policzył. */
function plakietkaObwodow(f: FaktyEtapow, zapas: string): string {
  return f.obwody !== null && f.obwody > 0 ? `${f.obwody} obw.` : zapas;
}

export function etapy(f: FaktyEtapow): Etap[] {
  const gotowe = maZCzegoPowstac(f);
  const obwodyOpis =
    f.obwody !== null && f.obwody > 0 ? ` (${f.obwody} ${odmianaObwodow(f.obwody)})` : "";

  return [
    stanInstalacji(f),
    {
      id: "rozdzielnica",
      stan: gotowe ? "gotowy" : "czeka",
      plakietka: gotowe ? (f.trybReczny ? "ręcznie" : plakietkaObwodow(f, "gotowa")) : "czeka",
      opis: gotowe
        ? f.trybReczny
          ? "Rozdzielnica składana ręcznie, aparat po aparacie."
          : `Dobrana z obwodów policzonych z rzutu${obwodyOpis}.`
        : "Wypełni się sama, gdy rozstawisz osprzęt na rzucie — albo złóż ją ręcznie.",
    },
    {
      id: "schemat",
      stan: gotowe ? "gotowy" : "czeka",
      plakietka: gotowe ? "gotowy" : "czeka",
      opis: gotowe
        ? "Schemat jednokreskowy rysuje się z rozdzielnicy."
        : "Powstanie z rozdzielnicy — a ta z osprzętu rozstawionego na rzucie.",
    },
    {
      id: "kosztorys",
      // Kosztorys, w odróżnieniu od dwóch etapów wyżej, liczy się WYŁĄCZNIE z rzutu:
      // ręcznie złożona rozdzielnica nie mówi, ile metrów kabla i ile puszek trzeba.
      stan: f.elementy > 0 ? "gotowy" : "czeka",
      plakietka: f.elementy > 0 ? "gotowy" : "czeka",
      opis:
        f.elementy > 0
          ? "Materiał i robocizna policzone z punktów na rzucie."
          : "Policzy się z osprzętu na rzucie — sama rozdzielnica nie mówi, ile kabla kupić.",
    },
  ];
}

/* --- odmiana ------------------------------------------------------------------
 * Polski wymaga trzech form, a kafle i tooltipy czyta laik — „2 elementów" albo
 * „5 obwody" wyglądają jak usterka. Reguła: 1 → poj., 2-4 (poza 12-14) → l. mnoga
 * mianownik, reszta → dopełniacz.
 */
function forma(n: number, poj: string, mnoga: string, dope: string): string {
  if (n === 1) return poj;
  const dwiecyfry = n % 100;
  const ostatnia = n % 10;
  if (ostatnia >= 2 && ostatnia <= 4 && !(dwiecyfry >= 12 && dwiecyfry <= 14)) return mnoga;
  return dope;
}

export const odmianaElementow = (n: number) => forma(n, "element", "elementy", "elementów");
export const odmianaPomieszczen = (n: number) => forma(n, "pomieszczenie", "pomieszczenia", "pomieszczeń");
export const odmianaObwodow = (n: number) => forma(n, "obwód", "obwody", "obwodów");
