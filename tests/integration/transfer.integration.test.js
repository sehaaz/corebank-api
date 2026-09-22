const h = require('./helpers');

const request = require('supertest');
const app = require('../../src/app');

jest.setTimeout(120000);

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

  sender = await h.createAccount(conn, customerId, 'TRY', 1000);
  receiver = await h.createAccount(conn, otherId, 'TRY', 500);
  accountIds.push(sender.id, receiver.id);
  await conn.commit();

  token = h.tokenFor(customerId);
});

afterAll(async () => {
  await h.cleanup(conn, { accountIds, customerIds });
  await conn.close();
  await h.closePool();
});

function transfer(amount) {
  return request(app)
    .post('/api/transactions/transfer')
    .set('Authorization', `Bearer ${token}`)
    .send({ fromIban: sender.iban, toIban: receiver.iban, amount, description: 'integration' });
}

test('the sum of both balances is unchanged after a successful transfer', async () => {
  const before = (await h.balanceOf(conn, sender.iban)) + (await h.balanceOf(conn, receiver.iban));

  const res = await transfer(250);
  expect(res.status).toBe(201);

  const afterSender = await h.balanceOf(conn, sender.iban);
  const afterReceiver = await h.balanceOf(conn, receiver.iban);

  expect(afterSender).toBe(750);
  expect(afterReceiver).toBe(750);
  expect(afterSender + afterReceiver).toBe(before);
});

test('both accounts get one row sharing the same reference_no', async () => {
  const res = await transfer(100);
  expect(res.status).toBe(201);
  const ref = res.body.referenceNo;
  expect(ref).toMatch(/^[0-9A-F]{32}$/);

  const senderTxs = await h.transactionsOf(conn, sender.id);
  const receiverTxs = await h.transactionsOf(conn, receiver.id);

  const out = senderTxs.filter((t) => t.referenceNo === ref);
  const incoming = receiverTxs.filter((t) => t.referenceNo === ref);

  expect(out).toHaveLength(1);
  expect(incoming).toHaveLength(1);
  expect(out[0].type).toBe('TRANSFER_OUT');
  expect(incoming[0].type).toBe('TRANSFER_IN');
  expect(out[0].amount).toBe(100);
  expect(incoming[0].amount).toBe(100);
  expect(out[0].balanceAfter).toBe(await h.balanceOf(conn, sender.iban));
  expect(incoming[0].balanceAfter).toBe(await h.balanceOf(conn, receiver.iban));
});

test('returns 409 on insufficient funds and leaves every balance unchanged', async () => {
  const senderBefore = await h.balanceOf(conn, sender.iban);
  const receiverBefore = await h.balanceOf(conn, receiver.iban);
  const txCountBefore = (await h.transactionsOf(conn, sender.id)).length;

  const res = await transfer(senderBefore + 1);

  expect(res.status).toBe(409);
  expect(res.body.error).toBe('INSUFFICIENT_FUNDS');

  expect(await h.balanceOf(conn, sender.iban)).toBe(senderBefore);
  expect(await h.balanceOf(conn, receiver.iban)).toBe(receiverBefore);
  expect((await h.transactionsOf(conn, sender.id)).length).toBe(txCountBefore);
});
