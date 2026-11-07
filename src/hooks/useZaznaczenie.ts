import { useCallback, useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import type { Selection } from "@/components/design/DesignCanvas";
import type { Point } from "@/types";

/** Rodzaj obiektu, na którym otwarto menu kontekstowe. `wallDraw` nie jest zaznaczeniem —
 *  to menu płótna w trakcie rysowania ściany, dlatego nie ma go w `Selection`. */
export type RodzajMenu = "el" | "wall" | "room" | "wallDraw" | "opening" | "route";

export interface MenuKontekstowe {
  x: number;
  y: number;
  kind: RodzajMenu;
  id: string;
  /** Menu dotyczy CAŁEJ zaznaczonej grupy, nie jednego elementu pod kursorem. */
  multi: boolean;
  /** Miejsce na PLANIE, w którym otwarto menu — trasa wstawia tam nowy punkt. */
  punkt?: Point;
}

/**
 * Zaznaczenie na planie i menu kontekstowe.
 *
 * Piąte skupisko wyjęte z `DesignTab` i najbardziej opłacalne z dotychczasowych: wzorzec
 * „zaznacz jedno, porzuć zaznaczenie wielokrotne" stał w komponencie DZIEWIĘĆ razy,
 * a sześć razy towarzyszyło mu otwarcie menu kontekstowego. Tutaj jest to jedno
 * `zaznacz` i jedno `menuKontekstowe`.
 *
 * Trzymane razem, bo menu bez zaznaczenia nie ma sensu: jego pozycje dotyczą tego, co
 * zaznaczone, więc otwarcie menu MUSI najpierw zaznaczyć to, w co kliknięto.
 */
export interface ZaznaczenieApi {
  selected: Selection;
  setSelected: React.Dispatch<React.SetStateAction<Selection>>;
  /** Zaznaczenie wielokrotne (tylko elementy) — id-ki, nie obiekty. */
  multiSelected: string[];
  setMultiSelected: React.Dispatch<React.SetStateAction<string[]>>;
  /** Zaznacza JEDEN obiekt i porzuca zaznaczenie wielokrotne. */
  zaznacz: (kind: NonNullable<Selection>["kind"], id: string) => void;
  /** Zdejmuje wszystko: zaznaczenie pojedyncze, wielokrotne i menu. */
  wyczysc: () => void;
  contextMenu: MenuKontekstowe | null;
  zamknijMenu: () => void;
  /** Zaznacza i otwiera menu — w tej kolejności. */
  menuKontekstowe: (kind: RodzajMenu, id: string, x: number, y: number, punkt?: Point) => void;
  /** Menu na ELEMENCIE. Osobno, bo element bywa częścią zaznaczonej grupy i wtedy menu
   *  ma dotyczyć całej grupy, a klik nie może jej rozbić. */
  menuElementu: (id: string, x: number, y: number) => void;
  /** Menu płótna w trakcie rysowania ściany — nic nie zaznacza. */
  menuRysowanejSciany: (x: number, y: number) => void;
  /** Usuwa to, co zaznaczone. Trasa nie jest obiektem projektu, tylko widokiem
   *  policzonym z planu, więc „usunięcie" kasuje jej ręczną poprawkę i wraca do
   *  routingu automatycznego. */
  usunZaznaczone: () => void;
}

export function useZaznaczenie(): ZaznaczenieApi {
  const setDraft = useProjectStore((s) => s.setDraft);
  const removeElements = useProjectStore((s) => s.removeElements);
  const deleteRoomShape = useProjectStore((s) => s.deleteRoomShape);
  const clearRouteOverride = useProjectStore((s) => s.clearRouteOverride);

  const [selected, setSelected] = useState<Selection>(null);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<MenuKontekstowe | null>(null);

  const zaznacz = useCallback((kind: NonNullable<Selection>["kind"], id: string) => {
    setSelected({ kind, id });
    setMultiSelected([]);
  }, []);

  const wyczysc = useCallback(() => {
    setSelected(null);
    setMultiSelected([]);
    setContextMenu(null);
  }, []);

  const zamknijMenu = useCallback(() => setContextMenu(null), []);

  const menuKontekstowe = useCallback(
    (kind: RodzajMenu, id: string, x: number, y: number, punkt?: Point) => {
      // Najpierw zaznaczenie, dopiero potem menu — inaczej jego pozycje dotyczyłyby
      // czegoś innego niż to, w co użytkownik kliknął.
      if (kind !== "wallDraw") zaznacz(kind as NonNullable<Selection>["kind"], id);
      setContextMenu({ x, y, kind, id, multi: false, punkt });
    },
    [zaznacz]
  );

  const menuElementu = useCallback(
    (id: string, x: number, y: number) => {
      if (multiSelected.includes(id) && multiSelected.length > 1) {
        setContextMenu({ x, y, kind: "el", id, multi: true });
        return;
      }
      zaznacz("el", id);
      setContextMenu({ x, y, kind: "el", id, multi: false });
    },
    [multiSelected, zaznacz]
  );

  const menuRysowanejSciany = useCallback((x: number, y: number) => {
    setContextMenu({ x, y, kind: "wallDraw", id: "", multi: false });
  }, []);

  const usunZaznaczone = useCallback(() => {
    if (multiSelected.length > 0) {
      removeElements(multiSelected);
      setMultiSelected([]);
      return;
    }
    if (!selected) return;
    if (selected.kind === "el") removeElements([selected.id]);
    else if (selected.kind === "wall") {
      // Usunięcie ściany kasuje też JEJ otwory — inaczej zostałyby osierocone
      // (`wallId` wskazujący na nieistniejącą ścianę).
      setDraft((d) => ({
        ...d,
        walls: d.walls.filter((w) => w.id !== selected.id),
        openings: d.openings.filter((o) => o.wallId !== selected.id),
      }));
    } else if (selected.kind === "opening") {
      setDraft((d) => ({ ...d, openings: d.openings.filter((o) => o.id !== selected.id) }));
    } else if (selected.kind === "room") {
      deleteRoomShape(selected.id);
    } else if (selected.kind === "route") {
      clearRouteOverride(selected.id);
    } else if (selected.kind === "note") {
      setDraft((d) => ({ ...d, notatki: (d.notatki ?? []).filter((n) => n.id !== selected.id) }));
    }
    setSelected(null);
  }, [multiSelected, selected, removeElements, setDraft, deleteRoomShape, clearRouteOverride]);

  return {
    selected,
    setSelected,
    multiSelected,
    setMultiSelected,
    zaznacz,
    wyczysc,
    contextMenu,
    zamknijMenu,
    menuKontekstowe,
    menuElementu,
    menuRysowanejSciany,
    usunZaznaczone,
  };
}
