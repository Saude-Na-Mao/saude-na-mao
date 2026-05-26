import { useState } from 'react'

export default function AddressNumberInput({ value, onChange, required = false, className = '' }) {
  const [semNumero, setSemNumero] = useState(value === 'S/N')

  const handleToggle = (checked) => {
    setSemNumero(checked)
    onChange(checked ? 'S/N' : '')
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-500">Número {required && '*'}</label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={semNumero}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-3.5 h-3.5 accent-primary rounded"
          />
          <span className="text-xs text-gray-500">Sem número</span>
        </label>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={semNumero}
        required={required && !semNumero}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        placeholder={semNumero ? 'S/N' : 'Ex: 123'}
      />
    </div>
  )
}
