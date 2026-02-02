'use client';

import { useState, useEffect, useCallback } from 'react';
import { TIMEFRAMES, RSI_PERIODS, TOP_CRYPTOS, SYMBOL_NAMES, RSIData } from '@/lib/binance';
import { calculateRSI, getRSIColor, getRSIBgColor } from '@/lib/rsi';

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

function RSICell({ value }: { value: number | null }) {
  const colorClass = getRSIColor(value);
  const bgClass = getRSIBgColor(value);
  
  return (
    <div className={`px-2 py-1 rounded text-center font-mono text-sm ${colorClass} ${bgClass}`}>
      {value !== null ? value.toFixed(1) : '-'}
    </div>
  );
}

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<number[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    
    return data.map((k: (string | number)[]) => parseFloat(String(k[4])));
  } catch (error) {
    console.error(`Error fetching ${symbol} ${interval}:`, error);
    return [];
  }
}

async function fetchAllData(): Promise<RSIData[]> {
  const results: RSIData[] = [];

  // Fetch prices
  let priceMap: Record<string, number> = {};
  try {
    const pricesRes = await fetch('https://api.binance.com/api/v3/ticker/price');
    const pricesData = await pricesRes.json();
    if (Array.isArray(pricesData)) {
      for (const p of pricesData) {
        priceMap[p.symbol] = parseFloat(p.price);
      }
    }
  } catch (error) {
    console.error('Error fetching prices:', error);
  }

  // Process each crypto
  for (const symbol of TOP_CRYPTOS) {
    const rsiData: RSIData = {
      symbol: symbol.replace('USDT', ''),
      name: SYMBOL_NAMES[symbol],
      price: priceMap[symbol] || 0,
      timeframes: {}
    };

    // Initialize timeframes
    for (const tf of TIMEFRAMES) {
      rsiData.timeframes[tf.label] = {};
      for (const period of RSI_PERIODS) {
        rsiData.timeframes[tf.label][period] = null;
      }
    }

    // Fetch all timeframes
    const timeframePromises = TIMEFRAMES.map(async (tf) => {
      const closes = await fetchKlines(symbol, tf.interval, tf.limit);
      const rsis: { [period: number]: number | null } = {};
      
      for (const period of RSI_PERIODS) {
        rsis[period] = closes.length > 0 ? calculateRSI(closes, period) : null;
      }
      
      return { label: tf.label, rsis };
    });

    const timeframeResults = await Promise.all(timeframePromises);
    
    for (const result of timeframeResults) {
      rsiData.timeframes[result.label] = result.rsis;
    }

    results.push(rsiData);
  }

  return results;
}

export default function Home() {
  const [data, setData] = useState<RSIData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rsiData = await fetchAllData();
      setData(rsiData);
      setLastUpdated(new Date().toLocaleString('en-US', { 
        timeZone: 'Europe/Budapest',
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      }));
    } catch (err) {
      setError('Failed to load data. Please refresh.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-[1800px] mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Crypto RSI Dashboard</h1>
          <p className="text-gray-400">
            Top 10 Cryptocurrencies • RSI Periods: 14, 50, 75 • 
            <span className="text-green-400 ml-2">●</span> Oversold (&lt;30) 
            <span className="text-red-400 ml-2">●</span> Overbought (&gt;70)
          </p>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-gray-500 text-sm">
              {loading ? 'Loading...' : `Last updated: ${lastUpdated} (Budapest)`}
            </p>
            <button 
              onClick={loadData}
              disabled={loading}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </header>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 font-semibold sticky left-0 bg-gray-950 z-10">Asset</th>
                <th className="text-right py-3 px-4 font-semibold">Price</th>
                {TIMEFRAMES.map(tf => (
                  <th key={tf.label} colSpan={RSI_PERIODS.length} className="text-center py-3 px-2 font-semibold border-l border-gray-800">
                    {tf.label}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="sticky left-0 bg-gray-950 z-10"></th>
                <th></th>
                {TIMEFRAMES.map(tf => (
                  RSI_PERIODS.map(period => (
                    <th key={`${tf.label}-${period}`} className="py-2 px-2 font-normal">
                      RSI{period}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && !loading ? (
                <tr>
                  <td colSpan={2 + TIMEFRAMES.length * RSI_PERIODS.length} className="text-center py-8 text-gray-500">
                    No data available. Click Refresh to load.
                  </td>
                </tr>
              ) : (
                data.map((crypto, idx) => (
                  <tr 
                    key={crypto.symbol} 
                    className={`border-b border-gray-800/50 hover:bg-gray-900/50 ${idx % 2 === 0 ? 'bg-gray-900/20' : ''}`}
                  >
                    <td className="py-3 px-4 sticky left-0 bg-gray-950 z-10">
                      <div className="font-bold text-lg">{crypto.symbol}</div>
                      <div className="text-gray-500 text-sm">{crypto.name}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      ${formatPrice(crypto.price)}
                    </td>
                    {TIMEFRAMES.map(tf => (
                      RSI_PERIODS.map(period => (
                        <td key={`${crypto.symbol}-${tf.label}-${period}`} className="py-2 px-1">
                          <RSICell value={crypto.timeframes[tf.label]?.[period] ?? null} />
                        </td>
                      ))
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="mt-8 text-center text-gray-600 text-sm">
          <p>Data from Binance • Auto-refreshes every 60 seconds</p>
          <p className="mt-1">
            RSI &lt; 30 = Oversold (potential buy) • RSI &gt; 70 = Overbought (potential sell)
          </p>
        </footer>
      </div>
    </main>
  );
}
