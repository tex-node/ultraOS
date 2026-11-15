"""Market opportunity chart for the Ultra OS grant application.

Two panels, one argument:
  left  - the Caribbean beachhead, market by market: the league count that drives the revenue line;
  right - the same model on the continent, drawn as a multiplier rather than an invented count.

Run: python scripts/markets/market-opportunity-chart.py <output.png>
"""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "documentation/market-opportunity.png")

INK = "#101614"
MUTED = "#5b6663"
ACCENT = "#00A05A"
ACCENT_SOFT = "#BFE6D2"
GRID = "#E6EAE8"

CARIB = [
    ("Jamaica", 25, 30),
    ("Trinidad", 25, 30),
    ("Guyana", 25, 30),
    ("Barbados", 25, 30),
    ("Bahamas", 25, 30),
]
PRICE = 30
LOW = sum(low for _, low, _ in CARIB)
HIGH = sum(high for _, _, high in CARIB)
MRR_LOW, MRR_HIGH = LOW * PRICE, HIGH * PRICE
ARR_LOW, ARR_HIGH = MRR_LOW * 12, MRR_HIGH * 12

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "figure.facecolor": "white",
    "axes.facecolor": "white",
    "text.color": INK,
    "axes.edgecolor": GRID,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
})

fig = plt.figure(figsize=(13.5, 6.4), dpi=200)
# generous left margin: the first version clipped "Trinidad & Tobago" to "& Tobago".
left = fig.add_axes((0.135, 0.19, 0.47, 0.55))
right = fig.add_axes((0.70, 0.19, 0.27, 0.55))

# ---------------------------------------------------------------- left panel
names = [name for name, _, _ in CARIB]
lows = [low for _, low, _ in CARIB]
highs = [high for _, _, high in CARIB]
positions = list(range(len(names)))

left.barh(positions, lows, height=0.5, color=ACCENT, zorder=3)
left.barh(positions, [h - l for l, h in zip(lows, highs)], left=lows, height=0.5,
          color=ACCENT_SOFT, zorder=3)
for y, (low, high) in enumerate(zip(lows, highs)):
    left.text(high + 0.9, y, f"{low}–{high}", va="center", ha="left", fontsize=11, zorder=4)

left.set_yticks(positions, names, fontsize=12)
left.invert_yaxis()
left.set_xlim(0, 38)
left.set_xlabel("organised leagues per market", fontsize=10.5)
left.grid(axis="x", color=GRID, linewidth=0.9, zorder=0)
left.set_axisbelow(True)
for spine in ("top", "right", "left"):
    left.spines[spine].set_visible(False)
left.set_title(f"{LOW}–{HIGH} leagues, five markets", fontsize=13, fontweight="bold", loc="left", pad=12)

# ---------------------------------------------------------------------------
# right panel: relative scale, not invented counts. Widths are relative to the
# Caribbean total (1.0), so the eye reads "how much bigger", which is the only
# claim the data supports.
right.axis("off")
right.set_xlim(0, 10)
right.set_ylim(0, 10)
right.text(0.0, 9.9, "Then the continent", fontsize=13, fontweight="bold", va="top")
right.text(0.0, 9.35, "same product, same gap", fontsize=10.5, color=MUTED, va="top")

rows = [
    ("Caribbean (5 markets)", 1.0, ACCENT, f"{LOW}–{HIGH} leagues"),
    ("Nigeria", 6.0, ACCENT_SOFT, "20–30× the Caribbean"),
    ("Rest of Africa", 9.0, "none", "not yet counted"),
]
y = 7.15
for label, width, colour, note in rows:
    right.text(0.0, y + 0.55, label, fontsize=10.5, va="bottom", color=MUTED)
    if colour == "none":
        right.add_patch(plt.Rectangle((0.0, y - 0.22), width, 0.44, fill=False,
                                      edgecolor=ACCENT, linewidth=1.3, linestyle=(0, (3, 2))))
    else:
        right.add_patch(plt.Rectangle((0.0, y - 0.22), width, 0.44, facecolor=colour, edgecolor="none"))
    right.text(0.0, y - 0.52, note, fontsize=9.5, va="top", color=INK)
    y -= 2.0

right.text(
    0.0, 0.95,
    "Already proven in the harder market: one\nLagos league, 45 fixtures, and a game\nscored offline that synced whole on reconnect.",
    fontsize=9.2, color=INK, va="top", linespacing=1.55,
)

# ---------------------------------------------------------------- headings
fig.text(0.035, 0.93, "Market opportunity: a Caribbean beachhead, then a continent",
         fontsize=17, fontweight="bold", ha="left")
fig.text(0.035, 0.875, "One product, one price a parish league can pay, and a continent behind it",
         fontsize=11, color=MUTED, ha="left")
fig.text(0.135, 0.075,
         f"${PRICE}/month per league   →   ${MRR_LOW:,}–{MRR_HIGH:,} MRR   →   ${ARR_LOW/1000:.0f}–{ARR_HIGH/1000:.0f}k ARR   before leaving the region",
         fontsize=10.5, color=INK, ha="left")

OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, dpi=200, facecolor="white")
print(f"wrote {OUT}  ({LOW}-{HIGH} leagues / ${MRR_LOW}-{MRR_HIGH} MRR / ${ARR_LOW}-{ARR_HIGH} ARR)")
