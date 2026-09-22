jest.mock('../src/modules/account/account.repository');

const repo = require('../src/modules/account/account.repository');
const svc = require('../src/modules/account/account.service');

const conn = {}; // servis conn'u yalnızca repository'ye geçirir

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
  test('hesap başkasına aitse FORBIDDEN (403)', async () => {
    repo.findByIban.mockResolvedValue(account);

    await expect(svc.assertOwnership(conn, account.iban, 99)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  test('sahibi ise hesabı döner', async () => {
    repo.findByIban.mockResolvedValue(account);

    await expect(svc.assertOwnership(conn, account.iban, 42)).resolves.toEqual(account);
  });
});

describe('assertActive', () => {
  test('donmuş hesapta ACCOUNT_NOT_ACTIVE (409)', async () => {
    repo.findByIban.mockResolvedValue({ ...account, status: 'FROZEN' });

    await expect(svc.assertActive(conn, account.iban)).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_NOT_ACTIVE',
    });
  });

  test('kapalı hesapta da ACCOUNT_NOT_ACTIVE (409)', async () => {
    repo.findByIban.mockResolvedValue({ ...account, status: 'CLOSED' });

    await expect(svc.assertActive(conn, account.iban)).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_NOT_ACTIVE',
    });
  });
});
