import { useState } from 'react'

const KEY = 'bob_session_id'

function generateId() {
  return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function useSession() {
  const [sessionId] = useState(() => {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = generateId()
      localStorage.setItem(KEY, id)
    }
    return id
  })
  return sessionId
}
