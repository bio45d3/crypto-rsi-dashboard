'use client';

import { useState, useEffect, useCallback, DragEvent } from 'react';
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

async function fetchCryptoData(symbols: string[], priceMap: Record<string, number>): Promise<RSIData[]> {
  const results: RSIData[] = [];

  for (const symbol of symbols) {
    const displaySymbol = symbol.replace('USDT', '');
    const rsiData: RSIData = {
      symbol: displaySymbol,
      name: SYMBOL_NAMES[symbol] || displaySymbol,
      price: priceMap[symbol] || 0,
      timeframes: {}
    };

    for (const tf of TIMEFRAMES) {
      rsiData.timeframes[tf.label] = {};
      for (const period of RSI_PERIODS) {
        rsiData.timeframes[tf.label][period] = null;
      }
    }

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

async function fetchAllPrices(): Promise<Record<string, number>> {
  try {
    const pricesRes = await fetch('https://api.binance.com/api/v3/ticker/price');
    const pricesData = await pricesRes.json();
    const priceMap: Record<string, number> = {};
    if (Array.isArray(pricesData)) {
      for (const p of pricesData) {
        priceMap[p.symbol] = parseFloat(p.price);
      }
    }
    return priceMap;
  } catch (error) {
    console.error('Error fetching prices:', error);
    return {};
  }
}

async function searchSymbols(query: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    const data = await res.json();
    const usdtPairs = data.symbols
      .filter((s: { symbol: string; status: string; quoteAsset: string }) => 
        s.status === 'TRADING' && s.quoteAsset === 'USDT'
      )
      .map((s: { symbol: string }) => s.symbol);
    
    const upperQuery = query.toUpperCase();
    return usdtPairs
      .filter((s: string) => s.replace('USDT', '').includes(upperQuery))
      .slice(0, 10);
  } catch (error) {
    console.error('Error searching symbols:', error);
    return [];
  }
}

function CryptoTable({ 
  data, 
  loading, 
  title,
  onDragStart,
  onRemove,
  showRemove = false
}: { 
  data: RSIData[], 
  loading: boolean, 
  title: string,
  onDragStart?: (symbol: string) => void,
  onRemove?: (symbol: string) => void,
  showRemove?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <h2 className="text-xl font-bold mb-3 text-gray-300">{title}</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 px-2 font-semibold sticky left-0 bg-gray-950 z-10">Asset</th>
            <th className="text-right py-2 px-2 font-semibold">Price</th>
            {TIMEFRAMES.map(tf => (
              <th key={tf.label} colSpan={RSI_PERIODS.length} className="text-center py-2 px-1 font-semibold border-l border-gray-800">
                {tf.label}
              </th>
            ))}
            {showRemove && <th className="w-8"></th>}
          </tr>
          <tr className="border-b border-gray-800 text-gray-500 text-xs">
            <th className="sticky left-0 bg-gray-950 z-10"></th>
            <th></th>
            {TIMEFRAMES.map(tf => (
              RSI_PERIODS.map(period => (
                <th key={`${tf.label}-${period}`} className="py-1 px-1 font-normal">
                  {period}
                </th>
              ))
            ))}
            {showRemove && <th></th>}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && !loading ? (
            <tr>
              <td colSpan={2 + TIMEFRAMES.length * RSI_PERIODS.length + (showRemove ? 1 : 0)} className="text-center py-4 text-gray-500">
                {showRemove ? 'Drag coins here to watch' : 'No data'}
              </td>
            </tr>
          ) : (
            data.map((crypto, idx) => (
              <tr 
                key={crypto.symbol} 
                className={`border-b border-gray-800/50 hover:bg-gray-900/50 ${idx % 2 === 0 ? 'bg-gray-900/20' : ''} ${onDragStart ? 'cursor-grab active:cursor-grabbing' : ''}`}
                draggable={!!onDragStart}
                onDragStart={(e) => {
                  if (onDragStart) {
                    e.dataTransfer.setData('text/plain', crypto.symbol + 'USDT');
                    onDragStart(crypto.symbol + 'USDT');
                  }
                }}
              >
                <td className="py-2 px-2 sticky left-0 bg-gray-950 z-10">
                  <div className="font-bold">{crypto.symbol}</div>
                  <div className="text-gray-500 text-xs">{crypto.name}</div>
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs">
                  ${formatPrice(crypto.price)}
                </td>
                {TIMEFRAMES.map(tf => (
                  RSI_PERIODS.map(period => (
                    <td key={`${crypto.symbol}-${tf.label}-${period}`} className="py-1 px-0.5">
                      <RSICell value={crypto.timeframes[tf.label]?.[period] ?? null} />
                    </td>
                  ))
                ))}
                {showRemove && onRemove && (
                  <td className="py-2 px-1">
                    <button 
                      onClick={() => onRemove(crypto.symbol + 'USDT')}
                      className="text-gray-500 hover:text-red-400 text-lg leading-none"
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [majorData, setMajorData] = useState<RSIData[]>([]);
  const [watchlistData, setWatchlistData] = useState<RSIData[]>([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);

  // Load watchlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('rsi-watchlist');
    if (saved) {
      try {
        setWatchlistSymbols(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Save watchlist to localStorage
  useEffect(() => {
    localStorage.setItem('rsi-watchlist', JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const prices = await fetchAllPrices();
      setPriceMap(prices);
      
      const majorRsiData = await fetchCryptoData(TOP_CRYPTOS, prices);
      setMajorData(majorRsiData);
      
      if (watchlistSymbols.length > 0) {
        const watchRsiData = await fetchCryptoData(watchlistSymbols, prices);
        setWatchlistData(watchRsiData);
      }
      
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
  }, [watchlistSymbols]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Search handler
  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    
    const timeout = setTimeout(async () => {
      setSearching(true);
      const results = await searchSymbols(searchQuery);
      setSearchResults(results.filter(s => !watchlistSymbols.includes(s) && !TOP_CRYPTOS.includes(s)));
      setSearching(false);
    }, 300);
    
    return () => clearTimeout(timeout);
  }, [searchQuery, watchlistSymbols]);

  const addToWatchlist = async (symbol: string) => {
    if (watchlistSymbols.includes(symbol) || TOP_CRYPTOS.includes(symbol)) return;
    
    setWatchlistSymbols(prev => [...prev, symbol]);
    setSearchQuery('');
    setSearchResults([]);
    
    // Fetch data for new symbol
    const newData = await fetchCryptoData([symbol], priceMap);
    setWatchlistData(prev => [...prev, ...newData]);
  };

  const removeFromWatchlist = (symbol: string) => {
    setWatchlistSymbols(prev => prev.filter(s => s !== symbol));
    setWatchlistData(prev => prev.filter(d => d.symbol + 'USDT' !== symbol));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const symbol = e.dataTransfer.getData('text/plain');
    if (symbol) {
      addToWatchlist(symbol);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-[1900px] mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-bold mb-1">Crypto RSI Dashboard</h1>
          <p className="text-gray-400 text-sm">
            RSI Periods: 14, 50, 75, 100, 200 • 
            <span className="text-green-400 ml-2">●</span> Oversold (&lt;30) 
            <span className="text-red-400 ml-2">●</span> Overbought (&gt;70)
          </p>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-gray-500 text-sm">
              {loading ? 'Loading...' : `Updated: ${lastUpdated}`}
            </p>
            <button 
              onClick={loadData}
              disabled={loading}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </header>

        <div className="flex gap-4">
          {/* Main Table - Majors */}
          <div className="flex-1 min-w-0">
            <CryptoTable 
              data={majorData} 
              loading={loading} 
              title="Top 10 Majors"
              onDragStart={() => {}}
            />
          </div>

          {/* Watchlist Panel */}
          <div 
            className={`w-[800px] flex-shrink-0 border-l border-gray-800 pl-4 ${dragOver ? 'bg-gray-900/50' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="mb-4">
              <h2 className="text-xl font-bold mb-2 text-gray-300">Watchlist</h2>
              
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search coin (e.g. PEPE, DOGE)..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:outline-none focus:border-gray-500"
                />
                
                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg z-20 max-h-60 overflow-auto">
                    {searchResults.map(symbol => (
                      <div
                        key={symbol}
                        className="px-3 py-2 hover:bg-gray-800 cursor-pointer flex justify-between items-center"
                        onClick={() => addToWatchlist(symbol)}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', symbol);
                        }}
                      >
                        <span className="font-mono">{symbol.replace('USDT', '')}</span>
                        <span className="text-gray-500 text-xs">
                          ${priceMap[symbol] ? formatPrice(priceMap[symbol]) : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                
                {searching && (
                  <div className="absolute right-3 top-2 text-gray-500 text-sm">...</div>
                )}
              </div>
              
              <p className="text-gray-600 text-xs mt-2">
                Search and click to add, or drag from majors/search
              </p>
            </div>

            {/* Watchlist Table */}
            {watchlistSymbols.length > 0 ? (
              <CryptoTable 
                data={watchlistData} 
                loading={loading} 
                title=""
                showRemove={true}
                onRemove={removeFromWatchlist}
              />
            ) : (
              <div className={`border-2 border-dashed rounded-lg p-8 text-center ${dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700'}`}>
                <p className="text-gray-500">Drag coins here or search above</p>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-6 text-center text-gray-600 text-xs">
          <p>Data from Binance • Auto-refreshes every 60 seconds</p>
        </footer>
      </div>
    </main>
  );
}
