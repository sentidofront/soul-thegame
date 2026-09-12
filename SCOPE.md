# SOUL — escopo

> Floriano, Piauí. O céu abriu e eles desceram. Levaram o Soul — amigo,
> escudeiro e a mais bela dama em perigo do Piauí. O Indígena carregou o
> revólver e pegou a estrada.

A Vampire-Survivors-like where the only weapon is the protagonist's revolver.
React + TypeScript + Canvas 2D, no engine, deploys to Vercel as a static site.

---

## 1. Where it is now

The game is playable end to end: three acts, seamless transitions, **two**
boss fights, level-ups, win and lose states. A full run is about **4 minutes**
— an instrumented run finishes at 4:22, level 15, 264 kills.

**Verified by driving the simulation directly** (`soul.debugAdvance()` in the
dev console — see §6):

| | result |
|---|---|
| Act I → II at x=10 500 | works, no reload, ground cross-fades |
| Act II → III at x=22 000 | works, barrier closes, camera parks on the square, boss spawns |
| **A Manifestação** (Act I boss) | field swept on spawn, arena centres itself on the road (resolved Y 182 = road Y 182), 64 flags in the air at peak, minions capped at 6. Defeating it **opens the road** rather than ending the run |
| Boss defeat → vitória | works |
| Ten runs, bot walking straight into the crowd | clears the riot **2 of 10**; the survivors die in Floriano around X 16k |
| Ten runs, bot backing away from bodies and bullets | clears the riot **5 of 10** and reaches X 19–20k. **Kiting doubles the clear rate** — the difficulty responds to play, not only to the build |
| Build caps hold | verified: never more than 4 powers or 4 stats across any run |
| Crits, armour, absorb, the orbital ring | each verified in isolation — see below |
| Escudo Alien | two charges ate two 60-damage blows whole; the third landed |
| Colete de Couro | a 20-damage blow arrives as 15 |
| All 14 species reachable in one run | verified — see §3 |
| 415 enemies on screen | **1.08 ms per full frame** (sim + render) — ~15× headroom at 60 fps |

### On the difficulty, deliberately

Contact damage is roughly **double** what it was and health went up alongside
it, so **any contact is a real event**: at 100 starting health, four or five
touches is the whole bar, and i-frames cap a crowd at two hits a second. A run
can no longer be won by strolling into a herd and shooting outward.

Density came DOWN as damage went up, in both Floriano and the church square.
Density and damage multiply, and both act tables had been written when a touch
cost eight; at double that, the same crowd stopped being a fight and became a
wall. The danger is meant to be in what one alien can do to you rather than in
how many are on screen.

> **The specific health and damage values in `enemies.ts` are hand-tuned by the
> author and are deliberately far above anything measured here.** The bot
> percentages in this file were taken mid-pass on lower numbers; treat them as
> evidence about the SHAPE of the difficulty — that kiting doubles a clear
> rate, that survival rather than boss health decides a boss fight — and never
> as a description of how hard the game currently is. Re-measure before
> quoting a win rate.

Dials, in the order worth touching:

1. `baseDensity` / `densityRamp` per act in `stages.ts`.
2. Contact `damage` in `enemies.ts` — the direct one.
3. `CONFIG.PLAYER.maxHp`, currently 100.
4. Boss health, LAST. Swept across a wide range it barely moved either boss
   fight, because both are lost by dying rather than by running out of time.

### You aim it now

**The revolver no longer picks a target.** It fires along the cursor and hits
whatever is in the way, or nothing at all. The gun still fires on its own — you
never click — so all of the skill sits in where it is pointed.

The old assist chose a target for you and used the cursor only as a *weighting*
on that choice. It had one fatal property: you could not miss, which also meant
you could not deliberately hit anything. Steering the assist was a preference;
aiming is a skill.

Touch and keyboard-only play fall back to nearest-target automatically — there
is no cursor to aim with, and aiming at a stale screen origin would peg every
shot at the corner of the world. `AIM_MODE` in `config.ts` still has `steered`
and `auto` in it if the assist is ever wanted back.

**This makes bot numbers much weaker evidence than they used to be.** Every bot
in this file steers a cursor with crude heuristics, and manual aim punishes that
far harder than it punishes a person. Kill counts dropped by more than half the
moment the assist came out; that measures the bot, not the game.

### What the cursor was worth, under the old assist

Measured directly, fixed build, 20 seconds of fire at O Noivo with his guests
around him:

| | damage dealt |
|---|---|
| Cursor held on the boss | **3 127** |
| No cursor at all (nearest-target) | 918 |
| Boss alone, nothing else to shoot | 3 151 |

Pointing at the boss is worth **3.4×** the damage, because otherwise the
revolver spends the fight on whichever guest happens to be nearest. That gap is
the whole skill curve of the weapon, and it shows up in win rates too:

| how the bot uses the mouse | wins |
|---|---|
| Tracks the nearest threat, locks on the boss | 4 / 8 |
| No mouse at all — plain nearest-target | 3 / 6 |
| Holds the cursor rigidly due east | 1 / 6 |

*(Measured before the difficulty pass, on the old damage numbers. The ratios
between the rows are the point and they still hold; the absolute win rates do
not — see the table above for where the game actually sits now.)*

Good pointing beats no pointing beats bad pointing, which is what a steering
mechanic should do. Note the middle row: a player who never touches the mouse
still has a real game, they just have no say in it.

**The run does not start until the act card clears.** Nothing spawns, the clock
does not run, and barks are held for four seconds while "ATO I — A ESTRADA" is
on screen — the title used to come up over the first fight, with the opening
bark sitting on top of it.

One design beat worth knowing: **the barrier closing heals you to full.**
Otherwise act three is decided by how much health survived the walk across
town rather than by the fight itself.

### What is real vs. placeholder

| System | State |
|---|---|
| Fixed-timestep loop, camera, input (keyboard/mouse/touch) | done |
| Procedural chunked world, biome blend, road generation | done |
| Enemy spawning, AI (**9 behaviours**), crowd separation | done |
| Rare world items, found off the road | done |
| Paced bestiary, forward pressure, waves | done |
| Player barks — he reacts to each new species | done |
| Revolver, XP, level-up cards, **34 upgrades** | done |
| **Capped builds** — 4 powers + 4 stats | done |
| **Sorte**: rarity tiers, crits, gamble odds, drop rate | done |
| **Colete** (armour) and **Escudo Alien** (absorb charges) | done |
| **Ammo types** — collected as cards, cycled with **E** | done |
| **15 timed abilities** — bombs, the gamble, invisibility, thorns, fish, blink, homúnculo, orbital ring, absorb charges, dash, rain, mushrooms, tornados, a reliable shield, Tupã's bolt | done |
| Ability HUD strip + ammo rack, live cooldowns | done |
| **Two bosses**, 3 phases each, arena lock, win/lose | done |
| **Sealed arenas** — a boss fight that admits nothing but the boss | done |
| HUD, menus, level-up screen (Kenney 9-slice) | done |
| **Player sprites** | **your art, in game** |
| **Ground + road tiles** | **your art, in game** |
| **Upgrade card icons** | **your art, in game** (13 of 15 assigned) |
| **Milho / pão pickups** | **your art, in game** |
| **Enemy sprites — 13 of 14 species** | **your art, in game** |
| O Noivo Cinzento | the one remaining placeholder |
| Scenery (cactus, houses, lamp posts, church) | placeholder flat shapes |
| Soul himself | not in the game yet |
| Sound | none |

---

## 2. The three acts

There is **no level loading**. The world is one continuous space and the act is
a function of how far east you have walked. Crossing a threshold swaps the
spawn table, fades in a title card, and that is the entire transition — nothing
is torn down and rebuilt. The ground texture has already been cross-fading for
several hundred units before you notice you are in a town.

| Act | Along the route | Place | Ends in |
|---|---|---|---|
| **I — A Estrada** | 0 → 10 500 | Caatinga, mandacaru, open scrub | **A Manifestação** |
| **II — As Ruas** | 10 500 → 22 000 | Asphalt, houses, street lamps | **A Microsoft** |
| **III — A Igreja** | 22 000 → 22 760 | The square, then inside the church | **O Chará** |

