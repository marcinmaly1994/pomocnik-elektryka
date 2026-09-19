import { AlertTriangle, FileText, Laptop, MessageSquare, Scale, UserCog } from "lucide-react";
import { LIMIT_ZAPISOW } from "@/lib/dokumenty";
import { AdresKontaktowy, BanerSzkicu, DoUzupelnienia, MetryczkaDokumentu, Sekcja, USLUGODAWCA } from "./wspolne";

/**
 * Regulamin świadczenia usługi drogą elektroniczną (art. 8 ustawy o świadczeniu
 * usług drogą elektroniczną).
 *
 * Bliźniak polityki prywatności: ten sam mechanizm adresu, ta sama część wspólna
 * (`wspolne.tsx`), ten sam ton. Różnica jest w ciężarze: polityka opisuje, co się
 * dzieje z danymi, a regulamin — czego od tej aplikacji NIE wolno oczekiwać. Sekcja
 * o orientacyjności wyników jest tu najważniejsza i stoi wysoko, bo to jedyne
 * zdanie w całym serwisie, którego zlekceważenie może kogoś kosztować pieniądze
 * albo zdrowie.
 *
 * Limit zapisów wciągnięty jest ze stałej `LIMIT_ZAPISOW`, a nie wpisany słownie.
 * Dokument, który podaje inną liczbę niż kod, jest gorszy od dokumentu, który
 * nie podaje żadnej — a przy wpisanej ręcznie rozjazd jest kwestią czasu.
 */
