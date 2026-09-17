# CoreBank API — Çalışma Kuralları

## Mimari kaynak
- Tek referans: `PROJE-2-CoreBank-API-Mimari.md`. Yapı, tablolar, endpoint'ler, dosya
  düzeni oradan gelir.
- Mimariye aykırı bir şey gerekiyorsa uygulama, önce sor.

## MODÜL SINIRLARI (en önemli kural — mimari bölüm 3)
- **Tablo sahipliği tekildir.** Bir modül yalnızca kendi tablolarına SQL yazar:
  `identity`→`CUSTOMERS`, `account`→`ACCOUNTS`, `transaction`→`TRANSACTIONS`,
  `fx`→`EXCHANGE_RATES`, `audit`→`AUDIT_LOG`.
  `transaction` modülü `ACCOUNTS`'a doğrudan SELECT/UPDATE yapamaz.
- **Modüller arası erişim SADECE `index.js` üzerinden.**
  `require('../account')` serbest, `require('../account/account.repository')` yasak.
- **Bağımlılık yönü tek yönlü, döngü yok:**
  `transaction → account → identity`, `transaction → fx`, `transaction → audit`.
  Ters yönde bağımlılık yasak; `account` `transaction`'ı tanımaz, `identity` hiçbir
  modülü tanımaz.
- **Transaction sınırı çağıran modülde açılır.** `withTransaction` çağıran modülde
  açılır, `conn` nesnesi diğer modülün public fonksiyonuna parametre olarak geçirilir.
  Repository asla kendi başına `commit`/`rollback` yapmaz.
- **`shared/` hiçbir modüle bağımlı olamaz.** Modüller `shared/`'a bağımlı olabilir.

## Veri erişimi
- **ORM YOK.** Ham SQL + `node-oracledb`. Sequelize/TypeORM/Knex eklenmeyecek.
- **Tüm SQL bind değişkenli** (`:iban`, `:amount`). String birleştirme veya template
  literal ile SQL kurma kesinlikle yasak — tablo/kolon adı için bile.
- Repository sadece SQL içerir ve ilk parametre olarak `conn` alır.

## Modül iç yapısı (sabit)
```
src/modules/<ad>/
├── index.js              # PUBLIC API — dışarıya açılan tek yüzey
├── <ad>.routes.js        # Express router
├── <ad>.controller.js    # HTTP ↔ servis
├── <ad>.service.js       # iş kuralları
├── <ad>.repository.js    # sadece SQL, conn parametre alır
└── <ad>.schema.js        # express-validator kuralları
```
Bu dosyaların dışına çıkma; yeni katman/klasör icat etme.

## Dil ve stil
- CommonJS (`require`/`module.exports`). ESM yok.
- `async`/`await`. Callback yok, `.then()` zinciri yok.

## Para ve güvenlik — validasyonu asla kısma
- Tutar: pozitif, en fazla 2 ondalık, üst sınır kontrolü.
- Sahiplik kontrolü her istekte DB'den doğrulanır (`account.assertOwnership`).
  JWT'deki `customerId` yeterli değil, IBAN'ı bilmek yetmez.
- Hesap durumu (`ACTIVE`) ve bakiye kontrolü atlanmaz.
- Log'a parola, token veya tam IBAN yazılmaz.

## Sadelik / Overengineering yasak
- İstenen değişikliğin en küçük hâlini yap. 200 satır yazdıysan ve 50 yeterliyse, 50'ye indir.
- İstenmeyen özellik, config, "esneklik" veya soyutlama ekleme.
- Gerçekleşmesi imkansız senaryolar için error handling/validation ekleme
  (İSTİSNA: auth, ödeme, güvenlik ile ilgili yerlerde validasyonu asla kısma).
- Sormadan yeni paket/dependency ekleme; önce stdlib ve projede zaten olanı kullan.
  Gerçekten gerekiyorsa hangi paket, neden, önce sor.

## Mevcut düzene uy
- Yazmadan önce repodaki en yakın örüntüyü bul ve onu takip et (import, error handling, dosya yapısı, isimlendirme).
- Zaten var olan bir yardımcı/abstraction varken yenisini icat etme.
- Hangi örüntünün "doğru" olduğundan emin değilsen sor, üçüncü bir yol uydurma.

## Cerrahi değişiklik
- Değiştirdiğin her satır isteğe doğrudan bağlı olsun.
- İlgisiz kodu "iyileştirme", yorum/format düzeltme yapma.
- Bozuk olmayan şeyi refactor etme. İlgisiz dead code fark edersen sil, sadece belirt.

## Rapor / özet yazarken
- Sonuç en başta. Giriş paragrafı, görev tekrarı yok.
- Sadece: ne değişti, hangi komutla test edilir, varsa risk. Fazlası yok.
- Gereksiz gerekçe/bağlam cümlesi ekleme, madde işaretleri kısa olsun.
