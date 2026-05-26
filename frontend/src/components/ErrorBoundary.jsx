import React from 'react'
import Logger from '../utils/logger'
import Alert from './Alert'

const logger = new Logger('ErrorBoundary')

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    logger.error('Component Error Caught', { error, errorInfo })
    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-red-800 mb-4">
              Oops! Algo deu errado
            </h1>
            <p className="text-red-700 mb-6">
              Desculpa, encontramos um erro inesperado.
            </p>
            
            {process.env.NODE_ENV === 'development' && (
              <details className="mb-6 text-left bg-red-100 p-4 rounded text-sm text-red-900">
                <summary className="font-bold cursor-pointer mb-2">
                  Detalhes do erro (development)
                </summary>
                <pre className="overflow-auto">{this.state.error?.toString()}</pre>
                <pre className="overflow-auto mt-2">
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <button
              onClick={this.handleReset}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export const withErrorBoundary = (Component) => {
  return (props) => (
    <ErrorBoundary>
      <Component {...props} />
    </ErrorBoundary>
  )
}
