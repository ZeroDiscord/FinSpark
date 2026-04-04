const STORAGE_KEY = '__finspark_event_queue__'

export function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveQueue(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}

export function enqueue(event) {
  const queue = loadQueue()
  queue.push(event)
  saveQueue(queue)
}

export function dequeueBatch(limit = 20) {
  const queue = loadQueue()
  const batch = queue.slice(0, limit)
  saveQueue(queue.slice(limit))
  return batch
}

export function requeue(events) {
  const queue = loadQueue()
  saveQueue([...events, ...queue])
}
