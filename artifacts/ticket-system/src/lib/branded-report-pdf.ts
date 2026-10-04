import { jsPDF } from "jspdf";

async function loadLogo() {
  const response = await fetch("/orion-logo-full.png");
  if (!response.ok) throw new Error("Unable to load the Orion logo");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid logo data"));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the Orion logo"));
    reader.readAsDataURL(blob);
  });
}

export async function createBrandedPdf(title: string, orientation: "portrait" | "landscape" = "landscape") {
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const logo = await loadLogo();
  doc.addImage(logo, "PNG", 32, 24, 112, 28);
  doc.setTextColor(20, 37, 63);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 160, 43);
  doc.setDrawColor(37, 99, 235);
  doc.line(32, 66, orientation === "landscape" ? 810 : 563, 66);
  doc.setTextColor(80, 90, 105);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleString()}`, 32, 80);
  return doc;
}

export function saveBrandedPdf(doc: jsPDF, filename: string) {
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("Orion SupportDesk", 32, doc.internal.pageSize.getHeight() - 20);
  doc.save(filename);
}

export function drawBrandedTable(
  doc: jsPDF,
  headers: string[],
  rows: string[][],
  widths: number[],
  startY = 105,
) {
  const left = 32;
  const pageBottom = doc.internal.pageSize.getHeight() - 32;
  let y = startY;

  if (headers.length !== widths.length || rows.some((row) => row.length !== widths.length)) {
    throw new Error("PDF table columns and widths must match");
  }

  const drawRow = (values: string[], header = false) => {
    const fontSize = 7;
    const lineHeight = 8;
    const padding = 4;
    const lines = values.map((value, index) => doc.splitTextToSize(String(value), widths[index] - padding * 2));
    const rowHeight = Math.max(header ? 26 : 18, ...lines.map((value) => value.length * lineHeight + padding * 2));
    let x = left;
    doc.setFillColor(header ? 20 : 247, header ? 37 : 249, header ? 63 : 251);
    doc.setTextColor(header ? 255 : 35, header ? 255 : 45, header ? 255 : 55);
    doc.rect(left, y, widths.reduce((sum, width) => sum + width, 0), rowHeight, "F");
    doc.setDrawColor(210, 215, 222);
    values.forEach((value, index) => {
      const width = widths[index];
      doc.rect(x, y, width, rowHeight);
      doc.setFont("helvetica", header ? "bold" : "normal");
      doc.setFontSize(fontSize);
      doc.text(lines[index], x + padding, y + padding + lineHeight);
      x += width;
    });
    y += rowHeight;
  };

  drawRow(headers, true);
  for (const row of rows) {
    const rowLines = row.map((value, index) => doc.splitTextToSize(String(value), widths[index] - 8));
    const rowHeight = Math.max(18, ...rowLines.map((value) => value.length * 8 + 8));
    if (y + rowHeight > pageBottom) {
      doc.addPage();
      y = 40;
      drawRow(headers, true);
    }
    drawRow(row);
  }
}
