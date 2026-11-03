import type { DocumentHeader, PanelDevice } from "@/types";
import { createPdfDoc, pdfFitText, pdfTextWidth, pdfZawin, type PdfDoc } from "./engine";
import { drawTitleBlock } from "./titleBlock";

/**
 * Paski opisowe do wycięcia i wsunięcia w tabliczki na aparatach.
 *
 * Legenda rozdzielnicy (`panelLegend.ts`) to tabela do dokumentacji — czyta ją
 * elektryk przy biurku. Ten dokument jest inny: drukuje się go, TNIE nożyczkami wzdłuż
 * linii cięcia i wkłada pod przezroczyste okienka na froncie aparatów. Dlatego wymiary
 * nie są dobrane „na oko" pod czytelność na ekranie, tylko przeliczone z REALNEJ
 * szerokości modułu DIN (17,5 mm — ta sama wartość, co komentarz przy `MOD_W` w
 * `panel/devices.ts`), żeby wydrukowany pasek fizycznie pasował pod aparat.
 *
 * Papier musi wyjść ze skalą 1:1 — żadnego „dopasuj do strony" w oknie drukowania,
 * bo wtedy pasek przestaje pasować pod aparat. Strona ma dopisek o tym w stopce.
 */

const MM_TO_PT = 72 / 25.4;
/** Szerokość jednego modułu DIN — realny wymiar, nie skala ekranowa. */
const MODULE_MM = 17.5;
const MODULE_W = MODULE_MM * MM_TO_PT;
/** Wysokość paska: mieści oznaczenie i dwuwierszowy opis, dobrana pod typowe okienko
 *  tabliczki opisowej na froncie aparatu modułowego. */
const STRIP_H = 15 * MM_TO_PT;
const GAP_MIEDZY_PASKAMI = 8;

// Poziomo: przy 17,5 mm/moduł rząd o typowych 12-24 modułach (210–420 mm) NIE mieści
// się na pionowym A4 (170 mm szerokości drukowalnej). Poziomy A4 daje ~280 mm — więcej,
// ale dla dużych rozdzielnic i tak trzeba będzie łamać rząd na kilka odcinków (patrz
// `naOdcinki` niżej), zawsze MIĘDZY aparatami, nigdy w poprzek jednego.
const STRONA_W = 841.89;
const STRONA_H = 595.28;
const MARGINES = 28;

/** Aparaty pomijamy w wydruku pasków — pusta zaślepka nie ma czego opisywać. */
const POMIN: PanelDevice["kind"][] = ["blank"];

/** Dzieli aparaty na wiersze o łącznej szerokości nie większej niż `perRow` modułów —
 *  te same granice, po których fizycznie ułożone są aparaty na szynie rozdzielnicy,
 *  więc jeden wiersz tej funkcji odpowiada dokładnie jednemu rzędowi tablicy. */
function podzielNaRzedy(devices: PanelDevice[], perRow: number): PanelDevice[][] {
  const rzedy: PanelDevice[][] = [];
  let biezacy: PanelDevice[] = [];
  let uzyte = 0;
  for (const d of devices) {
    if (uzyte + d.modules > perRow && biezacy.length) {
      rzedy.push(biezacy);
      biezacy = [];
      uzyte = 0;
    }
    biezacy.push(d);
    uzyte += d.modules;
  }
  if (biezacy.length) rzedy.push(biezacy);
  return rzedy;
}

/** Dzieli JEDEN rząd na odcinki mieszczące się w `maxSzer` punktów — łamanie zawsze
 *  na granicy aparatu, nigdy w jego środku, żeby po wycięciu dało się je skleić
 *  taśmą w jeden ciągły pasek bez ucinania czyjegoś opisu w pół. */
function naOdcinki(rzad: PanelDevice[], maxSzer: number): PanelDevice[][] {
  const odcinki: PanelDevice[][] = [];
  let biezacy: PanelDevice[] = [];
  let szer = 0;
  for (const d of rzad) {
    const w = d.modules * MODULE_W;
    if (szer + w > maxSzer && biezacy.length) {
      odcinki.push(biezacy);
      biezacy = [];
      szer = 0;
    }
    biezacy.push(d);
    szer += w;
  }
  if (biezacy.length) odcinki.push(biezacy);
  return odcinki;
}

/**
 * Opis aparatu na pasku: do TRZECH linii, a gdy nie mieści się w trzech przy 6,5 pt,
 * kolejno mniejszą czcionką (6, 5,5 pt) — dopiero na końcu przycięty.
 *
 * Pasek ma wysokość 15 mm, czyli miejsce na oznaczenie i trzy linie opisu. Opis łamany
 * do dwóch linii ucinał nazwy obwodów w wąskim, jednomodułowym aparacie („Obwód gnia..
 * ogólnych 1"), a tabliczka na froncie aparatu jest właśnie tym, po czym elektryk
 * rozpoznaje obwód — ucięta nazwa to nieczytelna tabliczka. Mniejszy druk jest lepszy
 * niż brakujące słowa; 5,5 pt to dolna granica czytelności wydruku 1:1.
 */
