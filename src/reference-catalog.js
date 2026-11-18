const epic = {
  credit: 'Epic Games · Game Animation Sample',
  creditUrl: 'https://www.fab.com/listings/880e319a-a59e-4ed2-b268-b32dac7fa016',
};
const mesh2Motion = {
  credit: 'Mesh2Motion · CC0 1.0',
  creditUrl: 'https://github.com/Mesh2Motion/mesh2motion-app/blob/main/LICENSE-CC0.MD',
};
const accad = {
  credit: 'Open Motion Project · ACCAD, The Ohio State University · CC BY 3.0',
  creditUrl: 'https://accad.osu.edu/research/motion-lab/mocap-system-and-data',
};
const markTimes = frames => Object.fromEntries(Object.entries(frames).map(([id, frame]) => [id, frame / 60]));

export const productionReferences = {
  idle: {
    ...epic,
    title: 'Relaxed idle',
    url: './references/epic/idle.glb',
    marks: markTimes({ breath: 106 }),
  },
  regard: {
    ...epic,
    title: 'Head turn and return',
    url: './references/epic/head-turn.glb',
    observe: 'The head turns to the character’s left, holds briefly and returns to face forward. The standing body stays still.',
    marks: markTimes({ glance: 60 }),
  },
  bras: {
    ...mesh2Motion,
    title: 'Lateral arm raise',
    url: './references/mesh2motion/arm-raise.glb',
    observe: 'Watch how the hand travels less between frames as it approaches shoulder height. This clip adapts the timing of Mesh2Motion’s Chest Open.',
    marks: markTimes({ raised: 35 }),
  },
  salut: {
    ...mesh2Motion,
    title: 'Right-hand wave',
    url: './references/mesh2motion/wave.glb',
    observe: 'Once the arm is up, step through the wrist poses. The elbow stays in roughly the same place as the hand swings.',
    marks: markTimes({ 'arm-up': 52, 'wrist-out': 120, 'wrist-back': 138, 'lower-arm': 224 }),
  },
  accroupissement: {
    ...epic,
    title: 'Crouch and stand',
    url: './references/epic/crouch.glb',
    observe: 'Look at the side view as the hips travel back and down. Compare the path of the pelvis on the way back up.',
    marks: markTimes({ bottom: 42 }),
  },
  saut: {
    ...epic,
    title: 'Jump takeoff and landing',
    url: './references/epic/jump.glb',
    observe: 'Study the push off in Jump takeoff. Choose Landing and recovery to see how the knees absorb the impact.',
  },
  marche: {
    ...epic,
    title: 'Relaxed forward walk',
    url: './references/epic/walk-cycle.glb',
    marks: markTimes({ 'left-contact': 0, 'left-passing': 17, 'right-contact': 31, 'right-passing': 47, 'next-contact': 61 }),
  },
  course: {
    ...epic,
    title: 'Relaxed forward run',
    url: './references/epic/run-cycle.glb',
    marks: markTimes({ 'left-contact': 0, 'flight-one': 13, 'right-contact': 22, 'flight-two': 35, 'next-contact': 43 }),
  },
  sprint: {
    ...epic,
    title: 'Forward sprint',
    url: './references/epic/sprint.glb',
    marks: markTimes({ 'left-contact': 0, 'flight-one': 12, 'right-contact': 18, 'flight-two': 29, 'next-contact': 36 }),
  },
  vault: {
    ...epic,
    title: 'Running vault',
    url: './references/epic/vault.glb',
    observe: 'Watch the right hand support the body on the wall while both legs clear it. Source travel is enabled and the wall is already placed. The take starts with the source animation so you can edit its offsets.',
    scene: {
      props: [{ id: 'vault-wall', type: 'lowWall', name: 'Vault wall · 1.12 m', position: [0, 0, 3.32], rotation: [0, 0, 0], scale: [1, 1.2872, 1.25] }],
    },
  },
  hurdle: {
    ...epic,
    title: 'Running hurdle',
    url: './references/epic/hurdle.glb',
    observe: 'Compare this hands-free hurdle with the supported vault. Follow the lead leg, trailing foot and first landing contact. Source travel and a fitted hurdle are enabled.',
    scene: {
      props: [{ id: 'running-hurdle', type: 'hurdle', name: 'Hurdle · 1.10 m', position: [0, 0, 3.55], rotation: [0, 0, 0], scale: [1.2, 1.0476, 1] }],
    },
  },
  mantle: {
    ...epic,
    title: 'Running mantle',
    url: './references/epic/mantle.glb',
    observe: 'Both hands lead onto the raised deck. The hips rise and the run continues on the higher surface. Keep source travel enabled to preserve the hand and foot placement.',
    scene: {
      props: [{ id: 'mantle-deck', type: 'platform', name: 'Raised deck · 1.12 m', position: [0, 0, 5.5], rotation: [0, 0, 0], scale: [1.4, 2.3874, 3.3333] }],
    },
  },
  roulade: {
    ...epic,
    title: 'Forward roll and recovery',
    url: './references/epic/forward-roll.glb',
    observe: 'The roll follows a landing. Track the chin tuck, the shoulder passing the floor and the feet recovering underneath the body.',
    marks: markTimes({ tuck: 9, inverted: 24, recover: 48 }),
  },
  poing: {
    ...accad,
    title: 'Right cross',
    url: './references/accad/right-cross.glb',
    observe: 'Switch to Side to see the elbow open. Watch the hips start to turn, then compare the speed of the strike with the return to guard.',
    marks: markTimes({ windup: 18, extension: 30, guard: 80 }),
  },
  pied: {
    ...accad,
    title: 'Right front kick',
    url: './references/accad/right-front-kick.glb',
    observe: 'At half speed, follow the right knee from the chamber through extension and back into a bend. Watch the left foot carry the weight.',
    marks: markTimes({ chamber: 36, extension: 42, recovery: 52 }),
  },
  defeated: {
    credit: 'Mixamo · X Bot',
    creditUrl: 'https://www.mixamo.com/',
    title: 'Defeated',
    url: './Defeated.fbx',
    observe: 'Follow the drop of the shoulders, the head and the changes of weight through the reaction.',
  },
};
