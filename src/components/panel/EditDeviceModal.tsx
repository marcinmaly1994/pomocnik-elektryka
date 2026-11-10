import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MANUAL_DEVICE_TYPES, daSieSkasowac } from "@/lib/panel/devices";
import type { PanelDevice } from "@/types";

/**
 * Edycja pojedynczego aparatu.
 *
 * Bez tego jedyną drogą do zmiany nastawy z B16 na C16 albo do poprawienia opisu było
 * skasowanie aparatu i dodanie go od nowa — z utratą miejsca na szynie i ręcznie
 * ustawionej fazy. To najczęstsza operacja przy doborze, więc kosztowała najwięcej.
 *
 * Nastawa jest polem TEKSTOWYM z podpowiedziami z katalogu, a nie listą zamkniętą:
 * katalog obejmuje typowe wartości, ale realny aparat bywa spoza niego (B13, C40,
 * gG 50A), a zamknięta lista zmuszałaby do wybrania czegoś nieprawdziwego.
 */

export interface EditDeviceModalProps {
  device: PanelDevice | null;
  onClose: () => void;
  onSave: (uid: string, zmiany: Partial<PanelDevice>) => void;
  /**
   * Kasowanie aparatu — DRUGA droga do tej samej czynności, obok kółka „×" na jego
   * licu (patrz `PanelRender`).
   *
   * Tamto kółko pokazuje się wyłącznie pod kursorem, więc na telefonie nie pojawia
   * się nigdy: rysunek rozdzielnicy dawał się tam oglądać i nic więcej. Kasowanie
   * było wprawdzie osiągalne z listy „Aparaty" obok, ale nie z samego rysunku —
   * czyli nie stamtąd, gdzie się patrzy. Okno otwiera się dotknięciem aparatu i jest
   * jedynym miejscem, w którym mieszka już wszystko inne na jego temat.
   *
   * Przy okazji pomaga myszy: kółko „×" ma 15 px i trzeba w nie trafić.
   */
  onDelete: (uid: string) => void;
  /** Czy zasilanie jest 3-fazowe — decyduje, czy fazę w ogóle da się wybrać. */
  supply3f: boolean;
}

const BIEGUNY = ["1P", "1P+N", "2P", "3P", "3P+N", "4P", "—"];

/**
 * Sensowna szerokość [modułów] przy danej liczbie biegunów — w większości aparatów
 * modułowych 1 biegun zajmuje 1 moduł na szynie TH35 (tak liczy zresztą rozłącznik
 * główny i SPD w `buildPanelDevices`/`addManualDevice`). Traktowane jako PODPOWIEDŹ
 * przy zmianie biegunów, nie sztywne ograniczenie: kompaktowe warianty niektórych
 * aparatów bywają węższe (np. część 4-biegunowych rozłączników mieści się w
 * 2 modułach) — pole szerokości zostaje więc zawsze edytowalne osobno.
 */
const SUGEROWANE_MODULY: Partial<Record<string, number>> = {
  "1P": 1, "1P+N": 2, "2P": 2, "3P": 3, "3P+N": 4, "4P": 4,
};
const FAZY = ["L1", "L2", "L3", "3F"] as const;

