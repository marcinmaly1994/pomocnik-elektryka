/**
 * Łamanie podpisów na rysunkach.
 *
 * Wydzielone z `SchemaTab`, bo tej samej logiki potrzebuje widok czołowy rozdzielnicy:
 * opisy obwodów bywają długie („Obwód dedykowany — Kuchnia (zmywarka)"), a ucięcie
 * wielokropkiem zjada dokładnie tę końcówkę, która odróżnia obwód 1 od obwodu 2.
 * Dwie implementacje tego samego łamania rozjechałyby się przy pierwszej zmianie.
 */

/** Ucina tekst do `max` znaków, dokładając wielokropek. Ostatnia deska ratunku — używane
 *  dla DRUGIEJ linii, gdzie miejsce naprawdę się kończy. */
export function utnij(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + "…";
}

/**
 * Dzieli tekst na dwie linie po `maxChars` znaków każda.
 *
 * Druga linia bywa pusta — wtedy podpis mieści się w jednej i nie ma po co rezerwować
 * miejsca na drugą. Pojedynczy wyraz dłuższy od linii tniemy twardo, inaczej pierwsza
 * linia wyszłaby pusta, a cały podpis zjechałby do drugiej.
 */
export function zawijNaDwieLinie(text: string, maxChars: number): [string, string] {
  const czysty = String(text ?? "").trim();
  if (czysty.length <= maxChars) return [czysty, ""];

  const slowa = czysty.split(/\s+/);
  let pierwsza = "";
  let i = 0;
  while (i < slowa.length && (pierwsza ? pierwsza.length + 1 + slowa[i].length : slowa[i].length) <= maxChars) {
    pierwsza = pierwsza ? `${pierwsza} ${slowa[i]}` : slowa[i];
    i++;
  }
  if (!pierwsza) return [czysty.slice(0, maxChars), utnij(czysty.slice(maxChars), maxChars)];
  return [pierwsza, utnij(slowa.slice(i).join(" "), maxChars)];
}
