import { walk } from './animations.js';
import { FPS, BODY, BODY_ROTATION, applyPose, joints, makeKey as key, samplePose, valueAt } from './keyframes.js';

export const levels = [
  { id: 'bases', name: 'Fundamentals' },
  { id: 'poids', name: 'Weight and contact' },
  { id: 'coordination', name: 'Advanced coordination' },
];

const walkPhases = [
  { id: 'left-contact', frame: 0, label: 'Left heel strike' },
  { id: 'left-passing', frame: 9, label: 'Left passing pose' },
  { id: 'right-contact', frame: 18, label: 'Right heel strike' },
  { id: 'right-passing', frame: 27, label: 'Right passing pose' },
  { id: 'next-contact', frame: 36, label: 'Next left heel strike' },
];
const runPhases = [
  { id: 'left-contact', frame: 0, label: 'Left foot strike' },
  { id: 'flight-one', frame: 6, label: 'First flight phase' },
  { id: 'right-contact', frame: 12, label: 'Right foot strike' },
  { id: 'flight-two', frame: 18, label: 'Second flight phase' },
  { id: 'next-contact', frame: 24, label: 'Next left foot strike' },
];

const hasKey = (keys, frame) => keys.some(item => item.frame === frame);

function between(frame, joint, axis, min, max) {
  return keys => {
    const pose = keys.find(item => item.frame === frame)?.pose;
    if (!pose) return false;
    const value = valueAt(pose, joint, axis);
    return value >= min && value <= max;
  };
}

function bothArms(frame, min, max) {
  return keys => ['upperarm_l', 'upperarm_r'].every(joint => between(frame, joint, 'x', min, max)(keys));
}

function closesCycle(frame) {
  return keys => {
    if (!hasKey(keys, 0) || !hasKey(keys, frame)) return false;
    const first = samplePose(keys, 0);
    const last = samplePose(keys, frame);
    return [...new Set([...Object.keys(first), ...Object.keys(last)])].every(
      channel => Math.abs((first[channel] ?? 0) - (last[channel] ?? 0)) <= 2,
    );
  };
}

const waveArm = { 'upperarm_r.x': -50, 'upperarm_r.z': -69, 'lowerarm_r.x': -38, 'lowerarm_r.z': -61 };
const crouch = {
  'thigh_l.x': -44, 'thigh_r.x': -44,
  'calf_l.x': 88, 'calf_r.x': 88,
  'foot_l.x': -44, 'foot_r.x': -44,
};
const scaledPose = (pose, scale) => Object.fromEntries(Object.entries(pose).map(([channel, angle]) => [channel, angle * scale]));
const prep = scaledPose(crouch, 0.65);
const takeoff = { 'upperarm_l.x': -90, 'upperarm_r.x': -90, 'spine_03.x': -7 };
const jumpApex = { ...scaledPose(crouch, 0.16), 'upperarm_l.x': -136, 'upperarm_r.x': -136 };
const landing = { ...scaledPose(crouch, 0.45), 'upperarm_l.x': -55, 'upperarm_r.x': -55, 'spine_03.x': 16 };
const leftContact = { 'upperarm_l.x': 17, 'upperarm_r.x': -17 };
const runLeft = {
  'thigh_l.x': -40, 'calf_l.x': 19, 'foot_l.x': 16,
  'thigh_r.x': 21, 'calf_r.x': 70, 'foot_r.x': -25,
  'spine_03.x': 12, 'upperarm_l.x': 28, 'upperarm_r.x': -45,
  'lowerarm_l.x': -83, 'lowerarm_r.x': -83,
};
const runAirLeft = {
  ...runLeft, 'thigh_l.x': 12, 'calf_l.x': 55, 'foot_l.x': -19,
  'thigh_r.x': -42, 'calf_r.x': 76, 'foot_r.x': 11,
  'upperarm_l.x': -12, 'upperarm_r.x': 3,
};
const swapLegsAndArms = pose => Object.fromEntries(Object.entries(pose).map(
  ([channel, value]) => [channel.replace(/_([lr])\./, (_, side) => side === 'l' ? '_r.' : '_l.'), value],
));
const runRight = swapLegsAndArms(runLeft);
const runAirRight = swapLegsAndArms(runAirLeft);
const guard = {
  'thigh_l.x': -12, 'calf_l.x': 16, 'foot_l.x': -4,
  'thigh_r.x': 14, 'calf_r.x': 10, 'foot_r.x': -24,
  'upperarm_l.x': -30, 'lowerarm_l.x': -104, 'upperarm_r.x': -36, 'lowerarm_r.x': -100,
};
const windup = { ...guard, 'upperarm_r.x': -20 };
const strike = { ...guard, 'upperarm_r.x': -84, 'spine_03.x': 8 };
const chamber = {
  'thigh_r.x': -75, 'calf_r.x': 92, 'foot_r.x': -14,
  'thigh_l.x': -6, 'calf_l.x': 9, 'foot_l.x': -3,
  'spine_03.x': -12, 'upperarm_l.x': -37, 'lowerarm_l.x': -65,
  'upperarm_r.x': 24, 'lowerarm_r.x': -58,
};
const kickExtension = { ...chamber, 'thigh_r.x': -65, 'foot_r.x': -5 };
const sprintLeft = { ...runLeft, 'thigh_l.x': -58, 'calf_r.x': 100, 'upperarm_r.x': -62, 'spine_03.x': 22 };
const sprintAir = { ...runAirLeft, 'thigh_r.x': -65, 'calf_l.x': 100, 'spine_03.x': 22 };
const rollTuck = {
  'thigh_l.x': -100, 'thigh_r.x': -100, 'calf_l.x': 132, 'calf_r.x': 132,
  'spine_03.x': 25, 'head.x': 25, 'upperarm_l.x': -75, 'upperarm_r.x': -75,
  'lowerarm_l.x': -80, 'lowerarm_r.x': -80,
};

