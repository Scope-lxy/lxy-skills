#!/usr/bin/env python3
import argparse
import difflib
import json
import os
import re
import sys
import unicodedata
import uuid
from pathlib import Path


DEFAULT_SUBTITLE_DIR = Path.home() / "Desktop" / "合成视频" / "字幕"
DEFAULT_MEDIA_DIR = Path.home() / "Desktop" / "企鹅号发布" / "videos"
DEFAULT_LIBRARY = Path(__file__).resolve().parent.parent / "references" / "title-library.tsv"
STYLE_PREFIXES = {"暧昧版": "亲爱的", "祝福版": "姐姐", "急迫版": None}
COVER_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
INVISIBLE_RE = re.compile(r"[\u200B-\u200D\uFEFF]")
FORBIDDEN_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
TIME_RE = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)")


def configure_console():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def read_text(path):
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "utf-16"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnicodeError(f"无法识别字幕编码：{path}")


def parse_time(value):
    match = TIME_RE.search(value)
    if not match:
        return None
    hours, minutes, seconds, fraction = match.groups()
    milliseconds = int((fraction + "000")[:3])
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + milliseconds / 1000


def parse_srt(path):
    text = read_text(path)
    blocks = re.split(r"(?:\r?\n){2,}", text.strip())
    cues = []
    for block in blocks:
        lines = [line.strip() for line in block.splitlines()]
        time_index = next((index for index, line in enumerate(lines) if "-->" in line), None)
        if time_index is None:
            continue
        start_text, end_text = lines[time_index].split("-->", 1)
        start = parse_time(start_text)
        end = parse_time(end_text)
        cue_text = " ".join(line for line in lines[time_index + 1 :] if line)
        cue_text = re.sub(r"<[^>]+>", "", cue_text).strip()
        if cue_text:
            cues.append({"start": start, "end": end, "text": cue_text})
    return cues


def join_cues(cues):
    return " ".join(cue["text"] for cue in cues).strip()


