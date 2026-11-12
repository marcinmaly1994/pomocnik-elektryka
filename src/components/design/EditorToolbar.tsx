import { type ReactNode } from "react";
import { formatLiczba } from "@/lib/liczby";
import { KATEGORIE_OSPRZETU } from "@/lib/elements";
import { ArrowUpFromLine, Cable, DraftingCompass, Eye, EyeOff, FileText, Grid3x3, Image as ImageIcon, Layers2, Maximize2, Minimize2, Minus, Plus, Redo2, Ruler, Save, Scan, SlidersHorizontal, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_ZOOM, minZoom } from "./zoomPlanu";
import { FloorManagement, FloorTabs } from "./FloorBar";
import { PasekMenu } from "./PasekMenu";
import { useSzerokieOkno } from "./pasekMenuKontekst";

/**
 * JEDEN pasek edytora, w JEDNYM rzędzie: zakładki kondygnacji, dwa rozwijane menu
 * („Plan" i „Rysunek"), przełączniki warstw, cofnij/ponów, powiększenie, pełny
 * ekran, PDF i zapis.
 *
 * Kondygnacje mieszkały kiedyś w osobnym rzędzie NAD paskiem; po scaleniu pasek i tak
 * zawijał się na dwa rzędy, bo kontrolek było kilkanaście. Co i dlaczego zeszło pod
 * menu — patrz komentarz przy `return` niżej.
 *
 * Narzędzia rysowania nadal mieszkają osobno, w pionowym `ToolRail` — to inna
 * kategoria (czym rysuję vs. jak patrzę), a przy krawędzi płótna nie zabierają mu
 * wysokości.
 */

