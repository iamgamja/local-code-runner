const socket = io();
const stdout = document.getElementById("out-stdout");
const stderr = document.getElementById("out-stderr");
const codeArea = document.getElementById("in-code");
const stdinArea = document.getElementById("in-stdin");
const processCount = document.getElementById("process-count");
const runBtn = document.getElementById("run-btn");
const killBtn = document.getElementById("kill-btn");

function execute() {
  stdout.innerText = "";
  stderr.innerText = "";
  socket.emit("run_code", {
    code: codeArea.value,
    stdin: stdinArea.value,
  });
}

function kill() {
  socket.emit("kill");
}

function appendStream(element, data) {
  if (data.includes("\r")) {
    const lines = element.innerText.split("\n");
    lines[lines.length - 1] = data.replace("\r", "");
    element.innerText = lines.join("\n");
  } else {
    element.innerText += data;
  }
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
