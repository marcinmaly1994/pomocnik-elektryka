import { FlaskConical } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Pasek „To jest projekt przykładowy" — wisi nad treścią KAŻDEJ zakładki, dopóki
 * w store'rze stoi wczytany przykład (patrz `projektPrzykladowy` w useProjectStore.ts).
 *
 * DLACZEGO NAD WSZYSTKIMI ZAKŁADKAMI, A NIE TYLKO NAD INSTALACJĄ: cały sens przykładu
 * jest w tym, żeby ktoś obejrzał Rozdzielnicę, Schemat i Kosztorys wypełnione same
 * z rzutu. Tam właśnie trafia zaraz po wczytaniu — i tam najłatwiej zapomnieć, że
 * ogląda cudze mieszkanie. Stąd też wyjście („Zacznij własny projekt") jest dostępne
 * z każdej z nich, a nie tylko z tej, w której przykład się wczytało.
 *
 * Wyjście prowadzi przez to samo potwierdzenie co „Nowy projekt" w nagłówku, bo robi
 * dokładnie to samo — `resetProject`. Okno jest tu jednak KRÓTSZE i mówi co innego:
 * przy kasowaniu przykładu nie ma czego żałować, więc straszenie „tej operacji nie da
 * się cofnąć" byłoby nie na miejscu.
 */
export function PasekPrzykladu() {
  const projektPrzykladowy = useProjectStore((s) => s.projektPrzykladowy);
  const resetProject = useProjectStore((s) => s.resetProject);

  if (!projektPrzykladowy) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg px-3 py-2 text-xs"
      style={{ background: "#2D5A8C12", color: "#2D5A8C" }}
    >
      <FlaskConical size={15} className="shrink-0" aria-hidden="true" />
      {/* „Ten projekt", nie „nic z tego": pasek wisi nad czterema krokami przepływu
          i mówi wyłącznie o PROJEKCIE. Szersza obietnica była nieprawdziwa — protokoły
          mają własny, ręczny zapis do chmury i on działa normalnie także wtedy, gdy
          otwarty jest przykład (patrz warunek renderowania paska w App.tsx). */}
      {/* Tekst w elastycznej kolumnie (`basis-0`), przycisk obok niej. Przy samym `<span>`
          długie zdanie zajmowało cały wiersz i przycisk spadał do trzeciej linii, gdy
          tylko tekst renderował się odrobinę szerzej (czcionki na Linuksie): na tablecie
          768 px pasek rósł o 42 px i zabierał je rzutowi. Teraz tekst zawija się w swojej
          kolumnie, a przycisk schodzi pod spód dopiero na wąskim telefonie (min. 12rem). */}
      <span className="min-w-[12rem] flex-1 basis-0">
        <strong>To jest projekt przykładowy</strong> — gotowy projekt, na którym widać, co aplikacja liczy sama.
        Poklikaj po zakładkach, zmieniaj co chcesz; ten projekt nie zapisuje się na Twoim koncie.
      </span>
      <Dialog>
        <DialogTrigger asChild>
          <button className="ml-auto shrink-0 font-semibold underline [@media(pointer:coarse)]:min-h-8">Zacznij własny projekt</button>
        </DialogTrigger>
        <DialogContent title="Zacząć własny projekt?">
          <p className="mb-4 text-sm text-slate-600">
            Przykład zniknie i wrócisz do pustego planu. Możesz go wczytać ponownie w każdej chwili.
          </p>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Zostań w przykładzie
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="copper" size="sm" onClick={resetProject}>
                Tak, zacznij własny
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
