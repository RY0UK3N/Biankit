import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dependencies = [
  { label: "@napi-rs/canvas 0.1.100 (incluindo o binário win32-x64-msvc)", license: "MIT", file: "node_modules/@napi-rs/canvas/LICENSE" },
  { label: "@pdf-lib/standard-fonts 1.0.0", license: "MIT", file: "node_modules/@pdf-lib/standard-fonts/LICENSE.md" },
  { label: "@pdf-lib/upng 1.0.1", license: "MIT", file: "node_modules/@pdf-lib/upng/LICENSE" },
  { label: "pako 1.0.11", license: "MIT e Zlib", file: "node_modules/pako/LICENSE" },
  { label: "pdf-lib 1.17.1", license: "MIT", file: "node_modules/pdf-lib/LICENSE.md" },
  { label: "pdfjs-dist 5.4.149", license: "Apache-2.0", file: "node_modules/pdfjs-dist/LICENSE" },
  { label: "tslib 1.14.1", license: "0BSD", file: "node_modules/tslib/LICENSE.txt" },
];

const sections = dependencies.map(({ label, license, file }) => {
  const contents = fs.readFileSync(path.join(root, file), "utf8").trim();
  return `${"=".repeat(78)}\n${label}\nLicença: ${license}\n${"=".repeat(78)}\n\n${contents}`;
});

const header = [
  "BIANKIT — AVISOS DE SOFTWARE DE TERCEIROS",
  "",
  "O BianKit inclui componentes de terceiros sob as licenças reproduzidas abaixo.",
  "Essas licenças se aplicam somente aos respectivos componentes, não ao BianKit",
  "como um todo. Os avisos do Electron e do Chromium também acompanham o pacote.",
  "",
].join("\n");

fs.mkdirSync(path.join(root, "legal"), { recursive: true });
fs.writeFileSync(
  path.join(root, "legal", "THIRD_PARTY_NOTICES.txt"),
  `${header}${sections.join("\n\n")}\n`,
  "utf8",
);
