import { spawn } from "child_process";
import { existsSync } from "fs";

export async function installPythonDependencies(pythoncmd, requirementsPath) {
  if (!existsSync(requirementsPath)) {
    console.log("requirements.txt가 없습니다. Python 모듈 설치를 건너뜁니다.");
    return;
  }

  console.log("Python 종속성을 확인 중입니다...");

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
        console.log("Python 종속성이 설치되었거나 최신 상태입니다.");
        resolve();
      } else {
        console.warn(`Python 종속성 설치에 실패했습니다. 종료 코드: ${code}`);
        reject(new Error(`pip install failed with code ${code}`));
      }
    });

    pipProcess.on("error", (err) => {
      console.error("Python 종속성 설치 중 오류가 발생했습니다.", err);
      reject(err);
    });
  });
}