export function Regulamin() {
  return (
    <article className="mx-auto max-w-3xl">
      <h2 className="pe-display mb-1 text-xl">Regulamin</h2>
      <MetryczkaDokumentu nazwa="Regulamin" />

      <BanerSzkicu czego="nie wskazuje usługodawcy — czyli nie spełnia jeszcze wymagań art. 8 ustawy o świadczeniu usług drogą elektroniczną." />

      <div className="space-y-7 text-[13px] leading-relaxed text-slate-600">
        <p>
          Ten dokument opisuje zasady korzystania z serwisu pomocnikelektryka.pl. Najkrócej:{" "}
          <strong className="text-ink">usługa jest bezpłatna, a jej wyniki są pomocą w projektowaniu, nie projektem.</strong>{" "}
          Reszta to szczegóły tych dwóch zdań.
        </p>

        <Sekcja ikona={UserCog} tytul="Kto świadczy usługę">
          <p>
            Usługodawcą jest <DoUzupelnienia>{USLUGODAWCA.nazwa}</DoUzupelnienia>. Kontakt we wszystkich sprawach
            dotyczących serwisu, w tym reklamacji: <AdresKontaktowy />.
          </p>
        </Sekcja>

        <Sekcja ikona={AlertTriangle} tytul="Czym ta usługa jest, a czym nie jest">
          <p>
            Serwis pozwala narysować rzut mieszkania, rozmieścić na nim osprzęt i oświetlenie, a następnie policzyć
            dobór zabezpieczeń, schemat jednokreskowy, kosztorys i protokoły pomiarowe.
          </p>
          <p>
            <strong className="text-ink">
              Wszystkie wyniki obliczeń są orientacyjne i nie zastępują projektu instalacji ani odbioru przez osobę
              z uprawnieniami budowlanymi lub SEP.
            </strong>{" "}
            Serwis nie jest projektem budowlanym, nie jest opinią techniczną i nie stanowi podstawy do wykonania
            instalacji. Prace przy instalacji elektrycznej może wykonywać wyłącznie osoba do tego uprawniona.
          </p>
          <p>
            Obliczenia opierają się na normie PN-HD 60364 i na danych, które sam wprowadzasz. Za poprawność tych
            danych — wymiarów, typów pomieszczeń, parametrów przyłącza — odpowiadasz ty; serwis nie ma jak ich
            zweryfikować.
          </p>
        </Sekcja>

        <Sekcja ikona={Laptop} tytul="Co jest potrzebne, żeby korzystać">
          <p>
            Wystarczy aktualna przeglądarka internetowa z włączonym JavaScriptem i dostępną pamięcią lokalną
            (<span className="pe-mono text-[12px]">localStorage</span>). Bez pamięci lokalnej projekt nie ma się gdzie
            zapisać i aplikacja nie zadziała poprawnie. Korzystanie z konta wymaga dodatkowo połączenia z internetem
            i czynnego adresu e-mail.
          </p>
        </Sekcja>

        <Sekcja ikona={FileText} tytul="Konto i zapisywanie projektów">
          <p>
            Bez konta serwis działa w całości, a projekt zostaje wyłącznie w twojej przeglądarce. Założenie konta
            jest dobrowolne i bezpłatne; umowa o prowadzenie konta zostaje zawarta z chwilą jego założenia i jest
            zawarta na czas nieokreślony.
          </p>
          <p>
            Możesz ją rozwiązać w każdej chwili i bez podawania przyczyny — przyciskiem „Usuń konto" w ustawieniach
            konta. Kasuje on konto razem ze wszystkimi zapisanymi projektami, bezpowrotnie. Usługodawca może
            rozwiązać umowę z zachowaniem 14-dniowego okresu wypowiedzenia, w szczególności przy rażącym naruszeniu
            niniejszych zasad albo przy zakończeniu działania serwisu.
          </p>
          <p>
            Na koncie można przechowywać do <strong className="text-ink">{LIMIT_ZAPISOW}</strong> zapisanych pozycji
            każdego rodzaju (projekty i zestawy protokołów liczone są osobno). Po wyczerpaniu limitu zapis nowej
            pozycji wymaga usunięcia którejś z poprzednich; nadpisanie już zapisanej pozycji jest zawsze możliwe.
            Limit wynika z kosztów utrzymania bezpłatnej usługi i może się zmienić.
          </p>
        </Sekcja>

        <Sekcja ikona={Scale} tytul="Twoje obowiązki i odpowiedzialność">
          <p>
            Nie wolno dostarczać do serwisu treści bezprawnych, ani korzystać z niego w sposób zakłócający jego
            działanie lub działanie infrastruktury, na której stoi.
          </p>
          <p>
            Jeśli wpisujesz w dokumentach dane innych osób — na przykład zleceniodawcy w protokole pomiarowym —
            odpowiadasz za to, że masz do tego podstawę. Sposób przechowywania tych danych opisuje polityka
            prywatności.
          </p>
          <p>
            Usługa jest bezpłatna i wciąż rozwijana, dlatego świadczona jest w takim stanie, w jakim jest. Nie ma
            gwarancji nieprzerwanej dostępności ani tego, że zapisane dane nigdy nie zostaną utracone — projekt, na
            którym ci zależy, warto wyeksportować do pliku. Usługodawca nie odpowiada za szkody wynikłe z
            wykorzystania wyników obliczeń bez weryfikacji przez osobę uprawnioną. Niniejsze zasady nie ograniczają
            praw konsumenta wynikających z bezwzględnie obowiązujących przepisów.
          </p>
        </Sekcja>

        <Sekcja ikona={MessageSquare} tytul="Reklamacje">
          <p>
            Reklamację składasz pocztą elektroniczną na <AdresKontaktowy />. Opisz,
            czego dotyczy i czego oczekujesz; jeśli problem dotyczy konta, podaj adres e-mail, na który jest
            założone. Odpowiedź otrzymasz na ten sam adres w terminie 14 dni od otrzymania zgłoszenia.
          </p>
        </Sekcja>

        <Sekcja ikona={Scale} tytul="Zmiany i prawo właściwe">
          <p>
            Zasady mogą się zmienić — na przykład gdy dojdą nowe funkcje albo zmieni się sposób działania serwisu.
            O zmianie osoby z kontem zostaną poinformowane pocztą elektroniczną co najmniej 14 dni wcześniej;
            korzystanie z serwisu po tym terminie oznacza ich przyjęcie, a brak zgody — możliwość usunięcia konta
            bez żadnych kosztów.
          </p>
          <p>
            W sprawach nieuregulowanych stosuje się prawo polskie, w tym Kodeks cywilny oraz ustawę o świadczeniu
            usług drogą elektroniczną.
          </p>
        </Sekcja>
      </div>
    </article>
  );
}
