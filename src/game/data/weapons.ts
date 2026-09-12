import { ICONS } from './sprites'
import { ABILITIES, type AbilityId } from './abilities'
import { AMMO, type AmmoId } from './bullets'
import type { Player, PlayerMods, UpgradeOffer, WeaponStats } from '../types'

/**
 * HOW BIG A BUILD CAN GET.
 *
 * Before this a run simply accumulated: by level fifteen the player had most
 * of the deck, every choice was "yes", and the only question a level-up asked
 * was which thing you wanted FIRST rather than what you wanted at all.
 *
 * Capping the slots is what turns the level-up screen back into a decision.
 *
 * A FULL POWER BAR IS NOT A CLOSED DOOR. New powers keep being offered once
 * the six are spent, and taking one asks what it replaces — so a build can be
 * changed its mind about, and finding a legendary at level twenty is still a
 * moment rather than a card you are not allowed to pick.
 *
 * Stats stay hard-capped. They are small numeric bumps, and a swap prompt for
 * +7% speed is friction with no decision in it.
 *
 * Cards you ALREADY own keep appearing regardless, so a capped build still
 * deepens.
 */
export const POWER_SLOTS = 6
export const STAT_SLOTS = 8

/**
 * HOW MANY HANDS A RUN MAY REFUSE.
 *
 * Three, for the whole run — see `Game.rerolls` for why it is not per level.
 * It lives here next to the slot caps because it is the same kind of number:
 * a limit on the shape of a build rather than a tuning knob on a power.
 */
export const REROLLS = 3

/**
 * ...UNLESS HE MAKES ROOM.
 *
 * `MAIS UM LUGAR` is the only card in the deck that buys nothing except the
 * ability to hold another card, and it is the one thing a hard cap needs: a
 * cap with no way round it stops being a decision the moment it is reached
 * and starts being a wall. Two of them, at most, so a run tops out at eight
 * powers — enough that finding one late is a real change of plan, few enough
 * that the six-slot build is still the shape of the game.
 *
 * The card itself costs no slot. A slot card that spends a slot is a joke
 * with no punchline.
 */
export const EXTRA_SLOT_MAX = 2

/** How many powers this run may hold, given the slot cards taken so far. */
export function powerCap(taken: Record<string, number>): number {
  return POWER_SLOTS + Math.min(EXTRA_SLOT_MAX, taken.mais_slot ?? 0)
}


/**
 * DIMINISHING RETURNS ON A REPEATED CARD.
 *
 * Every multiplicative stat used to stack flat, so six copies of Melhorar a
 * Arma was 1.12^6 = x1.97, six of Fúria Tapajó was x1.77, and together with a
 * second barrel the revolver alone came out about six times its base — before
 * a single power card. That is what "they melt before they reach me" is: the
 * player compounds and nothing else in the game does.
 *
 * Each further copy is worth `FALLOFF` of the one before it. The first is
 * untouched, so a card never feels worse the day you take it; the sixth is
 * worth about a third of the first, so the sixth is a choice rather than the
 * obvious one.
 *
 *   arma  x1.15 flat -> 1.15 1.123 1.101 1.083 1.068 1.056  = x1.75  (was 2.31)
 *   furia x1.10 flat -> 1.10 1.082 1.067 1.055 1.045 1.037  = x1.48  (was 1.77)
 */
const FALLOFF = 0.82

/** The `n`-th copy of a `+pct` multiplier, worn down by `FALLOFF` each time. */
function dim(pct: number, n: number): number {
  return 1 + pct * Math.pow(FALLOFF, Math.max(0, n - 1))
}

/** The one weapon: O Indígena's revolver. Everything else is a modifier on it. */
export const REVOLVER: WeaponStats = {
  damage: 9,
  fireRate: 3.2,
  bulletSpeed: 430,
  range: 330,
  pierce: 0,
  spread: 0.045,
  projectiles: 1,
  knockback: 70,
  bulletRadius: 3,
}

export const BASE_MODS: PlayerMods = {
  damage: 1, hpMul: 1, ability: 1, abilityMul: 1, fireRate: 1, speed: 1, magnet: 1,
  pierce: 0, projectiles: 0, maxHp: 0, lifesteal: 0, revives: 0,
  luck: 0, armour: 0, notice: 1, range: 1,
  regen: 0, regenDelay: 5, levelHeal: 0,
}

