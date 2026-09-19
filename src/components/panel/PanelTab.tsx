import { useEffect, useMemo, useState } from "react";
import { formatLiczba, zPrzecinkiem } from "@/lib/liczby";
import { Podpowiedz } from "@/components/ui/tooltip";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Eye, FileText, Info, Pencil, Plus, Redo2, RotateCcw, Scissors, Trash2, Undo2 } from "lucide-react";
import { useOpcjeDoboru, useProjectStore } from "@/store/useProjectStore";
import { computeRcdGroups, ostrzezeniaObwodow } from "@/lib/panel/circuits";
import { OPIS_ULOZENIA, ZAPAS_MONTAZOWY_M, type LayingMethod } from "@/lib/panel/norms";
import { ELEMENT_TYPES, NO_ROOM } from "@/lib/elements";
import {
  balancePhases,
  buildPanelDevices,
  computeSelectivity,
  layoutPanel,
  MANUAL_DEVICE_TYPES,
  PHASE_COLORS,
  przeniesAparat,
  type SelectivityLevel,
} from "@/lib/panel/devices";
import { assignPhases, computeSizedCircuits, dlugosciDoboru, phaseBalance } from "@/lib/panel/project";
import { scaleOf } from "@/lib/design";
import { buildPanelLegendDoc, buildPanelLegendPdf } from "@/lib/pdf/panelLegend";
import { buildLabelStripsDoc, buildLabelStripsPdf } from "@/lib/pdf/labelStrips";
import { buildCalcSheetDoc, buildCalcSheetPdf } from "@/lib/pdf/obliczenia";
import { zarejestrujProducenta } from "@/lib/pdf/rejestr";
import { projectFileName } from "@/lib/pdf/download";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { resolveDocHeader } from "@/lib/docHeader";
import { Button } from "@/components/ui/button";
import { PanelRender } from "./PanelRender";
import { EditDeviceModal } from "./EditDeviceModal";
import type { PanelDevice } from "@/types";

const SELECTIVITY_STYLE: Record<SelectivityLevel, { bg: string; fg: string; Icon: typeof AlertTriangle }> = {
  error: { bg: "#C6433A14", fg: "#A2352C", Icon: AlertTriangle },
  warn: { bg: "#C1793F14", fg: "#8A5526", Icon: AlertTriangle },
  ok: { bg: "#3B8C631A", fg: "#2C6B4A", Icon: Check },
  info: { bg: "#2D5A8C12", fg: "#2D5A8C", Icon: Info },
};

const PER_ROW_OPTIONS = [8, 12, 18, 24];
const MAIN_RATING_OPTIONS = [25, 32, 40, 63, 80];

/** Kolejny wolny `uid` dla ręcznie dodawanego aparatu, wyliczony z AKTUALNEJ listy —
 *  nie z licznika modułowego. Licznik przeżywał tylko do przeładowania strony: aparaty
 *  są trwałe (w store/projekcie), więc po odświeżeniu i dodaniu kolejnego aparatu
 *  liczenie od zera nadawało `manual-1` po raz drugi — dwa aparaty z tym samym `uid`
 *  psuły edycję/usuwanie/przenoszenie (React nie odróżniał ich po kluczu). */
