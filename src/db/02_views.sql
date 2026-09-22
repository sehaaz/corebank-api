-- The container runs this file as "sqlplus / as sysdba" against CDB$ROOT
-- (gvenzl entrypoint). Switch to the right PDB and schema first, otherwise the
-- objects would be created under SYS instead of the application schema.
-- COREBANK must match DB_USER in .env.
ALTER SESSION SET CONTAINER = XEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = COREBANK;

-- Account summary view, read by the account module.
-- customer_id is part of the projection so a customer's own accounts can be filtered.
CREATE OR REPLACE VIEW V_ACCOUNT_SUMMARY AS
SELECT a.id, a.customer_id, a.iban, a.currency, a.balance, c.full_name,
       (SELECT COUNT(*)        FROM TRANSACTIONS t WHERE t.account_id = a.id) AS tx_count,
       (SELECT MAX(created_at) FROM TRANSACTIONS t WHERE t.account_id = a.id) AS last_tx
FROM ACCOUNTS a JOIN CUSTOMERS c ON c.id = a.customer_id;
