import type { Game } from '../Game'
import type { AbilityState, Enemy, Player } from '../types'
import { CONFIG } from '../config'
import { ABILITIES, at, type AbilityId } from '../data/abilities'
import { resolveWeapon } from '../data/weapons'
import { ENEMIES } from '../data/enemies'
import { GAMBLE_FX, rollGamble } from '../data/gamble'


/**
 * The timed abilities.
 *
 * Each one owns a countdown on the player and does its thing when it reaches
 * zero. They are deliberately kept out of `combat.ts`: that file is about the
 * revolver and about being hit, and mixing seven independent clocks into it
 * turns the player update into something nobody can read.
 *
 * Anything that reacts to an event instead of a clock — poison landing on a
 * bullet hit, Tijolo de Leite answering a hit — lives next to the event that
 * triggers it, and only its numbers come from here.
 */

/**
 * How long this ability's full cooldown is, so the HUD can draw a meaningful
 * ring. Passive abilities report 0 and read as always-on.
 */
/**
 * WHAT AN ABILITY GOING OFF FEELS LIKE.
 *
 * One place, so every one of them answers the same way and a new card gets it
 * for free. Three things, and they are deliberately small:
 *
 *   THE TILE KICKS.  `fired` counts down and the HUD scales the tile off it.
 *                    This is the whole of the fix for "did that button work" —
 *                    the thing you pressed has to move.
 *   A RING AT HIS FEET. Small, on the ground, gone in a fifth of a second.
 *   AND THE CAMERA NUDGES. `shake` is quadratic in the renderer, so 0.14 is
 *                    about a pixel and a half — felt rather than seen. A dash
 *                    is 0.32 and a bomb landing is 0.45; anything that fires
 *                    on a timer has to sit well under those or the screen is
 *                    never still.
 */
export const CAST_FLASH = 0.28

export function castFx(g: Game, id: AbilityId, shake = 0.14) {
  const st = g.player.abilities[id]
  st.fired = CAST_FLASH
  if (shake > 0) g.camera.addShake(shake)
}

export function abilityInterval(id: AbilityId, stacks: number): number {
  switch (id) {
    case 'bomba': return at(ABILITIES.bomba.cooldown, stacks)
    case 'escudo': return at(ABILITIES.escudo.interval, stacks)
    case 'escudo_fiel': return at(ABILITIES.escudo_fiel.interval, stacks)
    case 'dash': return at(ABILITIES.dash.cooldown, stacks)
    case 'chuva': return at(ABILITIES.chuva.cooldown, stacks)
    case 'cogumelo': return at(ABILITIES.cogumelo.cooldown, stacks)
    case 'tornado': return at(ABILITIES.tornado.cooldown, stacks)
    case 'tupa': return at(ABILITIES.tupa.cooldown, stacks)
    case 'privacidade': return ABILITIES.privacidade.interval
    case 'tambaqui': return at(ABILITIES.tambaqui.interval, stacks)
    case 'teleporte': return at(ABILITIES.teleporte.cooldown, stacks)
    case 'escudo_alien': return at(ABILITIES.escudo_alien.recharge, stacks)
    /*
     * THE SIX THAT ARRIVED LATER, and were never added here.
     *
     * `default: 0` reads as "no cooldown to show", so the HUD drew every one
     * of these as permanently ready and the sweep never moved. It only got
     * NOTICED on Cálice, because that is the one you press and therefore the
     * one where a full ring that means nothing is a lie you act on — but all
     * six were wrong in exactly the same way.
     */
    case 'ventos': return at(ABILITIES.ventos.cooldown, stacks)
    case 'bigorna': return at(ABILITIES.bigorna.cooldown, stacks)
    case 'cantarolar': return at(ABILITIES.cantarolar.cooldown, stacks)
    case 'calice': return at(ABILITIES.calice.cooldown, stacks)
    case 'lostmedia': return at(ABILITIES.lostmedia.cooldown, stacks)
    /*
     * Just the wait for these two, not the wait plus the window. `cd` only
     * ever counts the wait — the window lives in its own timer on the player —
     * so measuring the bar against both would leave it stuck part-full for the
     * whole cooldown and never reach empty. The window is shown by the tile
     * lighting up instead; see `abilityActive`, which is how Dash and Dança
     * da Chuva have always done it.
     */
    case 'podertupa': return at(ABILITIES.podertupa.cooldown, stacks)
    case 'chapeu': return at(ABILITIES.chapeu.cooldown, stacks)
    default: return 0
  }
}

/** Is this ability's effect running right now? Drives the HUD highlight. */
export function abilityActive(p: Player, id: AbilityId): boolean {
  if (id === 'escudo' || id === 'escudo_fiel') return p.shield > 0
  if (id === 'dash') return p.dashT > 0
  if (id === 'chuva') return p.rainT > 0
  if (id === 'privacidade') return p.invisible > 0
  if (id === 'escudo_alien') return p.absorb > 0
  // The two that run for a while after they fire.
  if (id === 'podertupa') return p.tupaT > 0
  if (id === 'chapeu') return p.hatT > 0
  if (id === 'calice') return p.drunkT > 0
  // The ring is only ever on, so it reads as always active.
  if (id === 'orbital') return p.abilities.orbital.stacks > 0
  return false
}

