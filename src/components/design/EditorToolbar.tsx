import type { ReactNode } from "react";
import { Cable, Eye, EyeOff, FileText, Grid3x3, Image as ImageIcon, Layers2, Maximize2, Minimize2, Minus, Plus, Redo2, Ruler, Save, Scan, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_ZOOM, MIN_ZOOM } from "./DesignCanvas";
import { FloorBar } from "./FloorBar";

/**
 * JEDEN pasek edytora: kondygnacje, podkład, siatka, rozmiar symboli, strefy,
 * cofnij/ponów, powiększenie i wejście w pełny ekran.
 *
 * Kondygnacje mieszkały wcześniej w osobnym rzędzie NAD paskiem. Dwa rzędy kontrolek
 * zjadały plan z góry i rozbijały uwagę na dwie wysepki, choć konceptualnie to jedno:
 * ustawienia tego, co i jak widzę na planie. Po scaleniu ten pas wraca do rysunku.
 *
 * Narzędzia rysowania nadal mieszkają osobno, w pionowym `ToolRail` — to inna
 * kategoria (czym rysuję vs. jak patrzę), a przy krawędzi płótna nie zabierają mu
 * wysokości.
 */

export interface EditorToolbarProps {
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
  showUnderlay,
  onToggleUnderlay,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  onDopasuj,
  pelnyEkran,
  onTogglePelnyEkran,
  przypinacz,
}: EditorToolbarProps) {
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-card border border-border bg-white px-2.5 py-1.5">
      <FloorBar />

      <Separator />

      {/* Podkład: nazwa pliku zamiast samego „wgrany" — przy kilku kondygnacjach
          to jedyny sposób, żeby sprawdzić, czy pod spodem leży właściwy rzut. */}
      <span className="flex items-center gap-1.5 text-xs">
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
      </span>

      <Separator />

      {/* Dwie RÓŻNE rzeczy stojące obok siebie, obie z pełną nazwą — skrót „Siatka"
          przy jednej z nich zacierał różnicę. Przełącznik decyduje, czy siatkę WIDAĆ;
          checkbox — czy elementy się do niej PRZYCIĄGAJĄ. Można wyłączyć samą kratkę
          (przeszkadza na wgranym rzucie) i dalej rysować z przyciąganiem. */}
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
          aria-label="Przyciągaj ściany do siatki"
          className="accent-copper"
        />
        Przyciągaj ściany do siatki
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
      <label className="flex items-center gap-1.5 text-xs text-slate-500" title="Rozmiar symboli na planie">
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
        <span className="pe-mono w-8 text-right text-[11px] tabular-nums">{elementScale.toFixed(1)}×</span>
        {elementScale !== defaultElementScale && (
          <button onClick={() => onElementScaleChange(defaultElementScale)} className="text-[11px] text-blueprint hover:underline">
            reset
          </button>
        )}
      </label>

      <Button variant="ghost" size="icon" onClick={onToggleZones} title="Pokaż strefy ochronne w łazience">
        {showZones ? <Eye size={15} /> : <EyeOff size={15} />}
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

      {/* Wymiary WSZYSTKICH ścian naraz. Domyślnie wyłączone, bo przy rysowaniu
          przeszkadzają — a włączone są tym, co odróżnia wydrukowany rzut od obrazka:
          bez ani jednego wymiaru nie da się z niego nic wytyczyć na budowie. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleDimensions}
        title={showDimensions ? "Ukryj wymiary ścian i pomieszczeń" : "Pokaż wymiary ścian i pomieszczeń"}
        aria-label={showDimensions ? "Ukryj wymiary" : "Pokaż wymiary"}
        aria-pressed={showDimensions}
      >
        <Ruler size={15} className={showDimensions ? "text-copper" : undefined} />
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

      <div className="flex items-center">
        <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} title="Cofnij">
          <Undo2 size={15} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} title="Ponów">
          <Redo2 size={15} />
        </Button>
      </div>

      {/* Powiększenie WIDOKU. Wcześniej dostępne tylko przez Ctrl+scroll, czyli
          praktycznie niewykrywalne — teraz ma jawną kontrolkę z wartością. */}
      <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5">
        <button
          onClick={() => onZoomChange(clampZoom(zoom - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Oddal widok"
          title="Oddal widok"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => onZoomChange(1)}
          title="Przywróć powiększenie 100%"
          aria-label={`Powiększenie ${Math.round(zoom * 100)} procent — kliknij, aby przywrócić 100%`}
          className="pe-mono w-11 text-center text-[11px] tabular-nums text-slate-600"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => onZoomChange(clampZoom(zoom + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Przybliż widok"
          title="Przybliż widok"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <button
          onClick={onDopasuj}
          aria-label="Dopasuj widok do planu"
          title="Dopasuj widok do planu"
          className="rounded px-1.5 py-1 text-slate-500 hover:text-ink"
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

      {onZapisz && (
        <Button variant="copper" size="sm" onClick={onZapisz} disabled={zapisTrwa} title="Zapisz projekt na koncie">
          <Save size={14} /> Zapisz
        </Button>
      )}

      {przypinacz}
    </div>
  );
}
