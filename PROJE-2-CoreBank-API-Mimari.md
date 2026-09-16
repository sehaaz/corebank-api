# CoreBank API — Bankacılık İşlem Servisi (Modular Monolith)

**Stack:** Node.js 20 + Express · Oracle XE 21c (`node-oracledb`) · Docker Compose · JWT
**Mimari:** Modular monolith — tek process, sert modül sınırları
**Hedef süre:** 2–3 hafta (günde ~2 saat)
**Repo:** `github.com/sehaaz/corebank-api`

---

## 1. Amaç

Müşteri, hesap, para transferi ve ekstre işlemlerini yöneten backend servisi. Frontend yok; tüm yüzey REST API + Swagger.

**Neden modular monolith:** Para transferi tek bir veritabanı transaction'ına sığar ve sığmalı. Bunu mikroservise bölmek, çözülmüş bir problemi (ACID) yeniden çözmeye çalışmak olur. Bu proje bilinçli olarak tersini gösteriyor: tek deployment, tek transaction, ama modüller arası sınırlar mikroservisteki kadar net — her modülün kendi tabloları var ve dışarıya yalnızca `index.js`'inden hizmet veriyor. Bu, EventTix projesinin (mikroservis) doğal karşıtı; ikisi birlikte "mimariyi ihtiyaca göre seçiyorum" mesajı verir.

Oracle'ın varlık sebebi: transaction / rollback / satır kilitleme / stored procedure kullanımını yapay örnek olmadan doğal şekilde gerektiren bir domain. Bu proje "ORM yazdım" değil, "SQL ve transaction biliyorum" mesajı verir.

## 2. Kapsam

**Var:**
- Müşteri kaydı, giriş (JWT), rol: `CUSTOMER`, `TELLER`
- Hesap açma (TRY/USD/EUR), bakiye sorgulama, hesap dondurma/kapatma
- Para yatırma / çekme
- Hesaplar arası transfer (aynı ve farklı para birimi — sabit kur tablosu)
- Hesap hareketleri (ekstre), tarih aralığı + sayfalama
- Günlük transfer limiti kontrolü
- Stored procedure + view + trigger + index kullanımı
- Modül sınırlarını koruyan yapı + bunu doğrulayan test
- `docker compose up` ile Oracle dahil tek komutta ayağa kalkma

**Yok (bilinçli olarak kapsam dışı):**
- Frontend, kredi/kart modülleri, EFT/SWIFT entegrasyonu
- Gerçek KYC, SMS/OTP
- ORM (Sequelize/TypeORM yok — ham SQL ve PL/SQL bilinçli tercih)
- Mikroservis ayrımı, mesaj kuyruğu, ayrı deployment

## 3. Modüller

Tek Express uygulaması, beş modül. Her modül `src/modules/<ad>/` altında ve **dışarıya yalnız `index.js` ile açılır**.

| Modül | Sorumluluk | Sahip olduğu tablolar |
|---|---|---|
| `identity` | Müşteri kaydı, giriş, JWT üretim/doğrulama, rol | `CUSTOMERS` |
| `account` | Hesap açma, IBAN, bakiye, durum, sahiplik doğrulama | `ACCOUNTS` |
| `transaction` | Yatırma, çekme, transfer, ekstre, limit kontrolü | `TRANSACTIONS` |
| `fx` | Kur tablosu, para birimi dönüşümü | `EXCHANGE_RATES` |
| `audit` | Değişiklik kaydı (trigger + servis kaydı) | `AUDIT_LOG` |

### Modül sınırı kuralları

1. **Tablo sahipliği tekildir.** Bir modül yalnızca kendi tablolarına SQL yazar. `transaction` modülü `ACCOUNTS` tablosuna doğrudan `SELECT`/`UPDATE` yapamaz.
2. **Modüller arası erişim yalnız public API üzerinden.** `require('../account')` serbest, `require('../account/account.repository')` yasak.
3. **Bağımlılık yönü tek yönlü ve döngüsüz:**
   ```
   transaction ──► account ──► identity
        │                         ▲
        └────► fx                 │
        └────► audit ─────────────┘
   ```
   `account`, `transaction`'ı tanımaz. `identity` hiçbir modülü tanımaz.
