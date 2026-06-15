import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import type { GraphicData } from "@/lib/content-template";

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fit(value: string, maximum = 44) {
  return value.length > maximum ? `${value.slice(0, maximum - 3)}...` : value;
}

export function renderGraphicSvg(data: GraphicData) {
  const stats = (data.stats ?? []).slice(0, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#050807"/>
  <circle cx="930" cy="120" r="250" fill="#16f2b3" opacity=".12"/>
  <circle cx="80" cy="980" r="280" fill="#16f2b3" opacity=".07"/>
  <rect x="70" y="70" width="940" height="940" rx="36" fill="#0b100e" stroke="#26332e" stroke-width="2"/>
  <text x="110" y="145" fill="#16f2b3" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="6">${xml((data.kicker ?? "ULTRA BASKETBALL").toUpperCase())}</text>
  <text x="110" y="235" fill="#ffffff" font-family="Arial, sans-serif" font-size="46" font-weight="700">${xml(data.title.toUpperCase())}</text>
  <line x1="110" y1="275" x2="970" y2="275" stroke="#26332e" stroke-width="2"/>
  <text x="110" y="400" fill="#ffffff" font-family="Arial, sans-serif" font-size="72" font-weight="800">${xml(fit(data.headline, 34))}</text>
  ${data.subheadline ? `<text x="110" y="475" fill="#a1a1aa" font-family="Arial, sans-serif" font-size="34">${xml(fit(data.subheadline, 52))}</text>` : ""}
  ${stats.map((stat, index) => {
    const x = 110 + (index % 2) * 430;
    const y = 610 + Math.floor(index / 2) * 150;
    return `<g><text x="${x}" y="${y}" fill="#71717a" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2">${xml(stat.label.toUpperCase())}</text><text x="${x}" y="${y + 58}" fill="#ffffff" font-family="Arial, sans-serif" font-size="44" font-weight="700">${xml(fit(stat.value, 20))}</text></g>`;
  }).join("")}
  ${data.footer ? `<text x="110" y="930" fill="#a1a1aa" font-family="Arial, sans-serif" font-size="28">${xml(fit(data.footer, 60))}</text>` : ""}
  <text x="970" y="955" text-anchor="end" fill="#16f2b3" font-family="Arial, sans-serif" font-size="24" font-weight="700">NEONULTRA.NG</text>
</svg>`;
}

export async function renderGraphicPng(data: GraphicData) {
  return sharp(Buffer.from(renderGraphicSvg(data))).png().toBuffer();
}

function wrapText(text: string, width = 74) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (`${line} ${word}`.trim().length > width) {
        lines.push(line);
        line = word;
      } else {
        line = `${line} ${word}`.trim();
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function renderContentPdf(title: string, textContent: string) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595, 842]);
  let y = 770;

  page.drawText("ULTRA BASKETBALL", {
    x: 50,
    y,
    size: 12,
    font: bold,
    color: rgb(0.086, 0.949, 0.702),
  });
  y -= 50;
  page.drawText(title, { x: 50, y, size: 24, font: bold });
  y -= 44;

  for (const line of wrapText(textContent)) {
    if (y < 60) {
      page = document.addPage([595, 842]);
      y = 780;
    }
    page.drawText(line, {
      x: 50,
      y,
      size: 11,
      font: regular,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 18;
  }
  return document.save();
}
