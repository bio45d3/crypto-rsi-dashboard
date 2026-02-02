// Multi-Timeframe RSI Signal System

export type TrendState = 'bull' | 'bear' | 'neutral';
export type StretchState = 'oversold' | 'overbought' | 'neutral';
export type BiasType = 'long_only' | 'short_only' | 'no_trade';
export type SignalType = 'scalp_long' | 'scalp_short' | 'swing_long' | 'swing_short' | null;
export type RegimeType = 'bull_regime' | 'bear_regime' | 'transition';

export interface TimeframeAnalysis {
  timeframe: string;
  trendState: TrendState;
  stretchState: StretchState;
  rsi5: number | null;
  rsi9: number | null;
  rsi14: number | null;
  rsi14Prev: number | null;
  rsi50: number | null;
  rsi75: number | null;
  rsi100: number | null;
  rsi200: number | null;
  bullFlip: boolean;
  bearFlip: boolean;
  rsi14Rising: boolean;
  rsi14Falling: boolean;
}

export interface SignalResult {
  symbol: string;
  swingBias: BiasType;
  scalpBias: BiasType;
  regime: RegimeType;
  signal: SignalType;
  confidence: number;
  reasons: string[];
  timeframes: Record<string, TimeframeAnalysis>;
  divergence: 'bullish' | 'bearish' | null;
}

// Calculate trend state for a timeframe
export function calculateTrendState(rsi14: number | null, rsi50: number | null, rsi200: number | null): TrendState {
  if (rsi14 === null || rsi50 === null) return 'neutral';
  
  // Relaxed RSI200 - if null, we skip it
  const rsi200Check = rsi200 === null ? true : rsi200 >= 50;
  const rsi200BearCheck = rsi200 === null ? true : rsi200 <= 50;
  
  if (rsi14 >= 50 && rsi50 >= 50 && rsi200Check) {
    return 'bull';
  }
  if (rsi14 <= 50 && rsi50 <= 50 && rsi200BearCheck) {
    return 'bear';
  }
  return 'neutral';
}

// Calculate stretch state
export function calculateStretchState(rsi5: number | null, rsi9: number | null): StretchState {
  if (rsi5 === null && rsi9 === null) return 'neutral';
  
  const isOversold = (rsi5 !== null && rsi5 <= 25) || (rsi9 !== null && rsi9 <= 30);
  const isOverbought = (rsi5 !== null && rsi5 >= 75) || (rsi9 !== null && rsi9 >= 70);
  
  if (isOversold) return 'oversold';
  if (isOverbought) return 'overbought';
  return 'neutral';
}

// Detect momentum flip (requires current and previous RSI values)
export function detectBullFlip(
  rsi5: number | null, 
  rsi9: number | null, 
  rsi5Prev: number | null,
  rsi9Prev: number | null,
  rsi14Rising: boolean
): boolean {
  if (rsi5 === null || rsi9 === null || rsi5Prev === null || rsi9Prev === null) return false;
  
  // RSI5 crosses above RSI9
  const crossedAbove = rsi5Prev <= rsi9Prev && rsi5 > rsi9;
  return crossedAbove && rsi14Rising;
}

export function detectBearFlip(
  rsi5: number | null, 
  rsi9: number | null, 
  rsi5Prev: number | null,
  rsi9Prev: number | null,
  rsi14Falling: boolean
): boolean {
  if (rsi5 === null || rsi9 === null || rsi5Prev === null || rsi9Prev === null) return false;
  
  // RSI5 crosses below RSI9
  const crossedBelow = rsi5Prev >= rsi9Prev && rsi5 < rsi9;
  return crossedBelow && rsi14Falling;
}

// Calculate swing bias
export function calculateSwingBias(trend1D: TrendState, trend4H: TrendState): BiasType {
  if (trend1D === 'bull' && trend4H === 'bull') return 'long_only';
  if (trend1D === 'bear' && trend4H === 'bear') return 'short_only';
  return 'no_trade';
}

// Calculate scalp bias
export function calculateScalpBias(trend1H: TrendState, trend4H: TrendState): BiasType {
  if (trend1H === 'bull' || trend4H === 'bull') return 'long_only';
  if (trend1H === 'bear' || trend4H === 'bear') return 'short_only';
  return 'no_trade';
}

// Calculate regime from higher TF RSI 75/100/200
export function calculateRegime(
  rsi75_4H: number | null,
  rsi100_4H: number | null,
  rsi200_4H: number | null,
  rsi75_1D: number | null,
  rsi100_1D: number | null,
  rsi200_1D: number | null
): RegimeType {
  const values = [rsi75_4H, rsi100_4H, rsi200_4H, rsi75_1D, rsi100_1D, rsi200_1D].filter(v => v !== null) as number[];
  if (values.length < 3) return 'transition';
  
  const aboveFifty = values.filter(v => v > 50).length;
  const belowFifty = values.filter(v => v < 50).length;
  
  if (aboveFifty >= values.length * 0.7) return 'bull_regime';
  if (belowFifty >= values.length * 0.7) return 'bear_regime';
  return 'transition';
}

