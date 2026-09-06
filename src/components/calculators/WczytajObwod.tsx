import { Download } from "lucide-react";
import type { ObwodDoKalkulatora } from "@/lib/panel/project";

/**
 * Wybór obwodu z rzutu, żeby nie przepisywać jego danych ręcznie.
 *
 * Projekt zna moc, liczbę faz, długość trasy i dobrany aparat każdego obwodu — a mimo
 * to kalkulatory kazały wpisywać te same liczby od nowa. Przepisywanie było wyłącznie
 * okazją do pomyłki: literówka w długości daje inny przekrój, a nic w aplikacji jej nie
 * prostuje.
 *
 * Bez potwierdzenia, w odróżnieniu od „Wczytaj z projektu" w bilansie mocy: tam jedno
 * kliknięcie kasuje całą ręcznie zbudowaną listę odbiorników, tutaj podmienia kilka pól,
 * które użytkownik ma przed oczami i widzi, jak się zmieniają.
 */
export function WczytajObwod({
  obwody,
  onPick,
  hint,
}: {
  obwody: ObwodDoKalkulatora[];
  onPick: (o: ObwodDoKalkulatora) => void;
  /** Co dokładnie ten wybór wypełni — kalkulatory biorą z obwodu różne pola. */
  hint: string;
}) {
  if (obwody.length === 0) return null;
  return (
    <div className="mb-3 rounded-lg border border-dashed p-2.5" style={{ borderColor: "#DCE2E8" }}>
      <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="flex items-center gap-1.5 font-medium">
          <Download size={13} className="text-blueprint" /> Wczytaj obwód z projektu
        </span>
        <select
          // Nie trzyma wyboru: to jest AKCJA, nie ustawienie. Po wczytaniu obowiązują
          // pola formularza — które użytkownik może zaraz poprawić — więc lista
          // pokazująca wciąż „Obwód gniazd 1" kłamałaby o stanie kalkulatora.
          value=""
          onChange={(e) => {
            const o = obwody.find((x) => x.id === e.target.value);
            if (o) onPick(o);
            e.target.value = "";
          }}
          aria-label="Wczytaj obwód z projektu"
          className="pe-input min-w-[220px] flex-1 py-1 text-xs"
        >
          <option value="">wybierz obwód…</option>
          {obwody.map((o) => (
            <option key={o.id} value={o.id}>
              {opisObwodu(o)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{hint}</p>
    </div>
  );
}

/** Podpis pozycji na liście: nazwa plus to, co odróżnia obwody od siebie. Sama nazwa
 *  („Obwód gniazd 2") nie wystarcza do wyboru, gdy jest ich kilkanaście. */
function opisObwodu(o: ObwodDoKalkulatora): string {
  const czesci = [`${o.moc_W} W`];
  if (o.liczba_faz === "3") czesci.push("3-faz.");
  // Brak długości mówi więcej niż jej pominięcie: to sygnał, że rzut nie ma skali
  // albo rozdzielnicy, więc spadku napięcia i tak nie da się z niego policzyć.
  czesci.push(o.dlugosc_m !== undefined ? `${o.dlugosc_m} m` : "bez zmierzonej trasy");
  return `${o.nazwa} — ${czesci.join(", ")}`;
}
