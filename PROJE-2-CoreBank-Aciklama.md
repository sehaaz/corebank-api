# CoreBank API — Proje Açıklaması

Bu dosya mimari değil, **anlama ve anlatma** dosyası. Projeyi neden böyle kurduğunu, nasıl çalıştığını ve mülakatta nasıl savunacağını içerir. README'nin de ham maddesi.

---

## 1. Tek cümlede

Hesap, para transferi ve ekstre işlemlerini yöneten; modül sınırları mikroservisteki kadar net ama tek process'te çalışan, transfer mantığı Oracle PL/SQL paketi içinde atomik olarak yürüyen backend servisi.

## 2. Bu proje aslında neyi kanıtlıyor

İki ayrı şeyi, ikisi de işveren tarafında az bulunur:

**Birincisi: SQL ve transaction gerçekten biliyorsun.** Junior seviyede yaygın durum, ORM'in arkasındaki veritabanını hiç görmemiş olmaktır. Bu projede ORM yok. Kilitleme, transaction sınırı, deadlock önleme, stored procedure — hepsi elle yazılmış ve testle kanıtlanmış. Türkiye'de Oracle ilanları büyük ölçüde banka ve kurumsal kaynaklı; bu proje doğrudan o ilanların diline konuşuyor.

**İkincisi: mimariyi modaya göre değil ihtiyaca göre seçiyorsun.** EventTix projesinde mikroservis savundun, burada monolith savunuyorsun — ve ikisinin de gerekçesi aynı: domain ne gerektiriyorsa o. Bu ikili, tek başına her iki projeden de güçlü sinyal verir.

## 3. Modular monolith ne demek, neden bu

**Klasik monolith:** her şey tek process'te ve dosyalar birbirine serbestçe erişir. Zamanla "büyük çamur topu"na dönüşür — bir yeri değiştirince beklenmedik bir yer bozulur.

**Mikroservis:** her parça ayrı process, ayrı veritabanı, ayrı deployment. Sınırlar ağ tarafından zorunlu kılınır. Karşılığında dağıtık sistem problemlerini (saga, telafi, idempotency) üstlenirsin.

**Modular monolith:** tek process, tek deployment, tek veritabanı — ama sınırlar mikroservisteki kadar net ve **disiplinle** korunur. Her modülün kendi tabloları vardır, dışarıya yalnızca kendi `index.js`'i üzerinden hizmet verir.

Bu proje için doğru seçim olmasının sebebi tek cümlede: **para transferi tek bir ACID transaction'a sığar ve sığmalıdır.** Mikroservise bölersen "hesaptan düş" ve "hesaba ekle" ayrı servislere düşer; saga ve telafi yazmak zorunda kalırsın. Para işleminde bu net bir gerilemedir — çözülmüş bir problemi (ACID) yeniden çözmeye çalışmaktır.

Modüler kalmasının kazancı da şu: yarın `transaction` modülü gerçekten ayrı bir servise çıkmak zorunda kalırsa, sınırlar zaten çizili olduğu için taşınacak şey bellidir.

## 4. Sistem nasıl çalışıyor

### Beş modül

| Modül | Sorumluluk | Sahip olduğu tablo |
|---|---|---|
| `identity` | Müşteri, kayıt/giriş, JWT | `CUSTOMERS` |
| `account` | Hesap, IBAN, bakiye, durum, sahiplik | `ACCOUNTS` |
| `transaction` | Yatırma, çekme, transfer, ekstre | `TRANSACTIONS` |
| `fx` | Kur tablosu ve dönüşüm | `EXCHANGE_RATES` |
| `audit` | Değişiklik kaydı | `AUDIT_LOG` |

### Sınırları ayakta tutan beş kural

1. **Tablo sahipliği tekildir.** `transaction` modülü `ACCOUNTS` tablosuna SQL yazamaz.
2. **Erişim sadece public API'den.** `require('../account')` serbest, `require('../account/account.repository')` yasak.
3. **Bağımlılık yönü tek yönlü:** `transaction → account → identity`, ayrıca `transaction → fx`, `transaction → audit`. Ters yön yok, döngü yok.
4. **Transaction sınırı çağıran modüldedir.** `transaction` modülü `withTransaction`'ı açar, aldığı `conn` nesnesini `account`'un fonksiyonlarına parametre geçer. Repository asla kendi başına commit etmez.
5. **`shared/` hiçbir modüle bağımlı olamaz.** Bağımlılık yalnızca modülden shared'a doğrudur.

Bu kurallar yazıyla kalmıyor: `eslint-plugin-import`'un `no-restricted-paths` kuralı ihlali `npm run lint` ile yakalıyor. Mimari kararın otomatik denetleniyor olması küçük ama mülakatta çok iyi duran bir detay.

### Para yatırma nasıl çalışıyor (sınır kuralı iş başında)

