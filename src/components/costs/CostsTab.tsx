import { Alert } from "@/components/ui/alert";
import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { formatLiczba } from "@/lib/liczby";
import { AlertTriangle, ArrowLeft, Download, FileText, Info, Upload, X } from "lucide-react";
import { useOpcjeDoboru, useProjectStore } from "@/store/useProjectStore";
import { computeRcdGroups } from "@/lib/panel/circuits";
import { buildPanelDevices } from "@/lib/panel/devices";
import { computeSizedCircuits, lowVoltageLengths, routeSummaries } from "@/lib/panel/project";
import { ZAPAS_MONTAZOWY_M } from "@/lib/panel/norms";
import { bezCeny, computeCosts, kosztorysRows, parsePriceCsv, pogrupujWiersze, podsumowanieKosztorysu, STAWKI_VAT, stawkaVatZZapisu } from "@/lib/costs";
import { downloadBlob, projectFileName } from "@/lib/pdf/download";
import { buildCostsDoc, buildCostsPdf } from "@/lib/pdf/costs";
import { zarejestrujProducenta } from "@/lib/pdf/rejestr";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { resolveDocHeader } from "@/lib/docHeader";
import { Button } from "@/components/ui/button";
import { useRoute } from "@/hooks/useRoute";

// Ramka jest jedynym nośnikiem stanu pola (liczone / wpisane), więc musi spełniać
// WCAG 1.4.11 (3:1): slate-400 (#5B6A80) to ~5,4:1 na bieli, a border-border-strong
// (#C7D0D9) tylko ~1,6:1. `opacity-100` wyłącza przyciemnianie podpowiedzi w Firefoksie.
const STAN_LICZONE = "border-dashed border-slate-400 placeholder:text-ink placeholder:opacity-100";
const STAN_WPISANE = "border-solid border-copper font-semibold text-caution";

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
/**
 * Suma brutto w przyklejonym pasku kroku (gniazdo `#pasek-kroku-srodek` z PasekKroku).
 * Przy ~30 pozycjach podsumowanie u góry i stopka tabeli są poza kadrem, gdy poprawiasz
 * cenę w połowie listy. Napis „Suma brutto”, nie „RAZEM brutto” — tamten szukają testy.
 */
function SumaWPasku({ brutto, zastrzezenie }: { brutto: number; zastrzezenie?: string }) {
  return (
    // aria-atomic: czytnik ogłasza całość („Suma brutto … zł, sam materiał”), nie samą liczbę.
    <div data-testid="suma-w-pasku" className="text-right leading-tight" aria-live="polite" aria-atomic="true">
      <div className="text-xs text-slate-500">
        Suma brutto
        {zastrzezenie && <span data-testid="suma-w-pasku-zastrzezenie"> ({zastrzezenie})</span>}
      </div>
      <div className="pe-mono text-base font-semibold text-ink sm:text-lg">{formatLiczba(brutto, 2)} zł</div>
    </div>
  );
}

/**
 * Gniazdo z paska kroku. Pasek renderuje się w App PO zakładce, a sama zakładka bywa
 * ładowana leniwie, więc przy pierwszym efekcie gniazda może jeszcze nie być. Zamiast
 * liczyć na kolejność, czekamy na nie obserwatorem DOM (kończy się po znalezieniu).
 */
