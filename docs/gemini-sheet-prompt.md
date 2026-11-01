# Making a character sheet with Gemini

Buffnik can import one image that holds a character, optional alternate outfits and a grid of shop items (Hero tab, Import character sheet). This is the prompt to give Gemini, and how the importer reads the result.

## How to use it

1. In Gemini, choose image creation, attach 4 to 8 reference images of the character (varied angles, full body, official art if you have it), and paste the prompt below with the fields in `[brackets]` filled in.
2. Use a landscape (16:9) image. Download the full-size version, as a PNG if offered.
3. Copy Gemini's text reply (the numbered list) as well. Buffnik uses it to name the items.
4. In Buffnik: Hero, Import character sheet (or share the image from Gemini or your gallery to Buffnik). Pick the image, paste the list, press Cut the sheet, check the preview (tap any stray piece to leave it out), import.
5. For more than about 24 items, generate several sheets and import each one into the same pack ("Add to this pack"). Smaller sheets give larger, more consistent items. [inference: image generators tend to blur and repeat items when asked for 50 or more in one image.] Three sheets of 24 give 72 items.

Suggested split:
- Sheet 1: character, 4 alternate outfits, items focused on `weapon` and `back`.
- Sheet 2: items only, focused on `body`, `head`, `hands`, `feet`.
- Sheet 3: items only, focused on `face` and `accessory`, plus fitness-themed extras.

For sheets 2 and 3 choose the same pack under "Add to a pack" and set "Items only". Item numbers restart at 1 on every sheet, so paste each sheet's own list.

## The prompt

```
Create ONE image: a 2D game asset sheet for a single character. Use the attached reference images as the only source for the character's face, hair, body shape, colours and costume design. Keep the design faithful to the references.

CHARACTER: [character name and where they are from]
TOP BAND: [include, or omit for sheets 2 and 3: then the sheet has items only]
ITEM FOCUS FOR THIS SHEET: [for example "weapons and things worn on the back", or "clothing and armour", or "accessories, jewellery and props"]
NUMBER OF ITEMS: [24]
ART STYLE: anime, cel-shaded 2D, clean dark outlines, flat colours with simple shading, the same style and lighting on every piece.

LAYOUT (landscape 16:9, strict):
1. Top band (skip this entire point if TOP BAND says omit): the base character on the left, standing, full body from head to feet, front view, neutral pose, arms slightly away from the body, in the character's signature outfit. To the right of the base character, in one row at the same scale and height, four alternate full-body outfits of the same character (same face, hair and body), each clearly different.
2. Below the top band: a grid of exactly [24] separate items, arranged in rows of [8], filled strictly left to right, then top to bottom. Each item is drawn alone as a game inventory icon, in a front or neutral view, NOT worn by anyone and NOT held by a hand.

HARD RULES:
- The entire background is one flat solid colour, pure magenta (#FF00FF). No gradient, no texture, no floor, no cast shadows on the background, no glow, no vignette.
- Leave a clear gap of plain magenta between every piece, at least 3% of the image width. No piece may touch, overlap or be cut off by another piece or by the image edge. Keep a margin around the whole sheet.
- Each piece is one connected object. A pair (gloves, boots) is drawn as a single pair object, not scattered.
- No text, no numbers, no labels, no captions, no frames, no borders, no grid lines, no watermark anywhere in the image.
- Do not use magenta in any piece.
- Items in the same row are about the same size. Long items such as weapons may be larger.
- Mix of items: roughly 60% plain everyday items, 25% nicer ones, 10% elaborate ones, 5% very ornate "legendary" ones. Include items from the character's own world, new items that fit their style, and a few casual or sporty items (sweatband, gym bag, water bottle, trainers) since the sheet is for a fitness game.
- Item categories to cover across the sheet: head, face, body, hands, feet, back, weapon, accessory.

AFTER THE IMAGE, reply with a plain text list and nothing else, in exactly this format, one entry per line:

CHARACTER | [character name]             (omit if there is no top band)
OUTFIT | [outfit name] | [rarity]        (four lines, left to right; omit if there is no top band)
1 | [item name] | [slot] | [rarity]      (one line per item, numbered in the order the items appear: left to right, top to bottom)

slot is one of: head, face, body, hands, feet, back, weapon, accessory
rarity is one of: common, rare, epic, legendary
Item names are short (two to four words).
```

## If the result is off

- Items touching or overlapping: "Regenerate. Keep the character and the item designs, but put at least 3% of the image width of empty magenta between every piece."
- Background not flat or a different colour: "Regenerate with the background as one flat solid magenta (#FF00FF), no gradient and no shadow." Buffnik detects whatever flat colour is on the border, so a different solid colour also works as long as no piece uses it.
- Wrong item count or list out of order: the importer warns when the list length differs from the number of pieces it found. You can delete bad pieces in the preview, and names stay tied to the number each piece had in the list, so fix the list order by editing the text before importing.
- Text or numbers drawn on the sheet: ask for a regeneration with "no text of any kind in the image".

## What the importer does

- Finds the background colour from the image border, finds each separate piece, cuts it out and makes the background transparent.
- Treats the largest tall piece as the base character, other tall pieces as alternate outfits (also shown as full-body looks), and the rest as shop items in reading order.
- Items cost coins by rarity (60, 200, 500 and 1,500 for common, rare, epic and legendary) [proposal] and can also drop as loot together with outfits. The base character is yours from the start. Equipped items show next to your character on the Hero tab. Items are shown as icons beside the character, not drawn onto the body. [inference: automatically fitting arbitrary items onto a character image would need per-character alignment data that a single sheet does not provide.]
