import React from 'react';
import {AbsoluteFill, Easing, Freeze, Html5Audio, Img, interpolate, Loop, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/fonts';
import footage from '../public/footage/manifest.json';
import reframing from '../public/footage/reframe.json';

loadFont({family: 'MRInter', url: staticFile('fonts/inter.woff2'), weight: '100 900'});
loadFont({family: 'MRMono', url: staticFile('fonts/mono.woff2'), weight: '500'});

const C = {ink: '#10151b', panel: '#1a242c', line: '#34444d', white: '#f4f6ee', mute: '#a6b6bd', lime: '#c3ef91', cyan: '#70d9ff', gold: '#f2c582'};
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const intro = (frame, delay = 0) => spring({frame: frame - delay, fps: 30, config: {damping: 22, stiffness: 140, mass: 0.8}});
const FONT = 'MRInter, sans-serif', MONO = 'MRMono, monospace';

export const chapters = [
  {id: 'hook', label: 'YOUR NEXT MOVE', title: ['Make your', 'next move.'], body: 'A space to practice 3D character animation.', tags: ['Free', 'Open source', 'Local']},
  {id: 'study', label: '01 / MOTION LIBRARY', title: ['From a run', 'to a sprint.'], body: 'Study the Game Animation Sample.\nCompare flight, drive and rhythm.', tags: ['16 motion studies', 'Original speed']},
  {id: 'scene', label: '02 / OBSTACLE TRAVERSAL', title: ['Over it.', 'Onto it.'], body: 'Vault a wall. Clear a hurdle.\nClimb onto a raised platform.', tags: ['Vault', 'Hurdle', 'Mantle']},
  {id: 'pose', label: '03 / POSE', title: ['Make the', 'pose yours.'], body: 'Work with FK, IK and finger controls.\nSave a pose. Keep a contact planted.', tags: ['FK + IK', 'Pose library', 'Contact pins']},
  {id: 'timing', label: '04 / REFINE', title: ['Find your', 'rhythm.'], body: 'Shape curves. Move groups of keys.\nGive every gesture its own timing.', tags: ['Joint tracks', 'Curves', 'Key groups']},
  {id: 'reference', label: '05 / LOOK CLOSER', title: ['Bring your', 'reference.'], body: 'Sync footage or a pose sheet.\nExplore jumps, rolls and running arcs.', tags: ['Video + images', 'Ghost poses', 'Motion paths']},
  {id: 'export', label: '06 / KEEP CREATING', title: ['Keep', 'every take.'], body: 'Save an editable project.\nExport your character or a video.', tags: ['.motionroom', '.glb', 'Video']},
  {id: 'close', label: 'START YOUR NEXT TAKE', title: ['Your space', 'to animate.'], body: 'No account. No subscription.', tags: ['Free', 'Open source', 'Runs locally']},
];
export const lengths = {youtube: [4, 7, 7, 7, 7, 7, 7, 8], x: [3, 5, 5, 5, 5, 5, 3, 5], shorts: [3, 5, 5, 5, 5, 5, 3, 5]};

const Rectangle = ({x, y, w, h, children, style = {}}) => <div style={{position: 'absolute', left: x, top: y, width: w, height: h, ...style}}>{children}</div>;

const Badge = ({children, color = C.lime, style = {}}) => <div style={{display: 'inline-flex', alignItems: 'center', gap: 10, padding: '11px 18px', border: `1px solid ${color}50`, borderRadius: 100, background: `${color}0d`, color, fontFamily: MONO, fontSize: 20, whiteSpace: 'nowrap', ...style}}><span style={{height: 6, width: 6, borderRadius: 8, background: color}} />{children}</div>;

const Mark = ({size = 76, style = {}}) => <Img src={staticFile('brand/motion-room.png')} style={{width: size, height: size, objectFit: 'contain', ...style}} />;

const GitHub = ({size = 34}) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.55v-2.15c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.09 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.3 3.16 1.18a11 11 0 0 1 5.75 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.42.36.78 1.05.78 2.13v3.17c0 .31.21.66.8.55A11.5 11.5 0 0 0 12 .7Z" /></svg>;

function Background() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: C.ink}}>
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 92% 18%, #43634420 0%, transparent 48%), radial-gradient(ellipse at 5% 95%, #25596920 0%, transparent 52%)'}} />
    <AbsoluteFill style={{opacity: 0.22, backgroundImage: 'linear-gradient(#53626c2b 1px, transparent 1px), linear-gradient(90deg, #53626c2b 1px, transparent 1px)', backgroundSize: '84px 84px', transform: `translateY(${(frame / 80) % 84}px)`}} />
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" style={{position: 'absolute', width: '100%', height: '100%', opacity: 0.22}}>
      <path d="M-30 910 C300 910 350 820 540 820 S950 220 1280 220 S1590 1050 1980 700" fill="none" stroke={C.lime} strokeWidth="1.5" />
      <path d="M-80 960 C260 960 460 950 670 750 S1100 100 1300 140 S1740 930 1960 600" fill="none" stroke={C.cyan} strokeWidth="1" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={175 + i * 440} y={840 - i * 185} width="9" height="9" fill={i % 2 ? C.cyan : C.lime} transform={`rotate(45 ${180 + i * 440} ${845 - i * 185})`} />)}
    </svg>
  </AbsoluteFill>;
}

