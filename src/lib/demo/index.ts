import type { ProjectPayload } from "@/store/useProjectStore";

/**
 * Rejestr gotowych projektów przykładowych.
 *
 * METADANE SĄ STATYCZNE, A BUDOWNICZY ZA `import()` — i to jest cała istota tego pliku.
 * Okno wyboru musi pokazać nazwy, opisy i liczby ZANIM ktokolwiek coś wybierze; gdyby
 * czytało je z danych, otwarcie okna ściągałoby wszystkie przykłady naraz. Tak ściąga
 * się wyłącznie ten, w który ktoś kliknął — dokładnie z tego powodu, dla którego
 * `wczytajPrzyklad` w store'rze od początku używa dynamicznego importu.
 *
 * Kosztem jest to, że liczby w `fakty` są wpisane ręcznie i mogą się rozjechać
 * z danymi. Pilnuje tego test w `index.test.ts`.
 */
export interface Przyklad {
  id: string;
  nazwa: string;
  opis: string;
  /** Dokładnie trzy: metraż, liczba pomieszczeń, liczba elementów. Kolejność ma znaczenie
   *  — czyta ją test zgodności z danymi. `readonly`, bo rejestr jest `as const`. */
  fakty: readonly [string, string, string];
  zaladuj: () => Promise<{ default?: unknown; [k: string]: unknown }>;
  /** Nazwa eksportu budowniczego w module wskazanym przez `zaladuj`. */
  eksport: string;
}

export const PRZYKLADY = [
  {
    id: "mieszkanie",
    nazwa: "Mieszkanie 70 m²",
    opis: "Blok, M4 z korytarzem. Sześć pomieszczeń, jedna rozdzielnica.",
    fakty: ["70 m²", "6 pomieszczeń", "48 elementów"],
    zaladuj: () => import("./mieszkanie"),
    eksport: "zbudujProjektPrzykladowy",
  },
  {
    id: "dom",
    nazwa: "Dom 136 m², dwie kondygnacje",
    opis: "Parter z garażem, kotłownią i pralnią, piętro z sypialniami. Podrozdzielnica na piętrze zasila jego obwody.",
    fakty: ["136 m²", "12 pomieszczeń", "~80 elementów"],
    zaladuj: () => import("./dom"),
    eksport: "zbudujProjektDom",
  },
] as const satisfies readonly Przyklad[];

export type PrzykladId = (typeof PRZYKLADY)[number]["id"];

/** Buduje payload wskazanego przykładu. Rzuca, gdy `id` nie ma w rejestrze — to błąd
 *  programisty, nie stan, w którym użytkownik może się znaleźć. */
export async function zbudujPrzyklad(id: PrzykladId): Promise<ProjectPayload> {
  const wpis = PRZYKLADY.find((x) => x.id === id);
  if (!wpis) throw new Error(`Nie ma przykładu o id "${id}"`);
  const mod = await wpis.zaladuj();
  return (mod as Record<string, () => ProjectPayload>)[wpis.eksport]();
}
