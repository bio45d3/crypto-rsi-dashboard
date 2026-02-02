// Binance WebSocket Manager

export type PriceCallback = (symbol: string, price: number, change: 'up' | 'down' | 'none') => void;
export type KlineCallback = (symbol: string, timeframe: string, close: number) => void;

class BinanceWebSocket {
  private priceWs: WebSocket | null = null;
  private klineWs: WebSocket | null = null;
  private priceCallbacks: PriceCallback[] = [];
  private klineCallbacks: KlineCallback[] = [];
  private lastPrices: Record<string, number> = {};
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private symbols: string[] = [];
  private timeframes: string[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

  connect(symbols: string[]) {
    this.symbols = symbols;
    this.connectPriceStream();
    this.connectKlineStream();
  }

  private connectPriceStream() {
    if (this.priceWs) {
      this.priceWs.close();
    }

    const streams = this.symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    try {
      this.priceWs = new WebSocket(url);

      this.priceWs.onopen = () => {
        console.log('Price WebSocket connected');
      };

      this.priceWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.data && data.data.s && data.data.c) {
            const symbol = data.data.s;
            const price = parseFloat(data.data.c);
            const lastPrice = this.lastPrices[symbol];
            
            let change: 'up' | 'down' | 'none' = 'none';
            if (lastPrice !== undefined) {
              if (price > lastPrice) change = 'up';
              else if (price < lastPrice) change = 'down';
            }
            
            this.lastPrices[symbol] = price;
            this.priceCallbacks.forEach(cb => cb(symbol, price, change));
          }
        } catch (e) {
          console.error('Price WS parse error:', e);
        }
      };

      this.priceWs.onerror = (error) => {
        console.error('Price WebSocket error:', error);
      };

      this.priceWs.onclose = () => {
        console.log('Price WebSocket closed, reconnecting...');
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error('Failed to connect price WS:', e);
      this.scheduleReconnect();
    }
  }

  private connectKlineStream() {
    if (this.klineWs) {
      this.klineWs.close();
    }

    // Subscribe to 1m klines for faster updates (we'll aggregate for RSI)
    const streams = this.symbols.map(s => `${s.toLowerCase()}@kline_1m`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    try {
      this.klineWs = new WebSocket(url);

      this.klineWs.onopen = () => {
        console.log('Kline WebSocket connected');
      };

      this.klineWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.data && data.data.k) {
            const kline = data.data.k;
            const symbol = kline.s;
            const timeframe = kline.i;
            const close = parseFloat(kline.c);
            const isClosed = kline.x; // Is this kline closed?
            
            // Notify on every tick for real-time feel
            this.klineCallbacks.forEach(cb => cb(symbol, timeframe, close));
          }
        } catch (e) {
          console.error('Kline WS parse error:', e);
        }
      };

      this.klineWs.onerror = (error) => {
        console.error('Kline WebSocket error:', error);
      };

      this.klineWs.onclose = () => {
        console.log('Kline WebSocket closed');
      };
    } catch (e) {
      console.error('Failed to connect kline WS:', e);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.symbols);
    }, 5000);
  }

  onPrice(callback: PriceCallback) {
    this.priceCallbacks.push(callback);
  }

  onKline(callback: KlineCallback) {
    this.klineCallbacks.push(callback);
  }

  updateSymbols(symbols: string[]) {
    if (JSON.stringify(symbols.sort()) !== JSON.stringify(this.symbols.sort())) {
      this.symbols = symbols;
      this.connect(symbols);
    }
  }

  disconnect() {
    if (this.priceWs) {
      this.priceWs.close();
      this.priceWs = null;
    }
    if (this.klineWs) {
      this.klineWs.close();
      this.klineWs = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.priceCallbacks = [];
    this.klineCallbacks = [];
  }
}

export const binanceWs = new BinanceWebSocket();