export interface EditorToolbarProps {
  /** Powiększenie, przy którym metr rzeczywisty ma 40 px — punkt odniesienia dla
   *  odczytu procentowego i cel przycisku „przywróć 100%". Patrz `zoomSkaliRysowania`. */
  zoomStandardowy: number;
  bgImageUrl: string | null;
  bgName: string | null;
  onPickBg: () => void;
  onClearBg: () => void;
  snapOn: boolean;
  onSnapChange: (v: boolean) => void;
  /** Przyciąganie OSPRZĘTU do ścian, z obrotem symbolu — osobno od siatki, bo
   *  porządkuje co innego (patrz komentarz przy obu kontrolkach). */
  wallSnapOn: boolean;
  onWallSnapChange: (v: boolean) => void;
  elementScale: number;
  onElementScaleChange: (v: number) => void;
  defaultElementScale: number;
  showZones: boolean;
  onToggleZones: () => void;
  /** Widoczność poglądowych tras przewodów (rozdzielnica → punkt) — patrz
   *  `buildCableRoutes`. Puste, gdy na kondygnacji nie ma rozdzielnicy. */
  showRoutes: boolean;
  onToggleRoutes: () => void;
  /** Tryb wymiarowania — długości wszystkich ścian i wymiary prostokątnych pomieszczeń. */
  showDimensions: boolean;
  onToggleDimensions: () => void;
  /** Powierzchnia pomieszczeń — OSOBNO od wymiarów, bo odpowiada na inne pytanie:
   *  wymiary służą do wytyczenia ścian, powierzchnia do sprawdzenia metrażu. */
  showAreas: boolean;
  onToggleAreas: () => void;
  /** Ukryte kategorie osprzętu (F8) — patrz `KATEGORIE_OSPRZETU`. */
  ukryteKategorie?: string[];
  onPrzelaczKategorie?: (kategoria: string) => void;
  showHeights: boolean;
  onToggleHeights: () => void;
  /** Podgląd kondygnacji poniżej. `null` na najniższej — nie ma czego pokazać, więc
   *  przycisk się nie renderuje, zamiast być wyszarzony bez wyjaśnienia (ten sam
   *  wzorzec co usuwanie ostatniej kondygnacji w `FloorBar`). */
  showUnderlay: boolean;
  onToggleUnderlay: (() => void) | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  /** Dopasowanie rzutu do dostępnego miejsca — wraca też do trybu automatycznego. */
  onDopasuj: () => void;
  /**
   * Kotwica dymka o nawigacji po rzucie — grupa przycisków powiększenia.
   *
   * Dymek tłumaczy `Ctrl` + kółko i wciśniętą rolkę, ale strzałką pokazuje właśnie
   * TE przyciski: to jedyna droga do przybliżenia, która działa wszędzie, także na
   * dotyku (patrz `CoachMark` w DesignTab). Ten sam wzorzec, co refy narzędzi
   * w `ToolRail`.
   *
   * Ref PRZEZ WYWOŁANIE, nie obiekt — tak samo jak `onToolRef` obok: pasek przerysowuje
   * się przy każdej zmianie powiększenia, a rodzic musi wtedy dostać aktualny węzeł.
   */
  onGrupaZoomuRef?: (el: HTMLDivElement | null) => void;
  /**
   * Czy grupa powiększenia ma być WSKAZANA — pulsującą, miedzianą obwódką.
   *
   * Włączane na czas dymka o nawigacji: strzałka dymka celuje w bok paska, a same
   * przyciski są szare wśród kilkunastu innych szarych ikon. Podświetlenie mówi
   * „TE, nie tamte", zanim ktokolwiek zacznie czytać.
   */
  wskazZoom?: boolean;
  /** Widoczność siatki — osobno od `snapOn`, patrz komentarz przy obu kontrolkach. */
  gridOn: boolean;
  onGridChange: (v: boolean) => void;
  /** Ile metrów ma jedno oczko siatki, gotowe do wyświetlenia (np. „1 kratka = 1 m”).
   *  `null`, gdy skala nie jest ustawiona — wtedy kratka nie znaczy żadnej długości.
   *  Liczy rodzic, bo to on zna skalę kondygnacji; pasek tylko pokazuje. */
  opisKrokuSiatki: string | null;
  pelnyEkran: boolean;
  onTogglePelnyEkran: () => void;
  /** Ręczny zapis projektu. `null`, gdy użytkownik nie jest zalogowany — wtedy
   *  przycisk się nie pokazuje, bo nie ma dokąd zapisywać poza tą przeglądarką. */
  onZapisz?: (() => void) | null;
  /** Otwiera podgląd rzutu w formie kartki A4 — z tabliczką rysunkową i legendą
   *  użytych symboli. Pobranie pliku dzieje się z poziomu podglądu, żeby nikt nie
   *  wysyłał klientowi rysunku, na który sam nie spojrzał. */
  onPdf?: () => void;
  /** Pobiera rzut kondygnacji jako DXF z warstwami (F13) — dla CAD-a architekta. */
  onDxf?: () => void;
  zapisTrwa?: boolean;
  /** Miejsce na pinezkę przypinającą pasek w trybie pełnoekranowym. Wstawiane
   *  przez rodzica jako gniazdo, bo sam pasek nic nie wie o chowaniu się za
   *  krawędź — to sprawa układu, nie kontrolek widoku. */
  przypinacz?: ReactNode;
}

const ZOOM_STEP = 0.1;

/** Pionowa kreska rozdzielająca grupy kontrolek. Znika na wąskim ekranie, gdzie pasek
 *  i tak się zawija i kreska nie rozdzielałaby już niczego sensownego. */
function Separator() {
  return <span className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden="true" />;
}

