/**
 * THE ART REGISTRY.
 *
 * This is the one file you touch when you finish drawing something.
 * Drop the PNG in `public/sprites/...`, add a line here, and it is in the game.
 *
 * Sheets are horizontal strips: pose 1, pose 2, pose 3, left to right.
 * You do NOT have to line them up on a grid — the loader measures the art,
 * finds the gaps between poses, and re-packs them into an even strip with the
 * feet on the bottom row (see `core/assets.ts`). Say how many frames there
 * are and it works out the rest.
 *
 * Open the dev console on load: every sheet prints its detected frame boxes.
 * If a pose looks clipped in game, that table is where you look first.
 */
export interface SheetDef {
  /** Path under /public. Spaces and accents are fine — the loader encodes it. */
  src: string
  /** How many poses are in the strip. */
  frames: number
  /** Playback speed. 0 = static. */
  fps: number
  /** Does the animation loop? Defaults to true. */
  loop?: boolean
  /**
   * 'auto' (default) finds the frame boundaries from the art itself.
   * 'grid' divides the width evenly — use it only for a sheet you exported
   * on an exact grid and want sliced exactly there.
   */
  slice?: 'auto' | 'grid'
}

export const SHEETS = {
  // ---------------------------------------------------------------- PLAYER --
  player_idle: {
    src: '/sprites/main_oindigena/main/O Indigena.png',
    frames: 1, fps: 0,
  },
  player_walk: {
    src: '/sprites/main_oindigena/main/Andando.png',
    frames: 3, fps: 8,
  },
  player_gun_walk: {
    src: '/sprites/main_oindigena/main/holding_gun_walking.png',
    frames: 3, fps: 8,
  },
  player_gun_shoot: {
    src: '/sprites/main_oindigena/main/holding_gun_walking_shooting.png',
    frames: 3, fps: 14,
  },

  // ---------------------------------------------------------------- ENEMIES --
  coisa_voadora: {
    src: '/sprites/Enemy_1_2_Flying_Thing/thing_flying.png',
    frames: 2, fps: 9,
  },
  coisa_voadora_quebrada: {
    src: '/sprites/Enemy_1_2_Flying_Thing/thing_flying_broken.png',
    frames: 2, fps: 12,
  },
  vaca_mutada: {
    src: '/sprites/Enemy_1_Vaca_Mutada/vaca_mutada.png',
    frames: 1, fps: 0,
  },
  vaca_saquinho: {
    src: '/sprites/Enemy_1_Vaca_no_Saquinho/vaca_no_saquinho.png',
    frames: 1, fps: 0,
  },

  // The basic alien comes in three colours. They are separate sheets rather
  // than a tint at runtime, so each one can be drawn its own way.
  alien_verde: { src: '/sprites/Enemy1_2_basic_variations/walking_green.png', frames: 3, fps: 8 },
  alien_azul: { src: '/sprites/Enemy1_2_basic_variations/walking_blue.png', frames: 3, fps: 8 },
  alien_amarelo: { src: '/sprites/Enemy1_2_basic_variations/walking_yellow.png', frames: 3, fps: 8 },
  /**
   * A MINHOCA ALIEN, in three heights.
   *
   * The strip is a rise: barely out, half out, fully up. It plays as a loop
   * while she is surfaced and is not drawn at all while she is under — see
   * `drawEnemy`, which puts a moving mound of dirt there instead.
   */
  minhoca: {
    src: '/sprites/enemy_1_minhoca_alien/minhoca_alien_sprite.png',
    frames: 3, fps: 5,
  },
  /** COBSON, walking in with a million for you. */
  cobson: {
    src: '/sprites/ally_CObson/COBson walking.png',
    frames: 2, fps: 6,
  },
  tripa_seca: {
    src: '/sprites/Enemy_2_Tripa_Seca_Humano_Abduzido/tripa_seca_walking.png',
    frames: 2, fps: 7,
  },
  grande_gordo: {
    src: '/sprites/Enemy_2_Grande_Gordo/grande_gordo_walking.png',
    frames: 2, fps: 5,
  },

  saleiro: {
    src: '/sprites/enemy_2_saleiro/saleiro_walking.png', frames: 3, fps: 8,
  },
  explosivo: {
    src: '/sprites/Enemy_2_3_Explosive_Alien/enemy_3_explosive_alien.png', frames: 2, fps: 5,
  },
  rocket_idle: {
    src: '/sprites/enemy_2_alien_rocket/rocket_alien_enemy_idle.png', frames: 2, fps: 3,
  },
  rocket_flying: {
    src: '/sprites/enemy_2_alien_rocket/rocket_alien_enemy_going_to_the_target.png',
    frames: 2, fps: 14,
  },
  glowie: {
    src: '/sprites/enemy_2_glowie/alien_glowie.png', frames: 3, fps: 7,
  },
  carro: {
    src: '/sprites/Enemy_2_crazy_alien_car_folk/enemy_car_speeding.png', frames: 3, fps: 12,
  },

  // The Act I boss is drawn but has no fight yet — registered so it loads and
  // is one line away from being used.
  manifestacao: {
    src: '/sprites/BOSS_act1_manifestacao/act1_boss_manifestacao_sprite.png', frames: 1, fps: 0,
  },
  /*
   * A MICROSOFT, one sheet per phase.
   *
   * The two are drawn at the same 120x60 but cut differently — the standing
   * form is two wide frames, the melted one is three narrower ones — which the
   * auto-slicer works out on its own from where the empty columns fall.
   *
   * Phase two is registered as `sheetHurt` rather than as a second sheet with
   * its own field. The renderer already swaps to `sheetHurt` when an enemy is
   * `broken`, and "this thing has changed into its second form" is the same
   * question as "is it broken" — so the boss sets that flag when it drops
   * below half and the art follows with no new machinery.
   */
  microsoft: {
    src: '/sprites/BOSS_act2_MINCROSFT/act2_boss_MINCROSFOT_microsft._stage_1.png',
    frames: 2, fps: 4,
  },
  microsoft_2: {
    src: '/sprites/BOSS_act2_MINCROSFT/act2_boss_MINCROSFOT_microsft._stage_2.png',
    frames: 3, fps: 5,
  },
  funcionario: {
    src: '/sprites/BOSS_act2_MINCROSFT/microsoft_employee.png',
    frames: 2, fps: 8,
  },

  // ---- the last three species to be drawn -------------------------------
  abelinha: {
    src: '/sprites/Enemy_1_2_abelinha/enemy_abelinha_flying.png',
    frames: 2, fps: 14,
  },
  big_eater: {
    src: '/sprites/Enemy_2_big_eater/enemy_2_big_eater.png',
    frames: 2, fps: 5,
  },
  /*
   * ONE SPECIES, TWO STATES OF DRESS.
   *
   * The rare sheet is the same man with his clothes somewhere else, which is
   * the joke and also the reason it is rare rather than a separate enemy.
   */
  alienado: {
    src: '/sprites/Enemy_2_crazy_alianated_dude_variations/Enemy_2_crazy_alianated_dude_common.png',
    frames: 2, fps: 7,
  },
  alienado_pelado: {
    src: '/sprites/Enemy_2_crazy_alianated_dude_variations/Enemy_2_crazy_alianated_dude_rare.png',
    frames: 2, fps: 8,
  },

  /*
   * O CHARÁ, act three, and he does not have one sprite — he has six bodies.
   *
   * Each stage of the fight is a different sheet and a different size, from a
   * green man the same height as the player up to a mothership four times his
   * width. The stage machine in `ai.ts` swaps `sheet` on the live enemy rather
   * than spawning a new one each time, so the health bar, the arena and the
   * camera never lose track of who they are pointed at.
   */
  chara: { src: '/sprites/BOSS_act3_the_alien_chará/boss_chará.png', frames: 3, fps: 7 },
  chara_shoot: { src: '/sprites/BOSS_act3_the_alien_chará/boss_chará_shooting.png', frames: 3, fps: 9 },
  chara_final: { src: '/sprites/BOSS_act3_the_alien_chará/boss_chará_final_state.png', frames: 3, fps: 8 },
  chara_sword: { src: '/sprites/BOSS_act3_the_alien_chará/boss_chará_sword_final_state.png', frames: 3, fps: 12 },
  chara_mecha: {
    src: '/sprites/BOSS_act3_the_alien_chará/boss_chará_shooting_inside_mecha.png', frames: 2, fps: 5,
  },
  chara_mecha_broken: {
    src: '/sprites/BOSS_act3_the_alien_chará/boss_chará_shooting_inside_mecha_broken.png', frames: 2, fps: 6,
  },
  /* ---- ACT III: the CLT, the Beholder, and its minions ---- */
  /**
   * O CLT. One frame, because he does not move like anything else here —
   * he stands there holding a contract out at you.
   */
  clt: { src: '/sprites/Enemy_3_CLT.png', frames: 1, fps: 0 },
  /**
   * O BEHOLDER. Three frames of a floating eye with arms, and it SPINS —
   * see `drawEnemy`, where the whole sprite is rotated while he fires.
   */
  beholder: {
    src: '/sprites/BOSS_act3_mid_o_beholder_CLT/BOSS_act3_mid_o_beholder_CLT_walking.png',
    frames: 3, fps: 6,
  },
  /** And the little ones he sends. Two frames, and they never stop moving. */
  beholder_minion: {
    src: '/sprites/BOSS_act3_mid_o_beholder_CLT/beholder_minions.png',
    frames: 2, fps: 12,
  },

  chara_nave: {
    src: '/sprites/BOSS_act3_the_alien_chará/boss_chará_third_state_navé-mãe.png', frames: 2, fps: 3,
  },
  chara_nave_broken: {
    src: '/sprites/BOSS_act3_the_alien_chará/boss_chará_third_state_navé-mãe_broken.png', frames: 2, fps: 4,
  },
  /** The pillars holding the mothership's shield up. */
  alien_tech: { src: '/sprites/BOSS_act3_the_alien_chará/alien_tech_church.png', frames: 1, fps: 0 },

  /**
   * SOUL. One frame, and the only thing in the game he is actually here for.
   *
   * Never spawned as an enemy or a helper — the ending draws it directly, and
   * that is the whole of its use.
   */
  soul: { src: '/sprites/soul_sprite/soul.png', frames: 1, fps: 0 },

  manifestacao_spawn: {
    src: '/sprites/BOSS_act1_manifestacao/manifestacao_spawn.png', frames: 2, fps: 6,
  },

  // ------------------------------------------------------------------ NPCs --
  // Drawn, but nothing summons him yet — he is waiting on a mechanic.
  // Pairs with `items/homonculi_totem.png`.
  homunculo: {
    src: '/sprites/homunculo_helper/homunculo_helper_walking.png',
    frames: 2, fps: 8,
  },
  // soul_caged: { src: '/sprites/soul/caged.png', frames: 2, fps: 3 },
} satisfies Record<string, SheetDef>

