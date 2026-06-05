const { spawn } = require("child_process");
const fs = require("fs");

async function installPythonDependencies(pythoncmd, requirementsPath) {
  if (!fs.existsSync(requirementsPath)) {
    console.log("requirements.txt가 없습니다. Python 모듈 설치를 건너뜁니다.");
    return;
  }

  console.log("Python 종속성을 확인 중입니다...");

  await new Promise((resolve) => {
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
      } else {
        console.warn(`Python 종속성 설치에 실패했습니다. 종료 코드: ${code}`);
      }
      resolve();
    });
  });
}

module.exports = { installPythonDependencies };