export function EditDeviceModal({ device, onClose, onSave, onDelete, supply3f }: EditDeviceModalProps) {
  const [tag, setTag] = useState("");
  const [caption, setCaption] = useState("");
  const [label, setLabel] = useState("");
  const [poles, setPoles] = useState("");
  const [modules, setModules] = useState(1);
  const [phase, setPhase] = useState<string>("");

  // Formularz zasilany od nowa przy KAŻDYM otwarciu — inaczej po zamknięciu bez zapisu
  // i otwarciu innego aparatu w polach siedziałyby dane poprzedniego.
  useEffect(() => {
    if (!device) return;
    setTag(device.tag ?? "");
    setCaption(device.caption ?? "");
    setLabel(device.label ?? "");
    setPoles(device.poles ?? "");
    setModules(device.modules ?? 1);
    setPhase(device.phase ?? "");
  }, [device]);

  if (!device) return null;

  const katalog = MANUAL_DEVICE_TYPES.find((t) => t.key === device.kind);
  const podpowiedzi = katalog?.ratings.filter(Boolean) ?? [];
  const zapisz = () => {
    onSave(device.uid, {
      tag: tag.trim() || device.tag,
      caption: caption.trim(),
      label: label.trim(),
      poles,
      modules: Math.min(12, Math.max(1, Math.round(modules) || 1)),
      phase: (phase || "") as PanelDevice["phase"],
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Aparat ${device.tag}`} className="max-w-lg">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Oznaczenie</div>
            <input value={tag} onChange={(e) => setTag(e.target.value)} className="pe-input w-full text-sm" aria-label="Oznaczenie" />
          </label>

          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Nastawa / wartość</div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              list={podpowiedzi.length ? `nastawy-${device.uid}` : undefined}
              className="pe-input w-full text-sm"
              aria-label="Nastawa"
            />
            {podpowiedzi.length > 0 && (
              <datalist id={`nastawy-${device.uid}`}>
                {podpowiedzi.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            )}
          </label>

          <label className="col-span-2 block">
            <div className="mb-1 text-xs text-slate-500">Opis obwodu</div>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="pe-input w-full text-sm"
              aria-label="Opis obwodu"
              placeholder="np. Gniazda — kuchnia"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Liczba biegunów</div>
            <select
              value={poles}
              onChange={(e) => {
                const nowe = e.target.value;
                setPoles(nowe);
                // Zmiana biegunów bez zmiany szerokości nie miała żadnego efektu na
                // rysunku — aparat przełączony z 1-fazowego na 3-fazowy zostawał tej
                // samej szerokości, więc na froncie rozdzielnicy wyglądał tak samo.
                // To szerokość [modułów], nie opis biegunów, rysuje pole na szynie.
                const sugestia = SUGEROWANE_MODULY[nowe];
                if (sugestia !== undefined) setModules(sugestia);
              }}
              className="pe-input pe-select w-full text-base md:text-sm"
              aria-label="Liczba biegunów"
            >
              {(BIEGUNY.includes(poles) ? BIEGUNY : [poles, ...BIEGUNY]).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Szerokość [modułów]</div>
            <input
              type="number"
              min={1}
              max={12}
              value={modules}
              onChange={(e) => setModules(Number(e.target.value))}
              className="pe-input w-full text-sm"
              aria-label="Szerokość w modułach"
            />
          </label>

          {/* Faza ma sens tylko przy zasilaniu 3-fazowym — przy 1-fazowym wszystko
              siedzi na L1 i wybór sugerowałby nieistniejącą decyzję. */}
          {supply3f && (
            <label className="col-span-2 block">
              <div className="mb-1 text-xs text-slate-500">Faza</div>
              <select value={phase} onChange={(e) => setPhase(e.target.value)} className="pe-input pe-select w-full text-base md:text-sm" aria-label="Faza">
                <option value="">— nie dotyczy</option>
                {FAZY.map((f) => (
                  <option key={f} value={f}>
                    {f === "3F" ? "3F — wszystkie fazy" : f}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Zmiana fazy ręcznie rozjeżdża bilans policzony przez „Wyrównaj fazy" —
            lepiej powiedzieć to wprost, niż zostawić użytkownika ze zdziwieniem. */}
        {supply3f && phase !== (device.phase ?? "") && (
          <p className="mt-3 text-xs text-slate-500">
            Ręczna zmiana fazy zostanie nadpisana, jeśli użyjesz „Wyrównaj fazy”.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {/* Kasowanie po LEWEJ, odsunięte od „Zapisz zmiany": to jedyny przycisk
              w tym oknie, który usuwa, a nie zmienia, więc sąsiadowanie z przyciskiem
              zatwierdzającym prosiłoby się o pomyłkę. Bez pytania „czy na pewno" —
              `removeDevice` zapisuje migawkę, więc „Cofnij" nad rysunkiem przywraca
              aparat razem z jego miejscem na szynie.
              Rozłącznika głównego i zaślepki nie dotyczy (patrz `daSieSkasowac`). */}
          {daSieSkasowac(device) && (
            <button
              onClick={() => {
                onDelete(device.uid);
                onClose();
              }}
              className="rounded-md px-3 py-2 text-xs text-slate-500 hover:text-warn"
            >
              Usuń aparat
            </button>
          )}
          <button onClick={onClose} className="ml-auto rounded-md px-3 py-2 text-xs text-slate-500 hover:text-ink">
            Anuluj
          </button>
          <Button variant="copper" size="sm" onClick={zapisz}>
            Zapisz zmiany
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
