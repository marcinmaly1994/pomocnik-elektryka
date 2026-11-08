import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Eye, FilePlus2, FolderOpen, Plus, Save, Trash2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { PROTOCOL_DEFS, PROTOCOL_ORDER, limitOceny, ocenWiersz, protocolVerdict, ujemneWProtokole, wierszeBezOceny, type ProtocolRow } from "@/lib/protocols";
import { buildProtocolDoc, buildProtocolPdf, downloadProtocolPdf } from "@/lib/pdf/protocol";
import { zarejestrujProducenta } from "@/lib/pdf/rejestr";
import { projectFileName } from "@/lib/pdf/download";
import { PdfPreview } from "@/components/ui/PdfPreview";
import { resolveDocHeader } from "@/lib/docHeader";
import { LIMIT_ZAPISOW } from "@/lib/dokumenty";
import type { ProtocolKey } from "@/types";
import { useRoute } from "@/hooks/useRoute";
import { dopasujParam } from "@/lib/routing";
import { waskiEkran } from "@/lib/design";
import { Button } from "@/components/ui/button";

/**
 * Pola danych ogólnych w kolejności i szerokości układu od `xl` (siatka 12 kolumn,
 * trzy wiersze: obiekt — wykonawca i przyrząd — warunki i dokument, z uwagami na końcu).
 *
 * Dotąd każde pole miało jedną trzecią szerokości karty: przy 1920 px temperatura „20"
 * i rewizja „A" stały w polach po 600 px, a cała karta (ok. 500 px wysokości) spychała
 * właściwy protokół pod krawędź ekranu (przy 1440×900 zaczynał się na ok. 910 px).
 * Szerokość idzie teraz za długością wartości. Poniżej `xl` — jak dotąd (dwie albo trzy
 * kolumny); od `xl` kolumna ma ok. 90 px, więc etykiety się jeszcze mieszczą.
 */
const HEADER_FIELDS: [string, string, string][] = [
  ["obiekt", "Obiekt / nazwa instalacji", "xl:col-span-3"],
  ["adres", "Adres obiektu", "xl:col-span-4"],
  ["zleceniodawca", "Zleceniodawca", "xl:col-span-3"],
  ["uklad", "Układ sieci", "xl:col-span-2"],
  ["wykonawca", "Wykonawca pomiarów", "xl:col-span-3"],
  ["uprawnienia", "Nr uprawnień (SEP E/D)", "xl:col-span-2"],
  ["przyrzad", "Przyrząd pomiarowy", "xl:col-span-3"],
  ["nrFabryczny", "Nr fabryczny przyrządu", "xl:col-span-2"],
  ["swiadectwo", "Świadectwo wzorcowania", "xl:col-span-2"],
  ["data", "Data pomiarów", "xl:col-span-2"],
  ["temperatura", "Temperatura [°C]", "xl:col-span-2"],
  ["wilgotnosc", "Wilgotność [%]", "xl:col-span-2"],
  ["drawingNo", "Nr rysunku / dokumentu", "xl:col-span-2"],
  ["revision", "Rewizja", "xl:col-span-1"],
];

const DANE_ZWINIETE_KEY = "pomocnikelektryka_dane_ogolne_zwiniete";

function odczytajDaneZwiniete(): boolean {
  try {
    return localStorage.getItem(DANE_ZWINIETE_KEY) === "1";
  } catch {
    // prywatny tryb przeglądarki potrafi rzucać przy dostępie do localStorage —
    // brak flagi znaczy „domyślnie rozwinięte", co jest bezpieczniejsze
    return false;
  }
}

const STATUS_OPTIONS: [string, string, string][] = [
  ["tak", "zgodne", "#3B8C63"],
  ["nie", "niezgodne", "#C6433A"],
  ["nd", "n/d", "#4F5D73"],
];