export function updateAbilities(g: Game, dt: number) {
  // The tile kick, on every ability at once. See `castFx`.
  for (const key in g.player.abilities) {
    const st = g.player.abilities[key as AbilityId]
    if (st.fired > 0) st.fired = Math.max(0, st.fired - dt)
  }

  const p = g.player
  const a = p.abilities

  /*
   * Buffs and curses run down here, together, so there is exactly one place
   * that decides when a gamble result stops mattering. Removing from the back
   * keeps the splice cheap and the order stable.
   */
  for (let i = p.ghosts.length - 1; i >= 0; i--) {
    p.ghosts[i].t += dt
    if (p.ghosts[i].t >= p.ghosts[i].life) p.ghosts.splice(i, 1)
  }

  for (let i = p.effects.length - 1; i >= 0; i--) {
    const fx = p.effects[i]
    fx.t -= dt
    if (fx.t <= 0) p.effects.splice(i, 1)
  }

  if (p.shield > 0) p.shield -= dt
  if (p.invisible > 0) {
    p.invisible -= dt
    // The moment he reappears, the horde re-acquires him.
    if (p.invisible <= 0) g.lostPlayer = false
  }
  if (p.blinkFrom) {
    p.blinkFrom.t -= dt
    if (p.blinkFrom.t <= 0) p.blinkFrom = null
  }


  // ---- PODER DE TUPÃ ------------------------------------------------------
  /*
   * FIRST, because everything below it multiplies by the window this opens.
   *
   * Held open by the ability rather than by an effect timer: `mods.ability` is
   * reset to 1 every frame and put back up while the window is running, so
   * there is no way for the buff to survive the card being swapped out or the
   * run being reset. A multiplier that leaks is the worst kind of bug to find.
   */
  /*
   * THE FLOOR IS WHAT THE CARDS BOUGHT, not a flat 1.
   *
   * Reset every frame either way, so Tupã's window still cannot leak and a
   * swapped-out card still cannot leave a multiplier behind. `abilityMul` is
   * rebuilt from the deck by `apply`, so it is as safe to fold in here as the
   * literal it replaces. See `PlayerMods.abilityMul`.
   */
  p.mods.ability = p.mods.abilityMul
  if (a.podertupa.stacks > 0) {
    const P = ABILITIES.podertupa
    if (p.tupaT > 0) {
      p.tupaT -= dt
      // The window multiplies what the deck already bought.
      p.mods.ability = at(P.power, a.podertupa.stacks) * p.mods.abilityMul
      /*
       * THE SKY IS NOT DOING THIS FOR FREE, AND IT SAYS SO NOW.
       *
       * The card fires ITSELF on a cooldown: the window opens with no input,
       * chips health for its whole duration, and until this the only thing on
       * screen was one flash at the start and one at the end. A player farming
       * quietly watched their bar fall for four seconds with nothing to blame,
       * which is precisely the report this is fixing.
       *
       * Three cues, none of them subtle: a bolt every third of a second so the
       * cause is continuously visible, the drain feedback that
       * `damagePlayerOverTime` now carries, and a labelled entry in the effect
       * strip for as long as the window is open.
       */
      g.damagePlayerOverTime(at(P.chip, a.podertupa.stacks) * dt)
      p.tupaSpark -= dt
      if (p.tupaSpark <= 0) {
        p.tupaSpark = 0.3
        const ang = Math.random() * Math.PI * 2
        g.spawnFx('zap', p.x + Math.cos(ang) * 11, p.y - 16 + Math.sin(ang) * 7, 0.5)
        g.audio.play('shield', { volume: 0.22, rate: 1.9, throttle: 0.25, maxVoices: 1 })
      }
      if (p.tupaT <= 0) g.spawnFx('zap', p.x, p.y - 14, 0.8)
    } else {
      a.podertupa.cd -= dt
      if (a.podertupa.cd <= 0) {
        a.podertupa.cd = at(P.cooldown, a.podertupa.stacks)
        p.tupaT = at(P.window, a.podertupa.stacks)
        p.tupaSpark = 0
        castFx(g, 'podertupa', 0.22)
        g.spawnFx('zap', p.x, p.y - 14, 1.1)
        g.audio.play('levelUp', { volume: 0.6 })
        g.camera.addShake(0.25)
        /*
         * NAMED IN THE STRIP, and named for what it COSTS.
         *
         * `good: false` on purpose even though the window is a buff: the strip
         * is the only place that stays on screen for the whole four seconds,
         * and the thing the player needs from it is not \"you are strong\" —
         * they can see that — it is \"this is what is eating your health\".
         */
        g.addEffect({
          id: 'podertupa', label: 'TUPÃ COBRANDO VIDA', good: false,
          t: at(P.window, a.podertupa.stacks),
        })
      }
    }
  } else {
    p.tupaT = 0
  }

  // ---- VENTOS DE TUPÃ -----------------------------------------------------
  if (a.ventos.stacks > 0) {
    a.ventos.cd -= dt
    if (a.ventos.cd <= 0) {
      const V = ABILITIES.ventos
      a.ventos.cd = at(V.cooldown, a.ventos.stacks)
      castFx(g, 'ventos', 0.18)
      const r = at(V.radius, a.ventos.stacks)
      const damage = at(V.damage, a.ventos.stacks) * p.mods.damage * p.mods.ability

      /*
       * IT MOVES THE CROWD. The damage is the smaller half of this.
       *
       * Knockback is written straight into the (kx, ky) channel rather than
       * handed to `damageEnemy`, because that channel decays on its own and
       * does not fight the steering — which is exactly what a gust should do:
       * everything goes flying and then walks back.
       */
      const items = g.enemies.items
      let hit = 0
      for (let i = items.length - 1; i >= 0; i--) {
        const e = items[i]
        const dx = e.x - p.x
        const dy = e.y - (p.y - 12)
        const d = Math.hypot(dx, dy)
        if (d > r) continue
        hit++
        const k = V.push / (e.def.mass ?? 1)
        const n = d || 1
        g.damageEnemy(i, damage, (dx / n) * k, (dy / n) * k)
      }
      g.spawnFx('gust', p.x, p.y - 10, (r * 2) / 120)
      g.camera.addShake(0.3)
      g.audio.play('dash', { volume: 0.55, rate: 0.7 })
      if (hit > 0) g.spawnFloater(p.x, p.y - 46, 'VENTO!', '#cfe8ff')
    }
  }

  // ---- ARREMESSA BIGORNA --------------------------------------------------
  if (a.bigorna.stacks > 0) {
    a.bigorna.cd -= dt
    if (a.bigorna.cd <= 0) {
      const B = ABILITIES.bigorna
      a.bigorna.cd = at(B.cooldown, a.bigorna.stacks)
      castFx(g, 'bigorna', 0.1)
      const n = at(B.count, a.bigorna.stacks)

      /*
       * THEY ARE AIMED AT SOMETHING, not scattered around him.
       *
       * They used to fall on a random ring, which meant three anvils and
       * seventy damage each mostly landing on empty dirt while the player took
       * the self-damage roll anyway. Aimed, the card is what it sounds like:
       * you drop iron on the crowd and you had better not be standing in it.
       *
       * INDICES, not enemies. `bodies` is a list of positions in the pool and
       * the pool moves things around on every death — so each one is read the
       * instant it is drawn and never held across a spawn.
       */
      bodies.length = 0
      const reach = B.spread + 60
      for (let j = 0; j < g.enemies.items.length; j++) {
        const e = g.enemies.items[j]
        if (Math.hypot(e.x - p.x, e.y - p.y) < reach) bodies.push(j)
      }

      for (let i = 0; i < n; i++) {
        let tx: number
        let ty: number
        if (bodies.length > 0) {
          // Drawn without replacement, so three anvils are three targets
          // rather than three copies of the same one.
          const e = g.enemies.items[bodies.splice((Math.random() * bodies.length) | 0, 1)[0]]
          tx = e.x + e.vx * ABILITIES.bigorna.fall * B.lead
          ty = e.y + e.vy * ABILITIES.bigorna.fall * B.lead
        } else {
          // Nothing worth hitting. It still throws, near him, so the card is
          // never silently doing nothing.
          const ang = Math.random() * Math.PI * 2
          const rr = 34 + Math.random() * B.spread
          tx = p.x + Math.cos(ang) * rr
          ty = p.y + Math.sin(ang) * rr * 0.7
        }
        g.spawnAnvil(
          tx, ty,
          at(B.damage, a.bigorna.stacks) * p.mods.damage * p.mods.ability,
          at(B.selfDamage, a.bigorna.stacks),
          B.radius,
        )
      }
    }
  }

  // ---- CANTAROLAR ---------------------------------------------------------
  if (a.cantarolar.stacks > 0) {
    a.cantarolar.cd -= dt
    if (a.cantarolar.cd <= 0) {
      const C = ABILITIES.cantarolar
      a.cantarolar.cd = at(C.cooldown, a.cantarolar.stacks)
      castFx(g, 'cantarolar', 0.06)
      const count = at(C.count, a.cantarolar.stacks)
      const damage = at(C.damage, a.cantarolar.stacks) * p.mods.damage * p.mods.ability
      /*
       * WHERE HE IS LOOKING, which makes this the only automatic thing in the
       * build that answers to the mouse. A narrow fan rather than one line, so
       * a phrase reads as a phrase.
       */
      const aim = Math.atan2(p.aimY, p.aimX)
      for (let i = 0; i < count; i++) {
        const off = (i / Math.max(1, count - 1) - 0.5) * 0.34
        const ang = aim + (count > 1 ? off : 0)
        g.spawnBullet(
          p.x, p.y - 14,
          Math.cos(ang) * C.speed, Math.sin(ang) * C.speed,
          damage, C.pierce, 8, 40, true, 'nota', C.range,
        )
      }
      g.audio.play('pickup', { volume: 0.35, rate: 1.4, throttle: 0.2 })
    }
  }

  // ---- CHAPÉU-BONITO ------------------------------------------------------
  if (a.chapeu.stacks > 0) {
    const H = ABILITIES.chapeu

    /*
     * IT SITS ON HIM LIKE A HAT, which it did not.
     *
     * Between laps it was pinned to one pixel above his head and rotated by
     * exactly nothing, so a man sprinting across the caatinga wore a perfectly
     * still hat — the one object on screen that did not agree the rest of the
     * screen was moving.
     *
     * TWO NUMBERS, both eased rather than read. The LEAN tips it back off the
     * wind he is making, and because it is eased it also hangs over forward
     * for a moment after he stops. The BOB rides his walk cycle, and fades out
     * when he does. Neither is applied while the hat is on its lap; `hatAt`
     * blends them out with `k`.
     */
    const walking = Math.min(1, Math.hypot(p.vx, p.vy) / (CONFIG.PLAYER.speed * 0.8))
    const wantLean = -(p.vx / CONFIG.PLAYER.speed) * 0.34
    p.hatLean += (wantLean - p.hatLean) * Math.min(1, dt * 7)
    p.hatBob += (walking - p.hatBob) * Math.min(1, dt * 9)
    if (p.hatT > 0) {
      p.hatT -= dt
      p.hatSpin += at(H.spin, a.chapeu.stacks) * dt
      const damage = at(H.damage, a.chapeu.stacks) * p.mods.damage * p.mods.ability
      /*
       * The hit test uses the hat's REAL position, launch and landing
       * included, so a body standing between him and the ring gets clipped on
       * the way out. Same helper the renderer draws from — one hat, one place
       * it is, and no chance of the picture and the damage disagreeing.
       */
      const hats = at(H.hats, a.chapeu.stacks)
      const items = g.enemies.items
      for (let n = 0; n < hats; n++) {
        const h = hatAt(p, a.chapeu.stacks, (n / hats) * Math.PI * 2)
        for (let i = items.length - 1; i >= 0; i--) {
          const e = items[i]
          if (e.orbitCd > 0) continue
          const reach = e.radius + H.size
          if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 > reach * reach) continue
          e.orbitCd = H.hitCd
          const d = Math.hypot(e.x - p.x, e.y - p.y) || 1
          g.damageEnemy(i, damage, ((e.x - p.x) / d) * 200, ((e.y - p.y) / d) * 200)
        }
      }
      // AND IT LANDS. Announced, because a thing coming back has an arrival.
      if (p.hatT <= 0) {
        p.hatT = 0
        g.spawnFx('splash_pale', p.x, p.y - 4, 0.4)
        g.audio.play('pickup', { volume: 0.3, rate: 1.5 })
      }
    } else {
      a.chapeu.cd -= dt
      if (a.chapeu.cd <= 0) {
        a.chapeu.cd = at(H.cooldown, a.chapeu.stacks)
        p.hatT = at(H.duration, a.chapeu.stacks)
        castFx(g, 'chapeu', 0.12)
        // Starts its lap behind him, so it comes round into view.
        p.hatSpin = Math.PI * 1.5
        // It leaves his head, and you see it go.
        g.spawnFx('spark', p.x, p.y + H.restY, 0.55)
        g.audio.play('dash', { volume: 0.4, rate: 1.6 })
      }
    }
  } else {
    p.hatT = 0
  }

  // ---- CÁLICE -------------------------------------------------------------
  if (a.calice.stacks > 0) {
    a.calice.cd -= dt
    if (a.calice.cd <= 0 && g.input.consumePressed('f')) {
      const C = ABILITIES.calice
      a.calice.cd = at(C.cooldown, a.calice.stacks)
      castFx(g, 'calice', 0.16)
      g.heal(at(C.heal, a.calice.stacks))
      /*
       * AND THE REST OF WHAT IS IN IT.
       *
       * The heal is the reason to press F; the three seconds afterwards are
       * the reason not to press it in the middle of something. Without the
       * penalty this is a free heal on a timer, which is not a decision.
       */
      p.drunkT = C.drunk
      g.spawnFx('heartburst', p.x, p.y - 16, 0.55)
      g.audio.play('heal', { volume: 0.9 })
      g.spawnFloater(p.x, p.y - 50, 'GOLE', '#9fe0a0')
    }
  }
  if (p.drunkT > 0) p.drunkT -= dt

  // ---- BOMBAS DO LOURO ----------------------------------------------------
  if (a.bomba.stacks > 0) {
    a.bomba.cd -= dt
    if (a.bomba.cd <= 0) {
      a.bomba.cd = at(ABILITIES.bomba.cooldown, a.bomba.stacks)
      const B = ABILITIES.bomba
      const volley = at(B.count, a.bomba.stacks)
      /*
       * Thrown somewhere random, but random INTO THE CROWD.
       *
       * A uniformly random point around the player lands in empty caatinga
       * most of the time — measured, that version of the ability was worth
       * about 8% more kills, which is not worth a card. Picking a random body
       * and scattering around it keeps the throw unaimed and unpredictable,
       * which is the character of the thing, while making it actually land
       * near something. Falls back to open ground when nothing is in range.
       */
      const crowd = g.enemies.items
      const damage = at(B.damage, a.bomba.stacks) * p.mods.damage * p.mods.ability

      // The whole volley goes out at once — more cards means the sky opens up
      // around you, not that one bomb hits harder.
      /*
       * BOMBS ARE AIMED NOW, not scattered.
       *
       * They used to pick any body in the pool at random and land within
       * thirty-five units of it, which on a full screen meant most of a volley
       * went somewhere the player was not fighting. Each bomb now picks the
       * best target it can — nearest first, and never the same body twice in
       * one volley — and lands much closer to it. The blast radius is
       * unchanged, so this is accuracy, not power.
       */
      const marks: Enemy[] = []
      if (crowd.length > 0) {
        const reach = B.throwRange * 1.4
        const near: { e: Enemy; d: number }[] = []
        for (const e of crowd) {
          const d = Math.hypot(e.x - p.x, e.y - p.y)
          if (d < reach) near.push({ e, d })
        }
        near.sort((a2, b2) => a2.d - b2.d)
        for (let k = 0; k < volley && k < near.length; k++) marks.push(near[k].e)
      }

      for (let n = 0; n < volley; n++) {
        let tx: number
        let ty: number
        const mark = marks[n] ?? null
        if (mark) {
          // Enough scatter that a volley does not stack on one body, not
          // enough to miss the one it was aimed at.
          tx = mark.x + (Math.random() - 0.5) * 22
          ty = mark.y + (Math.random() - 0.5) * 22
        } else {
          const ang = Math.random() * Math.PI * 2
          const dist = B.throwMin + Math.random() * (B.throwRange - B.throwMin)
          tx = p.x + Math.cos(ang) * dist
          ty = p.y + Math.sin(ang) * dist
        }
        const a2 = g.activeArena
        if (a2) {
          tx = Math.max(a2.centerX - a2.halfW + 20, Math.min(a2.centerX + a2.halfW - 20, tx))
          ty = Math.max(a2.centerY - a2.halfH + 20, Math.min(a2.centerY + a2.halfH - 20, ty))
        }
        g.spawnBomb(tx, ty, damage, B.radius)
      }
    }
  }

  // ---- RNG DE RPG — roll the table ----------------------------------------
  if (a.escudo.stacks > 0) {
    a.escudo.cd -= dt
    if (a.escudo.cd <= 0) {
      a.escudo.cd = at(ABILITIES.escudo.interval, a.escudo.stacks)
      // Cards and sorte both bend the same roll, which is why the two are
      // worth more together than apart.
      const luck = p.mods.luck + at(ABILITIES.escudo.bias, a.escudo.stacks)
      const rolled = rollGamble(luck)
      g.audio.play('gamble', { volume: 0.7 })
      g.audio.play(rolled.tone === 'bom' ? 'gambleGood' : 'gambleBad', { volume: 0.6 })
      /*
       * THE DICE ROLL THEMSELVES, ON A CLOCK, WITH NO INPUT.
       *
       * So the one thing the player must never have to work out is which of
       * the things happening to them was the card. A bad face gets a red burst
       * on him and a kick — the same language a hit uses — a fifth of a second
       * before whatever it does actually lands, so the cause arrives first.
       */
      if (rolled.tone !== 'bom') {
        g.spawnFx('nebula', p.x, p.y - 14, 0.7)
        g.camera.addShake(0.3)
        // A red pulse, borrowed from the drain: it says "this is costing you"
        // in the one channel the player cannot look away from.
        p.dotT = 0.35
      }
      applyGamble(g, rolled.id, a.escudo.stacks)
    }
  }

  // ---- ESCUDO FIEL — the one that always turns up -------------------------
  if (a.escudo_fiel.stacks > 0) {
    a.escudo_fiel.cd -= dt
    if (a.escudo_fiel.cd <= 0) {
      a.escudo_fiel.cd = at(ABILITIES.escudo_fiel.interval, a.escudo_fiel.stacks)
      p.shield = Math.max(p.shield, at(ABILITIES.escudo_fiel.duration, a.escudo_fiel.stacks))
      g.spawnFloater(p.x, p.y - 40, 'ESCUDO', '#8fd4ff')
      g.audio.play('shield', { volume: 0.5 })
    }
  }

