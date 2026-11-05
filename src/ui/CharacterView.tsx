import { useState, type ReactElement } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { Directory, Paths } from 'expo-file-system';

import type { Look } from '../engine';
import type { Character } from '../state/characters';
import { RARITY_BACKGROUND, VIEWBOX, buildFigure, type El } from './characterSpec';
import { figureRect, placeGear, type WornItem } from './gearPlacement';

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function render(el: El, key: number): ReactElement {
  const props: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(el.p)) props[camel(k)] = v;
  const kids = el.c?.map(render);
  switch (el.t) {
    case 'g':
      return <G key={key} {...props}>{kids}</G>;
    case 'rect':
      return <Rect key={key} {...(props as object)} />;
    case 'circle':
      return <Circle key={key} {...(props as object)} />;
    case 'ellipse':
      return <Ellipse key={key} {...(props as object)} />;
    default:
      return <Path key={key} {...(props as object)} />;
  }
}

/** File URI of an image inside an imported art pack. */
export function packImageUri(packId: string, path: string): string {
  const dir = new Directory(Paths.document, 'packs', packId);
  return `${dir.uri}${path}`;
}

/** Worn gear drawn over (or, for packs and bags, behind) the character. */
function GearLayer({ items, rect, behind }: { items: WornItem[]; rect: ReturnType<typeof figureRect>; behind: boolean }) {
  return (
    <>
      {items.map((g) => {
        const p = placeGear(g.slot, g.fit, rect);
        if (p.behind !== behind || !g.look.pack) return null;
        return (
          <Image
            key={g.look.id}
            source={{ uri: packImageUri(g.look.pack.packId, g.look.pack.image) }}
            style={{ position: 'absolute', left: p.left, top: p.top, width: p.size, height: p.size }}
            resizeMode="contain"
          />
        );
      })}
    </>
  );
}

/** The character: an art-pack image if the look has one, otherwise the drawn figure. Worn gear is drawn on top. */
export function CharacterView({ character, look, tier, width = 200, gear = [] }: { character: Character; look: Look; tier: number; width?: number; gear?: WornItem[] }) {
  const height = (width * 320) / 200;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  if (look.pack) {
    const path = look.pack.tiers?.[String(Math.min(5, Math.max(1, tier)))] ?? look.pack.image;
    const rect = figureRect(width, height, size?.w, size?.h);
    return (
      <View style={{ width, height, backgroundColor: RARITY_BACKGROUND[look.rarity], borderRadius: 16, overflow: 'hidden' }}>
        <GearLayer items={gear} rect={rect} behind />
        <Image
          source={{ uri: packImageUri(look.pack.packId, path) }}
          style={{ width, height }}
          resizeMode="contain"
          onLoad={(e) => setSize({ w: e.nativeEvent.source.width, h: e.nativeEvent.source.height })}
        />
        <GearLayer items={gear} rect={rect} behind={false} />
      </View>
    );
  }
  const els = buildFigure({
    tier,
    skin: character.skin,
    hairStyle: character.hairStyle,
    hairColor: character.hairColor,
    eyeColor: character.eyeColor,
    look: { style: look.style, primary: look.primary, secondary: look.secondary, accent: look.accent, accessory: look.accessory },
    background: RARITY_BACKGROUND[look.rarity],
  });
  const rect = figureRect(width, height);
  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden' }}>
      <Svg width={width} height={height} viewBox={VIEWBOX}>
        {els.map(render)}
      </Svg>
      <GearLayer items={gear} rect={rect} behind={false} />
      <GearLayer items={gear} rect={rect} behind />
    </View>
  );
}

/** A gear item as a square icon (art-pack image on the rarity colour). */
export function ItemIcon({ look, size = 56 }: { look: Look; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: RARITY_BACKGROUND[look.rarity], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {look.pack ? <Image source={{ uri: packImageUri(look.pack.packId, look.pack.image) }} style={{ width: size - 8, height: size - 8 }} resizeMode="contain" /> : null}
    </View>
  );
}
