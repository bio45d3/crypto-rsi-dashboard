// Fear & Greed Index from alternative.me

export interface FearGreedData {
  value: number;
  classification: string;
  timestamp: number;
}

export async function fetchFearGreed(): Promise<FearGreedData | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data.data || !data.data[0]) return null;
    
    const item = data.data[0];
    return {
      value: parseInt(item.value),
      classification: item.value_classification,
      timestamp: parseInt(item.timestamp) * 1000
    };
  } catch (e) {
    console.error('Failed to fetch Fear & Greed:', e);
    return null;
  }
}

export function getFearGreedColor(value: number): { text: string; bg: string; border: string } {
  if (value <= 25) {
    // Extreme Fear - buying opportunity
    return { 
      text: 'text-emerald-300', 
      bg: 'bg-emerald-900/80', 
      border: 'border-emerald-600' 
    };
  } else if (value <= 45) {
    // Fear
    return { 
      text: 'text-emerald-400', 
      bg: 'bg-emerald-900/50', 
      border: 'border-emerald-700' 
    };
  } else if (value <= 55) {
    // Neutral
    return { 
      text: 'text-zinc-300', 
      bg: 'bg-zinc-800', 
      border: 'border-zinc-600' 
    };
  } else if (value <= 75) {
    // Greed
    return { 
      text: 'text-orange-400', 
      bg: 'bg-orange-900/50', 
      border: 'border-orange-700' 
    };
  } else {
    // Extreme Greed - caution
    return { 
      text: 'text-red-300', 
      bg: 'bg-red-900/80', 
      border: 'border-red-600' 
    };
  }
}

export function getFearGreedEmoji(value: number): string {
  if (value <= 25) return '😱';
  if (value <= 45) return '😰';
  if (value <= 55) return '😐';
  if (value <= 75) return '😏';
  return '🤑';
}