4. **Transaction sınırı çağıran modüldedir.** `transaction` modülü `withTransaction`'ı açar, aldığı `conn` nesnesini `account`'un public fonksiyonlarına parametre olarak geçirir. Hiçbir repository kendi başına `commit` etmez.
5. **Shared kernel** (`src/shared/`): db pool, hata sınıfları, auth middleware, logger, validator. Modüller buna bağımlı olabilir; shared kernel hiçbir modüle bağımlı olamaz.

Bu kuralların hepsi README'de "Modül sınırları" başlığı altında yazılı olmalı — modular monolith'in tamamı bu disipline bağlı.

### Modülün iç yapısı (hepsi aynı)

```
src/modules/account/
├── index.js                  # PUBLIC API — dışarıya açılan tek yüzey
├── account.routes.js         # Express router
├── account.controller.js     # HTTP ↔ servis
├── account.service.js        # iş kuralları
├── account.repository.js     # sadece SQL, conn parametre alır
└── account.schema.js         # express-validator kuralları
```

`index.js` örneği:
```js
// Dışarıya açılan tek yüzey. Başka modüller yalnız bunu require eder.
module.exports = {
  router: require('./account.routes'),
  // transaction modülünün ihtiyaç duyduğu servisler:
  getByIban:        (conn, iban) => svc.getByIban(conn, iban),
  assertOwnership:  (conn, iban, customerId) => svc.assertOwnership(conn, iban, customerId),
  adjustBalance:    (conn, iban, delta) => svc.adjustBalance(conn, iban, delta),
};
```

## 4. Mimari

```
┌──────────────┐   HTTP/JSON    ┌────────────────────────────────────────────┐
│ Postman /    │ ─────────────► │  Node.js + Express  :3000                  │
│ Swagger UI   │ ◄───────────── │                                            │
└──────────────┘                │  app.js  →  modüllerin router'larını mount │
                                │                                            │
                                │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │
                                │  │ identity │ │ account  │ │transaction │  │
                                │  └──────────┘ └──────────┘ └────────────┘  │
                                │  ┌──────────┐ ┌──────────┐                 │
                                │  │    fx    │ │  audit   │                 │
                                │  └──────────┘ └──────────┘                 │
                                │  ────────── shared kernel ───────────────  │
                                │   db pool · errors · auth · validate · log │
                                └──────────────────┬─────────────────────────┘
                                                   │ node-oracledb (pool)
                                                   ▼
                                    ┌───────────────────────────────┐
                                    │  Oracle XE 21c   :1521        │
                                    │  tablolar · PL/SQL paketi     │
                                    │  view · index · trigger · seq │
                                    └───────────────────────────────┘
```

**Neden tek process:** tüm modüller aynı Oracle bağlantısını paylaştığı için transfer gerçek bir ACID transaction'dır. Mikroservis olsaydı saga + telafi gerekirdi ve para işleminde bu net bir gerileme olurdu. (EventTix projesinde bunun tersi doğru — README'lerde birbirine referans ver.)

## 5. Veri Modeli (Oracle)

