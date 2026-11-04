import type { AppLog, AppLogLevel } from './types'

let nextLocalLogId = -1

export function createLocalAppLog(level: AppLogLevel, message: string, timestamp = new Date()): AppLog {
  return { id: nextLocalLogId--, timestamp: timestamp.toISOString(), level, message }
}