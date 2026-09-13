import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FilePlus2,
  FileStack,
  Folder,
  FolderOpen,
  HelpCircle,
  Loader2,
  LogOut,
  Pencil,
  Save,
  Settings,
  UserRound,
} from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { useRoute } from "@/hooks/useRoute";
import { ZAKLADKA_DOMYSLNA, type AppTab as AppTabRoute } from "@/lib/routing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CloudSaveIndicator } from "@/components/ui/CloudSaveIndicator";
import { komunikatZapisu } from "@/lib/zapisLokalny";
import { AuthModal } from "@/components/auth/AuthModal";
import { ProjectsModal } from "@/components/auth/ProjectsModal";
import { AccountModal, type AccountModalTab } from "@/components/auth/AccountModal";
import { HelpModal } from "@/components/help/HelpModal";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { KompletDialog } from "@/components/ui/KompletDialog";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { NAWIGACJA_ODSTEP_PX } from "@/lib/design";
import { projectFileName } from "@/lib/pdf/download";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { WERSJA_BUILDU } from "virtual:wersja-buildu";

/**
 * KAŻDA zakładka ładowana leniwie — nigdy nie widać więcej niż jednej naraz.
 *
 * Konva/react-konva (DesignTab, PanelTab) był tu pierwszy i najbardziej oczywisty,
 * ale reszta ważyła razem tyle samo: sam `CalculatorsTab` to trzy tysiące linii i
 * dwadzieścia jeden silników obliczeniowych, których nie potrzebuje NIKT, kto wszedł
 * narysować rzut. Wejście na stronę ściągało komplet wszystkiego, choć aplikacja
 * montuje dokładnie jedną zakładkę.
 *
 * Komplet dokumentacji przechodzi przez `lib/pdf/rejestr.ts`, więc podział działa
 * i dla niego: komplet OTWIERA potrzebną zakładkę i czeka, aż zgłosi się jej
 * producent — z limitem czasu, który obejmuje też pobranie tego kawałka kodu.
 */
const wczytaj = {
  projekt: () => import("@/components/design/DesignTab"),
  rozdzielnica: () => import("@/components/panel/PanelTab"),
  kalkulatory: () => import("@/components/calculators/CalculatorsTab"),
  protokoly: () => import("@/components/protocols/ProtocolsTab"),
  schemat: () => import("@/components/schema/SchemaTab"),
  kosztorys: () => import("@/components/costs/CostsTab"),
} as const;

const DesignTab = lazy(() => wczytaj.projekt().then((m) => ({ default: m.DesignTab })));
const PanelTab = lazy(() => wczytaj.rozdzielnica().then((m) => ({ default: m.PanelTab })));
const CalculatorsTab = lazy(() => wczytaj.kalkulatory().then((m) => ({ default: m.CalculatorsTab })));
const ProtocolsTab = lazy(() => wczytaj.protokoly().then((m) => ({ default: m.ProtocolsTab })));
const SchemaTab = lazy(() => wczytaj.schemat().then((m) => ({ default: m.SchemaTab })));
const CostsTab = lazy(() => wczytaj.kosztorys().then((m) => ({ default: m.CostsTab })));

/**
 * Pobiera kod zakładki, ZANIM użytkownik w nią kliknie.
 *
 * Podział na kawałki zdjął z wejścia 283 kB, ale przeniósł je na pierwsze kliknięcie:
 * same Kalkulatory to 206 kB, czyli na wolnym łączu widoczne „Wczytywanie…". Kursor
 * jest jednak nad przyciskiem grubo wcześniej, niż go naciśnie — i tę zwłokę
 * wykorzystujemy na pobranie kodu.
 *
 * Wywołanie jest BEZPIECZNE do powtarzania: `import()` zwraca ten sam moduł z pamięci
 * podręcznej modułów, więc dziesiąte najechanie na przycisk nie pobiera nic więcej.
 *
 * Błąd jest tu połykany ŚWIADOMIE. Nieudane pobranie z wyprzedzenia (chwilowy brak
 * sieci) nie jest zdarzeniem, o którym użytkownik ma się dowiedzieć — nic przecież
 * nie kliknął. Prawdziwe kliknięcie spróbuje jeszcze raz i wtedy błąd pokaże się
 * normalnie, przez `Suspense`. Bez `catch` zostawialibyśmy odrzuconą obietnicę,
 * która trafia do konsoli jako nieobsłużony wyjątek.
 */
function pobierzZawczasu(tab: AppTab): void {
  void wczytaj[tab]().catch(() => {});
}

function TabLoading() {
  return (
    <div className="flex items-center gap-2 py-12 text-sm text-slate-400">
      <Loader2 size={16} className="animate-spin" /> Wczytywanie…
    </div>
  );
}

/**
 * Logo marki. `LOGO_SVG_MARKUP` (domek + napis w jednym SVG) — używane tam,
 * gdzie ma to być jeden zwarty znak marki bez osobnej stopki (stopka niżej).
 * `ICON_SVG_MARKUP` (sam domek, patrz `LogoIcon` niżej) — używane w nagłówku,
 * gdzie napis musi być zwykłym, widocznym `<h1>` obok ikony (żeby dało się go
 * swobodnie stylować i stawiać pod nim hasło), a nie częścią jednego SVG.
 *
 * HISTORIA: duży SVG z wpisanym tekstem (`LOGO_SVG_MARKUP`) w nagłówku
 * korelował z RZADKĄ utratą zdarzenia dblclick na niepowiązanym elemencie
 * płótna Konvy niżej na stronie (`light-groups.spec.ts`, test „ręczna zmiana
 * grupy..." zawodził w 3-5 na 5 przebiegów). Po zamianie nagłówka na wariant
 * z samą IKONĄ (`ICON_SVG_MARKUP`, dużo mniejszy SVG, bez `<text>`) i zwykłym
 * `<h1>` obok — 10/10 przebiegów przechodzi czysto. Silnie sugeruje to, że to
 * właśnie DUŻY SVG Z TEKSTEM w nagłówku był przyczyną (np. przez wpływ na
 * pomiar/reflow layoutu w złym momencie), a nie SVG jako taki — `LOGO_SVG_MARKUP`
 * nadal działa bez problemu w stopce, z dala od nagłówka. Mechanizmu
 * łączącego oba fakty nie potwierdzono formalnie (dblclick w Konvie wymaga
 * referencyjnej równości `clickEndShape` między klikami w oknie
 * `dblClickWindow`, `node_modules/konva/lib/Stage.js`), więc jeśli
 * `light-groups.spec.ts` znów zacznie migać, to naturalny punkt startowy —
 * ale traktuj to jako naprawione, nie jako otwarte ryzyko. */
