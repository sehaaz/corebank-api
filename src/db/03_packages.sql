-- The container runs this file as "sqlplus / as sysdba" against CDB$ROOT
-- (gvenzl entrypoint). Switch to the right PDB and schema first, otherwise the
-- objects would be created under SYS instead of the application schema.
-- COREBANK must match DB_USER in .env.
ALTER SESSION SET CONTAINER = XEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = COREBANK;

-- =====================================================================
-- CoreBank - PL/SQL objects.
-- A transfer runs entirely inside one stored procedure: a half-applied
-- transfer is impossible and locks are held for the shortest time possible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- fn_generate_iban - builds a TR IBAN from an account id (mod-97 check digits)
--
-- TR IBAN layout (26 characters):
--   TR | 2 check digits | 5 bank code | 1 reserved | 16 account number
--
-- The check digits follow ISO 13616:
--   1. Append the country code + '00' to the BBAN  -> "<bban>TR00"
--   2. Replace letters with numbers (A=10 ... R=27, T=29)
--   3. Take the remainder of that number modulo 97
--   4. Check digits = 98 - remainder
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generate_iban(p_account_id IN NUMBER)
  RETURN VARCHAR2
IS
  c_country   CONSTANT VARCHAR2(2) := 'TR';
  c_bank_code CONSTANT VARCHAR2(5) := '00061';
  c_reserved  CONSTANT VARCHAR2(1) := '0';

  v_bban       VARCHAR2(22);
  v_rearranged VARCHAR2(28);
  v_remainder  NUMBER;
  v_check      NUMBER;
BEGIN
  -- BBAN: bank code + reserved digit + account number left-padded to 16 digits
  v_bban := c_bank_code || c_reserved || LPAD(TO_CHAR(p_account_id), 16, '0');

  -- 'TR00' is appended. T=29 and R=27, so '2927' || '00' is written directly.
  -- The result is 28 digits; Oracle NUMBER holds integers up to 38 digits
  -- exactly, so no chunked modulo arithmetic is needed.
  v_rearranged := v_bban || '2927' || '00';

  v_remainder := MOD(TO_NUMBER(v_rearranged), 97);
  v_check     := 98 - v_remainder;

  RETURN c_country || LPAD(TO_CHAR(v_check), 2, '0') || v_bban;
END fn_generate_iban;
/

-- ---------------------------------------------------------------------
-- pkg_transfer - money transfer between accounts
-- ---------------------------------------------------------------------
CREATE OR REPLACE PACKAGE pkg_transfer AS
  PROCEDURE do_transfer(
    p_from_iban IN  VARCHAR2,
    p_to_iban   IN  VARCHAR2,
    p_amount    IN  NUMBER,
    p_desc      IN  VARCHAR2,
    p_reference OUT VARCHAR2
  );
END pkg_transfer;
/