/**
 * WHICH WAY A DASH OR A BLINK GOES.
 *
 * Both of these are escapes, and both of them used to ask the AIM vector where
 * to go. On a mouse that is right: the aim vector is the cursor, and pointing
 * at where you want to end up is the whole feel of the ability.
 *
 * ON TOUCH IT IS EXACTLY BACKWARDS. There is no cursor, so `updatePlayer`
 * falls the aim back to nearest-target — which means on a phone, Teleporte
 * dropped the player ON TOP of whatever was chasing them, every single time,
 * and a standing dash charged it. The one button you press to get out of
 * trouble was a button that took you into it.
 *
 * So, in order:
 *   1. WHERE THE STICK IS PUSHING. That is what the player means, always, and
 *      it is the only one of the three that is an actual instruction.
 *   2. Nothing pushed, cursor present: the cursor. Desktop is unchanged.
 *   3. Nothing pushed, no cursor: AWAY from what the gun is pointed at, since
 *      what the gun is pointed at is the nearest thing trying to kill him.
 */
/**
 * REMEMBER A PRESS, ready or not.
 *
 * Called every frame for every ability the player triggers themselves. The
 * press is taken out of the input buffer immediately — along with any heading
 * a touch button dragged onto it — and parked on the ability, where it stays
 * good for `ABILITY_QUEUE` seconds rather than the fifth of a second the input
 * layer keeps things for.
 *
 * See `AbilityState.queue` for why the short buffer was wrong here.
 */
function queue(g: Game, st: AbilityState, key: string, dt: number) {
  if (g.input.consumePressed(key)) {
    st.queue = CONFIG.ABILITY_QUEUE
    const aim = g.input.takeAim(key)
    st.queueAimed = !!aim
    st.queueX = aim ? aim.x : 0
    st.queueY = aim ? aim.y : 0
  } else if (st.queue > 0) {
    st.queue = Math.max(0, st.queue - dt)
  }
}

/** Spends the queued press and hands back the heading it came with, if any. */
function takeQueue(st: AbilityState): { x: number; y: number } | null {
  st.queue = 0
  if (!st.queueAimed) return null
  st.queueAimed = false
  return { x: st.queueX, y: st.queueY }
}

function escapeDir(g: Game, p: Player): { x: number; y: number } {
  const mx = g.input.moveX
  const my = g.input.moveY
  const len = Math.hypot(mx, my)
  if (len > 0.2) return { x: mx / len, y: my / len }
  if (g.input.hasPointer) return { x: p.aimX, y: p.aimY }
  return { x: -p.aimX, y: -p.aimY }
}

  // ---- DASH EMPÍRICO ------------------------------------------------------
  if (a.dash.stacks > 0) {
    if (a.dash.cd > 0) a.dash.cd -= dt
    if (p.dashT > 0) {
      p.dashT -= dt
      // One every couple of frames: enough to read as a streak, few enough
      // that the sprite underneath is still the thing you are looking at.
      if (Math.random() < 0.55) pushGhost(p, 0.9)
    }
    /*
     * THE PRESS IS READ WHETHER OR NOT IT CAN BE ANSWERED.
     *
     * It used to be read only once the cooldown had cleared, which meant a
     * press made a quarter-second early was consumed by nobody, expired in the
     * input buffer, and vanished. The player pressed dash, nothing happened,
     * and the ability read as broken — this is the whole of the clunk.
     */
    queue(g, a.dash, ' ', dt)
    if (a.dash.cd <= 0 && p.dashT <= 0 && a.dash.queue > 0) {
      const D = ABILITIES.dash
      // Dragged off the button beats everything: it is the one input that is
      // unambiguously an instruction about direction.
      const dir = takeQueue(a.dash) ?? escapeDir(g, p)
      const len = Math.hypot(dir.x, dir.y) || 1
      p.dashX = dir.x / len
      p.dashY = dir.y / len
      p.dashT = at(D.duration, a.dash.stacks)
      castFx(g, 'dash', 0)
      a.dash.cd = at(D.cooldown, a.dash.stacks)

      /*
       * THE FEEDBACK, which is most of what a dash IS.
       *
       * A kick of shake, a dust ring at the foot he pushed off, and a trail
       * laid down through the lunge. Without these the sprite simply appears
       * somewhere else and the whole thing reads as a stutter rather than as
       * an action the player took.
       */
      g.audio.play('dash', { volume: 0.7, rate: 1.15 })
      g.camera.addShake(0.32)
      g.spawnBlast(p.x, p.y, 26)
      pushGhost(p, 1)
    }
  }

  // ---- DANÇA DA CHUVA ----------------------------------------------------
  //
  // It rains on HIM. The ring moves with the player for its whole duration,
  // which is what makes it the answer to being surrounded rather than a puddle
  // left behind.
  if (a.chuva.stacks > 0) {
    const C = ABILITIES.chuva
    if (p.rainT > 0) {
      p.rainT -= dt
      p.rainCd -= dt
      if (p.rainCd <= 0) {
        p.rainCd = C.tick
        const radius = at(C.radius, a.chuva.stacks)
        const damage = at(C.damage, a.chuva.stacks) * p.mods.damage * p.mods.ability
        const r2 = radius * radius
        for (let j = g.enemies.items.length - 1; j >= 0; j--) {
          const e = g.enemies.items[j]
          const dx = e.x - p.x
          const dy = e.y - (p.y - 8)
          if (dx * dx + dy * dy > r2) continue
          g.damageEnemy(j, damage, 0, 0, true)
        }
      }
      if (p.rainT <= 0) a.chuva.cd = at(C.cooldown, a.chuva.stacks)
    } else {
      a.chuva.cd -= dt
      if (a.chuva.cd <= 0) {
        p.rainT = at(C.duration, a.chuva.stacks)
        p.rainCd = 0
        g.spawnFloater(p.x, p.y - 46, 'CHUVA', '#8fd4ff')
        g.audio.play('rain', { volume: 0.5 })
      }
    }
  }

  // ---- COGUMELO ----------------------------------------------------------
  if (a.cogumelo.stacks > 0) {
    a.cogumelo.cd -= dt
    if (a.cogumelo.cd <= 0) {
      const M = ABILITIES.cogumelo
      a.cogumelo.cd = at(M.cooldown, a.cogumelo.stacks)
      g.storms.push({
        kind: 'cogumelo',
        x: p.x, y: p.y,
        radius: at(M.radius, a.cogumelo.stacks),
        delay: M.delay,
        life: M.duration,
        damage: at(M.damage, a.cogumelo.stacks) * p.mods.damage * p.mods.ability,
        tick: M.tick, tickCd: 0, age: 0,
        burst: {
          radius: at(M.burstRadius, a.cogumelo.stacks),
          damage: at(M.burstDamage, a.cogumelo.stacks) * p.mods.damage * p.mods.ability,
        },
      })
    }
  }

  // ---- TORNADO -----------------------------------------------------------
  if (a.tornado.stacks > 0) {
    a.tornado.cd -= dt
    if (a.tornado.cd <= 0) {
      const T = ABILITIES.tornado
      a.tornado.cd = at(T.cooldown, a.tornado.stacks)
      const n = at(T.count, a.tornado.stacks)
      const aim = Math.atan2(p.aimY, p.aimX)
      for (let k = 0; k < n; k++) {
        const spread = n === 1 ? 0 : (k - (n - 1) / 2) * 0.34
        const ang = aim + spread
        g.spawnBullet(
          p.x, p.y - 14,
          Math.cos(ang) * T.speed, Math.sin(ang) * T.speed,
          at(T.damage, a.tornado.stacks) * p.mods.damage * p.mods.ability,
          999, T.radius, 90, true, 'tornado', T.range,
        )
      }
    }
  }

  // ---- PRIVACIDADE --------------------------------------------------------
  if (a.privacidade.stacks > 0) {
    a.privacidade.cd -= dt
    if (a.privacidade.cd <= 0) {
      a.privacidade.cd = ABILITIES.privacidade.interval
      p.invisible = at(ABILITIES.privacidade.duration, a.privacidade.stacks)
      // Freeze where the horde last saw him; the AI walks to this spot instead.
      g.lostPlayer = true
      g.lastSeenX = p.x
      g.lastSeenY = p.y
      g.spawnFloater(p.x, p.y - 40, 'SUMIU', '#ffd479')
    }
  }

  // ---- TAMBAQUI -----------------------------------------------------------
  if (a.tambaqui.stacks > 0) {
    a.tambaqui.cd -= dt
    if (a.tambaqui.cd <= 0) {
      const T = ABILITIES.tambaqui
      a.tambaqui.cd = at(T.interval, a.tambaqui.stacks)
      throwFish(g, at(T.count, a.tambaqui.stacks), at(T.damage, a.tambaqui.stacks) * p.mods.damage * p.mods.ability)
    }
  }

  // ---- TELEPORTE ----------------------------------------------------------
  if (a.teleporte.stacks > 0) {
    if (a.teleporte.cd > 0) a.teleporte.cd -= dt
    queue(g, a.teleporte, 'q', dt)
    if (a.teleporte.cd <= 0 && a.teleporte.queue > 0) {
      const from = { x: p.x, y: p.y }
      blink(
        g, p, at(ABILITIES.teleporte.distance, a.teleporte.stacks),
        takeQueue(a.teleporte) ?? escapeDir(g, p),
      )
      a.teleporte.cd = at(ABILITIES.teleporte.cooldown, a.teleporte.stacks)
      castFx(g, 'teleporte', 0)

      /*
       * BOTH ENDS ARE ANNOUNCED. A blink that only marks where you arrived
       * leaves the player unsure whether it fired at all — the departure is
       * the half that proves the input registered.
       */
      g.spawnBlast(from.x, from.y, 30)
      g.spawnBlast(p.x, p.y, 34)
      p.ghosts.push({ x: from.x, y: from.y, t: 0, life: 0.34, flip: p.facing < 0 })
      g.audio.play('shield', { volume: 0.7, rate: 1.3 })
      g.camera.addShake(0.28)
      p.invuln = Math.max(p.invuln, 0.18)
    }
  }

  // ---- QUEIMA ROSCA -------------------------------------------------------
  updateQueima(g, dt)

  // ---- A GARRA ------------------------------------------------------------
  if (a.garra.stacks > 0) updateGarra(g, dt)

  // ---- EXECUTAR -----------------------------------------------------------
  updateExecutar(g, dt)

  // ---- PRIVADA ------------------------------------------------------------
  if (a.privada_fx.stacks > 0) {
    a.privada_fx.cd -= dt
    if (a.privada_fx.cd <= 0) {
      const T = ABILITIES.privada_fx
      a.privada_fx.cd = at(T.cooldown, a.privada_fx.stacks)
      /*
       * A cogumelo with no `burst`, which is the entire difference. The storm
       * system already does everything else: delay, ticks, radius, life. What
       * makes this a different card is that it never ends with a bang, so it
       * is somewhere to fight rather than somewhere to leave.
       */
      g.storms.push({
        kind: 'privada',
        x: p.x, y: p.y,
        radius: at(T.radius, a.privada_fx.stacks),
        delay: T.delay,
        life: at(T.duration, a.privada_fx.stacks),
        damage: at(T.damage, a.privada_fx.stacks) * p.mods.damage * p.mods.ability,
        tick: T.tick, tickCd: 0, age: 0,
      })
      castFx(g, 'privada_fx', 0)
      g.audio.play('rain', { volume: 0.4, rate: 1.3 })
    }
  }

  // ---- AMANTES ------------------------------------------------------------
  if (a.amantes.stacks > 0) updateAmantes(g, dt)

  // ---- ESCUDO VOADOR ------------------------------------------------------
  if (a.escudo_voador.stacks > 0) updateFlyingShield(g, dt)
  else if (p.shieldCd.length) p.shieldCd.length = 0

  // ---- ESCUDO ALIEN -------------------------------------------------------
  // Tops the bank back up over time. Spending a charge is in `damagePlayer`,
  // next to the blow it refuses.
  if (a.escudo_alien.stacks > 0) {
    const E = ABILITIES.escudo_alien
    const cap = at(E.capacity, a.escudo_alien.stacks)
    if (p.absorb < cap) {
      a.escudo_alien.cd -= dt
      if (a.escudo_alien.cd <= 0) {
        p.absorb += 1
        a.escudo_alien.cd = at(E.recharge, a.escudo_alien.stacks)
        g.spawnFloater(p.x, p.y - 44, 'CARGA', '#9be8b0')
      }
    } else {
      a.escudo_alien.cd = at(E.recharge, a.escudo_alien.stacks)
    }
  }

  // ---- LOST MEDIA ---------------------------------------------------------
  updateLostMedia(g, dt)

  // ---- RAIO DE TUPÃ -------------------------------------------------------
  if (a.tupa.stacks > 0) {
    a.tupa.cd -= dt
    if (a.tupa.cd <= 0) {
      const T = ABILITIES.tupa
      a.tupa.cd = at(T.cooldown, a.tupa.stacks)
      strike(
        g, at(T.count, a.tupa.stacks),
        at(T.damage, a.tupa.stacks) * p.mods.damage * p.mods.ability,
        at(T.radius, a.tupa.stacks),
      )
    }
  }

  // ---- REBIMBOCA ORBITAL --------------------------------------------------
  if (a.orbital.stacks > 0) updateOrbital(g, dt)

  updateStorms(g, dt)
}

