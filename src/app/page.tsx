'use client';

import { useState, useEffect, useCallback } from 'react';
import { TIMEFRAMES, RSI_PERIODS, TOP_CRYPTOS, SYMBOL_NAMES, RSIData } from '@/lib/binance';
import { calculateRSI, getRSIColor, getRSIBgColor } from '@/lib/rsi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Star, Search, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

function RSICell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-500">-</span>;
  
  let colorClass = 'text-white';
  let bgClass = 'bg-zinc-700';
  
  if (value < 30) {
    colorClass = 'text-white';
    bgClass = 'bg-emerald-600';
  } else if (value > 70) {
    colorClass = 'text-white';
    bgClass = 'bg-red-600';
  } else if (value < 40) {
    colorClass = 'text-emerald-300';
    bgClass = 'bg-emerald-800/60';
  } else if (value > 60) {
    colorClass = 'text-red-300';
    bgClass = 'bg-red-800/60';
  }
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${colorClass} ${bgClass}`}>
      {value.toFixed(1)}
    </span>
  );
}

interface Signal {
  type: 'scalp_long' | 'scalp_short' | 'swing_long' | 'swing_short' | 'neutral';
  strength: 'weak' | 'moderate' | 'strong';
  urgency: 'low' | 'medium' | 'high';
  reasons: string[];
}

interface AnalysisResult {
  signals: Signal;
  analysis: string;
  timestamp: string;
}

function AnalysisModal({ 
  crypto, 
  open,
  onClose 
}: { 
  crypto: RSIData | null;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    if (!crypto || !open) return;
    
    async function analyze() {
      setLoading(true);
      setResult(null);
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cryptoData: crypto })
        });
        if (res.ok) {
          setResult(await res.json());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    analyze();
  }, [crypto, open]);

  if (!crypto) return null;

  const signalConfig = {
    scalp_long: { icon: TrendingUp, label: 'SCALP LONG', color: 'bg-emerald-600' },
    scalp_short: { icon: TrendingDown, label: 'SCALP SHORT', color: 'bg-red-600' },
    swing_long: { icon: TrendingUp, label: 'SWING LONG', color: 'bg-emerald-700' },
    swing_short: { icon: TrendingDown, label: 'SWING SHORT', color: 'bg-red-700' },
    neutral: { icon: Minus, label: 'NEUTRAL', color: 'bg-zinc-600' }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl font-bold">{crypto.symbol}</span>
            <span className="text-muted-foreground font-normal">{crypto.name}</span>
            <Badge variant="outline" className="ml-auto font-mono">
              ${formatPrice(crypto.price)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Analyzing with Grok...</p>
          </div>
        ) : result ? (
          <div className="space-y-4">
            {/* Signal */}
            <div className="flex items-center gap-3 flex-wrap">
              {(() => {
                const config = signalConfig[result.signals.type];
                const Icon = config.icon;
                return (
                  <Badge className={`${config.color} text-white px-3 py-1`}>
                    <Icon className="h-4 w-4 mr-1" />
                    {config.label}
                  </Badge>
                );
              })()}
              <Badge variant={result.signals.urgency === 'high' ? 'destructive' : 'secondary'}>
                {result.signals.urgency.toUpperCase()} URGENCY
              </Badge>
              <Badge variant="outline">
                {result.signals.strength.toUpperCase()}
              </Badge>
            </div>

            {/* Analysis */}
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <p className="text-sm text-zinc-400 mb-2">🤖 Grok Analysis</p>
              <p className="text-white leading-relaxed">{result.analysis}</p>
            </div>

            {/* Observations */}
            {result.signals.reasons.length > 0 && (
              <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
                <p className="text-sm text-zinc-400 mb-2">📊 Key Observations</p>
                <ul className="space-y-1">
                  {result.signals.reasons.map((r, i) => (
                    <li key={i} className="text-sm text-white flex gap-2">
                      <span className="text-blue-400">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* RSI Table */}
            <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/30">
              <p className="text-sm text-zinc-400 mb-3">📈 RSI Overview</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800">
                      <TableHead className="w-16 text-white">TF</TableHead>
                      {RSI_PERIODS.map(p => (
                        <TableHead key={p} className="text-center text-white">RSI{p}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TIMEFRAMES.map(tf => (
                      <TableRow key={tf.label} className="border-zinc-800/50">
                        <TableCell className="font-medium text-white">{tf.label}</TableCell>
                        {RSI_PERIODS.map(period => (
                          <TableCell key={period} className="text-center">
                            <RSICell value={crypto.timeframes[tf.label]?.[period] ?? null} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">Failed to analyze</p>
        )}
      </DialogContent>
    </Dialog>
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
  } catch {
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
    for (const r of timeframeResults) {
      rsiData.timeframes[r.label] = r.rsis;
    }
    results.push(rsiData);
  }

  return results;
}

async function fetchAllPrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price');
    const data = await res.json();
    const priceMap: Record<string, number> = {};
    if (Array.isArray(data)) {
      for (const p of data) {
        priceMap[p.symbol] = parseFloat(p.price);
      }
    }
    return priceMap;
  } catch {
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
      .slice(0, 20);
  } catch {
    return [];
  }
}

export default function Home() {
  const [data, setData] = useState<RSIData[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedCrypto, setSelectedCrypto] = useState<RSIData | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});

  // Load favorites
  useEffect(() => {
    const saved = localStorage.getItem('rsi-favorites');
    if (saved) {
      try { setFavorites(JSON.parse(saved)); } catch {}
    }
  }, []);

  // Save favorites
  useEffect(() => {
    localStorage.setItem('rsi-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const prices = await fetchAllPrices();
      setPriceMap(prices);
      
      // Combine favorites + top cryptos (deduped)
      const allSymbols = [...new Set([...favorites, ...TOP_CRYPTOS])];
      const rsiData = await fetchCryptoData(allSymbols, prices);
      setData(rsiData);
      
      setLastUpdated(new Date().toLocaleTimeString('en-US', { 
        timeZone: 'Europe/Budapest',
        hour: '2-digit', 
        minute: '2-digit'
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [favorites]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Search
  const [searching, setSearching] = useState(false);
  
  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const results = await searchSymbols(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const toggleFavorite = (symbol: string) => {
    const fullSymbol = symbol.includes('USDT') ? symbol : symbol + 'USDT';
    setFavorites(prev => 
      prev.includes(fullSymbol) 
        ? prev.filter(s => s !== fullSymbol)
        : [...prev, fullSymbol]
    );
  };

  const addFromSearch = async (symbol: string) => {
    if (!favorites.includes(symbol)) {
      setFavorites(prev => [...prev, symbol]);
    }
    setSearchOpen(false);
    setSearchQuery('');
    
    // Fetch data for new coin
    if (!data.find(d => d.symbol === symbol.replace('USDT', ''))) {
      const newData = await fetchCryptoData([symbol], priceMap);
      setData(prev => [...newData, ...prev]);
    }
  };

  // Sort: favorites first, then rest
  const sortedData = [...data].sort((a, b) => {
    const aFav = favorites.includes(a.symbol + 'USDT');
    const bFav = favorites.includes(b.symbol + 'USDT');
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  return (
    <main className="min-h-screen bg-zinc-950 text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Crypto RSI</h1>
              <p className="text-xs text-muted-foreground">
                Click any coin for AI analysis
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSearchOpen(true)}
                className="gap-2"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{lastUpdated || 'Refresh'}</span>
              </Button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Oversold (&lt;30)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Overbought (&gt;70)
            </span>
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              Favorited
            </span>
          </div>
        </div>
      </header>

      {/* Table */}
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900/50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="font-semibold text-white">Asset</TableHead>
                  <TableHead className="text-right font-semibold text-white">Price</TableHead>
                  {TIMEFRAMES.map(tf => (
                    <TableHead 
                      key={tf.label} 
                      colSpan={RSI_PERIODS.length} 
                      className="text-center font-semibold border-l border-zinc-800 text-white"
                    >
                      {tf.label}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow className="bg-zinc-900/30 border-zinc-800 hover:bg-zinc-900/30">
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  {TIMEFRAMES.map(tf => (
                    RSI_PERIODS.map(period => (
                      <TableHead 
                        key={`${tf.label}-${period}`} 
                        className="text-center text-xs text-zinc-400 font-normal py-1"
                      >
                        {period}
                      </TableHead>
                    ))
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((crypto) => {
                  const isFav = favorites.includes(crypto.symbol + 'USDT');
                  return (
                    <TableRow 
                      key={crypto.symbol}
                      className={`border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-900/50 ${isFav ? 'bg-yellow-500/5' : ''}`}
                      onClick={() => setSelectedCrypto(crypto)}
                    >
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => toggleFavorite(crypto.symbol)}
                        >
                          <Star className={`h-4 w-4 ${isFav ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`} />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-white">{crypto.symbol}</div>
                        <div className="text-xs text-zinc-400">{crypto.name}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-white">
                        ${formatPrice(crypto.price)}
                      </TableCell>
                      {TIMEFRAMES.map(tf => (
                        RSI_PERIODS.map(period => (
                          <TableCell 
                            key={`${crypto.symbol}-${tf.label}-${period}`} 
                            className="text-center py-2"
                          >
                            <RSICell value={crypto.timeframes[tf.label]?.[period] ?? null} />
                          </TableCell>
                        ))
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Binance data • Grok AI • Auto-refresh 60s
        </p>
      </div>

      {/* Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-700 p-0">
          <div className="p-4">
            <Input
              placeholder="Search coins (e.g. PEPE, SHIB)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              autoFocus
            />
          </div>
          <div className="max-h-80 overflow-auto px-2 pb-4">
            {searching && (
              <p className="text-zinc-400 text-center py-4">Searching...</p>
            )}
            {!searching && searchQuery.length > 0 && searchResults.length === 0 && (
              <p className="text-zinc-400 text-center py-4">No coins found</p>
            )}
            {searchResults.map(symbol => (
              <div
                key={symbol}
                onClick={() => addFromSearch(symbol)}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <span className="font-mono font-semibold text-white">{symbol.replace('USDT', '')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-sm">
                    ${priceMap[symbol] ? formatPrice(priceMap[symbol]) : '-'}
                  </span>
                  {favorites.includes(symbol) && (
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Analysis Modal */}
      <AnalysisModal 
        crypto={selectedCrypto}
        open={!!selectedCrypto}
        onClose={() => setSelectedCrypto(null)}
      />
    </main>
  );
}
