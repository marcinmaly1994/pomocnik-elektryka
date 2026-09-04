import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FilePlus2,
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
import { CalculatorsTab } from "@/components/calculators/CalculatorsTab";
import { ProtocolsTab } from "@/components/protocols/ProtocolsTab";
import { SchemaTab } from "@/components/schema/SchemaTab";
import { CostsTab } from "@/components/costs/CostsTab";
import { AuthModal } from "@/components/auth/AuthModal";
import { ProjectsModal } from "@/components/auth/ProjectsModal";
import { AccountModal, type AccountModalTab } from "@/components/auth/AccountModal";
import { HelpModal } from "@/components/help/HelpModal";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";

// Konva/react-konva to największy pojedynczy zależnik w bundlu — DesignTab i
// PanelTab (jedyne dwa moduły, które go importują) ładowane leniwie, żeby
// pierwsze wejście na Kalkulatory/Protokoły/Schemat/Kosztorys go nie ciągnęło.
const DesignTab = lazy(() => import("@/components/design/DesignTab").then((m) => ({ default: m.DesignTab })));
const PanelTab = lazy(() => import("@/components/panel/PanelTab").then((m) => ({ default: m.PanelTab })));

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
  onClick,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  isActive: boolean;
  badge?: string;
  onClick: () => void;
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
      <button onClick={onClick} className="flex items-center gap-2.5 text-left">
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
  const setLimitBlokada = useProjectStore((s) => s.setLimitBlokada);
  const saveToCloud = useProjectStore((s) => s.saveToCloud);
  const loadFromCloud = useProjectStore((s) => s.loadFromCloud);
  const resetProject = useProjectStore((s) => s.resetProject);
  const elementCount = useProjectStore((s) => s.draft.elements.length);

  const [authOpen, setAuthOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  /** `null` = zamknięty; w przeciwnym razie mówi, KTÓRA zakładka ma być aktywna
   *  po otwarciu — z menu konta da się wejść wprost w „Ustawienia", bez
   *  przechodzenia najpierw przez „Profil". */
  const [accountModalTab, setAccountModalTab] = useState<AccountModalTab | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

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
    <div className="min-h-screen p-6">
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
          {!session && (
            <button
              type="button"
              onClick={SUPABASE_CONFIGURED ? () => setAuthOpen(true) : undefined}
              disabled={!SUPABASE_CONFIGURED}
              className="pe-chip hidden items-center gap-1 text-slate-400 transition-colors enabled:hover:border-copper enabled:hover:text-copper lg:flex disabled:cursor-default"
              title={SUPABASE_CONFIGURED ? "Zaloguj się, aby synchronizować projekt z chmurą" : "Uzupełnij VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w .env"}
            >
              <Save size={13} /> Zapisano lokalnie
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
        <div className="pe-bez-suwaka -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
          <FlowCard
            step="01"
            title="Instalacja"
            subtitle="Projekt instalacji"
            isActive={tab === "projekt"}
            onClick={() => setTab("projekt")}
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
            onClick={() => setTab("rozdzielnica")}
          />
          <FlowArrow />
          <FlowCard
            step="03"
            title="Schemat"
            subtitle="Schemat jednokreskowy"
            badge="auto"
            isActive={tab === "schemat"}
            onClick={() => setTab("schemat")}
          />
          <FlowArrow />
          <FlowCard
            step="04"
            title="Kosztorys"
            subtitle="Zestawienie kosztów"
            isActive={tab === "kosztorys"}
            onClick={() => setTab("kosztorys")}
          />
        </div>
      </div>

      {/* Nawigacja celowo NIE zawija przepływu (`flex-wrap`, jak było wcześniej): przy
          wąskim oknie strzałka lądowała na końcu wiersza bez celu, a „3 Kosztorys"
          wskakiwał wizualnie do przerywanej ramki kroku 2 — czyli kolejność 1→2→3, cały
          sens tego paska, przestawała być czytelna. Teraz przepływ jest jednym rzędem,
          który w razie braku miejsca przewija się poziomo, a narzędzia schodzą do
          własnego wiersza pod spodem. */}
      {tab === "kalkulatory" && <CalculatorsTab />}

      {tab === "rozdzielnica" && (
        <Suspense fallback={<TabLoading />}>
          <PanelTab />
        </Suspense>
      )}

      {tab === "protokoly" && <ProtocolsTab />}

      {tab === "schemat" && <SchemaTab />}

      {tab === "kosztorys" && <CostsTab />}

      {tab === "projekt" && (
        <>
          <Suspense fallback={<TabLoading />}>
            <DesignTab onOpenAuth={() => setAuthOpen(true)} />
          </Suspense>
        </>
      )}

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
            // Ukryty poniżej `md`: to `position: fixed` w rogu OKNA, obojętne na
            // przewijanie i długość treści pod spodem — na wąskich/niskich oknach
            // (kolumna narzędzi + panel Instalacji już same potrzebują sporo
            // szerokości) potrafił więc wylądować DOKŁADNIE na polu wyszukiwania
            // elementów albo zakładkach panelu, zasłaniając je. Kafle „01/02/03/04”
            // u góry dają dokładnie tę samą nawigację, więc chowamy tu tylko wygodny
            // skrót, nie funkcję.
            className="fixed bottom-5 left-5 z-30 hidden items-center gap-1.5 rounded-full bg-copper px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-copper/90 md:flex"
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
        return (
          <button
            onClick={() => setTab(nastepny.id)}
            // Patrz komentarz przy „Cofnij" wyżej — ten sam powód, ten sam próg.
            className="fixed bottom-5 right-5 z-30 hidden items-center gap-1.5 rounded-full bg-copper px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-copper/90 md:flex"
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

      {session && accountModalTab && (
        <AccountModal
          open
          initialTab={accountModalTab}
          session={session}
          onClose={() => setAccountModalTab(null)}
        />
      )}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

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
        </div>
      </div>
    </footer>
  );
}