/** Resolves the base weapon plus the player's accumulated level-up cards. */
export function resolveWeapon(mods: PlayerMods): WeaponStats {
  return {
    ...REVOLVER,
    damage: REVOLVER.damage * mods.damage,
    fireRate: REVOLVER.fireRate * mods.fireRate,
    pierce: REVOLVER.pierce + mods.pierce,
    projectiles: REVOLVER.projectiles + mods.projectiles,
    // More barrels means a wider cone, otherwise multishot is strictly better.
    spread: REVOLVER.spread + mods.projectiles * 0.055,
    range: REVOLVER.range * mods.range,
  }
}

/**
 * A card in the deck. `kind`, `rarity` and `owned` come from `UpgradeOffer`,
 * because the level-up screen needs all three to draw the card honestly.
 */
export interface Upgrade extends Omit<UpgradeOffer, 'owned'> {
  /** Cap on how many times this card can be taken. */
  max: number
  /**
   * `n` is WHICH COPY THIS IS, one-based.
   *
   * Everything multiplicative uses it through `dim` below. Flat bumps — twenty
   * more health, one more point of luck — ignore it: they are already linear
   * and already capped, and taking the fifth for less than the first would be
   * a rule nobody asked for.
   */
  apply: (m: PlayerMods, n: number) => void
  /** Extra effect that needs the player object (healing, etc). */
  onTake?: (heal: (amount: number) => void) => void
  weight: number
  /** Set for cards that grant a timed ability rather than a stat multiplier. */
  ability?: AbilityId
  /** Set for cards that grant an ammo type. Collected once, cycled with E. */
  ammo?: AmmoId
  /**
   * Extra condition on whether this card can be offered at all, beyond its
   * take limit. Reviva uses it to stay off the table while one is banked.
   */
  available?: (p: Player) => boolean
}

/**
 * THE LEVEL-UP CARDS.
 *
 * TWO NUMBERS DECIDE HOW OFTEN A CARD IS SEEN, and they do different jobs.
 * `rarity` picks the tier — the roll in `data/luck.ts` chooses a tier first,
 * and the player's SORTE is what bends that roll. `weight` then picks between
 * the cards inside that tier, and only ever competes with its own tier.
 *
 * That split replaced a single flat weight over the whole deck, which had a
 * standing problem: every card added diluted the two that carry raw scaling,
 * and their weights had been raised three times to compensate. Now Melhorar a
 * Arma competes with five other commons instead of with twenty-two cards, so
 * the deck can grow without the core of the build getting harder to find.
 *
 * `kind` is the other half of the design: `stat` and `power` each draw from a
 * pool of four slots, so the deck being deep no longer means the build is.
 *
 * SCALING IS DELIBERATELY FLATTER THAN IT WAS. Melhorar a Arma used to be +22%
 * eight times over — 4.9x damage from one card, which outran every enemy in
 * the game and made the second half of a run a formality. It is +12% now, and
 * six deep, which is 1.97x. The difference has gone into crits, which are
 * rolled rather than owned.
 *
 * `icon` points at a drawn 32x32 in `sprites.ts`. Cards are named in the
 * game's own vernacular rather than in stat language — "Alpercata Nova" over
 * "+9% movement speed" — with the number underneath.
 */
