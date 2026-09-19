import { useState } from "react";
import { Maximize2, X } from "lucide-react";
import { czyPodpowiedzOdrzucona, zapamietajOdrzucenie } from "@/lib/podpowiedzPelnyEkran";

/**
 * Podpowiedź o trybie pełnoekranowym — pokazywana wyłącznie na wąskim ekranie.
 *
 * Powód jest zmierzony, nie przeczuty. Na telefonie 375 × 812 płótno w trybie zwykłym
 * ma 360 px, czyli 44% ekranu: nad nim stoi 337 px (nagłówek 95, pasek projektu
 * z kaflami etapów 90, pasek narzędzi 78, szyna narzędzi 74). Pełny ekran daje temu
 * samemu płótnu 605 px, czyli 74%. Mechanizm istnieje od dawna i działa na telefonie —
 * brakowało wyłącznie informacji, że istnieje: to nieopisana ikona wśród sześciu,
 * ze skrótem `F`, o którym spis skrótów w Pomocy też milczał.
 *
 * Znika NA DOBRE w dwóch przypadkach: gdy użytkownik ją zamknie albo gdy choć raz
 * użyje pełnego ekranu. W drugim przypadku już wie, że tryb istnieje, więc dalsze
 * przypominanie byłoby zabieraniem miejsca dokładnie tam, gdzie go brakuje.
 */

export function PodpowiedzPelnyEkran({ onPelnyEkran }: { onPelnyEkran: () => void }) {
  const [schowana, setSchowana] = useState(() => czyPodpowiedzOdrzucona());
  if (schowana) return null;

  function zamknij() {
    zapamietajOdrzucenie();
    setSchowana(true);
  }

  return (
    <div
      data-testid="podpowiedz-pelny-ekran"
      className="mb-2 flex items-center gap-2 rounded-lg border p-2 text-xs sm:hidden"
      style={{ borderColor: "#F0D9C8", background: "#FDF6F0" }}
    >
      <span className="min-w-0 flex-1 text-slate-600">Mało miejsca na rysunek?</span>
      <button
        onClick={onPelnyEkran}
        className="pe-btn-ghost flex shrink-0 items-center gap-1 px-2 py-1"
      >
        <Maximize2 size={13} /> Pełny ekran
      </button>
      <button
        onClick={zamknij}
        aria-label="Zamknij podpowiedź"
        className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <X size={14} />
      </button>
    </div>
  );
}