CREATE OR REPLACE PACKAGE BODY pkg_transfer AS

  PROCEDURE do_transfer(
    p_from_iban IN  VARCHAR2,
    p_to_iban   IN  VARCHAR2,
    p_amount    IN  NUMBER,
    p_desc      IN  VARCHAR2,
    p_reference OUT VARCHAR2
  )
  IS
    v_from_id       ACCOUNTS.id%TYPE;
    v_from_balance  ACCOUNTS.balance%TYPE;
    v_from_currency ACCOUNTS.currency%TYPE;
    v_from_status   ACCOUNTS.status%TYPE;
    v_from_limit    ACCOUNTS.daily_limit%TYPE;

    v_to_id         ACCOUNTS.id%TYPE;
    v_to_balance    ACCOUNTS.balance%TYPE;
    v_to_currency   ACCOUNTS.currency%TYPE;
    v_to_status     ACCOUNTS.status%TYPE;

    v_today_out     NUMBER;
    v_rate          EXCHANGE_RATES.rate%TYPE;
    v_credit_amount NUMBER;
  BEGIN
    --------------------------------------------------------------------
    -- 1) Lock both accounts with FOR UPDATE, in alphabetical IBAN order.
    --
    -- Locks are ALWAYS taken from the lower IBAN to the higher one. Even when
    -- A->B and B->A run at the same time, both request the locks in the same
    -- order, so they can never wait on each other (no deadlock).
    -- The decisive point is that the order comes from a fixed criterion, NOT
    -- from the role of the account (sender/receiver).
    --------------------------------------------------------------------
    IF p_from_iban < p_to_iban THEN
      SELECT id, balance, currency, status, daily_limit
        INTO v_from_id, v_from_balance, v_from_currency, v_from_status, v_from_limit
        FROM ACCOUNTS WHERE iban = p_from_iban FOR UPDATE;

      SELECT id, balance, currency, status
        INTO v_to_id, v_to_balance, v_to_currency, v_to_status
        FROM ACCOUNTS WHERE iban = p_to_iban FOR UPDATE;
    ELSE
      SELECT id, balance, currency, status
        INTO v_to_id, v_to_balance, v_to_currency, v_to_status
        FROM ACCOUNTS WHERE iban = p_to_iban FOR UPDATE;

      SELECT id, balance, currency, status, daily_limit
        INTO v_from_id, v_from_balance, v_from_currency, v_from_status, v_from_limit
        FROM ACCOUNTS WHERE iban = p_from_iban FOR UPDATE;
    END IF;

    --------------------------------------------------------------------
    -- 2) Reject a self-transfer, and require both accounts to be ACTIVE.
    --------------------------------------------------------------------
    IF v_from_id = v_to_id THEN
      RAISE_APPLICATION_ERROR(-20003, 'SAME_ACCOUNT');
    END IF;

    IF v_from_status <> 'ACTIVE' OR v_to_status <> 'ACTIVE' THEN
      RAISE_APPLICATION_ERROR(-20004, 'ACCOUNT_NOT_ACTIVE');
    END IF;

    --------------------------------------------------------------------
    -- 3) Is the balance sufficient?
    -- The chk_balance constraint is the last line of defence; this is the real check.
    --------------------------------------------------------------------
    IF v_from_balance < p_amount THEN
      RAISE_APPLICATION_ERROR(-20001, 'INSUFFICIENT_FUNDS');
    END IF;

    --------------------------------------------------------------------
    -- 4) Daily transfer limit.
    -- Today's TRANSFER_OUT total is expressed in the sender's own currency,
    -- and daily_limit is defined in that same currency.
    --------------------------------------------------------------------
    SELECT NVL(SUM(amount), 0)
      INTO v_today_out
      FROM TRANSACTIONS
     WHERE account_id = v_from_id
       AND type       = 'TRANSFER_OUT'
       AND created_at >= TRUNC(SYSDATE)
       AND created_at <  TRUNC(SYSDATE) + 1;

    IF v_today_out + p_amount > v_from_limit THEN
      RAISE_APPLICATION_ERROR(-20002, 'DAILY_LIMIT_EXCEEDED');
    END IF;

    --------------------------------------------------------------------
    -- 5) Currency conversion.
    -- p_amount is debited from the sender; the converted amount is credited
    -- to the receiver.
    --------------------------------------------------------------------
    IF v_from_currency = v_to_currency THEN
      v_credit_amount := p_amount;
    ELSE
      BEGIN
        SELECT rate
          INTO v_rate
          FROM EXCHANGE_RATES
         WHERE base_currency   = v_from_currency
           AND target_currency = v_to_currency;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          RAISE_APPLICATION_ERROR(-20005, 'RATE_NOT_FOUND');
      END;

      v_credit_amount := ROUND(p_amount * v_rate, 2);
    END IF;

    --------------------------------------------------------------------
    -- 6) Reference number.
    -- Both legs of the transfer share one reference; that is what ties them
    -- together on a statement.
    --------------------------------------------------------------------
    p_reference := RAWTOHEX(SYS_GUID());

    --------------------------------------------------------------------
    -- 7) Sender: debit the balance and write the TRANSFER_OUT row.
    -- RETURNING hands back the new balance, so no extra SELECT is needed.
    --------------------------------------------------------------------
    UPDATE ACCOUNTS
       SET balance = balance - p_amount
     WHERE id = v_from_id
    RETURNING balance INTO v_from_balance;

    INSERT INTO TRANSACTIONS
      (id, account_id, counter_iban, type, amount, balance_after, reference_no, description)
    VALUES
      (SEQ_TRANSACTIONS.NEXTVAL, v_from_id, p_to_iban, 'TRANSFER_OUT',
       p_amount, v_from_balance, p_reference, p_desc);

    --------------------------------------------------------------------
    -- 8) Receiver: credit the balance and write the TRANSFER_IN row.
    -- The amount on the receiving leg is the converted amount.
    --------------------------------------------------------------------
    UPDATE ACCOUNTS
       SET balance = balance + v_credit_amount
     WHERE id = v_to_id
    RETURNING balance INTO v_to_balance;

    INSERT INTO TRANSACTIONS
      (id, account_id, counter_iban, type, amount, balance_after, reference_no, description)
    VALUES
      (SEQ_TRANSACTIONS.NEXTVAL, v_to_id, p_from_iban, 'TRANSFER_IN',
       v_credit_amount, v_to_balance, p_reference, p_desc);

    --------------------------------------------------------------------
    -- 9) All or nothing.
    --------------------------------------------------------------------
    COMMIT;

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      -- One of the IBANs does not exist: the SELECT INTO in step 1 lands here.
      ROLLBACK;
      RAISE_APPLICATION_ERROR(-20006, 'ACCOUNT_NOT_FOUND');
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END do_transfer;

END pkg_transfer;
/
