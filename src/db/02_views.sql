-- Bu dosya container tarafından CDB$ROOT'ta "sqlplus / as sysdba" ile
-- çalıştırılır (gvenzl entrypoint). Objelerin SYS yerine uygulama şemasında
-- oluşması için önce doğru PDB'ye ve şemaya geçilir.
-- COREBANK, .env'deki DB_USER ile aynı olmalıdır.
ALTER SESSION SET CONTAINER = XEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = COREBANK;

-- account modülünün okuduğu özet view'ı (mimari bölüm 5)
-- customer_id, müşterinin kendi hesaplarını filtreleyebilmek için eklendi.
CREATE OR REPLACE VIEW V_ACCOUNT_SUMMARY AS
SELECT a.id, a.customer_id, a.iban, a.currency, a.balance, c.full_name,
       (SELECT COUNT(*)        FROM TRANSACTIONS t WHERE t.account_id = a.id) AS tx_count,
       (SELECT MAX(created_at) FROM TRANSACTIONS t WHERE t.account_id = a.id) AS last_tx
FROM ACCOUNTS a JOIN CUSTOMERS c ON c.id = a.customer_id;
