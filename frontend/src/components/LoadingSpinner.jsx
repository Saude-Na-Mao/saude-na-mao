export default function LoadingSpinner({ size = 'md', text }) {
  const sizes = {
    sm: 'h-6 w-6 border-2',
    md: 'h-10 w-10 border-[3px]',
    lg: 'h-14 w-14 border-4',
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className={`animate-spin rounded-full border-primary/20 border-t-primary ${sizes[size]}`} />
      {text && <p className="text-sm text-gray-500 animate-pulse">{text}</p>}
    </div>
  )
}
