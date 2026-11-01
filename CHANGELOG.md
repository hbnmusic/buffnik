# Changelog

## Next build (not yet published; collecting feedback first)

### Planned from feedback
- **Treat budget readout counts up.** The Shop's budget card reads "$X of $500 unlocked this month". It starts at $0 on the 1st and goes up as treats are bought with coins, instead of starting at $500 and counting down. "Unlocked" means dollars of treats bought this month. The amount still available (the $500 ceiling minus what is unlocked) stays as a smaller line underneath. Behaviour is otherwise unchanged: a treat costs 10 coins per dollar and has to fit in what is left of the $500; unspent budget rolls into the vault on the 1st.

### In progress on branch `next`
- Import a character sheet from one image (made with Gemini): cut into the base character, optional alternate outfits and shop items. See `docs/gemini-sheet-prompt.md`.
- Gear items with equip slots, shown beside the character on the Hero tab.

## Build 10
- Fixes the launch crash in build 9 (the code shrinker removed a WorkManager class). Shrinking is off.

## Build 9
- Hero tab with 5 character slots, drawn figure with 5 build tiers, wardrobe and art-pack zip import.
- Shop: editable treats, Steam wishlist, buying looks with coins.
- Backup and restore through the share sheet. Heart-rate intensity from Health Connect.
