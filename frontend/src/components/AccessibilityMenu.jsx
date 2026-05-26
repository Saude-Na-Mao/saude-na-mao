import { useState, useRef, useEffect } from 'react'
import { useAccessibility } from './AccessibilityProvider'
import { Accessibility, Sun, Moon, Type } from 'lucide-react'

const FONT_OPTIONS = [
  { value: 'small', label: 'A-', desc: 'Menor' },
  { value: 'normal', label: 'A', desc: 'Normal' },
  { value: 'large', label: 'A+', desc: 'Grande' },
  { value: 'xlarge', label: 'A++', desc: 'Extra grande' },
]

export default function AccessibilityMenu() {
  const { highContrast, fontSize, toggleHighContrast, setFontSize } = useAccessibility()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Opções de acessibilidade"
        aria-expanded={open}
        aria-haspopup="true"
        className={`p-2 rounded-lg transition ${
          highContrast
            ? 'bg-yellow-400 text-black'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Accessibility className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu de acessibilidade"
          className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-50 space-y-4"
        >
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Accessibility className="w-4 h-4 text-primary" />
            Acessibilidade
          </h3>

          {/* High Contrast Toggle */}
          <div>
            <button
              role="menuitem"
              onClick={toggleHighContrast}
              className={`w-full flex items-center justify-between p-3 rounded-lg transition ${
                highContrast
                  ? 'bg-gray-900 text-yellow-400'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {highContrast ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                Alto Contraste
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                highContrast ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-600'
              }`}>
                {highContrast ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Font Size */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
              <Type className="w-3 h-3" /> Tamanho da Fonte
            </p>
            <div className="flex gap-1">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  role="menuitem"
                  onClick={() => setFontSize(opt.value)}
                  aria-label={`Fonte ${opt.desc}`}
                  className={`flex-1 py-2 rounded-lg text-center text-sm font-bold transition ${
                    fontSize === opt.value
                      ? 'bg-primary text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
            Lei 13.146/2015 — Lei Brasileira de Inclusão
          </p>
        </div>
      )}
    </div>
  )
}
