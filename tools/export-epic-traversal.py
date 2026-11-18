"""Run with UnrealEditor-Cmd -run=pythonscript -script=<this file>.

Exports locally acquired Game Animation Sample assets without saving changes to
the Unreal project. Run prepare-epic-traversal.mjs afterwards. Raw assets retain
Epic's license; this script supplies no permission to redistribute them.
"""
import json
import os
from pathlib import Path

import unreal

folder = Path(os.environ["TEMP"]) / "motion-room-traversal"
folder.mkdir(parents=True, exist_ok=True)
base = "/Game/Characters/UEFN_Mannequin/Animations/Traversal/"
choices = [
    ("vault", "Hurdle/M_Neutral_Traversal_Hurdle_1_0_run_F_V2_Rfoot"),
    ("hurdle", "Hurdle/M_Neutral_Traversal_Hurdle_1_0_run_F_Rfoot"),
    ("mantle", "Mantle/M_Neutral_Traversal_Mantle_1_0_run_F_Lfoot"),
]
options = unreal.GLTFExportOptions()
options.set_editor_property("export_preview_mesh", True)
options.set_editor_property("export_vertex_skin_weights", True)
options.set_editor_property("export_animation_sequences", True)
options.set_editor_property("bake_material_inputs", unreal.GLTFMaterialBakeMode.DISABLED)
options.set_editor_property("texture_image_format", unreal.GLTFTextureImageFormat.NONE)

for identifier, relative in choices:
    asset = unreal.load_asset(base + relative)
    if not isinstance(asset, unreal.AnimSequence):
        raise RuntimeError("Missing source animation: " + relative)
    original = {key: asset.get_editor_property(key) for key in ("enable_root_motion", "force_root_lock")}
    try:
        for key in original:
            asset.set_editor_property(key, False)
        duration = asset.get_play_length()
        root = []
        for frame in range(round(duration * 60) + 1):
            time = min(duration, frame / 60)
            transform = unreal.AnimationLibrary.extract_root_track_transform(asset, time)
            p, q = transform.translation, transform.rotation
            root.append([time, [p.x, p.y, p.z], [q.x, q.y, q.z, q.w]])
        result = unreal.GLTFExporter.export_to_gltf(asset, str(folder / (identifier + ".glb")), options, set())
        if not (folder / (identifier + ".glb")).is_file():
            raise RuntimeError("GLTF export failed: " + str(result))
        (folder / (identifier + ".json")).write_text(json.dumps({
            "sequence": relative.split("/")[-1], "package": base + relative,
            "duration": duration, "root": root,
        }), encoding="utf-8")
        unreal.log("MOTION_ROOM_TRAVERSAL " + identifier + " " + str(duration))
    finally:
        for key, value in original.items():
            asset.set_editor_property(key, value)
