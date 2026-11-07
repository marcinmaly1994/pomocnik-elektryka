import { useProjectStore } from "@/store/useProjectStore";
import { aparatyZSzablonu, type SzablonRozdzielnicy } from "@/lib/panel/szablonyRozdzielnic";

/**
 * Wstawienie gotowego układu rozdzielnicy (F17 z audytu 5.11.2026).
 *
 * Wczytanie przełącza rozdzielnicę w tryb „Składam ręcznie" — inaczej pierwsze
 * przeliczenie z rzutu nadpisałoby układ — i zastępuje jej aparaty. Zastąpienie
 * idzie przez historię rozdzielnicy (`commitPanelSnapshot`), więc „Cofnij" obok
 * ustawień przywraca poprzednie aparaty.
 */
export function useWczytajUklad() {
  const commitPanelSnapshot = useProjectStore((s) => s.commitPanelSnapshot);
  const setPanelDevices = useProjectStore((s) => s.setPanelDevices);
  const setPanelConfig = useProjectStore((s) => s.setPanelConfig);
  const setPanelTryb = useProjectStore((s) => s.setPanelTryb);
  return (s: SzablonRozdzielnicy) => {
    commitPanelSnapshot({ zUstawieniami: true });
    setPanelConfig(s.config);
    setPanelDevices(aparatyZSzablonu(s));
    setPanelTryb("reczny");
  };
}

