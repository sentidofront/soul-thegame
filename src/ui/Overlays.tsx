import { useMemo, useState } from 'react'
import { clockOf, saveBest, summaryText, type BuildItem } from '../game/data/record'
import { runCardBlob, runCardName } from './runCard'
import { REROLLS } from '../game/data/weapons'
import type { Snapshot } from '../game/types'
import type { AudioBus } from '../game/core/audio'
import type { Assets } from '../game/core/assets'
import { Panel, Pill, panelStyle } from './Panel'
import { PixelIcon } from './PixelIcon'
import { SpriteWalk } from './SpriteWalk'

/**
 * THE FRONT DOOR.
 *
 * ONE SIGN, HUNG IN THE MIDDLE, and the road going past behind it.
 *
 * It used to be a two-column split — key art on the left, a menu column down
 * the right — which is a good layout for a game that has key art. This one
 * does not: `menu_art.png` has never existed, so two thirds of the front door
 * was a CSS gradient pretending to be a sunset, and a painted gradient sitting
 * next to real pixel art always loses.
 *
 * So the backdrop is the game's OWN ground texture, tiled and drifting the way
 * the road does, and the menu is the bamboo panel off the UI sheet with the
 * pills from the same sheet inside it. Every pixel on this screen is drawn art
 * now rather than a gradient describing one.
 *
 * The panel is used at a fixed aspect and never nine-sliced. It has leaves on
 * it and nodes at heights somebody chose; stretching a middle band through
 * that would smear both. The cost is that the menu fits inside the frame
 * rather than the frame growing to fit the menu — which is the right way round
 * for a sign.
 *
 * If key art ever does land at `/ui/menu_art.png` it takes the backdrop over
 * and the sign stays exactly where it is.
 */
export function MainMenu(
  { onStart, onOpen, assets }: {
    onStart: () => void
    onOpen: (s: Screen) => void
    assets: Assets | null
  },
) {
  const [art, setArt] = useState(true)

  return (
    <div className="overlay menu-screen">
      {art
        ? <img className="menu-art" src="/ui/menu_art.png" alt="" onError={() => setArt(false)} />
        : <div className="menu-ground" />}
      <div className="menu-dark" />

      <div className="menu-stack">
        <p className="kicker">FLORIANO, PIAUÍ</p>

        <div className="frame">
          <div className="frame-in">
            <h1 className="bigtitle">SOUL</h1>
            <p className="tagline">O céu abriu e eles desceram.</p>

            <div className="menu-actions">
              <Pill tone="olive" onClick={onStart}>COMEÇAR</Pill>
              <Pill onClick={() => onOpen('settings')}>OPÇÕES</Pill>
              <Pill onClick={() => onOpen('controls')}>CONTROLES</Pill>
            </div>
          </div>
        </div>

        {/* He walks the road under the sign for as long as anyone reads it. */}
        <div className="menu-walk">
          <SpriteWalk assets={assets} sheet="player_gun_walk" scale={3} />
          <p className="story">
            Levaram o Soul, amigo, escudeiro e a mais bela dama em perigo do
            Piauí. O Indígena carregou o revólver e pegou a estrada.  
          </p>
        </div>
      </div>

      {/*
        THE MARK, outside the stack on purpose.

        `.menu-stack` centres its children and scrolls when it has to, which is
        right for the sign and wrong for a credit: a studio name that drifts
        with the layout, or scrolls off a short window along with the prose, is
        a studio name nobody sees. Pinned to the bottom of the screen it sits
        in the same place here as it does on the loading screen, which is the
        whole point of a mark.
      */}
      <p className="studio">INDIGENA STUDIOS</p>
    </div>
  )
}

export type Screen = 'settings' | 'controls' | null

/**
 * OPTIONS.
 *
 * Reads its values straight off the audio bus rather than mirroring them in
 * React state, and keeps a tick counter purely to force a redraw — the bus is
 * the single source of truth for volume, and a second copy of it here is a
 * second thing that can be wrong.
 */