export const lessons = [
  {
    id: 'idle', level: 'bases', title: 'Create an idle', skill: 'Subtle motion and loops', icon: 'idle',
    frames: 300, view: 'perspective', editors: ['spine_03', 'head'], copyStart: true,
    referencePhases: [{ id: 'breath', frame: 60, label: 'Breath peak' }],
    goal: 'Give a standing character a gentle breath, then close the loop without a visible jump.',
    observe: 'Look at the chest and head against the stationary feet. The movement is small and slow.',
    steps: [
      { frame: 60, joint: 'spine_03', axis: 'x', name: 'Add a quiet breath', text: 'Set Flexion X to 2°. Small changes keep the character alive while standing.' },
      { frame: 300, joint: 'spine_03', name: 'Close the idle loop', text: 'Use Copy first pose at the final frame, then play at half speed to check the join.' },
    ],
    starter: [key(0), key(300)],
    reference: [key(0), key(60, { 'spine_03.x': 2 }), key(300)],
    criteria: [
      ['The chest moves subtly at frame 60 (X between 1° and 4°).', between(60, 'spine_03', 'x', 1, 4)],
      ['The first and last poses match.', closesCycle(300)],
    ],
  },
  {
    id: 'regard', level: 'bases', title: 'Turn the head', skill: 'Key poses', icon: 'look',
    frames: 48, view: 'perspective', editors: ['head'],
    referencePhases: [{ id: 'glance', frame: 24, label: 'Side glance' }],
    goal: 'Have the character look to the side, then face forward again. Build the turn with three poses.',
    observe: 'Watch how the head leaves the forward pose and settles into the side glance.',
    steps: [
      { frame: 24, joint: 'head', axis: 'y', name: 'Set the glance', text: 'Set Twist Y to about 35°. This adds a key at the current frame.' },
      { frame: 48, joint: 'head', name: 'Return to center', text: 'The final pose is set up for you. Play the movement to see the head return.' },
    ],
    starter: [key(0), key(48)],
    reference: [key(0), key(24, { 'head.y': 35 }), key(48)],
    criteria: [
      ['A key at frame 24 with a head twist between 25° and 50°.', between(24, 'head', 'y', 25, 50)],
      ['The head faces forward at the start and end.', keys => [0, 48].every(frame => between(frame, 'head', 'y', -5, 5)(keys))],
    ],
  },
  {
    id: 'bras', level: 'bases', title: 'Raise an arm', skill: 'Interpolation', icon: 'tpose',
    frames: 60, view: 'front', editors: ['upperarm_r'],
    referencePhases: [{ id: 'raised', frame: 30, label: 'Arm at shoulder height' }],
    goal: 'Raise the right arm to shoulder height and slow it as it reaches the top of its arc.',
    observe: 'Watch how the hand covers less distance between frames near the top of the arc.',
    steps: [
      { frame: 30, joint: 'upperarm_r', axis: 'z', name: 'Set the raised pose', text: 'Set Tilt Z to about −82°. The last key brings the arm back down.' },
      { frame: 0, joint: 'upperarm_r', name: 'Compare interpolation', text: 'Play the linear rise, then return to this key and select Ease in and out.' },
    ],
    starter: [key(0, {}, 'linear'), key(60)],
    reference: [key(0), key(30, { 'upperarm_r.z': -82 }), key(60)],
    criteria: [
      ['The right arm is near horizontal at frame 30 (Z between −95° and −72°).', between(30, 'upperarm_r', 'z', -95, -72)],
      ['The starting key uses Ease in and out.', keys => keys.find(item => item.frame === 0)?.curve === 'smooth'],
    ],
  },
  {
    id: 'salut', level: 'bases', title: 'Wave hello', skill: 'Overlapping action', icon: 'wave',
    frames: 72, view: 'front', editors: ['hand_r', 'lowerarm_r', 'upperarm_r'],
    referencePhases: [
      { id: 'arm-up', frame: 18, label: 'Arm up' },
      { id: 'wrist-out', frame: 28, label: 'Wrist swings out' },
      { id: 'wrist-back', frame: 44, label: 'Wrist swings back' },
      { id: 'lower-arm', frame: 54, label: 'Begin lowering' },
    ],
    goal: 'Animate the wrist after the arm comes up to give the greeting a clear wave.',
    observe: 'Watch the wrist lead the wave while the arm stays raised.',
    steps: [
      { frame: 28, joint: 'hand_r', axis: 'z', name: 'Tilt the hand', text: 'Set Tilt Z to about −22° to start the wave.' },
      { frame: 44, joint: 'hand_r', axis: 'z', name: 'Reverse the gesture', text: 'Set Tilt Z to about +22° to swing the hand back the other way.' },
    ],
    starter: [key(0), key(18, waveArm), key(54, waveArm), key(72)],
    reference: [key(0), key(18, waveArm), key(28, { ...waveArm, 'hand_r.z': -22 }),
      key(44, { ...waveArm, 'hand_r.z': 22 }), key(54, waveArm), key(72)],
    criteria: [
      ['The wrist tilts at frame 28 (Z between −35° and −12°).', between(28, 'hand_r', 'z', -35, -12)],
      ['The wrist tilts the other way at frame 44 (Z between 12° and 35°).', between(44, 'hand_r', 'z', 12, 35)],
    ],
  },
  {
    id: 'accroupissement', level: 'poids', title: 'Squat', skill: 'Balance', icon: 'squat',
    frames: 72, view: 'side', editors: ['spine_03', 'upperarm_r', 'upperarm_l', 'thigh_r', 'calf_r'], mirror: true,
    referencePhases: [{ id: 'bottom', frame: 36, label: 'Bottom of the squat' }],
    goal: 'Use the torso and arms to balance the character at the bottom of a squat.',
    observe: 'From the side, watch the torso and arms move forward as the hips move back.',
    steps: [
      { frame: 36, joint: 'spine_03', axis: 'x', name: 'Lean the torso', text: 'Set Flexion X to about 20° to lean the torso forward at the bottom of the squat.' },
      { frame: 36, joint: 'upperarm_r', axis: 'x', name: 'Reach the arms forward', text: 'With mirroring on, set Flexion X to −60° to bring both arms forward.' },
    ],
    starter: [key(0), key(36, crouch), key(72)],
    reference: [key(0), key(36, { ...crouch, 'spine_03.x': 20, 'upperarm_l.x': -60, 'upperarm_r.x': -60 }), key(72)],
    criteria: [
      ['The torso leans forward 12° to 32° at frame 36.', between(36, 'spine_03', 'x', 12, 32)],
      ['Both arms reach forward at frame 36 (X between −85° and −45°).', bothArms(36, -85, -45)],
    ],
  },
  {
    id: 'saut', level: 'poids', title: 'Jump and land', skill: 'Anticipation and landing', icon: 'jump',
    frames: 66, view: 'side', editors: [BODY, 'upperarm_r', 'upperarm_l', 'spine_03', 'calf_r', 'calf_l'], mirror: true,
    goal: 'Sell the takeoff by swinging the arms back before lifting the character off the ground.',
    observe: 'Look for the backswing, the apex and the bend at the knees on landing.',
    steps: [
      { frame: 16, joint: 'upperarm_r', axis: 'x', name: 'Prepare the takeoff', text: 'With mirroring on, set Flexion X to about 30° to bring both arms back.' },
      { frame: 34, joint: BODY, axis: 'y', name: 'Set the apex', text: 'Set Height Y to about 45 cm. At frame 45, the character should touch down.' },
    ],
    starter: [key(0), key(16, prep), key(25, takeoff), key(34, jumpApex), key(45, landing), key(52, prep), key(66)],
    reference: [key(0), key(16, { ...prep, 'upperarm_l.x': 30, 'upperarm_r.x': 30 }), key(25, takeoff),
      key(34, { ...jumpApex, 'body.y': 45 }), key(45, landing), key(52, prep), key(66)],
    criteria: [
      ['Both arms swing back at frame 16 (X between 18° and 45°).', bothArms(16, 18, 45)],
      ['The body rises 35 to 60 cm at frame 34.', between(34, BODY, 'y', 35, 60)],
      ['The character touches down at frame 45.', between(45, BODY, 'y', 0, 2)],
    ],
  },
  {
    id: 'marche', level: 'poids', title: 'Animate a walk cycle', skill: 'Counter-swing and foot contact', icon: 'walk',
    frames: 36, view: 'side', editors: ['upperarm_r', 'upperarm_l'], restricted: true, copyStart: true,
    goal: 'Study the heel strikes and passing poses, then animate the arms in opposition to the legs over two steps.',
    observe: 'On heel strike the opposite arm leads. At the passing pose, the body moves over the planted foot and the arms pass the hips.',
    referencePhases: walkPhases,
    steps: [
      { frame: 9, joint: 'upperarm_r', axis: 'x', name: 'Set the first passing pose', text: 'As the free foot passes the planted foot, bring the arms past the hips. Set both upper arms to about 0° on Flexion X.' },
      { frame: 18, joint: 'upperarm_r', axis: 'x', name: 'Reverse the arm swing', text: 'At the right heel strike, set the right upper arm to +17° and the left to −17° on Flexion X.' },
      { frame: 27, joint: 'upperarm_r', axis: 'x', name: 'Set the second passing pose', text: 'Key both arms near 0° as the other foot passes. Then check the rhythm at half speed.' },
      { frame: 36, joint: 'upperarm_r', name: 'Close the loop', text: 'Use Copy first pose on the last frame to match the starting heel strike.' },
    ],
    starter: [key(0, leftContact), key(18), key(36)],
    referenceMotion: walk,
    foundation(rig, time) {
      walk(rig, time);
      rig.rotate('upperarm_l', 0);
      rig.rotate('upperarm_r', 0);
    },
    criteria: [
      ['Both passing poses have a key with the upper arms near neutral (X between −6° and 6°).',
        keys => [9, 27].every(frame => bothArms(frame, -6, 6)(keys))],
      ['At frame 18, the right arm swings back (X 10° to 24°) and the left swings forward (X −24° to −10°).',
        keys => between(18, 'upperarm_r', 'x', 10, 24)(keys) && between(18, 'upperarm_l', 'x', -24, -10)(keys)],
      ['The starting and ending poses match.', closesCycle(36)],
    ],
  },
  {
    id: 'course', level: 'coordination', title: 'Run', skill: 'Flight phase', icon: 'run',
    frames: 24, view: 'side', editors: [BODY, 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r'],
    referencePhases: runPhases,
    goal: 'Add two flight phases and coordinate the arms with the legs at the second contact.',
    observe: 'Find the two moments when both feet leave the ground and watch the rhythm of the foot strikes.',
    steps: [
      { frame: 6, joint: BODY, axis: 'y', name: 'Create the first flight phase', text: 'Raise the body about 10 cm between the contacts at frames 0 and 12.' },
      { frame: 12, joint: 'upperarm_l', axis: 'x', name: 'Balance the second contact', text: 'The right leg leads. On Flexion X, swing the left arm forward (−45°) and the right arm back (+28°).' },
      { frame: 18, joint: BODY, axis: 'y', name: 'Repeat the rhythm', text: 'Match the height of the second flight phase to the first. Play on a loop to check the timing.' },
    ],
    starter: [key(0, runLeft), key(6, runAirLeft), key(12, { ...runRight, 'upperarm_l.x': 0, 'upperarm_r.x': 0 }),
      key(18, runAirRight), key(24, runLeft)],
    reference: [key(0, runLeft), key(6, { ...runAirLeft, 'body.y': 10 }), key(12, runRight),
      key(18, { ...runAirRight, 'body.y': 10 }), key(24, runLeft)],
    criteria: [
      ['Both flight phases rise 7 to 15 cm at frames 6 and 18.', keys => [6, 18].every(frame => between(frame, BODY, 'y', 7, 15)(keys))],
      ['The left arm leads and the right arm swings back at frame 12.',
        keys => between(12, 'upperarm_l', 'x', -60, -30)(keys) && between(12, 'upperarm_r', 'x', 15, 42)(keys)],
      ['A foot is on the ground at each contact (frames 0, 12 and 24).', keys => [0, 12, 24].every(frame => between(frame, BODY, 'y', 0, 2)(keys))],
      ['The starting and ending poses match.', closesCycle(24)],
    ],
  },
  {
    id: 'sprint', level: 'coordination', title: 'Animate a sprint', skill: 'Drive and stride rhythm', icon: 'run',
    frames: 20, view: 'side', editors: [BODY, 'spine_03', 'upperarm_l', 'upperarm_r'], copyStart: true,
    referencePhases: [
      { id: 'left-contact', frame: 0, label: 'Left foot strike' },
      { id: 'flight-one', frame: 5, label: 'First flight phase' },
      { id: 'right-contact', frame: 10, label: 'Right foot strike' },
      { id: 'flight-two', frame: 15, label: 'Second flight phase' },
      { id: 'next-contact', frame: 20, label: 'Next left foot strike' },
    ],
    goal: 'Build a fast stride with a forward torso and two clearly defined flight phases.',
    observe: 'Track the quick foot contacts, the folded recovery leg and the forward drive of the chest.',
    steps: [
      { frame: 0, joint: 'spine_03', axis: 'x', name: 'Drive the torso forward', text: 'Set Flexion X to about 22° and repeat the lean at every pose in the cycle.' },
      { frame: 5, joint: BODY, axis: 'y', name: 'Lift into flight', text: 'Raise Height Y to about 14 cm. Repeat at frame 15 for the second flight.' },
      { frame: 20, joint: 'spine_03', name: 'Close the sprint cycle', text: 'Copy the first pose to the last frame, then inspect the contacts in Overlay.' },
    ],
    starter: [
      key(0, { ...sprintLeft, 'spine_03.x': 0 }), key(5, sprintAir),
      key(10, swapLegsAndArms(sprintLeft)), key(15, swapLegsAndArms(sprintAir)), key(20, sprintLeft),
    ],
    reference: [
      key(0, sprintLeft), key(5, { ...sprintAir, 'body.y': 14 }),
      key(10, swapLegsAndArms(sprintLeft)), key(15, { ...swapLegsAndArms(sprintAir), 'body.y': 14 }), key(20, sprintLeft),
    ],
    criteria: [
      ['The torso leans forward at frame 0 (X between 16° and 30°).', between(0, 'spine_03', 'x', 16, 30)],
      ['Both flight poses lift the body 9 to 20 cm.', keys => [5, 15].every(frame => between(frame, BODY, 'y', 9, 20)(keys))],
      ['The first and last poses match.', closesCycle(20)],
    ],
  },
  {
    id: 'poing', level: 'coordination', title: 'Throw a punch', skill: 'Speed and weight transfer', icon: 'punch',
    frames: 48, view: 'perspective', editors: ['lowerarm_r', 'spine_03', 'upperarm_r', 'head'],
    referencePhases: [
      { id: 'windup', frame: 12, label: 'Windup' },
      { id: 'extension', frame: 18, label: 'Strike extension' },
      { id: 'guard', frame: 36, label: 'Return to guard' },
    ],
    goal: 'Wind up the torso, then rotate it the other way as the arm extends into the punch.',
    observe: 'The arm extends quickly after the windup. The return to guard takes longer.',
    steps: [
      { frame: 12, joint: 'spine_03', axis: 'y', name: 'Wind up the punch', text: 'Set Twist Y to about −15° to prepare the strike.' },
      { frame: 18, joint: 'lowerarm_r', axis: 'x', name: 'Extend the elbow', text: 'Set Flexion X to about −6° to extend the right forearm on impact.' },
      { frame: 18, joint: 'spine_03', axis: 'y', name: 'Drive with the torso', text: 'Set Twist Y to about 26°. Play back and compare the speed of the strike with the recovery.' },
    ],
    starter: [key(0, guard), key(12, windup), key(18, strike), key(36, guard), key(48, guard)],
    reference: [key(0, guard), key(12, { ...windup, 'spine_03.y': -15 }), key(18, { ...strike, 'lowerarm_r.x': -6, 'spine_03.y': 26 }),
      key(36, guard), key(48, guard)],
    foundation(rig) {
      rig.fingers('l', 0.9);
      rig.fingers('r', 0.9);
    },
    criteria: [
      ['The torso winds up at frame 12 (Y between −25° and −8°).', between(12, 'spine_03', 'y', -25, -8)],
      ['The right forearm extends at frame 18 (X between −18° and 0°).', between(18, 'lowerarm_r', 'x', -18, 0)],
      ['The torso drives the punch (Y between 16° and 40°).', between(18, 'spine_03', 'y', 16, 40)],
      ['The elbow bends before the punch and on the return to guard.', keys => [12, 36].every(frame => between(frame, 'lowerarm_r', 'x', -150, -65)(keys))],
    ],
  },
  {
    id: 'pied', level: 'coordination', title: 'Throw a kick', skill: 'Balance on one foot', icon: 'kick',
    frames: 72, view: 'perspective', editors: ['calf_r', 'spine_03', 'thigh_r', 'calf_l', 'pelvis'],
    referencePhases: [
      { id: 'chamber', frame: 24, label: 'Chamber' },
      { id: 'extension', frame: 35, label: 'Kick extension' },
      { id: 'recovery', frame: 50, label: 'Knee folds back' },
    ],
    goal: 'Animate the knee from windup to recovery, and lean the torso over the planted foot on the strike.',
    observe: 'Watch the knee rise before the strike, then see how the leg folds again before returning to the ground.',
    steps: [
      { frame: 24, joint: 'calf_r', axis: 'x', name: 'Chamber the kick', text: 'Bend the right knee to about 90° on Flexion X as the thigh lifts.' },
      { frame: 35, joint: 'calf_r', axis: 'x', name: 'Extend the knee', text: 'Set right-knee Flexion X to about 12° on the strike.' },
      { frame: 35, joint: 'spine_03', axis: 'z', name: 'Counterbalance with the torso', text: 'Set Tilt Z to −18° to lean the torso over the planted left foot.' },
      { frame: 50, joint: 'calf_r', axis: 'x', name: 'Recover the leg', text: 'Bring the knee back toward 90° before putting the foot down.' },
    ],
    starter: [key(0), key(24, { ...chamber, 'calf_r.x': 42 }), key(35, kickExtension),
      key(50, { ...chamber, 'calf_r.x': 45 }), key(72)],
    reference: [key(0), key(24, chamber), key(35, { ...kickExtension, 'calf_r.x': 12, 'spine_03.z': -18 }),
      key(50, chamber), key(72)],
    criteria: [
      ['The right knee nearly extends at frame 35 (X between 4° and 25°).', between(35, 'calf_r', 'x', 4, 25)],
      ['The torso leans over the left foot (Z between −28° and −10°).', between(35, 'spine_03', 'z', -28, -10)],
      ['The knee bends before and after the strike.', keys => [24, 50].every(frame => between(frame, 'calf_r', 'x', 65, 135)(keys))],
    ],
  },
  {
    id: 'roulade', level: 'coordination', title: 'Animate a forward roll', skill: 'Tucking and full-body rotation', icon: 'roll',
    frames: 60, view: 'side', editors: [BODY_ROTATION, 'head', 'thigh_r', 'calf_r', BODY], mirror: true,
    referencePhases: [
      { id: 'tuck', frame: 15, label: 'Tuck into the roll' },
      { id: 'inverted', frame: 30, label: 'Shoulder contact' },
      { id: 'recover', frame: 48, label: 'Recover the feet' },
    ],
    goal: 'Tuck the head and legs, carry the body through a complete rotation and recover to standing.',
    observe: 'The Epic clip enters from a landing. Follow the tucked head, shoulder contact and unfolding legs.',
    steps: [
      { frame: 15, joint: 'head', axis: 'x', name: 'Protect the head', text: 'Set Flexion X to about 25° to tuck the chin as the body folds.' },
      { frame: 30, joint: BODY_ROTATION, axis: 'x', name: 'Carry the body over', text: 'Set Rotation X to 180° at the middle of the roll. The legs stay folded.' },
      { frame: 60, joint: BODY_ROTATION, axis: 'x', name: 'Complete the rotation', text: 'Set Rotation X to 360° for a full forward rotation. Inspect the recovery in Side view.' },
    ],
    starter: [key(0), key(15, { ...rollTuck, 'head.x': 0, 'body_rotation.x': 60 }),
      key(30, { ...rollTuck, 'body_rotation.x': 110 }),
      key(48, { ...scaledPose(rollTuck, 0.5), 'body_rotation.x': 300 }), key(60)],
    reference: [key(0), key(15, { ...rollTuck, 'body_rotation.x': 60 }),
      key(30, { ...rollTuck, 'body_rotation.x': 180 }),
      key(48, { ...scaledPose(rollTuck, 0.5), 'body_rotation.x': 300 }), key(60, { 'body_rotation.x': 360 })],
    criteria: [
      ['The chin is tucked at frame 15 (head X between 15° and 40°).', between(15, 'head', 'x', 15, 40)],
      ['The body is inverted at frame 30 (Rotation X between 160° and 200°).', between(30, BODY_ROTATION, 'x', 160, 200)],
      ['A complete rotation ends at frame 60 (Rotation X between 350° and 370°).', between(60, BODY_ROTATION, 'x', 350, 370)],
    ],
  },
];

export function availableJoints(lesson) {
  return lesson.restricted ? lesson.editors : [...joints.keys()];
}

export function drawLesson(rig, lesson, keys, frame, reference) {
  rig.reset();
  if (reference && lesson.referenceMotion) {
    lesson.referenceMotion(rig, frame / FPS);
  } else {
    lesson.foundation?.(rig, frame / FPS);
    applyPose(rig, samplePose(reference ? lesson.reference : keys, frame));
  }
  rig.finish();
}

export function evaluateLesson(lesson, keys) {
  return lesson.criteria.map(([label, test]) => ({ label, passed: test(keys) }));
}

