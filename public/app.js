const socket = io();
const stdout = document.getElementById("out-stdout");
const stderr = document.getElementById("out-stderr");
const codeArea = document.getElementById("in-code");
const stdinArea = document.getElementById("in-stdin");
const processCount = document.getElementById("process-count");
const runBtn = document.getElementById("run-btn");
const killBtn = document.getElementById("kill-btn");

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

function appendStream(element, content) {
  const lines = content.split('\n');
  const processedLines = lines.map(line => {
    const lastCRIndex = line.lastIndexOf('\r');
    return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line;
  });

  element.value = processedLines.join('\n');
  element.scrollTop = element.scrollHeight;
}

socket.on("set_code", (code) => {
  codeArea.value = code;
});

socket.on("set_stdin", (stdin) => {
  stdinArea.value = stdin;
});

socket.on("stdout", (data) => {
  appendStream(stdout, data);
});

socket.on("stderr", (data) => {
  appendStream(stderr, data);
});

socket.on("process_count", (count) => {
  processCount.textContent = count;
  killBtn.disabled = count === 0;
  runBtn.disabled = count > 0;
});
