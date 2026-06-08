import { spawn } from "child_process";
import ora from "ora";

async function _checkExecutable(cmd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, ["--version"]);
    let finished = false;
    p.on("close", (code) => {
      if (finished) return;
      finished = true;
      resolve(code === 0);
    });
    p.on("error", () => {
      if (finished) return;
      finished = true;
      resolve(false);
    });
  });
}

export async function detectPythonExecutable() {
  const spinner = ora("Searching for available Python executable...").start();
  const candidates = ["pypy3", "python3", "python"];
  for (const cmd of candidates) {
    try {
      spinner.text = `Checking: ${cmd}`;
      const ok = await _checkExecutable(cmd);
      if (ok) {
        spinner.succeed(`${cmd} detected. Using ${cmd}.`);
        return cmd;
      }
    } catch (err) {
      // 무시하고 다음 후보 검사
    }
  }

  spinner.warn(
    "No available Python executable found. Attempting fallback 'python3'.",
  );
  throw new Error(
    "No available Python executable found. Please ensure Python is installed and in your PATH.",
  );
}
