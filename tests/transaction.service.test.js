jest.mock('../src/modules/transaction/transaction.repository');
jest.mock('../src/modules/account');

const repo = require('../src/modules/transaction/transaction.repository');
const account = require('../src/modules/account');
const svc = require('../src/modules/transaction/transaction.service');
const AppError = require('../src/shared/errors/AppError');

const conn = {};
const IBAN = 'TR330006100519786457841326';
const acc = { id: 1, customerId: 42, iban: IBAN, currency: 'TRY', balance: 100, status: 'ACTIVE' };

function base(overrides) {
  return { iban: IBAN, amount: 50, description: 'test', customerId: 42, ...overrides };
}

beforeEach(() => {
  jest.resetAllMocks();
  account.assertOwnership.mockResolvedValue(acc);
  account.assertActive.mockResolvedValue(acc);
  account.adjustBalance.mockResolvedValue(150);
  repo.insert.mockResolvedValue({ id: 9, createdAt: new Date() });
});

describe('tutar doğrulaması', () => {
  test('negatif tutar INVALID_AMOUNT (400)', async () => {
    await expect(svc.deposit(conn, base({ amount: -10 }))).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_AMOUNT',
    });
    expect(account.adjustBalance).not.toHaveBeenCalled();
  });

  test('sıfır tutar INVALID_AMOUNT (400)', async () => {
    await expect(svc.deposit(conn, base({ amount: 0 }))).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_AMOUNT',
    });
  });

  test('3 ondalıklı tutar INVALID_AMOUNT (400)', async () => {
    await expect(svc.deposit(conn, base({ amount: 10.123 }))).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_AMOUNT',
    });
    expect(repo.insert).not.toHaveBeenCalled();
  });

  test('2 ondalıklı tutar kabul edilir', async () => {
    await expect(svc.deposit(conn, base({ amount: 10.12 }))).resolves.toMatchObject({ id: 9 });
  });
});

describe('withdraw', () => {
  test('yetersiz bakiyede INSUFFICIENT_FUNDS (409), bakiyeye dokunulmaz', async () => {
    await expect(svc.withdraw(conn, base({ amount: 500 }))).rejects.toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_FUNDS',
    });
    expect(account.adjustBalance).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  test('bakiyeyi eksi yönde günceller ve kaydı yazar', async () => {
    account.adjustBalance.mockResolvedValue(50);

    const result = await svc.withdraw(conn, base({ amount: 50 }));

    expect(account.adjustBalance).toHaveBeenCalledWith(conn, IBAN, -50);
    expect(repo.insert).toHaveBeenCalledWith(
      conn,
      expect.objectContaining({ accountId: 1, type: 'WITHDRAW', amount: 50, balanceAfter: 50 })
    );
    expect(result.referenceNo).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('sahiplik', () => {
  test('başkasının hesabında FORBIDDEN (403)', async () => {
    account.assertOwnership.mockRejectedValue(new AppError(403, 'FORBIDDEN', 'Bu hesap size ait değil'));

    await expect(svc.deposit(conn, base({ customerId: 99 }))).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(account.adjustBalance).not.toHaveBeenCalled();
  });

  test('ekstrede de sahiplik kontrol edilir', async () => {
    account.assertOwnership.mockRejectedValue(new AppError(403, 'FORBIDDEN', 'Bu hesap size ait değil'));

    await expect(
      svc.statement(conn, { iban: IBAN, customerId: 99, from: null, to: null, page: 1, size: 20 })
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(repo.findByAccount).not.toHaveBeenCalled();
  });
});

describe('deposit — donmuş hesap', () => {
  test('ACCOUNT_NOT_ACTIVE (409)', async () => {
    account.assertActive.mockRejectedValue(
      new AppError(409, 'ACCOUNT_NOT_ACTIVE', 'Hesap işleme kapalı')
    );

    await expect(svc.deposit(conn, base())).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_NOT_ACTIVE',
    });
    expect(account.adjustBalance).not.toHaveBeenCalled();
  });
});
