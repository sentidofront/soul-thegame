"""
Packs loose effect frames into horizontal strips the game can load in one
request.

WHY THIS EXISTS. Three of the effect libraries ship as folders of individual
PNGs — thirty frames per bullet colour, thirty per blood spray. Loaded as they
are that is roughly three hundred and fifty extra requests at start-up, for
about four times the bytes a single packed strip costs. Everything else in
public/fx is already a grid and is read in place; only these need packing.

Run it after adding or replacing art:

    python tools/build-fx.py

Output goes to public/fx/_gen/, which is generated and safe to delete.
"""

import glob
import os
import re
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
OUT = os.path.join(ROOT, 'fx', '_gen')


def frame_number(path):
    """Sorts 2.png before 10.png, which a plain string sort does not."""
    found = re.findall(r'(\d+)', os.path.basename(path))
    return int(found[-1]) if found else 0


def pack(frames, dest):
    """Lays frames left to right in one strip, all cells the same size."""
    if not frames:
        raise SystemExit('no frames for ' + dest)
    w = max(f.width for f in frames)
    h = max(f.height for f in frames)
    strip = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        # Centred in the cell, so a set whose frames differ in size still
        # animates around one point instead of walking sideways.
        strip.paste(f, (i * w + (w - f.width) // 2, (h - f.height) // 2), f)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    strip.save(dest, optimize=True)
    print('%-34s %d frames  %dx%d' % (os.path.basename(dest), len(frames), w, h))


def from_folder(folder, dest):
    files = sorted(glob.glob(os.path.join(ROOT, folder, '*.png')), key=frame_number)
    pack([Image.open(f).convert('RGBA') for f in files], os.path.join(OUT, dest))


def from_grid_row(path, dest, cell, row, count):
    """One row out of a sheet whose rows are colour variants of one effect."""
    im = Image.open(os.path.join(ROOT, path)).convert('RGBA')
    frames = [
        im.crop((c * cell, row * cell, c * cell + cell, row * cell + cell))
        for c in range(count)
    ]
    pack(frames, os.path.join(OUT, dest))


# ---------------------------------------------------------------- BULLETS --
# Seven colours of the same thirty-frame round. Named by colour rather than by
# which ammo currently uses them, because that mapping is a balance decision
# and this is not.
BULLETS = {
    'bullet_sprites (1)': 'bullet_gold',
    'bullet_sprites (2)': 'bullet_red',
    'bullet_sprites (4)': 'bullet_orange',
    'bullet_sprites (5)': 'bullet_cream',
    'bullet_sprites (6)': 'bullet_magenta',
    'bullet_sprites(7)': 'bullet_cyan',
    'bullet_sprites_poison (3)': 'bullet_green',
}

# ----------------------------------------------------------------- IMPACT --
IMPACTS = {
    'fx/bullets/bullets/SP601_nyknck': 'splash_warm',
    'fx/bullets/bullets/SP603_nyknck': 'splash_pale',
    'fx/bullets/bullets/SFX303_nyknck': 'slash_cyan',
}


# ---------------------------------------------------------------- NEW FX --
# Chosen for the six abilities added with them, plus a proper bolt for Raio de
# Tupã — which had been a hand-drawn line since the day it was written.
NEW_FX = {
    'Lightning/lightning_strike_001/lightning_strike_001_large_violet': 'bolt',
    'Lightning/lightning_burst_002/lightning_burst_002_small_violet': 'zap',
    'Magic Bursts/directional_music_burst_001/directional_music_burst_001_small_red': 'notes',
    'Fantasy Spells/spell_haste_001/spell_haste_001_large_green': 'haste',
    'Fantasy Spells/spell_heal_001/spell_heal_001_large_red': 'heartburst',
    'Impacts/symmetrical_impact_001/symmetrical_impact_001_large_yellow': 'clang',
    'Smoke Bursts/directional_smoke_burst_001/directional_smoke_burst_001_large_white': 'gust',
}


def main():
    for src, name in BULLETS.items():
        from_folder(os.path.join('projectiles', 'animated_bullets', src), name + '.png')

    for n in range(1, 6):
        from_folder(os.path.join('fx', 'blood', str(n)), 'blood_%d.png' % n)

    for src, name in IMPACTS.items():
        from_folder(src, name + '.png')

    # THE TORNADO. Row 4 of the eleven-frame column is the dust-brown variant,
    # which is the only one of the nine that belongs in a caatinga. The other
    # eight are fire, ice and neon.
    from_grid_row('projectiles/Free/Part 10/464.png', 'tornado.png', 64, 4, 11)

    # ------------------------------------------------------------------ FX --
    # The PNG library ships one folder of loose frames per effect per colour,
    # which is the same packing problem as the bullets and blood.
    for src, name in NEW_FX.items():
        from_folder(os.path.join('fx', 'PNG', src), name + '.png')

    # RAIN. A cluster of falling streaks, in the blue row.
    #
    # The obvious pick was the frost sheet in public/fx, and it was wrong: it
    # is drawn as six-pointed snowflakes, and no amount of recolouring turns a
    # snowflake into a raindrop. This is nine frames of diagonal streaks, which
    # is what rain looks like from above. One cluster is small, so the ability
    # scatters a dozen of them across its radius rather than stretching one.
    from_grid_row('projectiles/Free/Part 9/447.png', 'rain_streak.png', 64, 2, 9)


if __name__ == '__main__':
    main()
