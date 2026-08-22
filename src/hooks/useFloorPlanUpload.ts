import { useCallback, useState } from "react";
import { przytnijRzut, wczytajRzut, type ObszarPrzyciecia, type WczytanyRzut } from "@/lib/detect/source";

/**
 * Wgrywanie podkładu: wczytanie pliku (obraz albo PDF), opcjonalne przycięcie,
 * gotowe.
 *
 * Zastępuje dawny `useFloorPlanDetection` — automatyczne rozpoznawanie ścian
 * i pomieszczeń zostało USUNIĘTE z aplikacji (działało zbyt zawodnie na
 * realnych rzutach, nawet po kilku próbach naprawy — patrz MIGRATION.md).
 * Zamiast „wgraj → poczekaj na analizę → popraw wynik AI" jest teraz
 * „wgraj → przytnij → narysuj sam" — to samo `CropTool` i `source.ts`
 * (wczytywanie/przycinanie pliku), zero silnika detekcji.
 */

export type StanWgrywania = "bezczynny" | "wczytywanie" | "przycinanie" | "blad";

export interface WgrywanieApi {
  stan: StanWgrywania;
  /** Podkład gotowy do pokazania — dostępny w stanie „przycinanie", zostaje
   *  też po zakończeniu (przyciętym albo nie), żeby efekt w DesignTab mógł
   *  ustawić go jako tło projektu. */
  rzut: WczytanyRzut | null;
  blad: string | null;
  wczytaj: (file: File) => Promise<void>;
  /** Krok „przycinanie": zaznaczony obszar zastępuje `rzut` przyciętą wersją i kończy wgrywanie. */
  przytnij: (obszar: ObszarPrzyciecia) => void;
  /** Krok „przycinanie": pomija przycięcie, `rzut` zostaje w pełnym rozmiarze. */
  pominPrzyciecie: () => void;
  /** Zamyka ekran błędu bez zmiany podkładu. */
  pomin: () => void;
}

export function useFloorPlanUpload(): WgrywanieApi {
  const [stan, setStan] = useState<StanWgrywania>("bezczynny");
  const [rzut, setRzut] = useState<WczytanyRzut | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  const wczytaj = useCallback(async (file: File) => {
    setBlad(null);
    setStan("wczytywanie");
    try {
      const wczytany = await wczytajRzut(file);
      setRzut(wczytany);
      // Zatrzymujemy się TU zamiast od razu kończyć — użytkownik dostaje szansę
      // odciąć niechcianą część dokumentu (np. tabelkę z legendą obok planu),
      // zanim ruszy ręczne rysowanie. Krok jawnie pomijalny (patrz `CropTool`).
      setStan("przycinanie");
    } catch (e) {
      setStan("blad");
      setBlad(e instanceof Error ? e.message : "Nie udało się otworzyć tego pliku");
    }
  }, []);

  const przytnij = useCallback((obszar: ObszarPrzyciecia) => {
    setRzut((aktualny) => (aktualny ? przytnijRzut(aktualny, obszar) : aktualny));
    setStan("bezczynny");
  }, []);

  const pominPrzyciecie = useCallback(() => {
    setStan("bezczynny");
  }, []);

  const pomin = useCallback(() => {
    setStan("bezczynny");
    setBlad(null);
  }, []);

  return { stan, rzut, blad, wczytaj, przytnij, pominPrzyciecie, pomin };
}
