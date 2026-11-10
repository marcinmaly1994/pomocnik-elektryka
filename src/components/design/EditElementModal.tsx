import { useEffect, useState } from "react";
import type { ElementType, InstallationElement } from "@/types";
import { ELEMENT_SECTIONS, ELEMENT_TYPES, MAX_WYMIAR_PRZYBORU_M, MOUNTING_HEIGHTS_M, SANITARY_FIXTURES, VARIANTS_FOR } from "@/lib/elements";
import { circuitCount, isLightControl, isLightPoint, manualGroups } from "@/lib/lightGroups";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GlyphPreview } from "@/components/design/ElementGlyphSvg";
import { maWlasnyObwodZDefinicji, wchodziDoObwodu } from "@/lib/panel/circuits";
import { WyborObwodu, type UzytyNumer } from "./WyborObwodu";

export interface EditElementPatch {
  type: ElementType;
  room: string;
  gangs: number;
  dedicated: boolean;
  note: string;
  /** Po jednej pozycji na obwód; `null` = ten obwód dobierany automatycznie.
   *  `undefined` całości = wszystkie obwody automatyczne. */
  lightGroup?: (number | null)[];
  /** Litera w symbolu wypustu AGD — patrz `agdLetter` w `InstallationElement`. */
  agdLetter?: string;
  /** Wysokość montażu [m]; `undefined` = wartość typowa dla typu. */
  heightM?: number;
  /** Wymiary przyboru sanitarnego [m]; `undefined` = wartość typowa. */
  widthM?: number;
  depthM?: number;
  /** Ręczny numer obwodu; `undefined` = dobór automatyczny (`computeCircuits`).
   *  Klucz jest w łatce ZAWSZE, bo to on kasuje wcześniejszy numer przy powrocie
   *  na „auto" — brakujący klucz zostawiłby stary numer nietknięty. */
  obwod?: number;
}

interface EditElementModalProps {
  element: InstallationElement;
  roomSuggestions: string[];
  /** Numery wyliczone automatycznie, po jednym na obwód — pokazywane jako podpowiedź
   *  w polach, których użytkownik nie nadpisał. */
  autoLightGroups?: (number | undefined)[];
  /** Numery obwodów użyte w CAŁYM projekcie — ta sama lista, co w menu pod prawym
   *  przyciskiem. Bez niej dołożenie punktu do istniejącego obwodu wymagałoby
   *  pamiętania, że taki numer w ogóle jest. */
  uzyteObwody?: UzytyNumer[];
  onClose: () => void;
  onSave: (patch: EditElementPatch) => void;
}

/**
 * Edycja istniejącego elementu na planie: zmiana typu, liczby gniazd/klawiszy
 * w ramce (tam, gdzie typ na to pozwala), przypisanego pomieszczenia i (dla
 * gniazdek) własnego obwodu.
 */
