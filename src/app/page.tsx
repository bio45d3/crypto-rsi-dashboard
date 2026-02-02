'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TIMEFRAMES, RSI_PERIODS, TOP_CRYPTOS, SYMBOL_NAMES, RSIData } from '@/lib/binance';
import { calculateRSI } from '@/lib/rsi';
import { calculateConfluence, isExtreme, type ScannerResult } from '@/lib/analysis';
import { binanceWs } from '@/lib/websocket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Star, Search, RefreshCw, TrendingUp, TrendingDown, Minus, Bell, BellRing, Zap, Radar } from 'lucide-react';

// Types
interface Alert {
  symbol: string;
  rsiPeriod: number;
  timeframe: string;
  condition: 'below' | 'above';
  threshold: number;
  enabled: boolean;
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

// Utility functions
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

// Alert Settings Modal
function AlertModal({
  crypto,
  open,
  onClose,
  alerts,
  onSaveAlert,
  onDeleteAlert
}: {
  crypto: RSIData | null;
  open: boolean;
  onClose: () => void;
  alerts: Alert[];
  onSaveAlert: (alert: Alert) => void;
  onDeleteAlert: (index: number) => void;
}) {
  const [rsiPeriod, setRsiPeriod] = useState<number>(14);
  const [timeframe, setTimeframe] = useState<string>('4h');
  const [condition, setCondition] = useState<'below' | 'above'>('below');
  const [threshold, setThreshold] = useState<number>(30);

  if (!crypto) return null;

  const symbolAlerts = alerts.filter(a => a.symbol === crypto.symbol + 'USDT');

  const handleAdd = () => {
    onSaveAlert({
      symbol: crypto.symbol + 'USDT',
      rsiPeriod,
      timeframe,
      condition,
      threshold,
      enabled: true
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Bell className="h-5 w-5" />
            Alerts for {crypto.symbol}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new alert */}
          <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
            <p className="text-sm text-zinc-400">Add new alert</p>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-zinc-400">RSI Period</Label>
                <Select value={String(rsiPeriod)} onValueChange={(v) => setRsiPeriod(Number(v))}>
                  <SelectTrigger className="bg-zinc-700 border-zinc-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {RSI_PERIODS.map(p => (
                      <SelectItem key={p} value={String(p)} className="text-white">RSI{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs text-zinc-400">Timeframe</Label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="bg-zinc-700 border-zinc-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    {TIMEFRAMES.map(tf => (
                      <SelectItem key={tf.label} value={tf.label} className="text-white">{tf.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs text-zinc-400">Condition</Label>
                <Select value={condition} onValueChange={(v) => {
                  const newCondition = v as 'below' | 'above';
                  setCondition(newCondition);
                  setThreshold(newCondition === 'below' ? 30 : 70);
                }}>
                  <SelectTrigger className="bg-zinc-700 border-zinc-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="below" className="text-white">Below (Oversold)</SelectItem>
                    <SelectItem value="above" className="text-white">Above (Overbought)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-xs text-zinc-400">Threshold</Label>
                <Input 
                  type="number" 
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="bg-zinc-700 border-zinc-600 text-white"
                  min={1}
                  max={99}
                />
              </div>
            </div>
            
            <Button onClick={handleAdd} className="w-full bg-blue-600 hover:bg-blue-700">
              Add Alert
            </Button>
          </div>

          {/* Existing alerts */}
          {symbolAlerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-400">Active alerts</p>
              {symbolAlerts.map((alert, idx) => {
                const globalIdx = alerts.findIndex(a => 
                  a.symbol === alert.symbol && 
                  a.rsiPeriod === alert.rsiPeriod && 
                  a.timeframe === alert.timeframe &&
                  a.condition === alert.condition &&
                  a.threshold === alert.threshold
                );
                return (
                  <div key={idx} className="flex items-center justify-between bg-zinc-800 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Switch 
                        checked={alert.enabled}
                        onCheckedChange={(checked) => {
                          onSaveAlert({ ...alert, enabled: checked });
                        }}
                      />
                      <span className="text-white text-sm">
                        RSI{alert.rsiPeriod} {alert.timeframe} {alert.condition} {alert.threshold}
                      </span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => onDeleteAlert(globalIdx)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    >
                      ×
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {symbolAlerts.length === 0 && (
            <p className="text-zinc-500 text-center py-4">No alerts set for {crypto.symbol}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Analysis Modal
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
            <span className="text-2xl font-bold text-white">{crypto.symbol}</span>
            <span className="text-zinc-400 font-normal">{crypto.name}</span>
            <Badge variant="outline" className="ml-auto font-mono text-white border-zinc-600">
              ${formatPrice(crypto.price)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-zinc-500 mb-3" />
            <p className="text-zinc-400">Analyzing with Grok...</p>
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
              <Badge className={result.signals.urgency === 'high' ? 'bg-red-600 text-white' : 'bg-zinc-700 text-white'}>
                {result.signals.urgency.toUpperCase()} URGENCY
              </Badge>
              <Badge className="bg-zinc-700 text-white border border-zinc-600">
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
          <p className="text-zinc-400 text-center py-8">Failed to analyze</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Data fetching functions
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

// Notification log entry
interface NotificationLog {
  id: string;
  symbol: string;
  message: string;
  timestamp: Date;
  type: 'oversold' | 'overbought';
}

// Alert performance tracking
interface AlertPerformance {
  id: string;
  symbol: string;
  triggerTime: number;
  triggerPrice: number;
  triggerRSI: number;
  rsiPeriod: number;
  timeframe: string;
  type: 'oversold' | 'overbought';
  currentPrice?: number;
  priceChange?: number;
  outcome?: 'win' | 'loss' | 'pending';
  checkedAt?: number;
}

// Notification functions
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { 
      body, 
      icon: '/favicon.ico',
      tag: 'rsi-alert'
    });
  }
}

function checkAlerts(
  data: RSIData[], 
  alerts: Alert[], 
  triggeredRef: React.MutableRefObject<Set<string>>,
  addLog: (log: NotificationLog) => void,
  addPerformance: (perf: AlertPerformance) => void
) {
  for (const alert of alerts) {
    if (!alert.enabled) continue;
    
    const crypto = data.find(d => d.symbol + 'USDT' === alert.symbol);
    if (!crypto) continue;
    
    const rsiValue = crypto.timeframes[alert.timeframe]?.[alert.rsiPeriod];
    if (rsiValue === null || rsiValue === undefined) continue;
    
    const alertKey = `${alert.symbol}-${alert.rsiPeriod}-${alert.timeframe}-${alert.condition}-${alert.threshold}`;
    const isTriggered = alert.condition === 'below' 
      ? rsiValue < alert.threshold 
      : rsiValue > alert.threshold;
    
    if (isTriggered && !triggeredRef.current.has(alertKey)) {
      triggeredRef.current.add(alertKey);
      const symbol = alert.symbol.replace('USDT', '');
      const direction = alert.condition === 'below' ? '📉 OVERSOLD' : '📈 OVERBOUGHT';
      const message = `RSI${alert.rsiPeriod} ${alert.timeframe}: ${rsiValue.toFixed(1)} (${alert.condition} ${alert.threshold})`;
      
      sendNotification(`${symbol} RSI Alert!`, `${direction}\n${message}`);
      
      // Add to log
      addLog({
        id: `${Date.now()}-${alertKey}`,
        symbol,
        message: `${direction} - ${message}`,
        timestamp: new Date(),
        type: alert.condition === 'below' ? 'oversold' : 'overbought'
      });
      
      // Add to performance tracking
      addPerformance({
        id: `${Date.now()}-${alertKey}`,
        symbol,
        triggerTime: Date.now(),
        triggerPrice: crypto.price,
        triggerRSI: rsiValue,
        rsiPeriod: alert.rsiPeriod,
        timeframe: alert.timeframe,
        type: alert.condition === 'below' ? 'oversold' : 'overbought',
        outcome: 'pending'
      });
    } else if (!isTriggered && triggeredRef.current.has(alertKey)) {
      // Reset when condition no longer met
      triggeredRef.current.delete(alertKey);
    }
  }
}

// Main Component
export default function Home() {
  const [data, setData] = useState<RSIData[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedCrypto, setSelectedCrypto] = useState<RSIData | null>(null);
  const [alertCrypto, setAlertCrypto] = useState<RSIData | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [visibleRSI, setVisibleRSI] = useState<number[]>([5, 9, 14, 50, 75, 100, 200]);
  const [visibleTF, setVisibleTF] = useState<string[]>(TIMEFRAMES.map(t => t.label));
  const [scannerResults, setScannerResults] = useState<ScannerResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [alertPerformance, setAlertPerformance] = useState<AlertPerformance[]>([]);
  const [priceFlash, setPriceFlash] = useState<Record<string, 'up' | 'down' | 'none'>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const triggeredAlertsRef = useRef<Set<string>>(new Set());

  const addNotificationLog = useCallback((log: NotificationLog) => {
    setNotificationLogs(prev => [log, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Load favorites & alerts from localStorage
  useEffect(() => {
    const savedFavorites = localStorage.getItem('rsi-favorites');
    if (savedFavorites) {
      try { setFavorites(JSON.parse(savedFavorites)); } catch {}
    }
    const savedAlerts = localStorage.getItem('rsi-alerts');
    if (savedAlerts) {
      try { setAlerts(JSON.parse(savedAlerts)); } catch {}
    }
    const savedPerformance = localStorage.getItem('rsi-alert-performance');
    if (savedPerformance) {
      try { setAlertPerformance(JSON.parse(savedPerformance)); } catch {}
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('rsi-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('rsi-alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem('rsi-alert-performance', JSON.stringify(alertPerformance));
  }, [alertPerformance]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const prices = await fetchAllPrices();
      setPriceMap(prices);
      
      // Get symbols from favorites + alerts + top cryptos
      const alertSymbols = [...new Set(alerts.map(a => a.symbol))];
      const allSymbols = [...new Set([...favorites, ...alertSymbols, ...TOP_CRYPTOS])];
      const rsiData = await fetchCryptoData(allSymbols, prices);
      setData(rsiData);
      
      // Check alerts
      checkAlerts(rsiData, alerts, triggeredAlertsRef, addNotificationLog, (perf) => {
        setAlertPerformance(prev => [perf, ...prev].slice(0, 100));
      });
      
      // Update performance tracking
      setAlertPerformance(prev => prev.map(perf => {
        if (perf.outcome !== 'pending') return perf;
        
        const crypto = rsiData.find(d => d.symbol === perf.symbol);
        if (!crypto) return perf;
        
        const currentPrice = crypto.price;
        const priceChange = ((currentPrice - perf.triggerPrice) / perf.triggerPrice) * 100;
        const timePassed = Date.now() - perf.triggerTime;
        const hoursPassed = timePassed / (1000 * 60 * 60);
        
        // Determine outcome after 1 hour
        let outcome: AlertPerformance['outcome'] = 'pending';
        if (hoursPassed >= 1) {
          if (perf.type === 'oversold') {
            // For oversold, we expect price to go UP
            outcome = priceChange > 0 ? 'win' : 'loss';
          } else {
            // For overbought, we expect price to go DOWN
            outcome = priceChange < 0 ? 'win' : 'loss';
          }
        }
        
        return {
          ...perf,
          currentPrice,
          priceChange,
          outcome,
          checkedAt: Date.now()
        };
      }));
      
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
  }, [favorites, alerts, addNotificationLog]);

  useEffect(() => {
    loadData();
    // Slower polling for RSI (every 30s) since prices are real-time
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // WebSocket for real-time prices
  useEffect(() => {
    const allSymbols = [...new Set([...favorites, ...TOP_CRYPTOS])];
    
    binanceWs.connect(allSymbols);
    setWsConnected(true);

    binanceWs.onPrice((symbol, price, change) => {
      // Update price in data
      setData(prev => prev.map(crypto => {
        if (crypto.symbol + 'USDT' === symbol) {
          return { ...crypto, price };
        }
        return crypto;
      }));

      // Update price map
      setPriceMap(prev => ({ ...prev, [symbol]: price }));

      // Flash effect
      if (change !== 'none') {
        const displaySymbol = symbol.replace('USDT', '');
        setPriceFlash(prev => ({ ...prev, [displaySymbol]: change }));
        setTimeout(() => {
          setPriceFlash(prev => ({ ...prev, [displaySymbol]: 'none' }));
        }, 500);
      }
    });

    return () => {
      binanceWs.disconnect();
      setWsConnected(false);
    };
  }, [favorites]);

  // Search
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
    
    if (!data.find(d => d.symbol === symbol.replace('USDT', ''))) {
      const newData = await fetchCryptoData([symbol], priceMap);
      setData(prev => [...newData, ...prev]);
    }
  };

  const handleSaveAlert = (alert: Alert) => {
    setAlerts(prev => {
      // Check if alert already exists
      const existingIdx = prev.findIndex(a => 
        a.symbol === alert.symbol && 
        a.rsiPeriod === alert.rsiPeriod && 
        a.timeframe === alert.timeframe &&
        a.condition === alert.condition &&
        a.threshold === alert.threshold
      );
      if (existingIdx >= 0) {
        // Update existing
        const updated = [...prev];
        updated[existingIdx] = alert;
        return updated;
      }
      // Add new
      return [...prev, alert];
    });
  };

  const handleDeleteAlert = (index: number) => {
    setAlerts(prev => prev.filter((_, i) => i !== index));
  };

  const enableNotifications = () => {
    requestNotificationPermission();
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationsEnabled(permission === 'granted');
      });
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

  const hasAlerts = (symbol: string) => alerts.some(a => a.symbol === symbol + 'USDT' && a.enabled);

  // Scanner function - find extreme RSI across all pairs
  const runScanner = useCallback(async () => {
    setScanning(true);
    try {
      // Get all USDT pairs
      const infoRes = await fetch('https://api.binance.com/api/v3/exchangeInfo');
      const infoData = await infoRes.json();
      const usdtPairs = infoData.symbols
        .filter((s: { status: string; quoteAsset: string }) => 
          s.status === 'TRADING' && s.quoteAsset === 'USDT'
        )
        .map((s: { symbol: string }) => s.symbol)
        .slice(0, 100); // Limit to top 100 for speed

      // Get prices
      const pricesRes = await fetch('https://api.binance.com/api/v3/ticker/price');
      const pricesData = await pricesRes.json();
      const priceMap: Record<string, number> = {};
      for (const p of pricesData) {
        priceMap[p.symbol] = parseFloat(p.price);
      }

      const results: ScannerResult[] = [];

      // Check each pair for extremes (only 4h and 1d for speed)
      for (const symbol of usdtPairs) {
        const extremes: ScannerResult['extremes'] = [];
        
        for (const tf of [{ label: '4h', interval: '4h' }, { label: '1d', interval: '1d' }]) {
          try {
            const res = await fetch(
              `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf.interval}&limit=100`
            );
            const klines = await res.json();
            if (!Array.isArray(klines)) continue;
            
            const closes = klines.map((k: (string | number)[]) => parseFloat(String(k[4])));
            
            for (const period of [14, 50]) {
              const rsi = calculateRSI(closes, period);
              const extreme = isExtreme(rsi);
              if (extreme && rsi !== null) {
                extremes.push({
                  timeframe: tf.label,
                  rsiPeriod: period,
                  value: rsi,
                  type: extreme
                });
              }
            }
          } catch {}
        }

        if (extremes.length >= 2) { // At least 2 extreme readings
          results.push({
            symbol: symbol.replace('USDT', ''),
            name: SYMBOL_NAMES[symbol] || symbol.replace('USDT', ''),
            price: priceMap[symbol] || 0,
            extremes,
            confluenceScore: extremes.filter(e => e.type === 'oversold').length - 
                            extremes.filter(e => e.type === 'overbought').length
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 50));
      }

      // Sort by confluence score
      results.sort((a, b) => Math.abs(b.confluenceScore) - Math.abs(a.confluenceScore));
      setScannerResults(results.slice(0, 20));
    } catch (e) {
      console.error('Scanner error:', e);
    } finally {
      setScanning(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Crypto RSI</h1>
              <p className="text-xs text-zinc-400">
                Click coin for AI • Bell for alerts
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!notificationsEnabled && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={enableNotifications}
                  className="gap-2 border-yellow-600 text-yellow-400 hover:bg-yellow-900/20 hover:text-yellow-300"
                >
                  <Bell className="h-4 w-4" />
                  <span className="hidden sm:inline">Enable Alerts</span>
                </Button>
              )}
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSearchOpen(true)}
                className="gap-2 border-zinc-600 text-white hover:bg-zinc-800"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
              </Button>
              
              <div className="flex items-center gap-1">
                {wsConnected && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 mr-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                )}
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={loadData}
                  disabled={loading}
                  className="gap-2 text-white hover:bg-zinc-800"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{lastUpdated || 'Refresh'}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Legend & Toggles */}
          <div className="flex flex-col gap-2 mt-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Oversold
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Overbought
                </span>
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Fav
                </span>
                <span className="flex items-center gap-1">
                  <BellRing className="h-3 w-3 text-blue-400" />
                  Alert
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-yellow-400" />
                  Confluence (3+ TF)
                </span>
              </div>
            </div>
            
            {/* Toggles Row */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* RSI Period Toggles */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-500 mr-1">RSI:</span>
                {RSI_PERIODS.map(period => (
                  <button
                    key={period}
                    onClick={() => setVisibleRSI(prev => 
                      prev.includes(period) 
                        ? prev.filter(p => p !== period)
                        : [...prev, period].sort((a, b) => a - b)
                    )}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      visibleRSI.includes(period)
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
              
              {/* Timeframe Toggles */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-500 mr-1">TF:</span>
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf.label}
                    onClick={() => setVisibleTF(prev => 
                      prev.includes(tf.label) 
                        ? prev.filter(t => t !== tf.label)
                        : [...prev, tf.label].sort((a, b) => {
                            const order = TIMEFRAMES.map(t => t.label);
                            return order.indexOf(a) - order.indexOf(b);
                          })
                    )}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      visibleTF.includes(tf.label)
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Table */}
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-900 border-zinc-700 hover:bg-zinc-900">
                  <TableHead className="w-10 sticky left-0 bg-zinc-900 z-20"></TableHead>
                  <TableHead className="w-10 sticky left-10 bg-zinc-900 z-20"></TableHead>
                  <TableHead className="font-semibold text-white sticky left-20 bg-zinc-900 z-20 min-w-[100px]">Asset</TableHead>
                  <TableHead className="text-right font-semibold text-white pr-4 sticky left-[180px] bg-zinc-900 z-20 min-w-[90px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.8)]">Price</TableHead>
                  {RSI_PERIODS.filter(p => visibleRSI.includes(p)).map((period, idx) => (
                    <TableHead 
                      key={period} 
                      colSpan={visibleTF.length} 
                      className={`text-center font-semibold text-white py-3 ${
                        idx === 0 ? 'border-l-2 border-zinc-600' : 'border-l-2 border-zinc-700'
                      } ${idx % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-850'}`}
                    >
                      RSI{period}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow className="bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900/60">
                  <TableHead className="sticky left-0 bg-zinc-900 z-20"></TableHead>
                  <TableHead className="sticky left-10 bg-zinc-900 z-20"></TableHead>
                  <TableHead className="sticky left-20 bg-zinc-900 z-20"></TableHead>
                  <TableHead className="pr-4 sticky left-[180px] bg-zinc-900 z-20 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.8)]"></TableHead>
                  {RSI_PERIODS.filter(p => visibleRSI.includes(p)).map((period, idx) => (
                    TIMEFRAMES.filter(tf => visibleTF.includes(tf.label)).map((tf, tfIdx) => (
                      <TableHead 
                        key={`${period}-${tf.label}`} 
                        className={`text-center text-xs text-zinc-400 font-normal py-1 ${
                          tfIdx === 0 ? (idx === 0 ? 'border-l-2 border-zinc-600' : 'border-l-2 border-zinc-700') : ''
                        }`}
                      >
                        {tf.label}
                      </TableHead>
                    ))
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((crypto) => {
                  const isFav = favorites.includes(crypto.symbol + 'USDT');
                  const hasAlert = hasAlerts(crypto.symbol);
                  const confluence = calculateConfluence(crypto, 14, ['1h', '4h', '1d', '1w']);
                  const isStrong = confluence.signal === 'strong_buy' || confluence.signal === 'strong_sell';
                  return (
                    <TableRow 
                      key={crypto.symbol}
                      className={`border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-900/50 ${
                        isFav ? 'bg-yellow-500/5' : ''
                      } ${
                        confluence.signal === 'strong_buy' ? 'bg-emerald-900/20 hover:bg-emerald-900/30' : 
                        confluence.signal === 'strong_sell' ? 'bg-red-900/20 hover:bg-red-900/30' : ''
                      }`}
                      onClick={() => setSelectedCrypto(crypto)}
                    >
                      <TableCell className={`w-10 sticky left-0 z-10 ${isFav ? 'bg-yellow-950/30' : 'bg-zinc-950'}`} onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => toggleFavorite(crypto.symbol)}
                        >
                          <Star className={`h-4 w-4 ${isFav ? 'fill-yellow-500 text-yellow-500' : 'text-zinc-600'}`} />
                        </Button>
                      </TableCell>
                      <TableCell className={`w-10 sticky left-10 z-10 ${isFav ? 'bg-yellow-950/30' : 'bg-zinc-950'}`} onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setAlertCrypto(crypto)}
                        >
                          {hasAlert ? (
                            <BellRing className="h-4 w-4 text-blue-400" />
                          ) : (
                            <Bell className="h-4 w-4 text-zinc-600" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className={`sticky left-20 z-10 min-w-[100px] ${isFav ? 'bg-yellow-950/30' : 'bg-zinc-950'}`}>
                        <div className="font-semibold text-white">{crypto.symbol}</div>
                        <div className="text-xs text-zinc-400">{crypto.name}</div>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm text-white pr-2 sticky left-[180px] z-10 min-w-[120px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.8)] ${
                          isFav ? 'bg-yellow-950/30' : 
                          confluence.signal === 'strong_buy' ? 'bg-emerald-900/20' :
                          confluence.signal === 'strong_sell' ? 'bg-red-900/20' : 'bg-zinc-950'
                        }`}>
                        <div className="flex items-center justify-end gap-2">
                          <span className={`transition-colors duration-300 ${
                            priceFlash[crypto.symbol] === 'up' ? 'text-emerald-400' :
                            priceFlash[crypto.symbol] === 'down' ? 'text-red-400' : ''
                          }`}>${formatPrice(crypto.price)}</span>
                          {isStrong && (
                            <span className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded ${
                              confluence.signal === 'strong_buy' 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-red-600 text-white'
                            }`}>
                              <Zap className="h-3 w-3" />
                              {confluence.oversoldCount || confluence.overboughtCount}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {RSI_PERIODS.filter(p => visibleRSI.includes(p)).map((period, idx) => (
                        TIMEFRAMES.filter(tf => visibleTF.includes(tf.label)).map((tf, tfIdx) => (
                          <TableCell 
                            key={`${crypto.symbol}-${period}-${tf.label}`} 
                            className={`text-center py-2 ${
                              tfIdx === 0 ? (idx === 0 ? 'border-l-2 border-zinc-600' : 'border-l-2 border-zinc-700') : ''
                            }`}
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

        <p className="text-center text-xs text-zinc-500 mt-4">
          Binance data • Grok AI • Auto-refresh 60s
        </p>

        {/* Scanner Section */}
        <div className="mt-6 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="bg-zinc-900 px-4 py-3 flex items-center justify-between border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Radar className="h-4 w-4 text-purple-400" />
              Market Scanner - Extreme RSI
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={runScanner}
              disabled={scanning}
              className="gap-2 border-purple-600 text-purple-400 hover:bg-purple-900/20"
            >
              {scanning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Radar className="h-4 w-4" />
                  Scan Market
                </>
              )}
            </Button>
          </div>
          
          {scannerResults.length > 0 ? (
            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-900/50 border-zinc-800">
                    <TableHead className="text-white">Coin</TableHead>
                    <TableHead className="text-white text-right">Price</TableHead>
                    <TableHead className="text-white text-center">Signal</TableHead>
                    <TableHead className="text-white">Extreme RSI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scannerResults.map((result) => (
                    <TableRow 
                      key={result.symbol}
                      className={`border-zinc-800/50 cursor-pointer hover:bg-zinc-900/50 ${
                        result.confluenceScore > 0 ? 'bg-emerald-900/10' : 'bg-red-900/10'
                      }`}
                      onClick={() => {
                        // Add to favorites and fetch data
                        const fullSymbol = result.symbol + 'USDT';
                        if (!favorites.includes(fullSymbol)) {
                          setFavorites(prev => [...prev, fullSymbol]);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="font-semibold text-white">{result.symbol}</div>
                        <div className="text-xs text-zinc-400">{result.name}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-white">
                        ${formatPrice(result.price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          result.confluenceScore > 0 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-red-600 text-white'
                        }`}>
                          {result.confluenceScore > 0 ? '🟢 OVERSOLD' : '🔴 OVERBOUGHT'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {result.extremes.map((e, i) => (
                            <span 
                              key={i}
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                e.type === 'oversold' 
                                  ? 'bg-emerald-800 text-emerald-200' 
                                  : 'bg-red-800 text-red-200'
                              }`}
                            >
                              {e.timeframe} RSI{e.rsiPeriod}: {e.value.toFixed(1)}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-zinc-500">
              <Radar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Click "Scan Market" to find coins with extreme RSI</p>
              <p className="text-xs mt-1">Scans top 100 pairs on 4h & 1d timeframes</p>
            </div>
          )}
        </div>

        {/* Alert Performance Tracking */}
        {alertPerformance.length > 0 && (
          <div className="mt-6 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 px-4 py-3 flex items-center justify-between border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                📊 Alert Performance
                {(() => {
                  const completed = alertPerformance.filter(p => p.outcome !== 'pending');
                  const wins = completed.filter(p => p.outcome === 'win').length;
                  const total = completed.length;
                  const winRate = total > 0 ? ((wins / total) * 100).toFixed(0) : 0;
                  return total > 0 ? (
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                      Number(winRate) >= 50 ? 'bg-emerald-600' : 'bg-red-600'
                    } text-white`}>
                      {winRate}% Win Rate ({wins}/{total})
                    </span>
                  ) : null;
                })()}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAlertPerformance([])}
                className="text-zinc-400 hover:text-white text-xs"
              >
                Clear History
              </Button>
            </div>
            <div className="max-h-48 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-900/50 border-zinc-800">
                    <TableHead className="text-white">Coin</TableHead>
                    <TableHead className="text-white">Signal</TableHead>
                    <TableHead className="text-white text-right">Entry</TableHead>
                    <TableHead className="text-white text-right">Current</TableHead>
                    <TableHead className="text-white text-right">Change</TableHead>
                    <TableHead className="text-white text-center">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertPerformance.slice(0, 20).map((perf) => (
                    <TableRow key={perf.id} className="border-zinc-800/50">
                      <TableCell>
                        <div className="font-semibold text-white">{perf.symbol}</div>
                        <div className="text-xs text-zinc-400">
                          {new Date(perf.triggerTime).toLocaleTimeString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          perf.type === 'oversold' 
                            ? 'bg-emerald-800 text-emerald-200' 
                            : 'bg-red-800 text-red-200'
                        }`}>
                          {perf.type === 'oversold' ? '📈 LONG' : '📉 SHORT'}
                        </span>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          RSI{perf.rsiPeriod} {perf.timeframe}: {perf.triggerRSI.toFixed(1)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-white">
                        ${formatPrice(perf.triggerPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-white">
                        {perf.currentPrice ? `$${formatPrice(perf.currentPrice)}` : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${
                        (perf.priceChange ?? 0) > 0 ? 'text-emerald-400' : 
                        (perf.priceChange ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400'
                      }`}>
                        {perf.priceChange !== undefined 
                          ? `${perf.priceChange > 0 ? '+' : ''}${perf.priceChange.toFixed(2)}%`
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-center">
                        {perf.outcome === 'win' && (
                          <span className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold">
                            ✓ WIN
                          </span>
                        )}
                        {perf.outcome === 'loss' && (
                          <span className="px-2 py-1 rounded bg-red-600 text-white text-xs font-bold">
                            ✗ LOSS
                          </span>
                        )}
                        {perf.outcome === 'pending' && (
                          <span className="px-2 py-1 rounded bg-zinc-700 text-zinc-300 text-xs">
                            ⏳ 1h wait
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Notification Log */}
        {notificationLogs.length > 0 && (
          <div className="mt-6 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BellRing className="h-4 w-4 text-blue-400" />
                Alert Log
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNotificationLogs([])}
                className="text-zinc-400 hover:text-white text-xs"
              >
                Clear
              </Button>
            </div>
            <div className="max-h-48 overflow-auto">
              {notificationLogs.map((log) => (
                <div 
                  key={log.id}
                  className={`px-4 py-2 border-b border-zinc-800/50 flex items-center justify-between ${
                    log.type === 'oversold' ? 'bg-emerald-900/10' : 'bg-red-900/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${
                      log.type === 'oversold' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {log.symbol}
                    </span>
                    <span className="text-sm text-zinc-300">{log.message}</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {log.timestamp.toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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

      {/* Alert Modal */}
      <AlertModal
        crypto={alertCrypto}
        open={!!alertCrypto}
        onClose={() => setAlertCrypto(null)}
        alerts={alerts}
        onSaveAlert={handleSaveAlert}
        onDeleteAlert={handleDeleteAlert}
      />
    </main>
  );
}
