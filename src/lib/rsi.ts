// RSI Calculation
export function calculateRSI(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smooth the averages
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function getRSIColor(rsi: number | null): string {
  if (rsi === null) return 'text-gray-500';
  if (rsi <= 30) return 'text-green-400'; // Oversold
  if (rsi >= 70) return 'text-red-400';   // Overbought
  if (rsi <= 40) return 'text-green-300';
  if (rsi >= 60) return 'text-orange-300';
  return 'text-gray-300'; // Neutral
}

export function getRSIBgColor(rsi: number | null): string {
  if (rsi === null) return 'bg-gray-900';
  if (rsi <= 30) return 'bg-green-900/30'; // Oversold
  if (rsi >= 70) return 'bg-red-900/30';   // Overbought
  return 'bg-gray-900/30';
}

export function getRSILabel(rsi: number | null): string {
  if (rsi === null) return '-';
  if (rsi <= 30) return 'OVERSOLD';
  if (rsi >= 70) return 'OVERBOUGHT';
  if (rsi <= 40) return 'Weak';
  if (rsi >= 60) return 'Strong';
  return 'Neutral';
}
