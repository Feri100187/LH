#!/usr/bin/env python3
"""Read-only GLB 2.0 skin/animation validator using the Python standard library.

Run with Python, or with Blender --background --python THIS_FILE -- [arguments].
The JSON report distinguishes structural validation from visual inspection; it
does not claim that a passing file has attractive motion or collision-free hands.
"""

from __future__ import annotations

import argparse
import base64
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys


DEFAULT_PATH = Path(
    "D:/a/xiang_mu/LH/source_art/AnimeWatergunBoy/rigged_20260919/"
    "AnimeWatergunBoy_Rigged.glb"
)
COMPONENTS = {
    5120: ("b", 1, -128, 127),
    5121: ("B", 1, 0, 255),
    5122: ("h", 2, -32768, 32767),
    5123: ("H", 2, 0, 65535),
    5125: ("I", 4, 0, 4294967295),
    5126: ("f", 4, None, None),
}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
          "MAT2": 4, "MAT3": 9, "MAT4": 16}


class ValidationError(Exception):
    pass


def numeric_finite(value):
    if isinstance(value, (int, float)):
        return math.isfinite(value)
    if isinstance(value, (list, tuple)):
        return all(numeric_finite(item) for item in value)
    if isinstance(value, dict):
        return all(numeric_finite(item) for item in value.values())
    return True


def norm(values):
    return math.sqrt(sum(v * v for v in values))