function useSlotPaska(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const znajdz = () => document.getElementById("pasek-kroku-srodek");
    const teraz = znajdz();
    if (teraz?.isConnected) {
      setSlot(teraz);
      return;
    }
    // Obserwujemy do skutku: węzeł odłączony od DOM (pasek przemontowany) nie jest gniazdem.
    const obserwator = new MutationObserver(() => {
      const el = znajdz();
      if (el?.isConnected) {
        setSlot(el);
        obserwator.disconnect();
      }
    });
    obserwator.observe(document.body, { childList: true, subtree: true });
    return () => obserwator.disconnect();
  }, []);
  return slot;
}

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
  const stawkaVat = useProjectStore((s) => s.stawkaVat);
  const setStawkaVat = useProjectStore((s) => s.setStawkaVat);
  const projectName = useProjectStore((s) => s.projectName);
  const rawDocHeader = useProjectStore((s) => s.docHeader);
  // Nazwa projektu jako domyślny „Obiekt" — dzięki temu tabliczka rysunkowa i nazwa
  // pliku są wypełnione nawet bez wizyty w zakładce Protokoły (ten sam wzorzec co
  // w Rozdzielnicy).
  const docHeader = resolveDocHeader(rawDocHeader, projectName);
  const [podgladPdf, setPodgladPdf] = useState(false);
  const slotSumy = useSlotPaska();
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
  /**
   * Aparaty z ROZDZIELNICY — ta sama reguła co w schemacie: zapisana rozdzielnica,
   * a jeśli jej jeszcze nie ma, odbudowana z obwodów. Dzięki temu kosztorys wycenia to,
   * co użytkownik ma w Rozdzielnicy (usunięte aparaty, dołożony SPD, stycznik…),
   * a nie osobno odtworzoną kopię.
   *
   * Sam rozłącznik główny (i zaślepki) bez żadnego obwodu to jeszcze nie rozdzielnica —
   * inaczej pusty projekt, na którym ktoś tylko zajrzał do Rozdzielnicy, dostawałby
   * rachunek za obudowę i rozłącznik (ten sam problem co dawna widmowa puszka).
   */
  const panelDevices = useProjectStore((s) => s.panelDevices);
  const panelConfig = useProjectStore((s) => s.panelConfig);
  const aparaty = useMemo(() => {
    const zapisane = panelDevices.length ? panelDevices : circuits.length ? buildPanelDevices(rcdGroups, panelConfig) : [];
    return circuits.length || zapisane.some((d) => d.kind !== "main" && d.kind !== "blank") ? zapisane : [];
  }, [panelDevices, circuits, rcdGroups, panelConfig]);
  const { quantities, cableLengthSource } = useMemo(
    () =>
      computeCosts(elements, circuits, rcdGroups, {
        routeLengthsM: new Map([...trasy].map(([id, r]) => [id, r.totalM])),
        lvLengthsM: niskopradowe ?? undefined,
        aparaty,
      }),
    [elements, circuits, rcdGroups, trasy, niskopradowe, aparaty]
  );

  const rows = kosztorysRows(quantities, prices, costOverrides, qtyOverrides);
  /** Zgloszenie kosztorysu do kompletu dokumentacji — patrz lib/pdf/rejestr.ts. */
  useEffect(() => zarejestrujProducenta("kosztorys", async () => buildCostsDoc(rows, docHeader, stawkaVat)));

  // Sumy i PODPIS pod nimi z jednego miejsca — patrz `podsumowanieKosztorysu`.
  // Etykieta jest liczona tam, bo „RAZEM brutto" bywa NIEPRAWDĄ: przy domyślnym
  // cenniku `robocizna` ma cenę 0 i do sumy w ogóle nie wchodzi, a to ona bywa
  // większą częścią kosztu niż cały materiał.
  const podsumowanie = podsumowanieKosztorysu(rows, stawkaVat);
  const grandTotal = podsumowanie.netto;
  const vat = podsumowanie.vat;
  const gross = podsumowanie.brutto;
  // Zastrzeżenie bierzemy z tej samej etykiety co podsumowanie i stopka („RAZEM brutto — sam
  // materiał”): goła suma pod okiem przy poprawianiu cen bywa NIEPRAWDĄ (brak robocizny/cen).
  const zastrzezenieSumy = podsumowanie.etykietaSumy.split(" — ")[1];
  // Pozycje o zerowej wartości nie wchodzą do sumy, więc „RAZEM" potrafi wyglądać na
  // komplet, choć brakuje w nim np. całej robocizny. Zbieramy je, żeby powiedzieć to
  // wprost — aplikacja jest adresowana głównie do laików, którzy nie wychwycą tego sami.
  const unpriced = podsumowanie.niewycenione;
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
      .map((r) => `${r.label};${r.qty};${formatLiczba(r.price, 2)};${formatLiczba(r.value, 2)};${r.overridden ? "wartość wpisana ręcznie (ryczałt)" : ""}`)
      .join("\n");
    const summary =
      `\nRazem netto;;;${formatLiczba(grandTotal, 2)};` +
      `\nVAT ${stawkaVat}%;;;${formatLiczba(vat, 2)};` +
      `\n${podsumowanie.etykietaSumy};;;${formatLiczba(gross, 2)};`;
    const blob = new Blob(["﻿" + header + body + summary], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, projectFileName("kosztorys", projectName, "csv"));
  }

  return (
    <div className="space-y-5">
      {slotSumy && createPortal(<SumaWPasku brutto={gross} zastrzezenie={zastrzezenieSumy} />, slotSumy)}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pe-display mb-1 text-xl">Kosztorys instalacji elektrycznej</h2>
          <p className="text-sm text-slate-500">
            Ceny domyślne są orientacyjne — edytuj je ręcznie, zaimportuj z własnego cennika (CSV) albo wpisz
            gotową wartość pozycji, jeśli masz ją z oferty ryczałtem.
          </p>
        </div>
        {/* flex-wrap: trzy przyciski rozmiaru md (text-sm, nowrap) mają razem ok. 520 px —
            na 360–430 px bez zawijania wypychały całą stronę poza ekran. */}
        <div className="flex flex-wrap gap-2">
          {/* Format pliku i to, że ceny NIE pobierają się ze sklepów, siedzą w dymku
              przycisku, a nie w akapicie nad tabelą. Stały tam jako trwały baner —
              instrukcja obsługi funkcji, której większość użytkowników nigdy nie użyje,
              czytana za każdym razem przed pierwszą pozycją kosztorysu. Sam fakt, że
              cennik da się zaimportować, mówi zdanie wprowadzające obok. */}
          <Button variant="secondary" size="md"
            onClick={() => fileRef.current?.click()}
            title="Wgraj plik CSV w formacie nazwa;cena — aplikacja dopasuje pozycje po słowach kluczowych. Ceny nie pobierają się automatycznie ze stron sklepów."
          >
            <Upload size={14} /> Importuj cennik CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
          {/* CSV zostaje dla tych, którzy liczą dalej w arkuszu; PDF jest tym, co wysyła
              się klientowi — stąd on dostaje przycisk główny. Pobranie dzieje się
              z poziomu PODGLĄDU, tak jak przy pozostałych eksportach: nikt nie ma wysłać
              dokumentu, na który sam nie spojrzał. */}
          <Button variant="secondary" size="md" onClick={exportCsv}>
            <Download size={14} /> Eksportuj CSV
          </Button>
          <Button variant="primary" size="md"
            onClick={() => setPodgladPdf(true)}
          >
            <FileText size={14} /> Kosztorys do PDF
          </Button>
        </div>
      </div>
      {/*
        Podsumowanie NA GÓRZE. Kwota to pierwsze, czego szuka się w kosztorysie, a stała
        wyłącznie pod tabelą — ok. 1700 px niżej, za trzydziestoma wierszami. Ten sam
        podpis co suma na dole (`etykietaSumy`: „sam materiał" / „niepełny"), bo liczba
        wyniesiona na górę bez niego znów udawałaby cenę całej instalacji. Suma na dole
        zostaje: tam kończy się czytanie tabeli.
      */}
      {rows.length > 0 && (
        <div
          className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 rounded-card border border-border bg-white px-4 py-3"
          data-testid="podsumowanie-kosztorysu"
        >
          <div>
            <div className="text-sm font-semibold text-ink">{podsumowanie.etykietaSumy}</div>
            <div data-testid="podsumowanie-brutto" className="pe-display text-2xl font-bold text-copper">{formatLiczba(gross, 2)} zł</div>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="text-slate-500">Netto</dt>
              <dd className="pe-mono">{formatLiczba(grandTotal, 2)} zł</dd>
            </div>
            <div>
              <dt className="text-slate-500">VAT {stawkaVat}%</dt>
              <dd className="pe-mono">{formatLiczba(vat, 2)} zł</dd>
            </div>
            {unpriced.length > 0 && (
              <div>
                <dt className="text-slate-500">Bez ceny</dt>
                <dd style={{ color: "#8A5526" }}>
                  {unpriced.length}{" "}
                  {unpriced.length === 1
                    ? "pozycja"
                    : unpriced.length % 10 >= 2 && unpriced.length % 10 <= 4 && !(unpriced.length % 100 >= 12 && unpriced.length % 100 <= 14)
                      ? "pozycje"
                      : "pozycji"}{" "}
                  — poza sumą
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/*
        JEDEN blok „skąd wzięły się metry", zamiast dwóch pełnych akapitów jeden pod
        drugim — plus trzeci, o imporcie cen, który zszedł do dymka przycisku.
        Trzy bannery stały między nagłówkiem a pierwszą pozycją tabeli i trzeba je było
        przeczytać, zanim zobaczyło się cokolwiek policzonego.

        Zasilanie i niskoprądówka ZOSTAJĄ osobnymi wierszami, bo mają własny los
        i własny warunek: niskoprądówka liczy się gwiazdą od szafki, więc bywa
        zmierzona wtedy, gdy zasilanie idzie ryczałtem — i na odwrót. Jedno zdanie na
        oba przypadki myliłoby, które metry są policzone. Zmieniło się WYŁĄCZNIE
        opakowanie: wspólny nagłówek i jedna ramka zamiast dwóch bloków na całą
        szerokość. Same zdania są co do słowa te same — pilnują ich cztery testy e2e.

        Zasilanie idzie PIERWSZE, bo to ono daje większość metrów.
      */}
      {/* Od `xl` dwie kolumny: tabela najwyżej 64rem, notki (skąd metry kabla, puszki,
          VAT) w wąskiej kolumnie obok. Tabela na całą szerokość rozciągała kolumnę
          „Pozycja" do 942 px przy 1440 i 1422 px przy 1920 — nazwę od liczb dzieliło
          kilkaset pikseli pustego wiersza. Kolejność w DOM bez zmian (notka, tabela,
          uwagi), więc na węższych ekranach wszystko stoi jak dotąd, jedno pod drugim. */}
      <div className="space-y-5 xl:grid xl:grid-cols-[minmax(0,64rem)_20rem] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-5 xl:space-y-0">
      {rows.length > 0 && (
        <div className="rounded-lg border border-border px-3 py-2 text-xs xl:col-start-2 xl:row-start-1" style={{ background: "#F7F9FB" }}>
          <div className="mb-1.5 text-xs font-semibold text-slate-600">Skąd wzięły się metry kabla</div>
          <div className="space-y-1.5">
            <div
              className="flex items-start gap-2"
              style={{ color: cableLengthSource === "plan" ? "#2C6B4A" : "#8A5526" }}
            >
              {cableLengthSource === "plan" ? (
                <Info size={14} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              )}
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

            {niskopradoweWKosztorysie && (
              <div className="flex items-start gap-2" style={{ color: niskopradowe ? "#2C6B4A" : "#8A5526" }}>
                {niskopradowe ? (
                  <Info size={14} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                )}
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
          </div>
        </div>
      )}

      {/* Bez rozgałęzienia na pustą listę: brak pozycji jest obsłużony WYŻEJ, wczesnym
          powrotem z całego widoku (patrz `rows.length === 0`). Stojący tu wcześniej
          wariant pusty był i tak nieosiągalny — widmowa puszka rozgałęźna sprawiała,
          że lista nigdy nie była pusta — a przy okazji odsyłał do zakładki
          „Zaprojektuj instalację", która nazywa się „Instalacja" od kroku 62. */}
        <div className="pe-card overflow-hidden xl:col-start-1 xl:row-span-2 xl:row-start-1">
          {/* Na telefonie wiersze są KARTAMI (nazwa na całą szerokość, pod nią ilość,
              cena i wartość), od 768 px — zwykłą tabelą. Samym CSS-em, na tym samym
              drzewie: druga kopia kontrolek dałaby dwa pola o tej samej nazwie.
              Tabela miała na telefonie 553 px w okienku 325 px — kolumna „Wartość"
              była całkiem poza ekranem, a „Cena jedn." przycięta. */}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border px-3 py-2 text-xs text-slate-500">
            <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-dashed border-slate-400" />
            <span>Przerywana ramka — wartość policzona przez aplikację (wpisz, żeby ją zmienić).</span>
            <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-solid border-copper" />
            <span>Pełna miedziana — wpisana ręcznie.</span>
          </p>
          <table className="block w-full text-sm md:table">
            <thead className="hidden md:table-header-group">
              <tr className="border-b text-left text-xs text-slate-500" style={{ borderColor: "#DCE2E8" }}>
                <th className="p-3">Pozycja</th>
                <th className="w-36 p-3">Ilość</th>
                <th className="w-32 p-3">Cena jedn.</th>
                <th className="w-44 p-3 text-right">Wartość</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {/* Pozycje w GRUPACH z sumą częściową (patrz `GRUPY_KOSZTORYSU`) — w płaskiej
                  liście trzydziestu wierszy nie było widać, co kosztuje najwięcej. */}
              {pogrupujWiersze(rows).map((g) => (
                <Fragment key={g.nazwa}>
                <tr className="block border-b md:table-row" style={{ borderColor: "#EEF1F4", background: "#F7F9FB" }} data-testid="grupa-kosztorysu">
                  <td colSpan={4} className="block px-3 py-2 md:table-cell">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-ink">{g.nazwa}</span>
                      <span className="pe-mono text-sm text-slate-600">{formatLiczba(g.suma, 2)} zł</span>
                    </div>
                  </td>
                </tr>
              {g.wiersze.map((r) => (
                <tr
                  key={r.key}
                  // Pozycja bez ceny nie wchodzi do sumy — widać to w SAMYM wierszu, tam,
                  // gdzie się ją uzupełnia, a nie tylko w ostrzeżeniu pod tabelą.
                  //
                  // Proporcje kolumn pochodzą z POMIARU na telefonie, nie z wyczucia. Przy
                  // 1 : 1 : 1,35 pole wartości ucinało liczby („220,0" zamiast „220,00" —
                  // 13 z 32 pól przy 375 px, wszystkie przy 320 px), a kolumna ceny miała
                  // zapas kilkudziesięciu pikseli. Pole wartości dzieli miejsce z krzyżykiem
                  // cofania, a „zł" stoi w podpisie pola, nie obok liczby.
                  className={`grid grid-cols-[1.07fr_0.62fr_1.43fr] gap-x-1.5 gap-y-1.5 border-b p-3 last:border-0 md:table-row md:p-0 ${
                    bezCeny(r) ? "bg-[#FDF6EF]" : "md:hover:bg-slate-50"
                  }`}
                  style={{ borderColor: "#EEF1F4" }}
                  data-bez-ceny={bezCeny(r) || undefined}
                >
                  <td className="col-span-3 font-medium md:p-3 md:font-normal">
                    {r.label}
                    {bezCeny(r) && (
                      <span className="mt-0.5 block text-xs font-normal" style={{ color: "#8A5526" }}>
                        Bez ceny — nie wchodzi do sumy. Wpisz cenę jednostkową albo wartość pozycji.
                      </span>
                    )}
                  </td>
                  {/* Ilość do poprawienia ręcznie. Aplikacja sama pisze pod tabelą, żeby
                      zweryfikować ilości na realnym rzucie — a puszki i robocizna to
                      czyste szacunki z liczby punktów i pomieszczeń. Puste pole = wartość
                      z rzutu, pokazana jako podpowiedź. */}
                  <td className="min-w-0 md:p-3">
                    {/* Podpis pola tylko w karcie na telefonie — na monitorze robi to nagłówek tabeli. */}
                    <span className="mb-0.5 block text-xs uppercase tracking-wide text-slate-400 md:hidden">Ilość</span>
                    {/* Wysokość wiersza na dotyku trzyma wrapper (jak przy cenie), nie krzyżyk —
                        krzyżyk na telefonie znika z układu, gdy nie ma czego cofać. */}
                    <div className="flex items-center gap-1 [@media(pointer:coarse)]:min-h-11">
                      <input
                        type="number"
                        min={0}
                        value={r.qtyOverridden ? r.qty : ""}
                        onChange={(e) => setQtyOverride(r.key, e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
                        placeholder={String(r.qty)}
                        aria-label={`Ilość: ${r.label}`}
                        data-stan={r.qtyOverridden ? "wpisane" : "liczone"}
                        className={`pe-input pe-mono w-full min-w-0 px-1 text-sm md:w-20 md:px-2.5 ${r.qtyOverridden ? STAN_WPISANE : STAN_LICZONE}`}
                      />
                      <button
                        onClick={() => setQtyOverride(r.key, null)}
                        aria-label={`Przywróć ilość z rzutu: ${r.label}`}
                        title="Wróć do ilości oszacowanej z rzutu"
                        // Na dotyku 32 × 44 px — szerzej zjadałoby pole ilości w karcie na telefonie.
                        // Niewidoczny krzyżyk na telefonie nie zajmuje miejsca (`max-md:hidden`): przy
                        // 320 px jego 36 px zjadało pole, a liczby się ucinały. Od md zostaje
                        // `invisible`, żeby kolumna w tabeli nie skakała po nadpisaniu ilości.
                        className={`rounded p-0.5 text-slate-400 hover:text-ink [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-8 flex items-center justify-center ${r.qtyOverridden ? "" : "invisible max-md:hidden"}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                  <td className="min-w-0 md:p-3">
                    <span className="mb-0.5 block text-xs uppercase tracking-wide text-slate-400 md:hidden">Cena</span>
                    {/* Ten sam wiersz co ilość i wartość: tamte mają obok przycisk cofania, który na dotyku
                        ma 44 px wysokości i centruje pole. Bez wrappera pole ceny leżało 5 px wyżej. */}
                    <div className="flex items-center [@media(pointer:coarse)]:min-h-11">
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
                        className="pe-input pe-mono w-full min-w-0 px-1 text-sm md:w-24 md:px-2.5"
                        style={r.overridden ? { color: "#5B6A80" } : undefined}
                        title={r.overridden ? "Pozycja wyceniona ryczałtem — zmiana ceny wróci do liczenia ilość × cena" : undefined}
                        step="0.5"
                      />
                    </div>
                  </td>
                  {/* Wartość pozycji do wpisania wprost. Realne oferty podają część
                      pozycji ryczałtem (robocizna za mieszkanie, rozdzielnica „pod
                      klucz"), a takiej kwoty nie da się sensownie rozbić na sztuki.
                      Puste pole = wartość liczona z ilości i ceny — ten sam zapis co
                      przy wysokości montażu elementu. */}
                  <td className="min-w-0 text-right md:p-3">
                    <span className="mb-0.5 block text-xs uppercase tracking-wide text-slate-400 md:hidden">Wartość, zł</span>
                    <div className="flex items-center justify-end gap-1 [@media(pointer:coarse)]:min-h-11">
                      <input
                        type="number"
                        value={r.overridden ? r.value : ""}
                        onChange={(e) => setCostOverride(r.key, e.target.value === "" ? null : Number(e.target.value) || 0)}
                        // kropka-celowo: nie przecinek, MIMO polskiej notacji w reszcie kosztorysu — to podpowiedz
                        // dla pola `type="number"`, ktore przechowuje wartosc wylacznie z kropka.
                        // Przecinek w podpowiedzi mowilby uzytkownikowi, zeby wpisal cos,
                        // czego kontrolka nie przyjmie.
                        placeholder={formatLiczba(r.value, 2)}
                        aria-label={`Wartość pozycji: ${r.label}`}
                        data-stan={r.overridden ? "wpisane" : "liczone"}
                        className={`pe-input pe-mono w-full min-w-0 px-1 text-right text-sm md:w-28 md:px-2.5 ${r.overridden ? STAN_WPISANE : STAN_LICZONE}`}
                        step="1"
                      />
                      <span className="hidden text-xs text-slate-400 md:inline">zł</span>
                      {/* Krzyżyk tylko przy nadpisanej pozycji: przy liczonej nie miałby
                          czego cofać, a stały „×" w każdym wierszu byłby szumem. */}
                      <button
                        onClick={() => setCostOverride(r.key, null)}
                        aria-label={`Przywróć liczoną wartość: ${r.label}`}
                        title="Wróć do liczenia ilość × cena"
                        className={`rounded p-0.5 text-slate-400 hover:text-ink [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-8 flex items-center justify-center ${r.overridden ? "" : "invisible max-md:hidden"}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="block md:table-footer-group">
              <tr className="flex items-baseline justify-between md:table-row [&>td]:grow md:[&>td]:grow-0">
                <td className="p-3 pb-1 text-sm text-slate-500" colSpan={3}>
                  Razem netto
                </td>
                <td className="pe-mono p-3 pb-1 text-right text-sm">{formatLiczba(grandTotal, 2)} zł</td>
              </tr>
              <tr className="flex items-baseline justify-between md:table-row [&>td]:grow md:[&>td]:grow-0">
                <td className="px-3 py-1 text-sm text-slate-500" colSpan={3}>
                  {/* Stawka do wyboru — patrz `STAWKI_VAT` i zdanie pod tabelą. Idzie też
                      do CSV i PDF-a, więc wykonawca dostaje tę samą kwotę co na ekranie. */}
                  <label className="inline-flex items-center gap-1.5">
                    VAT
                    <select
                      aria-label="Stawka VAT"
                      value={stawkaVat}
                      onChange={(e) => setStawkaVat(stawkaVatZZapisu(Number(e.target.value)))}
                      className="pe-input pe-select py-0.5 text-slate-700 text-base md:text-sm"
                      style={{ borderColor: "#D6DCE3" }}
                    >
                      {STAWKI_VAT.map((s) => (
                        <option key={s} value={s}>
                          {s}%
                        </option>
                      ))}
                    </select>
                  </label>
                </td>
                <td className="pe-mono px-3 py-1 text-right text-sm text-slate-500">{formatLiczba(vat, 2)} zł</td>
              </tr>
              {/* Ostrzeżenie stoi NAD sumą, nie pod nią. Pod spodem gasło: najpierw padała
                  wielka miedziana liczba z podpisem „RAZEM", a dopiero potem, drobnym
                  drukiem, zdanie że to nie jest razem. Kolejność była odwrotna do ważności
                  — a to jedyna liczba, którą laik wynosi z całej aplikacji i pokazuje
                  wykonawcy. */}
              {unpriced.length > 0 && (
                <tr>
                  <td colSpan={4} className="px-3 pb-2 pt-2">
                    {/* `role="note"`, nie domyślny `status`: lista pozycji bez ceny zmienia się
                        przy każdym wpisanym znaku, a region `status` kazałby czytnikowi
                        odczytywać całe zdanie od nowa w trakcie pisania. */}
                    <Alert variant="caution" role="note" className="gap-2.5 text-xs">
                      <div>
                        <strong>
                          {podsumowanie.brakRobocizny
                            ? "To jest cena materiału, nie cena instalacji."
                            : "Suma nie obejmuje wszystkiego."}
                        </strong>{" "}
                        Pozycje o zerowej wartości nie wchodzą do kosztorysu: {unpriced.join(", ")}. Uzupełnij cenę
                        jednostkową albo wpisz wartość pozycji
                        {podsumowanie.brakRobocizny
                          ? " — robocizna potrafi być większą częścią kosztu niż cały materiał."
                          : "."}
                      </div>
                    </Alert>
                  </td>
                </tr>
              )}
              <tr className="flex items-baseline justify-between md:table-row [&>td]:grow md:[&>td]:grow-0">
                <td className="pe-display p-3 pt-1 font-bold" colSpan={3}>
                  {podsumowanie.etykietaSumy}
                </td>
                <td className="pe-display p-3 pt-1 text-right text-lg font-bold text-copper">{formatLiczba(gross, 2)} zł</td>
              </tr>
            </tfoot>
          </table>
        </div>

      {/* O METRACH KABLA mówi wyłącznie notka nad tabelą, bo tylko ona zna
          `cableLengthSource` — raz jest to ryczałt, raz pomiar z tras po planie.
          Ta notka podawała ryczałt („5 mb na punkt + 10 mb na obwód") jako jedyną
          prawdę, więc przy metrażu policzonym z planu dwa zdania na jednej stronie
          tłumaczyły tę samą liczbę na dwa wykluczające się sposoby — i to właśnie
          w miejscu, na podstawie którego kupuje się materiał. Zostaje tu tylko to,
          co jest szacunkiem ZAWSZE, niezależnie od skali i tras. */}
      <div className="text-xs text-slate-400 xl:col-start-2 xl:row-start-2 xl:mt-4">
        Liczba puszek jest szacowana z liczby punktów instalacyjnych (podtynkowe) i pomieszczeń (rozgałęźne).
        Zweryfikuj ilości na realnym rzucie budynku przed zakupem materiału — każdą da się poprawić w kolumnie
        „Ilość”, a krzyżyk obok wraca do wartości z rzutu.
        <span className="mt-1.5 block">
          VAT 8% dotyczy robót w mieszkaniu do 150 m² albo domu do 300 m², rozliczanych razem z materiałem przez
          wykonawcę. Sam zakup materiału, większy metraż i lokale użytkowe to 23%. W razie wątpliwości zapytaj
          wykonawcę albo księgowego.
        </span>
      </div>
      </div>

      {/* Dokument składany jest RAZ, a „Pobierz" zapisuje dokładnie te bajty, które
          widać w podglądzie — patrz komentarz w `PdfPreview`. */}
      <PdfPreview
        open={podgladPdf}
        onOpenChange={setPodgladPdf}
        title="Kosztorys instalacji"
        filename={projectFileName("kosztorys", docHeader.obiekt, "pdf")}
        build={() => buildCostsPdf(rows, docHeader, stawkaVat)}
      />
    </div>
  );
}