Distances are measured **along the route**, not in world X. The way to Floriano
wanders — see §4 — so "how far have you got" is arc length, and every threshold
in the game is keyed to it.

### Act III is a script, not a wave row

The first two acts end the same way: cross a line, the field is swept, a
barrier closes, a boss drops in. Act III could not be written that way, so it
is not — it lives in [`src/game/systems/act3.ts`](src/game/systems/act3.ts) and
runs in four beats.

**1. THE DOOR.** Reaching the church at route distance 22 760 *is* going into
it. No loading and no scene swap: the same square of world is rebaked with the
facade and its paved apron gone and the ground swapped to flagstones, and the
renderer drops a vignette and a few light shafts over it. Same trick the rest
of the world runs on — Floriano is not a level either, it is a number saying
how townish you are.

`ARENA_INTERIOR` is **centred on the church**, and that is the whole of the
geometry. The first version put the door on the room's near edge and pushed the
rectangle forward along the route's heading to get there. That sounded right
and was wrong in the only way that matters: the building ended up five hundred
units outside its own arena, so you fought in a room with the church visible
over the barrier, off in a corner, like scenery from another level. Centring it
also drops the dependency on which way the route happens to be pointing when it
arrives — that was a different diagonal on every seed.

The one thing this costs is that "am I inside" has to be **state**, not
geometry. Terrain is baked ahead of the player and cached, so a purely
positional answer would lay the church's floor down in open air a screen before
he reached the door. `openInterior()` flips a flag and `chunks.rebake()` throws
the baked canvases away — a few dozen of them, once in a run, at the one moment
when the terrain genuinely is different from what it was a second ago. A
restart flips it back.

The paved square in front was reworked at the same time. It was two alternating
shades on a 20x12 grid, which is the obvious way to draw stone and reads as a
giant draughts board the moment you stand on it — which nobody ever did while
the church was only seen from a distance. It is a mortar grid now, with
per-stone tone from a position hash, offset courses, and a soft edge where it
meets the scrub.

**2. A DPS CHECK.** Three timed rounds of the three species the player has been
fighting for twenty minutes — the ordinary alien, the fat one, the rocket.
Nothing new to learn: the only question is whether the build they actually
built can clear a room before the room fills up again. Miss the clock and the
same round is thrown on top of what is still standing, which is how a check
punishes — it compounds rather than kills. The HUD grows an **objective line**
for it, because a boss health bar cannot say "clear this in thirty seconds".

Rockets in the check spawn already awake. Out in the world they are scenery
until you walk into their ring, which is a good ambush and a terrible way to
end a timed round: a measured run stalled with seven of them sitting dormant in
the corners of a room eleven hundred units wide, waiting to be visited.

**3. SILENCE.** Three and a half seconds of nothing. The only quiet in the
game, and it exists purely so the next thing lands.

**4. O CHARÁ**, in six bodies and five health bars.

| Stage | Body | The fight |
|---|---|---|
| 0 | On foot, player-sized | Keeps his distance and shoots. Every third volley is a ring instead of a fan |
| 1 | The run | Untouchable, sprinting for the machine that has been standing in the corner since he walked in |
| 2 | The mecha | Homing missiles, and it **grabs** — the mash is **D then A**, the mirror of the Microsoft's |
| 3 | On foot again | Same shape, half the patience |
| 4 | The navé mãe, shielded | Cannot be hurt. Drops ordnance, the waves come back, and **three pillars** need breaking |
| 5 | The navé mãe, open | Waves stop. Three arms of green rays turning steadily — and they reverse at half health |
| 6 | The sword | No ranged attack at all. Wind up, commit, recover. He runs at you |

He is never respawned. The script swaps `e.def` on the live enemy, so the
camera, the boss bar and the arena stay pointed at the same object while what
that object *is* changes completely underneath them. That is what lets him
climb into a machine and still be him, and it is why every one of his defs
declares `bars: 5` — the HUD reads the count off whichever def is current, and
the player should see five pips from the first shot to the last.

`EnemyDef.stages` is what tells `damageEnemy` that a zero here is a cue rather
than a death. Two bugs came out of that and both are worth remembering:

- **The bar-break blast is a `hostileBlast`, and he is an enemy standing in the
  middle of it.** Leaving him on zero health for the duration of his own
  detonation sent the damage straight back into `damageEnemy`, which called the
  script again, which fired the blast again — a stack overflow on the first bar
  break, every time. He is put on one point of health *before* the blast now.
- **Nothing outside the pool may hold a reference into it.** The three pillars
  were tracked as an `Enemy[]`. Enemies live in a dense pool with swap-remove,
  so the object that was a pillar is handed straight back out to the next alien
  that spawns — the list reported three pillars standing for ever, with full
  health, because it was reading somebody else's. Pillars are counted off the
  live list now. The only trustworthy answer to "is that one still there" is to
  go and look.

Deferred, at the user's request: the quick-time event to shoot his head after
he goes down. The art for it is already on disk
(`cutscene_click_final_shot_his_head.png`, `shoot_in_the_head_chará.png`). For
now, killing him wins the run.

The ground texture is tied to those boundaries rather than to numbers that once
matched them. When the acts were lengthened the biome blend stayed where it
was, and Floriano's asphalt turned up three thousand units before Floriano did
— the Act I boss was being fought on paving in the middle of the caatinga. The
ground now cross-fades over 9 700 → 10 900, just shy of Act II.

Difficulty ramps mostly with **distance**, only mildly with time — this is a
journey with a destination, not a survival timer. The small time term exists so
that standing still is not a safe strategy.

Everything above is in [`src/game/data/stages.ts`](src/game/data/stages.ts).


### The ground, and why it kept looking like a grid

Four separate things were putting a lattice on the floor, and they had to be
found one at a time because each was hiding behind the next.

**1. The biome transition was a dither.** Caatinga becoming Floriano was decided
per map cell by a weighted coin flip. That is a dither, and a dither needs cells
small enough to mix — these are a hundred world units across and about a hundred
and fifty pixels on screen, so what it produced was a chessboard of brown and
green squares with hard edges, several screens wide, right at the gates of the
town. The blend is a soft mask now: `paintCityBlend` lays a coat of town texture
over the scrub through a field of overlapping blobs whose opacity is `cityness`
minus a per-blob random roll. That one expression does the whole effect — out in
the scrub almost every blob loses its roll and the survivors read as isolated
patches of bare dirt; deep in town almost all of them win and merge into solid
ground; in between the edge is ragged and organic.

The roll is scaled by `(1 - cityness)` so it vanishes as the town takes over.
Without that the mask never quite reached full opacity, which was invisible in
itself but drew a line anywhere a fully-built chunk met a blended one — one side
solid town, the other town with freckles.

**2. The texture repeated on a hundred-unit lattice.** `makeSeamless` fixes the
joins, not the repetition. Every cell is now drawn mirrored one of four ways
from a hash of where it is: a mirrored join on a noise texture duplicates a row
of pixels and is invisible, while the pattern's period goes from one tile to
four.

**3. `makeSeamless` was flattening the contrast it blended.** It repairs the
edges by cross-fading an offset copy of the image into them, and averaging two
decorrelated samples of the same noise does not just move a pixel, it halves the
variance. The result was a ring of mush around the inside of every tile — and a
ring repeated every hundred units reads as a grid however seamless the joins
are. Each blended pixel is now pushed back out from its channel mean by
`1/sqrt((1-t)^2 + t^2)`, which restores exactly the variance the mix removed:
no change at the edges, 1.41x at the halfway point where the loss is worst.

**4. The mottle pass desynchronised its own RNG at chunk borders.** Every chunk
paints the low-frequency mottle for its whole 3x3 neighbourhood, so a patch
straddling a border is drawn identically by both sides — but only if both sides
pull the same numbers, and the cull for off-screen blobs sat *before* one of the
draws. Skipping it desynchronised the stream for every blob after it, so the two
chunks disagreed about the shading along their shared edge: a faint but
perfectly straight line every six hundred units, in every biome, since the day
mottling was added. Measured across the join: 34% more row-to-row difference
than the mid-tile control before the fix, 10% after. **Consume first, cull
second** — always, in any seeded generator.

