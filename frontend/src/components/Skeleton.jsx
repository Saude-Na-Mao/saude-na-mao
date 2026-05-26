export function Skeleton({ className = '', variant = 'rect' }) {
  const baseClasses = 'animate-pulse bg-gray-200 rounded'
  const variants = {
    rect: '',
    circle: '!rounded-full',
    text: 'h-4 rounded-md',
  }

  return <div className={`${baseClasses} ${variants[variant] || ''} ${className}`} />
}

export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton variant="text" className="w-3/4 h-5" />
        <Skeleton variant="text" className="w-1/2 h-3" />
        <Skeleton variant="text" className="w-1/3 h-7" />
        <Skeleton className="w-full h-10 rounded-lg" />
      </div>
    </div>
  )
}

export function PharmacyCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <Skeleton className="h-24 w-full rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton variant="text" className="w-2/3 h-5" />
        <Skeleton variant="text" className="w-1/3 h-4" />
        <Skeleton variant="text" className="w-full h-3" />
      </div>
    </div>
  )
}

export function TableRowSkeleton({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton variant="text" className="w-full h-4" />
        </td>
      ))}
    </tr>
  )
}
