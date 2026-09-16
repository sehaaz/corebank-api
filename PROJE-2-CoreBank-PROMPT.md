# CoreBank API — AI ile Geliştirme Promptları

Bu dosya, `PROJE-2-CoreBank-API-Mimari.md` dosyasını AI'a adım adım uygulatmak içindir.

**Kullanım:**
1. Boş bir klasör aç, `git init` yap.
2. Mimari dosyasını (`PROJE-2-CoreBank-API-Mimari.md`) ve bu dosyayı repo köküne kopyala.
3. **Faz 0**'ı bir kere çalıştır, sonra fazları sırayla uygula.
4. Her fazın sonundaki doğrulamayı kendin çalıştır, sonra commit at.

**Bu projede özel dikkat:** Modül sınırları. AI doğal olarak "kolay yol"a kayar ve `transaction` modülünden `ACCOUNTS` tablosuna doğrudan SQL yazar. Her fazda bunu kontrol et — projenin tüm değeri bu disiplinde.

---

## Faz 0 — Repo kuralları (bir kere)

```
Bu repoda CoreBank API adında bir modular monolith projesi geliştireceğim. Mimarinin
tamamı PROJE-2-CoreBank-API-Mimari.md dosyasında. Önce bu dosyayı oku.

Görev: Repo köküne, bundan sonraki tüm çalışmalarında uyacağın kuralları içeren bir
CLAUDE.md dosyası oluştur. İçeriği şunlar olsun:

- Mimari kaynak: PROJE-2-CoreBank-API-Mimari.md. Aykırı bir şey gerekiyorsa önce sor.
- MODÜL SINIRLARI (en önemli kural, mimari bölüm 3):
  * Bir modül yalnızca kendi tablolarına SQL yazar.
  * Modüller arası erişim SADECE o modülün index.js'i üzerinden olur.
    require('../account') serbest, require('../account/account.repository') yasak.
  * Bağımlılık yönü: transaction -> account -> identity, transaction -> fx, -> audit.
    Ters yönde bağımlılık yasak.
  * Transaction sınırı çağıran modülde açılır; conn nesnesi parametre olarak geçirilir.
    Repository asla kendi başına commit/rollback yapmaz.
  * shared/ hiçbir modüle bağımlı olamaz.
- ORM KULLANMA. Ham SQL + node-oracledb. Tüm SQL bind değişkenli olacak
  (:iban gibi), string birleştirme kesinlikle yok.
- Modül iç yapısı sabit: index.js, *.routes.js, *.controller.js, *.service.js,
  *.repository.js, *.schema.js
- CommonJS (require), async/await. Callback yok.
- Para ile ilgili validasyonu asla kısma: tutar pozitif, max 2 ondalık, sahiplik
  kontrolü her istekte DB'den doğrulanır.
- İstenen değişikliğin en küçük hâlini yap. Sormadan yeni paket ekleme.
- Değişiklik sonrası özet: ne değişti, nasıl test edilir, varsa risk.

Sadece CLAUDE.md dosyasını oluştur. (Eğer zaten varsa bu özellikleri de dahil edecek 
şekilde güncelle)
```

---

## Faz 1 — Altyapı + shared kernel (Hafta 1)

### 1.1 Docker + Oracle

```
Mimarideki bölüm 10'a göre altyapıyı kur:

- docker-compose.yml: gvenzl/oracle-xe:21-slim (port 1521) ve api servisi
  (node:20-alpine tabanlı Dockerfile, port 3000).
- Oracle'a healthcheck ekle; api servisi depends_on: oracle condition: service_healthy.
- src/db/ altındaki .sql dosyaları Oracle container'ının
  /container-entrypoint-initdb.d klasörüne mount edilsin.
- .env.example: DB_USER, DB_PASSWORD, DB_CONNECT_STRING, JWT_SECRET, PORT
- .gitignore, package.json (express, oracledb, jsonwebtoken, bcrypt,
  express-validator, helmet, express-rate-limit, swagger-ui-express, dotenv;
  dev: jest, supertest, eslint, eslint-plugin-import)

Henüz uygulama kodu yazma.
```

**Doğrula:** `docker compose up -d oracle` → 1-2 dk sonra `docker compose ps` healthy.

### 1.2 Veritabanı şeması

