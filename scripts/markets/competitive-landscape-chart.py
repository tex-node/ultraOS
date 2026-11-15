"""Competitive landscape chart for the Ultra OS grant application.

Left  - a positioning map: who is built for the community league, and who carries the record all the way to money.
Right - the same comparison as capabilities, including the columns where we are not the strongest.

Run: python scripts/markets/competitive-landscape-chart.py <output.png>
"""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "documentation/competitive-landscape.png")

INK = "#101614"
MUTED = "#5b6663"
ACCENT = "#00A05A"
ACCENT_DEEP = "#0B7A47"
PALE = "#EAF5EF"
GRID = "#E6EAE8"
AMBER = "#B7791F"
GREY = "#9AA5A1"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "figure.facecolor": "white",
    "axes.facecolor": "white",
    "text.color": INK,
})

fig = plt.figure(figsize=(15.2, 7.4), dpi=200)
m = fig.add_axes((0.105, 0.135, 0.36, 0.60))     # positioning map
t = fig.add_axes((0.515, 0.075, 0.47, 0.70))     # capability matrix

# ------------------------------------------------------------------ map
m.set_xlim(0, 10)
m.set_ylim(0, 10)
m.set_xlabel("built for the community league  →  built for the elite/pro league", fontsize=9.8)
m.set_ylabel("scorekeeping only  →  verified record + what it unlocks", fontsize=9.8)
m.set_xticks([])
m.set_yticks([])
for spine in m.spines.values():
    spine.set_color(GRID)

# the quadrant we occupy: community league + the full stack above the record
m.add_patch(plt.Rectangle((0, 5.2), 5.2, 4.8, facecolor=PALE, edgecolor="none", zorder=0))
m.text(0.25, 9.55, "nobody serves this corner", fontsize=9.2, color=ACCENT_DEEP,
       style="italic", va="top")
m.axhline(5.2, color=GRID, linewidth=1.0, zorder=1)
m.axvline(5.2, color=GRID, linewidth=1.0, zorder=1)

players = [
    ("Paper, Excel,\nWhatsApp", 1.15, 1.15, GREY, False),
    ("Local developers", 2.55, 2.35, GREY, False),
    ("TeamSnap,\nSportsEngine", 5.05, 4.15, GREY, False),
    ("FIBA LiveStats,\nGenius Sports", 8.35, 7.45, GREY, False),
    ("Ultra OS", 2.15, 7.95, ACCENT, True),
]
for label, x, y, colour, is_us in players:
    m.scatter([x], [y], s=430 if is_us else 300, color=colour, zorder=4,
              edgecolor="white", linewidth=2.0)
    above = label.startswith("Paper") or label.startswith("Local")
    m.annotate(label, (x, y), xytext=(0, 20 if above else (-25 if is_us else -21)),
               textcoords="offset points", ha="center", va="bottom" if above else "top",
               fontsize=9.6 if not is_us else 10.4,
               fontweight="bold" if is_us else "normal",
               color=INK if is_us else MUTED)

m.set_title("Where the competition sits", fontsize=12.5, fontweight="bold", loc="left", pad=10)

# -------------------------------------------------------------- matrix
t.axis("off")
t.set_xlim(0, 10)
t.set_ylim(0, 10)

COLUMNS = ["Offline", "Multi-sport", "Gate\npayments", "Verified\nrecord", "Data\nfeed", "$30 / mo"]
COL_X = [3.85, 4.95, 6.05, 7.15, 8.25, 9.35]
ROWS = [
    ("Ultra OS", ["full", "full", "full", "full", "full", "full"], True),
    ("Paper, Excel, WhatsApp", ["full", "full", "none", "none", "none", "full"], False),
    ("TeamSnap, SportsEngine", ["none", "partial", "partial", "partial", "none", "none"], False),
    ("FIBA LiveStats, Genius", ["partial", "none", "none", "full", "full", "none"], False),
    ("Local developers", ["none", "none", "none", "none", "none", "full"], False),
]
MARK = {"full": "●", "partial": "◐", "none": "○"}
COLOUR = {"full": ACCENT, "partial": AMBER, "none": GREY}

t.text(0.0, 9.55, "The same comparison, capability by capability", fontsize=12.5,
       fontweight="bold", va="top")
t.text(0.0, 8.85, "● built in    ◐ partial / add-on    ○ absent", fontsize=9.4, color=MUTED, va="top")

for x, label in zip(COL_X, COLUMNS):
    t.text(x, 8.05, label, fontsize=8.8, color=MUTED, ha="center", va="bottom", linespacing=1.3)
t.plot([0, 9.9], [7.72, 7.72], color=INK, linewidth=1.3)

y = 7.05
for name, marks, is_us in ROWS:
    if is_us:
        t.add_patch(plt.Rectangle((-0.25, y - 0.52), 10.35, 1.04, facecolor=PALE,
                                  edgecolor="none", zorder=0))
    t.text(0.0, y, name, fontsize=10.2 if is_us else 9.8, va="center",
           fontweight="bold" if is_us else "normal", color=INK if is_us else MUTED)
    for x, mark in zip(COL_X, marks):
        t.text(x, y, MARK[mark], fontsize=15.5 if is_us else 14,
               color=COLOUR[mark], ha="center", va="center",
               fontweight="bold" if is_us else "normal")
    y -= 1.28

t.text(0.0, 0.85,
       "Our weak spot is not on this table: no Caribbean reference customer yet. That is a\ndistribution problem, and the reason the ask is introductions as much as capital.",
       fontsize=9.2, color=INK, va="bottom", style="italic", linespacing=1.5)

# -------------------------------------------------------------- headings
fig.text(0.045, 0.945, "Competitive landscape: the corner nobody serves",
         fontsize=16.5, fontweight="bold", ha="left")
fig.text(0.045, 0.895,
         "Everyone else is either free and disposable, or excellent and unaffordable — nobody is both durable and cheap",
         fontsize=10.6, color=MUTED, ha="left")

OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, dpi=200, facecolor="white")
print(f"wrote {OUT}")
