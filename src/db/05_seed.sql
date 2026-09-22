-- Bu dosya container tarafından CDB$ROOT'ta "sqlplus / as sysdba" ile
-- çalıştırılır (gvenzl entrypoint). Objelerin SYS yerine uygulama şemasında
-- oluşması için önce doğru PDB'ye ve şemaya geçilir.
-- COREBANK, .env'deki DB_USER ile aynı olmalıdır.
ALTER SESSION SET CONTAINER = XEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = COREBANK;

-- Demo veri: 3 müşteri (biri TELLER), hesapları ve çapraz kurlar.
-- Parolalar bcrypt cost 12. Demo şifreleri:
--   ayse@corebank.test  / Demo1234!
--   mehmet@corebank.test / Demo1234!
--   teller@corebank.test / Teller1234!

-- ------------------------------------------------------------------ müşteriler
INSERT INTO CUSTOMERS (id, national_id, full_name, email, password_hash, role) VALUES
  (SEQ_CUSTOMERS.NEXTVAL, '10000000001', 'Ayşe Yılmaz', 'ayse@corebank.test',
   '$2b$12$qVnYjgYiZftJkXyH5wk01.8dVx3Naf0IAD9ZZFaNYHIGe.d6Banda', 'CUSTOMER');

INSERT INTO CUSTOMERS (id, national_id, full_name, email, password_hash, role) VALUES
  (SEQ_CUSTOMERS.NEXTVAL, '10000000002', 'Mehmet Demir', 'mehmet@corebank.test',
   '$2b$12$qVnYjgYiZftJkXyH5wk01.8dVx3Naf0IAD9ZZFaNYHIGe.d6Banda', 'CUSTOMER');

INSERT INTO CUSTOMERS (id, national_id, full_name, email, password_hash, role) VALUES
  (SEQ_CUSTOMERS.NEXTVAL, '10000000003', 'Zeynep Kaya', 'teller@corebank.test',
   '$2b$12$ixB.fAAFURuKbKmSmxpEQ.h83s0gcT6/hSyRvlpewyM0UEFtAefpu', 'TELLER');

-- --------------------------------------------------------------------- hesaplar
INSERT INTO ACCOUNTS (id, customer_id, iban, currency, balance) VALUES
  (SEQ_ACCOUNTS.NEXTVAL, (SELECT id FROM CUSTOMERS WHERE email = 'ayse@corebank.test'),
   'TR330006100519786457841326', 'TRY', 25000.00);

INSERT INTO ACCOUNTS (id, customer_id, iban, currency, balance) VALUES
  (SEQ_ACCOUNTS.NEXTVAL, (SELECT id FROM CUSTOMERS WHERE email = 'ayse@corebank.test'),
   'TR060006100519786457841327', 'USD', 1200.00);

INSERT INTO ACCOUNTS (id, customer_id, iban, currency, balance) VALUES
  (SEQ_ACCOUNTS.NEXTVAL, (SELECT id FROM CUSTOMERS WHERE email = 'mehmet@corebank.test'),
   'TR230006200119786457841001', 'TRY', 8500.00);

INSERT INTO ACCOUNTS (id, customer_id, iban, currency, balance) VALUES
  (SEQ_ACCOUNTS.NEXTVAL, (SELECT id FROM CUSTOMERS WHERE email = 'mehmet@corebank.test'),
   'TR840001000219786457845512', 'EUR', 640.00);

INSERT INTO ACCOUNTS (id, customer_id, iban, currency, balance) VALUES
  (SEQ_ACCOUNTS.NEXTVAL, (SELECT id FROM CUSTOMERS WHERE email = 'teller@corebank.test'),
   'TR570001000219786457845513', 'TRY', 0.00);

-- ------------------------------------------------------------------ kur tablosu
INSERT INTO EXCHANGE_RATES (base_currency, target_currency, rate) VALUES ('USD', 'TRY', 41.500000);
INSERT INTO EXCHANGE_RATES (base_currency, target_currency, rate) VALUES ('TRY', 'USD', 0.024096);
INSERT INTO EXCHANGE_RATES (base_currency, target_currency, rate) VALUES ('EUR', 'TRY', 48.700000);
INSERT INTO EXCHANGE_RATES (base_currency, target_currency, rate) VALUES ('TRY', 'EUR', 0.020534);
INSERT INTO EXCHANGE_RATES (base_currency, target_currency, rate) VALUES ('USD', 'EUR', 0.852156);
INSERT INTO EXCHANGE_RATES (base_currency, target_currency, rate) VALUES ('EUR', 'USD', 1.173500);

COMMIT;