export function Settings(
  { audio, onBack }: { audio: AudioBus; onBack: () => void },
) {
  const [, bump] = useState(0)
  const redraw = () => bump((n) => n + 1)

  return (
    <div className="overlay">
      <Panel skin="bamboo" className="menu small" scale={4}>
        <h2 className="title sm">OPÇÕES</h2>

        <label className="opt">
          <span className="opt-name">MUSICA</span>
          <button
            className={'toggle' + (audio.musicEnabled ? ' on' : '')}
            onClick={() => { audio.setMusicEnabled(!audio.musicEnabled); redraw() }}
          >
            {audio.musicEnabled ? 'LIGADA' : 'DESLIGADA'}
          </button>
        </label>

        <label className="opt">
          <span className="opt-name">VOLUME DA MUSICA</span>
          <span className="opt-val">{Math.round(audio.music_ * 100)}</span>
          <input
            type="range" min={0} max={100}
            value={Math.round(audio.music_ * 100)}
            disabled={!audio.musicEnabled}
            onChange={(e) => { audio.setMusicVolume(Number(e.target.value) / 100); redraw() }}
          />
        </label>

        <label className="opt">
          <span className="opt-name">VOLUME DOS SONS</span>
          <span className="opt-val">{Math.round(audio.sfx * 100)}</span>
          <input
            type="range" min={0} max={100}
            value={Math.round(audio.sfx * 100)}
            onChange={(e) => { audio.setSfxVolume(Number(e.target.value) / 100); redraw() }}
          />
        </label>

        <Pill tone="olive" className="btn-row" onClick={onBack}>
          VOLTAR
        </Pill>
      </Panel>
    </div>
  )
}

/** The controls, on their own screen instead of crowding the front door. */
export function Controls({ onBack }: { onBack: () => void }) {
  return (
    <div className="overlay">
      <Panel skin="bamboo" className="menu small" scale={4}>
        <h2 className="title sm">CONTROLES</h2>
        <dl className="keys">
          <dt>WASD / setas</dt><dd>andar</dd>
          <dt>mouse</dt><dd>o revólver atira sozinho — mas só onde você aponta</dd>
          <dt>ESPAÇO</dt><dd>dash, com alguns quadros de invulnerabilidade</dd>
          <dt>Q</dt><dd>teleporte pra onde o mouse aponta</dd>
          <dt>E</dt><dd>trocar de munição</dd>
          <dt>ESC</dt><dd>pausar</dd>
          <dt>celular</dt><dd>arraste em qualquer lugar pra andar</dd>
        </dl>
        <Pill tone="olive" className="btn-row" onClick={onBack}>
          VOLTAR
        </Pill>
      </Panel>
    </div>
  )
}

/**
 * The level-up screen.
 *
 * Two things have to be legible here beyond the card art, because the build is
 * capped now and a player who cannot see the cap will not understand why the
 * deck stopped offering them new things:
 *
 *   - the RARITY, so a legendary reads as a moment rather than as a third
 *     option, and so taking Sorte visibly changes what turns up; and
 *   - the SLOT it spends. A card you already own says how deep it goes; a new
 *     one says which of your four it is about to take, and says so in the
 *     danger colour when it is the last one.
 */
