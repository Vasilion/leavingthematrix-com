import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName, PDFString, rgb } from "pdf-lib";
import type { PDFFont, PDFPage, PDFRef, RGB } from "pdf-lib";
import archivoBlackFont from "../../assets/fonts/ArchivoBlack-Regular.ttf";
import archivoBoldFont from "../../assets/fonts/Archivo-Bold.ttf";
import archivoRegularFont from "../../assets/fonts/Archivo-Regular.ttf";
import type { Block, ChecklistGroup, DebtColumn, LinkItem, Page, PlanDocument, Stat, TableRow } from "./document";

const PAGE_WIDTH: number = 612;
const PAGE_HEIGHT: number = 792;
const MARGIN: number = 54;
const CONTENT_WIDTH: number = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT: number = 112;
const CONTENT_TOP: number = PAGE_HEIGHT - HEADER_HEIGHT - 34;
const CONTENT_BOTTOM: number = 74;
const SCALES: readonly number[] = [1, 0.92, 0.85, 0.78, 0.72, 0.66];

const INK: RGB = rgb(0.067, 0.067, 0.067);
const PAPER: RGB = rgb(0xe9 / 255, 0xe6 / 255, 0xdf / 255);
const RED: RGB = rgb(0xd7 / 255, 0x19 / 255, 0x2f / 255);
const MUTED: RGB = rgb(0.33, 0.33, 0.31);
const RULE: RGB = rgb(0.75, 0.73, 0.69);
const PANEL: RGB = rgb(0.96, 0.95, 0.92);

interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly black: PDFFont;
}

interface Pen {
  readonly page: PDFPage | null;
  readonly fonts: Fonts;
  readonly scale: number;
  readonly links: LinkTarget[];
  y: number;
}

