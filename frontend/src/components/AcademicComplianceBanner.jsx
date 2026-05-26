import { ShieldCheck } from 'lucide-react'
import { COMPLIANCE_DEMO_NOTICE, TCC_DEMO_MODE } from '../utils/compliance'

export default function AcademicComplianceBanner() {
  if (!TCC_DEMO_MODE) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-start gap-2 text-xs sm:text-sm">
        <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>{COMPLIANCE_DEMO_NOTICE}</span>
      </div>
    </div>
  )
}
