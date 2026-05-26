class Logger {
  constructor(module = 'App') {
    this.module = module
  }

  log(message, data = null) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${this.module}] ${message}`, data || '')
  }

  error(message, error = null) {
    const timestamp = new Date().toISOString()
    console.error(`[${timestamp}] [${this.module}] ERROR: ${message}`, error || '')
  }

  warn(message, data = null) {
    const timestamp = new Date().toISOString()
    console.warn(`[${timestamp}] [${this.module}] WARN: ${message}`, data || '')
  }

  debug(message, data = null) {
    const timestamp = new Date().toISOString()
    if (process.env.DEBUG === 'true') {
      console.log(`[${timestamp}] [${this.module}] DEBUG: ${message}`, data || '')
    }
  }
}

module.exports = Logger
