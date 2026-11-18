/**
 * BIBLIOTHÈQUE DE MOUVEMENTS
 * Une fonction exportée = une animation.
 * Signature : (rig, tempsEnSecondes, amplitude).
 * Le moteur appelle rig.reset() avant et rig.finish() après chaque fonction.
 * Les mouvements sont calculés depuis le temps absolu : pause, scrub et retour
 * en arrière produisent exactement la même pose. Aucune accumulation de rotations.
 */
import { animateWalk, WALK_DURATION } from './walk.js';

const TAU = Math.PI * 2;
const sin = Math.sin;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { const v = clamp(x); return v * v * (3 - 2 * v); };
const envelope = (p, start, peak, end) => p < peak ? smooth((p - start) / (peak - start)) : 1 - smooth((p - peak) / (end - peak));
const phase = (time, duration) => ((time % duration) + duration) % duration / duration;

function leg(rig, side, hip, knee, ankle = -(hip + knee)) {
  rig.rotate(`thigh_${side}`, hip);
  rig.rotate(`calf_${side}`, knee);
  rig.rotate(`foot_${side}`, ankle);
}
function arm(rig, side, swing = 0, bend = -0.1, spread = 0) {
  rig.rotate(`upperarm_${side}`, swing, 0, (side === 'l' ? 1 : -1) * spread);
  rig.rotate(`lowerarm_${side}`, bend);
}
function crouchPose(rig, amount) {
  leg(rig, 'l', -0.88 * amount, 1.76 * amount);
  leg(rig, 'r', -0.88 * amount, 1.76 * amount);
  rig.rotate('spine_01', 0.26 * amount);
  rig.rotate('spine_03', 0.14 * amount);
  rig.rotate('head', -0.18 * amount);
}

export function idle(rig, time, amplitude = 1) {
  const breath = sin(time * TAU / 4) * amplitude;
  rig.rotate('spine_03', 0.018 * breath);
  rig.rotate('spine_05', -0.012 * breath);
  rig.rotate('head', -0.012 * breath, sin(time * TAU / 4) * 0.025 * amplitude);
  arm(rig, 'l', 0.015 * breath, -0.05 * amplitude, 0.015 * breath);
  arm(rig, 'r', -0.015 * breath, -0.05 * amplitude, 0.015 * breath);
}

export function walk(rig, time, amplitude = 1) {
  animateWalk(rig, time, amplitude);
}

export function run(rig, time, amplitude = 1) {
  const p = time * TAU / 0.72;
  const a = amplitude;
  for (const [side, offset] of [['l', 0], ['r', Math.PI]]) {
    const s = sin(p + offset);
    const knee = (0.27 + 1.45 * Math.max(0, -sin(p + offset + 0.4))) * a;
    leg(rig, side, -0.88 * s * a, knee, -0.35 * a);
    arm(rig, side, 0.7 * s * a, -1.25 * a, 0.07 * a);
    rig.fingers(side, 0.6 * a);
  }
  rig.rotate('spine_01', 0.13 * a);
  rig.rotate('spine_03', 0.08 * a, -0.12 * sin(p) * a);
  rig.rotate('head', -0.14 * a);
  rig.lift = Math.max(0, sin(p * 2)) * 0.045 * a;
}

export function sneak(rig, time, amplitude = 1) {
  const p = time * TAU / 2.4;
  const a = amplitude;
  for (const [side, offset] of [['l', 0], ['r', Math.PI]]) {
    const s = sin(p + offset);
    leg(rig, side, (-0.48 - 0.26 * s) * a, (0.95 + 0.28 * Math.max(0, -s)) * a);
    arm(rig, side, 0.22 * s * a, -0.85 * a, 0.15 * a);
  }
  rig.rotate('spine_01', 0.22 * a);
  rig.rotate('spine_03', 0.1 * a, -0.07 * sin(p) * a);
  rig.rotate('head', -0.24 * a);
}

export function jump(rig, time, amplitude = 1) {
  const p = phase(time, 2.6);
  const a = amplitude;
  const preparation = envelope(p, 0.04, 0.22, 0.35);
  const landing = envelope(p, 0.68, 0.78, 0.98);
  const air = sin(clamp((p - 0.32) / 0.40) * Math.PI);
  crouchPose(rig, (preparation * 0.72 + landing * 0.56 + air * 0.18) * a);
  rig.lift = 0.50 * air * a;
  for (const side of ['l', 'r']) arm(rig, side, (0.4 * preparation - 2.5 * air - 0.5 * landing) * a, -0.25 * a, 0.10 * air * a);
}

