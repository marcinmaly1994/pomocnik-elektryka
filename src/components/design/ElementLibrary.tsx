import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type { ElementType } from "@/types";
import { ELEMENT_SECTIONS, ELEMENT_TYPES, SEARCH_KEYWORDS, libSubtitle } from "@/lib/elements";
import { GlyphPreview } from "@/components/design/ElementGlyphSvg";

interface ElementLibraryProps {
  activeType: ElementType;
  onPick: (type: ElementType) => void;
  gangs: number;
  onSetGangs: (type: ElementType, gangs: number) => void;
  dedicated: boolean;
  onToggleDedicated: (dedicated: boolean) => void;
  /** Lista ma wypełnić wysokość rodzica zamiast kończyć się na 560 px. Włączane
   *  w trybie pełnoekranowym, gdzie panel ma znaną, pełną wysokość okna. */
  wypelnijWysokosc?: boolean;
  /**
   * Górna krawędź pływającej karty przewodnika „Zacznij w 3 krokach" [px okna];
   * `null`, gdy karty nie ma na ekranie.
   *
   * Karta jest `fixed` w lewym dolnym rogu, czyli DOKŁADNIE nad tą listą, i kładła się
   * na jej dolnej połowie: przy kroku „Postaw pierwszy element" zasłaniała listę, z
   * której ten element trzeba wybrać. Pozycji karty nie da się poprawić — każde inne
   * miejsce zasłania rysunek albo przycisk „Dalej" (patrz komentarz w
   * OnboardingChecklist.tsx) — więc to lista kończy się wyżej, dopóki karta wisi.
   */
  goraKarty?: number | null;
}

/** Docelowa wysokość listy, gdy nic jej nie ogranicza — dawna sztywna wartość. */
const MAX_WYSOKOSC_LISTY = 560;
/** Poniżej tego lista przestaje być listą, więc na bardzo niskich oknach wolimy
 *  przykrycie kartą niż okienko na dwie pozycje. */
const MIN_WYSOKOSC_LISTY = 200;
/** Przeswit miedzy dolem kolumny a karta: 8 px na oddech plus 8 px wlasnego
 *  paddingu panelu, ktory idzie POD lista i tez musi sie zmiescic. */
const ODSTEP_OD_KARTY = 16;

/** Biblioteka elementów do umieszczania na planie: akordeon sekcji, szukajka,
 *  wybór liczby gniazd/klawiszy w ramce tam, gdzie dany typ na to pozwala. */
