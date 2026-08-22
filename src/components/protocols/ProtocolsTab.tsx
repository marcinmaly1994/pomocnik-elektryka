import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Plus, Trash2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { PROTOCOL_DEFS, PROTOCOL_ORDER, protocolVerdict, type ProtocolRow } from "@/lib/protocols";
import { downloadProtocolPdf } from "@/lib/pdf/protocol";
import { resolveDocHeader } from "@/lib/docHeader";
import type { ProtocolKey } from "@/types";

const HEADER_FIELDS: [string, string][] = [
  ["obiekt", "Obiekt / nazwa instalacji"], ["adres", "Adres obiektu"], ["zleceniodawca", "Zleceniodawca"],
  ["wykonawca", "Wykonawca pomiarów"], ["uprawnienia", "Nr uprawnień (SEP E/D)"], ["uklad", "Układ sieci"],
  ["przyrzad", "Przyrząd pomiarowy"], ["nrFabryczny", "Nr fabryczny przyrządu"], ["swiadectwo", "Świadectwo wzorcowania"],
  ["data", "Data pomiarów"], ["temperatura", "Temperatura [°C]"], ["wilgotnosc", "Wilgotność [%]"],
  ["drawingNo", "Nr rysunku / dokumentu"], ["revision", "Rewizja"],
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
  ["nd", "n/d", "#64748B"],
];

/**
 * Protokoły pomiarowe — dane ogólne (współdzielony `docHeader` ze store'a, ten
 * sam nagłówek co legenda rozdzielnicy), wybór protokołu, tabela wyników lub
 * lista kontrolna (oględziny), generowanie PDF już gotowym silnikiem z kroku 4.
 * Wiersze protokołów trzymane w store (`protocols`, nie w historii cofnij/ponów
 * planu — to osobny, niezależny dokument), żeby przetrwały przełączanie
 * zakładek i trafiały do zapisu projektu w chmurze.
 */
