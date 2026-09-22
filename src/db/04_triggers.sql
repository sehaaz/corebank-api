-- Bu dosya container tarafından CDB$ROOT'ta "sqlplus / as sysdba" ile
-- çalıştırılır (gvenzl entrypoint). Objelerin SYS yerine uygulama şemasında
-- oluşması için önce doğru PDB'ye ve şemaya geçilir.
-- COREBANK, .env'deki DB_USER ile aynı olmalıdır.
ALTER SESSION SET CONTAINER = XEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = COREBANK;

-- =====================================================================
-- CoreBank — trigger'lar (mimari bölüm 6)
-- =====================================================================

-- ---------------------------------------------------------------------
-- trg_accounts_audit — ACCOUNTS üzerindeki para/durum değişikliklerini
-- AUDIT_LOG'a yazar.
--
-- WHEN koşulu sayesinde trigger yalnızca balance veya status gerçekten
-- değiştiğinde çalışır; daily_limit gibi alanların güncellenmesi ya da
-- aynı değerin tekrar yazılması log üretmez.
--
-- Not: balance ve status NOT NULL olduğu için <> karşılaştırması
-- güvenlidir, ayrıca NULL kontrolüne gerek yok.
-- ---------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_accounts_audit
  AFTER UPDATE ON ACCOUNTS
  FOR EACH ROW
  WHEN (OLD.balance <> NEW.balance OR OLD.status <> NEW.status)
DECLARE
  -- Ondalık ayracı NLS ayarından bağımsız olarak nokta olmalı, yoksa
  -- üretilen metin geçerli JSON olmaz (1234,56 gibi).
  c_num_fmt CONSTANT VARCHAR2(30) := 'FM99999999999999990.00';
  c_nls     CONSTANT VARCHAR2(40) := 'NLS_NUMERIC_CHARACTERS = ''.,''';

  v_old CLOB;
  v_new CLOB;
BEGIN
  v_old := '{"balance":' || TO_CHAR(:OLD.balance, c_num_fmt, c_nls)
        || ',"status":"' || :OLD.status || '"}';

  v_new := '{"balance":' || TO_CHAR(:NEW.balance, c_num_fmt, c_nls)
        || ',"status":"' || :NEW.status || '"}';

  INSERT INTO AUDIT_LOG (id, table_name, record_id, action, old_value, new_value)
  VALUES (SEQ_AUDIT_LOG.NEXTVAL, 'ACCOUNTS', :NEW.id, 'UPDATE', v_old, v_new);
END trg_accounts_audit;
/
