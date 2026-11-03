import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/AppError.js';
import { parseRateToScaledInteger } from './payment-pricing.js';

const rateResponseSchema = z.object({
  result: z.literal('success'),
  base_code: z.literal('PKR'),
  time_last_update_unix: z.number().int().positive(),
  time_next_update_unix: z.number().int().positive(),
  rates: z.object({ USD: z.number().positive() }),
});

export const fetchPkrUsdQuote = async ({ fetchImpl = fetch, now = Date.now } = {}) => {
  try {
    const response = await fetchImpl(env.FX_RATE_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('FX provider request failed');

    const payload = rateResponseSchema.parse(await response.json());
    const nowSeconds = Math.floor(now() / 1000);
    const maxAgeSeconds = env.FX_RATE_MAX_AGE_MINUTES * 60;
    const quoteAgeSeconds = nowSeconds - payload.time_last_update_unix;
    if (quoteAgeSeconds < -300 || quoteAgeSeconds > maxAgeSeconds) {
      throw new Error('FX quote is outside the permitted freshness window');
    }

    return {
      provider: new URL(env.FX_RATE_URL).hostname,
      rateScaled: parseRateToScaledInteger(payload.rates.USD),
      quotedAt: new Date(payload.time_last_update_unix * 1000),
      validUntil: new Date(Math.min(
        payload.time_next_update_unix,
        payload.time_last_update_unix + maxAgeSeconds,
      ) * 1000),
    };
  } catch {
    throw new AppError('A current exchange rate is unavailable. Please try again shortly.', 503);
  }
};