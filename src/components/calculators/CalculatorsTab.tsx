import { useMemo } from "react";
import {
  AlertTriangle,
  Anchor,
  Cable,
  Calculator,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Home,
  Info,
  Plus,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { calcLighting, calcPowerBalance, maxGroundingResistance, UL } from "@/lib/electrical";
import { computeCircuits } from "@/lib/panel/circuits";
import { circuitDemand, kindForElements } from "@/lib/panel/loads";
import { LAYING_METHOD_LABELS, U0, type LayingMethod } from "@/lib/panel/norms";
import { sizeCircuit, sizeFeeder, zsMaxForBreaker, type CircuitKind } from "@/lib/panel/sizing";
import { useCalculatorsStore, type CalcId } from "@/store/useCalculatorsStore";
import { useProjectStore } from "@/store/useProjectStore";
import { Card } from "./Card";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";

const CALC_LIST: { id: CalcId; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "przewod", label: "Dobór przewodu i zabezpieczenia", desc: "przekrój, wyłącznik, spadek napięcia", icon: Zap },
  { id: "moc", label: "Bilans mocy budynku", desc: "moc zapotrzebowana, dobór przyłącza", icon: Home },
  { id: "wlz", label: "Dobór WLZ (linii zasilającej)", desc: "przekrój kabla od licznika do rozdzielnicy", icon: Cable },
  { id: "petla", label: "Impedancja pętli zwarcia", desc: "ochrona przeciwporażeniowa — układ TN", icon: ClipboardCheck },
  { id: "uziemienieTT", label: "Rezystancja uziemienia", desc: "ochrona przeciwporażeniowa — układ TT", icon: Anchor },
  { id: "oswietlenie", label: "Dobór oświetlenia", desc: "strumień świetlny i liczba opraw", icon: Calculator },
  { id: "rcd", label: "Dobór wyłącznika różnicowoprądowego", desc: "zasady doboru RCD", icon: Info },
];

const CIRCUIT_KIND_OPTIONS: { value: CircuitKind; label: string }[] = [
  { value: "oswietlenie", label: "Oświetlenie" },
  { value: "gniazda", label: "Gniazda" },
  { value: "dedykowany", label: "Odbiornik dedykowany" },
];

const LAYING_METHOD_OPTIONS = (Object.entries(LAYING_METHOD_LABELS) as [LayingMethod, string][]).map(
  ([value, label]) => ({ value, label })
);

