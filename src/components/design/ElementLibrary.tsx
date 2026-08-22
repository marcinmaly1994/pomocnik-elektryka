import { useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import type { ElementType } from "@/types";
import { ELEMENT_SECTIONS, ELEMENT_TYPES, libSubtitle } from "@/lib/elements";
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
}

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
}: ElementLibraryProps) {
  const [openSection, setOpenSection] = useState<string | null>(
    () => ELEMENT_SECTIONS.find((s) => s.items.some((i) => i.key === activeType))?.title ?? ELEMENT_SECTIONS[0].title
  );
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const visibleSections = query
    ? ELEMENT_SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter(
          (i) => ELEMENT_TYPES[i.key].label.toLowerCase().includes(query) || (libSubtitle(i.key, 1) || "").toLowerCase().includes(query)
        ),
      })).filter((s) => s.items.length > 0)
    : ELEMENT_SECTIONS;

  return (
    <div className={wypelnijWysokosc ? "flex min-h-0 w-64 flex-1 shrink-0 flex-col" : "w-64 shrink-0"}>
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
        style={wypelnijWysokosc ? undefined : { maxHeight: 560 }}
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
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</span>
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

      <div className="mt-4 border-t pt-4 text-[11px] leading-relaxed text-slate-400" style={{ borderColor: "#EEF1F4" }}>
        Kliknij, aby wybrać element, następnie kliknij na planie, żeby go postawić. Pomieszczenie
        dobiera się automatycznie na podstawie tego, gdzie na planie element wyląduje.
      </div>
    </div>
  );
}