interface LinkTarget {
  readonly page: PDFPage;
  readonly url: string;
  readonly rect: readonly [number, number, number, number];
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words: string[] = text.split(/\s+/).filter((word: string): boolean => word !== "");
  const lines: string[] = [];
  let line: string = "";
  for (const word of words) {
    const candidate: string = line === "" ? word : `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || line === "") {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") {
    lines.push(line);
  }
  return lines.length === 0 ? [""] : lines;
}

function drawLines(
  pen: Pen,
  lines: readonly string[],
  x: number,
  font: PDFFont,
  size: number,
  leading: number,
  color: RGB,
): void {
  for (const line of lines) {
    pen.y -= leading;
    if (pen.page !== null) {
      pen.page.drawText(line, { x, y: pen.y + (leading - size) * 0.35, size, font, color });
    }
  }
}

function text(
  pen: Pen,
  value: string,
  font: PDFFont,
  baseSize: number,
  lineRatio: number,
  color: RGB,
  x: number = MARGIN,
  width: number = CONTENT_WIDTH,
): void {
  const size: number = baseSize * pen.scale;
  drawLines(pen, wrap(value, font, size, width), x, font, size, size * lineRatio, color);
}

function gap(pen: Pen, points: number): void {
  pen.y -= points * pen.scale;
}

function rect(pen: Pen, x: number, y: number, width: number, height: number, fill: RGB | null, border: RGB | null, borderWidth: number = 1): void {
  if (pen.page === null) {
    return;
  }
  pen.page.drawRectangle({
    x,
    y,
    width,
    height,
    color: fill ?? undefined,
    borderColor: border ?? undefined,
    borderWidth: border === null ? 0 : borderWidth,
  });
}

function line(pen: Pen, x1: number, y: number, x2: number, color: RGB, thickness: number = 0.75): void {
  if (pen.page === null) {
    return;
  }
  pen.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

function drawStats(pen: Pen, items: readonly Stat[]): void {
  const s: number = pen.scale;
  const columns: number = 2;
  const spacing: number = 12;
  const cellWidth: number = (CONTENT_WIDTH - spacing * (columns - 1)) / columns;
  const padding: number = 12 * s;
  for (let index: number = 0; index < items.length; index += columns) {
    const row: readonly Stat[] = items.slice(index, index + columns);
    const top: number = pen.y;
    let lowest: number = top;
    const heights: number[] = row.map((stat: Stat): number => {
      const probe: Pen = { ...pen, page: null, links: [], y: top - padding };
      text(probe, stat.label.toUpperCase(), pen.fonts.bold, 8.5, 1.3, RED, 0, cellWidth - padding * 2);
      gap(probe, 4);
      text(probe, stat.value, pen.fonts.black, 21, 1.15, INK, 0, cellWidth - padding * 2);
      if (stat.note !== "") {
        gap(probe, 3);
        text(probe, stat.note, pen.fonts.regular, 9, 1.3, MUTED, 0, cellWidth - padding * 2);
      }
      return top - probe.y + padding;
    });
    const height: number = Math.max(...heights);
    row.forEach((stat: Stat, column: number): void => {
      const x: number = MARGIN + column * (cellWidth + spacing);
      rect(pen, x, top - height, cellWidth, height, PANEL, INK, 1);
      const cell: Pen = { ...pen, y: top - padding };
      text(cell, stat.label.toUpperCase(), pen.fonts.bold, 8.5, 1.3, RED, x + padding, cellWidth - padding * 2);
      gap(cell, 4);
      text(cell, stat.value, pen.fonts.black, 21, 1.15, INK, x + padding, cellWidth - padding * 2);
      if (stat.note !== "") {
        gap(cell, 3);
        text(cell, stat.note, pen.fonts.regular, 9, 1.3, MUTED, x + padding, cellWidth - padding * 2);
      }
      lowest = Math.min(lowest, top - height);
    });
    pen.y = lowest - spacing * s;
  }
}

function drawTable(pen: Pen, columns: readonly string[], rows: readonly TableRow[]): void {
  const s: number = pen.scale;
  const numberWidth: number = 92;
  const firstWidth: number = CONTENT_WIDTH - numberWidth * (columns.length - 1);
  const size: number = 10.5 * s;
  const rowHeight: number = 19 * s;
  const right = (index: number): number => MARGIN + firstWidth + numberWidth * index;

  if (columns.some((column: string): boolean => column !== "")) {
    columns.forEach((column: string, index: number): void => {
      const label: string = column.toUpperCase();
      const labelSize: number = 8 * s;
      const x: number =
        index === 0 ? MARGIN : right(index) - pen.fonts.bold.widthOfTextAtSize(label, labelSize);
      if (pen.page !== null) {
        pen.page.drawText(label, { x, y: pen.y - 12 * s, size: labelSize, font: pen.fonts.bold, color: MUTED });
      }
    });
    pen.y -= 17 * s;
    line(pen, MARGIN, pen.y, MARGIN + CONTENT_WIDTH, INK, 1);
  }

  for (const row of rows) {
    const font: PDFFont = row.style === "normal" ? pen.fonts.regular : pen.fonts.bold;
    const cellSize: number = row.style === "section" ? 8.5 * s : size;
    const label: string = row.style === "section" ? (row.cells[0] ?? "").toUpperCase() : (row.cells[0] ?? "");
    const lines: string[] = wrap(label, font, cellSize, firstWidth - 12);
    const height: number = rowHeight + (lines.length - 1) * cellSize * 1.3;
    const top: number = pen.y;
    if (row.style === "total") {
      line(pen, MARGIN, top, MARGIN + CONTENT_WIDTH, INK, 0.75);
    }
    const color: RGB = row.style === "section" ? RED : INK;
    if (pen.page !== null) {
      lines.forEach((value: string, index: number): void => {
        pen.page?.drawText(value, {
          x: MARGIN,
          y: top - 13.5 * s - index * cellSize * 1.3,
          size: cellSize,
          font,
          color,
        });
      });
      row.cells.slice(1).forEach((value: string, index: number): void => {
        const width: number = font.widthOfTextAtSize(value, cellSize);
        pen.page?.drawText(value, { x: right(index + 1) - width, y: top - 13.5 * s, size: cellSize, font, color });
      });
    }
    pen.y = top - height;
    if (row.style === "normal") {
      line(pen, MARGIN, pen.y, MARGIN + CONTENT_WIDTH, RULE, 0.5);
    }
  }
  gap(pen, 14);
}

function drawBullets(pen: Pen, items: readonly string[]): void {
  const s: number = pen.scale;
  for (const item of items) {
    const top: number = pen.y;
    rect(pen, MARGIN + 2, top - 10.5 * s, 4.5 * s, 4.5 * s, RED, null);
    text(pen, item, pen.fonts.regular, 10.5, 1.42, INK, MARGIN + 16, CONTENT_WIDTH - 16);
    gap(pen, 3);
  }
  gap(pen, 6);
}

function drawCallout(pen: Pen, value: string): void {
  const s: number = pen.scale;
  const top: number = pen.y;
  const probe: Pen = { ...pen, page: null, links: [], y: top - 10 * s };
  text(probe, value, pen.fonts.bold, 13.5, 1.35, INK, MARGIN + 20, CONTENT_WIDTH - 32);
  const height: number = top - probe.y + 12 * s;
  rect(pen, MARGIN, top - height, CONTENT_WIDTH, height, PANEL, null);
  rect(pen, MARGIN, top - height, 5, height, RED, null);
  pen.y = top - 10 * s;
  text(pen, value, pen.fonts.bold, 13.5, 1.35, INK, MARGIN + 20, CONTENT_WIDTH - 32);
  pen.y = top - height;
  gap(pen, 14);
}

function drawBig(pen: Pen, label: string, value: string): void {
  text(pen, label.toUpperCase(), pen.fonts.bold, 9.5, 1.3, RED);
  gap(pen, 2);
  text(pen, value, pen.fonts.black, 30, 1.1, INK);
  gap(pen, 14);
}

function drawDebtColumns(pen: Pen, columns: readonly DebtColumn[]): void {
  const s: number = pen.scale;
  const spacing: number = 14;
  const count: number = columns.length;
  const width: number = (CONTENT_WIDTH - spacing * (count - 1)) / count;
  const padding: number = 12 * s;
  const top: number = pen.y;

  const body = (target: Pen, column: DebtColumn, x: number): void => {
    if (column.highlighted && count > 1) {
      text(target, "YOUR PICK", pen.fonts.bold, 8, 1.3, RED, x + padding, width - padding * 2);
      gap(target, 2);
    }
    text(target, column.title, pen.fonts.black, 16, 1.15, INK, x + padding, width - padding * 2);
    text(target, column.subtitle, pen.fonts.regular, 9, 1.35, MUTED, x + padding, width - padding * 2);
    gap(target, 8);
    for (const entry of column.lines) {
      text(target, entry, pen.fonts.regular, 9.5, 1.38, INK, x + padding, width - padding * 2);
      gap(target, 2);
    }
    gap(target, 6);
    for (const entry of column.footer) {
      text(target, entry, pen.fonts.bold, 10, 1.4, INK, x + padding, width - padding * 2);
    }
  };

  const heights: number[] = columns.map((column: DebtColumn, index: number): number => {
    const probe: Pen = { ...pen, page: null, links: [], y: top - padding };
    body(probe, column, MARGIN + index * (width + spacing));
    return top - probe.y + padding;
  });
  const height: number = Math.max(...heights);
  columns.forEach((column: DebtColumn, index: number): void => {
    const x: number = MARGIN + index * (width + spacing);
    rect(pen, x, top - height, width, height, column.highlighted ? rgb(1, 1, 1) : PANEL, column.highlighted ? RED : INK, column.highlighted ? 2 : 0.75);
    const cell: Pen = { ...pen, y: top - padding };
    body(cell, column, x);
  });
  pen.y = top - height;
  gap(pen, 14);
}

function drawChecklist(pen: Pen, groups: readonly ChecklistGroup[]): void {
  const s: number = pen.scale;
  for (const group of groups) {
    text(pen, group.title, pen.fonts.black, 12, 1.3, INK);
    gap(pen, 4);
    if (group.intro !== "") {
      text(pen, group.intro, pen.fonts.regular, 9.5, 1.35, MUTED);
    }
    for (const item of group.items) {
      const top: number = pen.y;
      rect(pen, MARGIN + 1, top - 11 * s, 8 * s, 8 * s, null, INK, 0.9);
      text(pen, item, pen.fonts.regular, 10, 1.38, INK, MARGIN + 17, CONTENT_WIDTH - 17);
      gap(pen, 3);
    }
    gap(pen, 8);
  }
}

function drawLinks(pen: Pen, items: readonly LinkItem[]): void {
  const s: number = pen.scale;
  items.forEach((item: LinkItem, index: number): void => {
    const top: number = pen.y;
    if (pen.page !== null) {
      pen.page.drawText(String(index + 1), { x: MARGIN, y: top - 12 * s, size: 11 * s, font: pen.fonts.black, color: RED });
    }
    text(pen, item.text, pen.fonts.bold, 10.5, 1.38, INK, MARGIN + 18, CONTENT_WIDTH - 18);
    const display: string = item.url.replace(/^https:\/\//, "");
    const size: number = 9.5 * s;
    pen.y -= size * 1.45;
    const width: number = pen.fonts.regular.widthOfTextAtSize(display, size);
    if (pen.page !== null) {
      pen.page.drawText(display, { x: MARGIN + 18, y: pen.y + size * 0.2, size, font: pen.fonts.regular, color: RED });
      line(pen, MARGIN + 18, pen.y, MARGIN + 18 + width, RED, 0.5);
      pen.links.push({ page: pen.page, url: item.url, rect: [MARGIN + 18, pen.y - 2, MARGIN + 18 + width, pen.y + size] });
    }
    gap(pen, 8);
  });
}

function drawBlock(pen: Pen, block: Block): void {
  switch (block.type) {
    case "lead":
      text(pen, block.text, pen.fonts.bold, 14, 1.36, INK);
      gap(pen, 14);
      return;
    case "paragraph":
      text(pen, block.text, pen.fonts.regular, 11, 1.45, INK);
      gap(pen, 10);
      return;
    case "small":
      text(pen, block.text, pen.fonts.regular, 9, 1.4, MUTED);
      gap(pen, 8);
      return;
    case "heading":
      gap(pen, 4);
      text(pen, block.text, pen.fonts.black, 13, 1.3, INK);
      gap(pen, 6);
      return;
    case "stats":
      drawStats(pen, block.items);
      gap(pen, 6);
      return;
    case "table":
      drawTable(pen, block.columns, block.rows);
      return;
    case "big":
      drawBig(pen, block.label, block.text);
      return;
    case "callout":
      drawCallout(pen, block.text);
      return;
    case "bullets":
      drawBullets(pen, block.items);
      return;
    case "debtColumns":
      drawDebtColumns(pen, block.columns);
      return;
    case "checklist":
      drawChecklist(pen, block.groups);
      return;
    case "links":
      drawLinks(pen, block.items);
      return;
  }
}

function measure(fonts: Fonts, page: Page, scale: number): number {
  const pen: Pen = { page: null, fonts, scale, links: [], y: CONTENT_TOP };
  for (const block of page.blocks) {
    drawBlock(pen, block);
  }
  return pen.y;
}

function fitScale(fonts: Fonts, page: Page): number {
  for (const scale of SCALES) {
    if (measure(fonts, page, scale) >= CONTENT_BOTTOM) {
      return scale;
    }
  }
  return SCALES[SCALES.length - 1] ?? 1;
}

function drawChrome(pdfPage: PDFPage, fonts: Fonts, title: string, footer: string, number: number, total: number): void {
  pdfPage.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  pdfPage.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: INK });
  pdfPage.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT - 5, width: PAGE_WIDTH, height: 5, color: RED });
  const counter: string = `${String(number).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  pdfPage.drawText(counter, { x: MARGIN, y: PAGE_HEIGHT - 40, size: 9, font: fonts.bold, color: RED });
  pdfPage.drawText("THE MONEY PLAN", {
    x: PAGE_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize("THE MONEY PLAN", 9),
    y: PAGE_HEIGHT - 40,
    size: 9,
    font: fonts.bold,
    color: PAPER,
  });
  let titleSize: number = 34;
  const upper: string = title.toUpperCase();
  while (fonts.black.widthOfTextAtSize(upper, titleSize) > CONTENT_WIDTH && titleSize > 18) {
    titleSize -= 1;
  }
  pdfPage.drawText(upper, { x: MARGIN, y: PAGE_HEIGHT - 86, size: titleSize, font: fonts.black, color: PAPER });
  pdfPage.drawLine({ start: { x: MARGIN, y: 52 }, end: { x: PAGE_WIDTH - MARGIN, y: 52 }, thickness: 0.75, color: INK });
  pdfPage.drawText(footer, { x: MARGIN, y: 36, size: 8, font: fonts.regular, color: MUTED });
}

function addLink(document: PDFDocument, target: LinkTarget): void {
  const annotation: PDFRef = document.context.register(
    document.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [...target.rect],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(target.url) },
    }),
  );
  target.page.node.addAnnot(annotation);
}