const LOGO_SVG_MARKUP = `<svg viewBox="0 0 600 110" xmlns="http://www.w3.org/2000/svg" style="height:100%;width:auto;display:block">
  <g transform="translate(8,20) scale(1.09)">
    <path d="M32 5 L61 31 H3 Z" fill="#E08A1E"></path>
    <path d="M11 31 H53 V57 H11 Z M21 37 h6 v13 h-6 Z M37 37 h6 v13 h-6 Z" fill="#16191C" fill-rule="evenodd"></path>
  </g>
  <text x="94" y="66" font-family="Space Grotesk, Helvetica, Arial, sans-serif" font-weight="700" font-size="40" letter-spacing="-1.4" fill="#16191C">pomocnikelektryka<tspan fill="#E08A1E">.pl</tspan></text>
</svg>`;

// Sam domek, przycięty do własnego viewBoxa (te same ścieżki co w LOGO_SVG_MARKUP,
// bez otaczającego <g transform>) — używany tam, gdzie napis musi być zwykłym,
// widocznym HTML-em obok ikony (nagłówek: patrz komentarz przy <Logo> niżej),
// zamiast być częścią jednego złożonego SVG z tekstem.
const ICON_SVG_MARKUP = `<svg viewBox="0 0 64 60" xmlns="http://www.w3.org/2000/svg" style="height:100%;width:auto;display:block">
  <path d="M32 5 L61 31 H3 Z" fill="#E08A1E"></path>
  <path d="M11 31 H53 V57 H11 Z M21 37 h6 v13 h-6 Z M37 37 h6 v13 h-6 Z" fill="#16191C" fill-rule="evenodd"></path>
</svg>`;

function Logo({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <span
      className={className}
      style={{ display: "inline-block" }}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "pomocnikelektryka.pl" })}
      dangerouslySetInnerHTML={{ __html: LOGO_SVG_MARKUP }}
    />
  );
}

/** Sam domek z loga, bez napisu — do nagłówka, gdzie napis stoi obok jako zwykły
 *  tekst (patrz użycie przy <header>). */
function LogoIcon({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{ display: "inline-block" }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: ICON_SVG_MARKUP }}
    />
  );
}

interface TabButtonProps {
  id: AppTab;
  label: string;
  active: AppTab;
  onPick: (t: AppTab) => void;
}

/**
 * Kafel etapu w pasku przepływu: numer w kółku, tytuł i podtytuł mówiący, co się
 * na tym etapie dzieje. Podtytuł jest tu po to, żeby laik wiedział, czego się
 * spodziewać PRZED kliknięciem — „Rozdzielnica" samo w sobie nic mu nie mówi.
 */
function FlowCard({
  step,
  title,
  subtitle,
  isActive,
  badge,
  tab,
  onPick,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  isActive: boolean;
  badge?: string;
  /** Zakładka tego etapu — stąd i przejście, i pobranie kodu z wyprzedzeniem.
   *  Wcześniej kafel dostawał samo `onClick`, więc nie wiedział, DOKĄD prowadzi. */
  tab: AppTab;
  onPick: (tab: AppTab) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors"
      style={
        isActive
          ? { borderColor: "#C1793F", background: "#C1793F0A" }
          : { borderColor: "#E6EAEF", background: "#fff" }
      }
    >
      {/* Numer, plakietka i podtytuł są `aria-hidden`, żeby nazwą dostępnościową
          przycisku został sam tytuł etapu („Rozdzielnica", nie „02 Rozdzielnica auto
          Dobór i schemat") — dla czytników ekranu i testów e2e. */}
      <button
        onClick={() => onPick(tab)}
        onPointerEnter={() => pobierzZawczasu(tab)}
        onFocus={() => pobierzZawczasu(tab)}
        className="flex items-center gap-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className="pe-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold"
          style={isActive ? { background: "#C1793F", color: "#fff" } : { background: "#EEF1F4", color: "#94A3B8" }}
        >
          {step}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold" style={{ color: isActive ? "#16202B" : "#475569" }}>
              {title}
            </span>
            {badge && (
              <span
                aria-hidden="true"
                className="pe-mono rounded px-1 py-0.5 text-[8px] uppercase tracking-wider text-slate-400"
                style={{ background: "#EEF1F4" }}
              >
                {badge}
              </span>
            )}
          </span>
          <span aria-hidden="true" className="block text-[10.5px] leading-tight text-slate-400">
            {subtitle}
          </span>
        </span>
      </button>
      {children}
    </div>
  );
}

/** Strzałka między etapami — czysto dekoracyjna, ukryta przed czytnikami ekranu. */
function FlowArrow() {
  return <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-slate-300" />;
}

/** Narzędzie pomocnicze poza głównym przepływem (Kalkulatory, Protokoły). */
function ToolTab({ id, label, active, onPick }: TabButtonProps) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onPick(id)}
      // `pointerenter` obsługuje mysz, pióro I dotyk (przy dotyku pada w momencie
      // przyłożenia palca, czyli i tak przed `click`); `focus` — nawigację klawiaturą.
      onPointerEnter={() => pobierzZawczasu(id)}
      onFocus={() => pobierzZawczasu(id)}
      className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition-colors"
      style={isActive ? { color: "#C1793F", background: "#C1793F14", fontWeight: 600 } : { color: "#64748B" }}
    >
      {label}
    </button>
  );
}

