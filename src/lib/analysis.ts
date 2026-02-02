import { RSIData } from './binance';

// Confluence scoring - count how many timeframes agree
export interface ConfluenceScore {
  oversoldCount: number;
  overboughtCount: number;
  totalTimeframes: number;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  score: number; // -100 to +100
}

export function calculateConfluence(
  crypto: RSIData, 
  rsiPeriod: number = 14,
  timeframes: string[] = ['1h', '4h', '1d']
): ConfluenceScore {
  let oversoldCount = 0;
  let overboughtCount = 0;
  let validCount = 0;

  for (const tf of timeframes) {
    const rsi = crypto.timeframes[tf]?.[rsiPeriod];
    if (rsi !== null && rsi !== undefined) {
      validCount++;
      if (rsi < 30) oversoldCount++;
      else if (rsi > 70) overboughtCount++;
    }
  }

  const netScore = oversoldCount - overboughtCount;
  const score = validCount > 0 ? Math.round((netScore / validCount) * 100) : 0;

  let signal: ConfluenceScore['signal'] = 'neutral';
  if (oversoldCount >= 3) signal = 'strong_buy';
  else if (oversoldCount >= 2) signal = 'buy';
  else if (overboughtCount >= 3) signal = 'strong_sell';
  else if (overboughtCount >= 2) signal = 'sell';

  return {
    oversoldCount,
    overboughtCount,
    totalTimeframes: validCount,
    signal,
    score
  };
}

// Divergence detection
export interface Divergence {
  type: 'bullish' | 'bearish' | 'none';
  timeframe: string;
  strength: 'weak' | 'strong';
  description: string;
}

export function detectDivergence(
  closes: number[],
  rsiValues: number[],
  lookback: number = 14
): Divergence {
  if (closes.length < lookback || rsiValues.length < lookback) {
    return { type: 'none', timeframe: '', strength: 'weak', description: '' };
  }

  const recentCloses = closes.slice(-lookback);
  const recentRSI = rsiValues.slice(-lookback);

  // Find local highs and lows in price
  const priceHigh1 = Math.max(...recentCloses.slice(0, Math.floor(lookback / 2)));
  const priceHigh2 = Math.max(...recentCloses.slice(Math.floor(lookback / 2)));
  const priceLow1 = Math.min(...recentCloses.slice(0, Math.floor(lookback / 2)));
  const priceLow2 = Math.min(...recentCloses.slice(Math.floor(lookback / 2)));

  // Find corresponding RSI values
  const rsiHigh1 = Math.max(...recentRSI.slice(0, Math.floor(lookback / 2)));
  const rsiHigh2 = Math.max(...recentRSI.slice(Math.floor(lookback / 2)));
  const rsiLow1 = Math.min(...recentRSI.slice(0, Math.floor(lookback / 2)));
  const rsiLow2 = Math.min(...recentRSI.slice(Math.floor(lookback / 2)));

  // Bearish divergence: Price higher high, RSI lower high
  if (priceHigh2 > priceHigh1 * 1.001 && rsiHigh2 < rsiHigh1 * 0.95) {
    const strength = rsiHigh2 < rsiHigh1 * 0.9 ? 'strong' : 'weak';
    return {
      type: 'bearish',
      timeframe: '',
      strength,
      description: `Price making higher highs while RSI making lower highs`
    };
  }

  // Bullish divergence: Price lower low, RSI higher low
  if (priceLow2 < priceLow1 * 0.999 && rsiLow2 > rsiLow1 * 1.05) {
    const strength = rsiLow2 > rsiLow1 * 1.1 ? 'strong' : 'weak';
    return {
      type: 'bullish',
      timeframe: '',
      strength,
      description: `Price making lower lows while RSI making higher lows`
    };
  }

  return { type: 'none', timeframe: '', strength: 'weak', description: '' };
}

// Scanner result for extreme RSI
export interface ScannerResult {
  symbol: string;
  name: string;
  price: number;
  extremes: {
    timeframe: string;
    rsiPeriod: number;
    value: number;
    type: 'oversold' | 'overbought';
  }[];
  confluenceScore: number;
}

export function isExtreme(rsi: number | null | undefined): 'oversold' | 'overbought' | null {
  if (rsi === null || rsi === undefined) return null;
  if (rsi < 25) return 'oversold';
  if (rsi > 75) return 'overbought';
  return null;
}
