import { UPGRADES, POWER_SLOTS } from './weapons'
import { AMMO } from './bullets'
import { STAGES } from './stages'
import { ENEMIES } from './enemies'
import type { Game } from '../Game'

/**
 * WHAT A RUN WAS.
 *
 * The game ends and the player is handed a number — kills — and a button that
 * says DE NOVO. Twenty minutes of decisions, and the only thing it remembers
 * about them is how many cows died. This is the other thing: everything the
 * run actually was, gathered at the moment it stops, named, and put somewhere
 * it can be kept.
 *
 * TWO RULES it is built around.
 *
 *   1. EVERY NUMBER HERE IS COUNTED, NOT ESTIMATED. Accuracy is shots fired
 *      against shots that connected, both incremented at the two lines where
 *      those things happen. Nothing in this file guesses at anything, because
 *      a summary with a made-up statistic in it is worth less than no summary.
 *   2. THE TITLE IS EARNED, NOT ROLLED. It is chosen from what the run
 *      actually did — see `titleFor`. Two players who both reached act three
 *      should be able to compare titles and learn something about how the
 *      other one plays.
 */

// ------------------------------------------------------------------ COUNTS --

/**
 * THE TALLY, kept on the Game and reset with it.
 *
 * Deliberately flat numbers rather than a list of events: a run kills four
 * hundred things a minute and an event log would be the largest object in the
 * program by an order of magnitude, for a screen that shows nine figures.
 */
export interface RunStats {
  shots: number
  hits: number
  damage: number
  /** The single biggest number this run ever put on screen. */
  bestHit: number
  /** Bodies that arrived buffed. Worth counting separately: they are events. */
  miniBosses: number
  /** Revivas actually spent, not banked. */
  revivesUsed: number
  /** Held by the Navé Mãe, and how many of those he broke out of. */
  grabbed: number
  escaped: number
  /** Longest stretch of the run with nothing touching him, in seconds. */
  bestStreak: number
  streak: number
  /** Health picked up off the floor, and health lost. */
  healed: number
  taken: number
}

export function makeRunStats(): RunStats {
  return {
    shots: 0, hits: 0, damage: 0, bestHit: 0,
    miniBosses: 0, revivesUsed: 0, grabbed: 0, escaped: 0,
    bestStreak: 0, streak: 0, healed: 0, taken: 0,
  }
}

// ------------------------------------------------------------------ TITLES --

/**
 * WHAT TO CALL SOMEBODY WHO PLAYED LIKE THAT.
 *
 * Read in order and the FIRST match wins, so the list is sorted by how much a
 * thing says about the player rather than by how impressive it is. Ending the
 * game is the loudest fact about a run; after that come the ways of playing
 * that are unusual enough to be a choice — never missing, never being hit,
 * never taking a power — and the general shapes come last.
 *
 * Every entry carries a POOL rather than one string, so two runs that played
 * the same way still read differently. The pool is picked from with the run's
 * own numbers rather than `Math.random`, so a given run always produces the
 * same title: a summary you can screenshot has to say the same thing the
 * second time you look at it.
 */
interface TitleRule {
  /** Does this run qualify? */
  when: (r: Summary) => boolean
  /** What it is called. One is chosen deterministically per run. */
  pool: readonly string[]
  /** The line under it, explaining what earned it. */
  why: string
}

