import { createRequire } from "node:module";
import { Arch, build, Platform } from "electron-builder";
import "./generate-notices.mjs";
import "./generate-icons.mjs";

const require = createRequire(import.meta.url);
const requestedTool = process.argv[2];
const tools = require("../src/tool-catalog.json").filter((tool) => (
  tool.enabled && (!requestedTool || tool.id === requestedTool)
));

if (requestedTool && !tools.length) {
  throw new Error(`Ferramenta desconhecida: ${requestedTool}`);
}

for (const tool of tools) {
  await build({
    targets: Platform.WINDOWS.createTarget("portable", Arch.x64),
    config: {
      appId: `io.biankit.${tool.id}`,
      productName: tool.title,
      copyright: "Copyright © 2026 Marcos Luciano Tagliari Junior",
      directories: { output: `release/${tool.id}` },
      files: ["src/**/*", "package.json"],
      extraResources: [
        { from: "LICENSE.md", to: "legal/LICENSE.md" },
        { from: "legal/THIRD_PARTY_NOTICES.txt", to: "legal/THIRD_PARTY_NOTICES.txt" },
        { from: `assets/icons/${tool.id}.ico`, to: `icons/${tool.id}.ico` },
      ],
      extraMetadata: { toolId: tool.id },
      win: {
        target: ["portable"],
        icon: `assets/icons/${tool.id}.ico`,
        signAndEditExecutable: false,
        executableName: tool.executable,
        artifactName: `${tool.executable}-\${version}.exe`,
      },
      portable: { artifactName: `${tool.executable}-\${version}.exe` },
      asar: true,
      compression: "normal",
    },
  });
}
