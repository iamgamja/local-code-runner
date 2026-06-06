import {
  existsSync,
  mkdirSync,
  writeFileSync,
  openSync,
  closeSync,
  readFileSync,
} from "fs";
import { spawn } from "child_process";
import path from "path";
import http from "http";
import express from "express";
import * as socket from "socket.io";

import { detectPythonExecutable } from "./lib/pythonDetect.js";
import { installPythonDependencies } from "./lib/installDependencies.js";

const BACKUP_DIR = path.resolve("backups");
if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR);
const RUNNING_CONTAINER_DIR = path.resolve("running_container");
if (!existsSync(RUNNING_CONTAINER_DIR)) mkdirSync(RUNNING_CONTAINER_DIR);
const CODE_PATH = path.resolve(RUNNING_CONTAINER_DIR, "code.py");
const STDIN_PATH = path.resolve(RUNNING_CONTAINER_DIR, "stdin.txt");
const REQUIREMENTS_PATH = path.resolve("requirements.txt");

const app = express();
const server = http.createServer(app);
const io = new socket.Server(server);

app.use(express.static("public"));
app.use(express.json());

let pythoncmd = null;

const MAX_BUFFER_LENGTH = 10_000;

let running_process = null;
let stdoutHistory = "";
let stderrHistory = "";

function updateProcessCount() {
  io.emit("is_running", !!running_process);
}

function run_code({ code, stdin }) {
  if (running_process) return;

  // 1. 로컬 백업
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(path.resolve(BACKUP_DIR, `backup_${timestamp}.py`), code);

  // 2. 현재 실행할 파일 저장
  writeFileSync(CODE_PATH, code);

  // 3. stdin을 파일로 기록하고, 파일 경로를 스크립트에 전달
  writeFileSync(STDIN_PATH, stdin);
  const stdinFd = openSync(STDIN_PATH, "r");

  const pythonProcess = spawn(pythoncmd, ["-u", CODE_PATH], {
    stdio: [stdinFd, "pipe", "pipe"],
    timeout: 1 * 60 * 60 * 1000, // 1시간 타임아웃
  });
  closeSync(stdinFd);

  running_process = pythonProcess;
  updateProcessCount();
  io.emit("set_stderr_status", "running");
  stdoutHistory = "";
  stderrHistory = "";

  pythonProcess.stdout.on("data", (data) => {
    stdoutHistory += data.toString();
    stdoutHistory = stdoutHistory.slice(-MAX_BUFFER_LENGTH);
    stdoutHistory = stdoutHistory
      .split("\n")
      .map((line) => {
        const lastCRIndex = line.lastIndexOf("\r");
        return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line;
      })
      .join("\n");
  });
  pythonProcess.stderr.on("data", (data) => {
    stderrHistory += data.toString();
    stderrHistory = stderrHistory.slice(-MAX_BUFFER_LENGTH);
    stderrHistory = stderrHistory
      .split("\n")
      .map((line) => {
        const lastCRIndex = line.lastIndexOf("\r");
        return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line;
      })
      .join("\n");
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

  socket.emit("is_running", !!running_process);
  if (existsSync(CODE_PATH)) {
    socket.emit("set_code", readFileSync(CODE_PATH, "utf-8"));
  }
  if (existsSync(STDIN_PATH)) {
    socket.emit("set_stdin", readFileSync(STDIN_PATH, "utf-8"));
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
  pythoncmd = await detectPythonExecutable();
  await installPythonDependencies(pythoncmd, REQUIREMENTS_PATH);

  server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
})();