The mottle also runs at two scales now. The big blobs hide drift across a field;
the second pass is sized to the tile itself, because that is the period the
first pass cannot touch.

Baking a chunk costs 1.8–4.6 ms depending on how much of this applies, against
0.4–3.5 ms before. Walking generates a chunk every few seconds, so it does not
show — but the church door, which used to throw the *whole* cache away, now
evicts only the chunks the room touches. That took the step through the door
from about a dozen rebuilds to four.



### The sun goes down over the whole journey

O Indígena leaves at midday and reaches the church at night, and the light
changes the entire way rather than at act boundaries. Nobody should be able to
say where afternoon became evening — only that the road they have been walking
for twenty minutes does not look the way it did when they started.

It is keyed to **distance, not the clock**, in
[`src/game/world/daylight.ts`](src/game/world/daylight.ts). A player who takes
forty minutes and one who takes twelve watch the same sunset, because it
belongs to the journey. `reach` only ever goes up, so the sun never comes back.
Six keyframes, placed against the acts rather than spaced evenly: Act I is
walked in daylight, Floriano is an afternoon, the sun goes down over the middle
of the town, the Microsoft is fought in the dark, and act three is night.

**Two passes and a buffer.** The wash is one rectangle in `multiply`, which is
what a change of light actually is — everything keeps its own colour and loses
some of it to the colour of the sky. Alpha-blending a flat colour over the top
instead would drag the whole frame toward grey and take the pixel art with it.
The lamps then *punch back*: the wash goes into a half-resolution buffer, holes
are cut in it with `destination-out` where the lights are, and only then is it
composited. A street lamp is not a bright circle painted on the dark, it is a
place the dark never reached — which is the difference between a glow sticker
and a light. A warm additive sheet rides on top for the half hour the sun is
low, and nothing before or after.

**The floor is 0.56, and it is a design decision.** Through a blue wash that
leaves the ground at a little over half its daylight brightness: dark enough to
be night, light enough that a swarm is still a swarm and not a guess. He also
carries a small light of his own — not a torch and not a mechanic, just enough
that the ground under his feet is never in question. That is the line between a
night that looks good and one that plays badly.

**Shadows move with it.** The same ellipse, offset and stretched along a fixed
sun direction: a tight dark disc underfoot at noon, sliding out ahead of him
and lengthening through the afternoon, and almost nothing at night when the
only thing casting one is a lamp post. Four numbers, and it reads as an entire
time of day. The sun direction is fixed rather than derived from the route's
heading — a shadow that swung round every time the path bent would read as the
sun moving, not the player.

**Street lamps are laid along the route**, alternating sides every 172 units at
90 lateral, not drawn from the random prop table. That distinction is the whole
reason night works: scattered, a lamp has to win a slot against twelve building
rules and then pass its own roll, which came out at about one every three
screens — fine as scenery, useless as light. And at 116 lateral they sat in the
same band as the front row of houses and spent the night *behind* one. Lamps are
infrastructure; somebody put them there on purpose, evenly, down both sides.

Indoors is exempt. The church has its own vignette and its own shafts through
windows above the top of the camera; laying an outdoor sunset over that would
be describing weather nobody in the room can see.

### One face, everywhere

The UI was already Press Start 2P for titles and **VT323** for everything else —
a CRT terminal face, retro but not 8-bit. It is all the pixel face now,
including the canvas text: the bark, the damage numbers and the distance under
the guide arrow were drawing in the system monospace while every DOM element
around them was 8-bit, because `ctx.font` knows nothing about the stylesheet.

The families cannot simply be swapped. VT323 is narrow and tall; Press Start 2P
is square and about twice as wide per character, so a 19px line becomes a 19px
line that runs off the panel. Every body size in `styles.css` was rescaled by
0.46 and anything already on `--title` was left alone, since those numbers were
chosen for this face to begin with. The face is also awaited in `Assets.load`
before anything draws — `ctx.font` fails silently, so a webfont that has not
finished decoding shows up as the first second of every run being in the wrong
typeface.

### Six more cards, and a real bolt

`public/fx/PNG` arrived with five and a half thousand frames across nine
families. Seven are wired, packed into strips by `tools/build-fx.py` like the
rest — and the first job was **Raio de Tupã, which had never had lightning**.
It was a telegraph ring and a blast; it is a forked strike now, tinted from the
pack's violet to gold because violet is a colour this game does not use.

| Card | What it does | The catch |
|---|---|---|
| **Ventos de Tupã** | A gust throws the crowd off you | Middling damage — it moves the swarm, it does not kill it |
| **Arremessa Bigorna** | Anvils drop around you, hard | They land on you too |
| **Poder de Tupã** | Every 30s your abilities hit half again as hard | Chip damage the whole window, and you don't choose when |
| **Cantarolar** | Notes fly where you're aiming, piercing | The only automatic thing that answers to the mouse |
| **Chapéu-Bonito** | One hat, and it goes for laps | Never two — stacks buy speed and damage, nothing else |
| **Cálice** | **F** to heal, on demand | Three seconds of very poor aim afterwards |

Four of them needed something the engine did not have:

- **`mods.ability`** — a second damage multiplier on abilities and thrown
  things only. Poder de Tupã deliberately does not touch the revolver:
  boosting the gun would make it a damage card like every other, and leaving
  the gun out makes it a card about the rest of your build. It is reset to 1
  every frame and put back up while the window runs, so it cannot survive the
  card being swapped out or the run resetting — a multiplier that leaks is the
  worst kind of bug to find.
- **`Bomb.anvil`** — the anvil reuses the bomb's flight, fuse and landing ring
  because a telegraph is a telegraph and this one has to read exactly as
  clearly as the mothership's: being hit by your own anvil must always be
  something you could have walked out of. Its ring is red rather than amber,
  because unlike everything else the player throws, this one lands on them.
  The self-damage does **not** fall off toward the rim — either you were under
  it or you were not, and a graze at a quarter damage would make the telegraph
  something to ignore.
- **`drunkT`** — the Cálice's sway is added to the weapon's spread and scaled
  by how much is left, so it wears off rather than snapping straight.
- **`EffectDef.alpha`** — Ventos de Tupã is a two-hundred-unit cloud of white
  smoke, and a tint does not help: a tint replaces the colour and leaves the
  sheet just as opaque, so the first version was a whiteout with the fight
  behind it. `alpha` is the one that lets you see through the thing.

**Chapéu-Bonito is drawn from its own card icon.** It is a hat, the card
already has a picture of one, and a 32px icon at this scale is exactly the size
a hat on a 22px man should be. Same for the anvil.

While wiring the icons: **`lost media.png` was on disk the whole time** under a
space rather than an underscore, so that card had been silently falling back to
its glyph since the day it was written.

### Three more species, and one palette

**Abelinha** joins the back half of the road: the smallest and fastest thing in
the game, arriving in groups of six. It does not chase so much as harass —
`swarm` wanders as it closes, so a cloud of them comes on different lines and
cannot be walked away from in the straight line that beats a wall of cattle.
Almost no health; the difficulty is that you were aiming at something else.

**Come-Tudo** is act two's bruiser — a mouth, and the rest is a rumour. More
health than a Grande Gordo and harder-hitting than anything that is not a boss,
and slower than everything. Deliberately *not* `elite`: a thing that size
should read as dangerous from its silhouette, and a health bar would turn it
into a progress meter you stand still to fill.

**O Alienado** is somebody from Floriano with the lights on and nobody home,
and it is the species act two most needed: the town is not invaded by monsters,
it is invaded by neighbours. Ordinary numbers on purpose. Its rare sheet is the
same man with his clothes somewhere else, weighted five-to-one by repeating the
common entry in `sheets` — which is what that field already allows and is
honest about being.

**No purple anywhere.** The boss bar, its pips, the arena barrier, the boss's
speech bubble, the mushroom ring, three fallback blobs and every floating label
were one lilac that appeared nowhere else in the game. The boss now wears the
aliens' own green — already what "them" looks like from the first Coisa Voadora
to the mothership — so the bar belongs to the thing it measures rather than to
the HUD. The player's own effects wear the player's gold, and the mushroom
wears the amber the bombs already use.

