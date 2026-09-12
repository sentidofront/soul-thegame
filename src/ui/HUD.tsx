import { useRef, useState } from 'react'
import type { Snapshot } from '../game/types'
import { PixelIcon } from './PixelIcon'

function clock(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return m + ':' + String(s).padStart(2, '0')
}

/**
 * A BUTTON YOU CAN AIM.
 *
 * Dash and Teleporte both ask "which way", and on a phone there is no cursor
 * to answer with and no spare thumb — the other one is holding the stick, and
 * letting go of it to point is exactly the moment you did not want to stop
 * moving. So the button is the aim: press it, drag, let go, and the drag is
 * the direction. A press with no drag is a plain tap and falls back to the
 * usual rule (stick if moving, otherwise away from whatever the gun is on).
 *
 * FIRES ON RELEASE, not on press, which is the one cost. It has to: the drag
 * has not happened yet at the moment the finger lands. Everything without a
 * direction — Cálice, the ammo swap — stays on press, where it belongs.
 */
const AIM_DEAD = 14
/** The keys whose abilities go somewhere, and so can be pointed. */
const AIMABLE = new Set([' ', 'q'])

/**
 * A TENTH OF A SECOND OF VIBRATION, on the phones that will.
 *
 * A physical button answers your thumb before anything on screen does, and a
 * pane of glass answers nothing at all @ which is most of why touch controls
 * feel worse than they look. Twelve milliseconds is under the threshold where
 * it registers as a buzz and over the one where it registers as CONTACT.
 *
 * `vibrate` does not exist on iOS and is refused on a page nobody has
 * interacted with, so this is wrapped and its failure is not interesting.
 */
function buzz() {
  try { navigator.vibrate?.(12) } catch { /* not every phone, not every browser */ }
}