export function opisNaPasku(opis: string, szerokosc: number): { linie: string[]; size: number } {
  const MAKS_LINII = 3;
  for (const size of [6.5, 6, 5.5]) {
    const linie = pdfZawin(opis, szerokosc, size, false);
    if (linie.length <= MAKS_LINII) return { linie, size };
  }
  const size = 5.5;
  const wszystkie = pdfZawin(opis, szerokosc, size, false);
  // Trzecia linia dostaje CAŁĄ resztę tekstu i jest przycinana wielokropkiem: czytelnik
  // ma wiedzieć, że opis był dłuższy, a nie że kończy się w tym miejscu.
  const reszta = wszystkie.slice(MAKS_LINII - 1).join(" ");
  return { linie: [...wszystkie.slice(0, MAKS_LINII - 1), pdfFitText(reszta, szerokosc, size, false)], size };
}

/**
 * Składa PDF z paskami opisowymi i zwraca gotowe bajty (bez pobierania — testowalne
 * bez DOM-u, jak reszta silnika).
 */
export function buildLabelStripsDoc(devices: PanelDevice[], perRow: number, header: DocumentHeader): PdfDoc {
  const doc = createPdfDoc({
    pageW: STRONA_W,
    pageH: STRONA_H,
    margin: MARGINES,
    footer: (d) => drawTitleBlock(d, header, "Paski opisowe rozdzielnicy"),
  });
  const M = doc.margin;
  const maxSzer = doc.innerW;

  doc.text("Paski opisowe do wycięcia — druk BEZ SKALOWANIA (100%), inaczej szerokość", M, doc.y, 8, false, 0.4);
  doc.y -= 11;
  doc.text("nie będzie zgadzać się z modułem DIN (17,5 mm).", M, doc.y, 8, false, 0.4);
  doc.y -= 22;

  const rzedy = podzielNaRzedy(
    devices.filter((d) => !POMIN.includes(d.kind)),
    perRow
  );

  for (const rzad of rzedy) {
    const odcinki = naOdcinki(rzad, maxSzer);
    odcinki.forEach((odcinek, i) => {
      if (doc.ensure(STRIP_H + GAP_MIEDZY_PASKAMI)) {
        doc.text("Paski opisowe do wycięcia — ciąg dalszy", M, doc.y, 8, false, 0.4);
        doc.y -= 22;
      }

      const szerOdcinka = odcinek.reduce((a, d) => a + d.modules * MODULE_W, 0);
      const dol = doc.y - STRIP_H;
      doc.box(M, dol, szerOdcinka, STRIP_H, 0.97);
      doc.line(M, doc.y, M + szerOdcinka, doc.y, 0.6, 0.3); // linia cięcia górna
      doc.line(M, dol, M + szerOdcinka, dol, 0.6, 0.3); // linia cięcia dolna

      let x = M;
      for (const device of odcinek) {
        const w = device.modules * MODULE_W;
        if (x > M) doc.line(x, dol, x, doc.y, 0.4, 0.55);

        const srodekX = x + w / 2;
        const tag = pdfFitText(device.tag, w - 4, 7.5, true);
        doc.text(tag, srodekX - pdfTextWidth(tag, 7.5, true) / 2, doc.y - 9, 7.5, true);

        const opis = opisNaPasku(device.caption || device.label, w - 4);
        opis.linie.forEach((linia, n) => {
          doc.text(linia, srodekX - pdfTextWidth(linia, opis.size, false) / 2, doc.y - 20 - n * (opis.size + 1), opis.size);
        });

        x += w;
      }

      // Odcinek NIE jest cały rząd — pod nim dopisek, gdzie go skleić z kolejnym.
      if (odcinki.length > 1) {
        doc.text(
          i < odcinki.length - 1 ? "▸ dalszy ciąg tego rzędu na kolejnym pasku" : "◂ sklej z poprzednim paskiem",
          M,
          dol - 9,
          6.5,
          false,
          0.5
        );
        doc.y = dol - 9 - 11;
      } else {
        doc.y = dol;
      }
      doc.y -= GAP_MIEDZY_PASKAMI;
    });
  }

  return doc;
}

/**
 * Ten sam dokument jako gotowy plik. Rozdzielenie na buildLabelStripsDoc i buildLabelStripsPdf jest po to,
 * zeby komplet dokumentacji mogl wziac SAME STRONY i zlozyc je z innymi dokumentami
 * w jeden plik (patrz polaczDokumenty w engine.ts) — zamiast sklejac gotowe PDF-y.
 */
export function buildLabelStripsPdf(...args: Parameters<typeof buildLabelStripsDoc>): Promise<Uint8Array> {
  return buildLabelStripsDoc(...args).finish();
}