**And the objective line matches the rest of the HUD**: black ground, two-pixel
border, inset highlight, the pixel face. It had arrived with a soft rounded
one-pixel border of its own, which made the one element that only appears in
act three look like it came from a different game.

### The whole build, on screen

The ability strip only ever showed cards that *tick* — a build could be eight
deep with two of them visible, which made the other six feel like they had not
happened. Every card the player owns now sits bottom-right, opposite the
abilities, in the same tile chrome: powers carry a gold rail, stats a plain
one, stacks are numbered. Listed in **deck order rather than the order they
were taken**, so the shape of a build is the same from one run to the next and
a strip that reshuffles itself every level-up is not something anybody reads.

And the two abilities you have to *press* something for — Dash and Teleporte —
carry the key across the top of their tile. Everything else in a build fires
itself, which is the point of the genre and also why it is very easy to own a
dash for ten minutes and never use it. The stamp is a full-width bar rather
than a corner badge because the labels are words, not letters: a badge sized
for "Q" spills onto the next tile the moment it has to say ESPAÇO.

### The last ninety seconds

O Chará going down no longer wins the run — it hands over to a closing
sequence, in [`src/game/systems/ending.ts`](src/game/systems/ending.ts). Black
screen, the wounded alien breathing in close-up, a crosshair on his forehead
and one click. Then the camera finds the middle of the church, Soul comes down
out of the light, and the player is asked for the only input in twenty minutes
that is not violence.

**It is its own phase, not a flag on `playing`.** The simulation must not run
through any of it — no director, no spawns, no revolver — while the renderer
very much must, and the camera has to be taken away from whatever was driving
it. A flag would have meant guarding every system in the tick against a
cutscene; a phase means the tick simply does not reach them. It also runs on
**real time rather than the accumulator**: nothing here is simulated, and a
cutscene stepped through a fixed-timestep loop stutters on exactly the frames a
cutscene most wants to be smooth. The HUD is hidden for the duration — health,
ammo and a boss bar over a close-up of a dying alien would be the game refusing
to stop being a game at the one moment it should.

Three things bit, and all three are the same shape — state outliving the thing
that owned it:

- **A click held during the fight fired the prompt.** `Input.firing` is a HELD
  flag, right for a gun and wrong for anything asked once, so the sequence
  gained an edge-triggered `consumeClick`. That was not enough: the edge sits
  there until something consumes it, and the last thing the player did before
  the boss died was hold the trigger. Twice in testing the whole sequence ran
  to the kiss without anyone touching a mouse. Every step transition now
  discards a pending click, so only one made *while the prompt is up* counts.
- **The arena is cleared the instant the boss dies** — the same lines that hand
  over to the sequence also null it — so reading `activeArena` for the landing
  spot gave nothing and Soul came down on top of whoever was standing there.
  The interior's position is a pure function of the route, so it is simply
  asked for again.
- **The prompt pulsed off `g.time`,** which only advances while the simulation
  runs — which is exactly what has stopped. It froze at whatever brightness the
  last frame of the fight landed on, which for one seed was almost invisible.

The two cutscene sheets go in as **effects, not sprites**, for the reason
effects exist at all: the character loader re-centres every frame on its own
content, and the whole point of the kill animation is that his head *slumps*.
Normalised it would slump in place and read as a jitter.

### Two endings, two tracks

Dying and winning both used to play the MENU theme — the same sound as having
not started yet, which is the worst possible answer to twenty minutes that just
ended one way or the other. There are `gameover` and `victory` slots now.

Neither file exists yet: drop a track at
`public/sounds/Music/MP3/Game_over_theme_loopable.mp3` or
`Victory_theme_loopable.mp3` and it plays, no code change. Until then
`MUSIC_FALLBACK` sends both to the menu theme, and that indirection is
load-bearing rather than tidy: a missing file is skipped at load, so without it
the request would sit in `pendingMusic` for ever and the game-over screen would
be **silent** — a worse failure than the wrong track, and a much harder one to
notice.

### The bosses talk

Each of them speaks like the thing it is, in `QUIPS` in
[`barks.ts`](src/game/data/barks.ts): the riot in slogans with the cause
removed, the Microsoft like a licence agreement that learned to want things,
and O Chará — who has the player's own face — about that and nothing else. They
fire on a slow clock, eleven to eighteen seconds, and on the moments that
matter: a phase turning over, a grab landing. Slow on purpose, because a boss
that comments every four seconds stops being frightening and starts being a
companion.

It is a separate channel from the player's bark rather than a shared one. The
two of them talk constantly during a fight, and whoever spoke second silencing
the first would mean the boss's lines — the rarer and more interesting half —
are the ones that get eaten. The bubble is positioned against `bossRef` at draw
time and never stores a reference of its own, so it cannot outlive what said it.

### Effects

Eighteen things that used to be arcs, gradients and rectangles drawn at runtime
are sprite sheets now. The table is
[`src/game/data/effects.ts`](src/game/data/effects.ts) and it is the whole of
the mapping: bullets in seven colours, five blood sprays, four sizes of
explosion, the auras, the tornado, the rocket's burn, O Chará's sword.

**Effects do not go through the sprite loader, and must not.** A character
sheet is sliced by hunting for the emptiest columns and every frame is then
re-centred on its own content and cropped tight. That is exactly right for a
walk cycle, where what matters is that the feet land in the same place, and
fatal for an explosion, where what matters is that all thirteen frames stay
registered to the point the thing went off — normalised, a blast walks around
the screen instead of expanding. `Assets.effect` reads a plain grid, row-major,
with no normalisation, no mirrored copy and no white silhouette.

**One-shot effects are pooled; looping ones are not.** Anything placed at a
point and forgotten — a spray, a detonation, a splash — goes into a
ninety-entry pool and is stepped by its own clock. Anything that belongs to a
living body — a shield, an aura, a burning machine — is drawn inline by
whatever draws that body. That split is a rule, not an optimisation: an effect
that tracked an enemy would have to hold a reference into a dense pool with
swap-remove, and the object it was holding goes to the next thing that spawns
the moment its owner dies. The pillar bug in act three was exactly that
mistake; it is not being made twice.

**The pool cap is a design decision.** Four hundred things can die in the same
second and every one wants a spray. Ninety get one and the rest die quietly,
which is right — nobody can see the ninety-first. Measured at a steady 60 fps
with 193 enemies, 74 effects live, rain running and a shield up.

Three details worth keeping:

- **`spawnBlast` picks a sheet by radius.** One expanding circle used to do
  every job from a dash kick to a boss coming apart, which is why none of them
  landed. A shockwave under 46 units, a fireball under 200, a nebula above
  that, and bombs get their own ground burst because a thing that LANDED should
  not look like a thing that went off overhead.
- **Recolouring needs a wash, not a filter.** Dança da Chuva was going to reuse
  the frost sheet with a 190-degree hue rotation. Hue rotation cannot move
  white, and that sheet is mostly white, so it stayed snow. It ended up on a
  different sheet entirely — nine frames of blue diagonal streaks, scattered a
  dozen at a time across the radius rather than one cluster stretched to fill
  it. `EffectDef.tint` exists for the cases where a filter genuinely cannot
  do it, and it uses `source-atop` on a canvas holding nothing but the sheet —
  which is safe there and nowhere near the game's own canvas.
- **Everything except blood composites additively.** These sheets are drawn as
  light on black; normal compositing leaves a grey card wherever a pixel is not
  quite transparent. Blood is pigment, so it stays normal.

Loose frames are packed into strips by
[`tools/build-fx.py`](tools/build-fx.py) — three of the libraries ship as
folders of individual PNGs, which is about three hundred and fifty extra
requests at start-up for four times the bytes one packed strip costs. Run it
after adding art; output lands in `public/fx/_gen/`, which is generated and
safe to delete.

**Still hand-drawn, on purpose**: shadows (they scale per entity, cactus to
mothership), the hit flash (already generated from your own sprites), salt
patches (they read as ground rather than as an effect, which a particle field
would undo), the arena barrier, the guide arrow, the reticle, damage numbers,
the church light shafts, and the Lost Media phantom — where the glitch *is* the
effect. The muzzle flash was proposed and declined.

### Floriano had two buildings on screen