function Chrome({title, children, width, height, accent = C.lime, style = {}}) {
  return <div style={{position: 'relative', width, height, border: `1px solid ${C.line}`, borderRadius: 22, overflow: 'hidden', boxShadow: '0 28px 80px #0005', background: '#182028', ...style}}>
    <div style={{height: 45, display: 'flex', alignItems: 'center', padding: '0 21px', gap: 8, background: '#182128', borderBottom: '1px solid #34444d'}}>
      {[C.lime, '#526875', '#526875'].map((color, i) => <div key={i} style={{width: 7, height: 7, borderRadius: '50%', background: color, opacity: i ? 0.5 : 1}} />)}
      <span style={{fontFamily: MONO, fontSize: 16, color: '#b5c6cd', marginLeft: 16, letterSpacing: 1.3}}>{title}</span>
      <div style={{marginLeft: 'auto', width: 7, height: 7, borderRadius: 9, background: accent}} />
    </div>
    <div style={{position: 'relative', height: height - 45, overflow: 'hidden'}}>{children}</div>
  </div>;
}

function Clip({name = 'hero', width, height, zoom = 1, position = '50% 50%', offset = 0, rate = 1, loop = true, follow = true, style = {}}) {
  const frame = useCurrentFrame();
  const asset = footage[name];
  if (!asset) throw new Error(`Unregistered footage: ${name}`);
  const playFrames = Math.ceil((asset.frames - offset) / rate);
  const localFrame = loop ? frame % playFrames : Math.min(frame, playFrames - 1);
  const videoFrame = Math.min(asset.frames - 1, offset + localFrame * rate);
  let videoStyle = {position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', objectPosition: position, transform: `scale(${zoom})`};
  const track = follow && reframing[name];
  if (track) {
    const left = Math.floor(videoFrame), fraction = videoFrame - left;
    const a = track.centers[left], b = track.centers[Math.min(left + 1, track.centers.length - 1)];
    const [cx, cy] = a.map((value, axis) => value + (b[axis] - value) * fraction);
    const bodyScale = Math.min(height * 0.77 / (track.maxHeight * asset.height), width * 0.82 / (track.maxWidth * asset.width));
    const scale = Math.max(width / asset.width, height / asset.height, bodyScale);
    const w = asset.width * scale, h = asset.height * scale;
    videoStyle = {position: 'absolute', width: w, height: h,
      left: Math.max(width - w, Math.min(0, width * 0.5 - cx * w)),
      top: Math.max(height - h, Math.min(0, height * 0.48 - cy * h))};
  }
  const video = <OffthreadVideo src={staticFile(`footage/${name}.mp4`)} muted trimBefore={offset} playbackRate={rate} style={videoStyle} />;
  return <div style={{width, height, overflow: 'hidden', position: 'relative', background: '#1a2228', ...style}}>
    {loop ? <Loop durationInFrames={playFrames}>{video}</Loop> : frame >= playFrames ? <Freeze frame={playFrames - 1}>{video}</Freeze> : video}
  </div>;
}

function MotionReel({shots, width, height, labels = true}) {
  let cursor = 0;
  return <div style={{position: 'relative', width, height}}>{shots.map(shot => {
    const start = cursor; cursor += shot.frames;
    return <Sequence key={`${start}-${shot.name}`} from={start} durationInFrames={shot.frames} layout="none">
      <Clip name={shot.name} width={width} height={height} rate={shot.rate ?? 1} loop={shot.loop ?? false} />
      {labels && <div style={{position: 'absolute', left: 24, top: 22}}><Badge color={shot.color ?? C.lime} style={{fontSize: 17, background: '#142028e8'}}>{shot.label}</Badge></div>}
    </Sequence>;
  })}</div>;
}

function Crop({file, crop = [0, 0, 1280, 720], width, height, background = '#182028'}) {
  const s = Math.min(width / crop[2], height / crop[3]);
  return <div style={{width, height, overflow: 'hidden', position: 'relative', background}}>
    <Img src={staticFile(`screens/${file}.jpg`)} style={{position: 'absolute', width: 1280 * s, height: 720 * s, maxWidth: 'none', left: (width - crop[2] * s) / 2 - crop[0] * s, top: (height - crop[3] * s) / 2 - crop[1] * s}} />
  </div>;
}

function Title({data, social, portrait, frame}) {
  const enter = intro(frame, 2);
  const margin = social ? (portrait ? 84 : 64) : 88;
  const width = social ? (portrait ? 864 : 952) : 650;
  return <Rectangle x={margin} y={social ? 153 : 222} w={width} h={social ? 330 : 620}>
    <div style={{fontFamily: MONO, fontSize: social ? 22 : 21, letterSpacing: 2.1, color: C.lime, opacity: interpolate(frame, [0, 8], [0.4, 1], clamp), transform: `translateY(${12 * (1 - enter)}px)`}}>{data.label}</div>
    <div style={{fontSize: social ? 94 : 98, fontWeight: 780, letterSpacing: social ? -5.3 : -6.2, lineHeight: 0.99, marginTop: 27, color: C.white, transform: `translateY(${32 * (1 - enter)}px)`, opacity: interpolate(frame, [0, 10], [0.3, 1], clamp)}}>
      {data.title.map((line, i) => <div key={line} style={{color: i === 1 ? C.lime : C.white}}>{line}</div>)}
    </div>
    <div style={{whiteSpace: 'pre-line', color: C.mute, fontSize: social ? 27 : 29, lineHeight: 1.48, marginTop: social ? 24 : 35, fontWeight: 430, opacity: interpolate(frame, [8, 19], [0, 1], clamp), transform: `translateY(${15 * (1 - intro(frame, 9))}px)`}}>{data.body}</div>
    {!social && <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 40}}>{data.tags.map((tag, i) => <Badge key={tag} color={i === 1 ? C.cyan : C.lime} style={{fontSize: 17, opacity: interpolate(frame, [15 + i * 3, 24 + i * 3], [0, 1], clamp)}}>{tag}</Badge>)}</div>}
  </Rectangle>;
}

