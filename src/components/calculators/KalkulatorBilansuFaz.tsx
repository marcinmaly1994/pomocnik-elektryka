import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { obliczBilans, type Faza } from "@/lib/calc/loadBalance";
import { formatLiczba } from "@/lib/calc/result";
import { U0 } from "@/lib/panel/norms";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { FAZA_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Bilans faz i prąd w przewodzie neutralnym — asymetria plus 3. harmoniczna, która przy
 * odbiorach nieliniowych sumuje się w N. Silnik `lib/calc/loadBalance.ts`.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorBilansuFaz({ label }: { label: string }) {
  const bfOdbiory = useCalculatorsStore((s) => s.bfOdbiory);
  const bfH3Pct = useCalculatorsStore((s) => s.bfH3Pct);
  const setOdbioryFazowe = useCalculatorsStore((s) => s.setOdbioryFazowe);
  const patch = useCalculatorsStore((s) => s.patch);

  // --- bilans faz i prąd w przewodzie neutralnym ---
  const bilansFaz = useMemo(
    () =>
      obliczBilans({
        odbiory: bfOdbiory.map((o) => ({ nazwa: o.nazwa, moc_W: o.mocW, cosfi: o.cosfi, faza: o.faza })),
        U0_V: U0,
        Un_V: 400,
        udzialH3_pct: bfH3Pct,
      }),
    [bfOdbiory, bfH3Pct]
  );

  return (
    <Card title={label} tag="asymetria i przewód N">
      <Alert variant="info" role="note" className="mb-3 text-xs">
        Przy odbiorach nieliniowych (zasilacze impulsowe, LED, falowniki) 3. harmoniczna sumuje się w przewodzie
        neutralnym <strong>arytmetycznie</strong>, zamiast się znosić — prąd w N potrafi wtedy przekroczyć prąd
        fazowy nawet przy idealnie symetrycznym obciążeniu. W przewodzie N nie ma wyłącznika, więc nic tego
        przeciążenia nie wyłapie.
      </Alert>

      <div className="space-y-2 mb-3">
        {/* Na wąskim ekranie wiersz łamie się na dwa: nazwa i faza, pod nimi moc,
            cos φ i kosz (`order`). W jednym rzędzie pięć pól ściskało nazwę do
            pustego kwadracika ok. 26 px; z fazą w drugim rzędzie ucinało „L1".
            Kreska między odbiorami, bo przy dwóch liniach na odbiór sam odstęp
            nie mówił, która moc należy do której nazwy. */}
        {bfOdbiory.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-0 last:pb-0 sm:border-0 sm:pb-0 sm:flex-nowrap">
            <input
              className="pe-input text-sm order-1 min-w-0 flex-1 basis-40 sm:order-0 sm:basis-auto"
              aria-label="Nazwa odbioru"
              value={o.nazwa}
              onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, nazwa: e.target.value } : x)))}
            />
            <input
              className="pe-input text-sm order-3 w-20 pe-mono sm:order-0"
              type="number"
              aria-label={`Moc: ${o.nazwa}`}
              title="Moc czynna odbioru [W] — z tabliczki znamionowej."
              value={o.mocW}
              onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, mocW: Number(e.target.value) } : x)))}
            />
            <span className="order-3 text-xs text-slate-400 sm:order-0">W</span>
            <input
              className="pe-input text-sm order-3 w-16 pe-mono sm:order-0"
              type="number"
              step="0.05"
              aria-label={`cos φ: ${o.nazwa}`}
              title="Współczynnik mocy odbiornika — z tabliczki znamionowej (1,0 dla grzałek, niżej dla silników i elektroniki)."
              value={o.cosfi}
              onChange={(e) => setOdbioryFazowe((ds) => ds.map((x) => (x.id === o.id ? { ...x, cosfi: Number(e.target.value) } : x)))}
            />
            <select
              // Stałe w-28: pole z własną strzałką (padding-right 2rem) potrzebuje ok. 112 px,
              // żeby najdłuższa opcja („3-fazowy”) się mieściła — i przy 16 px (telefon), i
              // przy 14 px (od md); węższe w-24 ucinało napis (zmierzone: 57 px tekstu na 52 px).
              className="pe-input pe-select order-2 w-28 sm:order-0 text-base md:text-sm"
              aria-label={`Faza: ${o.nazwa}`}
              title="Do której fazy podłączony jest ten odbiór — albo „3-fazowy”, jeśli obciąża wszystkie trzy równo."
              value={o.faza ?? "3f"}
              onChange={(e) =>
                setOdbioryFazowe((ds) =>
                  ds.map((x) => (x.id === o.id ? { ...x, faza: e.target.value === "3f" ? null : (e.target.value as Faza) } : x))
                )
              }
            >
              {FAZA_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setOdbioryFazowe((ds) => ds.filter((x) => x.id !== o.id))}
              aria-label={`Usuń odbiór: ${o.nazwa}`}
              className="order-3 ml-auto sm:order-0 sm:ml-0 pointer-coarse:min-h-11 pointer-coarse:min-w-11 flex items-center justify-center text-slate-400 hover:text-red-500"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm"
          onClick={() =>
            setOdbioryFazowe((ds) => [...ds, { id: crypto.randomUUID(), nazwa: "Nowy odbiór", mocW: 1000, cosfi: 1, faza: "L1" }])
          }
        >
          <Plus size={13} /> Dodaj odbiór
        </Button>
      </div>
      <Field
        label="Udział 3. harmonicznej w prądzie fazowym"
        value={bfH3Pct}
        onChange={(v) => patch({ bfH3Pct: Number(v) })}
        unit="%"
        step="5"
        hint="0% dla odbiorów LINIOWYCH (grzałki, silniki bez elektroniki). Dla zasilaczy impulsowych, opraw LED i falowników realnie to często 60–90% — bez tej wartości prąd w przewodzie N wyjdzie zaniżony."
      />

      {bilansFaz.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Prąd w przewodzie neutralnym", wartosc: formatLiczba(bilansFaz.wartosci.IN_calkowity_A, 2), jednostka: "A" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">
              L1 {formatLiczba(bilansFaz.wartosci.prady.L1, 1)} A · L2 {formatLiczba(bilansFaz.wartosci.prady.L2, 1)} A · L3{" "}
              {formatLiczba(bilansFaz.wartosci.prady.L3, 1)} A
            </Badge>
            <Badge variant="info">asymetria {formatLiczba(bilansFaz.wartosci.asymetria_pct, 1)}%</Badge>
            <Badge variant="success">S {formatLiczba(bilansFaz.wartosci.S_VA / 1000, 2)} kVA</Badge>
            <Badge>
              cosφ {formatLiczba(bilansFaz.wartosci.cosfi, 3)}
            </Badge>
          </div>
        </WynikGlowny>
      )}
      <CalcResultView wynik={bilansFaz} />
    </Card>
  );
}
