# Local Game Animation Sample import

The three obstacle studies use a locally acquired Epic Games [Game Animation Sample](https://www.fab.com/listings/880e319a-a59e-4ed2-b268-b32dac7fa016). The scripts export and convert assets; they do not download them or change their license. Keep the raw source assets within the applicable license terms described in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

From the repository root, on Windows with Unreal Engine 5.8 and the sample installed:

```powershell
$UnrealEditor = 'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$SampleProject = 'C:\path\to\GameAnimationSample\GameAnimationSample.uproject'
$ImportScript = (Resolve-Path tools/export-epic-traversal.py).Path
& $UnrealEditor $SampleProject -run=pythonscript "-script=$ImportScript" -EnablePlugins=PythonScriptPlugin,GLTFExporter -unattended -nullrhi -nosound -nosplash
node tools/prepare-epic-traversal.mjs
npm test
```

The Unreal script exports preview meshes, skin weights, animation and root tracks to `%TEMP%/motion-room-traversal/`. Root lock changes are temporary and restored in memory; the sample assets are not saved. Material baking and texture export are disabled, matching the existing neutral reference mannequin.

The Node script writes self-contained `references/epic/vault.glb`, `hurdle.glb` and `mantle.glb`. It retains the original 60 fps timing, selects approach/action/recovery excerpts, rebases horizontal travel to the start, and preserves vertical motion. Unreal centimetres and Z-up coordinates are converted to glTF metres and Y-up coordinates. Sequence names and selected source frames are embedded as provenance.

`src/reference-catalog.js` supplies the fitted obstacles. The application's common 1.85 m character normalization scales the original one-metre obstacle to approximately 1.12 m. Camera fitting samples the complete motion so approach and recovery stay in view. The obstacle tests sweep feet through the traversal, check the vault hand support, and check the destination height. Resizing an obstacle does not retarget or warp the animation.