function StudyArt({w, h}) {
  const cardW = (w - 18) / 2, cardH = Math.min(h - 42, w * 0.9), videoH = cardH - 130;
  const extraH = h - cardH - 54;
  return <div style={{width: w, height: h, position: 'relative'}}>
    <div style={{display: 'flex', gap: 18}}>{[['run', 'RUN', 'Flight + rhythm', C.lime], ['sprint', 'SPRINT', 'Drive + fast contacts', C.cyan]].map(([name, label, detail, color]) => <Chrome key={name} title={label} width={cardW} height={cardH} accent={color}>
      <Clip name={name} width={cardW} height={videoH} zoom={0.98} />
      <div style={{height: 85, padding: '15px 20px', borderTop: `1px solid ${C.line}`, background: '#18232b'}}><div style={{color, fontSize: 20, fontWeight: 650}}>{detail}</div><div style={{fontFamily: MONO, fontSize: 14, color: C.mute, marginTop: 8}}>ORIGINAL SPEED / 60 FPS SOURCE</div></div>
    </Chrome>)}</div>
    {extraH > 90 && <Rectangle x={0} y={cardH + 18} w={w} h={extraH} style={{border: `1px solid ${C.line}`, borderRadius: 18, overflow: 'hidden', background: '#18232b'}}>
      <Clip name="walk" width={w * 0.48} height={extraH} />
      <Rectangle x={w * 0.52} y={extraH * 0.24} w={w * 0.45} h={100}><div style={{color: C.gold, fontFamily: MONO, fontSize: 21}}>WALK CYCLE</div><div style={{fontSize: 23, color: C.white, marginTop: 12}}>Contact + counter-swing</div></Rectangle>
    </Rectangle>}
    <div style={{position: 'absolute', bottom: 1, left: 0, color: C.mute, fontFamily: MONO, fontSize: 14}}>Motion: Epic Games · Game Animation Sample</div>
  </div>;
}

