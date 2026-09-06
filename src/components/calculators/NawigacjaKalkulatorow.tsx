import { useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Clock, Search } from "lucide-react";
import type { CalcId } from "@/store/useCalculatorsStore";
import { filtruj, pogrupuj, type GrupaId, type PozycjaKalkulatora } from "@/lib/calc/grupy";

/**
 * Nawigacja zakładki Kalkulatory: wyszukiwarka, pogrupowana lista i ekran startowy.
 *
 * Osiemnaście pozycji jednym ciągiem wymagało od użytkownika, żeby najpierw znał
 * nazwy — a „Impedancja pętli zwarcia" nic nie mówi komuś, kto sprawdza, czy jego
 * instalacja jest bezpieczna. Grupy odpowiadają etapom pracy, wyszukiwarka szuka
 * także po opisie, a wejście na samo „/kalkulatory" pokazuje, co tu w ogóle jest,
 * zamiast wrzucać w przypadkowy kalkulator.
 */

export function SzukajkaKalkulatorow({
  fraza,
  onZmien,
  liczbaWynikow,
}: {
  fraza: string;
  onZmien: (v: string) => void;
  liczbaWynikow: number;
}) {
  const ref = useRef<HTMLInputElement>(null);

  /**
   * ⌘K / Ctrl+K ustawia kursor w wyszukiwarce.
   *
   * Skrót jest tu konwencją, nie ozdobą: kto zna go z innych narzędzi, spróbuje go
   * odruchowo. Escape czyści frazę i oddaje pełną listę — inaczej po nieudanym
   * szukaniu trzeba by kasować tekst znak po znaku.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative mb-2">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={ref}
        type="search"
        value={fraza}
        onChange={(e) => onZmien(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onZmien("");
        }}
        placeholder="Szukaj kalkulatora…"
        aria-label="Szukaj kalkulatora"
        className="pe-input w-full py-1.5 pl-8 pr-12 text-xs"
      />
      <kbd
        aria-hidden="true"
        className="pe-mono pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"
      >
        ⌘K
      </kbd>
      {fraza.trim() !== "" && (
        <p className="mt-1 text-[11px] text-slate-500">
          {liczbaWynikow === 0 ? "Nic nie pasuje — spróbuj innego słowa." : `Pasujących: ${liczbaWynikow}`}
        </p>
      )}
    </div>
  );
}

function Kafel({
  pozycja,
  aktywny,
  onWybierz,
}: {
  pozycja: PozycjaKalkulatora;
  aktywny: boolean;
  onWybierz: (id: CalcId) => void;
}) {
  return (
    <button
      onClick={() => onWybierz(pozycja.id)}
      className="w-full rounded-lg p-3 text-left"
      style={
        aktywny
          ? { background: "#2D5A8C10", border: "1px solid #2D5A8C" }
          : { background: "#fff", border: "1px solid #DCE2E8" }
      }
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium" style={{ color: aktywny ? "#2D5A8C" : "#16202B" }}>
          {pozycja.label}
        </div>
        <div className="text-[11px] leading-snug text-slate-500">{pozycja.desc}</div>
      </div>
    </button>
  );
}

export function ListaKalkulatorow({
  lista,
  aktywny,
  fraza,
  zwiniete,
  onPrzelaczGrupe,
  onWybierz,
}: {
  lista: PozycjaKalkulatora[];
  aktywny: CalcId | null;
  fraza: string;
  zwiniete: GrupaId[];
  onPrzelaczGrupe: (id: GrupaId) => void;
  onWybierz: (id: CalcId) => void;
}) {
  const szuka = fraza.trim() !== "";
  const widoczne = filtruj(lista, fraza);
  // W trakcie szukania grupy schodzą z drogi: liczy się jedna, krótka lista trafień,
  // a nie utrzymanie struktury, przez którą trzeba by wodzić wzrokiem.
  if (szuka) {
    return (
      <div className="space-y-1.5">
        {widoczne.map((p) => (
          <Kafel key={p.id} pozycja={p} aktywny={p.id === aktywny} onWybierz={onWybierz} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pogrupuj(widoczne).map(({ grupa, pozycje }) => {
        if (pozycje.length === 0) return null;
        const schowana = zwiniete.includes(grupa.id);
        return (
          <div key={grupa.id}>
            <button
              onClick={() => onPrzelaczGrupe(grupa.id)}
              aria-expanded={!schowana}
              className="mb-1.5 flex w-full items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-copper"
            >
              {schowana ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              {grupa.tytul}
              <span className="ml-auto font-normal normal-case tracking-normal text-slate-300">{pozycje.length}</span>
            </button>
            {!schowana && (
              <div className="space-y-1.5">
                {pozycje.map((p) => (
                  <Kafel key={p.id} pozycja={p} aktywny={p.id === aktywny} onWybierz={onWybierz} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Ekran wejścia na „/kalkulatory".
 *
 * Zakładka przekierowywała wcześniej wprost do ostatnio otwartego kalkulatora, więc
 * ktoś, kto wchodził tu pierwszy raz, lądował w „Doborze obwodu" bez pojęcia, że
 * obok jest siedemnaście innych narzędzi. Kafelki pokazują cały zakres, a „Ostatnio
 * używane" skracają drogę tym, którzy wiedzą, po co przyszli.
 */
export function EkranStartowy({
  lista,
  ostatnie,
  onWybierz,
}: {
  lista: PozycjaKalkulatora[];
  ostatnie: CalcId[];
  onWybierz: (id: CalcId) => void;
}) {
  const poId = new Map(lista.map((p) => [p.id, p]));
  const ostatnieDoPokazania = ostatnie.map((id) => poId.get(id)).filter((p): p is PozycjaKalkulatora => !!p);

  return (
    <div className="space-y-6">
      {ostatnieDoPokazania.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Clock size={12} /> Ostatnio używane
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ostatnieDoPokazania.map((p) => (
              <Kafel key={p.id} pozycja={p} aktywny={false} onWybierz={onWybierz} />
            ))}
          </div>
        </div>
      )}

      {pogrupuj(lista).map(({ grupa, pozycje }) =>
        pozycje.length === 0 ? null : (
          <div key={grupa.id}>
            <h3 className="mb-0.5 text-[13px] font-semibold text-ink">{grupa.tytul}</h3>
            <p className="mb-2 text-[11.5px] text-slate-500">{grupa.opis}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pozycje.map((p) => (
                <Kafel key={p.id} pozycja={p} aktywny={false} onWybierz={onWybierz} />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
