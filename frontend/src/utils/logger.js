class Logger {
  constructor(name = 'App') {
    this.name = name
    this.isDev = import.meta.env.DEV
  }

  _format(level, message, data = null) {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${this.name}] [${level}]`
    return { prefix, message, data }
  }

  debug(message, data = null) {
    if (this.isDev) {
      const { prefix, message: msg, data: d } = this._format('DEBUG', message, data)
      console.debug(`${prefix} ${msg}`, d || '')
    }
  }

  info(message, data = null) {
    const { prefix, message: msg, data: d } = this._format('INFO', message, data)
    console.info(`${prefix} ${msg}`, d || '')
  }

  warn(message, data = null) {
    const { prefix, message: msg, data: d } = this._format('WARN', message, data)
    console.warn(`${prefix} ${msg}`, d || '')
  }

  error(message, error = null) {
    const { prefix, message: msg } = this._format('ERROR', message, error)
    console.error(`${prefix} ${msg}`, error || '')
  }

  logApiCall(method, endpoint, status, duration) {
    const log = {
      method,
      endpoint,
      status,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    }
    console.log(`[API] ${method} ${endpoint} - ${status}`, log)
  }
}

export default Logger
