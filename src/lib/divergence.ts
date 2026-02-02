// RSI Divergence Detection

export interface DivergenceResult {
  type: 'bullish' | 'bearish' | null;
  timeframe: string;
  description: string;
}

interface PriceRSIPair {
  price: number;
  rsi: number;
  index: number;
}

function findLocalExtremes(values: number[], isMax: boolean, lookback: number = 5): number[] {
  const extremes: number[] = [];
  for (let i = lookback; i < values.length - lookback; i++) {
    const window = values.slice(i - lookback, i + lookback + 1);
    const current = values[i];
    if (isMax) {
      if (current === Math.max(...window)) extremes.push(i);
    } else {
      if (current === Math.min(...window)) extremes.push(i);
    }
  }
  return extremes;
}

export function detectDivergence(
  closes: number[],
  rsiValues: number[],
  lookbackCandles: number = 30
): DivergenceResult | null {
  if (closes.length < lookbackCandles || rsiValues.length < lookbackCandles) {
    return null;
  }

  // Use recent data
  const recentCloses = closes.slice(-lookbackCandles);
  const recentRSI = rsiValues.slice(-lookbackCandles);

  // Find local highs and lows
  const priceHighs = findLocalExtremes(recentCloses, true, 3);
  const priceLows = findLocalExtremes(recentCloses, false, 3);
  const rsiHighs = findLocalExtremes(recentRSI, true, 3);
  const rsiLows = findLocalExtremes(recentRSI, false, 3);

  // Check for bearish divergence (price higher high, RSI lower high)
  if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
    const lastPriceHigh = priceHighs[priceHighs.length - 1];
    const prevPriceHigh = priceHighs[priceHighs.length - 2];
    const lastRSIHigh = rsiHighs[rsiHighs.length - 1];
    const prevRSIHigh = rsiHighs[rsiHighs.length - 2];

    // Price making higher high
    if (recentCloses[lastPriceHigh] > recentCloses[prevPriceHigh]) {
      // RSI making lower high
      if (recentRSI[lastRSIHigh] < recentRSI[prevRSIHigh]) {
        // Ensure the highs are roughly aligned in time
        if (Math.abs(lastPriceHigh - lastRSIHigh) <= 5) {
          return {
            type: 'bearish',
            timeframe: '',
            description: 'Price higher high, RSI lower high'
          };
        }
      }
    }
  }

  // Check for bullish divergence (price lower low, RSI higher low)
  if (priceLows.length >= 2 && rsiLows.length >= 2) {
    const lastPriceLow = priceLows[priceLows.length - 1];
    const prevPriceLow = priceLows[priceLows.length - 2];
    const lastRSILow = rsiLows[rsiLows.length - 1];
    const prevRSILow = rsiLows[rsiLows.length - 2];

    // Price making lower low
    if (recentCloses[lastPriceLow] < recentCloses[prevPriceLow]) {
      // RSI making higher low
      if (recentRSI[lastRSILow] > recentRSI[prevRSILow]) {
        // Ensure the lows are roughly aligned in time
        if (Math.abs(lastPriceLow - lastRSILow) <= 5) {
          return {
            type: 'bullish',
            timeframe: '',
            description: 'Price lower low, RSI higher low'
          };
        }
      }
    }
  }

  return null;
}

export function calculateRSIArray(closes: number[], period: number = 14): number[] {
  if (closes.length < period + 1) return [];
  
  const rsiValues: number[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // First RSI
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiValues.push(100 - (100 / (1 + firstRS)));

  // Subsequent RSI values
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(100 - (100 / (1 + rs)));
  }

  return rsiValues;
}
