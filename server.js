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
const CODE_PATH = path.join(RUNNING_CONTAINER_DIR, "code.py");
const STDIN_PATH = path.join(RUNNING_CONTAINER_DIR, "stdin.txt");
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

let running_process = null;
let stdoutHistory = "";
let stderrHistory = "";

function updateProcessCount() {
  io.emit("process_count", running_process ? 1 : 0);
}

function run_code({ code, stdin }) {
  if (running_process) return;

  // 1. 로컬 백업
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(BACKUP_DIR, `backup_${timestamp}.py`), code);

  // 2. 현재 실행할 파일 저장
  fs.writeFileSync(CODE_PATH, code);

  // 3. stdin을 파일로 기록하고, 파일 경로를 스크립트에 전달
  fs.writeFileSync(STDIN_PATH, stdin);
  const stdinFd = fs.openSync(STDIN_PATH, "r");

  const pythonProcess = spawn(
    pythoncmd,
    ["-u", CODE_PATH],
    {
      stdio: [stdinFd, "pipe", "pipe"],
      timeout: 1 * 60 * 60 * 1000, // 1시간 타임아웃
    },
  );
  fs.closeSync(stdinFd);

  running_process = pythonProcess;
  updateProcessCount();
  io.emit("set_stderr_status", "running");
  stdoutHistory = "";
  stderrHistory = "";

  pythonProcess.stdout.on("data", (data) => {
    stdoutHistory += data.toString();
    stdoutHistory = stdoutHistory.slice(-MAX_BUFFER_LENGTH);
    stdoutHistory = stdoutHistory.split('\n').map(line => {
      const lastCRIndex = line.lastIndexOf('\r');
      return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line;
    }).join('\n');
  });
  pythonProcess.stderr.on("data", (data) => {
    stderrHistory += data.toString();
    stderrHistory = stderrHistory.slice(-MAX_BUFFER_LENGTH);
    stderrHistory = stderrHistory.split('\n').map(line => {
      const lastCRIndex = line.lastIndexOf('\r');
      return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line;
    }).join('\n');
  });

  const sendInterval = setInterval(() => {
    if (stdoutHistory) {
      io.emit("stdout", stdoutHistory);
    }
    if (stderrHistory) {
      io.emit("stderr", stderrHistory);
    }
  }, 100);

  pythonProcess.on("close", (code) => {
    clearInterval(sendInterval);
    if (stdoutHistory) {
      io.emit("stdout", stdoutHistory);
      stdoutHistory = "";
    }
    if (stderrHistory) {
      io.emit("stderr", stderrHistory);
      stderrHistory = "";
    }
    if (code !== null) {
      io.emit("set_stderr_status", `code: ${code}`);
    }

    running_process = null;
    updateProcessCount();
  });
}

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.emit("process_count", running_process ? 1 : 0);
  if (fs.existsSync(CODE_PATH)) {
    socket.emit("set_code", fs.readFileSync(CODE_PATH, "utf-8"));
  }
  if (fs.existsSync(STDIN_PATH)) {
    socket.emit("set_stdin", fs.readFileSync(STDIN_PATH, "utf-8"));
  }
  socket.emit("set_stderr_status", running_process ? "running" : "");

  socket.on("run_code", ({ code, stdin }) => {
    if (running_process) return;

    run_code({ code, stdin });
  });

  socket.on("kill", () => {
    if (running_process && !running_process.killed) {
      running_process.kill();
      io.emit("set_stderr_status", "terminated");
    }
  });

  socket.on("disconnect", () => {
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