/** Typ mieszka teraz w `lib/routing.ts` — od kiedy zakładki mają własne adresy,
 *  to routing jest właścicielem ich słownika. Reeksport, żeby nie przepisywać
 *  importu w każdym miejscu w tym pliku, które się do niego odwołuje. */
type AppTab = AppTabRoute;

/** Kolejność głównego przepływu 1→2→3→4 (patrz kafle „FlowCard” niżej) — osobno od
 *  „Kalkulatory”/„Protokoły pomiarowe”, które są narzędziami OBOK przepływu, nie jego
 *  krokami. Używana przez przycisk „Dalej”, żeby wiedzieć, dokąd prowadzi kolejny krok,
 *  bez zgadywania po całej liście zakładek. */
const KOLEJNOSC_KROKOW: { id: AppTab; tytul: string }[] = [
  { id: "projekt", tytul: "Instalacja" },
  { id: "rozdzielnica", tytul: "Rozdzielnica" },
  { id: "schemat", tytul: "Schemat" },
  { id: "kosztorys", tytul: "Kosztorys" },
];

/** Nazwa projektu, edytowalna wprost w nagłówku — była zapisywana w store od
 *  integracji z chmurą (`setProjectName`), ale nie miała żadnej kontrolki w UI. */
function ProjectNameField() {
  const projectName = useProjectStore((s) => s.projectName);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(projectName);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, projectName]);

  function commit() {
    const trimmed = draft.trim();
    setProjectName(trimmed || "Projekt");
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="rounded border border-copper/40 bg-white px-2 py-0.5 text-base font-semibold text-ink outline-none focus:border-copper"
        style={{ width: "18ch" }}
        aria-label="Nazwa projektu"
      />
    );
  }

  return (
    // Nazwa projektu to GŁÓWNY identyfikator tego, nad czym się pracuje — wcześniej
    // stała tym samym bladym `text-sm text-slate-600` co reszta drobnego chrome'u
    // nagłówka (etykieta „Projekt:”, ikonki), więc ginęła w tle mimo bycia
    // najważniejszą informacją w tym rzędzie. `text-base font-semibold text-ink`
    // to ta sama waga, jaką dostają nagłówki sekcji (`pe-display`) w reszcie apki.
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 rounded px-2 py-0.5 text-base font-semibold text-ink hover:bg-slate-100"
      title="Zmień nazwę projektu"
    >
      {projectName}
      <Pencil size={13} className="text-slate-400 group-hover:text-slate-600" />
    </button>
  );
}

/**
 * „Nowy projekt" — czyści bieżący plan i zaczyna od zera. Z potwierdzeniem, bo
 * odkąd działa autozapis (patrz useProjectStore.ts) nie ma już „przypadkowego"
 * odzyskania poprzedniego stanu przez odświeżenie strony: skasowane znika na dobre.
 * Okno wprost nazywa, co przepada, a co zostaje — żeby nikt nie klikał w ciemno.
 */