export function EditorToolbar({
  zoomStandardowy,
  bgImageUrl,
  bgName,
  onPickBg,
  onClearBg,
  snapOn,
  onSnapChange,
  wallSnapOn,
  onWallSnapChange,
  gridOn,
  opisKrokuSiatki,
  onGridChange,
  onZapisz,
  onPdf,
  onDxf,
  zapisTrwa,
  elementScale,
  onElementScaleChange,
  defaultElementScale,
  showZones,
  onToggleZones,
  showRoutes,
  onToggleRoutes,
  showDimensions,
  onToggleDimensions,
  showAreas,
  ukryteKategorie = [],
  onPrzelaczKategorie,
  onToggleAreas,
  showHeights,
  onToggleHeights,
  showUnderlay,
  onToggleUnderlay,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  onDopasuj,
  onGrupaZoomuRef,
  wskazZoom,
  pelnyEkran,
  onTogglePelnyEkran,
  przypinacz,
}: EditorToolbarProps) {
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(minZoom(), Math.round(z * 100) / 100));

  /**
   * Zakładki kondygnacji stoją w pasku na monitorze, a na telefonie schodzą na GÓRĘ
   * panelu „Plan" — do reszty spraw kondygnacji.
   *
   * Powód jest czysto arytmetyczny: przy 375 px trzy przyciski menu plus zakładki nie
   * mieszczą się w dwóch rzędach i pasek robi się WYŻSZY, niż był przed tą zmianą
   * (zmierzone 118 px wobec 84 px). Na monitorze miejsca jest aż nadto, a przełączanie
   * pięter to czynność nawigacyjna i nie ma prawa kosztować kliknięcia w menu.
   *
   * Wybór przez `matchMedia`, a nie klasy CSS: zakładki mają istnieć w drzewie
   * DOKŁADNIE RAZ, inaczej każde `getByRole("button", { name: "Parter" })` trafiałoby
   * w dwa elementy.
   */
  const szerokieOkno = useSzerokieOkno();

  /**
   * JEDEN RZĄD, na każdej szerokości okna.
   *
   * Pasek miał kilkanaście kontrolek i przy typowym oknie 1440×900 zawijał się na
   * DWA rzędy — zmierzone 84 px zabrane rysunkowi na rzeczy, które ustawia się raz.
   * Na telefonie było jeszcze gorzej: blok wysoki na ~250 px, czyli jedna trzecia
   * ekranu. Rzeczy „ustawiane raz" schodzą więc pod dwa rozwijane menu (patrz
   * `PasekMenu`), a w pasku zostaje to, czego używa się W TRAKCIE rysowania.
   *
   * Zastąpiło to dawne „Ustawienia planu" — zwijanie włączane WYŁĄCZNIE poniżej
   * 768 px. Tamto rozwiązanie miało dwie wady, które ta zmiana usuwa: na monitorze
   * nie robiło nic (a to tam stały te dwa rzędy), i dawało inny układ paska na
   * telefonie niż na laptopie, czyli dwa zachowania do utrzymania i przetestowania
   * zamiast jednego.
   *
   * Podział jest wg CZĘSTOTLIWOŚCI, nie wg tematu:
   *  - w pasku: zakładki kondygnacji (nawigacja, robiona w kółko), przełączniki
   *    warstw (jedno kliknięcie, ikona), cofnij/ponów, powiększenie, pełny ekran,
   *    PDF i zapis;
   *  - „Plan": kondygnacje do dodania/skopiowania/usunięcia, wysokość kondygnacji
   *    i podkład;
   *  - „Rysunek": przyciąganie do siatki, przyciąganie osprzętu do ścian i rozmiar
   *    symboli.
   */
  /**
   * Na telefonie JEDEN PRZEWIJANY RZĄD, od 768 px zawijanie jak dotąd.
   *
   * Przy 375 px pasek zawijał się na dwa rzędy (78 px) i razem z paskiem ikon, banerem
   * i nagłówkiem spychał rzut do 487 px od góry ekranu — na starcie widać było z niego
   * ok. 325 px. Jeden rząd to 44 px. Menu „Plan" i „Rysunek" otwierają się w portalu
   * (patrz `PasekMenu`), więc przewijany pasek ich nie przycina.
   */
  return (
    <div className="pe-bez-suwaka flex flex-nowrap items-center gap-x-2.5 gap-y-1.5 overflow-x-auto rounded-card border border-border bg-white px-2.5 py-1.5 [&>*]:shrink-0 md:flex-wrap md:overflow-visible">
      {szerokieOkno && <FloorTabs />}

      <PasekMenu etykieta="Plan" ikona={<SlidersHorizontal size={14} />} szerokosc={320}>
        {!szerokieOkno && <FloorTabs />}
        <FloorManagement />

        {/* Podkład: nazwa pliku zamiast samego „wgrany" — przy kilku kondygnacjach
            to jedyny sposób, żeby sprawdzić, czy pod spodem leży właściwy rzut. */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2 text-xs">
          <ImageIcon size={14} className="shrink-0 text-blueprint" />
          {bgImageUrl ? (
            <>
              {/* Przedrostek „Podkład:" zostaje mimo walki o miejsce — sama nazwa pliku
                  obok ikonki nie mówi, CZYM ten plik jest w projekcie. */}
              <span className="max-w-[160px] truncate text-slate-600" title={bgName ?? undefined}>
                Podkład: {bgName ?? "wgrany"}
              </span>
              <button onClick={onPickBg} className="text-blueprint hover:underline">
                Zmień
              </button>
              <button onClick={onClearBg} className="text-red-500 hover:underline">
                Usuń
              </button>
            </>
          ) : (
            <button onClick={onPickBg} className="text-blueprint hover:underline">
              Wgraj podkład
            </button>
          )}
        </div>
      </PasekMenu>

      {/* Dwie RÓŻNE rzeczy, które stały dotąd obok siebie w pasku — i właśnie dlatego
          rozeszły się w tej zmianie. Przełącznik decyduje, czy siatkę WIDAĆ (to warstwa
          rysunku, więc jego ikona zostaje w pasku razem z pozostałymi przełącznikami
          warstw); checkbox — czy elementy się do niej PRZYCIĄGAJĄ (to ustawienie
          rysowania, więc siedzi tutaj). Można wyłączyć samą kratkę, bo przeszkadza na
          wgranym rzucie, i dalej rysować z przyciąganiem. */}
      <PasekMenu etykieta="Rysunek" ikona={<Ruler size={14} />} szerokosc={300}>
      <label
        className="flex items-center gap-1.5 text-xs text-slate-500"
        title={
          // Zakres wypisany wprost: przyciąganie NIE dotyczy elementów instalacji
          // ani drzwi (patrz `withSnap` w DesignCanvas) — gniazdko przy futrynie
          // miałoby przez nie odskakiwać nawet o pół metra.
          `Przyciąga ściany i obrysy pomieszczeń do siatki — nie dotyczy gniazdek, łączników ani drzwi${
            opisKrokuSiatki ? ` (${opisKrokuSiatki})` : ""
          }`
        }
      >
        <input
          type="checkbox"
          checked={snapOn}
          onChange={(e) => onSnapChange(e.target.checked)}
          aria-label="Przyciągaj do siatki"
          className="accent-copper"
        />
        {/* Nie „ściany": ten przełącznik rządzi całą GEOMETRIĄ BUDYNKU — ścianami,
            obrysami pomieszczeń i przeciąganiem ich narożników (patrz `withSnap`
            w DesignCanvas). Etykieta mówiąca o samych ścianach kazała szukać osobnego
            przełącznika dla pomieszczeń, którego nigdy nie było. */}
        Przyciągaj do siatki
        {/* Ile metrów ma oczko — WIDOCZNIE, nie tylko w tooltipie. Bez tego siatka
            jest wyłącznie ozdobą: przy rysowaniu od zera jedna kratka to równo metr,
            czyli najprostsza dostępna miarka, ale nikt się o tym nie dowiadywał i
            dom wychodził w przypadkowej skali. Chowane na wąskim pasku, gdzie miejsca
            starcza ledwie na same nazwy kontrolek. */}
        {opisKrokuSiatki && <span className="hidden whitespace-nowrap text-slate-400 lg:inline">· {opisKrokuSiatki}</span>}
      </label>

      {/* Drugie przyciąganie, obok siatkowego, bo to ta sama kategoria ustawienia —
          ale DOTYCZY CZEGO INNEGO: siatka porządkuje ściany i obrysy, to porządkuje
          osprzęt. Zakres wypisany w tooltipie, bo bez tego „przyciągaj do ścian"
          sugerowałoby, że dotyczy też punktów sufitowych. */}
      <label
        className="flex items-center gap-1.5 text-xs text-slate-500"
        title="Przykleja stawiany i przeciągany osprzęt do najbliższej ściany albo krawędzi pomieszczenia i obraca symbol prostopadle do niej. Nie dotyczy punktów sufitowych, czujników dymu ani wyposażenia sanitarnego."
      >
        <input
          type="checkbox"
          checked={wallSnapOn}
          onChange={(e) => onWallSnapChange(e.target.checked)}
          aria-label="Przyciągaj osprzęt do ścian"
          className="accent-copper"
        />
        Przyciągaj osprzęt do ścian
      </label>

      {/* Rozmiar SYMBOLI, nie powiększenie planu — to dwie różne rzeczy i dlatego
          stoją w osobnych grupach (zoom siedzi po prawej, przy dopasowaniu widoku). */}
      <label
        className="flex items-center gap-1.5 text-xs text-slate-500"
        title="Rozmiar symboli osprzętu. Sam rozmiar dopasowuje się automatycznie: przy skalibrowanej skali symbol zajmuje zawsze tyle samo centymetrów ściany, a bez skali — tyle samo względem wielkości rysunku. Ten suwak służy do korekty czytelności. Przybory sanitarne go nie słuchają: rysują się w prawdziwych wymiarach, bo ich obrys jest strefą ochronną."
      >
        <span className="whitespace-nowrap">Rozmiar elementów</span>
        <input
          type="range"
          min={0.6}
          max={2}
          step={0.1}
          value={elementScale}
          onChange={(e) => onElementScaleChange(Number(e.target.value))}
          aria-label="Rozmiar elementów"
          className="w-16 accent-copper"
        />
        <span className="pe-mono w-8 text-right text-xs tabular-nums">{formatLiczba(elementScale, 1)}×</span>
        {elementScale !== defaultElementScale && (
          <button onClick={() => onElementScaleChange(defaultElementScale)} className="text-xs text-blueprint hover:underline">
            reset
          </button>
        )}
      </label>
      </PasekMenu>

      <Separator />

      {/* PRZEŁĄCZNIKI WARSTW — co widać na rysunku. Na monitorze stoją WPROST w pasku
          (`rozwinNaSzerokim`): to jedno kliknięcie w ikonę, używane w trakcie pracy,
          a sześć ikon po 32 px nic tam nie kosztuje. Na telefonie ten sam rząd byłby
          całym rzędem paska, więc tam schodzą pod „Warstwy". */}
      <PasekMenu etykieta="Warstwy" ikona={<Layers2 size={14} />} szerokosc={220} rozwinNaSzerokim>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onGridChange(!gridOn)}
        title={gridOn ? "Wyłącz siatkę" : "Włącz siatkę"}
        aria-label={gridOn ? "Wyłącz siatkę" : "Włącz siatkę"}
        aria-pressed={gridOn}
      >
        <Grid3x3 size={15} className={gridOn ? "text-copper" : undefined} />
      </Button>

      {/* Ten sam wzorzec co siatka i trasy obok: opis mówi, co zrobi kliknięcie,
          `aria-pressed` i miedziana ikona — czy warstwa jest włączona (R4 z audytu
          Instalacji 11.11.2026; wcześniej opis zawsze brzmiał „Pokaż…"). */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleZones}
        title={showZones ? "Ukryj strefy ochronne w łazience" : "Pokaż strefy ochronne w łazience"}
        aria-label={showZones ? "Ukryj strefy ochronne w łazience" : "Pokaż strefy ochronne w łazience"}
        aria-pressed={showZones}
      >
        {showZones ? <Eye size={15} className="text-copper" /> : <EyeOff size={15} />}
      </Button>

      {/* Trasy przewodów są poglądowe (linia prosta, nie prawdziwy przebieg wzdłuż
          ścian) i puste bez rozdzielnicy postawionej na planie — stąd domyślnie
          WYŁĄCZONE (w odróżnieniu od stref, które są zawsze przydatne, gdy w ogóle
          mają co pokazać), żeby nie zaśmiecać planu czymś, czego często nie widać. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleRoutes}
        title={showRoutes ? "Ukryj poglądowe trasy przewodów" : "Pokaż poglądowe trasy przewodów"}
        aria-label={showRoutes ? "Ukryj trasy przewodów" : "Pokaż trasy przewodów"}
        aria-pressed={showRoutes}
      >
        <Cable size={15} className={showRoutes ? "text-copper" : undefined} />
      </Button>

      {/* Opisy rysunku pod JEDNYM przyciskiem, bo to jedna kategoria pytania („co ma
          być podpisane") — ale dwie różne odpowiedzi, więc dwa pola wyboru zamiast
          jednego przełącznika. Wymiary służą do WYTYCZENIA ścian na budowie,
          powierzchnia do SPRAWDZENIA metrażu; pierwsze bez drugiego jest normą na
          rysunku wykonawczym, drugie bez pierwszego — przy szacowaniu materiału.

          Menu, a nie druga ikona w rzędzie: przełączników warstw jest już pięć i
          żaden nie ma podpisu. Szósty byłby kolejnym symbolem do odgadnięcia, a tak
          obie opcje dostają wreszcie pełne nazwy. */}
      <PasekMenu etykieta="Opisy" ikona={<Ruler size={14} />} szerokosc={260}>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={showDimensions}
            onChange={onToggleDimensions}
            aria-label="Wymiary ścian i pomieszczeń"
            className="accent-copper"
          />
          Wymiary ścian i pomieszczeń
        </label>

        <label
          className="flex items-center gap-1.5 text-xs text-slate-500"
          title="Pole liczone z obrysu pomieszczenia, więc prawdziwe także dla kształtów innych niż prostokąt — trójkąta, trapezu, litery L. Wymaga znanej skali rzutu."
        >
          <input
            type="checkbox"
            checked={showAreas}
            onChange={onToggleAreas}
            aria-label="Powierzchnia pomieszczeń"
            className="accent-copper"
          />
          Powierzchnia pomieszczeń
        </label>

        {/* Filtry widoku osprzętu (F8 z audytu 5.11.2026) — w tym samym menu, bo to ta
            sama kategoria pytania: co ma być na rysunku i na wydruku. Nazwy jak sekcje
            katalogu przy wstawianiu. */}
        {onPrzelaczKategorie && (
          <fieldset className="mt-1 flex flex-col gap-1 border-t border-border pt-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Osprzęt na rzucie</legend>
            {KATEGORIE_OSPRZETU.map((k) => (
              <label key={k} className="flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={!ukryteKategorie.includes(k)}
                  onChange={() => onPrzelaczKategorie(k)}
                  aria-label={k}
                  className="accent-copper"
                />
                {k}
              </label>
            ))}
          </fieldset>
        )}
      </PasekMenu>

      {/* Wysokości montażu przy osprzęcie. Osobny przełącznik od wymiarów ścian: tamte
          opisują BUDYNEK, te INSTALACJĘ — na jednym wydruku chce się zwykle albo jedno,
          albo drugie, a razem robi się gęsto. Domyślnie wyłączone z tego samego powodu
          co wymiary: przy rysowaniu przeszkadzają, a przy wydruku są niezbędne. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleHeights}
        title={showHeights ? "Ukryj wysokości montażu" : "Pokaż wysokości montażu przy osprzęcie (+30, +110…)"}
        aria-label={showHeights ? "Ukryj wysokości montażu" : "Pokaż wysokości montażu"}
        aria-pressed={showHeights}
      >
        <ArrowUpFromLine size={15} className={showHeights ? "text-copper" : undefined} />
      </Button>

      {/* Podgląd kondygnacji poniżej — bez niego piętro rysuje się w ciemno i nie da
          się trafić pionem rozdzielnicy ani wypustu nad tym z parteru. */}
      {onToggleUnderlay && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleUnderlay}
          title={showUnderlay ? "Ukryj kondygnację poniżej" : "Pokaż kondygnację poniżej jako podkład"}
          aria-label={showUnderlay ? "Ukryj kondygnację poniżej" : "Pokaż kondygnację poniżej"}
          aria-pressed={showUnderlay}
        >
          <Layers2 size={15} className={showUnderlay ? "text-copper" : undefined} />
        </Button>
      )}

      </PasekMenu>

      <Separator />

      <div className="flex items-center">
        <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} title="Cofnij">
          <Undo2 size={15} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} title="Ponów">
          <Redo2 size={15} />
        </Button>
      </div>

      {/* Powiększenie WIDOKU. Wcześniej dostępne tylko przez Ctrl+scroll, czyli
          praktycznie niewykrywalne — teraz ma jawną kontrolkę z wartością.
          Na dotyku przyciski mają 44 px wysokości, a od `md` (tablet) także 44 px
          szerokości, jak w `PrzyciskiPowiekszenia` — przy 26 × 22 px „+" i „Dopasuj"
          leżały pod jednym opuszkiem. Na telefonie szerokość zostaje, bo pasek jest
          tam wąski: szersze przyciski wypychały „+" za krawędź. */}
      <div
        ref={(el) => onGrupaZoomuRef?.(el)}
        className={`ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5${wskazZoom ? " pe-wskazane" : ""}`}
      >
        <button
          onClick={() => onZoomChange(clampZoom(zoom - ZOOM_STEP))}
          disabled={zoom <= minZoom()}
          aria-label="Oddal widok"
          title="Oddal widok"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30 [@media(pointer:coarse)]:min-h-11 md:[@media(pointer:coarse)]:min-w-11 flex items-center justify-center"
        >
          <Minus size={14} />
        </button>
        {/*
          * Procent liczony od SKALI RYSOWANIA, nie od „1 jednostka planu = 1 piksel".
          *
          * Jednostka planu to pojęcie z kodu; przy rysowaniu od zera wychodziło z niej
          * 20 px na metr, czyli dwa razy mniej niż widok, w którym rysunek się otwiera.
          * „Przywróć 100%" ODDALAŁO więc rysunek zamiast wrócić do stanu wyjściowego.
          * Teraz 100% znaczy jedno: metr rzeczywisty ma 40 px na ekranie.
          */}
        <button
          onClick={() => onZoomChange(clampZoom(zoomStandardowy))}
          title="Przywróć standardowe powiększenie"
          aria-label={`Powiększenie ${Math.round((zoom / zoomStandardowy) * 100)} procent — kliknij, aby przywrócić 100%`}
          className="pe-mono w-11 text-center text-xs tabular-nums text-slate-600 [@media(pointer:coarse)]:min-h-11 md:[@media(pointer:coarse)]:min-w-11 flex items-center justify-center"
        >
          {Math.round((zoom / zoomStandardowy) * 100)}%
        </button>
        <button
          onClick={() => onZoomChange(clampZoom(zoom + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Przybliż widok"
          title="Przybliż widok"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30 [@media(pointer:coarse)]:min-h-11 md:[@media(pointer:coarse)]:min-w-11 flex items-center justify-center"
        >
          <Plus size={14} />
        </button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <button
          onClick={onDopasuj}
          aria-label="Dopasuj widok do planu"
          title="Dopasuj widok do planu"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink [@media(pointer:coarse)]:min-h-11 md:[@media(pointer:coarse)]:min-w-11 flex items-center justify-center"
        >
          <Scan size={13} />
        </button>
      </div>

      {/* Pełny ekran stoi POZA grupą powiększenia: tamta zmienia skalę rysunku,
          ta zmienia ilość miejsca, jaką rysunek dostaje. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onTogglePelnyEkran}
        title={pelnyEkran ? "Wyjdź z pełnego ekranu (Esc)" : "Projektowanie na pełnym ekranie (F)"}
        aria-label={pelnyEkran ? "Wyjdź z pełnego ekranu" : "Projektowanie na pełnym ekranie"}
        aria-pressed={pelnyEkran}
      >
        {pelnyEkran ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </Button>

      {/* Zapis stał dotąd WYŁĄCZNIE w menu przy profilu — czyli tam, gdzie nikt nie
          zagląda w trakcie rysowania. Autozapis i tak działa w tle, ale świadome
          „zapisz teraz" musi być pod ręką: to ono daje pewność, że praca jest
          odłożona, zanim zamknie się kartę. */}
      {onPdf && (
        <Button variant="ghost" size="icon" onClick={onPdf} title="Rzut do PDF — z tabliczką rysunkową i legendą symboli" aria-label="Rzut do PDF">
          <FileText size={15} />
        </Button>
      )}
      {onDxf && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDxf}
          title="Rzut do DXF — ściany, pomieszczenia, osprzęt i trasy na osobnych warstwach, w metrach (AutoCAD, DraftSight, LibreCAD)"
          aria-label="Rzut do DXF"
        >
          <DraftingCompass size={15} />
        </Button>
      )}

      {onZapisz && (
        <Button variant="copper" size="sm" onClick={onZapisz} disabled={zapisTrwa} title="Zapisz projekt na koncie">
          <Save size={14} /> Zapisz
        </Button>
      )}

      {przypinacz}
    </div>
  );
}
