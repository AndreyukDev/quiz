#!/usr/bin/env python3
"""Валидирует data/*.json и собирает dist/ (index.html со вшитыми данными, PWA-файлы).

Запуск:
    python3 scripts/build.py           # проверить и собрать
    python3 scripts/build.py --check   # только проверить
Только stdlib.
"""
import hashlib
import json
import re
import shutil
import struct
import sys
import zlib
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SRC = ROOT / "src"
DIST = ROOT / "dist"

TYPES = {"mcq", "output", "tf", "recall"}
LEVELS = {"middle", "senior"}
LANGS = {"java", "kotlin", "sql", "js", "ts", "yaml", "bash", "json", "text"}
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

NUM_RE = re.compile(r"^[1-9]\d*\.[1-9]\d*$")

COMMON = {"id", "num", "block", "topic", "type", "level", "question", "code", "explanation",
          "sources", "java_version", "verified"}
ALLOWED = {
    "mcq": COMMON | {"options", "answer"},
    "output": COMMON | {"options", "answer", "expect"},
    "tf": COMMON | {"answer"},
    "recall": COMMON | {"answer_text"},
}


def code_text(code):
    t = code["text"]
    return "\n".join(t) if isinstance(t, list) else t


def validate_question(q, block_id, errors):
    qid = q.get("id", "<без id>")

    def err(msg):
        errors.append(f"{block_id}/{qid}: {msg}")

    if not isinstance(q, dict):
        err("вопрос должен быть объектом")
        return
    t = q.get("type")
    if t not in TYPES:
        err(f"type должен быть одним из {sorted(TYPES)}")
        return
    extra = set(q) - ALLOWED[t]
    if extra:
        err(f"лишние поля для type={t}: {sorted(extra)}")
    if not isinstance(q.get("id"), str) or not ID_RE.match(q["id"]):
        err("id: строка вида a-z0-9 через дефис")
    if q.get("block") != block_id:
        err(f"block должен быть {block_id!r}")
    for f in ("topic", "question", "explanation"):
        if not isinstance(q.get(f), str) or not q[f].strip():
            err(f"{f}: непустая строка")
    if q.get("level") not in LEVELS:
        err(f"level: одно из {sorted(LEVELS)}")

    src = q.get("sources")
    if not isinstance(src, list) or not src:
        err("sources: хотя бы один источник")
    else:
        for s in src:
            if not (isinstance(s, dict) and set(s) == {"title", "url"}
                    and isinstance(s["title"], str) and s["title"].strip()
                    and isinstance(s["url"], str) and s["url"].startswith("https://")):
                err(f"sources: {{title, url(https://)}}, получено {s!r}")

    if "code" in q:
        c = q["code"]
        if not (isinstance(c, dict) and set(c) == {"lang", "text"}):
            err("code: {lang, text}")
        else:
            if c["lang"] not in LANGS:
                err(f"code.lang: одно из {sorted(LANGS)}")
            ok_text = isinstance(c["text"], str) or (
                isinstance(c["text"], list) and all(isinstance(x, str) for x in c["text"]))
            if not ok_text or not code_text(c).strip():
                err("code.text: строка или массив строк, непустой")

    if "verified" in q:
        v = q["verified"]
        if not (isinstance(v, dict) and set(v) == {"by", "at"}
                and isinstance(v["by"], str) and isinstance(v["at"], str) and DATE_RE.match(v["at"])):
            err("verified: {by, at: YYYY-MM-DD}")
    if "java_version" in q and not isinstance(q["java_version"], str):
        err("java_version: строка")

    if t in ("mcq", "output"):
        opts = q.get("options")
        if not (isinstance(opts, list) and 2 <= len(opts) <= 6
                and all(isinstance(o, str) and o.strip() for o in opts)):
            err("options: 2–6 непустых строк")
        elif len({o.strip() for o in opts}) != len(opts):
            err("options: варианты повторяются")
        ans = q.get("answer")
        if not (isinstance(ans, int) and not isinstance(ans, bool)
                and isinstance(opts, list) and 0 <= ans < len(opts)):
            err("answer: индекс единственного верного варианта")
    if t == "output":
        if "code" not in q:
            err("output: нужен code")
        e = q.get("expect")
        if not isinstance(e, dict) or not e or set(e) - {"stdout", "exception", "compile_error"}:
            err("expect: {stdout?, exception?, compile_error?}")
        elif e.get("compile_error") is not None and set(e) != {"compile_error"}:
            err("expect: compile_error не сочетается с stdout/exception")
        elif ("stdout" in e and not isinstance(e["stdout"], str)) or (
                "exception" in e and not isinstance(e["exception"], str)):
            err("expect.stdout/exception: строки")
        elif set(e) == {"stdout"} and isinstance(q.get("options"), list) \
                and isinstance(q.get("answer"), int) and 0 <= q["answer"] < len(q["options"]):
            if q["options"][q["answer"]].strip() != e["stdout"].strip():
                err("верный вариант не совпадает с expect.stdout")
    if t == "tf" and not isinstance(q.get("answer"), bool):
        err("tf: answer — true/false")
    if t == "recall" and (not isinstance(q.get("answer_text"), str) or not q["answer_text"].strip()):
        err("recall: нужен answer_text")


