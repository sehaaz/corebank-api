jest.mock('../src/modules/account/account.repository');

const repo = require('../src/modules/account/account.repository');
const svc = require('../src/modules/account/account.service');

const conn = {}; // the service only forwards conn to the repository

const account = {
  id: 1,
  customerId: 42,
  iban: 'TR330006100519786457841326',
  currency: 'TRY',
  balance: 1000,
  dailyLimit: 50000,
  status: 'ACTIVE',
};

beforeEach(() => jest.resetAllMocks());

describe('assertOwnership', () => {
  test('returns FORBIDDEN (403) when the account belongs to someone else', async () => {
    repo.findByIban.mockResolvedValue(account);

    await expect(svc.assertOwnership(conn, account.iban, 99)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  test('returns the account when the caller owns it', async () => {
    repo.findByIban.mockResolvedValue(account);

    await expect(svc.assertOwnership(conn, account.iban, 42)).resolves.toEqual(account);
  });
});

describe('assertActive', () => {
  test('returns ACCOUNT_NOT_ACTIVE (409) for a frozen account', async () => {
    repo.findByIban.mockResolvedValue({ ...account, status: 'FROZEN' });

    await expect(svc.assertActive(conn, account.iban)).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_NOT_ACTIVE',
    });
  });

  test('returns ACCOUNT_NOT_ACTIVE (409) for a closed account too', async () => {
    repo.findByIban.mockResolvedValue({ ...account, status: 'CLOSED' });

    await expect(svc.assertActive(conn, account.iban)).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_NOT_ACTIVE',
    });
  });
});
