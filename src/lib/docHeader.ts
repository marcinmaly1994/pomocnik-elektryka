import type { DocumentHeader } from "@/types";

/**
 * Nagłówek dokumentów w stanie wyjściowym — jedno źródło prawdy dla stanu startowego
 * store'a i dla wczytywania projektów.
 *
 * Funkcja, a nie stała: `data` to DZISIEJSZA data, a moduł ładuje się raz na sesję
 * przeglądarki. Stała zamroziłaby dzień otwarcia aplikacji i projekt założony po
 * północy dostałby wczorajszą datę pomiaru.
 */
export function domyslnyNaglowek(): DocumentHeader {
  return {
    obiekt: "", adres: "", zleceniodawca: "", wykonawca: "", uprawnienia: "",
    przyrzad: "", nrFabryczny: "", swiadectwo: "",
    data: new Date().toISOString().slice(0, 10),
    temperatura: "20", wilgotnosc: "55", uklad: "TN-S",
    drawingNo: "E-01", revision: "A",
  };
}

/**
 * Uzupełnia „Obiekt / nazwa instalacji" nazwą projektu, jeśli użytkownik nie wpisał
 * własnej. Bez tego dokumenty wychodziły z pustym nagłówkiem mimo że projekt miał
 * nazwę widoczną w pasku aplikacji — trzeba było przepisywać ją ręcznie do formularza.
 *
 * Rozwiązywane w JEDNYM miejscu i używane zarówno do treści nagłówka, jak i do nazwy
 * pliku, żeby plik na dysku nazywał się tak samo jak obiekt wydrukowany w dokumencie.
 *
 * `?.` przy `obiekt` nie jest ostrożnością na wszelki wypadek. Zapisy projektów sprzed
 * dodania danego pola po prostu go NIE MAJĄ — dotyczy to także projektów leżących
 * w chmurze, wczytywanych na dowolnym urządzeniu. Tę funkcję woła sześć komponentów,
 * a jeden z nich (`KompletDialog`) jest zamontowany w `App` na stałe, więc wyjątek
 * tutaj kładł CAŁĄ aplikację: zostawał sam ekran „Coś poszło nie tak", a feralny zapis
 * siedział w localStorage, więc odświeżenie nic nie dawało. Właściwe uzupełnianie
 * braków dzieje się przy wczytywaniu projektu (patrz `loadProjectPayload` w store),
 * ale ta funkcja jest ostatnią linią obrony i sama w sobie nie ma prawa się wywrócić.
 */
export function resolveDocHeader(header: DocumentHeader, projectName: string): DocumentHeader {
  return header.obiekt?.trim() ? header : { ...header, obiekt: projectName.trim() };
}
