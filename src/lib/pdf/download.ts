/**
 * Uruchamia pobieranie pliku w przeglądarce — efekt uboczny, celowo wydzielony spod
 * silnika PDF (engine.ts), żeby samo składanie bajtów dało się testować bez DOM-u.
 */
export function downloadBlob(blob: Blob, filename: string): boolean {
  const url = URL.createObjectURL(blob);
  let ok = false;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    ok = true;
  } catch {
    ok = false;
  }
  if (!ok) {
    try {
      ok = !!window.open(url, "_blank");
    } catch {
      ok = false;
    }
  }
  // URL zwalniamy z opóźnieniem — natychmiastowe revoke potrafi przerwać rozpoczęte pobieranie.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return ok;
}

/** Polskie znaki na ASCII — nazwa pliku ma być bezpieczna na każdym systemie plików
 *  i czytelna po wysłaniu mailem, więc nie zostawiamy w niej „ó”, „ż” ani spacji. */
const PL_ASCII: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL_ASCII[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Nazwa pliku eksportu z doklejoną nazwą projektu — bez tego każdy projekt zapisywał
 * się jako ten sam `kosztorys-instalacji.csv` / `protokol-ogledziny.pdf` i pliki z
 * różnych zleceń nadpisywały się nawzajem w folderze pobierania.
 */
export function projectFileName(base: string, projectName: string, ext: string): string {
  const slug = slugify(projectName);
  return slug ? `${base}-${slug}.${ext}` : `${base}.${ext}`;
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): boolean {
  // @types/node's Uint8Array<ArrayBufferLike> vs lib.dom's BlobPart<ArrayBuffer> — safe at
  // runtime (Blob accepts any typed array), TS just can't express it across those two libs.
  return downloadBlob(new Blob([bytes] as BlobPart[], { type: "application/pdf" }), filename);
}
