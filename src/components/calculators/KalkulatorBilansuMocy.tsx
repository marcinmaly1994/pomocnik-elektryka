import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { formatLiczba } from "@/lib/calc/result";
import { bledyBilansuMocy, calcPowerBalance } from "@/lib/electrical";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { Card } from "./Card";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Bilans mocy budynku — moc zainstalowana i zapotrzebowana (ks), prąd do wniosku o przyłączenie.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 * Ten sam bilans liczy też `CalculatorsTab` dla przycisku „Wczytaj z bilansu mocy” w WLZ.
 */
export function KalkulatorBilansuMocy({ label }: { label: string }) {
  const devices = useCalculatorsStore((s) => s.devices);
  const ks = useCalculatorsStore((s) => s.ks);
  const ksCosfi = useCalculatorsStore((s) => s.ksCosfi);
  const setDevices = useCalculatorsStore((s) => s.setDevices);
  const patch = useCalculatorsStore((s) => s.patch);
  const setKs = (v: number) => patch({ ks: v });

  // --- 3. bilans mocy ---
  const balance = useMemo(() => calcPowerBalance(devices, ks, ksCosfi), [devices, ks, ksCosfi]);
  const bledyBilansu = useMemo(() => bledyBilansuMocy(devices, ks, ksCosfi), [devices, ks, ksCosfi]);

  return (
    <Card title={label} tag="bilans mocy">
      <div className="space-y-2 mb-3">
        {/* Na wąskim ekranie nazwa idzie na całą szerokość, a moc i kosz pod nią —
            w jednym rzędzie kosz wypadał za krawędź ekranu i strona przewijała się
            w bok (patrz bilans faz, ten sam układ). */}
        {devices.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-0 last:pb-0 sm:border-0 sm:pb-0 sm:flex-nowrap">
            <input
              className="pe-input text-sm w-full min-w-0 sm:w-auto sm:flex-1"
              aria-label="Nazwa odbiornika"
              value={d.name}
              onChange={(e) => setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)))}
            />
            <input
              className="pe-input text-sm w-24 pe-mono"
              type="number"
              aria-label={`Moc: ${d.name}`}
              title="Moc znamionowa tego odbiornika [W] — z tabliczki znamionowej."
              value={d.power}
              onChange={(e) => setDevices((ds) => ds.map((x) => (x.id === d.id ? { ...x, power: Number(e.target.value) } : x)))}
            />
            <span className="text-xs text-slate-400 w-6">W</span>
            <button
              onClick={() => setDevices((ds) => ds.filter((x) => x.id !== d.id))}
              aria-label={`Usuń odbiornik: ${d.name}`}
              className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 flex items-center justify-center ml-auto text-slate-400 hover:text-red-500 sm:ml-0"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm"
          onClick={() => setDevices((ds) => [...ds, { id: crypto.randomUUID(), name: "Nowy odbiornik", power: 1000 }])}
        >
          <Plus size={13} /> Dodaj odbiornik
        </Button>
      </div>
      <Field
        label="Współczynnik jednoczesności (ks)"
        value={ks}
        onChange={(v) => setKs(Number(v))}
        step="0.05"
        hint="Odzwierciedla, że nie wszystkie odbiorniki pracują naraz z pełną mocą. Orientacyjnie 0,6–0,8 dla domu jednorodzinnego — im więcej odbiorników, tym niższy. Podnieś go, jeśli masz pompę ciepła, ładowarkę EV albo kuchenkę indukcyjną (te potrafią pracować długo i równocześnie)."
      />
      <Field
        label="Współczynnik mocy cos φ"
        value={ksCosfi}
        onChange={(v) => patch({ ksCosfi: Number(v) })}
        step="0.05"
        hint="Wypadkowy cos φ instalacji. 1 dla odbiorników grzejnych (bojler, kuchenka, grzałki); przy dużym udziale silników, pomp ciepła i zasilaczy przyjmij niższy — prąd rośnie o 1/cos φ."
      />
      {bledyBilansu.length > 0 ? (
        <Alert variant="danger" role="alert" data-testid="bledy-bilansu" className="mt-2">
          <div className="mb-1 font-semibold">Popraw dane — wynik nie jest liczony:</div>
          <ul className="list-disc pl-5">
            {bledyBilansu.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Alert>
      ) : (
      <WynikGlowny
        wartosci={[
          { etykieta: "Moc zainstalowana", wartosc: formatLiczba(balance.sumPower, 0), jednostka: "W" },
          { etykieta: "Moc zapotrzebowana", wartosc: formatLiczba(balance.demandPower, 0), jednostka: "W" },
          { etykieta: "Prąd — 1-faz.", wartosc: formatLiczba(balance.demandCurrent1, 1), jednostka: "A" },
          { etykieta: "Prąd — 3-faz.", wartosc: formatLiczba(balance.demandCurrent3, 1), jednostka: "A" },
        ]}
      />
      )}
      <HowItWorks
        formulas={[
          { label: "Moc zainstalowana", eq: "Pi = ΣP", where: "suma mocy znamionowych wszystkich odbiorników" },
          { label: "Moc zapotrzebowana (szczytowa)", eq: "Pz = Pi × ks", where: "ks — współczynnik jednoczesności (0 < ks ≤ 1)" },
          { label: "Prąd zapotrzebowany", eq: "I₁f = Pz / (U · cos φ)   |   I₃f = Pz / (√3 · U · cos φ)", where: "U = 230 V dla 1 fazy, 400 V dla 3 faz" },
        ]}
        notes={[
          "Lista odbiorników jest wyłącznie Twoja — kalkulator nie zagląda do rysowanego rzutu. Wpisz odbiorniki tej instalacji, którą właśnie liczysz, łącznie z tymi bez widocznego gniazda (np. piekarnik podłączony na stałe).",
          "Współczynnik jednoczesności odzwierciedla fakt, że nie wszystkie odbiorniki pracują jednocześnie z pełną mocą.",
          "Wartości orientacyjne ks dla domu jednorodzinnego: 0,6–0,8. Im więcej odbiorników, tym niższy współczynnik.",
          "Moc zapotrzebowana służy do doboru mocy przyłączeniowej we wniosku do operatora sieci oraz zabezpieczenia przedlicznikowego.",
          "Dla instalacji z pompą ciepła, ładowarką EV lub kuchenką indukcyjną warto przyjąć wyższy ks — te odbiorniki potrafią pracować równocześnie i długotrwale.",
          "Domyślnie cos φ = 1 (odbiorniki grzejne). Przy dużym udziale silników, pomp ciepła i zasilaczy wpisz niższy — rzeczywisty prąd jest wyższy o 1/cos φ.",
          "Kalkulator nie dobiera zabezpieczenia przedlicznikowego ani mocy przyłączeniowej — te ustala operator sieci w warunkach przyłączenia. Podaje moc i prąd, z którymi idzie się do wniosku.",
        ]}
      />
    </Card>
  );
}
