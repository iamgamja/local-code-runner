import { spawn } from "child_process";
import { existsSync } from "fs";
import ora from "ora";

export async function installPythonDependencies(pythoncmd, requirementsPath) {
  if (!existsSync(requirementsPath)) {
    const spinner = ora().start();
    spinner.info(
      "No requirements.txt found. Skipping Python module installation.",
    );
    return;
  }
  const spinner = ora("Installing Python dependencies...").start();

  await new Promise((resolve, reject) => {
    const pipProcess = spawn(pythoncmd, [
      "-m",
      "pip",
      "install",
      "-r",
      requirementsPath,
    ]);

    pipProcess.stdout.on("data", (data) => {
      process.stdout.write(data.toString());
    });

    pipProcess.stderr.on("data", (data) => {
      process.stderr.write(data.toString());
    });

    pipProcess.on("close", (code) => {
      if (code === 0) {
        spinner.succeed("Python dependencies installed or already up to date.");
        resolve();
      } else {
        spinner.fail(
          `Failed to install Python dependencies. Exit code: ${code}`,
        );
        reject(new Error(`pip install failed with code ${code}`));
      }
    });

    pipProcess.on("error", (err) => {
      spinner.fail("An error occurred while installing Python dependencies.");
      console.error(err);
      reject(err);
    });
  });
}