const TITLES: readonly TitleRule[] = [
  // --------------------------------------------------- he finished it -----
  {
    when: (r) => r.won && r.deaths === 0 && r.accuracy >= 0.7,
    pool: ['O SANTO DE FLORIANO', 'AQUELE QUE NÃO ERRA', 'O MILAGRE DA BR',
      'PERFEITO DEMAIS PRO PIAUÍ'],
    why: 'Terminou. Sem cair. Sem desperdiçar bala.',
  },
  {
    when: (r) => r.won && r.deaths === 0,
    pool: ['O INTOCÁVEL', 'PASSOU LIMPO', 'NEM ENCOSTARAM', 'SEM UM ARRANHÃO'],
    why: 'A igreja inteira e nenhum tombo.',
  },
  {
    when: (r) => r.won && r.seconds <= 900,
    pool: ['NÃO TINHA TEMPO', 'FOI DIRETO', 'PRESSA DE IRMÃO', 'O ATALHO'],
    why: 'Trouxe o Soul de volta antes do almoço.',
  },
  {
    when: (r) => r.won && r.deaths >= 3,
    pool: ['CAIU MAS CHEGOU', 'NA BASE DA TEIMOSIA', 'ARRASTOU O CORPO ATÉ LÁ'],
    why: 'Tombou várias vezes e mesmo assim terminou.',
  },
  {
    when: (r) => r.won && r.powers === 0,
    pool: ['SÓ ELE E O REVÓLVER', 'DISPENSOU AJUDA', 'DO JEITO DIFÍCIL'],
    why: 'Terminou o jogo sem um único poder.',
  },
  {
    when: (r) => r.won,
    pool: ['QUEM FOI BUSCAR O SOUL', 'O QUE VOLTOU COM ELE', 'FIM DA ESTRADA',
      'O IRMÃO DO SOUL'],
    why: 'O Chará ficou no chão. O Soul voltou pra casa.',
  },

  // ----------------------------------------------- ways of playing --------
  {
    when: (r) => r.accuracy >= 0.95 && r.stats.shots > 300,
    pool: ['NÃO ERROU UMA', 'A BALA OBEDECE', 'ASSUSTADORAMENTE CERTO'],
    why: 'Praticamente todo tiro achou carne.',
  },
  {
    when: (r) => r.accuracy >= 0.85 && r.stats.shots > 400,
    pool: ['O CIRURGIÃO', 'MIRA DE RELÓGIO', 'NÃO DESPERDIÇA', 'DEDO CALIBRADO'],
    why: 'Quase toda bala achou alguém.',
  },
  {
    when: (r) => r.accuracy <= 0.35 && r.stats.shots > 600,
    pool: ['O REGADOR', 'ATIRA PRA TODO LADO', 'O DESPERDÍCIO', 'CHUMBO NO MATO'],
    why: 'O chão da caatinga tá cheio de chumbo.',
  },
  {
    when: (r) => r.stats.bestHit >= 5000,
    pool: ['UM GOLPE SÓ', 'O ESTOURO', 'ALGUÉM SUMIU DA TELA'],
    why: 'Um único acerto que ninguém explicou.',
  },
  {
    when: (r) => r.pace >= 130 && r.seconds > 240,
    pool: ['RITMO INDUSTRIAL', 'NÃO DÁ TRÉGUA', 'LINHA DE MONTAGEM'],
    why: 'Matou mais rápido do que nasciam.',
  },
  {
    when: (r) => r.pace <= 25 && r.seconds > 420,
    pool: ['O PASSEADOR', 'FOI DEVAGAR', 'TÁ VENDO A PAISAGEM'],
    why: 'Andou muito mais do que atirou.',
  },
  {
    when: (r) => r.kills <= 150 && r.seconds > 300,
    pool: ['O PACIFISTA', 'DESVIOU DE TODO MUNDO', 'NÃO QUIS BRIGA'],
    why: 'Passou por Floriano quase sem matar ninguém.',
  },

  // ----------------------------------------------- what he was carrying ---
  {
    when: (r) => r.powers >= POWER_SLOTS + 2,
    pool: ['ABRIU MAIS LUGAR', 'NÃO CABIA MAIS NADA', 'O DEPÓSITO'],
    why: 'Passou do limite de poderes. Duas vezes.',
  },
  {
    when: (r) => r.ammo.length >= 5,
    pool: ['O ARSENAL', 'TEM BALA PRA TUDO', 'O CINTO PESADO'],
    why: 'Levou meia loja de munição na estrada.',
  },
  {
    when: (r) => r.powers === 0 && r.level >= 15,
    pool: ['SÓ O REVÓLVER', 'O PURISTA', 'NADA ALÉM DA ARMA'],
    why: 'Nenhum poder. Só a arma e a paciência.',
  },
  {
    when: (r) => r.powers >= POWER_SLOTS,
    pool: ['O ARMÁRIO AMBULANTE', 'CHEIO DE GAMBIARRA', 'O CANIVETE'],
    why: 'Levou tudo que deram e ainda quis mais.',
  },
  {
    when: (r) => r.build.length >= 18,
    pool: ['PEGOU TUDO QUE VIU', 'O COLECIONADOR', 'NÃO RECUSOU NADA'],
    why: 'A lista de cartas não cabe na tela.',
  },

  // ----------------------------------------------- what happened to him ---
  {
    when: (r) => r.stats.escaped >= 3,
    pool: ['O QUE SEMPRE ESCAPA', 'ESCORREGADIO', 'NÃO LEVARAM', 'SOLTA EU'],
    why: 'A Navé Mãe tentou. A Navé Mãe desistiu.',
  },
  {
    when: (r) => r.stats.revivesUsed >= 4,
    pool: ['SETE VIDAS', 'MORRE E VOLTA', 'O INSISTENTE'],
    why: 'Foi ao chão mais vezes do que dá pra contar.',
  },
  {
    when: (r) => r.stats.revivesUsed >= 2,
    pool: ['O TEIMOSO', 'LEVANTOU DE NOVO', 'NÃO FICA NO CHAO'],
    why: 'Tombou mais de uma vez e voltou todas.',
  },
  {
    when: (r) => r.stats.bestStreak >= 180,
    pool: ['O INALCANÇÁVEL', 'NINGUÉM CHEGOU PERTO', 'DANÇOU', 'FANTASMA'],
    why: 'Três minutos inteiros sem ninguém encostar.',
  },
  {
    when: (r) => r.stats.bestStreak <= 12 && r.seconds > 300,
    pool: ['IMÃ DE PANCADA', 'APANHA SEM PARAR', 'ALVO FÁCIL'],
    why: 'Nunca passou nem quinze segundos em paz.',
  },
  {
    when: (r) => r.stats.taken >= 900,
    pool: ['O SACO DE PANCADA', 'AGUENTOU', 'COURO GROSSO', 'FEITO DE PEDRA'],
    why: 'Apanhou muito e continuou andando.',
  },
  {
    when: (r) => r.stats.healed >= 800,
    pool: ['COMEU BEM DEMAIS', 'VIVE DE MILHO', 'ACHOU COMIDA'],
    why: 'Recuperou mais vida do que a maioria tem.',
  },
  {
    when: (r) => r.stats.miniBosses >= 8,
    pool: ['CAÇADOR DE GRANDES', 'O QUE PROCURA BRIGA', 'PAPA-GORDO'],
    why: 'Foi atrás dos maiores em vez de fugir deles.',
  },
  {
    when: (r) => r.kills >= 2500,
    pool: ['O MOEDOR', 'A CEIFA', 'PASSOU O TRATOR', 'CONTA-CORPOS'],
    why: 'Contou-se por milhares.',
  },

  // ----------------------------------------------- how far he got ---------
  {
    when: (r) => r.bosses.length >= 2,
    pool: ['DERRUBOU OS DOIS', 'A ESTRADA TÁ LIMPA', 'PASSOU POR CIMA'],
    why: 'Os dois chefes da estrada ficaram pra trás.',
  },
  {
    when: (r) => r.act >= 2,
    pool: ['CHEGOU NA IGREJA', 'VIU A PORTA', 'QUASE LÁ', 'A UM PASSO'],
    why: 'Atravessou Floriano inteira.',
  },
  {
    when: (r) => r.act >= 1,
    pool: ['ENTROU NA CIDADE', 'PASSOU DA BR', 'VIU FLORIANO'],
    why: 'A estrada acabou e ele continuou.',
  },
  {
    when: (r) => r.seconds < 75,
    pool: ['MAL SAIU DE CASA', 'FOI RÁPIDO DEMAIS', 'ISSO FOI TUDO?'],
    why: 'Menos de um minuto e meio de estrada.',
  },
  {
    when: () => true,
    pool: ['PEGOU A ESTRADA', 'SAIU DE CASA', 'TENTOU', 'A BR NÃO PERDOA'],
    why: 'Toda corrida começa na BR.',
  },
]

