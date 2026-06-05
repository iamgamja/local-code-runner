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

const MAX_OUTPUT_LENGTH = 10_000;

function appendStream(element, data) {
  let content = (element.value + data).slice(-MAX_OUTPUT_LENGTH);

  const lines = content.split('\n');
  const processedLines = lines.map(line => {
    const lastCRIndex = line.lastIndexOf('\r');
    return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line;
  });

  element.value = processedLines.join('\n');
  element.scrollTop = element.scrollHeight;
}

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
