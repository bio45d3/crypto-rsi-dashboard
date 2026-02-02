import { NextRequest, NextResponse } from 'next/server';

interface RSIData {
  symbol: string;
  name: string;
  price: number;
  timeframes: {
    [timeframe: string]: {
      [period: number]: number | null;
    };
  };
}

interface Signal {
  type: 'scalp_long' | 'scalp_short' | 'swing_long' | 'swing_short' | 'neutral';
  strength: 'weak' | 'moderate' | 'strong';
  urgency: 'low' | 'medium' | 'high';
  reasons: string[];
}

function detectSignals(data: RSIData): Signal {
  const reasons: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  let shortTermSignal = 0; // positive = bullish, negative = bearish
  let longTermSignal = 0;

  const shortTFs = ['1m', '5m', '15m'];
  const longTFs = ['1h', '4h', '1d'];
  const periods = [14, 50, 75];

  // Analyze short-term timeframes (for scalping)
  for (const tf of shortTFs) {
    const tfData = data.timeframes[tf];
    if (!tfData) continue;

    for (const period of periods) {
      const rsi = tfData[period];
      if (rsi === null || rsi === undefined) continue;

      if (rsi < 25) {
        shortTermSignal += 2;
        reasons.push(`${tf} RSI${period} deeply oversold (${rsi.toFixed(1)})`);
      } else if (rsi < 30) {
        shortTermSignal += 1;
        reasons.push(`${tf} RSI${period} oversold (${rsi.toFixed(1)})`);
      } else if (rsi > 75) {
        shortTermSignal -= 2;
        reasons.push(`${tf} RSI${period} deeply overbought (${rsi.toFixed(1)})`);
      } else if (rsi > 70) {
        shortTermSignal -= 1;
        reasons.push(`${tf} RSI${period} overbought (${rsi.toFixed(1)})`);
      }
    }
  }

  // Analyze long-term timeframes (for swing)
  for (const tf of longTFs) {
    const tfData = data.timeframes[tf];
    if (!tfData) continue;

    for (const period of periods) {
      const rsi = tfData[period];
      if (rsi === null || rsi === undefined) continue;

      if (rsi < 30) {
        longTermSignal += 2;
        bullishScore += 2;
        reasons.push(`${tf} RSI${period} oversold (${rsi.toFixed(1)}) - swing opportunity`);
      } else if (rsi < 40) {
        longTermSignal += 1;
        bullishScore += 1;
      } else if (rsi > 70) {
        longTermSignal -= 2;
        bearishScore += 2;
        reasons.push(`${tf} RSI${period} overbought (${rsi.toFixed(1)}) - potential reversal`);
      } else if (rsi > 60) {
        longTermSignal -= 1;
        bearishScore += 1;
      }
    }
  }

  // Check for RSI divergence patterns (higher TF vs lower TF)
  const rsi1h14 = data.timeframes['1h']?.[14];
  const rsi15m14 = data.timeframes['15m']?.[14];
  if (rsi1h14 && rsi15m14) {
    if (rsi1h14 < 40 && rsi15m14 > 50) {
      reasons.push('Bullish divergence: 15m recovering while 1h still low');
      bullishScore += 2;
    } else if (rsi1h14 > 60 && rsi15m14 < 50) {
      reasons.push('Bearish divergence: 15m weakening while 1h still high');
      bearishScore += 2;
    }
  }

  // Determine signal type
  const totalScore = shortTermSignal + longTermSignal;
  const absScore = Math.abs(totalScore);
  
  let type: Signal['type'] = 'neutral';
  let strength: Signal['strength'] = 'weak';
  let urgency: Signal['urgency'] = 'low';

  if (absScore >= 6) {
    strength = 'strong';
    urgency = 'high';
  } else if (absScore >= 3) {
    strength = 'moderate';
    urgency = 'medium';
  }

  // Prioritize scalp signals if short-term is strong
  if (Math.abs(shortTermSignal) >= 4) {
    type = shortTermSignal > 0 ? 'scalp_long' : 'scalp_short';
    urgency = 'high';
  } else if (Math.abs(longTermSignal) >= 4) {
    type = longTermSignal > 0 ? 'swing_long' : 'swing_short';
  } else if (totalScore >= 3) {
    type = Math.abs(shortTermSignal) > Math.abs(longTermSignal) ? 'scalp_long' : 'swing_long';
  } else if (totalScore <= -3) {
    type = Math.abs(shortTermSignal) > Math.abs(longTermSignal) ? 'scalp_short' : 'swing_short';
  }

  return {
    type,
    strength,
    urgency,
    reasons: reasons.slice(0, 6) // Top 6 reasons
  };
}

export async function POST(request: NextRequest) {
  try {
    const { cryptoData } = await request.json() as { cryptoData: RSIData };
    
    if (!cryptoData) {
      return NextResponse.json({ error: 'Missing crypto data' }, { status: 400 });
    }

    // Detect signals
    const signals = detectSignals(cryptoData);

    // Build prompt for Grok
    const rsiSummary = Object.entries(cryptoData.timeframes)
      .map(([tf, periods]) => {
        const values = Object.entries(periods)
          .map(([p, v]) => `RSI${p}: ${v !== null ? (v as number).toFixed(1) : 'N/A'}`)
          .join(', ');
        return `${tf}: ${values}`;
      })
      .join('\n');

    const prompt = `You are a crypto trading analyst. Analyze this RSI data for ${cryptoData.symbol} (${cryptoData.name}) at $${cryptoData.price.toFixed(4)}.

RSI Data across timeframes:
${rsiSummary}

Rule-based signal detected: ${signals.type.replace('_', ' ').toUpperCase()} (${signals.strength} strength, ${signals.urgency} urgency)
Key observations:
${signals.reasons.map(r => '- ' + r).join('\n')}

Provide analysis for BOTH trading styles:

**SCALPING** (1m-15m timeframes, RSI 5/9/14):
- Is there a scalp opportunity right now?
- Direction (long/short) and confidence
- Quick entry/exit levels

**SWING TRADING** (1h-1d timeframes, RSI 14/50/75):
- Is there a swing setup forming?
- Direction and timeframe to hold
- Key support/resistance levels

Keep each section to 2-3 sentences. Be direct and actionable.`;

    let grokAnalysis = '';
    const grokApiKey = process.env.GROK_API_KEY;
    
    if (grokApiKey) {
      try {
        const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${grokApiKey}`
          },
          body: JSON.stringify({
            model: 'grok-3',
            messages: [
              { role: 'system', content: 'You are a professional crypto trader giving quick, actionable signals. Be concise and direct.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 400,
            temperature: 0.7
          })
        });

        if (grokRes.ok) {
          const grokData = await grokRes.json();
          grokAnalysis = grokData.choices?.[0]?.message?.content || '';
        }
      } catch (e) {
        console.error('Grok API error:', e);
      }
    }

    return NextResponse.json({
      signals,
      analysis: grokAnalysis || 'Grok analysis unavailable. Check API key.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
