import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { formatLiczba } from "@/lib/calc/result";
import { impedancjaTransformatora, obliczPradyZwarciowe, obliczWytrzymaloscZwarciowa, type CelZwarcia } from "@/lib/calc/shortCircuit";
import type { Izolacja, Material } from "@/lib/norms/conductors";
import { U0 } from "@/lib/panel/norms";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { CEL_ZWARCIA_OPTIONS, IZOLACJA_OPTIONS, MATERIAL_OPTIONS, SZEREG_PELNY_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Prądy zwarciowe (PN-EN 60909-0) i wytrzymałość zwarciowa cieplna przewodu.
 * Współczynnik napięciowy c wynika z celu obliczenia (1,05 dobór aparatów, 0,95 ochrona).
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorZwarcia({ label }: { label: string }) {
  const zwCel = useCalculatorsStore((s) => s.zwCel);
  const zwSnKVA = useCalculatorsStore((s) => s.zwSnKVA);
  const zwUkPct = useCalculatorsStore((s) => s.zwUkPct);
  const zwUnV = useCalculatorsStore((s) => s.zwUnV);
  const zwStratyCuW = useCalculatorsStore((s) => s.zwStratyCuW);
  const zwZsOhm = useCalculatorsStore((s) => s.zwZsOhm);
  const zwRdoX = useCalculatorsStore((s) => s.zwRdoX);
  const zwCzasS = useCalculatorsStore((s) => s.zwCzasS);
  const zwPrzekroj = useCalculatorsStore((s) => s.zwPrzekroj);
  const zwMaterial = useCalculatorsStore((s) => s.zwMaterial);
  const zwIzolacja = useCalculatorsStore((s) => s.zwIzolacja);
  const patch = useCalculatorsStore((s) => s.patch);

  // --- prądy zwarciowe ---
  const trafo = useMemo(
    () => impedancjaTransformatora({ Sn_VA: zwSnKVA * 1000, uk_pct: zwUkPct, Un_V: zwUnV, straty_Cu_W: zwStratyCuW }),
    [zwSnKVA, zwUkPct, zwUnV, zwStratyCuW]
  );
  const zwarcie = useMemo(
    () =>
      obliczPradyZwarciowe({
        cel: zwCel,
        Un_V: zwUnV,
        U0_V: U0,
        Zk_ohm: trafo.wartosci?.Zt_ohm ?? 0,
        Zs_ohm: zwZsOhm > 0 ? zwZsOhm : undefined,
        R_do_X: zwRdoX >= 0 ? zwRdoX : undefined,
      }),
    [zwCel, zwUnV, trafo.wartosci?.Zt_ohm, zwZsOhm, zwRdoX]
  );
  const wytrzymalosc = useMemo(
    () =>
      obliczWytrzymaloscZwarciowa({
        Ik_A: zwarcie.wartosci?.Ik3_A ?? 0,
        czas_s: zwCzasS,
        material: zwMaterial,
        izolacja: zwIzolacja,
        przekroj_mm2: zwPrzekroj,
      }),
    [zwarcie.wartosci?.Ik3_A, zwCzasS, zwMaterial, zwIzolacja, zwPrzekroj]
  );

  return (
    <Card title={label} tag="PN-EN 60909">
      <Alert variant="info" role="note" className="mb-3 text-xs">
        Współczynnik napięciowy <strong>c wynika z celu obliczenia</strong>, a nie z osobnego pola: do doboru
        aparatów liczy się najgorszy przypadek największego prądu (c = 1,05), a do ochrony przeciwporażeniowej —
        najmniejszego (c = 0,95). Pomylenie ich daje wynik pozornie poprawny i całkowicie nieprzydatny.
      </Alert>

      <Field
        label="Cel obliczenia"
        value={zwCel}
        onChange={(v) => patch({ zwCel: v as CelZwarcia })}
        options={CEL_ZWARCIA_OPTIONS}
      />

      <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Transformator zasilający</div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Moc znamionowa Sn"
          value={zwSnKVA}
          onChange={(v) => patch({ zwSnKVA: Number(v) })}
          unit="kVA"
          hint="Moc pozorna transformatora — z jego tabliczki znamionowej (typowo 100–1000 kVA dla stacji SN/nn zasilających budynki)."
        />
        <Field
          label="Napięcie zwarcia uk"
          value={zwUkPct}
          onChange={(v) => patch({ zwUkPct: Number(v) })}
          unit="%"
          step="0.1"
          hint="Z tabliczki znamionowej transformatora (oznaczenie „uk” albo „Uz”) — typowo 4–6% dla transformatorów rozdzielczych SN/nn. Mówi, jaką część napięcia znamionowego trzeba przyłożyć, żeby popłynął prąd znamionowy przy zwartym uzwojeniu wtórnym: im MNIEJSZE uk, tym WIĘKSZY prąd zwarcia."
        />
        <Field
          label="Napięcie międzyfazowe Un"
          value={zwUnV}
          onChange={(v) => patch({ zwUnV: Number(v) })}
          unit="V"
          hint="Napięcie znamionowe strony wtórnej (nn) transformatora — w Polsce standardowo 400 V."
        />
        <Field
          label="Straty obciążeniowe ΔPCu (0 = pomiń)"
          value={zwStratyCuW}
          onChange={(v) => patch({ zwStratyCuW: Number(v) })}
          unit="W"
          hint="Straty mocy w uzwojeniach przy obciążeniu znamionowym — z tabliczki znamionowej albo protokołu prób transformatora. Bez tej wartości wynik pomija rezystancję transformatora, co lekko zawyża obliczony prąd zwarcia."
        />
      </div>

      <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Miejsce zwarcia</div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Impedancja pętli Zs (0 = pomiń Ik1)"
          value={zwZsOhm}
          onChange={(v) => patch({ zwZsOhm: Number(v) })}
          unit="Ω"
          step="0.01"
          hint="Impedancja pętli zwarcia L-PE w miejscu zwarcia — z pomiaru miernikiem instalacyjnym albo z kalkulatora „Impedancja pętli zwarcia”. Zostaw 0, żeby pominąć obliczenie zwarcia jednofazowego Ik1."
        />
        <Field
          label="Stosunek R/X (do prądu udarowego)"
          value={zwRdoX}
          onChange={(v) => patch({ zwRdoX: Number(v) })}
          step="0.01"
          hint="Stosunek rezystancji do reaktancji całego obwodu od źródła do miejsca zwarcia — policzysz go w kalkulatorze „Impedancja przewodu”. Wpływa tylko na prąd udarowy, nie na wartość skuteczną zwarcia."
        />
      </div>

      {trafo.wartosci && zwarcie.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Prąd zwarcia trójfazowego", wartosc: formatLiczba(zwarcie.wartosci.Ik3_A / 1000, 2), jednostka: "kA" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">Zt {formatLiczba(trafo.wartosci.Zt_ohm * 1000, 2)} mΩ</Badge>
            <Badge variant="info">Ik2 {formatLiczba(zwarcie.wartosci.Ik2_A / 1000, 2)} kA</Badge>
            {zwarcie.wartosci.Ik1_A !== null && (
              <Badge variant="info">Ik1 {formatLiczba(zwarcie.wartosci.Ik1_A, 0)} A</Badge>
            )}
            {zwarcie.wartosci.ip_A !== null && (
              <Badge variant="success">ip {formatLiczba(zwarcie.wartosci.ip_A / 1000, 2)} kA</Badge>
            )}
            <Badge>
              c = {formatLiczba(zwarcie.wartosci.c, 2)}
            </Badge>
          </div>
          <div className="mt-2 text-xs leading-relaxed text-slate-500">
            Wymagana zdolność zwarciowa aparatu w tym miejscu: Icn ≥{" "}
            <strong>{formatLiczba(zwarcie.wartosci.Ik3_A / 1000, 2)} kA</strong> (dobieraj z c = 1,05).
          </div>
        </WynikGlowny>
      )}

      {/* Błąd danych transformatora wyklucza policzenie zwarcia, więc
          pokazujemy WTEDY jego komunikat — inaczej użytkownik widziałby
          „impedancja musi być większa od zera" zamiast przyczyny. */}
      {trafo.bledy.length > 0 ? <CalcResultView wynik={trafo} /> : <CalcResultView wynik={zwarcie} />}

      <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">
        Wytrzymałość zwarciowa cieplna przewodu (S ≥ I·√t / k)
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Czas trwania zwarcia"
          value={zwCzasS}
          onChange={(v) => patch({ zwCzasS: Number(v) })}
          unit="s"
          step="0.01"
          hint="Rzeczywisty czas, przez jaki płynie prąd zwarciowy zanim zabezpieczenie zadziała — odczytaj z charakterystyki wyzwalania wyłącznika/wkładki dla tego prądu, albo przyjmij maksymalny czas wyłączenia wg normy (0,4 s dla obwodu odbiorczego TN)."
        />
        <Field
          label="Przekrój żyły"
          value={String(zwPrzekroj)}
          onChange={(v) => patch({ zwPrzekroj: Number(v) })}
          options={SZEREG_PELNY_OPTIONS}
        />
        <Field
          label="Materiał"
          value={zwMaterial}
          onChange={(v) => patch({ zwMaterial: v as Material })}
          options={MATERIAL_OPTIONS}
        />
        <Field
          label="Izolacja"
          value={zwIzolacja}
          onChange={(v) => patch({ zwIzolacja: v as Izolacja })}
          options={IZOLACJA_OPTIONS}
          hint="Sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE) — decyduje o współczynniku k wytrzymałości zwarciowej."
        />
      </div>
      {wytrzymalosc.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Minimalny przekrój ze względu na zwarcie", wartosc: formatLiczba(wytrzymalosc.wartosci.minPrzekroj_mm2, 2), jednostka: "mm²" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">k = {wytrzymalosc.wartosci.k}</Badge>
            {wytrzymalosc.wartosci.maksCzas_s !== null && (
              <Badge variant="info">
                t max dla {String(zwPrzekroj).replace(".", ",")} mm² = {formatLiczba(wytrzymalosc.wartosci.maksCzas_s, 3)} s
              </Badge>
            )}
          </div>
        </WynikGlowny>
      )}
      <CalcResultView wynik={wytrzymalosc} />
    </Card>
  );
}
