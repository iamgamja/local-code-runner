const socket = io();
const stdout = document.getElementById("out-stdout");
const stderr = document.getElementById("out-stderr");
const codeArea = document.getElementById("in-code");
const stdinArea = document.getElementById("in-stdin");
const titleIdle = document.getElementById("title-idle");
const titleRunning = document.getElementById("title-running");
const runBtn = document.getElementById("run-btn");
const killBtn = document.getElementById("kill-btn");
const stderrStatus = document.getElementById("stderr-status");

function execute() {
  stdout.value = "";
  stderr.value = "";
  socket.emit("run_code", {
    code: codeArea.value,
    stdin: stdinArea.value,
  });
}

function kill() {
  socket.emit("kill");
}

socket.on("set_code", (code) => {
  codeArea.value = code;
});

socket.on("set_stdin", (stdin) => {
  stdinArea.value = stdin;
});

socket.on("stdout", (data) => {
  stdout.value = data;
  stdout.scrollTop = stdout.scrollHeight;
});

socket.on("stderr", (data) => {
  stderr.value = data;
  stderr.scrollTop = stderr.scrollHeight;
});

socket.on("set_stderr_status", (data) => {
  stderrStatus.textContent = data;
});

socket.on("is_running", (isRunning) => {
  titleIdle.classList.toggle("hide", isRunning);
  titleRunning.classList.toggle("hide", !isRunning);
  killBtn.disabled = !isRunning;
  runBtn.disabled = isRunning;
});
