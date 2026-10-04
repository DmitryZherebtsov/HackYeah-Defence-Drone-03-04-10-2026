import bcrypt from 'bcrypt';
import { sequelize, Municipality, Organization, User, AuditLog, Drone, Mission, createInitialMissionData } from '../models';

export const seedDatabase = async () => {
  try {
    console.log('🔄 Rozpoczynanie wypełniania bazy danych danymi startowymi...');

    // 1. Reset i synchronizacja bazy danych SQLite
    await sequelize.sync({ force: true });
    console.log('✅ Tabele bazy danych zostały wyczyszczone i zsynchronizowane.');

    // 2. Tworzenie Gmin i Miast (Municipalities) w całej Polsce
    const munisData = [
      { name: 'Kłodzko' },
      { name: 'Wrocław' },
      { name: 'Lądek-Zdrój' },
      { name: 'Kraków' },
      { name: 'Nowy Sącz' },
      { name: 'Zakopane' },
      { name: 'Warszawa' },
      { name: 'Płock' },
      { name: 'Gdańsk' },
      { name: 'Słupsk' },
      { name: 'Szczecin' },
      { name: 'Poznań' },
      { name: 'Kalisz' },
      { name: 'Rzeszów' },
      { name: 'Przemyśl' },
      { name: 'Bielsko-Biała' },
      { name: 'Racibórz' },
      { name: 'Nysa' },
      { name: 'Głuchołazy' },
      { name: 'Lublin' },
      { name: 'Toruń' },
      { name: 'Olsztyn' },
    ];

    const munis: Record<string, Municipality> = {};
    for (const m of munisData) {
      munis[m.name] = await Municipality.create({ name: m.name });
    }
    console.log(`✅ Utworzono ${Object.keys(munis).length} miast i gmin w całej Polsce.`);

    // 3. Tworzenie Organizacji (Organizations)
    const orgsData = [
      { name: 'Urząd Miasta i Gminy Kłodzko', type: 'samorzad' as const, muni: 'Kłodzko' },
      { name: 'Ochotnicza Straż Pożarna Kłodzko', type: 'sluzby' as const, muni: 'Kłodzko' },
      { name: 'Fundacja Ratownictwa i Pomocy', type: 'ngo' as const, muni: 'Kłodzko' },
      { name: 'Wojewódzkie Centrum Zarządzania Kryzysowego Wrocław', type: 'samorzad' as const, muni: 'Wrocław' },
      { name: 'Dolnośląskie WOPR Wrocław', type: 'sluzby' as const, muni: 'Wrocław' },
      { name: 'OSP Lądek-Zdrój', type: 'sluzby' as const, muni: 'Lądek-Zdrój' },
      { name: 'Wydział Bezpieczeństwa UMK Kraków', type: 'samorzad' as const, muni: 'Kraków' },
      { name: 'Komenda Miejska PSP w Krakowie', type: 'sluzby' as const, muni: 'Kraków' },
      { name: 'Małopolska Grupa Ratownictwa Specjalnego', type: 'ngo' as const, muni: 'Nowy Sącz' },
      { name: 'Tatrzańskie Ochotnicze Pogotowie Ratunkowe (TOPR)', type: 'sluzby' as const, muni: 'Zakopane' },
      { name: 'Stołeczne Centrum Bezpieczeństwa Warszawa', type: 'samorzad' as const, muni: 'Warszawa' },
      { name: 'Komenda Wojewódzka PSP w Warszawie', type: 'sluzby' as const, muni: 'Warszawa' },
      { name: 'Polski Czerwony Krzyż - Zarząd Główny', type: 'ngo' as const, muni: 'Warszawa' },
      { name: 'Miejski Sztab Kryzysowy Płock', type: 'samorzad' as const, muni: 'Płock' },
      { name: 'Morski Oddział Ratownictwa Wodnego Gdańsk', type: 'sluzby' as const, muni: 'Gdańsk' },
      { name: 'Pomorska Fundacja Pomocy Humanitarnej', type: 'ngo' as const, muni: 'Gdańsk' },
      { name: 'Zachodniopomorska Grupa WOPR Szczecin', type: 'sluzby' as const, muni: 'Szczecin' },
      { name: 'Wielkopolskie Centrum Zarządzania Kryzysowego Poznań', type: 'samorzad' as const, muni: 'Poznań' },
      { name: 'Podkarpackie Stowarzyszenie Pomocy Poszkodowanym', type: 'ngo' as const, muni: 'Rzeszów' },
      { name: 'Komenda Powiatowa PSP w Przemyślu', type: 'sluzby' as const, muni: 'Przemyśl' },
      { name: 'Beskidzka Grupa Ratownicza Bielsko-Biała', type: 'ngo' as const, muni: 'Bielsko-Biała' },
      { name: 'Komenda Powiatowa PSP w Raciborzu', type: 'sluzby' as const, muni: 'Racibórz' },
      { name: 'Komenda Powiatowa PSP w Nysie', type: 'sluzby' as const, muni: 'Nysa' },
      { name: 'Urząd Miejski w Nysie', type: 'samorzad' as const, muni: 'Nysa' },
      { name: 'OSP Głuchołazy', type: 'sluzby' as const, muni: 'Głuchołazy' },
      { name: 'Lubelski Sztab Ratownictwa i Wolontariatu', type: 'ngo' as const, muni: 'Lublin' },
      { name: 'Kujawsko-Pomorski Związek OSP Toruń', type: 'sluzby' as const, muni: 'Toruń' },
      { name: 'Warmińsko-Mazurska Służba Ratownictwa Olsztyn', type: 'sluzby' as const, muni: 'Olsztyn' },
    ];

    const orgs: Record<string, Organization> = {};
    for (const o of orgsData) {
      orgs[o.name] = await Organization.create({
        name: o.name,
        type: o.type,
        municipalityId: munis[o.muni].id,
      });
    }
    console.log(`✅ Utworzono ${Object.keys(orgs).length} organizacji w całej Polsce.`);

    // 4. Tworzenie Użytkowników (Users)
    const saltRounds = 10;
    const adminPassword = await bcrypt.hash('admin123', saltRounds);
    const koordPassword = await bcrypt.hash('koord123', saltRounds);
    const userPassword = await bcrypt.hash('haslo123', saltRounds);

    const admin = await User.create({
      firstName: 'Piotr',
      lastName: 'Administrator',
      email: 'admin@koordynacja.local',
      password: adminPassword,
      phone: '+48 500 100 100',
      role: 'admin',
      organizationId: orgs['Fundacja Ratownictwa i Pomocy'].id,
      isVerified: true,
    });

    const koordKlodzko = await User.create({
      firstName: 'Marek',
      lastName: 'Koordynator-Kłodzko',
      email: 'koordynator.klodzko@samorzad.pl',
      password: koordPassword,
      phone: '+48 500 200 200',
      role: 'koordynator',
      organizationId: orgs['Urząd Miasta i Gminy Kłodzko'].id,
      isVerified: true,
    });

    const koordKrakow = await User.create({
      firstName: 'Andrzej',
      lastName: 'Koordynator-Kraków',
      email: 'koordynator.krakow@umk.pl',
      password: koordPassword,
      phone: '+48 501 333 444',
      role: 'koordynator',
      organizationId: orgs['Wydział Bezpieczeństwa UMK Kraków'].id,
      isVerified: true,
    });

    const koordWarszawa = await User.create({
      firstName: 'Michał',
      lastName: 'Koordynator-Warszawa',
      email: 'koordynator.warszawa@stolica.pl',
      password: koordPassword,
      phone: '+48 502 555 666',
      role: 'koordynator',
      organizationId: orgs['Stołeczne Centrum Bezpieczeństwa Warszawa'].id,
      isVerified: true,
    });

    const koordGdansk = await User.create({
      firstName: 'Krzysztof',
      lastName: 'Koordynator-Gdańsk',
      email: 'koordynator.gdansk@ratownictwo.pl',
      password: koordPassword,
      phone: '+48 503 777 888',
      role: 'koordynator',
      organizationId: orgs['Morski Oddział Ratownictwa Wodnego Gdańsk'].id,
      isVerified: true,
    });

    const koordNysa = await User.create({
      firstName: 'Tomasz',
      lastName: 'Koordynator-Nysa',
      email: 'koordynator.nysa@psp.pl',
      password: koordPassword,
      phone: '+48 500 300 300',
      role: 'koordynator',
      organizationId: orgs['Komenda Powiatowa PSP w Nysie'].id,
      isVerified: true,
    });

    const strazakKlodzko = await User.create({
      firstName: 'Jan',
      lastName: 'Strażak',
      email: 'jan.strazak@osp.pl',
      password: userPassword,
      phone: '+48 500 400 400',
      role: 'czlonek',
      organizationId: orgs['Ochotnicza Straż Pożarna Kłodzko'].id,
      isVerified: true,
    });

    const ratownikWopr = await User.create({
      firstName: 'Robert',
      lastName: 'Wodny',
      email: 'robert.wopr@dolnoslaskie.pl',
      password: userPassword,
      phone: '+48 600 700 800',
      role: 'czlonek',
      organizationId: orgs['Dolnośląskie WOPR Wrocław'].id,
      isVerified: true,
    });

    const pspWarszawa = await User.create({
      firstName: 'Adam',
      lastName: 'Oficer-PSP',
      email: 'adam.psp@mazowieckie.pl',
      password: userPassword,
      phone: '+48 601 222 333',
      role: 'czlonek',
      organizationId: orgs['Komenda Wojewódzka PSP w Warszawie'].id,
      isVerified: true,
    });

    const pckWarszawa = await User.create({
      firstName: 'Ewa',
      lastName: 'Wolontariusz-PCK',
      email: 'ewa.pck@pck.org.pl',
      password: userPassword,
      phone: '+48 602 444 555',
      role: 'czlonek',
      organizationId: orgs['Polski Czerwony Krzyż - Zarząd Główny'].id,
      isVerified: true,
    });

    // Użytkownicy oczekujący na weryfikację
    await User.create({
      firstName: 'Anna',
      lastName: 'Nowak',
      email: 'anna.nowak@ngo.pl',
      password: userPassword,
      phone: '+48 500 500 500',
      role: 'czlonek',
      organizationId: orgs['Fundacja Ratownictwa i Pomocy'].id,
      isVerified: false,
    });

    await User.create({
      firstName: 'Paweł',
      lastName: 'Kowalski',
      email: 'pawel.kowalski@samorzad.pl',
      password: userPassword,
      phone: '+48 500 600 600',
      role: 'czlonek',
      organizationId: orgs['Urząd Miejski w Nysie'].id,
      isVerified: false,
    });

    await User.create({
      firstName: 'Karol',
      lastName: 'Ochotnik',
      email: 'karol.ochotnik@osp.pl',
      password: userPassword,
      phone: '+48 500 777 888',
      role: 'czlonek',
      organizationId: orgs['OSP Lądek-Zdrój'].id,
      isVerified: false,
    });

    console.log('✅ Utworzono konta użytkowników i koordynatorów.');

    // 5. Dziennik zdarzeń (Audit Logs)
    const now = Date.now();
    const oneHour = 3600 * 1000;

    await AuditLog.create({
      action: 'user_verified',
      entityType: 'user',
      entityId: strazakKlodzko.id,
      userId: admin.id,
      userName: `${admin.firstName} ${admin.lastName}`,
      userEmail: admin.email,
      details: `Weryfikacja i aktywacja konta strażaka: ${strazakKlodzko.firstName} ${strazakKlodzko.lastName} (OSP Kłodzko)`,
      previousState: { isVerified: false },
      newState: { isVerified: true },
      createdAt: new Date(now - 12 * oneHour),
    });

    console.log('✅ Zainicjalizowano Dziennik Zdarzeń (Audit Logs).');

    // 6. Flota dronów (krok 1 planu): zwiadowcze z FLIR i ciężkie dostawcze
    const dronesData = [
      {
        name: 'Zwiad-01', model: 'DJI Matrice 30T', category: 'zwiadowczy', org: 'Ochotnicza Straż Pożarna Kłodzko',
        maxWindSpeed: 15, ipRating: 'IP55', minTemp: -20, maxTemp: 50, hasThermal: true, hasSpeaker: true, cameraFovDeg: 61,
        cruiseSpeed: 15, maxPayloadKg: 0, radioRangeKm: 15, weightKg: 3.8,
        batteryCurve: [{ temp: -20, minutes: 22 }, { temp: -5, minutes: 30 }, { temp: 10, minutes: 38 }, { temp: 20, minutes: 41 }, { temp: 35, minutes: 37 }],
      },
      {
        name: 'Zwiad-02', model: 'DJI Matrice 30T', category: 'zwiadowczy', org: 'Ochotnicza Straż Pożarna Kłodzko',
        maxWindSpeed: 15, ipRating: 'IP55', minTemp: -20, maxTemp: 50, hasThermal: true, hasSpeaker: true, cameraFovDeg: 61,
        cruiseSpeed: 15, maxPayloadKg: 0, radioRangeKm: 15, weightKg: 3.8,
        batteryCurve: [{ temp: -20, minutes: 22 }, { temp: -5, minutes: 30 }, { temp: 10, minutes: 38 }, { temp: 20, minutes: 41 }, { temp: 35, minutes: 37 }],
      },
      {
        name: 'Zwiad-03', model: 'DJI Mavic 3 Thermal', category: 'zwiadowczy', org: 'Fundacja Ratownictwa i Pomocy',
        maxWindSpeed: 12, ipRating: 'IP20', minTemp: -10, maxTemp: 40, hasThermal: true, hasSpeaker: true, cameraFovDeg: 61,
        cruiseSpeed: 14, maxPayloadKg: 0, radioRangeKm: 12, weightKg: 0.92,
        batteryCurve: [{ temp: -10, minutes: 22 }, { temp: -5, minutes: 25 }, { temp: 5, minutes: 35 }, { temp: 20, minutes: 45 }, { temp: 35, minutes: 40 }],
      },
      {
        name: 'Zwiad-04', model: 'Autel EVO II Dual 640T', category: 'zwiadowczy', org: 'OSP Lądek-Zdrój',
        maxWindSpeed: 12, ipRating: 'IP43', minTemp: -10, maxTemp: 40, hasThermal: true, hasSpeaker: false, cameraFovDeg: 50,
        cruiseSpeed: 14, maxPayloadKg: 0, radioRangeKm: 9, weightKg: 1.19,
        batteryCurve: [{ temp: -10, minutes: 20 }, { temp: 0, minutes: 27 }, { temp: 20, minutes: 38 }, { temp: 35, minutes: 33 }],
      },
      {
        name: 'Zwiad-05', model: 'Parrot Anafi USA', category: 'zwiadowczy', org: 'Dolnośląskie WOPR Wrocław',
        maxWindSpeed: 14.7, ipRating: 'IP53', minTemp: -36, maxTemp: 50, hasThermal: true, hasSpeaker: false, cameraFovDeg: 57,
        cruiseSpeed: 14.7, maxPayloadKg: 0, radioRangeKm: 5, weightKg: 0.5,
        batteryCurve: [{ temp: -30, minutes: 18 }, { temp: -10, minutes: 24 }, { temp: 0, minutes: 27 }, { temp: 20, minutes: 32 }],
      },
      {
        name: 'Zwiad-06', model: 'DJI Mini 4 Pro (RGB)', category: 'zwiadowczy', org: 'Fundacja Ratownictwa i Pomocy',
        maxWindSpeed: 10.7, ipRating: 'IP00', minTemp: -10, maxTemp: 40, hasThermal: false, hasSpeaker: false, cameraFovDeg: 82,
        cruiseSpeed: 12, maxPayloadKg: 0, radioRangeKm: 10, weightKg: 0.25,
        batteryCurve: [{ temp: -10, minutes: 18 }, { temp: 0, minutes: 24 }, { temp: 20, minutes: 34 }, { temp: 35, minutes: 30 }],
        notes: 'Tylko kamera dzienna – nie nadaje się do lotów nocnych.',
      },
      {
        name: 'Transport-01', model: 'DJI FlyCart 30', category: 'dostawczy', org: 'Ochotnicza Straż Pożarna Kłodzko',
        maxWindSpeed: 12, ipRating: 'IP55', minTemp: -20, maxTemp: 45, hasThermal: false, hasSpeaker: true, cameraFovDeg: 80,
        cruiseSpeed: 20, maxPayloadKg: 30, radioRangeKm: 20, weightKg: 42.5,
        batteryCurve: [{ temp: -20, minutes: 12 }, { temp: 0, minutes: 15 }, { temp: 20, minutes: 18 }, { temp: 40, minutes: 16 }],
        notes: 'Zrzutnik z wyciągarką – kamizelki ratunkowe podczepiane przez Logistyka Zrzutu.',
      },
      {
        name: 'Transport-02', model: 'DJI Matrice 350 RTK + zrzutnik', category: 'dostawczy', org: 'Dolnośląskie WOPR Wrocław',
        maxWindSpeed: 12, ipRating: 'IP55', minTemp: -20, maxTemp: 50, hasThermal: false, hasSpeaker: true, cameraFovDeg: 80,
        cruiseSpeed: 17, maxPayloadKg: 2.7, radioRangeKm: 20, weightKg: 6.5,
        batteryCurve: [{ temp: -20, minutes: 24 }, { temp: 0, minutes: 32 }, { temp: 20, minutes: 40 }, { temp: 40, minutes: 36 }],
      },
      {
        name: 'Transport-03', model: 'Heksakopter HL-10 (udźwig 10 kg)', category: 'dostawczy', org: 'Komenda Powiatowa PSP w Nysie',
        maxWindSpeed: 10, ipRating: 'IP43', minTemp: -5, maxTemp: 40, hasThermal: false, hasSpeaker: false, cameraFovDeg: 80,
        cruiseSpeed: 15, maxPayloadKg: 10, radioRangeKm: 10, weightKg: 18,
        batteryCurve: [{ temp: -5, minutes: 14 }, { temp: 10, minutes: 20 }, { temp: 25, minutes: 24 }],
      },
      {
        name: 'Transport-04', model: 'DJI FlyCart 30', category: 'dostawczy', org: 'Komenda Wojewódzka PSP w Warszawie', status: 'serwis',
        maxWindSpeed: 12, ipRating: 'IP55', minTemp: -20, maxTemp: 45, hasThermal: false, hasSpeaker: true, cameraFovDeg: 80,
        cruiseSpeed: 20, maxPayloadKg: 30, radioRangeKm: 20, weightKg: 42.5,
        batteryCurve: [{ temp: -20, minutes: 12 }, { temp: 0, minutes: 15 }, { temp: 20, minutes: 18 }, { temp: 40, minutes: 16 }],
        notes: 'Przegląd okresowy silników.',
      },
    ];
    for (const d of dronesData) {
      const { org, ...fields } = d;
      await Drone.create({ ...(fields as any), organizationId: orgs[org]?.id ?? null });
    }
    console.log(`✅ Utworzono flotę ${dronesData.length} dronów (zwiadowcze + dostawcze).`);

    // 7. Przykładowa operacja w fazie planowania – dolina Nysy Kłodzkiej
    const missionData = createInitialMissionData({ lat: 50.4297, lng: 16.6406, name: 'Strefa Zero – parking przy obwodnicy' }, 5);
    missionData.area = [
      [50.4452, 16.6412],
      [50.4468, 16.6605],
      [50.4389, 16.6702],
      [50.4318, 16.6631],
      [50.4335, 16.6455],
    ];
    missionData.assignments.dowodca.push({ userId: koordKlodzko.id, name: `${koordKlodzko.firstName} ${koordKlodzko.lastName}` });
    missionData.assignments.ratownik.push({ userId: strazakKlodzko.id, name: `${strazakKlodzko.firstName} ${strazakKlodzko.lastName}`, organizationName: 'Ochotnicza Straż Pożarna Kłodzko' });
    missionData.events.push({
      id: 'evt-seed-1',
      at: new Date().toISOString(),
      simSeconds: 0,
      level: 'info',
      category: 'system',
      message: 'Utworzono operację poszukiwawczą po przerwaniu wału na Nysie Kłodzkiej.',
    });
    await Mission.create({
      name: 'Powódź – dolina Nysy Kłodzkiej',
      description: 'Poszukiwanie osób odciętych przez wodę na zalanych osiedlach w Kłodzku.',
      createdById: koordKlodzko.id,
      data: missionData,
    });
    console.log('✅ Utworzono przykładową operację dronową w fazie planowania.');

    console.log('\n======================================================');
    console.log('🎉 Baza danych SQLite została pomyślnie zasilona danymi z całej Polski!');
    console.log('======================================================');
    console.log('\n👤 Dane kont do logowania:');
    console.log('  1. Administrator:');
    console.log('     Email: admin@koordynacja.local');
    console.log('     Hasło: admin123 (rola: admin)');
    console.log('  2. Koordynator (Kłodzko):');
    console.log('     Email: koordynator.klodzko@samorzad.pl');
    console.log('     Hasło: koord123 (rola: koordynator)');
    console.log('  3. Koordynator (Kraków):');
    console.log('     Email: koordynator.krakow@umk.pl');
    console.log('     Hasło: koord123 (rola: koordynator)');
    console.log('  4. Koordynator (Warszawa):');
    console.log('     Email: koordynator.warszawa@stolica.pl');
    console.log('     Hasło: koord123 (rola: koordynator)');
    console.log('  5. Członek (OSP):');
    console.log('     Email: jan.strazak@osp.pl');
    console.log('     Hasło: haslo123 (rola: czlonek)');
    console.log('======================================================\n');
  } catch (error) {
    console.error('❌ Błąd podczas zasilania bazy danych:', error);
    process.exit(1);
  }
};

// Uruchomienie skryptu jeśli wywołany bezpośrednio
if (require.main === module) {
  seedDatabase().then(() => {
    process.exit(0);
  });
}
