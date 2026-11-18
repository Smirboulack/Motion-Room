# Third-party notices

[Back to the README](README.md)

The [MIT License](LICENSE) covers Motion Room's original source code, documentation and project artwork. Dependencies and externally sourced models, rigs, animations and textures remain under their respective licenses. Their presence in this workspace does not transfer ownership or relicense them under MIT.

## Public source distribution

The current development workspace contains reference files with different distribution terms. In particular, the Epic Games files in `references/epic/` and the Mixamo file `Defeated.fbx` must not be treated as an MIT asset pack. Exclude or replace these raw assets in a public repository unless separate permission covers the distribution.

This requirement also applies to copies in release archives, exported GLBs and repository history. Renaming, converting, trimming or adapting a file does not by itself supply redistribution rights. If assets are omitted, their catalog entries and fixture-dependent tests also need to be adapted: the current default study loads an Epic reference.

## Three.js

- **Authors:** three.js authors.
- **Use:** rendering, rig loading, transform controls and glTF export.
- **License:** MIT.
- **Source:** [Three.js repository](https://github.com/mrdoob/three.js).
- **License text:** [Upstream MIT License](https://github.com/mrdoob/three.js/blob/dev/LICENSE), also installed as `node_modules/three/LICENSE`.

Retain its copyright and permission notice when redistributing Three.js with the application. npm installs the dependency separately; it is not original Motion Room code.

## Playwright (development tests)

- **Authors:** Microsoft Corporation.
- **Use:** optional browser regression runner; not loaded by the studio.
- **License:** Apache License 2.0.
- **Source:** [Playwright](https://github.com/microsoft/playwright).
- **License text:** installed as `node_modules/playwright/LICENSE` and `node_modules/playwright-core/LICENSE`.

## Epic Games — Game Animation Sample

- **Provider:** Epic Games.
- **Files:** `references/epic/*.glb`.
- **Source:** [Game Animation Sample](https://www.fab.com/listings/880e319a-a59e-4ed2-b268-b32dac7fa016).
- **Terms:** [Fab Standard License](https://www.fab.com/eula); use the terms applicable to the acquired content.

The Fab license distinguishes incorporating assets into a project from redistributing the assets themselves. Its published summary disallows standalone redistribution, including free redistribution. The GLBs in this workspace expose editable model and motion data; do not assume that publishing the application's code authorizes distributing these files. They are not MIT or public-domain assets.

| Study | Source motion | Local adaptation |
| --- | --- | --- |
| Idle | `M_Relaxed_Stand_Idle_Loop` | Full standing loop |
| Head turn | Standing character and idle pose | Authored 35-degree head turn, hold and return over two seconds, with a frozen standing body |
| Crouch | Relaxed stand/crouch transitions | Joined down and up transitions |
| Jump and land | Neutral jump start and landing | Separate takeoff and recovery clips |
| Walk cycle | `M_Relaxed_Walk_Loop_F` | Complete gait cycle with source travel |
| Run | `M_Relaxed_Run_Loop_F` | Complete gait cycle with source travel |
| Sprint | `M_Relaxed_Sprint_Loop_F` | Two-step cycle |
| Forward roll | `M_Neutral_Jump_F_Land_Roll_Rfoot` | Landing, forward roll and recovery |

The head-turn motion is an adapted study, not an unmodified Epic performance. The character remains externally sourced.

## Mesh2Motion

- **Provider:** Mesh2Motion.
- **Files:** `references/mesh2motion/arm-raise.glb`, `references/mesh2motion/wave.glb`.
- **Source and dedication:** [Mesh2Motion asset license](https://github.com/Mesh2Motion/mesh2motion-app/blob/main/LICENSE-CC0.MD).
- **Asset license:** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
- **Adaptations:** `Chest_Open` timing adapted to a lateral arm raise; `Greeting` combined with its source character for the wave study.

The upstream asset dedication covers its 3D models, blend files, rigs and animations. This attribution is retained as provenance, even though CC0 does not require it.

## Open Motion Project — ACCAD / The Ohio State University

- **Creator:** ACCAD / The Ohio State University, Open Motion Project.
- **Files:** `references/accad/right-cross.glb`, `references/accad/right-front-kick.glb`.
- **Source:** [MoCap System and Data](https://accad.osu.edu/research/motion-lab/mocap-system-and-data).
- **Motion license:** [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
- **Source takes:** `Male2_E4_CrossRight.bvh`, `Male2_G2_FrontKick.bvh`.
- **Processing:** retargeted and resampled by KinemIQ; idle holds trimmed locally, and kick foot placement aligned with the floor.

Attribution: **Open Motion Project by ACCAD / The Ohio State University, licensed under CC BY 3.0. Retargeted and resampled by KinemIQ; further adapted for Motion Room.** Retain the creator credit, source and license links, and identification of the changes when sharing these adaptations. No endorsement is implied.

The character is derived from **Universal Animation Library 2 by Quaternius**, identified as CC0 on the [pack's source page](https://quaternius.com/packs/universalanimationlibrary2.html). KinemIQ lists its character fitting, ambient occlusion and color adaptations in its [sources and credits](https://kinemiq.app/sources/), and identifies the motion's CC BY license there. These asset credits do not imply that KinemIQ's application code is included in Motion Room.

## Mixamo — X Bot and Defeated

- **Provider:** Adobe / Mixamo.
- **File:** `Defeated.fbx`, supplied to the development workspace.
- **Source:** [Mixamo](https://www.mixamo.com/).
- **Usage information:** [Adobe's Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).
- **Distribution guidance:** [Mixamo licensing FAQ on Adobe Community](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775).
- **Adaptation:** source character and motion retained; the importer consolidates duplicate bone aliases at runtime.

Mixamo permits royalty-free use of characters and animations in projects under its terms. Its published distribution guidance excludes sharing the raw character and animation files with non-team members. The FBX is not MIT-licensed, and supplying it to this workspace is not permission to publish it in a public repository. Use a separately acquired local copy or a redistributable replacement for a public release.

## Archived mannequin — SketchPunk

- **Asset:** UE5 Male Mannequin — Manny — Web Ready.
- **Creator credited by the source listing:** SketchPunk.
- **File:** `ue5_male_mannequin_-_manny_-_web_ready.glb`.
- **Source:** [Sketchfab model listing](https://sketchfab.com/3d-models/ue5-male-mannequin-manny-web-ready-9fcaadd206f449c2ab446d84350df370).
- **Recorded source license:** [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- **Use:** legacy project compatibility and regression-test fixtures; not an active character preset.

Attribution: **UE5 Male Mannequin — Manny — Web Ready by SketchPunk, recorded as CC BY 4.0 at acquisition.** Runtime normalization and posing are performed by Motion Room. Retain attribution and change notices when sharing permitted adaptations. The recorded uploader license does not establish that every underlying component is owned by the uploader; confirm the applicable rights before redistribution.

## User-imported content and exports

Users retain their existing rights in content they import or create. Importing a file, editing it, converting its format, or exporting it from Motion Room does not replace that content's license with MIT. Follow the source model and motion licenses when sharing exports or adding reference files to a public repository.