export function LevelUp(
  { s, onPick, onReroll }:
  { s: Snapshot; onPick: (id: string) => void; onReroll: () => void },
) {
  const used = (kind: string) => (kind === 'power' ? s.slots.power : s.slots.stat)
  const cap = (kind: string) => (kind === 'power' ? s.slots.powerMax : s.slots.statMax)

  return (
    <div className="overlay">
      <div className="levelup">
        <h2 className="lvl-title">NÍVEL {s.level}</h2>
        <div className="slotbar">
          <span>PODERES <b>{s.slots.power}/{s.slots.powerMax}</b></span>
          <span>ATRIBUTOS <b>{s.slots.stat}/{s.slots.statMax}</b></span>
          {/*
            * SPENT OVER TOTAL, in the row that already reads that way.
            *
            * It was three pips beside the button, which put a second scoreboard
            * on the screen in a second visual language. This is the same fact
            * in the same shape as the two counters next to it — the player
            * already knows how to read "0/3" here, and the button is left to
            * be a button.
            */}
          <span className={'rr' + (s.rerolls <= 0 ? ' out' : '')}>
            REROLAGENS <b>{REROLLS - s.rerolls}/{REROLLS}</b>
          </span>
          {s.luck > 0 && <span className="lucky">SORTE <b>{s.luck}</b></span>}
        </div>
        {/*
          * KEYED ON THE COUNT, so React throws the three cards away and builds
          * new ones every time one is spent. That remount is what replays the
          * deal animation in the stylesheet — a CSS animation on an element
          * React merely UPDATED does not restart, which is why a reroll used
          * to swap three names with no motion at all.
          */}
        <div className="cards" key={s.rerolls}>
          {s.offers.map((o) => {
            const slotted = o.kind === 'power' || o.kind === 'stat'
            const isNew = slotted && o.owned === 0
            const last = isNew && used(o.kind) === cap(o.kind) - 1
            /*
             * A CARD THAT WILL COST YOU ANOTHER ONE SAYS SO, ON THE CARD.
             *
             * With the power bar full this used to read "OCUPA UMA VAGA",
             * which is not true — there is no vaga. The player picked what
             * looked like an ordinary card and was ambushed by a screen asking
             * which of their six to give up, and "being forced to replace a
             * power" is what that feels like from the other side. It was never
             * forced; it was unannounced.
             */
            const willSwap = isNew && o.kind === 'power' && used('power') >= cap('power')
            return (
              <button
                key={o.id}
                className={'card rar-' + o.rarity}
                style={panelStyle('tan', 2)}
                onClick={() => onPick(o.id)}
              >
                <span className="card-rarity">{RARITY_LABEL[o.rarity]}</span>
                <PixelIcon className="card-icon" src={o.icon} glyph={o.glyph} size={64} />
                <span className="card-name">{o.name}</span>
                <span className="card-desc">{o.desc}</span>
                {o.owned > 0 && <span className="card-slot have">JÁ TEM ×{o.owned}</span>}
                {isNew && (
                  <span className={'card-slot' + (last || willSwap ? ' last' : '')}>
                    {willSwap ? 'TROCA UM PODER' : last ? 'ÚLTIMA VAGA' : 'OCUPA UMA VAGA'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/*
          * THREE HANDS A RUN MAY REFUSE.
          *
          * Under the cards rather than beside them: it is the answer to a
          * question the three cards just asked, so it has to be read after
          * them. How many are left is in the slot row above, with the other
          * two things this screen is counting.
          *
          * It STAYS ON SCREEN at zero, greyed. Removing it would make the
          * screen change shape between levels, and a control that vanishes
          * reads as a bug rather than as something spent.
          */}
        <div className="reroll">
            <Pill
              className="btn-row keep"
            onClick={onReroll}
            disabled={s.rerolls <= 0}
          >
            REROLAR
            </Pill>
        </div>
      </div>
    </div>
  )
}

/**
 * WHAT DO YOU GIVE UP?
 *
 * Shown when a power is taken with all six slots spent. The incoming card sits
 * on its own above the six it could replace, because the question is "instead
 * of which of these" and the screen should read as that sentence.
 *
 * Walking away has to be possible, or the prompt is a trap rather than a
 * choice — so the last control keeps the build exactly as it stands.
 */
export function SwapPower(
  { s, onSwap }: { s: Snapshot; onSwap: (id: string | null) => void },
) {
  const swap = s.swap
  if (!swap) return null

  return (
    <div className="overlay">
      <div className="levelup swap">
        <h2 className="lvl-title">TROCAR PODER</h2>
        <div className="slotbar">
          <span>PODERES <b>{s.slots.power}/{s.slots.powerMax}</b> — cheio</span>
        </div>

        <div className="cards">
          <button
            className={'card incoming rar-' + swap.incoming.rarity}
            style={panelStyle('tan', 2)}
            disabled
          >
            <span className="card-rarity">{RARITY_LABEL[swap.incoming.rarity]}</span>
            <PixelIcon className="card-icon" src={swap.incoming.icon} glyph={swap.incoming.glyph} size={64} />
            <span className="card-name">{swap.incoming.name}</span>
            <span className="card-desc">{swap.incoming.desc}</span>
            <span className="card-slot last">ENTRANDO</span>
          </button>
        </div>

        <p className="swap-ask">No lugar de qual?</p>

        <div className="cards swap-grid">
          {swap.owned.map((o) => (
            <button
              key={o.id}
              className={'card small rar-' + o.rarity}
              style={panelStyle('tan', 2)}
              onClick={() => onSwap(o.id)}
            >
              <PixelIcon className="card-icon sm" src={o.icon} glyph={o.glyph} size={40} />
              <span className="card-name">{o.name}</span>
              <span className="card-slot have">NÍVEL {o.owned}</span>
            </button>
          ))}
        </div>

        {/*
          * AND THE WAY OUT SAYS WHAT IT COSTS, WHICH IS NOTHING.
          *
          * The button was here all along and read "DEIXA PRA LÁ" with no
          * explanation, so from the player's chair the screen looked like a
          * demand rather than an offer. It returns to the other two cards with
          * the build untouched; saying so is the whole difference between a
          * prompt and a trap.
          */}
        <Pill className="btn-row keep" onClick={() => onSwap(null)}>
          DEIXA PRA LÁ
        </Pill>
        <p className="swap-out">Volta pras outras cartas. Não perde nada.</p>
      </div>
    </div>
  )
}

const RARITY_LABEL: Record<string, string> = {
  comum: 'COMUM',
  incomum: 'INCOMUM',
  raro: 'RARO',
  lendario: 'LENDÁRIO',
}

export function Paused(
  { onResume, onRestart, onOpen }: {
    onResume: () => void
    onRestart: () => void
    onOpen: (s: Screen) => void
  },
) {
  return (
    <div className="overlay">
      <Panel skin="bamboo" className="menu small" scale={4}>
        <h2 className="title sm">PAUSA</h2>
        <div className="menu-actions">
          <Pill tone="olive" onClick={onResume}>CONTINUAR</Pill>
          <Pill onClick={() => onOpen('settings')}>OPÇÕES</Pill>
          <Pill onClick={() => onOpen('controls')}>CONTROLES</Pill>
          <Pill tone="brown" className="pill-danger" onClick={onRestart}>RECOMEÇAR</Pill>
        </div>
      </Panel>
    </div>
  )
}

/**
 * DOWN, WITH A REVIVA IN THE BANK.
 *
 * Deliberately not a panel. Every other overlay in the game is a bamboo sign
 * with a title and some prose on it, and putting one here would file dying
 * alongside pausing — the screen behind this has already said everything: the
 * colour is gone, there is blood where he was standing, and nothing is moving.
 * One button, in the middle, in the same brass the front door uses.
 *
 * It arrives late on purpose. `REVIVE.prompt` is the beat the player spends
 * watching themselves come apart, and a button offered during it gets pressed
 * reflexively by somebody who has not yet understood what happened — which was
 * the entire complaint about the version this replaces.
 */
export function Downed({ s, onRevive }: { s: Snapshot; onRevive: () => void }) {
  if (s.downedT < 0.75) return null
  return (
    <div className="overlay downed">
      <div className="downed-in">
        <p className="downed-tag">VOCÊ TOMBOU</p>
        <Pill tone="olive" onClick={onRevive}>VOLTAR À VIDA</Pill>
        <p className="downed-left">
          {s.revives > 1 ? s.revives - 1 + ' de sobra' : 'Última'}
        </p>
      </div>
    </div>
  )
}

/**
 * WHAT THE RUN WAS.
 *
 * One screen for both endings, because they are the same screen with a
 * different headline: twenty minutes happened, here is what it was, here is
 * what you are called for having played it that way, and here is the button
 * that starts another one.
 *
 * WHY THIS AND NOT A KILL COUNT. The old end screen said tempo, abatidos and
 * nível @ three numbers, none of which distinguishes one run from another. A
 * player who never missed and a player who sprayed the caatinga got the same
 * card. Everything on this screen is either a decision they made or a
 * consequence of one, and the title at the top is the game telling them which
 * of those it noticed. See `game/data/record`.
 *
 * The summary is FROZEN by the engine at the moment the run ended and simply
 * read here. Nothing on this screen recomputes anything: the game is still
 * running underneath it, and a number that drifts while you are reading it is
 * worse than no number.
 */
export function RunEnd(
  { s, onRestart }: { s: Snapshot; onRestart: () => void },
) {
  const r = s.summary
  const [saved, setSaved] = useState<
    '' | 'copiado' | 'copiado-texto' | 'copiando' | 'salvo' | 'erro' | 'gerando'
  >('')
  const best = useMemo(() => (r ? saveBest(r) : false), [r])

  // No summary means an ending that predates one; fall back to the old card.
  if (!r) {
    return (
      <div className="overlay">
        <Panel skin="bamboo" className="menu small" scale={4}>
          <h2 className="title sm danger">VOCÊ TOMBOU</h2>
          <Pill tone="olive" className="btn-row" onClick={onRestart}>DE NOVO</Pill>
        </Panel>
      </div>
    )
  }

  /*
   * TWO WAYS OUT OF THE PAGE.
   *
   * Copy is the one people actually use @ it goes straight into whatever they
   * were going to paste it into. The download is for keeping. Both fail soft
   * and say so: the clipboard needs a permission that some browsers refuse,
   * and refusing silently would look like the button doing nothing.
   */
  /*
   * COPIAR PUTS THE PICTURE ON THE CLIPBOARD, not the text.
   *
   * The text version went into a group chat as a wall of monospace that most
   * clients reflow into nonsense anyway. What the player wants to paste is
   * the same poster the SALVAR button writes — one image, straight into
   * WhatsApp or Discord, no file round-trip.
   *
   * THE PROMISE GOES INTO `ClipboardItem`, NOT THE BLOB. Drawing the card
   * takes about a second, and awaiting it first would put the write outside
   * the click's user-gesture window — which Safari refuses outright. Handing
   * `ClipboardItem` the unresolved promise is the supported way to say "this
   * is coming, hold the gesture open".
   *
   * The text is still the fallback. A browser with no `ClipboardItem` (or one
   * that refuses image writes) gets the old behaviour rather than an error,
   * and the note says which one it did.
   */
  const text = summaryText(r)
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setSaved('copiado-texto')
    } catch { setSaved('erro') }
  }
  const copy = async () => {
    setSaved('copiando')
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      await copyText()
      return
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': runCardBlob(r).then((b) => {
            if (!b) throw new Error('nao desenhou')
            return b
          }),
        }),
      ])
      setSaved('copiado')
    } catch { await copyText() }
  }

  /*
   * IT SAVES AS A PICTURE.
   *
   * It used to save as a .txt, which is a file nobody opens twice and nobody
   * can post. The PNG is drawn from the same summary by `runCard` — same
   * title, same figures, same card art — so what lands in the downloads
   * folder is the thing that was on screen, at a size worth looking at.
   *
   * The drawing is asynchronous (the font and the icons both have to be
   * ready), so the button says so while it works. Half a second of a dead
   * button is how a working feature reads as broken.
   */
  const download = async () => {
    setSaved('gerando')
    const blob = await runCardBlob(r)
    if (!blob) { setSaved('erro'); return }
    try {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = runCardName(r)
      a.click()
      // Revoked on the next tick rather than immediately: some browsers have
      // not started reading the blob by the time `click()` returns.
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      setSaved('salvo')
    } catch { setSaved('erro') }
  }

  const pct = Math.round(r.accuracy * 100)
  return (
    <div className="overlay">
      <div className="runend">
        {/* Not one fixed line any more. See `VERDICTS` in data/record. */}
        <p className={'runend-verdict' + (r.won ? ' win' : '')}>{r.verdict}</p>

        {/* The title is the loudest thing on the screen, because it is the
            one thing here the player did not already know. */}
        <h2 className="runend-title">{r.title}</h2>
        <p className="runend-why">{r.why}</p>
        {best && <p className="runend-best">MELHOR CORRIDA ATÉ AGORA</p>}

        <div className="runend-grid">
          <Fig k="TEMPO" v={clockOf(r.seconds)} />
          <Fig k="ABATIDOS" v={String(r.kills)} />
          <Fig k="NÍVEL" v={String(r.level)} />
          <Fig k="PRECISÃO" v={pct + '%'} />
          <Fig k="RITMO" v={Math.round(r.pace) + '/min'} />
          <Fig k="DISTÂNCIA" v={r.distance + 'm'} />
          <Fig k="DANO" v={short(r.stats.damage)} />
          <Fig k="MAIOR GOLPE" v={short(r.stats.bestHit)} />
          <Fig k="GRANDES" v={String(r.stats.miniBosses)} />
          <Fig k="TIROS" v={String(r.stats.shots)} />
          <Fig k="SEM ENCOSTAR" v={clockOf(r.stats.bestStreak)} />
          <Fig k="TOMBOS" v={String(r.deaths)} />
          <Fig k="CURA" v={short(r.stats.healed)} />
          <Fig k="SOFRIDO" v={short(r.stats.taken)} />
          <Fig k="ABDUZIDO" v={r.stats.escaped + '/' + r.stats.grabbed} />
        </div>

        {r.bosses.length > 0 && (
          <div className="runend-sec">
            <p className="runend-h">CHEFES</p>
            <div className="runend-medals">
              {r.bosses.map((b) => <span className="medal boss" key={b}>{b}</span>)}
            </div>
          </div>
        )}

        {/*
          * THE BUILD, AS THE TILES HE PICKED.
          *
          * It was a paragraph of comma-separated names, which is the one part
          * of the run the player experienced entirely as pictures: every card
          * here was chosen off a 32px tile on the level-up screen. Showing the
          * names alone made the summary the only screen in the game that
          * described the build instead of showing it.
          *
          * Three groups because they are three different kinds of decision @
          * what he can DO, what he SHOOTS, and what quietly got bigger @ and
          * the names stay underneath, since two abilities can look alike at
          * this size.
          */}
        <Cards head="PODERES" rows={r.build.filter((b) => b.kind === 'power' || b.kind === 'special')} />

        {r.ammo.length > 0 && (
          <div className="runend-sec build-sec">
            <p className="runend-h">MUNIÇÃO</p>
            <div className="runend-tiles">
              {r.ammo.map((a) => (
                <span className="rtile raro" key={a.id} title={a.name}>
                  <PixelIcon src={a.icon} glyph="●" size={30} />
                </span>
              ))}
            </div>
            <p className="runend-list">{r.ammo.map((a) => a.name).join('  ·  ')}</p>
          </div>
        )}

        <Cards head="MELHORIAS" rows={r.build.filter((b) => b.kind === 'stat')} />

        {r.medals.length > 0 && (
          <div className="runend-sec">
            <p className="runend-h">MEDALHAS</p>
            <div className="runend-medals">
              {r.medals.map((m) => <span className="medal" key={m}>{m}</span>)}
            </div>
          </div>
        )}

        <div className="runend-actions">
          <Pill tone="olive" onClick={onRestart}>DE NOVO</Pill>
          <Pill onClick={copy}>
            {saved === 'copiando' ? 'COPIANDO…' : 'COPIAR IMAGEM'}
          </Pill>
          <Pill onClick={download}>
            {saved === 'gerando' ? 'GERANDO…' : 'SALVAR PNG'}
          </Pill>
        </div>
        <p className="runend-note">
          {saved === 'copiado' ? 'Imagem copiada. Cola onde quiser.'
            : saved === 'copiado-texto' ? 'O navegador não copia imagem. Copiei o texto.'
            : saved === 'copiando' ? 'Desenhando o cartaz…'
            : saved === 'gerando' ? 'Desenhando o cartaz…'
            : saved === 'salvo' ? 'Salvo como imagem. Tá na pasta de downloads.'
            : saved === 'erro' ? 'O navegador não deixou.'
            : ' '}
        </p>
      </div>
    </div>
  )
}

