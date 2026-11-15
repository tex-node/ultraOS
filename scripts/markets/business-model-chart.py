"""Business model & marketing chart for the Ultra OS grant application.

Two panels, one story:
  left  - where the money comes from in year one, as a share of revenue with the dollars attached;
  right - how customers arrive: a handful of federation relationships, not app-store discovery.

Run: python scripts/markets/business-model-chart.py <output.png>
"""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "documentation/business-model.png")

INK = "#101614"
MUTED = "#5b6663"
ACCENT = "#00A05A"
ACCENT_SOFT = "#6CC49B"
ACCENT_PALE = "#D6EEE2"
GRID = "#E6EAE8"

# Year-one model. Subscription is the anchor; ticketing scales with a league's own gate; data licensing needs a season first.
STREAMS = [
    ("Subscription", 70, "$30/month per league"),
    ("Ticketing", 25, "5% of every gate processed"),
    ("Data licensing", 5, "signed feed to books & media"),
]
LEAGUES_LOW, LEAGUES_HIGH = 125, 150
SUB_LOW, SUB_HIGH = LEAGUES_LOW * 30 * 12, LEAGUES_HIGH * 30 * 12
TOTAL_LOW, TOTAL_HIGH = SUB_LOW / 0.70, SUB_HIGH / 0.70

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
left = fig.add_axes((0.045, 0.42, 0.46, 0.28))
right = fig.add_axes((0.545, 0.12, 0.42, 0.66))
right.axis("off")
right.set_xlim(0, 10)
right.set_ylim(0, 10)

# ---------------------------------------------------------------- left panel
x = 0.0
colours = [ACCENT, ACCENT_SOFT, ACCENT_PALE]
for (label, share, note), colour in zip(STREAMS, colours):
    left.barh(0, share, left=x, height=0.42, color=colour, edgecolor="white", linewidth=1.5)
    left.text(x + share / 2, 0, f"{share}%", ha="center", va="center",
              fontsize=13 if share >= 10 else 9.5, fontweight="bold",
              color="white" if share >= 25 else INK)
    x += share
left.set_xlim(0, 100)
left.set_ylim(-0.9, 0.9)
left.axis("off")
left.text(0.0, 0.62, "Year one: three streams, in the order they switch on",
         fontsize=12.5, fontweight="bold", ha="left")
left.text(0.0, -0.62,
         f"Subscription  ${SUB_LOW/1000:.0f}–{SUB_HIGH/1000:.0f}k     ·     "
         f"Ticketing  ${SUB_LOW/0.7*0.25/1000:.0f}–{SUB_HIGH/0.7*0.25/1000:.0f}k     ·     "
         f"Data  ${SUB_LOW/0.7*0.05/1000:.0f}–{SUB_HIGH/0.7*0.05/1000:.0f}k",
         fontsize=10.5, color=INK, ha="left")

# legend rows under the bar
y = -1.15
for (label, share, note), colour in zip(STREAMS, colours):
    left.add_patch(plt.Rectangle((0.5, y - 0.18), 2.2, 0.36, color=colour, clip_on=False))
    left.text(3.6, y, f"{label} — {note}", fontsize=10, va="center", color=INK, clip_on=False)
    y -= 0.42
left.set_ylim(-2.2, 0.9)

# --------------------------------------------------------------- right panel
right.text(0.0, 9.85, "How the leagues arrive", fontsize=12.5, fontweight="bold", va="top")
right.text(0.0, 9.15, "one relationship at a time, on purpose", fontsize=10.5,
           color=MUTED, va="top")

steps = [
    ("5 federation intros", "Barbados, Trinidad, Guyana,\nJamaica, Bahamas"),
    (f"{LEAGUES_LOW}–{LEAGUES_HIGH} leagues", "onboarded at the court,\nin one afternoon"),
    ("~45 fixtures each", "recorded, verified,\nsigned off at the buzzer"),
    ("Data partners", "a season of records is\nwhat a bookmaker buys"),
]
y = 7.9
for index, (headline, detail) in enumerate(steps):
    right.add_patch(FancyBboxPatch((0.0, y - 0.70), 9.2, 1.30,
                                   boxstyle="round,pad=0.02,rounding_size=0.12",
                                   facecolor="#F6F9F7" if index % 2 == 0 else "white",
                                   edgecolor=GRID, linewidth=1.0))
    right.text(0.35, y + 0.26, headline, fontsize=10.8, fontweight="bold", va="center")
    right.text(0.35, y - 0.28, detail, fontsize=9.2, color=MUTED, va="center", linespacing=1.4)
    if index < len(steps) - 1:
        right.add_patch(FancyArrowPatch((4.6, y - 0.74), (4.6, y - 1.06),
                                        arrowstyle="-|>", mutation_scale=13,
                                        color=ACCENT, linewidth=1.4))
    y -= 2.02

right.text(0.0, 0.25,
           "Each league becomes the reference for the next:\norganisers talk to each other more than they read brochures.",
           fontsize=9.2, color=INK, va="bottom", style="italic", linespacing=1.45)

# ---------------------------------------------------------------- headings
fig.text(0.045, 0.94, "The business model: small subscriptions, real gates, verified data",
         fontsize=16.5, fontweight="bold", ha="left")
fig.text(0.045, 0.885, "A price a parish league pays itself, and a channel that scales by relationship rather than by ad spend",
         fontsize=10.8, color=MUTED, ha="left")

OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, dpi=200, facecolor="white")
print(f"wrote {OUT}  (total revenue {TOTAL_LOW/1000:.1f}-{TOTAL_HIGH/1000:.1f}k)")