```sql
-- identity modülü
CUSTOMERS (
  id            NUMBER PRIMARY KEY,            -- SEQ_CUSTOMERS
  national_id   VARCHAR2(11) UNIQUE NOT NULL,
  full_name     VARCHAR2(100) NOT NULL,
  email         VARCHAR2(100) UNIQUE NOT NULL,
  password_hash VARCHAR2(255) NOT NULL,
  role          VARCHAR2(20) DEFAULT 'CUSTOMER',
  created_at    TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- account modülü
ACCOUNTS (
  id            NUMBER PRIMARY KEY,            -- SEQ_ACCOUNTS
  customer_id   NUMBER REFERENCES CUSTOMERS(id),
  iban          VARCHAR2(26) UNIQUE NOT NULL,
  currency      VARCHAR2(3) NOT NULL,          -- TRY | USD | EUR
  balance       NUMBER(18,2) DEFAULT 0 NOT NULL,
  daily_limit   NUMBER(18,2) DEFAULT 50000,
  status        VARCHAR2(10) DEFAULT 'ACTIVE', -- ACTIVE | FROZEN | CLOSED
  created_at    TIMESTAMP DEFAULT SYSTIMESTAMP,
  CONSTRAINT chk_balance CHECK (balance >= 0)
);

-- transaction modülü
TRANSACTIONS (
  id            NUMBER PRIMARY KEY,            -- SEQ_TRANSACTIONS
  account_id    NUMBER REFERENCES ACCOUNTS(id),
  counter_iban  VARCHAR2(26),
  type          VARCHAR2(10) NOT NULL,         -- DEPOSIT|WITHDRAW|TRANSFER_IN|TRANSFER_OUT
  amount        NUMBER(18,2) NOT NULL,
  balance_after NUMBER(18,2) NOT NULL,
  reference_no  VARCHAR2(36) NOT NULL,         -- transferin iki bacağı aynı referansı paylaşır
  description   VARCHAR2(200),
  created_at    TIMESTAMP DEFAULT SYSTIMESTAMP
);

-- fx modülü
EXCHANGE_RATES (
  base_currency VARCHAR2(3), target_currency VARCHAR2(3),
  rate NUMBER(12,6), updated_at TIMESTAMP,
  PRIMARY KEY (base_currency, target_currency)
);

-- audit modülü
AUDIT_LOG (
  id NUMBER PRIMARY KEY, table_name VARCHAR2(30), record_id NUMBER,
  action VARCHAR2(10), old_value CLOB, new_value CLOB, created_at TIMESTAMP
);
```

**Index'ler:**
```sql
CREATE INDEX idx_tx_account_date ON TRANSACTIONS(account_id, created_at DESC);
CREATE INDEX idx_accounts_customer ON ACCOUNTS(customer_id);
```

**View** (`account` modülü okur):
```sql
CREATE VIEW V_ACCOUNT_SUMMARY AS
SELECT a.id, a.iban, a.currency, a.balance, c.full_name,
       (SELECT COUNT(*) FROM TRANSACTIONS t WHERE t.account_id = a.id) AS tx_count,
       (SELECT MAX(created_at) FROM TRANSACTIONS t WHERE t.account_id = a.id) AS last_tx
FROM ACCOUNTS a JOIN CUSTOMERS c ON c.id = a.customer_id;
```

## 6. Transferin Kalbi — PL/SQL Paketi

Transfer birden fazla modülün tablosuna dokunduğu için tek bir stored procedure içinde yapılır; `transaction` modülü sadece çağırır. Böylece yarı-tamamlanmış transfer imkânsız hâle gelir ve kilit tutma süresi minimumda kalır.

```sql
CREATE OR REPLACE PACKAGE pkg_transfer AS
  PROCEDURE do_transfer(
    p_from_iban  IN  VARCHAR2,
    p_to_iban    IN  VARCHAR2,
    p_amount     IN  NUMBER,
    p_desc       IN  VARCHAR2,
    p_reference  OUT VARCHAR2
  );
END pkg_transfer;
```