The prop generator drew a rule at random from the whole table and *then* checked
whether that rule's distance band happened to contain the slot. With seventeen
rules over one narrow band, almost every draw failed: a screen in the middle of
town held two buildings and a lot of dirt. It picks among the rules that fit the
slot now, which is most of the difference on its own — same table, same weights,
about six times the town. Measured 2 props in an 800x640 window before, 40–44
after.

The rest is depth. A single row of houses either side of a lane is a film set;
what makes somewhere read as a city is seeing roofs *behind* the roofs in front
of you. There are three bands — the street he is on at 100–190 lateral, the next
one over at 185–280, and the town going on without him at 270–420, each drawn
smaller than the last. The back row is never solid: he is not going out there,
and a wall he cannot reach can only ever be a nuisance to something else.

---

## 3. The bestiary and how it arrives

### Paced, not dumped

Every species has a `firstSeenAt` — a world X before which it does not exist.
At the start of the road the only thing in the game is one mutated cow, and
the caatinga introduces itself a piece at a time:

| | Distance | Kills | Actually seen at | |
|---|---|---|---|---|
| **Vaca Mutada** | X 0 | 0 | X 0.1k | The local cattle, corrupted. The first thing you ever meet. |
| **Vaca no Saquinho** | X 700 | 5 | X 2.7k | They bagged the cows. The bags float. Nobody has explained this. |
| **Coisa Voadora** | X 1 600 | 14 | X 4.2k | Cannot be one-shot — see below. |
| **Alienígena** | X 5 200 | 26 | X 6.0k | The rank and file, in three colours. Drifts in over the back half of the road. |
| **Tripa Seca** | X 10 500 | 62 | X 10.6k | A thief. Only in town. |
| **Saleiro** | X 10 800 | 70 | X 11.1k | Salts the ground and the salt is the weapon. |
| **Alien do Ovo** | X 11 200 | 78 | X 11.3k | Walks an egg over to you and lights the fuse. |
| **Grande Gordo** | X 11 500 | 86 | X 11.5k | A sponge, and the biggest health bar outside a boss. |
| **Alien Foguete** | X 11 800 | 94 | X 11.9k | Scenery until you step inside its ring. |
| **Glowie** | X 12 400 | 102 | X 12.6k | Arrives in threes and lights the street up. |
| **Doido do Carro** | X 10 500 | 112 | X 12.2k | Rare. Not on anyone's side. |

The last column is where each one **actually turned up** in an instrumented
run, and it is the number that matters. The kill quotas have to be read
against the real kill curve, which is far flatter than it looks like it should
be: a run reaches Floriano at about **56 kills** and leaves it at about **126**
— you walk past far more than you shoot. An earlier set of quotas in the
175–260 range had been written for a shorter game, and the effect was that
almost the whole Floriano roster never unlocked before the church. The town was
three species and a rumour.

**These are coupled to enemy health, which is the trap.** Doubling how long a
body takes to kill halves how many bodies a run gets through, and every quota
silently becomes too high — they have now had to be re-derived twice for
exactly that reason. Re-measure the kill curve before trusting them after
**any** change to health, density or act length.

A species needs **both** gates. Distance is the coarse one, keeping town
enemies out of the caatinga; the kill quota is the cadence — clear a quota of
what is in front of you and the road answers with something new. Walking
further does not skip the bestiary, and standing still and farming does not
either.

The opening also ramps its headcount: about five bodies at X 179, rising to
full pressure by X 1 300. "The first enemy is a cow" only reads if there is
actually one of them — at full density the opening is a wall of cattle walking
into you before the revolver has a single upgrade.

### Two ways they arrive

**The trickle** is the steady pressure, and **94% of it arrives through a cone
centred on where he is looking** (measured: point west, 94% spawn west). The way he is facing is the way he is
about to push, so pointing at something also means walking into more of it —
which is the trade the mouse is supposed to make. The remaining sixth wanders
in from anywhere, so turning around is never a way to empty the world.

**Waves** are the punctuation. Every 42 seconds (first at 0:45) a large group
drops in a **full ring** all around, just outside the view — measured at
E6/N7/W8/S7, evenly on every side. **Thirty-two bodies for the first, ten more
each time after, up to 110.** A wave is meant to be a wall; if it is not
obviously different from the trickle the punctuation is lost. It cannot be
walked away from, only fought or slipped. Tuned in `WAVES` in
[`stages.ts`](src/game/data/stages.ts).

### The four reworked species

**Coisa Voadora cannot be one-shot.** Whatever lands on it first — a bullet, a
fish, a bomb dropped on its head — only breaks it, and it survives. Verified
with a single 999 999-damage hit: it still just breaks. From then on it is
ordinary and dies to one more base revolver shot, so it reads as a clean
two-hit enemy: break it, then kill it.

What happens in between is the point. The broken form arcs with energy and
vents five bullets in every direction every 2.3 seconds, so the thing you just
failed to delete is now the thing shooting at you. `broken` is an explicit
state on the enemy, not a health threshold, and the absorb lives in
`damageEnemy` so every damage source in the game goes through the same rule.

The vent is deliberately sparse. Because they always survive to break, there is
a standing population of them venting at once; at six bullets every 1.5 seconds
the second half of the road turned into a bullet screen and runs reaching the
arena dropped from 7 in 10 to 4 in 10.

**Tripa Seca** is a criminal they abducted and drove. He shoots on the approach
but never backs off; what he wants is to reach you and **take one stack of a
random ability**. One stack rather than the whole thing — losing a maxed
Tambaqui to a single touch would be miserable, while one stack is a real loss
you can see on the HUD and earn back. The RNG de RPG shield blocks the robbery
too. He is made of paper: two shots put him down, and that is the entire answer
to him.

**Vaca no Saquinho** drifts instead of walking — it hovers, and the shadow
stays on the ground under it.

**Alienígena** is one enemy with three drawn colour sheets, picked at spawn, so
a street full of them is not a street of identical sprites.

### The Floriano five

The town's roster is built around the idea that each one asks a different
question of where you are standing, rather than being another thing that walks
at you:

- **Saleiro** floats around salting the floor. The salt is an **aura** — damage
  you are standing in rather than damage aimed at you, so it ignores attack
  cooldowns entirely. It is not something to walk past; it is something to
  leave. Measured at 14 HP over a second and a half inside the radius.
- **Alien do Ovo** carries an egg toward you at a walking pace and lights the
  fuse when it gets close. Slow on purpose: the counterplay is noticing. Worth
  knowing — **the revolver's knockback holds it at arm's length**, so shooting
  it is itself a way of never letting it arrive. Silence the gun and it closes,
  lights up and takes 21 HP off you.
- **Alien Foguete** is scenery until you cross its detection ring at 300 units,
  then it becomes a missile and the sprite changes so you can tell which one
  you are looking at. Verified asleep at 500 units, awake and detonating for
  20 shortly after.
- **Glowie** arrives in **groups of three** and shoots green, glowing rounds —
  the shot carries the glow with it, an additive bloom under the tracer, so a
  cluster lights the street rather than reading as the same lilac pellet
  everything else throws. Being near one costs you continuously, so three of
  them is a no-go area rather than three separate problems.
- **Doido do Carro** is a Floriano folk doing ninety down the street. It does
  not chase and does not steer: it picks a lane and commits, it only exists on
  the asphalt, and **it is not on anyone's side** — measured ploughing 10 of 10
  aliens in its path while keeping 821 of its 900 HP. Rare, and the joke does
  not work if you can shoot it before it arrives.

### A MANIFESTAÇÃO — the wall between the road and Floriano

Act I ends in a riot of mind-controlled people, and it is the one fight in the
game that is about **moving** rather than about aiming.

**The field is swept when it arrives.** Nothing survives into the arena — the
barrier closes on an empty road and the only things in it are the riot and what
the riot makes. That is a property of the arena (`sealed`), not a global rule:
the church square is deliberately *not* sealed, because at a wedding the guests
turning up is the point. Without it the trickle kept walking in along the
barrier and fifty cattle wandered through the flags.

It does not chase. It drifts, and fills the air with **flags** on two clocks —
a spiral that sweeps the arena and, from phase two, a full ring volley — while
throwing bodies into the fight. Both escalate across three phases keyed to its
health bar, which means **hurting it is also what makes it dangerous**.

