import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  timeout: 300_000,
})

// Attach JWT on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('fs_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401 TOKEN_EXPIRED
let refreshing = null
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (
      err.response?.status === 401 &&
      err.response?.data?.code === 'TOKEN_EXPIRED' &&
      !original._retry
    ) {
      original._retry = true
      if (!refreshing) {
        const refreshToken = localStorage.getItem('fs_refresh')
        refreshing = axios
          .post('/api/auth/refresh', { refresh_token: refreshToken })
          .then((r) => {
            localStorage.setItem('fs_token', r.data.token)
            return r.data.token
          })
          .catch(() => {
            localStorage.clear()
            window.location.href = '/login'
          })
          .finally(() => { refreshing = null })
      }
      const newToken = await refreshing
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return client(original)
      }
    }
    return Promise.reject(err)
  }
)

export default client