/**
 * RAIO DE TUPÃ picks its own targets, and it picks the WORST of them.
 *
 * Biggest health bar in range, not the nearest body — everything else in the
 * build is good at crowds and bad at the one thing wading through them, so
 * this is the piece that answers a Grande Gordo. Elites count double, so a
 * boss draws the sky no matter what else is on screen.
 *
 * The bolt is queued as a ground hazard with a telegraph rather than resolved
 * on the spot, so the warning, the flash and the damage all come from one
 * place and clean themselves up.
 */
/*
 * `radius` used to be the blast; the bolt has no blast now, so the caller's
 * number is ignored rather than removed — it is still a tuned value on the
 * ability and taking it out of the table would be a second edit for no gain.
 */
function strike(g: Game, count: number, damage: number, _radius: number) {
  const p = g.player
  const items = g.enemies.items
  const T = ABILITIES.tupa
  const r2 = T.range * T.range

  const picks: number[] = []
  const scores: number[] = []
  for (let i = 0; i < items.length; i++) {
    const e = items[i]
    const dx = e.x - p.x
    const dy = e.y - p.y
    if (dx * dx + dy * dy > r2) continue
    const worth = e.hp * (e.def.elite ? 2 : 1)
    let slot = picks.length
    while (slot > 0 && scores[slot - 1] < worth) slot--
    if (slot >= count) continue
    picks.splice(slot, 0, i)
    scores.splice(slot, 0, worth)
    if (picks.length > count) { picks.pop(); scores.pop() }
  }

  for (let n = 0; n < count; n++) {
    // With nothing worth hitting it still comes down, out along the aim, so
    // the ability never silently does nothing.
    let tx: number
    let ty: number
    if (n < picks.length) {
      const e = items[picks[n]]
      tx = e.x
      ty = e.y
    } else {
      const ang = Math.atan2(p.aimY, p.aimX) + (n - count / 2) * 0.5
      const d = 140 + Math.random() * 120
      tx = p.x + Math.cos(ang) * d
      ty = p.y + Math.sin(ang) * d
    }
    g.storms.push({
      kind: 'raio',
      x: tx, y: ty,
      /*
       * THE RING IS SMALL NOW, because it is not a blast radius any more —
       * it is how far the bolt will reach to find a body when the one it was
       * aimed at has already died. Lightning that goes off in a circle is a
       * grenade with a different sprite; this hits ONE thing, hard, which is
       * what makes it worth aiming at whatever has the most health left.
       */
      radius: 30,
      delay: T.telegraph,
      // No damaging period of its own: it lands, it strikes, it is gone.
      life: 0.01,
      damage: 0, tick: 1, tickCd: 1, age: 0,
      single: true,
      burst: { radius: 30, damage },
      // Which of the five drawn bolts, chosen once so it does not flicker
      // between shapes while it is on screen.
      bolt: 1 + ((Math.random() * 5) | 0),
      flash: 0,
    })
  }
}

/**
 * LOST MEDIA: the recording, and the tapes that surface from it.
 *
 * THE RECORDING RUNS ALWAYS, whether the card has been taken or not. It costs
 * one small object every tenth of a second and it means a tape can surface the
 * instant the card is picked up rather than six seconds later — an ability
 * whose first use is a long wait for nothing feels broken however it is
 * documented.
 *
 * A tape is a read head walking that log forward in real time. It fires on its
 * own clock down the aim that was recorded, cannot be hurt, cannot be steered,
 * and cannot be re-aimed. It is not a summon. It is footage.
 */
const TAPE_SAMPLE = 0.1

function updateLostMedia(g: Game, dt: number) {
  const p = g.player
  const L = ABILITIES.lostmedia

  // ---- record ----
  g.tapeCd -= dt
  if (g.tapeCd <= 0) {
    g.tapeCd = TAPE_SAMPLE
    g.tapeLog.push({ x: p.x, y: p.y, ax: p.aimX, ay: p.aimY, flip: p.facing < 0 })
    // Only ever keep as much history as the longest tape could ask for.
    const keep = Math.ceil((L.delay + 10) / TAPE_SAMPLE)
    if (g.tapeLog.length > keep) g.tapeLog.splice(0, g.tapeLog.length - keep)
  }

  // ---- play ----
  for (let i = g.tapes.length - 1; i >= 0; i--) {
    const t = g.tapes[i]
    t.t += dt
    if (t.t >= t.life) { g.tapes.splice(i, 1); continue }

    t.head += dt / TAPE_SAMPLE
    const idx = Math.floor(t.head)
    const frame = g.tapeLog[Math.min(idx, g.tapeLog.length - 1)]
    if (!frame) { g.tapes.splice(i, 1); continue }

    const next = g.tapeLog[Math.min(idx + 1, g.tapeLog.length - 1)] ?? frame
    const k = t.head - idx
    t.x = frame.x + (next.x - frame.x) * k
    t.y = frame.y + (next.y - frame.y) * k
    t.flip = frame.flip

    t.fireCd -= dt
    if (t.fireCd <= 0) {
      t.fireCd = 1 / L.fireRate
      const len = Math.hypot(frame.ax, frame.ay) || 1
      const w = resolveWeapon(p.mods)
      g.spawnBullet(
        t.x, t.y - 14,
        (frame.ax / len) * w.bulletSpeed, (frame.ay / len) * w.bulletSpeed,
        w.damage * t.damage, w.pierce, w.bulletRadius, w.knockback, true,
        'bala', w.range,
      )
    }
  }

  // ---- surface a new one ----
  const st = p.abilities.lostmedia
  if (st.stacks <= 0) return
  st.cd -= dt
  if (st.cd > 0) return
  st.cd = at(L.cooldown, st.stacks)
  if (g.tapes.length >= at(L.tapes, st.stacks)) return

  // Where the recording was `delay` seconds ago, clamped to what exists.
  const back = Math.ceil(L.delay / TAPE_SAMPLE)
  const head = Math.max(0, g.tapeLog.length - back)
  if (g.tapeLog.length < 8) return

  g.tapes.push({
    head, t: 0,
    life: at(L.duration, st.stacks),
    fireCd: 0,
    damage: at(L.damage, st.stacks),
    x: g.tapeLog[head].x, y: g.tapeLog[head].y, flip: g.tapeLog[head].flip,
  })
  g.spawnFloater(p.x, p.y - 50, 'LOST MEDIA', '#ffd479')
  g.audio.play('shield', { volume: 0.5, rate: 0.7 })
}

/** Drops an afterimage where he is standing now. */
function pushGhost(p: Player, life: number) {
  if (p.ghosts.length > 12) p.ghosts.shift()
  p.ghosts.push({ x: p.x, y: p.y, t: 0, life, flip: p.facing < 0 })
}

/**
 * Rain and mushrooms: things sitting on the ground doing harm.
 *
 * Both wait, then tick damage into whatever is standing in them, and a
 * mushroom finishes with a bang. The per-enemy `rainCd` stops a body inside
 * two overlapping patches taking two full ticks in the same instant.
 */
