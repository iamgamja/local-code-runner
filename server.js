const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const BACKUP_DIR = path.join(__dirname, "backups");
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
const RUNNING_CONTAINER_DIR = path.join(__dirname, "running_container");
if (!fs.existsSync(RUNNING_CONTAINER_DIR)) fs.mkdirSync(RUNNING_CONTAINER_DIR);
const REQUIREMENTS_PATH = path.join(__dirname, "requirements.txt");

const { detectPythonExecutable } = require("./lib/pythonDetect");
const { installPythonDependencies } = require("./lib/installDependencies");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 기본값은 python3 (실제로는 detectPythonExecutable에서 갱신)
let pythoncmd = "python3";

app.use(express.static("public"));
app.use(express.json());

const MAX_BUFFER_LENGTH = 10_000;

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
    fs.writeFileSync(path.join(RUNNING_CONTAINER_DIR, "run_script.py"), code);

    // 3. stdin을 파일로 기록하고, 파일 경로를 스크립트에 전달
    const stdinPath = path.join(RUNNING_CONTAINER_DIR, "stdin.txt");
    fs.writeFileSync(stdinPath, stdin);
    const stdinFd = fs.openSync(stdinPath, 'r');

    const pythonProcess = spawn(
      pythoncmd,
      ["-u", path.join(RUNNING_CONTAINER_DIR, "run_script.py")],
      {
        stdio: [stdinFd, 'pipe', 'pipe'],
      }
    );
    running_process = pythonProcess;
    updateProcessCount();

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
      clearInterval(flushStdoutInterval);
      clearInterval(flushStderrInterval);
      if (stdoutBuffer) {
        socket.emit("stdout", stdoutBuffer);
        stdoutBuffer = "";
      }
      if (stderrBuffer) {
        socket.emit("stderr", stderrBuffer);
        stderrBuffer = "";
      }
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
    if (running_process && !running_process.killed) {
      running_process.kill();
    }
    console.log("Client disconnected");
  });
});

const PORT = 3000;
(async () => {
  // 사용 가능한 Python 실행 파일 탐지 및 의존성 설치
  pythoncmd = await detectPythonExecutable();
  await installPythonDependencies(pythoncmd, REQUIREMENTS_PATH);

  server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
})();
