# Character art packs

An art pack is a zip file you import in the app (Hero tab, Art packs, Import art pack). Each look in the pack is a full-body image. When you wear a look from a pack, the image replaces the drawn character. Pack looks join the loot pool and the shop, priced by rarity.

## Zip layout

```
my-pack.zip
  pack.json
  ember.png
  ember_1.png     (optional: body tier variants)
  ember_5.png
  frost.png
```

The files can also sit inside one top-level folder in the zip.

## pack.json

```json
{
  "format": 1,
  "id": "ember-pack",
  "name": "Ember Pack",
  "looks": [
    { "id": "ember", "name": "Ember Knight", "rarity": "epic", "image": "ember.png",
      "tiers": { "1": "ember_1.png", "5": "ember_5.png" } },
    { "id": "frost", "name": "Frost Runner", "rarity": "rare", "image": "frost.png" }
  ]
}
```

- `id` (pack and look): lowercase letters, digits and dashes, up to 40 characters.
- `rarity`: `common`, `rare`, `epic` or `legendary`. Shop prices are 200, 600, 1,500 and 4,000 coins.
- `image`: png, jpg or webp, up to 8 MB per file, 120 MB per pack, up to 200 looks.
- `tiers` (optional): images for body build tiers 1 to 5. Any tier without an image uses `image`. Tier 1 is the starting build; higher tiers are broader and more muscular.
- Images work best portrait, about 2:3 (the app shows them at 5:8 with the whole figure visible), with a plain or transparent background. Transparent png shows the rarity colour behind the character.

## Re-importing

Importing a pack with the same `id` replaces it. Removing a pack removes its looks from the wardrobe and the shop; looks you bought are forgotten along with it, and anyone wearing one is switched to a starter look.

## Prompt template for Gemini

> Full-body anime-style character, standing front view, centred, neutral pose, whole figure visible from head to feet, plain flat background. Outfit: [describe]. Build: [slim / athletic / muscular / very muscular]. Keep the face, hair and proportions identical across images. Portrait, 2:3.

To get the five build tiers, ask for the same prompt five times with only the build changed, using the first image as the reference so the face and outfit match.