```
Mimarideki bölüm 5'e göre src/db/ altındaki SQL dosyalarını yaz:

- 01_schema.sql: CUSTOMERS, ACCOUNTS, TRANSACTIONS, EXCHANGE_RATES, AUDIT_LOG
  tabloları + SEQ_* sequence'leri + mimarideki iki index. Constraint'leri atlama
  (chk_balance dahil).
- 02_views.sql: V_ACCOUNT_SUMMARY
- 05_seed.sql: 3 demo müşteri (biri TELLER rolünde), her birine 1-2 hesap,
  EXCHANGE_RATES'e TRY/USD/EUR çapraz kurları.

03_packages.sql ve 04_triggers.sql dosyalarını şimdilik boş placeholder olarak
oluştur, Faz 3'te dolduracağız. Dosya isimlerini mimarideki gibi bırak.
```

**Doğrula:** Container'ı sil ve yeniden kur (`docker compose down -v && docker compose up -d oracle`), SQL'ler hatasız çalışsın (`docker compose logs oracle`).

### 1.3 Shared kernel

```
src/shared/ altındaki ortak katmanı yaz (mimari bölüm 9):

- config/env.js: gerekli env değişkenlerini doğrular, eksikse hata fırlatıp
  süreci durdurur.
- db/pool.js: oracledb.createPool (min 2, max 10), getConnection helper,
  closePool (graceful shutdown için).
- db/withTransaction.js: bir bağlantı alır, verilen async fonksiyonu conn ile
  çağırır, başarıda commit, hatada rollback, her durumda connection'ı kapatır.
- errors/AppError.js: status, code, message taşıyan hata sınıfı.
- errors/oracleErrorMap.js: ORA-20001 -> INSUFFICIENT_FUNDS (409),
  ORA-20002 -> DAILY_LIMIT_EXCEEDED (409), ORA-00001 -> DUPLICATE (409).
- middleware/errorHandler.js: AppError ve Oracle hatalarını mimari bölüm 7'deki
  JSON formatına çevirir. Beklenmeyen hatada 500 döner ve detayı client'a sızdırmaz.
- middleware/auth.js: JWT doğrular, req.user = {customerId, role} set eder.
  requireRole(role) yardımcısı.
- middleware/validate.js: express-validator sonuçlarını 400 + hata listesine çevirir.
- logger.js: basit console tabanlı; parola, token ve tam IBAN'ı loglamaz
  (IBAN'ı maskeleyen bir yardımcı ekle).

src/app.js ve src/server.js iskeletini de oluştur (helmet, json parser,
errorHandler, /health endpoint'i, graceful shutdown).
```

**Doğrula:** `docker compose up --build` → `curl localhost:3000/health` → 200.

### 1.4 identity modülü

```
src/modules/identity/ modülünü mimarideki iç yapıya birebir uyarak yaz:

- POST /api/auth/register: nationalId (11 hane), fullName, email, password.
  bcrypt cost 12. Email veya nationalId varsa 409.
- POST /api/auth/login: JWT üret (HS256, 15 dk, claim: customerId, role).
- GET /api/customers/me: profil bilgisi (parola hash'i dönme).
- index.js: { router, getById(conn, id) } dışa açsın. Başka bir şey dışa açma.
- Tüm SQL bind değişkenli, repository conn parametresi alsın.
- express-validator ile identity.schema.js.

app.js'te router'ı mount et.
```

**Doğrula:** register → 201, login → token, `/api/customers/me` token ile 200, tokensız 401.

**Commit:** `feat: altyapi, shared kernel ve identity modulu`

---

## Faz 2 — account + basit işlemler (Hafta 2)

### 2.1 account modülü

