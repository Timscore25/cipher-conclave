// Lightweight emote system for retro chat
export const EMOTES = {
  ':Kappa:': '/emotes/kappa.png',
  ':Pog:': '/emotes/pog.png', 
  ':FeelsGoodMan:': '/emotes/feelsgood.png',
  ':LUL:': '/emotes/lul.png'
} as const;

export type EmoteKey = keyof typeof EMOTES;

// Parse message text and replace emote tokens with React elements
export function parseEmotes(text: string): (string | { type: 'emote'; key: EmoteKey; alt: string })[] {
  const parts: (string | { type: 'emote'; key: EmoteKey; alt: string })[] = [];
  let lastIndex = 0;
  
  // Find all emote matches
  const emoteKeys = Object.keys(EMOTES) as EmoteKey[];
  const regex = new RegExp(emoteKeys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    // Add text before emote
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Add emote
    const emoteKey = match[0] as EmoteKey;
    parts.push({
      type: 'emote',
      key: emoteKey,
      alt: emoteKey
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : [text];
}