/**
 * Protokoły pomiarowe — dane ogólne (współdzielony `docHeader` ze store'a, ten
 * sam nagłówek co legenda rozdzielnicy), wybór protokołu, tabela wyników lub
 * lista kontrolna (oględziny), generowanie PDF już gotowym silnikiem z kroku 4.
 * Wiersze protokołów trzymane w store (`protocols`, nie w historii cofnij/ponów
 * planu — to osobny, niezależny dokument), żeby przetrwały przełączanie
 * zakładek i trafiały do zapisu projektu w chmurze.
 */
/**
 * Treść pozycji oględzin — pole wieloliniowe, które rośnie razem z tekstem.
 *
 * Pozycje listy kontrolnej mają po 50–90 znaków. W jednoliniowym polu na telefonie
 * widać było ich początek („Izolacja przewodów widocznych bez…"), a reszta — czyli to,
 * co właściwie się ocenia — zostawała za krawędzią. Wysokość z `scrollHeight`, bo
 * `field-sizing: content` nie działa jeszcze w Safari.
 */
function TrescPozycji({ value, onChange, etykieta }: { value: string; onChange: (v: string) => void; etykieta: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dopasuj = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    dopasuj();
    if (typeof ResizeObserver === "undefined") return;
    // Zmiana szerokości (obrót telefonu, zwinięcie panelu) zmienia liczbę linii.
    let szer = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== szer) {
        szer = el.clientWidth;
        dopasuj();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={etykieta}
      className="min-w-0 flex-1 basis-[calc(100%-2rem)] resize-none overflow-hidden bg-transparent text-sm leading-snug outline-none md:basis-auto"
    />
  );
}

/** „1 wiersz bez wyników", „3 wiersze…", „12 wierszy…" — albo pozycje oględzin. */
function brakOpis(n: number, checklist: boolean): string {
  const formy = checklist
    ? ["pozycja bez oceny", "pozycje bez oceny", "pozycji bez oceny"]
    : ["wiersz bez wyników", "wiersze bez wyników", "wierszy bez wyników"];
  const kilka = n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);
  return `${n} ${n === 1 ? formy[0] : kilka ? formy[1] : formy[2]}`;
}