```
src/modules/account/ modülünü yaz:

- POST /api/accounts: {currency} alır, yeni hesap açar. IBAN üretimi şimdilik
  JS tarafında yapılsın (TR + mod-97), Faz 3'te PL/SQL fonksiyonuna taşıyacağız.
- GET /api/accounts: kullanıcının hesapları, V_ACCOUNT_SUMMARY view'ından okunsun.
- GET /api/accounts/:iban: tek hesap detayı.
- PATCH /api/accounts/:iban/status: sadece TELLER rolü. ACTIVE|FROZEN|CLOSED.
  Bakiyesi sıfır olmayan hesap CLOSED yapılamaz.
- index.js şunları dışa açsın ve BAŞKA HİÇBİR ŞEYİ:
    router
    getByIban(conn, iban)
    assertOwnership(conn, iban, customerId)   -> sahibi değilse AppError(403, 'FORBIDDEN')
    assertActive(conn, iban)                  -> ACTIVE değilse AppError(409, 'ACCOUNT_NOT_ACTIVE')
    adjustBalance(conn, iban, delta)          -> FOR UPDATE ile kilitleyip günceller,
                                                 yeni bakiyeyi döner
  Bu fonksiyonların hepsi conn parametresi alır, kendi başına commit etmez.
- Testler: sahiplik ihlali 403, donmuş hesaba işlem 409.
```

**Doğrula:** Hesap aç, listele. Başka kullanıcının IBAN'ı ile sorgula → 403.

### 2.2 transaction modülü — yatırma/çekme + ekstre

```
src/modules/transaction/ modülünü yaz. DİKKAT: bu modül ACCOUNTS tablosuna
doğrudan SQL yazmayacak, account modülünün index.js'inden gelen fonksiyonları
kullanacak.

- POST /api/transactions/deposit {iban, amount, description}
- POST /api/transactions/withdraw {iban, amount, description}
  Her ikisi de withTransaction içinde:
    1. account.assertOwnership(conn, iban, req.user.customerId)
    2. account.assertActive(conn, iban)
    3. account.adjustBalance(conn, iban, +/-amount)  -> yeni bakiye
    4. kendi TRANSACTIONS tablosuna kaydı yaz (balance_after = yeni bakiye,
       reference_no = randomUUID)
  Yetersiz bakiyede AppError(409, 'INSUFFICIENT_FUNDS'); chk_balance constraint'ine
  güvenme, önce kontrol et.
- GET /api/accounts/:iban/statement?from=&to=&page=&size=
  Sahiplik kontrolü + tarih aralığı + sayfalama (OFFSET/FETCH NEXT).
  Toplam kayıt sayısını da dön.
- Birim testleri (repository ve account modülü mock'lu): negatif tutar, 3 ondalıklı
  tutar, yetersiz bakiye, sahiplik ihlali.
```

**Doğrula:** Para yatır → bakiye arttı, ekstrede görünüyor. Bakiyeden fazla çekmeye çalış → 409.

**Kontrol et:** `grep -rn "ACCOUNTS" src/modules/transaction/` → hiçbir sonuç çıkmamalı.

**Commit:** `feat: account modulu ve para yatirma/cekme islemleri`

---

## Faz 3 — Transfer, PL/SQL, kur (Hafta 2–3)

### 3.1 pkg_transfer — projenin vitrini

```
src/db/03_packages.sql dosyasını yaz. Mimarideki bölüm 6'daki 9 adımı birebir uygula.

CREATE OR REPLACE PACKAGE pkg_transfer / PACKAGE BODY:
  PROCEDURE do_transfer(p_from_iban, p_to_iban, p_amount, p_desc, p_reference OUT)

Adımlar:
 1. İki hesabı IBAN'ın alfabetik sırasına göre SELECT ... FOR UPDATE ile kilitle.
    Sabit sıra deadlock'u önlemek için; bunu koda yorum olarak da yaz.
 2. Aynı hesap mı, ikisi de ACTIVE mi kontrol et (-20003 SAME_ACCOUNT,
    -20004 ACCOUNT_NOT_ACTIVE).
 3. Bakiye yeterli değilse RAISE_APPLICATION_ERROR(-20001, 'INSUFFICIENT_FUNDS').
 4. Bugünkü TRANSFER_OUT toplamı + p_amount > daily_limit ise
    RAISE_APPLICATION_ERROR(-20002, 'DAILY_LIMIT_EXCEEDED').
 5. Para birimleri farklıysa EXCHANGE_RATES'ten kuru çek, hedef tutarı hesapla.
    Kur yoksa -20005 RATE_NOT_FOUND.
 6. p_reference := SYS_GUID() (RAWTOHEX).
 7. Gönderenden düş + TRANSACTIONS'a TRANSFER_OUT kaydı (balance_after ile).
 8. Alıcıya ekle + TRANSACTIONS'a TRANSFER_IN kaydı.
 9. COMMIT. EXCEPTION bloğunda ROLLBACK + hatayı yeniden fırlat.

Ayrıca fn_generate_iban(p_account_id) fonksiyonunu da bu dosyaya ekle
(TR + mod-97 kontrol hanesi) ve account modülünü JS'teki IBAN üretimi yerine
bu fonksiyonu kullanacak şekilde güncelle.

SQL'i açıklayıcı yorumlarla yaz; bu kodu README'ye koyacağım ve mülakatta anlatacağım.
```

