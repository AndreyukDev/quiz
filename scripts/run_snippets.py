#!/usr/bin/env python3
"""Прогоняет java-сниппеты вопросов с полем `expect` на установленном JDK и сверяет результат.

Запуск:
    python3 scripts/run_snippets.py                  # все блоки
    python3 scripts/run_snippets.py java-core        # один блок
    python3 scripts/run_snippets.py --id <id>        # один вопрос, с полным выводом

Сниппет без `static void main` считается телом main: его оборачивают в класс
со стандартными импортами (см. IMPORTS). Полные программы запускаются как есть
(класс с main должен быть первым в файле). Только stdlib.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

IMPORTS = ("import java.util.*; import java.util.function.*; import java.util.stream.*; "
           "import java.util.concurrent.*; import java.util.concurrent.atomic.*; "
           "import java.math.*; import java.io.*;\n")


def source_for(text):
    if "static void main" in text:
        return IMPORTS + text
    body = "\n".join("        " + line for line in text.splitlines())
    return (IMPORTS + "public class Snippet {\n"
            "    public static void main(String[] args) throws Exception {\n"
            f"{body}\n    }}\n}}\n")


def run(q, verbose=False):
    text = q["code"]["text"]
    text = "\n".join(text) if isinstance(text, list) else text
    exp = q["expect"]
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "Snippet.java"
        f.write_text(source_for(text), encoding="utf-8")
        try:
            p = subprocess.run(["java", str(f)], capture_output=True, text=True, timeout=60, cwd=d)
        except subprocess.TimeoutExpired:
            return False, "таймаут 60 с"
    out = p.stdout.replace("\r\n", "\n").strip()
    err = p.stderr
    problems = []
    if exp.get("compile_error"):
        if "error: compilation failed" not in err:
            problems.append("ожидалась ошибка компиляции, а код скомпилировался")
    else:
        if "error: compilation failed" in err:
            problems.append("не скомпилировалось:\n" + err.strip())
        if "stdout" in exp and out != exp["stdout"].strip():
            problems.append(f"stdout: ожидалось {exp['stdout']!r}, получено {out!r}")
        if "exception" in exp:
            if f'Exception in thread "main" {exp["exception"]}' not in err:
                problems.append(f"ожидалось исключение {exp['exception']}, stderr: {err.strip()[:300]!r}")
        elif p.returncode != 0 and not problems:
            problems.append(f"код возврата {p.returncode}, stderr: {err.strip()[:300]!r}")
    if verbose:
        print("--- stdout ---\n" + p.stdout + "--- stderr ---\n" + p.stderr)
    return not problems, "; ".join(problems)


def main():
    args = sys.argv[1:]
    only_id = None
    if "--id" in args:
        only_id = args[args.index("--id") + 1]
        args = [a for a in args if a not in ("--id", only_id)]
    files = [DATA / f"{a}.json" for a in args] or sorted(
        p for p in DATA.glob("*.json") if p.name != "blocks.json")
    total = failed = 0
    for path in files:
        for q in json.loads(path.read_text(encoding="utf-8")):
            if "expect" not in q or q.get("code", {}).get("lang") != "java":
                continue
            if only_id and q["id"] != only_id:
                continue
            total += 1
            ok, msg = run(q, verbose=bool(only_id))
            print(("OK   " if ok else "FAIL ") + q["id"] + ("" if ok else f"\n     {msg}"))
            failed += not ok
    v = subprocess.run(["java", "-version"], capture_output=True, text=True).stderr.splitlines()
    print(f"\n{total - failed}/{total} сниппетов совпали с expect ({v[0] if v else 'java ?'})")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
