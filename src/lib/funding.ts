// Binance Funding Rates

export interface FundingRate {
  symbol: string;
  fundingRate: number;
  nextFundingTime: number;
}

export async function fetchFundingRates(): Promise<Record<string, FundingRate>> {
  try {
    const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    if (!res.ok) return {};
    
    const data = await res.json();
    const rates: Record<string, FundingRate> = {};
    
    for (const item of data) {
      if (item.symbol.endsWith('USDT')) {
        rates[item.symbol] = {
          symbol: item.symbol,
          fundingRate: parseFloat(item.lastFundingRate) * 100, // Convert to percentage
          nextFundingTime: parseInt(item.nextFundingTime)
        };
      }
    }
    
    return rates;
  } catch (e) {
    console.error('Failed to fetch funding rates:', e);
    return {};
  }
}

export function formatFundingRate(rate: number): string {
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${rate.toFixed(4)}%`;
}

export function getFundingColor(rate: number): { text: string; bg: string } {
  if (rate <= -0.01) {
    // Very negative - longs get paid well
    return { text: 'text-emerald-300', bg: 'bg-emerald-800' };
  } else if (rate < 0) {
    // Slightly negative
    return { text: 'text-emerald-400', bg: 'bg-emerald-900/50' };
  } else if (rate >= 0.05) {
    // Very positive - shorts get paid well, potential long squeeze
    return { text: 'text-red-300', bg: 'bg-red-800' };
  } else if (rate >= 0.02) {
    // Moderately positive
    return { text: 'text-red-400', bg: 'bg-red-900/50' };
  } else {
    // Neutral
    return { text: 'text-zinc-400', bg: 'bg-zinc-800' };
  }
}