function nextManualUid(existing: PanelDevice[]): string {
  const numery = existing
    .map((d) => /^manual-(\d+)$/.exec(d.uid)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return `manual-${(numery.length ? Math.max(...numery) : 0) + 1}`;
}

/**
 * Rozdzielnica elektryczna: rzut czołowy budowany automatycznie z obwodów
 * (wyznaczonych heurystyką z elementów na planie, w src/lib/panel/circuits.ts)
 * + ręcznie dodawane aparaty.
 *
 * Kolejność zmienia się DWIEMA drogami, obiema równorzędnymi: przeciągnięciem
 * aparatu po płótnie (patrz `onMove` niżej i obsługa wskaźnika w `PanelRender`)
 * albo przyciskami ↑/↓ na liście. Przeciąganie jest szybsze przy dużej
 * rozdzielnicy, przyciski działają tam, gdzie przeciąganie jest niewygodne —
 * na dotyku i przy obsłudze klawiaturą.
 */
export function PanelTab() {
  const elements = useProjectStore((s) => s.draft.elements); // cały budynek, nie tylko bieżąca kondygnacja
  const roomShapes = useProjectStore((s) => s.draft.roomShapes);
  // Geometria CALEGO budynku — z niej dobor liczy bieg poziomy trasy, czyli te sama
  // droge, ktora widac na rzucie. Bez niej zostawal szacunek Manhattan, KROTSZY od
  // trasy rzeczywistej, wiec zanizajacy spadek napiecia (patrz `estimateRoutes`).
  const walls = useProjectStore((s) => s.draft.walls);
  const openings = useProjectStore((s) => s.draft.openings);
  const geometria = useMemo(() => ({ walls, roomShapes, openings }), [walls, roomShapes, openings]);

  // Element bez rozpoznanego pomieszczenia grupuje się do ogólnego kubła zamiast
  // do właściwego obwodu, a łącznik nie połączy się z lampą w grupę sterowania
  // (patrz lib/lightGroups.ts) — bez tego licznika użytkownik nie ma jak się o tym
  // dowiedzieć, bo nic na planie tego nie sygnalizuje. Infrastruktura (rozdzielnica,
  // puszka) i wyposażenie sanitarne (wanna/prysznic/umywalka — nie generują obwodu,
  // służą tylko do stref ochronnych) świadomie pominięte: brak pomieszczenia jest
  // dla nich normalny, nie błędem do naprawienia.
  const unassignedCount = useMemo(
    () =>
      elements.filter((e) => e.room === NO_ROOM && !["infra", "sanitary"].includes(ELEMENT_TYPES[e.type]?.role ?? "")).length,
    [elements]
  );
  const rawDocHeader = useProjectStore((s) => s.docHeader);
  const projectName = useProjectStore((s) => s.projectName);
  // Nazwa projektu jako domyślny „Obiekt" — patrz resolveDocHeader; dzięki temu legenda
  // PDF ma wypełniony nagłówek i nazwę pliku nawet bez wizyty w zakładce Protokoły.
  const docHeader = resolveDocHeader(rawDocHeader, projectName);

  // Zasilanie/rozłącznik główny mieszkają w store (nie w lokalnym stanie), bo ten sam
  // `buildPanelDevices` na tych samych parametrach zasila też zakładkę Schemat —
  // inaczej zmiana zasilania tutaj nie byłaby widoczna na schemacie jednokreskowym.
  const panelConfig = useProjectStore((s) => s.panelConfig);
  const setPanelConfig = useProjectStore((s) => s.setPanelConfig);
  const { supply3f, mainRating, perRow } = panelConfig;
  // Warunki doboru mieszkają w PROJEKCIE z tego samego powodu co zasilanie: to
  // założenia o instalacji, nie preferencja widoku, i decydują o doborze przewodu
  // w każdej zakładce, która go pokazuje.
  const warunki = useProjectStore((s) => s.warunkiDoboru);
  const setWarunki = useProjectStore((s) => s.setWarunkiDoboru);
  // Aparaty, ukryte pozycje i tryb mieszkają w PROJEKCIE, nie w stanie komponentu.
  // Wcześniej ręcznie dołożone aparaty i skasowane pozycje przepadały przy odświeżeniu
  // i nie trafiały do zapisu — a bez trwałości nie da się złożyć rozdzielnicy bez rzutu.
  const devices = useProjectStore((s) => s.panelDevices);
  const setDevicesRaw = useProjectStore((s) => s.setPanelDevices);
  const hiddenKeys = useProjectStore((s) => s.panelHidden);
  const setHiddenKeysRaw = useProjectStore((s) => s.setPanelHidden);
  const panelTryb = useProjectStore((s) => s.panelTryb);
  const setPanelTryb = useProjectStore((s) => s.setPanelTryb);
  const trybReczny = panelTryb === "reczny";

  // Nakładki w stylu `useState`, żeby reszta komponentu nie musiała wiedzieć,
  // że stan przeniósł się do store'a.
  const setDevices = (f: PanelDevice[] | ((prev: PanelDevice[]) => PanelDevice[])) =>
    setDevicesRaw(typeof f === "function" ? f(useProjectStore.getState().panelDevices) : f);
  const setHiddenKeys = (f: string[] | ((prev: string[]) => string[])) =>
    setHiddenKeysRaw(typeof f === "function" ? f(useProjectStore.getState().panelHidden) : f);
  const [addForm, setAddForm] = useState({ kind: "mcb", label: "B16", caption: "" });
  const [podgladLegendy, setPodgladLegendy] = useState(false);
  const [edytowany, setEdytowany] = useState<string | null>(null);
  const [podgladPaskow, setPodgladPaskow] = useState(false);
  const [podgladObliczen, setPodgladObliczen] = useState(false);
  const panelOverrides = useProjectStore((s) => s.panelOverrides);
  const setPanelOverrides = useProjectStore((s) => s.setPanelOverrides);
  // Osobna, mniejsza historia cofnij/ponów TYLKO dla ręcznych zmian w rozdzielnicy —
  // patrz obszerny komentarz przy `panelPast`/`panelFuture` w store. Jedyną drogą do
  // cofnięcia było wcześniej „Odbuduj z rzutu”, które kasuje WSZYSTKO i liczy od
  // zera — nieprzydatne, kiedy chce się cofnąć jedno kasowanie aparatu.
  const commitPanelSnapshot = useProjectStore((s) => s.commitPanelSnapshot);
  const panelUndo = useProjectStore((s) => s.panelUndo);
  const panelRedo = useProjectStore((s) => s.panelRedo);
  const panelCanUndo = useProjectStore((s) => s.panelPast.length > 0);
  const panelCanRedo = useProjectStore((s) => s.panelFuture.length > 0);

  // Dobór normatywny: przekrój, zabezpieczenie, ΔU i Zs liczone z tablic PN-HD 60364
  // (src/lib/panel/sizing.ts) zamiast stałych wpisanych przy generowaniu obwodów.
  // Skale WSZYSTKICH kondygnacji, nie tylko bieżącej: obwody obejmują cały budynek
  // (patrz `elements` wyżej), a skala jest właściwością kondygnacji — patrz
  // `estimateRoutesByFloor`. Bez kalibracji dobór jawnie zgłasza, że spadku napięcia
  // nie sprawdzono, zamiast liczyć go z długości „na oko".
  const floors = useProjectStore((s) => s.floors);
  const scales = useProjectStore((s) => s.scales);
  /** Kondygnacje, na których stoi osprzęt, ale brakuje skali — to one blokują
   *  sprawdzenie spadku napięcia, i to je trzeba nazwać po imieniu. */
  const bezSkali = useMemo(
    () =>
      [...new Set(elements.map((e) => e.floor))]
        .filter((id) => scaleOf(scales, id) === null)
        .map((id) => floors.find((f) => f.id === id)?.name ?? id),
    [elements, scales, floors]
  );
  const opcjeDoboru = useOpcjeDoboru();
  const { circuits, sized: sizedRaw } = useMemo(
    () => computeSizedCircuits(elements, opcjeDoboru, roomShapes),
    [elements, opcjeDoboru, roomShapes]
  );
  const rcdGroups = useMemo(() => computeRcdGroups(circuits), [circuits]);
  const sized = useMemo(() => assignPhases(sizedRaw, supply3f), [sizedRaw, supply3f]);
  const balance = useMemo(() => phaseBalance(sized), [sized]);
  const sizingWarnings = useMemo(
    () => sized.flatMap((s) => s.ostrzezenia.map((w) => ({ ...w, obwod: s.nazwa }))),
    [sized]
  );
  /**
   * Zastrzeżenia do obwodów złożonych RĘCZNIE (numer nadany na rzucie).
   *
   * Osobno od `sizingWarnings`, bo mówią co innego: tamte — że dobór nie wychodzi,
   * te — że ręcznie złożony obwód odbiega od praktyki projektowej. Stoją jednak
   * w tym samym miejscu, bo dla czytającego to jedna lista „na co uważać".
   */
  const ostrzezeniaReczne = useMemo(() => ostrzezeniaObwodow(elements, roomShapes), [elements, roomShapes]);
  // Kluczowane tak, jak `buildPanelDevices` nadaje `key` aparatom obwodowym —
  // dzięki temu render dostaje gotową mapę i nie musi nic wiedzieć o obwodach.
  const sizingByDeviceKey = useMemo(() => new Map(sized.map((s) => [`mcb-${s.id}`, s])), [sized]);
  /** Trasy do NAJDALSZEGO punktu — te same, którymi dobór policzył ΔU (patrz
   *  `dlugosciDoboru`). Tabela na ekranie ich nie pokazuje, karta obliczeń musi. */
  const dlugosci = useMemo(() => dlugosciDoboru(circuits, elements, scales, geometria, floors), [circuits, elements, scales, geometria, floors]);

  // Aparaty przeliczają się, gdy zmienią się obwody lub konfiguracja zasilania.
  // Ręcznie dodane aparaty i ręcznie usunięte (auto-generowane) są zachowywane.
  // W trybie ręcznym NIC nie nadpisuje rozdzielnicy — to cała jego istota. Odbudowa
  // z obwodów dotyczy wyłącznie trybu „z rzutu".
  useEffect(() => {
    if (trybReczny) return;
    setDevices((prev) => {
      const manual = prev.filter((d) => d.manual);
      const rebuilt = buildPanelDevices(rcdGroups, { supply3f, mainRating })
        .filter((d) => !d.key || !hiddenKeys.includes(d.key))
        // Ręczne poprawki nakładane na świeżo policzony aparat — inaczej zmiana
        // nastawy albo opisu znikałaby po każdym elemencie postawionym na planie.
        .map((d) => (d.key && panelOverrides[d.key] ? { ...d, ...panelOverrides[d.key] } : d));
      return [...rebuilt, ...manual];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuits, rcdGroups, supply3f, mainRating, trybReczny, panelOverrides]);

  const rows = useMemo(() => layoutPanel(devices, perRow), [devices, perRow]);
  const usedModules = devices.reduce((a, d) => a + d.modules, 0);
  const totalModules = Math.max(rows.length, 1) * perRow;

  /**
   * Zgłoszenie trzech dokumentów tej zakładki do kompletu dokumentacji.
   *
   * Te akurat dałoby się złożyć z samych danych, bez montowania zakładki — ale wtedy
   * komplet musiałby po raz drugi wyliczyć aparaty, rozkład modułów i dobór, czyli
   * powtórzyć cały ten komponent. Jedna droga dla wszystkich dokumentów jest tańsza
   * niż dwie, z których jedna po cichu się rozjeżdża (patrz `lib/pdf/rejestr.ts`).
   */
  useEffect(
    () => zarejestrujProducenta("legenda", async () => buildPanelLegendDoc(devices, rows.length, usedModules, totalModules, perRow, docHeader))
  );
  useEffect(() => zarejestrujProducenta("paski", async () => buildLabelStripsDoc(devices, perRow, docHeader)));
  useEffect(() => zarejestrujProducenta("obliczenia", async () => buildCalcSheetDoc(sized, dlugosci, docHeader)));

  // Bilans faz pochodzi z prądów OBLICZENIOWYCH (`balance`), nie ze znamionowych
  // zabezpieczeń — i ta sama wartość idzie do kontroli selektywności, żeby obie
  // sekcje w tej zakładce nie pokazywały dwóch różnych liczb dla tej samej rzeczy.
  const phaseLoad = balance.amps;
  // Obecność SPD sprawdzamy w LIŚCIE APARATÓW, nie w osobnej fladze konfiguracji —
  // SPD jest teraz zwykłym aparatem, więc to jedyne źródło prawdy o tym, czy realnie
  // stoi w rozdzielnicy. Flaga konfiguracji mogłaby się rozjechać z listą (np. po
  // ręcznym skasowaniu aparatu) i ostrzeżenie kłamałoby, że ochrona jest.
  const maSpd = devices.some((d) => d.kind === "spd");
  const selectivity = useMemo(
    () => computeSelectivity(devices, mainRating, supply3f, maSpd, balance.amps),
    [devices, mainRating, supply3f, maSpd, balance]
  );
  const maxPhase = Math.max(phaseLoad.L1, phaseLoad.L2, phaseLoad.L3, 1);
  const phaseSpread = Math.round((maxPhase - Math.min(phaseLoad.L1, phaseLoad.L2, phaseLoad.L3)) * 10) / 10;
  /**
   * Czy obciążenie faktycznie jest rozłożone równo — liczone z UDZIAŁÓW
   * (`spreadPct`), nie z amperów.
   *
   * Sam próg amperowy (`phaseSpread > 32`) mówi tylko, czy asymetria zagraża
   * przewodowi N i przyłączu, i przy domowej instalacji nie zadziała nigdy. Brany
   * za miarę „równomierności" twierdził rzeczy wprost sprzeczne z tabelką nad nim:
   * dwa obwody po 6.5 A dawały L1 50% / L2 50% / L3 0% i podpis „obciążenie
   * rozłożone równomiernie".
   *
   * 15 pkt proc. przy trzech fazach to odchyłka rzędu 40/33/27% — jeszcze bez
   * znaczenia praktycznego, a już wyraźnie inna od 50/50/0.
   */
  const rozlozoneRowno = balance.spreadPct <= 15;
  /** Faza, na której jest najwięcej miejsca — konkretna wskazówka zamiast samego
   *  „rozważ przepięcie". Przy remisie bierze pierwszą, kolejność L1→L3 jest tu
   *  bez znaczenia, bo obie są tak samo dobre. */
  const najlzejszaFaza = (["L1", "L2", "L3"] as const).reduce((a, b) => (phaseLoad[b] < phaseLoad[a] ? b : a));

  function autoBalance() {
    commitPanelSnapshot();
    setDevices((ds) => balancePhases(ds));
  }

  function removeDevice(uid: string) {
    commitPanelSnapshot();
    setDevices((ds) => {
      const d = ds.find((x) => x.uid === uid);
      if (!d || d.kind === "main") return ds;
      if (!d.manual && d.key) setHiddenKeys((hk) => (hk.includes(d.key!) ? hk : [...hk, d.key!]));
      return ds.filter((x) => x.uid !== uid);
    });
  }

  function moveDevice(uid: string, dir: -1 | 1) {
    commitPanelSnapshot();
    setDevices((ds) => {
      const i = ds.findIndex((d) => d.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function resetLayout() {
    commitPanelSnapshot();
    setHiddenKeys([]);
    // „Odbuduj z rzutu" znaczy właśnie tyle: wracamy do stanu wynikającego z planu,
    // więc ręczne poprawki też idą precz. Ostrzega o tym podpowiedź przy przycisku —
    // a gdyby to jednak była pomyłka, „Cofnij” przywraca stan sprzed odbudowy.
    setPanelOverrides({});
    setDevices((prev) => {
      const manual = prev.filter((d) => d.manual);
      return [...buildPanelDevices(rcdGroups, { supply3f, mainRating }), ...manual];
    });
  }

  /**
   * Zapis edycji aparatu. Aparat auto-generowany dostaje dodatkowo trwałe NADPISANIE
   * kluczowane jego `key`, bo sama lista jest odtwarzana przy każdej zmianie planu.
   * Aparat dodany ręcznie zmieniamy wprost — nic go nie odtwarza.
   */
  function zapiszEdycje(uid: string, zmiany: Partial<PanelDevice>) {
    commitPanelSnapshot();
    const cel = devices.find((d) => d.uid === uid);
    if (cel && !cel.manual && cel.key) {
      setPanelOverrides({ ...panelOverrides, [cel.key]: { ...panelOverrides[cel.key], ...zmiany } });
    }
    setDevices((ds) => ds.map((d) => (d.uid === uid ? { ...d, ...zmiany } : d)));
  }

  function addManualDevice() {
    const def = MANUAL_DEVICE_TYPES.find((t) => t.key === addForm.kind);
    if (!def) return;
    commitPanelSnapshot();
    // SPD, RCD i rozłącznik przeciwpożarowy rozłączają WSZYSTKIE przewody robocze
    // dochodzące do rozdzielnicy (L+N albo L1L2L3+N) — ich liczba biegunów wynika
    // z zasilania CAŁEJ rozdzielnicy, dokładnie tym samym wzorem, którym
    // `buildPanelDevices` liczy rozłącznik główny i automatycznie generowaną
    // różnicówkę. Katalog trzyma 4P jako domyślny (typowy) wariant 3-fazowy; przy
    // zasilaniu 1-fazowym trzeba to przeliczyć, inaczej aparat 2-biegunowy dostałby
    // oznaczenie 4-biegunowego. Reszta katalogu tego nie potrzebuje: pozostałe
    // zabezpieczenia mają liczbę biegunów wynikającą z SAMEGO OBWODU, który
    // zabezpieczają (np. RCBO zawsze 1P+N), a nie z zasilania całej rozdzielnicy.
    const skalowaneBiegunyZeZasilania = def.key === "spd" || def.key === "rcd" || def.key === "ppoz";
    // Szerokość rośnie razem z biegunami TYLKO tam, gdzie 1 biegun realnie = 1 moduł
    // (SPD, RCD). Rozłącznik przeciwpożarowy ma kompaktowe warianty 4-biegunowe,
    // które mieszczą się w tych samych modułach co warianty 2-biegunowe (patrz
    // komentarz o „SUGEROWANE_MODULY" w EditDeviceModal.tsx) — jego szerokość
    // zostaje więc katalogową wartością niezależnie od liczby biegunów.
    const skalowanaSzerokosc = def.key === "spd" || def.key === "rcd";
    const poles = skalowaneBiegunyZeZasilania ? (supply3f ? "4P" : "2P") : def.poles;
    const modules = skalowanaSzerokosc ? (supply3f ? 4 : 2) : def.modules;
    setDevices((prev) => {
      const used = prev.filter((d) => String(d.tag || "").startsWith(def.prefix)).length;
      const tag = def.prefix ? `${def.prefix}${used + 1}` : "";
      return [
        ...prev,
        {
          uid: nextManualUid(prev),
          kind: def.key,
          manual: true,
          tag,
          modules,
          label: addForm.label || def.defLabel,
          caption: addForm.caption || def.label,
          poles,
          phase: supply3f && poles === "1P" ? "L1" : supply3f ? "3F" : "L1",
        },
      ];
    });
  }

  /** Wchodzi w tryb ręczny, zaczynając od rozłącznika głównego — pusta szyna
   *  wymagałaby od użytkownika odgadnięcia, od czego zacząć. Nic ponad to: SPD
   *  i reszta zabezpieczeń to teraz zwykłe pozycje katalogu, dokładane świadomie
   *  przez „Dodaj aparat ręcznie", a nie coś, co pojawia się z automatu. */
  function zacznijRecznie() {
    if (devices.length === 0) setDevices(buildPanelDevices([], { supply3f, mainRating }));
    setPanelTryb("reczny");
  }

  // Pusty ekran, dopóki nie ma czego pokazać. Sprawdzamy aparaty RĘCZNE, a nie długość
  // całej listy: bez żadnego obwodu odbudowa i tak dokłada rozłącznik główny oraz
  // ogranicznik, więc lista nigdy nie jest pusta — a sam rozłącznik z ogranicznikiem
  // to jeszcze nie rozdzielnica.
  if (circuits.length === 0 && !trybReczny && !devices.some((d) => d.manual)) {
    return (
      <div className="pe-card p-8 text-center">
        <h2 className="pe-display mb-2 text-xl">Rozdzielnica elektryczna</h2>
        <p className="mx-auto max-w-lg text-sm text-slate-500">
          Rozdzielnica wypełni się sama, gdy rozstawisz elementy w zakładce „Instalacja” — wtedy aparaty
          wynikają z policzonych obwodów.
        </p>
        {/* Dobór rozdzielnicy bywa zadaniem samym w sobie: wymiana tablicy w istniejącym
            budynku albo wycena nie wymagają rysowania rzutu. */}
        <p className="mx-auto mt-4 max-w-lg text-sm text-slate-500">
          Możesz też złożyć ją samodzielnie — aparat po aparacie, bez rysowania rzutu. Schemat jednokreskowy
          powstanie z tego, co ustawisz.
        </p>
        <Button variant="copper" size="sm" onClick={zacznijRecznie} className="mt-4">
          <Plus size={14} /> Zbuduj rozdzielnicę bez rzutu
        </Button>
      </div>
    );
  }

  const addDef = MANUAL_DEVICE_TYPES.find((t) => t.key === addForm.kind)!;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pe-display mb-1 text-xl">Rozdzielnica elektryczna</h2>
        <p className="text-sm text-slate-500">
          Widok frontu rozdzielnicy — {rows.length}× rząd {perRow} modułów, zajęte {usedModules} z {totalModules}.
        </p>
      </div>

      {unassignedCount > 0 && (
        <div className="flex items-start gap-2.5 py-1 text-xs text-slate-600" style={{ borderLeft: "3px solid #C1793F", paddingLeft: 12 }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-copper" />
          <span>
            {unassignedCount} {unassignedCount === 1 ? "element" : "elementów"} bez rozpoznanego pomieszczenia na planie
            (grupuje się do obwodów ogólnych zamiast trafić do właściwego pokoju, a łącznik nie połączy się z lampą w tym
            samym pomieszczeniu). Zwykle wystarczy w zakładce „Instalacja" trochę powiększyć obrys pomieszczenia albo
            poprawić pole „Pomieszczenie" w edycji elementu.
          </span>
        </div>
      )}

      <div className="pe-card flex flex-wrap items-end gap-4 p-4">
        {/* Źródło aparatów rozstrzyga, czy rozdzielnica sama się odświeża, czy jest
            wyłączną własnością użytkownika. Stoi PRZED resztą ustawień, bo zmienia
            znaczenie wszystkiego poniżej. */}
        <label className="block">
          <div className="mb-1 text-xs text-slate-500">Aparaty</div>
          <select
            value={panelTryb}
            onChange={(e) => setPanelTryb(e.target.value as "zRzutu" | "reczny")}
            className="pe-input text-sm"
            aria-label="Źródło aparatów"
          >
            <option value="zRzutu">Z rzutu instalacji</option>
            <option value="reczny">Składam ręcznie</option>
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-slate-500">Zasilanie</div>
          <select value={supply3f ? "3" : "1"} onChange={(e) => setPanelConfig({ supply3f: e.target.value === "3" })} className="pe-input text-sm">
            <option value="3">3-fazowe 400/230 V</option>
            <option value="1">1-fazowe 230 V</option>
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-slate-500">Rozłącznik główny</div>
          <select value={mainRating} onChange={(e) => setPanelConfig({ mainRating: Number(e.target.value) })} className="pe-input text-sm">
            {MAIN_RATING_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a} A
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-slate-500">Modułów w rzędzie</div>
          <select value={perRow} onChange={(e) => setPanelConfig({ perRow: Number(e.target.value) })} className="pe-input text-sm">
            {PER_ROW_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {/* Te dwie wartości są punktem wyjścia CAŁEGO doboru poniżej (bilans faz, dobór
            przewodu, wyłącznik główny) — a aplikacja nie ma jak ich zmierzyć sama, więc
            startuje z domysłem (3-fazowe 400/230 V, 40 A). Bez tej podpowiedzi laik nie
            wie, że akurat te dwa pola trzeba zweryfikować u operatora/na liczniku, zanim
            zaufa reszcie wyników — w przeciwieństwie do pól obok, które da się zmienić
            bez konsekwencji dla poprawności. */}
        <div className="flex w-full items-start gap-2.5 py-1 text-xs text-slate-600" style={{ borderLeft: "3px solid #C1793F", paddingLeft: 12 }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-copper" />
          <span>
            „Zasilanie" i „Rozłącznik główny" aplikacja przyjmuje jako domysł — sprawdź je w umowie z zakładem
            energetycznym albo na tabliczce licznika, zanim zaufasz doborowi zabezpieczeń poniżej.
          </span>
        </div>
        {/* Jedyną drogą do cofnięcia ręcznej zmiany (kasowanie aparatu, przesunięcie,
            edycja) było wcześniej „Odbuduj z rzutu" — a to liczy WSZYSTKO od zera,
            więc cofnięcie jednego kasowania kosztowało utratę reszty pracy. Ta para
            ma WŁASNĄ, mniejszą historię (patrz `commitPanelSnapshot` w store) —
            niezależną od cofania na planie w zakładce Instalacja. */}
        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border p-0.5">
          <button
            onClick={panelUndo}
            disabled={!panelCanUndo}
            title="Cofnij ostatnią zmianę w rozdzielnicy"
            aria-label="Cofnij"
            className="rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={panelRedo}
            disabled={!panelCanRedo}
            title="Ponów"
            aria-label="Ponów"
            className="rounded px-1.5 py-1 text-slate-500 hover:text-ink disabled:opacity-30"
          >
            <Redo2 size={15} />
          </button>
        </div>
        {supply3f && (
          <Button variant="ghost" size="sm" onClick={autoBalance}>
            Wyrównaj fazy
          </Button>
        )}
        {/* Nazwa mówi, SKĄD bierze się przeliczenie: z obwodów policzonych z rzutu.
            „Przelicz od nowa" nie zdradzało, że skasuje ręczne zmiany i odtworzy stan
            z planu. Też trafia na stos cofania (patrz `resetLayout`), więc pomyłkowe
            kliknięcie da się cofnąć tak samo jak każdą inną zmianę. */}
        {!trybReczny && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetLayout}
            title="Odtwarza aparaty z obwodów policzonych z rzutu — ręczne zmiany zostaną nadpisane"
          >
            <RotateCcw size={13} /> Odbuduj z rzutu
          </Button>
        )}
        {/* DWA dokumenty, DWA przyciski — a było ich cztery.
            Każdy z tych dwóch miał osobno „Podgląd…" i osobno „… PDF", czyli podgląd
            i pobranie tego samego. Pobranie było przy tym DROGĄ NA SKRÓTY obok
            podglądu — wbrew zasadzie, którą trzymają Kosztorys i Rzut: pobranie dzieje
            się Z POZIOMU PODGLĄDU, bo nikt nie ma wysyłać dokumentu, na który sam nie
            spojrzał. `PdfPreview` ma własny przycisk „Pobierz PDF", więc te dwa
            skróty niczego nie dawały poza dwoma przyciskami w rzędzie więcej.
            Nazwa idzie za DOKUMENTEM, nie za oknem (tak jak „Kosztorys do PDF"
            w CostsTab) — użytkownik szuka legendy, nie podglądu. */}
        <Button variant="copper" size="sm" onClick={() => setPodgladLegendy(true)}>
          <Eye size={13} /> Legenda do PDF
        </Button>
        {/* Osobny dokument od legendy: legenda to tabela do biurka, to jest wydruk do
            wycięcia i wsunięcia w tabliczki na aparatach — stąd inny przycisk i inna
            ikona (nożyczki), żeby nie sugerować, że to to samo w innym formacie. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPodgladPaskow(true)}
          title="Wydruk do wycięcia i wsunięcia w tabliczki opisowe aparatów — skala 1:1"
        >
          <Scissors size={13} /> Paski opisowe do PDF
        </Button>

        <EditDeviceModal
          device={devices.find((d) => d.uid === edytowany) ?? null}
          onClose={() => setEdytowany(null)}
          onSave={zapiszEdycje}
          supply3f={supply3f}
        />

        <PdfPreview
          open={podgladLegendy}
          onOpenChange={setPodgladLegendy}
          title="Legenda rozdzielnicy"
          filename={projectFileName("legenda-rozdzielnicy", docHeader.obiekt, "pdf")}
          build={() => buildPanelLegendPdf(devices, rows.length, usedModules, totalModules, perRow, docHeader)}
        />

        <PdfPreview
          open={podgladPaskow}
          onOpenChange={setPodgladPaskow}
          title="Paski opisowe rozdzielnicy"
          filename={projectFileName("paski-opisowe-rozdzielnicy", docHeader.obiekt, "pdf")}
          build={() => buildLabelStripsPdf(devices, perRow, docHeader)}
        />

        {supply3f && (
          <div className="w-full border-t pt-4" style={{ borderColor: "#EEF1F4" }}>
            <div className="mb-2 text-xs text-slate-500">
              Bilans obciążenia faz (prąd obliczeniowy odbiorników, nie prąd znamionowy zabezpieczeń)
            </div>
            <div className="space-y-1.5">
              {(["L1", "L2", "L3"] as const).map((ph) => (
                <div key={ph} className="flex items-center gap-2">
                  <span className="pe-mono w-6 text-xs font-bold" style={{ color: PHASE_COLORS[ph] }}>
                    {ph}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "#EEF1F4" }}>
                    <div style={{ width: `${(phaseLoad[ph] / maxPhase) * 100}%`, height: "100%", background: PHASE_COLORS[ph], opacity: 0.75 }} />
                  </div>
                  <span className="pe-mono w-20 text-right text-xs text-slate-600">
                    {formatLiczba(phaseLoad[ph], 1)} A · {formatLiczba(balance.percent[ph], 1)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px]" style={{ color: phaseSpread > 32 ? "#A2352C" : "#64748B" }}>
              {phaseSpread > 32
                ? `Różnica między najbardziej i najmniej obciążoną fazą wynosi ${formatLiczba(phaseSpread, 1)} A — rozważ przepięcie obwodów lub użyj „Wyrównaj fazy”.`
                : rozlozoneRowno
                  ? `Rozrzut między fazami: ${formatLiczba(phaseSpread, 1)} A (${formatLiczba(balance.spreadPct, 1)} pkt proc.) — obciążenie rozłożone równomiernie.`
                  : // Świadomie BEZ namawiania do przepinania: przy dwóch obwodach na trzy fazy
                    // jedna zostanie pusta niezależnie od tego, jak je poprzekładać, więc rada
                    // „wyrównaj" byłaby nie do wykonania. Przy tak małych prądach asymetria i
                    // tak nie zmienia doboru — liczy się dopiero przy dokładaniu kolejnych obwodów.
                    `Rozrzut między fazami: ${formatLiczba(phaseSpread, 1)} A (${formatLiczba(balance.spreadPct, 1)} pkt proc.) — obciążenie nierówne, ale przy tych prądach bez wpływu na dobór. Kolejne obwody dokładaj od fazy ${najlzejszaFaza}.`}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Kolumna rysunku dostaje własną podstawę szerokości (`basis`) zamiast samego
            `flex-none`. Przy `flex-none` szerokość brał się z zawartości, a rysunek ma
            `width: 100%` — czyli wymiar zależny od rodzica. Takie wzajemne odwołanie
            kończyło się na wartości domyślnej i rozdzielnica renderowała się na ~300 px
            niezależnie od tego, ile miejsca było obok. Teraz kolumna zna swoją szerokość,
            a rysunek może ją wypełnić; `max-w-full` pilnuje, żeby na wąskim ekranie
            zmalała zamiast rozpychać układ. */}
        <div className="w-[720px] max-w-full flex-none">
          <PanelRender
            devices={devices}
            perRow={perRow}
            onDelete={removeDevice}
            onMove={(from, to) => {
              commitPanelSnapshot();
              setDevices((ds) => przeniesAparat(ds, from, to));
            }}
            onEdit={setEdytowany}
            sizing={sizingByDeviceKey}
          />
        </div>

        <div className="pe-card min-w-[280px] flex-1 p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText size={15} className="text-copper" />
            <h3 className="pe-display text-[15px]">Aparaty ({devices.length})</h3>
          </div>

          {/* Typowa rozdzielnica domowa to ~10–15 aparatów; przy `max-h-72` (≈9 wierszy)
              ostatni wiersz był przecinany w połowie i wyglądał jak błąd renderowania,
              a nie jak przewijanie. Wyższy kontener mieści cały typowy zestaw. */}
          <div className="pe-scroll mb-4 max-h-[26rem] space-y-1 overflow-y-auto">
            {devices.map((d, i) => (
              <div key={d.uid} className="flex items-center gap-2 rounded-md border border-border bg-white p-1.5 text-xs">
                <span className="pe-mono w-10 shrink-0 font-semibold">{d.tag}</span>
                <span className="min-w-0 flex-1 truncate">{d.caption}</span>
                <span className="pe-mono shrink-0 text-slate-400">{d.label}</span>
                <button
                  onClick={() => setEdytowany(d.uid)}
                  title="Edytuj aparat"
                  aria-label={`Edytuj aparat ${d.tag}`}
                  className="text-slate-400 hover:text-blueprint"
                >
                  <Pencil size={13} />
                </button>
                <button onClick={() => moveDevice(d.uid, -1)} disabled={i === 0} className="text-slate-400 hover:text-blueprint disabled:opacity-30">
                  <ArrowUp size={13} />
                </button>
                <button onClick={() => moveDevice(d.uid, 1)} disabled={i === devices.length - 1} className="text-slate-400 hover:text-blueprint disabled:opacity-30">
                  <ArrowDown size={13} />
                </button>
                {d.kind !== "main" && (
                  <button onClick={() => removeDevice(d.uid)} className="text-slate-400 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t pt-3" style={{ borderColor: "#EEF1F4" }}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Dodaj aparat ręcznie</div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={addForm.kind}
                onChange={(e) => {
                  const def = MANUAL_DEVICE_TYPES.find((t) => t.key === e.target.value)!;
                  setAddForm({ kind: def.key, label: def.defLabel, caption: "" });
                }}
                className="pe-input col-span-2 text-xs"
              >
                {MANUAL_DEVICE_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select value={addForm.label} onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))} className="pe-input text-xs">
                {addDef.ratings.map((r) => (
                  <option key={r} value={r}>
                    {r || "—"}
                  </option>
                ))}
              </select>
              <input
                value={addForm.caption}
                onChange={(e) => setAddForm((f) => ({ ...f, caption: e.target.value }))}
                placeholder="Opis (opcjonalnie)"
                className="pe-input text-xs"
              />
            </div>
            <button onClick={addManualDevice} className="pe-btn-ghost mt-2 flex w-full items-center justify-center gap-1.5 py-1.5 text-xs">
              <Plus size={13} /> Dodaj
            </button>
          </div>
        </div>
      </div>

      <div className="pe-card p-5">
        {/* Przyciski przy TEJ tabeli, nie w pasku nad rysunkiem rozdzielnicy: karta
            obliczeń jest wydrukiem tego, co widać poniżej, a tamten pasek dotyczy
            rozmieszczenia aparatów. Wyłączone przy pustym doborze — PDF z samą główką
            tabeli wygląda jak awaria, nie jak dokument. */}
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="pe-display text-[15px]">Dobór obwodów wg PN-HD 60364</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="copper"
              size="sm"
              disabled={sized.length === 0}
              title={
                sized.length === 0
                  ? "Brak obwodów — narysuj instalację na rzucie"
                  : "Tabela doboru z długościami tras — do dokumentacji projektu"
              }
              onClick={() => setPodgladObliczen(true)}
            >
              <Eye size={13} /> Karta obliczeń do PDF
            </Button>
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Przekrój i zabezpieczenie dobrane tak, by jednocześnie spełnić Ib ≤ In ≤ Iz oraz limit spadku
          napięcia (3% oświetlenie, 5% pozostałe). Obciążalność z tablicy B.52.4 po współczynnikach
          temperatury i grupowania.{" "}
          {/* Nazwy kondygnacji, nie samo „plan nie ma skali": przy trzech piętrach
              i jednym nieskalibrowanym trzeba wiedzieć, KTÓRE otworzyć. */}
          {bezSkali.length === 0 ? (
            <>Długości tras policzone z kalibracji skali planu.</>
          ) : (
            <span style={{ color: "#8A5526" }}>
              Bez skali: {bezSkali.join(", ")} — spadek napięcia nie został sprawdzony dla obwodów
              sięgających {bezSkali.length === 1 ? "tej kondygnacji" : "tych kondygnacji"}.
            </span>
          )}
        </p>

        {/*
          Warunki doboru stoja PRZY TABELI, a nie w ustawieniach obudowy wyzej: zasilanie
          i rozlacznik opisuja rozdzielnice jako urzadzenie, a te cztery liczby to
          zalozenia o instalacji i widac po nich wprost, ktora kolumne nizej zmieniaja.
        */}
        <div className="mb-3 flex flex-wrap items-end gap-3">
          {/*
            WARUNKI DOBORU. Z rysunku nie da się odczytać, czy trasa idzie przez nieocieplone
            poddasze ani ile obwodów dzieli jedną rurę — a jedno i drugie OBNIŻA obciążalność
            przewodu. Dobór projektu przyjmował dotąd warunki najłagodniejsze (30 °C, jeden
            obwód w wiązce), czyli mylił się w stronę niebezpieczną. Ten sam silnik liczy
            kalkulator, który te nastawy miał od dawna.
          */}
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Sposób ułożenia</div>
            <select
              value={warunki.sposobUlozenia}
              onChange={(e) => setWarunki({ sposobUlozenia: e.target.value as LayingMethod })}
              className="pe-input text-sm"
            >
              {(Object.keys(OPIS_ULOZENIA) as LayingMethod[]).map((m) => (
                <option key={m} value={m}>
                  {OPIS_ULOZENIA[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Temperatura otoczenia</div>
            <select
              value={warunki.temperaturaC}
              onChange={(e) => setWarunki({ temperaturaC: Number(e.target.value) })}
              className="pe-input text-sm"
              title="30 °C to warunek odniesienia tablic obciążalności. Wyższa temperatura — trasa przez nieocieplone poddasze albo kotłownię — obniża obciążalność przewodu."
            >
              {[25, 30, 35, 40, 45, 50].map((t) => (
                <option key={t} value={t}>
                  {t} °C
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Obwodów w wiązce</div>
            <select
              value={warunki.obwodowWWiazce}
              onChange={(e) => setWarunki({ obwodowWWiazce: Number(e.target.value) })}
              className="pe-input text-sm"
              title="Ile obwodów dzieli wspólną trasę (rurę, korytko). Im więcej, tym niższa obciążalność każdego z nich — rozdzielenie tras podnosi ją z powrotem."
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Zapas na punkt [m]</div>
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={warunki.zapasNaPunktM}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(",", "."));
                setWarunki({ zapasNaPunktM: Number.isFinite(v) && v >= 0 ? v : ZAPAS_MONTAZOWY_M });
              }}
              aria-label="Zapas montażowy na punkt w metrach"
              className="pe-input w-full text-sm tabular-nums"
              title="Zejście do puszki i luz zostawiany w niej na podłączenie. Doliczany do KAŻDEGO punktu osobno, więc przy stu punktach to kilkaset metrów kabla w kosztorysie. Wchodzi też (raz) w długość decydującą o spadku napięcia."
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Spadek na WLZ [%]</div>
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={warunki.spadekWlzPct}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(",", "."));
                setWarunki({ spadekWlzPct: Number.isFinite(v) && v >= 0 ? v : 0 });
              }}
              aria-label="Spadek napięcia na WLZ w procentach"
              className="pe-input w-full text-sm tabular-nums"
              title="Spadek napięcia zużyty już na odcinku od złącza do rozdzielnicy. Limit 3/5% dotyczy CAŁEJ drogi, więc to, co zjadła WLZ, nie jest już dostępne dla obwodów. Policzysz go w Kalkulatorach."
            />
          </label>
        </div>

        <div className="pe-scroll overflow-x-auto">
          <table className="w-full text-left text-[11.5px]">
            <thead>
              <tr className="text-slate-400">
                <th className="py-1 pr-3 font-medium">Obwód</th>
                <th className="py-1 pr-3 font-medium">
                  <Podpowiedz tresc="Do którego przewodu fazowego (L1/L2/L3) podłączony jest obwód — rozkłada obciążenie równomiernie między fazy.">
                    Faza
                  </Podpowiedz>
                </th>
                <th className="py-1 pr-3 text-right font-medium">
                  <Podpowiedz tresc="Prąd obliczeniowy — ile prądu faktycznie pobiorą odbiorniki podłączone do tego obwodu.">Ib</Podpowiedz>
                </th>
                <th className="py-1 pr-3 text-right font-medium">
                  <Podpowiedz tresc="Przekrój żyły przewodu (mm²) — na tyle duży, żeby bezpiecznie przenieść prąd Ib bez przegrzania.">Przekrój</Podpowiedz>
                </th>
                <th className="py-1 pr-3 font-medium">
                  <Podpowiedz tresc="Dobrany wyłącznik nadprądowy (bezpiecznik) — jego prąd znamionowy chroni przewód przed przeciążeniem.">Aparat</Podpowiedz>
                </th>
                <th className="py-1 pr-3 text-right font-medium">
                  <Podpowiedz tresc="Obciążalność prądowa przewodu — maksymalny prąd, jaki może bezpiecznie przenieść przy tym sposobie ułożenia.">Iz</Podpowiedz>
                </th>
                <th className="py-1 pr-3 text-right font-medium">
                  <Podpowiedz tresc="Spadek napięcia na trasie od rozdzielnicy do najdalszego punktu obwodu — im dłuższy przewód, tym większy; norma ogranicza go do 3–5%.">ΔU</Podpowiedz>
                </th>
                <th className="py-1 pr-3 text-right font-medium">
                  <Podpowiedz tresc="Maksymalna impedancja pętli zwarcia, przy której zabezpieczenie zdąży zadziałać wystarczająco szybko przy zwarciu.">Zs max</Podpowiedz>
                </th>
                <th className="py-1 pr-3 font-medium">
                  <Podpowiedz tresc="Typ wyłącznika różnicowoprądowego wymagany dla tego obwodu — chroni przed porażeniem prądem w razie uszkodzenia izolacji.">RCD</Podpowiedz>
                </th>
              </tr>
            </thead>
            <tbody>
              {sized.map((s) => {
                const bad = s.status === "error";
                const warn = s.status === "warn";
                return (
                  <tr
                    key={s.id}
                    className="border-t"
                    style={{ borderColor: "#EEF1F4", background: bad ? "#C6433A0A" : warn ? "#C1793F0A" : undefined }}
                  >
                    <td className="py-1.5 pr-3">{s.nazwa}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className="pe-mono font-semibold"
                        style={{ color: PHASE_COLORS[s.liczba_faz === "3" ? "3F" : s.faza] ?? "#64748B" }}
                      >
                        {s.liczba_faz === "3" ? "3F" : s.faza}
                      </span>
                    </td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">{formatLiczba(s.Ib_A, 2)} A</td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">
                      {s.przekroj_mm2 ? `${String(s.przekroj_mm2).replace(".", ",")} mm²` : "—"}
                    </td>
                    <td className="pe-mono py-1.5 pr-3">
                      {s.aparat ? `${s.aparat.charakterystyka}${s.aparat.In_A} ${s.aparat.bieguny}` : "—"}
                    </td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">{formatLiczba(s.Iz_A, 1)} A</td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">
                      {s.spadek_napiecia_pct === null ? "—" : `${zPrzecinkiem(s.spadek_napiecia_pct)}%`}
                    </td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">{zPrzecinkiem(s.Zs_max_Ohm)} Ω</td>
                    <td className="pe-mono py-1.5 pr-3">typ {s.rcd_typ}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(sizingWarnings.length > 0 || ostrzezeniaReczne.length > 0) && (
          <div className="mt-4 space-y-1.5">
            {sizingWarnings.map((w, i) => (
              <div
                key={i}
                className="flex gap-2 rounded-md p-2.5 text-[11.5px] leading-relaxed"
                style={{ background: w.level === "error" ? "#C6433A14" : "#C1793F14", color: w.level === "error" ? "#A2352C" : "#8A5526" }}
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold">{w.obwod}</span> — {w.message}
                </div>
              </div>
            ))}
            {ostrzezeniaReczne.map((o, i) => (
              <div
                key={`reczne-${i}`}
                className="flex gap-2 rounded-md p-2.5 text-[11.5px] leading-relaxed"
                style={{ background: "#C1793F14", color: "#8A5526" }}
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <div>{o.tresc}</div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          Dobór orientacyjny/edukacyjny. Projekt do realizacji i odbioru wykonuje i podpisuje osoba
          z uprawnieniami; wymagane pomiary powykonawcze.
        </p>

        <PdfPreview
          open={podgladObliczen}
          onOpenChange={setPodgladObliczen}
          title="Karta obliczeń obwodów"
          filename={projectFileName("karta-obliczen", docHeader.obiekt, "pdf")}
          build={() => buildCalcSheetPdf(sized, dlugosci, docHeader)}
        />
      </div>

      <div className="pe-card p-5">
        <h3 className="pe-display mb-1 text-[15px]">Sprawdzenie selektywności i doboru zabezpieczeń</h3>
        <p className="mb-3 text-xs text-slate-500">
          Automatyczna kontrola stopniowania zabezpieczeń, ochrony różnicówek i rozkładu obciążenia.
        </p>
        <div className="space-y-2">
          {selectivity.map((s, i) => {
            const { bg, fg, Icon } = SELECTIVITY_STYLE[s.level];
            return (
              <div key={i} className="flex gap-2.5 rounded-md p-3" style={{ background: bg }}>
                <Icon size={15} className="mt-0.5 shrink-0" style={{ color: fg }} />
                <div>
                  <div className="text-xs font-semibold" style={{ color: fg }}>
                    {s.title}
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: fg }}>
                    {s.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