**Prosedürün adımları:**
1. İki hesabı **IBAN sırasına göre** `SELECT ... FOR UPDATE` ile kilitle — sabit sıra deadlock'u önler (A→B ve B→A aynı anda çalışırsa)
2. Hesaplar `ACTIVE` mi, aynı hesap değil mi kontrol et
3. Bakiye yeterli mi → değilse `RAISE_APPLICATION_ERROR(-20001, 'INSUFFICIENT_FUNDS')`
4. Günlük limit: bugünkü `TRANSFER_OUT` toplamı + tutar > `daily_limit` → `-20002, 'DAILY_LIMIT_EXCEEDED'`
5. Para birimi farklıysa `EXCHANGE_RATES`'ten kur çek, hedef tutarı hesapla
6. `reference_no` üret (`SYS_GUID()`)
7. Gönderen `UPDATE` düş + `TRANSACTIONS` `TRANSFER_OUT` insert
8. Alıcı `UPDATE` ekle + `TRANSACTIONS` `TRANSFER_IN` insert
9. `COMMIT` (ya da hepsi `ROLLBACK`)

Node tarafı `ORA-20001`/`ORA-20002` hata kodlarını HTTP `409` + anlamlı `error` koduna çevirir (`shared/errors/oracleErrorMap.js`).

**Ek nesneler:**
- `fn_generate_iban(p_account_id)` — IBAN üretimi (TR + mod-97)
- `trg_accounts_audit` — `ACCOUNTS` üzerinde AFTER UPDATE trigger, `AUDIT_LOG`'a yazar

## 7. REST API

| Method | Endpoint | Modül | Yetki |
|---|---|---|---|
| POST | `/api/auth/register` | identity | — |
| POST | `/api/auth/login` | identity | — |
| GET | `/api/customers/me` | identity | CUSTOMER |
| POST | `/api/accounts` | account | CUSTOMER |
| GET | `/api/accounts` | account | CUSTOMER |
| GET | `/api/accounts/{iban}` | account | CUSTOMER |
| PATCH | `/api/accounts/{iban}/status` | account | TELLER |
| POST | `/api/transactions/deposit` | transaction | CUSTOMER |
| POST | `/api/transactions/withdraw` | transaction | CUSTOMER |
| POST | `/api/transactions/transfer` | transaction | CUSTOMER |
| GET | `/api/accounts/{iban}/statement` | transaction | CUSTOMER |
| GET | `/api/rates` | fx | — |
| GET | `/api/audit` | audit | TELLER |

**Hata formatı:**
```json
{ "error": "INSUFFICIENT_FUNDS", "message": "Yetersiz bakiye", "status": 409 }
```

Hata kodları: `INSUFFICIENT_FUNDS`, `DAILY_LIMIT_EXCEEDED`, `ACCOUNT_NOT_ACTIVE`, `ACCOUNT_NOT_FOUND`, `SAME_ACCOUNT`, `INVALID_AMOUNT`, `UNAUTHORIZED`, `FORBIDDEN`

Dokümantasyon: `swagger-ui-express` + elle yazılmış `openapi.yaml` → `/api-docs`

## 8. Güvenlik

