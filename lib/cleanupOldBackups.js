import { readdirSync, statSync, unlinkSync } from 'fs'
import path from 'path'
import ora from 'ora'

const maxAgeMs = 7 * 24 * 60 * 60 * 1000 // 7일

export function cleanupOldBackups(backupDir) {
  const spinner = ora('Cleaning up old backups...').start()
  const now = Date.now()
  let removedCount = 0

  try {
    const entries = readdirSync(backupDir)
    for (const entry of entries) {
      const filePath = path.join(backupDir, entry)
      const stats = statSync(filePath)
      if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
        unlinkSync(filePath)
        removedCount += 1
      }
    }

    spinner.succeed(`Removed ${removedCount} backup(s) older than 7 days.`)
  } catch (err) {
    spinner.fail('Failed to clean up old backups.')
    throw err
  }
}
