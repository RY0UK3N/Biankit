const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { mergePdfs, organizePdf, splitPdf } = require("../src/pdf-operations");

async function makePdf(filePath, widths) {
  const pdf = await PDFDocument.create();
  widths.forEach((width) => pdf.addPage([width, 500]));
  await fs.writeFile(filePath, await pdf.save());
}

async function openPdf(filePath) {
  return PDFDocument.load(await fs.readFile(filePath));
}

test("junta documentos preservando todas as páginas", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "papel-merge-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const first = path.join(directory, "a.pdf");
  const second = path.join(directory, "b.pdf");
  const output = path.join(directory, "unido.pdf");
  await makePdf(first, [200, 210]);
  await makePdf(second, [300]);

  const result = await mergePdfs([first, second], output);
  const pdf = await openPdf(output);
  assert.equal(result.pageCount, 3);
  assert.deepEqual(pdf.getPages().map((page) => page.getWidth()), [200, 210, 300]);
});

test("reordena, remove e gira páginas", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "papel-organize-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "entrada.pdf");
  const output = path.join(directory, "organizado.pdf");
  await makePdf(input, [200, 300, 400]);

  await organizePdf(input, [{ index: 2, rotation: 90 }, { index: 0, rotation: 0 }], output);
  const pdf = await openPdf(output);
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPages().map((page) => page.getWidth()), [400, 200]);
  assert.equal(pdf.getPage(0).getRotation().angle, 90);
});

test("divide por intervalos sem sobrescrever arquivos existentes", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "papel-split-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "relatorio.pdf");
  await makePdf(input, [200, 210, 220, 230]);
  const groups = [
    { label: "paginas-1-2", indexes: [0, 1] },
    { label: "pagina-4", indexes: [3] },
  ];

  const firstRun = await splitPdf(input, groups, directory);
  const secondRun = await splitPdf(input, groups, directory);
  assert.equal(firstRun.outputs.length, 2);
  assert.equal((await openPdf(firstRun.outputs[0])).getPageCount(), 2);
  assert.notEqual(firstRun.outputs[0], secondRun.outputs[0]);
});