function PoseArt({w, h, frame, social}) {
  const contacts = frame >= 86;
  const panelW = social ? Math.round(w * 0.43) : 400;
  const panelH = 47 + panelW / 260 * (contacts ? 132 : 211);
  return <div style={{width: w, height: h, position: 'relative'}}>
    <Chrome title="MOTION ROOM / POSE" width={w} height={h}>
      <Clip name="hero" width={w} height={h - 45} zoom={1.05} position="43% 50%" />
    </Chrome>
    <Rectangle x={w - panelW - 16} y={Math.max(85, h - panelH - 48)} w={panelW} h={panelH} style={{border: `1px solid ${contacts ? C.gold : C.lime}66`, boxShadow: '0 15px 55px #0008', borderRadius: 14, overflow: 'hidden'}}>
      <div style={{height: 47, display: 'flex', alignItems: 'center', paddingLeft: 18, background: '#1c2b32', color: contacts ? C.gold : C.lime, fontFamily: MONO, fontSize: 17}}>{contacts ? 'IK + CONTACTS' : 'YOUR POSE LIBRARY'}</div>
      <Crop file={contacts ? 'contacts' : 'pose-library'} crop={contacts ? [998, 358, 260, 132] : [998, 318, 260, 211]} width={panelW} height={panelH - 47} />
    </Rectangle>
  </div>;
}

function TimingArt({w, h, frame, social}) {
  const topH = Math.round(h * 0.39);
  const videoW = Math.min(w, topH * 16 / 9);
  return <Chrome title="MOTION ROOM / TIMING" width={w} height={h}>
    <Rectangle x={(w - videoW) / 2} y={0} w={videoW} h={topH}><Clip name={frame > 95 ? 'run-overlay' : 'run'} width={videoW} height={topH} /></Rectangle>
    {!social && <div style={{position: 'absolute', top: 80, left: 24, fontFamily: MONO, color: C.mute, fontSize: 16, lineHeight: 1.8}}>RUN STUDY<br /><span style={{color: C.lime}}>ARM OFFSETS</span></div>}
    <div style={{position: 'absolute', top: topH - 22, left: 0, width: w, height: h - 45 - topH + 22, borderTop: `1px solid ${C.line}`, background: '#182028'}}>
      <Crop file={frame > 95 ? 'run-channels' : 'run-curves'} crop={[230, 477, 742, 215]} width={w} height={h - 45 - topH + 22} />
      <div style={{position: 'absolute', top: 10, bottom: 8, left: Math.round(45 + ((frame / 3) % Math.max(1, w - 100))), width: 2, background: C.cyan, opacity: 0.65, boxShadow: `0 0 14px ${C.cyan}44`}} />
    </div>
    <div style={{position: 'absolute', top: 20, right: 24}}><Badge style={{fontSize: social ? 17 : 16}}>{frame > 95 ? 'Reference + your take' : 'Every joint. Its own timing.'}</Badge></div>
  </Chrome>;
}

