import { login, register } from '../api/auth.api.js'

export async function signIn(payload) {
  return login(payload)
}

export async function signUp(payload) {
  return register(payload)
}