export function CalculatorsTab() {
  // Stan (wejścia i lista odbiorników w bilansie mocy) mieszka w osobnym,
  // trwałym store'zie (`useCalculatorsStore`, localStorage) — bez tego
  // wszystko znikało przy zmianie zakładki albo odświeżeniu strony. Selektory
  // pojedynczych pól (zamiast jednego selektora zwracającego obiekt) to ten
  // sam wzorzec co `useProjectStore` w całej aplikacji — każdy komponent
  // subskrybuje tylko to, co faktycznie czyta.
  const activeCalc = useCalculatorsStore((s) => s.activeCalc);
  const circuitKind = useCalculatorsStore((s) => s.circuitKind);
  const power = useCalculatorsStore((s) => s.power);
  const phase = useCalculatorsStore((s) => s.phase);
  const cosphi = useCalculatorsStore((s) => s.cosphi);
  const length = useCalculatorsStore((s) => s.length);
  const layingMethod = useCalculatorsStore((s) => s.layingMethod);
  const ambientC = useCalculatorsStore((s) => s.ambientC);
  const bundleCount = useCalculatorsStore((s) => s.bundleCount);
  const motorStart = useCalculatorsStore((s) => s.motorStart);
  const devices = useCalculatorsStore((s) => s.devices);
  const ks = useCalculatorsStore((s) => s.ks);
  const zCurve = useCalculatorsStore((s) => s.zCurve);
  const zIn = useCalculatorsStore((s) => s.zIn);
  const zMeasured = useCalculatorsStore((s) => s.zMeasured);
  const wlzCurrentA = useCalculatorsStore((s) => s.wlzCurrentA);
  const wlzPhase = useCalculatorsStore((s) => s.wlzPhase);
  const wlzLength = useCalculatorsStore((s) => s.wlzLength);
  const wlzLayingMethod = useCalculatorsStore((s) => s.wlzLayingMethod);
  const wlzAmbientC = useCalculatorsStore((s) => s.wlzAmbientC);
  const wlzBundleCount = useCalculatorsStore((s) => s.wlzBundleCount);
  const wlzDropLimit = useCalculatorsStore((s) => s.wlzDropLimit);
  const ttIdnMa = useCalculatorsStore((s) => s.ttIdnMa);
  const ttMeasuredRa = useCalculatorsStore((s) => s.ttMeasuredRa);
  const roomA = useCalculatorsStore((s) => s.roomA);
  const lux = useCalculatorsStore((s) => s.lux);
  const lumPerOpr = useCalculatorsStore((s) => s.lumPerOpr);
  const mf = useCalculatorsStore((s) => s.mf);
  const uf = useCalculatorsStore((s) => s.uf);
  const patch = useCalculatorsStore((s) => s.patch);
  const setDevices = useCalculatorsStore((s) => s.setDevices);

  const setActiveCalc = (v: CalcId) => patch({ activeCalc: v });
  const setCircuitKind = (v: CircuitKind) => patch({ circuitKind: v });
  const setPower = (v: number) => patch({ power: v });
  const setPhase = (v: "1" | "3") => patch({ phase: v });
  const setCosphi = (v: number) => patch({ cosphi: v });
  const setLength = (v: number) => patch({ length: v });
  const setLayingMethod = (v: LayingMethod) => patch({ layingMethod: v });
  const setAmbientC = (v: number) => patch({ ambientC: v });
  const setBundleCount = (v: number) => patch({ bundleCount: v });
  const setMotorStart = (v: boolean) => patch({ motorStart: v });
  const setKs = (v: number) => patch({ ks: v });
  const setZCurve = (v: string) => patch({ zCurve: v });
  const setZIn = (v: number) => patch({ zIn: v });
  const setZMeasured = (v: number) => patch({ zMeasured: v });
  const setWlzCurrentA = (v: number) => patch({ wlzCurrentA: v });
  const setWlzPhase = (v: "1" | "3") => patch({ wlzPhase: v });
  const setWlzLength = (v: number) => patch({ wlzLength: v });
  const setWlzLayingMethod = (v: LayingMethod) => patch({ wlzLayingMethod: v });
  const setWlzAmbientC = (v: number) => patch({ wlzAmbientC: v });
  const setWlzBundleCount = (v: number) => patch({ wlzBundleCount: v });
  const setWlzDropLimit = (v: number) => patch({ wlzDropLimit: v });
  const setTtIdnMa = (v: number) => patch({ ttIdnMa: v });
  const setTtMeasuredRa = (v: number) => patch({ ttMeasuredRa: v });
  const setRoomA = (v: number) => patch({ roomA: v });
  const setLux = (v: number) => patch({ lux: v });
  const setLumPerOpr = (v: number) => patch({ lumPerOpr: v });
  const setMf = (v: number) => patch({ mf: v });
  const setUf = (v: number) => patch({ uf: v });

  // --- 1. dobór przewodu, zabezpieczenia i spadku napięcia ---
  // Ten sam silnik (`sizeCircuit`), co automatyczny dobór w zakładce Rozdzielnica
  // (`lib/panel/project.ts`) — jedno źródło prawdy, więc obie zakładki nigdy nie
  // podadzą różnego wyniku dla tych samych danych wejściowych.
  const sized = useMemo(
    () =>
      sizeCircuit({
        id: "kalkulator",
        nazwa: "Obwód",
        typ: circuitKind,
        moc_W: power,
        liczba_faz: phase,
        cos_phi: cosphi,
        dlugosc_m: length > 0 ? length : undefined,
        sposob_ulozenia: layingMethod,
        temperatura_otoczenia_C: ambientC,
        obwodow_w_wiazce: bundleCount,
        rozruch_silnikowy: motorStart,
      }),
    [circuitKind, power, phase, cosphi, length, layingMethod, ambientC, bundleCount, motorStart]
  );

  // --- 2. bilans mocy ---
  const balance = useMemo(() => calcPowerBalance(devices, ks), [devices, ks]);

  // Obwody z CAŁEGO budynku (wszystkie kondygnacje — `draft.elements` nie jest
  // filtrowane per piętro, tak samo jak w Rozdzielnicy, patrz PanelTab.tsx),
  // przepuszczone przez ten sam model obciążeń co dobór normatywny
  // (`circuitDemand`), żeby „Wczytaj z projektu" dawało moc zainstalowaną
  // zgodną co do watu z tym, co widać w Rozdzielnicy — nie osobno wymyśloną
  // liczbę. Filtr `power > 0` odsiewa obwody złożone wyłącznie z elementów bez
  // przypisanej mocy typowej (np. same łączniki bez lamp w tej samej paczce).
  const projectElements = useProjectStore((s) => s.draft.elements);
  const projectDevices = useMemo(() => {
    return computeCircuits(projectElements)
      .map((c) => {
        const kind = kindForElements(c.elements);
        return { name: c.name, power: Math.round(circuitDemand(c.elements, kind).installedW) };
      })
      .filter((d) => d.power > 0);
  }, [projectElements]);

  function loadDevicesFromProject() {
    if (!confirm("Zastąpić listę odbiorników obwodami wyliczonymi z planu? Obecna lista zostanie nadpisana.")) return;
    setDevices(() => projectDevices.map((d) => ({ id: crypto.randomUUID(), ...d })));
  }

  // --- 3. impedancja pętli zwarcia ---
  const zCalc = useMemo(() => {
    const { ia, zsMax } = zsMaxForBreaker(zCurve, zIn);
    const ik = zMeasured > 0 ? U0 / zMeasured : 0;
    return { ia, zsMax, ik, ok: zsMax > 0 && zMeasured > 0 ? zMeasured <= zsMax : null };
  }, [zCurve, zIn, zMeasured]);

  // --- 4. WLZ (linia zasilająca) ---
  const sizedFeeder = useMemo(
    () =>
      sizeFeeder({
        prad_A: wlzCurrentA,
        liczba_faz: wlzPhase,
        dlugosc_m: wlzLength > 0 ? wlzLength : undefined,
        sposob_ulozenia: wlzLayingMethod,
        temperatura_otoczenia_C: wlzAmbientC,
        obwodow_w_wiazce: wlzBundleCount,
        limit_spadku_pct: wlzDropLimit,
      }),
    [wlzCurrentA, wlzPhase, wlzLength, wlzLayingMethod, wlzAmbientC, wlzBundleCount, wlzDropLimit]
  );

  function loadWlzCurrentFromBalance() {
    setWlzCurrentA(Math.round((wlzPhase === "3" ? balance.demandCurrent3 : balance.demandCurrent1) * 10) / 10);
  }

  // --- 5. rezystancja uziemienia (układ TT) ---
  const groundingCheck = useMemo(() => {
    const raMax = maxGroundingResistance(ttIdnMa / 1000);
    return { raMax, ok: raMax > 0 && ttMeasuredRa > 0 ? ttMeasuredRa <= raMax : null };
  }, [ttIdnMa, ttMeasuredRa]);

  // --- 6. oświetlenie ---
  const lightCalc = useMemo(
    () =>
      calcLighting({
        roomAreaM2: roomA,
        luxRequired: lux,
        lumensPerFixture: lumPerOpr,
        maintenanceFactor: mf,
        utilizationFactor: uf,
      }),
    [roomA, lux, lumPerOpr, mf, uf]
  );

  const active = CALC_LIST.find((c) => c.id === activeCalc)!;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pe-display text-xl mb-1">Kalkulatory elektryczne</h2>
        <p className="text-sm text-slate-500">
          Szybkie, orientacyjne obliczenia pomocnicze do wstępnego projektowania instalacji.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <div className="space-y-1.5" style={{ width: 260, flexShrink: 0, flexGrow: 0 }}>
          {CALC_LIST.map((c) => {
            const Icon = c.icon;
            const on = activeCalc === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCalc(c.id)}
                className="w-full text-left p-3 rounded-lg flex items-start gap-2.5"
                style={on ? { background: "#2D5A8C10", border: "1px solid #2D5A8C" } : { background: "#fff", border: "1px solid #DCE2E8" }}
              >
                <Icon size={16} className="shrink-0 mt-0.5" style={{ color: on ? "#2D5A8C" : "#94A3B8" }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: on ? "#2D5A8C" : "#16202B" }}>
                    {c.label}
                  </div>
                  <div className="text-[11px] text-slate-500 leading-snug">{c.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ flex: "1 1 480px", minWidth: 320 }}>
          {activeCalc === "przewod" && (
            <Card title={active.label} icon={Zap} tag="obwód">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Rodzaj obwodu"
                  value={circuitKind}
                  onChange={(v) => setCircuitKind(v as CircuitKind)}
                  options={CIRCUIT_KIND_OPTIONS}
                />
                <Field label="Moc odbiornika" value={power} onChange={(v) => setPower(Number(v))} unit="W" />
                <Field
                  label="Zasilanie"
                  value={phase}
                  onChange={(v) => setPhase(v as "1" | "3")}
                  options={[
                    { value: "1", label: "1-fazowe 230V" },
                    { value: "3", label: "3-fazowe 400V" },
                  ]}
                />
                <Field label="Współczynnik cos φ" value={cosphi} onChange={(v) => setCosphi(Number(v))} step="0.05" />
              </div>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Trasa i warunki ułożenia</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Długość trasy (w jedną stronę)"
                  value={length}
                  onChange={(v) => setLength(Number(v))}
                  unit="m"
                />
                <Field
                  label="Sposób ułożenia"
                  value={layingMethod}
                  onChange={(v) => setLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                />
                <Field label="Temperatura otoczenia" value={ambientC} onChange={(v) => setAmbientC(Number(v))} unit="°C" />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={bundleCount}
                  onChange={(v) => setBundleCount(Number(v))}
                  step="1"
                />
              </div>
              <label className="mb-3 flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={motorStart}
                  onChange={(e) => setMotorStart(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Odbiornik z rozruchem silnikowym (pompa, lodówka, klimatyzacja) — charakterystyka C
              </label>

              <div className="mt-2 p-3 pe-result">
                <div className="text-xs text-slate-500 mb-1">Prąd obliczeniowy</div>
                <div className="pe-mono text-lg text-blueprint">{(sized.Ib_A ?? 0).toFixed(2)} A</div>
                {sized.przekroj_mm2 && sized.aparat ? (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">{sized.kabel}</span>
                    <span className="pe-chip pe-tag-blue">
                      wyłącznik {sized.aparat.charakterystyka}
                      {sized.aparat.In_A} {sized.aparat.bieguny}
                    </span>
                    <span className="pe-chip pe-tag-green">obc. dop. {sized.Iz_A} A</span>
                    {sized.spadek_napiecia_pct !== null && (
                      <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                        ΔU {sized.spadek_napiecia_pct}% (limit {sized.spadek_napiecia_limit_pct}%)
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-sm mt-2 flex items-center gap-1" style={{ color: "#A2352C" }}>
                    <AlertTriangle size={14} /> nie udało się dobrać — zobacz komunikat niżej
                  </div>
                )}
              </div>

              {sized.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {sized.ostrzezenia.map((w, i) => (
                    <div
                      key={i}
                      className="flex gap-2 rounded-md p-2.5 text-[11.5px] leading-relaxed"
                      style={{
                        background: w.level === "error" ? "#C6433A14" : "#C1793F14",
                        color: w.level === "error" ? "#A2352C" : "#8A5526",
                      }}
                    >
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <div>{w.message}</div>
                    </div>
                  ))}
                </div>
              )}

              <HowItWorks
                formulas={[
                  { label: "Prąd obliczeniowy — obwód 1-fazowy", eq: "Ib = P / (U × cos φ)", where: "P — moc czynna [W], U = 230 V, cos φ — współczynnik mocy" },
                  { label: "Prąd obliczeniowy — obwód 3-fazowy", eq: "Ib = P / (√3 × U × cos φ)", where: "U = 400 V (napięcie międzyfazowe)" },
                  { label: "Obciążalność po korekcie", eq: "Iz = Iz₀ × k1 × k2", where: "k1 — współczynnik temperatury otoczenia, k2 — współczynnik grupowania (liczba obwodów we wspólnej trasie)" },
                  { label: "Warunek doboru zabezpieczenia", eq: "Ib ≤ In ≤ Iz", where: "In — prąd znamionowy wyłącznika" },
                  { label: "Spadek napięcia — 1-fazowy / 3-fazowy", eq: "ΔU = (2·L·Ib·ρ)/S   |   ΔU = (√3·L·Ib·ρ)/S", where: "ρ = 0,0225 Ω·mm²/m — rezystywność miedzi przy 70°C (żyła nagrzana prądem roboczym, nie 20°C)" },
                ]}
                notes={[
                  "Kalkulator szuka NAJMNIEJSZEGO przekroju, który jednocześnie spełnia obciążalność (Ib ≤ In ≤ Iz) i limit spadku napięcia — 3% dla obwodów oświetleniowych, 5% dla pozostałych. To ten sam silnik doboru, który automatycznie liczy zakładka „Rozdzielnica” dla obwodów narysowanych na planie, więc oba miejsca zawsze dają ten sam wynik dla tych samych danych.",
                  "Obwód wymiarowany jest pod docelową obsadę, nie tylko pod dzisiejszą moc — obwód gniazd dostaje typowo B16, a oświetlenia B10, nawet jeśli chwilowy pobór jest dużo niższy.",
                  "Sposób ułożenia zmienia dopuszczalną obciążalność: przewód w ścianie ocieplonej termicznie grzeje się najbardziej (najostrzejszy przypadek), natynkowy chłodzi się najlepiej.",
                  "Bez podanej długości trasy (albo przy długości = 0) spadek napięcia NIE jest sprawdzany — dobór pokrywa wtedy wyłącznie obciążalność.",
                  "Wynik jest orientacyjny/edukacyjny — dobór do realizacji i odbioru wykonuje osoba z uprawnieniami, z uwzględnieniem rzeczywistej trasy kabla i warunków otoczenia.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "moc" && (
            <Card title={active.label} icon={Home} tag="bilans mocy">
              <div className="space-y-2 mb-3">
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <input
                      className="pe-input text-sm flex-1"
                      value={d.name}
                      onChange={(e) => setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)))}
                    />
                    <input
                      className="pe-input text-sm w-24 pe-mono"
                      type="number"
                      value={d.power}
                      onChange={(e) => setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, power: Number(e.target.value) } : x)))}
                    />
                    <span className="text-xs text-slate-400 w-6">W</span>
                    <button onClick={() => setDevices((ds) => ds.filter((x) => x.id !== d.id))} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setDevices((ds) => [...ds, { id: crypto.randomUUID(), name: "Nowy odbiornik", power: 1000 }])}
                  className="pe-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1"
                >
                  <Plus size={13} /> Dodaj odbiornik
                </button>
                <button
                  onClick={loadDevicesFromProject}
                  disabled={projectDevices.length === 0}
                  title={
                    projectDevices.length === 0
                      ? "Brak elementów na planie — narysuj instalację, żeby wczytać bilans stąd"
                      : "Zastąp listę mocą zainstalowaną obwodów wyliczonych z planu"
                  }
                  className="pe-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={13} /> Wczytaj z projektu
                </button>
              </div>
              <Field label="Współczynnik jednoczesności (ks)" value={ks} onChange={(v) => setKs(Number(v))} step="0.05" />
              <div className="mt-2 p-3 pe-result grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Moc zainstalowana</div>
                  <div className="pe-mono">{balance.sumPower.toFixed(0)} W</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Moc zapotrzebowana</div>
                  <div className="pe-mono text-copper">{balance.demandPower.toFixed(0)} W</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Prąd — 1-faz.</div>
                  <div className="pe-mono">{balance.demandCurrent1.toFixed(1)} A</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Prąd — 3-faz.</div>
                  <div className="pe-mono">{balance.demandCurrent3.toFixed(1)} A</div>
                </div>
              </div>
              <HowItWorks
                formulas={[
                  { label: "Moc zainstalowana", eq: "Pi = ΣP", where: "suma mocy znamionowych wszystkich odbiorników" },
                  { label: "Moc zapotrzebowana (szczytowa)", eq: "Pz = Pi × ks", where: "ks — współczynnik jednoczesności (0 < ks ≤ 1)" },
                  { label: "Prąd zapotrzebowany", eq: "I₁f = Pz / U   |   I₃f = Pz / (√3 × U)", where: "U = 230 V dla 1 fazy, 400 V dla 3 faz" },
                ]}
                notes={[
                  "„Wczytaj z projektu” zastępuje listę mocą zainstalowaną obwodów wyliczonych z elementów rozstawionych na planie (ten sam model obciążeń co w Rozdzielnicy) — to tylko punkt startowy, dopisz ręcznie odbiorniki, których nie ma na rysunku (np. piekarnik podłączony na stałe bez widocznego gniazda).",
                  "Współczynnik jednoczesności odzwierciedla fakt, że nie wszystkie odbiorniki pracują jednocześnie z pełną mocą.",
                  "Wartości orientacyjne ks dla domu jednorodzinnego: 0,6–0,8. Im więcej odbiorników, tym niższy współczynnik.",
                  "Moc zapotrzebowana służy do doboru mocy przyłączeniowej we wniosku do operatora sieci oraz zabezpieczenia przedlicznikowego.",
                  "Dla instalacji z pompą ciepła, ładowarką EV lub kuchenką indukcyjną warto przyjąć wyższy ks — te odbiorniki potrafią pracować równocześnie i długotrwale.",
                  "Kalkulator zakłada cos φ = 1. Przy dużym udziale silników rzeczywisty prąd będzie wyższy o 1/cos φ.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "wlz" && (
            <Card title={active.label} icon={Cable} tag="WLZ">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <div>
                  <Field label="Prąd obliczeniowy" value={wlzCurrentA} onChange={(v) => setWlzCurrentA(Number(v))} unit="A" />
                  <button
                    type="button"
                    onClick={loadWlzCurrentFromBalance}
                    className="pe-btn-ghost -mt-2 mb-3 text-xs px-2.5 py-1.5 flex items-center gap-1"
                  >
                    <Download size={13} /> Wczytaj z bilansu mocy
                  </button>
                </div>
                <Field
                  label="Zasilanie"
                  value={wlzPhase}
                  onChange={(v) => setWlzPhase(v as "1" | "3")}
                  options={[
                    { value: "1", label: "1-fazowe 230V" },
                    { value: "3", label: "3-fazowe 400V" },
                  ]}
                />
              </div>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Trasa i warunki ułożenia</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Długość trasy (w jedną stronę)" value={wlzLength} onChange={(v) => setWlzLength(Number(v))} unit="m" />
                <Field
                  label="Sposób ułożenia"
                  value={wlzLayingMethod}
                  onChange={(v) => setWlzLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                />
                <Field label="Temperatura otoczenia" value={wlzAmbientC} onChange={(v) => setWlzAmbientC(Number(v))} unit="°C" />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={wlzBundleCount}
                  onChange={(v) => setWlzBundleCount(Number(v))}
                  step="1"
                />
                <Field
                  label="Dopuszczalny spadek napięcia na WLZ"
                  value={wlzDropLimit}
                  onChange={(v) => setWlzDropLimit(Number(v))}
                  unit="%"
                  step="0.5"
                />
              </div>

              <div className="mt-2 p-3 pe-result">
                {sizedFeeder.przekroj_mm2 && sizedFeeder.aparat ? (
                  <div className="flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">{sizedFeeder.kabel}</span>
                    <span className="pe-chip pe-tag-blue">
                      wyłącznik {sizedFeeder.aparat.charakterystyka}
                      {sizedFeeder.aparat.In_A} {sizedFeeder.aparat.bieguny}
                    </span>
                    <span className="pe-chip pe-tag-green">obc. dop. {sizedFeeder.Iz_A} A</span>
                    {sizedFeeder.spadek_napiecia_pct !== null && (
                      <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
                        ΔU {sizedFeeder.spadek_napiecia_pct}% (limit {sizedFeeder.spadek_napiecia_limit_pct}%)
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-sm flex items-center gap-1" style={{ color: "#A2352C" }}>
                    <AlertTriangle size={14} /> nie udało się dobrać — zobacz komunikat niżej
                  </div>
                )}
              </div>

              {sizedFeeder.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {sizedFeeder.ostrzezenia.map((w, i) => (
                    <div
                      key={i}
                      className="flex gap-2 rounded-md p-2.5 text-[11.5px] leading-relaxed"
                      style={{
                        background: w.level === "error" ? "#C6433A14" : "#C1793F14",
                        color: w.level === "error" ? "#A2352C" : "#8A5526",
                      }}
                    >
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <div>{w.message}</div>
                    </div>
                  ))}
                </div>
              )}

              <HowItWorks
                formulas={[
                  { label: "Warunek doboru zabezpieczenia", eq: "Ib ≤ In ≤ Iz", where: "Iz = Iz₀ × k1 × k2 — obciążalność po współczynnikach temperatury i grupowania" },
                  { label: "Spadek napięcia — 1-fazowy / 3-fazowy", eq: "ΔU = (2·L·Ib·ρ)/S   |   ΔU = (√3·L·Ib·ρ)/S", where: "ρ = 0,0225 Ω·mm²/m przy 70°C, ten sam wzór co w doborze obwodu odbiorczego" },
                ]}
                notes={[
                  "Ten sam silnik doboru co „Dobór przewodu i zabezpieczenia” i Rozdzielnica (`sizeCircuit`/`sizeFeeder` w `lib/panel/sizing.ts`) — ta sama tablica obciążalności, te same współczynniki poprawkowe.",
                  "Minimalny przekrój WLZ przyjęto na 10 mm² — praktyka projektowa dla domu jednorodzinnego (kabel dźwiga cały budynek), NIE liczba wprost z normy.",
                  "Domyślny limit spadku napięcia na samej WLZ to 2%, węższy niż 3-5% dla obwodu odbiorczego — WLZ to tylko odcinek całej trasy do odbiornika, więc zostawia miejsce na spadek za rozdzielnicą. Można go zmienić powyżej.",
                  "Tablice dotyczą przewodu w budynku (pod tynkiem/w rurce/natynkowo) — NIE kabla ziemnego. Jeśli WLZ biegnie w ziemi od złącza kablowo-pomiarowego, ten kalkulator się nie sprawdzi — potrzebna inna metoda odniesienia.",
                  "„Wczytaj z bilansu mocy” bierze prąd zapotrzebowany (Pz) z kalkulatora „Bilans mocy budynku” dla wybranej tu liczby faz — uzupełnij najpierw listę odbiorników w tamtym kalkulatorze.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "petla" && (
            <Card title={active.label} icon={ClipboardCheck} tag="ochrona przeciwporażeniowa">
              <div className="grid sm:grid-cols-3 gap-x-4">
                <Field
                  label="Charakterystyka"
                  value={zCurve}
                  onChange={(v) => setZCurve(String(v))}
                  options={[
                    { value: "B", label: "B (5×In)" },
                    { value: "C", label: "C (10×In)" },
                    { value: "D", label: "D (20×In)" },
                  ]}
                />
                <Field label="Prąd znamionowy In" value={zIn} onChange={(v) => setZIn(Number(v))} unit="A" />
                <Field label="Zmierzona Zs" value={zMeasured} onChange={(v) => setZMeasured(Number(v))} unit="Ω" step="0.01" />
              </div>
              <div className="mt-2 p-3 pe-result grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Prąd zadziałania Ia</div>
                  <div className="pe-mono">{zCalc.ia.toFixed(0)} A</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Zs maksymalna</div>
                  <div className="pe-mono text-copper">{zCalc.zsMax ? zCalc.zsMax.toFixed(2) : "—"} Ω</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Prąd zwarcia Ik</div>
                  <div className="pe-mono">{zCalc.ik ? zCalc.ik.toFixed(0) : "—"} A</div>
                </div>
              </div>
              {zCalc.ok !== null && (
                <div
                  className="mt-2 p-3 rounded-lg text-sm flex items-start gap-2"
                  style={zCalc.ok ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}
                >
                  {zCalc.ok ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                  {zCalc.ok
                    ? "Warunek spełniony — zabezpieczenie zadziała w wymaganym czasie."
                    : "Warunek niespełniony — zmierzona Zs przekracza wartość dopuszczalną. Skróć obwód, zwiększ przekrój lub zmień charakterystykę zabezpieczenia."}
                </div>
              )}
              <HowItWorks
                formulas={[
                  { label: "Warunek samoczynnego wyłączenia zasilania", eq: "Zs × Ia ≤ U₀", where: "Zs — impedancja pętli zwarcia [Ω], Ia — prąd zadziałania [A], U₀ = 230 V" },
                  { label: "Maksymalna dopuszczalna impedancja", eq: "Zs max = U₀ / Ia", where: "wartość, której zmierzona Zs nie może przekroczyć" },
                  { label: "Prąd zadziałania wyzwalacza magnetycznego", eq: "Ia = k × In", where: "k = 5 dla char. B, 10 dla C, 20 dla D (górna granica pasma)" },
                  { label: "Spodziewany prąd zwarcia", eq: "Ik = U₀ / Zs", where: "prąd, jaki popłynie przy zwarciu L-PE" },
                ]}
                notes={[
                  "Wymagany czas wyłączenia w układzie TN dla obwodów odbiorczych do 32 A wynosi 0,4 s, a dla obwodów rozdzielczych — 5 s.",
                  "Przyjęto górną granicę pasma wyzwalania magnetycznego, co jest podejściem bezpiecznym — rzeczywisty wyłącznik zadziała przy prądzie nie większym niż ta wartość.",
                  "W praktyce pomiarowej często stosuje się dodatkowy zapas (np. mnożnik 0,8 dla Zs max), uwzględniający wzrost rezystancji przewodów przy nagrzaniu.",
                  "Jeśli warunek nie jest spełniony, ochronę można też zapewnić wyłącznikiem różnicowoprądowym — dla RCD 30 mA warunek Zs jest znacznie łagodniejszy.",
                  "Kalkulator dotyczy układu TN. Dla układu TT kryterium opiera się na rezystancji uziemienia, nie na impedancji pętli.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "uziemienieTT" && (
            <Card title={active.label} icon={Anchor} tag="ochrona przeciwporażeniowa">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Prąd różnicowy RCD (IΔn)"
                  value={ttIdnMa}
                  onChange={(v) => setTtIdnMa(Number(v))}
                  options={[
                    { value: "30", label: "30 mA" },
                    { value: "100", label: "100 mA" },
                    { value: "300", label: "300 mA" },
                    { value: "500", label: "500 mA" },
                  ]}
                />
                <Field label="Zmierzona rezystancja uziemienia RA" value={ttMeasuredRa} onChange={(v) => setTtMeasuredRa(Number(v))} unit="Ω" step="0.5" />
              </div>
              <div className="mt-2 p-3 pe-result">
                <div className="text-xs text-slate-500 mb-1">Maksymalna dopuszczalna RA</div>
                <div className="pe-mono text-lg text-copper">{groundingCheck.raMax.toFixed(0)} Ω</div>
              </div>
              {groundingCheck.ok !== null && (
                <div
                  className="mt-2 p-3 rounded-lg text-sm flex items-start gap-2"
                  style={groundingCheck.ok ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}
                >
                  {groundingCheck.ok ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                  {groundingCheck.ok
                    ? "Warunek spełniony — RCD zadziała, zanim napięcie dotykowe przekroczy 50 V."
                    : "Warunek niespełniony — zmierzona RA przekracza wartość dopuszczalną. Popraw uziom (dodatkowy uziomik, głębsze wbicie) albo zastosuj RCD o niższym IΔn."}
                </div>
              )}
              <HowItWorks
                formulas={[
                  { label: "Warunek ochrony przy dotyku pośrednim", eq: "RA × IΔn ≤ UL", where: `RA — rezystancja uziemienia [Ω], IΔn — prąd różnicowy znamionowy [A], UL = ${UL} V` },
                  { label: "Maksymalna dopuszczalna rezystancja uziemienia", eq: "RA max = UL / IΔn", where: "wartość, której zmierzona RA nie może przekroczyć" },
                ]}
                notes={[
                  "W układzie TT (w przeciwieństwie do TN — patrz „Impedancja pętli zwarcia”) skuteczność ochrony nie zależy od impedancji pętli zwarcia, tylko od rezystancji uziomu i prądu różnicowego wyłącznika, który ten uziom chroni.",
                  "Im niższy prąd IΔn wyłącznika różnicowoprądowego, tym łagodniejsze wymaganie wobec uziemienia — dla typowego RCD 30 mA wystarczy RA ≤ 1667 Ω, co w praktyce spełnia niemal każdy uziom.",
                  "300-500 mA to typowe wartości dla wyłączników różnicowoprądowych na początku instalacji (ochrona przeciwpożarowa, selektywność względem RCD 30 mA na obwodach odbiorczych) — tam wymaganie wobec RA jest już wyraźnie ostrzejsze.",
                  "Pomiar wykonuje się miernikiem rezystancji uziemienia (metoda techniczna, udarowa albo cęgowa) — patrz protokół „Pomiar rezystancji uziemienia” w zakładce Protokoły.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "oswietlenie" && (
            <Card title={active.label} icon={Calculator} tag="natężenie oświetlenia">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Powierzchnia pomieszczenia" value={roomA} onChange={(v) => setRoomA(Number(v))} unit="m²" />
                <Field label="Wymagane natężenie" value={lux} onChange={(v) => setLux(Number(v))} unit="lx" />
                <Field label="Strumień jednej oprawy" value={lumPerOpr} onChange={(v) => setLumPerOpr(Number(v))} unit="lm" />
                <Field label="Wsp. utrzymania (MF)" value={mf} onChange={(v) => setMf(Number(v))} step="0.05" />
                <Field label="Wsp. wykorzystania (UF)" value={uf} onChange={(v) => setUf(Number(v))} step="0.05" />
              </div>
              <div className="mt-2 p-3 pe-result grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">Wymagany strumień całkowity</div>
                  <div className="pe-mono">{lightCalc.requiredLumens.toFixed(0)} lm</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Liczba opraw</div>
                  <div className="pe-mono text-lg text-copper">{Math.ceil(lightCalc.fixtureCount) || 0} szt.</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                Orientacyjne wymagania: pokój dzienny 150–300 lx, kuchnia (blat) 500 lx, łazienka 200–300 lx, biuro 500 lx, korytarz 100 lx.
              </div>
              <HowItWorks
                formulas={[
                  { label: "Metoda strumienia świetlnego", eq: "Φ = (E × A) / (UF × MF)", where: "E — wymagane natężenie [lx], A — powierzchnia [m²], UF — wsp. wykorzystania, MF — wsp. utrzymania" },
                  { label: "Liczba opraw", eq: "n = Φ / Φ_oprawy", where: "Φ_oprawy — strumień świetlny jednej oprawy [lm] z karty katalogowej" },
                ]}
                notes={[
                  "Współczynnik wykorzystania UF zależy od geometrii pomieszczenia i odbicia ścian/sufitu — typowo 0,4–0,7. Dla jasnego pokoju o zwykłych proporcjach przyjmij 0,6.",
                  "Współczynnik utrzymania MF uwzględnia starzenie źródeł i zabrudzenie opraw — dla LED w warunkach domowych zwykle 0,8.",
                  "Metoda daje średnie natężenie na płaszczyźnie roboczej. Nie zastępuje obliczeń rozkładu światła, gdy istotna jest równomierność lub olśnienie.",
                  "Wynik zaokrąglaj w górę i rozmieszczaj oprawy równomiernie — odległość między nimi nie powinna przekraczać ok. 1,5× wysokości zawieszenia nad płaszczyzną roboczą.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "rcd" && (
            <Card title={active.label} icon={Info} tag="bezpieczeństwo">
              <ul className="text-sm space-y-2.5 text-slate-700">
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Obwody gniazd wtyczkowych — RCD 30 mA (typ AC/A), obowiązkowo.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Łazienka, kuchnia, tarasy — RCD 30 mA, zalecany osobny obwód i osobna ochrona.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Odbiorniki z elektroniką (np. pompy ciepła, falowniki) — rozważ typ A lub B wg zaleceń producenta.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Maks. 6–8 obwodów na jeden RCD 40A — powyżej dziel na kolejne różnicówki.
                </li>
                <li className="flex gap-2">
                  <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Rozważ wyłącznik przeciwprzepięciowy (typ 2) na początku instalacji.
                </li>
              </ul>
              <HowItWorks
                formulas={[
                  { label: "Warunek ochrony przy dotyku pośrednim", eq: "RA × IΔn ≤ UL", where: "RA — rezystancja uziemienia [Ω], IΔn — prąd różnicowy znamionowy [A], UL = 50 V" },
                  { label: "Maksymalna rezystancja uziemienia (RCD 30 mA)", eq: "RA ≤ 50 / 0,03 = 1667 Ω", where: "dlatego w układzie TT z RCD 30 mA wymagania wobec uziemienia są łagodne" },
                  { label: "Dobór prądu znamionowego RCD", eq: "In(RCD) ≥ ΣIn zabezpieczeń za nim", where: "RCD nie ma własnego zabezpieczenia zwarciowego — musi być chroniony nadprądowo" },
                ]}
                notes={[
                  "Typ AC reaguje tylko na prąd różnicowy sinusoidalny; typ A dodatkowo na pulsujący stały — dziś to praktyczne minimum przy zasilaczach impulsowych i elektronice.",
                  "Typ B jest wymagany m.in. przy ładowarkach pojazdów elektrycznych i falownikach, gdzie może pojawić się gładki prąd stały.",
                  "Rozdzielenie instalacji na kilka RCD ogranicza skutki zadziałania — awaria w jednym obwodzie nie pozbawia zasilania całego domu.",
                  "Prądy upływowe odbiorników sumują się. Zbyt wiele obwodów za jednym RCD 30 mA prowadzi do przypadkowych wyłączeń bez rzeczywistej usterki.",
                  "Wyłącznik różnicowoprądowy należy testować przyciskiem TEST co najmniej raz na pół roku — to jedyny sposób sprawdzenia, czy mechanizm nie zastygł.",
                ]}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
