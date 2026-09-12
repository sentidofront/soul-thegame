/**
 * WHAT O INDÍGENA SAYS.
 *
 * He is a 26-year-old who is on his phone too much, and he narrates his own
 * life like there is a group chat watching. The voice is: unbothered until it
 * is suddenly very bothered, self-aware, slightly cowardly, warm about Soul
 * underneath it. Nothing here is a tutorial — if a line explains a mechanic it
 * is doing it by complaining about it.
 *
 * One-off lines that belong to a species live on the enemy definitions. This
 * file is everything that reacts to the RUN rather than to a monster: levels,
 * health, waves, kills, hardware.
 *
 * Keep them short. They are read in about two seconds, over a fight — the
 * bubble wraps at about twenty-four characters a line and holds three, so
 * anything past forty-four is a line nobody finishes.
 *
 * ABOUT ONE LINE IN FIVE NODS AT SOMEBODY HE KNOWS. Soul is the reason for the
 * whole journey and the rest are people from the same corner of the internet —
 * the açougueiro who used to fight, the one with the workshop full of
 * gambiarra, the one who never leaves the house, the one who wants to drive a
 * lorry. They are written as PEOPLE O INDÍGENA KNOWS, never as an audience:
 * he is complaining about his friends on a long walk, which is the only way a
 * reference can land without the game turning round and addressing the room.
 */

/** Picks a line at random, avoiding the one that just played. */
export function pick(lines: readonly string[], last?: string): string {
  if (lines.length === 1) return lines[0]
  for (let tries = 0; tries < 6; tries++) {
    const line = lines[(Math.random() * lines.length) | 0]
    if (line !== last) return line
  }
  return lines[0]
}


/**
 * WHAT THE BOSSES SAY.
 *
 * Everything above belongs to O Indígena. This does not: it is the other side
 * of the fight talking, and each of them talks like the thing they are.
 *
 * They fire on a slow clock during the fight and on the moments that matter —
 * a phase turning over, a grab landing. Slow on purpose: a boss that comments
 * every four seconds stops being frightening and starts being a companion.
 */
