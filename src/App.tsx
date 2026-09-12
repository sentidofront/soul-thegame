import { useCallback, useEffect, useRef, useState } from 'react'
import { Game } from './game/Game'
import type { Snapshot } from './game/types'
import { HUD } from './ui/HUD'
import {
  Controls, Downed, LevelUp, Loading, MainMenu, Paused, RunEnd, Settings, SwapPower,
  type Screen,
} from './ui/Overlays'

/**
 * React owns the shell: the canvas element, the menus, the HUD. It does not
 * own a single pixel of the game. The engine writes a small snapshot object
 * roughly fifteen times a second and that is the entire data flow between them.
 */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 0..1 across the art and the audio together. See `Game.init`. */
  const [loaded, setLoaded] = useState(0)

  /** Options / controls, layered over whatever is underneath. */
  const [screen, setScreen] = useState<Screen>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false

    const game = new Game(canvas)
    gameRef.current = game
    game.init(
      (s) => { if (!disposed) setSnap(s) },
      (k) => { if (!disposed) setLoaded(k) },
    ).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e))
    })

    return () => { disposed = true; game.dispose(); gameRef.current = null }
  }, [])

  const start = useCallback(() => { setScreen(null); gameRef.current?.startRun() }, [])

  const closeScreen = useCallback(() => setScreen(null), [])
  const resume = useCallback(() => gameRef.current?.togglePause(), [])
  const pick = useCallback((id: string) => gameRef.current?.chooseUpgrade(id), [])
  const reroll = useCallback(() => gameRef.current?.rerollUpgrades(), [])
  const swap = useCallback((id: string | null) => gameRef.current?.resolveSwap(id), [])
  /*
   * The HUD's buttons, wired straight into the same input struct the keyboard
   * writes to. React does not learn anything about what the keys mean.
   */
  const press = useCallback(
    (k: string, dir?: { x: number; y: number } | null) => gameRef.current?.input.press(k, dir),
    [],
  )

  return (
    <div className="app">
      <canvas ref={canvasRef} className="stage" />

      {error && <div className="overlay"><div className="loading">{error}</div></div>}
      {!error && !snap && <Loading progress={loaded} />}

      {/*
        The HUD is gone for the ending. Health, ammo and a boss bar over a
        close-up of a dying alien would be the game refusing to stop being a
        game at the one moment it should.
      */}
      {snap && snap.phase !== 'menu' && snap.phase !== 'ending' && !snap.cine
        && snap.phase !== 'downed' && snap.phase !== 'dead' && snap.phase !== 'won'
        && <HUD s={snap} onPress={press} onPause={resume} />}
      {snap && snap.phase === 'menu' && (
        <MainMenu onStart={start} onOpen={setScreen} assets={gameRef.current?.assets ?? null} />
      )}
      {snap && snap.phase === 'levelup' && <LevelUp s={snap} onPick={pick} onReroll={reroll} />}
      {snap && snap.phase === 'swap' && snap.swap && <SwapPower s={snap} onSwap={swap} />}
      {snap && snap.phase === 'paused' && (
        <Paused onResume={resume} onRestart={start} onOpen={setScreen} />
      )}
      {snap && snap.phase === 'downed' && (
        <Downed s={snap} onRevive={() => gameRef.current?.standUp()} />
      )}
      {/* One screen for both endings; the summary says which. */}
      {snap && (snap.phase === 'dead' || snap.phase === 'won')
        && <RunEnd s={snap} onRestart={start} />}

      {/* Layered last so options sit over the menu or the pause screen. */}
      {screen === 'settings' && gameRef.current && (
        <Settings audio={gameRef.current.audio} onBack={closeScreen} />
      )}
      {screen === 'controls' && <Controls onBack={closeScreen} />}
    </div>
  )
}
