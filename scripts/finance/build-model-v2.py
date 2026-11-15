"""Build the working financial model: four licence products plus a ticketing stream, a part-time team, an unpaid founder,
contractor support that scales with the league count, and marketing held at a share of revenue.

Why a companion workbook: the fund's template has four product slots and no commission line, so ticketing cannot live inside it
without surgery that would break its charts and SUM ranges. This is the same business, with the fifth stream and costs that
move with it.

Every P&L figure is a formula over the Assumptions sheet.

Run: python scripts/finance/build-model-v2.py
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Font, PatternFill, Side, Border
from openpyxl.utils import get_column_letter

OUT = Path(r"C:\Users\XPS\OneDrive\Documents\Projects\NEON Ultra\SOVO\Ultra OS - Financial Model v2 (with ticketing).xlsx")

INK = "FF101614"
HEAD_FILL = PatternFill("solid", fgColor="FFEAF5EF")
THIN = Side(style="thin", color="FFD8DEDB")
BOX = Border(bottom=THIN)

YEARS = ["2027", "2028", "2029"]


def money(cell):
    cell.number_format = '"$"#,##0'
    return cell


def pct(cell):
    cell.number_format = "0%"
    return cell


wb = Workbook()

# ------------------------------------------------------------------ assumptions
a = wb.active
a.title = "Assumptions"
a["A1"] = "Ultra OS — assumptions"
a["A1"].font = Font(bold=True, size=15, color=INK)
a["A2"] = "Change only these cells. Every figure on the P&L is a formula over this sheet."
a["A2"].font = Font(italic=True, size=9, color="FF5B6663")


def block(row, title):
    a.cell(row, 1, title).font = Font(bold=True, size=10, color=INK)
    for col in range(1, 5):
        a.cell(row, col).fill = HEAD_FILL


def label(row, text, note=""):
    a.cell(row, 1, text).font = Font(size=10)
    if note:
        a.cell(row, 5, note).font = Font(italic=True, size=9, color="FF5B6663")


block(4, "Volume")
label(5, "Leagues (cumulative, end of year)")
for i, v in enumerate([100, 250, 625]):
    a.cell(5, 2 + i, v)
label(6, "Scouting profiles")
for i, v in enumerate([350, 875, 2187.5]):
    a.cell(6, 2 + i, v)
label(7, "Data logging seats")
for i, v in enumerate([25, 62.5, 156.25]):
    a.cell(7, 2 + i, v)
label(8, "AI coaching", "bundled into the league licence for now, so it carries no separate revenue")
a.cell(8, 2, 0)
a.cell(8, 3, 0)
a.cell(8, 4, 0)

block(10, "Pricing")
label(11, "League licence (USD / month)", "the $30 quoted throughout the application")
a.cell(11, 2, 30)
label(12, "Scouting profile (USD / year)")
a.cell(12, 2, 30)
label(13, "Data logging seat (USD / month)")
a.cell(13, 2, 20)
label(14, "AI coaching seat (USD / month)")
a.cell(14, 2, 30)

block(16, "Ticketing")
label(17, "Share of leagues selling tickets through us")
for i, v in enumerate([0.40, 0.55, 0.65]):
    pct(a.cell(17, 2 + i, v))
label(18, "Average gate per ticketing league (USD / year)", "one paid gate per fixture, small crowds")
money(a.cell(18, 2, 4000))
label(19, "Our fee on gate processed")
pct(a.cell(19, 2, 0.05))

block(21, "Costs")
label(22, "COGS as % of revenue", "hosting, support and payment processing that scale with usage")
pct(a.cell(22, 2, 0.08))
label(23, "Personnel — part-time base (founder unpaid)")
for i, v in enumerate([5900, 7200, 8925]):
    money(a.cell(23, 2 + i, v))
label(24, "Support contractors (headcount)", "one per ~150 leagues")
for i, v in enumerate([0, 2, 5]):
    a.cell(24, 2 + i, v)
label(25, "Cost per contractor (USD / year)")
money(a.cell(25, 2, 3000))
label(26, "Founder salary forgone (memo)", "a real cost the business does not pay for three years")
for i, v in enumerate([4500, 4500, 4500]):
    money(a.cell(26, 2 + i, v))
label(27, "Operating cost (office, travel, legal, tools)")
for i, v in enumerate([6060, 11505, 7919]):
    money(a.cell(27, 2 + i, v))
label(28, "Marketing as % of revenue")
pct(a.cell(28, 2, 0.05))

block(30, "Capital")
label(31, "Opening capital")
money(a.cell(31, 2, 10000))
label(32, "Grant (non-dilutive, not in EBITDA)", "leave at 0 to see the business on its own revenue")
money(a.cell(32, 2, 0))

for i, width in enumerate([46, 14, 14, 14, 56], start=1):
    a.column_dimensions[get_column_letter(i)].width = width
for row in range(5, 33):
    for col in range(2, 5):
        cell = a.cell(row, col)
        cell.font = Font(size=10)

# ------------------------------------------------------------------------- P&L
p = wb.create_sheet("P&L")
p["A1"] = "Profit & loss"
p["A1"].font = Font(bold=True, size=15)
p["A3"], p["B3"], p["C3"], p["D3"] = "USD", *YEARS
for cell in "ABCD":
    p[f"{cell}3"].font = Font(bold=True, size=10)
    p[f"{cell}3"].fill = HEAD_FILL


def row(n, text, formulas, fmt=money, bold=False, note=None):
    p.cell(n, 1, text).font = Font(bold=bold, size=10)
    for i, f in enumerate(formulas):
        cell = p.cell(n, 2 + i, f)
        fmt(cell)
        if bold:
            cell.font = Font(bold=True)
    if note:
        p.cell(n, 5, note).font = Font(italic=True, size=9, color="FF5B6663")


def col(i):
    return get_column_letter(2 + i)


row(5, "League licences", [f"=Assumptions!{col(i)}5*Assumptions!$B$11*12" for i in range(3)])
row(6, "Scouting profiles", [f"=Assumptions!{col(i)}6*Assumptions!$B$12" for i in range(3)])
row(7, "Data logging seats", [f"=Assumptions!{col(i)}7*Assumptions!$B$13*12" for i in range(3)])
row(9, "Ticketing commission",
    [f"=Assumptions!{col(i)}5*Assumptions!{col(i)}17*Assumptions!$B$18*Assumptions!$B$19" for i in range(3)],
    note="leagues x adoption x average gate x our fee")
row(10, "Total revenue", [f"=SUM({c}5:{c}7)+{c}9" for c in "BCD"], bold=True)
for c in "BCD":
    p[f"{c}10"].border = BOX

row(12, "COGS", [f"={c}10*Assumptions!$B$22" for c in "BCD"])
row(13, "Gross profit", [f"={c}10-{c}12" for c in "BCD"], bold=True)
row(14, "Gross margin", [f"={c}13/{c}10" for c in "BCD"], fmt=pct)

row(16, "Personnel (part-time + contractors)",
    [f"=Assumptions!{col(i)}23+Assumptions!{col(i)}24*Assumptions!$B$25" for i in range(3)])
row(17, "Operating cost", [f"=Assumptions!{col(i)}27" for i in range(3)])
row(18, "Marketing", [f"={c}10*Assumptions!$B$28" for c in "BCD"])
row(19, "Total cost", [f"={c}12+{c}16+{c}17+{c}18" for c in "BCD"], bold=True)
row(21, "EBITDA", [f"={c}13-{c}16-{c}17-{c}18" for c in "BCD"], bold=True)
for c in "BCD":
    p[f"{c}21"].font = Font(bold=True, size=11)
row(22, "EBITDA margin", [f"={c}21/{c}10" for c in "BCD"], fmt=pct)
row(24, "Founder salary forgone (memo)", [f"=Assumptions!{col(i)}26" for i in range(3)])
row(25, "EBITDA if the founder were paid", [f"={c}21-{c}24" for c in "BCD"])
row(27, "Two things to say out loud",
    [f"={c}22" for c in "BCD"], fmt=pct)
p["E27"] = ("Margin is high because the founder is unpaid and there is no sales payroll yet: distribution runs through "
            "federations, not a sales team. The moment we hire ahead of league count, this falls to a normal 30-40%.")

p.column_dimensions["A"].width = 40
for c in "BCD":
    p.column_dimensions[c].width = 15
p.column_dimensions["E"].width = 60

# -------------------------------------------------------------------- cash flow
cf = wb.create_sheet("Cash flow")
cf["A1"] = "Cash flow"
cf["A1"].font = Font(bold=True, size=15)
cf["A3"], cf["B3"], cf["C3"], cf["D3"] = "USD", *YEARS
for cell in "ABCD":
    cf[f"{cell}3"].font = Font(bold=True, size=10)
    cf[f"{cell}3"].fill = HEAD_FILL


def crow(n, text, formulas, bold=False):
    cf.cell(n, 1, text).font = Font(bold=bold, size=10)
    for i, f in enumerate(formulas):
        cell = cf.cell(n, 2 + i, f)
        money(cell)
        if bold:
            cell.font = Font(bold=True)


crow(5, "Opening balance", ["=Assumptions!B31", "=B8", "=C8"])
crow(6, "Cash in: revenue", [f"='P&L'!{col(i)}10" for i in range(3)])
crow(7, "Cash out: COGS, staff, opex, marketing", [f"=-'P&L'!{col(i)}19" for i in range(3)])
crow(8, "Closing balance", [f"={t}5+{t}6+{t}7" for t in "BCD"], bold=True)
crow(10, "Grant (if awarded)", ["=Assumptions!B32", 0, 0])
crow(11, "Closing balance including grant", ["=B8+B10", "=C8", "=D8"])

cf.column_dimensions["A"].width = 40
for cell in "BCD":
    cf.column_dimensions[cell].width = 15

# ----------------------------------------------------------------------- chart
ch = wb.create_sheet("Chart")
ch["A1"] = "Revenue, cost and EBITDA"
ch["A1"].font = Font(bold=True, size=14)
ch["A3"], ch["B3"], ch["C3"], ch["D3"] = "Year", "Revenue", "Total cost", "EBITDA"
for i, year in enumerate(YEARS):
    ch.cell(4 + i, 1, year)
    ch.cell(4 + i, 2, f"='P&L'!{col(i)}10")
    ch.cell(4 + i, 3, f"='P&L'!{col(i)}19")
    ch.cell(4 + i, 4, f"='P&L'!{col(i)}21")

cats = Reference(ch, min_col=1, min_row=4, max_row=6)
bar = BarChart()
bar.type = "col"
bar.title = "Revenue, cost and EBITDA (USD)"
bar.y_axis.title = "USD"
bar.height, bar.width = 9, 18
bar.add_data(Reference(ch, min_col=2, max_col=4, min_row=3, max_row=6), titles_from_data=True)
bar.set_categories(cats)
ch.add_chart(bar, "A9")

ch.cell(3, 6, "League")
ch.cell(3, 7, "Scouting")
ch.cell(3, 8, "Data logging")
ch.cell(3, 9, "Ticketing")
for i in range(4):
    for y in range(3):
        ch.cell(4 + y, 6 + i, f"='P&L'!{col(y)}{5 + i}")

mix = BarChart()
mix.type = "col"
mix.grouping = "stacked"
mix.overlap = 100
mix.title = "Revenue mix by stream (USD)"
mix.height, mix.width = 9, 18
mix.add_data(Reference(ch, min_col=6, max_col=9, min_row=3, max_row=6), titles_from_data=True)
mix.set_categories(cats)
ch.add_chart(mix, "A28")

ch.column_dimensions["A"].width = 12
for i in range(2, 11):
    ch.column_dimensions[get_column_letter(i)].width = 13

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print(f"wrote {OUT.name}\n")

# --------------------------------------------------------------- expected numbers
leagues = [100, 250, 625]
profiles = [350, 875, 2187.5]
seats = [25, 62.5, 156.25]
ai = [25, 62.5, 156.25]
adoption = [0.40, 0.55, 0.65]
personnel = [5900, 7200, 8925]
contractors = [0, 2, 5]
contractor_cost = 3000
opex = [6060, 11505, 7919]
mkt = 0.05
cash = 10000
print("  year    revenue      cogs    staff     opex      mkt    ebitda  margin      cash")
for i, year in enumerate(YEARS):
    league = leagues[i] * 30 * 12
    scout = profiles[i] * 30
    data = seats[i] * 20 * 12
    ticketing = leagues[i] * adoption[i] * 4000 * 0.05
    revenue = league + scout + data + ticketing
    cogs = revenue * 0.08
    staff = personnel[i] + contractors[i] * contractor_cost
    marketing = revenue * mkt
    ebitda = revenue - cogs - staff - opex[i] - marketing
    cash += ebitda
    print(f"  {year}  {revenue:9.0f} {cogs:7.0f} {staff:7.0f} {opex[i]:7.0f} {marketing:7.0f} {ebitda:8.0f}"
          f" {ebitda/revenue:6.0%} {cash:9.0f}")