export function ProtocolsTab() {
  const rawHeader = useProjectStore((s) => s.docHeader);
  const setDocHeader = useProjectStore((s) => s.setDocHeader);
  const projectName = useProjectStore((s) => s.projectName);
  // Do PDF-a idzie nagłówek z uzupełnionym „Obiektem" (nazwa projektu jako wartość
  // domyślna) — formularz niżej pokazuje ją jako placeholder, więc widać, co się wydrukuje.
  const header = resolveDocHeader(rawHeader, projectName);
  const protocols = useProjectStore((s) => s.protocols);
  const setProtocolState = useProjectStore((s) => s.setProtocolState);

  /**
   * Który protokół jest otwarty — trzymany WYŁĄCZNIE w adresie („/protokoly/izolacja”),
   * bez kopii w stanie komponentu. Inaczej niż w kalkulatorach nie ma tu czego
   * uzgadniać: wybór protokołu nigdy nie był zapisywany między wizytami, więc adres
   * może być jedynym źródłem prawdy, a nie jednym z dwóch.
   *
   * Nieznany klucz w adresie cofa do pierwszego protokołu, tak samo jak nieznana
   * zakładka cofa do strony startowej — literówka ma pokazać coś sensownego.
   */
  const [route, nawiguj] = useRoute();
  const active: ProtocolKey = dopasujParam(route.tab === "protokoly" ? route.param : null, PROTOCOL_ORDER) ?? PROTOCOL_ORDER[0];
  const setActive = (k: ProtocolKey) => nawiguj("protokoly", k);

  // Uzupełnienie adresu przy wejściu na samo „/protokoly" — `replace`, bo to
  // porządkowanie adresu, nie przejście (patrz ten sam wzorzec w kalkulatorach).
  useEffect(() => {
    if (route.tab === "protokoly" && route.param !== active) nawiguj("protokoly", active, { replace: true });
  }, [route.tab, route.param, active, nawiguj]);
  const [blocked, setBlocked] = useState(false);
  const [podglad, setPodglad] = useState(false);
  /** Karta wybranego protokołu — na telefonie przewijamy do niej po wyborze kafelka. */
  const kartaRef = useRef<HTMLDivElement>(null);
  /** Dane ogólne wypełnia się RAZ na zlecenie, a potem przewija się je przy każdym
   *  wejściu w zakładkę. Stan zwinięcia w localStorage, bo to preferencja widoku,
   *  a nie część protokołu. */
  const [daneZwiniete, setDaneZwiniete] = useState(odczytajDaneZwiniete);

  const session = useProjectStore((s) => s.session);
  const cloudBusy = useProjectStore((s) => s.cloudBusy);
  const cloudSaveError = useProjectStore((s) => s.cloudSaveError);
  const protokolyId = useProjectStore((s) => s.protokolyId);
  const protokolyNazwa = useProjectStore((s) => s.protokolyNazwa);
  const saveProtokolyToCloud = useProjectStore((s) => s.saveProtokolyToCloud);
  const nowyZestawProtokolow = useProjectStore((s) => s.nowyZestawProtokolow);
  const setOknoZestawow = useProjectStore((s) => s.setOknoZestawow);
  const [nazwaZestawu, setNazwaZestawu] = useState("");

  // Nazwa wczytanego zestawu wchodzi do pola, żeby „Zapisz zmiany” nie tworzyło
  // dokumentu o pustej nazwie po wczytaniu istniejącego.
  useEffect(() => {
    if (protokolyNazwa) setNazwaZestawu(protokolyNazwa);
  }, [protokolyNazwa]);

  function przelaczDane() {
    setDaneZwiniete((zwiniete) => {
      const nowy = !zwiniete;
      try {
        localStorage.setItem(DANE_ZWINIETE_KEY, nowy ? "1" : "0");
      } catch {
        /* patrz odczytajDaneZwiniete */
      }
      return nowy;
    });
  }

  /**
   * Zgloszenie protokolow do kompletu dokumentacji — WSZYSTKICH wypelnionych, nie tylko
   * ogladanego. Zakladka pokazuje jeden protokol naraz, a komplet moze chciec kilka;
   * skoro kazdy powstaje z samych danych ze store, nie ma powodu ich przelaczac.
   */
  useEffect(() => {
    const sprzataczki = PROTOCOL_ORDER.filter((k) => (protocols[k]?.rows.length ?? 0) > 0).map((k) => {
      const st = protocols[k]!;
      const limitK = limitOceny(PROTOCOL_DEFS[k], st.limit ?? PROTOCOL_DEFS[k].limitDefault ?? 0);
      return zarejestrujProducenta(`protokol:${k}`, async () => buildProtocolDoc(k, header, st.rows, limitK));
    });
    return () => sprzataczki.forEach((f) => f());
  });

  const def = PROTOCOL_DEFS[active];
  const state = protocols[active] ?? { rows: [] };
  const rows = state.rows;
  // `wpisany` to to, co stoi w polu; `limit` — wobec czego naprawdę oceniamy (przycięte do
  // zakresu kryterium). Pole nie przycina w trakcie pisania, bo „0" w drodze do „0,8"
  // przeskakiwałoby na minimum.
  const wpisany = state.limit ?? def.limitDefault ?? 0;
  const limit = limitOceny(def, wpisany);

  function update(patch: { rows?: ProtocolRow[]; limit?: number }) {
    setProtocolState(active, patch);
  }
  function setRow(i: number, patch: ProtocolRow) {
    update({ rows: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  }
  function addRow() {
    const blank: ProtocolRow = {};
    (def.columns ?? []).forEach((c) => {
      blank[c.key] = c.default !== undefined ? c.default : "";
    });
    update({ rows: [...rows, blank] });
  }
  function removeRow(i: number) {
    update({ rows: rows.filter((_, idx) => idx !== i) });
  }
  function initChecklist() {
    update({ rows: (def.items ?? []).map((t) => ({ text: t, status: "" })) });
  }

  const verdict = protocolVerdict(def, rows, limit);
  const headerReady = !!header.obiekt && !!header.wykonawca;
  // Wartości ujemne blokują PDF: to dokument formalny, a −3 MΩ to błąd wpisu, nie pomiar.
  const ujemne = ujemneWProtokole(def, rows);
  const blokadaPdf = !rows.length || ujemne.length > 0;

  return (
    // Pola 16 px na wąskim ekranie — Safari na iPhonie przy mniejszej czcionce przybliża
    // stronę przy każdym stuknięciu w pole (ten sam zabieg co w kalkulatorach).
    <div className="space-y-5 max-md:[&_:is(input,select,textarea)]:text-base">
      <div>
        <h2 className="pe-display mb-1 text-xl">Protokoły pomiarowe</h2>
        <p className="text-sm text-slate-500">
          Protokoły z pomiarów odbiorczych i okresowych instalacji elektrycznej (zakres wg PN-HD 60364-6). Wypełnij
          dane ogólne, uzupełnij wyniki, pobierz gotowy protokół w PDF.
        </p>
      </div>

      {/* Zapis na koncie — protokoły są OSOBNYM dokumentem, niezależnym od projektu
          instalacji. Pomiary pięcioletnie robi się w obiektach, których się nie
          projektowało, więc wiązanie ich z planem zmuszałoby do zakładania pustych
          projektów tylko po to, żeby mieć gdzie zapisać wyniki. */}
      {session && (
        <div className="pe-card flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs text-slate-500">Zestaw protokołów:</span>
          <input
            value={nazwaZestawu}
            onChange={(e) => setNazwaZestawu(e.target.value)}
            placeholder={header.obiekt || "np. Przegląd 5-letni — Hala nr 3"}
            aria-label="Nazwa zestawu protokołów"
            className="pe-input min-w-0 flex-1 text-sm"
            style={{ maxWidth: 320 }}
          />
          <Button variant="primary" size="md"
            onClick={() => saveProtokolyToCloud(nazwaZestawu)}
            disabled={cloudBusy}
          >
            <Save size={14} /> {protokolyId ? "Zapisz zmiany" : "Zapisz na koncie"}
          </Button>
          <Button variant="secondary" size="md" onClick={() => setOknoZestawow(true)}>
            <FolderOpen size={14} /> Moje zestawy
          </Button>
          {protokolyId && (
            <Button variant="secondary" size="md"
              onClick={() => {
                if (confirm("Zacząć nowy, pusty zestaw protokołów? Bieżący zostaje zapisany na koncie.")) nowyZestawProtokolow();
                setNazwaZestawu("");
              }}
            >
              <FilePlus2 size={14} /> Nowy zestaw
            </Button>
          )}
          {cloudSaveError && <span className="text-xs text-red-600">{cloudSaveError}</span>}
          <p className="w-full text-xs text-slate-400">
            Zapis pod nazwą, która już jest na koncie, nadpisuje tamten zestaw. Nową pozycję tworzy dopiero nowa nazwa
            (maksymalnie {LIMIT_ZAPISOW}).
          </p>
        </div>
      )}

      <div className="pe-card p-5">
        {/* Nagłówek jest przyciskiem zwijającym. Po zwinięciu pokazuje PODSUMOWANIE
            (obiekt, data), żeby nie trzeba było rozwijać tylko po to, by sprawdzić,
            czyje dane są wpisane — inaczej zwijanie oszczędzałoby miejsce kosztem
            dodatkowego kliknięcia przy każdej weryfikacji. */}
        <button
          onClick={przelaczDane}
          aria-expanded={!daneZwiniete}
          className="mb-3 flex w-full items-center gap-2 text-left"
        >
          {daneZwiniete ? <ChevronRight size={15} className="shrink-0 text-slate-400" /> : <ChevronDown size={15} className="shrink-0 text-slate-400" />}
          <h3 className="pe-display text-base">Dane ogólne (wspólne dla wszystkich protokołów)</h3>
          {daneZwiniete && (
            <span className="ml-auto truncate pl-3 text-xs text-slate-400">
              {[header.obiekt, header.wykonawca, header.data].filter(Boolean).join(" · ") || "nie wypełniono"}
            </span>
          )}
        </button>
        {!daneZwiniete && (
        <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-12">
          {HEADER_FIELDS.map(([k, label, szer]) => (
            <label key={k} className={`block min-w-0 ${szer}`}>
              <div className="mb-1 truncate text-xs text-slate-500" title={label}>{label}</div>
              {k === "uklad" ? (
                <select
                  value={header.uklad}
                  onChange={(e) => setDocHeader({ uklad: e.target.value as typeof header.uklad })}
                  className="pe-input pe-select w-full text-base md:text-sm"
                >
                  {["TN-S", "TN-C", "TN-C-S", "TT", "IT"].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={k === "data" ? "date" : "text"}
                  // `rawHeader`, nie `header` — pole ma pokazywać to, co użytkownik faktycznie
                  // wpisał (puste, jeśli nic), a domyślną nazwę projektu tylko podpowiadać
                  // placeholderem. Inaczej wpisana wartość „wskakiwałaby” do pustego pola.
                  value={(rawHeader as unknown as Record<string, string>)[k] || ""}
                  placeholder={k === "obiekt" ? projectName : undefined}
                  onChange={(e) => setDocHeader({ [k]: e.target.value })}
                  className="pe-input w-full text-sm"
                />
              )}
            </label>
          ))}
        {/* Uwagi w tej samej siatce — w trzecim wierszu, obok warunków pomiaru, a nie
            w osobnym pasie na całą szerokość karty. */}
        <label className="block min-w-0 sm:col-span-2 lg:col-span-3 xl:col-span-3">
          <div className="mb-1 text-xs text-slate-500">Uwagi / zalecenia (drukowane na protokole)</div>
          <textarea
            value={header.uwagi || ""}
            onChange={(e) => setDocHeader({ uwagi: e.target.value })}
            rows={2}
            className="pe-input w-full text-sm"
          />
        </label>
        </div>
        </>
        )}
        {/* Ostrzeżenie o brakach zostaje widoczne TAKŻE po zwinięciu — inaczej
            zwinięcie sekcji chowałoby jedyny sygnał, że protokół wyjdzie niekompletny. */}
        {!headerReady && (
          <p className={daneZwiniete ? "text-xs" : "mt-2 text-xs"} style={{ color: "#8A5526" }}>
            Uzupełnij co najmniej „Obiekt” i „Wykonawca pomiarów” — te dane trafiają do nagłówka każdego protokołu.
          </p>
        )}
      </div>

      {/* Siatka o RÓWNYCH kolumnach, nie `flex-wrap`. Przy różnych szerokościach
          siódmy kafelek („Ochrona odgromowa (LPS)") zostawał sam w drugim rzędzie
          i czytał się jak coś, co się nie zmieściło. Przy czterech kolumnach siedem
          protokołów układa się 4 + 3, a równe szerokości sprawiają, że niepełny
          ostatni rząd wygląda normalnie — także gdyby kiedyś doszedł ósmy protokół. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PROTOCOL_ORDER.map((k) => {
          const d = PROTOCOL_DEFS[k];
          const st = protocols[k];
          const v = st ? protocolVerdict(d, st.rows, limitOceny(d, st.limit ?? d.limitDefault ?? 0)) : null;
          return (
            <button
              key={k}
              onClick={() => {
                setActive(k);
                // Na telefonie kafelki stoją jeden pod drugim, a protokół otwiera się
                // pod nimi — po stuknięciu zmieniało się tylko obramowanie kafelka,
                // a formularz zostawał poza ekranem.
                if (waskiEkran()) requestAnimationFrame(() => kartaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}
              className="rounded-lg px-3 py-2 text-left text-xs"
              style={
                active === k
                  ? { background: "#2D5A8C12", border: "1px solid #2D5A8C", color: "#2D5A8C" }
                  : { background: "#fff", border: "1px solid #DCE2E8", color: "#4F5D73" }
              }
            >
              <div className="font-semibold">{d.title}</div>
              <div className="mt-0.5 flex items-center gap-1 text-xs">
                {st?.rows?.length ? `${st.rows.length} poz.` : "brak danych"}
                {v === true && <span style={{ color: "#3B8C63" }}>· pozytywny</span>}
                {v === false && <span style={{ color: "#C6433A" }}>· negatywny</span>}
                {v === null && !!st?.rows?.length && <span style={{ color: "#8A5526" }}>· niekompletny</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div ref={kartaRef} className="pe-card scroll-mt-3 p-5" data-testid="karta-protokolu">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="pe-display text-base">{def.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{def.intro}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Podgląd stoi PRZED pobieraniem, bo taka jest kolejność pracy: najpierw
                sprawdzam, czy protokół się zgadza, dopiero potem odkładam plik. */}
            <button
              onClick={() => setPodglad(true)}
              disabled={blokadaPdf}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-slate-600 hover:text-ink disabled:opacity-50"
            >
              <Eye size={14} /> Podgląd
            </button>
            <Button variant="primary" size="md"
              onClick={async () => setBlocked(!(await downloadProtocolPdf(active, header, rows, limit)))}
              disabled={blokadaPdf}
            >
              <Download size={14} /> Pobierz protokół (PDF)
            </Button>
          </div>
          {ujemne.length > 0 && (
            <p role="alert" data-testid="ujemne-wartosci" className="w-full text-xs text-red-700">
              Popraw wartości ujemne, zanim protokół trafi do PDF:{" "}
              {ujemne.map((u) => `pozycja ${u.wiersz} (${u.kolumny.join(", ")})`).join("; ")}. Wielkości mierzone nie mogą
              być ujemne.
            </p>
          )}
          {!headerReady && rows.length > 0 && ujemne.length === 0 && (
            <p role="status" className="w-full text-xs text-amber-700">
              Brakuje „Obiektu” albo „Wykonawcy pomiarów” w danych ogólnych — PDF da się pobrać, ale bez nich protokół nie
              jest kompletnym dokumentem.
            </p>
          )}

          <PdfPreview
            open={podglad}
            onOpenChange={setPodglad}
            title={def.title}
            filename={projectFileName(`protokol-${active}`, header.obiekt, "pdf")}
            build={() => buildProtocolPdf(active, header, rows, limit)}
          />
        </div>

        {blocked && (
          <div className="mb-3 flex gap-2 rounded-md p-2.5 text-xs" style={{ background: "#C1793F14", color: "#8A5526" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Przeglądarka zablokowała pobieranie w tym widoku. Spróbuj ponownie lub otwórz aplikację w osobnej karcie.
          </div>
        )}

        {def.checklist ? (
          rows.length === 0 ? (
            <Button variant="secondary" size="md" onClick={initChecklist}>
              <Plus size={14} /> Wczytaj listę kontrolną oględzin
            </Button>
          ) : (
            // Najwyżej 56rem: przy 1920 px treść pozycji stała przy lewej krawędzi,
            // a „zgodne / niezgodne / n/d" ok. 1600 px dalej.
            <div className="space-y-1 xl:max-w-4xl" data-testid="lista-ogledzin">
              {/* Na wąskim ekranie pozycja łamie się na dwie linie: treść na całą
                  szerokość, pod nią oceny i kosz. W jednym rzędzie na treść zostawało
                  62 px („Izolacja pr…") i nie było wiadomo, co się właściwie ocenia. */}
              {rows.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 border-b py-1.5 last:border-0 md:flex-nowrap" style={{ borderColor: "#EEF1F4" }}>
                  <span className="w-6 self-start pt-0.5 text-xs text-slate-400">{i + 1}.</span>
                  <TrescPozycji
                    value={String(r.text ?? "")}
                    onChange={(v) => setRow(i, { text: v })}
                    etykieta={`Pozycja oględzin ${i + 1}`}
                  />
                  <div className="ml-8 flex shrink-0 gap-1 md:ml-0">
                    {STATUS_OPTIONS.map(([v, lbl, col]) => (
                      <button
                        key={v}
                        onClick={() => setRow(i, { status: r.status === v ? "" : v })}
                        className="rounded-md px-2 py-1 text-xs"
                        style={
                          r.status === v
                            ? { background: `${col}1A`, color: col, border: `1px solid ${col}` }
                            : { background: "#fff", color: "#5B6A80", border: "1px solid #DCE2E8" }
                        }
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => removeRow(i)}
                    aria-label={`Usuń pozycję ${i + 1}`}
                    className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 flex items-center justify-center ml-auto shrink-0 text-slate-300 hover:text-red-500 md:ml-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <Button variant="secondary" size="sm"
                onClick={() => update({ rows: [...rows, { text: "", status: "" }] })}
                className="mt-2"
              >
                <Plus size={13} /> Dodaj pozycję
              </Button>
            </div>
          )
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">{def.limitLabel}:</span>
              <input
                type="number"
                step="0.1"
                value={wpisany}
                min={def.limitZakres?.[0]}
                max={def.limitZakres?.[1]}
                onChange={(e) => update({ limit: Number(e.target.value) })}
                className="pe-input pe-mono w-24 text-sm"
              />
              <span className="text-xs text-slate-500">{def.limitUnit}</span>
              {limit !== wpisany && (
                <span role="status" className="w-full text-xs text-amber-700">
                  Wartość spoza dopuszczalnego zakresu — do oceny użyto {String(limit).replace(".", ",")}.
                </span>
              )}
            </div>

            {/* Poniżej `lg` każdy wiersz jest KARTĄ — same klasy CSS, ten sam DOM. Tabela
                miała 620–673 px w okienku 285 px: nagłówki łamały się na sześć linii,
                pola wyników miały po 25 px, a „Ocena" i kosz stały za prawą krawędzią
                bez żadnego znaku, że tabelę trzeba przesunąć. Próg `lg`, nie `md`: na
                tablecie w pionie (768–820 px) tabela wracała, a pola pomiarów miały po
                22 px. W karcie pomiary stoją po trzy w rzędzie (telefon) albo po sześć
                (od `sm`), pola tekstowe na całą szerokość albo po dwa, każde z podpisem. */}
            <div className="pe-scroll lg:overflow-x-auto">
              <table className="block w-full text-sm lg:table lg:min-w-[620px]">
                <thead className="hidden lg:table-header-group">
                  <tr className="border-b text-left text-xs text-slate-500" style={{ borderColor: "#DCE2E8" }}>
                    <th className="w-8 py-2 pr-2">Lp.</th>
                    {def.columns!.map((c) => (
                      <th key={c.key} className="py-2 pr-2">
                        {c.label}
                      </th>
                    ))}
                    <th className="w-24 py-2">Ocena</th>
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody className="block lg:table-row-group">
                  {rows.map((r, i) => {
                    const ok = ocenWiersz(def, r, limit);
                    return (
                      <tr
                        key={i}
                        className="grid grid-cols-6 gap-x-2 gap-y-2 border-b py-3 last:border-0 sm:grid-cols-12 lg:table-row lg:py-0"
                        style={{ borderColor: "#EEF1F4" }}
                        data-testid="wiersz-pomiaru"
                      >
                        <td className="col-span-6 text-xs text-slate-400 sm:col-span-12 lg:py-1.5 lg:pr-2">
                          <span className="lg:hidden">Pozycja </span>
                          {i + 1}
                        </td>
                        {def.columns!.map((c) => (
                          <td key={c.key} className={`min-w-0 lg:py-1.5 lg:pr-2 ${c.type === "text" ? "col-span-6" : "col-span-2"}`}>
                            <span className="mb-0.5 block truncate text-xs text-slate-400 lg:hidden">{c.label}</span>
                            {c.type === "computed" ? (
                              <span className="pe-mono text-xs text-slate-500">{c.compute!(r, limit)}</span>
                            ) : c.type === "select" ? (
                              <select
                                value={String(r[c.key] ?? c.default ?? "")}
                                onChange={(e) => setRow(i, { [c.key]: e.target.value })}
                                aria-label={`${c.label}, pozycja ${i + 1}`}
                                className="pe-input pe-select w-full py-1 max-lg:py-1.5 text-base md:text-sm"
                              >
                                {c.options!.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={c.type === "number" ? "number" : "text"}
                                step="any"
                                min={c.type === "number" ? 0 : undefined}
                                value={String(r[c.key] ?? "")}
                                onChange={(e) => setRow(i, { [c.key]: e.target.value })}
                                aria-label={`${c.label}, pozycja ${i + 1}`}
                                aria-invalid={c.type === "number" && Number(r[c.key]) < 0 ? true : undefined}
                                className={`pe-input w-full py-1 text-xs max-lg:py-1.5 max-lg:text-sm ${c.type === "number" ? "pe-mono" : ""} ${c.type === "number" && Number(r[c.key]) < 0 ? "!border-red-500" : ""}`}
                              />
                            )}
                          </td>
                        ))}
                        <td className="col-span-4 flex items-center sm:col-span-10 lg:table-cell lg:py-1.5">
                          {ujemne.some((u) => u.wiersz === i + 1) ? (
                            <span className="text-xs font-medium text-red-700">wartość ujemna</span>
                          ) : ok === null ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <span
                              className="pe-chip"
                              style={ok ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}
                            >
                              {ok ? "pozytywna" : "negatywna"}
                            </span>
                          )}
                        </td>
                        <td className="col-span-2 flex justify-end lg:table-cell lg:py-1.5">
                          <button
                            onClick={() => removeRow(i)}
                            aria-label={`Usuń wiersz ${i + 1}`}
                            className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 flex items-center justify-center text-slate-300 hover:text-red-500"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={addRow}>
                <Plus size={13} /> Dodaj wiersz
              </Button>
            </div>
          </>
        )}

        {/* Niekompletny ZAMIAST pozytywnego: wiersze bez wyników nie są „zgodne" — nikt ich
            nie sprawdził (patrz `protocolVerdict`). Na wydruku stoi wtedy „Brak kompletu
            danych", więc tu mówimy to samo i od razu, czego brakuje. */}
        {verdict === null && rows.length > 0 && (() => {
          const brak = wierszeBezOceny(def, rows, limit);
          return (
            <div className="mt-4 rounded-md p-3 text-sm" style={{ background: "#C1793F14", color: "#8A5526" }} data-testid="protokol-niekompletny">
              Niekompletny — {brakOpis(brak, !!def.checklist)}.
              {def.checklist ? " Oceń każdą pozycję albo usuń te, które nie dotyczą obiektu." : " Uzupełnij pomiary albo usuń puste wiersze."}
            </div>
          );
        })()}
        {verdict !== null && (
          <div
            className="mt-4 rounded-md p-3 text-sm"
            style={verdict ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}
          >
            {verdict ? "Wynik pozytywny — instalacja w badanym zakresie spełnia wymagania." : "Wynik negatywny — stwierdzono niezgodności wymagające usunięcia."}
          </div>
        )}
      </div>

      {/* Samo okno listy zestawów mieszka w App.tsx: otwierają je DWA miejsca —
          ten przycisk i menu przy profilu — a dwie kopie tego samego okna
          rozjechałyby się stanem. Tutaj zostaje wyłącznie przełącznik. */}
    </div>
  );
}
