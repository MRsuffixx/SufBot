import { CurrencyCodeSchema, type CurrencyCode } from './contracts.js';

const currencyFractionDigits: Readonly<Record<CurrencyCode, number>> = {
  USD: 2,
  TRY: 2,
  EUR: 2,
  GBP: 2,
  RUB: 2,
};

export const assertMinorAmount = (amountMinor: number): number => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new TypeError('Money must be a positive safe integer in minor currency units.');
  }
  return amountMinor;
};

export const minorAmountToDecimal = (
  amountMinor: number,
  currency: CurrencyCode,
): string => {
  const safeAmount = assertMinorAmount(amountMinor);
  const safeCurrency = CurrencyCodeSchema.parse(currency);
  const digits = currencyFractionDigits[safeCurrency];
  const divisor = 10 ** digits;
  const major = Math.floor(safeAmount / divisor);
  const fraction = String(safeAmount % divisor).padStart(digits, '0');
  return `${major}.${fraction}`;
};

export const formatConfiguredPrice = (
  amountMinor: number,
  currency: CurrencyCode,
  locale = 'en',
): string => {
  const safeAmount = assertMinorAmount(amountMinor);
  const safeCurrency = CurrencyCodeSchema.parse(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: safeCurrency,
  }).format(safeAmount / 10 ** currencyFractionDigits[safeCurrency]);
};
