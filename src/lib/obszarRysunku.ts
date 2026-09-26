import type { InstallationElement, Opening, Point, Wall } from "@/types";
import { computeSanitaryZones } from "./elements";
import { rogiSymbolu } from "./glyphs";
import { prostokatOtworu } from "./rozstawElementow";
import { DEFAULT_WALL_THICKNESS } from "./design";

/**
 * Punkty, do których sięga to, co na rzucie WYSTAJE poza obrys ścian: symbole osprzętu,
 * strefy ochronne przyborów i otwory razem z łukiem skrzydła drzwi.
 *
 * Kadr liczony z samych środków elementów i otworów obcinał wszystko, co od nich
 * odstaje — w przykładowym mieszkaniu łuk drzwi wejściowych i numery obwodów przy
 * dolnej ścianie wystawały ok. 30–40 px za dolną krawędź kadru. Eksport do PDF liczył
 * rogi symboli i strefy od dawna, ale osobno; to jedno źródło dla obu kadrów.
 *
 * @param skalaSymboli skala renderu osprzętu — ta sama, którą rysuje płótno
 */
export function punktyZajeteRysunkiem(
  elementy: InstallationElement[],
  otwory: Opening[],
  sciany: Wall[],
  skalaSymboli: number,
  pietro: string,
  mpu: number | null
): Point[] {
  const symbole = elementy.flatMap((e) => rogiSymbolu(e, skalaSymboli));
  // Strefy sięgają dalej niż sam symbol i liczą się inną skalą — z kalibracji rzutu
  // (patrz `computeSanitaryZones`). Okrąg opisany, jak przy symbolach: kadr ma nie
  // obcinać niezależnie od obrotu przyboru.
  const strefy = computeSanitaryZones(elementy, pietro, mpu).flatMap((z) => {
    const r = Math.hypot(z.w, z.h) / 2 + z.zone2;
    return [
      { x: z.x - r, y: z.y - r },
      { x: z.x + r, y: z.y + r },
    ];
  });
  const drzwiIOkna = otwory.flatMap((o) => {
    const p = prostokatOtworu(o, sciany.find((w) => w.id === o.wallId)?.thickness ?? DEFAULT_WALL_THICKNESS);
    return [
      { x: p.x1, y: p.y1 },
      { x: p.x2, y: p.y2 },
    ];
  });
  return [...symbole, ...strefy, ...drzwiIOkna];
}