export function squat(rig, time, amplitude = 1) {
  const depth = (0.5 - 0.5 * Math.cos(time * TAU / 3.6)) * amplitude;
  crouchPose(rig, depth);
  arm(rig, 'l', -1.35 * depth, -0.1 * depth, 0.06 * depth);
  arm(rig, 'r', -1.35 * depth, -0.1 * depth, 0.06 * depth);
}

export function wave(rig, time, amplitude = 1) {
  const p = phase(time, 3.2);
  const raise = smooth(p / 0.18) * (1 - smooth((p - 0.78) / 0.22)) * amplitude;
  arm(rig, 'r', -2.10 * raise, -0.65 * raise, 0.48 * raise);
  rig.rotate('lowerarm_r', -0.65 * raise, 0, 0.22 * sin(p * TAU * 3) * raise);
  rig.rotate('hand_r', 0, 0.15 * sin(p * TAU * 3) * raise, 0.10 * sin(p * TAU * 3) * raise);
  rig.rotate('head', 0, -0.06 * raise, -0.06 * raise);
  rig.rotate('spine_03', 0, 0.06 * raise);
}

export function punch(rig, time, amplitude = 1) {
  const p = phase(time, 1.6);
  const a = amplitude;
  const strike = envelope(p, 0.20, 0.38, 0.75);
  // Entrée et sortie en garde douces ; le coup atteint sa pleine extension.
  const guard = smooth(p / 0.14) * (1 - smooth((p - 0.82) / 0.18));
  leg(rig, 'l', -0.12 * a * guard, 0.23 * a * guard);
  leg(rig, 'r', 0.16 * a * guard, 0.12 * a * guard);
  arm(rig, 'l', -0.60 * a * guard, -1.60 * a * guard, 0.10 * a * guard);
  arm(rig, 'r', (-0.60 * guard - 0.93 * strike) * a, (-1.60 * guard + 1.56 * strike) * a, 0.09 * a * guard);
  rig.rotate('spine_03', 0.08 * strike * a, 0.24 * strike * a);
  rig.rotate('head', 0, -0.18 * strike * a);
  rig.fingers('l', 1.0 * a * guard);
  rig.fingers('r', 1.0 * a * guard);
}

export function kick(rig, time, amplitude = 1) {
  const p = phase(time, 2.4);
  const a = amplitude;
  const lift = envelope(p, 0.1, 0.38, 0.86);
  const extension = envelope(p, 0.34, 0.51, 0.70);
  leg(rig, 'r', -1.45 * lift * a, (1.65 * lift - 1.55 * extension) * a, -0.25 * lift * a);
  leg(rig, 'l', -0.08 * lift * a, 0.12 * lift * a);
  rig.rotate('spine_01', -0.18 * lift * a);
  rig.rotate('head', 0.12 * lift * a);
  arm(rig, 'l', -0.4 * lift * a, -1.0 * lift * a, 0.25 * lift * a);
  arm(rig, 'r', 0.25 * lift * a, -0.8 * lift * a, 0.35 * lift * a);
}

export function jumpingJack(rig, time, amplitude = 1) {
  const p = time * TAU / 1.6;
  const open = (0.5 - 0.5 * Math.cos(p)) * amplitude;
  const bounce = Math.abs(sin(p));
  for (const [side, sign] of [['l', 1], ['r', -1]]) {
    rig.rotate(`thigh_${side}`, -0.08 * amplitude, 0, sign * 0.32 * open);
    rig.rotate(`calf_${side}`, 0.16 * amplitude);
    rig.rotate(`foot_${side}`, -0.08 * amplitude, 0, -sign * 0.32 * open);
    arm(rig, side, 0, -0.07 * amplitude, 2.85 * open);
  }
  rig.lift = bounce * 0.10 * amplitude;
}

