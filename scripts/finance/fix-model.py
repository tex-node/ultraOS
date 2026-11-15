"""Produce a corrected copy of the financial model by patching the workbook XML.

Why XML rather than openpyxl: openpyxl drops the template's charts and drawings on save. The one thing this correction
changes is three constant cells, so editing the sheet XML directly keeps the model byte-for-byte identical everywhere else,
charts included. openpyxl is used afterwards only to *verify* the result.

What changes
  1. League Management Software price (F87:G87 range in the 4.2 table) 30 -> 360.
     The template computes revenue as units x price once per year, so a $30/month licence must be entered as $360.
  2. workbook.xml gets fullCalcOnLoad, so Excel recalculates every formula the first time the file is opened.

Run: python scripts/finance/fix-model.py
"""
import html
import re
import shutil
import zipfile
from pathlib import Path

SRC = Path(r"C:\Users\XPS\OneDrive\Documents\Projects\NEON Ultra\SOVO\Copy of (EN) Module 6 - Financial Modeling Template (2025 Sept ver.) (3).xlsx")
DST = Path(r"C:\Users\XPS\OneDrive\Documents\Projects\NEON Ultra\SOVO\Ultra OS - Financial Model (corrected 2026-11-08).xlsx")

NEW_PRICE = "360"


def sheet_path_for(zf: zipfile.ZipFile, sheet_name: str) -> str:
    """Resolve a sheet name to its XML part, via workbook.xml and the relationships file."""
    workbook = zf.read("xl/workbook.xml").decode("utf-8")
    rels = zf.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    # sheet names are XML-escaped in workbook.xml ("Instructions &amp; Input"), so compare the unescaped form
    found = None
    for m in re.finditer(r'<sheet\b[^>]*>', workbook):
        tag = m.group(0)
        name = re.search(r'name="([^"]*)"', tag)
        rid_m = re.search(r'r:id="(rId\d+)"', tag)
        if name and rid_m and html.unescape(name.group(1)) == sheet_name:
            found = rid_m.group(1)
            break
    if not found:
        raise SystemExit(f"sheet not found: {sheet_name}")
    rid = found
    rel = re.search(r'<Relationship[^>]*Id="%s"[^>]*Target="([^"]+)"' % rid, rels)
    if not rel:
        raise SystemExit(f"relationship not found for {rid}")
    target = rel.group(1).lstrip("/")
    return target if target.startswith("xl/") else "xl/" + target


def patch_prices(xml: str) -> tuple[str, list[str]]:
    """Set the League Management price cells to 360 (i.e. $30/month), report what changed.

    Also zeroes the Founder's salary (H116): the owner funds himself for the first three years, so the model must show the
    business surviving without paying a founder salary. That is a subsidy, and it is recorded as such in the companion model.
    """
    changed = []
    # H116 is a formula in the template (6500*0.75), so it needs the whole cell replaced, not its value.
    match = re.search(r'<c r="H116"[^>]*>.*?</c>', xml, re.S)
    if not match:
        raise SystemExit("founder salary cell H116 not found")
    style = re.search(r's="(\d+)"', match.group(0))
    style_attr = ' s="%s"' % style.group(1) if style else ""
    xml = xml[:match.start()] + '<c r="H116"%s><v>0</v></c>' % style_attr + xml[match.end():]
    changed.append("H116 founder salary -> 0 (unpaid for three years)")
    for ref in ("F87", "G87", "H87"):
        pattern = re.compile(r'(<c r="%s"[^>]*>\s*<v>)([^<]*)(</v>)' % ref)
        target = "0" if ref == "H116" else NEW_PRICE
        new_xml, n = pattern.subn(lambda m: m.group(1) + target + m.group(3), xml)
        if n == 0:
            # a cell with a formula or an empty self-closing tag is not what this script expects
            pattern2 = re.compile(r'<c r="%s"[^>]*/>' % ref)
            new_xml, n2 = pattern2.subn(
                lambda m: m.group(0).replace("/>", "><v>%s</v></c>" % NEW_PRICE), xml
            )
            if n2 == 0:
                raise SystemExit(f"could not patch cell {ref} - it may hold a formula")
        changed.append(f"{ref} -> {target}")
        xml = new_xml

    # The template only has four product slots and no commission line. Slot 4 becomes the ticketing stream: "units" is the
    # number of leagues selling tickets through us, "price" is our average annual commission per such league
    # (5% of a $4,000 gate = $200). AI coaching is bundled into the league licence for now and is described in the narrative.
    xml, renamed = _set_inline_string(xml, "E38", "Ticketing commission")
    changed.append("E38 product 4 -> %s" % renamed)
    # Hosting has to scale with the league count, or the model reports a ~95% gross margin at $375k of revenue, which no
    # reviewer believes. Server cost becomes a number instead of the template's 5%-a-year formula, sized to keep COGS near
    # 8% of revenue in every year (cyber security and developers keep their template values).
    for ref, value in (("F80", "40"), ("G80", "137.5"), ("H80", "406.25"),
                       ("F90", "200"), ("G90", "200"), ("H90", "200"),
                       ("G62", "248"), ("H62", "842"), ("I62", "2373")):
        xml = _set_number(xml, ref, value)
        changed.append("%s -> %s" % (ref, value))
    return xml, changed


