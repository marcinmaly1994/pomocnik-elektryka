import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, ArrowLeft, Download, FileText, Info, Upload, X } from "lucide-react";
import { useOpcjeDoboru, useProjectStore } from "@/store/useProjectStore";
import { computeRcdGroups } from "@/lib/panel/circuits";
import { computeSizedCircuits, lowVoltageLengths, routeSummaries } from "@/lib/panel/project";
import { ZAPAS_MONTAZOWY_M } from "@/lib/panel/norms";
import { computeCosts, kosztorysRows, parsePriceCsv, pozycjeBezCeny, VAT_RATE } from "@/lib/costs";
import { downloadBlob, projectFileName } from "@/lib/pdf/download";
import { buildCostsDoc, buildCostsPdf } from "@/lib/pdf/costs";
import { zarejestrujProducenta } from "@/lib/pdf/rejestr";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { resolveDocHeader } from "@/lib/docHeader";
import { Button } from "@/components/ui/button";
import { useRoute } from "@/hooks/useRoute";

/**
 * Kosztorys instalacji elektrycznej — ilości materiałów i robocizny szacowane
 * z elementów na planie i obwodów (ta sama heurystyka co Rozdzielnica/Schemat,
 * kroki 6-8), ceny edytowalne ręcznie lub importowalne z CSV (`nazwa;cena`,
 * dopasowanie po słowach kluczowych). Wartość pojedynczej pozycji da się też wpisać
 * wprost — wtedy zastępuje rachunek ilość × cena (patrz `CostOverrides`), bo oferty
 * podają część pozycji ryczałtem. Poprawić da się też ILOŚĆ — jest szacowana z rzutu
 * (patrz `QtyOverrides`), a aplikacja sama prosi o jej weryfikację. Ceny i poprawki
 * trzymane w store (`prices`, `costOverrides`, `qtyOverrides`), więc przetrwają
 * przełączanie zakładek i zapis projektu.
 */