// Calculate confidence score (0-100)
export function calculateConfidence(
  bias: BiasType,
  rsi14_1D: number | null,
  rsi14_4H: number | null,
  rsi5: number | null,
  rsi9: number | null,
  hasFlip: boolean,
  rsi14Confirms: boolean,
  isSwing: boolean,
  rsi14_1H?: number | null
): number {
  let score = 0;
  
  // Bias strength (0-40): distance from 50 on higher TFs
  if (rsi14_1D !== null && rsi14_4H !== null) {
    const biasStrength = Math.min(40, Math.abs(rsi14_1D - 50) + Math.abs(rsi14_4H - 50));
    score += biasStrength;
  }
  
  // Setup quality (0-30): how stretched it got
  if (rsi5 !== null && rsi9 !== null) {
    if (bias === 'long_only') {
      // Lower RSI = better for longs
      const stretch = Math.max(0, 50 - Math.min(rsi5, rsi9));
      score += Math.min(30, stretch);
    } else if (bias === 'short_only') {
      // Higher RSI = better for shorts
      const stretch = Math.max(0, Math.max(rsi5, rsi9) - 50);
      score += Math.min(30, stretch);
    }
  }
  
  // Trigger quality (0-30)
  if (hasFlip) score += 15;
  if (rsi14Confirms) score += 10;
  if (isSwing && rsi14_1H !== null && rsi14_1H !== undefined) {
    // 1H confirmation for swings
    if ((bias === 'long_only' && rsi14_1H >= 50) || (bias === 'short_only' && rsi14_1H <= 50)) {
      score += 5;
    }
  }
  
  return Math.min(100, Math.round(score));
}

// Check scalp long conditions
export function checkScalpLong(
  scalpBias: BiasType,
  tf5m: TimeframeAnalysis,
  tf1m: TimeframeAnalysis | null,
  tf15m: TimeframeAnalysis
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (scalpBias !== 'long_only') {
    return { valid: false, reasons: ['Scalp bias is not Long Only'] };
  }
  reasons.push('✓ Scalp Bias: Long Only');
  
  // 5m oversold stretch
  if (tf5m.stretchState !== 'oversold') {
    return { valid: false, reasons: [...reasons, '✗ 5m not in oversold stretch'] };
  }
  reasons.push(`✓ 5m Oversold (RSI5: ${tf5m.rsi5?.toFixed(1)}, RSI9: ${tf5m.rsi9?.toFixed(1)})`);
  
  // Bull flip on 1m or 5m
  const hasFlip = (tf1m && tf1m.bullFlip) || tf5m.bullFlip;
  if (!hasFlip) {
    return { valid: false, reasons: [...reasons, '✗ No bull flip on 1m/5m'] };
  }
  reasons.push('✓ Bull flip detected');
  
  // Optional: 15m RSI14 >= 45
  if (tf15m.rsi14 !== null && tf15m.rsi14 < 45) {
    reasons.push(`⚠ 15m RSI14 (${tf15m.rsi14.toFixed(1)}) < 45 - weak momentum`);
  } else if (tf15m.rsi14 !== null) {
    reasons.push(`✓ 15m RSI14 (${tf15m.rsi14.toFixed(1)}) >= 45`);
  }
  
  return { valid: true, reasons };
}

// Check scalp short conditions
export function checkScalpShort(
  scalpBias: BiasType,
  tf5m: TimeframeAnalysis,
  tf1m: TimeframeAnalysis | null,
  tf15m: TimeframeAnalysis
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (scalpBias !== 'short_only') {
    return { valid: false, reasons: ['Scalp bias is not Short Only'] };
  }
  reasons.push('✓ Scalp Bias: Short Only');
  
  // 5m overbought stretch
  if (tf5m.stretchState !== 'overbought') {
    return { valid: false, reasons: [...reasons, '✗ 5m not in overbought stretch'] };
  }
  reasons.push(`✓ 5m Overbought (RSI5: ${tf5m.rsi5?.toFixed(1)}, RSI9: ${tf5m.rsi9?.toFixed(1)})`);
  
  // Bear flip on 1m or 5m
  const hasFlip = (tf1m && tf1m.bearFlip) || tf5m.bearFlip;
  if (!hasFlip) {
    return { valid: false, reasons: [...reasons, '✗ No bear flip on 1m/5m'] };
  }
  reasons.push('✓ Bear flip detected');
  
  // Optional: 15m RSI14 <= 55
  if (tf15m.rsi14 !== null && tf15m.rsi14 > 55) {
    reasons.push(`⚠ 15m RSI14 (${tf15m.rsi14.toFixed(1)}) > 55 - weak momentum`);
  } else if (tf15m.rsi14 !== null) {
    reasons.push(`✓ 15m RSI14 (${tf15m.rsi14.toFixed(1)}) <= 55`);
  }
  
  return { valid: true, reasons };
}

