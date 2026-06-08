const socket = io()
const codeArea = document.getElementById('code-editor')
const stdinArea = document.getElementById('stdin-editor')
const stdout = document.getElementById('stdout-editor')
const stderr = document.getElementById('stderr-editor')
const titleIdle = document.getElementById('title-idle')
const titleRunning = document.getElementById('title-running')
const runBtn = document.getElementById('run-btn')
const killBtn = document.getElementById('kill-btn')
const stderrStatus = document.getElementById('stderr-status')

function execute() {
  stdout.value = ''
  stderr.value = ''
  socket.emit('run_code', {
    code: codeArea.value,
    stdin: stdinArea.value,
  })
}

function kill() {
  socket.emit('kill')
}

socket.on('set_code', (code) => {
  codeArea.value = code
})

socket.on('set_stdin', (stdin) => {
  stdinArea.value = stdin
})

socket.on('stdout', (data) => {
  stdout.value = data
  stdout.scrollTop = stdout.scrollHeight
})

socket.on('stderr', (data) => {
  stderr.value = data
  stderr.scrollTop = stderr.scrollHeight
})

socket.on('set_stderr_status', (data) => {
  stderrStatus.textContent = data
})

socket.on('is_running', (isRunning) => {
  titleIdle.classList.toggle('hide', isRunning)
  titleRunning.classList.toggle('hide', !isRunning)
  killBtn.disabled = !isRunning
  runBtn.disabled = isRunning
})