export const QUIPS: Record<string, {
  /** On the clock, while the fight runs. */
  idle: readonly string[]
  /** The moment it changes into whatever it becomes next. */
  phase?: readonly string[]
  /** It has hold of you. */
  grab?: readonly string[]
}> = {
  /*
   * O BEHOLDER DA CLT does not threaten anybody. He OFFERS.
   *
   * Every line is a real thing a real person has been told in a real
   * interview, which is the entire joke and the entire menace: the horror is
   * not that he might kill you, it is that the offer is plausible. He never
   * raises his voice and he never mentions violence, and by the fourth line
   * the player is more frightened of him than of the mothership.
   */
  beholder: {
    idle: [
      'TEMOS⏃⌰⟟⟒UMA VAGA PARA VOCÊ',
      'CLT, PLENO-xii. COM PLANO DE CARREIRA.',
      'VALE-REFEIÇÃO DE ⌰⟟⌖⍜ TRINTA E DOIS REAIS.',
      'PRECISO DE ⌇⟒⎍ ⋔⟒⍀⎅⏃ALGUÉM PROATIVO. PROATIVO? PROATIVO?⌇⟒⎍ ⋔⟒⍀⎅⏃ PROATIVO?',
      'A GENTE AQUI É UMA FAMÍLIA.',
      'ESCALA 6x1.⌇⟒⎍ ⋔⟒⍀⎅⏃ TODO MUNDO FAZ.',
      'COMEÇA SEGUNDA. TRAZ O SOUL TAMBÉM.',
      'BANCO DE HORAS.⌇⟒⎍ ⋔⟒⍀⎅⏃ É UM BENEFÍCIO.',
      'NÃO TEM HOME OFFICE. ⌇⟒⎍ CULTURA PRESENCIAL.',
      'TEM DIS⌇⟒⎍ ⋔⟒⍀⎅⏃PONIBILIDADE PARA VIAJAR?',
      '⌇⟒⎍ ⋔⟒⍀⎅⏃ A FAIXA É A COMBINAR.',
    ],
  },

  /*
   * A MANIFESTAÇÃO speaks as a crowd, in slogans, and never quite about
   * anything. It is a whole town with its head turned around, so the lines are
   * protest-shaped and empty in the middle — chants with the cause removed.
   */
  manifestacao: {
    idle: [
      'O POVO! UNIDO! O POVO! UNIDO!',
      'PAZ ENTRE ALIENS E INDIGENAS',
      'ABAIXO AO ÓDIO ALIEN!.',
      'ABAIXO! ABAIXO! ABAIXO O QUÊ MESMO?',
      'A GENTE TAVA BEM ATÉ VOCÊ CHEGAR',
      'PÃO COM MORTADELA! PÃO COM MORTADELA!',
      'TÁ TUDO ÓTIMO. TÁ TUDO ÓTIMO.',
    ],
    phase: [
      'MAIS ALTO! ELES NÃO TÃO OUVINDO!',
    ],
  },

  /*
   * A MICROSOFT talks like a licence agreement that learned to want things.
   * Never angry, never rude, and it never stops for a second — the joke is
   * that being destroyed by it is a scheduled event you already consented to.
   */
  microsoft: {
    idle: [
      'Instalando atualização 1 de 4.',
      'Você aceitou isto. Página 40, parágrafo 12.',
      'Não desligue o seu Indígena.',
      'Sua sessão expirou. Renovando.',
      'Detectamos uso não licenciado de revólver.',
      'Reiniciando em 3... 2... adiado.',
      'Podemos coletar dados sobre esta luta?',
      'Seu feedback é muito importante pra nós.',
    ],
    phase: [
      'Erro fatal. Recuperando. Recuperando.',
    ],
    grab: [
      'Confirme sua identidade.',
      'Aguarde. Não feche esta janela.',
    ],
  },

  /*
   * O CHARÁ has the player's own face, and every line is about that. He does
   * not threaten and he does not gloat: he talks as though the two of them
   * have already had this conversation and the player simply does not
   * remember it.
   */
  chara: {
    idle: [
      'Você atira igual a mim. Reparou?',
      'Eu cheguei aqui primeiro.',
      'O Soul é todo meu',
      'Um de nós tá indo pra casa.',
      'Você jamais vai recuperar o Soul de mim.',
      'Não faz essa cara. É a minha cara.',
    ],
    phase: [
      'Ainda não. Ainda não acabou.',
    ],
  },
  chara_mecha: {
    idle: [
      'Esculaxo',
      'Cabe dois aqui dentro. Cabia.',
      'Olha o tamanho da diferença, por isso o soul me ama.',
    ],
    grab: [
      'Fica quieto. Fica quieto, ô.',
      'Deixa eu ver a sua cara de perto.',
    ],
  },
  chara_angry: {
    idle: [
      'Quebrou a minha. Vou pegar a deles.',
      'Cê tá me obrigando a isso.',
    ],
  },
  chara_nave: {
    idle: [
      'Agora eu não sou mais um.',
      'Tira os três se você conseguir.',
      'Daqui de cima você é bem pequeno.',
      'Eles tão vendo isso. Todos eles.',
    ],
    phase: [
      'CAIU. TUDO BEM. AINDA SOBRA EU.',
    ],
  },
  chara_sword: {
    idle: [
      'Acabou a bala. Sobrou o resto.',
      'Vem. Só nós dois agora.',
    ],
  },
}

