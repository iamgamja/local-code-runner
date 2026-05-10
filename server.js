const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const BACKUP_DIR = path.join(__dirname, "backups");
const SCRIPT_PATH = path.join(__dirname, "scripts", "run_script.py");
const REQUIREMENTS_PATH = path.join(__dirname, "requirements.txt");

// 필요한 디렉토리 생성
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
if (!fs.existsSync(path.dirname(SCRIPT_PATH)))
  fs.mkdirSync(path.dirname(SCRIPT_PATH));

async function installPythonDependencies() {
  if (!fs.existsSync(REQUIREMENTS_PATH)) {
    console.log("requirements.txt가 없습니다. Python 모듈 설치를 건너뜁니다.");
    return;
  }

  console.log("Python 종속성을 확인 중입니다...");

  await new Promise((resolve) => {
    const pipProcess = spawn("python", [
      "-m",
      "pip",
      "install",
      "-r",
      REQUIREMENTS_PATH,
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

app.use(express.static("public"));
app.use(express.json());

const MAX_BUFFER_LENGTH = 3_000;

io.on("connection", (socket) => {
  console.log("Client connected");

  // 각 소켓마다 실행 중인 프로세스 추적
  let running_process = null;

  function updateProcessCount() {
    socket.emit("process_count", running_process ? 1 : 0);
  }

  socket.on("run_code", ({ code, stdin }) => {
    if (running_process) return; // 이미 실행 중인 프로세스가 있으면 무시

    // 1. 로컬 백업
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(BACKUP_DIR, `backup_${timestamp}.py`), code);

    // 2. 현재 실행할 파일 저장
    fs.writeFileSync(SCRIPT_PATH, code);

    // 3. 파이썬 실행 (unbuffered 모드 '-u' 필수: 실시간 출력 보장)
    const pythonProcess = spawn("python", ["-u", SCRIPT_PATH]);
    running_process = pythonProcess;
    updateProcessCount();

    if (stdin) {
      pythonProcess.stdin.write(stdin);
    }
    pythonProcess.stdin.end();

    let stdoutBuffer = "";
    pythonProcess.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      stdoutBuffer = stdoutBuffer.slice(-MAX_BUFFER_LENGTH);
    });
    const flushStdoutInterval = setInterval(() => {
      if (stdoutBuffer) {
        socket.emit("stdout", stdoutBuffer);
        stdoutBuffer = "";
      }
    }, 100);

    let stderrBuffer = "";
    pythonProcess.stderr.on("data", (data) => {
      stderrBuffer += data.toString();
      stderrBuffer = stderrBuffer.slice(-MAX_BUFFER_LENGTH);
    });
    const flushStderrInterval = setInterval(() => {
      if (stderrBuffer) {
        socket.emit("stderr", stderrBuffer);
        stderrBuffer = "";
      }
    }, 100);

    pythonProcess.on("close", (code) => {
      if (stdoutBuffer) {
        socket.emit("stdout", stdoutBuffer);
        stdoutBuffer = "";
      }
      if (stderrBuffer) {
        socket.emit("stderr", stderrBuffer);
        stderrBuffer = "";
      }
      clearInterval(flushStdoutInterval);
      clearInterval(flushStderrInterval);
      if (code !== null) {
        socket.emit("stderr", `\n[Process exited with code ${code}]\n\n`);
      }

      running_process = null;
      updateProcessCount();
    });
  });

  socket.on("kill", () => {
    if (running_process && !running_process.killed) {
      running_process.kill();
      socket.emit("stderr", "\n[Process terminated]\n\n");
    }
  });

  socket.on("disconnect", () => {
    // 연결 끊김 시 프로세스 종료
    if (running_process && !running_process.killed) {
      running_process.kill();
    }
    running_process = null;
    updateProcessCount();
    console.log("Client disconnected");
  });
});

const PORT = 3000;
(async () => {
  await installPythonDependencies();

  server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
})();
