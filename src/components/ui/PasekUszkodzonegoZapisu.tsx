import { TriangleAlert, X } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { downloadBlob, projectFileName } from "@/lib/pdf/download";

/**
 * Komunikat po starcie, gdy zapis projektu w tej przeglądarce nie dał się wczytać.
 *
 * Wcześniej taki zapis wywracał start CAŁEJ aplikacji — biały ekran, także w
 * Kalkulatorach, i żadnej drogi wyjścia bez narzędzi deweloperskich. Teraz zapis jest
 * odkładany na bok (`odlozUszkodzony`), aplikacja startuje z pustym planem, a ten pasek
 * mówi, co się stało, i pozwala pobrać surową kopię — bywa do odratowania ręcznie,
 * a bez tego przycisku zostałaby schowana w pamięci przeglądarki, o której nikt nie wie.
 *
 * Wisi nad KAŻDĄ zakładką, bo użytkownik mógł wejść prosto w Kalkulatory albo
 * Protokoły i nie zobaczyłby komunikatu przypiętego do rzutu.
 */
export function PasekUszkodzonegoZapisu() {
  const zapis = useProjectStore((s) => s.zapisUszkodzony);
  const zamknij = useProjectStore((s) => s.zamknijZapisUszkodzony);
  if (!zapis) return null;

  function pobierz() {
    if (!zapis) return;
    let raw: string | null;
    try {
      raw = localStorage.getItem(zapis.klucz);
    } catch {
      raw = null;
    }
    if (raw === null) return;
    downloadBlob(new Blob([raw], { type: "application/json;charset=utf-8" }), projectFileName("uszkodzony-zapis", zapis.nazwa, "json"));
  }

  return (
    <div
      role="alert"
      data-testid="zapis-uszkodzony"
      className="mb-4 flex flex-wrap items-start gap-2.5 rounded-lg bg-danger-tlo px-3 py-2 text-xs text-danger"
    >
      <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong>Nie udało się otworzyć projektu „{zapis.nazwa}”</strong> — jego zapis w tej przeglądarce jest uszkodzony.
        Zaczynasz od pustego planu. Surowa kopia zapisu została zachowana: pobierz ją, jeśli chcesz spróbować ją odzyskać.
      </span>
      <button type="button" onClick={pobierz} className="shrink-0 font-semibold underline [@media(pointer:coarse)]:min-h-8">
        Pobierz uszkodzony zapis
      </button>
      <button
        type="button"
        onClick={zamknij}
        aria-label="Zamknij komunikat"
        className="shrink-0 rounded p-0.5 hover:bg-black/5 [@media(pointer:coarse)]:min-h-8 [@media(pointer:coarse)]:min-w-8"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
