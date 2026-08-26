const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument, degrees } = require("pdf-lib");

async function loadPdf(filePath) {
  const bytes = await fs.readFile(filePath);
  return PDFDocument.load(bytes, { updateMetadata: false });
}

async function mergePdfs(inputPaths, outputPath) {
  if (!Array.isArray(inputPaths) || inputPaths.length < 1) {
    throw new Error("Adicione pelo menos um PDF.");
  }

  const output = await PDFDocument.create();
  for (const inputPath of inputPaths) {
    const source = await loadPdf(inputPath);
    const copied = await output.copyPages(source, source.getPageIndices());
    copied.forEach((page) => output.addPage(page));
  }

  const bytes = await output.save();
  await fs.writeFile(outputPath, bytes);
  return { outputPath, pageCount: output.getPageCount() };
}

async function organizePdf(inputPath, pagePlan, outputPath) {
  if (!Array.isArray(pagePlan) || pagePlan.length < 1) {
    throw new Error("O PDF precisa manter pelo menos uma página.");
  }

  const source = await loadPdf(inputPath);
  const pageCount = source.getPageCount();
  const indexes = pagePlan.map(({ index }) => Number(index));
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= pageCount)) {
    throw new Error("A lista de páginas contém uma página inválida.");
  }

  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, indexes);
  copied.forEach((page, position) => {
    const delta = Number(pagePlan[position].rotation) || 0;
    const current = page.getRotation().angle || 0;
    page.setRotation(degrees(((current + delta) % 360 + 360) % 360));
    output.addPage(page);
  });

  const bytes = await output.save();
  await fs.writeFile(outputPath, bytes);
  return { outputPath, pageCount: output.getPageCount() };
}

function safePart(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 80) || "parte";
}

async function availablePath(directory, baseName) {
  let candidate = path.join(directory, `${baseName}.pdf`);
  let suffix = 2;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${baseName}-${suffix}.pdf`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

async function splitPdf(inputPath, groups, outputDirectory) {
  if (!Array.isArray(groups) || groups.length < 1) {
    throw new Error("Informe pelo menos uma página ou intervalo.");
  }

  const source = await loadPdf(inputPath);
  const pageCount = source.getPageCount();
  const sourceName = safePart(path.basename(inputPath, path.extname(inputPath)));
  const outputs = [];

  for (const [groupIndex, group] of groups.entries()) {
    const indexes = group.indexes.map(Number);
    if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= pageCount)) {
      throw new Error(`O intervalo “${group.label}” contém uma página inválida.`);
    }

    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, indexes);
    pages.forEach((page) => output.addPage(page));
    const label = safePart(group.label || `parte-${groupIndex + 1}`);
    const outputPath = await availablePath(outputDirectory, `${sourceName}-${label}`);
    await fs.writeFile(outputPath, await output.save());
    outputs.push(outputPath);
  }

  return { outputDirectory, outputs };
}

module.exports = { mergePdfs, organizePdf, splitPdf };
