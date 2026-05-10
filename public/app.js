const socket = io();
const terminal = document.getElementById("terminal");
const codeArea = document.getElementById("code");

function execute() {
  terminal.innerText = "[Process started]\n";
  socket.emit("run_code", codeArea.value);
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
