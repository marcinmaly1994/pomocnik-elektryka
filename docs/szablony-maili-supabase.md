# Szablony maili autoryzacyjnych (Supabase)

Treści wklejane ręcznie w **Supabase → Authentication → Emails → Templates**.
Ten plik jest KOPIĄ tego, co stoi w panelu — repo nie wysyła tych maili i nie ma
nad nimi kontroli. Trzymamy go, żeby po zmianie projektu Supabase albo po roku
przerwy nie trzeba było pisać ich od nowa i żeby dało się zobaczyć w historii
gita, kiedy i dlaczego się zmieniły.

Aplikacja uruchamia dokładnie dwa z sześciu szablonów Supabase — rejestrację
(`supaSignUp`) i reset hasła (`supaRecover`). Magic linków, zaproszeń, zmiany
adresu e-mail ani ponownego uwierzytelnienia nie ma w interfejsie, więc tamte
szablony zostają domyślne: i tak nigdy nie wyjdą.

Styl jest celowo oszczędny — jeden przycisk, bez grafik i bez tabel układających
stronę. Te maile mają przede wszystkim DOJŚĆ: ciężki HTML podnosi ryzyko filtrów
antyspamowych, a o2.pl i Outlook potrafią rozjechać wszystko, co wykracza poza
proste akapity. Kolor miedziany (`#C1793F`) i granat (`#2D5A8C`) są jedynym
znakiem firmowym i pochodzą wprost z `tailwind.config.ts`.

---

## Confirm signup

**Subject heading:**

```
Potwierdź rejestrację w pomocnikelektryka.pl
```

**Message body:**

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#16202B;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 24px;font-weight:600;color:#2D5A8C">pomocnikelektryka.pl</p>
  <p style="margin:0 0 16px">Cześć,</p>
  <p style="margin:0 0 24px">na ten adres założono konto w pomocnikelektryka.pl. Potwierdź je, żeby zapisywać projekty w chmurze i mieć do nich dostęp z każdego urządzenia.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#C1793F;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600">Potwierdź konto</a>
  </p>
  <p style="margin:0 0 6px;color:#5A6673;font-size:13px">Gdyby przycisk nie działał, wklej ten adres w pasek przeglądarki:</p>
  <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="{{ .ConfirmationURL }}" style="color:#2D5A8C">{{ .ConfirmationURL }}</a></p>
  <p style="margin:0;padding-top:16px;border-top:1px solid #DFE4E9;color:#5A6673;font-size:13px">Link jest jednorazowy. Jeśli nie zakładasz u nas konta, zignoruj tę wiadomość — bez kliknięcia nic się nie stanie.</p>
</div>
```

---

## Reset Password

**Subject heading:**

```
Zresetuj hasło do pomocnikelektryka.pl
```

**Message body:**

```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#16202B;max-width:520px;margin:0 auto;padding:24px">
  <p style="margin:0 0 24px;font-weight:600;color:#2D5A8C">pomocnikelektryka.pl</p>
  <p style="margin:0 0 16px">Cześć,</p>
  <p style="margin:0 0 24px">ktoś poprosił o ustawienie nowego hasła do konta <strong>{{ .Email }}</strong> w pomocnikelektryka.pl. Jeśli to Ty — kliknij poniżej.</p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#C1793F;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600">Ustaw nowe hasło</a>
  </p>
  <p style="margin:0 0 6px;color:#5A6673;font-size:13px">Gdyby przycisk nie działał, wklej ten adres w pasek przeglądarki:</p>
  <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="{{ .ConfirmationURL }}" style="color:#2D5A8C">{{ .ConfirmationURL }}</a></p>
  <p style="margin:0;padding-top:16px;border-top:1px solid #DFE4E9;color:#5A6673;font-size:13px">Link jest jednorazowy. Jeśli to nie Ty, zignoruj tę wiadomość — dotychczasowe hasło zostaje bez zmian i nikt nie dostał dostępu do konta.</p>
</div>
```

---

## Uwagi

- `{{ .ConfirmationURL }}` składa się z wartości **Site URL** (Authentication →
  URL Configuration). Póki stoi tam domyślny `localhost:3000`, linki w obu
  mailach prowadzą donikąd — szablon jest wtedy poprawny, a mail i tak bezużyteczny.
- Nie wpisujemy w treść, ile link jest ważny. Termin siedzi w ustawieniach
  Supabase (`Email OTP Expiration`) i zdanie w mailu rozjechałoby się z prawdą
  przy pierwszej zmianie tej wartości. „Link jest jednorazowy" jest prawdziwe
  niezależnie od ustawień.
- Komunikaty celowo nie zwracają się do odbiorcy w formie zakładającej płeć
  (stąd „ktoś poprosił", a nie „poprosiłeś") wszędzie tam, gdzie dało się to
  zrobić bez kalectwa językowego.
