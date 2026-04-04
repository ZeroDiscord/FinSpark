import { getTenants } from '../api/tenants.api.js'

export async function fetchTenants() {
  return getTenants()
}
