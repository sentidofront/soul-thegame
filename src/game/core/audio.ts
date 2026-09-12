import {
  MUSIC, MUSIC_FALLBACK, SOUNDS, SOUND_VARIANTS, type MusicKey, type SoundKey,
} from '../data/audio'

/**
 * SOUND.
 *
 * A thin WebAudio layer, and it is WebAudio rather than a pile of <audio>
 * elements for one reason: this game kills four hundred things at once. Every
 * one-shot has to be a decoded buffer fired at a gain node, because cloning
 * media elements at that rate stutters and eventually runs the browser out of
 * decoders.
 *
 * THREE RULES keep four hundred deaths from becoming a wall of noise:
 *
 *   1. THROTTLE. Each sound has a minimum gap; a second request inside it is
 *      dropped rather than queued. Twelve cows dying on the same frame is one
 *      death sound, not twelve.
 *   2. VOICE CAP. Only so many of anything may overlap.
 *   3. PITCH JITTER. The same sample fired repeatedly at the same rate is what
 *      makes a game sound cheap, so every shot is nudged a few percent.
 *
 * Everything is lazy and everything fails soft. Browsers refuse to start audio
 * before the user has interacted, so the context is created on the first key
 * or click and any call before that is silently dropped — the game is entirely
 * playable with no sound at all, and nothing here ever throws into a frame.
 */

interface Voice {
  last: number
  live: number
}

/**
 * A PATH THE NETWORK WILL ACCEPT.
 *
 * The music folders are named by whoever made them, which means spaces,
 * brackets and — in O Chará's two tracks — an accented á. Handed to `fetch`
 * raw those either 404 or behave differently between the dev server and a
 * static host, and a track that will not fetch is a screen that plays nothing.
 * `encodeURI` escapes the path while leaving the slashes alone, so filenames
 * can stay exactly as they were delivered.
 */
const url = (src: string) => encodeURI(src)

export class AudioBus {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxGain: GainNode | null = null
  private musicGain: GainNode | null = null

  private buffers = new Map<string, AudioBuffer>()
  private voices = new Map<string, Voice>()

  private musicSource: AudioBufferSourceNode | null = null
  private musicNode: GainNode | null = null
  private currentMusic: MusicKey | null = null
  /** Asked for before the context existed; started on unlock. */
  private pendingMusic: MusicKey | null = null

  private started = false
  muted = false

  /** Volumes, 0..1. Restored from the last session. */
  private sfxVolume = 0.55
  private musicVolume = 0.32
  /** Seconds the track currently coming up takes to arrive. See `music`. */
  private lastFade = 1.2
  private pendingFade = 1.2
  private musicOn = true

  constructor() { this.load() }

  // ------------------------------------------------------------ SETTINGS --

  get sfx() { return this.sfxVolume }
  get music_() { return this.musicVolume }
  get musicEnabled() { return this.musicOn }

  setSfxVolume(v: number) {
    this.sfxVolume = clamp01(v)
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume
    this.save()
  }

  setMusicVolume(v: number) {
    this.musicVolume = clamp01(v)
    this.applyMusicGain()
    this.save()
  }

  setMusicEnabled(on: boolean) {
    this.musicOn = on
    this.applyMusicGain()
    this.save()
  }

  private applyMusicGain() {
    if (!this.musicGain) return
    this.musicGain.gain.value = this.musicOn ? this.musicVolume : 0
  }

  /**
   * Settings survive a reload, because being asked to turn the music down
   * every single time you open a game is its own small insult.
   */
  private save() {
    try {
      localStorage.setItem('soul.audio', JSON.stringify({
        sfx: this.sfxVolume, music: this.musicVolume, musicOn: this.musicOn,
      }))
    } catch { /* private windows and blocked storage are fine */ }
  }

  private load() {
    try {
      const raw = localStorage.getItem('soul.audio')
      if (!raw) return
      const v = JSON.parse(raw) as Partial<{ sfx: number; music: number; musicOn: boolean }>
      if (typeof v.sfx === 'number') this.sfxVolume = clamp01(v.sfx)
      if (typeof v.music === 'number') this.musicVolume = clamp01(v.music)
      if (typeof v.musicOn === 'boolean') this.musicOn = v.musicOn
    } catch { /* ignore */ }
  }

  /**
   * Wire the unlock to the first real interaction.
   *
   * Autoplay policy means an AudioContext created before a gesture starts
   * suspended, and a suspended context silently swallows everything. These
   * listeners remove themselves on first use.
   */
  attach(el: HTMLElement | Window) {
    const unlock = () => { void this.start() }
    const opts = { once: false, passive: true } as AddEventListenerOptions
    el.addEventListener('pointerdown', unlock, opts)
    el.addEventListener('keydown', unlock, opts)
    window.addEventListener('pointerdown', unlock, opts)
    window.addEventListener('keydown', unlock, opts)
  }

