import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Clock, Search } from "lucide-react";
import type { CalcId } from "@/store/useCalculatorsStore";
import { filtruj, pogrupuj, type GrupaId, type PozycjaKalkulatora } from "@/lib/calc/grupy";
import { ikonaKalkulatora } from "./ikonyKalkulatorow";

/**
 * Nawigacja zakładki Kalkulatory: wyszukiwarka, pogrupowana lista i ekran startowy.
 *
 * Osiemnaście pozycji jednym ciągiem wymagało od użytkownika, żeby najpierw znał
 * nazwy — a „Impedancja pętli zwarcia" nic nie mówi komuś, kto sprawdza, czy jego
 * instalacja jest bezpieczna. Grupy odpowiadają etapom pracy, wyszukiwarka szuka
 * także po opisie, a wejście na samo „/kalkulatory" pokazuje, co tu w ogóle jest,
 * zamiast wrzucać w przypadkowy kalkulator.
 */

/**
 * Podpis skrótu w polu wyszukiwania — taki, jaki naciśnie użytkownik TEGO systemu.
 * „⌘K" na Windowsie (audyt 5.11.2026, B12) podpowiadał klawisz, którego tam nie ma;
 * sam skrót i tak działa z Ctrl i z Cmd (patrz nasłuch niżej).
 */
const SKROT_SZUKANIA =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";

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
        // Skrót klawiszowy nic nie mówi na ekranie dotykowym bez klawiatury.
        className="pe-mono pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 [@media(pointer:coarse)]:hidden"
      >
        {SKROT_SZUKANIA}
      </kbd>
      {fraza.trim() !== "" && (
        <p className="mt-1 text-xs text-slate-500">
          {liczbaWynikow === 0 ? "Nic nie pasuje — spróbuj innego słowa." : `Pasujących: ${liczbaWynikow}`}
        </p>
      )}
    </div>
  );
}

/**
 * Wiersz listy bocznej na monitorze: sama nazwa, opis tylko przy aktywnej pozycji.
 *
 * Kafelki z dwuwierszowym opisem dawały ok. 1200 px listy — więcej niż okno. Lista
 * jest przyklejona (`sticky`), więc przy 1440×900 dolne pozycje („Dobór oświetlenia",
 * cała grupa „Zaawansowane") siedziały pod krawędzią ekranu i dało się do nich dojść
 * tylko, przewijając stronę do samego końca. Opis zostaje w dymku (`title`); na ekranie
 * startowym i w wynikach szukania — gdzie wybiera się po opisie — kafelki są pełne.
 */