export function ProtocolsTab() {
  const rawHeader = useProjectStore((s) => s.docHeader);
  const setDocHeader = useProjectStore((s) => s.setDocHeader);
  const projectName = useProjectStore((s) => s.projectName);
  // Do PDF-a idzie nagłówek z uzupełnionym „Obiektem" (nazwa projektu jako wartość
  // domyślna) — formularz niżej pokazuje ją jako placeholder, więc widać, co się wydrukuje.
  const header = resolveDocHeader(rawHeader, projectName);
  const protocols = useProjectStore((s) => s.protocols);
  const setProtocolState = useProjectStore((s) => s.setProtocolState);

  const [active, setActive] = useState<ProtocolKey>("ogledziny");
  const [blocked, setBlocked] = useState(false);
  /** Dane ogólne wypełnia się RAZ na zlecenie, a potem przewija się je przy każdym
   *  wejściu w zakładkę. Stan zwinięcia w localStorage, bo to preferencja widoku,
   *  a nie część protokołu. */
  const [daneZwiniete, setDaneZwiniete] = useState(odczytajDaneZwiniete);
  const [nazwaObwodu, setNazwaObwodu] = useState("");

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

  const def = PROTOCOL_DEFS[active];
  const state = protocols[active] ?? { rows: [] };
  const rows = state.rows;
  const limit = state.limit ?? def.limitDefault ?? 0;

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
  /** Dokłada komplet wierszy dla jednego obwodu — po jednym na parę pomiarową.
   *  Nazwa obwodu wpisywana raz, zamiast powtarzania jej w dziesięciu wierszach. */
  function addGroup(grupa: { pary: string[] }) {
    const blank: ProtocolRow = {};
    (def.columns ?? []).forEach((c) => {
      blank[c.key] = c.default !== undefined ? c.default : "";
    });
    update({ rows: [...rows, ...grupa.pary.map((para) => ({ ...blank, obwod: nazwaObwodu, para }))] });
    setNazwaObwodu("");
  }
  function initChecklist() {
    update({ rows: (def.items ?? []).map((t) => ({ text: t, status: "" })) });
  }

  const verdict = protocolVerdict(def, rows, limit);
  const headerReady = !!header.obiekt && !!header.wykonawca;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pe-display mb-1 text-xl">Protokoły pomiarowe</h2>
        <p className="text-sm text-slate-500">
          Protokoły z pomiarów odbiorczych i okresowych instalacji elektrycznej (zakres wg PN-HD 60364-6). Wypełnij
          dane ogólne, uzupełnij wyniki, pobierz gotowy protokół w PDF.
        </p>
      </div>

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
          <h3 className="pe-display text-[15px]">Dane ogólne (wspólne dla wszystkich protokołów)</h3>
          {daneZwiniete && (
            <span className="ml-auto truncate pl-3 text-xs text-slate-400">
              {[header.obiekt, header.wykonawca, header.data].filter(Boolean).join(" · ") || "nie wypełniono"}
            </span>
          )}
        </button>
        {!daneZwiniete && (
        <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HEADER_FIELDS.map(([k, label]) => (
            <label key={k} className="block">
              <div className="mb-1 text-xs text-slate-500">{label}</div>
              {k === "uklad" ? (
                <select
                  value={header.uklad}
                  onChange={(e) => setDocHeader({ uklad: e.target.value as typeof header.uklad })}
                  className="pe-input w-full text-sm"
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
        </div>
        <label className="mt-3 block">
          <div className="mb-1 text-xs text-slate-500">Uwagi / zalecenia (drukowane na protokole)</div>
          <textarea
            value={header.uwagi || ""}
            onChange={(e) => setDocHeader({ uwagi: e.target.value })}
            rows={2}
            className="pe-input w-full text-sm"
          />
        </label>
        </>
        )}
        {/* Ostrzeżenie o brakach zostaje widoczne TAKŻE po zwinięciu — inaczej
            zwinięcie sekcji chowałoby jedyny sygnał, że protokół wyjdzie niekompletny. */}
        {!headerReady && (
          <p className={daneZwiniete ? "text-[11px]" : "mt-2 text-[11px]"} style={{ color: "#8A5526" }}>
            Uzupełnij co najmniej „Obiekt” i „Wykonawca pomiarów” — te dane trafiają do nagłówka każdego protokołu.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {PROTOCOL_ORDER.map((k) => {
          const d = PROTOCOL_DEFS[k];
          const st = protocols[k];
          const v = st ? protocolVerdict(d, st.rows, st.limit ?? d.limitDefault ?? 0) : null;
          return (
            <button
              key={k}
              onClick={() => setActive(k)}
              className="rounded-lg px-3 py-2 text-left text-xs"
              style={
                active === k
                  ? { background: "#2D5A8C12", border: "1px solid #2D5A8C", color: "#2D5A8C" }
                  : { background: "#fff", border: "1px solid #DCE2E8", color: "#64748B" }
              }
            >
              <div className="font-semibold">{d.title}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px]">
                {st?.rows?.length ? `${st.rows.length} poz.` : "brak danych"}
                {v === true && <span style={{ color: "#3B8C63" }}>· pozytywny</span>}
                {v === false && <span style={{ color: "#C6433A" }}>· negatywny</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="pe-card p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="pe-display text-[15px]">{def.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{def.intro}</p>
          </div>
          <button
            onClick={async () => setBlocked(!(await downloadProtocolPdf(active, header, rows, limit)))}
            disabled={!rows.length}
            className="pe-btn-copper flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50"
          >
            <Download size={14} /> Pobierz protokół (PDF)
          </button>
        </div>

        {blocked && (
          <div className="mb-3 flex gap-2 rounded-md p-2.5 text-xs" style={{ background: "#C1793F14", color: "#8A5526" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Przeglądarka zablokowała pobieranie w tym widoku. Spróbuj ponownie lub otwórz aplikację w osobnej karcie.
          </div>
        )}

        {def.checklist ? (
          rows.length === 0 ? (
            <button onClick={initChecklist} className="pe-btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm">
              <Plus size={14} /> Wczytaj listę kontrolną oględzin
            </button>
          ) : (
            <div className="space-y-1">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 border-b py-1.5 last:border-0" style={{ borderColor: "#EEF1F4" }}>
                  <span className="w-6 text-xs text-slate-400">{i + 1}.</span>
                  <input
                    value={String(r.text ?? "")}
                    onChange={(e) => setRow(i, { text: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <div className="flex shrink-0 gap-1">
                    {STATUS_OPTIONS.map(([v, lbl, col]) => (
                      <button
                        key={v}
                        onClick={() => setRow(i, { status: r.status === v ? "" : v })}
                        className="rounded-md px-2 py-1 text-[11px]"
                        style={
                          r.status === v
                            ? { background: `${col}1A`, color: col, border: `1px solid ${col}` }
                            : { background: "#fff", color: "#94A3B8", border: "1px solid #DCE2E8" }
                        }
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => removeRow(i)} className="shrink-0 text-slate-300 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => update({ rows: [...rows, { text: "", status: "" }] })}
                className="pe-btn-ghost mt-2 flex items-center gap-1 px-2.5 py-1.5 text-xs"
              >
                <Plus size={13} /> Dodaj pozycję
              </button>
            </div>
          )
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">{def.limitLabel}:</span>
              <input
                type="number"
                step="0.1"
                value={limit}
                onChange={(e) => update({ limit: Number(e.target.value) })}
                className="pe-input pe-mono w-24 text-sm"
              />
              <span className="text-xs text-slate-500">{def.limitUnit}</span>
            </div>

            <div className="pe-scroll overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 620 }}>
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500" style={{ borderColor: "#DCE2E8" }}>
                    {def.columns!.map((c) => (
                      <th key={c.key} className="py-2 pr-2">
                        {c.label}
                      </th>
                    ))}
                    <th className="w-24 py-2">Ocena</th>
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const ok = def.evaluate!(r, limit);
                    return (
                      <tr key={i} className="border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                        {def.columns!.map((c) => (
                          <td key={c.key} className="py-1.5 pr-2">
                            {c.type === "computed" ? (
                              <span className="pe-mono text-xs text-slate-500">{c.compute!(r)}</span>
                            ) : c.type === "select" ? (
                              <select
                                value={String(r[c.key] ?? c.default ?? "")}
                                onChange={(e) => setRow(i, { [c.key]: e.target.value })}
                                className="pe-input w-full py-1 text-xs"
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
                                value={String(r[c.key] ?? "")}
                                onChange={(e) => setRow(i, { [c.key]: e.target.value })}
                                className={`pe-input w-full py-1 text-xs ${c.type === "number" ? "pe-mono" : ""}`}
                              />
                            )}
                          </td>
                        ))}
                        <td className="py-1.5">
                          {ok === null ? (
                            <span className="text-xs text-slate-300">—</span>
                          ) : (
                            <span
                              className="pe-chip"
                              style={ok ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}
                            >
                              {ok ? "pozytywna" : "negatywna"}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5">
                          <button onClick={() => removeRow(i)} className="text-slate-300 hover:text-red-500">
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
              <button onClick={addRow} className="pe-btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs">
                <Plus size={13} /> Dodaj wiersz
              </button>
              {/* Komplet par jednym kliknięciem. Liczba pomiarów wynika z układu sieci
                  i łatwo o niej zapomnieć — przycisk pilnuje, żeby żadna para nie wypadła. */}
              {def.grupy?.map((g) => (
                <button
                  key={g.id}
                  onClick={() => addGroup(g)}
                  title={`Dodaje ${g.pary.length} wierszy: ${g.pary.join(", ")}`}
                  className="pe-btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs"
                >
                  <Plus size={13} /> {g.label}
                </button>
              ))}
            </div>
            {def.grupy && (
              <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                Nazwa obwodu dla dodawanego kompletu:
                <input
                  value={nazwaObwodu}
                  onChange={(e) => setNazwaObwodu(e.target.value)}
                  placeholder="np. Obwód gniazd — kuchnia"
                  aria-label="Nazwa obwodu dla dodawanego kompletu"
                  className="pe-input w-56 text-sm"
                />
              </label>
            )}
          </>
        )}

        {verdict !== null && (
          <div
            className="mt-4 rounded-md p-3 text-sm"
            style={verdict ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}
          >
            {verdict ? "Wynik pozytywny — instalacja w badanym zakresie spełnia wymagania." : "Wynik negatywny — stwierdzono niezgodności wymagające usunięcia."}
          </div>
        )}
      </div>
    </div>
  );
}
