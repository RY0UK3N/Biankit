import { spawn } from "node:child_process";
import electron from "electron";

const tool = process.argv[2] || "merge";
const child = spawn(electron, [".", `--tool=${tool}`], {
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
