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

const MAX_OUTPUT_LENGTH = 3_000;

function appendStream(element, data) {
  // 1. 기존 값과 새 데이터를 합친 후, 즉시 뒤에서 3000글자만 남깁니다.
  // 이 시점에서 처리해야 할 문자열의 최대 길이는 3000으로 고정됩니다.
  let content = (element.value + data).slice(-MAX_OUTPUT_LENGTH);

  // 2. \r(Carriage Return) 처리 로직
  // 줄 단위로 나눈 뒤, 각 줄에서 마지막 \r 이후의 내용만 취합니다.
  const lines = content.split('\n');
  const processedLines = lines.map(line => {
    const lastCRIndex = line.lastIndexOf('\r');
    return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line;
  });

  // 3. 최종 문자열을 생성하고 DOM에 한 번만 반영합니다.
  element.value = processedLines.join('\n');

  // 4. 스크롤을 최하단으로 이동시킵니다.
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