def load_all():
    errors = []
    blocks = json.loads((DATA / "blocks.json").read_text(encoding="utf-8"))
    ids = set()
    nums = set()
    questions = []
    seen_blocks = set()
    for b in blocks:
        if not (isinstance(b, dict) and set(b) == {"id", "title", "icon", "order"}):
            errors.append(f"blocks.json: {{id, title, icon, order}}, получено {b!r}")
            continue
        if b["id"] in seen_blocks:
            errors.append(f"blocks.json: повтор блока {b['id']}")
        seen_blocks.add(b["id"])
        path = DATA / f"{b['id']}.json"
        if not path.exists():
            errors.append(f"нет файла {path.relative_to(ROOT)}")
            continue
        try:
            items = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{path.name}: невалидный JSON: {e}")
            continue
        if not isinstance(items, list):
            errors.append(f"{path.name}: ожидается массив вопросов")
            continue
        for q in items:
            validate_question(q, b["id"], errors)
            qid = q.get("id") if isinstance(q, dict) else None
            if qid in ids:
                errors.append(f"{b['id']}/{qid}: id не уникален")
            ids.add(qid)
            num = q.get("num") if isinstance(q, dict) else None
            if not (isinstance(num, str) and NUM_RE.match(num)):
                errors.append(f"{b['id']}/{qid}: num — строка вида «<order блока>.<номер>», например 1.25")
            elif num.split(".")[0] != str(b["order"]):
                errors.append(f"{b['id']}/{qid}: num {num} должен начинаться с {b['order']}. (order блока)")
            elif num in nums:
                errors.append(f"{b['id']}/{qid}: num {num} не уникален")
            nums.add(num)
            questions.append(q)
    for f in DATA.glob("*.json"):
        if f.name != "blocks.json" and f.stem not in seen_blocks:
            errors.append(f"{f.name}: блока нет в blocks.json")
    blocks.sort(key=lambda b: b.get("order", 0))
    return blocks, questions, errors


def report(blocks, questions):
    for b in blocks:
        qs = [q for q in questions if q["block"] == b["id"]]
        types = Counter(q["type"] for q in qs)
        topics = Counter(q["topic"] for q in qs)
        ver = sum(1 for q in qs if "verified" in q)
        print(f"{b['icon']} {b['id']}: {len(qs)} вопр. | "
              + ", ".join(f"{k}={v}" for k, v in sorted(types.items()))
              + f" | verified {ver}/{len(qs)}")
        for t, n in sorted(topics.items(), key=lambda x: -x[1]):
            print(f"    {n:2d}  {t}")


# ---------- иконки (PNG без зависимостей) ----------

def png(size, pixel):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixel(x / size, y / size))
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


BG = (79, 70, 229)
WHITE = (255, 255, 255)
CHECK = (22, 163, 74)


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def icon_pixel(u, v):
    # карточка со скруглёнными углами и галочкой; поля — под maskable safe zone
    x0, y0, x1, y1, r = 0.27, 0.22, 0.73, 0.78, 0.06
    cx = min(max(u, x0 + r), x1 - r)
    cy = min(max(v, y0 + r), y1 - r)
    if ((u - cx) ** 2 + (v - cy) ** 2) ** 0.5 <= r:
        if min(seg_dist(u, v, 0.37, 0.51, 0.46, 0.60), seg_dist(u, v, 0.46, 0.60, 0.64, 0.40)) < 0.035:
            return CHECK
        return WHITE
    return BG


ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" fill="#4f46e5"/>
<rect x="27" y="22" width="46" height="56" rx="6" fill="#fff"/>
<path d="M37 51 L46 60 L64 40" fill="none" stroke="#16a34a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""


def build(blocks, questions):
    payload = {"blocks": blocks, "questions": questions}
    data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    data_json = data_json.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js = (SRC / "app.js").read_text(encoding="utf-8")
    version = hashlib.sha256((html + css + js + data_json).encode()).hexdigest()[:10]
    out = (html.replace("/*__CSS__*/", css)
               .replace("/*__DATA__*/", f"window.QUIZ={data_json};window.QUIZ_VERSION='{version}';")
               .replace("/*__APP__*/", js))

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    (DIST / "index.html").write_text(out, encoding="utf-8")
    sw = (SRC / "sw.js").read_text(encoding="utf-8").replace("__VERSION__", version)
    (DIST / "sw.js").write_text(sw, encoding="utf-8")
    shutil.copy(SRC / "manifest.webmanifest", DIST / "manifest.webmanifest")
    (DIST / "icon.svg").write_text(ICON_SVG, encoding="utf-8")
    for s in (180, 192, 512):
        (DIST / f"icon-{s}.png").write_bytes(png(s, icon_pixel))
    (DIST / ".nojekyll").write_text("")
    kb = (DIST / "index.html").stat().st_size / 1024
    print(f"собрано: dist/index.html ({kb:.0f} КБ), версия {version}")


def main():
    blocks, questions, errors = load_all()
    if errors:
        print("ОШИБКИ ВАЛИДАЦИИ:")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    report(blocks, questions)
    if "--check" not in sys.argv:
        build(blocks, questions)


if __name__ == "__main__":
    main()
