import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/useProjectStore";
import { SUPABASE_CONFIGURED, supaListaUdostepnien, supaUsunUdostepnienie, supaWgrajUdostepnienie, type PlikUdostepnienia } from "@/lib/supabase";
import { idZNazwyPliku, linkPodgladu, sciezkaPliku } from "@/lib/udostepnianie";

/**
 * „Udostępnij linkiem" w podglądzie kompletu dokumentacji (F14 z audytu 5.11.2026).
 *
 * Wgrywa TEN dokument, który właśnie widać w podglądzie — inwestor dostaje dokładnie
 * to, co elektryk obejrzał. Każde udostępnienie to osobny link; lista pod spodem
 * pozwala wyłączyć dawne, kiedy przestaną być aktualne.
 */
export function UdostepnijLinkiem({ bajty }: { bajty: Uint8Array | null }) {
  const session = useProjectStore((s) => s.session);
  const zapewnijSesje = useProjectStore((s) => s.zapewnijSesje);
  const [trwa, setTrwa] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [nowyLink, setNowyLink] = useState<string | null>(null);
  const [skopiowany, setSkopiowany] = useState(false);
  const [lista, setLista] = useState<PlikUdostepnienia[] | null>(null);

  const odswiezListe = useCallback(async () => {
    const s = await zapewnijSesje();
    if (!s) return;
    try {
      setLista(await supaListaUdostepnien(s.token, s.user.id));
    } catch {
      // Lista to dodatek — brak koszyka zgłosi się dopiero przy próbie udostępnienia.
      setLista(null);
    }
  }, [zapewnijSesje]);

  useEffect(() => {
    if (session) void odswiezListe();
  }, [session, odswiezListe]);

  if (!SUPABASE_CONFIGURED) return null;
  if (!session) {
    return <span className="text-sm text-slate-500">Zaloguj się, żeby udostępnić dokumentację linkiem tylko do odczytu.</span>;
  }

  async function udostepnij() {
    if (!bajty) return;
    setTrwa(true);
    setBlad(null);
    try {
      const s = await zapewnijSesje();
      if (!s) throw new Error("Sesja wygasła — zaloguj się ponownie.");
      const u = { uid: s.user.id, id: crypto.randomUUID() };
      await supaWgrajUdostepnienie(s.token, sciezkaPliku(u), new Uint8Array(bajty));
      const link = linkPodgladu(window.location.origin, u);
      setNowyLink(link);
      setSkopiowany(false);
      await odswiezListe();
    } catch (e) {
      setBlad(e instanceof Error ? e.message : "Nie udało się udostępnić dokumentacji.");
    } finally {
      setTrwa(false);
    }
  }

  async function kopiuj(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setSkopiowany(true);
    } catch {
      setSkopiowany(false);
    }
  }

  async function wylacz(nazwa: string) {
    const s = await zapewnijSesje();
    if (!s) return;
    const id = idZNazwyPliku(nazwa);
    try {
      await supaUsunUdostepnienie(s.token, `${s.user.id}/${nazwa}`);
      if (id && nowyLink?.endsWith(id)) setNowyLink(null);
      await odswiezListe();
    } catch (e) {
      setBlad(e instanceof Error ? e.message : "Nie udało się wyłączyć linku.");
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 text-sm" data-testid="udostepnij-linkiem">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" disabled={!bajty || trwa} onClick={udostepnij}>
          {trwa ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Udostępnij linkiem (tylko do odczytu)
        </Button>
        {nowyLink && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              readOnly
              aria-label="Link do udostępnionej dokumentacji"
              value={nowyLink}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1 font-mono text-xs"
            />
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => kopiuj(nowyLink)}>
              {skopiowany ? <Check size={14} /> : <Copy size={14} />} {skopiowany ? "Skopiowano" : "Kopiuj"}
            </Button>
          </div>
        )}
      </div>
      {nowyLink && (
        <p className="text-xs text-slate-500">
          Odbiorca zobaczy ten dokument w stanie z tej chwili — późniejsze zmiany w projekcie go nie zmienią. Link działa, dopóki go nie wyłączysz.
        </p>
      )}
      {blad && (
        <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700" role="alert">
          {blad}
        </p>
      )}
      {lista && lista.length > 0 && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer select-none">Aktywne linki ({lista.length})</summary>
          <ul className="mt-1 space-y-1">
            {lista.map((p) => {
              const id = idZNazwyPliku(p.name);
              if (!id) return null;
              const link = linkPodgladu(window.location.origin, { uid: session.user.id, id });
              return (
                <li key={p.name} className="flex items-center gap-2" data-testid="aktywny-link">
                  <span className="tabular-nums text-slate-500">{new Date(p.created_at).toLocaleString("pl-PL")}</span>
                  <a href={link} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono underline">
                    {link}
                  </a>
                  <button type="button" className="ml-auto text-red-600" aria-label="Wyłącz link" onClick={() => wylacz(p.name)}>
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