Two numbers are load-bearing:

- **The manifestantes are capped at six.** The gun aims itself, and a body at
  arm's length always outscores a boss across the arena — uncapped, the fight
  quietly became "shoot manifestantes forever" while the health bar stopped
  moving.
- **Health is the wrong dial to reach for**, which is worth knowing before
  spending an afternoon on it. Swept across a wide range, a kiting bot lost at
  every value and lost by DYING rather than by running out of time. What
  decides this fight is how long the player survives inside the barrier, so the
  arena size, the manifestante cap and the flag rate move it further than the
  health bar does. Two things do scale with health and pull against each other:
  the phases are keyed to the fraction remaining, so a bigger bar means longer
  in the calm opening pattern *and* longer in the frantic one.
- The flags do a **fixed 9**, deliberately not derived from the riot's contact
  damage. Contact is near-mortal now, and a bullet hell firing near-mortal
  contact sixty times over is a coin flip rather than a fight. Walking into the
  crowd itself still costs full contact damage.

### He talks about it

The first time O Indígena sees a species, he says something in a bubble over
his head — *"Botaram a vaca no saquinho?!"*, *"Esse aí era gente. E quer o que
é meu."* Waves get their own lines, and so does being robbed. Lines are queued
rather than interrupted, because three species can show up in the same second
during a wave and a bark that gets replaced mid-word reads as a glitch.

Barks live on the enemy definitions in
[`enemies.ts`](src/game/data/enemies.ts) — one field per species, so writing
more dialogue does not mean touching any systems.

---

## 3b. The build, and what it costs

### Six powers, and the swap

**The power bar caps at six, and a full bar is not a closed door.** New powers
keep being offered once the six are spent; taking one asks what it replaces.
Declining is always allowed and returns you to the other two cards, because the
player picked the card before they knew what it would cost — a prompt you
cannot back out of is a trap, not a choice.

Whatever is dropped is dropped **entirely**, every stack of it. Half a Tornado
is not a thing anyone wants to be left holding, and the slot has to actually
come free.

Stats stay hard-capped. They are small numeric bumps, and a swap prompt for
+7% speed is friction with no decision in it.

### The slots

A run used to simply accumulate. By level fifteen the player had most of the
deck, every card was a yes, and a level-up only asked which thing you wanted
*first* — never what you wanted at all.

The build is capped now: **four powers and four stats**, and that is all. Ammo
is outside the cap (only one is loaded at a time, cycled with E) and so are the
one-offs — Pão de Alho is eaten and Reviva is spent by dying, so neither
occupies a slot you have to live with.

Cards you already own keep being offered once you are full. **A capped build
can still deepen; it just cannot widen.** The level-up screen says which is
which — `OCUPA UMA VAGA` on a card that would take one of your four, in red
when it is the last, and `JÁ TEM ×n` on one you are only making deeper.

Set in `POWER_SLOTS` / `STAT_SLOTS` in
[`data/weapons.ts`](src/game/data/weapons.ts).

### Sorte

Luck is not a stat that does one thing. It is the input to **every roll the
game makes on the player's behalf**, and all four live in one file,
[`data/luck.ts`](src/game/data/luck.ts), so "what is luck worth?" has one
answer to read rather than six scattered constants:

| Roll | At luck 0 | At luck 3 | At luck 8 |
|---|---|---|---|
| Crit chance (2× damage) | 4% | 21% | 32% |
| A card is **lendário** | 2% | 4.5% | 5.9% |
| A card is **comum** | 62% | 44% | 34% |
| RNG de RPG's gamble | its own odds | bent toward yes | bent further |
| A corpse drops something | ×1 | ×1.9 | ×2.3 |

Every curve saturates, so luck is worth taking at 1 and still worth taking at
6 without a stacked-luck run rolling legendaries every level.

That spread is the design. A luck card that only improved level-up offers would
be a stat about menus; one that only gave crits would be a worse damage card.
Touching all four makes it the card that makes the whole run go better.

**Crits are also where the damage scaling went.** Melhorar a Arma used to be
+22%, eight times over — 4.9× damage out of one card, which outran every enemy
in the game and turned the back half of a run into a formality. It is +12% and
six deep now, which is 1.97×. The difference moved into a number you roll
rather than a number you own.

### Rarity, and why the deck can now grow

Cards used to be drawn on a single flat weight across the whole deck, which had
a standing problem: every card added made the two carrying the build harder to
find, and their weights had been raised three times to compensate.

Now **a tier is rolled first — luck bends that roll — and then a card is picked
inside that tier.** Melhorar a Arma competes with five other commons instead of
with twenty-eight cards, so the deck can keep growing without diluting
anything. Rarity shows on the card: a coloured rim, and a gold glow on a
legendary.

| Tier | Odds at luck 0 | Cards | What lives there |
|---|---|---|---|
| Comum | 62% | 7 | The spine: damage, cadence, health, **armour**, speed, magnet, bread |
| Incomum | 26% | 8 | Sorte, vampirism, piercing, bombs, brick, fish, two ammo |
| Raro | 10% | 10 | Multishot, criptografia, the orbital ring, most abilities, three ammo |
| Lendário | 2% | 3 | Amuleto, Escudo Alien, Reviva |

**Armour is deliberately common.** Contact damage was doubled, and a run that
is offered nothing but damage cards while being killed by touches is not a
difficulty curve — it is a missing answer.

### The gamble

**RNG de RPG is no longer a coin flip for a shield.** Heads-you-win,
tails-you-get-nothing is the least interesting thing a gamble can do, so the
card now rolls a table of fourteen outcomes on its own clock — and five of them
are bad. It is the only thing in the build that can hurt you.

| | |
|---|---|
| **Prizes** | a shield; a fire-rate, damage or speed buff; a heal; a vanish; an Escudo Alien charge; a shower of XP |
| **Punishments** | the revolver jams; your legs go; your eyes go; **it goes off in your hand** — a blast centred on your own feet that catches the crowd too; or it whistles up seven more of them |

Three rules keep it from being miserable, and they are worth preserving:

1. **Nothing here can kill you.** The self-damage is a fraction of *current*
   health and never the last of it — dying to your own upgrade with a boss
   watching is a bug report, not a story.
2. **Bad outcomes are loud and short.** You always know what happened, and it
   is over in seconds. They are named on the HUD while they run.
3. **Luck buys you out of them,** but never all the way. About a third of the
   table is bad at zero sorte and about an eighth at high sorte — the tilt is
   real, and the dice still bite the luckiest run in the game now and then. An
   earlier curve took it to 3%, which is not a lucky gambler; it is a gambler
   who has stopped gambling.

That coupling is the point: the gamble card and the luck cards are worth more
together than apart, which is why both exist. **Escudo Fiel** is the other half
of the answer — a shorter, weaker shield that is absolutely certain, so a
player who wants protection can buy it instead of gambling for it.

### The new cards

| | Slot | Tier | |
|---|---|---|---|
| **Olho de Gavião** | stat | comum | +18% revolver reach — both what it locks onto and how far the bullet flies |
| **Dash Empírico** | power | incomum | **Space.** The i-frames are the ability, not the distance: it is the only answer in the build to a pattern that has already closed around you |
| **Escudo Fiel** | power | incomum | A short shield, always on time. No dice |
| **Cogumelo** | power | incomum | Dropped at his feet as he walks. Burns the ground for three seconds, then explodes. The one power that rewards **retreating** |
| **Dança da Chuva** | power | raro | He dances, and the sky answers a few seconds later — **where he was**. A bet on where the fight is about to be, not a panic button |
| **Tornado** | power | raro | Thrown along the aim, pierces everything, shoves what it touches. A moving wall rather than a bullet |
| **Colete de Couro** | stat | comum | −5 flat off every blow. Flat, not a percentage: armour should make a graze survivable, not make small enemies stop existing |
| **Sorte de Cabra** | stat | incomum | +1 sorte |
| **Amuleto do Juazeiro** | stat | lendário | +2 sorte |
| **Criptografia** | stat | raro | ×0.78 on how far away they notice you — and how long the shooters hold fire |
| **Rebimboca Orbital** | power | raro | Rounds that never leave, circling him. The only thing in the build that defends where he is *standing* rather than where he is *pointing* |
| **Raio de Tupã** | power | lendário | The sky picks the **biggest health bar in range** — elites count double — and deletes it. The one piece that answers a Grande Gordo wading toward you. Telegraphs before it lands, because a bolt that simply appears reads as a bug |
| **Escudo Alien** | power | lendário | Charges, not seconds. A charge sits there until something actually hits you, then eats that blow whole |

