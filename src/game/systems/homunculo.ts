import type { Game } from '../Game'
import type { Enemy } from '../types'
import { ABILITIES, at } from '../data/abilities'

/**
 * O HOMÚNCULO.
 *
 * A familiar that walks with you and exists to be hit. Two things make it
 * worth a card:
 *
 * It DRAWS AGGRO — anything within `aggroRadius` of one goes for it instead of
 * the player, which is handled in `ai.ts` by swapping the target. A homúnculo
 * standing between you and the crowd genuinely takes the crowd.
 *
 * It BITES BACK — every hit it takes costs the attacker `thorns`. It is made
 * of nothing and will die, but it dies expensively, so losing one in a press
 * is a trade rather than a loss. A replacement is summoned a few seconds later.
 *
 * They hold station IN FRONT, between the player and whatever is closest, and
 * fan out when there are several. Trailing behind looked like an escort and
 * did nothing — the crowd simply walked past them.
 */

export function updateHelpers(g: Game, dt: number) {
  const p = g.player
  const stacks = p.abilities.homunculo.stacks
  const H = ABILITIES.homunculo

  // Summon whatever is missing, on a delay.
  if (stacks > 0) {
    const want = at(H.count, stacks)
    if (g.helpers.count < want) {
      p.abilities.homunculo.cd -= dt
      if (p.abilities.homunculo.cd <= 0) {
        g.summonHelper()
        p.abilities.homunculo.cd = H.summonDelay
      }
    } else {
      p.abilities.homunculo.cd = H.summonDelay
    }
  }

  const items = g.helpers.items
  for (let i = items.length - 1; i >= 0; i--) {
    const h = items[i]
    h.age += dt
    if (h.hitCd > 0) h.hitCd -= dt
    if (h.flash > 0) h.flash -= dt
    if (h.swing > 0) h.swing -= dt

    /*
     * IT SWINGS AT WHATEVER IS STANDING NEXT TO IT.
     *
     * Until now a homúnculo could only hurt something that chose to attack it
     * — standing shoulder to shoulder with a cow did nothing at all, and a
     * squad of six was six speed bumps that occasionally bit. That is not what
     * the card looks like it is buying.
     *
     * Nearest thing in reach, on its own clock, so six of them are six
     * attackers rather than one big one. `mods.ability` is baked into `hit`
     * when it is summoned, which is why Poder de Tupã lifts them too — the
     * thorns never scaled with anything and that was half the problem.
     */
    if (h.swingCd > 0) h.swingCd -= dt
    else {
      const items2 = g.enemies.items
      for (let j = items2.length - 1; j >= 0; j--) {
        const e = items2[j]
        const reach = e.radius + H.attackRange
        const dx = e.x - h.x
        const dy = e.y - h.y
        if (dx * dx + dy * dy > reach * reach) continue
        const d = Math.hypot(dx, dy) || 1
        g.damageEnemy(j, h.hit, (dx / d) * 130, (dy / d) * 130)
        h.swingCd = H.attackCd
        h.swing = 0.18
        h.flip = dx < 0
        g.audio.play('punch', { volume: 0.3, rate: 1.3, throttle: 0.1, maxVoices: 3 })
        break
      }
    }

    /*
     * They INTERPOSE. This is the difference between a pet and a bodyguard.
     *
     * Trailing behind the player looked like an escort and did nothing: the
     * crowd walked past them to get to him. Standing between him and whatever
     * is closest puts their aggro radius over the things that are actually
     * coming, so the pull happens where it matters and their bodies are in the
     * way. With nothing around they hold station on his aim, which is the
     * direction he is about to walk into.
     */
    const threat = nearestThreat(g, p.x, p.y, H.guardScan)
    const facing = threat
      ? Math.atan2(threat.y - p.y, threat.x - p.x)
      : Math.atan2(p.aimY, p.aimX)
    const fan = (h.slot - (items.length - 1) / 2) * 0.62
    const goalX = p.x + Math.cos(facing + fan) * H.guardDist
    const goalY = p.y + Math.sin(facing + fan) * H.guardDist * 0.7
    const dx = goalX - h.x
    const dy = goalY - h.y
    const d = Math.hypot(dx, dy)

    if (d > 4) {
      // Runs faster the further behind it is, so it never gets left in Act I.
      const speed = Math.min(H.speed * (1 + d / 160), H.speed * 2.4)
      h.vx = (dx / d) * speed
      h.vy = (dy / d) * speed
    } else {
      h.vx *= 0.8
      h.vy *= 0.8
    }
    h.x += h.vx * dt
    h.y += h.vy * dt
    if (Math.abs(h.vx) > 4) h.flip = h.vx < 0
    h.anim += dt

    if (h.hp <= 0) {
      g.spawnFloater(h.x, h.y - 22, 'ai…', '#ffd479')
      g.react('helperDown')
      g.audio.play('powerDown', { volume: 0.7 })
      g.helpers.removeAt(i)
    }
  }
}

/**
 * An enemy hits a homúnculo. Returns true if the hit was taken, so the caller
 * knows the enemy's attack was spent here rather than on the player.
 */
export function hitHelper(g: Game, enemyIndex: number, e: Enemy): boolean {
  const items = g.helpers.items
  for (let i = 0; i < items.length; i++) {
    const h = items[i]
    if (h.hitCd > 0) continue
    if (Math.hypot(h.x - e.x, h.y - e.y) > e.radius + ABILITIES.homunculo.radius) continue

    h.hp -= e.dmg
    h.flash = 0.14
    h.hitCd = 0.12
    // It bites back. This is the whole point of the thing.
    // Thorns take `ability` as well now. Every other source of damage in the
    // build scales with Poder de Tupã; this one silently did not.
    g.damageEnemy(enemyIndex, h.thorns * g.player.mods.damage * g.player.mods.ability, 0, 0)
    return true
  }
  return false
}

/** Nearest enemy to a point, for deciding which way to guard. */
function nearestThreat(g: Game, x: number, y: number, range: number) {
  const items = g.enemies.items
  let best = null
  let bestD = range * range
  for (let i = 0; i < items.length; i++) {
    const e = items[i]
    const d = (e.x - x) ** 2 + (e.y - y) ** 2
    if (d < bestD) { bestD = d; best = e }
  }
  return best
}

/** Nearest homúnculo to a point, for the AI's aggro check. */
export function nearestHelper(g: Game, x: number, y: number, range: number) {
  const items = g.helpers.items
  let best = null
  let bestD = range * range
  for (let i = 0; i < items.length; i++) {
    const h = items[i]
    const d = (h.x - x) ** 2 + (h.y - y) ** 2
    if (d < bestD) { bestD = d; best = h }
  }
  return best
}