export const BARKS = {
  /** Said once, on the first level-up of a run. */
  firstLevel: [
    'ARRGHHHHH, eu vou te SALVAR SOUL!',
  ],

  levelUp: [
    'Fiquei mais forte. Não pergunta como.',
    'Mais um nível.',
    'Se eu morrer agora vai ser vergonhoso.',
    'Isso aqui tá ficando fácil.',
    'Tô sentindo o braço mais firme.',
    'Comi bem hoje. Deve ser isso.',
    'Se o Soul me visse agora.',
    'Melhorei. Nem eu acredito.',
    'Boa, eu. Boa demais.',
    'Agora eu tô perigoso, viu.',
    'Tô ficando bom nisso. E isso é triste.',
    'Guarda esse aí pra contar depois.',
    'Vixe. Tô virando outra pessoa.',
    'Meu pai dizia que eu não ia dar em nada.',
    'ESTOU pronto..',
    'Isso aqui é treino de kickboxing, é?',
    'O Louro ia gostar dessa gambiarra.',
    'Se eu contar isso ninguém acredita.',
    'Tô melhor que ontem. Ontem foi ruim.',
    'Subi de nível igual meme do Marcos.',
    'Faz um gráfico disso aí, Clib.',
    'Eu era pior. Muito pior.',
  ],

  /** Crossing below a third of health. */
  lowHealth: [
    'Tô mal. Tô muito mal.',
    'Cara. CARA. Tô quase morrendo.',
    'Por algum motivo, É CULPA DO TAUBE.',
    'Tô vazando. Tô vazando bastante.',
    'Calma, calma, calma, calma, calma.',
    'Eu não tenho sangue pra isso não.',
    'Se eu sentar um pouquinho ninguém vê.',
    'Minha mãe tinha razão. Ela sempre tem.',
    'Não morre, não morre, não morre.',
    'Isso doeu de um jeito novo.',
    'Aguenta, corpinho. Aguenta.',
    'Cadê a star para me dar um beijinho e sarar?',
    'Tô mais quebrado que ônibus do Dudu.',
    'Estou morrendo, liguem pro Soul.',
    'Eu devia ter ficado em casa igual Vien.',
    'Socorro. Socorro em voz baixa.',
    'Meu Deus do  céu, meu Deus do céu.',
    'Tô vendo o Soul e ele nem tá aqui.',
  ],

  healed: [
    'Voltei. Tava difícil.',
    'Ó, melhorei. Continua então.',
    'Respirei. Que delícia respirar.',
    'Voltei ao normal. O normal é horrível.',
    'Agora sim. Cadê eles.',
    'Cicatriza rápido, viu. Orgulho.',
    'Levantei. Anota aí.',
    'Tô inteiro. Mais ou menos inteiro.',
  ],

  /** A wave has just landed. */
  wave: [
    'Vem tudo de uma vez! Segura!',
    'Eita, chegou reforço deles…',
    'Tão fechando a estrada!',
    'Isso aqui não é justo, viu.',
    'Gatekeeping do nucc logo a frente!.',
    'Quem chamou essa gente toda.',
    'Eita. Vem mais? Vem mais.',
    'Isso aqui virou fila de banco.',
    'Um de cada vez! Por favor!',
    'Chegou o resto da família deles.',
    'Quem foi que abriu o portão, meu Deus.',
    'Tem gente demais nessa estrada.',
    'Isso aqui tá lotado igual Coco Bambu.',
    'Convidaram todo mundo do servidor, é?',
    'Cerco. Cerco bonito, mas cerco.',
    'Ó a fila andando pra cima de mim.',
    'Chamaram até quem tava dormindo.',
  ],

  /** Milestone kill counts. */
  killStreak: [
    'Estou moggando.',
    'Perdi a conta faz tempo.',
    'Alguém vai ter que varrer isso.',
    'Tô numa fase boa hoje.',
    'Isso aqui já virou serviço.',
    'Não me orgulho. Mentira, um pouco.',
    'Vou ter que lavar essa roupa depois.',
    'Perdi a conta e a vergonha junto.',
    'Tô rápido demais hoje, rapaz.',
    'Virei açougueiro igual o Tales.',
    'Aqui já sextou, rapaziada.',
    'Isso aqui é serviço de segunda-feira.',
    'Tô no ritmo. Não me atrapalha.',
    'Que trabalheira, viu.',
    'Depois eu conto isso pro Soul.',
  ],

  /** Ammo picked up. */
  newAmmo: [
    'Bala diferente. Vai que presta.',
    'Ó o peso disso. Gostei.',
    'Achei umas balas esquisitas.',
    'Isso aqui é coisa do Louro, só pode.',
    'Munição nova. Já era tempo.',
    'Peguei umas boas aqui.',
  ],

  /** A homúnculo has just died. */
  helperDown: [
    'Mataram meu homúnculo. Agora é pessoal.',
    'Ele era novo. Que raiva.',
    'Levaram meu bonequinho, gente.',
    'Ele não fez nada com ninguém!',
    'Eu ia até dar um nome pra ele.',
    'Descansa, pequeno. Descansa.',
  ],

  /** Standing in something that is hurting you. */
  inHazard: [
    'Isso aqui tá me queimando, sai daqui.',
    'Por que o chão tá me atacando.',
    'O chão! O chão tá errado!',
    'Sai, sai, sai, sai, sai.',
    'Tá cozinhando meu pé, isso aí.',
    'Quem foi que sujou o chão assim.',
    'Botaram lava aqui igual o Ronaldo.',
    'Meu pé! Meu pé, gente!',
  ],

  /**
   * NOTHING AROUND, FOR A WHILE.
   *
   * The one set that exists for the gaps. A road with nobody on it is the only
   * time he says anything that is not about being hit, and it is where most of
   * what he is actually like ends up.
   */
  quiet: [
    'Que silêncio esquisito.',
    'Cadê todo mundo, meu Deus.',
    'Vou aproveitar e respirar um pouco.',
    'Tô com sede. Muita sede.',
    'Essa estrada não acaba nunca.',
    'Se eu soubesse tinha trazido água.',
    'Fala comigo, Soul. De onde você tiver.',
    'Meu pé tá doendo. Ninguém pergunta.',
    'Tô andando desde cedo, viu.',
    'Bonito aqui, se ignorar tudo.',
    'Devia ter avisado que eu ia demorar.',
    'Tô com fome. Isso é grave.',
    'Almoço hoje foi arroz. Só arroz.',
    'Arroz e frango, se tivesse frango.',
    'O Vien ia cancelar essa caminhada.',
    'Isso aqui dava um bom livro velho.', 
    'Cadê um caminhão pra me dar carona.',
    'Se o Asilo passasse aqui de carreta…',
    'Tô pensando igual aquele macaco.',
    'Podia tá em casa fazendo pão.',
    'O Salicorne ia reclamar do ônibus.',
    'Sinto falta de barulho de gente.',
    'Vou contar os cactos. Um. Dois.',
    'O Agente sabia o nome dessa planta.',
    'Nem passarinho tem nessa porcaria.',
    'A gente marcou de se ver, Soul.',
  ],

  /** One of the big ones has walked in. */
  bigOne: [
    'Por que esse tá desse tamanho?',
    'Esse aí comeu os outros, só pode.',
    'Não gostei do porte desse aí.',
    'Esse veio com adicional.',
    'Calma. Esse é grande. Calma.',
    'Esse aí come melhor que eu.',
    'Esse tem corpo de orc, rapaz.',
    'Esse aí não passa na porta.',
  ],

  /** Something enormous is passing overhead with a light on. */
  shipOverhead: [
    'Sai da luz. SAI DA LUZ!',
    'Eita! Que luz é essa?!',
    'Não olha pra cima, não olha pra cima.',
    'Corre pro lado! PRO LADO!',
    'Isso é maior que a sucuri do Maat!',
    'Some daí, some daí, some daí!',
  ],

  /** And it has him. */
  abducted: [
    'EI! EI!',
    'ME SOLTA! ME SOLTA!',
    'Ah não. Ah não, ah não, ah não.',
    'EU NÃO! LEVA OUTRO!',
    'ME BOTA NO CHÃO, DESGRAÇA!',
    'EU TENHO COMPROMISSO! ME SOLTA!',
  ],

  /** He got out. */
  escaped: [
    'Não sou boi pra ser levado, não.',
    'Desce aqui pra ver se você é homem.',
    'Tô no chão. Amo o chão.',
    'Quase. Quase, viu.',
    'Aprendi isso vendo luta.',
    'Pé no chão. Pé no chão é tudo.',
  ],

  /** Entering act two. */
  arrivedFloriano: [
    'Floriano. Tá tudo errado aqui.',
    'Cheguei. Preferia não ter chegado.',
    'Minha cidade não era assim, gente.',
    'A cidade do Soul. Que estado, meu Deus.',
  ],

  /** Entering act three. */
  arrivedChurch: [
    'A igreja. Aguenta aí, Soul.',
    'É aqui. Tem que ser aqui.',
    'Tô com medo. Mas tô indo.',
    'Vim de longe por você, Soulzinha.',
  ],
} as const

export type BarkSet = keyof typeof BARKS