### 3.2 Transfer endpoint'i + fx modülü

```
- src/modules/fx/ modülü: EXCHANGE_RATES okuma. index.js -> { router, getRate(conn, from, to) }.
  GET /api/rates endpoint'i.
- transaction modülüne POST /api/transactions/transfer {fromIban, toIban, amount, description}:
    1. account.assertOwnership ile gönderen hesabın kullanıcıya ait olduğunu doğrula.
    2. pkg_transfer.do_transfer'ı oracledb ile çağır (OUT parametreyi bindOut ile al).
    3. Dönen reference_no'yu 201 ile dön.
  Prosedür kendi commit'ini yaptığı için burada withTransaction kullanma; bunu
  koda yorum olarak yaz.
- ORA-20001..20005 hatalarını oracleErrorMap üzerinden HTTP 409'a çevir.
- Transfer endpoint'ine ayrı ve sıkı express-rate-limit uygula.
```

**Doğrula:** Aynı para birimi transferi → iki hesabın toplamı değişmedi. Farklı para birimi → kur uygulandı. Limiti aş → 409 `DAILY_LIMIT_EXCEEDED`.

### 3.3 audit modülü

```
- src/db/04_triggers.sql: trg_accounts_audit — ACCOUNTS üzerinde AFTER UPDATE
  FOR EACH ROW. balance veya status değiştiyse AUDIT_LOG'a eski/yeni değeri
  JSON string olarak yazsın.
- src/modules/audit/: GET /api/audit?table=&from=&to=&page=&size= (sadece TELLER).
  index.js -> { router }.
```

**Commit:** `feat: pkg_transfer, para transferi, kur donusumu ve audit`

---

## Faz 4 — Testler, sınır denetimi, Swagger (Hafta 3)

### 4.1 Modül sınırı denetimi

```
Modül sınırlarını otomatik denetleyecek yapıyı kur:

- eslint-plugin-import ile .eslintrc'ye no-restricted-paths kuralı ekle:
  src/modules/<X>/ içinden src/modules/<Y>/ altındaki index.js DIŞINDAKİ
  hiçbir dosya import edilemesin. shared/ herkese açık, ama shared/ içinden
  modules/ import edilemesin.
- package.json'a "lint": "eslint src" script'i.
- Kuralı önce bilerek ihlal eden bir satır yazıp lint'in yakaladığını doğrula,
  sonra o satırı sil.
- Mevcut kodda ihlal varsa listele ve düzelt.
```

**Doğrula:** `npm run lint` → 0 hata. Kural çalışıyor.

### 4.2 Eşzamanlılık testi — en önemli test

```
Gerçek Oracle container'ına karşı çalışan entegrasyon testleri yaz (Jest + supertest):

1. transfer.integration.test.js:
   - Başarılı transfer sonrası iki hesabın bakiye TOPLAMI değişmemeli.
   - Her iki hesapta da aynı reference_no ile birer TRANSACTIONS kaydı olmalı.
   - Yetersiz bakiye -> 409 ve hiçbir bakiye değişmemiş olmalı.
2. concurrency.integration.test.js (KRİTİK):
   - Bakiyesi 100 olan hesaptan aynı anda (Promise.all) 10 adet 20 birimlik
     transfer isteği gönder.
   - Beklenen: tam 5 istek 201, 5 istek 409 INSUFFICIENT_FUNDS.
   - Gönderen bakiyesi tam 0, alıcı bakiyesi tam 100 olmalı. Negatif bakiye asla oluşmamalı.
   - Test çıktısı okunabilir olsun (kaç başarılı, kaç reddedildi, son bakiyeler),
     ekran görüntüsünü README'ye koyacağım.
3. deadlock.integration.test.js:
   - A->B ve B->A transferlerini aynı anda 20'şer kez çalıştır. Hiçbiri
     ORA-00060 (deadlock) hatası almamalı. FOR UPDATE'in sabit sırasının kanıtı.

Testler kendi test verilerini seed edip sonunda temizlesin.
```

