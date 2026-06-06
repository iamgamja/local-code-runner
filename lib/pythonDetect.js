import { spawn } from "child_process";

async function _checkExecutable(cmd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, ["--version"]);
    let finished = false;
    p.on("close", (code) => {
      if (finished) return;
      finished = true;
      resolve(code === 0);
    });
    p.on("error", () => {
      if (finished) return;
      finished = true;
      resolve(false);
    });
  });
}

// 사용 가능한 파이썬 명령어 문자열을 반환합니다. 예: "pypy3" 또는 "python3"
export async function detectPythonExecutable() {
  const candidates = ["pypy3", "python3", "python"];
  for (const cmd of candidates) {
    try {
      const ok = await _checkExecutable(cmd);
      if (ok) {
        console.log(`${cmd} 감지됨. ${cmd}를 사용합니다.`);
        return cmd;
      }
    } catch (err) {
      // 무시하고 다음 후보 검사
    }
  }

  console.warn(
    "사용 가능한 Python 실행 파일을 찾지 못했습니다. 기본값 'python3' 사용을 시도합니다.",
  );
  return "python3";
}
