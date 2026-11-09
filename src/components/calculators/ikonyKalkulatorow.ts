import {
  Activity, Anchor, Battery, Cable, Cog, Earth, Gauge, Lightbulb, PlugZap, RotateCw,
  Ruler, Scale, Shield, ShieldCheck, Split, Sun, ToggleRight, Waves, Zap, type LucideIcon,
} from "lucide-react";
import type { CalcId } from "@/store/useCalculatorsStore";

/**
 * Ikona każdego kalkulatora — jedna mapa dla kafli, wierszy listy i wyboru na telefonie.
 *
 * Dziewiętnaście pozycji samym tekstem czytało się jak spis treści: żeby znaleźć
 * „Uziom”, trzeba było przeczytać wszystko po kolei. Ikona nie zastępuje nazwy (stoi
 * obok i jest `aria-hidden`), tylko pozwala wrócić wzrokiem tam, gdzie się już było.
 */
export const IKONY_KALKULATOROW: Record<CalcId, LucideIcon> = {
  moc: Gauge,
  obwod: Cable,
  gGWkladka: ShieldCheck,
  spadek: Activity,
  dlugosc: Ruler,
  impedancja: Waves,
  zwarcie: Zap,
  petla: RotateCw,
  uziemienieTT: Earth,
  uziom: Anchor,
  rcd: ToggleRight,
  peN: Split,
  bilansFaz: Scale,
  kompensacja: Battery,
  silnik: Cog,
  spd: Shield,
  pv: Sun,
  ev: PlugZap,
  oswietlenie: Lightbulb,
  // Dawne adresy scalone w „Dobór obwodu” (przekierowują do jego trybów — patrz
  // `STARE_ADRESY` w CalculatorsTab.tsx) — ta sama ikona, bo to ten sam kalkulator.
  przekroj: Cable,
  zabezpieczenie: Cable,
  wlz: Cable,
  pelnyDobor: Cable,
};

export function ikonaKalkulatora(id: CalcId): LucideIcon {
  return IKONY_KALKULATOROW[id];
}
