import { BadRequestError } from '../../errors/AppError.js';

export const FX_RATE_SCALE = 1_000_000_000n;
export const FX_RATE_SCALE_NUMBER = Number(FX_RATE_SCALE);

export const parseRateToScaledInteger = (rate) => {
  const value = String(rate);
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(value);
  if (!match) throw new BadRequestError('The exchange rate is invalid.');

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || '').padEnd(9, '0') || '0');
  const scaled = (whole * FX_RATE_SCALE) + fraction;
  if (scaled <= 0n) throw new BadRequestError('The exchange rate is invalid.');
  return scaled;
};

export const convertPaisaToUsdMinor = (feePaisa, rateScaled) => {
  if (!Number.isSafeInteger(feePaisa) || feePaisa <= 0) {
    throw new BadRequestError('The doctor consultation fee is invalid.');
  }

  const numerator = BigInt(feePaisa) * BigInt(rateScaled);
  const rounded = (numerator + (FX_RATE_SCALE / 2n)) / FX_RATE_SCALE;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BadRequestError('The consultation amount exceeds the supported payment limit.');
  }
  return Number(rounded);
};

export const createPricingSnapshot = ({ feePaisa, quote, currency = 'usd' }) => {
  const amountMinor = convertPaisaToUsdMinor(feePaisa, quote.rateScaled);
  if (currency !== 'usd') {
    throw new BadRequestError('Only USD payment amounts are currently supported.');
  }
  if (amountMinor < 50) {
    throw new BadRequestError('The converted consultation fee is below the minimum payable amount.');
  }

  return {
    doctorFeePaisa: feePaisa,
    sourceCurrency: 'pkr',
    fxProvider: quote.provider,
    fxRateScaled: String(quote.rateScaled),
    fxRateScale: FX_RATE_SCALE_NUMBER,
    fxQuotedAt: quote.quotedAt,
    fxValidUntil: quote.validUntil,
    currency,
    taxMinor: 0,
    additionalChargesMinor: 0,
    discountMinor: 0,
    amountMinor,
    rounding: 'half_up_to_cent',
  };
};