function updateStorms(g: Game, dt: number) {
  // The single deepest hazard the player is standing in this frame.
  worstHazard = 0

  for (let i = g.storms.length - 1; i >= 0; i--) {
    const st = g.storms[i]
    st.age += dt

    if (st.delay > 0) { st.delay -= dt; continue }

    st.life -= dt
    const r2 = st.radius * st.radius

    /*
     * A HOSTILE patch — salt a Saleiro has left behind — bites continuously
     * rather than on the patch's own clock, because it is damage you are
     * STANDING IN. Ticking it would make walking through free as long as you
     * timed it, which is the opposite of what a trap is for.
     *
     * ONLY THE WORST PATCH COUNTS. A Saleiro that has been pacing leaves salt
     * on salt, and summing every overlap turned a trail into a wall of eighty
     * damage a second — a third of a health bar for stepping on the same spot
     * twice. Standing in salt should cost the same whether it was dropped once
     * or five times.
     */
    if (st.hostile) {
      const p = g.player
      const dx = p.x - st.x
      const dy = p.y - st.y
      if (dx * dx + dy * dy < r2) worstHazard = Math.max(worstHazard, st.damage)
    } else {
      st.tickCd -= dt
      if (st.tickCd <= 0) {
        st.tickCd = st.tick
        for (let j = g.enemies.items.length - 1; j >= 0; j--) {
          const e = g.enemies.items[j]
          if (e.rainCd > 0) continue
          const dx = e.x - st.x
          const dy = e.y - st.y
          if (dx * dx + dy * dy > r2) continue
          e.rainCd = st.tick * 0.9
          g.damageEnemy(j, st.damage, 0, 0, true)
        }
      }
    }

    if (st.life <= 0) {
      /*
       * A BOLT ALREADY SPENT, still on screen.
       *
       * Handled first and on its own, because everything below fires ONCE and
       * this block is re-entered every frame of the afterglow. Folded in with
       * the rest it re-shook the camera and re-played the thunder sixty times
       * a second for a sixth of a second, which sounds exactly like a bug.
       */
      if ((st.flash ?? 0) > 0) {
        st.flash = (st.flash ?? 0) - dt
        if ((st.flash ?? 0) > 0) continue
        g.storms.splice(i, 1)
        continue
      }

      // A mushroom goes out with a bang, and so does a bolt. Rain simply stops.
      if (st.burst && st.single) {
        /*
         * ONE BODY, THE NEAREST. Not everything in the ring.
         *
         * Looked up at the moment it lands rather than remembered from when it
         * was aimed: a second and a half of telegraph is long enough for the
         * thing it was pointed at to have died and been swap-removed out of
         * the pool, and holding an index across that is the bug this project
         * has already made three times.
         */
        let best = -1
        let bestD = st.burst.radius * st.burst.radius
        for (let j = 0; j < g.enemies.items.length; j++) {
          const e = g.enemies.items[j]
          const d = (e.x - st.x) ** 2 + (e.y - st.y) ** 2
          if (d < bestD) { bestD = d; best = j }
        }
        if (best >= 0) g.damageEnemy(best, st.burst.damage, 0, -260)
      } else if (st.burst) {
        g.playerBlast(st.x, st.y, st.burst.radius, st.burst.damage)
      }

      /*
       * A PRIVADA GOES OUT WITH A FLUSH.
       *
       * It has no `burst` — that is the whole card — so without this it simply
       * stopped existing between two frames, which reads as the effect having
       * been switched off rather than as the thing having finished. One
       * fast-playing burst, a gurgle, and the toilet is gone.
       *
       * No damage in it. A parting bang is what the cogumelo is for, and
       * giving this one too would collapse the difference between them.
       */
      if (st.kind === 'privada') {
        g.spawnFx('flush', st.x, st.y, (st.radius * 2.1) / 110)
        g.audio.play('rain', { volume: 0.55, rate: 0.55 })
        g.audio.play('drop', { volume: 0.4, rate: 0.8 })
        g.storms.splice(i, 1)
        continue
      }

      if (st.kind === 'raio') {
        g.camera.addShake(0.7)
        g.audio.play('boom', { volume: 0.5, rate: 1.5, throttle: 0.06 })
        // The white-hot moment at the foot of it. The FORK itself is drawn by
        // `drawStorms` for as long as `flash` lasts.
        g.spawnFx('zap', st.x, st.y, 0.9)
        /*
         * AND IT STAYS UP FOR A SIXTH OF A SECOND.
         *
         * Lightning is over before you see it, which is exactly why a game has
         * to hold it: deleted on the frame it lands the fork would be on
         * screen for one sixtieth of a second and read as a dropped frame.
         */
        st.flash = 0.22
        continue
      }
      g.storms.splice(i, 1)
    }
  }

  if (worstHazard > 0) {
    g.damagePlayerOverTime(worstHazard * dt)
    g.react('inHazard', undefined, 14)
  }
}

/**
 * WHERE THE HAT IS, and what it is doing.
 *
 * One function because two things need the answer — the damage test in
 * `updateAbilities` and the drawing in `render` — and a hat that is hitting
 * things somewhere other than where it appears to be is the worst kind of bug
 * to be told about.
 *
 * The lap is three parts, and only the middle one used to exist:
 *
 *   LAUNCH   it lifts off his head, spins up and swings out to the ring.
 *   ORBIT    round he goes.
 *   SETTLE   it comes back in, flattens out, and sits down again.
 *
 * `k` is how far out it is, 0 on his head and 1 on the ring, and everything
 * else — the roll, the size, the trail behind it — hangs off that one number.
 */
export function hatAt(p: Player, stacks: number, phase = 0) {
  const H = ABILITIES.chapeu
  // ON HIS HEAD. Not floating above it, and not bobbing on a clock of its own:
  // it is a hat, and a hat sits still and leans the way its owner is facing.
  const rx = p.x + (p.facing < 0 ? -1 : 1)
  const ry = p.y + H.restY

  /*
   * ON HIS HEAD, MOVING WITH HIM. See the block in `updateAbilities` that
   * drives `hatLean` and `hatBob`.
   *
   * The bob is twice his step frequency and a pixel and a half tall, which is
   * small enough to never read as the hat coming off and large enough that the
   * eye knows he is walking without looking at his legs. It leans into the
   * lean as well as rotating with it — a hat tipped back also slides back.
   */
  const bob = -Math.abs(Math.sin(p.anim * 9)) * 1.6 * p.hatBob
  const rest = {
    x: rx - p.hatLean * 4,
    y: ry + bob,
    k: 0,
    roll: p.hatLean,
    lift: 0,
  }

  if (p.hatT <= 0 || stacks <= 0) return rest

  const total = at(H.duration, stacks)
  const gone = total - p.hatT

  let k = 1
  let lift = 0
  if (gone < H.launch) {
    // Out, with a hop: it comes off the top of his head before it goes wide.
    const t = gone / H.launch
    k = t * t * (3 - 2 * t)
    lift = Math.sin(t * Math.PI) * 10
  } else if (p.hatT < H.settle) {
    // And back, dropping the last of the way rather than sliding in flat.
    const t = p.hatT / H.settle
    k = t * t * (3 - 2 * t)
    lift = Math.sin((1 - t) * Math.PI) * 8
  }

  // `phase` is which hat this is, in radians around the same orbit. One hat
  // passes it 0 and gets exactly what it always got.
  const spin = p.hatSpin + phase
  const ox = p.x + Math.cos(spin) * H.radius
  const oy = p.y - 12 + Math.sin(spin) * H.radius * 0.6
  /*
   * Interpolated from where it RESTS, not from a fixed point over his head.
   *
   * So the launch starts from the hat as it actually sits — leaning, bobbing
   * with his step — and the landing settles back into that rather than
   * snapping to a still pose the moment the lap ends.
   */
  return {
    x: rest.x + (ox - rest.x) * k,
    y: rest.y + (oy - rest.y) * k - lift,
    k,
    // Leaning on his head, spinning hard on the ring, and back to the lean on
    // the way home so it lands the right way up.
    roll: rest.roll * (1 - k) + spin * 1.6 * k,
    lift,
  }
}

let worstHazard = 0

/** Reused by ARREMESSA BIGORNA when it picks what to drop on. */
const bodies: number[] = []

/**
 * What one roll of the RNG de RPG actually does.
 *
 * Kept here rather than in `data/gamble.ts` because the table is data and this
 * is the part that reaches into the game — the split means the odds can be
 * re-tuned without reading a line of this, and vice versa.
 */
function applyGamble(g: Game, id: string, stacks: number) {
  const p = g.player
  const F = GAMBLE_FX

  switch (id) {
    case 'escudo':
      p.shield = Math.max(p.shield, at(ABILITIES.escudo.duration, stacks))
      g.spawnFloater(p.x, p.y - 40, 'ESCUDO!', '#8fd4ff')
      break

    case 'furia':
      g.addEffect({ id, label: 'MÃO QUENTE!', good: true, t: F.furia.seconds, fireRate: F.furia.fireRate })
      break
    case 'forca':
      g.addEffect({ id, label: 'FORÇA BRUTA!', good: true, t: F.forca.seconds, damage: F.forca.damage })
      break
    case 'ligeiro':
      g.addEffect({ id, label: 'PÉ DE VENTO!', good: true, t: F.ligeiro.seconds, speed: F.ligeiro.speed })
      break

    case 'cura':
      g.heal(F.cura.heal)
      g.spawnFloater(p.x, p.y - 40, 'REMÉDIO!', '#9be8b0')
      break

    case 'sumico':
      p.invisible = Math.max(p.invisible, F.sumico.seconds)
      g.lostPlayer = true
      g.lastSeenX = p.x
      g.lastSeenY = p.y
      g.spawnFloater(p.x, p.y - 40, 'SUMIÇO!', '#ffd479')
      break

    case 'carga':
      p.absorb += F.carga.charges
      g.spawnFloater(p.x, p.y - 40, 'CARGA EXTRA!', '#9be8b0')
      break

    case 'colheita':
      for (let k = 0; k < F.colheita.drops; k++) {
        const ang = Math.random() * Math.PI * 2
        const d = 20 + Math.random() * 60
        g.spawnPickup('xp', p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, F.colheita.value)
      }
      g.spawnFloater(p.x, p.y - 40, 'COLHEITA!', '#ffd24a')
      break

    // ------------------------------------------------------------ curses --
    case 'trava':
      g.addEffect({ id, label: 'TRAVOU A ARMA!', good: false, t: F.trava.seconds, fireRate: F.trava.fireRate })
      break
    case 'peia':
      g.addEffect({ id, label: 'PERNA BAMBA...', good: false, t: F.peia.seconds, speed: F.peia.speed })
      break
    case 'mira':
      g.addEffect({
        id, label: 'VISTA EMBAÇADA...', good: false, t: F.mira.seconds,
        range: F.mira.range, damage: F.mira.damage,
      })
      break

    case 'panela': {
      g.spawnFloater(p.x, p.y - 46, 'EXPLODIU NA MÃO!', '#ff9b9b')
      g.playerBlast(p.x, p.y, F.panela.radius, F.panela.damage * p.mods.damage * p.mods.ability)
      /*
       * A FRACTION of current health, and never the last of it. Dying to your
       * own upgrade with a boss watching is a bug report, not a story — so
       * this can leave him on his knees and never on the floor.
       */
      const self = Math.min(p.hp - 1, Math.round(p.hp * F.panela.selfFraction))
      if (self > 0) {
        /*
         * BOOKED THE WAY A BLOW IS BOOKED.
         *
         * It used to subtract straight off `hp`, which meant the summary's
         * DANO SOFRIDO did not count it and the SEM ENCOSTAR streak carried on
         * as though nothing had touched him — the same hole
         * `damagePlayerOverTime` had. The floor rule stays: this can leave him
         * on his knees and never on the floor.
         */
        if (p.sinceHit > g.runStats.bestStreak) g.runStats.bestStreak = p.sinceHit
        g.runStats.taken += self
        p.sinceHit = 0
        p.hp -= self
        p.invuln = Math.max(p.invuln, 0.6)
        p.dotT = 0.45
        g.camera.addShake(0.4)
        g.audio.play('hurt', { volume: 0.7 })
        g.spawnBlood(p.x, p.y - 8, 1.1)
        g.spawnFloater(p.x, p.y - 30, '-' + self, '#ff8a8a')
      }
      break
    }

    case 'chamou': {
      g.spawnFloater(p.x, p.y - 46, 'CHAMOU ATENÇÃO!', '#ff9b9b')
      const table = Object.values(ENEMIES).filter(
        (d) => d.behavior !== 'boss' && (d.firstSeenAt ?? 0) <= p.reach,
      )
      if (table.length === 0) break
      for (let k = 0; k < F.chamou.count; k++) {
        const def = table[(Math.random() * table.length) | 0]
        const ang = Math.random() * Math.PI * 2
        const d = 240 + Math.random() * 120
        g.spawnEnemy(def, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d)
      }
      break
    }
  }
}

