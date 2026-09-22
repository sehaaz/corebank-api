// CRITICAL TEST - proof of the SELECT ... FOR UPDATE lock inside pkg_transfer.
// Ten transfers of 20 are fired concurrently against an account holding 100.
// Without the lock every request would read "balance is sufficient", all ten
// would succeed and the balance would end up at -100.
const h = require('./helpers');

const request = require('supertest');
const app = require('../../src/app');

jest.setTimeout(180000);

const PARALLEL = 10;
const AMOUNT = 20;
const START_BALANCE = 100;
const EXPECTED_OK = START_BALANCE / AMOUNT;

let conn;
const accountIds = [];
const customerIds = [];

let sender;
let receiver;
let token;

beforeAll(async () => {
  await h.initPool();
  conn = await h.getConnection();

  const customerId = await h.createCustomer(conn);
  const otherId = await h.createCustomer(conn);
  customerIds.push(customerId, otherId);

  sender = await h.createAccount(conn, customerId, 'TRY', START_BALANCE);
  receiver = await h.createAccount(conn, otherId, 'TRY', 0);
  accountIds.push(sender.id, receiver.id);
  await conn.commit();

  token = h.tokenFor(customerId);
});

afterAll(async () => {
  await h.cleanup(conn, { accountIds, customerIds });
  await conn.close();
  await h.closePool();
});

test(`exactly ${EXPECTED_OK} of ${PARALLEL} concurrent transfers succeed and the balance never goes negative`, async () => {
  const responses = await Promise.all(
    Array.from({ length: PARALLEL }, () =>
      request(app)
        .post('/api/transactions/transfer')
        .set('Authorization', `Bearer ${token}`)
        .send({ fromIban: sender.iban, toIban: receiver.iban, amount: AMOUNT })
    )
  );

  const created = responses.filter((r) => r.status === 201);
  const rejected = responses.filter((r) => r.status === 409);
  const other = responses.filter((r) => r.status !== 201 && r.status !== 409);

  const senderBalance = await h.balanceOf(conn, sender.iban);
  const receiverBalance = await h.balanceOf(conn, receiver.iban);
  const senderTxs = await h.transactionsOf(conn, sender.id);
  const references = new Set(created.map((r) => r.body.referenceNo));

  /* eslint-disable no-console */
  console.log(`
==========================================================
  CONCURRENCY TEST - SELECT ... FOR UPDATE PROOF
==========================================================
  Sender account       : ${sender.iban}
  Opening balance      : ${START_BALANCE}
  Concurrent requests  : ${PARALLEL} x ${AMOUNT} units  (total ${PARALLEL * AMOUNT})
----------------------------------------------------------
  201 Created          : ${created.length}   (expected ${EXPECTED_OK})
  409 INSUFFICIENT     : ${rejected.length}   (expected ${PARALLEL - EXPECTED_OK})
  Unexpected status    : ${other.length}   ${other.map((r) => r.status).join(',')}
----------------------------------------------------------
  Sender balance       : ${senderBalance}   (expected 0)
  Receiver balance     : ${receiverBalance}   (expected ${START_BALANCE})
  Total money          : ${senderBalance + receiverBalance}   (expected ${START_BALANCE})
  TRANSFER_OUT rows    : ${senderTxs.length}   (expected ${EXPECTED_OK})
  Distinct references  : ${references.size}   (expected ${EXPECTED_OK})
  Negative balance     : ${senderBalance < 0 ? 'YES - FAILURE' : 'none'}
==========================================================
`);
  /* eslint-enable no-console */

  expect(other).toHaveLength(0);
  expect(created).toHaveLength(EXPECTED_OK);
  expect(rejected).toHaveLength(PARALLEL - EXPECTED_OK);
  rejected.forEach((r) => expect(r.body.error).toBe('INSUFFICIENT_FUNDS'));

  expect(senderBalance).toBe(0);
  expect(receiverBalance).toBe(START_BALANCE);
  expect(senderBalance).toBeGreaterThanOrEqual(0);
  expect(senderTxs).toHaveLength(EXPECTED_OK);
  expect(references.size).toBe(EXPECTED_OK);
});