function SpaceArt({w, h, frame, social, duration}) {
  const segment = Math.floor(duration / 3), active = Math.min(2, Math.floor(frame / segment));
  const rate = social ? 0.85 : 0.65;
  const shots = [
    {name: 'vault', label: 'VAULT / HAND SUPPORT', color: C.lime},
    {name: 'hurdle', label: 'HURDLE / NO HAND SUPPORT', color: C.cyan},
    {name: 'mantle', label: 'MANTLE / RAISED LANDING', color: C.gold},
  ].map((shot, i) => ({...shot, rate, frames: i === 2 ? duration - segment * 2 + 10 : segment}));
  return <div style={{width: w, height: h, position: 'relative'}}>
    <Chrome title="MOTION ROOM / OBSTACLE TRAVERSAL" width={w} height={h}>
      <MotionReel shots={shots} width={w} height={h - 45} />
      <div style={{position: 'absolute', bottom: 65, left: 24}}><Badge color={C.gold} style={{fontSize: 14, padding: '8px 12px', background: '#142028ec'}}>{rate}× slow motion</Badge></div>
      <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: 50, display: 'flex', background: '#142028f5', borderTop: `1px solid ${C.line}`}}>{['Vault', 'Hurdle', 'Mantle'].map((label, i) => <div key={label} style={{flex: 1, textAlign: 'center', paddingTop: 15, color: active === i ? [C.lime, C.cyan, C.gold][i] : C.mute, fontFamily: MONO, fontSize: 17, borderTop: `2px solid ${active === i ? [C.lime, C.cyan, C.gold][i] : 'transparent'}`}}>{label}</div>)}</div>
    </Chrome>
  </div>;
}

function ReferenceArt({w, h, frame}) {
  const analysis = frame >= 96;
  const boardW = w * 0.46 - 20, boardH = boardW * 9 / 16 + 34;
  return <Chrome title={analysis ? 'MOTION ROOM / MOTION STUDY' : 'MOTION ROOM / REFERENCE BOARD'} width={w} height={h} accent={C.cyan}>
    {analysis ? <Clip name="run-analysis" width={w} height={h - 45} zoom={1.04} /> : <>
      <MotionReel shots={[{name: 'jump', label: 'JUMP TAKEOFF', frames: 30}, {name: 'landing', label: 'LANDING', frames: 30}, {name: 'roll', label: 'FORWARD ROLL', frames: 36}]} width={w * 0.6} height={h - 45} />
      <Rectangle x={w * 0.54} y={Math.max(120, h - boardH - 80)} w={boardW} h={boardH} style={{border: '1px solid #61777f', borderRadius: 13, overflow: 'hidden', boxShadow: '0 20px 45px #0008'}}>
        <div style={{height: 34, padding: '8px 14px', background: '#142027', fontFamily: MONO, color: C.cyan, fontSize: 14}}>YOUR VIDEO REFERENCE</div>
        <Clip name="walk-comparison" width={boardW} height={boardH - 34} />
      </Rectangle>
      <div style={{position: 'absolute', right: 22, top: 22}}><Badge color={C.cyan} style={{fontSize: 15}}>Video + image reference</Badge></div>
    </>}
    {analysis && <div style={{position: 'absolute', left: 22, bottom: 22, display: 'flex', gap: 10}}><Badge color={C.cyan} style={{fontSize: 15}}>Past poses</Badge><Badge color={C.gold} style={{fontSize: 15}}>Future poses</Badge></div>}
  </Chrome>;
}

