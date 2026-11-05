/**
 * Czy klawisz naciśnięty gdziekolwiek na stronie należy do EDYTORA PLANU.
 *
 * Skróty edytora (Delete, litery narzędzi, R, strzałki, Ctrl+Z…) słuchają na `window`,
 * bo plan nie ma własnego fokusu — Konva rysuje w <canvas>, którego nikt nie
 * „zaznacza". Tyle że `window` słyszy też klawisze naciskane W OKNIE NAD planem.
 * Audyt 5.11.2026: Delete przy otwartym oknie „Pomoc" albo menu „Projekty" kasował
 * zaznaczone gniazdko schowane pod spodem — użytkownik nawet tego nie widział.
 * A litera „p" w liście typu pomieszczenia przełączała narzędzie i przez
 * `preventDefault` blokowała natywne przeskoczenie listy na „Pokój".
 *
 * Klawisz NIE jest dla edytora, gdy:
 *  - cel to pole, które samo przyjmuje klawisze: input, textarea, lista rozwijana
 *    albo element edytowalny (`contentEditable`);
 *  - cel leży wewnątrz okna, menu albo panelu paska edytora;
 *  - nad planem stoi otwarte okno modalne albo menu — nawet gdy fokus został na
 *    przycisku, który je otworzył (panele „Plan"/„Rysunek"/„Opisy" nie zabierają
 *    fokusu z przycisku).
 *
 * Dymek podpowiedzi (`CoachMark`, `role="dialog"` bez `data-state`) celowo NIE blokuje:
 * stoi przy narzędziu w trakcie zwykłej pracy i wyłączałby skróty na cały pierwszy
 * kwadrans z aplikacją.
 */
const NAKLADKA = "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open'], [role='menu'], [data-nakladka-edytora]";
const W_NAKLADCE = "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [data-nakladka-edytora]";

export function klawiszDlaEdytora(cel: EventTarget | null, dokument: Document = document): boolean {
  const el = cel instanceof Element ? cel : null;
  if (el) {
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
    if (el instanceof HTMLElement && el.isContentEditable) return false;
    if (el.closest(W_NAKLADCE)) return false;
  }
  return dokument.querySelector(NAKLADKA) === null;
}
