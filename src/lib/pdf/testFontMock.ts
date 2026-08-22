import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

/**
 * `createPdfDoc().finish()` pobiera pliki fontów przez `fetch()` (adresy z importu Vite
 * `?url`) — w środowisku testowym nie ma serwera obsługującego te ścieżki, więc podstawiamy
 * `fetch` odczytem tych samych plików z dysku. Wspólne dla wszystkich testów, które
 * (pośrednio, przez `doc.finish()`) generują cały plik PDF.
 */
export function stubPdfFontFetch(): void {
  const regularBytes = new Uint8Array(readFileSync(join(process.cwd(), "src/assets/fonts/DejaVuSans.ttf")));
  const boldBytes = new Uint8Array(readFileSync(join(process.cwd(), "src/assets/fonts/DejaVuSans-Bold.ttf")));
  vi.stubGlobal("fetch", async (url: string) => {
    const bytes = String(url).includes("Bold") ? boldBytes : regularBytes;
    return { arrayBuffer: async () => bytes.buffer } as Response;
  });
}
