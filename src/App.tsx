import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useProjectStore, zapiszTerazLokalnie } from "@/store/useProjectStore";
import { biezacyId, type WpisProjektu } from "@/lib/projektyLokalne";
import { useRoute } from "@/hooks/useRoute";
import { ZAKLADKA_DOMYSLNA, type AppTab as AppTabRoute } from "@/lib/routing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CloudSaveIndicator } from "@/components/ui/CloudSaveIndicator";
import { komunikatZapisu } from "@/lib/zapisLokalny";
import { AuthModal } from "@/components/auth/AuthModal";
import { NoweHasloDialog } from "@/components/auth/NoweHasloDialog";
import { ProjectsModal } from "@/components/auth/ProjectsModal";
import { AccountModal, type AccountModalTab } from "@/components/auth/AccountModal";
import { HelpModal } from "@/components/help/HelpModal";
import { PasekPrzykladu } from "@/components/onboarding/PasekPrzykladu";
import { PasekUszkodzonegoZapisu } from "@/components/ui/PasekUszkodzonegoZapisu";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { KompletDialog } from "@/components/ui/KompletDialog";
import { KopiaZapasowa } from "@/components/ui/KopiaZapasowa";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { UdostepnijLinkiem } from "@/components/ui/UdostepnijLinkiem";
import { NAWIGACJA_ODSTEP_PX } from "@/lib/design";
import { projectFileName } from "@/lib/pdf/download";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { odczytajFragmentAuth } from "@/lib/fragmentAuth";
import { etapy, type Etap, type StanEtapu } from "@/lib/postepKrokow";
/**
 * ŚWIADOME odstępstwo od podziału na kawałki opisanego niżej: `computeCircuits`
 * wchodzi do kawałka wejściowego, bo liczba obwodów stoi na kaflu etapu 02 —
 * a pasek etapów jest widoczny na KAŻDEJ zakładce, więc nie da się go odłożyć
 * do żadnej z nich.
 *
 * Cena zmierzona, nie zgadnięta: +7,9 kB surowo / +2,8 kB po gzipie na wejściu.
 * To TANIA połowa doboru — czyste grupowanie elementów w obwody, bez tablic
 * normatywnych i bez `computeSizedCircuits`/`computeCosts`, które zostają tam,
 * gdzie były. Alternatywą było meldowanie liczby obwodów do store'a z zakładek,
 * które i tak ją liczą — odrzucone: dawało stan „jeszcze nie wiadomo" na kaflu
 * u kogoś, kto wszedł prosto w Kosztorys, i drugie źródło prawdy do utrzymania.
 */
import { computeCircuits } from "@/lib/panel/circuits";
import { jestOdplywem } from "@/lib/panel/devices";
import { useWygaszenieKrawedzi } from "@/hooks/useWygaszenieKrawedzi";
import { useChowanieNaPrzewijaniu } from "@/hooks/useChowanieNaPrzewijaniu";
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
  prywatnosc: () => import("@/components/legal/PolitykaPrywatnosci"),
  regulamin: () => import("@/components/legal/Regulamin"),
} as const;