export const UPGRADES: Upgrade[] = [
  // ------------------------------------------------------------ COMUNS --
  // The spine of every build. Six cards share 62% of the rolls at luck zero,
  // so a run can always find damage — it just cannot find only damage.
  {
    id: 'arma', name: 'Melhorar a Arma', desc: '+15% de dano', icon: ICONS.up_arma, glyph: '✷',
    kind: 'stat', rarity: 'comum', max: 6, weight: 22, apply: (m, n) => { m.damage *= dim(0.15, n) },
  },
  {
    id: 'furia', name: 'Fúria Tapajó', desc: '+10% de cadência', icon: ICONS.up_furia, glyph: '⟫',
    kind: 'stat', rarity: 'comum', max: 6, weight: 22, apply: (m, n) => { m.fireRate *= dim(0.10, n) },
  },
  {
    id: 'alcance', name: 'Olho de Gavião', desc: '+18% de alcance do revólver',
    icon: ICONS.up_alcance, glyph: '⌖',
    kind: 'stat', rarity: 'comum', max: 4, weight: 12, apply: (m, n) => { m.range *= dim(0.18, n) },
  },
  {
    id: 'velocidade', name: 'Alpercata Nova', desc: '+7% de velocidade', icon: ICONS.up_velocidade, glyph: '➤',
    kind: 'stat', rarity: 'comum', max: 4, weight: 10, apply: (m, n) => { m.speed *= dim(0.07, n) },
  },
  {
    id: 'vida', name: 'Bônus de Vida', desc: '+20% de vida máxima', icon: ICONS.up_vida, glyph: '❤',
    kind: 'stat', rarity: 'comum', max: 5, weight: 12,
    /*
     * TWENTY PER CENT, AND IT USED TO BE TWENTY FLAT.
     *
     * `maxHp` is an ADDITIVE pool added to the base hundred, so `+= 20` was
     * twenty points however deep the run was — it happened to equal a fifth
     * at level two and meant nothing at all by the church, and it was worth a
     * different amount depending on which order it was taken in relative to
     * Trocar Vida. A card called a percentage has to behave like one.
     *
     * `hpMul` is where the proportional health lives, alongside Trocar Vida,
     * so the two now compose the honest way: three Trocar and five of these is
     * 0.7^3 x 1.2^5, not an argument about which ran first.
     *
     * NO `dim` FALLOFF on this one, deliberately, where every other
     * multiplicative stat has it. The complaint being fixed is that the card
     * does not give what it says; making the fifth copy quietly worth eleven
     * per cent would be the same complaint again in a smaller font. Five
     * copies is x2.49, against x2.0 for the old flat version.
     */
    apply: (m) => { m.hpMul *= 1.2 },
  },
  {
    id: 'milho', name: 'Faro de Milho', desc: '+30% de alcance de coleta', icon: ICONS.item_milho, glyph: '◎',
    kind: 'stat', rarity: 'comum', max: 3, weight: 8, apply: (m, n) => { m.magnet *= dim(0.30, n) },
  },
  {
    // COMMON on purpose. Contact damage was doubled, and a run offered nothing
    // but damage cards while being killed by touches is not a difficulty
    // curve, it is a missing answer. Armour has to sit in the tier the player
    // actually sees.
    id: 'colete', name: 'Colete de Couro', desc: '-5 de dano em cada pancada',
    icon: ICONS.item_colete, glyph: '▣',
    kind: 'stat', rarity: 'comum', max: 4, weight: 14, apply: (m) => { m.armour += 5 },
  },
  {
    /*
     * REGENERAÇÃO. The one healing card that is not a number you spend.
     *
     * Common, because at current contact damage a run with no way back from a
     * bad thirty seconds is a run decided by one mistake — and every other
     * heal in the deck is a one-off. This is the card that lets a fight be
     * survived badly and recovered from.
     */
    id: 'regen', name: 'Regeneração', desc: 'Cura fora de combate',
    icon: ICONS.up_regen, glyph: '✛',
    kind: 'stat', rarity: 'comum', max: 4, weight: 13,
    apply: (m) => { m.regen += 2.2; m.regenDelay = Math.max(2.4, m.regenDelay - 0.5) },
  },
  {
    /*
     * SEGUNDO FÔLEGO. Healing tied to the thing you were already doing, so it
     * rewards pushing rather than hiding — the level-up is the moment you
     * were fighting FOR.
     */
    id: 'folego', name: 'Segundo Fôlego', desc: 'Cada nível cura 5% da vida',
    icon: ICONS.up_vida, glyph: '↥',
    kind: 'stat', rarity: 'incomum', max: 3, weight: 9,
    apply: (m) => { m.levelHeal += 0.05 },
  },
  {
    // Costs no slot: it is eaten, not carried.
    id: 'pao', name: 'Pão de Alho', desc: 'Cura 45 de vida agora', icon: ICONS.item_pao, glyph: '✦',
    kind: 'special', rarity: 'comum', max: 99, weight: 9, apply: () => {},
    onTake: (heal) => heal(45),
  },

  // ---------------------------------------------------------- INCOMUNS --
  {
    id: 'sorte', name: 'Sorte de Cabra', desc: '+1 de sorte. Tudo rola melhor',
    icon: ICONS.up_sorte, glyph: '☘',
    kind: 'stat', rarity: 'incomum', max: 4, weight: 10, apply: (m) => { m.luck += 1 },
  },
  {
    id: 'vampirismo', name: 'Vampirismo', desc: 'Recupera vida a cada abate', icon: ICONS.up_vampirismo, glyph: '✚',
    kind: 'stat', rarity: 'incomum', max: 3, weight: 8, apply: (m) => { m.lifesteal += 0.40 },
  },
  {
    id: 'perfurante', name: 'Bala Perfurante', desc: 'Atravessa +1 inimigo', icon: ICONS.up_arma, glyph: '⇢',
    kind: 'stat', rarity: 'incomum', max: 3, weight: 8, apply: (m) => { m.pierce += 1 },
  },
  {
    id: 'bomba', name: 'Bombas do Louro', glyph: '✸',
    desc: 'Joga uma bomba num lugar qualquer. Mais cartas, menos espera',
    icon: ICONS.up_bomba, ability: 'bomba',
    kind: 'power', rarity: 'incomum', max: ABILITIES.bomba.maxStacks, weight: 8, apply: () => {},
  },
  {
    id: 'tijolo', name: 'Tijolo de Leite', glyph: '▬',
    desc: 'Doce duro: quem encosta se machuca',
    icon: ICONS.up_tijolo, ability: 'tijolo',
    kind: 'power', rarity: 'incomum', max: ABILITIES.tijolo.maxStacks, weight: 8, apply: () => {},
  },
  {
    id: 'tambaqui', name: 'Tambaqui', glyph: '≈',
    desc: 'De tempo em tempo, arremessa peixe nos inimigos',
    icon: ICONS.up_tambaqui, ability: 'tambaqui',
    kind: 'power', rarity: 'incomum', max: ABILITIES.tambaqui.maxStacks, weight: 8, apply: () => {},
  },
  {
    id: 'ammo_veneno', name: AMMO.veneno.name, glyph: '☠', desc: AMMO.veneno.desc,
    icon: AMMO.veneno.icon, ammo: 'veneno',
    kind: 'ammo', rarity: 'incomum', max: 1, weight: 7, apply: () => {},
  },
  {
    id: 'ammo_spray', name: AMMO.spray.name, glyph: '⁘', desc: AMMO.spray.desc,
    icon: AMMO.spray.icon, ammo: 'spray',
    kind: 'ammo', rarity: 'incomum', max: 1, weight: 7, apply: () => {},
  },

  // -------------------------------------------------------------- RAROS --
  {
    id: 'criptografia', name: 'Criptografia', desc: 'Eles demoram muito mais pra te achar',
    icon: ICONS.up_criptografia, glyph: '⌗',
    kind: 'stat', rarity: 'raro', max: 3, weight: 8, apply: (m, n) => { m.notice *= 1 - 0.22 * Math.pow(FALLOFF, n - 1) },
  },
  {
    id: 'cano_duplo', name: 'Cano Duplo', desc: '+1 projétil por tiro', icon: ICONS.up_arma, glyph: '⋔',
    kind: 'stat', rarity: 'raro', max: 2, weight: 7, apply: (m) => { m.projectiles += 1 },
  },
  {
    id: 'orbital', name: 'Rebimboca Orbital', glyph: '◍',
    desc: 'Balas ficam girando em volta de você',
    icon: ICONS.up_bullet_around, ability: 'orbital',
    kind: 'power', rarity: 'raro', max: ABILITIES.orbital.maxStacks, weight: 9, apply: () => {},
  },
  {
    id: 'escudo', name: 'RNG de RPG', glyph: '◈',
    desc: 'Rola o dado sozinho. Pode sair bênção, pode sair desgraça',
    icon: ICONS.up_escudo, ability: 'escudo',
    kind: 'power', rarity: 'raro', max: ABILITIES.escudo.maxStacks, weight: 7, apply: () => {},
  },
  {
    id: 'escudo_fiel', name: 'Escudo Fiel', glyph: '⛨',
    desc: 'Um escudo curto, sempre na hora certa. Sem aposta',
    icon: ICONS.up_escudo_fiel, ability: 'escudo_fiel',
    kind: 'power', rarity: 'incomum', max: ABILITIES.escudo_fiel.maxStacks, weight: 8, apply: () => {},
  },
  {
    id: 'dash', name: 'Dash Empírico', glyph: '⇉',
    desc: 'ESPAÇO para arrancar. Ninguém te acerta no meio do tranco',
    icon: ICONS.up_dash, ability: 'dash',
    kind: 'power', rarity: 'incomum', max: ABILITIES.dash.maxStacks, weight: 9, apply: () => {},
  },
  {
    id: 'chuva', name: 'Dança da Chuva', glyph: '☂',
    desc: 'Dança agora, chove depois. Cai onde você estava',
    icon: ICONS.up_chuva, ability: 'chuva',
    kind: 'power', rarity: 'raro', max: ABILITIES.chuva.maxStacks, weight: 8, apply: () => {},
  },
  {
    id: 'cogumelo', name: 'Cogumelo', glyph: '🍄',
    desc: 'Vai plantando cogumelo no caminho. Queima em volta e depois estoura',
    icon: ICONS.item_cogumelo, ability: 'cogumelo',
    kind: 'power', rarity: 'incomum', max: ABILITIES.cogumelo.maxStacks, weight: 8, apply: () => {},
  },
  {
    id: 'ventos', name: 'Ventos de Tupã', glyph: '🌀',
    desc: 'Rajadas jogam o bando longe e machucam no caminho',
    icon: ICONS.up_ventos, ability: 'ventos',
    kind: 'power', rarity: 'incomum', max: ABILITIES.ventos.maxStacks,
    weight: 11, apply: () => {},
  },
  {
    id: 'bigorna', name: 'Arremessa Bigorna', glyph: '⚒',
    desc: 'A sombra avisa, a bigorna cai. Sai de baixo',
    icon: ICONS.up_bigorna, ability: 'bigorna',
    kind: 'power', rarity: 'incomum', max: ABILITIES.bigorna.maxStacks,
    weight: 10, apply: () => {},
  },
  {
    id: 'podertupa', name: 'Poder de Tupã', glyph: '✋',
    desc: 'A cada 30s suas habilidades doem mais — e você também',
    icon: ICONS.up_podertupa, ability: 'podertupa',
    kind: 'power', rarity: 'raro', max: ABILITIES.podertupa.maxStacks,
    weight: 7, apply: () => {},
  },
  {
    id: 'cantarolar', name: 'Cantarolar', glyph: '♪',
    desc: 'Notas saem dançando devagar atrás de quem tá por perto',
    icon: ICONS.up_cantarolar, ability: 'cantarolar',
    kind: 'power', rarity: 'incomum', max: ABILITIES.cantarolar.maxStacks,
    weight: 12, apply: () => {},
  },
  {
    id: 'chapeu', name: 'Chapéu-Bonito', glyph: '🎩',
    desc: 'Um chapéu. Nunca dois. De vez em quando ele dá uma volta',
    icon: ICONS.up_chapeu, ability: 'chapeu',
    kind: 'power', rarity: 'incomum', max: ABILITIES.chapeu.maxStacks,
    weight: 10, apply: () => {},
  },
  {
    id: 'calice', name: 'Cálice', glyph: '🍵',
    desc: 'F pra beber. Cura bem, mas a mira vai embora por 3s',
    icon: ICONS.up_calice, ability: 'calice',
    kind: 'power', rarity: 'incomum', max: ABILITIES.calice.maxStacks,
    weight: 10, apply: () => {},
  },
  {
    id: 'lostmedia', name: 'Lost Media', glyph: '?',
    desc: 'Uma gravação sua reaparece e refaz o que você fez',
    icon: ICONS.up_lostmedia, ability: 'lostmedia',
    kind: 'power', rarity: 'raro', max: ABILITIES.lostmedia.maxStacks,
    weight: 8, apply: () => {},
  },
  {
    id: 'tupa', name: 'Raio de Tupã', glyph: '⚡',
    desc: 'O céu escolhe o maior deles e resolve o assunto',
    icon: ICONS.up_tupa, ability: 'tupa',
    kind: 'power', rarity: 'lendario', max: ABILITIES.tupa.maxStacks, weight: 9, apply: () => {},
  },
  {
    id: 'tornado', name: 'Tornado', glyph: '🌀',
    desc: 'Solta tornados que atravessam tudo pela frente',
    icon: ICONS.up_tornado, ability: 'tornado',
    kind: 'power', rarity: 'incomum', max: ABILITIES.tornado.maxStacks, weight: 8, apply: () => {},
  },
  {
    id: 'privacidade', name: 'Privacidade', glyph: '◐',
    desc: 'A cada 25s você some e eles perdem você de vista',
    icon: ICONS.up_privacidade, ability: 'privacidade',
    kind: 'power', rarity: 'raro', max: ABILITIES.privacidade.maxStacks, weight: 7, apply: () => {},
  },
  {
    id: 'homunculo', name: 'Homúnculo', glyph: '☖',
    desc: 'Um ajudante aparece e anda contigo. Quem bate nele se machuca',
    icon: ICONS.up_totem, ability: 'homunculo',
    kind: 'power', rarity: 'raro', max: ABILITIES.homunculo.maxStacks, weight: 7, apply: () => {},
  },
  {
    id: 'teleporte', name: 'Teleporte Indígena', glyph: '⇴',
    desc: 'Q pra saltar até onde o mouse aponta',
    icon: ICONS.up_teleporte, ability: 'teleporte',
    kind: 'power', rarity: 'raro', max: ABILITIES.teleporte.maxStacks, weight: 7, apply: () => {},
  },
  {
    id: 'ammo_piercing', name: AMMO.piercing.name, glyph: '⇢', desc: AMMO.piercing.desc,
    icon: AMMO.piercing.icon, ammo: 'piercing',
    kind: 'ammo', rarity: 'raro', max: 1, weight: 6, apply: () => {},
  },
  {
    id: 'ammo_explosive', name: AMMO.explosive.name, glyph: '✸', desc: AMMO.explosive.desc,
    icon: AMMO.explosive.icon, ammo: 'explosive',
    kind: 'ammo', rarity: 'raro', max: 1, weight: 6, apply: () => {},
  },
  {
    id: 'ammo_ricochet', name: AMMO.ricochet.name, glyph: '⤨', desc: AMMO.ricochet.desc,
    icon: AMMO.ricochet.icon, ammo: 'ricochet',
    kind: 'ammo', rarity: 'raro', max: 1, weight: 6, apply: () => {},
  },
  {
    id: 'ammo_aimbot', name: 'Bala Teleguiada', glyph: '◉',
    desc: 'Fraca e lenta, mas corrige sozinha',
    icon: AMMO.aimbot.icon, ammo: 'aimbot',
    kind: 'ammo', rarity: 'raro', max: 1, weight: 6, apply: () => {},
  },
  {
    id: 'ammo_sniper', name: 'Bala de Precisão', glyph: '✦',
    desc: 'Um tiro por vez, e atravessa a fila inteira',
    icon: AMMO.sniper.icon, ammo: 'sniper',
    kind: 'ammo', rarity: 'raro', max: 1, weight: 6, apply: () => {},
  },

  // ---------------------------------------------------------- LENDÁRIOS --
  // A 2% tier at luck zero. This is what luck is actually shopping for.
  {
    id: 'amuleto', name: 'Amuleto do Juazeiro', desc: '+2 de sorte',
    icon: ICONS.up_sorte, glyph: '✧',
    kind: 'stat', rarity: 'lendario', max: 2, weight: 8, apply: (m) => { m.luck += 2 },
  },
  {
    id: 'escudo_voador', name: 'Escudo Voador', glyph: '◌',
    desc: 'Um drone gira em volta e come os tiros deles',
    icon: ICONS.up_voador, ability: 'escudo_voador',
    kind: 'power', rarity: 'raro', max: ABILITIES.escudo_voador.maxStacks,
    weight: 8, apply: () => {},
  },
  {
    id: 'escudo_alien', name: 'Escudo Alien', glyph: '⬡',
    desc: 'Guarda cargas que comem uma pancada inteira cada',
    icon: ICONS.item_escudo_alien, ability: 'escudo_alien',
    kind: 'power', rarity: 'lendario', max: ABILITIES.escudo_alien.maxStacks, weight: 9, apply: () => {},
  },
  {
    id: 'reviva', name: 'Reviva', glyph: '✟',
    desc: 'Levanta uma vez com metade da vida',
    icon: ICONS.up_reviva,
    // Costs no slot — it is spent by dying. It will not show again while one
    // is still banked, or the rarest card in the deck stacks into immortality.
    kind: 'special', rarity: 'lendario', max: 4, weight: 6, apply: (m) => { m.revives += 1 },
    available: (p) => p.mods.revives === 0,
  },
  /**
   * MAIS UM LUGAR @ the only card that buys room for other cards.
   *
   * Six powers is the shape of a build and the cap is what makes the level-up
   * screen a decision. But a hard cap with no way round it stops being a
   * decision the moment it is reached: from then on every new legendary is a
   * swap prompt, and the answer is usually no. This is the way round it, and
   * it costs a legendary roll to find, which is the price.
   *
   * TWICE, EVER. Eight powers is where the numbers stop being a build and
   * start being a list @ see `EXTRA_SLOT_MAX`. It spends no slot itself, and
   * it stops being offered once both are taken.
   */
  {
    id: 'queima', name: 'Queima Rosca', glyph: '🔥',
    desc: 'Segura o botão direito e pega fogo. Você também.',
    icon: ICONS.up_queima, ability: 'queima',
    kind: 'power', rarity: 'raro', max: ABILITIES.queima.maxStacks,
    weight: 8, apply: () => {},
  },
  {
    id: 'garra', name: 'A Garra', glyph: '⚔',
    desc: 'Quem chega perto leva talho',
    icon: ICONS.up_garra, ability: 'garra',
    kind: 'power', rarity: 'incomum', max: ABILITIES.garra.maxStacks,
    weight: 9, apply: () => {},
  },
  {
    id: 'executar', name: 'Executar', glyph: '☠',
    desc: 'Machucado? Aperta X num quase-morto e pula nele. Cura.',
    icon: ICONS.up_executar, ability: 'executar',
    kind: 'power', rarity: 'raro', max: ABILITIES.executar.maxStacks,
    weight: 7, apply: () => {},
  },
  {
    id: 'privada_fx', name: 'A Privada', glyph: '🚽',
    desc: 'Esguicha numa área. Não explode, só insiste.',
    icon: ICONS.up_privada, ability: 'privada_fx',
    kind: 'power', rarity: 'incomum', max: ABILITIES.privada_fx.maxStacks,
    weight: 9, apply: () => {},
  },
  {
    id: 'amantes', name: 'Amantes', glyph: '♥',
    desc: 'Um deles muda de ideia e briga do seu lado',
    icon: ICONS.up_amantes, ability: 'amantes',
    kind: 'power', rarity: 'raro', max: ABILITIES.amantes.maxStacks,
    weight: 7, apply: () => {},
  },

  /**
   * TROCAR VIDA — the only card in the deck that takes something.
   *
   * A third of the bar for a third more damage, and it costs NO SLOT, which is
   * what makes it a real decision rather than an obviously-bad one: it is not
   * competing with a power, it is competing with your own health. Stack it
   * three times and you are hitting at more than twice your damage with a
   * third of the health, which is a build, and a stupid one, and it should be
   * possible.
   *
   * `hpMul` rather than `maxHp` because the trade is proportional — see
   * `PlayerMods.hpMul`. `Game.rebuildMaxHp` clamps current health down with
   * it, so taking this at full health is the cheapest moment to.
   */
  {
    id: 'cabeca', name: 'Arranca Cabeça', glyph: '☠',
    desc: 'Todo alien morto pode perder a cabeça. Ela ricocheteia.',
    icon: ICONS.skull_1, ability: 'cabeca',
    kind: 'power', rarity: 'raro', max: ABILITIES.cabeca.maxStacks,
    weight: 8, apply: () => {},
  },
  {
    id: 'trocar', name: 'Trocar Vida', glyph: '⚖',
    desc: '-30% de vida máxima, +30% de dano, +15% nos poderes.',
    icon: ICONS.up_trocar,
    kind: 'special', rarity: 'lendario', max: 3, weight: 6,
    /*
     * IT PAYS THE POWERS TOO, AT HALF.
     *
     * It only ever touched `damage`, which is the revolver and the things that
     * scale off it — so a build made of Queima Rosca, Cogumelo and Bigorna
     * traded away a third of its health for almost nothing. The card is sold
     * as \"life for damage\" and a player reading that does not expect it to
     * mean \"life for BULLET damage\".
     *
     * Half, because the powers are already the half of a build that scales
     * fastest: they stack, they crit off the same multipliers, and several of
     * them hit everything on screen at once. Matching the gun's 30% would make
     * this the only card an ability build ever wants.
     */
    apply: (m) => { m.hpMul *= 0.7; m.damage *= 1.3; m.abilityMul *= 1.15 },
  },

  {
    id: 'mais_slot', name: 'Mais Um Lugar', glyph: '➕',
    desc: 'Abre mais um espaço de poder. Só duas vezes.',
    icon: ICONS.up_mais_slot,
    kind: 'special', rarity: 'lendario', max: EXTRA_SLOT_MAX, weight: 5,
    apply: () => {},
  },
]
