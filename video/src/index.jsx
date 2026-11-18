import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Trailer, Thumbnail} from './trailer.jsx';

const Root = () => <>
  <Composition id="MotionRoomYouTube" component={Trailer} width={1920} height={1080} fps={30} durationInFrames={1620} defaultProps={{cut: 'youtube'}} />
  <Composition id="MotionRoomX" component={Trailer} width={1080} height={1350} fps={30} durationInFrames={1080} defaultProps={{cut: 'x'}} />
  <Composition id="MotionRoomShorts" component={Trailer} width={1080} height={1920} fps={30} durationInFrames={1080} defaultProps={{cut: 'shorts'}} />
  <Composition id="MotionRoomThumbnail" component={Thumbnail} width={1920} height={1080} fps={30} durationInFrames={1} />
</>;

registerRoot(Root);