// Check swing long conditions
export function checkSwingLong(
  swingBias: BiasType,
  tf4H: TimeframeAnalysis,
  tf1H: TimeframeAnalysis,
  divergence: 'bullish' | 'bearish' | null
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (swingBias !== 'long_only') {
    return { valid: false, reasons: ['Swing bias is not Long Only (need 1D+4H bull)'] };
  }
  reasons.push('✓ Swing Bias: Long Only (1D Bull + 4H Bull)');
  
  // 4H reset zone: RSI14 between 35-45
  if (tf4H.rsi14 === null) {
    return { valid: false, reasons: [...reasons, '✗ 4H RSI14 not available'] };
  }
  
  const inResetZone = tf4H.rsi14 >= 35 && tf4H.rsi14 <= 45;
  if (!inResetZone) {
    // Check if just exited reset zone (crossed above 45)
    if (tf4H.rsi14 > 45 && tf4H.rsi14 < 55 && tf4H.rsi14Rising) {
      reasons.push(`✓ 4H RSI14 (${tf4H.rsi14.toFixed(1)}) crossed above 45 reset zone`);
    } else {
      return { valid: false, reasons: [...reasons, `✗ 4H RSI14 (${tf4H.rsi14.toFixed(1)}) not in reset zone (35-45)`] };
    }
  } else {
    reasons.push(`✓ 4H RSI14 (${tf4H.rsi14.toFixed(1)}) in reset zone (35-45)`);
  }
  
  // RSI14(4H) turning up
  if (!tf4H.rsi14Rising) {
    return { valid: false, reasons: [...reasons, '✗ 4H RSI14 not rising'] };
  }
  reasons.push('✓ 4H RSI14 is rising');
  
  // 1H RSI14 >= 50 and rising
  if (tf1H.rsi14 === null || tf1H.rsi14 < 50) {
    return { valid: false, reasons: [...reasons, `✗ 1H RSI14 (${tf1H.rsi14?.toFixed(1) ?? 'N/A'}) < 50`] };
  }
  if (!tf1H.rsi14Rising) {
    return { valid: false, reasons: [...reasons, '✗ 1H RSI14 not rising'] };
  }
  reasons.push(`✓ 1H RSI14 (${tf1H.rsi14.toFixed(1)}) >= 50 and rising`);
  
  // Divergence boost
  if (divergence === 'bullish') {
    reasons.push('⭐ A+ Signal: Bullish divergence detected');
  }
  
  return { valid: true, reasons };
}

// Check swing short conditions
export function checkSwingShort(
  swingBias: BiasType,
  tf4H: TimeframeAnalysis,
  tf1H: TimeframeAnalysis,
  divergence: 'bullish' | 'bearish' | null
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (swingBias !== 'short_only') {
    return { valid: false, reasons: ['Swing bias is not Short Only (need 1D+4H bear)'] };
  }
  reasons.push('✓ Swing Bias: Short Only (1D Bear + 4H Bear)');
  
  // 4H reset zone: RSI14 between 55-65
  if (tf4H.rsi14 === null) {
    return { valid: false, reasons: [...reasons, '✗ 4H RSI14 not available'] };
  }
  
  const inResetZone = tf4H.rsi14 >= 55 && tf4H.rsi14 <= 65;
  if (!inResetZone) {
    // Check if just exited reset zone (crossed below 55)
    if (tf4H.rsi14 < 55 && tf4H.rsi14 > 45 && tf4H.rsi14Falling) {
      reasons.push(`✓ 4H RSI14 (${tf4H.rsi14.toFixed(1)}) crossed below 55 reset zone`);
    } else {
      return { valid: false, reasons: [...reasons, `✗ 4H RSI14 (${tf4H.rsi14.toFixed(1)}) not in reset zone (55-65)`] };
    }
  } else {
    reasons.push(`✓ 4H RSI14 (${tf4H.rsi14.toFixed(1)}) in reset zone (55-65)`);
  }
  
  // RSI14(4H) turning down
  if (!tf4H.rsi14Falling) {
    return { valid: false, reasons: [...reasons, '✗ 4H RSI14 not falling'] };
  }
  reasons.push('✓ 4H RSI14 is falling');
  
  // 1H RSI14 <= 50 and falling
  if (tf1H.rsi14 === null || tf1H.rsi14 > 50) {
    return { valid: false, reasons: [...reasons, `✗ 1H RSI14 (${tf1H.rsi14?.toFixed(1) ?? 'N/A'}) > 50`] };
  }
  if (!tf1H.rsi14Falling) {
    return { valid: false, reasons: [...reasons, '✗ 1H RSI14 not falling'] };
  }
  reasons.push(`✓ 1H RSI14 (${tf1H.rsi14.toFixed(1)}) <= 50 and falling`);
  
  // Divergence boost
  if (divergence === 'bearish') {
    reasons.push('⭐ A+ Signal: Bearish divergence detected');
  }
  
  return { valid: true, reasons };
}
