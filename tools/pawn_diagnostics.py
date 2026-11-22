#!/usr/bin/env python3
"""Summarize real pawncc diagnostics without treating a failed build as success."""
import argparse
from collections import Counter
from pathlib import Path
import re

DIAGNOSTIC = re.compile(
    r"(?P<source>[^\r\n]*?):(?P<line>\d+) \(error (?P<code>\d+)\) "
    r"(?P<message>[^\r\n]+)"
)
SYMBOL = re.compile(r'"([^"]+)"')


def analyze_log(text):
    errors = []
    for match in DIAGNOSTIC.finditer(text):
        info = match.groupdict()
        msg = info["message"]
        symbol = SYMBOL.search(msg)
        errors.append({
            "source": info["source"].rsplit("/", 1)[-1],
            "line": int(info["line"]),
            "code": info["code"],
            "symbol": symbol.group(1) if symbol else "(no symbol)",
        })
    groups = Counter((entry["symbol"], entry["code"]) for entry in errors)
    return errors, groups


def markdown(text):
    errors, groups = analyze_log(text)
    rows = ["## Pawn compiler diagnostics", "",
            f"Total errors in captured log: **{len(errors)}**", ""]
    if groups:
        rows += ["| Symbol | Compiler error | Occurrences |",
                 "| --- | --- | ---: |"]
        for (symbol, code), count in sorted(
                groups.items(), key=lambda x: (-x[1], x[0])):
            escaped = symbol.replace("|", r"\|").replace("`", "'")
            rows.append(f"| `{escaped}` | {code} | {count} |")
    else:
        rows += ["No Pawn error diagnostics found in this log.",
                 "This does not prove the game compiled successfully."]
    rows += ["", "A successful build requires a nonempty main.amx.",
             "Error counts can be truncated by the Pawn compiler's diagnostic limit."]
    return "\n".join(rows) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path, help="Real sampctl/pawncc compiler log")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = markdown(args.log.read_text(encoding="utf-8", errors="replace"))
    if args.output:
        args.output.write_text(report, encoding="utf-8")
    print(report, end="")


if __name__ == "__main__":
    main()