function NewProjectButton({ onConfirm, elementCount }: { onConfirm: () => void; elementCount: number }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="copper" size="sm" title="Zacznij nowy projekt od zera">
          <FilePlus2 size={14} /> Nowy projekt
        </Button>
      </DialogTrigger>
      <DialogContent title="Zacząć nowy projekt?">
        <p className="mb-3 text-sm text-slate-600">
          {elementCount > 0
            ? `Bieżący projekt (${elementCount} ${elementCount === 1 ? "element" : elementCount < 5 ? "elementy" : "elementów"} na planie) zostanie usunięty z tej przeglądarki.`
            : "Bieżący projekt zostanie wyczyszczony."}{" "}
          Tej operacji nie da się cofnąć.
        </p>
        <p className="mb-4 text-xs text-slate-500">
          Zostaną Twoje dane jako wykonawcy (nazwisko, uprawnienia, miernik) oraz projekty zapisane w chmurze.
        </p>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Anuluj
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="copper" size="sm" onClick={onConfirm}>
              Tak, zacznij od nowa
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Powłoka aplikacji spinająca wszystkie przeniesione zakładki (Kalkulatory,
 * Zaprojektuj instalację, Rozdzielnica, Protokoły, Schemat, Kosztorys) ze
 * store'em Zustand, plus logowanie i zapis projektu w chmurze (Supabase).
 */
export default function App() {
  // Zakładka wynika z ADRESU, nie ze stanu komponentu — dzięki temu każdy widok da
  // się podlinkować, „wstecz" cofa o krok zamiast wychodzić ze strony, a odświeżenie
  // wraca tam, gdzie użytkownik był. Parametr (`route.param`) czytają zakładki, które
  // go używają: kalkulatory i protokoły.
  const [route, nawiguj] = useRoute();
  const tab = route.tab;
  const setTab = (t: AppTab) => nawiguj(t);

  // Adres, którego nie dało się rozpoznać, pokazuje stronę startową — więc niech i
  // pasek adresu to przyzna, zamiast twierdzić, że jesteśmy pod „/literowka".
  // `replace`, bo to sprostowanie, a nie przejście: „wstecz" nie ma wracać na adres,
  // który natychmiast sprostuje się ponownie.
  useEffect(() => {
    if (!route.rozpoznana) nawiguj(ZAKLADKA_DOMYSLNA, null, { replace: true });
  }, [route.rozpoznana, nawiguj]);

  const session = useProjectStore((s) => s.session);
  const setSession = useProjectStore((s) => s.setSession);
  const cloudBusy = useProjectStore((s) => s.cloudBusy);
  const cloudSaveError = useProjectStore((s) => s.cloudSaveError);
  const limitBlokada = useProjectStore((s) => s.limitBlokada);
  const oknoZestawowOtwarte = useProjectStore((s) => s.oknoZestawowOtwarte);
  const setOknoZestawow = useProjectStore((s) => s.setOknoZestawow);
  const loadProtokolyFromCloud = useProjectStore((s) => s.loadProtokolyFromCloud);
  const saveProtokolyToCloud = useProjectStore((s) => s.saveProtokolyToCloud);
  const pytanieONadpisanie = useProjectStore((s) => s.pytanieONadpisanie);
  const anulujNadpisanie = useProjectStore((s) => s.anulujNadpisanie);
  const konfliktChmury = useProjectStore((s) => s.konfliktChmury);
  const odlozKonflikt = useProjectStore((s) => s.odlozKonflikt);
  const setLimitBlokada = useProjectStore((s) => s.setLimitBlokada);
  const saveToCloud = useProjectStore((s) => s.saveToCloud);
  const loadFromCloud = useProjectStore((s) => s.loadFromCloud);
  const resetProject = useProjectStore((s) => s.resetProject);
  const elementCount = useProjectStore((s) => s.draft.elements.length);
  /**
   * Czy w projekcie nie ma JESZCZE NICZEGO — ani osprzętu, ani ścian, ani pomieszczeń.
   *
   * Steruje widocznością pigułki „Dalej" (patrz niżej). Liczy KAŻDY narysowany obiekt,
   * nie tylko elementy instalacji: kto postawił same ściany, zaczął już projekt i nie
   * ma powodu odbierać mu wygodnego skrótu do kolejnego kroku.
   */
  const projektPusty = useProjectStore(
    (s) => s.draft.elements.length === 0 && s.draft.walls.length === 0 && s.draft.roomShapes.length === 0
  );
  const localSaveError = useProjectStore((s) => s.localSaveError);
  const lastLocalSaveAt = useProjectStore((s) => s.lastLocalSaveAt);
  const projectName = useProjectStore((s) => s.projectName);

  const [authOpen, setAuthOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  /** `null` = zamknięty; w przeciwnym razie mówi, KTÓRA zakładka ma być aktywna
   *  po otwarciu — z menu konta da się wejść wprost w „Ustawienia", bez
   *  przechodzenia najpierw przez „Profil". */
  const [accountModalTab, setAccountModalTab] = useState<AccountModalTab | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [kompletOpen, setKompletOpen] = useState(false);
  /** Gotowe bajty kompletu — trzymane tu, bo podglad ma pokazac DOKLADNIE ten plik,
   *  ktory przed chwila powstal, a nie zbudowac go po raz drugi. */
  const [kompletBajty, setKompletBajty] = useState<Uint8Array | null>(null);

  function signOut() {
    setSession(null);
  }

  async function loadCloudProject(id: string) {
    await loadFromCloud(id);
    // `loadFromCloud` łapie błędy sam (ustawia `cloudSaveError`, nie rzuca) —
    // modal zamykamy tylko przy powodzeniu, żeby błąd nie zniknął razem z nim.
    if (!useProjectStore.getState().cloudSaveError) {
      setProjectsOpen(false);
      // Po wczytaniu pokazujemy PLAN, niezależnie od tego, z której zakładki
      // otwarto listę. Projekt to przede wszystkim rzut — wylądowanie w kosztorysie
      // albo w protokołach zostawiało użytkownika bez widocznego potwierdzenia,
      // że cokolwiek się wczytało.
      setTab("projekt");
    }
  }

  return (
    // Kolumna z rozciągliwym środkiem: stopka ma siedzieć przy DOLE OKNA, gdy treść
    // jest krótsza niż ekran. Wcześniej kończyła się tam, gdzie kończyła się treść,
    // i na ekranie startowym (najkrótszym w całej aplikacji) zostawiało to 281 px
    // gołego tła POD stopką przy oknie 1440×900 — najważniejsza strona wyglądała na
    // uciętą w połowie. `min-h-screen` samo tego nie robiło: rozciągało tło, ale nie
    // rozdzielało wysokości między dzieci.
    <div className="flex min-h-screen flex-col p-6">
      {/* Nagłówek niesie jedyną informację o tym, CZYM jest ta strona, więc logo i hasło
          dostają realną wagę: znak graficzny jako punkt zaczepienia dla oka, nazwa w
          rozmiarze tytułu i hasło w kolorze tekstu, a nie wyszarzonym. Wcześniej logo
          było tej samej wielkości co etykiety przycisków obok i ginęło w pasku. */}
      {/* Nagłówek: marka po lewej, narzędzia poza przepływem i konto po prawej.
          Kalkulatory i Protokoły stoją TUTAJ, a nie w pasku etapów — nie są krokami
          projektowania domu, tylko niezależnymi narzędziami (patrz „Decyzje
          produktowe" w MIGRATION.md), więc mieszanie ich z 01→02→03 mylnie
          sugerowało, że są częścią tej samej ścieżki. */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        {/* Logo wraca do etapu 01 — tak działa znak marki na każdej stronie i tego
            użytkownik próbuje odruchowo, gdy zgubi się w kreatorze albo w kalkulatorach.
            Przycisk, nie link: to nawigacja WEWNĄTRZ aplikacji, bez przeładowania. */}
        <button
          onClick={() => setTab("projekt")}
          onPointerEnter={() => pobierzZawczasu("projekt")}
          onFocus={() => pobierzZawczasu("projekt")}
          title="Wróć do projektowania instalacji"
          aria-label="pomocnikelektryka.pl — wróć do projektowania instalacji"
          className="flex min-w-0 items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80"
        >
          <span className="flex min-w-0 items-center gap-3">
            <LogoIcon className="h-11 w-11 shrink-0" />
            <span className="min-w-0">
              {/* Napis wraca jako zwykły, widoczny <h1> — ten sam rozmiar co
                  poprzednie logo (text-[23px] font-bold), tylko obok ikony
                  zamiast bycia częścią jednego złożonego SVG z tekstem. */}
              <h1 className="font-sans text-[23px] font-bold leading-tight tracking-tight text-ink">
                pomocnikelektryka<span className="text-copper">.pl</span>
              </h1>
              {/* Hasło zostaje mimo makiety: aplikacja jest adresowana do laików i to
                  jedyne zdanie, które od razu mówi, co ona właściwie robi. Stoi pod
                  napisem, w tej samej kolumnie co on (czyli na prawo od domku), nie
                  pod całym logo. */}
              <span className="block max-w-xl text-[12.5px] leading-snug text-slate-500">
                Zaprojektuj instalację elektryczną w swoim domu!
              </span>
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <ToolTab id="kalkulatory" label="Kalkulatory" active={tab} onPick={setTab} />
          <ToolTab id="protokoly" label="Protokoły pomiarowe" active={tab} onPick={setTab} />
          {/* Komplet jest w NAGŁÓWKU, nie na końcu przepływu: składa się z dokumentów
              z czterech zakładek plus protokołów, więc nie należy do żadnej z nich
              bardziej niż do pozostałych. Do tego samo okno musi żyć poza zakładkami,
              bo w trakcie składania je przełącza (patrz `KompletDialog`). */}
          <button
            onClick={() => setKompletOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-500 transition-colors hover:text-copper"
          >
            <FileStack size={15} /> Dokumentacja
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-500 transition-colors hover:text-copper"
          >
            <HelpCircle size={15} /> Pomoc
          </button>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          {/* Niezalogowany widzi ten sam chip co dotychczas. Po zalogowaniu jego rolę
              przejmuje `CloudSaveIndicator` obok menu konta: pokazuje PRAWDZIWY status
              („zapisywanie…”, godzinę ostatniego zapisu albo błąd), nie tylko fakt
              bycia zalogowanym.
              Treść i ikona: „Synchronizacja: offline” + `CloudOff` brzmiały jak awaria
              (czerwonawe skojarzenie „offline” + przekreślona chmura), a to normalny,
              bezpieczny stan — projekt JEST zapisany, tylko lokalnie. „Zapisano
              lokalnie” + `Save` mówią wprost co się dzieje, bez straszenia. Klikalne
              (gdy Supabase jest skonfigurowane) — otwiera logowanie, więc to
              rzeczywista zachęta, nie tylko podpowiedź w tooltipie. */}
          {/* Chip stwierdzał „Zapisano lokalnie" ZAWSZE, bo był napisem, nie stanem —
              także wtedy, gdy pamięć przeglądarki się skończyła i nic się nie zapisało.
              Teraz mówi prawdę i w razie awarii prowadzi tam, gdzie limitu nie ma
              (patrz `localSaveError` w store). Zostaje w nagłówku, a nie w pasku stanu
              edytora, właśnie po to: awarię widać z każdej zakładki. */}
          {!session && (
            <button
              type="button"
              onClick={SUPABASE_CONFIGURED ? () => setAuthOpen(true) : undefined}
              disabled={!SUPABASE_CONFIGURED}
              className={`pe-chip hidden items-center gap-1 transition-colors enabled:hover:border-copper enabled:hover:text-copper lg:flex disabled:cursor-default ${
                localSaveError ? "font-medium text-warn" : "text-slate-400"
              }`}
              title={
                localSaveError
                  ? komunikatZapisu(localSaveError, lastLocalSaveAt)?.tytul
                  : SUPABASE_CONFIGURED
                    ? "Zaloguj się, aby synchronizować projekt z chmurą"
                    : "Uzupełnij VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w .env"
              }
            >
              {localSaveError ? <AlertTriangle size={13} /> : <Save size={13} />}{" "}
              {localSaveError ? komunikatZapisu(localSaveError, lastLocalSaveAt)?.tekst : "Zapisano lokalnie"}
            </button>
          )}
          <NewProjectButton onConfirm={resetProject} elementCount={elementCount} />
          {session ? (
            <>
              <CloudSaveIndicator />
              {/* Menu konta: avatar z pierwszą literą e-maila zamiast rzędu osobnych
                  przycisków — to jest ten wygląd „po zalogowaniu”, o który chodziło:
                  jedno miejsce na wszystko związane z kontem, nie cztery obok siebie. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-white py-1 pl-1 pr-2 transition-colors hover:bg-slate-50"
                    title={session.user.email}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: "#2D5A8C" }}
                    >
                      {(session.user.email ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <ChevronDown size={13} className="text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>{session.user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setAccountModalTab("profil")}>
                    <UserRound size={14} /> Profil
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setAccountModalTab("ustawienia")}>
                    <Settings size={14} /> Ustawienia
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setProjectsOpen(true)}>
                    <FolderOpen size={14} /> Moje projekty
                  </DropdownMenuItem>
                  {/* Protokoły są osobnym dokumentem, więc mają własne wejście obok
                      projektów — inaczej dotarcie do zapisanych pomiarów wymagałoby
                      przejścia do zakładki, czyli wiedzy, że w ogóle tam są. */}
                  <DropdownMenuItem onSelect={() => setOknoZestawow(true)}>
                    <ClipboardList size={14} /> Moje zestawy protokołów
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void saveToCloud({ reczny: true })} disabled={cloudBusy}>
                    <Save size={14} /> Zapisz teraz
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={signOut} className="text-red-600">
                    <LogOut size={14} /> Wyloguj
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-slate-50"
            >
              <UserRound size={15} /> Zaloguj się
            </button>
          )}
        </div>
      </header>

      {/* Pasek projektu: nazwa po lewej, etapy przepływu po prawej. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Folder size={15} className="text-slate-400" aria-hidden="true" />
          <span className="text-sm text-slate-400">Projekt:</span>
          <ProjectNameField />
        </div>
        {/* Bez widocznego suwaka: to pasek nawigacji, a nie okno z treścią. Że da
            się przewinąć, widać po przyciętej karcie następnego etapu — tak samo
            jak w paskach kart przeglądarki. */}
        {/* `min-w-0` NIE jest tu ozdobą. Element elastyczny ma domyślnie
            `min-width: auto`, więc nie kurczy się poniżej szerokości swojej treści —
            i `overflow-x-auto` nigdy się nie włączało: zamiast przewijać kafle
            wewnątrz, pasek rozpychał całą stronę. Na oknie 375 px dawało to dokument
            o szerokości 655 px, czyli poziome przewijanie CAŁEJ aplikacji. */}
        <div className="pe-bez-suwaka -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5">
          <FlowCard
            step="01"
            title="Instalacja"
            subtitle="Projekt instalacji"
            isActive={tab === "projekt"}
            tab="projekt"
            onPick={setTab}
          />
          <FlowArrow />
          {/* Rozdzielnica i Schemat to dwa OSOBNE etapy, choć oba powstają automatycznie
              z planu — stąd plakietka „auto" na obu. Podtytuł etapu 02 mówi już tylko
              o doborze: schemat ma własny kafel i obiecywanie go tutaj wprowadzałoby
              w błąd co do tego, gdzie go szukać. */}
          <FlowCard
            step="02"
            title="Rozdzielnica"
            subtitle="Dobór zabezpieczeń"
            badge="auto"
            isActive={tab === "rozdzielnica"}
            tab="rozdzielnica"
            onPick={setTab}
          />
          <FlowArrow />
          <FlowCard
            step="03"
            title="Schemat"
            subtitle="Schemat jednokreskowy"
            badge="auto"
            isActive={tab === "schemat"}
            tab="schemat"
            onPick={setTab}
          />
          <FlowArrow />
          <FlowCard
            step="04"
            title="Kosztorys"
            subtitle="Zestawienie kosztów"
            isActive={tab === "kosztorys"}
            tab="kosztorys"
            onPick={setTab}
          />
        </div>
      </div>

      {/* Nawigacja celowo NIE zawija przepływu (`flex-wrap`, jak było wcześniej): przy
          wąskim oknie strzałka lądowała na końcu wiersza bez celu, a „3 Kosztorys"
          wskakiwał wizualnie do przerywanej ramki kroku 2 — czyli kolejność 1→2→3, cały
          sens tego paska, przestawała być czytelna. Teraz przepływ jest jednym rzędem,
          który w razie braku miejsca przewija się poziomo, a narzędzia schodzą do
          własnego wiersza pod spodem. */}
      {/* Granica błędu obejmuje SAMĄ TREŚĆ zakładki, nie całą stronę: gdy jedna
          zakładka padnie, nagłówek i nawigacja mają zostać na miejscu, żeby dało się
          po prostu przejść gdzie indziej. `key={tab}` zeruje ją przy każdej zmianie
          zakładki — bez tego raz złapany błąd zostawałby na ekranie na zawsze, także
          po przejściu na sprawną zakładkę. */}
      {/* Rozciągliwy środek kolumny — to on spycha stopkę na dół okna (patrz komentarz
          przy korzeniu wyżej). `flex flex-col`, a nie zwykły blok, żeby zakładka mogła
          SAMA sięgnąć po tę wysokość, gdy ma z niej pożytek: ekran startowy Instalacji
          rozciąga się na całą wolną przestrzeń i centruje w niej swoją treść, zamiast
          zostawiać pod sobą pas pustego tła (patrz `showEntryScreen` w DesignTab). */}
      <div className="flex flex-1 flex-col">
      <ErrorBoundary key={tab} onReset={() => setTab(ZAKLADKA_DOMYSLNA)}>
      {tab === "kalkulatory" && (
        <Suspense fallback={<TabLoading />}>
          <CalculatorsTab />
        </Suspense>
      )}

      {tab === "rozdzielnica" && (
        <Suspense fallback={<TabLoading />}>
          <PanelTab />
        </Suspense>
      )}

      {tab === "protokoly" && (
        <Suspense fallback={<TabLoading />}>
          <ProtocolsTab />
        </Suspense>
      )}

      {tab === "schemat" && (
        <Suspense fallback={<TabLoading />}>
          <SchemaTab />
        </Suspense>
      )}

      {tab === "kosztorys" && (
        <Suspense fallback={<TabLoading />}>
          <CostsTab />
        </Suspense>
      )}

      {tab === "projekt" && (
        <>
          <Suspense fallback={<TabLoading />}>
            <DesignTab onOpenAuth={() => setAuthOpen(true)} />
          </Suspense>
        </>
      )}
      </ErrorBoundary>
      </div>

      {/*
        Duży, zawsze widoczny przycisk „Dalej” — bez niego jedyną drogą do kolejnego
        kroku były małe kafle przepływu na samej górze strony, poza kadrem po
        przewinięciu w dół do treści. Kto nie skojarzył kafli z nawigacją, nie miał
        skąd wiedzieć, co robić dalej.

        `position: fixed` w rogu, więc nie zależy od długości treści ani pozycji
        przewijania — zawsze w tym samym miejscu, niezależnie od zakładki. Pokazuje
        się TYLKO na krokach głównego przepływu (nie na „Kalkulatory”/„Protokoły
        pomiarowe”, które są narzędziami obok przepływu) i znika na ostatnim kroku —
        nie ma dokąd iść dalej z Kosztorysu.

        `z-30`: CELOWO niżej niż nakładka pełnoekranowego projektowania (`z-40` w
        DesignTab) — w pełnym ekranie chowa się razem z resztą chrome'u, zgodnie
        z sensem tego trybu (skupienie na rysunku, bez elementów nawigacji).
      */}
      {/*
        „Cofnij” — lustrzane odbicie przycisku „Dalej” (ten sam styl, przeciwny róg,
        ta sama logika widoczności): powrót do POPRZEDNIEGO kroku głównego przepływu,
        bez konieczności sięgania po kafle na górze strony. Nie pokazuje się na
        pierwszym kroku („Instalacja") — nie ma dokąd się cofnąć.
      */}
      {(() => {
        const idx = KOLEJNOSC_KROKOW.findIndex((k) => k.id === tab);
        const poprzedni = idx > 0 ? KOLEJNOSC_KROKOW[idx - 1] : undefined;
        if (!poprzedni) return null;
        return (
          <button
            onClick={() => setTab(poprzedni.id)}
            onPointerEnter={() => pobierzZawczasu(poprzedni.id)}
            onFocus={() => pobierzZawczasu(poprzedni.id)}
            // Ukryty poniżej `md`: to `position: fixed` w rogu OKNA, obojętne na
            // przewijanie i długość treści pod spodem — na wąskich/niskich oknach
            // (kolumna narzędzi + panel Instalacji już same potrzebują sporo
            // szerokości) potrafił więc wylądować DOKŁADNIE na polu wyszukiwania
            // elementów albo zakładkach panelu, zasłaniając je. Kafle „01/02/03/04”
            // u góry dają dokładnie tę samą nawigację, więc chowamy tu tylko wygodny
            // skrót, nie funkcję.
            //
            // Odstęp od dolnej krawędzi ze WSPÓLNEJ stałej, nie z klasy `bottom-5`:
            // edytor planu odejmuje to samo pasmo od wysokości płótna, żeby pigułka
            // nie leżała na rysunku (patrz `PASMO_NAWIGACJI_PX`). Dwie liczby w dwóch
            // plikach rozjechałyby się przy pierwszej zmianie stylu.
            style={{ bottom: NAWIGACJA_ODSTEP_PX }}
            className="fixed left-5 z-30 hidden items-center gap-1.5 rounded-full bg-copper px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-copper/90 md:flex"
          >
            <ArrowLeft size={15} />
            Cofnij: {poprzedni.tytul}
          </button>
        );
      })()}

      {(() => {
        const idx = KOLEJNOSC_KROKOW.findIndex((k) => k.id === tab);
        const nastepny = idx >= 0 ? KOLEJNOSC_KROKOW[idx + 1] : undefined;
        if (!nastepny) return null;
        // Na PUSTYM projekcie „Dalej" nie ma dokąd prowadzić: rozdzielnica bez ani
        // jednego odbiornika nie ma czego dobrać, schemat nie ma czego narysować,
        // a kosztorys czego policzyć. Świecąca zachęta do przejścia dalej, zanim
        // cokolwiek powstało, wysyła nowego użytkownika w trzy puste ekrany zamiast
        // do rysowania — a rysowanie jest tym, po co tu przyszedł.
        // Tylko ta pigułka, nie „Cofnij": powrót nigdy nie jest przedwczesny.
        // Kafle 01/02/03/04 u góry działają bez zmian, więc to skrót, nie blokada
        // (ten sam argument co przy chowaniu obu pigułek poniżej `md`).
        if (projektPusty) return null;
        return (
          <button
            onClick={() => setTab(nastepny.id)}
            onPointerEnter={() => pobierzZawczasu(nastepny.id)}
            onFocus={() => pobierzZawczasu(nastepny.id)}
            // Patrz komentarz przy „Cofnij" wyżej — ten sam powód, ten sam próg,
            // ten sam odstęp ze wspólnej stałej.
            style={{ bottom: NAWIGACJA_ODSTEP_PX }}
            className="fixed right-5 z-30 hidden items-center gap-1.5 rounded-full bg-copper px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-copper/90 md:flex"
          >
            Dalej: {nastepny.tytul}
            <ArrowRight size={15} />
          </button>
        );
      })()}

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSignedIn={(s) => {
          setSession(s);
          setAuthOpen(false);
        }}
      />

      {session && (
        <ProjectsModal
          open={projectsOpen || limitBlokada?.rodzaj === "projekt"}
          session={session}
          rodzaj="projekt"
          onClose={() => {
            setProjectsOpen(false);
            setLimitBlokada(null);
          }}
          onLoad={loadCloudProject}
          busyMsg={cloudBusy ? "Wczytywanie…" : undefined}
          loadError={cloudSaveError}
          // Przy pełnym limicie okno otwiera się SAMO z komunikatem — bo zapis się
          // nie udał i użytkownik musi tu podjąć decyzję, a nie szukać, gdzie kliknąć.
          limitMsg={limitBlokada?.rodzaj === "projekt" ? limitBlokada.komunikat : null}
        />
      )}

      {/* Okno zestawów protokołów żyje TUTAJ, a nie w zakładce: otwierają je dwa
          różne miejsca (menu przy profilu i przycisk w zakładce), a dwie kopie tego
          samego okna rozjechałyby się stanem. Po wczytaniu przechodzimy na zakładkę
          protokołów, żeby było widać, co się właśnie wczytało. */}
      {session && (
        <ProjectsModal
          open={oknoZestawowOtwarte || limitBlokada?.rodzaj === "protokoly"}
          session={session}
          rodzaj="protokoly"
          onClose={() => {
            setOknoZestawow(false);
            setLimitBlokada(null);
          }}
          onLoad={async (id) => {
            await loadProtokolyFromCloud(id);
            if (!useProjectStore.getState().cloudSaveError) {
              setOknoZestawow(false);
              setTab("protokoly");
            }
          }}
          busyMsg={cloudBusy ? "Wczytywanie…" : undefined}
          loadError={cloudSaveError}
          limitMsg={limitBlokada?.rodzaj === "protokoly" ? limitBlokada.komunikat : null}
        />
      )}

      {/* Potwierdzenie nadpisania. Pojawia się TYLKO wtedy, gdy zapis trafiłby na
          wpis o tej samej nazwie, którego w tej sesji nie otwieraliśmy — a więc
          w sytuacji, w której użytkownik mógłby stracić cudzą (albo swoją starszą)
          pracę, nie wiedząc o tym. Zwykłe „zapisz zmiany” w otwartym dokumencie
          przechodzi bez pytania, żeby nie pytać przy każdym zapisie. */}
      <Dialog open={!!pytanieONadpisanie} onOpenChange={(o) => !o && anulujNadpisanie()}>
        <DialogContent title="Nadpisać istniejący zapis?">
          <p className="mb-2 text-sm text-slate-600">
            Na Twoim koncie jest już {pytanieONadpisanie?.rodzaj === "protokoly" ? "zestaw protokołów pomiarowych" : "projekt instalacji"} o nazwie{" "}
            <strong className="text-ink">„{pytanieONadpisanie?.nazwa}”</strong>.
          </p>
          <p className="mb-4 text-xs text-slate-500">
            Nadpisanie zastąpi tamten zapis bieżącą pracą — poprzedniej wersji nie da się odzyskać. Jeśli chcesz zachować
            oba, anuluj i zmień nazwę przed zapisem.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={anulujNadpisanie}>
              Anuluj
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                const p = pytanieONadpisanie;
                if (!p) return;
                anulujNadpisanie();
                if (p.rodzaj === "protokoly") void saveProtokolyToCloud(p.nazwa, { nadpiszId: p.id });
                else void saveToCloud({ reczny: true, nadpiszId: p.id });
              }}
            >
              Tak, nadpisz
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* KONFLIKT ZAPISU: w chmurze stoi nowsza wersja niż ta, od której zaczynaliśmy —
          zapisał drugi laptop, tablet albo druga karta. Obie wersje są czyjąś pracą,
          więc nie ma dobrego automatycznego wyjścia i decyzję podejmuje użytkownik.
          Wcześniej wygrywał po prostu ten, kto zapisał później, i nikt się o tym nie
          dowiadywał. */}
      {(() => {
        // Protokoły zapisują się WYŁĄCZNIE na kliknięcie, więc nie ma tam czego
        // wstrzymywać — zdanie o autozapisie dotyczy tylko projektu i pojawia się
        // tylko przy nim. Bez tego rozróżnienia okno mówiłoby o mechanizmie, którego
        // w tym dokumencie nie ma.
        const protokoly = konfliktChmury?.rodzaj === "protokoly";
        const czym = protokoly ? "zestawu protokołów" : "projektu";
        return (
          <Dialog open={!!konfliktChmury} onOpenChange={(o) => !o && odlozKonflikt()}>
            <DialogContent title={`Ktoś zapisał ${protokoly ? "te protokoły" : "ten projekt"} w międzyczasie`}>
              <p className="mb-2 text-sm text-slate-600">
                W chmurze jest nowsza wersja {czym} <strong className="text-ink">„{konfliktChmury?.nazwa}”</strong> niż
                ta, którą masz otwartą. Zapisał ją inny komputer, tablet albo druga karta tej przeglądarki.
              </p>
              <p className="mb-4 text-xs text-slate-500">
                {protokoly
                  ? "Wczytanie porzuci pomiary wpisane tutaj; nadpisanie porzuci tamte. Jeśli obie wersje są potrzebne, zmień nazwę zestawu i zapisz jako nowy."
                  : "Automatyczny zapis jest wstrzymany, żeby nie skasować żadnej z tych wersji. Wczytanie porzuci zmiany zrobione tutaj; nadpisanie porzuci tamte. Jeśli obie są potrzebne, zmień nazwę projektu i zapisz jako nowy."}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={odlozKonflikt}>
                  Zdecyduję później
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const k = konfliktChmury;
                    if (!k) return;
                    odlozKonflikt();
                    if (k.rodzaj === "protokoly") void loadProtokolyFromCloud(k.id);
                    else void loadFromCloud(k.id);
                  }}
                >
                  Wczytaj wersję z chmury
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    const k = konfliktChmury;
                    if (!k) return;
                    odlozKonflikt();
                    if (k.rodzaj === "protokoly") void saveProtokolyToCloud(k.nazwa, { nadpiszId: k.id });
                    else void saveToCloud({ reczny: true, nadpiszId: k.id });
                  }}
                >
                  Nadpisz moją wersją
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {session && accountModalTab && (
        <AccountModal
          open
          initialTab={accountModalTab}
          session={session}
          onClose={() => setAccountModalTab(null)}
        />
      )}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Okno kompletu i jego podglad mieszkaja TUTAJ, nie w zakladce: skladanie
          przelacza zakladki (patrz KompletDialog), wiec cokolwiek osadzonego
          w zakladce odmontowaloby sie w polowie wlasnej pracy. */}
      <KompletDialog open={kompletOpen} onOpenChange={setKompletOpen} onGotowe={setKompletBajty} />
      <PdfPreview
        open={kompletBajty !== null}
        onOpenChange={(v) => !v && setKompletBajty(null)}
        title="Komplet dokumentacji"
        filename={projectFileName("dokumentacja", projectName, "pdf")}
        build={async () => kompletBajty!}
      />

      <SiteFooter />
    </div>
  );
}