export function renderPdf(planDocument: PlanDocument, madeOn: Date): Promise<Uint8Array> {
  return PDFDocument.create().then((document: PDFDocument): Promise<Uint8Array> => {
    document.registerFontkit(fontkit);
    document.setTitle("Your Money Plan");
    document.setAuthor("Luke Vasilion");
    document.setSubject("A money plan built from the book Disqualified");
    document.setCreator("leavingthematrix.io");
    document.setProducer("leavingthematrix.io");
    document.setCreationDate(madeOn);
    document.setModificationDate(madeOn);
    return Promise.all([
      document.embedFont(archivoRegularFont, { subset: true }),
      document.embedFont(archivoBoldFont, { subset: true }),
      document.embedFont(archivoBlackFont, { subset: true }),
    ]).then(([regular, bold, black]: PDFFont[]): Promise<Uint8Array> => {
      const fonts: Fonts = { regular: regular as PDFFont, bold: bold as PDFFont, black: black as PDFFont };
      const links: LinkTarget[] = [];
      const total: number = planDocument.pages.length;
      planDocument.pages.forEach((page: Page, index: number): void => {
        const pdfPage: PDFPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        drawChrome(pdfPage, fonts, page.title, planDocument.footer, index + 1, total);
        const pen: Pen = { page: pdfPage, fonts, scale: fitScale(fonts, page), links, y: CONTENT_TOP };
        for (const block of page.blocks) {
          drawBlock(pen, block);
        }
      });
      for (const target of links) {
        addLink(document, target);
      }
      document.catalog.set(PDFName.of("Lang"), PDFString.of("en-US"));
      return document.save();
    });
  });
}
