// RSI Backtest Logic

import { calculateRSIArray } from './divergence';

export interface BacktestSignal {
  timestamp: number;
  price: number;
  rsi: number;
  type: 'oversold' | 'overbought';
  return1h: number | null;
  return4h: number | null;
  return24h: number | null;
}

export interface BacktestResult {
  signals: BacktestSignal[];
  oversoldStats: {
    count: number;
    winRate1h: number;
    winRate4h: number;
    winRate24h: number;
    avgReturn1h: number;
    avgReturn4h: number;
    avgReturn24h: number;
  };
  overboughtStats: {
    count: number;
    winRate1h: number;
    winRate4h: number;
    winRate24h: number;
    avgReturn1h: number;
    avgReturn4h: number;
    avgReturn24h: number;
  };
}

export async function runBacktest(
  symbol: string,
  timeframe: string,
  rsiPeriod: number = 14,
  oversoldThreshold: number = 30,
  overboughtThreshold: number = 70
): Promise<BacktestResult | null> {
  try {
    // Map timeframe to interval and determine candle counts
    const intervalMap: Record<string, { interval: string; candlesFor1h: number; candlesFor4h: number; candlesFor24h: number }> = {
      '1h': { interval: '1h', candlesFor1h: 1, candlesFor4h: 4, candlesFor24h: 24 },
      '4h': { interval: '4h', candlesFor1h: 0.25, candlesFor4h: 1, candlesFor24h: 6 },
      '1d': { interval: '1d', candlesFor1h: 0, candlesFor4h: 0, candlesFor24h: 1 },
    };

    const config = intervalMap[timeframe];
    if (!config) return null;

    // Fetch historical klines (500 candles for good backtest data)
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${config.interval}&limit=500`
    );
    if (!res.ok) return null;

    const klines = await res.json();
    if (!Array.isArray(klines) || klines.length < rsiPeriod + 50) return null;

    const data = klines.map((k: (string | number)[]) => ({
      timestamp: k[0] as number,
      close: parseFloat(String(k[4]))
    }));

    const closes = data.map(d => d.close);
    const rsiValues = calculateRSIArray(closes, rsiPeriod);

    const signals: BacktestSignal[] = [];

    // Start after we have RSI values and enough forward data
    const startIdx = rsiPeriod;
    const endIdx = data.length - Math.ceil(config.candlesFor24h) - 1;

    for (let i = startIdx; i < endIdx; i++) {
      const rsi = rsiValues[i - rsiPeriod];
      if (rsi === undefined) continue;

      let type: 'oversold' | 'overbought' | null = null;
      if (rsi < oversoldThreshold) type = 'oversold';
      else if (rsi > overboughtThreshold) type = 'overbought';

      if (!type) continue;

      const entryPrice = data[i].close;
      
      // Calculate returns
      const idx1h = Math.min(i + Math.ceil(config.candlesFor1h), data.length - 1);
      const idx4h = Math.min(i + Math.ceil(config.candlesFor4h), data.length - 1);
      const idx24h = Math.min(i + Math.ceil(config.candlesFor24h), data.length - 1);

      const return1h = config.candlesFor1h > 0 
        ? ((data[idx1h].close - entryPrice) / entryPrice) * 100 
        : null;
      const return4h = config.candlesFor4h > 0 
        ? ((data[idx4h].close - entryPrice) / entryPrice) * 100 
        : null;
      const return24h = ((data[idx24h].close - entryPrice) / entryPrice) * 100;

      signals.push({
        timestamp: data[i].timestamp,
        price: entryPrice,
        rsi,
        type,
        return1h,
        return4h,
        return24h
      });
    }

    // Calculate stats
    const oversoldSignals = signals.filter(s => s.type === 'oversold');
    const overboughtSignals = signals.filter(s => s.type === 'overbought');

    const calcStats = (sigs: BacktestSignal[], expectUp: boolean) => {
      if (sigs.length === 0) {
        return {
          count: 0,
          winRate1h: 0,
          winRate4h: 0,
          winRate24h: 0,
          avgReturn1h: 0,
          avgReturn4h: 0,
          avgReturn24h: 0
        };
      }

      const returns1h = sigs.filter(s => s.return1h !== null).map(s => s.return1h!);
      const returns4h = sigs.filter(s => s.return4h !== null).map(s => s.return4h!);
      const returns24h = sigs.map(s => s.return24h!);

      const winCondition = (r: number) => expectUp ? r > 0 : r < 0;

      return {
        count: sigs.length,
        winRate1h: returns1h.length > 0 
          ? (returns1h.filter(winCondition).length / returns1h.length) * 100 
          : 0,
        winRate4h: returns4h.length > 0 
          ? (returns4h.filter(winCondition).length / returns4h.length) * 100 
          : 0,
        winRate24h: (returns24h.filter(winCondition).length / returns24h.length) * 100,
        avgReturn1h: returns1h.length > 0 
          ? returns1h.reduce((a, b) => a + b, 0) / returns1h.length 
          : 0,
        avgReturn4h: returns4h.length > 0 
          ? returns4h.reduce((a, b) => a + b, 0) / returns4h.length 
          : 0,
        avgReturn24h: returns24h.reduce((a, b) => a + b, 0) / returns24h.length
      };
    };

    return {
      signals: signals.slice(-50), // Last 50 signals for display
      oversoldStats: calcStats(oversoldSignals, true), // Expect price to go UP after oversold
      overboughtStats: calcStats(overboughtSignals, false) // Expect price to go DOWN after overbought
    };
  } catch (e) {
    console.error('Backtest error:', e);
    return null;
  }
}
