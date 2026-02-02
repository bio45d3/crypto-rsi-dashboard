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
import { Star, Search, RefreshCw, TrendingUp, TrendingDown, Minus, Bell, BellRing, Zap, Radar, ExternalLink, Grid3X3, BarChart3, Activity } from 'lucide-react';
import { fetchFundingRates, formatFundingRate, getFundingColor, type FundingRate } from '@/lib/funding';
import { fetchFearGreed, getFearGreedColor, getFearGreedEmoji, type FearGreedData } from '@/lib/feargreed';
import { detectDivergence, calculateRSIArray, type DivergenceResult } from '@/lib/divergence';
import { runBacktest, type BacktestResult } from '@/lib/backtest';
import { 
  calculateTrendState, calculateStretchState, calculateSwingBias, calculateScalpBias,
  calculateRegime, calculateConfidence, checkScalpLong, checkScalpShort,
  checkSwingLong, checkSwingShort, detectBullFlip, detectBearFlip,
  type TrendState, type SignalResult, type TimeframeAnalysis, type SignalType
} from '@/lib/signals';

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

  // Reset result when crypto changes
  useEffect(() => {
    setResult(null);
  }, [crypto]);

  const runAnalysis = async () => {
    if (!crypto) return;
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
  };

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

        <div className="space-y-4">
          {/* RSI Table - Always shown */}
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

          {/* Grok Analysis - On Demand */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 bg-zinc-900/50 rounded-lg border border-zinc-800">
              <RefreshCw className="h-8 w-8 animate-spin text-zinc-500 mb-3" />
              <p className="text-zinc-400">Analyzing with Grok...</p>
            </div>
          ) : result ? (
            <div className="space-y-3">
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
            </div>
          ) : (
            <Button 
              onClick={runAnalysis}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              🤖 Analyze with Grok AI
            </Button>
          )}
        </div>
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
  
  // New feature states
  const [fundingRates, setFundingRates] = useState<Record<string, FundingRate>>({});
  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null);
  const [divergences, setDivergences] = useState<Record<string, DivergenceResult>>({});
  const [viewMode, setViewMode] = useState<'table' | 'heatmap'>('table');
  const [backtestCrypto, setBacktestCrypto] = useState<RSIData | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestTimeframe, setBacktestTimeframe] = useState('4h');
  const [signalResults, setSignalResults] = useState<SignalResult[]>([]);
  const [signalScanning, setSignalScanning] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<SignalResult | null>(null);

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
      
      // Fetch funding rates
      const funding = await fetchFundingRates();
      setFundingRates(funding);
      
      // Fetch Fear & Greed
      const fng = await fetchFearGreed();
      setFearGreed(fng);
      
      // Detect divergences for each crypto on 4h timeframe
      const divs: Record<string, DivergenceResult> = {};
      for (const crypto of rsiData) {
        try {
          const klinesRes = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${crypto.symbol}USDT&interval=4h&limit=50`
          );
          const klines = await klinesRes.json();
          if (Array.isArray(klines) && klines.length > 20) {
            const closes = klines.map((k: (string | number)[]) => parseFloat(String(k[4])));
            const rsiArr = calculateRSIArray(closes, 14);
            const div = detectDivergence(closes, rsiArr, 30);
            if (div) {
              div.timeframe = '4h';
              divs[crypto.symbol] = div;
            }
          }
        } catch {}
      }
      setDivergences(divs);
      
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
      // Get 24hr ticker data (includes volume) and sort by volume for top 100
      const tickerRes = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      const tickerData = await tickerRes.json();
      
      // Filter USDT pairs and sort by 24h quote volume
      const usdtTickers = tickerData
        .filter((t: { symbol: string }) => t.symbol.endsWith('USDT'))
        .sort((a: { quoteVolume: string }, b: { quoteVolume: string }) => 
          parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)
        )
        .slice(0, 100); // Top 100 by volume
      
      const usdtPairs = usdtTickers.map((t: { symbol: string }) => t.symbol);
      
      // Build price map from ticker data
      const priceMap: Record<string, number> = {};
      for (const t of tickerData) {
        priceMap[t.symbol] = parseFloat(t.lastPrice);
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

  // Signal Scanner - Full multi-timeframe analysis
  const runSignalScanner = useCallback(async () => {
    setSignalScanning(true);
    const results: SignalResult[] = [];
    
    try {
      // Get top coins by volume
      const tickerRes = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      const tickerData = await tickerRes.json();
      const top50 = tickerData
        .filter((t: { symbol: string }) => t.symbol.endsWith('USDT'))
        .sort((a: { quoteVolume: string }, b: { quoteVolume: string }) => 
          parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 50)
        .map((t: { symbol: string; lastPrice: string }) => ({ 
          symbol: t.symbol, 
          price: parseFloat(t.lastPrice) 
        }));

      for (const { symbol, price } of top50) {
        const timeframes: Record<string, TimeframeAnalysis> = {};
        const tfConfigs = [
          { label: '1m', interval: '1m' },
          { label: '5m', interval: '5m' },
          { label: '15m', interval: '15m' },
          { label: '1h', interval: '1h' },
          { label: '4h', interval: '4h' },
          { label: '1d', interval: '1d' },
        ];

        // Fetch all timeframes
        for (const tf of tfConfigs) {
          try {
            const res = await fetch(
              `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf.interval}&limit=220`
            );
            const klines = await res.json();
            if (!Array.isArray(klines) || klines.length < 15) continue;

            const closes = klines.map((k: (string | number)[]) => parseFloat(String(k[4])));
            
            // Calculate RSI values for different periods
            const calcRSI = (period: number): { current: number | null; prev: number | null } => {
              if (closes.length < period + 2) return { current: null, prev: null };
              const rsiArr = calculateRSIArray(closes, period);
              if (rsiArr.length < 2) return { current: null, prev: null };
              return { 
                current: rsiArr[rsiArr.length - 1], 
                prev: rsiArr[rsiArr.length - 2] 
              };
            };

            const rsi5 = calcRSI(5);
            const rsi9 = calcRSI(9);
            const rsi14 = calcRSI(14);
            const rsi50 = calcRSI(50);
            const rsi75 = calcRSI(75);
            const rsi100 = calcRSI(100);
            const rsi200 = calcRSI(200);

            const rsi14Rising = rsi14.current !== null && rsi14.prev !== null && rsi14.current > rsi14.prev;
            const rsi14Falling = rsi14.current !== null && rsi14.prev !== null && rsi14.current < rsi14.prev;

            // Detect momentum flips
            const bullFlip = detectBullFlip(rsi5.current, rsi9.current, rsi5.prev, rsi9.prev, rsi14Rising);
            const bearFlip = detectBearFlip(rsi5.current, rsi9.current, rsi5.prev, rsi9.prev, rsi14Falling);

            timeframes[tf.label] = {
              timeframe: tf.label,
              trendState: calculateTrendState(rsi14.current, rsi50.current, rsi200.current),
              stretchState: calculateStretchState(rsi5.current, rsi9.current),
              rsi5: rsi5.current,
              rsi9: rsi9.current,
              rsi14: rsi14.current,
              rsi14Prev: rsi14.prev,
              rsi50: rsi50.current,
              rsi75: rsi75.current,
              rsi100: rsi100.current,
              rsi200: rsi200.current,
              bullFlip,
              bearFlip,
              rsi14Rising,
              rsi14Falling
            };
          } catch {}
          await new Promise(r => setTimeout(r, 30)); // Rate limiting
        }

        // Skip if we don't have enough timeframes
        if (!timeframes['4h'] || !timeframes['1h'] || !timeframes['1d']) continue;

        // Calculate biases
        const swingBias = calculateSwingBias(timeframes['1d'].trendState, timeframes['4h'].trendState);
        const scalpBias = calculateScalpBias(timeframes['1h'].trendState, timeframes['4h'].trendState);
        
        // Calculate regime
        const regime = calculateRegime(
          timeframes['4h'].rsi75, timeframes['4h'].rsi100, timeframes['4h'].rsi200,
          timeframes['1d'].rsi75, timeframes['1d'].rsi100, timeframes['1d'].rsi200
        );

        // Check for signals
        let signal: SignalType = null;
        let reasons: string[] = [];
        let confidence = 0;

        // Check swing signals first (higher priority)
        if (swingBias === 'long_only') {
          const swingLong = checkSwingLong(swingBias, timeframes['4h'], timeframes['1h'], null);
          if (swingLong.valid) {
            signal = 'swing_long';
            reasons = swingLong.reasons;
            confidence = calculateConfidence(
              swingBias, timeframes['1d'].rsi14, timeframes['4h'].rsi14,
              timeframes['4h'].rsi5, timeframes['4h'].rsi9,
              true, timeframes['1h'].rsi14Rising, true, timeframes['1h'].rsi14
            );
          }
        } else if (swingBias === 'short_only') {
          const swingShort = checkSwingShort(swingBias, timeframes['4h'], timeframes['1h'], null);
          if (swingShort.valid) {
            signal = 'swing_short';
            reasons = swingShort.reasons;
            confidence = calculateConfidence(
              swingBias, timeframes['1d'].rsi14, timeframes['4h'].rsi14,
              timeframes['4h'].rsi5, timeframes['4h'].rsi9,
              true, timeframes['1h'].rsi14Falling, true, timeframes['1h'].rsi14
            );
          }
        }

        // Check scalp signals if no swing signal
        if (!signal && timeframes['5m'] && timeframes['15m']) {
          if (scalpBias === 'long_only') {
            const scalpLong = checkScalpLong(scalpBias, timeframes['5m'], timeframes['1m'] || null, timeframes['15m']);
            if (scalpLong.valid) {
              signal = 'scalp_long';
              reasons = scalpLong.reasons;
              confidence = calculateConfidence(
                scalpBias, timeframes['1d'].rsi14, timeframes['4h'].rsi14,
                timeframes['5m'].rsi5, timeframes['5m'].rsi9,
                timeframes['5m'].bullFlip || (timeframes['1m']?.bullFlip ?? false),
                timeframes['15m'].rsi14 !== null && timeframes['15m'].rsi14 >= 45,
                false
              );
            }
          } else if (scalpBias === 'short_only') {
            const scalpShort = checkScalpShort(scalpBias, timeframes['5m'], timeframes['1m'] || null, timeframes['15m']);
            if (scalpShort.valid) {
              signal = 'scalp_short';
              reasons = scalpShort.reasons;
              confidence = calculateConfidence(
                scalpBias, timeframes['1d'].rsi14, timeframes['4h'].rsi14,
                timeframes['5m'].rsi5, timeframes['5m'].rsi9,
                timeframes['5m'].bearFlip || (timeframes['1m']?.bearFlip ?? false),
                timeframes['15m'].rsi14 !== null && timeframes['15m'].rsi14 <= 55,
                false
              );
            }
          }
        }

        // Add if there's a signal OR if there's a valid bias (show setup status)
        if (signal && confidence >= 40) {
          results.push({
            symbol: symbol.replace('USDT', ''),
            swingBias,
            scalpBias,
            regime,
            signal,
            confidence,
            reasons,
            timeframes,
            divergence: null
          });
        } else if (swingBias !== 'no_trade' || scalpBias !== 'no_trade') {
          // Show coins with valid bias even without signal (watching)
          results.push({
            symbol: symbol.replace('USDT', ''),
            swingBias,
            scalpBias,
            regime,
            signal: null,
            confidence: 0,
            reasons: [
              swingBias !== 'no_trade' ? `Swing bias: ${swingBias.replace('_', ' ')}` : 'No swing bias',
              scalpBias !== 'no_trade' ? `Scalp bias: ${scalpBias.replace('_', ' ')}` : 'No scalp bias',
              `Waiting for setup/trigger...`
            ],
            timeframes,
            divergence: null
          });
        }
      }

      // Sort: signals first by confidence, then watching coins
      results.sort((a, b) => {
        if (a.signal && !b.signal) return -1;
        if (!a.signal && b.signal) return 1;
        return b.confidence - a.confidence;
      });
      setSignalResults(results.slice(0, 30));
    } catch (e) {
      console.error('Signal scanner error:', e);
    } finally {
      setSignalScanning(false);
    }
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-[1600px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Crypto RSI</h1>
                <p className="text-xs text-zinc-400">
                  Click coin for AI • Bell for alerts
                </p>
              </div>
              
              {/* Fear & Greed Index */}
              {fearGreed && (
                <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getFearGreedColor(fearGreed.value).bg} ${getFearGreedColor(fearGreed.value).border}`}>
                  <span className="text-lg">{getFearGreedEmoji(fearGreed.value)}</span>
                  <div className="flex flex-col">
                    <span className={`text-sm font-bold ${getFearGreedColor(fearGreed.value).text}`}>
                      {fearGreed.value}
                    </span>
                    <span className="text-[10px] text-zinc-400">{fearGreed.classification}</span>
                  </div>
                </div>
              )}
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
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-purple-400" />
                  Divergence
                </span>
              </div>
              
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    viewMode === 'table' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Table
                </button>
                <button
                  onClick={() => setViewMode('heatmap')}
                  className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                    viewMode === 'heatmap' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Grid3X3 className="h-3 w-3" />
                  Heatmap
                </button>
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

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        
        {/* Heatmap View */}
        {viewMode === 'heatmap' && (
          <div className="rounded-lg border border-zinc-800 overflow-hidden mb-4">
            <div className="bg-zinc-900 px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-blue-400" />
                RSI Heatmap (RSI14)
              </h3>
            </div>
            <div className="p-4 overflow-x-auto">
              <div className="grid gap-1" style={{ gridTemplateColumns: `120px repeat(${TIMEFRAMES.length}, 60px)` }}>
                {/* Header row */}
                <div className="text-xs text-zinc-400 font-medium p-2">Asset</div>
                {TIMEFRAMES.map(tf => (
                  <div key={tf.label} className="text-xs text-zinc-400 font-medium p-2 text-center">{tf.label}</div>
                ))}
                
                {/* Data rows */}
                {sortedData.map(crypto => (
                  <>
                    <div key={`${crypto.symbol}-label`} className="text-sm text-white font-medium p-2 flex items-center gap-1">
                      {crypto.symbol}
                      {divergences[crypto.symbol] && (
                        <span className={`text-[10px] ${divergences[crypto.symbol].type === 'bullish' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {divergences[crypto.symbol].type === 'bullish' ? '↗' : '↘'}
                        </span>
                      )}
                    </div>
                    {TIMEFRAMES.map(tf => {
                      const rsi = crypto.timeframes[tf.label]?.[14];
                      let bgColor = 'bg-zinc-800';
                      if (rsi !== null && rsi !== undefined) {
                        if (rsi < 20) bgColor = 'bg-emerald-500';
                        else if (rsi < 30) bgColor = 'bg-emerald-600';
                        else if (rsi < 40) bgColor = 'bg-emerald-800/60';
                        else if (rsi < 50) bgColor = 'bg-zinc-700';
                        else if (rsi < 60) bgColor = 'bg-zinc-700';
                        else if (rsi < 70) bgColor = 'bg-red-800/60';
                        else if (rsi < 80) bgColor = 'bg-red-600';
                        else bgColor = 'bg-red-500';
                      }
                      return (
                        <div 
                          key={`${crypto.symbol}-${tf.label}`}
                          className={`${bgColor} rounded p-2 text-center text-xs font-mono text-white cursor-pointer hover:opacity-80 transition-opacity`}
                          onClick={() => setSelectedCrypto(crypto)}
                          title={`${crypto.symbol} ${tf.label}: RSI ${rsi?.toFixed(1) ?? 'N/A'}`}
                        >
                          {rsi?.toFixed(0) ?? '-'}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* Table View */}
        {viewMode === 'table' && (
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
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-white">{crypto.symbol}</span>
                          {/* Divergence Badge */}
                          {divergences[crypto.symbol] && (
                            <span className={`text-[10px] px-1 py-0.5 rounded ${
                              divergences[crypto.symbol].type === 'bullish' 
                                ? 'bg-emerald-800 text-emerald-200' 
                                : 'bg-red-800 text-red-200'
                            }`}>
                              {divergences[crypto.symbol].type === 'bullish' ? '↗' : '↘'}
                            </span>
                          )}
                          {/* TradingView Link */}
                          <a
                            href={`https://www.tradingview.com/chart/?symbol=BINANCE:${crypto.symbol}USDT`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-zinc-500 hover:text-blue-400 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {/* Backtest Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBacktestCrypto(crypto);
                              setBacktestResult(null);
                            }}
                            className="text-zinc-500 hover:text-purple-400 transition-colors"
                            title="Backtest RSI signals"
                          >
                            <BarChart3 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="text-xs text-zinc-400">{crypto.name}</div>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm text-white pr-2 sticky left-[180px] z-10 min-w-[140px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.8)] ${
                          isFav ? 'bg-yellow-950/30' : 
                          confluence.signal === 'strong_buy' ? 'bg-emerald-900/20' :
                          confluence.signal === 'strong_sell' ? 'bg-red-900/20' : 'bg-zinc-950'
                        }`}>
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-2">
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
                          {/* Funding Rate */}
                          {fundingRates[crypto.symbol + 'USDT'] && (
                            <span className={`text-[10px] px-1 py-0.5 rounded ${getFundingColor(fundingRates[crypto.symbol + 'USDT'].fundingRate).bg} ${getFundingColor(fundingRates[crypto.symbol + 'USDT'].fundingRate).text}`}>
                              {formatFundingRate(fundingRates[crypto.symbol + 'USDT'].fundingRate)}
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
        )}

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

        {/* MTF Signal Dashboard */}
        <div className="mt-6 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="bg-zinc-900 px-4 py-3 flex items-center justify-between border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              MTF Signal Dashboard
              <span className="text-xs text-zinc-400 font-normal ml-2">
                (Trend + Stretch + Flip)
              </span>
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={runSignalScanner}
              disabled={signalScanning}
              className="gap-2 border-cyan-600 text-cyan-400 hover:bg-cyan-900/20"
            >
              {signalScanning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4" />
                  Scan Signals
                </>
              )}
            </Button>
          </div>
          
          {signalResults.length > 0 ? (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-900/50 border-zinc-800">
                    <TableHead className="text-white">Coin</TableHead>
                    <TableHead className="text-white text-center">Signal</TableHead>
                    <TableHead className="text-white text-center">Confidence</TableHead>
                    <TableHead className="text-white text-center">Swing Bias</TableHead>
                    <TableHead className="text-white text-center">Scalp Bias</TableHead>
                    <TableHead className="text-white text-center">Regime</TableHead>
                    <TableHead className="text-white">Analysis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signalResults.map((result) => (
                    <TableRow 
                      key={result.symbol}
                      className={`border-zinc-800/50 cursor-pointer hover:bg-zinc-900/50 ${
                        result.signal?.includes('long') ? 'bg-emerald-900/10' : 
                        result.signal?.includes('short') ? 'bg-red-900/10' : ''
                      }`}
                      onClick={() => setSelectedSignal(result)}
                    >
                      <TableCell>
                        <div className="font-semibold text-white">{result.symbol}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          result.signal === 'swing_long' ? 'bg-emerald-600 text-white' :
                          result.signal === 'swing_short' ? 'bg-red-600 text-white' :
                          result.signal === 'scalp_long' ? 'bg-emerald-700 text-white' :
                          result.signal === 'scalp_short' ? 'bg-red-700 text-white' :
                          'bg-zinc-700/50 text-zinc-400'
                        }`}>
                          {result.signal === 'swing_long' ? '🟢 SWING LONG' :
                           result.signal === 'swing_short' ? '🔴 SWING SHORT' :
                           result.signal === 'scalp_long' ? '🟢 SCALP LONG' :
                           result.signal === 'scalp_short' ? '🔴 SCALP SHORT' :
                           '👁 WATCHING'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-mono font-bold ${
                          result.confidence >= 75 ? 'text-emerald-400' :
                          result.confidence >= 60 ? 'text-yellow-400' :
                          'text-zinc-400'
                        }`}>
                          {result.confidence}
                          {result.confidence >= 75 && ' ⭐'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          result.swingBias === 'long_only' ? 'bg-emerald-800 text-emerald-200' :
                          result.swingBias === 'short_only' ? 'bg-red-800 text-red-200' :
                          'bg-zinc-700 text-zinc-300'
                        }`}>
                          {result.swingBias === 'long_only' ? 'LONG' :
                           result.swingBias === 'short_only' ? 'SHORT' : 'NO TRADE'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          result.scalpBias === 'long_only' ? 'bg-emerald-800 text-emerald-200' :
                          result.scalpBias === 'short_only' ? 'bg-red-800 text-red-200' :
                          'bg-zinc-700 text-zinc-300'
                        }`}>
                          {result.scalpBias === 'long_only' ? 'LONG' :
                           result.scalpBias === 'short_only' ? 'SHORT' : 'NO TRADE'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          result.regime === 'bull_regime' ? 'bg-emerald-900 text-emerald-300' :
                          result.regime === 'bear_regime' ? 'bg-red-900 text-red-300' :
                          'bg-yellow-900 text-yellow-300'
                        }`}>
                          {result.regime === 'bull_regime' ? '🐂 BULL' :
                           result.regime === 'bear_regime' ? '🐻 BEAR' : '⚠️ CHOP'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-zinc-400 max-w-[200px] truncate">
                          {result.reasons[0]}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-zinc-500">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Click "Scan Signals" for multi-timeframe analysis</p>
              <p className="text-xs mt-1 max-w-md mx-auto">
                Analyzes Trend State (RSI14/50/200), Stretch (RSI5/9), and Momentum Flips across all timeframes to generate swing and scalp signals
              </p>
            </div>
          )}
        </div>

        {/* Signal Detail Modal */}
        <Dialog open={!!selectedSignal} onOpenChange={(o) => !o && setSelectedSignal(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto bg-zinc-950 border-zinc-800">
            {selectedSignal && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 text-white">
                    <span className="text-2xl font-bold">{selectedSignal.symbol}</span>
                    <span className={`px-3 py-1 rounded text-sm font-bold ${
                      selectedSignal.signal?.includes('long') ? 'bg-emerald-600' : 'bg-red-600'
                    } text-white`}>
                      {selectedSignal.signal?.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className={`font-mono ${
                      selectedSignal.confidence >= 75 ? 'text-emerald-400' : 'text-yellow-400'
                    }`}>
                      {selectedSignal.confidence}% {selectedSignal.confidence >= 75 ? '⭐ A+' : ''}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Bias & Regime Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`rounded-lg p-3 border ${
                      selectedSignal.swingBias === 'long_only' ? 'bg-emerald-900/30 border-emerald-800' :
                      selectedSignal.swingBias === 'short_only' ? 'bg-red-900/30 border-red-800' :
                      'bg-zinc-900/50 border-zinc-700'
                    }`}>
                      <p className="text-xs text-zinc-400 mb-1">Swing Bias</p>
                      <p className="text-white font-semibold">
                        {selectedSignal.swingBias === 'long_only' ? '🟢 Long Only' :
                         selectedSignal.swingBias === 'short_only' ? '🔴 Short Only' : '⚪ No Trade'}
                      </p>
                      <p className="text-xs text-zinc-500">1D + 4H trend aligned</p>
                    </div>
                    <div className={`rounded-lg p-3 border ${
                      selectedSignal.scalpBias === 'long_only' ? 'bg-emerald-900/30 border-emerald-800' :
                      selectedSignal.scalpBias === 'short_only' ? 'bg-red-900/30 border-red-800' :
                      'bg-zinc-900/50 border-zinc-700'
                    }`}>
                      <p className="text-xs text-zinc-400 mb-1">Scalp Bias</p>
                      <p className="text-white font-semibold">
                        {selectedSignal.scalpBias === 'long_only' ? '🟢 Long Only' :
                         selectedSignal.scalpBias === 'short_only' ? '🔴 Short Only' : '⚪ No Trade'}
                      </p>
                      <p className="text-xs text-zinc-500">1H or 4H trend</p>
                    </div>
                    <div className={`rounded-lg p-3 border ${
                      selectedSignal.regime === 'bull_regime' ? 'bg-emerald-900/30 border-emerald-800' :
                      selectedSignal.regime === 'bear_regime' ? 'bg-red-900/30 border-red-800' :
                      'bg-yellow-900/30 border-yellow-800'
                    }`}>
                      <p className="text-xs text-zinc-400 mb-1">Market Regime</p>
                      <p className="text-white font-semibold">
                        {selectedSignal.regime === 'bull_regime' ? '🐂 Bull Regime' :
                         selectedSignal.regime === 'bear_regime' ? '🐻 Bear Regime' : '⚠️ Transition'}
                      </p>
                      <p className="text-xs text-zinc-500">RSI 75/100/200 filter</p>
                    </div>
                  </div>

                  {/* Signal Reasons */}
                  <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                    <p className="text-sm text-zinc-400 mb-2">📋 Signal Checklist</p>
                    <ul className="space-y-1">
                      {selectedSignal.reasons.map((reason, i) => (
                        <li key={i} className={`text-sm ${
                          reason.startsWith('✓') ? 'text-emerald-400' :
                          reason.startsWith('✗') ? 'text-red-400' :
                          reason.startsWith('⚠') ? 'text-yellow-400' :
                          reason.startsWith('⭐') ? 'text-purple-400' :
                          'text-white'
                        }`}>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Timeframe Breakdown */}
                  <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800/50">
                    <p className="text-sm text-zinc-400 mb-3">📊 Timeframe Analysis</p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-zinc-800">
                            <TableHead className="text-white">TF</TableHead>
                            <TableHead className="text-white text-center">Trend</TableHead>
                            <TableHead className="text-white text-center">Stretch</TableHead>
                            <TableHead className="text-white text-center">RSI5</TableHead>
                            <TableHead className="text-white text-center">RSI9</TableHead>
                            <TableHead className="text-white text-center">RSI14</TableHead>
                            <TableHead className="text-white text-center">RSI50</TableHead>
                            <TableHead className="text-white text-center">Flip</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => {
                            const data = selectedSignal.timeframes[tf];
                            if (!data) return null;
                            return (
                              <TableRow key={tf} className="border-zinc-800/50">
                                <TableCell className="font-medium text-white">{tf}</TableCell>
                                <TableCell className="text-center">
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    data.trendState === 'bull' ? 'bg-emerald-800 text-emerald-200' :
                                    data.trendState === 'bear' ? 'bg-red-800 text-red-200' :
                                    'bg-zinc-700 text-zinc-300'
                                  }`}>
                                    {data.trendState.toUpperCase()}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    data.stretchState === 'oversold' ? 'bg-emerald-800 text-emerald-200' :
                                    data.stretchState === 'overbought' ? 'bg-red-800 text-red-200' :
                                    'bg-zinc-700 text-zinc-300'
                                  }`}>
                                    {data.stretchState === 'oversold' ? 'OS' :
                                     data.stretchState === 'overbought' ? 'OB' : '-'}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs">
                                  <RSICell value={data.rsi5} />
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs">
                                  <RSICell value={data.rsi9} />
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="font-mono text-xs text-white">
                                    {data.rsi14?.toFixed(1) ?? '-'}
                                    {data.rsi14Rising && <span className="text-emerald-400 ml-1">↑</span>}
                                    {data.rsi14Falling && <span className="text-red-400 ml-1">↓</span>}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center font-mono text-xs text-white">
                                  {data.rsi50?.toFixed(1) ?? '-'}
                                </TableCell>
                                <TableCell className="text-center">
                                  {data.bullFlip && <span className="text-emerald-400 text-xs">🟢 BULL</span>}
                                  {data.bearFlip && <span className="text-red-400 text-xs">🔴 BEAR</span>}
                                  {!data.bullFlip && !data.bearFlip && <span className="text-zinc-500 text-xs">-</span>}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

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

      {/* Backtest Modal */}
      <Dialog open={!!backtestCrypto} onOpenChange={(o) => !o && setBacktestCrypto(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white">
              <BarChart3 className="h-5 w-5 text-purple-400" />
              RSI Backtest: {backtestCrypto?.symbol}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Timeframe Selector */}
            <div className="flex items-center gap-3">
              <Label className="text-zinc-400">Timeframe:</Label>
              <Select value={backtestTimeframe} onValueChange={(v) => {
                setBacktestTimeframe(v);
                setBacktestResult(null);
              }}>
                <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="1h" className="text-white">1H</SelectItem>
                  <SelectItem value="4h" className="text-white">4H</SelectItem>
                  <SelectItem value="1d" className="text-white">1D</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={async () => {
                  if (!backtestCrypto) return;
                  setBacktestLoading(true);
                  const result = await runBacktest(backtestCrypto.symbol, backtestTimeframe);
                  setBacktestResult(result);
                  setBacktestLoading(false);
                }}
                disabled={backtestLoading}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {backtestLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Running...
                  </>
                ) : 'Run Backtest'}
              </Button>
            </div>

            {backtestResult && (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Oversold Stats */}
                  <div className="bg-emerald-900/30 rounded-lg p-4 border border-emerald-800">
                    <h4 className="text-emerald-400 font-semibold mb-2 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Oversold Signals (RSI &lt; 30)
                    </h4>
                    <div className="text-sm space-y-1 text-white">
                      <p>Signals: <span className="font-mono">{backtestResult.oversoldStats.count}</span></p>
                      {backtestTimeframe !== '1d' && (
                        <p>Win Rate 1h: <span className={`font-mono ${backtestResult.oversoldStats.winRate1h >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{backtestResult.oversoldStats.winRate1h.toFixed(1)}%</span></p>
                      )}
                      {backtestTimeframe === '1h' && (
                        <p>Win Rate 4h: <span className={`font-mono ${backtestResult.oversoldStats.winRate4h >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{backtestResult.oversoldStats.winRate4h.toFixed(1)}%</span></p>
                      )}
                      <p>Win Rate 24h: <span className={`font-mono ${backtestResult.oversoldStats.winRate24h >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{backtestResult.oversoldStats.winRate24h.toFixed(1)}%</span></p>
                      <p>Avg Return 24h: <span className={`font-mono ${backtestResult.oversoldStats.avgReturn24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{backtestResult.oversoldStats.avgReturn24h >= 0 ? '+' : ''}{backtestResult.oversoldStats.avgReturn24h.toFixed(2)}%</span></p>
                    </div>
                  </div>

                  {/* Overbought Stats */}
                  <div className="bg-red-900/30 rounded-lg p-4 border border-red-800">
                    <h4 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
                      <TrendingDown className="h-4 w-4" />
                      Overbought Signals (RSI &gt; 70)
                    </h4>
                    <div className="text-sm space-y-1 text-white">
                      <p>Signals: <span className="font-mono">{backtestResult.overboughtStats.count}</span></p>
                      {backtestTimeframe !== '1d' && (
                        <p>Win Rate 1h: <span className={`font-mono ${backtestResult.overboughtStats.winRate1h >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{backtestResult.overboughtStats.winRate1h.toFixed(1)}%</span></p>
                      )}
                      {backtestTimeframe === '1h' && (
                        <p>Win Rate 4h: <span className={`font-mono ${backtestResult.overboughtStats.winRate4h >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{backtestResult.overboughtStats.winRate4h.toFixed(1)}%</span></p>
                      )}
                      <p>Win Rate 24h: <span className={`font-mono ${backtestResult.overboughtStats.winRate24h >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{backtestResult.overboughtStats.winRate24h.toFixed(1)}%</span></p>
                      <p>Avg Return 24h: <span className={`font-mono ${backtestResult.overboughtStats.avgReturn24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{backtestResult.overboughtStats.avgReturn24h >= 0 ? '+' : ''}{backtestResult.overboughtStats.avgReturn24h.toFixed(2)}%</span></p>
                    </div>
                  </div>
                </div>

                {/* Recent Signals Table */}
                <div className="bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <div className="px-4 py-2 border-b border-zinc-800">
                    <p className="text-sm text-zinc-400">Recent Signals (last 50)</p>
                  </div>
                  <div className="max-h-48 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800">
                          <TableHead className="text-white text-xs">Date</TableHead>
                          <TableHead className="text-white text-xs">Type</TableHead>
                          <TableHead className="text-white text-xs">RSI</TableHead>
                          <TableHead className="text-white text-xs">Price</TableHead>
                          <TableHead className="text-white text-xs">24h Return</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backtestResult.signals.slice(0, 20).map((signal, i) => (
                          <TableRow key={i} className="border-zinc-800/50">
                            <TableCell className="text-xs text-zinc-400">
                              {new Date(signal.timestamp).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                signal.type === 'oversold' ? 'bg-emerald-800 text-emerald-200' : 'bg-red-800 text-red-200'
                              }`}>
                                {signal.type}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-white">{signal.rsi.toFixed(1)}</TableCell>
                            <TableCell className="text-xs font-mono text-white">${formatPrice(signal.price)}</TableCell>
                            <TableCell className={`text-xs font-mono ${
                              signal.return24h !== null && signal.return24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {signal.return24h !== null ? `${signal.return24h >= 0 ? '+' : ''}${signal.return24h.toFixed(2)}%` : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}

            {!backtestResult && !backtestLoading && (
              <p className="text-zinc-500 text-center py-8">
                Select a timeframe and click "Run Backtest" to analyze historical RSI signals
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
