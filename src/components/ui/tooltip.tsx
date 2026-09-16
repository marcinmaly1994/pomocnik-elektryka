import { useRef, useState, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

/**
 * Podpowiedź przy skrócie albo terminie — następca natywnego `title`.
 *
 * Powody, dla których `title` tu nie wystarczał:
 *  - siedział na CAŁEJ komórce nagłówka tabeli, a ta jest znacznie szersza niż słowo
 *    „Ib"; dymek wyskakiwał więc przy najechaniu daleko od tekstu,
 *  - nie reaguje ani na kliknięcie, ani na dotyk — na telefonie opisów nie dało się
 *    otworzyć w ogóle, a to jedyne miejsce w aplikacji, gdzie wyjaśnione są Ib, Iz
 *    i Zs max,
 *  - nie pokazuje się przy przejściu klawiaturą.
 *
 * Kliknięcie PRZYPINA opis: zostaje otwarty po odjechaniu myszą, aż do kolejnego
 * kliknięcia, Escape'u albo kliknięcia obok. Bez przypinania kliknięcie nie dawałoby
 * nic ponad to, co i tak robi najechanie — a chodzi właśnie o ekran bez myszy.
 */
export function Podpowiedz({ children, tresc }: { children: ReactNode; tresc: string }) {
  /** Otwarty najechaniem albo fokusem — stan pochodzi z Radixa. */
  const [najechany, setNajechany] = useState(false);
  /** Otwarty kliknięciem — trzyma się sam, niezależnie od kursora. */
  const [przypiety, setPrzypiety] = useState(false);
  /** Do odróżnienia kliknięcia W NAPIS od kliknięcia OBOK — patrz `onPointerDownOutside`. */
  const refNapisu = useRef<HTMLButtonElement>(null);

  /*
   * `disableHoverableContent`: bez tego Radix trzyma dymek otwarty, gdy kursor wedruje
   * w strone jego tresci — to strefa laski dla dymkow z odnosnikami. Tutaj tresc jest
   * czysto informacyjna, a ta strefa sprawiala, ze odpiety dymek zostawal na ekranie,
   * dopoki kursor nie ominal go szerokim lukiem.
   */
  return (
    <TooltipPrimitive.Provider delayDuration={150} disableHoverableContent>
      <TooltipPrimitive.Root open={najechany || przypiety} onOpenChange={setNajechany}>
        <TooltipPrimitive.Trigger asChild>
          <button
            ref={refNapisu}
            type="button"
            // Razem z odpięciem gasimy też stan najechania. Radix uruchamia swój
            // opóźniony czasomierz otwarcia przy wejściu wskaźnika, a kliknięcie pada
            // zanim ten zdąży się rozbroić — bez tego odpięty dymek wracal sam z siebie.
            onClick={() => {
              setPrzypiety((v) => !v);
              setNajechany(false);
            }}
            className="cursor-help underline decoration-dotted underline-offset-2"
          >
            {children}
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            sideOffset={6}
            collisionPadding={8}
            className="z-50 max-w-xs rounded-card border border-border bg-white px-3 py-2 text-[11.5px] font-normal leading-relaxed text-ink shadow-lg"
            // Escape i kliknięcie obok mają zamknąć także opis PRZYPIĘTY — inaczej
            // zostawałby na ekranie i nie było jak go zdjąć poza trafieniem w ten sam napis.
            onEscapeKeyDown={() => setPrzypiety(false)}
            onPointerDownOutside={(e) => {
              // Dla Radixa sam napis jest „poza" treścią dymka, więc bez tego warunku
              // drugie kliknięcie odpinało opis TYM uchwytem i natychmiast przypinało
              // go z powrotem przez `onClick` — przełącznik nie działał wcale.
              // Kliknięcie w napis należy do `onClick`; tutaj obsługujemy resztę ekranu.
              if (refNapisu.current?.contains(e.target as Node)) return;
              setPrzypiety(false);
            }}
          >
            {tresc}
            <TooltipPrimitive.Arrow className="fill-white" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