  async start(): Promise<void> {
    if (this.started) {
      // A context can be suspended again by the browser; nudge it back.
      if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {})
      return
    }
    this.started = true
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 1
      this.master.connect(ctx.destination)

      this.sfxGain = ctx.createGain()
      this.sfxGain.gain.value = this.sfxVolume
      this.sfxGain.connect(this.master)

      this.musicGain = ctx.createGain()
      this.musicGain.gain.value = this.musicOn ? this.musicVolume : 0
      this.musicGain.connect(this.master)

      await ctx.resume().catch(() => {})
      void this.preload()
      if (this.pendingMusic) {
        const m = this.pendingMusic
        this.pendingMusic = null
        this.music(m, this.pendingFade)
      }
    } catch {
      this.ctx = null
    }
  }

  /**
   * Fetch and decode everything, in the background.
   *
   * Nothing waits on this. A sound that has not finished decoding when it is
   * first asked for simply does not play, which is a far better failure than
   * holding up the first frame of the game for a megabyte of wav.
   */
  /**
   * THE BYTES, FETCHED BEFORE THERE IS ANYWHERE TO PUT THEM.
   *
   * An AudioContext cannot exist until the user has touched the page — that is
   * the autoplay policy and there is no way round it — so audio could not be
   * DECODED during loading however long the loading screen waited. Fetching is
   * not decoding, though, and `fetch` needs no context at all: the wav files
   * are pulled down while the art is loading and parked here as raw buffers.
   *
   * What that buys is the thing the loading screen is for. By the time anyone
   * touches the game every byte of the menu theme is already in memory, so it
   * starts on the gesture rather than several seconds after it.
   */
  private raw = new Map<string, ArrayBuffer>()
  /** True once every file has been FETCHED. Decoding still waits for a gesture. */
  fetched = false
  /**
   * IN-FLIGHT WORK, one entry per file, so twenty frames asking for the same
   * track while it is still coming down start one download rather than twenty.
   * An entry is dropped again once it settles, so a genuine retry stays
   * possible.
   */
  private inflight = new Map<string, Promise<void>>()
  /**
   * FILES THAT ARE NOT COMING. A 404, or bytes the browser will not decode —
   * `.ogg` on an old Safari, say. Recording them is what stops `music` from
   * re-requesting a missing track sixty times a second; a key in here resolves
   * through `MUSIC_FALLBACK` instead.
   */
  private failed = new Set<string>()
  /** How many takes of each family actually decoded. See `preload`. */
  private takes = new Map<string, number>()

  /**
   * PULL EVERY FILE DOWN, with no context and no decoding.
   *
   * Safe to call before the first gesture, and the loading screen does exactly
   * that. `onProgress` is how it draws a bar rather than a word.
   */
  async prefetch(onProgress?: (done: number, total: number) => void): Promise<void> {
    const [eager, rest] = this.fileList()
    let done = 0
    await Promise.all(eager.map(async ([key, src]) => {
      try {
        const res = await fetch(url(src))
        if (res.ok) this.raw.set(key, await res.arrayBuffer())
      } catch { /* a missing sound is not a crash */ }
      done++
      onProgress?.(done, eager.length)
    }))
    this.fetched = true

    /*
     * AND THE REST ARRIVES IN ITS OWN TIME.
     *
     * The soundtrack is about twenty megabytes across a dozen tracks, and
     * exactly one of them — the menu theme — is needed before anybody can do
     * anything. Waiting on the other eleven would put four hundred kilobytes
     * of gunshot behind twenty megabytes of music the player will not reach
     * for another ten minutes.
     *
     * So the bar above only counts what the first screen needs, and everything
     * else comes down behind it, unawaited. If a track somehow has not arrived
     * by the time the game asks for it, `music` waits for that ONE file rather
     * than for all of them.
     */
    void Promise.all(rest.map(([key, src]) => this.ensure(key, src)))
  }

  /**
   * FETCH AND DECODE ONE FILE, once, whoever asks and however often.
   *
   * Before the first gesture there is no context to decode into, so the bytes
   * are parked in `raw` and `preload` picks them up later. After it, this is
   * the whole path — and it is what lets a track that is still downloading be
   * waited on by itself.
   */
  private ensure(key: string, src: string): Promise<void> {
    if (this.buffers.has(key)) return Promise.resolve()
    const already = this.inflight.get(key)
    if (already) return already
    const couldDecode = !!this.ctx
    const job = (async () => {
      try {
        const bytes = this.raw.get(key)?.slice(0) ?? await (async () => {
          const res = await fetch(url(src))
          return res.ok ? await res.arrayBuffer() : null
        })()
        if (!bytes) return
        // No context yet: keep the bytes, decode them on the first gesture.
        if (!this.ctx) { this.raw.set(key, bytes); return }
        // `decodeAudioData` DETACHES what it is given, hence the copy above.
        this.buffers.set(key, await this.ctx.decodeAudioData(bytes))
      } catch { /* a missing sound is not a crash */ }
    })()
    this.inflight.set(key, job)
    void job.then(() => {
      this.inflight.delete(key)
      // A file that had somewhere to decode into and still produced nothing is
      // not late, it is absent. Anything asking for it goes to the stand-in.
      if (couldDecode && !this.buffers.has(key)) this.failed.add(key)
    })
    return job
  }

  /**
   * EVERY FILE, SPLIT INTO WHAT THE FIRST SCREEN NEEDS AND WHAT IT DOES NOT.
   *
   * Eager: every sound effect and every take of it, plus the menu theme —
   * the one track the loading screen is explicitly waiting for. Lazy: the
   * other eleven, and the mp3 fallbacks, which are only worth a byte on a
   * browser that turns out not to read Ogg.
   */
  private fileList(): [[string, string][], [string, string][]] {
    const all: [string, string][] = [
      ...Object.entries(SOUNDS) as [string, string][],
    ]

    /*
     * AND EVERY TAKE OF THE ONES THAT HAVE MORE THAN ONE.
     *
     * Keyed `hurt#2`, `hurt#3` and so on, alongside the single entry the sound
     * map already declares as take one. A file that is not there simply fails
     * its fetch and is skipped, so the counts in `SOUND_VARIANTS` are a hint
     * rather than a contract — `play` only ever picks among what actually
     * decoded.
     */
    for (const key in SOUND_VARIANTS) {
      const fam = SOUND_VARIANTS[key]
      for (let i = 2; i <= fam.count; i++) all.push([key + '#' + i, fam.src + i + '.wav'])
    }
    all.push(['menu', MUSIC.menu])

    const rest = (Object.entries(MUSIC) as [string, string][])
      .filter(([key]) => key !== 'menu')
    return [all, rest]
  }

  private async preload() {
    /*
     * The bytes are already here — `prefetch` ran during the loading screen —
     * so this is decoding, not downloading, and it is the shortest possible
     * gap between the player's first touch and the menu theme starting.
     */
    const [eager, rest] = this.fileList()
    await Promise.all(eager.map(([key, src]) => this.ensure(key, src)))

    /*
     * AND NOW START WHATEVER WAS ASKED FOR TOO EARLY.
     *
     * This line is the whole reason the menu was silent. The context can only
     * be created on a user gesture, and by then the menu has already asked for
     * its track — so `music()` found no decoded buffer, parked the request in
     * `pendingMusic`, and nothing ever came back for it. Decoding finishing is
     * exactly the moment to retry.
     */
    /*
     * Count what survived, once, so `play` is a lookup rather than a search.
     * Take one is the plain key; the rest are `key#2` upward and have to be
     * contiguous from two, which they are because they are loaded in order.
     */
    for (const key in SOUND_VARIANTS) {
      let n = this.buffers.has(key) ? 1 : 0
      while (this.buffers.has(key + '#' + (n + 1))) n++
      if (n > 1) this.takes.set(key, n)
    }

    // And the rest of the soundtrack decodes behind the menu, unwaited.
    void Promise.all(rest.map(([key, src]) => this.ensure(key, src)))
    if (this.pendingMusic) {
      const m = this.pendingMusic
      this.pendingMusic = null
      this.music(m, this.pendingFade)
    }
  }

  /**
   * Fires a one-shot.
   *
   * `throttle` is the minimum gap in seconds between two of this sound, and it
   * is the single most important argument here — see the note at the top.
   */
  play(key: SoundKey, opts: {
    volume?: number
    rate?: number
    throttle?: number
    maxVoices?: number
  } = {}) {
    const ctx = this.ctx
    if (!ctx || this.muted || !this.sfxGain) return

    /*
     * A DIFFERENT TAKE EACH TIME, where there is more than one.
     *
     * The throttle and the voice count stay on the FAMILY, not on the take —
     * four gunshots firing at once is four gunshots however many samples they
     * came from, and letting each take have its own budget would quietly
     * quadruple every limit in the game.
     */
    const n = this.takes.get(key) ?? 1
    const pick = n > 1 ? 1 + ((Math.random() * n) | 0) : 1
    const buf = this.buffers.get(pick > 1 ? key + '#' + pick : key)
    if (!buf) return

    const now = ctx.currentTime
    let v = this.voices.get(key)
    if (!v) { v = { last: -99, live: 0 }; this.voices.set(key, v) }

    const throttle = opts.throttle ?? 0.06
    if (now - v.last < throttle) return
    if (v.live >= (opts.maxVoices ?? 4)) return

    try {
      const src = ctx.createBufferSource()
      src.buffer = buf
      // A few percent either way, so a repeated sample never sounds looped.
      const jitter = opts.rate ?? 1
      src.playbackRate.value = jitter * (0.94 + Math.random() * 0.12)

      const gain = ctx.createGain()
      gain.gain.value = opts.volume ?? 1
      src.connect(gain)
      gain.connect(this.sfxGain)

      v.last = now
      v.live++
      src.onended = () => { v!.live = Math.max(0, v!.live - 1) }
      src.start()
    } catch { /* ignore */ }
  }

  /**
   * WHAT WILL ACTUALLY PLAY for a given key.
   *
   * Itself, normally. If the file turned out not to be there or not to decode,
   * whatever `MUSIC_FALLBACK` says it stands in for — and so on down, so a
   * browser that reads no Ogg at all still gets a complete soundtrack out of
   * the six mp3s the game shipped with.
   */
  private resolveMusic(key: MusicKey): MusicKey {
    let k = key
    for (let i = 0; i < 4; i++) {
      if (!this.failed.has(k)) return k
      const alt = MUSIC_FALLBACK[k]
      if (!alt || alt === k) return k
      k = alt
    }
    return k
  }

  /**
   * Switches the looping track, crossfading.
   *
   * Asking for the track that is already playing does nothing, which matters
   * because this is called from the snapshot push every frame the act is the
   * same — a naive implementation would restart the music sixty times a second.
   */
  music(key: MusicKey | null, fadeIn = 1.2) {
    if (!this.ctx || !this.musicGain) { this.pendingMusic = key; this.pendingFade = fadeIn; return }
    // What will actually play: this track, or its stand-in if the file is not
    // coming. Compared against what IS playing, so a browser sitting on the
    // fallbacks does not restart the same mp3 every frame.
    const want = key === null ? null : this.resolveMusic(key)
    if (want === this.currentMusic) return
    this.currentMusic = want
    this.lastFade = fadeIn

    const ctx = this.ctx
    const now = ctx.currentTime

    // Fade the outgoing one out and let it stop itself.
    if (this.musicSource && this.musicNode) {
      const oldSrc = this.musicSource
      const oldNode = this.musicNode
      try {
        oldNode.gain.cancelScheduledValues(now)
        oldNode.gain.setValueAtTime(oldNode.gain.value, now)
        oldNode.gain.linearRampToValueAtTime(0, now + 0.8)
        oldSrc.stop(now + 0.85)
      } catch { /* ignore */ }
    }
    this.musicSource = null
    this.musicNode = null
    if (!key || !want) return

    const buf = this.buffers.get(want)
    if (!buf) {
      /*
       * NOT DECODED YET — the ordinary case now rather than an error, because
       * only the menu theme is loaded before the game starts. Park the
       * request, go and get this ONE file, and come back to it. If it turns
       * out not to exist, `ensure` says so and the retry resolves to whatever
       * it stands in for.
       */
      this.currentMusic = null
      this.pendingMusic = key
      this.pendingFade = fadeIn
      void this.ensure(want, MUSIC[want]).then(() => {
        if (this.pendingMusic !== key) return
        this.pendingMusic = null
        this.music(key, fadeIn)
      })
      return
    }

    try {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const node = ctx.createGain()
      node.gain.value = 0
      /*
       * The caller decides how long this takes. A track swapping mid-run wants
       * to be quick about it; the menu theme arriving over a black screen at
       * the start of the whole thing wants six seconds, because that is the
       * difference between music starting and a game beginning.
       */
      node.gain.linearRampToValueAtTime(1, now + Math.max(0.05, this.lastFade))
      src.connect(node)
      node.connect(this.musicGain)
      src.start()
      this.musicSource = src
      this.musicNode = node
    } catch { /* ignore */ }
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05)
    }
  }

  dispose() {
    try { this.musicSource?.stop() } catch { /* ignore */ }
    try { void this.ctx?.close() } catch { /* ignore */ }
    this.ctx = null
  }
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }
