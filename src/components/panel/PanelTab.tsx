import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Download, Eye, FileText, Info, Pencil, Plus, Redo2, RotateCcw, Scissors, Trash2, Undo2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { computeRcdGroups } from "@/lib/panel/circuits";
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
import { assignPhases, computeSizedCircuits, phaseBalance } from "@/lib/panel/project";
import { scaleOf } from "@/lib/design";
import { buildPanelLegendPdf, downloadPanelLegendPdf } from "@/lib/pdf/panelLegend";
import { buildLabelStripsPdf, downloadLabelStripsPdf } from "@/lib/pdf/labelStrips";
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

let manualSeq = 0;
const nextManualUid = () => `manual-${++manualSeq}`;

/**
 * Rozdzielnica elektryczna: rzut czołowy budowany automatycznie z obwodów
 * (wyznaczonych heurystyką z elementów na planie, w src/lib/panel/circuits.ts)
 * + ręcznie dodawane aparaty. Bez przeciągania myszką (jak w wersji JS) —
 * kolejność zmienia się przyciskami ↑/↓, co jest prostsze i równie użyteczne.
 */
export function PanelTab() {
  const elements = useProjectStore((s) => s.draft.elements); // cały budynek, nie tylko bieżąca kondygnacja
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
  const { supply3f, mainRating } = panelConfig;
  const [perRow, setPerRow] = useState(12);
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
  // Skala z bieżącej kondygnacji — bez kalibracji `mpu` jest null i dobór jawnie
  // zgłasza, że spadku napięcia nie sprawdzono, zamiast liczyć go z długości „na oko".
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const scales = useProjectStore((s) => s.scales);
  const mpu = scaleOf(scales, activeFloorId);
  const { circuits, sized: sizedRaw } = useMemo(
    () => computeSizedCircuits(elements, { metersPerUnit: mpu }),
    [elements, mpu]
  );
  const rcdGroups = useMemo(() => computeRcdGroups(circuits), [circuits]);
  const sized = useMemo(() => assignPhases(sizedRaw, supply3f), [sizedRaw, supply3f]);
  const balance = useMemo(() => phaseBalance(sized), [sized]);
  const sizingWarnings = useMemo(
    () => sized.flatMap((s) => s.ostrzezenia.map((w) => ({ ...w, obwod: s.nazwa }))),
    [sized]
  );
  // Kluczowane tak, jak `buildPanelDevices` nadaje `key` aparatom obwodowym —
  // dzięki temu render dostaje gotową mapę i nie musi nic wiedzieć o obwodach.
  const sizingByDeviceKey = useMemo(() => new Map(sized.map((s) => [`mcb-${s.id}`, s])), [sized]);

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
    // SPD musi mieć tyle biegunów, ile przewodów fazowych i N dochodzi do rozdzielnicy
    // — dokładnie ten sam wzór, którym `buildPanelDevices` liczy rozłącznik główny.
    // Katalog trzyma 4P/4 moduły jako domyślny (typowy) wariant 3-fazowy; przy
    // zasilaniu 1-fazowym trzeba to przeliczyć, inaczej aparat 2-biegunowy dostałby
    // szerokość 4-biegunowego. Reszta katalogu tego nie potrzebuje: pozostałe
    // zabezpieczenia mają liczbę biegunów wynikającą z SAMEGO OBWODU, który
    // zabezpieczają (np. RCBO zawsze 1P+N), a nie z zasilania całej rozdzielnicy.
    const dynamiczneBieguny = def.key === "spd";
    const poles = dynamiczneBieguny ? (supply3f ? "4P" : "2P") : def.poles;
    const modules = dynamiczneBieguny ? (supply3f ? 4 : 2) : def.modules;
    setDevices((prev) => {
      const used = prev.filter((d) => String(d.tag || "").startsWith(def.prefix)).length;
      const tag = def.prefix ? `${def.prefix}${used + 1}` : "";
      return [
        ...prev,
        {
          uid: nextManualUid(),
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
          <select value={perRow} onChange={(e) => setPerRow(Number(e.target.value))} className="pe-input text-sm">
            {PER_ROW_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
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
        <Button variant="ghost" size="sm" onClick={() => setPodgladLegendy(true)}>
          <Eye size={13} /> Podgląd legendy
        </Button>
        <Button
          variant="copper"
          size="sm"
          onClick={() => downloadPanelLegendPdf(devices, rows.length, usedModules, totalModules, perRow, docHeader)}
        >
          <Download size={13} /> Legenda PDF
        </Button>
        {/* Osobny dokument od legendy: legenda to tabela do biurka, to jest wydruk do
            wycięcia i wsunięcia w tabliczki na aparatach — stąd inny przycisk i inna
            ikona (nożyczki), żeby nie sugerować, że to to samo w innym formacie. */}
        <Button variant="ghost" size="sm" onClick={() => setPodgladPaskow(true)}>
          <Scissors size={13} /> Podgląd pasków
        </Button>
        <Button
          variant="copper"
          size="sm"
          onClick={() => downloadLabelStripsPdf(devices, perRow, docHeader)}
          title="Wydruk do wycięcia i wsunięcia w tabliczki opisowe aparatów — skala 1:1"
        >
          <Download size={13} /> Paski opisowe PDF
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
                    {phaseLoad[ph]} A · {balance.percent[ph]}%
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px]" style={{ color: phaseSpread > 32 ? "#A2352C" : "#64748B" }}>
              {phaseSpread > 32
                ? `Różnica między najbardziej i najmniej obciążoną fazą wynosi ${phaseSpread} A — rozważ przepięcie obwodów lub użyj „Wyrównaj fazy”.`
                : `Rozrzut między fazami: ${phaseSpread} A (${balance.spreadPct} pkt proc.) — obciążenie rozłożone równomiernie.`}
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
        <h3 className="pe-display mb-1 text-[15px]">Dobór obwodów wg PN-HD 60364</h3>
        <p className="mb-3 text-xs text-slate-500">
          Przekrój i zabezpieczenie dobrane tak, by jednocześnie spełnić Ib ≤ In ≤ Iz oraz limit spadku
          napięcia (3% oświetlenie, 5% pozostałe). Obciążalność z tablicy B.52.4 po współczynnikach
          temperatury i grupowania.{" "}
          {mpu ? (
            <>Długości tras policzone z kalibracji skali planu.</>
          ) : (
            <span style={{ color: "#8A5526" }}>
              Plan nie ma skalibrowanej skali — spadek napięcia nie został sprawdzony.
            </span>
          )}
        </p>

        <div className="pe-scroll overflow-x-auto">
          <table className="w-full text-left text-[11.5px]">
            <thead>
              <tr className="text-slate-400">
                <th className="py-1 pr-3 font-medium">Obwód</th>
                <th className="py-1 pr-3 font-medium">Faza</th>
                <th className="py-1 pr-3 text-right font-medium">Ib</th>
                <th className="py-1 pr-3 text-right font-medium">Przekrój</th>
                <th className="py-1 pr-3 font-medium">Aparat</th>
                <th className="py-1 pr-3 text-right font-medium">Iz</th>
                <th className="py-1 pr-3 text-right font-medium">ΔU</th>
                <th className="py-1 pr-3 text-right font-medium">Zs max</th>
                <th className="py-1 pr-3 font-medium">RCD</th>
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
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">{s.Ib_A ?? "—"} A</td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">
                      {s.przekroj_mm2 ? `${String(s.przekroj_mm2).replace(".", ",")} mm²` : "—"}
                    </td>
                    <td className="pe-mono py-1.5 pr-3">
                      {s.aparat ? `${s.aparat.charakterystyka}${s.aparat.In_A} ${s.aparat.bieguny}` : "—"}
                    </td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">{s.Iz_A ?? "—"} A</td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">
                      {s.spadek_napiecia_pct === null ? "—" : `${s.spadek_napiecia_pct}%`}
                    </td>
                    <td className="pe-mono py-1.5 pr-3 text-right tabular-nums">{s.Zs_max_Ohm ?? "—"} Ω</td>
                    <td className="pe-mono py-1.5 pr-3">typ {s.rcd_typ}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sizingWarnings.length > 0 && (
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
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          Dobór orientacyjny/edukacyjny. Projekt do realizacji i odbioru wykonuje i podpisuje osoba
          z uprawnieniami; wymagane pomiary powykonawcze.
        </p>
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
