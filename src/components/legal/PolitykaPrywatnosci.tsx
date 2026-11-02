import { Cookie, Database, HardDrive, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { AdresKontaktowy, BanerSzkicu, DoUzupelnienia, MetryczkaDokumentu, Sekcja } from "./wspolne";
import { USLUGODAWCA } from "./daneUslugodawcy";

/**
 * Polityka prywatności — obowiązek informacyjny z art. 13 RODO.
 *
 * Strona towarzysząca, nie krok przepływu: własny adres („/prywatnosc"), bez kafla
 * i bez pigułek nawigacji (patrz komentarz przy `AppTab` w lib/routing.ts). Wchodzi
 * się tu z trzech miejsc — ze stopki, z Pomocy i z formularza rejestracji — i każde
 * z nich pilnuje osobny test w `e2e/prywatnosc.spec.ts`, bo dokument, do którego nie
 * prowadzi żaden działający link, jest tym samym co dokument, którego nie ma.
 *
 * Pisana pod LAIKA, tak jak reszta aplikacji: krótkie zdania, rzeczy nazwane po
 * imieniu, obowiązkowa formuła prawna dopiero pod spodem. Kto przychodzi z pytaniem
 * „czy zbieracie o mnie dane", ma znaleźć odpowiedź w pierwszym akapicie, a nie
 * w ósmym.
 */

export function PolitykaPrywatnosci() {
  return (
    <article className="mx-auto max-w-3xl">
      <h2 className="pe-display mb-1 text-xl">Prywatność i dane</h2>
      <MetryczkaDokumentu nazwa="Polityka prywatności" />

      <BanerSzkicu czego="nie wskazuje administratora danych — czyli nie spełnia jeszcze obowiązku z art. 13 RODO." />

      <div className="space-y-7 text-[13px] leading-relaxed text-slate-600">
        <p>
          Krótko, zanim przejdziemy do szczegółów:{" "}
          <strong className="text-ink">bez założenia konta ta aplikacja nie wysyła o tobie niczego na serwer.</strong>{" "}
          Projekt, który rysujesz, zostaje w pamięci twojej przeglądarki. Dopiero konto — zakładane dobrowolnie, po
          to, żeby mieć dostęp do projektu z innego urządzenia — sprawia, że cokolwiek trafia do chmury.
        </p>

        <Sekcja ikona={Cookie} tytul="Ciasteczka i śledzenie">
          <p>
            <strong className="text-ink">Ta aplikacja nie używa plików cookies.</strong> Nie ma w niej też Google
            Analytics ani żadnego innego narzędzia analitycznego, nie ma pikseli reklamowych, wtyczek
            społecznościowych ani czcionek dociąganych z cudzych serwerów. Nic nie śledzi cię między stronami i nie
            sprzedajemy nikomu żadnych danych.
          </p>
          <p>
            Dlatego nie zobaczysz tu okienka „zaakceptuj ciasteczka". Nie jest potrzebne: zgody wymaga
            przechowywanie na twoim urządzeniu rzeczy, które nie są konieczne do działania usługi, a wszystko, co
            zapisujemy, jest albo do niej konieczne, albo jest twoim własnym ustawieniem widoku. Niżej dokładna lista.
          </p>
        </Sekcja>

        <Sekcja ikona={HardDrive} tytul="Co zostaje w twojej przeglądarce">
          <p>
            W pamięci lokalnej przeglądarki (<span className="pe-mono text-[12px]">localStorage</span>) zapisujemy:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>twój projekt instalacji — rzut, pomieszczenia, osprzęt, obwody, kosztorys i wgrany podkład;</li>
            <li>dane wpisane w kalkulatorach i w protokołach pomiarowych;</li>
            <li>ustawienia widoku — zwinięte panele, przypięcia, to, czy przewodnik był już pokazany;</li>
            <li>token sesji, jeśli jesteś zalogowany — po to, żeby odświeżenie strony nie wylogowywało.</li>
          </ul>
          <p>
            Ta pamięć należy do ciebie i do twojej przeglądarki — nie mamy do niej wglądu. Wyczyszczenie danych
            witryny albo tryb prywatny kasuje wszystko z powyższej listy,{" "}
            <strong className="text-ink">łącznie z projektem, jeśli nie masz konta</strong>.
          </p>
        </Sekcja>

        <Sekcja ikona={Database} tytul="Co trafia na serwer — i tylko z kontem">
          <p>Jeśli założysz konto, przetwarzamy:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong className="text-ink">adres e-mail i hasło</strong> — hasło trafia na serwer wyłącznie w postaci
              nieodwracalnego skrótu, więc nie znamy go ani my, ani nikt inny;
            </li>
            <li>
              <strong className="text-ink">zapisane projekty</strong> — to samo, co trzymała przeglądarka, odłożone
              na serwerze, żebyś miał do tego dostęp z każdego urządzenia;
            </li>
            <li>
              <strong className="text-ink">techniczne dane połączenia</strong> — adres IP i czas zapytania,
              zapisywane automatycznie w logach serwera i potrzebne do jego bezpieczeństwa.
            </li>
          </ul>
          <p>
            Podstawą prawną jest wykonanie umowy o świadczenie usługi konta (art. 6 ust. 1 lit. b RODO), a dla logów
            — prawnie uzasadniony interes w utrzymaniu bezpieczeństwa serwisu (art. 6 ust. 1 lit. f RODO). Podanie
            danych jest dobrowolne, ale bez adresu e-mail nie da się prowadzić konta.
          </p>
        </Sekcja>

        <Sekcja ikona={ShieldCheck} tytul="Dane twojego klienta w dokumentach">
          <p>
            Protokoły pomiarowe i nagłówek dokumentów mają pola <em>zleceniodawca</em>, <em>adres obiektu</em> i{" "}
            <em>wykonawca</em>. Jeśli wpiszesz tam dane swojego klienta i zapiszesz projekt w chmurze, trafią one na
            serwer razem z resztą projektu.
          </p>
          <p>
            W takiej sytuacji to <strong className="text-ink">ty decydujesz</strong>, czyje dane i po co tam
            wpisujesz — my jedynie je dla ciebie przechowujemy. Nie zaglądamy do nich, nie analizujemy ich i nie
            używamy do niczego poza pokazaniem ci twojego projektu. Jeśli nie chcesz nam powierzać danych klienta,
            zostaw te pola puste i uzupełnij je dopiero na wydruku.
          </p>
        </Sekcja>

        <Sekcja ikona={Database} tytul="Komu powierzamy dane">
          <p>Aplikacja korzysta z trzech usług zewnętrznych, każdej w wąskim zakresie:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong className="text-ink">Supabase</strong> — baza danych i obsługa kont. Tu leżą twój adres e-mail
              i zapisane projekty. Serwery: <DoUzupelnienia>{USLUGODAWCA.regionDanych}</DoUzupelnienia>.
            </li>
            <li>
              <strong className="text-ink">Cloudflare</strong> — hosting strony i jej dostarczanie. Przetwarza
              techniczne dane połączenia.
            </li>
            <li>
              <strong className="text-ink">Resend</strong> — wysyłka wiadomości e-mail: potwierdzenia rejestracji
              i linku do zmiany hasła. Dostaje wyłącznie adres e-mail i treść takiej wiadomości.
            </li>
          </ul>
          <p>
            <strong className="text-ink">Twoje konto i projekty leżą na serwerach w Irlandii</strong>, czyli
            w Europejskim Obszarze Gospodarczym — nie opuszczają go. Cloudflare i Resend są natomiast dostawcami
            spoza EOG, więc obsługiwane przez nich dane (techniczne dane połączenia oraz adres e-mail przy wysyłce
            wiadomości) mogą być przekazywane poza EOG — na podstawie standardowych klauzul umownych zatwierdzonych
            przez Komisję Europejską. Poza tymi trzema dostawcami nie udostępniamy danych nikomu; nie trafiają do
            reklamodawców ani do pośredników.
          </p>
        </Sekcja>

        <Sekcja ikona={Trash2} tytul="Jak długo i jak to skasować">
          <p>
            Dane konta i projekty trzymamy tak długo, jak istnieje konto. Możesz je skasować sam i natychmiast: menu
            konta → <strong className="text-ink">Ustawienia konta</strong> →{" "}
            <strong className="text-ink">Usuń konto</strong>. Kasowane są wtedy zarówno projekty, jak i samo konto —
            bezpowrotnie i bez pytania nas o zgodę. Dane z przeglądarki usuwa wyczyszczenie danych witryny. Logi
            serwera zacierają się automatycznie po kilkudziesięciu dniach.
          </p>
        </Sekcja>

        <Sekcja ikona={Mail} tytul="Twoje prawa i kontakt">
          <p>
            Administratorem twoich danych jest <DoUzupelnienia>{USLUGODAWCA.nazwa}</DoUzupelnienia>. W sprawach
            dotyczących danych pisz na <AdresKontaktowy />.
          </p>
          <p>
            Masz prawo dostępu do swoich danych, ich sprostowania, usunięcia i ograniczenia przetwarzania, prawo do
            przeniesienia danych oraz prawo sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie.
            Przysługuje ci też skarga do Prezesa Urzędu Ochrony Danych Osobowych. Nie podejmujemy wobec ciebie decyzji
            automatycznie i nie profilujemy cię.
          </p>
        </Sekcja>
      </div>
    </article>
  );
}
