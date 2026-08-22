import { useMemo, useRef, type ChangeEvent } from "react";
import { AlertTriangle, Download, Info, Upload } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { computeRcdGroups } from "@/lib/panel/circuits";
import { computeSizedCircuits, routeLengths } from "@/lib/panel/project";
import { scaleOf } from "@/lib/design";
import { computeCosts, parsePriceCsv, PRICE_LABELS, VAT_RATE } from "@/lib/costs";
import { downloadBlob, projectFileName } from "@/lib/pdf/download";

/**
 * Kosztorys instalacji elektrycznej — ilości materiałów i robocizny szacowane
 * z elementów na planie i obwodów (ta sama heurystyka co Rozdzielnica/Schemat,
 * kroki 6-8), ceny edytowalne ręcznie lub importowalne z CSV (`nazwa;cena`,
 * dopasowanie po słowach kluczowych). Ceny trzymane w store (`prices`), więc
 * przetrwają przełączanie zakładek.
 */
export function CostsTab() {
  const elements = useProjectStore((s) => s.draft.elements);
  const prices = useProjectStore((s) => s.prices);
  const setPrice = useProjectStore((s) => s.setPrice);
  const setPrices = useProjectStore((s) => s.setPrices);
  const projectName = useProjectStore((s) => s.projectName);
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const scales = useProjectStore((s) => s.scales);
  const fileRef = useRef<HTMLInputElement>(null);

  // Te same obwody co w Rozdzielnicy/Schemacie — przekroje z doboru trafiają wprost
  // do pozycji kosztorysu, więc zamawiany materiał zgadza się z rysunkiem.
  const mpu = scaleOf(scales, activeFloorId);
  const { circuits } = useMemo(() => computeSizedCircuits(elements, { metersPerUnit: mpu }), [elements, mpu]);
  const rcdGroups = useMemo(() => computeRcdGroups(circuits), [circuits]);
  const { quantities, cableLengthSource } = useMemo(
    () => computeCosts(elements, circuits, rcdGroups, { routeLengthsM: routeLengths(circuits, elements, mpu) }),
    [elements, circuits, rcdGroups, mpu]
  );

  const rows = Object.keys(PRICE_LABELS)
    .filter((k) => quantities[k] > 0)
    .map((k) => ({ key: k, label: PRICE_LABELS[k], qty: quantities[k], price: prices[k] ?? 0, total: quantities[k] * (prices[k] ?? 0) }));

  const grandTotal = rows.reduce((a, r) => a + r.total, 0);
  const vat = grandTotal * (VAT_RATE / 100);
  const gross = grandTotal + vat;
  // Pozycje z ceną 0 nie wchodzą do sumy, więc „RAZEM" potrafi wyglądać na komplet,
  // choć brakuje w nim np. całej robocizny. Zbieramy je, żeby powiedzieć to wprost —
  // aplikacja jest adresowana głównie do laików, którzy nie wychwycą tego sami.
  const unpriced = rows.filter((r) => r.qty > 0 && r.price === 0).map((r) => r.label.replace(/\s*\(.*?\)\s*$/, ""));

  function handleCsvImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const updates = parsePriceCsv(String(reader.result));
      if (Object.keys(updates).length) {
        setPrices(updates);
        alert(`Zaktualizowano ${Object.keys(updates).length} pozycję/e cenowe na podstawie pliku.`);
      } else {
        alert("Nie rozpoznano pozycji w pliku. Sprawdź format: nazwa,cena (CSV wyeksportowany np. z Excela).");
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function exportCsv() {
    const header = "Pozycja;Ilość;Cena jedn. (zł);Wartość (zł)\n";
    const body = rows.map((r) => `${r.label};${r.qty};${r.price.toFixed(2)};${r.total.toFixed(2)}`).join("\n");
    const summary =
      `\nRazem netto;;;${grandTotal.toFixed(2)}` +
      `\nVAT ${VAT_RATE}%;;;${vat.toFixed(2)}` +
      `\nRAZEM brutto;;;${gross.toFixed(2)}`;
    const blob = new Blob(["﻿" + header + body + summary], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, projectFileName("kosztorys", projectName, "csv"));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pe-display mb-1 text-xl">Kosztorys instalacji elektrycznej</h2>
          <p className="text-sm text-slate-500">Ceny domyślne są orientacyjne — edytuj je ręcznie lub zaimportuj z własnego cennika (CSV).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="pe-btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs">
            <Upload size={14} /> Importuj cennik CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
          <button onClick={exportCsv} className="pe-btn-copper flex items-center gap-1.5 px-3 py-2 text-xs">
            <Download size={14} /> Eksportuj kosztorys
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 py-1 text-xs text-slate-600" style={{ borderLeft: "3px solid #C1793F", paddingLeft: 12 }}>
        <Info size={15} className="mt-0.5 shrink-0 text-blueprint" />
        Import cen: wgraj plik CSV w formacie <span className="pe-mono">nazwa;cena</span> — aplikacja dopasuje pozycje po
        słowach kluczowych. Ceny nie pobierają się automatycznie ze stron sklepów.
      </div>

      {/* Skąd wzięły się metry kabla — bez tego kosztorys wygląda tak samo policzony
          niezależnie od tego, czy metraż pochodzi z planu, czy z ryczałtu na punkt. */}
      {rows.length > 0 && (
        <div
          className="flex items-start gap-2.5 py-1 text-xs"
          style={{
            borderLeft: `3px solid ${cableLengthSource === "plan" ? "#3B8C63" : "#C1793F"}`,
            paddingLeft: 12,
            color: cableLengthSource === "plan" ? "#2C6B4A" : "#8A5526",
          }}
        >
          {cableLengthSource === "plan" ? <Info size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          {cableLengthSource === "plan" ? (
            <span>
              Metry kabla policzone z tras po planie (od rozdzielnicy do każdego punktu, wzdłuż ścian,
              z naddatkiem na zejście i zapas montażowy).
            </span>
          ) : (
            <span>
              Metry kabla z ryczałtu (5 mb na punkt + 10 mb na obwód) — plan nie ma skalibrowanej skali
              albo brakuje na nim rozdzielnicy. Ustaw skalę i postaw rozdzielnicę, żeby policzyć realny metraż.
            </span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="pe-card p-8 text-center">
          <p className="text-sm text-slate-500">
            Kosztorys wyliczy się automatycznie po dodaniu elementów w zakładce „Zaprojektuj instalację”.
          </p>
        </div>
      ) : (
        <div className="pe-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500" style={{ borderColor: "#DCE2E8" }}>
                <th className="p-3">Pozycja</th>
                <th className="w-24 p-3">Ilość</th>
                <th className="w-32 p-3">Cena jedn.</th>
                <th className="w-32 p-3 text-right">Wartość</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                  <td className="p-3">{r.label}</td>
                  <td className="pe-mono p-3">{r.qty}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      value={r.price}
                      onChange={(e) => setPrice(r.key, Number(e.target.value) || 0)}
                      className="pe-input pe-mono w-24 text-sm"
                      step="0.5"
                    />
                  </td>
                  <td className="pe-mono p-3 text-right">{r.total.toFixed(2)} zł</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="p-3 pb-1 text-sm text-slate-500" colSpan={3}>
                  Razem netto
                </td>
                <td className="pe-mono p-3 pb-1 text-right text-sm">{grandTotal.toFixed(2)} zł</td>
              </tr>
              <tr>
                <td className="px-3 py-1 text-sm text-slate-500" colSpan={3}>
                  VAT {VAT_RATE}%
                </td>
                <td className="pe-mono px-3 py-1 text-right text-sm text-slate-500">{vat.toFixed(2)} zł</td>
              </tr>
              <tr>
                <td className="pe-display p-3 pt-1 font-bold" colSpan={3}>
                  RAZEM brutto
                </td>
                <td className="pe-display p-3 pt-1 text-right text-lg font-bold text-copper">{gross.toFixed(2)} zł</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {unpriced.length > 0 && (
        <div className="flex gap-2.5 rounded-md p-3 text-xs" style={{ background: "#C1793F14", color: "#8A5526" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <strong>Suma nie obejmuje wszystkiego.</strong> Pozycje z ceną 0 zł nie wchodzą do kosztorysu:{" "}
            {unpriced.join(", ")}. Uzupełnij ich ceny — zwłaszcza robocizna potrafi być większą częścią kosztu niż
            sam materiał.
          </div>
        </div>
      )}

      <div className="text-xs text-slate-400">
        Ilość przewodów i puszek jest szacowana na podstawie liczby punktów instalacyjnych i wygenerowanych obwodów
        (ok. 5 mb kabla na punkt + 10 mb do rozdzielnicy na obwód). Zweryfikuj długości na realnym rzucie budynku
        przed zakupem materiału.
      </div>
    </div>
  );
}