Para işlemi olduğu için burada kısma yok:
- Parola `bcrypt` (cost 12)
- JWT: 15 dk access token, `HS256`, secret `.env`'den
- **Sahiplik kontrolü:** her hesap işleminde hesabın JWT'deki `customerId`'ye ait olduğu DB'den doğrulanır (`account.assertOwnership`) — IBAN'ı bilmek yetmez
- Tutar doğrulama: pozitif, en fazla 2 ondalık, üst sınır kontrolü (`express-validator`)
- **Tüm SQL bind değişkenli** (`:iban`) — string birleştirme yok
- `helmet`, `express-rate-limit` (transfer endpoint'ine ayrı ve sıkı limit)
- Log'a parola, token veya tam IBAN yazılmaz (IBAN maskelenir)

## 9. Proje Yapısı

```
src/
├── app.js                    # express, middleware zinciri, modül router'larını mount eder
├── server.js                 # pool init + listen + graceful shutdown
├── modules/
│   ├── identity/   index.js · routes · controller · service · repository · schema
│   ├── account/    (aynı yapı)
│   ├── transaction/(aynı yapı)
│   ├── fx/         (aynı yapı)
│   └── audit/      (aynı yapı)
├── shared/
│   ├── db/pool.js            # oracledb createPool
│   ├── db/withTransaction.js # conn al → fn çağır → commit/rollback → close
│   ├── errors/               # AppError, oracleErrorMap
│   ├── middleware/           # auth.js (JWT), errorHandler.js, validate.js
│   └── config/env.js         # .env doğrulama, eksikse süreç başlamaz
└── db/
    ├── 01_schema.sql         # tablo, sequence, index
    ├── 02_views.sql
    ├── 03_packages.sql       # pkg_transfer, fn_generate_iban
    ├── 04_triggers.sql
    └── 05_seed.sql           # demo müşteri + kurlar
```

`db/*.sql` dosyaları Oracle container'ının `/container-entrypoint-initdb.d` klasörüne bağlanır, ilk açılışta sırayla çalışır.

**Sınır ihlali koruması:** `eslint-plugin-import` ile `no-restricted-paths` kuralı — `modules/*/` içinden başka bir modülün `index.js` dışındaki dosyasına import yasak. `npm run lint` bunu CI olmadan da yakalar. (Bu, README'de gösterilecek küçük ama etkileyici bir detay.)

## 10. Docker

| Servis | Image | Port | Not |
|---|---|---|---|
| `oracle` | `gvenzl/oracle-xe:21-slim` | 1521 | healthcheck ile hazır olması beklenir; init SQL'leri mount edilir |
| `api` | `node:20-alpine` tabanlı Dockerfile | 3000 | `depends_on: oracle (service_healthy)` |

Oracle ilk açılışta 1–2 dakika sürer — README'de belirt.
`.env.example`: `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING`, `JWT_SECRET`, `PORT`

## 11. Test

- `npm test` → Jest
- `transaction.service` birim testleri (repository mock'lu): yetersiz bakiye, limit aşımı, aynı hesap, negatif tutar
- `account.service`: sahiplik ihlali → `FORBIDDEN`
- Entegrasyon testi: gerçek Oracle container'a karşı transfer → iki hesabın bakiye toplamı değişmemeli
- **Eşzamanlılık testi:** bakiyesi 100 olan hesaptan aynı anda 10 paralel 20'lik transfer → tam 5'i başarılı, bakiye asla negatif olmaz. `FOR UPDATE` kilidinin kanıtı; README'de çıktısını göster.
- **Mimari testi:** `npm run lint` ile modül sınırı ihlali sıfır olmalı.

## 12. Yol Haritası

| Hafta | İş |
|---|---|
| 1 | Docker + Oracle XE ayağa kalkması, şema/sequence/index, shared kernel (pool, withTransaction, errorHandler), `identity` modülü (register/login/JWT) |
| 2 | `account` modülü + sahiplik kontrolü, `transaction`: deposit/withdraw, ekstre + sayfalama, `pkg_transfer` ve transfer endpoint'i |
| 3 | `fx` (kur dönüşümü) + limit, `audit` (trigger), eslint sınır kuralı, Swagger, testler, README |

## 13. README'de Bulunması Gerekenler

1. Bir cümlelik ne olduğu + mimari şeması
2. `docker compose up` → `localhost:3000/api-docs`, demo kullanıcı bilgileri
3. **"Neden modular monolith?"** — tek transaction'ın para işleminde neden doğru karar olduğu, mikroservis olsaydı saga gerekeceği. 4 cümle. EventTix repo'suna link ver: *"Aynı problemi mikroservis olarak çözdüğüm proje: …"*
4. **"Modül sınırları"** — bağımlılık diyagramı + 5 kural + eslint kuralının kod bloğu
5. **"Neden ORM yok?"** — transaction kontrolü, `FOR UPDATE`, PL/SQL. 3 cümle.
6. `pkg_transfer.do_transfer` kodunun README'ye gömülmüş hâli + adım adım açıklama. Projenin vitrini burası.
7. Eşzamanlılık testinin çıktısı (terminal ekran görüntüsü)
8. Postman collection dosyası (`docs/CoreBank.postman_collection.json`)