/**
 * HOW THE RUN IS ANNOUNCED, in the line above the title.
 *
 * It said VOCÊ TOMBOU every single time, which by the fourth death is the
 * screen shrugging at you. These are the same fact told in the voice the run
 * earned: being carried off by the Navé Mãe is a different ending from
 * bleeding out in the churchyard, and losing at forty seconds is a different
 * ending from losing at twenty-five minutes.
 *
 * FIRST MATCH WINS, same as the titles, and the generic pool at the bottom is
 * what most runs get. Picked with the same run seed, so the line does not
 * change while the player is looking at it.
 */
const VERDICTS: readonly { when: (r: Summary) => boolean; pool: readonly string[] }[] = [
  // ---- he won -------------------------------------------------------------
  {
    when: (r) => r.won && r.deaths === 0,
    pool: ['O SOUL ESTÁ LIVRE', 'TROUXE ELE INTEIRO', 'ACABOU BEM'],
  },
  {
    when: (r) => r.won,
    pool: ['O SOUL ESTÁ LIVRE', 'CUSTOU, MAS ACABOU', 'OS DOIS VOLTARAM'],
  },

  // ---- he lost ------------------------------------------------------------
  {
    when: (r) => r.stats.grabbed > 0 && r.stats.escaped === 0,
    pool: ['LEVARAM VOCÊ TAMBÉM', 'SUMIU NO CÉU', 'AGORA SÃO DOIS LÁ EM CIMA'],
  },
  {
    when: (r) => r.act >= 2,
    pool: ['CAIU NA PORTA DA IGREJA', 'TÃO PERTO', 'O SOUL OUVIU O TIRO'],
  },
  {
    when: (r) => r.seconds < 75,
    pool: ['ACABOU ANTES DE COMEÇAR', 'NEM ESQUENTOU O CANO', 'ISSO FOI RAPIDO'],
  },
  {
    when: (r) => r.deaths >= 3,
    pool: ['DESSA VEZ NÃO LEVANTOU', 'ACABOU O FÔLEGO', 'A ÚLTIMA QUEDA'],
  },
  {
    when: (r) => r.stats.taken >= 900,
    pool: ['APANHOU ATÉ NÃO DAR MAIS', 'O CORPO DESISTIU', 'FOI DEMAIS'],
  },
  {
    when: (r) => r.kills >= 1500,
    pool: ['LEVOU MUITA GENTE JUNTO', 'MORREU CERCADO', 'NÃO FOI DE GRAÇA'],
  },
  {
    when: () => true,
    pool: ['VOCÊ TOMBOU', 'FICOU NA CAATINGA', 'ACABOU AQUI',
      'A ESTRADA VENCEU', 'O SOUL CONTINUA LÁ', 'O CHÃO DE FLORIANO'],
  },
]