/**
 * The ring of rounds circling the player.
 *
 * These are not pooled bullets. A bullet travels and expires; these have no
 * velocity of their own and exist for the whole run, so they are computed from
 * one angle on the ability state and tested against the horde directly. That
 * also keeps them out of the bullet pool, which a permanent entity would
 * otherwise occupy forever.
 */
/**
 * THE DRONE THAT EATS WHAT IS SHOT AT HIM.
 *
 * Runs the ring, then walks the hostile bullets once and asks whether any of
 * them is currently touching a drone that is off reload. A round that is
 * caught is REMOVED  + DASH +  not blocked, not slowed: it stops existing, which is the
 * only version of this that reads clearly when nine of them are on screen.
 *
 * ONE PASS OVER THE BULLETS, not one per drone. There are at most three drones
 * and up to four hundred bullets, so the loop that must stay cheap is the
 * bullet loop; the drone positions are computed once, up front, into a scratch
 * array that lives at module scope and is never handed out.
 *
 * See `ABILITIES.escudo_voador` for why this exists when the build already had
 * three shields.
 */
function updateFlyingShield(g: Game, dt: number) {
  const p = g.player
  const S = ABILITIES.escudo_voador
  const stacks = p.abilities.escudo_voador.stacks
  const n = at(S.count, stacks)
  const reload = at(S.reload, stacks)

  // Grown and trimmed in place: taking a second card must not reset the first
  // drone's reload, and losing one must not leave a cooldown behind.
  while (p.shieldCd.length < n) p.shieldCd.push(0)
  if (p.shieldCd.length > n) p.shieldCd.length = n

  p.shieldSpin = (p.shieldSpin + S.spin * dt) % (Math.PI * 2)
  let armed = 0
  for (let i = 0; i < n; i++) {
    if (p.shieldCd[i] > 0) p.shieldCd[i] -= dt
    const ang = p.shieldSpin + (i / n) * Math.PI * 2
    droneX[i] = p.x + Math.cos(ang) * S.radius
    droneY[i] = p.y - 12 + Math.sin(ang) * S.radius * 0.7
    if (p.shieldCd[i] <= 0) armed++
  }
  if (armed === 0) return

  const bullets = g.bullets.items
  for (let b = bullets.length - 1; b >= 0; b--) {
    const shot = bullets[b]
    if (shot.friendly) continue
    for (let i = 0; i < n; i++) {
      if (p.shieldCd[i] > 0) continue
      const reach = S.size + shot.radius
      const dx = shot.x - droneX[i]
      const dy = shot.y - droneY[i]
      if (dx * dx + dy * dy > reach * reach) continue

      // Caught. The round is gone and that drone is out for a moment.
      p.shieldCd[i] = reload
      g.spawnFx('ring', shot.x, shot.y, 0.42)
      g.audio.play('block', { volume: 0.4, rate: 1.5, throttle: 0.04, maxVoices: 4 })
      g.bullets.removeAt(b)
      break
    }
  }
}

/** Drone positions for this frame. Module scope: three numbers, no garbage. */
const droneX: number[] = []
const droneY: number[] = []

function updateOrbital(g: Game, dt: number) {
  const p = g.player
  const O = ABILITIES.orbital
  const stacks = p.abilities.orbital.stacks
  const cap = at(O.cap, stacks)
  const damage = at(O.damage, stacks) * p.mods.damage * p.mods.ability

  // The whole ring turns together, so the spacing stays even as they are spent.
  p.orbSpin = (p.orbSpin + O.speed * dt) % (Math.PI * 2)

  // Forge a replacement for anything spent, up to the cap.
  if (p.orbs.length < cap) {
    p.orbCd -= dt
    if (p.orbCd <= 0) {
      p.orbCd = at(O.respawn, stacks)
      /*
       * New ones go into the widest gap rather than at a fixed offset.
       *
       * Adding at a constant angle piles replacements on top of survivors and
       * leaves half the ring permanently open; picking the largest arc keeps
       * whatever is left spread around him, which is the point of a ring.
       */
      p.orbs.push(widestGap(p.orbs))
      g.audio.play('pickup', { volume: 0.3, throttle: 0.2 })
    }
  } else {
    p.orbCd = at(O.respawn, stacks)
  }
  if (p.orbs.length === 0) return

  const items = g.enemies.items
  const reach = O.radius + O.size + 40
  for (let i = items.length - 1; i >= 0 && p.orbs.length > 0; i--) {
    const e = items[i]
    const dx = e.x - p.x
    const dy = e.y - (p.y - 12)
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue

    for (let n = p.orbs.length - 1; n >= 0; n--) {
      const ang = p.orbs[n] + p.orbSpin
      const ox = p.x + Math.cos(ang) * O.radius
      const oy = p.y - 12 + Math.sin(ang) * O.radius
      const hit = e.radius + O.size
      if ((e.x - ox) ** 2 + (e.y - oy) ** 2 > hit * hit) continue

      // Spent. One hit, and it is gone.
      p.orbs.splice(n, 1)
      const kd = Math.hypot(dx, dy) || 1
      g.damageEnemy(i, damage, (dx / kd) * 240, (dy / kd) * 240)
      /*
       * AND IT TAKES THE NEIGHBOURS WITH IT.
       *
       * A part flying off a machine at speed does not politely strike one
       * thing. A third of the damage in a small radius is what stops the ring
       * being strictly single-target in a game where nothing arrives alone —
       * without it the whole card was worth one body per forge.
       */
      g.detonate(ox, oy, damage * 0.34, O.splash)
      g.audio.play('boom', { volume: 0.42, throttle: 0.05, maxVoices: 3 })
      break
    }
  }
}

/** The angle in the middle of the largest empty arc of the ring. */
function widestGap(orbs: readonly number[]): number {
  if (orbs.length === 0) return 0
  const sorted = [...orbs].sort((a, b) => a - b)
  let best = sorted[0] + Math.PI
  let bestArc = -1
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    const b = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + Math.PI * 2
    const arc = b - a
    if (arc > bestArc) { bestArc = arc; best = a + arc / 2 }
  }
  return best % (Math.PI * 2)
}

/**
 * Throws fish at the nearest bodies. Each one picks a different target so a
 * volley of three does not all land in the same enemy.
 */
function throwFish(g: Game, count: number, damage: number) {
  const T = ABILITIES.tambaqui
  const p = g.player
  const items = g.enemies.items

  // Cheap partial sort: collect the closest few rather than sorting the horde.
  const picks: number[] = []
  const dists: number[] = []
  for (let i = 0; i < items.length; i++) {
    const d = (items[i].x - p.x) ** 2 + (items[i].y - p.y) ** 2
    if (d > T.range * T.range) continue
    let slot = picks.length
    while (slot > 0 && dists[slot - 1] > d) slot--
    if (slot >= count) continue
    picks.splice(slot, 0, i)
    dists.splice(slot, 0, d)
    if (picks.length > count) { picks.pop(); dists.pop() }
  }

  for (let n = 0; n < count; n++) {
    let ang: number
    if (n < picks.length) {
      const e = items[picks[n]]
      ang = Math.atan2(e.y - 8 - (p.y - 14), e.x - p.x)
    } else {
      // Nothing in range: throw them out along the aim, not into the ground.
      ang = Math.atan2(p.aimY, p.aimX) + (n - count / 2) * 0.4
    }
    g.spawnBullet(
      p.x, p.y - 14,
      Math.cos(ang) * T.speed, Math.sin(ang) * T.speed,
      damage, T.pierce, T.radius, 40, true, 'tambaqui', T.range,
    )
  }
}

/**
 * TELEPORTE INDÍGENA. Jumps toward the cursor, stopping at the barrier and at
 * the back edge of the corridor — a blink that could skip the church wall or
 * rewind the journey would be a hole, not an ability.
 */
function blink(g: Game, p: Player, distance: number, dir?: { x: number; y: number }) {
  const from = { x: p.x, y: p.y, t: 0.22 }
  // `escapeDir` when a player asked for it; the aim vector for anything the
  // game blinks on its own behalf.
  const d = dir ?? { x: p.aimX, y: p.aimY }
  const len = Math.hypot(d.x, d.y) || 1
  p.x += (d.x / len) * distance
  p.y += (d.y / len) * distance

  const a = g.activeArena
  if (a) {
    p.x = Math.max(a.centerX - a.halfW + 16, Math.min(a.centerX + a.halfW - 16, p.x))
    p.y = Math.max(a.centerY - a.halfH + 16, Math.min(a.centerY + a.halfH - 16, p.y))
  }
  p.x = Math.max(p.reach - 620, p.x)
  p.reach = Math.max(p.reach, p.x)

  p.blinkFrom = from
  g.camera.addShake(0.14)
}

/**
 * Ticks Balas Venenosas on everything carrying stacks.
 *
 * Iterates backwards because a tick can be the killing blow, and killing an
 * enemy swap-removes it from the array underneath the loop.
 */
/**
 * QUEIMA ROSCA @ he burns, and so does everything standing next to him.
 *
 * HELD. The right mouse button while it is down, or a toggle from the key and
 * the touch button, because a hold is the right verb for a mouse and the wrong
 * one for a thumb already holding a stick.
 *
 * IT CANNOT KILL HIM. The self-damage stops at one point of health rather than
 * finishing the job: a run ending because a button was still down is a run
 * ended by an input, not by the game, and there is no version of that anybody
 * enjoys. What it can do is leave him at one point of health with four hundred
 * things on the field, which is punishment enough.
 *
 * The ring damages per SECOND rather than on ticks, so walking through a crowd
 * for a third of a second is worth a third of the damage @ there is no cadence
 * to stand outside of and no reward for tapping it.
 */
/**
 * HOW WIDE THE RING IS RIGHT NOW.
 *
 * Exported because the renderer needs exactly this number and nothing else:
 * the rim it draws IS the damage boundary, and a second copy of the lerp in
 * render.ts would be a boundary that drifts from the one that actually hurts
 * the moment either is retuned.
 */
export function queimaRadius(p: Player): number {
  const stacks = p.abilities.queima.stacks
  if (stacks <= 0) return 0
  const Q = ABILITIES.queima
  return at(Q.radius, stacks) * (Q.coldRadius + (Q.hotRadius - Q.coldRadius) * p.burnHeat)
}