export function lookAround(rig, time, amplitude = 1) {
  const p = time * TAU / 5;
  rig.rotate('head', sin(p * 2) * 0.08 * amplitude, sin(p) * 0.65 * amplitude);
  rig.rotate('spine_05', 0, sin(p) * 0.10 * amplitude);
  rig.rotate('spine_03', 0, sin(p) * 0.07 * amplitude);
}

export function tPose(rig, time, amplitude = 1) {
  // La pose de référence est volontairement statique.
  arm(rig, 'l', -0.03 * amplitude, 0, 1.47 * amplitude);
  arm(rig, 'r', -0.03 * amplitude, 0, 1.47 * amplitude);
}

// Pour ajouter une animation : exporter sa fonction ci-dessus et ajouter une ligne.
export const animations = [
  { id: 'idle', name: 'Respiration', category: 'Essentiel', tag: 'Idle · Cycle naturel', duration: 4, icon: 'idle', subtitle: 'Le mouvement commence à l’arrêt.', description: 'Une respiration légère et un corps au repos. Le point de départ de votre étude.', update: idle },
  { id: 'look', name: 'Regarder autour', category: 'Essentiel', tag: 'Tête · Observation', duration: 5, icon: 'look', subtitle: 'Un regard, puis un autre.', description: 'Rotation de la tête accompagnée d’une légère torsion du haut du corps.', update: lookAround },
  { id: 'tpose', name: 'Pose en T', category: 'Essentiel', tag: 'Référence · Statique', duration: 1, icon: 'tpose', subtitle: 'La pose de référence.', description: 'Bras à l’horizontale pour observer les proportions et l’articulation du mannequin.', update: tPose },
  { id: 'walk', name: 'Marche', category: 'Locomotion', tag: 'Walk · Sur place', duration: WALK_DURATION, icon: 'walk', subtitle: 'Chaque pas a son rythme.', description: 'Une marche posée : contact du talon, transfert du poids, déroulé du pied et balancement souple des bras.', update: walk },
  { id: 'run', name: 'Course', category: 'Locomotion', tag: 'Run · Sur place', duration: 0.72, icon: 'run', subtitle: 'Plus d’élan. Plus d’énergie.', description: 'Un cycle de course sur place avec les coudes fléchis et une courte phase de suspension.', update: run },
  { id: 'sneak', name: 'Marche furtive', category: 'Locomotion', tag: 'Sneak · Position basse', duration: 2.4, icon: 'sneak', subtitle: 'Avancer en toute discrétion.', description: 'Des pas lents en position fléchie, avec le buste incliné et les bras en équilibre.', update: sneak },
  { id: 'jump', name: 'Saut', category: 'Action', tag: 'Jump · Impulsion', duration: 2.6, icon: 'jump', subtitle: 'Préparer. S’élancer. Atterrir.', description: 'Un saut vertical avec anticipation, extension des bras et amortissement de la réception.', update: jump },
  { id: 'squat', name: 'Accroupissement', category: 'Action', tag: 'Squat · Flexion', duration: 3.6, icon: 'squat', subtitle: 'Le poids du mouvement.', description: 'Flexion coordonnée des hanches et des genoux. Les bras avancent pour l’équilibre.', update: squat },
  { id: 'wave', name: 'Salut de la main', category: 'Action', tag: 'Wave · Geste', duration: 3.2, icon: 'wave', subtitle: 'Un geste qui dit bonjour.', description: 'Le bras droit se lève, la main salue, puis le corps revient doucement au repos.', update: wave },
  { id: 'punch', name: 'Coup de poing', category: 'Action', tag: 'Punch · Impact', duration: 1.6, icon: 'punch', subtitle: 'De la garde à l’extension.', description: 'Mise en garde, coup de poing droit et retour. Le buste accompagne la frappe.', update: punch },
  { id: 'kick', name: 'Coup de pied', category: 'Action', tag: 'Kick · Équilibre', duration: 2.4, icon: 'kick', subtitle: 'Armer, étendre, revenir.', description: 'Le genou droit monte avant l’extension de la jambe. Les bras stabilisent le corps.', update: kick },
  { id: 'jack', name: 'Jumping jack', category: 'Action', tag: 'Fitness · Coordination', duration: 1.6, icon: 'jack', subtitle: 'Tout le corps en cadence.', description: 'Écartement des jambes et élévation des bras, avec deux petits rebonds par cycle.', update: jumpingJack },
];