function AimButton(
  { press, label, onPress, className, style, children }: {
    press: string
    label: string
    onPress: (key: string, dir?: { x: number; y: number } | null) => void
    className: string
    style?: React.CSSProperties
    children: React.ReactNode
  },
) {
  const from = useRef<{ x: number; y: number } | null>(null)
  const [aim, setAim] = useState<number | null>(null)

  return (
    <button
      className={className + (aim !== null ? ' tap-aiming' : '')}
      style={style}
      aria-label={label}
      onPointerDown={(e) => {
        from.current = { x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
        buzz()
      }}
      onPointerMove={(e) => {
        const f = from.current
        if (!f) return
        const dx = e.clientX - f.x
        const dy = e.clientY - f.y
        setAim(Math.hypot(dx, dy) > AIM_DEAD ? Math.atan2(dy, dx) : null)
      }}
      onPointerUp={(e) => {
        const f = from.current
        from.current = null
        setAim(null)
        if (!f) return
        const dx = e.clientX - f.x
        const dy = e.clientY - f.y
        const d = Math.hypot(dx, dy)
        // Screen down is world down, so the vector goes straight through.
        onPress(press, d > AIM_DEAD ? { x: dx / d, y: dy / d } : null)
      }}
      onPointerCancel={() => { from.current = null; setAim(null) }}
    >
      {children}
      {aim !== null && (
        <span
          className="tap-arrow"
          style={{ transform: `rotate(${aim}rad)` }}
          aria-hidden="true"
        />
      )}
    </button>
  )
}

/**
 * Pure presentation over the engine snapshot. It re-renders ~15 times a second,
 * never per frame, which is why none of this is on the canvas.
 *
 * ALMOST pure: on a phone it is also the controls. `onPress` sends a keycode
 * straight into `Input` — see `Input.press` — so an on-screen button and a
 * keyboard arrive at the same place and no gameplay code has to care which
 * one happened. `onPause` is separate only because pausing is not a key the
 * simulation reads; it is a thing done to the loop from outside it.
 */
export function HUD(
  { s, onPress, onPause }: {
    s: Snapshot
    onPress: (key: string, dir?: { x: number; y: number } | null) => void
    onPause: () => void
  },
) {
  const hpPct = Math.max(0, (s.hp / s.maxHp) * 100)
  const xpPct = Math.max(0, Math.min(100, (s.xp / s.xpToNext) * 100))

  return (
    <div className={'hud' + (s.touch ? ' hud-touch' : '')}>
      {/*
        THE STRUGGLE PROMPT.
        Deliberately the loudest thing the HUD ever draws: it takes over the
        middle of the screen, because a quick-time event the player does not
        notice in time is not a mechanic, it is damage. The next key is shown
        alone and huge — telling someone to "mash A and D" while they panic is
        worse than telling them which one comes next.
      */}
      {s.grab && (
        <div className="grab">
          <p className="grab-title">SOLTA!</p>
          {/*
            ON A PHONE THESE ARE BUTTONS, and they have to be — a grab with no
            way to answer it is not a quick-time event, it is a delay before
            damage. Same two targets, same alternation, same prompt; the only
            difference is whether you press them with a finger or a key.
          */}
          <div className="grab-keys">
            <button
              className={'grab-key' + (s.grab.next === 'a' ? ' hot' : '')}
              onPointerDown={s.touch ? () => onPress('a') : undefined}
              disabled={!s.touch}
            >A</button>
            <button
              className={'grab-key' + (s.grab.next === 'd' ? ' hot' : '')}
              onPointerDown={s.touch ? () => onPress('d') : undefined}
              disabled={!s.touch}
            >D</button>
          </div>
          <div className="grab-bar">
            <div className="grab-fill" style={{ width: Math.min(100, s.grab.progress * 100) + '%' }} />
          </div>
        </div>
      )}
      <div className="hud-top">
        <div className="hud-left">
          <div className="bar bar-hp">
            <div className="bar-fill" style={{ width: hpPct + '%' }} />
            <span className="bar-label">{Math.ceil(s.hp)} / {s.maxHp}</span>
          </div>
          <div className="lvl">NÍVEL {s.level}</div>
          {/*
            Sorte only appears once you have some. A stat line reading "0" is
            a permanent reminder of a thing you do not have; the same line
            arriving the moment you take the card reads as the card working.
          */}
          {s.luck > 0 && (
            <div className="luck" title="Sorte: melhora as cartas, os críticos e os drops">
              ☘ {s.luck} <span className="luck-crit">{Math.round(s.critChance * 100)}% crít</span>
            </div>
          )}
          {/*
            Absorb charges are a resource you spend, not a timer you wait out,
            so they are drawn as things you can count and watch disappear.
          */}
          {s.absorb > 0 && (
            <div className="absorb" title="Escudo Alien: cada carga come uma pancada">
              {Array.from({ length: s.absorb }, (_, i) => <i key={i} />)}
            </div>
          )}
          {/*
            Whatever the dice just did to him. Curses read in red, and they are
            here rather than only in a floater because a jammed revolver is
            something you need to be able to check, not something you needed to
            have been looking at the moment it happened.
          */}
          {s.effects.length > 0 && (
            <div className="fx">
              {s.effects.map((e) => (
                <span key={e.id} className={'fx-tag' + (e.good ? '' : ' bad')}>
                  {e.label} <b>{Math.ceil(e.t)}s</b>
                </span>
              ))}
            </div>
          )}
        </div>

        {/*
          Once the barrier closes, the journey read-out is both finished and in
          the way — it sits exactly where the church facade is. The boss bar at
          the bottom carries everything the player still needs.
        */}
        {/*
          While the act card is up it is already saying the act's name in
          letters three times this size. Two copies of the same words, one on
          top of the other, is just clutter.
        */}
        <div className="hud-center">
          {!s.banner && <div className="stage-name">{s.stageName}</div>}
          {!s.boss && (
            <>
              <div className="road">
                <div className="road-fill" style={{ width: s.stageProgress * 100 + '%' }} />
                <span className="road-icon" style={{ left: s.stageProgress * 100 + '%' }}>▲</span>
              </div>
              <div className="stage-sub">{s.stageSubtitle}</div>
            </>
          )}
        </div>

        <div className="hud-right">
          {/*
            No ESC on a phone, so the one control that is not part of playing
            has to be visible. Next to the clock rather than off on its own,
            because that corner is already where you look for "how am I doing".
          */}
          {s.touch && (
            <button className="tap-pause" onClick={onPause} aria-label="Pausar">II</button>
          )}
          <div className="stat big">{clock(s.time)}</div>
          <div className="stat">☠ {s.kills}</div>
          <div className="stat dim">{s.enemies} inimigos · {s.fps} fps</div>
        </div>
      </div>

      {/*
        WHAT THE GAME IS ASKING FOR, when it is not "survive".

        Act three is the first part of the game with objectives that a health
        bar cannot express — clear the room before the clock, break those three
        pillars — so they are said in words. It sits just above the boss bar
        because that is where the player is already looking, and it goes red
        when the answer is running out of time.
      */}
      {s.objective && (
        <div className={'objective' + (s.objective.urgent ? ' urgent' : '')}>
          <span className="objective-label">{s.objective.label}</span>
          <span className="objective-value">{s.objective.value}</span>
        </div>
      )}

      {s.boss && (
        <div className="bossbar">
          <div className="bossbar-name">
            {s.boss.name}
            {/*
              Pips for bars still to empty. A boss that gets back up is only
              a good surprise the first time; after that the player deserves
              to know it is coming and to pace the fight around it.
            */}
            {s.boss.bars > 1 && (
              <span className="bossbar-pips">
                {Array.from({ length: s.boss.bars }, (_, i) => (
                  <i key={i} className={i < s.boss!.barsLeft ? 'on' : ''} />
                ))}
              </span>
            )}
          </div>
          <div className="bar bar-boss">
            <div className="bar-fill" style={{ width: (s.boss.hp / s.boss.maxHp) * 100 + '%' }} />
          </div>
        </div>
      )}

      {s.banner && (
        <div className="banner" key={s.banner.title} style={{ opacity: bannerAlpha(s.banner.t) }}>
          <div className="banner-title">{s.banner.title}</div>
          <div className="banner-sub">{s.banner.subtitle}</div>
        </div>
      )}

      {/*
        THE RACK: what he is carrying, and which one is chambered. A display,
        not a control — on a phone the swap is a proper button in the action
        bar and this whole corner is hidden, because the bar is standing in it.
      */}
      {s.ammo.length > 1 && (
        <div className="ammo">
          {s.ammo.map((a) => (
            <div key={a.id} className={'ammo-slot' + (a.loaded ? ' ammo-on' : '')} title={a.name}>
              <PixelIcon src={a.icon} glyph="●" size={26} />
            </div>
          ))}
          <span className="ammo-hint">E</span>
        </div>
      )}

      {/*
        THE BUILD, all of it, in ONE place.

        There were two strips here: cards that tick in the bottom-left corner,
        everything else in the bottom-right. That split one build across the
        screen and made owning a card mean two different things depending on
        which corner it landed in — and it asked the player to check two places
        to answer one question. So: one strip, deck order, every card the same
        tile. The ones that do something on a timer wear a cooldown and, if
        there is something to press, the key to press.
      */}
      {s.build.length > 0 && (
        <div className="build">
          {s.build.map((b) => (
            <div
              key={b.id}
              className={
                'bs bs-' + b.kind + ' rar-' + b.rarity
                + (b.active ? ' bs-on' : '')
                + (b.ready !== undefined && b.ready >= 1 ? ' bs-ready' : '')
                /*
                  A CARD YOU PRESS IS NOT THE SAME OBJECT as a card that just
                  sits there being a number. It used to be — same tile, same
                  size, same corner — which is exactly how somebody owns a dash
                  for ten minutes without ever using it. The ones with a key
                  are bigger, brighter, and they breathe when they are ready.
                */
                + (b.press ? ' bs-act' : '')
                + (b.queued ? ' bs-queued' : '')
                + (b.fired ? ' bs-fired' : '')
              }
              /*
                THE TILE KICKS WHEN IT GOES OFF.
                Driven off the engine's own `fired` rather than a CSS animation
                keyed to a class, because the snapshot arrives fifteen times a
                second and a re-triggering animation would drop frames of it.
              */
              style={b.fired ? {
                transform: 'scale(' + (1 + b.fired * 0.22).toFixed(3) + ')',
                filter: 'brightness(' + (1 + b.fired * 0.9).toFixed(2) + ')',
              } : undefined}
              title={b.name}
            >
              <PixelIcon src={b.icon} glyph={b.glyph} size={28} />
              {/* Drains downward as the cooldown runs out; empty means now. */}
              {b.ready !== undefined && (
                <span className="bs-cd" style={{ height: (1 - b.ready) * 100 + '%' }} />
              )}
              {b.stacks > 1 && <span className="bs-n">{b.stacks}</span>}
              {/*
                WHAT TO PRESS, on the ones that need pressing.
                Everything else in a build fires itself, which makes it very
                easy to own a dash for ten minutes and never use it. Stamped on
                the icon rather than left in the controls screen, because the
                person who needs it is currently being chased.
              */}
              {b.key && !s.touch && <span className="bs-key">{b.key}</span>}
            </div>
          ))}
        </div>
      )}

      {/*
        THE ONE THING A PHONE WAS MISSING.

        Everything else in a build fires itself; these three are the ones that
        wait to be told, and on a touch device there was no way to tell them.
        Big targets, bottom right, under the thumb that is not driving — the
        left one is busy holding the stick wherever it was first put down.

        Sourced from the build rather than from a list of its own, so an
        ability that is not owned has no button, and taking Cálice mid-run
        grows one without anything here knowing what Cálice is.
      */}
      {s.touch && (s.ammo.length > 1 || s.build.some((b) => b.press)) && (
        <div className="tapbar">
          {/*
            CHANGING THE BULLET IS AN ACTION, so it is in the row of actions.
            The rack bottom-left goes on being the inventory — what you own and
            what is loaded — and this is the control, at the size everything
            else in this row is, under the thumb that is free.
          */}
          {s.ammo.length > 1 && (
            <button className="tap tap-ammo" onPointerDown={() => onPress('e')} aria-label="Trocar munição">
              <PixelIcon
                src={(s.ammo.find((x) => x.loaded) ?? s.ammo[0]).icon}
                glyph="●"
                size={48}
              />
              <span className="tap-swap">⟳</span>
            </button>
          )}
          {s.build.filter((b) => b.press).map((b) => {
            const cls = 'tap' + (b.ready !== undefined && b.ready >= 1 ? ' tap-ready' : '')
              + (b.active ? ' tap-on' : '')
            // The same kick the build tiles get, on the thing you actually hit.
            const kick = b.fired ? {
              transform: 'scale(' + (1 + b.fired * 0.14).toFixed(3) + ')',
              filter: 'brightness(' + (1 + b.fired * 0.8).toFixed(2) + ')',
            } : undefined
            const face = (
              <>
                <PixelIcon src={b.icon} glyph={b.glyph} size={48} />
                {b.ready !== undefined && (
                  <span className="tap-cd" style={{ height: (1 - b.ready) * 100 + '%' }} />
                )}
                {b.stacks > 1 && <span className="bs-n">{b.stacks}</span>}
              </>
            )
            // The two that move him can be aimed by dragging off the button.
            // Everything else is a tap, and fires the instant it is touched.
            return AIMABLE.has(b.press!)
              ? (
                <AimButton
                  key={b.id} press={b.press!} label={b.name}
                  onPress={onPress} className={cls} style={kick}
                >{face}</AimButton>
              )
              : (
                <button
                  key={b.id} className={cls} aria-label={b.name}
                  style={kick}
                  onPointerDown={() => { buzz(); onPress(b.press!) }}
                >{face}</button>
              )
          })}
        </div>
      )}

      <div className="xpbar">
        <div className="xpbar-fill" style={{ width: xpPct + '%' }} />
      </div>
    </div>
  )
}

/** Fade in over 0.4s, hold, fade out over the last second. */
function bannerAlpha(t: number) {
  if (t < 0.4) return t / 0.4
  if (t > 3.2) return Math.max(0, 1 - (t - 3.2))
  return 1
}