export type SheetKey = keyof typeof SHEETS

// ------------------------------------------------------------------ TILES --

export interface TileDef {
  src: string
  /**
   * Ground textures get repaired into a tileable version at load time, because
   * they are repeated edge to edge across the whole map and any mismatch shows
   * up as a grid. Road pieces must NOT be touched — their exact edges are what
   * the road chaining measures.
   */
  seamless?: boolean
}

/**
 * Just the two grounds now.
 *
 * The road tiles are gone with the road. They were a band of asphalt running
 * due east, and they turned the game into a corridor — see `world/route.ts`
 * for what replaced them and why.
 */
export const TILES = {
  ground_caatinga: { src: '/map_bg/base_texture_lvl_base.png', seamless: true },
  ground_city: { src: '/map_bg/base_texture_lvl_floriano.png', seamless: true },
  /** Inside. Act III stops being a street the moment he goes through the door. */
  ground_church: { src: '/map_bg/inside_church.png', seamless: true },
} satisfies Record<string, TileDef>

export type TileKey = keyof typeof TILES

// ------------------------------------------------------------------ ICONS --

/**
 * Single 32x32 images — no frames, no slicing. Upgrade cards read these
 * straight from the DOM; the pickups are drawn on the canvas.
 *
 * Four of these are drawn but not yet assigned a mechanic (see weapons.ts):
 * `criptografia`, `privacidade`, `tijolo_de_leite` and `teleporte`. They are
 * registered here so they load, and are waiting on a decision about what they
 * should actually do.
 */
