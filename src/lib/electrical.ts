/**
 * Czyste funkcje obliczeniowe bez odpowiednika w silniku doboru obwodów
 * (`lib/panel/sizing.ts` + `lib/panel/norms.ts`) — bilans mocy budynku i dobór
 * oświetlenia to zagadnienia inne niż dobór pojedynczego przewodu/zabezpieczenia,
 * więc zostają tu jako osobne, proste kalkulatory.
 *
 * Prąd obliczeniowy, dobór przewodu/zabezpieczenia i spadek napięcia mieszkały
 * kiedyś w tym pliku jako uproszczona, DRUGA kopia tej samej logiki co
 * `sizing.ts` — ale liczoną gorzej (rezystywność miedzi przy 20°C zamiast 70°C
 * pracy pod obciążeniem, jedna metoda ułożenia B2 na sztywno, bez współczynników
 * temperatury/grupowania) i mogącą przez to dać INNY wynik niż automatyczny
 * dobór w zakładce Rozdzielnica dla tych samych danych. Usunięte — kalkulator
 * „Dobór przewodu, zabezpieczenia i spadku napięcia" w `CalculatorsTab.tsx`
 * woła teraz wprost `sizeCircuit()` z `sizing.ts`, tak samo jak Rozdzielnica.
 */

export interface PowerDevice {
  name: string;
  power: number;
}

export interface PowerBalanceResult {
  sumPower: number;
  demandPower: number;
  demandCurrent1: number;
  demandCurrent3: number;
}

/** Pz = Pi × ks (współczynnik jednoczesności), następnie prąd zapotrzebowany
 *  liczony osobno dla wariantu 1- i 3-fazowego (do wyboru w UI wg przyłącza):
 *  I = Pz / (U·cosφ). Domyślnie cosφ = 1 — tak liczył kalkulator przed dodaniem pola. */
export function calcPowerBalance(devices: PowerDevice[], ks: number, cosPhi = 1): PowerBalanceResult {
  const sumPower = devices.reduce((a, d) => a + Number(d.power || 0), 0);
  const demandPower = sumPower * ks;
  const cos = cosPhi > 0 ? cosPhi : 1;
  return {
    sumPower,
    demandPower,
    demandCurrent1: demandPower / (230 * cos),
    demandCurrent3: demandPower / (Math.sqrt(3) * 400 * cos),
  };
}

/**
 * Błędy danych bilansu mocy — każdy jako zdanie dla użytkownika.
 *
 * Bez tego kalkulator przyjmował moc ujemną i ks = 3, a wynik wyglądał jak każdy inny:
 * „moc zapotrzebowana 15 000 W" przy zainstalowanej 5 000 W (audyt 2026-11-04, B10).
 * Pusta lista = dane poprawne, można pokazać wynik.
 */
export function bledyBilansuMocy(devices: PowerDevice[], ks: number, cosPhi: number): string[] {
  const bledy: string[] = [];
  for (const d of devices) {
    const p = Number(d.power);
    if (!Number.isFinite(p)) bledy.push(`Moc odbiornika „${d.name}” nie jest liczbą.`);
    else if (p < 0) bledy.push(`Moc odbiornika „${d.name}” nie może być ujemna.`);
  }
  if (!(ks > 0 && ks <= 1))
    bledy.push("Współczynnik jednoczesności ks musi mieścić się w przedziale (0; 1] — odbiorniki nie pobiorą razem więcej, niż wynosi suma ich mocy.");
  if (!(cosPhi > 0 && cosPhi <= 1)) bledy.push("Współczynnik mocy cos φ musi mieścić się w przedziale (0; 1].");
  return bledy;
}

export interface LightingInput {
  roomAreaM2: number;
  luxRequired: number;
  lumensPerFixture: number;
  maintenanceFactor: number;
  utilizationFactor: number;
}

export interface LightingResult {
  requiredLumens: number;
  fixtureCount: number;
}

/** Metoda strumienia świetlnego: Φ = (E × A) / (UF × MF), liczba opraw = Φ / Φ_oprawy. */
export function calcLighting({
  roomAreaM2,
  luxRequired,
  lumensPerFixture,
  maintenanceFactor,
  utilizationFactor,
}: LightingInput): LightingResult {
  const requiredLumens = (luxRequired * roomAreaM2) / (utilizationFactor * maintenanceFactor || 1);
  const fixtureCount = lumensPerFixture > 0 ? requiredLumens / lumensPerFixture : 0;
  return { requiredLumens, fixtureCount };
}

/** Napięcie dotykowe graniczne w warunkach zwykłych [V] — PN-HD 60364-4-41. */
export const UL = 50;

/**
 * Maksymalna dopuszczalna rezystancja uziemienia w układzie TT, chronionym
 * wyłącznikiem różnicowoprądowym: RA × IΔn ≤ UL, czyli RA_max = UL / IΔn.
 *
 * W układzie TT (w przeciwieństwie do TN, patrz `zsMaxForBreaker`) skuteczność
 * ochrony przeciwporażeniowej nie zależy od impedancji pętli zwarcia, tylko od
 * rezystancji uziomu ORAZ prądu różnicowego wyłącznika, który ten uziom chroni
 * — dlatego IΔn tu w amperach (0,03 dla typowego RCD 30 mA), nie w miliamperach.
 */
export function maxGroundingResistance(idnA: number): number {
  return idnA > 0 ? UL / idnA : 0;
}
