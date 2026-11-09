#!/usr/bin/env python3
"""Проверяет ссылки из sources: страница открывается, а якорь (#...) на ней существует.

Запуск:
    python3 scripts/check_links.py              # все блоки
    python3 scripts/check_links.py java-core    # один блок
Только stdlib, нужна сеть.
"""
import concurrent.futures as cf
import json
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urldefrag, unquote

DATA = Path(__file__).resolve().parent.parent / "data"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}


def fetch(url, tries=3):
    last = None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except Exception as e:  # сеть иногда моргает — повторяем
            last = e
    return None, str(last)


def main():
    files = [DATA / f"{a}.json" for a in sys.argv[1:]] or sorted(
        p for p in DATA.glob("*.json") if p.name != "blocks.json")
    users = {}
    for f in files:
        for q in json.loads(f.read_text(encoding="utf-8")):
            for s in q["sources"]:
                users.setdefault(s["url"], []).append(q["id"])
    pages = sorted({urldefrag(u)[0] for u in users})
    with cf.ThreadPoolExecutor(8) as ex:
        got = dict(zip(pages, ex.map(fetch, pages)))
    bad = 0
    for url in sorted(users):
        page, frag = urldefrag(url)
        status, body = got[page]
        problem = None
        if status is None and "HTTP Error 403" in body:
            # некоторые сайты (O'Reilly) режут скрипты по TLS-отпечатку — проверить вручную
            print(f"WARN {url}\n     403: сайт не пускает скрипты, открой в браузере")
        elif status != 200:
            problem = f"страница: {status or body}"
        elif frag and not any(f'{attr}="{unquote(frag)}"' in body for attr in ("id", "name")):
            problem = f"нет якоря #{frag}"
        if problem:
            bad += 1
            print(f"FAIL {url}\n     {problem}; вопросы: {', '.join(users[url])}")
    print(f"\n{len(users) - bad}/{len(users)} ссылок в порядке")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