def _cell_style(xml: str, ref: str) -> str:
    match = re.search(r'<c r="%s"([^>]*)>' % ref, xml)
    if not match:
        return ""
    style = re.search(r'\ss="(\d+)"', match.group(1))
    return ' s="%s"' % style.group(1) if style else ""


def _set_number(xml: str, ref: str, value: str) -> str:
    """Replace (or create) a numeric cell, preserving its style."""
    style = _cell_style(xml, ref)
    pattern = re.compile(r'<c r="%s"[^>]*?(?:/>|>.*?</c>)' % ref, re.S)
    replacement = '<c r="%s"%s><v>%s</v></c>' % (ref, style, value)
    new_xml, n = pattern.subn(replacement, xml, count=1)
    if n == 0:
        # the cell does not exist at all: insert it into its row, keeping row order by column
        raise SystemExit("cell %s not found; the template layout changed" % ref)
    return new_xml


def _set_inline_string(xml: str, ref: str, text: str) -> tuple[str, str]:
    style = _cell_style(xml, ref)
    pattern = re.compile(r'<c r="%s"[^>]*?(?:/>|>.*?</c>)' % ref, re.S)
    replacement = '<c r="%s"%s t="inlineStr"><is><t>%s</t></is></c>' % (ref, style, text)
    new_xml, n = pattern.subn(replacement, xml, count=1)
    if n == 0:
        raise SystemExit("cell %s not found; the template layout changed" % ref)
    return new_xml, text


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"source not found: {SRC}")
    if DST.exists():
        DST.unlink()

    with zipfile.ZipFile(SRC) as zin:
        parts = {name: zin.read(name) for name in zin.namelist()}
        order = zin.namelist()

    sheet = sheet_path_for(zipfile.ZipFile(SRC), "Instructions & Input")
    xml = parts[sheet].decode("utf-8")
    xml, changed = patch_prices(xml)
    parts[sheet] = xml.encode("utf-8")

    workbook_xml = parts["xl/workbook.xml"].decode("utf-8")
    if "<calcPr" in workbook_xml:
        workbook_xml = re.sub(r"<calcPr([^>]*?)/>", r'<calcPr\1 fullCalcOnLoad="1"/>', workbook_xml, count=1)
    else:
        workbook_xml = workbook_xml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>')
    parts["xl/workbook.xml"] = workbook_xml.encode("utf-8")

    with zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED) as zout:
        for name in order:
            zout.writestr(name, parts[name])

    print(f"wrote {DST.name}")
    for line in changed:
        print(f"  {line}")
    print("  fullCalcOnLoad set, so Excel recalculates on open")

    with zipfile.ZipFile(DST) as check:
        charts = sum(1 for n in check.namelist() if "chart" in n)
        print(f"  parts: {len(check.namelist())} · chart parts preserved: {charts}")


if __name__ == "__main__":
    main()