/**
 * ONE GROUP OF CARDS: the tiles, then their names.
 *
 * Renders nothing at all when the group is empty @ a heading over an empty
 * row reads as art that failed to load rather than as a build that did not
 * take any of that kind.
 */
function Cards({ head, rows }: { head: string; rows: BuildItem[] }) {
  if (!rows.length) return null
  return (
    <div className="runend-sec build-sec">
      <p className="runend-h">{head}</p>
      <div className="runend-tiles">
        {rows.map((b) => (
          <span className={'rtile ' + b.rarity} key={b.id} title={b.name}>
            <PixelIcon src={b.icon} glyph={b.glyph} size={30} />
            {b.stacks > 1 && <i className="rtile-n">×{b.stacks}</i>}
          </span>
        ))}
      </div>
      <p className="runend-list">
        {rows.map((b) => b.name + (b.stacks > 1 ? ' ×' + b.stacks : '')).join('  ·  ')}
      </p>
    </div>
  )
}

/** One figure in the grid. */
function Fig({ k, v }: { k: string; v: string }) {
  return (
    <div className="fig">
      <span className="fig-k">{k}</span>
      <span className="fig-v">{v}</span>
    </div>
  )
}

/** 12400 reads worse than 12.4k on a card this size. */
function short(n: number): string {
  const v = Math.round(n)
  if (v < 10000) return String(v)
  if (v < 1000000) return (v / 1000).toFixed(1).replace('.0', '') + 'k'
  return (v / 1000000).toFixed(1).replace('.0', '') + 'M'
}


/**
 * THE FIRST THING ANYBODY SEES.
 *
 * It counts the art and every audio file together as one bar — the player has
 * no reason to know that half of what they are waiting on is wav. The point of
 * waiting for the audio is that the menu theme is fetched and sitting in
 * memory by the time the menu appears, so it starts the instant the browser
 * allows it rather than several seconds into the screen.
 *
 * Nothing to press. It loads, and then the game is there.
 */
export function Loading({ progress = 0 }: { progress?: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100)
  return (
    <div className="overlay boot">
      <div className="boot-in">
        <p className="boot-kicker">FLORIANO, PIAUÍ</p>
        <h1 className="boot-title">SOUL</h1>
        <div className="boot-bar">
          <div className="boot-fill" style={{ width: pct + '%' }} />
        </div>
        <p className="boot-note">carregando Floriano… {pct}%</p>
      </div>
      <p className="studio">INDIGENA STUDIOS</p>
    </div>
  )
}