function updateQueima(g: Game, dt: number) {
  const p = g.player
  const stacks = p.abilities.queima.stacks
  if (stacks <= 0) {
    p.burning = false
    p.burnToggle = false
    p.burnHeat = 0
    p.burnLock = 0
    return
  }

  const Q = ABILITIES.queima

  // The key still toggles, and it is read even while locked out — a press
  // that vanishes because the ability happened to be cooling is a press the
  // player will swear they made.
  if (g.input.consumePressed('c')) p.burnToggle = !p.burnToggle

  /*
   * LOCKED OUT, after a vent.
   *
   * Nothing burns and nothing costs anything; the meter runs backwards from
   * full so the renderer has something to draw the cooldown with. The toggle
   * is CLEARED rather than remembered, so it does not silently re-ignite the
   * moment the lock expires — coming back on by itself, three seconds after
   * the player let go, is the kind of thing that gets read as a bug.
   */
  if (p.burnLock > 0) {
    p.burnLock = Math.max(0, p.burnLock - dt)
    p.burning = false
    p.burnToggle = false
    p.burnHeat = p.burnLock / Q.lock
    return
  }

  p.burning = g.input.firing2 || p.burnToggle

  /*
   * THE METER. Up while held, down while not, and it is the whole ability.
   *
   * Cooling is faster than heating, so letting go for a moment is cheap and
   * riding it near the top is a real thing to be good at rather than a
   * knife-edge.
   */
  if (p.burning) p.burnHeat = Math.min(1, p.burnHeat + Q.heatUp * dt)
  else p.burnHeat = Math.max(0, p.burnHeat - Q.heatDown * dt)

  if (!p.burning) return

  // 0 cold, 1 the instant before it vents.
  const heat = p.burnHeat
  const power = Q.coldMul + (Q.hotMul - Q.coldMul) * heat
  const radius = queimaRadius(p)
  const dps = at(Q.dps, stacks) * power * p.mods.damage * p.mods.ability
  const burnDps = at(Q.burnDps, stacks) * power * p.mods.damage * p.mods.ability

  const r2 = radius * radius
  const items = g.enemies.items
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i]
    if (e.allyT > 0) continue
    const dx = e.x - p.x
    const dy = e.y - (p.y - 8)
    if (dx * dx + dy * dy > r2) continue
    /*
     * LIT BEFORE IT IS HURT, and the order is not cosmetic.
     *
     * `damageEnemy` can kill, and a kill is a swap-remove: the object at `i`
     * is handed straight back to the pool and the LAST enemy is moved into its
     * slot. Setting the burn afterwards writes it onto a corpse that the next
     * spawn will hand out — the bug that made three destroyed pillars report
     * as standing, in a new place.
     *
     * It stays lit once it leaves the ring, which is what stops this being a
     * melee aura you have to stand still inside.
     */
    e.burnT = Q.burn
    e.burnDps = Math.max(e.burnDps, burnDps)
    g.damageEnemy(i, dps * dt, 0, 0, true)
  }

  /*
   * THE PRICE. Straight at the health, no i-frames, no armour — armour is
   * protection from THEM, and this is self-inflicted. It rides the meter with
   * everything else, so the cheap end of the ability is also the weak end.
   *
   * IT STILL CANNOT KILL HIM. A held button that ends a run is a trap, and the
   * limit on this ability is the vent, not the floor.
   */
  const cost = at(Q.selfDps, stacks) * (Q.coldCost + (Q.hotCost - Q.coldCost) * heat) * dt
  p.hp = Math.max(1, p.hp - cost)
  p.sinceHit = 0
  g.audio.play('rain', {
    volume: 0.18 + heat * 0.16, rate: 0.62 + heat * 0.3, throttle: 0.4, maxVoices: 1,
  })

  if (p.burnHeat >= 1) ventQueima(g, stacks, radius, power)
}

/**
 * IT LETS GO OF ITSELF.
 *
 * The one thing that happens on the meter reaching the top, and it has to be
 * worth having happened: four seconds of the ring in a single hit, out to half
 * again the radius, everything it touches lit and thrown. Then the ability is
 * dead for two and a half seconds.
 *
 * THE BURN IS SET BEFORE THE DAMAGE, and that ordering is not cosmetic. A kill
 * is a swap-remove — the object is handed back to the pool and the last enemy
 * takes its slot — so writing `burnT` afterwards puts fire on a corpse that
 * the next spawn hands out. Same bug as the three standing pillars.
 */
function ventQueima(g: Game, stacks: number, radius: number, power: number) {
  const p = g.player
  const Q = ABILITIES.queima
  const reach = radius * Q.ventRadius
  const damage = at(Q.dps, stacks) * Q.ventMul * power * p.mods.damage * p.mods.ability
  const burnDps = at(Q.burnDps, stacks) * power * p.mods.damage * p.mods.ability
  const r2 = reach * reach

  const items = g.enemies.items
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i]
    if (e.allyT > 0) continue
    const dx = e.x - p.x
    const dy = e.y - (p.y - 8)
    const d2 = dx * dx + dy * dy
    if (d2 > r2) continue
    const d = Math.sqrt(d2) || 1
    e.burnT = Q.burn * 1.6
    e.burnDps = Math.max(e.burnDps, burnDps)
    g.damageEnemy(i, damage, (dx / d) * 320, (dy / d) * 320)
  }

  g.spawnBlast(p.x, p.y - 6, reach)
  g.camera.addShake(0.55)
  g.audio.play('boom', { volume: 0.75, rate: 1.15 })
  g.audio.play('shield', { volume: 0.4, rate: 0.7 })
  g.say('QUEIMOU DEMAIS!')

  p.burnHeat = 1
  p.burnLock = Q.lock
  p.burning = false
  p.burnToggle = false
}

/**
 * A GARRA @ a radius that costs a body a slice for standing in it.
 *
 * No cooldown of its own and no button: the only clock is per-body, so a
 * crowd is opened up one at a time as it presses in rather than all at once
 * on a shared timer. That is what makes it feel like a thing on him rather
 * than a thing he does.
 */
function updateGarra(g: Game, dt: number) {
  const p = g.player
  const C = ABILITIES.garra
  const stacks = p.abilities.garra.stacks
  const radius = at(C.radius, stacks)
  const damage = at(C.damage, stacks) * p.mods.damage * p.mods.ability
  const r2 = radius * radius

  const items = g.enemies.items
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i]
    if (e.clawCd > 0) { e.clawCd -= dt; continue }
    if (e.allyT > 0) continue
    const dx = e.x - p.x
    const dy = e.y - (p.y - 8)
    if (dx * dx + dy * dy > r2) continue
    e.clawCd = C.hitCd
    const d = Math.hypot(dx, dy) || 1
    // Where it was struck, remembered before the blow: a lethal one hands this
    // object back to the pool and `e.x` stops being about this body.
    const hx = e.x
    const hy = e.y
    g.damageEnemy(i, damage, (dx / d) * 150, (dy / d) * 150)
    /*
     * POINTED THE WAY THE SWIPE WENT. The crescent bulges toward +x on disk,
     * so the angle from him to the body is the rotation with no offset: the
     * thick edge of the claw lands on the far side of what it hit.
     *
     * Scaled off the radius rather than fixed, so the four stacks look like
     * four different sizes of the same thing instead of the same slash on a
     * bigger circle.
     */
    g.spawnFx('claw', hx, hy - 10, 0.44 + radius * 0.022, Math.atan2(dy, dx))
    g.audio.play('punch', { volume: 0.3, rate: 1.4, throttle: 0.07, maxVoices: 3 })
  }
}

/**
 * EXECUTAR @ finding the one that is nearly gone, and taking it.
 *
 * Runs every frame whether or not it is owned, because it also has to CLEAR
 * the marker: a target that stops qualifying must stop being pointed at on the
 * same frame, and the cheapest place to guarantee that is the one function
 * that decides it.
 *
 * NOTHING IS STORED ACROSS FRAMES. The candidate is recomputed from scratch
 * and published as three plain numbers for the renderer, never as a reference:
 * the enemy pool is dense with swap-remove, and a held reference into it is
 * handed to whatever spawns next the moment its owner dies. That mistake has
 * been made in this file before.
 */
function updateExecutar(g: Game, dt: number) {
  const p = g.player
  const stacks = p.abilities.executar.stacks
  if (stacks <= 0) { clearMark(g); return }

  const X = ABILITIES.executar
  const st = p.abilities.executar
  if (st.cd > 0) st.cd -= dt

  if (p.hp > p.maxHp * X.selfBelow || st.cd > 0) { clearMark(g); return }

  const threshold = at(X.threshold, stacks)
  const range = at(X.range, stacks)
  const r2 = range * range
  const items = g.enemies.items

  /*
   * THE MARK STAYS ON THE BODY IT PICKED.
   *
   * It used to be recomputed from nothing every frame, which meant it hopped
   * between targets as a crowd shuffled and disappeared the instant the
   * revolver finished the one it was sitting on. That is why there was no
   * "time to press X" to see: there was no window, only whatever happened to
   * qualify this frame.
   *
   * The held body is found by `uid` — never by a stored reference, which the
   * pool would hand to something else the moment the marked alien died. See
   * `Enemy.uid`.
   */
  let idx = -1
  if (g.execUid !== 0) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].uid !== g.execUid) continue
      const e = items[i]
      const dx = e.x - p.x
      const dy = e.y - p.y
      // It keeps the mark while it is still worth taking and still reachable.
      const ok = e.allyT <= 0 && e.invulnT <= 0 && !e.shielded
        && e.hp <= e.maxHp * threshold && dx * dx + dy * dy <= r2
      if (ok) idx = i
      break
    }
    g.execT -= dt
    if (g.execT <= 0) idx = -1
  }

  /*
   * NOTHING HELD: PICK ONE, NEAREST TO THE CURSOR RATHER THAN TO HIM.
   *
   * He is choosing which one to jump on, and the thing that expresses a choice
   * is where he is already pointing. Distance only breaks the tie.
   */
  if (idx < 0) {
    let bestScore = -Infinity
    for (let i = items.length - 1; i >= 0; i--) {
      const e = items[i]
      if (e.allyT > 0 || e.def.behavior === 'boss' || e.invulnT > 0 || e.shielded) continue
      if (e.hp > e.maxHp * threshold) continue
      const dx = e.x - p.x
      const dy = e.y - p.y
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const d = Math.sqrt(d2) || 1
      const score = (dx / d) * p.aimX + (dy / d) * p.aimY - d / range
      if (score > bestScore) { bestScore = score; idx = i }
    }
    if (idx < 0) { clearMark(g); return }
    g.execUid = items[idx].uid
    g.execT = X.window
    g.audio.play('block', { volume: 0.3, rate: 1.7, throttle: 0.4, maxVoices: 1 })
  }

  const target = items[idx]
  g.execOn = true
  g.execX = target.x
  g.execY = target.y

  /*
   * AND IT TICKS WHEN IT IS ABOUT TO GO.
   *
   * The player is looking at the crowd, not at the ring. A sound in the last
   * second is the only cue that reaches someone whose eyes are somewhere else,
   * and it is the difference between a window that expired and a window that
   * was missed.
   */
  if (g.execT < 1.1) {
    g.audio.play('block', {
      volume: 0.3, rate: 2.2, throttle: 0.22, maxVoices: 1,
    })
  }

  if (!g.input.consumePressed('x')) return

  /*
   * THE LEAP. He arrives on top of it and it is simply gone.
   *
   * `executeEnemy` rather than damage, so nothing about the kill reads as a
   * hit: no number, no falloff, no damage card improving it. The XP and the
   * corn drop exactly as they would have.
   *
   * EVERYTHING AROUND IT IS DAMAGE, and that is the fix for the thing that
   * made this card dangerous to own. A body at a third of its health is a body
   * in the middle of a crowd, and the leap used to drop him alone into that
   * crowd with half a second of invulnerability and no answer to it: the
   * reward regularly killed the player who took it. The blast is what buys the
   * space he lands in.
   *
   * READ BEFORE THE KILL. `executeEnemy` is a swap-remove and `target` stops
   * being about this body the moment it returns.
   */
  const hx = target.x
  const hy = target.y
  const bite = target.dmg * X.heal

  p.blinkFrom = { x: p.x, y: p.y, t: 0 }
  p.x = hx
  p.y = hy
  p.invuln = Math.max(p.invuln, 0.8)
  st.cd = at(X.cooldown, stacks)
  st.fired = CAST_FLASH
  clearMark(g)

  g.executeEnemy(idx)

  /*
   * THE LANDING STILL CLEARS THE GROUND, IT JUST DOES NOT DETONATE.
   *
   * The damage stays: a body at a third of its health is a body in the middle
   * of a crowd, and without it the leap drops him alone into that crowd and
   * the ability's own reward kills the player who used it.
   *
   * What went is the LOOK. A fireball on a man landing on somebody with his
   * boots is the wrong register entirely — it read as a grenade going off
   * where a stamp should be. The same radius now spends itself on blood: one
   * heavy spray where he lands, one on every body it reaches, and a ring of
   * them thrown outward. Same information, told in the right language.
   */
  const radius = at(X.blastRadius, stacks)
  const damage = at(X.blast, stacks) * p.mods.damage * p.mods.ability
  const r2b = radius * radius
  for (let j = items.length - 1; j >= 0; j--) {
    const e = items[j]
    if (e.allyT > 0) continue
    const dx = e.x - hx
    const dy = e.y - hy
    const d2 = dx * dx + dy * dy
    if (d2 > r2b) continue
    const d = Math.sqrt(d2) || 1
    // Read before the damage: a lethal hit swap-removes this object and `e.x`
    // stops being about this body.
    const bx = e.x
    const by = e.y
    // Hardest underfoot and survivable at the rim, like every other blast.
    const falloff = 0.45 + 0.55 * (1 - d / radius)
    g.damageEnemy(j, damage * falloff, (dx / d) * 260, (dy / d) * 260)
    g.spawnBlood(bx, by - 6, 0.7 + falloff * 0.6)
  }

  /*
   * AND THE MESS HE LANDED IN.
   *
   * Eleven sprays rather than one: a single blot at the landing point is a
   * decal, and what this wants to read as is something coming apart under a
   * boot. They are thrown out to the blast's own radius so the stain says how
   * far the landing reached — the one thing the explosion ring was actually
   * good for.
   */
  g.spawnBlood(hx, hy - 4, 2.2)
  g.spawnBlood(hx, hy - 10, 1.7)
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + Math.random() * 0.6
    const rr = radius * (0.3 + Math.random() * 0.62)
    g.spawnBlood(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.62, 0.6 + Math.random() * 0.7)
  }

  g.camera.addShake(0.6)
  g.audio.play('punch', { volume: 0.9, rate: 0.7 })
  g.audio.play('punch', { volume: 0.6, rate: 0.5, throttle: 0 })
  g.audio.play('death1', { volume: 0.8, rate: 0.8 })

  // A share of his own maximum, plus a bite of what the body hit for.
  g.heal(p.maxHp * at(X.healPct, stacks) + bite)
  g.spawnFloater(p.x, p.y - 46, 'EXECUTOU', '#ff9b9b')
  g.say('Tava sofrendo. Fiz um favor.')
}

