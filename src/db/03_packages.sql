-- Bu dosya container tarafından CDB$ROOT'ta "sqlplus / as sysdba" ile
-- çalıştırılır (gvenzl entrypoint). Objelerin SYS yerine uygulama şemasında
-- oluşması için önce doğru PDB'ye ve şemaya geçilir.
-- COREBANK, .env'deki DB_USER ile aynı olmalıdır.
ALTER SESSION SET CONTAINER = XEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = COREBANK;

-- =====================================================================
-- CoreBank — PL/SQL nesneleri (mimari bölüm 6)
-- Transfer tek bir stored procedure içinde yapılır: yarı tamamlanmış
-- transfer imkânsızdır ve kilit tutma süresi minimumda kalır.
-- =====================================================================

-- ---------------------------------------------------------------------
-- fn_generate_iban — hesap id'sinden TR IBAN üretir (mod-97 kontrol hanesi)
--
-- TR IBAN yapısı (26 karakter):
--   TR | 2 kontrol hanesi | 5 banka kodu | 1 rezerv | 16 hesap numarası
--
-- Kontrol hanesi ISO 13616'ya göre hesaplanır:
--   1. BBAN'ın sonuna ülke kodu + '00' eklenir  -> "<bban>TR00"
--   2. Harfler sayıya çevrilir (A=10 ... R=27, T=29)
--   3. Oluşan sayının 97'ye bölümünden kalan bulunur
--   4. Kontrol hanesi = 98 - kalan
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
  -- BBAN: banka kodu + rezerv + 16 haneye sola sıfır doldurulmuş hesap no
  v_bban := c_bank_code || c_reserved || LPAD(TO_CHAR(p_account_id), 16, '0');

  -- Sona 'TR00' eklenir. T=29, R=27 olduğundan doğrudan '2927' || '00' yazılır.
  -- Sonuç 28 hane; Oracle NUMBER 38 basamağa kadar tam sayıyı kayıpsız tutar,
  -- bu yüzden parçalı mod hesabına gerek yok.
  v_rearranged := v_bban || '2927' || '00';

  v_remainder := MOD(TO_NUMBER(v_rearranged), 97);
  v_check     := 98 - v_remainder;

  RETURN c_country || LPAD(TO_CHAR(v_check), 2, '0') || v_bban;
END fn_generate_iban;
/

-- ---------------------------------------------------------------------
-- pkg_transfer — hesaplar arası para transferi
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
    -- 1) İki hesabı IBAN'ın alfabetik sırasına göre FOR UPDATE ile kilitle.
    --
    -- Kilitler HER ZAMAN küçük IBAN'dan büyük IBAN'a doğru alınır.
    -- A->B ve B->A transferleri aynı anda çalışsa bile ikisi de kilitleri
    -- aynı sırayla istediği için karşılıklı bekleme (deadlock) oluşamaz.
    -- Sıranın hesabın rolüne (gönderen/alıcı) göre DEĞİL, sabit bir
    -- kritere göre belirlenmesi kritik nokta budur.
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
    -- 2) Aynı hesap mı, ikisi de ACTIVE mi?
    --------------------------------------------------------------------
    IF v_from_id = v_to_id THEN
      RAISE_APPLICATION_ERROR(-20003, 'SAME_ACCOUNT');
    END IF;

    IF v_from_status <> 'ACTIVE' OR v_to_status <> 'ACTIVE' THEN
      RAISE_APPLICATION_ERROR(-20004, 'ACCOUNT_NOT_ACTIVE');
    END IF;

    --------------------------------------------------------------------
    -- 3) Bakiye yeterli mi?
    -- chk_balance constraint'i son savunma hattı; asıl kontrol burada.
    --------------------------------------------------------------------
    IF v_from_balance < p_amount THEN
      RAISE_APPLICATION_ERROR(-20001, 'INSUFFICIENT_FUNDS');
    END IF;

    --------------------------------------------------------------------
    -- 4) Günlük transfer limiti.
    -- Bugünkü TRANSFER_OUT toplamı gönderen hesabın kendi para biriminde
    -- tutulur; daily_limit de aynı para biriminde tanımlıdır.
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
    -- 5) Para birimi dönüşümü.
    -- Gönderenden p_amount düşer, alıcıya kurla çevrilmiş tutar eklenir.
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
    -- 6) Referans numarası.
    -- Transferin iki bacağı da aynı referansı paylaşır; ekstrede
    -- eşleştirmeyi bu sağlar.
    --------------------------------------------------------------------
    p_reference := RAWTOHEX(SYS_GUID());

    --------------------------------------------------------------------
    -- 7) Gönderen: bakiyeyi düş + TRANSFER_OUT kaydı.
    -- RETURNING ile güncel bakiye alınır, ayrıca SELECT atmaya gerek yok.
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
    -- 8) Alıcı: bakiyeyi ekle + TRANSFER_IN kaydı.
    -- Alıcı bacağındaki tutar çevrilmiş tutardır.
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
    -- 9) Hepsi ya da hiçbiri.
    --------------------------------------------------------------------
    COMMIT;

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      -- IBAN'lardan biri yok: adım 1'deki SELECT INTO buraya düşer.
      ROLLBACK;
      RAISE_APPLICATION_ERROR(-20006, 'ACCOUNT_NOT_FOUND');
    WHEN OTHERS THEN
      ROLLBACK;
      RAISE;
  END do_transfer;

END pkg_transfer;
/
