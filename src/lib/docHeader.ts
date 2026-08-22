import type { DocumentHeader } from "@/types";

/**
 * Uzupełnia „Obiekt / nazwa instalacji" nazwą projektu, jeśli użytkownik nie wpisał
 * własnej. Bez tego dokumenty wychodziły z pustym nagłówkiem mimo że projekt miał
 * nazwę widoczną w pasku aplikacji — trzeba było przepisywać ją ręcznie do formularza.
 *
 * Rozwiązywane w JEDNYM miejscu i używane zarówno do treści nagłówka, jak i do nazwy
 * pliku, żeby plik na dysku nazywał się tak samo jak obiekt wydrukowany w dokumencie.
 */
export function resolveDocHeader(header: DocumentHeader, projectName: string): DocumentHeader {
  return header.obiekt.trim() ? header : { ...header, obiekt: projectName.trim() };
}
