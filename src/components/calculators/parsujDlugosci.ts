/** „40, 60" → [40, 60]. Puste i niepoprawne wpisy odpadają, żeby literówka nie
 *  wywracała kalkulatora w trakcie pisania.
 *
 *  Osobny moduł, bo używa go i `CalculatorsTab`, i wydzielony kalkulator impedancji —
 *  import z tego pierwszego dałby cykl. */
export function parsujDlugosci(tekst: string): number[] {
  return tekst
    .split(/[,;]/)
    .map((s) => Number(s.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
}