**Bombas do Louro are aimed now.** They used to pick any body in the pool at
random and land within thirty-five units of it, which on a full screen sent
most of a volley somewhere the player was not fighting. Each bomb now takes the
nearest target it can and never the same body twice in one volley, and lands
much closer to it. The blast radius is unchanged — this is accuracy, not power.

---

## 4. Architecture

**React never renders the game.** It mounts a `<canvas>`, hands it to the
engine, and subscribes to a small snapshot object pushed ~15 times a second for
the HUD. Reconciling 700 enemies through the virtual DOM sixty times a second
is not a thing that works.

```
src/
  App.tsx              React shell: canvas + overlays
  ui/                  HUD, menus, level-up cards, 9-slice panel
  game/
    Game.ts            the loop, the pools, the run state
    config.ts          EVERY tunable number lives here
    core/              loop pieces: assets, camera, input, pool, spatial hash, rng
    world/             road.ts, chunks.ts, biomes.ts — the procedural map
    systems/           ai, combat, spawner, progression, render
    data/              sprites, enemies, weapons, stages  ← the files you edit
```

Three decisions worth knowing:

**Fixed timestep.** The simulation always advances in exact 1/60 slices no
matter what the display does, so behaviour is identical on a 60 Hz laptop and a
144 Hz monitor, and an alt-tabbed tab cannot teleport anything through a wall.

**Chunks are baked, not redrawn.** Each 600×600 patch of world is painted once
into its own canvas — ground, road, scenery — and the frame just blits a
handful of them. Generation is seeded from world coordinates, so a chunk comes
back byte-identical after being evicted from the cache.

**Auto-aim prefers elites.** With one single-target weapon, "shoot the nearest
enemy" means the revolver spends the whole boss fight killing guests while O
Noivo walks in untouched — in testing the boss finished several runs on 100%
health for exactly that reason. Elites now get their distance weighted down, so
fire goes where the threat is. One constant, in `systems/combat.ts`.

**Dense pools + a spatial hash.** Enemies live in a packed array with
swap-remove, so the hot loops are contiguous and nothing is allocated per
frame. A uniform grid turns 400 bullets × 700 enemies from 280 000 distance
checks per tick into a few dozen.

---

## 5. Adding art

### Sprites

1. Drop the PNG in `public/sprites/…`
2. Add one line to [`src/game/data/sprites.ts`](src/game/data/sprites.ts):
   ```ts
   alien_grunt: { src: '/sprites/enemies/alien_grunt.png', frames: 4, fps: 8 },
   ```
3. Point an enemy at it in [`src/game/data/enemies.ts`](src/game/data/enemies.ts):
   ```ts
   grunt: { id: 'grunt', name: 'Cascudo', sheet: 'alien_grunt', … },
   ```

That is the whole pipeline. **You do not have to line frames up on a grid** —
the loader measures the art, finds the gaps between poses, re-packs them into
an even strip and puts the feet on the bottom row. Any enemy without art yet
renders as a coloured blob, so you can design and balance a monster before you
draw it.

Open the dev console on load: every sheet prints its detected frame boxes. If a
pose looks clipped in game, that table is the first place to look.

### What the art needs

Findings from measuring the current files. None of these are blocking — the
code works around all of them — but each fix removes a workaround.

**The player sheets have three poses, not two.** `Andando.png`,
`holding_gun_walking.png` and `holding_gun_walking_shooting.png` are each 64×32
containing 3 poses, hand-placed at pitches of **15, 17 and 19 px** — three
different spacings inside files of the same size. Slicing those on a uniform
64/3 grid chops arms off. The loader auto-detects instead. *If you re-export,
3 frames of 32×32 in a 96×32 file removes the guesswork.*

**`base_texture_lvl_base.png` does not tile.** Its right edge does not continue
into its own left edge, which showed up in game as a hard 100-unit lattice
across the entire map. It is now repaired at load time (`makeSeamless` in
`core/assets.ts`) by blending in a half-offset copy near the edges — which
costs a little contrast there. *A properly tileable version would look better
and let that code be deleted.* (`base_texture_lvl_floriano.png` is very close
to seamless already.)

**Road tiles chain by their edges.** Each road piece enters at one height and
leaves at another, measured from your art:

| tile | enters at y | leaves at y | effect |
|---|---|---|---|
| `dirt_road_1` | ~55 | ~50 | climbs 5 px |
| `dirt_road_3` | ~54 | ~68 | drops 14 px |
| `floriano_road_1` | ~51 | ~50 | flat |
| `dirt_road_2` | — | — | **transparent on both edges — cannot chain, currently unused** |

The generator places each tile exactly where the previous one's band ended, and
picks between a piece and its mirrored twin to steer toward a lazy target line.
That is why the road meanders with no seams. If you draw more road pieces, add
their measured entry/exit to the `DIRT` / `CITY` piece tables in
[`src/game/world/road.ts`](src/game/world/road.ts). `dirt_road_2` becomes usable
the moment its band touches both side edges.

### Ammo, and abilities

Two different things, and the difference matters.

**Ammo** is what the revolver is loaded with. Only one type at a time, collected
as a card, cycled with **E** mid-fight. Every stat card improves whatever is
loaded, so a damage upgrade never favours one type.

| Loaded | What it does |
|---|---|
| **Revólver** | The default. Everything else is measured against it. |
| **Balas Venenosas** | Less than half a normal round's damage, but each hit adds a stack of poison — and **any** bullet landing on that target refreshes the whole stack. Put a few stacks into something big, switch back to the revolver, and the venom keeps ticking as long as you keep the pressure on. Stop shooting it and it falls off. |
| **Chumbo Grosso** | Five pellets in a wide fan. Enormous in a press, and its 150-unit range makes it the wrong thing to have loaded when the boss is across the square. |
| **Bala Perfurante** | Goes through five bodies and keeps going. Weak per body, long range — for the column walking at you from the east. |
| **Bala Explosiva** | Slow, mediocre against one thing, and the damage is in the burst. It cannot hurt you: a self-damaging round on a weapon that fires itself is a trap nobody asked for. |
| **Bala Ricochete** | Jumps to a fresh body twice on the way. Never wasted in a loose crowd, nearly nothing against a lone target. |

Five of the six drawn types carry mechanics. `bullet_around` is registered with
its art and no card.

Measured kill rate against the plain revolver, 10 runs averaged per cell:

| | Act I | Act II |
|---|---|---|
| Balas Venenosas | −4% | +26% |
| Chumbo Grosso | +28% | −3% |
| Bala Perfurante | +37% | +47% |
| Bala Explosiva | +16% | +34% |
| Bala Ricochete | +43% | +24% |

Every type is best somewhere and weak somewhere, and nothing dominates: venom
is wasted on Act I bodies that die to one shot and comes into its own against
tougher ones; the spread wants a press and the piercing round wants a column;
ricochet lives on loose crowds and explosive on packed ones. Earlier tunings
had explosive at +148% and ricochet at +93% — both hit everything in a crowd,
and a crowd is the default situation.

**Abilities** run on their own clocks and fire themselves.

### The abilities

Seven cards run on their own clocks instead of multiplying a stat. Their
numbers all live in [`data/abilities.ts`](src/game/data/abilities.ts) as
per-stack tables — `[a, b, c]` reads as "1 stack, 2 stacks, 3 stacks".