function WierszListy({
  pozycja,
  aktywny,
  onWybierz,
}: {
  pozycja: PozycjaKalkulatora;
  aktywny: boolean;
  onWybierz: (id: CalcId) => void;
}) {
  const Ikona = ikonaKalkulatora(pozycja.id);
  return (
    <button
      onClick={() => onWybierz(pozycja.id)}
      title={aktywny ? undefined : pozycja.desc}
      aria-current={aktywny ? "page" : undefined}
      className={`w-full rounded-md px-2.5 py-1 text-left ${aktywny ? "bg-blueprint-tlo shadow-[inset_2px_0_0_#2D5A8C]" : "hover:bg-white"}`}
    >
      <div className={`flex items-center gap-2 text-sm leading-5 ${aktywny ? "font-medium text-blueprint" : "font-normal text-ink"}`}>
        <Ikona size={16} aria-hidden="true" className={`shrink-0 ${aktywny ? "text-blueprint" : "text-slate-400"}`} />
        <span className="min-w-0">{pozycja.label}</span>
      </div>
      {/* Opis wyrównany do tekstu nazwy (16 px ikony + 8 px odstępu), nie do ikony. */}
      {aktywny && <div className="pb-0.5 pl-6 text-xs leading-snug text-slate-500">{pozycja.desc}</div>}
    </button>
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
  const Ikona = ikonaKalkulatora(pozycja.id);
  return (
    <button
      onClick={() => onWybierz(pozycja.id)}
      className={`w-full rounded-lg border p-3 text-left ${aktywny ? "border-blueprint bg-blueprint-tlo" : "border-border bg-white"}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${aktywny ? "bg-blueprint text-white" : "bg-blueprint-tlo text-blueprint"}`}
        >
          <Ikona size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className={`text-sm font-medium ${aktywny ? "text-blueprint" : "text-ink"}`}>{pozycja.label}</div>
          <div className="text-xs leading-snug text-slate-500">{pozycja.desc}</div>
        </div>
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
  zwarta = false,
}: {
  lista: PozycjaKalkulatora[];
  aktywny: CalcId | null;
  fraza: string;
  zwiniete: GrupaId[];
  onPrzelaczGrupe: (id: GrupaId) => void;
  onWybierz: (id: CalcId) => void;
  /** Wiersze zamiast kafelków (lista boczna na monitorze, patrz `WierszListy`). */
  zwarta?: boolean;
}) {
  const szuka = fraza.trim() !== "";
  const Pozycja = zwarta ? WierszListy : Kafel;
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
    <div className={zwarta ? "space-y-2" : "space-y-3"}>
      {pogrupuj(widoczne).map(({ grupa, pozycje }) => {
        if (pozycje.length === 0) return null;
        const schowana = zwiniete.includes(grupa.id);
        return (
          <div key={grupa.id}>
            <button
              onClick={() => onPrzelaczGrupe(grupa.id)}
              aria-expanded={!schowana}
              // Na dotyku 44 px wysokości — przy 17 px zwijanie grupy palcem było loterią.
              // Nazwa grupy zwykłą pisownią, jak na ekranie startowym — wersaliki mówiły
              // o tych samych grupach innym głosem niż kafelki obok.
              className={`${zwarta ? "mb-0.5" : "mb-1.5"} flex w-full items-center gap-1 text-left text-xs font-semibold text-slate-500 hover:text-copper [@media(pointer:coarse)]:min-h-11`}
            >
              {schowana ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              {grupa.tytul}
              <span className="ml-auto font-normal text-slate-400">{pozycje.length}</span>
            </button>
            {!schowana && (
              <div className={zwarta ? "space-y-px" : "space-y-1.5"}>
                {pozycje.map((p) => (
                  <Pozycja key={p.id} pozycja={p} aktywny={p.id === aktywny} onWybierz={onWybierz} />
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
 * Wybór kalkulatora na wąskim ekranie.
 *
 * Lista boczna ma stałe 260 px i przy zawijaniu siadała NAD treścią: na telefonie
 * pierwszym, co widział użytkownik, było osiemnaście kafelków, a właściwy kalkulator
 * zaczynał się dwa ekrany niżej. Tutaj lista jest schowana za jednym przyciskiem,
 * który przy okazji mówi, w którym kalkulatorze się jest — czego wersja z zawijaniem
 * nie mówiła wcale.
 */
export function WyborKalkulatoraMobile({
  lista,
  aktywny,
  fraza,
  onZmienFraze,
  zwiniete,
  onPrzelaczGrupe,
  onWybierz,
}: {
  lista: PozycjaKalkulatora[];
  aktywny: CalcId | null;
  fraza: string;
  onZmienFraze: (v: string) => void;
  zwiniete: GrupaId[];
  onPrzelaczGrupe: (id: GrupaId) => void;
  onWybierz: (id: CalcId) => void;
}) {
  const [otwarty, setOtwarty] = useState(false);
  const biezacy = lista.find((p) => p.id === aktywny);
  const IkonaBiezacego = biezacy ? ikonaKalkulatora(biezacy.id) : null;

  return (
    <div className="mb-3 lg:hidden">
      <button
        onClick={() => setOtwarty((v) => !v)}
        aria-expanded={otwarty}
        // Nazwa dostepna mowi, CO ten przycisk robi — sama tresc („Kalkulator /
        // Spadek napiecia") brzmi jak etykieta pola, nie jak przelacznik listy.
        aria-label="Zmień kalkulator"
        className="pe-card flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {IkonaBiezacego && <IkonaBiezacego size={20} aria-hidden="true" className="shrink-0 text-blueprint" />}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Kalkulator</div>
          <div className="truncate text-sm font-medium text-ink">{biezacy?.label ?? "Wybierz kalkulator"}</div>
        </div>
        <ChevronDown
          size={16}
          className="shrink-0 text-slate-400 transition-transform"
          style={otwarty ? { transform: "rotate(180deg)" } : undefined}
        />
      </button>
      {otwarty && (
        <div className="pe-card mt-1.5 max-h-[60vh] overflow-y-auto p-3">
          <SzukajkaKalkulatorow fraza={fraza} onZmien={onZmienFraze} liczbaWynikow={filtruj(lista, fraza).length} />
          <ListaKalkulatorow
            lista={lista}
            aktywny={aktywny}
            fraza={fraza}
            zwiniete={zwiniete}
            onPrzelaczGrupe={onPrzelaczGrupe}
            // Zamknięcie po wyborze jest tu istotne: bez tego wybrany kalkulator
            // zostaje pod listą, poza ekranem, i wygląda, jakby klik nic nie zrobił.
            onWybierz={(id) => {
              onWybierz(id);
              setOtwarty(false);
            }}
          />
        </div>
      )}
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
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Clock size={12} aria-hidden="true" className="text-blueprint" /> Ostatnio używane
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
            <h3 className="mb-0.5 text-sm font-semibold text-ink">{grupa.tytul}</h3>
            <p className="mb-2 text-xs text-slate-500">{grupa.opis}</p>
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