/**
 * A NUMBER THAT IS THE SAME EVERY TIME FOR THE SAME RUN.
 *
 * `Math.random` would give a run a different title each time the screen was
 * re-rendered, which for a summary somebody is about to screenshot is simply
 * wrong. Hashed off figures that cannot change once the run is over.
 */
function runSeed(r: Summary): number {
  const n = r.kills * 31 + Math.round(r.seconds) * 17 + r.level * 7
    + r.stats.shots * 3 + r.stats.hits
  return Math.abs(Math.round(n)) % 1000003
}

// ----------------------------------------------------------------- MEDALS --

/** Small, specific, and only shown when true. The run's footnotes. */
const MEDALS: readonly { when: (r: Summary) => boolean; text: string }[] = [
  { when: (r) => r.bosses.length >= 2, text: 'Derrubou os dois chefes da estrada' },
  { when: (r) => r.deaths === 0 && r.seconds > 300, text: 'Nunca foi ao chão' },
  { when: (r) => r.accuracy >= 0.75, text: 'Mira limpa' },
  { when: (r) => r.stats.bestHit >= 2000, text: 'Um golpe de ' + '2000+' },
  { when: (r) => r.stats.escaped > 0, text: 'Escapou da Navé Mãe' },
  { when: (r) => r.level >= 30, text: 'Nível 30' },
  { when: (r) => r.stats.miniBosses >= 5, text: 'Cinco grandes no chão' },
  { when: (r) => r.kills >= 1500, text: 'Mil e quinhentos corpos' },
  { when: (r) => r.stats.healed >= 400, text: 'Comeu bem' },
  { when: (r) => r.powers >= 6, text: 'Build completa' },
  { when: (r) => r.powers >= 8, text: 'Abriu os dois lugares extras' },
  { when: (r) => r.ammo.length >= 4, text: 'Quatro tipos de munição' },
  { when: (r) => r.stats.bestStreak >= 90, text: 'Um minuto e meio intocado' },
  { when: (r) => r.pace >= 100, text: 'Cem por minuto' },
  { when: (r) => r.distance >= 2500, text: 'Andou a estrada inteira' },
  { when: (r) => r.seconds >= 1500, text: 'Vinte e cinco minutos de pé' },
  { when: (r) => r.stats.damage >= 100000, text: 'Cem mil de dano' },
  { when: (r) => r.stats.shots >= 3000, text: 'Três mil tiros' },
  { when: (r) => r.stats.taken === 0 && r.seconds > 180, text: 'Não levou um golpe' },
  { when: (r) => r.build.length >= 15, text: 'Quinze cartas' },
]

// ---------------------------------------------------------------- SUMMARY --

/**
 * ONE CARD THE PLAYER TOOK, with everything needed to DRAW it.
 *
 * The summary used to carry names only, and a build read as a paragraph of
 * comma-separated Portuguese — which is the one part of the run the player
 * spent the whole game looking at as pictures. Carrying the art path here
 * means the end screen and the PNG both show the same tiles the level-up
 * screen offered, and neither of them has to reach back into `UPGRADES`.
 */
