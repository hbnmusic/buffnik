import type { ReactElement } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { Directory, Paths } from 'expo-file-system';

import type { Look } from '../engine';
import type { Character } from '../state/characters';
import { RARITY_BACKGROUND, VIEWBOX, buildFigure, type El } from './characterSpec';

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

/** The character: an art-pack image if the look has one, otherwise the drawn figure. */
export function CharacterView({ character, look, tier, width = 200 }: { character: Character; look: Look; tier: number; width?: number }) {
  const height = (width * 320) / 200;
  if (look.pack) {
    const path = look.pack.tiers?.[String(Math.min(5, Math.max(1, tier)))] ?? look.pack.image;
    return (
      <View style={{ width, height, backgroundColor: RARITY_BACKGROUND[look.rarity], borderRadius: 16, overflow: 'hidden' }}>
        <Image source={{ uri: packImageUri(look.pack.packId, path) }} style={{ width, height }} resizeMode="contain" />
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
  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden' }}>
      <Svg width={width} height={height} viewBox={VIEWBOX}>
        {els.map(render)}
      </Svg>
    </View>
  );
}
