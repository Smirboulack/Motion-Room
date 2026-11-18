# Motion Room user guide

[Back to the README](../README.md) | [Asset credits and licenses](../THIRD_PARTY_NOTICES.md)

An English-language 3D character animation practice studio. Study a reference, create your own motion from an empty timeline, or edit an imported animation. You decide how closely to follow the reference and when your animation is finished.

## Start

On Windows, double-click **[Start.cmd](../Start.cmd)** and open [Motion Room](http://localhost:5173/). The launcher installs Three.js on first run if needed. Node.js 22 or newer is required.

From a terminal in the project folder, run `npm ci`, then `npm start`. Keep the local server running while using the studio.

## Practice with a reference

The development library contains 13 studies, from idle and head turns through locomotion and full-body performance. Available references depend on the asset files supplied with your installation; see [asset credits and licenses](../THIRD_PARTY_NOTICES.md). Each study starts with **zero user keys** and the reference character in its bind pose. There are no scores, required poses or automatic assessments.

The reference and your take share one playhead and appear **Side by side**. Use **Overlay** for a transparent comparison or **Solo** to work on your take. **Display** controls spacing, reference opacity and source root motion. Camera shortcuts and **Frame scene** include the characters and any obstacles.

The inspector has three tabs: **Pose** for joints, IK and take settings, **Scene** for obstacles, and **Study** for visual analysis, practice sessions and reference settings.

**Skeleton** makes the joints visible through the meshes, including hand and finger bones when the reference rig provides them. Finger markers and links are thinner so individual joints remain readable. Zoom in to select a finger in the scene, or choose it in **Selected joint**, then drag a gizmo:

| Tool | Shortcut | Behavior |
| --- | --- | --- |
| Move | W | Translate the selected joint or align the whole character |
| Rotate | E | Rotate the selected joint or the whole character |
| Scale | R | Resize a selected scene object, or uniformly scale the whole character; individual joint scales are never edited |

Choose **World** or **Local** for the gizmo axes. Whole-character alignment is static across the take and is included in GLB export. Use a joint, such as the hips or root bone, to animate movement over time.

With **Auto key** enabled, a completed joint drag records one pose at the current frame. Disable it to try poses freely, then press **K** or **Key pose** when ready. Only your own keys appear on the timeline. Choose smooth, linear, stepped or Bézier interpolation, move a selected key to a new frame, and use Undo/Redo to refine a take. **Clear keys** can also be undone.

Duration and frame-rate changes retime existing keys. The viewport keeps the same size when moving between keyed and unkeyed frames.

## IK and contacts

In **Pose → IK & contacts**, choose **IK · reach with hands & feet** and a limb. Move the hand or foot target with the gizmo: the two-bone solver bends the whole limb while keeping its bone lengths fixed. **Flip bend** changes the elbow or knee direction. FK remains available for every joint, including fingers.

To keep a hand or foot planted, pose it first, enter a contact frame range, then choose **Pin current hand / foot**. The contact holds its position and orientation throughout that range and is baked into animation export. Dragging a pinned IK target adjusts the contact location; **Release** removes it. Imported source clips automatically show their root motion when a contact is pinned, so the character's travel and the obstacle positions share a useful world space.

Contacts use the character's static alignment space. Move, rotate or uniformly scale the whole character to align the take and its contacts. Targets beyond a limb's reach are clamped; the solver does not stretch bones. Contacts are authored constraints, without automatic collision simulation.

## Scene objects

Choose **Add object** above the viewport or **Scene → Open object library**. The library includes a wall, low wall, six-step staircase, ladder, box, platform, bench, hurdle, ramp, doorway, balance beam, pole and cylinder. These are real procedural meshes with useful default dimensions in metres.

New objects appear on the floor near your working character and are selected immediately. Click an object in the viewport or select it in **Scene**, then use **W / E / R** to move, rotate or resize it. Objects can have different sizes on each axis. **Snap objects** uses a 10 cm position grid, 15-degree rotations and scale increments. Disable it for fine placement. The numeric position, rotation and dimension fields provide precise adjustments.

**Place on floor** aligns the lowest point with the ground, including after a rotation or scale change. **Focus object** brings its gizmo into view; **Frame scene** fits all characters and objects. Duplicate with **Ctrl/Cmd + D**, remove with **Delete**, or use the buttons in the Scene panel. Creation, placement, duplication and deletion support Undo/Redo and do not create animation keys.

Objects remain fixed throughout a take. They are saved with the project and each saved take, and can optionally be included in the exported GLB.

## Joint channels and curves

Open **Channels** above the timeline to see separate rows for keyed joints. Use **Key joint** to create a key for the selected articulation, then drag a diamond to change its time. Other joints keep their timing. Existing whole-pose keys remain compatible; editing a joint gives it an independent track.

Open **Curves** to inspect a joint's rotation or local translation component. Drag a key to change its time and value, or use the numeric fields. Choose **Bézier** and drag its handles, or enter the four handle values, to shape the interpolation between transforms. Rotation uses quaternion interpolation, with degrees shown for component editing; translation values use the imported rig's local units. Each graph gesture is one Undo step. Opening the editor deliberately changes the layout; seeking between frames does not.

## Practice sessions and visual analysis

In **Study → Motion study**, enable **Show past & future poses** to display blue past poses and amber future poses. Choose your take, the reference or both, and set their frame spacing. **Draw selected joint trajectories** shows the selected joint's path with dots at equal time intervals. Select a wrist, foot or hips to inspect movement and spacing; paths can use the full clip or just the A–B range. These helpers are excluded from GLB export.

In **Practice session**, enter A and B or use **Set A here / Set B here**, then enable **Loop this section**. **Hide reference while I try** lets you practice from memory. **Save take** preserves a named version of the motion, contacts, scene objects, alignment and notes. **New attempt** first preserves the existing nonempty work, then starts a blank attempt; for an imported source clip it starts a new edit pass over the source.

Use **Compare against** to display a saved take beside your current animation, the original reference, or no comparison. **Continue this take** restores a saved version for further editing; Undo returns to the previous motion. Write your own observations in **My notes**. The software does not grade your work or require any particular set of poses.

## Characters and imports

Your working model comes from the chosen animation reference, with its actual skeleton. Standalone character import is unavailable.

- **Import animation** accepts an animated `.fbx` or `.glb` containing its rigged model. The original plays beside an editable copy. Gizmos add keyed rotation and translation corrections over the source motion. A multi-clip file has a **Source clip** selector; each clip keeps its own edits.
- **Import** in **Study → Reference** replaces the comparison motion and uses its model for an empty working take. Existing keyed work or source-motion edits are preserved as a saved project.
- **Edit a copy of this animation** opens the current reference as an editable project.

**Reset reference** restores the reference's initial clip, returns the linked playhead to the start, restores normal playback speed and looping, and resets spacing, opacity, root-motion display, skeleton visibility, comparison layout and camera. It also restores the full practice range, the original comparison and the default analysis settings. It keeps your animation keys, contacts, scene objects, saved takes and whole-character alignment. When editing an imported clip, the original reference stays on the clip being edited.

FBX files must contain the skinned character and its skeleton. Embed textures in the FBX when they are needed; external texture folders are not selected by the single-file importer. GLB files must be self-contained, with their buffers and textures embedded.

The supplied **Defeated.fbx** is available as **Defeated** in the reference library. It imports both X Bot meshes, one 65-bone skeleton and its 6.73-second Mixamo animation. The importer consolidates duplicate FBX bone aliases so both meshes follow the same animated skeleton.

## Free animation and storage

Choose **New animation** to start an empty project using the current character. Set its duration and frame rate and optionally keep the reference. You can animate independently and export without reproducing any example.

**Projects** contains imported animations and saved takes. **Save as a new project** makes a separate copy. Characters, references, poses, joint tracks, contacts, objects, saved versions, notes and study settings are stored locally in the browser. A small synchronous edit journal protects the latest edits during an immediate reload while IndexedDB saves the model and project. Use the same browser and local address to reopen your work; localhost and 127.0.0.1 have separate browser storage.

Use the trash icon beside a saved project to remove it from the project list. **Undo** immediately restores it. The **Trash** view keeps deleted projects across reloads and lets you restore them later with their animation and character intact. Deleting the open project saves its latest changes and returns the workspace to practice.

## Export

**Download animated character (.glb)** exports your character, skeleton, baked motion and whole-character alignment at the project frame rate. Imported source motion, joint tracks and contact constraints are baked together. Enable **Include scene objects in the GLB** to add the static obstacles. Skeleton helpers, ghost poses, trajectories, gizmos and comparison spacing are excluded. Source credits are preserved where available. The resulting GLB can be imported back into Motion Room or another glTF-compatible application.

**Export video** records the current comparison view, including objects and enabled study helpers, in MP4 or WebM according to browser support. Choose 720p or 1080p and 30 or 60 fps. Video export records the full take even when an A–B practice loop is enabled. Animation-file export is GLB; FBX is supported for import.

The model and motion in an export retain their original content licenses. The application's MIT license does not override the terms of third-party or imported assets; see [third-party notices](../THIRD_PARTY_NOTICES.md).

## Other shortcuts

| Shortcut | Action |
| --- | --- |
| Space | Play / pause |
| Left / right arrow | Previous / next frame |
| K | Key the current pose |
| Delete | Delete the selected object, or remove the selected joint/pose key at the playhead |
| Ctrl/Cmd + D | Duplicate the selected scene object |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| F | Frame the scene |
| Shift + F | Focus the selected joint or object |
| 0 / 1 / 3 / 7 | Perspective / front / side / back |