/** Nothing is marked. Cheap, and called from four places. */
function clearMark(g: Game) {
  g.execOn = false
  g.execUid = 0
  g.execT = 0
}

/**
 * AMANTES @ one of them changes sides.
 *
 * Picks a body near him, buffs it, and sets `allyT`. Everything downstream
 * reads that one number: the AI sends it after its own kind, the contact pass
 * stops it hurting him and lets the horde hurt it, and this function kills it
 * when the timer runs out.
 *
 * NEVER A BOSS, never something already turned, and never something that is
 * mid-transformation. A boss with a health bar and a name changing sides is a
 * different game.
 */
function updateAmantes(g: Game, dt: number) {
  const p = g.player
  const M = ABILITIES.amantes
  const st = p.abilities.amantes
  const stacks = st.stacks

  // Everything currently turned burns down its own clock, and dies on zero.
  const items = g.enemies.items
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i]
    if (e.allyT <= 0) continue
    e.allyT -= dt
    if (e.allyT <= 0) {
      e.allyT = 0
      g.spawnFx('smitten', e.x, e.y - 10, 0.7)
      g.executeEnemy(i)
    }
  }

  st.cd -= dt
  if (st.cd > 0) return

  /*
   * ONE OF THE ORDINARY ONES, CLOSEST FIRST.
   *
   * Nearest rather than random: a lover that appears across the field is a
   * thing the player never sees happen, and the whole value of this card is
   * watching one of them turn round.
   */
  let best = -1
  let bestD = 340 * 340
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i]
    if (e.allyT > 0 || e.def.behavior === 'boss' || e.def.elite || e.invulnT > 0) continue
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  if (best < 0) return

  const e = items[best]
  st.cd = at(M.cooldown, stacks)
  st.fired = CAST_FLASH
  e.allyT = at(M.duration, stacks)
  e.maxHp = Math.round(e.maxHp * M.hp)
  e.hp = e.maxHp
  e.dmg *= M.damage
  e.attackCd = 0
  g.spawnFx('smitten', e.x, e.y - 12, 1)
  g.audio.play('heal', { volume: 0.7, rate: 1.2 })
  g.say('Esse aí virou gente boa.')
}

export function updatePoison(g: Game, dt: number) {
  const items = g.enemies.items
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i]
    /*
     * AND WHATEVER IS ALIGHT, in the same walk over the list.
     *
     * `burnDps` is already scaled by the build when it is lit @ Queima Rosca
     * multiplies it in @ so it is applied raw here. Poison is not: it is
     * scaled at the tick, and the two are left as they were written rather
     * than being made to agree, because changing when poison scales would
     * quietly move every Balas Venenosas number in the game.
     */
    if (e.burnT > 0) {
      e.burnT -= dt
      if (e.burnT <= 0) { e.burnT = 0; e.burnDps = 0 }
      else g.damageEnemy(i, e.burnDps * dt, 0, 0, true)
    }

    if (e.poisonStacks <= 0) continue
    e.poison -= dt
    if (e.poison <= 0) { e.poisonStacks = 0; e.poison = 0; continue }
    g.damageEnemy(i, e.poisonStacks * e.poisonDps * g.player.mods.damage * dt, 0, 0, true)
  }
}

// ------------------------------------------------------------------ BOMBS --

export function updateBombs(g: Game, dt: number) {
  const items = g.bombs.items
  for (let i = items.length - 1; i >= 0; i--) {
    const b = items[i]

    /*
     * Detonated: the sheet is drawing it now, so the entity is only still here
     * to be swept — UNLESS it is an anvil, which is still lying there.
     */
    if (b.exploded) {
      if (b.rest > 0) {
        b.rest -= dt
        if (b.rest > 0) continue
      }
      g.bombs.removeAt(i)
      continue
    }

    b.t += dt
    if (b.t < b.flight) {
      const k = b.t / b.flight
      /*
       * AN ANVIL FALLS LIKE AN ANVIL: k squared, so it drifts down out of
       * nothing and then arrives. At a constant rate it covered the last
       * hundred units at the same speed as the first, which is why the landing
       * had no weight in it — nothing was ever going fast.
       */
      const f = b.anvil ? k * k : k
      b.x = b.sx + (b.tx - b.sx) * f
      b.y = b.sy + (b.ty - b.sy) * f
      continue
    }

    b.x = b.tx
    b.y = b.ty
    b.fuse -= dt
    if (b.fuse > 0) continue

    // Detonate. Damage falls off toward the edge so standing at the rim is
    // survivable and standing on it is not.
    b.exploded = true
    b.blast = 0

    /*
     * AN ANVIL ARRIVES. It does not go off.
     *
     * Flat damage to everything standing in its footprint, and flat damage to
     * the player if he is one of them — no falloff on either, because either
     * you were under it or you were not. A graze worth a quarter of the damage
     * would make the shadow something to ignore rather than something to move
     * for, and moving for it is the entire card.
     */
    if (b.anvil) {
      /*
       * IT ARRIVES, and everything about that is on the ground rather than in
       * the air: a clang on the iron, a ring of dust thrown out along the
       * floor, and three puffs kicked off the rim. No fireball — this is a
       * heavy object hitting dirt, and the second it looks like an explosion
       * the card stops being about the shadow you had to walk out of.
       */
      g.spawnFx('clang', b.x, b.y - 6, (b.radius * 2) / 84)
      g.spawnFx('ring', b.x, b.y, (b.radius * 2) / 44)
      for (let d = 0; d < 3; d++) {
        const a = Math.random() * Math.PI * 2
        g.spawnFx('splash_pale',
          b.x + Math.cos(a) * b.radius * 0.8,
          b.y + Math.sin(a) * b.radius * 0.4,
          0.5 + Math.random() * 0.3)
      }
      b.rest = ABILITIES.bigorna.rest
      g.camera.addShake(0.75)
      // Iron hitting dirt, not ordnance going off.
      g.audio.play('punch', { volume: 0.75, rate: 0.7, throttle: 0.05, maxVoices: 3 })
      g.audio.play('drop', { volume: 0.5, rate: 0.75, throttle: 0.05, maxVoices: 2 })
      const r2 = b.radius * b.radius
      for (let j = g.enemies.items.length - 1; j >= 0; j--) {
        const e = g.enemies.items[j]
        const dx = e.x - b.x
        const dy = e.y - b.y
        if (dx * dx + dy * dy > r2) continue
        // Straight down, so it drives things into the ground rather than out.
        g.damageEnemy(j, b.damage, dx * 0.6, dy * 0.6)
      }
      const pd = Math.hypot(g.player.x - b.x, g.player.y - 12 - b.y)
      if (pd < b.radius) g.damagePlayer(b.selfDamage)
      continue
    }

    g.camera.addShake(0.45)
    /*
     * A BURST THAT RISES OFF THE GROUND, rather than a circle expanding on it.
     * Different sheet from `spawnBlast` on purpose: this thing LANDED, and an
     * airburst at the same radius reads as something that went off overhead.
     */
    g.spawnFx('groundboom', b.x, b.y, (b.radius * 2) / 120)

    /*
     * ORDNANCE FROM THE OTHER SIDE.
     *
     * Same flight, same fuse, same drawn landing ring — the whole value of a
     * bomb is that you can see where it is going to land, and that has to be
     * true of theirs as well or it is not a bomb, it is a random loss of
     * health. All that changes is who it hurts.
     */
    if (b.hostile) {
      const pd = Math.hypot(g.player.x - b.x, g.player.y - 12 - b.y)
      if (pd < b.radius) {
        g.damagePlayer(b.damage * (0.5 + 0.5 * (1 - pd / b.radius)))
      }
      continue
    }


    // Damage only — this entity draws its own ring, so no second visual.
    const r2 = b.radius * b.radius
    for (let j = g.enemies.items.length - 1; j >= 0; j--) {
      const e = g.enemies.items[j]
      const dx = e.x - b.x
      const dy = e.y - b.y
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const d = Math.sqrt(d2) || 1
      const falloff = 0.45 + 0.55 * (1 - d / b.radius)
      g.damageEnemy(j, b.damage * falloff, (dx / d) * 220, (dy / d) * 220)
    }
  }
}
