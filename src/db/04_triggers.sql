-- The container runs this file as "sqlplus / as sysdba" against CDB$ROOT
-- (gvenzl entrypoint). Switch to the right PDB and schema first, otherwise the
-- objects would be created under SYS instead of the application schema.
-- COREBANK must match DB_USER in .env.
ALTER SESSION SET CONTAINER = XEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = COREBANK;

-- =====================================================================
-- CoreBank - triggers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- trg_accounts_audit - records balance and status changes on ACCOUNTS
-- into AUDIT_LOG.
--
-- The WHEN clause makes the trigger fire only when balance or status actually
-- changes; updating a field such as daily_limit, or rewriting the same value,
-- produces no log row.
--
-- Note: balance and status are NOT NULL, so the <> comparison is safe and no
-- extra NULL handling is required.
-- ---------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_accounts_audit
  AFTER UPDATE ON ACCOUNTS
  FOR EACH ROW
  WHEN (OLD.balance <> NEW.balance OR OLD.status <> NEW.status)
DECLARE
  -- The decimal separator must be a dot regardless of the NLS settings,
  -- otherwise the generated text would not be valid JSON (e.g. 1234,56).
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