export function ElementLibrary({
  activeType,
  onPick,
  gangs,
  onSetGangs,
  dedicated,
  onToggleDedicated,
  wypelnijWysokosc = false,
  goraKarty = null,
}: ElementLibraryProps) {
  /**
   * Miejsce, które lista oddaje karcie przewodnika: skrócony limit wysokości w widoku
   * zwykłym, plus zapas na dole na wypadek, gdyby skrócenie nie wystarczyło.
   *
   * Liczone od górnej krawędzi listy w układzie DOKUMENTU (`+ window.scrollY`), a nie
   * w oknie. Karta jest przyklejona do dołu okna, więc przewinięcie strony w dół
   * odsuwa ją od listy — najciaśniej jest zawsze na samej górze strony i pod ten
   * przypadek liczymy. Dzięki temu wynik nie zmienia się przy przewijaniu, a lista
   * nie skacze pod palcami.
   */
  const listaRef = useRef<HTMLDivElement>(null);
  const stopkaRef = useRef<HTMLDivElement>(null);
  const [miejsce, setMiejsce] = useState({ limit: MAX_WYSOKOSC_LISTY, zapas: 0 });
  useLayoutEffect(() => {
    const zmierz = () => {
      const el = listaRef.current;
      if (!el) return;
      if (goraKarty === null) {
        setMiejsce({ limit: MAX_WYSOKOSC_LISTY, zapas: 0 });
        return;
      }
      const gora = el.getBoundingClientRect().top + window.scrollY;
      // Pod listą stoi jeszcze podpowiedź „kliknij, aby wybrać element" — ona też jest
      // częścią kolumny i też wpadała pod kartę, więc jej wysokość wchodzi w rachunek.
      const stopka = stopkaRef.current ? stopkaRef.current.getBoundingClientRect().height + 16 : 0;
      const limit = Math.max(MIN_WYSOKOSC_LISTY, Math.min(MAX_WYSOKOSC_LISTY, goraKarty - gora - stopka - ODSTEP_OD_KARTY));
      // Na bardzo niskim oknie kolumna zaczyna się tak nisko, że listy NIE DA SIĘ
      // zmieścić nad kartą — limit opiera się wtedy o minimum i przykrycie zostaje.
      // Ten zapas go nie usuwa, ale sprawia, że każdą pozycję da się spod karty
      // wyprzewijać bez ruszania całą stroną.
      setMiejsce({ limit, zapas: Math.max(0, gora + limit + stopka - goraKarty + ODSTEP_OD_KARTY) });
    };
    zmierz();
    window.addEventListener("resize", zmierz);
    return () => window.removeEventListener("resize", zmierz);
  }, [goraKarty]);

  const [openSection, setOpenSection] = useState<string | null>(
    () => ELEMENT_SECTIONS.find((s) => s.items.some((i) => i.key === activeType))?.title ?? ELEMENT_SECTIONS[0].title
  );
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const visibleSections = query
    ? ELEMENT_SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter(
          (i) =>
            ELEMENT_TYPES[i.key].label.toLowerCase().includes(query) ||
            (libSubtitle(i.key, 1) || "").toLowerCase().includes(query) ||
            (SEARCH_KEYWORDS[i.key] ?? []).some((k) => k.toLowerCase().includes(query))
        ),
      })).filter((s) => s.items.length > 0)
    : ELEMENT_SECTIONS;

  return (
    <div
      // 256 px (`w-64`) dopiero od `md` w górę. Poniżej lista bierze całą szerokość
      // panelu, bo ten stoi wtedy POD paskiem narzędzi i ma jej do oddania ~325 px
      // (patrz układ karty w DesignTab.tsx). Sztywne 256 px zostawiało tam 70 px
      // pustego pasa z prawej, a nazwy elementów i tak łamały się na dwie linie.
      className={
        wypelnijWysokosc ? "flex min-h-0 w-full flex-1 shrink-0 flex-col md:w-64" : "w-full shrink-0 md:w-64"
      }
    >
      <div className="relative mb-3">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj elementu…"
          className="pe-input w-full pl-7 pr-6 text-xs"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={13} />
          </button>
        )}
      </div>

      {/* W pełnym ekranie lista rozciąga się na całą dostępną wysokość panelu
          (`flex-1` + `min-h-0`), zamiast kończyć się na sztywnych 560 px. Bez tego
          panel i lista przewijały się NIEZALEŻNIE — dwa suwaki jeden przy drugim,
          i to pierwsze, co rzucało się w oczy po wysunięciu narzędzi. */}
      <div
        className={
          wypelnijWysokosc
            ? "pe-bez-suwaka min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1"
            : "pe-bez-suwaka space-y-1.5 overflow-y-auto pr-1"
        }
        ref={listaRef}
        style={wypelnijWysokosc ? { paddingBottom: miejsce.zapas } : { maxHeight: miejsce.limit, paddingBottom: miejsce.zapas }}
      >
        {visibleSections.map((section) => {
          const isOpen = !!query || openSection === section.title;
          return (
            <div key={section.title} className="rounded-lg border" style={{ borderColor: "#EEF1F4" }}>
              <button
                type="button"
                onClick={() => setOpenSection((s) => (s === section.title ? null : section.title))}
                className="flex w-full items-center justify-between px-2.5 py-2 text-left"
              >
                <span className="text-xs font-semibold text-slate-600">{section.title}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">{section.items.length}</span>
                  {isOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-1 px-2 pb-2">
                  {section.items.map((item) => {
                    const def = ELEMENT_TYPES[item.key];
                    const isActive = activeType === item.key;
                    const g = isActive ? gangs : 1;
                    return (
                      <div key={item.key}>
                        <button
                          type="button"
                          onClick={() => onPick(item.key)}
                          className="flex w-full items-center gap-2 rounded-md p-1.5 text-left"
                          style={{ background: isActive ? `${def.color}10` : "#fff", border: `1px solid ${isActive ? def.color : "#DCE2E8"}` }}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                            <GlyphPreview type={item.key} color={def.color} gangs={g} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11.5px] font-medium text-ink">{def.label}</span>
                            {isActive && <span className="block truncate text-[10px] text-slate-500">{libSubtitle(item.key, g)}</span>}
                          </span>
                        </button>

                        {isActive && item.variants && item.variants.length > 1 && (
                          <div className={`mt-1 grid gap-1 px-0.5 ${item.variants.length > 2 ? "grid-cols-6" : "grid-cols-2"}`}>
                            {item.variants.map((n) => {
                              const sel = g === n;
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => onSetGangs(item.key, n)}
                                  className="rounded-md py-1 text-[11px]"
                                  style={
                                    sel
                                      ? { background: `${def.color}16`, color: def.color, border: `1px solid ${def.color}` }
                                      : { background: "#fff", color: "#64748B", border: "1px solid #DCE2E8" }
                                  }
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {isActive && item.key === "gniazdko" && (
                          <label className="mt-1.5 flex items-center gap-2 px-0.5 text-[11px] text-slate-600">
                            <input type="checkbox" checked={dedicated} onChange={(e) => onToggleDedicated(e.target.checked)} />
                            Dedykowane (AGD)
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {visibleSections.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">Brak wyników dla „{search}”.</p>}
      </div>

      {/* Podpowiedź stoi się na czas przewodnika. Mówi to samo, co karta „Zacznij
          w 3 krokach" w kroku trzecim, a zajmuje prawie 90 px w kolumnie, w której
          właśnie o te 90 px toczy się gra — dwa razy to samo, za cenę połowy listy. */}
      {goraKarty === null && (
        <div ref={stopkaRef} className="mt-4 border-t pt-4 text-[11px] leading-relaxed text-slate-400" style={{ borderColor: "#EEF1F4" }}>
          Kliknij, aby wybrać element, następnie kliknij na planie, żeby go postawić. Pomieszczenie
          dobiera się automatycznie na podstawie tego, gdzie na planie element wyląduje.
        </div>
      )}
    </div>
  );
}
