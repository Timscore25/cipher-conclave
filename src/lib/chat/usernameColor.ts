// Generate deterministic colors for usernames
// Ensures consistent colors across sessions and good contrast on dark backgrounds

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export function getUsernameColor(username: string): string {
  const hash = simpleHash(username);
  
  // Generate HSL values that work well on dark backgrounds
  const hue = hash % 360;
  // High saturation for vibrant colors, but not too high to maintain readability
  const saturation = 65 + (hash % 25); // 65-90%
  // Ensure lightness provides good contrast on dark background
  const lightness = 55 + (hash % 25); // 55-80% - bright enough to read on dark bg
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Predefined neon colors for special roles/states
export const SPECIAL_COLORS = {
  mod: '#ff69b4', // hot pink
  verified: '#00ff41', // matrix green
  system: '#00ffff', // cyan
  self: '#ffd700' // gold
} as const;