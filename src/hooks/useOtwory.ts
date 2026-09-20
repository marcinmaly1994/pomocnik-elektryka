import { useCallback, useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { defaultOpeningWidth, scaleOf } from "@/lib/design";
import type { OpeningKind, Point } from "@/types";

/**
 * Otwory: drzwi i okna wstawiane klikaniem w ścianę albo w krawędź pomieszczenia.
 *
 * Trzecie skupisko stanu wyjęte z `DesignTab`. Wstawianie stało tam w DWÓCH prawie
 * identycznych funkcjach — jedna zaczepiała otwór o ścianę, druga o krawędź
 * pomieszczenia, a różniły się jednym polem (`wallId` kontra `roomId`). Tutaj jest to
 * jeden `wstaw` z zaczepieniem podanym argumentem; obie drogi zostają osobnymi
 * nazwami, bo tak są wołane z rysunku i tak czyta się je na miejscu wywołania.
 */
export interface OtworyApi {
  /** Rodzaj NOWEGO otworu — ustawienie edytora, jak grubość ściany, nie część projektu. */
  openingKind: OpeningKind;
  setOpeningKind: React.Dispatch<React.SetStateAction<OpeningKind>>;
  /** Klik w ścianę: `point`/`angle` są już policzone na rysunku. */
  wstawNaScianie: (wallId: string, point: Point, angle: number) => void;
  /** Klik w krawędź pomieszczenia — pomieszczenia narysowane bez osobnej ściany
   *  inaczej w ogóle nie miałyby jak dostać drzwi. */
  wstawNaKrawedziPokoju: (roomId: string, point: Point, angle: number) => void;
  ustawSzerokosc: (id: string, width: number) => void;
  /** Obrót o 180°: dla drzwi zamienia stronę zawiasu I kierunek otwierania skrzydła. */
  obroc: (id: string) => void;
  /** Odbicie: zawias przechodzi na drugi koniec, strona otwierania zostaje ta sama.
   *  Osobno od obrotu, bo obrót zamienia obie rzeczy naraz i samym obrotem nie da się
   *  ustawić drzwi prawych zamiast lewych przy tym samym kierunku otwierania. */
  odbij: (id: string) => void;
  menuKontekstowe: (id: string, x: number, y: number) => void;
}

export function useOtwory(opcje: {
  /** Świeżo postawiony otwór ma być OD RAZU zaznaczony — bez tego „R" (obrót) ani PPM
   *  tuż po postawieniu nie miały czego dotyczyć, więc próba obrócenia świeżo
   *  wstawionych drzwi wyglądała, jakby w ogóle nie działała. Zaznaczenie jest osobnym
   *  skupiskiem stanu, więc hook tylko je o tym zawiadamia. */
  onZaznacz?: (id: string) => void;
  onMenuKontekstowe?: (id: string, x: number, y: number) => void;
}): OtworyApi {
  const { onZaznacz, onMenuKontekstowe } = opcje;
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const setDraft = useProjectStore((s) => s.setDraft);
  const scales = useProjectStore((s) => s.scales);
  const mpu = scaleOf(scales, activeFloorId);

  const [openingKind, setOpeningKind] = useState<OpeningKind>("drzwi");

  /** Otwory nie mają własnych akcji w store — tak samo jak ściany, jeden `setDraft`. */
  const wstaw = useCallback(
    (zaczepienie: { wallId: string } | { roomId: string }, point: Point, angle: number) => {
      const id = crypto.randomUUID();
      setDraft((d) => ({
        ...d,
        openings: [
          ...d.openings,
          {
            id,
            floor: activeFloorId,
            ...zaczepienie,
            x: point.x,
            y: point.y,
            angle,
            width: defaultOpeningWidth(mpu, openingKind),
            kind: openingKind,
          },
        ],
      }));
      onZaznacz?.(id);
    },
    [activeFloorId, setDraft, mpu, openingKind, onZaznacz]
  );

  const wstawNaScianie = useCallback(
    (wallId: string, point: Point, angle: number) => wstaw({ wallId }, point, angle),
    [wstaw]
  );
  const wstawNaKrawedziPokoju = useCallback(
    (roomId: string, point: Point, angle: number) => wstaw({ roomId }, point, angle),
    [wstaw]
  );

  const ustawSzerokosc = useCallback(
    (id: string, width: number) => {
      setDraft((d) => ({ ...d, openings: d.openings.map((o) => (o.id === id ? { ...o, width } : o)) }));
    },
    [setDraft]
  );

  const obroc = useCallback(
    (id: string) => {
      setDraft((d) => ({ ...d, openings: d.openings.map((o) => (o.id === id ? { ...o, flip: !o.flip } : o)) }));
    },
    [setDraft]
  );

  const odbij = useCallback(
    (id: string) => {
      setDraft((d) => ({ ...d, openings: d.openings.map((o) => (o.id === id ? { ...o, lustro: !o.lustro } : o)) }));
    },
    [setDraft]
  );

  const menuKontekstowe = useCallback(
    (id: string, x: number, y: number) => {
      // Najpierw zaznaczenie, dopiero potem menu — inaczej jego pozycje dotyczyłyby
      // czegoś innego niż to, w co użytkownik kliknął.
      onZaznacz?.(id);
      onMenuKontekstowe?.(id, x, y);
    },
    [onZaznacz, onMenuKontekstowe]
  );

  return { openingKind, setOpeningKind, wstawNaScianie, wstawNaKrawedziPokoju, ustawSzerokosc, obroc, odbij, menuKontekstowe };
}