export function EditElementModal({
  element,
  roomSuggestions,
  autoLightGroups,
  uzyteObwody = [],
  onClose,
  onSave,
}: EditElementModalProps) {
  const [type, setType] = useState<ElementType>(element.type);
  const [room, setRoom] = useState(element.room);
  const [gangs, setGangs] = useState(element.gangs || 1);
  const [dedicated, setDedicated] = useState(element.dedicated);
  // Litera w łuku symbolu i nazwa odbiornika — tylko dla wypustu AGD. Nazwa idzie do
  // `note` (pole tego nie miało dotąd żadnego zastosowania poza AGD), litera do
  // osobnego `agdLetter`, bo to dwie różne rzeczy: jedna trafia na rysunek, druga
  // jest opisem w legendzie/nazwie obwodu.
  const [agdLetter, setAgdLetter] = useState(element.agdLetter || "A");
  const [agdName, setAgdName] = useState(element.type === "wypustAGD" ? element.note || "" : "");
  // Puste = wartość typowa dla typu; patrz komentarz przy polu w formularzu.
  const [height, setHeight] = useState(typeof element.heightM === "number" ? String(element.heightM) : "");
  // Wymiary przyboru — w CENTYMETRACH, bo tak podaje je każdy katalog („wanna 170 × 75”)
  // i tak je czyta ktoś, kto stoi w łazience z miarką. Puste = wartość typowa.
  const naCm = (v: number | undefined) => (typeof v === "number" ? String(Math.round(v * 100)) : "");
  const [szer, setSzer] = useState(naCm(element.widthM));
  const [glab, setGlab] = useState(naCm(element.depthM));
  // Puste pole = „automatycznie". Trzymane jako tekst, żeby dało się je wyczyścić —
  // liczba nie ma stanu „brak", a to właśnie on przywraca automatyczne przypisanie.
  const [groupInputs, setGroupInputs] = useState<string[]>(() =>
    manualGroups(element).map((n) => (n != null ? String(n) : ""))
  );
  const [obwod, setObwod] = useState<number | undefined>(element.obwod);

  /** Przybory sanitarne maja WYMIARY, a nie wysokosc montazu — to jedyne elementy,
   *  ktorych obrys jest jednoczesnie strefa ochronna. */
  const przybornik = SANITARY_FIXTURES[type];
  const przyborem = !!przybornik;

  const variants = VARIANTS_FOR[type];
  const maxGangs = variants ? variants[variants.length - 1] : 1;
  // Grupa dotyczy tylko tego, co steruje światłem, i samego światła — przy gniazdku czy
  // puszce pole byłoby bez sensu, więc się nie pokazuje.
  const groupApplies = isLightControl({ ...element, type }) || isLightPoint({ ...element, type });
  // Łącznik grupowy ma dwa niezależne obwody, więc dostaje dwa pola — przy jednym nie dało
  // się ustawić drugiej dźwigni, a wpisanie numeru po cichu gubiło jej numer.
  const circuits = circuitCount(type);
  // Liczone z typu USTAWIANEGO WŁAŚNIE W TYM OKNIE, nie z zapisanego: zmiana gniazdka
  // na ładowarkę EV albo zaznaczenie „dedykowane" ma od razu odebrać wybór numeru,
  // zamiast pozwolić przypisać obwód, który i tak zostałby zignorowany.
  const wlasnyObwod = maWlasnyObwodZDefinicji({
    ...element,
    type,
    dedicated: type === "gniazdko" ? dedicated : false,
  });

  useEffect(() => {
    setGangs((g) => Math.max(1, Math.min(maxGangs, g)));
  }, [type, maxGangs]);

  // Zmiana typu potrafi zmienić liczbę obwodów (zwykły łącznik → grupowy i odwrotnie),
  // więc lista pól musi za tym nadążyć.
  useEffect(() => {
    setGroupInputs((prev) => Array.from({ length: circuits }, (_, i) => prev[i] ?? ""));
  }, [circuits]);

  function handleSave() {
    // Nieliczba albo wartość spoza sensownego zakresu wraca do „typowej", zamiast
    // wpisywać do projektu wysokość, której nie da się zmontować.
    const h = parseFloat(height.replace(",", "."));
    const parsedHeight = Number.isFinite(h) && h >= 0 && h <= 5 ? h : undefined;
    const parsed = Array.from({ length: circuits }, (_, i) => {
      const n = parseInt(groupInputs[i] ?? "", 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    });
    onSave({
      type,
      room: room.trim() || "Salon",
      gangs: variants ? gangs : 1,
      dedicated: type === "gniazdko" ? dedicated : false,
      note: type === "wypustAGD" ? agdName.trim() : type === "gniazdko" && dedicated ? "AGD" : "",
      agdLetter: type === "wypustAGD" ? agdLetter.trim().slice(0, 2).toUpperCase() || "A" : undefined,
      lightGroup: groupApplies && parsed.some((n) => n != null) ? parsed : undefined,
      heightM: parsedHeight,
      widthM: przyborem ? zCm(szer) : undefined,
      depthM: przyborem ? zCm(glab) : undefined,
      // Odbiornik z własnym obwodem z definicji zachowuje zapisany numer nietknięty:
      // dobór i tak go pomija (`recznyNumer`), a odznaczenie „dedykowane" ma oddać
      // użytkownikowi ten sam obwód, w którym punkt był przedtem.
      obwod: wlasnyObwod ? element.obwod : obwod,
    });
  }

  /** Centymetry z pola na metry w projekcie. Nieliczba i wartość spoza sensownego
   *  zakresu wracają do „typowej" — literówka w tej liczbie rozdyma strefę ochronną,
   *  więc lepiej zignorować wpis niż zapisać wannę długą na dwadzieścia metrów. */
  function zCm(raw: string): number | undefined {
    const cm = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(cm) || cm <= 0) return undefined;
    const m = cm / 100;
    return m <= MAX_WYMIAR_PRZYBORU_M ? m : undefined;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Nazwa elementu w TYTULE, bo przy trzydziestu symbolach na rzucie — i po
          zmniejszeniu ich o jedna trzecia — po samym oknie nie dalo sie poznac,
          czy dwuklik trafil w gniazdko, czy w sasiedni lacznik.

          Celowo `element.type`, a NIE `type` ze stanu: siatka nizej ma wlasny podpis
          „Zmien na", wiec tytul odpowiada na pytanie „co to jest", a siatka na „na co
          to zmienic". Tytul podazajacy za siatka mowilby to samo co ona i pytanie
          „w co ja kliknalem" znow zostaloby bez odpowiedzi. */}
      <DialogContent title={`Edytuj element: ${ELEMENT_TYPES[element.type].label}`} className="max-w-sm">
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-xs text-slate-500">Zmień na</div>
            <div className="pe-scroll max-h-64 space-y-3 overflow-y-auto pr-1">
              {ELEMENT_SECTIONS.map((section) => (
                <div key={section.title}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{section.title}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {section.items.map((item) => {
                      const def = ELEMENT_TYPES[item.key];
                      const active = type === item.key;
                      return (
                        <Button variant="secondary" size="sm"
                          type="button"
                          key={item.key}
                          onClick={() => setType(item.key)}
                          className="h-auto justify-start gap-2 p-2 text-left"
                          style={active ? { borderColor: def.color, background: `${def.color}14`, color: def.color } : undefined}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                            <GlyphPreview
                              type={item.key}
                              color={def.color}
                              gangs={active ? gangs : 1}
                              agdLetter={active && item.key === "wypustAGD" ? agdLetter : undefined}
                              size={20}
                            />
                          </span>
                          <span className="truncate">{def.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {variants && variants.length > 1 && (
            <div>
              <div className="mb-1.5 text-xs text-slate-500">
                {type.startsWith("wlacznik") ? "Liczba klawiszy" : "Liczba gniazd w ramce"}
              </div>
              <div className={`grid gap-1 ${variants.length > 2 ? "grid-cols-6" : "grid-cols-2"}`}>
                {variants.map((n) => (
                  <Button variant="secondary" size="sm"
                    key={n}
                    // Wybrany wariant w kolorach miedzi z tokenów (tło nieprzezroczyste,
                    // `copper-tlo`), nie z hex z kanałem alfa — patrz klasyUsuniete.test.ts.
                    className={
                      gangs === n
                        ? "border-copper bg-copper-tlo px-0 text-copper hover:border-copper hover:text-copper"
                        : "px-0"
                    }
                    type="button"
                    onClick={() => setGangs(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {type === "gniazdko" && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={dedicated} onChange={(e) => setDedicated(e.target.checked)} />
              Gniazdo dedykowane (AGD, własny obwód)
            </label>
          )}

          {type === "wypustAGD" && (
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <label className="block">
                <div className="mb-1 text-xs text-slate-500">Litera w symbolu</div>
                <input
                  value={agdLetter}
                  onChange={(e) => setAgdLetter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  maxLength={2}
                  aria-label="Litera w symbolu wypustu AGD"
                  className="pe-input w-full text-sm uppercase"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs text-slate-500">Nazwa odbiornika (opcjonalnie)</div>
                <input
                  value={agdName}
                  onChange={(e) => setAgdName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  placeholder="np. Lodówka"
                  aria-label="Nazwa odbiornika wypustu AGD"
                  className="pe-input w-full text-sm"
                />
              </label>
            </div>
          )}

          {groupApplies && (
            <div>
              <div className="mb-1 text-xs text-slate-500">
                {circuits > 1 ? "Grupy sterowania oświetleniem (dwa obwody)" : "Grupa sterowania oświetleniem"}
              </div>
              <div className={circuits > 1 ? "grid grid-cols-2 gap-2" : ""}>
                {Array.from({ length: circuits }, (_, i) => (
                  <div key={i}>
                    <input
                      type="number"
                      min={1}
                      aria-label={circuits > 1 ? `Grupa — obwód ${i + 1}` : "Grupa sterowania oświetleniem"}
                      value={groupInputs[i] ?? ""}
                      onChange={(e) =>
                        setGroupInputs((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                      }}
                      placeholder={autoLightGroups?.[i] != null ? `auto: ${autoLightGroups[i]}` : "auto"}
                      className="pe-input w-full text-sm"
                    />
                    {circuits > 1 && (
                      <div className="mt-0.5 text-xs text-slate-400">
                        {i === 0 ? "lewa dźwignia" : "prawa dźwignia"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs leading-snug text-slate-400">
                Elementy z tym samym numerem tworzą jedną grupę — wpisz numer, do którego chcesz dołączyć.
                Puste pole oznacza dobór automatyczny (najbliższy łącznik w tym samym pomieszczeniu).
              </p>
            </div>
          )}

          {/* Przybory sanitarne dostają WYMIARY zamiast wysokości montażu. Wanny nie
              montuje się na wysokości, za to jej obrys JEST strefą 1 wg
              PN-HD 60364-7-701 — a wanien 1,50 i 1,80 m sprzedaje się tyle samo co
              1,70. Bez tych dwóch pól walidator sprawdzałby strefę wanny, której
              w tej łazience nie ma. */}
          {przyborem && (
            <div>
              <div className="mb-1 text-xs text-slate-500">Wymiary przyboru [cm]</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  max={MAX_WYMIAR_PRZYBORU_M * 100}
                  step={1}
                  value={szer}
                  onChange={(e) => setSzer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  placeholder={`dł. ${Math.round(przybornik!.widthM * 100)}`}
                  aria-label="Długość przyboru w centymetrach"
                  className="pe-input w-full text-sm"
                />
                <input
                  type="number"
                  min={1}
                  max={MAX_WYMIAR_PRZYBORU_M * 100}
                  step={1}
                  value={glab}
                  onChange={(e) => setGlab(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  placeholder={`szer. ${Math.round(przybornik!.depthM * 100)}`}
                  aria-label="Szerokość przyboru w centymetrach"
                  className="pe-input w-full text-sm"
                />
              </div>
              <p className="mt-1 text-xs leading-snug text-slate-400">
                Obrys przyboru jest jednocześnie strefą ochronną, więc te wymiary decydują, które
                gniazdo sprawdzenie rzutu zgłosi. Puste pola oznaczają wymiary typowe. Dłuższy bok
                leży wzdłuż symbolu — obrót elementu obraca też strefę.
              </p>
            </div>
          )}

          {/* Wysokość montażu — puste pole znaczy „wartość typowa dla tego typu"
              (patrz `MOUNTING_HEIGHTS_M`), tak jak puste pole grupy znaczy „auto".
              Trzymane jako TEKST z tego samego powodu: liczba nie ma stanu „brak",
              a to on przywraca wartość domyślną po ręcznej zmianie. */}
          <label className={przyborem ? "hidden" : "block"}>
            <div className="mb-1 text-xs text-slate-500">Wysokość montażu [m]</div>
            <input
              type="number"
              min={0}
              max={5}
              step={0.05}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              placeholder={`typowa: ${MOUNTING_HEIGHTS_M[type] ?? 0.3}`}
              aria-label="Wysokość montażu w metrach"
              className="pe-input w-full text-sm"
            />
            <p className="mt-1 text-xs leading-snug text-slate-400">
              Wchodzi w długość przewodu (zejście od stropu do puszki) i w kosztorys. Puste pole
              oznacza wartość typową dla tego typu osprzętu.
            </p>
          </label>

          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Pomieszczenie</div>
            <input
              list="rooms-edit"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              className="pe-input w-full text-sm"
            />
            <datalist id="rooms-edit">
              {roomSuggestions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>

          {/* Ten sam wybór, co w menu pod prawym przyciskiem — i ten sam komponent, żeby
              obie drogi nie rozjechały się w tym, co pokazują. Dwuklik otwiera to okno,
              więc bez tego numer obwodu był jedyną własnością elementu, której się tu
              nie dało zmienić: trzeba było okno zamknąć i sięgnąć po prawy przycisk. */}
          {/* Z typu ustawianego w tym oknie, jak `wlasnyObwod` wyżej — zmiana gniazdka na
              łącznik chowa wybór od razu. */}
          {wchodziDoObwodu({ ...element, type }) && (
            <WyborObwodu
              wariant="formularz"
              numerAktualny={obwod}
              uzyte={uzyteObwody}
              onWybierz={setObwod}
              zablokowane={
                wlasnyObwod
                  ? "Ten odbiornik ma własny obwód z definicji — inny przewód i inne zabezpieczenie niż obwód wspólny."
                  : undefined
              }
            />
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="button" variant="copper" className="flex-1" onClick={handleSave}>
              Zapisz
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
