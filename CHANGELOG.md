# Changelog

## Build 11

### Strong imports
- **Workouts logged in Strong after the fact now count.** Strong times the app session, not the workout, so sets entered at the end give a timer of a few minutes. A Strong workout with at least 6 working sets (warm-ups excluded) now counts even when the timer is under 20 minutes. Its length is estimated at 3 minutes per working set, never below 20 minutes. [proposal: 6 sets and 3 minutes per set]
- **Set the real length of any workout.** Tap a workout on the Workouts tab and enter how long it took. The length you set survives re-importing the same Strong file, and "Back to the recorded length" undoes it.
- **The Workouts tab says why a workout is not counted** (under 20 minutes) and which lengths are estimated or set by hand.
- **The import summary reports** how many workouts counted by their sets and how many are still too short.
- **Newer Strong exports are read correctly.** Headers such as "Duration (sec)" and "Weight (kg)" are accepted. When the file names kg or lb, that unit is used instead of the one chosen on the import screen. Durations written as 1:05:00 are also read. [inference: some Strong versions export this way; it was seen in a third-party sample, not in Strong's documentation.]

### Shop
- **The treat budget counts up.** The Shop card reads "$X of $500 unlocked this month". It starts at $0 on the 1st and goes up as treats are bought with coins. The amount still available is a smaller line underneath. Prices, the 10 coins = $1 rate, the $500 ceiling and the monthly roll into the vault are unchanged.

### Art packs and gear
- Import a character sheet from one image (made with Gemini): cut into the base character, optional alternate outfits and shop items. See `docs/gemini-sheet-prompt.md`. Not yet tried on a real Gemini sheet.
- Gear items with equip slots, shown beside the character on the Hero tab. Gear costs 60 / 200 / 500 / 1,500 coins by rarity [proposal] and drops as loot together with outfits.
- Images shared to Buffnik open the sheet import.

## Build 10
- Fixes the launch crash in build 9 (the code shrinker removed a WorkManager class). Shrinking is off.

## Build 9
- Hero tab with 5 character slots, drawn figure with 5 build tiers, wardrobe and art-pack zip import.
- Shop: editable treats, Steam wishlist, buying looks with coins.
- Backup and restore through the share sheet. Heart-rate intensity from Health Connect.