const DesignTab = lazy(() => wczytaj.projekt().then((m) => ({ default: m.DesignTab })));
const PanelTab = lazy(() => wczytaj.rozdzielnica().then((m) => ({ default: m.PanelTab })));
const CalculatorsTab = lazy(() => wczytaj.kalkulatory().then((m) => ({ default: m.CalculatorsTab })));
const ProtocolsTab = lazy(() => wczytaj.protokoly().then((m) => ({ default: m.ProtocolsTab })));
const SchemaTab = lazy(() => wczytaj.schemat().then((m) => ({ default: m.SchemaTab })));
const CostsTab = lazy(() => wczytaj.kosztorys().then((m) => ({ default: m.CostsTab })));
const PolitykaPrywatnosci = lazy(() => wczytaj.prywatnosc().then((m) => ({ default: m.PolitykaPrywatnosci })));
const Regulamin = lazy(() => wczytaj.regulamin().then((m) => ({ default: m.Regulamin })));

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
 * Kafel etapu w pasku przepływu: numer w kółku, tytuł, plakietka stanu i podtytuł
 * mówiący, co się na tym etapie dzieje. Podtytuł jest tu po to, żeby laik wiedział,
 * czego się spodziewać PRZED kliknięciem — „Rozdzielnica" samo w sobie nic mu
 * nie mówi.
 *
 * PLAKIETKA jest ŻYWA (patrz `lib/postepKrokow.ts`): pokazuje „czeka", „8 obw."
 * albo „38 el." zamiast dawnego, stałego „auto" na etapach 02-03. Powód: cztery
 * kafle wyglądały identycznie i wszystkie były klikalne, więc nowy użytkownik
 * obchodził je po kolei i trafiał w trzy puste ekrany — nic nie mówiło, że etapy
 * 02-04 są NASTĘPSTWEM tego, co powstanie na 01. Plakietka „auto" nie zniknęła
 * bez śladu: przejście „czeka" → „8 obw." pokazuje to samo, tylko na przykładzie,
 * a `opis` w tooltipie mówi to wprost („Wypełni się sama, gdy rozstawisz osprzęt").
 *
 * Kafel „czeka" jest nadal w pełni klikalny. Odbieranie nawigacji byłoby gorsze
 * niż problem, który naprawiamy — rozdzielnicę da się złożyć ręcznie, bez rzutu,
 * a czasem po prostu chce się zajrzeć. Kafel ma mówić prawdę, nie stawiać bramek.
 */
function FlowCard({
  step,
  title,
  subtitle,
  isActive,
  plakietka,
  stan,
  opis,
  tab,
  onPick,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  isActive: boolean;
  plakietka: string;
  stan: StanEtapu;
  /** Pełne zdanie: co na tym etapie jest albo czego mu brakuje — do `title`
   *  przycisku, czyli i do dymka, i do opisu dla czytnika ekranu. */
  opis: string;
  /** Zakładka tego etapu — stąd i przejście, i pobranie kodu z wyprzedzeniem.
   *  Wcześniej kafel dostawał samo `onClick`, więc nie wiedział, DOKĄD prowadzi. */
  tab: AppTab;
  onPick: (tab: AppTab) => void;
  children?: React.ReactNode;
}) {
  const gotowy = stan === "gotowy";
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
          przycisku został sam tytuł etapu („Rozdzielnica", nie „02 Rozdzielnica 8 obw.
          Dobór zabezpieczeń") — dla czytników ekranu i testów e2e. Stan nie ginie
          przez to dla czytnika: niesie go `title` przycisku, czyli jego OPIS. */}
      <button
        onClick={() => onPick(tab)}
        onPointerEnter={() => pobierzZawczasu(tab)}
        onFocus={() => pobierzZawczasu(tab)}
        title={opis}
        className="flex items-center gap-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className="pe-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold"
          style={isActive ? { background: "#9A5A27", color: "#fff" } : { background: "#EEF1F4", color: "#5B6A80" }}
        >
          {step}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold" style={{ color: isActive ? "#16202B" : "#475569" }}>
              {title}
            </span>
            {/* Kolor niesie stan szybciej niż napis: zielony = jest treść, szary =
                czeka. Ta sama zieleń co ukończony krok w przewodniku (`Kropki`
                w OnboardingChecklist), żeby „zrobione" wyglądało w całej aplikacji
                tak samo. `lowercase`, nie `uppercase` jak dawne „AUTO" — plakietka
                niesie teraz liczby („8 obw."), a wersaliki robiły z nich krzyk. */}
            <span
              aria-hidden="true"
              className="pe-mono shrink-0 rounded px-1 py-0.5 text-[8.5px] tracking-wide"
              style={
                gotowy
                  ? { background: "#3B8C6318", color: "#2C6B4A", fontWeight: 600 }
                  : { background: "#EEF1F4", color: "#5B6A80" }
              }
            >
              {plakietka}
            </span>
          </span>
          {/* Podtytuł znika poniżej 768 px. Tłumaczy, czego się spodziewać PRZED
              kliknięciem („Rozdzielnica" samo w sobie nic laikowi nie mówi), więc na
              monitorze zostaje — ale na telefonie dokłada każdemu z czterech kafli
              drugą linię, a cały pasek etapów rośnie przez to do 94 px z 812 px
              ekranu. Stan etapu niesie plakietka obok tytułu i ona zostaje wszędzie. */}
          <span aria-hidden="true" className="hidden text-[10.5px] leading-tight text-slate-400 md:block">
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
      style={isActive ? { color: "#8A5526", background: "#C1793F14", fontWeight: 600 } : { color: "#4F5D73" }}
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
/**
 * Schowana pigułka zjeżdża pod dolną krawędź i przestaje łapać kliknięcia, ale
 * zostaje w DOM i w kolejności Tab: fokus z klawiatury wyciąga ją z powrotem.
 */
function klasySchowanejPigulki(schowana: boolean): string {
  return schowana
    ? "pointer-events-none translate-y-24 opacity-0 focus-visible:pointer-events-auto focus-visible:translate-y-0 focus-visible:opacity-100"
    : "";
}

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
  // Pigułki „Cofnij/Dalej" chowają się przy czytaniu w dół — patrz hook.
  const pigulkiSchowane = useChowanieNaPrzewijaniu(tab);
  const setTab = (t: AppTab) => nawiguj(t);

  // Adres, którego nie dało się rozpoznać, pokazuje stronę startową — więc niech i
  // pasek adresu to przyzna, zamiast twierdzić, że jesteśmy pod „/literowka".
  // `replace`, bo to sprostowanie, a nie przejście: „wstecz" nie ma wracać na adres,
  // który natychmiast sprostuje się ponownie.
  useEffect(() => {
    if (!route.rozpoznana) nawiguj(ZAKLADKA_DOMYSLNA, null, { replace: true });
  }, [route.rozpoznana, nawiguj]);

  const session = useProjectStore((s) => s.session);

  /**
   * Lista projektów lokalnych trzymana w stanie komponentu, a nie czytana przy każdym
   * renderze.
   *
   * Źródłem jest `localStorage`, którego React nie obserwuje — więc odświeżamy ją
   * jawnie: przy otwarciu okna i po każdej operacji, która ją zmienia. Czytanie przy
   * renderze dawałoby nowe tablice bez końca i pętlę aktualizacji.
   */
  const otworzProjektLokalny = useProjectStore((s) => s.otworzProjektLokalny);
  const usunProjektLokalny = useProjectStore((s) => s.usunProjektLokalny);
  const [lokalne, setLokalne] = useState<WpisProjektu[]>([]);
  const [biezacyLokalny, setBiezacyLokalny] = useState<string | null>(null);
  const odswiezLokalne = useCallback(() => {
    setLokalne(useProjectStore.getState().projektyLokalne());
    setBiezacyLokalny(biezacyId(localStorage));
  }, []);
  const otworzListeProjektow = useCallback(() => {
    // Autozapis chodzi z opóźnieniem 600 ms, więc bez domknięcia go TERAZ lista
    // pokazywałaby stan sprzed ostatniej zmiany — np. świeżo przemianowany projekt
    // pod starą nazwą. Lista ma mówić, co naprawdę leży w pamięci przeglądarki.
    zapiszTerazLokalnie();
    odswiezLokalne();
    setProjectsOpen(true);
  }, [odswiezLokalne]);
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
   * Steruje widocznością przycisku „Dalej" NA INSTALACJI (patrz `nastepnyKrok` niżej).
   * Liczy KAŻDY narysowany obiekt, nie tylko elementy instalacji: kto postawił same
   * ściany, zaczął już projekt i nie ma powodu odbierać mu skrótu do kolejnego kroku.
   *
   * Dotyczy WYŁĄCZNIE tej jednej zakładki, bo tylko o nią chodziło: świecąca zachęta
   * do przejścia dalej, zanim cokolwiek powstało, wysyłała nowego użytkownika w trzy
   * puste ekrany zamiast do rysowania. Na dalszych krokach ten sam próg byłby FAŁSZYWY
   * — rozdzielnicę da się złożyć ręcznie, bez rzutu (patrz pigułka niżej).
   */
  const projektPusty = useProjectStore(
    (s) => s.draft.elements.length === 0 && s.draft.walls.length === 0 && s.draft.roomShapes.length === 0
  );
  /** Krok następujący po „Instalacji" — czyta się z kolejności przepływu, a nie
   *  wpisuje na sztywno, żeby przestawienie kroków nie zostawiło tu martwej nazwy. */
  const krokPoInstalacji = KOLEJNOSC_KROKOW[KOLEJNOSC_KROKOW.findIndex((k) => k.id === "projekt") + 1];
  const localSaveError = useProjectStore((s) => s.localSaveError);
  const lastLocalSaveAt = useProjectStore((s) => s.lastLocalSaveAt);
  const projectName = useProjectStore((s) => s.projectName);

  /**
   * Żywy stan czterech kafli etapów — patrz `lib/postepKrokow.ts`, gdzie mieszka
   * cała reguła (i jej testy).
   *
   * Elementy i obrysy bierzemy z CAŁEGO projektu, nie z bieżącej kondygnacji:
   * pasek etapów opisuje projekt, a rozdzielnica i kosztorys liczą się ze
   * wszystkich pięter naraz.
   */
  const elements = useProjectStore((s) => s.draft.elements);
  const roomShapes = useProjectStore((s) => s.draft.roomShapes);
  const wallCount = useProjectStore((s) => s.draft.walls.length);
  const panelTryb = useProjectStore((s) => s.panelTryb);
  const aparatyReczne = useProjectStore((s) => s.panelDevices.filter((d) => d.manual).length);
  const odplywy = useProjectStore((s) => s.panelDevices.filter((d) => jestOdplywem(d) || d.kind === "lampka").length);
  /** `useMemo` na `elements`/`roomShapes`, nie na ich długościach: obwody zmieniają
   *  się też przy samym PRZENIESIENIU elementu do innego pokoju, przy tej samej
   *  liczbie punktów. Przeliczenie jest tanie (grupowanie, bez doboru), ale nie ma
   *  powodu robić go przy każdym renderze powłoki. */
  const stanEtapow = useMemo<Etap[]>(() => {
    const obwody = elements.length > 0 ? computeCircuits(elements, roomShapes).length : null;
    return etapy({
      elementy: elements.length,
      // „Nazwane" jak w onboardingu: obrys bez nazwy nie niesie jeszcze informacji
      // o tym, czym pomieszczenie jest (patrz `OnboardingFacts` w lib/onboarding.ts).
      pomieszczenia: roomShapes.filter((r) => r.name.trim().length > 0).length,
      sciany: wallCount,
      obwody,
      trybReczny: panelTryb === "reczny",
      aparatyReczne,
      odplywy,
    });
  }, [elements, roomShapes, wallCount, panelTryb, aparatyReczne, odplywy]);
  const etap = (id: Etap["id"]) => stanEtapow.find((e) => e.id === id)!;

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

  /** Token z linku resetującego hasło; `null` = nie przyszliśmy z takiego linku. */
  const [resetToken, setResetToken] = useState<string | null>(null);
  /** Treść, którą okno logowania ma pokazać zaraz po otwarciu. */
  const [authKomunikat, setAuthKomunikat] = useState("");

  /**
   * Supabase odsyła z maila pod adres aplikacji, a wynik wkleja we fragment
   * adresu. Bez odczytania go użytkownik lądował na zwykłym ekranie startowym:
   * przy resecie hasła — z ważnym tokenem w pasku adresu i bez możliwości
   * dokończenia czegokolwiek, przy zużytym linku — bez słowa wyjaśnienia.
   *
   * Raz, przy starcie: fragment jest jednorazową informacją „po co tu jesteś",
   * a nie stanem, który trzeba śledzić.
   */
  useEffect(() => {
    const zLinku = odczytajFragmentAuth(window.location.hash);
    if (!zLinku) return;
    // Fragment zdejmujemy ZANIM pokażemy okno. Token uprawnia do zmiany hasła,
    // więc nie może zostać w pasku adresu, w historii przeglądarki ani na
    // zrzucie ekranu — a odświeżenie strony otwierałoby to okno w kółko.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (zLinku.rodzaj === "reset") {
      setResetToken(zLinku.token);
      return;
    }
    setAuthKomunikat(
      zLinku.kod === "otp_expired"
        ? "Link wygasł lub został już użyty. Poproś o nowy."
        : "Nie udało się dokończyć operacji z linku. Spróbuj jeszcze raz."
    );
    setAuthOpen(true);
  }, []);

  // Wygaszenie krawędzi obu przewijanych pasków na telefonie — patrz `useWygaszenieKrawedzi`.
  const pasekZakladek = useWygaszenieKrawedzi<HTMLDivElement>();
  const pasekEtapow = useWygaszenieKrawedzi<HTMLDivElement>();

  function signOut() {
    // `wyloguj`, a nie samo `setSession(null)`: unieważnia też sesję na serwerze.
    void useProjectStore.getState().wyloguj();
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
          // Nazwa dostępna MUSI zawierać cały widoczny tekst przycisku (nazwę i hasło) — kto
          // steruje głosem, mówi to, co widzi („kliknij pomocnikelektryka"), a nazwa bez
          // hasła tego nie rozpoznawała (WCAG 2.5.3).
          aria-label="pomocnikelektryka.pl Zaprojektuj instalację elektryczną w swoim domu! — wróć do projektowania instalacji"
          className="flex min-w-0 items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80"
        >
          <span className="flex min-w-0 items-center gap-3">
            <LogoIcon className="h-8 w-8 shrink-0 sm:h-11 sm:w-11" />
            <span className="min-w-0">
              {/* Napis wraca jako zwykły, widoczny <h1> — ten sam rozmiar co
                  poprzednie logo (text-[23px] font-bold), tylko obok ikony
                  zamiast bycia częścią jednego złożonego SVG z tekstem. */}
              <h1 className="font-sans text-[17px] sm:text-[23px] font-bold leading-tight tracking-tight text-ink">
                pomocnikelektryka<span className="text-copper">.pl</span>
              </h1>
              {/* Spacja między nazwą a hasłem: oba są elementami blokowymi, więc jej NIE widać,
                  ale bez niej tekst przycisku sklejał się w „…plZaprojektuj…" i nazwa dostępna
                  (ze spacją) go nie zawierała. */}
              {" "}
              {/* Hasło zostaje mimo makiety: aplikacja jest adresowana do laików i to
                  jedyne zdanie, które od razu mówi, co ona właściwie robi. Stoi pod
                  napisem, w tej samej kolumnie co on (czyli na prawo od domku), nie
                  pod całym logo.
                  PONIŻEJ 640 px go jednak nie ma — i tylko tam. Zawijało się na dwie
                  linie, przez co sam nagłówek brał 210 px z 812 px ekranu telefonu,
                  spychając rysunek pod krawędź. To samo zdanie pada teraz na ekranie
                  startowym, w nagłówku karty powitalnej i w większym rozmiarze
                  (patrz `showEntryScreen` w DesignTab.tsx), więc na wejściu nic nie
                  ginie — a na telefonie odzyskujemy wysokość tam, gdzie jej brakuje. */}
              <span className="hidden max-w-xl sm:block max-w-xl text-[12.5px] leading-snug text-slate-500">
                Zaprojektuj instalację elektryczną w swoim domu!
              </span>
            </span>
          </span>
        </button>

        {/* JEDEN RZĄD na telefonie, zawijanie od 640 px w górę.
            Przy 375 px ta grupa zawijała się na TRZY rzędy (Kalkulatory + Protokoły,
            Dokumentacja + Pomoc, Nowy projekt + Zaloguj się) i sama brała 122 px —
            więcej niż logo, nazwa projektu i pasek etapów razem. Teraz przewija się
            poziomo, tak samo jak pasek etapów niżej: że jest czym przewijać, widać po
            wygaszonej krawędzi (`useWygaszenieKrawedzi`). Etykiety zostają PEŁNE — skracanie ich
            zmieniłoby nazwy dostępnościowe, a na nich stoi kilkanaście testów e2e. */}
        {/* Od 640 px w górę obie grupy dostają `display: contents` i podział ZNIKA:
            przyciski wracają do zawijania pojedynczo, dokładnie jak przed rozdzieleniem.
            Bez tego grupa konta nie mogła dzielić rzędu z zawiniętymi zakładkami
            i nagłówek rósł na tablecie ze 150 do 184 px — zmierzone przy 640 px. */}
        <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:flex-wrap sm:[&>*]:shrink-0">
          {/* Grupa PRZEWIJANA. Konto zostało z niej WYJĘTE (niżej): przy 375 px kończyło
              się 623 px za prawą krawędzią, a suwak jest celowo ukryty, więc nic nie
              zdradzało, że tam cokolwiek jest. Aplikacja namawia do założenia konta,
              żeby nie stracić pracy — a samego przycisku nie dało się znaleźć.

              Etykiety zostają PEŁNE: skracanie ich na telefonie zmieniłoby nazwy
              dostępnościowe, na których stoi kilkanaście testów e2e i czytniki ekranu. */}
          <div
            ref={pasekZakladek.ref}
            style={pasekZakladek.styl}
            data-testid="pasek-zakladek"
            className="pe-bez-suwaka flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto [&>*]:shrink-0 sm:contents"
          >
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
          </div>

          {/* Grupa PRZYPIĘTA: poza przewijaniem, więc widoczna przy każdej szerokości.
              `shrink-0`, bo to ona ma zabrać miejsce paskowi zakładek, a nie odwrotnie. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:contents">
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
        </div>
      </header>

      {/* Pasek projektu: nazwa po lewej, etapy przepływu po prawej. `<section>` z nazwą,
          bo to landmark: bez niego nazwa projektu i kafle etapów zostawały jedynym
          fragmentem strony poza wszystkimi landmarkami. */}
      <section aria-label="Projekt i etapy pracy" className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Folder size={15} className="text-slate-400" aria-hidden="true" />
          <span className="text-sm text-slate-400">Projekt:</span>
          <ProjectNameField />
          {/* Operacje plikowe stoją przy NAZWIE projektu, bo dotyczą projektu jako
              całości — nie zakładki, na której akurat jesteśmy. Poza tym nagłówek jest
              już ciasny (patrz komentarz o 375 px wyżej), a ten rząd ma miejsce. */}
          <KopiaZapasowa onOtworzListe={otworzListeProjektow} />
        </div>
        {/* Bez widocznego suwaka: to pasek nawigacji, a nie okno z treścią. Że da
            się przewinąć, widać po wygaszonej krawędzi (`useWygaszenieKrawedzi`) — tak samo
            jak w paskach kart przeglądarki. */}
        {/* `min-w-0` NIE jest tu ozdobą. Element elastyczny ma domyślnie
            `min-width: auto`, więc nie kurczy się poniżej szerokości swojej treści —
            i `overflow-x-auto` nigdy się nie włączało: zamiast przewijać kafle
            wewnątrz, pasek rozpychał całą stronę. Na oknie 375 px dawało to dokument
            o szerokości 655 px, czyli poziome przewijanie CAŁEJ aplikacji. */}
        <div
          ref={pasekEtapow.ref}
          style={pasekEtapow.styl}
          data-testid="pasek-etapow"
          className="pe-bez-suwaka -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5"
        >
          <FlowCard
            step="01"
            title="Instalacja"
            subtitle="Projekt instalacji"
            isActive={tab === "projekt"}
            plakietka={etap("projekt").plakietka}
            stan={etap("projekt").stan}
            opis={etap("projekt").opis}
            tab="projekt"
            onPick={setTab}
          />
          <FlowArrow />
          {/* Rozdzielnica i Schemat to dwa OSOBNE etapy, choć oba powstają automatycznie
              z planu. Podtytuł etapu 02 mówi już tylko o doborze: schemat ma własny
              kafel i obiecywanie go tutaj wprowadzałoby w błąd co do tego, gdzie go
              szukać. Stała plakietka „auto" stała dotąd na obu — zastąpiła ją żywa
              (patrz `FlowCard` wyżej): „czeka" → „8 obw." pokazuje tę samą
              automatyczność, tylko na przykładzie zamiast w deklaracji. */}
          <FlowCard
            step="02"
            title="Rozdzielnica"
            subtitle="Dobór zabezpieczeń"
            isActive={tab === "rozdzielnica"}
            plakietka={etap("rozdzielnica").plakietka}
            stan={etap("rozdzielnica").stan}
            opis={etap("rozdzielnica").opis}
            tab="rozdzielnica"
            onPick={setTab}
          />
          <FlowArrow />
          <FlowCard
            step="03"
            title="Schemat"
            subtitle="Schemat jednokreskowy"
            isActive={tab === "schemat"}
            plakietka={etap("schemat").plakietka}
            stan={etap("schemat").stan}
            opis={etap("schemat").opis}
            tab="schemat"
            onPick={setTab}
          />
          <FlowArrow />
          <FlowCard
            step="04"
            title="Kosztorys"
            subtitle="Zestawienie kosztów"
            isActive={tab === "kosztorys"}
            plakietka={etap("kosztorys").plakietka}
            stan={etap("kosztorys").stan}
            opis={etap("kosztorys").opis}
            tab="kosztorys"
            onPick={setTab}
          />
        </div>
      </section>

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
      {/* `<main>`, nie `<div>`: bez landmarka czytnik ekranu nie ma jak przeskoczyć od
          nagłówka do treści, a audyt dostępności zgłaszał ponad 600 węzłów „poza
          landmarkami". Układ bez zmian — te same klasy. */}
      <main className="flex flex-1 flex-col">
      {/* Pasek przykładu stoi PONAD granicą błędu i poza nią: dotyczy projektu, a nie
          jednej zakładki, i ma przeżyć awarię dowolnej z nich, bo to stąd prowadzi
          wyjście do własnego projektu.
          Pokazuje się jednak WYŁĄCZNIE na czterech krokach przepływu. Kalkulatory
          i Protokoły są z założenia NIEZALEŻNE od projektu (patrz „Decyzje produktowe"
          w MIGRATION.md), więc pasek nie miałby tam czego opisywać — a jego zdanie
          o tym, że nic się nie zapisuje na koncie, byłoby tam wprost NIEPRAWDZIWE:
          „Zapisz zestaw" w Protokołach zapisuje do chmury normalnie, bo protokoły nie
          idą przez autozapis projektu (to jego blokuje `projektPrzykladowy`). */}
      {KOLEJNOSC_KROKOW.some((k) => k.id === tab) && <PasekPrzykladu />}
      {/* Nad KAŻDĄ zakładką — patrz komentarz w komponencie. */}
      <PasekUszkodzonegoZapisu />
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

      {/* Strona towarzysząca, nie krok przepływu — stąd brak kafla, paska przykładu
          i pigułek nawigacji (patrz komentarz przy `AppTab` w lib/routing.ts). */}
      {tab === "prywatnosc" && (
        <Suspense fallback={<TabLoading />}>
          <PolitykaPrywatnosci />
        </Suspense>
      )}

      {tab === "regulamin" && (
        <Suspense fallback={<TabLoading />}>
          <Regulamin />
        </Suspense>
      )}

      {tab === "projekt" && (
        <>
          <Suspense fallback={<TabLoading />}>
            {/* Przejście do kolejnego kroku wędruje TUTAJ, zamiast pływać pigułką
                w rogu okna — na tej jednej zakładce, bo na tej jednej pigułka leżała
                na powierzchni roboczej (patrz `NAWIGACJA_ODSTEP_PX` w lib/design.ts
                i `nastepnyKrok` w EditorStatusBar). `undefined` na pustym projekcie:
                ten sam próg co przy pigułce na pozostałych zakładkach, liczony w tym
                samym miejscu, żeby obie drogi nie mogły się rozjechać. */}
            <DesignTab
              onOpenAuth={() => setAuthOpen(true)}
              onOpenPomoc={() => setHelpOpen(true)}
              nastepnyKrok={
                projektPusty || !krokPoInstalacji
                  ? undefined
                  : {
                      tytul: krokPoInstalacji.tytul,
                      przejdz: () => setTab(krokPoInstalacji.id),
                      pobierz: () => pobierzZawczasu(krokPoInstalacji.id),
                    }
              }
            />
          </Suspense>
        </>
      )}
      </ErrorBoundary>
      </main>

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
            // Odstęp od dolnej krawędzi ze wspólnej stałej, nie z klasy `bottom-5` —
            // patrz `NAWIGACJA_ODSTEP_PX`, gdzie stoi też historia pigułki na płótnie.
            style={{ bottom: NAWIGACJA_ODSTEP_PX }}
            data-schowana={pigulkiSchowane || undefined}
            className={`fixed left-5 z-30 hidden items-center gap-1.5 rounded-full bg-copper px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-[transform,opacity] duration-200 hover:scale-105 hover:bg-copper/90 md:flex ${klasySchowanejPigulki(pigulkiSchowane)}`}
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
        // Na Instalacji tego przycisku tu NIE MA — przenosi się do paska stanu pod
        // rysunkiem, bo pływając w rogu okna leżał na płótnie i zjadał tam kliknięcia
        // (patrz `nastepnyKrok` przekazywane do `DesignTab` wyżej). Tam też, i TYLKO
        // tam, działa próg pustego projektu.
        //
        // Świadomie NIE gasimy pigułki na dalszych krokach pustym rzutem, choć
        // pierwsza wersja tak robiła. Rozdzielnicę da się złożyć RĘCZNIE, bez
        // rysowania czegokolwiek („Zbuduj rozdzielnicę bez rzutu" — aparaty żyją
        // w `panelDevices`, nie w `draft`), a schemat powstaje właśnie z niej. Próg
        // liczony z zawartości rzutu zabierałby wtedy „Dalej: Schemat" komuś, kto ma
        // pełną rozdzielnicę — czyli gasiłby skrót dokładnie tam, gdzie jest dokąd iść.
        // Na dalszych krokach użytkownik i tak już świadomie tam wszedł.
        if (tab === "projekt") return null;
        return (
          <button
            onClick={() => setTab(nastepny.id)}
            onPointerEnter={() => pobierzZawczasu(nastepny.id)}
            onFocus={() => pobierzZawczasu(nastepny.id)}
            // Patrz komentarz przy „Cofnij" wyżej — ten sam powód, ten sam próg,
            // ten sam odstęp ze wspólnej stałej.
            style={{ bottom: NAWIGACJA_ODSTEP_PX }}
            data-schowana={pigulkiSchowane || undefined}
            className={`fixed right-5 z-30 hidden items-center gap-1.5 rounded-full bg-copper px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-[transform,opacity] duration-200 hover:scale-105 hover:bg-copper/90 md:flex ${klasySchowanejPigulki(pigulkiSchowane)}`}
          >
            Dalej: {nastepny.tytul}
            <ArrowRight size={15} />
          </button>
        );
      })()}

      {resetToken && (
        <NoweHasloDialog
          open
          token={resetToken}
          onClose={() => setResetToken(null)}
          onZmienione={() => {
            setResetToken(null);
            // Sesji NIE zapisujemy: świeże hasło ma od razu przejść próbę ognia,
            // a na wspólnym komputerze nie zostaje otwarte konto.
            setAuthKomunikat("Hasło zmienione. Zaloguj się nowym hasłem.");
            setAuthOpen(true);
          }}
        />
      )}

      <AuthModal
        open={authOpen}
        komunikat={authKomunikat}
        onClose={() => {
          setAuthOpen(false);
          setAuthKomunikat("");
        }}
        onSignedIn={(s) => {
          setSession(s);
          setAuthOpen(false);
          setAuthKomunikat("");
        }}
      />

      {/* Okno projektów NIE wymaga już konta: lista lokalna jest jego połową i to ta
          połowa dotyczy każdego. Bez sesji sekcja chmury zamienia się w jedno zdanie
          o tym, co daje konto. */}
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
        projektyLokalne={lokalne}
        biezacyLokalny={biezacyLokalny}
        onOtworzLokalny={(id) => {
          otworzProjektLokalny(id);
          setProjectsOpen(false);
        }}
        onUsunLokalny={(id) => {
          usunProjektLokalny(id);
          odswiezLokalne();
        }}
      />

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

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onOtworzPrywatnosc={() => setTab("prywatnosc")}
      />

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
        opcje={<UdostepnijLinkiem bajty={kompletBajty} />}
      />

      {/* Zapas pod pigułki TYLKO tam, gdzie one są: na ekranie startowym i w zakładkach
          spoza przepływu (Kalkulatory, Protokoły) nie ma ani „Cofnij", ani „Dalej",
          a pusty pas pod stopką to dokładnie ten pas gołego tła, który już raz
          z tego ekranu usuwano. Ten sam warunek co przy samych pigułkach wyżej. */}
      <SiteFooter
        rezerwaNaNawigacje={KOLEJNOSC_KROKOW.findIndex((k) => k.id === tab) > 0}
        onOtworzDokument={setTab}
      />
    </div>
  );
}

