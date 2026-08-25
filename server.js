import { existsSync, mkdirSync, writeFileSync, openSync, closeSync, readFileSync, copyFileSync } from 'fs'
import { spawn } from 'child_process'
import path from 'path'
import http from 'http'
import readline from 'readline'
import express from 'express'
import * as socket from 'socket.io'

import { cleanupOldBackups } from './lib/cleanupOldBackups.js'

const BACKUP_DIR = path.resolve('backups')
if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR)

const RUNNING_CONTAINER_DIR = path.resolve('running_container')
if (!existsSync(RUNNING_CONTAINER_DIR)) mkdirSync(RUNNING_CONTAINER_DIR)

const CODE_PATH = path.resolve(RUNNING_CONTAINER_DIR, 'code')
const PROGRAM_PATH = path.resolve(RUNNING_CONTAINER_DIR, 'program')
const STDIN_PATH = path.resolve(RUNNING_CONTAINER_DIR, 'stdin')

const app = express()
const server = http.createServer(app)
const io = new socket.Server(server)

app.use(express.static('public'))
app.use(express.json())

const MAX_BUFFER_LENGTH = 10_000

let running_process = null
let stdoutHistory = ''
let stderrHistory = ''

function updateProcessCount() {
  io.emit('is_running', !!running_process)
}

function run_code({ lang, code, stdin }) {
  if (running_process) return

  // 1. 로컬 백업
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(path.resolve(BACKUP_DIR, `backup_${timestamp}`), code)

  // 2. 현재 실행할 코드 저장
  writeFileSync(CODE_PATH, code)

  // 3. stdin 저장
  writeFileSync(STDIN_PATH, stdin)

  let compileProcess

  if (lang === 'cpp20') {
    // C++: CODE_PATH를 컴파일해서 PROGRAM_PATH 생성
    compileProcess = spawn('g++', ['-O3', '-Wall', '-std=c++20', '-x', 'c++', CODE_PATH, '-o', PROGRAM_PATH], {
      timeout: 1 * 60 * 60 * 1000,
    })
  } else if (lang === 'pypy3') {
    // PyPy: CODE_PATH의 코드를 PROGRAM_PATH로 복사
    copyFileSync(CODE_PATH, PROGRAM_PATH)

    compileProcess = spawn(process.execPath, ['-e', 'process.exit(0)'], {
      timeout: 1 * 60 * 60 * 1000,
    })
  } else {
    throw new Error(`Unsupported language: ${lang}`)
  }

  io.emit('set_stderr_status', 'compile')
  running_process = compileProcess
  updateProcessCount()

  stdoutHistory = ''
  stderrHistory = ''

  compileProcess.stdout.on('data', (data) => {
    stdoutHistory += data.toString()
    stdoutHistory = stdoutHistory.slice(-MAX_BUFFER_LENGTH)
    stdoutHistory = stdoutHistory
      .split('\n')
      .map((line) => {
        const lastCRIndex = line.lastIndexOf('\r')
        return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line
      })
      .join('\n')
  })

  compileProcess.stderr.on('data', (data) => {
    stderrHistory += data.toString()
    stderrHistory = stderrHistory.slice(-MAX_BUFFER_LENGTH)
    stderrHistory = stderrHistory
      .split('\n')
      .map((line) => {
        const lastCRIndex = line.lastIndexOf('\r')
        return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line
      })
      .join('\n')
  })

  const sendInterval = setInterval(() => {
    if (stdoutHistory) {
      io.emit('stdout', stdoutHistory)
    }

    if (stderrHistory) {
      io.emit('stderr', stderrHistory)
    }
  }, 100)

  compileProcess.on('close', (code) => {
    // 컴파일 실패
    if (code !== 0) {
      clearInterval(sendInterval)

      if (stdoutHistory) {
        io.emit('stdout', stdoutHistory)
        stdoutHistory = ''
      }

      if (stderrHistory) {
        io.emit('stderr', stderrHistory)
        stderrHistory = ''
      }

      if (code !== null) {
        io.emit('set_stderr_status', `code: ${code}`)
      }

      running_process = null
      updateProcessCount()
      return
    }

    // --------------------------------------------------
    // compileProcess 성공 후 programProcess 실행
    // --------------------------------------------------

    const programStdinFd = openSync(STDIN_PATH, 'r')

    let programProcess

    if (lang === 'cpp20') {
      programProcess = spawn(PROGRAM_PATH, [], {
        stdio: [programStdinFd, 'pipe', 'pipe'],
        timeout: 1 * 60 * 60 * 1000,
      })
    } else if (lang === 'pypy3') {
      programProcess = spawn('pypy3', ['-u', PROGRAM_PATH], {
        stdio: [programStdinFd, 'pipe', 'pipe'],
        timeout: 1 * 60 * 60 * 1000,
      })
    }

    closeSync(programStdinFd)

    io.emit('set_stderr_status', 'running')
    running_process = programProcess
    updateProcessCount()

    programProcess.stdout.on('data', (data) => {
      stdoutHistory += data.toString()
      stdoutHistory = stdoutHistory.slice(-MAX_BUFFER_LENGTH)
      stdoutHistory = stdoutHistory
        .split('\n')
        .map((line) => {
          const lastCRIndex = line.lastIndexOf('\r')
          return lastCRIndex !== -1 ? line.substring(lastCRIndex + 1) : line
        })
        .join('\n')
    })

    programProcess.stderr.on('data', (data) => {
      stderrHistory += data.toString()
      stderrHistory = stderrHistory.slice(-MAX_BUFFER_LENGTH)
      stderrHistory = stderrHistory
        .split('\n')
        .map((line) => {
          const lastCRIndex = line.lastIndexOf('\r')
          return line.substring(lastCRIndex + 1)
        })
        .join('\n')
    })

    programProcess.on('close', (programCode) => {
      clearInterval(sendInterval)

      if (stdoutHistory) {
        io.emit('stdout', stdoutHistory)
        stdoutHistory = ''
      }

      if (stderrHistory) {
        io.emit('stderr', stderrHistory)
        stderrHistory = ''
      }

      if (programCode !== null) {
        io.emit('set_stderr_status', `code: ${programCode}`)
      }

      running_process = null
      updateProcessCount()
    })
  })
}

io.on('connection', (socket) => {
  console.log('Client connected')

  socket.emit('is_running', !!running_process)

  if (existsSync(CODE_PATH)) {
    socket.emit('set_code', readFileSync(CODE_PATH, 'utf-8'))
  }

  if (existsSync(STDIN_PATH)) {
    socket.emit('set_stdin', readFileSync(STDIN_PATH, 'utf-8'))
  }

  socket.emit('set_stderr_status', running_process ? 'running' : '')

  socket.on('run_code', ({ lang, code, stdin }) => {
    if (running_process) return

    run_code({ lang, code, stdin })
  })

  socket.on('kill', () => {
    if (running_process && !running_process.killed) {
      running_process.kill()
      io.emit('set_stderr_status', 'terminated')
    }
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected')
  })
})

const PORT = 3000

;(async () => {
  cleanupOldBackups(BACKUP_DIR)

  server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`)
  })
})()

readline
  .createInterface({
    input: process.stdin,
  })
  .on('line', (input) => {
    if (input.trim() === 'q') {
      process.exit(0)
    }
  })
  .on('close', () => {
    process.exit(0)
  })
