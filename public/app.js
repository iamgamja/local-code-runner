const socket = io();
const terminal = document.getElementById("terminal");
const codeArea = document.getElementById("code");
const processCount = document.getElementById("process-count");
const runBtn = document.getElementById("run-btn");
const killBtn = document.getElementById("kill-btn");

function execute() {
  terminal.innerText = "[Process started]\n";
  socket.emit("run_code", codeArea.value);
}

function kill() {
  socket.emit("kill");
}

socket.on("output", (data) => {
  if (data.includes("\r")) {
    const lines = terminal.innerText.split("\n");
    lines[lines.length - 1] = data.replace("\r", "");
    terminal.innerText = lines.join("\n");
  } else {
    terminal.innerText += data;
  }
  terminal.scrollTop = terminal.scrollHeight;
});

socket.on("process_count", (count) => {
  processCount.textContent = count;
  killBtn.disabled = count === 0;
  runBtn.disabled = count > 0;
});