| Card | What it does | Stacking |
|---|---|---|
| **Bombas do Louro** | Lobs bombs into the crowd on a timer | **One more bomb per card** — the sky opens up around you. Never a bigger radius |
| **RNG de RPG** | Every 30s, a 50% roll for a 1-second shield | Improves the roll, not the shield |
| **Privacidade** | Every 25s he vanishes and the horde loses him | Longer vanish |
| **Tijolo de Leite** | The brick is hard — whoever hits him takes chip damage | Harder brick |
| **Tambaqui** | Throws a handful of fish at the nearest bodies, piercing | Two at once, up to six |
| **Homúnculo** | A familiar that **stands between you and the nearest threat**. It pulls aggro, and whatever hits it takes damage back | One more helper per card |
| **Teleporte Indígena** | Double-tap **Q** to jump toward the cursor | Further, shorter cooldown |
| **Reviva** | Get back up once at half health | Rare, and never offered while one is banked |

Three decisions worth knowing, because they are not obvious from the list:

**Ability damage scales with your damage stat.** Card upgrades compound
(1.22^n) while a flat ability does not, so without this the abilities quietly
become traps — a bomb worth 130 is strong at level 3 and irrelevant at level 15.
Tying them to the same gunpowder means Melhorar a Arma improves your bombs and
your fish too, so picking one is about what you want rather than about which
card is not a mistake.

**Privacidade freezes the horde's last sighting** rather than switching their
AI off. They keep coming, confidently, to the wrong place, and you walk out the
side.

**The homúnculo changes where the crowd walks, not just how much it hurts.**
Anything within 150 units of one goes for it instead of you — measured, a group
that would have closed on the player parks on the homúnculo instead.

They **interpose**: they hold station between the player and whatever is
closest, and swap sides when the threat does (verified — threat east puts them
at +28 to +40, threat west at −31 to −40). Trailing behind, which is how they
started, looked like an escort and did nothing; the crowd simply walked past
them. They are drawn smaller than a person, and are tougher than they were
because standing in front is a different job from following.

**The Totem do Homúnculo is not a card.** It is an object lying in the world,
rolled once per chunk column from the world seed, placed 100–260 units off the
road — close enough to spot while travelling, far enough that you have to go
and get it. Across twelve seeds it averages **0.9 per run**, and sometimes
there is none at all. Walking onto one grants a permanent helper slot and
summons one on the spot.

**RNG de RPG was buffed**: the roll comes every 20 seconds instead of 30, from
55% to 92% with cards, and the shield lasts 1.4–2.6 seconds instead of a flat 1.

**The bomb is thrown at a random body, not a random point.** A uniformly random
spot around the player lands in empty caatinga most of the time; measured, that
version was worth 8% more kills, which is not worth a card. Picking a random
enemy and scattering around it keeps the throw unaimed while making it land
near something.

#### Are they worth taking?

Five cards spent on one thing, measured as kills over 40 seconds against the
same enemy pressure, versus spending nothing. Eight runs averaged per cell —
single runs on this are worthless, identical setups range from 75 to 146 kills.

| Five cards spent on | Act I | Act II |
|---|---|---|
| Fúria Tapajó (fire rate) | +102% | +158% |
| Tambaqui | +98% | +180% |
| Melhorar a Arma (damage) | +35% | +185% |
| Balas Venenosas | +50% | +86% |
| Bombas do Louro | +45% | +89% |

Nothing is a trap and nothing dominates. Raw stats pull ahead in Act II, where
enemies have the health to make compounding matter; the abilities carry Act I,
where most things die to one bullet anyway and extra sources of damage beat a
bigger bullet. Tijolo de Leite is missing from the table because it only fires
when something hits you, and this harness turns damage off to isolate output.

#### Still unassigned

`criptografia`, `homonculi_totem`, `colete_gcm`, `bomb_food`,
`escudo_alienigena` and `projectiles/rebinboca` are drawn but have no card yet.
`homunculo_helper` is a walking ally sheet with no summon to bring him out —
he pairs obviously with the totem, and wants a mechanic.

### Art still needed, in priority order

1. **O Noivo Cinzento** — the last placeholder in the game, and the only
   species still without art. Every other enemy is drawn and in. He is kept as
   a blob because he is the ending, not because a blob is acceptable.
2. **Soul** — he is the entire premise and does not appear anywhere yet.
4. **Church + praça tiles** — currently flat rectangles.
5. **Caatinga scenery** — mandacaru, rocks, fences.
6. **City scenery** — houses, lamp posts, benches.

---

## 6. Roadmap

**Next (makes it feel like a game)**
- The quick-time event on O Chará's head, once the run is won (art is on disk)
- O Noivo Cinzento's sprite — the last blob, and now unused: Act III is O
  Chará's, so the def sits in `enemies.ts` referenced by nothing. Give it art
  and a home, or delete it
- The unassigned upgrade icons (see §4)
- Sound: gunshot, hit, level-up, death, one track per act
- Soul on screen: caged in the praça, freed on victory
- Hit particles and death puffs

**Then (makes it a run worth repeating)**
- Two or three more weapon upgrade paths, so builds diverge
- Elite spawns and a mid-act miniboss, now that all three acts end in one
- Score screen with a personal best in `localStorage`
- Chests / a reward for clearing a wave

**Later**
- Tall props that sort against the player instead of sitting flat under everyone
- Frame interpolation (the loop is fixed-step; on a 144 Hz monitor some frames
  repeat)
- Gamepad support
- Second playable character

**Deliberately out of scope for now**: multiplayer, saves/meta-progression
between runs, procedural act generation beyond the current three, mobile app
packaging.

---

## 7. Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

Deploy: push to a Git repo and import it on Vercel. It is detected as a Vite
project — no configuration needed. Output is `dist/`, fully static.

### Dev shortcuts

- `?start=22000` — begin a run at that world X (dev builds only). Use it to
  work on Act III without replaying Acts I and II. `?start=10000` drops you
  just short of the Act I riot.
- `soul` in the console — the live `Game` instance.
- `soul.debugAdvance(120)` — run two minutes of simulation instantly, without
  waiting for frames. The loop is frame-rate independent, so this plays a real
  run; inspect `soul.player`, `soul.kills`, `soul.stageIndex` afterwards.
- `soul.debugAdvance(120, chooser)` — the optional second argument picks the
  level-up cards, so a test can model a player with a plan instead of taking
  whatever is first. **It is handed the offers and must return a card `id`**; a
  chooser that returns an index silently applies nothing, the run plays out
  with a naked revolver, and every balance number read off it is wrong. This
  has now cost two separate tuning passes — check that `soul.player.mods` is
  actually moving before trusting a result.

### Controls

WASD / arrows to walk. **Space** dashes, once you have the card. The mouse **aims the revolver** — it
fires on its own, but only where you point it. The revolver fires on its own — you never click — but
the **mouse steers which way it looks**, and O Indígena turns to face it.
**Double-tap Q** to teleport, once you have the card. ESC pauses. On a phone,
drag anywhere to move; with no pointer he falls back to nearest-target.

---

## 8. Open decisions

Things worth a call before the next chunk of work:

1. **How hard should the cursor pull?** `AIM_STEER` in `config.ts` sets how
   strongly pointing overrides "nearest". At 4, something directly behind you
   has to be roughly 2x closer to win the target — raise it for tighter
   control, drop it toward 0 for pure nearest-target. `AIM_MODE: 'mouse'` is
   also there if you ever want it firing exactly at the cursor instead.
2. **Should the run be repeatable or a one-off story?** Right now it is a
   fixed ~2–3 minute journey with an ending. A VS-like usually wants meta-progression
   between runs; a story game does not.
3. **Is it now too hard?** This is the live question, and it is the author's
   call rather than a measurement — the health and damage numbers in
   `enemies.ts` are hand-tuned and sit well above anything a bot has been run
   against. What is known: a crude kiting bot stopped finishing runs at
   *lower* numbers than the ones currently in the file, though it did reach the
   church steps. It plays badly, so a person is meaningfully better than it.
   The dials are listed at the end of §1, in the order worth touching. Boss HP,
   arena size, the minion cap and the heal-on-entry are separate dials if
   either should be a wall instead.
4. **Should the church square be sealed too?** A Manifestação fights alone; O
   Noivo fights with the guest list still arriving. That reads as two different
   kinds of fight, which is the argument for leaving it — but it does make the
   final boss the messier of the two.
5. **Act II does not end in anything.** It is the longest act and the only one
   without a fight at the end of it.

---

## Credits

UI panels: [Kenney](https://kenney.nl) Pixel UI Pack (CC0).
Everything else drawn for this project.