**Doğrula:** `npm test` → hepsi geçiyor. Eşzamanlılık testinin çıktısının ekran görüntüsünü al.

### 4.3 Swagger

```
docs/openapi.yaml dosyasını elle yaz (kod üreticisi kullanma) ve
swagger-ui-express ile /api-docs altında sun.

- Mimarideki bölüm 7'deki tüm endpoint'ler.
- Her endpoint için örnek request/response.
- Hata kodları tablosu components/responses altında.
- bearerAuth security scheme.

Ayrıca docs/CoreBank.postman_collection.json üret: login'den token'ı alıp
collection variable'a yazan bir test script'i de olsun.
```

**Commit:** `test: esszamanlilik ve deadlock testleri, modul siniri denetimi, swagger`

---

## Faz 5 — README

```
Mimarideki bölüm 13'e göre README.md'yi yaz:

1. Bir cümlelik tanım + mimari şeması (mimarideki ASCII diyagram)
2. Kurulum: docker compose up, Oracle'ın ilk açılışının 1-2 dk sürdüğü notu,
   localhost:3000/api-docs, demo kullanıcı bilgileri
3. "Neden modular monolith?" — para transferinin tek ACID transaction'a sığdığı,
   mikroservis olsaydı saga + telafi gerekeceği ve bunun para işleminde gerileme
   olacağı. 4 cümle. Sonunda EventTix repo'suna link:
   "Aynı problemin mikroservis ve saga ile çözüldüğü projem: ..."
4. "Modül sınırları" — bağımlılık diyagramı (mermaid), 5 kural, eslint kuralının
   kod bloğu, npm run lint çıktısı
5. "Neden ORM yok?" — 3 cümle
6. "Transferin kalbi: pkg_transfer" — PL/SQL kodunun tamamı + 9 adımın açıklaması.
   Özellikle IBAN sıralı FOR UPDATE'in deadlock'u nasıl önlediğini anlat.
7. Eşzamanlılık ve deadlock testlerinin çıktısı için yer tutucu
8. Postman collection linki

Türkçe yaz, teknik ve net olsun, pazarlama dili kullanma.
Ayrıca repo açıklaması ve topics önerisi ver (nodejs, express, oracle, plsql,
modular-monolith, rest-api, docker).
```

**Son adımlar (elle):** test çıktısı ekran görüntülerini ekle, repo açıklaması + topics doldur, repo'yu pinle.

---

## AI ile çalışırken uyulacak kurallar

| Kural | Sebep |
|---|---|
| Her fazdan sonra `npm run lint` çalıştır | Modül sınırı ihlali sessizce birikir |
| `grep -rn "ACCOUNTS" src/modules/transaction/` benzeri kontroller yap | Tablo sahipliği projenin omurgası |
| PL/SQL kodunu satır satır oku ve anla | Mülakatta bu kodun üstünden gidilecek |
| AI "ORM kullanalım / Sequelize ekleyeyim" derse hayır de | Projenin tüm anlamı ham SQL ve transaction kontrolü |
| Para ile ilgili validasyonu "gereksiz" diye sildirme | Auth/ödeme/güvenlik istisnası |
| Commit'leri sen at | Commit geçmişi profilinin parçası |

**Tıkanırsan kullanacağın prompt:**
```
Şu hatayı alıyorum: <hata metni>
İlgili dosya: <dosya yolu>
Ne denedim: <denediklerin>
Önce hatanın sebebini açıkla, sonra en küçük düzeltmeyi öner. Kodu yeniden yazma.
```

**Oracle'a özgü sık takılmalar:**
- `ORA-12541 / connection refused`: container henüz hazır değil, healthcheck'i bekle
- `NJS-138 / DPI-1047`: Thin mode kullan (`oracledb.thin` varsayılan, `initOracleClient` çağırma)
- `ORA-00933`: Oracle `LIMIT` desteklemez → `OFFSET :o ROWS FETCH NEXT :n ROWS ONLY`
- `ORA-01400`: sequence'ten id alınmamış, `DEFAULT SEQ_X.NEXTVAL` tanımını kontrol et
- Tarih karşılaştırmaları: `TO_TIMESTAMP` ile bind et, string gönderme
