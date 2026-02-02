export const TOP_CRYPTOS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT'
];

export const SYMBOL_NAMES: Record<string, string> = {
  'BTCUSDT': 'Bitcoin',
  'ETHUSDT': 'Ethereum',
  'BNBUSDT': 'BNB',
  'XRPUSDT': 'XRP',
  'SOLUSDT': 'Solana',
  'ADAUSDT': 'Cardano',
  'DOGEUSDT': 'Dogecoin',
  'AVAXUSDT': 'Avalanche',
  'DOTUSDT': 'Polkadot',
  'MATICUSDT': 'Polygon'
};

export const TIMEFRAMES = [
  { label: '1m', interval: '1m', limit: 250 },
  { label: '5m', interval: '5m', limit: 250 },
  { label: '15m', interval: '15m', limit: 250 },
  { label: '1h', interval: '1h', limit: 250 },
  { label: '4h', interval: '4h', limit: 250 },
  { label: '1d', interval: '1d', limit: 250 },
  { label: '1w', interval: '1w', limit: 250 },
];

export const RSI_PERIODS = [5, 9, 14, 50, 75, 100, 200];

export interface RSIData {
  symbol: string;
  name: string;
  price: number;
  timeframes: {
    [timeframe: string]: {
      [period: number]: number | null;
    };
  };
}
