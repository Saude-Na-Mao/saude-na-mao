import { createContext, useContext, useState, useEffect } from 'react'

const AccessibilityContext = createContext({
  highContrast: false,
  fontSize: 'normal',
  toggleHighContrast: () => {},
  setFontSize: () => {},
})

export function useAccessibility() {
  return useContext(AccessibilityContext)
}

const FONT_SIZES = {
  small: '14px',
  normal: '16px',
  large: '18px',
  xlarge: '20px',
}

export default function AccessibilityProvider({ children }) {
  const [highContrast, setHighContrast] = useState(() => {
    try { return localStorage.getItem('a11y_contrast') === 'true' } catch { return false }
  })
  const [fontSize, setFontSizeState] = useState(() => {
    try { return localStorage.getItem('a11y_fontsize') || 'normal' } catch { return 'normal' }
  })

  useEffect(() => {
    const root = document.documentElement
    if (highContrast) {
      root.classList.add('high-contrast')
    } else {
      root.classList.remove('high-contrast')
    }
    localStorage.setItem('a11y_contrast', highContrast)
  }, [highContrast])

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SIZES[fontSize] || '16px'
    localStorage.setItem('a11y_fontsize', fontSize)
  }, [fontSize])

  const toggleHighContrast = () => setHighContrast((prev) => !prev)
  const setFontSize = (size) => setFontSizeState(size)

  return (
    <AccessibilityContext.Provider value={{ highContrast, fontSize, toggleHighContrast, setFontSize }}>
      {children}
    </AccessibilityContext.Provider>
  )
}