class Validator:
    def __init__(self, path, args):
        self.path = Path(path).resolve()
        self.args = args
        self.doc = {}
        self.buffers = []
        self.accessor_cache = {}
        self.errors = []
        self.warnings = []
        self.report = {
            "validator": "AnimatedGLB-stdlib-1.0",
            "checked_utc": datetime.now(timezone.utc).isoformat(),
            "file": str(self.path),
            "status": "FAIL",
            "scope": "Binary structure, hierarchy, skins, weights, animation data and loop endpoints",
            "visual_inspection": "NOT_PERFORMED_BY_THIS_SCRIPT",
            "tolerances": {
                "weight_sum": args.weight_tolerance,
                "loop_translation_m": args.loop_translation_tolerance,
                "loop_rotation_degrees": args.loop_rotation_tolerance,
                "loop_scale": args.loop_scale_tolerance,
            },
        }

    def error(self, message):
        self.errors.append(message)

    def warn(self, message):
        self.warnings.append(message)

    def require_index(self, index, items, label):
        if not isinstance(index, int) or index < 0 or index >= len(items):
            raise ValidationError(f"{label}: invalid index {index!r}")
        return items[index]

    def read(self):
        raw = self.path.read_bytes()
        self.report["byte_length"] = len(raw)
        self.report["sha256"] = hashlib.sha256(raw).hexdigest()
        if len(raw) < 20:
            raise ValidationError("GLB header is truncated")
        magic, version, declared_length = struct.unpack_from("<4sII", raw)
        if magic != b"glTF" or version != 2:
            raise ValidationError("Expected a GLB 2.0 file")
        if declared_length != len(raw):
            raise ValidationError(f"GLB length {declared_length} does not match file length {len(raw)}")
        chunks = []
        pos = 12
        while pos < len(raw):
            if pos + 8 > len(raw):
                raise ValidationError("Truncated chunk header")
            length, chunk_type = struct.unpack_from("<II", raw, pos)
            pos += 8
            if length % 4:
                self.error("GLB chunk length is not aligned to four bytes")
            if pos + length > len(raw):
                raise ValidationError("GLB chunk exceeds file length")
            chunks.append((chunk_type, raw[pos:pos + length]))
            pos += length
        if not chunks or chunks[0][0] != 0x4E4F534A:
            raise ValidationError("First GLB chunk must be JSON")
        if sum(kind == 0x4E4F534A for kind, _ in chunks) != 1:
            self.error("Expected exactly one JSON chunk")
        bins = [data for kind, data in chunks if kind == 0x004E4942]
        if len(bins) > 1:
            self.error("More than one BIN chunk")
        self.doc = json.loads(chunks[0][1].rstrip(b" \t\r\n\0"))
        if self.doc.get("asset", {}).get("version") != "2.0":
            self.error("asset.version is not 2.0")
        if not numeric_finite(self.doc):
            raise ValidationError("JSON contains NaN or infinity")
        for i, buf in enumerate(self.doc.get("buffers", [])):
            uri = buf.get("uri")
            if uri is None and i == 0 and bins:
                payload = bins[0]
            elif isinstance(uri, str) and uri.startswith("data:") and ";base64," in uri:
                payload = base64.b64decode(uri.split(",", 1)[1], validate=True)
            else:
                raise ValidationError(f"buffer {i} is external or absent; expected self-contained GLB")
            needed = buf.get("byteLength", -1)
            if not isinstance(needed, int) or needed < 0 or needed > len(payload):
                raise ValidationError(f"buffer {i} byteLength is outside binary data")
            self.buffers.append(payload[:needed])
        for i, view in enumerate(self.doc.get("bufferViews", [])):
            buf = self.require_index(view.get("buffer"), self.buffers, f"bufferView {i}")
            start, size = view.get("byteOffset", 0), view.get("byteLength", -1)
            if start < 0 or size < 0 or start + size > len(buf):
                self.error(f"bufferView {i} range exceeds buffer")
            if "byteStride" in view and (view["byteStride"] < 4 or view["byteStride"] > 252 or view["byteStride"] % 4):
                self.error(f"bufferView {i} has invalid byteStride")
            if "EXT_meshopt_compression" in view.get("extensions", {}):
                raise ValidationError("Compressed meshopt buffers are unsupported; validate an uncompressed export")
        self.report["asset"] = self.doc.get("asset", {})
        self.report["extensions_used"] = self.doc.get("extensionsUsed", [])

    def view_bytes(self, index):
        view = self.require_index(index, self.doc.get("bufferViews", []), "bufferView")
        payload = self.require_index(view.get("buffer"), self.buffers, "buffer")
        start, length = view.get("byteOffset", 0), view["byteLength"]
        if start < 0 or length < 0 or start + length > len(payload):
            raise ValidationError(f"bufferView {index} is out of bounds")
        return payload[start:start + length], view

    @staticmethod
    def element_layout(kind, byte_size):
        if kind.startswith("MAT"):
            side = int(kind[-1])
            column_bytes = ((side * byte_size + 3) // 4) * 4
            return [col * column_bytes + row * byte_size for col in range(side) for row in range(side)], side * column_bytes
        return [i * byte_size for i in range(WIDTHS[kind])], WIDTHS[kind] * byte_size

    def accessor(self, index):
        if index in self.accessor_cache:
            return self.accessor_cache[index]
        ac = self.require_index(index, self.doc.get("accessors", []), "accessor")
        kind, component = ac.get("type"), ac.get("componentType")
        if kind not in WIDTHS or component not in COMPONENTS:
            raise ValidationError(f"accessor {index} has invalid type/componentType")
        fmt, byte_size, low, high = COMPONENTS[component]
        offsets, element_size = self.element_layout(kind, byte_size)
        count = ac.get("count")
        if not isinstance(count, int) or count < 1:
            raise ValidationError(f"accessor {index} has invalid count")

        def unpack_rows(data, start, stride, row_count):
            if start < 0 or start % byte_size or stride < element_size:
                raise ValidationError(f"accessor {index} has invalid offset/stride")
            if start + (row_count - 1) * stride + element_size > len(data):
                raise ValidationError(f"accessor {index} exceeds bufferView")
            return [tuple(struct.unpack_from("<" + fmt, data, start + row * stride + off)[0] for off in offsets)
                    for row in range(row_count)]

        if "bufferView" in ac:
            payload, view = self.view_bytes(ac["bufferView"])
            rows = unpack_rows(payload, ac.get("byteOffset", 0), view.get("byteStride", element_size), count)
        else:
            rows = [tuple(0 for _ in offsets) for _ in range(count)]
        if "sparse" in ac:
            sparse = ac["sparse"]
            sparse_count = sparse.get("count", 0)
            if sparse_count < 1 or sparse_count > count:
                raise ValidationError(f"accessor {index} has invalid sparse count")
            ix = sparse["indices"]
            if ix.get("componentType") not in (5121, 5123, 5125):
                raise ValidationError(f"accessor {index} has invalid sparse index componentType")
            ix_fmt, ix_size, _, _ = COMPONENTS[ix["componentType"]]
            ix_data, _ = self.view_bytes(ix["bufferView"])
            ix_start = ix.get("byteOffset", 0)
            if ix_start < 0 or ix_start + sparse_count * ix_size > len(ix_data):
                raise ValidationError(f"accessor {index} sparse indices exceed bufferView")
            indices = struct.unpack_from("<" + str(sparse_count) + ix_fmt, ix_data, ix_start)
            if any(a >= b for a, b in zip(indices, indices[1:])) or indices[-1] >= count:
                raise ValidationError(f"accessor {index} sparse indices are not strictly increasing/in range")
            sv = sparse["values"]
            val_data, _ = self.view_bytes(sv["bufferView"])
            values = unpack_rows(val_data, sv.get("byteOffset", 0), element_size, sparse_count)
            for row, value in zip(indices, values):
                rows[row] = value
        if ac.get("normalized"):
            if component in (5125, 5126):
                raise ValidationError(f"accessor {index} illegally normalizes uint32/float values")
            rows = [tuple(max(-1.0, v / high) if low < 0 else v / high for v in row) for row in rows]
        if not numeric_finite(rows):
            raise ValidationError(f"accessor {index} contains NaN or infinity")
        self.accessor_cache[index] = rows
        return rows

    def validate_hierarchy(self):
        nodes = self.doc.get("nodes", [])
        parents = {}
        for i, node in enumerate(nodes):
            children = node.get("children", [])
            if len(children) != len(set(children)):
                self.error(f"node {i} contains duplicate children")
            for child in children:
                self.require_index(child, nodes, f"node {i} child")
                if child in parents and parents[child] != i:
                    self.error(f"node {child} has multiple parents")
                parents[child] = i
            if "matrix" in node and any(key in node for key in ("translation", "rotation", "scale")):
                self.error(f"node {i} has both matrix and TRS transforms")
            for key, width in (("matrix", 16), ("translation", 3), ("rotation", 4), ("scale", 3)):
                if key in node and len(node[key]) != width:
                    self.error(f"node {i} {key} has invalid size")
            if "rotation" in node and abs(norm(node["rotation"]) - 1) > 0.005:
                self.error(f"node {i} rotation is not a unit quaternion")
            if "mesh" in node:
                self.require_index(node["mesh"], self.doc.get("meshes", []), f"node {i} mesh")
            if "skin" in node:
                self.require_index(node["skin"], self.doc.get("skins", []), f"node {i} skin")
                if "mesh" not in node:
                    self.error(f"node {i} has skin without mesh")
        for start in range(len(nodes)):
            seen, current = set(), start
            while current in parents:
                if current in seen:
                    self.error(f"node hierarchy cycle at node {current}")
                    break
                seen.add(current)
                current = parents[current]
        for i, scene in enumerate(self.doc.get("scenes", [])):
            for node in scene.get("nodes", []):
                self.require_index(node, nodes, f"scene {i} root")
                if node in parents:
                    self.error(f"scene {i} root node {node} has a parent")
        self.parents = parents
        self.report["hierarchy"] = {"nodes": len(nodes), "scenes": len(self.doc.get("scenes", [])),
                                    "mesh_nodes": sum("mesh" in n for n in nodes),
                                    "skinned_mesh_nodes": sum("skin" in n for n in nodes)}

    def validate_meshes(self):
        total_vertices, total_triangles, primitive_count = 0, 0, 0
        for mi, mesh in enumerate(self.doc.get("meshes", [])):
            for pi, primitive in enumerate(mesh.get("primitives", [])):
                primitive_count += 1
                attrs = primitive.get("attributes", {})
                if "KHR_draco_mesh_compression" in primitive.get("extensions", {}):
                    raise ValidationError("Draco primitives unsupported; validate an uncompressed export")
                if "POSITION" not in attrs:
                    self.error(f"mesh {mi} primitive {pi} has no POSITION")
                    continue
                positions = self.accessor(attrs["POSITION"])
                if self.doc["accessors"][attrs["POSITION"]]["type"] != "VEC3":
                    self.error(f"mesh {mi} primitive {pi} POSITION is not VEC3")
                count = len(positions)
                total_vertices += count
                for name, ac in attrs.items():
                    if len(self.accessor(ac)) != count:
                        self.error(f"mesh {mi} primitive {pi} {name} count differs from POSITION")
                if "indices" in primitive:
                    index_ac = self.doc["accessors"][primitive["indices"]]
                    if index_ac.get("type") != "SCALAR" or index_ac.get("componentType") not in (5121, 5123, 5125):
                        self.error(f"mesh {mi} primitive {pi} invalid triangle index accessor")
                    indices = self.accessor(primitive["indices"])
                    if any(v[0] < 0 or v[0] >= count for v in indices):
                        self.error(f"mesh {mi} primitive {pi} triangle index exceeds vertex count")
                    index_count = len(indices)
                else:
                    index_count = count
                if primitive.get("mode", 4) == 4:
                    if index_count % 3:
                        self.error(f"mesh {mi} primitive {pi} triangle index count is not divisible by 3")
                    total_triangles += index_count // 3
                if "material" in primitive:
                    self.require_index(primitive["material"], self.doc.get("materials", []), f"mesh {mi} material")
        self.report["geometry"] = {"meshes": len(self.doc.get("meshes", [])), "primitives": primitive_count,
                                   "vertices_in_primitives": total_vertices, "triangles": total_triangles,
                                   "materials": len(self.doc.get("materials", [])),
                                   "images": len(self.doc.get("images", []))}

    def validate_skins(self):
        nodes, skins = self.doc.get("nodes", []), self.doc.get("skins", [])
        if not skins:
            self.error("No skin found")
        skin_reports = []
        self.all_joints = set()
        for si, skin in enumerate(skins):
            joints = skin.get("joints", [])
            if not joints or len(joints) != len(set(joints)):
                self.error(f"skin {si} joints are empty or duplicated")
            for joint in joints:
                self.require_index(joint, nodes, f"skin {si} joint")
            self.all_joints.update(joints)
            if "inverseBindMatrices" in skin:
                ac = self.doc["accessors"][skin["inverseBindMatrices"]]
                matrices = self.accessor(skin["inverseBindMatrices"])
                if ac["type"] != "MAT4" or ac["componentType"] != 5126 or len(matrices) != len(joints):
                    self.error(f"skin {si} inverseBindMatrices must be one FLOAT MAT4 per joint")
            else:
                self.warn(f"skin {si} omits inverseBindMatrices; identity bind matrices are assumed by glTF")
            if "skeleton" in skin:
                self.require_index(skin["skeleton"], nodes, f"skin {si} skeleton")
                for joint in joints:
                    current, seen = joint, set()
                    while current != skin["skeleton"] and current in self.parents and current not in seen:
                        seen.add(current)
                        current = self.parents[current]
                    if current != skin["skeleton"]:
                        self.error(f"skin {si} skeleton is not ancestor of joint {joint}")
            mesh_reports = []
            for ni, node in enumerate(nodes):
                if node.get("skin") != si or "mesh" not in node:
                    continue
                mesh = self.doc["meshes"][node["mesh"]]
                for pi, primitive in enumerate(mesh.get("primitives", [])):
                    attrs = primitive.get("attributes", {})
                    count = len(self.accessor(attrs["POSITION"]))
                    joint_sets = sorted(int(key[7:]) for key in attrs if key.startswith("JOINTS_"))
                    weight_sets = sorted(int(key[8:]) for key in attrs if key.startswith("WEIGHTS_"))
                    label = f"skin {si} node {ni} primitive {pi}"
                    if not joint_sets or joint_sets != weight_sets or joint_sets != list(range(len(joint_sets))):
                        self.error(f"{label} has missing/nonmatching JOINTS_n and WEIGHTS_n")
                        continue
                    sums = [0.0] * count
                    influences = [0] * count
                    bad_joint_count, negative_weight_count = 0, 0
                    for group in joint_sets:
                        jac, wac = attrs[f"JOINTS_{group}"], attrs[f"WEIGHTS_{group}"]
                        jmeta, wmeta = self.doc["accessors"][jac], self.doc["accessors"][wac]
                        if jmeta["type"] != "VEC4" or jmeta["componentType"] not in (5121, 5123) or jmeta.get("normalized"):
                            self.error(f"{label} JOINTS_{group} must be unnormalized unsigned VEC4")
                        if wmeta["type"] != "VEC4" or wmeta["componentType"] not in (5121, 5123, 5126):
                            self.error(f"{label} WEIGHTS_{group} has invalid type")
                        if wmeta["componentType"] != 5126 and not wmeta.get("normalized"):
                            self.error(f"{label} integer weights must be normalized")
                        js, ws = self.accessor(jac), self.accessor(wac)
                        for vi, (joint_row, weight_row) in enumerate(zip(js, ws)):
                            if vi >= count:
                                break
                            for joint, weight in zip(joint_row, weight_row):
                                bad_joint_count += not (0 <= joint < len(joints))
                                negative_weight_count += weight < -1e-7
                                sums[vi] += weight
                                influences[vi] += weight > 1e-7
                    errors = [abs(value - 1.0) for value in sums]
                    unweighted = sum(value <= 1e-7 for value in sums)
                    invalid_sums = sum(error > self.args.weight_tolerance for error in errors)
                    if bad_joint_count or negative_weight_count or invalid_sums:
                        self.error(f"{label}: invalid joint indices={bad_joint_count}, negative weights={negative_weight_count}, bad weight sums={invalid_sums}")
                    mesh_reports.append({"node": ni, "name": node.get("name", ""), "primitive": pi,
                                         "vertices": count, "joint_sets": len(joint_sets),
                                         "max_influences": max(influences, default=0),
                                         "unweighted_vertices": unweighted,
                                         "weight_sum_max_error": max(errors, default=0),
                                         "invalid_joint_indices": bad_joint_count,
                                         "negative_weights": negative_weight_count})
            if not mesh_reports:
                self.error(f"skin {si} has no valid skinned primitives")
            skin_reports.append({"index": si, "name": skin.get("name", ""), "joint_count": len(joints),
                                 "joint_names": [nodes[j].get("name", str(j)) for j in joints],
                                 "skinned_primitives": mesh_reports})
        self.report["skins"] = skin_reports

    def validate_animations(self):
        clips = self.doc.get("animations", [])
        if not clips:
            self.error("No animations found")
        names = [clip.get("name", "") for clip in clips]
        for name, count in Counter(names).items():
            if not name or count > 1:
                self.error(f"Animation name is empty or duplicated: {name!r}")
        expected, loop_names = set(self.args.expected), set(self.args.loops)
        for missing in sorted(expected - set(names)):
            self.error(f"Expected animation is missing: {missing}")
        for extra in sorted(set(names) - expected):
            if expected:
                self.warn(f"Unexpected additional animation: {extra}")
        reports = []
        for ai, clip in enumerate(clips):
            name = clip.get("name", f"Animation_{ai}")
            samplers = clip.get("samplers", [])
            channels = clip.get("channels", [])
            if not samplers or not channels:
                self.error(f"{name}: empty samplers or channels")
            used_samplers, targets, animated_joints, moving_joints = set(), set(), set(), set()
            changing_channels = 0
            start_times, end_times = [], []
            channel_reports = []
            max_translation, max_rotation, max_scale, max_weights = 0.0, 0.0, 0.0, 0.0
            key_count, max_time_grid_error, max_quaternion_error = 0, 0.0, 0.0
            for ci, channel in enumerate(channels):
                si = channel.get("sampler")
                sampler = self.require_index(si, samplers, f"{name} channel {ci} sampler")
                used_samplers.add(si)
                target = channel.get("target", {})
                node_index, path = target.get("node"), target.get("path")
                node = self.require_index(node_index, self.doc.get("nodes", []), f"{name} channel {ci} target")
                if path not in ("translation", "rotation", "scale", "weights"):
                    self.error(f"{name} channel {ci}: unsupported target path {path!r}")
                    continue
                if (node_index, path) in targets:
                    self.error(f"{name}: duplicate animation target {node_index}/{path}")
                targets.add((node_index, path))
                if node_index in self.all_joints:
                    animated_joints.add(node_index)
                if "matrix" in node and path != "weights":
                    self.error(f"{name}: animated node {node_index} uses matrix instead of TRS")
                input_index, output_index = sampler.get("input"), sampler.get("output")
                times = self.accessor(input_index)
                outputs = self.accessor(output_index)
                imeta, ometa = self.doc["accessors"][input_index], self.doc["accessors"][output_index]
                if imeta["type"] != "SCALAR" or imeta["componentType"] != 5126:
                    self.error(f"{name} channel {ci}: time accessor must be FLOAT SCALAR")
                time_values = [row[0] for row in times]
                if time_values[0] < -1e-7 or any(a >= b for a, b in zip(time_values, time_values[1:])):
                    self.error(f"{name} channel {ci}: keyframe times are negative or not strictly increasing")
                start_times.append(time_values[0])
                end_times.append(time_values[-1])
                max_time_grid_error = max(max_time_grid_error, max(abs(t * self.args.fps - round(t * self.args.fps)) for t in time_values))
                key_count += len(times)
                interpolation = sampler.get("interpolation", "LINEAR")
                if interpolation not in ("LINEAR", "STEP", "CUBICSPLINE"):
                    self.error(f"{name} channel {ci}: invalid interpolation {interpolation!r}")
                multiplier = 3 if interpolation == "CUBICSPLINE" else 1
                components = {"translation": "VEC3", "rotation": "VEC4", "scale": "VEC3", "weights": "SCALAR"}[path]
                if ometa["type"] != components or ometa["componentType"] != 5126:
                    self.error(f"{name} channel {ci}: output must be FLOAT {components}")
                weight_width = 1
                if path == "weights":
                    mesh = self.require_index(node.get("mesh"), self.doc.get("meshes", []), f"{name} morph target mesh")
                    weight_width = len(mesh.get("weights", [])) or len(mesh.get("primitives", [{}])[0].get("targets", []))
                    if not weight_width:
                        self.error(f"{name} channel {ci}: weight animation has no morph targets")
                        weight_width = 1
                expected_output = len(times) * multiplier * weight_width
                if len(outputs) != expected_output:
                    self.error(f"{name} channel {ci}: output count {len(outputs)} != expected {expected_output}")
                    continue
                value_index = 1 if interpolation == "CUBICSPLINE" else 0
                if path == "weights":
                    first_offset = value_index * weight_width
                    last_offset = ((len(times) - 1) * multiplier + value_index) * weight_width
                    first = tuple(row[0] for row in outputs[first_offset:first_offset + weight_width])
                    last = tuple(row[0] for row in outputs[last_offset:last_offset + weight_width])
                else:
                    first = outputs[value_index]
                    last = outputs[(len(times) - 1) * multiplier + value_index]
                if path == "weights":
                    sampled_values = [tuple(row[0] for row in outputs[(key * multiplier + value_index) * weight_width:
                                                                    (key * multiplier + value_index + 1) * weight_width])
                                      for key in range(len(times))]
                else:
                    sampled_values = outputs[value_index::multiplier]
                if path == "rotation":
                    peak_component_change = max(min(norm([a - b for a, b in zip(first, value)]),
                                                    norm([a + b for a, b in zip(first, value)]))
                                                for value in sampled_values)
                else:
                    peak_component_change = max(norm([a - b for a, b in zip(first, value)]) for value in sampled_values)
                if peak_component_change > 1e-6:
                    changing_channels += 1
                    if node_index in self.all_joints:
                        moving_joints.add(node_index)
                if path == "rotation":
                    values = outputs[value_index::multiplier]
                    quaternion_error = max(abs(norm(value) - 1.0) for value in values)
                    max_quaternion_error = max(max_quaternion_error, quaternion_error)
                    if quaternion_error > 0.005:
                        self.error(f"{name} channel {ci}: rotation keys are not unit quaternions")
                    denom = norm(first) * norm(last)
                    cosine = min(1.0, abs(sum(a * b for a, b in zip(first, last))) / denom) if denom > 1e-15 else 0.0
                    endpoint_error = math.degrees(2.0 * math.acos(cosine))
                    max_rotation = max(max_rotation, endpoint_error)
                    unit = "degrees"
                else:
                    endpoint_error = norm([a - b for a, b in zip(first, last)])
                    if path == "translation":
                        max_translation = max(max_translation, endpoint_error)
                        unit = "meters"
                    elif path == "scale":
                        max_scale = max(max_scale, endpoint_error)
                        unit = "unitless"
                    else:
                        max_weights = max(max_weights, endpoint_error)
                        unit = "unitless"
                channel_reports.append({"node": node_index, "node_name": node.get("name", ""),
                                        "path": path, "keyframes": len(times), "interpolation": interpolation,
                                        "start_s": time_values[0], "end_s": time_values[-1],
                                        "peak_component_change_from_first_key": peak_component_change,
                                        "endpoint_error": endpoint_error, "endpoint_error_unit": unit})
            duration = max(end_times, default=0) - min(start_times, default=0)
            if duration <= 0:
                self.error(f"{name}: non-positive duration")
            if not animated_joints:
                self.error(f"{name}: no skin joint is animated")
            if not changing_channels:
                self.error(f"{name}: all channels are constant; this is a static pose, not a motion clip")
            if len(used_samplers) != len(samplers):
                self.warn(f"{name}: contains unused animation samplers")
            if min(start_times, default=0) > 1e-6:
                self.warn(f"{name}: clip does not start at zero seconds")
            is_loop = name in loop_names
            loop_ok = (max_translation <= self.args.loop_translation_tolerance
                       and max_rotation <= self.args.loop_rotation_tolerance
                       and max_scale <= self.args.loop_scale_tolerance
                       and max_weights <= self.args.loop_scale_tolerance)
            if is_loop and not loop_ok:
                self.error(f"{name}: loop endpoints differ (translation={max_translation:.6g} m, rotation={max_rotation:.6g} deg, scale={max_scale:.6g})")
            reports.append({"name": name, "duration_s": duration,
                            "start_s": min(start_times, default=0), "end_s": max(end_times, default=0),
                            "channels": len(channels), "samplers": len(samplers),
                            "channel_keyframes_total": key_count,
                            "animated_skin_joints": len(animated_joints),
                            "moving_skin_joints": len(moving_joints),
                            "changing_channels": changing_channels,
                            "all_keyframes_finite": True,
                            "max_quaternion_norm_error": max_quaternion_error,
                            "max_time_grid_error_frames": max_time_grid_error,
                            "loop_expected": is_loop,
                            "loop_endpoint_status": "PASS" if is_loop and loop_ok else "FAIL" if is_loop else "NOT_REQUIRED",
                            "endpoint_errors": {"translation_m": max_translation, "rotation_degrees": max_rotation,
                                                "scale": max_scale, "weights": max_weights},
                            "channel_details": channel_reports})
        self.report["animations"] = reports

    def run(self):
        try:
            self.read()
            for i in range(len(self.doc.get("accessors", []))):
                self.accessor(i)
            self.report["accessors_checked"] = len(self.accessor_cache)
            self.validate_hierarchy()
            self.validate_meshes()
            self.validate_skins()
            self.validate_animations()
        except (OSError, ValueError, TypeError, KeyError, IndexError, struct.error, ValidationError) as exc:
            self.error(f"Validation stopped: {type(exc).__name__}: {exc}")
        self.report["errors"] = self.errors
        self.report["warnings"] = self.warnings
        self.report["status"] = "PASS" if not self.errors else "FAIL"
        return self.report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=DEFAULT_PATH)
    parser.add_argument("--output", type=Path, help="Also save the JSON report at this path")
    parser.add_argument("--expected", nargs="*", default=["Idle", "Walk", "Run", "Jump", "Shoot", "RunJump"])
    parser.add_argument("--loops", nargs="*", default=["Idle", "Walk", "Run"])
    parser.add_argument("--fps", type=float, default=30.0)
    parser.add_argument("--weight-tolerance", type=float, default=1e-3)
    parser.add_argument("--loop-translation-tolerance", type=float, default=1e-4)
    parser.add_argument("--loop-rotation-tolerance", type=float, default=0.1)
    parser.add_argument("--loop-scale-tolerance", type=float, default=1e-4)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    report = Validator(args.path, args).run()
    rendered = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    print(rendered)
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