export const ICONS = {
  up_arma: '/upgrades/melhore-arma.png',
  up_furia: '/upgrades/furia-tapajó.png',
  up_velocidade: '/upgrades/velocidade.png',
  up_vida: '/upgrades/bonus-vida.png',
  up_vampirismo: '/upgrades/vampirismo.png',
  up_reviva: '/upgrades/reviva-1.png',
  up_teleporte: '/upgrades/teleporte-indigena.png',
  up_criptografia: '/upgrades/criptografia.png',
  up_privacidade: '/upgrades/privacidade.png',
  up_tijolo: '/upgrades/tijolo-de-leite.png',

  /*
   * These are BOTH the upgrade card art and the thing that flies through the
   * world — the bomb that gets lobbed, the fish that gets thrown. One drawing,
   * two jobs.
   */
  up_veneno: '/upgrades/balas venenosas.png',

  /*
   * AMMO. Six types are drawn; two carry mechanics so far (see bullets.ts).
   * The rest are registered so they load and are visible in the codex, and are
   * waiting on a decision about what each actually does.
   */
  up_bullet_poison: '/upgrades/bullets_poison (4).png',
  up_bullet_spray: '/upgrades/bullet_spray.png',
  up_bullet_piercing: '/upgrades/bullet_piercing.png',
  up_bullet_explosive: '/upgrades/bullet_explosive.png',
  up_bullet_ricochet: '/upgrades/bullet_ricochet.png',
  up_bullet_aimbot: '/upgrades/bullet_aimbot.png',
  up_bullet_sniper: '/upgrades/bullet_sniper.png',
  up_bomba: '/upgrades/bombas do louro.png',
  up_tambaqui: '/upgrades/tambaqui.png',
  up_escudo: '/upgrades/rng_de_rpg.png',

  /** Mecha ordnance. Drawn once, flown many times. */
  proj_missile: '/sprites/BOSS_act3_the_alien_chará/mecha_missiles.png',

  /**
   * The empty machine standing in the church.
   *
   * Here rather than in SHEETS because it is not an actor — it is a prop, and
   * props are drawn from this table. It becomes an actor the moment he climbs
   * into it, and at that point it is a different image entirely.
   */
  empty_mecha: '/sprites/BOSS_act3_the_alien_chará/empty_mecha.png',

  /** The boomerang itself, so the windows in the air are the drawn ones. */
  proj_janela: '/sprites/BOSS_act2_MINCROSFT/windus, projectile.png',

  /** The part itself: the card art AND the thing spinning around him. */
  up_bullet_around: '/projectiles/rebinboca.png',

  /** The note in the air. The card has its own, different picture. */
  proj_nota: '/projectiles/cantarolar.png',

  /**
   * FIVE DRAWN BOLTS, for Raio de Tupã.
   *
   * Icons rather than an effect sheet: they are not an animation, they are
   * five different shapes of the same event, and the flicker is done by
   * choosing one and blinking it rather than by playing frames. Each one hangs
   * DOWNWARD from the top of its own image, which is why they are anchored by
   * their foot when drawn — see `drawStorms`.
   */
  bolt_1: '/fx/Lightning/lightning1.png',
  bolt_2: '/fx/Lightning/lightning2.png',
  bolt_3: '/fx/Lightning/lightning3.png',
  bolt_4: '/fx/Lightning/lightning4.png',
  bolt_5: '/fx/Lightning/lightning5.png',

  /**
   * ONE RAINDROP, and it is the whole of Dança da Chuva now.
   *
   * The three grey clouds that used to hang over it went with the rest of the
   * effect's furniture — a filled disc, a sheet of streaks, a splash ring per
   * drop. Weather is this sprite, many times; everything else was decoration
   * sitting on top of it.
   */
  drop: '/particles/rain_drops.png',

  /*
   * THE THREE CORNS.
   *
   * Ordinary yellow is what everything drops. The other two are currency:
   * green for a mini-boss, because a body that came back wrong leaves
   * something that grew wrong; gold for a boss, because there are four of
   * those in the whole game and the drop should look like it.
   */
  item_milho_mini: '/items/corn_currency (2).png',
  item_milho_boss: '/items/corn_currency (3).png',

  /*
   * It was on disk the whole time under a slightly different name — a space
   * rather than an underscore — so the card had been quietly falling back to
   * its glyph since the day it was written.
   */
  up_lostmedia: '/upgrades/lost media.png',

  // ---- the six that arrived with the new effects -------------------------
  up_ventos: '/upgrades/ventos de tupa.png',
  up_bigorna: '/upgrades/arremessa bigornas.png',
  up_podertupa: '/upgrades/poder de tupa.png',
  up_cantarolar: '/upgrades/cantarolar.png',
  up_chapeu: '/upgrades/chapeu bonito.png',
  up_calice: '/upgrades/calice.png',

  up_alcance: '/upgrades/alcance_upgrade.png',
  up_dash: '/upgrades/dash empirico.png',
  up_chuva: '/upgrades/dança-da-chuva.png',
  up_tornado: '/upgrades/indigena_tornado.png',
  up_escudo_fiel: '/upgrades/shield.png',
  up_sorte: '/upgrades/betterluck.png',
  up_regen: '/upgrades/regen.png',
  up_tupa: '/upgrades/raio tupã.png',

  // ---- FLORIANO, BUILT ----
  // Drawn whole and stamped into the baked chunk. Sizes come from the art.
  b_igreja: '/buildings/Igreja-Act 3.png',
  b_igrejinha: '/buildings/igrejinha.png',
  b_abandonado: '/buildings/abandoned_building.png',
  b_apartamento: '/buildings/apartamento.png',
  b_acougue: '/buildings/açougue.png',
  b_bar: '/buildings/bar do zé.png',
  b_farmacia: '/buildings/farmacia.png',
  b_home1: '/buildings/home1.png',
  b_home_1: '/buildings/home_1.png',
  b_home_2: '/buildings/home_2.png',
  b_home_3: '/buildings/home_3.png',
  b_home_4: '/buildings/home_4.png',
  b_mercearia: '/buildings/marcearias.png',
  b_oficina: '/buildings/oficina.png',
  b_salao: '/buildings/salão.png',

  // ---- SCENERY ----
  e_cactus: '/buildings/elements/cactus.png',
  e_palmeiras: '/buildings/elements/palmeiras.png',
  e_luz: '/buildings/elements/luz.png',
  e_muro: '/buildings/elements/floriano_muro.png',
  e_placa_bemvindo: '/buildings/elements/bem-vindo-floriano.png',
  e_placa_floriano: '/buildings/elements/floriano.png',
  e_placa_piaui: '/buildings/elements/piaui.png',

  item_escudo_alien: '/items/escudo_alienigena.png',
  item_cogumelo: '/items/big_mushroom.png',
  proj_flag: '/sprites/BOSS_act1_manifestacao/red_flag_projectile.png',
  up_totem: '/upgrades/homonculi_totem.png',
  /** MAIS UM LUGAR. The one card that buys room for other cards. */
  up_mais_slot: '/upgrades/more_slot_legendary.png',

  /* ---- the six that arrived together. All six had art and no code. ---- */
  up_queima: '/upgrades/queima rosca.png',
  up_garra: '/upgrades/garra.png',
  up_executar: '/upgrades/executar.png',
  up_trocar: '/upgrades/trocar vida.png',
  up_privada: '/upgrades/privada.png',
  /** The privada itself, which sits on the ground and sprays. */
  item_privada: '/items/privada.png',

  /**
   * FOUR ALIEN SKULLS, for Arranca Cabeça.
   *
   * Four rather than one so a screen with six of them in the air is six
   * different heads: they come off different bodies. Picked per skull from its
   * own seed, so a given skull keeps its face for its whole flight.
   */
  /** The Beholder's contract, rolled up and thrown. */
  proj_clt: '/sprites/BOSS_act3_mid_o_beholder_CLT/projectile_beholder.png',

  skull_1: '/items/fb225.png',
  skull_2: '/items/fb226.png',
  skull_3: '/items/fb227.png',
  skull_4: '/items/fb228.png',
  up_amantes: '/upgrades/amantes.png',

  /**
   * THE ARROW THAT POINTS AT FLORIANO.
   *
   * The guide used to be two hand-stroked chevrons drawn with `lineTo`, which
   * is the one piece of vector art left in a game made entirely of pixels — it
   * antialiased, it did not scale with the zoom the way everything else does,
   * and it read as UI laid over the world instead of a thing in it.
   */
  guide_arrow: '/ui/arrow_cream.png',

  item_milho: '/items/corn_currency (1).png',
  item_pao: '/items/garlic_bread_food.png',
  item_colete: '/items/colete_gcm.png',
  /**
   * COMIDA EXPLOSIVA. Eat it and the room goes with it.
   *
   * The art has been on disk and declared here the whole time with nothing
   * pointing at it; it is a pickup now. See `Game.eatBomb`.
   */
  item_bomba: '/items/bomb_food.png',
  /**
   * A ESTRELA. Picking it up calls every orb on the map in at once.
   *
   * It is the answer to the one thing this game does that a player cannot fix
   * by playing better: the corn a wave drops behind them while they are being
   * chased forward by the next one. That XP is earned and, until this, gone.
   */
  item_estrela: '/items/grab_all_corn.png',
  /** ESCUDO VOADOR. The drone itself, and the card that buys it. */
  item_voador: '/items/flying shield.png',
  up_voador: '/upgrades/flying shield.png',
  item_totem: '/items/homonculi_totem.png',
} as const

export type IconKey = keyof typeof ICONS
