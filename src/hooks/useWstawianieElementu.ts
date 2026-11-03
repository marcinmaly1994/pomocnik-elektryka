import { useCallback, useState } from "react";
import { useActiveFloorElements, useActiveFloorRoomShapes, useProjectStore } from "@/store/useProjectStore";
import { detectRoomName, scaleOf } from "@/lib/design";
import { VARIANTS_FOR } from "@/lib/elements";
import { bezNakladaniaNaSasiadow } from "@/lib/rozstawElementow";
import type { ElementType, InstallationElement, Point } from "@/types";

/**
 * Wstawianie elementu z biblioteki: co właśnie stawiamy i z jakimi ustawieniami.
 *
 * Czwarte skupisko wyjęte z `DesignTab`, ale niepełne i celowo. Sama geometria —
 * przyciąganie do ściany i rozsuwanie od sąsiadów — NIE jest stanem komponentu, więc nie
 * wchodzi do hooka: rozsuwanie mieszka w `lib/rozstawElementow.ts` obok
 * `odsunOdSasiadow`, które i tak opakowywało, a przyciąganie hook dostaje funkcją, bo
 * służy też przeciąganiu i zależy od ustawienia, które należy do warstw widoku.
 * Dopóki obie siedziały wewnątrz komponentu, dało się je sprawdzić wyłącznie klikając
 * po planie w przeglądarce.
 */
export interface WstawianieElementuApi {
  /** Typ wybrany w bibliotece — ten, który postawi następny klik w plan. */
  activeType: ElementType;
  setActiveType: React.Dispatch<React.SetStateAction<ElementType>>;
  /** „Dedykowane (AGD)" — dotyczy WYŁĄCZNIE gniazda, patrz `wstaw`. */
  dedicated: boolean;
  setDedicated: React.Dispatch<React.SetStateAction<boolean>>;
  /** Wariant (pojedyncze/podwójne) pamiętany PER TYP, żeby przełączenie na inny typ
   *  i powrót nie gubiło wyboru. */
  gangsForType: (t: ElementType) => number;
  ustawGangs: (t: ElementType, gangs: number) => void;
  /** Stawia element w klikniętym miejscu — po przyciągnięciu do ściany i odsunięciu
   *  od sąsiadów. */
  wstaw: (p: Point) => void;
  /** Pozycja i obrót, w jakich `wstaw` postawi element po kliknięciu w `p` — dla ducha
   *  pod kursorem. Nic nie zapisuje. */
  podglad: (p: Point) => { x: number; y: number; rotation: number };
}

export function useWstawianieElementu(opcje: {
  /** Skala renderu symboli — ta sama, którą rysuje płótno; rozsuwanie mierzy pudełka
   *  glifów, więc bez niej odstępy byłyby liczone w innej skali niż rysunek. */
  skalaSymboli: number;
  /** Pozycja i obrót po ewentualnym przyklejeniu do ściany. Wspólne ze ścieżką
   *  przeciągania, dlatego przychodzi z zewnątrz, a nie mieszka tutaj. */
  przyciagnijDoSciany: (p: Point, type: ElementType, obecnyObrot?: number) => { x: number; y: number; rotation: number };
}): WstawianieElementuApi {
  const { skalaSymboli, przyciagnijDoSciany } = opcje;
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const setDraft = useProjectStore((s) => s.setDraft);
  const scales = useProjectStore((s) => s.scales);
  const elements = useActiveFloorElements();
  const roomShapes = useActiveFloorRoomShapes();
  const mpu = scaleOf(scales, activeFloorId);

  const [activeType, setActiveType] = useState<ElementType>("gniazdko");
  const [dedicated, setDedicated] = useState(false);
  const [gangsByType, setGangsByType] = useState<Partial<Record<ElementType, number>>>({});

  const gangsForType = useCallback(
    (t: ElementType) => (VARIANTS_FOR[t] ? gangsByType[t] || 1 : 1),
    [gangsByType]
  );

  const ustawGangs = useCallback((t: ElementType, gangs: number) => {
    setGangsByType((g) => ({ ...g, [t]: gangs }));
  }, []);

  /**
   * Gdzie i w jakim obrocie stanie element po kliknięciu w `p`: najpierw przyklejenie do
   * ściany, potem odsunięcie od sąsiadów. JEDNA funkcja dla `wstaw` i dla podglądu —
   * duch pod kursorem ma pokazywać dokładnie to, co postawi klik, a dwie osobne ścieżki
   * rozjechałyby się przy pierwszej zmianie reguł przyciągania.
   */
  const policzWstawienie = useCallback(
    (p: Point) => {
      const m = przyciagnijDoSciany(p, activeType);
      // Kandydat potrzebny w całości, bo rozmiar symbolu zależy od typu (i od wymiarów
      // przyboru sanitarnego), a nie da się go policzyć z samych współrzędnych.
      const rozstaw = bezNakladaniaNaSasiadow(
        { id: "", type: activeType, x: m.x, y: m.y, rotation: m.rotation, floor: activeFloorId } as InstallationElement,
        elements,
        skalaSymboli,
        mpu
      );
      return { m, rozstaw };
    },
    [przyciagnijDoSciany, activeType, activeFloorId, elements, skalaSymboli, mpu]
  );

  const podglad = useCallback(
    (p: Point) => {
      const { m, rozstaw } = policzWstawienie(p);
      return { x: rozstaw.x, y: rozstaw.y, rotation: m.rotation };
    },
    [policzWstawienie]
  );

  const wstaw = useCallback(
    (p: Point) => {
      const { m, rozstaw } = policzWstawienie(p);
      setDraft((d) => ({
        ...d,
        elements: [
          ...d.elements,
          {
            id: crypto.randomUUID(),
            type: activeType,
            ...rozstaw,
            // Pomieszczenie liczone z pozycji PO przyciągnięciu — element ląduje wtedy
            // dokładnie na linii obrysu, gdzie decyduje tolerancja z `detectRoomName`.
            room: detectRoomName(m, roomShapes, mpu),
            floor: activeFloorId,
            dedicated: activeType === "gniazdko" ? dedicated : false,
            note: activeType === "gniazdko" && dedicated ? "AGD" : "",
            gangs: gangsForType(activeType),
            rotation: m.rotation,
            // Domyślna litera przy stawianiu z biblioteki — użytkownik podmienia ją na
            // właściwą (L, Z, …) w edycji elementu, patrz `EditElementModal`.
            agdLetter: activeType === "wypustAGD" ? "A" : undefined,
          },
        ],
      }));
    },
    [policzWstawienie, activeType, activeFloorId, mpu, roomShapes, dedicated, gangsForType, setDraft]
  );

  return { activeType, setActiveType, dedicated, setDedicated, gangsForType, ustawGangs, wstaw, podglad };
}
