# System Koordynacji Kryzysowej – operacje dronowe

<img src="docs/mapa_drony.gif" width="760" alt="Mapa operacji: drony przeszukują swoje sektory rozchodzące się wachlarzem od Strefy Zero">

*Mapa na żywo: każdy dron przeszukuje własny sektor nad Wisłą w Krakowie.*

## Szybki start dla jury

Aplikacja działa online, bez instalacji: **[drone-app-tqbn.onrender.com](https://drone-app-pdzf.onrender.com)**

Konto testowe: `admin@koordynacja.local` / `admin123`

> Uwaga: darmowy hosting usypia aplikację po okresie bezczynności – pierwsze wejście może potrwać do ok. minuty, zanim strona się załaduje.

<img src="docs/kamera_skanowanie.gif" width="760" alt="Kamera drona: skanowanie miasta w termowizji i zwykłą kamerą na prawdziwych zdjęciach satelitarnych">

*Obraz z kamery drona: skanowanie miasta w termowizji i zwykłą kamerą – pod dronem prawdziwe zdjęcia satelitarne.*

<img src="docs/kamera_znalezione_osoby.gif" width="760" alt="Kamera drona w termowizji: wykrycie ludzi, zbliżenie i analiza sytuacji">

*Dron znalazł ludzi (termowizja): zbliżenie do sygnatury cieplnej, ocena pozycji – trzy osoby na dachu samochodu, pomiar zapasu do zalania (wzrost wzorcowy 1,70 m), prognoza wody i nurtu, a na pytanie z głośnika o pomoc medyczną ludzie machają obiema rękami.*

System pomaga zaplanować i poprowadzić akcję poszukiwawczo-ratowniczą z użyciem floty dronów, np. podczas powodzi. Koordynator wskazuje na mapie miejsce startu (Strefę Zero) i obszar do przeszukania. System pobiera aktualną pogodę, dobiera flotę, dzieli teren na sektory i układa trasy lotu. W trakcie akcji koordynator widzi obraz z kamery wybranego drona: drony same wykrywają ludzi, oceniają ich sytuację, rozmawiają z nimi przez głośnik i wzywają drony transportowe z wyposażeniem. Po akcji powstaje raport (PDF i Excel).

Fizyczne drony, kamery i rozpoznawanie obrazu są w tej wersji zastąpione symulacją. Pogoda, ukształtowanie terenu, rzeki i zabudowa (OpenStreetMap) oraz zdjęcia satelitarne terenu pochodzą z prawdziwych źródeł.

## Funkcjonalności

### Flota dronów
- Parametry każdej maszyny: granice pogodowe (wiatr, klasa IP, temperatura), krzywa spadku baterii, prędkość, zasięg radia, udźwig, termowizja, głośnik.
- Ocena floty w bieżącej pogodzie dla dowolnego punktu: współczynnik powodzenia lotu (Wzór B), pokrycie terenu (Wzór A), czas lotu z rezerwą na powrót.

### Planowanie operacji
- **Pogoda na żywo** (Open-Meteo) i automatyczny dobór floty – drony, które nie poradzą sobie z warunkami, są blokowane.
- **Strefa poszukiwań** rysowana na mapie, **strefy zakazu lotów (No-Fly)** omijane przez trasy.
- **Priorytety ręczne** – strefy wysokiego i średniego priorytetu zaznaczane przez koordynatora.
- **Priorytety automatyczne** – mapa prawdopodobieństwa obecności ludzi z rzek i zabudowy z OpenStreetMap. Pobieranie jest odporne na przeciążenie serwerów Overpass: osobne zapytania, ponawianie, serwer zapasowy, a przy braku danych o budynkach mapa powstaje z samych rzek.
- **Podział na sektory** w kształcie klinów od Strefy Zero – każdy dron ma własny sektor, pułap (echelon) i trasę „żmija”, a wielkości sektorów są dobrane tak, by drony kończyły mniej więcej jednocześnie. Najpierw sprawdzane są miejsca o największym prawdopodobieństwie.
- Dwa tryby przeszukania: jeden dokładny przelot albo szybkie rozpoznanie termowizją + dokładne sprawdzenie sygnałów.
- Przydział ról w zespole: dowódca, weryfikator, technik (baterie), logistyk (ładunki), ratownicy.

### Strefa Zero
Lista kontrolna przed startem (załadunek, anteny RTK, wzmacniacze MESH), automatyczna kalibracja i połączenie floty, start operacji.

### Operacja w toku – transmisja z kamery drona
- Obraz z kamery wybranego drona **na prawie cały ekran**, a w prawym dolnym rogu okno z przełącznikiem **Mapa / Zadania** (można je powiększyć lub schować).
- Przełączanie kamery: przyciski dronów, kliknięcie drona na mapie lub w tabeli. Opcja **„Pokazuj drona przy osobie”** automatycznie przełącza obraz na drona, który właśnie znalazł człowieka.
- Podczas lotu i skanowania pod dronem wyświetlane są **prawdziwe zdjęcia satelitarne** miejsca, w którym się znajduje (Esri World Imagery), obrócone zgodnie z kursem. Tryb **termowizja / zwykła kamera**.
- Na obrazie widać wszystko, co dron robi i ustala: plakietka „DRON WYKONUJE”, wskaźniki (bateria, wysokość, prędkość, kurs, GPS), lista kroków procedury, panel „ANALIZA AI” i dziennik zdarzeń.
- **Pauza** całej symulacji (przycisk lub spacja) i **tempo** ×1 / ×5 / ×20 – przy ×1 dron leci z rzeczywistą prędkością.

### Procedura przy odnalezionej osobie
Po wykryciu dron zawisa i krok po kroku (każdy krok podpisany na obrazie):
1. **Zbliżanie** – obniżenie pułapu i potwierdzenie, że to człowiek.
2. **Pozycja** – w wodzie, na dachu czy na podwyższeniu (samochód, altana, drzewo, mur). Osoba w wodzie dostaje od razu kategorię krytyczną.
3. **Pomiar** – przyjmując średni wzrost 1,70 m, z proporcji pikseli dron szacuje, ile centymetrów zostało do zalania obiektu, na którym stoi osoba.
4. **Prognoza i nurt** – porównanie zapasu z prognozowanym przyborem wody do kulminacji (czas do zalania) oraz ocena, czy nurt porwie obiekt (intensywność przepływu głębokość × prędkość względem wytrzymałości obiektu).
5. **Kategoria ewakuacji** – przeliczenie Poziomu Krytyczności (PK).
6. **Zdjęcie + pinezka GPS** wysyłane do sztabu – od tej chwili osoba jest na mapie i w kolejce Weryfikatora.
7. **Wywiad przez głośnik** (jeśli dron ma głośnik): „Potrzebujesz pomocy medycznej? Podnieś obie ręce” – jeśli tak, kategoria maksymalna i automatyczny zrzut pakietu medycznego. Jeśli nie: „Potrzebujesz wody lub jedzenia? Podnieś jedną rękę” – żądanie dostawy dronem transportowym.
8. **Decyzja** – gdy sytuacja jest niebezpieczna (osoba w wodzie, ryzyko porwania, szybkie zalanie, ryzyko zawalenia), dron transportowy automatycznie wiezie kamizelki ratunkowe, a dron zwiadowczy zawisa nad osobą do czasu zrzutu.

### Zadania zespołu
- **Drony** – co robi każdy dron, bateria, postęp sektora; wskazanie priorytetu na mapie, zakończenie operacji, ćwiczenie nagłej zmiany pogody.
- **Weryfikacja** – zdjęcia z dronów z wynikami analizy, potwierdzanie zgłoszeń, autoryzacja dostaw.
- **Ratownicy** – pinezki GPS z priorytetem ewakuacji (P1–P3) i statusem akcji.
- **Ładunki** i **Baterie** – załadunek zrzutów, wymiana akumulatorów.
- **Dziennik** – oś czasu wszystkich zdarzeń.

### Sytuacje awaryjne
Utrata łączności (Offline Search, Smart RTH i przejęcie sektora przez sąsiadów), nagła zmiana pogody (automatyczny powrót i rekomendacja uziemienia floty), powrót na wymianę baterii z zachowaniem rezerwy.

### Raport
Po akcji: mapa tras, odnalezione osoby ze współrzędnymi GPS i priorytetem, zużyte zasoby, skuteczność poszukiwań i oś czasu – eksport do PDF i Excel.

### Interfejs
Jasny i ciemny motyw, zwijany pasek boczny (więcej miejsca na obraz z drona), układ dostosowany do telefonu.

## Zrzuty ekranu

Wszystkie zrzuty pochodzą z symulowanej akcji powodziowej w Krakowie (strefa wzdłuż Wisły, No-Fly nad Wawelem) w ciemnym motywie.

### Flota i pogoda

![Flota dronów](screenshots/slide05_baza_dronow_krzywe_baterii.jpg)
*Flota: ocena w bieżącej pogodzie dla Krakowa, granice pogodowe, krzywa spadku baterii i wyposażenie każdego drona.*

![Komunikat pogodowy – burza](screenshots/slide05_pogoda_burza.jpg)
*Pogoda przed startem: przy burzy (wiatr 14 m/s, porywy 22 m/s, opad 14 mm/h) system blokuje drony, które nie sprostają warunkom.*

### Planowanie i Strefa Zero

![Planowanie operacji](screenshots/slide06_ekran_planowania.jpg)
*Planowanie: strefa poszukiwań podzielona wachlarzowo na sektory od Strefy Zero, mapa prawdopodobieństwa z rzek i zabudowy (OpenStreetMap), ręczna strefa priorytetowa i strefa No-Fly nad Wawelem.*

![Sektory i wzorce lotu](screenshots/slide06_tabela_sektorow.jpg)
*Sektory: powierzchnia, pułap, kierunek linii, liczba zawrotów i wylotów oraz przewidywany czas powrotu każdego drona.*

![Procedura przedstartowa w Strefie Zero](screenshots/slide09_strefa_zero_procedura_GLOWNY.jpg)
*Strefa Zero: lista kontrolna przed startem (RTK, MESH, kalibracja) i gotowość każdego drona.*

### Operacja w toku – kamera drona

![Ekran operacji – kamera drona](screenshots/slide07_ekran_c2_w_locie.jpg)
*Obraz z kamery wybranego drona na prawie cały ekran: prawdziwe zdjęcia satelitarne terenu pod dronem, wskaźniki lotu, bieżąca czynność i mapa w prawym dolnym rogu.*

![Kamera – termowizja](screenshots/kamera_skanowanie_termowizja.jpg)
*Skanowanie terenu w trybie termowizji.*

![Mapa w rogu ekranu](screenshots/kamera_mapa_w_rogu.jpg)
*Powiększone okno mapy: sektory, trasy i drony na żywo – kliknięcie drona przełącza kamerę.*

![Pauza](screenshots/pauza.jpg)
*Pauza: cała symulacja zatrzymana, obraz zamrożony – można spokojnie przejrzeć sytuację.*

### Procedura przy odnalezionej osobie

![Zbliżanie do celu](screenshots/osoba_zblizanie.jpg)
*Wykrycie: dron obniża pułap i potwierdza, że sygnatura cieplna to człowiek.*

![Osoba w wodzie – analiza](screenshots/osoba_w_wodzie_analiza.jpg)
*Osoba w wodzie: kategoria krytyczna, prognoza przyboru wody do kulminacji, nurt i ryzyko porwania – wyniki w panelu „ANALIZA AI”.*

![Pomiar zapasu do zalania](screenshots/osoba_pomiar_zapasu.jpg)
*Osoby na altanie: wzrost wzorcowy 1,70 m = N px → ile centymetrów zostało do zalania, czas do zalania wg prognozy, kategoria średnia.*

![Wywiad przez głośnik](screenshots/osoba_wywiad_glosnik.jpg)
*Głośnik: „Jeśli potrzebujesz pomocy medycznej – podnieś obie ręce”.*

![Pomoc medyczna](screenshots/osoba_pomoc_medyczna.jpg)
*Obie ręce w górze: kategoria maksymalna, automatyczny zrzut pakietu medycznego i kamizelek – dron czeka nad osobą na drona transportowego.*

![Woda i jedzenie](screenshots/osoba_woda_i_jedzenie.jpg)
*Jedna ręka w górze: żądanie dostawy wody i żywności dronem transportowym (do autoryzacji Weryfikatora).*

### Zadania zespołu

![Weryfikacja zgłoszeń](screenshots/slide07_panel_weryfikator_FLIR_gest.jpg)
*Weryfikacja: żądanie dostawy do autoryzacji oraz zdjęcie z drona z naniesionymi wynikami analizy.*

![Ratownicy](screenshots/zadania_ratownicy.jpg)
*Ratownicy: pinezki GPS z priorytetem ewakuacji (P1–P3), potrzebą pomocy medycznej i statusem akcji.*

![Rekomendacja uziemienia floty](screenshots/slide08_zmiana_pogody_rekomendacja_GLOWNY.jpg)
*Nagła zmiana pogody: drony automatycznie wracają do Strefy Zero, a dowódca zatwierdza rekomendację uziemienia floty.*

### Raport

![Raport – podsumowanie](screenshots/raport_podsumowanie.jpg)
*Raport: podsumowanie akcji, skuteczność poszukiwań i mapa tras.*

![Raport – współrzędne odnalezionych osób](screenshots/slide08_raport_pineski_gps.jpg)
*Raport: zwalidowane współrzędne GPS odnalezionych osób z priorytetem ewakuacji, zużyte zasoby i sektory.*

## Uruchomienie

```bash
cd backend && npm install && npm run seed && npm run dev    # API: http://localhost:5000 (Swagger: /api-docs)
cd frontend && npm install && npm run dev                    # aplikacja: http://localhost:3000
```

Przed pierwszym uruchomieniem skopiuj `backend/.env.example` do `backend/.env`.

Konto testowe: `admin@koordynacja.local` / `admin123` (koordynatorzy: `koordynator.klodzko@samorzad.pl` / `koord123`, `koordynator.krakow@umk.pl` / `koord123`).

Testy backendu: `cd backend && npm test`.

## Źródła danych

- Pogoda i wysokość terenu: [Open-Meteo](https://open-meteo.com/)
- Mapa, rzeki i zabudowa: [OpenStreetMap](https://www.openstreetmap.org/copyright) (Overpass API)
- Zdjęcia satelitarne w obrazie z drona: Esri World Imagery (Esri, Maxar, Earthstar Geographics)
