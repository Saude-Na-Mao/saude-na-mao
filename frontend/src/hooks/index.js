import { useState, useCallback, useRef, useEffect } from 'react'
import Logger from '../utils/logger'
import { API_CONFIG, ERROR_TYPES, ERROR_MESSAGES } from '../constants'

const logger = new Logger('useApi')

export const useApi = (url, options = {}) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const cacheRef = useRef({})
  const retryCountRef = useRef(0)

  const fetchData = useCallback(async (customUrl = url, customOptions = {}) => {
    if (customOptions.useCache && cacheRef.current[customUrl]) {
      const cached = cacheRef.current[customUrl]
      if (Date.now() - cached.timestamp < API_CONFIG.CACHE_DURATION) {
        setData(cached.data)
        return cached.data
      }
    }

    setLoading(true)
    setError(null)
    const startTime = Date.now()

    try {
      const fetchOptions = {
        timeout: API_CONFIG.TIMEOUT,
        ...options,
        ...customOptions,
      }

      const response = await fetch(customUrl, fetchOptions)
      const duration = Date.now() - startTime

      logger.logApiCall('GET', customUrl, response.status, duration)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      if (customOptions.useCache) {
        cacheRef.current[customUrl] = {
          data: result,
          timestamp: Date.now(),
        }
      }

      setData(result)
      retryCountRef.current = 0
      return result
    } catch (err) {
      const errorType = getErrorType(err)
      const errorMessage = ERROR_MESSAGES[errorType] || err.message

      const formattedError = {
        type: errorType,
        message: errorMessage,
        originalError: err,
      }

      logger.error(`API Error on ${customUrl}`, formattedError)

      if (retryCountRef.current < API_CONFIG.RETRY_ATTEMPTS && shouldRetry(err)) {
        retryCountRef.current++
        logger.info(`Retry attempt ${retryCountRef.current} for ${customUrl}`)
        
        await new Promise(resolve => 
          setTimeout(resolve, API_CONFIG.RETRY_DELAY * retryCountRef.current)
        )
        return fetchData(customUrl, customOptions)
      }

      setError(formattedError)
      throw formattedError
    } finally {
      setLoading(false)
    }
  }, [url, options])

  const clearCache = useCallback(() => {
    cacheRef.current = {}
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    data,
    loading,
    error,
    fetchData,
    clearCache,
    clearError,
  }
}

export const useForm = (initialValues, onSubmit, validate) => {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target
    const newValue = type === 'checkbox' ? checked : value

    setValues(prev => ({ ...prev, [name]: newValue }))

    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }, [errors])

  const handleBlur = useCallback((e) => {
    const { name } = e.target
    setTouched(prev => ({ ...prev, [name]: true }))

    if (validate) {
      const fieldError = validate(name, values[name])
      if (fieldError) {
        setErrors(prev => ({ ...prev, [name]: fieldError }))
      }
    }
  }, [validate, values])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    setIsSubmitting(true)

    if (validate) {
      const newErrors = {}
      Object.keys(values).forEach(field => {
        const error = validate(field, values[field])
        if (error) newErrors[field] = error
      })

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors)
        setIsSubmitting(false)
        return
      }
    }

    onSubmit(values).finally(() => {
      setIsSubmitting(false)
    })
  }, [values, onSubmit, validate])

  const resetForm = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
  }, [initialValues])

  const setFieldValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }))
  }, [])

  const setFieldError = useCallback((name, error) => {
    setErrors(prev => ({ ...prev, [name]: error }))
  }, [])

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    resetForm,
    setFieldValue,
    setFieldError,
  }
}

export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

export const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      logger.error(`Error reading from localStorage key: ${key}`, error)
      return initialValue
    }
  })

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      logger.error(`Error writing to localStorage key: ${key}`, error)
    }
  }, [key, storedValue])

  return [storedValue, setValue]
}

export const useOnline = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

const getErrorType = (error) => {
  if (!navigator.onLine) return ERROR_TYPES.NETWORK
  if (error.message.includes('timeout')) return ERROR_TYPES.TIMEOUT
  if (error.message.includes('401')) return ERROR_TYPES.AUTHENTICATION
  if (error.message.includes('403')) return ERROR_TYPES.AUTHORIZATION
  if (error.message.includes('404')) return ERROR_TYPES.NOT_FOUND
  if (error.message.includes('5')) return ERROR_TYPES.SERVER
  return ERROR_TYPES.UNKNOWN
}

const shouldRetry = (error) => {
  const retryableErrors = [ERROR_TYPES.NETWORK, ERROR_TYPES.TIMEOUT, ERROR_TYPES.SERVER]
  return retryableErrors.some(code => error.message.includes(code))
}