function ExportArt({w, h, frame, social}) {
  const move = intro(frame, 8);
  const panelW = social ? Math.round(w * 0.56) : Math.round(w * 0.57);
  return <div style={{width: w, height: h, position: 'relative'}}>
    <div style={{position: 'absolute', left: 0, top: 12, width: panelW, height: h - 20, borderRadius: 21, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 20px 70px #0008'}}>
      <Crop file="export" crop={[433, 35, 402, 639]} width={panelW} height={h - 20} />
    </div>
    <div style={{position: 'absolute', width: w * 0.48, right: 0, top: h * 0.21, display: 'grid', gap: 18, transform: `translateY(${30 * (1 - move)}px)`, opacity: interpolate(frame, [4, 17], [0, 1], clamp)}}>
      {[['.motionroom', 'Keep it editable', C.lime], ['.glb', 'Take the animation', C.cyan], ['VIDEO', 'Share the result', C.gold]].map(([ext, caption, color]) => <div key={ext} style={{padding: social ? '22px 22px' : '25px 25px', borderRadius: 16, border: `1px solid ${color}66`, background: '#152129f2', boxShadow: '0 14px 35px #0005'}}>
        <div style={{fontFamily: MONO, fontSize: social ? 31 : 33, letterSpacing: -1.2, color}}>{ext}</div><div style={{color: C.white, fontSize: social ? 20 : 21, marginTop: 10}}>{caption}</div>
      </div>)}
    </div>
  </div>;
}

function Hook({social, portrait, frame, duration = 120, thumbnail = false}) {
  const {width, height} = useVideoConfig();
  const pad = social ? 64 : 88;
  const part = Math.floor(duration / 3);
  const shots = [
    {name: 'run', label: 'RUN', color: C.lime, frames: part, loop: true},
    {name: 'sprint-front', label: 'SPRINT', color: C.cyan, frames: part, loop: true},
    {name: 'vault', label: 'TRAVERSE', color: C.gold, frames: duration - part * 2 + 10},
  ];
  if (social) {
    const artY = portrait ? 570 : 475, artH = height - artY - (portrait ? 255 : 160);
    return <>
      <Title data={chapters[0]} social portrait={portrait} frame={frame + 6} />
      <Rectangle x={pad} y={artY} w={width - pad * 2} h={artH} style={{borderRadius: 24, overflow: 'hidden', border: `1px solid ${C.lime}55`, transform: `translateY(${20 * (1 - intro(frame + 6))}px)`}}>
        <MotionReel shots={shots} width={width - pad * 2} height={artH} />
      </Rectangle>
    </>;
  }
  return <>
    <Rectangle x={836} y={152} w={1010} h={785} style={{transform: `translateY(${15 * (1 - intro(frame + 8))}px)`, borderRadius: 26, overflow: 'hidden', border: `1px solid ${C.lime}44`, boxShadow: '0 30px 85px #0005'}}>
      {thumbnail ? <Freeze frame={7}><Clip name="sprint" width={1010} height={785} zoom={1.03} /></Freeze> : <MotionReel shots={shots} width={1010} height={785} />}
      <div style={{position: 'absolute', left: 25, bottom: 25}}><Badge style={{fontSize: 18}}>RUN / SPRINT / TRAVERSE</Badge></div>
    </Rectangle>
    <Rectangle x={pad} y={228} w={710} h={650}>
      <div style={{fontFamily: MONO, color: C.cyan, fontSize: 22, letterSpacing: 2.2}}>FREE / OPEN-SOURCE / 3D ANIMATION</div>
      <div style={{fontSize: thumbnail ? 120 : 124, fontWeight: 800, lineHeight: 0.99, letterSpacing: -7.9, marginTop: 40, color: C.white}}>{thumbnail ? 'Animate on' : 'Make your'}<br /><span style={{color: C.lime}}>{thumbnail ? 'your terms.' : 'next move.'}</span></div>
      <div style={{fontSize: 32, lineHeight: 1.45, color: C.mute, marginTop: 38, width: 625}}>Your space to practice<br />3D character animation.</div>
      <div style={{display: 'flex', alignItems: 'center', gap: 18, marginTop: 46, color: C.white}}><Mark size={80} /><div style={{fontWeight: 710, fontSize: 38, letterSpacing: -1.3}}>Motion Room<span style={{color: C.lime}}>.</span></div></div>
    </Rectangle>
  </>;
}

function Closing({social, portrait, frame}) {
  const {width, height} = useVideoConfig();
  const p = intro(frame, 0);
  if (social) {
    const shift = portrait ? 190 : 0;
    return <>
      <Rectangle x={64} y={170 + shift * 0.3} w={width - 128} h={60} style={{textAlign: 'center'}}><Badge style={{fontSize: 21}}>FREE. OPEN SOURCE. LOCAL.</Badge></Rectangle>
      <Rectangle x={width / 2 - 160} y={275 + shift} w={320} h={320} style={{transform: `scale(${0.94 + p * 0.06})`}}><Mark size={320} /></Rectangle>
      <Rectangle x={50} y={610 + shift * 1.5} w={width - 100} h={150} style={{textAlign: 'center', fontSize: 108, fontWeight: 780, color: C.white, letterSpacing: -5.5}}>Motion Room<span style={{color: C.lime}}>.</span></Rectangle>
      <Rectangle x={64} y={775 + shift * 1.65} w={width - 128} h={130} style={{textAlign: 'center', color: C.mute, fontSize: 35, lineHeight: 1.5}}>Your space to animate.<br />No account. No subscription.</Rectangle>
      <Rectangle x={100} y={height - 350} w={width - 200} h={150} style={{borderRadius: 20, background: C.lime, color: C.ink, padding: '24px 26px'}}>
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, fontSize: 32, fontWeight: 740}}><GitHub size={32} /> Get Motion Room</div>
        <div style={{fontFamily: MONO, fontSize: 22, textAlign: 'center', marginTop: 14}}>github.com/Smirboulack/Motion-Room</div>
      </Rectangle>
    </>;
  }
  return <>
    <Rectangle x={1070} y={205} w={650} h={650} style={{transform: `scale(${0.92 + p * 0.08})`}}><Mark size={650} /></Rectangle>
    <Rectangle x={88} y={235} w={1000} h={665}>
      <div style={{fontFamily: MONO, color: C.cyan, fontSize: 22, letterSpacing: 2.5}}>START YOUR NEXT TAKE</div>
      <div style={{fontSize: 110, fontWeight: 790, color: C.white, letterSpacing: -6.3, marginTop: 36, lineHeight: 0.98}}>Your space<br /><span style={{color: C.lime}}>to animate.</span></div>
      <div style={{color: C.mute, fontSize: 31, marginTop: 36}}>No account. No subscription.</div>
      <div style={{display: 'inline-flex', alignItems: 'center', gap: 16, background: C.lime, color: C.ink, padding: '20px 27px', borderRadius: 15, fontSize: 28, fontWeight: 740, marginTop: 42}}><GitHub /> Get Motion Room</div>
      <div style={{fontFamily: MONO, color: C.white, fontSize: 24, marginTop: 25}}>github.com/Smirboulack/Motion-Room</div>
    </Rectangle>
  </>;
}

