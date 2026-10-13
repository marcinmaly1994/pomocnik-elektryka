// Worker budowany przez Vite (`?worker`) i podpinany jako gotowa instancja.
// Sklejanie adresu z `import.meta.url` dawało ścieżkę względem KATALOGU TEGO PLIKU —
// worker leciał na `/src/components/ui/pdfjs-dist/...` i kończył się błędem. Samo
// podanie poprawnego adresu też nie wystarczy: pdf.js tworzy wtedy KLASYCZNY worker,
// a serwowany plik jest modułem ESM i nie daje się sparsować — `getDocument` wisi
// w nieskończoność, a podgląd nigdy się nie pojawia.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

/**
 * Ładuje pdf.js z podpiętym workerem — JEDYNE miejsce, które to robi.
 *
 * Podgląd PDF-a i wgrywanie rzutu z PDF-a miały każde własny sposób ładowania workera
 * (`?worker` oraz `new URL(…)`), więc Vite emitował DWA pliki workera po ok. 1,2 MB
 * i service worker zapamiętywał oba. Jeden sposób to jeden plik w paczce.
 *
 * Nowa instancja workera przy każdym wywołaniu, tak jak robił to podgląd: pdf.js
 * zamyka port workera wraz z dokumentem, więc ponowne użycie tej samej instancji
 * nie jest bezpieczne.
 */
export async function zaladujPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  return pdfjs;
}
