import type { RelicDef } from '../model/types';

export const RELICS: RelicDef[] = [
  {
    id: 'ember_sigil',
    name: 'Ember Sigil',
    icon: '🔆',
    text: 'At the start of combat, apply 3 Burning to the enemy.',
    combatStart: [{ type: 'status', status: 'burning', amount: 3, on: 'enemy' }],
  },
  {
    id: 'iron_casing',
    name: 'Iron Casing',
    icon: '🧱',
    text: 'At the start of each beat, gain 5 Block.',
    beatStart: [{ type: 'block', amount: 5, on: 'player' }],
  },
  {
    id: 'brass_gearbox',
    name: 'Brass Gearbox',
    icon: '🔩',
    text: 'At the start of combat, reduce all item cooldowns by 1.',
    combatStart: [{ type: 'cooldowns', amount: 1 }],
  },
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(
  RELICS.map((relic) => [relic.id, relic]),
);

export function getRelic(id: string): RelicDef {
  const def = RELIC_BY_ID[id];
  if (!def) throw new Error(`Unknown relic: ${id}`);
  return def;
}