/** Odnośnik do dokumentu formalnego w stopce. Wydzielony, bo są dwa i mają
 *  zachowywać się identycznie — patrz komentarz w miejscu użycia. */
function LinkDokumentu({
  tab,
  onOtworz,
  children,
}: {
  tab: "prywatnosc" | "regulamin";
  onOtworz: (tab: "prywatnosc" | "regulamin") => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`/${tab}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOtworz(tab);
      }}
      // Na dotyku cel ma 32 px wysokości zamiast 16: link w stopce to osobny wiersz, nie
      // fragment zdania, więc WCAG 2.5.8 (min. 24 px) go nie zwalnia.
      className="text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-ink [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-8 [@media(pointer:coarse)]:items-center"
    >
      {children}
    </a>
  );
}

/**
 * Stopka. Poza domknięciem strony niesie zastrzeżenie, którego w aplikacji do
 * projektowania instalacji brakować nie powinno: dobór zabezpieczeń, przekrojów i
 * kosztorys są ORIENTACYJNE i nie zastępują projektu ani odbioru przez osobę z
 * uprawnieniami. Aplikacja jest adresowana głównie do laików (krok 20), więc to
 * zastrzeżenie musi być widoczne, a nie schowane w „warunkach użytkowania".
 */
function SiteFooter({
  rezerwaNaNawigacje,
  onOtworzDokument,
}: {
  rezerwaNaNawigacje: boolean;
  onOtworzDokument: (tab: "prywatnosc" | "regulamin") => void;
}) {
  /*
   * `md:pb-16` to ZAPAS pod pływające pigułki „Cofnij/Dalej".
   *
   * Są `position: fixed` w rogach OKNA, więc po przewinięciu na sam dół leżały na
   * stopce — akurat na zdaniu o tym, że wyniki nie zastępują odbioru przez osobę
   * z uprawnieniami SEP/budowlanymi. 64 px to wysokość pigułki (36) plus jej odstęp
   * od krawędzi (`NAWIGACJA_ODSTEP_PX` = 20) plus luz.
   *
   * Świadomie ZAMIAST chowania pigułek przy dojechaniu do stopki: gaszenie skrótu
   * „Dalej" dokładnie wtedy, gdy ktoś doczytał stronę do końca i chce przejść dalej,
   * zabierałoby go w jedynym momencie, w którym jest naprawdę potrzebny.
   *
   * Dopiero od `md`, bo poniżej pigułek w ogóle nie ma (patrz ich `hidden md:flex`)
   * i pusty pas byłby marnotrawstwem na najciaśniejszym ekranie.
   */
  return (
    <footer
      className={`mt-10 border-t border-border pt-5 text-xs text-slate-500 ${rezerwaNaNawigacje ? "md:pb-16" : ""}`}
    >
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
          <div className="mt-1.5 flex items-center gap-2">
            <LinkDokumentu tab="prywatnosc" onOtworz={onOtworzDokument}>
              Prywatność i dane
            </LinkDokumentu>
            <span aria-hidden="true">·</span>
            <LinkDokumentu tab="regulamin" onOtworz={onOtworzDokument}>
              Regulamin
            </LinkDokumentu>
          </div>
          {/* Wersja wdrożenia. Przy zgłoszeniu „u mnie nie działa" nie było czym
              ustalić, co ktoś ma właściwie załadowane: aplikacja jest jednostronicowa,
              więc adres tego nie mówi, a przeglądarka potrafi trzymać starą wersję. */}
          <div className="pe-mono mt-1 text-[10px] text-slate-400" title="Wersja wdrożenia — podaj ją przy zgłaszaniu problemu">
            wersja {WERSJA_BUILDU}
          </div>
        </div>
      </div>
    </footer>
  );
}
