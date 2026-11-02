import { createContext, useContext, useEffect, useState } from "react";

/**
 * Sposób, w jaki zawartość panelu może go ZAMKNĄĆ.
 *
 * Potrzebny dla kontrolek, które otwierają własne okno dialogowe („Duplikuj",
 * „+ Dodaj kondygnację"). Panel przeżywa otwarcie okna świadomie — inaczej
 * zamykałby się pod nim i pierwsze kliknięcie w oknie gasiłoby oba naraz — ale po
 * zamknięciu okna zostawał otwarty NAD kolumną narzędzi i przechwytywał kliknięcia
 * w bibliotekę elementów, czyli w to, co robi się zaraz po dodaniu kondygnacji.
 *
 * Domyślnie pusta funkcja, więc `FloorManagement` renderuje się poprawnie także
 * poza panelem (np. w teście jednostkowym) i nie musi wiedzieć, gdzie stoi.
 */
export const ZamknijContext = createContext<() => void>(() => {});

/** Zamyka panel paska, w którym stoi wołający. Poza panelem — nic nie robi. */
export function useZamknijPasekMenu(): () => void {
  return useContext(ZamknijContext);
}

/** Czy okno jest szerokie (próg `md` z Tailwinda). Czytane z `matchMedia`, a nie
 *  klasami CSS, bo wybór ma decydować o tym, co w ogóle TRAFIA do drzewa — dwie
 *  kopie tych samych kontrolek, jedna schowana `display:none`, dałyby dwa elementy
 *  o tej samej nazwie dostępnościowej i dwa trafienia w każdym `getByRole`. */
export function useSzerokieOkno(): boolean {
  const [szerokie, setSzerokie] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const zmien = () => setSzerokie(mq.matches);
    zmien();
    mq.addEventListener("change", zmien);
    return () => mq.removeEventListener("change", zmien);
  }, []);
  return szerokie;
}
