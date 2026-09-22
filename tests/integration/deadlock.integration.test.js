// A->B and B->A transfers run at the same time.
// pkg_transfer takes its locks in alphabetical IBAN order rather than by the
// role of the account, so the two directions can never wait on each other and
// ORA-00060 is not expected. Without that fixed order this test would sooner
// or later produce a deadlock.
const h = require('./helpers');

const request = require('supertest');
const app = require('../../src/app');

jest.setTimeout(180000);

const ROUNDS = 20;
const AMOUNT = 1;
const START_BALANCE = 1000;

let conn;
const accountIds = [];
const customerIds = [];

let accountA;
let accountB;
let tokenA;
let tokenB;

beforeAll(async () => {
  await h.initPool();
  conn = await h.getConnection();

  const customerA = await h.createCustomer(conn);
  const customerB = await h.createCustomer(conn);
  customerIds.push(customerA, customerB);

  accountA = await h.createAccount(conn, customerA, 'TRY', START_BALANCE);
  accountB = await h.createAccount(conn, customerB, 'TRY', START_BALANCE);
  accountIds.push(accountA.id, accountB.id);
  await conn.commit();

  tokenA = h.tokenFor(customerA);
  tokenB = h.tokenFor(customerB);
});

afterAll(async () => {
  await h.cleanup(conn, { accountIds, customerIds });
  await conn.close();
  await h.closePool();
});

function send(token, from, to) {
  return request(app)
    .post('/api/transactions/transfer')
    .set('Authorization', `Bearer ${token}`)
    .send({ fromIban: from.iban, toIban: to.iban, amount: AMOUNT });
}

test(`${ROUNDS} concurrent A->B and B->A transfers complete without a deadlock (ORA-00060)`, async () => {
  const calls = [];
  for (let i = 0; i < ROUNDS; i += 1) {
    calls.push(send(tokenA, accountA, accountB));
    calls.push(send(tokenB, accountB, accountA));
  }

  const responses = await Promise.all(calls);

  const created = responses.filter((r) => r.status === 201);
  const failed = responses.filter((r) => r.status !== 201);
  const errorCodes = [...new Set(failed.map((r) => `${r.status} ${r.body && r.body.error}`))];

  const balanceA = await h.balanceOf(conn, accountA.iban);
  const balanceB = await h.balanceOf(conn, accountB.iban);

  /* eslint-disable no-console */
  console.log(`
==========================================================
  DEADLOCK TEST - FIXED LOCK ORDER PROOF
==========================================================
  A: ${accountA.iban}
  B: ${accountB.iban}
  Concurrent requests  : ${ROUNDS} x (A->B)  +  ${ROUNDS} x (B->A)  = ${calls.length}
----------------------------------------------------------
  201 Created          : ${created.length}   (expected ${calls.length})
  Failed               : ${failed.length}   ${errorCodes.join(' | ') || '-'}
  ORA-00060 (deadlock) : ${failed.length === 0 ? 'NONE' : 'investigate'}
----------------------------------------------------------
  A final balance      : ${balanceA}   (expected ${START_BALANCE})
  B final balance      : ${balanceB}   (expected ${START_BALANCE})
  Total money          : ${balanceA + balanceB}   (expected ${2 * START_BALANCE})
==========================================================
`);
  /* eslint-enable no-console */

  // A deadlock (ORA-00060) is not in the error map, so it would surface as 500 INTERNAL_ERROR.
  expect(responses.filter((r) => r.status === 500)).toHaveLength(0);
  expect(failed).toHaveLength(0);
  expect(created).toHaveLength(calls.length);

  // Equal numbers of equal-sized transfers in both directions: balances return to their start.
  expect(balanceA).toBe(START_BALANCE);
  expect(balanceB).toBe(START_BALANCE);
  expect(balanceA + balanceB).toBe(2 * START_BALANCE);
});