export interface BuildItem {
  id: string
  name: string
  stacks: number
  kind: string
  rarity: string
  /** Path to the 32x32 art under /public. */
  icon: string
  /** Drawn instead when that art does not exist yet. */
  glyph: string
}

export interface Summary {
  title: string
  why: string
  /** The headline above the title. See `VERDICTS`. */
  verdict: string
  won: boolean
  kills: number
  seconds: number
  level: number
  /** 0..1. Shots that connected over shots fired. */
  accuracy: number
  /** Metres walked, which is arc length along the route. */
  distance: number
  /** Which act he got to, 0-indexed. */
  act: number
  actName: string
  /** Names of the bosses put down. */
  bosses: string[]
  /** Every card taken, richest first. */
  build: BuildItem[]
  /** The rounds he ended up carrying, in the order he found them. */
  ammo: { id: string; name: string; icon: string }[]
  powers: number
  /** Stat cards, counted separately from the powers. */
  stats_taken: number
  deaths: number
  medals: string[]
  stats: RunStats
  /** Kills per minute, for people who like a rate. */
  pace: number
}

export function summarise(g: Game, won: boolean): Summary {
  const st = g.runStats
  const p = g.player

  /*
   * SORTED THE WAY THE BUILD READS, not alphabetically and not by count.
   *
   * Powers first because they are the decisions — a run is remembered as
   * "the one with Queima Rosca and Amantes", never as the one with four
   * copies of +7% speed. Ammunition next, stats last, and within each group
   * the deepest stack leads.
   */
  const ORDER: Record<string, number> = { power: 0, special: 1, ammo: 2, stat: 3 }
  const build = UPGRADES
    .filter((u) => (g.taken[u.id] ?? 0) > 0)
    .map((u) => ({
      id: u.id,
      name: u.name,
      stacks: g.taken[u.id] ?? 0,
      kind: u.kind as string,
      rarity: u.rarity as string,
      icon: u.icon,
      glyph: u.glyph,
    }))
    .sort((a, b) =>
      (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || b.stacks - a.stacks)

  /*
   * NAMED FOR THE THING THAT DIED, not for the act it died in.
   *
   * This was listing "A ESTRADA" under a heading that says CHEFES, which is
   * the name of the road rather than of what was standing on it. A player
   * comparing summaries wants to read A MANIFESTAÇÃO.
   */
  const bosses: string[] = []
  for (const st of STAGES) {
    if (st.boss && g.bossesDone.has(st.id)) bosses.push(ENEMIES[st.boss]?.name ?? st.id)
  }

  const r: Summary = {
    title: '',
    why: '',
    verdict: '',
    won,
    kills: g.kills,
    seconds: g.time,
    level: p.level,
    accuracy: st.shots > 0 ? Math.min(1, st.hits / st.shots) : 0,
    distance: Math.round(p.reach / 10),
    act: g.stageIndex,
    actName: STAGES[g.stageIndex]?.name ?? '',
    bosses,
    build,
    // The revolver's own round is not a card and is never in `taken`, so the
    // list is read off the player rather than off the build.
    ammo: p.ammo.map((id) => ({ id, name: AMMO[id].name, icon: AMMO[id].icon })),
    powers: build.filter((b) => b.kind === 'power').length,
    stats_taken: build.filter((b) => b.kind === 'stat').length,
    deaths: st.revivesUsed,
    medals: [],
    stats: st,
    pace: g.time > 0 ? (g.kills / g.time) * 60 : 0,
  }

  const seed = runSeed(r)
  const rule = TITLES.find((t) => t.when(r)) ?? TITLES[TITLES.length - 1]
  r.title = rule.pool[seed % rule.pool.length]
  r.why = rule.why

  /*
   * A DIFFERENT SEED FOR THE HEADLINE than for the title.
   *
   * Both pools are picked from with the same run, and using the same index in
   * both makes them move together — every run whose title is the second entry
   * also gets the second verdict, which over a few deaths reads as the two
   * lines being one line. The shift breaks the correlation and costs nothing.
   */
  const vr = VERDICTS.find((v) => v.when(r)) ?? VERDICTS[VERDICTS.length - 1]
  r.verdict = vr.pool[(seed >> 3) % vr.pool.length]
  r.medals = MEDALS.filter((m) => m.when(r)).map((m) => m.text)
  return r
}

// ------------------------------------------------------------------- TEXT --

/** mm:ss, because a run is minutes long and nobody counts in seconds. */
export function clockOf(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return m + ':' + String(s).padStart(2, '0')
}

/**
 * THE SUMMARY AS SOMETHING THAT CAN LEAVE THE PAGE.
 *
 * Plain text on purpose. It is going into a clipboard, a text file, a group
 * chat, or a screenshot's alt text, and every one of those is somewhere a
 * table would arrive broken. Fixed-width label columns so it still lines up
 * when it gets pasted somewhere with a monospace font, which is most of them.
 */
export function summaryText(r: Summary): string {
  const L: string[] = []
  L.push('SOUL — FLORIANO SOB ATAQUE')
  L.push('')
  L.push(r.title)
  L.push(r.why)
  L.push('')
  L.push(r.won ? '>> ' + r.verdict + ' <<' : r.verdict)
  if (!r.won) L.push('Chegou em: ' + r.actName)
  L.push('')
  const row = (k: string, v: string) => L.push(k.padEnd(14) + v)
  row('TEMPO', clockOf(r.seconds))
  row('ABATIDOS', String(r.kills))
  row('NÍVEL', String(r.level))
  row('PRECISÃO', Math.round(r.accuracy * 100) + '%')
  row('RITMO', Math.round(r.pace) + ' /min')
  row('DISTÂNCIA', r.distance + ' m')
  row('DANO', Math.round(r.stats.damage).toLocaleString('pt-BR'))
  row('MAIOR GOLPE', Math.round(r.stats.bestHit).toLocaleString('pt-BR'))
  row('GRANDES', String(r.stats.miniBosses))
  row('TOMBOS', String(r.deaths))
  row('TIROS', String(r.stats.shots))
  row('SEM ENCOSTAR', clockOf(r.stats.bestStreak))
  row('CURA', Math.round(r.stats.healed).toLocaleString('pt-BR'))
  row('SOFRIDO', Math.round(r.stats.taken).toLocaleString('pt-BR'))
  if (r.stats.grabbed > 0) row('ABDUZIDO', r.stats.escaped + '/' + r.stats.grabbed + ' escapou')
  L.push('')
  if (r.bosses.length) {
    L.push('CHEFES')
    for (const b of r.bosses) L.push('  - ' + b)
    L.push('')
  }
  /*
   * GROUPED, because a flat list of eighteen cards is a wall.
   *
   * The three groups are the three different KINDS of decision a run makes:
   * what he can do, what he shoots, and what got quietly bigger. Printed in
   * that order and skipped entirely when empty.
   */
  const group = (head: string, kinds: string[]) => {
    const rows = r.build.filter((b) => kinds.includes(b.kind))
    if (!rows.length) return
    L.push(head)
    for (const b of rows) L.push('  - ' + b.name + (b.stacks > 1 ? ' x' + b.stacks : ''))
    L.push('')
  }
  group('PODERES', ['power', 'special'])
  group('MELHORIAS', ['stat'])
  if (r.ammo.length) {
    L.push('MUNIÇÃO')
    for (const a of r.ammo) L.push('  - ' + a.name)
    L.push('')
  }
  if (r.medals.length) {
    L.push('MEDALHAS')
    for (const m of r.medals) L.push('  * ' + m)
    L.push('')
  }
  return L.join('\n')
}

/**
 * WHAT THE BEST RUN SO FAR WAS, kept in the browser.
 *
 * One record, not a history: a leaderboard of one player against themselves is
 * a number to beat, and a list of thirty past runs is a list nobody reads.
 * Ranked by finishing first and by kills after that.
 *
 * Everything here fails soft. Private windows and browsers with site data
 * turned off throw on the first `localStorage` touch, and a game that will not
 * start because it could not save a high score is a much worse game than one
 * that quietly forgets.
 */
const KEY = 'soul.best.v1'

export interface Best { title: string; kills: number; seconds: number; level: number; won: boolean }

export function loadBest(): Best | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) as Best : null
  } catch { return null }
}

/** Saves if this run beat the stored one. Returns true if it did. */
export function saveBest(r: Summary): boolean {
  const now: Best = {
    title: r.title, kills: r.kills, seconds: r.seconds, level: r.level, won: r.won,
  }
  try {
    const old = loadBest()
    const better = !old || (now.won && !old.won) || (now.won === old.won && now.kills > old.kills)
    if (better) localStorage.setItem(KEY, JSON.stringify(now))
    return better
  } catch { return false }
}
