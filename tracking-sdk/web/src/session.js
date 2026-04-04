const SESSION_KEY = '__finspark_session__'
const USER_KEY = '__finspark_user__'
const LAST_ACTIVITY_KEY = '__finspark_last_activity__'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreateUserId() {
  const existing = localStorage.getItem(USER_KEY)
  if (existing) return existing
  const created = createId('usr')
  localStorage.setItem(USER_KEY, created)
  return created
}

export function getOrCreateSessionId() {
  const now = Date.now()
  const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0)
  const existing = sessionStorage.getItem(SESSION_KEY)

  if (existing && now - lastActivity < SESSION_TIMEOUT_MS) {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now))
    return existing
  }

  const created = createId('sess')
  sessionStorage.setItem(SESSION_KEY, created)
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now))
  return created
}

export function touchSession() {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
}