function FeatureScene({data, social, portrait, frame, duration}) {
  const {width, height} = useVideoConfig();
  const margin = social ? (portrait ? 84 : 64) : 0;
  const rect = social ? {x: margin, y: portrait ? 608 : 532, w: width - margin * 2 - (portrait ? 40 : 0), h: height - (portrait ? 608 : 532) - (portrait ? 270 : 185)} : {x: 795, y: 184, w: 1037, h: 710};
  let art;
  const props = {w: rect.w, h: rect.h, frame, social, duration};
  if (data.id === 'study') art = <StudyArt {...props} />;
  if (data.id === 'pose') art = <PoseArt {...props} />;
  if (data.id === 'timing') art = <TimingArt {...props} />;
  if (data.id === 'scene') art = <SpaceArt {...props} />;
  if (data.id === 'reference') art = <ReferenceArt {...props} />;
  if (data.id === 'export') art = <ExportArt {...props} />;
  return <>
    <Title data={data} social={social} portrait={portrait} frame={frame} />
    <Rectangle {...rect} style={{transform: `translateY(${26 * (1 - intro(frame, 2))}px)`, opacity: interpolate(frame, [0, 10], [0, 1], clamp)}}>{art}</Rectangle>
    {social && <Rectangle x={margin} y={height - (portrait ? 225 : 145)} w={width - margin * 2 - (portrait ? 40 : 0)} h={105} style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', flexWrap: 'wrap', gap: 10}}>{data.tags.map((tag, i) => <Badge key={tag} color={i === 1 ? C.cyan : C.lime} style={{fontSize: 19, padding: '12px 15px'}}>{tag}</Badge>)}</Rectangle>}
  </>;
}

function Scene({data, duration, cut}) {
  const frame = useCurrentFrame();
  const {height, width} = useVideoConfig();
  const social = cut !== 'youtube', portrait = height > 1500;
  const opacity = data.id === 'hook' ? interpolate(frame, [duration, duration + 10], [1, 0], clamp) : interpolate(frame, [0, 8, duration, duration + 10], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{opacity}}>
    {data.id === 'hook' ? <Hook social={social} portrait={portrait} frame={frame} duration={duration} /> : data.id === 'close' ? <Closing social={social} portrait={portrait} frame={frame} /> : <FeatureScene data={data} social={social} portrait={portrait} frame={frame} duration={duration} />}
  </AbsoluteFill>;
}

function Brand({social}) {
  return <div style={{position: 'absolute', top: social ? 46 : 40, left: social ? 59 : 77, right: social ? 64 : 88, display: 'flex', alignItems: 'center', gap: 12}}>
    <Mark size={social ? 62 : 66} />
    <div style={{color: C.white, fontSize: social ? 30 : 30, fontWeight: 740, letterSpacing: -1.2}}>Motion Room<span style={{color: C.lime}}>.</span></div>
    <div style={{marginLeft: 'auto', color: C.mute, fontFamily: MONO, fontSize: social ? 15 : 17, letterSpacing: 1.4}}>ANIMATION PRACTICE</div>
  </div>;
}

export function Trailer({cut = 'youtube'}) {
  const frame = useCurrentFrame();
  const {durationInFrames, width, height} = useVideoConfig();
  const social = cut !== 'youtube', timing = lengths[cut] ?? lengths.youtube;
  let start = 0;
  const sequences = chapters.map((chapter, index) => {
    const duration = timing[index] * 30;
    const sequence = <Sequence key={chapter.id} from={start} durationInFrames={Math.min(duration + 10, durationInFrames - start)}><Scene data={chapter} duration={duration} cut={cut} /></Sequence>;
    start += duration; return sequence;
  });
  const fadeOut = interpolate(frame, [durationInFrames - 9, durationInFrames - 1], [1, 0], clamp);
  return <AbsoluteFill style={{fontFamily: FONT, color: C.white, background: C.ink}}>
    <Background />
    <AbsoluteFill style={{opacity: fadeOut}}>{sequences}<Brand social={social} /></AbsoluteFill>
    <div style={{position: 'absolute', left: social ? 65 : 88, right: social ? 65 : 88, bottom: social ? 57 : 44, height: 2, background: '#52626b55', opacity: fadeOut}}>
      <div style={{height: '100%', width: `${frame / (durationInFrames - 1) * 100}%`, background: C.lime}} />
    </div>
    <Html5Audio src={staticFile(`audio/score-${social ? 'social' : 'youtube'}.m4a`)} volume={1} />
  </AbsoluteFill>;
}

export function Thumbnail() {
  return <AbsoluteFill style={{fontFamily: FONT, color: C.white}}><Background /><Hook social={false} frame={60} thumbnail /><Brand social={false} /><Rectangle x={88} y={957} w={1100} h={60} style={{fontFamily: MONO, fontSize: 23, color: C.mute}}>github.com/Smirboulack/Motion-Room</Rectangle></AbsoluteFill>;
}
