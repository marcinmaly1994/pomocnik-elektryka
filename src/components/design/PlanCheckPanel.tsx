import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Info, Search } from "lucide-react";
import { podsumowanieProblemow, type PlanIssue, type PlanIssueLevel } from "@/lib/planCheck";

/**
 * Sprawdzenie rzutu — lista spostrzeżeń z `checkPlan`.
 *
 * Kolory i ikony są CELOWO te same co w diagnostyce rozdzielnicy (`SELECTIVITY_STYLE`
 * w PanelTab.tsx): to ta sama kategoria treści w dwóch zakładkach, więc ma się czytać
 * tak samo. Karta na pełną szerokość, pod płótnem, a nie w panelu bocznym — teksty
 * niosą odwołania do normy i całe zdania wyjaśnienia, a kolumna 268 px robi z nich
 * słupek po dwa słowa w wierszu.
 *
 * Czego tu NIE ma: spostrzeżenia nie da się „odhaczyć" ani wyciszyć. To nie lista
 * zadań, tylko odczyt stanu rzutu — znika, kiedy znika powód, i tylko wtedy.
 */

const STYL: Record<PlanIssueLevel, { bg: string; fg: string; Icon: typeof AlertTriangle }> = {
  error: { bg: "#C6433A14", fg: "#A2352C", Icon: AlertTriangle },
  warn: { bg: "#C1793F14", fg: "#8A5526", Icon: AlertTriangle },
  ok: { bg: "#3B8C631A", fg: "#2C6B4A", Icon: Check },
  info: { bg: "#2D5A8C12", fg: "#2D5A8C", Icon: Info },
};

export interface PlanCheckPanelProps {
  issues: PlanIssue[];
  /** Pokaż na planie elementy, których dotyczy spostrzeżenie (zaznacza je). */
  onShowElements: (ids: string[]) => void;
}

export function PlanCheckPanel({ issues, onShowElements }: PlanCheckPanelProps) {
  const maProblemy = issues.some((i) => i.level === "error" || i.level === "warn");
  /**
   * `null` = użytkownik jeszcze nie decydował, więc karta sama się otwiera, gdy jest
   * co pokazać, i zamyka, gdy rzut jest czysty. Świadome kliknięcie w nagłówek
   * zamraża ten wybór do końca sesji — inaczej karta rozwijałaby się z powrotem
   * po każdym postawionym elemencie, czyli wyglądała na niedziałający przycisk.
   */
  const [przelaczone, setPrzelaczone] = useState<boolean | null>(null);
  const otwarte = przelaczone ?? maProblemy;

  const bledy = issues.filter((i) => i.level === "error").length;
  const kolorNaglowka = bledy > 0 ? "#A2352C" : maProblemy ? "#8A5526" : "#2C6B4A";

  return (
    <div className="pe-card mt-2">
      <button
        onClick={() => setPrzelaczone(!otwarte)}
        aria-expanded={otwarte}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        {otwarte ? (
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-slate-400" />
        )}
        <Search size={14} className="shrink-0 text-slate-400" />
        <span className="text-[13px] font-semibold text-ink">Sprawdzenie rzutu</span>
        <span className="text-[11.5px] font-medium" style={{ color: kolorNaglowka }}>
          {podsumowanieProblemow(issues)}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">
          {otwarte ? "zwiń" : "rozwiń"}
        </span>
      </button>

      {otwarte && (
        <div className="space-y-2 px-3.5 pb-3.5">
          {issues.map((s) => {
            const { bg, fg, Icon } = STYL[s.level];
            const doPokazania = s.elementIds.length > 0;
            return (
              <div key={s.rule} className="flex gap-2.5 rounded-md p-3" style={{ background: bg }}>
                <Icon size={15} className="mt-0.5 shrink-0" style={{ color: fg }} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold" style={{ color: fg }}>
                    {s.title}
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: fg }}>
                    {s.detail}
                  </div>
                  {/* Skok z listy na rysunek — bez tego „Gniazdo 230 V (Łazienka)" przy
                      trzech gniazdkach w łazience nie mówi, o KTÓRE chodzi. Tylko tam,
                      gdzie jest co pokazać: reguły o BRAKU czegoś nie mają elementów. */}
                  {doPokazania && (
                    <button
                      onClick={() => onShowElements(s.elementIds)}
                      className="mt-1.5 text-[11px] font-semibold underline"
                      style={{ color: fg }}
                    >
                      Pokaż na planie ({s.elementIds.length})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
