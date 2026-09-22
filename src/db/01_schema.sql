-- The container runs this file as "sqlplus / as sysdba" against CDB$ROOT
-- (gvenzl entrypoint). Switch to the right PDB and schema first, otherwise the
-- objects would be created under SYS instead of the application schema.
-- COREBANK must match DB_USER in .env.
ALTER SESSION SET CONTAINER = XEPDB1;
ALTER SESSION SET CURRENT_SCHEMA = COREBANK;

-- CoreBank - tables, sequences and indexes.
-- Table ownership is exclusive: every table belongs to exactly one module.

-- ---------------------------------------------------------------- sequences
CREATE SEQUENCE SEQ_CUSTOMERS    START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE SEQ_ACCOUNTS     START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE SEQ_TRANSACTIONS START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE SEQ_AUDIT_LOG    START WITH 1 INCREMENT BY 1 NOCACHE;

-- ---------------------------------------------------- owned by: identity
CREATE TABLE CUSTOMERS (
  id            NUMBER            PRIMARY KEY,
  national_id   VARCHAR2(11)      NOT NULL,
  full_name     VARCHAR2(100)     NOT NULL,
  email         VARCHAR2(100)     NOT NULL,
  password_hash VARCHAR2(255)     NOT NULL,
  role          VARCHAR2(20)      DEFAULT 'CUSTOMER' NOT NULL,
  created_at    TIMESTAMP         DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT uq_customers_national_id UNIQUE (national_id),
  CONSTRAINT uq_customers_email       UNIQUE (email),
  CONSTRAINT chk_customers_role       CHECK (role IN ('CUSTOMER', 'TELLER'))
);

-- ----------------------------------------------------- owned by: account
CREATE TABLE ACCOUNTS (
  id          NUMBER        PRIMARY KEY,
  customer_id NUMBER        NOT NULL,
  iban        VARCHAR2(26)  NOT NULL,
  currency    VARCHAR2(3)   NOT NULL,
  balance     NUMBER(18,2)  DEFAULT 0 NOT NULL,
  daily_limit NUMBER(18,2)  DEFAULT 50000 NOT NULL,
  status      VARCHAR2(10)  DEFAULT 'ACTIVE' NOT NULL,
  created_at  TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT fk_accounts_customer   FOREIGN KEY (customer_id) REFERENCES CUSTOMERS(id),
  CONSTRAINT uq_accounts_iban       UNIQUE (iban),
  CONSTRAINT chk_accounts_currency  CHECK (currency IN ('TRY', 'USD', 'EUR')),
  CONSTRAINT chk_accounts_status    CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  CONSTRAINT chk_balance            CHECK (balance >= 0)
);

-- ------------------------------------------------- owned by: transaction
CREATE TABLE TRANSACTIONS (
  id            NUMBER        PRIMARY KEY,
  account_id    NUMBER        NOT NULL,
  counter_iban  VARCHAR2(26),
  -- 'TRANSFER_OUT' is 12 characters; VARCHAR2(10) cannot hold the longest value.
  type          VARCHAR2(12)  NOT NULL,
  amount        NUMBER(18,2)  NOT NULL,
  balance_after NUMBER(18,2)  NOT NULL,
  reference_no  VARCHAR2(36)  NOT NULL,  -- both legs of a transfer share one reference
  description   VARCHAR2(200),
  created_at    TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT fk_tx_account FOREIGN KEY (account_id) REFERENCES ACCOUNTS(id),
  CONSTRAINT chk_tx_type   CHECK (type IN ('DEPOSIT', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT')),
  CONSTRAINT chk_tx_amount CHECK (amount > 0)
);

-- ---------------------------------------------------------- owned by: fx
CREATE TABLE EXCHANGE_RATES (
  base_currency   VARCHAR2(3)   NOT NULL,
  target_currency VARCHAR2(3)   NOT NULL,
  rate            NUMBER(12,6)  NOT NULL,
  updated_at      TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_exchange_rates PRIMARY KEY (base_currency, target_currency),
  CONSTRAINT chk_fx_rate       CHECK (rate > 0)
);

-- ------------------------------------------------------- owned by: audit
CREATE TABLE AUDIT_LOG (
  id         NUMBER        PRIMARY KEY,
  table_name VARCHAR2(30)  NOT NULL,
  record_id  NUMBER,
  action     VARCHAR2(10)  NOT NULL,
  old_value  CLOB,
  new_value  CLOB,
  created_at TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

-- -------------------------------------------------------------- indexes
CREATE INDEX idx_tx_account_date  ON TRANSACTIONS(account_id, created_at DESC);
CREATE INDEX idx_accounts_customer ON ACCOUNTS(customer_id);