/**
 * Stopka. Poza domknięciem strony niesie zastrzeżenie, którego w aplikacji do
 * projektowania instalacji brakować nie powinno: dobór zabezpieczeń, przekrojów i
 * kosztorys są ORIENTACYJNE i nie zastępują projektu ani odbioru przez osobę z
 * uprawnieniami. Aplikacja jest adresowana głównie do laików (krok 20), więc to
 * zastrzeżenie musi być widoczne, a nie schowane w „warunkach użytkowania".
 */
function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-border pt-5 text-xs text-slate-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <Logo className="mb-1.5 h-5 w-auto" />
          <p className="leading-relaxed">
            Wyniki obliczeń — dobór zabezpieczeń, przekrojów przewodów, długości tras i kosztorys — są{" "}
            <strong className="font-semibold text-slate-600">orientacyjne</strong>. Nie zastępują projektu instalacji
            ani odbioru przez osobę z uprawnieniami SEP/budowlanymi. Prace przy instalacji pod napięciem może
            wykonywać wyłącznie uprawniony elektryk.
          </p>
        </div>
        <div className="text-slate-400">
          <div>Obliczenia wg PN-HD 60364</div>
          <div className="mt-0.5">Projekt zapisywany lokalnie w przeglądarce</div>
          {/* Wersja wdrożenia. Przy zgłoszeniu „u mnie nie działa" nie było czym
              ustalić, co ktoś ma właściwie załadowane: aplikacja jest jednostronicowa,
              więc adres tego nie mówi, a przeglądarka potrafi trzymać starą wersję. */}
          <div className="pe-mono mt-1 text-[10px] text-slate-300" title="Wersja wdrożenia — podaj ją przy zgłaszaniu problemu">
            wersja {WERSJA_BUILDU}
          </div>
        </div>
      </div>
    </footer>
  );
}