```
transaction modülü:
  withTransaction(async (conn) => {
    await account.assertOwnership(conn, iban, customerId)   // account modülünün API'si
    await account.assertActive(conn, iban)                  // account modülünün API'si
    const yeniBakiye = await account.adjustBalance(conn, iban, +tutar)
    await txRepo.insert(conn, { ..., balance_after: yeniBakiye })   // kendi tablosu
  })
```

`transaction` modülü `ACCOUNTS` tablosunun adını bile bilmiyor. Hepsi tek `conn` üzerinde olduğu için de tek transaction — bir adım patlarsa hepsi geri alınıyor.

### Transfer neden PL/SQL içinde

Transfer iki hesaba ve iki hareket kaydına dokunuyor, üstelik kilit tutuyor. Bunu JavaScript tarafında yapsaydın her adım için ağ gidiş-dönüşü olurdu ve kilitler o süre boyunca açık kalırdı. `pkg_transfer.do_transfer` tek çağrıda hepsini veritabanının içinde yapıyor:

```
1. İki hesabı IBAN sırasına göre SELECT ... FOR UPDATE ile kilitle
2. Hesaplar aktif mi, aynı hesap değil mi
3. Bakiye yeterli mi          → değilse ORA-20001 INSUFFICIENT_FUNDS
4. Günlük limit aşılıyor mu   → aşılıyorsa ORA-20002 DAILY_LIMIT_EXCEEDED
5. Para birimi farklıysa kuru uygula
6. reference_no üret (iki hareket kaydı bunu paylaşır)
7. Gönderenden düş  + TRANSFER_OUT kaydı
8. Alıcıya ekle     + TRANSFER_IN  kaydı
9. COMMIT — ya hepsi, ya hiçbiri
```

## 5. Anlaman gereken dört kavram

### ACID transaction
Ya hepsi olur ya hiçbiri (atomicity). Transfer sırasında elektrik kesilse bile "paranın gittiği ama gelmediği" bir ara durum kalmaz. Veritabanı bunu redo/undo log'ları ile garanti eder.

### `SELECT ... FOR UPDATE` (pesimistik kilit)
Satırı okurken aynı zamanda kilitler; transaction bitene kadar başka kimse o satırı değiştiremez. Bu olmadan iki eşzamanlı çekim işlemi aynı bakiyeyi okur, ikisi de "yeterli" der ve bakiye eksiye düşer. Klasik *lost update* problemi.

### Deadlock ve sabit sıra ile önlenmesi
A→B transferi A'yı kilitleyip B'yi beklerken, aynı anda B→A transferi B'yi kilitleyip A'yı beklerse ikisi de sonsuza kadar bekler. Oracle bunu algılayıp birini `ORA-00060` ile öldürür — ama kullanıcı hata almış olur.

