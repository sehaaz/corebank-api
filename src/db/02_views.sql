-- account modülünün okuduğu özet view'ı (mimari bölüm 5)
CREATE OR REPLACE VIEW V_ACCOUNT_SUMMARY AS
SELECT a.id, a.iban, a.currency, a.balance, c.full_name,
       (SELECT COUNT(*)        FROM TRANSACTIONS t WHERE t.account_id = a.id) AS tx_count,
       (SELECT MAX(created_at) FROM TRANSACTIONS t WHERE t.account_id = a.id) AS last_tx
FROM ACCOUNTS a JOIN CUSTOMERS c ON c.id = a.customer_id;