export function CostsTab() {
  const elements = useProjectStore((s) => s.draft.elements);
  const roomShapes = useProjectStore((s) => s.draft.roomShapes);
  // Geometria CALEGO budynku — z niej dobor liczy bieg poziomy trasy, czyli te sama
  // droge, ktora widac na rzucie. Bez niej zostawal szacunek Manhattan, KROTSZY od
  // trasy rzeczywistej, wiec zanizajacy spadek napiecia (patrz `estimateRoutes`).
  const walls = useProjectStore((s) => s.draft.walls);
  const openings = useProjectStore((s) => s.draft.openings);
  const floors = useProjectStore((s) => s.floors);
  const geometria = useMemo(() => ({ walls, roomShapes, openings }), [walls, roomShapes, openings]);
  const prices = useProjectStore((s) => s.prices);
  const setPrice = useProjectStore((s) => s.setPrice);
  const setPrices = useProjectStore((s) => s.setPrices);
  const costOverrides = useProjectStore((s) => s.costOverrides);
  const setCostOverride = useProjectStore((s) => s.setCostOverride);
  const qtyOverrides = useProjectStore((s) => s.qtyOverrides);
  const setQtyOverride = useProjectStore((s) => s.setQtyOverride);
  const projectName = useProjectStore((s) => s.projectName);
  const rawDocHeader = useProjectStore((s) => s.docHeader);
  // Nazwa projektu jako domyślny „Obiekt" — dzięki temu tabliczka rysunkowa i nazwa
  // pliku są wypełnione nawet bez wizyty w zakładce Protokoły (ten sam wzorzec co
  // w Rozdzielnicy).
  const docHeader = resolveDocHeader(rawDocHeader, projectName);
  const [podgladPdf, setPodgladPdf] = useState(false);
  // Pusty kosztorys odsyła wprost do Instalacji. Hook wolno wywołać w kilku
  // komponentach naraz — każdy dostaje własną subskrypcję i ten sam odczyt z adresu
  // (patrz komentarz przy `useRoute`).
  const [, nawiguj] = useRoute();
  const scales = useProjectStore((s) => s.scales);
  const fileRef = useRef<HTMLInputElement>(null);

  // Te same obwody co w Rozdzielnicy/Schemacie — przekroje z doboru trafiają wprost
  // do pozycji kosztorysu, więc zamawiany materiał zgadza się z rysunkiem. Skale idą
  // CAŁĄ MAPĄ, bo obwód potrafi sięgać kilku pięter (patrz `estimateRoutesByFloor`).
  const opcjeDoboru = useOpcjeDoboru();
  const { circuits } = useMemo(
    () => computeSizedCircuits(elements, opcjeDoboru, roomShapes),
    [elements, opcjeDoboru, roomShapes]
  );
  const rcdGroups = useMemo(() => computeRcdGroups(circuits), [circuits]);
  /** Metraż z ROZBICIEM na zapasy montażowe — patrz `routeSummaries` i akapit pod tabelą. */
  const trasy = useMemo(
    () => routeSummaries(circuits, elements, scales, geometria, floors, opcjeDoboru.zapas_na_punkt_m),
    [circuits, elements, scales, geometria, floors, opcjeDoboru.zapas_na_punkt_m]
  );
  const zapasRazemM = useMemo(() => [...trasy.values()].reduce((a, r) => a + r.zapasM, 0), [trasy]);
  /** Niskoprądówka łączy się GWIAZDĄ — każdy punkt własnym kablem — więc liczy się
   *  osobno od obwodów (patrz `lowVoltageLengths`). `null` = nie ma od czego mierzyć. */
  const niskopradowe = useMemo(() => lowVoltageLengths(elements, opcjeDoboru), [elements, opcjeDoboru]);
  const { quantities, cableLengthSource } = useMemo(
    () =>
      computeCosts(elements, circuits, rcdGroups, {
        routeLengthsM: new Map([...trasy].map(([id, r]) => [id, r.totalM])),
        lvLengthsM: niskopradowe ?? undefined,
      }),
    [elements, circuits, rcdGroups, trasy, niskopradowe]
  );

  const rows = kosztorysRows(quantities, prices, costOverrides, qtyOverrides);
  /** Zgloszenie kosztorysu do kompletu dokumentacji — patrz lib/pdf/rejestr.ts. */
  useEffect(() => zarejestrujProducenta("kosztorys", async () => buildCostsDoc(rows, docHeader)));

  const grandTotal = rows.reduce((a, r) => a + r.value, 0);
  const vat = grandTotal * (VAT_RATE / 100);
  const gross = grandTotal + vat;
  // Pozycje o zerowej wartości nie wchodzą do sumy, więc „RAZEM" potrafi wyglądać na
  // komplet, choć brakuje w nim np. całej robocizny. Zbieramy je, żeby powiedzieć to
  // wprost — aplikacja jest adresowana głównie do laików, którzy nie wychwycą tego sami.
  const unpriced = pozycjeBezCeny(rows);
  /** Czy w kosztorysie w ogóle jest niskoprądówka — bez niej zdanie o niej byłoby
   *  odpowiedzią na pytanie, którego nikt nie zadał. */
  const niskopradoweWKosztorysie = (quantities.kabelLan ?? 0) > 0 || (quantities.kabelKoncentryk ?? 0) > 0;

  /**
   * Pusty ekran, dopóki nie ma czego wyceniać — ten sam wzorzec co w Rozdzielnicy
   * (patrz `PanelTab`), która miała go od początku, a Kosztorys nie.
   *
   * Dotąd pusty projekt dostawał TU pełny warsztat kosztorysu: pasek z importem
   * cennika i eksportem do PDF, akapit o formacie CSV, ostrzeżenie o metrach kabla
   * „z ryczałtu" i tabelę z jedną puszką rozgałęźną za 6,15 zł brutto. Puszka była
   * skutkiem `|| 1` przy liczeniu pomieszczeń w `computeCosts` (naprawione tam),
   * ale sam warsztat i tak wstawał nad pustą tabelą, zanim cokolwiek narysowano.
   *
   * Wcześniejszy pusty ekran istniał (`rows.length === 0` niżej), tylko nigdy się nie
   * pokazywał — ta jedna widmowa pozycja wystarczała, żeby lista nie była pusta.
   *
   * Stoi PO wszystkich hookach, więc zgłoszenie producenta do kompletu dokumentacji
   * (`zarejestrujProducenta` wyżej) dzieje się tak samo na pustym projekcie: komplet
   * ma dostać kosztorys — choćby zerowy — a nie przestać go widzieć.
   */
  if (rows.length === 0) {
    return (
      <div className="pe-card p-8 text-center">
        <h2 className="pe-display mb-2 text-xl">Kosztorys instalacji elektrycznej</h2>
        <p className="mx-auto max-w-lg text-sm text-slate-500">
          Kosztorys policzy się sam, gdy rozstawisz elementy w zakładce „Instalacja” — materiał i robocizna
          biorą się z punktów na rzucie i z policzonych obwodów.
        </p>
        <p className="mx-auto mt-4 max-w-lg text-sm text-slate-500">
          Ceny domyślne są orientacyjne. Po wycenie podmienisz je ręcznie albo zaimportujesz własny cennik z CSV.
        </p>
        <Button variant="copper" size="sm" onClick={() => nawiguj("projekt")} className="mt-4">
          <ArrowLeft size={14} /> Wróć do Instalacji
        </Button>
      </div>
    );
  }

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
    // Kolumna „Uwaga" jest po to, żeby odbiorca pliku nie mnożył ilości przez cenę
    // i nie dziwił się, że nie wychodzi mu wartość — pozycja ryczałtowa mówi to wprost.
    const header = "Pozycja;Ilość;Cena jedn. (zł);Wartość (zł);Uwaga\n";
    const body = rows
      .map((r) => `${r.label};${r.qty};${r.price.toFixed(2)};${r.value.toFixed(2)};${r.overridden ? "wartość wpisana ręcznie (ryczałt)" : ""}`)
      .join("\n");
    const summary =
      `\nRazem netto;;;${grandTotal.toFixed(2)};` +
      `\nVAT ${VAT_RATE}%;;;${vat.toFixed(2)};` +
      `\nRAZEM brutto;;;${gross.toFixed(2)};`;
    const blob = new Blob(["﻿" + header + body + summary], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, projectFileName("kosztorys", projectName, "csv"));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pe-display mb-1 text-xl">Kosztorys instalacji elektrycznej</h2>
          <p className="text-sm text-slate-500">
            Ceny domyślne są orientacyjne — edytuj je ręcznie, zaimportuj z własnego cennika (CSV) albo wpisz
            gotową wartość pozycji, jeśli masz ją z oferty ryczałtem.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="pe-btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs">
            <Upload size={14} /> Importuj cennik CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
          {/* CSV zostaje dla tych, którzy liczą dalej w arkuszu; PDF jest tym, co wysyła
              się klientowi — stąd on dostaje przycisk główny. Pobranie dzieje się
              z poziomu PODGLĄDU, tak jak przy pozostałych eksportach: nikt nie ma wysłać
              dokumentu, na który sam nie spojrzał. */}
          <button onClick={exportCsv} className="pe-btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs">
            <Download size={14} /> Eksportuj CSV
          </button>
          <button
            onClick={() => setPodgladPdf(true)}
            className="pe-btn-copper flex items-center gap-1.5 px-3 py-2 text-xs"
          >
            <FileText size={14} /> Kosztorys do PDF
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 py-1 text-xs text-slate-600" style={{ borderLeft: "3px solid #C1793F", paddingLeft: 12 }}>
        <Info size={15} className="mt-0.5 shrink-0 text-blueprint" />
        Import cen: wgraj plik CSV w formacie <span className="pe-mono">nazwa;cena</span> — aplikacja dopasuje pozycje po
        słowach kluczowych. Ceny nie pobierają się automatycznie ze stron sklepów.
      </div>

      {/*
        Niskoprądówka OSOBNO, a nie w zdaniu o zasilaniu: ma wlasny los i wlasny warunek.
        Liczy sie gwiazda od rozdzielnicy, wiec bywa zmierzona wtedy, gdy zasilanie i tak
        idzie ryczaltem — i na odwrót. Jedno zdanie na oba przypadki mylilo by, ktore
        metry sa policzone.
      */}
      {niskopradoweWKosztorysie && (
        <div
          className="flex items-start gap-2.5 py-1 text-xs"
          style={{
            borderLeft: `3px solid ${niskopradowe ? "#3B8C63" : "#C1793F"}`,
            paddingLeft: 12,
            color: niskopradowe ? "#2C6B4A" : "#8A5526",
          }}
        >
          {niskopradowe ? <Info size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          {niskopradowe ? (
            <span>
              Przewody niskoprądowe (LAN, koncentryk) policzone z planu — osobnym kablem do
              każdego punktu, bo to połączenia punkt-punkt, a nie obwód.
              {/* Od CZEGO mierzone, bo to zmienia wynik przy każdym punkcie naraz:
                  szafka bywa w zupełnie innym miejscu niż tablica z bezpiecznikami. */}
              {niskopradowe.odSzafki ? (
                <> Mierzone od szafki teletechnicznej.</>
              ) : (
                <>
                  {" "}
                  Mierzone od <strong>rozdzielnicy</strong>, bo na planie nie ma szafki teletechnicznej —
                  postaw ją tam, gdzie naprawdę stoi router, żeby metraż nie był domysłem.
                </>
              )}
            </span>
          ) : (
            <span>
              Przewody niskoprądowe (LAN, koncentryk) nadal z ryczałtu 15 mb na punkt — nie ma ich
              od czego mierzyć. Ustaw skalę i postaw rozdzielnicę, żeby policzyć realny metraż.
            </span>
          )}
        </div>
      )}

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
              {/*
                Zapas ma NAZWĘ i liczbę, bo to pozycja, którą da się zakwestionować: przy stu
                punktach robi się z niego kilkaset metrów kabla, a dotąd siedział w sumie
                nierozróżnialny od zmierzonej trasy. Ustawia się go tam, gdzie resztę założeń
                o instalacji — w Rozdzielnicy — żeby jedna liczba nie miała dwóch pokręteł.
              */}
              {zapasRazemM > 0 && (
                <>
                  {" "}
                  Z tego <strong>{Math.round(zapasRazemM)} m</strong> to zapasy montażowe —
                  po {String(opcjeDoboru.zapas_na_punkt_m ?? ZAPAS_MONTAZOWY_M).replace(".", ",")} m na punkt
                  (zejście do puszki i luz na podłączenie). Zmienisz to w Rozdzielnicy, w warunkach doboru.
                </>
              )}
            </span>
          ) : (
            <span>
              Metry kabla z ryczałtu (5 mb na punkt + 10 mb na obwód) — plan nie ma skalibrowanej skali
              albo brakuje na nim rozdzielnicy. Ustaw skalę i postaw rozdzielnicę, żeby policzyć realny metraż.
            </span>
          )}
        </div>
      )}

      {/* Bez rozgałęzienia na pustą listę: brak pozycji jest obsłużony WYŻEJ, wczesnym
          powrotem z całego widoku (patrz `rows.length === 0`). Stojący tu wcześniej
          wariant pusty był i tak nieosiągalny — widmowa puszka rozgałęźna sprawiała,
          że lista nigdy nie była pusta — a przy okazji odsyłał do zakładki
          „Zaprojektuj instalację", która nazywa się „Instalacja" od kroku 62. */}
        <div className="pe-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500" style={{ borderColor: "#DCE2E8" }}>
                <th className="p-3">Pozycja</th>
                <th className="w-36 p-3">Ilość</th>
                <th className="w-32 p-3">Cena jedn.</th>
                <th className="w-44 p-3 text-right">Wartość</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                  <td className="p-3">{r.label}</td>
                  {/* Ilość do poprawienia ręcznie. Aplikacja sama pisze pod tabelą, żeby
                      zweryfikować ilości na realnym rzucie — a puszki i robocizna to
                      czyste szacunki z liczby punktów i pomieszczeń. Puste pole = wartość
                      z rzutu, pokazana jako podpowiedź. */}
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={r.qtyOverridden ? r.qty : ""}
                        onChange={(e) => setQtyOverride(r.key, e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
                        placeholder={String(r.qty)}
                        aria-label={`Ilość: ${r.label}`}
                        className="pe-input pe-mono w-20 text-sm"
                        style={r.qtyOverridden ? { color: "#8A5526", borderColor: "#C1793F", fontWeight: 600 } : undefined}
                      />
                      <button
                        onClick={() => setQtyOverride(r.key, null)}
                        aria-label={`Przywróć ilość z rzutu: ${r.label}`}
                        title="Wróć do ilości oszacowanej z rzutu"
                        className={`rounded p-0.5 text-slate-400 hover:text-ink ${r.qtyOverridden ? "" : "invisible"}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      value={r.price}
                      // Ruszenie ceny jednostkowej ZDEJMUJE ryczałt. Inaczej zostawałaby
                      // pozycja, w której użytkownik właśnie zmienił cenę, a wartość
                      // stoi w miejscu — czyli kontrolka, która nic nie robi.
                      onChange={(e) => {
                        setPrice(r.key, Number(e.target.value) || 0);
                        if (r.overridden) setCostOverride(r.key, null);
                      }}
                      aria-label={`Cena jednostkowa: ${r.label}`}
                      className="pe-input pe-mono w-24 text-sm"
                      style={r.overridden ? { color: "#94A3B8" } : undefined}
                      title={r.overridden ? "Pozycja wyceniona ryczałtem — zmiana ceny wróci do liczenia ilość × cena" : undefined}
                      step="0.5"
                    />
                  </td>
                  {/* Wartość pozycji do wpisania wprost. Realne oferty podają część
                      pozycji ryczałtem (robocizna za mieszkanie, rozdzielnica „pod
                      klucz"), a takiej kwoty nie da się sensownie rozbić na sztuki.
                      Puste pole = wartość liczona z ilości i ceny — ten sam zapis co
                      przy wysokości montażu elementu. */}
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        value={r.overridden ? r.value : ""}
                        onChange={(e) => setCostOverride(r.key, e.target.value === "" ? null : Number(e.target.value) || 0)}
                        placeholder={r.value.toFixed(2)}
                        aria-label={`Wartość pozycji: ${r.label}`}
                        className="pe-input pe-mono w-28 text-right text-sm"
                        style={r.overridden ? { color: "#8A5526", borderColor: "#C1793F", fontWeight: 600 } : undefined}
                        step="1"
                      />
                      <span className="text-xs text-slate-400">zł</span>
                      {/* Krzyżyk tylko przy nadpisanej pozycji: przy liczonej nie miałby
                          czego cofać, a stały „×" w każdym wierszu byłby szumem. */}
                      <button
                        onClick={() => setCostOverride(r.key, null)}
                        aria-label={`Przywróć liczoną wartość: ${r.label}`}
                        title="Wróć do liczenia ilość × cena"
                        className={`rounded p-0.5 text-slate-400 hover:text-ink ${r.overridden ? "" : "invisible"}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </td>
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

      {unpriced.length > 0 && (
        <div className="flex gap-2.5 rounded-md p-3 text-xs" style={{ background: "#C1793F14", color: "#8A5526" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <strong>Suma nie obejmuje wszystkiego.</strong> Pozycje o zerowej wartości nie wchodzą do kosztorysu:{" "}
            {unpriced.join(", ")}. Uzupełnij cenę jednostkową albo wpisz wartość pozycji — zwłaszcza robocizna potrafi
            być większą częścią kosztu niż sam materiał.
          </div>
        </div>
      )}

      {/* O METRACH KABLA mówi wyłącznie notka nad tabelą, bo tylko ona zna
          `cableLengthSource` — raz jest to ryczałt, raz pomiar z tras po planie.
          Ta notka podawała ryczałt („5 mb na punkt + 10 mb na obwód") jako jedyną
          prawdę, więc przy metrażu policzonym z planu dwa zdania na jednej stronie
          tłumaczyły tę samą liczbę na dwa wykluczające się sposoby — i to właśnie
          w miejscu, na podstawie którego kupuje się materiał. Zostaje tu tylko to,
          co jest szacunkiem ZAWSZE, niezależnie od skali i tras. */}
      <div className="text-xs text-slate-400">
        Liczba puszek jest szacowana z liczby punktów instalacyjnych (podtynkowe) i pomieszczeń (rozgałęźne).
        Zweryfikuj ilości na realnym rzucie budynku przed zakupem materiału — każdą da się poprawić w kolumnie
        „Ilość”, a krzyżyk obok wraca do wartości z rzutu.
      </div>

      {/* Dokument składany jest RAZ, a „Pobierz" zapisuje dokładnie te bajty, które
          widać w podglądzie — patrz komentarz w `PdfPreview`. */}
      <PdfPreview
        open={podgladPdf}
        onOpenChange={setPodgladPdf}
        title="Kosztorys instalacji"
        filename={projectFileName("kosztorys", docHeader.obiekt, "pdf")}
        build={() => buildCostsPdf(rows, docHeader)}
      />
    </div>
  );
}