Çözüm basit ve zarif: **hangi yönde transfer olursa olsun hesapları hep aynı sırada kilitle** (IBAN'ın alfabetik sırası). O zaman iki işlem de önce aynı satırı istemek zorunda kalır, biri bekler, diğeri biter. Döngüsel bekleme oluşmaz. `deadlock.integration.test.js` bunu kanıtlıyor.

### Bind değişkeni
`WHERE iban = :iban` şeklinde parametre göndermek. İki faydası var: SQL injection'ı kökten engeller ve Oracle sorgu planını yeniden kullanır (hard parse maliyeti düşer). Projede string birleştirmeyle yazılmış tek bir SQL yok.

## 6. Bilinçli olarak yapmadıkların (ve sebepleri)

| Yapmadığın | Sebep |
|---|---|
| ORM (Sequelize / TypeORM) | Projenin amacı SQL ve transaction kontrolünü göstermek. ORM bunları gizler, `FOR UPDATE` ve PL/SQL çağrısı ORM'de zaten kaçamak yoldan yazılır. |
| Mikroservis | Transfer tek ACID transaction'a sığıyor. Bölmek saga + telafi gerektirirdi; para işleminde bu gerileme. |
| Optimistik kilitleme (version sütunu) | Çakışma olasılığı yüksek ve çakışmanın maliyeti yüksek (kullanıcıya "tekrar deneyin" demek). Pesimistik kilit doğru seçim. |
| Frontend | Proje backend ağırlıklı olsun istedim. Yüzey Swagger + Postman collection. |
| EFT / SWIFT / gerçek KYC | Domain'e teknik bir şey katmıyor, sadece kapsam şişirir. |
| Mesaj kuyruğu | Tek process, senkron akış — kuyruk eklemek yapay olurdu. Kuyruk kullanımını EventTix projesinde gösteriyorum. |

## 7. Mülakat soruları ve cevapları

**S: Neden mikroservis değil?**
Para transferi tek bir ACID transaction'a sığıyor. Bölseydim "hesaptan düş" ve "hesaba ekle" ayrı servislere düşerdi ve saga + telafi yazmak zorunda kalırdım. Para işleminde nihai tutarlılık kabul edilebilir değil. Bunun yerine modular monolith seçtim: tek transaction ama modül sınırları mikroservisteki kadar net. Aynı problemi mikroservisle çözdüğüm bir projem de var — EventTix — orada domain bölünmeyi gerektiriyordu.

**S: "Modül sınırları net" diyorsun, neyle garanti ediyorsun?**
Üç şeyle. Her modül dışarıya sadece `index.js`'inden açılıyor. Her tablonun tek sahip modülü var. Ve bunu eslint'in `no-restricted-paths` kuralı denetliyor — başka modülün iç dosyasını import etmeye çalışırsam `npm run lint` hata veriyor. Disiplin belgede değil, derleme zincirinde.

**S: Aynı hesaptan aynı anda iki çekim gelirse?**
`SELECT ... FOR UPDATE` ile satır kilitleniyor, ikinci işlem birincisi bitene kadar bekliyor ve güncel bakiyeyi okuyor. Bunu testle doğruladım: bakiyesi 100 olan hesaptan aynı anda 10 paralel 20'lik transfer gönderiyorum; tam 5'i başarılı oluyor, 5'i `INSUFFICIENT_FUNDS` alıyor, bakiye tam 0'da kalıyor. Ayrıca veritabanı seviyesinde `CHECK (balance >= 0)` constraint'i son savunma hattı olarak duruyor.

**S: Deadlock riski yok mu?**
Var — A→B ve B→A aynı anda çalışırsa. Bu yüzden prosedür hesapları her zaman IBAN'ın alfabetik sırasına göre kilitliyor, transferin yönü ne olursa olsun. Döngüsel bekleme oluşamıyor. Bunun için de ayrı bir test var: iki yönde 20'şer paralel transfer, hiçbiri `ORA-00060` almıyor.

**S: Neden transfer mantığı uygulamada değil de PL/SQL'de?**
İki sebep. Birincisi kilit süresi: JS tarafında yapsam her adım için ağ gidiş-dönüşü olur ve kilitler o boyunca açık kalır. Prosedür hepsini veritabanının içinde yapıyor. İkincisi bütünlük: transfer mantığı tek yerde, atomik. Takas ise şu — iş mantığının bir kısmı veritabanına gömülüyor, versiyonlaması ve test edilmesi uygulama kodundan daha zor. Bu yüzden sadece transferi taşıdım; yatırma/çekme uygulama katmanında kaldı.

**S: JWT'yi 15 dakika yapmışsın, refresh token yok. Neden?**
Kapsam kararı. Refresh token akışı (rotation, revocation listesi, saklama) doğru yapılmadığında güvenlik açığı yaratıyor; yarım yapmaktansa hiç yapmamayı tercih ettim ve README'de v2 notu olarak belirttim.

**S: Bakiyeyi neden `NUMBER(18,2)`? Float olmaz mı?**
Olmaz. Kayan noktalı sayılar ondalık kesirleri tam temsil edemez, para hesabında kuruş kaybı birikir. Oracle'ın `NUMBER` tipi ondalık tabanlı ve tam hassasiyetli.

## 8. Projeyi CV'de nasıl yazacaksın

> **CoreBank API — Bankacılık İşlem Servisi**
> Node.js, Express, Oracle 21c, PL/SQL, Docker, JWT
> Modular monolith mimarisiyle geliştirilmiş, modül sınırları eslint ile denetlenen bankacılık API'si. Para transferi `SELECT ... FOR UPDATE` ve PL/SQL paketi ile atomik; sabit kilit sırası ile deadlock önlemi; eşzamanlılık ve deadlock senaryoları entegrasyon testleriyle doğrulanmış.

Tek satırlık versiyon:
*"Oracle PL/SQL ve pesimistik kilitleme ile ACID para transferi yapan, modül sınırları lint ile denetlenen Node.js API'si."*

## 9. Bitirme kontrol listesi

- [ ] `docker compose up` temiz makinede tek seferde çalışıyor (Oracle'ın 1-2 dk sürdüğü notu README'de)
- [ ] `npm run lint` → 0 modül sınırı ihlali
- [ ] `pkg_transfer` kodunun tamamı README'de, 9 adım açıklamalı
- [ ] Eşzamanlılık testinin çıktısı README'de ekran görüntüsü olarak var
- [ ] Deadlock testinin çıktısı README'de var
- [ ] "Neden modular monolith" başlığı yazılı, EventTix'e link veriyor
- [ ] Swagger `/api-docs` çalışıyor, Postman collection repo'da
- [ ] Repo açıklaması + topics dolu (`nodejs`, `express`, `oracle`, `plsql`, `modular-monolith`, `rest-api`, `docker`)
- [ ] Repo pinlenmiş
- [ ] Commit sayısı 25+ ve mesajlar anlamlı
