import { describe, expect, it, beforeEach } from "vitest";
import {
  KLUCZ_POWITANIE,
  KLUCZ_UMIE,
  ODSTEP_ZGLOSZEN_KOLKA,
  czyOdnotowacKolko,
  czyPokazacPodpowiedzKolka,
  czyPokazacPowitanie,
  odczytajStanNawigacji,
  zapamietajOdrzuceniePowitania,
  zapamietajUmiejetnosc,
} from "./podpowiedziNawigacji";

/**
 * Nawigacja po rzucie jest w tej aplikacji jedyną rzeczą wziętą wprost z CAD-a:
 * Ctrl + kółko przybliża, wciśnięta rolka przesuwa. Kto nie siedział w AutoCAD-zie,
 * ten kręci kółkiem nad planem i przewija stronę, nie mając pojęcia dlaczego.
 *
 * Reguła pokazywania podpowiedzi jest tu CZYSTĄ FUNKCJĄ, żeby dało się ją domknąć
 * testem bez montowania edytora — to decyzja „co człowiek już umie", a nie rysowanie.
 */
describe("podpowiedzi nawigacji po rzucie", () => {
  describe("powitanie po wgraniu rzutu", () => {
    it("pokazuje się komuś, kto rzutu jeszcze nie ruszał", () => {
      expect(czyPokazacPowitanie({ powitanieOdrzucone: false, umieNawigowac: false })).toBe(true);
    });

    it("nie wraca po zamknięciu", () => {
      expect(czyPokazacPowitanie({ powitanieOdrzucone: true, umieNawigowac: false })).toBe(false);
    });

    /**
     * Kto raz przybliżył rzut, ten wie, że da się to zrobić — i podpowiedź byłaby
     * już tylko okienkiem do zamknięcia. Dotyczy też kogoś, kto wgrywa DRUGI rzut.
     */
    it("nie zaczepia kogoś, kto już umie przybliżać", () => {
      expect(czyPokazacPowitanie({ powitanieOdrzucone: false, umieNawigowac: true })).toBe(false);
    });
  });

  describe("podpowiedź po kółku bez Ctrl", () => {
    it("pokazuje się w chwili pomyłki", () => {
      expect(czyPokazacPodpowiedzKolka({ powitanieOdrzucone: true, umieNawigowac: false }, false)).toBe(true);
    });

    /**
     * Zamknięcie powitania nie znaczy „umiem" — bardzo często znaczy „odklikałem".
     * Dlatego podpowiedź przy kółku żyje dalej, dopóki ktoś FAKTYCZNIE nie przybliży.
     */
    it("żyje dalej mimo zamkniętego powitania", () => {
      expect(czyPokazacPodpowiedzKolka({ powitanieOdrzucone: true, umieNawigowac: false }, false)).toBe(true);
    });

    it("milknie, gdy ktoś już raz przybliżył rzut", () => {
      expect(czyPokazacPodpowiedzKolka({ powitanieOdrzucone: true, umieNawigowac: true }, false)).toBe(false);
    });

    /**
     * Dwie chmurki naraz to nie dwa razy więcej pomocy, tylko bałagan: powitanie stoi
     * przy przyciskach zoomu i mówi dokładnie to samo, co miałaby powiedzieć druga.
     */
    it("nie nakłada się na otwarte powitanie", () => {
      expect(czyPokazacPodpowiedzKolka({ powitanieOdrzucone: false, umieNawigowac: false }, true)).toBe(false);
    });
  });

  describe("pamięć między sesjami", () => {
    beforeEach(() => localStorage.clear());

    it("świeża przeglądarka nie wie nic", () => {
      expect(odczytajStanNawigacji()).toEqual({ powitanieOdrzucone: false, umieNawigowac: false });
    });

    it("zapamiętuje zamknięcie powitania i pierwsze przybliżenie osobno", () => {
      zapamietajOdrzuceniePowitania();
      expect(odczytajStanNawigacji()).toEqual({ powitanieOdrzucone: true, umieNawigowac: false });
      zapamietajUmiejetnosc();
      expect(odczytajStanNawigacji()).toEqual({ powitanieOdrzucone: true, umieNawigowac: true });
    });

    /**
     * Tryb prywatny potrafi rzucać przy samym dostępie do `localStorage`. Pokazanie
     * podpowiedzi raz za dużo jest tańsze niż wywrócenie edytora — ta sama zasada,
     * co przy zwinięciu panelu bocznego.
     */
    it("zablokowany magazyn nie wywraca edytora", () => {
      const pierwotny = Object.getOwnPropertyDescriptor(window, "localStorage")!;
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new Error("brak dostępu");
        },
      });
      try {
        expect(odczytajStanNawigacji()).toEqual({ powitanieOdrzucone: false, umieNawigowac: false });
        expect(() => zapamietajOdrzuceniePowitania()).not.toThrow();
        expect(() => zapamietajUmiejetnosc()).not.toThrow();
      } finally {
        Object.defineProperty(window, "localStorage", pierwotny);
      }
    });

    it("klucze są rozłączne — jedno nie kasuje drugiego", () => {
      expect(KLUCZ_POWITANIE).not.toBe(KLUCZ_UMIE);
    });
  });
});

describe("czyOdnotowacKolko", () => {
  it("pierwsze krecenie odnotowuje sie zawsze", () => {
    expect(czyOdnotowacKolko(0, 1_000_000)).toBe(true);
  });

  it("tiki gestsze niz odstep sa pomijane — to one byly praca bez celu", () => {
    const start = 1_000_000;
    expect(czyOdnotowacKolko(start, start + 16)).toBe(false);
    expect(czyOdnotowacKolko(start, start + ODSTEP_ZGLOSZEN_KOLKA - 1)).toBe(false);
  });

  it("po odstepie znow sie odnotowuje — dalsze krecenie ma przedluzac komunikat", () => {
    const start = 1_000_000;
    expect(czyOdnotowacKolko(start, start + ODSTEP_ZGLOSZEN_KOLKA)).toBe(true);
    expect(czyOdnotowacKolko(start, start + 2000)).toBe(true);
  });

  it("odstep jest wyraznie krotszy niz zycie komunikatu — inaczej dymek gasnalby miedzy zgloszeniami", () => {
    expect(ODSTEP_ZGLOSZEN_KOLKA).toBeLessThan(2600 / 2);
  });
});
