import pathlib

p = pathlib.Path("web/src/app/(workspace)/vision/upload/page.tsx")
s = p.read_text(encoding="utf-8")
if "</CloudHarness>" in s:
    print("already closed")
    raise SystemExit(0)

needle = "        />\n      </main>"
if needle not in s:
    raise SystemExit("closing point not found")
s = s.replace(needle, "        />\n        </CloudHarness>\n      </main>", 1)
p.write_text(s, encoding="utf-8", newline="\n")
print("CloudHarness closed")
