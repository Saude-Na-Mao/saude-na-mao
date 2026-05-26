import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold text-primary/20 mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Página não encontrada</h1>
        <p className="text-gray-500 mb-8">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <Link
            to="/"
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-secondary transition"
          >
            <Home className="w-4 h-4" />
            Ir ao Início
          </Link>
        </div>
      </div>
    </div>
  )
}