def split_sections(cues):
    timed = [cue for cue in cues if cue["start"] is not None and cue["end"] is not None]
    if len(timed) < 3:
        third = max(1, len(cues) // 3)
        return {
            "opening": join_cues(cues[:third]),
            "lyrics": join_cues(cues[third:-third]),
            "ending": join_cues(cues[-third:]),
        }

    duration = max(cue["end"] for cue in timed)
    opening_end = next((i for i, cue in enumerate(cues) if cue["start"] is not None and cue["start"] >= 25), None)
    for index in range(len(cues) - 1):
        current = cues[index]
        following = cues[index + 1]
        if None in (current["end"], following["start"]):
            continue
        gap = following["start"] - current["end"]
        if current["end"] >= 12 and following["start"] <= 60 and gap >= 4:
            opening_end = index + 1
            break
    opening_end = opening_end or min(1, len(cues))

    ending_start = next(
        (
            i
            for i, cue in enumerate(cues)
            if cue["start"] is not None and cue["start"] >= max(0, duration - 15)
        ),
        len(cues) - 1,
    )
    for index in range(len(cues) - 2, -1, -1):
        current = cues[index]
        following = cues[index + 1]
        if None in (current["end"], following["start"]):
            continue
        gap = following["start"] - current["end"]
        if following["start"] >= max(20, duration - 30) and gap >= 4:
            ending_start = index + 1
            break
    ending_start = max(opening_end, ending_start)

    return {
        "opening": join_cues(cues[:opening_end]),
        "lyrics": join_cues(cues[opening_end:ending_start]),
        "ending": join_cues(cues[ending_start:]),
    }


def files_by_stem(directory, suffixes):
    result = {}
    if not directory.is_dir():
        return result
    for path in directory.iterdir():
        if path.is_file() and path.suffix.lower() in suffixes:
            result.setdefault(path.stem.casefold(), []).append(path)
    return result


def covers_by_base(directory):
    result = {}
    invalid = []
    if not directory.is_dir():
        return result, invalid
    for path in directory.iterdir():
        if not path.is_file() or path.suffix.lower() not in COVER_SUFFIXES:
            continue
        if not path.stem.casefold().endswith("_cover"):
            invalid.append(str(path))
            continue
        base = path.stem[:-6].casefold()
        result.setdefault(base, []).append(path)
    return result, invalid


def scan_batch(subtitle_dir, media_dir):
    errors = []
    if not subtitle_dir.is_dir():
        errors.append(f"字幕目录不存在：{subtitle_dir}")
    if not media_dir.is_dir():
        errors.append(f"视频目录不存在：{media_dir}")
    if errors:
        return {"ok": False, "errors": errors, "items": []}

    subtitles = files_by_stem(subtitle_dir, {".srt"})
    videos = files_by_stem(media_dir, {".mp4"})
    covers, invalid_covers = covers_by_base(media_dir)
    items = []

    for key in sorted(subtitles, key=lambda value: subtitles[value][0].name):
        item_errors = []
        srt_matches = subtitles[key]
        video_matches = videos.get(key, [])
        cover_matches = covers.get(key, [])
        if len(srt_matches) != 1:
            item_errors.append(f"发现 {len(srt_matches)} 个同名字幕")
        if len(video_matches) != 1:
            item_errors.append(f"应有 1 个同名视频，实际发现 {len(video_matches)} 个")
        if len(cover_matches) != 1:
            item_errors.append(f"应有 1 张同名封面，实际发现 {len(cover_matches)} 张")

        srt_path = srt_matches[0]
        sections = {"opening": "", "lyrics": "", "ending": ""}
        full_text = ""
        try:
            cues = parse_srt(srt_path)
            if not cues:
                item_errors.append("字幕中没有解析到有效文案")
            else:
                sections = split_sections(cues)
                full_text = join_cues(cues)
        except (OSError, UnicodeError, ValueError) as exc:
            item_errors.append(str(exc))

        base = srt_path.stem
        items.append(
            {
                "original_base": base,
                "short_name": base[:10],
                "status": "error" if item_errors else "ok",
                "errors": item_errors,
                "paths": {
                    "subtitle": str(srt_path),
                    "video": str(video_matches[0]) if len(video_matches) == 1 else None,
                    "cover": str(cover_matches[0]) if len(cover_matches) == 1 else None,
                },
                "sections": sections,
                "full_text": full_text,
            }
        )

    orphan_videos = [str(path) for key, paths in videos.items() if key not in subtitles for path in paths]
    orphan_covers = [str(path) for key, paths in covers.items() if key not in subtitles for path in paths]
    return {
        "ok": not errors,
        "subtitle_dir": str(subtitle_dir),
        "media_dir": str(media_dir),
        "counts": {
            "subtitles": sum(len(paths) for paths in subtitles.values()),
            "videos": sum(len(paths) for paths in videos.values()),
            "covers": sum(len(paths) for paths in covers.values()),
            "ready": sum(item["status"] == "ok" for item in items),
            "skipped": sum(item["status"] != "ok" for item in items),
        },
        "errors": errors,
        "unmatched_media": {
            "videos": orphan_videos,
            "covers": orphan_covers,
            "covers_without_cover_suffix": invalid_covers,
        },
        "items": items,
    }


def load_plan(path):
    with path.open("r", encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        raise ValueError("计划文件必须是包含 items 数组的 JSON 对象")
    return payload


def comparison_text(title):
    value = INVISIBLE_RE.sub("", unicodedata.normalize("NFKC", title)).casefold()
    for prefix in ("亲爱的", "姐姐"):
        if value.startswith(prefix):
            value = value[len(prefix) :]
    return "".join(character for character in value if unicodedata.category(character)[0] in {"L", "N"})


def read_library(path):
    records = []
    if not path.is_file():
        return records
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        style, separator, title = line.partition("\t")
        if separator and title.strip():
            records.append((style.strip(), title.strip()))
    return records


def title_errors(style, title):
    errors = []
    if not isinstance(title, str) or not title.strip():
        return ["标题不能为空"]
    value = title.strip()
    if len(value) < 20 or len(value) > 30:
        errors.append(f"标题长度为 {len(value)} 字，要求 20–30 字")
    if INVISIBLE_RE.search(value):
        errors.append("标题含不可见字符")
    if FORBIDDEN_RE.search(value):
        errors.append("标题含 Windows 文件名禁止字符")
    if value.endswith((" ", ".")):
        errors.append("标题不能以空格或英文句点结尾")
    prefix = STYLE_PREFIXES.get(style)
    if prefix and not value.startswith(prefix):
        errors.append(f"{style}标题必须以“{prefix}”开头")
    reserved = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
    if value.upper() in reserved:
        errors.append("标题是 Windows 保留文件名")
    return errors


def validate_plan(plan, library_path=DEFAULT_LIBRARY):
    style = plan.get("style")
    errors = []
    warnings = []
    if style not in STYLE_PREFIXES:
        errors.append({"scope": "batch", "message": "style 必须是暧昧版、祝福版或急迫版"})

    seen_titles = {}
    comparable_items = []
    for index, item in enumerate(plan.get("items", []), start=1):
        original = item.get("original_base")
        title = item.get("title")
        if not isinstance(original, str) or not original.strip():
            errors.append({"row": index, "message": "缺少 original_base"})
        for message in title_errors(style, title):
            errors.append({"row": index, "message": message})
        if isinstance(title, str) and title.strip():
            normalized = comparison_text(title)
            if normalized in seen_titles:
                errors.append({"row": index, "message": f"与第 {seen_titles[normalized]} 行标题重复"})
            else:
                seen_titles[normalized] = index
            comparable_items.append((index, title.strip(), normalized))

    for left_index in range(len(comparable_items)):
        row_a, title_a, normalized_a = comparable_items[left_index]
        for row_b, title_b, normalized_b in comparable_items[left_index + 1 :]:
            ratio = difflib.SequenceMatcher(None, normalized_a, normalized_b).ratio()
            if ratio >= 0.84:
                warnings.append(
                    {
                        "scope": "batch_similarity",
                        "rows": [row_a, row_b],
                        "ratio": round(ratio, 3),
                        "message": f"两条标题结构过于相似：{title_a} / {title_b}",
                    }
                )

    references = [(ref_title, comparison_text(ref_title)) for ref_style, ref_title in read_library(library_path) if ref_style == style]
    for row, title, normalized in comparable_items:
        if not references:
            break
        closest_title, closest_normalized = max(
            references,
            key=lambda pair: difflib.SequenceMatcher(None, normalized, pair[1]).ratio(),
        )
        ratio = difflib.SequenceMatcher(None, normalized, closest_normalized).ratio()
        if normalized == closest_normalized:
            errors.append({"row": row, "message": "标题与参考库完全重复，必须原创"})
        elif ratio >= 0.88:
            warnings.append(
                {
                    "scope": "reference_similarity",
                    "row": row,
                    "ratio": round(ratio, 3),
                    "message": f"标题与参考库过于相似：{closest_title}",
                }
            )

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def normalized_path(path):
    return os.path.normcase(os.path.abspath(str(path)))


def same_path(left, right):
    return normalized_path(left) == normalized_path(right)


def locate_single(mapping, key):
    matches = mapping.get(key.casefold(), [])
    return matches[0] if len(matches) == 1 else None, len(matches)


def build_rename_groups(plan):
    subtitle_dir = Path(plan.get("subtitle_dir") or DEFAULT_SUBTITLE_DIR)
    media_dir = Path(plan.get("media_dir") or DEFAULT_MEDIA_DIR)
    subtitles = files_by_stem(subtitle_dir, {".srt"})
    videos = files_by_stem(media_dir, {".mp4"})
    covers, _ = covers_by_base(media_dir)
    ready = []
    skipped = []

    for index, item in enumerate(plan["items"], start=1):
        original = item["original_base"].strip()
        title = item["title"].strip()
        key = original.casefold()
        subtitle, subtitle_count = locate_single(subtitles, key)
        video, video_count = locate_single(videos, key)
        cover, cover_count = locate_single(covers, key)
        reasons = []
        if subtitle_count != 1:
            reasons.append(f"字幕数量为 {subtitle_count}")
        if video_count != 1:
            reasons.append(f"视频数量为 {video_count}")
        if cover_count != 1:
            reasons.append(f"封面数量为 {cover_count}")
        if reasons:
            skipped.append({"row": index, "original_base": original, "errors": reasons})
            continue

        targets = [
            subtitle.with_name(f"{title}{subtitle.suffix}"),
            video.with_name(f"{title}{video.suffix}"),
            cover.with_name(f"{title}_cover{cover.suffix}"),
        ]
        sources = [subtitle, video, cover]
        conflicts = [str(target) for source, target in zip(sources, targets) if target.exists() and not same_path(source, target)]
        if conflicts:
            skipped.append({"row": index, "original_base": original, "errors": [f"目标文件已存在：{path}" for path in conflicts]})
            continue
        ready.append({"row": index, "original_base": original, "title": title, "sources": sources, "targets": targets})
    return ready, skipped


def rename_group(group):
    if all(same_path(source, target) for source, target in zip(group["sources"], group["targets"])):
        return {"status": "unchanged"}

    token = uuid.uuid4().hex
    moves = []
    try:
        for index, (source, target) in enumerate(zip(group["sources"], group["targets"])):
            temporary = source.with_name(f".__title_rename_{token}_{index}{source.suffix}")
            source.rename(temporary)
            moves.append({"source": source, "temporary": temporary, "target": target, "finalized": False})
        for move in moves:
            move["temporary"].rename(move["target"])
            move["finalized"] = True
        return {"status": "renamed"}
    except OSError as exc:
        rollback_errors = []
        for move in reversed(moves):
            try:
                current = move["target"] if move["finalized"] else move["temporary"]
                if current.exists() and not move["source"].exists():
                    current.rename(move["source"])
            except OSError as rollback_exc:
                rollback_errors.append(str(rollback_exc))
        return {"status": "error", "error": str(exc), "rollback_errors": rollback_errors}


def rename_batch(plan, dry_run=False):
    validation = validate_plan(plan)
    if not validation["valid"]:
        return {"ok": False, "validation": validation, "renamed": [], "skipped": []}

    ready, skipped = build_rename_groups(plan)
    if dry_run:
        return {
            "ok": not skipped,
            "dry_run": True,
            "validation": validation,
            "ready": [
                {
                    "row": group["row"],
                    "original_base": group["original_base"],
                    "title": group["title"],
                    "targets": [str(path) for path in group["targets"]],
                }
                for group in ready
            ],
            "skipped": skipped,
        }

    renamed = []
    for group in ready:
        result = rename_group(group)
        entry = {"row": group["row"], "original_base": group["original_base"], "title": group["title"], **result}
        if result["status"] == "error":
            skipped.append(entry)
        else:
            renamed.append(entry)
    return {"ok": not skipped, "validation": validation, "renamed": renamed, "skipped": skipped}


def build_parser():
    parser = argparse.ArgumentParser(description="扫描字幕素材、校验原创标题，并在确认后安全改名三件套。")
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser("scan", help="只读扫描字幕、视频和封面")
    scan.add_argument("--subtitle-dir", type=Path, default=DEFAULT_SUBTITLE_DIR)
    scan.add_argument("--media-dir", type=Path, default=DEFAULT_MEDIA_DIR)

    validate = subparsers.add_parser("validate", help="校验待确认的标题计划")
    validate.add_argument("--plan", type=Path, required=True)
    validate.add_argument("--library", type=Path, default=DEFAULT_LIBRARY)

    rename = subparsers.add_parser("rename", help="确认后同时改名字幕、视频和封面")
    rename.add_argument("--plan", type=Path, required=True)
    rename.add_argument("--dry-run", action="store_true")
    return parser


def main():
    configure_console()
    args = build_parser().parse_args()
    try:
        if args.command == "scan":
            result = scan_batch(args.subtitle_dir, args.media_dir)
        else:
            plan = load_plan(args.plan)
            if args.command == "validate":
                result = validate_plan(plan, args.library)
            else:
                result = rename_batch(plan, dry_run=args.dry_run)
        emit(result)
        return 0 if result.get("ok", result.get("valid", False)) else 1
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        emit({"ok": False, "errors": [str(exc)]})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
